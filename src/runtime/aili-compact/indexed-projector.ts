import {
  addBranchIndexCounters,
  branchIndexKeyId,
  descriptorCanonical,
  describeOwnedProviderMessage,
  getIndexedEntry,
  readBranchProviderFrontierSources,
  type BranchIndexCounters,
  type BranchIndexSnapshot,
  type BranchProviderMessageDescriptor,
} from "./branch-index.js";
import {
  digest,
  digestCanonicalJson,
  type CompactBlock,
  type CompactState,
} from "./contracts.js";
import { type ProjectionMessage } from "./projector.js";
import {
  MAX_PROVIDER_FRONTIER_DESCRIPTORS,
  providerFrontierDescriptorIdentity,
  providerFrontierDescriptorMessage,
  providerFrontierProjectionIdentity,
  providerFrontierSelectionResultMatches,
  providerFrontierSelectionMatches,
  type ProviderFrontierBlock,
  type ProviderFrontierSelection,
} from "./provider-frontier.js";
import { estimateTokenBounds, type ResolvedTokenBoundProfile } from "./safe-planning.js";
import { type V3RuntimeView } from "./v3-runtime.js";
import type { V3SemanticBlock } from "./v3.js";

export interface IndexedProviderFrontierInput {
  snapshot: BranchIndexSnapshot;
  state: CompactState;
  view: V3RuntimeView;
  protectedEntryIds: readonly string[];
  configIdentity: string;
  profile: ResolvedTokenBoundProfile;
  contextWindow?: number;
  safetyReserve?: number;
  selection?: ProviderFrontierSelection;
}

export interface IndexedProviderFrontierResult {
  messages: readonly ProjectionMessage[];
  canonicalMessages: string;
  hash: string;
  structuredToolPartCount: number;
  hasBinaryOrImage: boolean;
  projectedBlockIds: readonly string[];
  descriptorIdentity: string;
  identity: string;
  tokenUpper: number;
  selectionExpanded: boolean;
  counters: BranchIndexCounters;
  diagnostic?: string;
}

/**
 * Builds the provider-only active frontier directly from immutable ledger
 * snapshots. Historical raw provider messages never enter alignment or
 * canonicalization on this healthy path.
 */
