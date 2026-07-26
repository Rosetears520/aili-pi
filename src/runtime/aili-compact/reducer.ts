import {
  AILI_COMPACT_ENTRY,
  AILI_COMPACT_SCHEMA_V1,
  type CompactBlock,
  type CompactPolicyDecision,
  type CompactState,
  type CompactTransaction,
  isCompactTransaction,
  isRecord,
  sourceDigest,
  type SessionLikeEntry,
} from "./contracts.js";

const ROOT_EPOCH = "root";
const MAX_POLICY_DECISIONS = 64;

type MutableCompactState = {
  epochId: string;
  enabled: boolean;
  autoCooling: boolean;
  manualMode: boolean;
  cachePanel: boolean;
  hasSessionControl: boolean;
  hasAutoCoolingControl: boolean;
  hasManualControl: boolean;
  hasPanelControl: boolean;
  pendingManualTrigger?: CompactState["pendingManualTrigger"];
  blocks: Map<string, CompactBlock>;
  policyDecisions: CompactPolicyDecision[];
  transactionCount: number;
};

export function reduceCompactState(entries: readonly SessionLikeEntry[]): CompactState {
  let current: MutableCompactState = {
    epochId: ROOT_EPOCH,
    enabled: true,
    autoCooling: true,
    manualMode: false,
    cachePanel: false,
    hasSessionControl: false,
    hasAutoCoolingControl: false,
    hasManualControl: false,
    hasPanelControl: false,
    blocks: new Map(),
    policyDecisions: [],
    transactionCount: 0,
  };
  const diagnostics: string[] = [];
  const transactionIds = new Set<string>();

  for (const entry of entries) {
    if (entry.type === "compaction") {
      const blocks = new Map(current.blocks);
      for (const [id, block] of blocks) {
        if (block.active && block.epochId === current.epochId) {
          blocks.set(id, { ...block, active: false, deactivationReason: "epoch" });
        }
      }
      current = { ...current, epochId: entry.id, pendingManualTrigger: undefined, blocks };
      continue;
    }

    const transaction = transactionFromEntry(entry);
    if (!transaction) continue;
    if (entry.type === "custom" && transaction.kind !== "cool" && transaction.kind !== "control") {
      diagnostics.push(`invalid-commit-source:${transaction.id}`);
      continue;
    }
    if (transactionIds.has(transaction.id)) {
      diagnostics.push(`duplicate:${transaction.id}`);
      continue;
    }
    if (transaction.epochId !== current.epochId) {
      diagnostics.push(`wrong-epoch:${transaction.id}`);
      continue;
    }

    const next = cloneState(current);
    const error = applyTransaction(next, transaction, entries, diagnostics);
    if (error) {
      diagnostics.push(error.includes(":") ? error : `${error}:${transaction.id}`);
      continue;
    }
    transactionIds.add(transaction.id);
    next.transactionCount += 1;
    current = next;
  }

  return { ...current, diagnostics };
}

function cloneState(state: MutableCompactState): MutableCompactState {
  return {
    ...state,
    pendingManualTrigger: state.pendingManualTrigger ? { ...state.pendingManualTrigger } : undefined,
    blocks: new Map(state.blocks),
    policyDecisions: [...state.policyDecisions],
  };
}

