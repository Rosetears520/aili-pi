import { describe, expect, it, vi } from "vitest";
import {
  CheckpointAttemptCache,
  CheckpointCoordinator,
  MiMoCheckpointTracker,
  PressureCycle,
  checkpointAttemptId,
  observePressure,
  resolveMiMoRecoveryAction,
  resolveMiMoContextPolicy,
  type CheckpointAttemptIdentityInput,
  type RecoveryTuple,
} from "../../src/runtime/aili-compact/recovery.js";

const tuple: RecoveryTuple = { sessionId: "session-1", branchId: "branch-1", epochId: "root" };

describe("checkpoint coordinator", () => {
  it("runs one deterministic rescue without a normal turn and rejects re-entry", () => {
    const coordinator = new CheckpointCoordinator(tuple);
    const scheduled = coordinator.schedule("rescue", "deterministic-first");
    expect(scheduled).toMatchObject({ accepted: true, code: "scheduled" });
    expect(coordinator.schedule("rescue", "native-only")).toEqual({ accepted: false, code: "checkpoint-busy" });

    const invoke = vi.fn();
    expect(coordinator.invoke(scheduled.requestId!, invoke)).toBe(true);
    expect(coordinator.invoke(scheduled.requestId!, invoke)).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot()).toMatchObject({ state: "inFlight", inFlight: true, rescueCount: 1 });
  });

  it("keeps a native-only permit one-use and exact across an interleaved threshold hook", () => {
    const coordinator = new CheckpointCoordinator(tuple);
    const scheduled = coordinator.schedule("rescue", "native-only");
    let callbacks!: { onComplete: () => void; onError: (error: Error) => void };
    coordinator.invoke(scheduled.requestId!, (value) => { callbacks = value; });

    const threshold = coordinator.observeBeforeCompact("threshold", tuple);
    expect(threshold).toMatchObject({ policy: "deterministic-first", nativePermitConsumed: false });
    expect(coordinator.snapshot().permitState).toBe("armed");

    // The reservation was for the next hook. An interleaving event makes the
    // later manual hook ordinal fail closed instead of leaking native policy.
    const manual = coordinator.observeBeforeCompact("manual", tuple);
    expect(manual).toMatchObject({ policy: "deterministic-first", nativePermitConsumed: false });
    expect(coordinator.snapshot().permitState).toBe("invalid");
    callbacks.onError(new Error("provider unavailable"));
    expect(coordinator.snapshot()).toMatchObject({ state: "failed", inFlight: false });
  });

  it("consumes the exact next native permit before returning native-only", () => {
    const coordinator = new CheckpointCoordinator(tuple);
    const scheduled = coordinator.schedule("rescue", "native-only");
    coordinator.invoke(scheduled.requestId!, () => undefined);
    expect(coordinator.observeBeforeCompact("manual", tuple)).toMatchObject({ policy: "native-only", nativePermitConsumed: true });
    expect(coordinator.observeBeforeCompact("manual", tuple)).toMatchObject({ policy: "deterministic-first", nativePermitConsumed: false });
  });

  it("waits for a persisted epoch and terminalizes callback/event races once", () => {
    const coordinator = new CheckpointCoordinator(tuple);
    const scheduled = coordinator.schedule("auto-rescue", "deterministic-first");
    let complete!: () => void;
    coordinator.invoke(scheduled.requestId!, ({ onComplete }) => { complete = onComplete; });
    complete();
    expect(coordinator.snapshot().state).toBe("awaitingEpoch");
    expect(coordinator.observeEpoch(tuple, "epoch-2", "deterministic")).toBe(true);
    expect(coordinator.snapshot()).toMatchObject({ state: "succeeded", deterministicCheckpointCount: 1 });
    complete();
    expect(coordinator.snapshot()).toMatchObject({ state: "succeeded", staleCallbackCount: 1 });
  });

  it("rejects a persisted entry that does not advance the epoch", () => {
    const coordinator = new CheckpointCoordinator(tuple);
    const scheduled = coordinator.schedule("auto-rescue", "deterministic-first");
    coordinator.invoke(scheduled.requestId!, () => undefined);
    expect(coordinator.observeEpoch(tuple, tuple.epochId, "native")).toBe(false);
    expect(coordinator.snapshot()).toMatchObject({ state: "inFlight", nativeFallbackCount: 0 });
  });

  it("adopts an external hook and clears it truthfully when no epoch persists", () => {
    const coordinator = new CheckpointCoordinator(tuple);
    expect(coordinator.observeBeforeCompact("overflow", tuple)).toMatchObject({ adopted: true, source: "external" });
    expect(coordinator.schedule("auto-rescue", "deterministic-first")).toEqual({ accepted: false, code: "checkpoint-busy" });
    coordinator.settleWithoutEpoch();
    expect(coordinator.snapshot()).toMatchObject({ state: "failed", lastErrorCode: "settled-without-epoch" });
  });

  it("invalidates stale lifecycle callbacks and tuple-scoped permits", () => {
    const coordinator = new CheckpointCoordinator(tuple);
    const scheduled = coordinator.schedule("rescue", "native-only");
    let complete!: () => void;
    coordinator.invoke(scheduled.requestId!, ({ onComplete }) => { complete = onComplete; });
    coordinator.invalidate({ ...tuple, branchId: "branch-2" });
    expect(coordinator.snapshot()).toMatchObject({ state: "invalidated", inFlight: false });
    expect(coordinator.snapshot().permitState).toBeUndefined();
    complete();
    expect(coordinator.snapshot().staleCallbackCount).toBe(1);
  });
});

