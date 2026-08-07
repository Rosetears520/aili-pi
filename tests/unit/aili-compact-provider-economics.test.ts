import { describe, expect, it } from "vitest";
import type { Context } from "@earendil-works/pi-ai";
import { digest } from "../../src/runtime/aili-compact/contracts.js";
import {
  evaluateV3CompactEconomics,
  V3_ECONOMICS_SAFETY_RESERVE_UPPER,
  type V3CompactEconomicsCandidate,
  type V3OneTimeEconomicsSurfaces,
} from "../../src/runtime/aili-compact/economics.js";
import {
  createPiProviderEconomicsSurfaceAdapter,
  providerSerializedSurface,
  serializePiProviderMessages,
  type PiProviderEconomicsContextSurface,
  type PiProviderSerializerTarget,
  type V3ProviderEconomicsSurfaceKind,
} from "../../src/runtime/aili-compact/provider-economics.js";
import { buildProviderSuffix } from "../../src/runtime/aili-compact/provider-suffix.js";
import {
  estimateTokenBounds,
  resolveTokenBoundProfile,
  TOKEN_ESTIMATOR_VERSION,
  type RecommendedSafeRange,
  type ResolvedTokenBoundProfile,
  type TokenBoundProfile,
} from "../../src/runtime/aili-compact/safe-planning.js";

const catalogId = digest("provider-economics-catalog");
const scopeDigest = digest("provider-economics-scope");

