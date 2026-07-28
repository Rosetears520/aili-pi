import type { BranchIndexCounters } from "./branch-index.js";
import type { CacheTelemetry, ProviderSurfaceIdentities } from "./cache.js";
import type { TokenCalibrationSnapshot } from "./calibration.js";
import { digest, type CompactBlock, type CompactState } from "./contracts.js";
import type { CompactConfig } from "./config.js";
import type { CheckpointCoordinatorSnapshot, PressureObservation } from "./recovery.js";
import type { V3SemanticBlock } from "./v3.js";

export const DOCTOR_BLOCK_SCAN_LIMIT = 4_096;

export type CompactDoctorStatus = "PASS" | "WARN" | "ERROR" | "UNVERIFIED";

export interface CompactDoctorV3Snapshot {
  blocks: ReadonlyMap<string, V3SemanticBlock>;
  acceptedTransactionCount: number;
  diagnosticCount: number;
  diagnosticHash?: string;
}

export interface CompactDoctorTelemetryInput {
  config: CompactConfig;
  legacyState: CompactState;
  v3?: CompactDoctorV3Snapshot;
  pressure?: PressureObservation;
  checkpoint: CheckpointCoordinatorSnapshot;
  deterministicCheckpointEligible: "not-evaluated" | "eligible" | `ineligible:${string}` | "Unverified";
  branchIndexHealthy: boolean | "Unverified";
  branchIndexDiagnostic?: string;
  branchIndexCounters: BranchIndexCounters;
  cache: CacheTelemetry;
  providerSurfaces?: ProviderSurfaceIdentities;
  calibration?: TokenCalibrationSnapshot;
  repairVerified: boolean | "Unverified";
}

export function buildCompactDoctorTelemetry(input: CompactDoctorTelemetryInput) {
  const lifecycle = lifecycleTelemetry(input.legacyState, input.v3);
  const checkpointStatus = input.checkpoint.state === "failed" ? "ERROR"
    : input.deterministicCheckpointEligible === "not-evaluated" || input.deterministicCheckpointEligible === "Unverified"
      ? "UNVERIFIED"
      : "PASS";
  const indexStatus = input.branchIndexHealthy === false ? "ERROR"
    : !input.config.index.enabled ? "WARN"
      : input.branchIndexHealthy === true ? "PASS" : "UNVERIFIED";
  const repairStatus = input.legacyState.diagnostics.some((item) => item.startsWith("repair-"))
    ? "ERROR"
    : input.repairVerified === true ? "PASS" : "UNVERIFIED";

  return {
    pressureStage: input.pressure?.stage ?? "Unverified" as const,
    headroomTokens: input.pressure
      ? { value: input.pressure.headroomTokens, source: input.pressure.source }
      : { source: "Unverified" as const },
    components: {
      planning: planningTelemetry(input.config),
      lifecycle,
      quality: qualityTelemetry(input.config, lifecycle),
      tokenCalibration: input.calibration
        ? { status: input.calibration.calibrated ? "PASS" : "UNVERIFIED", ...input.calibration }
        : { status: "UNVERIFIED" as const, code: "no-exact-provider-model-profile" },
      cacheIdentities: cacheIdentityTelemetry(input.providerSurfaces, input.cache),
      index: indexTelemetry(
        input.config.index.enabled,
        indexStatus,
        input.branchIndexHealthy,
        input.branchIndexDiagnostic,
        input.branchIndexCounters,
      ),
      repair: {
        status: repairStatus,
        transactionCount: boundedCount(input.legacyState.repairTransactionCount ?? 0),
      },
      checkpoint: {
        status: checkpointStatus,
        coordinatorState: input.checkpoint.state,
        inFlight: input.checkpoint.inFlight,
        deterministicEligibility: input.deterministicCheckpointEligible,
        counts: {
          deterministic: boundedCount(input.checkpoint.deterministicCheckpointCount),
          nativeFallback: boundedCount(input.checkpoint.nativeFallbackCount),
          rescue: boundedCount(input.checkpoint.rescueCount),
          staleCallback: boundedCount(input.checkpoint.staleCallbackCount),
        },
        ...(input.checkpoint.lastErrorCode
          ? { lastError: boundedDiagnostic(input.checkpoint.lastErrorCode) }
          : {}),
      },
      liveProvider: { status: "UNVERIFIED" as const, code: "UV-LIVE-1" },
      hostOrdering: {
        status: "UNVERIFIED" as const,
        codes: ["UV-EXT-ORDER-1", "UV-PI-INTERNAL-1"] as const,
      },
    },
  };
}

