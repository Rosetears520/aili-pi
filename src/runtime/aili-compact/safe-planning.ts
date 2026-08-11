import { digest, type SessionLikeEntry } from "./contracts.js";
import {
  buildProtocolAtoms,
  PROTOCOL_ATOM_PROTECTION_REASONS,
  type ProtocolAtom,
  type ProtocolAtomBuildResult,
  type ProtocolAtomProtectionReason,
} from "./protocol-atoms.js";

export const SAFE_PLANNING_VERSION = "aili.safe-planning.v1" as const;
export const TOKEN_ESTIMATOR_VERSION = "aili.token-bounds.v1" as const;
export const SATURATED_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
export const MAX_EXCLUSION_COUNT = 1_000_000;
export const MAX_FRESH_SAFE_RANGES = 8;
export const MAX_SAFE_RANGE_ENTRY_IDS = 256;

export interface SaturatingInteger {
  value: number;
  saturated: boolean;
}

export type TokenBoundSource = "baseline" | "fallback" | "provider-calibrated";

export interface TokenBoundProfile {
  providerId: string;
  modelId: string;
  estimatorVersion: string;
  source?: Exclude<TokenBoundSource, "fallback">;
  minBytesPerToken: number;
  maxBytesPerToken: number;
  messageOverheadLower: number;
  messageOverheadUpper: number;
  toolPartOverheadLower: number;
  toolPartOverheadUpper: number;
}

export type ResolvedTokenBoundProfile = Omit<TokenBoundProfile, "source"> & {
  source: TokenBoundSource;
  profileKey: string;
};

export interface TokenSurface {
  utf8Bytes: number;
  messageCount: number;
  structuredToolPartCount: number;
  saturated?: boolean;
}

export interface TokenBounds {
  lower: number;
  upper: number;
  saturated: boolean;
  source: TokenBoundSource;
  profileKey: string;
}

export const UNKNOWN_PROVIDER_TOKEN_PROFILE: Readonly<TokenBoundProfile> = Object.freeze({
  providerId: "unknown",
  modelId: "unknown",
  estimatorVersion: TOKEN_ESTIMATOR_VERSION,
  source: "baseline",
  minBytesPerToken: 1,
  maxBytesPerToken: 8,
  messageOverheadLower: 1,
  messageOverheadUpper: 16,
  toolPartOverheadLower: 4,
  toolPartOverheadUpper: 64,
});

/** Conservative built-in families; returned profiles remain exact provider/model keys. */
export function builtInTokenBoundProfiles(providerId: string | undefined, modelId: string | undefined): TokenBoundProfile[] {
  if (!nonEmpty(providerId) || !nonEmpty(modelId)) return [];
  const family = providerId.toLocaleLowerCase("en-US");
  if (!family.includes("openai") && !family.includes("anthropic") && !family.includes("google") && !family.includes("gemini")) return [];
  return [{
    providerId,
    modelId,
    estimatorVersion: TOKEN_ESTIMATOR_VERSION,
    source: "baseline",
    minBytesPerToken: 2,
    maxBytesPerToken: 6,
    messageOverheadLower: 2,
    messageOverheadUpper: 16,
    toolPartOverheadLower: 4,
    toolPartOverheadUpper: 64,
  }];
}

export interface RecentTailPolicy {
  preserveRecentAtoms: number;
  preserveRecentTokens: number;
  preserveRecentTokenCapRatio: number;
  preserveLastUserMessage: true;
}

export const DEFAULT_RECENT_TAIL_POLICY: Readonly<RecentTailPolicy> = Object.freeze({
  preserveRecentAtoms: 8,
  preserveRecentTokens: 12_000,
  preserveRecentTokenCapRatio: 0.10,
  preserveLastUserMessage: true,
});

export type SafeRangeExclusionReason = ProtocolAtomProtectionReason
  | "caller-protected"
  | "missing-ref"
  | "newest-user"
  | "recent-atom-tail"
  | "recent-token-tail"
  | "range-cardinality-limit"
  | "token-bounds-unavailable"
  | "unfinished-turn";

export const SAFE_RANGE_EXCLUSION_REASONS: readonly SafeRangeExclusionReason[] = [
  ...PROTOCOL_ATOM_PROTECTION_REASONS,
  "caller-protected",
  "missing-ref",
  "newest-user",
  "recent-atom-tail",
  "recent-token-tail",
  "range-cardinality-limit",
  "token-bounds-unavailable",
  "unfinished-turn",
];

export interface ProtectedAtom {
  atomId: string;
  reasons: readonly SafeRangeExclusionReason[];
}

export interface RecommendedSafeRange {
  rangeId: string;
  catalogId: string;
  catalogScopeDigest: string;
  scopeDigest: string;
  sourceDigest: string;
  atomIds: readonly string[];
  orderedEntryIds: readonly string[];
  orderedRefs: readonly string[];
  startRef: string;
  endRef: string;
  tokenBounds: TokenBounds;
}

export interface RecentTailReport {
  configuredAtoms: number;
  configuredTokens: number;
  tokenCapRatio: number;
  effectiveTokenBudget: number;
  windowSource: "fallback" | "model-window";
  contextWindow?: number;
  protectedAtomIds: readonly string[];
  coveredTokenBounds: TokenBounds;
}

