import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ImageContent } from "@earendil-works/pi-ai/compat";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { readdir } from "node:fs/promises";
import {
  CanonicalAllowedRootPolicy,
  WebAccessLifecycle,
  validateWebListenPolicy,
  type AllowedPathGrant,
  type ApprovedWebListenPolicy,
  type WebRequestIdentity,
} from "../../runtime/web/access-policy.js";
import { PrivateWebBff, type GatewayResponse } from "../../runtime/web/bff-gateway.js";
import type { JsonValue, MutationEnvelopeV1 } from "../../runtime/web/contracts.js";
import { ReadonlyJsonlBrowser, type JsonlImageCandidateV1, type JsonlSessionDescriptorV1 } from "../../runtime/web/jsonl-browser.js";
import {
  OwnerOnlyProcessLivenessServer,
  currentProcessIdentity,
  isExactProcessAlive,
  markLeaseInterrupted,
  probeOwnerProcessLiveness,
} from "../../runtime/web/process-liveness.js";
import { RuntimeHost, RuntimeHostRegistry, type MutationExecutionResult } from "../../runtime/web/runtime-host.js";
import type { LeaseAcquireResult } from "../../runtime/web/session-writer-lease.js";
import { assertBoundedJson, type WorkbenchCatalogV1, type WorkbenchHistoryV1, type WorkbenchProjectV1, type WorkbenchSessionV1 } from "../contracts.js";
import { resolveSessionPath } from "../lib/session-reader.js";
import { ConfigurationMutationService, CONFIGURATION_COMMANDS, isConfigurationCommand } from "./configuration-service.js";
import {
  PrivateWebBffBridge,
  type AiliBffHttpRequest,
  type AiliCompatibilityMutationRequest,
  type AiliCompatibilitySessionCreateRequest,
  type AiliWebBffBridge,
} from "./private-bff-bridge.js";

const OFFICIAL_PI_VERSION = "0.84.4" as const;
const RPC_RUNTIME_ADAPTER_SYMBOL = Symbol.for("@rosetears/aili-pi/web-rpc-runtime-adapter/v1");

interface ForegroundAgentSession {
  readonly sessionId: string;
  readonly sessionFile: string;
  readonly cwd: string;
  readonly inner: {
    readonly sessionManager: { getLeafId(): string | null };
    readonly model?: { readonly provider: string; readonly id: string } | null;
    readonly agent: { readonly state?: { readonly thinkingLevel?: string } };
    getContextUsage(): { readonly tokens: number; readonly contextWindow: number } | undefined;
  };
  send(command: Record<string, unknown>): Promise<unknown>;
  isRunning(): boolean;
  onEvent(listener: (event: { readonly type: string }) => void): () => void;
  dispose(): Promise<void>;
}

interface RpcRuntimeAdapter {
  open(path: string): Promise<ForegroundAgentSession>;
  create(options: { cwd: string; toolNames?: readonly string[]; provider?: string; modelId?: string; thinkingLevel?: string }): Promise<ForegroundAgentSession>;
}
type RpcRuntimeAdapterGlobal = Record<symbol, RpcRuntimeAdapter | undefined>;
const INITIAL_HISTORY_ENTRY_LIMIT = 50;
const CONTINUATION_HISTORY_ENTRY_LIMIT = 200;
const HISTORY_CURSOR_TTL_MS = 10 * 60_000;
const TOOL_RESULT_IMAGE_MAX_BYTES = 48 * 1024;
const TOOL_RESULT_IMAGE_PAGE_MAX_BYTES = 96 * 1024;
const TOOL_RESULT_IMAGE_MAX_DIMENSION = 8_192;
const TOOL_RESULT_IMAGE_MAX_PIXELS = 40_000_000;
const TOOL_RESULT_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
});

/** Capabilities absent from this allowlist are never advertised or dispatched. */
export const FOREGROUND_PI_COMMANDS = Object.freeze({
  "pi.send": Object.freeze(["send"]),
  "pi.follow_up": Object.freeze(["follow_up"]),
  "pi.steer": Object.freeze(["steer"]),
  "pi.compact": Object.freeze(["compact", "set_auto_compaction"]),
  "pi.abort": Object.freeze(["abort", "abort_compaction"]),
  "pi.bash": Object.freeze(["bash", "abort_bash"]),
  "pi.queue": Object.freeze(["clear_queue"]),
  "pi.tools": Object.freeze(["set_tools"]),
  "pi.thinking": Object.freeze(["select_thinking"]),
  "pi.model": Object.freeze(["select_model"]),
  "pi.branch": Object.freeze(["branch"]),
  "pi.fork": Object.freeze(["fork"]),
  "session.reload": Object.freeze(["reload"]),
  "session.rename": Object.freeze(["rename", "auto_name"]),
  "permission.mode": Object.freeze(["set_perm_mode"]),
  "provider.retry": Object.freeze(["set_auto_retry"]),
  "extension.interact": Object.freeze(["respond", "input"]),
  "session.safe_delete": Object.freeze(["safe_delete"]),
} as const);

const CAPABILITIES = Object.freeze({
  "session.observe": true,
  "pi.send": true,
  "pi.follow_up": true,
  "pi.steer": true,
  "pi.compact": true,
  "pi.abort": true,
  "pi.bash": true,
  "pi.queue": true,
  "pi.tools": true,
  "pi.thinking": true,
  "session.rename": true,
  "session.reload": true,
  "permission.mode": true,
  "provider.retry": true,
  "extension.interact": true,
  "session.create": false,
  "session.safe_delete": true,
  "pi.branch": true,
  "pi.fork": true,
  "pi.model": true,
  "models.configure": false,
  "skills.configure": false,
  "plugins.configure": false,
  "agent.continue": false,
  "analytics.read": false,
  "stamp.read": false,
  "btw.read": false,
  "worktree.read": false,
  "worktree.mutate": false,
  "media.send": false,
} satisfies Readonly<Record<string, boolean>>);

export interface ForegroundCompositionOptions {
  readonly policy: ApprovedWebListenPolicy;
  readonly accessPhrase?: string;
  readonly runtimeDirectory: string;
  readonly sessionRoots: readonly string[];
  readonly privateSalt: string;
  readonly now?: () => Date;
  readonly browser?: ReadonlyJsonlBrowser;
  readonly managerOpen?: (path: string) => SessionManager;
  readonly createOfficialSession?: (path: string) => Promise<ForegroundAgentSession>;
  readonly processIdentity?: ReturnType<typeof currentProcessIdentity>;
  readonly livenessServer?: OwnerOnlyProcessLivenessServer;
}

type PrepareSessionResult = { readonly ok: true } | { readonly ok: false; readonly response: GatewayResponse<{ readonly error: string }> };

interface SessionRuntimeMetadata {
  readonly handle: string;
  readonly privatePath: string;
  readonly privateIdentity: string;
  readonly cwd: string;
  readonly host: RuntimeHost<ForegroundAgentSession>;
  readonly rootGrant?: AllowedPathGrant;
  readonly transient?: boolean;
  currentLeaf: string;
  officialUnsubscribe?: () => void;
}

/**
 * Production composition root installed by Next instrumentation.register(). It
 * is the only code that joins auth, read-only JSONL, RuntimeHost, Pi SDK, BFF,
 * mutation dispatch, and ordered event-stream ownership. The superseded private
 * TUI observer/projection path is intentionally not composed here.
 */
export class ForegroundRuntimeComposition implements AiliWebBffBridge {
  readonly registry = new RuntimeHostRegistry<ForegroundAgentSession>();
  readonly lifecycle: WebAccessLifecycle;
  readonly bff: PrivateWebBff<ForegroundAgentSession>;
  private readonly inner: PrivateWebBffBridge<ForegroundAgentSession>;
  private readonly browser: ReadonlyJsonlBrowser;
  private readonly rootPolicy: CanonicalAllowedRootPolicy;
  private readonly managerOpen: (path: string) => SessionManager;
  private readonly createOfficialSession: (path: string) => Promise<ForegroundAgentSession>;
  private readonly sessions = new Map<string, SessionRuntimeMetadata>();
  private readonly rawSessionHandles = new Map<string, string>();
  private readonly loadingSessions = new Map<string, Promise<SessionRuntimeMetadata | undefined>>();
  private readonly preparingSessions = new Map<string, Promise<PrepareSessionResult>>();
  private readonly historyCursors = new Map<string, { readonly sessionHandle: string; readonly clientId: string; readonly beforeIndex: number; readonly expiresAt: number }>();
  private readonly mediaHandles = new Map<string, { readonly clientId: string; readonly bytes: Uint8Array; readonly mimeType: string; readonly expiresAt: number }>();
  private readonly configurationService = new ConfigurationMutationService();
  private configurationHost?: RuntimeHost<ForegroundAgentSession>;
  private maintenanceChain: Promise<void> = Promise.resolve();
  private readonly processIdentity: ReturnType<typeof currentProcessIdentity>;
  private livenessServer?: OwnerOnlyProcessLivenessServer;
  private maintenanceTimer?: NodeJS.Timeout;
  private disposed = false;

