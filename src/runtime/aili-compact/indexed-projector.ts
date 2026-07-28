import {
  describeOwnedProviderMessage,
  getBranchProtocolAtomForEntry,
  getIndexedBlock,
  type BranchIndexSnapshot,
  type BranchProviderAlignmentResult,
  type BranchProviderMessageDescriptor,
} from "./branch-index.js";
import {
  digestCanonicalJson,
  type CompactState,
} from "./contracts.js";
import {
  semanticRecapProjection,
  type ProjectionMessage,
} from "./projector.js";
import { activeBlocks } from "./reducer.js";
import { TOOL_COOLING_PROFILE_VERSION } from "./cooling-profiles.js";
import { v3RecapProjection } from "./v3-projector.js";
import {
  v3LeafEntryIds,
  type V3RuntimeView,
} from "./v3-runtime.js";

interface IndexedProjectionItem<T extends ProjectionMessage> {
  message: T;
  descriptor: BranchProviderMessageDescriptor;
  entryId?: string;
}

interface ProjectionLookup {
  callersByKey: ReadonlyMap<string, readonly number[]>;
  resultsByCallId: ReadonlyMap<string, readonly number[]>;
}

export interface IndexedProviderProjectionInput<T extends ProjectionMessage> {
  snapshot: BranchIndexSnapshot;
  alignment: BranchProviderAlignmentResult;
  state: CompactState;
  view: V3RuntimeView;
  blockReferenceFor: (blockId: string) => string | undefined;
}

export interface IndexedProviderProjectionResult<T extends ProjectionMessage> {
  messages: readonly T[];
  canonicalMessages: string;
  hash: string;
  structuredToolPartCount: number;
  hasBinaryOrImage: boolean;
  projectedBlockIds: readonly string[];
  diagnostic?: string;
}

/**
 * Production-only projection over the immutable descriptor captured by
 * BranchIndex's one provider pass.  It never reads a provider or Session source
 * object; changed messages are AILI-owned recaps or body-only cooling stubs.
 */
export function projectIndexedProviderMessages<T extends ProjectionMessage>(
  input: IndexedProviderProjectionInput<T>,
): IndexedProviderProjectionResult<T> {
  const fail = (diagnostic: string): IndexedProviderProjectionResult<T> => ({
    messages: input.alignment.messages as readonly T[],
    canonicalMessages: input.alignment.canonicalMessages,
    hash: input.alignment.hash,
    structuredToolPartCount: input.alignment.structuredToolPartCount,
    hasBinaryOrImage: input.alignment.hasBinaryOrImage,
    projectedBlockIds: [],
    diagnostic,
  });
  if (input.alignment.diagnostic) return fail(`alignment:${input.alignment.diagnostic}`);
  if (input.state.enabled && input.alignment.protocolDiagnostic) return fail(input.alignment.protocolDiagnostic);
  if (input.snapshot.key.epochId !== input.state.epochId || input.view.state.epochId !== input.state.epochId) {
    return fail("stale-epoch");
  }

  const entryIdByOriginalIndex = new Map<number, string>();
  for (const [entryId, originalIndex] of input.alignment.byEntryId) {
    if (entryIdByOriginalIndex.has(originalIndex)) return fail("alignment-duplicate-index");
    entryIdByOriginalIndex.set(originalIndex, entryId);
  }
  let items: IndexedProjectionItem<T>[] = input.alignment.descriptors.map((descriptor) => ({
    message: descriptor.message as T,
    descriptor,
    ...(entryIdByOriginalIndex.get(descriptor.originalIndex)
      ? { entryId: entryIdByOriginalIndex.get(descriptor.originalIndex)! }
      : {}),
  }));

  const legacy = projectLegacy(items, input);
  if ("diagnostic" in legacy) return fail(legacy.diagnostic);
  items = legacy.items;

  const v3 = projectV3(items, input);
  if ("diagnostic" in v3) return fail(v3.diagnostic);
  items = v3.items;
  const protocolDiagnostic = validateDescriptorProtocol(items.map((item) => item.descriptor));
  if (protocolDiagnostic) return fail(protocolDiagnostic);

  const canonicalMessages = `[${items.map((item) => item.descriptor.canonical).join(",")}]`;
  return {
    messages: items.map((item) => item.message),
    canonicalMessages,
    hash: digestCanonicalJson(canonicalMessages),
    structuredToolPartCount: items.reduce((sum, item) => sum + item.descriptor.structuredToolPartCount, 0),
    hasBinaryOrImage: items.some((item) => item.descriptor.hasBinaryOrImage),
    projectedBlockIds: v3.projectedBlockIds,
  };
}