export interface SafeRangePlan {
  version: typeof SAFE_PLANNING_VERSION;
  atomVersion: string;
  catalogId: string;
  catalogScopeDigest: string;
  scopeDigest: string;
  sourceDigest: string;
  tokenProfile: ResolvedTokenBoundProfile;
  tail: RecentTailReport;
  ranges: readonly RecommendedSafeRange[];
  protectedAtoms: readonly ProtectedAtom[];
  exclusionCounts: Readonly<Record<SafeRangeExclusionReason, number>>;
  diagnostics: readonly string[];
}

type ReferenceLookup = ReadonlyMap<string, string> | Readonly<Record<string, string>>;
type SourceOrdinalLookup = ReadonlyMap<string, number> | Readonly<Record<string, number>>;

export interface SafeRangePlanningInput {
  entries: readonly SessionLikeEntry[];
  atomBuild?: ProtocolAtomBuildResult;
  refs?: ReferenceLookup;
  sourceOrdinals?: SourceOrdinalLookup;
  catalogId?: string;
  contextWindow?: number;
  providerId?: string;
  modelId?: string;
  estimatorVersion?: string;
  tokenProfiles?: readonly TokenBoundProfile[];
  tailPolicy?: Partial<Omit<RecentTailPolicy, "preserveLastUserMessage">> & { preserveLastUserMessage?: boolean };
  additionalProtectedAtomIds?: readonly string[];
  additionalProtectedEntryIds?: readonly string[];
}

interface AtomPlanningRecord {
  atom: ProtocolAtom;
  refs: readonly string[];
  tokenBounds: TokenBounds;
  sourceOrdinalBounds?: { first: number; last: number };
  sourceOrdinalInvalid: boolean;
}

/** Resolve an exact immutable provider/model/version profile or the deliberately wide fallback. */
export function resolveTokenBoundProfile(
  providerId: string | undefined,
  modelId: string | undefined,
  estimatorVersion: string = TOKEN_ESTIMATOR_VERSION,
  profiles: readonly TokenBoundProfile[] = [],
): ResolvedTokenBoundProfile {
  const requestedProvider = nonEmpty(providerId) ? providerId : "unknown";
  const requestedModel = nonEmpty(modelId) ? modelId : "unknown";
  const exact = profiles.find((profile) => profile.providerId === requestedProvider
    && profile.modelId === requestedModel
    && profile.estimatorVersion === estimatorVersion
    && isValidTokenProfile(profile));
  const selected = exact ?? UNKNOWN_PROVIDER_TOKEN_PROFILE;
  const source: TokenBoundSource = exact ? (exact.source ?? "baseline") : "fallback";
  return {
    ...selected,
    providerId: requestedProvider,
    modelId: requestedModel,
    estimatorVersion,
    source,
    profileKey: `${requestedProvider}\u0000${requestedModel}\u0000${estimatorVersion}\u0000${source}`,
  };
}

/** Implements the canonical conservative UTF-8/message/tool-part token formulas. */
export function estimateTokenBounds(surface: TokenSurface, profile: ResolvedTokenBoundProfile): TokenBounds {
  if (surface.utf8Bytes === 0 && surface.messageCount === 0 && surface.structuredToolPartCount === 0 && !surface.saturated) {
    return tokenBounds(0, 0, false, profile);
  }
  const normalized = normalizeSurface(surface);
  const lower = saturatingAdd(
    ceilDiv(normalized.utf8Bytes, profile.maxBytesPerToken),
    saturatingMultiply(normalized.messageCount, profile.messageOverheadLower).value,
    saturatingMultiply(normalized.structuredToolPartCount, profile.toolPartOverheadLower).value,
  );
  const upper = saturatingAdd(
    ceilDiv(normalized.utf8Bytes, profile.minBytesPerToken),
    saturatingMultiply(normalized.messageCount, profile.messageOverheadUpper).value,
    saturatingMultiply(normalized.structuredToolPartCount, profile.toolPartOverheadUpper).value,
  );
  const componentSaturated = surface.saturated === true
    || normalized.saturated
    || multiplicationWouldSaturate(normalized.messageCount, profile.messageOverheadLower)
    || multiplicationWouldSaturate(normalized.messageCount, profile.messageOverheadUpper)
    || multiplicationWouldSaturate(normalized.structuredToolPartCount, profile.toolPartOverheadLower)
    || multiplicationWouldSaturate(normalized.structuredToolPartCount, profile.toolPartOverheadUpper);
  return tokenBounds(lower.value, upper.value, lower.saturated || upper.saturated || componentSaturated, profile);
}

