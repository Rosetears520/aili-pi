import { digest, isRecord } from "./contracts.js";
import type { NativeCompactionReason } from "./compaction.js";

export type CheckpointPolicy = "deterministic-first" | "native-only";
export type CheckpointSource = "rescue" | "auto-rescue" | "external";
export type CheckpointCoordinatorState =
  | "idle"
  | "scheduled"
  | "invoking"
  | "inFlight"
  | "awaitingEpoch"
  | "succeeded"
  | "failed"
  | "invalidated";

export interface RecoveryTuple {
  sessionId: string;
  branchId: string;
  epochId: string;
}

export interface NativeOnlyCompactPermit {
  readonly permitId: string;
  readonly requestId: string;
  readonly tuple: RecoveryTuple;
  readonly expectedReason: "manual";
  readonly expectedHookOrdinal: number;
  state: "armed" | "consumed" | "invalid";
}

export interface ManualCompactPermit {
  readonly permitId: string;
  readonly requestId: string;
  readonly tuple: RecoveryTuple;
  readonly turnId: string;
  state: "armed" | "consumed" | "invalid";
}

export interface CheckpointCoordinatorSnapshot {
  readonly tuple: RecoveryTuple;
  readonly state: CheckpointCoordinatorState;
  readonly inFlight: boolean;
  readonly requestId?: string;
  readonly source?: CheckpointSource;
  readonly policy?: CheckpointPolicy;
  readonly requestSerial: number;
  readonly hookOrdinal: number;
  readonly permitState?: NativeOnlyCompactPermit["state"];
  readonly lastErrorCode?: string;
  readonly staleCallbackCount: number;
  readonly rescueCount: number;
  readonly deterministicCheckpointCount: number;
  readonly nativeFallbackCount: number;
}

interface CurrentRequest {
  id: string;
  serial: number;
  source: CheckpointSource;
  policy: CheckpointPolicy;
  tuple: RecoveryTuple;
  epochObserved: boolean;
  compactInvoked: boolean;
}

export interface BeforeCompactObservation {
  readonly ordinal: number;
  readonly policy: CheckpointPolicy;
  readonly requestId: string;
  readonly source: CheckpointSource;
  readonly adopted: boolean;
  readonly nativePermitConsumed: boolean;
}

export interface CheckpointScheduleResult {
  readonly accepted: boolean;
  readonly requestId?: string;
  readonly code: "scheduled" | "checkpoint-busy" | "invalid-tuple";
}

const ERROR_CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Session-scoped owner for every public or host-created checkpoint attempt.
 * It deliberately contains no timers and no persistence: lifecycle hooks own
 * invalidation, while the persisted CompactionEntry is the only success proof.
 */
export class CheckpointCoordinator {
  private tuple: RecoveryTuple;
  private state: CheckpointCoordinatorState = "idle";
  private current?: CurrentRequest;
  private permit?: NativeOnlyCompactPermit;
  private requestSerial = 0;
  private hookOrdinal = 0;
  private lastErrorCode?: string;
  private staleCallbackCount = 0;
  private rescueCount = 0;
  private deterministicCheckpointCount = 0;
  private nativeFallbackCount = 0;

  constructor(tuple: RecoveryTuple) {
    assertTuple(tuple);
    this.tuple = cloneTuple(tuple);
  }

  snapshot(): CheckpointCoordinatorSnapshot {
    return {
      tuple: cloneTuple(this.tuple),
      state: this.state,
      inFlight: this.state === "invoking" || this.state === "inFlight" || this.state === "awaitingEpoch",
      ...(this.current ? { requestId: this.current.id, source: this.current.source, policy: this.current.policy } : {}),
      requestSerial: this.requestSerial,
      hookOrdinal: this.hookOrdinal,
      ...(this.permit ? { permitState: this.permit.state } : {}),
      ...(this.lastErrorCode ? { lastErrorCode: this.lastErrorCode } : {}),
      staleCallbackCount: this.staleCallbackCount,
      rescueCount: this.rescueCount,
      deterministicCheckpointCount: this.deterministicCheckpointCount,
      nativeFallbackCount: this.nativeFallbackCount,
    };
  }

