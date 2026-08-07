import { digest, isRecord, type CompactState, type SessionLikeEntry } from "./contracts.js";

const AILI_TOOL_NAMES = new Set([
  "aili_compact",
  "aili_decompress",
  "aili_prune",
  "aili_search_context",
  "aili_compact_status",
  "aili_context_recap",
]);

export interface CompactMessageReference {
  ref: string;
  entryId: string;
  epochId: string;
  ordinal: number;
  role?: string;
  atomEntryIds: readonly string[];
}

export interface CompactBlockReference {
  ref: string;
  blockId: string;
  epochId: string;
  ordinal: number;
  active: boolean;
  queryOnly: boolean;
}

export interface CompactReferenceCatalog {
  catalogId: string;
  epochId: string;
  messages: readonly CompactMessageReference[];
  blocks: readonly CompactBlockReference[];
}

export interface CompactReferencePage {
  catalogId: string;
  epochId: string;
  offset: number;
  limit: number;
  messages: readonly CompactMessageReference[];
  blocks: readonly CompactBlockReference[];
  nextOffset?: number;
}

export function buildReferenceCatalog(
  entries: readonly SessionLikeEntry[],
  state: CompactState,
): CompactReferenceCatalog {
  const epochStart = findEpochStart(entries, state.epochId);
  const epochEntries = entries.slice(epochStart);
  const sourceEntries = epochEntries
    .filter((entry) => entry.type === "message" && isRecord(entry.message) && !isAiliProtocolMessage(entry.message));
  const messages = sourceEntries.map((entry, index): CompactMessageReference => ({
    ref: formatReference("m", index + 1),
    entryId: entry.id,
    epochId: state.epochId,
    ordinal: index + 1,
    ...(isRecord(entry.message) && typeof entry.message.role === "string" ? { role: entry.message.role } : {}),
    atomEntryIds: protocolAtomEntryIds(epochEntries, entry),
  }));
  const blocks = [...state.blocks.values()]
    .filter((block) => block.epochId === state.epochId)
    .map((block, index): CompactBlockReference => ({
      ref: formatReference("b", index + 1),
      blockId: block.id,
      epochId: state.epochId,
      ordinal: index + 1,
      active: block.active && !block.queryOnly,
      queryOnly: block.queryOnly === true,
    }));
  const catalogId = digest({
    epochId: state.epochId,
    messageEntryIds: messages.map((message) => message.entryId),
    blocks: blocks.map((block) => ({ blockId: block.blockId, active: block.active, queryOnly: block.queryOnly })),
  });
  return { catalogId, epochId: state.epochId, messages, blocks };
}

export function pageReferenceCatalog(
  catalog: CompactReferenceCatalog,
  offset = 0,
  limit = 32,
): CompactReferencePage {
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const safeLimit = Number.isInteger(limit) ? Math.min(64, Math.max(1, limit)) : 32;
  const messages = catalog.messages.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + messages.length < catalog.messages.length ? safeOffset + messages.length : undefined;
  return {
    catalogId: catalog.catalogId,
    epochId: catalog.epochId,
    offset: safeOffset,
    limit: safeLimit,
    messages,
    blocks: catalog.blocks.filter((block) => block.active).slice(0, 32),
    ...(nextOffset === undefined ? {} : { nextOffset }),
  };
}

export function resolveMessageReference(
  catalog: CompactReferenceCatalog,
  catalogId: string,
  reference: string,
): CompactMessageReference | undefined {
  if (catalogId !== catalog.catalogId || !/^m\d{6}$/.test(reference)) return undefined;
  return catalog.messages.find((message) => message.ref === reference);
}

export function resolveBlockReference(
  catalog: CompactReferenceCatalog,
  catalogId: string,
  reference: string,
): CompactBlockReference | undefined {
  if (catalogId !== catalog.catalogId || !/^b\d{6}$/.test(reference)) return undefined;
  return catalog.blocks.find((block) => block.ref === reference);
}

export function blockReferenceFor(state: CompactState, blockId: string): string | undefined {
  const index = [...state.blocks.values()].filter((block) => block.epochId === state.epochId).findIndex((block) => block.id === blockId);
  return index < 0 ? undefined : formatReference("b", index + 1);
}

function formatReference(prefix: "m" | "b", ordinal: number): string {
  return `${prefix}${ordinal.toString().padStart(6, "0")}`;
}

function findEpochStart(entries: readonly SessionLikeEntry[], epochId: string): number {
  if (epochId === "root") return 0;
  const index = entries.findIndex((entry) => entry.type === "compaction" && entry.id === epochId);
  return index < 0 ? entries.length : index + 1;
}

function isAiliProtocolMessage(message: Record<string, unknown>): boolean {
  if (typeof message.toolName === "string" && AILI_TOOL_NAMES.has(message.toolName)) return true;
  return toolCalls(message).some((call) => AILI_TOOL_NAMES.has(call.name));
}

function protocolAtomEntryIds(entries: readonly SessionLikeEntry[], entry: SessionLikeEntry): readonly string[] {
  if (!isRecord(entry.message)) return [entry.id];
  const message = entry.message;
  if (message.role === "assistant") {
    const callIds = toolCalls(message).map((call) => call.id);
    if (callIds.length === 0) return [entry.id];
    return [entry.id, ...entries.filter((candidate) => candidate.type === "message"
      && isRecord(candidate.message)
      && candidate.message.role === "toolResult"
      && typeof candidate.message.toolCallId === "string"
      && callIds.includes(candidate.message.toolCallId)).map((candidate) => candidate.id)];
  }
  if (message.role === "toolResult" && typeof message.toolCallId === "string") {
    const caller = entries.find((candidate) => candidate.type === "message"
      && isRecord(candidate.message)
      && candidate.message.role === "assistant"
      && toolCalls(candidate.message).some((call) => call.id === message.toolCallId));
    if (!caller || !isRecord(caller.message)) return [entry.id];
    return protocolAtomEntryIds(entries, caller);
  }
  return [entry.id];
}

function toolCalls(message: Record<string, unknown>): Array<{ id: string; name: string }> {
  const calls: Array<{ id: string; name: string }> = [];
  if (Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) {
      if (isRecord(call) && typeof call.id === "string" && typeof call.name === "string") calls.push({ id: call.id, name: call.name });
    }
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (isRecord(part) && part.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string") {
        calls.push({ id: part.id, name: part.name });
      }
    }
  }
  return calls;
}
