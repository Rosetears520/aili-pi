import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { readAiliCompactCandidateBinding } from "../../scripts/aili-compact-release-evidence.js";

import {
  AILI_COMPACT_ENTRY,
  AILI_COMPACT_SCHEMA_V1,
  AILI_COMPACT_SCHEMA_V2,
  canonicalJson,
  digest,
  sourceDigest,
  type CompactBlock,
  type CompactTransaction,
} from "../../src/runtime/aili-compact/contracts.js";
import {
  BRANCH_INDEX_COUNTER_KEYS,
  BranchIndexCache,
  auditBranchIndexReplayHealth,
  branchAncestryProof,
  branchIndexesShareEntryPrefix,
  coldBuildBranchIndex,
  emptyBranchIndexCounters,
  getIndexedEntry,
  type BranchIndexCounters,
  type BranchIndexKey,
  type BranchIndexSnapshot,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import { registerAiliCompact } from "../../src/runtime/aili-compact/index.js";
import { alignEntriesToMessages, projectMessages } from "../../src/runtime/aili-compact/projector.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import { buildV3RuntimeView, type V3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import { projectV3Messages } from "../../src/runtime/aili-compact/v3-projector.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  applyV3Transaction,
  createEmptyV3State,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3SemanticCreatePayload,
  type V3Tier,
  type V3TokenMetadata,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

const FIXED_SEED = 0x5eed_c0de;
const PROVIDER_MESSAGE_COUNT = 10_000;
const REFERENCE_OPERATION_COUNT = 100_000;
const RAW_BODY_SENTINEL = "production-source-body-sentinel-never-report";
const CREDENTIAL_SENTINEL = "production-synthetic-secret-never-report";
const DUPLICATE_BODY = "fixed-duplicate-alignment-body";
const FACT_DIGEST = "f".repeat(64);
const TRANSIENT_SUFFIX_TYPE = "aili-compact-provider-suffix";
const PROTOCOL_FAULT_PROVIDER_ORDINALS = new Set([997, 998, 1_999, 2_000, 2_999, 3_000, 3_001, 3_002]);
const REPORT_PATH = join(process.cwd(), "artifacts", "test-results", "aili-compact-lifecycle-performance.json");

type Handler = (event: any, context: any) => any;
type RegisteredCommand = (args: string, context: any) => Promise<void>;
type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };

interface SharedEntryGuard {
  arm(): void;
  disarm(): void;
  touches(): number;
}

interface BranchContainerGuard {
  readonly proxy: BranchSessionEntry[];
  arm(firstAllowedIndex: number): void;
  disarm(): void;
  oldIndexTouches(): number;
  allowedIndexTouches(): number;
}

interface ProviderGuard {
  readonly messages: readonly Record<string, unknown>[];
  readonly identityToOrdinal: ReadonlyMap<object, number>;
  numericReads(): number;
  repeatedNumericReads(): number;
  objectKeyWalks(): number;
  repeatedObjectKeyWalks(): number;
  repeatedPropertyReads(): number;
}

interface PerformanceCorpus {
  readonly entries: BranchSessionEntry[];
  readonly entryGuard: SharedEntryGuard;
  readonly providerMessages: readonly Record<string, unknown>[];
  readonly duplicateEntryIds: readonly [string, string];
  readonly protocolFaults: number;
  readonly schemaTransactions: Readonly<Record<"v1" | "v2" | "v3", number>>;
  readonly markerIds: Readonly<Record<"fork" | "epoch", string>>;
}