  schedule(source: Exclude<CheckpointSource, "external">, policy: CheckpointPolicy): CheckpointScheduleResult {
    if (!validTuple(this.tuple)) return { accepted: false, code: "invalid-tuple" };
    if (isNonTerminal(this.state)) return { accepted: false, code: "checkpoint-busy" };
    this.clearTerminalForNextRequest();
    const serial = ++this.requestSerial;
    const id = `ckp_${digest({ schema: "checkpoint-request-v1", tuple: this.tuple, serial, source, policy })}`;
    this.current = { id, serial, source, policy, tuple: cloneTuple(this.tuple), epochObserved: false, compactInvoked: false };
    this.state = "scheduled";
    this.lastErrorCode = undefined;
    if (source === "rescue") this.rescueCount += 1;
    return { accepted: true, requestId: id, code: "scheduled" };
  }

  /** Calls the public fire-and-forget compact API exactly once. */
  invoke(
    requestId: string,
    compact: (callbacks: { onComplete: () => void; onError: (error: Error) => void }) => void,
  ): boolean {
    const request = this.current;
    if (!request || request.id !== requestId || this.state !== "scheduled" || request.compactInvoked) return false;
    request.compactInvoked = true;
    this.state = "invoking";
    if (request.policy === "native-only") {
      const expectedHookOrdinal = this.hookOrdinal + 1;
      this.permit = {
        permitId: `ncp_${digest({ schema: "native-only-permit-v1", requestId, tuple: request.tuple, expectedHookOrdinal })}`,
        requestId,
        tuple: cloneTuple(request.tuple),
        expectedReason: "manual",
        expectedHookOrdinal,
        state: "armed",
      };
    }
    try {
      compact({
        onComplete: () => this.onComplete(requestId),
        onError: (error) => this.onError(requestId, boundedErrorCode(error)),
      });
      if (this.current?.id === requestId && this.state === "invoking") this.state = "inFlight";
      return true;
    } catch (error) {
      this.failCurrent("compact-invocation-threw");
      return false;
    }
  }

  /**
   * Observes every host hook before planning. Unowned events are adopted so a
   * simultaneous idle auto-rescue cannot issue a duplicate public call.
   */
  observeBeforeCompact(reason: NativeCompactionReason, tuple: RecoveryTuple): BeforeCompactObservation {
    this.hookOrdinal += 1;
    const ordinal = this.hookOrdinal;
    let adopted = false;
    if (!this.current || !isNonTerminal(this.state)) {
      this.clearTerminalForNextRequest();
      const serial = ++this.requestSerial;
      const requestId = `ckp_${digest({ schema: "checkpoint-external-v1", tuple, serial, reason, ordinal })}`;
      this.current = {
        id: requestId,
        serial,
        source: "external",
        policy: "deterministic-first",
        tuple: cloneTuple(tuple),
        epochObserved: false,
        compactInvoked: false,
      };
      this.state = "inFlight";
      adopted = true;
    }

    const request = this.current!;
    let policy: CheckpointPolicy = "deterministic-first";
    let nativePermitConsumed = false;
    if (reason === "manual" && this.permit?.state === "armed") {
      const matches = this.permit.requestId === request.id
        && request.policy === "native-only"
        && sameTuple(this.permit.tuple, tuple)
        && sameTuple(request.tuple, tuple)
        && this.permit.expectedHookOrdinal === ordinal;
      if (matches) {
        this.permit.state = "consumed";
        policy = "native-only";
        nativePermitConsumed = true;
      } else {
        this.permit.state = "invalid";
      }
    }
    return { ordinal, policy, requestId: request.id, source: request.source, adopted, nativePermitConsumed };
  }

  onComplete(requestId: string): void {
    if (!this.current || this.current.id !== requestId || !isNonTerminal(this.state)) {
      this.staleCallbackCount = boundedIncrement(this.staleCallbackCount);
      return;
    }
    if (this.current.epochObserved) this.succeedCurrent();
    else this.state = "awaitingEpoch";
  }

  onError(requestId: string, code = "compact-callback-error"): void {
    if (!this.current || this.current.id !== requestId || !isNonTerminal(this.state)) {
      this.staleCallbackCount = boundedIncrement(this.staleCallbackCount);
      return;
    }
    this.failCurrent(code);
  }