describe("AILI Compact production provider economics surfaces", () => {
  it("drives replacement and every serialized one-time component through OpenAI Chat/Responses, Anthropic, and Gemini converters", async () => {
    const targets: PiProviderSerializerTarget[] = [
      {
        api: "openai-completions",
        model: model("openai-completions", "openai", "gpt-4o-mini"),
      },
      {
        api: "openai-responses",
        model: model("openai-responses", "openai", "gpt-4o-mini"),
      },
      {
        api: "anthropic-messages",
        model: model("anthropic-messages", "anthropic", "claude-sonnet-4-20250514"),
      },
      {
        api: "google-generative-ai",
        model: model("google-generative-ai", "google", "gemini-2.5-flash"),
      },
    ];
    const replacementDigests = new Set<string>();

    for (const target of targets) {
      const profile = exactProfile(target.model.provider, target.model.id);
      const range = exactRange(profile);
      const candidate: V3CompactEconomicsCandidate = {
        blockId: `block:${target.api}`,
        blockRef: "b000001",
        catalogId,
        epochId: "epoch",
        projectionVersion: "projection-v3",
        tier: "T1",
        topic: `provider surface ${target.api}`,
        summary: `bounded provider recap for ${target.api}`,
        source: { kind: "messages", range },
      };
      const oneTime = oneTimeSurfaces(candidate);
      const suffix = buildProviderSuffix({
        planningEnabled: true,
        pressureStage: "PRESSURE",
        headroomTokens: 8_000,
        headroomSource: "observed",
        catalogId,
        catalogScopeDigest: scopeDigest,
        safeRanges: [range],
        targetTier: "T1",
        allowedActions: ["compress"],
        checkpointState: "idle",
      });
      expect(suffix).toBeDefined();
      const logical = evaluateV3CompactEconomics({
        candidate,
        profile,
        pressureStage: "PRESSURE",
        oneTime,
        providerSuffix: suffix!,
      });
      expect(logical.ok).toBe(true);
      if (!logical.ok) throw new Error(logical.diagnostic);

      const contexts = providerContexts(target, logical.replacementMessages, oneTime, candidate.summary, suffix!.content);
      const adapter = await createPiProviderEconomicsSurfaceAdapter({ profile, target, contexts });
      const result = evaluateV3CompactEconomics({
        candidate,
        profile,
        pressureStage: "PRESSURE",
        oneTime,
        providerSuffix: suffix!,
        providerSurfaceAdapter: adapter,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.diagnostic);
      const actualReplacement = await serializePiProviderMessages(target, contexts.replacement!.context);
      const expectedReplacement = providerSerializedSurface(actualReplacement);
      replacementDigests.add(expectedReplacement.payloadDigest);
      expect(result.replacementSurface).toEqual({
        utf8Bytes: expectedReplacement.utf8Bytes,
        messageCount: expectedReplacement.messageCount,
        structuredToolPartCount: expectedReplacement.structuredToolPartCount,
      });
      expect(result.surfaceAdapterVersion).toBe(adapter.version);
      expect(result.replacementBounds.upper).toBe(estimateTokenBounds(expectedReplacement, profile).upper);
      expect(result.replacementSurface.structuredToolPartCount).toBeGreaterThanOrEqual(2);
      expect(adapter.surfaceFor({
        kind: "compression-tool-call",
        logicalValue: oneTime.compressionToolCall,
      })?.structuredToolPartCount).toBe(1);
      expect(adapter.surfaceFor({
        kind: "compression-tool-result",
        logicalValue: oneTime.compressionToolResult,
      })?.structuredToolPartCount).toBe(1);
      expect(result.oneTimeCostUpper).toEqual(expect.objectContaining({
        discoveryStatusInputUpper: adapterUpper(adapter, "discovery-status", oneTime.discoveryStatusInput, profile),
        compressionSuffixUpper: adapterUpper(adapter, "compression-suffix", [suffix!.message], profile),
        modelOutputUpper: adapterUpper(adapter, "model-output", candidate.summary, profile),
        toolCallUpper: adapterUpper(adapter, "compression-tool-call", oneTime.compressionToolCall, profile),
        toolResultUpper: adapterUpper(adapter, "compression-tool-result", oneTime.compressionToolResult, profile),
        qualityEvaluationUpper: adapterUpper(adapter, "quality-evaluation", oneTime.qualityEvaluation, profile),
        resentExactSourceUpper: range.tokenBounds.upper,
        cacheWritePenaltyUpper: result.replacementBounds.upper,
        safetyReserveUpper: V3_ECONOMICS_SAFETY_RESERVE_UPPER,
      }));
      expect(result.tokens.summaryTokensUpper).toBe(result.oneTimeCostUpper.modelOutputUpper);
    }

    expect(replacementDigests.size).toBe(4);
  });

  it("fails closed when a bound adapter is missing one requested converter surface", async () => {
    const target: PiProviderSerializerTarget = {
      api: "openai-responses",
      model: model("openai-responses", "openai", "gpt-4o-mini"),
    };
    const profile = exactProfile(target.model.provider, target.model.id);
    const range = exactRange(profile);
    const candidate: V3CompactEconomicsCandidate = {
      blockId: "block:missing-surface",
      blockRef: "b000001",
      catalogId,
      epochId: "epoch",
      projectionVersion: "projection-v3",
      tier: "T1",
      topic: "missing surface",
      summary: "must fail closed",
      source: { kind: "messages", range },
    };
    const oneTime = oneTimeSurfaces(candidate);
    const logical = evaluateV3CompactEconomics({ candidate, profile, pressureStage: "NORMAL", oneTime });
    expect(logical.ok).toBe(true);
    if (!logical.ok) throw new Error(logical.diagnostic);
    const allContexts = providerContexts(target, logical.replacementMessages, oneTime, candidate.summary);
    const completeAdapter = await createPiProviderEconomicsSurfaceAdapter({ profile, target, contexts: allContexts });
    expect(evaluateV3CompactEconomics({
      candidate: { ...candidate, summary: "stale adapter must not be reused" },
      profile,
      pressureStage: "NORMAL",
      oneTime,
      providerSurfaceAdapter: completeAdapter,
    })).toEqual(expect.objectContaining({ ok: false, reason: "surface-unavailable" }));
    expect(evaluateV3CompactEconomics({
      candidate,
      profile: { ...profile, profileKey: `${profile.profileKey}:different` },
      pressureStage: "NORMAL",
      oneTime,
      providerSurfaceAdapter: completeAdapter,
    })).toEqual(expect.objectContaining({ ok: false, reason: "surface-profile-mismatch" }));
    const { ["quality-evaluation"]: _missing, ...incomplete } = allContexts;
    const adapter = await createPiProviderEconomicsSurfaceAdapter({ profile, target, contexts: incomplete });
    expect(evaluateV3CompactEconomics({
      candidate,
      profile,
      pressureStage: "NORMAL",
      oneTime,
      providerSurfaceAdapter: adapter,
    })).toEqual(expect.objectContaining({ ok: false, reason: "surface-unavailable" }));
  });
});

function providerContexts(
  target: PiProviderSerializerTarget,
  replacementMessages: readonly unknown[],
  oneTime: V3OneTimeEconomicsSurfaces,
  summary: string,
  suffixContent?: string,
): Partial<Record<V3ProviderEconomicsSurfaceKind, PiProviderEconomicsContextSurface>> {
  const pair = providerContext(target, [oneTime.compressionToolCall, oneTime.compressionToolResult]);
  return {
    replacement: { logicalValue: replacementMessages, context: providerContext(target, replacementMessages) },
    "discovery-status": {
      logicalValue: oneTime.discoveryStatusInput,
      context: textContext(JSON.stringify(oneTime.discoveryStatusInput)),
    },
    ...(suffixContent ? {
      "compression-suffix": {
        logicalValue: replacementMessages.slice(-1),
        context: textContext(suffixContent),
      },
    } : {}),
    "model-output": { logicalValue: summary, context: textContext(summary) },
    "compression-tool-call": {
      logicalValue: oneTime.compressionToolCall,
      context: pair,
      select: (messages) => messages.slice(0, 1),
    },
    "compression-tool-result": {
      logicalValue: oneTime.compressionToolResult,
      context: pair,
      select: (messages) => messages.slice(-1),
    },
    "quality-evaluation": {
      logicalValue: oneTime.qualityEvaluation,
      context: textContext(JSON.stringify(oneTime.qualityEvaluation)),
    },
  };
}

function providerContext(target: PiProviderSerializerTarget, messages: readonly unknown[]): Context {
  return {
    messages: messages.map((message, index) => {
      const record = message as Record<string, unknown>;
      if (record.role === "custom") {
        return { role: "user", content: String(record.content ?? ""), timestamp: index + 1 };
      }
      if (record.role === "assistant") {
        return {
          ...record,
          api: target.api,
          provider: target.model.provider,
          model: target.model.id,
          usage: usage(),
          stopReason: "stop",
          timestamp: index + 1,
        };
      }
      return { ...record, timestamp: index + 1 };
    }),
    tools: [],
  } as unknown as Context;
}

function textContext(content: string): Context {
  return { messages: [{ role: "user", content, timestamp: 1 }], tools: [] } as Context;
}

function adapterUpper(
  adapter: Awaited<ReturnType<typeof createPiProviderEconomicsSurfaceAdapter>>,
  kind: V3ProviderEconomicsSurfaceKind,
  logicalValue: unknown,
  profile: ResolvedTokenBoundProfile,
): number {
  const surface = adapter.surfaceFor({ kind, logicalValue });
  if (!surface) throw new Error(`missing test surface: ${kind}`);
  return estimateTokenBounds(surface, profile).upper;
}

function exactProfile(providerId: string, modelId: string): ResolvedTokenBoundProfile {
  const profile: TokenBoundProfile = {
    providerId,
    modelId,
    estimatorVersion: TOKEN_ESTIMATOR_VERSION,
    source: "provider-calibrated",
    minBytesPerToken: 4,
    maxBytesPerToken: 4,
    messageOverheadLower: 2,
    messageOverheadUpper: 4,
    toolPartOverheadLower: 4,
    toolPartOverheadUpper: 8,
  };
  return resolveTokenBoundProfile(providerId, modelId, TOKEN_ESTIMATOR_VERSION, [profile]);
}

function exactRange(profile: ResolvedTokenBoundProfile): RecommendedSafeRange {
  return {
    rangeId: "r000001",
    catalogId,
    catalogScopeDigest: scopeDigest,
    scopeDigest: digest("provider-economics-range-scope"),
    sourceDigest: digest("provider-economics-range-source"),
    atomIds: ["a1", "a2"],
    orderedEntryIds: ["e1", "e2"],
    orderedRefs: ["m000001", "m000002"],
    startRef: "m000001",
    endRef: "m000002",
    tokenBounds: {
      lower: 100_000,
      upper: 100_000,
      saturated: false,
      source: profile.source,
      profileKey: profile.profileKey,
    },
  };
}

function oneTimeSurfaces(candidate: V3CompactEconomicsCandidate): V3OneTimeEconomicsSurfaces {
  return {
    discoveryStatusInput: { catalogId: candidate.catalogId, blockRef: candidate.blockRef, tier: candidate.tier },
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
    qualityEvaluation: { input: { tier: candidate.tier }, result: { status: "accepted", hardFactCount: 1 } },
  };
}

function model(api: string, provider: string, id: string) {
  return {
    id,
    name: id,
    api,
    provider,
    baseUrl: "https://invalid.local",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  } as any;
}

function usage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
