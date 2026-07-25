import type { CompactPolicyDecision } from "./contracts.js";
import type { CompactConfig } from "./config.js";

export type AutomaticStrategy = CompactPolicyDecision["strategy"];

/** A projection-only candidate. These helpers never mutate Session entries. */
export interface AutomaticPolicyCandidate {
  id: string;
  strategy: AutomaticStrategy;
  sourceEntryIds: readonly string[];
  replayIndex: number;
  /** Turn in which a later assistant proved the result consumed. */
  consumedTurn: number;
  consumed: boolean;
  sourceChars: number;
  projectedChars: number;
  protectedReason?: string;
}

export interface GroupedCandidateOptions {
  maxCandidates: number;
  minAggregateGainChars: number;
  journaledSourceEntryIds?: ReadonlySet<string>;
}

export interface AutomaticTransactionPlan {
  kind: "transaction";
  transactionCount: 1;
  candidates: readonly AutomaticPolicyCandidate[];
  decisions: readonly CompactPolicyDecision[];
  sourceEntryIds: readonly string[];
  aggregateGainChars: number;
}

export interface AutomaticWaitPlan {
  kind: "wait";
  transactionCount: 0;
  candidates: readonly AutomaticPolicyCandidate[];
  sourceEntryIds: readonly string[];
  aggregateGainChars: number;
  reason: "no-eligible-candidates" | "insignificant-aggregate-gain";
}

export type GroupedAutomaticPlan = AutomaticTransactionPlan | AutomaticWaitPlan;

/** Selects at most one deterministic consumed-first batch. */
export function selectGroupedCandidates(
  candidates: readonly AutomaticPolicyCandidate[],
  options: GroupedCandidateOptions,
): GroupedAutomaticPlan {
  const bound = boundedInteger(options.maxCandidates, 1, 16);
  const minimum = boundedInteger(options.minAggregateGainChars, 0, 50_000);
  const journaled = options.journaledSourceEntryIds ?? new Set<string>();
  const selected = candidates
    .filter((candidate) => candidate.consumed
      && candidate.sourceEntryIds.length > 0
      && candidate.protectedReason === undefined
      && candidate.sourceEntryIds.every((id) => !journaled.has(id))
      && Number.isFinite(candidate.sourceChars)
      && Number.isFinite(candidate.projectedChars)
      && candidate.sourceChars > candidate.projectedChars)
    .slice()
    .sort(compareCandidates)
    .slice(0, bound);
  const sourceEntryIds = unique(selected.flatMap((candidate) => [...candidate.sourceEntryIds]));
  const aggregateGainChars = selected.reduce(
    (total, candidate) => total + Math.max(0, Math.floor(candidate.sourceChars - candidate.projectedChars)),
    0,
  );
  if (selected.length === 0) {
    return { kind: "wait", transactionCount: 0, candidates: [], sourceEntryIds: [], aggregateGainChars: 0, reason: "no-eligible-candidates" };
  }
  if (aggregateGainChars < minimum) {
    return { kind: "wait", transactionCount: 0, candidates: selected, sourceEntryIds, aggregateGainChars, reason: "insignificant-aggregate-gain" };
  }
  return {
    kind: "transaction",
    transactionCount: 1,
    candidates: selected,
    decisions: selected.map((candidate) => ({ strategy: candidate.strategy, sourceEntryIds: [...candidate.sourceEntryIds] })),
    sourceEntryIds,
    aggregateGainChars,
  };
}

export interface JournaledToolResult {
  id: string;
  sourceEntryIds: readonly string[];
  replayIndex: number;
  consumedTurn: number;
  consumed: boolean;
  toolName: string;
  contentDigest: string;
  isError: boolean;
  assistantTurnsAfter: number;
  sourceChars: number;
  projectedChars: number;
  protectedReason?: string;
}

export interface JournaledStrategyOptions {
  dedupeEnabled: boolean;
  purgeErrorsEnabled: boolean;
  errorGraceTurns: number;
  /** Number of newest equal results that remain raw. */
  keepLatest: number;
  journaledSourceEntryIds?: ReadonlySet<string>;
}

export interface JournaledStrategyPlan {
  candidates: readonly AutomaticPolicyCandidate[];
  excluded: Readonly<Record<"protected" | "journaled" | "kept-latest" | "error-grace" | "disabled", number>>;
}

