import type { OfficialAgentSessionLike } from "../../runtime/web/lazy-agent-session.js";
import type { MutationEnvelopeV1 as RuntimeMutationEnvelopeV1 } from "../../runtime/web/contracts.js";
import type { BffEventStream, GatewayResponse, PrivateWebBff, WebMutationRequestIdentity } from "../../runtime/web/bff-gateway.js";
import type { MutationExecution } from "../../runtime/web/runtime-host.js";

export const AILI_WEB_BFF_MAX_BODY_BYTES = 256 * 1024;
export const AILI_WEB_MEDIA_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

export interface AiliBffHttpRequest {
  readonly method: "GET" | "POST";
  readonly segments: readonly string[];
  readonly host?: string;
  readonly origin?: string;
  readonly cookie?: string;
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly cursor?: string;
  readonly body?: unknown;
}

export interface AiliWebBffBridge {
  dispatch(request: AiliBffHttpRequest): Promise<GatewayResponse<unknown>> | GatewayResponse<unknown>;
  openEventStream?(request: AiliBffHttpRequest): Promise<GatewayResponse<BffEventStream | { readonly error: string }>> | GatewayResponse<BffEventStream | { readonly error: string }>;
}

export interface PrivateWebBffBridgeOptions<T extends OfficialAgentSessionLike> {
  /** Authenticated, redacted read provider owned by the Runtime composition root. */
  readonly catalog: (identity: Pick<AiliBffHttpRequest, "host" | "origin" | "cookie">) => Promise<GatewayResponse<unknown>> | GatewayResponse<unknown>;
  /** Authenticated bounded per-session history; the catalog itself stays metadata-only. */
  readonly history?: (identity: Pick<AiliBffHttpRequest, "host" | "origin" | "cookie">, sessionHandle: string) => Promise<GatewayResponse<unknown>> | GatewayResponse<unknown>;
  /** Authenticated read-only export provider; it must not disclose a session path. */
  readonly exportSession?: (identity: Pick<AiliBffHttpRequest, "host" | "origin" | "cookie">, sessionHandle: string) => Promise<GatewayResponse<unknown>> | GatewayResponse<unknown>;
  /** Authenticated bounded media provider addressed only by an opaque handle. */
  readonly media?: (identity: Pick<AiliBffHttpRequest, "host" | "origin" | "cookie">, mediaHandle: string) => Promise<GatewayResponse<unknown>> | GatewayResponse<unknown>;
  /** The sole mutation dispatcher; it receives an admitted official Pi adapter. */
  readonly execute: MutationExecution<T>;
}

/**
 * Server-only adapter over PrivateWebBff. Route code cannot access Pi,
 * persistent-Agent journals, MCP adapters, Git, or the filesystem directly.
 */
export class PrivateWebBffBridge<T extends OfficialAgentSessionLike> implements AiliWebBffBridge {
  public constructor(
    private readonly bff: PrivateWebBff<T>,
    private readonly options: PrivateWebBffBridgeOptions<T>,
  ) {}

