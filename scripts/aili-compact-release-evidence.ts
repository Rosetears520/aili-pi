import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPACT_LIVE_PROVIDER_FAMILIES,
  validateCompactLiveRowPass,
  type CompactLiveExpectedBinding,
  type CompactLiveProviderFamily,
} from "./aili-compact-live-observations.ts";
import {
  AILI_RELEASE_SANITIZER_FLAGS,
  assertAiliReleaseEvidenceSanitized,
  scanAiliReleaseEvidence,
  type AiliReleaseSanitizerFlags,
} from "./aili-compact-evidence-sanitizer.ts";
import {
  COMPACT_HUMAN_REVIEW_CANDIDATE_PATH,
  validateCompactHumanReviewCandidate,
} from "./live-release-support.ts";

export { AILI_RELEASE_SANITIZER_FLAGS, assertAiliReleaseEvidenceSanitized, scanAiliReleaseEvidence };
export type { AiliReleaseSanitizerFlags };

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const AILI_COMPACT_TARGET_VERSION = "0.2.0";
export const AILI_COMPACT_PI_VERSION = "0.82.1";
export const AILI_COMPACT_PREDECESSOR_PACKAGE = "@rosetears/aili-pi";
export const AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION = "0.1.16";
export const AILI_COMPACT_EXPECTED_PREDECESSOR_TAG = `v${AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION}`;
export const AILI_COMPACT_PREDECESSOR_IDENTITY = "artifacts/test-results/aili-compact-predecessor-identity.json";
export const AILI_COMPACT_INSTALLED_ROLLBACK = "artifacts/test-results/aili-compact-installed-rollback.json";
const HASH = /^[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const NPM_SHASUM = /^[0-9a-f]{40}$/;
const NPM_INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const PREDECESSOR_IDENTITY_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const PREDECESSOR_IDENTITY_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
const PREDECESSOR_TAG_OBJECT_SHA = "1e6b81702ddbadec9d2f214492d412010f6333f1";
const PREDECESSOR_COMMIT_SHA = "e8a8f77f84a1dc608da7ce0c0f047f5c552b0546";
const PREDECESSOR_NPM_INTEGRITY = "sha512-E9P8IiNVHYZRCvFZE/p7OjifDIzjmXP7YkWb8MJv5TT74XVurpuW5i5tGAKaQ8dTbsZIZWADH9JKglypnu5HJA==";
const PREDECESSOR_NPM_SHASUM = "05acae8dc4ba912c018f1d03644ef4da598bca8e";
const PREDECESSOR_FIRST_PARTY_FILE_COUNT = 173;
const PREDECESSOR_AGGREGATE_SHA256 = "32792bde86c5ef8ce0d2310271c1d77a065c6877fe765f1e3f571809537c14b0";
const LIVE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const LIVE_EVIDENCE_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000;
export const AILI_COMPACT_LIVE_HARNESS = "tests/integration/aili-compact-live-release-gated.test.ts";

export const AILI_COMPACT_RELEASE_INDEX = "artifacts/test-results/aili-compact-release-evidence.json";
export const AILI_COMPACT_LIVE_CAPTURE_PATH = "artifacts/test-results/aili-compact-live-v2.json";
export const AILI_COMPACT_REVIEWED_LIVE_PATH = "artifacts/test-results/aili-compact-reviewed-live-v3.json";
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
    path: AILI_COMPACT_REVIEWED_LIVE_PATH,
    schema: "aili.compact.reviewed-live-evidence.v1",
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

export interface AiliCompactLiveRuntimeBinding {
  piExecutableSha256: string;
  productionEntrySha256: string;
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

function freshTimestamp(value: unknown, now: number): boolean {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed)
    && parsed <= now + LIVE_EVIDENCE_FUTURE_TOLERANCE_MS
    && now - parsed <= LIVE_EVIDENCE_MAX_AGE_MS;
}

function boundedString(value: unknown, max = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\r\n\u0000-\u001f]/.test(value);
}

function exactUsage(value: unknown): boolean {
  const usage = record(value);
  if (!usage || !exactKeys(usage, ["input", "output", "cacheRead", "cacheWrite", "totalTokens"])) return false;
  const values = Object.values(usage);
  return values.every((item) => Number.isSafeInteger(item) && Number(item) >= 0 && Number(item) <= 10_000_000)
    && Number(usage.totalTokens) > 0
    && Number(usage.totalTokens) >= Number(usage.input) + Number(usage.output);
}

const PROVIDER_IDENTITIES: Record<string, readonly string[]> = {
  openai: ["openai", "openai-codex"],
  anthropic: ["anthropic"],
  "google-gemini": ["google", "google-generative-ai", "google-gemini-cli"],
};

