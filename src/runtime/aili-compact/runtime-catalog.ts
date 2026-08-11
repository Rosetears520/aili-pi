import { digest, type CompactState, type SessionLikeEntry } from "./contracts.js";
import { buildProtocolAtoms } from "./protocol-atoms.js";
import { buildReferenceCatalog, type CompactReferenceCatalog } from "./references.js";
import type { V3LifecycleState } from "./v3.js";

export interface RuntimeCatalogMessageIdentity {
  ref: string;
  entryId: string;
  atomEntryIds: readonly string[];
}

export interface RuntimeCatalogBlockIdentity {
  ref: string;
  blockId: string;
  family: "legacy" | "v3";
  active: boolean;
  queryOnly: boolean;
}

/**
 * A public dual-schema reference retains legacy read/mutation translation even
 * when its source cannot safely appear in the default provider frontier.
 */
export interface OrderedRuntimeCatalogBlock {
  blockId: string;
  epochId: string;
  family: "legacy" | "v3";
  active: boolean;
  queryOnly: boolean;
  frontierEligible: boolean;
  legacyRef?: string;
}

/** Metadata used to allocate stable cross-schema public block references. */
export interface RuntimeCatalogBlockOrderMetadata {
  blockId: string;
  family: "legacy" | "v3";
  firstLeafOrdinal?: number;
  createdAt?: number;
  legacyOrdinal?: number;
}

/** Orders cross-schema blocks by verified semantic source before public ref allocation. */
export function orderRuntimeCatalogBlocksBySemanticSource<T extends RuntimeCatalogBlockOrderMetadata>(
  blocks: readonly T[],
): readonly T[] {
  return [...blocks].sort((left, right) => {
    if (left.firstLeafOrdinal !== undefined && right.firstLeafOrdinal !== undefined) {
      const sourceOrder = left.firstLeafOrdinal - right.firstLeafOrdinal;
      if (sourceOrder !== 0) return sourceOrder;
    } else if (left.firstLeafOrdinal !== undefined) {
      return -1;
    } else if (right.firstLeafOrdinal !== undefined) {
      return 1;
    }
    if (left.family === "v3" && right.family === "v3") {
      const creationOrder = left.createdAt! - right.createdAt!;
      if (creationOrder !== 0) return creationOrder;
    } else if (left.family === "legacy" && right.family === "legacy") {
      const creationOrder = left.legacyOrdinal! - right.legacyOrdinal!;
      if (creationOrder !== 0) return creationOrder;
    } else {
      const familyOrder = left.family.localeCompare(right.family);
      if (familyOrder !== 0) return familyOrder;
    }
    return left.blockId.localeCompare(right.blockId);
  });
}

/**
 * Public mutation scope identity. Unlike the private v3 lifecycle digest this
 * binds every ref surface the caller actually observed, including legacy
 * blocks and current raw message atoms.
 */
export function deriveRuntimeCatalogId(input: {
  stateCatalogId: string;
  epochId: string;
  messages: readonly RuntimeCatalogMessageIdentity[];
  blocks: readonly RuntimeCatalogBlockIdentity[];
}): string {
  return digest({
    version: "aili.compact.runtime-catalog.v3",
    stateCatalogId: input.stateCatalogId,
    epochId: input.epochId,
    messages: input.messages.map(({ ref, entryId, atomEntryIds }) => ({ ref, entryId, atomEntryIds })),
    blocks: input.blocks.map(({ ref, blockId, family, active, queryOnly }) => ({
      ref,
      blockId,
      family,
      active,
      queryOnly,
    })),
  });
}

/**
 * Orders the public dual-schema catalog by verified semantic source before
 * allocating public refs. A block without a current effective ordinal remains
 * active and referenceable in the catalog when its lifecycle state permits,
 * but cannot enter the default provider frontier.
 */
