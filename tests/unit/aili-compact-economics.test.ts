import { describe, expect, it } from "vitest";
import { AILI_COMPACT_SCHEMA_V2, sourceDigest, type CompactTransaction, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { evaluateCompactEconomics } from "../../src/runtime/aili-compact/economics.js";
import { planSafeRanges, resolveTokenBoundProfile, TOKEN_ESTIMATOR_VERSION } from "../../src/runtime/aili-compact/safe-planning.js";

const entries: SessionLikeEntry[] = Array.from({ length: 10 }, (_, index) => ({
  id: `e${index}`,
  type: "message",
  message: { role: "assistant", content: index === 0 ? "source ".repeat(20_000) : `tail-${index}` },
}));
const tokenProfile = {
  providerId: "test", modelId: "model", estimatorVersion: TOKEN_ESTIMATOR_VERSION,
  minBytesPerToken: 4, maxBytesPerToken: 4, messageOverheadLower: 1, messageOverheadUpper: 2,
  toolPartOverheadLower: 1, toolPartOverheadUpper: 2,
} as const;
const exactProfile = resolveTokenBoundProfile("test", "model", TOKEN_ESTIMATOR_VERSION, [tokenProfile]);
const safePlan = () => planSafeRanges({ entries, contextWindow: 1, providerId: "test", modelId: "model", tokenProfiles: [tokenProfile] });

describe("AILI Compact production-envelope economics", () => {
  it("includes recap wrappers, quality/tool surfaces, and every one-time component", () => {
    const plan = safePlan();
    const range = plan.ranges[0]!;
    const transaction: CompactTransaction = {
      schema: AILI_COMPACT_SCHEMA_V2, id: "tx", kind: "compact", epochId: "root",
      blocks: [{
        id: "block:tx:1", kind: "semantic", epochId: "root", sourceEntryIds: ["e0"],
        sourceDigest: sourceDigest(entries, ["e0"]), summary: "bounded recap", active: true,
        mode: "range", topic: "topic", batchTopic: "topic", anchorEntryId: "e0", runId: "tx",
        childBlockIds: [], generation: "young", survivedCount: 0, age: 0,
      }],
    };
    const result = evaluateCompactEconomics({
      transaction, range, profile: exactProfile,
      request: { mode: "range", summary: "bounded recap" }, pressureStage: "NORMAL", suffixContent: "pressure=PRESSURE",
    });
    expect(Object.keys(result.oneTimeCostUpper).sort()).toEqual([
      "cacheWritePenaltyUpper", "compressionSuffixUpper", "discoveryStatusInputUpper", "modelOutputUpper",
      "qualityEvaluationUpper", "resentExactSourceUpper", "safetyReserveUpper", "toolCallUpper", "toolResultUpper",
    ]);
    expect(result.replacementSurface.messageCount).toBe(3);
    expect(result.replacementSurface.structuredToolPartCount).toBe(1);
    expect(result.decision.eligible).toBe(true);
  });

  it("never starts a semantic attempt at checkpoint/overflow stages", () => {
    const range = safePlan().ranges[0]!;
    const result = evaluateCompactEconomics({
      transaction: { schema: AILI_COMPACT_SCHEMA_V2, id: "tx", kind: "compact", epochId: "root", blocks: [] },
      range, profile: resolveTokenBoundProfile(undefined, undefined), request: {}, pressureStage: "OVERFLOW_RECOVERY",
    });
    expect(result.decision.eligible).toBe(false);
    expect(result.decision.reasons).toContain("pressure-stage-disallows-semantic");
  });
});
