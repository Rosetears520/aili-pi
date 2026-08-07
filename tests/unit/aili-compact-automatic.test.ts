import { describe, expect, it } from "vitest";
import {
  DEFAULT_NUDGE_CONFIG,
  INITIAL_NUDGE_STATE,
  planAdaptiveNudge,
  planJournaledStrategies,
  resolveNudgeConfig,
  selectGroupedCandidates,
  type AutomaticPolicyCandidate,
  type JournaledToolResult,
} from "../../src/runtime/aili-compact/automatic.js";

function candidate(id: string, replayIndex: number, gain: number, consumedTurn = replayIndex): AutomaticPolicyCandidate {
  return { id, strategy: "cool", sourceEntryIds: [id], replayIndex, consumedTurn, consumed: true, sourceChars: gain + 100, projectedChars: 100 };
}

function result(id: string, replayIndex: number, overrides: Partial<JournaledToolResult> = {}): JournaledToolResult {
  return {
    id,
    sourceEntryIds: [id],
    replayIndex,
    consumedTurn: replayIndex,
    consumed: true,
    toolName: "Read",
    contentDigest: "same",
    isError: false,
    assistantTurnsAfter: 10,
    sourceChars: 1_000,
    projectedChars: 100,
    ...overrides,
  };
}

describe("AILI Compact grouped automatic plans", () => {
  it("waits for aggregate material benefit instead of committing a prefix", () => {
    const plan = selectGroupedCandidates([candidate("a", 0, 40), candidate("b", 1, 50)], { maxCandidates: 8, minAggregateGainChars: 100 });
    expect(plan).toMatchObject({ kind: "wait", transactionCount: 0, aggregateGainChars: 90, reason: "insignificant-aggregate-gain" });
  });

  it("creates one bounded transaction in consumption/replay order", () => {
    const plan = selectGroupedCandidates([
      candidate("late", 3, 80, 4), candidate("first", 2, 80, 1), candidate("second", 1, 80, 1), candidate("bounded-out", 4, 80, 5),
    ], { maxCandidates: 3, minAggregateGainChars: 200 });
    expect(plan.kind).toBe("transaction");
    expect(plan.candidates.map((item) => item.id)).toEqual(["second", "first", "late"]);
    expect(plan).toMatchObject({ transactionCount: 1, aggregateGainChars: 240 });
  });

  it("excludes protected and already-journaled candidates", () => {
    const protectedCandidate = { ...candidate("protected", 0, 500), protectedReason: "protected-file" };
    const plan = selectGroupedCandidates([protectedCandidate, candidate("old", 1, 500)], {
      maxCandidates: 8,
      minAggregateGainChars: 1,
      journaledSourceEntryIds: new Set(["old"]),
    });
    expect(plan).toMatchObject({ kind: "wait", reason: "no-eligible-candidates" });
  });
});

describe("AILI Compact journaled strategies", () => {
  it("deduplicates old results while keeping the configured newest result", () => {
    const plan = planJournaledStrategies([result("one", 1), result("two", 2), result("three", 3)], {
      dedupeEnabled: true, purgeErrorsEnabled: false, errorGraceTurns: 4, keepLatest: 1,
    });
    expect(plan.candidates.map((item) => [item.id, item.strategy])).toEqual([["one", "dedupe"], ["two", "dedupe"]]);
  });

  it("applies purge-error only after grace and never selects protected results", () => {
    const plan = planJournaledStrategies([
      result("young-error", 1, { isError: true, assistantTurnsAfter: 3, contentDigest: "young" }),
      result("old-error", 2, { isError: true, assistantTurnsAfter: 4, contentDigest: "old" }),
      result("secret", 3, { isError: true, protectedReason: "protected-file", contentDigest: "secret" }),
    ], { dedupeEnabled: false, purgeErrorsEnabled: true, errorGraceTurns: 4, keepLatest: 1 });
    expect(plan.candidates.map((item) => [item.id, item.strategy])).toEqual([["old-error", "purge-error"]]);
    expect(plan.excluded).toMatchObject({ "error-grace": 1, protected: 1 });
  });

  it("supports independent strategy disable switches and journal coverage", () => {
    const duplicates = [result("one", 1), result("two", 2), result("error", 3, { isError: true, contentDigest: "error" })];
    expect(planJournaledStrategies(duplicates, {
      dedupeEnabled: false, purgeErrorsEnabled: false, errorGraceTurns: 4, keepLatest: 1,
    }).candidates).toEqual([]);
    expect(planJournaledStrategies(duplicates, {
      dedupeEnabled: true, purgeErrorsEnabled: false, errorGraceTurns: 4, keepLatest: 1, journaledSourceEntryIds: new Set(["one"]),
    }).candidates).toEqual([]);
  });
});

describe("AILI Compact adaptive nudges", () => {
  it("uses exact defaults and accepts bounded overrides", () => {
    expect(DEFAULT_NUDGE_CONFIG).toEqual({
      minContextPercent: 45, maxContextPercent: 55, emergencyPercent: 98, frequencyTurns: 5,
      iterationThreshold: 15, minGrowthRatio: 0.45, minGrowthChars: 5_000,
    });
    expect(resolveNudgeConfig({ frequencyTurns: 2, minGrowthChars: 10 }).frequencyTurns).toBe(2);
  });

  it("marks threshold transitions cache-ineligible and directs reference discovery", () => {
    const plan = planAdaptiveNudge(INITIAL_NUDGE_STATE, { enabled: true, contextPercent: 55, contextChars: 5_000, turn: 5, iteration: 1 });
    expect(plan).toMatchObject({ guidanceKind: "context-limit", cacheEligible: false, cacheInputTransition: { marker: "aili-nudge-state-change", from: "idle", to: "context-limit" } });
    expect(plan.guidance).toContain("aili_compact_status");
    expect(plan.guidance).toContain("references");
  });

  it("enforces growth and turn frequency", () => {
    const state = { ...INITIAL_NUDGE_STATE, phase: "watch" as const, lastGuidanceContextChars: 10_000, lastGuidanceTurn: 3 };
    expect(planAdaptiveNudge(state, { enabled: true, contextPercent: 50, contextChars: 14_999, turn: 20, iteration: 1 }).guidanceKind).toBeUndefined();
    expect(planAdaptiveNudge(state, { enabled: true, contextPercent: 50, contextChars: 15_000, turn: 7, iteration: 1 }).guidanceKind).toBeUndefined();
    expect(planAdaptiveNudge(state, { enabled: true, contextPercent: 50, contextChars: 15_000, turn: 8, iteration: 1 }).guidanceKind).toBe("turn");
  });

  it("emits iteration guidance and lets emergency bypass growth/frequency", () => {
    const state = { ...INITIAL_NUDGE_STATE, phase: "watch" as const };
    expect(planAdaptiveNudge(state, { enabled: true, contextPercent: 50, contextChars: 5_000, turn: 1, iteration: 15 }).guidanceKind).toBe("iteration");
    expect(planAdaptiveNudge({ ...state, lastGuidanceContextChars: 100_000 }, { enabled: true, contextPercent: 98, contextChars: 100_001, turn: 1, iteration: 1 }).guidanceKind).toBe("emergency");
  });
});
