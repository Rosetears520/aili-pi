import { createHash } from "node:crypto";
import type { AutomaticMemoryCandidate, MemoryKind, PromotionReceipt } from "./contracts.js";
import { PromotionStateController } from "./controller.js";
import type { ManagedMemoryObserver, ObserverExtractionResult } from "./observer.js";
import { HybridObserverExtractor } from "./observer.js";
import type { MemPalacePort, MemPalacePortFailure } from "./mempalace-port.js";
import { keywordRecallQuery, projectScopedRecall, type ScopedRecallProjection } from "./recall.js";
import { AutomaticObservationCoordinator, detectHighValueEvent, ManagedInternalMemoryScheduler } from "./scheduler.js";
import { BoundedSourceEnvelopeStore, type SourceCaptureInput } from "./source.js";
import type { AtomicObservation } from "./types.js";

export interface AutomaticMemoryRuntimeOptions {
  observer?: ManagedMemoryObserver;
  port?: MemPalacePort;
  currentProjectIdentity?: string;
  currentSessionId?: string;
  tokenThreshold?: number;
  durableRecallTokens?: number;
  sessionRecallTokens?: number;
  maximumPending?: number;
  operationTimeoutMs?: number;
  authorityArmed?: () => boolean;
  providerVersionCompatible?: () => boolean;
}

export interface AutomaticMemoryStatus {
  enabled: boolean;
  armed: boolean;
  versionCompatible: boolean;
  provider: "ready" | "unarmed" | "degraded";
  pendingCount: number;
  activeWorkCount: number;
  lastCutoffHash?: string;
  lastCheckpoint: string;
  lastRecall: string;
  /** Bounded operation/status code only; never a provider body, identifier, path, or raw reason. */
  lastProviderError?: string;
  recalledIds: readonly string[];
  rejectedCount: number;
  lastCaptureStatus: string;
  cost: Readonly<{ observerInvocations: number; searchOperations: number; checkpointOperations: number }>;
}

/** Parent-process coordinator. It owns bounded references only and never persists a cache/outbox. */
export class AutomaticMemoryRuntime {
  private readonly sources = new BoundedSourceEnvelopeStore();
  private readonly scheduler = new ManagedInternalMemoryScheduler();
  private readonly promotions: PromotionStateController;
  private readonly coordinator?: AutomaticObservationCoordinator;
  private readonly inflight = new Set<Promise<ObserverExtractionResult>>();
  private enabled = true;
  private externallyRevoked = false;
  private provider: AutomaticMemoryStatus["provider"];
  private lastCheckpoint = "not-attempted";
  private lastRecall = "not-attempted";
  private lastProviderError: string | undefined;
  private lastCutoffHash: string | undefined;
  private rejectedCount = 0;
  private lastCaptureStatus = "not-attempted";
  private observerInvocations = 0;
  private searchOperations = 0;
  private checkpointOperations = 0;
  private activeTopic: string | undefined;
  private activeProjection: ScopedRecallProjection | undefined;
  private searchedTopic: string | undefined;
  private currentProjectIdentity: string;
  private currentSessionId: string;