/** Plans journal-ready dedupe/purge candidates; protection and prior coverage win. */
export function planJournaledStrategies(
  results: readonly JournaledToolResult[],
  options: JournaledStrategyOptions,
): JournaledStrategyPlan {
  const grace = boundedInteger(options.errorGraceTurns, 1, 50);
  const keepLatest = boundedInteger(options.keepLatest, 1, 16);
  const journaled = options.journaledSourceEntryIds ?? new Set<string>();
  const excluded = { protected: 0, journaled: 0, "kept-latest": 0, "error-grace": 0, disabled: 0 };
  const eligible: JournaledToolResult[] = [];
  for (const result of results.slice().sort(compareResults)) {
    if (result.protectedReason !== undefined || !result.consumed) {
      excluded.protected++;
      continue;
    }
    if (result.sourceEntryIds.length === 0 || result.sourceEntryIds.some((id) => journaled.has(id))) {
      excluded.journaled++;
      continue;
    }
    eligible.push(result);
  }

  const selected = new Map<string, AutomaticPolicyCandidate>();
  for (const result of eligible) {
    if (!result.isError) continue;
    if (!options.purgeErrorsEnabled) {
      excluded.disabled++;
      continue;
    }
    if (result.assistantTurnsAfter < grace) {
      excluded["error-grace"]++;
      continue;
    }
    selected.set(result.id, asCandidate(result, "purge-error"));
  }

  const groups = new Map<string, JournaledToolResult[]>();
  for (const result of eligible) {
    if (selected.has(result.id)) continue;
    const key = `${result.toolName.toLocaleLowerCase()}\0${result.contentDigest}`;
    const group = groups.get(key) ?? [];
    group.push(result);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort(compareResults);
    if (!options.dedupeEnabled) {
      if (group.length > keepLatest) excluded.disabled += group.length - keepLatest;
      continue;
    }
    const cutoff = Math.max(0, group.length - keepLatest);
    for (let index = 0; index < group.length; index++) {
      const result = group[index]!;
      if (index >= cutoff) {
        if (group.length > 1) excluded["kept-latest"]++;
        continue;
      }
      selected.set(result.id, asCandidate(result, "dedupe"));
    }
  }
  return { candidates: [...selected.values()].sort(compareCandidates), excluded };
}

export type NudgeConfig = CompactConfig["nudges"];
export type NudgePhase = "idle" | "watch" | "context-limit" | "turn" | "iteration" | "emergency";
export type NudgeGuidanceKind = Exclude<NudgePhase, "idle" | "watch">;

export const DEFAULT_NUDGE_CONFIG: Readonly<NudgeConfig> = Object.freeze({
  minContextPercent: 45,
  maxContextPercent: 55,
  emergencyPercent: 98,
  frequencyTurns: 5,
  iterationThreshold: 15,
  minGrowthRatio: 0.45,
  minGrowthChars: 5_000,
});

export interface AdaptiveNudgeState {
  phase: NudgePhase;
  lastGuidanceTurn: number;
  lastGuidanceIteration: number;
  lastGuidanceContextChars: number;
  transitionSerial: number;
}

export const INITIAL_NUDGE_STATE: Readonly<AdaptiveNudgeState> = Object.freeze({
  phase: "idle",
  lastGuidanceTurn: 0,
  lastGuidanceIteration: 0,
  lastGuidanceContextChars: 0,
  transitionSerial: 0,
});

export interface AdaptiveNudgeInput {
  enabled: boolean;
  contextPercent: number;
  contextChars: number;
  turn: number;
  iteration: number;
}

export interface AdaptiveNudgePlan {
  state: AdaptiveNudgeState;
  guidanceKind?: NudgeGuidanceKind;
  guidance?: string;
  cacheEligible: boolean;
  cacheInputTransition?: {
    marker: "aili-nudge-state-change";
    from: NudgePhase;
    to: NudgePhase;
    serial: number;
  };
}

/** Resolve standalone overrides using the normative defaults and bounds. */
export function resolveNudgeConfig(overrides: Partial<NudgeConfig> = {}): NudgeConfig {
  const next = { ...DEFAULT_NUDGE_CONFIG };
  for (const key of ["minContextPercent", "maxContextPercent", "emergencyPercent", "frequencyTurns", "iterationThreshold", "minGrowthChars"] as const) {
    const value = overrides[key];
    if (value !== undefined) next[key] = value;
  }
  if (overrides.minGrowthRatio !== undefined) next.minGrowthRatio = overrides.minGrowthRatio;
  validateNudgeConfig(next);
  return next;
}

/**
 * Pure adaptive state machine. Emergency bypasses growth/frequency. Other
 * guidance requires both absolute and relative growth; context, iteration and
 * turn triggers have deterministic priority.
 */
