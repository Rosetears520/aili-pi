import {
  digest,
  isRecord,
  type CompactControl,
  type CompactDeactivationReason,
  type CompactPolicyDecision,
} from "./contracts.js";

export const AILI_COMPACT_SCHEMA_V3 = "aili.compact.tx.v3" as const;

export const V3_LIMITS = {
  maxIdentifierChars: 256,
  maxProjectionVersionChars: 128,
  maxTopicChars: 200,
  maxSummaryChars: 10_000,
  maxMessageLeaves: 256,
  minChildBlocks: 2,
  maxChildBlocks: 16,
  maxRootBlocks: 16,
  maxRawClosureBlocks: 256,
  maxCoolingTargets: 64,
  maxWarningCodes: 32,
  maxRetainedOperations: 64,
  restill: {
    minChildren: 2,
    minSourceTokens: 8_000,
    minSavingsTokens: 1_024,
    minSavingsRatio: 0.25,
    maxSummaryTokens: 3_000,
    minTurnsSinceCreate: 8,
  },
} as const;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const V3_TAGS = ["semantic-create", "decompress", "recompress", "cooling", "control"] as const;
const V3_TIERS = ["T1", "T2", "T3"] as const;
const QUALITY_STATUSES = ["accepted", "accepted-with-warnings", "unevaluated"] as const;
const COOLING_PROFILES = ["retrieval", "execution-evidence", "mutation-evidence"] as const;
const PROVENANCE_KINDS = ["explicit-user", "automatic", "provider-observation"] as const;
const CONTROL_ACTIONS = [
  "on",
  "off",
  "restore-all",
  "panel-on",
  "panel-off",
  "manual-on",
  "manual-off",
  "manual-trigger",
  "manual-clear",
] as const satisfies readonly Exclude<CompactControl, "decompress" | "recompress">[];

export type V3Tag = typeof V3_TAGS[number];
export type V3Tier = typeof V3_TIERS[number];
export type V3QualityStatus = typeof QUALITY_STATUSES[number];
export type V3CoolingProfile = typeof COOLING_PROFILES[number];
export type V3ProvenanceKind = typeof PROVENANCE_KINDS[number];
export type V3ControlAction = typeof CONTROL_ACTIONS[number];
export type V3CoolingReason = CompactPolicyDecision["strategy"];

export interface V3Header {
  schema: typeof AILI_COMPACT_SCHEMA_V3;
  txId: string;
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  catalogId: string;
  createdAt: number;
  projectionVersion: string;
}

export interface V3MessageSource {
  kind: "messages";
  entryIds: string[];
  firstEntryId: string;
  lastEntryId: string;
}

export interface V3BlockSource {
  kind: "blocks";
  childBlockIds: string[];
}

export type V3SemanticSource = V3MessageSource | V3BlockSource;

export interface V3TokenMetadata {
  estimatorVersion: string;
  providerId: string;
  modelId: string;
  sourceTokensLower: number;
  sourceTokensUpper: number;
  replacementTokensUpper: number;
  steadySavingsTokensLower: number;
  oneTimeCostTokensUpper: number;
  breakEvenTurnsUpper: number;
  savingsRatio: number;
  summaryTokensUpper: number;
}

export interface V3AcceptedQualityMetadata {
  status: "accepted" | "accepted-with-warnings";
  evaluatorVersion: string;
  sourceFactDigest: string;
  hardFactCount: number;
  coveredHardFactCount: number;
  warningCodes: string[];
}

export interface V3UnevaluatedQualityMetadata {
  status: "unevaluated";
  override: "quality-disabled";
}

export type V3QualityMetadata = V3AcceptedQualityMetadata | V3UnevaluatedQualityMetadata;

export interface V3SemanticCreatePayload {
  blockId: string;
  tier: V3Tier;
  topic: string;
  runId: string;
  anchorEntryId: string;
  createdTurnOrdinal: number;
  summary: string;
  summaryDigest: string;
  source: V3SemanticSource;
  leafDigest: string;
  leafCount: number;
  tokens: V3TokenMetadata;
  quality: V3QualityMetadata;
}

export interface V3BasicOperationProvenance {
  kind: "explicit-user" | "automatic";
  id: string;
}

export interface V3ProviderObservationProvenance {
  kind: "provider-observation";
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  callEntryId: string;
  callId: string;
  normalizedExactToolName: string;
  resultEntryId: string;
  resultBodyDigest: string;
  providerInputIdentity: string;
  settledRequestId: string;
}

export type V3OperationProvenance = V3BasicOperationProvenance | V3ProviderObservationProvenance;

export interface V3DecompressPayload {
  rootBlockIds: string[];
  depth: "one" | "raw";
  provenance: V3OperationProvenance & { kind: "explicit-user" };
  reason: "decompress";
}

export interface V3RecompressPayload {
  rootBlockIds: string[];
  decompressionTxId: string;
  provenance: V3OperationProvenance & { kind: "explicit-user" };
  reason: "recompress";
}

export interface V3CoolingPayload {
  targetEntryIds: string[];
  profile: V3CoolingProfile;
  profileVersion: string;
  provenance: V3OperationProvenance & { kind: "provider-observation" };
  reason: V3CoolingReason;
}

export interface V3ControlPayload {
  action: V3ControlAction;
  targetBlockIds: string[];
  provenance: V3OperationProvenance & { kind: "explicit-user" | "automatic" };
  reason: V3ControlAction;
}

export type V3Transaction =
  | { header: V3Header; tag: "semantic-create"; payload: V3SemanticCreatePayload }
  | { header: V3Header; tag: "decompress"; payload: V3DecompressPayload }
  | { header: V3Header; tag: "recompress"; payload: V3RecompressPayload }
  | { header: V3Header; tag: "cooling"; payload: V3CoolingPayload }
  | { header: V3Header; tag: "control"; payload: V3ControlPayload };

export interface V3ExplicitDecompression {
  transactionId: string;
  depth: "one" | "raw";
  closureDigest: string;
  leafDigest: string;
  tier: V3Tier;
  qualityDigest: string;
  projectionVersion: string;
}

/** Derived replay state. None of these lifecycle booleans are accepted in a transaction payload. */
export interface V3SemanticBlock {
  blockId: string;
  transactionId: string;
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  catalogIdAtCreate: string;
  projectionVersion: string;
  createdAt: number;
  createdTurnOrdinal: number;
  tier: V3Tier;
  topic: string;
  runId: string;
  anchorEntryId: string;
  summary: string;
  summaryDigest: string;
  source: V3SemanticSource;
  leafDigest: string;
  leafCount: number;
  firstLeafOrdinal: number;
  lastLeafOrdinal: number;
  tokens: V3TokenMetadata;
  quality: V3QualityMetadata;
  active: boolean;
  queryOnly: boolean;
  deactivationReason?: CompactDeactivationReason;
  explicitDecompression?: V3ExplicitDecompression;
}

export interface V3LifecycleState {
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  catalogId: string;
  projectionVersion: string;
  blocks: ReadonlyMap<string, V3SemanticBlock>;
  transactions: ReadonlyMap<string, V3Transaction>;
  cooling: readonly V3CoolingPayload[];
  controls: readonly V3ControlPayload[];
}

export interface V3TransitionContext {
  /** Effective provider/source ordinals after protocol-atom validation. */
  messageOrdinals?: ReadonlyMap<string, number>;
  /** Lets the integration distinguish a forbidden v1/v2 child from an unknown ID. */
  legacyBlockIds?: ReadonlySet<string>;
  /** Exact public ref scope observed before this transaction. */
  expectedCatalogId?: string;
}

