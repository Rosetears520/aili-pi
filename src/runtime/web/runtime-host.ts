import { mkdir } from "node:fs/promises";
import {
  createOpaqueSessionHandle,
  eventCursor,
  validateMutationEnvelope,
  validateSnapshot,
  type JsonValue,
  type MutationDispositionV1,
  type MutationEnvelopeV1,
  type MutationOrigin,
  type RuntimeEventKind,
  type RuntimeEventV1,
  type RuntimeSnapshotV1,
  type WriterProjectionV1,
} from "./contracts.js";
import { RuntimeEventHub, type EventReplayResult, type RuntimeSubscription, type SnapshotFirstReplay } from "./event-hub.js";
import { LazyOfficialAgentSession, OFFICIAL_PI_VERSION, type OfficialAgentSessionFactory, type OfficialAgentSessionLike, isOfficialPiCompatible } from "./lazy-agent-session.js";
import { MutationDispositionJournal } from "./mutation-disposition.js";
import { acquireSessionWriterLease, inspectSessionWriterLease, type LeaseAcquireResult, type LeaseProcessIdentityV1, type SessionWriterLease, type SessionWriterLeaseOptions } from "./session-writer-lease.js";

export interface RuntimeHostOptions<T extends OfficialAgentSessionLike = OfficialAgentSessionLike> {
  readonly piVersion: string;
  readonly runtimeDirectory: string;
  readonly sessionHandle?: string;
  readonly initialSnapshot?: Partial<Pick<RuntimeSnapshotV1, "state" | "capabilities" | "projection">>;
  readonly agentSessionFactory?: OfficialAgentSessionFactory<T>;
  readonly now?: () => Date;
  readonly mutationFreshnessMs?: number;
  readonly eventHistoryLimit?: number;
  readonly subscriberQueueLimit?: number;
  readonly lease?: Omit<SessionWriterLeaseOptions, "now">;
  /** Adopt a lease already acquired by an official Pi Extension startup gate. */
  readonly writerLease?: SessionWriterLease;
}

export interface MutationAdmissionContext {
  readonly authenticatedClientId: string;
  readonly channelAuthenticated: boolean;
  readonly browserPolicyValidated: boolean;
  readonly rootAuthorized: boolean;
  readonly permissionGranted: boolean;
  readonly capabilityAllowed: boolean;
  readonly currentSessionLeaf: string;
  readonly revalidate: () => Promise<true | string> | true | string;
}

export type MutationExecution<T extends object> = (session: T, envelope: MutationEnvelopeV1) => Promise<void> | void;
export interface RuntimeMutationResult { readonly disposition: MutationDispositionV1; readonly event?: RuntimeEventV1; }

/** One isolated composition root for one private Pi session identity. */
export class RuntimeHost<T extends OfficialAgentSessionLike = OfficialAgentSessionLike> {
  readonly sessionHandle: string;
  private readonly now: () => Date;
  private readonly freshnessMs: number;
  private readonly eventHub: RuntimeEventHub;
  private readonly journal: MutationDispositionJournal;
  private readonly lazyAgent?: LazyOfficialAgentSession<T>;
  private readonly leaseOptions: Omit<SessionWriterLeaseOptions, "now">;
  private snapshotValue: RuntimeSnapshotV1;
  private writerLease?: SessionWriterLease;
  private closed = false;

