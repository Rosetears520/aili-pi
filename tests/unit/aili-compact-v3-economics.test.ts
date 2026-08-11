import { describe, expect, it } from "vitest";
import { digest } from "../../src/runtime/aili-compact/contracts.js";
import {
  evaluateV3CompactEconomics,
  V3_ECONOMICS_SAFETY_RESERVE_UPPER,
  type V3CompactEconomicsCandidate,
} from "../../src/runtime/aili-compact/economics.js";
import { buildProviderSuffix } from "../../src/runtime/aili-compact/provider-suffix.js";
import {
  resolveTokenBoundProfile,
  TOKEN_ESTIMATOR_VERSION,
  type RecommendedSafeRange,
  type ResolvedTokenBoundProfile,
} from "../../src/runtime/aili-compact/safe-planning.js";
import { v3SummaryDigest, type V3SemanticBlock, type V3Tier } from "../../src/runtime/aili-compact/v3.js";
import { v3RecapProjection } from "../../src/runtime/aili-compact/v3-projector.js";

const catalogId = digest("catalog");
const scopeDigest = digest("scope");
const exactProfile = resolveTokenBoundProfile("test-provider", "test-model", TOKEN_ESTIMATOR_VERSION, [{
  providerId: "test-provider",
  modelId: "test-model",
  estimatorVersion: TOKEN_ESTIMATOR_VERSION,
  source: "provider-calibrated",
  minBytesPerToken: 4,
  maxBytesPerToken: 4,
  messageOverheadLower: 2,
  messageOverheadUpper: 4,
  toolPartOverheadLower: 4,
  toolPartOverheadUpper: 8,
}]);

