import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const AILI_COMPACT_TARGET_VERSION = "0.2.0";
export const AILI_COMPACT_PI_VERSION = "0.82.1";
const HASH = /^[0-9a-f]{64}$/;

export const AILI_COMPACT_RELEASE_INDEX = "artifacts/test-results/aili-compact-release-evidence.json";
export const AILI_COMPACT_RELEASE_ARTIFACTS = {
  migration: {
    path: "artifacts/test-results/aili-compact-migration.json",
    schema: "aili.compact.migration-evidence.v1",
  },
  performance: {
    path: "artifacts/test-results/aili-compact-lifecycle-performance.json",
    schema: "aili.compact.lifecycle.performance.v1",
  },
  fakeProvider: {
    path: "artifacts/test-results/aili-compact-fake-provider.json",
    schema: "aili.compact.fake-provider-evidence.v1",
  },
  live: {
    path: "artifacts/test-results/aili-compact-live-v2.json",
    schema: "aili.compact.live-evidence.v2",
  },
  provenance: {
    path: "artifacts/test-results/aili-compact-provenance.json",
    schema: "aili.compact.provenance-evidence.v1",
  },
  sanitizer: {
    path: "artifacts/test-results/aili-compact-sanitizer.json",
    schema: "aili.compact.sanitizer-evidence.v1",
  },
} as const;