export function validateAiliCompactLiveArtifact(
  value: JsonRecord,
  expectedHarnessSha256: string,
  expectedRuntime: AiliCompactLiveRuntimeBinding,
  now = Date.now(),
): boolean {
  const representative = record(value.representative);
  const harness = record(value.liveHarness);
  const runtimeBinding = record(value.runtimeBinding);
  if (!exactKeys(value, ["schema", "status", "packageVersion", "piVersion", "implementationSha256", "capturedAt", "sanitized", "liveHarness", "runtimeBinding", "representative"])
    || value.schema !== "aili.compact.live-evidence.v3"
    || !passed(value)
    || value.sanitized !== true
    || !freshTimestamp(value.capturedAt, now)
    || harness?.path !== AILI_COMPACT_LIVE_HARNESS
    || harness.sha256 !== expectedHarnessSha256
    || !runtimeBinding || !exactKeys(runtimeBinding, ["piExecutable", "productionEntry"])
    || !exactRuntimeFileBinding(record(runtimeBinding.piExecutable), "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", expectedRuntime.piExecutableSha256)
    || !exactRuntimeFileBinding(record(runtimeBinding.productionEntry), "extensions/index.ts", expectedRuntime.productionEntrySha256)
    || !representative
    || !exactKeys(representative, ["status", "providerFamily", "provider", "model", "api", "contextWindow", "transport", "suffix", "overflow", "semanticReview", "extensionOrdering", "cacheTelemetry"])) return false;

  const family = representative.providerFamily as CompactLiveProviderFamily;
  if (!COMPACT_LIVE_PROVIDER_FAMILIES.includes(family)) return false;
  const transport = record(representative.transport);
  const ordering = record(representative.extensionOrdering);
  const before = record(ordering?.before);
  const after = record(ordering?.after);
  const provider = String(representative.provider ?? "");
  const model = String(representative.model ?? "");
  const api = String(representative.api ?? "");
  const expectedBinding: CompactLiveExpectedBinding = {
    providerFamily: family,
    provider,
    model,
    api,
    packageVersion: String(value.packageVersion ?? ""),
    piVersion: AILI_COMPACT_PI_VERSION,
    implementationSha256: String(value.implementationSha256 ?? ""),
    liveHarnessSha256: expectedHarnessSha256,
    piExecutableSha256: expectedRuntime.piExecutableSha256,
    productionEntrySha256: expectedRuntime.productionEntrySha256,
  };
  if (!passed(representative)
      || !PROVIDER_IDENTITIES[family]!.includes(provider)
      || !boundedString(model)
      || !boundedString(api)
      || !Number.isSafeInteger(representative.contextWindow)
      || Number(representative.contextWindow) <= 0
      || Number(representative.contextWindow) > 10_000_000
      || !passed(transport)
      || !transport || !exactKeys(transport, ["status", "provider", "model", "api", "contextWindow", "responseDigest", "usage"])
      || transport?.provider !== provider
      || transport.model !== model
      || transport.api !== api
      || transport.contextWindow !== representative.contextWindow
      || !HASH.test(String(transport.responseDigest ?? ""))
      || !exactUsage(transport.usage)
      || !validateCompactLiveRowPass(representative.suffix, expectedBinding, "LIVE-V2-1", now)
      || !validateCompactLiveRowPass(representative.overflow, expectedBinding, "LIVE-V2-7", now)
      || !validateRepresentativeSemanticReview(representative.semanticReview, expectedBinding, now)
      || !ordering || !exactKeys(ordering, ["before", "after"])
      || !before || !exactKeys(before, ["status", "order"]) || !passed(before)
      || JSON.stringify(before?.order) !== JSON.stringify(["before", "aili", "after"])
      || !after || !exactKeys(after, ["status", "observations"]) || !passed(after)
      || JSON.stringify(after?.observations) !== JSON.stringify(["before", "after"])
      || !validateCacheTelemetry(representative.cacheTelemetry, transport.usage)) return false;
  return true;
}

function validateCacheTelemetry(value: unknown, usageValue: unknown): boolean {
  const cache = record(value);
  const usage = record(usageValue);
  if (!cache || !usage) return false;
  if (cache.status === "Unverified") {
    const reason = String(cache.reason);
    return exactKeys(cache, ["status", "cacheHitClaim", "reason"])
      && cache.cacheHitClaim === false
      && ["missing", "zero", "ambiguous"].includes(reason)
      && (reason === "ambiguous" || (usage.cacheRead === 0 && usage.cacheWrite === 0));
  }
  return cache.status === "PASS"
    && exactKeys(cache, ["status", "cacheHitClaim", "source", "cacheReadTokens", "cacheWriteTokens"])
    && cache.cacheHitClaim === true
    && cache.source === "provider-reported"
    && Number.isSafeInteger(cache.cacheReadTokens) && Number(cache.cacheReadTokens) > 0
    && Number.isSafeInteger(cache.cacheWriteTokens) && Number(cache.cacheWriteTokens) >= 0
    && cache.cacheReadTokens === usage.cacheRead && cache.cacheWriteTokens === usage.cacheWrite;
}

function exactRuntimeFileBinding(value: JsonRecord | undefined, path: string, sha256: string): boolean {
  return !!value && exactKeys(value, ["path", "sha256"]) && value.path === path && value.sha256 === sha256 && HASH.test(sha256);
}

