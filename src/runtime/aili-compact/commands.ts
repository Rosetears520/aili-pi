import type { CompactReferenceCatalog } from "./references.js";

export const COMPACT_COMMAND_USAGE = "Usage: /aili-compact [context [offset] [limit]|stats|sweep [limit]|manual [on|off|status]|compress [focus...]|decompress <b-ref...>|recompress <b-ref...>|cache [panel on|off]|prompt [reload]|on|off|restore-all|doctor]";

const BLOCK_REF = /^b\d{6}$/;
const REASON_CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NO_EFFECTS = { append: false, request: false } as const;
const APPEND_ONLY = { append: true, request: false } as const;

export interface CommandCandidateSummary { ref: string; compressible: boolean; role?: string; reasonCodes?: readonly string[] }
export interface CommandRecapSummary { blockRef: string; topic?: string; summary: string }
export interface CommandBlockEligibility {
  blockRef: string;
  active: boolean;
  queryOnly?: boolean;
  deactivationReason?: "decompress" | "recompress" | "nested" | "gc" | "epoch" | "restore-all";
}
export interface CommandStatsSummary {
  session: { transactions: number; blocks: number; sourceChars: number; projectedSavingChars: number };
  branch: { transactions: number; blocks: number; activeBlocks: number; cooledResults: number };
  cache: { eligibleSamples: number; cacheReads: number; cacheWrites: number };
}
export interface CompactCommandInputs {
  catalog: CompactReferenceCatalog;
  candidates?: readonly CommandCandidateSummary[];
  activeRecaps?: readonly CommandRecapSummary[];
  blockEligibility?: readonly CommandBlockEligibility[];
  policyReasons?: readonly { code: string; count: number }[];
  stats?: CommandStatsSummary;
  enabled?: boolean;
  manualMode?: boolean;
  autoCooling?: boolean;
  pendingManualTrigger?: boolean;
}
export interface CommandEffects { append: boolean; request: boolean }
export interface CommandContextOutput {
  catalogId: string;
  epochId: string;
  offset: number;
  limit: number;
  refs: readonly { ref: string; role?: string; atomRefs: readonly string[] }[];
  candidates: readonly { ref: string; compressible: boolean; role?: string; reasonCodes: readonly string[] }[];
  activeRecaps: readonly { blockRef: string; topic?: string; summaryPreview: string }[];
  policyReasons: readonly { code: string; count: number }[];
  nextOffset?: number;
}
export interface CommandStatsOutput extends CommandStatsSummary { scope: "current-session/current-branch" }
export type CompactCommandPlan =
  | { kind: "usage"; message: string; effects: CommandEffects }
  | { kind: "context"; output: CommandContextOutput; effects: CommandEffects }
  | { kind: "stats"; output: CommandStatsOutput; effects: CommandEffects }
  | { kind: "sweep"; limit: number; candidateRefs: readonly string[]; effects: CommandEffects }
  | { kind: "manual-status"; manualMode: boolean; autoCooling: boolean; effects: CommandEffects }
  | { kind: "manual-control"; value: "on" | "off"; effects: CommandEffects }
  | { kind: "compress"; focus?: string; trigger: "one-shot"; effects: CommandEffects }
  | { kind: "decompress" | "recompress"; catalogId: string; blockRefs: readonly string[]; effects: CommandEffects }
  | { kind: "cache-status"; effects: CommandEffects }
  | { kind: "cache-panel"; value: "on" | "off"; effects: CommandEffects }
  | { kind: "prompt-status"; effects: CommandEffects }
  | { kind: "prompt-reload"; effects: CommandEffects }
  | { kind: "control"; value: "on" | "off" | "restore-all"; effects: CommandEffects }
  | { kind: "doctor"; effects: CommandEffects };

/** Pure parser/planner: callers alone perform the described effects. */
export function planCompactCommand(args: string, inputs: CompactCommandInputs): CompactCommandPlan {
  const words = splitWords(args);
  const command = words.shift() ?? "context";
  switch (command) {
    case "context": {
      if (words.length > 2) return usage();
      const offset = words[0] === undefined ? 0 : integer(words[0], 0);
      const limit = words[1] === undefined ? 32 : integer(words[1], 1, 64);
      return offset === undefined || limit === undefined ? usage() : { kind: "context", output: presentContext(inputs, offset, limit), effects: NO_EFFECTS };
    }
    case "stats": return words.length === 0 ? { kind: "stats", output: presentStats(inputs.stats), effects: NO_EFFECTS } : usage();
    case "sweep": {
      if (words.length > 1) return usage();
      const limit = words[0] === undefined ? 8 : integer(words[0], 1, 16);
      if (limit === undefined) return usage();
      const candidateRefs = (inputs.candidates ?? []).filter((candidate) => candidate.compressible).map((candidate) => candidate.ref).slice(0, limit);
      return { kind: "sweep", limit, candidateRefs, effects: candidateRefs.length > 0 ? APPEND_ONLY : NO_EFFECTS };
    }
    case "manual":
      if (words.length === 0 || (words.length === 1 && words[0] === "status")) return { kind: "manual-status", manualMode: inputs.manualMode === true, autoCooling: inputs.autoCooling !== false, effects: NO_EFFECTS };
      if (words.length === 1 && (words[0] === "on" || words[0] === "off")) return { kind: "manual-control", value: words[0], effects: APPEND_ONLY };
      return usage();
    case "compress": {
      const focus = words.join(" ");
      if (focus.length > 1_000 || inputs.enabled === false || inputs.pendingManualTrigger === true) return usage();
      return { kind: "compress", ...(focus ? { focus } : {}), trigger: "one-shot", effects: { append: true, request: true } };
    }
    case "decompress":
    case "recompress": return blockControl(command, words, inputs);
    case "cache":
      if (words.length === 0) return { kind: "cache-status", effects: NO_EFFECTS };
      if (words.length === 2 && words[0] === "panel" && (words[1] === "on" || words[1] === "off")) return { kind: "cache-panel", value: words[1], effects: APPEND_ONLY };
      return usage();
    case "prompt":
      if (words.length === 0) return { kind: "prompt-status", effects: NO_EFFECTS };
      return words.length === 1 && words[0] === "reload" ? { kind: "prompt-reload", effects: NO_EFFECTS } : usage();
    case "on":
    case "off":
    case "restore-all": return words.length === 0 ? { kind: "control", value: command, effects: APPEND_ONLY } : usage();
    case "doctor": return words.length === 0 ? { kind: "doctor", effects: NO_EFFECTS } : usage();
    default: return usage();
  }
}

