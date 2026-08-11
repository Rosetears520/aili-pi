import { describe, expect, it } from "vitest";

import {
  AILI_COMPACT_ENTRY,
  canonicalJson,
  digest,
  type SessionLikeEntry,
} from "../../src/runtime/aili-compact/contracts.js";
import {
  appendBranchIndex,
  coldBuildBranchIndex,
  getBranchV3LifecycleReplay,
  type BranchIndexKey,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import { reduceCompactState, reduceV3LifecycleState } from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import {
  planV3BlockMutation,
  v3BlockSourceDigest,
  type V3BlockMutationRequest,
  type V3MutationPlannerContext,
} from "../../src/runtime/aili-compact/v3-mutations.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  applyV3Transaction,
  createEmptyV3State,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3SemanticBlock,
  type V3Tier,
  type V3TokenMetadata,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

const FACT_DIGEST = "f".repeat(64);
const RAW_EPOCH_VERSION = "aili.compact.raw-epoch.v1";
const ATTESTATION_VERSION = "aili.compact.handler-attestation.v1";
const IMPLEMENTATION_ID = "aili.compact.runtime.v3";

type GapKind = "ordinary" | "valid-attested-aili" | "third-party" | "malformed" | "mixed";

type RawSlot = { ordinal: number; entryId: string; body: unknown; sourceEntryIndex: number };
type OracleProof = {
  version: 1;
  leftChildBlockId: string;
  rightChildBlockId: string;
  leftLeafEntryId: string;
  rightLeafEntryId: string;
  messageCount: number;
  gapDigest: string;
  sourceSnapshotDigest: string;
};

type OracleResult = { ok: true; proofs: OracleProof[] } | { ok: false };

/**
 * Deliberately slow test-only raw-slot oracle. It must stay independent from
 * production promotion classifier/index/range-verifier imports and code paths.
 */
function bruteForceTransparentGaps(
  entries: readonly SessionLikeEntry[],
  children: readonly V3SemanticBlock[],
  identity: Pick<V3LifecycleState, "sessionId" | "branchLeafId" | "epochId" | "projectionVersion">,
  allBlocks: readonly V3SemanticBlock[] = children,
): OracleResult {
  const slots: RawSlot[] = [];
  const seen = new Set<string>();
  for (const [sourceEntryIndex, entry] of entries.entries()) {
    if (entry.type !== "message" || seen.has(entry.id)) return { ok: false };
    seen.add(entry.id);
    slots.push({ ordinal: slots.length + 1, entryId: entry.id, body: structuredClone(entry.message), sourceEntryIndex });
  }
  let prefix = digest({ version: RAW_EPOCH_VERSION, kind: "raw-slot-prefix" });
  const prefixes = [prefix];
  for (const slot of slots) {
    prefix = digest({
      previous: prefix,
      ordinal: slot.ordinal,
      entryId: slot.entryId,
      sourceEntryIndex: slot.sourceEntryIndex,
      body: slot.body,
      cloneable: true,
    });
    prefixes.push(prefix);
  }
  const sourceSnapshotDigest = digest({
    version: RAW_EPOCH_VERSION,
    identity: {
      sessionId: identity.sessionId,
      branchLeafId: identity.branchLeafId,
      epochId: identity.epochId,
      revision: identity.projectionVersion,
    },
    rawSlotCount: slots.length,
    rawPrefixDigest: prefixes.at(-1),
  });
  const byId = new Map(slots.map((slot) => [slot.entryId, slot] as const));
  const proofs: OracleProof[] = [];
  for (let index = 1; index < children.length; index += 1) {
    const left = children[index - 1]!;
    const right = children[index]!;
    if (right.firstLeafOrdinal <= left.lastLeafOrdinal) return { ok: false };
    const leftId = lastLeafId(left, allBlocks);
    const rightId = firstLeafId(right, allBlocks);
    const leftSlot = leftId ? byId.get(leftId) : undefined;
    const rightSlot = rightId ? byId.get(rightId) : undefined;
    if (!leftSlot || !rightSlot || !isRecord(leftSlot.body) || !isRecord(rightSlot.body)
      || leftSlot.ordinal !== left.lastLeafOrdinal || rightSlot.ordinal !== right.firstLeafOrdinal) return { ok: false };
    const gap = slots.filter((slot) => slot.ordinal > left.lastLeafOrdinal && slot.ordinal < right.firstLeafOrdinal);
    if (gap.length === 0) continue;
    if (gap.length > 256 || !oraclePlanningGap(gap, identity)) return { ok: false };
    proofs.push({
      version: 1,
      leftChildBlockId: left.blockId,
      rightChildBlockId: right.blockId,
      leftLeafEntryId: leftSlot.entryId,
      rightLeafEntryId: rightSlot.entryId,
      messageCount: gap.length,
      gapDigest: digest({
        version: 1,
        sourceSnapshotDigest,
        slots: gap.map((slot) => ({ ordinal: slot.ordinal, entryId: slot.entryId, body: slot.body })),
      }),
      sourceSnapshotDigest,
    });
  }
  return { ok: true, proofs };
}

function oraclePlanningGap(
  slots: readonly RawSlot[],
  identity: Pick<V3LifecycleState, "sessionId" | "branchLeafId" | "epochId" | "projectionVersion">,
): boolean {
  for (let index = 0; index < slots.length; index += 2) {
    const call = slots[index];
    const result = slots[index + 1];
    if (!call || !result || !isRecord(call.body) || !isRecord(result.body) || call.body.role !== "assistant"
      || result.body.role !== "toolResult") return false;
    const calls = [
      ...(Array.isArray(call.body.toolCalls) ? call.body.toolCalls : []),
      ...(Array.isArray(call.body.content) ? call.body.content.filter((part) => isRecord(part) && part.type === "toolCall") : []),
    ];
    if (calls.length !== 1 || !isRecord(calls[0])) return false;
    const toolCall = calls[0];
    if ((toolCall.name !== "aili_compact_status" && toolCall.name !== "aili_compact")
      || typeof toolCall.id !== "string"
      || result.body.toolCallId !== toolCall.id
      || result.body.toolName !== toolCall.name) return false;
    if (!oracleAttestation(result.body, toolCall, identity)) return false;
  }
  return true;
}

function oracleAttestation(
  result: Record<string, unknown>,
  call: Record<string, unknown>,
  identity: Pick<V3LifecycleState, "sessionId" | "branchLeafId" | "epochId" | "projectionVersion">,
): boolean {
  const envelope = oracleEnvelope(result);
  if (!envelope) return false;
  const hasTransaction = Object.prototype.hasOwnProperty.call(envelope, "transaction");
  if (canonicalJson(Object.keys(envelope).sort()) !== canonicalJson(
    hasTransaction ? ["attestation", "result", "transaction"] : ["attestation", "result"],
  )) return false;
  if (!isRecord(envelope.attestation)) return false;
  const attestation = envelope.attestation;
  const expectedKeys = [
    "branchLeafId", "epochId", "implementationId", "outcome", "owner", "resultDigest", "sessionId", "toolCallId", "toolName", "version",
    ...(hasTransaction ? ["transactionDigest", "transactionId"] : []),
  ].sort();
  const basic = canonicalJson(Object.keys(attestation).sort()) === canonicalJson(expectedKeys)
    && attestation.version === ATTESTATION_VERSION
    && attestation.owner === "aili-compact"
    && attestation.implementationId === IMPLEMENTATION_ID
    && attestation.toolName === call.name
    && attestation.toolCallId === call.id
    && attestation.sessionId === identity.sessionId
    && attestation.branchLeafId === identity.branchLeafId
    && attestation.epochId === identity.epochId
    && typeof attestation.resultDigest === "string"
    && /^[0-9a-f]{64}$/.test(attestation.resultDigest)
    && attestation.resultDigest === digest({ result: envelope.result, transaction: hasTransaction ? envelope.transaction : null });
  if (!basic) return false;
  if (call.name === "aili_compact_status") return attestation.outcome === "success" && !hasTransaction;
  if (attestation.outcome === "rejected") return !hasTransaction;
  return attestation.outcome === "success"
    && hasTransaction
    && typeof attestation.transactionId === "string"
    && attestation.transactionId === call.id
    && typeof attestation.transactionDigest === "string"
    && /^[0-9a-f]{64}$/.test(attestation.transactionDigest)
    && attestation.transactionDigest === digest(envelope.transaction)
    && oracleV3Transaction(envelope.transaction, call.id, identity);
}

/** Independent closed-shape/identity check for a compact-success transaction. */
function oracleV3Transaction(
  transaction: unknown,
  toolCallId: string,
  identity: Pick<V3LifecycleState, "sessionId" | "branchLeafId" | "epochId" | "projectionVersion">,
): boolean {
  if (!isRecord(transaction)
    || canonicalJson(Object.keys(transaction).sort()) !== canonicalJson(["header", "payload", "tag"])
    || !isRecord(transaction.header)
    || canonicalJson(Object.keys(transaction.header).sort()) !== canonicalJson([
      "branchLeafId", "catalogId", "createdAt", "epochId", "projectionVersion", "schema", "sessionId", "txId",
    ])
    || !isRecord(transaction.payload)
    || !["semantic-create", "decompress", "recompress", "cooling", "control"].includes(transaction.tag as string)) return false;
  const header = transaction.header;
  return header.schema === AILI_COMPACT_SCHEMA_V3
    && header.txId === toolCallId
    && header.sessionId === identity.sessionId
    && header.branchLeafId === identity.branchLeafId
    && header.epochId === identity.epochId
    && header.projectionVersion === identity.projectionVersion
    && typeof header.catalogId === "string"
    && header.catalogId.length > 0
    && typeof header.createdAt === "number"
    && Number.isSafeInteger(header.createdAt)
    && header.createdAt >= 0;
}

function transactionHeader(envelope: Record<string, unknown>): Record<string, unknown> {
  const transaction = envelope.transaction;
  if (!isRecord(transaction) || !isRecord(transaction.header)) throw new Error("missing compact-success transaction header");
  return transaction.header;
}

function rebindTransactionDigests(envelope: Record<string, unknown>): void {
  const attestation = envelope.attestation;
  if (!isRecord(attestation) || !Object.prototype.hasOwnProperty.call(envelope, "transaction")) {
    throw new Error("missing compact-success attestation");
  }
  attestation.resultDigest = digest({ result: envelope.result, transaction: envelope.transaction });
  attestation.transactionDigest = digest(envelope.transaction);
}

function oracleEnvelope(result: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isRecord(result.ailiCompact)) return result.ailiCompact;
  const values = [
    ...(typeof result.content === "string" ? [result.content] : []),
    ...(Array.isArray(result.content)
      ? result.content.flatMap((part) => typeof part === "string" ? [part] : isRecord(part) && typeof part.text === "string" ? [part.text] : [])
      : []),
  ];
  for (const value of values) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      // Non-JSON result content is intentionally opaque to this independent oracle.
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstLeafId(block: V3SemanticBlock, all: readonly V3SemanticBlock[]): string | undefined {
  const source = block.source;
  if (source.kind === "messages") return source.entryIds[0];
  const child = all.find((candidate) => candidate.blockId === source.childBlockIds[0]);
  return child ? firstLeafId(child, all) : undefined;
}

function lastLeafId(block: V3SemanticBlock, all: readonly V3SemanticBlock[]): string | undefined {
  const source = block.source;
  if (source.kind === "messages") return source.entryIds.at(-1);
  const child = all.find((candidate) => candidate.blockId === source.childBlockIds.at(-1));
  return child ? lastLeafId(child, all) : undefined;
}

describe("AILI Compact independent raw-slot promotion oracle", () => {
  it("accepts all three transparent AILI outcomes across content-array and direct envelopes, with binding negatives", () => {
    const outcomes = [
      { name: "status success", toolName: "aili_compact_status" as const, outcome: "success" as const, envelope: "content-array" as const },
      { name: "compact success", toolName: "aili_compact" as const, outcome: "success" as const, envelope: "direct" as const },
      { name: "compact rejection", toolName: "aili_compact" as const, outcome: "rejected" as const, envelope: "content-array" as const },
    ];
    for (const variant of outcomes) {
      const fixture = makeFixture(2, 2, "valid-attested-aili");
      const call = fixture.rawEntries.find((entry) => entry.id === "gap-call-entry:0")!.message as Record<string, unknown>;
      const result = fixture.rawEntries.find((entry) => entry.id === "gap-result-entry:0")!.message as Record<string, unknown>;
      const callId = "gap-call:0";
      call.toolCalls = [{ id: callId, name: variant.toolName }];
      result.toolCallId = callId;
      result.toolName = variant.toolName;
      const envelope = oraclePlanningEnvelope(
        variant.toolName,
        variant.outcome,
        callId,
        fixture.state,
        fixture.context.catalog.catalogId,
      );
      if (variant.envelope === "direct") {
        result.ailiCompact = envelope;
        delete result.content;
      } else {
        result.content = [{ type: "text", text: JSON.stringify(envelope) }];
        delete result.ailiCompact;
      }
      const oracle = bruteForceTransparentGaps(fixture.rawEntries, fixture.children, fixture.state);
      expect(oracle.ok, variant.name).toBe(true);
      const planner = planV3BlockMutation(fixture.request, fixture.context);
      expect(planner.ok, `${variant.name} planner`).toBe(oracle.ok);
      const transaction = planner.ok ? planner.transaction : fixture.parentTransaction(undefined);
      const direct = applyV3Transaction(fixture.state, transaction, {
        expectedCatalogId: fixture.context.catalog.catalogId,
        promotionGapEntries: fixture.rawEntries,
      });
      expect(direct.ok, `${variant.name} direct`).toBe(oracle.ok);
      const committed = fixture.commitParent(transaction);
      const pure = reduceV3LifecycleState(committed);
      const indexed = coldBuildBranchIndex({ key: branchKey(committed.at(-1)!.id), entries: committed });
      expect(indexed.ok, `${variant.name} index`).toBe(true);
      if (indexed.ok) expect(getBranchV3LifecycleReplay(indexed.snapshot).acceptedTransactionCount).toBe(pure.acceptedTransactionCount);

      const negativeBindings: Array<(attestation: Record<string, unknown>, broken: Record<string, unknown>) => void> = [
        (attestation) => { attestation.version = "other"; },
        (attestation) => { attestation.owner = "other"; },
        (attestation) => { attestation.implementationId = "other"; },
        (attestation) => { attestation.toolName = "read"; },
        (attestation) => { attestation.toolCallId = "other"; },
        (attestation) => { attestation.sessionId = "other"; },
        (attestation) => { attestation.branchLeafId = "other"; },
        (attestation) => { attestation.epochId = "other"; },
        (attestation) => { attestation.resultDigest = "0".repeat(64); },
      ];
      if (variant.toolName === "aili_compact" && variant.outcome === "success") {
        negativeBindings.push((attestation) => { attestation.transactionDigest = "0".repeat(64); });
        negativeBindings.push((_attestation, broken) => {
          transactionHeader(broken).txId = "other";
          rebindTransactionDigests(broken);
        });
        negativeBindings.push((_attestation, broken) => {
          transactionHeader(broken).projectionVersion = "other";
          rebindTransactionDigests(broken);
        });
        negativeBindings.push((_attestation, broken) => {
          transactionHeader(broken).schema = "other";
          rebindTransactionDigests(broken);
        });
      }
      for (const breakBinding of negativeBindings) {
        const brokenEntries = structuredClone(fixture.rawEntries) as BranchSessionEntry[];
        const brokenResult = brokenEntries.find((entry) => entry.id === "gap-result-entry:0")!.message as Record<string, unknown>;
        const broken = variant.envelope === "direct"
          ? brokenResult.ailiCompact as Record<string, unknown>
          : JSON.parse(((brokenResult.content as Array<Record<string, unknown>>)[0]!.text) as string) as Record<string, unknown>;
        breakBinding(broken.attestation as Record<string, unknown>, broken);
        if (variant.envelope === "direct") brokenResult.ailiCompact = broken;
        else (brokenResult.content as Array<Record<string, unknown>>)[0]!.text = JSON.stringify(broken);
        const brokenOracle = bruteForceTransparentGaps(brokenEntries, fixture.children, fixture.state);
        expect(brokenOracle.ok, `${variant.name} negative`).toBe(false);
        const brokenPlanner = planV3BlockMutation(fixture.request, {
          ...fixture.context,
          promotionGapEntries: brokenEntries,
        });
        expect(brokenPlanner.ok, `${variant.name} planner negative`).toBe(brokenOracle.ok);
        const parent = fixture.parentTransaction(oracle.ok ? oracle.proofs : undefined);
        const brokenDirect = applyV3Transaction(fixture.state, parent, {
          expectedCatalogId: fixture.context.catalog.catalogId,
          promotionGapEntries: brokenEntries,
        });
        expect(brokenDirect.ok, `${variant.name} direct negative`).toBe(brokenOracle.ok);
        const brokenCommitted = structuredClone(fixture.commitParent(parent)) as BranchSessionEntry[];
        const committedResult = brokenCommitted.find((entry) => entry.id === "gap-result-entry:0")!.message as Record<string, unknown>;
        if (variant.envelope === "direct") committedResult.ailiCompact = broken;
        else (committedResult.content as Array<Record<string, unknown>>)[0]!.text = JSON.stringify(broken);
        const brokenPure = reduceV3LifecycleState(brokenCommitted);
        expect(brokenPure.acceptedTransactionCount, `${variant.name} pure negative`).toBe(2);
        const brokenIndex = coldBuildBranchIndex({ key: branchKey(brokenCommitted.at(-1)!.id), entries: brokenCommitted });
        expect(brokenIndex.ok, `${variant.name} index negative`).toBe(true);
        if (brokenIndex.ok) expect(getBranchV3LifecycleReplay(brokenIndex.snapshot).acceptedTransactionCount).toBe(brokenPure.acceptedTransactionCount);
      }
    }
  });

  it("resolves nested T2/T3 child sources without delegating to production promotion logic", () => {
    const fixture = makeFixture(2, 2, "valid-attested-aili");
    const [left, right] = fixture.children;
    const leftT2 = { ...left!, blockId: "nested:left:t2", tier: "T2" as const, source: { kind: "blocks" as const, childBlockIds: [left!.blockId] } };
    const rightT2 = { ...right!, blockId: "nested:right:t2", tier: "T2" as const, source: { kind: "blocks" as const, childBlockIds: [right!.blockId] } };
    const leftT3 = { ...leftT2, blockId: "nested:left:t3", tier: "T3" as const, source: { kind: "blocks" as const, childBlockIds: [leftT2.blockId] } };
    const rightT3 = { ...rightT2, blockId: "nested:right:t3", tier: "T3" as const, source: { kind: "blocks" as const, childBlockIds: [rightT2.blockId] } };
    const oracle = bruteForceTransparentGaps(
      fixture.rawEntries,
      [leftT3, rightT3],
      fixture.state,
      [left!, right!, leftT2, rightT2, leftT3, rightT3],
    );
    expect(oracle).toMatchObject({ ok: true, proofs: [expect.objectContaining({ messageCount: 2 })] });
  });

  it("matches planner, direct transition, pure replay, and cold/append BranchIndex across the exact boundary matrix", () => {
    const boundaryGapLengths = [0, 1, 2, 255, 256, 257] as const;
    const supportedChildCounts = [2, 16] as const;
    const protocolClassifications = ["ordinary", "valid-attested-aili", "third-party", "malformed", "mixed"] as const satisfies readonly GapKind[];
    const matrix = supportedChildCounts.flatMap((childCount) => boundaryGapLengths.flatMap((gapSlots) => (
      protocolClassifications.map((kind) => ({ childCount, gapSlots, kind }))
    )));

    expect(matrix).toHaveLength(60);
    for (const { childCount, gapSlots, kind } of matrix) {
      const fixture = makeFixture(childCount, gapSlots, kind);
      const oracle = bruteForceTransparentGaps(fixture.rawEntries, fixture.children, fixture.state);
      const planner = planV3BlockMutation(fixture.request, fixture.context);
      expect(planner.ok, `${childCount}/${gapSlots}/${kind}`).toBe(oracle.ok);

      const transaction = planner.ok ? planner.transaction : fixture.parentTransaction(oracle.ok ? oracle.proofs : undefined);
      if (planner.ok && transaction.tag === "semantic-create" && transaction.payload.source.kind === "blocks") {
        expect(transaction.payload.source.transparentGaps ?? []).toEqual(oracle.ok ? oracle.proofs : []);
      }
      const direct = applyV3Transaction(fixture.state, transaction, {
        expectedCatalogId: fixture.context.catalog.catalogId,
        promotionGapEntries: fixture.rawEntries,
      });
      expect(direct.ok, `direct ${childCount}/${gapSlots}/${kind}`).toBe(oracle.ok);

      const committed = fixture.commitParent(transaction);
      const pure = reduceV3LifecycleState(committed);
      expect(pure.acceptedTransactionCount).toBe(childCount + (oracle.ok ? 1 : 0));
      const cold = coldBuildBranchIndex({ key: branchKey(committed.at(-1)!.id), entries: committed });
      expect(cold.ok).toBe(true);
      if (!cold.ok) continue;
      expect(getBranchV3LifecycleReplay(cold.snapshot).acceptedTransactionCount).toBe(pure.acceptedTransactionCount);

      const prefix = committed.slice(0, -1);
      const appended = coldBuildBranchIndex({ key: branchKey(prefix.at(-1)!.id), entries: prefix });
      expect(appended.ok).toBe(true);
      if (!appended.ok) continue;
      const next = appendBranchIndex(appended.snapshot, {
        entries: [committed.at(-1)!],
        expectedParentId: appended.snapshot.tipEntryId,
        nextBranchLeafId: committed.at(-1)!.id,
      });
      expect(next.ok).toBe(true);
      if (next.ok) expect(getBranchV3LifecycleReplay(next.snapshot).acceptedTransactionCount).toBe(pure.acceptedTransactionCount);
    }
  }, 120_000);
});

function makeFixture(childCount: number, gapSlots: number, kind: GapKind) {
  const rawEntries: BranchSessionEntry[] = [];
  append(rawEntries, message("leaf:1", { role: "assistant", content: "leaf:1" }));
  appendGap(rawEntries, gapSlots, kind);
  append(rawEntries, message("leaf:2", { role: "assistant", content: "leaf:2" }));
  for (let index = 3; index <= childCount; index += 1) append(rawEntries, message(`leaf:${index}`, { role: "assistant", content: `leaf:${index}` }));

  const ordinals = new Map(rawEntries.filter((entry) => entry.type === "message").map((entry, index) => [entry.id, index + 1] as const));
  const entries = [...rawEntries];
  let state = createEmptyV3State({ sessionId: "oracle-session", branchLeafId: "oracle-branch", epochId: "root", projectionVersion: "oracle-projection" });
  const children: V3SemanticBlock[] = [];
  for (let index = 1; index <= childCount; index += 1) {
    const entryId = `leaf:${index}`;
    const catalogId = publicCatalogId(entries, state);
    const transaction = t1(state, `t1:${index}`, entryId, index, catalogId);
    const transitioned = applyV3Transaction(state, transaction, {
      expectedCatalogId: catalogId,
      messageOrdinals: new Map([[entryId, ordinals.get(entryId)!]]),
    });
    if (!transitioned.ok) throw new Error(`${transitioned.code}:${transitioned.path}`);
    state = transitioned.value.state;
    children.push(state.blocks.get(`t1:${index}`)!);
    append(entries, custom(`t1-entry:${index}`, transaction));
  }
  const catalogId = publicCatalogId(entries, state);
  const blockRefs = children.map((block, index) => ({ ref: `b${String(index + 1).padStart(6, "0")}`, blockId: block.blockId, effectiveSourceOrdinal: block.firstLeafOrdinal }));
  const sourceDigest = v3BlockSourceDigest(catalogId, children);
      const request: V3BlockMutationRequest = {
        operation: "compact",
        mode: "blocks",
    catalogId,
    transactionId: "tx:parent",
    blockId: "parent",
    topic: "oracle parent",
    summary: "oracle summary",
    summaryMaxChars: 6_000,
    runId: "oracle-run",
    createdAt: 100,
    createdTurnOrdinal: 100,
    blockRefs: blockRefs.map((item) => item.ref),
    benefit: benefit("T2", blockRefs.map((item) => item.ref), sourceDigest),
    quality: { override: "quality-disabled" },
  };
  const context: V3MutationPlannerContext = {
    state,
    catalog: {
      catalogId,
      stateCatalogId: state.catalogId,
      sessionId: state.sessionId,
      branchLeafId: state.branchLeafId,
      epochId: state.epochId,
      projectionVersion: state.projectionVersion,
      messageRefs: [],
      blockRefs,
    },
    promotionGapEntries: rawEntries,
  };
  return {
    rawEntries,
    state,
    children,
    request,
    context,
    parentTransaction: (proofs: readonly OracleProof[] | undefined): V3Transaction => parent(state, catalogId, children, proofs),
    commitParent: (transaction: V3Transaction): BranchSessionEntry[] => {
      const committed = [...entries];
      append(committed, custom("parent-entry", transaction));
      return committed;
    },
  };
}

function appendGap(entries: BranchSessionEntry[], count: number, kind: GapKind): void {
  for (let index = 0; index < count; index += 1) {
    const pair = Math.floor(index / 2);
    const isCall = index % 2 === 0;
    const callId = `gap-call:${pair}`;
    if (kind === "valid-attested-aili" || (kind === "mixed" && index < 2)) {
      append(entries, isCall
        ? message(`gap-call-entry:${pair}`, { role: "assistant", toolCalls: [{ id: callId, name: "aili_compact_status" }] })
        : message(`gap-result-entry:${pair}`, {
          role: "toolResult", toolCallId: callId, toolName: "aili_compact_status",
          content: JSON.stringify(attestedStatus(callId)),
        }));
    } else if (kind === "third-party" && index < 2) {
      append(entries, isCall
        ? message(`third-call:${pair}`, { role: "assistant", toolCalls: [{ id: callId, name: "read" }] })
        : message(`third-result:${pair}`, { role: "toolResult", toolCallId: callId, toolName: "read", content: "no" }));
    } else if (kind === "malformed" && index === 0) {
      append(entries, message("malformed-gap", null));
    } else {
      append(entries, message(`ordinary-gap:${index}`, { role: "assistant", content: `ordinary:${index}` }));
    }
  }
}

function attestedStatus(toolCallId: string) {
  const result = { status: "ok" };
  return {
    attestation: {
      version: ATTESTATION_VERSION,
      owner: "aili-compact",
      toolName: "aili_compact_status",
      toolCallId,
      sessionId: "oracle-session",
      branchLeafId: "oracle-branch",
      epochId: "root",
      implementationId: IMPLEMENTATION_ID,
      outcome: "success",
      resultDigest: digest({ result, transaction: null }),
    },
    result,
  };
}

function oraclePlanningEnvelope(
  toolName: "aili_compact_status" | "aili_compact",
  outcome: "success" | "rejected",
  toolCallId: string,
  identity: Pick<V3LifecycleState, "sessionId" | "branchLeafId" | "epochId" | "projectionVersion">,
  catalogId: string,
) {
  const result = { status: outcome };
  const transaction: V3Transaction | undefined = toolName === "aili_compact" && outcome === "success"
    ? {
      header: {
        schema: AILI_COMPACT_SCHEMA_V3,
        txId: toolCallId,
        sessionId: identity.sessionId,
        branchLeafId: identity.branchLeafId,
        epochId: identity.epochId,
        catalogId,
        createdAt: 99,
        projectionVersion: identity.projectionVersion,
      },
      tag: "control",
      payload: {
        action: "on",
        targetBlockIds: [],
        provenance: { kind: "automatic", id: "oracle-attested-compact" },
        reason: "on",
      },
    }
    : undefined;
  return {
    attestation: {
      version: ATTESTATION_VERSION,
      owner: "aili-compact",
      toolName,
      toolCallId,
      sessionId: identity.sessionId,
      branchLeafId: identity.branchLeafId,
      epochId: identity.epochId,
      implementationId: IMPLEMENTATION_ID,
      outcome,
      resultDigest: digest({ result, transaction: transaction ?? null }),
      ...(transaction ? { transactionId: toolCallId, transactionDigest: digest(transaction) } : {}),
    },
    result,
    ...(transaction ? { transaction } : {}),
  };
}

function t1(state: V3LifecycleState, blockId: string, entryId: string, createdAt: number, catalogId: string): V3Transaction {
  const summary = `summary:${blockId}`;
  return {
    header: header(state, `tx:${blockId}`, createdAt, catalogId),
    tag: "semantic-create",
    payload: {
      blockId,
      tier: "T1",
      topic: blockId,
      runId: `run:${blockId}`,
      anchorEntryId: entryId,
      createdTurnOrdinal: createdAt,
      summary,
      summaryDigest: v3SummaryDigest(summary),
      source: { kind: "messages", entryIds: [entryId], firstEntryId: entryId, lastEntryId: entryId },
      leafDigest: v3MessageLeafDigest([entryId]),
      leafCount: 1,
      tokens: tokens("T1"),
      quality: quality(),
    },
  };
}

function parent(
  state: V3LifecycleState,
  catalogId: string,
  children: readonly V3SemanticBlock[],
  proofs: readonly OracleProof[] | undefined,
): V3Transaction {
  const summary = "oracle summary";
  return {
    header: header(state, "tx:parent", 100, catalogId),
    tag: "semantic-create",
    payload: {
      blockId: "parent",
      tier: "T2",
      topic: "oracle parent",
      runId: "oracle-run",
      anchorEntryId: children[0]!.anchorEntryId,
      createdTurnOrdinal: 100,
      summary,
      summaryDigest: v3SummaryDigest(summary),
      source: { kind: "blocks", childBlockIds: children.map((child) => child.blockId), ...(proofs?.length ? { transparentGaps: [...proofs] } : {}) },
      leafDigest: v3ParentLeafDigest("T2", children.length, children.map((child) => child.leafDigest)),
      leafCount: children.length,
      tokens: tokens("T2"),
      quality: quality(),
    },
  };
}

function header(state: V3LifecycleState, txId: string, createdAt: number, catalogId: string) {
  return {
    schema: AILI_COMPACT_SCHEMA_V3,
    txId,
    sessionId: state.sessionId,
    branchLeafId: state.branchLeafId,
    epochId: state.epochId,
    catalogId,
    createdAt,
    projectionVersion: state.projectionVersion,
  } as const;
}

function tokens(tier: V3Tier): V3TokenMetadata {
  const sourceTokensLower = 3_000;
  const replacementTokensUpper = tier === "T1" ? 1_000 : 1_500;
  const steadySavingsTokensLower = sourceTokensLower - replacementTokensUpper;
  return {
    estimatorVersion: "oracle-estimator",
    providerId: "oracle-provider",
    modelId: "oracle-model",
    sourceTokensLower,
    sourceTokensUpper: sourceTokensLower,
    replacementTokensUpper,
    steadySavingsTokensLower,
    oneTimeCostTokensUpper: 500,
    breakEvenTurnsUpper: 1,
    savingsRatio: steadySavingsTokensLower / sourceTokensLower,
    summaryTokensUpper: 300,
  };
}

function quality() {
  return {
    status: "accepted" as const,
    evaluatorVersion: "oracle-quality",
    sourceFactDigest: FACT_DIGEST,
    hardFactCount: 1,
    coveredHardFactCount: 1,
    warningCodes: [] as string[],
  };
}

function benefit(tier: "T2", orderedRefs: readonly string[], sourceDigest: string) {
  const token = tokens(tier);
  return {
    sourceDigest,
    summaryDigest: v3SummaryDigest("oracle summary"),
    orderedRefs,
    decision: {
      eligible: true,
      reasons: [],
      tier,
      pressureStage: "NORMAL" as const,
      horizonTurns: 8,
      sourceLower: token.sourceTokensLower,
      sourceUpper: token.sourceTokensUpper,
      replacementUpper: token.replacementTokensUpper,
      steadySavingsLower: token.steadySavingsTokensLower,
      savingsRatio: token.savingsRatio,
      oneTimeCostUpper: token.oneTimeCostTokensUpper,
      breakEvenTurnsUpper: token.breakEvenTurnsUpper,
      netSavingsLower: 8 * token.steadySavingsTokensLower - token.oneTimeCostTokensUpper,
      saturated: false,
    },
    tokens: token,
  };
}

function publicCatalogId(entries: readonly BranchSessionEntry[], state: V3LifecycleState): string {
  return deriveRuntimeCatalogIdForState(entries, reduceCompactState(entries), state);
}

function append(entries: BranchSessionEntry[], entry: BranchSessionEntry): void {
  entries.push({ ...entry, ...(entries.length === 0 ? {} : { parentId: entries.at(-1)!.id }) });
}

function message(id: string, body: unknown): BranchSessionEntry {
  return { id, type: "message", message: body };
}

function custom(id: string, data: unknown): BranchSessionEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data };
}

function branchKey(branchLeafId: string): BranchIndexKey {
  return {
    sessionId: "oracle-session",
    canonicalSessionPathDigest: "oracle-path",
    branchLeafId,
    epochId: "root",
    replayVersion: "oracle-replay",
  };
}
