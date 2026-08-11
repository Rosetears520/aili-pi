import { canonicalJson, digest, isRecord } from "./contracts.js";
import {
  estimateTokenBounds,
  type ResolvedTokenBoundProfile,
} from "./safe-planning.js";
import type { ProjectionMessage } from "./projector.js";

export const PROVIDER_FRONTIER_VERSION = "aili.compact.provider-frontier.v1" as const;
export const PROVIDER_FRONTIER_SELECTION_VERSION = "aili.compact.provider-frontier-selection.v2" as const;
export const MAX_PROVIDER_FRONTIER_DESCRIPTORS = 32;
export const MAX_PROVIDER_FRONTIER_SELECTIONS = 16;

export interface ProviderFrontierBlock {
  blockId: string;
  blockRef: string;
  epochId: string;
  schema: "legacy" | "v3";
  topic?: string;
  sourceKind: string;
  leafCount: number;
  sourceDigest: string;
  summaryDigest: string;
  summary: string;
}

export interface ProviderFrontierSelectionBinding {
  identity: string;
  branchKeyId: string;
  epochId: string;
  sourceRevision: string;
  proofRevision: string;
  descriptorIdentity: string;
  configIdentity: string;
  profileKey: string;
  contextWindow: number;
  safetyReserve: number;
  blockRefs: readonly string[];
}

export interface ProviderFrontierSelection {
  toolCallId: string;
  binding: ProviderFrontierSelectionBinding;
  resultBodyDigest: string;
}

export interface ProviderFrontierSelectionAdmission {
  ok: true;
  selection: ProviderFrontierSelection;
  resultText: string;
  expansionTokensUpper: number;
}

export interface ProviderFrontierSelectionRejection {
  ok: false;
  code: "unknown-context" | "unknown-model" | "invalid-selection" | "over-budget";
}

export type ProviderFrontierSelectionResult = ProviderFrontierSelectionAdmission | ProviderFrontierSelectionRejection;

export function providerFrontierDescriptorIdentity(blocks: readonly ProviderFrontierBlock[]): string {
  return digest({
    version: PROVIDER_FRONTIER_VERSION,
    blocks: blocks.map(descriptorIdentityRecord),
  });
}

export function providerFrontierProjectionIdentity(input: {
  branchKeyId: string;
  sourceRevision: string;
  proofRevision: string;
  descriptorIdentity: string;
  configIdentity: string;
  profileKey: string;
  contextWindow: number;
  safetyReserve: number;
  protectedEntryIds: readonly string[];
  selectedBlockRefs: readonly string[];
}): string {
  return digest({
    version: PROVIDER_FRONTIER_VERSION,
    branchKeyId: input.branchKeyId,
    sourceRevision: input.sourceRevision,
    proofRevision: input.proofRevision,
    descriptorIdentity: input.descriptorIdentity,
    configIdentity: input.configIdentity,
    profileKey: input.profileKey,
    contextWindow: input.contextWindow,
    safetyReserve: input.safetyReserve,
    protectedEntryIds: [...input.protectedEntryIds].sort(),
    selectedBlockRefs: [...input.selectedBlockRefs].sort(),
  });
}

/** Produces the bounded, summary-free provider representation for one active block. */
export function providerFrontierDescriptorProjection(block: ProviderFrontierBlock): {
  call: ProjectionMessage;
  result: ProjectionMessage;
} {
  const descriptor = descriptorIdentityRecord(block);
  const callId = `aili-frontier-${digest(descriptor).slice(0, 24)}`;
  const text = providerFrontierDescriptorText(block);
  return {
    call: {
      role: "assistant",
      content: [{ type: "toolCall", id: callId, name: "aili_context_recap", arguments: { blockRef: block.blockRef } }],
    },
    result: {
      role: "toolResult",
      toolCallId: callId,
      toolName: "aili_context_recap",
      content: [{ type: "text", text }],
      isError: false,
    },
  };
}

/** The live provider frontier uses an AILI-owned non-tool descriptor. */
export function providerFrontierDescriptorMessage(block: ProviderFrontierBlock): ProjectionMessage {
  return {
    role: "assistant",
    content: providerFrontierDescriptorText(block),
  };
}

function providerFrontierDescriptorText(block: ProviderFrontierBlock): string {
  const metadata = [
    `block=${block.blockRef}`,
    `topic=${block.topic?.slice(0, 200) || "(none)"}`,
    `mode=${block.sourceKind}`,
    `sources=${block.leafCount}`,
    `summary=${block.summaryDigest.slice(0, 16)}`,
  ].join("; ");
  return `[AILI Compact descriptor; ${metadata}]\nCall aili_context_recap with selected current block references to read full summaries.`;
}

