import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  AILI_COMPACT_ENTRY,
  AILI_COMPACT_SCHEMA_V1,
  AILI_COMPACT_SCHEMA_V2,
  digest,
  sourceDigest,
  type CompactBlock,
  type CompactTransaction,
} from "../../src/runtime/aili-compact/contracts.js";
import {
  appendBranchIndex,
  auditBranchIndexReplayHealth,
  branchAncestryProof,
  branchIndexPerformanceEvidence,
  branchIndexesShareEntryPrefix,
  branchIndexStructuralIdentity,
  BranchIndexCache,
  coldBuildBranchIndex,
  emptyBranchIndexCounters,
  evaluateBranchIndexBudget,
  getFingerprintOccurrences,
  getIndexedEntry,
  listBranchProtocolAtoms,
  resolveBranchReferences,
  type BranchIndexKey,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  applyV3Transaction,
  createEmptyV3State,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3SemanticCreatePayload,
  type V3Tier,
  type V3TokenMetadata,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

const FIXED_SEED = 0x5eed_c0de;
const PROVIDER_MESSAGE_COUNT = 10_000;
const REFERENCE_OPERATION_COUNT = 100_000;
const RAW_BODY_SENTINEL = "private-source-body-sentinel-never-report";
const CREDENTIAL_SENTINEL = "synthetic-secret-sentinel-never-report";
const DUPLICATE_BODY = "fixed-duplicate-alignment-body";
const FACT_DIGEST = "f".repeat(64);
const ARTIFACT_PATH = join(process.cwd(), "artifacts", "test-results", "aili-compact-branch-index-performance.json");

interface GuardState {
  readonly entryId: string;
  readonly entry: BranchSessionEntry;
  arm(): void;
  touches(): number;
}

interface PerformanceCorpus {
  readonly entries: BranchSessionEntry[];
  readonly guards: readonly GuardState[];
  readonly duplicateEntryIds: readonly [string, string];
  readonly protocolFaultCount: number;
  readonly schemaTransactionCount: Readonly<Record<"v1" | "v2" | "v3", number>>;
}

describe("AILI Compact BranchIndex PR4 deterministic unit gate", () => {
  it("meets fixed-seed operation and structural-memory budgets with guarded source identity", () => {
    const corpus = buildPerformanceCorpus();
    expect(corpus.entries.filter((entry) => entry.type === "message")).toHaveLength(PROVIDER_MESSAGE_COUNT);

    const heapBefore = process.memoryUsage().heapUsed;
    const coldStarted = performance.now();
    const built = coldBuildBranchIndex({
      key: key(corpus.entries.at(-1)!.id),
      entries: corpus.entries,
      derivedVersions: {
        providerId: "fixture-provider",
        modelId: "fixture-model",
        estimatorVersion: "fixture-estimator-v1",
        projectionVersion: "projection-v3",
        qualityVersion: "quality-v1",
        configVersion: "fixture-config-v1",
      },
    });
    const coldDurationMs = performance.now() - coldStarted;
    const coldHeapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const coldBudget = evaluateBranchIndexBudget({
      operation: "cold-build",
      snapshot: built.snapshot,
      counters: built.counters,
    });
    expect(coldBudget).toEqual(expect.objectContaining({
      passed: true,
      entryVisitLimit: 3 * built.snapshot.stats.entries,
      atomMembershipVisitLimit: 4 * built.snapshot.stats.atomMembershipEdges,
      blockVisitLimit: 4 * built.snapshot.stats.blocks,
      hashOpLimit: 12 * (
        built.snapshot.stats.entries
        + built.snapshot.stats.atomMembershipEdges
        + built.snapshot.stats.blocks
      ),
      checks: expect.objectContaining({
        noHiddenScan: true,
        noFallback: true,
        structural: true,
      }),
    }));
    expect(built.counters.entryVisits).toBe(3 * built.snapshot.stats.entries);
    expect(built.counters.atomMembershipVisits).toBe(built.snapshot.stats.atomMembershipEdges);
    expect(built.counters.transactionReplayRuns).toBe(7);
    expect(built.counters.fullScans).toBe(0);
    expect(built.counters.fullReducerRuns).toBe(0);
    expect(built.counters.fallbacks).toBe(0);

    const stats = built.snapshot.stats;
    expect(stats.retainedRecords).toBe(
      6 * stats.entries + 3 * stats.atomMembershipEdges + 5 * stats.blocks + 2 * stats.catalogRefs,
    );
    expect(stats.retainedRecordLimit).toBe(
      6 * stats.entries + 3 * stats.atomMembershipEdges + 8 * stats.blocks + 2 * stats.catalogRefs,
    );
    expect(stats.retainedRecords).toBeLessThanOrEqual(stats.retainedRecordLimit);

    const atoms = listBranchProtocolAtoms(built.snapshot);
    const hardProtectedProtocolAtoms = atoms.filter((atom) => atom.hardProtected).length;
    expect(hardProtectedProtocolAtoms).toBeGreaterThanOrEqual(1);

    const duplicateFingerprint = getIndexedEntry(built.snapshot, corpus.duplicateEntryIds[0])!.alignmentFingerprint;
    expect(getIndexedEntry(built.snapshot, corpus.duplicateEntryIds[1])!.alignmentFingerprint).toBe(duplicateFingerprint);
    expect(getFingerprintOccurrences(built.snapshot, duplicateFingerprint)).toEqual([42, 43]);

    const health = auditBranchIndexReplayHealth(built.snapshot, corpus.entries);
    expect(health.healthy).toBe(true);
    expect(health.indexedDigest).toBe(health.oracleDigest);
    expect(health.counters).toEqual(expect.objectContaining({
      fullReducerRuns: 1,
      fallbacks: 0,
      failOpenReturns: 0,
    }));

    for (const guard of corpus.guards) {
      expect(getIndexedEntry(built.snapshot, guard.entryId)?.entry).toBe(guard.entry);
      guard.arm();
    }

    let queryState = FIXED_SEED;
    const queries = Array.from({ length: REFERENCE_OPERATION_COUNT }, (_, index) => {
      queryState = nextSeed(queryState);
      if (index % 997 === 0 && stats.blockRefs > 0) {
        return {
          kind: "block" as const,
          ref: `b${String(queryState % stats.blockRefs + 1).padStart(6, "0")}`,
        };
      }
      return {
        kind: "message" as const,
        ref: `m${String(queryState % stats.messageRefs + 1).padStart(6, "0")}`,
      };
    });
    const lookupHeapBefore = process.memoryUsage().heapUsed;
    const lookupStarted = performance.now();
    const resolved = resolveBranchReferences(built.snapshot, {
      keyId: built.snapshot.keyId,
      catalogId: built.snapshot.catalogId,
    }, queries);
    const lookupDurationMs = performance.now() - lookupStarted;
    const lookupHeapDeltaBytes = process.memoryUsage().heapUsed - lookupHeapBefore;
    expect(resolved.values).toHaveLength(REFERENCE_OPERATION_COUNT);
    expect(resolved.values.every(Boolean)).toBe(true);
    expect(resolved.counters).toEqual({
      ...emptyBranchIndexCounters(),
      hashLookups: REFERENCE_OPERATION_COUNT,
    });
    const lookupBudget = evaluateBranchIndexBudget({
      operation: "reference-lookup",
      snapshot: built.snapshot,
      counters: resolved.counters,
      referenceOperations: REFERENCE_OPERATION_COUNT,
    });
    expect(lookupBudget).toEqual(expect.objectContaining({
      passed: true,
      hashLookupLimit: 3 * REFERENCE_OPERATION_COUNT,
      checks: expect.objectContaining({ noFullScan: true, noFallback: true, structural: true }),
    }));

    const prefixIdentity = branchIndexStructuralIdentity(built.snapshot);
    const appendEntry = message("incremental-after-corpus", "assistant", "bounded incremental event", built.snapshot.tipEntryId);
    const appendStarted = performance.now();
    const appended = appendBranchIndex(built.snapshot, {
      entries: [appendEntry],
      expectedParentId: built.snapshot.tipEntryId,
      expectedPriorDigest: built.snapshot.sourceDigest,
      nextBranchLeafId: appendEntry.id,
    });
    const appendDurationMs = performance.now() - appendStarted;
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(appended.counters).toEqual({
      ...emptyBranchIndexCounters(),
      entryVisits: 3,
      atomMembershipVisits: 3,
      hashOps: 6,
      incrementalAppends: 1,
    });
    expect(evaluateBranchIndexBudget({
      operation: "incremental-append",
      snapshot: appended.snapshot,
      counters: appended.counters,
      newEntries: 1,
    }).passed).toBe(true);
    expect(branchIndexesShareEntryPrefix(built.snapshot, appended.snapshot)).toBe(true);
    const appendedIdentity = branchIndexStructuralIdentity(appended.snapshot);
    expect(appendedIdentity.entryTail).not.toBe(prefixIdentity.entryTail);
    expect(appendedIdentity.replayRoot).toBe(prefixIdentity.replayRoot);
    expect(appendedIdentity.blockRoot).toBe(prefixIdentity.blockRoot);
    for (const guard of corpus.guards) {
      expect(getIndexedEntry(appended.snapshot, guard.entryId)?.entry).toBe(guard.entry);
      expect(guard.touches()).toBe(0);
    }

    const badEntry = message("msg-000001", "assistant", "duplicate id", built.snapshot.tipEntryId);
    const failed = appendBranchIndex(built.snapshot, { entries: [badEntry] });
    expect(failed).toEqual(expect.objectContaining({
      ok: false,
      code: "duplicate-entry-id",
      rebuildRequired: true,
      snapshot: built.snapshot,
      counters: expect.objectContaining({
        entryVisits: 1,
        fullRebuilds: 0,
        fallbacks: 1,
        failOpenReturns: 1,
      }),
    }));

    const lifecycle = exerciseForkEpochLruAndCleanup(built.snapshot);
    for (const guard of corpus.guards) expect(guard.touches()).toBe(0);

    const coldEvidence = branchIndexPerformanceEvidence("pr4-fixed-seed-5eedc0de", {
      operation: "cold-build",
      snapshot: built.snapshot,
      counters: built.counters,
    }, {
      durationMs: roundMillis(coldDurationMs),
      heapDeltaBytes: coldHeapDeltaBytes,
      piVersion: "0.82.1-declared-baseline",
    });
    const appendEvidence = branchIndexPerformanceEvidence("pr4-fixed-seed-5eedc0de", {
      operation: "incremental-append",
      snapshot: appended.snapshot,
      counters: appended.counters,
      newEntries: 1,
    }, {
      durationMs: roundMillis(appendDurationMs),
      piVersion: "0.82.1-declared-baseline",
    });
    const lookupEvidence = branchIndexPerformanceEvidence("pr4-fixed-seed-5eedc0de", {
      operation: "reference-lookup",
      snapshot: built.snapshot,
      counters: resolved.counters,
      referenceOperations: REFERENCE_OPERATION_COUNT,
    }, {
      durationMs: roundMillis(lookupDurationMs),
      heapDeltaBytes: lookupHeapDeltaBytes,
      piVersion: "0.82.1-declared-baseline",
    });

    const report = {
      schema: "aili.compact.branch-index.performance.v1",
      scope: "branch-index-unit-only",
      verdict: "PASS",
      seed: "0x5eedc0de",
      generatedCorpus: {
        providerMessages: PROVIDER_MESSAGE_COUNT,
        sessionEntries: corpus.entries.length,
        messageReferences: stats.messageRefs,
        referenceOperations: REFERENCE_OPERATION_COUNT,
        duplicateFingerprintOrdinals: [42, 43],
        protocolFaults: corpus.protocolFaultCount,
        hardProtectedProtocolAtoms,
        schemaTransactions: corpus.schemaTransactionCount,
        restoreSequence: ["v3-decompress-one", "v3-exact-recompress"],
      },
      evidence: { cold: coldEvidence, incrementalAppend: appendEvidence, referenceLookup: lookupEvidence },
      exactCounterChecks: {
        coldEntryVisits: built.counters.entryVisits === 3 * stats.entries,
        coldAtomMembershipVisits: built.counters.atomMembershipVisits === stats.atomMembershipEdges,
        coldFullScansZero: built.counters.fullScans === 0,
        appendPreTipEntryVisitsZero: appended.counters.preTipEntryVisits === 0,
        appendFullRebuildsZero: appended.counters.fullRebuilds === 0,
        lookupHashLookupsExact: resolved.counters.hashLookups === REFERENCE_OPERATION_COUNT,
        lookupFullScansZero: resolved.counters.fullScans === 0,
      },
      structuralMemory: {
        formula: "retainedRecords=6E+3A+5B+2C; limit=6E+3A+8B+2C",
        retainedRecords: stats.retainedRecords,
        retainedRecordLimit: stats.retainedRecordLimit,
        withinLimit: stats.retainedRecords <= stats.retainedRecordLimit,
        sourceObjectIdentityRetained: true,
        guardedSourceTouchesAfterBuild: corpus.guards.reduce((sum, guard) => sum + guard.touches(), 0),
        lruLimit: 4,
        lruObservedMax: lifecycle.lruObservedMax,
      },
      correctness: {
        pureReplayEquivalent: health.healthy,
        indexedReplayDigest: health.indexedDigest,
        oracleReplayDigest: health.oracleDigest,
        prefixStructurallyShared: branchIndexesShareEntryPrefix(built.snapshot, appended.snapshot),
        forkDigestsDiverged: lifecycle.forkDigestsDiverged,
        epochArchivedAndScoped: lifecycle.epochArchivedAndScoped,
        injectedFaultFailedOpen: failed.ok === false && failed.counters.failOpenReturns === 1,
        faultCleanupDiscardedAll: lifecycle.faultCleanupDiscardedAll,
      },
      sanitizer: {
        sourceBodiesIncluded: false,
        credentialsIncluded: false,
      },
      productionExtensionGate: {
        status: "NOT_RUN",
        reason: "This report exercises BranchIndex APIs directly; registered Extension event-table and production-entry 10K/100K gates remain separate.",
      },
    } as const;

    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    expect(serialized).not.toContain(RAW_BODY_SENTINEL);
    expect(serialized).not.toContain(CREDENTIAL_SENTINEL);
    expect(serialized).not.toMatch(/(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,})/i);
    expect(report.evidence.cold.budget.passed).toBe(true);
    expect(report.evidence.incrementalAppend.budget.passed).toBe(true);
    expect(report.evidence.referenceLookup.budget.passed).toBe(true);
    expect(report.structuralMemory.guardedSourceTouchesAfterBuild).toBe(0);
    mkdirSync(join(process.cwd(), "artifacts", "test-results"), { recursive: true });
    writeFileSync(ARTIFACT_PATH, serialized, "utf8");
  }, 60_000);
});

