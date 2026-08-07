import { createHash } from "node:crypto";
import { NATIVE_INTEGRATIONS } from "../src/runtime/native-integrations.ts";

export const COMPACT_LIVE_PROVIDER_FAMILIES = ["openai", "anthropic", "google-gemini"] as const;
export const COMPACT_LIVE_ROW_IDS = Array.from({ length: 10 }, (_, index) => `LIVE-V2-${index + 1}`) as readonly CompactLiveRowId[];

export type CompactLiveProviderFamily = (typeof COMPACT_LIVE_PROVIDER_FAMILIES)[number];
export type CompactLiveRowId = `LIVE-V2-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
export type CompactLiveStatus = "PASS" | "NON_PASS";
export type CompactLiveUsage = { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number };

type JsonRecord = Record<string, unknown>;

export interface CompactLiveExpectedBinding {
  providerFamily: CompactLiveProviderFamily;
  provider: string;
  model: string;
  api: string;
  packageVersion: string;
  piVersion: "0.82.1";
  implementationSha256: string;
  liveHarnessSha256: string;
  piExecutableSha256: string;
  productionEntrySha256: string;
}

interface CompactLivePassBase {
  id: CompactLiveRowId;
  status: "PASS";
  observedAt: string;
  source: "official-pi-agent-session";
  syntheticEvidenceAccepted: false;
  binding: {
    providerFamily: CompactLiveProviderFamily;
    provider: string;
    model: string;
    api: string;
    candidate: { packageVersion: string; piVersion: "0.82.1"; implementationSha256: string };
    harness: { path: "tests/integration/aili-compact-live-release-gated.test.ts"; sha256: string };
  };
  capture: { sanitized: true; encoding: "utf8-event-codes-v1"; bytes: string; byteLength: number; sha256: string };
  eventDigest: string;
  eventCount: number;
}

export interface CompactLiveV21Pass extends CompactLivePassBase {
  id: "LIVE-V2-1";
  observationClass: "provider-suffix-protocol";
  turns: {
    user: { providerCallSucceeded: true; suffixRole: "custom"; suffixOrder: "after-complete-projection"; protocolError: false };
    toolResult: { providerCallSucceeded: true; completeRealToolResult: true; suffixRole: "custom"; suffixOrder: "after-complete-projection"; protocolError: false };
  };
  persistence: { jsonlMatches: 0; providerAuthoredSearchMatches: 0 };
  pressure: { stage: "PRESSURE" | "FORCE_SEMANTIC" | "CHECKPOINT_REQUIRED" | "OVERFLOW_RECOVERY"; nonNormal: true };
}

export interface CompactLiveV22Pass extends CompactLivePassBase {
  id: "LIVE-V2-2";
  observationClass: "provider-usage-calibration";
  calibration: {
    eligibleSamples: number;
    excludedSamples: number;
    exclusionCodes: readonly ("ambiguous-cache" | "ambiguous-request" | "binary-or-image" | "compaction" | "identity-mismatch" | "invalid-baseline" | "invalid-reported-tokens" | "outlier" | "overflow-retry-cancelled")[];
    lowerBoundPreserved: true;
    upperBoundPreserved: true;
    invalidDataNarrowedBounds: false;
  };
  providerUsage: CompactLiveUsage;
}

export interface CompactLiveV23Pass extends CompactLivePassBase {
  id: "LIVE-V2-3";
  observationClass: "provider-authored-tier-lifecycle-human-review";
  lifecycle: {
    providerAuthoredToolTransactions: 4;
    persistedTiers: readonly ["T1", "T2", "T3", "T3-restill"];
    hiddenEvaluatorCalls: 0;
  };
  humanReview: {
    verdict: "PASS";
    verdictId: string;
    verdictSource: "external-human-verdict-artifact";
    candidateSha256: string;
    verdictSha256: string;
    hardFactsRetained: true;
    limitationsAccepted: true;
  };
}

export interface CompactLiveV24Pass extends CompactLivePassBase {
  id: "LIVE-V2-4";
  observationClass: "provider-tool-rejection";
  rejection: {
    providerAuthoredAttempts: 2;
    codes: readonly ["scope-drift", "quality-hard-fact-loss"];
    appendedTransactions: 0;
    redactedGuidance: true;
    actualPressureObserved: true;
    pressureCycleAttempts: 1;
  };
}

export interface CompactLiveV25Pass extends CompactLivePassBase {
  id: "LIVE-V2-5";
  observationClass: "deterministic-rescue-checkpoint";
  recovery: {
    providerAuthoredEligibleLifecycle: true;
    rescueInvocation: "agent-session-command";
    beforeCompactReason: "manual" | "threshold";
    checkpointOrigin: "custom";
    persistedCompactionEntry: true;
    newEpoch: true;
    oldEpochQueryOnly: true;
    oldEpochSearchable: true;
    continuedProviderWork: true;
  };
}

export interface CompactLiveV26Pass extends CompactLivePassBase {
  id: "LIVE-V2-6";
  observationClass: "native-threshold-fallback";
  recovery: {
    actualHostThreshold: true;
    deterministicEligibility: "ineligible";
    beforeCompactReason: "threshold";
    checkpointOrigin: "native";
    persistedCompactionEntry: true;
    cancelLoopCount: 0;
    continuedProviderWork: true;
  };
}

export interface CompactLiveV27Pass extends CompactLivePassBase {
  id: "LIVE-V2-7";
  observationClass: "provider-context-overflow-retry";
  overflow: {
    providerRecognizedContextError: true;
    errorCode: "context-length-exceeded";
    beforeCompactReason: "overflow";
    willRetry: true;
    hookOutcome: "custom" | "undefined-native-fallback";
    checkpointOrigin: "custom" | "native";
    persistedCompactionEntry: true;
    originalRequestRetried: true;
    laterProviderWork: true;
    thresholdCompactedFirst: false;
  };
}

export interface CompactLiveV28Pass extends CompactLivePassBase {
  id: "LIVE-V2-8";
  observationClass: "provider-reported-cache";
  cache: {
    providerReported: true;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    stablePrefix: "warm-candidate";
    suffixChange: "suffix-changed";
    projectionChange: "projection-changed";
    internalIdentityUsedAsHitEvidence: false;
  };
}

export interface CompactLiveV29Pass extends CompactLivePassBase {
  id: "LIVE-V2-9";
  observationClass: "copied-long-session-production-apis";
  migration: {
    copiedSanitizedSession: true;
    syntheticSetup: false;
    v1v2v3Reload: true;
    branchSwitch: true;
    decompression: true;
    checkpoint: true;
    indexFallback: true;
    bytePrefixPreserved: true;
    continuedProviderWork: true;
    source: {
      providerProduced: true;
      sameCapture: true;
      sessionIdDigest: string;
      copiedPrefixSha256: string;
      transactionIds: readonly string[];
      transactionDigests: readonly string[];
    };
    productionApis: {
      reload: "agent-session-reload";
      branchSwitch: "agent-session-navigate-tree";
      decompression: "production-aili-decompress";
      checkpoint: "agent-session-compact";
      indexFallback: "production-branch-index-fallback";
      continuedWork: "agent-session-provider-prompt";
    };
  };
}

export interface CompactLiveV210Pass extends CompactLivePassBase {
  id: "LIVE-V2-10";
  observationClass: "native-integration-ordering-tui";
  integration: {
    inventorySource: "production-native-loader";
    knownNativeIntegrations: readonly string[];
    unknownThirdParty: "Unverified";
    beforeCompactionHandlerObserved: true;
    afterCompactionHandlerObserved: true;
    realCheckpoint: true;
    cancellationOverrides: 0;
    headlessRestartStatus: "bounded-truthful";
    interactiveResize: "PASS";
    ptyEvidence: true;
    resizeProbe: {
      mechanism: "python3-stdlib-forkpty-tiocswinsz";
      directEventInjection: false;
      executable: { path: "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"; sha256: string };
      productionEntry: { path: "extensions/index.ts"; sha256: string };
      harness: { path: "tests/integration/aili-compact-live-release-gated.test.ts"; sha256: string };
      candidate: { packageVersion: string; piVersion: "0.82.1"; implementationSha256: string };
      initial: { columns: 96; rows: 28 };
      resized: { columns: 132; rows: 42 };
      ioctlApplied: true;
      queriedWindowMatched: true;
      productionCommandObserved: true;
      postResizeOutputObserved: true;
      transcriptSha256: string;
      transcriptBytes: number;
    };
  };
}

export type CompactLivePassObservation = CompactLiveV21Pass | CompactLiveV22Pass | CompactLiveV23Pass
  | CompactLiveV24Pass | CompactLiveV25Pass | CompactLiveV26Pass | CompactLiveV27Pass | CompactLiveV28Pass
  | CompactLiveV29Pass | CompactLiveV210Pass;

export interface CompactLiveNonPassObservation {
  id: CompactLiveRowId;
  status: "NON_PASS";
  observationClass: "unobserved";
  reason: CompactLiveNonPassReason;
  requiredInputCharacters?: number;
  maxInputCharacters?: number;
  attempt?: { stage: "overflow"; status: string; source: string };
}

export type CompactLiveNonPassReason =
  | "actual-host-threshold-not-induced"
  | "capture-input-budget-exceeded"
  | "human-verdict-required"
  | "interactive-pty-resize-unobserved"
  | "provider-cache-zero-or-unavailable"
  | "provider-context-error-not-induced"
  | "overflow-message-end-missing"
  | "overflow-preflight-or-stage-failed"
  | "overflow-later-work-failed"
  | "pressure-stage-failed"
  | "suffix-stage-failed"
  | "tool-stage-failed"
  | "lifecycle-stage-failed"
  | "scenario-stage-failed"
  | "provider-tool-transaction-unobserved"
  | "required-production-events-missing"
  | "synthetic-setup-cannot-pass"
  | "transport-unavailable";

export type CompactLiveRowObservation = CompactLivePassObservation | CompactLiveNonPassObservation;

export type CompactScenarioEvent =
  | { code: "provider-call"; turn: "user" | "tool-result" | "continued" | "retry"; succeeded: boolean; usage?: CompactLiveUsage }
  | { code: "provider-suffix"; turn: "user" | "tool-result"; role: string; order: string; completeRealToolResult?: boolean; protocolError: boolean }
  | { code: "suffix-persistence"; jsonlMatches: number; providerAuthoredSearchMatches: number }
  | { code: "calibration"; eligible: number; excluded: number; exclusionCodes: string[]; lowerBoundPreserved: boolean; upperBoundPreserved: boolean; invalidNarrowing: boolean }
  | { code: "tier-transaction"; tier: "T1" | "T2" | "T3" | "T3-restill"; providerAuthored: boolean; persisted: boolean }
  | { code: "human-review"; verdict: "PASS" | "NON_PASS"; verdictId?: string; verdictSource?: "external-human-verdict-artifact"; candidateSha256?: string; verdictSha256?: string; hardFactsRetained: boolean; limitationsAccepted: boolean }
  | { code: "tool-rejection"; reason: "scope-drift" | "quality-hard-fact-loss"; providerAuthored: boolean; transactionAppended: boolean; redacted: boolean; pressure: boolean; pressureCycleAttempt: number }
  | { code: "before-compact"; reason: "manual" | "threshold" | "overflow"; willRetry: boolean; outcome: "custom" | "undefined-native-fallback" }
  | { code: "checkpoint"; reason: "manual" | "threshold" | "overflow"; origin: "custom" | "native" | "Unverified"; persisted: boolean; newEpoch: boolean }
  | { code: "lifecycle-rescue"; providerAuthoredEligibleLifecycle: boolean; invocation: "agent-session-command"; oldEpochQueryOnly: boolean; oldEpochSearchable: boolean }
  | { code: "native-threshold"; actualHostThreshold: boolean; deterministicIneligible: boolean; cancelLoopCount: number }
  | { code: "provider-overflow"; recognized: boolean; errorCode: string; thresholdCompactedFirst: boolean }
  | { code: "pressure-state"; stage: "PRESSURE" | "FORCE_SEMANTIC" | "CHECKPOINT_REQUIRED" | "OVERFLOW_RECOVERY" }
  | { code: "cache"; providerReported: boolean; cacheReadTokens: number; cacheWriteTokens: number; stablePrefix: string; suffixChange: string; projectionChange: string }
  | { code: "migration"; copiedSanitizedSession: boolean; syntheticSetup: boolean; v1v2v3Reload: boolean; branchSwitch: boolean; decompression: boolean; checkpoint: boolean; indexFallback: boolean; bytePrefixPreserved: boolean; continuedProviderWork: boolean; source?: { providerProduced: boolean; sameCapture: boolean; sessionIdDigest: string; copiedPrefixSha256: string; transactionIds: string[]; transactionDigests: string[] }; productionApis?: { reload: string; branchSwitch: string; decompression: string; checkpoint: string; indexFallback: string; continuedWork: string } }
  | { code: "native-integration"; inventorySource: string; knownNativeIntegrations: string[]; unknownThirdParty: string; beforeObserved: boolean; afterObserved: boolean; realCheckpoint: boolean; cancellationOverrides: number; headlessRestartStatus: string; interactiveResize: string; ptyEvidence: boolean; resizeProbe?: { mechanism: string; directEventInjection: boolean; executable: { path: string; sha256: string }; productionEntry: { path: string; sha256: string }; harness: { path: string; sha256: string }; candidate: { packageVersion: string; piVersion: string; implementationSha256: string }; initial: { columns: number; rows: number }; resized: { columns: number; rows: number }; ioctlApplied: boolean; queriedWindowMatched: boolean; productionCommandObserved: boolean; postResizeOutputObserved: boolean; transcriptSha256: string; transcriptBytes: number } }
  | { code: "p0-invariants"; noCancellation: boolean; appendOnly: boolean; oneStormCoordinator: boolean };

const HASH = /^[a-f0-9]{64}$/;
const HARNESS_PATH = "tests/integration/aili-compact-live-release-gated.test.ts" as const;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1_000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function boundedString(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\r\n\u0000-\u001f]/.test(value);
}

function exactUsage(value: unknown, requireCache = false): value is CompactLiveUsage {
  const usage = record(value);
  if (!usage || !exactKeys(usage, ["input", "output", "cacheRead", "cacheWrite", "totalTokens"])) return false;
  if (!Object.values(usage).every((item) => Number.isSafeInteger(item) && Number(item) >= 0 && Number(item) <= 10_000_000)) return false;
  return Number(usage.totalTokens) > 0
    && Number(usage.totalTokens) >= Number(usage.input) + Number(usage.output)
    && (!requireCache || (Number(usage.cacheRead) > 0 && Number(usage.cacheWrite) > 0));
}

function baseValid(item: JsonRecord, expected: CompactLiveExpectedBinding, id: CompactLiveRowId, now: number): boolean {
  const binding = record(item.binding);
  const candidate = record(binding?.candidate);
  const harness = record(binding?.harness);
  const capture = record(item.capture);
  const captureBytes = typeof capture?.bytes === "string" ? capture.bytes : "";
  const time = typeof item.observedAt === "string" ? Date.parse(item.observedAt) : Number.NaN;
  return item.id === id && item.status === "PASS" && item.source === "official-pi-agent-session"
    && item.syntheticEvidenceAccepted === false
    && Number.isFinite(time) && time <= now + FUTURE_TOLERANCE_MS && now - time <= MAX_AGE_MS
    && binding?.providerFamily === expected.providerFamily && binding.provider === expected.provider
    && binding.model === expected.model && binding.api === expected.api
    && exactKeys(binding, ["providerFamily", "provider", "model", "api", "candidate", "harness"])
    && candidate?.packageVersion === expected.packageVersion && candidate.piVersion === expected.piVersion
    && candidate.implementationSha256 === expected.implementationSha256
    && exactKeys(candidate, ["packageVersion", "piVersion", "implementationSha256"])
    && harness?.path === HARNESS_PATH && harness.sha256 === expected.liveHarnessSha256
    && exactKeys(harness, ["path", "sha256"])
    && capture?.sanitized === true && capture.encoding === "utf8-event-codes-v1" && captureBytes.length > 0 && captureBytes.length <= 100_000 && /^[a-z0-9-]+(?:\n[a-z0-9-]+)*$/.test(captureBytes)
    && Number.isSafeInteger(capture.byteLength) && Number(capture.byteLength) === Buffer.byteLength(captureBytes) && Number(capture.byteLength) <= 100_000
    && HASH.test(String(capture.sha256 ?? "")) && capture.sha256 === createHash("sha256").update(captureBytes).digest("hex")
    && exactKeys(capture, ["sanitized", "encoding", "bytes", "byteLength", "sha256"])
    && HASH.test(String(item.eventDigest ?? "")) && Number.isSafeInteger(item.eventCount)
    && Number(item.eventCount) > 0 && Number(item.eventCount) <= 100_000 && captureBytes.split("\n").length === Number(item.eventCount);
}

export function validateCompactLiveRowPass(
  value: unknown,
  expected: CompactLiveExpectedBinding,
  id: CompactLiveRowId,
  now = Date.now(),
): value is CompactLivePassObservation {
  const item = record(value);
  if (!item || !baseValid(item, expected, id, now)) return false;
  switch (id) {
    case "LIVE-V2-1": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "turns", "persistence", "pressure"]) || item.observationClass !== "provider-suffix-protocol") return false;
      const turns = record(item.turns); const user = record(turns?.user); const tool = record(turns?.toolResult); const persistence = record(item.persistence); const pressure = record(item.pressure);
      return !!turns && exactKeys(turns, ["user", "toolResult"])
        && exactBooleanTurn(user, false) && exactBooleanTurn(tool, true)
        && !!persistence && exactKeys(persistence, ["jsonlMatches", "providerAuthoredSearchMatches"])
        && persistence.jsonlMatches === 0 && persistence.providerAuthoredSearchMatches === 0
        && !!pressure && exactKeys(pressure, ["stage", "nonNormal"]) && pressure.nonNormal === true
        && ["PRESSURE", "FORCE_SEMANTIC", "CHECKPOINT_REQUIRED", "OVERFLOW_RECOVERY"].includes(String(pressure.stage));
    }
    case "LIVE-V2-2": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "calibration", "providerUsage"]) || item.observationClass !== "provider-usage-calibration") return false;
      const calibration = record(item.calibration); const codes = Array.isArray(calibration?.exclusionCodes) ? calibration.exclusionCodes : [];
      return !!calibration && exactKeys(calibration, ["eligibleSamples", "excludedSamples", "exclusionCodes", "lowerBoundPreserved", "upperBoundPreserved", "invalidDataNarrowedBounds"])
        && Number.isSafeInteger(calibration.eligibleSamples) && Number(calibration.eligibleSamples) >= 5
        && Number.isSafeInteger(calibration.excludedSamples) && Number(calibration.excludedSamples) >= 1
        && codes.length >= 1 && codes.every((code) => ["ambiguous-cache", "ambiguous-request", "binary-or-image", "compaction", "identity-mismatch", "invalid-baseline", "invalid-reported-tokens", "outlier", "overflow-retry-cancelled"].includes(String(code)))
        && calibration.lowerBoundPreserved === true && calibration.upperBoundPreserved === true && calibration.invalidDataNarrowedBounds === false
        && exactUsage(item.providerUsage);
    }
    case "LIVE-V2-3": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "lifecycle", "humanReview"]) || item.observationClass !== "provider-authored-tier-lifecycle-human-review") return false;
      const lifecycle = record(item.lifecycle); const review = record(item.humanReview);
      return !!lifecycle && exactKeys(lifecycle, ["providerAuthoredToolTransactions", "persistedTiers", "hiddenEvaluatorCalls"])
        && lifecycle.providerAuthoredToolTransactions === 4 && lifecycle.hiddenEvaluatorCalls === 0
        && JSON.stringify(lifecycle.persistedTiers) === JSON.stringify(["T1", "T2", "T3", "T3-restill"])
        && !!review && exactKeys(review, ["verdict", "verdictId", "verdictSource", "candidateSha256", "verdictSha256", "hardFactsRetained", "limitationsAccepted"])
        && review.verdict === "PASS" && boundedString(review.verdictId, 128)
        && review.verdictSource === "external-human-verdict-artifact"
        && HASH.test(String(review.candidateSha256 ?? "")) && HASH.test(String(review.verdictSha256 ?? ""))
        && review.hardFactsRetained === true && review.limitationsAccepted === true;
    }
    case "LIVE-V2-4": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "rejection"]) || item.observationClass !== "provider-tool-rejection") return false;
      const rejection = record(item.rejection);
      return !!rejection && exactKeys(rejection, ["providerAuthoredAttempts", "codes", "appendedTransactions", "redactedGuidance", "actualPressureObserved", "pressureCycleAttempts"])
        && rejection.providerAuthoredAttempts === 2 && JSON.stringify(rejection.codes) === JSON.stringify(["scope-drift", "quality-hard-fact-loss"])
        && rejection.appendedTransactions === 0 && rejection.redactedGuidance === true && rejection.actualPressureObserved === true && rejection.pressureCycleAttempts === 1;
    }
    case "LIVE-V2-5": return validateRecovery(item, "deterministic-rescue-checkpoint", ["providerAuthoredEligibleLifecycle", "rescueInvocation", "beforeCompactReason", "checkpointOrigin", "persistedCompactionEntry", "newEpoch", "oldEpochQueryOnly", "oldEpochSearchable", "continuedProviderWork"], (r) =>
      r.providerAuthoredEligibleLifecycle === true && r.rescueInvocation === "agent-session-command" && (r.beforeCompactReason === "manual" || r.beforeCompactReason === "threshold")
      && r.checkpointOrigin === "custom" && r.persistedCompactionEntry === true && r.newEpoch === true && r.oldEpochQueryOnly === true && r.oldEpochSearchable === true && r.continuedProviderWork === true);
    case "LIVE-V2-6": return validateRecovery(item, "native-threshold-fallback", ["actualHostThreshold", "deterministicEligibility", "beforeCompactReason", "checkpointOrigin", "persistedCompactionEntry", "cancelLoopCount", "continuedProviderWork"], (r) =>
      r.actualHostThreshold === true && r.deterministicEligibility === "ineligible" && r.beforeCompactReason === "threshold" && r.checkpointOrigin === "native"
      && r.persistedCompactionEntry === true && r.cancelLoopCount === 0 && r.continuedProviderWork === true);
    case "LIVE-V2-7": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "overflow"]) || item.observationClass !== "provider-context-overflow-retry") return false;
      const overflow = record(item.overflow);
      return !!overflow && exactKeys(overflow, ["providerRecognizedContextError", "errorCode", "beforeCompactReason", "willRetry", "hookOutcome", "checkpointOrigin", "persistedCompactionEntry", "originalRequestRetried", "laterProviderWork", "thresholdCompactedFirst"])
        && overflow.providerRecognizedContextError === true && overflow.errorCode === "context-length-exceeded" && overflow.beforeCompactReason === "overflow" && overflow.willRetry === true
        && (overflow.hookOutcome === "custom" || overflow.hookOutcome === "undefined-native-fallback") && (overflow.checkpointOrigin === "custom" || overflow.checkpointOrigin === "native")
        && overflow.persistedCompactionEntry === true && overflow.originalRequestRetried === true && overflow.laterProviderWork === true && overflow.thresholdCompactedFirst === false;
    }
    case "LIVE-V2-8": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "cache"]) || item.observationClass !== "provider-reported-cache") return false;
      const cache = record(item.cache);
      return !!cache && exactKeys(cache, ["providerReported", "cacheReadTokens", "cacheWriteTokens", "stablePrefix", "suffixChange", "projectionChange", "internalIdentityUsedAsHitEvidence"])
        && cache.providerReported === true && Number.isSafeInteger(cache.cacheReadTokens) && Number(cache.cacheReadTokens) > 0
        && Number.isSafeInteger(cache.cacheWriteTokens) && Number(cache.cacheWriteTokens) > 0 && cache.stablePrefix === "warm-candidate"
        && cache.suffixChange === "suffix-changed" && cache.projectionChange === "projection-changed" && cache.internalIdentityUsedAsHitEvidence === false;
    }
    case "LIVE-V2-9": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "migration"]) || item.observationClass !== "copied-long-session-production-apis") return false;
      const migration = record(item.migration);
      const source = record(migration?.source); const apis = record(migration?.productionApis);
      const transactionIds = Array.isArray(source?.transactionIds) ? source.transactionIds : [];
      const transactionDigests = Array.isArray(source?.transactionDigests) ? source.transactionDigests : [];
      return !!migration && exactKeys(migration, ["copiedSanitizedSession", "syntheticSetup", "v1v2v3Reload", "branchSwitch", "decompression", "checkpoint", "indexFallback", "bytePrefixPreserved", "continuedProviderWork", "source", "productionApis"])
        && ["copiedSanitizedSession", "v1v2v3Reload", "branchSwitch", "decompression", "checkpoint", "indexFallback", "bytePrefixPreserved", "continuedProviderWork"].every((key) => migration[key] === true)
        && migration.syntheticSetup === false
        && !!source && exactKeys(source, ["providerProduced", "sameCapture", "sessionIdDigest", "copiedPrefixSha256", "transactionIds", "transactionDigests"])
        && source.providerProduced === true && source.sameCapture === true
        && HASH.test(String(source.sessionIdDigest ?? "")) && HASH.test(String(source.copiedPrefixSha256 ?? ""))
        && transactionIds.length === 4 && transactionIds.every((item) => boundedString(item, 128)) && new Set(transactionIds).size === 4
        && transactionDigests.length === 4 && transactionDigests.every((item) => HASH.test(String(item)))
        && !!apis && exactKeys(apis, ["reload", "branchSwitch", "decompression", "checkpoint", "indexFallback", "continuedWork"])
        && apis.reload === "agent-session-reload" && apis.branchSwitch === "agent-session-navigate-tree"
        && apis.decompression === "production-aili-decompress" && apis.checkpoint === "agent-session-compact"
        && apis.indexFallback === "production-branch-index-fallback" && apis.continuedWork === "agent-session-provider-prompt";
    }
    case "LIVE-V2-10": {
      if (!exactKeys(item, [...baseKeys(), "observationClass", "integration"]) || item.observationClass !== "native-integration-ordering-tui") return false;
      const integration = record(item.integration);
      const probe = record(integration?.resizeProbe);
      return !!integration && exactKeys(integration, ["inventorySource", "knownNativeIntegrations", "unknownThirdParty", "beforeCompactionHandlerObserved", "afterCompactionHandlerObserved", "realCheckpoint", "cancellationOverrides", "headlessRestartStatus", "interactiveResize", "ptyEvidence", "resizeProbe"])
        && integration.inventorySource === "production-native-loader" && JSON.stringify(integration.knownNativeIntegrations) === JSON.stringify(NATIVE_INTEGRATIONS)
        && integration.unknownThirdParty === "Unverified"
        && integration.beforeCompactionHandlerObserved === true && integration.afterCompactionHandlerObserved === true && integration.realCheckpoint === true
        && integration.cancellationOverrides === 0 && integration.headlessRestartStatus === "bounded-truthful" && integration.interactiveResize === "PASS" && integration.ptyEvidence === true
        && exactResizeProbe(probe, expected);
    }
  }
}

function validateRecovery(item: JsonRecord, observationClass: string, keys: string[], predicate: (recovery: JsonRecord) => boolean): boolean {
  if (!exactKeys(item, [...baseKeys(), "observationClass", "recovery"]) || item.observationClass !== observationClass) return false;
  const recovery = record(item.recovery);
  return !!recovery && exactKeys(recovery, keys) && predicate(recovery);
}

function exactBooleanTurn(value: JsonRecord | undefined, tool: boolean): boolean {
  if (!value) return false;
  const keys = tool ? ["providerCallSucceeded", "completeRealToolResult", "suffixRole", "suffixOrder", "protocolError"] : ["providerCallSucceeded", "suffixRole", "suffixOrder", "protocolError"];
  return exactKeys(value, keys) && value.providerCallSucceeded === true && (!tool || value.completeRealToolResult === true)
    && value.suffixRole === "custom" && value.suffixOrder === "after-complete-projection" && value.protocolError === false;
}

function baseKeys(): string[] {
  return ["id", "status", "observedAt", "source", "syntheticEvidenceAccepted", "binding", "capture", "eventDigest", "eventCount"];
}

export function nonPassCompactLiveRow(id: CompactLiveRowId, reason: CompactLiveNonPassReason): CompactLiveNonPassObservation {
  return { id, status: "NON_PASS", observationClass: "unobserved", reason };
}

export function reduceCompactLiveRow(
  id: CompactLiveRowId,
  events: readonly CompactScenarioEvent[],
  binding: CompactLiveExpectedBinding,
  observedAt = new Date().toISOString(),
): CompactLiveRowObservation {
  const base = passBase(id, events, binding, observedAt);
  const providerCalls = events.filter((event): event is Extract<CompactScenarioEvent, { code: "provider-call" }> => event.code === "provider-call");
  const continued = providerCalls.some((event) => event.turn === "continued" && event.succeeded);
  switch (id) {
    case "LIVE-V2-1": {
      const user = events.find((event): event is Extract<CompactScenarioEvent, { code: "provider-suffix" }> => event.code === "provider-suffix" && event.turn === "user");
      const tool = events.find((event): event is Extract<CompactScenarioEvent, { code: "provider-suffix" }> => event.code === "provider-suffix" && event.turn === "tool-result");
      const persistence = events.find((event): event is Extract<CompactScenarioEvent, { code: "suffix-persistence" }> => event.code === "suffix-persistence");
      const pressure = events.find((event): event is Extract<CompactScenarioEvent, { code: "pressure-state" }> => event.code === "pressure-state");
      if (!pressure || !user || !tool || !persistence || !successfulSuffixTurn(events, user) || !successfulSuffixTurn(events, tool)
        || user.role !== "custom" || tool.role !== "custom" || user.order !== "after-complete-projection" || tool.order !== "after-complete-projection" || user.protocolError || tool.protocolError
        || tool.completeRealToolResult !== true || persistence.jsonlMatches !== 0 || persistence.providerAuthoredSearchMatches !== 0) return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "provider-suffix-protocol", turns: {
        user: { providerCallSucceeded: true, suffixRole: "custom", suffixOrder: "after-complete-projection", protocolError: false },
        toolResult: { providerCallSucceeded: true, completeRealToolResult: true, suffixRole: "custom", suffixOrder: "after-complete-projection", protocolError: false },
      }, persistence: { jsonlMatches: 0, providerAuthoredSearchMatches: 0 }, pressure: { stage: pressure.stage, nonNormal: true } };
    }
    case "LIVE-V2-2": {
      const calibration = events.find((event): event is Extract<CompactScenarioEvent, { code: "calibration" }> => event.code === "calibration");
      const usage = providerCalls.map((event) => event.usage).find((value): value is CompactLiveUsage => exactUsage(value));
      const allowedExclusions = new Set(["ambiguous-cache", "ambiguous-request", "binary-or-image", "compaction", "identity-mismatch", "invalid-baseline", "invalid-reported-tokens", "outlier", "overflow-retry-cancelled"]);
      if (!calibration || calibration.eligible < 5 || calibration.excluded < 1 || calibration.exclusionCodes.length < 1 || calibration.exclusionCodes.some((code) => !allowedExclusions.has(code)) || !calibration.lowerBoundPreserved || !calibration.upperBoundPreserved || calibration.invalidNarrowing || !usage) return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "provider-usage-calibration", calibration: { eligibleSamples: calibration.eligible, excludedSamples: calibration.excluded, exclusionCodes: calibration.exclusionCodes as CompactLiveV22Pass["calibration"]["exclusionCodes"], lowerBoundPreserved: true, upperBoundPreserved: true, invalidDataNarrowedBounds: false }, providerUsage: usage };
    }
    case "LIVE-V2-3": {
      const tiers = events.filter((event): event is Extract<CompactScenarioEvent, { code: "tier-transaction" }> => event.code === "tier-transaction" && event.providerAuthored && event.persisted).map((event) => event.tier);
      const review = events.find((event): event is Extract<CompactScenarioEvent, { code: "human-review" }> => event.code === "human-review");
      if (JSON.stringify(tiers) !== JSON.stringify(["T1", "T2", "T3", "T3-restill"])) return nonPassCompactLiveRow(id, "provider-tool-transaction-unobserved");
      if (!review || review.verdict !== "PASS" || !review.verdictId || review.verdictSource !== "external-human-verdict-artifact"
        || !HASH.test(review.candidateSha256 ?? "") || !HASH.test(review.verdictSha256 ?? "")
        || !review.hardFactsRetained || !review.limitationsAccepted) return nonPassCompactLiveRow(id, "human-verdict-required");
      const candidateSha256 = review.candidateSha256!; const verdictSha256 = review.verdictSha256!;
      return { ...base, id, observationClass: "provider-authored-tier-lifecycle-human-review", lifecycle: { providerAuthoredToolTransactions: 4, persistedTiers: ["T1", "T2", "T3", "T3-restill"], hiddenEvaluatorCalls: 0 }, humanReview: { verdict: "PASS", verdictId: review.verdictId, verdictSource: "external-human-verdict-artifact", candidateSha256, verdictSha256, hardFactsRetained: true, limitationsAccepted: true } };
    }
    case "LIVE-V2-4": {
      const rejects = events.filter((event): event is Extract<CompactScenarioEvent, { code: "tool-rejection" }> => event.code === "tool-rejection" && event.providerAuthored);
      const ordered = rejects.map((event) => event.reason);
      if (JSON.stringify(ordered) !== JSON.stringify(["scope-drift", "quality-hard-fact-loss"]) || rejects.some((event) => event.transactionAppended || !event.redacted || !event.pressure) || new Set(rejects.map((event) => event.pressureCycleAttempt)).size !== 1) return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "provider-tool-rejection", rejection: { providerAuthoredAttempts: 2, codes: ["scope-drift", "quality-hard-fact-loss"], appendedTransactions: 0, redactedGuidance: true, actualPressureObserved: true, pressureCycleAttempts: 1 } };
    }
    case "LIVE-V2-5": {
      const rescue = events.find((event): event is Extract<CompactScenarioEvent, { code: "lifecycle-rescue" }> => event.code === "lifecycle-rescue");
      const before = events.find((event): event is Extract<CompactScenarioEvent, { code: "before-compact" }> => event.code === "before-compact" && (event.reason === "manual" || event.reason === "threshold"));
      const checkpoint = events.find((event): event is Extract<CompactScenarioEvent, { code: "checkpoint" }> => event.code === "checkpoint" && event.origin === "custom");
      if (!rescue?.providerAuthoredEligibleLifecycle || !rescue.oldEpochQueryOnly || !rescue.oldEpochSearchable || !before || !checkpoint?.persisted || !checkpoint.newEpoch || !continued) return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "deterministic-rescue-checkpoint", recovery: { providerAuthoredEligibleLifecycle: true, rescueInvocation: "agent-session-command", beforeCompactReason: before.reason as "manual" | "threshold", checkpointOrigin: "custom", persistedCompactionEntry: true, newEpoch: true, oldEpochQueryOnly: true, oldEpochSearchable: true, continuedProviderWork: true } };
    }
    case "LIVE-V2-6": {
      const threshold = events.find((event): event is Extract<CompactScenarioEvent, { code: "native-threshold" }> => event.code === "native-threshold");
      const before = events.find((event): event is Extract<CompactScenarioEvent, { code: "before-compact" }> => event.code === "before-compact" && event.reason === "threshold");
      const checkpoint = events.find((event): event is Extract<CompactScenarioEvent, { code: "checkpoint" }> => event.code === "checkpoint" && event.reason === "threshold" && event.origin === "native");
      if (!threshold?.actualHostThreshold) return nonPassCompactLiveRow(id, "actual-host-threshold-not-induced");
      if (!threshold.deterministicIneligible || threshold.cancelLoopCount !== 0 || !before || !checkpoint?.persisted || !continued) return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "native-threshold-fallback", recovery: { actualHostThreshold: true, deterministicEligibility: "ineligible", beforeCompactReason: "threshold", checkpointOrigin: "native", persistedCompactionEntry: true, cancelLoopCount: 0, continuedProviderWork: true } };
    }
    case "LIVE-V2-7": {
      const overflow = events.find((event): event is Extract<CompactScenarioEvent, { code: "provider-overflow" }> => event.code === "provider-overflow" && event.recognized && !event.thresholdCompactedFirst);
      const before = events.find((event): event is Extract<CompactScenarioEvent, { code: "before-compact" }> => event.code === "before-compact" && event.reason === "overflow");
      const checkpoint = events.find((event): event is Extract<CompactScenarioEvent, { code: "checkpoint" }> => event.code === "checkpoint" && event.reason === "overflow" && (event.origin === "custom" || event.origin === "native"));
      if (!overflow?.recognized || overflow.errorCode !== "context-length-exceeded" || overflow.thresholdCompactedFirst) return nonPassCompactLiveRow(id, "provider-context-error-not-induced");
      if (!before?.willRetry || !checkpoint?.persisted || !providerCalls.some((event) => event.turn === "retry" && event.succeeded) || !continued) return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "provider-context-overflow-retry", overflow: { providerRecognizedContextError: true, errorCode: "context-length-exceeded", beforeCompactReason: "overflow", willRetry: true, hookOutcome: before.outcome, checkpointOrigin: checkpoint.origin as "custom" | "native", persistedCompactionEntry: true, originalRequestRetried: true, laterProviderWork: true, thresholdCompactedFirst: false } };
    }
    case "LIVE-V2-8": {
      const cache = events.find((event): event is Extract<CompactScenarioEvent, { code: "cache" }> => event.code === "cache");
      if (!cache?.providerReported || cache.cacheReadTokens <= 0 || cache.cacheWriteTokens <= 0) return nonPassCompactLiveRow(id, "provider-cache-zero-or-unavailable");
      if (cache.stablePrefix !== "warm-candidate" || cache.suffixChange !== "suffix-changed" || cache.projectionChange !== "projection-changed") return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "provider-reported-cache", cache: { providerReported: true, cacheReadTokens: cache.cacheReadTokens, cacheWriteTokens: cache.cacheWriteTokens, stablePrefix: "warm-candidate", suffixChange: "suffix-changed", projectionChange: "projection-changed", internalIdentityUsedAsHitEvidence: false } };
    }
    case "LIVE-V2-9": {
      const migration = events.find((event): event is Extract<CompactScenarioEvent, { code: "migration" }> => event.code === "migration");
      if (!migration || migration.syntheticSetup) return nonPassCompactLiveRow(id, "synthetic-setup-cannot-pass");
      if (!migration.copiedSanitizedSession || !migration.v1v2v3Reload || !migration.branchSwitch || !migration.decompression || !migration.checkpoint || !migration.indexFallback || !migration.bytePrefixPreserved || !migration.continuedProviderWork
        || !completeProductionMigrationBinding(migration.source, migration.productionApis)) return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "copied-long-session-production-apis", migration: {
        copiedSanitizedSession: true, syntheticSetup: false, v1v2v3Reload: true, branchSwitch: true,
        decompression: true, checkpoint: true, indexFallback: true, bytePrefixPreserved: true, continuedProviderWork: true,
        source: migration.source as CompactLiveV29Pass["migration"]["source"],
        productionApis: migration.productionApis as CompactLiveV29Pass["migration"]["productionApis"],
      } };
    }
    case "LIVE-V2-10": {
      const integration = events.find((event): event is Extract<CompactScenarioEvent, { code: "native-integration" }> => event.code === "native-integration");
      if (!integration?.ptyEvidence || integration.interactiveResize !== "PASS" || !exactResizeProbe(record(integration.resizeProbe), binding)) return nonPassCompactLiveRow(id, "interactive-pty-resize-unobserved");
      if (integration.inventorySource !== "production-native-loader" || JSON.stringify(integration.knownNativeIntegrations) !== JSON.stringify(NATIVE_INTEGRATIONS) || integration.unknownThirdParty !== "Unverified" || !integration.beforeObserved || !integration.afterObserved || !integration.realCheckpoint || integration.cancellationOverrides !== 0 || integration.headlessRestartStatus !== "bounded-truthful") return nonPassCompactLiveRow(id, "required-production-events-missing");
      return { ...base, id, observationClass: "native-integration-ordering-tui", integration: { inventorySource: "production-native-loader", knownNativeIntegrations: integration.knownNativeIntegrations, unknownThirdParty: "Unverified", beforeCompactionHandlerObserved: true, afterCompactionHandlerObserved: true, realCheckpoint: true, cancellationOverrides: 0, headlessRestartStatus: "bounded-truthful", interactiveResize: "PASS", ptyEvidence: true, resizeProbe: integration.resizeProbe as CompactLiveV210Pass["integration"]["resizeProbe"] } };
    }
  }
}

function completeProductionMigrationBinding(
  sourceValue: Extract<CompactScenarioEvent, { code: "migration" }>["source"],
  apiValue: Extract<CompactScenarioEvent, { code: "migration" }>["productionApis"],
): boolean {
  const source = record(sourceValue);
  const apis = record(apiValue);
  const transactionIds = Array.isArray(source?.transactionIds) ? source.transactionIds : [];
  const transactionDigests = Array.isArray(source?.transactionDigests) ? source.transactionDigests : [];
  return !!source && source.providerProduced === true && source.sameCapture === true
    && HASH.test(String(source.sessionIdDigest ?? "")) && HASH.test(String(source.copiedPrefixSha256 ?? ""))
    && transactionIds.length === 4 && transactionIds.every((item) => boundedString(item, 128)) && new Set(transactionIds).size === 4
    && transactionDigests.length === 4 && transactionDigests.every((item) => HASH.test(String(item)))
    && !!apis && apis.reload === "agent-session-reload" && apis.branchSwitch === "agent-session-navigate-tree"
    && apis.decompression === "production-aili-decompress" && apis.checkpoint === "agent-session-compact"
    && apis.indexFallback === "production-branch-index-fallback" && apis.continuedWork === "agent-session-provider-prompt";
}

function exactResizeProbe(value: JsonRecord | undefined, expected: CompactLiveExpectedBinding): boolean {
  const executable = record(value?.executable); const productionEntry = record(value?.productionEntry);
  const harness = record(value?.harness); const candidate = record(value?.candidate);
  const initial = record(value?.initial); const resized = record(value?.resized);
  return !!value && exactKeys(value, ["mechanism", "directEventInjection", "executable", "productionEntry", "harness", "candidate", "initial", "resized", "ioctlApplied", "queriedWindowMatched", "productionCommandObserved", "postResizeOutputObserved", "transcriptSha256", "transcriptBytes"])
    && value.mechanism === "python3-stdlib-forkpty-tiocswinsz" && value.directEventInjection === false
    && !!executable && exactKeys(executable, ["path", "sha256"])
    && executable.path === "node_modules/@earendil-works/pi-coding-agent/dist/cli.js" && executable.sha256 === expected.piExecutableSha256
    && !!productionEntry && exactKeys(productionEntry, ["path", "sha256"])
    && productionEntry.path === "extensions/index.ts" && productionEntry.sha256 === expected.productionEntrySha256
    && !!harness && exactKeys(harness, ["path", "sha256"]) && harness.path === HARNESS_PATH && harness.sha256 === expected.liveHarnessSha256
    && !!candidate && exactKeys(candidate, ["packageVersion", "piVersion", "implementationSha256"])
    && candidate.packageVersion === expected.packageVersion && candidate.piVersion === expected.piVersion && candidate.implementationSha256 === expected.implementationSha256
    && !!initial && exactKeys(initial, ["columns", "rows"]) && initial.columns === 96 && initial.rows === 28
    && !!resized && exactKeys(resized, ["columns", "rows"]) && resized.columns === 132 && resized.rows === 42
    && value.ioctlApplied === true && value.queriedWindowMatched === true
    && value.productionCommandObserved === true && value.postResizeOutputObserved === true
    && HASH.test(String(value.transcriptSha256 ?? "")) && Number.isSafeInteger(value.transcriptBytes)
    && Number(value.transcriptBytes) > 0 && Number(value.transcriptBytes) <= 100_000;
}

function successfulSuffixTurn(events: readonly CompactScenarioEvent[], suffix: Extract<CompactScenarioEvent, { code: "provider-suffix" }>): boolean {
  const index = events.indexOf(suffix);
  if (index < 0) return false;
  const expectedTurn = suffix.turn === "tool-result" ? "tool-result" : "user";
  for (const event of events.slice(index + 1)) {
    if (event.code === "provider-suffix") return false;
    if (event.code === "provider-call") return event.turn === expectedTurn && event.succeeded;
  }
  return false;
}

function passBase(id: CompactLiveRowId, events: readonly CompactScenarioEvent[], expected: CompactLiveExpectedBinding, observedAt: string): CompactLivePassBase {
  const eventsBody = JSON.stringify(events);
  const eventDigest = createHash("sha256").update(eventsBody).digest("hex");
  const bytes = events.map((event) => event.code).join("\n");
  const captureSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    id, status: "PASS", observedAt, source: "official-pi-agent-session", syntheticEvidenceAccepted: false,
    binding: {
      providerFamily: expected.providerFamily, provider: expected.provider, model: expected.model, api: expected.api,
      candidate: { packageVersion: expected.packageVersion, piVersion: expected.piVersion, implementationSha256: expected.implementationSha256 },
      harness: { path: HARNESS_PATH, sha256: expected.liveHarnessSha256 },
    },
    capture: { sanitized: true, encoding: "utf8-event-codes-v1", bytes, byteLength: Buffer.byteLength(bytes), sha256: captureSha256 },
    eventDigest,
    eventCount: events.length,
  };
}

export function reduceInheritedCompactObservations(
  events: readonly CompactScenarioEvent[],
  binding: CompactLiveExpectedBinding,
  v23: CompactLiveRowObservation,
  observedAt = new Date().toISOString(),
): { p0: JsonRecord; longLifecycle: JsonRecord; continuedWork: JsonRecord } {
  const nonPass = (reason: string): JsonRecord => ({ status: "NON_PASS", observationClass: "unobserved", reason });
  const checkpointEvents = events.filter((event): event is Extract<CompactScenarioEvent, { code: "checkpoint" }> => event.code === "checkpoint" && event.persisted);
  const before = events.filter((event): event is Extract<CompactScenarioEvent, { code: "before-compact" }> => event.code === "before-compact");
  const continued = events.find((event): event is Extract<CompactScenarioEvent, { code: "provider-call" }> => event.code === "provider-call" && event.turn === "continued" && event.succeeded && exactUsage(event.usage));
  const invariants = events.find((event): event is Extract<CompactScenarioEvent, { code: "p0-invariants" }> => event.code === "p0-invariants");
  const common = inheritedPassBase(events, binding, observedAt);
  const p0Pass = ["manual", "threshold", "overflow"].every((reason) => before.some((event) => event.reason === reason))
    && checkpointEvents.some((event) => event.origin === "native") && continued !== undefined
    && invariants?.noCancellation === true && invariants.appendOnly === true && invariants.oneStormCoordinator === true;
  const p0 = p0Pass ? {
    ...common,
    status: "PASS",
    observationClass: "inherited-p0-production-recovery",
    gates: {
      manualCustomOrUndefined: true, thresholdCustomOrUndefined: true, overflowCustomOrUndefined: true, noCancellation: true,
      nativeFallback: true, appendOnly: true, oneStormCoordinator: true, postRecoveryWork: true,
    },
  } : nonPass("inherited-production-recovery-incomplete");
  const longLifecycle = v23.status === "PASS" && v23.id === "LIVE-V2-3" ? {
    ...common,
    status: "PASS",
    observationClass: "long-provider-authored-lifecycle-human-review",
    lifecycle: v23.lifecycle,
    humanReview: v23.humanReview,
  } : nonPass(v23.status === "NON_PASS" ? v23.reason : "provider-tool-transaction-unobserved");
  const continuedWork = checkpointEvents.length > 0 && continued?.usage ? {
    ...common,
    status: "PASS",
    observationClass: "post-checkpoint-provider-work",
    continuation: { checkpointPersisted: true, newProviderRequest: true, providerResponse: true, usage: continued.usage },
  } : nonPass("post-checkpoint-provider-work-unobserved");
  return { p0, longLifecycle, continuedWork };
}

function inheritedPassBase(events: readonly CompactScenarioEvent[], expected: CompactLiveExpectedBinding, observedAt: string): JsonRecord {
  const { id: _id, ...base } = passBase("LIVE-V2-1", events, expected, observedAt);
  return base;
}
