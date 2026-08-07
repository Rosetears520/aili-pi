import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { readAiliCompactCandidateBinding } from "../../scripts/aili-compact-release-evidence.js";
import { registerAiliCompact } from "../../src/runtime/aili-compact/index.js";
import { sourceDigest } from "../../src/runtime/aili-compact/contracts.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { buildV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";

const REPORT_PATH = join(process.cwd(), "artifacts", "test-results", "aili-compact-fake-provider.json");
const RAW_SENTINEL = "FAKE_PROVIDER_RAW_BODY_SENTINEL_9281";
const QUALITY_SECRET = "PRIVATE-BLOCKER-BODY-7291";
const SUFFIX_MARKER = "AILI Compact provider-only guidance";
const RAW_FILLER_CHARS = 80_000;
const T1_SUMMARY_CHARS = 8_000;
const T2_SUMMARY_CHARS = 3_500;
const T3_SUMMARY_CHARS = 100;
const TAIL_ADVANCE_CHARS = 9_000;
const HIERARCHY_RECENT_PARTS = 7;

type Handler = (event: any, context: any) => any;
type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };
type RegisteredCommand = (args: string, context: any) => Promise<void>;

type RuntimeHarness = ReturnType<typeof extensionHarness>;

describe("AILI Compact registered fake-provider end-to-end matrix", () => {
  it("proves state contracts without credentials and keeps live overflow explicitly Unverified", async () => {
    const project = mkdtempSync(join(tmpdir(), "aili-compact-fake-provider-"));
    try {
      writeDefaultProjectConfig(project);

      const suffixEvidence = await proveExactRangeAndTransientSuffix(project);
      const hierarchy = await buildRegisteredTierHierarchy(project);
      const checkpointEvidence = proveCheckpointCoverageAndGap(hierarchy);
      const replayEvidence = await proveReloadForkDecompressRecompress(project, hierarchy);
      const faultEvidence = await proveQualityAndStaleFaults(project, hierarchy);
      const calibrationEvidence = await proveCalibrationInvalidation(project, hierarchy);
      const stormEvidence = await proveStormGuardAndInterruptedReload(project);
      const indexFallbackEvidence = await proveCorruptIndexExactFallback(project);
      const legacyUpgradeEvidence = await proveExplicitLegacyUpgrade(project);

      const durableSession = JSON.stringify(hierarchy.entries);
      expect(durableSession).not.toContain(SUFFIX_MARKER);
      expect(durableSession).not.toContain("aili-compact-provider-suffix");
      const migrationOutput = JSON.stringify(structuredClone(hierarchy.entries));
      expect(migrationOutput).not.toContain(SUFFIX_MARKER);
      expect(migrationOutput).not.toContain("aili-compact-provider-suffix");

      const candidateBinding = await readAiliCompactCandidateBinding(process.cwd());
      const report = {
        schema: "aili.compact.fake-provider-evidence.v1",
        verdict: "PASS",
        ...candidateBinding,
        scope: "registered-extension-state-contracts-only",
        sanitized: true,
        credentialsUsed: false,
        networkUsed: false,
        verification: {
          command: "npm test -- --run tests/integration/aili-compact-fake-provider.test.ts",
          testFiles: 1,
          tests: 1,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        rows: {
          exactSafeRangeAndSuffix: { status: "PASS", ...suffixEvidence },
          registeredT1ToT3: {
            status: "PASS",
            t1Count: hierarchy.t1.length,
            t2Count: hierarchy.t2.length,
            t3Count: 1,
            maximalTiers: checkpointEvidence.maximalTiers,
            structuralLineage: true,
            textualLineageRequired: false,
            fixtureChars: {
              rawFillerPerT1: RAW_FILLER_CHARS,
              t1Summary: T1_SUMMARY_CHARS,
              t2Summary: T2_SUMMARY_CHARS,
              t3Summary: T3_SUMMARY_CHARS,
              tailAdvance: TAIL_ADVANCE_CHARS,
              hierarchyRecentTail: TAIL_ADVANCE_CHARS * HIERARCHY_RECENT_PARTS,
            },
            fixtureUtf8Bytes: {
              rawSourcePerT1: Buffer.byteLength(rawBody(1), "utf8"),
              t1Summary: Buffer.byteLength(t1Summary(1), "utf8"),
              t2Summary: Buffer.byteLength(aggregateSummary("t2", [t1Summary(1), t1Summary(2)], T2_SUMMARY_CHARS), "utf8"),
              t3Summary: Buffer.byteLength(aggregateSummary("t3", [t1Summary(1), t1Summary(2)], T3_SUMMARY_CHARS), "utf8"),
            },
            economicsBindings: {
              t1: hierarchy.t1.map(tokenEconomicsEvidence),
              t2: hierarchy.t2.map(tokenEconomicsEvidence),
              t3: [tokenEconomicsEvidence(hierarchy.t3)],
            },
          },
          qualityOmission: { status: "PASS", ...faultEvidence.quality },
          staleCatalog: { status: "PASS", ...faultEvidence.stale },
          reloadForkReplay: { status: "PASS", ...replayEvidence },
          checkpointCoverage: { status: "PASS", ...checkpointEvidence },
          calibrationInvalidation: { status: "PASS", ...calibrationEvidence },
          suffixNonPersistence: {
            status: "PASS",
            sessionEntries: false,
            referenceOutput: false,
            exactSearchMatches: 0,
            migrationOutput: false,
          },
          stormGuard: { status: "PASS", ...stormEvidence },
          interruptedRescueReload: {
            status: "PASS",
            stateBeforeReload: stormEvidence.interruptedStateBeforeReload,
            stateAfterReload: stormEvidence.stateAfterReload,
            fabricatedSuccessCount: stormEvidence.fabricatedSuccessCount,
          },
          corruptIndexFallback: { status: "PASS", ...indexFallbackEvidence },
          explicitLegacyUpgrade: { status: "PASS", ...legacyUpgradeEvidence },
        },
        limitations: {
          productionAgentSessionRealOverflow: {
            status: "Unverified",
            reason: "No real provider context-length failure, production retry ordering, or continued live work was exercised.",
          },
          productionCheckpointPersistenceAndContinuation: {
            status: "Unverified",
            reason: "The fake harness verified the returned checkpoint state only and did not fabricate or persist a CompactionEntry.",
          },
          providerClaims: {
            status: "Unverified",
            reason: "Fake evidence does not prove provider tokenization, summary semantics, cache hits, HTTP behavior, Pi internal ordering, or UI behavior.",
          },
        },
        sanitizer: {
          rawSourceBodiesIncluded: false,
          qualitySecretIncluded: false,
          providerSuffixContentIncluded: false,
          privatePathsIncluded: false,
        },
      } as const;
      const serialized = `${JSON.stringify(report, null, 2)}\n`;
      expect(serialized).not.toContain(RAW_SENTINEL);
      expect(serialized).not.toContain(QUALITY_SECRET);
      expect(serialized).not.toContain(SUFFIX_MARKER);
      expect(serialized).not.toContain(project);
      expect(serialized).not.toMatch(/(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,})/i);
      expect(report.limitations.productionAgentSessionRealOverflow.status).toBe("Unverified");
      mkdirSync(join(process.cwd(), "artifacts", "test-results"), { recursive: true });
      writeFileSync(REPORT_PATH, serialized, "utf8");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 120_000);
});

async function proveExactRangeAndTransientSuffix(project: string) {
  const entries = compressibleBranch("suffix", 1);
  const runtime = extensionHarness();
  const usage = { tokens: 100, contextWindow: 10_000 };
  const ctx = extensionContext(project, entries, usage);
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
  const status = await compactStatus(runtime, ctx);
  const exact = exactRange(status, "m000001");
  expect(exact).toMatchObject({ startRef: "m000001", endRef: "m000001", orderedRefs: ["m000001"] });

  // Enter PRESSURE after startup so the current cycle has not already spent its
  // one semantic attempt or escalated to checkpoint-only recovery.
  usage.tokens = 90_000;
  usage.contextWindow = 128_000;
  const projected = runtime.handlers.get("context")!({ type: "context", messages: providerMessages(entries) }, ctx);
  const suffix = projected.messages.at(-1);
  expect(suffix).toMatchObject({ role: "custom", customType: "aili-compact-provider-suffix", display: false });
  expect(suffix.content).toContain(SUFFIX_MARKER);
  expect(suffix.content).toContain(`catalog=${status.references.catalogId}`);
  expect(suffix.content).toContain("range=r000001:m000001-m000001");
  expect(JSON.stringify(entries)).not.toContain(SUFFIX_MARKER);
  expect(JSON.stringify(status.references)).not.toContain(SUFFIX_MARKER);

  const search = runtime.tools.get("aili_search_context")!;
  const searchResult = JSON.parse((await search.execute("suffix-search", { query: SUFFIX_MARKER }, undefined, undefined, ctx)).content[0].text);
  expect(searchResult.matches).toEqual([]);
  const pressureStage = /^pressure=(\S+)$/m.exec(suffix.content)?.[1] ?? "Unverified";
  return {
    safeRangeCount: status.references.safeRanges.length,
    exactRangeRefs: exact.orderedRefs,
    pressureStage,
    suffixInjected: true,
    suffixPersisted: false,
    exactSearchMatches: 0,
  };
}

async function buildRegisteredTierHierarchy(project: string) {
  const entries = compressibleBranch("hierarchy", 7);
  const runtime = extensionHarness();
  const ctx = extensionContext(project, entries, { tokens: 100, contextWindow: 128_000 });
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);

  const t1 = [] as any[];
  for (let index = 1; index <= 7; index += 1) {
    const summary = t1Summary(index);
    const topic = `Historical batch ${index}`;
    const status = await compactStatus(runtime, ctx);
    const ref = `m${String(index).padStart(6, "0")}`;
    const range = exactRange(status, ref);
    expect(range.orderedRefs).toEqual([ref]);
    const params = {
      mode: "message",
      catalogId: status.references.catalogId,
      topic,
      summaryMaxChars: Math.max(256, `[${topic}]\n${summary}`.length),
      items: [{ messageRef: ref, topic, summary }],
    };
    mutationCall(entries, `t1-call-${index}`, "aili_compact", params);
    const appendedBeforeCompact = runtime.appended.length;
    const result = await runtime.tools.get("aili_compact")!
      .execute(`t1-call-${index}`, params, undefined, undefined, ctx);
    expect(result.isError, result.content[0].text).not.toBe(true);
    expect(runtime.appended).toHaveLength(appendedBeforeCompact + 1);
    expect(result.details.contextTx).toMatchObject({
      tag: "semantic-create",
      payload: {
        tier: "T1",
        source: { kind: "messages", entryIds: [`hierarchy-source-${index}`] },
        quality: { status: expect.stringMatching(/^accepted/) },
      },
    });
    persistTransaction(runtime, entries, `t1-custom-${index}`, result.details.contextTx, `t1-result-${index}`, `t1-call-${index}`);
    t1.push(result.details.contextTx);
    if (index < 7) {
      // One ordinary post-turn message advances the protected tail. AILI's own
      // protocol messages are deliberately ignored by planning and therefore
      // cannot make a published recommendation self-expire.
      const tailContent = tailAdvanceBody(index);
      entries.push({
        id: `hierarchy-tail-advance-${index}`,
        type: "message",
        message: { role: "assistant", content: tailContent },
      });
      const appendedBeforeLifecycle = runtime.appended.length;
      runtime.handlers.get("before_agent_start")!({
        type: "before_agent_start",
        prompt: `continue ordinary work ${index}`,
        systemPrompt: "PI BASE",
        systemPromptOptions: {},
      }, ctx);
      const projected = runtime.handlers.get("context")!({
        type: "context",
        messages: providerMessages(entries),
      }, ctx);
      expect(projected.messages).toEqual(expect.any(Array));
      runtime.handlers.get("message_end")!({
        type: "message_end",
        message: {
          role: "assistant",
          content: tailContent,
          stopReason: "stop",
        },
      }, ctx);
      expect(runtime.appended).toHaveLength(appendedBeforeLifecycle);
    }
  }

  const t2a = await appendParent(runtime, entries, ctx, "t2-call-a", [t1[0], t1[1]], aggregateSummary("t2-a", [t1[0].payload.summary, t1[1].payload.summary], T2_SUMMARY_CHARS));
  const t2b = await appendParent(runtime, entries, ctx, "t2-call-b", [t1[2], t1[3]], aggregateSummary("t2-b", [t1[2].payload.summary, t1[3].payload.summary], T2_SUMMARY_CHARS));
  const t2c = await appendParent(runtime, entries, ctx, "t2-call-c", [t1[4], t1[5]], aggregateSummary("t2-c", [t1[4].payload.summary, t1[5].payload.summary], T2_SUMMARY_CHARS));
  const t3 = await appendParent(runtime, entries, ctx, "t3-call", [t2a, t2b], aggregateSummary("t3", [t2a.payload.summary, t2b.payload.summary], T3_SUMMARY_CHARS));

  const view = v3View(entries);
  expect(view.replay.diagnostics).toEqual([]);
  expect(view.replay.maximalActiveBlocks.map((block) => block.tier)).toEqual(["T3", "T2", "T1"]);
  expect(view.state.blocks.get(t3.payload.blockId)?.source).toEqual({
    kind: "blocks",
    childBlockIds: [t2a.payload.blockId, t2b.payload.blockId],
  });
  expect(t3.payload.summary).not.toContain(t2a.payload.summary);
  expect(t3.payload.summary).not.toContain(t2b.payload.summary);
  return { project, runtime, ctx, entries, t1, t2: [t2a, t2b, t2c], t3 };
}

async function appendParent(
  runtime: RuntimeHarness,
  entries: any[],
  ctx: any,
  callId: string,
  children: any[],
  summary: string,
) {
  const view = v3View(entries);
  const blockRefs = children.map((transaction) => {
    const ref = view.blockRefById.get(transaction.payload.blockId);
    if (!ref) throw new Error(`missing active child ref for ${transaction.payload.blockId}`);
    return ref;
  });
  const params = {
    mode: "blocks",
    catalogId: view.catalog.catalogId,
    topic: `Structural aggregate ${callId}`,
    summaryMaxChars: Math.max(256, summary.length),
    blockRefs,
    summary,
  };
  mutationCall(entries, callId, "aili_compact", params);
  const appendedBeforeCompact = runtime.appended.length;
  const result = await runtime.tools.get("aili_compact")!.execute(callId, params, undefined, undefined, ctx);
  expect(result.isError, result.content[0].text).not.toBe(true);
  expect(runtime.appended).toHaveLength(appendedBeforeCompact + 1);
  expect(result.details.contextTx).toMatchObject({
    tag: "semantic-create",
    payload: {
      tier: children[0].payload.tier === "T1" ? "T2" : "T3",
      source: { kind: "blocks", childBlockIds: children.map((transaction) => transaction.payload.blockId) },
      quality: { status: expect.stringMatching(/^accepted/) },
    },
  });
  persistTransaction(runtime, entries, `${callId}-custom`, result.details.contextTx, `${callId}-result`, callId);
  return result.details.contextTx;
}

function proveCheckpointCoverageAndGap(hierarchy: Awaited<ReturnType<typeof buildRegisteredTierHierarchy>>) {
  const { runtime, entries, ctx, t1, t2, t3 } = hierarchy;
  const beforeCompact = runtime.handlers.get("session_before_compact")!;
  const appendedBeforeCheckpoint = runtime.appended.length;
  const result = beforeCompact(beforeCompactEvent(entries, "hierarchy-current"), ctx);
  expect(runtime.appended).toHaveLength(appendedBeforeCheckpoint);
  expect(entries.some((entry: any) => entry.type === "compaction")).toBe(false);
  expect(result).toMatchObject({
    compaction: {
      firstKeptEntryId: "hierarchy-current",
      details: {
        ailiCompact: {
          kind: "major-gc-v3",
          blockIds: [t3.payload.blockId, t2[2].payload.blockId, t1[6].payload.blockId],
          tiers: ["T3", "T2", "T1"],
          leafCount: 7,
        },
      },
    },
  });
  expect(result.compaction.summary).toContain(`[T3 ${t3.payload.blockId}]`);
  expect(result.compaction.summary).not.toContain(`[T2 ${t2[0].payload.blockId}]`);
  expect(result.compaction.summary).not.toContain(`[T1 ${t1[0].payload.blockId}]`);

  const gapEntries = structuredClone(entries);
  gapEntries.push({ id: "uncovered-gap", type: "message", message: { role: "assistant", content: "uncovered gap" } });
  gapEntries.push({ id: "kept-after-gap", type: "message", message: { role: "user", content: "continue" } });
  const gapCtx = extensionContext(hierarchy.project, gapEntries, { tokens: 127_000, contextWindow: 128_000 });
  const gapRuntime = extensionHarness();
  gapRuntime.handlers.get("session_start")!({ type: "session_start" }, gapCtx);
  const gap = gapRuntime.handlers.get("session_before_compact")!(beforeCompactEvent(gapEntries, "kept-after-gap"), gapCtx);
  expect(gap).toBeUndefined();
  expect(gapEntries.some((entry: any) => entry.type === "compaction")).toBe(false);
  const continued = gapRuntime.handlers.get("context")!({
    type: "context",
    messages: providerMessages(gapEntries),
  }, gapCtx);
  expect(continued.messages).toEqual(expect.any(Array));
  expect(JSON.stringify(continued.messages)).toContain("uncovered gap");
  expect(gapRuntime.appended).toEqual([]);
  return {
    maximalTiers: ["T3", "T2", "T1"],
    maximalBlockCount: 3,
    coveredLeafCount: 7,
    gapReturn: "undefined",
    postFallbackContextContinued: true,
    actualNativeHostRetry: "Unverified",
    syntheticCompactionEntryUsed: false,
  };
}

async function proveReloadForkDecompressRecompress(
  project: string,
  hierarchy: Awaited<ReturnType<typeof buildRegisteredTierHierarchy>>,
) {
  const entries = structuredClone(hierarchy.entries);
  const rawNeedle = rawBody(7).slice(0, 96);
  const blockId = hierarchy.t1[6].payload.blockId;
  const reload = extensionHarness();
  const reloadCtx = extensionContext(project, entries, { tokens: 100, contextWindow: 128_000 });
  reload.handlers.get("session_start")!({ type: "session_start" }, reloadCtx);
  const projectedBefore = reload.handlers.get("context")!({ type: "context", messages: providerMessages(entries) }, reloadCtx);
  expect(JSON.stringify(projectedBefore.messages)).not.toContain(rawNeedle);

  let view = v3View(entries);
  const blockRef = view.blockRefById.get(blockId)!;
  const params = { catalogId: view.catalog.catalogId, blockRefs: [blockRef], depth: "raw" };
  mutationCall(entries, "reload-decompress", "aili_decompress", params);
  const decompressed = await reload.tools.get("aili_decompress")!
    .execute("reload-decompress", params, undefined, undefined, reloadCtx);
  expect(decompressed.isError, decompressed.content[0].text).not.toBe(true);
  persistTransaction(reload, entries, "reload-decompress-custom", decompressed.details.contextTx, "reload-decompress-result", "reload-decompress");

  const forkEntries = structuredClone(entries);
  const fork = extensionHarness();
  const forkCtx = extensionContext(project, forkEntries, { tokens: 100, contextWindow: 128_000 });
  fork.handlers.get("session_start")!({ type: "session_start" }, forkCtx);
  const restored = fork.handlers.get("context")!({ type: "context", messages: providerMessages(forkEntries) }, forkCtx);
  expect(JSON.stringify(restored.messages)).toContain(rawNeedle);

  view = v3View(forkEntries);
  const currentRef = view.blockRefById.get(blockId)!;
  await fork.commands.get("aili-compact")!(`recompress ${currentRef}`, forkCtx);
  const recompressTx = fork.appended.at(-1)?.data as any;
  expect(recompressTx).toMatchObject({
    tag: "recompress",
    payload: { rootBlockIds: [blockId], decompressionTxId: "reload-decompress", reason: "recompress" },
  });
  forkEntries.push({ id: "fork-recompress-custom", type: "custom", customType: "aili-compact", data: recompressTx });

  const reopened = extensionHarness();
  const reopenedCtx = extensionContext(project, forkEntries, { tokens: 100, contextWindow: 128_000 });
  reopened.handlers.get("session_start")!({ type: "session_start" }, reopenedCtx);
  const recompressed = reopened.handlers.get("context")!({ type: "context", messages: providerMessages(forkEntries) }, reopenedCtx);
  expect(JSON.stringify(recompressed.messages)).not.toContain(rawNeedle);
  expect(v3View(forkEntries).state.blocks.get(blockId)?.active).toBe(true);
  return {
    restartProjection: true,
    rawDecompression: true,
    forkReplay: true,
    exactRecompression: true,
    sourceIdsPreserved: true,
  };
}

async function proveQualityAndStaleFaults(
  project: string,
  hierarchy: Awaited<ReturnType<typeof buildRegisteredTierHierarchy>>,
) {
  const qualityEntries = compressibleBranch("quality", 1, `${QUALITY_SECRET} error failed must remain private ${"q".repeat(120_000)}`);
  const qualityRuntime = extensionHarness();
  const qualityCtx = extensionContext(project, qualityEntries, { tokens: 100, contextWindow: 50_000 });
  qualityRuntime.handlers.get("session_start")!({ type: "session_start" }, qualityCtx);
  const qualityStatus = await compactStatus(qualityRuntime, qualityCtx);
  expect(exactRange(qualityStatus, "m000001").orderedRefs).toEqual(["m000001"]);
  const qualityParams = {
    mode: "message",
    catalogId: qualityStatus.references.catalogId,
    topic: "Redacted quality rejection",
    items: [{ messageRef: "m000001", topic: "Redacted quality rejection", summary: "A harmless recap" }],
  };
  mutationCall(qualityEntries, "quality-omission", "aili_compact", qualityParams);
  const qualityResult = await qualityRuntime.tools.get("aili_compact")!
    .execute("quality-omission", qualityParams, undefined, undefined, qualityCtx);
  expect(qualityResult.isError).toBe(true);
  expect(qualityResult.content[0].text).toContain("quality-rejected");
  expect(qualityResult.content[0].text).toContain("missing-hard-fact");
  expect(qualityResult.content[0].text).not.toContain(QUALITY_SECRET);
  expect(qualityRuntime.appended).toEqual([]);

  const staleEntries = compressibleBranch("stale", 1);
  const staleRuntime = extensionHarness();
  const staleCtx = extensionContext(project, staleEntries, { tokens: 100, contextWindow: 50_000 });
  staleRuntime.handlers.get("session_start")!({ type: "session_start" }, staleCtx);
  const staleStatus = await compactStatus(staleRuntime, staleCtx);
  expect(exactRange(staleStatus, "m000001").orderedRefs).toEqual(["m000001"]);
  const staleTopic = "Stale catalog";
  const staleSummary = "Stale catalog recap";
  const staleParams = {
    mode: "message",
    catalogId: "0".repeat(64),
    topic: staleTopic,
    summaryMaxChars: 256,
    items: [{ messageRef: "m000001", topic: staleTopic, summary: staleSummary }],
  };
  mutationCall(staleEntries, "stale-call", "aili_compact", staleParams);
  const staleResult = await staleRuntime.tools.get("aili_compact")!
    .execute("stale-call", staleParams, undefined, undefined, staleCtx);
  expect(staleStatus.references.catalogId).not.toBe(staleParams.catalogId);
  expect(staleResult.isError).toBe(true);
  const staleFailure = JSON.parse(staleResult.content[0].text);
  expect(staleFailure).toMatchObject({
    code: "source-summary-scope-mismatch",
    freshRanges: [{ startRef: "m000001", endRef: "m000001" }],
  });
  expect(staleRuntime.appended).toEqual([]);

  const staleCatalogEntries = structuredClone(hierarchy.entries);
  const staleCatalogRuntime = extensionHarness();
  const staleCatalogCtx = extensionContext(project, staleCatalogEntries, { tokens: 100, contextWindow: 128_000 });
  staleCatalogRuntime.handlers.get("session_start")!({ type: "session_start" }, staleCatalogCtx);
  const staleCatalogView = v3View(staleCatalogEntries);
  const staleBlockRef = staleCatalogView.blockRefById.get(hierarchy.t3.payload.blockId)!;
  const staleCatalogParams = { catalogId: "0".repeat(64), blockRefs: [staleBlockRef], depth: "raw" };
  mutationCall(staleCatalogEntries, "stale-catalog-decompress", "aili_decompress", staleCatalogParams);
  const staleCatalogResult = await staleCatalogRuntime.tools.get("aili_decompress")!
    .execute("stale-catalog-decompress", staleCatalogParams, undefined, undefined, staleCatalogCtx);
  expect(staleCatalogResult.isError).toBe(true);
  expect(JSON.parse(staleCatalogResult.content[0].text)).toMatchObject({ code: "stale-catalog" });
  expect(staleCatalogRuntime.appended).toEqual([]);

  return {
    quality: { rejectedBeforeAppend: true, outputRedacted: true, code: "missing-hard-fact" },
    stale: {
      injectedFaults: ["message-scope-stale-catalog", "block-operation-stale-catalog"],
      messageScopeReturnedError: "source-summary-scope-mismatch",
      blockOperationReturnedError: "stale-catalog",
      boundedFreshRangeCount: staleFailure.freshRanges.length,
      partialMutationCount: 0,
      mutationFailClosed: true,
    },
  };
}

async function proveCalibrationInvalidation(
  project: string,
  hierarchy: Awaited<ReturnType<typeof buildRegisteredTierHierarchy>>,
) {
  const entries = structuredClone(hierarchy.entries);
  const runtime = extensionHarness();
  const ctx = extensionContext(project, entries, { tokens: 100, contextWindow: 128_000 });
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
  const beforeView = v3View(entries);
  const beforeLineage = lineageShape(beforeView);
  runtime.handlers.get("context")!({ type: "context", messages: providerMessages(entries) }, ctx);
  runtime.handlers.get("message_end")!({
    type: "message_end",
    message: { role: "assistant", content: "settled", stopReason: "stop", usage: { input: 100_000, output: 10, cacheRead: 0, cacheWrite: 0 } },
  }, ctx);
  const first = await compactStatus(runtime, ctx);
  expect(first.tokenCalibration).toMatchObject({ providerId: "openai", modelId: "gpt-4.1", sampleCount: 1 });

  ctx.model = fakeModel("anthropic", "claude-fake", "anthropic-messages");
  const changedProjection = runtime.handlers.get("context")!({ type: "context", messages: providerMessages(entries) }, ctx);
  const second = await compactStatus(runtime, ctx);
  expect(second.tokenCalibration).toMatchObject({ providerId: "anthropic", modelId: "claude-fake", sampleCount: 0 });
  expect(JSON.stringify(changedProjection.messages)).toContain(hierarchy.t3.payload.summary.slice(0, 128));
  expect(lineageShape(v3View(entries))).toEqual(beforeLineage);
  return {
    priorIdentity: "openai/gpt-4.1/aili.token-bounds.v1",
    nextIdentity: "anthropic/claude-fake/aili.token-bounds.v1",
    priorSamples: 1,
    nextSamples: 0,
    replayPreserved: true,
    lineagePreserved: true,
  };
}

async function proveStormGuardAndInterruptedReload(project: string) {
  const entries = compressibleBranch("storm", 1);
  const runtime = extensionHarness();
  const ctx = extensionContext(project, entries, { tokens: 99_000, contextWindow: 100_000 });
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
  for (let index = 0; index < 8; index += 1) {
    runtime.handlers.get("agent_settled")!({ type: "agent_settled" }, ctx);
  }
  expect(ctx.compactCalls).toHaveLength(1);
  expect(runtime.appended).toEqual([]);
  const interrupted = await compactStatus(runtime, ctx);
  expect(interrupted.checkpointCoordinatorState).not.toBe("idle");
  expect(interrupted.deterministicCheckpointCount).toBe(0);

  // Simulate a process/session reload while the host callback is lost. Runtime
  // coordinator state is intentionally non-durable and must not fabricate a
  // completed checkpoint when the same immutable branch is reopened.
  const reopened = extensionHarness();
  const reopenedCtx = extensionContext(project, entries, { tokens: 100, contextWindow: 100_000 });
  reopened.handlers.get("session_start")!({ type: "session_start" }, reopenedCtx);
  const afterReload = await compactStatus(reopened, reopenedCtx);
  expect(afterReload.checkpointCoordinatorState).toBe("idle");
  expect(afterReload.checkpointInFlight).toBe(false);
  expect(afterReload.deterministicCheckpointCount).toBe(0);
  expect(afterReload.rescueCount).toBe(0);
  return {
    repeatedHighPressureEvents: 8,
    checkpointInvocations: 1,
    semanticTransactions: 0,
    duplicateCheckpointInvocations: 0,
    interruptedStateBeforeReload: interrupted.checkpointCoordinatorState,
    stateAfterReload: "idle",
    fabricatedSuccessCount: 0,
  };
}

async function proveCorruptIndexExactFallback(project: string) {
  const entries = compressibleBranch("index-fallback", 1);
  const runtime = extensionHarness();
  const ctx = extensionContext(project, entries, { tokens: 100, contextWindow: 128_000 });
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);

  // The append claims an ancestry that cannot follow the indexed tip. The
  // registered context path must reject the corrupt index update and return the
  // exact provider message array rather than a partially projected variant.
  entries.push({
    id: "index-corrupt-append",
    parentId: "not-the-indexed-tip",
    type: "message",
    message: { role: "assistant", content: "corrupt ancestry sentinel" },
  });
  const messages = providerMessages(entries);
  const result = runtime.handlers.get("context")!({ type: "context", messages }, ctx);
  expect(result.messages).toBe(messages);
  expect(runtime.appended).toEqual([]);
  expect(ctx.statuses.at(-1)).toMatch(/WARN|index|ancestry|parent|tip/i);
  return {
    injectedFault: "append-parent-mismatch",
    exactInputArrayReturned: true,
    partialProjection: false,
    partialMutationCount: 0,
  };
}