describe("checkpoint attempt identity and cache", () => {
  const identity: CheckpointAttemptIdentityInput = {
    ...tuple,
    reason: "overflow",
    willRetry: true,
    preparation: { firstKeptEntryId: "keep", tokensBefore: 50_000, previousSummary: "prior" },
    branchEntries: [{ id: "a", type: "message" }],
    replayState: { active: ["b1"] },
    config: { checkpoint: { deterministic: true } },
    policy: "deterministic-first",
  };
  const envelope = { summary: "safe", firstKeptEntryId: "keep", tokensBefore: 50_000 };

  it("includes every recovery dimension in a deterministic attempt identity", () => {
    const first = checkpointAttemptId(identity);
    expect(first).toHaveLength(64);
    expect(checkpointAttemptId({ ...identity })).toBe(first);
    expect(checkpointAttemptId({ ...identity, willRetry: false })).not.toBe(first);
    expect(checkpointAttemptId({ ...identity, config: { checkpoint: { deterministic: false } } })).not.toBe(first);
  });

  it("caches immutable eligible and ineligible terminals but never exceptions", () => {
    const cache = new CheckpointAttemptCache();
    const planner = vi.fn(() => envelope);
    const first = cache.evaluate({ ...identity, enabled: true, deterministic: true }, planner);
    expect(first).toMatchObject({ status: "eligible", cacheHit: false, compaction: envelope });
    if (first?.status === "eligible") first.compaction.summary = "mutated clone";
    const second = cache.evaluate({ ...identity, enabled: true, deterministic: true }, planner);
    expect(second).toMatchObject({ status: "eligible", cacheHit: true, compaction: envelope });
    expect(planner).toHaveBeenCalledTimes(1);

    const ineligibleIdentity = { ...identity, reason: "threshold" as const };
    expect(cache.evaluate({ ...ineligibleIdentity, enabled: true, deterministic: true }, () => undefined)).toMatchObject({ status: "ineligible", cacheHit: false });
    expect(cache.evaluate({ ...ineligibleIdentity, enabled: true, deterministic: true }, () => envelope)).toMatchObject({ status: "ineligible", cacheHit: true });

    let calls = 0;
    const throwingIdentity = { ...identity, reason: "manual" as const };
    const throwing = () => { calls += 1; throw new Error("boom"); };
    expect(cache.evaluate({ ...throwingIdentity, enabled: true, deterministic: true }, throwing)).toMatchObject({ status: "error", cacheHit: false });
    expect(cache.evaluate({ ...throwingIdentity, enabled: true, deterministic: true }, throwing)).toMatchObject({ status: "error", cacheHit: false });
    expect(calls).toBe(2);
  });

  it("does not plan or mutate cache for off, deterministic-off, or native-only", () => {
    const cache = new CheckpointAttemptCache();
    const planner = vi.fn(() => envelope);
    expect(cache.evaluate({ ...identity, enabled: false, deterministic: true }, planner)).toBeUndefined();
    expect(cache.evaluate({ ...identity, enabled: true, deterministic: false }, planner)).toBeUndefined();
    expect(cache.evaluate({ ...identity, enabled: true, deterministic: true, policy: "native-only" }, planner)).toBeUndefined();
    expect(planner).not.toHaveBeenCalled();
    expect(cache.size()).toBe(0);
  });

  it("turns partial or invalid envelopes into ordinary native fallthrough", () => {
    const cache = new CheckpointAttemptCache();
    const result = cache.evaluate({ ...identity, enabled: true, deterministic: true }, () => ({ ...envelope, summary: "" }));
    expect(result).toMatchObject({ status: "ineligible", code: "invalid-envelope" });
  });

  it("exhausts reason x enablement x deterministic x policy x planner outcome without cancellation", () => {
    const reasons = ["manual", "threshold", "overflow"] as const;
    const booleans = [false, true] as const;
    const policies = ["deterministic-first", "native-only"] as const;
    const outcomes = ["eligible", "ineligible", "throw"] as const;

    for (const reason of reasons) {
      for (const enabled of booleans) {
        for (const deterministic of booleans) {
          for (const policy of policies) {
            for (const outcome of outcomes) {
              const cache = new CheckpointAttemptCache();
              const planner = vi.fn(() => {
                if (outcome === "throw") throw new Error("matrix-planner-fault");
                return outcome === "eligible" ? envelope : undefined;
              });
              const result = cache.evaluate({
                ...identity,
                reason,
                enabled,
                deterministic,
                policy,
              }, planner);
              const shouldPlan = enabled && deterministic && policy === "deterministic-first";

              expect(planner, `${reason}/${enabled}/${deterministic}/${policy}/${outcome}`).toHaveBeenCalledTimes(shouldPlan ? 1 : 0);
              if (!shouldPlan) {
                expect(result).toBeUndefined();
                expect(cache.size()).toBe(0);
              } else if (outcome === "eligible") {
                expect(result).toMatchObject({ status: "eligible", cacheHit: false, compaction: envelope });
              } else if (outcome === "ineligible") {
                expect(result).toMatchObject({ status: "ineligible", cacheHit: false });
              } else {
                expect(result).toMatchObject({ status: "error", cacheHit: false, code: "planner-threw" });
                expect(cache.size()).toBe(0);
              }
            }
          }
        }
      }
    }
  });
});