/** Plans maximal contiguous atom-aligned ranges and never mutates Session state. */
export function planSafeRanges(input: SafeRangePlanningInput): SafeRangePlan {
  const atomBuild = input.atomBuild ?? buildProtocolAtoms(input.entries);
  const diagnostics: string[] = [];
  const tailPolicy = resolveTailPolicy(input.tailPolicy, diagnostics);
  const profile = resolveTokenBoundProfile(
    input.providerId,
    input.modelId,
    input.estimatorVersion ?? TOKEN_ESTIMATOR_VERSION,
    input.tokenProfiles,
  );
  const defaultRefs = defaultReferenceMap(input.entries);
  const resolvedRefs = new Map<string, string>();
  const refCounts = new Map<string, number>();
  for (const atom of atomBuild.atoms) {
    for (const entryId of atom.entryIds) {
      const ref = lookupReference(input.refs, entryId) ?? defaultRefs.get(entryId);
      if (!nonEmpty(ref)) continue;
      resolvedRefs.set(entryId, ref);
      refCounts.set(ref, (refCounts.get(ref) ?? 0) + 1);
    }
  }
  const orderedCatalogEntries = atomBuild.atoms.flatMap((atom) => atom.entryIds.map((entryId) => ({
    entryId,
    ref: resolvedRefs.get(entryId),
    ...(input.sourceOrdinals === undefined ? {} : {
      effectiveSourceOrdinal: lookupSourceOrdinal(input.sourceOrdinals, entryId),
    }),
  })));
  const catalogId = nonEmpty(input.catalogId)
    ? input.catalogId
    : digest({ version: "aili.safe-catalog.v1", entries: orderedCatalogEntries });
  const catalogScopeDigest = digest({ catalogId, entries: orderedCatalogEntries });

  const records: AtomPlanningRecord[] = atomBuild.atoms.map((atom) => {
    const ordinalResult = sourceOrdinalBounds(input.sourceOrdinals, atom.entryIds);
    return {
      atom,
      refs: atom.entryIds.flatMap((entryId) => {
        const ref = resolvedRefs.get(entryId);
        return ref && refCounts.get(ref) === 1 ? [ref] : [];
      }),
      tokenBounds: estimateTokenBounds({
        utf8Bytes: atom.utf8Bytes,
        messageCount: atom.messageCount,
        structuredToolPartCount: atom.structuredToolPartCount,
        saturated: atom.surfaceSaturated,
      }, profile),
      ...(ordinalResult.bounds === undefined ? {} : { sourceOrdinalBounds: ordinalResult.bounds }),
      sourceOrdinalInvalid: ordinalResult.invalid,
    };
  });

  const protections = new Map<string, Set<SafeRangeExclusionReason>>();
  for (const record of records) {
    const reasons = protectionSet(protections, record.atom.atomId);
    for (const reason of record.atom.protectionReasons) reasons.add(reason);
    if (record.refs.length !== record.atom.entryIds.length) reasons.add("missing-ref");
    if (record.sourceOrdinalInvalid) {
      reasons.add("missing-ref");
      diagnostics.push(`source-ordinal-gap:${record.atom.atomId}`);
    }
    if (record.atom.entryIds.length > MAX_SAFE_RANGE_ENTRY_IDS) reasons.add("range-cardinality-limit");
    if (record.tokenBounds.saturated) reasons.add("token-bounds-unavailable");
  }
  protectCallerSelections(input, atomBuild, protections);

  const effectiveTail = effectiveTokenTail(tailPolicy, input.contextWindow);
  let covered = emptyTokenBounds(profile);
  const tailAtomIds: string[] = [];
  for (let index = records.length - 1; index >= 0;) {
    const record = records[index]!;
    const needsAtomCount = tailAtomIds.length < tailPolicy.preserveRecentAtoms;
    const needsTokenBudget = covered.lower < effectiveTail.effectiveTokenBudget;
    if (!needsAtomCount && !needsTokenBudget) break;
    const reasons = protectionSet(protections, record.atom.atomId);
    if (needsAtomCount) reasons.add("recent-atom-tail");
    if (needsTokenBudget) reasons.add("recent-token-tail");
    tailAtomIds.unshift(record.atom.atomId);
    covered = addTokenBounds(covered, record.tokenBounds, profile);
    index -= 1;
  }

  const newestUserIndex = findLastIndex(records, (record) => record.atom.containsUser);
  if (newestUserIndex >= 0) protectionSet(protections, records[newestUserIndex]!.atom.atomId).add("newest-user");
  protectUnfinishedTurn(records, protections, newestUserIndex);

  const ranges: RecommendedSafeRange[] = [];
  let pending: AtomPlanningRecord[] = [];
  let pendingEntryCount = 0;
  let pendingLastSourceOrdinal: number | undefined;
  const flush = () => {
    if (pending.length === 0) return;
    ranges.push(makeSafeRange(ranges.length + 1, pending, catalogId, catalogScopeDigest, profile));
    pending = [];
    pendingEntryCount = 0;
    pendingLastSourceOrdinal = undefined;
  };
  for (const record of records) {
    if ((protections.get(record.atom.atomId)?.size ?? 0) > 0) {
      flush();
      continue;
    }
    if (pendingLastSourceOrdinal !== undefined
      && record.sourceOrdinalBounds !== undefined
      && record.sourceOrdinalBounds.first !== pendingLastSourceOrdinal + 1) flush();
    if (pendingEntryCount + record.atom.entryIds.length > MAX_SAFE_RANGE_ENTRY_IDS) flush();
    pending.push(record);
    pendingEntryCount += record.atom.entryIds.length;
    pendingLastSourceOrdinal = record.sourceOrdinalBounds?.last;
  }
  flush();

  const protectedAtoms = records.flatMap(({ atom }) => {
    const reasons = protections.get(atom.atomId);
    return reasons && reasons.size > 0 ? [{
      atomId: atom.atomId,
      reasons: SAFE_RANGE_EXCLUSION_REASONS.filter((reason) => reasons.has(reason)),
    }] : [];
  });
  const exclusionCounts = Object.fromEntries(SAFE_RANGE_EXCLUSION_REASONS.map((reason) => [
    reason,
    boundedCount(protectedAtoms.filter((atom) => atom.reasons.includes(reason)).length),
  ])) as Record<SafeRangeExclusionReason, number>;
  const sourceDigest = atomBuild.sourceDigest;
  const scopeDigest = digest({
    version: SAFE_PLANNING_VERSION,
    catalogId,
    catalogScopeDigest,
    sourceDigest,
    profileKey: profile.profileKey,
    tail: effectiveTail,
    ranges: ranges.map((range) => ({ rangeId: range.rangeId, scopeDigest: range.scopeDigest })),
    protectedAtoms,
  });

  return {
    version: SAFE_PLANNING_VERSION,
    atomVersion: atomBuild.version,
    catalogId,
    catalogScopeDigest,
    scopeDigest,
    sourceDigest,
    tokenProfile: profile,
    tail: {
      configuredAtoms: tailPolicy.preserveRecentAtoms,
      configuredTokens: tailPolicy.preserveRecentTokens,
      tokenCapRatio: tailPolicy.preserveRecentTokenCapRatio,
      effectiveTokenBudget: effectiveTail.effectiveTokenBudget,
      windowSource: effectiveTail.windowSource,
      ...(effectiveTail.contextWindow === undefined ? {} : { contextWindow: effectiveTail.contextWindow }),
      protectedAtomIds: tailAtomIds,
      coveredTokenBounds: covered,
    },
    ranges,
    protectedAtoms,
    exclusionCounts,
    diagnostics,
  };
}

