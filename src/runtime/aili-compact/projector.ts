import {
  canonicalJson,
  digest,
  isRecord,
  type CompactBlock,
  type CompactState,
  type SessionLikeEntry,
} from "./contracts.js";
import { alignProviderMessages } from "./alignment.js";
import { blockReferenceFor } from "./references.js";
import { activeBlocks } from "./reducer.js";

export interface ProjectionMessage extends Record<string, unknown> {
  role?: string;
  content?: unknown;
}

export interface ProjectionResult<T extends ProjectionMessage> {
  messages: readonly T[];
  hash: string;
  earliestChangeIndex?: number;
  diagnostic?: string;
}

export interface ProjectionOptions {
  blockReferenceFor?: (blockId: string) => string | undefined;
}

export type RecapProjection = { call: ProjectionMessage; result: ProjectionMessage };

export function alignEntriesToMessages(
  entries: readonly SessionLikeEntry[],
  messages: readonly ProjectionMessage[],
): { byEntryId: ReadonlyMap<string, number>; diagnostic?: string } {
  const result = alignProviderMessages(entries, messages);
  const diagnostic = result.diagnostic?.startsWith("alignment-ambiguous:")
    ? `ambiguous-entry:${result.diagnostic.slice("alignment-ambiguous:".length)}`
    : result.diagnostic;
  return { byEntryId: result.byEntryId, ...(diagnostic ? { diagnostic } : {}) };
}

export function projectMessages<T extends ProjectionMessage>(
  messages: readonly T[],
  state: CompactState,
  byEntryId: ReadonlyMap<string, number>,
  options: ProjectionOptions = {},
): ProjectionResult<T> {
  const sourceSnapshot = canonicalJson(messages);
  const originalHash = digest(messages);
  if (!state.enabled) return { messages, hash: originalHash };
  try {
    const inputError = validateWholeOutput(messages);
    if (inputError) return failOpen(messages, originalHash, inputError);

    const hidden = new Set<number>();
    const stubs = new Map<number, unknown>();
    const recaps = new Map<number, RecapProjection>();
    const semanticBlockIds = new Set<string>();
    const claimedIndexes = new Set<number>();
    const protectedUserIndexes = recentUserIndexes(messages, 1);

    for (const block of activeBlocks(state)) {
      const indexes = block.sourceEntryIds.map((id) => byEntryId.get(id));
      if (indexes.some((index) => index === undefined)) return failOpen(messages, originalHash, `unaligned-block:${block.id}`);
      const selectedIndexes = indexes as number[];
      if (new Set(selectedIndexes).size !== selectedIndexes.length || selectedIndexes.some((index) => claimedIndexes.has(index))) {
        return failOpen(messages, originalHash, `protected-range:${block.id}`);
      }
      if (selectedIndexes.some((index) => index < 0 || index >= messages.length)) {
        return failOpen(messages, originalHash, `unaligned-block:${block.id}`);
      }
      if (block.kind !== "cool" && selectedIndexes.some((index) => protectedUserIndexes.has(index))) {
        return failOpen(messages, originalHash, `protected-range:${block.id}`);
      }
      if (projectedSourceDigest(block, messages, byEntryId) !== block.sourceDigest) {
        return failOpen(messages, originalHash, `digest-mismatch:${block.id}`);
      }
      selectedIndexes.forEach((index) => claimedIndexes.add(index));
      const blockIndexes = new Set(selectedIndexes);
      for (const index of selectedIndexes) {
        const message = messages[index]!;
        if (block.kind === "cool") {
          if (!block.stub || !isPairedToolResult(messages, index, message)) return failOpen(messages, originalHash, `invalid-stub:${block.id}`);
          stubs.set(index, stubContent(message.content, block.stub));
          continue;
        }
        if (isProtocolMessage(message) && !isCompleteProjectionProtocolAtom(messages, index, blockIndexes)) {
          return failOpen(messages, originalHash, `protocol-block:${block.id}`);
        }
        hidden.add(index);
      }
      if (block.kind === "semantic") {
        const anchorEntryId = block.anchorEntryId ?? block.sourceEntryIds[0];
        const anchorIndex = anchorEntryId ? byEntryId.get(anchorEntryId) : undefined;
        const blockRef = options.blockReferenceFor?.(block.id) ?? blockReferenceFor(state, block.id);
        if (anchorIndex === undefined || !blockIndexes.has(anchorIndex) || !blockRef || recaps.has(anchorIndex)) {
          return failOpen(messages, originalHash, `invalid-recap-anchor:${block.id}`);
        }
        recaps.set(anchorIndex, semanticRecapProjection(block, blockRef));
        semanticBlockIds.add(block.id);
      }
    }

    hideCommittedCompactProtocol(messages, semanticBlockIds, hidden);
    const constructProjection = (): T[] => messages.flatMap((message, index) => {
      const recap = recaps.get(index);
      const prefix = recap ? [recap.call as T, recap.result as T] : [];
      if (hidden.has(index)) return prefix;
      return stubs.has(index) ? [...prefix, { ...message, content: stubs.get(index) } as T] : [...prefix, message];
    });
    const projected = constructProjection();
    const outputError = validateWholeOutput(projected);
    if (outputError) return failOpen(messages, originalHash, outputError);
    if (!preservesUntouchedReferences(messages, projected, hidden, stubs)) {
      return failOpen(messages, originalHash, "protected-range:output");
    }
    if (sourceSnapshot !== canonicalJson(messages)) return failOpen(messages, originalHash, "source-mutation");
    if (canonicalJson(projected) !== canonicalJson(constructProjection())) {
      return failOpen(messages, originalHash, "non-idempotent-output");
    }
    const hash = digest(projected);
    if (hash !== digest(constructProjection())) return failOpen(messages, originalHash, "canonical-hash-mismatch");
    const earliestChangeIndex = firstChange(messages, projected);
    return { messages: projected, hash, earliestChangeIndex };
  } catch (error) {
    return failOpen(messages, originalHash, `projection-error:${error instanceof Error ? error.name : "unknown"}`);
  }
}

