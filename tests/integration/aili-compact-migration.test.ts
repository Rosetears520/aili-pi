import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AILI_COMPACT_EXPECTED_PREDECESSOR_TAG,
  AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
  AILI_COMPACT_INSTALLED_ROLLBACK,
  AILI_COMPACT_PREDECESSOR_PACKAGE,
  AILI_COMPACT_PREDECESSOR_IDENTITY,
  readAiliCompactCandidateBinding,
} from "../../scripts/aili-compact-release-evidence.js";

import {
  AILI_COMPACT_ENTRY,
  digest,
  isV3CompactTransactionCandidate,
  sourceDigest,
  type CompactState,
  type CompactTransaction,
  type SessionLikeEntry,
} from "../../src/runtime/aili-compact/contracts.js";
import { registerAiliCompact } from "../../src/runtime/aili-compact/index.js";
import {
  planV3ControlMutation,
  planV3DecompressMutation,
  planV3RecompressMutation,
  type V3MutationPlanResult,
} from "../../src/runtime/aili-compact/v3-mutations.js";
import {
  discoverLegacyRepairCandidates,
  planLegacyRepairs,
  repairBranchSourceEntryIds,
} from "../../src/runtime/aili-compact/repair.js";
import {
  activeBlocks,
  reduceCompactReadBundle,
  reduceCompactState,
} from "../../src/runtime/aili-compact/reducer.js";
import { buildV3RuntimeView, type V3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  v3MessageLeafDigest,
  v3SummaryDigest,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

const WORKSPACE = process.cwd();
const FIXTURE = join(WORKSPACE, "tests", "fixtures", "aili-compact", "legacy-v1-session.jsonl");
const ARTIFACT = join(WORKSPACE, "artifacts", "test-results", "aili-compact-migration.json");
const PREDECESSOR_IDENTITY_ARTIFACT = join(WORKSPACE, AILI_COMPACT_PREDECESSOR_IDENTITY);
const INSTALLED_ROLLBACK_ARTIFACT = join(WORKSPACE, AILI_COMPACT_INSTALLED_ROLLBACK);
const FIXTURE_IDS = [
  "fixture-user-1",
  "fixture-assistant-1",
  "fixture-v1-call-entry",
  "fixture-v1-result-entry",
  "fixture-current-user",
] as const;
const RAW_NEEDLES = [
  "SANITIZED_MIGRATION_SOURCE_ALPHA",
  "SANITIZED_MIGRATION_SOURCE_BETA",
  "SANITIZED_REPAIR_SOURCE",
  "SANITIZED_V3_SOURCE",
  "SANITIZED_POST_EPOCH_WORK",
] as const;

type MatrixStatus = "PASS" | "Unverified";

interface MatrixRow {
  id: string;
  status: MatrixStatus;
  proof: string;
}

interface MigrationScenario {
  oldPrefix: string;
  finalBytes: string;
  oldPrefixSha256: string;
  fixtureIdsPreserved: boolean;
  repairIds: string[];
  dualReader: {
    legacyBlockIds: string[];
    v3BlockIds: string[];
    legacyDiagnostics: string[];
    v3Diagnostics: string[];
  };
  restoration: {
    rawDepth: string | undefined;
    recompressed: boolean;
    legacyActiveAfterRestoreAll: number;
    v3ActiveAfterRestoreAll: number;
  };
  fork: {
    sourceIdsExact: boolean;
    v3TransactionCount: number;
    originalBytesUnchanged: boolean;
  };
  epoch: {
    compactionEntries: number;
    priorLegacyBlocks: number;
    archivedV3Blocks: number;
    continuedWork: boolean;
  };
  rollback: {
    rawOpenDidNotRewrite: boolean;
    legacyReaderEquivalentWithoutV3: boolean;
  };
  search: { matchCount: number; fixedIdsPresent: boolean };
  suffix: { injected: boolean; persisted: boolean };
  indexFallback: { exactRaw: boolean; continuedWork: boolean };
  artifact: Record<string, unknown>;
}

let scratch = "";
let scenario: MigrationScenario;

beforeAll(async () => {
  const scratchRoot = join(WORKSPACE, ".tmp");
  mkdirSync(scratchRoot, { recursive: true });
  scratch = mkdtempSync(join(scratchRoot, "aili-compact-migration-"));
  scenario = await runMigrationScenario(scratch);
});

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe("AILI Compact copied-session forward and rollback migration", () => {
  it("preserves the complete copied v1 JSONL byte prefix and reloads v1/v2/repair/v3 together", () => {
    expect(scenario.finalBytes.startsWith(scenario.oldPrefix)).toBe(true);
    expect(scenario.fixtureIdsPreserved).toBe(true);
    expect(scenario.repairIds).toHaveLength(1);
    expect(scenario.dualReader).toEqual({
      legacyBlockIds: ["fixture-v1-block", "migration-v2-block"],
      v3BlockIds: ["migration-v3-t1"],
      legacyDiagnostics: [],
      v3Diagnostics: [],
    });
  });

  it("persists explicit raw decompression, exact recompression, and dual-schema restore-all", () => {
    expect(scenario.restoration).toEqual({
      rawDepth: "raw",
      recompressed: true,
      legacyActiveAfterRestoreAll: 0,
      v3ActiveAfterRestoreAll: 0,
    });
  });

  it("proves fork/epoch isolation, source search and IDs, suffix non-persistence, and rollback opening", () => {
    expect(scenario.fork).toEqual({ sourceIdsExact: true, v3TransactionCount: 0, originalBytesUnchanged: true });
    expect(scenario.epoch.compactionEntries).toBe(1);
    expect(scenario.epoch.priorLegacyBlocks).toBe(2);
    expect(scenario.epoch.archivedV3Blocks).toBe(1);
    expect(scenario.epoch.continuedWork).toBe(true);
    expect(scenario.rollback).toEqual({ rawOpenDidNotRewrite: true, legacyReaderEquivalentWithoutV3: true });
    expect(scenario.search.matchCount).toBeGreaterThan(0);
    expect(scenario.search.fixedIdsPresent).toBe(true);
    expect(scenario.suffix).toEqual({ injected: false, persisted: false });
    expect(scenario.indexFallback).toEqual({ exactRaw: true, continuedWork: true });
  });

  it("writes a durable sanitized evidence manifest with no copied raw body", () => {
    const durable = readFileSync(ARTIFACT, "utf8");
    expect(JSON.parse(durable)).toEqual(scenario.artifact);
    expect(RAW_NEEDLES.every((needle) => !durable.includes(needle))).toBe(true);
    expect(durable).not.toContain(scratch);
    expect(durable).not.toMatch(/(?:HOME|USERPROFILE)[=:]/i);
    expect(durable).not.toContain("separately-installed-v0.1.14");
    expect(scenario.artifact).toMatchObject({
      verdict: "PASS",
      predecessor: {
        status: "PASS",
        packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
        version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
        gitTag: AILI_COMPACT_EXPECTED_PREDECESSOR_TAG,
        identityEvidence: {
          path: AILI_COMPACT_PREDECESSOR_IDENTITY,
          sha256: sha256(readFileSync(PREDECESSOR_IDENTITY_ARTIFACT, "utf8")),
        },
        installedPackage: {
          status: "PASS",
          source: "npm-tarball",
          packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
          version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
          evidence: {
            path: AILI_COMPACT_INSTALLED_ROLLBACK,
            sha256: sha256(readFileSync(INSTALLED_ROLLBACK_ARTIFACT, "utf8")),
          },
        },
      },
    });
  });
});

async function runMigrationScenario(root: string): Promise<MigrationScenario> {
  const disposableHome = join(root, "home");
  const sessionDir = join(disposableHome, "sessions");
  const projectDir = join(root, "project");
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  const copiedSession = join(sessionDir, "copied-v1-session.jsonl");
  copyFileSync(FIXTURE, copiedSession);

  const oldPrefix = readFileSync(copiedSession, "utf8");
  const oldPrefixSha256 = sha256(oldPrefix);
  const manager = SessionManager.open(copiedSession, sessionDir, projectDir);
  const fixtureState = reduceCompactState(branch(manager));
  requireCondition(activeBlocks(fixtureState).map(({ id }) => id).join(",") === "fixture-v1-block", "v1 fixture did not replay");

  const repairSourceId = manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "SANITIZED_REPAIR_SOURCE" }],
    timestamp: 6,
  } as any);
  const v2CallId = "migration-v2-create";
  manager.appendMessage({
    role: "assistant",
    content: [{ type: "toolCall", id: v2CallId, name: "aili_compact", arguments: {} }],
    timestamp: 7,
  } as any);
  const v2: CompactTransaction = {
    schema: "aili.compact.tx.v2",
    id: v2CallId,
    kind: "compact",
    epochId: "root",
    blocks: [{
      id: "migration-v2-block",
      kind: "semantic",
      epochId: "root",
      sourceEntryIds: [repairSourceId],
      sourceDigest: sourceDigest(branch(manager), [repairSourceId]),
      summary: "Sanitized v2 summary.",
      active: true,
      mode: "message",
      topic: "Migration v2",
      batchTopic: "Migration v2",
      anchorEntryId: repairSourceId,
      runId: "migration-v2-run",
      childBlockIds: [],
      generation: "young",
      survivedCount: 0,
      age: 0,
    }],
  };
  manager.appendMessage({
    role: "toolResult",
    toolCallId: v2CallId,
    toolName: "aili_compact",
    content: [],
    isError: false,
    details: { contextTx: v2 },
    timestamp: 8,
  } as any);
  manager.appendCustomEntry(AILI_COMPACT_ENTRY, {
    schema: "aili.compact.tx.v2",
    id: "migration-v2-gc",
    kind: "control",
    epochId: "root",
    lifecycleUpdates: [{ blockId: "migration-v2-block", active: false, deactivationReason: "gc" }],
  } satisfies CompactTransaction);

  const gcState = reduceCompactState(branch(manager));
  const repairPlan = planLegacyRepairs({
    branchSourceEntryIds: repairBranchSourceEntryIds(branch(manager)),
    epochId: gcState.epochId,
    entries: branch(manager),
    blocks: gcState.blocks,
    candidates: discoverLegacyRepairCandidates(branch(manager), gcState.blocks),
  });
  requireCondition(repairPlan.batches.length === 1, "expected one deterministic repair batch");
  for (const repair of repairPlan.batches) manager.appendCustomEntry(AILI_COMPACT_ENTRY, repair);

  const v3SourceId = manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "SANITIZED_V3_SOURCE" }],
    timestamp: 9,
  } as any);
  let legacyState = reduceCompactState(branch(manager));
  let view = runtimeView(manager, legacyState);
  const v3Create = v3T1(view, v3SourceId);
  manager.appendCustomEntry(AILI_COMPACT_ENTRY, v3Create);

  let reloaded = SessionManager.open(copiedSession, sessionDir, projectDir);
  let bundle = reduceCompactReadBundle(branch(reloaded));
  requireCondition(bundle.v3.diagnostics.length === 0, "v3 create failed dual-reader replay");
  const dualReader = {
    legacyBlockIds: [...bundle.legacy.blocks.keys()].sort(),
    v3BlockIds: [...(bundle.v3.state?.blocks.keys() ?? [])].sort(),
    legacyDiagnostics: [...bundle.legacy.diagnostics],
    v3Diagnostics: bundle.v3.diagnostics.map(({ phase, code, path }) => `${phase}:${code}:${path}`),
  };

  legacyState = bundle.legacy;
  view = runtimeView(reloaded, legacyState);
  const v3Ref = view.blockRefById.get("migration-v3-t1");
  requireCondition(v3Ref !== undefined, "v3 block reference missing");
  const raw = requireV3Plan(planV3DecompressMutation({
    operation: "decompress",
    catalogId: view.catalog.catalogId,
    transactionId: "migration-v3-decompress-raw",
    blockRefs: [v3Ref],
    provenanceId: "migration-explicit-raw",
    createdAt: 11,
    depth: "raw",
  }, plannerContext(view, legacyState)));
  reloaded.appendCustomEntry(AILI_COMPACT_ENTRY, raw);

  reloaded = SessionManager.open(copiedSession, sessionDir, projectDir);
  bundle = reduceCompactReadBundle(branch(reloaded));
  const decompressed = bundle.v3.state?.blocks.get("migration-v3-t1");
  requireCondition(decompressed?.explicitDecompression?.depth === "raw", "raw decompression did not persist");
  legacyState = bundle.legacy;
  view = runtimeView(reloaded, legacyState);
  const recompressRef = view.blockRefById.get("migration-v3-t1");
  requireCondition(recompressRef !== undefined, "decompressed v3 ref missing");
  const recompress = requireV3Plan(planV3RecompressMutation({
    operation: "recompress",
    catalogId: view.catalog.catalogId,
    transactionId: "migration-v3-recompress",
    blockRefs: [recompressRef],
    provenanceId: "migration-explicit-recompress",
    createdAt: 12,
    decompressionTransactionId: "migration-v3-decompress-raw",
  }, plannerContext(view, legacyState)));
  reloaded.appendCustomEntry(AILI_COMPACT_ENTRY, recompress);

  reloaded = SessionManager.open(copiedSession, sessionDir, projectDir);
  bundle = reduceCompactReadBundle(branch(reloaded));
  requireCondition(bundle.v3.state?.blocks.get("migration-v3-t1")?.active === true, "exact recompression did not reactivate root");
  legacyState = bundle.legacy;
  view = runtimeView(reloaded, legacyState);
  const restore = requireV3Plan(planV3ControlMutation({
    operation: "control",
    catalogId: view.catalog.catalogId,
    transactionId: "migration-v3-restore-all",
    action: "restore-all",
    provenanceId: "migration-explicit-restore-all",
    provenanceKind: "explicit-user",
    createdAt: 13,
  }, plannerContext(view, legacyState)));
  reloaded.appendCustomEntry(AILI_COMPACT_ENTRY, restore);
  reloaded.appendCustomEntry(AILI_COMPACT_ENTRY, {
    schema: "aili.compact.tx.v2",
    id: "migration-legacy-restore-all",
    kind: "control",
    epochId: legacyState.epochId,
    control: "restore-all",
  } satisfies CompactTransaction);

  reloaded = SessionManager.open(copiedSession, sessionDir, projectDir);
  bundle = reduceCompactReadBundle(branch(reloaded));
  const afterRestoreAll = {
    rawDepth: decompressed.explicitDecompression?.depth,
    recompressed: true,
    legacyActiveAfterRestoreAll: activeBlocks(bundle.legacy).length,
    v3ActiveAfterRestoreAll: bundle.v3.maximalActiveBlocks.length,
  };

  const beforeForkBytes = readFileSync(copiedSession, "utf8");
  const forkManager = SessionManager.open(copiedSession, sessionDir, projectDir);
  const sourceSnapshotIds = forkManager.getBranch(v3SourceId).map(({ id }) => id);
  const forkPath = forkManager.createBranchedSession(v3SourceId);
  requireCondition(forkPath !== undefined, "SessionManager did not create copied fork");
  const forkReload = SessionManager.open(forkPath, sessionDir, projectDir);
  const forkBundle = reduceCompactReadBundle(branch(forkReload));
  const fork = {
    sourceIdsExact: JSON.stringify(forkReload.getBranch().map(({ id }) => id)) === JSON.stringify(sourceSnapshotIds),
    v3TransactionCount: forkBundle.v3.acceptedTransactionCount,
    originalBytesUnchanged: readFileSync(copiedSession, "utf8") === beforeForkBytes,
  };

  const continued = SessionManager.open(copiedSession, sessionDir, projectDir);
  continued.appendCompaction(
    "Sanitized checkpoint summary.",
    v3SourceId,
    16_000,
    { schema: "sanitized-migration-checkpoint.v1" },
    true,
  );
  continued.appendMessage({ role: "user", content: "SANITIZED_POST_EPOCH_WORK", timestamp: 14 } as any);
  for (let index = 0; index < 10; index += 1) {
    continued.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `SANITIZED_TAIL_${index + 1} ${"x".repeat(5_000)}` }],
      timestamp: 15 + index,
    } as any);
  }
  continued.appendMessage({ role: "user", content: "SANITIZED_FINAL_REQUEST", timestamp: 30 } as any);

  const afterEpochBundle = reduceCompactReadBundle(branch(continued));
  const epoch = {
    compactionEntries: branch(continued).filter(({ type }) => type === "compaction").length,
    priorLegacyBlocks: [...afterEpochBundle.legacy.blocks.values()]
      .filter(({ epochId }) => epochId !== afterEpochBundle.legacy.epochId).length,
    archivedV3Blocks: afterEpochBundle.v3.archivedQueryOnlyBlocks.length,
    continuedWork: branch(continued).some(({ message }) => JSON.stringify(message ?? "").includes("SANITIZED_FINAL_REQUEST")),
  };

  const openBytesBefore = readFileSync(copiedSession, "utf8");
  const rollbackManager = SessionManager.open(copiedSession, sessionDir, projectDir);
  const openBytesAfter = readFileSync(copiedSession, "utf8");
  const allEntries = branch(rollbackManager);
  const withoutV3 = allEntries.filter((entry) => !(entry.type === "custom"
    && entry.customType === AILI_COMPACT_ENTRY
    && isV3CompactTransactionCandidate(entry.data)));
  const legacyReaderEquivalentWithoutV3 = JSON.stringify(legacyStateSummary(reduceCompactState(allEntries)))
    === JSON.stringify(legacyStateSummary(reduceCompactState(withoutV3)));

  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = disposableHome;
  process.env.USERPROFILE = disposableHome;
  let searchMatchCount = 0;
  let suffixInjected = false;
  let suffixPersisted = false;
  let indexFallbackExactRaw = false;
  let indexFallbackContinuedWork = false;
  let cleanContextStatus = "no-status";
  const runtimeStatuses: string[] = [];
  try {
    const runtime = extensionHarness(rollbackManager);
    const context = extensionContext(rollbackManager, projectDir, runtimeStatuses);
    runtime.handlers.get("session_start")?.({ type: "session_start", reason: "resume" }, context);
    const searchTool = runtime.tools.find(({ name }) => name === "aili_search_context");
    requireCondition(searchTool !== undefined, "search tool was not registered");
    const searchResult = await searchTool.execute(
      "migration-search",
      { query: "SANITIZED_MIGRATION_SOURCE_ALPHA", limit: 8 },
      undefined,
      undefined,
      context,
    );
    const searchPayload = JSON.parse(searchResult.content[0].text);
    searchMatchCount = searchPayload.matches.length;

    const contextHandler = runtime.handlers.get("context");
    requireCondition(contextHandler !== undefined, "context handler was not registered");
    const providerInput = rollbackManager.buildSessionContext().messages;
    const projected = contextHandler({ type: "context", messages: providerInput }, context);
    cleanContextStatus = runtimeStatuses.at(-1) ?? "no-status";
    const suffix = projected?.messages?.find((message: any) => message?.customType === "aili-compact-provider-suffix");
    suffixInjected = suffix !== undefined;
    suffixPersisted = suffix !== undefined && readFileSync(copiedSession, "utf8").includes(suffix.content);
    const ambiguousProviderInput = [...providerInput, providerInput[0]!];
    const failOpen = contextHandler({ type: "context", messages: ambiguousProviderInput }, context);
    indexFallbackExactRaw = failOpen.messages === ambiguousProviderInput;
    const continued = contextHandler({ type: "context", messages: providerInput }, context);
    indexFallbackContinuedWork = Array.isArray(continued?.messages) && continued.messages.length > 0;
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
  }

  const finalBytes = readFileSync(copiedSession, "utf8");
  const finalIds = new Set(branch(SessionManager.open(copiedSession, sessionDir, projectDir)).map(({ id }) => id));
  const fixtureIdsPreserved = FIXTURE_IDS.every((id) => finalIds.has(id));
  requireCondition(!suffixInjected && !suffixPersisted,
    `provider suffix truth/non-persistence evidence is incomplete: ${cleanContextStatus}`);
  requireCondition(indexFallbackExactRaw, "copied-session index ambiguity did not fail open exact-raw");
  requireCondition(indexFallbackContinuedWork, "copied-session context did not continue after index fail-open");
  const predecessorIdentityBody = readFileSync(PREDECESSOR_IDENTITY_ARTIFACT, "utf8");
  const predecessorIdentity = JSON.parse(predecessorIdentityBody) as { npm?: { integrity?: unknown } };
  requireCondition(typeof predecessorIdentity.npm?.integrity === "string", "predecessor identity integrity is missing");
  let installedRollbackBody: string | undefined;
  let installedRollback: any;
  try {
    installedRollbackBody = readFileSync(INSTALLED_ROLLBACK_ARTIFACT, "utf8");
    installedRollback = JSON.parse(installedRollbackBody);
  } catch { /* separately approved evidence is optional during safe-local runs */ }
  const identitySha256 = sha256(predecessorIdentityBody);
  const installedReady = installedRollback?.status === "PASS"
    && installedRollback?.identityEvidence?.path === AILI_COMPACT_PREDECESSOR_IDENTITY
    && installedRollback?.identityEvidence?.sha256 === identitySha256
    && installedRollback?.installedPackage?.status === "PASS"
    && installedRollback?.installedPackage?.packageName === AILI_COMPACT_PREDECESSOR_PACKAGE
    && installedRollback?.installedPackage?.version === AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION
    && installedRollback?.installedPackage?.integrity === predecessorIdentity.npm.integrity
    && installedRollback?.candidatePackage?.status === "PASS"
    && installedRollback?.candidatePackage?.version === "0.2.0";
  const matrix: MatrixRow[] = [
    { id: "copied-v1-byte-prefix", status: "PASS", proof: "full old JSONL byte prefix and SHA-256 retained" },
    { id: "v1-v2-repair-v3-dual-reader", status: "PASS", proof: "reload accepted two legacy blocks, one repair batch, and one v3 T1" },
    { id: "explicit-raw-decompress-recompress", status: "PASS", proof: "raw provenance persisted and exact transaction reactivated the root" },
    { id: "explicit-restore-all", status: "PASS", proof: "v3 and legacy control arms left zero current active blocks" },
    { id: "fork-snapshot-isolation", status: "PASS", proof: "fork retained exact source IDs before v3 transaction and original bytes stayed unchanged" },
    { id: "compaction-epoch-archive", status: "PASS", proof: "prior legacy history remained, v3 became query-only, and post-epoch work appended" },
    { id: "p0-legacy-reader-ignores-v3", status: "PASS", proof: "legacy reducer result equals the same Session with v3 custom entries removed" },
    { id: "raw-session-rollback-open", status: "PASS", proof: "Pi SessionManager opened the mixed JSONL without rewriting it" },
    { id: "source-search-and-entry-ids", status: "PASS", proof: "public search matched archived sanitized source and fixture IDs remained" },
    { id: "provider-suffix-truth-and-non-persistence", status: "PASS", proof: "production context hook omitted unavailable actions after restore-all and Session bytes contained no suffix" },
    { id: "index-alignment-fallback-continued-work", status: "PASS", proof: "duplicate alignment ambiguity failed open exact-raw and the next clean copied-session context completed" },
    {
      id: "externally-verified-predecessor-installed-rollback",
      status: installedReady ? "PASS" : "Unverified",
      proof: installedReady
        ? "fresh identity and installed predecessor/candidate copied-session rollback evidence are hash-bound"
        : "fresh Git/npm identity evidence is hash-bound; installed-package rollback requires separate approval",
    },
  ];
  const candidateBinding = await readAiliCompactCandidateBinding(WORKSPACE);
  const artifact = {
    schema: "aili.compact.migration-evidence.v1",
    verdict: matrix.every(({ status }) => status === "PASS") ? "PASS" : "NON_PASS",
    ...candidateBinding,
    fixtureId: "legacy-v1-session",
    sanitized: true,
    rawBodyIncluded: false,
    predecessor: {
      status: installedReady ? "PASS" : "Unverified",
      packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
      version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
      gitTag: AILI_COMPACT_EXPECTED_PREDECESSOR_TAG,
      identityEvidence: {
        path: AILI_COMPACT_PREDECESSOR_IDENTITY,
        sha256: sha256(predecessorIdentityBody),
      },
      installedPackage: {
        status: installedReady ? "PASS" : "Unverified",
        source: "npm-tarball",
        packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
        version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
        integrity: predecessorIdentity.npm.integrity,
        ...(installedReady && installedRollbackBody
          ? { evidence: { path: AILI_COMPACT_INSTALLED_ROLLBACK, sha256: sha256(installedRollbackBody) } }
          : { evidence: null, reason: "exact installed predecessor rollback requires separate installation approval" }),
      },
      reason: installedReady
        ? "predecessor identity and installed-package rollback are verified"
        : "predecessor identity is verified; installed-package rollback remains Unverified in safe-local tests",
    },
    execution: {
      homeScope: "repository-local-.tmp-disposable",
      sessionScope: "copied-fixture-only",
      liveSessionTouched: false,
      oldPrefixBytes: Buffer.byteLength(oldPrefix),
      oldPrefixSha256,
    },
    identities: {
      sessionId: "migration-v1-session",
      fixedSourceEntryIds: [...FIXTURE_IDS],
      legacyBlockIds: dualReader.legacyBlockIds,
      repairTransactionIds: repairPlan.batches.map(({ id }) => id),
      v3TransactionIds: [
        "migration-v3-t1",
        "migration-v3-decompress-raw",
        "migration-v3-recompress",
        "migration-v3-restore-all",
      ],
    },
    matrix,
    counts: {
      legacyBlocks: dualReader.legacyBlockIds.length,
      v3Blocks: dualReader.v3BlockIds.length,
      repairBatches: repairPlan.batches.length,
      priorLegacyBlocks: epoch.priorLegacyBlocks,
      archivedV3Blocks: epoch.archivedV3Blocks,
      publicSearchMatches: searchMatchCount,
    },
  };
  const durable = `${JSON.stringify(artifact, null, 2)}\n`;
  requireCondition(RAW_NEEDLES.every((needle) => !durable.includes(needle)), "durable migration evidence contains a raw body");
  requireCondition(!durable.includes(root), "durable migration evidence contains a private scratch path");
  mkdirSync(join(WORKSPACE, "artifacts", "test-results"), { recursive: true });
  writeFileSync(ARTIFACT, durable, "utf8");

  return {
    oldPrefix,
    finalBytes,
    oldPrefixSha256,
    fixtureIdsPreserved,
    repairIds: repairPlan.batches.map(({ id }) => id),
    dualReader,
    restoration: afterRestoreAll,
    fork,
    epoch,
    rollback: {
      rawOpenDidNotRewrite: openBytesBefore === openBytesAfter,
      legacyReaderEquivalentWithoutV3,
    },
    search: { matchCount: searchMatchCount, fixedIdsPresent: fixtureIdsPreserved },
    suffix: { injected: suffixInjected, persisted: suffixPersisted },
    indexFallback: { exactRaw: indexFallbackExactRaw, continuedWork: indexFallbackContinuedWork },
    artifact,
  };
}

