import { describe, expect, it } from "vitest";

import {
  AILI_COMPACT_ENTRY,
  isCompactTransaction,
  isV3CompactTransactionCandidate,
  sourceDigest,
  type CompactBlock,
  type CompactTransaction,
  type SessionLikeEntry,
} from "../../src/runtime/aili-compact/contracts.js";
import {
  reduceCompactReadBundle,
  reduceCompactState,
  reduceV3LifecycleState,
  transactionFromEntry,
} from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  advanceV3Epoch,
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

function message(id: string): SessionLikeEntry {
  return { id, type: "message", message: { role: "assistant", content: `source:${id}` } };
}

function custom(id: string, data: unknown): SessionLikeEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data };
}

function publicTransaction(
  prefix: readonly SessionLikeEntry[],
  state: V3LifecycleState,
  transaction: V3Transaction,
): V3Transaction {
  return {
    ...transaction,
    header: {
      ...transaction.header,
      catalogId: deriveRuntimeCatalogIdForState(prefix, reduceCompactState(prefix), state),
    },
  };
}

function empty(epochId = "root"): V3LifecycleState {
  return createEmptyV3State({
    sessionId: "session",
    branchLeafId: "leaf",
    epochId,
    projectionVersion: "projection-v3",
  });
}

function header(current: V3LifecycleState, txId: string, createdAt: number) {
  return {
    schema: AILI_COMPACT_SCHEMA_V3,
    txId,
    sessionId: current.sessionId,
    branchLeafId: current.branchLeafId,
    epochId: current.epochId,
    catalogId: current.catalogId,
    createdAt,
    projectionVersion: current.projectionVersion,
  } as const;
}

