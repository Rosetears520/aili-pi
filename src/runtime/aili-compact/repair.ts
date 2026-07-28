import {
  AILI_COMPACT_ENTRY,
  canonicalJson,
  digest,
  isCompactTransaction,
  isRecord,
  sourceDigest,
  type CompactBlock,
  type SessionLikeEntry,
} from "./contracts.js";

export const AILI_COMPACT_REPAIR_SCHEMA = "aili.compact.repair.v1" as const;

const MAX_EVIDENCE_PER_REPAIR = 16;
const MAX_SOURCE_IDS_PER_EVIDENCE = 256;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BRANCH_ID_PATTERN = /^br_[0-9a-f]{64}$/;
const REPAIR_ID_PATTERN = /^rpr_[0-9a-f]{64}$/;

const REPAIR_KEYS = ["branchId", "epochId", "evidence", "id", "type"] as const;
const EVIDENCE_KEYS = [
  "blockId",
  "evidenceId",
  "gcEntryId",
  "gcReplayOrdinal",
  "laterStateDigest",
  "lineageDigest",
  "sourceDigest",
  "sourceEntryIds",
] as const;

export interface RepairEvidence {
  evidenceId: string;
  blockId: string;
  sourceEntryIds: string[];
  sourceDigest: string;
  gcEntryId: string;
  gcReplayOrdinal: number;
  lineageDigest: string;
  laterStateDigest: string;
}

export interface RepairEntry {
  type: typeof AILI_COMPACT_REPAIR_SCHEMA;
  id: string;
  branchId: string;
  epochId: string;
  evidence: RepairEvidence[];
}

export type RepairDisposition =
  | "eligible"
  | "blockedByParent"
  | "digestMismatch"
  | "explicitUserState"
  | "oldEpoch"
  | "ambiguousLineage"
  | "otherIneligible";

export type RepairLaterState =
  | "none"
  | "decompress"
  | "restore-all"
  | "recompress"
  | "nested-replacement"
  | "checkpoint"
  | "missing"
  | "ambiguous";

/**
 * Replay-owned facts which are not carried by the legacy block itself. The
 * caller derives these from the selected Pi branch; none of them is trusted
 * when a persisted repair is replayed because planning is repeated freshly.
 */
export interface LegacyRepairCandidate {
  blockId: string;
  blockReplayOrdinal: number;
  gcEntryId: string;
  gcReplayOrdinal: number;
  laterState?: RepairLaterState;
}

export interface RepairPlanningInput {
  /** Ordered, stable IDs making up the selected branch before repair entries. */
  branchSourceEntryIds: readonly string[];
  /** Deterministic root epoch or the exact latest persisted CompactionEntry ID. */
  epochId: string;
  entries: readonly SessionLikeEntry[];
  blocks: ReadonlyMap<string, CompactBlock>;
  candidates: readonly LegacyRepairCandidate[];
}

export interface RepairCandidateResult {
  candidate: LegacyRepairCandidate;
  disposition: RepairDisposition;
  evidence?: RepairEvidence;
}

export interface RepairPlan {
  branchId: string;
  epochId: string;
  candidates: readonly RepairCandidateResult[];
  batches: readonly RepairEntry[];
  counts: Readonly<Record<RepairDisposition, number>>;
}

export type RepairReplayFailureCode =
  | "invalid-entry"
  | "id-content-mismatch"
  | "branch-mismatch"
  | "epoch-mismatch"
  | "stale-batch"
  | "projection-overlap";

export type RepairReplayResult =
  | {
    ok: true;
    idempotent: boolean;
    entry: RepairEntry;
    blocks: ReadonlyMap<string, CompactBlock>;
    committed: ReadonlyMap<string, RepairEntry>;
  }
  | {
    ok: false;
    code: RepairReplayFailureCode;
    blocks: ReadonlyMap<string, CompactBlock>;
    committed: ReadonlyMap<string, RepairEntry>;
  };

export interface RepairReplayInput extends RepairPlanningInput {
  entry: unknown;
  committed?: ReadonlyMap<string, RepairEntry>;
}

type CandidateEvaluation = RepairCandidateResult & {
  firstSourceReplayOrdinal: number;
  blockReplayOrdinal: number;
};

export function canonicalBranchId(orderedSourceEntryIds: readonly string[]): string {
  return `br_${digest([...orderedSourceEntryIds])}`;
}