  /** A persisted new CompactionEntry is the sole authoritative success. */
  observeEpoch(tupleBefore: RecoveryTuple, epochId: string, origin: "deterministic" | "native" | "unverified"): boolean {
    if (!epochId || epochId === tupleBefore.epochId || !sameTuple(this.tuple, tupleBefore)) return false;
    const request = this.current;
    if (request && isNonTerminal(this.state) && sameTuple(request.tuple, tupleBefore)) {
      request.epochObserved = true;
      if (origin === "deterministic") this.deterministicCheckpointCount = boundedIncrement(this.deterministicCheckpointCount);
      if (origin === "native") this.nativeFallbackCount = boundedIncrement(this.nativeFallbackCount);
      this.succeedCurrent();
    }
    this.tuple = { ...cloneTuple(tupleBefore), epochId };
    return true;
  }

  /** An external attempt without a persisted epoch cannot remain in flight. */
  settleWithoutEpoch(): void {
    if (this.current?.source === "external" && isNonTerminal(this.state) && !this.current.epochObserved) {
      this.failCurrent("settled-without-epoch");
    }
  }

  invalidate(nextTuple: RecoveryTuple, code = "lifecycle-invalidated"): void {
    assertTuple(nextTuple);
    if (this.permit?.state === "armed") this.permit.state = "invalid";
    if (isNonTerminal(this.state)) {
      this.state = "invalidated";
      this.lastErrorCode = safeCode(code);
    }
    this.current = undefined;
    this.permit = undefined;
    this.tuple = cloneTuple(nextTuple);
  }

  private succeedCurrent(): void {
    if (this.permit?.state === "armed") this.permit.state = "invalid";
    this.permit = undefined;
    this.state = "succeeded";
    this.lastErrorCode = undefined;
  }

  private failCurrent(code: string): void {
    if (this.permit?.state === "armed") this.permit.state = "invalid";
    this.permit = undefined;
    this.state = "failed";
    this.lastErrorCode = safeCode(code);
  }

  private clearTerminalForNextRequest(): void {
    if (!isNonTerminal(this.state)) {
      this.current = undefined;
      this.permit = undefined;
      this.state = "idle";
    }
  }
}

export type PressureStage = "NORMAL" | "PRESSURE" | "FORCE_SEMANTIC" | "CHECKPOINT_REQUIRED" | "OVERFLOW_RECOVERY";
export type UsageEstimateSource = "observed" | "fallback" | "Unverified";

export interface PressureBudget {
  discoveryInputTokens: number;
  summaryOutputTokens: number;
  toolProtocolTokens: number;
  recapProjectionTokens: number;
  continuationSafetyTokens: number;
  hostReserveTokens: number;
}

export const DEFAULT_PRESSURE_BUDGET: Readonly<PressureBudget> = Object.freeze({
  discoveryInputTokens: 2_048,
  summaryOutputTokens: 4_096,
  toolProtocolTokens: 2_048,
  recapProjectionTokens: 2_048,
  continuationSafetyTokens: 4_096,
  hostReserveTokens: 8_192,
});

export type MiMoContextPolicyStatus = "enabled" | "disabled";
export type MiMoContextPolicyDisabledReason = "invalid" | "zero" | "reserve-exhausted";
export type MiMoPressureLevel = 0 | 1 | 2 | 3;

export interface MiMoContextPolicyInput {
  contextWindow?: number;
  maxOutputTokens?: number;
  observedTokens?: number | null;
  fallbackTokens?: number;
}

/** Pure provider-window policy; it never writes checkpoints or invokes compaction. */
export interface MiMoContextPolicy {
  readonly status: MiMoContextPolicyStatus;
  readonly disabledReason?: MiMoContextPolicyDisabledReason;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly outputReserveTokens: number;
  readonly recoveryReserveTokens: number;
  readonly safeBudgetTokens: number;
  readonly recoveryThresholdTokens: number;
  readonly checkpointCeilingTokens: number;
  readonly checkpointThresholdTokens: readonly number[];
  readonly contextTokens: number;
  readonly source: UsageEstimateSource;
  readonly pressureLevel: MiMoPressureLevel;
}

