import { digest } from "./contracts.js";
import { TOOL_COOLING_PROFILE_VERSION } from "./cooling-profiles.js";
import {
  parseQualityInput,
  parseQualityResult,
  type QualityInputV1,
  type QualityResultV1,
  type QualitySourceKind,
} from "./quality.js";
import {
  verifyExactMutationScope,
  type BenefitDecision,
  type ExactMutationScope,
  type RecommendedSafeRange,
  type SafeRangePlan,
} from "./safe-planning.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  V3_LIMITS,
  applyV3Transaction,
  validateV3LifecycleState,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3AcceptedQualityMetadata,
  type V3ControlAction,
  type V3CoolingProfile,
  type V3CoolingReason,
  type V3ErrorCode,
  type V3Header,
  type V3LifecycleState,
  type V3ProviderObservationProvenance,
  type V3QualityMetadata,
  type V3SemanticBlock,
  type V3Tier,
  type V3TokenMetadata,
  type V3Transaction,
} from "./v3.js";

export const V3_MUTATION_PLANNER_VERSION = "aili.compact.mutation-planner.v3" as const;

export const V3_MUTATION_PLANNER_LIMITS = Object.freeze({
  maxFreshRefs: 8,
  maxErrorMessageChars: 192,
  maxErrorPathChars: 384,
});

const BLOCK_REF_PATTERN = /^b\d{6}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface V3MessageCatalogRef {
  ref: string;
  entryId: string;
  effectiveSourceOrdinal: number;
  /** An additional integration-owned hard protection bit. Safe-range membership remains authoritative. */
  protected?: boolean;
}

export interface V3BlockCatalogRef {
  ref: string;
  blockId: string;
  effectiveSourceOrdinal: number;
  /** Marks a readable v1/v2 reference which must never become a v3 child or root. */
  legacy?: boolean;
}

/** Frozen current-catalog adapter supplied by BranchIndex or its pure fallback. */
export interface V3MutationCatalog {
  /** Public branch/ref scope identity supplied by callers. */
  catalogId: string;
  /** Exact lifecycle pre-state identity written into the v3 header. */
  stateCatalogId: string;
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  projectionVersion: string;
  messageRefs: readonly V3MessageCatalogRef[];
  blockRefs: readonly V3BlockCatalogRef[];
}

export interface V3ProtectedOrdinalInterval {
  firstOrdinal: number;
  lastOrdinal: number;
}

export interface V3RestillPlannerPolicy {
  minChildren: number;
  minSourceTokens: number;
  minSavingsTokens: number;
  minSavingsRatio: number;
  maxSummaryTokens: number;
  minTurnsSinceCreate: number;
}

export interface V3MutationPlannerContext {
  state: V3LifecycleState;
  catalog: V3MutationCatalog;
  /** Required for T1. It is the exact atom-safe plan used to issue the caller's refs. */
  safePlan?: SafeRangePlan;
  /** Current-tail or other hard-protected effective leaf intervals. */
  protectedIntervals?: readonly V3ProtectedOrdinalInterval[];
  /** Readable legacy IDs known outside the v3 state map. */
  legacyBlockIds?: ReadonlySet<string>;
  /** Defaults to true. False disables only T3-to-T3 restilling. */
  restillEnabled?: boolean;
  /** Runtime config may only tighten the stable reducer-enforced restill defaults. */
  restillPolicy?: Partial<V3RestillPlannerPolicy>;
}

export interface V3BenefitEvidence {
  sourceDigest: string;
  /** Binds replacement-token economics to the exact proposed summary. */
  summaryDigest: string;
  orderedRefs: readonly string[];
  decision: BenefitDecision;
  tokens: V3TokenMetadata;
}

/** Runtime-only quality handoff. The input binds a valid result to the exact summary under commit. */
export interface V3EvaluatedQualityEvidence {
  input: QualityInputV1;
  result: QualityResultV1;
}

export interface V3UnevaluatedQualityEvidence {
  override: "quality-disabled";
}

export type V3QualityEvidence = V3EvaluatedQualityEvidence | V3UnevaluatedQualityEvidence;

interface V3SemanticRequestBase {
  operation: "compact";
  catalogId: string;
  transactionId: string;
  blockId: string;
  topic: string;
  summary: string;
  summaryMaxChars?: number;
  runId: string;
  createdAt: number;
  createdTurnOrdinal: number;
  benefit: V3BenefitEvidence;
  quality: V3QualityEvidence;
}

export type V3MessageMutationRequest = V3SemanticRequestBase & ExactMutationScope;

export interface V3BlockMutationRequest extends V3SemanticRequestBase {
  mode: "blocks";
  blockRefs: readonly string[];
}

interface V3ExplicitOperationBase {
  catalogId: string;
  transactionId: string;
  blockRefs: readonly string[];
  provenanceId: string;
  createdAt: number;
}

export interface V3DecompressMutationRequest extends V3ExplicitOperationBase {
  operation: "decompress";
  depth?: "one" | "raw";
}

export interface V3RecompressMutationRequest extends V3ExplicitOperationBase {
  operation: "recompress";
  decompressionTransactionId: string;
}

