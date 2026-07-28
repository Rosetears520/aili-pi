import { digest, type CompactState, type SessionLikeEntry } from "./contracts.js";
import { buildProtocolAtoms } from "./protocol-atoms.js";
import {
  buildReferenceCatalog,
  type CompactBlockReference,
  type CompactReferenceCatalog,
} from "./references.js";
import {
  reduceCompactReadBundle,
  type V3LifecycleReplay,
} from "./reducer.js";
import {
  createEmptyV3State,
  type V3LifecycleState,
} from "./v3.js";
import type {
  V3BlockCatalogRef,
  V3MutationCatalog,
} from "./v3-mutations.js";
import { deriveRuntimeCatalogId } from "./runtime-catalog.js";
import type { BranchMessageReference } from "./branch-index.js";

export const V3_PROJECTION_VERSION = "aili.projector.v3" as const;

export interface V3RuntimeIdentity {
  sessionId: string;
  sessionPath?: string;
}

export interface CombinedBlockReference extends CompactBlockReference {
  family: "legacy" | "v3";
}

export interface V3RuntimeView {
  replay: V3LifecycleReplay;
  state: V3LifecycleState;
  legacyCatalog: CompactReferenceCatalog;
  catalog: Omit<CompactReferenceCatalog, "blocks"> & { blocks: readonly CombinedBlockReference[] };
  mutationCatalog: V3MutationCatalog;
  blockRefById: ReadonlyMap<string, string>;
  blockByRef: ReadonlyMap<string, CombinedBlockReference>;
  legacyRefByCombinedRef: ReadonlyMap<string, string>;
}

/**
 * Creates one dual-reader, v3-writer view from a frozen branch snapshot.
 * The v3 catalog identity is authoritative for new writes; message references
 * remain the existing public m000001 form, while block references are scoped
 * across both schema families without collisions.
 */
export function buildV3RuntimeView(
  entries: readonly SessionLikeEntry[],
  legacyState: CompactState,
  identity: V3RuntimeIdentity,
): V3RuntimeView {
  const bundle = reduceCompactReadBundle(entries);
  const replay = bundle.v3;
  const state = replay.state ?? createEmptyV3State({
    sessionId: identity.sessionId,
    branchLeafId: stableV3BranchId(entries, legacyState.epochId, identity),
    epochId: legacyState.epochId,
    projectionVersion: V3_PROJECTION_VERSION,
  });
  const legacyCatalog = buildReferenceCatalog(entries, legacyState);
  return assembleV3RuntimeView(legacyCatalog, replay, state, effectiveMessageOrdinals(entries));
}

/**
 * Rebuilds only the bounded derived runtime surface from BranchIndex roots.
 * It never replays transactions, rebuilds protocol atoms, or reads Session
 * message bodies.
 */
export function buildIndexedV3RuntimeView(
  references: readonly BranchMessageReference[],
  legacyState: CompactState,
  replay: V3LifecycleReplay,
  fallbackState: V3LifecycleState,
): V3RuntimeView {
  const legacyBlocks = [...legacyState.blocks.values()]
    .filter((block) => block.epochId === legacyState.epochId)
    .map((block, index): CompactBlockReference => ({
      ref: formatBlockRef(index + 1),
      blockId: block.id,
      epochId: legacyState.epochId,
      ordinal: index + 1,
      active: block.active && !block.queryOnly,
      queryOnly: block.queryOnly === true,
    }));
  const messages = references
    .filter((reference) => reference.epochId === legacyState.epochId)
    .map(({ atomId: _atomId, providerOrdinal: _providerOrdinal, ...reference }) => reference);
  const legacyCatalog: CompactReferenceCatalog = {
    catalogId: digest({
      epochId: legacyState.epochId,
      messageEntryIds: messages.map((message) => message.entryId),
      blocks: legacyBlocks.map((block) => ({ blockId: block.blockId, active: block.active, queryOnly: block.queryOnly })),
    }),
    epochId: legacyState.epochId,
    messages,
    blocks: legacyBlocks,
  };
  const effectiveOrdinals = new Map(references.map((reference) => [reference.entryId, reference.providerOrdinal] as const));
  return assembleV3RuntimeView(legacyCatalog, replay, replay.state ?? fallbackState, effectiveOrdinals);
}

