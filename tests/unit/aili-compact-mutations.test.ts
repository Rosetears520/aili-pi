import { describe, expect, it } from "vitest";
import { sourceDigest, type CompactBlock, type CompactState, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import {
  planCompactMutation,
  planDecompression,
  planPruneMutation,
  planRecompression,
} from "../../src/runtime/aili-compact/mutations.js";
import { buildReferenceCatalog } from "../../src/runtime/aili-compact/references.js";

function state(blocks: readonly CompactBlock[] = [], overrides: Partial<CompactState> = {}): CompactState {
  return {
    epochId: "root",
    enabled: true,
    autoCooling: true,
    manualMode: false,
    cachePanel: false,
    hasSessionControl: false,
    hasAutoCoolingControl: false,
    hasManualControl: false,
    hasPanelControl: false,
    blocks: new Map(blocks.map((block) => [block.id, block])),
    policyDecisions: [],
    diagnostics: [],
    ...overrides,
  };
}

const guard = { soleCall: true, siblingToolNames: [] } as const;

function semanticBlock(entries: readonly SessionLikeEntry[], id: string, sourceEntryIds: string[], overrides: Partial<CompactBlock> = {}): CompactBlock {
  return {
    id,
    kind: "semantic",
    epochId: "root",
    sourceEntryIds,
    sourceDigest: sourceDigest(entries, sourceEntryIds),
    summary: "child summary",
    active: true,
    mode: "range",
    topic: "child",
    batchTopic: "child",
    anchorEntryId: sourceEntryIds[0],
    runId: `run:${id}`,
    childBlockIds: [],
    generation: "young",
    survivedCount: 0,
    age: 0,
    ...overrides,
  };
}

function protocolHistory(): SessionLikeEntry[] {
  return [
    { id: "u1", type: "message", message: { role: "user", content: "A".repeat(500) } },
    { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-1", name: "Read", arguments: { path: "notes.txt" } }] } },
    { id: "result", type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "Read", content: "B".repeat(700) } },
    { id: "a2", type: "message", message: { role: "assistant", content: "C".repeat(500) } },
  ];
}

describe("pure compact mutation planning", () => {
  it("normalizes reversed ranges and emits complete v2 protocol coverage", () => {
    const entries = protocolHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    const result = planCompactMutation({
      transactionId: "tx-range",
      catalogId: catalog.catalogId,
      mode: "range",
      topic: "batch",
      ranges: [{ startRef: "m000003", endRef: "m000002", summary: "tool summary" }],
    }, {
      entries,
      state: current,
      guard,
      minSavingsChars: 100,
      estimateRecapOverheadChars: () => 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.normalizedRanges).toEqual([{ startRef: "m000002", endRef: "m000003" }]);
    expect(result.value.transaction.blocks?.[0]).toEqual(expect.objectContaining({
      mode: "range",
      sourceEntryIds: ["call", "result"],
      anchorEntryId: "call",
      runId: "tx-range",
      childBlockIds: [],
    }));
  });

  it("rejects split atoms before material-benefit evaluation", () => {
    const entries = protocolHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    let materialCalls = 0;
    const result = planCompactMutation({
      transactionId: "split",
      catalogId: catalog.catalogId,
      mode: "range",
      topic: "batch",
      ranges: [{ startRef: "m000001", endRef: "m000002", summary: "summary" }],
    }, {
      entries,
      state: current,
      guard,
      estimateRecapOverheadChars: () => { materialCalls += 1; return 0; },
    });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "incomplete-atom" }));
    expect(materialCalls).toBe(0);
  });

  it("rejects overlap and duplicate message atom coverage", () => {
    const entries = protocolHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    const overlap = planCompactMutation({
      transactionId: "overlap",
      catalogId: catalog.catalogId,
      mode: "range",
      topic: "batch",
      ranges: [
        { startRef: "m000002", endRef: "m000003", summary: "one" },
        { startRef: "m000003", endRef: "m000002", summary: "two" },
      ],
    }, { entries, state: current, guard });
    expect(overlap).toEqual(expect.objectContaining({ ok: false, code: "overlap" }));

    const duplicate = planCompactMutation({
      transactionId: "duplicate",
      catalogId: catalog.catalogId,
      mode: "message",
      topic: "batch",
      items: [
        { messageRef: "m000002", topic: "call", summary: "one" },
        { messageRef: "m000003", topic: "result", summary: "two" },
      ],
    }, { entries, state: current, guard });
    expect(duplicate).toEqual(expect.objectContaining({ ok: false, code: "duplicate-coverage" }));
  });

  it("requires explicit nested lineage inclusion and preserves protection reasons", () => {
    const entries = protocolHistory();
    const child = semanticBlock(entries, "child", ["call", "result"]);
    const current = state([child]);
    const catalog = buildReferenceCatalog(entries, current);
    const request = {
      transactionId: "parent",
      catalogId: catalog.catalogId,
      mode: "range" as const,
      topic: "parent",
      ranges: [{ startRef: "m000002", endRef: "m000003", summary: "includes child" }],
    };
    expect(planCompactMutation(request, { entries, state: current, guard })).toEqual(expect.objectContaining({ ok: false, code: "invalid-lineage" }));

    const protectedResult = planCompactMutation(request, {
      entries,
      state: current,
      guard,
      childSummaryIncludes: () => true,
      protect: () => ({ protected: true, reasons: ["recent-user", "protected-file"] }),
    });
    expect(protectedResult).toEqual(expect.objectContaining({ ok: false, code: "protected", reasons: ["recent-user", "protected-file"] }));

    const accepted = planCompactMutation(request, {
      entries,
      state: current,
      guard,
      childSummaryIncludes: ({ child: selectedChild, summary }) => selectedChild.id === "child" && summary.includes("child"),
      estimateRecapOverheadChars: () => 0,
    });
    expect(accepted.ok && accepted.value.transaction.blocks?.[0]?.childBlockIds).toEqual(["child"]);
  });

  it("enforces stale catalog, schema bounds, material benefit, and sole-call guards", () => {
    const entries = protocolHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    const base = {
      transactionId: "message",
      catalogId: catalog.catalogId,
      mode: "message" as const,
      topic: "batch",
      items: [{ messageRef: "m000004", topic: "topic", summary: "summary" }],
    };
    expect(planCompactMutation({ ...base, catalogId: "stale" }, { entries, state: current, guard })).toEqual(expect.objectContaining({ ok: false, code: "stale-catalog" }));
    expect(planCompactMutation(base, { entries, state: current, guard: { soleCall: false, siblingToolNames: ["read"] } })).toEqual(expect.objectContaining({ ok: false, code: "mutation-conflict" }));
    expect(planCompactMutation({ ...base, summaryMaxChars: 255 }, { entries, state: current, guard })).toEqual(expect.objectContaining({ ok: false, code: "invalid-bounds" }));
    expect(planCompactMutation(base, { entries, state: current, guard, minSavingsChars: 1_000, estimateRecapOverheadChars: () => 0 })).toEqual(expect.objectContaining({ ok: false, code: "not-worth-compressing" }));
  });

  it("uses the 15,000-character default and accepts exactly 18,000 legacy semantic-summary characters", () => {
    const entries = protocolHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    const request = {
      transactionId: "legacy-summary-cap",
      catalogId: catalog.catalogId,
      mode: "message" as const,
      topic: "batch",
      items: [{ messageRef: "m000004", topic: "topic", summary: "s".repeat(15_000) }],
    };
    expect(planCompactMutation(request, { entries, state: current, guard, estimateRecapOverheadChars: () => 0 })).toMatchObject({ ok: true });

    const exact = {
      ...request,
      summaryMaxChars: 18_000,
      items: [{ ...request.items[0]!, summary: "s".repeat(18_000) }],
    };
    expect(planCompactMutation(exact, { entries, state: current, guard, estimateRecapOverheadChars: () => 0 })).toMatchObject({ ok: true });
    expect(planCompactMutation({
      ...exact,
      items: [{ ...exact.items[0]!, summary: "s".repeat(18_001) }],
    }, { entries, state: current, guard, estimateRecapOverheadChars: () => 0 }))
      .toEqual(expect.objectContaining({ ok: false, code: "invalid-bounds" }));
  });
});