export function projectIndexedProviderFrontier(input: IndexedProviderFrontierInput): IndexedProviderFrontierResult {
  const source = readBranchProviderFrontierSources(input.snapshot, input.protectedEntryIds);
  const fail = (diagnostic: string, counters: BranchIndexCounters = source.counters): IndexedProviderFrontierResult => ({
    messages: [],
    canonicalMessages: "[]",
    hash: digestCanonicalJson("[]"),
    structuredToolPartCount: 0,
    hasBinaryOrImage: false,
    projectedBlockIds: [],
    descriptorIdentity: "unavailable",
    identity: "unavailable",
    tokenUpper: 0,
    selectionExpanded: false,
    counters,
    diagnostic,
  });
  if (!source.ok) return fail(source.diagnostic, source.counters);
  if (input.snapshot.key.epochId !== input.state.epochId || input.view.state.epochId !== input.state.epochId) {
    source.counters.providerFrontierFallbacks += 1;
    return fail("stale-epoch");
  }
  const active = frontierBlocks(input.state, input.view);
  const descriptors = active.slice(0, MAX_PROVIDER_FRONTIER_DESCRIPTORS);
  const descriptorIdentity = providerFrontierDescriptorIdentity(descriptors);
  const selectionCurrent = providerFrontierSelectionMatches(
    input.selection,
    active,
    {
      ...selectionBindingScope(input.snapshot, source.sources, input.protectedEntryIds, input.selection),
      configIdentity: input.configIdentity,
      profile: input.profile,
      contextWindow: input.contextWindow,
      safetyReserve: input.safetyReserve,
    },
  );
  if (input.selection && !selectionCurrent) source.counters.providerFrontierInvalidations += 1;
  const committedCompactIds = new Set([...input.view.state.blocks.values()]
    .filter((block) => block.active && !block.queryOnly && block.epochId === input.view.state.epochId)
    .map((block) => block.transactionId));
  const retained = retainCurrentSelectionSources(source.sources, input.selection, selectionCurrent, active, committedCompactIds);
  const selectionExpanded = selectionCurrent && retained.selectionRetained;
  if (selectionCurrent && !selectionExpanded) source.counters.providerFrontierInvalidations += 1;
  const descriptorMessages = descriptors.map(providerFrontierDescriptorMessage);
  source.counters.providerFrontierDescriptorDerivations = descriptors.length;
  source.counters.providerFrontierSelectedExpansions = selectionExpanded ? input.selection!.binding.blockRefs.length : 0;
  const messages = [...retained.messages, ...descriptorMessages];
  const described = messages.map((message) => describeOwnedProviderMessage(message));
  const protocolDiagnostic = validateDescriptorProtocol(described);
  if (protocolDiagnostic) {
    source.counters.providerFrontierFallbacks += 1;
    return fail(protocolDiagnostic);
  }
  const canonicalMessages = `[${described.map(descriptorCanonical).join(",")}]`;
  const structuredToolPartCount = described.reduce((sum, descriptor) => sum + descriptor.structuredToolPartCount, 0);
  const tokenUpper = estimateTokenBounds({
    utf8Bytes: Buffer.byteLength(canonicalMessages, "utf8"),
    messageCount: messages.length,
    structuredToolPartCount,
  }, input.profile).upper;
  const hasContextBudget = validContextBudget(input.contextWindow, input.safetyReserve);
  const overBudget = hasContextBudget && tokenUpper + input.safetyReserve! > input.contextWindow!;
  if (selectionExpanded && (!hasContextBudget || overBudget)) {
    source.counters.providerFrontierInvalidations += 1;
    source.counters.providerFrontierFallbacks += 1;
    const fallback = projectIndexedProviderFrontier({ ...input, selection: undefined });
    return { ...fallback, counters: addBranchIndexCounters(source.counters, fallback.counters) };
  }
  if (overBudget) {
    source.counters.providerFrontierFallbacks += 1;
    return fail("frontier-over-budget");
  }
  const identity = providerFrontierProjectionIdentity({
    branchKeyId: input.snapshot.keyId,
    sourceRevision: input.snapshot.sourceDigest,
    proofRevision: input.snapshot.replayDigest,
    descriptorIdentity,
    configIdentity: input.configIdentity,
    profileKey: input.profile.profileKey,
    contextWindow: input.contextWindow ?? 0,
    safetyReserve: input.safetyReserve ?? 0,
    protectedEntryIds: input.protectedEntryIds,
    selectedBlockRefs: selectionExpanded ? input.selection!.binding.blockRefs : [],
  });
  return {
    messages,
    canonicalMessages,
    hash: digestCanonicalJson(canonicalMessages),
    structuredToolPartCount,
    hasBinaryOrImage: described.some((descriptor) => descriptor.hasBinaryOrImage),
    projectedBlockIds: descriptors.map((block) => block.blockId),
    descriptorIdentity,
    identity,
    tokenUpper,
    selectionExpanded,
    counters: source.counters,
  };
}

/** Computes a default-frontier cache key without touching provider or raw source bodies. */
export function indexedProviderFrontierCacheIdentity(input: Omit<IndexedProviderFrontierInput, "selection">): string | undefined {
  if (!validContextBudget(input.contextWindow, input.safetyReserve)) return undefined;
  const descriptors = frontierBlocks(input.state, input.view).slice(0, MAX_PROVIDER_FRONTIER_DESCRIPTORS);
  return providerFrontierProjectionIdentity({
    branchKeyId: input.snapshot.keyId,
    sourceRevision: input.snapshot.sourceDigest,
    proofRevision: input.snapshot.replayDigest,
    descriptorIdentity: providerFrontierDescriptorIdentity(descriptors),
    configIdentity: input.configIdentity,
    profileKey: input.profile.profileKey,
    contextWindow: input.contextWindow,
    safetyReserve: input.safetyReserve!,
    protectedEntryIds: input.protectedEntryIds,
    selectedBlockRefs: [],
  });
}

/** Exposes only current descriptor metadata plus selected summary text for the recap tool. */
export function indexedProviderFrontierBlocks(state: CompactState, view: V3RuntimeView): readonly ProviderFrontierBlock[] {
  return frontierBlocks(state, view);
}

function frontierBlocks(state: CompactState, view: V3RuntimeView): ProviderFrontierBlock[] {
  return view.catalog.blocks.flatMap((reference) => {
    if (!reference.frontierEligible) return [];
    if (reference.family === "legacy") {
      const block = state.blocks.get(reference.blockId);
      return block?.active ? [legacyFrontierBlock(block, reference.ref)] : [];
    }
    const block = view.state.blocks.get(reference.blockId);
    return block?.active && !block.queryOnly && block.epochId === view.state.epochId
      ? [v3FrontierBlock(block, reference.ref)]
      : [];
  });
}