function applyTransaction(
  state: MutableCompactState,
  transaction: CompactTransaction,
  entries: readonly SessionLikeEntry[],
  diagnostics: string[],
): string | undefined {
  const controlError = applyControl(state, transaction);
  if (controlError) return controlError;

  if (transaction.blocks) {
    const normalized = transaction.blocks.map((block) => normalizeBlock(block, transaction));
    const validation = validateBlockBatch(entries, state, normalized, transaction.schema === AILI_COMPACT_SCHEMA_V1);
    if (validation.error) return validation.error;
    for (const block of validation.blocks) {
      state.blocks.set(block.id, block);
      for (const childId of block.childBlockIds ?? []) {
        const child = state.blocks.get(childId);
        if (child) state.blocks.set(childId, { ...child, active: false, deactivationReason: "nested" });
      }
      if (block.queryOnly) diagnostics.push(`invalid-block:${block.id}`, `legacy-query-only:${block.id}`);
    }
  }

  const isDecompress = transaction.kind === "decompress" || transaction.control === "decompress";
  const isRecompress = transaction.control === "recompress";
  if (isDecompress || isRecompress) {
    const lineageError = validateNestedBlockTransition(state, transaction, isDecompress ? "decompress" : "recompress");
    if (lineageError) return lineageError;
  }

  if (transaction.deactivateBlockIds && transaction.control !== "restore-all") {
    const error = validateBlockTargets(state, transaction.deactivateBlockIds, true);
    if (error) return error;
    const deactivationReason = isRecompress ? "nested" : "decompress";
    for (const blockId of transaction.deactivateBlockIds) {
      const block = state.blocks.get(blockId)!;
      state.blocks.set(blockId, { ...block, active: false, deactivationReason });
    }
  }

  if (transaction.reactivateBlockIds) {
    const expectedReason = isDecompress ? "nested" : "decompress";
    const error = validateReactivationTargets(state, transaction.reactivateBlockIds, expectedReason);
    if (error) return error;
    for (const blockId of transaction.reactivateBlockIds) {
      const block = state.blocks.get(blockId)!;
      const { deactivationReason: _reason, ...rest } = block;
      state.blocks.set(blockId, { ...rest, active: true });
    }
  }

  if (transaction.lifecycleUpdates) {
    for (const update of transaction.lifecycleUpdates) {
      const block = state.blocks.get(update.blockId);
      if (!block || block.epochId !== state.epochId || block.queryOnly) return "invalid-lifecycle";
      if (update.summary !== undefined && (!block.active || update.summary.length >= block.summary.length)) return "invalid-lifecycle";
      if (update.active === true) return "invalid-lifecycle";
      if (update.active === false && (update.deactivationReason !== "gc" && update.deactivationReason !== "nested")) return "invalid-lifecycle";
      if (update.active === undefined && update.deactivationReason !== undefined) return "invalid-lifecycle";
      if (update.active === undefined && !block.active) return "invalid-lifecycle";
    }
    for (const update of transaction.lifecycleUpdates) {
      const { blockId, ...changes } = update;
      const block = state.blocks.get(blockId)!;
      state.blocks.set(blockId, { ...block, ...changes });
    }
  }

  if (transaction.policy) {
    if (transaction.policy.sourceEntryIds.some((id) => !hasMessageEntry(entries, id))) return "invalid-policy";
    state.policyDecisions = [...state.policyDecisions, transaction.policy].slice(-MAX_POLICY_DECISIONS);
  }

  if (transaction.consumeManualTriggerId !== undefined && transaction.control !== "manual-clear") {
    if (state.pendingManualTrigger?.id !== transaction.consumeManualTriggerId) return "invalid-manual-trigger";
    state.pendingManualTrigger = undefined;
  }

  return undefined;
}

function applyControl(state: MutableCompactState, transaction: CompactTransaction): string | undefined {
  switch (transaction.control) {
    case undefined:
      return undefined;
    case "off":
      state.hasSessionControl = true;
      state.enabled = false;
      return undefined;
    case "on":
      state.hasSessionControl = true;
      state.enabled = true;
      return undefined;
    case "restore-all":
      state.hasAutoCoolingControl = true;
      state.autoCooling = false;
      for (const [id, block] of state.blocks) {
        if (block.active && block.epochId === state.epochId) {
          state.blocks.set(id, { ...block, active: false, deactivationReason: "restore-all" });
        }
      }
      return undefined;
    case "manual-on":
      state.hasManualControl = true;
      state.manualMode = true;
      return undefined;
    case "manual-off":
      state.hasManualControl = true;
      state.manualMode = false;
      state.pendingManualTrigger = undefined;
      return undefined;
    case "panel-on":
    case "panel-off":
      state.hasPanelControl = true;
      state.cachePanel = transaction.control === "panel-on";
      return undefined;
    case "manual-trigger":
      if (!transaction.manualTrigger || state.pendingManualTrigger) return "invalid-manual-trigger";
      state.pendingManualTrigger = { ...transaction.manualTrigger };
      return undefined;
    case "manual-clear":
      if (transaction.consumeManualTriggerId && state.pendingManualTrigger?.id !== transaction.consumeManualTriggerId) return "invalid-manual-trigger";
      state.pendingManualTrigger = undefined;
      return undefined;
    case "decompress":
      return transaction.deactivateBlockIds?.length ? undefined : "invalid-control";
    case "recompress":
      return transaction.reactivateBlockIds?.length ? undefined : "invalid-control";
  }
}

function normalizeBlock(block: CompactBlock, transaction: CompactTransaction): CompactBlock {
  if (transaction.schema !== AILI_COMPACT_SCHEMA_V1 || block.kind !== "semantic") return { ...block };
  const anchorEntryId = block.sourceEntryIds[0];
  if (!anchorEntryId) return { ...block, active: false, legacy: true, queryOnly: true };
  return {
    ...block,
    mode: block.sourceEntryIds.length === 1 ? "message" : "range",
    topic: "Legacy compact block",
    batchTopic: "Legacy compact block",
    anchorEntryId,
    runId: transaction.id,
    childBlockIds: [],
    generation: "young",
    survivedCount: 0,
    age: 0,
    legacy: true,
  };
}