  public constructor(readonly privateSessionIdentity: string, private readonly options: RuntimeHostOptions<T>) {
    if (!privateSessionIdentity) throw new Error("runtime host requires a private session identity");
    this.now = options.now ?? (() => new Date());
    this.freshnessMs = bounded(options.mutationFreshnessMs ?? 5 * 60_000, 1_000, 60 * 60_000, "mutationFreshnessMs");
    this.sessionHandle = options.sessionHandle ?? createOpaqueSessionHandle();
    this.eventHub = new RuntimeEventHub(this.sessionHandle, { now: this.now, historyLimit: options.eventHistoryLimit, subscriberQueueLimit: options.subscriberQueueLimit });
    this.journal = new MutationDispositionJournal(this.sessionHandle, { now: this.now, directory: `${options.runtimeDirectory}/mutation-dispositions` });
    this.leaseOptions = options.lease ?? {};
    this.writerLease = options.writerLease;
    const initial = options.initialSnapshot ?? {};
    const initialWriter: WriterProjectionV1 = this.writerLease
      ? { state: "owned", owner: this.writerLease.owner, generation: this.writerLease.generation, activeTurn: this.writerLease.activeTurn }
      : { state: "unowned", activeTurn: false };
    this.snapshotValue = this.makeSnapshot(initial.state ?? "idle", initial.projection ?? {}, initial.capabilities ?? {}, initialWriter);
    if (options.agentSessionFactory) {
      this.lazyAgent = new LazyOfficialAgentSession({ sessionId: privateSessionIdentity, factory: options.agentSessionFactory, compatible: () => isOfficialPiCompatible(this.options.piVersion) });
    }
  }

  public get snapshot(): RuntimeSnapshotV1 { return this.snapshotValue; }
  public get runtimeEpoch(): string { return this.eventHub.runtimeEpoch; }
  public get sequence(): number { return this.eventHub.latestSequence; }
  public get agentLoaded(): boolean { return this.lazyAgent?.loaded ?? false; }
  public get writerGeneration(): string | undefined { return this.writerLease?.generation; }
  public get writerProcessIdentity(): LeaseProcessIdentityV1 | undefined { return this.writerLease?.processIdentity; }

  public async initialize(): Promise<void> { await mkdir(this.options.runtimeDirectory, { recursive: true, mode: 0o700 }); await this.journal.restore(); }
  public replay(cursor?: string): EventReplayResult { return this.eventHub.replay(cursor); }
  public connect(cursor?: string): SnapshotFirstReplay { return this.eventHub.snapshotFirst(this.snapshotValue, cursor); }
  public subscribe(cursor?: string): RuntimeSubscription { return this.eventHub.subscribe(cursor); }

  public publish(source: string, kind: Exclude<RuntimeEventKind, "mutation" | "closed">, payload: Readonly<Record<string, JsonValue>>, runId?: string): RuntimeEventV1 {
    if (this.closed) throw new Error("runtime host is closed");
    const event = this.eventHub.publish(source, kind, payload, { runId, leaseGeneration: this.writerLease?.generation });
    const state = kind === "state" && isRuntimeState(payload.state) ? payload.state : this.snapshotValue.state;
    this.updateSnapshot(state, this.snapshotValue.projection, this.snapshotValue.capabilities);
    return event;
  }

  /** Publish a schema-validated public projection patch without exposing private Pi state. */
  public project(
    source: string,
    state: RuntimeSnapshotV1["state"],
    patch: Readonly<Record<string, JsonValue>> = {},
  ): RuntimeEventV1 {
    if (this.closed) throw new Error("runtime host is closed");
    const projection = { ...this.snapshotValue.projection, ...patch };
    // Validate the complete next snapshot before publishing the observable patch.
    this.makeSnapshot(state, projection, this.snapshotValue.capabilities, this.snapshotValue.writer);
    const event = this.eventHub.publish(source, "state", { state, projectionPatch: patch }, { leaseGeneration: this.writerLease?.generation });
    this.updateSnapshot(state, projection, this.snapshotValue.capabilities);
    return event;
  }

  public async inspectWriter() { return inspectSessionWriterLease(this.options.runtimeDirectory, this.privateSessionIdentity); }