describe("AILI Compact registered production-entry performance gate", () => {
  it("uses exact hand-audited counters for cold, status, steady context, and one append", async () => {
    const project = mkdtempSync(join(tmpdir(), "aili-compact-performance-small-"));
    try {
      writePerformanceConfig(project);
      const entries: BranchSessionEntry[] = [
        message("small-1", "user", "alpha"),
        toolCall("small-2", "small-read", "read", "small-1"),
        toolResult("small-3", "small-read", "read", "small-2", "bounded"),
        message("small-4", "assistant", "omega", "small-3"),
      ];
      const runtime = extensionHarness();
      const ctx = extensionContext(project, entries, "small-4", "performance-small-session");

      runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
      const cold = indexCounters(await doctor(runtime, ctx));
      expect(cold).toEqual({
        ...emptyBranchIndexCounters(),
        entryVisits: 12,
        atomMembershipVisits: 4,
        hashOps: 22,
        fullRebuilds: 1,
        hashRecatalogs: 1,
        protocolRebuilds: 1,
        protectionRebuilds: 1,
        catalogRebuilds: 1,
      });

      const status = await compactStatus(runtime, ctx, { offset: 0, limit: 4 });
      expect(status.references.refs.map((item: any) => item.ref)).toEqual([
        "m000001", "m000002", "m000003", "m000004",
      ]);
      const afterStatus = indexCounters(status);
      expect(counterDelta(cold, afterStatus)).toEqual({
        ...emptyBranchIndexCounters(),
        hashLookups: 4,
      });

      const projected = runtime.handlers.get("context")!(
        { type: "context", messages: entries.map((entry) => entry.message) },
        ctx,
      );
      expect(projected.messages).toHaveLength(entries.length);
      const steady = indexCounters(await doctor(runtime, ctx));
      expect(counterDelta(afterStatus, steady)).toEqual({
        ...emptyBranchIndexCounters(),
        providerMessagePasses: 1,
        providerMessageVisits: 4,
      });

      const appended = message("small-5", "assistant", "append", "small-4");
      entries.push(appended);
      ctx.setLeafId(appended.id);
      runtime.handlers.get("context")!(
        { type: "context", messages: entries.map((entry) => entry.message) },
        ctx,
      );
      const afterAppend = indexCounters(await doctor(runtime, ctx));
      expect(counterDelta(steady, afterAppend)).toEqual({
        ...emptyBranchIndexCounters(),
        entryVisits: 3,
        atomMembershipVisits: 2,
        hashOps: 6,
        providerMessagePasses: 1,
        providerMessageVisits: 5,
        incrementalAppends: 1,
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 30_000);

  it("passes fixed 10K/100K production gates with independent scan tripwires and sanitized evidence", async () => {
    rmSync(REPORT_PATH, { force: true });
    const project = mkdtempSync(join(tmpdir(), "aili-compact-performance-large-"));
    try {
      writePerformanceConfig(project);
      const corpus = fixedSeedCorpus();
      const branchGuard = guardBranchContainer(corpus.entries);
      const runtime = extensionHarness();
      const ctx = extensionContext(
        project,
        branchGuard.proxy,
        corpus.entries.at(-1)!.id,
        "production-performance-session",
      );
      const pureState = { ...reduceCompactState(corpus.entries), enabled: true };
      const pureView = buildV3RuntimeView(corpus.entries, pureState, {
        sessionId: "production-performance-session",
        sessionPath: join(project, "fixture-session.jsonl"),
      });
      const providerInput = productionProviderInput(corpus.providerMessages);
      const pureProviderInput = providerInput.filter((message) => message.customType !== TRANSIENT_SUFFIX_TYPE);
      const pureProjection = buildPureProjection(corpus.entries, pureProviderInput, pureState, pureView);
      const rawIdentity = new Map(corpus.providerMessages.map((item, index) => [item, index] as const));
      const pureProjectionPattern = projectionPattern(pureProjection.messages, rawIdentity);

      const directHeapBefore = process.memoryUsage().heapUsed;
      const directStarted = performance.now();
      const direct = coldBuildBranchIndex({
        key: branchKey(corpus.entries.at(-1)!.id),
        entries: corpus.entries,
        derivedVersions: {
          providerId: "fixture-provider",
          modelId: "fixture-model",
          estimatorVersion: "fixture-estimator-v1",
          projectionVersion: "aili.projector.v3",
          qualityVersion: "aili.quality.v1",
          configVersion: "fixture-config-v1",
        },
      });
      const directDurationMs = performance.now() - directStarted;
      const directHeapDeltaBytes = process.memoryUsage().heapUsed - directHeapBefore;
      expect(direct.ok).toBe(true);
      if (!direct.ok) return;
      const directHealth = auditBranchIndexReplayHealth(direct.snapshot, corpus.entries);
      expect(directHealth.healthy, directHealth.diagnostics.join("\n")).toBe(true);
      expect(directHealth.indexedDigest).toBe(directHealth.oracleDigest);
      expect(direct.snapshot.stats.messageRefs).toBe(pureView.catalog.messages.length);
      expect(direct.snapshot.stats.retainedRecords).toBe(
        6 * direct.snapshot.stats.entries
        + 3 * direct.snapshot.stats.atomMembershipEdges
        + 5 * direct.snapshot.stats.blocks
        + 2 * direct.snapshot.stats.catalogRefs,
      );
      expect(direct.snapshot.stats.retainedRecords).toBeLessThanOrEqual(direct.snapshot.stats.retainedRecordLimit);
      expect(getIndexedEntry(direct.snapshot, "production-000001")?.entry).toBe(corpus.entries[0]);
      const structural = exerciseForkEpochLruAndCleanup(direct.snapshot);

      const heapBefore = process.memoryUsage().heapUsed;
      const coldStarted = performance.now();
      runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
      const coldDurationMs = performance.now() - coldStarted;
      const coldHeapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
      const coldDoctor = await doctor(runtime, ctx);
      const coldCounters = indexCounters(coldDoctor);
      const entryCount = direct.snapshot.stats.entries;
      const atomEdges = direct.snapshot.stats.atomMembershipEdges;
      const blockCount = direct.snapshot.stats.blocks;
      expect(coldDoctor.components.index.status).toBe("PASS");
      expect(coldCounters).toEqual(expect.objectContaining({
        entryVisits: 3 * entryCount,
        atomMembershipVisits: atomEdges,
        fullRebuilds: 1,
        fullReducerRuns: 0,
        fullScans: 0,
        fallbacks: 0,
        failOpenReturns: 0,
      }));
      expect(coldCounters.entryVisits).toBeLessThanOrEqual(3 * entryCount);
      expect(coldCounters.atomMembershipVisits).toBeLessThanOrEqual(4 * atomEdges);
      expect(coldCounters.blockVisits).toBeLessThanOrEqual(4 * blockCount);
      expect(coldCounters.hashOps).toBeLessThanOrEqual(12 * (entryCount + atomEdges + blockCount));

      corpus.entryGuard.arm();
      branchGuard.arm(corpus.entries.length);
      const providerGuard = guardProviderMessages(providerInput);
      const steadyStarted = performance.now();
      const productionProjection = runtime.handlers.get("context")!(
        { type: "context", messages: providerGuard.messages },
        ctx,
      );
      const steadyDurationMs = performance.now() - steadyStarted;
      const steadyDoctor = await doctor(runtime, ctx);
      const steadyCounters = indexCounters(steadyDoctor);
      const steadyDelta = counterDelta(coldCounters, steadyCounters);
      expect(steadyDoctor.components.projection.status, ctx.statuses.at(-1)).toBe("PASS");
      expect(steadyDelta).toEqual({
        ...emptyBranchIndexCounters(),
        providerMessagePasses: 1,
        providerMessageVisits: PROVIDER_MESSAGE_COUNT,
      });
      expect(providerGuard.numericReads()).toBe(PROVIDER_MESSAGE_COUNT);
      expect(providerGuard.repeatedNumericReads()).toBe(0);
      expect(providerGuard.objectKeyWalks()).toBe(PROVIDER_MESSAGE_COUNT);
      expect(providerGuard.repeatedObjectKeyWalks()).toBe(0);
      expect(providerGuard.repeatedPropertyReads()).toBe(0);
      expect(corpus.entryGuard.touches()).toBe(0);
      expect(branchGuard.oldIndexTouches()).toBe(0);
      expect(branchGuard.allowedIndexTouches()).toBe(0);
      expect(projectionPattern(productionProjection.messages, providerGuard.identityToOrdinal)).toEqual(pureProjectionPattern);

      let referenceOperations = 0;
      let referencePageCalls = 0;
      let finalStatus: any;
      const pureRefByEntryId = new Map(pureView.catalog.messages.map((message) => [message.entryId, message.ref] as const));
      const lookupStarted = performance.now();
      while (referenceOperations < REFERENCE_OPERATION_COUNT) {
        const offset = referenceOperations % pureView.catalog.messages.length;
        const limit = Math.min(
          64,
          pureView.catalog.messages.length - offset,
          REFERENCE_OPERATION_COUNT - referenceOperations,
        );
        const status = await compactStatus(runtime, ctx, { offset, limit });
        const expected = pureView.catalog.messages.slice(offset, offset + limit);
        const expectedPublicRefs = expected.map((message) => ({
          ref: message.ref,
          ...(message.role ? { role: message.role.slice(0, 32) } : {}),
          atomRefs: [...new Set(message.atomEntryIds.flatMap((entryId) => pureRefByEntryId.get(entryId) ?? []))].slice(0, 16),
        }));
        expect(status.references.catalogId).toBe(pureView.catalog.catalogId);
        expect(status.references.epochId).toBe(pureView.catalog.epochId);
        expect(status.references.refs).toEqual(expectedPublicRefs);
        expect(status.references.refs).toHaveLength(limit);
        referenceOperations += limit;
        referencePageCalls += 1;
        finalStatus = status;
      }
      const lookupDurationMs = performance.now() - lookupStarted;
      const afterLookup = indexCounters(finalStatus);
      const lookupDelta = counterDelta(steadyCounters, afterLookup);
      expect(referenceOperations).toBe(REFERENCE_OPERATION_COUNT);
      expect(lookupDelta.fullScans).toBe(0);
      expect(lookupDelta.hashLookups).toBeGreaterThanOrEqual(REFERENCE_OPERATION_COUNT);
      expect(lookupDelta.hashLookups).toBeLessThanOrEqual(3 * REFERENCE_OPERATION_COUNT);
      expect(withoutCounter(lookupDelta, "hashLookups")).toEqual(emptyBranchIndexCounters());
      expect(corpus.entryGuard.touches()).toBe(0);
      expect(branchGuard.oldIndexTouches()).toBe(0);

      const appended = message(
        "production-matching-append",
        "assistant",
        "one matching production append",
        ctx.sessionManager.getLeafId()!,
      );
      corpus.entries.push(appended);
      ctx.setLeafId(appended.id);
      const appendedProviderMessages = [...providerInput, appended.message as Record<string, unknown>];
      const appendedProviderGuard = guardProviderMessages(appendedProviderMessages);
      const appendStarted = performance.now();
      runtime.handlers.get("context")!(
        { type: "context", messages: appendedProviderGuard.messages },
        ctx,
      );
      const appendDurationMs = performance.now() - appendStarted;
      const afterAppendDoctor = await doctor(runtime, ctx);
      const afterAppend = indexCounters(afterAppendDoctor);
      const appendDelta = counterDelta(afterLookup, afterAppend);
      expect(afterAppendDoctor.components.index.status).toBe("PASS");
      expect(appendDelta).toEqual({
        ...emptyBranchIndexCounters(),
        entryVisits: 3,
        atomMembershipVisits: 3,
        hashOps: 6,
        providerMessagePasses: 1,
        providerMessageVisits: PROVIDER_MESSAGE_COUNT + 1,
        incrementalAppends: 1,
      });
      expect(appendDelta.preTipEntryVisits).toBe(0);
      expect(appendDelta.entryVisits).toBeLessThanOrEqual(3);
      expect(appendDelta.fullRebuilds).toBe(0);
      expect(appendedProviderGuard.numericReads()).toBe(PROVIDER_MESSAGE_COUNT + 1);
      expect(appendedProviderGuard.repeatedNumericReads()).toBe(0);
      expect(appendedProviderGuard.repeatedObjectKeyWalks()).toBe(0);
      expect(appendedProviderGuard.repeatedPropertyReads()).toBe(0);
      expect(corpus.entryGuard.touches()).toBe(0);
      expect(branchGuard.oldIndexTouches()).toBe(0);
      expect(branchGuard.allowedIndexTouches()).toBeGreaterThanOrEqual(1);
      expect(branchGuard.allowedIndexTouches()).toBeLessThanOrEqual(3);

      // A declared fault is allowed to rebuild. Disarm the independent scan
      // tripwire first, then prove exact input fail-open and truthful counters.
      corpus.entryGuard.disarm();
      branchGuard.disarm();
      const duplicate = message(
        "production-000001",
        "assistant",
        "deliberate duplicate id fault",
        appended.id,
      );
      corpus.entries.push(duplicate);
      ctx.setLeafId(duplicate.id);
      const faultMessages = [...appendedProviderMessages, duplicate.message as Record<string, unknown>];
      const faultStarted = performance.now();
      const faultOutput = runtime.handlers.get("context")!(
        { type: "context", messages: faultMessages },
        ctx,
      );
      const faultDurationMs = performance.now() - faultStarted;
      expect(faultOutput.messages).toBe(faultMessages);
      const faultDoctor = await doctor(runtime, ctx);
      const faultCounters = indexCounters(faultDoctor);
      const faultDelta = counterDelta(afterAppend, faultCounters);
      expect(faultDoctor.components.index.status).toBe("ERROR");
      expect(faultDelta.fullRebuilds).toBe(1);
      expect(faultDelta.fallbacks).toBe(2);
      expect(faultDelta.failOpenReturns).toBe(2);
      expect(faultDelta.providerMessagePasses).toBe(0);
      expect(faultDelta.fullScans).toBe(0);

      const candidateBinding = await readAiliCompactCandidateBinding(process.cwd());
      const report = {
        schema: "aili.compact.lifecycle.performance.v1",
        scope: "registered-extension-production-entry",
        verdict: "PASS",
        ...candidateBinding,
        seed: "0x5eedc0de",
        runtime: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          pi: "0.82.1-declared-baseline",
        },
        corpus: {
          providerMessages: PROVIDER_MESSAGE_COUNT,
          selectedBranchEntries: entryCount,
          messageReferences: pureView.catalog.messages.length,
          referenceOperations,
          referencePageCalls,
          duplicateFingerprintOrdinals: [41, 43],
          protocolFaults: corpus.protocolFaults,
          schemaTransactions: corpus.schemaTransactions,
          markers: { fork: true, epoch: true },
        },
        productionRows: {
          coldBuild: {
            status: "PASS",
            counters: coldCounters,
            budgets: {
              entryVisits: { actual: coldCounters.entryVisits, limit: 3 * entryCount },
              atomMembershipVisits: { actual: coldCounters.atomMembershipVisits, limit: 4 * atomEdges },
              blockVisits: { actual: coldCounters.blockVisits, limit: 4 * blockCount },
              hashOps: { actual: coldCounters.hashOps, limit: 12 * (entryCount + atomEdges + blockCount) },
            },
            comparative: { durationMs: roundMillis(coldDurationMs), heapDeltaBytes: coldHeapDeltaBytes },
          },
          steadyContext: {
            status: "PASS",
            delta: steadyDelta,
            providerContainerReads: providerGuard.numericReads(),
            providerObjectKeyWalks: providerGuard.objectKeyWalks(),
            repeatedProviderReads: 0,
            oldBranchEntryTouches: branchGuard.oldIndexTouches(),
            sourceObjectTouches: corpus.entryGuard.touches(),
            pureProjectionOrderEqual: true,
            comparative: { durationMs: roundMillis(steadyDurationMs) },
          },
          scopedReferencePaging: {
            status: "PASS",
            operations: referenceOperations,
            pageCalls: referencePageCalls,
            delta: lookupDelta,
            hashLookupLimit: 3 * referenceOperations,
            catalogOrderEqual: true,
            comparative: { durationMs: roundMillis(lookupDurationMs) },
          },
          incrementalAppend: {
            status: "PASS",
            newEntries: 1,
            delta: appendDelta,
            preTipSourceTouches: branchGuard.oldIndexTouches(),
            comparative: { durationMs: roundMillis(appendDurationMs) },
          },
          injectedFault: {
            status: "PASS",
            indexedStatus: "ERROR",
            exactInputFailOpen: true,
            delta: faultDelta,
            comparative: { durationMs: roundMillis(faultDurationMs) },
          },
        },
        structuralOracle: {
          status: "PASS",
          role: "same-corpus independent oracle; production counters above are authoritative for cutover",
          canonicalStateDigest: direct.snapshot.canonicalStateDigest,
          oracleReplayDigest: directHealth.oracleDigest,
          indexedReplayDigest: directHealth.indexedDigest,
          retainedRecords: direct.snapshot.stats.retainedRecords,
          retainedRecordLimit: direct.snapshot.stats.retainedRecordLimit,
          sourceObjectIdentityRetained: true,
          sharedPrefix: structural.sharedPrefix,
          forkDigestsDiverged: structural.forkDigestsDiverged,
          epochArchivedAndScoped: structural.epochArchivedAndScoped,
          lruLimit: 4,
          lruObservedMax: structural.lruObservedMax,
          faultCleanupDiscardedAll: structural.faultCleanupDiscardedAll,
          comparative: { durationMs: roundMillis(directDurationMs), heapDeltaBytes: directHeapDeltaBytes },
        },
        claimBounds: {
          wallClockAndHeap: "comparative-only",
          liveProvider: "Unverified",
          realUserSession: "Unverified",
        },
        sanitizer: {
          sourceBodiesIncluded: false,
          credentialsIncluded: false,
          privatePathsIncluded: false,
        },
      } as const;
      const serialized = `${JSON.stringify(report, null, 2)}\n`;
      expect(report.verdict).toBe("PASS");
      expect(serialized).not.toContain(RAW_BODY_SENTINEL);
      expect(serialized).not.toContain(CREDENTIAL_SENTINEL);
      expect(serialized).not.toContain(project);
      expect(serialized).not.toMatch(/(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,})/i);
      mkdirSync(join(process.cwd(), "artifacts", "test-results"), { recursive: true });
      writeFileSync(REPORT_PATH, serialized, "utf8");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }, 180_000);
});

function extensionHarness() {
  const tools = new Map<string, RegisteredTool>();
  const commands = new Map<string, RegisteredCommand>();
  const handlers = new Map<string, Handler>();
  registerAiliCompact({
    registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); },
    registerCommand(name: string, command: { handler: RegisteredCommand }) { commands.set(name, command.handler); },
    on(event: string, handler: Handler) { handlers.set(event, handler); },
    appendEntry() {},
    sendUserMessage() {},
    getAllTools() { return [...tools.values()].map((tool) => ({ name: tool.name, description: tool.name, parameters: {} })); },
    getActiveTools() { return [...tools.keys()]; },
  } as unknown as ExtensionAPI);
  return { tools, commands, handlers };
}

function extensionContext(
  project: string,
  entries: BranchSessionEntry[],
  initialLeafId: string,
  sessionId: string,
) {
  const notifications: string[] = [];
  const statuses: string[] = [];
  let leafId: string | null = initialLeafId;
  return {
    cwd: project,
    model: {
      provider: "openai",
      id: "gpt-4.1",
      api: "openai-responses",
      name: "credential-free performance fixture",
      baseUrl: "https://fixture.invalid",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 4_096,
    },
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 100, contextWindow: 128_000 }),
    compact() {},
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionFile: () => join(project, "fixture-session.jsonl"),
      getLeafId: () => leafId,
      getBranch: () => entries,
    },
    setLeafId(value: string | null) { leafId = value; },
    ui: {
      setStatus(_key: string, value: string) { statuses.push(value); },
      setWidget() {},
      notify(value: string) { notifications.push(value); },
    },
    notifications,
    statuses,
  };
}

