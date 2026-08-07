import { canonicalJson, type CompactTransaction } from "./contracts.js";
import { semanticRecapProjection } from "./projector.js";
import { AILI_COMPACT_PROVIDER_SUFFIX, type ProviderSuffixResult } from "./provider-suffix.js";
import {
  isProviderSerializedSurface,
  type ProviderEconomicsSurfaceAdapter,
  type V3ProviderEconomicsSurfaceKind,
} from "./provider-economics.js";
import {
  estimateTokenBounds,
  evaluateTokenBenefit,
  type BenefitDecision,
  type BenefitPolicyOverride,
  type OneTimeCostUpper,
  type PressureStage,
  type RecommendedSafeRange,
  type ResolvedTokenBoundProfile,
  type TokenBounds,
  type TokenSurface,
} from "./safe-planning.js";
import {
  v3SummaryDigest,
  type V3SemanticBlock,
  type V3Tier,
  type V3TokenMetadata,
} from "./v3.js";
import { v3RecapProjection, type V3ProjectionMessage } from "./v3-projector.js";

export const COMPACT_ECONOMICS_VERSION = "aili.compact-economics.v1" as const;
export const V3_COMPACT_ECONOMICS_VERSION = "aili.compact-economics.v3" as const;
export const V3_ECONOMICS_SAFETY_RESERVE_UPPER = 256;

export interface CompactEconomicsInput {
  transaction: CompactTransaction;
  range: RecommendedSafeRange;
  profile: ResolvedTokenBoundProfile;
  request: unknown;
  pressureStage: PressureStage;
  suffixContent?: string;
  policy?: BenefitPolicyOverride;
}

export interface CompactEconomicsResult {
  version: typeof COMPACT_ECONOMICS_VERSION;
  decision: BenefitDecision;
  replacementSurface: TokenSurface;
  replacementUpper: number;
  oneTimeCostUpper: OneTimeCostUpper;
}

export interface V3ResolvedEconomicsChild {
  blockRef: string;
  block: V3SemanticBlock;
}

export interface V3T1EconomicsSource {
  kind: "messages";
  /** The exact current recommendation which owns source bounds and binding. */
  range: RecommendedSafeRange;
}

export interface V3BlockEconomicsSource {
  kind: "blocks";
  /** Canonical digest produced by the mutation/source-freezing layer. */
  sourceDigest: string;
  /** Already-resolved current-catalog children in effective source order. */
  children: readonly V3ResolvedEconomicsChild[];
}

interface V3EconomicsCandidateBase {
  blockId: string;
  /** The exact reference which the committed block will receive. */
  blockRef: string;
  catalogId: string;
  epochId: string;
  projectionVersion: string;
  topic: string;
  summary: string;
}

export type V3CompactEconomicsCandidate =
  | (V3EconomicsCandidateBase & { tier: "T1"; source: V3T1EconomicsSource })
  | (V3EconomicsCandidateBase & { tier: "T2" | "T3"; source: V3BlockEconomicsSource });

/** Exact one-time request surfaces. Undefined surfaces are rejected, never priced as empty. */
export interface V3OneTimeEconomicsSurfaces {
  discoveryStatusInput: unknown;
  compressionToolCall: unknown;
  compressionToolResult: unknown;
  qualityEvaluation: unknown;
  /** May tighten the built-in reserve, but cannot lower it. */
  safetyReserveUpper?: number;
}

export interface V3CompactEconomicsInput {
  candidate: V3CompactEconomicsCandidate;
  profile: ResolvedTokenBoundProfile;
  pressureStage: PressureStage;
  oneTime: V3OneTimeEconomicsSurfaces;
  /** The exact production provider-only suffix result, including its message wrapper. */
  providerSuffix?: Pick<ProviderSuffixResult, "content" | "message">;
  /** Optional exact provider-converter surfaces, bound to this token profile. */
  providerSurfaceAdapter?: ProviderEconomicsSurfaceAdapter;
  policy?: BenefitPolicyOverride;
}

