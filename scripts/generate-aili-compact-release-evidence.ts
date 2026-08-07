import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AILI_COMPACT_RELEASE_ARTIFACTS,
  AILI_COMPACT_RELEASE_INDEX,
  AILI_COMPACT_LIVE_HARNESS,
  AILI_COMPACT_LIVE_CAPTURE_PATH,
  readAiliCompactCandidateBinding,
  scanAiliReleaseEvidence,
  validateAiliCompactReviewedLiveArtifact,
  type AiliCompactCandidateBinding,
  type AiliCompactLiveRuntimeBinding,
} from "./aili-compact-release-evidence.ts";
import { COMPACT_HUMAN_REVIEW_CANDIDATE_PATH } from "./live-release-support.ts";

const DEFAULT_ROOT = resolve(import.meta.dirname, "..");
const ACP_VERSION = "1.14.3";
const ACP_REVISION = "00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb";

type ArtifactId = keyof typeof AILI_COMPACT_RELEASE_ARTIFACTS;
type JsonRecord = Record<string, unknown>;

export interface GeneratedAiliCompactReleaseEvidence {
  provenance: JsonRecord;
  sanitizer: JsonRecord;
  index: JsonRecord;
}

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function passed(value: unknown): boolean {
  const item = record(value);
  return item?.status === "PASS" || item?.verdict === "PASS";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readText(root: string, path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

function candidateBound(
  id: ArtifactId,
  value: JsonRecord | undefined,
  binding: AiliCompactCandidateBinding,
  liveHarnessSha256: string,
  liveRuntimeBinding: AiliCompactLiveRuntimeBinding,
  sourceCaptureBody: string,
  candidateArtifactBody: string,
): boolean {
  const expected = AILI_COMPACT_RELEASE_ARTIFACTS[id];
  const base = value?.schema === expected.schema
    && passed(value)
    && value.packageVersion === binding.packageVersion
    && value.piVersion === binding.piVersion
    && value.implementationSha256 === binding.implementationSha256;
  return base && (id !== "live" || validateAiliCompactReviewedLiveArtifact(
    value!, sourceCaptureBody, candidateArtifactBody, liveHarnessSha256, liveRuntimeBinding,
  ));
}

/**
 * Generate only bounded metadata evidence. It never fabricates provider or
 * migration results: missing, stale, or NON_PASS inputs keep the index
 * NON_PASS. Sanitizer status reports only the exact recomputed byte scan.
 */
export async function generateAiliCompactReleaseEvidence(
  root = DEFAULT_ROOT,
  options: { verify?: boolean } = {},
): Promise<GeneratedAiliCompactReleaseEvidence> {
  const projectRoot = resolve(root);
  const binding = await readAiliCompactCandidateBinding(projectRoot);
  const [provenanceText, sbomText, noticesText, liveHarnessText, piExecutableText, productionEntryText] = await Promise.all([
    readText(projectRoot, "manifests/provenance.json"),
    readText(projectRoot, "manifests/sbom.json"),
    readText(projectRoot, "THIRD_PARTY_NOTICES.md"),
    readText(projectRoot, AILI_COMPACT_LIVE_HARNESS),
    readText(projectRoot, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"),
    readText(projectRoot, "extensions/index.ts"),
  ]);
  const liveHarnessSha256 = sha256(liveHarnessText);
  const liveRuntimeBinding = { piExecutableSha256: sha256(piExecutableText), productionEntrySha256: sha256(productionEntryText) };
  const [sourceCaptureBody, candidateArtifactBody] = await Promise.all([
    readText(projectRoot, AILI_COMPACT_LIVE_CAPTURE_PATH).catch(() => ""),
    readText(projectRoot, COMPACT_HUMAN_REVIEW_CANDIDATE_PATH).catch(() => ""),
  ]);
  const provenanceManifest = record(JSON.parse(provenanceText) as unknown);
  const acp = (Array.isArray(provenanceManifest?.sources) ? provenanceManifest.sources : [])
    .map(record)
    .find((source) => source?.name === "opencode-acp reference");
  const sourceFiles = Array.isArray(acp?.sourceFiles) ? acp.sourceFiles : [];
  const symbols = Array.isArray(acp?.symbols) ? acp.symbols : [];
  const localChanges = Array.isArray(acp?.localChanges) ? acp.localChanges : [];
  const exactAcpReference = acp?.version === ACP_VERSION
    && acp.revision === ACP_REVISION
    && acp.status === "reference-only"
    && sourceFiles.length === 0
    && symbols.length === 0
    && localChanges.length === 0
    && noticesText.includes(ACP_VERSION)
    && noticesText.includes(ACP_REVISION)
    && noticesText.includes("Source files: none copied");
  const provenance: JsonRecord = {
    schema: AILI_COMPACT_RELEASE_ARTIFACTS.provenance.schema,
    status: exactAcpReference ? "PASS" : "NON_PASS",
    ...binding,
    acpReference: {
      version: String(acp?.version ?? "missing"),
      revision: String(acp?.revision ?? "missing"),
      status: String(acp?.status ?? "missing"),
      copiedMaterial: sourceFiles.length > 0 || symbols.length > 0 || localChanges.length > 0,
    },
    provenanceSha256: sha256(provenanceText),
    sbomSha256: sha256(sbomText),
    noticesSha256: sha256(noticesText),
  };

  const bodies = new Map<ArtifactId, string>();
  const values = new Map<ArtifactId, JsonRecord>();
  const missingArtifacts: string[] = [];
  for (const [id, expected] of Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS) as Array<[
    ArtifactId,
    (typeof AILI_COMPACT_RELEASE_ARTIFACTS)[ArtifactId],
  ]>) {
    if (id === "sanitizer") continue;
    if (id === "provenance") {
      const body = serialize(provenance);
      bodies.set(id, body);
      values.set(id, provenance);
      continue;
    }
    try {
      const body = await readText(projectRoot, expected.path);
      const value = record(JSON.parse(body) as unknown);
      if (!value) throw new Error("root must be an object");
      bodies.set(id, body);
      values.set(id, value);
    } catch {
      missingArtifacts.push(expected.path);
    }
  }

  const flags = scanAiliReleaseEvidence([...bodies.values()]);
  const scannedArtifacts = [...bodies.entries()].map(([id, body]) => ({
    path: AILI_COMPACT_RELEASE_ARTIFACTS[id].path,
    sha256: sha256(body),
  }));
  const sanitizerPass = missingArtifacts.length === 0 && Object.values(flags).every((flag) => flag === false);
  const sanitizer: JsonRecord = {
    schema: AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.schema,
    status: sanitizerPass ? "PASS" : "NON_PASS",
    ...binding,
    flags,
    scannedArtifacts,
    missingArtifacts,
  };
  const sanitizerBody = serialize(sanitizer);
  bodies.set("sanitizer", sanitizerBody);
  values.set("sanitizer", sanitizer);

  const artifacts: Record<string, { path: string; sha256: string }> = {};
  for (const [id, body] of bodies) {
    artifacts[id] = { path: AILI_COMPACT_RELEASE_ARTIFACTS[id].path, sha256: sha256(body) };
  }
  const requiredIds = Object.keys(AILI_COMPACT_RELEASE_ARTIFACTS) as ArtifactId[];
  const candidateReady = requiredIds.every((id) => candidateBound(
    id, values.get(id), binding, liveHarnessSha256, liveRuntimeBinding, sourceCaptureBody, candidateArtifactBody,
  ));
  const index: JsonRecord = {
    schema: "aili.compact.release-evidence.v1",
    status: candidateReady ? "PASS" : "NON_PASS",
    ...binding,
    candidateReady,
    missingArtifacts,
    artifacts,
  };

  const expectedOutputs = new Map<string, string>([
    [AILI_COMPACT_RELEASE_ARTIFACTS.provenance.path, serialize(provenance)],
    [AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.path, sanitizerBody],
    [AILI_COMPACT_RELEASE_INDEX, serialize(index)],
  ]);
  if (options.verify) {
    for (const [path, expected] of expectedOutputs) {
      const actual = await readText(projectRoot, path).catch(() => "");
      if (actual !== expected) throw new Error(`${path}: generated release evidence is missing or drifted`);
    }
  } else {
    await Promise.all([...expectedOutputs].map(async ([path, body]) => {
      const target = join(projectRoot, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body, "utf8");
    }));
  }
  return { provenance, sanitizer, index };
}

async function main(): Promise<void> {
  const result = await generateAiliCompactReleaseEvidence(DEFAULT_ROOT, { verify: process.argv.includes("--verify") });
  console.log(`AILI Compact release evidence: ${String(result.index.status)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