export type V3ErrorCode =
  | "unknown-field"
  | "invalid-field"
  | "invalid-tag"
  | "invalid-source"
  | "invalid-tier-source"
  | "digest-mismatch"
  | "token-metadata-invalid"
  | "quality-metadata-invalid"
  | "session-mismatch"
  | "branch-mismatch"
  | "epoch-mismatch"
  | "stale-catalog"
  | "projection-version-mismatch"
  | "duplicate-transaction"
  | "duplicate-block"
  | "message-ordinal-missing"
  | "non-contiguous-source"
  | "legacy-child"
  | "missing-child"
  | "inactive-child"
  | "query-only-child"
  | "mixed-tier"
  | "invalid-tier-transition"
  | "active-parent"
  | "non-canonical-child-order"
  | "non-contiguous-children"
  | "leaf-count-mismatch"
  | "leaf-digest-mismatch"
  | "restill-ineligible"
  | "overlap"
  | "cycle"
  | "invalid-active-state"
  | "invalid-root"
  | "overlapping-roots"
  | "closure-too-large"
  | "provenance-mismatch"
  | "source-drift";

export interface V3Failure {
  ok: false;
  code: V3ErrorCode;
  path: string;
}

export type V3Result<T> = { ok: true; value: T } | V3Failure;
export type V3TransitionResult = V3Result<{ state: V3LifecycleState; transaction: V3Transaction }>;

const TRANSACTION_KEYS = ["header", "payload", "tag"] as const;
const HEADER_KEYS = ["branchLeafId", "catalogId", "createdAt", "epochId", "projectionVersion", "schema", "sessionId", "txId"] as const;
const SEMANTIC_KEYS = ["anchorEntryId", "blockId", "createdTurnOrdinal", "leafCount", "leafDigest", "quality", "runId", "source", "summary", "summaryDigest", "tier", "tokens", "topic"] as const;
const MESSAGE_SOURCE_KEYS = ["entryIds", "firstEntryId", "kind", "lastEntryId"] as const;
const BLOCK_SOURCE_KEYS = ["childBlockIds", "kind"] as const;
const TOKEN_KEYS = ["breakEvenTurnsUpper", "estimatorVersion", "modelId", "oneTimeCostTokensUpper", "providerId", "replacementTokensUpper", "savingsRatio", "sourceTokensLower", "sourceTokensUpper", "steadySavingsTokensLower", "summaryTokensUpper"] as const;
const ACCEPTED_QUALITY_KEYS = ["coveredHardFactCount", "evaluatorVersion", "hardFactCount", "sourceFactDigest", "status", "warningCodes"] as const;
const UNEVALUATED_QUALITY_KEYS = ["override", "status"] as const;
const BASIC_PROVENANCE_KEYS = ["id", "kind"] as const;
const OBSERVATION_PROVENANCE_KEYS = ["branchLeafId", "callEntryId", "callId", "epochId", "kind", "normalizedExactToolName", "providerInputIdentity", "resultBodyDigest", "resultEntryId", "sessionId", "settledRequestId"] as const;
const DECOMPRESS_KEYS = ["depth", "provenance", "reason", "rootBlockIds"] as const;
const RECOMPRESS_KEYS = ["decompressionTxId", "provenance", "reason", "rootBlockIds"] as const;
const COOLING_KEYS = ["profile", "profileVersion", "provenance", "reason", "targetEntryIds"] as const;
const CONTROL_KEYS = ["action", "provenance", "reason", "targetBlockIds"] as const;

export function v3SummaryDigest(summary: string): string {
  return digest([AILI_COMPACT_SCHEMA_V3, "summary", summary]);
}

export function v3MessageLeafDigest(entryIds: readonly string[]): string {
  return digest([AILI_COMPACT_SCHEMA_V3, "message-leaves", ...entryIds]);
}

export function v3ParentLeafDigest(tier: V3Tier, leafCount: number, childLeafDigests: readonly string[]): string {
  return digest([AILI_COMPACT_SCHEMA_V3, "parent-leaves", tier, leafCount, ...childLeafDigests]);
}

export function parseV3Transaction(input: unknown): V3Result<V3Transaction> {
  if (!isRecord(input)) return fail("invalid-field", "$", undefined);
  const extra = unknownField(input, TRANSACTION_KEYS, "$", undefined);
  if (extra) return extra;
  const header = parseHeader(input.header);
  if (!header.ok) return header;
  if (!includes(V3_TAGS, input.tag)) return fail("invalid-tag", "$.tag", undefined);

  switch (input.tag) {
    case "semantic-create": {
      const payload = parseSemanticPayload(input.payload);
      return payload.ok ? ok({ header: header.value, tag: input.tag, payload: payload.value }) : payload;
    }
    case "decompress": {
      const payload = parseDecompressPayload(input.payload);
      return payload.ok ? ok({ header: header.value, tag: input.tag, payload: payload.value }) : payload;
    }
    case "recompress": {
      const payload = parseRecompressPayload(input.payload);
      return payload.ok ? ok({ header: header.value, tag: input.tag, payload: payload.value }) : payload;
    }
    case "cooling": {
      const payload = parseCoolingPayload(input.payload);
      return payload.ok ? ok({ header: header.value, tag: input.tag, payload: payload.value }) : payload;
    }
    case "control": {
      const payload = parseControlPayload(input.payload);
      return payload.ok ? ok({ header: header.value, tag: input.tag, payload: payload.value }) : payload;
    }
  }
}

export function createEmptyV3State(input: {
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  projectionVersion: string;
}): V3LifecycleState {
  const base = {
    ...input,
    blocks: new Map<string, V3SemanticBlock>(),
    transactions: new Map<string, V3Transaction>(),
    cooling: [] as readonly V3CoolingPayload[],
    controls: [] as readonly V3ControlPayload[],
  };
  return { ...base, catalogId: deriveV3CatalogId(base) };
}

export function deriveV3CatalogId(state: Omit<V3LifecycleState, "catalogId"> | V3LifecycleState): string {
  const blocks = [...state.blocks.values()]
    .sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal || left.blockId.localeCompare(right.blockId))
    .map((block) => ({
      blockId: block.blockId,
      tier: block.tier,
      epochId: block.epochId,
      leafDigest: block.leafDigest,
      leafCount: block.leafCount,
      active: block.active,
      queryOnly: block.queryOnly,
      deactivationReason: block.deactivationReason ?? null,
      explicitDecompression: block.explicitDecompression ?? null,
    }));
  return digest({
    schema: AILI_COMPACT_SCHEMA_V3,
    sessionId: state.sessionId,
    branchLeafId: state.branchLeafId,
    epochId: state.epochId,
    projectionVersion: state.projectionVersion,
    blocks,
    transactionIds: [...state.transactions.keys()].sort(),
    cooling: state.cooling,
    controls: state.controls,
  });
}

export function applyV3Transaction(
  state: V3LifecycleState,
  input: unknown,
  context: V3TransitionContext = {},
): V3TransitionResult {
  const stateValidation = validateV3LifecycleState(state);
  if (!stateValidation.ok) return stateValidation;
  const parsed = parseV3Transaction(input);
  if (!parsed.ok) return parsed;
  const transaction = parsed.value;
  const identity = validateTransactionIdentity(state, transaction, context.expectedCatalogId);
  if (identity) return identity;

  switch (transaction.tag) {
    case "semantic-create":
      return applySemanticCreate(state, transaction, context);
    case "decompress":
      return applyDecompress(state, transaction);
    case "recompress":
      return applyRecompress(state, transaction);
    case "cooling":
      return commit(state, transaction, new Map(state.blocks), transaction.payload, undefined);
    case "control":
      return applyControl(state, transaction);
  }
}

