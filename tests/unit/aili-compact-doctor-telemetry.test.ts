import { describe, expect, it } from "vitest";

import { emptyBranchIndexCounters } from "../../src/runtime/aili-compact/branch-index.js";
import { emptyCacheTelemetry, providerSurfaceIdentities } from "../../src/runtime/aili-compact/cache.js";
import type { CompactBlock, CompactState } from "../../src/runtime/aili-compact/contracts.js";
import { DEFAULT_COMPACT_CONFIG, type CompactConfig } from "../../src/runtime/aili-compact/config.js";
import {
  buildCompactDoctorTelemetry,
  DOCTOR_BLOCK_SCAN_LIMIT,
  type CompactDoctorTelemetryInput,
} from "../../src/runtime/aili-compact/doctor-telemetry.js";
import { CheckpointCoordinator, observePressure } from "../../src/runtime/aili-compact/recovery.js";
import type { V3SemanticBlock, V3Tier } from "../../src/runtime/aili-compact/v3.js";

describe("AILI Compact bounded doctor telemetry", () => {
  it("reports exact mixed-schema/tier state, four distinct identities, and explicit Unverified boundaries", () => {
    const legacy = legacyState(new Map([
      ["v1", legacyBlock("v1", true, true)],
      ["v2", legacyBlock("v2", false, true)],
    ]));
    const v3Blocks = new Map([
      ["t1", v3Block("t1", "T1", true)],
      ["t2", v3Block("t2", "T2", true)],
      ["t3", v3Block("t3", "T3", false)],
    ]);
    const counters = emptyBranchIndexCounters();
    counters.providerMessagePasses = 1;
    counters.providerMessageVisits = 12;
    const cache = {
      ...emptyCacheTelemetry(),
      eligible: 5,
      cacheRead: 425,
      cacheWrite: 25,
      input: 50,
      window: Array.from({ length: 5 }, () => ({ input: 10, cacheRead: 85, cacheWrite: 5 })),
      hitRate: 85,
    };
    const surfaces = providerSurfaceIdentities({
      providerId: "fixture",
      modelId: "fixture-model",
      staticSystemPrompt: "static",
      immutableGuidance: { version: 1 },
      activeTools: [],
      logicalProviderMessages: [{ role: "user", content: "bounded" }],
      suffixContent: "pressure=PRESSURE",
      sessionId: "session",
      branchLeafId: "leaf",
      branchSourceDigest: "a".repeat(64),
      epochId: "root",
      projectionHash: "b".repeat(64),
    });

    const report = buildCompactDoctorTelemetry(baseInput({
      legacyState: legacy,
      v3: { blocks: v3Blocks, acceptedTransactionCount: 3, diagnosticCount: 0 },
      pressure: observePressure({ contextTokens: 80_000, contextWindow: 100_000 }),
      branchIndexHealthy: true,
      branchIndexCounters: counters,
      cache,
      providerSurfaces: surfaces,
      calibration: {
        version: "aili.token-calibration.v1",
        providerId: "fixture",
        modelId: "fixture-model",
        estimatorVersion: "estimator-v1",
        sampleCount: 5,
        lowerMultiplier: 0.9,
        upperMultiplier: 1.1,
        calibrated: true,
        exclusionCounts: {
          "ambiguous-cache": 0,
          "ambiguous-request": 0,
          "binary-or-image": 0,
          compaction: 0,
          "identity-mismatch": 0,
          "invalid-baseline": 0,
          "invalid-reported-tokens": 0,
          outlier: 0,
          "overflow-retry-cancelled": 0,
        },
      },
      repairVerified: true,
    }));

    expect(report.components.lifecycle).toMatchObject({
      status: "PASS",
      exact: true,
      schemaBlockCounts: { v1: 1, v2: 1, v3: 3 },
      activeSchemaBlockCounts: { v1: 1, v2: 1, v3: 2 },
      tierBlockCounts: { T1: 1, T2: 1, T3: 1 },
      activeTierBlockCounts: { T1: 1, T2: 1, T3: 0 },
      acceptedTransactions: { legacyV1V2: 2, v3: 3 },
    });
    expect(report.components.cacheIdentities).toMatchObject({
      status: "PASS",
      staticSurfaceIdentity: { status: "PASS", hash: expect.stringMatching(/^[a-f0-9]{16}$/) },
      logicalProviderPrefixIdentity: {
        status: "PASS",
        claim: "aili-logical-pre-suffix-surface-only",
        providerPrivateCacheKey: "UNVERIFIED",
      },
      suffixFingerprint: { status: "PASS" },
      fullProviderInputIdentity: { status: "PASS" },
      providerUsageEvidence: { status: "OBSERVED", eligibleSamples: 5, cacheReadTokens: 425 },
    });
    expect(new Set([
      report.components.cacheIdentities.staticSurfaceIdentity.hash,
      report.components.cacheIdentities.logicalProviderPrefixIdentity.hash,
      report.components.cacheIdentities.suffixFingerprint.hash,
      report.components.cacheIdentities.fullProviderInputIdentity.hash,
    ]).size).toBe(4);
    expect(report.components.index).toMatchObject({
      status: "PASS",
      healthy: true,
      mode: "indexed",
      fallbackObserved: false,
      counters: { providerMessagePasses: 1, providerMessageVisits: 12 },
    });
    expect(report.components.tokenCalibration).toMatchObject({ status: "PASS", calibrated: true, sampleCount: 5 });
    expect(report.components.liveProvider).toEqual({ status: "UNVERIFIED", code: "UV-LIVE-1" });
    expect(report.components.hostOrdering.status).toBe("UNVERIFIED");
  });

  it("makes planning and quality overrides explicit without claiming they disable recovery or index correctness", () => {
    const counters = emptyBranchIndexCounters();
    counters.fallbacks = 2;
    counters.failOpenReturns = 2;
    const config = cloneConfig({ planningEnabled: false, qualityEnabled: false });
    const report = buildCompactDoctorTelemetry(baseInput({
      config,
      legacyState: { ...legacyState(), diagnostics: ["repair-RAW_DOCTOR_SENTINEL"] },
      deterministicCheckpointEligible: "not-evaluated",
      branchIndexHealthy: false,
      branchIndexDiagnostic: "index:RAW_DOCTOR_SENTINEL",
      branchIndexCounters: counters,
    }));

    expect(report.components.planning).toMatchObject({
      status: "WARN",
      enabled: false,
      disabledAutomaticSurfaces: [
        "safe-range-discovery",
        "semantic-recommendation",
        "semantic-attempt",
        "tier-promotion",
        "tier-restill",
        "proactive-provider-suffix",
      ],
      preservedSafetySurfaces: expect.arrayContaining([
        "manual-mutation",
        "decompress",
        "recompress",
        "restore-all",
        "quality",
        "branch-index-correctness",
        "deterministic-checkpoint",
        "native-fallback",
        "rescue",
        "overflow-recovery",
      ]),
    });
    expect(report.components.quality).toMatchObject({
      status: "WARN",
      enabled: false,
      expertOverride: "active",
      deterministicCheckpointRequiresAcceptedEvidence: true,
    });
    expect(report.components.index).toMatchObject({
      status: "ERROR",
      mode: "pure-fallback-observed",
      fallbackObserved: true,
      diagnostic: { code: "redacted-diagnostic", hash: expect.stringMatching(/^[a-f0-9]{16}$/) },
    });
    expect(report.components.checkpoint).toMatchObject({ status: "UNVERIFIED", deterministicEligibility: "not-evaluated" });
    expect(report.components.cacheIdentities).toMatchObject({
      status: "UNVERIFIED",
      logicalProviderPrefixIdentity: { providerPrivateCacheKey: "UNVERIFIED" },
      providerUsageEvidence: { status: "UNVERIFIED" },
    });
    expect(JSON.stringify(report)).not.toContain("RAW_DOCTOR_SENTINEL");
  });

  it("stops before an unbounded block walk and reports counts as Unverified", () => {
    const blocks = new Map<string, CompactBlock>();
    const block = legacyBlock("template", false, true);
    for (let index = 0; index <= DOCTOR_BLOCK_SCAN_LIMIT; index += 1) blocks.set(`block-${index}`, block);
    const report = buildCompactDoctorTelemetry(baseInput({ legacyState: legacyState(blocks) }));

    expect(report.components.lifecycle).toMatchObject({
      status: "UNVERIFIED",
      exact: false,
      scanLimit: DOCTOR_BLOCK_SCAN_LIMIT,
      totalBlockCount: DOCTOR_BLOCK_SCAN_LIMIT + 1,
      code: "block-count-budget-exceeded",
    });
    expect(report.components.lifecycle).not.toHaveProperty("schemaBlockCounts");
    expect(report.components.quality).toMatchObject({ status: "UNVERIFIED", code: "block-count-budget-exceeded" });
  });
});