async function doctor(runtime: ReturnType<typeof extensionHarness>, ctx: ReturnType<typeof extensionContext>): Promise<any> {
  ctx.notifications.length = 0;
  await runtime.commands.get("aili-compact")!("doctor", ctx);
  const serialized = ctx.notifications.at(-1);
  if (!serialized) throw new Error("AILI Compact doctor did not publish a report");
  return JSON.parse(serialized);
}

async function compactStatus(
  runtime: ReturnType<typeof extensionHarness>,
  ctx: ReturnType<typeof extensionContext>,
  params: { offset: number; limit: number },
): Promise<any> {
  const result = await runtime.tools.get("aili_compact_status")!.execute("status", params, undefined, undefined, ctx);
  if (result.isError) throw new Error(result.content?.[0]?.text ?? "compact status failed");
  return JSON.parse(result.content[0].text);
}

function indexCounters(report: any): BranchIndexCounters {
  const counters = report?.index?.counters ?? report?.components?.index?.counters;
  if (!counters || typeof counters !== "object") throw new Error("AILI Compact report omitted BranchIndex counters");
  return Object.fromEntries(BRANCH_INDEX_COUNTER_KEYS.map((key) => [key, Number(counters[key])])) as unknown as BranchIndexCounters;
}

function counterDelta(before: BranchIndexCounters, after: BranchIndexCounters): BranchIndexCounters {
  return Object.fromEntries(BRANCH_INDEX_COUNTER_KEYS.map((key) => [key, after[key] - before[key]])) as unknown as BranchIndexCounters;
}

