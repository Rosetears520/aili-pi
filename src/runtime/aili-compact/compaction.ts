import { AILI_COMPACT_SCHEMA, digest, isRecord, type CompactBlock, type CompactLifecycleUpdate, type CompactTransaction, type SessionLikeEntry } from "./contracts.js";

export type NativeCompactionReason = "manual" | "threshold" | "overflow";

export interface NativeCompactionDecisionInput {
  reason: NativeCompactionReason;
  /** Retained for callers recording diagnostics; cancellation is unconditional. */
  healthy?: boolean;
  contextTokens?: number;
  estimatedSavingTokens?: number;
  safeBudgetTokens?: number;
}

export type NativeCompactionDecisionReason =
  | "manual-aili-guidance"
  | "threshold-aili-owned"
  | "overflow-aili-owned";

/** The exact envelope consumable by Pi's `session_before_compact` hook. */
export interface NativeCompactionDecision {
  cancel: boolean;
  reason: NativeCompactionDecisionReason;
}

/**
 * AILI owns every native compaction trigger while it is enabled. The hook must
 * only cancel; recovery is performed independently through replayable AILI
 * control transactions before a provider request.
 */
export function decideNativeCompaction(input: NativeCompactionDecisionInput): NativeCompactionDecision {
  if (input.reason === "manual") return { cancel: true, reason: "manual-aili-guidance" };
  if (input.reason === "threshold") return { cancel: true, reason: "threshold-aili-owned" };
  return { cancel: true, reason: "overflow-aili-owned" };
}

function isTokenCount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const MAX_MAJOR_GC_SUMMARY_CHARS = 12_000;
const MAX_OLD_BLOCK_SUMMARY_CHARS = 3_000;

export interface MajorGcInput {
  entries: readonly SessionLikeEntry[];
  firstKeptEntryId: string;
  tokensBefore: number;
  previousSummary?: string;
  activeBlocks: readonly CompactBlock[];
  epochId?: string;
  maxPreviousSummaryChars?: number;
  maxBlockSummaryChars?: number;
  maxMergedSummaryChars?: number;
}

/**
 * Builds an extension-owned native compaction only when every discarded
 * message is already represented by a semantic compact block. This lets Pi
 * create a new epoch without a hidden provider summarization call.
 */