describe("pressure stages and storm cycle", () => {
  const policyForSafeBudget = (safeBudgetTokens: number, input: { observedTokens?: number | null; fallbackTokens?: number } = {}) => resolveMiMoContextPolicy({
    contextWindow: safeBudgetTokens + 40_000,
    maxOutputTokens: 20_000,
    ...input,
  });

  it("resolves MiMo's four default checkpoint ladders at their exact window boundaries", () => {
    expect(policyForSafeBudget(24_999).checkpointThresholdTokens).toEqual([]);
    expect(policyForSafeBudget(100_000).checkpointThresholdTokens).toEqual([20_000, 40_000, 60_000, 80_000]);
    expect(policyForSafeBudget(200_000).checkpointThresholdTokens).toEqual([40_000, 80_000, 120_000, 160_000]);
    expect(policyForSafeBudget(200_001).checkpointThresholdTokens).toEqual([
      20_000, 40_000, 60_000, 80_000, 100_000, 120_000, 140_000, 160_000, 180_000,
    ]);
    expect(policyForSafeBudget(500_000).checkpointThresholdTokens).toEqual([
      50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 350_000, 400_000, 450_000,
    ]);
    expect(policyForSafeBudget(500_001).checkpointThresholdTokens).toEqual([
      25_000, 50_000, 75_000, 100_000, 125_000, 150_000, 175_000, 200_000, 225_000,
      250_000, 275_000, 300_000, 325_000, 350_000, 375_000, 400_000, 425_000, 450_000,
    ]);
  });

  it("keeps explicit reserves and disables invalid, zero, and reserve-exhausted budgets", () => {
    expect(resolveMiMoContextPolicy({
      contextWindow: 150_000,
      maxOutputTokens: 30_000,
      observedTokens: 75_000,
      fallbackTokens: 90_000,
    })).toMatchObject({
      status: "enabled",
      outputReserveTokens: 20_000,
      recoveryReserveTokens: 20_000,
      safeBudgetTokens: 110_000,
      recoveryThresholdTokens: 110_000,
      checkpointCeilingTokens: 97_000,
      contextTokens: 75_000,
      source: "observed",
    });
    expect(resolveMiMoContextPolicy({ contextWindow: -1, maxOutputTokens: 20_000 })).toMatchObject({ status: "disabled", disabledReason: "invalid" });
    expect(resolveMiMoContextPolicy({ contextWindow: 0, maxOutputTokens: 20_000 })).toMatchObject({ status: "disabled", disabledReason: "zero" });
    expect(resolveMiMoContextPolicy({ contextWindow: 40_000, maxOutputTokens: 20_000 })).toMatchObject({ status: "disabled", disabledReason: "reserve-exhausted" });
  });

  it("clamps only the first checkpoint threshold above the ceiling", () => {
    const policy = policyForSafeBudget(25_000);
    expect(policy).toMatchObject({ checkpointCeilingTokens: 12_000 });
    expect(policy.checkpointThresholdTokens).toEqual([5_000, 10_000, 12_000]);
  });

  it("derives MiMo pressure levels from the safe budget and accepts fallback usage", () => {
    expect([49_999, 50_000, 70_000, 85_000].map((observedTokens) => (
      policyForSafeBudget(100_000, { observedTokens }).pressureLevel
    ))).toEqual([0, 1, 2, 3]);
    expect(policyForSafeBudget(100_000, { fallbackTokens: 70_000 })).toMatchObject({
      contextTokens: 70_000,
      source: "fallback",
      pressureLevel: 2,
    });
  });

  it("prepares each crossed threshold once and invalidates a stale binding", () => {
    const tracker = new MiMoCheckpointTracker();
    const first = policyForSafeBudget(100_000, { observedTokens: 40_000 });
    expect(tracker.observe(first, "source-a")).toMatchObject({ thresholdTokens: 40_000, sourceBinding: "source-a" });
    expect(tracker.observe(first, "source-a")).toBeUndefined();
    const later = policyForSafeBudget(100_000, { observedTokens: 80_000 });
    expect(tracker.observe(later, "source-a")).toMatchObject({ thresholdTokens: 80_000 });
    expect(tracker.matches("source-a")).toBe(true);
    expect(tracker.matches("source-b")).toBe(false);
    tracker.reset();
    expect(tracker.snapshot()).toBeUndefined();
    expect(tracker.prepare(first, "source-b")).toMatchObject({ thresholdTokens: 40_000, sourceBinding: "source-b" });
  });

  it("permits one writer, preserves the last usable checkpoint, and advances after a failed writer", () => {
    const tracker = new MiMoCheckpointTracker();
    const first = tracker.prepare(policyForSafeBudget(100_000, { observedTokens: 40_000 }), "source-a");
    expect(first).toMatchObject({ thresholdTokens: 40_000, sourceBinding: "source-a" });
    expect(tracker.prepare(policyForSafeBudget(100_000, { observedTokens: 40_000 }), "source-a")).toBeUndefined();
    expect(tracker.commit(first!)).toBe(true);

    const failed = tracker.prepare(policyForSafeBudget(100_000, { observedTokens: 60_000 }), "source-a");
    expect(failed).toMatchObject({ thresholdTokens: 60_000 });
    tracker.reject(failed!);
    expect(tracker.snapshot()).toMatchObject({ thresholdTokens: 40_000, sourceBinding: "source-a" });

    const later = tracker.prepare(policyForSafeBudget(100_000, { observedTokens: 80_000 }), "source-a");
    expect(later).toMatchObject({ thresholdTokens: 80_000 });
    expect(tracker.commit(later!)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({ thresholdTokens: 80_000, sourceBinding: "source-a" });
  });

  it("uses rebuild only for a current checkpoint and otherwise selects the bounded fallback", () => {
    const tracker = new MiMoCheckpointTracker();
    const checkpoint = tracker.prepare(policyForSafeBudget(100_000, { observedTokens: 40_000 }), "current-source");
    expect(tracker.commit(checkpoint!)).toBe(true);
    expect(resolveMiMoRecoveryAction({ requested: true, checkpoint: tracker.snapshot(), sourceBinding: "current-source" })).toBe("rebuild");
    expect(resolveMiMoRecoveryAction({ requested: true, checkpoint: tracker.snapshot(), sourceBinding: "stale-source" })).toBe("native-fallback");
    expect(tracker.invalidate("current-source")).toBe(true);
    expect(resolveMiMoRecoveryAction({ requested: true, checkpoint: tracker.snapshot(), sourceBinding: "current-source" })).toBe("native-fallback");
  });

  it("retries a final checkpoint only after a settled transient failure and one normal step of progress", () => {
    const tracker = new MiMoCheckpointTracker();
    const finalPolicy = policyForSafeBudget(256_000, { observedTokens: 230_400 });
    const failed = tracker.prepare(finalPolicy, "source-a");
    expect(failed).toMatchObject({ thresholdTokens: 230_400 });
    tracker.reject(failed!, "transient");
    expect(tracker.prepare(finalPolicy, "source-a")).toBeUndefined();
    expect(tracker.prepare(policyForSafeBudget(256_000, { observedTokens: 242_999 }), "source-b")).toBeUndefined();

    const retry = tracker.prepare(policyForSafeBudget(256_000, { observedTokens: 243_000 }), "source-b");
    expect(retry).toMatchObject({ thresholdTokens: 230_400, sourceBinding: "source-b" });
    tracker.reject(retry!, "transient");
    expect(tracker.prepare(policyForSafeBudget(256_000, { observedTokens: 243_000 }), "source-c")).toBeUndefined();

    for (const failure of ["deterministic", "unclassified"] as const) {
      const blocked = new MiMoCheckpointTracker();
      const final = blocked.prepare(finalPolicy, "source-a");
      blocked.reject(final!, failure);
      expect(blocked.prepare(policyForSafeBudget(256_000, { observedTokens: 243_000 }), "source-b")).toBeUndefined();
    }
  });

  it("derives legacy presentation stages from MiMo safe-budget levels", () => {
    const normal = observePressure({ contextTokens: 1_000, contextWindow: 100_000, maxOutputTokens: 20_000 });
    expect(normal).toMatchObject({
      stage: "NORMAL", source: "observed", hardCheckpointAt: 60_000, pressureAt: 30_000, forceSemanticAt: 42_000,
    });
    expect(observePressure({ contextTokens: normal.pressureAt, contextWindow: 100_000, maxOutputTokens: 20_000 }).stage).toBe("PRESSURE");
    expect(observePressure({ contextTokens: normal.forceSemanticAt, contextWindow: 100_000, maxOutputTokens: 20_000 }).stage).toBe("FORCE_SEMANTIC");
    expect(observePressure({ contextTokens: normal.hardCheckpointAt, contextWindow: 100_000, maxOutputTokens: 20_000 }).stage).toBe("CHECKPOINT_REQUIRED");
    expect(observePressure({ contextTokens: 1, contextWindow: 100_000, maxOutputTokens: 20_000, overflow: true }).stage).toBe("OVERFLOW_RECOVERY");
  });

  it("adds MiMo policy fields without changing callers that omit max output tokens", () => {
    const observation = observePressure({ contextTokens: 100_000, contextWindow: 140_000, maxOutputTokens: 20_000 });
    expect(observation).toMatchObject({
      stage: "CHECKPOINT_REQUIRED",
      hardCheckpointAt: 100_000,
      mimo: {
        status: "enabled",
        safeBudgetTokens: 100_000,
        checkpointCeilingTokens: 87_000,
        pressureLevel: 3,
      },
    });
  });

  it("uses fallback truthfully and allows only one semantic and checkpoint attempt per cycle", () => {
    const pressure = observePressure({ contextTokens: null, fallbackTokens: 88_000, contextWindow: 100_000 });
    expect(pressure.source).toBe("fallback");
    const cycle = new PressureCycle(tuple);
    expect(cycle.markSemanticAttempted()).toBe(true);
    expect(cycle.markSemanticAttempted()).toBe(false);
    expect(cycle.markCheckpointScheduled()).toBe(true);
    expect(cycle.markCheckpointInvoked()).toBe(true);
    expect(cycle.markCheckpointInvoked()).toBe(false);
    cycle.markCheckpointTerminal();
    expect(cycle.snapshot()).toMatchObject({ semanticAttempted: true, checkpointAttempted: true, checkpointInFlight: false });
  });

  it("resets only for a new epoch or a verified drop below the safety margin", () => {
    const cycle = new PressureCycle(tuple);
    cycle.markSemanticAttempted();
    const high = observePressure({ contextTokens: 90_000, contextWindow: 100_000 });
    expect(cycle.resetForVerifiedDrop(tuple, high)).toBe(false);
    const insufficient = observePressure({ contextTokens: 77_000, contextWindow: 100_000 });
    expect(cycle.resetForVerifiedDrop(tuple, insufficient)).toBe(false);
    const low = observePressure({ contextTokens: 1_000, contextWindow: 100_000 });
    expect(cycle.resetForVerifiedDrop(tuple, low)).toBe(true);
    expect(cycle.snapshot().semanticAttempted).toBe(false);
    cycle.resetForEpoch({ ...tuple, epochId: "epoch-2" });
    expect(cycle.snapshot()).toMatchObject({ tuple: { epochId: "epoch-2" }, semanticAttempted: false });
  });
});
