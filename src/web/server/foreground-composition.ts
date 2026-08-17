import { createHash } from "node:crypto";
import { getAgentDir, createAgentSession, AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
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
import type { JsonValue, MutationEnvelopeV1, RuntimeEventV1, RuntimeSnapshotV1 } from "../../runtime/web/contracts.js";
import { ReadonlyJsonlBrowser, type JsonlProjectionRecordV1, type JsonlSessionDescriptorV1 } from "../../runtime/web/jsonl-browser.js";
import { connectProjectionObserver, type ProjectionObserver } from "../../runtime/web/projection-channel.js";
import {
  OwnerOnlyProcessLivenessServer,
  currentProcessIdentity,
  isExactProcessAlive,
  markLeaseInterrupted,
  probeOwnerProcessLiveness,
} from "../../runtime/web/process-liveness.js";
import { RuntimeHost, RuntimeHostRegistry } from "../../runtime/web/runtime-host.js";
import type { LeaseAcquireResult } from "../../runtime/web/session-writer-lease.js";
import type { WorkbenchCatalogV1, WorkbenchHistoryV1, WorkbenchProjectV1, WorkbenchSessionV1 } from "../contracts.js";
import {
  PrivateWebBffBridge,
  type AiliBffHttpRequest,
  type AiliWebBffBridge,
} from "./private-bff-bridge.js";

const OFFICIAL_PI_VERSION = "0.84.1" as const;
/** Most recent JSONL entries served by the per-session history route. */
const HISTORY_ENTRY_LIMIT = 500;
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
  "pi.compact": Object.freeze(["compact"]),
  "pi.thinking": Object.freeze(["select_thinking"]),
  "session.rename": Object.freeze(["rename"]),
} as const);

