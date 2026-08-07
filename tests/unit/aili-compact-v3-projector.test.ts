import { describe, expect, it } from "vitest";

import { alignProviderMessages } from "../../src/runtime/aili-compact/alignment.js";
import { decideNativeCompaction } from "../../src/runtime/aili-compact/compaction.js";
import { AILI_COMPACT_ENTRY, digest, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { TOOL_COOLING_PROFILE_VERSION } from "../../src/runtime/aili-compact/cooling-profiles.js";
import {
  planV3CheckpointCoverage,
  projectV3Messages,
  v3BlockReferenceFor,
  v3RecapProjection,
  type V3CheckpointCurrentIdentity,
  type V3ProjectionMessage,
} from "../../src/runtime/aili-compact/v3-projector.js";
import { reduceCompactState, reduceV3LifecycleState, type V3LifecycleReplay } from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  applyV3Transaction,
  createEmptyV3State,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3QualityMetadata,
  type V3SemanticCreatePayload,
  type V3Tier,
  type V3TokenMetadata,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

const FACT_DIGEST = "f".repeat(64);
const CURRENT_CHECKPOINT_IDENTITY: V3CheckpointCurrentIdentity = {
  providerId: "provider",
  modelId: "model",
  estimatorVersion: "estimator-v1",
  projectionVersion: "projection-v3",
  qualityEvaluatorVersion: "quality-v1",
};

function message(id: string, role: "user" | "assistant", content = `source:${id}`): SessionLikeEntry {
  return { id, type: "message", message: { role, content } };
}

function custom(id: string, data: unknown): SessionLikeEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data };
}

function publicTransaction(
  prefix: readonly SessionLikeEntry[],
  state: V3LifecycleState,
  transaction: V3Transaction,
): V3Transaction {
  return {
    ...transaction,
    header: {
      ...transaction.header,
      catalogId: deriveRuntimeCatalogIdForState(prefix, reduceCompactState(prefix), state),
    },
  };
}

function empty(epochId = "root"): V3LifecycleState {
  return createEmptyV3State({
    sessionId: "session",
    branchLeafId: "leaf",
    epochId,
    projectionVersion: "projection-v3",
  });
}

function header(current: V3LifecycleState, txId: string, createdAt: number) {
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

function tokens(tier: V3Tier): V3TokenMetadata {
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
    savingsRatio: steadySavingsTokensLower / sourceTokensLower,
    summaryTokensUpper: 300,
  };
}

function acceptedQuality(): V3QualityMetadata {
  return {
    status: "accepted",
    evaluatorVersion: "quality-v1",
    sourceFactDigest: FACT_DIGEST,
    hardFactCount: 1,
    coveredHardFactCount: 1,
    warningCodes: [],
  };
}

function semanticTransaction(
  current: V3LifecycleState,
  txId: string,
  createdAt: number,
  payload: V3SemanticCreatePayload,
): V3Transaction {
  return { header: header(current, txId, createdAt), tag: "semantic-create", payload };
}

function t1Transaction(
  current: V3LifecycleState,
  blockId: string,
  entryIds: string[],
  createdAt: number,
  quality: V3QualityMetadata = acceptedQuality(),
): V3Transaction {
  const summary = `summary:${blockId}`;
  return semanticTransaction(current, `tx:${blockId}`, createdAt, {
    blockId,
    tier: "T1",
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: entryIds[0]!,
    createdTurnOrdinal: createdAt,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "messages", entryIds, firstEntryId: entryIds[0]!, lastEntryId: entryIds.at(-1)! },
    leafDigest: v3MessageLeafDigest(entryIds),
    leafCount: entryIds.length,
    tokens: tokens("T1"),
    quality,
  });
}

function parentTransaction(
  current: V3LifecycleState,
  blockId: string,
  tier: "T2" | "T3",
  childBlockIds: string[],
  createdAt: number,
): V3Transaction {
  const children = childBlockIds.map((id) => current.blocks.get(id)!);
  const leafCount = children.reduce((total, child) => total + child.leafCount, 0);
  const summary = `summary:${blockId}`;
  return semanticTransaction(current, `tx:${blockId}`, createdAt, {
    blockId,
    tier,
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: children[0]!.anchorEntryId,
    createdTurnOrdinal: createdAt,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "blocks", childBlockIds },
    leafDigest: v3ParentLeafDigest(tier, leafCount, children.map((child) => child.leafDigest)),
    leafCount,
    tokens: tokens(tier),
    quality: acceptedQuality(),
  });
}