function buildPerformanceCorpus(): PerformanceCorpus {
  const guards: GuardState[] = [];
  const entries: BranchSessionEntry[] = [];
  let seed = FIXED_SEED;
  let protocolFaultCount = 0;
  for (let ordinal = 1; ordinal <= PROVIDER_MESSAGE_COUNT - 4; ordinal += 1) {
    seed = nextSeed(seed);
    const id = `msg-${String(ordinal).padStart(6, "0")}`;
    const parentId = entries.at(-1)?.id;
    let entry: BranchSessionEntry;
    if (ordinal === 997) {
      protocolFaultCount += 1;
      entry = toolCall(id, "fault-unresolved", "read", parentId);
    } else if (ordinal === 1_999) {
      protocolFaultCount += 1;
      entry = toolResult(id, "fault-orphan", "read", parentId, "orphan");
    } else if (ordinal === 3_000) {
      entry = toolCall(id, "fault-duplicate-result", "read", parentId);
    } else if (ordinal === 3_001 || ordinal === 3_002) {
      if (ordinal === 3_002) protocolFaultCount += 1;
      entry = toolResult(id, "fault-duplicate-result", "read", parentId, "duplicate-result");
    } else {
      const role = ordinal === 42 || ordinal === 43 ? "user" : ordinal % 2 === 0 ? "assistant" : "user";
      const content = ordinal === 42 || ordinal === 43
        ? DUPLICATE_BODY
        : ordinal === 5_000
          ? `${RAW_BODY_SENTINEL}:${CREDENTIAL_SENTINEL}`
          : `fixed-bucket-${seed % 64}`;
      entry = message(id, role, content, parentId);
    }
    if (ordinal === 1 || ordinal === 5_000 || ordinal === PROVIDER_MESSAGE_COUNT - 4) {
      const guarded = guardEntry(entry);
      guards.push(guarded);
      entry = guarded.entry;
    }
    entries.push(entry);
  }

  appendLegacyTransactions(entries);
  appendV3Lifecycle(entries);
  return {
    entries,
    guards,
    duplicateEntryIds: ["msg-000042", "msg-000043"],
    protocolFaultCount,
    schemaTransactionCount: { v1: 1, v2: 1, v3: 5 },
  };
}