async function proveExplicitLegacyUpgrade(project: string) {
  const schemas = ["aili.compact.tx.v1", "aili.compact.tx.v2"] as const;
  const upgraded: Array<{ schema: string; legacyBlockId: string; v3BlockId: string }> = [];
  for (const schema of schemas) {
    const suffix = schema.endsWith("v1") ? "v1" : "v2";
    const entries = legacyUpgradeBranch(suffix, schema);
    const runtime = extensionHarness();
    const ctx = extensionContext(project, entries, { tokens: 100, contextWindow: 50_000 });
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    let view = v3View(entries);
    const legacyBlockId = `legacy-${suffix}-block`;
    const legacyRef = view.blockRefById.get(legacyBlockId)!;
    expect(view.blockByRef.get(legacyRef)?.family).toBe("legacy");

    const decompressParams = { catalogId: view.catalog.catalogId, blockRefs: [legacyRef], depth: "raw" };
    mutationCall(entries, `legacy-${suffix}-decompress`, "aili_decompress", decompressParams);
    const decompressed = await runtime.tools.get("aili_decompress")!
      .execute(`legacy-${suffix}-decompress`, decompressParams, undefined, undefined, ctx);
    expect(decompressed.isError, decompressed.content[0].text).not.toBe(true);
    expect(decompressed.details.contextTx).toMatchObject({ kind: "decompress", deactivateBlockIds: [legacyBlockId] });
    expect(runtime.appended).toEqual([]);
    entries.push(successfulResult(
      `legacy-${suffix}-decompress-result`,
      decompressed.details.contextTx,
      `legacy-${suffix}-decompress`,
      "aili_decompress",
    ));
    expect(reduceCompactState(entries).blocks.get(legacyBlockId)?.active).toBe(false);

    // Re-open the registered extension over the persisted session entries.
    // This is the host boundary that proves the explicit legacy decompression
    // survives replay before the exact raw source is offered for v3 creation.
    const reopened = extensionHarness();
    const reopenedCtx = extensionContext(project, entries, { tokens: 100, contextWindow: 50_000 });
    reopened.handlers.get("session_start")!({ type: "session_start" }, reopenedCtx);
    reopened.handlers.get("before_agent_start")!({
      type: "before_agent_start",
      prompt: `continue explicit ${suffix} upgrade`,
      systemPrompt: "PI BASE",
      systemPromptOptions: {},
    }, reopenedCtx);
    reopened.handlers.get("context")!({ type: "context", messages: providerMessages(entries) }, reopenedCtx);

    const status = await compactStatus(reopened, reopenedCtx);
    const exact = exactRange(status, "m000001");
    expect(exact.orderedRefs).toEqual(["m000001"]);
    const topic = `Explicit ${suffix} upgrade`;
    const summary = t1Summary(suffix === "v1" ? 101 : 102);
    const params = {
      mode: "message",
      catalogId: status.references.catalogId,
      topic,
      summaryMaxChars: Math.max(256, `[${topic}]\n${summary}`.length),
      items: [{ messageRef: "m000001", topic, summary }],
    };
    mutationCall(entries, `legacy-${suffix}-v3-create`, "aili_compact", params);
    const compacted = await reopened.tools.get("aili_compact")!
      .execute(`legacy-${suffix}-v3-create`, params, undefined, undefined, reopenedCtx);
    expect(compacted.isError, compacted.content[0].text).not.toBe(true);
    expect(compacted.details.contextTx).toMatchObject({
      tag: "semantic-create",
      payload: {
        tier: "T1",
        source: { kind: "messages", entryIds: [`legacy-${suffix}-source`] },
      },
    });
    expect(JSON.stringify(compacted.details.contextTx.payload.source)).not.toContain(legacyBlockId);
    persistTransaction(
      reopened,
      entries,
      `legacy-${suffix}-v3-custom`,
      compacted.details.contextTx,
      `legacy-${suffix}-v3-result`,
      `legacy-${suffix}-v3-create`,
    );
    view = v3View(entries);
    expect(view.replay.diagnostics).toEqual([]);
    expect([...view.state.blocks.values()].flatMap((block) => block.source.kind === "blocks" ? block.source.childBlockIds : []))
      .not.toContain(legacyBlockId);
    upgraded.push({ schema, legacyBlockId, v3BlockId: compacted.details.contextTx.payload.blockId });
  }
  return {
    schemas: upgraded.map(({ schema }) => schema),
    explicitDecompressionCount: upgraded.length,
    reloadBeforeExactRawCount: upgraded.length,
    exactRawT1Count: upgraded.length,
    directLegacyChildCount: 0,
  };
}