export interface V3EconomicsBinding {
  blockRef: string;
  catalogId: string;
  orderedRefs: readonly string[];
  sourceDigest: string;
  summaryDigest: string;
}

export type V3CompactEconomicsFailureReason =
  | "invalid-candidate"
  | "invalid-child-source"
  | "invalid-message-range"
  | "invalid-provider-suffix"
  | "missing-one-time-surface"
  | "source-profile-mismatch"
  | "surface-profile-mismatch"
  | "surface-unavailable"
  /** Retained for result-shape compatibility; wide fallback profiles no longer emit it. */
  | "unknown-token-profile";

export interface V3CompactEconomicsFailure {
  ok: false;
  version: typeof V3_COMPACT_ECONOMICS_VERSION;
  reason: V3CompactEconomicsFailureReason;
  diagnostic: string;
}

export interface V3CompactEconomicsSuccess {
  ok: true;
  version: typeof V3_COMPACT_ECONOMICS_VERSION;
  tier: V3Tier;
  binding: V3EconomicsBinding;
  decision: BenefitDecision;
  /** Commit metadata is usable only when decision.eligible is true. */
  tokens: V3TokenMetadata;
  sourceBounds: TokenBounds;
  replacementBounds: TokenBounds;
  sourceMessages?: readonly V3ProjectionMessage[];
  replacementMessages: readonly V3ProjectionMessage[];
  replacementSurface: TokenSurface;
  sourceSurface?: TokenSurface;
  surfaceAdapterVersion?: string;
  oneTimeCostUpper: OneTimeCostUpper;
}

export type V3CompactEconomicsResult = V3CompactEconomicsFailure | V3CompactEconomicsSuccess;

/**
 * Prices the exact production recap envelope plus every one-time request
 * component. All values use the same provider/model profile as safe planning.
 */
export function evaluateCompactEconomics(input: CompactEconomicsInput): CompactEconomicsResult {
  const blocks = input.transaction.blocks ?? [];
  const recapMessages = blocks.flatMap((block, index) => {
    const recap = semanticRecapProjection(block, `b${String(index + 1).padStart(6, "0")}`);
    return [recap.call, recap.result];
  });
  const suffix = input.suffixContent
    ? [{ role: "custom", customType: "aili-compact-provider-suffix", content: input.suffixContent, display: false, timestamp: 0 }]
    : [];
  const replacementSurface = surface([...recapMessages, ...suffix]);
  const replacementBounds = estimateTokenBounds(replacementSurface, input.profile);
  const sourceUpper = input.range.tokenBounds.upper;
  const summaryText = blocks.map((block) => block.summary).join("\n");
  const evidence = blocks.map((block) => block.qualityEvidence ?? null);
  const oneTimeCostUpper: OneTimeCostUpper = {
    discoveryStatusInputUpper: upper({ version: COMPACT_ECONOMICS_VERSION, catalogId: input.range.catalogId,
      scopeDigest: input.range.scopeDigest, refs: input.range.orderedRefs }, input.profile),
    resentExactSourceUpper: sourceUpper,
    compressionSuffixUpper: input.suffixContent ? upper(input.suffixContent, input.profile) : 0,
    modelOutputUpper: upper(summaryText, input.profile),
    toolCallUpper: upper(input.request, input.profile),
    toolResultUpper: upper(input.transaction, input.profile),
    qualityEvaluationUpper: upper(evidence, input.profile),
    cacheWritePenaltyUpper: replacementBounds.upper,
    safetyReserveUpper: 256,
  };
  return {
    version: COMPACT_ECONOMICS_VERSION,
    decision: evaluateTokenBenefit({
      tier: "T1",
      pressureStage: input.pressureStage,
      sourceBounds: input.range.tokenBounds,
      replacementBounds,
      oneTimeCostUpper,
    }, input.policy),
    replacementSurface,
    replacementUpper: replacementBounds.upper,
    oneTimeCostUpper,
  };
}

