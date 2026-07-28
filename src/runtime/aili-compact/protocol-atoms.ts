import { Buffer } from "node:buffer";

import { canonicalJson, digest, isRecord, type SessionLikeEntry } from "./contracts.js";

export const PROTOCOL_ATOM_VERSION = "aili.protocol-atoms.v1" as const;

export const PROTOCOL_ATOM_PROTECTION_REASONS = [
  "binary",
  "duplicate-entry-id",
  "duplicate-tool-call",
  "duplicate-tool-result",
  "incomplete-tool-protocol",
  "malformed-message",
  "malformed-tool-protocol",
  "orphan-tool-result",
] as const;

export type ProtocolAtomProtectionReason = typeof PROTOCOL_ATOM_PROTECTION_REASONS[number];
export type ProtocolAtomKind = "message" | "tool-protocol" | "summary" | "remainder";
export type ProtocolAtomTurnState = "assistant-closed" | "neutral" | "tool-open" | "unknown" | "user-open";

export interface ProtocolAtom {
  atomId: string;
  /** One-based stable ordinal in provider-visible source order. */
  ordinal: number;
  kind: ProtocolAtomKind;
  entryIds: readonly string[];
  /** Zero-based positions in the original Session entry array. */
  entryIndexes: readonly number[];
  startEntryIndex: number;
  endEntryIndex: number;
  roles: readonly string[];
  toolCallIds: readonly string[];
  messageCount: number;
  structuredToolPartCount: number;
  utf8Bytes: number;
  surfaceSaturated: boolean;
  sourceDigest: string;
  hardProtected: boolean;
  protectionReasons: readonly ProtocolAtomProtectionReason[];
  containsUser: boolean;
  containsAssistant: boolean;
  turnState: ProtocolAtomTurnState;
}

export interface ProtocolAtomBuildResult {
  version: typeof PROTOCOL_ATOM_VERSION;
  atoms: readonly ProtocolAtom[];
  providerEntryCount: number;
  sourceDigest: string;
  entryToAtomId: ReadonlyMap<string, string>;
  diagnosticCounts: Readonly<Record<ProtocolAtomProtectionReason, number>>;
}

interface ProviderEntry {
  entry: SessionLikeEntry;
  sourceIndex: number;
}

interface ToolCall {
  id: string;
  name: string;
}