  public async acquireWriter(origin: MutationOrigin): Promise<LeaseAcquireResult> {
    if (this.closed) return { acquired: false, reason: "unverified" };
    if (this.writerLease) return this.writerLease.owner === origin ? { acquired: true, lease: this.writerLease } : { acquired: false, reason: "held", holder: writerHolder(this.writerLease) };
    const result = await acquireSessionWriterLease(this.options.runtimeDirectory, this.privateSessionIdentity, origin, { ...this.leaseOptions, now: this.now });
    if (result.acquired) {
      this.writerLease = result.lease;
      this.eventHub.publish("lease", "state", { writerState: "owned", owner: origin }, { leaseGeneration: result.lease.generation });
      this.updateWriterSnapshot({ state: "owned", owner: origin, generation: result.lease.generation, activeTurn: result.lease.activeTurn });
    } else if (result.holder) {
      this.updateWriterSnapshot({ state: result.reason === "grace" || result.reason === "active-turn" ? "recovering" : "owned", owner: result.holder.owner, generation: result.holder.generation, activeTurn: result.holder.activeTurn, denialReason: result.reason });
    }
    return result;
  }

  public async heartbeatWriter(activeTurn = this.writerLease?.activeTurn ?? false, activeTurnId?: string): Promise<boolean> {
    const lease = this.writerLease;
    if (!lease) return false;
    const renewed = await lease.heartbeat({ activeTurn, activeTurnId, connected: true });
    if (renewed) {
      this.eventHub.publish("lease", "heartbeat", { owner: lease.owner, activeTurn: lease.activeTurn }, { leaseGeneration: lease.generation });
      this.updateWriterSnapshot({ state: "owned", owner: lease.owner, generation: lease.generation, activeTurn: lease.activeTurn });
    }
    return renewed;
  }

  public async disconnectWriter(): Promise<boolean> {
    const lease = this.writerLease;
    if (!lease) return false;
    const disconnected = await lease.disconnect();
    if (disconnected) {
      this.eventHub.publish("lease", "state", { writerState: "recovering", owner: lease.owner }, { leaseGeneration: lease.generation });
      this.updateWriterSnapshot({ state: "recovering", owner: lease.owner, generation: lease.generation, activeTurn: lease.activeTurn, denialReason: "disconnect-grace" });
    }
    return disconnected;
  }

  public async reconnectWriter(generation: string, process: LeaseProcessIdentityV1): Promise<boolean> {
    const lease = this.writerLease;
    if (!lease) return false;
    const reconnected = await lease.reconnect(generation, process);
    if (reconnected) {
      this.eventHub.publish("lease", "state", { writerState: "owned", owner: lease.owner }, { leaseGeneration: lease.generation });
      this.updateWriterSnapshot({ state: "owned", owner: lease.owner, generation: lease.generation, activeTurn: lease.activeTurn });
    }
    return reconnected;
  }

  public async releaseWriter(): Promise<boolean> {
    const lease = this.writerLease;
    if (!lease || !await lease.release()) return false;
    this.writerLease = undefined;
    this.eventHub.publish("lease", "state", { writerState: "unowned" });
    this.updateWriterSnapshot({ state: "unowned", activeTurn: false });
    return true;
  }

