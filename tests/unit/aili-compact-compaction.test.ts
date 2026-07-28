import { describe, expect, it } from "vitest";
import {
  decideNativeCompaction,
  planEmergencyGc,
  planGenerationalGc,
  planMajorGc,
  reconstructCompletedCompactionEpoch,
} from "../../src/runtime/aili-compact/compaction.js";
import { sourceDigest, type CompactBlock, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";

describe("AILI Compact native compaction decision", () => {
  it("returns a validated deterministic envelope or exact native fallthrough, never cancellation", () => {
    const compaction = { summary: "safe", firstKeptEntryId: "kept", tokensBefore: 10_000 };
    for (const reason of ["manual", "threshold", "overflow"] as const) {
      expect(decideNativeCompaction({ reason })).toBeUndefined();
      expect(decideNativeCompaction({ reason, enabled: false, compaction })).toBeUndefined();
      expect(decideNativeCompaction({ reason, policy: "native-only", compaction })).toBeUndefined();
      expect(decideNativeCompaction({ reason, policy: "deterministic-first", compaction })).toEqual({ compaction });
      expect(decideNativeCompaction({ reason, compaction: { ...compaction, summary: "" } })).toBeUndefined();
    }
  });

  it("plans provider-free emergency summary truncation only at the configured boundary", () => {
    const blocks: CompactBlock[] = [
      { id: "old", kind: "semantic", epochId: "root", sourceEntryIds: ["a"], sourceDigest: "d", summary: "x".repeat(400), active: true, generation: "old" },
      { id: "young", kind: "semantic", epochId: "root", sourceEntryIds: ["b"], sourceDigest: "d", summary: "y".repeat(400), active: true, generation: "young" },
    ];
    expect(planEmergencyGc({ epochId: "root", blocks, contextTokens: 9_999, contextWindow: 10_000, thresholdPercent: 100, maxOldSummaryChars: 256 })).toBeUndefined();
    expect(planEmergencyGc({ epochId: "root", blocks, contextTokens: 10_000, contextWindow: 10_000, thresholdPercent: 100, maxOldSummaryChars: 256, transactionId: "gc:emergency:leaf" })).toEqual(expect.objectContaining({
      id: "gc:emergency:leaf", kind: "control", epochId: "root",
      lifecycleUpdates: [{ blockId: "old", summary: expect.stringMatching(/…$/) }],
    }));
  });

  it("creates provider-free major GC only for ordered old semantic coverage", () => {
    const entries: SessionLikeEntry[] = [
      { id: "old-user", type: "message", message: { role: "user", content: "raw old question" } },
      { id: "old-assistant", type: "message", message: { role: "assistant", content: "raw old answer" } },
      { id: "kept", type: "message", message: { role: "user", content: "current question" } },
    ];
    const block: CompactBlock = {
      id: "semantic:old", kind: "semantic", epochId: "root", sourceEntryIds: ["old-user", "old-assistant"],
      sourceDigest: sourceDigest(entries, ["old-user", "old-assistant"]), summary: "The old work reached its conclusion.", active: true, generation: "old",
    };
    const plan = planMajorGc({ entries, firstKeptEntryId: "kept", tokensBefore: 32_000, previousSummary: "Earlier context.", activeBlocks: [block], epochId: "root" });
    expect(plan).toEqual(expect.objectContaining({
      firstKeptEntryId: "kept", tokensBefore: 32_000,
      details: { ailiCompact: { kind: "major-gc", blockIds: ["semantic:old"] } },
    }));
    expect(plan?.summary).toContain("The old work reached its conclusion.");
    expect(plan?.summary).not.toContain("raw old answer");
  });

  it("rejects protocol splits, young, duplicate and oversized major-GC coverage", () => {
    const entries: SessionLikeEntry[] = [
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "tc", name: "read" }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "tc", content: "output" } },
      { id: "kept", type: "message", message: { role: "user", content: "current" } },
    ];
    const block = (id: string, sourceEntryIds: string[], overrides: Partial<CompactBlock> = {}): CompactBlock => ({
      id, kind: "semantic", epochId: "root", sourceEntryIds,
      sourceDigest: sourceDigest(entries, sourceEntryIds), summary: "bounded", active: true, generation: "old", ...overrides,
    });
    const base = { entries, firstKeptEntryId: "kept", tokensBefore: 10_000 };
    expect(planMajorGc({ ...base, activeBlocks: [block("split-call", ["call"]), block("split-result", ["result"])] })).toBeUndefined();
    expect(planMajorGc({ ...base, activeBlocks: [block("young", ["call", "result"], { generation: "young" })] })).toBeUndefined();
    expect(planMajorGc({ ...base, activeBlocks: [block("oversized", ["call", "result"], { summary: "x".repeat(3_001) })] })).toBeUndefined();
    expect(planMajorGc({ ...base, activeBlocks: [block("whole", ["call", "result"]), block("duplicate", ["call"])] })).toBeUndefined();
    expect(planMajorGc({ ...base, activeBlocks: [block("whole", ["call", "result"])], previousSummary: "x".repeat(12_001) })).toBeUndefined();
    expect(planMajorGc({ ...base, activeBlocks: [block("digest", ["call", "result"], { sourceDigest: "0".repeat(64) })] })).toBeUndefined();
    expect(planMajorGc({ ...base, activeBlocks: [block("reversed", ["result", "call"])] })).toBeUndefined();
  });

  it("fails closed when discarded messages lack semantic coverage", () => {
    const entries: SessionLikeEntry[] = [
      { id: "old-user", type: "message", message: { role: "user", content: "old" } },
      { id: "kept", type: "message", message: { role: "user", content: "current" } },
    ];
    expect(planMajorGc({ entries, firstKeptEntryId: "kept", tokensBefore: 32_000, activeBlocks: [{
      id: "prune:old", kind: "prune", epochId: "root", sourceEntryIds: ["old-user"],
      sourceDigest: sourceDigest(entries, ["old-user"]), summary: "not semantic", active: true,
    }] })).toBeUndefined();
  });

  it("plans deterministic promotion, bounded summaries, nesting and age-only survival", () => {
    const blocks: CompactBlock[] = [
      { id: "parent", kind: "semantic", epochId: "root", sourceEntryIds: ["a", "b"], sourceDigest: "d", summary: "x".repeat(300), active: true, generation: "young", survivedCount: 1, age: 1, childBlockIds: ["child"] },
      { id: "child", kind: "semantic", epochId: "root", sourceEntryIds: ["a"], sourceDigest: "d", summary: "child", active: true, generation: "young", survivedCount: 0, age: 0, childBlockIds: [] },
      { id: "stale", kind: "semantic", epochId: "root", sourceEntryIds: ["c"], sourceDigest: "d", summary: "stale", active: true, generation: "old", survivedCount: 4, age: 2, childBlockIds: [] },
    ];
    const input = { epochId: "root", blocks, promotionSurvivals: 2, maxBlockAge: 3, maxOldSummaryChars: 256 };
    const plan = planGenerationalGc(input);
    expect(plan?.transaction.lifecycleUpdates).toEqual([
      { blockId: "parent", age: 2, survivedCount: 2, generation: "old" },
      { blockId: "child", age: 1, survivedCount: 1, generation: "young", active: false, deactivationReason: "nested" },
      { blockId: "stale", age: 3, survivedCount: 5, generation: "old" },
    ]);
    expect(plan?.boundedSummaries.get("parent")).toHaveLength(256);
    expect(plan?.boundedSummaries.get("parent")).toMatch(/…$/);
    expect(planGenerationalGc({ ...input, maxBlockAge: 99 })?.transaction).toEqual(plan?.transaction);
  });

  it("rejects invalid nested lineage", () => {
    const child: CompactBlock = { id: "child", kind: "semantic", epochId: "root", sourceEntryIds: ["a"], sourceDigest: "d", summary: "s", active: true };
    const parent: CompactBlock = { ...child, id: "parent", sourceEntryIds: ["b"], childBlockIds: ["child"] };
    expect(planGenerationalGc({ epochId: "root", blocks: [child, parent], promotionSurvivals: 2, maxBlockAge: 3, maxOldSummaryChars: 256 })).toBeUndefined();
  });

  it("reconstructs epochs only from completed persisted compaction plus kept tail", () => {
    const compaction: SessionLikeEntry = { id: "epoch-2", type: "compaction", data: { summary: "persisted" } };
    const tail: SessionLikeEntry = { id: "tail", type: "message", message: { role: "user", content: "kept" } };
    expect(reconstructCompletedCompactionEpoch({ cancelled: false, compactionEntry: compaction, keptTailEntries: [tail] })).toEqual({
      epochId: "epoch-2", entries: [compaction, tail], sourceEntryIds: ["epoch-2", "tail"],
    });
    expect(reconstructCompletedCompactionEpoch({ cancelled: true, compactionEntry: compaction, keptTailEntries: [tail] })).toBeUndefined();
    expect(reconstructCompletedCompactionEpoch({ cancelled: false })).toBeUndefined();
  });
});
