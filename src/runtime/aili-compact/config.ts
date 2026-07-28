import { closeSync, existsSync, openSync, readSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { digest, isRecord } from "./contracts.js";

const PROMPT_DIRECTORY = "aili-compact-prompts";
const MAX_PROMPT_FILE_BYTES = 4 * 1024;
const MAX_PROMPT_BYTES = 8 * 1024;
const MAX_CONFIG_ARRAY = 64;

export const HARD_PROTECTED_TOOLS = Object.freeze(["aili_*"] as const);
export const HARD_PROTECTED_FILE_GLOBS = Object.freeze([
  ".env",
  ".env.*",
  "**/*credentials*",
  "**/*secret*",
  "**/*.pem",
  "**/*.key",
] as const);

export const COMPACT_PROMPT_SLOTS = [
  "system.md",
  "compress-range.md",
  "compress-message.md",
  "context-limit-nudge.md",
  "turn-nudge.md",
  "iteration-nudge.md",
] as const;

export type CompactPromptSlot = typeof COMPACT_PROMPT_SLOTS[number];

export interface CompactConfig {
  enabled: boolean;
  manualMode: boolean;
  autoCooling: boolean;
  cachePanel: boolean;
  /** Compatibility projection of experimental.customPrompts. */
  customPrompts: boolean;
  compress: {
    mode: "range" | "message";
    summaryMaxChars: number;
    summaryHardMaxChars: number;
    minSourceChars: number;
    minSavingsChars: number;
  };
  protection: {
    recentUserMessages: number;
    preserveRecentAtoms: number;
    preserveRecentTokens: number;
    preserveRecentTokenCapRatio: number;
    preserveLastUserMessage: true;
    protectUserMessages: boolean;
    protectTags: boolean;
    tools: string[];
    fileGlobs: string[];
  };
  strategies: {
    dedupe: { enabled: boolean };
    purgeErrors: { enabled: boolean; graceTurns: number };
  };
  nudges: {
    minContextPercent: number;
    maxContextPercent: number;
    emergencyPercent: number;
    frequencyTurns: number;
    iterationThreshold: number;
    minGrowthRatio: number;
    minGrowthChars: number;
  };
  subagents: { enabled: boolean };
  gc: {
    promotionSurvivals: number;
    maxBlockAge: number;
    maxOldSummaryChars: number;
    majorThresholdPercent: number;
  };
  checkpoint: {
    mode: "hybrid";
    deterministic: boolean;
    nativeFallback: true;
    autoRescue: boolean;
  };
  planning: { enabled: boolean };
  quality: { enabled: boolean; warningPolicy: "record" | "reject" };
  providerSuffix: { enabled: boolean; maxChars: number; maxTokens: number };
  tokenEconomics: {
    minSavingsRatio: number;
    minSteadySavingsTokens: { T1: number; T2: number; T3: number };
    maxBreakEvenTurns: { NORMAL: number; PRESSURE: number; FORCE_SEMANTIC: number };
  };
  tiers: {
    enabled: boolean;
    restill: {
      enabled: boolean;
      minChildren: number;
      minSourceTokens: number;
      minSavingsTokens: number;
      minSavingsRatio: number;
      maxSummaryTokens: number;
      minTurnsSinceCreate: number;
    };
  };
  index: { enabled: boolean; snapshotLru: number };
}

export interface CompactConfigResult {
  config: CompactConfig;
  diagnostics: readonly string[];
}

export interface CompactPromptSnapshot {
  enabled: boolean;
  slots: Readonly<Partial<Record<CompactPromptSlot, string>>>;
  fingerprint?: string;
  fileCount: number;
  diagnostics: readonly string[];
}

export const DEFAULT_COMPACT_CONFIG: Readonly<CompactConfig> = Object.freeze<CompactConfig>({
  enabled: true,
  manualMode: false,
  autoCooling: true,
  cachePanel: true,
  customPrompts: false,
  compress: {
    mode: "range",
    summaryMaxChars: 6_000,
    summaryHardMaxChars: 10_000,
    minSourceChars: 5_000,
    minSavingsChars: 1_000,
  },
  protection: {
    recentUserMessages: 2,
    preserveRecentAtoms: 8,
    preserveRecentTokens: 12_000,
    preserveRecentTokenCapRatio: 0.10,
    preserveLastUserMessage: true,
    protectUserMessages: false,
    protectTags: false,
    tools: [...HARD_PROTECTED_TOOLS],
    fileGlobs: [...HARD_PROTECTED_FILE_GLOBS],
  },
  strategies: {
    dedupe: { enabled: true },
    purgeErrors: { enabled: true, graceTurns: 5 },
  },
  nudges: {
    minContextPercent: 45,
    maxContextPercent: 55,
    emergencyPercent: 98,
    frequencyTurns: 5,
    iterationThreshold: 15,
    minGrowthRatio: 0.45,
    minGrowthChars: 5_000,
  },
  subagents: { enabled: false },
  gc: {
    promotionSurvivals: 5,
    maxBlockAge: 15,
    maxOldSummaryChars: 3_000,
    majorThresholdPercent: 100,
  },
  checkpoint: {
    mode: "hybrid",
    deterministic: true,
    nativeFallback: true,
    autoRescue: true,
  },
  planning: { enabled: true },
  quality: { enabled: true, warningPolicy: "record" },
  providerSuffix: { enabled: true, maxChars: 2_048, maxTokens: 512 },
  tokenEconomics: {
    minSavingsRatio: 0.20,
    minSteadySavingsTokens: { T1: 256, T2: 512, T3: 768 },
    maxBreakEvenTurns: { NORMAL: 8, PRESSURE: 4, FORCE_SEMANTIC: 1 },
  },
  tiers: {
    enabled: true,
    restill: {
      enabled: true,
      minChildren: 2,
      minSourceTokens: 8_000,
      minSavingsTokens: 1_024,
      minSavingsRatio: 0.25,
      maxSummaryTokens: 3_000,
      minTurnsSinceCreate: 8,
    },
  },
  index: { enabled: true, snapshotLru: 4 },
});

export const EMPTY_COMPACT_PROMPT_SNAPSHOT: Readonly<CompactPromptSnapshot> = Object.freeze({
  enabled: false,
  slots: Object.freeze({}),
  fileCount: 0,
  diagnostics: [],
});

type ConfigPatch = Partial<{
  enabled: boolean;
  manualMode: boolean;
  autoCooling: boolean;
  cachePanel: boolean;
  customPrompts: boolean;
  compress: Partial<CompactConfig["compress"]>;
  protection: Partial<CompactConfig["protection"]>;
  strategies: {
    dedupe?: Partial<CompactConfig["strategies"]["dedupe"]>;
    purgeErrors?: Partial<CompactConfig["strategies"]["purgeErrors"]>;
  };
  nudges: Partial<CompactConfig["nudges"]>;
  subagents: Partial<CompactConfig["subagents"]>;
  gc: Partial<CompactConfig["gc"]>;
  checkpoint: Partial<CompactConfig["checkpoint"]>;
  planning: Partial<CompactConfig["planning"]>;
  quality: Partial<CompactConfig["quality"]>;
  providerSuffix: Partial<CompactConfig["providerSuffix"]>;
  tokenEconomics: {
    minSavingsRatio?: number;
    minSteadySavingsTokens?: Partial<CompactConfig["tokenEconomics"]["minSteadySavingsTokens"]>;
    maxBreakEvenTurns?: Partial<CompactConfig["tokenEconomics"]["maxBreakEvenTurns"]>;
  };
  tiers: {
    enabled?: boolean;
    restill?: Partial<CompactConfig["tiers"]["restill"]>;
  };
  index: Partial<CompactConfig["index"]>;
}>;

export function resolveCompactConfig(globalValue: unknown, projectValue: unknown): CompactConfig {
  return resolveCompactConfigResult(globalValue, projectValue).config;
}

export function resolveCompactConfigResult(globalValue: unknown, projectValue: unknown): CompactConfigResult {
  const diagnostics: string[] = [];
  let config = cloneConfig(DEFAULT_COMPACT_CONFIG);
  config = applyValidatedPatch(config, parseConfigPatch(globalValue, "global", diagnostics), "global", diagnostics);
  config = applyValidatedPatch(config, parseConfigPatch(projectValue, "project", diagnostics), "project", diagnostics);
  return { config, diagnostics: uniqueDiagnostics(diagnostics) };
}

export function loadCompactConfig(cwd: string, home = homedir()): CompactConfig {
  return loadCompactConfigResult(cwd, home).config;
}

export function loadCompactConfigResult(cwd: string, home = homedir()): CompactConfigResult {
  const global = readJsonc(join(home, ".pi", "agent", "aili-compact.jsonc"), "global");
  const project = readJsonc(join(cwd, ".pi", "aili-compact.jsonc"), "project");
  const resolved = resolveCompactConfigResult(global.value, project.value);
  return { config: resolved.config, diagnostics: uniqueDiagnostics([...global.diagnostics, ...project.diagnostics, ...resolved.diagnostics]) };
}

/** Loads a bounded six-slot prompt snapshot without creating or changing files. */
export function loadCompactPromptSnapshot(cwd: string, config: CompactConfig, home = homedir()): CompactPromptSnapshot {
  if (!config.customPrompts) return EMPTY_COMPACT_PROMPT_SNAPSHOT;

  const diagnostics: string[] = [];
  const global = readPromptDirectory(join(home, ".pi", "agent", PROMPT_DIRECTORY), diagnostics);
  const project = readPromptDirectory(join(cwd, ".pi", PROMPT_DIRECTORY), diagnostics);
  const effective = new Map<CompactPromptSlot, PromptFile>(global.map((file) => [file.slot, file]));
  for (const file of project) effective.set(file.slot, file);

  let remaining = MAX_PROMPT_BYTES;
  const slots: Partial<Record<CompactPromptSlot, string>> = {};
  const fingerprintInput: Array<{ slot: CompactPromptSlot; text: string }> = [];
  for (const slot of COMPACT_PROMPT_SLOTS) {
    const file = effective.get(slot);
    if (!file) continue;
    if (file.bytes > remaining) {
      diagnostics.push("prompt-total-limit");
      continue;
    }
    slots[slot] = file.text;
    fingerprintInput.push({ slot, text: file.text });
    remaining -= file.bytes;
  }
  if (fingerprintInput.length === 0) return { enabled: true, slots: {}, fileCount: 0, diagnostics: uniqueDiagnostics(diagnostics) };
  return {
    enabled: true,
    slots,
    fingerprint: digest(fingerprintInput),
    fileCount: fingerprintInput.length,
    diagnostics: uniqueDiagnostics(diagnostics),
  };
}

export function appendCompactPromptGuidance(systemPrompt: string, snapshot: CompactPromptSnapshot): string | undefined {
  if (!snapshot.enabled || snapshot.fileCount === 0) return undefined;
  const sections: string[] = [
    "## AILI Compact user-configured guidance",
    "These bounded preferences apply only to AILI Compact decisions and never override immutable schemas, protocol validity, source fidelity, privacy, or safety rules.",
  ];
  for (const slot of COMPACT_PROMPT_SLOTS) {
    const text = snapshot.slots[slot];
    if (!text) continue;
    sections.push(`### ${slotLabel(slot)}\n${text}`);
  }
  sections.push("AILI Compact immutable schema, protocol, source-fidelity, privacy, and safety constraints remain authoritative.");
  return `${systemPrompt}\n\n${sections.join("\n\n")}`;
}

function applyValidatedPatch(base: CompactConfig, patch: ConfigPatch, source: string, diagnostics: string[]): CompactConfig {
  const next = cloneConfig(base);
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.manualMode !== undefined) next.manualMode = patch.manualMode;
  if (patch.autoCooling !== undefined) next.autoCooling = patch.autoCooling;
  if (patch.cachePanel !== undefined) next.cachePanel = patch.cachePanel;
  if (patch.customPrompts !== undefined) next.customPrompts = patch.customPrompts;
  if (patch.compress) next.compress = { ...next.compress, ...patch.compress };
  if (patch.protection) next.protection = {
    ...next.protection,
    ...patch.protection,
    ...(patch.protection.tools ? { tools: [...new Set([...patch.protection.tools, ...HARD_PROTECTED_TOOLS])] } : {}),
    ...(patch.protection.fileGlobs ? { fileGlobs: [...new Set([...patch.protection.fileGlobs, ...HARD_PROTECTED_FILE_GLOBS])] } : {}),
  };
  if (patch.strategies?.dedupe) next.strategies.dedupe = { ...next.strategies.dedupe, ...patch.strategies.dedupe };
  if (patch.strategies?.purgeErrors) next.strategies.purgeErrors = { ...next.strategies.purgeErrors, ...patch.strategies.purgeErrors };
  if (patch.nudges) next.nudges = { ...next.nudges, ...patch.nudges };
  if (patch.subagents) next.subagents = { ...next.subagents, ...patch.subagents };
  if (patch.gc) next.gc = { ...next.gc, ...patch.gc };
  if (patch.checkpoint) next.checkpoint = { ...next.checkpoint, ...patch.checkpoint };
  if (patch.planning) next.planning = { ...next.planning, ...patch.planning };
  if (patch.quality) next.quality = { ...next.quality, ...patch.quality };
  if (patch.providerSuffix) next.providerSuffix = { ...next.providerSuffix, ...patch.providerSuffix };
  if (patch.tokenEconomics) next.tokenEconomics = {
    ...next.tokenEconomics,
    ...patch.tokenEconomics,
    minSteadySavingsTokens: { ...next.tokenEconomics.minSteadySavingsTokens, ...patch.tokenEconomics.minSteadySavingsTokens },
    maxBreakEvenTurns: { ...next.tokenEconomics.maxBreakEvenTurns, ...patch.tokenEconomics.maxBreakEvenTurns },
  };
  if (patch.tiers) next.tiers = { ...next.tiers, ...patch.tiers, restill: { ...next.tiers.restill, ...patch.tiers.restill } };
  if (patch.index) next.index = { ...next.index, ...patch.index };

  if (next.compress.summaryMaxChars > next.compress.summaryHardMaxChars) {
    diagnostics.push(`config-invalid-thresholds:${source}:compress`);
    next.compress.summaryMaxChars = base.compress.summaryMaxChars;
    next.compress.summaryHardMaxChars = base.compress.summaryHardMaxChars;
  }
  if (!(next.nudges.minContextPercent <= next.nudges.maxContextPercent
    && next.nudges.maxContextPercent <= next.nudges.emergencyPercent)) {
    diagnostics.push(`config-invalid-thresholds:${source}:nudges`);
    next.nudges.minContextPercent = base.nudges.minContextPercent;
    next.nudges.maxContextPercent = base.nudges.maxContextPercent;
    next.nudges.emergencyPercent = base.nudges.emergencyPercent;
  }
  return next;
}