describe("pure decompress and recompress planning", () => {
  it("plans 1..16 all-or-nothing current-epoch targets and nested lineage", () => {
    const entries: SessionLikeEntry[] = [
      { id: "one", type: "message", message: { role: "assistant", content: "one" } },
      { id: "two", type: "message", message: { role: "assistant", content: "two" } },
    ];
    const child = semanticBlock(entries, "child", ["one"], { active: false, deactivationReason: "nested" });
    const parent = semanticBlock(entries, "parent", ["one", "two"], { childBlockIds: ["child"] });
    const current = state([child, parent]);
    const catalog = buildReferenceCatalog(entries, current);
    const result = planDecompression({ transactionId: "restore", catalogId: catalog.catalogId, blockRefs: ["b000002"] }, { entries, state: current, guard });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deactivateBlockIds).toEqual(["parent"]);
    expect(result.value.reactivateChildBlockIds).toEqual(["child"]);
    expect(result.value.preview).toEqual(expect.objectContaining({ sourceRefs: ["m000001", "m000002"], truncated: false }));

    const bad = planDecompression({ transactionId: "bad", catalogId: catalog.catalogId, blockRefs: ["b000002", "b999999"] }, { entries, state: current, guard });
    expect(bad).toEqual(expect.objectContaining({ ok: false, code: "unknown-reference" }));

    const restoredParent = { ...parent, active: false, deactivationReason: "decompress" as const };
    const activeChild = { ...child, active: true, deactivationReason: undefined };
    const restoredState = state([activeChild, restoredParent]);
    const restoredCatalog = buildReferenceCatalog(entries, restoredState);
    const recompressed = planRecompression({ transactionId: "recompress-parent", catalogId: restoredCatalog.catalogId, blockRefs: ["b000002"] }, { entries, state: restoredState });
    expect(recompressed.ok).toBe(true);
    if (recompressed.ok) {
      expect(recompressed.value).toMatchObject({ reactivateBlockIds: ["parent"], deactivateChildBlockIds: ["child"] });
      expect(recompressed.value.control).toMatchObject({ control: "recompress", reactivateBlockIds: ["parent"], deactivateBlockIds: ["child"] });
    }

    const invalidChildState = state([{ ...activeChild, queryOnly: true }, restoredParent]);
    const invalidCatalog = buildReferenceCatalog(entries, invalidChildState);
    expect(planRecompression({ transactionId: "invalid-lineage", catalogId: invalidCatalog.catalogId, blockRefs: ["b000002"] }, { entries, state: invalidChildState }))
      .toEqual(expect.objectContaining({ ok: false, code: "invalid-lineage" }));
  });

  it("clips exact replay-ordered previews to 2000 UTF-8 bytes without splitting code points", () => {
    const entries: SessionLikeEntry[] = [{ id: "unicode", type: "message", message: { role: "assistant", content: "🌹".repeat(600) } }];
    const block = semanticBlock(entries, "unicode-block", ["unicode"]);
    const current = state([block]);
    const catalog = buildReferenceCatalog(entries, current);
    const result = planDecompression({ transactionId: "unicode", catalogId: catalog.catalogId, blockRefs: ["b000001"] }, { entries, state: current });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.preview.utf8Bytes).toBe(2_000);
    expect(Buffer.byteLength(result.value.preview.excerpts[0]!.text, "utf8")).toBe(2_000);
    expect(result.value.preview.excerpts[0]!.text).toBe("🌹".repeat(500));
    expect(result.value.preview.truncated).toBe(true);
  });

  it("allows recompression only after explicit decompression and reports hard protection reasons", () => {
    const entries: SessionLikeEntry[] = [{ id: "one", type: "message", message: { role: "assistant", content: "one" } }];
    const restored = semanticBlock(entries, "restored", ["one"], { active: false, deactivationReason: "decompress" });
    const current = state([restored]);
    const catalog = buildReferenceCatalog(entries, current);
    const request = { transactionId: "recompress", catalogId: catalog.catalogId, blockRefs: ["b000001"] };
    const protectedResult = planRecompression(request, { entries, state: current, protect: () => ({ protected: true, reasons: ["legal-hold"] }) });
    expect(protectedResult).toEqual(expect.objectContaining({ ok: false, code: "protected", reasons: ["legal-hold"] }));
    const result = planRecompression(request, { entries, state: current });
    expect(result.ok && result.value.control).toEqual(expect.objectContaining({ kind: "control", control: "recompress", reactivateBlockIds: ["restored"] }));

    const gc = state([semanticBlock(entries, "gc", ["one"], { active: false, deactivationReason: "gc" })]);
    const gcCatalog = buildReferenceCatalog(entries, gc);
    expect(planRecompression({ ...request, catalogId: gcCatalog.catalogId }, { entries, state: gc })).toEqual(expect.objectContaining({ ok: false, code: "ineligible-block", reasons: ["gc"] }));
  });
});