function legacyFrontierBlock(block: CompactBlock, blockRef: string): ProviderFrontierBlock {
  return {
    blockId: block.id,
    blockRef,
    epochId: block.epochId,
    schema: "legacy",
    ...(block.topic ? { topic: block.topic } : {}),
    sourceKind: block.mode ?? block.kind,
    leafCount: block.sourceEntryIds.length,
    sourceDigest: block.sourceDigest,
    summaryDigest: digest(block.summary),
    summary: block.summary,
  };
}

function v3FrontierBlock(block: V3SemanticBlock, blockRef: string): ProviderFrontierBlock {
  return {
    blockId: block.blockId,
    blockRef,
    epochId: block.epochId,
    schema: "v3",
    topic: block.topic,
    sourceKind: block.source.kind,
    leafCount: block.leafCount,
    sourceDigest: block.leafDigest,
    summaryDigest: block.summaryDigest,
    summary: block.summary,
  };
}

function retainCurrentSelectionSources(
  sources: readonly { entryId: string; message: Readonly<Record<string, unknown>> }[],
  selection: ProviderFrontierSelection | undefined,
  selectionCurrent: boolean,
  activeBlocks: readonly ProviderFrontierBlock[],
  committedCompactIds: ReadonlySet<string>,
): { messages: ProjectionMessage[]; selectionRetained: boolean } {
  const calls = new Map<string, { name: string }>();
  for (const { message } of sources) {
    const call = singleToolCall(message);
    if (call) calls.set(call.id, { name: call.name });
  }
  const keepSelection = selectionCurrent ? selection : undefined;
  const selectionSourcesCurrent = keepSelection !== undefined
    && sources.filter(({ message }) => {
      const call = singleToolCall(message);
      return call?.name === "aili_context_recap" && call.id === keepSelection.toolCallId;
    }).length === 1
    && sources.filter(({ message }) => message.role === "toolResult" && message.toolCallId === keepSelection.toolCallId).length === 1
    && sources.some(({ message }) => providerFrontierSelectionResultMatches(
      message as Record<string, unknown>,
      keepSelection,
      activeBlocks,
    ));
  const messages = sources.flatMap(({ message }) => {
    const call = singleToolCall(message);
    if (call?.name === "aili_context_recap") {
      const current = selectionSourcesCurrent && keepSelection?.toolCallId === call.id;
      return current ? [message as ProjectionMessage] : [];
    }
    if (call?.name === "aili_compact" && committedCompactIds.has(call.id)) return [];
    if (call?.name.startsWith("aili_")) {
      return [];
    }
    if (message.role === "toolResult" && typeof message.toolCallId === "string") {
      const callName = calls.get(message.toolCallId)?.name;
      if (callName === "aili_context_recap") {
        const current = selectionSourcesCurrent
          && keepSelection?.toolCallId === message.toolCallId
          && providerFrontierSelectionResultMatches(message as Record<string, unknown>, keepSelection, activeBlocks)
          && resultBodyDigest(message) === keepSelection.resultBodyDigest;
        return current ? [message as ProjectionMessage] : [];
      }
      if (callName === "aili_compact" && committedCompactIds.has(message.toolCallId)) return [];
      if (callName?.startsWith("aili_")) {
        return [];
      }
    }
    return [message as ProjectionMessage];
  });
  return { messages, selectionRetained: selectionSourcesCurrent };
}

/**
 * A tool executes against the verified snapshot immediately before its recap
 * call is appended. The current snapshot may contain only the protected
 * call/result/request suffix; any other suffix entry makes the selection
 * stale rather than widening the provider frontier.
 */