export interface V3ControlMutationRequest {
  operation: "control";
  catalogId: string;
  transactionId: string;
  action: V3ControlAction;
  provenanceId: string;
  provenanceKind: "explicit-user" | "automatic";
  createdAt: number;
}

export interface V3CoolingMutationRequest {
  operation: "cooling";
  catalogId: string;
  transactionId: string;
  targetEntryIds: readonly string[];
  profile: V3CoolingProfile;
  profileVersion: typeof TOOL_COOLING_PROFILE_VERSION;
  provenance: V3ProviderObservationProvenance;
  reason: V3CoolingReason;
  createdAt: number;
}

export type V3MutationRequest =
  | V3MessageMutationRequest
  | V3BlockMutationRequest
  | V3DecompressMutationRequest
  | V3RecompressMutationRequest;

export type V3MutationPlannerErrorCode =
  | V3ErrorCode
  | "invalid-request"
  | "invalid-catalog"
  | "duplicate-ref"
  | "stale-ref"
  | "legacy-block"
  | "protected-source"
  | "benefit-rejected"
  | "benefit-mismatch"
  | "quality-rejected"
  | "quality-mismatch"
  | "source-summary-scope-mismatch";

export interface V3MutationPlanSuccess {
  ok: true;
  transaction: V3Transaction;
  orderedRefs: readonly string[];
  sourceDigest?: string;
  targetTier?: V3Tier;
}

/** Error strings and discovery hints are deliberately bounded and contain no source or summary text. */
export interface V3MutationPlanFailure {
  ok: false;
  code: V3MutationPlannerErrorCode;
  message: string;
  path: string;
  freshRefs: readonly string[];
}

export type V3MutationPlanResult = V3MutationPlanSuccess | V3MutationPlanFailure;

interface ResolvedBlockRef {
  catalog: V3BlockCatalogRef;
  block: V3SemanticBlock;
}

interface SelectionResult<T> {
  ok: true;
  value: T;
}

type Selection<T> = SelectionResult<T> | V3MutationPlanFailure;

/** One dispatcher suitable for index wiring; the typed entry points below remain independently usable. */
export function planV3Mutation(request: V3MutationRequest, context: V3MutationPlannerContext): V3MutationPlanResult {
  if (request.operation === "decompress") return planV3DecompressMutation(request, context);
  if (request.operation === "recompress") return planV3RecompressMutation(request, context);
  if (request.mode === "blocks") return planV3BlockMutation(request, context);
  return planV3MessageMutation(request, context);
}

/** Plan one exact atom-safe T1 semantic transaction without mutating lifecycle state. */
export function planV3MessageMutation(
  request: V3MessageMutationRequest,
  context: V3MutationPlannerContext,
): V3MutationPlanResult {
  const ready = validatePlannerContext(request.catalogId, context, "messages");
  if (!ready.ok) return ready;
  const common = validateSemanticRequest(request, context);
  if (!common.ok) return common;
  const plan = context.safePlan;
  if (!plan || plan.catalogId !== context.catalog.catalogId) {
    return failure("source-summary-scope-mismatch", "A current exact safe-range plan is required.", "$.source", context);
  }

  const verified = verifyExactMutationScope(plan, request);
  if (!verified.ok) {
    return failure(
      "source-summary-scope-mismatch",
      "The requested source is not one exact current safe range.",
      "$.source",
      context,
      verified.freshRanges.flatMap((range) => [range.startRef, range.endRef]),
    );
  }
  const range = verified.range;
  const selected = resolveExactMessageRange(range, context);
  if (!selected.ok) return selected;
  if (selected.value.some((item) => item.protected === true)) {
    return failure("protected-source", "The selected range intersects protected source.", "$.source", context);
  }

  const entryIds = selected.value.map((item) => item.entryId);
  const orderedRefs = selected.value.map((item) => item.ref);
  const sourceDigest = range.sourceDigest;
  const benefit = validateBenefit(request.benefit, "T1", orderedRefs, sourceDigest, request.summary, context, range);
  if (!benefit.ok) return benefit;
  const quality = mapAcceptedQuality(request.quality, "T1", "messages", orderedRefs, sourceDigest, request.summary, context);
  if (!quality.ok) return quality;

  const transaction: V3Transaction = {
    header: header(context.state, request.transactionId, request.createdAt, context.catalog.catalogId),
    tag: "semantic-create",
    payload: {
      blockId: request.blockId,
      tier: "T1",
      topic: request.topic,
      runId: request.runId,
      anchorEntryId: entryIds[0]!,
      createdTurnOrdinal: request.createdTurnOrdinal,
      summary: request.summary,
      summaryDigest: v3SummaryDigest(request.summary),
      source: {
        kind: "messages",
        entryIds,
        firstEntryId: entryIds[0]!,
        lastEntryId: entryIds.at(-1)!,
      },
      leafDigest: v3MessageLeafDigest(entryIds),
      leafCount: entryIds.length,
      tokens: benefit.value,
      quality: quality.value,
    },
  };
  const ordinals = new Map(selected.value.map((item) => [item.entryId, item.effectiveSourceOrdinal] as const));
  return preflight(transaction, orderedRefs, sourceDigest, "T1", context, ordinals);
}

