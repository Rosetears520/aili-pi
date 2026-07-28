import { describe, expect, it } from "vitest";
import { planGenerationalGc } from "../../src/runtime/aili-compact/compaction.js";
import type { CompactBlock } from "../../src/runtime/aili-compact/contracts.js";

function block(id: string, overrides: Partial<CompactBlock> = {}): CompactBlock {
  return {
    id,
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [id],
    sourceDigest: `digest:${id}`,
    summary: `summary:${id}`,
    active: true,
    generation: "young",
    survivedCount: 0,
    age: 0,
    childBlockIds: [],
    ...overrides,
  };
}

describe("AILI Compact generational GC planning", () => {
  it("increments survival and age, promotes exactly at the threshold, and retains top-level blocks across the legacy age boundary", () => {
    const plan = planGenerationalGc({
      epochId: "root",
      blocks: [
        block("survivor", { survivedCount: 3, age: 2 }),
        block("below-age", { generation: "old", survivedCount: 8, age: 13 }),
        block("equal-age", { generation: "old", survivedCount: 8, age: 14 }),
        block("above-age", { generation: "old", survivedCount: 8, age: 15 }),
      ],
      promotionSurvivals: 4,
      maxBlockAge: 15,
      maxOldSummaryChars: 300,
      transactionId: "gc-turn-1",
    });
    expect(plan?.transaction).toMatchObject({ schema: "aili.compact.tx.v2", id: "gc-turn-1", kind: "control", epochId: "root" });
    expect(plan?.transaction.lifecycleUpdates).toEqual([
      { blockId: "survivor", generation: "old", survivedCount: 4, age: 3 },
      { blockId: "below-age", generation: "old", survivedCount: 9, age: 14 },
      { blockId: "equal-age", generation: "old", survivedCount: 9, age: 15 },
      { blockId: "above-age", generation: "old", survivedCount: 9, age: 16 },
    ]);
  });

  it("bounds old summaries without changing source blocks and ignores archived/query-only state", () => {
    const summary = "z".repeat(400);
    const old = block("old", { generation: "old", summary });
    const plan = planGenerationalGc({
      epochId: "root",
      blocks: [old, block("archived", { epochId: "prior" }), block("query", { queryOnly: true })],
      promotionSurvivals: 5,
      maxBlockAge: 15,
      maxOldSummaryChars: 256,
    });
    expect(plan?.boundedSummaries.get("old")).toHaveLength(256);
    expect(plan?.boundedSummaries.get("old")).toMatch(/…$/);
    expect(old.summary).toBe(summary);
    expect(plan?.transaction.lifecycleUpdates?.map((update) => update.blockId)).toEqual(["old"]);
  });

  it("fails open on duplicate parents, cycles, missing children, and out-of-range policy", () => {
    const child = block("child");
    const first = block("first", { sourceEntryIds: ["child", "first"], childBlockIds: ["child"] });
    const second = block("second", { sourceEntryIds: ["child", "second"], childBlockIds: ["child"] });
    const input = { epochId: "root", promotionSurvivals: 5, maxBlockAge: 15, maxOldSummaryChars: 300 };
    expect(planGenerationalGc({ ...input, blocks: [child, first, second] })).toBeUndefined();
    expect(planGenerationalGc({ ...input, blocks: [block("missing-parent", { childBlockIds: ["missing"] })] })).toBeUndefined();
    expect(planGenerationalGc({ ...input, blocks: [child], maxBlockAge: 0 })).toBeUndefined();
    expect(planGenerationalGc({ ...input, blocks: [child], maxBlockAge: 1_001 })).toBeUndefined();
    expect(planGenerationalGc({ ...input, blocks: [child], maxOldSummaryChars: 255 })).toBeUndefined();

    const cycleA = block("a", { sourceEntryIds: ["a", "b"], childBlockIds: ["b"] });
    const cycleB = block("b", { sourceEntryIds: ["a", "b"], childBlockIds: ["a"] });
    expect(planGenerationalGc({ ...input, blocks: [cycleA, cycleB] })).toBeUndefined();
  });
});