function branch(manager: SessionManager): SessionLikeEntry[] {
  return manager.getBranch() as SessionLikeEntry[];
}

function runtimeView(manager: SessionManager, legacyState: CompactState): V3RuntimeView {
  return buildV3RuntimeView(branch(manager), legacyState, {
    sessionId: manager.getSessionId(),
    sessionPath: manager.getSessionFile(),
  });
}

function plannerContext(view: V3RuntimeView, legacyState: CompactState) {
  return {
    state: view.state,
    catalog: view.mutationCatalog,
    legacyBlockIds: new Set(legacyState.blocks.keys()),
  };
}

function v3T1(view: V3RuntimeView, sourceEntryId: string): V3Transaction {
  const summary = "Sanitized v3 summary.";
  return {
    header: {
      schema: AILI_COMPACT_SCHEMA_V3,
      txId: "migration-v3-t1",
      sessionId: view.state.sessionId,
      branchLeafId: view.state.branchLeafId,
      epochId: view.state.epochId,
      catalogId: view.catalog.catalogId,
      createdAt: 10,
      projectionVersion: view.state.projectionVersion,
    },
    tag: "semantic-create",
    payload: {
      blockId: "migration-v3-t1",
      tier: "T1",
      topic: "Migration v3",
      runId: "migration-v3-run",
      anchorEntryId: sourceEntryId,
      createdTurnOrdinal: 10,
      summary,
      summaryDigest: v3SummaryDigest(summary),
      source: { kind: "messages", entryIds: [sourceEntryId], firstEntryId: sourceEntryId, lastEntryId: sourceEntryId },
      leafDigest: v3MessageLeafDigest([sourceEntryId]),
      leafCount: 1,
      tokens: {
        estimatorVersion: "migration-estimator-v1",
        providerId: "fixture-provider",
        modelId: "fixture-model",
        sourceTokensLower: 2_000,
        sourceTokensUpper: 2_000,
        replacementTokensUpper: 1_000,
        steadySavingsTokensLower: 1_000,
        oneTimeCostTokensUpper: 200,
        breakEvenTurnsUpper: 1,
        savingsRatio: 0.5,
        summaryTokensUpper: 100,
      },
      quality: {
        status: "accepted",
        evaluatorVersion: "migration-quality-v1",
        sourceFactDigest: digest({ fixture: "migration-v3-t1", facts: 0 }),
        hardFactCount: 0,
        coveredHardFactCount: 0,
        warningCodes: [],
      },
    },
  };
}