/** Plan a 2..16 child T1->T2, T2->T3, or strict-default T3->T3 transaction. */
export function planV3BlockMutation(
  request: V3BlockMutationRequest,
  context: V3MutationPlannerContext,
): V3MutationPlanResult {
  const ready = validatePlannerContext(request.catalogId, context, "blocks");
  if (!ready.ok) return ready;
  const common = validateSemanticRequest(request, context);
  if (!common.ok) return common;
  if (!Array.isArray(request.blockRefs)
    || request.blockRefs.length < V3_LIMITS.minChildBlocks
    || request.blockRefs.length > V3_LIMITS.maxChildBlocks) {
    return failure("invalid-request", "Block mode requires 2 to 16 references.", "$.blockRefs", context);
  }
  // Resolve identity first so an already-parented selection is diagnosed as such,
  // even though a valid replay has necessarily nested (deactivated) those children.
  const resolved = resolveBlockRefs(request.blockRefs, context, false);
  if (!resolved.ok) return resolved;
  const children = resolved.value;

  const activeParent = findSelectedActiveParent(children, context.state.blocks);
  if (activeParent) return failure("active-parent", "A selected child already has an active parent.", "$.blockRefs", context);
  for (const { block } of children) {
    if (block.queryOnly) return failure("query-only-child", "Query-only blocks cannot be mutated.", "$.blockRefs", context);
    if (block.epochId !== context.state.epochId) return failure("stale-ref", "A block reference belongs to another epoch.", "$.blockRefs", context);
    if (!block.active) return failure("inactive-child", "Inactive blocks cannot be selected as children.", "$.blockRefs", context);
    if (block.quality.status === "unevaluated") {
      return failure("quality-rejected", "Every child requires accepted quality metadata.", "$.blockRefs", context);
    }
    if (block.projectionVersion !== context.state.projectionVersion) {
      return failure("source-drift", "A child projection version is stale.", "$.blockRefs", context);
    }
  }
  if (new Set(children.map(({ block }) => block.tier)).size !== 1) {
    return failure("mixed-tier", "Block mode cannot merge different child tiers.", "$.blockRefs", context);
  }
  for (const item of children) {
    if (item.catalog.effectiveSourceOrdinal !== item.block.firstLeafOrdinal) {
      return failure("source-drift", "A block reference has stale ordinal metadata.", "$.blockRefs", context);
    }
  }
  for (let index = 1; index < children.length; index += 1) {
    if (children[index]!.block.firstLeafOrdinal !== children[index - 1]!.block.lastLeafOrdinal + 1) {
      return failure("non-contiguous-children", "Selected child coverage is not contiguous.", "$.blockRefs", context);
    }
  }
  if (intersectsProtectedIntervals(children, context.protectedIntervals ?? [])) {
    return failure("protected-source", "Selected child coverage intersects the protected tail.", "$.blockRefs", context);
  }

  const childTier = children[0]!.block.tier;
  const targetTier: V3Tier = childTier === "T1" ? "T2" : "T3";
  const orderedRefs = children.map((item) => item.catalog.ref);
  const sourceDigest = v3BlockSourceDigest(context.catalog.catalogId, children.map((item) => item.block));
  const benefit = validateBenefit(request.benefit, targetTier, orderedRefs, sourceDigest, request.summary, context);
  if (!benefit.ok) return benefit;
  if (childTier === "T3") {
    const restill = validateRestill(children.map((item) => item.block), request.createdTurnOrdinal, benefit.value, context);
    if (!restill.ok) return restill;
  }
  const quality = mapAcceptedQuality(request.quality, targetTier, "blocks", orderedRefs, sourceDigest, request.summary, context);
  if (!quality.ok) return quality;

  const childBlocks = children.map((item) => item.block);
  const leafCount = childBlocks.reduce((total, block) => total + block.leafCount, 0);
  const transaction: V3Transaction = {
    header: header(context.state, request.transactionId, request.createdAt, context.catalog.catalogId),
    tag: "semantic-create",
    payload: {
      blockId: request.blockId,
      tier: targetTier,
      topic: request.topic,
      runId: request.runId,
      anchorEntryId: childBlocks[0]!.anchorEntryId,
      createdTurnOrdinal: request.createdTurnOrdinal,
      summary: request.summary,
      summaryDigest: v3SummaryDigest(request.summary),
      source: { kind: "blocks", childBlockIds: childBlocks.map((block) => block.blockId) },
      leafDigest: v3ParentLeafDigest(targetTier, leafCount, childBlocks.map((block) => block.leafDigest)),
      leafCount,
      tokens: benefit.value,
      quality: quality.value,
    },
  };
  return preflight(transaction, orderedRefs, sourceDigest, targetTier, context);
}