function extensionHarness() {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, Handler>();
  const appended: Array<{ customType: string; data: any }> = [];
  registerAiliCompact({
    registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); },
    registerCommand(name: string, command: { handler: RegisteredCommand }) { commands.set(name, command.handler); },
    on(event: string, handler: Handler) { handlers.set(event, handler); },
    appendEntry(customType: string, data: any) { appended.push({ customType, data }); },
    sendUserMessage() {},
    getAllTools() { return [...tools.values()].map((tool) => ({ name: tool.name, description: tool.name, parameters: {} })); },
    getActiveTools() { return [...tools.keys()]; },
  } as unknown as ExtensionAPI);
  return { tools, commands, handlers, appended };
}

function extensionContext(
  project: string,
  entries: any[],
  usage: { tokens: number; contextWindow: number },
) {
  const statuses: string[] = [];
  const notifications: string[] = [];
  const compactCalls: Array<{ onComplete?: (result?: unknown) => void; onError?: (error: Error) => void }> = [];
  return {
    cwd: project,
    model: fakeModel("openai", "gpt-4.1", "openai-responses"),
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => usage,
    compact(options: { onComplete?: (result?: unknown) => void; onError?: (error: Error) => void } = {}) { compactCalls.push(options); },
    sessionManager: {
      getSessionId: () => "fake-provider-session",
      getSessionFile: () => undefined,
      getLeafId: () => entries.at(-1)?.id ?? null,
      getBranch: () => entries,
    },
    ui: {
      setStatus(_key: string, value: string) { statuses.push(value); },
      setWidget() {},
      notify(value: string) { notifications.push(value); },
    },
    statuses,
    notifications,
    compactCalls,
  };
}