function applied(
  current: V3LifecycleState,
  transaction: V3Transaction,
  messageOrdinals?: ReadonlyMap<string, number>,
): V3LifecycleState {
  const result = applyV3Transaction(current, transaction, { messageOrdinals });
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function providerMessages(entries: readonly SessionLikeEntry[]): V3ProjectionMessage[] {
  return entries.flatMap((entry) => entry.type === "message" && entry.message && typeof entry.message === "object"
    ? [entry.message as V3ProjectionMessage] : []);
}

function simpleFixture(quality: V3QualityMetadata = acceptedQuality()): {
  entries: SessionLikeEntry[];
  replay: V3LifecycleReplay;
  messages: V3ProjectionMessage[];
} {
  const oldUser = message("old-user", "user", "old question");
  const oldAssistant = message("old-assistant", "assistant", "old answer");
  const currentUser = message("current-user", "user", "current question");
  const initial = empty();
  const transaction = t1Transaction(initial, "t1:old", [oldUser.id, oldAssistant.id], 1, quality);
  const entries: SessionLikeEntry[] = [oldUser, oldAssistant];
  entries.push(custom("t1-entry", publicTransaction(entries, initial, transaction)), currentUser);
  return { entries, replay: reduceV3LifecycleState(entries), messages: providerMessages(entries) };
}

function twoChildFixture(): {
  entries: SessionLikeEntry[];
  replay: V3LifecycleReplay;
  currentUser: V3ProjectionMessage;
} {
  const firstMessage = message("child-message-1", "assistant");
  const secondMessage = message("child-message-2", "assistant");
  const currentUser = message("current-user", "user");
  const ordinals = new Map([[firstMessage.id, 1], [secondMessage.id, 2]]);
  let fixture = empty();
  const firstPrestate = fixture;
  const first = t1Transaction(fixture, "t1:first", [firstMessage.id], 1);
  fixture = applied(fixture, first, ordinals);
  const secondPrestate = fixture;
  const second = t1Transaction(fixture, "t1:second", [secondMessage.id], 1);
  fixture = applied(fixture, second, ordinals);
  const parentPrestate = fixture;
  const parent = parentTransaction(fixture, "t2:parent", "T2", ["t1:first", "t1:second"], 2);
  const entries: SessionLikeEntry[] = [firstMessage, secondMessage];
  entries.push(custom("first-entry", publicTransaction(entries, firstPrestate, first)));
  entries.push(custom("second-entry", publicTransaction(entries, secondPrestate, second)));
  entries.push(custom("parent-entry", publicTransaction(entries, parentPrestate, parent)), currentUser);
  return { entries, replay: reduceV3LifecycleState(entries), currentUser: currentUser.message as V3ProjectionMessage };
}

function hierarchyFixture(): { entries: SessionLikeEntry[]; replay: V3LifecycleReplay } {
  const leaves = Array.from({ length: 7 }, (_, index) => message(`leaf:${index + 1}`, index % 2 === 0 ? "user" : "assistant"));
  const ordinals = new Map(leaves.map((entry, index) => [entry.id, index + 1]));
  const entries: SessionLikeEntry[] = [...leaves];
  let fixture = empty();
  for (const [index, entry] of leaves.entries()) {
    const prestate = fixture;
    const transaction = t1Transaction(fixture, `t1:${index + 1}`, [entry.id], 1);
    fixture = applied(fixture, transaction, ordinals);
    entries.push(custom(`t1-entry:${index + 1}`, publicTransaction(entries, prestate, transaction)));
  }
  for (const [blockId, children] of [
    ["t2:one", ["t1:1", "t1:2"]],
    ["t2:two", ["t1:3", "t1:4"]],
    ["t2:three", ["t1:5", "t1:6"]],
  ] as const) {
    const prestate = fixture;
    const transaction = parentTransaction(fixture, blockId, "T2", [...children], 2);
    fixture = applied(fixture, transaction);
    entries.push(custom(`${blockId}:entry`, publicTransaction(entries, prestate, transaction)));
  }
  const t3Prestate = fixture;
  const t3 = parentTransaction(fixture, "t3:one", "T3", ["t2:one", "t2:two"], 3);
  fixture = applied(fixture, t3);
  entries.push(custom("t3-entry", publicTransaction(entries, t3Prestate, t3)));
  entries.push(message("kept", "user", "kept tail"));
  return { entries, replay: reduceV3LifecycleState(entries) };
}

describe("AILI Compact v3 provider projection", () => {
  it("projects accepted raw leaves into a reload-stable production recap pair", () => {
    const fixture = simpleFixture();
    const alignment = alignProviderMessages(fixture.entries, fixture.messages);
    const first = projectV3Messages({ ...fixture, alignment });
    const reloaded = reduceV3LifecycleState(fixture.entries);
    const second = projectV3Messages({ ...fixture, replay: reloaded, alignment });

    expect(first.diagnostic).toBeUndefined();
    expect(first.projectedBlockIds).toEqual(["t1:old"]);
    expect(first.messages).toEqual([
      expect.objectContaining({ role: "assistant", content: [expect.objectContaining({ name: "aili_context_recap", arguments: { blockRef: "b000001" } })] }),
      expect.objectContaining({ role: "toolResult", toolName: "aili_context_recap", content: [expect.objectContaining({ text: expect.stringContaining("summary:t1:old") })] }),
      fixture.messages[2],
    ]);
    expect(second.messages).toEqual(first.messages);
    expect(second.hash).toBe(first.hash);
    expect(JSON.stringify(first.messages)).not.toContain("old answer");
  });

  it("replaces an exact sequence of immediate child recaps with its maximal parent recap", () => {
    const fixture = twoChildFixture();
    const state = fixture.replay.state!;
    const firstChild = state.blocks.get("t1:first")!;
    const secondChild = state.blocks.get("t1:second")!;
    const firstRecap = v3RecapProjection(firstChild, v3BlockReferenceFor(state, firstChild.blockId)!);
    const secondRecap = v3RecapProjection(secondChild, v3BlockReferenceFor(state, secondChild.blockId)!);
    const messages = [firstRecap.call, firstRecap.result, secondRecap.call, secondRecap.result, fixture.currentUser];
    const alignment = alignProviderMessages(fixture.entries, messages);
    const result = projectV3Messages({ replay: fixture.replay, entries: fixture.entries, messages, alignment });

    expect(result.diagnostic).toBeUndefined();
    expect(result.projectedBlockIds).toEqual(["t2:parent"]);
    expect(result.messages).toEqual([
      expect.objectContaining({ role: "assistant", content: [expect.objectContaining({ name: "aili_context_recap", arguments: { blockRef: "b000003" } })] }),
      expect.objectContaining({ role: "toolResult", content: [expect.objectContaining({ text: expect.stringContaining("summary:t2:parent") })] }),
      fixture.currentUser,
    ]);
    expect(JSON.stringify(result.messages)).not.toContain("summary:t1:first");
  });

  it("keeps old-epoch query-only source untouched", () => {
    const oldUser = message("old-user", "user");
    const oldAssistant = message("old-assistant", "assistant");
    const initial = empty();
    const transaction = t1Transaction(initial, "old-block", [oldUser.id, oldAssistant.id], 1);
    const currentUser = message("current-user", "user");
    const entries: SessionLikeEntry[] = [oldUser, oldAssistant];
    entries.push(custom("old-tx", publicTransaction(entries, initial, transaction)), { id: "epoch-2", type: "compaction" }, currentUser);
    const replay = reduceV3LifecycleState(entries);
    const messages = providerMessages(entries);
    const result = projectV3Messages({ replay, entries, messages, alignment: alignProviderMessages(entries, messages) });

    expect(replay.archivedQueryOnlyBlocks).toEqual([expect.objectContaining({ blockId: "old-block", queryOnly: true, deactivationReason: "epoch" })]);
    expect(result.diagnostic).toBeUndefined();
    expect(result.messages).toBe(messages);
    expect(result.projectedBlockIds).toEqual([]);
  });

  it("replays exact v3 cooling as a result-body-only replacement", () => {
    const call: SessionLikeEntry = {
      id: "call-entry",
      type: "message",
      message: { role: "assistant", content: [{ type: "toolCall", id: "call:read", name: "read", arguments: { path: "doc.txt" } }] },
    };
    const result: SessionLikeEntry = {
      id: "result-entry",
      type: "message",
      message: { role: "toolResult", toolCallId: "call:read", toolName: "read", content: "exact result body", isError: false },
    };
    const current = message("current-user", "user", "continue");
    const initial = empty();
    const transaction: V3Transaction = {
      header: header(initial, "tx:cool", 1),
      tag: "cooling",
      payload: {
        targetEntryIds: [result.id],
        profile: "retrieval",
        profileVersion: TOOL_COOLING_PROFILE_VERSION,
        provenance: {
          kind: "provider-observation",
          sessionId: initial.sessionId,
          branchLeafId: initial.branchLeafId,
          epochId: initial.epochId,
          callEntryId: call.id,
          callId: "call:read",
          normalizedExactToolName: "read",
          resultEntryId: result.id,
          resultBodyDigest: digest("exact result body"),
          providerInputIdentity: digest("provider-input"),
          settledRequestId: "request:later",
        },
        reason: "cool",
      },
    };
    const prefix = [call, result];
    const entries = [...prefix, custom("cool-entry", publicTransaction(prefix, initial, transaction)), current];
    const messages = providerMessages(entries);
    const replay = reduceV3LifecycleState(entries);
    const projected = projectV3Messages({ replay, entries, messages, alignment: alignProviderMessages(entries, messages) });

    expect(projected.diagnostic).toBeUndefined();
    expect(projected.projectedBlockIds).toEqual([]);
    expect(projected.messages).toHaveLength(messages.length);
    expect(projected.messages[0]).toBe(messages[0]);
    expect(projected.messages[2]).toBe(messages[2]);
    expect(projected.messages[1]).toMatchObject({
      role: "toolResult",
      toolCallId: "call:read",
      toolName: "read",
      isError: false,
      content: expect.stringContaining("tool-result cooled profile=retrieval"),
    });
    expect(JSON.stringify(projected.messages)).not.toContain("exact result body");
  });

  it("fails open for an unevaluated maximal block", () => {
    const fixture = simpleFixture({ status: "unevaluated", override: "quality-disabled" });
    const result = projectV3Messages({
      ...fixture,
      alignment: alignProviderMessages(fixture.entries, fixture.messages),
    });
    expect(result.messages).toBe(fixture.messages);
    expect(result.diagnostic).toBe("quality-ineligible:t1:old");
    expect(result.projectedBlockIds).toEqual([]);
  });

  it("returns the exact input references for alignment, digest, leaf-gap and protocol faults", () => {
    const fixture = simpleFixture();
    const goodAlignment = alignProviderMessages(fixture.entries, fixture.messages);
    const block = fixture.replay.state!.blocks.get("t1:old")!;
    const corruptBlock = { ...block, summary: "tampered" };
    const corruptState = { ...fixture.replay.state!, blocks: new Map([[corruptBlock.blockId, corruptBlock]]) };
    const corruptReplay: V3LifecycleReplay = { ...fixture.replay, state: corruptState, maximalActiveBlocks: [corruptBlock] };
    const gappedMessages = [fixture.messages[0]!, { role: "system", content: "external" }, fixture.messages[1]!, fixture.messages[2]!];
    const gappedAlignment = {
      byEntryId: new Map([["old-user", 0], ["old-assistant", 2], ["current-user", 3]]),
      providerMessageVisits: 4,
    };
    const incompleteProtocol = [
      { role: "user", content: "question" },
      { role: "assistant", content: [{ type: "toolCall", id: "unfinished", name: "read", arguments: {} }] },
    ];
    const faults = [
      projectV3Messages({ ...fixture, alignment: { ...goodAlignment, diagnostic: "alignment-ambiguous:old-user" } }),
      projectV3Messages({ ...fixture, alignment: { byEntryId: new Map([["current-user", 2]]) } }),
      projectV3Messages({ ...fixture, replay: corruptReplay, alignment: goodAlignment }),
      projectV3Messages({ replay: fixture.replay, entries: fixture.entries, messages: gappedMessages, alignment: gappedAlignment }),
      projectV3Messages({ replay: fixture.replay, entries: fixture.entries, messages: incompleteProtocol, alignment: { byEntryId: new Map() } }),
    ];

    expect(faults.map((fault) => fault.diagnostic)).toEqual([
      "alignment:alignment-ambiguous:old-user",
      "unaligned-block:t1:old",
      expect.stringMatching(/^v3-state:digest-mismatch:/),
      "leaf-gap:t1:old",
      "invalid-tool-pair",
    ]);
    for (const [index, fault] of faults.entries()) {
      const expectedInput = index === 3 ? gappedMessages : index === 4 ? incompleteProtocol : fixture.messages;
      expect(fault.messages).toBe(expectedInput);
      expect(fault.messages.every((message, messageIndex) => message === expectedInput[messageIndex])).toBe(true);
      expect(fault.projectedBlockIds).toEqual([]);
      expect(fault.earliestChangeIndex).toBeUndefined();
    }
  });
});

describe("AILI Compact v3 checkpoint coverage", () => {
  it("uses maximal T3, then T2, then T1 nodes without parent/descendant duplication", () => {
    const fixture = hierarchyFixture();
    const plan = planV3CheckpointCoverage({
      replay: fixture.replay,
      entries: fixture.entries,
      firstKeptEntryId: "kept",
      tokensBefore: 64_000,
      currentIdentity: CURRENT_CHECKPOINT_IDENTITY,
      previousSummary: "previous checkpoint",
    });

    expect(plan).toEqual(expect.objectContaining({
      firstKeptEntryId: "kept",
      tokensBefore: 64_000,
      details: { ailiCompact: expect.objectContaining({
        kind: "major-gc-v3",
        blockIds: ["t3:one", "t2:three", "t1:7"],
        tiers: ["T3", "T2", "T1"],
        leafCount: 7,
      }) },
    }));
    expect(plan?.summary).toContain("[T3 t3:one]");
    expect(plan?.summary).not.toContain("[T2 t2:one]");
    expect(plan?.summary).not.toContain("[T1 t1:1]");
  });

  it("fails closed when the current checkpoint identity is missing, unavailable, or drifts", () => {
    const fixture = hierarchyFixture();
    const input = {
      replay: fixture.replay,
      entries: fixture.entries,
      firstKeptEntryId: "kept",
      tokensBefore: 64_000,
    };
    const exact = planV3CheckpointCoverage({
      ...input,
      currentIdentity: CURRENT_CHECKPOINT_IDENTITY,
    });
    expect(exact?.details.ailiCompact.currentIdentity).toEqual(CURRENT_CHECKPOINT_IDENTITY);

    const ineligible: Array<V3CheckpointCurrentIdentity | undefined> = [
      undefined,
      { ...CURRENT_CHECKPOINT_IDENTITY, providerId: "unavailable" },
      { ...CURRENT_CHECKPOINT_IDENTITY, providerId: "provider-v2" },
      { ...CURRENT_CHECKPOINT_IDENTITY, modelId: "model-v2" },
      { ...CURRENT_CHECKPOINT_IDENTITY, estimatorVersion: "estimator-v2" },
      { ...CURRENT_CHECKPOINT_IDENTITY, projectionVersion: "projection-v4" },
      { ...CURRENT_CHECKPOINT_IDENTITY, qualityEvaluatorVersion: "quality-v2" },
    ];
    for (const currentIdentity of ineligible) {
      const plan = planV3CheckpointCoverage({
        ...input,
        ...(currentIdentity ? { currentIdentity } : {}),
      });
      expect(plan).toBeUndefined();
    }
  });

  it("returns undefined for gaps, old epochs and unevaluated quality so Pi native fallback remains authoritative", () => {
    const hierarchy = hierarchyFixture();
    const kept = hierarchy.entries.at(-1)!;
    const withGap = [...hierarchy.entries.slice(0, -1), message("uncovered", "assistant"), kept];
    const gapPlan = planV3CheckpointCoverage({
      replay: reduceV3LifecycleState(withGap),
      entries: withGap,
      firstKeptEntryId: "kept",
      tokensBefore: 64_000,
      currentIdentity: CURRENT_CHECKPOINT_IDENTITY,
    });

    const source = message("unevaluated-source", "assistant");
    const unevaluatedState = empty();
    const unevaluated = t1Transaction(unevaluatedState, "unevaluated", [source.id], 1, { status: "unevaluated", override: "quality-disabled" });
    const unevaluatedEntries: SessionLikeEntry[] = [source];
    unevaluatedEntries.push(custom("unevaluated-entry", publicTransaction(unevaluatedEntries, unevaluatedState, unevaluated)), message("unevaluated-kept", "user"));
    const qualityPlan = planV3CheckpointCoverage({
      replay: reduceV3LifecycleState(unevaluatedEntries),
      entries: unevaluatedEntries,
      firstKeptEntryId: "unevaluated-kept",
      tokensBefore: 8_000,
      currentIdentity: CURRENT_CHECKPOINT_IDENTITY,
    });

    const oldSource = message("old-source", "assistant");
    const oldState = empty();
    const oldTransaction = t1Transaction(oldState, "old", [oldSource.id], 1);
    const oldEntries: SessionLikeEntry[] = [oldSource];
    oldEntries.push(custom("old-entry", publicTransaction(oldEntries, oldState, oldTransaction)), { id: "epoch-2", type: "compaction" }, message("new-kept", "user"));
    const oldPlan = planV3CheckpointCoverage({
      replay: reduceV3LifecycleState(oldEntries),
      entries: oldEntries,
      firstKeptEntryId: "new-kept",
      tokensBefore: 8_000,
      currentIdentity: CURRENT_CHECKPOINT_IDENTITY,
    });

    expect(gapPlan).toBeUndefined();
    expect(qualityPlan).toBeUndefined();
    expect(oldPlan).toBeUndefined();
    expect(decideNativeCompaction({ reason: "overflow", policy: "deterministic-first", compaction: gapPlan })).toBeUndefined();
  });
});