export function planV3DecompressMutation(
  request: V3DecompressMutationRequest,
  context: V3MutationPlannerContext,
): V3MutationPlanResult {
  const ready = validatePlannerContext(request.catalogId, context, "blocks");
  if (!ready.ok) return ready;
  if (request.depth !== undefined && request.depth !== "one" && request.depth !== "raw") {
    return failure("invalid-request", "Decompression depth must be one or raw.", "$.depth", context);
  }
  const depth = request.depth ?? "one";
  const roots = resolveOperationRoots(request.blockRefs, context, true, depth === "one");
  if (!roots.ok) return roots;
  const transaction: V3Transaction = {
    header: header(context.state, request.transactionId, request.createdAt, context.catalog.catalogId),
    tag: "decompress",
    payload: {
      rootBlockIds: roots.value.map((item) => item.block.blockId),
      depth,
      provenance: { kind: "explicit-user", id: request.provenanceId },
      reason: "decompress",
    },
  };
  return preflight(transaction, roots.value.map((item) => item.catalog.ref), undefined, undefined, context);
}

export function planV3RecompressMutation(
  request: V3RecompressMutationRequest,
  context: V3MutationPlannerContext,
): V3MutationPlanResult {
  const ready = validatePlannerContext(request.catalogId, context, "blocks");
  if (!ready.ok) return ready;
  const roots = resolveOperationRoots(request.blockRefs, context, false, false);
  if (!roots.ok) return roots;
  for (const { block } of roots.value) {
    if (block.active || block.deactivationReason !== "decompress"
      || block.explicitDecompression?.transactionId !== request.decompressionTransactionId) {
      return failure("provenance-mismatch", "Recompression requires the exact prior decompression.", "$.blockRefs", context);
    }
  }
  const transaction: V3Transaction = {
    header: header(context.state, request.transactionId, request.createdAt, context.catalog.catalogId),
    tag: "recompress",
    payload: {
      rootBlockIds: roots.value.map((item) => item.block.blockId),
      decompressionTxId: request.decompressionTransactionId,
      provenance: { kind: "explicit-user", id: request.provenanceId },
      reason: "recompress",
    },
  };
  return preflight(transaction, roots.value.map((item) => item.catalog.ref), undefined, undefined, context);
}

/** Plan a closed v3 control record. Legacy control records may still be emitted
 * beside this transaction while the v1/v2 settings reader remains supported. */
export function planV3ControlMutation(
  request: V3ControlMutationRequest,
  context: V3MutationPlannerContext,
): V3MutationPlanResult {
  const ready = validatePlannerContext(request.catalogId, context, "blocks");
  if (!ready.ok) return ready;
  if (!boundedString(request.transactionId, V3_LIMITS.maxIdentifierChars)
    || !boundedString(request.provenanceId, V3_LIMITS.maxIdentifierChars)
    || !nonNegativeSafeInteger(request.createdAt)
    || (request.provenanceKind !== "explicit-user" && request.provenanceKind !== "automatic")) {
    return failure("invalid-request", "Control mutation fields are outside their bounds.", "$", context);
  }
  const transaction: V3Transaction = {
    header: header(context.state, request.transactionId, request.createdAt, context.catalog.catalogId),
    tag: "control",
    payload: {
      action: request.action,
      targetBlockIds: [],
      provenance: { kind: request.provenanceKind, id: request.provenanceId },
      reason: request.action,
    },
  };
  return preflight(transaction, [], undefined, undefined, context);
}

/** Plan one result-body-only cooling record from exact provider observation
 * evidence. One provenance identity deliberately binds one durable result. */
export function planV3CoolingMutation(
  request: V3CoolingMutationRequest,
  context: V3MutationPlannerContext,
): V3MutationPlanResult {
  const ready = validatePlannerContext(request.catalogId, context, "messages");
  if (!ready.ok) return ready;
  if (!boundedString(request.transactionId, V3_LIMITS.maxIdentifierChars)
    || !nonNegativeSafeInteger(request.createdAt)
    || request.profileVersion !== TOOL_COOLING_PROFILE_VERSION
    || !Array.isArray(request.targetEntryIds)
    || request.targetEntryIds.length !== 1
    || request.targetEntryIds[0] !== request.provenance.resultEntryId
    || request.provenance.kind !== "provider-observation"
    || request.provenance.sessionId !== context.state.sessionId
    || request.provenance.branchLeafId !== context.state.branchLeafId
    || request.provenance.epochId !== context.state.epochId
    || request.provenance.normalizedExactToolName.trim().toLocaleLowerCase("en-US") !== request.provenance.normalizedExactToolName) {
    return failure("invalid-request", "Cooling evidence is not one exact current result identity.", "$", context);
  }
  const refByEntryId = new Map(context.catalog.messageRefs.map((item) => [item.entryId, item.ref] as const));
  const orderedRefs = request.targetEntryIds.flatMap((entryId) => refByEntryId.get(entryId) ?? []);
  if (orderedRefs.length !== request.targetEntryIds.length) {
    return failure("stale-ref", "A cooling target is absent from the current catalog.", "$.targetEntryIds", context);
  }
  const transaction: V3Transaction = {
    header: header(context.state, request.transactionId, request.createdAt, context.catalog.catalogId),
    tag: "cooling",
    payload: {
      targetEntryIds: [...request.targetEntryIds],
      profile: request.profile,
      profileVersion: request.profileVersion,
      provenance: { ...request.provenance },
      reason: request.reason,
    },
  };
  return preflight(transaction, orderedRefs, undefined, undefined, context);
}