/** Repair envelopes are metadata, not source entries in branch identity. */
export function repairBranchSourceEntryIds(entries: readonly SessionLikeEntry[]): string[] {
  return entries
    .filter((entry) => !(entry.type === "custom" && entry.customType === AILI_COMPACT_ENTRY && parseRepairEntry(entry.data)))
    .map((entry) => entry.id);
}

/** Discovers exact legacy create/GC provenance from one selected branch. */
export function discoverLegacyRepairCandidates(
  entries: readonly SessionLikeEntry[],
  blocks: ReadonlyMap<string, CompactBlock>,
): LegacyRepairCandidate[] {
  const candidates: LegacyRepairCandidate[] = [];
  for (const block of blocks.values()) {
    if (block.kind !== "semantic" || block.active || block.deactivationReason !== "gc") continue;
    let blockReplayOrdinal = -1;
    let gcReplayOrdinal = -1;
    let gcEntryId = "";
    for (const [ordinal, entry] of entries.entries()) {
      const transaction = compactTransactionFromEntry(entry);
      if (!transaction) continue;
      if (blockReplayOrdinal < 0 && transaction.blocks?.some((candidate) => candidate.id === block.id)) blockReplayOrdinal = ordinal;
      if (transaction.lifecycleUpdates?.some((update) => update.blockId === block.id
        && update.active === false && update.deactivationReason === "gc")) {
        gcReplayOrdinal = ordinal;
        gcEntryId = entry.id;
      }
    }
    if (blockReplayOrdinal >= 0 && gcReplayOrdinal > blockReplayOrdinal) {
      candidates.push({ blockId: block.id, blockReplayOrdinal, gcEntryId, gcReplayOrdinal });
    }
  }
  return candidates;
}

export function canonicalRootEpochId(sessionId: string, rootBranchPrefixEntryIds: readonly string[]): string {
  return `root_${digest({
    rootBranchPrefix: [...rootBranchPrefixEntryIds],
    schema: AILI_COMPACT_REPAIR_SCHEMA,
    sessionId,
  })}`;
}

export function canonicalRepairEvidenceId(
  branchId: string,
  epochId: string,
  evidence: Omit<RepairEvidence, "evidenceId">,
): string {
  return digest({
    blockId: evidence.blockId,
    branchId,
    epochId,
    gcEntryId: evidence.gcEntryId,
    gcReplayOrdinal: evidence.gcReplayOrdinal,
    laterStateDigest: evidence.laterStateDigest,
    lineageDigest: evidence.lineageDigest,
    schema: AILI_COMPACT_REPAIR_SCHEMA,
    sourceDigest: evidence.sourceDigest,
    sourceEntryIds: [...evidence.sourceEntryIds],
  });
}

export function canonicalRepairTransactionId(
  branchId: string,
  epochId: string,
  orderedEvidenceIds: readonly string[],
): string {
  return `rpr_${digest({
    branchId,
    epochId,
    evidenceIds: [...orderedEvidenceIds],
    schema: AILI_COMPACT_REPAIR_SCHEMA,
  })}`;
}

/** Strict closed-shape reader. Snapshot-dependent ordering is checked on replay. */
export function parseRepairEntry(value: unknown): RepairEntry | undefined {
  if (!isRecord(value) || !hasExactKeys(value, REPAIR_KEYS)) return undefined;
  if (value.type !== AILI_COMPACT_REPAIR_SCHEMA
    || !isString(value.id, 80) || !REPAIR_ID_PATTERN.test(value.id)
    || !isString(value.branchId, 80) || !BRANCH_ID_PATTERN.test(value.branchId)
    || !isString(value.epochId, 256)
    || !Array.isArray(value.evidence)
    || value.evidence.length < 1
    || value.evidence.length > MAX_EVIDENCE_PER_REPAIR) return undefined;

  const evidence: RepairEvidence[] = [];
  const evidenceIds = new Set<string>();
  const blockIds = new Set<string>();
  const coveredSourceIds = new Set<string>();
  for (const rawEvidence of value.evidence) {
    const parsed = parseEvidence(rawEvidence, value.branchId, value.epochId);
    if (!parsed || evidenceIds.has(parsed.evidenceId) || blockIds.has(parsed.blockId)) return undefined;
    if (parsed.sourceEntryIds.some((sourceId) => coveredSourceIds.has(sourceId))) return undefined;
    evidenceIds.add(parsed.evidenceId);
    blockIds.add(parsed.blockId);
    parsed.sourceEntryIds.forEach((sourceId) => coveredSourceIds.add(sourceId));
    evidence.push(parsed);
  }

  const expectedId = canonicalRepairTransactionId(value.branchId, value.epochId, evidence.map((item) => item.evidenceId));
  if (value.id !== expectedId) return undefined;
  return {
    type: AILI_COMPACT_REPAIR_SCHEMA,
    id: value.id,
    branchId: value.branchId,
    epochId: value.epochId,
    evidence,
  };
}

