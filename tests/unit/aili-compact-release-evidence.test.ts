import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AILI_COMPACT_EXPECTED_PREDECESSOR_TAG,
  AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
  AILI_COMPACT_CONTROLLED_PRODUCTION_PATH,
  AILI_COMPACT_INSTALLED_ROLLBACK,
  AILI_COMPACT_HUMAN_REVIEW_VERDICT_SCHEMA,
  AILI_COMPACT_LIVE_HARNESS,
  AILI_COMPACT_LIVE_CAPTURE_PATH,
  AILI_COMPACT_PREDECESSOR_PACKAGE,
  AILI_COMPACT_PREDECESSOR_IDENTITY,
  AILI_COMPACT_RELEASE_ARTIFACTS,
  AILI_COMPACT_RELEASE_INDEX,
  AILI_COMPACT_REVIEWED_LIVE_PATH,
  AILI_COMPACT_REVIEWED_LIVE_SCHEMA,
  AILI_COMPACT_TARGET_VERSION,
  computeAiliCompactImplementationSha256,
  validateAiliCompactReleaseEvidence,
} from "../../scripts/aili-compact-release-evidence.js";
import { applyAiliCompactHumanReviewVerdict } from "../../scripts/apply-aili-compact-human-review-verdict.js";
import { generateAiliCompactReleaseEvidence } from "../../scripts/generate-aili-compact-release-evidence.js";
import {
  COMPACT_LIVE_ROW_IDS,
  reduceCompactLiveRow,
  reduceInheritedCompactObservations,
  type CompactLiveExpectedBinding,
  type CompactLiveProviderFamily,
  type CompactLiveRowId,
  type CompactLiveRowObservation,
  type CompactScenarioEvent,
} from "../../scripts/aili-compact-live-observations.js";
import { validateLiveReleaseGate } from "../../scripts/validate-live-release.js";
import { NATIVE_INTEGRATIONS } from "../../src/runtime/native-integrations.js";
import { PERSISTENT_LIVE_IMPLEMENTATION_PATHS } from "../../src/runtime/persistent-agents/live-evidence-contract.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("AILI Compact fail-closed release evidence", () => {
  it("keeps the active repository NON_PASS while required live evidence is NON_PASS", async () => {
    const errors = await validateAiliCompactReleaseEvidence(process.cwd());
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("[index]"),
      expect.stringContaining("[live]"),
    ]));
    expect(errors.every((error) => error.includes("NON_PASS"))).toBe(true);
    expect(errors.length).toBeLessThanOrEqual(10);
  });

  it("passes a complete synthetic candidate and rejects a stale artifact hash", async () => {
    const root = await syntheticCandidate();
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([]);
    expect(await validateLiveReleaseGate(root)).toEqual([]);

    const migrationPath = join(root, AILI_COMPACT_RELEASE_ARTIFACTS.migration.path);
    writeFileSync(migrationPath, `${readFileSync(migrationPath, "utf8").trim()}\n `, "utf8");
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[migration]"),
      expect.stringContaining("[sanitizer]"),
    ]);
  });

  it("accepts an independent current reviewed wrapper instead of a copied live capture", async () => {
    const root = await syntheticCandidate();
    const source = read(root, AILI_COMPACT_LIVE_CAPTURE_PATH);
    const reviewed = read(root, AILI_COMPACT_REVIEWED_LIVE_PATH);

    expect(reviewed).not.toBe(source);
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([]);
  });

  it.each([
    ["tier-shaped wrapper", (reviewed: any) => { reviewed.tier = "T3-restill"; }],
    ["foreign capture binding", (reviewed: any) => { reviewed.sourceCapture.sha256 = "f".repeat(64); }],
    ["forged candidate identity", (reviewed: any) => { reviewed.humanVerdict.candidate.implementationSha256 = "f".repeat(64); }],
  ])("rejects %s reviewed human evidence", async (_name, mutate) => {
    const root = await syntheticCandidate();
    const reviewed = JSON.parse(read(root, AILI_COMPACT_REVIEWED_LIVE_PATH));
    mutate(reviewed);
    writeJson(root, AILI_COMPACT_REVIEWED_LIVE_PATH, reviewed);

    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([expect.stringContaining("[live]")]);
  });

  it("writes the current reviewed wrapper that the validator accepts", async () => {
    const root = await syntheticCandidate();
    const capturedAt = JSON.parse(read(root, AILI_COMPACT_LIVE_CAPTURE_PATH)).capturedAt as string;
    const verdictPath = "fixtures/current-human-verdict.json";
    writeJson(root, verdictPath, currentHumanVerdict(root, capturedAt));
    rmSync(join(root, AILI_COMPACT_REVIEWED_LIVE_PATH));

    const output = await applyAiliCompactHumanReviewVerdict(join(root, verdictPath), root);

    expect(output).toMatchObject({ schema: AILI_COMPACT_REVIEWED_LIVE_SCHEMA, status: "PASS" });
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([]);
  });

  it("reports retired-contract absence without suppressing current candidate validation", async () => {
    const root = await syntheticCandidate();
    rmSync(join(root, "openspec/changes/redesign-aili-compact-lifecycle"), { recursive: true, force: true });
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[current-contract]"),
    ]);
    forgeArtifact(root, "live", (live) => { live.representative.status = "NON_PASS"; });

    expect(await validateAiliCompactReleaseEvidence(root)).toEqual(expect.arrayContaining([
      expect.stringContaining("[current-contract]"),
      expect.stringContaining("[live]"),
    ]));
  });

  it("generates an honest NON_PASS index when required live evidence is absent", async () => {
    const root = await syntheticCandidate();
    rmSync(join(root, AILI_COMPACT_RELEASE_ARTIFACTS.live.path));

    const generated = await generateAiliCompactReleaseEvidence(root);

    expect(generated.index).toMatchObject({ status: "NON_PASS", candidateReady: false });
    expect(generated.sanitizer).toMatchObject({ status: "NON_PASS" });
    expect(generated.sanitizer.missingArtifacts).toContain(AILI_COMPACT_RELEASE_ARTIFACTS.live.path);
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual(expect.arrayContaining([
      expect.stringContaining("[index]"),
      expect.stringContaining("[live]"),
      expect.stringContaining("[sanitizer]"),
    ]));
  });

  it.each([
    ["stale timestamp", (live: any) => { live.capturedAt = "2000-01-01T00:00:00.000Z"; }],
    ["legacy three-family v2 schema", (live: any) => { live.schema = "aili.compact.live-evidence.v2"; live.providers = { openai: {}, anthropic: {}, "google-gemini": {} }; delete live.representative; }],
    ["missing representative", (live: any) => { delete live.representative; }],
    ["multiple representatives", (live: any) => { live.representatives = [live.representative, structuredClone(live.representative)]; }],
    ["wrong provider identity", (live: any) => { live.representative.provider = "anthropic"; live.representative.transport.provider = "anthropic"; }],
    ["missing transport", (live: any) => { delete live.representative.transport; }],
    ["missing extension ordering", (live: any) => { delete live.representative.extensionOrdering; }],
    ["missing parent persistent child lifecycle", (live: any) => { delete live.representative.parentPersistentChild; }],
    ["absent usage", (live: any) => { delete live.representative.transport.usage; }],
    ["absent sanitization marker", (live: any) => { delete live.sanitized; }],
    ["absent harness hash", (live: any) => { delete live.liveHarness.sha256; }],
    ["drifted official Pi executable binding", (live: any) => { live.runtimeBinding.piExecutable.sha256 = "f".repeat(64); }],
  ])("rejects declaration-only Compact live evidence: %s", async (_name, mutate) => {
    const root = await syntheticCandidate();
    forgeArtifact(root, "live", mutate);
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([expect.stringContaining("[live]")]);
  });

  it.each([
    ["NON_PASS representative", (live: any) => { live.representative.status = "NON_PASS"; }],
    ["NON_PASS parent persistent child lifecycle", (live: any) => { live.representative.parentPersistentChild.status = "NON_PASS"; }],
  ])("fails the live gate for a %s", async (_name, mutate) => {
    const root = await syntheticCandidate();
    forgeArtifact(root, "live", mutate);
    expect(await validateLiveReleaseGate(root)).toEqual(expect.arrayContaining([expect.stringContaining("[live]")]));
  });

  it("does not require live suffix, overflow, or semantic-tier transactions", async () => {
    const root = await syntheticCandidate();
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([]);
  });

  it.each([
    ["suffix non-persistence", (controlled: any) => { controlled.rows.find((row: any) => row.id === "controlled-provider-suffix").persisted = true; }],
    ["overflow retry", (controlled: any) => { controlled.rows.find((row: any) => row.id === "controlled-native-overflow").originalRequestRetried = false; }],
    ["fixed hierarchy payload", (controlled: any) => { controlled.lineage = { counts: { T1: 28, T2: 14, T3: 7, T3Restill: 1, total: 50 } }; }],
    ["summary ceiling", (controlled: any) => { controlled.summaryCapacity.overMaximumRejected = false; }],
    ["retired tier economics rejection", (controlled: any) => { controlled.summaryCapacity.uneconomicT3Rejected = true; }],
    ["missing exact source proof", (controlled: any) => { controlled.activeBlocks.sourceProof.exactLeafBinding = false; }],
    ["non-atomic replacement", (controlled: any) => { controlled.activeBlocks.composition.atomicReplacement = false; }],
    ["legacy tier write", (controlled: any) => { controlled.activeBlocks.growth.tierlessWrites = false; }],
    ["unbounded source traversal", (controlled: any) => { controlled.activeBlocks.sourceTraversal.observedRawSlotVisits = 257; }],
    ["restored fixed gate", (controlled: any) => { controlled.activeBlocks.retiredGates.tierEconomicsRequired = true; }],
  ])("keeps controlled production %s as a release prerequisite", async (_name, mutate) => {
    const root = await syntheticCandidate();
    forgeArtifact(root, "controlledProduction", mutate);
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([expect.stringContaining("[controlledProduction]")]);
  });

  it.each([
    ["credential", { injected: "sk-fixturecredential12345" }],
    ["raw conversation", { rawConversation: "fixture raw conversation" }],
    ["provider request", { providerRequest: { body: "fixture" } }],
    ["protected text", { injected: "PRIVATE-BLOCKER-BODY" }],
    ["private path", { injected: "/home/fixture/private/file" }],
    ["full log", { fullLog: "fixture complete log" }],
  ])("recomputes sanitization and rejects forged PASS declarations containing %s", async (_name, injection) => {
    const root = await syntheticCandidate();
    forgeArtifact(root, "live", (live) => Object.assign(live, injection));
    const sanitizer = JSON.parse(read(root, AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.path));
    for (const key of Object.keys(sanitizer.flags)) sanitizer.flags[key] = false;
    rebindSanitizer(root, sanitizer);
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[live]"),
      expect.stringContaining("[sanitizer]"),
    ]);
  });

  it("accepts a null npm gitHead only when exact full tarball comparison evidence is present", async () => {
    const root = await syntheticCandidate();
    const identity = JSON.parse(read(root, AILI_COMPACT_PREDECESSOR_IDENTITY));
    expect(identity.npm.gitHead).toBeNull();
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([]);

    identity.tarballComparison.mismatched.push("package/extensions/index.ts");
    rebindIdentity(root, identity);
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[predecessor-identity]"),
      expect.stringContaining("[installed-rollback]"),
      expect.stringContaining("[migration]"),
    ]);
  });

  it("rejects exact predecessor identity artifact drift even when its JSON remains semantically valid", async () => {
    const root = await syntheticCandidate();
    const path = join(root, AILI_COMPACT_PREDECESSOR_IDENTITY);
    writeFileSync(path, `${readFileSync(path, "utf8")} `, "utf8");

    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[installed-rollback]"),
      expect.stringContaining("[migration]"),
    ]);
  });

  it.each([
    ["registry integrity", (identity: any) => { identity.npm.integrity = "sha512-d3Jvbmc="; }],
    ["tarball mismatch", (identity: any) => { identity.tarballComparison.missing.push("package/package.json"); }],
    ["stale timestamp", (identity: any) => { identity.verifiedAt = "2000-01-01T00:00:00.000Z"; }],
  ])("fails closed on predecessor identity %s", async (_name, mutate) => {
    const root = await syntheticCandidate();
    const identity = JSON.parse(read(root, AILI_COMPACT_PREDECESSOR_IDENTITY));
    mutate(identity);
    rebindIdentity(root, identity);

    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[predecessor-identity]"),
      expect.stringContaining("[installed-rollback]"),
      expect.stringContaining("[migration]"),
    ]);
  });

  it("fails closed when exact predecessor identity evidence is missing", async () => {
    const root = await syntheticCandidate();
    rmSync(join(root, AILI_COMPACT_PREDECESSOR_IDENTITY));

    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[predecessor-identity]"),
      expect.stringContaining("[installed-rollback]"),
      expect.stringContaining("[migration]"),
    ]);
  });

  it.each([
    ["package name", (predecessor: any) => { predecessor.packageName = "@example/wrong"; }],
    ["version", (predecessor: any) => { predecessor.version = "0.1.15"; }],
    ["tarball integrity", (predecessor: any) => { predecessor.installedPackage.integrity = "sha512-d3Jvbmc="; }],
    ["installed rollback status", (predecessor: any) => { predecessor.installedPackage.status = "Unverified"; }],
  ])("fails closed on predecessor %s mismatch", async (_name, mutate) => {
    const root = await syntheticCandidate();
    const migrationPath = AILI_COMPACT_RELEASE_ARTIFACTS.migration.path;
    const migration = JSON.parse(read(root, migrationPath));
    mutate(migration.predecessor);
    const body = `${JSON.stringify(migration, null, 2)}\n`;
    write(root, migrationPath, body);
    rebindArtifactBytes(root, "migration", body);

    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[migration]"),
    ]);
  });

  it("fails closed when installed rollback evidence becomes invalid", async () => {
    const root = await syntheticCandidate();
    const path = join(root, AILI_COMPACT_INSTALLED_ROLLBACK);
    const installed = JSON.parse(readFileSync(path, "utf8"));
    installed.execution.providerUsed = true;
    writeFileSync(path, `${JSON.stringify(installed, null, 2)}\n`, "utf8");
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[installed-rollback]"),
      expect.stringContaining("[migration]"),
    ]);
  });

  it("returns bounded current-contract NON_PASS when the active change is absent", async () => {
    const root = makeRoot();
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[current-contract]"),
    ]);
  });
});