/** Canonical digest shared by block-source freezing, quality input, and benefit evidence. */
export function v3BlockSourceDigest(catalogId: string, children: readonly V3SemanticBlock[]): string {
  return digest({
    version: V3_MUTATION_PLANNER_VERSION,
    sourceKind: "blocks",
    catalogId,
    children: children.map((block) => ({
      blockId: block.blockId,
      tier: block.tier,
      epochId: block.epochId,
      projectionVersion: block.projectionVersion,
      firstLeafOrdinal: block.firstLeafOrdinal,
      lastLeafOrdinal: block.lastLeafOrdinal,
      leafCount: block.leafCount,
      leafDigest: block.leafDigest,
      quality: block.quality,
    })),
  });
}

function validatePlannerContext(
  requestedCatalogId: string,
  context: V3MutationPlannerContext,
  freshKind: "messages" | "blocks",
): Selection<true> {
  const { state, catalog } = context;
  const stateValidation = validateV3LifecycleState(state);
  if (!stateValidation.ok) {
    return failure(stateValidation.code, "The current v3 lifecycle state is invalid.", stateValidation.path, context);
  }
  if (!HASH_PATTERN.test(requestedCatalogId)
    || requestedCatalogId !== catalog.catalogId
    || catalog.stateCatalogId !== state.catalogId) {
    return failure("stale-catalog", "The supplied catalog is not current.", "$.catalogId", context, freshRefs(context, freshKind));
  }
  if (catalog.sessionId !== state.sessionId
    || catalog.branchLeafId !== state.branchLeafId
    || catalog.epochId !== state.epochId
    || catalog.projectionVersion !== state.projectionVersion) {
    return failure("stale-catalog", "The supplied catalog belongs to another branch or epoch.", "$.catalogId", context, freshRefs(context, freshKind));
  }
  if (!validCatalogEntries(catalog)) {
    return failure("invalid-catalog", "The current reference catalog is internally inconsistent.", "$.catalog", context);
  }
  if (!validProtectedIntervals(context.protectedIntervals ?? [])) {
    return failure("invalid-request", "Protected ordinal intervals are invalid.", "$.protectedIntervals", context);
  }
  return { ok: true, value: true };
}

function validateSemanticRequest(
  request: V3SemanticRequestBase,
  context: V3MutationPlannerContext,
): Selection<true> {
  if (!boundedString(request.transactionId, V3_LIMITS.maxIdentifierChars)
    || !boundedString(request.blockId, V3_LIMITS.maxIdentifierChars)
    || !boundedString(request.runId, V3_LIMITS.maxIdentifierChars)
    || !boundedString(request.topic, V3_LIMITS.maxTopicChars)
    || !boundedString(request.summary, V3_LIMITS.maxSummaryChars)
    || !nonNegativeSafeInteger(request.createdAt)
    || !nonNegativeSafeInteger(request.createdTurnOrdinal)) {
    return failure("invalid-request", "Semantic mutation fields are outside their bounds.", "$", context);
  }
  if (request.summaryMaxChars !== undefined
    && (!Number.isSafeInteger(request.summaryMaxChars)
      || request.summaryMaxChars < 256
      || request.summaryMaxChars > V3_LIMITS.maxSummaryChars
      || request.summary.length > request.summaryMaxChars)) {
    return failure("invalid-request", "Summary exceeds its declared bound.", "$.summary", context);
  }
  return { ok: true, value: true };
}

function resolveExactMessageRange(
  range: RecommendedSafeRange,
  context: V3MutationPlannerContext,
): Selection<V3MessageCatalogRef[]> {
  if (range.orderedRefs.length === 0
    || range.orderedRefs.length !== range.orderedEntryIds.length
    || range.orderedRefs.length > V3_LIMITS.maxMessageLeaves) {
    return failure("source-summary-scope-mismatch", "The safe range has invalid cardinality.", "$.source", context);
  }
  const byRef = new Map(context.catalog.messageRefs.map((item) => [item.ref, item] as const));
  const selected: V3MessageCatalogRef[] = [];
  const seenEntries = new Set<string>();
  for (let index = 0; index < range.orderedRefs.length; index += 1) {
    const item = byRef.get(range.orderedRefs[index]!);
    if (!item || item.entryId !== range.orderedEntryIds[index] || seenEntries.has(item.entryId)) {
      return failure("source-summary-scope-mismatch", "The safe range no longer matches the current catalog.", "$.source", context);
    }
    seenEntries.add(item.entryId);
    selected.push(item);
  }
  for (let index = 1; index < selected.length; index += 1) {
    if (selected[index]!.effectiveSourceOrdinal !== selected[index - 1]!.effectiveSourceOrdinal + 1) {
      return failure("non-contiguous-source", "The exact message source is not contiguous.", "$.source", context);
    }
  }
  return { ok: true, value: selected };
}

