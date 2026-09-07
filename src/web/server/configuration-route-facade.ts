import { randomUUID } from "node:crypto";
import { createMutationEnvelope, validateRuntimeSnapshot, type JsonValue } from "../contracts.js";
import { AILI_WEB_BFF_MAX_BODY_BYTES, requireAiliWebBffBridge } from "./private-bff-bridge.js";

export type ConfigurationCapability =
  | "models.configure"
  | "plugins.configure"
  | "skills.configure"
  | "mcp.configure"
  | "keybinds.configure"
  | "project_trust.configure";
export type ConfigurationCommandType = string | ((body: Record<string, JsonValue>) => string);

/** Retained route adapter. It translates only; all mutation ownership stays in the Runtime Gateway. */
export async function translateConfigurationRoute(
  request: Request,
  capability: ConfigurationCapability,
  commandType: ConfigurationCommandType,
  mapArguments: (body: Record<string, JsonValue>) => Readonly<Record<string, JsonValue>> = (body) => body,
  mapExecutionFailureStatus?: (reason: string) => number,
): Promise<Response> {
  try {
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type")?.trim() ?? "")) return response(415, { error: "json-content-type-required" });
    const bytes = await boundedBody(request);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { return response(400, { error: "invalid-json-body" }); }
    if (!record(value)) return response(400, { error: "invalid-json-body" });
    const bridge = requireAiliWebBffBridge();
    const identity = {
      host: request.headers.get("host") ?? undefined,
      origin: request.headers.get("origin") ?? undefined,
      cookie: request.headers.get("cookie") ?? undefined,
    };
    const auth = await bridge.dispatch({ method: "GET", segments: ["auth", "session"], ...identity });
    if (auth.status !== 200 || !record(auth.body) || typeof auth.body.clientId !== "string") return gateway(auth);
    const configuration = await bridge.dispatch({ method: "GET", segments: ["configuration"], ...identity });
    if (configuration.status !== 200) return gateway(configuration);
    const snapshot = validateRuntimeSnapshot(configuration.body);
    const suppliedRequestId = request.headers.get("x-request-id");
    const requestId = suppliedRequestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(suppliedRequestId)
      ? suppliedRequestId : `facade-${randomUUID()}`;
    const resolvedCommandType = typeof commandType === "function" ? commandType(value as Record<string, JsonValue>) : commandType;
    const envelope = createMutationEnvelope({
      requestId,
      clientId: auth.body.clientId,
      snapshot,
      sessionLeaf: "configuration",
      capability,
      commandType: resolvedCommandType,
      arguments: mapArguments(value as Record<string, JsonValue>),
      requestedAt: new Date().toISOString(),
    });
    const mutation = await bridge.dispatch({
      method: "POST", segments: ["mutations"], ...identity,
      contentType: "application/json", contentLength: Buffer.byteLength(JSON.stringify(envelope)), body: envelope,
    });
    if (mutation.status !== 200) {
      if (record(mutation.body) && mutation.body.disposition === "failed" && typeof mutation.body.reason === "string") {
        const reason = mutation.body.reason.slice(0, 240);
        return response(mapExecutionFailureStatus?.(reason) ?? mutation.status, { error: reason });
      }
      return gateway(mutation);
    }
    const result = record(mutation.body) ? mutation.body.result : undefined;
    return response(200, result === undefined ? { success: true } : result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return response(message === "request-body-too-large" ? 413 : 400, { error: message.slice(0, 240) });
  }
}

async function boundedBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > AILI_WEB_BFF_MAX_BODY_BYTES)) throw new Error("request-body-too-large");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > AILI_WEB_BFF_MAX_BODY_BYTES) { await reader.cancel(); throw new Error("request-body-too-large"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}
function gateway(result: { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: unknown }): Response {
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { ...result.headers, "Content-Type": "application/json; charset=utf-8" } });
}
function response(status: number, body: unknown): Response { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