export function advanceV3Epoch(state: V3LifecycleState, newEpochId: string): V3Result<V3LifecycleState> {
  const valid = validateV3LifecycleState(state);
  if (!valid.ok) return valid;
  if (!boundedString(newEpochId, V3_LIMITS.maxIdentifierChars) || newEpochId === state.epochId) {
    return fail("invalid-field", "$.epochId", undefined);
  }
  const blocks = new Map<string, V3SemanticBlock>();
  for (const [id, block] of state.blocks) {
    blocks.set(id, block.epochId === state.epochId
      ? { ...block, active: false, queryOnly: true, deactivationReason: "epoch", explicitDecompression: undefined }
      : block);
  }
  const withoutCatalog = { ...state, epochId: newEpochId, blocks };
  const next = { ...withoutCatalog, catalogId: deriveV3CatalogId(withoutCatalog) };
  const nextValid = validateV3LifecycleState(next);
  return nextValid.ok ? ok(next) : nextValid;
}

export function maximalActiveV3Blocks(state: V3LifecycleState): V3Result<V3SemanticBlock[]> {
  const valid = validateV3LifecycleState(state);
  if (!valid.ok) return valid;
  return ok([...state.blocks.values()]
    .filter((block) => block.active && !block.queryOnly && block.epochId === state.epochId)
    .sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal || left.blockId.localeCompare(right.blockId)));
}