function projectLegacy<T extends ProjectionMessage>(
  items: readonly IndexedProjectionItem<T>[],
  input: IndexedProviderProjectionInput<T>,
): { items: IndexedProjectionItem<T>[] } | { diagnostic: string } {
  if (!input.state.enabled) return { items: [...items] };
  const positionByEntryId = itemPositions(items);
  const hidden = new Set<number>();
  const stubs = new Map<number, string>();
  const recaps = new Map<number, readonly IndexedProjectionItem<T>[]>();
  const claimed = new Set<number>();
  const lastUserIndex = findLastRole(items, "user");
  const activeSemanticIds = new Set<string>();
  const lookup = projectionLookup(items);

  for (const block of activeBlocks(input.state)) {
    const indexed = getIndexedBlock(input.snapshot, block.id);
    if (!indexed
      || indexed.sourceDigest !== block.sourceDigest
      || !sameStrings(indexed.sourceEntryIds, block.sourceEntryIds)) {
      return { diagnostic: `digest-mismatch:${block.id}` };
    }
    const positions = block.sourceEntryIds.map((entryId) => positionByEntryId.get(entryId));
    if (positions.some((position) => position === undefined)) return { diagnostic: `unaligned-block:${block.id}` };
    const selected = positions as number[];
    if (new Set(selected).size !== selected.length || selected.some((position) => claimed.has(position))) {
      return { diagnostic: `protected-range:${block.id}` };
    }
    if (block.kind !== "cool" && lastUserIndex !== undefined && selected.includes(lastUserIndex)) {
      return { diagnostic: `protected-range:${block.id}` };
    }
    const selectedEntryIds = new Set(block.sourceEntryIds);
    for (const entryId of block.sourceEntryIds) {
      const atom = getBranchProtocolAtomForEntry(input.snapshot, entryId);
      if (atom && (atom.kind === "tool-protocol" || atom.kind === "remainder")
        && atom.entryIds.some((atomEntryId) => !selectedEntryIds.has(atomEntryId))) {
        return { diagnostic: `protocol-block:${block.id}` };
      }
    }
    selected.forEach((position) => claimed.add(position));
    if (block.kind === "cool") {
      if (!block.stub || selected.some((position) => items[position]?.descriptor.role !== "toolResult")) {
        return { diagnostic: `invalid-stub:${block.id}` };
      }
      selected.forEach((position) => stubs.set(position, block.stub!));
      continue;
    }
    selected.forEach((position) => hidden.add(position));
    if (block.kind !== "semantic") continue;
    const anchorEntryId = block.anchorEntryId ?? block.sourceEntryIds[0];
    const anchor = anchorEntryId ? positionByEntryId.get(anchorEntryId) : undefined;
    const blockRef = input.blockReferenceFor(block.id);
    if (anchor === undefined || !selected.includes(anchor) || !blockRef || recaps.has(anchor)) {
      return { diagnostic: `invalid-recap-anchor:${block.id}` };
    }
    const recap = semanticRecapProjection(block, blockRef);
    recaps.set(anchor, [ownedItem<T>(recap.call), ownedItem<T>(recap.result)]);
    activeSemanticIds.add(block.id);
  }

  if (activeSemanticIds.size > 0) {
    for (let resultIndex = 0; resultIndex < items.length; resultIndex += 1) {
      const descriptor = items[resultIndex]!.descriptor;
      if (descriptor.role !== "toolResult"
        || descriptor.toolName !== "aili_compact"
        || !descriptor.toolCallId
        || !descriptor.committedLegacyBlockIds.some((blockId) => activeSemanticIds.has(blockId))) continue;
      const callers = lookup.callersByKey.get(callKey(descriptor.toolCallId, "aili_compact")) ?? [];
      if (callers.length === 1 && callers[0]! < resultIndex) {
        hidden.add(callers[0]!);
        hidden.add(resultIndex);
      }
    }
  }
  return { items: construct(items, hidden, stubs, recaps) };
}

