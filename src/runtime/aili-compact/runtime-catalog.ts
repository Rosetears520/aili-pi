import { digest, type CompactState, type SessionLikeEntry } from "./contracts.js";
import { buildReferenceCatalog } from "./references.js";
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

/** Reconstructs the same public identity from a frozen pre-transaction state. */
export function deriveRuntimeCatalogIdForState(
  entries: readonly SessionLikeEntry[],
  legacyState: CompactState,
  v3State: V3LifecycleState,
): string {
  const legacy = buildReferenceCatalog(entries, legacyState);
  const v3Blocks = [...v3State.blocks.values()]
    .filter((block) => block.epochId === v3State.epochId)
    .sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal
      || left.createdAt - right.createdAt
      || left.blockId.localeCompare(right.blockId));
  let ordinal = 0;
  const nextRef = () => `b${String(++ordinal).padStart(6, "0")}`;
  return deriveRuntimeCatalogId({
    stateCatalogId: v3State.catalogId,
    epochId: v3State.epochId,
    messages: legacy.messages,
    blocks: [
      ...v3Blocks.map((block) => ({
        ref: nextRef(),
        blockId: block.blockId,
        family: "v3" as const,
        active: block.active && !block.queryOnly,
        queryOnly: block.queryOnly,
      })),
      ...legacy.blocks.map((block) => ({
        ref: nextRef(),
        blockId: block.blockId,
        family: "legacy" as const,
        active: block.active,
        queryOnly: block.queryOnly,
      })),
    ],
  });
}
