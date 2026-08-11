import { canonicalJson, digest, isRecord, type SessionLikeEntry } from "./contracts.js";

export const TRANSPARENT_PROMOTION_GAP_VERSION = 1 as const;
export const RAW_EPOCH_PROJECTION_VERSION = "aili.compact.raw-epoch.v1" as const;
export const AILI_HANDLER_ATTESTATION_VERSION = "aili.compact.handler-attestation.v1" as const;
export const AILI_HANDLER_OWNER = "aili-compact" as const;
export const AILI_HANDLER_IMPLEMENTATION_ID = "aili.compact.runtime.v3" as const;
export const MAX_TRANSPARENT_PROMOTION_GAPS = 15;
export const MAX_TRANSPARENT_PROMOTION_GAP_MESSAGES = 256;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const AILI_PLANNING_TOOLS = new Set(["aili_compact_status", "aili_compact"]);
const AILI_V3_TRANSACTION_SCHEMA = "aili.compact.tx.v3";
const AILI_V3_TRANSACTION_TAGS = new Set(["semantic-create", "decompress", "recompress", "cooling", "control"]);
const AILI_V3_HEADER_KEYS = [
  "branchLeafId",
  "catalogId",
  "createdAt",
  "epochId",
  "projectionVersion",
  "schema",
  "sessionId",
  "txId",
];

export interface PromotionGapSourceIdentity {
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  /** Revision/implementation identity of the source view, never a mutable object reference. */
  revision: string;
}

export interface RawEpochSlotV1 {
  ordinal: number;
  entryId: string;
  /** Zero-based source-entry position. Custom entries do not consume a raw slot. */
  sourceEntryIndex: number;
  /** A deep-cloned canonical source body; never a Session-owned object reference. */
  body: unknown;
  bodyDigest: string;
  isRecordBody: boolean;
  cloneable: boolean;
}

export interface RawEpochProjectionV1 {
  version: typeof RAW_EPOCH_PROJECTION_VERSION;
  identity: PromotionGapSourceIdentity;
  rawSlots: readonly RawEpochSlotV1[];
  /** Chain digests indexed by raw-slot count; index zero is the empty epoch. */
  rawPrefixDigests: readonly string[];
  sourceSnapshotDigest: string;
  valid: boolean;
  invalidReason?: string;
}

export interface PromotionGapVerificationOptions {
  /** Restrict validation to the pre-transaction raw-slot prefix. */
  rawSlotLimit?: number;
  /** Counts only slots in the exclusive transparent gap range. */
  onProofRawSlotVisit?: () => void;
}

export interface PromotionGapIndexOptions {
  /**
   * Resolves an immutable raw slot without flattening persistent epoch storage.
   * The ordinal is one-based in the raw epoch coordinate system.
   */
  slotAtOrdinal?: (ordinal: number) => RawEpochSlotV1 | undefined;
  slots?: readonly RawEpochSlotV1[];
  rawSlotCoverage?: "full" | "bounded";
}

export interface AiliHandlerAttestationV1 {
  version: typeof AILI_HANDLER_ATTESTATION_VERSION;
  owner: typeof AILI_HANDLER_OWNER;
  toolName: "aili_compact_status" | "aili_compact";
  toolCallId: string;
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  implementationId: typeof AILI_HANDLER_IMPLEMENTATION_ID;
  outcome: "success" | "rejected";
  resultDigest: string;
  transactionId?: string;
  transactionDigest?: string;
}

export interface AiliPlanningResultEnvelopeV1 {
  attestation: AiliHandlerAttestationV1;
  result: unknown;
  transaction?: unknown;
}

export interface TransparentPromotionGapV1 {
  version: typeof TRANSPARENT_PROMOTION_GAP_VERSION;
  leftChildBlockId: string;
  rightChildBlockId: string;
  leftLeafEntryId: string;
  rightLeafEntryId: string;
  messageCount: number;
  gapDigest: string;
  sourceSnapshotDigest: string;
}

export interface PromotionGapBlock {
  blockId: string;
  firstLeafOrdinal: number;
  lastLeafOrdinal: number;
  source: { kind: "messages"; entryIds: readonly string[] }
    | { kind: "blocks"; childBlockIds: readonly string[] };
}

