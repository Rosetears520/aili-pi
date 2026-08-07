import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  applyCompactHumanReviewVerdict,
  COMPACT_HUMAN_REVIEW_CANDIDATE_PATH,
  validateCompactHumanReviewCandidate,
  type CompactHumanReviewCandidateInput,
} from "./live-release-support.ts";
import {
  AILI_COMPACT_LIVE_CAPTURE_PATH,
  AILI_COMPACT_LIVE_HARNESS,
  AILI_COMPACT_REVIEWED_LIVE_PATH,
  assertAiliReleaseEvidenceSanitized,
  readAiliCompactCandidateBinding,
  validateAiliCompactLiveArtifact,
  validateAiliCompactReviewedLiveArtifact,
} from "./aili-compact-release-evidence.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

/** Validate and bind a separately authored human verdict without approving it automatically. */
export async function applyAiliCompactHumanReviewVerdict(
  candidateArtifactPath: string,
  providerFamily: string,
  verdictPath: string,
  root = resolve(import.meta.dirname, ".."),
): Promise<JsonRecord> {
  const projectRoot = resolve(root);
  const expectedCandidatePath = join(projectRoot, COMPACT_HUMAN_REVIEW_CANDIDATE_PATH);
  if (resolve(candidateArtifactPath) !== expectedCandidatePath) {
    throw new Error(`human-review candidate must use canonical path ${COMPACT_HUMAN_REVIEW_CANDIDATE_PATH}`);
  }
  const sourceCapturePath = join(projectRoot, AILI_COMPACT_LIVE_CAPTURE_PATH);
  const outputPath = join(projectRoot, AILI_COMPACT_REVIEWED_LIVE_PATH);
  const [candidateBody, verdictBody, sourceCaptureBody, harnessBody, piBody, productionEntryBody, currentBinding] = await Promise.all([
    readFile(expectedCandidatePath, "utf8"),
    readFile(resolve(verdictPath), "utf8"),
    readFile(sourceCapturePath, "utf8"),
    readFile(join(projectRoot, AILI_COMPACT_LIVE_HARNESS), "utf8"),
    readFile(join(projectRoot, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"), "utf8"),
    readFile(join(projectRoot, "extensions/index.ts"), "utf8"),
    readAiliCompactCandidateBinding(projectRoot),
  ]);
  assertAiliReleaseEvidenceSanitized([candidateBody, verdictBody, sourceCaptureBody]);
  const candidateArtifact = record(JSON.parse(candidateBody) as unknown);
  const verdict = record(JSON.parse(verdictBody) as unknown);
  const sourceCapture = record(JSON.parse(sourceCaptureBody) as unknown);
  if (candidateArtifact?.schema !== "aili.compact.human-review-candidates.v1"
    || candidateArtifact.status !== "PENDING" || candidateArtifact.reviewState !== "human-verdict-required") {
    throw new Error("human-review candidate artifact is not pending or has the wrong schema");
  }
  const candidates = record(candidateArtifact?.candidates);
  const candidate = record(candidates?.[providerFamily]);
  const binding = record(candidate?.binding) as CompactHumanReviewCandidateInput["binding"] | undefined;
  if (!candidate || !binding || !validateCompactHumanReviewCandidate(candidate, binding)) {
    throw new Error("human-review candidate is missing, incomplete, or not exactly bound");
  }
  const event = applyCompactHumanReviewVerdict(candidate, verdict, binding);
  if (event.verdict !== "PASS") throw new Error("human-review verdict is missing, NON_PASS, or not exactly bound");
  if (!sourceCapture || sourceCapture.packageVersion !== currentBinding.packageVersion
    || sourceCapture.piVersion !== currentBinding.piVersion || sourceCapture.implementationSha256 !== currentBinding.implementationSha256) {
    throw new Error("representative live capture is stale or does not match the current candidate");
  }
  const representative = record(sourceCapture.representative);
  const pendingSemanticReview = record(representative?.semanticReview);
  if (!representative || !pendingSemanticReview) throw new Error("representative live capture has no pending semantic review");
  const liveCaptureReference = record(candidateArtifact.liveCapture);
  const sourceCaptureSha256 = createHash("sha256").update(sourceCaptureBody).digest("hex");
  if (liveCaptureReference?.path !== AILI_COMPACT_LIVE_CAPTURE_PATH || liveCaptureReference.sha256 !== sourceCaptureSha256) {
    throw new Error("human-review candidate does not bind the exact representative live capture");
  }
  const composedLive = structuredClone(sourceCapture);
  const composedRepresentative = record(composedLive.representative)!;
  composedRepresentative.semanticReview = {
    ...pendingSemanticReview,
    status: "PASS",
    humanReview: {
      verdict: "PASS",
      verdictId: event.verdictId,
      verdictSource: "external-human-verdict-artifact",
      candidateSha256: event.candidateSha256,
      verdictSha256: event.verdictSha256,
      hardFactsRetained: true,
      limitationsAccepted: true,
    },
  };
  composedLive.status = "PASS";
  composedRepresentative.status = "PASS";
  const runtimeBinding = {
    piExecutableSha256: createHash("sha256").update(piBody).digest("hex"),
    productionEntrySha256: createHash("sha256").update(productionEntryBody).digest("hex"),
  };
  const harnessSha256 = createHash("sha256").update(harnessBody).digest("hex");
  const fullPass = validateAiliCompactLiveArtifact(composedLive, harnessSha256, runtimeBinding);
  if (!fullPass) {
    composedLive.status = "NON_PASS";
    composedRepresentative.status = "NON_PASS";
  }
  const normalizedVerdict = { ...verdict };
  const normalizedVerdictSha256 = createHash("sha256").update(JSON.stringify(normalizedVerdict)).digest("hex");
  const output: JsonRecord = {
    schema: "aili.compact.reviewed-live-evidence.v1",
    status: fullPass ? "PASS" : "NON_PASS",
    packageVersion: currentBinding.packageVersion,
    piVersion: currentBinding.piVersion,
    implementationSha256: currentBinding.implementationSha256,
    reviewedAt: verdict?.reviewedAt,
    sanitized: true,
    composition: {
      sourceCapture: { path: AILI_COMPACT_LIVE_CAPTURE_PATH, sha256: sourceCaptureSha256 },
      candidateArtifact: {
        path: COMPACT_HUMAN_REVIEW_CANDIDATE_PATH,
        sha256: createHash("sha256").update(candidateBody).digest("hex"),
        candidateId: candidate.candidateId,
        candidateSha256: candidate.candidateSha256,
      },
      humanVerdict: { ...normalizedVerdict, sha256: normalizedVerdictSha256 },
    },
    liveEvidence: composedLive,
  };
  if (!validateAiliCompactReviewedLiveArtifact(output, sourceCaptureBody, candidateBody, harnessSha256, runtimeBinding)) {
    throw new Error("reviewed live evidence composition is stale, mismatched, forged, or incomplete");
  }
  const target = resolve(outputPath);
  const temporary = `${target}.tmp-${process.pid}`;
  if (dirname(target) === target) throw new Error("invalid output path");
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return output;
}

async function main(): Promise<void> {
  const [candidateArtifactPath, providerFamily, verdictPath] = process.argv.slice(2);
  if (!candidateArtifactPath || !providerFamily || !verdictPath) {
    throw new Error("usage: apply-aili-compact-human-review-verdict <canonical-candidate-artifact> <provider-family> <human-verdict>");
  }
  const output = await applyAiliCompactHumanReviewVerdict(candidateArtifactPath, providerFamily, verdictPath);
  console.log(`AILI Compact reviewed live evidence: ${String(output.status)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