function tokens(tier: V3Tier): V3TokenMetadata {
  const sourceTokensLower = tier === "T3" ? 10_000 : 2_000;
  const replacementTokensUpper = tier === "T3" ? 8_000 : 1_000;
  const steadySavingsTokensLower = sourceTokensLower - replacementTokensUpper;
  const oneTimeCostTokensUpper = 500;
  return {
    estimatorVersion: "estimator-v1",
    providerId: "provider",
    modelId: "model",
    sourceTokensLower,
    sourceTokensUpper: sourceTokensLower,
    replacementTokensUpper,
    steadySavingsTokensLower,
    oneTimeCostTokensUpper,
    breakEvenTurnsUpper: Math.ceil(oneTimeCostTokensUpper / steadySavingsTokensLower),
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

function semanticTransaction(
  current: V3LifecycleState,
  txId: string,
  createdAt: number,
  payload: V3SemanticCreatePayload,
): V3Transaction {
  return { header: header(current, txId, createdAt), tag: "semantic-create", payload };
}

function t1Transaction(
  current: V3LifecycleState,
  blockId: string,
  entryIds: string[],
  createdAt: number,
): V3Transaction {
  const summary = `summary:${blockId}`;
  return semanticTransaction(current, `tx:${blockId}`, createdAt, {
    blockId,
    tier: "T1",
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: entryIds[0]!,
    createdTurnOrdinal: createdAt,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: {
      kind: "messages",
      entryIds,
      firstEntryId: entryIds[0]!,
      lastEntryId: entryIds.at(-1)!,
    },
    leafDigest: v3MessageLeafDigest(entryIds),
    leafCount: entryIds.length,
    tokens: tokens("T1"),
    quality: quality(),
  });
}

function parentTransaction(
  current: V3LifecycleState,
  blockId: string,
  childBlockIds: string[],
  createdAt: number,
): V3Transaction {
  const children = childBlockIds.map((id) => current.blocks.get(id)!);
  const leafCount = children.reduce((total, child) => total + child.leafCount, 0);
  const summary = `summary:${blockId}`;
  return semanticTransaction(current, `tx:${blockId}`, createdAt, {
    blockId,
    tier: "T2",
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: children[0]!.anchorEntryId,
    createdTurnOrdinal: createdAt,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "blocks", childBlockIds },
    leafDigest: v3ParentLeafDigest("T2", leafCount, children.map((child) => child.leafDigest)),
    leafCount,
    tokens: tokens("T2"),
    quality: quality(),
  });
}

function applied(
  current: V3LifecycleState,
  transaction: V3Transaction,
  messageOrdinals?: ReadonlyMap<string, number>,
): V3LifecycleState {
  const result = applyV3Transaction(current, transaction, { messageOrdinals });
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function legacyTransaction(source: SessionLikeEntry): CompactTransaction {
  const block: CompactBlock = {
    id: "legacy:block",
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [source.id],
    sourceDigest: sourceDigest([source], [source.id]),
    summary: "legacy summary",
    active: true,
    mode: "message",
    topic: "Legacy",
    batchTopic: "Legacy",
    anchorEntryId: source.id,
    runId: "legacy-run",
    childBlockIds: [],
    generation: "young",
    survivedCount: 0,
    age: 0,
  };
  return { schema: "aili.compact.tx.v2", id: "legacy-tx", kind: "compact", epochId: "root", blocks: [block] };
}

function successfulLegacyResult(id: string, transaction: CompactTransaction): SessionLikeEntry {
  return {
    id,
    type: "message",
    message: {
      role: "toolResult",
      toolCallId: transaction.id,
      toolName: "aili_compact",
      isError: false,
      content: [],
      details: { contextTx: transaction },
    },
  };
}

describe("AILI Compact v3 reducer integration", () => {
  it("keeps the v1/v2 reader unchanged while atomically exposing mixed legacy and v3 state", () => {
    const legacySource = message("legacy-message");
    const legacy = legacyTransaction(legacySource);
    const v3Source = message("v3-message");
    const initial = empty();
    const v3 = t1Transaction(initial, "v3:t1", [v3Source.id], 1);
    const entries = [legacySource, successfulLegacyResult("legacy-result", legacy), v3Source];
    const v3Entry = custom("v3-entry", publicTransaction(entries, initial, v3));
    entries.push(v3Entry);

    const bundle = reduceCompactReadBundle(entries);
    expect(bundle.legacy.blocks.has("legacy:block")).toBe(true);
    expect(bundle.legacy.blocks.has("v3:t1")).toBe(false);
    expect(bundle.v3.state?.blocks.has("v3:t1")).toBe(true);
    expect(bundle.v3.maximalActiveBlocks.map((block) => block.blockId)).toEqual(["v3:t1"]);
    expect(bundle.v3.archivedQueryOnlyBlocks).toEqual([]);
    expect(bundle.v3.diagnostics).toEqual([]);
    expect(transactionFromEntry(v3Entry)).toBeUndefined();
    expect(isCompactTransaction(v3)).toBe(false);
    expect(isV3CompactTransactionCandidate(v3)).toBe(true);
  });

  it("replays atomic parent/child transitions and returns only maximal active v3 blocks", () => {
    const firstMessage = message("message:1");
    const secondMessage = message("message:2");
    const ordinals = new Map([[firstMessage.id, 1], [secondMessage.id, 2]]);
    let fixture = empty();
    const firstPrestate = fixture;
    const first = t1Transaction(fixture, "t1:first", [firstMessage.id], 1);
    fixture = applied(fixture, first, ordinals);
    const secondPrestate = fixture;
    const second = t1Transaction(fixture, "t1:second", [secondMessage.id], 1);
    fixture = applied(fixture, second, ordinals);
    const parentPrestate = fixture;
    const parent = parentTransaction(fixture, "t2:parent", ["t1:first", "t1:second"], 2);
    const replayEntries: SessionLikeEntry[] = [firstMessage, secondMessage];
    replayEntries.push(custom("first", publicTransaction(replayEntries, firstPrestate, first)));
    replayEntries.push(custom("second", publicTransaction(replayEntries, secondPrestate, second)));
    replayEntries.push(custom("parent", publicTransaction(replayEntries, parentPrestate, parent)));
    const replay = reduceV3LifecycleState(replayEntries);
    expect(replay.diagnostics).toEqual([]);
    expect(replay.acceptedTransactionCount).toBe(3);
    expect(replay.maximalActiveBlocks.map((block) => block.blockId)).toEqual(["t2:parent"]);
    expect(replay.state?.blocks.get("t1:first")).toMatchObject({ active: false, deactivationReason: "nested" });
    expect(replay.state?.blocks.get("t1:second")).toMatchObject({ active: false, deactivationReason: "nested" });
  });

  it("rejects duplicate decompression roots independently of the planner", () => {
    const firstMessage = message("duplicate-root:1");
    const secondMessage = message("duplicate-root:2");
    let state = empty();
    state = applied(state, t1Transaction(state, "duplicate-child:1", [firstMessage.id], 1), new Map([[firstMessage.id, 1]]));
    state = applied(state, t1Transaction(state, "duplicate-child:2", [secondMessage.id], 2), new Map([[secondMessage.id, 2]]));
    state = applied(state, parentTransaction(state, "duplicate-parent", ["duplicate-child:1", "duplicate-child:2"], 3));
    const transaction: V3Transaction = {
      header: header(state, "duplicate-decompress", 4),
      tag: "decompress",
      payload: {
        rootBlockIds: ["duplicate-parent", "duplicate-parent"],
        depth: "raw",
        provenance: { kind: "explicit-user", id: "user:duplicate" },
        reason: "decompress",
      },
    };
    expect(applyV3Transaction(state, transaction)).toMatchObject({
      ok: false,
      code: "invalid-field",
      path: "$.payload.rootBlockIds",
    });
  });

  it("archives prior-epoch v3 blocks as query-only and starts the new epoch cleanly", () => {
    const firstMessage = message("epoch-one-message");
    let fixture = empty();
    const firstPrestate = fixture;
    const first = t1Transaction(fixture, "epoch-one-block", [firstMessage.id], 1);
    fixture = applied(fixture, first, new Map([[firstMessage.id, 1]]));
    const advanced = advanceV3Epoch(fixture, "epoch-2");
    if (!advanced.ok) throw new Error(`${advanced.code}:${advanced.path}`);
    fixture = advanced.value;
    const secondPrestate = fixture;
    const secondMessage = message("epoch-two-message");
    const second = t1Transaction(fixture, "epoch-two-block", [secondMessage.id], 2);
    const replayEntries: SessionLikeEntry[] = [firstMessage];
    replayEntries.push(custom("epoch-one-transaction", publicTransaction(replayEntries, firstPrestate, first)));
    replayEntries.push({ id: "epoch-2", type: "compaction" }, secondMessage);
    replayEntries.push(custom("epoch-two-transaction", publicTransaction(replayEntries, secondPrestate, second)));
    const replay = reduceV3LifecycleState(replayEntries);
    expect(replay.diagnostics).toEqual([]);
    expect(replay.state?.epochId).toBe("epoch-2");
    expect(replay.maximalActiveBlocks.map((block) => block.blockId)).toEqual(["epoch-two-block"]);
    expect(replay.archivedQueryOnlyBlocks.map((block) => block.blockId)).toEqual(["epoch-one-block"]);
    expect(replay.archivedQueryOnlyBlocks[0]).toMatchObject({
      active: false,
      queryOnly: true,
      deactivationReason: "epoch",
    });
  });

  it("diagnoses interrupted and stale transactions without poisoning or partially changing replay", () => {
    const firstMessage = message("message:valid");
    const secondMessage = message("message:stale");
    const initial = empty();
    const accepted = t1Transaction(initial, "accepted", [firstMessage.id], 1);
    const stale = t1Transaction(initial, "stale", [secondMessage.id], 2);
    const replayEntries: SessionLikeEntry[] = [
      custom("interrupted", { header: { schema: AILI_COMPACT_SCHEMA_V3 }, tag: "semantic-create" }),
      firstMessage,
      secondMessage,
    ];
    const staleBound = publicTransaction(replayEntries, initial, stale);
    replayEntries.push(custom("accepted-entry", publicTransaction(replayEntries, initial, accepted)));
    replayEntries.push(custom("stale-entry", staleBound));
    const replay = reduceV3LifecycleState(replayEntries);

    expect(replay.acceptedTransactionCount).toBe(1);
    expect([...replay.state!.blocks.keys()]).toEqual(["accepted"]);
    expect(replay.maximalActiveBlocks.map((block) => block.blockId)).toEqual(["accepted"]);
    expect(replay.diagnostics).toEqual([
      expect.objectContaining({ phase: "parse", entryId: "interrupted", code: "invalid-field", path: "$.header.txId" }),
      expect.objectContaining({ phase: "apply", entryId: "stale-entry", transactionId: "tx:stale", code: "stale-catalog", path: "$.header.catalogId" }),
    ]);
  });

  it("rejects v1/v2 IDs as v3 children instead of fabricating compatibility lineage", () => {
    const legacySource = message("legacy-child-source");
    const legacy = legacyTransaction(legacySource);
    const initial = empty();
    const summary = "invalid legacy parent";
    const attemptedParent = semanticTransaction(initial, "tx:legacy-parent", 1, {
      blockId: "legacy-parent",
      tier: "T2",
      topic: "legacy-parent",
      runId: "legacy-parent-run",
      anchorEntryId: legacySource.id,
      createdTurnOrdinal: 1,
      summary,
      summaryDigest: v3SummaryDigest(summary),
      source: { kind: "blocks", childBlockIds: ["legacy:block", "unknown:block"] },
      leafDigest: v3ParentLeafDigest("T2", 2, ["a".repeat(64), "b".repeat(64)]),
      leafCount: 2,
      tokens: tokens("T2"),
      quality: quality(),
    });

    const entries: SessionLikeEntry[] = [
      legacySource,
      successfulLegacyResult("legacy-result", legacy),
    ];
    entries.push(custom("attempted-parent", publicTransaction(entries, initial, attemptedParent)));
    const bundle = reduceCompactReadBundle(entries);
    expect(bundle.legacy.blocks.has("legacy:block")).toBe(true);
    expect(bundle.v3.state).toBeUndefined();
    expect(bundle.v3.diagnostics).toEqual([
      expect.objectContaining({ phase: "apply", code: "legacy-child", path: "$.payload.source.childBlockIds.legacy:block" }),
    ]);
  });
});
