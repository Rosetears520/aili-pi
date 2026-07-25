import {
  AILI_COMPACT_SCHEMA_V2,
  extractText,
  isRecord,
  sourceDigest,
  type CompactBlock,
  type CompactState,
  type CompactTransaction,
  type SessionLikeEntry,
} from "./contracts.js";
import {
  buildReferenceCatalog,
  resolveBlockReference,
  resolveMessageReference,
  type CompactReferenceCatalog,
} from "./references.js";

export const MUTATION_LIMITS = {
  maxBatch: 16,
  maxBlockRefs: 16,
  maxTopicChars: 200,
  defaultSummaryChars: 6_000,
  minSummaryLimit: 256,
  maxSummaryLimit: 10_000,
  hardSummaryChars: 10_000,
  maxPreviewBytes: 2_000,
  maxPruneTools: 64,
  maxPruneRefs: 64,
} as const;

const MUTATION_TOOLS = new Set(["aili_compact", "aili_decompress", "aili_prune"]);
const AILI_TOOLS = new Set([
  ...MUTATION_TOOLS,
  "aili_search_context",
  "aili_compact_status",
  "aili_context_recap",
]);

export interface MutationGuardInput {
  /** True only when the host has proved this is the sole tool call in the assistant message. */
  soleCall: boolean;
  /** Tool names of any sibling calls observed by the coordinator. */
  siblingToolNames?: readonly string[];
}

export interface MutationFailure {
  ok: false;
  code:
    | "mutation-conflict"
    | "disabled"
    | "invalid-bounds"
    | "stale-catalog"
    | "unknown-reference"
    | "incomplete-atom"
    | "duplicate-coverage"
    | "overlap"
    | "protected"
    | "invalid-lineage"
    | "not-worth-compressing"
    | "ineligible-block"
    | "no-candidates"
    | "not-consumed";
  message: string;
  reasons: readonly string[];
}

export type MutationResult<T> = { ok: true; value: T } | MutationFailure;

export interface RangeCompactItem {
  startRef: string;
  endRef: string;
  summary: string;
}

export interface MessageCompactItem {
  messageRef: string;
  topic: string;
  summary: string;
}

export type CompactMutationRequest = {
  transactionId: string;
  catalogId: string;
  topic: string;
  summaryMaxChars?: number;
} & (
  | { mode: "range"; ranges: readonly RangeCompactItem[] }
  | { mode: "message"; items: readonly MessageCompactItem[] }
);

export interface ProtectionDecision {
  protected: boolean;
  reasons?: readonly string[];
}

export interface CompactProtectionContext {
  mode: "range" | "message";
  sourceEntryIds: readonly string[];
  entries: readonly SessionLikeEntry[];
}

export interface ChildSummaryContext {
  child: CompactBlock;
  summary: string;
  sourceEntryIds: readonly string[];
}

export interface CompactPlanningOptions {
  entries: readonly SessionLikeEntry[];
  state: CompactState;
  guard: MutationGuardInput;
  normalSummaryMaxChars?: number;
  hardSummaryMaxChars?: number;
  minSourceChars?: number;
  minSavingsChars?: number;
  estimateRecapOverheadChars?: (summary: string, sourceCount: number) => number;
  protect?: (context: CompactProtectionContext) => ProtectionDecision;
  /** Required when selected source overlaps an active child block. */
  childSummaryIncludes?: (context: ChildSummaryContext) => boolean;
}

export interface CompactMutationPlan {
  transaction: CompactTransaction;
  normalizedRanges?: readonly { startRef: string; endRef: string }[];
  sourceChars: number;
  projectedSavingsChars: number;
}

type Atom = {
  key: string;
  entryIds: string[];
  ordinalStart: number;
  ordinalEnd: number;
  protocol: boolean;
  toolNames: string[];
  resultEntryIds: string[];
};

type SelectedBlock = {
  sourceEntryIds: string[];
  summary: string;
  topic: string;
  anchorEntryId: string;
  normalizedRange?: { startRef: string; endRef: string };
};