export type PromotionGapResult =
  | { ok: true; proofs: TransparentPromotionGapV1[]; projection: RawEpochProjectionV1 }
  | { ok: false; pairIndex: number; reason: string };

/**
 * Captures the one authoritative raw-message coordinate system for an epoch.
 * Every `type:"message"` entry receives a slot before its body is interpreted.
 */
export function createRawEpochProjection(
  entries: readonly SessionLikeEntry[],
  identity: PromotionGapSourceIdentity,
): RawEpochProjectionV1 {
  const rawSlots: RawEpochSlotV1[] = [];
  for (const [sourceEntryIndex, entry] of entries.entries()) {
    if (entry.type !== "message") continue;
    const ordinal = rawSlots.length + 1;
    rawSlots.push(createRawEpochSlot(entry, ordinal, sourceEntryIndex));
  }

  return createRawEpochProjectionFromSlots(rawSlots, identity);
}

/** Captures one immutable raw message slot for persistent index ownership. */
export function createRawEpochSlot(
  entry: Pick<SessionLikeEntry, "id" | "message">,
  ordinal: number,
  sourceEntryIndex: number,
): RawEpochSlotV1 {
  let body: unknown;
  let cloneable = true;
  try {
    body = immutableClone(entry.message);
  } catch {
    body = undefined;
    cloneable = false;
  }
  const entryId = typeof entry.id === "string" ? entry.id : "";
  return Object.freeze({
    ordinal,
    entryId,
    sourceEntryIndex,
    body,
    bodyDigest: digest({ ordinal, entryId, body }),
    isRecordBody: isRecord(body),
    cloneable,
  });
}

/** Builds a projection from slots that have already been captured immutably. */
export function createRawEpochProjectionFromSlots(
  rawSlots: readonly RawEpochSlotV1[],
  identity: PromotionGapSourceIdentity,
): RawEpochProjectionV1 {
  const slots = Object.freeze([...rawSlots]);
  const seenEntryIds = new Set<string>();
  let invalidReason = validIdentity(identity) ? undefined : "invalid-source-identity";
  const rawPrefixDigests: string[] = [rawEpochPrefixSeed()];
  for (const [index, slot] of slots.entries()) {
    if (slot.ordinal !== index + 1
      || !Number.isSafeInteger(slot.sourceEntryIndex)
      || slot.sourceEntryIndex < 0
      || typeof slot.entryId !== "string"
      || slot.entryId.length === 0) {
      invalidReason ??= "invalid-message-entry-id";
    } else if (seenEntryIds.has(slot.entryId)) {
      invalidReason ??= "duplicate-entry-id";
    } else {
      seenEntryIds.add(slot.entryId);
    }
    if (slot.bodyDigest !== digest({ ordinal: slot.ordinal, entryId: slot.entryId, body: slot.body })) {
      invalidReason ??= "raw-slot-digest-mismatch";
    }
    if (!slot.cloneable) invalidReason ??= "uncloneable-message-body";
    rawPrefixDigests.push(nextRawEpochPrefixDigest(rawPrefixDigests.at(-1)!, slot));
  }

  const snapshot = Object.freeze({
    version: RAW_EPOCH_PROJECTION_VERSION,
    identity: Object.freeze({ ...identity }),
    rawSlots: slots,
    rawPrefixDigests: Object.freeze(rawPrefixDigests),
    sourceSnapshotDigest: sourceSnapshotDigest(identity, rawPrefixDigests.at(-1)!, slots.length),
    valid: invalidReason === undefined,
    ...(invalidReason ? { invalidReason } : {}),
  }) as RawEpochProjectionV1;
  return snapshot;
}

/** The fixed seed for an incrementally captured raw epoch digest chain. */
export function rawEpochPrefixSeed(): string {
  return digest({ version: RAW_EPOCH_PROJECTION_VERSION, kind: "raw-slot-prefix" });
}

/** Extends a raw epoch digest chain with one already-captured immutable slot. */
export function nextRawEpochPrefixDigest(previous: string, slot: RawEpochSlotV1): string {
  return digest({
    previous,
    ordinal: slot.ordinal,
    entryId: slot.entryId,
    sourceEntryIndex: slot.sourceEntryIndex,
    body: slot.body,
    cloneable: slot.cloneable,
  });
}

