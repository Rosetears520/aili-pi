import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type LockedSource = {
  id: string;
  package: string;
  version: string;
  gitRevision: string;
  license: "MIT";
  copyright: string;
  importPath: string;
  sourceManifestVersion?: string;
  importedFileCount: number;
  importedTreeSha256: string;
};

type SourceLocks = {
  schemaVersion: 1;
  policy: {
    webCodeBase: "pi-web-only";
    aicssSourceCopied: false;
  };
  sources: LockedSource[];
};

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOCK_PATH = resolve(ROOT, "upstream/web-source-locks.json");
const EXPECTED: Readonly<Record<string, Omit<LockedSource, "copyright" | "importedFileCount" | "importedTreeSha256">>> = {
  "pi-web": {
    id: "pi-web",
    package: "@agegr/pi-web",
    version: "0.8.8",
    gitRevision: "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903",
    license: "MIT",
    importPath: "upstream/pi-web-0.8.8",
    sourceManifestVersion: "0.8.8-beta.2",
  },
  "pi-analytics": {
    id: "pi-analytics",
    package: "@narumitw/pi-analytics",
    version: "0.49.6",
    gitRevision: "1156ee787d7bbf04a2a67f25ace61ef50355cb8d",
    license: "MIT",
    importPath: "upstream/pi-extensions/pi-analytics-0.49.6",
  },
  "pi-btw": {
    id: "pi-btw",
    package: "@narumitw/pi-btw",
    version: "0.50.0",
    gitRevision: "e7d9112f4f3418216a14343c00f6f637e7a3d390",
    license: "MIT",
    importPath: "upstream/pi-extensions/pi-btw-0.50.0",
  },
  "pi-stamp": {
    id: "pi-stamp",
    package: "@narumitw/pi-stamp",
    version: "0.49.3",
    gitRevision: "4c2c2e8c4b6c3d21659110ea1966810b1d15e045",
    license: "MIT",
    importPath: "upstream/pi-extensions/pi-stamp-0.49.3",
  },
  "pi-worktree": {
    id: "pi-worktree",
    package: "@narumitw/pi-worktree",
    version: "0.50.0",
    gitRevision: "492cc9cef225f20b98b70158156229b1f44a8778",
    license: "MIT",
    importPath: "upstream/pi-extensions/pi-worktree-0.50.0",
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function importedTree(root: string): Promise<{ fileCount: number; sha256: string }> {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        assert(!new Set([".git", ".next", "node_modules", ".cache"]).has(entry.name), `${path}: excluded directory imported`);
        await walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  await walk(root);
  files.sort((left, right) => left.slice(root.length + 1).localeCompare(right.slice(root.length + 1)));
  const aggregate = createHash("sha256");
  for (const file of files) {
    const relativePath = file.slice(root.length + 1).replaceAll("\\", "/");
    aggregate.update(`${relativePath}\0${await sha256(file)}\n`);
  }
  return { fileCount: files.length, sha256: aggregate.digest("hex") };
}

export async function validateWebSourceLocks(): Promise<void> {
  const locks = JSON.parse(await readFile(LOCK_PATH, "utf8")) as SourceLocks;
  assert(locks.schemaVersion === 1, "web source lock schemaVersion must be 1");
  assert(locks.policy.webCodeBase === "pi-web-only", "Pi Web must remain the sole Web code/function base");
  assert(locks.policy.aicssSourceCopied === false, "AIcss source copying is not authorized");
  assert(locks.sources.length === Object.keys(EXPECTED).length, "web source lock inventory must contain exactly five sources");

  for (const source of locks.sources) {
    const expected = EXPECTED[source.id];
    assert(expected, `${source.id}: unexpected source lock`);
    for (const [key, value] of Object.entries(expected)) {
      assert(source[key as keyof LockedSource] === value, `${source.id}.${key}: exact identity mismatch`);
    }
    assert(source.copyright.length > 0, `${source.id}: copyright missing`);
    const importRoot = resolve(ROOT, source.importPath);
    assert((await stat(importRoot)).isDirectory(), `${source.id}: import directory missing`);
    const manifest = JSON.parse(await readFile(resolve(importRoot, "package.json"), "utf8")) as { name?: string; version?: string; license?: string };
    assert(manifest.name === source.package, `${source.id}: imported package name mismatch`);
    assert(manifest.version === (source.sourceManifestVersion ?? source.version), `${source.id}: imported package version mismatch`);
    assert(manifest.license === "MIT", `${source.id}: imported package license mismatch`);
    const license = await readFile(resolve(importRoot, "LICENSE"), "utf8");
    assert(license.startsWith("MIT License\n"), `${source.id}: MIT text missing`);
    assert(license.includes(source.copyright), `${source.id}: copyright text mismatch`);
    const tree = await importedTree(importRoot);
    assert(tree.fileCount === source.importedFileCount, `${source.id}: imported file count mismatch`);
    assert(tree.sha256 === source.importedTreeSha256, `${source.id}: imported tree hash mismatch`);
  }

  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  for (const source of locks.sources) {
    assert(!(source.package in (packageJson.dependencies ?? {})), `${source.package}: absorbed source must not become a runtime dependency`);
  }

  const inventory = await readFile(resolve(ROOT, "docs/upstream-web-behavior-inventory.md"), "utf8");
  for (const heading of ["Pi Web 0.8.8", "pi-analytics 0.49.6", "pi-stamp 0.49.3", "pi-btw 0.50.0", "pi-worktree 0.50.0", "AIcss"]) {
    assert(inventory.includes(heading), `${heading}: behavior inventory section missing`);
  }
  assert(inventory.includes("force removal"), "unsafe force Worktree removal disposition missing");
  assert(inventory.includes("复制 **零 AIcss 源码**"), "AIcss no-copy fallback missing");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateWebSourceLocks()
    .then(async () => {
      const digest = await sha256(LOCK_PATH);
      console.log(`Web source locks valid (${digest})`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