export type ExactMutationScope = {
  mode: "range";
  catalogId: string;
  /** Internal handoff evidence; public tool callers remain ref-only. */
  scopeDigest?: string;
  /** Internal handoff evidence; public tool callers remain ref-only. */
  sourceDigest?: string;
  startRef: string;
  endRef: string;
} | {
  mode: "message";
  catalogId: string;
  /** Internal handoff evidence; public tool callers remain ref-only. */
  scopeDigest?: string;
  /** Internal handoff evidence; public tool callers remain ref-only. */
  sourceDigest?: string;
  messageRefs: readonly string[];
};

export type MutationScopeVerification = {
  ok: true;
  range: RecommendedSafeRange;
} | {
  ok: false;
  code: "source-summary-scope-mismatch";
  freshRanges: readonly Pick<RecommendedSafeRange, "endRef" | "rangeId" | "startRef">[];
};

/** Verifies exact recommendation equality; it never normalizes, widens, or filters a request. */
export function verifyExactMutationScope(plan: SafeRangePlan, request: ExactMutationScope): MutationScopeVerification {
  const candidate = request.mode === "range"
    ? plan.ranges.find((range) => range.startRef === request.startRef && range.endRef === request.endRef)
    : plan.ranges.find((range) => arraysEqual(range.orderedRefs, request.messageRefs));
  if (request.catalogId === plan.catalogId
    && candidate
    && (request.scopeDigest === undefined || request.scopeDigest === candidate.scopeDigest)
    && (request.sourceDigest === undefined || request.sourceDigest === candidate.sourceDigest)) {
    return { ok: true, range: candidate };
  }
  return {
    ok: false,
    code: "source-summary-scope-mismatch",
    freshRanges: plan.ranges.slice(0, MAX_FRESH_SAFE_RANGES).map(({ rangeId, startRef, endRef }) => ({
      rangeId,
      startRef,
      endRef,
    })),
  };
}

export const verifyRecommendedMutationScope = verifyExactMutationScope;

export type CompressionTier = "T1" | "T2" | "T3";
export type PressureStage = "CHECKPOINT_REQUIRED" | "FORCE_SEMANTIC" | "NORMAL" | "OVERFLOW_RECOVERY" | "PRESSURE";

export interface BenefitPolicy {
  minSteadySavingsTokens: Readonly<Record<CompressionTier, number>>;
  minSavingsRatio: number;
  maxBreakEvenTurns: Readonly<Record<"FORCE_SEMANTIC" | "NORMAL" | "PRESSURE", number>>;
}

export const DEFAULT_BENEFIT_POLICY: Readonly<BenefitPolicy> = Object.freeze({
  minSteadySavingsTokens: Object.freeze({ T1: 256, T2: 512, T3: 768 }),
  minSavingsRatio: 0.20,
  maxBreakEvenTurns: Object.freeze({ NORMAL: 8, PRESSURE: 4, FORCE_SEMANTIC: 1 }),
});

export const ONE_TIME_COST_COMPONENTS = [
  "discoveryStatusInputUpper",
  "resentExactSourceUpper",
  "compressionSuffixUpper",
  "modelOutputUpper",
  "toolCallUpper",
  "toolResultUpper",
  "qualityEvaluationUpper",
  "cacheWritePenaltyUpper",
  "safetyReserveUpper",
] as const;

export type OneTimeCostComponent = typeof ONE_TIME_COST_COMPONENTS[number];
export type OneTimeCostUpper = Readonly<Record<OneTimeCostComponent, number>>;

export interface BenefitPolicyOverride {
  minSteadySavingsTokens?: Partial<Record<CompressionTier, number>>;
  minSavingsRatio?: number;
  maxBreakEvenTurns?: Partial<Record<"FORCE_SEMANTIC" | "NORMAL" | "PRESSURE", number>>;
}

