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

function semanticTx(current: V3LifecycleState, txId: string, payload: V3SemanticCreatePayload): V3Transaction {
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
): V3Transaction {
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
    source: { kind: "blocks", childBlockIds: childIds },
    leafDigest: v3ParentLeafDigest(tier, leafCount, children.map((child) => child.leafDigest)),
    leafCount,
    tokens: tokenMetadata,
    quality: quality(),
  });
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
