import { buildProtocolAtoms } from "./protocol-atoms.js";
import { digest, isRecord, type SessionLikeEntry } from "./contracts.js";

export const ALIGNMENT_VERSION = "aili.alignment.v1" as const;

export interface AlignmentMessage extends Record<string, unknown> {
  role?: string;
  content?: unknown;
}

export interface AlignmentResult {
  byEntryId: ReadonlyMap<string, number>;
  diagnostic?: string;
  providerMessageVisits: number;
}

export interface AlignmentOptions {
  actionForEntry?: (entryId: string) => string;
  suffixCustomType?: string;
}

/** Duplicate-aware monotonic alignment. Any semantically meaningful ambiguity is whole-input fail-open. */
export function alignProviderMessages(
  entries: readonly SessionLikeEntry[],
  messages: readonly AlignmentMessage[],
  options: AlignmentOptions = {},
): AlignmentResult {
  const filteredMessages = messages
    .map((message, originalIndex) => ({ message, originalIndex }))
    .filter(({ message }) => !(message.role === "custom" && message.customType === options.suffixCustomType));
  const messageEntries = entries.flatMap((entry, ordinal) => entry.type === "message" && isRecord(entry.message)
    ? [{ entry, ordinal, fingerprint: alignmentFingerprint(entry.message) }] : []);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    return { byEntryId: new Map(), diagnostic: "alignment-duplicate-entry-id", providerMessageVisits: filteredMessages.length };
  }
  const atoms = buildProtocolAtoms(entries);
  const occurrence = new Map<string, typeof messageEntries>();
  for (const candidate of messageEntries) {
    const values = occurrence.get(candidate.fingerprint) ?? [];
    values.push(candidate);
    occurrence.set(candidate.fingerprint, values);
  }
  const providerFingerprints = filteredMessages.map(({ message }) => alignmentFingerprint(message));
  // A provider-side duplicate with no corresponding Session occurrence makes
  // the surviving occurrence indistinguishable from an injected/external
  // message.  Do not guess which copy owns the Session entry.
  const providerCounts = new Map<string, number>();
  for (const fingerprint of providerFingerprints) {
    providerCounts.set(fingerprint, (providerCounts.get(fingerprint) ?? 0) + 1);
  }
  for (const [fingerprint, candidates] of occurrence) {
    if ((providerCounts.get(fingerprint) ?? 0) > candidates.length) {
      return {
        byEntryId: new Map(),
        diagnostic: `alignment-ambiguous:${safeId(candidates[0]!.entry.id)}`,
        providerMessageVisits: filteredMessages.length,
      };
    }
  }
  const uniqueAnchors = new Map<number, number>();
  let lastOrdinal = -1;
  for (const [providerIndex, fingerprint] of providerFingerprints.entries()) {
    const candidates = occurrence.get(fingerprint) ?? [];
    if (candidates.length !== 1 || candidates[0]!.ordinal <= lastOrdinal) continue;
    uniqueAnchors.set(providerIndex, candidates[0]!.ordinal);
    lastOrdinal = candidates[0]!.ordinal;
  }
  const byEntryId = new Map<string, number>();
  let previousOrdinal = -1;
  for (let providerIndex = 0; providerIndex < filteredMessages.length; providerIndex += 1) {
    const fingerprint = providerFingerprints[providerIndex]!;
    const nextAnchor = nextAnchorOrdinal(uniqueAnchors, providerIndex);
    const candidates = (occurrence.get(fingerprint) ?? []).filter((candidate) =>
      candidate.ordinal > previousOrdinal && (nextAnchor === undefined || candidate.ordinal <= nextAnchor));
    if (candidates.length === 0) continue;
    let selected = candidates[0]!;
    if (candidates.length > 1) {
      const remainingProviderSame = providerFingerprints.slice(providerIndex).filter((value) => value === fingerprint).length;
      if (remainingProviderSame === candidates.length) {
        selected = candidates[0]!;
      } else {
        const classes = new Set(candidates.map((candidate) => alignmentClass(candidate.entry.id, atoms.entryToAtomId, options)));
        if (classes.size !== 1) {
          return { byEntryId: new Map(), diagnostic: `alignment-ambiguous:${safeId(selected.entry.id)}`, providerMessageVisits: filteredMessages.length };
        }
      }
    }
    byEntryId.set(selected.entry.id, filteredMessages[providerIndex]!.originalIndex);
    previousOrdinal = selected.ordinal;
  }
  const protocolFailure = validateProtocolAtomAlignment(atoms.atoms, entries, byEntryId);
  if (protocolFailure) return { byEntryId: new Map(), diagnostic: protocolFailure, providerMessageVisits: filteredMessages.length };
  return { byEntryId, providerMessageVisits: filteredMessages.length };
}

