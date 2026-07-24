import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePermissionModesPackageRoot } from "../src/runtime/package-resolution.ts";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_ROOT = fileURLToPath(resolvePermissionModesPackageRoot());
const VERIFY = process.argv.includes("--verify");
const VERSION = "2.2.0";
const REVISION = "23d65d10a53b67043cae42322acf9044d6edb196";

const EXPECTED_UPSTREAM_HASHES: Record<string, string> = {
  "src/index.ts": "fd4462a3b7ba986af734c2e17ba8ea7178df56c933e87ed444ba90ba24c2fd5b",
  "src/resolve.ts": "13f52a4a9c08d7a55f5f9d03f97302d864768838fb3e9fca2051cb7d94a0ae82",
  LICENSE: "d87cb99b43f6bf8771e57be83485db11b977b9dfa21b6bd201b8d3d370bdce43",
};

const ADAPTATION_HEADER = [
  "/**",
  " * Generated AILI adaptation of pi-permission-modes@2.2.0.",
  " * Source revision: 23d65d10a53b67043cae42322acf9044d6edb196.",
  " * Regenerate with scripts/sync-permission-modes.ts; do not edit manually.",
  " */",
  "",
].join("\n");

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

function replaceExactlyOnce(source: string, before: string, after: string, label: string): string {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`expected exactly one ${label} in pi-permission-modes@${VERSION}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function adaptIndex(source: string): string {
  let redirected = 0;
  const body = source.replace(/from "\.\/([^"]+)";/g, (full, specifier: string) => {
    if (specifier === "resolve.ts") return full;
    redirected += 1;
    return `from "pi-permission-modes/src/${specifier}";`;
  });
  if (redirected !== 12) {
    throw new Error(`expected 12 redirected sibling imports in pi-permission-modes@${VERSION}, found ${redirected}`);
  }
  const documented = replaceExactlyOnce(
    body,
    "The logic lives in sibling\n * modules:",
    "The adapted matcher lives locally; unchanged logic stays in pinned dependency\n * modules:",
    "entry module ownership comment",
  );
  return ADAPTATION_HEADER + documented;
}

function adaptResolve(source: string): string {
  const withSchemaRedirect = replaceExactlyOnce(
    source,
    'from "./schema.ts";',
    'from "pi-permission-modes/src/schema.ts";',
    "schema import",
  );
  const withDotAll = replaceExactlyOnce(
    withSchemaRedirect,
    "return new RegExp(re).test(t);",
    'return new RegExp(re, "s").test(t);',
    "glob RegExp compilation",
  );
  return ADAPTATION_HEADER + withDotAll;
}

async function expectedOutputs(): Promise<Record<string, string>> {
  const packageJsonText = await readFile(resolve(SOURCE_ROOT, "package.json"), "utf8");
  const packageJson = JSON.parse(packageJsonText) as { name?: string; version?: string; license?: string };
  if (packageJson.name !== "pi-permission-modes" || packageJson.version !== VERSION || packageJson.license !== "MIT") {
    throw new Error(`expected pi-permission-modes@${VERSION} MIT baseline`);
  }

  const upstream = Object.fromEntries(await Promise.all(
    Object.keys(EXPECTED_UPSTREAM_HASHES).map(async (path) => [path, await readFile(resolve(SOURCE_ROOT, path), "utf8")]),
  )) as Record<string, string>;
  for (const [path, expected] of Object.entries(EXPECTED_UPSTREAM_HASHES)) {
    const actual = sha256(upstream[path]!);
    if (actual !== expected) throw new Error(`unexpected upstream drift for ${path}: ${actual}`);
  }

  const index = adaptIndex(upstream["src/index.ts"]!);
  const matcher = adaptResolve(upstream["src/resolve.ts"]!);
  const license = upstream.LICENSE!;
  const adaptedFiles = {
    "src/vendor/pi-permission-modes/index.ts": index,
    "src/vendor/pi-permission-modes/resolve.ts": matcher,
    "licenses/pi-permission-modes-MIT.txt": license,
  };
  const lock = {
    schemaVersion: 1,
    package: {
      name: "pi-permission-modes",
      version: VERSION,
      revision: REVISION,
      license: "MIT",
    },
    upstreamFiles: Object.entries(EXPECTED_UPSTREAM_HASHES).map(([path, hash]) => ({ path, sha256: hash })),
    adaptedFiles: Object.entries(adaptedFiles).map(([path, content]) => ({ path, sha256: sha256(content) })),
    localChanges: [
      "Package-owned adapted entry redirects all unchanged sibling modules to the exact pi-permission-modes dependency while owning resolve.ts locally.",
      "matchPattern compiles its anchored glob RegExp with dotAll so * and ? include ECMAScript line terminators.",
    ],
    generatedBy: "scripts/sync-permission-modes.ts",
    verification: ["npm run verify:permission-modes", "tests/unit/permission-patterns.test.ts", "tests/integration/permission-modes.test.ts"],
  };

  return {
    ...adaptedFiles,
    "upstream/pi-permission-modes.lock.json": `${JSON.stringify(lock, null, 2)}\n`,
  };
}

async function main(): Promise<void> {
  const outputs = await expectedOutputs();
  for (const [path, expected] of Object.entries(outputs)) {
    const absolute = resolve(ROOT, path);
    if (VERIFY) {
      const actual = await readFile(absolute, "utf8").catch(() => "");
      if (actual !== expected) throw new Error(`permission-mode adaptation drifted: ${path}`);
    } else {
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, expected, "utf8");
    }
  }
  console.log(`${VERIFY ? "PASS" : "SYNCED"}: pi-permission-modes@${VERSION} adapted matcher (${Object.keys(outputs).length} artifacts)`);
}

await main();