function resolveBlockRefs(
  refs: readonly string[],
  context: V3MutationPlannerContext,
  requireActive: boolean,
): Selection<ResolvedBlockRef[]> {
  if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string" || !BLOCK_REF_PATTERN.test(ref))) {
    return failure("invalid-request", "Block references must match b followed by six digits.", "$.blockRefs", context);
  }
  if (new Set(refs).size !== refs.length) {
    return failure("duplicate-ref", "Duplicate block references are not allowed.", "$.blockRefs", context);
  }
  const byRef = new Map(context.catalog.blockRefs.map((item) => [item.ref, item] as const));
  const resolved: ResolvedBlockRef[] = [];
  const blockIds = new Set<string>();
  for (const ref of refs) {
    const item = byRef.get(ref);
    if (!item) return failure("stale-ref", "A block reference is absent from the current catalog.", "$.blockRefs", context);
    if (item.legacy || context.legacyBlockIds?.has(item.blockId)) {
      return failure("legacy-block", "Legacy blocks cannot participate in v3 mutation.", "$.blockRefs", context);
    }
    if (blockIds.has(item.blockId)) return failure("duplicate-ref", "References resolve to the same block.", "$.blockRefs", context);
    blockIds.add(item.blockId);
    const block = context.state.blocks.get(item.blockId);
    if (!block) return failure("stale-ref", "A reference does not resolve to a current v3 semantic block.", "$.blockRefs", context);
    if (block.queryOnly) return failure("query-only-child", "Query-only blocks cannot be mutated.", "$.blockRefs", context);
    if (block.epochId !== context.state.epochId) return failure("stale-ref", "A block reference belongs to another epoch.", "$.blockRefs", context);
    if (requireActive && !block.active) return failure("inactive-child", "Inactive blocks cannot be selected.", "$.blockRefs", context);
    resolved.push({ catalog: item, block });
  }
  resolved.sort((left, right) => left.catalog.effectiveSourceOrdinal - right.catalog.effectiveSourceOrdinal
    || compareCodeUnits(left.catalog.ref, right.catalog.ref));
  return { ok: true, value: resolved };
}

function resolveOperationRoots(
  refs: readonly string[],
  context: V3MutationPlannerContext,
  requireActive: boolean,
  requireParent: boolean,
): Selection<ResolvedBlockRef[]> {
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > V3_LIMITS.maxRootBlocks) {
    return failure("invalid-request", "Operations require 1 to 16 block references.", "$.blockRefs", context);
  }
  const resolved = resolveBlockRefs(refs, context, requireActive);
  if (!resolved.ok) return resolved;
  for (const { block, catalog } of resolved.value) {
    if (requireParent && block.source.kind !== "blocks") {
      return failure("invalid-root", "A v3 operation root must be a semantic parent.", "$.blockRefs", context);
    }
    if (catalog.effectiveSourceOrdinal !== block.firstLeafOrdinal) {
      return failure("source-drift", "A root reference has stale ordinal metadata.", "$.blockRefs", context);
    }
  }
  return resolved;
}

function validateBenefit(
  evidence: V3BenefitEvidence,
  tier: V3Tier,
  orderedRefs: readonly string[],
  sourceDigest: string,
  summary: string,
  context: V3MutationPlannerContext,
  safeRange?: RecommendedSafeRange,
): Selection<V3TokenMetadata> {
  if (!evidence
    || evidence.sourceDigest !== sourceDigest
    || evidence.summaryDigest !== v3SummaryDigest(summary)
    || !arraysEqual(evidence.orderedRefs, orderedRefs)) {
    return failure("benefit-mismatch", "Benefit evidence does not match the selected source.", "$.benefit", context);
  }
  const { decision, tokens } = evidence;
  if (!decision || !tokens || decision.tier !== tier || !decision.eligible || decision.reasons.length !== 0 || decision.saturated) {
    return failure("benefit-rejected", "The selected source did not pass conservative benefit gates.", "$.benefit", context);
  }
  if (tokens.sourceTokensLower !== decision.sourceLower
    || tokens.sourceTokensUpper !== decision.sourceUpper
    || tokens.replacementTokensUpper !== decision.replacementUpper
    || tokens.steadySavingsTokensLower !== decision.steadySavingsLower
    || tokens.oneTimeCostTokensUpper !== decision.oneTimeCostUpper
    || tokens.breakEvenTurnsUpper !== decision.breakEvenTurnsUpper
    || !equalFloat(tokens.savingsRatio, decision.savingsRatio)) {
    return failure("benefit-mismatch", "Token metadata does not match its benefit decision.", "$.benefit", context);
  }
  if (safeRange) {
    const plan = context.safePlan!;
    if (tokens.sourceTokensLower !== safeRange.tokenBounds.lower
      || tokens.sourceTokensUpper !== safeRange.tokenBounds.upper
      || tokens.estimatorVersion !== plan.tokenProfile.estimatorVersion
      || tokens.providerId !== plan.tokenProfile.providerId
      || tokens.modelId !== plan.tokenProfile.modelId) {
      return failure("benefit-mismatch", "T1 token evidence does not match the exact safe-range plan.", "$.benefit", context);
    }
  }
  return { ok: true, value: { ...tokens } };
}