export interface BenefitInput {
  tier: CompressionTier;
  pressureStage: PressureStage;
  sourceBounds: Pick<TokenBounds, "lower" | "saturated" | "upper">;
  replacementBounds: Pick<TokenBounds, "lower" | "saturated" | "upper">;
  oneTimeCostUpper: OneTimeCostUpper;
}

export type BenefitRejectionReason = "bounds-unavailable"
  | "break-even-horizon"
  | "minimum-savings-ratio"
  | "minimum-steady-savings"
  | "negative-net-savings"
  | "no-steady-savings"
  | "pressure-stage-disallows-semantic"
  | "saturated-arithmetic";

export interface BenefitDecision {
  eligible: boolean;
  reasons: readonly BenefitRejectionReason[];
  tier: CompressionTier;
  pressureStage: PressureStage;
  horizonTurns: number;
  sourceLower: number;
  sourceUpper: number;
  replacementUpper: number;
  steadySavingsLower: number;
  savingsRatio: number;
  oneTimeCostUpper: number;
  breakEvenTurnsUpper: number;
  netSavingsLower: number;
  saturated: boolean;
}

/**
 * Tierless active-block writes retain bounded token accounting without
 * inheriting a fixed T1/T2/T3 policy, restill threshold, or hierarchy rank.
 */
export interface ActiveBenefitDecision extends Omit<BenefitDecision, "tier"> {
  semantics: "active-block";
}

/** Applies hard-minimum economics and pressure-specific break-even horizons. */
export function evaluateTokenBenefit(
  input: BenefitInput,
  policyOverride: BenefitPolicyOverride = {},
): BenefitDecision {
  const policy = resolveBenefitPolicy(policyOverride);
  const boundedStage = isSemanticPressureStage(input.pressureStage);
  const horizonTurns = isSemanticPressureStage(input.pressureStage)
    ? policy.maxBreakEvenTurns[input.pressureStage]
    : 0;
  const boundsAvailable = validBounds(input.sourceBounds) && validBounds(input.replacementBounds);
  const cost = saturatingAdd(...ONE_TIME_COST_COMPONENTS.map((key) => input.oneTimeCostUpper[key]));
  const arithmeticSaturated = input.sourceBounds.saturated
    || input.replacementBounds.saturated
    || cost.saturated;
  const sourceLower = boundsAvailable ? input.sourceBounds.lower : 0;
  const sourceUpper = boundsAvailable ? input.sourceBounds.upper : 0;
  const replacementUpper = boundsAvailable ? input.replacementBounds.upper : SATURATED_SAFE_INTEGER;
  const steadySavingsLower = boundsAvailable && sourceLower > replacementUpper
    ? sourceLower - replacementUpper : 0;
  const savingsRatio = boundsAvailable ? steadySavingsLower / Math.max(1, sourceUpper) : 0;
  const breakEvenTurnsUpper = steadySavingsLower > 0 && !cost.saturated
    ? ceilDiv(cost.value, steadySavingsLower) : SATURATED_SAFE_INTEGER;
  const gross = saturatingMultiply(horizonTurns, steadySavingsLower);
  const netSavingsLower = gross.saturated || cost.saturated
    ? -SATURATED_SAFE_INTEGER
    : gross.value - cost.value;
  const saturated = arithmeticSaturated || gross.saturated;
  const reasons = new Set<BenefitRejectionReason>();
  if (!boundedStage) reasons.add("pressure-stage-disallows-semantic");
  if (!boundsAvailable) reasons.add("bounds-unavailable");
  if (saturated) reasons.add("saturated-arithmetic");
  if (steadySavingsLower <= 0) reasons.add("no-steady-savings");
  if (steadySavingsLower < policy.minSteadySavingsTokens[input.tier]) reasons.add("minimum-steady-savings");
  if (savingsRatio < policy.minSavingsRatio) reasons.add("minimum-savings-ratio");
  if (breakEvenTurnsUpper > horizonTurns) reasons.add("break-even-horizon");
  if (netSavingsLower < 0) reasons.add("negative-net-savings");
  const orderedReasons: readonly BenefitRejectionReason[] = [
    "pressure-stage-disallows-semantic",
    "bounds-unavailable",
    "saturated-arithmetic",
    "no-steady-savings",
    "minimum-steady-savings",
    "minimum-savings-ratio",
    "break-even-horizon",
    "negative-net-savings",
  ].filter((reason) => reasons.has(reason as BenefitRejectionReason)) as BenefitRejectionReason[];
  return {
    eligible: orderedReasons.length === 0,
    reasons: orderedReasons,
    tier: input.tier,
    pressureStage: input.pressureStage,
    horizonTurns,
    sourceLower,
    sourceUpper,
    replacementUpper,
    steadySavingsLower,
    savingsRatio,
    oneTimeCostUpper: cost.value,
    breakEvenTurnsUpper,
    netSavingsLower,
    saturated,
  };
}