export function alignmentFingerprint(message: Record<string, unknown>): string {
  const role = typeof message.role === "string" ? message.role : "unknown";
  const toolCalls = extractToolCalls(message).map((call) => ({
    id: typeof call.id === "string" ? call.id : null,
    name: typeof call.name === "string" ? call.name : null,
    argumentsDigest: digest(call.arguments ?? call.input ?? null),
  }));
  return digest({
    version: ALIGNMENT_VERSION,
    role,
    contentDigest: digest(canonicalDisplayIndependent(message.content)),
    toolCalls,
    toolCallId: typeof message.toolCallId === "string" ? message.toolCallId : null,
    toolName: typeof message.toolName === "string" ? message.toolName : null,
    isError: message.isError === true,
    customType: typeof message.customType === "string" ? message.customType : null,
    summaryType: role === "compactionSummary" || role === "branchSummary" ? role : null,
  });
}

function alignmentClass(entryId: string, entryToAtomId: ReadonlyMap<string, string>, options: AlignmentOptions): string {
  return digest({ atomId: entryToAtomId.get(entryId) ?? "none", action: options.actionForEntry?.(entryId) ?? "raw" });
}

function nextAnchorOrdinal(anchors: ReadonlyMap<number, number>, providerIndex: number): number | undefined {
  for (const [index, ordinal] of anchors) if (index >= providerIndex) return ordinal;
  return undefined;
}

function validateProtocolAtomAlignment(
  atoms: readonly { kind: string; entryIds: readonly string[] }[],
  entries: readonly SessionLikeEntry[],
  byEntryId: ReadonlyMap<string, number>,
): string | undefined {
  const messageIds = new Set(entries.filter((entry) => entry.type === "message").map((entry) => entry.id));
  for (const atom of atoms) {
    if (atom.kind !== "tool-protocol" && atom.kind !== "remainder") continue;
    const ids = atom.entryIds.filter((id) => messageIds.has(id));
    const mapped = ids.filter((id) => byEntryId.has(id));
    if (mapped.length !== 0 && mapped.length !== ids.length) return `alignment-partial-protocol:${safeId(atom.entryIds[0] ?? "unknown")}`;
    const positions = mapped.map((id) => byEntryId.get(id)!);
    if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) return `alignment-protocol-order:${safeId(atom.entryIds[0] ?? "unknown")}`;
  }
  return undefined;
}

function extractToolCalls(message: Record<string, unknown>): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];
  if (Array.isArray(message.toolCalls)) for (const value of message.toolCalls) if (isRecord(value)) values.push(value);
  if (Array.isArray(message.content)) for (const value of message.content) if (isRecord(value) && value.type === "toolCall") values.push(value);
  return values;
}

function canonicalDisplayIndependent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalDisplayIndependent);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).filter((key) => !["timestamp", "display", "animation", "width"].includes(key)).sort()
    .map((key) => [key, canonicalDisplayIndependent(value[key])]));
}

function safeId(value: string): string {
  return /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : digest(value).slice(0, 16);
}