function appendLegacyTransactions(entries: BranchSessionEntry[]): void {
  const v1SourceId = "msg-000010";
  const v1Block: CompactBlock = {
    id: "legacy-v1-block",
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [v1SourceId],
    sourceDigest: sourceDigest(entries, [v1SourceId]),
    summary: "legacy v1 summary",
    active: true,
  };
  const v1: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA_V1,
    id: "legacy-v1-create",
    kind: "compact",
    epochId: "root",
    sourceEntryIds: [v1SourceId],
    sourceDigest: v1Block.sourceDigest,
    blocks: [v1Block],
  };
  appendCommittedLegacy(entries, v1);

  const v2SourceId = "msg-000020";
  const v2Block: CompactBlock = {
    id: "legacy-v2-block",
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [v2SourceId],
    sourceDigest: sourceDigest(entries, [v2SourceId]),
    summary: "legacy v2 summary",
    active: true,
    mode: "message",
    topic: "legacy-v2",
    batchTopic: "legacy-v2",
    anchorEntryId: v2SourceId,
    runId: "legacy-v2-run",
    childBlockIds: [],
    generation: "young",
    survivedCount: 0,
    age: 0,
  };
  const v2: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA_V2,
    id: "legacy-v2-create",
    kind: "compact",
    epochId: "root",
    sourceEntryIds: [v2SourceId],
    sourceDigest: v2Block.sourceDigest,
    blocks: [v2Block],
  };
  appendCommittedLegacy(entries, v2);
}