function withoutCounter(counters: BranchIndexCounters, excluded: keyof BranchIndexCounters): BranchIndexCounters {
  return Object.fromEntries(BRANCH_INDEX_COUNTER_KEYS.map((key) => [key, key === excluded ? 0 : counters[key]])) as unknown as BranchIndexCounters;
}

function writePerformanceConfig(project: string): void {
  mkdirSync(join(project, ".pi"), { recursive: true });
  writeFileSync(join(project, ".pi", "aili-compact.jsonc"), JSON.stringify({
    enabled: true,
    manualMode: false,
    planning: { enabled: true },
    quality: { enabled: true, warningPolicy: "record" },
    providerSuffix: { enabled: false },
    index: { enabled: true, snapshotLru: 4 },
    checkpoint: { autoRescue: true, deterministic: true },
    protection: {
      preserveRecentAtoms: 8,
      preserveRecentTokens: 12_000,
      preserveRecentTokenCapRatio: 0.10,
    },
  }), "utf8");
}

function fixedSeedCorpus(): PerformanceCorpus {
  const rawEntries: BranchSessionEntry[] = [];
  let seed = FIXED_SEED;
  let protocolFaults = 0;
  for (let ordinal = 1; ordinal <= PROVIDER_MESSAGE_COUNT - 4; ordinal += 1) {
    seed = nextSeed(seed);
    const id = `production-${String(ordinal).padStart(6, "0")}`;
    const parentId = rawEntries.at(-1)?.id;
    let entry: BranchSessionEntry;
    if (ordinal === 998) {
      protocolFaults += 1;
      entry = toolCall(id, "production-unresolved", "read", parentId);
    } else if (ordinal === 1_999) {
      protocolFaults += 1;
      entry = toolResult(id, "production-orphan", "read", parentId, "orphan");
    } else if (ordinal === 3_000) {
      entry = toolCall(id, "production-duplicate-result", "read", parentId);
    } else if (ordinal === 3_001 || ordinal === 3_002) {
      if (ordinal === 3_002) protocolFaults += 1;
      entry = toolResult(id, "production-duplicate-result", "read", parentId, "duplicate-result");
    } else {
      entry = message(
        id,
        ordinal === 41 || ordinal === 43 ? "user" : ordinal % 2 === 0 ? "assistant" : "user",
        ordinal === 41 || ordinal === 43
          ? DUPLICATE_BODY
          : ordinal === 5_000
            ? `${RAW_BODY_SENTINEL}:${CREDENTIAL_SENTINEL}`
            : `fixed-message-${ordinal}-${seed % 64}`,
        parentId,
      );
    }
    rawEntries.push(entry);
  }
  appendLegacyTransactions(rawEntries);
  appendV3Lifecycle(rawEntries);
  const forkMarkerId = "performance-selected-fork-marker";
  rawEntries.push(custom(forkMarkerId, {
    schema: "aili.performance.fork-marker.v1",
    selected: "right",
    sharedPrefixOrdinal: 9_000,
  }, rawEntries.at(-1)?.id));
  const epochMarkerId = "performance-epoch-lifecycle-marker";
  rawEntries.push(custom(epochMarkerId, {
    schema: "aili.performance.epoch-marker.v1",
    current: "root",
    archivedFixture: "performance-archived-epoch",
  }, rawEntries.at(-1)?.id));

  const guarded = guardAllEntries(rawEntries);
  const providerMessages = guarded.entries
    .filter((entry) => entry.type === "message")
    .map((entry) => entry.message as Record<string, unknown>);
  expect(providerMessages).toHaveLength(PROVIDER_MESSAGE_COUNT);
  return {
    entries: guarded.entries,
    entryGuard: guarded.guard,
    providerMessages,
    duplicateEntryIds: ["production-000041", "production-000043"],
    protocolFaults,
    schemaTransactions: { v1: 1, v2: 1, v3: 5 },
    markerIds: { fork: forkMarkerId, epoch: epochMarkerId },
  };
}