export function isRepairEntry(value: unknown): value is RepairEntry {
  return parseRepairEntry(value) !== undefined;
}

/**
 * Partitions every candidate before batching. Iteration order never affects
 * evidence order or identity.
 */
export function planLegacyRepairs(input: RepairPlanningInput): RepairPlan {
  const branchId = canonicalBranchId(input.branchSourceEntryIds);
  const context = buildEvaluationContext(input);
  const duplicateCandidates = duplicateValues(input.candidates.map((candidate) => candidate.blockId));
  const evaluated = input.candidates.map((candidate): CandidateEvaluation => evaluateCandidate(
    candidate,
    input,
    context,
    branchId,
    duplicateCandidates.has(candidate.blockId),
  ));

  evaluated.sort(compareCandidateEvaluation);
  const eligible = evaluated.filter((item): item is CandidateEvaluation & { evidence: RepairEvidence } =>
    item.disposition === "eligible" && item.evidence !== undefined);
  const batches: RepairEntry[] = [];
  for (let offset = 0; offset < eligible.length; offset += MAX_EVIDENCE_PER_REPAIR) {
    const evidence = eligible.slice(offset, offset + MAX_EVIDENCE_PER_REPAIR).map((item) => cloneEvidence(item.evidence));
    batches.push({
      type: AILI_COMPACT_REPAIR_SCHEMA,
      id: canonicalRepairTransactionId(branchId, input.epochId, evidence.map((item) => item.evidenceId)),
      branchId,
      epochId: input.epochId,
      evidence,
    });
  }

  const counts = emptyDispositionCounts();
  for (const item of evaluated) counts[item.disposition] += 1;
  return {
    branchId,
    epochId: input.epochId,
    candidates: evaluated.map(({ firstSourceReplayOrdinal: _first, blockReplayOrdinal: _block, ...item }) => ({
      candidate: { ...item.candidate },
      disposition: item.disposition,
      ...(item.evidence ? { evidence: cloneEvidence(item.evidence) } : {}),
    })),
    batches,
    counts,
  };
}

/**
 * Revalidates a whole persisted batch against fresh replay state, reduces into
 * temporary maps, and publishes either every activation or none.
 */
export function replayRepairEntry(input: RepairReplayInput): RepairReplayResult {
  const committed = input.committed ?? new Map<string, RepairEntry>();
  const expectedBranchId = canonicalBranchId(input.branchSourceEntryIds);
  const rawId = isRecord(input.entry) && typeof input.entry.id === "string" ? input.entry.id : undefined;
  if (rawId !== undefined) {
    const prior = committed.get(rawId);
    if (prior) {
      if (digest(prior) !== digest(input.entry)) return failure("id-content-mismatch", input.blocks, committed);
      const duplicate = parseRepairEntry(input.entry);
      if (!duplicate || !parseRepairEntry(prior)) return failure("invalid-entry", input.blocks, committed);
      if (duplicate.branchId !== expectedBranchId) return failure("branch-mismatch", input.blocks, committed);
      if (duplicate.epochId !== input.epochId) return failure("epoch-mismatch", input.blocks, committed);
      return { ok: true, idempotent: true, entry: cloneEntry(prior), blocks: input.blocks, committed };
    }
  }

  const entry = parseRepairEntry(input.entry);
  if (!entry) return failure("invalid-entry", input.blocks, committed);
  if (entry.branchId !== expectedBranchId) return failure("branch-mismatch", input.blocks, committed);
  if (entry.epochId !== input.epochId) return failure("epoch-mismatch", input.blocks, committed);

  const freshPlan = planLegacyRepairs(input);
  const expected = freshPlan.batches.find((batch) => batch.id === entry.id);
  if (!expected || canonicalJson(expected) !== canonicalJson(entry)) {
    return failure("stale-batch", input.blocks, committed);
  }

  const blocks = new Map<string, CompactBlock>();
  for (const [id, block] of input.blocks) blocks.set(id, cloneBlock(block));
  for (const item of entry.evidence) {
    const block = blocks.get(item.blockId);
    if (!block || block.active || block.queryOnly || block.kind !== "semantic"
      || block.epochId !== input.epochId || block.deactivationReason !== "gc") {
      return failure("stale-batch", input.blocks, committed);
    }
    const { deactivationReason: _reason, ...reactivated } = block;
    blocks.set(item.blockId, { ...reactivated, active: true });
  }

  if (hasActiveProjectionOverlap(blocks, input.epochId)) {
    return failure("projection-overlap", input.blocks, committed);
  }
  const nextCommitted = new Map(committed);
  nextCommitted.set(entry.id, cloneEntry(entry));
  return {
    ok: true,
    idempotent: false,
    entry: cloneEntry(entry),
    blocks,
    committed: nextCommitted,
  };
}