function assembleV3RuntimeView(
  legacyCatalog: CompactReferenceCatalog,
  replay: V3LifecycleReplay,
  state: V3LifecycleState,
  effectiveOrdinals: ReadonlyMap<string, number>,
): V3RuntimeView {
  const v3Blocks = [...state.blocks.values()]
    .filter((block) => block.epochId === state.epochId)
    .sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal
      || left.createdAt - right.createdAt
      || left.blockId.localeCompare(right.blockId));
  const combinedBlocks: CombinedBlockReference[] = [];
  const blockRefById = new Map<string, string>();
  const blockByRef = new Map<string, CombinedBlockReference>();
  const legacyRefByCombinedRef = new Map<string, string>();
  const append = (reference: Omit<CombinedBlockReference, "ref" | "ordinal">, legacyRef?: string) => {
    const ordinal = combinedBlocks.length + 1;
    const ref = formatBlockRef(ordinal);
    const value: CombinedBlockReference = { ...reference, ref, ordinal };
    combinedBlocks.push(value);
    blockRefById.set(value.blockId, ref);
    blockByRef.set(ref, value);
    if (legacyRef) legacyRefByCombinedRef.set(ref, legacyRef);
  };
  for (const block of v3Blocks) append({
    blockId: block.blockId,
    epochId: block.epochId,
    active: block.active && !block.queryOnly,
    queryOnly: block.queryOnly,
    family: "v3",
  });
  for (const block of legacyCatalog.blocks) append({
    blockId: block.blockId,
    epochId: block.epochId,
    active: block.active,
    queryOnly: block.queryOnly,
    family: "legacy",
  }, block.ref);

  const publicCatalogId = deriveRuntimeCatalogId({
    stateCatalogId: state.catalogId,
    epochId: state.epochId,
    messages: legacyCatalog.messages.map((message) => ({
      ref: message.ref,
      entryId: message.entryId,
      atomEntryIds: message.atomEntryIds,
    })),
    blocks: combinedBlocks.map((block) => ({
      ref: block.ref,
      blockId: block.blockId,
      family: block.family,
      active: block.active,
      queryOnly: block.queryOnly,
    })),
  });
  const catalog = {
    catalogId: publicCatalogId,
    epochId: state.epochId,
    messages: legacyCatalog.messages,
    blocks: combinedBlocks,
  };
  const mutationBlockRefs: V3BlockCatalogRef[] = combinedBlocks.map((reference) => {
    const block = state.blocks.get(reference.blockId);
    return {
      ref: reference.ref,
      blockId: reference.blockId,
      effectiveSourceOrdinal: block?.firstLeafOrdinal ?? Number.MAX_SAFE_INTEGER,
      ...(reference.family === "legacy" ? { legacy: true } : {}),
    };
  });
  return {
    replay,
    state,
    legacyCatalog,
    catalog,
    mutationCatalog: {
      catalogId: publicCatalogId,
      stateCatalogId: state.catalogId,
      sessionId: state.sessionId,
      branchLeafId: state.branchLeafId,
      epochId: state.epochId,
      projectionVersion: state.projectionVersion,
      messageRefs: legacyCatalog.messages.map((message) => ({
        ref: message.ref,
        entryId: message.entryId,
        effectiveSourceOrdinal: effectiveOrdinals.get(message.entryId) ?? Number.MAX_SAFE_INTEGER,
      })),
      blockRefs: mutationBlockRefs,
    },
    blockRefById,
    blockByRef,
    legacyRefByCombinedRef,
  };
}

/** Resolves the exact ordered raw message leaves for one v3 block. */
export function v3LeafEntryIds(state: V3LifecycleState, blockId: string): readonly string[] {
  const memo = new Map<string, readonly string[]>();
  const visit = (id: string, stack: Set<string>): readonly string[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (stack.has(id)) return [];
    const block = state.blocks.get(id);
    if (!block) return [];
    stack.add(id);
    const result = block.source.kind === "messages"
      ? [...block.source.entryIds]
      : block.source.childBlockIds.flatMap((childId) => visit(childId, stack));
    stack.delete(id);
    memo.set(id, result);
    return result;
  };
  return visit(blockId, new Set());
}

function stableV3BranchId(
  entries: readonly SessionLikeEntry[],
  epochId: string,
  identity: V3RuntimeIdentity,
): string {
  const epochIndex = epochId === "root"
    ? -1
    : entries.findIndex((entry) => entry.type === "compaction" && entry.id === epochId);
  const branchSourceIds = entries.slice(epochIndex + 1)
    .filter((entry) => entry.type !== "custom" && !isAiliProtocolEntry(entry))
    .map((entry) => entry.id);
  return `br_${digest({
    sessionId: identity.sessionId,
    sessionPath: identity.sessionPath ?? `session:${identity.sessionId}`,
    epochId,
    branchSourceIds,
  })}`;
}

function isAiliProtocolEntry(entry: SessionLikeEntry): boolean {
  if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") return false;
  const message = entry.message as Record<string, unknown>;
  if (typeof message.toolName === "string" && message.toolName.startsWith("aili_")) return true;
  const parts = [
    ...(Array.isArray(message.toolCalls) ? message.toolCalls : []),
    ...(Array.isArray(message.content) ? message.content : []),
  ];
  return parts.some((part) => part !== null && typeof part === "object"
    && typeof (part as Record<string, unknown>).name === "string"
    && ((part as Record<string, unknown>).name as string).startsWith("aili_"));
}

function effectiveMessageOrdinals(entries: readonly SessionLikeEntry[]): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  let ordinal = 1;
  for (const atom of buildProtocolAtoms(entries).atoms) {
    for (const entryId of atom.entryIds) {
      result.set(entryId, ordinal);
      ordinal += 1;
    }
  }
  return result;
}

function formatBlockRef(ordinal: number): string {
  return `b${String(ordinal).padStart(6, "0")}`;
}
