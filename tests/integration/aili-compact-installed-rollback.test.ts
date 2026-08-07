import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const FIXTURE = join(ROOT, "tests/fixtures/aili-compact/legacy-v1-session.jsonl");
const ARTIFACT = join(ROOT, "artifacts/test-results/aili-compact-installed-rollback.json");
const IDENTITY = join(ROOT, "artifacts/test-results/aili-compact-predecessor-identity.json");
const PREDECESSOR_ROOT = process.env.AILI_COMPACT_PREDECESSOR_PACKAGE_ROOT;
const CANDIDATE_ROOT = process.env.AILI_COMPACT_CANDIDATE_PACKAGE_ROOT;
const scratch: string[] = [];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function installedModules(packageRoot: string) {
  const prefix = resolve(packageRoot, "../../..");
  const load = async (path: string) => import(/* @vite-ignore */ pathToFileURL(path).href) as Promise<any>;
  const [manifest, pi, contracts, reducer, runtime, v3] = await Promise.all([
    readFile(join(packageRoot, "package.json"), "utf8").then(JSON.parse),
    load(join(prefix, "node_modules/@earendil-works/pi-coding-agent/dist/index.js")),
    load(join(packageRoot, "src/runtime/aili-compact/contracts.ts")),
    load(join(packageRoot, "src/runtime/aili-compact/reducer.ts")),
    load(join(packageRoot, "src/runtime/aili-compact/v3-runtime.ts")),
    load(join(packageRoot, "src/runtime/aili-compact/v3.ts")),
  ]);
  return { prefix, manifest, pi, contracts, reducer, runtime, v3 };
}

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("installed AILI Compact predecessor rollback", () => {
  it.skipIf(!PREDECESSOR_ROOT || !CANDIDATE_ROOT)("opens, advances, rolls back, and resumes a sanitized copied Session", async () => {
    const predecessor = await installedModules(PREDECESSOR_ROOT!);
    const candidate = await installedModules(CANDIDATE_ROOT!);
    expect(predecessor.manifest).toMatchObject({ name: "@rosetears/aili-pi", version: "0.1.16" });
    expect(candidate.manifest).toMatchObject({ name: "@rosetears/aili-pi", version: "0.2.0" });

    const runRoot = await mkdtemp(join(ROOT, ".tmp/aili-compact-installed-rollback-"));
    scratch.push(runRoot);
    const home = join(runRoot, "home");
    const sessionDir = join(home, "sessions");
    const project = join(runRoot, "project");
    const session = join(sessionDir, "copied-session.jsonl");
    await Promise.all([mkdir(sessionDir, { recursive: true }), mkdir(project, { recursive: true })]);
    await copyFile(FIXTURE, session);
    const originalPrefix = await readFile(session, "utf8");
    const identityBody = await readFile(IDENTITY, "utf8");
    const identity = JSON.parse(identityBody);

    const oldManager = predecessor.pi.SessionManager.open(session, sessionDir, project);
    const oldOpenBytes = await readFile(session, "utf8");
    const oldBundle = predecessor.reducer.reduceCompactReadBundle(oldManager.getBranch());
    expect(oldOpenBytes).toBe(originalPrefix);
    expect(oldBundle.legacy.blocks.has("fixture-v1-block")).toBe(true);
    oldManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "SANITIZED_PREDECESSOR_CONTINUED_WORK" }],
      timestamp: 20,
    });

    let candidateManager = candidate.pi.SessionManager.open(session, sessionDir, project);
    expect(candidateManager.getBranch().some((entry: any) => JSON.stringify(entry).includes("SANITIZED_PREDECESSOR_CONTINUED_WORK"))).toBe(true);
    const sourceEntryId = candidateManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "SANITIZED_INSTALLED_CANDIDATE_SOURCE" }],
      timestamp: 21,
    });
    const legacyState = candidate.reducer.reduceCompactState(candidateManager.getBranch());
    const view = candidate.runtime.buildV3RuntimeView(candidateManager.getBranch(), legacyState, {
      sessionId: candidateManager.getSessionId(),
      sessionPath: candidateManager.getSessionFile(),
    });
    const summary = "Sanitized installed candidate summary.";
    candidateManager.appendCustomEntry(candidate.contracts.AILI_COMPACT_ENTRY, {
      header: {
        schema: candidate.v3.AILI_COMPACT_SCHEMA_V3,
        txId: "installed-candidate-v3-t1",
        sessionId: view.state.sessionId,
        branchLeafId: view.state.branchLeafId,
        epochId: view.state.epochId,
        catalogId: view.catalog.catalogId,
        createdAt: 22,
        projectionVersion: view.state.projectionVersion,
      },
      tag: "semantic-create",
      payload: {
        blockId: "installed-candidate-v3-t1",
        tier: "T1",
        topic: "Installed rollback",
        runId: "installed-candidate-run",
        anchorEntryId: sourceEntryId,
        createdTurnOrdinal: 22,
        summary,
        summaryDigest: candidate.v3.v3SummaryDigest(summary),
        source: { kind: "messages", entryIds: [sourceEntryId], firstEntryId: sourceEntryId, lastEntryId: sourceEntryId },
        leafDigest: candidate.v3.v3MessageLeafDigest([sourceEntryId]),
        leafCount: 1,
        tokens: {
          estimatorVersion: "installed-rollback-v1",
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
          evaluatorVersion: "installed-rollback-v1",
          sourceFactDigest: candidate.contracts.digest({ fixture: "installed-candidate-v3-t1", facts: 0 }),
          hardFactCount: 0,
          coveredHardFactCount: 0,
          warningCodes: [],
        },
      },
    });

    candidateManager = candidate.pi.SessionManager.open(session, sessionDir, project);
    const candidateBundle = candidate.reducer.reduceCompactReadBundle(candidateManager.getBranch());
    expect(candidateBundle.v3.acceptedTransactionCount).toBeGreaterThan(0);
    expect(candidateBundle.v3.state?.blocks.has("installed-candidate-v3-t1")).toBe(true);
    const beforeRollback = await readFile(session, "utf8");

    const rollbackManager = predecessor.pi.SessionManager.open(session, sessionDir, project);
    expect(await readFile(session, "utf8")).toBe(beforeRollback);
    const predecessorAfterCandidate = predecessor.reducer.reduceCompactReadBundle(rollbackManager.getBranch());
    const predecessorV3Accepted = predecessorAfterCandidate.v3.acceptedTransactionCount > 0;
    rollbackManager.appendMessage({ role: "user", content: "SANITIZED_ROLLBACK_REQUEST", timestamp: 23 });
    rollbackManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "SANITIZED_ROLLBACK_CONTINUED_WORK" }],
      timestamp: 24,
    });

    const finalCandidate = candidate.pi.SessionManager.open(session, sessionDir, project);
    const finalBytes = await readFile(session, "utf8");
    expect(finalBytes.startsWith(originalPrefix)).toBe(true);
    expect(finalCandidate.getBranch().some((entry: any) => JSON.stringify(entry).includes("SANITIZED_ROLLBACK_CONTINUED_WORK"))).toBe(true);
    expect((await readdir(sessionDir)).every((name) => name.endsWith(".jsonl"))).toBe(true);

    const predecessorLock = JSON.parse(await readFile(join(predecessor.prefix, "package-lock.json"), "utf8"));
    const installedRecord = predecessorLock.packages?.["node_modules/@rosetears/aili-pi"];
    expect(installedRecord).toMatchObject({ version: "0.1.16", integrity: identity.npm.integrity });

    const report = {
      schema: "aili.compact.installed-rollback-evidence.v1",
      status: "PASS",
      verifiedAt: new Date().toISOString(),
      sanitized: true,
      rawBodyIncluded: false,
      identityEvidence: {
        path: "artifacts/test-results/aili-compact-predecessor-identity.json",
        sha256: sha256(identityBody),
      },
      installedPackage: {
        status: "PASS",
        source: "npm-tarball",
        packageName: predecessor.manifest.name,
        version: predecessor.manifest.version,
        integrity: installedRecord.integrity,
      },
      candidatePackage: { status: "PASS", packageName: candidate.manifest.name, version: candidate.manifest.version },
      matrix: [
        { id: "predecessor-installed-open", status: "PASS" },
        { id: "predecessor-legacy-replay", status: "PASS" },
        { id: "candidate-installed-v3-append-reload", status: "PASS" },
        { id: "predecessor-reopen-no-rewrite", status: "PASS" },
        { id: "rollback-continued-work", status: "PASS" },
        { id: "candidate-reopen-after-rollback", status: "PASS" },
        { id: "jsonl-prefix-preserved", status: "PASS" },
        { id: "no-raw-sidecar", status: "PASS" },
      ],
      v3Disposition: predecessorV3Accepted ? "accepted-by-predecessor" : "safely-ignored-by-predecessor",
      counts: {
        predecessorLegacyBlocks: oldBundle.legacy.blocks.size,
        candidateV3Transactions: candidateBundle.v3.acceptedTransactionCount,
        predecessorV3Diagnostics: predecessorAfterCandidate.v3.diagnostics.length,
      },
      execution: {
        disposableHome: true,
        copiedSessionOnly: true,
        packageScriptsRun: false,
        providerUsed: false,
        liveSessionTouched: false,
      },
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    expect(serialized).not.toContain(runRoot);
    expect(serialized).not.toContain("SANITIZED_");
    await mkdir(dirname(ARTIFACT), { recursive: true });
    await writeFile(ARTIFACT, serialized, "utf8");
  }, 120_000);
});