  private constructor(private readonly options: ForegroundCompositionOptions, rootPolicy: CanonicalAllowedRootPolicy) {
    this.processIdentity = options.processIdentity ?? currentProcessIdentity();
    this.lifecycle = new WebAccessLifecycle(options.policy, options.accessPhrase, options.now);
    this.rootPolicy = rootPolicy;
    this.browser = options.browser ?? new ReadonlyJsonlBrowser({ allowedRoots: options.sessionRoots, privateSalt: options.privateSalt });
    this.managerOpen = options.managerOpen ?? ((path) => SessionManager.open(path));
    this.createOfficialSession = options.createOfficialSession ?? (async (path) => {
      const adapter = (globalThis as unknown as RpcRuntimeAdapterGlobal)[RPC_RUNTIME_ADAPTER_SYMBOL];
      if (!adapter) throw new Error("Pi Web RPC runtime adapter is unavailable");
      return adapter.open(path);
    });
    this.bff = new PrivateWebBff(this.lifecycle, this.registry, {
      admitMutation: (_request, envelope) => this.admitMutation(envelope),
    });
    if (options.policy.loopback) this.bff.armLoopbackBootstrap();
    this.inner = new PrivateWebBffBridge(this.bff, {
      catalog: (identity) => this.catalog(identity),
      history: (identity, sessionHandle, cursor) => this.history(identity, sessionHandle, cursor),
      media: (identity, mediaHandle) => this.media(identity, mediaHandle),
      configuration: (identity) => this.configuration(identity),
      execute: (session, envelope) => this.executeMutation(session, envelope),
    });
  }

  public static async create(options: ForegroundCompositionOptions): Promise<ForegroundRuntimeComposition> {
    if (!isAbsolute(options.runtimeDirectory) || options.sessionRoots.length === 0 || !options.privateSalt) {
      throw new Error("foreground Runtime composition paths or private identity are invalid");
    }
    if (options.sessionRoots.some((root) => !isAbsolute(root))) throw new Error("foreground Runtime session roots must be absolute");
    if (options.policy.allowedRoots.some((root) => root !== resolve(root))) throw new Error("foreground Runtime allowed roots must be canonical");
    const rootPolicy = await CanonicalAllowedRootPolicy.create(options.policy.allowedRoots);
    if (rootPolicy.roots.length !== options.policy.allowedRoots.length
      || rootPolicy.roots.some((root, index) => root !== options.policy.allowedRoots[index])) {
      throw new Error("foreground Runtime allowed-root policy changed after startup validation");
    }
    const composition = new ForegroundRuntimeComposition(options, rootPolicy);
    composition.livenessServer = options.livenessServer ?? new OwnerOnlyProcessLivenessServer(options.runtimeDirectory, (generation) =>
      composition.configurationHost?.writerGeneration === generation
        || [...composition.sessions.values()].some((session) => session.host.writerGeneration === generation));
    try { await composition.livenessServer.start(); }
    catch (error) {
      await composition.livenessServer.close().catch(() => undefined);
      composition.livenessServer = undefined;
      composition.bff.dispose();
      composition.lifecycle.dispose();
      throw error;
    }
    try {
      // Scope the durable writer lease to this one-use private launch identity.
      // A clean foreground restart must not wait for the prior process lease TTL.
      const configurationIdentity = opaqueHandle("configuration", options.privateSalt, "foreground-service-mutations");
      const host = composition.registry.create(configurationIdentity, {
        piVersion: OFFICIAL_PI_VERSION,
        runtimeDirectory: options.runtimeDirectory,
        sessionHandle: configurationIdentity,
        now: options.now,
        lease: {
          processIdentity: composition.processIdentity,
          livenessEndpointId: composition.livenessServer!.endpointId,
          isProcessAlive: isExactProcessAlive,
          probeLiveness: (endpointId, generation) => probeOwnerProcessLiveness(options.runtimeDirectory, endpointId, generation),
          markInterrupted: (record) => markLeaseInterrupted(options.runtimeDirectory, record),
        },
        // Deliberately a service object: configuration never creates an AgentSession.
        agentSessionFactory: { create: async () => composition.configurationService as unknown as ForegroundAgentSession },
        initialSnapshot: {
          state: "idle",
          capabilities: Object.fromEntries(Object.keys(CONFIGURATION_COMMANDS).map((key) => [key, true])),
          projection: { service: "configuration" },
        },
      });
      await host.initialize();
      const acquired = await host.acquireWriter("web");
      if (!acquired.acquired) throw new Error("configuration-service-writer-unavailable");
      composition.configurationHost = host;
    } catch (error) {
      await composition.dispose().catch(() => undefined);
      throw error;
    }
    composition.maintenanceTimer = setInterval(() => {
      composition.maintenanceChain = composition.maintenanceChain.then(() => composition.maintain()).catch(() => undefined);
    }, 30_000);
    composition.maintenanceTimer.unref();
    return composition;
  }

  public async dispatch(request: AiliBffHttpRequest): Promise<GatewayResponse<unknown>> {
    if (this.disposed) return failure(503, "runtime-composition-closed");
    if (request.method === "GET" && request.segments.length === 3 && request.segments[0] === "sessions"
      && request.segments[2] === "events" && safeHandle(request.segments[1])) {
      const authorized = this.lifecycle.authorizeLoopbackRead(identityOf(request));
      if (!authorized.ok) return failure(401, authorized.reason);
      const prepared = await this.prepareSession(request.segments[1], false);
      if (!prepared.ok) return prepared.response;
    }
    if (request.method === "GET" && request.segments.length === 3 && request.segments[0] === "sessions"
      && request.segments[2] === "export") return failure(404, "session-export-unavailable");
    if (request.method === "POST" && request.segments.length === 1 && request.segments[0] === "mutations") {
      const envelope = unknownRecord(request.body);
      const handle = typeof envelope?.sessionHandle === "string" ? envelope.sessionHandle : undefined;
      if (!handle || !safeHandle(handle)) return failure(400, "invalid-mutation-envelope");
      const authorized = this.lifecycle.authorize(identityOf(request));
      if (!authorized.ok) return failure(401, authorized.reason);
      if (handle !== this.configurationHost?.sessionHandle) {
        const prepared = await this.prepareSession(handle, true);
        if (!prepared.ok) return prepared.response;
      }
    }
    const handle = sessionHandleFrom(request, "connect");
    if (handle) {
      const authorized = this.lifecycle.authorizeLoopbackRead(identityOf(request));
      if (!authorized.ok) return failure(401, authorized.reason);
      const prepared = await this.prepareSession(handle, false);
      if (!prepared.ok) return prepared.response;
    }
    const response = await this.inner.dispatch(request);
    if (response.status === 200 && request.method === "POST" && request.segments.length === 2
      && request.segments[0] === "auth" && request.segments[1] === "logout") {
      try { await this.releaseIdleWebWriters(); }
      catch { return failure(503, "logout-writer-release-failed"); }
    }
    return response;
  }