async function syntheticCandidate(): Promise<string> {
  const root = makeRoot();
  write(root, "openspec/changes/reconcile-aili-compact-release-lineage/proposal.md", "# active\n");
  write(root, "openspec/changes/redesign-aili-compact-lifecycle/proposal.md", "# retired\n");
  write(root, "extensions/index.ts", "export default function fixture() {}\n");
  write(root, AILI_COMPACT_LIVE_HARNESS, "export const liveHarnessFixture = true;\n");
  write(root, "tests/integration/aili-compact-agent-session.test.ts", "export const controlledProductionHarnessFixture = true;\n");
  write(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", "#!/usr/bin/env node\nexport const fixtureCli = true;\n");
  write(root, "node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js", "export const fixtureAgentSession = true;\n");
  write(root, "src/runtime/aili-compact/index.ts", "export const fixture = true;\n");
  write(root, "src/runtime/aili-compact/config.ts", `
export const DEFAULT_COMPACT_CONFIG = {
  protection: { preserveRecentAtoms: 8, preserveRecentTokens: 12_000, preserveRecentTokenCapRatio: 0.10, preserveLastUserMessage: true },
  planning: { enabled: true },
  quality: { enabled: true, warningPolicy: "record" },
  index: { enabled: true, snapshotLru: 4 },
};
export const EMPTY_COMPACT_PROMPT_SNAPSHOT = {};
`);
  write(root, "src/runtime/aili-compact/v3.ts", 'export const AILI_COMPACT_SCHEMA_V3 = "aili.compact.tx.v3";\n');
  write(root, "src/runtime/aili-compact/v3-runtime.ts", 'export const V3_PROJECTION_VERSION = "aili.projector.v3";\n');

  writeJson(root, "package.json", { name: "@rosetears/aili-pi", version: AILI_COMPACT_TARGET_VERSION });
  writeJson(root, "package-lock.json", { packages: {
    "": { name: "@rosetears/aili-pi", version: AILI_COMPACT_TARGET_VERSION },
    "node_modules/@earendil-works/pi-coding-agent": { version: "0.82.1" },
  } });
  writeJson(root, "manifests/sbom.json", { packages: [{ name: "@rosetears/aili-pi", versionInfo: AILI_COMPACT_TARGET_VERSION }] });
  writeJson(root, "manifests/provenance.json", {
    sources: [{
      name: "opencode-acp reference",
      version: "1.14.3",
      revision: "00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb",
      status: "reference-only",
      sourceFiles: [],
    }],
  });
  write(root, "THIRD_PARTY_NOTICES.md", "opencode-acp 1.14.3 00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb; Source files: none copied\n");

  const implementationSha256 = await computeAiliCompactImplementationSha256(root);
  const common = { status: "PASS", packageVersion: AILI_COMPACT_TARGET_VERSION, piVersion: "0.82.1", implementationSha256 };
  const identity = exactIdentity();
  const identityBody = `${JSON.stringify(identity, null, 2)}\n`;
  write(root, AILI_COMPACT_PREDECESSOR_IDENTITY, identityBody);
  const installedRollback = exactInstalledRollback(identityBody, identity.npm.integrity);
  const installedRollbackBody = `${JSON.stringify(installedRollback, null, 2)}\n`;
  write(root, AILI_COMPACT_INSTALLED_ROLLBACK, installedRollbackBody);
  const pass = { status: "PASS" };
  const capturedAt = new Date().toISOString();
  const usage = { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12 };
  const representativeProvider = {
    providerFamily: "openai",
    provider: "openai-codex",
    model: "openai-release-model",
    api: "openai-release-api",
    contextWindow: 128_000,
    transport: { status: "PASS", provider: "openai-codex", model: "openai-release-model", api: "openai-release-api", contextWindow: 128_000, responseDigest: "b".repeat(64), usage },
    extensionOrdering: { before: { status: "PASS", order: ["before", "aili", "after"] }, after: { status: "PASS", observations: ["before", "after"] } },
  };
  const provenanceText = read(root, "manifests/provenance.json");
  const sbomText = read(root, "manifests/sbom.json");
  const noticesText = read(root, "THIRD_PARTY_NOTICES.md");
  const artifacts: Record<string, Record<string, unknown>> = {
    migration: {
      ...common,
      schema: AILI_COMPACT_RELEASE_ARTIFACTS.migration.schema,
      sanitized: true,
      rawBodyIncluded: false,
      predecessor: {
        status: "PASS",
        packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
        version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
        identityEvidence: {
          path: AILI_COMPACT_PREDECESSOR_IDENTITY,
          sha256: sha256(identityBody),
        },
        installedPackage: {
          status: "PASS",
          source: "npm-tarball",
          packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
          version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
          integrity: identity.npm.integrity,
          evidence: {
            path: AILI_COMPACT_INSTALLED_ROLLBACK,
            sha256: sha256(installedRollbackBody),
          },
        },
      },
      matrix: [{ id: "externally-verified-predecessor-installed-rollback", status: "PASS" }],
    },
    performance: {
      ...common,
      schema: AILI_COMPACT_RELEASE_ARTIFACTS.performance.schema,
      corpus: { providerMessages: 10_000, referenceOperations: 100_000 },
      sanitizer: { sourceBodiesIncluded: false, credentialsIncluded: false },
    },
    fakeProvider: {
      ...common,
      schema: AILI_COMPACT_RELEASE_ARTIFACTS.fakeProvider.schema,
      rows: { synthetic: pass },
      sanitizer: { rawSourceBodiesIncluded: false, credentialsIncluded: false },
    },
    live: {
      ...common,
      schema: "aili.compact.live-evidence.v3",
      capturedAt,
      sanitized: true,
      liveHarness: { path: AILI_COMPACT_LIVE_HARNESS, sha256: sha256(read(root, AILI_COMPACT_LIVE_HARNESS)) },
      runtimeBinding: {
        piExecutable: { path: "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", sha256: sha256(read(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js")) },
        productionEntry: { path: "extensions/index.ts", sha256: sha256(read(root, "extensions/index.ts")) },
      },
      representative: {
        status: "PASS",
        providerFamily: representativeProvider.providerFamily,
        provider: representativeProvider.provider,
        model: representativeProvider.model,
        api: representativeProvider.api,
        contextWindow: representativeProvider.contextWindow,
        transport: representativeProvider.transport,
        extensionOrdering: representativeProvider.extensionOrdering,
        parentPersistentChild: {
          status: "PASS",
          synchronousTaskCallObserved: true,
          taskArgumentsExact: true,
          zeroParentBashCalls: true,
          persistentChildSessionObserved: true,
          childTurnStatus: "completed",
        },
      },
    },
    controlledProduction: {
      schema: "aili.compact.controlled-production.v2",
      schemaVersion: 2,
      status: "PASS",
      generatedAt: capturedAt,
      evidenceClass: "deterministic-controlled-production",
      packageVersion: AILI_COMPACT_TARGET_VERSION,
      piVersion: "0.82.1",
      test: { path: "tests/integration/aili-compact-agent-session.test.ts", command: "npx vitest run tests/integration/aili-compact-agent-session.test.ts" },
      hashes: {
        implementation: { path: "src/runtime/aili-compact/index.ts", sha256: sha256(read(root, "src/runtime/aili-compact/index.ts")) },
        entry: { path: "extensions/index.ts", sha256: sha256(read(root, "extensions/index.ts")) },
        piAgentSession: { path: "node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js", sha256: sha256(read(root, "node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js")) },
        test: { path: "tests/integration/aili-compact-agent-session.test.ts", sha256: sha256(read(root, "tests/integration/aili-compact-agent-session.test.ts")) },
      },
      networkUsed: false,
      credentialsUsed: false,
      directEventInjection: false,
      manualPromotion: false,
      liveProvider: false,
      activeBlocks: {
        growth: { status: "PASS", tierlessWrites: true, createdBlockCount: 17, growthObserved: true },
        composition: { acceptedChildCounts: [2, 16], rejectedChildCounts: [1, 17], atomicReplacement: true },
        sourceProof: { status: "PASS", exactLeafBinding: true, attestedGapsOnly: true, transactionSourceBound: true },
        legacyTierReplay: { status: "PASS", readOnly: true, readableTiers: ["T1", "T2", "T3", "T3-restill"] },
        sourceTraversal: { maxRawSlotVisits: 256, observedRawSlotVisits: 2, bounded: true },
        retiredGates: { fixedHierarchyRequired: false, tierAgeRequired: false, tierSourceFloorRequired: false, tierEconomicsRequired: false },
      },
      summaryCapacity: {
        targetCharacters: 15_000,
        maxCharacters: 18_000,
        maximumAccepted: true,
        overMaximumRejected: true,
      },
      rows: [
        { id: "controlled-index", status: "PASS" },
        { id: "controlled-active-block-growth", status: "PASS", tierlessWrites: true, growthObserved: true },
        { id: "controlled-active-block-composition", status: "PASS", acceptedChildCounts: [2, 16], rejectedChildCounts: [1, 17], atomicReplacement: true },
        { id: "controlled-legacy-tier-replay", status: "PASS", readOnly: true, readable: true },
        { id: "controlled-source-traversal", status: "PASS", maxRawSlotVisits: 256, observedRawSlotVisits: 2, bounded: true },
        { id: "controlled-provider-suffix", status: "PASS", completeToolResultBeforeSuffix: true, persisted: false },
        { id: "controlled-native-overflow", status: "PASS", providerContextError: true, nativeCheckpointPersisted: true, originalRequestRetried: true, laterWorkCompleted: true },
        { id: "controlled-continued-work", status: "PASS", completed: true },
      ],
      sanitization: { rawConversationIncluded: false, rawProviderPayloadIncluded: false, localAbsolutePathsIncluded: false },
    },
    provenance: {
      ...common,
      schema: AILI_COMPACT_RELEASE_ARTIFACTS.provenance.schema,
      acpReference: {
        version: "1.14.3",
        revision: "00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb",
        status: "reference-only",
        copiedMaterial: false,
      },
      provenanceSha256: sha256(provenanceText),
      sbomSha256: sha256(sbomText),
      noticesSha256: sha256(noticesText),
    },
    sanitizer: {
      ...common,
      schema: AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.schema,
      flags: {
        credentialsIncluded: false,
        rawConversationIncluded: false,
        providerRequestsIncluded: false,
        protectedTextIncluded: false,
        fullLogsIncluded: false,
        privatePathsIncluded: false,
      },
      scannedArtifacts: [],
      missingArtifacts: [],
    },
  };

  const references: Record<string, { path: string; sha256: string }> = {};
  for (const [id, artifact] of Object.entries(artifacts).filter(([id]) => id !== "sanitizer")) {
    const expected = AILI_COMPACT_RELEASE_ARTIFACTS[id as keyof typeof AILI_COMPACT_RELEASE_ARTIFACTS];
    const body = `${JSON.stringify(artifact, null, 2)}\n`;
    write(root, expected.path, body);
    references[id] = { path: expected.path, sha256: sha256(body) };
  }
  writeReviewedLivePass(root, capturedAt);
  artifacts.sanitizer!.scannedArtifacts = Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS)
    .filter(([id]) => id !== "sanitizer")
    .map(([id, item]) => ({ path: item.path, sha256: references[id]!.sha256 }));
  const sanitizerBody = `${JSON.stringify(artifacts.sanitizer, null, 2)}\n`;
  write(root, AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.path, sanitizerBody);
  references.sanitizer = { path: AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.path, sha256: sha256(sanitizerBody) };
  writeJson(root, AILI_COMPACT_RELEASE_INDEX, {
    schema: "aili.compact.release-evidence.v1",
    status: "PASS",
    packageVersion: AILI_COMPACT_TARGET_VERSION,
    piVersion: "0.82.1",
    implementationSha256,
    candidateReady: true,
    missingArtifacts: [],
    artifacts: references,
  });
  await generateAiliCompactReleaseEvidence(root);
  writePersistentLivePass(root, capturedAt);
  return root;
}

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "aili-compact-release-evidence-"));
  roots.push(root);
  return root;
}

