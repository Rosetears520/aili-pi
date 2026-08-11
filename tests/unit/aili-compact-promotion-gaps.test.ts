import { describe, expect, it } from "vitest";

import type { SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import {
  AILI_HANDLER_IMPLEMENTATION_ID,
  classifyTransparentPromotionGaps,
  classifyTransparentPromotionGapsFromProjection,
  createAiliPlanningResultEnvelope,
  createRawEpochProjection,
  createTrustedRawEpochProjection,
  PromotionGapIndexV1,
  type PromotionGapBlock,
  type PromotionGapSourceIdentity,
} from "../../src/runtime/aili-compact/promotion-gaps.js";
import { buildV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";

const IDENTITY: PromotionGapSourceIdentity = {
  sessionId: "session",
  branchLeafId: "branch",
  epochId: "epoch",
  revision: "revision-1",
};

function message(id: string, body: unknown): SessionLikeEntry {
  return { id, type: "message", message: body };
}

function planningPair(
  toolName: "aili_compact_status" | "aili_compact" = "aili_compact_status",
  outcome: "success" | "rejected" = "success",
  transaction?: unknown,
): readonly [SessionLikeEntry, SessionLikeEntry] {
  const callId = `${toolName}:call`;
  return [
    message(`${toolName}:caller`, { role: "assistant", toolCalls: [{ id: callId, name: toolName }] }),
    message(`${toolName}:result`, {
      role: "toolResult",
      toolCallId: callId,
      toolName,
      content: JSON.stringify(createAiliPlanningResultEnvelope({
        toolName,
        toolCallId: callId,
        identity: IDENTITY,
        outcome,
        result: { status: outcome },
        ...(transaction === undefined ? {} : { transaction }),
      })),
    }),
  ];
}

function classify(entries: readonly SessionLikeEntry[]) {
  const children: PromotionGapBlock[] = [
    { blockId: "left", firstLeafOrdinal: 1, lastLeafOrdinal: 1, source: { kind: "messages", entryIds: ["left"] } },
    { blockId: "right", firstLeafOrdinal: rawMessageCount(entries), lastLeafOrdinal: rawMessageCount(entries), source: { kind: "messages", entryIds: ["right"] } },
  ];
  return classifyTransparentPromotionGaps(entries, new Map(children.map((child) => [child.blockId, child])), children, IDENTITY);
}

function goodEntries(): SessionLikeEntry[] {
  return [message("left", { role: "assistant", content: "left" }), ...planningPair(), message("right", { role: "assistant", content: "right" })];
}

function rawMessageCount(entries: readonly SessionLikeEntry[]): number {
  return entries.filter((entry) => entry.type === "message").length;
}

describe("AILI Compact immutable raw promotion gaps", () => {
  it("assigns every message a raw ordinal while malformed slots and duplicate IDs fail closed", () => {
    for (const body of [null, "string", [], undefined]) {
      const entries = goodEntries();
      entries.splice(1, 0, message(`malformed:${String(body)}`, body));
      expect(classify(entries)).toMatchObject({ ok: false, reason: "non-transparent-protocol" });
    }

    const raw = createRawEpochProjection([
      message("raw:record", { role: "assistant", content: "record" }),
      message("raw:null", null),
      message("raw:scalar", "scalar"),
      message("raw:array", []),
      message("raw:missing", undefined),
    ], IDENTITY);
    expect(raw.rawSlots.map((slot) => ({ ordinal: slot.ordinal, entryId: slot.entryId, isRecordBody: slot.isRecordBody }))).toEqual([
      { ordinal: 1, entryId: "raw:record", isRecordBody: true },
      { ordinal: 2, entryId: "raw:null", isRecordBody: false },
      { ordinal: 3, entryId: "raw:scalar", isRecordBody: false },
      { ordinal: 4, entryId: "raw:array", isRecordBody: false },
      { ordinal: 5, entryId: "raw:missing", isRecordBody: false },
    ]);

    const duplicate = goodEntries();
    duplicate[2] = { ...duplicate[2]!, id: "left" };
    expect(classify(duplicate)).toEqual({ ok: false, pairIndex: 0, reason: "duplicate-entry-id" });

    const [caller, result] = planningPair();
    const custom: SessionLikeEntry = { id: "control", type: "custom", customType: "other", data: { ignored: true } };
    expect(classify([
      message("left", { role: "assistant", content: "left" }), custom, caller, result,
      message("right", { role: "assistant", content: "right" }),
    ])).toMatchObject({ ok: true, proofs: [expect.objectContaining({ messageCount: 2 })] });
  });

  it("uses the current epoch raw domain without renumbering past malformed history", () => {
    const entries: SessionLikeEntry[] = [
      message("old:record", { role: "assistant", content: "old" }),
      message("old:malformed", null),
      { id: "epoch:next", type: "compaction" },
      message("current:first", { role: "assistant", content: "first" }),
      message("current:malformed", []),
      message("current:last", { role: "assistant", content: "last" }),
    ];
    const legacyState = reduceCompactState(entries);
    const view = buildV3RuntimeView(entries, legacyState, { sessionId: "session" });

    expect(view.mutationCatalog.messageRefs).toEqual([
      expect.objectContaining({ entryId: "current:first", effectiveSourceOrdinal: 1 }),
      expect.objectContaining({ entryId: "current:last", effectiveSourceOrdinal: 3 }),
    ]);
  });

  it("accepts only exact closed AILI handler attestations and transaction-bound compact success", () => {
    expect(classify(goodEntries())).toMatchObject({
      ok: true,
      proofs: [expect.objectContaining({ sourceSnapshotDigest: expect.stringMatching(/^[0-9a-f]{64}$/) })],
    });

    const transaction = {
      header: {
        schema: "aili.compact.tx.v3",
        txId: "aili_compact:call",
        sessionId: IDENTITY.sessionId,
        branchLeafId: IDENTITY.branchLeafId,
        epochId: IDENTITY.epochId,
        catalogId: "catalog",
        createdAt: 1,
        projectionVersion: IDENTITY.revision,
      },
      tag: "semantic-create",
      payload: { stable: true },
    };
    const compact = [message("left", { role: "assistant", content: "left" }), ...planningPair("aili_compact", "success", transaction), message("right", { role: "assistant", content: "right" })];
    expect(classify(compact)).toMatchObject({ ok: true });
    const rejected = [message("left", { role: "assistant", content: "left" }), ...planningPair("aili_compact", "rejected"), message("right", { role: "assistant", content: "right" })];
    expect(classify(rejected)).toMatchObject({ ok: true });
    const rejectedStatus = [message("left", { role: "assistant", content: "left" }), ...planningPair("aili_compact_status", "rejected"), message("right", { role: "assistant", content: "right" })];
    expect(classify(rejectedStatus)).toMatchObject({ ok: false });

    for (const mutate of [
      (attestation: Record<string, unknown>) => { attestation.owner = "third-party"; },
      (attestation: Record<string, unknown>) => { attestation.version = "aili.compact.handler-attestation.v2"; },
      (attestation: Record<string, unknown>) => { attestation.toolName = "aili_compact"; },
      (attestation: Record<string, unknown>) => { attestation.toolCallId = "other"; },
      (attestation: Record<string, unknown>) => { attestation.sessionId = "other-session"; },
      (attestation: Record<string, unknown>) => { attestation.branchLeafId = "other-branch"; },
      (attestation: Record<string, unknown>) => { attestation.epochId = "other-epoch"; },
      (attestation: Record<string, unknown>) => { attestation.implementationId = `${AILI_HANDLER_IMPLEMENTATION_ID}:other`; },
      (attestation: Record<string, unknown>) => { attestation.outcome = "rejected"; },
      (attestation: Record<string, unknown>) => { attestation.resultDigest = "0".repeat(64); },
    ]) {
      const entries = goodEntries();
      const result = entries[2]!.message as Record<string, unknown>;
      const envelope = JSON.parse(result.content as string) as { attestation: Record<string, unknown> };
      mutate(envelope.attestation);
      result.content = JSON.stringify(envelope);
      expect(classify(entries)).toMatchObject({ ok: false, reason: "non-transparent-protocol" });
    }

    const mixed = goodEntries();
    ((mixed[1]!.message as Record<string, unknown>).toolCalls as unknown[]).push({ id: "read:call", name: "read" });
    expect(classify(mixed)).toMatchObject({ ok: false });

    const caseVariant = goodEntries();
    ((caseVariant[1]!.message as Record<string, unknown>).toolCalls as Array<Record<string, unknown>>)[0]!.name = "AILI_COMPACT_STATUS";
    expect(classify(caseVariant)).toMatchObject({ ok: false });
    const whitespaceVariant = goodEntries();
    ((whitespaceVariant[1]!.message as Record<string, unknown>).toolCalls as Array<Record<string, unknown>>)[0]!.name = "aili_compact_status ";
    expect(classify(whitespaceVariant)).toMatchObject({ ok: false });
    const bare = goodEntries();
    (bare[2]!.message as Record<string, unknown>).content = "ok";
    expect(classify(bare)).toMatchObject({ ok: false });

    const digestMismatch = compact.map((entry) => structuredClone(entry));
    const compactResult = digestMismatch[2]!.message as Record<string, unknown>;
    const compactEnvelope = JSON.parse(compactResult.content as string) as { transaction: { payload: Record<string, unknown> } };
    compactEnvelope.transaction.payload.stable = false;
    compactResult.content = JSON.stringify(compactEnvelope);
    expect(classify(digestMismatch)).toMatchObject({ ok: false });

    const nonV3Transaction = compact.map((entry) => structuredClone(entry));
    const nonV3Result = nonV3Transaction[2]!.message as Record<string, unknown>;
    const nonV3Envelope = JSON.parse(nonV3Result.content as string) as { transaction: { header: Record<string, unknown> } };
    nonV3Envelope.transaction.header.schema = "aili.compact.tx.v2";
    nonV3Result.content = JSON.stringify(nonV3Envelope);
    expect(classify(nonV3Transaction)).toMatchObject({ ok: false, reason: "non-transparent-protocol" });
  });

  it("rejects name-shaped, permission-denied, unknown, and mixed planning protocol", () => {
    const nameShaped = goodEntries();
    ((nameShaped[1]!.message as Record<string, unknown>).toolCalls as Array<Record<string, unknown>>)[0]!.name = "aili_compact_status\u200b";
    expect(classify(nameShaped)).toMatchObject({ ok: false, reason: "non-aili-planning-message" });

    const permissionDenied = goodEntries();
    const deniedResult = permissionDenied[2]!.message as Record<string, unknown>;
    deniedResult.isError = true;
    deniedResult.content = "permission denied";
    expect(classify(permissionDenied)).toMatchObject({ ok: false, reason: "non-transparent-protocol" });

    const unknown = goodEntries();
    const unknownCall = (unknown[1]!.message as Record<string, unknown>).toolCalls as Array<Record<string, unknown>>;
    unknownCall[0]!.name = "aili_compact_unknown";
    expect(classify(unknown)).toMatchObject({ ok: false, reason: "non-aili-planning-message" });

    const mixed = goodEntries();
    ((mixed[1]!.message as Record<string, unknown>).toolCalls as unknown[]).push({ id: "read:call", name: "read" });
    expect(classify(mixed)).toMatchObject({ ok: false, reason: "non-aili-planning-message" });
  });

  it("replays proofs from an immutable source snapshot and detects a mutated live source", () => {
    const entries = goodEntries();
    const first = classify(entries);
    expect(first).toMatchObject({ ok: true });
    if (!first.ok) return;

    ((entries[2]!.message as Record<string, unknown>).content) = "{}";
    expect(classify(entries)).toMatchObject({ ok: false, reason: "non-transparent-protocol" });

    const blocks = new Map< string, PromotionGapBlock >([
      ["left", { blockId: "left", firstLeafOrdinal: 1, lastLeafOrdinal: 1, source: { kind: "messages", entryIds: ["left"] } }],
      ["right", { blockId: "right", firstLeafOrdinal: 4, lastLeafOrdinal: 4, source: { kind: "messages", entryIds: ["right"] } }],
    ]);
    const replayed = classifyTransparentPromotionGapsFromProjection(first.projection, blocks, [...blocks.values()]);
    expect(replayed).toMatchObject({ ok: true, proofs: first.proofs });
  });

  it("replays a two-slot parent proof without copying a raw epoch beyond 256 slots", () => {
    const entries = [
      ...Array.from({ length: 300 }, (_, index) => message(`history:${index + 1}`, { role: "assistant", content: `history:${index + 1}` })),
      message("left", { role: "assistant", content: "left" }),
      ...planningPair(),
      message("right", { role: "assistant", content: "right" }),
    ];
    const blocks = new Map<string, PromotionGapBlock>([
      ["left", { blockId: "left", firstLeafOrdinal: 301, lastLeafOrdinal: 301, source: { kind: "messages", entryIds: ["left"] } }],
      ["right", { blockId: "right", firstLeafOrdinal: 304, lastLeafOrdinal: 304, source: { kind: "messages", entryIds: ["right"] } }],
    ]);
    const children = [...blocks.values()];
    const fullProjection = createRawEpochProjection(entries, IDENTITY);
    const expected = new PromotionGapIndexV1(fullProjection).classify(blocks, children);
    expect(expected).toMatchObject({ ok: true, proofs: [expect.objectContaining({ messageCount: 2 })] });
    if (!expected.ok) return;

    const selectedSlots = fullProjection.rawSlots.slice(300);
    const rawSlotReads = guardedArray(fullProjection.rawSlots, new Set<number>(), "raw slot");
    const rawPrefixReads = guardedArray(
      fullProjection.rawPrefixDigests,
      new Set([0, fullProjection.rawPrefixDigests.length - 1]),
      "raw prefix",
    );
    const bounded = new PromotionGapIndexV1(
      createTrustedRawEpochProjection(rawSlotReads.values, rawPrefixReads.values, IDENTITY),
      { slots: selectedSlots, rawSlotCoverage: "bounded" },
    );

    expect(bounded.classify(blocks, children)).toMatchObject({ ok: true, proofs: expected.proofs });
    expect(rawSlotReads.numericReads()).toBe(0);
    expect(rawPrefixReads.numericReads()).toBeLessThanOrEqual(4);
  });
});

function guardedArray<T>(values: readonly T[], allowedIndexes: ReadonlySet<number>, label: string) {
  let numericReads = 0;
  const proxy = new Proxy(values, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        numericReads += 1;
        const index = Number(property);
        if (!allowedIndexes.has(index)) throw new Error(`unexpected ${label} read:${index}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { values: proxy, numericReads: () => numericReads };
}