  public async createCompatibilitySession(request: AiliCompatibilitySessionCreateRequest): Promise<GatewayResponse<unknown>> {
    if (this.disposed) return failure(503, "runtime-composition-closed");
    const identity = { host: request.host, origin: request.origin, cookie: request.cookie };
    const authorized = this.lifecycle.authorize(identity);
    if (!authorized.ok) return failure(401, authorized.reason);
    let grant: AllowedPathGrant;
    try { grant = await this.rootPolicy.grant(request.cwd, { mustExist: true }); }
    catch { return failure(403, "allowed-root-denied"); }
    const adapter = (globalThis as unknown as RpcRuntimeAdapterGlobal)[RPC_RUNTIME_ADAPTER_SYMBOL];
    if (!adapter) return failure(503, "Pi Web RPC runtime adapter is unavailable");
    let session: ForegroundAgentSession;
    try {
      session = await adapter.create({ cwd: grant.resolvedPath, toolNames: request.toolNames, provider: request.provider, modelId: request.modelId, thinkingLevel: request.thinkingLevel });
    } catch (error) { return failure(500, boundedEventType(error instanceof Error ? error.message : String(error))); }
    if (!session.sessionId || !isAbsolute(session.sessionFile) || resolve(session.cwd) !== grant.resolvedPath) {
      await session.dispose().catch(() => undefined);
      return failure(500, "created-session-identity-invalid");
    }
    let handle: string;
    try { handle = (await this.browser.handleForPrivatePath(session.sessionFile))!; }
    catch { await session.dispose().catch(() => undefined); return failure(500, "created-session-path-invalid"); }
    const privateIdentity = session.sessionId;
    let metadata!: SessionRuntimeMetadata;
    const host = this.registry.create(privateIdentity, {
      piVersion: OFFICIAL_PI_VERSION,
      runtimeDirectory: this.options.runtimeDirectory,
      sessionHandle: handle,
      now: this.options.now,
      lease: {
        processIdentity: this.processIdentity,
        livenessEndpointId: this.livenessServer!.endpointId,
        isProcessAlive: isExactProcessAlive,
        probeLiveness: (endpointId, generation) => probeOwnerProcessLiveness(this.options.runtimeDirectory, endpointId, generation),
        markInterrupted: (record) => markLeaseInterrupted(this.options.runtimeDirectory, record),
      },
      agentSessionFactory: { create: async () => {
        metadata.officialUnsubscribe = session.onEvent((event) => this.projectOfficialEvent(metadata, session, event.type));
        return session;
      } },
      initialSnapshot: { state: "idle", capabilities: CAPABILITIES, projection: { pi: { activeRun: false, leafId: safeLeaf(session.inner.sessionManager.getLeafId()) }, agent: { tasks: [] }, mcp: { servers: [] } } },
    });
    try {
      await host.initialize();
      metadata = { handle, privatePath: session.sessionFile, privateIdentity, cwd: grant.resolvedPath, host, rootGrant: grant, transient: true, currentLeaf: safeLeaf(session.inner.sessionManager.getLeafId()) };
      this.sessions.set(handle, metadata);
      this.rawSessionHandles.set(privateIdentity, handle);
      const ownership = await host.acquireWriter("web");
      if (!ownership.acquired) throw new Error("created-session-writer-unavailable");
      const state = await session.send({ type: "get_state" }) as { model?: { id: string; provider: string }; thinkingLevel?: string };
      return { status: 200, headers: PRIVATE_HEADERS, body: { success: true, sessionId: privateIdentity, data: null, model: state.model ? { provider: state.model.provider, modelId: state.model.id } : null, thinkingLevel: state.thinkingLevel } };
    } catch (error) {
      this.sessions.delete(handle);
      this.rawSessionHandles.delete(privateIdentity);
      await this.registry.dispose(handle).catch(() => session.dispose());
      return failure(500, boundedEventType(error instanceof Error ? error.message : String(error)));
    }
  }

  public async dispatchCompatibilityMutation(request: AiliCompatibilityMutationRequest): Promise<GatewayResponse<unknown>> {
    if (this.disposed) return failure(503, "runtime-composition-closed");
    const identity = { host: request.host, origin: request.origin, cookie: request.cookie };
    const authorized = this.lifecycle.authorize(identity);
    if (!authorized.ok) return failure(401, authorized.reason);
    const mutation = compatibilityMutationOf(request);
    if (!mutation) return failure(404, "compatibility-mutation-unavailable");
    let handle = this.rawSessionHandles.get(request.resourceId);
    if (!handle) {
      let privatePath: string | undefined;
      try { privatePath = await resolveSessionPath(request.resourceId) ?? undefined; }
      catch { return failure(404, "session-not-found"); }
      if (!privatePath) return failure(404, "session-not-found");
      try { handle = await this.browser.handleForPrivatePath(privatePath); }
      catch { return failure(404, "session-not-found"); }
    }
    if (!handle) return failure(404, "session-not-found");
    const prepared = await this.prepareSession(handle, true);
    if (!prepared.ok) return prepared.response;
    const metadata = this.sessions.get(handle);
    const snapshot = metadata?.host.snapshot;
    if (!metadata || !snapshot || snapshot.writer.owner !== "web" || !snapshot.writer.generation) {
      return failure(409, "session-writer-unavailable");
    }
    const envelope: MutationEnvelopeV1 = {
      schemaVersion: 1,
      type: "MutationEnvelopeV1",
      requestId: `compat-${randomUUID()}`,
      clientId: authorized.sessionId,
      runtimeEpoch: snapshot.runtimeEpoch,
      leaseGeneration: snapshot.writer.generation,
      sessionHandle: handle,
      sessionLeaf: metadata.currentLeaf,
      requestedAt: (this.options.now?.() ?? new Date()).toISOString(),
      capability: mutation.capability,
      commandType: mutation.commandType,
      arguments: mutation.arguments,
    };
    const encoded = JSON.stringify(envelope);
    const response = await this.inner.dispatch({
      method: "POST",
      segments: ["mutations"],
      ...identity,
      contentType: "application/json",
      contentLength: Buffer.byteLength(encoded),
      body: envelope,
    });
    return response;
  }

  public async openEventStream(request: AiliBffHttpRequest) {
    if (this.disposed) return failure(503, "runtime-composition-closed");
    const handle = sessionHandleFrom(request, "stream");
    if (!handle) return failure(404, "runtime-stream-not-found");
    const authorized = this.lifecycle.authorizeLoopbackRead(identityOf(request));
    if (!authorized.ok) return failure(401, authorized.reason);
    const prepared = await this.prepareSession(handle, false);
    if (!prepared.ok) return prepared.response;
    return this.inner.openEventStream(request);
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.maintenanceTimer = undefined;
    const failures: string[] = [];
    await this.maintenanceChain.catch(() => undefined);
    await Promise.allSettled(this.preparingSessions.values());
    await Promise.allSettled(this.loadingSessions.values());
    this.loadingSessions.clear();
    this.preparingSessions.clear();
    this.historyCursors.clear();
    this.mediaHandles.clear();
    const sessionResources = [...this.sessions.values()];
    for (const session of sessionResources) {
      try { session.officialUnsubscribe?.(); } catch { failures.push("official-observer"); }
    }
    this.sessions.clear();
    this.rawSessionHandles.clear();
    const liveness = this.livenessServer;
    this.livenessServer = undefined;
    const settled = await Promise.allSettled([this.registry.disposeAll(), liveness?.close() ?? Promise.resolve()]);
    if (settled[0].status === "rejected") failures.push("runtime-registry");
    if (settled[1].status === "rejected") failures.push("process-liveness");
    this.bff.dispose();
    this.lifecycle.dispose();
    if (failures.length) throw new Error(`foreground Runtime cleanup failed: ${failures.join(",")}`);
  }

  private async maintain(): Promise<void> {
    if (this.disposed) return;
    if (this.configurationHost?.snapshot.writer.owner === "web") {
      await this.configurationHost.heartbeatWriter(false).catch(() => false);
    }
    const removedSessions = this.lifecycle.expire();
    if (removedSessions > 0 && this.lifecycle.activeSessionCount === 0) {
      await this.releaseIdleWebWriters();
      return;
    }
    for (const metadata of this.sessions.values()) {
      if (metadata.host.snapshot.writer.owner === "web") {
        const renewed = await metadata.host.heartbeatWriter().catch(() => false);
        if (!renewed) {
          try { metadata.host.project("lease", "blocked", { writerHealth: "lost" }); } catch { /* disposed concurrently */ }
        }
      }
    }
  }

