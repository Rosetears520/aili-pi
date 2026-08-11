import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateLiveVerificationAtRoot } from "../src/runtime/registry.ts";
import { validateAiliCompactReleaseEvidence } from "./aili-compact-release-evidence.ts";

const DEFAULT_ROOT = resolve(import.meta.dirname, "..");

export async function validateLiveReleaseGate(root = DEFAULT_ROOT): Promise<string[]> {
  return [
    ...await validateLiveVerificationAtRoot(root),
    ...await validateAiliCompactReleaseEvidence(root),
  ];
}

async function main(): Promise<void> {
  const errors = await validateLiveReleaseGate();
  if (errors.length > 0) {
    console.error(`live release validation failed (${errors.length})`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("live release validation passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
