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
    if (!epochId || !sameTuple(this.tuple, tupleBefore)) return false;
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
}

export function observePressure(input: {
  contextTokens?: number | null;
  contextWindow?: number;
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
  const hardCheckpointAt = Math.max(0, contextWindow - budget.hostReserveTokens);
  const forceSemanticAt = Math.max(0, hardCheckpointAt - semanticAttemptBudget);
  const pressureAt = Math.max(0, forceSemanticAt - semanticAttemptBudget);
  const stage: PressureStage = input.overflow === true
    ? "OVERFLOW_RECOVERY"
    : contextWindow === 0
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
    if (observation.source !== "observed"
      || observation.contextTokens > Math.max(0, observation.forceSemanticAt - observation.semanticAttemptBudget)) return false;
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
