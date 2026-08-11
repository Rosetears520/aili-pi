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
  createVerifiedV3ReplaySeed,
  getBranchPromotionGapIndex,
  verifyBranchPromotionGapSource,
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
  type V3BlockSource,
} from "../../src/runtime/aili-compact/v3.js";
import {
  classifyTransparentPromotionGaps,
  createAiliPlanningResultEnvelope,
} from "../../src/runtime/aili-compact/promotion-gaps.js";

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
      proofRawSlotVisits: 0,
      gapIndexBuilds: 0,
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

  it("replays the same raw transparent-gap proof as the pure reducer", () => {
    const left = message("gap:left", "assistant", "left");
    const statusCall = message("gap:status-call", "assistant", [
      { type: "toolCall", id: "gap:status-call", name: "aili_compact_status" },
    ], left.id);
    const statusResult = message("gap:status-result", "toolResult", JSON.stringify(createAiliPlanningResultEnvelope({
      toolName: "aili_compact_status",
      toolCallId: statusCall.id,
      identity: { sessionId: "session", branchLeafId: "leaf", epochId: "root", revision: "projection-v3" },
      outcome: "success",
      result: "ok",
    })), statusCall.id, {
      toolCallId: statusCall.id,
      toolName: "aili_compact_status",
    });
    const right = message("gap:right", "assistant", "right", statusResult.id);
    const sourceEntries: BranchSessionEntry[] = [left, statusCall, statusResult, right];

    let state = empty();
    const firstCatalogId = publicCatalogId(sourceEntries, state);
    const first = t1(state, "gap:t1-left", left.id, 1, firstCatalogId);
    state = applied(state, first, firstCatalogId, new Map([[left.id, 1]]));
    const firstState = state;
    const entries: BranchSessionEntry[] = [...sourceEntries, custom("gap:first", first)];
    const secondCatalogId = publicCatalogId(entries, state);
    const second = t1(state, "gap:t1-right", right.id, 2, secondCatalogId);
    state = applied(state, second, secondCatalogId, new Map([[right.id, 4]]));
    entries.push(custom("gap:second", second));
    const parentCatalogId = publicCatalogId(entries, state);
    const classified = classifyTransparentPromotionGaps(sourceEntries, state.blocks, [
      state.blocks.get("gap:t1-left")!, state.blocks.get("gap:t1-right")!,
    ], { sessionId: state.sessionId, branchLeafId: state.branchLeafId, epochId: state.epochId, revision: state.projectionVersion });
    expect(classified).toMatchObject({ ok: true });
    if (!classified.ok) return;
    const proof = classified.proofs[0]!;
    const parentTransaction = parent(
      state,
      parentCatalogId,
      ["gap:t1-left", "gap:t1-right"],
      "gap:t2",
      [proof],
    );
    const parentEntry = custom("gap:parent", parentTransaction);
    entries.push(parentEntry);

    const built = coldBuildBranchIndex({ key: key(parentEntry.id), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.counters).toEqual(expect.objectContaining({
      preTipEntryVisits: 0,
      proofRawSlotVisits: 2,
      gapIndexBuilds: 0,
      gapIndexBuildRawSlotVisits: 4,
      rawSlotVisits: 4,
    }));
    const indexedReplay = getBranchV3LifecycleReplay(built.snapshot);
    const pureReplay = reduceV3LifecycleState(entries);
    expect(indexedReplay.diagnostics).toEqual([]);
    expect(indexedReplay.acceptedTransactionCount).toBe(3);
    expect(indexedReplay.maximalActiveBlocks.map((block) => block.blockId)).toEqual(["gap:t2"]);
    expect(indexedReplay.state?.blocks.get("gap:t2")).toMatchObject({
      firstLeafOrdinal: 1,
      lastLeafOrdinal: 4,
      leafCount: 2,
    });
    expect(indexedReplay.acceptedTransactionCount).toBe(pureReplay.acceptedTransactionCount);
    expect(indexedReplay.diagnostics).toEqual(pureReplay.diagnostics);
    expect(auditBranchIndexReplayHealth(built.snapshot, entries).healthy).toBe(true);
    expect(firstState.blocks.get("gap:t1-left")?.firstLeafOrdinal).toBe(1);

    const forgedSources = [
      { name: "omitted", source: { ...parentTransaction.payload.source, transparentGaps: undefined } },
      { name: "endpoint", source: { ...parentTransaction.payload.source, transparentGaps: [{ ...proof, rightLeafEntryId: "wrong:right" }] } },
      { name: "count", source: { ...parentTransaction.payload.source, transparentGaps: [{ ...proof, messageCount: 1 }] } },
      { name: "digest", source: { ...parentTransaction.payload.source, transparentGaps: [{ ...proof, gapDigest: "0".repeat(64) }] } },
      { name: "snapshot", source: { ...parentTransaction.payload.source, transparentGaps: [{ ...proof, sourceSnapshotDigest: "0".repeat(64) }] } },
    ];
    for (const forged of forgedSources) {
      const transaction: V3Transaction = {
        ...parentTransaction,
        payload: { ...parentTransaction.payload, source: forged.source },
      };
      const forgedEntries = [
        ...entries.slice(0, -1),
        custom(`gap:forged-${forged.name}`, transaction),
      ];
      const pure = reduceV3LifecycleState(forgedEntries);
      expect(pure.acceptedTransactionCount).toBe(2);
      expect(pure.diagnostics).toEqual([
        expect.objectContaining({ phase: "apply", code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps" }),
      ]);

      const forgedIndex = coldBuildBranchIndex({ key: key(forgedEntries.at(-1)!.id), entries: forgedEntries });
      expect(forgedIndex.ok).toBe(true);
      if (!forgedIndex.ok) continue;
      const indexed = getBranchV3LifecycleReplay(forgedIndex.snapshot);
      expect(indexed.acceptedTransactionCount).toBe(2);
      expect(indexed.diagnostics).toEqual(pure.diagnostics);
    }

    const ordinaryAppend = message("gap:ordinary-append", "user", "ordinary append", parentEntry.id);
    const appended = appendBranchIndex(built.snapshot, {
      entries: [ordinaryAppend],
      expectedParentId: built.snapshot.tipEntryId,
      expectedPriorDigest: built.snapshot.sourceDigest,
      nextBranchLeafId: ordinaryAppend.id,
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;

    const currentEntries = [...entries, ordinaryAppend];
    let rawReads = 0;
    for (const entry of currentEntries) {
      if (entry.type !== "message") continue;
      let body = entry.message;
      Object.defineProperty(entry, "message", {
        configurable: true,
        enumerable: true,
        get() { rawReads += 1; return body; },
        set(value: unknown) { body = value; },
      });
    }
    ((right.message as Record<string, unknown>).content) = "mutated";
    rawReads = 0;
    expect(verifyBranchPromotionGapSource(appended.snapshot, currentEntries)).toEqual({ checked: true, matches: false });
    expect(rawReads).toBe(4);
  });

  it("rejects attestation and protocol-classification proof mismatches in pure and indexed replay", () => {
    for (const kind of ["attestation", "classification"] as const) {
      const entries = rawGapProofFixture(kind);
      const pure = reduceV3LifecycleState(entries);
      expect(pure.acceptedTransactionCount).toBe(2);
      expect(pure.diagnostics).toEqual([
        expect.objectContaining({ phase: "apply", code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps" }),
      ]);

      const built = coldBuildBranchIndex({ key: key(entries.at(-1)!.id), entries });
      expect(built.ok).toBe(true);
      if (!built.ok) continue;
      const indexed = getBranchV3LifecycleReplay(built.snapshot);
      expect(indexed.acceptedTransactionCount).toBe(2);
      expect(indexed.diagnostics).toEqual(pure.diagnostics);
    }
  });

  it("bounds an appended two-slot promotion proof without rebuilding an unrelated raw epoch", () => {
    const entries: BranchSessionEntry[] = Array.from({ length: 300 }, (_, index) =>
      message(`pre-gap:${index + 1}`, "assistant", `unrelated:${index + 1}`),
    );
    const left = message("bounded:left", "assistant", "left");
    const statusCall = message("bounded:status-call", "assistant", [
      { type: "toolCall", id: "bounded:status-call", name: "aili_compact_status" },
    ]);
    const statusResult = message("bounded:status-result", "toolResult", JSON.stringify(createAiliPlanningResultEnvelope({
      toolName: "aili_compact_status",
      toolCallId: statusCall.id,
      identity: { sessionId: "session", branchLeafId: "leaf", epochId: "root", revision: "projection-v3" },
      outcome: "success",
      result: "ok",
    })), undefined, { toolCallId: statusCall.id, toolName: "aili_compact_status" });
    const right = message("bounded:right", "assistant", "right");
    entries.push(left, statusCall, statusResult, right);

    let state = empty();
    const leftCatalogId = publicCatalogId(entries, state);
    const leftTransaction = t1(state, "bounded:t1-left", left.id, 1, leftCatalogId);
    state = applied(state, leftTransaction, leftCatalogId, new Map([[left.id, 301]]));
    entries.push(custom("bounded:left-entry", leftTransaction));
    const rightCatalogId = publicCatalogId(entries, state);
    const rightTransaction = t1(state, "bounded:t1-right", right.id, 2, rightCatalogId);
    state = applied(state, rightTransaction, rightCatalogId, new Map([[right.id, 304]]));
    entries.push(custom("bounded:right-entry", rightTransaction));
    const parentCatalogId = publicCatalogId(entries, state);
    const rawEntries = entries.slice(0, 304);
    const classified = classifyTransparentPromotionGaps(rawEntries, state.blocks, [
      state.blocks.get("bounded:t1-left")!, state.blocks.get("bounded:t1-right")!,
    ], { sessionId: state.sessionId, branchLeafId: state.branchLeafId, epochId: state.epochId, revision: state.projectionVersion });
    expect(classified).toMatchObject({ ok: true, proofs: [expect.objectContaining({ messageCount: 2 })] });
    if (!classified.ok) return;
    const parentEntry = custom("bounded:parent", parent(
      state,
      parentCatalogId,
      ["bounded:t1-left", "bounded:t1-right"],
      "bounded:t2",
      classified.proofs,
    ), entries.at(-1)?.id);
    const prefix = coldBuildBranchIndex({ key: key(entries.at(-1)!.id), entries });
    expect(prefix.ok).toBe(true);
    if (!prefix.ok) return;

    const appended = appendBranchIndex(prefix.snapshot, {
      entries: [parentEntry],
      expectedParentId: prefix.snapshot.tipEntryId,
      expectedPriorDigest: prefix.snapshot.sourceDigest,
      nextBranchLeafId: parentEntry.id,
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    const rawTraversal = appended.counters.rawSlotVisits
      + appended.counters.gapIndexBuildRawSlotVisits
      + appended.counters.proofRawSlotVisits;
    expect(appended.counters).toEqual(expect.objectContaining({
      fullRebuilds: 0,
      gapIndexBuilds: 0,
      rawSlotVisits: 0,
      proofRawSlotVisits: 2,
      rawEpochSlotStorageCopyVisits: 0,
      rawEpochPrefixStorageCopyVisits: 0,
    }));
    expect(rawTraversal).toBeLessThanOrEqual(256);
    expect(appended.counters.rawEpochSlotStorageIterationVisits).toBeLessThanOrEqual(256);
    expect(appended.counters.rawEpochPrefixStorageIterationVisits).toBeLessThanOrEqual(256);
    expect(getBranchV3LifecycleReplay(appended.snapshot).acceptedTransactionCount).toBe(3);
  });

  it("builds one full revision-scoped promotion index for a 16-child status lineage", () => {
    const entries = Array.from({ length: 16 }, (_, index) =>
      message(`status:${index + 1}`, "assistant", `source:${index + 1}`),
    );
    let state = empty();
    for (let index = 0; index < 16; index += 1) {
      const source = entries[index]!;
      const catalogId = publicCatalogId(entries, state);
      const transaction = t1(state, `status:t1:${index + 1}`, source.id, index + 1, catalogId);
      state = applied(state, transaction, catalogId, new Map([[source.id, index + 1]]));
      entries.push(custom(`status:entry:${index + 1}`, transaction));
    }
    const built = coldBuildBranchIndex({ key: key(entries.at(-1)!.id), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const first = getBranchPromotionGapIndex(built.snapshot);
    const second = getBranchPromotionGapIndex(built.snapshot);
    expect(first.index).toBeDefined();
    expect(first.counters).toEqual(expect.objectContaining({
      gapIndexBuilds: 1,
      gapIndexBuildRawSlotVisits: 0,
      rawEpochSlotStorageIterationVisits: 0,
    }));
    expect(second.counters).toEqual(expect.objectContaining({ gapIndexBuilds: 0, gapIndexBuildRawSlotVisits: 0 }));
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
    const controlCatalogId = publicCatalogId(entries, state);
    const control: V3Transaction = {
      header: header(state, "tx:control", 6, controlCatalogId),
      tag: "control",
      payload: {
        action: "manual-on",
        targetBlockIds: [],
        provenance: { kind: "explicit-user", id: "request:control" },
        reason: "manual-on",
      },
    };
    state = applied(state, control, controlCatalogId);
    const controlEntry = custom("v3:control", control, entries.at(-1)!.id);
    const afterControl = appendBranchIndex(afterRecompress.snapshot, {
      entries: [controlEntry],
      expectedParentId: afterRecompress.snapshot.tipEntryId,
      nextBranchLeafId: controlEntry.id,
    });
    expect(afterControl.ok).toBe(true);
    if (!afterControl.ok) return;
    entries = [...entries, controlEntry];
    expect(getBranchV3LifecycleReplay(afterControl.snapshot).state?.catalogId).toBe(state.catalogId);
    for (const result of [afterDecompress, afterRecompress, afterControl]) {
      expect(result.counters).toEqual(expect.objectContaining({
        preTipEntryVisits: 0,
        proofRawSlotVisits: 0,
        gapIndexBuilds: 0,
      }));
    }
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

  it("orders mixed legacy and v3 blocks by source before accepting the next v3 transaction", () => {
    const legacyEntries = legacyRepairFixture({ deactivated: false });
    const firstSource = message("mixed:v3-source-a", "assistant", "first v3 source", legacyEntries.at(-1)!.id);
    const firstCatalogId = publicCatalogId([...legacyEntries, firstSource], empty());
    const first = t1(empty(), "mixed:v3-a", firstSource.id, 1, firstCatalogId);
    const stateAfterFirst = applied(empty(), first, firstCatalogId, new Map([[firstSource.id, 4]]));
    const firstEntry = custom("mixed:v3-a-entry", first, firstSource.id);
    const prefixEntries = [...legacyEntries, firstSource, firstEntry];
    const prefix = coldBuildBranchIndex({ key: key(firstEntry.id), entries: prefixEntries });
    expect(prefix.ok).toBe(true);
    if (!prefix.ok) return;

    const secondSource = message("mixed:v3-source-b", "assistant", "next v3 source", firstEntry.id);
    const secondCatalogId = publicCatalogId([...prefixEntries, secondSource], stateAfterFirst);
    const second = t1(stateAfterFirst, "mixed:v3-b", secondSource.id, 2, secondCatalogId);
    const expectedState = applied(stateAfterFirst, second, secondCatalogId, new Map([[secondSource.id, 5]]));
    const secondEntry = custom("mixed:v3-b-entry", second, secondSource.id);
    const appended = appendBranchIndex(prefix.snapshot, {
      entries: [secondSource, secondEntry],
      expectedParentId: prefix.snapshot.tipEntryId,
      expectedPriorDigest: prefix.snapshot.sourceDigest,
      nextBranchLeafId: secondEntry.id,
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;

    const replay = getBranchV3LifecycleReplay(appended.snapshot);
    expect(second.header.catalogId).toBe(secondCatalogId);
    expect(replay).toEqual(expect.objectContaining({ acceptedTransactionCount: 2, diagnostics: [] }));
    expect(replay.state?.catalogId).toBe(expectedState.catalogId);
    const health = auditBranchIndexReplayHealth(appended.snapshot, [...prefixEntries, secondSource, secondEntry]);
    expect(health.healthy).toBe(true);
    expect(health.indexedDigest).toBe(health.oracleDigest);
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
    const seedReplay = reduceV3LifecycleState([oldSource, oldEntry, boundary]);
    expect(seedReplay.state).toEqual(expect.objectContaining({ epochId: boundary.id }));
    expect(seedReplay.archivedQueryOnlyBlocks.map((block) => block.blockId)).toEqual(["epoch:old-block"]);

    const newSource = message("epoch:new-source", "assistant", "new epoch source", boundary.id);
    const fullPrefix = [oldSource, oldEntry, boundary, newSource];
    const nextState = seedReplay.state!;
    const nextCatalogId = deriveRuntimeCatalogIdForState(fullPrefix, reduceCompactState(fullPrefix), nextState);
    const newTransaction = t1(nextState, "epoch:new-block", newSource.id, 2, nextCatalogId);
    const newEntry = custom("epoch:new-transaction", newTransaction, newSource.id);
    const nextKey = { ...key(newEntry.id), epochId: boundary.id };
    const seed = createVerifiedV3ReplaySeed({
      key: nextKey,
      sourcePrefix: [oldSource, oldEntry, boundary],
      replay: seedReplay,
    });
    const callerSeed = structuredClone(seed);
    const built = coldBuildBranchIndex({
      key: nextKey,
      entries: [newSource],
      v3ReplaySeed: callerSeed,
      v3ReplaySeedSourcePrefix: [oldSource, oldEntry, boundary],
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const callerSeedState = callerSeed.replay.state!;
    const callerSeedBlock = callerSeedState.blocks.get("epoch:old-block")!;
    callerSeedBlock.summary = "caller-mutated-seed-block";
    (callerSeedState.blocks as Map<string, typeof callerSeedBlock>).set("caller-forged-block", callerSeedBlock);
    const installedColdReplay = getBranchV3LifecycleReplay(built.snapshot);
    expect(installedColdReplay.state?.blocks.get("epoch:old-block")?.summary).toBe("summary:epoch:old-block");
    expect(installedColdReplay.state?.blocks.has("caller-forged-block")).toBe(false);
    const coldSeedHealth = auditBranchIndexReplayHealth(built.snapshot, [newSource]);
    expect(coldSeedHealth.healthy).toBe(true);
    expect(coldSeedHealth.fallback.v3.state?.blocks.get("epoch:old-block")?.summary).toBe("summary:epoch:old-block");
    expect(coldSeedHealth.fallback.v3.state?.blocks.has("caller-forged-block")).toBe(false);
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
    const seededHealth = auditBranchIndexReplayHealth(appended.snapshot, [newSource, newEntry]);
    expect(seededHealth).toEqual(expect.objectContaining({
      healthy: true,
      indexedDigest: expect.any(String),
      oracleDigest: expect.any(String),
    }));
    expect(seededHealth.counters).toEqual(expect.objectContaining({
      pureAuditRuns: 1,
      seedReplayRuns: 1,
      fullReducerRuns: 1,
    }));
    expect(replay.state?.catalogId).toBe(applied(
      nextState,
      newTransaction,
      nextCatalogId,
      new Map([[newSource.id, 1]]),
    ).catalogId);
    expect(built.counters).toEqual(expect.objectContaining({
      seedValidationRuns: 1,
      seedValidationEntryVisits: 3,
      seedReplayRuns: 1,
    }));
  });

  it("rejects a structurally valid archived replay unless every source, boundary, branch, epoch, and digest binding matches", () => {
    const oldSource = message("seed:old-source", "assistant", "archived source");
    let state = empty();
    const oldTransaction = t1(state, "seed:old-block", oldSource.id, 1, publicCatalogId([oldSource], state));
    state = applied(state, oldTransaction, oldTransaction.header.catalogId, new Map([[oldSource.id, 1]]));
    const oldEntry = custom("seed:old-transaction", oldTransaction, oldSource.id);
    const boundary: BranchSessionEntry = { id: "seed:boundary", type: "compaction", parentId: oldEntry.id };
    const sourcePrefix = [oldSource, oldEntry, boundary];
    const seedKey = { ...key("seed:new-source"), epochId: boundary.id };
    const replay = reduceV3LifecycleState(sourcePrefix);
    const verified = createVerifiedV3ReplaySeed({ key: seedKey, sourcePrefix, replay });
    const newSource = message("seed:new-source", "assistant", "new source", boundary.id);

    expect(coldBuildBranchIndex({
      key: seedKey,
      entries: [newSource],
      v3ReplaySeed: verified,
      v3ReplaySeedSourcePrefix: sourcePrefix,
    }).ok).toBe(true);

    const variants = [
      (seed: typeof verified, prefix: BranchSessionEntry[]) => { seed.sourcePrefixDigest = "0".repeat(64); return { seed, prefix }; },
      (seed: typeof verified, prefix: BranchSessionEntry[]) => { seed.epochBoundary.entryId = "other-boundary"; return { seed, prefix }; },
      (seed: typeof verified, prefix: BranchSessionEntry[]) => { seed.epochBoundary.branchLeafId = "other-branch"; return { seed, prefix }; },
      (seed: typeof verified, prefix: BranchSessionEntry[]) => { seed.projectionVersion = "other-projection"; return { seed, prefix }; },
      (seed: typeof verified, prefix: BranchSessionEntry[]) => { seed.replayVersion = "other-replay"; return { seed, prefix }; },
      (seed: typeof verified, prefix: BranchSessionEntry[]) => {
        seed.replay.state = createEmptyV3State({
          sessionId: "session", branchLeafId: "leaf", epochId: boundary.id, projectionVersion: "projection-v3",
        });
        seed.replay.acceptedTransactionCount = 0;
        seed.replay.maximalActiveBlocks = [];
        seed.replay.archivedQueryOnlyBlocks = [];
        return { seed, prefix };
      },
      (seed: typeof verified, prefix: BranchSessionEntry[]) => {
        prefix[0] = message("seed:old-source", "assistant", "altered source");
        return { seed, prefix };
      },
    ];
    for (const mutate of variants) {
      const invalid = mutate(structuredClone(verified), structuredClone(sourcePrefix) as BranchSessionEntry[]);
      expect(coldBuildBranchIndex({
        key: seedKey,
        entries: [newSource],
        v3ReplaySeed: invalid.seed,
        v3ReplaySeedSourcePrefix: invalid.prefix,
      })).toEqual(expect.objectContaining({ ok: false, code: "invalid-scope" }));
    }
    expect(coldBuildBranchIndex({
      key: { ...seedKey, epochId: "other-epoch" },
      entries: [newSource],
      v3ReplaySeed: verified,
      v3ReplaySeedSourcePrefix: sourcePrefix,
    })).toEqual(expect.objectContaining({ ok: false, code: "invalid-scope" }));
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

    expect(repaired.counters).toEqual(expect.objectContaining({
      fullReducerRuns: 1,
      fallbacks: 1,
      preTipEntryVisits: beforeRepair.length + 1,
    }));
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

function message(
  id: string,
  role: string,
  content: unknown,
  parentId?: string,
  extra?: Record<string, unknown>,
): BranchSessionEntry {
  return { id, type: "message", ...(parentId ? { parentId } : {}), message: { role, content, ...extra } };
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
): Extract<V3Transaction, { tag: "semantic-create" }> {
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

function parent(
  state: V3LifecycleState,
  catalogId: string,
  childBlockIds: string[] = ["t1:a", "t1:b"],
  blockId = "t2",
  transparentGaps?: V3BlockSource["transparentGaps"],
): Extract<V3Transaction, { tag: "semantic-create" }> {
  const children = childBlockIds.map((id) => state.blocks.get(id)!);
  const summary = `summary:${blockId}`;
  return semantic(state, `tx:${blockId}`, 3, catalogId, {
    blockId, tier: "T2", topic: `topic:${blockId}`, runId: `run:${blockId}`,
    anchorEntryId: children[0]!.anchorEntryId, createdTurnOrdinal: 3, summary, summaryDigest: v3SummaryDigest(summary),
    source: {
      kind: "blocks",
      childBlockIds: children.map((block) => block.blockId),
      ...(transparentGaps ? { transparentGaps } : {}),
    },
    leafDigest: v3ParentLeafDigest("T2", 2, children.map((block) => block.leafDigest)),
    leafCount: 2, tokens: tokens("T2"), quality: quality(),
  });
}

function rawGapProofFixture(kind: "attestation" | "classification"): BranchSessionEntry[] {
  const left = message(`raw-${kind}:left`, "assistant", "left");
  const validCall = message(`raw-${kind}:status-call`, "assistant", [
    { type: "toolCall", id: `raw-${kind}:status-call`, name: "aili_compact_status" },
  ], left.id);
  const validResult = message(`raw-${kind}:status-result`, "toolResult", JSON.stringify(createAiliPlanningResultEnvelope({
    toolName: "aili_compact_status",
    toolCallId: validCall.id,
    identity: { sessionId: "session", branchLeafId: "leaf", epochId: "root", revision: "projection-v3" },
    outcome: "success",
    result: "ok",
  })), validCall.id, {
    toolCallId: validCall.id,
    toolName: "aili_compact_status",
  });
  const actualCall = kind === "classification"
    ? message(validCall.id, "assistant", [{ type: "toolCall", id: validCall.id, name: "read" }], left.id)
    : validCall;
  const actualResult = kind === "classification"
    ? message(validResult.id, "toolResult", "ok", actualCall.id, { toolCallId: actualCall.id, toolName: "read" })
    : message(validResult.id, "toolResult", JSON.stringify(createAiliPlanningResultEnvelope({
      toolName: "aili_compact_status",
      toolCallId: validCall.id,
      identity: { sessionId: "session", branchLeafId: "other-leaf", epochId: "root", revision: "projection-v3" },
      outcome: "success",
      result: "ok",
    })), actualCall.id, {
      toolCallId: actualCall.id,
      toolName: "aili_compact_status",
    });
  const right = message(`raw-${kind}:right`, "assistant", "right", actualResult.id);
  const entries: BranchSessionEntry[] = [left, actualCall, actualResult, right];

  let state = empty();
  const firstCatalogId = publicCatalogId(entries, state);
  const first = t1(state, `raw-${kind}:t1-left`, left.id, 1, firstCatalogId);
  state = applied(state, first, firstCatalogId, new Map([[left.id, 1]]));
  entries.push(custom(`raw-${kind}:first`, first));
  const secondCatalogId = publicCatalogId(entries, state);
  const second = t1(state, `raw-${kind}:t1-right`, right.id, 2, secondCatalogId);
  state = applied(state, second, secondCatalogId, new Map([[right.id, 4]]));
  entries.push(custom(`raw-${kind}:second`, second));

  const classified = classifyTransparentPromotionGaps([left, validCall, validResult, right], state.blocks, [
    state.blocks.get(`raw-${kind}:t1-left`)!, state.blocks.get(`raw-${kind}:t1-right`)!,
  ], { sessionId: state.sessionId, branchLeafId: state.branchLeafId, epochId: state.epochId, revision: state.projectionVersion });
  if (!classified.ok) throw new Error(`valid proof fixture failed: ${classified.reason}`);
  const parentCatalogId = publicCatalogId(entries, state);
  entries.push(custom(`raw-${kind}:parent`, parent(
    state,
    parentCatalogId,
    [`raw-${kind}:t1-left`, `raw-${kind}:t1-right`],
    `raw-${kind}:t2`,
    classified.proofs,
  )));
  return entries;
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

function legacyRepairFixture({ deactivated = true }: { deactivated?: boolean } = {}): BranchSessionEntry[] {
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
  const entries: BranchSessionEntry[] = [
    source,
    message("legacy:create-call", "assistant", [{ type: "toolCall", id: "legacy:create", name: "aili_compact", arguments: {} }], source.id),
    {
      id: "legacy:create-result", type: "message", parentId: "legacy:create-call",
      message: {
        role: "toolResult", toolCallId: "legacy:create", toolName: "aili_compact", content: "ok",
        details: { contextTx: create },
      },
    },
  ];
  return deactivated ? [...entries, custom("legacy:gc-entry", gc, "legacy:create-result")] : entries;
}