export function resolveMiMoContextPolicy(input: MiMoContextPolicyInput): MiMoContextPolicy {
  const usage = resolveUsageEstimate(input.observedTokens, input.fallbackTokens);
  const contextWindow = input.contextWindow;
  const maxOutputTokens = input.maxOutputTokens;
  if (!validToken(contextWindow) || !validToken(maxOutputTokens)) {
    return disabledMiMoContextPolicy(usage, "invalid");
  }
  if (contextWindow === 0 || maxOutputTokens === 0) {
    return disabledMiMoContextPolicy(usage, "zero", contextWindow, maxOutputTokens);
  }

  const outputReserveTokens = Math.min(maxOutputTokens, 20_000);
  const recoveryReserveTokens = Math.min(maxOutputTokens, 20_000);
  const safeBudgetTokens = contextWindow - outputReserveTokens - recoveryReserveTokens;
  if (safeBudgetTokens <= 0) {
    return disabledMiMoContextPolicy(usage, "reserve-exhausted", contextWindow, maxOutputTokens);
  }

  const checkpointCeilingTokens = safeBudgetTokens - 13_000;
  const checkpointThresholdTokens = Object.freeze(applyCheckpointCeiling(
    defaultCheckpointThresholds(safeBudgetTokens),
    checkpointCeilingTokens,
  ));
  return {
    status: "enabled",
    contextWindow,
    maxOutputTokens,
    outputReserveTokens,
    recoveryReserveTokens,
    safeBudgetTokens,
    recoveryThresholdTokens: safeBudgetTokens,
    checkpointCeilingTokens,
    checkpointThresholdTokens,
    contextTokens: usage.contextTokens,
    source: usage.source,
    pressureLevel: resolveMiMoPressureLevel(safeBudgetTokens, usage.contextTokens),
  };
}

export interface MiMoCheckpointSnapshot {
  readonly sourceBinding: string;
  readonly thresholdTokens: number;
  readonly safeBudgetTokens: number;
}

export type MiMoCheckpointFailure = "deterministic" | "transient" | "unclassified";
export type MiMoRecoveryAction = "none" | "rebuild" | "native-fallback";

/** Select bounded rebuild before the one native fallback for a recovery request. */
export function resolveMiMoRecoveryAction(input: {
  requested: boolean;
  checkpoint: MiMoCheckpointSnapshot | undefined;
  sourceBinding: string | undefined;
}): MiMoRecoveryAction {
  if (!input.requested) return "none";
  return input.sourceBinding !== undefined
    && input.checkpoint?.sourceBinding === input.sourceBinding
    ? "rebuild"
    : "native-fallback";
}

interface PendingMiMoCheckpoint {
  snapshot: MiMoCheckpointSnapshot;
  retry: boolean;
  retryAtTokens?: number;
}

interface MiMoFinalRetryGate {
  thresholdTokens: number;
  safeBudgetTokens: number;
  retryAtTokens: number;
}

/**
 * Tracks the latest prepared recovery boundary for one session. The extension
 * supplies the source binding and owns any persisted representation; this
 * helper only prevents duplicate threshold preparation and stale reuse.
 */
export class MiMoCheckpointTracker {
  private settled = new Set<number>();
  private current?: MiMoCheckpointSnapshot;
  private pending?: PendingMiMoCheckpoint;
  private retry?: MiMoFinalRetryGate;

  /**
   * Reserves one newly crossed threshold without replacing the last usable
   * checkpoint. The caller commits it only after its durable checkpoint record
   * was appended successfully.
   */
  prepare(policy: MiMoContextPolicy, sourceBinding: string): MiMoCheckpointSnapshot | undefined {
    if (policy.status !== "enabled" || !sourceBinding || this.pending) return undefined;
    if (this.retry && this.retry.safeBudgetTokens === policy.safeBudgetTokens) {
      const finalThreshold = policy.checkpointThresholdTokens.at(-1);
      if (finalThreshold === this.retry.thresholdTokens && policy.contextTokens >= this.retry.retryAtTokens) {
        const snapshot = Object.freeze({
          sourceBinding,
          thresholdTokens: finalThreshold,
          safeBudgetTokens: policy.safeBudgetTokens,
        });
        this.pending = { snapshot, retry: true };
        this.retry = undefined;
        return this.snapshotPending();
      }
      return undefined;
    }
    this.retry = undefined;
    const threshold = policy.checkpointThresholdTokens
      .filter((value) => value <= policy.contextTokens)
      .at(-1);
    if (threshold === undefined || this.settled.has(threshold)) return undefined;
    const snapshot = Object.freeze({
      sourceBinding,
      thresholdTokens: threshold,
      safeBudgetTokens: policy.safeBudgetTokens,
    });
    this.pending = {
      snapshot,
      retry: false,
      retryAtTokens: finalCheckpointRetryAt(policy, threshold),
    };
    return this.snapshotPending();
  }