/**
 * Prices one uncommitted v3 semantic candidate against its exact current
 * source. T2/T3 source and every replacement use the production recap
 * projector; a provider-only suffix is priced as its complete custom-message
 * wrapper. Unknown providers participate through the deliberately wide
 * fallback profile. Exact provider-converter surfaces may replace the local
 * canonical logical-message fallback and are profile-bound/fail-closed.
 */
export function evaluateV3CompactEconomics(input: V3CompactEconomicsInput): V3CompactEconomicsResult {
  if (input.providerSurfaceAdapter
    && input.providerSurfaceAdapter.profileKey !== input.profile.profileKey) {
    return v3Failure("surface-profile-mismatch", "Provider surfaces were not serialized for this exact token profile.");
  }
  const candidateDiagnostic = validateV3Candidate(input.candidate);
  if (candidateDiagnostic) return v3Failure("invalid-candidate", candidateDiagnostic);
  if (!hasCompleteOneTimeSurfaces(input.oneTime)) {
    return v3Failure("missing-one-time-surface", "Every exact one-time surface is required.");
  }
  const suffixMessage = validateV3Suffix(input.providerSuffix);
  if (suffixMessage === false) {
    return v3Failure("invalid-provider-suffix", "The suffix must be the exact production custom-message wrapper.");
  }

  const resolved = resolveV3EconomicsSource(input.candidate, input.profile, input.providerSurfaceAdapter);
  if (!resolved.ok) return resolved;
  const candidateBlock = candidateProjectionBlock(input.candidate, resolved.leafCount);
  const projected = v3RecapProjection(candidateBlock, input.candidate.blockRef);
  const replacementMessages: V3ProjectionMessage[] = [projected.call, projected.result];
  if (suffixMessage) replacementMessages.push(suffixMessage);

  try {
    const replacementSurface = pricedSurface(
      "replacement",
      replacementMessages,
      input.providerSurfaceAdapter,
    );
    const replacementBounds = estimateTokenBounds(replacementSurface, input.profile);
    const summaryTokensUpper = pricedUpper(
      "model-output",
      input.candidate.summary,
      input.profile,
      input.providerSurfaceAdapter,
    );
    const oneTimeCostUpper: OneTimeCostUpper = {
      discoveryStatusInputUpper: pricedUpper(
        "discovery-status",
        input.oneTime.discoveryStatusInput,
        input.profile,
        input.providerSurfaceAdapter,
      ),
      resentExactSourceUpper: resolved.sourceBounds.upper,
      compressionSuffixUpper: suffixMessage
        ? pricedUpper("compression-suffix", [suffixMessage], input.profile, input.providerSurfaceAdapter)
        : 0,
      modelOutputUpper: summaryTokensUpper,
      toolCallUpper: pricedUpper(
        "compression-tool-call",
        input.oneTime.compressionToolCall,
        input.profile,
        input.providerSurfaceAdapter,
      ),
      toolResultUpper: pricedUpper(
        "compression-tool-result",
        input.oneTime.compressionToolResult,
        input.profile,
        input.providerSurfaceAdapter,
      ),
      qualityEvaluationUpper: pricedUpper(
        "quality-evaluation",
        input.oneTime.qualityEvaluation,
        input.profile,
        input.providerSurfaceAdapter,
      ),
      cacheWritePenaltyUpper: replacementBounds.upper,
      safetyReserveUpper: tightenedSafetyReserve(input.oneTime.safetyReserveUpper),
    };
    const decision = evaluateTokenBenefit({
      tier: input.candidate.tier,
      pressureStage: input.pressureStage,
      sourceBounds: resolved.sourceBounds,
      replacementBounds,
      oneTimeCostUpper,
    }, input.policy);
    const tokens: V3TokenMetadata = {
      estimatorVersion: input.profile.estimatorVersion,
      providerId: input.profile.providerId,
      modelId: input.profile.modelId,
      sourceTokensLower: decision.sourceLower,
      sourceTokensUpper: decision.sourceUpper,
      replacementTokensUpper: decision.replacementUpper,
      steadySavingsTokensLower: decision.steadySavingsLower,
      oneTimeCostTokensUpper: decision.oneTimeCostUpper,
      breakEvenTurnsUpper: decision.breakEvenTurnsUpper,
      savingsRatio: decision.savingsRatio,
      summaryTokensUpper,
    };
    return {
      ok: true,
      version: V3_COMPACT_ECONOMICS_VERSION,
      tier: input.candidate.tier,
      binding: {
        blockRef: input.candidate.blockRef,
        catalogId: input.candidate.catalogId,
        orderedRefs: resolved.orderedRefs,
        sourceDigest: resolved.sourceDigest,
        summaryDigest: v3SummaryDigest(input.candidate.summary),
      },
      decision,
      tokens,
      sourceBounds: resolved.sourceBounds,
      replacementBounds,
      ...(resolved.sourceMessages ? { sourceMessages: resolved.sourceMessages } : {}),
      replacementMessages,
      replacementSurface,
      ...(resolved.sourceSurface ? { sourceSurface: resolved.sourceSurface } : {}),
      ...(input.providerSurfaceAdapter ? { surfaceAdapterVersion: input.providerSurfaceAdapter.version } : {}),
      oneTimeCostUpper,
    };
  } catch {
    return v3Failure("surface-unavailable", "A provider surface could not be serialized conservatively.");
  }
}