describe("pure prune mutation planning", () => {
  function pruneHistory(): SessionLikeEntry[] {
    return [
      { id: "call-1", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "r1", name: "Read", arguments: {} }] } },
      { id: "result-1", type: "message", message: { role: "toolResult", toolCallId: "r1", toolName: "Read", content: "old" } },
      { id: "consumed-1", type: "message", message: { role: "assistant", content: "used old" } },
      { id: "call-2", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "r2", name: "READ", arguments: {} }] } },
      { id: "result-2", type: "message", message: { role: "toolResult", toolCallId: "r2", toolName: "READ", content: "new" } },
      { id: "consumed-2", type: "message", message: { role: "assistant", content: "used new" } },
      { id: "semantic", type: "message", message: { role: "user", content: "do not prune me" } },
    ];
  }

  it("selects complete consumed atoms by normalized tool and keepLatest", () => {
    const entries = pruneHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    const result = planPruneMutation({ transactionId: "prune", catalogId: catalog.catalogId, tools: ["rEaD"], keepLatest: 1 }, { entries, state: current, guard });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.selectedAtomCount).toBe(1);
    expect(result.value.transaction.blocks?.[0]?.sourceEntryIds).toEqual(["call-1", "result-1"]);
  });

  it("rejects semantic refs, unconsumed results, binary content, and hard protection atomically", () => {
    const entries = pruneHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    expect(planPruneMutation({ transactionId: "semantic", catalogId: catalog.catalogId, messageRefs: ["m000007"] }, { entries, state: current, guard })).toEqual(expect.objectContaining({ ok: false, code: "incomplete-atom" }));

    expect(planPruneMutation({ transactionId: "unconsumed", catalogId: catalog.catalogId, messageRefs: ["m000004"] }, {
      entries, state: current, guard, isConsumed: () => false,
    })).toEqual(expect.objectContaining({ ok: false, code: "not-consumed" }));

    const protectedResult = planPruneMutation({ transactionId: "protected", catalogId: catalog.catalogId, messageRefs: ["m000001"] }, {
      entries,
      state: current,
      guard,
      hardProtect: () => ({ protected: true, reasons: ["protected-file", "metadata-unknown"] }),
    });
    expect(protectedResult).toEqual(expect.objectContaining({ ok: false, code: "protected", reasons: ["protected-file", "metadata-unknown"] }));

    const binaryEntries = pruneHistory();
    (binaryEntries[1]!.message as Record<string, unknown>).content = [{ type: "text", text: "x" }, { type: "image", data: "redacted" }];
    const binaryCatalog = buildReferenceCatalog(binaryEntries, current);
    expect(planPruneMutation({ transactionId: "binary", catalogId: binaryCatalog.catalogId, messageRefs: ["m000001"] }, { entries: binaryEntries, state: current, guard })).toEqual(expect.objectContaining({ ok: false, code: "protected", reasons: ["binary"] }));
  });

  it("enforces sole-call and batch bounds", () => {
    const entries = pruneHistory();
    const current = state();
    const catalog = buildReferenceCatalog(entries, current);
    expect(planPruneMutation({ transactionId: "conflict", catalogId: catalog.catalogId, tools: ["read"] }, {
      entries, state: current, guard: { soleCall: false, siblingToolNames: ["aili_compact"] },
    })).toEqual(expect.objectContaining({ ok: false, code: "mutation-conflict" }));
    expect(planPruneMutation({ transactionId: "none", catalogId: catalog.catalogId, tools: [], messageRefs: [] }, { entries, state: current, guard })).toEqual(expect.objectContaining({ ok: false, code: "invalid-bounds" }));
  });
});