function projectV3<T extends ProjectionMessage>(
  items: readonly IndexedProjectionItem<T>[],
  input: IndexedProviderProjectionInput<T>,
): { items: IndexedProjectionItem<T>[]; projectedBlockIds: readonly string[] } | { diagnostic: string } {
  const maximal = input.view.replay.maximalActiveBlocks;
  const cooling = input.view.state.cooling;
  if (maximal.length === 0 && cooling.length === 0) return { items: [...items], projectedBlockIds: [] };
  const positions = itemPositions(items);
  const claimed = new Set<number>();
  const recaps = new Map<number, readonly IndexedProjectionItem<T>[]>();
  const projectedBlockIds: string[] = [];
  const lookup = projectionLookup(items);

  for (const block of maximal) {
    if (block.quality.status !== "accepted" && block.quality.status !== "accepted-with-warnings") {
      return { diagnostic: `quality-ineligible:${block.blockId}` };
    }
    const leaves = v3LeafEntryIds(input.view.state, block.blockId);
    if (leaves.length === 0 || leaves.length !== block.leafCount) return { diagnostic: `leaf-invalid:${block.blockId}` };
    const rawPositions = leaves.flatMap((entryId) => positions.get(entryId) === undefined ? [] : [positions.get(entryId)!]);
    const hasRaw = rawPositions.length > 0;
    if (hasRaw && rawPositions.length !== leaves.length) return { diagnostic: `alignment-gap:${block.blockId}` };
    let selected: number[] | undefined;
    if (hasRaw) {
      if (!isConsecutive(rawPositions)) return { diagnostic: `leaf-gap:${block.blockId}` };
      const selectedIds = new Set(leaves);
      for (const entryId of leaves) {
        const atom = getBranchProtocolAtomForEntry(input.snapshot, entryId);
        if (!atom || atom.hardProtected || atom.entryIds.some((atomEntryId) => !selectedIds.has(atomEntryId))) {
          return { diagnostic: `protocol-block:${block.blockId}` };
        }
      }
      selected = rawPositions;
    }
    const childPositions = locateImmediateChildRecaps(items, lookup, block, input);
    if (typeof childPositions === "string") return { diagnostic: childPositions };
    if (selected && childPositions) return { diagnostic: `coverage-overlap:${block.blockId}` };
    selected ??= childPositions;
    if (!selected || selected.length === 0) return { diagnostic: `unaligned-block:${block.blockId}` };
    for (const position of selected) {
      if (claimed.has(position)) return { diagnostic: `coverage-overlap:${block.blockId}` };
      claimed.add(position);
    }
    const blockRef = input.blockReferenceFor(block.blockId);
    const anchor = selected[0]!;
    if (!blockRef || recaps.has(anchor)) return { diagnostic: `invalid-recap-anchor:${block.blockId}` };
    const recap = v3RecapProjection(block, blockRef);
    recaps.set(anchor, [ownedItem<T>(recap.call), ownedItem<T>(recap.result)]);
    projectedBlockIds.push(block.blockId);
  }

  const activeBlockIds = new Set(projectedBlockIds);
  for (let resultIndex = 0; resultIndex < items.length; resultIndex += 1) {
    const descriptor = items[resultIndex]!.descriptor;
    if (descriptor.role !== "toolResult"
      || descriptor.toolName !== "aili_compact"
      || descriptor.isError
      || !descriptor.toolCallId
      || !descriptor.committedV3BlockId
      || !activeBlockIds.has(descriptor.committedV3BlockId)) continue;
    const callers = lookup.callersByKey.get(callKey(descriptor.toolCallId, "aili_compact")) ?? [];
    if (callers.length !== 1 || callers[0]! >= resultIndex) continue;
    for (const position of [callers[0]!, resultIndex]) {
      if (claimed.has(position)) return { diagnostic: "coverage-overlap:commit-protocol" };
      claimed.add(position);
    }
  }

  const stubs = new Map<number, string>();
  for (const record of cooling) {
    const provenance = record.provenance;
    if (provenance.epochId !== input.view.state.epochId) continue;
    if (record.profileVersion !== TOOL_COOLING_PROFILE_VERSION
      || provenance.sessionId !== input.view.state.sessionId
      || provenance.branchLeafId !== input.view.state.branchLeafId
      || record.targetEntryIds.length !== 1
      || record.targetEntryIds[0] !== provenance.resultEntryId) return { diagnostic: "cooling-identity-mismatch" };
    const call = input.alignment.descriptorByEntryId.get(provenance.callEntryId);
    const result = input.alignment.descriptorByEntryId.get(provenance.resultEntryId);
    if (!call || !result
      || call.role !== "assistant"
      || !call.namedToolCalls.some((candidate) => candidate.id === provenance.callId
        && candidate.name?.trim().toLocaleLowerCase("en-US") === provenance.normalizedExactToolName)
      || result.role !== "toolResult"
      || result.toolCallId !== provenance.callId
      || result.toolName?.trim().toLocaleLowerCase("en-US") !== provenance.normalizedExactToolName
      || result.resultBodyDigest !== provenance.resultBodyDigest) return { diagnostic: "cooling-source-drift" };
    const position = positions.get(provenance.resultEntryId);
    if (position === undefined || claimed.has(position)) return { diagnostic: position === undefined ? "cooling-alignment-drift" : "coverage-overlap:cooling" };
    const stub = `[tool-result cooled profile=${record.profile} body=${provenance.resultBodyDigest.slice(0, 16)} version=${record.profileVersion}]`.slice(0, 160);
    const previous = stubs.get(position);
    if (previous !== undefined && previous !== stub) return { diagnostic: "cooling-overlap" };
    stubs.set(position, stub);
  }
  return { items: construct(items, claimed, stubs, recaps), projectedBlockIds };
}