  private async releaseIdleWebWriters(): Promise<void> {
    const released = await Promise.all([...this.sessions.values()].map(async (session) => {
      if (session.host.snapshot.writer.owner !== "web" || session.host.snapshot.writer.activeTurn) return true;
      return session.host.releaseWriter().catch(() => false);
    }));
    if (released.some((value) => !value)) throw new Error("idle Web writer release failed");
  }

  private async catalog(identity: WebRequestIdentity): Promise<GatewayResponse<WorkbenchCatalogV1 | { readonly error: string }>> {
    const access = this.lifecycle.authorizeLoopbackRead(identity);
    if (!access.ok) return failure(401, access.reason);
    let descriptors: readonly JsonlSessionDescriptorV1[];
    try { descriptors = await this.browser.list(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") descriptors = [];
      else return failure(503, "session-catalog-unavailable");
    }
    // Official streaming metadata scan (the pi-web pattern): the catalog stays
    // metadata-only; message bodies load per session through the history route.
    // SessionManager.listAll(dir) reads only files directly inside dir, so the
    // scan walks the sessions root plus each of its project subdirectories.
    const infos = new Map<string, { cwd?: string; messageCount?: number }>();
    for (const root of this.options.sessionRoots) {
      const scanTargets = [root];
      try {
        const entries = await readdir(root, { withFileTypes: true });
        for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink()) scanTargets.push(join(root, entry.name));
      } catch { /* the root scan below stays best-effort */ }
      for (const target of scanTargets) {
        try {
          const scanned = await SessionManager.listAll(target);
          for (const info of scanned) infos.set(info.path, { cwd: info.cwd, messageCount: info.messageCount });
        } catch { /* metadata stays best-effort; browsing still lists descriptors */ }
      }
    }
    const byProject = new Map<string, { label: string; sessions: WorkbenchSessionV1[] }>();
    for (const descriptor of descriptors.slice(0, 1_024)) {
      const privatePath = this.browser.privatePathForHandle(descriptor.sessionHandle);
      if (!privatePath) continue;
      const info = infos.get(privatePath);
      const cwd = info?.cwd && isAbsolute(info.cwd) ? resolve(info.cwd) : "";
      const projectIdentity = cwd || `session:${descriptor.sessionHandle}`;
      const projectHandle = opaqueHandle("project", this.options.privateSalt, projectIdentity);
      const project = byProject.get(projectHandle) ?? { label: `Pi project ${projectHandle.slice(-8)}`, sessions: [] };
      const canWrite = Boolean(cwd) && this.rootPolicy.roots.some((root) => pathContained(root, cwd));
      const activeHost = this.sessions.get(descriptor.sessionHandle)?.host;
      project.sessions.push(sessionCatalogEntry(descriptor, info?.messageCount, projectHandle, canWrite, activeHost?.snapshot.writer.activeTurn === true));
      byProject.set(projectHandle, project);
    }
    const projects: WorkbenchProjectV1[] = [...byProject.entries()].map(([handle, project]) => Object.freeze({
      handle,
      label: project.label,
      sessions: Object.freeze(project.sessions),
    }));
    return {
      status: 200,
      headers: PRIVATE_HEADERS,
      body: Object.freeze({
        schemaVersion: 1,
        clientId: access.sessionId,
        projects: Object.freeze(projects),
        models: Object.freeze([]),
        commands: Object.freeze(Object.entries(FOREGROUND_PI_COMMANDS).flatMap(([capability, commands]) => commands.map((commandType) => Object.freeze({
          handle: `command.${capability}.${commandType}`.slice(0, 128),
          label: commandType.replace(/_/g, " "),
          description: `Official Pi ${capability}`,
          source: "builtin" as const,
          enabled: true,
        })))),
        skills: Object.freeze([]),
        plugins: Object.freeze([]),
        files: Object.freeze([]),
        worktrees: Object.freeze([]),
        locales: Object.freeze(["en", "zh-CN"] as const),
      }),
    };
  }

  /** Active-branch tail pagination. Continuations are opaque and bound to browser auth plus session. */
  public async history(identity: WebRequestIdentity, sessionHandle: string, cursor?: string): Promise<GatewayResponse<WorkbenchHistoryV1 | { readonly error: string }>> {
    const access = this.lifecycle.authorizeLoopbackRead(identity);
    if (!access.ok) return failure(401, access.reason);
    if (!safeHandle(sessionHandle)) return failure(404, "session-not-found");
    this.pruneReadHandles();
    let beforeIndex: number | undefined;
    let limit = INITIAL_HISTORY_ENTRY_LIMIT;
    if (cursor !== undefined) {
      if (!/^history-[A-Za-z0-9_-]{32,128}$/.test(cursor)) return failure(400, "history-cursor-malformed");
      const state = this.historyCursors.get(cursor);
      if (!state) return failure(400, "history-cursor-invalid");
      if (state.expiresAt <= this.nowMs()) { this.historyCursors.delete(cursor); return failure(410, "history-cursor-expired"); }
      if (state.sessionHandle !== sessionHandle || state.clientId !== access.sessionId) return failure(403, "history-cursor-scope-denied");
      this.historyCursors.delete(cursor); // continuations are one-use
      beforeIndex = state.beforeIndex;
      limit = CONTINUATION_HISTORY_ENTRY_LIMIT;
    }
    let page: Awaited<ReturnType<ReadonlyJsonlBrowser["readBranchPage"]>>;
    try { page = await this.browser.readBranchPage(sessionHandle, beforeIndex, limit); }
    catch { return failure(404, "session-not-found"); }

    let admittedMediaBytes = 0;
    const mediaByRecord = new Map<number, Array<{ id: string; label: string; mimeType: string; url: string }>>();
    for (const candidate of page.images) {
      const image = validateHistoricalToolImage(candidate);
      if (!image || admittedMediaBytes + image.bytes.byteLength > TOOL_RESULT_IMAGE_PAGE_MAX_BYTES) continue;
      admittedMediaBytes += image.bytes.byteLength;
      const mediaHandle = `media-${randomBytes(24).toString("base64url")}`;
      this.mediaHandles.set(mediaHandle, { clientId: access.sessionId, bytes: image.bytes, mimeType: image.mimeType, expiresAt: this.nowMs() + HISTORY_CURSOR_TTL_MS });
      const previews = mediaByRecord.get(candidate.recordIndex) ?? [];
      if (previews.length >= 10) { this.mediaHandles.delete(mediaHandle); admittedMediaBytes -= image.bytes.byteLength; continue; }
      previews.push({ id: mediaHandle, label: `tool result image ${candidate.blockIndex + 1}`, mimeType: image.mimeType, url: `/api/runtime/v1/media/${mediaHandle}` });
      mediaByRecord.set(candidate.recordIndex, previews);
    }
    const timeline = Object.freeze(page.records.map((record) => Object.freeze({
      id: `${sessionHandle}:entry-${record.index}`,
      kind: record.role === "user" ? "user" : record.role === "assistant" ? "assistant" : record.role === "tool" ? "tool" : "event",
      status: "complete",
      title: record.role ?? record.type,
      ...(record.content ? { body: record.content.replace(/[\r\0]+/g, " ").slice(0, 32_768) } : {}),
      ...(record.timestamp ? { at: record.timestamp } : {}),
      ...(mediaByRecord.has(record.index) ? { media: Object.freeze(mediaByRecord.get(record.index)!) } : {}),
    })) as WorkbenchHistoryV1["timeline"]);
    let nextCursor: string | undefined;
    if (page.hasMore && page.oldestIndex !== null) {
      nextCursor = `history-${randomBytes(24).toString("base64url")}`;
      this.historyCursors.set(nextCursor, { sessionHandle, clientId: access.sessionId, beforeIndex: page.oldestIndex, expiresAt: this.nowMs() + HISTORY_CURSOR_TTL_MS });
      while (this.historyCursors.size > 4_096) this.historyCursors.delete(this.historyCursors.keys().next().value!);
    }
    return { status: 200, headers: PRIVATE_HEADERS, body: Object.freeze({ schemaVersion: 1, sessionHandle, timeline, hasMore: page.hasMore, ...(nextCursor ? { cursor: nextCursor } : {}) }) };
  }

  public configuration(identity: WebRequestIdentity): GatewayResponse<unknown> {
    const access = this.lifecycle.authorizeLoopbackRead(identity);
    if (!access.ok) return failure(401, access.reason);
    if (!this.configurationHost) return failure(503, "configuration-runtime-unavailable");
    return { status: 200, headers: PRIVATE_HEADERS, body: this.configurationHost.snapshot };
  }