function planningTelemetry(config: CompactConfig) {
  return {
    status: config.planning.enabled ? "PASS" as const : "WARN" as const,
    enabled: config.planning.enabled,
    disabledAutomaticSurfaces: config.planning.enabled ? [] : [
      "safe-range-discovery",
      "semantic-recommendation",
      "semantic-attempt",
      "tier-promotion",
      "tier-restill",
      "proactive-provider-suffix",
    ],
    preservedSafetySurfaces: [
      "manual-mutation",
      "decompress",
      "recompress",
      "restore-all",
      "hard-protection",
      "quality",
      "branch-index-correctness",
      "deterministic-checkpoint",
      "native-fallback",
      "rescue",
      "overflow-recovery",
    ],
  };
}

function lifecycleTelemetry(legacyState: CompactState, v3: CompactDoctorV3Snapshot | undefined) {
  const totalBlocks = legacyState.blocks.size + (v3?.blocks.size ?? 0);
  const exact = v3 !== undefined && totalBlocks <= DOCTOR_BLOCK_SCAN_LIMIT;
  const counts = exact ? scanLifecycle(legacyState, v3) : undefined;
  const v3DiagnosticCount = boundedCount(v3?.diagnosticCount ?? 0);
  const legacyDiagnosticCount = boundedCount(legacyState.diagnostics.length);
  const status: CompactDoctorStatus = legacyDiagnosticCount > 0 || v3DiagnosticCount > 0
    ? "ERROR" : exact ? "PASS" : "UNVERIFIED";
  return {
    status,
    exact,
    scanLimit: DOCTOR_BLOCK_SCAN_LIMIT,
    totalBlockCount: boundedCount(totalBlocks),
    acceptedTransactions: {
      legacyV1V2: boundedCount(legacyState.transactionCount ?? 0),
      v3: boundedCount(v3?.acceptedTransactionCount ?? 0),
    },
    ...(counts ? counts : { code: v3 ? "block-count-budget-exceeded" : "v3-state-unavailable" }),
    diagnostics: {
      legacyCount: legacyDiagnosticCount,
      legacyHash: boundedDiagnosticsHash(legacyState.diagnostics),
      v3Count: v3DiagnosticCount,
      ...(v3DiagnosticCount > 0 ? { v3Hash: v3?.diagnosticHash?.slice(0, 16) ?? "Unverified" } : {}),
    },
  };
}

function scanLifecycle(legacyState: CompactState, v3: CompactDoctorV3Snapshot | undefined) {
  const schemaBlocks = { v1: 0, v2: 0, v3: 0 };
  const activeSchemaBlocks = { v1: 0, v2: 0, v3: 0 };
  const activeTiers = { T1: 0, T2: 0, T3: 0 };
  const allTiers = { T1: 0, T2: 0, T3: 0 };
  let acceptedQuality = 0;
  let unevaluatedQuality = 0;

  for (const block of legacyState.blocks.values()) {
    const schema = block.legacy === true ? "v1" : "v2";
    schemaBlocks[schema] += 1;
    if (isActiveLegacyBlock(block, legacyState.epochId)) activeSchemaBlocks[schema] += 1;
    if (block.qualityEvidence?.verdict === "pass" || block.qualityEvidence?.verdict === "pass-with-warnings") acceptedQuality += 1;
    else if (block.kind === "semantic") unevaluatedQuality += 1;
  }
  for (const block of v3?.blocks.values() ?? []) {
    schemaBlocks.v3 += 1;
    allTiers[block.tier] += 1;
    if (block.quality.status === "accepted") acceptedQuality += 1;
    else unevaluatedQuality += 1;
    if (block.active && !block.queryOnly && block.epochId === legacyState.epochId) {
      activeSchemaBlocks.v3 += 1;
      activeTiers[block.tier] += 1;
    }
  }
  return {
    schemaBlockCounts: schemaBlocks,
    activeSchemaBlockCounts: activeSchemaBlocks,
    tierBlockCounts: allTiers,
    activeTierBlockCounts: activeTiers,
    qualityBlockCounts: { accepted: acceptedQuality, unevaluated: unevaluatedQuality },
  };
}