type ArtifactId = keyof typeof AILI_COMPACT_RELEASE_ARTIFACTS;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function passed(value: unknown): boolean {
  const item = record(value);
  return item?.status === "PASS" || item?.verdict === "PASS";
}

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function text(root: string, path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

async function json(root: string, path: string): Promise<JsonRecord> {
  const value = JSON.parse(await text(root, path)) as unknown;
  const parsed = record(value);
  if (!parsed) throw new Error("root must be an object");
  return parsed;
}

export async function computeAiliCompactImplementationSha256(root: string): Promise<string> {
  const compactRoot = join(root, "src/runtime/aili-compact");
  const compactFiles = (await readdir(compactRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => `src/runtime/aili-compact/${entry.name}`)
    .sort();
  const paths = ["extensions/index.ts", ...compactFiles];
  const bindings = await Promise.all(paths.map(async (path) => [path, hash(await text(root, path))] as const));
  return hash(JSON.stringify(bindings));
}

export interface AiliCompactCandidateBinding {
  packageVersion: string;
  piVersion: typeof AILI_COMPACT_PI_VERSION;
  implementationSha256: string;
}

/**
 * Bind durable evidence to the package identity, exact supported Pi baseline,
 * and the complete owned Compact implementation currently under test.
 */
export async function readAiliCompactCandidateBinding(root = DEFAULT_ROOT): Promise<AiliCompactCandidateBinding> {
  const projectRoot = resolve(root);
  const [pkg, lock, implementationSha256] = await Promise.all([
    json(projectRoot, "package.json"),
    json(projectRoot, "package-lock.json"),
    computeAiliCompactImplementationSha256(projectRoot),
  ]);
  const packageVersion = typeof pkg.version === "string" ? pkg.version : "";
  const piHost = record(record(lock.packages)?.["node_modules/@earendil-works/pi-coding-agent"]);
  if (!packageVersion) throw new Error("package version is missing");
  if (piHost?.version !== AILI_COMPACT_PI_VERSION) {
    throw new Error(`active Pi host must be exact ${AILI_COMPACT_PI_VERSION}`);
  }
  return { packageVersion, piVersion: AILI_COMPACT_PI_VERSION, implementationSha256 };
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function allRowsPass(value: unknown): boolean {
  const rows = Array.isArray(value) ? value : Object.values(record(value) ?? {});
  return rows.length > 0 && rows.every(passed);
}

function validateArtifact(id: ArtifactId, value: JsonRecord): boolean {
  if (!passed(value)) return false;
  if (id === "migration") {
    return value.sanitized === true && value.rawBodyIncluded === false && allRowsPass(value.matrix);
  }
  if (id === "performance") {
    const corpus = record(value.corpus);
    const sanitizer = record(value.sanitizer);
    return corpus?.providerMessages === 10_000 && corpus.referenceOperations === 100_000
      && sanitizer?.sourceBodiesIncluded === false && sanitizer.credentialsIncluded === false;
  }
  if (id === "fakeProvider") {
    const sanitizer = record(value.sanitizer);
    return allRowsPass(value.rows) && sanitizer !== undefined
      && Object.values(sanitizer).every((flag) => flag === false);
  }
  if (id === "live") {
    const providers = record(value.providers);
    if (!providers || !exactKeys(providers, ["openai", "anthropic", "google-gemini"])) return false;
    return Object.values(providers).every((provider) => {
      const item = record(provider);
      const rows = record(item?.rows);
      const expectedRows = Array.from({ length: 10 }, (_, index) => `LIVE-V2-${index + 1}`);
      return passed(item) && rows !== undefined && exactKeys(rows, expectedRows) && allRowsPass(rows)
        && passed(item?.p0) && passed(item?.longLifecycle) && passed(item?.continuedWork)
        && passed(record(item?.extensionOrdering)?.before) && passed(record(item?.extensionOrdering)?.after);
    });
  }
  if (id === "provenance") {
    const acp = record(value.acpReference);
    return acp?.version === "1.14.3"
      && acp.revision === "00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb"
      && acp.status === "reference-only"
      && acp.copiedMaterial === false
      && HASH.test(String(value.provenanceSha256 ?? ""))
      && HASH.test(String(value.sbomSha256 ?? ""))
      && HASH.test(String(value.noticesSha256 ?? ""));
  }
  const flags = record(value.flags);
  const scanned = Array.isArray(value.scannedArtifacts) ? value.scannedArtifacts : [];
  const requiredScans = Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS)
    .filter(([key]) => key !== "sanitizer")
    .map(([, item]) => item.path);
  return flags !== undefined && Object.values(flags).length > 0 && Object.values(flags).every((flag) => flag === false)
    && requiredScans.every((path) => scanned.includes(path));
}

function addOnce(errors: string[], category: string, detail: string): void {
  if (!errors.some((error) => error.includes(`[${category}]`))) {
    errors.push(`AILI Compact release evidence NON_PASS [${category}]: ${detail}`);
  }
}

/**
 * Read-only release gate for the active Compact redesign. Errors are bounded to
 * one sanitized message per evidence category.
 */
export async function validateAiliCompactReleaseEvidence(root = DEFAULT_ROOT): Promise<string[]> {
  const projectRoot = resolve(root);
  try {
    await readFile(join(projectRoot, "openspec/changes/redesign-aili-compact-lifecycle/proposal.md"));
  } catch {
    return [];
  }

  const errors: string[] = [];
  let implementationHash: string | undefined;
  try {
    implementationHash = await computeAiliCompactImplementationSha256(projectRoot);
    const [config, v3, runtime] = await Promise.all([
      text(projectRoot, "src/runtime/aili-compact/config.ts"),
      text(projectRoot, "src/runtime/aili-compact/v3.ts"),
      text(projectRoot, "src/runtime/aili-compact/v3-runtime.ts"),
    ]);
    const defaults = config.slice(config.indexOf("DEFAULT_COMPACT_CONFIG"), config.indexOf("EMPTY_COMPACT_PROMPT_SNAPSHOT"));
    const requiredDefaults = [
      /preserveRecentAtoms:\s*8\b/,
      /preserveRecentTokens:\s*12_000\b/,
      /preserveRecentTokenCapRatio:\s*0\.10\b/,
      /preserveLastUserMessage:\s*true\b/,
      /planning:\s*{\s*enabled:\s*true\s*}/,
      /quality:\s*{\s*enabled:\s*true/,
      /index:\s*{\s*enabled:\s*true,\s*snapshotLru:\s*4\s*}/,
    ];
    if (!v3.includes('AILI_COMPACT_SCHEMA_V3 = "aili.compact.tx.v3"')
      || !runtime.includes('V3_PROJECTION_VERSION = "aili.projector.v3"')
      || requiredDefaults.some((pattern) => !pattern.test(defaults))) {
      addOnce(errors, "schema-defaults", "accepted v3 schema/default declarations are missing or stale");
    }
  } catch {
    addOnce(errors, "schema-defaults", "implementation binding could not be read");
  }

  try {
    const [pkg, lock, sbom] = await Promise.all([
      json(projectRoot, "package.json"),
      json(projectRoot, "package-lock.json"),
      json(projectRoot, "manifests/sbom.json"),
    ]);
    const lockRoot = record(record(lock.packages)?.[""]);
    const sbomRoot = (Array.isArray(sbom.packages) ? sbom.packages : [])
      .map(record).find((item) => item?.name === "@rosetears/aili-pi");
    if (pkg.name !== "@rosetears/aili-pi" || pkg.version !== AILI_COMPACT_TARGET_VERSION
      || lockRoot?.name !== "@rosetears/aili-pi" || lockRoot.version !== AILI_COMPACT_TARGET_VERSION
      || sbomRoot?.versionInfo !== AILI_COMPACT_TARGET_VERSION) {
      addOnce(errors, "package", "package, lock root, and SBOM must all target exact 0.2.0");
    }
  } catch {
    addOnce(errors, "package", "package, lock root, or SBOM identity is missing");
  }

  let provenanceHashes: { provenance: string; sbom: string; notices: string } | undefined;
  try {
    const [provenanceText, sbomText, notices] = await Promise.all([
      text(projectRoot, "manifests/provenance.json"),
      text(projectRoot, "manifests/sbom.json"),
      text(projectRoot, "THIRD_PARTY_NOTICES.md"),
    ]);
    const provenance = record(JSON.parse(provenanceText));
    const acp = (Array.isArray(provenance?.sources) ? provenance.sources : [])
      .map(record).find((item) => item?.name === "opencode-acp reference");
    provenanceHashes = { provenance: hash(provenanceText), sbom: hash(sbomText), notices: hash(notices) };
    if (acp?.version !== "1.14.3" || acp.revision !== "00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb"
      || acp.status !== "reference-only" || (Array.isArray(acp.sourceFiles) && acp.sourceFiles.length > 0)
      || !notices.includes("00e8ba5c53fcbc46dfd86b5d7aa6eae058d29acb") || !notices.includes("1.14.3")) {
      addOnce(errors, "provenance", "exact ACP reference-only identity/no-copy notice is missing or stale");
    }
  } catch {
    addOnce(errors, "provenance", "provenance, SBOM, or notices are missing");
  }

  let index: JsonRecord | undefined;
  try {
    index = await json(projectRoot, AILI_COMPACT_RELEASE_INDEX);
    if (index.schema !== "aili.compact.release-evidence.v1" || !passed(index)
      || index.packageVersion !== AILI_COMPACT_TARGET_VERSION || index.piVersion !== AILI_COMPACT_PI_VERSION
      || index.implementationSha256 !== implementationHash || !record(index.artifacts)) {
      addOnce(errors, "index", "release index schema, target versions, status, or implementation hash is stale");
    }
  } catch {
    addOnce(errors, "index", "release evidence index is missing or invalid");
  }

  for (const [id, expected] of Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS) as Array<[ArtifactId, (typeof AILI_COMPACT_RELEASE_ARTIFACTS)[ArtifactId]]>) {
    try {
      const body = await text(projectRoot, expected.path);
      const value = record(JSON.parse(body));
      const reference = record(record(index?.artifacts)?.[id]);
      if (!value || value.schema !== expected.schema || value.packageVersion !== AILI_COMPACT_TARGET_VERSION
        || value.piVersion !== AILI_COMPACT_PI_VERSION || value.implementationSha256 !== implementationHash
        || reference?.path !== expected.path || reference.sha256 !== hash(body)
        || !validateArtifact(id, value)) {
        addOnce(errors, id, "evidence schema, PASS status, target binding, hash, or sanitizer contract is stale");
        continue;
      }
      if (id === "provenance" && provenanceHashes) {
        if (value.provenanceSha256 !== provenanceHashes.provenance || value.sbomSha256 !== provenanceHashes.sbom
          || value.noticesSha256 !== provenanceHashes.notices) {
          addOnce(errors, id, "provenance evidence hashes do not bind the candidate metadata");
        }
      }
    } catch {
      addOnce(errors, id, "required evidence is missing or invalid");
    }
  }
  return errors;
}