function parseConfigPatch(value: unknown, source: string, diagnostics: string[]): ConfigPatch {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    diagnostics.push(`config-invalid-type:${source}:root`);
    return {};
  }
  reportUnknownKeys(value, ["enabled", "manualMode", "autoCooling", "cachePanel", "compress", "protection", "strategies", "nudges", "subagents", "gc", "checkpoint", "planning", "quality", "providerSuffix", "tokenEconomics", "tiers", "index", "experimental"], source, "", diagnostics);
  const patch: ConfigPatch = {};
  assignBoolean(value, "enabled", source, "enabled", diagnostics, patch);
  assignBoolean(value, "manualMode", source, "manualMode", diagnostics, patch);
  assignBoolean(value, "autoCooling", source, "autoCooling", diagnostics, patch);
  assignBoolean(value, "cachePanel", source, "cachePanel", diagnostics, patch);

  if (value.compress !== undefined) patch.compress = parseCompress(value.compress, source, diagnostics);
  if (value.protection !== undefined) patch.protection = parseProtection(value.protection, source, diagnostics);
  if (value.strategies !== undefined) patch.strategies = parseStrategies(value.strategies, source, diagnostics);
  if (value.nudges !== undefined) patch.nudges = parseNudges(value.nudges, source, diagnostics);
  if (value.subagents !== undefined) patch.subagents = parseBooleanObject(value.subagents, source, "subagents", diagnostics);
  if (value.gc !== undefined) patch.gc = parseGc(value.gc, source, diagnostics);
  if (value.checkpoint !== undefined) patch.checkpoint = parseCheckpoint(value.checkpoint, source, diagnostics);
  if (value.planning !== undefined) patch.planning = parseBooleanObject(value.planning, source, "planning", diagnostics);
  if (value.quality !== undefined) patch.quality = parseQuality(value.quality, source, diagnostics);
  if (value.providerSuffix !== undefined) patch.providerSuffix = parseProviderSuffix(value.providerSuffix, source, diagnostics);
  if (value.tokenEconomics !== undefined) patch.tokenEconomics = parseTokenEconomics(value.tokenEconomics, source, diagnostics);
  if (value.tiers !== undefined) patch.tiers = parseTiers(value.tiers, source, diagnostics);
  if (value.index !== undefined) patch.index = parseIndex(value.index, source, diagnostics);
  if (value.experimental !== undefined) {
    if (!isRecord(value.experimental)) diagnostics.push(`config-invalid-type:${source}:experimental`);
    else {
      reportUnknownKeys(value.experimental, ["customPrompts"], source, "experimental", diagnostics);
      if (value.experimental.customPrompts !== undefined) {
        if (typeof value.experimental.customPrompts === "boolean") patch.customPrompts = value.experimental.customPrompts;
        else diagnostics.push(`config-invalid-type:${source}:experimental.customPrompts`);
      }
    }
  }
  return patch;
}