/** Applies only generic safety and positive-savings checks to an active block. */
export function evaluateActiveTokenBenefit(
  input: Omit<BenefitInput, "tier">,
): ActiveBenefitDecision {
  const boundedStage = isSemanticPressureStage(input.pressureStage);
  const boundsAvailable = validBounds(input.sourceBounds) && validBounds(input.replacementBounds);
  const cost = saturatingAdd(...ONE_TIME_COST_COMPONENTS.map((key) => input.oneTimeCostUpper[key]));
  const arithmeticSaturated = input.sourceBounds.saturated
    || input.replacementBounds.saturated
    || cost.saturated;
  const sourceLower = boundsAvailable ? input.sourceBounds.lower : 0;
  const sourceUpper = boundsAvailable ? input.sourceBounds.upper : 0;
  const replacementUpper = boundsAvailable ? input.replacementBounds.upper : SATURATED_SAFE_INTEGER;
  const steadySavingsLower = boundsAvailable && sourceLower > replacementUpper
    ? sourceLower - replacementUpper : 0;
  const savingsRatio = boundsAvailable ? steadySavingsLower / Math.max(1, sourceUpper) : 0;
  const breakEvenTurnsUpper = steadySavingsLower > 0 && !cost.saturated
    ? ceilDiv(cost.value, steadySavingsLower) : SATURATED_SAFE_INTEGER;
  const saturated = arithmeticSaturated;
  const reasons = new Set<BenefitRejectionReason>();
  if (!boundedStage) reasons.add("pressure-stage-disallows-semantic");
  if (!boundsAvailable) reasons.add("bounds-unavailable");
  if (saturated) reasons.add("saturated-arithmetic");
  if (steadySavingsLower <= 0) reasons.add("no-steady-savings");
  const orderedReasons: readonly BenefitRejectionReason[] = [
    "pressure-stage-disallows-semantic",
    "bounds-unavailable",
    "saturated-arithmetic",
    "no-steady-savings",
  ].filter((reason) => reasons.has(reason as BenefitRejectionReason)) as BenefitRejectionReason[];
  return {
    eligible: orderedReasons.length === 0,
    reasons: orderedReasons,
    semantics: "active-block",
    pressureStage: input.pressureStage,
    horizonTurns: 0,
    sourceLower,
    sourceUpper,
    replacementUpper,
    steadySavingsLower,
    savingsRatio,
    oneTimeCostUpper: cost.value,
    breakEvenTurnsUpper,
    netSavingsLower: steadySavingsLower,
    saturated,
  };
}

/** Unsafe loosening is ignored; callers may only tighten the stable minima/horizons. */
export function resolveBenefitPolicy(override: BenefitPolicyOverride = {}): BenefitPolicy {
  const savings = { ...DEFAULT_BENEFIT_POLICY.minSteadySavingsTokens };
  for (const tier of ["T1", "T2", "T3"] as const) {
    const candidate = override.minSteadySavingsTokens?.[tier];
    if (isNonNegativeSafeInteger(candidate)) savings[tier] = Math.max(savings[tier], candidate);
  }
  const horizons = { ...DEFAULT_BENEFIT_POLICY.maxBreakEvenTurns };
  for (const stage of ["NORMAL", "PRESSURE", "FORCE_SEMANTIC"] as const) {
    const candidate = override.maxBreakEvenTurns?.[stage];
    if (isNonNegativeSafeInteger(candidate)) horizons[stage] = Math.min(horizons[stage], candidate);
  }
  const minSavingsRatio = typeof override.minSavingsRatio === "number"
    && Number.isFinite(override.minSavingsRatio) && override.minSavingsRatio >= 0
    ? Math.max(DEFAULT_BENEFIT_POLICY.minSavingsRatio, override.minSavingsRatio)
    : DEFAULT_BENEFIT_POLICY.minSavingsRatio;
  return { minSteadySavingsTokens: savings, minSavingsRatio, maxBreakEvenTurns: horizons };
}

export function saturatingAdd(...values: readonly number[]): SaturatingInteger {
  let total = 0;
  let saturated = false;
  for (const value of values) {
    if (!isNonNegativeSafeInteger(value) || total > SATURATED_SAFE_INTEGER - value) {
      total = SATURATED_SAFE_INTEGER;
      saturated = true;
    } else if (!saturated) {
      total += value;
    }
  }
  return { value: total, saturated };
}

export function saturatingMultiply(left: number, right: number): SaturatingInteger {
  if (!isNonNegativeSafeInteger(left)
    || !isNonNegativeSafeInteger(right)
    || multiplicationWouldSaturate(left, right)) {
    return { value: SATURATED_SAFE_INTEGER, saturated: true };
  }
  return { value: left * right, saturated: false };
}

function makeSafeRange(
  ordinal: number,
  records: readonly AtomPlanningRecord[],
  catalogId: string,
  catalogScopeDigest: string,
  profile: ResolvedTokenBoundProfile,
): RecommendedSafeRange {
  const orderedEntryIds = records.flatMap(({ atom }) => atom.entryIds);
  const orderedRefs = records.flatMap(({ refs }) => refs);
  const sourceDigest = digest(records.map(({ atom }) => ({
    atomId: atom.atomId,
    entryIds: atom.entryIds,
    sourceDigest: atom.sourceDigest,
  })));
  const scopeDigest = digest({ catalogId, catalogScopeDigest, sourceDigest, orderedRefs });
  return {
    rangeId: `r${String(ordinal).padStart(6, "0")}`,
    catalogId,
    catalogScopeDigest,
    scopeDigest,
    sourceDigest,
    atomIds: records.map(({ atom }) => atom.atomId),
    orderedEntryIds,
    orderedRefs,
    startRef: orderedRefs[0]!,
    endRef: orderedRefs.at(-1)!,
    tokenBounds: records.reduce(
      (sum, record) => addTokenBounds(sum, record.tokenBounds, profile),
      emptyTokenBounds(profile),
    ),
  };
}