interface MessageAnalysis {
  role?: string;
  protocolLooking: boolean;
  calls: readonly ToolCall[];
  malformedCalls: boolean;
  duplicateCallIds: boolean;
  isToolResult: boolean;
  resultId?: string;
  resultName?: string;
  malformedResult: boolean;
  binary: boolean;
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * Builds the smallest provider-safe ordered units without retaining raw message bodies.
 * Invalid protocol is deliberately represented as a hard-protected remainder atom.
 */
export function buildProtocolAtoms(entries: readonly SessionLikeEntry[]): ProtocolAtomBuildResult {
  const providerEntries: ProviderEntry[] = entries.flatMap((entry, sourceIndex) =>
    entry.type === "message" ? [{ entry, sourceIndex }] : []);
  const analyses = providerEntries.map(({ entry }) => analyzeMessage(entry.message));
  const entryIdCounts = countStrings(providerEntries.map(({ entry }) => entry.id));
  const callIdCounts = countStrings(analyses.flatMap((analysis) => analysis.calls.map((call) => call.id)));
  const resultIdCounts = countStrings(analyses.flatMap((analysis) => analysis.resultId ? [analysis.resultId] : []));

  const atoms: ProtocolAtom[] = [];
  for (let cursor = 0; cursor < providerEntries.length;) {
    const analysis = analyses[cursor]!;
    if (analysis.isToolResult) {
      const end = consumeConsecutiveResults(analyses, cursor);
      atoms.push(makeRemainderAtom(
        atoms.length + 1,
        providerEntries.slice(cursor, end),
        analyses.slice(cursor, end),
        entryIdCounts,
        resultIdCounts,
        ["orphan-tool-result"],
      ));
      cursor = end;
      continue;
    }

    if (analysis.protocolLooking) {
      const end = consumeConsecutiveResults(analyses, cursor + 1);
      const groupEntries = providerEntries.slice(cursor, end);
      const groupAnalyses = analyses.slice(cursor, end);
      const reasons = validateToolGroup(groupAnalyses, callIdCounts, resultIdCounts);
      addSharedProtectionReasons(reasons, groupEntries, groupAnalyses, entryIdCounts);
      atoms.push(makeAtom(
        atoms.length + 1,
        reasons.size === 0 ? "tool-protocol" : "remainder",
        groupEntries,
        groupAnalyses,
        reasons,
        reasons.size === 0 ? "tool-open" : "unknown",
      ));
      cursor = end;
      continue;
    }

    const reasons = new Set<ProtocolAtomProtectionReason>();
    addSharedProtectionReasons(reasons, [providerEntries[cursor]!], [analysis], entryIdCounts);
    const role = analysis.role;
    let kind: ProtocolAtomKind = role === "custom" || role === "system" ? "summary" : "message";
    let turnState: ProtocolAtomTurnState = role === "user"
      ? "user-open"
      : role === "assistant" ? "assistant-closed" : "neutral";
    if (!isOrdinaryRole(role)) {
      reasons.add("malformed-message");
      kind = "remainder";
      turnState = "unknown";
    }
    if (reasons.size > 0) {
      kind = "remainder";
      turnState = "unknown";
    }
    atoms.push(makeAtom(
      atoms.length + 1,
      kind,
      [providerEntries[cursor]!],
      [analysis],
      reasons,
      turnState,
    ));
    cursor += 1;
  }

  const entryToAtomId = new Map<string, string>();
  for (const atom of atoms) {
    for (const entryId of atom.entryIds) {
      if (entryIdCounts.get(entryId) === 1) entryToAtomId.set(entryId, atom.atomId);
    }
  }
  const diagnosticCounts = Object.fromEntries(PROTOCOL_ATOM_PROTECTION_REASONS.map((reason) => [
    reason,
    atoms.filter((atom) => atom.protectionReasons.includes(reason)).length,
  ])) as Record<ProtocolAtomProtectionReason, number>;

  return {
    version: PROTOCOL_ATOM_VERSION,
    atoms,
    providerEntryCount: providerEntries.length,
    sourceDigest: digest(providerEntries.map(({ entry, sourceIndex }) => ({
      sourceIndex,
      id: entry.id,
      type: entry.type,
      message: entry.message,
    }))),
    entryToAtomId,
    diagnosticCounts,
  };
}

function makeRemainderAtom(
  ordinal: number,
  groupEntries: readonly ProviderEntry[],
  groupAnalyses: readonly MessageAnalysis[],
  entryIdCounts: ReadonlyMap<string, number>,
  resultIdCounts: ReadonlyMap<string, number>,
  initialReasons: readonly ProtocolAtomProtectionReason[],
): ProtocolAtom {
  const reasons = new Set<ProtocolAtomProtectionReason>(initialReasons);
  addSharedProtectionReasons(reasons, groupEntries, groupAnalyses, entryIdCounts);
  if (groupAnalyses.some((analysis) => analysis.malformedResult)) reasons.add("malformed-tool-protocol");
  if (groupAnalyses.some((analysis) => analysis.resultId && (resultIdCounts.get(analysis.resultId) ?? 0) > 1)) {
    reasons.add("duplicate-tool-result");
  }
  return makeAtom(ordinal, "remainder", groupEntries, groupAnalyses, reasons, "unknown");
}

function makeAtom(
  ordinal: number,
  kind: ProtocolAtomKind,
  groupEntries: readonly ProviderEntry[],
  groupAnalyses: readonly MessageAnalysis[],
  reasons: ReadonlySet<ProtocolAtomProtectionReason>,
  turnState: ProtocolAtomTurnState,
): ProtocolAtom {
  const orderedReasons = PROTOCOL_ATOM_PROTECTION_REASONS.filter((reason) => reasons.has(reason));
  let utf8Bytes = 0;
  let surfaceSaturated = false;
  for (const { entry } of groupEntries) {
    const next = saturatingAdd(utf8Bytes, Buffer.byteLength(canonicalJson(entry.message), "utf8"));
    utf8Bytes = next.value;
    surfaceSaturated ||= next.saturated;
  }
  const entryIndexes = groupEntries.map(({ sourceIndex }) => sourceIndex);
  const roles = groupAnalyses.flatMap((analysis) => analysis.role ? [analysis.role] : []);
  const calls = groupAnalyses.flatMap((analysis) => analysis.calls);
  const resultCount = groupAnalyses.filter((analysis) => analysis.isToolResult).length;
  const snapshots = groupEntries.map(({ entry, sourceIndex }) => ({
    sourceIndex,
    id: entry.id,
    type: entry.type,
    message: entry.message,
  }));
  return {
    atomId: `a${String(ordinal).padStart(6, "0")}`,
    ordinal,
    kind,
    entryIds: groupEntries.map(({ entry }) => entry.id),
    entryIndexes,
    startEntryIndex: entryIndexes[0] ?? -1,
    endEntryIndex: entryIndexes.at(-1) ?? -1,
    roles,
    toolCallIds: calls.map((call) => call.id),
    messageCount: groupEntries.length,
    structuredToolPartCount: calls.length + resultCount,
    utf8Bytes,
    surfaceSaturated,
    sourceDigest: digest(snapshots),
    hardProtected: orderedReasons.length > 0,
    protectionReasons: orderedReasons,
    containsUser: roles.includes("user"),
    containsAssistant: roles.includes("assistant"),
    turnState,
  };
}

function validateToolGroup(
  group: readonly MessageAnalysis[],
  callIdCounts: ReadonlyMap<string, number>,
  resultIdCounts: ReadonlyMap<string, number>,
): Set<ProtocolAtomProtectionReason> {
  const reasons = new Set<ProtocolAtomProtectionReason>();
  const caller = group[0]!;
  const results = group.slice(1);
  if (caller.role !== "assistant" || caller.malformedCalls || caller.calls.length === 0) {
    reasons.add("malformed-tool-protocol");
  }
  if (caller.duplicateCallIds || caller.calls.some((call) => (callIdCounts.get(call.id) ?? 0) > 1)) {
    reasons.add("duplicate-tool-call");
  }
  if (results.some((result) => result.malformedResult)) reasons.add("malformed-tool-protocol");

  const expected = new Map(caller.calls.map((call) => [call.id, call.name]));
  const matched = new Set<string>();
  for (const result of results) {
    if (!result.resultId || !result.resultName) continue;
    if ((resultIdCounts.get(result.resultId) ?? 0) > 1 || matched.has(result.resultId)) {
      reasons.add("duplicate-tool-result");
    }
    const expectedName = expected.get(result.resultId);
    if (!expectedName || expectedName !== result.resultName) {
      reasons.add("malformed-tool-protocol");
    } else {
      matched.add(result.resultId);
    }
  }
  if (caller.calls.some((call) => !matched.has(call.id))) reasons.add("incomplete-tool-protocol");
  if (results.length !== caller.calls.length && !reasons.has("duplicate-tool-result")) {
    reasons.add("incomplete-tool-protocol");
  }
  return reasons;
}

function addSharedProtectionReasons(
  reasons: Set<ProtocolAtomProtectionReason>,
  groupEntries: readonly ProviderEntry[],
  groupAnalyses: readonly MessageAnalysis[],
  entryIdCounts: ReadonlyMap<string, number>,
): void {
  if (groupEntries.some(({ entry }) => !entry.id || (entryIdCounts.get(entry.id) ?? 0) > 1)) {
    reasons.add("duplicate-entry-id");
  }
  if (groupEntries.some(({ entry }) => !isRecord(entry.message))) reasons.add("malformed-message");
  if (groupAnalyses.some((analysis) => analysis.binary)) reasons.add("binary");
}

function analyzeMessage(value: unknown): MessageAnalysis {
  if (!isRecord(value)) {
    return {
      protocolLooking: false,
      calls: [],
      malformedCalls: false,
      duplicateCallIds: false,
      isToolResult: false,
      malformedResult: false,
      binary: false,
    };
  }
  const role = typeof value.role === "string" ? value.role : undefined;
  const candidates: unknown[] = [];
  let protocolLooking = false;
  let malformedCalls = false;
  if (value.toolCalls !== undefined) {
    if (Array.isArray(value.toolCalls)) {
      candidates.push(...value.toolCalls);
      protocolLooking ||= value.toolCalls.length > 0;
    } else {
      protocolLooking = true;
      malformedCalls = true;
    }
  }
  if (Array.isArray(value.content)) {
    for (const part of value.content) {
      if (isRecord(part) && part.type === "toolCall") {
        candidates.push(part);
        protocolLooking = true;
      }
    }
  }
  const calls: ToolCall[] = [];
  for (const candidate of candidates) {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string" || candidate.id.length === 0
      || typeof candidate.name !== "string" || candidate.name.length === 0) {
      malformedCalls = true;
      continue;
    }
    calls.push({ id: candidate.id, name: candidate.name.toLocaleLowerCase() });
  }
  const isToolResult = role === "toolResult";
  const resultId = isToolResult && typeof value.toolCallId === "string" && value.toolCallId.length > 0
    ? value.toolCallId : undefined;
  const resultName = isToolResult && typeof value.toolName === "string" && value.toolName.length > 0
    ? value.toolName.toLocaleLowerCase() : undefined;
  return {
    role,
    protocolLooking,
    calls,
    malformedCalls,
    duplicateCallIds: new Set(calls.map((call) => call.id)).size !== calls.length,
    isToolResult,
    resultId,
    resultName,
    malformedResult: isToolResult && (!resultId || !resultName),
    binary: hasBinaryContent(value.content),
  };
}

function consumeConsecutiveResults(analyses: readonly MessageAnalysis[], start: number): number {
  let end = start;
  while (end < analyses.length && analyses[end]!.isToolResult) end += 1;
  return end;
}

function hasBinaryContent(content: unknown): boolean {
  if (content === undefined || typeof content === "string") return false;
  if (!Array.isArray(content)) return true;
  return content.some((part) => {
    if (typeof part === "string") return false;
    if (!isRecord(part)) return true;
    return part.type !== "text" && part.type !== "toolCall";
  });
}

function isOrdinaryRole(role: string | undefined): boolean {
  return role === "user" || role === "assistant" || role === "custom" || role === "system";
}

function countStrings(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function saturatingAdd(left: number, right: number): { value: number; saturated: boolean } {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0 || left > MAX_SAFE - right) {
    return { value: MAX_SAFE, saturated: true };
  }
  return { value: left + right, saturated: false };
}