function write(root: string, path: string, value: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value, "utf8");
}

function writeJson(root: string, path: string, value: unknown): void {
  write(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function currentHumanVerdict(root: string, reviewedAt: string): Record<string, unknown> {
  const sourceBody = read(root, AILI_COMPACT_LIVE_CAPTURE_PATH);
  const source = JSON.parse(sourceBody);
  const unsigned = {
    schema: AILI_COMPACT_HUMAN_REVIEW_VERDICT_SCHEMA,
    humanAuthored: true,
    reviewerId: "current-human-reviewer",
    reviewedAt,
    sourceCaptureSha256: sha256(sourceBody),
    candidate: {
      packageVersion: source.packageVersion,
      piVersion: source.piVersion,
      implementationSha256: source.implementationSha256,
    },
    verdictId: "current-human-verdict",
    verdict: "PASS",
    hardFactsRetained: true,
    limitationsAccepted: true,
  };
  return { ...unsigned, sha256: sha256(JSON.stringify(unsigned)) };
}

function writeReviewedLivePass(root: string, reviewedAt: string): void {
  const source = JSON.parse(read(root, AILI_COMPACT_LIVE_CAPTURE_PATH));
  writeJson(root, AILI_COMPACT_REVIEWED_LIVE_PATH, {
    schema: AILI_COMPACT_REVIEWED_LIVE_SCHEMA,
    status: "PASS",
    packageVersion: source.packageVersion,
    piVersion: source.piVersion,
    implementationSha256: source.implementationSha256,
    reviewedAt,
    sanitized: true,
    sourceCapture: {
      path: AILI_COMPACT_LIVE_CAPTURE_PATH,
      sha256: sha256(read(root, AILI_COMPACT_LIVE_CAPTURE_PATH)),
    },
    humanVerdict: currentHumanVerdict(root, reviewedAt),
  });
}

function syntheticLiveEvents(id: CompactLiveRowId, binding?: CompactLiveExpectedBinding): CompactScenarioEvent[] {
  const observedUsage = { input: 100, output: 10, cacheRead: 20, cacheWrite: 5, totalTokens: 130 };
  switch (id) {
    case "LIVE-V2-1": return [
      { code: "provider-suffix", turn: "user", role: "custom", order: "after-complete-projection", protocolError: false },
      { code: "provider-call", turn: "user", succeeded: true, usage: observedUsage },
      { code: "provider-suffix", turn: "tool-result", role: "custom", order: "after-complete-projection", completeRealToolResult: true, protocolError: false },
      { code: "provider-call", turn: "tool-result", succeeded: true, usage: observedUsage },
      { code: "suffix-persistence", jsonlMatches: 0, providerAuthoredSearchMatches: 0 },
    ];
    case "LIVE-V2-2": return [{ code: "provider-call", turn: "user", succeeded: true, usage: observedUsage }, { code: "calibration", eligible: 5, excluded: 1, exclusionCodes: ["overflow-retry-cancelled"], lowerBoundPreserved: true, upperBoundPreserved: true, invalidNarrowing: false }];
    case "LIVE-V2-4": return [
      { code: "tool-rejection", reason: "scope-drift", providerAuthored: true, transactionAppended: false, redacted: true, pressure: true, pressureCycleAttempt: 1 },
      { code: "tool-rejection", reason: "quality-hard-fact-loss", providerAuthored: true, transactionAppended: false, redacted: true, pressure: true, pressureCycleAttempt: 1 },
    ];
    case "LIVE-V2-5": return [{ code: "lifecycle-rescue", providerAuthoredEligibleLifecycle: true, invocation: "agent-session-command", oldEpochQueryOnly: true, oldEpochSearchable: true }, { code: "before-compact", reason: "manual", willRetry: false, outcome: "custom" }, { code: "checkpoint", reason: "manual", origin: "custom", persisted: true, newEpoch: true }, { code: "provider-call", turn: "continued", succeeded: true, usage: observedUsage }];
    case "LIVE-V2-6": return [{ code: "native-threshold", actualHostThreshold: true, deterministicIneligible: true, cancelLoopCount: 0 }, { code: "before-compact", reason: "threshold", willRetry: false, outcome: "undefined-native-fallback" }, { code: "checkpoint", reason: "threshold", origin: "native", persisted: true, newEpoch: true }, { code: "provider-call", turn: "continued", succeeded: true, usage: observedUsage }];
    case "LIVE-V2-7": return [{ code: "provider-overflow", recognized: true, errorCode: "context-length-exceeded", thresholdCompactedFirst: false }, { code: "before-compact", reason: "overflow", willRetry: true, outcome: "undefined-native-fallback" }, { code: "checkpoint", reason: "overflow", origin: "native", persisted: true, newEpoch: true }, { code: "provider-call", turn: "retry", succeeded: true, usage: observedUsage }, { code: "provider-call", turn: "continued", succeeded: true, usage: observedUsage }];
    case "LIVE-V2-8": return [{ code: "cache", providerReported: true, cacheReadTokens: 20, cacheWriteTokens: 5, stablePrefix: "warm-candidate", suffixChange: "suffix-changed", projectionChange: "projection-changed" }];
    case "LIVE-V2-9": return [{ code: "migration", copiedSanitizedSession: true, syntheticSetup: false, v1v2v3Reload: true, branchSwitch: true, decompression: true, checkpoint: true, indexFallback: true, bytePrefixPreserved: true, continuedProviderWork: true, source: { providerProduced: true, sameCapture: true, sessionIdDigest: "1".repeat(64), copiedPrefixSha256: "2".repeat(64), transactionIds: ["tx-1", "tx-2", "tx-3", "tx-4"], transactionDigests: ["3".repeat(64), "4".repeat(64), "5".repeat(64), "6".repeat(64)] }, productionApis: { reload: "agent-session-reload", branchSwitch: "agent-session-navigate-tree", decompression: "production-aili-decompress", checkpoint: "agent-session-compact", indexFallback: "production-branch-index-fallback", continuedWork: "agent-session-provider-prompt" } }];
    case "LIVE-V2-10": return [{ code: "native-integration", inventorySource: "production-native-loader", knownNativeIntegrations: [...NATIVE_INTEGRATIONS], unknownThirdParty: "Unverified", beforeObserved: true, afterObserved: true, realCheckpoint: true, cancellationOverrides: 0, headlessRestartStatus: "bounded-truthful", interactiveResize: "PASS", ptyEvidence: true, resizeProbe: { mechanism: "python3-stdlib-forkpty-tiocswinsz", directEventInjection: false, executable: { path: "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", sha256: binding?.piExecutableSha256 ?? "0".repeat(64) }, productionEntry: { path: "extensions/index.ts", sha256: binding?.productionEntrySha256 ?? "0".repeat(64) }, harness: { path: AILI_COMPACT_LIVE_HARNESS, sha256: binding?.liveHarnessSha256 ?? "0".repeat(64) }, candidate: { packageVersion: binding?.packageVersion ?? AILI_COMPACT_TARGET_VERSION, piVersion: "0.82.1", implementationSha256: binding?.implementationSha256 ?? "0".repeat(64) }, initial: { columns: 96, rows: 28 }, resized: { columns: 132, rows: 42 }, ioctlApplied: true, queriedWindowMatched: true, productionCommandObserved: true, postResizeOutputObserved: true, transcriptSha256: "7".repeat(64), transcriptBytes: 512 } }];
  }
}

function exactIdentity(): any {
  return {
    schema: "aili.compact.predecessor-identity.v1",
    status: "PASS",
    verifiedAt: new Date().toISOString(),
    packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
    version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
    identityMatch: true,
    sanitized: true,
    git: {
      status: "PASS",
      source: "git-remote",
      tag: AILI_COMPACT_EXPECTED_PREDECESSOR_TAG,
      ref: `refs/tags/${AILI_COMPACT_EXPECTED_PREDECESSOR_TAG}`,
      tagObjectSha: "1e6b81702ddbadec9d2f214492d412010f6333f1",
      commitSha: "e8a8f77f84a1dc608da7ce0c0f047f5c552b0546",
    },
    npm: {
      status: "PASS",
      source: "npm-registry",
      packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
      version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
      integrity: "sha512-E9P8IiNVHYZRCvFZE/p7OjifDIzjmXP7YkWb8MJv5TT74XVurpuW5i5tGAKaQ8dTbsZIZWADH9JKglypnu5HJA==",
      shasum: "05acae8dc4ba912c018f1d03644ef4da598bca8e",
      gitHead: null,
      latestPublished0x: true,
    },
    tarballComparison: {
      status: "PASS",
      source: "npm-tarball-inspection",
      firstPartyFileCount: 173,
      aggregateSha256: "32792bde86c5ef8ce0d2310271c1d77a065c6877fe765f1e3f571809537c14b0",
      manifestMatch: true,
      missing: [],
      mismatched: [],
      scriptsRun: false,
      installed: false,
      scratchCleaned: true,
    },
  };
}

function exactInstalledRollback(identityBody: string, integrity: string): any {
  const pass = { status: "PASS" };
  return {
    schema: "aili.compact.installed-rollback-evidence.v1",
    status: "PASS",
    verifiedAt: new Date().toISOString(),
    sanitized: true,
    rawBodyIncluded: false,
    identityEvidence: { path: AILI_COMPACT_PREDECESSOR_IDENTITY, sha256: sha256(identityBody) },
    installedPackage: {
      status: "PASS",
      source: "npm-tarball",
      packageName: AILI_COMPACT_PREDECESSOR_PACKAGE,
      version: AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION,
      integrity,
    },
    candidatePackage: { status: "PASS", packageName: AILI_COMPACT_PREDECESSOR_PACKAGE, version: AILI_COMPACT_TARGET_VERSION },
    matrix: [
      "predecessor-installed-open",
      "predecessor-legacy-replay",
      "candidate-installed-v3-append-reload",
      "predecessor-reopen-no-rewrite",
      "rollback-continued-work",
      "candidate-reopen-after-rollback",
      "jsonl-prefix-preserved",
      "no-raw-sidecar",
    ].map((id) => ({ id, ...pass })),
    v3Disposition: "accepted-by-predecessor",
    execution: {
      disposableHome: true,
      copiedSessionOnly: true,
      packageScriptsRun: false,
      providerUsed: false,
      liveSessionTouched: false,
    },
  };
}

function rebindIdentity(root: string, identity: unknown): void {
  const identityBody = `${JSON.stringify(identity, null, 2)}\n`;
  write(root, AILI_COMPACT_PREDECESSOR_IDENTITY, identityBody);
  const priorInstalled = JSON.parse(read(root, AILI_COMPACT_INSTALLED_ROLLBACK));
  priorInstalled.identityEvidence.sha256 = sha256(identityBody);
  const installedBody = `${JSON.stringify(priorInstalled, null, 2)}\n`;
  write(root, AILI_COMPACT_INSTALLED_ROLLBACK, installedBody);
  const migrationPath = AILI_COMPACT_RELEASE_ARTIFACTS.migration.path;
  const migration = JSON.parse(read(root, migrationPath));
  migration.predecessor.identityEvidence.sha256 = sha256(identityBody);
  migration.predecessor.installedPackage.evidence.sha256 = sha256(installedBody);
  const migrationBody = `${JSON.stringify(migration, null, 2)}\n`;
  write(root, migrationPath, migrationBody);
  rebindArtifactBytes(root, "migration", migrationBody);
}

function forgeArtifact(root: string, id: keyof typeof AILI_COMPACT_RELEASE_ARTIFACTS, mutate: (artifact: any) => void): void {
  const path = AILI_COMPACT_RELEASE_ARTIFACTS[id].path;
  const artifact = JSON.parse(read(root, path));
  mutate(artifact);
  const body = `${JSON.stringify(artifact, null, 2)}\n`;
  write(root, path, body);
  rebindArtifactBytes(root, id, body);
}

function rebindArtifactBytes(root: string, id: keyof typeof AILI_COMPACT_RELEASE_ARTIFACTS, body: string): void {
  const sanitizerPath = AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.path;
  const sanitizer = JSON.parse(read(root, sanitizerPath));
  if (id !== "sanitizer") {
    const scan = sanitizer.scannedArtifacts.find((entry: any) => entry.path === AILI_COMPACT_RELEASE_ARTIFACTS[id].path);
    if (scan) scan.sha256 = sha256(body);
    const sanitizerBody = `${JSON.stringify(sanitizer, null, 2)}\n`;
    write(root, sanitizerPath, sanitizerBody);
    const index = JSON.parse(read(root, AILI_COMPACT_RELEASE_INDEX));
    index.artifacts[id].sha256 = sha256(body);
    index.artifacts.sanitizer.sha256 = sha256(sanitizerBody);
    writeJson(root, AILI_COMPACT_RELEASE_INDEX, index);
  }
}

function rebindSanitizer(root: string, sanitizer: unknown): void {
  const body = `${JSON.stringify(sanitizer, null, 2)}\n`;
  write(root, AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.path, body);
  const index = JSON.parse(read(root, AILI_COMPACT_RELEASE_INDEX));
  index.artifacts.sanitizer.sha256 = sha256(body);
  writeJson(root, AILI_COMPACT_RELEASE_INDEX, index);
}

function writePersistentLivePass(root: string, capturedAt: string): void {
  const artifactPath = "artifacts/test-results/persistent-agent-framework/live-smoke-fixture.json";
  const implementationPaths = PERSISTENT_LIVE_IMPLEMENTATION_PATHS;
  const implementation: Record<string, string> = {};
  for (const [index, path] of implementationPaths.entries()) {
    const body = `export const persistentFixture${index} = true;\n`;
    write(root, path, body);
    implementation[path] = sha256(body);
  }
  const probes = ["provider-turn", "child-sandbox", "external-workspace-lifecycle"].map((id) => ({ id, status: "PASS", changedFiles: 0 }));
  const artifact = {
    schemaVersion: 1, capturedAt, platform: "linux", piVersion: "0.82.1",
    package: { name: "@rosetears/aili-pi", version: AILI_COMPACT_TARGET_VERSION, source: "current workspace package" },
    status: "PASS", probes,
    sanitization: { rawProviderTranscriptIncluded: false, rawCredentialMaterialIncluded: false, credentialMarkerFindings: 0, localAbsolutePathsIncluded: false },
  };
  const artifactBody = `${JSON.stringify(artifact, null, 2)}\n`;
  write(root, artifactPath, artifactBody);
  writeJson(root, "manifests/live-verification.json", {
    schemaVersion: 4, capturedAt, platform: "linux", piVersion: "0.82.1", runtime: "aili-persistent-agents-v1",
    package: { name: "@rosetears/aili-pi", version: AILI_COMPACT_TARGET_VERSION, source: "current workspace package" },
    status: "PASS", artifact: { path: artifactPath, sha256: sha256(artifactBody) },
    harness: { path: AILI_COMPACT_LIVE_HARNESS, sha256: sha256(read(root, AILI_COMPACT_LIVE_HARNESS)) },
    cleanup: { status: "PASS" },
    probes: probes.map((probe) => ({ ...probe, evidence: artifactPath })),
    implementation,
  });
}