function baseInput(overrides: Partial<CompactDoctorTelemetryInput> = {}): CompactDoctorTelemetryInput {
  const checkpoint = new CheckpointCoordinator({ sessionId: "session", branchId: "leaf", epochId: "root" }).snapshot();
  return {
    config: cloneConfig(),
    legacyState: legacyState(),
    v3: { blocks: new Map(), acceptedTransactionCount: 0, diagnosticCount: 0 },
    checkpoint,
    deterministicCheckpointEligible: "eligible",
    branchIndexHealthy: "Unverified",
    branchIndexCounters: emptyBranchIndexCounters(),
    cache: emptyCacheTelemetry(),
    repairVerified: "Unverified",
    ...overrides,
  };
}

function cloneConfig(overrides: { planningEnabled?: boolean; qualityEnabled?: boolean } = {}): CompactConfig {
  return {
    ...DEFAULT_COMPACT_CONFIG,
    planning: { ...DEFAULT_COMPACT_CONFIG.planning, ...(overrides.planningEnabled === undefined ? {} : { enabled: overrides.planningEnabled }) },
    quality: { ...DEFAULT_COMPACT_CONFIG.quality, ...(overrides.qualityEnabled === undefined ? {} : { enabled: overrides.qualityEnabled }) },
    index: { ...DEFAULT_COMPACT_CONFIG.index },
  };
}

