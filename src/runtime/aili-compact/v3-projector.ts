import { alignmentFingerprint, type AlignmentResult } from "./alignment.js";
import { canonicalJson, digest, extractText, isRecord, type SessionLikeEntry } from "./contracts.js";
import { TOOL_COOLING_PROFILE_VERSION } from "./cooling-profiles.js";
import { buildProtocolAtoms, type ProtocolAtomBuildResult } from "./protocol-atoms.js";
import type { V3LifecycleReplay } from "./reducer.js";
import {
  V3_LIMITS,
  maximalActiveV3Blocks,
  validateV3LifecycleState,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3SemanticBlock,
  type V3Tier,
} from "./v3.js";

const MAX_CHECKPOINT_SUMMARY_CHARS = 12_000;

export interface V3ProjectionMessage extends Record<string, unknown> {
  role?: string;
  content?: unknown;
}

export type V3ProjectionAlignment = Pick<AlignmentResult, "byEntryId" | "diagnostic">;

export interface V3ProjectionInput<T extends V3ProjectionMessage> {
  replay: V3LifecycleReplay;
  entries: readonly SessionLikeEntry[];
  messages: readonly T[];
  alignment: V3ProjectionAlignment;
  blockReferenceFor?: (blockId: string) => string | undefined;
  indexedSource?: {
    epochId: string;
    entryCount: number;
    entryById: (entryId: string) => SessionLikeEntry | undefined;
    atomForEntry: (entryId: string) => { entryIds: readonly string[]; hardProtected: boolean } | undefined;
  };
}

export interface V3ProjectionResult<T extends V3ProjectionMessage> {
  messages: readonly T[];
  hash: string;
  earliestChangeIndex?: number;
  diagnostic?: string;
  projectedBlockIds: readonly string[];
}

export interface V3RecapProjection {
  call: V3ProjectionMessage;
  result: V3ProjectionMessage;
}

export interface V3CheckpointCoverageInput {
  replay: V3LifecycleReplay;
  entries: readonly SessionLikeEntry[];
  firstKeptEntryId: string;
  tokensBefore: number;
  /**
   * Runtime-observed identities for the checkpoint attempt. This remains
   * optional at the TypeScript boundary while callers migrate, but omission or
   * any unavailable value makes deterministic v3 coverage ineligible.
   */
  currentIdentity?: V3CheckpointCurrentIdentity;
  previousSummary?: string;
  maxSummaryChars?: number;
}

export interface V3CheckpointCurrentIdentity {
  providerId: string;
  modelId: string;
  estimatorVersion: string;
  projectionVersion: string;
  qualityEvaluatorVersion: string;
}

export interface V3CheckpointCoveragePlan {
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details: {
    ailiCompact: {
      kind: "major-gc-v3";
      catalogId: string;
      blockIds: string[];
      tiers: V3Tier[];
      leafCount: number;
      currentIdentity: V3CheckpointCurrentIdentity;
    };
  };
}

interface VerifiedReplay {
  state: V3LifecycleState;
  maximal: readonly V3SemanticBlock[];
}

interface CoverageAction {
  block: V3SemanticBlock;
  indexes: readonly number[];
  anchorIndex: number;
}

type CoverageResult =
  | { status: "ok"; indexes: number[] }
  | { status: "absent" }
  | { status: "error"; diagnostic: string };

/** Stable current-epoch v3 reference compatible with the production recap envelope. */
export function v3BlockReferenceFor(state: V3LifecycleState, blockId: string): string | undefined {
  const index = [...state.blocks.values()]
    .filter((block) => block.epochId === state.epochId)
    .findIndex((block) => block.blockId === blockId);
  return index < 0 ? undefined : `b${String(index + 1).padStart(6, "0")}`;
}

