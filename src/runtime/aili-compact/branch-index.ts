import { Buffer } from "node:buffer";

import {
  AILI_COMPACT_ENTRY,
  canonicalJson,
  digest,
  digestCanonicalJson,
  isRecord,
  isV3CompactTransactionCandidate,
  type CompactBlock,
  type CompactLifecycleUpdate,
  type CompactTransaction,
  type SessionLikeEntry,
} from "./contracts.js";
import {
  buildProtocolAtoms,
  PROTOCOL_ATOM_PROTECTION_REASONS,
  PROTOCOL_ATOM_VERSION,
  type ProtocolAtom,
  type ProtocolAtomBuildResult,
} from "./protocol-atoms.js";
import { parseRepairEntry, type RepairEntry } from "./repair.js";
import {
  deriveRuntimeCatalogId,
  orderRuntimeCatalogBlocksBySemanticSource,
  type RuntimeCatalogBlockIdentity,
  type RuntimeCatalogBlockOrderMetadata,
  type RuntimeCatalogMessageIdentity,
} from "./runtime-catalog.js";
import {
  reduceCompactReadBundle,
  reduceCompactState,
  reduceCompactStateFromEpoch,
  reduceV3LifecycleState,
  reduceV3LifecycleStateFromSeed,
  transactionFromEntry,
  type CompactReadBundle,
  type V3LifecycleReplay,
  type V3ReplayDiagnostic,
} from "./reducer.js";
import {
  applyV3Transaction,
  createEmptyV3State,
  maximalActiveV3Blocks,
  parseV3Transaction,
  validateV3LifecycleState,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3SemanticBlock,
  type V3Tier,
  type V3Transaction,
} from "./v3.js";
import {
  MAX_TRANSPARENT_PROMOTION_GAP_MESSAGES,
  MAX_TRANSPARENT_PROMOTION_GAPS,
  PromotionGapIndexV1,
  createRawEpochSlot,
  createTrustedRawEpochProjectionFromPrefixAccessor,
  nextRawEpochPrefixDigest,
  rawEpochPrefixSeed,
  type RawEpochSlotV1,
} from "./promotion-gaps.js";

export const BRANCH_INDEX_VERSION = "aili.branch-index.v1" as const;
export const DEFAULT_BRANCH_SNAPSHOT_LRU = 4;
export const MAX_REFERENCE_PAGE_SIZE = 64;

export interface BranchIndexKey {
  sessionId: string;
  canonicalSessionPathDigest: string;
  branchLeafId: string;
  epochId: string;
  replayVersion: string;
}

const SOURCE_ENTRY_ID_DIGEST_SEED = digest({ version: "aili.branch-source-entry-id.v1" });

/**
 * Incremental branch identity for recovery scopes. AILI-owned custom records
 * deliberately do not advance it, matching the source-only recovery boundary.
 */
export function branchSourceEntryIdDigest(
  entries: readonly Pick<BranchSessionEntry, "id" | "type">[],
  prior = SOURCE_ENTRY_ID_DIGEST_SEED,
): string {
  let current = prior;
  for (const entry of entries) {
    if (entry.type === "custom") continue;
    current = digest({ previous: current, entryId: entry.id });
  }
  return current;
}

export interface BranchSessionEntry extends SessionLikeEntry {
  parentId?: string | null;
}

export interface BranchIndexCounters {
  entryVisits: number;
  preTipEntryVisits: number;
  rawSlotVisits: number;
  proofRawSlotVisits: number;
  sourceFreshnessRawSlotVisits: number;
  rawEpochSlotStorageCopyVisits: number;
  rawEpochPrefixStorageCopyVisits: number;
  rawEpochSlotStorageIterationVisits: number;
  rawEpochPrefixStorageIterationVisits: number;
  atomMembershipVisits: number;
  blockVisits: number;
  hashOps: number;
  hashLookups: number;
  fullScans: number;
  fullRebuilds: number;
  fullReducerRuns: number;
  pureAuditRuns: number;
  seedValidationRuns: number;
  seedValidationEntryVisits: number;
  seedReplayRuns: number;
  gapIndexBuilds: number;
  gapIndexBuildRawSlotVisits: number;
  fullV3RuntimeViewBuilds: number;
  indexedV3RuntimeViewBuilds: number;
  transactionReplayRuns: number;
  hashRecatalogs: number;
  protocolRebuilds: number;
  protectionRebuilds: number;
  catalogRebuilds: number;
  providerMessagePasses: number;
  providerMessageVisits: number;
  /** Descriptor metadata reused from an exact indexed raw-message match. */
  providerMessageCacheHits: number;
  /** First-time metadata capture for an exact indexed raw-message match. */
  providerMessageCacheMisses: number;
  /** Provider-frontier descriptors derived from the current active ledger. */
  providerFrontierDescriptorDerivations: number;
  /** Explicit recap/decompression summaries retained for one provider request. */
  providerFrontierSelectedExpansions: number;
  /** Immutable raw messages intentionally omitted from a provider frontier. */
  providerFrontierOmittedRawMessages: number;
  /** Immutable raw UTF-8 bytes intentionally omitted from a provider frontier. */
  providerFrontierOmittedRawBytes: number;
  /** Frontier cache/binding invalidations; no raw-history restoration follows. */
  providerFrontierInvalidations: number;
  /** Bounded frontier fallbacks; never a full-history provider fallback. */
  providerFrontierFallbacks: number;
  incrementalAppends: number;
  ancestryDigestChecks: number;
  fallbacks: number;
  failOpenReturns: number;
  derivedInvalidations: number;
  snapshotSwitches: number;
  snapshotEvictions: number;
  epochArchives: number;
  sessionDiscards: number;
}

export const BRANCH_INDEX_COUNTER_KEYS = [
  "entryVisits",
  "preTipEntryVisits",
  "rawSlotVisits",
  "proofRawSlotVisits",
  "sourceFreshnessRawSlotVisits",
  "rawEpochSlotStorageCopyVisits",
  "rawEpochPrefixStorageCopyVisits",
  "rawEpochSlotStorageIterationVisits",
  "rawEpochPrefixStorageIterationVisits",
  "atomMembershipVisits",
  "blockVisits",
  "hashOps",
  "hashLookups",
  "fullScans",
  "fullRebuilds",
  "fullReducerRuns",
  "pureAuditRuns",
  "seedValidationRuns",
  "seedValidationEntryVisits",
  "seedReplayRuns",
  "gapIndexBuilds",
  "gapIndexBuildRawSlotVisits",
  "fullV3RuntimeViewBuilds",
  "indexedV3RuntimeViewBuilds",
  "transactionReplayRuns",
  "hashRecatalogs",
  "protocolRebuilds",
  "protectionRebuilds",
  "catalogRebuilds",
  "providerMessagePasses",
  "providerMessageVisits",
  "providerMessageCacheHits",
  "providerMessageCacheMisses",
  "providerFrontierDescriptorDerivations",
  "providerFrontierSelectedExpansions",
  "providerFrontierOmittedRawMessages",
  "providerFrontierOmittedRawBytes",
  "providerFrontierInvalidations",
  "providerFrontierFallbacks",
  "incrementalAppends",
  "ancestryDigestChecks",
  "fallbacks",
  "failOpenReturns",
  "derivedInvalidations",
  "snapshotSwitches",
  "snapshotEvictions",
  "epochArchives",
  "sessionDiscards",
] as const satisfies readonly (keyof BranchIndexCounters)[];

export interface IndexedEntryRecord {
  entryId: string;
  parentId?: string;
  entryKind: string;
  ordinal: number;
  /** One-based ordinal among provider-visible Session message entries. */
  providerOrdinal?: number;
  /** Number of raw epoch message slots before this record. */
  rawSlotCountBefore: number;
  epochId: string;
  payloadDigest: string;
  alignmentFingerprint: string;
  ancestryDigest: string;
  serializedUtf8Bytes: number;
  /** Exact Session-owned object identity; the index never clones its source body. */
  entry: BranchSessionEntry;
  /** Content-free protocol surface retained for tail-atom repair. */
  protocolEntry: BranchSessionEntry;
}

export interface BranchProtocolAtom {
  atomId: string;
  ordinal: number;
  kind: ProtocolAtom["kind"];
  entryIds: readonly string[];
  startEntryOrdinal: number;
  endEntryOrdinal: number;
  toolCallIds: readonly string[];
  hardProtected: boolean;
  protectionReasons: ProtocolAtom["protectionReasons"];
  turnState: ProtocolAtom["turnState"];
  messageCount: number;
  structuredToolPartCount: number;
  utf8Bytes: number;
  surfaceSaturated: boolean;
  roles: readonly string[];
  containsUser: boolean;
  containsAssistant: boolean;
  serializedUtf8Bytes: number;
  sourceDigest: string;
}

export interface BranchIndexedBlock {
  schema: "legacy" | "v3";
  blockId: string;
  epochId: string;
  kind: string;
  active: boolean;
  queryOnly: boolean;
  sourceEntryIds: readonly string[];
  childBlockIds: readonly string[];
  parentBlockId?: string;
  coverageStartOrdinal?: number;
  coverageEndOrdinal?: number;
  sourceDigest: string;
  summaryDigest: string;
  payloadDigest: string;
  tier?: V3Tier;
  projectionVersion?: string;
  leafCount?: number;
  leafDigest?: string;
}

export interface BranchIndexedTransaction {
  schema: "legacy" | "repair" | "v3";
  transactionId: string;
  epochId: string;
  kind: string;
  payloadDigest: string;
  blockIds: readonly string[];
}

export interface BranchMessageReference {
  ref: string;
  entryId: string;
  epochId: string;
  ordinal: number;
  providerOrdinal: number;
  role?: string;
  atomId: string;
  atomEntryIds: readonly string[];
}

export interface BranchBlockReference {
  ref: string;
  blockId: string;
  epochId: string;
  ordinal: number;
  active: boolean;
  queryOnly: boolean;
}

export interface BranchTokenEstimate {
  providerId: string;
  modelId: string;
  estimatorVersion: string;
  atomId: string;
  lower: number;
  upper: number;
  source: string;
}

export interface BranchDerivedVersions {
  providerId?: string;
  modelId?: string;
  estimatorVersion?: string;
  projectionVersion?: string;
  qualityVersion?: string;
  configVersion?: string;
}

export interface BranchDerivedValidity {
  tokenEstimates: boolean;
  calibration: boolean;
  projection: boolean;
  quality: boolean;
  protection: boolean;
  catalog: boolean;
}

export interface BranchIndexStats {
  entries: number;
  atoms: number;
  atomMembershipEdges: number;
  transactions: number;
  blocks: number;
  messageRefs: number;
  blockRefs: number;
  catalogRefs: number;
  retainedRecords: number;
  retainedRecordLimit: number;
}

interface SnapshotPublicState {
  key: BranchIndexKey;
  revision: number;
  sourceDigest: string;
  sourceEntryIdDigest: string;
  protocolDigest: string;
  replayDigest: string;
  catalogId: string;
  canonicalStateDigest: string;
  derivedDigest: string;
  tipEntryId?: string;
  diagnostics: readonly string[];
  derivedVersions: BranchDerivedVersions;
  derivedValidity: BranchDerivedValidity;
  stats: BranchIndexStats;
}

export class BranchIndexSnapshot {
  readonly version = BRANCH_INDEX_VERSION;
  readonly key: BranchIndexKey;
  readonly keyId: string;
  readonly revision: number;
  readonly sourceDigest: string;
  /** Full selected-branch source identity; custom AILI records are excluded. */
  readonly sourceEntryIdDigest: string;
  readonly protocolDigest: string;
  readonly replayDigest: string;
  readonly catalogId: string;
  readonly canonicalStateDigest: string;
  readonly derivedDigest: string;
  readonly tipEntryId?: string;
  readonly diagnostics: readonly string[];
  readonly derivedVersions: Readonly<BranchDerivedVersions>;
  readonly derivedValidity: Readonly<BranchDerivedValidity>;
  readonly stats: Readonly<BranchIndexStats>;

  constructor(state: SnapshotPublicState, internal: SnapshotInternal) {
    this.key = Object.freeze({ ...state.key });
    this.keyId = branchIndexKeyId(state.key);
    this.revision = state.revision;
    this.sourceDigest = state.sourceDigest;
    this.sourceEntryIdDigest = state.sourceEntryIdDigest;
    this.protocolDigest = state.protocolDigest;
    this.replayDigest = state.replayDigest;
    this.catalogId = state.catalogId;
    this.canonicalStateDigest = state.canonicalStateDigest;
    this.derivedDigest = state.derivedDigest;
    this.tipEntryId = state.tipEntryId;
    this.diagnostics = Object.freeze([...state.diagnostics]);
    this.derivedVersions = Object.freeze({ ...state.derivedVersions });
    this.derivedValidity = Object.freeze({ ...state.derivedValidity });
    this.stats = Object.freeze({ ...state.stats });
    SNAPSHOT_INTERNALS.set(this, internal);
    Object.freeze(this);
  }
}

export interface BranchReplayBlockInput {
  schema?: "legacy" | "v3";
  blockId: string;
  epochId: string;
  kind: string;
  active: boolean;
  queryOnly?: boolean;
  sourceEntryIds?: readonly string[];
  childBlockIds?: readonly string[];
  sourceDigest: string;
  summaryDigest: string;
  payloadDigest: string;
  tier?: V3Tier;
  projectionVersion?: string;
  leafCount?: number;
  leafDigest?: string;
  coverageStartOrdinal?: number;
  coverageEndOrdinal?: number;
}

export interface BranchReplayBlockUpdate {
  blockId: string;
  active?: boolean;
  queryOnly?: boolean;
  /** null explicitly clears the currently active parent edge. */
  parentBlockId?: string | null;
}

export interface BranchReplayEvent {
  schema?: "legacy" | "repair" | "v3";
  transactionId: string;
  epochId: string;
  kind: string;
  payloadDigest: string;
  blocks?: readonly BranchReplayBlockInput[];
  deactivateBlockIds?: readonly string[];
  reactivateBlockIds?: readonly string[];
  lifecycleUpdates?: readonly CompactLifecycleUpdate[];
  blockUpdates?: readonly BranchReplayBlockUpdate[];
  deactivateAll?: boolean;
}

export type BranchReplayEntryDecision = { kind: "none" }
  | { kind: "event"; event: BranchReplayEvent }
  | { kind: "repair"; entry: RepairEntry }
  | { kind: "v3"; transaction: V3Transaction }
  | { kind: "diagnostic"; diagnostic: string; v3?: V3ReplayDiagnostic }
  | { kind: "unsupported"; reason: string };

export interface BranchReplayAdapter {
  version: string;
  fromEntry(entry: BranchSessionEntry): BranchReplayEntryDecision;
}

export const DEFAULT_BRANCH_REPLAY_ADAPTER: BranchReplayAdapter = Object.freeze({
  version: "aili.compact.v1-v3-index.v2",
  fromEntry(entry: BranchSessionEntry): BranchReplayEntryDecision {
    const transaction = transactionFromEntry(entry);
    if (transaction) return { kind: "event", event: replayEventFromCompactTransaction(transaction) };
    if (entry.type === "custom" && entry.customType === AILI_COMPACT_ENTRY && isRecord(entry.data)) {
      const repair = parseRepairEntry(entry.data);
      if (repair) return { kind: "repair", entry: repair };
      if (entry.data.type === "aili.compact.repair.v1") {
        return { kind: "diagnostic", diagnostic: `repair-invalid:${entry.id}` };
      }
      if (isV3CompactTransactionCandidate(entry.data)) {
        const parsed = parseV3Transaction(entry.data);
        if (!parsed.ok) {
          const v3: V3ReplayDiagnostic = {
            phase: "parse", entryId: entry.id, transactionId: undefined, code: parsed.code, path: parsed.path,
          };
          return { kind: "diagnostic", diagnostic: formatV3ReplayDiagnostic(v3), v3 };
        }
        return { kind: "v3", transaction: parsed.value };
      }
      if (typeof entry.data.schema === "string" && entry.data.schema.startsWith("aili.compact.tx.")) {
        return { kind: "unsupported", reason: `unsupported-transaction-schema:${entry.data.schema}` };
      }
    }
    return { kind: "none" };
  },
});

export interface ColdBranchIndexInput {
  key: BranchIndexKey;
  entries: readonly BranchSessionEntry[];
  /** Complete selected-branch source identity supplied by the session owner. */
  sourceEntryIdDigest?: string;
  replayAdapter?: BranchReplayAdapter;
  derivedVersions?: BranchDerivedVersions;
  /** Source-bound v3 archive state at the current epoch boundary. */
  v3ReplaySeed?: VerifiedV3ReplaySeedV1;
  /** Exact selected-branch prefix through the checkpoint boundary. */
  v3ReplaySeedSourcePrefix?: readonly BranchSessionEntry[];
}

export const VERIFIED_V3_REPLAY_SEED_VERSION = "aili.compact.v3-replay-seed.v1" as const;

export interface V3ReplaySeedEpochBoundaryIdentityV1 {
  entryId: string;
  parentId: string | null;
  entryKind: string;
  payloadDigest: string;
  sourcePrefixLength: number;
  sessionId: string;
  canonicalSessionPathDigest: string;
  branchLeafId?: string;
}

/** A closed archived replay seed; bare structurally-valid state is never trusted. */
export interface VerifiedV3ReplaySeedV1 {
  version: typeof VERIFIED_V3_REPLAY_SEED_VERSION;
  sourcePrefixDigest: string;
  epochBoundary: V3ReplaySeedEpochBoundaryIdentityV1;
  replayDigest: string;
  projectionVersion: string;
  replayVersion: string;
  replay: V3LifecycleReplay;
}

export interface AppendBranchIndexInput {
  entries: readonly BranchSessionEntry[];
  expectedParentId?: string;
  expectedPriorDigest?: string;
  nextBranchLeafId?: string;
  /** Complete selected-branch source identity after this bounded append. */
  nextSourceEntryIdDigest?: string;
}

export type BranchIndexFailureCode = "duplicate-entry-id"
  | "duplicate-transaction-id"
  | "impossible-lineage"
  | "invalid-block"
  | "invalid-entry"
  | "invalid-scope"
  | "parent-tip-mismatch"
  | "prior-digest-mismatch"
  | "replay-unsupported"
  | "wrong-epoch";

export type ColdBranchIndexResult = {
  ok: true;
  operation: "cold-build";
  snapshot: BranchIndexSnapshot;
  counters: BranchIndexCounters;
} | {
  ok: false;
  operation: "cold-build";
  code: BranchIndexFailureCode;
  diagnostic: string;
  counters: BranchIndexCounters;
};

export type AppendBranchIndexResult = {
  ok: true;
  operation: "incremental-append";
  snapshot: BranchIndexSnapshot;
  counters: BranchIndexCounters;
} | {
  ok: false;
  operation: "incremental-append";
  code: BranchIndexFailureCode;
  diagnostic: string;
  snapshot: BranchIndexSnapshot;
  rebuildRequired: boolean;
  counters: BranchIndexCounters;
};

interface IndexNode<V> {
  readonly key: string;
  readonly value: V;
  readonly height: number;
  readonly left?: IndexNode<V>;
  readonly right?: IndexNode<V>;
}

interface IndexSetResult<V> {
  root: IndexNode<V>;
  added: boolean;
  previous?: V;
}

interface EntrySegment {
  readonly previous?: EntrySegment;
  readonly records: readonly IndexedEntryRecord[];
}

interface AtomNode {
  readonly previous?: AtomNode;
  readonly atom: BranchProtocolAtom;
  readonly chainDigest: string;
}

interface StringListNode {
  readonly previous?: StringListNode;
  readonly value: string;
}

interface OccurrenceNode {
  readonly previous?: OccurrenceNode;
  readonly ordinal: number;
}

const RAW_EPOCH_SEGMENT_SIZE = 256;

interface PersistentRawEpochSegment<T> {
  readonly start: number;
  readonly values: readonly T[];
}

/** Immutable segments are held by a persistent lookup tree, never copied to extend a tail. */
interface PersistentSegmentedValues<T> {
  readonly length: number;
  readonly segments?: IndexNode<PersistentRawEpochSegment<T>>;
}

interface SnapshotInternal {
  readonly replayAdapter: BranchReplayAdapter;
  readonly epochId: string;
  readonly ancestrySeed: string;
  readonly entryTail?: EntrySegment;
  readonly entryById?: IndexNode<IndexedEntryRecord>;
  readonly entryByOrdinal?: IndexNode<IndexedEntryRecord>;
  readonly occurrenceByFingerprint?: IndexNode<OccurrenceNode>;
  readonly atomTail?: AtomNode;
  readonly atomById?: IndexNode<BranchProtocolAtom>;
  readonly atomByEntryId?: IndexNode<BranchProtocolAtom>;
  readonly messageByRef?: IndexNode<BranchMessageReference>;
  readonly messageRefByEntryId?: IndexNode<string>;
  readonly messageByOrdinal?: IndexNode<BranchMessageReference>;
  readonly transactionById?: IndexNode<BranchIndexedTransaction>;
  readonly blockById?: IndexNode<BranchIndexedBlock>;
  readonly legacyBlockIds?: IndexNode<true>;
  readonly blockIdTail?: StringListNode;
  readonly blockByRef?: IndexNode<BranchBlockReference>;
  readonly blockRefById?: IndexNode<string>;
  readonly blockByOrdinal?: IndexNode<BranchBlockReference>;
  readonly tokenEstimateByKey?: IndexNode<BranchTokenEstimate>;
  readonly tokenEstimateDigest: string;
  readonly entryCount: number;
  readonly providerEntryCount: number;
  readonly atomCount: number;
  readonly atomMembershipEdges: number;
  readonly transactionCount: number;
  readonly blockCount: number;
  readonly messageRefCount: number;
  readonly blockRefCount: number;
  readonly v3State?: V3LifecycleState;
  readonly v3ReplaySeed?: VerifiedV3ReplaySeedV1;
  readonly rawEpochSlots: PersistentSegmentedValues<RawEpochSlotV1>;
  /** Stored at index construction so frontier omission accounting never serializes old raw bodies. */
  readonly rawEpochUtf8Bytes: number;
  /** Prefix chain is captured with each slot so bounded proof replay never rescans the epoch. */
  readonly rawEpochPrefixDigests: PersistentSegmentedValues<string>;
  readonly rawGapIndex?: PromotionGapIndexV1;
  /** A proof makes the captured raw source freshness-sensitive even without a full index. */
  readonly rawGapSourceIdentity?: PromotionGapIndexV1["projection"]["identity"];
  readonly rawGapSourceSnapshotDigest?: string;
  /** Immutable slots declared by accepted promotion proofs, retained across ordinary raw appends. */
  readonly rawGapProofSourceSlots?: readonly RawEpochSlotV1[];
  readonly v3Diagnostics: readonly V3ReplayDiagnostic[];
  readonly repairTransactionCount: number;
  readonly legacyDiagnosticCount: number;
  readonly entryChainDigest: string;
  readonly protocolChainDigest: string;
  readonly replayChainDigest: string;
  readonly messageCatalogDigest: string;
}

