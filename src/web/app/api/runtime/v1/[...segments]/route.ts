import { AILI_WEB_BFF_MAX_BODY_BYTES, requireAiliWebBffBridge, type AiliBffHttpRequest } from "@/server/private-bff-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ segments: string[] }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return dispatch(request, context, "GET");
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return dispatch(request, context, "POST");
}

async function dispatch(request: Request, context: RouteContext, method: "GET" | "POST"): Promise<Response> {
  try {
    const { segments } = await context.params;
    const url = new URL(request.url);
    let body: unknown;
    let contentLength: number | undefined;
    if (method === "POST") {
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type")?.trim() ?? "")) {
        return jsonResponse(415, { error: "json-content-type-required" });
      }
      const bytes = await readBoundedBody(request, AILI_WEB_BFF_MAX_BODY_BYTES);
      contentLength = bytes.byteLength;
      try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { return jsonResponse(400, { error: "invalid-json-body" }); }
    }
    const input: AiliBffHttpRequest = {
      method,
      segments,
      host: request.headers.get("host") ?? undefined,
      origin: request.headers.get("origin") ?? undefined,
      cookie: request.headers.get("cookie") ?? undefined,
      contentType: request.headers.get("content-type") ?? undefined,
      contentLength,
      cursor: url.searchParams.get("cursor") ?? request.headers.get("last-event-id") ?? undefined,
      body,
    };
    const bridge = requireAiliWebBffBridge();
    if (method === "GET" && segments.length === 3 && segments[0] === "sessions" && segments[2] === "stream") {
      if (!bridge.openEventStream) return jsonResponse(503, { error: "runtime-stream-unavailable" });
      const stream = await bridge.openEventStream(input);
      if (stream.status !== 200 || !isEventStream(stream.body)) return gatewayResponse(stream);
      return sseResponse(stream.body, request.signal);
    }
    const result = await bridge.dispatch(input);
    return gatewayResponse(result);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "request-body-too-large";
    return jsonResponse(tooLarge ? 413 : 503, { error: tooLarge ? "request-too-large" : "runtime-bff-unavailable" });
  }
}

async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw new Error("request-body-too-large");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximum) { await reader.cancel(); throw new Error("request-body-too-large"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

interface EventStreamBody {
  readonly snapshotFirst: {
    readonly snapshot: unknown;
    readonly replay: { readonly kind: "events" | "reset"; readonly events?: readonly unknown[]; readonly reason?: string; readonly latestCursor: string; readonly snapshotRequired?: true };
  };
  readonly subscription: { drain(): EventStreamBody["snapshotFirst"]["replay"]; wait(): Promise<void>; close(): void };
}

function isEventStream(value: unknown): value is EventStreamBody {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EventStreamBody>;
  return !!candidate.snapshotFirst && !!candidate.subscription
    && typeof candidate.subscription.drain === "function" && typeof candidate.subscription.wait === "function" && typeof candidate.subscription.close === "function";
}

function sseResponse(body: EventStreamBody, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        body.subscription.close();
        try { controller.close(); } catch { /* already closed by the HTTP runtime */ }
      };
      signal.addEventListener("abort", close, { once: true });
      const enqueue = (value: Uint8Array) => {
        if (closed) return;
        if (controller.desiredSize !== null && controller.desiredSize <= 0) throw new Error("sse-client-backpressure");
        controller.enqueue(value);
      };
      const send = (event: string, value: unknown, id?: string) => {
        enqueue(encoder.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      const sendReplay = (replay: EventStreamBody["snapshotFirst"]["replay"]) => {
        if (replay.kind === "reset") { send("reset", replay); return; }
        if ((replay.events?.length ?? 0) > 32) {
          send("reset", { kind: "reset", reason: "backpressure", latestCursor: replay.latestCursor, snapshotRequired: true });
          return;
        }
        for (const event of replay.events ?? []) {
          const cursor = event && typeof event === "object" && typeof (event as { cursor?: unknown }).cursor === "string"
            ? (event as { cursor: string }).cursor : undefined;
          send("runtime", event, cursor);
        }
      };
      send("snapshot", body.snapshotFirst.snapshot);
      sendReplay(body.snapshotFirst.replay);
      void (async () => {
        try {
          while (!closed) {
            const activity = await waitForStreamActivity(body.subscription.wait(), 15_000);
            if (closed) break;
            if (!activity) { enqueue(encoder.encode(": heartbeat\n\n")); continue; }
            const replay = body.subscription.drain();
            sendReplay(replay);
            if (replay.kind === "reset" && replay.reason === "closed") break;
          }
        } catch { /* transport cancellation and backpressure both terminate this bounded stream */ }
        close();
      })();
    },
    cancel() { closed = true; body.subscription.close(); },
  }, { highWaterMark: 64, size: () => 1 });
  return new Response(stream, { status: 200, headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  } });
}

async function waitForStreamActivity(activity: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([activity.then(() => true), new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

function gatewayResponse(result: { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: unknown }): Response {
  const headers = new Headers(result.headers);
  if (result.body instanceof Uint8Array) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");
    return new Response(Uint8Array.from(result.body).buffer, { status: result.status, headers });
  }
  if (typeof result.body === "string" && headers.has("Content-Type") && !headers.get("Content-Type")!.includes("json")) {
    return new Response(result.body, { status: result.status, headers });
  }
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