function validateRepresentativeSemanticReview(value: unknown, expected: CompactLiveExpectedBinding, now: number): boolean {
  const item = record(value); const binding = record(item?.binding); const candidate = record(binding?.candidate); const harness = record(binding?.harness); const capture = record(item?.capture);
  const review = record(item?.humanReview); const evidence = record(item?.candidateEvidence);
  return !!item && exactKeys(item, ["status", "observationClass", "observedAt", "source", "syntheticEvidenceAccepted", "binding", "capture", "eventDigest", "eventCount", "candidateEvidence", "humanReview"])
    && item.status === "PASS" && item.observationClass === "representative-long-lifecycle-human-review" && item.source === "official-pi-agent-session" && item.syntheticEvidenceAccepted === false
    && freshTimestamp(item.observedAt, now) && exactLiveBinding(binding, candidate, harness, expected) && exactCapture(capture, item.eventCount)
    && validateSemanticCandidateEvidence(evidence)
    && item.eventDigest === hash(JSON.stringify(evidence)) && item.eventCount === 4
    && !!review && exactKeys(review, ["verdict", "verdictId", "verdictSource", "candidateSha256", "verdictSha256", "hardFactsRetained", "limitationsAccepted"])
    && review.verdict === "PASS" && boundedString(review.verdictId, 128) && review.verdictSource === "external-human-verdict-artifact"
    && review.candidateSha256 === evidence?.candidateSha256 && HASH.test(String(review.verdictSha256 ?? ""))
    && review.hardFactsRetained === true && review.limitationsAccepted === true;
}

function validateSemanticCandidateEvidence(value: JsonRecord | undefined): boolean {
  if (!value || !exactKeys(value, ["candidateId", "candidateSha256", "tiers", "providerToolCallIds", "transactionIds", "transactionSha256", "summarySha256"])) return false;
  const tiers = Array.isArray(value.tiers) ? value.tiers : [];
  const callIds = Array.isArray(value.providerToolCallIds) ? value.providerToolCallIds : [];
  const transactionIds = Array.isArray(value.transactionIds) ? value.transactionIds : [];
  const transactionDigests = Array.isArray(value.transactionSha256) ? value.transactionSha256 : [];
  const summaryDigests = Array.isArray(value.summarySha256) ? value.summarySha256 : [];
  return boundedString(value.candidateId, 64) && HASH.test(String(value.candidateSha256 ?? ""))
    && value.candidateId === `review-${String(value.candidateSha256).slice(0, 24)}`
    && JSON.stringify(tiers) === JSON.stringify(["T1", "T2", "T3", "T3-restill"])
    && callIds.length === 4 && transactionIds.length === 4
    && callIds.every((item) => boundedString(item, 128)) && transactionIds.every((item) => boundedString(item, 128))
    && new Set(callIds).size === 4 && new Set(transactionIds).size === 4
    && transactionDigests.length === 4 && summaryDigests.length === 4
    && transactionDigests.every((item) => HASH.test(String(item))) && summaryDigests.every((item) => HASH.test(String(item)));
}

function validatePendingSemanticReview(value: unknown, expected: CompactLiveExpectedBinding, candidateValue: JsonRecord, now: number): boolean {
  const item = record(value); const binding = record(item?.binding); const candidateBinding = record(binding?.candidate);
  const harness = record(binding?.harness); const capture = record(item?.capture); const evidence = record(item?.candidateEvidence); const review = record(item?.humanReview);
  const transactions = Array.isArray(candidateValue.transactions) ? candidateValue.transactions.map(record) : [];
  const expectedEvidence = {
    candidateId: candidateValue.candidateId,
    candidateSha256: candidateValue.candidateSha256,
    tiers: transactions.map((transaction) => transaction?.tier),
    providerToolCallIds: transactions.map((transaction) => transaction?.providerToolCallId),
    transactionIds: transactions.map((transaction) => transaction?.transactionId),
    transactionSha256: transactions.map((transaction) => transaction?.transactionSha256),
    summarySha256: transactions.map((transaction) => transaction?.summarySha256),
  };
  return !!item && exactKeys(item, ["status", "observationClass", "observedAt", "source", "syntheticEvidenceAccepted", "binding", "capture", "eventDigest", "eventCount", "candidateEvidence", "humanReview"])
    && item.status === "PENDING" && item.observationClass === "representative-long-lifecycle-human-review"
    && item.source === "official-pi-agent-session" && item.syntheticEvidenceAccepted === false && freshTimestamp(item.observedAt, now)
    && exactLiveBinding(binding, candidateBinding, harness, expected) && exactCapture(capture, item.eventCount)
    && JSON.stringify(evidence) === JSON.stringify(expectedEvidence) && validateSemanticCandidateEvidence(evidence)
    && item.eventDigest === hash(JSON.stringify(evidence)) && item.eventCount === 4
    && !!review && exactKeys(review, ["verdict", "verdictSource"])
    && review.verdict === "PENDING" && review.verdictSource === "external-human-verdict-required";
}