interface ResolvedV3EconomicsSource {
  ok: true;
  leafCount: number;
  orderedRefs: readonly string[];
  sourceDigest: string;
  sourceBounds: TokenBounds;
  sourceSurface?: TokenSurface;
  sourceMessages?: readonly V3ProjectionMessage[];
}

function resolveV3EconomicsSource(
  candidate: V3CompactEconomicsCandidate,
  profile: ResolvedTokenBoundProfile,
  providerSurfaceAdapter?: ProviderEconomicsSurfaceAdapter,
): ResolvedV3EconomicsSource | V3CompactEconomicsFailure {
  if (candidate.source.kind === "messages") {
    const range = candidate.source.range;
    if (range.catalogId !== candidate.catalogId
      || range.orderedEntryIds.length === 0
      || range.orderedEntryIds.length !== range.orderedRefs.length
      || range.tokenBounds.saturated
      || !validDigest(range.sourceDigest)) {
      return v3Failure("invalid-message-range", "The T1 source is not one exact finite current range.");
    }
    if (range.tokenBounds.profileKey !== profile.profileKey || range.tokenBounds.source !== profile.source) {
      return v3Failure("source-profile-mismatch", "The T1 range was not measured with this exact token profile.");
    }
    return {
      ok: true,
      leafCount: range.orderedEntryIds.length,
      orderedRefs: [...range.orderedRefs],
      sourceDigest: range.sourceDigest,
      sourceBounds: { ...range.tokenBounds },
    };
  }

  const children = candidate.source.children;
  if (!validDigest(candidate.source.sourceDigest)
    || children.length < 2 || children.length > 16
    || new Set(children.map(({ block }) => block.blockId)).size !== children.length
    || new Set(children.map(({ blockRef }) => blockRef)).size !== children.length
    || children.some(({ blockRef }) => !/^b\d{6}$/.test(blockRef))) {
    return v3Failure("invalid-child-source", "The block source identity or cardinality is invalid.");
  }
  const childTiers = new Set(children.map(({ block }) => block.tier));
  const childTier = children[0]!.block.tier;
  const validTransition = candidate.tier === "T2"
    ? childTier === "T1"
    : childTier === "T2" || childTier === "T3";
  if (childTiers.size !== 1 || !validTransition
    || children.some(({ block }) => !block.active || block.queryOnly
      || block.epochId !== candidate.epochId
      || block.projectionVersion !== candidate.projectionVersion
      || block.quality.status === "unevaluated"
      || block.summaryDigest !== v3SummaryDigest(block.summary))) {
    return v3Failure("invalid-child-source", "Children are stale, unaccepted, mixed-tier, or not projectable.");
  }
  for (let index = 1; index < children.length; index += 1) {
    const previous = children[index - 1]!.block;
    const current = children[index]!.block;
    if (current.firstLeafOrdinal <= previous.lastLeafOrdinal) {
      return v3Failure("invalid-child-source", "Children are not in strict non-overlapping source order.");
    }
  }
  const leafCount = children.reduce((total, { block }) => total + block.leafCount, 0);
  if (!Number.isSafeInteger(leafCount) || leafCount <= 0) {
    return v3Failure("invalid-child-source", "Child leaf coverage is not finitely bounded.");
  }
  try {
    const sourceMessages = children.flatMap(({ block, blockRef }) => {
      const recap = v3RecapProjection(block, blockRef);
      return [recap.call, recap.result];
    });
    const sourceSurface = pricedSurface("source", sourceMessages, providerSurfaceAdapter);
    return {
      ok: true,
      leafCount,
      orderedRefs: children.map(({ blockRef }) => blockRef),
      sourceDigest: candidate.source.sourceDigest,
      sourceBounds: estimateTokenBounds(sourceSurface, profile),
      sourceSurface,
      sourceMessages,
    };
  } catch {
    return v3Failure("surface-unavailable", "The child recap source could not be serialized conservatively.");
  }
}