function fakeModel(provider: string, id: string, api: string) {
  return {
    provider,
    id,
    api,
    name: "Credential-free deterministic provider fixture",
    baseUrl: "https://fixture.invalid",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };
}

function compressibleBranch(prefix: string, sourceCount: number, firstBody?: string): any[] {
  if (!Number.isSafeInteger(sourceCount) || sourceCount < 1 || sourceCount > 8) throw new Error("invalid fake source count");
  const sources = Array.from({ length: sourceCount }, (_, index) => ({
    id: `${prefix}-source-${index + 1}`,
    type: "message",
    message: { role: "assistant", content: index === 0 && firstBody !== undefined ? firstBody : rawBody(index + 1) },
  }));
  const recentFillers = Array.from({ length: 8 - sourceCount }, (_, index) => ({
    id: `${prefix}-recent-${index + 1}`,
    type: "message",
    message: {
      role: "assistant",
      content: prefix === "hierarchy"
        ? Array.from({ length: HIERARCHY_RECENT_PARTS }, (_, part) => tailAdvanceBody(100 + part)).join("")
        : `recent protected filler ${index + 1} ${"f".repeat(5_000)}`,
    },
  }));
  return [
    ...sources,
    { id: `${prefix}-current`, type: "message", message: { role: "user", content: "continue with the current request" } },
    ...recentFillers,
  ];
}