export function planCompactMutation(
  request: CompactMutationRequest,
  options: CompactPlanningOptions,
): MutationResult<CompactMutationPlan> {
  const guardFailure = validateGuard(options.guard);
  if (guardFailure) return guardFailure;
  if (!options.state.enabled) return failure("disabled", "AILI Compact is disabled.");

  const catalog = buildReferenceCatalog(options.entries, options.state);
  if (request.catalogId !== catalog.catalogId) return failure("stale-catalog", "The reference catalog is stale.");
  const hardMax = options.hardSummaryMaxChars ?? MUTATION_LIMITS.hardSummaryChars;
  const normalMax = options.normalSummaryMaxChars ?? MUTATION_LIMITS.defaultSummaryChars;
  const requestedMax = request.summaryMaxChars ?? normalMax;
  if (!boundedText(request.transactionId, 256)
    || !boundedText(request.topic, MUTATION_LIMITS.maxTopicChars)
    || !Number.isInteger(requestedMax)
    || requestedMax < MUTATION_LIMITS.minSummaryLimit
    || requestedMax > MUTATION_LIMITS.maxSummaryLimit
    || requestedMax > hardMax) {
    return failure("invalid-bounds", "Transaction, topic, or summary limit is outside its bounds.");
  }

  const items = request.mode === "range" ? request.ranges : request.items;
  if (items.length < 1 || items.length > MUTATION_LIMITS.maxBatch) {
    return failure("invalid-bounds", "A compact batch must contain 1..16 items.");
  }
  for (const item of items) {
    const summary = item.summary;
    if (!boundedText(summary, requestedMax) || summary.length > hardMax) {
      return failure("invalid-bounds", "Every summary must be non-empty and within the effective summary bound.");
    }
    if (request.mode === "message" && !boundedText((item as MessageCompactItem).topic, MUTATION_LIMITS.maxTopicChars)) {
      return failure("invalid-bounds", "Every message topic must be non-empty and at most 200 characters.");
    }
  }

  const atomIndex = buildAtomIndex(options.entries, catalog);
  const selected: SelectedBlock[] = [];

  if (request.mode === "range") {
    for (const item of request.ranges) {
      const start = resolveMessageReference(catalog, request.catalogId, item.startRef);
      const end = resolveMessageReference(catalog, request.catalogId, item.endRef);
      if (!start || !end) return failure("unknown-reference", "A range boundary is unknown in the current catalog.");
      const low = Math.min(start.ordinal, end.ordinal);
      const high = Math.max(start.ordinal, end.ordinal);
      const entriesInRange = catalog.messages.filter((message) => message.ordinal >= low && message.ordinal <= high);
      const ids = entriesInRange.map((message) => message.entryId);
      const selectedSet = new Set(ids);
      for (const message of entriesInRange) {
        const atom = atomIndex.byEntryId.get(message.entryId);
        if (!atom || atom.entryIds.some((id) => !selectedSet.has(id))) {
          return failure("incomplete-atom", `Range ${item.startRef}..${item.endRef} splits a protocol atom.`);
        }
      }
      selected.push({
        sourceEntryIds: ids,
        summary: item.summary,
        topic: request.topic,
        anchorEntryId: ids[0]!,
        normalizedRange: {
          startRef: catalog.messages[low - 1]!.ref,
          endRef: catalog.messages[high - 1]!.ref,
        },
      });
    }
  } else {
    for (const item of request.items) {
      const reference = resolveMessageReference(catalog, request.catalogId, item.messageRef);
      if (!reference) return failure("unknown-reference", `Unknown message reference: ${item.messageRef}.`);
      const atom = atomIndex.byEntryId.get(reference.entryId);
      if (!atom) return failure("incomplete-atom", `Message ${item.messageRef} is not a complete protocol atom.`);
      selected.push({
        sourceEntryIds: [...atom.entryIds],
        summary: item.summary,
        topic: item.topic,
        anchorEntryId: atom.entryIds[0]!,
      });
    }
  }

  const coverage = new Set<string>();
  for (const block of selected) {
    for (const id of block.sourceEntryIds) {
      if (coverage.has(id)) {
        return failure(request.mode === "range" ? "overlap" : "duplicate-coverage", "Compact items have overlapping or duplicate source coverage.");
      }
      coverage.add(id);
    }
  }

  const entryOrder = new Map(options.entries.map((entry, index) => [entry.id, index]));
  const active = [...options.state.blocks.values()].filter((block) => block.active && !block.queryOnly && block.epochId === options.state.epochId);
  const childIdsUsed = new Set<string>();
  const childIdsByBlock: string[][] = [];
  for (const block of selected) {
    const blockSet = new Set(block.sourceEntryIds);
    const children: string[] = [];
    for (const child of active) {
      const overlap = child.sourceEntryIds.some((id) => blockSet.has(id));
      if (!overlap) continue;
      if (child.sourceEntryIds.some((id) => !blockSet.has(id))
        || childIdsUsed.has(child.id)
        || !options.childSummaryIncludes?.({ child, summary: block.summary, sourceEntryIds: block.sourceEntryIds })) {
        return failure("invalid-lineage", "Active nested source requires complete, explicit child lineage and summary inclusion.");
      }
      childIdsUsed.add(child.id);
      children.push(child.id);
    }
    childIdsByBlock.push(children);
  }

  for (const block of selected) {
    const selectedEntries = block.sourceEntryIds
      .map((id) => options.entries.find((entry) => entry.id === id))
      .filter((entry): entry is SessionLikeEntry => entry !== undefined);
    const decision = options.protect?.({ mode: request.mode, sourceEntryIds: block.sourceEntryIds, entries: selectedEntries });
    if (decision?.protected) {
      return failure("protected", "Selected source is protected.", decision.reasons ?? ["protected"]);
    }
  }

  // Material-benefit work deliberately occurs only after reference, atom, coverage,
  // lineage, and protection validation above.
  const minSource = options.minSourceChars ?? 0;
  const minSavings = options.minSavingsChars ?? 0;
  const overhead = options.estimateRecapOverheadChars ?? ((summary: string) => summary.length + 256);
  let sourceChars = 0;
  let projectedSavingsChars = 0;
  for (const block of selected) {
    const chars = block.sourceEntryIds.reduce((sum, id) => {
      const entry = options.entries.find((candidate) => candidate.id === id);
      return sum + (entry && isRecord(entry.message) ? extractText(entry.message.content).length : 0);
    }, 0);
    const saving = chars - overhead(block.summary, block.sourceEntryIds.length);
    if (chars < minSource || saving < minSavings) {
      return failure("not-worth-compressing", "Selected source does not provide the configured material benefit.");
    }
    sourceChars += chars;
    projectedSavingsChars += saving;
  }

  const blocks: CompactBlock[] = selected.map((block, index) => ({
    id: `block:${request.transactionId}:${index + 1}`,
    kind: "semantic",
    epochId: options.state.epochId,
    sourceEntryIds: [...block.sourceEntryIds].sort((a, b) => (entryOrder.get(a) ?? 0) - (entryOrder.get(b) ?? 0)),
    sourceDigest: sourceDigest(options.entries, block.sourceEntryIds),
    summary: block.summary,
    active: true,
    mode: request.mode,
    topic: block.topic,
    batchTopic: request.topic,
    anchorEntryId: block.anchorEntryId,
    runId: request.transactionId,
    childBlockIds: childIdsByBlock[index]!,
    generation: "young",
    survivedCount: 0,
    age: 0,
  }));
  const transaction: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA_V2,
    id: request.transactionId,
    kind: "compact",
    epochId: options.state.epochId,
    blocks,
  };
  return {
    ok: true,
    value: {
      transaction,
      ...(request.mode === "range" ? { normalizedRanges: selected.map((block) => block.normalizedRange!) } : {}),
      sourceChars,
      projectedSavingsChars,
    },
  };
}