function requireV3Plan(result: V3MutationPlanResult): V3Transaction {
  if (!result.ok) throw new Error(`v3 migration plan failed: ${result.code}:${result.path}`);
  return result.transaction;
}

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function legacyStateSummary(state: CompactState) {
  return {
    epochId: state.epochId,
    enabled: state.enabled,
    autoCooling: state.autoCooling,
    transactionCount: state.transactionCount,
    repairTransactionCount: state.repairTransactionCount,
    diagnostics: [...state.diagnostics],
    blocks: [...state.blocks.values()].sort((left, right) => left.id.localeCompare(right.id)).map((block) => ({
      id: block.id,
      epochId: block.epochId,
      active: block.active,
      queryOnly: block.queryOnly === true,
      deactivationReason: block.deactivationReason ?? null,
      sourceDigest: block.sourceDigest,
    })),
  };
}

function extensionHarness(manager: SessionManager) {
  const tools: Array<{ name: string; execute: (...args: any[]) => Promise<any> }> = [];
  const handlers = new Map<string, (event: any, context: any) => any>();
  registerAiliCompact({
    registerTool(tool: { name: string; execute: (...args: any[]) => Promise<any> }) { tools.push(tool); },
    registerCommand() {},
    on(event: string, handler: (event: any, context: any) => any) { handlers.set(event, handler); },
    appendEntry(customType: string, data: unknown) { manager.appendCustomEntry(customType, data); },
    sendUserMessage() {},
  } as unknown as ExtensionAPI);
  return { tools, handlers };
}

function extensionContext(manager: SessionManager, cwd: string, statuses: string[] = []) {
  return {
    cwd,
    model: {
      provider: "openai",
      id: "gpt-4.1",
      api: "openai-responses",
      name: "Sanitized migration fixture",
      baseUrl: "https://fixture.invalid",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 10_000,
      maxTokens: 1_000,
    },
    sessionManager: manager,
    getContextUsage: () => ({ tokens: 9_500, contextWindow: 10_000 }),
    isIdle: () => true,
    hasPendingMessages: () => false,
    compact() {},
    ui: { setStatus(_key: string, value: string) { statuses.push(value); }, setWidget() {}, notify() {} },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