function parseEvidence(value: unknown, branchId: string, epochId: string): RepairEvidence | undefined {
  if (!isRecord(value) || !hasExactKeys(value, EVIDENCE_KEYS)) return undefined;
  if (!isString(value.evidenceId, 64) || !HASH_PATTERN.test(value.evidenceId)
    || !isString(value.blockId, 256)
    || !isStringArray(value.sourceEntryIds, MAX_SOURCE_IDS_PER_EVIDENCE, false)
    || !isString(value.sourceDigest, 64) || !HASH_PATTERN.test(value.sourceDigest)
    || !isString(value.gcEntryId, 256)
    || !isNonNegativeSafeInteger(value.gcReplayOrdinal)
    || !isString(value.lineageDigest, 64) || !HASH_PATTERN.test(value.lineageDigest)
    || !isString(value.laterStateDigest, 64) || !HASH_PATTERN.test(value.laterStateDigest)) return undefined;
  const evidenceWithoutId: Omit<RepairEvidence, "evidenceId"> = {
    blockId: value.blockId,
    sourceEntryIds: [...value.sourceEntryIds],
    sourceDigest: value.sourceDigest,
    gcEntryId: value.gcEntryId,
    gcReplayOrdinal: value.gcReplayOrdinal,
    lineageDigest: value.lineageDigest,
    laterStateDigest: value.laterStateDigest,
  };
  if (value.evidenceId !== canonicalRepairEvidenceId(branchId, epochId, evidenceWithoutId)) return undefined;
  return { evidenceId: value.evidenceId, ...evidenceWithoutId };
}

function evaluateCandidate(
  candidate: LegacyRepairCandidate,
  input: RepairPlanningInput,
  context: EvaluationContext,
  branchId: string,
  duplicateCandidate: boolean,
): CandidateEvaluation {
  const block = input.blocks.get(candidate.blockId);
  const firstSourceReplayOrdinal = block
    ? firstSourceOrdinal(block.sourceEntryIds, context.entryOrdinals)
    : Number.MAX_SAFE_INTEGER;
  const base = {
    candidate: { ...candidate },
    firstSourceReplayOrdinal,
    blockReplayOrdinal: candidate.blockReplayOrdinal,
  };
  if (!block) return { ...base, disposition: "otherIneligible" };

  const activeOverlap = overlappingBlocks(block, input.blocks)
    .some((other) => other.active && !other.queryOnly && other.epochId === input.epochId);
  if (activeOverlap) return { ...base, disposition: "blockedByParent" };

  const actualSourceDigest = sourceDigest(input.entries, block.sourceEntryIds);
  if (block.sourceDigest !== actualSourceDigest) return { ...base, disposition: "digestMismatch" };

  const laterState = candidate.laterState ?? "none";
  if (!isRepairLaterState(laterState)) return { ...base, disposition: "otherIneligible" };
  if (laterState === "decompress" || laterState === "restore-all" || laterState === "recompress"
    || block.deactivationReason === "decompress" || block.deactivationReason === "restore-all"
    || block.deactivationReason === "recompress") {
    return { ...base, disposition: "explicitUserState" };
  }

  if (laterState === "checkpoint" || block.epochId !== input.epochId || block.queryOnly
    || block.deactivationReason === "epoch") return { ...base, disposition: "oldEpoch" };

  const lineage = analyzeLineage(block, input.blocks);
  const inactiveUnrelatedOverlap = overlappingBlocks(block, input.blocks)
    .some((other) => !isDirectLineage(block, other, input.blocks));
  const isNestedBlock = [...input.blocks.values()].some((other) => (other.childBlockIds ?? []).includes(block.id));
  if (duplicateCandidate || laterState === "nested-replacement" || laterState === "ambiguous"
    || block.deactivationReason === "nested" || isNestedBlock || !lineage.valid || inactiveUnrelatedOverlap) {
    return { ...base, disposition: "ambiguousLineage" };
  }

  if (block.kind !== "semantic" || block.active || block.deactivationReason !== "gc"
    || laterState === "missing"
    || !isValidCandidateProvenance(candidate, block, input.entries)
    || !context.validBranchSourceIds
    || !hasOrderedCompleteSources(block, input.entries, context.branchSourceIds, context.entryOrdinals)
    || !hasValidProtocolAtoms(input.entries, block.sourceEntryIds)) {
    return { ...base, disposition: "otherIneligible" };
  }

  const evidenceWithoutId: Omit<RepairEvidence, "evidenceId"> = {
    blockId: block.id,
    sourceEntryIds: [...block.sourceEntryIds],
    sourceDigest: block.sourceDigest,
    gcEntryId: candidate.gcEntryId,
    gcReplayOrdinal: candidate.gcReplayOrdinal,
    lineageDigest: lineage.digest,
    laterStateDigest: digest({ blockId: block.id, laterState }),
  };
  const evidence: RepairEvidence = {
    evidenceId: canonicalRepairEvidenceId(branchId, input.epochId, evidenceWithoutId),
    ...evidenceWithoutId,
  };
  return { ...base, disposition: "eligible", evidence };
}