const SNAPSHOT_INTERNALS = new WeakMap<BranchIndexSnapshot, SnapshotInternal>();

export function branchIndexKeyId(key: BranchIndexKey): string {
  return digest({ version: BRANCH_INDEX_VERSION, ...key });
}

export function emptyBranchIndexCounters(): BranchIndexCounters {
  return Object.fromEntries(BRANCH_INDEX_COUNTER_KEYS.map((key) => [key, 0])) as unknown as BranchIndexCounters;
}

export function addBranchIndexCounters(...values: readonly BranchIndexCounters[]): BranchIndexCounters {
  const result = emptyBranchIndexCounters();
  for (const counters of values) for (const key of BRANCH_INDEX_COUNTER_KEYS) result[key] += counters[key];
  return result;
}

function persistentSegmentedValues<T>(values: readonly T[]): PersistentSegmentedValues<T> {
  let segments: IndexNode<PersistentRawEpochSegment<T>> | undefined;
  for (let index = 0; index < values.length; index += RAW_EPOCH_SEGMENT_SIZE) {
    const segment = Object.freeze({
      start: index,
      values: Object.freeze(values.slice(index, index + RAW_EPOCH_SEGMENT_SIZE)),
    });
    segments = indexSet(segments, ordinalKey(index), segment).root;
  }
  return Object.freeze({ length: values.length, segments });
}

function appendPersistentSegmentedValues<T>(
  previous: PersistentSegmentedValues<T>,
  appended: readonly T[],
): PersistentSegmentedValues<T> {
  if (appended.length === 0) return previous;
  let segments = previous.segments;
  let appendedOffset = 0;
  while (appendedOffset < appended.length) {
    const nextOffset = Math.min(appendedOffset + RAW_EPOCH_SEGMENT_SIZE, appended.length);
    const start = previous.length + appendedOffset;
    const segment = Object.freeze({
      start,
      values: Object.freeze(appended.slice(appendedOffset, nextOffset)),
    });
    segments = indexSet(segments, ordinalKey(start), segment).root;
    appendedOffset = nextOffset;
  }
  return Object.freeze({
    length: previous.length + appended.length,
    segments,
  });
}

function persistentSegmentedValueAt<T>(
  values: PersistentSegmentedValues<T>,
  index: number,
): T | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) return undefined;
  const segment = indexFloor(values.segments, ordinalKey(index));
  return segment?.values[index - segment.start];
}

function persistentSegmentedValuesToArray<T>(
  values: PersistentSegmentedValues<T>,
  counters: BranchIndexCounters,
  kind: "slot" | "prefix",
): T[] {
  const result: T[] = [];
  const visit = (segment: IndexNode<PersistentRawEpochSegment<T>> | undefined): void => {
    if (!segment) return;
    visit(segment.left);
    for (const value of segment.value.values) {
      countRawEpochStorageIteration(counters, kind);
      result.push(value);
    }
    visit(segment.right);
  };
  visit(values.segments);
  return result;
}

function countRawEpochStorageIteration(counters: BranchIndexCounters, kind: "slot" | "prefix"): void {
  if (kind === "slot") counters.rawEpochSlotStorageIterationVisits += 1;
  else counters.rawEpochPrefixStorageIterationVisits += 1;
}

function immutableV3ReplayClone(replay: V3LifecycleReplay): V3LifecycleReplay {
  const cloned = structuredClone(replay) as V3LifecycleReplay;
  freezeV3ReplayValue(cloned);
  return cloned;
}

function freezeV3ReplayValue(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, item] of value) {
      freezeV3ReplayValue(key, seen);
      freezeV3ReplayValue(item, seen);
    }
  } else if (value instanceof Set) {
    for (const item of value) freezeV3ReplayValue(item, seen);
  } else {
    for (const item of Object.values(value)) freezeV3ReplayValue(item, seen);
  }
  Object.freeze(value);
}

function snapshotVerifiedV3ReplaySeed(
  seed: VerifiedV3ReplaySeedV1,
  trustedReplay: V3LifecycleReplay,
): VerifiedV3ReplaySeedV1 {
  return Object.freeze({
    version: VERIFIED_V3_REPLAY_SEED_VERSION,
    sourcePrefixDigest: seed.sourcePrefixDigest,
    epochBoundary: Object.freeze({ ...seed.epochBoundary }),
    replayDigest: v3ReplayDigest(trustedReplay),
    projectionVersion: seed.projectionVersion,
    replayVersion: seed.replayVersion,
    replay: immutableV3ReplayClone(trustedReplay),
  });
}

/** Captures a source-bound archived replay seed at one exact checkpoint boundary. */
export function createVerifiedV3ReplaySeed(input: {
  key: Pick<BranchIndexKey, "sessionId" | "canonicalSessionPathDigest" | "epochId" | "replayVersion">;
  sourcePrefix: readonly BranchSessionEntry[];
  replay: V3LifecycleReplay;
}): VerifiedV3ReplaySeedV1 {
  const boundary = input.sourcePrefix.at(-1);
  if (!boundary || boundary.id !== input.key.epochId || boundary.type !== "compaction") {
    throw new TypeError("v3 replay seed requires its exact compaction boundary");
  }
  const replay = immutableV3ReplayClone(input.replay);
  const state = replay.state;
  return Object.freeze({
    version: VERIFIED_V3_REPLAY_SEED_VERSION,
    sourcePrefixDigest: v3ReplaySeedSourcePrefixDigest(input.sourcePrefix),
    epochBoundary: Object.freeze({
      entryId: boundary.id,
      parentId: boundary.parentId ?? null,
      entryKind: entryKind(boundary),
      payloadDigest: entryPayloadDigest(boundary),
      sourcePrefixLength: input.sourcePrefix.length,
      sessionId: input.key.sessionId,
      canonicalSessionPathDigest: input.key.canonicalSessionPathDigest,
      ...(state ? { branchLeafId: state.branchLeafId } : {}),
    }),
    replayDigest: v3ReplayDigest(replay),
    projectionVersion: state?.projectionVersion ?? "none",
    replayVersion: input.key.replayVersion,
    replay,
  });
}

/** Performs the one declared cold build and creates immutable/persistent index roots. */
export function coldBuildBranchIndex(input: ColdBranchIndexInput): ColdBranchIndexResult {
  const counters = emptyBranchIndexCounters();
  counters.fullRebuilds = 1;
  counters.protocolRebuilds = 1;
  counters.protectionRebuilds = 1;
  counters.catalogRebuilds = 1;
  counters.hashRecatalogs = 1;
  const scopeError = validateKey(input.key);
  if (scopeError) return coldFailure("invalid-scope", scopeError, counters);
  const replayAdapter = input.replayAdapter ?? DEFAULT_BRANCH_REPLAY_ADAPTER;
  if (!replayAdapter.version) return coldFailure("replay-unsupported", "replay adapter version is required", counters);
  const sourceEntryIdDigest = input.sourceEntryIdDigest ?? branchSourceEntryIdDigest(input.entries);
  let installedV3ReplaySeed: VerifiedV3ReplaySeedV1 | undefined;
  if (input.v3ReplaySeed) {
    const seedValidation = validateVerifiedV3ReplaySeed(
      input.v3ReplaySeed,
      input.key,
      input.v3ReplaySeedSourcePrefix,
      counters,
    );
    if (typeof seedValidation === "string") return coldFailure("invalid-scope", seedValidation, counters);
    installedV3ReplaySeed = snapshotVerifiedV3ReplaySeed(input.v3ReplaySeed, seedValidation);
  }
  const v3SeedState = installedV3ReplaySeed?.replay.state;

  const ancestrySeed = ancestrySeedFor(input.key);
  let entryById: IndexNode<IndexedEntryRecord> | undefined;
  let entryByOrdinal: IndexNode<IndexedEntryRecord> | undefined;
  let occurrenceByFingerprint: IndexNode<OccurrenceNode> | undefined;
  let entryChainDigest = ancestrySeed;
  let previousId: string | undefined;
  let providerEntryCount = 0;
  let recordEpochId = input.key.epochId;
  const records: IndexedEntryRecord[] = [];
  for (let index = 0; index < input.entries.length; index += 1) {
    counters.entryVisits += 1;
    const entry = input.entries[index]!;
    if (entry.type === "compaction") {
      recordEpochId = entry.id;
      providerEntryCount = 0;
    }
    const validation = validateEntry(entry, index === 0);
    if (validation) return coldFailure("invalid-entry", validation, counters);
    if (index > 0 && entry.parentId !== undefined && entry.parentId !== previousId) {
      return coldFailure("impossible-lineage", `entry ${entry.id} does not follow ${previousId}`, counters);
    }
    if (indexGet(entryById, entry.id)) return coldFailure("duplicate-entry-id", `duplicate entry ${entry.id}`, counters);
    const parentId = entry.parentId ?? previousId;
    const rawSlotCountBefore = providerEntryCount;
    const providerOrdinal = isProviderMessageEntry(entry) ? ++providerEntryCount : undefined;
    const record = makeEntryRecord(
      entry,
      parentId,
      index + 1,
      recordEpochId,
      entryChainDigest,
      rawSlotCountBefore,
      providerOrdinal,
    );
    counters.hashOps += 3;
    entryChainDigest = record.ancestryDigest;
    entryById = indexSet(entryById, record.entryId, record).root;
    entryByOrdinal = indexSet(entryByOrdinal, ordinalKey(record.ordinal), record).root;
    const priorOccurrences = indexGet(occurrenceByFingerprint, record.alignmentFingerprint);
    occurrenceByFingerprint = indexSet(occurrenceByFingerprint, record.alignmentFingerprint, {
      previous: priorOccurrences,
      ordinal: record.ordinal,
    }).root;
    records.push(record);
    previousId = entry.id;
  }

  const currentEpochRecords = records.filter((record) => record.epochId === input.key.epochId);
  const currentEpochEntries = currentEpochRecords.map((record) => record.entry);
  counters.entryVisits += currentEpochEntries.length;
  const rawEpochSlots: RawEpochSlotV1[] = [];
  const rawEpochPrefixDigests: string[] = [rawEpochPrefixSeed()];
  for (const [sourceEntryIndex, record] of currentEpochRecords.entries()) {
    if (record.providerOrdinal === undefined) continue;
    counters.rawSlotVisits += 1;
    const slot = createRawEpochSlot(record.entry, record.providerOrdinal, sourceEntryIndex);
    rawEpochSlots.push(slot);
    rawEpochPrefixDigests.push(nextRawEpochPrefixDigest(rawEpochPrefixDigests.at(-1)!, slot));
  }
  const builtAtoms = buildProtocolAtoms(currentEpochEntries);
  let atomTail: AtomNode | undefined;
  let atomById: IndexNode<BranchProtocolAtom> | undefined;
  let atomByEntryId: IndexNode<BranchProtocolAtom> | undefined;
  let atomMembershipEdges = 0;
  for (const atom of builtAtoms.atoms) {
    const converted = convertAtom(atom, entryById, atom.ordinal);
    if (!converted) return coldFailure("invalid-entry", `atom ${atom.atomId} references an unknown entry`, counters);
    atomTail = appendAtomNode(atomTail, converted, protocolSeedFor(input.key));
    atomById = indexSet(atomById, converted.atomId, converted).root;
    counters.hashOps += 2;
    for (const entryId of converted.entryIds) {
      atomByEntryId = indexSet(atomByEntryId, entryId, converted).root;
      counters.atomMembershipVisits += 1;
      atomMembershipEdges += 1;
    }
  }
  const protocolChainDigest = atomTail?.chainDigest ?? protocolSeedFor(input.key);

  let internal: SnapshotInternal = {
    replayAdapter,
    epochId: input.key.epochId,
    ancestrySeed,
    entryTail: records.length > 0 ? { records: Object.freeze(records) } : undefined,
    entryById,
    entryByOrdinal,
    occurrenceByFingerprint,
    atomTail,
    atomById,
    atomByEntryId,
    entryCount: records.length,
    providerEntryCount: currentEpochRecords.filter((record) => record.providerOrdinal !== undefined).length,
    atomCount: builtAtoms.atoms.length,
    atomMembershipEdges,
    transactionCount: v3SeedState?.transactions.size ?? 0,
    blockCount: v3SeedState?.blocks.size ?? 0,
    messageRefCount: 0,
    blockRefCount: 0,
    ...(v3SeedState ? { v3State: v3SeedState } : {}),
    ...(installedV3ReplaySeed ? { v3ReplaySeed: installedV3ReplaySeed } : {}),
    rawEpochSlots: persistentSegmentedValues(rawEpochSlots),
    rawEpochUtf8Bytes: currentEpochRecords
      .filter((record) => record.providerOrdinal !== undefined)
      .reduce((sum, record) => sum + record.serializedUtf8Bytes, 0),
    rawEpochPrefixDigests: persistentSegmentedValues(rawEpochPrefixDigests),
    v3Diagnostics: Object.freeze([...(installedV3ReplaySeed?.replay.diagnostics ?? [])]),
    repairTransactionCount: 0,
    legacyDiagnosticCount: 0,
    entryChainDigest,
    protocolChainDigest,
    replayChainDigest: v3SeedState
      ? digest({ seed: replaySeedFor(input.key), v3SeedCatalogId: v3SeedState.catalogId })
      : replaySeedFor(input.key),
    messageCatalogDigest: messageCatalogSeedFor(input.key),
    tokenEstimateDigest: tokenEstimateSeedFor(input.key),
  };
  const refs = appendMessageReferences(internal, currentEpochRecords, counters);
  internal = refs.internal;

  const replayDiagnostics: string[] = [];
  counters.entryVisits += input.entries.length;
  for (const [recordIndex, record] of records.entries()) {
    const decision = replayAdapter.fromEntry(record.entry);
    counters.transactionReplayRuns += decision.kind === "event" || decision.kind === "v3" ? 1 : 0;
    const processed = processReplayDecision(
      internal,
      decision,
      record,
      decision.kind === "repair" ? input.entries.slice(0, recordIndex + 1) : [],
      counters,
    );
    if (!processed.ok) return coldFailure(processed.code, processed.diagnostic, counters);
    internal = processed.internal;
    replayDiagnostics.push(...processed.diagnostics);
  }

  const snapshot = makeSnapshot(
    input.key,
    internal,
    sourceEntryIdDigest,
    input.derivedVersions ?? {},
    allDerivedValid(),
    replayDiagnostics,
    1,
  );
  return { ok: true, operation: "cold-build", snapshot, counters };
}

/**
 * Appends only D new Session-owned entries. Prior source is reachable through a shared segment;
 * protocol repair reads only saved protocol metadata for the affected tail atom.
 */
export function appendBranchIndex(
  snapshot: BranchIndexSnapshot,
  input: AppendBranchIndexInput,
): AppendBranchIndexResult {
  const counters = emptyBranchIndexCounters();
  const previous = getInternal(snapshot);
  if (input.entries.length === 0) return appendFailure(snapshot, "invalid-entry", "append batch is empty", false, counters);
  if (input.expectedPriorDigest !== undefined && input.expectedPriorDigest !== snapshot.sourceDigest) {
    return appendFailure(snapshot, "prior-digest-mismatch", "prior source digest does not match", true, counters);
  }
  const expectedParent = input.expectedParentId ?? snapshot.tipEntryId;
  const firstValidation = validateEntry(input.entries[0]!, snapshot.stats.entries === 0);
  if (firstValidation) return appendFailure(snapshot, "invalid-entry", firstValidation, true, counters);
  const firstParent = input.entries[0]!.parentId ?? snapshot.tipEntryId;
  if (expectedParent !== snapshot.tipEntryId || firstParent !== snapshot.tipEntryId) {
    return appendFailure(snapshot, "parent-tip-mismatch", "append parent does not match indexed tip", true, counters);
  }

  let entryById = previous.entryById;
  let entryByOrdinal = previous.entryByOrdinal;
  let occurrenceByFingerprint = previous.occurrenceByFingerprint;
  let entryChainDigest = previous.entryChainDigest;
  let previousId = snapshot.tipEntryId;
  let providerEntryCount = previous.providerEntryCount;
  const records: IndexedEntryRecord[] = [];
  for (let offset = 0; offset < input.entries.length; offset += 1) {
    counters.entryVisits += 1;
    const entry = input.entries[offset]!;
    const validation = validateEntry(entry, previous.entryCount === 0 && offset === 0);
    if (validation) return appendFailure(snapshot, "invalid-entry", validation, true, counters);
    const parentId = entry.parentId ?? previousId;
    if (parentId !== previousId) {
      return appendFailure(snapshot, "impossible-lineage", `entry ${entry.id} does not follow ${previousId}`, true, counters);
    }
    if (indexGet(entryById, entry.id)) {
      return appendFailure(snapshot, "duplicate-entry-id", `duplicate entry ${entry.id}`, true, counters);
    }
    const ordinal = previous.entryCount + offset + 1;
    const rawSlotCountBefore = providerEntryCount;
    const providerOrdinal = isProviderMessageEntry(entry) ? ++providerEntryCount : undefined;
    const record = makeEntryRecord(
      entry,
      parentId,
      ordinal,
      snapshot.key.epochId,
      entryChainDigest,
      rawSlotCountBefore,
      providerOrdinal,
    );
    counters.hashOps += 3;
    entryChainDigest = record.ancestryDigest;
    entryById = indexSet(entryById, record.entryId, record).root;
    entryByOrdinal = indexSet(entryByOrdinal, ordinalKey(record.ordinal), record).root;
    const priorOccurrences = indexGet(occurrenceByFingerprint, record.alignmentFingerprint);
    occurrenceByFingerprint = indexSet(occurrenceByFingerprint, record.alignmentFingerprint, {
      previous: priorOccurrences,
      ordinal: record.ordinal,
    }).root;
    records.push(record);
    previousId = entry.id;
  }

  const appendedRawSlots: RawEpochSlotV1[] = [];
  for (const record of records) {
    if (record.providerOrdinal === undefined) continue;
    counters.rawSlotVisits += 1;
    const slot = createRawEpochSlot(record.entry, record.providerOrdinal, record.ordinal - indexedEpochStartOrdinal(previous));
    appendedRawSlots.push(slot);
  }
  const rawEpochSlots = appendedRawSlots.length === 0
    ? previous.rawEpochSlots
    : appendPersistentSegmentedValues(previous.rawEpochSlots, appendedRawSlots);
  let rawEpochPrefixDigests = previous.rawEpochPrefixDigests;
  if (appendedRawSlots.length > 0) {
    const appendedPrefixDigests: string[] = [];
    let previousPrefixDigest = persistentSegmentedValueAt(
      previous.rawEpochPrefixDigests,
      previous.rawEpochPrefixDigests.length - 1,
    );
    if (!previousPrefixDigest) {
      return appendFailure(snapshot, "invalid-entry", "raw epoch prefix digest is missing", true, counters);
    }
    for (const slot of appendedRawSlots) {
      previousPrefixDigest = nextRawEpochPrefixDigest(previousPrefixDigest, slot);
      appendedPrefixDigests.push(previousPrefixDigest);
    }
    rawEpochPrefixDigests = appendPersistentSegmentedValues(
      previous.rawEpochPrefixDigests,
      appendedPrefixDigests,
    );
  }
  const rawGapSourceIdentity = previous.rawGapSourceIdentity ?? previous.rawGapIndex?.projection.identity;
  const rawGapSourceSnapshotDigest = rawGapSourceIdentity
    ? rawEpochSourceSnapshotDigest(rawEpochSlots, rawEpochPrefixDigests, rawGapSourceIdentity)
    : undefined;
  let internal: SnapshotInternal = {
    ...previous,
    entryTail: { previous: previous.entryTail, records: Object.freeze(records) },
    entryById,
    entryByOrdinal,
    occurrenceByFingerprint,
    entryCount: previous.entryCount + records.length,
    providerEntryCount,
    rawEpochSlots,
    rawEpochUtf8Bytes: previous.rawEpochUtf8Bytes + records
      .filter((record) => record.providerOrdinal !== undefined)
      .reduce((sum, record) => sum + record.serializedUtf8Bytes, 0),
    rawEpochPrefixDigests,
    ...(appendedRawSlots.length > 0 ? {
      rawGapIndex: undefined,
      ...(rawGapSourceIdentity && rawGapSourceSnapshotDigest ? {
        rawGapSourceIdentity,
        rawGapSourceSnapshotDigest,
      } : {}),
    } : {}),
    entryChainDigest,
  };
  counters.entryVisits += input.entries.length;
  const atomUpdate = appendProtocolAtoms(internal, previous, records, input.entries, snapshot.key, counters);
  if (!atomUpdate.ok) return appendFailure(snapshot, "invalid-entry", atomUpdate.diagnostic, true, counters);
  internal = atomUpdate.internal;
  internal = appendMessageReferences(internal, records, counters).internal;

  const replayDiagnostics = [...snapshot.diagnostics];
  counters.entryVisits += input.entries.length;
  for (const record of records) {
    const decision = previous.replayAdapter.fromEntry(record.entry);
    counters.transactionReplayRuns += decision.kind === "event" || decision.kind === "v3" ? 1 : 0;
    const processed = processReplayDecision(
      internal,
      decision,
      record,
      decision.kind === "repair" ? entriesThroughOrdinal(internal, record.ordinal, counters) : [],
      counters,
    );
    if (!processed.ok) return appendFailure(snapshot, processed.code, processed.diagnostic, true, counters);
    internal = processed.internal;
    replayDiagnostics.push(...processed.diagnostics);
  }
  counters.incrementalAppends = 1;
  const nextKey: BranchIndexKey = {
    ...snapshot.key,
    branchLeafId: input.nextBranchLeafId ?? records.at(-1)!.entryId,
  };
  const sourceEntryIdDigest = input.nextSourceEntryIdDigest
    ?? branchSourceEntryIdDigest(input.entries, snapshot.sourceEntryIdDigest);
  const next = makeSnapshot(
    nextKey,
    internal,
    sourceEntryIdDigest,
    snapshot.derivedVersions,
    snapshot.derivedValidity,
    replayDiagnostics,
    snapshot.revision + 1,
  );
  return { ok: true, operation: "incremental-append", snapshot: next, counters };
}

