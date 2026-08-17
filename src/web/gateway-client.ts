import {
  createMutationEnvelope,
  validateRuntimeEvent,
  validateRuntimeSnapshot,
  validateWorkbenchCatalog,
  validateWorkbenchHistory,
  type JsonValue,
  type MutationEnvelopeV1,
  type RuntimeEventV1,
  type RuntimeSnapshotV1,
  type WorkbenchCatalogV1,
  type WorkbenchHistoryV1,
} from "./contracts.js";
import { ACTION_CONTRACTS, type WorkbenchAction } from "./workbench-model.js";

export const AILI_BFF_BASE = "/api/runtime/v1" as const;
export const AILI_BFF_ENDPOINTS = Object.freeze({
  catalog: `${AILI_BFF_BASE}/workbench/catalog`,
  connect: (sessionHandle: string) => `${AILI_BFF_BASE}/sessions/${encodeURIComponent(sessionHandle)}/connect`,
  history: (sessionHandle: string) => `${AILI_BFF_BASE}/sessions/${encodeURIComponent(sessionHandle)}/history`,
  events: (sessionHandle: string, cursor: string) => `${AILI_BFF_BASE}/sessions/${encodeURIComponent(sessionHandle)}/events?cursor=${encodeURIComponent(cursor)}`,
  stream: (sessionHandle: string, cursor?: string) => `${AILI_BFF_BASE}/sessions/${encodeURIComponent(sessionHandle)}/stream${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  bootstrap: `${AILI_BFF_BASE}/auth/bootstrap`,
  login: `${AILI_BFF_BASE}/auth/login`,
  logout: `${AILI_BFF_BASE}/auth/logout`,
  session: `${AILI_BFF_BASE}/auth/session`,
  mutate: `${AILI_BFF_BASE}/mutations`,
  exportSession: (sessionHandle: string) => `${AILI_BFF_BASE}/sessions/${encodeURIComponent(sessionHandle)}/export`,
  media: (mediaHandle: string) => `${AILI_BFF_BASE}/media/${encodeURIComponent(mediaHandle)}`,
});

export interface EventReplayV1 {
  readonly kind: "events" | "reset";
  readonly events?: readonly RuntimeEventV1[];
  readonly latestCursor: string;
  readonly reason?: "epoch" | "gap" | "backpressure" | "closed";
  readonly snapshotRequired?: true;
}
export interface SnapshotFirstV1 { readonly snapshot: RuntimeSnapshotV1; readonly replay: EventReplayV1; }
export interface MutationResultV1 { readonly disposition: "pending" | "rejected" | "completed" | "failed" | "unknown"; readonly reason: string; readonly sequence?: number; }
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}
export type WorkbenchFetch = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; cache?: "no-store" }) => Promise<FetchResponseLike>;

export interface RuntimeStreamCallbacks {
  readonly onSnapshot: (snapshot: RuntimeSnapshotV1) => void;
  readonly onEvent: (event: RuntimeEventV1) => void;
  readonly onReset: (reset: EventReplayV1) => void;
  readonly onError?: () => void;
}
export interface RuntimeStreamSubscription { close(): void; }
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { readonly data: string }) => void): void;
  onerror: (() => void) | null;
  close(): void;
}
export interface GatewayClientOptions {
  readonly fetch?: WorkbenchFetch;
  readonly requestId?: () => string;
  readonly now?: () => Date;
  readonly eventSource?: (url: string) => EventSourceLike;
}

/**
 * The only browser network owner. All URLs stay under the AILI BFF namespace;
 * no component receives a Pi RPC, AgentSession, filesystem, Git, or MCP client.
 */
export class GatewayClient {
  private readonly fetcher: WorkbenchFetch;
  private readonly requestId: () => string;
  private readonly now: () => Date;
  private readonly eventSource?: (url: string) => EventSourceLike;
  private clientId?: string;

  public constructor(options: GatewayClientOptions = {}) {
    const nativeFetch = globalThis.fetch?.bind(globalThis) as WorkbenchFetch | undefined;
    this.fetcher = options.fetch ?? nativeFetch ?? (() => Promise.reject(new Error("fetch is unavailable")));
    this.requestId = options.requestId ?? randomRequestId;
    this.now = options.now ?? (() => new Date());
    this.eventSource = options.eventSource ?? (typeof globalThis.EventSource === "function"
      ? (url) => new globalThis.EventSource(url) as unknown as EventSourceLike
      : undefined);
  }

  public get authenticatedClientId(): string | undefined { return this.clientId; }

  public async catalog(): Promise<WorkbenchCatalogV1> {
    let response = await this.fetcher(AILI_BFF_ENDPOINTS.catalog, { cache: "no-store" });
    let body = await json(response);
    if (!response.ok && response.status === 401 && await this.bootstrapLoopback()) {
      response = await this.fetcher(AILI_BFF_ENDPOINTS.catalog, { cache: "no-store" });
      body = await json(response);
    }
    if (!response.ok) throw gatewayError(response.status, body);
    const catalog = validateWorkbenchCatalog(body);
    this.clientId = catalog.clientId;
    return catalog;
  }

  public async connect(sessionHandle: string, cursor?: string): Promise<SnapshotFirstV1> {
    const endpoint = `${AILI_BFF_ENDPOINTS.connect(assertHandle(sessionHandle))}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await this.fetcher(endpoint, { cache: "no-store" });
    const body = await json(response);
    if (!response.ok) throw gatewayError(response.status, body);
    if (!record(body)) throw new Error("BFF returned an invalid snapshot-first response");
    const snapshot = validateRuntimeSnapshot(body.snapshot);
    const replay = validateReplay(body.replay);
    if (snapshot.sessionHandle !== sessionHandle) throw new Error("BFF snapshot session mismatch");
    return Object.freeze({ snapshot, replay });
  }

  /** Loads one session's bounded message history; the catalog stays metadata-only. */
  public async history(sessionHandle: string): Promise<WorkbenchHistoryV1["timeline"]> {
    const response = await this.fetcher(AILI_BFF_ENDPOINTS.history(assertHandle(sessionHandle)), { cache: "no-store" });
    const body = await json(response);
    if (!response.ok) throw gatewayError(response.status, body);
    if (!record(body) || body.sessionHandle !== sessionHandle) throw new Error("BFF returned an invalid session history");
    return validateWorkbenchHistory(body).timeline;
  }

  public async events(sessionHandle: string, cursor: string): Promise<EventReplayV1> {
    const response = await this.fetcher(AILI_BFF_ENDPOINTS.events(assertHandle(sessionHandle), cursor), { cache: "no-store" });
    const body = await json(response);
    if (!response.ok) throw gatewayError(response.status, body);
    return validateReplay(body);
  }

  /** Browser push path. EventSource owns reconnect and carries only a non-secret cursor in its URL. */
  public subscribe(sessionHandle: string, cursor: string | undefined, callbacks: RuntimeStreamCallbacks): RuntimeStreamSubscription {
    if (!this.eventSource) throw new Error("runtime event stream is unavailable");
    const source = this.eventSource(AILI_BFF_ENDPOINTS.stream(assertHandle(sessionHandle), cursor));
    let closed = false;
    const parse = (event: { readonly data: string }): unknown => {
      try { return JSON.parse(event.data); } catch { throw new Error("runtime event stream returned malformed JSON"); }
    };
    source.addEventListener("snapshot", (event) => {
      try { if (!closed) callbacks.onSnapshot(validateRuntimeSnapshot(parse(event))); }
      catch { callbacks.onError?.(); source.close(); closed = true; }
    });
    source.addEventListener("runtime", (event) => {
      try { if (!closed) callbacks.onEvent(validateRuntimeEvent(parse(event))); }
      catch { callbacks.onError?.(); source.close(); closed = true; }
    });
    source.addEventListener("reset", (event) => {
      try { if (!closed) callbacks.onReset(validateReplay(parse(event))); }
      catch { callbacks.onError?.(); source.close(); closed = true; }
    });
    source.onerror = () => { if (!closed) callbacks.onError?.(); };
    return Object.freeze({ close: () => { if (!closed) { closed = true; source.close(); } } });
  }

  public async login(accessPhrase: string): Promise<void> {
    if (accessPhrase.length < 12 || accessPhrase.length > 1_024 || accessPhrase.includes("\0")) throw new Error("access password is invalid");
    const encoded = JSON.stringify({ accessPhrase });
    const response = await this.fetcher(AILI_BFF_ENDPOINTS.login, { method: "POST", headers: jsonHeaders(), body: encoded, cache: "no-store" });
    const body = await json(response);
    if (!response.ok) throw gatewayError(response.status, body);
  }

  public async logout(): Promise<void> {
    const encoded = "{}";
    const response = await this.fetcher(AILI_BFF_ENDPOINTS.logout, { method: "POST", headers: jsonHeaders(), body: encoded, cache: "no-store" });
    const body = await json(response);
    if (!response.ok) throw gatewayError(response.status, body);
    this.clientId = undefined;
  }

  private async bootstrapLoopback(): Promise<boolean> {
    try {
      const encoded = "{}";
      const response = await this.fetcher(AILI_BFF_ENDPOINTS.bootstrap, { method: "POST", headers: jsonHeaders(), body: encoded, cache: "no-store" });
      await json(response);
      return response.ok;
    } catch { return false; }
  }

  public async mutate(
    action: WorkbenchAction,
    snapshot: RuntimeSnapshotV1,
    sessionLeaf: string,
    args: Readonly<Record<string, JsonValue>> = {},
  ): Promise<MutationResultV1> {
    const contract = ACTION_CONTRACTS[action];
    if (snapshot.capabilities[contract.capability] !== true) throw new Error(`${contract.label} is unavailable`);
    const build = (clientId: string) => createMutationEnvelope({
      requestId: this.requestId(),
      clientId,
      snapshot,
      sessionLeaf,
      capability: contract.capability,
      commandType: contract.commandType,
      arguments: args,
      requestedAt: this.now().toISOString(),
    });
    let clientId = this.clientId;
    if (!clientId) {
      // A loopback read session may have loaded the catalog without a cookie.
      if (!await this.bootstrapLoopback()) throw new Error("Load the authenticated workbench catalog before mutation");
      await this.catalog();
      clientId = this.clientId;
    }
    if (!clientId) throw new Error("Load the authenticated workbench catalog before mutation");
    try {
      return await this.sendEnvelope(build(clientId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/client-identity-mismatch|same-site-session-required|access-denied/.test(message)) throw error;
      if (!await this.bootstrapLoopback()) throw error;
      await this.catalog();
      const refreshed = this.clientId;
      if (!refreshed) throw error;
      return this.sendEnvelope(build(refreshed));
    }
  }

  public async sendEnvelope(envelope: MutationEnvelopeV1): Promise<MutationResultV1> {
    const encoded = JSON.stringify(envelope);
    const response = await this.fetcher(AILI_BFF_ENDPOINTS.mutate, {
      method: "POST",
      headers: jsonHeaders(),
      body: encoded,
      cache: "no-store",
    });
    const body = await json(response);
    if (!response.ok) throw gatewayError(response.status, body);
    return validateMutationResult(body);
  }

  public exportUrl(sessionHandle: string): string { return AILI_BFF_ENDPOINTS.exportSession(assertHandle(sessionHandle)); }
}

export function validateNoDirectBrowserMutationUrl(url: string): void {
  const parsed = new URL(url, "http://aili.invalid");
  if (parsed.origin !== "http://aili.invalid" || !parsed.pathname.startsWith(`${AILI_BFF_BASE}/`)) throw new Error("browser request bypasses the AILI BFF");
}

function validateReplay(value: unknown): EventReplayV1 {
  if (!record(value) || (value.kind !== "events" && value.kind !== "reset") || typeof value.latestCursor !== "string") throw new Error("BFF returned an invalid event replay");
  if (value.kind === "reset") {
    if (!value.snapshotRequired || !["epoch", "gap", "backpressure", "closed"].includes(String(value.reason))) throw new Error("BFF returned an invalid reset");
    return Object.freeze({ kind: "reset", latestCursor: value.latestCursor, reason: value.reason as EventReplayV1["reason"], snapshotRequired: true });
  }
  if (!Array.isArray(value.events)) throw new Error("BFF returned invalid events");
  return Object.freeze({ kind: "events", events: Object.freeze(value.events.map(validateRuntimeEvent)), latestCursor: value.latestCursor });
}
function validateMutationResult(value: unknown): MutationResultV1 {
  if (!record(value) || !["pending", "rejected", "completed", "failed", "unknown"].includes(String(value.disposition))
    || typeof value.reason !== "string" || value.reason.length > 160
    || (value.sequence !== undefined && (!Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1))) throw new Error("BFF returned an invalid mutation disposition");
  return Object.freeze({ disposition: value.disposition as MutationResultV1["disposition"], reason: value.reason, ...(value.sequence === undefined ? {} : { sequence: Number(value.sequence) }) });
}
async function json(response: FetchResponseLike): Promise<unknown> { try { return await response.json(); } catch { throw new Error(`BFF returned malformed JSON (HTTP ${response.status})`); } }
function gatewayError(status: number, body: unknown): Error { return new Error(record(body) && typeof body.error === "string" ? body.error.slice(0, 240) : `AILI BFF request failed (HTTP ${status})`); }
function assertHandle(value: string): string { if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("invalid opaque handle"); return value; }
function jsonHeaders(): Record<string, string> { return { "Content-Type": "application/json" }; }
function randomRequestId(): string { const id = globalThis.crypto?.randomUUID?.(); return `web-${id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