interface EvaluationContext {
  branchSourceIds: ReadonlySet<string>;
  entryOrdinals: ReadonlyMap<string, number>;
  validBranchSourceIds: boolean;
}

function buildEvaluationContext(input: RepairPlanningInput): EvaluationContext {
  const entryOrdinals = new Map<string, number>();
  let duplicateEntry = false;
  input.entries.forEach((entry, ordinal) => {
    if (entryOrdinals.has(entry.id)) duplicateEntry = true;
    else entryOrdinals.set(entry.id, ordinal);
  });
  const branchSourceIds = new Set(input.branchSourceEntryIds);
  const validBranchSourceIds = !duplicateEntry
    && branchSourceIds.size === input.branchSourceEntryIds.length
    && input.branchSourceEntryIds.every((id) => isString(id, 256) && entryOrdinals.has(id))
    && isStrictlyOrdered(input.branchSourceEntryIds.map((id) => entryOrdinals.get(id)!));
  return { branchSourceIds, entryOrdinals, validBranchSourceIds };
}

function isValidCandidateProvenance(
  candidate: LegacyRepairCandidate,
  block: CompactBlock,
  entries: readonly SessionLikeEntry[],
): boolean {
  if (!isNonNegativeSafeInteger(candidate.blockReplayOrdinal)) return false;
  if (!isNonNegativeSafeInteger(candidate.gcReplayOrdinal)
    || candidate.blockReplayOrdinal >= candidate.gcReplayOrdinal
    || candidate.gcReplayOrdinal >= entries.length
    || entries[candidate.gcReplayOrdinal]?.id !== candidate.gcEntryId) return false;
  const blockTransaction = compactTransactionFromEntry(entries[candidate.blockReplayOrdinal]);
  const gcTransaction = compactTransactionFromEntry(entries[candidate.gcReplayOrdinal]);
  return blockTransaction?.blocks?.some((created) => created.id === block.id) === true
    && gcTransaction?.epochId === block.epochId
    && gcTransaction.lifecycleUpdates?.some((update) => update.blockId === block.id
      && update.active === false && update.deactivationReason === "gc") === true;
}

function compactTransactionFromEntry(entry: SessionLikeEntry | undefined) {
  if (!entry) return undefined;
  if (entry.type === "custom" && entry.customType === AILI_COMPACT_ENTRY && isCompactTransaction(entry.data)) return entry.data;
  if (entry.type !== "message" || !isRecord(entry.message) || !isRecord(entry.message.details)) return undefined;
  const candidate = entry.message.details.contextTx;
  return isCompactTransaction(candidate) ? candidate : undefined;
}