function legacyUpgradeBranch(
  suffix: "v1" | "v2",
  schema: "aili.compact.tx.v1" | "aili.compact.tx.v2",
): any[] {
  const source = {
    id: `legacy-${suffix}-source`,
    type: "message",
    message: { role: "assistant", content: rawBody(suffix === "v1" ? 201 : 202) },
  };
  const entries: any[] = [
    source,
    {
      id: `legacy-${suffix}-task-call`,
      type: "message",
      message: { role: "assistant", content: [{ type: "toolCall", id: `legacy-${suffix}-task`, name: "task", arguments: { task: "boundary" } }] },
    },
    {
      id: `legacy-${suffix}-task-result`,
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: `legacy-${suffix}-task`,
        toolName: "task",
        content: "protected task boundary",
        details: { status: "accepted", agentId: `legacy-${suffix}-agent`, jobId: `legacy-${suffix}-job` },
      },
    },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `legacy-${suffix}-tail-${index + 1}`,
      type: "message",
      message: { role: "assistant", content: `recent tail ${index + 1} ${"t".repeat(5_000)}` },
    })),
    { id: `legacy-${suffix}-current`, type: "message", message: { role: "user", content: "continue after legacy history" } },
  ];
  const blockId = `legacy-${suffix}-block`;
  const block = {
    id: blockId,
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [source.id],
    sourceDigest: sourceDigest(entries, [source.id]),
    summary: `Legacy ${suffix} recap.`,
    active: true,
    ...(schema === "aili.compact.tx.v2" ? {
      mode: "message",
      topic: `Legacy ${suffix}`,
      batchTopic: `Legacy ${suffix}`,
      anchorEntryId: source.id,
      runId: `legacy-${suffix}-run`,
      childBlockIds: [],
      generation: "young",
      survivedCount: 0,
      age: 0,
    } : {}),
  };
  const transaction = {
    schema,
    id: `legacy-${suffix}-create`,
    kind: "compact",
    epochId: "root",
    blocks: [block],
  };
  mutationCall(entries, `legacy-${suffix}-create`, "aili_compact", {});
  entries.push(successfulResult(
    `legacy-${suffix}-create-result`,
    transaction,
    `legacy-${suffix}-create`,
    "aili_compact",
  ));
  return entries;
}