const CAPABILITIES = Object.freeze({
  "session.observe": true,
  "pi.send": true,
  "pi.follow_up": true,
  "pi.steer": true,
  "pi.compact": true,
  "pi.thinking": true,
  "session.rename": true,
  "session.create": false,
  "session.safe_delete": false,
  "pi.branch": false,
  "pi.fork": false,
  "pi.model": false,
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
  readonly createOfficialSession?: (path: string) => Promise<AgentSession>;
  readonly connectObserver?: typeof connectProjectionObserver;
  readonly processIdentity?: ReturnType<typeof currentProcessIdentity>;
  readonly livenessServer?: OwnerOnlyProcessLivenessServer;
}

type PrepareSessionResult = { readonly ok: true } | { readonly ok: false; readonly response: GatewayResponse<{ readonly error: string }> };

interface SessionRuntimeMetadata {
  readonly handle: string;
  readonly privatePath: string;
  readonly privateIdentity: string;
  readonly cwd: string;
  readonly host: RuntimeHost<AgentSession>;
  readonly rootGrant?: AllowedPathGrant;
  currentLeaf: string;
  observer?: ProjectionObserver;
  officialUnsubscribe?: () => void;
}

/**
 * Production composition root installed by Next instrumentation.register(). It
 * is the only code that joins auth, read-only JSONL, RuntimeHost, Pi SDK, BFF,
 * projection observation, dispatcher, and ordered event-stream ownership.
 */
export class ForegroundRuntimeComposition implements AiliWebBffBridge {
  readonly registry = new RuntimeHostRegistry<AgentSession>();
  readonly lifecycle: WebAccessLifecycle;
  readonly bff: PrivateWebBff<AgentSession>;
  private readonly inner: PrivateWebBffBridge<AgentSession>;
  private readonly browser: ReadonlyJsonlBrowser;
  private readonly rootPolicy: CanonicalAllowedRootPolicy;
  private readonly managerOpen: (path: string) => SessionManager;
  private readonly createOfficialSession: (path: string) => Promise<AgentSession>;
  private readonly connectObserver: typeof connectProjectionObserver;
  private readonly sessions = new Map<string, SessionRuntimeMetadata>();
  private readonly loadingSessions = new Map<string, Promise<SessionRuntimeMetadata | undefined>>();
  private readonly preparingSessions = new Map<string, Promise<PrepareSessionResult>>();
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
      const manager = SessionManager.open(path);
      const cwd = manager.getCwd();
      if (!cwd || !isAbsolute(cwd)) throw new Error("Pi session has no canonical working directory");
      return (await createAgentSession({ cwd, sessionManager: manager })).session;
    });
    this.connectObserver = options.connectObserver ?? connectProjectionObserver;
    this.bff = new PrivateWebBff(this.lifecycle, this.registry, {
      admitMutation: (_request, envelope) => this.admitMutation(envelope),
    });
    if (options.policy.loopback) this.bff.armLoopbackBootstrap();
    this.inner = new PrivateWebBffBridge(this.bff, {
      catalog: (identity) => this.catalog(identity),
      history: (identity, sessionHandle) => this.history(identity, sessionHandle),
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
      [...composition.sessions.values()].some((session) => session.host.writerGeneration === generation));
    try { await composition.livenessServer.start(); }
    catch (error) {
      await composition.livenessServer.close().catch(() => undefined);
      composition.livenessServer = undefined;
      composition.bff.dispose();
      composition.lifecycle.dispose();
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
      const prepared = await this.prepareSession(handle, true);
      if (!prepared.ok) return prepared.response;
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
    const sessionResources = [...this.sessions.values()];
    for (const session of sessionResources) {
      try { session.officialUnsubscribe?.(); } catch { failures.push("official-observer"); }
      try { session.observer?.close(); } catch { failures.push("projection-observer"); }
    }
    this.sessions.clear();
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

  /** pi-web pattern: one session's bounded history loads only on explicit request. */
  public async history(identity: WebRequestIdentity, sessionHandle: string): Promise<GatewayResponse<WorkbenchHistoryV1 | { readonly error: string }>> {
    const access = this.lifecycle.authorizeLoopbackRead(identity);
    if (!access.ok) return failure(401, access.reason);
    if (!safeHandle(sessionHandle)) return failure(404, "session-not-found");
    let records: readonly JsonlProjectionRecordV1[];
    try { records = await this.browser.read(sessionHandle); }
    catch { return failure(404, "session-not-found"); }
    const recent = records.slice(-HISTORY_ENTRY_LIMIT);
    const timeline = Object.freeze(recent.map((record) => Object.freeze({
      id: `${sessionHandle}:entry-${record.index}`,
      kind: record.role === "user" ? "user" : record.role === "assistant" ? "assistant" : record.role === "tool" ? "tool" : "event",
      status: "complete",
      title: record.role ?? record.type,
      // \r and NUL would fail the public timeline-body contract; keep newlines.
      ...(record.content ? { body: record.content.replace(/[\r\0]+/g, " ").slice(0, 32_768) } : {}),
      ...(record.timestamp ? { at: record.timestamp } : {}),
    })) as WorkbenchHistoryV1["timeline"]);
    return { status: 200, headers: PRIVATE_HEADERS, body: Object.freeze({ schemaVersion: 1, sessionHandle, timeline }) };
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
        try { metadata.officialUnsubscribe = session.subscribe((event) => this.projectOfficialEvent(metadata, session, event.type)); }
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
    let holder: Awaited<ReturnType<RuntimeHost<AgentSession>["inspectWriter"]>>;
    try { holder = await metadata.host.inspectWriter(); }
    catch { return { ok: false, response: failure(503, "session-writer-unverified") }; }
    if (metadata.observer && holder?.owner !== "tui") {
      metadata.observer.close();
      metadata.observer = undefined;
    }
    if (holder?.owner === "tui") {
      const observed = await this.attachObserver(metadata, { acquired: false, reason: "held", holder });
      if (!observed) return { ok: false, response: failure(503, "tui-projection-unavailable") };
      return { ok: true };
    }
    if (holder?.owner === "web" && metadata.host.snapshot.writer.owner !== "web") {
      return { ok: false, response: failure(409, "session-writer-owned-by-another-web-runtime") };
    }
    // A lease is a mutation admission resource, not a browse-side effect.
    // This preserves TUI first-writer eligibility until a Web mutation arrives.
    if (!requireWebWriter || !metadata.rootGrant) return { ok: true };
    const ownership: LeaseAcquireResult = await metadata.host.acquireWriter("web").catch((): LeaseAcquireResult => ({ acquired: false, reason: "unverified" }));
    if (ownership.acquired) return { ok: true };
    if (ownership.holder?.owner === "tui") {
      const observed = await this.attachObserver(metadata, ownership);
      return observed ? { ok: true } : { ok: false, response: failure(503, "tui-projection-unavailable") };
    }
    return { ok: false, response: failure(409, `session-writer-unavailable-${ownership.reason}`) };
  }

  private async attachObserver(metadata: SessionRuntimeMetadata, ownership: LeaseAcquireResult): Promise<boolean> {
    if (metadata.observer) return true;
    if (ownership.acquired || ownership.holder?.owner !== "tui") return false;
    if (metadata.host.snapshot.writer.owner === "web" && !await metadata.host.releaseWriter().catch(() => false)) return false;
    try {
      metadata.observer = await this.connectObserver({
        runtimeDirectory: this.options.runtimeDirectory,
        privateSessionIdentity: metadata.privateIdentity,
        onSnapshot: (snapshot) => this.projectObservedSnapshot(metadata, snapshot),
        onEvent: (event) => this.projectObservedEvent(metadata, event),
        onReset: () => this.safeProject(metadata, "blocked", { observerState: "reset-required" }),
        onError: () => this.safeProject(metadata, "blocked", { observerState: "disconnected" }),
      });
      return true;
    } catch {
      this.safeProject(metadata, "blocked", { observerState: "unavailable" });
      return false;
    }
  }

  private safeProject(metadata: SessionRuntimeMetadata, state: RuntimeSnapshotV1["state"], patch: Readonly<Record<string, JsonValue>>): void {
    if (this.disposed || !this.sessions.has(metadata.handle)) return;
    try { metadata.host.project("tui-observer", state, patch); }
    catch {
      try { metadata.observer?.close(); } catch { /* transport already closed */ }
      metadata.observer = undefined;
    }
  }

  private projectObservedSnapshot(metadata: SessionRuntimeMetadata, snapshot: RuntimeSnapshotV1): void {
    if (this.disposed || !this.sessions.has(metadata.handle)) return;
    const pi = publicRecord(snapshot.projection.pi) ?? snapshot.projection;
    const leaf = typeof pi.leafId === "string" ? safeLeaf(pi.leafId) : metadata.currentLeaf;
    metadata.currentLeaf = leaf;
    this.safeProject(metadata, snapshot.state, { ...snapshot.projection, observerState: "connected", readOnlyObserver: true });
  }

  private projectObservedEvent(metadata: SessionRuntimeMetadata, event: RuntimeEventV1): void {
    if (this.disposed || !this.sessions.has(metadata.handle)) return;
    const patch = publicRecord(event.payload.projectionPatch);
    this.safeProject(metadata, event.eventType === "closed" ? "blocked" : metadata.host.snapshot.state, {
      ...(patch ?? {}),
      observerState: event.eventType === "closed" ? "disconnected" : "connected",
      observerCursor: event.cursor,
    });
  }

  private admitMutation(envelope: MutationEnvelopeV1) {
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
          await this.browser.read(metadata.handle);
          const currentLeaf = safeLeaf(this.managerOpen(metadata.privatePath).getLeafId());
          if (currentLeaf !== metadata.currentLeaf) return "session-leaf-changed";
          return true;
        } catch { return "operation-revalidation-failed"; }
      },
    };
  }

  private projectOfficialEvent(metadata: SessionRuntimeMetadata, session: AgentSession, eventType: string): void {
    if (this.disposed || !this.sessions.has(metadata.handle)) return;
    metadata.currentLeaf = safeLeaf(session.sessionManager.getLeafId());
    const running = !session.isIdle;
    const usage = session.getContextUsage();
    try {
      metadata.host.project("official-pi", running ? "running" : "idle", {
        pi: {
          provider: session.model?.provider ?? null,
          model: session.model?.id ?? null,
          thinkingLevel: session.thinkingLevel,
          contextTokens: usage?.tokens ?? null,
          contextWindow: usage?.contextWindow ?? null,
          activeRun: running,
          leafId: metadata.currentLeaf,
        },
        officialEvent: boundedEventType(eventType),
      });
    } catch { /* host disposal wins over late official events */ }
  }

  private async executeMutation(session: AgentSession, envelope: MutationEnvelopeV1): Promise<void> {
    if (this.disposed) throw new Error("runtime-composition-closed");
    await dispatchOfficialPiMutation(session, envelope);
    const metadata = this.sessions.get(envelope.sessionHandle);
    if (!metadata || metadata.host.snapshot.writer.owner !== "web") return;
    metadata.currentLeaf = safeLeaf(session.sessionManager.getLeafId());
    const usage = session.getContextUsage();
    if (this.disposed) return;
    metadata.host.project("official-pi", session.isIdle ? "idle" : "running", {
      pi: {
        provider: session.model?.provider ?? null,
        model: session.model?.id ?? null,
        thinkingLevel: session.thinkingLevel,
        contextTokens: usage?.tokens ?? null,
        contextWindow: usage?.contextWindow ?? null,
        activeRun: !session.isIdle,
        leafId: metadata.currentLeaf,
      },
    });
  }
}