export function planAdaptiveNudge(
  previous: Readonly<AdaptiveNudgeState>,
  input: Readonly<AdaptiveNudgeInput>,
  config: Readonly<NudgeConfig> = DEFAULT_NUDGE_CONFIG,
): AdaptiveNudgePlan {
  validateNudgeConfig(config);
  validateNudgeInput(input);
  let guidanceKind: NudgeGuidanceKind | undefined;
  const growthChars = Math.max(0, input.contextChars - previous.lastGuidanceContextChars);
  const growthRatio = previous.lastGuidanceContextChars === 0
    ? (input.contextChars > 0 ? 1 : 0)
    : growthChars / previous.lastGuidanceContextChars;
  const growthReady = growthChars >= config.minGrowthChars && growthRatio >= config.minGrowthRatio;
  const turnReady = input.turn - previous.lastGuidanceTurn >= config.frequencyTurns;
  const iterationReady = input.iteration - previous.lastGuidanceIteration >= config.iterationThreshold;

  if (input.enabled) {
    if (input.contextPercent >= config.emergencyPercent) guidanceKind = "emergency";
    else if (input.contextPercent >= config.maxContextPercent && growthReady && previous.phase !== "context-limit") guidanceKind = "context-limit";
    else if (input.contextPercent >= config.minContextPercent && growthReady && iterationReady) guidanceKind = "iteration";
    else if (input.contextPercent >= config.minContextPercent && growthReady && turnReady) guidanceKind = "turn";
  }
  const phase: NudgePhase = !input.enabled || input.contextPercent < config.minContextPercent
    ? "idle"
    : guidanceKind ?? "watch";
  const transitioned = phase !== previous.phase;
  const state: AdaptiveNudgeState = {
    phase,
    lastGuidanceTurn: guidanceKind ? input.turn : previous.lastGuidanceTurn,
    lastGuidanceIteration: guidanceKind ? input.iteration : previous.lastGuidanceIteration,
    lastGuidanceContextChars: guidanceKind ? input.contextChars : previous.lastGuidanceContextChars,
    transitionSerial: previous.transitionSerial + (transitioned ? 1 : 0),
  };
  return {
    state,
    ...(guidanceKind ? { guidanceKind, guidance: nudgeGuidance(guidanceKind) } : {}),
    cacheEligible: !transitioned,
    ...(transitioned ? {
      cacheInputTransition: {
        marker: "aili-nudge-state-change",
        from: previous.phase,
        to: phase,
        serial: state.transitionSerial,
      },
    } : {}),
  };
}

function nudgeGuidance(kind: NudgeGuidanceKind): string {
  const urgency = kind === "emergency" ? "Context is at the emergency threshold. " : "";
  return `${urgency}Inspect aili_compact_status (and aili_search_context when needed) to discover the current catalog and valid message/block references before attempting bounded AILI compression.`;
}

function validateNudgeConfig(config: Readonly<NudgeConfig>): void {
  assertInteger(config.minContextPercent, 1, 99, "minContextPercent");
  assertInteger(config.maxContextPercent, 1, 99, "maxContextPercent");
  assertInteger(config.emergencyPercent, 50, 100, "emergencyPercent");
  assertInteger(config.frequencyTurns, 1, 50, "frequencyTurns");
  assertInteger(config.iterationThreshold, 1, 100, "iterationThreshold");
  assertInteger(config.minGrowthChars, 0, 100_000, "minGrowthChars");
  if (!Number.isFinite(config.minGrowthRatio) || config.minGrowthRatio < 0 || config.minGrowthRatio > 1) throw new RangeError("minGrowthRatio is out of range.");
  if (config.minContextPercent > config.maxContextPercent || config.maxContextPercent > config.emergencyPercent) throw new RangeError("Nudge context thresholds must be increasing.");
}

function validateNudgeInput(input: Readonly<AdaptiveNudgeInput>): void {
  if (!Number.isFinite(input.contextPercent) || input.contextPercent < 0 || input.contextPercent > 100) throw new RangeError("contextPercent is out of range.");
  for (const [name, value] of [["contextChars", input.contextChars], ["turn", input.turn], ["iteration", input.iteration]] as const) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function asCandidate(result: JournaledToolResult, strategy: AutomaticStrategy): AutomaticPolicyCandidate {
  return {
    id: result.id,
    strategy,
    sourceEntryIds: [...result.sourceEntryIds],
    replayIndex: result.replayIndex,
    consumedTurn: result.consumedTurn,
    consumed: true,
    sourceChars: result.sourceChars,
    projectedChars: result.projectedChars,
  };
}

function compareCandidates(left: AutomaticPolicyCandidate, right: AutomaticPolicyCandidate): number {
  return left.consumedTurn - right.consumedTurn || left.replayIndex - right.replayIndex || left.id.localeCompare(right.id);
}

function compareResults(left: JournaledToolResult, right: JournaledToolResult): number {
  return left.replayIndex - right.replayIndex || left.id.localeCompare(right.id);
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`Expected an integer from ${minimum} to ${maximum}.`);
  return value;
}

function assertInteger(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} is out of range.`);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
