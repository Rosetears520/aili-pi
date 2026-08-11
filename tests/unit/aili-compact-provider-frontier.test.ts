import { describe, expect, it } from "vitest";

import {
  coldBuildBranchIndex,
  getIndexedEntry,
  readBranchProviderFrontierSources,
  type BranchIndexKey,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import { digest } from "../../src/runtime/aili-compact/contracts.js";
import {
  indexedProviderFrontierBlocks,
  indexedProviderFrontierCacheIdentity,
  projectIndexedProviderFrontier,
} from "../../src/runtime/aili-compact/indexed-projector.js";
import {
  admitProviderFrontierSelection,
  MAX_PROVIDER_FRONTIER_SELECTIONS,
  providerFrontierDescriptorIdentity,
  type ProviderFrontierSelectionAdmission,
  type ProviderFrontierSelection,
} from "../../src/runtime/aili-compact/provider-frontier.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { resolveTokenBoundProfile } from "../../src/runtime/aili-compact/safe-planning.js";
import type { V3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import type { V3SemanticBlock } from "../../src/runtime/aili-compact/v3.js";

const profile = resolveTokenBoundProfile("frontier-provider", "frontier-model");
const configIdentity = digest({ frontier: "test" });
const contextWindow = 1_000_000;
const safetyReserve = 1_024;

describe("AILI Compact provider frontier", () => {
  it("keeps a complete 36-block ledger while projecting protected raw plus at most 32 summary-free descriptors", () => {
    const fixture = makeFixture({ blockCount: 36 });
    const result = project(fixture);
    const rendered = JSON.stringify(result.messages);

    expect(result.diagnostic).toBeUndefined();
    expect(indexedProviderFrontierBlocks(fixture.state, fixture.view)).toHaveLength(36);
    expect(result.projectedBlockIds).toHaveLength(32);
    expect(result.messages.filter((message) => message.role === "assistant")).toHaveLength(32);
    expect(rendered).toContain("AILI Compact descriptor");
    expect(rendered).toContain("current request");
    expect(rendered).not.toContain("block=b000033");
    expect(rendered).not.toContain("full-summary-01");
    expect(result.canonicalMessages).not.toContain("raw-source-01");
    expect(result.counters.providerFrontierDescriptorDerivations).toBe(32);
    expect(result.counters.providerFrontierSelectedExpansions).toBe(0);
    expect(result.counters.providerFrontierOmittedRawMessages).toBe(36);
    expect(result.counters.providerFrontierOmittedRawBytes).toBeGreaterThan(0);
    expect(result.counters.providerFrontierInvalidations).toBe(0);
    expect(result.counters.providerFrontierFallbacks).toBe(0);
    expect(result.counters.providerMessagePasses).toBe(0);
    expect(result.counters.providerMessageVisits).toBe(0);

    expect(getIndexedEntry(fixture.snapshot, "source-01")?.entryId).toBe("source-01");
    const recovered = readBranchProviderFrontierSources(fixture.snapshot, ["source-01"]);
    expect(recovered.ok).toBe(true);
    if (recovered.ok) expect(recovered.sources[0]?.message.content).toBe("raw-source-01");
  });

  it("expands exactly one or sixteen explicit current recap selections before ordinary parent consumption", () => {
    for (const count of [1, MAX_PROVIDER_FRONTIER_SELECTIONS]) {
      const fixture = makeFixture({ selectedCount: count });
      const result = project(fixture, fixture.selection);
      const rendered = JSON.stringify(result.messages);

      expect(result.diagnostic).toBeUndefined();
      expect(result.selectionExpanded).toBe(true);
      expect(result.counters.providerFrontierSelectedExpansions).toBe(count);
      expect(result.canonicalMessages).not.toContain("raw-source-01");
      for (let index = 1; index <= count; index += 1) {
        expect(rendered).toContain(`full-summary-${String(index).padStart(2, "0")}`);
      }
      expect(rendered).not.toContain(`full-summary-${String(count + 1).padStart(2, "0")}`);

      const parent = fixtureWithConsumedChildren(fixture, count);
      const afterParent = project(parent);
      const afterParentRendered = JSON.stringify(afterParent.messages);
      expect(afterParent.diagnostic).toBeUndefined();
      expect(afterParent.projectedBlockIds).toContain("parent-block");
      expect(afterParent.projectedBlockIds).not.toContain("block-01");
      expect(afterParentRendered).not.toContain("parent-summary");
      expect(readBranchProviderFrontierSources(parent.snapshot, ["source-01"]).ok).toBe(true);
    }
  });

  it("rejects invalid selection cardinality and non-current descriptors at admission", () => {
    const fixture = makeFixture({ selectedCount: 2 });
    const active = indexedProviderFrontierBlocks(fixture.state, fixture.view);
    const blocks = active.slice(0, 2);
    const input = {
      toolCallId: "selection",
      allActiveBlocks: active,
      branchKeyId: fixture.selectionSnapshot?.keyId ?? fixture.snapshot.keyId,
      epochId: fixture.selectionSnapshot?.key.epochId ?? fixture.snapshot.key.epochId,
      sourceRevision: fixture.selectionSnapshot?.sourceDigest ?? fixture.snapshot.sourceDigest,
      proofRevision: fixture.selectionSnapshot?.replayDigest ?? fixture.snapshot.replayDigest,
      configIdentity,
      profile,
      modelKnown: true,
      contextWindow,
      safetyReserve,
      baseTokensUpper: 1,
    };
    expect(admitProviderFrontierSelection({ ...input, blocks: [] })).toEqual({ ok: false, code: "invalid-selection" });
    expect(admitProviderFrontierSelection({ ...input, blocks: active.slice(0, MAX_PROVIDER_FRONTIER_SELECTIONS + 1) }))
      .toEqual({ ok: false, code: "invalid-selection" });
    expect(admitProviderFrontierSelection({ ...input, blocks: [blocks[0]!, blocks[0]!] }))
      .toEqual({ ok: false, code: "invalid-selection" });
    expect(admitProviderFrontierSelection({ ...input, blocks: [{ ...blocks[0]!, epochId: "stale" }] }))
      .toEqual({ ok: false, code: "invalid-selection" });

    const unknown = admitProviderFrontierSelection({
      blocks,
      ...input,
      contextWindow: undefined,
    });
    expect(unknown).toEqual({ ok: false, code: "unknown-context" });

    const overBudget = admitProviderFrontierSelection({
      blocks,
      ...input,
      contextWindow: 1,
      safetyReserve: 0,
    });
    expect(overBudget).toEqual({ ok: false, code: "over-budget" });
  });

  it("atomically drops stale recap pairs for branch, epoch, source/proof, descriptor, config, model, budget, and result bindings", () => {
    const fixture = makeFixture({ selectedCount: 2 });
    const selection = fixture.selection!;
    const changedSource = fixtureWithChangedSource(fixture);
    const changedSnapshotSource = fixtureWithChangedSnapshotSource(fixture);
    const changedBranch = fixtureWithUnprotectedTail(fixture);
    const nonactive = fixtureWithConsumedChildren(fixture, 2);
    const forgedResult = makeFixture({
      selectedCount: 1,
      recapResultText: (admitted) => admitted.resultText.replace("full-summary-01", "forged-summary"),
    });
    const cases = [
      project(fixture, { ...selection, binding: { ...selection.binding, identity: "stale" } }),
      project(fixture, { ...selection, binding: { ...selection.binding, branchKeyId: "other-branch" } }),
      project(fixture, { ...selection, binding: { ...selection.binding, epochId: "other-epoch" } }),
      project(fixture, { ...selection, binding: { ...selection.binding, sourceRevision: "other-source" } }),
      project(fixture, { ...selection, binding: { ...selection.binding, proofRevision: "other-proof" } }),
      project(changedSnapshotSource, selection),
      project(changedBranch, selection),
      project(nonactive, selection),
      project(changedSource, selection),
      project(fixture, selection, { configIdentity: digest({ frontier: "changed" }) }),
      project(fixture, selection, { profile: resolveTokenBoundProfile("frontier-provider", "other-model") }),
      project(fixture, selection, { contextWindow: undefined }),
      project(fixture, selection, { safetyReserve: safetyReserve + 1 }),
      project(forgedResult, forgedResult.selection),
    ];

    for (const result of cases) {
      const rendered = JSON.stringify(result.messages);
      expect(result.diagnostic).toBeUndefined();
      expect(result.selectionExpanded).toBe(false);
      expect(rendered).toContain("current request");
      expect(rendered).not.toContain("full-summary-01");
      expect(rendered).not.toContain("forged-summary");
      expect(result.canonicalMessages).not.toContain("raw-source-01");
      expect(result.counters.providerFrontierOmittedRawMessages).toBeGreaterThan(0);
      expect(result.counters.providerFrontierInvalidations).toBe(1);
      expect(result.counters.providerFrontierFallbacks).toBe(0);
    }
    expect(fixture.snapshot.stats.transactions).toBe(0);
  });

  it("replaces consumed child descriptors while exact source recovery remains available", () => {
    const fixture = makeFixture();
    const parent = fixtureWithConsumedChildren(fixture, 2);
    const result = project(parent);

    expect(result.projectedBlockIds).toContain("parent-block");
    expect(result.projectedBlockIds).not.toContain("block-01");
    expect(result.projectedBlockIds).not.toContain("block-02");
    expect(JSON.stringify(result.messages)).toContain("block=b000029");
    const recovered = readBranchProviderFrontierSources(parent.snapshot, ["source-01", "source-02"]);
    expect(recovered.ok).toBe(true);
    if (recovered.ok) expect(recovered.sources.map((source) => source.message.content)).toEqual([
      "raw-source-01",
      "raw-source-02",
    ]);
  });

  it("binds cache identity to branch revisions, descriptors, config, context/reserve, and selection state", () => {
    const fixture = makeFixture();
    const input = frontierInput(fixture);
    const identity = indexedProviderFrontierCacheIdentity(input);
    expect(identity).toBe(project(fixture).identity);
    expect(indexedProviderFrontierCacheIdentity({ ...input, configIdentity: digest({ frontier: "changed" }) })).not.toBe(identity);
    expect(indexedProviderFrontierCacheIdentity({ ...input, contextWindow: contextWindow - 1 })).not.toBe(identity);
    expect(indexedProviderFrontierCacheIdentity({ ...input, safetyReserve: safetyReserve + 1 })).not.toBe(identity);
    expect(indexedProviderFrontierCacheIdentity({ ...input, snapshot: fixtureWithChangedSnapshotSource(fixture).snapshot })).not.toBe(identity);
    expect(indexedProviderFrontierCacheIdentity({ ...input, snapshot: fixtureWithUnprotectedTail(fixture).snapshot })).not.toBe(identity);
    expect(providerFrontierDescriptorIdentity(indexedProviderFrontierBlocks(fixture.state, fixture.view))).not.toBe("unavailable");
  });
});

function project(
  fixture: Fixture,
  selection: ProviderFrontierSelection | undefined = undefined,
  overrides: Partial<ReturnType<typeof frontierInput>> = {},
) {
  return projectIndexedProviderFrontier({
    ...frontierInput(fixture),
    ...overrides,
    ...(selection ? { selection } : {}),
  });
}

function frontierInput(fixture: Fixture) {
  return {
    snapshot: fixture.snapshot,
    state: fixture.state,
    view: fixture.view,
    protectedEntryIds: fixture.protectedEntryIds,
    configIdentity,
    profile,
    contextWindow,
    safetyReserve,
  };
}

type Fixture = ReturnType<typeof makeFixture>;

function makeFixture(options: {
  selectedCount?: number;
  blockCount?: number;
  recapResultText?: (admitted: ProviderFrontierSelectionAdmission) => string;
} = {}) {
  const blocks = Array.from({ length: options.blockCount ?? 28 }, (_, index) => block(index + 1));
  const sourceEntries = blocks.map((block, index) => entry(
    `source-${String(index + 1).padStart(2, "0")}`,
    { role: "assistant", content: `raw-source-${String(index + 1).padStart(2, "0")}` },
    index === 0 ? undefined : `source-${String(index).padStart(2, "0")}`,
  ));
  const provisional = viewFor(blocks);
  const state = reduceCompactState(sourceEntries);
  const activeBlocks = indexedProviderFrontierBlocks(state, provisional);
  const selected = options.selectedCount
    ? activeBlocks.slice(0, options.selectedCount)
    : [];
  const selectionSnapshot = selected.length > 0
    ? buildSnapshot(sourceEntries, sourceEntries.at(-1)!.id)
    : undefined;
  const admitted = selected.length > 0
    ? admitProviderFrontierSelection({
      toolCallId: `recap-${selected.length}`,
      blocks: selected,
      allActiveBlocks: activeBlocks,
      branchKeyId: selectionSnapshot!.keyId,
      epochId: selectionSnapshot!.key.epochId,
      sourceRevision: selectionSnapshot!.sourceDigest,
      proofRevision: selectionSnapshot!.replayDigest,
      configIdentity,
      profile,
      modelKnown: true,
      contextWindow,
      safetyReserve,
      baseTokensUpper: 1,
    })
    : undefined;
  if (admitted && !admitted.ok) throw new Error(admitted.code);
  const recapCall = admitted && admitted.ok ? entry("recap-call", {
    role: "assistant",
    content: [{ type: "toolCall", id: admitted.selection.toolCallId, name: "aili_context_recap", arguments: { blockRefs: selected.map((block) => block.blockRef) } }],
  }, sourceEntries.at(-1)?.id) : undefined;
  const recapResultText = admitted && admitted.ok ? options.recapResultText?.(admitted) ?? admitted.resultText : undefined;
  const recapResult = admitted && admitted.ok ? entry("recap-result", {
    role: "toolResult",
    toolCallId: admitted.selection.toolCallId,
    toolName: "aili_context_recap",
    content: [{ type: "text", text: recapResultText! }],
    isError: false,
  }, recapCall?.id) : undefined;
  const current = entry("current-user", { role: "user", content: "current request" }, recapResult?.id ?? recapCall?.id ?? sourceEntries.at(-1)?.id);
  const entries = [...sourceEntries, ...(recapCall ? [recapCall] : []), ...(recapResult ? [recapResult] : []), current];
  const snapshot = buildSnapshot(entries, current.id);
  return {
    snapshot,
    entries,
    state: reduceCompactState(entries),
    view: provisional,
    protectedEntryIds: [
      ...(recapCall ? [recapCall.id] : []),
      ...(recapResult ? [recapResult.id] : []),
      current.id,
    ],
    ...(admitted && admitted.ok ? {
      selection: { ...admitted.selection, resultBodyDigest: digest(recapResultText!) },
      selectionSnapshot: selectionSnapshot!,
    } : {}),
  };
}

function buildSnapshot(entries: readonly BranchSessionEntry[], branchLeafId: string) {
  const built = coldBuildBranchIndex({ key: key(branchLeafId), entries });
  if (!built.ok) throw new Error(built.code);
  return built.snapshot;
}

function fixtureWithChangedSource(base: Fixture): Fixture {
  const changed = [...base.view.state.blocks.values()].map((block, index) => index === 0
    ? { ...block, leafDigest: digest("changed-source") }
    : block);
  return { ...base, view: viewFor(changed) };
}

function fixtureWithChangedSnapshotSource(base: Fixture): Fixture {
  const entries = base.entries.map((item) => item.id === "source-01"
    ? { ...item, message: { role: "assistant", content: "changed raw source" } }
    : item);
  return { ...base, entries, snapshot: buildSnapshot(entries, entries.at(-1)!.id) };
}

function fixtureWithUnprotectedTail(base: Fixture): Fixture {
  const tail = entry("unprotected-branch-tail", { role: "user", content: "other branch request" }, base.entries.at(-1)?.id);
  const entries = [...base.entries, tail];
  return { ...base, entries, snapshot: buildSnapshot(entries, tail.id) };
}

function fixtureWithConsumedChildren(base: Fixture, count: number): Fixture {
  const children = Array.from({ length: count }, (_, index) => `block-${String(index + 1).padStart(2, "0")}`);
  const existing = [...base.view.state.blocks.values()].map((block) => children.includes(block.blockId)
    ? { ...block, active: false }
    : block);
  const parent = block(29, {
    blockId: "parent-block",
    summary: "parent-summary",
    source: { kind: "blocks", childBlockIds: children },
  });
  return { ...base, view: viewFor([...existing, parent]) };
}

function viewFor(blocks: readonly V3SemanticBlock[]): V3RuntimeView {
  const state = {
    sessionId: "session",
    branchLeafId: "branch",
    epochId: "root",
    catalogId: "catalog",
    projectionVersion: "frontier-test",
    blocks: new Map(blocks.map((block) => [block.blockId, block])),
    transactions: new Map(),
    cooling: [],
    controls: [],
  };
  return {
    state,
    catalog: {
      catalogId: "catalog",
      epochId: "root",
      messages: [],
      blocks: blocks.map((block, index) => ({
        ref: `b${String(index + 1).padStart(6, "0")}`,
        ordinal: index + 1,
        blockId: block.blockId,
        epochId: block.epochId,
        active: block.active,
        queryOnly: block.queryOnly,
        family: "v3",
        frontierEligible: block.active && !block.queryOnly,
      })),
    },
  } as unknown as V3RuntimeView;
}

function block(index: number, override: Partial<V3SemanticBlock> = {}): V3SemanticBlock {
  const padded = String(index).padStart(2, "0");
  const blockId = override.blockId ?? `block-${padded}`;
  const summary = override.summary ?? `full-summary-${padded}`;
  return {
    blockId,
    transactionId: `tx-${padded}`,
    sessionId: "session",
    branchLeafId: "branch",
    epochId: "root",
    catalogIdAtCreate: "catalog",
    projectionVersion: "frontier-test",
    createdAt: index,
    createdTurnOrdinal: index,
    tier: "T1",
    topic: `topic-${padded}`,
    runId: `run-${padded}`,
    anchorEntryId: `source-${padded}`,
    summary,
    summaryDigest: digest(summary),
    source: override.source ?? {
      kind: "messages",
      entryIds: [`source-${padded}`],
      firstEntryId: `source-${padded}`,
      lastEntryId: `source-${padded}`,
    },
    leafDigest: digest(`source-${padded}`),
    leafCount: 1,
    firstLeafOrdinal: index,
    lastLeafOrdinal: index,
    tokens: {} as V3SemanticBlock["tokens"],
    quality: { status: "accepted" } as V3SemanticBlock["quality"],
    active: true,
    queryOnly: false,
    ...override,
  };
}

function entry(id: string, message: Record<string, unknown>, parentId?: string): BranchSessionEntry {
  return { id, type: "message", message, ...(parentId ? { parentId } : {}) };
}

function key(branchLeafId: string): BranchIndexKey {
  return {
    sessionId: "session",
    canonicalSessionPathDigest: "path",
    branchLeafId,
    epochId: "root",
    replayVersion: "frontier-test",
  };
}