function validateBlockBatch(
  entries: readonly SessionLikeEntry[],
  state: MutableCompactState,
  blocks: readonly CompactBlock[],
  legacy: boolean,
): { blocks: CompactBlock[]; error?: string } {
  const ids = new Set<string>();
  const batchSources = new Set<string>();
  const childIds = new Set<string>();
  const normalized: CompactBlock[] = [];

  for (const block of blocks) {
    if (ids.has(block.id) || state.blocks.has(block.id)) return { blocks: [], error: `invalid-block:${block.id}` };
    ids.add(block.id);
    if (block.epochId !== state.epochId || block.sourceEntryIds.length === 0) return { blocks: [], error: `invalid-block:${block.id}` };
    if (block.sourceDigest !== sourceDigest(entries, block.sourceEntryIds)) return { blocks: [], error: `invalid-block:${block.id}` };
    if (block.sourceEntryIds.some((id) => batchSources.has(id))) return { blocks: [], error: `invalid-block:${block.id}` };
    block.sourceEntryIds.forEach((id) => batchSources.add(id));

    const listedChildren = new Set(block.childBlockIds ?? []);
    for (const childId of listedChildren) {
      if (childIds.has(childId)) return { blocks: [], error: `invalid-block:${block.id}` };
      const child = state.blocks.get(childId);
      if (!child || !child.active || child.epochId !== state.epochId || child.queryOnly) return { blocks: [], error: `invalid-block:${block.id}` };
      if (child.sourceEntryIds.some((sourceId) => !block.sourceEntryIds.includes(sourceId))) return { blocks: [], error: `invalid-block:${block.id}` };
      childIds.add(childId);
    }

    const overlapping = [...state.blocks.values()].filter((candidate) => candidate.active
      && candidate.epochId === state.epochId
      && candidate.sourceEntryIds.some((id) => block.sourceEntryIds.includes(id)));
    if (overlapping.some((candidate) => !listedChildren.has(candidate.id))) return { blocks: [], error: `invalid-block:${block.id}` };

    const baseValid = block.sourceEntryIds.every((id) => hasMessageEntry(entries, id));
    const protocolValid = hasValidCoolingAtom(entries, block) && hasValidBlockProtocolAtoms(entries, block);
    const anchorValid = block.kind !== "semantic" || (typeof block.anchorEntryId === "string" && block.sourceEntryIds.includes(block.anchorEntryId));
    if (!baseValid || !protocolValid || !anchorValid) {
      if (!legacy || block.kind !== "semantic" || !baseValid) return { blocks: [], error: `invalid-block:${block.id}` };
      normalized.push({ ...block, active: false, queryOnly: true });
      continue;
    }
    normalized.push({ ...block });
  }

  return { blocks: normalized };
}

function validateBlockTargets(state: MutableCompactState, ids: readonly string[], requireActive: boolean): string | undefined {
  for (const id of ids) {
    const block = state.blocks.get(id);
    if (!block || block.epochId !== state.epochId || block.queryOnly || (requireActive && !block.active)) return "invalid-block-target";
  }
  return undefined;
}

function validateReactivationTargets(
  state: MutableCompactState,
  ids: readonly string[],
  expectedReason: "decompress" | "nested",
): string | undefined {
  for (const id of ids) {
    const block = state.blocks.get(id);
    if (!block || block.epochId !== state.epochId || block.active || block.queryOnly || block.deactivationReason !== expectedReason) {
      return "invalid-block-target";
    }
  }
  return undefined;
}

function validateNestedBlockTransition(
  state: MutableCompactState,
  transaction: CompactTransaction,
  action: "decompress" | "recompress",
): string | undefined {
  const parentIds = action === "decompress" ? transaction.deactivateBlockIds ?? [] : transaction.reactivateBlockIds ?? [];
  const childIds = action === "decompress" ? transaction.reactivateBlockIds ?? [] : transaction.deactivateBlockIds ?? [];
  const expectedChildren = new Set(parentIds.flatMap((id) => state.blocks.get(id)?.childBlockIds ?? []));
  if (expectedChildren.size !== childIds.length || childIds.some((id) => !expectedChildren.has(id))) return "invalid-block-lineage";
  if (action === "decompress") return validateReactivationTargets(state, childIds, "nested");
  return validateBlockTargets(state, childIds, true);
}