function qualityTelemetry(config: CompactConfig, lifecycle: ReturnType<typeof lifecycleTelemetry>) {
  const counts = "qualityBlockCounts" in lifecycle ? lifecycle.qualityBlockCounts : undefined;
  return {
    status: config.quality.enabled ? (counts ? "PASS" as const : "UNVERIFIED" as const) : "WARN" as const,
    enabled: config.quality.enabled,
    expertOverride: config.quality.enabled ? "inactive" as const : "active" as const,
    warningPolicy: config.quality.warningPolicy,
    ...(counts ? counts : { code: "block-count-budget-exceeded" }),
    deterministicCheckpointRequiresAcceptedEvidence: true,
  };
}

function cacheIdentityTelemetry(surfaces: ProviderSurfaceIdentities | undefined, telemetry: CacheTelemetry) {
  const identity = (value: string | undefined) => value
    ? { status: "PASS" as const, hash: value.slice(0, 16) }
    : { status: "UNVERIFIED" as const };
  const presentCount = surfaces ? 4 : 0;
  return {
    status: presentCount === 4 ? "PASS" as const : "UNVERIFIED" as const,
    staticSurfaceIdentity: identity(surfaces?.staticSurfaceIdentity),
    logicalProviderPrefixIdentity: {
      ...identity(surfaces?.logicalProviderPrefixIdentity),
      claim: "aili-logical-pre-suffix-surface-only" as const,
      providerPrivateCacheKey: "UNVERIFIED" as const,
    },
    suffixFingerprint: identity(surfaces?.suffixFingerprint),
    fullProviderInputIdentity: identity(surfaces?.fullProviderInputIdentity),
    providerUsageEvidence: telemetry.window.length > 0
      ? {
        status: "OBSERVED" as const,
        eligibleSamples: boundedCount(telemetry.window.length),
        cacheReadTokens: boundedCount(telemetry.cacheRead),
        cacheWriteTokens: boundedCount(telemetry.cacheWrite),
      }
      : { status: "UNVERIFIED" as const, code: "no-provider-reported-eligible-sample" },
  };
}

function indexTelemetry(
  configuredEnabled: boolean,
  status: CompactDoctorStatus,
  healthy: boolean | "Unverified",
  diagnostic: string | undefined,
  counters: BranchIndexCounters,
) {
  const boundedCounters = Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [key, boundedCount(value)]),
  ) as unknown as BranchIndexCounters;
  const fallbackObserved = boundedCounters.fallbacks > 0 || boundedCounters.failOpenReturns > 0;
  return {
    status,
    configuredEnabled,
    healthy,
    mode: healthy === true ? "indexed"
      : healthy === false && fallbackObserved ? "pure-fallback-observed"
        : healthy === false ? "unhealthy-no-fallback-observed" : "Unverified",
    fallbackObserved,
    ...(diagnostic ? { diagnostic: boundedDiagnostic(diagnostic) } : {}),
    counters: boundedCounters,
  };
}

function isActiveLegacyBlock(block: CompactBlock, epochId: string): boolean {
  return block.active && block.queryOnly !== true && block.epochId === epochId;
}

function boundedDiagnostic(value: string) {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
    ? { code: value }
    : { code: "redacted-diagnostic", hash: boundedStringHash(value) };
}

function boundedCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function boundedDiagnosticsHash(values: readonly string[]): string {
  return digest({
    count: values.length,
    sample: values.slice(0, 64).map((value) => ({ length: value.length, prefix: value.slice(0, 256) })),
  }).slice(0, 16);
}

function boundedStringHash(value: string): string {
  return digest({ length: value.length, prefix: value.slice(0, 512) }).slice(0, 16);
}