  /** Commits a checkpoint only after the owner has durably recorded it. */
  commit(snapshot: MiMoCheckpointSnapshot): boolean {
    if (!this.pending || !sameMiMoCheckpoint(this.pending.snapshot, snapshot)) return false;
    this.settled.add(snapshot.thresholdTokens);
    this.current = this.pending.snapshot;
    this.pending = undefined;
    return true;
  }

  /** Drops an uncommitted writer while preserving the latest usable checkpoint. */
  reject(snapshot: MiMoCheckpointSnapshot, failure: MiMoCheckpointFailure = "unclassified"): void {
    if (!this.pending || !sameMiMoCheckpoint(this.pending.snapshot, snapshot)) return;
    const pending = this.pending;
    this.pending = undefined;
    this.settled.add(snapshot.thresholdTokens);
    if (failure === "transient" && !pending.retry && pending.retryAtTokens !== undefined) {
      this.retry = {
        thresholdTokens: snapshot.thresholdTokens,
        safeBudgetTokens: snapshot.safeBudgetTokens,
        retryAtTokens: pending.retryAtTokens,
      };
    }
  }

  /** Compatibility helper for callers that own no durable write boundary. */
  observe(policy: MiMoContextPolicy, sourceBinding: string): MiMoCheckpointSnapshot | undefined {
    const prepared = this.prepare(policy, sourceBinding);
    if (!prepared || !this.commit(prepared)) return undefined;
    return this.snapshot();
  }

  snapshot(): MiMoCheckpointSnapshot | undefined {
    return this.current ? { ...this.current } : undefined;
  }

  private snapshotPending(): MiMoCheckpointSnapshot | undefined {
    return this.pending ? { ...this.pending.snapshot } : undefined;
  }

  matches(sourceBinding: string): boolean {
    return this.current?.sourceBinding === sourceBinding;
  }

  /** A failed rebuild cannot bypass the bounded native fallback. */
  invalidate(sourceBinding: string): boolean {
    if (!this.matches(sourceBinding)) return false;
    this.current = undefined;
    return true;
  }

  reset(): void {
    this.settled.clear();
    this.current = undefined;
    this.pending = undefined;
    this.retry = undefined;
  }
}

function sameMiMoCheckpoint(left: MiMoCheckpointSnapshot, right: MiMoCheckpointSnapshot): boolean {
  return left.sourceBinding === right.sourceBinding
    && left.thresholdTokens === right.thresholdTokens
    && left.safeBudgetTokens === right.safeBudgetTokens;
}

function finalCheckpointRetryAt(policy: MiMoContextPolicy, thresholdTokens: number): number | undefined {
  const thresholds = policy.checkpointThresholdTokens;
  if (thresholdTokens !== thresholds.at(-1)) return undefined;
  const previousThreshold = thresholds.at(-2) ?? 0;
  const normalStep = thresholdTokens - previousThreshold;
  const retryAtTokens = Math.min(policy.checkpointCeilingTokens, thresholdTokens + normalStep);
  return retryAtTokens > thresholdTokens ? retryAtTokens : undefined;
}

export interface PressureObservation {
  stage: PressureStage;
  headroomTokens: number;
  source: UsageEstimateSource;
  contextTokens: number;
  contextWindow: number;
  semanticAttemptBudget: number;
  pressureAt: number;
  forceSemanticAt: number;
  hardCheckpointAt: number;
  mimo: MiMoContextPolicy;
}