/** The v3 form of the production aili_context_recap call/result pair. */
export function v3RecapProjection(block: V3SemanticBlock, blockRef: string): V3RecapProjection {
  const callId = `aili-recap-${digest({ epochId: block.epochId, blockId: block.blockId }).slice(0, 24)}`;
  const metadata = [
    `block=${blockRef}`,
    `topic=${block.topic}`,
    `mode=${block.source.kind === "messages" ? "message" : "blocks"}`,
    `tier=${block.tier}`,
    `sources=${block.leafCount}`,
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

/**
 * Projects accepted maximal v3 nodes. Any uncertainty returns the exact input
 * array and object references with a diagnostic; partial projection is never
 * observable.
 */
export function projectV3Messages<T extends V3ProjectionMessage>(
  input: V3ProjectionInput<T>,
): V3ProjectionResult<T> {
  const originalHash = digest(input.messages);
  const sourceSnapshot = canonicalJson(input.messages);
  try {
    if (isEmptyReplay(input.replay)) {
      return { messages: input.messages, hash: originalHash, projectedBlockIds: [] };
    }
    const verified = verifyReplay(input.replay);
    if (typeof verified === "string") return projectionFailOpen(input.messages, originalHash, verified);
    const protocolError = validateProviderProtocol(input.messages);
    if (protocolError) return projectionFailOpen(input.messages, originalHash, protocolError);
    if (input.alignment.diagnostic) {
      return projectionFailOpen(input.messages, originalHash, `alignment:${input.alignment.diagnostic}`);
    }
    if (verified.maximal.length === 0 && verified.state.cooling.length === 0) {
      return { messages: input.messages, hash: originalHash, projectedBlockIds: [] };
    }

    if (!input.indexedSource && new Set(input.entries.map((entry) => entry.id)).size !== input.entries.length) {
      return projectionFailOpen(input.messages, originalHash, "duplicate-entry-id");
    }
    const epochEntries = input.indexedSource ? undefined : currentEpochEntries(input.entries, verified.state.epochId);
    if (input.indexedSource ? input.indexedSource.epochId !== verified.state.epochId : !epochEntries) {
      return projectionFailOpen(input.messages, originalHash, "stale-epoch");
    }
    const atomBuild = epochEntries ? buildProtocolAtoms(epochEntries) : undefined;
    const entryById = input.indexedSource?.entryById
      ?? ((entryId: string) => input.entries.find((entry) => entry.id === entryId));
    const cooling = v3CoolingStubs(
      verified.state,
      input.messages,
      input.alignment.byEntryId,
      entryById,
    );
    if (typeof cooling === "string") return projectionFailOpen(input.messages, originalHash, cooling);
    const leafCache = new Map<string, readonly string[]>();
    const actions: CoverageAction[] = [];

    for (const block of verified.maximal) {
      if (!isAcceptedQuality(block)) {
        return projectionFailOpen(input.messages, originalHash, `quality-ineligible:${block.blockId}`);
      }
      const leaves = orderedLeafEntryIds(block, verified.state, leafCache, new Set());
      if (!leaves) return projectionFailOpen(input.messages, originalHash, `leaf-invalid:${block.blockId}`);
      const raw = rawCoverage(
        block,
        leaves,
        input.indexedSource?.entryCount ?? input.entries.length,
        input.messages,
        input.alignment.byEntryId,
        entryById,
        atomBuild,
        input.indexedSource?.atomForEntry,
      );
      if (raw.status === "error") return projectionFailOpen(input.messages, originalHash, raw.diagnostic);
      const childRecaps = immediateChildRecapCoverage(
        block,
        verified.state,
        input.messages,
        input.blockReferenceFor,
      );
      if (childRecaps.status === "error") return projectionFailOpen(input.messages, originalHash, childRecaps.diagnostic);
      if (raw.status === "ok" && childRecaps.status === "ok") {
        return projectionFailOpen(input.messages, originalHash, `coverage-overlap:${block.blockId}`);
      }
      const selected = raw.status === "ok" ? raw : childRecaps;
      if (selected.status !== "ok" || selected.indexes.length === 0) {
        return projectionFailOpen(input.messages, originalHash, `unaligned-block:${block.blockId}`);
      }
      actions.push({ block, indexes: selected.indexes, anchorIndex: selected.indexes[0]! });
    }

    const claimed = new Set<number>();
    const recaps = new Map<number, V3RecapProjection>();
    for (const action of actions) {
      for (const index of action.indexes) {
        if (claimed.has(index)) return projectionFailOpen(input.messages, originalHash, `coverage-overlap:${action.block.blockId}`);
        claimed.add(index);
      }
      const blockRef = input.blockReferenceFor?.(action.block.blockId)
        ?? v3BlockReferenceFor(verified.state, action.block.blockId);
      if (!blockRef || recaps.has(action.anchorIndex)) {
        return projectionFailOpen(input.messages, originalHash, `invalid-recap-anchor:${action.block.blockId}`);
      }
      recaps.set(action.anchorIndex, v3RecapProjection(action.block, blockRef));
    }

    const protocolIndexes = committedV3ProtocolIndexes(
      input.messages,
      new Set(actions.map((action) => action.block.blockId)),
    );
    for (const index of protocolIndexes) {
      if (claimed.has(index)) return projectionFailOpen(input.messages, originalHash, "coverage-overlap:commit-protocol");
      claimed.add(index);
    }
    for (const index of cooling.keys()) {
      if (claimed.has(index)) return projectionFailOpen(input.messages, originalHash, "coverage-overlap:cooling");
    }
    const construct = (): T[] => input.messages.flatMap((message, index) => {
      const recap = recaps.get(index);
      const prefix = recap ? [recap.call as T, recap.result as T] : [];
      if (claimed.has(index)) return prefix;
      const stub = cooling.get(index);
      return [...prefix, stub === undefined ? message : ({ ...message, content: stubContent(message.content, stub) } as T)];
    });
    const projected = construct();
    const outputError = validateProviderProtocol(projected);
    if (outputError) return projectionFailOpen(input.messages, originalHash, outputError);
    if (!preservesUntouchedReferences(input.messages, projected, claimed, new Set(cooling.keys()))) {
      return projectionFailOpen(input.messages, originalHash, "untouched-reference-loss");
    }
    if (sourceSnapshot !== canonicalJson(input.messages)) {
      return projectionFailOpen(input.messages, originalHash, "source-mutation");
    }
    if (canonicalJson(projected) !== canonicalJson(construct())) {
      return projectionFailOpen(input.messages, originalHash, "non-idempotent-output");
    }
    const hash = digest(projected);
    if (hash !== digest(construct())) return projectionFailOpen(input.messages, originalHash, "canonical-hash-mismatch");
    return {
      messages: projected,
      hash,
      earliestChangeIndex: firstChange(input.messages, projected),
      projectedBlockIds: actions.map((action) => action.block.blockId),
    };
  } catch (error) {
    return projectionFailOpen(
      input.messages,
      originalHash,
      `projection-error:${error instanceof Error ? error.name : "unknown"}`,
    );
  }
}

function v3CoolingStubs<T extends V3ProjectionMessage>(
  state: V3LifecycleState,
  messages: readonly T[],
  alignment: ReadonlyMap<string, number>,
  entryById: (entryId: string) => SessionLikeEntry | undefined,
): Map<number, string> | string {
  const stubs = new Map<number, string>();
  for (const cooling of state.cooling) {
    const provenance = cooling.provenance;
    if (provenance.epochId !== state.epochId) continue;
    if (cooling.profileVersion !== TOOL_COOLING_PROFILE_VERSION
      || provenance.sessionId !== state.sessionId
      || provenance.branchLeafId !== state.branchLeafId
      || cooling.targetEntryIds.length !== 1
      || cooling.targetEntryIds[0] !== provenance.resultEntryId) return "cooling-identity-mismatch";
    const callEntry = entryById(provenance.callEntryId);
    const resultEntry = entryById(provenance.resultEntryId);
    if (!callEntry || !resultEntry || callEntry.type !== "message" || resultEntry.type !== "message"
      || !isRecord(callEntry.message) || !isRecord(resultEntry.message)
      || callEntry.message.role !== "assistant"
      || resultEntry.message.role !== "toolResult"
      || resultEntry.message.toolCallId !== provenance.callId
      || typeof resultEntry.message.toolName !== "string"
      || resultEntry.message.toolName.trim().toLocaleLowerCase("en-US") !== provenance.normalizedExactToolName
      || !toolCalls(callEntry.message).some((call) => call.id === provenance.callId
        && call.name.trim().toLocaleLowerCase("en-US") === provenance.normalizedExactToolName)
      || digest(extractText(resultEntry.message.content)) !== provenance.resultBodyDigest) {
      return "cooling-source-drift";
    }
    const index = alignment.get(provenance.resultEntryId);
    if (index === undefined) return "cooling-alignment-drift";
    const message = messages[index];
    if (!message || message.role !== "toolResult"
      || message.toolCallId !== provenance.callId
      || typeof message.toolName !== "string"
      || message.toolName.trim().toLocaleLowerCase("en-US") !== provenance.normalizedExactToolName
      || digest(extractText(message.content)) !== provenance.resultBodyDigest) return "cooling-alignment-drift";
    const stub = `[tool-result cooled profile=${cooling.profile} body=${provenance.resultBodyDigest.slice(0, 16)} version=${cooling.profileVersion}]`;
    const previous = stubs.get(index);
    if (previous !== undefined && previous !== stub) return "cooling-overlap";
    stubs.set(index, stub.slice(0, 160));
  }
  return stubs;
}

function stubContent(content: unknown, stub: string): unknown {
  return Array.isArray(content) ? [{ type: "text", text: stub }] : stub;
}

/**
 * Returns a Pi-compatible deterministic checkpoint envelope only for exact
 * current-epoch coverage by accepted maximal T3/T2/T1 nodes.
 */
export function planV3CheckpointCoverage(
  input: V3CheckpointCoverageInput,
): V3CheckpointCoveragePlan | undefined {
  const verified = verifyReplay(input.replay);
  if (typeof verified === "string"
    || !Number.isSafeInteger(input.tokensBefore) || input.tokensBefore < 0
    || typeof input.firstKeptEntryId !== "string" || input.firstKeptEntryId.length === 0
    || input.firstKeptEntryId.length > 256) return undefined;
  if (!isCurrentCheckpointIdentity(input.currentIdentity)
    || verified.state.projectionVersion !== input.currentIdentity.projectionVersion) return undefined;
  const currentIdentity = input.currentIdentity;
  const summaryLimit = input.maxSummaryChars ?? MAX_CHECKPOINT_SUMMARY_CHARS;
  if (!Number.isSafeInteger(summaryLimit) || summaryLimit < 1 || summaryLimit > MAX_CHECKPOINT_SUMMARY_CHARS) return undefined;
  if (input.previousSummary !== undefined
    && (typeof input.previousSummary !== "string" || input.previousSummary.length > summaryLimit)) return undefined;
  if (new Set(input.entries.map((entry) => entry.id)).size !== input.entries.length) return undefined;

  const epochStart = currentEpochStart(input.entries, verified.state.epochId);
  const firstKeptIndex = input.entries.findIndex((entry) => entry.id === input.firstKeptEntryId);
  if (epochStart < 0 || firstKeptIndex <= epochStart) return undefined;
  const epochEntries = input.entries.slice(epochStart);
  const keptOffset = firstKeptIndex - epochStart;
  const discardedMessages = epochEntries.slice(0, keptOffset).filter((entry) => entry.type === "message");
  if (discardedMessages.length === 0) return undefined;
  const discardedIds = new Set(discardedMessages.map((entry) => entry.id));
  const messageOrder = new Map(epochEntries.filter((entry) => entry.type === "message")
    .map((entry, index) => [entry.id, index] as const));
  const leafCache = new Map<string, readonly string[]>();
  const sourceToBlock = new Map<string, V3SemanticBlock>();
  const included: V3SemanticBlock[] = [];

  for (const block of verified.maximal) {
    const leaves = orderedLeafEntryIds(block, verified.state, leafCache, new Set());
    if (!leaves) return undefined;
    const positions = leaves.map((entryId) => messageOrder.get(entryId));
    if (positions.some((position) => position === undefined)) return undefined;
    const inside = leaves.map((entryId) => discardedIds.has(entryId));
    if (!inside.some(Boolean)) continue;
    if (!inside.every(Boolean) || !isCurrentCheckpointBlock(block, currentIdentity)) return undefined;
    const exactPositions = positions as number[];
    if (exactPositions.some((position, index) => index > 0 && position !== exactPositions[index - 1]! + 1)) return undefined;
    for (const leafId of leaves) {
      if (sourceToBlock.has(leafId)) return undefined;
      sourceToBlock.set(leafId, block);
    }
    included.push(block);
  }
  if (discardedMessages.some((entry) => !sourceToBlock.has(entry.id))) return undefined;
  if (included.length === 0 || containsParentAndDescendant(included, verified.state)) return undefined;

  const atomBuild = buildProtocolAtoms(epochEntries);
  for (const atom of atomBuild.atoms) {
    const beforeBoundary = atom.entryIndexes.map((index) => index < keptOffset);
    if (beforeBoundary.some(Boolean) && !beforeBoundary.every(Boolean)) return undefined;
    if (!beforeBoundary.every(Boolean)) continue;
    if (atom.hardProtected) return undefined;
    const owners = new Set(atom.entryIds.map((entryId) => sourceToBlock.get(entryId)?.blockId));
    if (owners.size !== 1 || owners.has(undefined)) return undefined;
  }

  included.sort((left, right) => {
    const leftFirst = messageOrder.get(orderedLeafEntryIds(left, verified.state, leafCache, new Set())![0]!)!;
    const rightFirst = messageOrder.get(orderedLeafEntryIds(right, verified.state, leafCache, new Set())![0]!)!;
    return leftFirst - rightFirst || tierRank(right.tier) - tierRank(left.tier) || left.blockId.localeCompare(right.blockId);
  });
  const sections = [
    "AILI Compact v3 checkpoint (maximal accepted semantic coverage)",
    ...(input.previousSummary ? [`Previous Pi summary:\n${input.previousSummary}`] : []),
    ...included.map((block) => `[${block.tier} ${block.blockId}]\n${block.summary}`),
  ];
  const summary = sections.join("\n\n");
  if (summary.length > summaryLimit) return undefined;
  return {
    summary,
    firstKeptEntryId: input.firstKeptEntryId,
    tokensBefore: input.tokensBefore,
    details: {
      ailiCompact: {
        kind: "major-gc-v3",
        catalogId: verified.state.catalogId,
        blockIds: included.map((block) => block.blockId),
        tiers: included.map((block) => block.tier),
        leafCount: discardedMessages.length,
        currentIdentity: { ...currentIdentity },
      },
    },
  };
}

function isEmptyReplay(replay: V3LifecycleReplay): boolean {
  return replay.state === undefined
    && replay.maximalActiveBlocks.length === 0
    && replay.archivedQueryOnlyBlocks.length === 0
    && replay.acceptedTransactionCount === 0
    && replay.diagnostics.length === 0;
}

function verifyReplay(replay: V3LifecycleReplay): VerifiedReplay | string {
  const firstDiagnostic = replay.diagnostics[0];
  if (firstDiagnostic) return `v3-replay:${firstDiagnostic.phase}:${firstDiagnostic.code}`;
  if (!replay.state) {
    return replay.maximalActiveBlocks.length === 0
      && replay.archivedQueryOnlyBlocks.length === 0
      && replay.acceptedTransactionCount === 0
      ? "v3-state-absent"
      : "v3-replay-inconsistent";
  }
  const valid = validateV3LifecycleState(replay.state);
  if (!valid.ok) return `v3-state:${valid.code}:${valid.path}`;
  if (replay.acceptedTransactionCount !== replay.state.transactions.size) return "v3-transaction-count-mismatch";
  const maximal = maximalActiveV3Blocks(replay.state);
  if (!maximal.ok) return `v3-maximal:${maximal.code}:${maximal.path}`;
  if (canonicalJson(maximal.value) !== canonicalJson(replay.maximalActiveBlocks)) return "v3-maximal-mismatch";
  const archived = [...replay.state.blocks.values()].filter((block) => block.queryOnly).sort(compareBlocks);
  if (canonicalJson(archived) !== canonicalJson(replay.archivedQueryOnlyBlocks)) return "v3-archive-mismatch";
  return { state: replay.state, maximal: maximal.value };
}

function orderedLeafEntryIds(
  block: V3SemanticBlock,
  state: V3LifecycleState,
  cache: Map<string, readonly string[]>,
  visiting: Set<string>,
): readonly string[] | undefined {
  const cached = cache.get(block.blockId);
  if (cached) return cached;
  if (visiting.has(block.blockId) || block.summaryDigest !== v3SummaryDigest(block.summary)) return undefined;
  visiting.add(block.blockId);
  let leaves: readonly string[] | undefined;
  if (block.source.kind === "messages") {
    const exact = [...block.source.entryIds];
    leaves = block.tier === "T1"
      && block.leafCount === exact.length
      && block.leafDigest === v3MessageLeafDigest(exact)
      && block.anchorEntryId === exact[0]
      ? exact : undefined;
  } else {
    const children = block.source.childBlockIds.map((id) => state.blocks.get(id));
    if (children.every((child): child is V3SemanticBlock => child !== undefined)) {
      const flattened = children.flatMap((child) => orderedLeafEntryIds(child, state, cache, visiting) ?? []);
      const complete = children.every((child) => cache.has(child.blockId));
      leaves = complete
        && flattened.length === block.leafCount
        && block.leafDigest === v3ParentLeafDigest(block.tier, block.leafCount, children.map((child) => child.leafDigest))
        && block.anchorEntryId === children[0]!.anchorEntryId
        ? flattened : undefined;
    }
  }
  visiting.delete(block.blockId);
  if (leaves) cache.set(block.blockId, leaves);
  return leaves;
}

function rawCoverage<T extends V3ProjectionMessage>(
  block: V3SemanticBlock,
  leaves: readonly string[],
  entryCount: number,
  messages: readonly T[],
  alignment: ReadonlyMap<string, number>,
  entryById: (entryId: string) => SessionLikeEntry | undefined,
  atomBuild: ProtocolAtomBuildResult | undefined,
  atomForEntry?: (entryId: string) => { entryIds: readonly string[]; hardProtected: boolean } | undefined,
): CoverageResult {
  const mapped = leaves.filter((entryId) => alignment.has(entryId));
  if (mapped.length === 0) return { status: "absent" };
  if (mapped.length !== leaves.length) return { status: "error", diagnostic: `alignment-gap:${block.blockId}` };
  const indexes: number[] = [];
  for (const entryId of leaves) {
    const index = alignment.get(entryId)!;
    const entry = entryById(entryId);
    if (!Number.isInteger(index) || index < 0 || index >= messages.length
      || !entry || entry.type !== "message" || !isRecord(entry.message)
      || alignmentFingerprint(entry.message) !== alignmentFingerprint(messages[index]!)) {
      return { status: "error", diagnostic: `alignment-mismatch:${block.blockId}` };
    }
    indexes.push(index);
  }
  if (new Set(indexes).size !== indexes.length
    || indexes.some((index, ordinal) => ordinal > 0 && index !== indexes[ordinal - 1]! + 1)) {
    return { status: "error", diagnostic: `leaf-gap:${block.blockId}` };
  }
  const selected = new Set(leaves);
  const touched = atomForEntry
    ? [...new Map(leaves.flatMap((entryId) => {
      const atom = atomForEntry(entryId);
      return atom ? [[atom.entryIds.join("\u0000"), atom] as const] : [];
    })).values()]
    : atomBuild!.atoms.filter((atom) => atom.entryIds.some((entryId) => selected.has(entryId)));
  if (touched.some((atom) => atom.hardProtected || atom.entryIds.some((entryId) => !selected.has(entryId)))) {
    return { status: "error", diagnostic: `protocol-block:${block.blockId}` };
  }
  if (block.anchorEntryId !== leaves[0]) return { status: "error", diagnostic: `invalid-recap-anchor:${block.blockId}` };
  if (entryCount === 0) return { status: "error", diagnostic: `unaligned-block:${block.blockId}` };
  return { status: "ok", indexes };
}

function immediateChildRecapCoverage<T extends V3ProjectionMessage>(
  block: V3SemanticBlock,
  state: V3LifecycleState,
  messages: readonly T[],
  blockReferenceFor?: (blockId: string) => string | undefined,
): CoverageResult {
  if (block.source.kind !== "blocks") return { status: "absent" };
  const pairIndexes: number[][] = [];
  let present = 0;
  for (const childId of block.source.childBlockIds) {
    const child = state.blocks.get(childId);
    const childRef = child
      ? blockReferenceFor?.(child.blockId) ?? v3BlockReferenceFor(state, child.blockId)
      : undefined;
    if (!child || !childRef) return { status: "error", diagnostic: `child-recap-invalid:${block.blockId}` };
    const located = locateExactRecapPair(messages, v3RecapProjection(child, childRef));
    if (located.status === "error") return { status: "error", diagnostic: `child-recap-invalid:${block.blockId}` };
    if (located.status === "ok") {
      present += 1;
      pairIndexes.push(located.indexes);
    }
  }
  if (present === 0) return { status: "absent" };
  if (present !== block.source.childBlockIds.length) return { status: "error", diagnostic: `child-recap-gap:${block.blockId}` };
  const indexes = pairIndexes.flat();
  if (indexes.some((index, ordinal) => ordinal > 0 && index !== indexes[ordinal - 1]! + 1)) {
    return { status: "error", diagnostic: `leaf-gap:${block.blockId}` };
  }
  return { status: "ok", indexes };
}

function committedV3ProtocolIndexes<T extends V3ProjectionMessage>(
  messages: readonly T[],
  activeBlockIds: ReadonlySet<string>,
): Set<number> {
  const hidden = new Set<number>();
  if (activeBlockIds.size === 0) return hidden;
  for (const [resultIndex, message] of messages.entries()) {
    if (message.role !== "toolResult"
      || message.toolName !== "aili_compact"
      || message.isError === true
      || typeof message.toolCallId !== "string"
      || !isRecord(message.details)) continue;
    const contextTx = message.details.contextTx;
    if (!isRecord(contextTx)
      || contextTx.tag !== "semantic-create"
      || !isRecord(contextTx.payload)
      || typeof contextTx.payload.blockId !== "string"
      || !activeBlockIds.has(contextTx.payload.blockId)) continue;
    const callers = messages.flatMap((candidate, index) =>
      hasNamedToolCall(candidate, message.toolCallId as string, "aili_compact") ? [index] : []);
    if (callers.length !== 1 || callers[0]! >= resultIndex) continue;
    hidden.add(callers[0]!);
    hidden.add(resultIndex);
  }
  return hidden;
}

function locateExactRecapPair<T extends V3ProjectionMessage>(
  messages: readonly T[],
  expected: V3RecapProjection,
): CoverageResult {
  const callId = expected.result.toolCallId;
  const calls = messages.flatMap((message, index) => hasNamedToolCall(message, callId as string, "aili_context_recap") ? [index] : []);
  const results = messages.flatMap((message, index) => message.role === "toolResult"
    && message.toolCallId === callId && message.toolName === "aili_context_recap" ? [index] : []);
  if (calls.length === 0 && results.length === 0) return { status: "absent" };
  if (calls.length !== 1 || results.length !== 1 || results[0] !== calls[0]! + 1
    || canonicalJson(messages[calls[0]!]) !== canonicalJson(expected.call)
    || canonicalJson(messages[results[0]!]) !== canonicalJson(expected.result)) {
    return { status: "error", diagnostic: "invalid-recap-pair" };
  }
  return { status: "ok", indexes: [calls[0]!, results[0]!] };
}

function isAcceptedQuality(block: V3SemanticBlock): boolean {
  return block.quality.status === "accepted" || block.quality.status === "accepted-with-warnings";
}

function isCurrentCheckpointIdentity(value: V3CheckpointCurrentIdentity | undefined): value is V3CheckpointCurrentIdentity {
  if (!value) return false;
  return [
    value.providerId,
    value.modelId,
    value.estimatorVersion,
    value.projectionVersion,
    value.qualityEvaluatorVersion,
  ].every((identity) => {
    if (typeof identity !== "string" || identity.length === 0 || identity.length > V3_LIMITS.maxIdentifierChars) return false;
    const normalized = identity.trim().toLocaleLowerCase("en-US");
    return normalized.length > 0 && normalized !== "unknown" && normalized !== "unavailable" && normalized !== "unverified";
  });
}

function isCurrentCheckpointBlock(
  block: V3SemanticBlock,
  current: V3CheckpointCurrentIdentity,
): boolean {
  if (block.quality.status === "unevaluated") return false;
  return block.tokens.providerId === current.providerId
    && block.tokens.modelId === current.modelId
    && block.tokens.estimatorVersion === current.estimatorVersion
    && block.projectionVersion === current.projectionVersion
    && block.quality.evaluatorVersion === current.qualityEvaluatorVersion;
}

function currentEpochEntries(entries: readonly SessionLikeEntry[], epochId: string): readonly SessionLikeEntry[] | undefined {
  const start = currentEpochStart(entries, epochId);
  return start < 0 ? undefined : entries.slice(start);
}

function currentEpochStart(entries: readonly SessionLikeEntry[], epochId: string): number {
  if (epochId === "root") return 0;
  const index = entries.findIndex((entry) => entry.type === "compaction" && entry.id === epochId);
  return index < 0 ? -1 : index + 1;
}

function containsParentAndDescendant(blocks: readonly V3SemanticBlock[], state: V3LifecycleState): boolean {
  const included = new Set(blocks.map((block) => block.blockId));
  for (const block of blocks) {
    const pending = block.source.kind === "blocks" ? [...block.source.childBlockIds] : [];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const childId = pending.pop()!;
      if (seen.has(childId)) return true;
      seen.add(childId);
      if (included.has(childId)) return true;
      const child = state.blocks.get(childId);
      if (child?.source.kind === "blocks") pending.push(...child.source.childBlockIds);
    }
  }
  return false;
}

function validateProviderProtocol(messages: readonly V3ProjectionMessage[]): string | undefined {
  if (!messages.some((message) => message.role === "user")) return "missing-user-message";
  const calls = new Map<string, { index: number; name: string }>();
  const results = new Set<string>();
  const pending = new Set<string>();
  for (const [index, message] of messages.entries()) {
    if (typeof message.role !== "string" || message.role.length === 0) return "invalid-role";
    if (hasMalformedToolProtocolShape(message)) return "invalid-tool-pair";
    if (pending.size > 0 && message.role !== "toolResult") return "invalid-role-order";
    const foundCalls = toolCalls(message);
    if (foundCalls.length > 0 && message.role !== "assistant") return "invalid-role";
    for (const call of foundCalls) {
      if (calls.has(call.id) || call.name.length === 0) return "invalid-tool-pair";
      calls.set(call.id, { index, name: call.name });
      pending.add(call.id);
    }
    if (message.role !== "toolResult") continue;
    if (typeof message.toolCallId !== "string" || results.has(message.toolCallId)) return "invalid-tool-pair";
    const call = calls.get(message.toolCallId);
    if (!call || call.index >= index || message.toolName !== call.name) return "invalid-tool-pair";
    results.add(message.toolCallId);
    pending.delete(message.toolCallId);
  }
  return [...calls.keys()].every((id) => results.has(id)) ? undefined : "invalid-tool-pair";
}

function hasMalformedToolProtocolShape(message: V3ProjectionMessage): boolean {
  if (message.toolCalls !== undefined && (!Array.isArray(message.toolCalls)
    || message.toolCalls.some((call) => !isRecord(call)
      || typeof call.id !== "string" || call.id.length === 0
      || typeof call.name !== "string" || call.name.length === 0))) return true;
  if (Array.isArray(message.content) && message.content.some((part) => isRecord(part)
    && part.type === "toolCall"
    && (typeof part.id !== "string" || part.id.length === 0 || typeof part.name !== "string" || part.name.length === 0))) {
    return true;
  }
  return message.role === "toolResult"
    && (typeof message.toolCallId !== "string" || message.toolCallId.length === 0
      || typeof message.toolName !== "string" || message.toolName.length === 0);
}

function toolCalls(message: V3ProjectionMessage): Array<{ id: string; name: string }> {
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

function hasNamedToolCall(message: V3ProjectionMessage, callId: string, toolName: string): boolean {
  return message.role === "assistant" && toolCalls(message).some((call) => call.id === callId && call.name === toolName);
}

function preservesUntouchedReferences<T extends V3ProjectionMessage>(
  original: readonly T[],
  projected: readonly T[],
  hidden: ReadonlySet<number>,
  changed: ReadonlySet<number> = new Set(),
): boolean {
  let projectedIndex = 0;
  for (const [index, message] of original.entries()) {
    if (hidden.has(index) || changed.has(index)) continue;
    while (projectedIndex < projected.length && projected[projectedIndex] !== message) projectedIndex += 1;
    if (projectedIndex === projected.length) return false;
    projectedIndex += 1;
  }
  return true;
}

function projectionFailOpen<T extends V3ProjectionMessage>(
  messages: readonly T[],
  hash: string,
  diagnostic: string,
): V3ProjectionResult<T> {
  return { messages, hash, diagnostic, projectedBlockIds: [] };
}

function compareBlocks(left: V3SemanticBlock, right: V3SemanticBlock): number {
  return left.createdAt - right.createdAt
    || left.firstLeafOrdinal - right.firstLeafOrdinal
    || left.blockId.localeCompare(right.blockId);
}

function tierRank(tier: V3Tier): number {
  return tier === "T3" ? 3 : tier === "T2" ? 2 : 1;
}

function firstChange(before: readonly V3ProjectionMessage[], after: readonly V3ProjectionMessage[]): number | undefined {
  const maximum = Math.max(before.length, after.length);
  for (let index = 0; index < maximum; index += 1) {
    if (canonicalJson(before[index]) !== canonicalJson(after[index])) return index;
  }
  return undefined;
}
