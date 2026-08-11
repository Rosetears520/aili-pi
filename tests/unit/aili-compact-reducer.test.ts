import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { AILI_COMPACT_ENTRY, digest, isCompactTransaction, sourceDigest, type CompactBlock, type CompactTransaction, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { activeBlocks, reduceCompactState, transactionFromEntry } from "../../src/runtime/aili-compact/reducer.js";

const source: SessionLikeEntry = { id: "entry-1", type: "message", message: { role: "assistant", content: "source" } };

function tx(id: string, epochId = "root", digest = sourceDigest([source], ["entry-1"])): CompactTransaction {
  return {
    schema: "aili.compact.tx.v1",
    id,
    kind: "compact",
    epochId,
    blocks: [{ id: `block:${id}`, kind: "semantic", epochId, sourceEntryIds: ["entry-1"], sourceDigest: digest, summary: "summary", active: true }],
  };
}

function v2Block(id: string, entries: readonly SessionLikeEntry[], sourceEntryIds: string[], overrides: Partial<CompactBlock> = {}): CompactBlock {
  return {
    id,
    kind: "semantic",
    epochId: "root",
    sourceEntryIds,
    sourceDigest: sourceDigest(entries, sourceEntryIds),
    summary: "summary",
    active: true,
    mode: sourceEntryIds.length === 1 ? "message" : "range",
    topic: "Topic",
    batchTopic: "Batch",
    anchorEntryId: sourceEntryIds[0],
    runId: `run:${id}`,
    childBlockIds: [],
    generation: "young",
    survivedCount: 0,
    age: 0,
    ...overrides,
  };
}

function custom(id: string, data: unknown): SessionLikeEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data };
}

function successfulToolResult(id: string, data: CompactTransaction): SessionLikeEntry {
  const toolName = data.kind === "compact" ? "aili_compact" : data.kind === "prune" ? "aili_prune" : "aili_decompress";
  return { id, type: "message", message: { role: "toolResult", toolCallId: data.id, toolName, content: [], isError: false, details: { contextTx: data } } };
}