  public media(identity: WebRequestIdentity, mediaHandle: string): GatewayResponse<Uint8Array | { readonly error: string }> {
    const access = this.lifecycle.authorizeLoopbackRead(identity);
    if (!access.ok) return failure(401, access.reason);
    if (!/^media-[A-Za-z0-9_-]{32,128}$/.test(mediaHandle)) return failure(400, "media-handle-malformed");
    const media = this.mediaHandles.get(mediaHandle);
    if (!media) return failure(404, "media-not-found");
    if (media.expiresAt <= this.nowMs()) { this.mediaHandles.delete(mediaHandle); return failure(410, "media-handle-expired"); }
    if (media.clientId !== access.sessionId) return failure(403, "media-handle-scope-denied");
    return { status: 200, body: media.bytes, headers: { ...PRIVATE_HEADERS, "Content-Type": media.mimeType, "Content-Length": String(media.bytes.byteLength) } };
  }

  private nowMs(): number { return (this.options.now?.() ?? new Date()).getTime(); }
  private pruneReadHandles(): void {
    const now = this.nowMs();
    // Expired cursors remain distinguishable from malformed/unknown cursors
    // until consumed or bounded-map eviction; media is safe to discard eagerly.
    for (const [handle, state] of this.mediaHandles) if (state.expiresAt <= now) this.mediaHandles.delete(handle);
    while (this.mediaHandles.size > 4_096) this.mediaHandles.delete(this.mediaHandles.keys().next().value!);
  }

  private ensureHost(handle: string): Promise<SessionRuntimeMetadata | undefined> {
    const existing = this.sessions.get(handle);
    if (existing) return Promise.resolve(existing);
    if (!safeHandle(handle)) return Promise.resolve(undefined);
    const loading = this.loadingSessions.get(handle);
    if (loading) return loading;
    const created = this.createHost(handle).finally(() => this.loadingSessions.delete(handle));
    this.loadingSessions.set(handle, created);
    return created;
  }

  private async createHost(handle: string): Promise<SessionRuntimeMetadata | undefined> {
    if (this.disposed) throw new Error("foreground Runtime composition is closed");
    const registered = this.registry.get(handle);
    if (registered) await this.registry.dispose(handle);
    const privatePath = this.browser.privatePathForHandle(handle);
    if (!privatePath) return undefined;
    await this.browser.read(handle);
    let manager: SessionManager;
    try { manager = this.managerOpen(privatePath); } catch { return undefined; }
    const recordedCwd = manager.getCwd();
    const cwd = recordedCwd && isAbsolute(recordedCwd) ? resolve(recordedCwd) : "";
    let rootGrant: AllowedPathGrant | undefined;
    if (cwd) try { rootGrant = await this.rootPolicy.grant(cwd, { mustExist: true }); } catch { /* empty/outside roots remain browse-only */ }
    const privateIdentity = manager.getSessionId();
    if (!privateIdentity || privateIdentity.length > 512 || privateIdentity.includes("\0")) return undefined;
    const currentLeaf = safeLeaf(manager.getLeafId());
    const capabilities = rootGrant ? CAPABILITIES : readOnlyCapabilities();
    let metadata: SessionRuntimeMetadata;
    const host = this.registry.create(privateIdentity, {
      piVersion: OFFICIAL_PI_VERSION,
      runtimeDirectory: this.options.runtimeDirectory,
      sessionHandle: handle,
      now: this.options.now,
      lease: {
        processIdentity: this.processIdentity,
        livenessEndpointId: this.livenessServer!.endpointId,
        isProcessAlive: isExactProcessAlive,
        probeLiveness: (endpointId, generation) => probeOwnerProcessLiveness(this.options.runtimeDirectory, endpointId, generation),
        markInterrupted: (record) => markLeaseInterrupted(this.options.runtimeDirectory, record),
      },
      agentSessionFactory: { create: async () => {
        const session = await this.createOfficialSession(privatePath);
        try { metadata.officialUnsubscribe = session.onEvent((event) => this.projectOfficialEvent(metadata, session, event.type)); }
        catch (error) { await session.dispose(); throw error; }
        return session;
      } },
      initialSnapshot: {
        state: "idle",
        capabilities,
        projection: {
          pi: {
            provider: null,
            model: null,
            thinkingLevel: null,
            contextTokens: null,
            contextWindow: null,
            activeRun: false,
            leafId: currentLeaf,
          },
          agent: { tasks: [] },
          mcp: { servers: [] },
        },
      },
    });
    try { await host.initialize(); }
    catch (error) { await this.registry.dispose(handle).catch(() => undefined); throw error; }
    metadata = { handle, privatePath, privateIdentity, cwd, host, currentLeaf, ...(rootGrant ? { rootGrant } : {}) };
    if (this.disposed) { await this.registry.dispose(handle); return undefined; }
    this.sessions.set(handle, metadata);
    return metadata;
  }

  /**
   * Read paths may create a bounded projection, but never become a writer
   * merely because a browser viewed, replayed, or streamed the session.
   */
  private prepareSession(handle: string, requireWebWriter: boolean): Promise<PrepareSessionResult> {
    const key = `${requireWebWriter ? "write" : "read"}:${handle}`;
    const pending = this.preparingSessions.get(key);
    if (pending) return pending;
    const prepared = this.prepareSessionOnce(handle, requireWebWriter).finally(() => this.preparingSessions.delete(key));
    this.preparingSessions.set(key, prepared);
    return prepared;
  }

  private async prepareSessionOnce(handle: string, requireWebWriter: boolean): Promise<PrepareSessionResult> {
    if (this.disposed) return { ok: false, response: failure(503, "runtime-composition-closed") };
    let metadata: SessionRuntimeMetadata | undefined;
    try { metadata = await this.ensureHost(handle); }
    catch { return { ok: false, response: failure(503, "session-runtime-unavailable") }; }
    if (!metadata) return { ok: false, response: failure(404, "session-not-found") };
    let holder: Awaited<ReturnType<RuntimeHost<ForegroundAgentSession>["inspectWriter"]>>;
    try { holder = await metadata.host.inspectWriter(); }
    catch { return { ok: false, response: failure(503, "session-writer-unverified") }; }
    if (holder?.owner === "tui") {
      return { ok: false, response: failure(409, "session-owned-outside-web-runtime") };
    }
    if (holder?.owner === "web" && metadata.host.snapshot.writer.owner !== "web") {
      return { ok: false, response: failure(409, "session-writer-owned-by-another-web-runtime") };
    }
    // A lease is a mutation admission resource, not a browse-side effect.
    // This preserves TUI first-writer eligibility until a Web mutation arrives.
    if (!requireWebWriter || !metadata.rootGrant) return { ok: true };
    const ownership: LeaseAcquireResult = await metadata.host.acquireWriter("web").catch((): LeaseAcquireResult => ({ acquired: false, reason: "unverified" }));
    if (ownership.acquired) return { ok: true };
    if (ownership.holder?.owner === "tui") return { ok: false, response: failure(409, "session-owned-outside-web-runtime") };
    return { ok: false, response: failure(409, `session-writer-unavailable-${ownership.reason}`) };
  }