export type BlockMutationAction = "decompress" | "recompress";

export interface BlockMutationRequest {
  transactionId: string;
  catalogId: string;
  blockRefs: readonly string[];
}

export interface BlockProtectionContext {
  action: BlockMutationAction;
  block: CompactBlock;
}

export interface BlockMutationOptions {
  entries: readonly SessionLikeEntry[];
  state: CompactState;
  guard?: MutationGuardInput;
  protect?: (context: BlockProtectionContext) => ProtectionDecision;
}

export interface DecompressionPreview {
  sourceRefs: readonly string[];
  excerpts: readonly { messageRef: string; text: string }[];
  utf8Bytes: number;
  truncated: boolean;
}

export interface DecompressionPlan {
  transaction: CompactTransaction;
  deactivateBlockIds: readonly string[];
  /** Nested children that a coordinator/reducer must reactivate atomically with the parent restore. */
  reactivateChildBlockIds: readonly string[];
  preview: DecompressionPreview;
}

export interface RecompressionPlan {
  control: CompactTransaction;
  reactivateBlockIds: readonly string[];
  /** Reactivating a parent requires these currently-active children to deactivate atomically. */
  deactivateChildBlockIds: readonly string[];
}

export function planDecompression(
  request: BlockMutationRequest,
  options: BlockMutationOptions,
): MutationResult<DecompressionPlan> {
  const resolved = resolveBlockMutation(request, options, "decompress");
  if (!resolved.ok) return resolved;
  const requestedIds = new Set(resolved.value.map((block) => block.id));
  const childIds = unique(resolved.value.flatMap((block) => block.childBlockIds ?? []))
    .filter((id) => !requestedIds.has(id));
  for (const childId of childIds) {
    const child = options.state.blocks.get(childId);
    if (!child || child.epochId !== options.state.epochId || child.queryOnly || child.deactivationReason !== "nested") {
      return failure("invalid-lineage", "Nested child lineage cannot be restored safely.");
    }
  }
  const sourceIds = replayOrderedSourceIds(options.entries, resolved.value.flatMap((block) => block.sourceEntryIds));
  const preview = buildPreview(options.entries, buildReferenceCatalog(options.entries, options.state), sourceIds);
  const transaction: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA_V2,
    id: request.transactionId,
    kind: "decompress",
    epochId: options.state.epochId,
    deactivateBlockIds: resolved.value.map((block) => block.id),
    ...(childIds.length > 0 ? { reactivateBlockIds: childIds } : {}),
  };
  return { ok: true, value: { transaction, deactivateBlockIds: transaction.deactivateBlockIds!, reactivateChildBlockIds: childIds, preview } };
}