export function buildOrderedRuntimeCatalogBlocks(
  legacyCatalog: CompactReferenceCatalog,
  legacyState: CompactState,
  v3State: V3LifecycleState,
  effectiveOrdinals: ReadonlyMap<string, number>,
): readonly OrderedRuntimeCatalogBlock[] {
  type OrderableBlock = OrderedRuntimeCatalogBlock & RuntimeCatalogBlockOrderMetadata;
  const verifiedOrdinal = (value: number | undefined): number | undefined => (
    Number.isSafeInteger(value) && value! > 0 ? value : undefined
  );
  const v3Blocks: OrderableBlock[] = [...v3State.blocks.values()]
    .filter((block) => block.epochId === v3State.epochId)
    .map((block) => {
      const firstLeafOrdinal = verifiedOrdinal(block.firstLeafOrdinal);
      const frontierEligible = block.active && !block.queryOnly && firstLeafOrdinal !== undefined;
      return {
        blockId: block.blockId,
        epochId: block.epochId,
        family: "v3" as const,
        active: block.active && !block.queryOnly,
        queryOnly: block.queryOnly,
        frontierEligible,
        ...(firstLeafOrdinal === undefined ? {} : { firstLeafOrdinal }),
        createdAt: block.createdAt,
      };
    });
  const legacyBlocks: OrderableBlock[] = legacyCatalog.blocks.map((reference) => {
    const block = legacyState.blocks.get(reference.blockId);
    const firstLeafOrdinal = verifiedOrdinal(block?.sourceEntryIds[0]
      ? effectiveOrdinals.get(block.sourceEntryIds[0])
      : undefined);
    const frontierEligible = reference.active && !reference.queryOnly && firstLeafOrdinal !== undefined;
    return {
      blockId: reference.blockId,
      epochId: reference.epochId,
      family: "legacy" as const,
      active: reference.active && !reference.queryOnly,
      queryOnly: reference.queryOnly,
      frontierEligible,
      legacyRef: reference.ref,
      ...(firstLeafOrdinal === undefined ? {} : { firstLeafOrdinal }),
      legacyOrdinal: reference.ordinal,
    };
  });
  return orderRuntimeCatalogBlocksBySemanticSource([...v3Blocks, ...legacyBlocks]);
}

/** Derives effective raw ordinals only from the current epoch's valid unique raw slots. */
export function effectiveMessageOrdinalsForEpoch(
  entries: readonly SessionLikeEntry[],
  epochId: string,
): ReadonlyMap<string, number> {
  const epochEntries = entriesForEpoch(entries, epochId);
  const rawMessages = epochEntries.filter((entry) => entry.type === "message");
  const rawIds = new Set<string>();
  for (const entry of rawMessages) {
    if (!entry.id || rawIds.has(entry.id)) return new Map();
    rawIds.add(entry.id);
  }
  const atomEntryIds = new Set(buildProtocolAtoms(epochEntries).atoms.flatMap((atom) => atom.entryIds));
  const result = new Map<string, number>();
  for (const [index, entry] of rawMessages.entries()) {
    if (atomEntryIds.has(entry.id)) result.set(entry.id, index + 1);
  }
  return result;
}

/** Reconstructs the same public identity from a frozen pre-transaction state. */
export function deriveRuntimeCatalogIdForState(
  entries: readonly SessionLikeEntry[],
  legacyState: CompactState,
  v3State: V3LifecycleState,
): string {
  const legacy = buildReferenceCatalog(entries, legacyState);
  const blocks = buildOrderedRuntimeCatalogBlocks(
    legacy,
    legacyState,
    v3State,
    effectiveMessageOrdinalsForEpoch(entries, v3State.epochId),
  );
  let ordinal = 0;
  const nextRef = () => `b${String(++ordinal).padStart(6, "0")}`;
  return deriveRuntimeCatalogId({
    stateCatalogId: v3State.catalogId,
    epochId: v3State.epochId,
    messages: legacy.messages,
    blocks: blocks.map((block) => ({
      ref: nextRef(),
      blockId: block.blockId,
      family: block.family,
      active: block.active,
      queryOnly: block.queryOnly,
    })),
  });
}

function entriesForEpoch(entries: readonly SessionLikeEntry[], epochId: string): readonly SessionLikeEntry[] {
  if (epochId === "root") return entries;
  const boundary = entries.findIndex((entry) => entry.type === "compaction" && entry.id === epochId);
  return boundary < 0 ? [] : entries.slice(boundary + 1);
}
