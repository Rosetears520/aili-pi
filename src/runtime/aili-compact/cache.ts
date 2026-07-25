import { digest } from "./contracts.js";

export const CACHE_WINDOW_SIZE = 20;
export const CACHE_MINIMUM_SAMPLES = 5;
export const CACHE_HIT_RATE_TARGET = 85;

export interface CacheUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface CacheSample {
  input: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CacheTelemetry {
  eligible: number;
  ineligibleCold: number;
  ineligibleStateChange: number;
  unavailable: number;
  cacheRead: number;
  cacheWrite: number;
  input: number;
  /** Last twenty eligible responses, in completion order. */
  window: readonly CacheSample[];
  /** Present only after the five-sample gate has been met. */
  hitRate?: number;
}

/** Current Pi branch usage totals, reconstructed once and then updated in O(1). */
export interface SessionCacheStats {
  assistantResponses: number;
  telemetryUnavailable: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  hitRate?: number;
}

export type CacheRequestClassification = "cold" | "state-change" | "warm-candidate";

export interface ActiveToolCacheSurface {
  name: string;
  description: string;
  parameterSchema: unknown;
  /** Immutable prompt snippet and/or guideline metadata, never its rendered body. */
  immutablePrompt: unknown;
}

export interface CacheIdentityInput {
  providerId: string;
  modelId: string;
  sessionId: string;
  branchLeafId: string;
  branchSourceDigest: string;
  epochId: string;
  projectionHash: string;
  guidanceFingerprint: string;
  activeTools: readonly ActiveToolCacheSurface[];
}

/** SHA-256 identity over the complete canonical provider-input surface. */
export function cacheIdentity(input: CacheIdentityInput): string {
  const tools = [...input.activeTools]
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameterSchema: tool.parameterSchema,
      immutablePrompt: tool.immutablePrompt,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return digest({
    providerId: input.providerId,
    modelId: input.modelId,
    sessionId: input.sessionId,
    branchLeafId: input.branchLeafId,
    branchSourceDigest: input.branchSourceDigest,
    epochId: input.epochId,
    projectionHash: input.projectionHash,
    guidanceFingerprint: input.guidanceFingerprint,
    tools,
  });
}

export function classifyCacheRequest(previousCompletedIdentity: string | undefined, identity: string): CacheRequestClassification {
  if (previousCompletedIdentity === undefined) return "cold";
  return previousCompletedIdentity === identity ? "warm-candidate" : "state-change";
}

/**
 * Records one completed response. Cold and state-change responses are excluded
 * before telemetry is inspected. Only a warm candidate with both numeric cache
 * fields and non-zero prompt tokens enters the rolling window.
 */
export function recordCacheTelemetry(
  prior: CacheTelemetry,
  usage: CacheUsage | undefined,
  eligible: boolean,
  reason: "cold" | "state-change" | "missing-telemetry" | undefined,
): CacheTelemetry {
  if (!eligible) {
    if (reason === "cold") return { ...prior, ineligibleCold: prior.ineligibleCold + 1 };
    if (reason === "state-change") return { ...prior, ineligibleStateChange: prior.ineligibleStateChange + 1 };
    return { ...prior, unavailable: prior.unavailable + 1 };
  }
  if (!usage || !isNumericToken(usage.cacheRead) || !isNumericToken(usage.cacheWrite)) {
    return { ...prior, unavailable: prior.unavailable + 1 };
  }
  const input = isNumericToken(usage.input) ? usage.input : 0;
  const sample = { input, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite };
  if (sample.input + sample.cacheRead + sample.cacheWrite === 0) {
    return { ...prior, unavailable: prior.unavailable + 1 };
  }
  const window = [...prior.window, sample].slice(-CACHE_WINDOW_SIZE);
  const totals = window.reduce(
    (sum, item) => ({
      input: sum.input + item.input,
      cacheRead: sum.cacheRead + item.cacheRead,
      cacheWrite: sum.cacheWrite + item.cacheWrite,
    }),
    { input: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const promptTokens = totals.input + totals.cacheRead + totals.cacheWrite;
  return {
    ...prior,
    eligible: prior.eligible + 1,
    window,
    ...totals,
    ...(window.length >= CACHE_MINIMUM_SAMPLES ? { hitRate: (totals.cacheRead / promptTokens) * 100 } : { hitRate: undefined }),
  };
}

export function emptyCacheTelemetry(): CacheTelemetry {
  return {
    eligible: 0,
    ineligibleCold: 0,
    ineligibleStateChange: 0,
    unavailable: 0,
    cacheRead: 0,
    cacheWrite: 0,
    input: 0,
    window: [],
  };
}

export function emptySessionCacheStats(): SessionCacheStats {
  return {
    assistantResponses: 0,
    telemetryUnavailable: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
}

/** Adds one finalized assistant usage record without rescanning the Session branch. */
export function recordSessionCacheUsage(prior: SessionCacheStats, usage: CacheUsage | undefined): SessionCacheStats {
  const assistantResponses = prior.assistantResponses + 1;
  if (!usage || !isNumericToken(usage.input) || !isNumericToken(usage.output)
    || !isNumericToken(usage.cacheRead) || !isNumericToken(usage.cacheWrite)) {
    return { ...prior, assistantResponses, telemetryUnavailable: prior.telemetryUnavailable + 1 };
  }
  const input = prior.input + usage.input;
  const output = prior.output + usage.output;
  const cacheRead = prior.cacheRead + usage.cacheRead;
  const cacheWrite = prior.cacheWrite + usage.cacheWrite;
  const promptTokens = input + cacheRead + cacheWrite;
  return {
    assistantResponses,
    telemetryUnavailable: prior.telemetryUnavailable,
    input,
    output,
    cacheRead,
    cacheWrite,
    ...(promptTokens > 0 ? { hitRate: (cacheRead / promptTokens) * 100 } : { hitRate: undefined }),
  };
}

export function replaySessionCacheUsages(usages: readonly (CacheUsage | undefined)[]): SessionCacheStats {
  return usages.reduce(recordSessionCacheUsage, emptySessionCacheStats());
}

export function cacheLabel(telemetry: CacheTelemetry): string {
  if (telemetry.window.length > 0 && telemetry.window.length < CACHE_MINIMUM_SAMPLES) {
    return `cache: insufficient sample (${telemetry.window.length}/${CACHE_MINIMUM_SAMPLES})`;
  }
  if (telemetry.hitRate === undefined) return "cache: telemetry unavailable";
  const status = telemetry.hitRate >= CACHE_HIT_RATE_TARGET ? "OK" : "WARN";
  return `cache: ${telemetry.hitRate.toFixed(1)}% ${status} (${telemetry.window.length} eligible in window)`;
}

function isNumericToken(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
