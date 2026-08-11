import { describe, expect, it } from "vitest";

import {
  coldBuildBranchIndex,
  type BranchIndexKey,
  type BranchMessageReference,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import { digest, type CompactBlock, type CompactState } from "../../src/runtime/aili-compact/contracts.js";
import {
  indexedProviderFrontierBlocks,
  projectIndexedProviderFrontier,
} from "../../src/runtime/aili-compact/indexed-projector.js";
import type { V3LifecycleReplay } from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import { resolveTokenBoundProfile } from "../../src/runtime/aili-compact/safe-planning.js";
import { buildIndexedV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import type { V3LifecycleState, V3SemanticBlock } from "../../src/runtime/aili-compact/v3.js";

const profile = resolveTokenBoundProfile("frontier-order-provider", "frontier-order-model");

describe("AILI Compact dual-schema frontier catalog ordering", () => {
  it("assigns public refs in mixed semantic-leaf order before the 32-descriptor cap", () => {
    const entries = messageEntries(34);
    const legacy = legacyBlock("legacy:older", "source-01");
    const v3Blocks = Array.from({ length: 33 }, (_, index) => v3Block(index + 2));
    const { legacyState, view } = viewFor(entries, [legacy], v3Blocks);

    expect(view.catalog.blocks.map(({ blockId, ref }) => ({ blockId, ref })).slice(0, 3)).toEqual([
      { blockId: legacy.id, ref: "b000001" },
      { blockId: "v3:02", ref: "b000002" },
      { blockId: "v3:03", ref: "b000003" },
    ]);
    expect(view.legacyRefByCombinedRef.get("b000001")).toBe("b000001");
    expect(deriveRuntimeCatalogIdForState(entries, legacyState, view.state)).toBe(view.catalog.catalogId);
    expect(view.mutationCatalog.blockRefs.slice(0, 3)).toMatchObject([
      { ref: "b000001", blockId: legacy.id, effectiveSourceOrdinal: 1, legacy: true },
      { ref: "b000002", blockId: "v3:02", effectiveSourceOrdinal: 2 },
      { ref: "b000003", blockId: "v3:03", effectiveSourceOrdinal: 3 },
    ]);

    const active = indexedProviderFrontierBlocks(legacyState, view);
    const result = project(entries, legacyState, view);
    expect(active.map((block) => block.blockId).slice(0, 3)).toEqual([legacy.id, "v3:02", "v3:03"]);
    expect(result.diagnostic).toBeUndefined();
    expect(result.projectedBlockIds).toHaveLength(32);
    expect(result.projectedBlockIds).toContain(legacy.id);
    expect(result.projectedBlockIds).not.toContain("v3:33");
    expect(result.projectedBlockIds).not.toContain("v3:34");
  });

  it("retains an unverifiable legacy entry in the ledger while excluding it from the default frontier", () => {
    const entries = messageEntries(1);
    const legacy = legacyBlock("legacy:unverifiable", "missing-source");
    const { legacyState, view } = viewFor(entries, [legacy], []);

    expect(view.legacyCatalog.blocks).toMatchObject([{ blockId: legacy.id, active: true }]);
    expect(view.catalog.blocks).toMatchObject([{
      blockId: legacy.id,
      ref: "b000001",
      active: true,
      frontierEligible: false,
    }]);
    expect(view.legacyRefByCombinedRef.get("b000001")).toBe("b000001");
    expect(view.blockByRef.get("b000001")).toMatchObject({
      blockId: legacy.id,
      active: true,
      frontierEligible: false,
    });
    expect(view.mutationCatalog.blockRefs).toMatchObject([{
      ref: "b000001",
      blockId: legacy.id,
      effectiveSourceOrdinal: 1,
      legacy: true,
    }]);
    expect(indexedProviderFrontierBlocks(legacyState, view)).toEqual([]);
    expect(project(entries, legacyState, view).projectedBlockIds).toEqual([]);
  });

  it("keeps v3-only source ordering and active public refs intact", () => {
    const entries = messageEntries(2);
    const { legacyState, view } = viewFor(entries, [], [v3Block(1), v3Block(2)]);

    expect(view.catalog.blocks.map(({ blockId, ref, active, frontierEligible }) => ({ blockId, ref, active, frontierEligible }))).toEqual([
      { blockId: "v3:01", ref: "b000001", active: true, frontierEligible: true },
      { blockId: "v3:02", ref: "b000002", active: true, frontierEligible: true },
    ]);
    expect(indexedProviderFrontierBlocks(legacyState, view).map((block) => block.blockId)).toEqual(["v3:01", "v3:02"]);
  });
});

function project(entries: readonly BranchSessionEntry[], state: CompactState, view: ReturnType<typeof buildIndexedV3RuntimeView>) {
  const built = coldBuildBranchIndex({ key: branchKey(entries.at(-1)!.id), entries });
  if (!built.ok) throw new Error(built.code);
  return projectIndexedProviderFrontier({
    snapshot: built.snapshot,
    state,
    view,
    protectedEntryIds: [entries.at(-1)!.id],
    configIdentity: digest({ frontier: "order" }),
    profile,
    contextWindow: 1_000_000,
    safetyReserve: 0,
  });
}

function viewFor(
  entries: readonly BranchSessionEntry[],
  legacyBlocks: readonly CompactBlock[],
  v3Blocks: readonly V3SemanticBlock[],
) {
  const legacyState = compactState(legacyBlocks);
  const state = v3State(v3Blocks);
  const replay: V3LifecycleReplay = {
    state,
    maximalActiveBlocks: v3Blocks,
    archivedQueryOnlyBlocks: [],
    acceptedTransactionCount: 0,
    diagnostics: [],
  };
  return {
    legacyState,
    view: buildIndexedV3RuntimeView(messageReferences(entries), legacyState, replay, state),
  };
}

function compactState(blocks: readonly CompactBlock[]): CompactState {
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
  };
}

function v3State(blocks: readonly V3SemanticBlock[]): V3LifecycleState {
  return {
    sessionId: "session",
    branchLeafId: "branch",
    epochId: "root",
    catalogId: "catalog",
    projectionVersion: "frontier-order-test",
    blocks: new Map(blocks.map((block) => [block.blockId, block])),
    transactions: new Map(),
    cooling: [],
    controls: [],
  };
}

function legacyBlock(id: string, sourceEntryId: string): CompactBlock {
  return {
    id,
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [sourceEntryId],
    sourceDigest: digest(sourceEntryId),
    summary: `summary:${id}`,
    active: true,
    anchorEntryId: sourceEntryId,
  };
}

function v3Block(ordinal: number): V3SemanticBlock {
  const padded = String(ordinal).padStart(2, "0");
  const entryId = `source-${padded}`;
  const blockId = `v3:${padded}`;
  const summary = `summary:${blockId}`;
  return {
    blockId,
    transactionId: `tx:${padded}`,
    sessionId: "session",
    branchLeafId: "branch",
    epochId: "root",
    catalogIdAtCreate: "catalog",
    projectionVersion: "frontier-order-test",
    createdAt: ordinal,
    createdTurnOrdinal: ordinal,
    topic: `topic:${padded}`,
    runId: `run:${padded}`,
    anchorEntryId: entryId,
    summary,
    summaryDigest: digest(summary),
    source: { kind: "messages", entryIds: [entryId], firstEntryId: entryId, lastEntryId: entryId },
    leafDigest: digest(entryId),
    leafCount: 1,
    firstLeafOrdinal: ordinal,
    lastLeafOrdinal: ordinal,
    tokens: {} as V3SemanticBlock["tokens"],
    quality: { status: "accepted" } as V3SemanticBlock["quality"],
    active: true,
    queryOnly: false,
  };
}

function messageEntries(count: number): BranchSessionEntry[] {
  const sources = Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1;
    const id = `source-${String(ordinal).padStart(2, "0")}`;
    return {
      id,
      type: "message",
      message: { role: "assistant", content: `raw:${id}` },
      ...(index === 0 ? {} : { parentId: `source-${String(index).padStart(2, "0")}` }),
    };
  });
  return [...sources, {
    id: "current-user",
    type: "message",
    message: { role: "user", content: "current request" },
    parentId: sources.at(-1)!.id,
  }];
}

function messageReferences(entries: readonly BranchSessionEntry[]): BranchMessageReference[] {
  return entries.map((entry, index) => ({
    ref: `m${String(index + 1).padStart(6, "0")}`,
    entryId: entry.id,
    epochId: "root",
    ordinal: index + 1,
    providerOrdinal: index + 1,
    role: "assistant",
    atomId: `a${String(index + 1).padStart(6, "0")}`,
    atomEntryIds: [entry.id],
  }));
}

function branchKey(branchLeafId: string): BranchIndexKey {
  return {
    sessionId: "session",
    canonicalSessionPathDigest: "path",
    branchLeafId,
    epochId: "root",
    replayVersion: "frontier-order-test",
  };
}