export function observePressure(input: {
  contextTokens?: number | null;
  contextWindow?: number;
  maxOutputTokens?: number;
  fallbackTokens?: number;
  overflow?: boolean;
  budget?: Partial<PressureBudget>;
}): PressureObservation {
  const budget = validPressureBudget({ ...DEFAULT_PRESSURE_BUDGET, ...input.budget });
  const semanticAttemptBudget = saturatingSum([
    budget.discoveryInputTokens,
    budget.summaryOutputTokens,
    budget.toolProtocolTokens,
    budget.recapProjectionTokens,
    budget.continuationSafetyTokens,
  ]);
  const contextWindow = validToken(input.contextWindow) && input.contextWindow! > 0 ? input.contextWindow! : 0;
  const observed = validToken(input.contextTokens ?? undefined) ? input.contextTokens! : undefined;
  const fallback = validToken(input.fallbackTokens) ? input.fallbackTokens! : undefined;
  const contextTokens = observed ?? fallback ?? contextWindow;
  const source: UsageEstimateSource = observed !== undefined ? "observed" : fallback !== undefined ? "fallback" : "Unverified";
  const mimo = resolveMiMoContextPolicy({
    contextWindow: input.contextWindow,
    maxOutputTokens: input.maxOutputTokens,
    observedTokens: input.contextTokens,
    fallbackTokens: input.fallbackTokens,
  });
  const legacyHardCheckpointAt = Math.min(
    Math.max(0, contextWindow - budget.hostReserveTokens),
    Math.floor(contextWindow * 0.90),
  );
  const hardCheckpointAt = mimo.status === "enabled" ? mimo.recoveryThresholdTokens : legacyHardCheckpointAt;
  // Named stages remain a presentation/suffix compatibility surface. For a
  // resolved MiMo policy they are derived from the dynamic safe budget, never
  // the prior fixed reserve ladder and never a recovery authorization.
  const pressureAt = mimo.status === "enabled"
    ? percentageFloor(mimo.safeBudgetTokens, 50)
    : Math.max(0, hardCheckpointAt - semanticAttemptBudget * 2);
  const forceSemanticAt = mimo.status === "enabled"
    ? percentageFloor(mimo.safeBudgetTokens, 70)
    : Math.max(0, hardCheckpointAt - semanticAttemptBudget);
  const stage: PressureStage = input.overflow === true
    ? "OVERFLOW_RECOVERY"
    : mimo.status === "enabled"
      ? contextTokens >= mimo.recoveryThresholdTokens
        ? "CHECKPOINT_REQUIRED"
        : mimo.pressureLevel >= 2
          ? "FORCE_SEMANTIC"
          : mimo.pressureLevel === 1
            ? "PRESSURE"
            : "NORMAL"
      : input.maxOutputTokens !== undefined || contextWindow === 0
        ? "NORMAL"
        : contextTokens >= hardCheckpointAt
          ? "CHECKPOINT_REQUIRED"
          : contextTokens >= forceSemanticAt
            ? "FORCE_SEMANTIC"
            : contextTokens >= pressureAt
              ? "PRESSURE"
              : "NORMAL";
  return {
    stage,
    headroomTokens: Math.max(0, hardCheckpointAt - contextTokens),
    source,
    contextTokens,
    contextWindow,
    semanticAttemptBudget,
    pressureAt,
    forceSemanticAt,
    hardCheckpointAt,
    mimo,
  };
}

export interface PressureCycleSnapshot {
  tuple: RecoveryTuple;
  serial: number;
  semanticAttempted: boolean;
  checkpointScheduled: boolean;
  checkpointInFlight: boolean;
  checkpointAttempted: boolean;
}

export class PressureCycle {
  private value: PressureCycleSnapshot;

  constructor(tuple: RecoveryTuple) {
    assertTuple(tuple);
    this.value = freshCycle(tuple, 1);
  }

  snapshot(): PressureCycleSnapshot {
    return { ...this.value, tuple: cloneTuple(this.value.tuple) };
  }

  markSemanticAttempted(): boolean {
    if (this.value.semanticAttempted) return false;
    this.value.semanticAttempted = true;
    return true;
  }

  markCheckpointScheduled(): boolean {
    if (this.value.checkpointScheduled || this.value.checkpointAttempted) return false;
    this.value.checkpointScheduled = true;
    return true;
  }

  markCheckpointInvoked(): boolean {
    if (this.value.checkpointAttempted) return false;
    this.value.checkpointScheduled = true;
    this.value.checkpointInFlight = true;
    this.value.checkpointAttempted = true;
    return true;
  }

  markCheckpointTerminal(): void {
    this.value.checkpointInFlight = false;
  }

  resetForEpoch(tuple: RecoveryTuple): void {
    assertTuple(tuple);
    this.value = freshCycle(tuple, this.value.serial + 1);
  }

  resetForVerifiedDrop(tuple: RecoveryTuple, observation: PressureObservation): boolean {
    if (observation.source !== "observed") return false;
    const resetThreshold = observation.mimo.status === "enabled"
      ? observation.pressureAt
      : Math.max(0, observation.forceSemanticAt - observation.semanticAttemptBudget);
    if (observation.contextTokens >= resetThreshold) return false;
    this.value = freshCycle(tuple, this.value.serial + 1);
    return true;
  }
}

export interface PiCompactionEnvelope {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
}

export interface CheckpointAttemptIdentityInput {
  sessionId: string;
  branchId: string;
  epochId: string;
  reason: NativeCompactionReason;
  willRetry: boolean;
  preparation: unknown;
  branchEntries: unknown;
  replayState: unknown;
  config: unknown;
  policy: CheckpointPolicy;
}