function candidateProjectionBlock(candidate: V3CompactEconomicsCandidate, leafCount: number): V3SemanticBlock {
  let source: V3SemanticBlock["source"];
  let anchorEntryId: string;
  let firstLeafOrdinal: number;
  let lastLeafOrdinal: number;
  if (candidate.source.kind === "messages") {
    source = {
      kind: "messages",
      entryIds: [...candidate.source.range.orderedEntryIds],
      firstEntryId: candidate.source.range.orderedEntryIds[0]!,
      lastEntryId: candidate.source.range.orderedEntryIds.at(-1)!,
    };
    anchorEntryId = source.firstEntryId;
    firstLeafOrdinal = 0;
    lastLeafOrdinal = leafCount - 1;
  } else {
    source = { kind: "blocks", childBlockIds: candidate.source.children.map(({ block }) => block.blockId) };
    anchorEntryId = candidate.source.children[0]!.block.anchorEntryId;
    firstLeafOrdinal = candidate.source.children[0]!.block.firstLeafOrdinal;
    lastLeafOrdinal = candidate.source.children.at(-1)!.block.lastLeafOrdinal;
  }
  return {
    blockId: candidate.blockId,
    transactionId: "uncommitted",
    sessionId: "uncommitted",
    branchLeafId: "uncommitted",
    epochId: candidate.epochId,
    catalogIdAtCreate: candidate.catalogId,
    projectionVersion: candidate.projectionVersion,
    createdAt: 0,
    createdTurnOrdinal: 0,
    tier: candidate.tier,
    topic: candidate.topic,
    runId: "uncommitted",
    anchorEntryId,
    summary: candidate.summary,
    summaryDigest: v3SummaryDigest(candidate.summary),
    source,
    leafDigest: "uncommitted",
    leafCount,
    firstLeafOrdinal,
    lastLeafOrdinal,
    tokens: {
      estimatorVersion: "uncommitted", providerId: "uncommitted", modelId: "uncommitted",
      sourceTokensLower: 0, sourceTokensUpper: 0, replacementTokensUpper: 0,
      steadySavingsTokensLower: 0, oneTimeCostTokensUpper: 0, breakEvenTurnsUpper: 0,
      savingsRatio: 0, summaryTokensUpper: 0,
    },
    quality: { status: "unevaluated", override: "quality-disabled" },
    active: true,
    queryOnly: false,
  };
}

function validateV3Candidate(candidate: V3CompactEconomicsCandidate): string | undefined {
  if (!candidate || !bounded(candidate.blockId, 256) || !/^b\d{6}$/.test(candidate.blockRef)
    || !bounded(candidate.catalogId, 256) || !bounded(candidate.epochId, 256)
    || !bounded(candidate.projectionVersion, 256) || !bounded(candidate.topic, 200)
    || !bounded(candidate.summary, 10_000)) return "Candidate identity, reference, topic, or summary is invalid.";
  if (candidate.source.kind === "messages" && candidate.tier !== "T1") return "Message sources are T1-only.";
  if (candidate.source.kind === "blocks" && candidate.tier === "T1") return "Block sources require T2 or T3.";
  return undefined;
}