export function planMajorGc(input: MajorGcInput): {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details: { ailiCompact: { kind: "major-gc"; blockIds: string[] } };
} | undefined {
  const mergedLimit = validPositiveLimit(input.maxMergedSummaryChars, MAX_MAJOR_GC_SUMMARY_CHARS);
  const previousLimit = validPositiveLimit(input.maxPreviousSummaryChars, mergedLimit);
  const blockLimit = validPositiveLimit(input.maxBlockSummaryChars, MAX_OLD_BLOCK_SUMMARY_CHARS);
  if (!mergedLimit || mergedLimit > MAX_MAJOR_GC_SUMMARY_CHARS
    || !previousLimit || previousLimit > MAX_MAJOR_GC_SUMMARY_CHARS
    || !blockLimit || blockLimit > 10_000
    || !isTokenCount(input.tokensBefore) || !input.firstKeptEntryId) return undefined;
  if (input.previousSummary !== undefined && (typeof input.previousSummary !== "string" || input.previousSummary.length > previousLimit)) return undefined;

  const firstKeptIndex = input.entries.findIndex((entry) => entry.id === input.firstKeptEntryId);
  if (firstKeptIndex <= 0 || input.entries.some((entry, index) => index !== firstKeptIndex && entry.id === input.firstKeptEntryId)) return undefined;
  const discarded = input.entries.slice(0, firstKeptIndex);
  const allDiscardedMessages = discarded.filter((entry) => entry.type === "message");
  if (allDiscardedMessages.length === 0 || !hasSafeProtocolOrder(allDiscardedMessages)) return undefined;

  const semanticBlocks = input.activeBlocks.filter((block) => block.kind === "semantic" && block.active && !block.queryOnly);
  const redundantProtocolIds = committedCompactProtocolEntryIds(allDiscardedMessages, semanticBlocks);
  const discardedMessages = allDiscardedMessages.filter((entry) => !redundantProtocolIds.has(entry.id));
  if (discardedMessages.length === 0) return undefined;
  const discardedIds = new Set(discardedMessages.map((entry) => entry.id));
  const entryOrder = new Map(discardedMessages.map((entry, index) => [entry.id, index]));
  const sourceToBlock = new Map<string, CompactBlock>();
  for (const block of semanticBlocks) {
    if (block.generation !== "old" || (input.epochId !== undefined && block.epochId !== input.epochId)
      || block.summary.length > blockLimit || block.sourceEntryIds.length === 0) continue;
    const coveredDiscardedIds = block.sourceEntryIds.filter((sourceId) => entryOrder.has(sourceId));
    if (coveredDiscardedIds.length === 0) continue;
    if (coveredDiscardedIds.length !== block.sourceEntryIds.length) return undefined;
    const positions: number[] = [];
    for (const sourceId of coveredDiscardedIds) {
      const position = entryOrder.get(sourceId)!;
      if (sourceToBlock.has(sourceId)) return undefined;
      sourceToBlock.set(sourceId, block);
      positions.push(position);
    }
    positions.sort((left, right) => left - right);
    if (positions.some((position, index) => index > 0 && position !== positions[index - 1]! + 1)) return undefined;
  }
  if (discardedMessages.some((entry) => !sourceToBlock.has(entry.id))) return undefined;

  const included: CompactBlock[] = [];
  for (const entry of discardedMessages) {
    const block = sourceToBlock.get(entry.id)!;
    if (included.at(-1) !== block && !included.includes(block)) included.push(block);
  }
  if (included.some((block) => block.sourceEntryIds.some((id) => !discardedIds.has(id)))) return undefined;
  if (!protocolAtomsShareBlocks(discardedMessages, sourceToBlock)) return undefined;

  const sections = [
    "AILI Compact major GC (deterministic semantic-block merge)",
    ...(input.previousSummary ? [`Previous Pi summary:\n${input.previousSummary}`] : []),
    ...included.map((block) => `[${block.id}]\n${block.summary}`),
  ];
  const summary = sections.join("\n\n");
  if (summary.length > mergedLimit) return undefined;

  return {
    summary,
    firstKeptEntryId: input.firstKeptEntryId,
    tokensBefore: input.tokensBefore,
    details: { ailiCompact: { kind: "major-gc", blockIds: included.map((block) => block.id) } },
  };
}

export interface GenerationalGcInput {
  epochId: string;
  blocks: readonly CompactBlock[];
  promotionSurvivals: number;
  maxBlockAge: number;
  maxOldSummaryChars: number;
  transactionId?: string;
}

export interface GenerationalGcPlan {
  transaction: CompactTransaction;
  /** Bounded summaries for projection/major-GC; source summaries are untouched. */
  boundedSummaries: ReadonlyMap<string, string>;
}

