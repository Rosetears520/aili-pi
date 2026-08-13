import { validateMutationEnvelope, type MutationEnvelopeV1, type RuntimeSnapshotV1 } from "./contracts.js";
import type { EventReplayResult, RuntimeSubscription, SnapshotFirstReplay } from "./event-hub.js";
import type { MutationAdmissionContext, MutationExecution, RuntimeHost } from "./runtime-host.js";
import { WebAccessLifecycle, type WebRequestIdentity } from "./access-policy.js";
import type { OfficialAgentSessionLike } from "./lazy-agent-session.js";

export interface GatewayResponse<T> {
  readonly status: number;
  readonly body: T;
  readonly headers: Readonly<Record<string, string>>;
}

export interface WebMutationRequestIdentity extends WebRequestIdentity {
  readonly contentType?: string;
  readonly contentLength?: number;
}

export interface BffEventStream {
  readonly snapshotFirst: SnapshotFirstReplay;
  readonly subscription: RuntimeSubscription;
}

export interface PrivateWebBffOptions {
  readonly maxMutationBytes?: number;
  readonly admitMutation?: (request: WebMutationRequestIdentity, envelope: MutationEnvelopeV1, browserSessionId: string) => Promise<Omit<MutationAdmissionContext, "authenticatedClientId" | "channelAuthenticated" | "browserPolicyValidated">> | Omit<MutationAdmissionContext, "authenticatedClientId" | "channelAuthenticated" | "browserPolicyValidated">;
}

const PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
});

/** Transport-neutral Browser BFF. Routes receive opaque handles, never Pi ids. */
export class PrivateWebBff<T extends OfficialAgentSessionLike = OfficialAgentSessionLike> {
  private readonly maxMutationBytes: number;
  private loopbackBootstrap?: string;

  public constructor(
    private readonly lifecycle: WebAccessLifecycle,
    private readonly hosts: { get(sessionHandle: string): RuntimeHost<T> | undefined },
    private readonly options: PrivateWebBffOptions = {},
  ) {
    this.maxMutationBytes = options.maxMutationBytes ?? 256 * 1024;
    if (!Number.isSafeInteger(this.maxMutationBytes) || this.maxMutationBytes < 1_024 || this.maxMutationBytes > 4 * 1024 * 1024) {
      throw new Error("BFF mutation byte limit is invalid");
    }
  }

  /** Arm one internal loopback exchange. The value is never returned to a browser or URL. */
  public armLoopbackBootstrap(): void {
    if (!this.lifecycle.loopback) throw new Error("loopback bootstrap is unavailable for a non-loopback policy");
    this.loopbackBootstrap = this.lifecycle.createBootstrap();
  }

  public dispose(): void {
    this.loopbackBootstrap = undefined;
  }

  public exchangeLoopbackBootstrap(request: Pick<WebRequestIdentity, "host" | "origin" | "cookie">): GatewayResponse<{ readonly authenticated: true } | { readonly error: string }> {
    const value = this.loopbackBootstrap;
    this.loopbackBootstrap = undefined;
    if (!this.lifecycle.loopback || !value) return this.denied("bootstrap-unavailable");
    const exchanged = this.lifecycle.consumeBootstrap(value, request);
    if (!exchanged) return this.denied("bootstrap-invalid");
    return { status: 200, body: { authenticated: true }, headers: { ...PRIVATE_HEADERS, "Set-Cookie": exchanged.setCookie } };
  }

  public consumeBootstrap(value: string, request: Pick<WebRequestIdentity, "host" | "origin" | "cookie">): GatewayResponse<{ readonly redirect: string } | { readonly error: string }> {
    const exchanged = this.lifecycle.consumeBootstrap(value, request);
    if (!exchanged) return this.denied("bootstrap-invalid");
    return {
      status: 303,
      body: { redirect: "/" },
      headers: { ...PRIVATE_HEADERS, "Set-Cookie": exchanged.setCookie, Location: "/" },
    };
  }

  public login(
    request: WebMutationRequestIdentity,
    accessPhrase: string,
  ): GatewayResponse<{ readonly authenticated: true } | { readonly error: string }> {
    const loggedIn = this.lifecycle.login(accessPhrase, {
      host: request.host,
      origin: request.origin,
      cookie: request.cookie,
      method: "POST",
      contentType: request.contentType,
      bodyBytes: request.contentLength,
      mutation: true,
    });
    if (!loggedIn) return this.denied("login-denied");
    return { status: 200, body: { authenticated: true }, headers: { ...PRIVATE_HEADERS, "Set-Cookie": loggedIn.setCookie } };
  }

  public session(request: WebRequestIdentity): GatewayResponse<{ readonly authenticated: true; readonly clientId: string } | { readonly error: string }> {
    const access = this.lifecycle.authorize(request);
    if (!access.ok) return this.denied(access.reason);
    return { status: 200, body: { authenticated: true, clientId: access.sessionId }, headers: PRIVATE_HEADERS };
  }