function appendCommittedLegacy(entries: BranchSessionEntry[], transaction: CompactTransaction): void {
  const callEntry = toolCall(
    `${transaction.id}-call`,
    transaction.id,
    "aili_compact",
    entries.at(-1)?.id,
  );
  entries.push(callEntry);
  entries.push({
    id: `${transaction.id}-result`,
    type: "message",
    parentId: callEntry.id,
    message: {
      role: "toolResult",
      toolCallId: transaction.id,
      toolName: "aili_compact",
      content: "committed",
      details: { contextTx: transaction },
    },
  });
}

function appendV3Lifecycle(entries: BranchSessionEntry[]): void {
  let state = createEmptyV3State({
    sessionId: "perf-session",
    branchLeafId: "perf-v3-leaf",
    epochId: "root",
    projectionVersion: "projection-v3",
  });
  const sourceA = "msg-000200";
  const sourceB = "msg-000201";

  const firstCatalog = publicCatalogId(entries, state);
  const first = t1(state, "v3-t1-a", sourceA, 1, firstCatalog);
  state = applied(state, first, firstCatalog, new Map([[sourceA, 200]]));
  entries.push(custom("v3-t1-a-entry", first, entries.at(-1)?.id));

  const secondCatalog = publicCatalogId(entries, state);
  const second = t1(state, "v3-t1-b", sourceB, 2, secondCatalog);
  state = applied(state, second, secondCatalog, new Map([[sourceB, 201]]));
  entries.push(custom("v3-t1-b-entry", second, entries.at(-1)?.id));

  const parentCatalog = publicCatalogId(entries, state);
  const parent = t2(state, parentCatalog);
  state = applied(state, parent, parentCatalog);
  entries.push(custom("v3-t2-entry", parent, entries.at(-1)?.id));

  const decompressCatalog = publicCatalogId(entries, state);
  const decompress: V3Transaction = {
    header: header(state, "v3-decompress-one", 4, decompressCatalog),
    tag: "decompress",
    payload: {
      rootBlockIds: ["v3-t2"],
      depth: "one",
      provenance: { kind: "explicit-user", id: "performance-decompress-request" },
      reason: "decompress",
    },
  };
  state = applied(state, decompress, decompressCatalog);
  entries.push(custom("v3-decompress-entry", decompress, entries.at(-1)?.id));

  const recompressCatalog = publicCatalogId(entries, state);
  const recompress: V3Transaction = {
    header: header(state, "v3-exact-recompress", 5, recompressCatalog),
    tag: "recompress",
    payload: {
      rootBlockIds: ["v3-t2"],
      decompressionTxId: "v3-decompress-one",
      provenance: { kind: "explicit-user", id: "performance-recompress-request" },
      reason: "recompress",
    },
  };
  applied(state, recompress, recompressCatalog);
  entries.push(custom("v3-recompress-entry", recompress, entries.at(-1)?.id));
}