/**
 * Rehydrates a projection from BranchIndex-owned immutable slots and its
 * incrementally maintained digest chain. Callers must only use this for slots
 * captured with createRawEpochSlot; it intentionally does not revisit bodies.
 */
export function createTrustedRawEpochProjection(
  rawSlots: readonly RawEpochSlotV1[],
  rawPrefixDigests: readonly string[],
  identity: PromotionGapSourceIdentity,
): RawEpochProjectionV1 {
  // BranchIndex owns these already-frozen arrays. Retaining the shared arrays
  // keeps bounded proof replay bounded; cloning either array here would turn a
  // two-slot proof into an O(epoch) allocation.
  const slots = rawSlots;
  const prefixes = rawPrefixDigests;
  const invalidReason = !validIdentity(identity)
    ? "invalid-source-identity"
    : !Object.isFrozen(slots)
      || !Object.isFrozen(prefixes)
      || prefixes.length !== slots.length + 1
      || prefixes[0] !== rawEpochPrefixSeed()
      || !HASH_PATTERN.test(prefixes.at(-1) ?? "")
      ? "invalid-raw-projection"
      : undefined;
  return Object.freeze({
    version: RAW_EPOCH_PROJECTION_VERSION,
    identity: Object.freeze({ ...identity }),
    rawSlots: slots,
    rawPrefixDigests: prefixes,
    sourceSnapshotDigest: sourceSnapshotDigest(identity, prefixes.at(-1) ?? "", slots.length),
    valid: invalidReason === undefined,
    ...(invalidReason ? { invalidReason } : {}),
  }) as RawEpochProjectionV1;
}

/**
 * Creates the bounded view used by BranchIndex proof replay without expanding
 * its persistent raw-slot storage into an array. A full PromotionGapIndex must
 * provide a slot accessor; bounded proof replay supplies its explicit slot set.
 */
export function createTrustedRawEpochProjectionFromPrefixAccessor(input: {
  rawSlotCount: number;
  rawPrefixDigestAt: (rawSlotCount: number) => string | undefined;
  identity: PromotionGapSourceIdentity;
}): RawEpochProjectionV1 {
  const { rawSlotCount, rawPrefixDigestAt, identity } = input;
  const prefixLength = rawSlotCount + 1;
  const rawSlots = Object.freeze({ length: rawSlotCount }) as unknown as readonly RawEpochSlotV1[];
  const rawPrefixDigests = Object.freeze({
    length: prefixLength,
    at(index: number): string | undefined {
      if (!Number.isInteger(index)) return undefined;
      const resolved = index < 0 ? prefixLength + index : index;
      return resolved < 0 || resolved >= prefixLength ? undefined : rawPrefixDigestAt(resolved);
    },
  }) as unknown as readonly string[];
  const first = rawPrefixDigests.at(0);
  const last = rawPrefixDigests.at(-1);
  const invalidReason = !Number.isSafeInteger(rawSlotCount)
    || rawSlotCount < 0
    || !validIdentity(identity)
    || first !== rawEpochPrefixSeed()
    || !HASH_PATTERN.test(last ?? "")
    ? "invalid-raw-projection"
    : undefined;
  return Object.freeze({
    version: RAW_EPOCH_PROJECTION_VERSION,
    identity: Object.freeze({ ...identity }),
    rawSlots,
    rawPrefixDigests,
    sourceSnapshotDigest: sourceSnapshotDigest(identity, last ?? "", rawSlotCount),
    valid: invalidReason === undefined,
    ...(invalidReason ? { invalidReason } : {}),
  }) as RawEpochProjectionV1;
}