  public logout(request: WebMutationRequestIdentity): GatewayResponse<{ readonly authenticated: false } | { readonly error: string }> {
    const access = this.lifecycle.authorizeRequest({
      host: request.host,
      origin: request.origin,
      cookie: request.cookie,
      method: "POST",
      contentType: request.contentType,
      bodyBytes: request.contentLength,
      mutation: true,
    });
    if (!access.ok) return this.denied(access.reason);
    return { status: 200, body: { authenticated: false }, headers: { ...PRIVATE_HEADERS, "Set-Cookie": this.lifecycle.logout(access.sessionId) } };
  }

  public snapshot(request: WebRequestIdentity, sessionHandle: string): GatewayResponse<RuntimeSnapshotV1 | { readonly error: string }> {
    if (!this.lifecycle.authorize(request).ok) return this.denied("access-denied");
    const host = this.hosts.get(sessionHandle);
    if (!host) return this.notFound();
    return { status: 200, body: host.snapshot, headers: PRIVATE_HEADERS };
  }

  public connect(request: WebRequestIdentity, sessionHandle: string, cursor?: string): GatewayResponse<SnapshotFirstReplay | { readonly error: string }> {
    if (!this.lifecycle.authorize(request).ok) return this.denied("access-denied");
    const host = this.hosts.get(sessionHandle);
    if (!host) return this.notFound();
    return { status: 200, body: host.connect(cursor), headers: PRIVATE_HEADERS };
  }

  public events(request: WebRequestIdentity, sessionHandle: string, cursor?: string): GatewayResponse<EventReplayResult | { readonly error: string }> {
    if (!this.lifecycle.authorize(request).ok) return this.denied("access-denied");
    const host = this.hosts.get(sessionHandle);
    if (!host) return this.notFound();
    return { status: 200, body: host.replay(cursor), headers: PRIVATE_HEADERS };
  }

  /** Snapshot-first push attachment. The caller owns and must close the subscription. */
  public stream(request: WebRequestIdentity, sessionHandle: string, cursor?: string): GatewayResponse<BffEventStream | { readonly error: string }> {
    if (!this.lifecycle.authorize(request).ok) return this.denied("access-denied");
    const host = this.hosts.get(sessionHandle);
    if (!host) return this.notFound();
    const snapshotFirst = host.connect(cursor);
    const subscription = host.subscribe(snapshotFirst.replay.kind === "events" ? snapshotFirst.replay.latestCursor : snapshotFirst.snapshot.cursor);
    return { status: 200, body: Object.freeze({ snapshotFirst, subscription }), headers: PRIVATE_HEADERS };
  }

  public async mutate(
    request: WebMutationRequestIdentity,
    envelope: MutationEnvelopeV1,
    execute: MutationExecution<T>,
  ): Promise<GatewayResponse<{ readonly disposition: string; readonly reason: string; readonly sequence?: number } | { readonly error: string }>> {
    const access = this.lifecycle.authorizeRequest({
      host: request.host,
      origin: request.origin,
      cookie: request.cookie,
      method: "POST",
      bodyBytes: request.contentLength,
      contentType: request.contentType,
      mutation: true,
      capabilityAllowed: true,
    });
    if (!access.ok) return this.denied(access.reason);
    if (request.contentLength !== undefined && request.contentLength > this.maxMutationBytes) return this.badRequest("request-too-large", 413);
    let validated: MutationEnvelopeV1;
    try { validated = validateMutationEnvelope(envelope); }
    catch { return this.badRequest("invalid-mutation-envelope", 400); }
    if (validated.clientId !== access.sessionId) return this.denied("client-identity-mismatch");
    const host = this.hosts.get(validated.sessionHandle);
    if (!host) return this.notFound();
    const admitted = await this.options.admitMutation?.(request, validated, access.sessionId);
    if (!admitted) return this.denied("mutation-policy-unavailable");
    const result = await host.mutate("web", validated, {
      ...admitted,
      authenticatedClientId: access.sessionId,
      channelAuthenticated: true,
      browserPolicyValidated: true,
    }, execute);
    const completed = result.disposition.disposition === "completed";
    return {
      status: completed ? 200 : result.disposition.reason === "request-id-collision" ? 409 : 403,
      body: {
        disposition: result.disposition.disposition,
        reason: result.disposition.reason,
        ...(result.disposition.sequence === undefined ? {} : { sequence: result.disposition.sequence }),
      },
      headers: PRIVATE_HEADERS,
    };
  }

  private denied(reason: string): GatewayResponse<{ readonly error: string }> {
    return { status: 401, body: { error: reason }, headers: PRIVATE_HEADERS };
  }

  private badRequest(reason: string, status: number): GatewayResponse<{ readonly error: string }> {
    return { status, body: { error: reason }, headers: PRIVATE_HEADERS };
  }

  private notFound(): GatewayResponse<{ readonly error: string }> {
    return { status: 404, body: { error: "session-not-found" }, headers: PRIVATE_HEADERS };
  }
}

export { PRIVATE_HEADERS };