export function checkpointAttemptId(input: CheckpointAttemptIdentityInput): string {
  return digest({
    schema: "checkpoint-attempt-v1",
    sessionId: input.sessionId,
    branchId: input.branchId,
    epochId: input.epochId,
    reason: input.reason,
    willRetry: input.willRetry,
    preparationDigest: digest(input.preparation),
    branchEntryDigest: digest(input.branchEntries),
    replayStateDigest: digest(input.replayState),
    configDigest: digest(input.config),
    policy: input.policy,
  });
}

export type CheckpointAttemptResult =
  | { status: "eligible"; attemptId: string; compaction: PiCompactionEnvelope; cacheHit: boolean }
  | { status: "ineligible"; attemptId: string; code: string; cacheHit: boolean }
  | { status: "error"; attemptId: string; code: string; cacheHit: false };

type CachedAttempt =
  | { status: "eligible"; guardDigest: string; compaction: PiCompactionEnvelope }
  | { status: "ineligible"; guardDigest: string; code: string };

/** Immutable terminal cache; exceptions and partial results are never stored. */
export class CheckpointAttemptCache {
  private readonly attempts = new Map<string, CachedAttempt>();

  size(): number { return this.attempts.size; }
  clear(): void { this.attempts.clear(); }

  evaluate(
    input: CheckpointAttemptIdentityInput & { enabled: boolean; deterministic: boolean },
    planner: () => PiCompactionEnvelope | undefined,
  ): CheckpointAttemptResult | undefined {
    if (!input.enabled || !input.deterministic || input.policy === "native-only") return undefined;
    const attemptId = checkpointAttemptId(input);
    const guardDigest = attemptGuardDigest(input);
    const cached = this.attempts.get(attemptId);
    if (cached && cached.guardDigest === guardDigest) {
      return cached.status === "eligible"
        ? { status: "eligible", attemptId, compaction: cloneEnvelope(cached.compaction), cacheHit: true }
        : { status: "ineligible", attemptId, code: cached.code, cacheHit: true };
    }
    try {
      const compaction = planner();
      if (compaction === undefined) {
        const value: CachedAttempt = { status: "ineligible", guardDigest, code: "planner-ineligible" };
        this.attempts.set(attemptId, value);
        return { status: "ineligible", attemptId, code: value.code, cacheHit: false };
      }
      if (!validCompactionEnvelope(compaction)) {
        const value: CachedAttempt = { status: "ineligible", guardDigest, code: "invalid-envelope" };
        this.attempts.set(attemptId, value);
        return { status: "ineligible", attemptId, code: value.code, cacheHit: false };
      }
      const value: CachedAttempt = { status: "eligible", guardDigest, compaction: cloneEnvelope(compaction) };
      this.attempts.set(attemptId, value);
      return { status: "eligible", attemptId, compaction: cloneEnvelope(compaction), cacheHit: false };
    } catch {
      return { status: "error", attemptId, code: "planner-threw", cacheHit: false };
    }
  }
}

export function validCompactionEnvelope(value: unknown): value is PiCompactionEnvelope {
  if (!isRecord(value)) return false;
  const allowed = new Set(["summary", "firstKeptEntryId", "tokensBefore", "details"]);
  return Object.keys(value).every((key) => allowed.has(key))
    && typeof value.summary === "string" && value.summary.length > 0 && value.summary.length <= 12_000
    && typeof value.firstKeptEntryId === "string" && value.firstKeptEntryId.length > 0 && value.firstKeptEntryId.length <= 256
    && validToken(value.tokensBefore);
}

function attemptGuardDigest(input: CheckpointAttemptIdentityInput): string {
  return digest({
    tuple: [input.sessionId, input.branchId, input.epochId],
    preparation: input.preparation,
    entries: input.branchEntries,
    replay: input.replayState,
    config: input.config,
  });
}

function cloneEnvelope(value: PiCompactionEnvelope): PiCompactionEnvelope {
  return structuredClone(value);
}

function freshCycle(tuple: RecoveryTuple, serial: number): PressureCycleSnapshot {
  return {
    tuple: cloneTuple(tuple), serial,
    semanticAttempted: false, checkpointScheduled: false,
    checkpointInFlight: false, checkpointAttempted: false,
  };
}