export function planRecompression(
  request: BlockMutationRequest,
  options: BlockMutationOptions,
): MutationResult<RecompressionPlan> {
  const resolved = resolveBlockMutation(request, options, "recompress");
  if (!resolved.ok) return resolved;
  const childIds = unique(resolved.value.flatMap((block) => block.childBlockIds ?? []));
  for (const childId of childIds) {
    const child = options.state.blocks.get(childId);
    if (!child || child.epochId !== options.state.epochId || child.queryOnly || !child.active) {
      return failure("invalid-lineage", "Nested child lineage cannot be recompressed safely.");
    }
  }
  const control: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA_V2,
    id: request.transactionId,
    kind: "control",
    epochId: options.state.epochId,
    control: "recompress",
    reactivateBlockIds: resolved.value.map((block) => block.id),
    ...(childIds.length > 0 ? { deactivateBlockIds: childIds } : {}),
  };
  return { ok: true, value: { control, reactivateBlockIds: control.reactivateBlockIds!, deactivateChildBlockIds: childIds } };
}

export interface PruneMutationRequest {
  transactionId: string;
  catalogId: string;
  /** Lower/upper case is accepted and normalized. */
  tools?: readonly string[];
  /** A ref names its entire complete protocol atom, never one result in isolation. */
  messageRefs?: readonly string[];
  /** Keep this many latest matching atoms per normalized tool. */
  keepLatest?: number;
}

export interface PruneProtectionContext {
  atomEntryIds: readonly string[];
  toolNames: readonly string[];
  entries: readonly SessionLikeEntry[];
}

export interface PrunePlanningOptions {
  entries: readonly SessionLikeEntry[];
  state: CompactState;
  guard: MutationGuardInput;
  isConsumed?: (resultEntry: SessionLikeEntry, resultIndex: number, entries: readonly SessionLikeEntry[]) => boolean;
  hardProtect?: (context: PruneProtectionContext) => ProtectionDecision;
}

export interface PruneMutationPlan {
  transaction: CompactTransaction;
  selectedAtomCount: number;
}

