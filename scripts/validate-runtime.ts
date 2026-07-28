import { validateRegistry, validateStableRelease } from "../src/runtime/registry.ts";
import { validateAiliCompactReleaseEvidence } from "./aili-compact-release-evidence.ts";

const release = process.argv.includes("--release");
const errors = release
  ? [...await validateStableRelease(), ...await validateAiliCompactReleaseEvidence()]
  : await validateRegistry();
if (errors.length > 0) {
  console.error(`${release ? "stable release" : "registry"} validation failed (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`${release ? "stable release" : "registry"} validation passed`);
}