function parseCompress(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["compress"]> {
  if (!isRecord(value)) return invalidObject(source, "compress", diagnostics);
  reportUnknownKeys(value, ["mode", "summaryMaxChars", "summaryHardMaxChars", "minSourceChars", "minSavingsChars"], source, "compress", diagnostics);
  const patch: Partial<CompactConfig["compress"]> = {};
  if (value.mode !== undefined) {
    if (value.mode === "range" || value.mode === "message") patch.mode = value.mode;
    else diagnostics.push(`config-invalid-type:${source}:compress.mode`);
  }
  assignInteger(value, "summaryMaxChars", 256, 10_000, source, "compress.summaryMaxChars", diagnostics, patch);
  assignInteger(value, "summaryHardMaxChars", 1_000, 12_000, source, "compress.summaryHardMaxChars", diagnostics, patch);
  assignInteger(value, "minSourceChars", 0, 100_000, source, "compress.minSourceChars", diagnostics, patch);
  assignInteger(value, "minSavingsChars", 0, 50_000, source, "compress.minSavingsChars", diagnostics, patch);
  return patch;
}

function parseProtection(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["protection"]> {
  if (!isRecord(value)) return invalidObject(source, "protection", diagnostics);
  reportUnknownKeys(value, ["recentUserMessages", "preserveRecentAtoms", "preserveRecentTokens", "preserveRecentTokenCapRatio", "preserveLastUserMessage", "protectUserMessages", "protectTags", "tools", "fileGlobs"], source, "protection", diagnostics);
  const patch: Partial<CompactConfig["protection"]> = {};
  assignInteger(value, "recentUserMessages", 2, 20, source, "protection.recentUserMessages", diagnostics, patch);
  if (patch.recentUserMessages !== undefined) diagnostics.push("config-deprecated:recentUserMessages");
  assignInteger(value, "preserveRecentAtoms", 8, 128, source, "protection.preserveRecentAtoms", diagnostics, patch);
  assignInteger(value, "preserveRecentTokens", 12_000, 1_000_000, source, "protection.preserveRecentTokens", diagnostics, patch);
  assignNumber(value, "preserveRecentTokenCapRatio", 0.10, 1, source, "protection.preserveRecentTokenCapRatio", diagnostics, patch);
  if (value.preserveLastUserMessage !== undefined) {
    if (value.preserveLastUserMessage === true) patch.preserveLastUserMessage = true;
    else if (value.preserveLastUserMessage === false) diagnostics.push("config-invalid-unsafe-protection");
    else diagnostics.push(`config-invalid-type:${source}:protection.preserveLastUserMessage`);
  }
  assignBoolean(value, "protectUserMessages", source, "protection.protectUserMessages", diagnostics, patch);
  assignBoolean(value, "protectTags", source, "protection.protectTags", diagnostics, patch);
  assignStringArray(value, "tools", source, "protection.tools", diagnostics, patch);
  assignStringArray(value, "fileGlobs", source, "protection.fileGlobs", diagnostics, patch);
  return patch;
}

function parseStrategies(value: unknown, source: string, diagnostics: string[]): ConfigPatch["strategies"] {
  if (!isRecord(value)) return invalidObject(source, "strategies", diagnostics);
  reportUnknownKeys(value, ["dedupe", "purgeErrors"], source, "strategies", diagnostics);
  const patch: NonNullable<ConfigPatch["strategies"]> = {};
  if (value.dedupe !== undefined) patch.dedupe = parseBooleanObject(value.dedupe, source, "strategies.dedupe", diagnostics);
  if (value.purgeErrors !== undefined) {
    if (!isRecord(value.purgeErrors)) diagnostics.push(`config-invalid-type:${source}:strategies.purgeErrors`);
    else {
      reportUnknownKeys(value.purgeErrors, ["enabled", "graceTurns"], source, "strategies.purgeErrors", diagnostics);
      const purge: Partial<CompactConfig["strategies"]["purgeErrors"]> = {};
      assignBoolean(value.purgeErrors, "enabled", source, "strategies.purgeErrors.enabled", diagnostics, purge);
      assignInteger(value.purgeErrors, "graceTurns", 5, 50, source, "strategies.purgeErrors.graceTurns", diagnostics, purge);
      patch.purgeErrors = purge;
    }
  }
  return patch;
}

function parseNudges(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["nudges"]> {
  if (!isRecord(value)) return invalidObject(source, "nudges", diagnostics);
  reportUnknownKeys(value, ["minContextPercent", "maxContextPercent", "emergencyPercent", "frequencyTurns", "iterationThreshold", "minGrowthRatio", "minGrowthChars"], source, "nudges", diagnostics);
  const patch: Partial<CompactConfig["nudges"]> = {};
  assignInteger(value, "minContextPercent", 1, 99, source, "nudges.minContextPercent", diagnostics, patch);
  assignInteger(value, "maxContextPercent", 1, 99, source, "nudges.maxContextPercent", diagnostics, patch);
  assignInteger(value, "emergencyPercent", 50, 100, source, "nudges.emergencyPercent", diagnostics, patch);
  assignInteger(value, "frequencyTurns", 1, 50, source, "nudges.frequencyTurns", diagnostics, patch);
  assignInteger(value, "iterationThreshold", 1, 100, source, "nudges.iterationThreshold", diagnostics, patch);
  assignNumber(value, "minGrowthRatio", 0, 1, source, "nudges.minGrowthRatio", diagnostics, patch);
  assignInteger(value, "minGrowthChars", 0, 100_000, source, "nudges.minGrowthChars", diagnostics, patch);
  return patch;
}

function parseGc(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["gc"]> {
  if (!isRecord(value)) return invalidObject(source, "gc", diagnostics);
  reportUnknownKeys(value, ["promotionSurvivals", "maxBlockAge", "maxOldSummaryChars", "majorThresholdPercent"], source, "gc", diagnostics);
  const patch: Partial<CompactConfig["gc"]> = {};
  assignInteger(value, "promotionSurvivals", 1, 100, source, "gc.promotionSurvivals", diagnostics, patch);
  assignInteger(value, "maxBlockAge", 1, 1_000, source, "gc.maxBlockAge", diagnostics, patch);
  if (patch.maxBlockAge !== undefined) diagnostics.push("config-deprecated:maxBlockAge");
  assignInteger(value, "maxOldSummaryChars", 256, 10_000, source, "gc.maxOldSummaryChars", diagnostics, patch);
  assignInteger(value, "majorThresholdPercent", 90, 100, source, "gc.majorThresholdPercent", diagnostics, patch);
  return patch;
}

function parseCheckpoint(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["checkpoint"]> {
  if (!isRecord(value)) return invalidObject(source, "checkpoint", diagnostics);
  reportUnknownKeys(value, ["mode", "deterministic", "nativeFallback", "autoRescue"], source, "checkpoint", diagnostics);
  const patch: Partial<CompactConfig["checkpoint"]> = {};
  if (value.mode !== undefined) {
    if (value.mode === "hybrid") patch.mode = "hybrid";
    else diagnostics.push(`config-invalid-type:${source}:checkpoint.mode`);
  }
  assignBoolean(value, "deterministic", source, "checkpoint.deterministic", diagnostics, patch);
  if (value.nativeFallback !== undefined) {
    if (value.nativeFallback === true) patch.nativeFallback = true;
    else if (value.nativeFallback === false) diagnostics.push("config-invalid-unsafe-checkpoint");
    else diagnostics.push(`config-invalid-type:${source}:checkpoint.nativeFallback`);
  }
  assignBoolean(value, "autoRescue", source, "checkpoint.autoRescue", diagnostics, patch);
  return patch;
}

function parseQuality(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["quality"]> {
  if (!isRecord(value)) return invalidObject(source, "quality", diagnostics);
  reportUnknownKeys(value, ["enabled", "warningPolicy"], source, "quality", diagnostics);
  const patch: Partial<CompactConfig["quality"]> = {};
  assignBoolean(value, "enabled", source, "quality.enabled", diagnostics, patch);
  if (value.warningPolicy !== undefined) {
    if (value.warningPolicy === "record" || value.warningPolicy === "reject") patch.warningPolicy = value.warningPolicy;
    else diagnostics.push(`config-invalid-type:${source}:quality.warningPolicy`);
  }
  return patch;
}

function parseProviderSuffix(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["providerSuffix"]> {
  if (!isRecord(value)) return invalidObject(source, "providerSuffix", diagnostics);
  reportUnknownKeys(value, ["enabled", "maxChars", "maxTokens"], source, "providerSuffix", diagnostics);
  const patch: Partial<CompactConfig["providerSuffix"]> = {};
  assignBoolean(value, "enabled", source, "providerSuffix.enabled", diagnostics, patch);
  assignInteger(value, "maxChars", 256, 2_048, source, "providerSuffix.maxChars", diagnostics, patch);
  assignInteger(value, "maxTokens", 64, 512, source, "providerSuffix.maxTokens", diagnostics, patch);
  return patch;
}

function parseTokenEconomics(value: unknown, source: string, diagnostics: string[]): ConfigPatch["tokenEconomics"] {
  if (!isRecord(value)) return invalidObject(source, "tokenEconomics", diagnostics);
  reportUnknownKeys(value, ["minSavingsRatio", "minSteadySavingsTokens", "maxBreakEvenTurns"], source, "tokenEconomics", diagnostics);
  const patch: NonNullable<ConfigPatch["tokenEconomics"]> = {};
  assignNumber(value, "minSavingsRatio", 0.20, 1, source, "tokenEconomics.minSavingsRatio", diagnostics, patch);
  if (value.minSteadySavingsTokens !== undefined) {
    if (!isRecord(value.minSteadySavingsTokens)) diagnostics.push(`config-invalid-type:${source}:tokenEconomics.minSteadySavingsTokens`);
    else {
      reportUnknownKeys(value.minSteadySavingsTokens, ["T1", "T2", "T3"], source, "tokenEconomics.minSteadySavingsTokens", diagnostics);
      const tiers: Partial<CompactConfig["tokenEconomics"]["minSteadySavingsTokens"]> = {};
      assignInteger(value.minSteadySavingsTokens, "T1", 256, 1_000_000, source, "tokenEconomics.minSteadySavingsTokens.T1", diagnostics, tiers);
      assignInteger(value.minSteadySavingsTokens, "T2", 512, 1_000_000, source, "tokenEconomics.minSteadySavingsTokens.T2", diagnostics, tiers);
      assignInteger(value.minSteadySavingsTokens, "T3", 768, 1_000_000, source, "tokenEconomics.minSteadySavingsTokens.T3", diagnostics, tiers);
      patch.minSteadySavingsTokens = tiers;
    }
  }
  if (value.maxBreakEvenTurns !== undefined) {
    if (!isRecord(value.maxBreakEvenTurns)) diagnostics.push(`config-invalid-type:${source}:tokenEconomics.maxBreakEvenTurns`);
    else {
      reportUnknownKeys(value.maxBreakEvenTurns, ["NORMAL", "PRESSURE", "FORCE_SEMANTIC"], source, "tokenEconomics.maxBreakEvenTurns", diagnostics);
      const horizons: Partial<CompactConfig["tokenEconomics"]["maxBreakEvenTurns"]> = {};
      assignInteger(value.maxBreakEvenTurns, "NORMAL", 0, 8, source, "tokenEconomics.maxBreakEvenTurns.NORMAL", diagnostics, horizons);
      assignInteger(value.maxBreakEvenTurns, "PRESSURE", 0, 4, source, "tokenEconomics.maxBreakEvenTurns.PRESSURE", diagnostics, horizons);
      assignInteger(value.maxBreakEvenTurns, "FORCE_SEMANTIC", 0, 1, source, "tokenEconomics.maxBreakEvenTurns.FORCE_SEMANTIC", diagnostics, horizons);
      patch.maxBreakEvenTurns = horizons;
    }
  }
  return patch;
}

function parseTiers(value: unknown, source: string, diagnostics: string[]): ConfigPatch["tiers"] {
  if (!isRecord(value)) return invalidObject(source, "tiers", diagnostics);
  reportUnknownKeys(value, ["enabled", "restill"], source, "tiers", diagnostics);
  const patch: NonNullable<ConfigPatch["tiers"]> = {};
  assignBoolean(value, "enabled", source, "tiers.enabled", diagnostics, patch);
  if (value.restill !== undefined) {
    if (!isRecord(value.restill)) diagnostics.push(`config-invalid-type:${source}:tiers.restill`);
    else {
      reportUnknownKeys(value.restill, ["enabled", "minChildren", "minSourceTokens", "minSavingsTokens", "minSavingsRatio", "maxSummaryTokens", "minTurnsSinceCreate"], source, "tiers.restill", diagnostics);
      const restill: Partial<CompactConfig["tiers"]["restill"]> = {};
      assignBoolean(value.restill, "enabled", source, "tiers.restill.enabled", diagnostics, restill);
      assignInteger(value.restill, "minChildren", 2, 16, source, "tiers.restill.minChildren", diagnostics, restill);
      assignInteger(value.restill, "minSourceTokens", 8_000, 1_000_000, source, "tiers.restill.minSourceTokens", diagnostics, restill);
      assignInteger(value.restill, "minSavingsTokens", 1_024, 1_000_000, source, "tiers.restill.minSavingsTokens", diagnostics, restill);
      assignNumber(value.restill, "minSavingsRatio", 0.25, 1, source, "tiers.restill.minSavingsRatio", diagnostics, restill);
      assignInteger(value.restill, "maxSummaryTokens", 256, 3_000, source, "tiers.restill.maxSummaryTokens", diagnostics, restill);
      assignInteger(value.restill, "minTurnsSinceCreate", 8, 10_000, source, "tiers.restill.minTurnsSinceCreate", diagnostics, restill);
      patch.restill = restill;
    }
  }
  return patch;
}

function parseIndex(value: unknown, source: string, diagnostics: string[]): Partial<CompactConfig["index"]> {
  if (!isRecord(value)) return invalidObject(source, "index", diagnostics);
  reportUnknownKeys(value, ["enabled", "snapshotLru"], source, "index", diagnostics);
  const patch: Partial<CompactConfig["index"]> = {};
  assignBoolean(value, "enabled", source, "index.enabled", diagnostics, patch);
  assignInteger(value, "snapshotLru", 1, 4, source, "index.snapshotLru", diagnostics, patch);
  return patch;
}

function parseBooleanObject(value: unknown, source: string, path: string, diagnostics: string[]): { enabled?: boolean } {
  if (!isRecord(value)) return invalidObject(source, path, diagnostics);
  reportUnknownKeys(value, ["enabled"], source, path, diagnostics);
  const patch: { enabled?: boolean } = {};
  assignBoolean(value, "enabled", source, `${path}.enabled`, diagnostics, patch);
  return patch;
}

function reportUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], source: string, path: string, diagnostics: string[]): void {
  const prefix = path ? `${path}.` : "";
  for (const key of Object.keys(value)) if (!allowed.includes(key)) diagnostics.push(`config-unknown-key:${source}:${prefix}${key}`);
}

function assignBoolean<T extends object>(value: Record<string, unknown>, key: string, source: string, path: string, diagnostics: string[], target: T): void {
  if (value[key] === undefined) return;
  if (typeof value[key] === "boolean") Object.assign(target, { [key]: value[key] });
  else diagnostics.push(`config-invalid-type:${source}:${path}`);
}

function assignInteger<T extends object>(value: Record<string, unknown>, key: string, min: number, max: number, source: string, path: string, diagnostics: string[], target: T): void {
  if (value[key] === undefined) return;
  if (typeof value[key] !== "number" || !Number.isInteger(value[key])) diagnostics.push(`config-invalid-type:${source}:${path}`);
  else if (value[key] < min || value[key] > max) diagnostics.push(`config-out-of-range:${source}:${path}`);
  else Object.assign(target, { [key]: value[key] });
}

function assignNumber<T extends object>(value: Record<string, unknown>, key: string, min: number, max: number, source: string, path: string, diagnostics: string[], target: T): void {
  if (value[key] === undefined) return;
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) diagnostics.push(`config-invalid-type:${source}:${path}`);
  else if (value[key] < min || value[key] > max) diagnostics.push(`config-out-of-range:${source}:${path}`);
  else Object.assign(target, { [key]: value[key] });
}

function assignStringArray<T extends object>(value: Record<string, unknown>, key: string, source: string, path: string, diagnostics: string[], target: T): void {
  if (value[key] === undefined) return;
  if (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === "string" && item.length > 0)) diagnostics.push(`config-invalid-type:${source}:${path}`);
  else if (value[key].length > MAX_CONFIG_ARRAY) diagnostics.push(`config-out-of-range:${source}:${path}`);
  else Object.assign(target, { [key]: [...new Set(value[key])] });
}

function invalidObject<T extends object>(source: string, path: string, diagnostics: string[]): T {
  diagnostics.push(`config-invalid-type:${source}:${path}`);
  return {} as T;
}

function cloneConfig(config: Readonly<CompactConfig>): CompactConfig {
  return {
    ...config,
    compress: { ...config.compress },
    protection: { ...config.protection, tools: [...config.protection.tools], fileGlobs: [...config.protection.fileGlobs] },
    strategies: { dedupe: { ...config.strategies.dedupe }, purgeErrors: { ...config.strategies.purgeErrors } },
    nudges: { ...config.nudges },
    subagents: { ...config.subagents },
    gc: { ...config.gc },
    checkpoint: { ...config.checkpoint },
    planning: { ...config.planning },
    quality: { ...config.quality },
    providerSuffix: { ...config.providerSuffix },
    tokenEconomics: {
      ...config.tokenEconomics,
      minSteadySavingsTokens: { ...config.tokenEconomics.minSteadySavingsTokens },
      maxBreakEvenTurns: { ...config.tokenEconomics.maxBreakEvenTurns },
    },
    tiers: { ...config.tiers, restill: { ...config.tiers.restill } },
    index: { ...config.index },
  };
}

type PromptFile = { slot: CompactPromptSlot; text: string; bytes: number };

function readPromptDirectory(directory: string, diagnostics: string[]): PromptFile[] {
  if (!existsSync(directory)) return [];
  try {
    const files: PromptFile[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || entry.name.startsWith(".") || !entry.name.toLowerCase().endsWith(".md")) continue;
      if (!isPromptSlot(entry.name)) {
        diagnostics.push("prompt-unknown-slot");
        continue;
      }
      const file = readPromptFile(join(directory, entry.name), entry.name, diagnostics);
      if (file) files.push(file);
    }
    return files;
  } catch {
    diagnostics.push("prompt-directory-unreadable");
    return [];
  }
}

function isPromptSlot(name: string): name is CompactPromptSlot {
  return (COMPACT_PROMPT_SLOTS as readonly string[]).includes(name);
}

function readPromptFile(path: string, slot: CompactPromptSlot, diagnostics: string[]): PromptFile | undefined {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    const buffer = Buffer.alloc(MAX_PROMPT_FILE_BYTES + 1);
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytes > MAX_PROMPT_FILE_BYTES) {
      diagnostics.push("prompt-file-limit");
      return undefined;
    }
    const text = buffer.subarray(0, bytes).toString("utf8");
    if (!text.trim() || text.includes("\0")) {
      diagnostics.push("prompt-file-invalid");
      return undefined;
    }
    return { slot, text, bytes };
  } catch {
    diagnostics.push("prompt-file-unreadable");
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJsonc(path: string, source: string): { value?: unknown; diagnostics: string[] } {
  if (!existsSync(path)) return { diagnostics: [] };
  try {
    const content = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1")
      .replace(/,\s*([}\]])/g, "$1");
    return { value: JSON.parse(content) as unknown, diagnostics: [] };
  } catch {
    return { diagnostics: [`config-invalid-jsonc:${source}`] };
  }
}

function slotLabel(slot: CompactPromptSlot): string {
  switch (slot) {
    case "system.md": return "System guidance";
    case "compress-range.md": return "Range compression guidance";
    case "compress-message.md": return "Message compression guidance";
    case "context-limit-nudge.md": return "Context-limit guidance";
    case "turn-nudge.md": return "Turn guidance";
    case "iteration-nudge.md": return "Iteration guidance";
  }
}

function uniqueDiagnostics(diagnostics: readonly string[]): string[] {
  return [...new Set(diagnostics)];
}