  public async mutate(origin: MutationOrigin, envelopeValue: MutationEnvelopeV1, context: MutationAdmissionContext, execute: MutationExecution<T>): Promise<RuntimeMutationResult> {
    let envelope: MutationEnvelopeV1;
    try { envelope = validateMutationEnvelope(envelopeValue); }
    catch { throw new Error("invalid MutationEnvelopeV1"); }
    // Collision/idempotency admission precedes policy evaluation so every
    // mutation family gets the same bounded duplicate semantics. No private
    // operation is dispatched until all policy checks below pass.
    const admission = await this.journal.admit(envelope, origin);
    if (admission.kind === "join") return { disposition: await admission.settled };
    if (!admission.execute) return { disposition: admission.disposition };
    const denial = this.preflight(origin, envelope, context);
    if (denial) return { disposition: await this.journal.reject(envelope, origin, denial) };
    if (!this.lazyAgent) return { disposition: await this.journal.fail(envelope, origin, "official-agent-session-unavailable") };

    const lease = this.writerLease!;
    if (!await lease.setActiveTurn(true, `request-${envelope.requestId}`)) return { disposition: await this.journal.fail(envelope, origin, "lease-heartbeat-failed") };
    this.eventHub.publish("lease", "state", { writerState: "owned", owner: lease.owner, activeTurn: true }, { leaseGeneration: lease.generation });
    this.updateWriterSnapshot({ state: "owned", owner: lease.owner, generation: lease.generation, activeTurn: true });
    try {
      const final = await context.revalidate();
      if (final !== true) return { disposition: await this.journal.fail(envelope, origin, boundedReason(final || "operation-revalidation-failed")) };
      if (this.writerLease !== lease || lease.generation !== envelope.leaseGeneration || context.currentSessionLeaf !== envelope.sessionLeaf) {
        return { disposition: await this.journal.fail(envelope, origin, "operation-precondition-changed") };
      }
      // Official Pi is materialized only after operation-specific revalidation.
      const agent = await this.lazyAgent.get();
      if (this.writerLease !== lease || lease.generation !== envelope.leaseGeneration || context.currentSessionLeaf !== envelope.sessionLeaf) {
        return { disposition: await this.journal.fail(envelope, origin, "operation-precondition-changed") };
      }
      await execute(agent, envelope);
      const event = this.eventHub.publish("mutation", "mutation", { requestId: envelope.requestId, capability: envelope.capability, commandType: envelope.commandType, origin }, { leaseGeneration: envelope.leaseGeneration, requestId: envelope.requestId, capability: envelope.capability });
      this.updateSnapshot(this.snapshotValue.state, this.snapshotValue.projection, this.snapshotValue.capabilities);
      return { disposition: await this.journal.complete(envelope, origin, event.sequence), event };
    } catch (error) {
      return { disposition: await this.journal.fail(envelope, origin, boundedError(error)) };
    } finally {
      const settledLease = await lease.setActiveTurn(false).catch(() => false);
      if (this.writerLease === lease && settledLease) {
        this.eventHub.publish("lease", "state", { writerState: "owned", owner: lease.owner, activeTurn: false }, { leaseGeneration: lease.generation });
        this.updateWriterSnapshot({ state: "owned", owner: lease.owner, generation: lease.generation, activeTurn: false });
      } else if (this.writerLease === lease) {
        this.updateWriterSnapshot({ state: "recovering", owner: lease.owner, generation: lease.generation, activeTurn: true, denialReason: "active-turn-settlement-unverified" });
      }
    }
  }

  public async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.eventHub.publish("runtime", "closed", { reason: "runtime-disposed" }, { leaseGeneration: this.writerLease?.generation });
    this.updateSnapshot("closed", this.snapshotValue.projection, this.snapshotValue.capabilities);
    if (this.writerLease?.activeTurn) await this.writerLease.disconnect().catch(() => false);
    else await this.writerLease?.release().catch(() => false);
    this.writerLease = undefined;
    await this.lazyAgent?.dispose();
    this.eventHub.close();
  }

  public denialForAttachment(origin: MutationOrigin, holder: { readonly owner: MutationOrigin } | undefined): string | undefined {
    return holder && holder.owner !== origin ? `session-writer-owned-by-${holder.owner}` : undefined;
  }

  private preflight(origin: MutationOrigin, envelope: MutationEnvelopeV1, context: MutationAdmissionContext): string | undefined {
    if (this.closed) return "runtime-closed";
    if (!isOfficialPiCompatible(this.options.piVersion)) return `unsupported-pi-${this.options.piVersion}`;
    if (envelope.sessionHandle !== this.sessionHandle) return "session-handle-mismatch";
    if (envelope.runtimeEpoch !== this.runtimeEpoch) return "runtime-epoch-stale";
    if (!fresh(this.now(), envelope.requestedAt, this.freshnessMs)) return "mutation-request-stale";
    if (!context.channelAuthenticated || context.authenticatedClientId !== envelope.clientId) return "origin-identity-denied";
    if (origin === "web" && !context.browserPolicyValidated) return "browser-host-origin-denied";
    if (!context.rootAuthorized) return "allowed-root-denied";
    if (!context.permissionGranted) return "permission-denied";
    if (!context.capabilityAllowed || this.snapshotValue.capabilities[envelope.capability] !== true) return "capability-denied";
    if (context.currentSessionLeaf !== envelope.sessionLeaf) return "session-leaf-stale";
    const lease = this.writerLease;
    if (!lease || lease.owner !== origin) return "writer-held-by-other-surface";
    if (lease.generation !== envelope.leaseGeneration) return "lease-generation-stale";
    return undefined;
  }

  private updateWriterSnapshot(writer: WriterProjectionV1): void { this.snapshotValue = this.makeSnapshot(this.snapshotValue.state, this.snapshotValue.projection, this.snapshotValue.capabilities, writer); }
  private updateSnapshot(state: RuntimeSnapshotV1["state"], projection: RuntimeSnapshotV1["projection"], capabilities: RuntimeSnapshotV1["capabilities"]): void { this.snapshotValue = this.makeSnapshot(state, projection, capabilities, this.snapshotValue.writer); }
  private makeSnapshot(state: RuntimeSnapshotV1["state"], projection: RuntimeSnapshotV1["projection"], capabilities: RuntimeSnapshotV1["capabilities"], writer: WriterProjectionV1): RuntimeSnapshotV1 {
    return validateSnapshot({ schemaVersion: 1, type: "RuntimeSnapshotV1", runtimeEpoch: this.eventHub.runtimeEpoch, sessionHandle: this.sessionHandle, lastSequence: this.eventHub.latestSequence, cursor: eventCursor(this.eventHub.runtimeEpoch, this.eventHub.latestSequence), createdAt: this.now().toISOString(), state, writer, capabilities, projection });
  }
}

