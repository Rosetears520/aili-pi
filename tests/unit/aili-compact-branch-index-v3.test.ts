import { describe, expect, it } from "vitest";

import {
  AILI_COMPACT_ENTRY,
  AILI_COMPACT_SCHEMA,
  digest,
  sourceDigest,
  type CompactBlock,
  type CompactTransaction,
} from "../../src/runtime/aili-compact/contracts.js";
import {
  appendBranchIndex,
  auditBranchIndexReplayHealth,
  branchIndexPureReplayFallback,
  coldBuildBranchIndex,
  getBranchV3LifecycleReplay,
  getIndexedBlock,
  listBranchMessageReferences,
  type BranchIndexKey,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import {
  discoverLegacyRepairCandidates,
  planLegacyRepairs,
  repairBranchSourceEntryIds,
} from "../../src/runtime/aili-compact/repair.js";
import {
  reduceCompactState,
  reduceV3LifecycleState,
} from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogId, deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
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

const FACT_DIGEST = "f".repeat(64);

describe("AILI Compact BranchIndex v3 replay", () => {
  it("cold-builds and incrementally appends atomic T1/T2 lifecycle state equivalent to the pure reducer", () => {
    const fixture = v3Hierarchy();
    expect(fixture.first.header.catalogId).toBe(fixture.firstPublicCatalogId);
    expect(fixture.first.header.catalogId).not.toBe(empty().catalogId);
    const prefixEntries = fixture.entries.slice(0, -1);
    const prefix = coldBuildBranchIndex({ key: key(prefixEntries.at(-1)!.id), entries: prefixEntries });
    expect(prefix.ok).toBe(true);
    if (!prefix.ok) return;

    const parentEntry = { ...fixture.entries.at(-1)!, parentId: prefix.snapshot.tipEntryId };
    const appended = appendBranchIndex(prefix.snapshot, {
      entries: [parentEntry],
      expectedParentId: prefix.snapshot.tipEntryId,
      expectedPriorDigest: prefix.snapshot.sourceDigest,
      nextBranchLeafId: parentEntry.id,
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;

    expect(appended.counters).toEqual(expect.objectContaining({
      preTipEntryVisits: 0,
      fullReducerRuns: 0,
      fullRebuilds: 0,
      transactionReplayRuns: 1,
      incrementalAppends: 1,
    }));
    expect(appended.snapshot.stats).toEqual(expect.objectContaining({ transactions: 3, blocks: 3, blockRefs: 3 }));
    expect(getIndexedBlock(appended.snapshot, "t2")).toEqual(expect.objectContaining({
      schema: "v3", tier: "T2", active: true, coverageStartOrdinal: 1, coverageEndOrdinal: 2,
    }));
    expect(getIndexedBlock(appended.snapshot, "t1:a")).toEqual(expect.objectContaining({
      active: false, parentBlockId: "t2",
    }));
    const replay = getBranchV3LifecycleReplay(appended.snapshot);
    expect(replay.acceptedTransactionCount).toBe(3);
    expect(replay.maximalActiveBlocks.map((block) => block.blockId)).toEqual(["t2"]);
    expect(replay.diagnostics).toEqual([]);

    const completeEntries = [...prefixEntries, parentEntry];
    const oracle = reduceV3LifecycleState(completeEntries);
    const reloaded = coldBuildBranchIndex({ key: key(parentEntry.id), entries: completeEntries });
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    const reloadedReplay = getBranchV3LifecycleReplay(reloaded.snapshot);
    expect(reloadedReplay.state?.catalogId).toBe(replay.state?.catalogId);
    expect(reloadedReplay.state?.catalogId).toBe(oracle.state?.catalogId);
    expect(reloadedReplay.acceptedTransactionCount).toBe(oracle.acceptedTransactionCount);
    expect(reloadedReplay.diagnostics).toEqual(oracle.diagnostics);
    const health = auditBranchIndexReplayHealth(appended.snapshot, completeEntries);
    expect(health.healthy).toBe(true);
    expect(health.indexedDigest).toBe(health.oracleDigest);
    expect(health.counters).toEqual(expect.objectContaining({ fullReducerRuns: 1, fallbacks: 0 }));
  });

  it("incrementally replays one-level decompression and exact recompression without stale active-parent edges", () => {
    const fixture = v3Hierarchy();
    let entries = [...fixture.entries];
    const built = coldBuildBranchIndex({ key: key(entries.at(-1)!.id), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const decompress: V3Transaction = {
      header: header(fixture.state, "tx:decompress", 4, publicCatalogId(entries, fixture.state)),
      tag: "decompress",
      payload: {
        rootBlockIds: ["t2"], depth: "one",
        provenance: { kind: "explicit-user", id: "request:decompress" }, reason: "decompress",
      },
    };
    let state = applied(fixture.state, decompress, publicCatalogId(entries, fixture.state));
    const decompressEntry = custom("v3:decompress", decompress, entries.at(-1)!.id);
    const afterDecompress = appendBranchIndex(built.snapshot, { entries: [decompressEntry], nextBranchLeafId: decompressEntry.id });
    expect(afterDecompress.ok).toBe(true);
    if (!afterDecompress.ok) return;
    entries = [...entries, decompressEntry];
    expect(getIndexedBlock(afterDecompress.snapshot, "t2")).toEqual(expect.objectContaining({ active: false }));
    expect(getIndexedBlock(afterDecompress.snapshot, "t1:a")).toEqual(expect.objectContaining({ active: true }));
    expect(getIndexedBlock(afterDecompress.snapshot, "t1:a")?.parentBlockId).toBeUndefined();
    expect(auditBranchIndexReplayHealth(afterDecompress.snapshot, entries).healthy).toBe(true);

    const recompress: V3Transaction = {
      header: header(state, "tx:recompress", 5, publicCatalogId(entries, state)),
      tag: "recompress",
      payload: {
        rootBlockIds: ["t2"], decompressionTxId: "tx:decompress",
        provenance: { kind: "explicit-user", id: "request:recompress" }, reason: "recompress",
      },
    };
    state = applied(state, recompress, publicCatalogId(entries, state));
    const recompressEntry = custom("v3:recompress", recompress, entries.at(-1)!.id);
    const afterRecompress = appendBranchIndex(afterDecompress.snapshot, { entries: [recompressEntry], nextBranchLeafId: recompressEntry.id });
    expect(afterRecompress.ok).toBe(true);
    if (!afterRecompress.ok) return;
    entries = [...entries, recompressEntry];
    expect(getIndexedBlock(afterRecompress.snapshot, "t2")).toEqual(expect.objectContaining({ active: true }));
    expect(getIndexedBlock(afterRecompress.snapshot, "t1:a")).toEqual(expect.objectContaining({
      active: false, parentBlockId: "t2",
    }));
    expect(getBranchV3LifecycleReplay(afterRecompress.snapshot).state?.catalogId).toBe(state.catalogId);
    expect(auditBranchIndexReplayHealth(afterRecompress.snapshot, entries).healthy).toBe(true);
  });

  it("validates the public catalog across indexed message, v3, and legacy block reference families", () => {
    const prefixEntries = legacyRepairFixture();
    const current = empty();
    const expectedCatalogId = publicCatalogId(prefixEntries, current);
    const transaction = t1(current, "mixed", "legacy:source", 1, expectedCatalogId);
    const transactionEntry = custom("v3:mixed", transaction, prefixEntries.at(-1)!.id);
    const prefix = coldBuildBranchIndex({ key: key(prefixEntries.at(-1)!.id), entries: prefixEntries });
    expect(prefix.ok).toBe(true);
    if (!prefix.ok) return;

    const appended = appendBranchIndex(prefix.snapshot, {
      entries: [transactionEntry],
      expectedParentId: prefix.snapshot.tipEntryId,
      nextBranchLeafId: transactionEntry.id,
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(transaction.header.catalogId).toBe(expectedCatalogId);
    expect(transaction.header.catalogId).not.toBe(current.catalogId);
    expect(getBranchV3LifecycleReplay(appended.snapshot)).toEqual(expect.objectContaining({
      acceptedTransactionCount: 1,
      diagnostics: [],
    }));
    expect(auditBranchIndexReplayHealth(appended.snapshot, [...prefixEntries, transactionEntry]).healthy).toBe(true);
  });

  it("seeds a new epoch with archived v3 state and accepts a new T1 without losing query-only history", () => {
    const oldSource = message("epoch:old-source", "assistant", "archived source");
    let rootState = empty();
    const oldCatalogId = publicCatalogId([oldSource], rootState);
    const oldTransaction = t1(rootState, "epoch:old-block", oldSource.id, 1, oldCatalogId);
    rootState = applied(rootState, oldTransaction, oldCatalogId, new Map([[oldSource.id, 1]]));
    const oldEntry = custom("epoch:old-transaction", oldTransaction, oldSource.id);
    const boundary: BranchSessionEntry = {
      id: "epoch:checkpoint",
      type: "compaction",
      parentId: oldEntry.id,
    };
    const seed = reduceV3LifecycleState([oldSource, oldEntry, boundary]);
    expect(seed.state).toEqual(expect.objectContaining({ epochId: boundary.id }));
    expect(seed.archivedQueryOnlyBlocks.map((block) => block.blockId)).toEqual(["epoch:old-block"]);

    const newSource = message("epoch:new-source", "assistant", "new epoch source", boundary.id);
    const fullPrefix = [oldSource, oldEntry, boundary, newSource];
    const nextState = seed.state!;
    const nextCatalogId = deriveRuntimeCatalogIdForState(fullPrefix, reduceCompactState(fullPrefix), nextState);
    const newTransaction = t1(nextState, "epoch:new-block", newSource.id, 2, nextCatalogId);
    const newEntry = custom("epoch:new-transaction", newTransaction, newSource.id);
    const built = coldBuildBranchIndex({
      key: { ...key(newEntry.id), epochId: boundary.id },
      entries: [newSource],
      v3ReplaySeed: seed,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const indexedCatalogId = deriveRuntimeCatalogId({
      stateCatalogId: nextState.catalogId,
      epochId: nextState.epochId,
      messages: listBranchMessageReferences(built.snapshot).map(({ ref, entryId, atomEntryIds }) => ({ ref, entryId, atomEntryIds })),
      blocks: [],
    });
    expect(indexedCatalogId).toBe(nextCatalogId);

    const appended = appendBranchIndex(built.snapshot, {
      entries: [newEntry],
      expectedParentId: newSource.id,
      nextBranchLeafId: newEntry.id,
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    const replay = getBranchV3LifecycleReplay(appended.snapshot);
    expect(replay.diagnostics).toEqual([]);
    expect(replay.acceptedTransactionCount).toBe(2);
    expect(replay.maximalActiveBlocks.map((block) => block.blockId)).toEqual(["epoch:new-block"]);
    expect(replay.archivedQueryOnlyBlocks).toEqual([
      expect.objectContaining({ blockId: "epoch:old-block", queryOnly: true, deactivationReason: "epoch" }),
    ]);
    expect(auditBranchIndexReplayHealth(appended.snapshot, [newSource, newEntry])).toEqual(expect.objectContaining({
      healthy: true,
      indexedDigest: expect.any(String),
      oracleDigest: expect.any(String),
    }));
    expect(replay.state?.catalogId).toBe(applied(
      nextState,
      newTransaction,
      nextCatalogId,
      new Map([[newSource.id, 1]]),
    ).catalogId);
  });

  it("keeps malformed and stale v3 transactions diagnostic-only with no partial indexed state", () => {
    const source = message("source", "assistant", "safe source");
    const malformed = custom("malformed", { header: { schema: AILI_COMPACT_SCHEMA_V3 }, tag: "semantic-create" });
    const built = coldBuildBranchIndex({ key: key("malformed"), entries: [source, malformed] });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.snapshot.stats).toEqual(expect.objectContaining({ transactions: 0, blocks: 0 }));
    expect(built.snapshot.diagnostics).toEqual([expect.stringMatching(/^v3-parse:/)]);
    expect(getBranchV3LifecycleReplay(built.snapshot).diagnostics).toHaveLength(1);
    expect(auditBranchIndexReplayHealth(built.snapshot, [source, malformed]).healthy).toBe(true);

    const current = empty();
    const currentPublicCatalogId = publicCatalogId([source], current);
    const stale = t1(current, "stale", source.id, 1, currentPublicCatalogId);
    stale.header.catalogId = "0".repeat(64);
    const staleEntry = custom("stale-entry", stale, source.id);
    const stalePrefix = coldBuildBranchIndex({ key: key(source.id), entries: [source] });
    expect(stalePrefix.ok).toBe(true);
    if (!stalePrefix.ok) return;
    const staleAppend = appendBranchIndex(stalePrefix.snapshot, {
      entries: [staleEntry],
      expectedParentId: source.id,
      nextBranchLeafId: staleEntry.id,
    });
    expect(staleAppend.ok).toBe(true);
    if (!staleAppend.ok) return;
    expect(staleAppend.snapshot.stats).toEqual(expect.objectContaining({ transactions: 0, blocks: 0 }));
    expect(staleAppend.snapshot.diagnostics).toEqual([expect.stringMatching(/^v3-apply:stale-catalog:/)]);
    expect(reduceV3LifecycleState([source, staleEntry]).diagnostics).toEqual([
      expect.objectContaining({ phase: "apply", code: "stale-catalog" }),
    ]);
    expect(auditBranchIndexReplayHealth(staleAppend.snapshot, [source, staleEntry]).healthy).toBe(true);
  });

  it("returns the exact pure replay bundle and visible fallback counters when an adapter misses v3 state", () => {
    const fixture = v3Hierarchy();
    const built = coldBuildBranchIndex({
      key: key(fixture.entries.at(-1)!.id),
      entries: fixture.entries,
      replayAdapter: { version: "fixture-ignore-v3", fromEntry: () => ({ kind: "none" }) },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const health = auditBranchIndexReplayHealth(built.snapshot, fixture.entries);
    expect(health.healthy).toBe(false);
    expect(health.fallback.v3.acceptedTransactionCount).toBe(3);
    expect(health.counters).toEqual(expect.objectContaining({ fullReducerRuns: 1, fallbacks: 1, failOpenReturns: 1 }));
  });
});

describe("AILI Compact BranchIndex repair oracle fallback", () => {
  it("replays a valid legacy repair, counts the pure fallback, and remains oracle-equivalent beside v3 support", () => {
    const beforeRepair = legacyRepairFixture();
    const reduced = reduceCompactState(beforeRepair);
    expect([...reduced.blocks.values()].every((block) => !block.active)).toBe(true);
    const plan = planLegacyRepairs({
      branchSourceEntryIds: repairBranchSourceEntryIds(beforeRepair),
      epochId: "root",
      entries: beforeRepair,
      blocks: reduced.blocks,
      candidates: discoverLegacyRepairCandidates(beforeRepair, reduced.blocks),
    });
    expect(plan.batches).toHaveLength(1);
    const base = coldBuildBranchIndex({ key: key(beforeRepair.at(-1)!.id), entries: beforeRepair });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const repairEntry = custom("repair-entry", plan.batches[0]!, beforeRepair.at(-1)!.id);
    const repaired = appendBranchIndex(base.snapshot, { entries: [repairEntry], nextBranchLeafId: repairEntry.id });
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) return;

    expect(repaired.counters).toEqual(expect.objectContaining({ fullReducerRuns: 1, fallbacks: 1 }));
    expect(getIndexedBlock(repaired.snapshot, "legacy:block")).toEqual(expect.objectContaining({
      schema: "legacy", active: true,
    }));
    const entries = [...beforeRepair, repairEntry];
    const health = auditBranchIndexReplayHealth(repaired.snapshot, entries);
    expect(health.healthy).toBe(true);
    expect(health.fallback.legacy.repairTransactionCount).toBe(1);
    expect(branchIndexPureReplayFallback(entries).legacy.blocks.get("legacy:block")?.active).toBe(true);

    const duplicateEntry = custom("repair-entry-duplicate", plan.batches[0]!, repairEntry.id);
    const duplicate = appendBranchIndex(repaired.snapshot, { entries: [duplicateEntry], nextBranchLeafId: duplicateEntry.id });
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    expect(duplicate.snapshot.stats.transactions).toBe(repaired.snapshot.stats.transactions);
    expect(duplicate.counters).toEqual(expect.objectContaining({ fullReducerRuns: 1, fallbacks: 1 }));
    expect(auditBranchIndexReplayHealth(duplicate.snapshot, [...entries, duplicateEntry]).healthy).toBe(true);
  });
});

function key(branchLeafId: string): BranchIndexKey {
  return {
    sessionId: "session",
    canonicalSessionPathDigest: "path-digest",
    branchLeafId,
    epochId: "root",
    replayVersion: "replay-v3",
  };
}

function message(id: string, role: string, content: unknown, parentId?: string): BranchSessionEntry {
  return { id, type: "message", ...(parentId ? { parentId } : {}), message: { role, content } };
}

function custom(id: string, data: unknown, parentId?: string): BranchSessionEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data, ...(parentId ? { parentId } : {}) };
}

function empty(): V3LifecycleState {
  return createEmptyV3State({ sessionId: "session", branchLeafId: "leaf", epochId: "root", projectionVersion: "projection-v3" });
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
    estimatorVersion: "estimator-v1", providerId: "provider", modelId: "model",
    sourceTokensLower, sourceTokensUpper: sourceTokensLower, replacementTokensUpper,
    steadySavingsTokensLower, oneTimeCostTokensUpper: 500,
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

function semantic(
  state: V3LifecycleState,
  txId: string,
  createdAt: number,
  catalogId: string,
  payload: V3SemanticCreatePayload,
): V3Transaction {
  return { header: header(state, txId, createdAt, catalogId), tag: "semantic-create", payload };
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
    blockId, tier: "T1", topic: `topic:${blockId}`, runId: `run:${blockId}`,
    anchorEntryId: entryId, createdTurnOrdinal: createdAt, summary, summaryDigest: v3SummaryDigest(summary),
    source: { kind: "messages", entryIds: [entryId], firstEntryId: entryId, lastEntryId: entryId },
    leafDigest: v3MessageLeafDigest([entryId]), leafCount: 1, tokens: tokens("T1"), quality: quality(),
  });
}

function parent(state: V3LifecycleState, catalogId: string): V3Transaction {
  const children = [state.blocks.get("t1:a")!, state.blocks.get("t1:b")!];
  const summary = "summary:t2";
  return semantic(state, "tx:t2", 3, catalogId, {
    blockId: "t2", tier: "T2", topic: "topic:t2", runId: "run:t2",
    anchorEntryId: children[0]!.anchorEntryId, createdTurnOrdinal: 3, summary, summaryDigest: v3SummaryDigest(summary),
    source: { kind: "blocks", childBlockIds: children.map((block) => block.blockId) },
    leafDigest: v3ParentLeafDigest("T2", 2, children.map((block) => block.leafDigest)),
    leafCount: 2, tokens: tokens("T2"), quality: quality(),
  });
}

function applied(
  state: V3LifecycleState,
  transaction: V3Transaction,
  expectedCatalogId: string,
  ordinals?: ReadonlyMap<string, number>,
): V3LifecycleState {
  const result = applyV3Transaction(state, transaction, { expectedCatalogId, messageOrdinals: ordinals });
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function publicCatalogId(entries: readonly BranchSessionEntry[], state: V3LifecycleState): string {
  return deriveRuntimeCatalogIdForState(entries, reduceCompactState(entries), state);
}

function v3Hierarchy(): {
  entries: BranchSessionEntry[];
  state: V3LifecycleState;
  first: V3Transaction;
  firstPublicCatalogId: string;
} {
  const sourceA = message("source:a", "assistant", "source A");
  const sourceB = message("source:b", "assistant", "source B", sourceA.id);
  const entries: BranchSessionEntry[] = [sourceA, sourceB];
  let state = empty();
  const firstPublicCatalogId = publicCatalogId(entries, state);
  const first = t1(state, "t1:a", sourceA.id, 1, firstPublicCatalogId);
  state = applied(state, first, firstPublicCatalogId, new Map([[sourceA.id, 1]]));
  entries.push(custom("v3:t1:a", first));
  const secondPublicCatalogId = publicCatalogId(entries, state);
  const second = t1(state, "t1:b", sourceB.id, 2, secondPublicCatalogId);
  state = applied(state, second, secondPublicCatalogId, new Map([[sourceB.id, 2]]));
  entries.push(custom("v3:t1:b", second));
  const parentPublicCatalogId = publicCatalogId(entries, state);
  const parentTx = parent(state, parentPublicCatalogId);
  state = applied(state, parentTx, parentPublicCatalogId);
  entries.push(custom("v3:t2", parentTx));
  return {
    entries,
    state,
    first,
    firstPublicCatalogId,
  };
}

function legacyRepairFixture(): BranchSessionEntry[] {
  const source = message("legacy:source", "assistant", "legacy source");
  const block: CompactBlock = {
    id: "legacy:block", kind: "semantic", epochId: "root", sourceEntryIds: [source.id],
    sourceDigest: sourceDigest([source], [source.id]), summary: "legacy summary", active: true,
    mode: "message", topic: "Legacy", batchTopic: "Legacy", anchorEntryId: source.id,
    runId: "legacy-run", childBlockIds: [], generation: "young", survivedCount: 0, age: 0,
  };
  const create: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA, id: "legacy:create", kind: "compact", epochId: "root", blocks: [block],
  };
  const gc: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA, id: "legacy:gc", kind: "control", epochId: "root",
    lifecycleUpdates: [{ blockId: block.id, active: false, deactivationReason: "gc" }],
  };
  return [
    source,
    message("legacy:create-call", "assistant", [{ type: "toolCall", id: "legacy:create", name: "aili_compact", arguments: {} }], source.id),
    {
      id: "legacy:create-result", type: "message", parentId: "legacy:create-call",
      message: {
        role: "toolResult", toolCallId: "legacy:create", toolName: "aili_compact", content: "ok",
        details: { contextTx: create },
      },
    },
    custom("legacy:gc-entry", gc, "legacy:create-result"),
  ];
}