/** The single production recap envelope used by projection and token economics. */
export function semanticRecapProjection(block: CompactBlock, blockRef: string): RecapProjection {
  const callId = `aili-recap-${digest({ epochId: block.epochId, blockId: block.id }).slice(0, 24)}`;
  const metadata = [
    `block=${blockRef}`,
    `topic=${block.topic ?? "(none)"}`,
    `mode=${block.mode ?? "legacy"}`,
    `sources=${block.sourceEntryIds.length}`,
  ].join("; ");
  return {
    call: {
      role: "assistant",
      content: [{ type: "toolCall", id: callId, name: "aili_context_recap", arguments: { blockRef } }],
    },
    result: {
      role: "toolResult",
      toolCallId: callId,
      toolName: "aili_context_recap",
      content: [{ type: "text", text: `[AILI Compact recap; ${metadata}]\n${block.summary}` }],
      isError: false,
    },
  };
}

function hideCommittedCompactProtocol(
  messages: readonly ProjectionMessage[],
  activeSemanticBlockIds: ReadonlySet<string>,
  hidden: Set<number>,
): void {
  if (activeSemanticBlockIds.size === 0) return;
  for (const [resultIndex, message] of messages.entries()) {
    if (message.role !== "toolResult" || message.toolName !== "aili_compact" || typeof message.toolCallId !== "string") continue;
    if (!isRecord(message.details) || !isRecord(message.details.contextTx) || !Array.isArray(message.details.contextTx.blocks)) continue;
    const commitsActiveBlock = message.details.contextTx.blocks.some((block) => isRecord(block)
      && typeof block.id === "string"
      && activeSemanticBlockIds.has(block.id));
    if (!commitsActiveBlock) continue;
    const callerIndexes = messages.flatMap((candidate, index) => hasNamedToolCall(candidate, message.toolCallId as string, "aili_compact") ? [index] : []);
    if (callerIndexes.length === 1 && callerIndexes[0]! < resultIndex) {
      hidden.add(callerIndexes[0]!);
      hidden.add(resultIndex);
    }
  }
}

function failOpen<T extends ProjectionMessage>(messages: readonly T[], hash: string, diagnostic: string): ProjectionResult<T> {
  return { messages, hash, diagnostic };
}

function isProtocolMessage(message: ProjectionMessage): boolean {
  if (message.role === "toolResult") return true;
  if (message.role !== "assistant") return false;
  return Array.isArray(message.toolCalls) && message.toolCalls.length > 0
    || Array.isArray(message.content) && message.content.some((part) => isRecord(part) && part.type === "toolCall");
}

function isPairedToolResult(messages: readonly ProjectionMessage[], index: number, message: ProjectionMessage): boolean {
  const toolCallId = message.toolCallId;
  if (message.role !== "toolResult" || typeof toolCallId !== "string") return false;
  return messages.slice(0, index).some((candidate) => hasToolCall(candidate, toolCallId));
}

function isCompleteProjectionProtocolAtom(
  messages: readonly ProjectionMessage[],
  index: number,
  selectedIndexes: ReadonlySet<number>,
): boolean {
  const message = messages[index]!;
  if (message.role === "assistant") {
    const callIds = toolCallIds(message);
    return callIds.length > 0 && callIds.every((toolCallId) => {
      const resultIndexes = messages.flatMap((candidate, candidateIndex) => candidate.role === "toolResult" && candidate.toolCallId === toolCallId ? [candidateIndex] : []);
      return resultIndexes.length > 0 && resultIndexes.every((resultIndex) => selectedIndexes.has(resultIndex));
    });
  }
  const toolCallId = message.toolCallId;
  if (message.role !== "toolResult" || typeof toolCallId !== "string") return false;
  const callerIndexes = messages.flatMap((candidate, candidateIndex) => hasToolCall(candidate, toolCallId) ? [candidateIndex] : []);
  return callerIndexes.length === 1
    && selectedIndexes.has(callerIndexes[0]!)
    && isCompleteProjectionProtocolAtom(messages, callerIndexes[0]!, selectedIndexes);
}