export class RuntimeHostRegistry<T extends OfficialAgentSessionLike = OfficialAgentSessionLike> {
  private readonly byHandle = new Map<string, RuntimeHost<T>>();
  private readonly byPrivateIdentity = new Map<string, RuntimeHost<T>>();
  public get(sessionHandle: string): RuntimeHost<T> | undefined { return this.byHandle.get(sessionHandle); }
  public getPrivate(privateSessionIdentity: string): RuntimeHost<T> | undefined { return this.byPrivateIdentity.get(privateSessionIdentity); }
  public create(privateSessionIdentity: string, options: RuntimeHostOptions<T>): RuntimeHost<T> {
    if (this.byPrivateIdentity.has(privateSessionIdentity)) throw new Error("runtime host already exists for private session identity");
    const host = new RuntimeHost<T>(privateSessionIdentity, options);
    if (this.byHandle.has(host.sessionHandle)) throw new Error("runtime session handle collision");
    this.byHandle.set(host.sessionHandle, host); this.byPrivateIdentity.set(privateSessionIdentity, host); return host;
  }
  public async dispose(sessionHandle: string): Promise<void> {
    const host = this.byHandle.get(sessionHandle); if (!host) return;
    this.byHandle.delete(sessionHandle); this.byPrivateIdentity.delete(host.privateSessionIdentity); await host.dispose();
  }
  public async disposeAll(): Promise<void> { await Promise.all([...this.byHandle.keys()].map((handle) => this.dispose(handle))); }
}

export { OFFICIAL_PI_VERSION };
function writerHolder(lease: SessionWriterLease) { return { owner: lease.owner, generation: lease.generation, activeTurn: lease.activeTurn, connectionState: lease.record.connectionState, expiresAt: lease.record.expiresAt, ...(lease.record.graceUntil ? { graceUntil: lease.record.graceUntil } : {}) } as const; }
function fresh(now: Date, requestedAt: string, windowMs: number): boolean { const requested = Date.parse(requestedAt); return requested <= now.getTime() + 30_000 && requested >= now.getTime() - windowMs; }
function boundedError(error: unknown): string { return boundedReason(error instanceof Error ? error.message : String(error)); }
function boundedReason(reason: string): string { return reason.replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 160) || "mutation-failed"; }
function bounded(value: number, min: number, max: number, name: string): number { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} out of range`); return value; }
function isRuntimeState(value: unknown): value is RuntimeSnapshotV1["state"] { return value === "idle" || value === "running" || value === "blocked" || value === "closed"; }