describe("AILI Compact reducer", () => {
  it("reads bounded v2 quality evidence without widening the closed reader", () => {
    const evidence = {
      version: 1 as const,
      extractorVersion: "aili-quality-extractor-v1" as const,
      evaluatorVersion: "aili-quality-evaluator-v1" as const,
      tier: "T1" as const,
      catalogId: "catalog-v2-quality",
      sourceKind: "messages" as const,
      orderedRefs: ["m000001"],
      sourceDigest: digest("v2-quality-source"),
      manifestDigest: digest("v2-quality-manifest"),
      facts: [],
      verdict: "pass" as const,
      codes: [],
      counts: {
        totalFacts: 0,
        hardFacts: 0,
        warningFacts: 0,
        optionalFacts: 0,
        coveredFacts: 0,
        coveredHardFacts: 0,
        coveredWarningFacts: 0,
        coveredOptionalFacts: 0,
        missingHardFacts: 0,
        missingWarningFacts: 0,
        scorePermille: 1_000,
      },
    };
    const transaction: CompactTransaction = {
      schema: "aili.compact.tx.v2",
      id: "v2-quality",
      kind: "compact",
      epochId: "root",
      blocks: [v2Block("block:v2-quality", [source], [source.id], { qualityEvidence: evidence })],
    };

    expect(isCompactTransaction(transaction)).toBe(true);
    const replayed = reduceCompactState([source, successfulToolResult("v2-quality-result", transaction)]);
    expect(replayed.blocks.get("block:v2-quality")?.qualityEvidence).toEqual(evidence);
    expect(isCompactTransaction({
      ...transaction,
      blocks: [{ ...transaction.blocks![0], qualityEvidence: { ...evidence, rawSource: "forbidden" } }],
    })).toBe(false);
    expect(isCompactTransaction({
      ...transaction,
      blocks: [{ ...transaction.blocks![0], qualityEvidence: { ...evidence, tier: "T2" } }],
    })).toBe(false);
  });

  it("replays legacy semantic summaries through exactly 18,000 UTF-16 characters", () => {
    const exact = tx("legacy-summary-cap");
    exact.blocks![0]!.summary = "s".repeat(18_000);
    expect(isCompactTransaction(exact)).toBe(true);
    expect(reduceCompactState([source, successfulToolResult("legacy-summary-cap-result", exact)]).blocks.get("block:legacy-summary-cap")?.summary)
      .toHaveLength(18_000);

    const oversized = structuredClone(exact);
    oversized.blocks![0]!.summary = "s".repeat(18_001);
    expect(isCompactTransaction(oversized)).toBe(false);
  });

  it("replays successful current-epoch tool and custom transactions deterministically", () => {
    const toolResult = successfulToolResult("result", tx("tool"));
    const entries = [source, toolResult, custom("control", { schema: "aili.compact.tx.v1", id: "off", kind: "control", epochId: "root", control: "off" })];
    const first = reduceCompactState(entries);
    const second = reduceCompactState(entries);
    expect([...activeBlocks(first).map((block) => block.id)]).toEqual(["block:tool"]);
    expect(first.enabled).toBe(false);
    expect([...first.blocks.entries()]).toEqual([...second.blocks.entries()]);
  });

  it("requires matching mutation tool identity at the successful result boundary", () => {
    const forged: SessionLikeEntry = {
      id: "forged",
      type: "message",
      message: { role: "toolResult", toolCallId: "wrong-id", toolName: "aili_prune", isError: false, details: { contextTx: tx("compact-id") } },
    };
    expect(transactionFromEntry(forged)).toBeUndefined();
  });

  it("rejects custom semantic transactions that lack a successful tool-result anchor", () => {
    const state = reduceCompactState([source, custom("unanchored", tx("unanchored"))]);
    expect(activeBlocks(state)).toEqual([]);
    expect(state.diagnostics).toContain("invalid-commit-source:unanchored");
  });

  it("rejects crash-before-result, failed, duplicate, digest-mismatched and wrong-epoch transactions without hiding source", () => {
    const unfinished: SessionLikeEntry = { id: "unfinished", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "aili_compact", arguments: {} }] } };
    expect(activeBlocks(reduceCompactState([source, unfinished]))).toEqual([]);
    const failed: SessionLikeEntry = { id: "failed", type: "message", message: { role: "toolResult", isError: true, details: { contextTx: tx("failed") } } };
    const state = reduceCompactState([
      source,
      failed,
      successfulToolResult("first", tx("duplicate")),
      successfulToolResult("second", tx("duplicate")),
      successfulToolResult("digest", tx("digest", "root", "wrong")),
      { id: "native", type: "compaction" },
      successfulToolResult("wrong", tx("wrong", "root")),
    ]);
    expect(activeBlocks(state)).toEqual([]);
    expect(state.diagnostics).toEqual(expect.arrayContaining(["duplicate:duplicate", "invalid-block:block:digest", "wrong-epoch:wrong"]));
    expect(state.epochId).toBe("native");
  });

  it("does not let an invalid transaction reserve an ID against a later valid commit", () => {
    const state = reduceCompactState([
      source,
      successfulToolResult("wrong-epoch", tx("recover", "prior")),
      successfulToolResult("valid", tx("recover")),
    ]);
    expect(activeBlocks(state).map((block) => block.id)).toEqual(["block:recover"]);
    expect(state.diagnostics).toContain("wrong-epoch:recover");
    expect(state.diagnostics).not.toContain("duplicate:recover");
  });

  it("rebuilds only the selected Pi branch after a fork", () => {
    const manager = SessionManager.inMemory("/project");
    const sourceId = manager.appendMessage({ role: "assistant", content: "branch source", timestamp: 1 } as any);
    const sourceEntry = manager.getBranch().find((entry) => entry.id === sourceId)!;
    manager.appendMessage({
      role: "toolResult",
      toolCallId: "branch-block",
      toolName: "aili_compact",
      content: [],
      isError: false,
      details: { contextTx: {
        schema: "aili.compact.tx.v1",
        id: "branch-block",
        kind: "compact",
        epochId: "root",
        blocks: [{
          id: "block:branch",
          kind: "semantic",
          epochId: "root",
          sourceEntryIds: [sourceId],
          sourceDigest: sourceDigest([sourceEntry], [sourceId]),
          summary: "original branch summary",
          active: true,
        }],
      } },
      timestamp: 2,
    } as any);
    expect(activeBlocks(reduceCompactState(manager.getBranch())).map((block) => block.id)).toEqual(["block:branch"]);

    manager.branch(sourceId);
    manager.appendMessage({ role: "user", content: "alternate branch", timestamp: 2 } as any);
    expect(activeBlocks(reduceCompactState(manager.getBranch()))).toEqual([]);
  });

  it("rejects replayed partial tool atoms while accepting the complete atom", () => {
    const call: SessionLikeEntry = {
      id: "call",
      type: "message",
      message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: {} }] },
    };
    const result: SessionLikeEntry = {
      id: "result",
      type: "message",
      message: { role: "toolResult", toolCallId: "call-1", toolName: "read", content: "output" },
    };
    const partial: CompactTransaction = {
      schema: "aili.compact.tx.v1",
      id: "partial",
      kind: "compact",
      epochId: "root",
      blocks: [{ id: "partial", kind: "semantic", epochId: "root", sourceEntryIds: ["call"], sourceDigest: sourceDigest([call, result], ["call"]), summary: "partial", active: true }],
    };
    const rejected = reduceCompactState([call, result, successfulToolResult("partial", partial)]);
    expect(activeBlocks(rejected)).toEqual([]);
    expect(rejected.diagnostics).toContain("invalid-block:partial");

    const complete: CompactTransaction = {
      ...partial,
      id: "complete",
      blocks: [{ id: "complete", kind: "semantic", epochId: "root", sourceEntryIds: ["call", "result"], sourceDigest: sourceDigest([call, result], ["call", "result"]), summary: "complete", active: true }],
    };
    expect(activeBlocks(reduceCompactState([call, result, successfulToolResult("complete", complete)])).map((block) => block.id)).toEqual(["complete"]);
  });

  it("accepts only paired text-only cooling blocks", () => {
    const call: SessionLikeEntry = {
      id: "call",
      type: "message",
      message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: {} }] },
    };
    const result: SessionLikeEntry = {
      id: "result",
      type: "message",
      message: { role: "toolResult", toolCallId: "call-1", toolName: "bash", content: "large result" },
    };
    const cooling: CompactTransaction = {
      schema: "aili.compact.tx.v1",
      id: "cool",
      kind: "cool",
      epochId: "root",
      blocks: [{ id: "cool:result", kind: "cool", epochId: "root", sourceEntryIds: ["result"], sourceDigest: sourceDigest([call, result], ["result"]), summary: "consumed result", stub: "bounded stub", active: true }],
    };
    expect(activeBlocks(reduceCompactState([call, result, custom("cool", cooling)])).map((block) => block.id)).toEqual(["cool:result"]);

    const unpaired = reduceCompactState([result, custom("bad-cool", cooling)]);
    expect(activeBlocks(unpaired)).toEqual([]);
    expect(unpaired.diagnostics).toContain("invalid-block:cool:result");
  });

  it("rejects overlapping active blocks but permits recompression after deactivation", () => {
    const overlapping = reduceCompactState([
      source,
      successfulToolResult("first", tx("one")),
      successfulToolResult("second", tx("two")),
    ]);
    expect(activeBlocks(overlapping).map((block) => block.id)).toEqual(["block:one"]);
    expect(overlapping.diagnostics).toContain("invalid-block:block:two");

    const recompressed = reduceCompactState([
      source,
      successfulToolResult("first", tx("one")),
      successfulToolResult("restore", {
        schema: "aili.compact.tx.v1",
        id: "restore-one",
        kind: "decompress",
        epochId: "root",
        deactivateBlockIds: ["block:one"],
      }),
      successfulToolResult("second", tx("two")),
    ]);
    expect(activeBlocks(recompressed).map((block) => block.id)).toEqual(["block:two"]);
    expect(recompressed.diagnostics).toEqual([]);
  });

  it("persists manual-mode controls independently from enabled controls", () => {
    const state = reduceCompactState([
      custom("off", { schema: "aili.compact.tx.v1", id: "off", kind: "control", epochId: "root", control: "off" }),
      custom("manual-on", { schema: "aili.compact.tx.v1", id: "manual-on", kind: "control", epochId: "root", control: "manual-on" }),
      custom("manual-off", { schema: "aili.compact.tx.v1", id: "manual-off", kind: "control", epochId: "root", control: "manual-off" }),
    ]);
    expect(state.enabled).toBe(false);
    expect(state.hasSessionControl).toBe(true);
    expect(state.manualMode).toBe(false);
    expect(state.hasManualControl).toBe(true);
    expect(state.autoCooling).toBe(true);
    expect(state.hasAutoCoolingControl).toBe(false);
  });

  it("replays v2 blocks atomically and keeps invalid batches entirely inactive", () => {
    const secondSource: SessionLikeEntry = { id: "entry-2", type: "message", message: { role: "assistant", content: "second" } };
    const validBlock = {
      id: "v2:one",
      kind: "semantic" as const,
      epochId: "root",
      sourceEntryIds: ["entry-1"],
      sourceDigest: sourceDigest([source, secondSource], ["entry-1"]),
      summary: "one",
      active: true,
      mode: "message" as const,
      topic: "First",
      batchTopic: "Batch",
      anchorEntryId: "entry-1",
      runId: "v2-run",
      childBlockIds: [],
      generation: "young" as const,
      survivedCount: 0,
      age: 0,
    };
    const invalidBlock = {
      ...validBlock,
      id: "v2:two",
      sourceEntryIds: ["entry-2"],
      sourceDigest: "wrong",
      anchorEntryId: "entry-2",
    };
    const transaction: CompactTransaction = {
      schema: "aili.compact.tx.v2",
      id: "v2-run",
      kind: "compact",
      epochId: "root",
      blocks: [validBlock, invalidBlock],
    };
    const state = reduceCompactState([source, secondSource, successfulToolResult("v2-result", transaction)]);
    expect(activeBlocks(state)).toEqual([]);
    expect(state.diagnostics).toContain("invalid-block:v2:two");
  });

  it("rejects custom control/cooling envelopes that smuggle semantic or prune blocks", () => {
    const semanticControl = {
      schema: "aili.compact.tx.v2",
      id: "forged-control",
      kind: "control",
      epochId: "root",
      control: "on",
      blocks: [v2Block("forged", [source], ["entry-1"])],
    };
    const pruneCool = {
      schema: "aili.compact.tx.v2",
      id: "forged-cool",
      kind: "cool",
      epochId: "root",
      blocks: [{ ...v2Block("prune", [source], ["entry-1"]), kind: "prune" }],
    };
    expect(isCompactTransaction(semanticControl)).toBe(false);
    expect(isCompactTransaction(pruneCool)).toBe(false);
    expect(activeBlocks(reduceCompactState([source, custom("forged-control", semanticControl), custom("forged-cool", pruneCool)]))).toEqual([]);
  });

  it("rejects unrelated nested children while accepting contained lineage", () => {
    const secondSource: SessionLikeEntry = { id: "entry-2", type: "message", message: { role: "assistant", content: "second" } };
    const childTx: CompactTransaction = {
      schema: "aili.compact.tx.v2",
      id: "child-run",
      kind: "compact",
      epochId: "root",
      blocks: [v2Block("child", [source, secondSource], ["entry-1"], { runId: "child-run" })],
    };
    const unrelatedParent: CompactTransaction = {
      schema: "aili.compact.tx.v2",
      id: "parent-run",
      kind: "compact",
      epochId: "root",
      blocks: [v2Block("parent", [source, secondSource], ["entry-2"], { runId: "parent-run", childBlockIds: ["child"] })],
    };
    const rejected = reduceCompactState([source, secondSource, successfulToolResult("child-result", childTx), successfulToolResult("parent-result", unrelatedParent)]);
    expect(activeBlocks(rejected).map((block) => block.id)).toEqual(["child"]);
    expect(rejected.diagnostics).toContain("invalid-block:parent");

    const containedParent: CompactTransaction = {
      ...unrelatedParent,
      id: "contained-run",
      blocks: [v2Block("contained", [source, secondSource], ["entry-1", "entry-2"], { runId: "contained-run", childBlockIds: ["child"] })],
    };
    const accepted = reduceCompactState([source, secondSource, successfulToolResult("child-result", childTx), successfulToolResult("contained-result", containedParent)]);
    expect(activeBlocks(accepted).map((block) => block.id)).toEqual(["contained"]);
    expect(accepted.blocks.get("child")).toMatchObject({ active: false, deactivationReason: "nested" });
  });

  it("decompressing a parent reactivates nested children and recompression reverses both atomically", () => {
    const secondSource: SessionLikeEntry = { id: "entry-2", type: "message", message: { role: "assistant", content: "second" } };
    const childTx: CompactTransaction = {
      schema: "aili.compact.tx.v2", id: "child-run", kind: "compact", epochId: "root",
      blocks: [v2Block("child", [source, secondSource], ["entry-1"], { runId: "child-run" })],
    };
    const parentTx: CompactTransaction = {
      schema: "aili.compact.tx.v2", id: "parent-run", kind: "compact", epochId: "root",
      blocks: [v2Block("parent", [source, secondSource], ["entry-1", "entry-2"], { runId: "parent-run", childBlockIds: ["child"] })],
    };
    const decompression: CompactTransaction = {
      schema: "aili.compact.tx.v2", id: "decompress-parent", kind: "decompress", epochId: "root",
      deactivateBlockIds: ["parent"], reactivateBlockIds: ["child"],
    };
    const decompressedEntries = [source, secondSource, successfulToolResult("child-result", childTx), successfulToolResult("parent-result", parentTx), successfulToolResult("decompress-result", decompression)];
    const decompressed = reduceCompactState(decompressedEntries);
    expect(activeBlocks(decompressed).map((block) => block.id)).toEqual(["child"]);
    expect(decompressed.blocks.get("parent")).toMatchObject({ active: false, deactivationReason: "decompress" });
    expect(decompressed.blocks.get("child")).toMatchObject({ active: true });

    const recompression = custom("recompress", {
      schema: "aili.compact.tx.v2", id: "recompress-parent", kind: "control", epochId: "root", control: "recompress",
      reactivateBlockIds: ["parent"], deactivateBlockIds: ["child"],
    });
    const recompressed = reduceCompactState([...decompressedEntries, recompression]);
    expect(activeBlocks(recompressed).map((block) => block.id)).toEqual(["parent"]);
    expect(recompressed.blocks.get("child")).toMatchObject({ active: false, deactivationReason: "nested" });
    expect(recompressed.diagnostics).toEqual([]);

    const incomplete = reduceCompactState([...decompressedEntries, custom("bad-recompress", {
      schema: "aili.compact.tx.v2", id: "bad-recompress", kind: "control", epochId: "root", control: "recompress",
      reactivateBlockIds: ["parent"],
    })]);
    expect(activeBlocks(incomplete).map((block) => block.id)).toEqual(["child"]);
    expect(incomplete.blocks.get("parent")).toMatchObject({ active: false, deactivationReason: "decompress" });
    expect(incomplete.diagnostics).toContain("invalid-block-lineage:bad-recompress");
  });

  it("replays emergency GC summary shortening and rejects summary expansion", () => {
    const blockTx: CompactTransaction = {
      schema: "aili.compact.tx.v2", id: "summary-run", kind: "compact", epochId: "root",
      blocks: [v2Block("summary-block", [source], ["entry-1"], { runId: "summary-run", summary: "x".repeat(400), generation: "old" })],
    };
    const shortened = custom("summary-gc", {
      schema: "aili.compact.tx.v2", id: "summary-gc", kind: "control", epochId: "root",
      lifecycleUpdates: [{ blockId: "summary-block", summary: "x".repeat(255) + "…" }],
    });
    const accepted = reduceCompactState([source, successfulToolResult("summary-result", blockTx), shortened]);
    expect(accepted.blocks.get("summary-block")?.summary).toHaveLength(256);
    expect(accepted.diagnostics).toEqual([]);

    const expanded = reduceCompactState([source, successfulToolResult("summary-result", blockTx), custom("bad-summary-gc", {
      schema: "aili.compact.tx.v2", id: "bad-summary-gc", kind: "control", epochId: "root",
      lifecycleUpdates: [{ blockId: "summary-block", summary: "y".repeat(401) }],
    })]);
    expect(expanded.blocks.get("summary-block")?.summary).toHaveLength(400);
    expect(expanded.diagnostics).toContain("invalid-lifecycle:bad-summary-gc");
  });

  it("rejects lifecycle reactivation and prior-epoch lifecycle updates", () => {
    const blockTx: CompactTransaction = {
      schema: "aili.compact.tx.v2",
      id: "block-run",
      kind: "compact",
      epochId: "root",
      blocks: [v2Block("block-v2", [source], ["entry-1"], { runId: "block-run" })],
    };
    const state = reduceCompactState([
      source,
      successfulToolResult("block-result", blockTx),
      { id: "epoch-2", type: "compaction" },
      custom("bad-lifecycle", {
        schema: "aili.compact.tx.v2",
        id: "bad-lifecycle",
        kind: "control",
        epochId: "epoch-2",
        lifecycleUpdates: [{ blockId: "block-v2", active: true }],
      }),
    ]);
    expect(activeBlocks(state)).toEqual([]);
    expect(state.diagnostics).toContain("invalid-lifecycle:bad-lifecycle");
  });

  it("rejects v2 persisted semantic summaries above 18,000 characters", () => {
    const oversized = {
      schema: "aili.compact.tx.v2",
      id: "oversized",
      kind: "compact",
      epochId: "root",
      blocks: [v2Block("oversized-block", [source], ["entry-1"], { summary: "x".repeat(18_001) })],
    };
    expect(isCompactTransaction(oversized)).toBe(false);
    expect(activeBlocks(reduceCompactState([source, custom("oversized", oversized)]))).toEqual([]);
  });

  it("replays manual triggers, grouped policy decisions, and human decompress/recompress controls", () => {
    const trigger = custom("trigger", {
      schema: "aili.compact.tx.v2",
      id: "trigger",
      kind: "control",
      epochId: "root",
      control: "manual-trigger",
      manualTrigger: { id: "trigger-1", turnId: "turn-1", focusHash: "hash" },
    });
    const decompressed = custom("decompress", {
      schema: "aili.compact.tx.v2",
      id: "decompress",
      kind: "control",
      epochId: "root",
      control: "decompress",
      deactivateBlockIds: ["block:one"],
      policy: { strategy: "dedupe", sourceEntryIds: ["entry-1"] },
    });
    const recompressed = custom("recompress", {
      schema: "aili.compact.tx.v2",
      id: "recompress",
      kind: "control",
      epochId: "root",
      control: "recompress",
      reactivateBlockIds: ["block:one"],
      consumeManualTriggerId: "trigger-1",
    });
    const state = reduceCompactState([source, successfulToolResult("block", tx("one")), trigger, decompressed, recompressed]);
    expect(activeBlocks(state).map((block) => block.id)).toEqual(["block:one"]);
    expect(state.pendingManualTrigger).toBeUndefined();
    expect(state.policyDecisions).toEqual([{ strategy: "dedupe", sourceEntryIds: ["entry-1"] }]);
  });

  it("clears only the matching manual trigger through an exact compensating control", () => {
    const state = reduceCompactState([
      custom("trigger", {
        schema: "aili.compact.tx.v2", id: "trigger-tx", kind: "control", epochId: "root", control: "manual-trigger",
        manualTrigger: { id: "trigger", turnId: "turn" },
      }),
      custom("clear", {
        schema: "aili.compact.tx.v2", id: "clear-tx", kind: "control", epochId: "root", control: "manual-clear",
        consumeManualTriggerId: "trigger",
      }),
    ]);
    expect(state.pendingManualTrigger).toBeUndefined();
    expect(state.diagnostics).toEqual([]);
  });

  it("archives prior blocks after every completed compaction entry", () => {
    const state = reduceCompactState([source, successfulToolResult("block", tx("one")), { id: "epoch-2", type: "compaction" }]);
    expect(activeBlocks(state)).toEqual([]);
    expect(state.blocks.get("block:one")).toMatchObject({ active: false, deactivationReason: "epoch" });
    expect(state.epochId).toBe("epoch-2");
  });

  it("restore-all deactivates current blocks and disables automatic cooling", () => {
    const state = reduceCompactState([
      source,
      successfulToolResult("block", tx("one")),
      custom("restore", { schema: "aili.compact.tx.v1", id: "restore", kind: "control", epochId: "root", control: "restore-all" }),
    ]);
    expect(activeBlocks(state)).toEqual([]);
    expect(state.autoCooling).toBe(false);
    expect(state.hasAutoCoolingControl).toBe(true);
  });
});