function appendProtocolAtoms(
  current: SnapshotInternal,
  previous: SnapshotInternal,
  newRecords: readonly IndexedEntryRecord[],
  newEntries: readonly BranchSessionEntry[],
  key: BranchIndexKey,
  counters: BranchIndexCounters,
): { ok: true; internal: SnapshotInternal } | { ok: false; diagnostic: string } {
  const newMessageEntries = newEntries.filter((entry) => entry.type === "message");
  if (newMessageEntries.length === 0) return { ok: true, internal: current };
  const oldTail = previous.atomTail;
  const oldMembers = oldTail?.atom.entryIds.flatMap((entryId) => {
    const record = indexGet(previous.entryById, entryId);
    return record ? [protocolSurfaceEntry(record)] : [];
  }) ?? [];
  counters.atomMembershipVisits += oldMembers.length;
  const affectedInput = [...oldMembers, ...newMessageEntries];
  const built = buildProtocolAtoms(affectedInput);
  let atomTail = oldTail?.previous;
  let atomById = previous.atomById;
  let atomCount = previous.atomCount - (oldTail ? 1 : 0);
  let atomMembershipEdges = previous.atomMembershipEdges - (oldTail?.atom.entryIds.length ?? 0);
  let atomByEntryId = previous.atomByEntryId;
  let start = 0;
  if (oldTail && built.atoms[0] && sameAtomShape(oldTail.atom, built.atoms[0])) {
    atomTail = oldTail;
    atomCount = previous.atomCount;
    atomMembershipEdges = previous.atomMembershipEdges;
    start = 1;
  }
  for (let index = start; index < built.atoms.length; index += 1) {
    const atom = built.atoms[index]!;
    const ordinal = atomCount + 1;
    const rebased = convertAtom(atom, current.entryById, ordinal);
    if (!rebased) return { ok: false, diagnostic: `affected atom ${atom.atomId} references an unknown entry` };
    atomTail = appendAtomNode(atomTail, rebased, protocolSeedFor(key));
    atomById = indexSet(atomById, rebased.atomId, rebased).root;
    atomCount += 1;
    counters.hashOps += 2;
    for (const entryId of rebased.entryIds) {
      atomByEntryId = indexSet(atomByEntryId, entryId, rebased).root;
      counters.atomMembershipVisits += 1;
      atomMembershipEdges += 1;
    }
  }
  if (start === 0 && oldTail) {
    for (const oldEntryId of oldTail.atom.entryIds) {
      const replacement = indexGet(atomByEntryId, oldEntryId);
      if (!replacement || replacement === oldTail.atom) {
        return { ok: false, diagnostic: `affected atom did not remap ${oldEntryId}` };
      }
    }
  }
  const updated: SnapshotInternal = {
    ...current,
    atomTail,
    atomById,
    atomByEntryId,
    atomCount,
    atomMembershipEdges,
    protocolChainDigest: atomTail?.chainDigest ?? protocolSeedFor(key),
  };
  return { ok: true, internal: refreshAffectedMessageRefs(updated, oldTail?.atom.entryIds ?? []) };
}

function appendMessageReferences(
  internal: SnapshotInternal,
  records: readonly IndexedEntryRecord[],
  counters: BranchIndexCounters,
): { internal: SnapshotInternal } {
  let messageByRef = internal.messageByRef;
  let messageRefByEntryId = internal.messageRefByEntryId;
  let messageByOrdinal = internal.messageByOrdinal;
  let messageRefCount = internal.messageRefCount;
  let messageCatalogDigest = internal.messageCatalogDigest;
  for (const record of records) {
    if (!isReferenceEligible(record.entry)) continue;
    const atom = indexGet(internal.atomByEntryId, record.entryId);
    if (!atom) continue;
    messageRefCount += 1;
    const ref = formatRef("m", messageRefCount);
    const role = isRecord(record.entry.message) && typeof record.entry.message.role === "string"
      ? record.entry.message.role : undefined;
    const value: BranchMessageReference = Object.freeze({
      ref,
      entryId: record.entryId,
      epochId: record.epochId,
      ordinal: messageRefCount,
      providerOrdinal: record.providerOrdinal!,
      ...(role ? { role } : {}),
      atomId: atom.atomId,
      atomEntryIds: atom.entryIds,
    });
    messageByRef = indexSet(messageByRef, ref, value).root;
    messageRefByEntryId = indexSet(messageRefByEntryId, record.entryId, ref).root;
    messageByOrdinal = indexSet(messageByOrdinal, ordinalKey(messageRefCount), value).root;
    messageCatalogDigest = digest({ previous: messageCatalogDigest, ref, entryId: record.entryId, epochId: record.epochId });
    counters.hashOps += 1;
  }
  return {
    internal: {
      ...internal,
      messageByRef,
      messageRefByEntryId,
      messageByOrdinal,
      messageRefCount,
      messageCatalogDigest,
    },
  };
}

function refreshAffectedMessageRefs(internal: SnapshotInternal, entryIds: readonly string[]): SnapshotInternal {
  let messageByRef = internal.messageByRef;
  let messageByOrdinal = internal.messageByOrdinal;
  for (const entryId of entryIds) {
    const ref = indexGet(internal.messageRefByEntryId, entryId);
    const atom = indexGet(internal.atomByEntryId, entryId);
    if (!ref || !atom) continue;
    const existing = indexGet(messageByRef, ref);
    if (!existing || existing.atomId === atom.atomId && arraysEqual(existing.atomEntryIds, atom.entryIds)) continue;
    const updated = Object.freeze({ ...existing, atomId: atom.atomId, atomEntryIds: atom.entryIds });
    messageByRef = indexSet(messageByRef, ref, updated).root;
    messageByOrdinal = indexSet(messageByOrdinal, ordinalKey(existing.ordinal), updated).root;
  }
  return { ...internal, messageByRef, messageByOrdinal };
}

type ReplayProcessingResult =
  | { ok: true; internal: SnapshotInternal; diagnostics: readonly string[] }
  | { ok: false; code: BranchIndexFailureCode; diagnostic: string };

function processReplayDecision(
  internal: SnapshotInternal,
  decision: BranchReplayEntryDecision,
  record: IndexedEntryRecord,
  repairPrefixEntries: readonly BranchSessionEntry[],
  counters: BranchIndexCounters,
): ReplayProcessingResult {
  if (decision.kind === "none") return { ok: true, internal, diagnostics: [] };
  if (decision.kind === "unsupported") {
    return { ok: false, code: "replay-unsupported", diagnostic: `${decision.reason}:${record.entryId}` };
  }
  if (decision.kind === "diagnostic") {
    const next = decision.v3
      ? { ...internal, v3Diagnostics: Object.freeze([...internal.v3Diagnostics, decision.v3]) }
      : internal;
    return { ok: true, internal: next, diagnostics: [decision.diagnostic] };
  }
  if (decision.kind === "repair") {
    return applyRepairReplay(internal, decision.entry, record, repairPrefixEntries, counters);
  }
  if (decision.kind === "v3") {
    return applyV3Replay(internal, decision.transaction, record, counters);
  }
  const applied = applyReplayEvent(internal, decision.event, counters);
  return applied.ok
    ? { ok: true, internal: applied.internal, diagnostics: [] }
    : applied;
}

function applyV3Replay(
  internal: SnapshotInternal,
  transaction: V3Transaction,
  record: IndexedEntryRecord,
  counters: BranchIndexCounters,
): ReplayProcessingResult {
  const current = internal.v3State ?? createEmptyV3State({
    sessionId: transaction.header.sessionId,
    branchLeafId: transaction.header.branchLeafId,
    epochId: internal.epochId,
    projectionVersion: transaction.header.projectionVersion,
  });
  const messageOrdinals = transaction.tag === "semantic-create" && transaction.payload.source.kind === "messages"
    ? exactIndexedV3MessageOrdinals(internal, transaction.payload.source.entryIds)
    : undefined;
  const requiresPromotionProof = transaction.tag === "semantic-create"
    && transaction.payload.source.kind === "blocks"
    && transaction.payload.source.transparentGaps !== undefined
    && transaction.payload.source.transparentGaps.length > 0;
  const indexedProof = requiresPromotionProof
    ? ensureIndexedPromotionGapProof(internal, current, transaction, record.rawSlotCountBefore, counters)
    : undefined;
  const replayInternal = indexedProof?.internal ?? internal;
  const expectedCatalogId = indexedV3RuntimeCatalogId(replayInternal, current, record.ordinal);
  counters.hashOps += 1;
  const transition = applyV3Transaction(current, transaction, {
    legacyBlockIds: indexedKeySet(replayInternal.legacyBlockIds),
    expectedCatalogId,
    ...(indexedProof ? {
      promotionGapIndex: indexedProof.index,
      promotionGapRawSlotLimit: record.rawSlotCountBefore,
      onProofRawSlotVisit: () => { counters.proofRawSlotVisits += 1; },
    } : {}),
    ...(messageOrdinals ? { messageOrdinals } : {}),
  });
  if (!transition.ok) {
    const diagnostic: V3ReplayDiagnostic = {
      phase: "apply",
      entryId: record.entryId,
      transactionId: transaction.header.txId,
      code: transition.code,
      path: transition.path,
    };
    return {
      ok: true,
      internal: { ...replayInternal, v3Diagnostics: Object.freeze([...replayInternal.v3Diagnostics, diagnostic]) },
      diagnostics: [formatV3ReplayDiagnostic(diagnostic)],
    };
  }
  const event = replayEventFromV3Transition(current, transition.value.state, transaction);
  const applied = applyReplayEvent(replayInternal, event, counters);
  if (!applied.ok) return applied;
  return {
    ok: true,
    internal: {
      ...applied.internal,
      v3State: transition.value.state,
      ...(indexedProof ? {
        rawGapSourceIdentity: indexedProof.index.projection.identity,
        rawGapSourceSnapshotDigest: indexedProof.index.projection.sourceSnapshotDigest,
        rawGapProofSourceSlots: mergeRawGapProofSourceSlots(
          replayInternal.rawGapProofSourceSlots,
          indexedProof.sourceSlots,
        ),
      } : {}),
    },
    diagnostics: [],
  };
}

function applyRepairReplay(
  internal: SnapshotInternal,
  repair: RepairEntry,
  record: IndexedEntryRecord,
  prefixEntries: readonly BranchSessionEntry[],
  counters: BranchIndexCounters,
): ReplayProcessingResult {
  counters.fullReducerRuns += 1;
  counters.fallbacks += 1;
  const oracle = reduceCompactState(prefixEntries);
  const diagnostics = oracle.diagnostics.slice(internal.legacyDiagnosticCount);
  const base = {
    ...internal,
    legacyDiagnosticCount: oracle.diagnostics.length,
  };
  if (oracle.repairTransactionCount === internal.repairTransactionCount) {
    const prior = indexGet(internal.transactionById, transactionKey("repair", repair.id));
    if (prior && prior.payloadDigest !== digest(repair)) {
      return { ok: false, code: "duplicate-transaction-id", diagnostic: `repair ${repair.id} changed content` };
    }
    return {
      ok: true,
      internal: base,
      diagnostics,
    };
  }
  if (oracle.repairTransactionCount !== internal.repairTransactionCount + 1) {
    return { ok: false, code: "replay-unsupported", diagnostic: `repair oracle count diverged:${record.entryId}` };
  }
  for (const evidence of repair.evidence) {
    const block = oracle.blocks.get(evidence.blockId);
    if (!block?.active || block.queryOnly || block.epochId !== repair.epochId) {
      return { ok: false, code: "invalid-block", diagnostic: `repair oracle did not reactivate ${evidence.blockId}` };
    }
  }
  const applied = applyReplayEvent(base, {
    schema: "repair",
    transactionId: repair.id,
    epochId: repair.epochId,
    kind: "repair",
    payloadDigest: digest(repair),
    reactivateBlockIds: repair.evidence.map((item) => item.blockId),
  }, counters);
  if (!applied.ok) return applied;
  return {
    ok: true,
    internal: { ...applied.internal, repairTransactionCount: oracle.repairTransactionCount },
    diagnostics,
  };
}

/** Builds/reuses the immutable projection only for a transaction that declares a real proof. */
function ensureIndexedPromotionGapProof(
  internal: SnapshotInternal,
  state: V3LifecycleState,
  transaction: V3Transaction,
  rawSlotLimit: number,
  counters: BranchIndexCounters,
): { internal: SnapshotInternal; index: PromotionGapIndexV1; sourceSlots: readonly RawEpochSlotV1[] } {
  const identityMatches = (index: PromotionGapIndexV1 | undefined) => index?.projection.identity.sessionId === state.sessionId
    && index.projection.identity.branchLeafId === state.branchLeafId
    && index.projection.identity.epochId === state.epochId
    && index.projection.identity.revision === state.projectionVersion
    && index.projection.rawSlots.length === internal.rawEpochSlots.length
    && index.rawSlotCoverage === "full";
  const proofSlots = declaredPromotionProofSlots(internal, state, transaction, rawSlotLimit, counters);
  if (identityMatches(internal.rawGapIndex)) return { internal, index: internal.rawGapIndex!, sourceSlots: proofSlots };
  const projection = createTrustedRawEpochProjectionFromPrefixAccessor({
    rawSlotCount: internal.rawEpochSlots.length,
    rawPrefixDigestAt: (ordinal) => persistentSegmentedValueAt(
      internal.rawEpochPrefixDigests,
      ordinal,
    ),
    identity: {
      sessionId: state.sessionId,
      branchLeafId: state.branchLeafId,
      epochId: state.epochId,
      revision: state.projectionVersion,
    },
  });
  const index = new PromotionGapIndexV1(projection, {
    slots: proofSlots,
    rawSlotCoverage: "bounded",
  });
  return { internal, index, sourceSlots: proofSlots };
}

/**
 * Fetches only the endpoint and declared gap slots. The surrounding raw epoch
 * remains immutable shared storage and is never rebuilt during an append.
 */
function declaredPromotionProofSlots(
  internal: SnapshotInternal,
  state: V3LifecycleState,
  transaction: V3Transaction,
  rawSlotLimit: number,
  counters: BranchIndexCounters,
): readonly RawEpochSlotV1[] {
  if (transaction.tag !== "semantic-create" || transaction.payload.source.kind !== "blocks") return [];
  const proofs = transaction.payload.source.transparentGaps ?? [];
  const selected = new Map<number, RawEpochSlotV1>();
  const add = (ordinal: number): boolean => {
    const slot = persistentSegmentedValueAt(internal.rawEpochSlots, ordinal - 1);
    if (!slot || slot.ordinal !== ordinal) return false;
    if (!selected.has(ordinal)) {
      selected.set(ordinal, slot);
      counters.gapIndexBuildRawSlotVisits += 1;
    }
    return true;
  };
  for (const childId of transaction.payload.source.childBlockIds) {
    const child = state.blocks.get(childId);
    if (!child || !add(child.firstLeafOrdinal) || !add(child.lastLeafOrdinal)) return [];
  }
  for (const proof of proofs) {
    if (!Number.isSafeInteger(proof.messageCount)
      || proof.messageCount < 1
      || proof.messageCount > MAX_TRANSPARENT_PROMOTION_GAP_MESSAGES) return [];
    const leftRecord = indexGet(internal.entryById, proof.leftLeafEntryId);
    const rightRecord = indexGet(internal.entryById, proof.rightLeafEntryId);
    const leftOrdinal = leftRecord?.providerOrdinal;
    const rightOrdinal = rightRecord?.providerOrdinal;
    if (leftOrdinal === undefined || rightOrdinal === undefined
      || leftOrdinal > rawSlotLimit || rightOrdinal > rawSlotLimit
      || rightOrdinal - leftOrdinal - 1 !== proof.messageCount) return [];
    for (let ordinal = leftOrdinal; ordinal <= rightOrdinal; ordinal += 1) {
      if (!add(ordinal)) return [];
    }
  }
  return [...selected.values()];
}

function mergeRawGapProofSourceSlots(
  previous: readonly RawEpochSlotV1[] | undefined,
  appended: readonly RawEpochSlotV1[],
): readonly RawEpochSlotV1[] {
  const slots = new Map<number, RawEpochSlotV1>();
  for (const slot of previous ?? []) slots.set(slot.sourceEntryIndex, slot);
  for (const slot of appended) slots.set(slot.sourceEntryIndex, slot);
  return Object.freeze([...slots.values()].sort((left, right) => left.sourceEntryIndex - right.sourceEntryIndex));
}

/** Builds/reuses the full immutable index for one BranchIndex snapshot revision. */
export function getBranchPromotionGapIndex(snapshot: BranchIndexSnapshot): {
  index?: PromotionGapIndexV1;
  counters: BranchIndexCounters;
} {
  const counters = emptyBranchIndexCounters();
  const internal = getInternal(snapshot);
  const state = internal.v3State;
  if (!state) return { counters };
  const identityMatches = (index: PromotionGapIndexV1 | undefined) => index?.projection.identity.sessionId === state.sessionId
    && index.projection.identity.branchLeafId === state.branchLeafId
    && index.projection.identity.epochId === state.epochId
    && index.projection.identity.revision === state.projectionVersion
    && index.projection.rawSlots.length === internal.rawEpochSlots.length
    && index.rawSlotCoverage === "full";
  if (identityMatches(internal.rawGapIndex)) return { index: internal.rawGapIndex, counters };
  counters.gapIndexBuilds = 1;
  const projection = createTrustedRawEpochProjectionFromPrefixAccessor({
    rawSlotCount: internal.rawEpochSlots.length,
    rawPrefixDigestAt: (ordinal) => persistentSegmentedValueAt(internal.rawEpochPrefixDigests, ordinal),
    identity: {
      sessionId: state.sessionId,
      branchLeafId: state.branchLeafId,
      epochId: state.epochId,
      revision: state.projectionVersion,
    },
  });
  const index = new PromotionGapIndexV1(projection, {
    rawSlotCoverage: "full",
    slotAtOrdinal: (ordinal) => persistentSegmentedValueAt(internal.rawEpochSlots, ordinal - 1),
  });
  SNAPSHOT_INTERNALS.set(snapshot, {
    ...internal,
    rawGapIndex: index,
    rawGapSourceIdentity: index.projection.identity,
    rawGapSourceSnapshotDigest: index.projection.sourceSnapshotDigest,
  });
  return { index, counters };
}

/**
 * Revalidates the immutable slots that back accepted promotion proofs. The
 * caller may pass the indexed prefix length while a raw append is pending, so
 * this never allocates a full Session prefix just to verify a continuation.
 */
export function verifyBranchPromotionGapSource(
  snapshot: BranchIndexSnapshot,
  entries: readonly BranchSessionEntry[],
  options: { sourceEntryCount?: number; sourceEntryOffset?: number; onRawSlotVisit?: () => void } = {},
): { checked: boolean; matches: boolean } {
  const internal = getInternal(snapshot);
  const sourceEntryCount = options.sourceEntryCount ?? entries.length;
  const sourceEntryOffset = options.sourceEntryOffset ?? 0;
  if (!Number.isSafeInteger(sourceEntryOffset) || sourceEntryOffset < 0
    || sourceEntryCount !== internal.entryCount || entries.length < sourceEntryOffset + sourceEntryCount) {
    return { checked: true, matches: false };
  }
  // Only accepted proofs are source-freshness obligations. A status candidate
  // has not declared a range yet, so revisiting every possible candidate here
  // would turn an ordinary append into an unbounded historical raw read.
  const sourceSlots = internal.rawGapProofSourceSlots ?? [];
  if (sourceSlots.length > 0) {
    try {
      return {
        checked: true,
        matches: sourceSlots.every((slot) => {
          options.onRawSlotVisit?.();
          const entry = entries[sourceEntryOffset + slot.sourceEntryIndex];
          if (!entry || entry.type !== "message" || entry.id !== slot.entryId) return false;
          const current = createRawEpochSlot(entry, slot.ordinal, slot.sourceEntryIndex);
          return current.bodyDigest === slot.bodyDigest
            && current.cloneable === slot.cloneable
            && current.isRecordBody === slot.isRecordBody;
        }),
      };
    } catch {
      return { checked: true, matches: false };
    }
  }
  const index = internal.rawGapIndex;
  const identity = index?.rawSlotCoverage === "full"
    ? index.projection.identity
    : internal.rawGapSourceIdentity;
  const expectedDigest = index?.rawSlotCoverage === "full"
    ? index.projection.sourceSnapshotDigest
    : internal.rawGapSourceSnapshotDigest;
  if (!identity || !expectedDigest) return { checked: false, matches: false };
  // The source snapshot advances from immutable appended slots. Without a
  // declared proof there is no promotion-relevant Session body to revisit; a
  // full raw-epoch clone here would turn every healthy continuation into O(N).
  return { checked: false, matches: false };
}