function mapAcceptedQuality(
  handoff: V3QualityEvidence,
  tier: V3Tier,
  sourceKind: QualitySourceKind,
  orderedRefs: readonly string[],
  sourceDigest: string,
  summary: string,
  context: V3MutationPlannerContext,
): Selection<V3QualityMetadata> {
  if (isUnevaluatedQualityEvidence(handoff)) {
    return { ok: true, value: { status: "unevaluated", override: "quality-disabled" } };
  }
  const qualityInput = parseQualityInput(handoff?.input);
  const parsed = parseQualityResult(handoff?.result);
  if (!qualityInput || !parsed) {
    return failure("quality-rejected", "Quality evidence is malformed or unknown-version.", "$.quality", context);
  }
  const evidence = parsed.qualityEvidence;
  if (qualityInput.tier !== tier
    || qualityInput.catalogId !== context.catalog.catalogId
    || qualityInput.sourceKind !== sourceKind
    || qualityInput.sourceDigest !== sourceDigest
    || qualityInput.summary !== summary
    || !arraysEqual(qualityInput.orderedRefs, orderedRefs)
    || evidence.tier !== tier
    || evidence.catalogId !== context.catalog.catalogId
    || evidence.sourceKind !== sourceKind
    || evidence.sourceDigest !== sourceDigest
    || !arraysEqual(evidence.orderedRefs, orderedRefs)) {
    return failure("quality-mismatch", "Quality evidence does not match the selected source.", "$.quality", context);
  }
  if (parsed.verdict === "reject"
    || parsed.counts.missingHardFacts !== 0
    || parsed.counts.coveredHardFacts !== parsed.counts.hardFacts) {
    return failure("quality-rejected", "The summary did not pass the quality gate.", "$.quality", context);
  }
  return {
    ok: true,
    value: {
      status: parsed.verdict === "pass" ? "accepted" : "accepted-with-warnings",
      evaluatorVersion: parsed.evaluatorVersion,
      sourceFactDigest: evidence.manifestDigest,
      hardFactCount: parsed.counts.hardFacts,
      coveredHardFactCount: parsed.counts.coveredHardFacts,
      warningCodes: [...parsed.codes],
    },
  };
}

function isUnevaluatedQualityEvidence(value: V3QualityEvidence): value is V3UnevaluatedQualityEvidence {
  return value !== null
    && typeof value === "object"
    && "override" in value
    && value.override === "quality-disabled"
    && Object.keys(value).length === 1;
}

function validateRestill(
  children: readonly V3SemanticBlock[],
  createdTurnOrdinal: number,
  tokens: V3TokenMetadata,
  context: V3MutationPlannerContext,
): Selection<true> {
  const limits = resolveV3RestillPlannerPolicy(context.restillPolicy);
  if (context.restillEnabled === false
    || children.length < limits.minChildren
    || children.length > V3_LIMITS.maxChildBlocks
    || children.some((child) => createdTurnOrdinal - child.createdTurnOrdinal < limits.minTurnsSinceCreate)
    || tokens.sourceTokensLower < limits.minSourceTokens
    || tokens.steadySavingsTokensLower < limits.minSavingsTokens
    || tokens.savingsRatio < limits.minSavingsRatio
    || tokens.summaryTokensUpper > limits.maxSummaryTokens) {
    return failure("restill-ineligible", "T3 restill defaults are not all satisfied.", "$.blockRefs", context);
  }
  return { ok: true, value: true };
}

/** Unsafe loosening is ignored; the schema/reducer defaults remain the hard policy floor. */
export function resolveV3RestillPlannerPolicy(
  override: Partial<V3RestillPlannerPolicy> = {},
): V3RestillPlannerPolicy {
  const defaults = V3_LIMITS.restill;
  const minimum = (candidate: unknown, fallback: number) => nonNegativeSafeInteger(candidate)
    ? Math.max(fallback, candidate)
    : fallback;
  const maximum = (candidate: unknown, fallback: number) => nonNegativeSafeInteger(candidate)
    ? Math.min(fallback, candidate)
    : fallback;
  const minSavingsRatio = typeof override.minSavingsRatio === "number"
    && Number.isFinite(override.minSavingsRatio)
    && override.minSavingsRatio >= 0
    ? Math.max(defaults.minSavingsRatio, override.minSavingsRatio)
    : defaults.minSavingsRatio;
  return {
    minChildren: minimum(override.minChildren, defaults.minChildren),
    minSourceTokens: minimum(override.minSourceTokens, defaults.minSourceTokens),
    minSavingsTokens: minimum(override.minSavingsTokens, defaults.minSavingsTokens),
    minSavingsRatio,
    maxSummaryTokens: maximum(override.maxSummaryTokens, defaults.maxSummaryTokens),
    minTurnsSinceCreate: minimum(override.minTurnsSinceCreate, defaults.minTurnsSinceCreate),
  };
}

