import { describe, expect, it } from "vitest";

import {
  COMPACT_LIVE_ROW_IDS,
  reduceCompactLiveRow,
  validateCompactLiveRowPass,
  type CompactLiveExpectedBinding,
  type CompactLiveProviderFamily,
  type CompactLiveRowId,
  type CompactScenarioEvent,
} from "../../scripts/aili-compact-live-observations.js";
import { NATIVE_INTEGRATIONS } from "../../src/runtime/native-integrations.js";

const usage = { input: 100, output: 10, cacheRead: 20, cacheWrite: 5, totalTokens: 130 };

describe("AILI Compact typed live row observations", () => {
  it.each(COMPACT_LIVE_ROW_IDS)("accepts LIVE row %s only from its exact observation class", (id) => {
    const binding = expected("openai");
    const row = reduceCompactLiveRow(id, eventsFor(id), binding);
    expect(row.status).toBe("PASS");
    expect(validateCompactLiveRowPass(row, binding, id)).toBe(true);

    const wrongClass = { ...row, observationClass: "provider-suffix-protocol" };
    if (id !== "LIVE-V2-1") expect(validateCompactLiveRowPass(wrongClass, binding, id)).toBe(false);
    expect(validateCompactLiveRowPass({ status: "PASS" }, binding, id)).toBe(false);
  });

  it("keeps cache, copied-session, human-review, threshold, overflow, and PTY negatives NON_PASS", () => {
    const binding = expected("openai");
    expect(reduceCompactLiveRow("LIVE-V2-1", eventsFor("LIVE-V2-1").filter((event) => event.code !== "pressure-state"), binding)).toMatchObject({ status: "NON_PASS", reason: "required-production-events-missing" });
    expect(reduceCompactLiveRow("LIVE-V2-3", eventsFor("LIVE-V2-3").filter((event) => event.code !== "human-review"), binding)).toMatchObject({ status: "NON_PASS", reason: "human-verdict-required" });
    expect(reduceCompactLiveRow("LIVE-V2-6", eventsFor("LIVE-V2-6").filter((event) => event.code !== "native-threshold"), binding)).toMatchObject({ status: "NON_PASS", reason: "actual-host-threshold-not-induced" });
    expect(reduceCompactLiveRow("LIVE-V2-7", eventsFor("LIVE-V2-7").filter((event) => event.code !== "provider-overflow"), binding)).toMatchObject({ status: "NON_PASS", reason: "provider-context-error-not-induced" });
    expect(reduceCompactLiveRow("LIVE-V2-8", [{ code: "cache", providerReported: true, cacheReadTokens: 0, cacheWriteTokens: 0, stablePrefix: "warm-candidate", suffixChange: "suffix-changed", projectionChange: "projection-changed" }], binding)).toMatchObject({ status: "NON_PASS", reason: "provider-cache-zero-or-unavailable" });
    expect(reduceCompactLiveRow("LIVE-V2-9", [{ ...eventsFor("LIVE-V2-9")[0]!, syntheticSetup: true } as CompactScenarioEvent], binding)).toMatchObject({ status: "NON_PASS", reason: "synthetic-setup-cannot-pass" });
    expect(reduceCompactLiveRow("LIVE-V2-10", [{ ...eventsFor("LIVE-V2-10")[0]!, interactiveResize: "NON_PASS", ptyEvidence: false } as CompactScenarioEvent], binding)).toMatchObject({ status: "NON_PASS", reason: "interactive-pty-resize-unobserved" });
    expect(reduceCompactLiveRow("LIVE-V2-10", [{ ...eventsFor("LIVE-V2-10")[0]!, resizeProbe: undefined } as CompactScenarioEvent], binding)).toMatchObject({ status: "NON_PASS", reason: "interactive-pty-resize-unobserved" });
    expect(reduceCompactLiveRow("LIVE-V2-10", [{ ...eventsFor("LIVE-V2-10")[0]!, resizeProbe: { ...(eventsFor("LIVE-V2-10")[0] as any).resizeProbe, directEventInjection: true } } as CompactScenarioEvent], binding)).toMatchObject({ status: "NON_PASS", reason: "interactive-pty-resize-unobserved" });
  });

  it("rejects stale, candidate-drifted, harness-drifted, and unsanitized-byte bindings per row", () => {
    const binding = expected("openai");
    const row = reduceCompactLiveRow("LIVE-V2-1", eventsFor("LIVE-V2-1"), binding) as any;
    expect(validateCompactLiveRowPass({ ...row, observedAt: "2000-01-01T00:00:00.000Z" }, binding, "LIVE-V2-1")).toBe(false);
    expect(validateCompactLiveRowPass({ ...row, binding: { ...row.binding, candidate: { ...row.binding.candidate, packageVersion: "0.1.16" } } }, binding, "LIVE-V2-1")).toBe(false);
    expect(validateCompactLiveRowPass({ ...row, binding: { ...row.binding, harness: { ...row.binding.harness, sha256: "f".repeat(64) } } }, binding, "LIVE-V2-1")).toBe(false);
    expect(validateCompactLiveRowPass({ ...row, capture: { ...row.capture, sanitized: false } }, binding, "LIVE-V2-1")).toBe(false);
    expect(validateCompactLiveRowPass({ ...row, capture: { ...row.capture, bytes: `${row.capture.bytes}\nprovider-call` } }, binding, "LIVE-V2-1")).toBe(false);
    expect(validateCompactLiveRowPass({ ...row, pressure: { stage: "NORMAL", nonNormal: false } }, binding, "LIVE-V2-1")).toBe(false);

    const native = reduceCompactLiveRow("LIVE-V2-10", eventsFor("LIVE-V2-10"), binding) as any;
    expect(validateCompactLiveRowPass({ ...native, integration: { ...native.integration, knownNativeIntegrations: ["invented@1"] } }, binding, "LIVE-V2-10")).toBe(false);
  });
});