function rawEpochSourceSnapshotDigest(
  rawEpochSlots: PersistentSegmentedValues<RawEpochSlotV1>,
  rawEpochPrefixDigests: PersistentSegmentedValues<string>,
  identity: PromotionGapIndexV1["projection"]["identity"],
): string | undefined {
  const projection = createTrustedRawEpochProjectionFromPrefixAccessor({
    rawSlotCount: rawEpochSlots.length,
    rawPrefixDigestAt: (ordinal) => persistentSegmentedValueAt(rawEpochPrefixDigests, ordinal),
    identity,
  });
  return projection.valid ? projection.sourceSnapshotDigest : undefined;
}

/** Cheap guard for callers that must avoid touching Session entries unless proof freshness is required. */
export function branchPromotionGapSourceRequired(snapshot: BranchIndexSnapshot): boolean {
  const internal = getInternal(snapshot);
  return internal.rawGapProofSourceSlots !== undefined
    || internal.rawGapSourceIdentity !== undefined && internal.rawGapSourceSnapshotDigest !== undefined;
}

function exactIndexedV3MessageOrdinals(
  internal: SnapshotInternal,
  selectedEntryIds: readonly string[],
): ReadonlyMap<string, number> {
  const selected = new Set(selectedEntryIds);
  if (selected.size !== selectedEntryIds.length) return new Map();
  const touchedAtoms = new Map<string, BranchProtocolAtom>();
  const ordinals = new Map<string, number>();
  for (const entryId of selectedEntryIds) {
    const atom = indexGet(internal.atomByEntryId, entryId);
    const record = indexGet(internal.entryById, entryId);
    if (!atom || atom.hardProtected || record?.providerOrdinal === undefined) return new Map();
    touchedAtoms.set(atom.atomId, atom);
    ordinals.set(entryId, record.providerOrdinal);
  }
  if ([...touchedAtoms.values()].some((atom) => atom.entryIds.some((entryId) => !selected.has(entryId)))) return new Map();
  return ordinals;
}

/**
 * Rebuilds the public, caller-visible catalog identity from persistent index
 * roots at the exact pre-transaction boundary. Cold builds index the complete
 * branch before replay, so both message atoms and refs are clipped to records
 * strictly before the transaction being validated.
 */
function indexedV3RuntimeCatalogId(
  internal: SnapshotInternal,
  state: V3LifecycleState,
  transactionOrdinal: number,
): string {
  const epochStartOrdinal = indexedEpochStartOrdinal(internal);
  const messages: RuntimeCatalogMessageIdentity[] = [];
  for (let ordinal = 1; ordinal <= internal.messageRefCount; ordinal += 1) {
    const indexed = indexGet(internal.messageByOrdinal, ordinalKey(ordinal));
    if (!indexed) continue;
    const source = indexGet(internal.entryById, indexed.entryId);
    if (!source || source.ordinal < epochStartOrdinal) continue;
    if (source.ordinal >= transactionOrdinal) break;
    const atomEntryIds = indexed.atomEntryIds.filter((entryId) => {
      const member = indexGet(internal.entryById, entryId);
      return member !== undefined
        && member.ordinal >= epochStartOrdinal
        && member.ordinal < transactionOrdinal;
    });
    messages.push({
      ref: formatRef("m", messages.length + 1),
      entryId: indexed.entryId,
      atomEntryIds,
    });
  }

  const blocks: RuntimeCatalogBlockIdentity[] = [];
  const appendBlock = (
    blockId: string,
    family: RuntimeCatalogBlockIdentity["family"],
    active: boolean,
    queryOnly: boolean,
  ) => {
    blocks.push({
      ref: formatRef("b", blocks.length + 1),
      blockId,
      family,
      active,
      queryOnly,
    });
  };
  type IndexedRuntimeCatalogBlock = Omit<RuntimeCatalogBlockIdentity, "ref"> & RuntimeCatalogBlockOrderMetadata;
  const verifiedOrdinal = (value: number | undefined): number | undefined => (
    Number.isSafeInteger(value) && value! > 0 ? value : undefined
  );
  const v3Blocks: IndexedRuntimeCatalogBlock[] = [...state.blocks.values()]
    .filter((block) => block.epochId === state.epochId)
    .map((block) => {
      const firstLeafOrdinal = verifiedOrdinal(block.firstLeafOrdinal);
      return {
        blockId: block.blockId,
        family: "v3" as const,
        active: block.active && !block.queryOnly,
        queryOnly: block.queryOnly,
        ...(firstLeafOrdinal === undefined ? {} : { firstLeafOrdinal }),
        createdAt: block.createdAt,
      };
    });

  const legacyBlockIds: string[] = [];
  forEachList(internal.blockIdTail, (blockId) => {
    const block = indexGet(internal.blockById, blockId);
    if (block?.schema === "legacy" && block.epochId === state.epochId) legacyBlockIds.push(blockId);
  });
  const legacyBlocks: IndexedRuntimeCatalogBlock[] = [];
  let legacyOrdinal = 0;
  for (const blockId of legacyBlockIds.reverse()) {
    const block = indexGet(internal.blockById, blockId);
    if (!block) continue;
    const source = block.sourceEntryIds[0]
      ? indexGet(internal.entryById, block.sourceEntryIds[0])
      : undefined;
    const firstLeafOrdinal = verifiedOrdinal(source?.providerOrdinal);
    legacyBlocks.push({
      blockId: block.blockId,
      family: "legacy",
      active: block.active && !block.queryOnly,
      queryOnly: block.queryOnly,
      ...(firstLeafOrdinal === undefined ? {} : { firstLeafOrdinal }),
      legacyOrdinal: ++legacyOrdinal,
    });
  }
  for (const block of orderRuntimeCatalogBlocksBySemanticSource([...v3Blocks, ...legacyBlocks])) {
    appendBlock(block.blockId, block.family, block.active, block.queryOnly);
  }

  return deriveRuntimeCatalogId({
    stateCatalogId: state.catalogId,
    epochId: state.epochId,
    messages,
    blocks,
  });
}

function indexedEpochStartOrdinal(internal: SnapshotInternal): number {
  if (internal.epochId === "root") return 1;
  const boundary = indexGet(internal.entryById, internal.epochId);
  // Production epoch snapshots contain only the post-checkpoint tail; in that
  // scope ordinal one is already the first current-epoch entry. Full-snapshot
  // callers may still retain the explicit boundary record.
  return boundary?.entry.type === "compaction" ? boundary.ordinal + 1 : 1;
}

function replayEventFromV3Transition(
  previous: V3LifecycleState,
  next: V3LifecycleState,
  transaction: V3Transaction,
): BranchReplayEvent {
  const blocks = [...next.blocks.values()]
    .filter((block) => !previous.blocks.has(block.blockId))
    .map(replayBlockFromV3Block);
  const previousParents = activeV3ParentIds(previous);
  const nextParents = activeV3ParentIds(next);
  const blockUpdates: BranchReplayBlockUpdate[] = [];
  for (const block of next.blocks.values()) {
    const prior = previous.blocks.get(block.blockId);
    const priorParent = previousParents.get(block.blockId);
    const nextParent = nextParents.get(block.blockId);
    if (!prior || prior.active !== block.active || prior.queryOnly !== block.queryOnly || priorParent !== nextParent) {
      blockUpdates.push({
        blockId: block.blockId,
        active: block.active,
        queryOnly: block.queryOnly,
        parentBlockId: nextParent ?? null,
      });
    }
  }
  return {
    schema: "v3",
    transactionId: transaction.header.txId,
    epochId: transaction.header.epochId,
    kind: transaction.tag,
    payloadDigest: digest(transaction),
    ...(blocks.length > 0 ? { blocks } : {}),
    ...(blockUpdates.length > 0 ? { blockUpdates } : {}),
  };
}

function replayBlockFromV3Block(block: V3SemanticBlock): BranchReplayBlockInput {
  return {
    schema: "v3",
    blockId: block.blockId,
    epochId: block.epochId,
    kind: "semantic",
    tier: block.tier,
    projectionVersion: block.projectionVersion,
    active: block.active,
    queryOnly: block.queryOnly,
    sourceEntryIds: block.source.kind === "messages" ? block.source.entryIds : [],
    childBlockIds: block.source.kind === "blocks" ? block.source.childBlockIds : [],
    sourceDigest: block.leafDigest,
    summaryDigest: block.summaryDigest,
    leafCount: block.leafCount,
    leafDigest: block.leafDigest,
    coverageStartOrdinal: block.firstLeafOrdinal,
    coverageEndOrdinal: block.lastLeafOrdinal,
    payloadDigest: digest(block),
  };
}

function activeV3ParentIds(state: V3LifecycleState): ReadonlyMap<string, string> {
  const parents = new Map<string, string>();
  for (const parent of state.blocks.values()) {
    if (!parent.active || parent.source.kind !== "blocks") continue;
    for (const childId of parent.source.childBlockIds) parents.set(childId, parent.blockId);
  }
  return parents;
}

function entriesThroughOrdinal(
  internal: SnapshotInternal,
  ordinal: number,
  counters?: BranchIndexCounters,
): BranchSessionEntry[] {
  const segments: EntrySegment[] = [];
  for (let segment = internal.entryTail; segment; segment = segment.previous) segments.push(segment);
  const entries: BranchSessionEntry[] = [];
  for (const segment of segments.reverse()) {
    for (const record of segment.records) {
      if (counters) counters.preTipEntryVisits += 1;
      if (record.ordinal <= ordinal) entries.push(record.entry);
    }
  }
  return entries;
}

function applyReplayEvent(
  internal: SnapshotInternal,
  event: BranchReplayEvent,
  counters: BranchIndexCounters,
): { ok: true; internal: SnapshotInternal } | { ok: false; code: BranchIndexFailureCode; diagnostic: string } {
  if (!event.transactionId || !event.payloadDigest) {
    return { ok: false, code: "invalid-block", diagnostic: "transaction identity/digest is missing" };
  }
  if (event.epochId !== currentEpoch(internal)) {
    return { ok: false, code: "wrong-epoch", diagnostic: `transaction ${event.transactionId} has wrong epoch` };
  }
  const schema = event.schema ?? "legacy";
  const eventTransactionKey = transactionKey(schema, event.transactionId);
  if (indexGet(internal.transactionById, eventTransactionKey)) {
    return { ok: false, code: "duplicate-transaction-id", diagnostic: `duplicate transaction ${event.transactionId}` };
  }

  let blockById = internal.blockById;
  let blockIdTail = internal.blockIdTail;
  let blockByRef = internal.blockByRef;
  let blockRefById = internal.blockRefById;
  let blockByOrdinal = internal.blockByOrdinal;
  let legacyBlockIds = internal.legacyBlockIds;
  let blockCount = internal.blockCount;
  let blockRefCount = internal.blockRefCount;
  const pendingIds = new Set<string>();
  for (const input of event.blocks ?? []) {
    counters.blockVisits += 1;
    if (!input.blockId || input.epochId !== event.epochId || pendingIds.has(input.blockId) || indexGet(blockById, input.blockId)) {
      return { ok: false, code: "invalid-block", diagnostic: `invalid or duplicate block ${input.blockId}` };
    }
    pendingIds.add(input.blockId);
  }
  for (const input of event.blocks ?? []) {
    const converted = convertReplayBlock(input, internal.entryById, blockById);
    counters.blockVisits += converted.visits;
    if (!converted.block) return { ok: false, code: "invalid-block", diagnostic: converted.diagnostic! };
    blockById = indexSet(blockById, converted.block.blockId, converted.block).root;
    blockIdTail = { previous: blockIdTail, value: converted.block.blockId };
    blockCount += 1;
    blockRefCount += 1;
    const ref = formatRef("b", blockRefCount);
    const refValue = blockReference(converted.block, ref, blockRefCount);
    blockByRef = indexSet(blockByRef, ref, refValue).root;
    blockRefById = indexSet(blockRefById, converted.block.blockId, ref).root;
    blockByOrdinal = indexSet(blockByOrdinal, ordinalKey(blockRefCount), refValue).root;
    if ((input.schema ?? schema) === "legacy") legacyBlockIds = indexSet(legacyBlockIds, converted.block.blockId, true).root;
    counters.hashOps += 1;
  }

  const updates = new Map<string, { active?: boolean; queryOnly?: boolean; parentBlockId?: string | null }>();
  for (const id of event.deactivateBlockIds ?? []) updates.set(id, { ...(updates.get(id) ?? {}), active: false });
  for (const id of event.reactivateBlockIds ?? []) updates.set(id, { ...(updates.get(id) ?? {}), active: true });
  for (const update of event.lifecycleUpdates ?? []) {
    updates.set(update.blockId, {
      ...(updates.get(update.blockId) ?? {}),
      ...(update.active === undefined ? {} : { active: update.active }),
    });
  }
  for (const update of event.blockUpdates ?? []) {
    updates.set(update.blockId, {
      ...(updates.get(update.blockId) ?? {}),
      ...(update.active === undefined ? {} : { active: update.active }),
      ...(update.queryOnly === undefined ? {} : { queryOnly: update.queryOnly }),
      ...(update.parentBlockId === undefined ? {} : { parentBlockId: update.parentBlockId }),
    });
  }
  if (event.deactivateAll) {
    forEachList(blockIdTail, (id) => updates.set(id, { ...(updates.get(id) ?? {}), active: false }));
  }
  for (const input of event.blocks ?? []) {
    for (const childId of input.childBlockIds ?? []) {
      if (childId === input.blockId) return { ok: false, code: "impossible-lineage", diagnostic: `self cycle ${childId}` };
      const child = indexGet(blockById, childId);
      if (!child || child.parentBlockId) {
        return { ok: false, code: "impossible-lineage", diagnostic: `child ${childId} has invalid parentage` };
      }
      updates.set(childId, { ...(updates.get(childId) ?? {}), parentBlockId: input.blockId });
    }
  }
  for (const [blockId, update] of updates) {
    const block = indexGet(blockById, blockId);
    counters.blockVisits += 1;
    if (!block) return { ok: false, code: "invalid-block", diagnostic: `unknown block ${blockId}` };
    const changedWithParent = { ...block, ...update };
    const changed = Object.freeze(update.parentBlockId === null
      ? (({ parentBlockId: _parent, ...withoutParent }) => withoutParent)(changedWithParent)
      : changedWithParent) as BranchIndexedBlock;
    blockById = indexSet(blockById, blockId, changed).root;
    const ref = indexGet(blockRefById, blockId);
    if (ref) {
      const existingRef = indexGet(blockByRef, ref)!;
      const changedRef = Object.freeze({
        ...existingRef,
        active: changed.active && !changed.queryOnly,
        queryOnly: changed.queryOnly,
      });
      blockByRef = indexSet(blockByRef, ref, changedRef).root;
      blockByOrdinal = indexSet(blockByOrdinal, ordinalKey(existingRef.ordinal), changedRef).root;
    }
  }
  const transaction: BranchIndexedTransaction = Object.freeze({
    schema,
    transactionId: event.transactionId,
    epochId: event.epochId,
    kind: event.kind,
    payloadDigest: event.payloadDigest,
    blockIds: Object.freeze((event.blocks ?? []).map((block) => block.blockId)),
  });
  const transactionById = indexSet(internal.transactionById, eventTransactionKey, transaction).root;
  const replayChainDigest = digest({ previous: internal.replayChainDigest, event });
  counters.hashOps += 1;
  return {
    ok: true,
    internal: {
      ...internal,
      transactionById,
      blockById,
      legacyBlockIds,
      blockIdTail,
      blockByRef,
      blockRefById,
      blockByOrdinal,
      transactionCount: internal.transactionCount + 1,
      blockCount,
      blockRefCount,
      replayChainDigest,
    },
  };
}

function convertReplayBlock(
  input: BranchReplayBlockInput,
  entryById: IndexNode<IndexedEntryRecord> | undefined,
  blockById: IndexNode<BranchIndexedBlock> | undefined,
): { block?: BranchIndexedBlock; diagnostic?: string; visits: number } {
  const sourceEntryIds = [...(input.sourceEntryIds ?? [])];
  const childBlockIds = [...(input.childBlockIds ?? [])];
  if (new Set(sourceEntryIds).size !== sourceEntryIds.length || new Set(childBlockIds).size !== childBlockIds.length) {
    return { diagnostic: `duplicate coverage in block ${input.blockId}`, visits: 0 };
  }
  const ordinals: number[] = [];
  let visits = 0;
  for (const entryId of sourceEntryIds) {
    const record = indexGet(entryById, entryId);
    if (!record || record.epochId !== input.epochId) return { diagnostic: `unknown source ${entryId}`, visits };
    const ordinal = input.schema === "v3" ? record.providerOrdinal : record.ordinal;
    if (ordinal === undefined) return { diagnostic: `source ${entryId} has no provider ordinal`, visits };
    ordinals.push(ordinal);
  }
  for (const childId of childBlockIds) {
    const child = indexGet(blockById, childId);
    visits += 1;
    if (!child || child.epochId !== input.epochId) return { diagnostic: `unknown child ${childId}`, visits };
    if (child.coverageStartOrdinal !== undefined) ordinals.push(child.coverageStartOrdinal);
    if (child.coverageEndOrdinal !== undefined) ordinals.push(child.coverageEndOrdinal);
  }
  const derivedStart = ordinals.length > 0 ? Math.min(...ordinals) : undefined;
  const derivedEnd = ordinals.length > 0 ? Math.max(...ordinals) : undefined;
  const hasExplicitCoverage = input.coverageStartOrdinal !== undefined || input.coverageEndOrdinal !== undefined;
  if (hasExplicitCoverage && (!Number.isSafeInteger(input.coverageStartOrdinal)
    || !Number.isSafeInteger(input.coverageEndOrdinal)
    || input.coverageStartOrdinal! < 1
    || input.coverageStartOrdinal! > input.coverageEndOrdinal!
    || (derivedStart !== undefined && derivedStart !== input.coverageStartOrdinal)
    || (derivedEnd !== undefined && derivedEnd !== input.coverageEndOrdinal))) {
    return { diagnostic: `invalid explicit coverage in block ${input.blockId}`, visits };
  }
  const coverageStartOrdinal = input.coverageStartOrdinal ?? derivedStart;
  const coverageEndOrdinal = input.coverageEndOrdinal ?? derivedEnd;
  return {
    visits,
    block: Object.freeze({
      schema: input.schema ?? "legacy",
      blockId: input.blockId,
      epochId: input.epochId,
      kind: input.kind,
      active: input.active,
      queryOnly: input.queryOnly === true,
      sourceEntryIds: Object.freeze(sourceEntryIds),
      childBlockIds: Object.freeze(childBlockIds),
      ...(coverageStartOrdinal === undefined ? {} : { coverageStartOrdinal }),
      ...(coverageEndOrdinal === undefined ? {} : { coverageEndOrdinal }),
      sourceDigest: input.sourceDigest,
      summaryDigest: input.summaryDigest,
      payloadDigest: input.payloadDigest,
      ...(input.tier === undefined ? {} : { tier: input.tier }),
      ...(input.projectionVersion === undefined ? {} : { projectionVersion: input.projectionVersion }),
      ...(input.leafCount === undefined ? {} : { leafCount: input.leafCount }),
      ...(input.leafDigest === undefined ? {} : { leafDigest: input.leafDigest }),
    }),
  };
}

function replayEventFromCompactTransaction(transaction: CompactTransaction): BranchReplayEvent {
  return {
    schema: "legacy",
    transactionId: transaction.id,
    epochId: transaction.epochId,
    kind: transaction.kind,
    payloadDigest: digest(transaction),
    blocks: (transaction.blocks ?? []).map(replayBlockFromCompactBlock),
    ...(transaction.deactivateBlockIds ? { deactivateBlockIds: transaction.deactivateBlockIds } : {}),
    ...(transaction.reactivateBlockIds ? { reactivateBlockIds: transaction.reactivateBlockIds } : {}),
    ...(transaction.lifecycleUpdates ? { lifecycleUpdates: transaction.lifecycleUpdates } : {}),
    ...(transaction.control === "restore-all" ? { deactivateAll: true } : {}),
  };
}

function replayBlockFromCompactBlock(block: CompactBlock): BranchReplayBlockInput {
  return {
    schema: "legacy",
    blockId: block.id,
    epochId: block.epochId,
    kind: block.kind,
    active: block.active,
    queryOnly: block.queryOnly,
    sourceEntryIds: block.sourceEntryIds,
    childBlockIds: block.childBlockIds,
    sourceDigest: block.sourceDigest,
    summaryDigest: digest(block.summary),
    payloadDigest: digest(block),
  };
}

function makeSnapshot(
  key: BranchIndexKey,
  internal: SnapshotInternal,
  sourceEntryIdDigest: string,
  derivedVersions: BranchDerivedVersions,
  derivedValidity: BranchDerivedValidity,
  diagnostics: readonly string[],
  revision: number,
): BranchIndexSnapshot {
  const tip = internal.entryCount > 0 ? indexGet(internal.entryByOrdinal, ordinalKey(internal.entryCount)) : undefined;
  const catalogId = digest({
    epochId: key.epochId,
    messages: internal.messageCatalogDigest,
    replay: internal.replayChainDigest,
  });
  const canonicalStateDigest = digest({
    version: BRANCH_INDEX_VERSION,
    key,
    source: internal.entryChainDigest,
    protocol: internal.protocolChainDigest,
    replay: internal.replayChainDigest,
    catalogId,
  });
  const derivedDigest = digest({
    versions: derivedVersions,
    validity: derivedValidity,
    tokenEstimates: internal.tokenEstimateDigest,
  });
  const catalogRefs = internal.messageRefCount + internal.blockRefCount;
  const retainedRecords = 6 * internal.entryCount
    + 3 * internal.atomMembershipEdges
    + 5 * internal.blockCount
    + 2 * catalogRefs;
  const retainedRecordLimit = 6 * internal.entryCount
    + 3 * internal.atomMembershipEdges
    + 8 * internal.blockCount
    + 2 * catalogRefs;
  return new BranchIndexSnapshot({
    key,
    revision,
    sourceDigest: internal.entryChainDigest,
    sourceEntryIdDigest,
    protocolDigest: internal.protocolChainDigest,
    replayDigest: internal.replayChainDigest,
    catalogId,
    canonicalStateDigest,
    derivedDigest,
    tipEntryId: tip?.entryId,
    diagnostics,
    derivedVersions,
    derivedValidity,
    stats: {
      entries: internal.entryCount,
      atoms: internal.atomCount,
      atomMembershipEdges: internal.atomMembershipEdges,
      transactions: internal.transactionCount,
      blocks: internal.blockCount,
      messageRefs: internal.messageRefCount,
      blockRefs: internal.blockRefCount,
      catalogRefs,
      retainedRecords,
      retainedRecordLimit,
    },
  }, internal);
}

