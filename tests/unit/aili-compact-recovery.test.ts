import { describe, expect, it, vi } from "vitest";
import {
  CheckpointAttemptCache,
  CheckpointCoordinator,
  PressureCycle,
  checkpointAttemptId,
  observePressure,
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
  it("derives clamped five-stage boundaries from one conservative semantic budget", () => {
    const normal = observePressure({ contextTokens: 1_000, contextWindow: 100_000 });
    expect(normal).toMatchObject({ stage: "NORMAL", source: "observed", hardCheckpointAt: 90_000 });
    expect(observePressure({ contextTokens: normal.pressureAt, contextWindow: 100_000 }).stage).toBe("PRESSURE");
    expect(observePressure({ contextTokens: normal.forceSemanticAt, contextWindow: 100_000 }).stage).toBe("FORCE_SEMANTIC");
    expect(observePressure({ contextTokens: normal.hardCheckpointAt, contextWindow: 100_000 }).stage).toBe("CHECKPOINT_REQUIRED");
    expect(observePressure({ contextTokens: 1, contextWindow: 100_000, overflow: true }).stage).toBe("OVERFLOW_RECOVERY");
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
