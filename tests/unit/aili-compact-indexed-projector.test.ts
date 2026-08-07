import { describe, expect, it } from "vitest";

import {
  alignBranchProviderMessages,
  coldBuildBranchIndex,
  type BranchIndexKey,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import {
  AILI_COMPACT_ENTRY,
  canonicalJson,
  digest,
  sourceDigest,
  type CompactBlock,
  type CompactTransaction,
} from "../../src/runtime/aili-compact/contracts.js";
import { projectIndexedProviderMessages } from "../../src/runtime/aili-compact/indexed-projector.js";
import { projectMessages, type ProjectionMessage } from "../../src/runtime/aili-compact/projector.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import { projectV3Messages } from "../../src/runtime/aili-compact/v3-projector.js";
import { buildV3RuntimeView, V3_PROJECTION_VERSION } from "../../src/runtime/aili-compact/v3-runtime.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  createEmptyV3State,
  v3MessageLeafDigest,
  v3SummaryDigest,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

describe("AILI Compact indexed provider projector", () => {
  it("matches the pure legacy semantic projection without revisiting captured provider objects", () => {
    const oldUser = entry("old-user", { role: "user", content: "old question" });
    const oldAssistant = entry("old-assistant", { role: "assistant", content: "old answer" }, oldUser.id);
    const block: CompactBlock = {
      id: "legacy:block",
      kind: "semantic",
      epochId: "root",
      sourceEntryIds: [oldAssistant.id],
      sourceDigest: sourceDigest([oldUser, oldAssistant], [oldAssistant.id]),
      summary: "legacy summary",
      active: true,
      anchorEntryId: oldAssistant.id,
    };
    const transaction: CompactTransaction = {
      schema: "aili.compact.tx.v1",
      id: "legacy:tx",
      kind: "compact",
      epochId: "root",
      blocks: [block],
    };
    const txEntry: BranchSessionEntry = {
      id: "legacy:entry",
      type: "custom",
      customType: AILI_COMPACT_ENTRY,
      data: transaction,
      parentId: oldAssistant.id,
    };
    const currentUser = entry("current-user", { role: "user", content: "current question" }, txEntry.id);
    const entries = [oldUser, oldAssistant, txEntry, currentUser];
    const built = coldBuildBranchIndex({ key: key(currentUser.id), entries });
    if (!built.ok) throw new Error(built.code);
    const state = reduceCompactState(entries);
    const view = buildV3RuntimeView(entries, state, { sessionId: "session" });
    const messages = [oldUser.message, oldAssistant.message, currentUser.message] as ProjectionMessage[];
    const alignment = alignBranchProviderMessages(built.snapshot, messages);
    const pure = projectMessages(messages, state, alignment.byEntryId, {
      blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
    });
    const indexed = projectIndexedProviderMessages({
      snapshot: built.snapshot,
      alignment,
      state,
      view,
      blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
    });

    expect(indexed.diagnostic).toBeUndefined();
    expect(canonicalJson(indexed.messages)).toBe(canonicalJson(pure.messages));
    expect(indexed.hash).toBe(pure.hash);
    expect(indexed.messages[0]).toBe(messages[0]);
    expect(indexed.messages.at(-1)).toBe(messages.at(-1));
  });

  it("matches pure removal of the committed legacy compact call and result", () => {
    const oldUser = entry("commit-old-user", { role: "user", content: "old question" });
    const oldAssistant = entry("commit-old-assistant", { role: "assistant", content: "old answer" }, oldUser.id);
    const block: CompactBlock = {
      id: "legacy:committed-block",
      kind: "semantic",
      epochId: "root",
      sourceEntryIds: [oldAssistant.id],
      sourceDigest: sourceDigest([oldUser, oldAssistant], [oldAssistant.id]),
      summary: "committed legacy summary",
      active: true,
      anchorEntryId: oldAssistant.id,
    };
    const transaction: CompactTransaction = {
      schema: "aili.compact.tx.v1",
      id: "legacy:committed-tx",
      kind: "compact",
      epochId: "root",
      blocks: [block],
    };
    const compactCall = entry("commit-call", {
      role: "assistant",
      content: [{
        type: "toolCall",
        id: transaction.id,
        name: "aili_compact",
        arguments: { summary: block.summary },
      }],
    }, oldAssistant.id);
    const compactResult = entry("commit-result", {
      role: "toolResult",
      toolCallId: transaction.id,
      toolName: "aili_compact",
      content: "committed",
      details: { contextTx: transaction },
    }, compactCall.id);
    const currentUser = entry("commit-current-user", { role: "user", content: "current question" }, compactResult.id);
    const entries = [oldUser, oldAssistant, compactCall, compactResult, currentUser];
    const built = coldBuildBranchIndex({ key: key(currentUser.id), entries });
    if (!built.ok) throw new Error(built.code);
    const state = reduceCompactState(entries);
    const view = buildV3RuntimeView(entries, state, { sessionId: "session" });
    const messages = [
      oldUser.message,
      oldAssistant.message,
      compactCall.message,
      compactResult.message,
      currentUser.message,
    ] as ProjectionMessage[];
    const alignment = alignBranchProviderMessages(built.snapshot, messages);
    const pure = projectMessages(messages, state, alignment.byEntryId, {
      blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
    });
    const indexed = projectIndexedProviderMessages({
      snapshot: built.snapshot,
      alignment,
      state,
      view,
      blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
    });

    expect(alignment.descriptors.at(-2)?.committedLegacyBlockIds).toEqual([block.id]);
    expect(indexed.diagnostic).toBeUndefined();
    expect(canonicalJson(indexed.messages)).toBe(canonicalJson(pure.messages));
    expect(indexed.hash).toBe(pure.hash);
    expect(JSON.stringify(indexed.messages)).not.toContain(transaction.id);
  });

  it("matches the pure maximal v3 projection from indexed lineage", () => {
    const oldAssistant = entry("v3-source", { role: "assistant", content: "old answer" });
    const initial = createEmptyV3State({
      sessionId: "session",
      branchLeafId: "branch",
      epochId: "root",
      projectionVersion: V3_PROJECTION_VERSION,
    });
    const prefix = [oldAssistant];
    const catalogId = deriveRuntimeCatalogIdForState(prefix, reduceCompactState(prefix), initial);
    const summary = "v3 summary";
    const transaction: V3Transaction = {
      header: {
        schema: AILI_COMPACT_SCHEMA_V3,
        txId: "v3:tx",
        sessionId: initial.sessionId,
        branchLeafId: initial.branchLeafId,
        epochId: initial.epochId,
        catalogId,
        createdAt: 1,
        projectionVersion: initial.projectionVersion,
      },
      tag: "semantic-create",
      payload: {
        blockId: "v3:block",
        tier: "T1",
        topic: "topic",
        runId: "run",
        anchorEntryId: oldAssistant.id,
        createdTurnOrdinal: 1,
        summary,
        summaryDigest: v3SummaryDigest(summary),
        source: {
          kind: "messages",
          entryIds: [oldAssistant.id],
          firstEntryId: oldAssistant.id,
          lastEntryId: oldAssistant.id,
        },
        leafDigest: v3MessageLeafDigest([oldAssistant.id]),
        leafCount: 1,
        tokens: {
          estimatorVersion: "estimator-v1",
          providerId: "provider",
          modelId: "model",
          sourceTokensLower: 2_000,
          sourceTokensUpper: 2_000,
          replacementTokensUpper: 1_000,
          steadySavingsTokensLower: 1_000,
          oneTimeCostTokensUpper: 500,
          breakEvenTurnsUpper: 1,
          savingsRatio: 0.5,
          summaryTokensUpper: 300,
        },
        quality: {
          status: "accepted",
          evaluatorVersion: "quality-v1",
          sourceFactDigest: digest("facts"),
          hardFactCount: 1,
          coveredHardFactCount: 1,
          warningCodes: [],
        },
      },
    };
    const txEntry: BranchSessionEntry = {
      id: "v3:entry",
      type: "custom",
      customType: AILI_COMPACT_ENTRY,
      data: transaction,
      parentId: oldAssistant.id,
    };
    const currentUser = entry("v3-current", { role: "user", content: "current" }, txEntry.id);
    const entries = [oldAssistant, txEntry, currentUser];
    const built = coldBuildBranchIndex({ key: key(currentUser.id), entries });
    if (!built.ok) throw new Error(built.code);
    const state = reduceCompactState(entries);
    const view = buildV3RuntimeView(entries, state, { sessionId: "session" });
    const messages = [oldAssistant.message, currentUser.message] as ProjectionMessage[];
    const alignment = alignBranchProviderMessages(built.snapshot, messages);
    const pure = projectV3Messages({
      replay: view.replay,
      entries,
      messages,
      alignment,
      blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
    });
    const indexed = projectIndexedProviderMessages({
      snapshot: built.snapshot,
      alignment,
      state,
      view,
      blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
    });

    expect(pure.diagnostic).toBeUndefined();
    expect(indexed.diagnostic).toBeUndefined();
    expect(canonicalJson(indexed.messages)).toBe(canonicalJson(pure.messages));
    expect(indexed.hash).toBe(pure.hash);
  });
});

function entry(
  id: string,
  message: Record<string, unknown>,
  parentId?: string,
): BranchSessionEntry & { message: Record<string, unknown> } {
  return { id, type: "message", message, ...(parentId ? { parentId } : {}) };
}

function key(branchLeafId: string): BranchIndexKey {
  return {
    sessionId: "session",
    canonicalSessionPathDigest: "path",
    branchLeafId,
    epochId: "root",
    replayVersion: "test",
  };
}
