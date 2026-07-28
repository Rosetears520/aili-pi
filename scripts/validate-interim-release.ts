import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateStableRelease } from "../src/runtime/registry.ts";
import {
  AILI_COMPACT_RELEASE_ARTIFACTS,
  AILI_COMPACT_RELEASE_INDEX,
  readAiliCompactCandidateBinding,
  validateAiliCompactReleaseEvidence,
  type AiliCompactCandidateBinding,
} from "./aili-compact-release-evidence.ts";
import { generateAiliCompactReleaseEvidence } from "./generate-aili-compact-release-evidence.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "0.1.15";
const LIVE_ARTIFACT = AILI_COMPACT_RELEASE_ARTIFACTS.live.path;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

async function json(path: string): Promise<JsonRecord> {
  const parsed = record(JSON.parse(await readFile(join(ROOT, path), "utf8")) as unknown);
  if (!parsed) throw new Error(`${path}: root must be an object`);
  return parsed;
}

function pass(value: unknown): boolean {
  const item = record(value);
  return item?.status === "PASS" || item?.verdict === "PASS";
}

function bound(value: JsonRecord, binding: AiliCompactCandidateBinding): boolean {
  return value.packageVersion === binding.packageVersion
    && value.piVersion === binding.piVersion
    && value.implementationSha256 === binding.implementationSha256;
}

function exactStrings(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && JSON.stringify([...value].sort()) === JSON.stringify([...expected].sort());
}

async function validateInterimRelease(): Promise<string[]> {
  const errors: string[] = [];
  const [pkg, lock, sbom, releaseContract, driftLog] = await Promise.all([
    json("package.json"),
    json("package-lock.json"),
    json("manifests/sbom.json"),
    readFile(join(ROOT, "openspec/changes/redesign-aili-compact-lifecycle/release.md"), "utf8"),
    readFile(join(ROOT, "openspec/changes/redesign-aili-compact-lifecycle/drift-log.md"), "utf8"),
  ]);
  const lockRoot = record(record(lock.packages)?.[""]);
  const sbomRoot = (Array.isArray(sbom.packages) ? sbom.packages : [])
    .map(record).find((item) => item?.name === "@rosetears/aili-pi");
  if (pkg.version !== VERSION || lockRoot?.version !== VERSION || sbomRoot?.versionInfo !== VERSION) {
    errors.push(`interim identity must bind package, lock, and SBOM to exact ${VERSION}`);
  }
  if (!releaseContract.includes("Authorized interim patch release: `v0.1.15`")
    || !releaseContract.includes("public npm/GitHub release")
    || !driftLog.includes("User decision:")
    || !driftLog.includes("do not publish `0.2.0`")) {
    errors.push("interim release authorization record is missing or incomplete");
  }

  errors.push(...await validateStableRelease());

  let binding: AiliCompactCandidateBinding;
  try {
    binding = await readAiliCompactCandidateBinding(ROOT);
    if (binding.packageVersion !== VERSION) errors.push(`candidate binding must target exact ${VERSION}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return errors;
  }

  try {
    await generateAiliCompactReleaseEvidence(ROOT, { verify: true });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const [migration, performance, fakeProvider, provenance, sanitizer, index] = await Promise.all([
    json(AILI_COMPACT_RELEASE_ARTIFACTS.migration.path),
    json(AILI_COMPACT_RELEASE_ARTIFACTS.performance.path),
    json(AILI_COMPACT_RELEASE_ARTIFACTS.fakeProvider.path),
    json(AILI_COMPACT_RELEASE_ARTIFACTS.provenance.path),
    json(AILI_COMPACT_RELEASE_ARTIFACTS.sanitizer.path),
    json(AILI_COMPACT_RELEASE_INDEX),
  ]);
  for (const [id, artifact] of Object.entries({ migration, performance, fakeProvider, provenance, sanitizer })) {
    const expected = AILI_COMPACT_RELEASE_ARTIFACTS[id as keyof typeof AILI_COMPACT_RELEASE_ARTIFACTS];
    if (artifact.schema !== expected.schema || !bound(artifact, binding)) {
      errors.push(`${id} evidence schema or candidate binding is stale`);
    }
  }

  const migrationRows = Array.isArray(migration.matrix) ? migration.matrix.map(record).filter(Boolean) as JsonRecord[] : [];
  const historicalRow = migrationRows.find((row) => row.id === "separately-installed-v0.1.14-binary");
  if (migration.verdict !== "NON_PASS" || migration.sanitized !== true || migration.rawBodyIncluded !== false
    || historicalRow?.status !== "Unverified"
    || migrationRows.length < 2
    || migrationRows.some((row) => row !== historicalRow && !pass(row))) {
    errors.push("migration evidence must keep only the unavailable historical 0.1.14 binary row Unverified");
  }
  if (!pass(performance) || !pass(fakeProvider) || !pass(provenance)) {
    errors.push("performance, fake-provider, and provenance evidence must PASS");
  }
  if (sanitizer.status !== "NON_PASS" || !exactStrings(sanitizer.missingArtifacts, [LIVE_ARTIFACT])
    || Object.values(record(sanitizer.flags) ?? {}).some((flag) => flag !== false)) {
    errors.push("sanitizer must be clean and NON_PASS only because live evidence is absent");
  }
  if (index.status !== "NON_PASS" || index.candidateReady !== false || !bound(index, binding)
    || !exactStrings(index.missingArtifacts, [LIVE_ARTIFACT])) {
    errors.push("release index must remain NON_PASS and bind the single absent live artifact");
  }
  try {
    await access(join(ROOT, LIVE_ARTIFACT));
    errors.push("live evidence artifact must not be invented for the interim release");
  } catch {
    // Expected: live/provider verification remains an explicit human/external gate.
  }

  const compactErrors = await validateAiliCompactReleaseEvidence(ROOT);
  const actualCategories = compactErrors.map((error) => /\[([^\]]+)\]/.exec(error)?.[1] ?? "unclassified").sort();
  const expectedCategories = [
    "fakeProvider", "index", "live", "migration", "package", "performance", "provenance", "sanitizer",
  ].sort();
  if (JSON.stringify(actualCategories) !== JSON.stringify(expectedCategories)) {
    errors.push(`final 0.2.0 gate drifted; expected explicit NON_PASS categories ${expectedCategories.join(", ")}`);
  }
  return errors;
}

const errors = await validateInterimRelease();
if (errors.length > 0) {
  console.error(`interim ${VERSION} release validation failed (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`interim ${VERSION} release validation passed; live/provider and historical-binary evidence remains Unverified`);
}
