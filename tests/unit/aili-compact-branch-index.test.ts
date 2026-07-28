import { describe, expect, it } from "vitest";

import { AILI_COMPACT_SCHEMA_V2, digest, type CompactTransaction } from "../../src/runtime/aili-compact/contracts.js";
import {
  alignBranchProviderMessages,
  appendBranchIndex,
  branchAncestryProof,
  branchIndexKeyId,
  branchIndexPerformanceEvidence,
  branchIndexesShareEntryPrefix,
  branchIndexStructuralIdentity,
  BranchIndexCache,
  coldBuildBranchIndex,
  evaluateBranchIndexBudget,
  getBranchTokenEstimate,
  getFingerprintOccurrences,
  getIndexedBlock,
  getIndexedEntry,
  invalidateBranchDerivedIndex,
  listBranchProtocolAtoms,
  pageBranchReferences,
  resolveBranchMessageReference,
  resolveBranchReferences,
  setBranchTokenEstimate,
  verifyBranchAncestryProof,
  visitProviderMessagesOnce,
  type BranchIndexKey,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";

const key = (branchLeafId: string, epochId = "root"): BranchIndexKey => ({
  sessionId: "session-1",
  canonicalSessionPathDigest: "path-digest-1",
  branchLeafId,
  epochId,
  replayVersion: "replay-v1",
});

const message = (
  id: string,
  role: string,
  content: unknown,
  parentId?: string,
): BranchSessionEntry => ({ id, type: "message", ...(parentId ? { parentId } : {}), message: { role, content } });

const call = (id: string, toolCallId: string, name: string, parentId?: string): BranchSessionEntry => ({
  id,
  type: "message",
  ...(parentId ? { parentId } : {}),
  message: {
    role: "assistant",
    content: [{ type: "toolCall", id: toolCallId, name, arguments: {} }],
  },
});

const result = (
  id: string,
  toolCallId: string,
  name: string,
  parentId?: string,
  details?: unknown,
): BranchSessionEntry => ({
  id,
  type: "message",
  ...(parentId ? { parentId } : {}),
  message: {
    role: "toolResult",
    toolCallId,
    toolName: name,
    content: "ok",
    ...(details === undefined ? {} : { details }),
  },
});

const linearEntries = (count: number, prefix = "e"): BranchSessionEntry[] => Array.from({ length: count }, (_, index) =>
  message(
    `${prefix}${index + 1}`,
    index % 2 === 0 ? "user" : "assistant",
    `payload-${index + 1}`,
    index === 0 ? undefined : `${prefix}${index}`,
  ));

function compactTransaction(): CompactTransaction {
  const sourceDigest = digest({ source: "s1" });
  return {
    schema: AILI_COMPACT_SCHEMA_V2,
    id: "tx-1",
    kind: "compact",
    epochId: "root",
    sourceEntryIds: ["s1"],
    sourceDigest,
    blocks: [{
      id: "block-1",
      kind: "semantic",
      epochId: "root",
      sourceEntryIds: ["s1"],
      sourceDigest,
      summary: "durable summary",
      active: true,
      mode: "range",
      topic: "topic",
      batchTopic: "batch",
      anchorEntryId: "s1",
      runId: "run-1",
      childBlockIds: [],
      generation: "young",
      survivedCount: 0,
      age: 0,
    }],
  };
}

describe("AILI Compact BranchIndex cold and incremental paths", () => {
  it("builds a hand-audited scoped snapshot within the cold budget", () => {
    const entries: BranchSessionEntry[] = [
      message("e1", "user", "question"),
      message("e2", "assistant", "thinking", "e1"),
      call("e3", "read-1", "read", "e2"),
      result("e4", "read-1", "read", "e3"),
      message("e5", "assistant", "done", "e4"),
    ];
    const built = coldBuildBranchIndex({ key: key("e5"), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    expect(built.snapshot.stats).toEqual(expect.objectContaining({
      entries: 5,
      atoms: 4,
      atomMembershipEdges: 5,
      messageRefs: 5,
      blocks: 0,
    }));
    expect(listBranchProtocolAtoms(built.snapshot).map((atom) => atom.entryIds)).toEqual([
      ["e1"], ["e2"], ["e3", "e4"], ["e5"],
    ]);
    expect(built.counters).toEqual(expect.objectContaining({
      entryVisits: 15,
      fullRebuilds: 1,
      fullScans: 0,
      protocolRebuilds: 1,
      catalogRebuilds: 1,
    }));
    expect(evaluateBranchIndexBudget({ operation: "cold-build", snapshot: built.snapshot, counters: built.counters }).passed).toBe(true);
    expect(getIndexedEntry(built.snapshot, "e1")?.entry).toBe(entries[0]);
    expect(built.snapshot.stats.retainedRecords).toBeLessThanOrEqual(built.snapshot.stats.retainedRecordLimit);
  });

  it("appends without revisiting or copying the pre-tip prefix and equals a cold oracle", () => {
    const prefixEntries = linearEntries(2);
    const prefix = coldBuildBranchIndex({ key: key("e2"), entries: prefixEntries });
    expect(prefix.ok).toBe(true);
    if (!prefix.ok) return;
    const nextEntry = message("e3", "user", "payload-3", "e2");
    const appended = appendBranchIndex(prefix.snapshot, {
      entries: [nextEntry],
      expectedParentId: "e2",
      expectedPriorDigest: prefix.snapshot.sourceDigest,
      nextBranchLeafId: "e3",
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;

    const oracle = coldBuildBranchIndex({ key: key("e3"), entries: [...prefixEntries, nextEntry] });
    expect(oracle.ok).toBe(true);
    if (!oracle.ok) return;
    expect(appended.snapshot.canonicalStateDigest).toBe(oracle.snapshot.canonicalStateDigest);
    expect(appended.snapshot.catalogId).toBe(oracle.snapshot.catalogId);
    expect(appended.counters).toEqual(expect.objectContaining({
      entryVisits: 3,
      preTipEntryVisits: 0,
      fullRebuilds: 0,
      incrementalAppends: 1,
    }));
    expect(branchIndexesShareEntryPrefix(prefix.snapshot, appended.snapshot)).toBe(true);
    expect(prefix.snapshot.stats.entries).toBe(2);
    expect(evaluateBranchIndexBudget({
      operation: "incremental-append",
      snapshot: appended.snapshot,
      counters: appended.counters,
      newEntries: 1,
    }).passed).toBe(true);

    const mismatch = appendBranchIndex(appended.snapshot, {
      entries: [message("bad", "assistant", "bad", "wrong-parent")],
    });
    expect(mismatch).toEqual(expect.objectContaining({
      ok: false,
      code: "parent-tip-mismatch",
      snapshot: appended.snapshot,
      rebuildRequired: true,
    }));
    expect(appended.snapshot.stats.entries).toBe(3);
  });

  it("updates only the affected incomplete tail atom when its result arrives", () => {
    const caller = call("call", "tc", "read");
    const before = coldBuildBranchIndex({ key: key("call"), entries: [caller] });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(listBranchProtocolAtoms(before.snapshot)[0]).toEqual(expect.objectContaining({
      kind: "remainder",
      hardProtected: true,
    }));

    const toolResult = result("result", "tc", "read", "call");
    const appended = appendBranchIndex(before.snapshot, { entries: [toolResult], nextBranchLeafId: "result" });
    const oracle = coldBuildBranchIndex({ key: key("result"), entries: [caller, toolResult] });
    expect(appended.ok).toBe(true);
    expect(oracle.ok).toBe(true);
    if (!appended.ok || !oracle.ok) return;
    expect(listBranchProtocolAtoms(appended.snapshot)).toEqual([
      expect.objectContaining({ kind: "tool-protocol", entryIds: ["call", "result"], hardProtected: false }),
    ]);
    expect(appended.snapshot.canonicalStateDigest).toBe(oracle.snapshot.canonicalStateDigest);
    const callerRef = resolveBranchMessageReference(appended.snapshot, {
      keyId: appended.snapshot.keyId,
      catalogId: appended.snapshot.catalogId,
    }, "m000001");
    expect(callerRef.value?.atomEntryIds).toEqual(["call", "result"]);
  });

  it("publishes replayed transaction/block state atomically", () => {
    const transaction = compactTransaction();
    const entries: BranchSessionEntry[] = [
      message("s1", "user", "source"),
      call("c1", "tx-1", "aili_compact", "s1"),
      result("r1", "tx-1", "aili_compact", "c1", { contextTx: transaction }),
    ];
    const built = coldBuildBranchIndex({ key: key("r1"), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.snapshot.stats).toEqual(expect.objectContaining({ transactions: 1, blocks: 1, blockRefs: 1 }));
    expect(getIndexedBlock(built.snapshot, "block-1")).toEqual(expect.objectContaining({
      active: true,
      coverageStartOrdinal: 1,
      coverageEndOrdinal: 1,
    }));

    const duplicate = appendBranchIndex(built.snapshot, {
      entries: [
        call("c2", "tx-1", "aili_compact", "r1"),
        result("r2", "tx-1", "aili_compact", "c2", { contextTx: transaction }),
      ],
      nextBranchLeafId: "r2",
    });
    expect(duplicate).toEqual(expect.objectContaining({
      ok: false,
      code: "duplicate-transaction-id",
      snapshot: built.snapshot,
    }));
    expect(built.snapshot.stats).toEqual(expect.objectContaining({ entries: 3, transactions: 1, blocks: 1 }));
  });

  it("rejects duplicate IDs and impossible ancestry rather than constructing a partial snapshot", () => {
    expect(coldBuildBranchIndex({
      key: key("duplicate"),
      entries: [message("same", "user", "one"), message("same", "assistant", "two", "same")],
    })).toEqual(expect.objectContaining({ ok: false, code: "duplicate-entry-id" }));
    expect(coldBuildBranchIndex({
      key: key("e2"),
      entries: [message("e1", "user", "one"), message("e2", "assistant", "two", "other")],
    })).toEqual(expect.objectContaining({ ok: false, code: "impossible-lineage" }));
  });
});

describe("AILI Compact BranchIndex branch/epoch lifecycle", () => {
  it("switches cached forks only after exact prefix proof and keeps scopes isolated", () => {
    const baseEntries = linearEntries(2);
    const base = coldBuildBranchIndex({ key: key("e2"), entries: baseEntries });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const cache = new BranchIndexCache();
    cache.install(base);
    const main = cache.append({ entries: [message("main", "assistant", "main", "e2")], nextBranchLeafId: "main" });
    expect(main?.ok).toBe(true);

    const proof = branchAncestryProof(base.snapshot)!;
    const switched = cache.switchCached(base.snapshot.key, proof);
    expect(switched).toEqual(expect.objectContaining({ ok: true, snapshot: base.snapshot }));
    const fork = cache.append({ entries: [message("fork", "assistant", "fork", "e2")], nextBranchLeafId: "fork" });
    expect(fork?.ok).toBe(true);
    if (!main?.ok || !fork?.ok) return;

    const forkOracle = coldBuildBranchIndex({
      key: key("fork"),
      entries: [...baseEntries, message("fork", "assistant", "fork", "e2")],
    });
    expect(forkOracle.ok).toBe(true);
    if (!forkOracle.ok) return;
    expect(fork.snapshot.canonicalStateDigest).toBe(forkOracle.snapshot.canonicalStateDigest);
    expect(resolveBranchMessageReference(fork.snapshot, {
      keyId: main.snapshot.keyId,
      catalogId: main.snapshot.catalogId,
    }, "m000001").diagnostic).toBe("stale-scope");

    const badProof = { ...proof, digest: "bad-prefix" };
    expect(cache.switchCached(base.snapshot.key, badProof)).toEqual(expect.objectContaining({
      ok: false,
      rebuildRequired: true,
      diagnostic: "ancestry-mismatch",
    }));
  });

  it("evicts the deterministic least-recent inactive snapshot at the LRU bound", () => {
    const cache = new BranchIndexCache(4);
    const snapshots = Array.from({ length: 5 }, (_, index) => {
      const id = `branch-${index + 1}`;
      const built = coldBuildBranchIndex({ key: key(id), entries: [message(id, "user", id)] });
      expect(built.ok).toBe(true);
      if (built.ok) cache.install(built);
      return built;
    });
    expect(cache.size).toBe(4);
    expect(cache.snapshotIds()).not.toContain(snapshots[0]!.ok ? snapshots[0]!.snapshot.keyId : "");
    expect(cache.counters().snapshotEvictions).toBe(1);
    expect(cache.current?.key.branchLeafId).toBe("branch-5");
  });

  it("archives the old epoch and starts current refs from one", () => {
    const old = coldBuildBranchIndex({ key: key("old"), entries: [message("old", "user", "old body")] });
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    const cache = new BranchIndexCache();
    cache.install(old);
    const next = cache.rolloverEpoch({
      key: key("new", "checkpoint-1"),
      entries: [message("new", "user", "new body", "checkpoint-1")],
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(cache.archivedSize).toBe(1);
    expect(next.counters.epochArchives).toBe(1);
    expect(resolveBranchMessageReference(next.snapshot, {
      keyId: next.snapshot.keyId,
      catalogId: next.snapshot.catalogId,
    }, "m000001").value?.entryId).toBe("new");
    expect(cache.resolveArchivedMessage(old.snapshot.keyId, old.snapshot.catalogId, "m000001").value?.entryId).toBe("old");
    expect(resolveBranchMessageReference(next.snapshot, {
      keyId: old.snapshot.keyId,
      catalogId: old.snapshot.catalogId,
    }, "m000001").diagnostic).toBe("stale-scope");

    const failedRollover = cache.rolloverEpoch({
      key: { ...key("broken", "checkpoint-2"), replayVersion: "" },
      entries: [message("broken", "user", "broken")],
    });
    expect(failedRollover.ok).toBe(false);
    expect(cache.current).toBe(next.snapshot);
  });

  it("derives and verifies arbitrary prefix proofs without source scans", () => {
    const built = coldBuildBranchIndex({ key: key("e4"), entries: linearEntries(4) });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const prefix = branchAncestryProof(built.snapshot, 2)!;
    expect(prefix).toEqual(expect.objectContaining({ length: 2, tipEntryId: "e2" }));
    expect(verifyBranchAncestryProof(built.snapshot, prefix)).toBe(true);
    expect(verifyBranchAncestryProof(built.snapshot, { ...prefix, tipEntryId: "e1" })).toBe(false);
  });
});

describe("AILI Compact BranchIndex derived invalidation and scoped lookup", () => {
  it("invalidates only token/calibration roots on provider/model change", () => {
    const built = coldBuildBranchIndex({ key: key("e2"), entries: linearEntries(2) });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const withEstimate = setBranchTokenEstimate(built.snapshot, {
      providerId: "provider-a",
      modelId: "model-a",
      estimatorVersion: "estimator-1",
      atomId: "a000001",
      lower: 10,
      upper: 20,
      source: "baseline",
    }).snapshot;
    expect(getBranchTokenEstimate(withEstimate, {
      providerId: "provider-a",
      modelId: "model-a",
      estimatorVersion: "estimator-1",
      atomId: "a000001",
    })).toEqual(expect.objectContaining({ lower: 10, upper: 20 }));
    const identityBefore = branchIndexStructuralIdentity(withEstimate);
    const invalidated = invalidateBranchDerivedIndex(withEstimate, {
      kind: "provider-model-estimator",
      providerId: "provider-b",
      modelId: "model-b",
      estimatorVersion: "estimator-2",
    });
    const identityAfter = branchIndexStructuralIdentity(invalidated.snapshot);

    expect(identityAfter).toEqual(identityBefore);
    expect(invalidated.snapshot.sourceDigest).toBe(withEstimate.sourceDigest);
    expect(invalidated.snapshot.canonicalStateDigest).toBe(withEstimate.canonicalStateDigest);
    expect(invalidated.snapshot.derivedDigest).not.toBe(withEstimate.derivedDigest);
    expect(invalidated.snapshot.derivedValidity).toEqual(expect.objectContaining({
      tokenEstimates: false,
      calibration: false,
      projection: true,
      quality: true,
    }));
    expect(getBranchTokenEstimate(invalidated.snapshot, {
      providerId: "provider-a",
      modelId: "model-a",
      estimatorVersion: "estimator-1",
      atomId: "a000001",
    })).toBeUndefined();
    expect(invalidated.counters).toEqual(expect.objectContaining({
      derivedInvalidations: 1,
      fullRebuilds: 0,
      protocolRebuilds: 0,
      catalogRebuilds: 0,
    }));

    const configInvalidated = invalidateBranchDerivedIndex(withEstimate, { kind: "config", version: "config-2" });
    expect(resolveBranchMessageReference(configInvalidated.snapshot, {
      keyId: configInvalidated.snapshot.keyId,
      catalogId: configInvalidated.snapshot.catalogId,
    }, "m000001").diagnostic).toBe("stale-catalog");
  });

  it("indexes duplicate alignment fingerprints as ordered occurrence queues", () => {
    const entries = [
      message("e1", "user", "same"),
      message("e2", "user", "same", "e1"),
      message("e3", "assistant", "different", "e2"),
    ];
    const built = coldBuildBranchIndex({ key: key("e3"), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const fingerprint = getIndexedEntry(built.snapshot, "e1")!.alignmentFingerprint;
    expect(getFingerprintOccurrences(built.snapshot, fingerprint)).toEqual([1, 2]);
  });

  it("permits one Pi-synthesized compaction summary but rejects a duplicate", () => {
    const userMessage: Record<string, unknown> = { role: "user", content: "question" };
    const assistantMessage: Record<string, unknown> = { role: "assistant", content: "answer" };
    const entries: BranchSessionEntry[] = [
      { id: "e1", type: "message", message: userMessage },
      { id: "e2", type: "message", parentId: "e1", message: assistantMessage },
    ];
    const built = coldBuildBranchIndex({ key: key("e2", "checkpoint-1"), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const summary: Record<string, unknown> = { role: "compactionSummary", content: "checkpoint summary" };
    const cleanProviderInput = [summary, userMessage, assistantMessage];
    const clean = alignBranchProviderMessages(built.snapshot, cleanProviderInput);
    expect(clean.diagnostic).toBeUndefined();
    expect([...clean.byEntryId.entries()]).toEqual([["e1", 1], ["e2", 2]]);

    const ambiguous = alignBranchProviderMessages(built.snapshot, [...cleanProviderInput, summary]);
    expect(ambiguous.diagnostic).toBe("alignment-ambiguous:unknown");
    expect(ambiguous.byEntryId.size).toBe(0);

    const nextClean = alignBranchProviderMessages(built.snapshot, cleanProviderInput);
    expect(nextClean.diagnostic).toBeUndefined();
    expect([...nextClean.byEntryId.keys()]).toEqual(["e1", "e2"]);
  });

  it("uses scoped map paging and keeps healthy provider requests at one pass", () => {
    const built = coldBuildBranchIndex({ key: key("e5"), entries: linearEntries(5) });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const scope = { keyId: built.snapshot.keyId, catalogId: built.snapshot.catalogId };
    const page = pageBranchReferences(built.snapshot, scope, 1, 2);
    expect(page.value?.messages.map((item) => item.ref)).toEqual(["m000002", "m000003"]);
    expect(page.counters.fullScans).toBe(0);
    expect(resolveBranchMessageReference(built.snapshot, { ...scope, catalogId: "stale" }, "m000001")).toEqual(expect.objectContaining({
      diagnostic: "stale-catalog",
      counters: expect.objectContaining({ hashLookups: 0, fullScans: 0 }),
    }));

    const providerPass = visitProviderMessagesOnce([1, 2, 3], (value) => value * 2);
    expect(providerPass.values).toEqual([2, 4, 6]);
    expect(providerPass.counters).toEqual(expect.objectContaining({
      providerMessagePasses: 1,
      providerMessageVisits: 3,
      fullReducerRuns: 0,
      transactionReplayRuns: 0,
      protocolRebuilds: 0,
      protectionRebuilds: 0,
      catalogRebuilds: 0,
    }));
  });
});

describe("AILI Compact BranchIndex deterministic performance evidence", () => {
  it("meets the fixed 10K build and 100K scoped reference budgets without source leakage", () => {
    const entries = linearEntries(10_000, "p");
    entries[123] = message("p124", "assistant", "DO-NOT-LEAK-SOURCE-BODY", "p123");
    const built = coldBuildBranchIndex({ key: key("p10000"), entries });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const coldBudget = evaluateBranchIndexBudget({
      operation: "cold-build",
      snapshot: built.snapshot,
      counters: built.counters,
    });
    expect(coldBudget.passed).toBe(true);

    const queries = Array.from({ length: 100_000 }, (_, index) => ({
      kind: "message" as const,
      ref: `m${String(index % 10_000 + 1).padStart(6, "0")}`,
    }));
    const resolved = resolveBranchReferences(built.snapshot, {
      keyId: built.snapshot.keyId,
      catalogId: built.snapshot.catalogId,
    }, queries);
    expect(resolved.values).toHaveLength(100_000);
    expect(resolved.values.every(Boolean)).toBe(true);
    expect(resolved.counters).toEqual(expect.objectContaining({ hashLookups: 100_000, fullScans: 0 }));
    expect(evaluateBranchIndexBudget({
      operation: "reference-lookup",
      snapshot: built.snapshot,
      counters: resolved.counters,
      referenceOperations: 100_000,
    }).passed).toBe(true);

    const evidence = branchIndexPerformanceEvidence("fixed-seed-10000", {
      operation: "reference-lookup",
      snapshot: built.snapshot,
      counters: resolved.counters,
      referenceOperations: 100_000,
    }, { durationMs: 1, heapDeltaBytes: 2, nodeVersion: "fixture-node", platform: "fixture-platform" });
    expect(evidence).toEqual(expect.objectContaining({
      seed: "fixed-seed-10000",
      canonicalStateDigest: built.snapshot.canonicalStateDigest,
      budget: expect.objectContaining({ passed: true }),
      comparative: { durationMs: 1, heapDeltaBytes: 2 },
    }));
    expect(JSON.stringify(evidence)).not.toContain("DO-NOT-LEAK-SOURCE-BODY");
    expect(branchIndexKeyId(built.snapshot.key)).toBe(built.snapshot.keyId);
  }, 30_000);
});