function rawBody(index: number): string {
  return `${RAW_SENTINEL}-${index}-${"源".repeat(RAW_FILLER_CHARS)}`;
}

function t1Summary(index: number): string {
  return (`retained historical batch ${index} ${"史".repeat(T1_SUMMARY_CHARS)}`).slice(0, T1_SUMMARY_CHARS);
}

function tailAdvanceBody(index: number): string {
  const variedTokens = Array.from(
    { length: 1_500 },
    (_, offset) => `tail_${index}_${offset.toString(36)}_qz`,
  ).join(" ");
  return (`ordinary continued work ${index} ${variedTokens}`).slice(0, TAIL_ADVANCE_CHARS);
}

function tokenEconomicsEvidence(transaction: any) {
  const tokens = transaction.payload.tokens;
  return {
    tier: transaction.payload.tier,
    estimatorVersion: tokens.estimatorVersion,
    providerId: tokens.providerId,
    modelId: tokens.modelId,
    sourceTokensLower: tokens.sourceTokensLower,
    sourceTokensUpper: tokens.sourceTokensUpper,
    replacementTokensUpper: tokens.replacementTokensUpper,
    steadySavingsTokensLower: tokens.steadySavingsTokensLower,
    breakEvenTurnsUpper: tokens.breakEvenTurnsUpper,
    savingsRatio: tokens.savingsRatio,
    summaryTokensUpper: tokens.summaryTokensUpper,
  };
}

