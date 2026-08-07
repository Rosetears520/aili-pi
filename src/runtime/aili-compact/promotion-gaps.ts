import { digest, isRecord, type SessionLikeEntry } from "./contracts.js";
import { buildProtocolAtoms } from "./protocol-atoms.js";

export const TRANSPARENT_PROMOTION_GAP_VERSION = 1 as const;
export const MAX_TRANSPARENT_PROMOTION_GAPS = 15;
export const MAX_TRANSPARENT_PROMOTION_GAP_MESSAGES = 256;

const AILI_PLANNING_TOOLS = new Set(["aili_compact_status", "aili_compact"]);

export interface TransparentPromotionGapV1 {
  version: typeof TRANSPARENT_PROMOTION_GAP_VERSION;
  leftChildBlockId: string;
  rightChildBlockId: string;
  leftLeafEntryId: string;
  rightLeafEntryId: string;
  messageCount: number;
  gapDigest: string;
}

export interface PromotionGapBlock {
  blockId: string;
  firstLeafOrdinal: number;
  lastLeafOrdinal: number;
  source: { kind: "messages"; entryIds: readonly string[] }
    | { kind: "blocks"; childBlockIds: readonly string[] };
}

export type PromotionGapResult =
  | { ok: true; proofs: TransparentPromotionGapV1[] }
  | { ok: false; pairIndex: number; reason: string };

/**
 * Derives every non-empty promotion gap from the immutable raw provider-message
 * sequence. Protocol atoms remain evidence only and never become semantic leaves.
 */
export function classifyTransparentPromotionGaps(
  entries: readonly SessionLikeEntry[],
  blocks: ReadonlyMap<string, PromotionGapBlock>,
  children: readonly PromotionGapBlock[],
): PromotionGapResult {
  if (children.length < 2 || children.length - 1 > MAX_TRANSPARENT_PROMOTION_GAPS) {
    return { ok: false, pairIndex: 0, reason: "invalid-child-count" };
  }
  const providerEntries = entries.filter((entry) => entry.type === "message" && isRecord(entry.message));
  const ordinalById = new Map<string, number>();
  for (const [index, entry] of providerEntries.entries()) {
    if (ordinalById.has(entry.id)) return { ok: false, pairIndex: 0, reason: "duplicate-entry-id" };
    ordinalById.set(entry.id, index + 1);
  }
  const atomBuild = buildProtocolAtoms(entries);
  const atomByEntryId = new Map(atomBuild.atoms.flatMap((atom) => atom.entryIds.map((entryId) => [entryId, atom] as const)));
  const proofs: TransparentPromotionGapV1[] = [];

  for (let index = 1; index < children.length; index += 1) {
    const left = children[index - 1]!;
    const right = children[index]!;
    if (right.firstLeafOrdinal <= left.lastLeafOrdinal) {
      return { ok: false, pairIndex: index - 1, reason: "overlapping-or-reordered-children" };
    }
    const leftLeafEntryId = boundaryLeafEntryId(blocks, left, "last");
    const rightLeafEntryId = boundaryLeafEntryId(blocks, right, "first");
    if (!leftLeafEntryId || !rightLeafEntryId
      || ordinalById.get(leftLeafEntryId) !== left.lastLeafOrdinal
      || ordinalById.get(rightLeafEntryId) !== right.firstLeafOrdinal) {
      return { ok: false, pairIndex: index - 1, reason: "missing-or-mismatched-endpoint" };
    }
    const gap = providerEntries.slice(left.lastLeafOrdinal, right.firstLeafOrdinal - 1);
    if (gap.length === 0) continue;
    if (gap.length > MAX_TRANSPARENT_PROMOTION_GAP_MESSAGES) {
      return { ok: false, pairIndex: index - 1, reason: "oversized-gap" };
    }
    const gapIds = new Set(gap.map((entry) => entry.id));
    const atoms = new Map(gap.flatMap((entry) => {
      const atom = atomByEntryId.get(entry.id);
      return atom ? [[atom.atomId, atom] as const] : [];
    }));
    if (atoms.size === 0 || [...atoms.values()].some((atom) => atom.kind !== "tool-protocol"
      || atom.hardProtected
      || atom.entryIds.some((entryId) => !gapIds.has(entryId)))) {
      return { ok: false, pairIndex: index - 1, reason: "non-transparent-protocol" };
    }
    if (gap.some((entry) => !isAiliPlanningProtocolMessage(entry))) {
      return { ok: false, pairIndex: index - 1, reason: "non-aili-planning-message" };
    }
    proofs.push({
      version: TRANSPARENT_PROMOTION_GAP_VERSION,
      leftChildBlockId: left.blockId,
      rightChildBlockId: right.blockId,
      leftLeafEntryId,
      rightLeafEntryId,
      messageCount: gap.length,
      gapDigest: transparentPromotionGapDigest(gap, left.lastLeafOrdinal + 1),
    });
  }
  return { ok: true, proofs };
}

export function transparentPromotionGapDigest(entries: readonly SessionLikeEntry[], firstOrdinal: number): string {
  return digest({
    version: TRANSPARENT_PROMOTION_GAP_VERSION,
    messages: entries.map((entry, index) => ({
      ordinal: firstOrdinal + index,
      entryId: entry.id,
      message: entry.message,
    })),
  });
}

function boundaryLeafEntryId(
  blocks: ReadonlyMap<string, PromotionGapBlock>,
  block: PromotionGapBlock,
  side: "first" | "last",
  visiting = new Set<string>(),
): string | undefined {
  if (visiting.has(block.blockId)) return undefined;
  if (block.source.kind === "messages") return side === "first" ? block.source.entryIds[0] : block.source.entryIds.at(-1);
  const childId = side === "first" ? block.source.childBlockIds[0] : block.source.childBlockIds.at(-1);
  const child = childId ? blocks.get(childId) : undefined;
  if (!child) return undefined;
  visiting.add(block.blockId);
  const result = boundaryLeafEntryId(blocks, child, side, visiting);
  visiting.delete(block.blockId);
  return result;
}

function isAiliPlanningProtocolMessage(entry: SessionLikeEntry): boolean {
  if (!isRecord(entry.message)) return false;
  const message = entry.message;
  if (message.role === "toolResult") {
    return typeof message.toolCallId === "string" && message.toolCallId.length > 0
      && typeof message.toolName === "string" && AILI_PLANNING_TOOLS.has(message.toolName);
  }
  if (message.role !== "assistant") return false;
  const calls = [
    ...(Array.isArray(message.toolCalls) ? message.toolCalls : []),
    ...(Array.isArray(message.content) ? message.content.filter((part) => isRecord(part) && part.type === "toolCall") : []),
  ];
  return calls.length > 0 && calls.every((call) => isRecord(call)
    && typeof call.id === "string" && call.id.length > 0
    && typeof call.name === "string" && AILI_PLANNING_TOOLS.has(call.name));
}