  private admitMutation(envelope: MutationEnvelopeV1) {
    if (!this.disposed && envelope.sessionHandle === this.configurationHost?.sessionHandle) {
      const allowed = isConfigurationCommand(envelope.capability, envelope.commandType);
      return {
        rootAuthorized: true,
        permissionGranted: allowed && this.configurationHost.snapshot.writer.owner === "web",
        capabilityAllowed: allowed && this.configurationHost.snapshot.capabilities[envelope.capability] === true,
        currentSessionLeaf: "configuration",
        revalidate: (): true | string => this.disposed || this.configurationHost?.snapshot.writer.owner !== "web"
          ? "configuration-runtime-unavailable" : true,
      };
    }
    const metadata = this.disposed ? undefined : this.sessions.get(envelope.sessionHandle);
    const commandAllowed = isAdvertisedCommand(envelope.capability, envelope.commandType);
    return {
      rootAuthorized: metadata?.rootGrant !== undefined,
      permissionGranted: commandAllowed && metadata?.host.snapshot.writer.owner === "web",
      capabilityAllowed: commandAllowed && metadata?.host.snapshot.capabilities[envelope.capability] === true,
      currentSessionLeaf: metadata?.currentLeaf ?? "leaf-unavailable",
      revalidate: async (): Promise<true | string> => {
        if (this.disposed) return "runtime-composition-closed";
        if (!metadata?.rootGrant) return "allowed-root-denied";
        try {
          const currentGrant = await this.rootPolicy.grant(metadata.cwd, { mustExist: true });
          if (currentGrant.allowedRoot !== metadata.rootGrant.allowedRoot) return "allowed-root-changed";
          if (!metadata.transient) await this.browser.read(metadata.handle);
          const currentLeaf = metadata.transient
            ? metadata.currentLeaf
            : safeLeaf(this.managerOpen(metadata.privatePath).getLeafId());
          if (currentLeaf !== metadata.currentLeaf) return "session-leaf-changed";
          return true;
        } catch { return "operation-revalidation-failed"; }
      },
    };
  }

  private projectOfficialEvent(metadata: SessionRuntimeMetadata, session: ForegroundAgentSession, eventType: string): void {
    if (this.disposed || !this.sessions.has(metadata.handle)) return;
    const inner = session.inner;
    metadata.currentLeaf = safeLeaf(inner.sessionManager.getLeafId());
    const running = session.isRunning();
    const usage = inner.getContextUsage();
    if (metadata.host.snapshot.writer.owner === "web") {
      void metadata.host.heartbeatWriter(running, running ? `agent-${metadata.handle}` : undefined).catch(() => false);
    }
    try {
      metadata.host.project("official-pi", running ? "running" : "idle", {
        pi: {
          provider: inner.model?.provider ?? null,
          model: inner.model?.id ?? null,
          thinkingLevel: inner.agent.state?.thinkingLevel ?? "off",
          contextTokens: usage?.tokens ?? null,
          contextWindow: usage?.contextWindow ?? null,
          activeRun: running,
          leafId: metadata.currentLeaf,
        },
        officialEvent: boundedEventType(eventType),
      });
    } catch { /* host disposal wins over late official events */ }
  }

  private async executeMutation(session: ForegroundAgentSession, envelope: MutationEnvelopeV1): Promise<MutationExecutionResult> {
    if (this.disposed) throw new Error("runtime-composition-closed");
    if (envelope.sessionHandle === this.configurationHost?.sessionHandle) {
      return (session as unknown as ConfigurationMutationService).execute(envelope.capability, envelope.commandType, envelope.arguments);
    }
    const execution = await dispatchOfficialPiMutation(session, envelope);
    if (envelope.capability === "pi.fork" || envelope.capability === "session.safe_delete") {
      const handle = envelope.sessionHandle;
      const timer = setTimeout(() => {
        const metadata = this.sessions.get(handle);
        try { metadata?.officialUnsubscribe?.(); } catch { /* closing session already won */ }
        if (metadata) this.rawSessionHandles.delete(metadata.privateIdentity);
        this.sessions.delete(handle);
        void this.registry.dispose(handle).catch(() => undefined);
      }, 0);
      timer.unref();
      return execution;
    }
    const metadata = this.sessions.get(envelope.sessionHandle);
    if (!metadata || metadata.host.snapshot.writer.owner !== "web") return execution;
    const inner = session.inner;
    metadata.currentLeaf = safeLeaf(inner.sessionManager.getLeafId());
    const usage = inner.getContextUsage();
    if (this.disposed) return execution;
    metadata.host.project("official-pi", session.isRunning() ? "running" : "idle", {
      pi: {
        provider: inner.model?.provider ?? null,
        model: inner.model?.id ?? null,
        thinkingLevel: inner.agent.state?.thinkingLevel ?? "off",
        contextTokens: usage?.tokens ?? null,
        contextWindow: usage?.contextWindow ?? null,
        activeRun: session.isRunning(),
        leafId: metadata.currentLeaf,
      },
    });
    return execution;
  }
}

/** Exhaustive public-Pi dispatcher for the exact capability matrix above. */
export async function dispatchOfficialPiMutation(session: ForegroundAgentSession, envelope: MutationEnvelopeV1): Promise<MutationExecutionResult> {
  if (!isAdvertisedCommand(envelope.capability, envelope.commandType)) throw new Error("unsupported-runtime-command");
  const args = envelope.arguments;
  if (envelope.capability === "pi.send" && envelope.commandType === "send") {
    const message = boundedMessage(args.message, true);
    const images = boundedImages(args.images);
    if (!message.trim() && images.length === 0) throw new Error("message-invalid");
    await session.send({ type: "prompt", message, ...(images.length ? { images } : {}) });
    return { activeTurnContinues: session.isRunning() };
  }
  if (envelope.capability === "pi.follow_up" && envelope.commandType === "follow_up") {
    const images = boundedImages(args.images);
    await session.send({ type: "follow_up", message: boundedQueuedMessage(args.message), ...(images.length ? { images } : {}) });
    return { activeTurnContinues: session.isRunning() };
  }
  if (envelope.capability === "pi.steer" && envelope.commandType === "steer") {
    const images = boundedImages(args.images);
    await session.send({ type: "steer", message: boundedQueuedMessage(args.message), ...(images.length ? { images } : {}) });
    return { activeTurnContinues: session.isRunning() };
  }
  if (envelope.capability === "pi.compact" && envelope.commandType === "compact") {
    const instructions = args.instructions === undefined ? undefined : boundedMessage(args.instructions, true);
    const result = await session.send({ type: "compact", ...(instructions === undefined ? {} : { customInstructions: instructions }) });
    if (result !== undefined) assertBoundedJson(result);
    return { activeTurnContinues: session.isRunning(), ...(result === undefined ? {} : { result }) };
  }
  if (envelope.capability === "pi.abort" && (envelope.commandType === "abort" || envelope.commandType === "abort_compaction")) {
    await session.send({ type: envelope.commandType });
    return {};
  }
  if (envelope.capability === "pi.bash" && envelope.commandType === "bash") {
    const command = boundedMessage(args.command).trim();
    const excludeFromContext = args.excludeFromContext === true;
    const result = await session.send({ type: "bash", command, excludeFromContext });
    if (result !== undefined) assertBoundedJson(result);
    return result === undefined ? {} : { result };
  }
  if (envelope.capability === "pi.bash" && envelope.commandType === "abort_bash") {
    await session.send({ type: "abort_bash" });
    return {};
  }
  if (envelope.capability === "pi.queue" && envelope.commandType === "clear_queue") {
    const result = await session.send({ type: "clear_queue" });
    if (!isOfficialClearQueueResult(result)) throw new Error("clear-queue-result-invalid");
    const officialResult = Object.freeze({
      steering: Object.freeze([...result.steering]),
      followUp: Object.freeze([...result.followUp]),
    });
    assertBoundedJson(officialResult);
    return { result: officialResult };
  }
  if (envelope.capability === "pi.tools" && envelope.commandType === "set_tools") {
    if (!Array.isArray(args.toolNames) || !args.toolNames.every((name) => typeof name === "string" && name.length <= 128 && !/[\r\n\0]/.test(name))) {
      throw new Error("tool-selection-invalid");
    }
    await session.send({ type: "set_tools", toolNames: args.toolNames });
    return {};
  }
  if (envelope.capability === "session.reload" && envelope.commandType === "reload") {
    await session.send({ type: "reload" });
    return {};
  }
  if (envelope.capability === "permission.mode" && envelope.commandType === "set_perm_mode") {
    const mode = boundedMessage(args.mode).trim();
    await session.send({ type: "set_perm_mode", mode });
    return {};
  }
  if (envelope.capability === "provider.retry" && envelope.commandType === "set_auto_retry") {
    if (typeof args.enabled !== "boolean") throw new Error("auto-retry-setting-invalid");
    await session.send({ type: "set_auto_retry", enabled: args.enabled });
    return {};
  }
  if (envelope.capability === "extension.interact" && (envelope.commandType === "respond" || envelope.commandType === "input")) {
    const command = publicRecord(args.command);
    if (!command) throw new Error("extension-interaction-invalid");
    const expectedType = envelope.commandType === "respond" ? "extension_ui_response" : "extension_ui_input";
    if (command.type !== expectedType) throw new Error("extension-interaction-invalid");
    const result = await session.send({ ...command });
    if (result !== undefined) assertBoundedJson(result);
    return result === undefined ? {} : { result };
  }
  if (envelope.capability === "pi.compact" && envelope.commandType === "set_auto_compaction") {
    if (typeof args.enabled !== "boolean") throw new Error("auto-compaction-setting-invalid");
    await session.send({ type: "set_auto_compaction", enabled: args.enabled });
    return {};
  }
  if (envelope.capability === "pi.branch" && envelope.commandType === "branch") {
    const targetId = boundedMessage(args.targetId).trim();
    const result = await session.send({ type: "navigate_tree", targetId });
    if (result !== undefined) assertBoundedJson(result);
    return result === undefined ? {} : { result };
  }
  if (envelope.capability === "pi.fork" && envelope.commandType === "fork") {
    const entryId = boundedMessage(args.entryId).trim();
    const result = await session.send({ type: "fork", entryId });
    if (result !== undefined) assertBoundedJson(result);
    return result === undefined ? {} : { result };
  }
  if (envelope.capability === "pi.thinking" && envelope.commandType === "select_thinking") {
    const level = args.thinkingLevel;
    if (level !== "off" && level !== "minimal" && level !== "low" && level !== "medium" && level !== "high" && level !== "xhigh" && level !== "max") {
      throw new Error("thinking-level-invalid");
    }
    await session.send({ type: "set_thinking_level", level: level as ThinkingLevel });
    return {};
  }
  if (envelope.capability === "pi.model" && envelope.commandType === "select_model") {
    const provider = boundedMessage(args.provider).trim();
    const modelId = boundedMessage(args.modelId).trim();
    await session.send({ type: "set_model", provider, modelId });
    return {};
  }
  if (envelope.capability === "session.rename" && envelope.commandType === "auto_name") {
    const result = await session.send({ type: "auto_name" });
    const record = unknownRecord(result);
    const title = record?.title;
    if (typeof title !== "string" || !title.trim() || title.length > 80) throw new Error("auto-name-result-invalid");
    assertBoundedJson(record);
    return { result: record };
  }
  if (envelope.capability === "session.rename" && envelope.commandType === "rename") {
    const name = boundedMessage(args.name).trim();
    if (!name || name.length > 200) throw new Error("session-name-invalid");
    await session.send({ type: "set_session_name", name });
    return {};
  }
  if (envelope.capability === "session.safe_delete" && envelope.commandType === "safe_delete") {
    const result = await session.send({ type: "safe_delete" });
    if (result !== undefined) assertBoundedJson(result);
    return result === undefined ? {} : { result };
  }
  const exhaustive: never = envelope.capability as never;
  throw new Error(`unsupported-runtime-command-${String(exhaustive)}`);
}