function aggregateSummary(label: string, childSummaries: string[], length: number): string {
  const anchors = childSummaries.map((summary) => summary.slice(0, 512)).join("\n");
  return (`${anchors}\n${label} ${"a".repeat(length)}`).slice(0, length);
}

function mutationCall(entries: any[], id: string, name: "aili_compact" | "aili_decompress", args: Record<string, unknown>) {
  entries.push({
    id: `assistant:${id}`,
    type: "message",
    message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] },
  });
}

function persistTransaction(
  runtime: RuntimeHarness,
  entries: any[],
  customEntryId: string,
  transaction: any,
  resultEntryId: string,
  toolCallId: string,
) {
  expect(runtime.appended.at(-1)).toMatchObject({ customType: "aili-compact", data: transaction });
  entries.push({ id: customEntryId, type: "custom", customType: "aili-compact", data: transaction });
  entries.push(successfulResult(resultEntryId, transaction, toolCallId));
}

function successfulResult(
  id: string,
  transaction: any,
  toolCallId: string,
  explicitToolName?: "aili_compact" | "aili_decompress",
) {
  const toolName = explicitToolName
    ?? (transaction.tag === "decompress" || transaction.kind === "decompress" ? "aili_decompress" : "aili_compact");
  return {
    id,
    type: "message",
    message: {
      role: "toolResult",
      toolCallId,
      toolName,
      content: [],
      isError: false,
      details: { contextTx: transaction },
    },
  };
}