/** Exhaustive public-Pi dispatcher for the exact capability matrix above. */
export async function dispatchOfficialPiMutation(session: AgentSession, envelope: MutationEnvelopeV1): Promise<void> {
  if (!isAdvertisedCommand(envelope.capability, envelope.commandType)) throw new Error("unsupported-runtime-command");
  const args = envelope.arguments;
  if (envelope.capability === "pi.send" && envelope.commandType === "send") {
    const message = boundedMessage(args.message, true);
    const images = boundedImages(args.images);
    if (!message.trim() && images.length === 0) throw new Error("message-invalid");
    await session.sendUserMessage(images.length ? [...(message ? [{ type: "text" as const, text: message }] : []), ...images] : message);
    return;
  }
  if (envelope.capability === "pi.follow_up" && envelope.commandType === "follow_up") {
    await session.followUp(boundedMessage(args.message), boundedImages(args.images));
    return;
  }
  if (envelope.capability === "pi.steer" && envelope.commandType === "steer") {
    await session.steer(boundedMessage(args.message), boundedImages(args.images));
    return;
  }
  if (envelope.capability === "pi.compact" && envelope.commandType === "compact") {
    const instructions = args.instructions === undefined ? undefined : boundedMessage(args.instructions, true);
    await session.compact(instructions);
    return;
  }
  if (envelope.capability === "pi.thinking" && envelope.commandType === "select_thinking") {
    const level = args.thinkingLevel;
    if (level !== "off" && level !== "minimal" && level !== "low" && level !== "medium" && level !== "high" && level !== "xhigh" && level !== "max") {
      throw new Error("thinking-level-invalid");
    }
    session.setThinkingLevel(level as ThinkingLevel);
    return;
  }
  if (envelope.capability === "session.rename" && envelope.commandType === "rename") {
    const name = boundedMessage(args.name).trim();
    if (!name || name.length > 200) throw new Error("session-name-invalid");
    session.setSessionName(name);
    return;
  }
  const exhaustive: never = envelope.capability as never;
  throw new Error(`unsupported-runtime-command-${String(exhaustive)}`);
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