/**
 * Binds an explicit recap result to the current ledger descriptor set before
 * exposing any summary text to a provider request.
 */
export function admitProviderFrontierSelection(input: {
  toolCallId: string;
  blocks: readonly ProviderFrontierBlock[];
  allActiveBlocks: readonly ProviderFrontierBlock[];
  branchKeyId: string;
  epochId: string;
  sourceRevision: string;
  proofRevision: string;
  configIdentity: string;
  profile: ResolvedTokenBoundProfile;
  modelKnown: boolean;
  contextWindow?: number;
  safetyReserve?: number;
  baseTokensUpper?: number;
}): ProviderFrontierSelectionResult {
  if (!input.modelKnown) return { ok: false, code: "unknown-model" };
  if (!isPositiveSafeInteger(input.contextWindow)
    || !isNonNegativeSafeInteger(input.safetyReserve)
    || !isNonNegativeSafeInteger(input.baseTokensUpper)) {
    return { ok: false, code: "unknown-context" };
  }
  if (!isNonEmpty(input.toolCallId)
    || !isNonEmpty(input.branchKeyId)
    || !isNonEmpty(input.epochId)
    || !isNonEmpty(input.sourceRevision)
    || !isNonEmpty(input.proofRevision)
    || !isNonEmpty(input.configIdentity)
    || input.blocks.length < 1
    || input.blocks.length > MAX_PROVIDER_FRONTIER_SELECTIONS
    || new Set(input.blocks.map((block) => block.blockRef)).size !== input.blocks.length
    || !input.blocks.every((block) => input.allActiveBlocks.some((active) => sameBlock(active, block)))) {
    return { ok: false, code: "invalid-selection" };
  }
  const descriptorIdentity = providerFrontierDescriptorIdentity(input.allActiveBlocks);
  const blockRefs = input.blocks.map((block) => block.blockRef);
  const bindingBase = {
    version: PROVIDER_FRONTIER_SELECTION_VERSION,
    branchKeyId: input.branchKeyId,
    epochId: input.epochId,
    sourceRevision: input.sourceRevision,
    proofRevision: input.proofRevision,
    descriptorIdentity,
    configIdentity: input.configIdentity,
    profileKey: input.profile.profileKey,
    contextWindow: input.contextWindow,
    safetyReserve: input.safetyReserve,
    blockRefs: [...blockRefs].sort(),
  };
  const binding: ProviderFrontierSelectionBinding = {
    ...bindingBase,
    identity: digest(bindingBase),
    blockRefs: Object.freeze([...blockRefs]),
  };
  const resultText = canonicalJson(selectionEnvelope(binding, input.blocks));
  const expansionTokensUpper = estimateTokenBounds({
    utf8Bytes: Buffer.byteLength(canonicalJson([
      { role: "assistant", content: [{ type: "toolCall", id: input.toolCallId, name: "aili_context_recap", arguments: { blockRefs } }] },
      { role: "toolResult", toolCallId: input.toolCallId, toolName: "aili_context_recap", content: [{ type: "text", text: resultText }], isError: false },
    ]), "utf8"),
    messageCount: 2,
    structuredToolPartCount: 1,
  }, input.profile).upper;
  if (input.baseTokensUpper + expansionTokensUpper + input.safetyReserve > input.contextWindow) {
    return { ok: false, code: "over-budget" };
  }
  return {
    ok: true,
    selection: {
      toolCallId: input.toolCallId,
      binding,
      resultBodyDigest: digest(resultText),
    },
    resultText,
    expansionTokensUpper,
  };
}

/** A persisted selection result is suppressible when it is a bounded AILI envelope. */
export function isProviderFrontierSelectionResult(message: Record<string, unknown>): boolean {
  const text = selectionResultText(message);
  if (typeof text !== "string") return false;
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value)
      && value.version === PROVIDER_FRONTIER_SELECTION_VERSION
      && typeof value.identity === "string"
      && Array.isArray(value.blockRefs)
      && value.blockRefs.every((ref) => typeof ref === "string")
      && Array.isArray(value.blocks);
  } catch {
    return false;
  }
}

/** Verifies that a retained recap body is the exact current selection envelope. */
export function providerFrontierSelectionResultMatches(
  message: Record<string, unknown>,
  selection: ProviderFrontierSelection,
  blocks: readonly ProviderFrontierBlock[],
): boolean {
  if (message.role !== "toolResult"
    || message.toolName !== "aili_context_recap"
    || message.isError !== false
    || !isProviderFrontierSelectionResult(message)) return false;
  const refs = selection.binding.blockRefs;
  if (new Set(refs).size !== refs.length) return false;
  const selected = refs.map((ref) => blocks.find((block) => block.blockRef === ref));
  if (selected.some((block) => !block)) return false;
  const text = selectionResultText(message);
  const expected = canonicalJson(selectionEnvelope(selection.binding, selected as ProviderFrontierBlock[]));
  return text === expected && digest(text) === selection.resultBodyDigest;
}