async function compactStatus(runtime: RuntimeHarness, ctx: any) {
  const result = await runtime.tools.get("aili_compact_status")!.execute("status", {}, undefined, undefined, ctx);
  return JSON.parse(result.content[0].text);
}

function exactRange(status: any, ref: string) {
  const range = status.references.safeRanges.find((candidate: any) => candidate.orderedRefs.includes(ref));
  if (!range) throw new Error(`missing exact safe range for ${ref}: ${JSON.stringify(status.references.safeRangeDiagnostics)}`);
  return range;
}

function providerMessages(entries: any[]) {
  return entries.filter((entry) => entry.type === "message").map((entry) => entry.message);
}

function v3View(entries: any[]) {
  return buildV3RuntimeView(entries, reduceCompactState(entries), { sessionId: "fake-provider-session" });
}

function beforeCompactEvent(entries: any[], firstKeptEntryId: string) {
  return {
    type: "session_before_compact",
    reason: "threshold",
    willRetry: false,
    branchEntries: entries,
    preparation: {
      firstKeptEntryId,
      tokensBefore: 120_000,
      messagesToSummarize: [],
      turnPrefixMessages: [],
    },
    signal: new AbortController().signal,
  };
}

function lineageShape(view: ReturnType<typeof v3View>) {
  return [...view.state.blocks.values()].map((block) => ({
    id: block.blockId,
    tier: block.tier,
    source: block.source,
    leafDigest: block.leafDigest,
    leafCount: block.leafCount,
  }));
}

function writeDefaultProjectConfig(project: string) {
  mkdirSync(join(project, ".pi"), { recursive: true });
  writeFileSync(join(project, ".pi", "aili-compact.jsonc"), JSON.stringify({
    enabled: true,
    manualMode: false,
    compress: { summaryHardMaxChars: 12_000 },
    planning: { enabled: true },
    quality: { enabled: true, warningPolicy: "record" },
    providerSuffix: { enabled: true },
    checkpoint: { autoRescue: true, deterministic: true },
    protection: {
      preserveRecentAtoms: 8,
      preserveRecentTokens: 12_000,
      preserveRecentTokenCapRatio: 0.10,
    },
  }), "utf8");
}