function makeEntryRecord(
  entry: BranchSessionEntry,
  parentId: string | undefined,
  ordinal: number,
  epochId: string,
  previousDigest: string,
  rawSlotCountBefore: number,
  providerOrdinal?: number,
): IndexedEntryRecord {
  const payloadDigest = entryPayloadDigest(entry);
  const tuple = { entryId: entry.id, parentId, entryKind: entryKind(entry), payloadDigest };
  return Object.freeze({
    entryId: entry.id,
    ...(parentId === undefined ? {} : { parentId }),
    ...(providerOrdinal === undefined ? {} : { providerOrdinal }),
    rawSlotCountBefore,
    entryKind: tuple.entryKind,
    ordinal,
    epochId,
    payloadDigest,
    alignmentFingerprint: alignmentFingerprint(entry),
    ancestryDigest: digest({ previous: previousDigest, tuple }),
    serializedUtf8Bytes: Buffer.byteLength(canonicalJson(entry.message ?? entry.data ?? entry.content), "utf8"),
    entry,
    protocolEntry: protocolSurfaceEntryFromSource(entry),
  });
}

function convertAtom(
  atom: ProtocolAtom,
  entryById: IndexNode<IndexedEntryRecord> | undefined,
  ordinal: number,
): BranchProtocolAtom | undefined {
  const records = atom.entryIds.map((id) => indexGet(entryById, id));
  if (records.some((record) => !record)) return undefined;
  const known = records as IndexedEntryRecord[];
  const sourceDigest = digest(known.map((record) => ({ entryId: record.entryId, payloadDigest: record.payloadDigest })));
  return Object.freeze({
    atomId: `a${String(ordinal).padStart(6, "0")}`,
    ordinal,
    kind: atom.kind,
    entryIds: Object.freeze([...atom.entryIds]),
    startEntryOrdinal: known[0]!.ordinal,
    endEntryOrdinal: known.at(-1)!.ordinal,
    toolCallIds: Object.freeze([...atom.toolCallIds]),
    hardProtected: atom.hardProtected,
    protectionReasons: Object.freeze([...atom.protectionReasons]),
    turnState: atom.turnState,
    messageCount: atom.messageCount,
    structuredToolPartCount: atom.structuredToolPartCount,
    utf8Bytes: atom.utf8Bytes,
    surfaceSaturated: atom.surfaceSaturated,
    roles: Object.freeze([...atom.roles]),
    containsUser: atom.containsUser,
    containsAssistant: atom.containsAssistant,
    serializedUtf8Bytes: known.reduce((sum, record) => sum + record.serializedUtf8Bytes, 0),
    sourceDigest,
  });
}

function appendAtomNode(previous: AtomNode | undefined, atom: BranchProtocolAtom, seed: string): AtomNode {
  return Object.freeze({
    previous,
    atom,
    chainDigest: digest({ previous: previous?.chainDigest ?? seed, atom }),
  });
}

function sameAtomShape(previous: BranchProtocolAtom, next: ProtocolAtom): boolean {
  return previous.kind === next.kind
    && arraysEqual(previous.entryIds, next.entryIds)
    && arraysEqual(previous.toolCallIds, next.toolCallIds)
    && arraysEqual(previous.protectionReasons, next.protectionReasons)
    && previous.turnState === next.turnState;
}

function protocolSurfaceEntry(record: IndexedEntryRecord): BranchSessionEntry {
  return record.protocolEntry;
}

function protocolSurfaceEntryFromSource(entry: BranchSessionEntry): BranchSessionEntry {
  return {
    id: entry.id,
    type: entry.type,
    ...(entry.type === "message" ? { message: protocolMessageSurface(entry.message) } : {}),
  };
}

function protocolMessageSurface(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const result: Record<string, unknown> = {};
  if (typeof value.role === "string") result.role = value.role;
  if (value.toolCalls !== undefined) {
    result.toolCalls = Array.isArray(value.toolCalls) ? value.toolCalls.map(protocolCallSurface) : null;
  }
  if (typeof value.toolCallId === "string") result.toolCallId = value.toolCallId;
  if (typeof value.toolName === "string") result.toolName = value.toolName;
  if (Array.isArray(value.content)) {
    result.content = value.content.map((part) => {
      if (!isRecord(part)) return { type: "binary" };
      if (part.type === "toolCall") return { type: "toolCall", ...protocolCallSurface(part) as object };
      if (part.type === "text") return { type: "text", text: "" };
      return { type: typeof part.type === "string" ? part.type : "binary" };
    });
  } else {
    result.content = typeof value.content === "string" || value.content === undefined ? "" : { type: "binary" };
  }
  return result;
}

function protocolCallSurface(value: unknown): unknown {
  if (!isRecord(value)) return null;
  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    arguments: {},
  };
}

function entryPayloadDigest(entry: BranchSessionEntry): string {
  return digest({
    type: entry.type,
    customType: entry.customType,
    message: entry.message,
    data: entry.data,
    content: entry.content,
    details: entry.details,
  });
}

function validateVerifiedV3ReplaySeed(
  seed: VerifiedV3ReplaySeedV1,
  key: BranchIndexKey,
  sourcePrefix: readonly BranchSessionEntry[] | undefined,
  counters: BranchIndexCounters,
): V3LifecycleReplay | string {
  counters.seedValidationRuns += 1;
  if (!seed || seed.version !== VERIFIED_V3_REPLAY_SEED_VERSION
    || typeof seed.sourcePrefixDigest !== "string"
    || !/^[0-9a-f]{64}$/.test(seed.sourcePrefixDigest)
    || typeof seed.replayDigest !== "string"
    || !/^[0-9a-f]{64}$/.test(seed.replayDigest)
    || typeof seed.projectionVersion !== "string"
    || typeof seed.replayVersion !== "string"
    || seed.replayVersion !== key.replayVersion
    || !seed.epochBoundary
    || !seed.replay) return "v3 replay seed has an invalid closed shape";
  if (!sourcePrefix) return "v3 replay seed source prefix is required";
  try {
    counters.seedValidationEntryVisits += sourcePrefix.length;
    if (seed.sourcePrefixDigest !== v3ReplaySeedSourcePrefixDigest(sourcePrefix)) {
      return "v3 replay seed source prefix digest does not match";
    }
    counters.seedReplayRuns += 1;
    const trustedReplay = reduceV3LifecycleState(sourcePrefix);
    if (seed.replayDigest !== v3ReplayDigest(trustedReplay)) {
      return "v3 replay seed state does not match its source prefix";
    }
    const boundary = sourcePrefix.at(-1);
    const boundaryIdentity = seed.epochBoundary;
    if (!boundary || boundary.type !== "compaction"
      || boundary.id !== key.epochId
      || boundaryIdentity.entryId !== boundary.id
      || boundaryIdentity.parentId !== (boundary.parentId ?? null)
      || boundaryIdentity.entryKind !== entryKind(boundary)
      || boundaryIdentity.payloadDigest !== entryPayloadDigest(boundary)
      || boundaryIdentity.sourcePrefixLength !== sourcePrefix.length
      || boundaryIdentity.sessionId !== key.sessionId
      || boundaryIdentity.canonicalSessionPathDigest !== key.canonicalSessionPathDigest) {
      return "v3 replay seed epoch boundary does not match";
    }
    const state = seed.replay.state;
    if (state) {
      if (!(state.blocks instanceof Map) || !(state.transactions instanceof Map)) {
        return "v3 replay seed state does not match its boundary";
      }
      const stateValidation = validateV3LifecycleState(state);
      if (!stateValidation.ok
        || state.epochId !== key.epochId
        || state.sessionId !== key.sessionId
        || state.projectionVersion !== seed.projectionVersion
        || state.branchLeafId !== boundaryIdentity.branchLeafId
        || seed.replay.acceptedTransactionCount !== state.transactions.size) {
        return "v3 replay seed state does not match its boundary";
      }
    } else if (seed.projectionVersion !== "none"
      || boundaryIdentity.branchLeafId !== undefined
      || seed.replay.acceptedTransactionCount !== 0) {
      return "v3 replay seed empty state is inconsistent";
    }
    if (!Array.isArray(seed.replay.maximalActiveBlocks)
      || !Array.isArray(seed.replay.archivedQueryOnlyBlocks)
      || !Array.isArray(seed.replay.diagnostics)
      || seed.replayDigest !== v3ReplayDigest(seed.replay)) {
      return "v3 replay seed replay digest does not match";
    }
    return trustedReplay;
  } catch {
    return "v3 replay seed has an invalid closed shape";
  }
}

function v3ReplaySeedSourcePrefixDigest(entries: readonly BranchSessionEntry[]): string {
  return digest({
    version: VERIFIED_V3_REPLAY_SEED_VERSION,
    entries: entries.map((entry) => ({
      entryId: entry.id,
      parentId: entry.parentId ?? null,
      entryKind: entryKind(entry),
      payloadDigest: entryPayloadDigest(entry),
    })),
  });
}

function v3ReplayDigest(replay: V3LifecycleReplay): string {
  return digest({
    state: replay.state ? {
      sessionId: replay.state.sessionId,
      branchLeafId: replay.state.branchLeafId,
      epochId: replay.state.epochId,
      catalogId: replay.state.catalogId,
      projectionVersion: replay.state.projectionVersion,
      blocks: [...replay.state.blocks.entries()].sort(([left], [right]) => left.localeCompare(right)),
      transactions: [...replay.state.transactions.entries()].sort(([left], [right]) => left.localeCompare(right)),
      cooling: replay.state.cooling,
      controls: replay.state.controls,
    } : null,
    maximalActiveBlockIds: replay.maximalActiveBlocks.map((block) => block.blockId),
    archivedQueryOnlyBlockIds: replay.archivedQueryOnlyBlocks.map((block) => block.blockId),
    acceptedTransactionCount: replay.acceptedTransactionCount,
    diagnostics: replay.diagnostics,
  });
}

function alignmentFingerprint(entry: BranchSessionEntry): string {
  if (entry.type !== "message" || !isRecord(entry.message)) {
    return digest({ type: entry.type, customType: entry.customType, data: stripDisplayOnly(entry.data) });
  }
  return alignmentFingerprintForMessage(entry.message);
}

function alignmentFingerprintForMessage(message: Record<string, unknown>): string {
  return digest(stripDisplayOnly({
    role: message.role,
    content: message.content,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    toolCalls: message.toolCalls,
    isError: message.isError,
    customType: message.customType,
  }));
}

function safeAlignmentId(value: string): string {
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : digest(value).slice(0, 16);
}

function stripDisplayOnly(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDisplayOnly);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "timestamp" && key !== "display" && key !== "displayOnly")
    .map(([key, nested]) => [key, stripDisplayOnly(nested)]));
}

function isReferenceEligible(entry: BranchSessionEntry): boolean {
  if (entry.type !== "message" || !isRecord(entry.message)) return false;
  if (typeof entry.message.toolName === "string" && normalizeTool(entry.message.toolName).startsWith("aili_")) return false;
  const calls = [
    ...(Array.isArray(entry.message.toolCalls) ? entry.message.toolCalls : []),
    ...(Array.isArray(entry.message.content) ? entry.message.content.filter((part) => isRecord(part) && part.type === "toolCall") : []),
  ];
  return !calls.some((call) => isRecord(call) && typeof call.name === "string" && normalizeTool(call.name).startsWith("aili_"));
}

function blockReference(block: BranchIndexedBlock, ref: string, ordinal: number): BranchBlockReference {
  return Object.freeze({
    ref,
    blockId: block.blockId,
    epochId: block.epochId,
    ordinal,
    active: block.active && !block.queryOnly,
    queryOnly: block.queryOnly,
  });
}

function transactionKey(schema: "legacy" | "repair" | "v3", transactionId: string): string {
  return `${schema}\u0000${transactionId}`;
}

function indexedKeySet(root: IndexNode<true> | undefined): ReadonlySet<string> {
  // applyV3Transaction consumes only ReadonlySet.has for the legacy-child
  // guard. Keep this as an indexed lookup so a healthy v3 append never scans
  // all legacy blocks.
  return {
    has(value: string) {
      return indexGet(root, value) === true;
    },
  } as ReadonlySet<string>;
}

function formatV3ReplayDiagnostic(value: V3ReplayDiagnostic): string {
  return [
    `v3-${value.phase}`,
    value.code,
    value.path,
    value.entryId,
    value.transactionId,
  ].filter((item) => item !== undefined).join(":");
}

function isProviderMessageEntry(entry: BranchSessionEntry): boolean {
  // Raw epoch ordinal is assigned before body validation. Public references
  // remain stricter in isReferenceEligible().
  return entry.type === "message";
}

function currentEpoch(internal: SnapshotInternal): string {
  return internal.epochId;
}

function allDerivedValid(): BranchDerivedValidity {
  return { tokenEstimates: true, calibration: true, projection: true, quality: true, protection: true, catalog: true };
}

function ancestrySeedFor(key: BranchIndexKey): string {
  return digest({
    version: "aili.branch-ancestry.v1",
    sessionId: key.sessionId,
    canonicalSessionPathDigest: key.canonicalSessionPathDigest,
    epochId: key.epochId,
    replayVersion: key.replayVersion,
  });
}

function protocolSeedFor(key: BranchIndexKey): string {
  return digest({ version: "aili.branch-protocol.v1", scope: ancestrySeedFor(key) });
}

function replaySeedFor(key: BranchIndexKey): string {
  return digest({ version: "aili.branch-replay.v1", scope: ancestrySeedFor(key) });
}

function messageCatalogSeedFor(key: BranchIndexKey): string {
  return digest({ version: "aili.branch-message-catalog.v1", scope: ancestrySeedFor(key) });
}

function tokenEstimateSeedFor(key: BranchIndexKey): string {
  return digest({ version: "aili.branch-token-estimates.v1", scope: ancestrySeedFor(key) });
}

function validateKey(key: BranchIndexKey): string | undefined {
  for (const [field, value] of Object.entries(key)) if (typeof value !== "string" || value.length === 0) return `${field} is required`;
  return undefined;
}

function validateEntry(entry: BranchSessionEntry, nullParentAllowed = false): string | undefined {
  if (!entry || typeof entry.id !== "string" || entry.id.length === 0 || typeof entry.type !== "string" || entry.type.length === 0) {
    return "entry id/type is required";
  }
  if (entry.parentId === null) return nullParentAllowed ? undefined : `invalid parent for ${entry.id}`;
  if (entry.parentId !== undefined && (typeof entry.parentId !== "string" || entry.parentId.length === 0)) return `invalid parent for ${entry.id}`;
  return undefined;
}

function entryKind(entry: BranchSessionEntry): string {
  return entry.customType ? `${entry.type}:${entry.customType}` : entry.type;
}

function formatRef(prefix: "b" | "m", ordinal: number): string {
  return `${prefix}${String(ordinal).padStart(6, "0")}`;
}

function ordinalKey(ordinal: number): string {
  return String(ordinal).padStart(12, "0");
}