function hasOrderedCompleteSources(
  block: CompactBlock,
  entries: readonly SessionLikeEntry[],
  branchSourceIds: ReadonlySet<string>,
  ordinals: ReadonlyMap<string, number>,
): boolean {
  if (block.sourceEntryIds.length === 0 || new Set(block.sourceEntryIds).size !== block.sourceEntryIds.length) return false;
  if (block.sourceEntryIds.some((id) => !branchSourceIds.has(id))) return false;
  const sourceOrdinals = block.sourceEntryIds.map((id) => ordinals.get(id));
  if (sourceOrdinals.some((ordinal) => ordinal === undefined)) return false;
  if (!isStrictlyOrdered(sourceOrdinals as number[])) return false;
  return block.sourceEntryIds.every((id) => entries[ordinals.get(id)!]?.type === "message"
    && isRecord(entries[ordinals.get(id)!]?.message));
}

function firstSourceOrdinal(sourceIds: readonly string[], ordinals: ReadonlyMap<string, number>): number {
  if (sourceIds.length === 0) return Number.MAX_SAFE_INTEGER;
  return ordinals.get(sourceIds[0]!) ?? Number.MAX_SAFE_INTEGER;
}

function hasValidProtocolAtoms(entries: readonly SessionLikeEntry[], sourceEntryIds: readonly string[]): boolean {
  const selected = new Set(sourceEntryIds);
  return sourceEntryIds.every((sourceId) => {
    const entry = entries.find((candidate) => candidate.id === sourceId);
    if (!entry || entry.type !== "message" || !isRecord(entry.message)) return false;
    if (!isProtocolMessage(entry.message)) return true;
    return isCompleteProtocolAtom(entries, selected, entry);
  });
}

function isCompleteProtocolAtom(
  entries: readonly SessionLikeEntry[],
  selected: ReadonlySet<string>,
  entry: SessionLikeEntry,
): boolean {
  if (!isRecord(entry.message)) return false;
  if (entry.message.role === "assistant") {
    const callIds = toolCallIds(entry.message);
    return callIds.length > 0 && callIds.every((callId) => {
      const results = entries.filter((candidate) => candidate.type === "message"
        && isRecord(candidate.message)
        && candidate.message.role === "toolResult"
        && candidate.message.toolCallId === callId);
      return results.length > 0 && results.every((result) => selected.has(result.id));
    });
  }
  if (entry.message.role !== "toolResult" || typeof entry.message.toolCallId !== "string") return false;
  const resultToolCallId = entry.message.toolCallId;
  const callers = entries.filter((candidate) => candidate.type === "message"
    && isRecord(candidate.message)
    && candidate.message.role === "assistant"
    && toolCallIds(candidate.message).includes(resultToolCallId));
  return callers.length === 1 && selected.has(callers[0]!.id)
    && isCompleteProtocolAtom(entries, selected, callers[0]!);
}

function isProtocolMessage(message: Record<string, unknown>): boolean {
  return message.role === "toolResult" || toolCallIds(message).length > 0;
}

function toolCallIds(message: Record<string, unknown>): string[] {
  const ids: string[] = [];
  if (Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) if (isRecord(call) && typeof call.id === "string") ids.push(call.id);
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (isRecord(part) && (part.type === "toolCall" || part.type === "tool_use") && typeof part.id === "string") ids.push(part.id);
    }
  }
  return [...new Set(ids)];
}

function overlappingBlocks(block: CompactBlock, blocks: ReadonlyMap<string, CompactBlock>): CompactBlock[] {
  const sources = new Set(block.sourceEntryIds);
  return [...blocks.values()].filter((other) => other.id !== block.id
    && other.sourceEntryIds.some((sourceId) => sources.has(sourceId)));
}

function isDirectLineage(
  block: CompactBlock,
  other: CompactBlock,
  _blocks: ReadonlyMap<string, CompactBlock>,
): boolean {
  return (block.childBlockIds ?? []).includes(other.id) || (other.childBlockIds ?? []).includes(block.id);
}