export function providerFrontierSelectionMatches(
  selection: ProviderFrontierSelection | undefined,
  blocks: readonly ProviderFrontierBlock[],
  context: {
    branchKeyId?: string;
    epochId?: string;
    sourceRevision?: string;
    proofRevision?: string;
    configIdentity: string;
    profile: ResolvedTokenBoundProfile;
    contextWindow: number | undefined;
    safetyReserve: number | undefined;
  },
): boolean {
  if (!selection
    || !isNonEmpty(selection.toolCallId)
    || !isNonEmpty(context.branchKeyId)
    || !isNonEmpty(context.epochId)
    || !isNonEmpty(context.sourceRevision)
    || !isNonEmpty(context.proofRevision)
    || !isNonEmpty(context.configIdentity)
    || !isPositiveSafeInteger(context.contextWindow)
    || !isNonNegativeSafeInteger(context.safetyReserve)) return false;
  const refs = selection.binding.blockRefs;
  if (new Set(refs).size !== refs.length) return false;
  const expected = {
    version: PROVIDER_FRONTIER_SELECTION_VERSION,
    branchKeyId: context.branchKeyId,
    epochId: context.epochId,
    sourceRevision: context.sourceRevision,
    proofRevision: context.proofRevision,
    descriptorIdentity: providerFrontierDescriptorIdentity(blocks),
    configIdentity: context.configIdentity,
    profileKey: context.profile.profileKey,
    contextWindow: context.contextWindow,
    safetyReserve: context.safetyReserve,
    blockRefs: [...refs].sort(),
  };
  return selection.binding.branchKeyId === expected.branchKeyId
    && selection.binding.epochId === expected.epochId
    && selection.binding.sourceRevision === expected.sourceRevision
    && selection.binding.proofRevision === expected.proofRevision
    && selection.binding.descriptorIdentity === expected.descriptorIdentity
    && selection.binding.configIdentity === expected.configIdentity
    && selection.binding.profileKey === expected.profileKey
    && selection.binding.contextWindow === expected.contextWindow
    && selection.binding.safetyReserve === expected.safetyReserve
    && selection.binding.identity === digest(expected)
    && refs.length >= 1
    && refs.length <= MAX_PROVIDER_FRONTIER_SELECTIONS
    && refs.every((ref) => blocks.some((block) => block.blockRef === ref));
}

function selectionEnvelope(binding: ProviderFrontierSelectionBinding, blocks: readonly ProviderFrontierBlock[]): Record<string, unknown> {
  const selected = blocks.map((block) => ({
    blockRef: block.blockRef,
    schema: block.schema,
    topic: block.topic ?? "(none)",
    mode: block.sourceKind,
    sourceCount: block.leafCount,
    summary: block.summary,
  }));
  const first = selected[0]!;
  return {
    version: PROVIDER_FRONTIER_SELECTION_VERSION,
    identity: binding.identity,
    branchKeyId: binding.branchKeyId,
    epochId: binding.epochId,
    sourceRevision: binding.sourceRevision,
    proofRevision: binding.proofRevision,
    descriptorIdentity: binding.descriptorIdentity,
    configIdentity: binding.configIdentity,
    profileKey: binding.profileKey,
    contextWindow: binding.contextWindow,
    safetyReserve: binding.safetyReserve,
    blockRefs: binding.blockRefs,
    blocks: selected,
    ...(selected.length === 1 ? first : {}),
  };
}

function descriptorIdentityRecord(block: ProviderFrontierBlock): Record<string, unknown> {
  return {
    blockId: block.blockId,
    blockRef: block.blockRef,
    epochId: block.epochId,
    schema: block.schema,
    topic: block.topic?.slice(0, 200) ?? "",
    sourceKind: block.sourceKind,
    leafCount: block.leafCount,
    sourceDigest: block.sourceDigest,
    summaryDigest: block.summaryDigest,
  };
}

function sameBlock(left: ProviderFrontierBlock, right: ProviderFrontierBlock): boolean {
  return digest(descriptorIdentityRecord(left)) === digest(descriptorIdentityRecord(right));
}

function selectionResultText(message: Record<string, unknown>): string | undefined {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.length !== 1) return undefined;
  const part = content[0];
  return isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : undefined;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