function normalizeTool(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getInternal(snapshot: BranchIndexSnapshot): SnapshotInternal {
  const internal = SNAPSHOT_INTERNALS.get(snapshot);
  if (!internal) throw new Error("unknown BranchIndex snapshot");
  return internal;
}

function coldFailure(code: BranchIndexFailureCode, diagnostic: string, counters: BranchIndexCounters): ColdBranchIndexResult {
  counters.fallbacks += 1;
  counters.failOpenReturns += 1;
  return { ok: false, operation: "cold-build", code, diagnostic, counters };
}

function appendFailure(
  snapshot: BranchIndexSnapshot,
  code: BranchIndexFailureCode,
  diagnostic: string,
  rebuildRequired: boolean,
  counters: BranchIndexCounters,
): AppendBranchIndexResult {
  counters.fallbacks += 1;
  counters.failOpenReturns += 1;
  return { ok: false, operation: "incremental-append", code, diagnostic, snapshot, rebuildRequired, counters };
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function forEachList(node: StringListNode | undefined, visitor: (value: string) => void): void {
  for (let current = node; current; current = current.previous) visitor(current.value);
}

function indexGet<V>(root: IndexNode<V> | undefined, key: string): V | undefined {
  let current = root;
  while (current) {
    if (key === current.key) return current.value;
    current = key < current.key ? current.left : current.right;
  }
  return undefined;
}

function indexFloor<V>(root: IndexNode<V> | undefined, key: string): V | undefined {
  let current = root;
  let floor: V | undefined;
  while (current) {
    if (key === current.key) return current.value;
    if (key < current.key) {
      current = current.left;
    } else {
      floor = current.value;
      current = current.right;
    }
  }
  return floor;
}

function indexSet<V>(root: IndexNode<V> | undefined, key: string, value: V): IndexSetResult<V> {
  if (!root) return { root: makeIndexNode(key, value), added: true };
  if (key === root.key) return { root: makeIndexNode(key, value, root.left, root.right), added: false, previous: root.value };
  if (key < root.key) {
    const next = indexSet(root.left, key, value);
    return { ...next, root: rebalance(makeIndexNode(root.key, root.value, next.root, root.right)) };
  }
  const next = indexSet(root.right, key, value);
  return { ...next, root: rebalance(makeIndexNode(root.key, root.value, root.left, next.root)) };
}

function makeIndexNode<V>(
  key: string,
  value: V,
  left?: IndexNode<V>,
  right?: IndexNode<V>,
): IndexNode<V> {
  return Object.freeze({ key, value, left, right, height: Math.max(height(left), height(right)) + 1 });
}

function height<V>(node: IndexNode<V> | undefined): number {
  return node?.height ?? 0;
}

function rebalance<V>(node: IndexNode<V>): IndexNode<V> {
  const balance = height(node.left) - height(node.right);
  if (balance > 1) {
    const left = node.left!;
    if (height(left.left) < height(left.right)) return rotateRight(makeIndexNode(node.key, node.value, rotateLeft(left), node.right));
    return rotateRight(node);
  }
  if (balance < -1) {
    const right = node.right!;
    if (height(right.right) < height(right.left)) return rotateLeft(makeIndexNode(node.key, node.value, node.left, rotateRight(right)));
    return rotateLeft(node);
  }
  return node;
}

function rotateLeft<V>(node: IndexNode<V>): IndexNode<V> {
  const pivot = node.right!;
  return makeIndexNode(pivot.key, pivot.value, makeIndexNode(node.key, node.value, node.left, pivot.left), pivot.right);
}

function rotateRight<V>(node: IndexNode<V>): IndexNode<V> {
  const pivot = node.left!;
  return makeIndexNode(pivot.key, pivot.value, pivot.left, makeIndexNode(node.key, node.value, pivot.right, node.right));
}

export interface BranchAncestryProof {
  sessionId: string;
  canonicalSessionPathDigest: string;
  epochId: string;
  replayVersion: string;
  length: number;
  tipEntryId?: string;
  digest: string;
}

/** Produces a constant-time proof for any indexed prefix without walking source entries. */
export function branchAncestryProof(
  snapshot: BranchIndexSnapshot,
  length = snapshot.stats.entries,
): BranchAncestryProof | undefined {
  const internal = getInternal(snapshot);
  if (!Number.isInteger(length) || length < 0 || length > internal.entryCount) return undefined;
  const record = length === 0 ? undefined : indexGet(internal.entryByOrdinal, ordinalKey(length));
  if (length > 0 && !record) return undefined;
  return {
    sessionId: snapshot.key.sessionId,
    canonicalSessionPathDigest: snapshot.key.canonicalSessionPathDigest,
    epochId: snapshot.key.epochId,
    replayVersion: snapshot.key.replayVersion,
    length,
    ...(record ? { tipEntryId: record.entryId } : {}),
    digest: record?.ancestryDigest ?? internal.ancestrySeed,
  };
}

export function verifyBranchAncestryProof(snapshot: BranchIndexSnapshot, proof: BranchAncestryProof): boolean {
  if (proof.sessionId !== snapshot.key.sessionId
    || proof.canonicalSessionPathDigest !== snapshot.key.canonicalSessionPathDigest
    || proof.epochId !== snapshot.key.epochId
    || proof.replayVersion !== snapshot.key.replayVersion) return false;
  const expected = branchAncestryProof(snapshot, proof.length);
  return expected !== undefined
    && expected.tipEntryId === proof.tipEntryId
    && expected.digest === proof.digest;
}

export interface BranchIndexStructuralIdentity {
  entryTail?: object;
  atomTail?: object;
  entryRoot?: object;
  replayRoot?: object;
  blockRoot?: object;
}

/** Opaque roots are exposed only so tests can prove structural sharing/no hidden prefix copy. */
export function branchIndexStructuralIdentity(snapshot: BranchIndexSnapshot): BranchIndexStructuralIdentity {
  const internal = getInternal(snapshot);
  return {
    entryTail: internal.entryTail,
    atomTail: internal.atomTail,
    entryRoot: internal.entryById,
    replayRoot: internal.transactionById,
    blockRoot: internal.blockById,
  };
}

export function branchIndexesShareEntryPrefix(
  prefix: BranchIndexSnapshot,
  appended: BranchIndexSnapshot,
): boolean {
  const prefixInternal = getInternal(prefix);
  const appendedInternal = getInternal(appended);
  return appendedInternal.entryTail?.previous === prefixInternal.entryTail;
}

export interface BranchIndexLookupResult<T> {
  value?: T;
  diagnostic?: "invalid-ref" | "not-found" | "stale-catalog" | "stale-scope";
  counters: BranchIndexCounters;
}

export interface BranchIndexRefScope {
  keyId: string;
  catalogId: string;
}

export function resolveBranchMessageReference(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  ref: string,
): BranchIndexLookupResult<BranchMessageReference> {
  return resolveScopedReference(snapshot, scope, ref, "m");
}

export function resolveBranchBlockReference(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  ref: string,
): BranchIndexLookupResult<BranchBlockReference> {
  return resolveScopedReference(snapshot, scope, ref, "b");
}

function resolveScopedReference(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  ref: string,
  kind: "b",
): BranchIndexLookupResult<BranchBlockReference>;
function resolveScopedReference(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  ref: string,
  kind: "m",
): BranchIndexLookupResult<BranchMessageReference>;
function resolveScopedReference(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  ref: string,
  kind: "b" | "m",
): BranchIndexLookupResult<BranchBlockReference | BranchMessageReference> {
  const counters = emptyBranchIndexCounters();
  const scopeDiagnostic = validateRefScope(snapshot, scope);
  if (scopeDiagnostic) return { diagnostic: scopeDiagnostic, counters };
  if (!new RegExp(`^${kind}\\d{6}$`).test(ref)) return { diagnostic: "invalid-ref", counters };
  counters.hashLookups = 1;
  const internal = getInternal(snapshot);
  const value = kind === "m" ? indexGet(internal.messageByRef, ref) : indexGet(internal.blockByRef, ref);
  return value ? { value, counters } : { diagnostic: "not-found", counters };
}

export function reverseBranchMessageReference(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  entryId: string,
): BranchIndexLookupResult<string> {
  const counters = emptyBranchIndexCounters();
  const scopeDiagnostic = validateRefScope(snapshot, scope);
  if (scopeDiagnostic) return { diagnostic: scopeDiagnostic, counters };
  counters.hashLookups = 1;
  const value = indexGet(getInternal(snapshot).messageRefByEntryId, entryId);
  return value ? { value, counters } : { diagnostic: "not-found", counters };
}

export function reverseBranchBlockReference(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  blockId: string,
): BranchIndexLookupResult<string> {
  const counters = emptyBranchIndexCounters();
  const scopeDiagnostic = validateRefScope(snapshot, scope);
  if (scopeDiagnostic) return { diagnostic: scopeDiagnostic, counters };
  counters.hashLookups = 1;
  const value = indexGet(getInternal(snapshot).blockRefById, blockId);
  return value ? { value, counters } : { diagnostic: "not-found", counters };
}

export interface BranchReferencePage {
  offset: number;
  limit: number;
  messages: readonly BranchMessageReference[];
  blocks: readonly BranchBlockReference[];
  nextOffset?: number;
}

export function pageBranchReferences(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  offset = 0,
  limit = 32,
): BranchIndexLookupResult<BranchReferencePage> {
  const counters = emptyBranchIndexCounters();
  const scopeDiagnostic = validateRefScope(snapshot, scope);
  if (scopeDiagnostic) return { diagnostic: scopeDiagnostic, counters };
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(MAX_REFERENCE_PAGE_SIZE, limit)) : 32;
  const internal = getInternal(snapshot);
  const messages: BranchMessageReference[] = [];
  for (let ordinal = safeOffset + 1; ordinal <= internal.messageRefCount && messages.length < safeLimit; ordinal += 1) {
    counters.hashLookups += 1;
    const record = indexGet(internal.messageByOrdinal, ordinalKey(ordinal));
    if (record) messages.push(record);
  }
  const blocks: BranchBlockReference[] = [];
  for (let ordinal = 1; ordinal <= internal.blockRefCount && blocks.length < 32; ordinal += 1) {
    counters.hashLookups += 1;
    const record = indexGet(internal.blockByOrdinal, ordinalKey(ordinal));
    if (record) blocks.push(record);
  }
  const nextOffset = safeOffset + messages.length < internal.messageRefCount ? safeOffset + messages.length : undefined;
  return {
    value: {
      offset: safeOffset,
      limit: safeLimit,
      messages,
      blocks,
      ...(nextOffset === undefined ? {} : { nextOffset }),
    },
    counters,
  };
}

export interface BranchReferenceQuery {
  kind: "block" | "message";
  ref: string;
}

/** Batch lookup keeps one scoped tree lookup per requested ref and performs no fallback scan. */
export function resolveBranchReferences(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
  queries: readonly BranchReferenceQuery[],
): { values: readonly (BranchBlockReference | BranchMessageReference | undefined)[]; counters: BranchIndexCounters } {
  const counters = emptyBranchIndexCounters();
  const scopeDiagnostic = validateRefScope(snapshot, scope);
  if (scopeDiagnostic) return { values: queries.map(() => undefined), counters };
  const internal = getInternal(snapshot);
  const values = queries.map((query) => {
    counters.hashLookups += 1;
    return query.kind === "message"
      ? indexGet(internal.messageByRef, query.ref)
      : indexGet(internal.blockByRef, query.ref);
  });
  return { values, counters };
}

export function getIndexedEntry(snapshot: BranchIndexSnapshot, entryId: string): IndexedEntryRecord | undefined {
  return indexGet(getInternal(snapshot).entryById, entryId);
}

export interface BranchProviderFrontierSource {
  entryId: string;
  message: Readonly<Record<string, unknown>>;
}

export type BranchProviderFrontierSourceResult =
  | {
    ok: true;
    sources: readonly BranchProviderFrontierSource[];
    totalRawMessages: number;
    totalRawUtf8Bytes: number;
    selectedRawMessages: number;
    selectedRawUtf8Bytes: number;
    counters: BranchIndexCounters;
  }
  | { ok: false; diagnostic: string; counters: BranchIndexCounters };

/**
 * Reads only explicitly retained provider-visible raw messages from the
 * immutable epoch snapshot. It never walks, fingerprints, or serializes raw
 * messages omitted from the provider frontier.
 */
export function readBranchProviderFrontierSources(
  snapshot: BranchIndexSnapshot,
  entryIds: readonly string[],
): BranchProviderFrontierSourceResult {
  const counters = emptyBranchIndexCounters();
  const internal = getInternal(snapshot);
  const requested = [...new Set(entryIds)].sort();
  const records: IndexedEntryRecord[] = [];
  for (const entryId of requested) {
    const record = indexGet(internal.entryById, entryId);
    if (!record || record.epochId !== snapshot.key.epochId) {
      counters.providerFrontierFallbacks += 1;
      return { ok: false, diagnostic: "frontier-protected-entry-unavailable", counters };
    }
    if (record.providerOrdinal !== undefined) records.push(record);
  }
  records.sort((left, right) => left.providerOrdinal! - right.providerOrdinal!);
  const sources: BranchProviderFrontierSource[] = [];
  let selectedRawUtf8Bytes = 0;
  for (const record of records) {
    const slot = persistentSegmentedValueAt(internal.rawEpochSlots, record.providerOrdinal! - 1);
    if (!slot || slot.entryId !== record.entryId || !slot.cloneable || !slot.isRecordBody || !isRecord(slot.body)) {
      counters.providerFrontierFallbacks += 1;
      return { ok: false, diagnostic: "frontier-protected-source-invalid", counters };
    }
    sources.push({ entryId: record.entryId, message: slot.body });
    selectedRawUtf8Bytes += record.serializedUtf8Bytes;
  }
  const totalRawMessages = internal.providerEntryCount;
  const totalRawUtf8Bytes = internal.rawEpochUtf8Bytes;
  counters.providerFrontierOmittedRawMessages = Math.max(0, totalRawMessages - sources.length);
  counters.providerFrontierOmittedRawBytes = Math.max(0, totalRawUtf8Bytes - selectedRawUtf8Bytes);
  return {
    ok: true,
    sources,
    totalRawMessages,
    totalRawUtf8Bytes,
    selectedRawMessages: sources.length,
    selectedRawUtf8Bytes,
    counters,
  };
}

export function getIndexedBlock(snapshot: BranchIndexSnapshot, blockId: string): BranchIndexedBlock | undefined {
  return indexGet(getInternal(snapshot).blockById, blockId);
}

export function lastBranchProtocolAtom(snapshot: BranchIndexSnapshot): BranchProtocolAtom | undefined {
  return getInternal(snapshot).atomTail?.atom;
}

export interface BranchProviderAlignmentOptions {
  actionForEntry?: (entryId: string) => string;
  suffixCustomType?: string;
}

export interface BranchProviderAlignmentResult {
  byEntryId: ReadonlyMap<string, number>;
  providerMessagesByEntryId: ReadonlyMap<string, Record<string, unknown>>;
  descriptorByEntryId: ReadonlyMap<string, BranchProviderMessageDescriptor>;
  descriptors: readonly BranchProviderMessageDescriptor[];
  /** Exact public provider input references captured by the single source pass. */
  messages: readonly Record<string, unknown>[];
  canonicalMessages: string;
  hash: string;
  utf8Bytes: number;
  structuredToolPartCount: number;
  hasBinaryOrImage: boolean;
  protocolDiagnostic?: string;
  diagnostic?: string;
  counters: BranchIndexCounters;
}

export interface BranchProviderMessageDescriptor {
  originalIndex: number;
  providerIndex: number;
  fingerprint: string;
  message: Record<string, unknown>;
  /**
   * Exact canonical form, materialized only if this provider message survives
   * projection or a fail-open result must return the unmodified input.
   */
  canonical?: string;
  structuredToolPartCount: number;
  hasBinaryOrImage: boolean;
  role?: string;
  customType?: string;
  toolCallId?: string;
  toolName?: string;
  toolCallIds: readonly string[];
  namedToolCalls: readonly { id: string; name?: string }[];
  isError: boolean;
  protocolMalformed: boolean;
  contentIsArray: boolean;
  /** Captured only for tool results that may receive a body-only cooling stub. */
  shallowEntries?: readonly (readonly [string, unknown])[];
  committedLegacyBlockIds: readonly string[];
  committedV3BlockId?: string;
  resultBodyDigest?: string;
}

interface CanonicalCapture {
  canonical?: string;
  stripped: string;
  structuredToolPartCount: number;
  hasBinaryOrImage: boolean;
  text: string;
  record?: { type?: string; id?: string; name?: string; tag?: string; blockId?: string };
  directRecords?: readonly { type?: string; id?: string; name?: string; tag?: string; blockId?: string }[];
  legacyBlockIds: readonly string[];
  v3BlockId?: string;
}

interface ProviderMessageCaptureHints {
  readonly hasRole: true;
  readonly role: unknown;
  readonly hasCustomType: boolean;
  readonly customType?: unknown;
}

interface ProviderMessageInput<T extends Record<string, unknown>> {
  readonly message: T;
  readonly originalIndex: number;
  readonly suffix: boolean;
  readonly hints: ProviderMessageCaptureHints;
}

/**
 * Raw slots are immutable, persistent index values. A weak cache lets repeated
 * structured-clone context inputs reuse their source-derived metadata without
 * retaining an additional copy of the raw provider body.
 */
const PROVIDER_DESCRIPTOR_CACHE = new WeakMap<RawEpochSlotV1, BranchProviderMessageDescriptor>();

interface CapturedProviderMessage {
  descriptor: BranchProviderMessageDescriptor;
  structuredToolPartCount: number;
  hasBinaryOrImage: boolean;
}

/**
 * Aligns one provider input against persistent entry/fingerprint/atom roots.
 * The provider array is read exactly once.  Duplicate resolution and protocol
 * validation operate on the bounded metadata captured by that pass and on
 * scoped index lookups; they never rebuild protocol atoms or scan Session
 * entries.
 */
export function alignBranchProviderMessages<T extends Record<string, unknown>>(
  snapshot: BranchIndexSnapshot,
  messages: readonly T[],
  options: BranchProviderAlignmentOptions = {},
): BranchProviderAlignmentResult {
  const counters = emptyBranchIndexCounters();
  counters.providerMessagePasses = 1;
  const internal = getInternal(snapshot);
  const inputs = providerMessageInputs(messages, options.suffixCustomType);
  const exactIndexed = alignExactIndexedProviderMessages(internal, inputs, counters);
  if (exactIndexed) return exactIndexed;
  const provider: BranchProviderMessageDescriptor[] = [];
  const publicMessages: Record<string, unknown>[] = [];
  let structuredToolPartCount = 0;
  let hasBinaryOrImage = false;
  const providerCounts = new Map<string, number>();
  for (const { message, originalIndex, suffix, hints } of inputs) {
    counters.providerMessageVisits += 1;
    const captured = captureProviderMessage(message, originalIndex, provider.length, true, hints);
    if (suffix) continue;
    provider.push(captured.descriptor);
    publicMessages.push(message);
    structuredToolPartCount += captured.structuredToolPartCount;
    hasBinaryOrImage ||= captured.hasBinaryOrImage;
    providerCounts.set(captured.descriptor.fingerprint, (providerCounts.get(captured.descriptor.fingerprint) ?? 0) + 1);
  }

  const occurrences = new Map<string, readonly IndexedEntryRecord[]>();
  const candidatesFor = (fingerprint: string): readonly IndexedEntryRecord[] => {
    const cached = occurrences.get(fingerprint);
    if (cached) return cached;
    const values: IndexedEntryRecord[] = [];
    for (let node = indexGet(internal.occurrenceByFingerprint, fingerprint); node; node = node.previous) {
      const record = indexGet(internal.entryByOrdinal, ordinalKey(node.ordinal));
      if (record?.providerOrdinal !== undefined) values.push(record);
    }
    values.reverse();
    occurrences.set(fingerprint, values);
    return values;
  };

  for (const [fingerprint, count] of providerCounts) {
    const candidates = candidatesFor(fingerprint);
    // Pi materializes compaction and branch summaries as provider messages even
    // though they are not Session `message` entries. One such synthetic message
    // is therefore intentionally unmapped; repeated copies remain ambiguous.
    if (count > Math.max(1, candidates.length)) {
      return providerAlignmentResult({
        byEntryId: new Map(),
        providerMessagesByEntryId: new Map(),
        descriptorByEntryId: new Map(),
        descriptors: provider,
        messages: publicMessages,
        structuredToolPartCount,
        hasBinaryOrImage,
        protocolDiagnostic: validateCapturedProviderProtocol(provider),
        diagnostic: `alignment-ambiguous:${safeAlignmentId(candidates[0]?.entryId ?? "unknown")}`,
        counters,
      });
    }
  }

  // Precompute the next usable unique anchor in one reverse metadata walk.
  const anchors = new Map<number, number>();
  let lastAnchorOrdinal = -1;
  for (let index = 0; index < provider.length; index += 1) {
    const candidates = candidatesFor(provider[index]!.fingerprint);
    if (candidates.length === 1 && candidates[0]!.ordinal > lastAnchorOrdinal) {
      anchors.set(index, candidates[0]!.ordinal);
      lastAnchorOrdinal = candidates[0]!.ordinal;
    }
  }
  const nextAnchor = new Array<number | undefined>(provider.length);
  let followingAnchor: number | undefined;
  for (let index = provider.length - 1; index >= 0; index -= 1) {
    followingAnchor = anchors.get(index) ?? followingAnchor;
    nextAnchor[index] = followingAnchor;
  }

  const remaining = new Map(providerCounts);
  const byEntryId = new Map<string, number>();
  const providerMessagesByEntryId = new Map<string, Record<string, unknown>>();
  const descriptorByEntryId = new Map<string, BranchProviderMessageDescriptor>();
  let previousOrdinal = -1;
  for (let providerIndex = 0; providerIndex < provider.length; providerIndex += 1) {
    const metadata = provider[providerIndex]!;
    const upper = nextAnchor[providerIndex];
    const candidates = candidatesFor(metadata.fingerprint).filter((candidate) =>
      candidate.ordinal > previousOrdinal && (upper === undefined || candidate.ordinal <= upper));
    const remainingSame = remaining.get(metadata.fingerprint) ?? 0;
    remaining.set(metadata.fingerprint, Math.max(0, remainingSame - 1));
    if (candidates.length === 0) continue;
    let selected = candidates[0]!;
    if (candidates.length > 1 && remainingSame !== candidates.length) {
      const classes = new Set(candidates.map((candidate) => digest({
        atomId: indexGet(internal.atomByEntryId, candidate.entryId)?.atomId ?? "none",
        action: options.actionForEntry?.(candidate.entryId) ?? "raw",
      })));
      if (classes.size !== 1) {
        return providerAlignmentResult({
          byEntryId: new Map(),
          providerMessagesByEntryId: new Map(),
          descriptorByEntryId: new Map(),
          descriptors: provider,
          messages: publicMessages,
          structuredToolPartCount,
          hasBinaryOrImage,
          protocolDiagnostic: validateCapturedProviderProtocol(provider),
          diagnostic: `alignment-ambiguous:${safeAlignmentId(selected.entryId)}`,
          counters,
        });
      }
    }
    byEntryId.set(selected.entryId, metadata.originalIndex);
    providerMessagesByEntryId.set(selected.entryId, metadata.message);
    descriptorByEntryId.set(selected.entryId, metadata);
    previousOrdinal = selected.ordinal;
  }

  const touchedAtoms = new Map<string, BranchProtocolAtom>();
  for (const entryId of byEntryId.keys()) {
    const atom = indexGet(internal.atomByEntryId, entryId);
    if (atom && (atom.kind === "tool-protocol" || atom.kind === "remainder")) touchedAtoms.set(atom.atomId, atom);
  }
  for (const atom of touchedAtoms.values()) {
    const mapped = atom.entryIds.filter((entryId) => byEntryId.has(entryId));
    if (mapped.length !== 0 && mapped.length !== atom.entryIds.length) {
      return providerAlignmentResult({
        byEntryId: new Map(),
        providerMessagesByEntryId: new Map(),
        descriptorByEntryId: new Map(),
        descriptors: provider,
        messages: publicMessages,
        structuredToolPartCount,
        hasBinaryOrImage,
        protocolDiagnostic: validateCapturedProviderProtocol(provider),
        diagnostic: `alignment-partial-protocol:${safeAlignmentId(atom.entryIds[0] ?? "unknown")}`,
        counters,
      });
    }
    const positions = mapped.map((entryId) => byEntryId.get(entryId)!);
    if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) {
      return providerAlignmentResult({
        byEntryId: new Map(),
        providerMessagesByEntryId: new Map(),
        descriptorByEntryId: new Map(),
        descriptors: provider,
        messages: publicMessages,
        structuredToolPartCount,
        hasBinaryOrImage,
        protocolDiagnostic: validateCapturedProviderProtocol(provider),
        diagnostic: `alignment-protocol-order:${safeAlignmentId(atom.entryIds[0] ?? "unknown")}`,
        counters,
      });
    }
  }
  return providerAlignmentResult({
    byEntryId,
    providerMessagesByEntryId,
    descriptorByEntryId,
    descriptors: provider,
    messages: publicMessages,
    structuredToolPartCount,
    hasBinaryOrImage,
    protocolDiagnostic: validateCapturedProviderProtocol(provider),
    counters,
  });
}

function alignExactIndexedProviderMessages<T extends Record<string, unknown>>(
  internal: SnapshotInternal,
  inputs: readonly ProviderMessageInput<T>[],
  counters: BranchIndexCounters,
): BranchProviderAlignmentResult | undefined {
  if (inputs.some((input) => input.suffix) || inputs.length !== internal.rawEpochSlots.length) return undefined;

  const descriptors: BranchProviderMessageDescriptor[] = [];
  const byEntryId = new Map<string, number>();
  const providerMessagesByEntryId = new Map<string, Record<string, unknown>>();
  const descriptorByEntryId = new Map<string, BranchProviderMessageDescriptor>();
  let structuredToolPartCount = 0;
  let hasBinaryOrImage = false;
  let cacheHits = 0;
  let cacheMisses = 0;

  for (let providerIndex = 0; providerIndex < inputs.length; providerIndex += 1) {
    const { message, originalIndex } = inputs[providerIndex]!;
    const slot = persistentSegmentedValueAt(internal.rawEpochSlots, providerIndex);
    if (!slot?.cloneable || !slot.isRecordBody || !isRecord(slot.body) || !sameCanonicalValue(slot.body, message)) {
      return undefined;
    }
    let cached = PROVIDER_DESCRIPTOR_CACHE.get(slot);
    if (cached) {
      cacheHits += 1;
    } else {
      cached = captureProviderMessage(slot.body, 0, 0, false).descriptor;
      PROVIDER_DESCRIPTOR_CACHE.set(slot, cached);
      cacheMisses += 1;
    }
    const descriptor: BranchProviderMessageDescriptor = {
      ...cached,
      originalIndex,
      providerIndex,
      message,
    };
    descriptors.push(descriptor);
    byEntryId.set(slot.entryId, originalIndex);
    providerMessagesByEntryId.set(slot.entryId, message);
    descriptorByEntryId.set(slot.entryId, descriptor);
    structuredToolPartCount += descriptor.structuredToolPartCount;
    hasBinaryOrImage ||= descriptor.hasBinaryOrImage;
  }

  counters.providerMessageVisits += inputs.length;
  counters.providerMessageCacheHits += cacheHits;
  counters.providerMessageCacheMisses += cacheMisses;

  return providerAlignmentResult({
    byEntryId,
    providerMessagesByEntryId,
    descriptorByEntryId,
    descriptors,
    messages: inputs.map(({ message }) => message),
    structuredToolPartCount,
    hasBinaryOrImage,
    protocolDiagnostic: validateCapturedProviderProtocol(descriptors),
    counters,
  });
}