function t1(
  state: V3LifecycleState,
  blockId: string,
  entryId: string,
  createdAt: number,
  catalogId: string,
): V3Transaction {
  const summary = `summary:${blockId}`;
  return semantic(state, `tx:${blockId}`, createdAt, catalogId, {
    blockId,
    tier: "T1",
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: entryId,
    createdTurnOrdinal: createdAt,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "messages", entryIds: [entryId], firstEntryId: entryId, lastEntryId: entryId },
    leafDigest: v3MessageLeafDigest([entryId]),
    leafCount: 1,
    tokens: tokens("T1"),
    quality: quality(),
  });
}

function t2(state: V3LifecycleState, catalogId: string): V3Transaction {
  const children = [state.blocks.get("v3-t1-a")!, state.blocks.get("v3-t1-b")!];
  const summary = "summary:v3-t2";
  return semantic(state, "tx:v3-t2", 3, catalogId, {
    blockId: "v3-t2",
    tier: "T2",
    topic: "topic:v3-t2",
    runId: "run:v3-t2",
    anchorEntryId: children[0]!.anchorEntryId,
    createdTurnOrdinal: 3,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "blocks", childBlockIds: children.map((block) => block.blockId) },
    leafDigest: v3ParentLeafDigest("T2", 2, children.map((block) => block.leafDigest)),
    leafCount: 2,
    tokens: tokens("T2"),
    quality: quality(),
  });
}