function legacyState(blocks: ReadonlyMap<string, CompactBlock> = new Map()): CompactState {
  return {
    epochId: "root",
    enabled: true,
    autoCooling: true,
    manualMode: false,
    cachePanel: false,
    hasSessionControl: false,
    hasAutoCoolingControl: false,
    hasManualControl: false,
    hasPanelControl: false,
    blocks,
    policyDecisions: [],
    transactionCount: blocks.size,
    repairTransactionCount: 0,
    diagnostics: [],
  };
}

function legacyBlock(id: string, legacy: boolean, active: boolean): CompactBlock {
  return {
    id,
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [`source-${id}`],
    sourceDigest: "a".repeat(64),
    summary: `summary-${id}`,
    active,
    legacy,
  };
}

function v3Block(blockId: string, tier: V3Tier, active: boolean): V3SemanticBlock {
  return {
    blockId,
    transactionId: `tx-${blockId}`,
    sessionId: "session",
    branchLeafId: "leaf",
    epochId: "root",
    catalogIdAtCreate: "catalog",
    projectionVersion: "projection-v1",
    createdAt: 1,
    createdTurnOrdinal: 1,
    tier,
    topic: blockId,
    runId: `run-${blockId}`,
    anchorEntryId: `source-${blockId}`,
    summary: `summary-${blockId}`,
    summaryDigest: "b".repeat(64),
    source: tier === "T1"
      ? { kind: "messages", entryIds: [`source-${blockId}`], firstEntryId: `source-${blockId}`, lastEntryId: `source-${blockId}` }
      : { kind: "blocks", childBlockIds: [`child-a-${blockId}`, `child-b-${blockId}`] },
    leafDigest: "c".repeat(64),
    leafCount: tier === "T1" ? 1 : 2,
    firstLeafOrdinal: 1,
    lastLeafOrdinal: 2,
    tokens: {
      estimatorVersion: "estimator-v1",
      providerId: "fixture",
      modelId: "fixture-model",
      sourceTokensLower: 2_000,
      sourceTokensUpper: 3_000,
      replacementTokensUpper: 500,
      steadySavingsTokensLower: 1_500,
      oneTimeCostTokensUpper: 500,
      breakEvenTurnsUpper: 1,
      savingsRatio: 0.5,
      summaryTokensUpper: 400,
    },
    quality: {
      status: "accepted",
      evaluatorVersion: "quality-v1",
      sourceFactDigest: "d".repeat(64),
      hardFactCount: 1,
      coveredHardFactCount: 1,
      warningCodes: [],
    },
    active,
    queryOnly: false,
  };
}