function providerMessageInputs<T extends Record<string, unknown>>(
  messages: readonly T[],
  suffixCustomType: string | undefined,
): ProviderMessageInput<T>[] {
  const inputs: ProviderMessageInput<T>[] = [];
  for (let originalIndex = 0; originalIndex < messages.length; originalIndex += 1) {
    const message = messages[originalIndex]!;
    const role = message.role;
    const customType = role === "custom" ? message.customType : undefined;
    inputs.push({
      message,
      originalIndex,
      suffix: role === "custom" && customType === suffixCustomType,
      hints: {
        hasRole: true,
        role,
        hasCustomType: role === "custom",
        ...(role === "custom" ? { customType } : {}),
      },
    });
  }
  return inputs;
}

function providerAlignmentResult(input: {
  byEntryId: ReadonlyMap<string, number>;
  providerMessagesByEntryId: ReadonlyMap<string, Record<string, unknown>>;
  descriptorByEntryId: ReadonlyMap<string, BranchProviderMessageDescriptor>;
  descriptors: readonly BranchProviderMessageDescriptor[];
  messages: readonly Record<string, unknown>[];
  structuredToolPartCount: number;
  hasBinaryOrImage: boolean;
  protocolDiagnostic?: string;
  diagnostic?: string;
  counters: BranchIndexCounters;
}): BranchProviderAlignmentResult {
  let canonicalMessages: string | undefined;
  let hash: string | undefined;
  let utf8Bytes: number | undefined;
  const canonical = () => canonicalMessages ??= `[${input.descriptors.map(descriptorCanonical).join(",")}]`;
  return {
    byEntryId: input.byEntryId,
    providerMessagesByEntryId: input.providerMessagesByEntryId,
    descriptorByEntryId: input.descriptorByEntryId,
    descriptors: input.descriptors,
    messages: input.messages,
    get canonicalMessages() { return canonical(); },
    get hash() { return hash ??= digestCanonicalJson(canonical()); },
    get utf8Bytes() { return utf8Bytes ??= Buffer.byteLength(canonical(), "utf8"); },
    structuredToolPartCount: input.structuredToolPartCount,
    hasBinaryOrImage: input.hasBinaryOrImage,
    ...(input.protocolDiagnostic ? { protocolDiagnostic: input.protocolDiagnostic } : {}),
    ...(input.diagnostic ? { diagnostic: input.diagnostic } : {}),
    counters: input.counters,
  };
}

export function descriptorCanonical(descriptor: BranchProviderMessageDescriptor): string {
  return descriptor.canonical ??= canonicalJson(descriptor.message);
}

/** Exact canonical equality without allocating a serialized provider body. */
function sameCanonicalValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameCanonicalValue(value, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key)
        && sameCanonicalValue(left[key], right[key]));
  }
  return Object.is(left, right);
}

/**
 * Captures every source message through one top-level key walk.  Later
 * projection/identity/calibration code consumes this immutable descriptor and
 * never needs to revisit the provider-owned object graph.
 */
function captureProviderMessage<T extends Record<string, unknown>>(
  message: T,
  originalIndex: number,
  providerIndex: number,
  includeCanonical = true,
  hints?: ProviderMessageCaptureHints,
): CapturedProviderMessage {
  const keys = Object.keys(message).sort();
  const canonicalParts = includeCanonical ? [] as string[] : undefined;
  const strippedParts: string[] = [];
  const selected = new Map<string, CanonicalCapture>();
  const primitive = new Map<string, unknown>();
  const shallowEntries: Array<readonly [string, unknown]> = [];
  let structuredToolPartCount = 0;
  let hasBinaryOrImage = false;
  for (const key of keys) {
    const raw = key === "role" && hints?.hasRole
      ? hints.role
      : key === "customType" && hints?.hasCustomType
        ? hints.customType
        : message[key];
    shallowEntries.push([key, raw]);
    const captured = captureCanonicalValue(raw, includeCanonical);
    const encodedKey = JSON.stringify(key);
    if (canonicalParts) canonicalParts.push(`${encodedKey}:${captured.canonical!}`);
    if (!isDisplayOnlyKey(key)) strippedParts.push(`${encodedKey}:${captured.stripped}`);
    structuredToolPartCount += captured.structuredToolPartCount;
    hasBinaryOrImage ||= captured.hasBinaryOrImage;
    if (PROVIDER_CAPTURE_KEYS.has(key)) selected.set(key, captured);
    if (PROVIDER_SCALAR_KEYS.has(key)) primitive.set(key, raw);
  }
  if (primitive.get("type") === "toolCall") structuredToolPartCount += 1;
  if (typeof primitive.get("type") === "string"
    && /^(?:image|image_url|audio|video|file|binary)$/u.test(primitive.get("type") as string)) {
    hasBinaryOrImage = true;
  }
  const semanticCanonical = `{${[...PROVIDER_SEMANTIC_KEYS].sort().map((key) =>
    `${JSON.stringify(key)}:${selected.get(key)?.stripped ?? "undefined"}`).join(",")}}`;
  const toolCallsCapture = selected.get("toolCalls");
  const contentCapture = selected.get("content");
  const declaredToolCalls = toolCallsCapture?.directRecords ?? [];
  const contentToolCalls = (contentCapture?.directRecords ?? []).filter((record) => record.type === "toolCall");
  const namedToolCalls = [...declaredToolCalls, ...contentToolCalls]
    .flatMap((record) => typeof record.id === "string"
      ? [{ id: record.id, ...(typeof record.name === "string" ? { name: record.name } : {}) }]
      : []);
  const toolCallsValue = primitive.get("toolCalls");
  const contentValue = primitive.get("content");
  const toolCallsMalformed = toolCallsValue !== undefined && (!Array.isArray(toolCallsValue)
    || declaredToolCalls.length !== toolCallsValue.length
    || declaredToolCalls.some((record) => !record.id || !record.name));
  const contentCallsMalformed = Array.isArray(contentValue)
    && contentToolCalls.some((record) => !record.id || !record.name);
  const role = typeof primitive.get("role") === "string" ? primitive.get("role") as string : undefined;
  const toolCallId = typeof primitive.get("toolCallId") === "string" ? primitive.get("toolCallId") as string : undefined;
  const toolName = typeof primitive.get("toolName") === "string" ? primitive.get("toolName") as string : undefined;
  const protocolMalformed = toolCallsMalformed
    || contentCallsMalformed
    || (role === "toolResult" && (!toolCallId || !toolName));
  const canonical = canonicalParts ? `{${canonicalParts.join(",")}}` : undefined;
  const descriptor: BranchProviderMessageDescriptor = {
    originalIndex,
    providerIndex,
    fingerprint: digestCanonicalJson(semanticCanonical),
    message,
    ...(canonical ? { canonical } : {}),
    structuredToolPartCount,
    hasBinaryOrImage,
    ...(role ? { role } : {}),
    ...(typeof primitive.get("customType") === "string" ? { customType: primitive.get("customType") as string } : {}),
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolName ? { toolName } : {}),
    toolCallIds: namedToolCalls.map((call) => call.id),
    namedToolCalls,
    isError: primitive.get("isError") === true,
    protocolMalformed,
    contentIsArray: Array.isArray(contentValue),
    ...(role === "toolResult" ? { shallowEntries } : {}),
    committedLegacyBlockIds: selected.get("details")?.legacyBlockIds ?? [],
    ...(selected.get("details")?.v3BlockId ? { committedV3BlockId: selected.get("details")!.v3BlockId } : {}),
    ...(role === "toolResult" ? { resultBodyDigest: digest(contentCapture?.text ?? "") } : {}),
  };
  return { descriptor, structuredToolPartCount, hasBinaryOrImage };
}

/** Describes an AILI-owned synthetic provider message without touching source input. */
export function describeOwnedProviderMessage(
  message: Record<string, unknown>,
  providerIndex = 0,
): BranchProviderMessageDescriptor {
  return captureProviderMessage(message, providerIndex, providerIndex).descriptor;
}

const PROVIDER_SEMANTIC_KEYS = new Set([
  "role",
  "content",
  "toolCallId",
  "toolName",
  "toolCalls",
  "isError",
  "customType",
]);

const PROVIDER_CAPTURE_KEYS = new Set([
  ...PROVIDER_SEMANTIC_KEYS,
  "details",
]);

const PROVIDER_SCALAR_KEYS = new Set([
  ...PROVIDER_CAPTURE_KEYS,
  "type",
]);

function captureCanonicalValue(value: unknown, includeCanonical: boolean): CanonicalCapture {
  if (Array.isArray(value)) {
    const captured: CanonicalCapture[] = [];
    let structuredToolPartCount = 0;
    let hasBinaryOrImage = false;
    for (let index = 0; index < value.length; index += 1) {
      const item = captureCanonicalValue(value[index], includeCanonical);
      captured.push(item);
      structuredToolPartCount += item.structuredToolPartCount;
      hasBinaryOrImage ||= item.hasBinaryOrImage;
    }
    return {
      ...(includeCanonical ? { canonical: `[${captured.map((item) => item.canonical!).join(",")}]` } : {}),
      stripped: `[${captured.map((item) => item.stripped).join(",")}]`,
      structuredToolPartCount,
      hasBinaryOrImage,
      text: captured.map((item) => item.text).join("\n"),
      directRecords: captured.flatMap((item) => item.record ? [item.record] : []),
      legacyBlockIds: captured.flatMap((item) => item.legacyBlockIds),
      ...(captured.find((item) => item.v3BlockId)?.v3BlockId
        ? { v3BlockId: captured.find((item) => item.v3BlockId)!.v3BlockId }
        : {}),
    };
  }
  if (!isRecord(value)) {
    const canonical = JSON.stringify(value) ?? "undefined";
    return {
      ...(includeCanonical ? { canonical } : {}),
      stripped: canonical,
      structuredToolPartCount: 0,
      hasBinaryOrImage: false,
      text: typeof value === "string" ? value : "",
      legacyBlockIds: [],
    };
  }
  const canonicalParts = includeCanonical ? [] as string[] : undefined;
  const strippedParts: string[] = [];
  let structuredToolPartCount = 0;
  let hasBinaryOrImage = false;
  let type: string | undefined;
  let id: string | undefined;
  let name: string | undefined;
  let tag: string | undefined;
  let blockId: string | undefined;
  let textValue: string | undefined;
  let contentText: string | undefined;
  let directBlockIds: readonly string[] = [];
  let payloadBlockId: string | undefined;
  let nestedLegacyBlockIds: readonly string[] = [];
  let nestedV3BlockId: string | undefined;
  for (const key of Object.keys(value).sort()) {
    const raw = value[key];
    const captured = captureCanonicalValue(raw, includeCanonical);
    const encodedKey = JSON.stringify(key);
    if (canonicalParts) canonicalParts.push(`${encodedKey}:${captured.canonical!}`);
    if (!isDisplayOnlyKey(key)) strippedParts.push(`${encodedKey}:${captured.stripped}`);
    structuredToolPartCount += captured.structuredToolPartCount;
    hasBinaryOrImage ||= captured.hasBinaryOrImage;
    if (key === "type" && typeof raw === "string") type = raw;
    if (key === "id" && typeof raw === "string") id = raw;
    if (key === "name" && typeof raw === "string") name = raw;
    if (key === "tag" && typeof raw === "string") tag = raw;
    if (key === "blockId" && typeof raw === "string") blockId = raw;
    if (key === "text" && typeof raw === "string") textValue = raw;
    if (key === "content") contentText = captured.text;
    if (key === "blocks") directBlockIds = (captured.directRecords ?? []).flatMap((record) => {
      const committedBlockId = record.blockId ?? record.id;
      return committedBlockId ? [committedBlockId] : [];
    });
    if (key === "payload") payloadBlockId = captured.record?.blockId;
    if (key === "contextTx") {
      nestedLegacyBlockIds = captured.legacyBlockIds;
      nestedV3BlockId = captured.v3BlockId;
    }
  }
  structuredToolPartCount += type === "toolCall" ? 1 : 0;
  hasBinaryOrImage ||= typeof type === "string" && /^(?:image|image_url|audio|video|file|binary)$/u.test(type);
  return {
    ...(canonicalParts ? { canonical: `{${canonicalParts.join(",")}}` } : {}),
    stripped: `{${strippedParts.join(",")}}`,
    structuredToolPartCount,
    hasBinaryOrImage,
    text: textValue ?? contentText ?? "",
    record: {
      ...(type ? { type } : {}),
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(tag ? { tag } : {}),
      ...(blockId ? { blockId } : {}),
    },
    legacyBlockIds: directBlockIds.length > 0 ? directBlockIds : nestedLegacyBlockIds,
    ...((tag === "semantic-create" && payloadBlockId) || nestedV3BlockId
      ? { v3BlockId: (tag === "semantic-create" && payloadBlockId) ? payloadBlockId : nestedV3BlockId }
      : {}),
  };
}

function isDisplayOnlyKey(key: string): boolean {
  return key === "timestamp" || key === "display" || key === "displayOnly";
}

function validateCapturedProviderProtocol(descriptors: readonly BranchProviderMessageDescriptor[]): string | undefined {
  if (!descriptors.some((descriptor) => descriptor.role === "user")) return "missing-user-message";
  const calls = new Map<string, { index: number; name?: string }>();
  const results = new Set<string>();
  const pending = new Set<string>();
  for (const descriptor of descriptors) {
    if (!descriptor.role || descriptor.protocolMalformed) return descriptor.role ? "invalid-tool-pair" : "invalid-role";
    if (pending.size > 0 && descriptor.role !== "toolResult") return "invalid-role-order";
    if (descriptor.namedToolCalls.length > 0 && descriptor.role !== "assistant") return "invalid-role";
    for (const call of descriptor.namedToolCalls) {
      if (calls.has(call.id) || !call.name) return "invalid-tool-pair";
      calls.set(call.id, { index: descriptor.providerIndex, name: call.name });
      pending.add(call.id);
    }
    if (descriptor.role !== "toolResult") continue;
    if (!descriptor.toolCallId || results.has(descriptor.toolCallId)) return "invalid-tool-pair";
    const call = calls.get(descriptor.toolCallId);
    if (!call || call.index >= descriptor.providerIndex || call.name !== descriptor.toolName) return "invalid-tool-pair";
    results.add(descriptor.toolCallId);
    pending.delete(descriptor.toolCallId);
  }
  return [...calls.keys()].every((id) => results.has(id)) ? undefined : "invalid-tool-pair";
}

export function getBranchProtocolAtomForEntry(
  snapshot: BranchIndexSnapshot,
  entryId: string,
): BranchProtocolAtom | undefined {
  return indexGet(getInternal(snapshot).atomByEntryId, entryId);
}

export function listBranchMessageReferences(snapshot: BranchIndexSnapshot): readonly BranchMessageReference[] {
  const internal = getInternal(snapshot);
  const values: BranchMessageReference[] = [];
  for (let ordinal = 1; ordinal <= internal.messageRefCount; ordinal += 1) {
    const value = indexGet(internal.messageByOrdinal, ordinalKey(ordinal));
    if (value) values.push(value);
  }
  return values;
}

/** Exact v3 replay state owned by the snapshot; legacy blocks are never coerced into it. */
export function getBranchV3LifecycleReplay(snapshot: BranchIndexSnapshot): V3LifecycleReplay {
  const internal = getInternal(snapshot);
  const state = internal.v3State;
  if (!state) {
    return {
      state: undefined,
      maximalActiveBlocks: [],
      archivedQueryOnlyBlocks: [],
      acceptedTransactionCount: 0,
      diagnostics: [...internal.v3Diagnostics],
    };
  }
  const maximal = maximalActiveV3Blocks(state);
  const diagnostics = [...internal.v3Diagnostics];
  if (!maximal.ok) diagnostics.push({ phase: "derive", code: maximal.code, path: maximal.path });
  return {
    state,
    maximalActiveBlocks: maximal.ok ? maximal.value : [],
    archivedQueryOnlyBlocks: [...state.blocks.values()]
      .filter((block) => block.queryOnly)
      .sort(compareIndexedV3Blocks),
    acceptedTransactionCount: state.transactions.size,
    diagnostics,
  };
}

export interface BranchReplayHealth {
  healthy: boolean;
  indexedDigest: string;
  oracleDigest: string;
  fallback: CompactReadBundle;
  diagnostics: readonly string[];
  counters: BranchIndexCounters;
}

/** The retained correctness oracle/fallback. It never mutates Session entries or an index snapshot. */
export function branchIndexPureReplayFallback(entries: readonly BranchSessionEntry[]): CompactReadBundle {
  return reduceCompactReadBundle(entries);
}

/**
 * Compares indexed legacy/repair/v3 block state with one pure reducer replay.
 * A mismatch exposes the exact pure bundle and visibly counts the fallback.
 */
export function auditBranchIndexReplayHealth(
  snapshot: BranchIndexSnapshot,
  entries: readonly BranchSessionEntry[],
): BranchReplayHealth {
  const counters = emptyBranchIndexCounters();
  counters.fullReducerRuns = 1;
  counters.pureAuditRuns = 1;
  const internal = getInternal(snapshot);
  const fallback = internal.v3ReplaySeed
    ? {
      legacy: reduceCompactStateFromEpoch(entries, internal.epochId),
      v3: reduceV3LifecycleStateFromSeed(entries, internal.v3ReplaySeed.replay),
    }
    : branchIndexPureReplayFallback(entries);
  if (internal.v3ReplaySeed) counters.seedReplayRuns = 1;
  const indexedDigest = indexedReplayProjectionDigest(snapshot);
  const oracleDigest = oracleReplayProjectionDigest(fallback);
  const healthy = indexedDigest === oracleDigest;
  if (!healthy) {
    counters.fallbacks = 1;
    counters.failOpenReturns = 1;
  }
  return {
    healthy,
    indexedDigest,
    oracleDigest,
    fallback,
    diagnostics: healthy ? [] : ["branch-replay-oracle-mismatch"],
    counters,
  };
}

function indexedReplayProjectionDigest(snapshot: BranchIndexSnapshot): string {
  const internal = getInternal(snapshot);
  const blocks: ReturnType<typeof replayProjectionBlock>[] = [];
  forEachList(internal.blockIdTail, (blockId) => {
    const block = indexGet(internal.blockById, blockId);
    if (block && block.schema !== "v3") blocks.push(replayProjectionBlock(block));
  });
  for (const block of internal.v3State?.blocks.values() ?? []) {
    blocks.push(replayProjectionBlock({
      schema: "v3",
      blockId: block.blockId,
      epochId: block.epochId,
      kind: "semantic",
      tier: block.tier,
      projectionVersion: block.projectionVersion,
      active: block.active,
      queryOnly: block.queryOnly,
      sourceEntryIds: block.source.kind === "messages" ? block.source.entryIds : [],
      childBlockIds: block.source.kind === "blocks" ? block.source.childBlockIds : [],
      sourceDigest: block.leafDigest,
      summaryDigest: block.summaryDigest,
      leafCount: block.leafCount,
      leafDigest: block.leafDigest,
      payloadDigest: digest(block),
    }));
  }
  blocks.sort(compareReplayProjectionBlocks);
  return digest({
    blocks,
    transactions: internal.transactionCount,
    repairs: internal.repairTransactionCount,
    v3Transactions: internal.v3State?.transactions.size ?? 0,
    legacyDiagnosticCount: internal.legacyDiagnosticCount,
    v3Diagnostics: internal.v3Diagnostics,
  });
}

function oracleReplayProjectionDigest(bundle: CompactReadBundle): string {
  const blocks = [
    ...[...bundle.legacy.blocks.values()].map((block) => replayProjectionBlock({
      schema: "legacy",
      blockId: block.id,
      epochId: block.epochId,
      kind: block.kind,
      active: block.active,
      queryOnly: block.queryOnly === true,
      sourceEntryIds: block.sourceEntryIds,
      childBlockIds: block.childBlockIds ?? [],
      sourceDigest: block.sourceDigest,
      summaryDigest: digest(block.summary),
      payloadDigest: digest(block),
    })),
    ...[...(bundle.v3.state?.blocks.values() ?? [])].map((block) => replayProjectionBlock({
      schema: "v3",
      blockId: block.blockId,
      epochId: block.epochId,
      kind: "semantic",
      tier: block.tier,
      projectionVersion: block.projectionVersion,
      active: block.active,
      queryOnly: block.queryOnly,
      sourceEntryIds: block.source.kind === "messages" ? block.source.entryIds : [],
      childBlockIds: block.source.kind === "blocks" ? block.source.childBlockIds : [],
      sourceDigest: block.leafDigest,
      summaryDigest: block.summaryDigest,
      leafCount: block.leafCount,
      leafDigest: block.leafDigest,
      payloadDigest: digest(block),
    })),
  ].sort(compareReplayProjectionBlocks);
  return digest({
    blocks,
    transactions: (bundle.legacy.transactionCount ?? 0)
      + (bundle.legacy.repairTransactionCount ?? 0)
      + bundle.v3.acceptedTransactionCount,
    repairs: bundle.legacy.repairTransactionCount ?? 0,
    v3Transactions: bundle.v3.acceptedTransactionCount,
    legacyDiagnosticCount: bundle.legacy.diagnostics.length,
    v3Diagnostics: bundle.v3.diagnostics,
  });
}

function replayProjectionBlock(block: BranchIndexedBlock) {
  return {
    schema: block.schema,
    blockId: block.blockId,
    epochId: block.epochId,
    kind: block.kind,
    active: block.active,
    queryOnly: block.queryOnly,
    sourceEntryIds: [...block.sourceEntryIds],
    childBlockIds: [...block.childBlockIds],
    sourceDigest: block.sourceDigest,
    summaryDigest: block.summaryDigest,
    ...(block.tier === undefined ? {} : { tier: block.tier }),
    ...(block.projectionVersion === undefined ? {} : { projectionVersion: block.projectionVersion }),
    ...(block.leafCount === undefined ? {} : { leafCount: block.leafCount }),
    ...(block.leafDigest === undefined ? {} : { leafDigest: block.leafDigest }),
  };
}