function expected(providerFamily: CompactLiveProviderFamily): CompactLiveExpectedBinding {
  const provider = providerFamily === "openai" ? "openai-codex" : providerFamily === "anthropic" ? "anthropic" : "google";
  return {
    providerFamily,
    provider,
    model: `${providerFamily}-model`,
    api: `${providerFamily}-api`,
    packageVersion: "0.2.0",
    piVersion: "0.82.1",
    implementationSha256: "a".repeat(64),
    liveHarnessSha256: "b".repeat(64),
    piExecutableSha256: "c".repeat(64),
    productionEntrySha256: "d".repeat(64),
  };
}

export function eventsFor(id: CompactLiveRowId): CompactScenarioEvent[] {
  switch (id) {
    case "LIVE-V2-1": return [
      { code: "pressure-state", stage: "PRESSURE" },
      { code: "provider-suffix", turn: "user", role: "custom", order: "after-complete-projection", protocolError: false },
      { code: "provider-call", turn: "user", succeeded: true, usage },
      { code: "provider-suffix", turn: "tool-result", role: "custom", order: "after-complete-projection", completeRealToolResult: true, protocolError: false },
      { code: "provider-call", turn: "tool-result", succeeded: true, usage },
      { code: "suffix-persistence", jsonlMatches: 0, providerAuthoredSearchMatches: 0 },
    ];
    case "LIVE-V2-2": return [
      { code: "provider-call", turn: "user", succeeded: true, usage },
      { code: "calibration", eligible: 5, excluded: 1, exclusionCodes: ["overflow-retry-cancelled"], lowerBoundPreserved: true, upperBoundPreserved: true, invalidNarrowing: false },
    ];
    case "LIVE-V2-3": return [
      ...(["T1", "T2", "T3", "T3-restill"] as const).map((tier) => ({ code: "tier-transaction" as const, tier, providerAuthored: true, persisted: true })),
      { code: "human-review", verdict: "PASS", verdictId: "review-1", verdictSource: "external-human-verdict-artifact", candidateSha256: "e".repeat(64), verdictSha256: "f".repeat(64), hardFactsRetained: true, limitationsAccepted: true },
    ];
    case "LIVE-V2-4": return [
      { code: "tool-rejection", reason: "scope-drift", providerAuthored: true, transactionAppended: false, redacted: true, pressure: true, pressureCycleAttempt: 1 },
      { code: "tool-rejection", reason: "quality-hard-fact-loss", providerAuthored: true, transactionAppended: false, redacted: true, pressure: true, pressureCycleAttempt: 1 },
    ];
    case "LIVE-V2-5": return [
      { code: "lifecycle-rescue", providerAuthoredEligibleLifecycle: true, invocation: "agent-session-command", oldEpochQueryOnly: true, oldEpochSearchable: true },
      { code: "before-compact", reason: "manual", willRetry: false, outcome: "custom" },
      { code: "checkpoint", reason: "manual", origin: "custom", persisted: true, newEpoch: true },
      { code: "provider-call", turn: "continued", succeeded: true, usage },
    ];
    case "LIVE-V2-6": return [
      { code: "native-threshold", actualHostThreshold: true, deterministicIneligible: true, cancelLoopCount: 0 },
      { code: "before-compact", reason: "threshold", willRetry: false, outcome: "undefined-native-fallback" },
      { code: "checkpoint", reason: "threshold", origin: "native", persisted: true, newEpoch: true },
      { code: "provider-call", turn: "continued", succeeded: true, usage },
    ];
    case "LIVE-V2-7": return [
      { code: "provider-overflow", recognized: true, errorCode: "context-length-exceeded", thresholdCompactedFirst: false },
      { code: "before-compact", reason: "overflow", willRetry: true, outcome: "undefined-native-fallback" },
      { code: "checkpoint", reason: "overflow", origin: "native", persisted: true, newEpoch: true },
      { code: "provider-call", turn: "retry", succeeded: true, usage },
      { code: "provider-call", turn: "continued", succeeded: true, usage },
    ];
    case "LIVE-V2-8": return [{ code: "cache", providerReported: true, cacheReadTokens: 20, cacheWriteTokens: 5, stablePrefix: "warm-candidate", suffixChange: "suffix-changed", projectionChange: "projection-changed" }];
    case "LIVE-V2-9": return [{ code: "migration", copiedSanitizedSession: true, syntheticSetup: false, v1v2v3Reload: true, branchSwitch: true, decompression: true, checkpoint: true, indexFallback: true, bytePrefixPreserved: true, continuedProviderWork: true, source: { providerProduced: true, sameCapture: true, sessionIdDigest: "1".repeat(64), copiedPrefixSha256: "2".repeat(64), transactionIds: ["tx-1", "tx-2", "tx-3", "tx-4"], transactionDigests: ["3".repeat(64), "4".repeat(64), "5".repeat(64), "6".repeat(64)] }, productionApis: { reload: "agent-session-reload", branchSwitch: "agent-session-navigate-tree", decompression: "production-aili-decompress", checkpoint: "agent-session-compact", indexFallback: "production-branch-index-fallback", continuedWork: "agent-session-provider-prompt" } }];
    case "LIVE-V2-10": return [{ code: "native-integration", inventorySource: "production-native-loader", knownNativeIntegrations: [...NATIVE_INTEGRATIONS], unknownThirdParty: "Unverified", beforeObserved: true, afterObserved: true, realCheckpoint: true, cancellationOverrides: 0, headlessRestartStatus: "bounded-truthful", interactiveResize: "PASS", ptyEvidence: true, resizeProbe: { mechanism: "python3-stdlib-forkpty-tiocswinsz", directEventInjection: false, executable: { path: "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", sha256: "c".repeat(64) }, productionEntry: { path: "extensions/index.ts", sha256: "d".repeat(64) }, harness: { path: "tests/integration/aili-compact-live-release-gated.test.ts", sha256: "b".repeat(64) }, candidate: { packageVersion: "0.2.0", piVersion: "0.82.1", implementationSha256: "a".repeat(64) }, initial: { columns: 96, rows: 28 }, resized: { columns: 132, rows: 42 }, ioctlApplied: true, queriedWindowMatched: true, productionCommandObserved: true, postResizeOutputObserved: true, transcriptSha256: "7".repeat(64), transcriptBytes: 512 } }];
  }
}