function validateHistoricalToolImage(candidate: JsonlImageCandidateV1): { readonly bytes: Uint8Array; readonly mimeType: string } | null {
  if (!TOOL_RESULT_IMAGE_MIMES.has(candidate.mimeType) || candidate.data.length === 0
    || candidate.data.length > Math.ceil(TOOL_RESULT_IMAGE_MAX_BYTES * 4 / 3) + 4
    || candidate.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(candidate.data)) return null;
  const buffer = Buffer.from(candidate.data, "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > TOOL_RESULT_IMAGE_MAX_BYTES || buffer.toString("base64") !== candidate.data) return null;
  const dimensions = imageDimensions(buffer, candidate.mimeType);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1
    || dimensions.width > TOOL_RESULT_IMAGE_MAX_DIMENSION || dimensions.height > TOOL_RESULT_IMAGE_MAX_DIMENSION
    || dimensions.width * dimensions.height > TOOL_RESULT_IMAGE_MAX_PIXELS) return null;
  return { bytes: new Uint8Array(buffer), mimeType: candidate.mimeType };
}

function imageDimensions(bytes: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === "image/gif") {
    if (bytes.length < 10 || (bytes.toString("ascii", 0, 6) !== "GIF87a" && bytes.toString("ascii", 0, 6) !== "GIF89a")) return null;
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (mimeType === "image/webp") {
    if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === "VP8L" && bytes[20] === 0x2f && bytes.length >= 25) {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    return null;
  }
  if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 8 < bytes.length) {
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        if (length < 7) return null;
        return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
  }
  return null;
}

export async function createProductionForegroundComposition(identity: Uint8Array): Promise<ForegroundRuntimeComposition> {
  if (!(identity instanceof Uint8Array) || identity.byteLength !== 32 || identity.every((byte) => byte === 0)) {
    throw new Error("foreground Runtime identity was rejected");
  }
  const privateSalt = createHash("sha256").update(identity).update("foreground-runtime-v1").digest("base64url");
  const expectedHostname = hostNameFromExpected(process.env.PI_WEB_EXPECTED_HOST);
  const configuredHostname = process.env.PI_WEB_HOSTNAME?.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (expectedHostname && configuredHostname && expectedHostname !== configuredHostname) throw new Error("foreground Runtime host policy mismatch");
  const hostname = configuredHostname ?? expectedHostname ?? "127.0.0.1";
  if (process.env.PORT !== undefined && numericPort(process.env.PORT) === undefined) throw new Error("foreground Runtime port is invalid");
  const expectedPort = portFromExpected(process.env.PI_WEB_EXPECTED_HOST);
  const environmentPort = numericPort(process.env.PORT);
  if (expectedPort && environmentPort && expectedPort !== environmentPort) throw new Error("foreground Runtime port policy mismatch");
  const port = expectedPort ?? environmentPort ?? 30141;
  const roots = parseCanonicalRoots(process.env.PI_WEB_CANONICAL_ALLOWED_ROOTS ?? process.env.PI_WEB_ALLOWED_ROOTS);
  const accessPhrase = process.env.PI_WEB_PASSWORD;
  const policy = validateWebListenPolicy({
    hostname,
    port,
    expectedHost: process.env.PI_WEB_EXPECTED_HOST,
    expectedOrigin: process.env.PI_WEB_EXPECTED_ORIGIN,
    allowedRoots: roots,
    accessPhrase,
    protocol: process.env.PI_WEB_EXPECTED_ORIGIN?.startsWith("https:") ? "https" : "http",
  });
  const agentDirectory = resolve(getAgentDir());
  const configuredSessionDirectory = process.env.PI_CODING_AGENT_SESSION_DIR;
  if (configuredSessionDirectory && !isAbsolute(configuredSessionDirectory)) throw new Error("Pi session directory must be absolute");
  const sessionRoots = [configuredSessionDirectory ? resolve(configuredSessionDirectory) : join(agentDirectory, "sessions")];
  delete process.env.PI_WEB_PASSWORD;
  delete process.env.PI_WEB_CANONICAL_ALLOWED_ROOTS;
  delete process.env.PI_WEB_ALLOWED_ROOTS;
  return ForegroundRuntimeComposition.create({
    policy,
    accessPhrase,
    runtimeDirectory: join(agentDirectory, ".aili-runtime"),
    sessionRoots,
    privateSalt,
  });
}


function sessionCatalogEntry(descriptor: JsonlSessionDescriptorV1, messageCount: number | undefined, projectHandle: string, canWrite: boolean, running: boolean): WorkbenchSessionV1 {
  return Object.freeze({
    handle: descriptor.sessionHandle,
    projectHandle,
    name: descriptor.label,
    modifiedAt: descriptor.modifiedAt,
    messageCount: messageCount ?? 0,
    running,
    actions: Object.freeze({ resume: true, rename: canWrite, export: false, safeDelete: false, branch: false, fork: false }),
    timeline: Object.freeze([]),
  });
}