function hasMessageEntry(entries: readonly SessionLikeEntry[], id: string): boolean {
  return entries.some((entry) => entry.id === id && entry.type === "message" && isRecord(entry.message));
}

function hasValidBlockProtocolAtoms(entries: readonly SessionLikeEntry[], block: CompactBlock): boolean {
  if (block.kind === "cool") return true;
  const selectedIds = new Set(block.sourceEntryIds);
  return block.sourceEntryIds.every((sourceId) => {
    const entry = entries.find((candidate) => candidate.id === sourceId);
    if (!entry || entry.type !== "message" || !isRecord(entry.message)) return false;
    if (!isProtocolMessage(entry.message)) return true;
    return isCompleteBlockProtocolAtom(entries, selectedIds, entry);
  });
}

function isCompleteBlockProtocolAtom(
  entries: readonly SessionLikeEntry[],
  selectedIds: ReadonlySet<string>,
  entry: SessionLikeEntry,
): boolean {
  if (!isRecord(entry.message)) return false;
  const message = entry.message;
  if (message.role === "assistant") {
    const ids = toolCallIds(message);
    return ids.length > 0 && ids.every((toolCallId) => {
      const results = entries.filter((candidate) => candidate.type === "message"
        && isRecord(candidate.message)
        && candidate.message.role === "toolResult"
        && candidate.message.toolCallId === toolCallId);
      return results.length > 0 && results.every((result) => selectedIds.has(result.id));
    });
  }
  const toolCallId = message.toolCallId;
  if (message.role !== "toolResult" || typeof toolCallId !== "string") return false;
  const callers = entries.filter((candidate) => candidate.type === "message"
    && isRecord(candidate.message)
    && candidate.message.role === "assistant"
    && toolCallIds(candidate.message).includes(toolCallId));
  return callers.length === 1
    && selectedIds.has(callers[0]!.id)
    && isCompleteBlockProtocolAtom(entries, selectedIds, callers[0]!);
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
    for (const part of message.content) if (isRecord(part) && part.type === "toolCall" && typeof part.id === "string") ids.push(part.id);
  }
  return ids;
}

function hasValidCoolingAtom(entries: readonly SessionLikeEntry[], block: CompactBlock): boolean {
  if (block.kind !== "cool") return true;
  if (block.sourceEntryIds.length !== 1 || !block.stub) return false;
  const index = entries.findIndex((entry) => entry.id === block.sourceEntryIds[0]);
  const source = entries[index];
  if (index < 0 || !source || source.type !== "message" || !isRecord(source.message)) return false;
  const toolCallId = source.message.toolCallId;
  if (source.message.role !== "toolResult" || typeof toolCallId !== "string" || hasImageContent(source.message.content)) return false;
  return entries.slice(0, index).some((entry) => hasToolCall(entry, toolCallId));
}

function hasToolCall(entry: SessionLikeEntry, toolCallId: string): boolean {
  if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") return false;
  if (Array.isArray(entry.message.toolCalls) && entry.message.toolCalls.some((call) => isRecord(call) && call.id === toolCallId)) return true;
  return Array.isArray(entry.message.content)
    && entry.message.content.some((part) => isRecord(part) && part.type === "toolCall" && part.id === toolCallId);
}

function hasImageContent(content: unknown): boolean {
  return Array.isArray(content) && content.some((part) => isRecord(part) && part.type === "image");
}

export function transactionFromEntry(entry: SessionLikeEntry): CompactTransaction | undefined {
  if (entry.type === "custom" && entry.customType === AILI_COMPACT_ENTRY && isCompactTransaction(entry.data)) return entry.data;
  if (entry.type !== "message" || !isRecord(entry.message)) return undefined;
  if (entry.message.role !== "toolResult" || entry.message.isError === true || !isRecord(entry.message.details)) return undefined;
  const candidate = entry.message.details.contextTx;
  if (!isCompactTransaction(candidate)) return undefined;
  if (typeof entry.message.toolCallId !== "string" || entry.message.toolCallId !== candidate.id) return undefined;
  if (typeof entry.message.toolName !== "string" || !isMatchingMutationTool(entry.message.toolName, candidate.kind)) return undefined;
  return candidate;
}

function isMatchingMutationTool(toolName: string, kind: CompactTransaction["kind"]): boolean {
  return (kind === "compact" && toolName === "aili_compact")
    || (kind === "prune" && toolName === "aili_prune")
    || (kind === "decompress" && toolName === "aili_decompress");
}

export function activeBlocks(state: CompactState): CompactBlock[] {
  return [...state.blocks.values()].filter((block) => block.active && !block.queryOnly && block.epochId === state.epochId);
}
