import { describe, expect, it } from "vitest";
import {
  AILI_COMPACT_ENTRY,
  AILI_COMPACT_SCHEMA,
  sourceDigest,
  type CompactBlock,
  type SessionLikeEntry,
} from "../../src/runtime/aili-compact/contracts.js";
import {
  AILI_COMPACT_REPAIR_SCHEMA,
  canonicalBranchId,
  canonicalRepairTransactionId,
  canonicalRootEpochId,
  isRepairEntry,
  parseRepairEntry,
  planLegacyRepairs,
  replayRepairEntry,
  type LegacyRepairCandidate,
  type RepairEntry,
  type RepairPlanningInput,
} from "../../src/runtime/aili-compact/repair.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";

type Fixture = RepairPlanningInput & { mutableEntries: SessionLikeEntry[]; mutableBlocks: Map<string, CompactBlock> };

function fixture(count: number, epochId = "root-test"): Fixture {
  const entries: SessionLikeEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push({ id: `m-${index}`, type: "message", message: { role: "assistant", content: `source-${index}` } });
  }
  const blocks = new Map<string, CompactBlock>();
  const candidates: LegacyRepairCandidate[] = [];
  for (let index = 0; index < count; index += 1) {
    const sourceEntryIds = [`m-${index}`];
    const block: CompactBlock = {
      id: `block-${index}`,
      kind: "semantic",
      epochId,
      sourceEntryIds,
      sourceDigest: sourceDigest(entries, sourceEntryIds),
      summary: `summary-${index}`,
      active: false,
      mode: "message",
      topic: `topic-${index}`,
      batchTopic: `topic-${index}`,
      anchorEntryId: sourceEntryIds[0],
      runId: `run-${index}`,
      childBlockIds: [],
      generation: "old",
      survivedCount: 1,
      age: 1,
      deactivationReason: "gc",
    };
    blocks.set(block.id, block);
  }
  for (let index = 0; index < count; index += 1) {
    const block = blocks.get(`block-${index}`)!;
    const { deactivationReason: _reason, ...created } = block;
    entries.push({
      id: `block-call-${index}`,
      type: "message",
      message: { role: "assistant", content: [{ type: "toolCall", id: `create-${index}`, name: "aili_compact", arguments: {} }] },
    });
    entries.push({
      id: `block-entry-${index}`,
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: `create-${index}`,
        toolName: "aili_compact",
        details: {
          contextTx: {
            schema: AILI_COMPACT_SCHEMA,
            id: `create-${index}`,
            kind: "compact",
            epochId,
            blocks: [{ ...created, active: true }],
          },
        },
      },
    });
  }
  for (let index = 0; index < count; index += 1) {
    entries.push({
      id: `gc-${index}`,
      type: "custom",
      customType: AILI_COMPACT_ENTRY,
      data: {
        schema: AILI_COMPACT_SCHEMA,
        id: `gc-tx-${index}`,
        kind: "control",
        epochId,
        lifecycleUpdates: [{ blockId: `block-${index}`, active: false, deactivationReason: "gc" }],
      },
    });
  }
  for (let index = 0; index < count; index += 1) {
    const block = blocks.get(`block-${index}`)!;
    candidates.push({
      blockId: block.id,
      blockReplayOrdinal: count + index * 2 + 1,
      gcEntryId: `gc-${index}`,
      gcReplayOrdinal: count * 3 + index,
    });
  }
  return {
    branchSourceEntryIds: entries.map((entry) => entry.id),
    epochId,
    entries,
    blocks,
    candidates,
    mutableEntries: entries,
    mutableBlocks: blocks,
  };
}

function cloneEntry(entry: RepairEntry): RepairEntry {
  return structuredClone(entry);
}