/** Produces a closed, replayable handler envelope returned by the owned tools. */
export function createAiliPlanningResultEnvelope(input: {
  toolName: "aili_compact_status" | "aili_compact";
  toolCallId: string;
  identity: PromotionGapSourceIdentity;
  outcome: "success" | "rejected";
  result: unknown;
  transaction?: unknown;
}): AiliPlanningResultEnvelopeV1 {
  const hasTransaction = input.transaction !== undefined;
  const resultDigest = digest({ result: input.result, transaction: hasTransaction ? input.transaction : null });
  const attestation: AiliHandlerAttestationV1 = {
    version: AILI_HANDLER_ATTESTATION_VERSION,
    owner: AILI_HANDLER_OWNER,
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    sessionId: input.identity.sessionId,
    branchLeafId: input.identity.branchLeafId,
    epochId: input.identity.epochId,
    implementationId: AILI_HANDLER_IMPLEMENTATION_ID,
    outcome: input.outcome,
    resultDigest,
    ...(hasTransaction ? {
      transactionId: transactionId(input.transaction),
      transactionDigest: digest(input.transaction),
    } : {}),
  };
  return Object.freeze({
    attestation: Object.freeze(attestation),
    result: immutableClone(input.result),
    ...(hasTransaction ? { transaction: immutableClone(input.transaction) } : {}),
  });
}

/**
 * The handler may attest only the exact v3 transaction it just accepted for
 * this call and immutable source identity. This is schema/source binding, not
 * a claim that persisted Session data is tamper-proof.
 */
export function isAiliPlanningV3Transaction(
  value: unknown,
  toolCallId: string,
  identity: PromotionGapSourceIdentity,
): boolean {
  if (!isRecord(value)
    || !hasExactKeys(value, ["header", "payload", "tag"])
    || !isRecord(value.header)
    || !hasExactKeys(value.header, AILI_V3_HEADER_KEYS)
    || !isRecord(value.payload)
    || typeof value.tag !== "string"
    || !AILI_V3_TRANSACTION_TAGS.has(value.tag)) return false;
  const header = value.header;
  const createdAt = header.createdAt;
  return header.schema === AILI_V3_TRANSACTION_SCHEMA
    && header.txId === toolCallId
    && header.sessionId === identity.sessionId
    && header.branchLeafId === identity.branchLeafId
    && header.epochId === identity.epochId
    && header.projectionVersion === identity.revision
    && typeof header.catalogId === "string"
    && header.catalogId.length > 0
    && typeof createdAt === "number"
    && Number.isSafeInteger(createdAt)
    && createdAt >= 0;
}

/**
 * Compatibility entry point. A non-empty gap requires a complete source
 * identity; raw +1 parent adjacency remains legacy-compatible without a proof.
 */
export function classifyTransparentPromotionGaps(
  entries: readonly SessionLikeEntry[],
  blocks: ReadonlyMap<string, PromotionGapBlock>,
  children: readonly PromotionGapBlock[],
  identity?: PromotionGapSourceIdentity,
): PromotionGapResult {
  const projection = createRawEpochProjection(entries, identity ?? legacyIdentity(entries));
  return new PromotionGapIndexV1(projection).classify(blocks, children);
}

/** Revalidates only immutable raw-slot evidence; Session-owned bodies are never read. */
export function classifyTransparentPromotionGapsFromProjection(
  projection: RawEpochProjectionV1,
  blocks: ReadonlyMap<string, PromotionGapBlock>,
  children: readonly PromotionGapBlock[],
  options: PromotionGapVerificationOptions = {},
): PromotionGapResult {
  return new PromotionGapIndexV1(projection).classify(blocks, children, options);
}

/**
 * One revision-scoped immutable raw-slot index. The index is the production
 * verifier shared by planner, direct transition, pure replay, and BranchIndex.
 */
export class PromotionGapIndexV1 {
  readonly projection: RawEpochProjectionV1;
  /** A bounded replay verifier deliberately retains only declared proof slots. */
  readonly rawSlotCoverage: "full" | "bounded";
  private readonly slotByEntryId: ReadonlyMap<string, RawEpochSlotV1>;
  private readonly slotByOrdinal: ReadonlyMap<number, RawEpochSlotV1>;
  private readonly slotAtOrdinal?: (ordinal: number) => RawEpochSlotV1 | undefined;

  constructor(
    projection: RawEpochProjectionV1,
    options: PromotionGapIndexOptions = {},
  ) {
    this.projection = projection;
    const slots = options.slots ?? (Array.isArray(projection.rawSlots) ? projection.rawSlots : []);
    this.rawSlotCoverage = options.rawSlotCoverage ?? "full";
    this.slotByEntryId = new Map(slots.map((slot) => [slot.entryId, slot] as const));
    this.slotByOrdinal = new Map(slots.map((slot) => [slot.ordinal, slot] as const));
    this.slotAtOrdinal = options.slotAtOrdinal;
  }

