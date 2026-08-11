import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  AILI_COMPACT_LIVE_CAPTURE_PATH,
  AILI_COMPACT_LIVE_HARNESS,
  AILI_COMPACT_REVIEWED_LIVE_PATH,
  AILI_COMPACT_REVIEWED_LIVE_SCHEMA,
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
  verdictPath: string,
  root = resolve(import.meta.dirname, ".."),
): Promise<JsonRecord> {
  const projectRoot = resolve(root);
  const sourceCapturePath = join(projectRoot, AILI_COMPACT_LIVE_CAPTURE_PATH);
  const outputPath = join(projectRoot, AILI_COMPACT_REVIEWED_LIVE_PATH);
  const [verdictBody, sourceCaptureBody, harnessBody, piBody, productionEntryBody, currentBinding] = await Promise.all([
    readFile(resolve(verdictPath), "utf8"),
    readFile(sourceCapturePath, "utf8"),
    readFile(join(projectRoot, AILI_COMPACT_LIVE_HARNESS), "utf8"),
    readFile(join(projectRoot, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"), "utf8"),
    readFile(join(projectRoot, "extensions/index.ts"), "utf8"),
    readAiliCompactCandidateBinding(projectRoot),
  ]);
  assertAiliReleaseEvidenceSanitized([verdictBody, sourceCaptureBody]);
  const verdict = record(JSON.parse(verdictBody) as unknown);
  const sourceCapture = record(JSON.parse(sourceCaptureBody) as unknown);
  if (!verdict || !sourceCapture || sourceCapture.packageVersion !== currentBinding.packageVersion
    || sourceCapture.piVersion !== currentBinding.piVersion || sourceCapture.implementationSha256 !== currentBinding.implementationSha256) {
    throw new Error("representative live capture is stale or does not match the current candidate");
  }
  const sourceCaptureSha256 = createHash("sha256").update(sourceCaptureBody).digest("hex");
  const runtimeBinding = {
    piExecutableSha256: createHash("sha256").update(piBody).digest("hex"),
    productionEntrySha256: createHash("sha256").update(productionEntryBody).digest("hex"),
  };
  const harnessSha256 = createHash("sha256").update(harnessBody).digest("hex");
  if (!validateAiliCompactLiveArtifact(sourceCapture, harnessSha256, runtimeBinding)) {
    throw new Error("representative live capture is missing, invalid, or not a current provider-boundary PASS");
  }
  const output: JsonRecord = {
    schema: AILI_COMPACT_REVIEWED_LIVE_SCHEMA,
    status: "PASS",
    packageVersion: currentBinding.packageVersion,
    piVersion: currentBinding.piVersion,
    implementationSha256: currentBinding.implementationSha256,
    reviewedAt: verdict?.reviewedAt,
    sanitized: true,
    sourceCapture: { path: AILI_COMPACT_LIVE_CAPTURE_PATH, sha256: sourceCaptureSha256 },
    humanVerdict: verdict,
  };
  if (!validateAiliCompactReviewedLiveArtifact(output, sourceCaptureBody, harnessSha256, runtimeBinding)) {
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
  const [verdictPath] = process.argv.slice(2);
  if (!verdictPath) {
    throw new Error("usage: apply-aili-compact-human-review-verdict <human-verdict>");
  }
  const output = await applyAiliCompactHumanReviewVerdict(verdictPath);
  console.log(`AILI Compact reviewed live evidence: ${String(output.status)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