function productionProviderInput(
  messages: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return messages.map((message, index) => PROTOCOL_FAULT_PROVIDER_ORDINALS.has(index + 1)
    ? {
        role: "custom",
        customType: TRANSIENT_SUFFIX_TYPE,
        content: `bounded transient fault-atom exclusion ${index + 1}`,
      }
    : message);
}

function guardAllEntries(entries: readonly BranchSessionEntry[]): { entries: BranchSessionEntry[]; guard: SharedEntryGuard } {
  let armed = false;
  let touchCount = 0;
  const guarded = entries.map((entry) => new Proxy(entry, {
    get(target, property, receiver) {
      if (armed) {
        touchCount += 1;
        throw new Error(`production indexed path reread Session source entry: ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
    ownKeys(target) {
      if (armed) {
        touchCount += 1;
        throw new Error("production indexed path re-enumerated Session source entry");
      }
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  }));
  return {
    entries: guarded,
    guard: {
      arm() { armed = true; },
      disarm() { armed = false; },
      touches() { return touchCount; },
    },
  };
}

function guardBranchContainer(entries: BranchSessionEntry[]): BranchContainerGuard {
  let armed = false;
  let firstAllowedIndex = Number.POSITIVE_INFINITY;
  let oldTouches = 0;
  let allowedTouches = 0;
  const perIndex = new Map<number, number>();
  const proxy = new Proxy(entries, {
    get(target, property, receiver) {
      if (armed && typeof property === "string" && /^\d+$/.test(property)) {
        const index = Number(property);
        perIndex.set(index, (perIndex.get(index) ?? 0) + 1);
        if (index < firstAllowedIndex) {
          oldTouches += 1;
          throw new Error(`production indexed path scanned pre-tip Session container index ${index}`);
        }
        allowedTouches += 1;
      }
      return Reflect.get(target, property, receiver);
    },
    ownKeys(target) {
      if (armed) {
        oldTouches += 1;
        throw new Error("production indexed path enumerated the selected-branch container");
      }
      return Reflect.ownKeys(target);
    },
  });
  return {
    proxy,
    arm(value: number) { armed = true; firstAllowedIndex = value; },
    disarm() { armed = false; },
    oldIndexTouches() { return oldTouches; },
    allowedIndexTouches() { return allowedTouches; },
  };
}

function guardProviderMessages(messages: readonly Record<string, unknown>[]): ProviderGuard {
  let numericReads = 0;
  let repeatedNumericReads = 0;
  let objectKeyWalks = 0;
  let repeatedObjectKeyWalks = 0;
  let repeatedPropertyReads = 0;
  const identityToOrdinal = new Map<object, number>();
  const guardedMessages = messages.map((message, ordinal) => {
    let keyWalks = 0;
    const propertyReads = new Map<PropertyKey, number>();
    const guarded = new Proxy(message, {
      ownKeys(target) {
        keyWalks += 1;
        objectKeyWalks += 1;
        if (keyWalks > 1) {
          repeatedObjectKeyWalks += 1;
          throw new Error(`provider message ${ordinal} was enumerated more than once`);
        }
        return Reflect.ownKeys(target);
      },
      get(target, property, receiver) {
        if (Object.prototype.hasOwnProperty.call(target, property)) {
          const reads = (propertyReads.get(property) ?? 0) + 1;
          propertyReads.set(property, reads);
          if (reads > 1) {
            repeatedPropertyReads += 1;
            throw new Error(`provider message ${ordinal} property ${String(property)} was reread`);
          }
        }
        return Reflect.get(target, property, receiver);
      },
      getOwnPropertyDescriptor(target, property) {
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    identityToOrdinal.set(guarded, ordinal);
    return guarded;
  });
  const perIndex = new Map<number, number>();
  const container = new Proxy(guardedMessages, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) {
        const index = Number(property);
        const reads = (perIndex.get(index) ?? 0) + 1;
        perIndex.set(index, reads);
        numericReads += 1;
        if (reads > 1) {
          repeatedNumericReads += 1;
          throw new Error(`provider message container index ${index} was reread`);
        }
      }
      return Reflect.get(target, property, receiver);
    },
    ownKeys() {
      throw new Error("provider message container was enumerated instead of visited once by index");
    },
  });
  return {
    messages: container,
    identityToOrdinal,
    numericReads: () => numericReads,
    repeatedNumericReads: () => repeatedNumericReads,
    objectKeyWalks: () => objectKeyWalks,
    repeatedObjectKeyWalks: () => repeatedObjectKeyWalks,
    repeatedPropertyReads: () => repeatedPropertyReads,
  };
}

function buildPureProjection(
  entries: readonly BranchSessionEntry[],
  messages: readonly Record<string, unknown>[],
  state: ReturnType<typeof reduceCompactState>,
  view: V3RuntimeView,
) {
  const alignment = alignEntriesToMessages(entries, messages);
  expect(alignment.diagnostic).toBeUndefined();
  const legacy = projectMessages(messages, state, alignment.byEntryId, {
    blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
  });
  expect(legacy.diagnostic).toBeUndefined();
  const projectedAlignment = alignEntriesToMessages(entries, legacy.messages);
  expect(projectedAlignment.diagnostic).toBeUndefined();
  const v3 = projectV3Messages({
    replay: view.replay,
    entries,
    messages: legacy.messages,
    alignment: projectedAlignment,
    blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
  });
  expect(v3.diagnostic).toBeUndefined();
  return v3;
}

function projectionPattern(
  messages: readonly Record<string, unknown>[],
  sourceOrdinals: ReadonlyMap<object, number>,
): readonly string[] {
  return messages.map((message) => {
    const ordinal = sourceOrdinals.get(message);
    return ordinal === undefined
      ? `owned:${digest(canonicalJson(message))}`
      : `source:${ordinal}`;
  });
}

function appendLegacyTransactions(entries: BranchSessionEntry[]): void {
  const v1SourceId = "production-000010";
  const v1Block: CompactBlock = {
    id: "performance-legacy-v1-block",
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [v1SourceId],
    sourceDigest: sourceDigest(entries, [v1SourceId]),
    summary: "legacy v1 summary",
    active: true,
  };
  appendCommittedLegacy(entries, {
    schema: AILI_COMPACT_SCHEMA_V1,
    id: "performance-legacy-v1-create",
    kind: "compact",
    epochId: "root",
    sourceEntryIds: [v1SourceId],
    sourceDigest: v1Block.sourceDigest,
    blocks: [v1Block],
  });

  const v2SourceId = "production-000020";
  const v2Block: CompactBlock = {
    id: "performance-legacy-v2-block",
    kind: "semantic",
    epochId: "root",
    sourceEntryIds: [v2SourceId],
    sourceDigest: sourceDigest(entries, [v2SourceId]),
    summary: "legacy v2 summary",
    active: true,
    mode: "message",
    topic: "legacy-v2",
    batchTopic: "legacy-v2",
    anchorEntryId: v2SourceId,
    runId: "performance-legacy-v2-run",
    childBlockIds: [],
    generation: "young",
    survivedCount: 0,
    age: 0,
  };
  appendCommittedLegacy(entries, {
    schema: AILI_COMPACT_SCHEMA_V2,
    id: "performance-legacy-v2-create",
    kind: "compact",
    epochId: "root",
    sourceEntryIds: [v2SourceId],
    sourceDigest: v2Block.sourceDigest,
    blocks: [v2Block],
  });
}

function appendCommittedLegacy(entries: BranchSessionEntry[], transaction: CompactTransaction): void {
  const call = toolCall(
    `${transaction.id}-call`,
    transaction.id,
    "aili_compact",
    entries.at(-1)?.id,
  );
  entries.push(call);
  entries.push({
    id: `${transaction.id}-result`,
    type: "message",
    parentId: call.id,
    message: {
      role: "toolResult",
      toolCallId: transaction.id,
      toolName: "aili_compact",
      content: "committed",
      details: { contextTx: transaction },
    },
  });
}

function appendV3Lifecycle(entries: BranchSessionEntry[]): void {
  let state = createEmptyV3State({
    sessionId: "production-performance-session",
    branchLeafId: "performance-v3-leaf",
    epochId: "root",
    projectionVersion: "aili.projector.v3",
  });
  const sourceA = "production-000200";
  const sourceB = "production-000201";

  const firstCatalog = publicCatalogId(entries, state);
  const first = t1(state, "performance-v3-t1-a", sourceA, 1, firstCatalog);
  state = applied(state, first, firstCatalog, new Map([[sourceA, 200]]));
  entries.push(custom("performance-v3-t1-a-entry", first, entries.at(-1)?.id));

  const secondCatalog = publicCatalogId(entries, state);
  const second = t1(state, "performance-v3-t1-b", sourceB, 2, secondCatalog);
  state = applied(state, second, secondCatalog, new Map([[sourceB, 201]]));
  entries.push(custom("performance-v3-t1-b-entry", second, entries.at(-1)?.id));

  const parentCatalog = publicCatalogId(entries, state);
  const parent = t2(state, parentCatalog);
  state = applied(state, parent, parentCatalog);
  entries.push(custom("performance-v3-t2-entry", parent, entries.at(-1)?.id));

  const decompressCatalog = publicCatalogId(entries, state);
  const decompress: V3Transaction = {
    header: v3Header(state, "performance-v3-decompress-one", 4, decompressCatalog),
    tag: "decompress",
    payload: {
      rootBlockIds: ["performance-v3-t2"],
      depth: "one",
      provenance: { kind: "explicit-user", id: "performance-decompress-request" },
      reason: "decompress",
    },
  };
  state = applied(state, decompress, decompressCatalog);
  entries.push(custom("performance-v3-decompress-entry", decompress, entries.at(-1)?.id));

  const recompressCatalog = publicCatalogId(entries, state);
  const recompress: V3Transaction = {
    header: v3Header(state, "performance-v3-exact-recompress", 5, recompressCatalog),
    tag: "recompress",
    payload: {
      rootBlockIds: ["performance-v3-t2"],
      decompressionTxId: "performance-v3-decompress-one",
      provenance: { kind: "explicit-user", id: "performance-recompress-request" },
      reason: "recompress",
    },
  };
  applied(state, recompress, recompressCatalog);
  entries.push(custom("performance-v3-recompress-entry", recompress, entries.at(-1)?.id));
}

function t1(
  state: V3LifecycleState,
  blockId: string,
  entryId: string,
  createdAt: number,
  catalogId: string,
): V3Transaction {
  const summary = `summary:${blockId}`;
  return semantic(state, `tx:${blockId}`, createdAt, catalogId, {
    blockId,
    tier: "T1",
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: entryId,
    createdTurnOrdinal: createdAt,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "messages", entryIds: [entryId], firstEntryId: entryId, lastEntryId: entryId },
    leafDigest: v3MessageLeafDigest([entryId]),
    leafCount: 1,
    tokens: tokenMetadata("T1"),
    quality: qualityMetadata(),
  });
}

function t2(state: V3LifecycleState, catalogId: string): V3Transaction {
  const children = [state.blocks.get("performance-v3-t1-a")!, state.blocks.get("performance-v3-t1-b")!];
  const summary = "summary:performance-v3-t2";
  return semantic(state, "tx:performance-v3-t2", 3, catalogId, {
    blockId: "performance-v3-t2",
    tier: "T2",
    topic: "topic:performance-v3-t2",
    runId: "run:performance-v3-t2",
    anchorEntryId: children[0]!.anchorEntryId,
    createdTurnOrdinal: 3,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "blocks", childBlockIds: children.map((block) => block.blockId) },
    leafDigest: v3ParentLeafDigest("T2", 2, children.map((block) => block.leafDigest)),
    leafCount: 2,
    tokens: tokenMetadata("T2"),
    quality: qualityMetadata(),
  });
}

function semantic(
  state: V3LifecycleState,
  txId: string,
  createdAt: number,
  catalogId: string,
  payload: V3SemanticCreatePayload,
): V3Transaction {
  return { header: v3Header(state, txId, createdAt, catalogId), tag: "semantic-create", payload };
}

function v3Header(state: V3LifecycleState, txId: string, createdAt: number, catalogId: string) {
  return {
    schema: AILI_COMPACT_SCHEMA_V3,
    txId,
    sessionId: state.sessionId,
    branchLeafId: state.branchLeafId,
    epochId: state.epochId,
    catalogId,
    createdAt,
    projectionVersion: state.projectionVersion,
  } as const;
}

function tokenMetadata(tier: V3Tier): V3TokenMetadata {
  const sourceTokensLower = 3_000;
  const replacementTokensUpper = tier === "T1" ? 1_000 : 1_500;
  const steadySavingsTokensLower = sourceTokensLower - replacementTokensUpper;
  return {
    estimatorVersion: "fixture-estimator-v1",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    sourceTokensLower,
    sourceTokensUpper: sourceTokensLower,
    replacementTokensUpper,
    steadySavingsTokensLower,
    oneTimeCostTokensUpper: 500,
    breakEvenTurnsUpper: Math.ceil(500 / steadySavingsTokensLower),
    savingsRatio: steadySavingsTokensLower / sourceTokensLower,
    summaryTokensUpper: 300,
  };
}

function qualityMetadata() {
  return {
    status: "accepted" as const,
    evaluatorVersion: "aili.quality.v1",
    sourceFactDigest: FACT_DIGEST,
    hardFactCount: 1,
    coveredHardFactCount: 1,
    warningCodes: [] as string[],
  };
}

function applied(
  state: V3LifecycleState,
  transaction: V3Transaction,
  expectedCatalogId: string,
  messageOrdinals?: ReadonlyMap<string, number>,
): V3LifecycleState {
  const result = applyV3Transaction(state, transaction, {
    expectedCatalogId,
    ...(messageOrdinals ? { messageOrdinals } : {}),
  });
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function publicCatalogId(entries: readonly BranchSessionEntry[], state: V3LifecycleState): string {
  return deriveRuntimeCatalogIdForState(entries, reduceCompactState(entries), state);
}

function exerciseForkEpochLruAndCleanup(snapshot: BranchIndexSnapshot) {
  const cache = new BranchIndexCache(4);
  cache.install({ ok: true, operation: "cold-build", snapshot, counters: emptyBranchIndexCounters() });
  const proof = branchAncestryProof(snapshot)!;
  const main = cache.append({
    entries: [message("performance-main-fork", "assistant", "main", snapshot.tipEntryId)],
    nextBranchLeafId: "performance-main-fork",
  });
  expect(main?.ok).toBe(true);
  expect(cache.switchCached(snapshot.key, proof).ok).toBe(true);
  const fork = cache.append({
    entries: [message("performance-sibling-fork", "assistant", "sibling", snapshot.tipEntryId)],
    nextBranchLeafId: "performance-sibling-fork",
  });
  expect(fork?.ok).toBe(true);
  if (!main?.ok || !fork?.ok) throw new Error("fork fixture failed");

  for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
    const entry = message(`performance-lru-${ordinal}`, "user", `lru-${ordinal}`);
    const built = coldBuildBranchIndex({
      key: branchKey(entry.id, `performance-lru-epoch-${ordinal}`),
      entries: [entry],
    });
    expect(built.ok).toBe(true);
    if (built.ok) cache.install(built);
  }
  expect(cache.size).toBe(4);
  expect(cache.counters().snapshotEvictions).toBeGreaterThanOrEqual(1);

  const epochCache = new BranchIndexCache(4);
  epochCache.install({ ok: true, operation: "cold-build", snapshot, counters: emptyBranchIndexCounters() });
  const epochEntry = message("performance-new-epoch-entry", "user", "new epoch");
  const nextEpoch = epochCache.rolloverEpoch({
    key: branchKey(epochEntry.id, "performance-checkpoint-epoch"),
    entries: [epochEntry],
  });
  expect(nextEpoch.ok).toBe(true);
  const archived = epochCache.resolveArchivedMessage(snapshot.keyId, snapshot.catalogId, "m000001");
  const epochArchivedAndScoped = nextEpoch.ok
    && nextEpoch.counters.epochArchives === 1
    && archived.value?.entryId === "production-000001"
    && archived.diagnostic === undefined;
  expect(epochArchivedAndScoped).toBe(true);

  const faultCache = new BranchIndexCache(4);
  faultCache.install({ ok: true, operation: "cold-build", snapshot, counters: emptyBranchIndexCounters() });
  const failed = faultCache.append({ entries: [message("production-000001", "assistant", "duplicate", snapshot.tipEntryId)] });
  expect(failed?.ok).toBe(false);
  expect(failed?.counters).toEqual(expect.objectContaining({ fallbacks: 1, failOpenReturns: 1 }));
  const discarded = faultCache.discardSession(snapshot.key.sessionId, snapshot.key.canonicalSessionPathDigest);
  const faultCleanupDiscardedAll = discarded.sessionDiscards === 1
    && faultCache.size === 0
    && faultCache.archivedSize === 0
    && faultCache.current === undefined;
  expect(faultCleanupDiscardedAll).toBe(true);

  return {
    sharedPrefix: branchIndexesShareEntryPrefix(snapshot, main.snapshot)
      && branchIndexesShareEntryPrefix(snapshot, fork.snapshot),
    forkDigestsDiverged: main.snapshot.canonicalStateDigest !== fork.snapshot.canonicalStateDigest,
    epochArchivedAndScoped,
    lruObservedMax: cache.size,
    faultCleanupDiscardedAll,
  };
}

function branchKey(branchLeafId: string, epochId = "root"): BranchIndexKey {
  return {
    sessionId: "production-performance-session",
    canonicalSessionPathDigest: digest("fixed-performance-session-path"),
    branchLeafId,
    epochId,
    replayVersion: "aili.compact.v1-v3-index.v1",
  };
}

function message(id: string, role: string, content: unknown, parentId?: string): BranchSessionEntry {
  return { id, type: "message", ...(parentId ? { parentId } : {}), message: { role, content } };
}

function toolCall(id: string, toolCallId: string, name: string, parentId?: string): BranchSessionEntry {
  return {
    id,
    type: "message",
    ...(parentId ? { parentId } : {}),
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: toolCallId, name, arguments: {} }],
    },
  };
}

function toolResult(
  id: string,
  toolCallId: string,
  toolName: string,
  parentId: string | undefined,
  content: string,
): BranchSessionEntry {
  return {
    id,
    type: "message",
    ...(parentId ? { parentId } : {}),
    message: { role: "toolResult", toolCallId, toolName, content },
  };
}

function custom(id: string, data: unknown, parentId?: string): BranchSessionEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data, ...(parentId ? { parentId } : {}) };
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
}

function roundMillis(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