  classify(
    blocks: ReadonlyMap<string, PromotionGapBlock>,
    children: readonly PromotionGapBlock[],
    options: PromotionGapVerificationOptions = {},
  ): PromotionGapResult {
    if (children.length < 2 || children.length - 1 > MAX_TRANSPARENT_PROMOTION_GAPS) {
      return { ok: false, pairIndex: 0, reason: "invalid-child-count" };
    }
    const { projection } = this;
    if (!projection.valid) return { ok: false, pairIndex: 0, reason: projection.invalidReason ?? "invalid-raw-projection" };
    const rawSlotLimit = options.rawSlotLimit ?? projection.rawSlots.length;
    if (!Number.isSafeInteger(rawSlotLimit) || rawSlotLimit < 0 || rawSlotLimit > projection.rawSlots.length) {
      return { ok: false, pairIndex: 0, reason: "invalid-raw-projection" };
    }
    const snapshotDigest = sourceSnapshotDigestForPrefix(projection, rawSlotLimit);

    const proofs: TransparentPromotionGapV1[] = [];
    for (let index = 1; index < children.length; index += 1) {
      const left = children[index - 1]!;
      const right = children[index]!;
      if (right.firstLeafOrdinal <= left.lastLeafOrdinal) {
        return { ok: false, pairIndex: index - 1, reason: "overlapping-or-reordered-children" };
      }
      const leftLeafEntryId = boundaryLeafEntryId(blocks, left, "last");
      const rightLeafEntryId = boundaryLeafEntryId(blocks, right, "first");
      const leftSlot = leftLeafEntryId ? this.slotForEntry(leftLeafEntryId, left.lastLeafOrdinal) : undefined;
      const rightSlot = rightLeafEntryId ? this.slotForEntry(rightLeafEntryId, right.firstLeafOrdinal) : undefined;
      if (!leftSlot || !rightSlot || !leftSlot.isRecordBody || !rightSlot.isRecordBody
        || leftSlot.ordinal > rawSlotLimit || rightSlot.ordinal > rawSlotLimit
        || leftSlot.ordinal !== left.lastLeafOrdinal || rightSlot.ordinal !== right.firstLeafOrdinal) {
        return { ok: false, pairIndex: index - 1, reason: "missing-or-mismatched-endpoint" };
      }
      const gap: RawEpochSlotV1[] = [];
      for (let ordinal = left.lastLeafOrdinal + 1; ordinal < right.firstLeafOrdinal; ordinal += 1) {
        const slot = this.slotAt(ordinal);
        if (!slot || ordinal > rawSlotLimit) return { ok: false, pairIndex: index - 1, reason: "missing-or-mismatched-endpoint" };
        options.onProofRawSlotVisit?.();
        gap.push(slot);
      }
      if (gap.length === 0) continue;
      if (!validIdentity(projection.identity)) return { ok: false, pairIndex: index - 1, reason: "invalid-source-identity" };
      if (gap.length > MAX_TRANSPARENT_PROMOTION_GAP_MESSAGES) {
        return { ok: false, pairIndex: index - 1, reason: "oversized-gap" };
      }
      if (gap.some((slot) => nonAiliNamedToolSlot(slot.body))) {
        return { ok: false, pairIndex: index - 1, reason: "non-aili-planning-message" };
      }
      if (gap.some((slot) => !slot.isRecordBody) || !transparentPlanningGap(gap, projection.identity)) {
        return { ok: false, pairIndex: index - 1, reason: "non-transparent-protocol" };
      }
      proofs.push({
        version: TRANSPARENT_PROMOTION_GAP_VERSION,
        leftChildBlockId: left.blockId,
        rightChildBlockId: right.blockId,
        leftLeafEntryId: leftSlot.entryId,
        rightLeafEntryId: rightSlot.entryId,
        messageCount: gap.length,
        gapDigest: transparentPromotionGapDigestFromSlots(gap, snapshotDigest),
        sourceSnapshotDigest: snapshotDigest,
      });
    }
    return { ok: true, proofs, projection };
  }