function selectionBindingScope(
  snapshot: BranchIndexSnapshot,
  sources: readonly { entryId: string; message: Readonly<Record<string, unknown>> }[],
  protectedEntryIds: readonly string[],
  selection: ProviderFrontierSelection | undefined,
): {
  branchKeyId?: string;
  epochId?: string;
  sourceRevision?: string;
  proofRevision?: string;
} {
  if (!selection) return {};
  const calls = sources.filter(({ message }) => {
    const call = singleToolCall(message);
    return call?.name === "aili_context_recap" && call.id === selection.toolCallId;
  });
  const results = sources.filter(({ message }) => message.role === "toolResult"
    && message.toolCallId === selection.toolCallId);
  const call = calls[0];
  const result = results[0];
  if (calls.length !== 1 || results.length !== 1 || !call || !result) return {};
  const callRecord = getIndexedEntry(snapshot, call.entryId);
  const resultRecord = getIndexedEntry(snapshot, result.entryId);
  const priorRecord = callRecord?.parentId ? getIndexedEntry(snapshot, callRecord.parentId) : undefined;
  if (!callRecord
    || !resultRecord
    || !priorRecord
    || callRecord.epochId !== snapshot.key.epochId
    || resultRecord.epochId !== snapshot.key.epochId
    || resultRecord.parentId !== callRecord.entryId
    || !selectionSuffixIsProtected(snapshot, callRecord.entryId, protectedEntryIds)) return {};
  return {
    branchKeyId: branchIndexKeyId({ ...snapshot.key, branchLeafId: priorRecord.entryId }),
    epochId: snapshot.key.epochId,
    sourceRevision: priorRecord.ancestryDigest,
    proofRevision: snapshot.replayDigest,
  };
}

function selectionSuffixIsProtected(
  snapshot: BranchIndexSnapshot,
  callEntryId: string,
  protectedEntryIds: readonly string[],
): boolean {
  const protectedIds = new Set(protectedEntryIds);
  let entryId = snapshot.tipEntryId;
  for (let remaining = protectedIds.size + 1; entryId && remaining > 0; remaining -= 1) {
    const entry = getIndexedEntry(snapshot, entryId);
    if (!entry) return false;
    if (entry.entryId === callEntryId) return protectedIds.has(entry.entryId);
    if (!protectedIds.has(entry.entryId)) return false;
    entryId = entry.parentId;
  }
  return false;
}

function singleToolCall(message: Readonly<Record<string, unknown>>): { id: string; name: string } | undefined {
  if (message.role !== "assistant") return undefined;
  const calls = Array.isArray(message.content)
    ? message.content.filter((part): part is Record<string, unknown> => typeof part === "object" && part !== null
      && (part as Record<string, unknown>).type === "toolCall")
    : [];
  if (calls.length !== 1) return undefined;
  const call = calls[0]!;
  return typeof call.name === "string" && typeof call.id === "string" ? { id: call.id, name: call.name } : undefined;
}

function resultBodyDigest(message: Readonly<Record<string, unknown>>): string {
  const content = message.content;
  const text = Array.isArray(content)
    ? content.find((part) => typeof part === "object" && part !== null
      && (part as Record<string, unknown>).type === "text"
      && typeof (part as Record<string, unknown>).text === "string") as Record<string, unknown> | undefined
    : undefined;
  return digest(typeof text?.text === "string" ? text.text : typeof content === "string" ? content : "");
}

function validContextBudget(contextWindow: unknown, safetyReserve: unknown): contextWindow is number {
  return typeof contextWindow === "number"
    && Number.isSafeInteger(contextWindow)
    && contextWindow > 0
    && typeof safetyReserve === "number"
    && Number.isSafeInteger(safetyReserve)
    && safetyReserve >= 0
    && safetyReserve < contextWindow;
}

function validateDescriptorProtocol(descriptors: readonly BranchProviderMessageDescriptor[]): string | undefined {
  if (!descriptors.some((descriptor) => descriptor.role === "user")) return "missing-user-message";
  const calls = new Map<string, { index: number; name?: string }>();
  const results = new Set<string>();
  const pending = new Set<string>();
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index]!;
    if (!descriptor.role || descriptor.protocolMalformed) return descriptor.role ? "invalid-tool-pair" : "invalid-role";
    if (pending.size > 0 && descriptor.role !== "toolResult") return "invalid-role-order";
    if (descriptor.namedToolCalls.length > 0 && descriptor.role !== "assistant") return "invalid-role";
    for (const call of descriptor.namedToolCalls) {
      if (calls.has(call.id) || !call.name) return "invalid-tool-pair";
      calls.set(call.id, { index, name: call.name });
      pending.add(call.id);
    }
    if (descriptor.role !== "toolResult") continue;
    if (!descriptor.toolCallId || results.has(descriptor.toolCallId)) return "invalid-tool-pair";
    const call = calls.get(descriptor.toolCallId);
    if (!call || call.index >= index || call.name !== descriptor.toolName) return "invalid-tool-pair";
    results.add(descriptor.toolCallId);
    pending.delete(descriptor.toolCallId);
  }
  return [...calls.keys()].every((id) => results.has(id)) ? undefined : "invalid-tool-pair";
}