/** Plans one deterministic, replayable lifecycle transaction without providers. */
export function planGenerationalGc(input: GenerationalGcInput): GenerationalGcPlan | undefined {
  if (!input.epochId || !isBoundedInteger(input.promotionSurvivals, 1, 100)
    || !isBoundedInteger(input.maxBlockAge, 1, 1_000)
    || !isBoundedInteger(input.maxOldSummaryChars, 256, 10_000)) return undefined;
  const current = input.blocks.filter((block) => block.epochId === input.epochId && !block.queryOnly);
  const byId = new Map<string, CompactBlock>();
  for (const block of current) {
    if (byId.has(block.id)) return undefined;
    byId.set(block.id, block);
  }
  const parentByChild = new Map<string, string>();
  for (const parent of current) {
    for (const childId of parent.childBlockIds ?? []) {
      const child = byId.get(childId);
      if (!child || childId === parent.id || parentByChild.has(childId)
        || child.sourceEntryIds.some((id) => !parent.sourceEntryIds.includes(id))) return undefined;
      parentByChild.set(childId, parent.id);
    }
  }
  for (const block of current) {
    const seen = new Set<string>([block.id]);
    let parentId = parentByChild.get(block.id);
    while (parentId !== undefined) {
      if (seen.has(parentId)) return undefined;
      seen.add(parentId);
      parentId = parentByChild.get(parentId);
    }
  }

  const updates: CompactLifecycleUpdate[] = [];
  const boundedSummaries = new Map<string, string>();
  for (const block of current) {
    if (!block.active) continue;
    const nested = parentByChild.has(block.id);
    const age = (block.age ?? 0) + 1;
    const survivedCount = (block.survivedCount ?? 0) + 1;
    const generation = block.generation === "old" || survivedCount >= input.promotionSurvivals ? "old" : "young";
    if (generation === "old") boundedSummaries.set(block.id, boundSummary(block.summary, input.maxOldSummaryChars));
    updates.push(nested
      ? { blockId: block.id, age, survivedCount, generation, active: false, deactivationReason: "nested" }
      : age >= input.maxBlockAge
        ? { blockId: block.id, age, survivedCount, generation, active: false, deactivationReason: "gc" }
        : { blockId: block.id, age, survivedCount, generation });
  }
  if (updates.length === 0) return undefined;
  const id = input.transactionId ?? `gc:${input.epochId}:${digest(updates).slice(0, 24)}`;
  if (!id || id.length > 256) return undefined;
  return {
    transaction: { schema: AILI_COMPACT_SCHEMA, id, kind: "control", epochId: input.epochId, lifecycleUpdates: updates },
    boundedSummaries,
  };
}

export interface EmergencyGcInput {
  epochId: string;
  blocks: readonly CompactBlock[];
  contextTokens?: number;
  contextWindow?: number;
  thresholdPercent: number;
  maxOldSummaryChars: number;
  transactionId?: string;
}

/**
 * Plans the ACP-style emergency pass independently of Pi compaction events.
 * It can only shorten active old-generation summaries and persists those
 * replacements through an append-only AILI lifecycle transaction.
 */
export function planEmergencyGc(input: EmergencyGcInput): CompactTransaction | undefined {
  if (!isTokenCount(input.contextTokens) || !isTokenCount(input.contextWindow) || input.contextWindow === 0
    || !isBoundedInteger(input.thresholdPercent, 90, 100)
    || !isBoundedInteger(input.maxOldSummaryChars, 256, 10_000)
    || (input.contextTokens / input.contextWindow) * 100 < input.thresholdPercent) return undefined;

  const updates: CompactLifecycleUpdate[] = [];
  for (const block of input.blocks) {
    if (!block.active || block.queryOnly || block.epochId !== input.epochId || block.generation !== "old") continue;
    const summary = boundSummary(block.summary, input.maxOldSummaryChars);
    if (summary.length < block.summary.length) updates.push({ blockId: block.id, summary });
  }
  if (updates.length === 0) return undefined;
  updates.sort((left, right) => left.blockId.localeCompare(right.blockId));
  const id = input.transactionId ?? `gc:emergency:${input.epochId}:${digest(updates).slice(0, 24)}`;
  if (!id || id.length > 256) return undefined;
  return { schema: AILI_COMPACT_SCHEMA, id, kind: "control", epochId: input.epochId, lifecycleUpdates: updates };
}

export interface CompletedCompactionEpochInput {
  cancelled: boolean;
  compactionEntry?: SessionLikeEntry;
  keptTailEntries?: readonly SessionLikeEntry[];
}

export interface ReconstructedCompactionEpoch {
  epochId: string;
  entries: readonly SessionLikeEntry[];
  sourceEntryIds: readonly string[];
}

/** Reconstructs exactly the persisted summary-plus-tail epoch; cancellation has no epoch. */
export function reconstructCompletedCompactionEpoch(input: CompletedCompactionEpochInput): ReconstructedCompactionEpoch | undefined {
  if (input.cancelled || !input.compactionEntry || input.compactionEntry.type !== "compaction" || !input.compactionEntry.id) return undefined;
  const tail = input.keptTailEntries ?? [];
  const ids = [input.compactionEntry.id, ...tail.map((entry) => entry.id)];
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length || tail.some((entry) => entry.type === "compaction")) return undefined;
  return { epochId: input.compactionEntry.id, entries: [input.compactionEntry, ...tail], sourceEntryIds: ids };
}