  private slotForEntry(entryId: string, ordinal: number): RawEpochSlotV1 | undefined {
    const slot = this.slotByEntryId.get(entryId) ?? this.slotAt(ordinal);
    return slot?.entryId === entryId ? slot : undefined;
  }

  private slotAt(ordinal: number): RawEpochSlotV1 | undefined {
    return this.slotByOrdinal.get(ordinal) ?? this.slotAtOrdinal?.(ordinal);
  }
}

/** Legacy testing helper; production proofs use the immutable projection function above. */
export function transparentPromotionGapDigest(entries: readonly SessionLikeEntry[], firstOrdinal: number): string {
  return digest({
    version: TRANSPARENT_PROMOTION_GAP_VERSION,
    slots: entries.map((entry, index) => ({ ordinal: firstOrdinal + index, entryId: entry.id, body: entry.message })),
  });
}

function transparentPromotionGapDigestFromSlots(slots: readonly RawEpochSlotV1[], sourceSnapshotDigest: string): string {
  return digest({
    version: TRANSPARENT_PROMOTION_GAP_VERSION,
    sourceSnapshotDigest,
    slots: slots.map(({ ordinal, entryId, body }) => ({ ordinal, entryId, body })),
  });
}

function transparentPlanningGap(slots: readonly RawEpochSlotV1[], identity: PromotionGapSourceIdentity): boolean {
  for (let index = 0; index < slots.length;) {
    const caller = slots[index]!;
    const call = soleAiliPlanningCall(caller.body);
    const result = slots[index + 1];
    if (!call || !result || !isRecord(result.body) || result.body.role !== "toolResult"
      || result.body.toolCallId !== call.id || result.body.toolName !== call.name
      || !verifyAiliPlanningResult(result.body, call, identity)) return false;
    index += 2;
  }
  return true;
}

function soleAiliPlanningCall(body: unknown): { id: string; name: "aili_compact_status" | "aili_compact" } | undefined {
  if (!isRecord(body) || body.role !== "assistant") return undefined;
  const calls: unknown[] = [];
  if (Array.isArray(body.toolCalls)) calls.push(...body.toolCalls);
  if (Array.isArray(body.content)) {
    for (const part of body.content) if (isRecord(part) && part.type === "toolCall") calls.push(part);
  }
  if (calls.length !== 1 || !isRecord(calls[0])) return undefined;
  const call = calls[0];
  return typeof call.id === "string" && AILI_PLANNING_TOOLS.has(call.name as string)
    ? { id: call.id, name: call.name as "aili_compact_status" | "aili_compact" }
    : undefined;
}

function nonAiliNamedToolSlot(body: unknown): boolean {
  if (!isRecord(body)) return false;
  if (body.role === "toolResult") return typeof body.toolName === "string" && !AILI_PLANNING_TOOLS.has(body.toolName);
  if (body.role !== "assistant") return false;
  const calls = [
    ...(Array.isArray(body.toolCalls) ? body.toolCalls : []),
    ...(Array.isArray(body.content) ? body.content.filter((part) => isRecord(part) && part.type === "toolCall") : []),
  ];
  return calls.some((call) => isRecord(call) && typeof call.name === "string" && !AILI_PLANNING_TOOLS.has(call.name));
}

function verifyAiliPlanningResult(
  body: Record<string, unknown>,
  call: { id: string; name: "aili_compact_status" | "aili_compact" },
  identity: PromotionGapSourceIdentity,
): boolean {
  const envelope = extractEnvelope(body);
  if (!envelope || !isRecord(envelope.attestation)) return false;
  const attestation = envelope.attestation;
  const keys = Object.keys(attestation).sort();
  const hasTransaction = Object.prototype.hasOwnProperty.call(envelope, "transaction");
  const expectedKeys = [
    "branchLeafId", "epochId", "implementationId", "outcome", "owner", "resultDigest", "sessionId", "toolCallId", "toolName", "version",
    ...(hasTransaction ? ["transactionDigest", "transactionId"] : []),
  ].sort();
  if (canonicalJson(keys) !== canonicalJson(expectedKeys)
    || attestation.version !== AILI_HANDLER_ATTESTATION_VERSION
    || attestation.owner !== AILI_HANDLER_OWNER
    || attestation.toolName !== call.name
    || attestation.toolCallId !== call.id
    || attestation.sessionId !== identity.sessionId
    || attestation.branchLeafId !== identity.branchLeafId
    || attestation.epochId !== identity.epochId
    || attestation.implementationId !== AILI_HANDLER_IMPLEMENTATION_ID
    || (attestation.outcome !== "success" && attestation.outcome !== "rejected")
    || typeof attestation.resultDigest !== "string"
    || !HASH_PATTERN.test(attestation.resultDigest)
    || attestation.resultDigest !== digest({ result: envelope.result, transaction: hasTransaction ? envelope.transaction : null })) return false;

  if (call.name === "aili_compact_status") return attestation.outcome === "success" && !hasTransaction;
  if (attestation.outcome === "rejected") return !hasTransaction;
  return hasTransaction
    && isAiliPlanningV3Transaction(envelope.transaction, call.id, identity)
    && attestation.transactionId === call.id
    && typeof attestation.transactionDigest === "string"
    && HASH_PATTERN.test(attestation.transactionDigest)
    && attestation.transactionDigest === digest(envelope.transaction);
}