  constructor(private readonly options: AutomaticMemoryRuntimeOptions = {}) {
    this.currentProjectIdentity = options.currentProjectIdentity ?? "unknown";
    this.currentSessionId = options.currentSessionId ?? "unknown";
    this.promotions = new PromotionStateController(options.maximumPending ?? 128);
    // A supplied seam is not authority evidence; report armed only after a covered operation settles.
    this.provider = "unarmed";
    if (options.observer) this.coordinator = new AutomaticObservationCoordinator(this.sources, new HybridObserverExtractor(options.observer), this.scheduler, options.tokenThreshold ?? 2_048, (result) => this.stageExtraction(result));
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) this.invalidateProjection();
  }

  setSessionScope(projectIdentity: string, sessionId: string): void {
    this.currentProjectIdentity = projectIdentity;
    this.currentSessionId = sessionId;
    this.invalidateProjection();
  }

  capture(input: SourceCaptureInput): void {
    if (!this.enabled) return;
    const captured = this.sources.capture(input);
    if (!captured.accepted) { this.rejectedCount += 1; this.lastCaptureStatus = captured.reason; return; }
    this.lastCaptureStatus = "accepted";
    const trigger = detectHighValueEvent(captured.envelope.text, captured.envelope.role);
    if (this.coordinator) this.track(this.coordinator.consider(input.branchId, trigger).settlement);
  }

  async checkpoint(branchId: string, signal?: AbortSignal, compactedEntryIds?: readonly string[]): Promise<void> {
    if (!this.enabled) { this.lastCheckpoint = "disabled"; return; }
    if (this.coordinator) {
      try { await this.coordinator.flush(branchId, compactedEntryIds); }
      catch { this.lastCheckpoint = "observer-failed"; this.provider = this.options.port ? "degraded" : "unarmed"; }
    }
    await Promise.allSettled([...this.inflight]);
    this.rejectedCount += this.promotions.releaseExpired();
    // One lifecycle boundary owns at most one production-sized checkpoint chunk.
    const compacted = compactedEntryIds ? new Set(compactedEntryIds) : undefined;
    const candidates = this.promotions.pendingCandidates().filter((candidate) => !compacted || candidate.sourceEntryIds.every((entryId) => compacted.has(entryId))).slice(0, 5);
    if (candidates.length === 0) { this.lastCheckpoint = "no-candidate"; return; }
    if (!this.options.port || this.externallyRevoked) { this.provider = "unarmed"; this.lastCheckpoint = this.externallyRevoked ? "standing-policy-revoked" : "unarmed-no-live-port"; return; }

    const operationSignal = boundedSignal(signal, this.options.operationTimeoutMs ?? 2_500);
    const checkpointable: AutomaticMemoryCandidate[] = [];
    for (const candidate of candidates) {
      const state = this.promotions.status(candidate.id);
      try {
        // Consume the bounded attempt before any provider call, including reconciliation.
        this.promotions.beginAttempt(candidate.id);
        if (state.state === "reconciliation-required") {
          this.searchOperations += 1;
          const reconciliation = await this.options.port.reconcileDuplicate(candidate, operationSignal);
          if (reconciliation.status !== "success") {
            this.noteFailure(reconciliation.status, "reconcile");
            if (this.promotions.terminalizeRetryExhausted(candidate.id).terminalized) this.rejectedCount += 1;
            continue;
          }
          if (reconciliation.value.duplicate) {
            this.promotions.settle(candidate.id, { status: "duplicate", receipt: receipt(candidate, "duplicate", reconciliation.value.providerIds) });
            continue;
          }
        }
        checkpointable.push(candidate);
      } catch {
        const exhausted = this.promotions.terminalizeRetryExhausted(candidate.id);
        if (exhausted.terminalized) this.rejectedCount += 1;
        this.lastCheckpoint = exhausted.terminalized ? exhausted.reason : "provider-operation-threw";
        this.provider = "degraded";
        this.lastProviderError = "checkpoint:unavailable";
      }
    }
    if (checkpointable.length === 0) { this.promotions.releaseTerminal(); return; }

    this.checkpointOperations += 1;
    const result = await this.options.port.checkpoint(checkpointable, operationSignal);
    if (result.status !== "success") {
      for (const candidate of checkpointable) {
        this.promotions.settle(candidate.id, { status: result.status === "ambiguous" ? "ambiguous" : "retryable-failure", detail: result.reason });
        if (this.promotions.terminalizeRetryExhausted(candidate.id).terminalized) this.rejectedCount += 1;
      }
      this.promotions.releaseTerminal();
      this.noteFailure(result.status, "checkpoint");
      return;
    }
    const receipts = new Map(result.value.receipts.map((item) => [item.candidateId, item]));
    for (const candidate of checkpointable) {
      const item = receipts.get(candidate.id);
      if (!item) { this.promotions.settle(candidate.id, { status: "ambiguous", detail: "receipt missing" }); continue; }
      const status = item.outcome === "committed" ? "success" : item.outcome;
      this.promotions.settle(candidate.id, { status, receipt: item });
      this.lastCutoffHash = candidate.sourceCutoff.contentHash;
    }
    this.promotions.releaseTerminal();
    this.provider = "ready";
    this.lastProviderError = undefined;
    this.lastCheckpoint = `settled:${result.value.receipts.length}`;
    this.invalidateProjection();
  }

  async recall(prompt: string, session: readonly AtomicObservation[] = [], signal?: AbortSignal): Promise<ScopedRecallProjection | undefined> {
    if (!this.enabled) return undefined;
    const query = keywordRecallQuery(prompt);
    if (!query) { this.lastRecall = "empty-query"; return undefined; }
    const topic = createHash("sha256").update(query).digest("hex").slice(0, 16);
    if (topic === this.activeTopic && this.activeProjection) return this.activeProjection;
    this.activeTopic = topic;
    this.activeProjection = undefined;
    if (!this.options.port || this.externallyRevoked) {
      this.provider = "unarmed"; this.lastRecall = this.externallyRevoked ? "standing-policy-revoked" : "unarmed-no-live-port";
      return this.projectLocal(session);
    }
    if (this.searchedTopic === topic) return undefined;
    this.searchedTopic = topic;
    this.searchOperations += 1;
    const result = await this.options.port.search({ query, context: "Historical memory only; current instructions, repository evidence, contracts, permissions, and fresh verification take precedence.", maximumResults: 16, kinds: allKinds }, boundedSignal(signal, this.options.operationTimeoutMs ?? 2_500));
    if (result.status !== "success") { this.noteFailure(result.status, "recall"); return this.projectLocal(session); }
    const local = session.length > 0 ? session : this.promotions.pendingCandidates().map(candidateObservation);
    const projection = projectScopedRecall({ durable: result.value.records, session: local, currentProjectIdentity: this.currentProjectIdentity, currentSessionId: this.currentSessionId, durableTokenBudget: this.options.durableRecallTokens ?? 1_024, sessionTokenBudget: this.options.sessionRecallTokens ?? 512 });
    this.activeProjection = projection;
    this.lastRecall = `success:${projection.durableIds.length}:${projection.hash.slice(0, 12)}`;
    this.provider = "ready";
    this.lastProviderError = undefined;
    return projection.text ? projection : undefined;
  }

  authorize(): void {
    this.externallyRevoked = false;
    // A new grant starts a fresh provider diagnostic epoch. It does not claim
    // connectivity, but must not retain outcomes from the revoked epoch.
    this.provider = "unarmed";
    this.lastCheckpoint = "not-attempted";
    this.lastRecall = "not-attempted";
    this.lastProviderError = undefined;
    this.invalidateProjection();
  }
  revoke(): void { this.externallyRevoked = true; this.provider = "unarmed"; this.lastCheckpoint = "standing-policy-revoked"; this.lastRecall = "standing-policy-revoked"; this.lastProviderError = undefined; this.invalidateProjection(); }

  shutdown(): void {
    this.enabled = false;
    this.promotions.clear();
    this.sources.clear();
    this.inflight.clear();
    this.invalidateProjection();
  }

  status(): AutomaticMemoryStatus {
    const versionCompatible = this.options.providerVersionCompatible ? this.options.providerVersionCompatible() === true : Boolean(this.options.port);
    const authorityArmed = this.options.authorityArmed ? this.options.authorityArmed() === true : Boolean(this.options.port);
    return Object.freeze({ enabled: this.enabled, armed: Boolean(this.options.port) && !this.externallyRevoked && authorityArmed && versionCompatible, versionCompatible, provider: this.provider, pendingCount: this.promotions.pendingCandidates().length, activeWorkCount: this.inflight.size, ...(this.lastCutoffHash ? { lastCutoffHash: this.lastCutoffHash } : {}), lastCheckpoint: this.lastCheckpoint, lastRecall: this.lastRecall, ...(this.lastProviderError ? { lastProviderError: this.lastProviderError } : {}), recalledIds: Object.freeze([...(this.activeProjection?.durableIds ?? [])].slice(0, 16)), rejectedCount: this.rejectedCount, lastCaptureStatus: this.lastCaptureStatus, cost: Object.freeze({ observerInvocations: this.observerInvocations, searchOperations: this.searchOperations, checkpointOperations: this.checkpointOperations }) });
  }

  private track(settlement?: Promise<ObserverExtractionResult>): void {
    if (!settlement || this.inflight.has(settlement)) return;
    this.inflight.add(settlement);
    void settlement.catch(() => { this.rejectedCount += 1; }).finally(() => this.inflight.delete(settlement));
  }

  private stageExtraction(result: ObserverExtractionResult): void {
    if (!this.enabled) return;
    this.observerInvocations += 1;
    for (const candidate of result.accepted) {
      const staged = this.promotions.stage(candidate);
      if (!staged.accepted) this.rejectedCount += 1;
    }
    this.rejectedCount += result.rejected.length;
  }

  private projectLocal(session: readonly AtomicObservation[]): ScopedRecallProjection | undefined {
    const local = session.length > 0 ? session : this.promotions.pendingCandidates().map(candidateObservation);
    const projection = projectScopedRecall({ durable: [], session: local, currentProjectIdentity: this.currentProjectIdentity, currentSessionId: this.currentSessionId, durableTokenBudget: this.options.durableRecallTokens ?? 1_024, sessionTokenBudget: this.options.sessionRecallTokens ?? 512 });
    this.activeProjection = projection;
    return projection.text ? projection : undefined;
  }

  private noteFailure(status: MemPalacePortFailure, operation: string): void {
    this.provider = status === "denied" || status === "auth-required" ? "unarmed" : "degraded";
    const value = `${operation}-${status}`;
    this.lastProviderError = `${operation}:${status}`;
    if (operation === "recall") this.lastRecall = value; else this.lastCheckpoint = value;
  }

  private invalidateProjection(): void { this.activeTopic = undefined; this.activeProjection = undefined; this.searchedTopic = undefined; }
}

const allKinds: readonly MemoryKind[] = ["preference", "reusable-solution", "project-decision", "recovery-point"];
function candidateObservation(candidate: AutomaticMemoryCandidate): AtomicObservation {
  return Object.freeze({ schemaVersion: 1, id: candidate.id, sessionId: candidate.sourceCutoff.sessionId, agentId: "memory-observer", branchId: candidate.sourceCutoff.branchId, eventId: candidate.sourceCutoff.coversUpToId, summary: candidate.content, confidence: candidate.confidence, createdAt: "1970-01-01T00:00:00.000Z" });
}

function boundedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("automatic memory operation timeout is invalid");
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function receipt(candidate: AutomaticMemoryCandidate, outcome: PromotionReceipt["outcome"], providerIds: readonly string[]): PromotionReceipt {
  return Object.freeze({ schemaVersion: 1, candidateId: candidate.id, fingerprint: candidate.fingerprint, target: "mempalace-reconciliation", outcome, settledAt: new Date().toISOString(), providerIds: Object.freeze([...providerIds]) });
}