function hasNamedToolCall(message: ProjectionMessage, toolCallId: string, toolName: string): boolean {
  if (message.role !== "assistant") return false;
  if (Array.isArray(message.toolCalls) && message.toolCalls.some((call) => isRecord(call) && call.id === toolCallId && call.name === toolName)) return true;
  return Array.isArray(message.content)
    && message.content.some((part) => isRecord(part) && part.type === "toolCall" && part.id === toolCallId && part.name === toolName);
}

function hasToolCall(message: ProjectionMessage, toolCallId: string): boolean {
  if (message.role !== "assistant") return false;
  if (Array.isArray(message.toolCalls) && message.toolCalls.some((call) => isRecord(call) && call.id === toolCallId)) return true;
  return Array.isArray(message.content)
    && message.content.some((part) => isRecord(part) && part.type === "toolCall" && part.id === toolCallId);
}

function stubContent(content: unknown, stub: string): unknown {
  return Array.isArray(content) ? [{ type: "text", text: stub }] : stub;
}

function validateWholeOutput(messages: readonly ProjectionMessage[]): string | undefined {
  if (!messages.some((message) => message.role === "user")) return "missing-user-message";
  const calls = new Map<string, { index: number; name?: string }>();
  const results = new Set<string>();
  const pendingResults = new Set<string>();
  for (const [index, message] of messages.entries()) {
    if (typeof message.role !== "string" || message.role.length === 0) return "invalid-role";
    if (pendingResults.size > 0 && message.role !== "toolResult") return "invalid-role-order";
    const namedCalls = toolCalls(message);
    if (namedCalls.length > 0 && message.role !== "assistant") return "invalid-role";
    for (const call of namedCalls) {
      if (calls.has(call.id) || typeof call.name !== "string" || call.name.length === 0) return "invalid-tool-pair";
      calls.set(call.id, { index, name: call.name });
      pendingResults.add(call.id);
    }
    if (message.role !== "toolResult") continue;
    if (typeof message.toolCallId !== "string" || results.has(message.toolCallId)) return "invalid-tool-pair";
    const call = calls.get(message.toolCallId);
    if (!call || call.index >= index || typeof message.toolName !== "string" || call.name !== message.toolName) {
      return "invalid-tool-pair";
    }
    results.add(message.toolCallId);
    pendingResults.delete(message.toolCallId);
  }
  return [...calls.keys()].every((id) => results.has(id)) ? undefined : "invalid-tool-pair";
}

function projectedSourceDigest(
  block: CompactBlock,
  messages: readonly ProjectionMessage[],
  byEntryId: ReadonlyMap<string, number>,
): string {
  const selected = block.sourceEntryIds
    .map((id) => ({ id, index: byEntryId.get(id) }))
    .filter((item): item is { id: string; index: number } => item.index !== undefined)
    .sort((left, right) => left.index - right.index)
    .map(({ id, index }) => ({ id, type: "message", message: messages[index] }));
  return digest(selected);
}

function recentUserIndexes(messages: readonly ProjectionMessage[], count: number): ReadonlySet<number> {
  const indexes = new Set<number>();
  for (let index = messages.length - 1; index >= 0 && indexes.size < count; index -= 1) {
    if (messages[index]?.role === "user") indexes.add(index);
  }
  return indexes;
}

function preservesUntouchedReferences<T extends ProjectionMessage>(
  original: readonly T[],
  projected: readonly T[],
  hidden: ReadonlySet<number>,
  stubs: ReadonlyMap<number, unknown>,
): boolean {
  let projectedIndex = 0;
  for (const [index, message] of original.entries()) {
    if (hidden.has(index) || stubs.has(index)) continue;
    while (projectedIndex < projected.length && projected[projectedIndex] !== message) projectedIndex += 1;
    if (projectedIndex === projected.length) return false;
    projectedIndex += 1;
  }
  return true;
}

function toolCalls(message: ProjectionMessage): Array<{ id: string; name?: string }> {
  const calls: Array<{ id: string; name?: string }> = [];
  if (Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) {
      if (isRecord(call) && typeof call.id === "string") calls.push({ id: call.id, ...(typeof call.name === "string" ? { name: call.name } : {}) });
    }
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (isRecord(part) && part.type === "toolCall" && typeof part.id === "string") {
        calls.push({ id: part.id, ...(typeof part.name === "string" ? { name: part.name } : {}) });
      }
    }
  }
  return calls;
}

function toolCallIds(message: ProjectionMessage): string[] {
  const ids: string[] = [];
  if (Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) if (isRecord(call) && typeof call.id === "string") ids.push(call.id);
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) if (isRecord(part) && part.type === "toolCall" && typeof part.id === "string") ids.push(part.id);
  }
  return ids;
}

function firstChange(before: readonly ProjectionMessage[], after: readonly ProjectionMessage[]): number | undefined {
  const max = Math.max(before.length, after.length);
  for (let index = 0; index < max; index += 1) {
    if (canonicalJson(before[index]) !== canonicalJson(after[index])) return index;
  }
  return undefined;
}
