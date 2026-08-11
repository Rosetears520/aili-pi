import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { readAiliCompactCandidateBinding } from "../../scripts/aili-compact-release-evidence.js";
import { AILI_COMPACT_ENTRY, digest } from "../../src/runtime/aili-compact/contracts.js";
import { registerAiliCompact } from "../../src/runtime/aili-compact/index.js";
import { classifyTransparentPromotionGaps } from "../../src/runtime/aili-compact/promotion-gaps.js";
import { QUALITY_EVALUATOR_VERSION } from "../../src/runtime/aili-compact/quality.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { TOKEN_ESTIMATOR_VERSION } from "../../src/runtime/aili-compact/safe-planning.js";
import { planV3BlockMutation, v3BlockSourceDigest } from "../../src/runtime/aili-compact/v3-mutations.js";
import { buildV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import { AILI_COMPACT_SCHEMA_V3, applyV3Transaction, v3MessageLeafDigest, v3SummaryDigest } from "../../src/runtime/aili-compact/v3.js";

const REPORT_PATH = join(process.cwd(), "artifacts", "test-results", "aili-compact-fake-provider.json");
const RAW_SENTINEL = "FAKE_PROVIDER_RAW_BODY_SENTINEL_9281";
const QUALITY_SECRET = "PRIVATE-BLOCKER-BODY-7291";
const SUFFIX_MARKER = "AILI Compact provider-only guidance";
const RAW_FILLER_CHARS = 2_000;
const ACTIVE_SUMMARY_CHARS = 3_000;
const COMPOSITION_SUMMARY_CHARS = 1_200;
const FRONTIER_ACTIVE_BLOCKS = 33;

type Handler = (event: any, context: any) => any;
type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };
type RegisteredCommand = (args: string, context: any) => Promise<void>;
type RuntimeHarness = ReturnType<typeof extensionHarness>;

type AttestedFixture = {
  project: string;
  entries: any[];
  childBlockIds: string[];
  parentBlockId: string;
  attestedGapMessageCount: number;
  rejectedProtocolKinds: string[];
};