export function validateV3LifecycleState(state: V3LifecycleState): V3Result<true> {
  if (!boundedString(state.sessionId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", "$.sessionId", undefined);
  if (!boundedString(state.branchLeafId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", "$.branchLeafId", undefined);
  if (!boundedString(state.epochId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", "$.epochId", undefined);
  if (!boundedString(state.projectionVersion, V3_LIMITS.maxProjectionVersionChars)) return fail("invalid-field", "$.projectionVersion", undefined);
  if (!HASH_PATTERN.test(state.catalogId)) return fail("invalid-field", "$.catalogId", undefined);

  const cycle = detectCycle(state.blocks);
  if (cycle) return cycle;

  const activeParentCounts = new Map<string, number>();
  for (const [mapId, block] of [...state.blocks.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const path = `$.blocks.${mapId}`;
    if (mapId !== block.blockId) return fail("invalid-field", `${path}.blockId`, undefined);
    if (block.sessionId !== state.sessionId) return fail("session-mismatch", `${path}.sessionId`, undefined);
    if (block.branchLeafId !== state.branchLeafId) return fail("branch-mismatch", `${path}.branchLeafId`, undefined);
    if (!includes(V3_TIERS, block.tier)) return fail("invalid-field", `${path}.tier`, undefined);
    if (block.summaryDigest !== v3SummaryDigest(block.summary)) return fail("digest-mismatch", `${path}.summaryDigest`, undefined);
    const token = parseTokenMetadata(block.tokens, `${path}.tokens`, block.tier);
    if (!token.ok) return token;
    const quality = parseQualityMetadata(block.quality, `${path}.quality`);
    if (!quality.ok) return quality;
    if (!safeInteger(block.firstLeafOrdinal) || !safeInteger(block.lastLeafOrdinal) || block.lastLeafOrdinal < block.firstLeafOrdinal) {
      return fail("invalid-field", `${path}.firstLeafOrdinal`, undefined);
    }
    if (block.epochId !== state.epochId) {
      if (block.active || !block.queryOnly || block.deactivationReason !== "epoch") return fail("invalid-active-state", path, undefined);
    } else if (block.queryOnly || block.deactivationReason === "epoch") {
      return fail("invalid-active-state", path, undefined);
    }
    if (block.active && block.deactivationReason !== undefined) return fail("invalid-active-state", path, undefined);
    if (!block.active && block.deactivationReason === undefined) return fail("invalid-active-state", path, undefined);
    if (block.deactivationReason === "gc" || block.deactivationReason === "recompress") {
      return fail("invalid-active-state", `${path}.deactivationReason`, undefined);
    }

    const structure = validateBlockStructure(block, state.blocks, path);
    if (structure) return structure;
    if (block.active && block.source.kind === "blocks") {
      for (const childId of block.source.childBlockIds) {
        const child = state.blocks.get(childId)!;
        if (child.active || child.deactivationReason !== "nested" || child.queryOnly) {
          return fail("invalid-active-state", `$.blocks.${childId}`, undefined);
        }
        activeParentCounts.set(childId, (activeParentCounts.get(childId) ?? 0) + 1);
      }
    }
    if (block.explicitDecompression !== undefined) {
      if (block.active || block.queryOnly || block.deactivationReason !== "decompress") {
        return fail("invalid-active-state", `${path}.explicitDecompression`, undefined);
      }
      if (block.explicitDecompression.leafDigest !== block.leafDigest
        || block.explicitDecompression.tier !== block.tier
        || block.explicitDecompression.qualityDigest !== digest(block.quality)
        || block.explicitDecompression.projectionVersion !== block.projectionVersion) {
        return fail("source-drift", `${path}.explicitDecompression`, undefined);
      }
      const closure = descendantClosure(
        state.blocks,
        block.blockId,
        block.explicitDecompression.depth === "raw" ? V3_LIMITS.maxRawClosureBlocks : Number.MAX_SAFE_INTEGER,
      );
      if (!closure.ok) return closure;
      if (block.explicitDecompression.closureDigest !== closureDigest(state.blocks, closure.value)) {
        return fail("source-drift", `${path}.explicitDecompression.closureDigest`, undefined);
      }
    }
  }

  for (const [childId, count] of [...activeParentCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (count > 1) return fail("active-parent", `$.blocks.${childId}`, undefined);
  }

  const active = [...state.blocks.values()]
    .filter((block) => block.active && block.epochId === state.epochId)
    .sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal || left.blockId.localeCompare(right.blockId));
  for (let index = 1; index < active.length; index += 1) {
    if (active[index]!.firstLeafOrdinal <= active[index - 1]!.lastLeafOrdinal) {
      return fail("overlap", `$.blocks.${active[index]!.blockId}`, undefined);
    }
  }

  for (const [txId, transaction] of [...state.transactions.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const parsed = parseV3Transaction(transaction);
    if (!parsed.ok) return parsed;
    if (txId !== transaction.header.txId) return fail("invalid-field", `$.transactions.${txId}`, undefined);
    if (transaction.header.sessionId !== state.sessionId) return fail("session-mismatch", `$.transactions.${txId}.header.sessionId`, undefined);
    if (transaction.header.branchLeafId !== state.branchLeafId) return fail("branch-mismatch", `$.transactions.${txId}.header.branchLeafId`, undefined);
  }
  if (deriveV3CatalogId(state) !== state.catalogId) return fail("stale-catalog", "$.catalogId", undefined);
  return ok(true);
}

function parseHeader(value: unknown): V3Result<V3Header> {
  const path = "$.header";
  if (!isRecord(value)) return fail("invalid-field", path, undefined);
  const extra = unknownField(value, HEADER_KEYS, path, undefined);
  if (extra) return extra;
  if (value.schema !== AILI_COMPACT_SCHEMA_V3) return fail("invalid-field", `${path}.schema`, undefined);
  const txId = value.txId;
  const sessionId = value.sessionId;
  const branchLeafId = value.branchLeafId;
  const epochId = value.epochId;
  if (!boundedString(txId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.txId`, undefined);
  if (!boundedString(sessionId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.sessionId`, undefined);
  if (!boundedString(branchLeafId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.branchLeafId`, undefined);
  if (!boundedString(epochId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.epochId`, undefined);
  if (typeof value.catalogId !== "string" || !HASH_PATTERN.test(value.catalogId)) return fail("invalid-field", `${path}.catalogId`, undefined);
  if (!safeInteger(value.createdAt)) return fail("invalid-field", `${path}.createdAt`, undefined);
  if (!boundedString(value.projectionVersion, V3_LIMITS.maxProjectionVersionChars)) return fail("invalid-field", `${path}.projectionVersion`, undefined);
  return ok({
    schema: AILI_COMPACT_SCHEMA_V3,
    txId,
    sessionId,
    branchLeafId,
    epochId,
    catalogId: value.catalogId,
    createdAt: value.createdAt,
    projectionVersion: value.projectionVersion,
  });
}

function parseSemanticPayload(value: unknown): V3Result<V3SemanticCreatePayload> {
  const path = "$.payload";
  if (!isRecord(value)) return fail("invalid-field", path, undefined);
  const extra = unknownField(value, SEMANTIC_KEYS, path, undefined);
  if (extra) return extra;
  if (!boundedString(value.blockId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.blockId`, undefined);
  if (!includes(V3_TIERS, value.tier)) return fail("invalid-field", `${path}.tier`, undefined);
  if (!boundedString(value.topic, V3_LIMITS.maxTopicChars)) return fail("invalid-field", `${path}.topic`, undefined);
  if (!boundedString(value.runId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.runId`, undefined);
  if (!boundedString(value.anchorEntryId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.anchorEntryId`, undefined);
  if (!safeInteger(value.createdTurnOrdinal)) return fail("invalid-field", `${path}.createdTurnOrdinal`, undefined);
  if (!boundedString(value.summary, V3_LIMITS.maxSummaryChars)) return fail("invalid-field", `${path}.summary`, undefined);
  if (value.summaryDigest !== v3SummaryDigest(value.summary)) return fail("digest-mismatch", `${path}.summaryDigest`, undefined);
  if (typeof value.leafDigest !== "string" || !HASH_PATTERN.test(value.leafDigest)) return fail("invalid-field", `${path}.leafDigest`, undefined);
  if (!positiveSafeInteger(value.leafCount)) return fail("invalid-field", `${path}.leafCount`, undefined);
  const source = parseSemanticSource(value.source);
  if (!source.ok) return source;
  if ((value.tier === "T1") !== (source.value.kind === "messages")) return fail("invalid-tier-source", `${path}.source`, undefined);
  if (source.value.kind === "messages") {
    if (value.leafCount !== source.value.entryIds.length) return fail("leaf-count-mismatch", `${path}.leafCount`, undefined);
    if (value.leafDigest !== v3MessageLeafDigest(source.value.entryIds)) return fail("leaf-digest-mismatch", `${path}.leafDigest`, undefined);
    if (value.anchorEntryId !== source.value.firstEntryId) return fail("invalid-source", `${path}.anchorEntryId`, undefined);
  }
  const tokens = parseTokenMetadata(value.tokens, `${path}.tokens`, value.tier);
  if (!tokens.ok) return tokens;
  const quality = parseQualityMetadata(value.quality, `${path}.quality`);
  if (!quality.ok) return quality;
  return ok({
    blockId: value.blockId,
    tier: value.tier,
    topic: value.topic,
    runId: value.runId,
    anchorEntryId: value.anchorEntryId,
    createdTurnOrdinal: value.createdTurnOrdinal,
    summary: value.summary,
    summaryDigest: value.summaryDigest,
    source: source.value,
    leafDigest: value.leafDigest,
    leafCount: value.leafCount,
    tokens: tokens.value,
    quality: quality.value,
  });
}

function parseSemanticSource(value: unknown): V3Result<V3SemanticSource> {
  const path = "$.payload.source";
  if (!isRecord(value)) return fail("invalid-source", path, undefined);
  if (value.kind === "messages") {
    const extra = unknownField(value, MESSAGE_SOURCE_KEYS, path, "invalid-source");
    if (extra) return extra;
    const entryIds = parseStringArray(value.entryIds, 1, V3_LIMITS.maxMessageLeaves, `${path}.entryIds`, "invalid-source");
    if (!entryIds.ok) return entryIds;
    if (!boundedString(value.firstEntryId, V3_LIMITS.maxIdentifierChars) || value.firstEntryId !== entryIds.value[0]) return fail("invalid-source", `${path}.firstEntryId`, undefined);
    if (!boundedString(value.lastEntryId, V3_LIMITS.maxIdentifierChars) || value.lastEntryId !== entryIds.value.at(-1)) return fail("invalid-source", `${path}.lastEntryId`, undefined);
    return ok({ kind: "messages", entryIds: entryIds.value, firstEntryId: value.firstEntryId, lastEntryId: value.lastEntryId });
  }
  if (value.kind === "blocks") {
    const extra = unknownField(value, BLOCK_SOURCE_KEYS, path, "invalid-source");
    if (extra) return extra;
    const childBlockIds = parseStringArray(value.childBlockIds, V3_LIMITS.minChildBlocks, V3_LIMITS.maxChildBlocks, `${path}.childBlockIds`, "invalid-source");
    return childBlockIds.ok ? ok({ kind: "blocks", childBlockIds: childBlockIds.value }) : childBlockIds;
  }
  return fail("invalid-source", `${path}.kind`, undefined);
}

function parseTokenMetadata(value: unknown, path: string, tier: V3Tier): V3Result<V3TokenMetadata> {
  if (!isRecord(value)) return fail("token-metadata-invalid", path, undefined);
  const extra = unknownField(value, TOKEN_KEYS, path, "token-metadata-invalid");
  if (extra) return extra;
  const estimatorVersion = value.estimatorVersion;
  const providerId = value.providerId;
  const modelId = value.modelId;
  if (!boundedString(estimatorVersion, V3_LIMITS.maxIdentifierChars)) return fail("token-metadata-invalid", `${path}.estimatorVersion`, undefined);
  if (!boundedString(providerId, V3_LIMITS.maxIdentifierChars)) return fail("token-metadata-invalid", `${path}.providerId`, undefined);
  if (!boundedString(modelId, V3_LIMITS.maxIdentifierChars)) return fail("token-metadata-invalid", `${path}.modelId`, undefined);
  for (const field of ["sourceTokensLower", "sourceTokensUpper", "replacementTokensUpper", "steadySavingsTokensLower", "oneTimeCostTokensUpper", "breakEvenTurnsUpper", "summaryTokensUpper"] as const) {
    if (!safeInteger(value[field])) return fail("token-metadata-invalid", `${path}.${field}`, undefined);
  }
  const sourceTokensLower = value.sourceTokensLower as number;
  const sourceTokensUpper = value.sourceTokensUpper as number;
  const replacementTokensUpper = value.replacementTokensUpper as number;
  const steadySavingsTokensLower = value.steadySavingsTokensLower as number;
  const oneTimeCostTokensUpper = value.oneTimeCostTokensUpper as number;
  const breakEvenTurnsUpper = value.breakEvenTurnsUpper as number;
  const summaryTokensUpper = value.summaryTokensUpper as number;
  if (typeof value.savingsRatio !== "number" || !Number.isFinite(value.savingsRatio) || value.savingsRatio < 0 || value.savingsRatio > 1) {
    return fail("token-metadata-invalid", `${path}.savingsRatio`, undefined);
  }
  if (sourceTokensLower > sourceTokensUpper) return fail("token-metadata-invalid", `${path}.sourceTokensLower`, undefined);
  const savings = Math.max(0, sourceTokensLower - replacementTokensUpper);
  if (steadySavingsTokensLower !== savings || savings === 0) return fail("token-metadata-invalid", `${path}.steadySavingsTokensLower`, undefined);
  if (breakEvenTurnsUpper !== Math.ceil(oneTimeCostTokensUpper / savings)) return fail("token-metadata-invalid", `${path}.breakEvenTurnsUpper`, undefined);
  const minimum = tier === "T1" ? 256 : tier === "T2" ? 512 : 768;
  const expectedRatio = savings / Math.max(1, sourceTokensUpper);
  if (Math.abs(value.savingsRatio - expectedRatio) > Number.EPSILON * 8) return fail("token-metadata-invalid", `${path}.savingsRatio`, undefined);
  if (savings < minimum || value.savingsRatio < 0.20) return fail("token-metadata-invalid", path, undefined);
  return ok({
    estimatorVersion,
    providerId,
    modelId,
    sourceTokensLower,
    sourceTokensUpper,
    replacementTokensUpper,
    steadySavingsTokensLower,
    oneTimeCostTokensUpper,
    breakEvenTurnsUpper,
    savingsRatio: value.savingsRatio,
    summaryTokensUpper,
  });
}

function parseQualityMetadata(value: unknown, path: string): V3Result<V3QualityMetadata> {
  if (!isRecord(value) || !includes(QUALITY_STATUSES, value.status)) return fail("quality-metadata-invalid", path, undefined);
  if (value.status === "unevaluated") {
    const extra = unknownField(value, UNEVALUATED_QUALITY_KEYS, path, "quality-metadata-invalid");
    if (extra) return extra;
    return value.override === "quality-disabled"
      ? ok({ status: value.status, override: value.override })
      : fail("quality-metadata-invalid", `${path}.override`, undefined);
  }
  const extra = unknownField(value, ACCEPTED_QUALITY_KEYS, path, "quality-metadata-invalid");
  if (extra) return extra;
  if (!boundedString(value.evaluatorVersion, V3_LIMITS.maxIdentifierChars)) return fail("quality-metadata-invalid", `${path}.evaluatorVersion`, undefined);
  if (typeof value.sourceFactDigest !== "string" || !HASH_PATTERN.test(value.sourceFactDigest)) return fail("quality-metadata-invalid", `${path}.sourceFactDigest`, undefined);
  if (!safeInteger(value.hardFactCount) || !safeInteger(value.coveredHardFactCount) || value.coveredHardFactCount !== value.hardFactCount) {
    return fail("quality-metadata-invalid", `${path}.coveredHardFactCount`, undefined);
  }
  const warningCodes = parseStringArray(value.warningCodes, 0, V3_LIMITS.maxWarningCodes, `${path}.warningCodes`, "quality-metadata-invalid", 128);
  if (!warningCodes.ok) return warningCodes;
  if ((value.status === "accepted") !== (warningCodes.value.length === 0)) return fail("quality-metadata-invalid", `${path}.status`, undefined);
  return ok({
    status: value.status,
    evaluatorVersion: value.evaluatorVersion,
    sourceFactDigest: value.sourceFactDigest,
    hardFactCount: value.hardFactCount,
    coveredHardFactCount: value.coveredHardFactCount,
    warningCodes: warningCodes.value,
  });
}

function parseDecompressPayload(value: unknown): V3Result<V3DecompressPayload> {
  const path = "$.payload";
  if (!isRecord(value)) return fail("invalid-field", path, undefined);
  const extra = unknownField(value, DECOMPRESS_KEYS, path, undefined);
  if (extra) return extra;
  const roots = parseStringArray(value.rootBlockIds, 1, V3_LIMITS.maxRootBlocks, `${path}.rootBlockIds`, "invalid-field");
  if (!roots.ok) return roots;
  if (value.depth !== "one" && value.depth !== "raw") return fail("invalid-field", `${path}.depth`, undefined);
  if (value.reason !== "decompress") return fail("invalid-field", `${path}.reason`, undefined);
  const provenance = parseProvenance(value.provenance, ["explicit-user"], `${path}.provenance`);
  return provenance.ok ? ok({ rootBlockIds: roots.value, depth: value.depth, provenance: provenance.value as V3DecompressPayload["provenance"], reason: value.reason }) : provenance;
}

function parseRecompressPayload(value: unknown): V3Result<V3RecompressPayload> {
  const path = "$.payload";
  if (!isRecord(value)) return fail("invalid-field", path, undefined);
  const extra = unknownField(value, RECOMPRESS_KEYS, path, undefined);
  if (extra) return extra;
  const roots = parseStringArray(value.rootBlockIds, 1, V3_LIMITS.maxRootBlocks, `${path}.rootBlockIds`, "invalid-field");
  if (!roots.ok) return roots;
  if (!boundedString(value.decompressionTxId, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.decompressionTxId`, undefined);
  if (value.reason !== "recompress") return fail("invalid-field", `${path}.reason`, undefined);
  const provenance = parseProvenance(value.provenance, ["explicit-user"], `${path}.provenance`);
  return provenance.ok ? ok({ rootBlockIds: roots.value, decompressionTxId: value.decompressionTxId, provenance: provenance.value as V3RecompressPayload["provenance"], reason: value.reason }) : provenance;
}

function parseCoolingPayload(value: unknown): V3Result<V3CoolingPayload> {
  const path = "$.payload";
  if (!isRecord(value)) return fail("invalid-field", path, undefined);
  const extra = unknownField(value, COOLING_KEYS, path, undefined);
  if (extra) return extra;
  const targets = parseStringArray(value.targetEntryIds, 1, V3_LIMITS.maxCoolingTargets, `${path}.targetEntryIds`, "invalid-field");
  if (!targets.ok) return targets;
  if (!includes(COOLING_PROFILES, value.profile)) return fail("invalid-field", `${path}.profile`, undefined);
  if (!boundedString(value.profileVersion, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.profileVersion`, undefined);
  if (value.reason !== "cool" && value.reason !== "dedupe" && value.reason !== "purge-error") return fail("invalid-field", `${path}.reason`, undefined);
  const provenance = parseProvenance(value.provenance, ["provider-observation"], `${path}.provenance`);
  return provenance.ok ? ok({ targetEntryIds: targets.value, profile: value.profile, profileVersion: value.profileVersion, provenance: provenance.value as V3CoolingPayload["provenance"], reason: value.reason }) : provenance;
}

function parseControlPayload(value: unknown): V3Result<V3ControlPayload> {
  const path = "$.payload";
  if (!isRecord(value)) return fail("invalid-field", path, undefined);
  const extra = unknownField(value, CONTROL_KEYS, path, undefined);
  if (extra) return extra;
  if (!includes(CONTROL_ACTIONS, value.action)) return fail("invalid-field", `${path}.action`, undefined);
  if (value.reason !== value.action) return fail("invalid-field", `${path}.reason`, undefined);
  const targets = parseStringArray(value.targetBlockIds, 0, V3_LIMITS.maxRootBlocks, `${path}.targetBlockIds`, "invalid-field");
  if (!targets.ok) return targets;
  const provenance = parseProvenance(value.provenance, ["explicit-user", "automatic"], `${path}.provenance`);
  if (!provenance.ok) return provenance;
  if (value.action === "restore-all" && provenance.value.kind !== "explicit-user") return fail("provenance-mismatch", `${path}.provenance.kind`, undefined);
  if (targets.value.length !== 0) return fail("invalid-field", `${path}.targetBlockIds`, undefined);
  return ok({ action: value.action, targetBlockIds: targets.value, provenance: provenance.value as V3ControlPayload["provenance"], reason: value.action });
}

function parseProvenance(value: unknown, allowedKinds: readonly V3ProvenanceKind[], path: string): V3Result<V3OperationProvenance> {
  if (!isRecord(value)) return fail("invalid-field", path, undefined);
  if (!includes(allowedKinds, value.kind)) return fail("provenance-mismatch", `${path}.kind`, undefined);
  if (value.kind === "provider-observation") {
    const extra = unknownField(value, OBSERVATION_PROVENANCE_KEYS, path, undefined);
    if (extra) return extra;
    for (const field of ["sessionId", "branchLeafId", "epochId", "callEntryId", "callId", "normalizedExactToolName", "resultEntryId", "settledRequestId"] as const) {
      if (!boundedString(value[field], V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.${field}`, undefined);
    }
    if (typeof value.resultBodyDigest !== "string" || !HASH_PATTERN.test(value.resultBodyDigest)) return fail("invalid-field", `${path}.resultBodyDigest`, undefined);
    if (typeof value.providerInputIdentity !== "string" || !HASH_PATTERN.test(value.providerInputIdentity)) return fail("invalid-field", `${path}.providerInputIdentity`, undefined);
    return ok({
      kind: value.kind,
      sessionId: value.sessionId as string,
      branchLeafId: value.branchLeafId as string,
      epochId: value.epochId as string,
      callEntryId: value.callEntryId as string,
      callId: value.callId as string,
      normalizedExactToolName: value.normalizedExactToolName as string,
      resultEntryId: value.resultEntryId as string,
      resultBodyDigest: value.resultBodyDigest,
      providerInputIdentity: value.providerInputIdentity,
      settledRequestId: value.settledRequestId as string,
    });
  }
  const extra = unknownField(value, BASIC_PROVENANCE_KEYS, path, undefined);
  if (extra) return extra;
  if (!boundedString(value.id, V3_LIMITS.maxIdentifierChars)) return fail("invalid-field", `${path}.id`, undefined);
  return ok({ kind: value.kind, id: value.id });
}

function validateTransactionIdentity(
  state: V3LifecycleState,
  transaction: V3Transaction,
  expectedCatalogId: string | undefined,
): V3Failure | undefined {
  if (transaction.header.sessionId !== state.sessionId) return fail("session-mismatch", "$.header.sessionId", undefined);
  if (transaction.header.branchLeafId !== state.branchLeafId) return fail("branch-mismatch", "$.header.branchLeafId", undefined);
  if (transaction.header.epochId !== state.epochId) return fail("epoch-mismatch", "$.header.epochId", undefined);
  if (transaction.header.catalogId !== (expectedCatalogId ?? state.catalogId)) return fail("stale-catalog", "$.header.catalogId", undefined);
  if (transaction.header.projectionVersion !== state.projectionVersion) return fail("projection-version-mismatch", "$.header.projectionVersion", undefined);
  if (state.transactions.has(transaction.header.txId)) return fail("duplicate-transaction", "$.header.txId", undefined);
  if (transaction.tag === "cooling") {
    const provenance = transaction.payload.provenance;
    if (provenance.sessionId !== transaction.header.sessionId) return fail("session-mismatch", "$.payload.provenance.sessionId", undefined);
    if (provenance.branchLeafId !== transaction.header.branchLeafId) return fail("branch-mismatch", "$.payload.provenance.branchLeafId", undefined);
    if (provenance.epochId !== transaction.header.epochId) return fail("epoch-mismatch", "$.payload.provenance.epochId", undefined);
  }
  return undefined;
}

function applySemanticCreate(
  state: V3LifecycleState,
  transaction: Extract<V3Transaction, { tag: "semantic-create" }>,
  context: V3TransitionContext,
): V3TransitionResult {
  const payload = transaction.payload;
  if (state.blocks.has(payload.blockId)) return fail("duplicate-block", "$.payload.blockId", undefined);
  let firstLeafOrdinal: number;
  let lastLeafOrdinal: number;
  const blocks = new Map(state.blocks);

  if (payload.source.kind === "messages") {
    const ordinals = payload.source.entryIds.map((id) => context.messageOrdinals?.get(id));
    if (ordinals.some((ordinal) => ordinal === undefined)) return fail("message-ordinal-missing", "$.payload.source.entryIds", undefined);
    const exact = ordinals as number[];
    if (exact.some((ordinal, index) => index > 0 && ordinal !== exact[index - 1]! + 1)) {
      return fail("non-contiguous-source", "$.payload.source.entryIds", undefined);
    }
    firstLeafOrdinal = exact[0]!;
    lastLeafOrdinal = exact.at(-1)!;
  } else {
    const children: V3SemanticBlock[] = [];
    for (const childId of payload.source.childBlockIds) {
      if (context.legacyBlockIds?.has(childId)) return fail("legacy-child", `$.payload.source.childBlockIds.${childId}`, undefined);
      const child = state.blocks.get(childId);
      if (!child) return fail("missing-child", `$.payload.source.childBlockIds.${childId}`, undefined);
      if (!child.active) return fail("inactive-child", `$.payload.source.childBlockIds.${childId}`, undefined);
      if (child.queryOnly || child.epochId !== state.epochId) return fail("query-only-child", `$.payload.source.childBlockIds.${childId}`, undefined);
      children.push(child);
    }
    if (new Set(children.map((child) => child.tier)).size !== 1) return fail("mixed-tier", "$.payload.source.childBlockIds", undefined);
    if (children.some((child) => child.quality.status === "unevaluated")) {
      return fail("quality-metadata-invalid", "$.payload.source.childBlockIds", undefined);
    }
    const childTier = children[0]!.tier;
    const validTier = (payload.tier === "T2" && childTier === "T1")
      || (payload.tier === "T3" && (childTier === "T2" || childTier === "T3"));
    if (!validTier) return fail("invalid-tier-transition", "$.payload.tier", undefined);
    const canonical = [...children].sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal || left.blockId.localeCompare(right.blockId));
    if (canonical.some((child, index) => child.blockId !== children[index]!.blockId)) {
      return fail("non-canonical-child-order", "$.payload.source.childBlockIds", undefined);
    }
    for (let index = 1; index < children.length; index += 1) {
      if (children[index]!.firstLeafOrdinal !== children[index - 1]!.lastLeafOrdinal + 1) {
        return fail("non-contiguous-children", "$.payload.source.childBlockIds", undefined);
      }
    }
    for (const child of children) {
      if (activeParentIds(state.blocks, child.blockId).length > 0) return fail("active-parent", `$.payload.source.childBlockIds.${child.blockId}`, undefined);
    }
    const leafCount = children.reduce((total, child) => total + child.leafCount, 0);
    if (payload.leafCount !== leafCount) return fail("leaf-count-mismatch", "$.payload.leafCount", undefined);
    if (payload.leafDigest !== v3ParentLeafDigest(payload.tier, leafCount, children.map((child) => child.leafDigest))) {
      return fail("leaf-digest-mismatch", "$.payload.leafDigest", undefined);
    }
    if (payload.anchorEntryId !== children[0]!.anchorEntryId) return fail("invalid-source", "$.payload.anchorEntryId", undefined);
    if (payload.tier === "T3" && childTier === "T3") {
      const restill = V3_LIMITS.restill;
      if (children.length < restill.minChildren
        || children.some((child) => payload.createdTurnOrdinal - child.createdTurnOrdinal < restill.minTurnsSinceCreate)
        || payload.tokens.sourceTokensLower < restill.minSourceTokens
        || payload.tokens.steadySavingsTokensLower < restill.minSavingsTokens
        || payload.tokens.savingsRatio < restill.minSavingsRatio
        || payload.tokens.summaryTokensUpper > restill.maxSummaryTokens) {
        return fail("restill-ineligible", "$.payload", undefined);
      }
    }
    firstLeafOrdinal = children[0]!.firstLeafOrdinal;
    lastLeafOrdinal = children.at(-1)!.lastLeafOrdinal;
    for (const child of children) blocks.set(child.blockId, { ...child, active: false, deactivationReason: "nested", explicitDecompression: undefined });
  }

  for (const candidate of state.blocks.values()) {
    if (!candidate.active || candidate.epochId !== state.epochId) continue;
    if (payload.source.kind === "blocks" && payload.source.childBlockIds.includes(candidate.blockId)) continue;
    if (intervalsOverlap(firstLeafOrdinal, lastLeafOrdinal, candidate.firstLeafOrdinal, candidate.lastLeafOrdinal)) {
      return fail("overlap", `$.blocks.${candidate.blockId}`, undefined);
    }
  }

  blocks.set(payload.blockId, {
    blockId: payload.blockId,
    transactionId: transaction.header.txId,
    sessionId: transaction.header.sessionId,
    branchLeafId: transaction.header.branchLeafId,
    epochId: transaction.header.epochId,
    catalogIdAtCreate: transaction.header.catalogId,
    projectionVersion: transaction.header.projectionVersion,
    createdAt: transaction.header.createdAt,
    createdTurnOrdinal: payload.createdTurnOrdinal,
    tier: payload.tier,
    topic: payload.topic,
    runId: payload.runId,
    anchorEntryId: payload.anchorEntryId,
    summary: payload.summary,
    summaryDigest: payload.summaryDigest,
    source: cloneSource(payload.source),
    leafDigest: payload.leafDigest,
    leafCount: payload.leafCount,
    firstLeafOrdinal,
    lastLeafOrdinal,
    tokens: { ...payload.tokens },
    quality: cloneQuality(payload.quality),
    active: true,
    queryOnly: false,
  });
  return commit(state, transaction, blocks, undefined, undefined);
}

function applyDecompress(
  state: V3LifecycleState,
  transaction: Extract<V3Transaction, { tag: "decompress" }>,
): V3TransitionResult {
  const roots = resolveCanonicalRoots(state.blocks, transaction.payload.rootBlockIds, true);
  if (!roots.ok) return roots;
  const overlap = overlappingRoot(state.blocks, roots.value);
  if (overlap) return overlap;
  const blocks = new Map(state.blocks);
  const closures = new Map<string, readonly string[]>();
  const rawClosure = new Set<string>();

  for (const root of roots.value) {
    if (transaction.payload.depth === "one" && root.source.kind !== "blocks") {
      return fail("invalid-root", `$.blocks.${root.blockId}`, undefined);
    }
    const closure = descendantClosure(
      state.blocks,
      root.blockId,
      transaction.payload.depth === "raw" ? V3_LIMITS.maxRawClosureBlocks : Number.MAX_SAFE_INTEGER,
    );
    if (!closure.ok) return closure;
    closures.set(root.blockId, closure.value);
    if (transaction.payload.depth === "raw") {
      for (const blockId of closure.value) rawClosure.add(blockId);
      if (rawClosure.size > V3_LIMITS.maxRawClosureBlocks) {
        return fail("closure-too-large", "$.payload.rootBlockIds", undefined);
      }
    }
  }

  for (const root of roots.value) {
    const closure = closures.get(root.blockId)!;
    const record: V3ExplicitDecompression = {
      transactionId: transaction.header.txId,
      depth: transaction.payload.depth,
      closureDigest: closureDigest(state.blocks, closure),
      leafDigest: root.leafDigest,
      tier: root.tier,
      qualityDigest: digest(root.quality),
      projectionVersion: root.projectionVersion,
    };
    if (transaction.payload.depth === "one") {
      for (const childId of root.source.kind === "blocks" ? root.source.childBlockIds : []) {
        const child = blocks.get(childId);
        if (!child || child.active || child.queryOnly || child.deactivationReason !== "nested") {
          return fail("invalid-active-state", `$.blocks.${childId}`, undefined);
        }
        const { deactivationReason: _reason, explicitDecompression: _explicit, ...rest } = child;
        blocks.set(childId, { ...rest, active: true });
      }
    } else {
      for (const blockId of closure) {
        const member = blocks.get(blockId)!;
        blocks.set(blockId, { ...member, active: false, deactivationReason: "decompress", explicitDecompression: undefined });
      }
    }
    blocks.set(root.blockId, { ...blocks.get(root.blockId)!, active: false, deactivationReason: "decompress", explicitDecompression: record });
  }
  return commit(state, transaction, blocks, undefined, undefined);
}

function applyRecompress(
  state: V3LifecycleState,
  transaction: Extract<V3Transaction, { tag: "recompress" }>,
): V3TransitionResult {
  const roots = resolveCanonicalRoots(state.blocks, transaction.payload.rootBlockIds, false);
  if (!roots.ok) return roots;
  const overlap = overlappingRoot(state.blocks, roots.value);
  if (overlap) return overlap;
  const blocks = new Map(state.blocks);

  for (const root of roots.value) {
    const explicit = root.explicitDecompression;
    if (!explicit || root.active || root.deactivationReason !== "decompress" || explicit.transactionId !== transaction.payload.decompressionTxId) {
      return fail("provenance-mismatch", `$.blocks.${root.blockId}.explicitDecompression`, undefined);
    }
    if (root.quality.status === "unevaluated") return fail("quality-metadata-invalid", `$.blocks.${root.blockId}.quality`, undefined);
    const closure = descendantClosure(
      state.blocks,
      root.blockId,
      explicit.depth === "raw" ? V3_LIMITS.maxRawClosureBlocks : Number.MAX_SAFE_INTEGER,
    );
    if (!closure.ok) return closure;
    if (closureDigest(state.blocks, closure.value) !== explicit.closureDigest
      || root.leafDigest !== explicit.leafDigest
      || root.tier !== explicit.tier
      || digest(root.quality) !== explicit.qualityDigest
      || root.projectionVersion !== explicit.projectionVersion) {
      return fail("source-drift", `$.blocks.${root.blockId}`, undefined);
    }
    for (const candidate of state.blocks.values()) {
      if (!candidate.active || closure.value.includes(candidate.blockId)) continue;
      if (intervalsOverlap(root.firstLeafOrdinal, root.lastLeafOrdinal, candidate.firstLeafOrdinal, candidate.lastLeafOrdinal)) {
        return fail("active-parent", `$.blocks.${candidate.blockId}`, undefined);
      }
    }
    for (const blockId of closure.value.slice(1)) {
      const member = blocks.get(blockId)!;
      blocks.set(blockId, { ...member, active: false, deactivationReason: "nested", explicitDecompression: undefined });
    }
    const { deactivationReason: _reason, explicitDecompression: _explicit, ...rest } = blocks.get(root.blockId)!;
    blocks.set(root.blockId, { ...rest, active: true });
  }
  return commit(state, transaction, blocks, undefined, undefined);
}

function applyControl(
  state: V3LifecycleState,
  transaction: Extract<V3Transaction, { tag: "control" }>,
): V3TransitionResult {
  const blocks = new Map(state.blocks);
  if (transaction.payload.action === "restore-all") {
    for (const [id, block] of blocks) {
      if (block.active && block.epochId === state.epochId) {
        blocks.set(id, { ...block, active: false, deactivationReason: "restore-all", explicitDecompression: undefined });
      }
    }
  }
  return commit(state, transaction, blocks, undefined, transaction.payload);
}

function commit(
  state: V3LifecycleState,
  transaction: V3Transaction,
  blocks: ReadonlyMap<string, V3SemanticBlock>,
  cooling: V3CoolingPayload | undefined,
  control: V3ControlPayload | undefined,
): V3TransitionResult {
  const transactions = new Map(state.transactions);
  transactions.set(transaction.header.txId, transaction);
  const withoutCatalog = {
    ...state,
    blocks,
    transactions,
    cooling: cooling ? [...state.cooling, cooling].slice(-V3_LIMITS.maxRetainedOperations) : state.cooling,
    controls: control ? [...state.controls, control].slice(-V3_LIMITS.maxRetainedOperations) : state.controls,
  };
  const next = { ...withoutCatalog, catalogId: deriveV3CatalogId(withoutCatalog) };
  const validation = validateV3LifecycleState(next);
  return validation.ok ? ok({ state: next, transaction }) : validation;
}

function validateBlockStructure(
  block: V3SemanticBlock,
  blocks: ReadonlyMap<string, V3SemanticBlock>,
  path: string,
): V3Failure | undefined {
  if (block.source.kind === "messages") {
    if (block.tier !== "T1") return fail("invalid-tier-source", `${path}.source`, undefined);
    if (block.leafCount !== block.source.entryIds.length) return fail("leaf-count-mismatch", `${path}.leafCount`, undefined);
    if (block.leafDigest !== v3MessageLeafDigest(block.source.entryIds)) return fail("leaf-digest-mismatch", `${path}.leafDigest`, undefined);
    if (block.anchorEntryId !== block.source.firstEntryId
      || block.source.firstEntryId !== block.source.entryIds[0]
      || block.source.lastEntryId !== block.source.entryIds.at(-1)) return fail("invalid-source", `${path}.source`, undefined);
    if (block.lastLeafOrdinal - block.firstLeafOrdinal + 1 !== block.leafCount) return fail("non-contiguous-source", path, undefined);
    return undefined;
  }
  if (block.tier === "T1") return fail("invalid-tier-source", `${path}.source`, undefined);
  const children = block.source.childBlockIds.map((id) => blocks.get(id));
  const missingIndex = children.findIndex((child) => child === undefined);
  if (missingIndex >= 0) return fail("missing-child", `${path}.source.childBlockIds.${block.source.childBlockIds[missingIndex]}`, undefined);
  const exact = children as V3SemanticBlock[];
  if (new Set(exact.map((child) => child.tier)).size !== 1) return fail("mixed-tier", `${path}.source.childBlockIds`, undefined);
  const childTier = exact[0]!.tier;
  if (!((block.tier === "T2" && childTier === "T1") || (block.tier === "T3" && (childTier === "T2" || childTier === "T3")))) {
    return fail("invalid-tier-transition", `${path}.tier`, undefined);
  }
  for (let index = 1; index < exact.length; index += 1) {
    if (exact[index]!.firstLeafOrdinal !== exact[index - 1]!.lastLeafOrdinal + 1) return fail("non-contiguous-children", `${path}.source.childBlockIds`, undefined);
  }
  const count = exact.reduce((total, child) => total + child.leafCount, 0);
  if (count !== block.leafCount) return fail("leaf-count-mismatch", `${path}.leafCount`, undefined);
  if (block.leafDigest !== v3ParentLeafDigest(block.tier, count, exact.map((child) => child.leafDigest))) return fail("leaf-digest-mismatch", `${path}.leafDigest`, undefined);
  if (block.firstLeafOrdinal !== exact[0]!.firstLeafOrdinal || block.lastLeafOrdinal !== exact.at(-1)!.lastLeafOrdinal) {
    return fail("non-contiguous-children", path, undefined);
  }
  return undefined;
}

function detectCycle(blocks: ReadonlyMap<string, V3SemanticBlock>): V3Failure | undefined {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): V3Failure | undefined => {
    if (visiting.has(id)) return fail("cycle", `$.blocks.${id}`, undefined);
    if (visited.has(id)) return undefined;
    visiting.add(id);
    const block = blocks.get(id);
    if (block?.source.kind === "blocks") {
      for (const childId of block.source.childBlockIds) {
        const error = visit(childId);
        if (error) return error;
      }
    }
    visiting.delete(id);
    visited.add(id);
    return undefined;
  };
  for (const id of [...blocks.keys()].sort()) {
    const error = visit(id);
    if (error) return error;
  }
  return undefined;
}

function resolveCanonicalRoots(
  blocks: ReadonlyMap<string, V3SemanticBlock>,
  ids: readonly string[],
  requireActive: boolean,
): V3Result<V3SemanticBlock[]> {
  const roots: V3SemanticBlock[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return fail("invalid-root", "$.payload.rootBlockIds", undefined);
    seen.add(id);
    const block = blocks.get(id);
    if (!block || block.queryOnly || (requireActive ? !block.active : block.active)) return fail("invalid-root", `$.blocks.${id}`, undefined);
    roots.push(block);
  }
  const canonical = [...roots].sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal || left.blockId.localeCompare(right.blockId));
  return canonical.some((root, index) => root.blockId !== roots[index]!.blockId)
    ? fail("invalid-root", "$.payload.rootBlockIds", undefined)
    : ok(roots);
}

function overlappingRoot(blocks: ReadonlyMap<string, V3SemanticBlock>, roots: readonly V3SemanticBlock[]): V3Failure | undefined {
  const rootIds = new Set(roots.map((root) => root.blockId));
  for (const root of roots) {
    const closure = descendantClosure(blocks, root.blockId, Number.MAX_SAFE_INTEGER);
    if (!closure.ok) return closure;
    const nestedRoot = closure.value.slice(1).find((id) => rootIds.has(id));
    if (nestedRoot) return fail("overlapping-roots", `$.blocks.${nestedRoot}`, undefined);
  }
  return undefined;
}

function descendantClosure(
  blocks: ReadonlyMap<string, V3SemanticBlock>,
  rootId: string,
  limit: number = V3_LIMITS.maxRawClosureBlocks,
): V3Result<string[]> {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string): V3Failure | undefined => {
    if (seen.has(id)) return undefined;
    const block = blocks.get(id);
    if (!block) return fail("missing-child", `$.blocks.${id}`, undefined);
    seen.add(id);
    ordered.push(id);
    if (ordered.length > limit) return fail("closure-too-large", `$.blocks.${rootId}`, undefined);
    if (block.source.kind === "blocks") {
      for (const childId of block.source.childBlockIds) {
        const error = visit(childId);
        if (error) return error;
      }
    }
    return undefined;
  };
  const error = visit(rootId);
  return error ?? ok(ordered);
}

function closureDigest(blocks: ReadonlyMap<string, V3SemanticBlock>, ids: readonly string[]): string {
  return digest(ids.map((id) => {
    const block = blocks.get(id)!;
    return { blockId: block.blockId, tier: block.tier, leafCount: block.leafCount, leafDigest: block.leafDigest };
  }));
}

function activeParentIds(blocks: ReadonlyMap<string, V3SemanticBlock>, childId: string): string[] {
  return [...blocks.values()]
    .filter((block) => block.active && block.source.kind === "blocks" && block.source.childBlockIds.includes(childId))
    .map((block) => block.blockId)
    .sort();
}

function cloneSource(source: V3SemanticSource): V3SemanticSource {
  return source.kind === "messages"
    ? { ...source, entryIds: [...source.entryIds] }
    : { ...source, childBlockIds: [...source.childBlockIds] };
}

function cloneQuality(quality: V3QualityMetadata): V3QualityMetadata {
  return quality.status === "unevaluated" ? { ...quality } : { ...quality, warningCodes: [...quality.warningCodes] };
}

function parseStringArray(
  value: unknown,
  min: number,
  max: number,
  path: string,
  code: V3ErrorCode,
  maxChars: number = V3_LIMITS.maxIdentifierChars,
): V3Result<string[]> {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => !boundedString(item, maxChars))) {
    return fail(code, path, undefined);
  }
  if (new Set(value).size !== value.length) return fail(code, path, undefined);
  return ok([...value] as string[]);
}

function unknownField(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  code: V3ErrorCode | undefined,
): V3Failure | undefined {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key)).sort()[0];
  return unknown === undefined ? undefined : fail(code ?? "unknown-field", `${path}.${unknown}`, undefined);
}

function intervalsOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function boundedString(value: unknown, maxChars: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxChars;
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return safeInteger(value) && value > 0;
}

function includes<const T extends readonly unknown[]>(values: T, value: unknown): value is T[number] {
  return values.includes(value);
}

function ok<T>(value: T): V3Result<T> {
  return { ok: true, value };
}

function fail(code: V3ErrorCode, path: string, _detail: undefined): V3Failure {
  return { ok: false, code, path };
}