function semantic(
  state: V3LifecycleState,
  txId: string,
  createdAt: number,
  catalogId: string,
  payload: V3SemanticCreatePayload,
): V3Transaction {
  return { header: header(state, txId, createdAt, catalogId), tag: "semantic-create", payload };
}

function header(state: V3LifecycleState, txId: string, createdAt: number, catalogId: string) {
  return {
    schema: AILI_COMPACT_SCHEMA_V3,
    txId,
    sessionId: state.sessionId,
    branchLeafId: state.branchLeafId,
    epochId: state.epochId,
    catalogId,
    createdAt,
    projectionVersion: state.projectionVersion,
  } as const;
}

function tokens(tier: V3Tier): V3TokenMetadata {
  const sourceTokensLower = 3_000;
  const replacementTokensUpper = tier === "T1" ? 1_000 : 1_500;
  const steadySavingsTokensLower = sourceTokensLower - replacementTokensUpper;
  return {
    estimatorVersion: "fixture-estimator-v1",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    sourceTokensLower,
    sourceTokensUpper: sourceTokensLower,
    replacementTokensUpper,
    steadySavingsTokensLower,
    oneTimeCostTokensUpper: 500,
    breakEvenTurnsUpper: Math.ceil(500 / steadySavingsTokensLower),
    savingsRatio: steadySavingsTokensLower / sourceTokensLower,
    summaryTokensUpper: 300,
  };
}