function safeLeaf(value: string | null): string { return value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : "leaf-empty"; }
function boundedEventType(value: string): string { return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 96) || "event"; }
function readOnlyCapabilities(): Readonly<Record<string, boolean>> {
  return Object.freeze(Object.fromEntries(Object.keys(CAPABILITIES).map((capability) => [capability, capability === "session.observe"])));
}
function isAdvertisedCommand(capability: string, command: string): boolean {
  const commands = FOREGROUND_PI_COMMANDS[capability as keyof typeof FOREGROUND_PI_COMMANDS] as readonly string[] | undefined;
  return commands?.includes(command) === true;
}
function boundedMessage(value: JsonValue | undefined, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > 32_768 || /\0/.test(value) || (!allowEmpty && !value.trim())) throw new Error("message-invalid");
  return value;
}
function boundedQueuedMessage(value: JsonValue | undefined): string {
  const message = boundedMessage(value);
  if (message.length > 4_096) throw new Error("queued-message-too-long");
  return message;
}
function isOfficialClearQueueResult(value: unknown): value is { steering: string[]; followUp: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as { steering?: unknown; followUp?: unknown };
  return Array.isArray(result.steering) && result.steering.length <= 100
    && result.steering.every((message) => typeof message === "string" && message.length <= 4_096)
    && Array.isArray(result.followUp) && result.followUp.length <= 100
    && result.followUp.every((message) => typeof message === "string" && message.length <= 4_096);
}
function boundedImages(value: JsonValue | undefined): ImageContent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error("image-content-invalid");
  let totalBytes = 0;
  return value.map((item) => {
    if (!publicRecord(item) || item.type !== "image" || typeof item.data !== "string"
      || (item.mimeType !== "image/png" && item.mimeType !== "image/jpeg" && item.mimeType !== "image/webp" && item.mimeType !== "image/gif")
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data) || item.data.length > 65_536) throw new Error("image-content-invalid");
    const bytes = Buffer.from(item.data, "base64");
    totalBytes += bytes.byteLength;
    if (bytes.byteLength === 0 || bytes.toString("base64") !== item.data || totalBytes > 96 * 1024) throw new Error("image-content-invalid");
    return { type: "image", data: item.data, mimeType: item.mimeType } satisfies ImageContent;
  });
}
function compatibilityMutationOf(request: AiliCompatibilityMutationRequest): {
  capability: string;
  commandType: string;
  arguments: Readonly<Record<string, JsonValue>>;
} | undefined {
  if (request.kind === "session.rename") {
    const name = typeof request.arguments.name === "string" ? request.arguments.name.trim() : "";
    return name && name.length <= 200 && !/[\r\n\0]/.test(name)
      ? { capability: "session.rename", commandType: "rename", arguments: { name } }
      : undefined;
  }
  if (request.kind === "session.auto_name") {
    return { capability: "session.rename", commandType: "auto_name", arguments: {} };
  }
  if (request.kind === "session.delete") {
    return { capability: "session.safe_delete", commandType: "safe_delete", arguments: {} };
  }
  const command = unknownRecord(request.arguments.command);
  const type = typeof command?.type === "string" ? command.type : "";
  const message = typeof command?.message === "string" ? command.message : "";
  const images = Array.isArray(command?.images) ? command.images as JsonValue : undefined;
  if (type === "prompt") {
    const behavior = command?.streamingBehavior;
    if (behavior === "steer") return { capability: "pi.steer", commandType: "steer", arguments: { message, ...(images ? { images } : {}) } };
    if (behavior === "followUp") return { capability: "pi.follow_up", commandType: "follow_up", arguments: { message, ...(images ? { images } : {}) } };
    return { capability: "pi.send", commandType: "send", arguments: { message, ...(images ? { images } : {}) } };
  }
  if (type === "steer" || type === "follow_up") {
    return { capability: type === "steer" ? "pi.steer" : "pi.follow_up", commandType: type, arguments: { message, ...(images ? { images } : {}) } };
  }
  if (type === "compact") {
    const instructions = typeof command?.customInstructions === "string" ? command.customInstructions : undefined;
    return { capability: "pi.compact", commandType: "compact", arguments: instructions === undefined ? {} : { instructions } };
  }
  if (type === "abort" || type === "abort_compaction") {
    return { capability: "pi.abort", commandType: type, arguments: {} };
  }
  if (type === "bash" && typeof command?.command === "string") {
    return { capability: "pi.bash", commandType: "bash", arguments: { command: command.command, excludeFromContext: command.excludeFromContext === true } };
  }
  if (type === "abort_bash") return { capability: "pi.bash", commandType: "abort_bash", arguments: {} };
  if (type === "reload") return { capability: "session.reload", commandType: "reload", arguments: {} };
  if (type === "clear_queue") return { capability: "pi.queue", commandType: "clear_queue", arguments: {} };
  if (type === "set_tools" && Array.isArray(command?.toolNames)) {
    return { capability: "pi.tools", commandType: "set_tools", arguments: { toolNames: command.toolNames as JsonValue } };
  }
  if (type === "set_auto_compaction" && typeof command?.enabled === "boolean") {
    return { capability: "pi.compact", commandType: "set_auto_compaction", arguments: { enabled: command.enabled } };
  }
  if (type === "set_perm_mode" && typeof command?.mode === "string") {
    return { capability: "permission.mode", commandType: "set_perm_mode", arguments: { mode: command.mode } };
  }
  if (type === "set_auto_retry" && typeof command?.enabled === "boolean") {
    return { capability: "provider.retry", commandType: "set_auto_retry", arguments: { enabled: command.enabled } };
  }
  if (type === "extension_ui_response" || type === "extension_ui_input") {
    assertBoundedJson(command);
    return { capability: "extension.interact", commandType: type === "extension_ui_response" ? "respond" : "input", arguments: { command } };
  }
  if (type === "navigate_tree" && typeof command?.targetId === "string") {
    return { capability: "pi.branch", commandType: "branch", arguments: { targetId: command.targetId } };
  }
  if (type === "fork" && typeof command?.entryId === "string") {
    return { capability: "pi.fork", commandType: "fork", arguments: { entryId: command.entryId } };
  }
  if (type === "set_thinking_level" && typeof command?.level === "string") {
    return { capability: "pi.thinking", commandType: "select_thinking", arguments: { thinkingLevel: command.level } };
  }
  if (type === "set_model" && typeof command?.provider === "string" && typeof command?.modelId === "string") {
    return { capability: "pi.model", commandType: "select_model", arguments: { provider: command.provider, modelId: command.modelId } };
  }
  if (type === "set_session_name" && typeof command?.name === "string") {
    return { capability: "session.rename", commandType: "rename", arguments: { name: command.name } };
  }
  return undefined;
}

function identityOf(request: AiliBffHttpRequest): WebRequestIdentity { return { host: request.host, origin: request.origin, cookie: request.cookie }; }
function sessionHandleFrom(request: AiliBffHttpRequest, terminal: "connect" | "stream"): string | undefined {
  return request.method === "GET" && request.segments.length === 3 && request.segments[0] === "sessions"
    && request.segments[2] === terminal && safeHandle(request.segments[1]) ? request.segments[1] : undefined;
}
function safeHandle(value: string | undefined): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
function publicRecord(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, JsonValue>>)
    : undefined;
}
function unknownRecord(value: unknown): Readonly<Record<string, unknown>> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function failure(status: number, error: string): GatewayResponse<{ readonly error: string }> { return { status, body: { error }, headers: PRIVATE_HEADERS }; }
function opaqueHandle(kind: string, salt: string, value: string): string { return `${kind}-${createHash("sha256").update(salt).update("\0").update(value).digest("base64url").slice(0, 32)}`; }
function parseCanonicalRoots(value: string | undefined): readonly string[] {
  if (!value) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("canonical allowed roots are malformed"); }
  if (!Array.isArray(parsed) || parsed.some((root) => typeof root !== "string" || !isAbsolute(root) || resolve(root) !== root)) throw new Error("canonical allowed roots are invalid");
  return Object.freeze([...new Set(parsed)]);
}
function numericPort(value: string | undefined): number | undefined {
  if (!value || !/^\d{1,5}$/.test(value)) return undefined;
  const port = Number(value);
  return port >= 1 && port <= 65_535 ? port : undefined;
}
function portFromExpected(value: string | undefined): number | undefined { const match = value?.match(/:(\d{1,5})$/); return numericPort(match?.[1]); }
function hostNameFromExpected(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ipv6 = /^\[([^\]]+)\]:\d+$/.exec(value);
  if (ipv6) return ipv6[1];
  return value.replace(/:\d+$/, "");
}
export function pathContained(root: string, target: string): boolean {
  const nested = relative(root, target);
  return nested === "" || (nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested));
}