function hasCompleteOneTimeSurfaces(value: V3OneTimeEconomicsSurfaces | undefined): value is V3OneTimeEconomicsSurfaces {
  return value !== undefined
    && value.discoveryStatusInput !== undefined
    && value.compressionToolCall !== undefined
    && value.compressionToolResult !== undefined
    && value.qualityEvaluation !== undefined;
}

function validateV3Suffix(
  suffix: V3CompactEconomicsInput["providerSuffix"],
): V3ProjectionMessage | undefined | false {
  if (!suffix) return undefined;
  const message = suffix.message;
  return message.role === "custom"
    && message.customType === AILI_COMPACT_PROVIDER_SUFFIX
    && message.content === suffix.content
    && message.display === false
    && message.timestamp === 0
    ? message : false;
}

function tightenedSafetyReserve(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.max(V3_ECONOMICS_SAFETY_RESERVE_UPPER, value)
    : V3_ECONOMICS_SAFETY_RESERVE_UPPER;
}

function v3Failure(reason: V3CompactEconomicsFailureReason, diagnostic: string): V3CompactEconomicsFailure {
  return { ok: false, version: V3_COMPACT_ECONOMICS_VERSION, reason, diagnostic };
}

function validDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function bounded(value: string, max: number): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function surface(value: unknown): TokenSurface {
  const serialized = canonicalJson(value);
  return {
    utf8Bytes: Buffer.byteLength(serialized, "utf8"),
    messageCount: Array.isArray(value) ? value.length : 1,
    structuredToolPartCount: countToolParts(value),
  };
}

function upper(value: unknown, profile: ResolvedTokenBoundProfile): number {
  return estimateTokenBounds(surface(value), profile).upper;
}

function pricedSurface(
  kind: V3ProviderEconomicsSurfaceKind,
  logicalValue: unknown,
  adapter: ProviderEconomicsSurfaceAdapter | undefined,
): TokenSurface {
  if (!adapter) return v3Surface(logicalValue);
  const serialized = adapter.surfaceFor({ kind, logicalValue });
  if (!isProviderSerializedSurface(serialized)
    || serialized.messageCount === 0
    || serialized.utf8Bytes === 0) {
    throw new Error(`provider-surface-unavailable:${kind}`);
  }
  return {
    utf8Bytes: serialized.utf8Bytes,
    messageCount: serialized.messageCount,
    structuredToolPartCount: serialized.structuredToolPartCount,
    ...(serialized.saturated === true ? { saturated: true } : {}),
  };
}

function pricedUpper(
  kind: V3ProviderEconomicsSurfaceKind,
  logicalValue: unknown,
  profile: ResolvedTokenBoundProfile,
  adapter: ProviderEconomicsSurfaceAdapter | undefined,
): number {
  return estimateTokenBounds(pricedSurface(kind, logicalValue, adapter), profile).upper;
}

function countToolParts(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countToolParts(item), 0);
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  return (record.type === "toolCall" ? 1 : 0)
    + Object.values(record).reduce<number>((sum, item) => sum + countToolParts(item), 0);
}

function v3Surface(value: unknown): TokenSurface {
  const serialized = canonicalJson(value);
  return {
    utf8Bytes: Buffer.byteLength(serialized, "utf8"),
    messageCount: Array.isArray(value) ? value.length : 1,
    structuredToolPartCount: countV3ToolParts(value),
  };
}

function countV3ToolParts(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countV3ToolParts(item), 0);
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  return (record.type === "toolCall" || record.role === "toolResult" ? 1 : 0)
    + Object.values(record).reduce<number>((sum, item) => sum + countV3ToolParts(item), 0);
}