describe("AILI Compact v3 conservative economics", () => {
  it("prices a tierless active range, production recap, full suffix wrapper, and every one-time surface", () => {
    const range = exactRange(exactProfile);
    const suffix = buildProviderSuffix({
      planningEnabled: true,
      pressureStage: "PRESSURE",
      headroomTokens: 2_000,
      headroomSource: "observed",
      catalogId,
      catalogScopeDigest: scopeDigest,
      safeRanges: [range],
      allowedActions: ["compress"],
      checkpointState: "idle",
    });
    expect(suffix).toBeDefined();
    const candidate: V3CompactEconomicsCandidate = {
      blockId: "block:t1",
      blockRef: "b000001",
      catalogId,
      epochId: "epoch",
      projectionVersion: "projection-v3",
      semantics: "active-block",
      topic: "active topic",
      summary: "bounded active recap",
      source: { kind: "messages", range },
    };
    const result = evaluateV3CompactEconomics({
      candidate,
      profile: exactProfile,
      pressureStage: "PRESSURE",
      oneTime: oneTimeSurfaces(candidate),
      providerSuffix: suffix!,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostic);
    expect(result.binding).toEqual({
      blockRef: "b000001",
      catalogId,
      orderedRefs: range.orderedRefs,
      sourceDigest: range.sourceDigest,
      summaryDigest: v3SummaryDigest(candidate.summary),
    });
    expect(result.sourceBounds).toEqual(range.tokenBounds);
    expect(result.replacementMessages).toHaveLength(3);
    expect(result.replacementMessages[1]).toEqual(expect.objectContaining({
      role: "toolResult",
      content: [{ type: "text", text: expect.stringContaining("mode=message; semantics=active-block; sources=2") }],
    }));
    expect(result.replacementMessages[2]).toEqual(suffix!.message);
    expect(result.replacementSurface.messageCount).toBe(3);
    expect(result.replacementSurface.structuredToolPartCount).toBe(2);
    expect(Object.keys(result.oneTimeCostUpper).sort()).toEqual([
      "cacheWritePenaltyUpper", "compressionSuffixUpper", "discoveryStatusInputUpper", "modelOutputUpper",
      "qualityEvaluationUpper", "resentExactSourceUpper", "safetyReserveUpper", "toolCallUpper", "toolResultUpper",
    ]);
    expect(result.oneTimeCostUpper.resentExactSourceUpper).toBe(range.tokenBounds.upper);
    expect(result.oneTimeCostUpper.compressionSuffixUpper).toBeGreaterThan(0);
    expect(result.oneTimeCostUpper.safetyReserveUpper).toBe(V3_ECONOMICS_SAFETY_RESERVE_UPPER);
    expect(result.decision.eligible).toBe(true);
    expect(result.tokens).toEqual(expect.objectContaining({
      providerId: exactProfile.providerId,
      modelId: exactProfile.modelId,
      estimatorVersion: exactProfile.estimatorVersion,
      sourceTokensLower: result.decision.sourceLower,
      replacementTokensUpper: result.decision.replacementUpper,
      oneTimeCostTokensUpper: result.decision.oneTimeCostUpper,
      summaryTokensUpper: expect.any(Number),
    }));
  });

  it.each(["T1", "T2", "T3"] as const)("prices active-block source from $tier legacy children without tier eligibility", (childTier) => {
    const children = [
      semanticChild(`${childTier}:1`, childTier, 1, "first ".repeat(2_500)),
      semanticChild(`${childTier}:2`, childTier, 2, "second ".repeat(2_500)),
    ];
    const resolved = children.map((block, index) => ({ block, blockRef: `b${String(index + 1).padStart(6, "0")}` }));
    const candidate: V3CompactEconomicsCandidate = {
      blockId: `block:active:${childTier}`,
      blockRef: "b000003",
      catalogId,
      epochId: "epoch",
      projectionVersion: "projection-v3",
      semantics: "active-block",
      topic: "active parent topic",
      summary: "bounded active parent recap",
      source: { kind: "blocks", sourceDigest: digest([childTier, ...children.map((block) => block.blockId)]), children: resolved },
    };
    const result = evaluateV3CompactEconomics({
      candidate,
      profile: exactProfile,
      pressureStage: "NORMAL",
      oneTime: oneTimeSurfaces(candidate),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostic);
    const exactProjectedSource = resolved.flatMap(({ block, blockRef }) => {
      const recap = v3RecapProjection(block, blockRef);
      return [recap.call, recap.result];
    });
    expect(result.sourceMessages).toEqual(exactProjectedSource);
    expect(result.binding.orderedRefs).toEqual(["b000001", "b000002"]);
    expect(result.binding.sourceDigest).toBe(digest([childTier, ...children.map((block) => block.blockId)]));
    expect(result.replacementMessages[1]).toEqual(expect.objectContaining({
      content: [{ type: "text", text: expect.stringContaining("mode=blocks; semantics=active-block; sources=2") }],
    }));
    expect(result.sourceBounds.lower).toBeGreaterThan(result.replacementBounds.upper);
    expect(result).toMatchObject({ semantics: "active-block" });
    expect(result.decision.eligible).toBe(true);
  });

  it("runs the conservative benefit gate with the deliberately wide fallback profile", () => {
    const fallback = resolveTokenBoundProfile(undefined, undefined);
    const candidate: V3CompactEconomicsCandidate = {
      blockId: "block:t1",
      blockRef: "b000001",
      catalogId,
      epochId: "epoch",
      projectionVersion: "projection-v3",
      semantics: "active-block",
      topic: "topic",
      summary: "summary",
      source: { kind: "messages", range: exactRange(fallback) },
    };
    const result = evaluateV3CompactEconomics({
      candidate,
      profile: fallback,
      pressureStage: "NORMAL",
      oneTime: oneTimeSurfaces(candidate),
    });
    expect(fallback).toEqual(expect.objectContaining({
      source: "fallback",
      minBytesPerToken: 1,
      maxBytesPerToken: 8,
      messageOverheadLower: 1,
      messageOverheadUpper: 16,
      toolPartOverheadLower: 4,
      toolPartOverheadUpper: 64,
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostic);
    expect(result.replacementBounds.source).toBe("fallback");
    expect(result.decision).toEqual(expect.objectContaining({
      sourceLower: 20_000,
      sourceUpper: 20_000,
      saturated: false,
    }));
  });

  it("admits exactly 18,000 semantic-summary characters before economics and rejects 18,001", () => {
    const candidate: V3CompactEconomicsCandidate = {
      blockId: "block:summary-cap",
      blockRef: "b000001",
      catalogId,
      epochId: "epoch",
      projectionVersion: "projection-v3",
      semantics: "active-block",
      topic: "topic",
      summary: "s".repeat(18_000),
      source: { kind: "messages", range: exactRange(exactProfile) },
    };
    expect(evaluateV3CompactEconomics({
      candidate,
      profile: exactProfile,
      pressureStage: "NORMAL",
      oneTime: oneTimeSurfaces(candidate),
    })).toEqual(expect.objectContaining({ ok: true }));
    expect(evaluateV3CompactEconomics({
      candidate: { ...candidate, summary: "s".repeat(18_001) },
      profile: exactProfile,
      pressureStage: "NORMAL",
      oneTime: oneTimeSurfaces(candidate),
    })).toEqual(expect.objectContaining({ ok: false, reason: "invalid-candidate" }));
  });
});

function exactRange(profile: ResolvedTokenBoundProfile): RecommendedSafeRange {
  return {
    rangeId: "r000001",
    catalogId,
    catalogScopeDigest: scopeDigest,
    scopeDigest: digest("range-scope"),
    sourceDigest: digest("range-source"),
    atomIds: ["a1", "a2"],
    orderedEntryIds: ["e1", "e2"],
    orderedRefs: ["m000001", "m000002"],
    startRef: "m000001",
    endRef: "m000002",
    tokenBounds: {
      lower: 20_000,
      upper: 20_000,
      saturated: false,
      source: profile.source,
      profileKey: profile.profileKey,
    },
  };
}

function oneTimeSurfaces(candidate: V3CompactEconomicsCandidate) {
  return {
    discoveryStatusInput: { catalogId: candidate.catalogId, blockRef: candidate.blockRef, semantics: "active-block" },
    compressionToolCall: {
      role: "assistant",
      content: [{ type: "toolCall", id: "compact-call", name: "aili_compact", arguments: { summary: candidate.summary } }],
    },
    compressionToolResult: {
      role: "toolResult",
      toolCallId: "compact-call",
      toolName: "aili_compact",
      content: [{ type: "text", text: JSON.stringify({ blockId: candidate.blockId, status: "planned" }) }],
      isError: false,
    },
    qualityEvaluation: { input: { semantics: "active-block" }, result: { status: "accepted", hardFactCount: 1 } },
  };
}

function semanticChild(blockId: string, tier: V3Tier, ordinal: number, summary: string): V3SemanticBlock {
  return {
    blockId,
    transactionId: `tx:${blockId}`,
    sessionId: "session",
    branchLeafId: "branch",
    epochId: "epoch",
    catalogIdAtCreate: catalogId,
    projectionVersion: "projection-v3",
    createdAt: ordinal,
    createdTurnOrdinal: ordinal,
    tier,
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: `entry:${ordinal}`,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: {
      kind: "messages",
      entryIds: [`entry:${ordinal}`],
      firstEntryId: `entry:${ordinal}`,
      lastEntryId: `entry:${ordinal}`,
    },
    leafDigest: digest(["leaf", ordinal]),
    leafCount: 1,
    firstLeafOrdinal: ordinal,
    lastLeafOrdinal: ordinal,
    tokens: {
      estimatorVersion: TOKEN_ESTIMATOR_VERSION,
      providerId: exactProfile.providerId,
      modelId: exactProfile.modelId,
      sourceTokensLower: 2_000,
      sourceTokensUpper: 2_000,
      replacementTokensUpper: 1_000,
      steadySavingsTokensLower: 1_000,
      oneTimeCostTokensUpper: 500,
      breakEvenTurnsUpper: 1,
      savingsRatio: 0.5,
      summaryTokensUpper: 500,
    },
    quality: {
      status: "accepted",
      evaluatorVersion: "quality-v1",
      sourceFactDigest: digest(["quality", blockId]),
      hardFactCount: 1,
      coveredHardFactCount: 1,
      warningCodes: [],
    },
    active: true,
    queryOnly: false,
  };
}