function validPositiveLimit(value: number | undefined, fallback?: number): number | undefined {
  const candidate = value ?? fallback;
  return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : undefined;
}

function isBoundedInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function boundSummary(summary: string, maxChars: number): string {
  if (summary.length <= maxChars) return summary;
  return maxChars === 1 ? "…" : `${summary.slice(0, maxChars - 1)}…`;
}

function committedCompactProtocolEntryIds(
  entries: readonly SessionLikeEntry[],
  semanticBlocks: readonly CompactBlock[],
): Set<string> {
  const activeIds = new Set(semanticBlocks.map((block) => block.id));
  const redundant = new Set<string>();
  for (const result of entries) {
    if (!isRecord(result.message)) continue;
    const message = result.message;
    if (message.role !== "toolResult" || message.toolName !== "aili_compact"
      || message.isError === true || typeof message.toolCallId !== "string"
      || !isRecord(message.details) || !isRecord(message.details.contextTx)
      || !Array.isArray(message.details.contextTx.blocks)
      || !message.details.contextTx.blocks.some((block) => isRecord(block) && typeof block.id === "string" && activeIds.has(block.id))) continue;
    const callers = entries.filter((entry) => isRecord(entry.message) && entry.message.role === "assistant"
      && namedToolCallIds(entry.message, "aili_compact").includes(message.toolCallId as string));
    if (callers.length !== 1) continue;
    redundant.add(callers[0]!.id);
    redundant.add(result.id);
  }
  return redundant;
}

function namedToolCallIds(message: Record<string, unknown>, name: string): string[] {
  const ids: string[] = [];
  if (Array.isArray(message.toolCalls)) for (const call of message.toolCalls) if (isRecord(call) && call.name === name && typeof call.id === "string") ids.push(call.id);
  if (Array.isArray(message.content)) for (const part of message.content) if (isRecord(part) && part.type === "toolCall" && part.name === name && typeof part.id === "string") ids.push(part.id);
  return ids;
}

function hasSafeProtocolOrder(entries: readonly SessionLikeEntry[]): boolean {
  const calls = new Map<string, number>();
  const results = new Map<string, number>();
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry.message)) continue;
    if (entry.message.role === "assistant") {
      for (const id of toolCallIds(entry.message)) {
        if (calls.has(id)) return false;
        calls.set(id, index);
      }
    } else if (entry.message.role === "toolResult") {
      const id = entry.message.toolCallId;
      if (typeof id !== "string" || results.has(id)) return false;
      results.set(id, index);
    }
  }
  for (const [id, callIndex] of calls) if (!results.has(id) || results.get(id)! <= callIndex) return false;
  for (const id of results.keys()) if (!calls.has(id)) return false;
  return true;
}

function protocolAtomsShareBlocks(entries: readonly SessionLikeEntry[], sourceToBlock: ReadonlyMap<string, CompactBlock>): boolean {
  const entryByCall = new Map<string, SessionLikeEntry>();
  for (const entry of entries) {
    if (!isRecord(entry.message) || entry.message.role !== "assistant") continue;
    for (const id of toolCallIds(entry.message)) entryByCall.set(id, entry);
  }
  for (const result of entries) {
    if (!isRecord(result.message) || result.message.role !== "toolResult" || typeof result.message.toolCallId !== "string") continue;
    const call = entryByCall.get(result.message.toolCallId);
    if (!call || sourceToBlock.get(call.id) !== sourceToBlock.get(result.id)) return false;
  }
  return true;
}

function toolCallIds(message: Record<string, unknown>): string[] {
  const ids: string[] = [];
  if (Array.isArray(message.toolCalls)) for (const call of message.toolCalls) if (isRecord(call) && typeof call.id === "string") ids.push(call.id);
  if (Array.isArray(message.content)) for (const part of message.content) if (isRecord(part) && part.type === "toolCall" && typeof part.id === "string") ids.push(part.id);
  return ids;
}
