import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AILI_COMPACT_RELEASE_ARTIFACTS,
  AILI_COMPACT_RELEASE_INDEX,
  computeAiliCompactImplementationSha256,
  validateAiliCompactReleaseEvidence,
} from "../../scripts/aili-compact-release-evidence.js";
import { generateAiliCompactReleaseEvidence } from "../../scripts/generate-aili-compact-release-evidence.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("AILI Compact fail-closed release evidence", () => {
  it("keeps the active repository NON_PASS while required 0.2.0/live evidence is absent", async () => {
    const errors = await validateAiliCompactReleaseEvidence(process.cwd());
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("[package]"),
      expect.stringContaining("[provenance]"),
      expect.stringContaining("[index]"),
      expect.stringContaining("[live]"),
      expect.stringContaining("[sanitizer]"),
    ]));
    expect(errors.every((error) => error.includes("NON_PASS"))).toBe(true);
    expect(errors.length).toBeLessThanOrEqual(10);
  });

  it("passes a complete synthetic candidate and rejects a stale artifact hash", async () => {
    const root = await syntheticCandidate();
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([]);

    const migrationPath = join(root, AILI_COMPACT_RELEASE_ARTIFACTS.migration.path);
    writeFileSync(migrationPath, `${readFileSync(migrationPath, "utf8").trim()}\n `, "utf8");
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([
      expect.stringContaining("[migration]"),
    ]);
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

  it("does not activate the Compact candidate gate after the change is absent", async () => {
    const root = makeRoot();
    expect(await validateAiliCompactReleaseEvidence(root)).toEqual([]);
  });
});

async function syntheticCandidate(): Promise<string> {
  const root = makeRoot();
  write(root, "openspec/changes/redesign-aili-compact-lifecycle/proposal.md", "# active\n");
  write(root, "extensions/index.ts", "export default function fixture() {}\n");
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

  writeJson(root, "package.json", { name: "@rosetears/aili-pi", version: "0.2.0" });
  writeJson(root, "package-lock.json", { packages: {
    "": { name: "@rosetears/aili-pi", version: "0.2.0" },
    "node_modules/@earendil-works/pi-coding-agent": { version: "0.82.1" },
  } });
  writeJson(root, "manifests/sbom.json", { packages: [{ name: "@rosetears/aili-pi", versionInfo: "0.2.0" }] });
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
  const common = { status: "PASS", packageVersion: "0.2.0", piVersion: "0.82.1", implementationSha256 };
  const pass = { status: "PASS" };
  const liveRows = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`LIVE-V2-${index + 1}`, pass]));
  const provider = {
    status: "PASS",
    rows: liveRows,
    p0: pass,
    longLifecycle: pass,
    continuedWork: pass,
    extensionOrdering: { before: pass, after: pass },
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
      matrix: [{ id: "synthetic", status: "PASS" }],
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
      schema: AILI_COMPACT_RELEASE_ARTIFACTS.live.schema,
      providers: { openai: provider, anthropic: provider, "google-gemini": provider },
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
      scannedArtifacts: Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS)
        .filter(([id]) => id !== "sanitizer")
        .map(([, item]) => item.path),
    },
  };

  const references: Record<string, { path: string; sha256: string }> = {};
  for (const [id, artifact] of Object.entries(artifacts)) {
    const expected = AILI_COMPACT_RELEASE_ARTIFACTS[id as keyof typeof AILI_COMPACT_RELEASE_ARTIFACTS];
    const body = `${JSON.stringify(artifact, null, 2)}\n`;
    write(root, expected.path, body);
    references[id] = { path: expected.path, sha256: sha256(body) };
  }
  writeJson(root, AILI_COMPACT_RELEASE_INDEX, {
    schema: "aili.compact.release-evidence.v1",
    status: "PASS",
    packageVersion: "0.2.0",
    piVersion: "0.82.1",
    implementationSha256,
    artifacts: references,
  });
  await generateAiliCompactReleaseEvidence(root);
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