function protectCallerSelections(
  input: SafeRangePlanningInput,
  atomBuild: ProtocolAtomBuildResult,
  protections: Map<string, Set<SafeRangeExclusionReason>>,
): void {
  const requestedAtoms = new Set(input.additionalProtectedAtomIds ?? []);
  for (const entryId of input.additionalProtectedEntryIds ?? []) {
    const atomId = atomBuild.entryToAtomId.get(entryId);
    if (atomId) requestedAtoms.add(atomId);
  }
  for (const atomId of requestedAtoms) {
    if (atomBuild.atoms.some((atom) => atom.atomId === atomId)) {
      protectionSet(protections, atomId).add("caller-protected");
    }
  }
}

function protectUnfinishedTurn(
  records: readonly AtomPlanningRecord[],
  protections: Map<string, Set<SafeRangeExclusionReason>>,
  newestUserIndex: number,
): void {
  const lastConversationIndex = findLastIndex(records, ({ atom }) => atom.turnState !== "neutral");
  if (lastConversationIndex < 0 || records[lastConversationIndex]!.atom.turnState === "assistant-closed") return;
  let start = newestUserIndex >= 0 && newestUserIndex <= lastConversationIndex ? newestUserIndex : lastConversationIndex;
  const previousClosed = findLastIndex(records.slice(0, lastConversationIndex), ({ atom }) => atom.turnState === "assistant-closed");
  if (newestUserIndex < 0 && previousClosed >= 0) start = previousClosed + 1;
  for (let index = start; index < records.length; index += 1) {
    protectionSet(protections, records[index]!.atom.atomId).add("unfinished-turn");
  }
}

function effectiveTokenTail(
  policy: RecentTailPolicy,
  contextWindow: number | undefined,
): { contextWindow?: number; effectiveTokenBudget: number; windowSource: "fallback" | "model-window" } {
  if (isPositiveSafeInteger(contextWindow)) {
    return {
      contextWindow,
      effectiveTokenBudget: Math.min(
        policy.preserveRecentTokens,
        Math.floor(policy.preserveRecentTokenCapRatio * contextWindow),
      ),
      windowSource: "model-window",
    };
  }
  return { effectiveTokenBudget: policy.preserveRecentTokens, windowSource: "fallback" };
}

function resolveTailPolicy(
  override: SafeRangePlanningInput["tailPolicy"],
  diagnostics: string[],
): RecentTailPolicy {
  const atoms = safeIntegerOverride(
    override?.preserveRecentAtoms,
    DEFAULT_RECENT_TAIL_POLICY.preserveRecentAtoms,
    "preserveRecentAtoms",
    diagnostics,
  );
  const tokens = safeIntegerOverride(
    override?.preserveRecentTokens,
    DEFAULT_RECENT_TAIL_POLICY.preserveRecentTokens,
    "preserveRecentTokens",
    diagnostics,
  );
  const ratio = typeof override?.preserveRecentTokenCapRatio === "number"
    && Number.isFinite(override.preserveRecentTokenCapRatio)
    && override.preserveRecentTokenCapRatio >= DEFAULT_RECENT_TAIL_POLICY.preserveRecentTokenCapRatio
    ? override.preserveRecentTokenCapRatio
    : DEFAULT_RECENT_TAIL_POLICY.preserveRecentTokenCapRatio;
  if (override?.preserveRecentTokenCapRatio !== undefined
    && ratio !== override.preserveRecentTokenCapRatio) diagnostics.push("unsafe-preserveRecentTokenCapRatio-ignored");
  if (override?.preserveLastUserMessage === false) diagnostics.push("unsafe-preserveLastUserMessage-ignored");
  return {
    preserveRecentAtoms: atoms,
    preserveRecentTokens: tokens,
    preserveRecentTokenCapRatio: ratio,
    preserveLastUserMessage: true,
  };
}

function safeIntegerOverride(
  candidate: number | undefined,
  baseline: number,
  field: string,
  diagnostics: string[],
): number {
  if (candidate === undefined) return baseline;
  if (!isNonNegativeSafeInteger(candidate) || candidate < baseline) {
    diagnostics.push(`unsafe-${field}-ignored`);
    return baseline;
  }
  return candidate;
}

function lookupReference(refs: ReferenceLookup | undefined, entryId: string): string | undefined {
  if (!refs) return undefined;
  const possibleMap = refs as ReadonlyMap<string, string>;
  if (typeof possibleMap.get === "function") return possibleMap.get(entryId);
  const record = refs as Readonly<Record<string, string>>;
  return Object.prototype.hasOwnProperty.call(record, entryId) ? record[entryId] : undefined;
}

function lookupSourceOrdinal(ordinals: SourceOrdinalLookup, entryId: string): number | undefined {
  const possibleMap = ordinals as ReadonlyMap<string, number>;
  const value = typeof possibleMap.get === "function"
    ? possibleMap.get(entryId)
    : Object.prototype.hasOwnProperty.call(ordinals, entryId)
      ? (ordinals as Readonly<Record<string, number>>)[entryId]
      : undefined;
  // Number.MAX_SAFE_INTEGER is the mutation-catalog sentinel for an unknown
  // provider-source ordinal. Never advertise it as an executable range.
  return isNonNegativeSafeInteger(value) && value < Number.MAX_SAFE_INTEGER ? value : undefined;
}