function compareReplayProjectionBlocks(
  left: ReturnType<typeof replayProjectionBlock>,
  right: ReturnType<typeof replayProjectionBlock>,
): number {
  return left.schema.localeCompare(right.schema) || left.blockId.localeCompare(right.blockId);
}

function compareIndexedV3Blocks(left: V3SemanticBlock, right: V3SemanticBlock): number {
  return left.createdAt - right.createdAt
    || left.firstLeafOrdinal - right.firstLeafOrdinal
    || left.blockId.localeCompare(right.blockId);
}

export function getFingerprintOccurrences(snapshot: BranchIndexSnapshot, fingerprint: string): readonly number[] {
  const values: number[] = [];
  for (let node = indexGet(getInternal(snapshot).occurrenceByFingerprint, fingerprint); node; node = node.previous) {
    values.push(node.ordinal);
  }
  return values.reverse();
}

/** Debug/oracle surface. Production lookup and append paths never call this full traversal. */
export function listBranchProtocolAtoms(snapshot: BranchIndexSnapshot): readonly BranchProtocolAtom[] {
  const values: BranchProtocolAtom[] = [];
  for (let node = getInternal(snapshot).atomTail; node; node = node.previous) values.push(node.atom);
  return values.reverse();
}

/** Materializes planner metadata from persistent roots without reading Session message bodies. */
export function branchProtocolAtomBuild(snapshot: BranchIndexSnapshot): ProtocolAtomBuildResult {
  const internal = getInternal(snapshot);
  const indexed = listBranchProtocolAtoms(snapshot);
  const atoms: ProtocolAtom[] = indexed.map((atom) => ({
    atomId: atom.atomId,
    ordinal: atom.ordinal,
    kind: atom.kind,
    entryIds: atom.entryIds,
    entryIndexes: atom.entryIds.flatMap((entryId) => {
      const record = indexGet(internal.entryById, entryId);
      return record ? [record.ordinal - 1] : [];
    }),
    startEntryIndex: atom.startEntryOrdinal - 1,
    endEntryIndex: atom.endEntryOrdinal - 1,
    roles: atom.roles,
    toolCallIds: atom.toolCallIds,
    messageCount: atom.messageCount,
    structuredToolPartCount: atom.structuredToolPartCount,
    utf8Bytes: atom.utf8Bytes,
    surfaceSaturated: atom.surfaceSaturated,
    sourceDigest: atom.sourceDigest,
    hardProtected: atom.hardProtected,
    protectionReasons: atom.protectionReasons,
    containsUser: atom.containsUser,
    containsAssistant: atom.containsAssistant,
    turnState: atom.turnState,
  }));
  const entryToAtomId = new Map<string, string>();
  for (const atom of atoms) for (const entryId of atom.entryIds) entryToAtomId.set(entryId, atom.atomId);
  const diagnosticCounts = Object.fromEntries(PROTOCOL_ATOM_PROTECTION_REASONS.map((reason) => [
    reason,
    atoms.filter((atom) => atom.protectionReasons.includes(reason)).length,
  ])) as ProtocolAtomBuildResult["diagnosticCounts"];
  return {
    version: PROTOCOL_ATOM_VERSION,
    atoms,
    providerEntryCount: internal.providerEntryCount,
    sourceDigest: snapshot.protocolDigest,
    entryToAtomId,
    diagnosticCounts,
  };
}

export function setBranchTokenEstimate(
  snapshot: BranchIndexSnapshot,
  estimate: BranchTokenEstimate,
): { snapshot: BranchIndexSnapshot; counters: BranchIndexCounters } {
  if (!validTokenEstimate(estimate)) return { snapshot, counters: emptyBranchIndexCounters() };
  const counters = emptyBranchIndexCounters();
  counters.hashOps = 1;
  const internal = getInternal(snapshot);
  if (!indexGet(internal.atomById, estimate.atomId)) return { snapshot, counters };
  const key = tokenEstimateKey(estimate);
  const nextInternal: SnapshotInternal = {
    ...internal,
    tokenEstimateByKey: indexSet(internal.tokenEstimateByKey, key, Object.freeze({ ...estimate })).root,
    tokenEstimateDigest: digest({ previous: internal.tokenEstimateDigest, key, estimate }),
  };
  return {
    snapshot: makeSnapshot(
      snapshot.key,
      nextInternal,
      snapshot.sourceEntryIdDigest,
      {
        ...snapshot.derivedVersions,
        providerId: estimate.providerId,
        modelId: estimate.modelId,
        estimatorVersion: estimate.estimatorVersion,
      },
      { ...snapshot.derivedValidity, tokenEstimates: true },
      snapshot.diagnostics,
      snapshot.revision + 1,
    ),
    counters,
  };
}

export function getBranchTokenEstimate(
  snapshot: BranchIndexSnapshot,
  key: Pick<BranchTokenEstimate, "atomId" | "estimatorVersion" | "modelId" | "providerId">,
): BranchTokenEstimate | undefined {
  return indexGet(getInternal(snapshot).tokenEstimateByKey, tokenEstimateKey(key));
}

export type BranchDerivedInvalidation = {
  kind: "provider-model-estimator";
  providerId: string;
  modelId: string;
  estimatorVersion: string;
} | {
  kind: "projection";
  version: string;
} | {
  kind: "quality";
  version: string;
} | {
  kind: "config";
  version: string;
};

/** Invalidates only owned derived roots; entry/atom/replay/catalog source structures remain shared. */
export function invalidateBranchDerivedIndex(
  snapshot: BranchIndexSnapshot,
  invalidation: BranchDerivedInvalidation,
): { snapshot: BranchIndexSnapshot; counters: BranchIndexCounters } {
  const counters = emptyBranchIndexCounters();
  counters.derivedInvalidations = 1;
  const internal = getInternal(snapshot);
  let nextInternal = internal;
  let versions: BranchDerivedVersions = { ...snapshot.derivedVersions };
  let validity: BranchDerivedValidity = { ...snapshot.derivedValidity };
  if (invalidation.kind === "provider-model-estimator") {
    nextInternal = {
      ...internal,
      tokenEstimateByKey: undefined,
      tokenEstimateDigest: tokenEstimateSeedFor(snapshot.key),
    };
    versions = {
      ...versions,
      providerId: invalidation.providerId,
      modelId: invalidation.modelId,
      estimatorVersion: invalidation.estimatorVersion,
    };
    validity = { ...validity, tokenEstimates: false, calibration: false };
  } else if (invalidation.kind === "projection") {
    versions = { ...versions, projectionVersion: invalidation.version };
    validity = { ...validity, projection: false };
  } else if (invalidation.kind === "quality") {
    versions = { ...versions, qualityVersion: invalidation.version };
    validity = { ...validity, quality: false };
  } else {
    versions = { ...versions, configVersion: invalidation.version };
    validity = { ...validity, protection: false, catalog: false };
  }
  return {
    snapshot: makeSnapshot(
      snapshot.key,
      nextInternal,
      snapshot.sourceEntryIdDigest,
      versions,
      validity,
      snapshot.diagnostics,
      snapshot.revision + 1,
    ),
    counters,
  };
}

export function visitProviderMessagesOnce<T, R>(
  messages: readonly T[],
  visitor: (message: T, index: number) => R,
): { values: readonly R[]; counters: BranchIndexCounters } {
  const counters = emptyBranchIndexCounters();
  counters.providerMessagePasses = 1;
  const values = messages.map((message, index) => {
    counters.providerMessageVisits += 1;
    return visitor(message, index);
  });
  return { values, counters };
}

function validateRefScope(
  snapshot: BranchIndexSnapshot,
  scope: BranchIndexRefScope,
): "stale-catalog" | "stale-scope" | undefined {
  if (scope.keyId !== snapshot.keyId) return "stale-scope";
  if (!snapshot.derivedValidity.catalog || scope.catalogId !== snapshot.catalogId) return "stale-catalog";
  return undefined;
}

function tokenEstimateKey(
  value: Pick<BranchTokenEstimate, "atomId" | "estimatorVersion" | "modelId" | "providerId">,
): string {
  return `${value.providerId}\u0000${value.modelId}\u0000${value.estimatorVersion}\u0000${value.atomId}`;
}

function validTokenEstimate(value: BranchTokenEstimate): boolean {
  return value.providerId.length > 0
    && value.modelId.length > 0
    && value.estimatorVersion.length > 0
    && value.atomId.length > 0
    && Number.isSafeInteger(value.lower) && value.lower >= 0
    && Number.isSafeInteger(value.upper) && value.upper >= value.lower;
}

export type BranchIndexBudgetInput = {
  operation: "cold-build";
  snapshot: BranchIndexSnapshot;
  counters: BranchIndexCounters;
} | {
  operation: "incremental-append";
  snapshot: BranchIndexSnapshot;
  counters: BranchIndexCounters;
  newEntries: number;
} | {
  operation: "reference-lookup";
  snapshot: BranchIndexSnapshot;
  counters: BranchIndexCounters;
  referenceOperations: number;
};

export interface BranchIndexBudgetEvidence {
  operation: BranchIndexBudgetInput["operation"];
  passed: boolean;
  entryVisitLimit?: number;
  atomMembershipVisitLimit?: number;
  blockVisitLimit?: number;
  hashOpLimit?: number;
  hashLookupLimit?: number;
  retainedRecordLimit: number;
  checks: Readonly<Record<string, boolean>>;
}

export function evaluateBranchIndexBudget(input: BranchIndexBudgetInput): BranchIndexBudgetEvidence {
  const stats = input.snapshot.stats;
  const structural = stats.retainedRecords <= stats.retainedRecordLimit;
  if (input.operation === "cold-build") {
    const entryVisitLimit = 3 * stats.entries;
    const atomMembershipVisitLimit = 4 * stats.atomMembershipEdges;
    const blockVisitLimit = 4 * stats.blocks;
    const hashOpLimit = 12 * (stats.entries + stats.atomMembershipEdges + stats.blocks);
    const checks = {
      entryVisits: input.counters.entryVisits <= entryVisitLimit,
      atomMembershipVisits: input.counters.atomMembershipVisits <= atomMembershipVisitLimit,
      blockVisits: input.counters.blockVisits <= blockVisitLimit,
      hashOps: input.counters.hashOps <= hashOpLimit,
      declaredColdBuild: input.counters.fullRebuilds === 1,
      noHiddenScan: input.counters.fullScans === 0,
      noFallback: input.counters.fallbacks === 0,
      structural,
    };
    return {
      operation: input.operation,
      passed: Object.values(checks).every(Boolean),
      entryVisitLimit,
      atomMembershipVisitLimit,
      blockVisitLimit,
      hashOpLimit,
      retainedRecordLimit: stats.retainedRecordLimit,
      checks,
    };
  }
  if (input.operation === "incremental-append") {
    const entryVisitLimit = 3 * input.newEntries;
    const checks = {
      entryVisits: input.counters.entryVisits <= entryVisitLimit,
      noPreTipVisit: input.counters.preTipEntryVisits === 0,
      noFullRebuild: input.counters.fullRebuilds === 0,
      noFullScan: input.counters.fullScans === 0,
      noFallback: input.counters.fallbacks === 0,
      structural,
    };
    return {
      operation: input.operation,
      passed: Object.values(checks).every(Boolean),
      entryVisitLimit,
      retainedRecordLimit: stats.retainedRecordLimit,
      checks,
    };
  }
  const hashLookupLimit = 3 * input.referenceOperations;
  const checks = {
    hashLookups: input.counters.hashLookups <= hashLookupLimit,
    noFullScan: input.counters.fullScans === 0,
    noFallback: input.counters.fallbacks === 0,
    structural,
  };
  return {
    operation: input.operation,
    passed: Object.values(checks).every(Boolean),
    hashLookupLimit,
    retainedRecordLimit: stats.retainedRecordLimit,
    checks,
  };
}

export interface BranchIndexPerformanceEvidence {
  version: typeof BRANCH_INDEX_VERSION;
  seed: string;
  operation: BranchIndexBudgetInput["operation"];
  counts: BranchIndexStats;
  counters: BranchIndexCounters;
  canonicalStateDigest: string;
  sourceDigest: string;
  catalogId: string;
  budget: BranchIndexBudgetEvidence;
  runtime: { node: string; platform: string; pi?: string };
  comparative: { durationMs?: number; heapDeltaBytes?: number };
}

export function branchIndexPerformanceEvidence(
  seed: string,
  input: BranchIndexBudgetInput,
  comparative: { durationMs?: number; heapDeltaBytes?: number; nodeVersion?: string; platform?: string; piVersion?: string } = {},
): BranchIndexPerformanceEvidence {
  return {
    version: BRANCH_INDEX_VERSION,
    seed,
    operation: input.operation,
    counts: input.snapshot.stats,
    counters: input.counters,
    canonicalStateDigest: input.snapshot.canonicalStateDigest,
    sourceDigest: input.snapshot.sourceDigest,
    catalogId: input.snapshot.catalogId,
    budget: evaluateBranchIndexBudget(input),
    runtime: {
      node: comparative.nodeVersion ?? process.version,
      platform: comparative.platform ?? process.platform,
      ...(comparative.piVersion ? { pi: comparative.piVersion } : {}),
    },
    comparative: {
      ...(comparative.durationMs === undefined ? {} : { durationMs: comparative.durationMs }),
      ...(comparative.heapDeltaBytes === undefined ? {} : { heapDeltaBytes: comparative.heapDeltaBytes }),
    },
  };
}

interface CachedSnapshot {
  snapshot: BranchIndexSnapshot;
  lastUsed: number;
}

export type BranchSnapshotSwitchResult = {
  ok: true;
  snapshot: BranchIndexSnapshot;
  counters: BranchIndexCounters;
} | {
  ok: false;
  rebuildRequired: true;
  diagnostic: "ancestry-mismatch" | "cache-miss";
  counters: BranchIndexCounters;
};

/** Deterministic four-snapshot LRU plus a separate bounded archived-epoch index. */
export class BranchIndexCache {
  readonly maxSnapshots: number;
  private readonly snapshots = new Map<string, CachedSnapshot>();
  private readonly archived = new Map<string, CachedSnapshot>();
  private clock = 0;
  private currentKeyId?: string;
  private cumulative = emptyBranchIndexCounters();

  constructor(maxSnapshots = DEFAULT_BRANCH_SNAPSHOT_LRU) {
    this.maxSnapshots = Number.isInteger(maxSnapshots) && maxSnapshots > 0
      ? Math.min(DEFAULT_BRANCH_SNAPSHOT_LRU, maxSnapshots)
      : DEFAULT_BRANCH_SNAPSHOT_LRU;
  }

  get current(): BranchIndexSnapshot | undefined {
    return this.currentKeyId ? this.snapshots.get(this.currentKeyId)?.snapshot : undefined;
  }

  get size(): number {
    return this.snapshots.size;
  }

  get archivedSize(): number {
    return this.archived.size;
  }

  counters(): BranchIndexCounters {
    return { ...this.cumulative };
  }

  recordFullV3RuntimeViewBuild(): void {
    const counters = emptyBranchIndexCounters();
    counters.fullV3RuntimeViewBuilds = 1;
    this.cumulative = addBranchIndexCounters(this.cumulative, counters);
  }

  recordIndexedV3RuntimeViewBuild(): void {
    const counters = emptyBranchIndexCounters();
    counters.indexedV3RuntimeViewBuilds = 1;
    this.cumulative = addBranchIndexCounters(this.cumulative, counters);
  }

  alignProviderMessages<T extends Record<string, unknown>>(
    messages: readonly T[],
    options: BranchProviderAlignmentOptions = {},
  ): BranchProviderAlignmentResult | undefined {
    const current = this.current;
    if (!current) return undefined;
    const result = alignBranchProviderMessages(current, messages, options);
    this.cumulative = addBranchIndexCounters(this.cumulative, result.counters);
    return result;
  }

  pageReferences(offset = 0, limit = 32): BranchIndexLookupResult<BranchReferencePage> | undefined {
    const current = this.current;
    if (!current) return undefined;
    const result = pageBranchReferences(current, {
      keyId: current.keyId,
      catalogId: current.catalogId,
    }, offset, limit);
    this.cumulative = addBranchIndexCounters(this.cumulative, result.counters);
    return result;
  }

  promotionGapIndex(): PromotionGapIndexV1 | undefined {
    const current = this.current;
    if (!current) return undefined;
    const result = getBranchPromotionGapIndex(current);
    this.cumulative = addBranchIndexCounters(this.cumulative, result.counters);
    return result.index;
  }

  snapshotIds(): readonly string[] {
    return [...this.snapshots.keys()].sort();
  }

  install(result: ColdBranchIndexResult | AppendBranchIndexResult): BranchIndexSnapshot | undefined {
    this.cumulative = addBranchIndexCounters(this.cumulative, result.counters);
    if (!result.ok) return undefined;
    this.remember(result.snapshot, true);
    return result.snapshot;
  }

  /** Records a pure verification pass that does not create or replace a snapshot. */
  recordAuxiliaryCounters(counters: BranchIndexCounters): void {
    this.cumulative = addBranchIndexCounters(this.cumulative, counters);
  }

  append(input: AppendBranchIndexInput): AppendBranchIndexResult | undefined {
    const current = this.current;
    if (!current) return undefined;
    const result = appendBranchIndex(current, input);
    this.install(result);
    return result;
  }

  switchCached(key: BranchIndexKey, proof: BranchAncestryProof): BranchSnapshotSwitchResult {
    const counters = emptyBranchIndexCounters();
    counters.ancestryDigestChecks = 1;
    const cached = this.snapshots.get(branchIndexKeyId(key));
    if (!cached) {
      counters.fallbacks = 1;
      this.cumulative = addBranchIndexCounters(this.cumulative, counters);
      return { ok: false, rebuildRequired: true, diagnostic: "cache-miss", counters };
    }
    if (!verifyBranchAncestryProof(cached.snapshot, proof)
      || proof.length !== cached.snapshot.stats.entries
      || proof.tipEntryId !== cached.snapshot.tipEntryId) {
      counters.fallbacks = 1;
      this.cumulative = addBranchIndexCounters(this.cumulative, counters);
      return { ok: false, rebuildRequired: true, diagnostic: "ancestry-mismatch", counters };
    }
    counters.snapshotSwitches = 1;
    cached.lastUsed = ++this.clock;
    this.currentKeyId = cached.snapshot.keyId;
    this.cumulative = addBranchIndexCounters(this.cumulative, counters);
    return { ok: true, snapshot: cached.snapshot, counters };
  }

  rolloverEpoch(input: ColdBranchIndexInput): ColdBranchIndexResult {
    const current = this.current;
    const result = coldBuildBranchIndex(input);
    if (!result.ok) {
      this.cumulative = addBranchIndexCounters(this.cumulative, result.counters);
      return result;
    }
    if (current) {
      this.archived.set(current.keyId, { snapshot: current, lastUsed: ++this.clock });
      this.snapshots.delete(current.keyId);
      result.counters.snapshotEvictions += this.trim(this.archived, undefined);
      result.counters.epochArchives += 1;
    }
    this.install(result);
    return result;
  }

  resolveArchivedMessage(
    keyId: string,
    catalogId: string,
    ref: string,
  ): BranchIndexLookupResult<BranchMessageReference> {
    const cached = this.archived.get(keyId);
    if (!cached) return { diagnostic: "stale-scope", counters: emptyBranchIndexCounters() };
    cached.lastUsed = ++this.clock;
    const result = resolveBranchMessageReference(cached.snapshot, { keyId, catalogId }, ref);
    result.counters.hashLookups += 1;
    this.cumulative = addBranchIndexCounters(this.cumulative, result.counters);
    return result;
  }

  discardSession(sessionId: string, canonicalSessionPathDigest?: string): BranchIndexCounters {
    const counters = emptyBranchIndexCounters();
    const current = this.current;
    for (const [key, cached] of [...this.snapshots, ...this.archived]) {
      if (cached.snapshot.key.sessionId === sessionId
        && (canonicalSessionPathDigest === undefined
          || cached.snapshot.key.canonicalSessionPathDigest === canonicalSessionPathDigest)) {
        this.snapshots.delete(key);
        this.archived.delete(key);
      }
    }
    if (current && current.key.sessionId === sessionId
      && (canonicalSessionPathDigest === undefined
        || current.key.canonicalSessionPathDigest === canonicalSessionPathDigest)) this.currentKeyId = undefined;
    counters.sessionDiscards = 1;
    this.cumulative = addBranchIndexCounters(this.cumulative, counters);
    return counters;
  }

  shutdown(): BranchIndexCounters {
    const counters = emptyBranchIndexCounters();
    counters.sessionDiscards = this.snapshots.size + this.archived.size > 0 ? 1 : 0;
    this.snapshots.clear();
    this.archived.clear();
    this.currentKeyId = undefined;
    this.cumulative = addBranchIndexCounters(this.cumulative, counters);
    return counters;
  }

  private remember(snapshot: BranchIndexSnapshot, current: boolean): void {
    this.snapshots.set(snapshot.keyId, { snapshot, lastUsed: ++this.clock });
    if (current) this.currentKeyId = snapshot.keyId;
    const evictions = this.trim(this.snapshots, this.currentKeyId);
    if (evictions > 0) {
      const counters = emptyBranchIndexCounters();
      counters.snapshotEvictions = evictions;
      this.cumulative = addBranchIndexCounters(this.cumulative, counters);
    }
  }

  private trim(values: Map<string, CachedSnapshot>, protectedId: string | undefined): number {
    let evictions = 0;
    while (values.size > this.maxSnapshots) {
      const candidates = [...values.entries()]
        .filter(([id]) => id !== protectedId)
        .sort(([leftId, left], [rightId, right]) => left.lastUsed - right.lastUsed || leftId.localeCompare(rightId));
      const victim = candidates[0];
      if (!victim) break;
      values.delete(victim[0]);
      evictions += 1;
    }
    return evictions;
  }
}