describe("standalone AILI Compact repair schema and identities", () => {
  it("strictly rejects unknown, missing, malformed, and noncanonical fields", () => {
    const fx = fixture(1);
    const entry = planLegacyRepairs(fx).batches[0]!;
    expect(entry.type).toBe(AILI_COMPACT_REPAIR_SCHEMA);
    expect(isRepairEntry(entry)).toBe(true);
    expect(parseRepairEntry(entry)).toEqual(entry);
    expect(canonicalBranchId(fx.branchSourceEntryIds)).toBe(entry.branchId);
    expect(canonicalRootEpochId("session", ["root-a"])).toBe(canonicalRootEpochId("session", ["root-a"]));
    expect(canonicalRootEpochId("session", ["root-a"])).not.toBe(canonicalRootEpochId("session", ["root-b"]));

    expect(isRepairEntry({ ...entry, unknown: true })).toBe(false);
    const missing = cloneEntry(entry) as Partial<RepairEntry>;
    delete missing.epochId;
    expect(isRepairEntry(missing)).toBe(false);
    expect(isRepairEntry({ ...entry, evidence: [] })).toBe(false);
    expect(isRepairEntry({ ...entry, evidence: Array.from({ length: 17 }, () => entry.evidence[0]) })).toBe(false);
    expect(isRepairEntry({ ...entry, evidence: [{ ...entry.evidence[0], unknown: true }] })).toBe(false);
    expect(isRepairEntry({ ...entry, evidence: [{ ...entry.evidence[0], gcReplayOrdinal: -1 }] })).toBe(false);
    expect(isRepairEntry({ ...entry, evidence: [{ ...entry.evidence[0], sourceEntryIds: [] }] })).toBe(false);
  });

  it("sorts discovery order canonically and splits seventeen items as 16 plus 1", () => {
    const fx = fixture(17);
    const reversed = { ...fx, candidates: [...fx.candidates].reverse() };
    const forwardPlan = planLegacyRepairs(fx);
    const reversePlan = planLegacyRepairs(reversed);
    expect(forwardPlan.batches.map((batch) => batch.evidence.length)).toEqual([16, 1]);
    expect(reversePlan.batches).toEqual(forwardPlan.batches);
    expect(forwardPlan.batches.flatMap((batch) => batch.evidence.map((item) => item.blockId)))
      .toEqual(Array.from({ length: 17 }, (_, index) => `block-${index}`));

    const outOfOrder = cloneEntry(forwardPlan.batches[0]!);
    outOfOrder.evidence.reverse();
    outOfOrder.id = canonicalRepairTransactionId(outOfOrder.branchId, outOfOrder.epochId, outOfOrder.evidence.map((item) => item.evidenceId));
    expect(isRepairEntry(outOfOrder)).toBe(true);
    expect(replayRepairEntry({ ...fx, entry: outOfOrder })).toEqual(expect.objectContaining({ ok: false, code: "stale-batch" }));
  });
});

describe("repair eligibility partition", () => {
  it("assigns exact eligible, parent, digest, explicit, old-epoch, ambiguous, and other dispositions", () => {
    const fx = fixture(7);
    fx.mutableBlocks.set("block-1", { ...fx.mutableBlocks.get("block-1")!, deactivationReason: "nested" });
    fx.mutableBlocks.set("parent", {
      ...fx.mutableBlocks.get("block-1")!,
      id: "parent",
      active: true,
      deactivationReason: undefined,
      childBlockIds: ["block-1"],
    });
    fx.mutableBlocks.set("block-2", { ...fx.mutableBlocks.get("block-2")!, sourceDigest: "0".repeat(64) });
    fx.mutableBlocks.set("block-3", { ...fx.mutableBlocks.get("block-3")!, deactivationReason: "decompress" });
    fx.mutableBlocks.set("block-4", { ...fx.mutableBlocks.get("block-4")!, epochId: "prior-epoch", queryOnly: true });
    fx.mutableBlocks.set("block-5", { ...fx.mutableBlocks.get("block-5")!, childBlockIds: ["block-5"] });
    fx.mutableBlocks.set("block-6", { ...fx.mutableBlocks.get("block-6")!, kind: "prune", deactivationReason: undefined });

    const plan = planLegacyRepairs(fx);
    const byId = new Map(plan.candidates.map((item) => [item.candidate.blockId, item.disposition]));
    expect(byId).toEqual(new Map([
      ["block-0", "eligible"],
      ["block-1", "blockedByParent"],
      ["block-2", "digestMismatch"],
      ["block-3", "explicitUserState"],
      ["block-4", "oldEpoch"],
      ["block-5", "ambiguousLineage"],
      ["block-6", "otherIneligible"],
    ]));
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]!.evidence.map((item) => item.blockId)).toEqual(["block-0"]);
  });
});

