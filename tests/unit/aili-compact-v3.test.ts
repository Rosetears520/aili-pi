import { describe, expect, it } from "vitest";
import {
  AILI_COMPACT_SCHEMA_V3,
  advanceV3Epoch,
  applyV3Transaction,
  createEmptyV3State,
  deriveV3CatalogId,
  maximalActiveV3Blocks,
  parseV3Transaction,
  validateV3LifecycleState,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3SemanticBlock,
  type V3SemanticCreatePayload,
  type V3Tier,
  type V3TokenMetadata,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";
import {
  classifyTransparentPromotionGaps,
  createAiliPlanningResultEnvelope,
} from "../../src/runtime/aili-compact/promotion-gaps.js";
import type { SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";

const FACT_DIGEST = "f".repeat(64);

function state(): V3LifecycleState {
  return createEmptyV3State({ sessionId: "session", branchLeafId: "leaf", epochId: "root", projectionVersion: "projection-v3" });
}

function header(current: V3LifecycleState, txId: string, createdAt = 1) {
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

function tokens(tier: V3Tier, overrides: Partial<V3TokenMetadata> = {}): V3TokenMetadata {
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
    savingsRatio: tier === "T3" ? 0.20 : 0.50,
    summaryTokensUpper: 300,
    ...overrides,
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

function semanticTx(
  current: V3LifecycleState,
  txId: string,
  payload: V3SemanticCreatePayload,
): Extract<V3Transaction, { tag: "semantic-create" }> {
  return { header: header(current, txId, payload.createdTurnOrdinal), tag: "semantic-create", payload };
}

function t1Tx(
  current: V3LifecycleState,
  blockId: string,
  entryIds: string[],
  createdTurnOrdinal = 1,
): V3Transaction {
  const summary = `summary:${blockId}`;
  return semanticTx(current, `tx:${blockId}`, {
    blockId,
    tier: "T1",
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: entryIds[0]!,
    createdTurnOrdinal,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "messages", entryIds, firstEntryId: entryIds[0]!, lastEntryId: entryIds.at(-1)! },
    leafDigest: v3MessageLeafDigest(entryIds),
    leafCount: entryIds.length,
    tokens: tokens("T1"),
    quality: quality(),
  });
}

function parentTx(
  current: V3LifecycleState,
  blockId: string,
  tier: "T2" | "T3",
  childIds: string[],
  createdTurnOrdinal: number,
  tokenMetadata = tokens(tier),
  transparentGaps?: Extract<V3SemanticCreatePayload["source"], { kind: "blocks" }>["transparentGaps"],
): Extract<V3Transaction, { tag: "semantic-create" }> {
  const children = childIds.map((id) => current.blocks.get(id)!);
  const leafCount = children.reduce((total, child) => total + child.leafCount, 0);
  const summary = `summary:${blockId}`;
  return semanticTx(current, `tx:${blockId}`, {
    blockId,
    tier,
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: children[0]!.anchorEntryId,
    createdTurnOrdinal,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: {
      kind: "blocks",
      childBlockIds: childIds,
      ...(transparentGaps ? { transparentGaps } : {}),
    },
    leafDigest: v3ParentLeafDigest(tier, leafCount, children.map((child) => child.leafDigest)),
    leafCount,
    tokens: tokenMetadata,
    quality: quality(),
  });
}

function messageEntry(id: string, message: Record<string, unknown>): SessionLikeEntry {
  return { id, type: "message", message };
}

function applied(current: V3LifecycleState, transaction: V3Transaction, ordinals?: ReadonlyMap<string, number>): V3LifecycleState {
  const result = applyV3Transaction(current, transaction, { messageOrdinals: ordinals });
  expect(result).toEqual(expect.objectContaining({ ok: true }));
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function addT1(current: V3LifecycleState, blockId: string, ordinal: number, turn = 1): V3LifecycleState {
  const entryId = `message:${ordinal}`;
  return applied(current, t1Tx(current, blockId, [entryId], turn), new Map([[entryId, ordinal]]));
}

function activeT3Pair(): V3LifecycleState {
  let current = state();
  for (let index = 1; index <= 8; index += 1) current = addT1(current, `t1:${index}`, index);
  for (let index = 0; index < 4; index += 1) {
    current = applied(current, parentTx(current, `t2:${index + 1}`, "T2", [`t1:${index * 2 + 1}`, `t1:${index * 2 + 2}`], 2));
  }
  current = applied(current, parentTx(current, "t3:1", "T3", ["t2:1", "t2:2"], 3));
  current = applied(current, parentTx(current, "t3:2", "T3", ["t2:3", "t2:4"], 3));
  return current;
}

describe("AILI Compact v3 closed contract", () => {
  it("strictly parses all five tagged arms", () => {
    const current = state();
    const semantic = t1Tx(current, "t1", ["message:1"]);
    const operations: unknown[] = [
      semantic,
      { header: header(current, "decompress"), tag: "decompress", payload: { rootBlockIds: ["t1"], depth: "raw", provenance: { kind: "explicit-user", id: "request:1" }, reason: "decompress" } },
      { header: header(current, "recompress"), tag: "recompress", payload: { rootBlockIds: ["t1"], decompressionTxId: "decompress", provenance: { kind: "explicit-user", id: "request:2" }, reason: "recompress" } },
      { header: header(current, "cooling"), tag: "cooling", payload: {
        targetEntryIds: ["result:1"], profile: "retrieval", profileVersion: "cool-v1", reason: "cool",
        provenance: {
          kind: "provider-observation", sessionId: "session", branchLeafId: "leaf", epochId: "root",
          callEntryId: "call-entry", callId: "call", normalizedExactToolName: "read", resultEntryId: "result:1",
          resultBodyDigest: "b".repeat(64), providerInputIdentity: "c".repeat(64), settledRequestId: "request:3",
        },
      } },
      { header: header(current, "control"), tag: "control", payload: { action: "restore-all", targetBlockIds: [], provenance: { kind: "explicit-user", id: "request:4" }, reason: "restore-all" } },
    ];
    expect(operations.map((operation) => parseV3Transaction(operation).ok)).toEqual([true, true, true, true, true]);
  });

  it("replays legacy tier records but accepts tierless active-block state", () => {
    const current = state();
    const legacy = t1Tx(current, "legacy:t1", ["message:1"]);
    expect(parseV3Transaction(legacy)).toEqual(expect.objectContaining({ ok: true }));
    const first = applyV3Transaction(current, legacy, { messageOrdinals: new Map([["message:1", 1]]) });
    expect(first).toEqual(expect.objectContaining({ ok: true }));
    if (!first.ok) return;
    const activeBase = t1Tx(first.value.state, "active", ["message:2"], 2) as Extract<V3Transaction, { tag: "semantic-create" }>;
    const { tier: _tier, ...payload } = activeBase.payload;
    const active = { ...activeBase, payload } as Extract<V3Transaction, { tag: "semantic-create" }>;
    expect(parseV3Transaction(active)).toEqual(expect.objectContaining({ ok: true }));
    const next = applyV3Transaction(first.value.state, active, { messageOrdinals: new Map([["message:2", 2]]) });
    expect(next).toEqual(expect.objectContaining({ ok: true }));
    if (!next.ok) return;
    expect(next.value.state.blocks.get("legacy:t1")?.tier).toBe("T1");
    expect(next.value.state.blocks.get("active")).not.toHaveProperty("tier");
  });

  it("rejects unknown fields, caller-owned active state, mixed source arms, and invented reasons deterministically", () => {
    const current = state();
    const base = t1Tx(current, "t1", ["message:1"]);
    const payload = (base as Extract<V3Transaction, { tag: "semantic-create" }>).payload;
    expect(parseV3Transaction({ ...base, zeta: true, alpha: true })).toEqual({ ok: false, code: "unknown-field", path: "$.alpha" });
    expect(parseV3Transaction({ ...base, payload: { ...payload, active: true } })).toEqual({ ok: false, code: "unknown-field", path: "$.payload.active" });
    expect(parseV3Transaction({
      ...base,
      payload: { ...payload, source: { ...payload.source, childBlockIds: ["a", "b"] } },
    })).toEqual({ ok: false, code: "invalid-source", path: "$.payload.source.childBlockIds" });
    expect(parseV3Transaction({
      header: header(current, "bad-reason"),
      tag: "decompress",
      payload: { rootBlockIds: ["t1"], depth: "raw", provenance: { kind: "explicit-user", id: "request" }, reason: "gc" },
    })).toEqual({ ok: false, code: "invalid-field", path: "$.payload.reason" });
  });

  it("validates summary, leaf, token and quality metadata before transition", () => {
    const current = state();
    const base = t1Tx(current, "t1", ["message:1"]) as Extract<V3Transaction, { tag: "semantic-create" }>;
    expect(parseV3Transaction({ ...base, payload: { ...base.payload, summaryDigest: "a".repeat(64) } }))
      .toEqual({ ok: false, code: "digest-mismatch", path: "$.payload.summaryDigest" });
    expect(parseV3Transaction({ ...base, payload: { ...base.payload, leafCount: 2 } }))
      .toEqual({ ok: false, code: "leaf-count-mismatch", path: "$.payload.leafCount" });
    expect(parseV3Transaction({ ...base, payload: { ...base.payload, tokens: { ...base.payload.tokens, steadySavingsTokensLower: 999 } } }))
      .toEqual({ ok: false, code: "token-metadata-invalid", path: "$.payload.tokens.steadySavingsTokensLower" });
    expect(parseV3Transaction({ ...base, payload: { ...base.payload, quality: { ...quality(), coveredHardFactCount: 0 } } }))
      .toEqual({ ok: false, code: "quality-metadata-invalid", path: "$.payload.quality.coveredHardFactCount" });
  });

  it("binds structural block sources, proof snapshots, and creating transactions into the catalog identity", () => {
    let current = addT1(state(), "t1:left", 1);
    current = addT1(current, "t1:right", 2);
    current = applied(current, parentTx(current, "t2:parent", "T2", ["t1:left", "t1:right"], 2));
    const parent = current.blocks.get("t2:parent")!;
    const source = parent.source as Extract<V3SemanticBlock["source"], { kind: "blocks" }>;
    const withSnapshot = (sourceSnapshotDigest: string): V3LifecycleState => {
      const blocks = new Map(current.blocks);
      blocks.set(parent.blockId, {
        ...parent,
        source: {
          ...source,
          transparentGaps: [{
            version: 1,
            leftChildBlockId: "t1:left",
            rightChildBlockId: "t1:right",
            leftLeafEntryId: "message:1",
            rightLeafEntryId: "message:2",
            messageCount: 1,
            gapDigest: "a".repeat(64),
            sourceSnapshotDigest,
          }],
        },
      });
      return { ...current, blocks };
    };
    const firstSnapshot = withSnapshot("b".repeat(64));
    const secondSnapshot = withSnapshot("c".repeat(64));
    const changedTokens: V3LifecycleState = {
      ...current,
      blocks: new Map(current.blocks).set(parent.blockId, {
        ...parent,
        tokens: { ...parent.tokens, summaryTokensUpper: parent.tokens.summaryTokensUpper + 1 },
      }),
    };
    const acceptedQuality = parent.quality as Extract<V3SemanticBlock["quality"], { status: "accepted" | "accepted-with-warnings" }>;
    const changedQuality: V3LifecycleState = {
      ...current,
      blocks: new Map(current.blocks).set(parent.blockId, {
        ...parent,
        quality: { ...acceptedQuality, sourceFactDigest: "e".repeat(64) },
      }),
    };
    const transaction = current.transactions.get(parent.transactionId)!;
    if (transaction.tag !== "semantic-create") throw new Error("fixture parent transaction must be semantic");
    const changedCreatingTransaction: V3LifecycleState = {
      ...current,
      transactions: new Map(current.transactions).set(parent.transactionId, {
        ...transaction,
        payload: { ...transaction.payload, topic: "altered creating transaction" },
      }),
    };

    expect(deriveV3CatalogId(firstSnapshot)).not.toBe(deriveV3CatalogId(secondSnapshot));
    expect(deriveV3CatalogId(changedTokens)).not.toBe(current.catalogId);
    expect(deriveV3CatalogId(changedQuality)).not.toBe(current.catalogId);
    expect(deriveV3CatalogId(changedCreatingTransaction)).not.toBe(current.catalogId);
  });

  it("parses and replays exactly 18,000 semantic-summary UTF-16 characters", () => {
    const current = state();
    const base = t1Tx(current, "t1-summary-cap", ["message:1"]) as Extract<V3Transaction, { tag: "semantic-create" }>;
    const summary = "s".repeat(18_000);
    const exact = {
      ...base,
      payload: { ...base.payload, summary, summaryDigest: v3SummaryDigest(summary) },
    };
    expect(parseV3Transaction(exact)).toEqual(expect.objectContaining({ ok: true }));
    const replayed = applyV3Transaction(current, exact, { messageOrdinals: new Map([["message:1", 1]]) });
    expect(replayed).toEqual(expect.objectContaining({ ok: true }));
    if (replayed.ok) expect(replayed.value.state.blocks.get("t1-summary-cap")?.summary).toHaveLength(18_000);

    const oversized = "s".repeat(18_001);
    expect(parseV3Transaction({
      ...base,
      payload: { ...base.payload, summary: oversized, summaryDigest: v3SummaryDigest(oversized) },
    })).toEqual({ ok: false, code: "invalid-field", path: "$.payload.summary" });
  });

  it("canonicalizes empty proofs but rejects raw-gap omission and malformed proof shapes", () => {
    let current = addT1(state(), "t1:left", 1);
    current = addT1(current, "t1:right", 4);
    const parent = parentTx(current, "t2:gap", "T2", ["t1:left", "t1:right"], 2);
    const proof = {
      version: 1,
      leftChildBlockId: "t1:left",
      rightChildBlockId: "t1:right",
      leftLeafEntryId: "message:1",
      rightLeafEntryId: "message:4",
      messageCount: 2,
      gapDigest: "a".repeat(64),
      sourceSnapshotDigest: "a".repeat(64),
    };
    const withProof = {
      ...parent,
      payload: { ...parent.payload, source: { ...parent.payload.source, transparentGaps: [proof] } },
    } as Extract<V3Transaction, { tag: "semantic-create" }>;
    const emptyProofs = parseV3Transaction({
      ...parent,
      payload: {
        ...parent.payload,
        source: { ...parent.payload.source, transparentGaps: [] },
      },
    });
    expect(emptyProofs).toEqual(expect.objectContaining({ ok: true }));
    if (emptyProofs.ok) {
      const gapEntries = [
        messageEntry("message:1", { role: "assistant", content: "left" }),
        messageEntry("status:call", {
          role: "assistant",
          toolCalls: [{ id: "status:call", name: "aili_compact_status" }],
        }),
        messageEntry("status:result", {
          role: "toolResult",
          toolCallId: "status:call",
          toolName: "aili_compact_status",
          content: "ok",
        }),
        messageEntry("message:4", { role: "assistant", content: "right" }),
      ];
      expect(applyV3Transaction(current, emptyProofs.value, { promotionGapEntries: gapEntries })).toEqual({
        ok: false,
        code: "invalid-promotion-gap",
        path: "$.payload.source.transparentGaps",
      });
    }
    expect(parseV3Transaction({
      ...withProof,
      payload: {
        ...withProof.payload,
        source: { ...withProof.payload.source, transparentGaps: [{ ...proof, version: 2 }] },
      },
    })).toEqual({ ok: false, code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps.0" });
    expect(parseV3Transaction({
      ...withProof,
      payload: {
        ...withProof.payload,
        source: { ...withProof.payload.source, transparentGaps: [{ ...proof, messageCount: 0 }] },
      },
    })).toEqual({ ok: false, code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps.0" });
    expect(parseV3Transaction({
      ...withProof,
      payload: {
        ...withProof.payload,
        source: { ...withProof.payload.source, transparentGaps: [{ ...proof, extra: true }] },
      },
    })).toEqual({ ok: false, code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps.0.extra" });
    expect(parseV3Transaction({
      ...withProof,
      payload: {
        ...withProof.payload,
        source: { ...withProof.payload.source, transparentGaps: Array.from({ length: 16 }, () => proof) },
      },
    })).toEqual({ ok: false, code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps" });
    expect(parseV3Transaction({
      ...withProof,
      payload: {
        ...withProof.payload,
        source: { ...withProof.payload.source, transparentGaps: [{ ...proof, messageCount: 257 }] },
      },
    })).toEqual({ ok: false, code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps.0" });
  });
});

describe("AILI Compact v3 tier and lifecycle invariants", () => {
  it("creates exact contiguous T1 blocks and rejects a gapped source atomically", () => {
    const initial = state();
    const accepted = applyV3Transaction(initial, t1Tx(initial, "t1", ["message:1", "message:2"]), {
      messageOrdinals: new Map([["message:1", 10], ["message:2", 11]]),
    });
    expect(accepted).toEqual(expect.objectContaining({ ok: true }));
    if (!accepted.ok) return;
    expect(accepted.value.state.blocks.get("t1")).toMatchObject({ tier: "T1", active: true, queryOnly: false, firstLeafOrdinal: 10, lastLeafOrdinal: 11 });

    const rejected = applyV3Transaction(initial, t1Tx(initial, "gap", ["message:1", "message:3"]), {
      messageOrdinals: new Map([["message:1", 10], ["message:3", 12]]),
    });
    expect(rejected).toEqual({ ok: false, code: "non-contiguous-source", path: "$.payload.source.entryIds" });
    expect(initial.blocks.size).toBe(0);
  });

  it("atomically activates a T2 parent, nests its T1 children, and projects only the maximal node", () => {
    let current = addT1(state(), "t1:a", 1);
    current = addT1(current, "t1:b", 2);
    current = applied(current, parentTx(current, "t2", "T2", ["t1:a", "t1:b"], 2));
    expect(current.blocks.get("t2")).toMatchObject({ tier: "T2", active: true, leafCount: 2 });
    expect(current.blocks.get("t1:a")).toMatchObject({ active: false, deactivationReason: "nested" });
    expect(current.blocks.get("t1:b")).toMatchObject({ active: false, deactivationReason: "nested" });
    expect(maximalActiveV3Blocks(current)).toEqual(expect.objectContaining({ ok: true, value: [expect.objectContaining({ blockId: "t2" })] }));
  });

  it("accepts only an independently recomputed raw gap proof and excludes protocol from leaves", () => {
    let current = addT1(state(), "t1:left", 1);
    current = addT1(current, "t1:right", 4);
    const entries = [
      messageEntry("message:1", { role: "assistant", content: "left" }),
      messageEntry("status:call", {
        role: "assistant",
        toolCalls: [{ id: "status:call", name: "aili_compact_status" }],
      }),
      messageEntry("status:result", {
        role: "toolResult",
        toolCallId: "status:call",
        toolName: "aili_compact_status",
        content: JSON.stringify(createAiliPlanningResultEnvelope({
          toolName: "aili_compact_status",
          toolCallId: "status:call",
          identity: { sessionId: current.sessionId, branchLeafId: current.branchLeafId, epochId: current.epochId, revision: current.projectionVersion },
          outcome: "success",
          result: "ok",
        })),
      }),
      messageEntry("message:4", { role: "assistant", content: "right" }),
    ];
    const classified = classifyTransparentPromotionGaps(entries, current.blocks, [
      current.blocks.get("t1:left")!, current.blocks.get("t1:right")!,
    ], {
      sessionId: current.sessionId,
      branchLeafId: current.branchLeafId,
      epochId: current.epochId,
      revision: current.projectionVersion,
    });
    expect(classified).toMatchObject({ ok: true });
    if (!classified.ok) return;
    const proof = classified.proofs[0]!;
    const parent = parentTx(current, "t2:gap", "T2", ["t1:left", "t1:right"], 2, tokens("T2"), [proof]);
    const accepted = applyV3Transaction(current, parent, { promotionGapEntries: entries });
    expect(accepted).toEqual(expect.objectContaining({ ok: true }));
    if (!accepted.ok) return;
    expect(accepted.value.state.blocks.get("t2:gap")).toMatchObject({
      firstLeafOrdinal: 1,
      lastLeafOrdinal: 4,
      leafCount: 2,
      source: { kind: "blocks", transparentGaps: [proof] },
    });
    expect(accepted.value.state.blocks.get("t2:gap")?.leafDigest).toBe(
      v3ParentLeafDigest("T2", 2, [
        accepted.value.state.blocks.get("t1:left")!.leafDigest,
        accepted.value.state.blocks.get("t1:right")!.leafDigest,
      ]),
    );

    const forged = {
      ...parent,
      payload: {
        ...parent.payload,
        source: {
          ...parent.payload.source,
          transparentGaps: [{ ...proof, gapDigest: "0".repeat(64) }],
        },
      },
    } as V3Transaction;
    expect(applyV3Transaction(current, forged, { promotionGapEntries: entries })).toEqual({
      ok: false,
      code: "invalid-promotion-gap",
      path: "$.payload.source.transparentGaps",
    });
    for (const transparentGaps of [
      [{ ...proof, messageCount: 1 }],
      [{ ...proof, leftLeafEntryId: "wrong-left" }],
      [{ ...proof, rightChildBlockId: "wrong-right" }],
      [proof, proof],
    ]) {
      const malformed = {
        ...parent,
        payload: {
          ...parent.payload,
          source: { ...parent.payload.source, transparentGaps },
        },
      } as V3Transaction;
      expect(applyV3Transaction(current, malformed, { promotionGapEntries: entries })).toMatchObject({
        ok: false,
        code: "invalid-promotion-gap",
      });
    }

    const adjacent = addT1(addT1(state(), "t1:adjacent-left", 1), "t1:adjacent-right", 2);
    const adjacentParent = parentTx(adjacent, "t2:adjacent", "T2", ["t1:adjacent-left", "t1:adjacent-right"], 2);
    expect(applyV3Transaction(adjacent, adjacentParent)).toEqual(expect.objectContaining({ ok: true }));
    const adjacentWithProof = parentTx(adjacent, "t2:adjacent-proof", "T2", ["t1:adjacent-left", "t1:adjacent-right"], 2, tokens("T2"), [{
      version: 1,
      leftChildBlockId: "t1:adjacent-left",
      rightChildBlockId: "t1:adjacent-right",
      leftLeafEntryId: "message:1",
      rightLeafEntryId: "message:2",
      messageCount: 1,
      gapDigest: "a".repeat(64),
      sourceSnapshotDigest: "a".repeat(64),
    }]);
    expect(applyV3Transaction(adjacent, adjacentWithProof, {
      promotionGapEntries: [
        messageEntry("message:1", { role: "assistant", content: "left" }),
        messageEntry("message:2", { role: "assistant", content: "right" }),
      ],
    })).toEqual({ ok: false, code: "invalid-promotion-gap", path: "$.payload.source.transparentGaps" });
  });

  it("rejects mixed-tier children and legacy children without partial state", () => {
    let current = addT1(state(), "t1:a", 1);
    current = addT1(current, "t1:b", 2);
    current = addT1(current, "t1:c", 3);
    current = applied(current, parentTx(current, "t2", "T2", ["t1:a", "t1:b"], 2));
    const mixed = parentTx(current, "t3", "T3", ["t2", "t1:c"], 3);
    expect(applyV3Transaction(current, mixed)).toEqual({ ok: false, code: "mixed-tier", path: "$.payload.source.childBlockIds" });

    const legacyPayload = (mixed as Extract<V3Transaction, { tag: "semantic-create" }>).payload;
    const legacy = {
      ...mixed,
      payload: { ...legacyPayload, source: { kind: "blocks", childBlockIds: ["legacy:v2", "t2"] } },
    };
    expect(applyV3Transaction(current, legacy, { legacyBlockIds: new Set(["legacy:v2"]) }))
      .toEqual({ ok: false, code: "legacy-child", path: "$.payload.source.childBlockIds.legacy:v2" });
    expect(current.blocks.has("t3")).toBe(false);
  });

  it("enforces exact T3 restill turn, token, savings, ratio and summary boundaries", () => {
    const current = activeT3Pair();
    const exactTokens = tokens("T3", {
      sourceTokensLower: 8_000,
      sourceTokensUpper: 8_000,
      replacementTokensUpper: 6_000,
      steadySavingsTokensLower: 2_000,
      oneTimeCostTokensUpper: 2_000,
      breakEvenTurnsUpper: 1,
      savingsRatio: 0.25,
      summaryTokensUpper: 3_000,
    });
    const tooYoung = parentTx(current, "t3:restill-young", "T3", ["t3:1", "t3:2"], 10, exactTokens);
    expect(applyV3Transaction(current, tooYoung)).toEqual({ ok: false, code: "restill-ineligible", path: "$.payload" });

    const exact = parentTx(current, "t3:restill", "T3", ["t3:1", "t3:2"], 11, exactTokens);
    const result = applyV3Transaction(current, exact);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.value.state.blocks.get("t3:restill")).toMatchObject({ tier: "T3", active: true, leafCount: 8 });
    expect(result.value.state.blocks.get("t3:restill")?.leafDigest).toBe(
      v3ParentLeafDigest("T3", 8, [
        result.value.state.blocks.get("t3:1")!.leafDigest,
        result.value.state.blocks.get("t3:2")!.leafDigest,
      ]),
    );
    expect(result.value.state.blocks.get("t3:1")).toMatchObject({ active: false, deactivationReason: "nested" });
  });

  it("performs one-level decompression and exact provenance-bound recompression atomically", () => {
    let current = addT1(state(), "t1:a", 1);
    current = addT1(current, "t1:b", 2);
    current = applied(current, parentTx(current, "t2", "T2", ["t1:a", "t1:b"], 2));
    const decompress: V3Transaction = {
      header: header(current, "tx:decompress"),
      tag: "decompress",
      payload: { rootBlockIds: ["t2"], depth: "one", provenance: { kind: "explicit-user", id: "request:decompress" }, reason: "decompress" },
    };
    current = applied(current, decompress);
    expect(current.blocks.get("t2")).toMatchObject({ active: false, deactivationReason: "decompress", explicitDecompression: { transactionId: "tx:decompress", depth: "one" } });
    expect(current.blocks.get("t1:a")).toMatchObject({ active: true });
    expect(current.blocks.get("t1:a")?.deactivationReason).toBeUndefined();

    const wrong: V3Transaction = {
      header: header(current, "tx:wrong-recompress"),
      tag: "recompress",
      payload: { rootBlockIds: ["t2"], decompressionTxId: "wrong", provenance: { kind: "explicit-user", id: "request:wrong" }, reason: "recompress" },
    };
    expect(applyV3Transaction(current, wrong)).toEqual({ ok: false, code: "provenance-mismatch", path: "$.blocks.t2.explicitDecompression" });

    const recompress: V3Transaction = {
      header: header(current, "tx:recompress"),
      tag: "recompress",
      payload: { rootBlockIds: ["t2"], decompressionTxId: "tx:decompress", provenance: { kind: "explicit-user", id: "request:recompress" }, reason: "recompress" },
    };
    current = applied(current, recompress);
    expect(current.blocks.get("t2")).toMatchObject({ active: true });
    expect(current.blocks.get("t2")?.deactivationReason).toBeUndefined();
    expect(current.blocks.get("t2")?.explicitDecompression).toBeUndefined();
    expect(current.blocks.get("t1:a")).toMatchObject({ active: false, deactivationReason: "nested" });
  });

  it("raw decompression exposes source and recompression restores the unchanged parent", () => {
    let current = addT1(state(), "t1:a", 1);
    current = addT1(current, "t1:b", 2);
    current = applied(current, parentTx(current, "t2", "T2", ["t1:a", "t1:b"], 2));
    const decompress: V3Transaction = {
      header: header(current, "tx:raw"),
      tag: "decompress",
      payload: { rootBlockIds: ["t2"], depth: "raw", provenance: { kind: "explicit-user", id: "request:raw" }, reason: "decompress" },
    };
    current = applied(current, decompress);
    expect([...current.blocks.values()].every((block) => !block.active && block.deactivationReason === "decompress")).toBe(true);
    expect(maximalActiveV3Blocks(current)).toEqual({ ok: true, value: [] });

    const recompress: V3Transaction = {
      header: header(current, "tx:raw-recompress"),
      tag: "recompress",
      payload: { rootBlockIds: ["t2"], decompressionTxId: "tx:raw", provenance: { kind: "explicit-user", id: "request:raw-recompress" }, reason: "recompress" },
    };
    current = applied(current, recompress);
    expect(maximalActiveV3Blocks(current)).toEqual(expect.objectContaining({ ok: true, value: [expect.objectContaining({ blockId: "t2" })] }));
  });

  it("rejects malformed cycles and multiple active parents deterministically", () => {
    let current = addT1(state(), "t1:a", 1);
    current = addT1(current, "t1:b", 2);
    current = applied(current, parentTx(current, "t2", "T2", ["t1:a", "t1:b"], 2));

    const cycleBlocks = new Map(current.blocks);
    cycleBlocks.set("t1:a", { ...cycleBlocks.get("t1:a")!, source: { kind: "blocks", childBlockIds: ["t2", "t1:b"] } } as V3SemanticBlock);
    const cycleBase = { ...current, blocks: cycleBlocks };
    const cyclic = { ...cycleBase, catalogId: deriveV3CatalogId(cycleBase) };
    expect(validateV3LifecycleState(cyclic)).toEqual({ ok: false, code: "cycle", path: "$.blocks.t1:a" });

    const duplicateParent = { ...current.blocks.get("t2")!, blockId: "t2:duplicate", transactionId: "tx:duplicate" };
    const parentBlocks = new Map(current.blocks);
    parentBlocks.set(duplicateParent.blockId, duplicateParent);
    const parentBase = { ...current, blocks: parentBlocks };
    const multiple = { ...parentBase, catalogId: deriveV3CatalogId(parentBase) };
    expect(validateV3LifecycleState(multiple)).toEqual({ ok: false, code: "active-parent", path: "$.blocks.t1:a" });
  });

  it("archives every prior-epoch block as query-only and rejects it for current mutation", () => {
    let current = addT1(state(), "t1", 1);
    const advanced = advanceV3Epoch(current, "compaction-entry");
    expect(advanced).toEqual(expect.objectContaining({ ok: true }));
    if (!advanced.ok) return;
    current = advanced.value;
    expect(current.blocks.get("t1")).toMatchObject({ active: false, queryOnly: true, deactivationReason: "epoch" });
    expect(validateV3LifecycleState(current)).toEqual({ ok: true, value: true });
    const oldRoot: V3Transaction = {
      header: header(current, "tx:old-root"),
      tag: "decompress",
      payload: { rootBlockIds: ["t1"], depth: "raw", provenance: { kind: "explicit-user", id: "request" }, reason: "decompress" },
    };
    expect(applyV3Transaction(current, oldRoot)).toEqual({ ok: false, code: "invalid-root", path: "$.blocks.t1" });
  });

  it("derives restore-all state and never accepts age/gc deactivation for v3 blocks", () => {
    let current = addT1(state(), "t1", 1);
    const control: V3Transaction = {
      header: header(current, "tx:restore-all"),
      tag: "control",
      payload: { action: "restore-all", targetBlockIds: [], provenance: { kind: "explicit-user", id: "request" }, reason: "restore-all" },
    };
    current = applied(current, control);
    expect(current.blocks.get("t1")).toMatchObject({ active: false, deactivationReason: "restore-all" });

    const gcBlocks = new Map(current.blocks);
    gcBlocks.set("t1", { ...gcBlocks.get("t1")!, deactivationReason: "gc" });
    const gcBase = { ...current, blocks: gcBlocks };
    const gcState = { ...gcBase, catalogId: deriveV3CatalogId(gcBase) };
    expect(validateV3LifecycleState(gcState)).toEqual({ ok: false, code: "invalid-active-state", path: "$.blocks.t1.deactivationReason" });
  });
});