export function planPruneMutation(
  request: PruneMutationRequest,
  options: PrunePlanningOptions,
): MutationResult<PruneMutationPlan> {
  const guardFailure = validateGuard(options.guard);
  if (guardFailure) return guardFailure;
  if (!options.state.enabled) return failure("disabled", "AILI Compact is disabled.");
  const catalog = buildReferenceCatalog(options.entries, options.state);
  if (request.catalogId !== catalog.catalogId) return failure("stale-catalog", "The reference catalog is stale.");
  const tools = unique((request.tools ?? []).map((tool) => tool.toLocaleLowerCase()));
  const refs = request.messageRefs ?? [];
  const keepLatest = request.keepLatest ?? 0;
  if (!boundedText(request.transactionId, 256)
    || tools.length > MUTATION_LIMITS.maxPruneTools
    || refs.length > MUTATION_LIMITS.maxPruneRefs
    || (tools.length === 0 && refs.length === 0)
    || tools.some((tool) => !boundedText(tool, 128))
    || new Set(refs).size !== refs.length
    || !Number.isInteger(keepLatest) || keepLatest < 0 || keepLatest > MUTATION_LIMITS.maxBatch) {
    return failure("invalid-bounds", "Prune selectors or keepLatest are outside their bounds.");
  }

  const atomIndex = buildAtomIndex(options.entries, catalog);
  const chosen = new Map<string, Atom>();
  for (const ref of refs) {
    const message = resolveMessageReference(catalog, request.catalogId, ref);
    const atom = message ? atomIndex.byEntryId.get(message.entryId) : undefined;
    if (!message) return failure("unknown-reference", `Unknown message reference: ${ref}.`);
    if (!atom?.protocol || atom.resultEntryIds.length === 0) return failure("incomplete-atom", `${ref} is not a complete tool-result atom.`);
    chosen.set(atom.key, atom);
  }

  const allAtoms = [...atomIndex.atoms.values()].filter((atom) => atom.protocol && atom.resultEntryIds.length > 0);
  for (const tool of tools) {
    const matching = allAtoms.filter((atom) => atom.toolNames.length > 0 && atom.toolNames.every((name) => name === tool));
    const retained = new Set(matching.slice(-keepLatest).map((atom) => atom.key));
    for (const atom of matching) if (!retained.has(atom.key)) chosen.set(atom.key, atom);
  }
  const selected = [...chosen.values()].sort((a, b) => a.ordinalStart - b.ordinalStart);
  if (selected.length === 0) return failure("no-candidates", "No tool-result atoms remain after keepLatest.");
  if (selected.length > MUTATION_LIMITS.maxBatch) return failure("invalid-bounds", "Prune selected more than 16 complete atoms.");

  const activeIds = new Set([...options.state.blocks.values()]
    .filter((block) => block.active && block.epochId === options.state.epochId)
    .flatMap((block) => block.sourceEntryIds));
  const consumed = options.isConsumed ?? defaultConsumed;
  const blocks: CompactBlock[] = [];
  for (const [index, atom] of selected.entries()) {
    if (atom.entryIds.some((id) => activeIds.has(id))) return failure("duplicate-coverage", "A selected prune atom is already covered.");
    const atomEntries = atom.entryIds.map((id) => options.entries.find((entry) => entry.id === id)!).filter(Boolean);
    if (atom.toolNames.some((name) => AILI_TOOLS.has(name))) return failure("protected", "AILI protocol atoms are hard-protected.", ["protocol"]);
    for (const resultId of atom.resultEntryIds) {
      const resultIndex = options.entries.findIndex((entry) => entry.id === resultId);
      const result = options.entries[resultIndex]!;
      if (!consumed(result, resultIndex, options.entries)) return failure("not-consumed", "A selected tool result has not been consumed.");
      if (hasBinaryContent(isRecord(result.message) ? result.message.content : undefined)) {
        return failure("protected", "Binary or mixed tool results are hard-protected.", ["binary"]);
      }
    }
    const decision = options.hardProtect?.({ atomEntryIds: atom.entryIds, toolNames: atom.toolNames, entries: atomEntries });
    if (decision?.protected) return failure("protected", "A selected prune atom is hard-protected.", decision.reasons ?? ["protected"]);
    blocks.push({
      id: `prune:${request.transactionId}:${index + 1}`,
      kind: "prune",
      epochId: options.state.epochId,
      sourceEntryIds: [...atom.entryIds],
      sourceDigest: sourceDigest(options.entries, atom.entryIds),
      summary: `Consumed tool-result atom (${atom.toolNames.join(",")})`,
      active: true,
    });
  }
  const transaction: CompactTransaction = {
    schema: AILI_COMPACT_SCHEMA_V2,
    id: request.transactionId,
    kind: "prune",
    epochId: options.state.epochId,
    blocks,
  };
  return { ok: true, value: { transaction, selectedAtomCount: blocks.length } };
}