function locateImmediateChildRecaps<T extends ProjectionMessage>(
  items: readonly IndexedProjectionItem<T>[],
  lookup: ProjectionLookup,
  block: V3RuntimeView["replay"]["maximalActiveBlocks"][number],
  input: IndexedProviderProjectionInput<T>,
): number[] | undefined | string {
  if (block.source.kind !== "blocks") return undefined;
  const pairs: number[][] = [];
  let present = 0;
  for (const childId of block.source.childBlockIds) {
    const child = input.view.state.blocks.get(childId);
    const childRef = child ? input.blockReferenceFor(child.blockId) : undefined;
    if (!child || !childRef) return `child-recap-invalid:${block.blockId}`;
    const recap = v3RecapProjection(child, childRef);
    const expected = [describeOwnedProviderMessage(recap.call), describeOwnedProviderMessage(recap.result)];
    const callId = expected[1]!.toolCallId;
    const callers = callId
      ? lookup.callersByKey.get(callKey(callId, "aili_context_recap")) ?? []
      : [];
    const results = callId ? lookup.resultsByCallId.get(callId) ?? [] : [];
    if (callers.length > 1 || results.length > 1) return `child-recap-invalid:${block.blockId}`;
    if (callers.length === 1 || results.length === 1) {
      if (callers.length !== 1 || results.length !== 1 || results[0] !== callers[0]! + 1
        || items[callers[0]!]!.descriptor.canonical !== expected[0]!.canonical
        || items[results[0]!]!.descriptor.canonical !== expected[1]!.canonical) {
        return `child-recap-invalid:${block.blockId}`;
      }
      present += 1;
      pairs.push([callers[0]!, results[0]!]);
    }
  }
  if (present === 0) return undefined;
  if (present !== block.source.childBlockIds.length) return `child-recap-gap:${block.blockId}`;
  const flat = pairs.flat();
  return isConsecutive(flat) ? flat : `leaf-gap:${block.blockId}`;
}