function isNonTerminal(state: CheckpointCoordinatorState): boolean {
  return state === "scheduled" || state === "invoking" || state === "inFlight" || state === "awaitingEpoch";
}

function validTuple(value: RecoveryTuple): boolean {
  return [value.sessionId, value.branchId, value.epochId].every((part) => typeof part === "string" && part.length > 0 && part.length <= 512);
}

function assertTuple(value: RecoveryTuple): void {
  if (!validTuple(value)) throw new TypeError("invalid recovery tuple");
}

function cloneTuple(value: RecoveryTuple): RecoveryTuple {
  return { sessionId: value.sessionId, branchId: value.branchId, epochId: value.epochId };
}

function sameTuple(left: RecoveryTuple, right: RecoveryTuple): boolean {
  return left.sessionId === right.sessionId && left.branchId === right.branchId && left.epochId === right.epochId;
}

function resolveUsageEstimate(observedValue: number | null | undefined, fallbackValue: number | undefined): {
  contextTokens: number;
  source: UsageEstimateSource;
} {
  const observedCandidate = observedValue ?? undefined;
  const observed = validToken(observedCandidate) ? observedCandidate : undefined;
  const fallback = validToken(fallbackValue) ? fallbackValue : undefined;
  if (observed !== undefined) return { contextTokens: observed, source: "observed" };
  if (fallback !== undefined) return { contextTokens: fallback, source: "fallback" };
  return { contextTokens: 0, source: "Unverified" };
}

function disabledMiMoContextPolicy(
  usage: { contextTokens: number; source: UsageEstimateSource },
  disabledReason: MiMoContextPolicyDisabledReason,
  contextWindow = 0,
  maxOutputTokens = 0,
): MiMoContextPolicy {
  return {
    status: "disabled",
    disabledReason,
    contextWindow,
    maxOutputTokens,
    outputReserveTokens: 0,
    recoveryReserveTokens: 0,
    safeBudgetTokens: 0,
    recoveryThresholdTokens: 0,
    checkpointCeilingTokens: 0,
    checkpointThresholdTokens: Object.freeze([]),
    contextTokens: usage.contextTokens,
    source: usage.source,
    pressureLevel: 0,
  };
}

function defaultCheckpointThresholds(safeBudgetTokens: number): number[] {
  const percentages = safeBudgetTokens < 25_000
    ? []
    : safeBudgetTokens <= 200_000
      ? [20, 40, 60, 80]
      : safeBudgetTokens <= 500_000
        ? [10, 20, 30, 40, 50, 60, 70, 80, 90]
        : [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
  return percentages.map((percentage) => percentageFloor(safeBudgetTokens, percentage));
}

function applyCheckpointCeiling(thresholds: readonly number[], checkpointCeilingTokens: number): number[] {
  if (checkpointCeilingTokens <= 0) return [];
  const resolved: number[] = [];
  for (const threshold of thresholds) {
    if (threshold <= checkpointCeilingTokens) {
      resolved.push(threshold);
      continue;
    }
    resolved.push(checkpointCeilingTokens);
    break;
  }
  return resolved;
}

function resolveMiMoPressureLevel(safeBudgetTokens: number, contextTokens: number): MiMoPressureLevel {
  if (contextTokens < percentageCeiling(safeBudgetTokens, 50)) return 0;
  if (contextTokens < percentageCeiling(safeBudgetTokens, 70)) return 1;
  if (contextTokens < percentageCeiling(safeBudgetTokens, 85)) return 2;
  return 3;
}

function percentageFloor(total: number, percentage: number): number {
  return Math.floor(total / 100) * percentage + Math.floor((total % 100) * percentage / 100);
}

function percentageCeiling(total: number, percentage: number): number {
  return Math.floor(total / 100) * percentage + Math.ceil((total % 100) * percentage / 100);
}

function validToken(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validPressureBudget(value: PressureBudget): PressureBudget {
  for (const candidate of Object.values(value)) {
    if (!validToken(candidate)) throw new TypeError("invalid pressure budget");
  }
  return value;
}

function saturatingSum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (total > Number.MAX_SAFE_INTEGER - value) return Number.MAX_SAFE_INTEGER;
    total += value;
  }
  return total;
}

function boundedIncrement(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + 1);
}

function safeCode(code: string): string {
  return ERROR_CODE.test(code) ? code : "invalid-error-code";
}

function boundedErrorCode(error: Error): string {
  const name = error.name.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48);
  return safeCode(name || "compact-callback-error");
}