function preflight(
  transaction: V3Transaction,
  orderedRefs: readonly string[],
  sourceDigest: string | undefined,
  targetTier: V3Tier | undefined,
  context: V3MutationPlannerContext,
  messageOrdinals?: ReadonlyMap<string, number>,
): V3MutationPlanResult {
  const applied = applyV3Transaction(context.state, transaction, {
    messageOrdinals,
    legacyBlockIds: context.legacyBlockIds,
    expectedCatalogId: context.catalog.catalogId,
  });
  if (!applied.ok) {
    return failure(applied.code, "The v3 atomic transition precondition failed.", applied.path, context);
  }
  return {
    ok: true,
    transaction: applied.value.transaction,
    orderedRefs: [...orderedRefs],
    ...(sourceDigest === undefined ? {} : { sourceDigest }),
    ...(targetTier === undefined ? {} : { targetTier }),
  };
}

function header(state: V3LifecycleState, transactionId: string, createdAt: number, publicCatalogId: string): V3Header {
  return {
    schema: AILI_COMPACT_SCHEMA_V3,
    txId: transactionId,
    sessionId: state.sessionId,
    branchLeafId: state.branchLeafId,
    epochId: state.epochId,
    catalogId: publicCatalogId,
    createdAt,
    projectionVersion: state.projectionVersion,
  };
}

function findSelectedActiveParent(
  selected: readonly ResolvedBlockRef[],
  blocks: ReadonlyMap<string, V3SemanticBlock>,
): V3SemanticBlock | undefined {
  const ids = new Set(selected.map((item) => item.block.blockId));
  return [...blocks.values()].find((candidate) => candidate.active
    && candidate.source.kind === "blocks"
    && candidate.source.childBlockIds.some((id) => ids.has(id)));
}

function intersectsProtectedIntervals(
  selected: readonly ResolvedBlockRef[],
  intervals: readonly V3ProtectedOrdinalInterval[],
): boolean {
  return selected.some(({ block }) => intervals.some((interval) => interval.firstOrdinal <= block.lastLeafOrdinal
    && block.firstLeafOrdinal <= interval.lastOrdinal));
}

function validCatalogEntries(catalog: V3MutationCatalog): boolean {
  const messageRefs = new Set<string>();
  const messageIds = new Set<string>();
  for (const item of catalog.messageRefs) {
    if (!boundedString(item.ref, V3_LIMITS.maxIdentifierChars)
      || !boundedString(item.entryId, V3_LIMITS.maxIdentifierChars)
      || !nonNegativeSafeInteger(item.effectiveSourceOrdinal)
      || messageRefs.has(item.ref)
      || messageIds.has(item.entryId)) return false;
    messageRefs.add(item.ref);
    messageIds.add(item.entryId);
  }
  const blockRefs = new Set<string>();
  const blockIds = new Set<string>();
  for (const item of catalog.blockRefs) {
    if (!BLOCK_REF_PATTERN.test(item.ref)
      || !boundedString(item.blockId, V3_LIMITS.maxIdentifierChars)
      || !nonNegativeSafeInteger(item.effectiveSourceOrdinal)
      || blockRefs.has(item.ref)
      || blockIds.has(item.blockId)) return false;
    blockRefs.add(item.ref);
    blockIds.add(item.blockId);
  }
  return true;
}

function validProtectedIntervals(intervals: readonly V3ProtectedOrdinalInterval[]): boolean {
  return Array.isArray(intervals) && intervals.every((interval) => nonNegativeSafeInteger(interval.firstOrdinal)
    && nonNegativeSafeInteger(interval.lastOrdinal)
    && interval.firstOrdinal <= interval.lastOrdinal);
}

function freshRefs(context: V3MutationPlannerContext, kind: "messages" | "blocks" = "blocks"): string[] {
  if (kind === "messages") {
    return [...new Set((context.safePlan?.ranges ?? []).flatMap((range) => [range.startRef, range.endRef]))]
      .slice(0, V3_MUTATION_PLANNER_LIMITS.maxFreshRefs);
  }
  return context.catalog.blockRefs
    .filter((item) => {
      const block = context.state.blocks.get(item.blockId);
      return item.legacy !== true && block?.active === true && block.queryOnly === false && block.epochId === context.state.epochId;
    })
    .sort((left, right) => left.effectiveSourceOrdinal - right.effectiveSourceOrdinal || compareCodeUnits(left.ref, right.ref))
    .slice(0, V3_MUTATION_PLANNER_LIMITS.maxFreshRefs)
    .map((item) => item.ref);
}

function failure(
  code: V3MutationPlannerErrorCode,
  message: string,
  path: string,
  context: V3MutationPlannerContext,
  hints: readonly string[] = freshRefs(context),
): V3MutationPlanFailure {
  return {
    ok: false,
    code,
    message: message.slice(0, V3_MUTATION_PLANNER_LIMITS.maxErrorMessageChars),
    path: path.slice(0, V3_MUTATION_PLANNER_LIMITS.maxErrorPathChars),
    freshRefs: [...new Set(hints.filter((value) => typeof value === "string" && value.length <= V3_LIMITS.maxIdentifierChars))]
      .slice(0, V3_MUTATION_PLANNER_LIMITS.maxFreshRefs),
  };
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function equalFloat(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= Number.EPSILON * 8;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