function resolveBlockMutation(
  request: BlockMutationRequest,
  options: BlockMutationOptions,
  action: BlockMutationAction,
): MutationResult<CompactBlock[]> {
  if (options.guard) {
    const guardFailure = validateGuard(options.guard);
    if (guardFailure) return guardFailure;
  }
  if (!options.state.enabled) return failure("disabled", "AILI Compact is disabled.");
  if (!boundedText(request.transactionId, 256)
    || request.blockRefs.length < 1
    || request.blockRefs.length > MUTATION_LIMITS.maxBlockRefs
    || new Set(request.blockRefs).size !== request.blockRefs.length) {
    return failure("invalid-bounds", "Block mutations require 1..16 unique references.");
  }
  const catalog = buildReferenceCatalog(options.entries, options.state);
  if (request.catalogId !== catalog.catalogId) return failure("stale-catalog", "The reference catalog is stale.");
  const blocks: CompactBlock[] = [];
  for (const ref of request.blockRefs) {
    const reference = resolveBlockReference(catalog, request.catalogId, ref);
    const block = reference ? options.state.blocks.get(reference.blockId) : undefined;
    if (!reference || !block) return failure("unknown-reference", `Unknown block reference: ${ref}.`);
    const eligible = block.epochId === options.state.epochId
      && !block.queryOnly
      && (action === "decompress" ? block.active : !block.active && block.deactivationReason === "decompress");
    if (!eligible) {
      const reason = block.queryOnly || block.epochId !== options.state.epochId
        ? "query-only"
        : block.deactivationReason === "gc" ? "gc" : block.active ? "already-active" : "not-explicitly-decompressed";
      return failure("ineligible-block", `Block ${ref} is not eligible for ${action}.`, [reason]);
    }
    const decision = options.protect?.({ action, block });
    if (decision?.protected) return failure("protected", `Block ${ref} is protected.`, decision.reasons ?? ["protected"]);
    blocks.push(block);
  }
  return { ok: true, value: blocks };
}

function buildAtomIndex(
  entries: readonly SessionLikeEntry[],
  catalog: CompactReferenceCatalog,
): { atoms: Map<string, Atom>; byEntryId: Map<string, Atom> } {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ordinal = new Map(catalog.messages.map((message) => [message.entryId, message.ordinal]));
  const atoms = new Map<string, Atom>();
  const byEntryId = new Map<string, Atom>();
  for (const message of catalog.messages) {
    if (byEntryId.has(message.entryId)) continue;
    const entry = byId.get(message.entryId);
    if (!entry || !isRecord(entry.message)) continue;
    const protocol = entry.message.role === "toolResult" || toolCalls(entry.message).length > 0;
    if (!protocol) {
      const atom: Atom = { key: message.entryId, entryIds: [message.entryId], ordinalStart: message.ordinal, ordinalEnd: message.ordinal, protocol: false, toolNames: [], resultEntryIds: [] };
      atoms.set(atom.key, atom);
      byEntryId.set(message.entryId, atom);
      continue;
    }
    const atomIds = unique([...message.atomEntryIds]);
    const atomEntries = atomIds.map((id) => byId.get(id));
    const callerEntries = atomEntries.filter((candidate) => candidate && isRecord(candidate.message) && candidate.message.role === "assistant" && toolCalls(candidate.message).length > 0) as SessionLikeEntry[];
    if (callerEntries.length !== 1 || atomEntries.some((candidate) => !candidate || !ordinal.has(candidate.id))) continue;
    const caller = callerEntries[0]!;
    const calls = toolCalls(caller.message as Record<string, unknown>);
    const resultEntries: SessionLikeEntry[] = [];
    let complete = true;
    for (const call of calls) {
      const results = atomEntries.filter((candidate) => candidate && isRecord(candidate.message)
        && candidate.message.role === "toolResult" && candidate.message.toolCallId === call.id) as SessionLikeEntry[];
      if (results.length !== 1) {
        complete = false;
        break;
      }
      resultEntries.push(results[0]!);
    }
    if (!complete || resultEntries.length !== atomEntries.length - 1) continue;
    const orderedIds = atomIds.sort((a, b) => ordinal.get(a)! - ordinal.get(b)!);
    const atom: Atom = {
      key: caller.id,
      entryIds: orderedIds,
      ordinalStart: ordinal.get(orderedIds[0]!)!,
      ordinalEnd: ordinal.get(orderedIds.at(-1)!)!,
      protocol: true,
      toolNames: calls.map((call) => call.name.toLocaleLowerCase()),
      resultEntryIds: resultEntries.map((result) => result.id),
    };
    atoms.set(atom.key, atom);
    for (const id of orderedIds) byEntryId.set(id, atom);
  }
  return { atoms, byEntryId };
}