function extractEnvelope(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = body.ailiCompact;
  if (isEnvelope(direct)) return direct;
  const values: unknown[] = [];
  if (typeof body.content === "string") values.push(body.content);
  if (Array.isArray(body.content)) {
    for (const part of body.content) {
      if (isRecord(part) && typeof part.text === "string") values.push(part.text);
      else if (typeof part === "string") values.push(part);
    }
  }
  for (const value of values) {
    if (typeof value !== "string") continue;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isEnvelope(parsed)) return parsed;
    } catch {
      // A plain tool result is intentionally non-transparent.
    }
  }
  return undefined;
}

function isEnvelope(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = Object.prototype.hasOwnProperty.call(value, "transaction")
    ? ["attestation", "result", "transaction"]
    : ["attestation", "result"];
  return canonicalJson(keys) === canonicalJson(expected.sort());
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());
}

function transactionId(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.header) && typeof value.header.txId === "string" ? value.header.txId : undefined;
}

function sourceSnapshotDigest(
  identity: PromotionGapSourceIdentity,
  rawPrefixDigest: string,
  rawSlotCount: number,
): string {
  return digest({
    version: RAW_EPOCH_PROJECTION_VERSION,
    identity,
    rawSlotCount,
    rawPrefixDigest,
  });
}

function sourceSnapshotDigestForPrefix(projection: RawEpochProjectionV1, rawSlotLimit: number): string {
  const rawPrefixDigest = projection.rawPrefixDigests.at(rawSlotLimit);
  return rawPrefixDigest === undefined || !HASH_PATTERN.test(rawPrefixDigest)
    ? ""
    : sourceSnapshotDigest(projection.identity, rawPrefixDigest, rawSlotLimit);
}

function boundaryLeafEntryId(
  blocks: ReadonlyMap<string, PromotionGapBlock>,
  block: PromotionGapBlock,
  side: "first" | "last",
  visiting = new Set<string>(),
): string | undefined {
  if (visiting.has(block.blockId)) return undefined;
  if (block.source.kind === "messages") return side === "first" ? block.source.entryIds[0] : block.source.entryIds.at(-1);
  const childId = side === "first" ? block.source.childBlockIds[0] : block.source.childBlockIds.at(-1);
  const child = childId ? blocks.get(childId) : undefined;
  if (!child) return undefined;
  visiting.add(block.blockId);
  const result = boundaryLeafEntryId(blocks, child, side, visiting);
  visiting.delete(block.blockId);
  return result;
}

function validIdentity(value: PromotionGapSourceIdentity): boolean {
  return [value.sessionId, value.branchLeafId, value.epochId, value.revision]
    .every((part) => typeof part === "string" && part.length > 0 && part.length <= 256);
}

function legacyIdentity(entries: readonly SessionLikeEntry[]): PromotionGapSourceIdentity {
  return {
    sessionId: "legacy",
    branchLeafId: "legacy",
    epochId: "legacy",
    revision: digest(entries.map((entry) => entry.type === "message" ? { id: entry.id, message: entry.message } : entry.id)),
  };
}

function immutableClone<T>(value: T): T {
  const clone = structuredClone(value);
  return deepFreeze(clone);
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}