describe("AILI Compact registered fake-provider active-block matrix", () => {
  it("proves local active-block contracts without credentials, network, or provider execution", async () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-fake-provider-"));
    try {
      const suffixProject = join(root, "suffix");
      writeProjectConfig(suffixProject, false);
      const suffixEvidence = await proveExactRangeAndTransientSuffix(suffixProject);

      const activeProject = join(root, "attested-active-blocks");
      writeProjectConfig(activeProject, false, false);
      const attested = await proveClosedAttestedTierlessReplacement(activeProject);

      const selectionEvidence = await proveTwoToSixteenSelectionAndLegacyRead(root);
      const legacyEvidence = await proveLegacyTierReadCompatibility(root);

      const frontierProject = join(root, "frontier");
      writeProjectConfig(frontierProject, false);
      const frontierEvidence = await proveBoundedProviderFrontierNoRawLeak(frontierProject);

      const faultEvidence = await proveQualityAndStaleFaults(root, attested);

      const stormProject = join(root, "storm");
      writeProjectConfig(stormProject, false);
      const stormEvidence = await proveStormGuardAndInterruptedReload(stormProject);

      const corruptProject = join(root, "corrupt-index");
      writeProjectConfig(corruptProject, false);
      const indexFallbackEvidence = await proveCorruptIndexExactFallback(corruptProject);

      const durableSession = JSON.stringify(attested.entries);
      expect(durableSession).not.toContain(SUFFIX_MARKER);
      expect(durableSession).not.toContain("aili-compact-provider-suffix");

      const candidateBinding = await readAiliCompactCandidateBinding(process.cwd());
      const attestedEvidence = {
        sourceBackedTierless: true,
        exactTransactionAttestation: true,
        atomicReplacement: true,
        attestedGapMessageCount: attested.attestedGapMessageCount,
        rejectedProtocolKinds: attested.rejectedProtocolKinds,
      };
      const report = {
        schema: "aili.compact.fake-provider-evidence.v1",
        verdict: "PASS",
        ...candidateBinding,
        scope: "registered-fake-provider-active-block-contracts-only",
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
        rows: [
          { id: "closed-handler-envelopes", status: "PASS", ...attestedEvidence },
          { id: "source-backed-tierless-selection", status: "PASS", ...selectionEvidence },
          { id: "legacy-tier-read-compatibility", status: "PASS", ...legacyEvidence },
          { id: "bounded-provider-frontier", status: "PASS", ...frontierEvidence },
          { id: "suffix-non-persistence", status: "PASS", ...suffixEvidence },
          { id: "quality-and-stale-negative-cases", status: "PASS", ...faultEvidence },
          { id: "storm-guard-and-interrupted-reload", status: "PASS", ...stormEvidence },
          { id: "corrupt-index-fail-closed", status: "PASS", ...indexFallbackEvidence },
        ],
        limitations: {
          productionAgentSessionRealOverflow: {
            status: "Unverified",
            reason: "No real provider context-length failure, production retry ordering, or continued live work was exercised.",
          },
          providerClaims: {
            status: "Unverified",
            reason: "Fake evidence does not prove provider tokenization, HTTP behavior, Pi internal ordering, or UI behavior.",
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
      expect(serialized).not.toContain(root);
      expect(serialized).not.toMatch(/(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,})/i);
      expect(report.limitations.productionAgentSessionRealOverflow.status).toBe("Unverified");
      mkdirSync(join(process.cwd(), "artifacts", "test-results"), { recursive: true });
      writeFileSync(REPORT_PATH, serialized, "utf8");
    } finally {
      rmSync(root, { recursive: true, force: true });
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

async function proveClosedAttestedTierlessReplacement(project: string): Promise<AttestedFixture> {
  const entries: any[] = [];
  appendMessage(entries, "active-root-request", "user", "continue with the current request");
  const firstSourceId = "active-source-one";
  appendMessage(entries, firstSourceId, "assistant", rawBody(1));
  const seededFirst = appendSeedActiveBlock(entries, "active-seeded-one", firstSourceId, 1);
  expect(seededFirst.payload).not.toHaveProperty("tier");

  const runtime = extensionHarness();
  const ctx = extensionContext(project, entries, { tokens: 100, contextWindow: 128_000 });
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);

  await invokeStatus(runtime, ctx, entries, "active-gap-status", true);
  const gapRejection = await invokeCompact(runtime, ctx, entries, "active-gap-rejection", invalidBlockParams("attested gap rejection"));
  expect(gapRejection.result.isError).toBe(true);
  assertClosedCompactEnvelope(gapRejection.result, "active-gap-rejection", "rejected");
  persistReturnedToolResult(entries, "active-gap-rejection", "aili_compact", gapRejection.result);

  const secondSourceId = "active-source-two";
  appendMessage(entries, secondSourceId, "assistant", rawBody(2));
  appendMessage(entries, "active-current", "user", "continue after the attested planning gap");
  for (let index = 0; index < 16; index += 1) {
    appendMessage(entries, `active-recent-${index + 1}`, "assistant", `recent protected filler ${index + 1} ${"f".repeat(5_000)}`);
  }
  const seededSecond = appendSeedActiveBlock(entries, "active-seeded-two", secondSourceId, 2);
  expect(seededSecond.payload).not.toHaveProperty("tier");
  const seededView = v3View(entries);
  if (!seededView.state.blocks.has(seededFirst.payload.blockId) || !seededView.state.blocks.has(seededSecond.payload.blockId)) {
    throw new Error(`seeded active blocks were not replayed: ${JSON.stringify(seededView.replay.diagnostics)}`);
  }

  const preCompositionEntries = structuredClone(entries);
  const childBlockIds = [seededFirst.payload.blockId, seededSecond.payload.blockId];
  const validProof = classifyCurrentPromotionGap(preCompositionEntries, childBlockIds, seededView);
  expect(validProof.ok).toBe(true);
  if (!validProof.ok) throw new Error(`expected handler-attested gap: ${validProof.reason}`);
  expect(validProof.proofs).toHaveLength(1);
  expect(validProof.proofs[0]!.messageCount).toBeGreaterThan(0);

  const firstStatusResultId = "active-gap-status:result";
  const firstStatusCallId = "active-gap-status";
  const rejectedProtocolKinds = ["name-shaped", "permission-denied", "unknown", "mixed"];
  const nameShaped = structuredClone(preCompositionEntries);
  toolResultEntry(nameShaped, firstStatusResultId).message.content = "{}";
  expect(classifyCurrentPromotionGap(nameShaped, childBlockIds, seededView).ok).toBe(false);

  const permissionDenied = structuredClone(preCompositionEntries);
  const denied = toolResultEntry(permissionDenied, firstStatusResultId).message;
  denied.isError = true;
  denied.content = "permission denied";
  expect(classifyCurrentPromotionGap(permissionDenied, childBlockIds, seededView).ok).toBe(false);

  const unknown = structuredClone(preCompositionEntries);
  toolCallEntry(unknown, firstStatusCallId).message.content[0].name = "foreign_planning_tool";
  toolResultEntry(unknown, firstStatusResultId).message.toolName = "foreign_planning_tool";
  expect(classifyCurrentPromotionGap(unknown, childBlockIds, seededView).ok).toBe(false);

  const mixed = structuredClone(preCompositionEntries);
  toolCallEntry(mixed, firstStatusCallId).message.content.push({
    type: "toolCall", id: "mixed-sibling", name: "aili_compact_status", arguments: {},
  });
  expect(classifyCurrentPromotionGap(mixed, childBlockIds, seededView).ok).toBe(false);

  const compositionStatus = await invokeStatus(runtime, ctx, entries, "active-compose-status", true);
  const activeGroup = activeGroups(compositionStatus.result).find((group) => group.blockRefs.length === 2);
  expect(activeGroup).toBeDefined();
  const selectedRefs = activeGroup!.blockRefs;
  const selectedBefore = v3View(entries);
  const selectedIds = selectedRefs.map((ref) => selectedBefore.blockByRef.get(ref)?.blockId);
  expect(selectedIds).toEqual(childBlockIds);
  expect(selectedIds.every((id) => selectedBefore.state.blocks.get(id!)?.active === true)).toBe(true);

  const appendedBefore = runtime.appended.length;
  const composed = await invokeCompact(runtime, ctx, entries, "active-compose", blockParams(compositionStatus.result, selectedRefs, "attested active replacement"));
  expect(composed.result.isError, textOf(composed.result.content)).not.toBe(true);
  const composedEnvelope = assertClosedCompactEnvelope(composed.result, "active-compose", "success");
  expect(runtime.appended).toHaveLength(appendedBefore + 1);
  expect(composedEnvelope.transaction).toMatchObject({
    tag: "semantic-create",
    payload: { source: { kind: "blocks", childBlockIds }, quality: { override: "quality-disabled" } },
  });
  expect(composedEnvelope.transaction.payload).not.toHaveProperty("tier");
  expect(v3View(entries).state.blocks.get(childBlockIds[0]!)?.active).toBe(true);

  persistAcceptedCompact(entries, "active-compose", composed.result, composedEnvelope);
  const composedView = v3View(entries);
  const parentBlockId = composedEnvelope.transaction.payload.blockId;
  const parent = composedView.state.blocks.get(parentBlockId);
  expect(composedView.replay.diagnostics).toEqual([]);
  expect(composedView.state.blocks.get(childBlockIds[0]!)?.active).toBe(false);
  expect(composedView.state.blocks.get(childBlockIds[1]!)?.active).toBe(false);
  expect(parent).toMatchObject({ active: true, leafCount: 2, source: { kind: "blocks", childBlockIds } });
  expect(parent).not.toHaveProperty("tier");

  const malformed = await invokeCompact(runtime, ctx, entries, "active-malformed-rejection", invalidBlockParams("closed rejection"));
  expect(malformed.result.isError).toBe(true);
  const malformedEnvelope = assertClosedCompactEnvelope(malformed.result, "active-malformed-rejection", "rejected");
  expect(malformedEnvelope).not.toHaveProperty("transaction");
  persistReturnedToolResult(entries, "active-malformed-rejection", "aili_compact", malformed.result);

  return {
    project,
    entries,
    childBlockIds,
    parentBlockId,
    attestedGapMessageCount: validProof.proofs[0]!.messageCount,
    rejectedProtocolKinds,
  };
}

async function proveTwoToSixteenSelectionAndLegacyRead(root: string) {
  const acceptedChildCounts: number[] = [];
  for (const childCount of [2, 16]) {
    const project = join(root, `selection-${childCount}`);
    writeProjectConfig(project, false, false, false);
    const fixture = seededActiveBlockFixture(project, `selection-${childCount}`, childCount, false);
    const status = await invokeStatus(fixture.runtime, fixture.ctx, fixture.entries, `selection-${childCount}-status`, true);
    const group = activeGroups(status.result).find((candidate) => candidate.blockRefs.length === childCount);
    expect(group).toBeDefined();

    const before = v3View(fixture.entries);
    const childIds = group!.blockRefs.map((ref) => before.blockByRef.get(ref)?.blockId);
    expect(childIds.every((id) => before.state.blocks.get(id!)?.active === true)).toBe(true);
    const one = planTierlessBlockReplacement(before, group!.blockRefs.slice(0, 1), `selection-${childCount}-one`);
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.code).toBe("invalid-request");
    const seventeen = planTierlessBlockReplacement(
      before,
      [...group!.blockRefs, ...Array.from({ length: 17 - group!.blockRefs.length }, (_, index) => `b${String(90 + index).padStart(6, "0")}`)],
      `selection-${childCount}-seventeen`,
    );
    expect(seventeen.ok).toBe(false);
    if (!seventeen.ok) expect(seventeen.code).toBe("invalid-request");

    const planned = planTierlessBlockReplacement(before, group!.blockRefs, `selection-${childCount}-commit`);
    expect(planned.ok).toBe(true);
    if (!planned.ok) throw new Error(`${planned.code}:${planned.path}`);
    if (planned.transaction.tag !== "semantic-create") throw new Error(`unexpected transaction:${planned.transaction.tag}`);
    const plannedBlockId = planned.transaction.payload.blockId;
    expect(planned.transaction.payload).toMatchObject({ source: { kind: "blocks", childBlockIds: childIds } });
    expect(planned.transaction.payload).not.toHaveProperty("tier");
    const applied = applyV3Transaction(before.state, planned.transaction, { expectedCatalogId: before.catalog.catalogId });
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(`${applied.code}:${applied.path}`);
    expect(childIds.every((id) => applied.value.state.blocks.get(id!)?.active === false)).toBe(true);
    expect(applied.value.state.blocks.get(plannedBlockId)).toMatchObject({ active: true });
    acceptedChildCounts.push(childCount);
  }
  return {
    tierlessWrites: true,
    sourceBacked: true,
    acceptedChildCounts,
    rejectedChildCounts: [1, 17],
    atomicReplacement: true,
  };
}

async function proveLegacyTierReadCompatibility(root: string) {
  const project = join(root, "legacy-tier-read");
  writeProjectConfig(project, false, false, false);
  const fixture = seededActiveBlockFixture(project, "legacy-tier-read", 2, true);
  await invokeStatus(fixture.runtime, fixture.ctx, fixture.entries, "legacy-tier-status", true);
  const recap = await fixture.runtime.tools.get("aili_context_recap")!
    .execute("legacy-tier-read", {}, undefined, undefined, fixture.ctx);
  expect(recap.isError).not.toBe(true);
  const recapBody = JSON.parse(textOf(recap.content));
  const legacyRef = v3View(fixture.entries).blockRefById.get(fixture.legacyBlockId!)!;
  expect(recapBody.activeBlocks.find((block: any) => block.blockRef === legacyRef)).toMatchObject({
    schema: "v3",
    legacyTieredReadOnly: true,
  });
  return { legacyTieredReadOnly: true, readableBlockCount: 1, newTieredWriteRequired: false };
}

async function proveBoundedProviderFrontierNoRawLeak(project: string) {
  const fixture = seededActiveBlockFixture(project, "frontier", FRONTIER_ACTIVE_BLOCKS, false);
  const projected = fixture.runtime.handlers.get("context")!({ type: "context", messages: providerMessages(fixture.entries) }, fixture.ctx);
  expect(projected.messages).toEqual(expect.any(Array));
  expect(projected.messages.length).toBeGreaterThan(0);
  const projectedBody = JSON.stringify(projected.messages);
  expect(projectedBody).not.toContain(RAW_SENTINEL);
  expect(projectedBody).not.toContain(rawBody(1).slice(0, 96));

  const status = await compactStatus(fixture.runtime, fixture.ctx);
  const counters = status.index.counters;
  expect(status.references.lifecycle.activeBlockCount).toBe(FRONTIER_ACTIVE_BLOCKS);
  expect(counters.providerFrontierDescriptorDerivations).toBeLessThanOrEqual(32);
  expect(counters.providerFrontierOmittedRawMessages).toBeGreaterThan(0);
  expect(counters.providerFrontierOmittedRawBytes).toBeGreaterThan(0);

  const view = v3View(fixture.entries);
  const selectedRefs = view.catalog.blocks
    .filter((block) => block.active && !block.queryOnly && view.state.blocks.get(block.blockId)?.tier === undefined)
    .slice(0, 16)
    .map((block) => block.ref);
  const recap = await fixture.runtime.tools.get("aili_context_recap")!
    .execute("frontier-recap-16", { blockRefs: selectedRefs }, undefined, undefined, fixture.ctx);
  expect(recap.isError).toBe(true);
  const recapFailure = JSON.parse(textOf(recap.content));
  expect(recapFailure).toMatchObject({ code: "frontier-unknown-context", expanded: false });
  expect(JSON.stringify(recapFailure)).not.toContain(RAW_SENTINEL);

  return {
    activeLedgerBlocks: FRONTIER_ACTIVE_BLOCKS,
    defaultDescriptorCap: 32,
    observedDescriptorDerivations: counters.providerFrontierDescriptorDerivations,
    omittedRawMessages: counters.providerFrontierOmittedRawMessages,
    omittedRawBytes: counters.providerFrontierOmittedRawBytes,
    requestedRecapCount: selectedRefs.length,
    unknownContextRejected: true,
    rawSourceLeaked: false,
    automaticFullSummaryExpansion: false,
  };
}

async function proveQualityAndStaleFaults(root: string, active: AttestedFixture) {
  const qualityProject = join(root, "quality");
  writeProjectConfig(qualityProject, true);
  const qualityEntries = compressibleBranch("quality", 1, `${QUALITY_SECRET} error failed must remain private ${"q".repeat(120_000)}`);
  const qualityRuntime = extensionHarness();
  const qualityCtx = extensionContext(qualityProject, qualityEntries, { tokens: 100, contextWindow: 50_000 });
  qualityRuntime.handlers.get("session_start")!({ type: "session_start" }, qualityCtx);
  const qualityStatus = await compactStatus(qualityRuntime, qualityCtx);
  const qualityRange = onlySafeRange(qualityStatus);
  const qualityParams = {
    mode: "message",
    catalogId: qualityStatus.references.catalogId,
    topic: "Redacted quality rejection",
    items: [{ messageRef: qualityRange.orderedRefs[0], topic: "Redacted quality rejection", summary: "A harmless recap" }],
  };
  const qualityResult = await invokeCompact(qualityRuntime, qualityCtx, qualityEntries, "quality-omission", qualityParams);
  expect(qualityResult.result.isError).toBe(true);
  const qualityEnvelope = assertClosedCompactEnvelope(qualityResult.result, "quality-omission", "rejected");
  expect(JSON.stringify(qualityEnvelope.result)).toContain("quality-rejected");
  expect(JSON.stringify(qualityEnvelope.result)).toContain("missing-hard-fact");
  expect(textOf(qualityResult.result.content)).not.toContain(QUALITY_SECRET);
  expect(qualityRuntime.appended).toEqual([]);

  const staleProject = join(root, "stale");
  writeProjectConfig(staleProject, true);
  const staleEntries = compressibleBranch("stale", 1);
  const staleRuntime = extensionHarness();
  const staleCtx = extensionContext(staleProject, staleEntries, { tokens: 100, contextWindow: 50_000 });
  staleRuntime.handlers.get("session_start")!({ type: "session_start" }, staleCtx);
  const staleStatus = await compactStatus(staleRuntime, staleCtx);
  const staleRange = onlySafeRange(staleStatus);
  const staleResult = await invokeCompact(staleRuntime, staleCtx, staleEntries, "stale-call", {
    mode: "message",
    catalogId: "0".repeat(64),
    topic: "Stale catalog",
    summaryMaxChars: 256,
    items: [{ messageRef: staleRange.orderedRefs[0], topic: "Stale catalog", summary: "Stale catalog recap" }],
  });
  expect(staleResult.result.isError).toBe(true);
  const staleEnvelope = assertClosedCompactEnvelope(staleResult.result, "stale-call", "rejected");
  expect(staleEnvelope.result).toMatchObject({ code: "source-summary-scope-mismatch" });
  expect(staleRuntime.appended).toEqual([]);

  const staleCatalogEntries = structuredClone(active.entries);
  const staleCatalogRuntime = extensionHarness();
  const staleCatalogCtx = extensionContext(active.project, staleCatalogEntries, { tokens: 100, contextWindow: 128_000 });
  staleCatalogRuntime.handlers.get("session_start")!({ type: "session_start" }, staleCatalogCtx);
  const staleCatalogView = v3View(staleCatalogEntries);
  const staleBlockRef = staleCatalogView.blockRefById.get(active.parentBlockId)!;
  mutationCall(staleCatalogEntries, "stale-catalog-decompress", "aili_decompress", {
    catalogId: "0".repeat(64), blockRefs: [staleBlockRef], depth: "raw",
  });
  const staleCatalogResult = await staleCatalogRuntime.tools.get("aili_decompress")!
    .execute("stale-catalog-decompress", { catalogId: "0".repeat(64), blockRefs: [staleBlockRef], depth: "raw" }, undefined, undefined, staleCatalogCtx);
  expect(staleCatalogResult.isError).toBe(true);
  expect(JSON.parse(textOf(staleCatalogResult.content))).toMatchObject({ code: "stale-catalog" });
  expect(staleCatalogRuntime.appended).toEqual([]);

  return {
    qualityRejectedBeforeAppend: true,
    qualityOutputRedacted: true,
    staleCatalogRejected: true,
    staleBlockOperationRejected: true,
    partialMutationCount: 0,
  };
}

async function proveStormGuardAndInterruptedReload(project: string) {
  const entries = compressibleBranch("storm", 1);
  const runtime = extensionHarness();
  const ctx = extensionContext(project, entries, { tokens: 99_000, contextWindow: 100_000 });
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
  for (let index = 0; index < 8; index += 1) runtime.handlers.get("agent_settled")!({ type: "agent_settled" }, ctx);
  expect(ctx.compactCalls).toHaveLength(1);
  expect(runtime.appended).toEqual([]);
  const interrupted = await compactStatus(runtime, ctx);
  expect(interrupted.checkpointCoordinatorState).not.toBe("idle");
  expect(interrupted.deterministicCheckpointCount).toBe(0);

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
  appendEntry(entries, {
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

function seededActiveBlockFixture(project: string, prefix: string, activeCount: number, includeLegacy: boolean) {
  const entries: any[] = [];
  if (includeLegacy) appendMessage(entries, `${prefix}-legacy-source`, "assistant", `legacy source ${"l".repeat(4_000)}`);
  const activeSources = Array.from({ length: activeCount }, (_, index) => {
    const id = `${prefix}-source-${index + 1}`;
    appendMessage(entries, id, "assistant", rawBody(index + 1));
    return id;
  });
  for (let index = 0; index < 16; index += 1) appendMessage(entries, `${prefix}-tail-${index + 1}`, "assistant", `recent tail ${index + 1} ${"t".repeat(5_000)}`);
  appendMessage(entries, `${prefix}-current`, "user", "continue with the protected current request");

  let legacyBlockId: string | undefined;
  if (includeLegacy) {
    legacyBlockId = `${prefix}-legacy-tiered`;
    appendSeedActiveBlock(entries, legacyBlockId, `${prefix}-legacy-source`, 1, "T1");
  }
  const activeBlockIds = activeSources.map((sourceId, index) => {
    const blockId = `${prefix}-active-${index + 1}`;
    appendSeedActiveBlock(entries, blockId, sourceId, index + 2);
    return blockId;
  });
  const view = v3View(entries);
  expect(view.replay.diagnostics).toEqual([]);
  expect(activeBlockIds.every((id) => view.state.blocks.get(id)?.tier === undefined)).toBe(true);
  if (legacyBlockId) expect(view.state.blocks.get(legacyBlockId)?.tier).toBe("T1");

  const runtime = extensionHarness();
  const ctx = extensionContext(project, entries, { tokens: 100, contextWindow: 128_000 });
  runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
  return { entries, runtime, ctx, activeBlockIds, legacyBlockId };
}

function appendSeedActiveBlock(entries: any[], blockId: string, sourceEntryId: string, createdAt: number, tier?: "T1") {
  const view = v3View(entries);
  const summary = activeSummary(blockId);
  const transaction = {
    header: {
      schema: AILI_COMPACT_SCHEMA_V3,
      txId: `seed-${blockId}`,
      sessionId: view.state.sessionId,
      branchLeafId: view.state.branchLeafId,
      epochId: view.state.epochId,
      catalogId: view.catalog.catalogId,
      createdAt,
      projectionVersion: view.state.projectionVersion,
    },
    tag: "semantic-create",
    payload: {
      blockId,
      ...(tier ? { tier } : {}),
      topic: blockId,
      runId: `seed-${blockId}`,
      anchorEntryId: sourceEntryId,
      createdTurnOrdinal: createdAt,
      summary,
      summaryDigest: v3SummaryDigest(summary),
      source: { kind: "messages", entryIds: [sourceEntryId], firstEntryId: sourceEntryId, lastEntryId: sourceEntryId },
      leafDigest: v3MessageLeafDigest([sourceEntryId]),
      leafCount: 1,
      tokens: {
        estimatorVersion: TOKEN_ESTIMATOR_VERSION,
        providerId: "openai",
        modelId: "gpt-4.1",
        sourceTokensLower: 20_000,
        sourceTokensUpper: 20_000,
        replacementTokensUpper: 1_000,
        steadySavingsTokensLower: 19_000,
        oneTimeCostTokensUpper: 1_000,
        breakEvenTurnsUpper: 1,
        savingsRatio: 0.95,
        summaryTokensUpper: 1_000,
      },
      quality: {
        status: "accepted",
        evaluatorVersion: QUALITY_EVALUATOR_VERSION,
        sourceFactDigest: digest([sourceEntryId]),
        hardFactCount: 1,
        coveredHardFactCount: 1,
        warningCodes: [],
      },
    },
  } as const;
  appendEntry(entries, { id: `seed-entry-${blockId}`, type: "custom", customType: AILI_COMPACT_ENTRY, data: transaction });
  return transaction;
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

function extensionContext(project: string, entries: any[], usage: { tokens: number; contextWindow: number }) {
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
  const entries: any[] = [];
  for (let index = 0; index < sourceCount; index += 1) {
    appendMessage(entries, `${prefix}-source-${index + 1}`, "assistant", index === 0 && firstBody !== undefined ? firstBody : rawBody(index + 1));
  }
  appendMessage(entries, `${prefix}-current`, "user", "continue with the current request");
  for (let index = 0; index < 8 - sourceCount; index += 1) {
    appendMessage(entries, `${prefix}-recent-${index + 1}`, "assistant", `recent protected filler ${index + 1} ${"f".repeat(5_000)}`);
  }
  return entries;
}

function rawBody(index: number): string {
  return `${RAW_SENTINEL}-${index}-${"源".repeat(RAW_FILLER_CHARS)}`;
}

function activeSummary(label: string): string {
  return (`active source-backed summary ${label} ${"史".repeat(ACTIVE_SUMMARY_CHARS)}`).slice(0, ACTIVE_SUMMARY_CHARS);
}

function blockParams(status: any, blockRefs: string[], topic: string) {
  return {
    mode: "blocks",
    catalogId: status.references.catalogId,
    topic,
    blockRefs,
    summary: (`${topic} ${"a".repeat(COMPOSITION_SUMMARY_CHARS)}`).slice(0, COMPOSITION_SUMMARY_CHARS),
    summaryMaxChars: 18_000,
  };
}

function planTierlessBlockReplacement(view: ReturnType<typeof v3View>, blockRefs: string[], transactionId: string) {
  const children = blockRefs.flatMap((ref) => {
    const blockId = view.blockByRef.get(ref)?.blockId;
    const block = blockId ? view.state.blocks.get(blockId) : undefined;
    return block ? [block] : [];
  });
  const summary = (`planner ${transactionId} ${"a".repeat(COMPOSITION_SUMMARY_CHARS)}`).slice(0, COMPOSITION_SUMMARY_CHARS);
  const sourceDigest = children.length > 0
    ? v3BlockSourceDigest(view.catalog.catalogId, children)
    : "0".repeat(64);
  const sourceTokens = Math.max(20_000, children.length * 20_000);
  const replacementTokens = 1_000;
  const tokens = {
    estimatorVersion: TOKEN_ESTIMATOR_VERSION,
    providerId: "openai",
    modelId: "gpt-4.1",
    sourceTokensLower: sourceTokens,
    sourceTokensUpper: sourceTokens,
    replacementTokensUpper: replacementTokens,
    steadySavingsTokensLower: sourceTokens - replacementTokens,
    oneTimeCostTokensUpper: 1_000,
    breakEvenTurnsUpper: 1,
    savingsRatio: (sourceTokens - replacementTokens) / sourceTokens,
    summaryTokensUpper: replacementTokens,
  };
  return planV3BlockMutation({
    operation: "compact",
    semantics: "active-block",
    mode: "blocks",
    catalogId: view.catalog.catalogId,
    transactionId,
    blockId: `planned-${transactionId}`,
    blockRefs,
    topic: `Planned ${transactionId}`,
    summary,
    summaryMaxChars: 18_000,
    runId: `run-${transactionId}`,
    createdAt: 1_000,
    createdTurnOrdinal: 1_000,
    benefit: {
      sourceDigest,
      summaryDigest: v3SummaryDigest(summary),
      orderedRefs: blockRefs,
      decision: {
        eligible: true,
        reasons: [],
        semantics: "active-block",
        pressureStage: "NORMAL",
        horizonTurns: 0,
        saturated: false,
        sourceLower: sourceTokens,
        sourceUpper: sourceTokens,
        replacementUpper: replacementTokens,
        steadySavingsLower: sourceTokens - replacementTokens,
        oneTimeCostUpper: 1_000,
        breakEvenTurnsUpper: 1,
        netSavingsLower: sourceTokens - replacementTokens,
        savingsRatio: (sourceTokens - replacementTokens) / sourceTokens,
      },
      tokens,
    },
    quality: { override: "quality-disabled" },
  }, {
    state: view.state,
    catalog: view.mutationCatalog,
    protectedIntervals: [],
    promotionGapEntries: [],
  });
}

function invalidBlockParams(topic: string) {
  return {
    mode: "blocks",
    catalogId: "0".repeat(64),
    topic,
    blockRefs: ["b000001"],
    summary: "invalid block cardinality",
    summaryMaxChars: 18_000,
  };
}

async function compactStatus(runtime: RuntimeHarness, ctx: any) {
  const result = await runtime.tools.get("aili_compact_status")!.execute("status", {}, undefined, undefined, ctx);
  return assertClosedStatusEnvelope(result, "status").result;
}

async function invokeStatus(runtime: RuntimeHarness, ctx: any, entries: any[], callId: string, persist: boolean) {
  if (persist) mutationCall(entries, callId, "aili_compact_status", {});
  const result = await runtime.tools.get("aili_compact_status")!.execute(callId, {}, undefined, undefined, ctx);
  const envelope = assertClosedStatusEnvelope(result, callId);
  if (persist) persistReturnedToolResult(entries, callId, "aili_compact_status", result);
  return { result: envelope.result, envelope };
}

async function invokeCompact(runtime: RuntimeHarness, ctx: any, entries: any[], callId: string, params: any) {
  mutationCall(entries, callId, "aili_compact", params);
  const result = await runtime.tools.get("aili_compact")!.execute(callId, params, undefined, undefined, ctx);
  return { result, envelope: parsePlanningEnvelope(result) };
}

function assertClosedStatusEnvelope(result: any, callId: string) {
  const envelope = parsePlanningEnvelope(result);
  expect(Object.keys(envelope).sort()).toEqual(["attestation", "result"]);
  expect(result.isError).not.toBe(true);
  expect(envelope.attestation).toMatchObject({
    owner: "aili-compact",
    implementationId: "aili.compact.runtime.v3",
    toolName: "aili_compact_status",
    toolCallId: callId,
    outcome: "success",
    resultDigest: digest({ result: envelope.result, transaction: null }),
  });
  return envelope;
}

function assertClosedCompactEnvelope(result: any, callId: string, outcome: "success" | "rejected") {
  const envelope = parsePlanningEnvelope(result);
  const hasTransaction = Object.prototype.hasOwnProperty.call(envelope, "transaction");
  expect(Object.keys(envelope).sort()).toEqual(outcome === "success" ? ["attestation", "result", "transaction"] : ["attestation", "result"]);
  expect(result.isError === true).toBe(outcome === "rejected");
  expect(envelope.attestation).toMatchObject({
    owner: "aili-compact",
    implementationId: "aili.compact.runtime.v3",
    toolName: "aili_compact",
    toolCallId: callId,
    outcome,
    resultDigest: digest({ result: envelope.result, transaction: hasTransaction ? envelope.transaction : null }),
  });
  if (outcome === "success") {
    expect(envelope.attestation).toMatchObject({ transactionId: callId, transactionDigest: digest(envelope.transaction) });
    expect(result.details?.contextTx).toEqual(envelope.transaction);
  } else {
    expect(envelope).not.toHaveProperty("transaction");
  }
  return envelope;
}

function parsePlanningEnvelope(result: any): any {
  const text = textOf(result.content);
  const envelope = JSON.parse(text);
  expect(envelope).toEqual(expect.any(Object));
  expect(envelope.attestation).toEqual(expect.any(Object));
  return envelope;
}

function persistAcceptedCompact(entries: any[], callId: string, result: any, envelope: any) {
  expect(result.details?.contextTx).toEqual(envelope.transaction);
  appendEntry(entries, { id: `${callId}:custom`, type: "custom", customType: AILI_COMPACT_ENTRY, data: result.details.contextTx });
  return persistReturnedToolResult(entries, callId, "aili_compact", result);
}

function persistReturnedToolResult(entries: any[], callId: string, toolName: string, result: any) {
  const id = `${callId}:result`;
  appendEntry(entries, {
    id,
    type: "message",
    message: {
      role: "toolResult",
      toolCallId: callId,
      toolName,
      content: structuredClone(result.content),
      isError: result.isError === true,
      ...(result.details ? { details: structuredClone(result.details) } : {}),
    },
  });
  return id;
}

function mutationCall(entries: any[], id: string, name: string, args: Record<string, unknown>) {
  appendEntry(entries, {
    id: `assistant:${id}`,
    type: "message",
    message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] },
  });
}

function appendMessage(entries: any[], id: string, role: "assistant" | "user", content: string) {
  appendEntry(entries, { id, type: "message", message: { role, content } });
}

function appendEntry(entries: any[], entry: any) {
  if (entry.parentId === undefined) entry.parentId = entries.at(-1)?.id ?? null;
  entries.push(entry);
  return entry;
}

function toolCallEntry(entries: any[], callId: string) {
  const entry = entries.find((candidate) => candidate.id === `assistant:${callId}`);
  if (!entry) throw new Error(`missing tool call ${callId}`);
  return entry;
}

function toolResultEntry(entries: any[], resultId: string) {
  const entry = entries.find((candidate) => candidate.id === resultId);
  if (!entry) throw new Error(`missing tool result ${resultId}`);
  return entry;
}

function classifyCurrentPromotionGap(entries: any[], childBlockIds: string[], sourceView = v3View(entries)) {
  const view = sourceView;
  const children = childBlockIds.map((blockId) => view.state.blocks.get(blockId)!);
  return classifyTransparentPromotionGaps(entries, view.state.blocks, children, {
    sessionId: view.state.sessionId,
    branchLeafId: view.state.branchLeafId,
    epochId: view.state.epochId,
    revision: view.state.projectionVersion,
  });
}

function activeGroups(status: any): Array<{ semantics: "active-block"; blockRefs: string[]; action: "compact" }> {
  const groups = status.references?.lifecycle?.activeBlockGroups;
  return Array.isArray(groups)
    ? groups.filter((group: any) => group?.semantics === "active-block" && group.action === "compact" && Array.isArray(group.blockRefs))
    : [];
}

function exactRange(status: any, ref: string) {
  const range = status.references.safeRanges.find((candidate: any) => candidate.orderedRefs.includes(ref));
  if (!range) throw new Error(`missing exact safe range for ${ref}: ${JSON.stringify(status.references.safeRangeDiagnostics)}`);
  return range;
}

function onlySafeRange(status: any) {
  const ranges = status.references?.safeRanges ?? [];
  const candidates = ranges.filter((range: any) => Array.isArray(range.orderedRefs) && range.orderedRefs.length === 1);
  if (candidates.length !== 1) throw new Error(`expected one exact source range: ${JSON.stringify({ ranges, diagnostics: status.references?.safeRangeDiagnostics })}`);
  return candidates[0];
}

function providerMessages(entries: any[]) {
  return entries.filter((entry) => entry.type === "message").map((entry) => entry.message);
}

function v3View(entries: any[]) {
  return buildV3RuntimeView(entries, reduceCompactState(entries), { sessionId: "fake-provider-session" });
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("");
}

function writeProjectConfig(project: string, qualityEnabled: boolean, planningEnabled = true, indexEnabled = true) {
  mkdirSync(join(project, ".pi"), { recursive: true });
  writeFileSync(join(project, ".pi", "aili-compact.jsonc"), JSON.stringify({
    enabled: true,
    manualMode: false,
    compress: { summaryHardMaxChars: 12_000 },
    planning: { enabled: planningEnabled },
    index: { enabled: indexEnabled },
    quality: { enabled: qualityEnabled, warningPolicy: "record" },
    providerSuffix: { enabled: true },
    checkpoint: { autoRescue: true, deterministic: true },
    protection: {
      preserveRecentAtoms: 8,
      preserveRecentTokens: 12_000,
      preserveRecentTokenCapRatio: 0.10,
    },
  }), "utf8");
}