export function validateAiliCompactReviewedLiveArtifact(
  value: JsonRecord,
  sourceCaptureBody: string,
  candidateArtifactBody: string,
  expectedHarnessSha256: string,
  expectedRuntime: AiliCompactLiveRuntimeBinding,
  now = Date.now(),
): boolean {
  let source: JsonRecord | undefined; let candidateArtifact: JsonRecord | undefined;
  try {
    source = record(JSON.parse(sourceCaptureBody) as unknown);
    candidateArtifact = record(JSON.parse(candidateArtifactBody) as unknown);
  } catch { return false; }
  const composition = record(value.composition); const sourceRef = record(composition?.sourceCapture);
  const candidateRef = record(composition?.candidateArtifact); const verdict = record(composition?.humanVerdict);
  const liveEvidence = record(value.liveEvidence); const representative = record(source?.representative);
  const sourceHarness = record(source?.liveHarness); const runtime = record(source?.runtimeBinding);
  const sourcePi = record(runtime?.piExecutable); const sourceEntry = record(runtime?.productionEntry);
  const candidates = record(candidateArtifact?.candidates);
  const candidateLiveCapture = record(candidateArtifact?.liveCapture);
  const candidateHarness = record(candidateArtifact?.liveHarness);
  const candidateSanitizer = record(candidateArtifact?.sanitizer);
  const family = representative?.providerFamily as CompactLiveProviderFamily;
  const candidateValue = record(candidates?.[family]); const candidateBinding = record(candidateValue?.binding) as CompactLiveExpectedBinding | undefined;
  const expected: CompactLiveExpectedBinding = {
    providerFamily: family,
    provider: String(representative?.provider ?? ""), model: String(representative?.model ?? ""), api: String(representative?.api ?? ""),
    packageVersion: String(source?.packageVersion ?? ""), piVersion: AILI_COMPACT_PI_VERSION,
    implementationSha256: String(source?.implementationSha256 ?? ""), liveHarnessSha256: expectedHarnessSha256,
    piExecutableSha256: expectedRuntime.piExecutableSha256, productionEntrySha256: expectedRuntime.productionEntrySha256,
  };
  if (!source || !candidateArtifact || !composition || !sourceRef || !candidateRef || !verdict || !liveEvidence || !representative || !candidateValue
    || !exactKeys(value, ["schema", "status", "packageVersion", "piVersion", "implementationSha256", "reviewedAt", "sanitized", "composition", "liveEvidence"])
    || value.schema !== AILI_COMPACT_RELEASE_ARTIFACTS.live.schema || value.sanitized !== true || !freshTimestamp(value.reviewedAt, now)
    || !exactKeys(composition, ["sourceCapture", "candidateArtifact", "humanVerdict"])
    || !exactKeys(sourceRef, ["path", "sha256"]) || sourceRef.path !== AILI_COMPACT_LIVE_CAPTURE_PATH || sourceRef.sha256 !== hash(sourceCaptureBody)
    || !exactKeys(candidateRef, ["path", "sha256", "candidateId", "candidateSha256"]) || candidateRef.path !== COMPACT_HUMAN_REVIEW_CANDIDATE_PATH
    || candidateRef.sha256 !== hash(candidateArtifactBody) || candidateRef.candidateId !== candidateValue.candidateId || candidateRef.candidateSha256 !== candidateValue.candidateSha256
    || source.schema !== "aili.compact.live-evidence.v3" || source.status !== "NON_PASS" || source.sanitized !== true || !freshTimestamp(source.capturedAt, now)
    || !exactKeys(source, ["schema", "status", "packageVersion", "piVersion", "implementationSha256", "capturedAt", "sanitized", "liveHarness", "runtimeBinding", "representative"])
    || source.packageVersion !== value.packageVersion || source.piVersion !== value.piVersion || source.implementationSha256 !== value.implementationSha256
    || sourceHarness?.path !== AILI_COMPACT_LIVE_HARNESS || sourceHarness.sha256 !== expectedHarnessSha256
    || !exactRuntimeFileBinding(sourcePi, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", expectedRuntime.piExecutableSha256)
    || !exactRuntimeFileBinding(sourceEntry, "extensions/index.ts", expectedRuntime.productionEntrySha256)
    || representative.status !== "NON_PASS" || !COMPACT_LIVE_PROVIDER_FAMILIES.includes(family)
    || !exactKeys(candidateArtifact, ["schema", "status", "reviewState", "capturedAt", "packageVersion", "piVersion", "implementationSha256", "liveHarness", "liveCapture", "candidates", "sanitizer"])
    || candidateArtifact.schema !== "aili.compact.human-review-candidates.v1" || candidateArtifact.status !== "PENDING"
    || candidateArtifact.reviewState !== "human-verdict-required" || candidateArtifact.packageVersion !== source.packageVersion
    || candidateArtifact.piVersion !== source.piVersion || candidateArtifact.implementationSha256 !== source.implementationSha256
    || !freshTimestamp(candidateArtifact.capturedAt, now)
    || !candidateHarness || !exactKeys(candidateHarness, ["path", "sha256"])
    || candidateHarness.path !== AILI_COMPACT_LIVE_HARNESS || candidateHarness.sha256 !== expectedHarnessSha256
    || !candidateLiveCapture || !exactKeys(candidateLiveCapture, ["path", "sha256"])
    || candidateLiveCapture.path !== AILI_COMPACT_LIVE_CAPTURE_PATH || candidateLiveCapture.sha256 !== hash(sourceCaptureBody)
    || !candidateSanitizer || !exactKeys(candidateSanitizer, AILI_RELEASE_SANITIZER_FLAGS)
    || Object.values(candidateSanitizer).some((flag) => flag !== false)
    || JSON.stringify(Object.keys(candidates ?? {})) !== JSON.stringify([family])
    || !candidateBinding || !validateCompactHumanReviewCandidate(candidateValue, candidateBinding)
    || candidateBinding.providerFamily !== expected.providerFamily || candidateBinding.provider !== expected.provider
    || candidateBinding.model !== expected.model || candidateBinding.api !== expected.api
    || candidateBinding.packageVersion !== expected.packageVersion || candidateBinding.piVersion !== expected.piVersion
    || candidateBinding.implementationSha256 !== expected.implementationSha256 || candidateBinding.liveHarnessSha256 !== expected.liveHarnessSha256
    || !validatePendingSemanticReview(representative.semanticReview, expected, candidateValue, now)
    || !exactKeys(verdict, ["schema", "humanAuthored", "reviewerId", "reviewedAt", "candidateId", "candidateSha256", "verdictId", "verdict", "hardFactsRetained", "limitationsAccepted", "sha256"])
    || verdict.schema !== "aili.compact.human-review-verdict.v1" || verdict.humanAuthored !== true || verdict.verdict !== "PASS"
    || !boundedString(verdict.reviewerId, 128) || !boundedString(verdict.verdictId, 128) || verdict.reviewedAt !== value.reviewedAt
    || verdict.candidateId !== candidateValue.candidateId || verdict.candidateSha256 !== candidateValue.candidateSha256
    || verdict.hardFactsRetained !== true || verdict.limitationsAccepted !== true || !HASH.test(String(verdict.sha256 ?? ""))) return false;
  const { sha256: verdictSha256, ...verdictBody } = verdict;
  if (verdictSha256 !== hash(JSON.stringify(verdictBody))) return false;
  const expectedPass = structuredClone(source);
  expectedPass.status = "PASS";
  const expectedRepresentative = record(expectedPass.representative)!;
  expectedRepresentative.status = "PASS";
  const pendingSemantic = record(representative.semanticReview)!;
  expectedRepresentative.semanticReview = {
    ...pendingSemantic,
    status: "PASS",
    humanReview: {
      verdict: "PASS", verdictId: verdict.verdictId, verdictSource: "external-human-verdict-artifact",
      candidateSha256: candidateValue.candidateSha256, verdictSha256,
      hardFactsRetained: true, limitationsAccepted: true,
    },
  };
  const expectedNonPass = structuredClone(expectedPass);
  expectedNonPass.status = "NON_PASS";
  record(expectedNonPass.representative)!.status = "NON_PASS";
  const fullPass = JSON.stringify(liveEvidence) === JSON.stringify(expectedPass)
    && validateAiliCompactLiveArtifact(liveEvidence, expectedHarnessSha256, expectedRuntime, now);
  return value.status === (fullPass ? "PASS" : "NON_PASS")
    && (fullPass || JSON.stringify(liveEvidence) === JSON.stringify(expectedNonPass))
    && Object.values(scanAiliReleaseEvidence([sourceCaptureBody, candidateArtifactBody, JSON.stringify(value)])).every((flag) => flag === false);
}

function exactLiveBinding(binding: JsonRecord | undefined, candidate: JsonRecord | undefined, harness: JsonRecord | undefined, expected: CompactLiveExpectedBinding): boolean {
  return !!binding && exactKeys(binding, ["providerFamily", "provider", "model", "api", "candidate", "harness"])
    && binding.providerFamily === expected.providerFamily && binding.provider === expected.provider && binding.model === expected.model && binding.api === expected.api
    && !!candidate && exactKeys(candidate, ["packageVersion", "piVersion", "implementationSha256"])
    && candidate.packageVersion === expected.packageVersion && candidate.piVersion === expected.piVersion && candidate.implementationSha256 === expected.implementationSha256
    && !!harness && exactKeys(harness, ["path", "sha256"]) && harness.path === AILI_COMPACT_LIVE_HARNESS && harness.sha256 === expected.liveHarnessSha256;
}

function exactCapture(capture: JsonRecord | undefined, eventCount: unknown): boolean {
  const bytes = typeof capture?.bytes === "string" ? capture.bytes : "";
  return !!capture && exactKeys(capture, ["sanitized", "encoding", "bytes", "byteLength", "sha256"]) && capture.sanitized === true
    && capture.encoding === "utf8-event-codes-v1" && bytes.length > 0 && bytes.length <= 100_000 && /^[a-z0-9-]+(?:\n[a-z0-9-]+)*$/.test(bytes)
    && Number.isSafeInteger(capture.byteLength) && Number(capture.byteLength) === Buffer.byteLength(bytes) && capture.sha256 === hash(bytes)
    && Number.isSafeInteger(eventCount) && Number(eventCount) > 0 && bytes.split("\n").length === Number(eventCount);
}

function allRowsPass(value: unknown): boolean {
  const rows = Array.isArray(value) ? value : Object.values(record(value) ?? {});
  return rows.length > 0 && rows.every(passed);
}

function rowPassed(value: unknown, id: string): boolean {
  const rows = Array.isArray(value) ? value : Object.values(record(value) ?? {});
  return rows.some((row) => record(row)?.id === id && passed(row));
}

function exactPredecessorIdentity(value: unknown, now = Date.now()): boolean {
  const identity = record(value);
  const git = record(identity?.git);
  const npm = record(identity?.npm);
  const comparison = record(identity?.tarballComparison);
  const verifiedAt = identity?.verifiedAt;
  const verifiedTime = typeof verifiedAt === "string" ? Date.parse(verifiedAt) : Number.NaN;
  const missing = Array.isArray(comparison?.missing) ? comparison.missing : undefined;
  const mismatched = Array.isArray(comparison?.mismatched) ? comparison.mismatched : undefined;
  const gitCommit = git?.commitSha;
  const npmIntegrity = npm?.integrity;
  const npmShasum = npm?.shasum;
  const fullTarballComparison = passed(comparison)
    && comparison?.source === "npm-tarball-inspection"
    && comparison.firstPartyFileCount === PREDECESSOR_FIRST_PARTY_FILE_COUNT
    && comparison.aggregateSha256 === PREDECESSOR_AGGREGATE_SHA256
    && comparison.manifestMatch === true
    && missing?.length === 0
    && mismatched?.length === 0
    && comparison.scriptsRun === false
    && comparison.installed === false
    && comparison.scratchCleaned === true;
  return identity?.schema === "aili.compact.predecessor-identity.v1"
    && passed(identity)
    && identity.packageName === AILI_COMPACT_PREDECESSOR_PACKAGE
    && identity.version === AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION
    && identity.identityMatch === true
    && identity.sanitized === true
    && Number.isFinite(verifiedTime)
    && verifiedTime <= now + PREDECESSOR_IDENTITY_FUTURE_TOLERANCE_MS
    && now - verifiedTime <= PREDECESSOR_IDENTITY_MAX_AGE_MS
    && passed(git)
    && git?.source === "git-remote"
    && git.tag === AILI_COMPACT_EXPECTED_PREDECESSOR_TAG
    && git.ref === `refs/tags/${AILI_COMPACT_EXPECTED_PREDECESSOR_TAG}`
    && git.tagObjectSha === PREDECESSOR_TAG_OBJECT_SHA
    && gitCommit === PREDECESSOR_COMMIT_SHA
    && typeof gitCommit === "string"
    && GIT_COMMIT.test(gitCommit)
    && passed(npm)
    && npm?.source === "npm-registry"
    && npm.packageName === AILI_COMPACT_PREDECESSOR_PACKAGE
    && npm.version === AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION
    && (npm.gitHead === null || npm.gitHead === gitCommit)
    && typeof npmIntegrity === "string"
    && NPM_INTEGRITY.test(npmIntegrity)
    && npmIntegrity === PREDECESSOR_NPM_INTEGRITY
    && typeof npmShasum === "string"
    && NPM_SHASUM.test(npmShasum)
    && npmShasum === PREDECESSOR_NPM_SHASUM
    && npm.latestPublished0x === true
    && fullTarballComparison;
}

function exactVerifiedPredecessor(
  value: unknown,
  identity: JsonRecord | undefined,
  identitySha256: string | undefined,
  installedEvidence: JsonRecord | undefined,
  installedEvidenceSha256: string | undefined,
): boolean {
  const predecessor = record(value);
  const identityEvidence = record(predecessor?.identityEvidence);
  const installed = record(predecessor?.installedPackage);
  const installedBinding = record(installed?.evidence);
  const npmIntegrity = record(identity?.npm)?.integrity;
  return passed(predecessor)
    && predecessor?.packageName === AILI_COMPACT_PREDECESSOR_PACKAGE
    && predecessor.version === AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION
    && identityEvidence?.path === AILI_COMPACT_PREDECESSOR_IDENTITY
    && identityEvidence.sha256 === identitySha256
    && identity !== undefined
    && installedEvidence !== undefined
    && passed(installed)
    && installed?.source === "npm-tarball"
    && installed.packageName === AILI_COMPACT_PREDECESSOR_PACKAGE
    && installed.version === AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION
    && installed.integrity === npmIntegrity
    && installedBinding?.path === AILI_COMPACT_INSTALLED_ROLLBACK
    && installedBinding.sha256 === installedEvidenceSha256;
}

function exactInstalledRollback(
  value: unknown,
  identitySha256: string | undefined,
  now = Date.now(),
): boolean {
  const evidence = record(value);
  const identity = record(evidence?.identityEvidence);
  const installed = record(evidence?.installedPackage);
  const candidate = record(evidence?.candidatePackage);
  const execution = record(evidence?.execution);
  const verifiedAt = evidence?.verifiedAt;
  const verifiedTime = typeof verifiedAt === "string" ? Date.parse(verifiedAt) : Number.NaN;
  const expectedRows = [
    "predecessor-installed-open",
    "predecessor-legacy-replay",
    "candidate-installed-v3-append-reload",
    "predecessor-reopen-no-rewrite",
    "rollback-continued-work",
    "candidate-reopen-after-rollback",
    "jsonl-prefix-preserved",
    "no-raw-sidecar",
  ];
  const rows = Array.isArray(evidence?.matrix) ? evidence.matrix : [];
  const rowIds = rows.map((row) => record(row)?.id).sort();
  return evidence?.schema === "aili.compact.installed-rollback-evidence.v1"
    && passed(evidence)
    && evidence.sanitized === true
    && evidence.rawBodyIncluded === false
    && Number.isFinite(verifiedTime)
    && verifiedTime <= now + PREDECESSOR_IDENTITY_FUTURE_TOLERANCE_MS
    && now - verifiedTime <= PREDECESSOR_IDENTITY_MAX_AGE_MS
    && identity?.path === AILI_COMPACT_PREDECESSOR_IDENTITY
    && identity.sha256 === identitySha256
    && passed(installed)
    && installed?.source === "npm-tarball"
    && installed.packageName === AILI_COMPACT_PREDECESSOR_PACKAGE
    && installed.version === AILI_COMPACT_EXPECTED_PREDECESSOR_VERSION
    && installed.integrity === PREDECESSOR_NPM_INTEGRITY
    && passed(candidate)
    && candidate?.packageName === AILI_COMPACT_PREDECESSOR_PACKAGE
    && candidate.version === AILI_COMPACT_TARGET_VERSION
    && JSON.stringify(rowIds) === JSON.stringify([...expectedRows].sort())
    && allRowsPass(rows)
    && (evidence.v3Disposition === "accepted-by-predecessor" || evidence.v3Disposition === "safely-ignored-by-predecessor")
    && execution?.disposableHome === true
    && execution.copiedSessionOnly === true
    && execution.packageScriptsRun === false
    && execution.providerUsed === false
    && execution.liveSessionTouched === false;
}

function validateArtifact(
  id: ArtifactId,
  value: JsonRecord,
  identity: JsonRecord | undefined,
  identitySha256: string | undefined,
  installedEvidence: JsonRecord | undefined,
  installedEvidenceSha256: string | undefined,
  liveHarnessSha256: string | undefined,
  liveRuntimeBinding: AiliCompactLiveRuntimeBinding | undefined,
  artifactBodies: ReadonlyMap<ArtifactId, string>,
  sourceCaptureBody: string,
  candidateArtifactBody: string,
): boolean {
  if (!passed(value)) return false;
  if (id === "migration") {
    return value.sanitized === true
      && value.rawBodyIncluded === false
      && allRowsPass(value.matrix)
      && rowPassed(value.matrix, "externally-verified-predecessor-installed-rollback")
      && exactVerifiedPredecessor(value.predecessor, identity, identitySha256, installedEvidence, installedEvidenceSha256);
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
    return liveHarnessSha256 !== undefined && liveRuntimeBinding !== undefined
      && validateAiliCompactReviewedLiveArtifact(
        value, sourceCaptureBody, candidateArtifactBody, liveHarnessSha256, liveRuntimeBinding,
      );
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
  const scanned = Array.isArray(value.scannedArtifacts) ? value.scannedArtifacts.map(record) : [];
  const requiredArtifacts = (Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS) as Array<[ArtifactId, (typeof AILI_COMPACT_RELEASE_ARTIFACTS)[ArtifactId]]>)
    .filter(([key]) => key !== "sanitizer");
  const requiredScans = requiredArtifacts
    .map(([key, item]) => ({ path: item.path, sha256: hash(artifactBodies.get(key) ?? "") }));
  const recomputed = scanAiliReleaseEvidence(requiredArtifacts.map(([key]) => artifactBodies.get(key) ?? ""));
  return flags !== undefined
    && exactKeys(flags, AILI_RELEASE_SANITIZER_FLAGS)
    && JSON.stringify(flags) === JSON.stringify(recomputed)
    && Object.values(recomputed).every((flag) => flag === false)
    && JSON.stringify(scanned) === JSON.stringify(requiredScans)
    && Array.isArray(value.missingArtifacts)
    && value.missingArtifacts.length === 0;
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
  let liveHarnessSha256: string | undefined;
  let liveRuntimeBinding: AiliCompactLiveRuntimeBinding | undefined;
  try {
    const [computedImplementationHash, config, v3, runtime, liveHarness, piExecutable, productionEntry] = await Promise.all([
      computeAiliCompactImplementationSha256(projectRoot),
      text(projectRoot, "src/runtime/aili-compact/config.ts"),
      text(projectRoot, "src/runtime/aili-compact/v3.ts"),
      text(projectRoot, "src/runtime/aili-compact/v3-runtime.ts"),
      text(projectRoot, AILI_COMPACT_LIVE_HARNESS),
      text(projectRoot, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"),
      text(projectRoot, "extensions/index.ts"),
    ]);
    implementationHash = computedImplementationHash;
    liveHarnessSha256 = hash(liveHarness);
    liveRuntimeBinding = { piExecutableSha256: hash(piExecutable), productionEntrySha256: hash(productionEntry) };
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

  let predecessorIdentity: JsonRecord | undefined;
  let predecessorIdentitySha256: string | undefined;
  try {
    const body = await text(projectRoot, AILI_COMPACT_PREDECESSOR_IDENTITY);
    const value = record(JSON.parse(body));
    if (!value || !exactPredecessorIdentity(value)) {
      addOnce(errors, "predecessor-identity", "exact fresh Git/npm/tarball-comparison identity evidence is stale or invalid");
    } else {
      predecessorIdentity = value;
      predecessorIdentitySha256 = hash(body);
    }
  } catch {
    addOnce(errors, "predecessor-identity", "exact predecessor identity evidence is missing or invalid");
  }

  let installedRollback: JsonRecord | undefined;
  let installedRollbackSha256: string | undefined;
  try {
    const body = await text(projectRoot, AILI_COMPACT_INSTALLED_ROLLBACK);
    const value = record(JSON.parse(body));
    if (!value || !exactInstalledRollback(value, predecessorIdentitySha256)) {
      addOnce(errors, "installed-rollback", "exact fresh installed predecessor/candidate rollback evidence is stale or invalid");
    } else {
      installedRollback = value;
      installedRollbackSha256 = hash(body);
    }
  } catch {
    addOnce(errors, "installed-rollback", "exact installed predecessor/candidate rollback evidence is missing or invalid");
  }

  let index: JsonRecord | undefined;
  try {
    index = await json(projectRoot, AILI_COMPACT_RELEASE_INDEX);
    const expectedIndexIds = Object.keys(AILI_COMPACT_RELEASE_ARTIFACTS);
    if (index.schema !== "aili.compact.release-evidence.v1" || !passed(index) || index.candidateReady !== true
      || index.packageVersion !== AILI_COMPACT_TARGET_VERSION || index.piVersion !== AILI_COMPACT_PI_VERSION
      || index.implementationSha256 !== implementationHash || !record(index.artifacts)
      || !exactKeys(record(index.artifacts)!, expectedIndexIds)
      || !Array.isArray(index.missingArtifacts) || index.missingArtifacts.length !== 0) {
      addOnce(errors, "index", "release index schema, target versions, status, or implementation hash is stale");
    }
  } catch {
    addOnce(errors, "index", "release evidence index is missing or invalid");
  }

  const artifactBodies = new Map<ArtifactId, string>();
  const [sourceCaptureBody, candidateArtifactBody] = await Promise.all([
    text(projectRoot, AILI_COMPACT_LIVE_CAPTURE_PATH).catch(() => ""),
    text(projectRoot, COMPACT_HUMAN_REVIEW_CANDIDATE_PATH).catch(() => ""),
  ]);
  await Promise.all((Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS) as Array<[ArtifactId, (typeof AILI_COMPACT_RELEASE_ARTIFACTS)[ArtifactId]]>).map(async ([id, expected]) => {
    try { artifactBodies.set(id, await text(projectRoot, expected.path)); } catch { /* reported in the validation loop */ }
  }));
  for (const [id, expected] of Object.entries(AILI_COMPACT_RELEASE_ARTIFACTS) as Array<[ArtifactId, (typeof AILI_COMPACT_RELEASE_ARTIFACTS)[ArtifactId]]>) {
    try {
      const body = artifactBodies.get(id);
      if (body === undefined) throw new Error("missing artifact");
      const value = record(JSON.parse(body));
      const reference = record(record(index?.artifacts)?.[id]);
      if (!value || value.schema !== expected.schema || value.packageVersion !== AILI_COMPACT_TARGET_VERSION
        || value.piVersion !== AILI_COMPACT_PI_VERSION || value.implementationSha256 !== implementationHash
        || reference?.path !== expected.path || reference.sha256 !== hash(body)
         || !validateArtifact(id, value, predecessorIdentity, predecessorIdentitySha256, installedRollback, installedRollbackSha256, liveHarnessSha256, liveRuntimeBinding, artifactBodies, sourceCaptureBody, candidateArtifactBody)) {
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