function sourceOrdinalBounds(
  ordinals: SourceOrdinalLookup | undefined,
  entryIds: readonly string[],
): { bounds?: { first: number; last: number }; invalid: boolean } {
  if (ordinals === undefined) return { invalid: false };
  const values = entryIds.map((entryId) => lookupSourceOrdinal(ordinals, entryId));
  if (values.length === 0 || values.some((value) => value === undefined)) return { invalid: true };
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] !== values[index - 1]! + 1) return { invalid: true };
  }
  return { bounds: { first: values[0]!, last: values[values.length - 1]! }, invalid: false };
}

function defaultReferenceMap(entries: readonly SessionLikeEntry[]): Map<string, string> {
  const result = new Map<string, string>();
  let ordinal = 0;
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    ordinal += 1;
    result.set(entry.id, `m${String(ordinal).padStart(6, "0")}`);
  }
  return result;
}

function protectionSet(
  protections: Map<string, Set<SafeRangeExclusionReason>>,
  atomId: string,
): Set<SafeRangeExclusionReason> {
  const existing = protections.get(atomId);
  if (existing) return existing;
  const created = new Set<SafeRangeExclusionReason>();
  protections.set(atomId, created);
  return created;
}

function addTokenBounds(
  left: TokenBounds,
  right: TokenBounds,
  profile: ResolvedTokenBoundProfile,
): TokenBounds {
  const lower = saturatingAdd(left.lower, right.lower);
  const upper = saturatingAdd(left.upper, right.upper);
  return tokenBounds(
    lower.value,
    upper.value,
    left.saturated || right.saturated || lower.saturated || upper.saturated,
    profile,
  );
}

function emptyTokenBounds(profile: ResolvedTokenBoundProfile): TokenBounds {
  return tokenBounds(0, 0, false, profile);
}

function tokenBounds(
  lower: number,
  upper: number,
  saturated: boolean,
  profile: ResolvedTokenBoundProfile,
): TokenBounds {
  return { lower, upper, saturated, source: profile.source, profileKey: profile.profileKey };
}

function normalizeSurface(surface: TokenSurface): TokenSurface & { saturated: boolean } {
  const fields = [surface.utf8Bytes, surface.messageCount, surface.structuredToolPartCount];
  const saturated = surface.saturated === true || fields.some((value) => !isNonNegativeSafeInteger(value));
  return {
    utf8Bytes: isNonNegativeSafeInteger(surface.utf8Bytes) ? surface.utf8Bytes : SATURATED_SAFE_INTEGER,
    messageCount: isNonNegativeSafeInteger(surface.messageCount) ? surface.messageCount : SATURATED_SAFE_INTEGER,
    structuredToolPartCount: isNonNegativeSafeInteger(surface.structuredToolPartCount)
      ? surface.structuredToolPartCount : SATURATED_SAFE_INTEGER,
    saturated,
  };
}

function isValidTokenProfile(profile: TokenBoundProfile): boolean {
  return nonEmpty(profile.providerId)
    && nonEmpty(profile.modelId)
    && nonEmpty(profile.estimatorVersion)
    && isPositiveSafeInteger(profile.minBytesPerToken)
    && isPositiveSafeInteger(profile.maxBytesPerToken)
    && profile.minBytesPerToken <= profile.maxBytesPerToken
    && isNonNegativeSafeInteger(profile.messageOverheadLower)
    && isNonNegativeSafeInteger(profile.messageOverheadUpper)
    && profile.messageOverheadLower <= profile.messageOverheadUpper
    && isNonNegativeSafeInteger(profile.toolPartOverheadLower)
    && isNonNegativeSafeInteger(profile.toolPartOverheadUpper)
    && profile.toolPartOverheadLower <= profile.toolPartOverheadUpper;
}

function validBounds(bounds: Pick<TokenBounds, "lower" | "saturated" | "upper">): boolean {
  return !bounds.saturated
    && isNonNegativeSafeInteger(bounds.lower)
    && isNonNegativeSafeInteger(bounds.upper)
    && bounds.lower <= bounds.upper;
}

function multiplicationWouldSaturate(left: number, right: number): boolean {
  return right !== 0 && left > Math.floor(SATURATED_SAFE_INTEGER / right);
}

function ceilDiv(numerator: number, denominator: number): number {
  if (!isNonNegativeSafeInteger(numerator) || !isPositiveSafeInteger(denominator)) return SATURATED_SAFE_INTEGER;
  if (numerator === 0) return 0;
  return Math.floor((numerator - 1) / denominator) + 1;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function isSemanticPressureStage(
  stage: PressureStage,
): stage is "FORCE_SEMANTIC" | "NORMAL" | "PRESSURE" {
  return stage === "NORMAL" || stage === "PRESSURE" || stage === "FORCE_SEMANTIC";
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findLastIndex<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) if (predicate(values[index]!)) return index;
  return -1;
}

function boundedCount(value: number): number {
  return Math.min(MAX_EXCLUSION_COUNT, Math.max(0, value));
}