function toolCalls(message: Record<string, unknown>): Array<{ id: string; name: string }> {
  const calls: Array<{ id: string; name: string }> = [];
  const add = (value: unknown) => {
    if (isRecord(value) && typeof value.id === "string" && typeof value.name === "string") calls.push({ id: value.id, name: value.name });
  };
  if (Array.isArray(message.toolCalls)) message.toolCalls.forEach(add);
  if (Array.isArray(message.content)) {
    message.content.forEach((part) => {
      if (isRecord(part) && part.type === "toolCall") add(part);
    });
  }
  return calls;
}

function defaultConsumed(_result: SessionLikeEntry, resultIndex: number, entries: readonly SessionLikeEntry[]): boolean {
  return entries.slice(resultIndex + 1).some((entry) => entry.type === "message" && isRecord(entry.message) && entry.message.role === "assistant");
}

function hasBinaryContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((part) => isRecord(part) && part.type !== "text");
}

function buildPreview(
  entries: readonly SessionLikeEntry[],
  catalog: CompactReferenceCatalog,
  sourceIds: readonly string[],
): DecompressionPreview {
  const refs = new Map(catalog.messages.map((message) => [message.entryId, message.ref]));
  const excerpts: Array<{ messageRef: string; text: string }> = [];
  const sourceRefs = sourceIds.flatMap((id) => {
    const ref = refs.get(id);
    return ref ? [ref] : [];
  });
  let remaining = MUTATION_LIMITS.maxPreviewBytes;
  let truncated = false;
  for (const id of sourceIds) {
    const ref = refs.get(id);
    const entry = entries.find((candidate) => candidate.id === id);
    if (!ref || !entry || !isRecord(entry.message)) continue;
    const exact = extractText(entry.message.content);
    const clipped = truncateUtf8(exact, remaining);
    if (clipped.text.length > 0) excerpts.push({ messageRef: ref, text: clipped.text });
    remaining -= clipped.bytes;
    if (clipped.truncated || remaining === 0 && sourceIds.indexOf(id) < sourceIds.length - 1) {
      truncated = true;
      break;
    }
  }
  return { sourceRefs, excerpts, utf8Bytes: MUTATION_LIMITS.maxPreviewBytes - remaining, truncated };
}

function truncateUtf8(value: string, maxBytes: number): { text: string; bytes: number; truncated: boolean } {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) return { text: value, bytes, truncated: false };
  if (maxBytes <= 0) return { text: "", bytes: 0, truncated: value.length > 0 };
  let used = 0;
  let text = "";
  for (const point of value) {
    const size = Buffer.byteLength(point, "utf8");
    if (used + size > maxBytes) break;
    text += point;
    used += size;
  }
  return { text, bytes: used, truncated: true };
}

function replayOrderedSourceIds(entries: readonly SessionLikeEntry[], ids: readonly string[]): string[] {
  const selected = new Set(ids);
  return entries.filter((entry) => selected.has(entry.id)).map((entry) => entry.id);
}

function validateGuard(guard: MutationGuardInput): MutationFailure | undefined {
  const siblings = guard.siblingToolNames ?? [];
  if (!guard.soleCall || siblings.length > 0) {
    return failure("mutation-conflict", "Mutation tools must be the sole call with no sibling tool call.");
  }
  return undefined;
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function failure(code: MutationFailure["code"], message: string, reasons: readonly string[] = [code]): MutationFailure {
  return { ok: false, code, message, reasons: [...new Set(reasons)].slice(0, 16) };
}