  public async dispatch(request: AiliBffHttpRequest): Promise<GatewayResponse<unknown>> {
    const [first, second, third] = request.segments;
    const identity = { host: request.host, origin: request.origin, cookie: request.cookie };
    if (request.method === "POST" && first === "auth" && second === "bootstrap" && request.segments.length === 2) {
      if (!boundedJsonRequest(request)) return denied(415, "json-request-required");
      return this.bff.exchangeLoopbackBootstrap(identity);
    }
    if (request.method === "POST" && first === "auth" && second === "login" && request.segments.length === 2) {
      if (!boundedJsonRequest(request)) return denied(415, "json-request-required");
      const phrase = record(request.body) && typeof request.body.accessPhrase === "string" ? request.body.accessPhrase : undefined;
      if (!phrase || phrase.length > 1_024) return denied(400, "access-phrase-required");
      return this.bff.login({ ...identity, contentType: request.contentType, contentLength: request.contentLength }, phrase);
    }
    if (request.method === "GET" && first === "auth" && second === "session" && request.segments.length === 2) {
      return this.bff.session(identity);
    }
    if (request.method === "POST" && first === "auth" && second === "logout" && request.segments.length === 2) {
      if (!boundedJsonRequest(request)) return denied(415, "json-request-required");
      return this.bff.logout({ ...identity, contentType: request.contentType, contentLength: request.contentLength });
    }
    if (request.method === "GET" && first === "workbench" && second === "catalog" && request.segments.length === 2) {
      return this.options.catalog(identity);
    }
    if (request.method === "GET" && first === "sessions" && validHandle(second) && third === "history" && request.segments.length === 3 && this.options.history) {
      return this.options.history(identity, second);
    }
    if (request.method === "GET" && first === "sessions" && validHandle(second) && third === "connect" && request.segments.length === 3) {
      return this.bff.connect(identity, second, request.cursor);
    }
    if (request.method === "GET" && first === "sessions" && validHandle(second) && third === "events" && request.segments.length === 3) {
      return this.bff.events(identity, second, request.cursor);
    }
    if (request.method === "GET" && first === "sessions" && validHandle(second) && third === "export" && request.segments.length === 3 && this.options.exportSession) {
      return this.options.exportSession(identity, second);
    }
    if (request.method === "GET" && first === "media" && validHandle(second) && request.segments.length === 2 && this.options.media) {
      const result = await this.options.media(identity, second);
      const bytesValid = result.body instanceof Uint8Array && result.body.byteLength <= AILI_WEB_MEDIA_PREVIEW_MAX_BYTES;
      const sanitizedDocumentValid = typeof result.body === "string" && Buffer.byteLength(result.body, "utf8") <= 1024 * 1024
        && /^text\/html(?:;|$)/i.test(result.headers["Content-Type"] ?? result.headers["content-type"] ?? "");
      if (!bytesValid && !sanitizedDocumentValid) return denied(413, "media-preview-invalid-or-oversized");
      return result;
    }
    if (request.method === "POST" && first === "mutations" && request.segments.length === 1) {
      if (request.contentLength === undefined || !Number.isSafeInteger(request.contentLength) || request.contentLength < 0 || request.contentLength > AILI_WEB_BFF_MAX_BODY_BYTES) {
        return denied(413, "request-too-large-or-unbounded");
      }
      return this.bff.mutate({
        ...identity,
        contentType: request.contentType,
        contentLength: request.contentLength,
      } satisfies WebMutationRequestIdentity, request.body as RuntimeMutationEnvelopeV1, this.options.execute) as Promise<GatewayResponse<unknown>>;
    }
    return denied(404, "runtime-route-not-found");
  }

  public openEventStream(request: AiliBffHttpRequest): GatewayResponse<BffEventStream | { readonly error: string }> {
    const [first, second, third] = request.segments;
    if (request.method !== "GET" || first !== "sessions" || !validHandle(second) || third !== "stream" || request.segments.length !== 3) {
      return denied(404, "runtime-stream-not-found");
    }
    return this.bff.stream({ host: request.host, origin: request.origin, cookie: request.cookie }, second, request.cursor);
  }
}

const BRIDGE_SYMBOL = Symbol.for("@rosetears/aili-pi/private-web-bff-bridge/v1");
type BridgeGlobal = typeof globalThis & { [key: symbol]: AiliWebBffBridge | undefined };

/** Installed only by the foreground Runtime owner; ordinary Pi load stays inert. */
export function installAiliWebBffBridge(bridge: AiliWebBffBridge): () => void {
  const target = globalThis as unknown as BridgeGlobal;
  if (target[BRIDGE_SYMBOL] && target[BRIDGE_SYMBOL] !== bridge) throw new Error("AILI Web BFF bridge is already installed");
  target[BRIDGE_SYMBOL] = bridge;
  return () => { if (target[BRIDGE_SYMBOL] === bridge) target[BRIDGE_SYMBOL] = undefined; };
}

export function requireAiliWebBffBridge(): AiliWebBffBridge {
  const bridge = (globalThis as unknown as BridgeGlobal)[BRIDGE_SYMBOL];
  if (!bridge) throw new Error("AILI Runtime BFF is unavailable");
  return bridge;
}

function boundedJsonRequest(request: AiliBffHttpRequest): boolean {
  return request.contentLength !== undefined && Number.isSafeInteger(request.contentLength)
    && request.contentLength >= 0 && request.contentLength <= AILI_WEB_BFF_MAX_BODY_BYTES
    && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.contentType?.trim() ?? "");
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function denied(status: number, error: string): GatewayResponse<{ readonly error: string }> {
  return { status, body: { error }, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } };
}
function validHandle(value: string | undefined): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
