import { digest, type CompactState, type SessionLikeEntry } from "./contracts.js";
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
import {
  buildOrderedRuntimeCatalogBlocks,
  deriveRuntimeCatalogId,
  effectiveMessageOrdinalsForEpoch,
} from "./runtime-catalog.js";
import type { BranchMessageReference } from "./branch-index.js";

export const V3_PROJECTION_VERSION = "aili.projector.v3" as const;

export interface V3RuntimeIdentity {
  sessionId: string;
  sessionPath?: string;
}

export interface CombinedBlockReference extends CompactBlockReference {
  family: "legacy" | "v3";
  frontierEligible: boolean;
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
  return assembleV3RuntimeView(
    legacyCatalog,
    legacyState,
    replay,
    state,
    effectiveMessageOrdinalsForEpoch(entries, state.epochId),
  );
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
  return assembleV3RuntimeView(legacyCatalog, legacyState, replay, replay.state ?? fallbackState, effectiveOrdinals);
}

function assembleV3RuntimeView(
  legacyCatalog: CompactReferenceCatalog,
  legacyState: CompactState,
  replay: V3LifecycleReplay,
  state: V3LifecycleState,
  effectiveOrdinals: ReadonlyMap<string, number>,
): V3RuntimeView {
  const orderedBlocks = buildOrderedRuntimeCatalogBlocks(legacyCatalog, legacyState, state, effectiveOrdinals);
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
  for (const block of orderedBlocks) append({
    blockId: block.blockId,
    epochId: block.epochId,
    active: block.active,
    queryOnly: block.queryOnly,
    family: block.family,
    frontierEligible: block.frontierEligible,
  }, block.legacyRef);

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
  const legacyReferenceOrdinals = new Map(legacyCatalog.blocks.map((block) => [block.blockId, block.ordinal] as const));
  const legacySourceOrdinal = (blockId: string): number | undefined => {
    const sourceEntryId = legacyState.blocks.get(blockId)?.sourceEntryIds[0];
    const ordinal = sourceEntryId === undefined ? undefined : effectiveOrdinals.get(sourceEntryId);
    if (typeof ordinal !== "number" || !Number.isSafeInteger(ordinal)
      || ordinal < 0 || ordinal >= Number.MAX_SAFE_INTEGER) return undefined;
    return ordinal;
  };
  const mutationBlockRefs: V3BlockCatalogRef[] = combinedBlocks.map((reference) => {
    const block = state.blocks.get(reference.blockId);
    return {
      ref: reference.ref,
      blockId: reference.blockId,
      // Legacy refs remain readable only. Their marker rejects every v3 child/root
      // selection, but the shared catalog still requires a bounded ordinal.
      effectiveSourceOrdinal: reference.family === "legacy"
        ? legacySourceOrdinal(reference.blockId) ?? legacyReferenceOrdinals.get(reference.blockId) ?? reference.ordinal
        : block?.firstLeafOrdinal ?? Number.MAX_SAFE_INTEGER,
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

export function stableV3BranchId(
  _entries: readonly SessionLikeEntry[],
  epochId: string,
  identity: V3RuntimeIdentity,
): string {
  return `br_${digest({
    sessionId: identity.sessionId,
    sessionPath: identity.sessionPath ?? `session:${identity.sessionId}`,
    epochId,
  })}`;
}

function formatBlockRef(ordinal: number): string {
  return `b${String(ordinal).padStart(6, "0")}`;
}