function blockControl(kind: "decompress" | "recompress", refs: readonly string[], inputs: CompactCommandInputs): CompactCommandPlan {
  if (refs.length < 1 || refs.length > 16 || new Set(refs).size !== refs.length || refs.some((ref) => !BLOCK_REF.test(ref))) return usage();
  const provided: readonly CommandBlockEligibility[] = inputs.blockEligibility ?? inputs.catalog.blocks.map((block) => ({ blockRef: block.ref, active: block.active, queryOnly: block.queryOnly }));
  const eligibility = new Map(provided.map((block) => [block.blockRef, block]));
  const valid = refs.every((ref) => {
    const block = eligibility.get(ref);
    if (!block || block.queryOnly) return false;
    return kind === "decompress" ? block.active : !block.active && block.deactivationReason === "decompress";
  });
  return valid ? { kind, catalogId: inputs.catalog.catalogId, blockRefs: [...refs], effects: APPEND_ONLY } : usage();
}

function presentContext(inputs: CompactCommandInputs, offset: number, limit: number): CommandContextOutput {
  const page = inputs.catalog.messages.slice(offset, offset + limit);
  const refByEntry = new Map(inputs.catalog.messages.map((message) => [message.entryId, message.ref]));
  const visible = new Set(page.map((message) => message.ref));
  const active = new Set(inputs.catalog.blocks.filter((block) => block.active && !block.queryOnly).map((block) => block.ref));
  const nextOffset = offset + page.length < inputs.catalog.messages.length ? offset + page.length : undefined;
  return {
    catalogId: inputs.catalog.catalogId,
    epochId: label(inputs.catalog.epochId, 256) ?? "unknown",
    offset,
    limit,
    refs: page.map((message) => ({ ref: message.ref, ...(label(message.role, 32) ? { role: label(message.role, 32) } : {}), atomRefs: [...new Set(message.atomEntryIds.flatMap((entryId) => refByEntry.get(entryId) ?? []))].slice(0, 16) })),
    candidates: (inputs.candidates ?? []).filter((candidate) => visible.has(candidate.ref)).slice(0, limit).map((candidate) => ({ ref: candidate.ref, compressible: candidate.compressible, ...(label(candidate.role, 32) ? { role: label(candidate.role, 32) } : {}), reasonCodes: reasons(candidate.reasonCodes ?? []) })),
    activeRecaps: (inputs.activeRecaps ?? []).filter((recap) => BLOCK_REF.test(recap.blockRef) && active.has(recap.blockRef)).slice(0, 32).map((recap) => ({ blockRef: recap.blockRef, ...(label(recap.topic, 200) ? { topic: label(recap.topic, 200) } : {}), summaryPreview: `${recap.summary.slice(0, 200)}${recap.summary.length > 200 ? "…" : ""}` })),
    policyReasons: (inputs.policyReasons ?? []).filter((reason) => REASON_CODE.test(reason.code) && Number.isSafeInteger(reason.count) && reason.count >= 0).slice(0, 16),
    ...(nextOffset === undefined ? {} : { nextOffset }),
  };
}

function presentStats(stats?: CommandStatsSummary): CommandStatsOutput {
  const value = stats ?? { session: { transactions: 0, blocks: 0, sourceChars: 0, projectedSavingChars: 0 }, branch: { transactions: 0, blocks: 0, activeBlocks: 0, cooledResults: 0 }, cache: { eligibleSamples: 0, cacheReads: 0, cacheWrites: 0 } };
  return { scope: "current-session/current-branch", session: clean(value.session), branch: clean(value.branch), cache: clean(value.cache) };
}
function clean<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value as Record<string, number>).map(([name, count]) => [name, Number.isSafeInteger(count) && count >= 0 ? count : 0])) as T;
}
function reasons(values: readonly string[]): string[] { return [...new Set(values.filter((value) => REASON_CODE.test(value)))].slice(0, 16) }
function label(value: string | undefined, maximum: number): string | undefined { return value ? value.slice(0, maximum) : undefined }
function integer(word: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  if (!/^\d+$/.test(word)) return undefined;
  const value = Number(word);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}
function splitWords(args: string): string[] { const value = args.trim(); return value ? value.split(/\s+/) : [] }
function usage(): CompactCommandPlan { return { kind: "usage", message: COMPACT_COMMAND_USAGE, effects: NO_EFFECTS } }