function analyzeLineage(block: CompactBlock, blocks: ReadonlyMap<string, CompactBlock>): { valid: boolean; digest: string } {
  const parents = new Map<string, string[]>();
  for (const candidate of blocks.values()) {
    const children = candidate.childBlockIds ?? [];
    for (const childId of children) {
      const list = parents.get(childId) ?? [];
      list.push(candidate.id);
      parents.set(childId, list);
    }
  }

  const related = new Set<string>([block.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of blocks.values()) {
      const candidateRelated = related.has(candidate.id);
      const touchesRelated = (candidate.childBlockIds ?? []).some((id) => related.has(id))
        || (parents.get(candidate.id) ?? []).some((id) => related.has(id))
        || candidate.sourceEntryIds.some((sourceId) => [...related].some((id) => blocks.get(id)?.sourceEntryIds.includes(sourceId)));
      if (!candidateRelated && touchesRelated) {
        related.add(candidate.id);
        changed = true;
      }
    }
  }

  let valid = true;
  for (const id of related) {
    const candidate = blocks.get(id)!;
    const children = candidate.childBlockIds ?? [];
    if (new Set(children).size !== children.length) valid = false;
    for (const childId of children) {
      const child = blocks.get(childId);
      if (!child || childId === candidate.id
        || child.sourceEntryIds.some((sourceId) => !candidate.sourceEntryIds.includes(sourceId))) valid = false;
    }
    const parentIds = parents.get(id) ?? [];
    if (new Set(parentIds).size !== parentIds.length || parentIds.length > 1) valid = false;
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) { valid = false; return; }
    if (visited.has(id) || !related.has(id)) return;
    visiting.add(id);
    for (const childId of blocks.get(id)?.childBlockIds ?? []) visit(childId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of related) visit(id);

  const facts = [...related].sort().map((id) => {
    const item = blocks.get(id)!;
    return {
      active: item.active,
      childBlockIds: [...(item.childBlockIds ?? [])].sort(),
      deactivationReason: item.deactivationReason ?? null,
      epochId: item.epochId,
      id: item.id,
      kind: item.kind,
      queryOnly: item.queryOnly === true,
      sourceEntryIds: [...item.sourceEntryIds],
    };
  });
  return { valid, digest: digest(facts) };
}

function hasActiveProjectionOverlap(blocks: ReadonlyMap<string, CompactBlock>, epochId: string): boolean {
  const covered = new Set<string>();
  for (const block of blocks.values()) {
    if (!block.active || block.queryOnly || block.epochId !== epochId || block.kind !== "semantic") continue;
    for (const sourceId of block.sourceEntryIds) {
      if (covered.has(sourceId)) return true;
      covered.add(sourceId);
    }
  }
  return false;
}

function compareCandidateEvaluation(left: CandidateEvaluation, right: CandidateEvaluation): number {
  return left.firstSourceReplayOrdinal - right.firstSourceReplayOrdinal
    || left.blockReplayOrdinal - right.blockReplayOrdinal
    || left.candidate.blockId.localeCompare(right.candidate.blockId);
}

function emptyDispositionCounts(): Record<RepairDisposition, number> {
  return {
    eligible: 0,
    blockedByParent: 0,
    digestMismatch: 0,
    explicitUserState: 0,
    oldEpoch: 0,
    ambiguousLineage: 0,
    otherIneligible: 0,
  };
}

function failure(
  code: RepairReplayFailureCode,
  blocks: ReadonlyMap<string, CompactBlock>,
  committed: ReadonlyMap<string, RepairEntry>,
): RepairReplayResult {
  return { ok: false, code, blocks, committed };
}

function cloneEvidence(evidence: RepairEvidence): RepairEvidence {
  return { ...evidence, sourceEntryIds: [...evidence.sourceEntryIds] };
}

function cloneEntry(entry: RepairEntry): RepairEntry {
  return { ...entry, evidence: entry.evidence.map(cloneEvidence) };
}

function cloneBlock(block: CompactBlock): CompactBlock {
  return {
    ...block,
    sourceEntryIds: [...block.sourceEntryIds],
    ...(block.childBlockIds ? { childBlockIds: [...block.childBlockIds] } : {}),
  };
}

function duplicateValues(values: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return duplicates;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isStringArray(value: unknown, maxItems: number, allowEmpty: boolean): value is string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.length <= maxItems
    && value.every((item) => isString(item, 256))
    && new Set(value).size === value.length;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRepairLaterState(value: unknown): value is RepairLaterState {
  return value === "none" || value === "decompress" || value === "restore-all" || value === "recompress"
    || value === "nested-replacement" || value === "checkpoint" || value === "missing" || value === "ambiguous";
}

function isStrictlyOrdered(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > values[index - 1]!);
}