describe("atomic repair replay", () => {
  it("commits once, replays identical content idempotently, and rejects ID/content mismatch", () => {
    const fx = fixture(2, "root");
    const entry = planLegacyRepairs(fx).batches[0]!;
    const first = replayRepairEntry({ ...fx, entry });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.idempotent).toBe(false);
    expect([...first.blocks.values()].every((block) => block.active)).toBe(true);

    const duplicate = replayRepairEntry({ ...fx, blocks: first.blocks, committed: first.committed, entry: cloneEntry(entry) });
    expect(duplicate).toEqual(expect.objectContaining({ ok: true, idempotent: true }));

    const mismatch = cloneEntry(entry);
    mismatch.evidence[0]!.gcEntryId = "different";
    const rejected = replayRepairEntry({ ...fx, blocks: first.blocks, committed: first.committed, entry: mismatch });
    expect(rejected).toEqual(expect.objectContaining({ ok: false, code: "id-content-mismatch" }));
    expect(rejected.blocks).toBe(first.blocks);
  });

  it("rejects a whole batch when one member is stale and leaves every block inactive", () => {
    const fx = fixture(3);
    const entry = planLegacyRepairs(fx).batches[0]!;
    const changedEntries = fx.mutableEntries.map((item) => item.id === "m-1"
      ? { ...item, message: { role: "assistant", content: "changed" } }
      : item);
    const result = replayRepairEntry({ ...fx, entries: changedEntries, entry });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "stale-batch" }));
    expect(result.blocks).toBe(fx.blocks);
    expect([...result.blocks.values()].filter((block) => block.id.startsWith("block-")).every((block) => !block.active)).toBe(true);
  });

  it("rejects a freshly overlapping concurrent state atomically", () => {
    const fx = fixture(1);
    const entry = planLegacyRepairs(fx).batches[0]!;
    const blocks = new Map(fx.blocks);
    blocks.set("concurrent", {
      ...fx.mutableBlocks.get("block-0")!,
      id: "concurrent",
      active: true,
      deactivationReason: undefined,
      runId: "concurrent",
    });
    const result = replayRepairEntry({ ...fx, blocks, entry });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "stale-batch" }));
    expect(result.blocks).toBe(blocks);
    expect(result.blocks.get("block-0")?.active).toBe(false);
  });

  it("replays standalone repair envelopes through the production reducer", () => {
    const fx = fixture(2, "root");
    const before = reduceCompactState(fx.entries);
    expect(before.diagnostics).toEqual([]);
    expect(before.blocks.size).toBe(2);
    expect([...before.blocks.values()].every((block) => !block.active && block.deactivationReason === "gc")).toBe(true);
    const plan = planLegacyRepairs({ ...fx, blocks: before.blocks });
    const journal = [...fx.entries, ...plan.batches.map((data, index) => ({
      id: `repair-entry-${index}`,
      type: "custom",
      customType: AILI_COMPACT_ENTRY,
      data,
    }))];
    const after = reduceCompactState(journal);
    expect([...after.blocks.values()].every((block) => block.active && block.deactivationReason === undefined)).toBe(true);
    expect(after.repairTransactionCount).toBe(1);
    expect(after.diagnostics.filter((item) => item.startsWith("repair-"))).toEqual([]);
  });
});