function quality() {
  return {
    status: "accepted" as const,
    evaluatorVersion: "quality-v1",
    sourceFactDigest: FACT_DIGEST,
    hardFactCount: 1,
    coveredHardFactCount: 1,
    warningCodes: [] as string[],
  };
}

function applied(
  state: V3LifecycleState,
  transaction: V3Transaction,
  expectedCatalogId: string,
  messageOrdinals?: ReadonlyMap<string, number>,
): V3LifecycleState {
  const result = applyV3Transaction(state, transaction, {
    expectedCatalogId,
    ...(messageOrdinals ? { messageOrdinals } : {}),
  });
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function publicCatalogId(entries: readonly BranchSessionEntry[], state: V3LifecycleState): string {
  return deriveRuntimeCatalogIdForState(entries, reduceCompactState(entries), state);
}

function exerciseForkEpochLruAndCleanup(snapshot: Extract<ReturnType<typeof coldBuildBranchIndex>, { ok: true }>["snapshot"]): {
  lruObservedMax: number;
  forkDigestsDiverged: boolean;
  epochArchivedAndScoped: boolean;
  faultCleanupDiscardedAll: boolean;
} {
  const forkCache = new BranchIndexCache(4);
  forkCache.install({ ok: true, operation: "cold-build", snapshot, counters: emptyBranchIndexCounters() });
  const proof = branchAncestryProof(snapshot)!;
  const main = forkCache.append({
    entries: [message("main-fork-entry", "assistant", "main", snapshot.tipEntryId)],
    nextBranchLeafId: "main-fork-entry",
  });
  expect(main?.ok).toBe(true);
  expect(forkCache.switchCached(snapshot.key, proof).ok).toBe(true);
  const fork = forkCache.append({
    entries: [message("sibling-fork-entry", "assistant", "sibling", snapshot.tipEntryId)],
    nextBranchLeafId: "sibling-fork-entry",
  });
  expect(fork?.ok).toBe(true);
  if (!main?.ok || !fork?.ok) throw new Error("fork fixture failed");
  expect(branchIndexesShareEntryPrefix(snapshot, main.snapshot)).toBe(true);
  expect(branchIndexesShareEntryPrefix(snapshot, fork.snapshot)).toBe(true);

  for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
    const entry = message(`lru-${ordinal}`, "user", `lru-${ordinal}`);
    const built = coldBuildBranchIndex({ key: key(entry.id, `lru-epoch-${ordinal}`), entries: [entry] });
    expect(built.ok).toBe(true);
    if (built.ok) forkCache.install(built);
  }
  expect(forkCache.size).toBe(4);
  expect(forkCache.counters().snapshotEvictions).toBeGreaterThanOrEqual(1);

  const epochCache = new BranchIndexCache(4);
  epochCache.install({ ok: true, operation: "cold-build", snapshot, counters: emptyBranchIndexCounters() });
  const nextEpochEntry = message("epoch-message", "user", "new epoch", "checkpoint-1");
  const nextEpoch = epochCache.rolloverEpoch({
    key: key(nextEpochEntry.id, "checkpoint-1"),
    entries: [nextEpochEntry],
  });
  expect(nextEpoch.ok).toBe(true);
  if (!nextEpoch.ok) throw new Error("epoch fixture failed");
  const archived = epochCache.resolveArchivedMessage(snapshot.keyId, snapshot.catalogId, "m000001");
  expect(archived.value?.entryId).toBe("msg-000001");
  const epochArchivedAndScoped = epochCache.archivedSize === 1
    && archived.diagnostic === undefined
    && nextEpoch.counters.epochArchives === 1;

  const faultCache = new BranchIndexCache(4);
  faultCache.install({ ok: true, operation: "cold-build", snapshot, counters: emptyBranchIndexCounters() });
  const failed = faultCache.append({
    entries: [message("msg-000001", "assistant", "duplicate", snapshot.tipEntryId)],
  });
  expect(failed?.ok).toBe(false);
  expect(failed?.counters).toEqual(expect.objectContaining({ fallbacks: 1, failOpenReturns: 1 }));
  expect(faultCache.current).toBe(snapshot);
  const discard = faultCache.discardSession(snapshot.key.sessionId, snapshot.key.canonicalSessionPathDigest);
  const faultCleanupDiscardedAll = discard.sessionDiscards === 1
    && faultCache.size === 0
    && faultCache.archivedSize === 0
    && faultCache.current === undefined;
  expect(faultCleanupDiscardedAll).toBe(true);

  return {
    lruObservedMax: forkCache.size,
    forkDigestsDiverged: main.snapshot.canonicalStateDigest !== fork.snapshot.canonicalStateDigest,
    epochArchivedAndScoped,
    faultCleanupDiscardedAll,
  };
}