function construct<T extends ProjectionMessage>(
  items: readonly IndexedProjectionItem<T>[],
  hidden: ReadonlySet<number>,
  stubs: ReadonlyMap<number, string>,
  recaps: ReadonlyMap<number, readonly IndexedProjectionItem<T>[]>,
): IndexedProjectionItem<T>[] {
  const result: IndexedProjectionItem<T>[] = [];
  for (let index = 0; index < items.length; index += 1) {
    result.push(...(recaps.get(index) ?? []));
    if (hidden.has(index)) continue;
    const item = items[index]!;
    const stub = stubs.get(index);
    result.push(stub === undefined ? item : stubbedItem(item, stub));
  }
  return result;
}

function stubbedItem<T extends ProjectionMessage>(item: IndexedProjectionItem<T>, stub: string): IndexedProjectionItem<T> {
  if (!item.descriptor.shallowEntries) return item;
  const message = Object.fromEntries(item.descriptor.shallowEntries) as T;
  message.content = item.descriptor.contentIsArray ? [{ type: "text", text: stub }] : stub;
  return {
    message,
    descriptor: describeOwnedProviderMessage(message),
    ...(item.entryId ? { entryId: item.entryId } : {}),
  };
}

function ownedItem<T extends ProjectionMessage>(message: ProjectionMessage): IndexedProjectionItem<T> {
  return {
    message: message as T,
    descriptor: describeOwnedProviderMessage(message),
  };
}

function itemPositions<T extends ProjectionMessage>(items: readonly IndexedProjectionItem<T>[]): Map<string, number> {
  const result = new Map<string, number>();
  for (let index = 0; index < items.length; index += 1) {
    const entryId = items[index]!.entryId;
    if (entryId) result.set(entryId, index);
  }
  return result;
}

function findLastRole<T extends ProjectionMessage>(
  items: readonly IndexedProjectionItem<T>[],
  role: string,
): number | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]!.descriptor.role === role) return index;
  }
  return undefined;
}

function projectionLookup<T extends ProjectionMessage>(
  items: readonly IndexedProjectionItem<T>[],
): ProjectionLookup {
  const callersByKey = new Map<string, number[]>();
  const resultsByCallId = new Map<string, number[]>();
  for (let index = 0; index < items.length; index += 1) {
    const descriptor = items[index]!.descriptor;
    if (descriptor.role === "assistant") {
      for (const call of descriptor.namedToolCalls) {
        if (!call.name) continue;
        const key = callKey(call.id, call.name);
        const positions = callersByKey.get(key) ?? [];
        positions.push(index);
        callersByKey.set(key, positions);
      }
    }
    if (descriptor.role === "toolResult" && descriptor.toolCallId) {
      const positions = resultsByCallId.get(descriptor.toolCallId) ?? [];
      positions.push(index);
      resultsByCallId.set(descriptor.toolCallId, positions);
    }
  }
  return { callersByKey, resultsByCallId };
}

function callKey(callId: string, name: string): string {
  return `${callId}\u0000${name}`;
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

function isConsecutive(values: readonly number[]): boolean {
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || value === values[index - 1]! + 1);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
