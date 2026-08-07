import { describe, expect, it } from "vitest";

import type { SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import {
  estimateTokenBounds,
  evaluateTokenBenefit,
  ONE_TIME_COST_COMPONENTS,
  planSafeRanges,
  resolveTokenBoundProfile,
  SATURATED_SAFE_INTEGER,
  saturatingAdd,
  saturatingMultiply,
  verifyExactMutationScope,
  type OneTimeCostUpper,
  type TokenBoundProfile,
} from "../../src/runtime/aili-compact/safe-planning.js";

const entry = (id: string, message: unknown): SessionLikeEntry => ({ id, type: "message", message });
const message = (id: string, role: string, content: unknown): SessionLikeEntry => entry(id, { role, content });
const assistants = (count: number): SessionLikeEntry[] => Array.from({ length: count }, (_, index) =>
  message(`a-${index + 1}`, "assistant", `answer-${index + 1}`));
const toolIteration = (ordinal: number): SessionLikeEntry[] => [
  entry(`call-${ordinal}`, {
    role: "assistant",
    content: [{ type: "toolCall", id: `tc-${ordinal}`, name: "read", arguments: {} }],
  }),
  entry(`result-${ordinal}`, {
    role: "toolResult",
    toolCallId: `tc-${ordinal}`,
    toolName: "read",
    content: "ok",
  }),
];

const sparseProfile: TokenBoundProfile = {
  providerId: "test-provider",
  modelId: "test-model",
  estimatorVersion: "aili.token-bounds.v1",
  minBytesPerToken: 1_000,
  maxBytesPerToken: 1_000,
  messageOverheadLower: 0,
  messageOverheadUpper: 0,
  toolPartOverheadLower: 0,
  toolPartOverheadUpper: 0,
};

const oneTimeCost = (total: number): OneTimeCostUpper => Object.fromEntries(
  ONE_TIME_COST_COMPONENTS.map((key, index) => [key, index === 0 ? total : 0]),
) as unknown as OneTimeCostUpper;

describe("AILI Compact safe range planning", () => {
  it("uses the 10% model-window cap and the full 12K fallback", () => {
    const entries = assistants(1);
    const capped = planSafeRanges({ entries, contextWindow: 20_000 });
    expect(capped.tail).toEqual(expect.objectContaining({
      configuredAtoms: 8,
      configuredTokens: 12_000,
      effectiveTokenBudget: 2_000,
      windowSource: "model-window",
      contextWindow: 20_000,
    }));

    const fallback = planSafeRanges({ entries, contextWindow: Number.NaN });
    expect(fallback.tail).toEqual(expect.objectContaining({
      effectiveTokenBudget: 12_000,
      windowSource: "fallback",
    }));
    expect(fallback.tail).not.toHaveProperty("contextWindow");
  });

  it("scans whole atoms until both count and token budget are covered", () => {
    const entries = assistants(10);
    entries[1] = message("a-2", "assistant", "x".repeat(2_500));
    const plan = planSafeRanges({
      entries,
      contextWindow: 100,
      providerId: "test-provider",
      modelId: "test-model",
      tokenProfiles: [sparseProfile],
    });

    expect(plan.tail.effectiveTokenBudget).toBe(10);
    expect(plan.tail.protectedAtomIds).toEqual([
      "a000002", "a000003", "a000004", "a000005", "a000006",
      "a000007", "a000008", "a000009", "a000010",
    ]);
    expect(plan.tail.coveredTokenBounds.lower).toBeGreaterThanOrEqual(10);
    expect(plan.ranges).toHaveLength(1);
    expect(plan.ranges[0]!.atomIds).toEqual(["a000001"]);
  });

  it("protects the newest user outside the tail after completed tool iterations", () => {
    const entries: SessionLikeEntry[] = [
      message("old", "assistant", "old answer"),
      message("user", "user", "do work"),
      ...Array.from({ length: 9 }, (_, index) => toolIteration(index + 1)).flat(),
      message("done", "assistant", "finished"),
    ];
    const plan = planSafeRanges({ entries, contextWindow: 1 });
    const newestUser = plan.protectedAtoms.find((atom) => atom.atomId === "a000002");

    expect(newestUser?.reasons).toContain("newest-user");
    expect(newestUser?.reasons).not.toContain("recent-atom-tail");
    expect(plan.ranges.map((range) => range.atomIds)).toEqual([
      ["a000001"],
      ["a000003", "a000004"],
    ]);
  });

  it("hard-protects the full unfinished current turn", () => {
    const entries: SessionLikeEntry[] = [
      message("old", "assistant", "old answer"),
      message("user", "user", "do work"),
      ...Array.from({ length: 9 }, (_, index) => toolIteration(index + 1)).flat(),
    ];
    const plan = planSafeRanges({ entries, contextWindow: 1 });
    const outsideCountTail = plan.protectedAtoms.find((atom) => atom.atomId === "a000003");

    expect(outsideCountTail?.reasons).toContain("unfinished-turn");
    expect(outsideCountTail?.reasons).not.toContain("recent-atom-tail");
    expect(plan.ranges.map((range) => range.atomIds)).toEqual([["a000001"]]);
  });

  it("returns maximal split ranges with exact refs, digests, bounds, and exclusion counts", () => {
    const plan = planSafeRanges({
      entries: assistants(14),
      contextWindow: 1,
      additionalProtectedAtomIds: ["a000003"],
    });

    expect(plan.ranges.map((range) => ({ atoms: range.atomIds, refs: range.orderedRefs }))).toEqual([
      { atoms: ["a000001", "a000002"], refs: ["m000001", "m000002"] },
      { atoms: ["a000004", "a000005", "a000006"], refs: ["m000004", "m000005", "m000006"] },
    ]);
    expect(plan.ranges[0]).toEqual(expect.objectContaining({
      catalogId: plan.catalogId,
      catalogScopeDigest: plan.catalogScopeDigest,
      startRef: "m000001",
      endRef: "m000002",
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      scopeDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      tokenBounds: expect.objectContaining({ lower: expect.any(Number), upper: expect.any(Number), saturated: false }),
    }));
    expect(plan.exclusionCounts["caller-protected"]).toBe(1);
    expect(plan.exclusionCounts["recent-atom-tail"]).toBe(8);
  });

  it("splits eligible ranges at omitted provider-ordinal gaps without aging the omitted protocol", () => {
    const entries = assistants(14);
    const sourceOrdinals = new Map(entries.map((item, index) => [
      item.id,
      index < 3 ? index : index + 4,
    ]));
    const plan = planSafeRanges({ entries, sourceOrdinals, contextWindow: 1 });

    expect(plan.tail.protectedAtomIds).toEqual([
      "a000007", "a000008", "a000009", "a000010",
      "a000011", "a000012", "a000013", "a000014",
    ]);
    expect(plan.ranges.map((range) => ({ atoms: range.atomIds, refs: range.orderedRefs }))).toEqual([
      { atoms: ["a000001", "a000002", "a000003"], refs: ["m000001", "m000002", "m000003"] },
      { atoms: ["a000004", "a000005", "a000006"], refs: ["m000004", "m000005", "m000006"] },
    ]);
    expect(plan.diagnostics).toEqual([]);
  });

  it("requires exact range or ordered-message scope equality", () => {
    const plan = planSafeRanges({ entries: assistants(10), contextWindow: 1 });
    const range = plan.ranges[0]!;
    expect(verifyExactMutationScope(plan, {
      mode: "range",
      catalogId: plan.catalogId,
      startRef: range.startRef,
      endRef: range.endRef,
      scopeDigest: range.scopeDigest,
      sourceDigest: range.sourceDigest,
    })).toEqual({ ok: true, range });
    expect(verifyExactMutationScope(plan, {
      mode: "message",
      catalogId: plan.catalogId,
      messageRefs: range.orderedRefs,
    })).toEqual({ ok: true, range });

    const mismatch = verifyExactMutationScope(plan, {
      mode: "message",
      catalogId: plan.catalogId,
      messageRefs: [...range.orderedRefs].reverse(),
      scopeDigest: range.scopeDigest,
      sourceDigest: range.sourceDigest,
    });
    expect(mismatch).toEqual(expect.objectContaining({
      ok: false,
      code: "source-summary-scope-mismatch",
    }));
    expect(verifyExactMutationScope(plan, {
      mode: "range",
      catalogId: plan.catalogId,
      startRef: range.startRef,
      endRef: range.endRef,
      scopeDigest: range.scopeDigest,
      sourceDigest: "stale-source-digest",
    })).toEqual(expect.objectContaining({ ok: false, code: "source-summary-scope-mismatch" }));
    expect(verifyExactMutationScope(plan, {
      mode: "range",
      catalogId: "stale-catalog",
      startRef: range.startRef,
      endRef: range.endRef,
      scopeDigest: range.scopeDigest,
      sourceDigest: range.sourceDigest,
    })).toEqual(expect.objectContaining({ ok: false, code: "source-summary-scope-mismatch" }));
  });
});

describe("AILI Compact conservative token bounds", () => {
  it("uses deliberately wide unknown-provider bounds and preserves zero", () => {
    const profile = resolveTokenBoundProfile("new-provider", "new-model");
    expect(profile.source).toBe("fallback");
    expect(estimateTokenBounds({ utf8Bytes: 16, messageCount: 1, structuredToolPartCount: 1 }, profile)).toEqual(expect.objectContaining({
      lower: 7,
      upper: 96,
      saturated: false,
      source: "fallback",
    }));
    expect(estimateTokenBounds({ utf8Bytes: 0, messageCount: 0, structuredToolPartCount: 0 }, profile)).toEqual(expect.objectContaining({
      lower: 0,
      upper: 0,
      saturated: false,
    }));
  });

  it("isolates exact provider/model/version profiles", () => {
    const exact = resolveTokenBoundProfile("test-provider", "test-model", "aili.token-bounds.v1", [sparseProfile]);
    const otherModel = resolveTokenBoundProfile("test-provider", "other-model", "aili.token-bounds.v1", [sparseProfile]);
    expect(exact).toEqual(expect.objectContaining({ source: "baseline", minBytesPerToken: 1_000 }));
    expect(otherModel).toEqual(expect.objectContaining({ source: "fallback", minBytesPerToken: 1 }));
  });

  it("saturates unsafe arithmetic instead of wrapping", () => {
    const fallback = resolveTokenBoundProfile(undefined, undefined);
    const bounds = estimateTokenBounds({
      utf8Bytes: SATURATED_SAFE_INTEGER,
      messageCount: SATURATED_SAFE_INTEGER,
      structuredToolPartCount: SATURATED_SAFE_INTEGER,
    }, fallback);
    expect(bounds.saturated).toBe(true);
    expect(bounds.upper).toBe(SATURATED_SAFE_INTEGER);
    expect(saturatingAdd(SATURATED_SAFE_INTEGER, 1)).toEqual({ value: SATURATED_SAFE_INTEGER, saturated: true });
    expect(saturatingMultiply(SATURATED_SAFE_INTEGER, 2)).toEqual({ value: SATURATED_SAFE_INTEGER, saturated: true });
  });
});

describe("AILI Compact token benefit policy", () => {
  const candidate = {
    tier: "T1" as const,
    sourceBounds: { lower: 5_000, upper: 5_000, saturated: false },
    replacementBounds: { lower: 1_000, upper: 1_000, saturated: false },
    oneTimeCostUpper: oneTimeCost(20_000),
  };

  it("applies pressure-specific break-even and net-savings horizons", () => {
    const normal = evaluateTokenBenefit({ ...candidate, pressureStage: "NORMAL" });
    expect(normal).toEqual(expect.objectContaining({
      eligible: true,
      steadySavingsLower: 4_000,
      breakEvenTurnsUpper: 5,
      horizonTurns: 8,
      netSavingsLower: 12_000,
    }));

    const pressure = evaluateTokenBenefit({ ...candidate, pressureStage: "PRESSURE" });
    expect(pressure.eligible).toBe(false);
    expect(pressure.reasons).toEqual(expect.arrayContaining(["break-even-horizon", "negative-net-savings"]));

    const forced = evaluateTokenBenefit({ ...candidate, pressureStage: "FORCE_SEMANTIC" });
    expect(forced.eligible).toBe(false);
    expect(forced.horizonTurns).toBe(1);
  });

  it("does not begin semantic work at checkpoint or overflow stages", () => {
    for (const pressureStage of ["CHECKPOINT_REQUIRED", "OVERFLOW_RECOVERY"] as const) {
      const decision = evaluateTokenBenefit({ ...candidate, pressureStage });
      expect(decision.eligible).toBe(false);
      expect(decision.reasons).toContain("pressure-stage-disallows-semantic");
    }
  });

  it("rejects saturated or unavailable bounds", () => {
    const decision = evaluateTokenBenefit({
      ...candidate,
      pressureStage: "NORMAL",
      sourceBounds: { lower: SATURATED_SAFE_INTEGER, upper: SATURATED_SAFE_INTEGER, saturated: true },
    });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toEqual(expect.arrayContaining(["bounds-unavailable", "saturated-arithmetic"]));
  });
});