function guardEntry(entry: BranchSessionEntry): GuardState {
  let armed = false;
  let touchCount = 0;
  const proxy = new Proxy(entry, {
    get(target, property, receiver) {
      if (armed) {
        touchCount += 1;
        throw new Error(`guarded source entry was revisited after build: ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
    ownKeys(target) {
      if (armed) {
        touchCount += 1;
        throw new Error("guarded source entry keys were revisited after build");
      }
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      if (armed) {
        touchCount += 1;
        throw new Error(`guarded source descriptor was revisited after build: ${String(property)}`);
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  return {
    entryId: entry.id,
    entry: proxy,
    arm() { armed = true; },
    touches() { return touchCount; },
  };
}

function key(branchLeafId: string, epochId = "root"): BranchIndexKey {
  return {
    sessionId: "perf-session",
    canonicalSessionPathDigest: digest("fixed-performance-session-path"),
    branchLeafId,
    epochId,
    replayVersion: "replay-v1-v3-performance",
  };
}

function message(id: string, role: string, content: unknown, parentId?: string): BranchSessionEntry {
  return { id, type: "message", ...(parentId ? { parentId } : {}), message: { role, content } };
}

function toolCall(id: string, toolCallId: string, name: string, parentId?: string): BranchSessionEntry {
  return {
    id,
    type: "message",
    ...(parentId ? { parentId } : {}),
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: toolCallId, name, arguments: {} }],
    },
  };
}

function toolResult(
  id: string,
  toolCallId: string,
  toolName: string,
  parentId: string | undefined,
  content: string,
): BranchSessionEntry {
  return {
    id,
    type: "message",
    ...(parentId ? { parentId } : {}),
    message: { role: "toolResult", toolCallId, toolName, content },
  };
}

function custom(id: string, data: unknown, parentId?: string): BranchSessionEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data, ...(parentId ? { parentId } : {}) };
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
}

function roundMillis(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
