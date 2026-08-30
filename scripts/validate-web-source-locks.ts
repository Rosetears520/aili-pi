import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type SourceStatus = "active" | "historical";
type LockedSource = {
  id: string;
  status?: SourceStatus;
  package: string;
  version: string;
  npmTarballSha256?: string;
  npmIntegrity?: string;
  npmGitHead?: string;
  gitRevision: string;
  gitSourceArchiveSha256?: string;
  license: "MIT";
  copyright: string;
  importPath: string;
  sourceManifestVersion?: string;
  importedFileCount: number;
  importedTreeSha256: string;
  excludedSourceFiles?: string[];
  adaptationBoundary?: string;
  identityNote?: string;
};

type SourceLocks = {
  schemaVersion: 2;
  policy: { webCodeBase: "pi-web-only"; aicssSourceCopied: boolean };
  piPackageBaseline: {
    version: "0.84.4";
    sharedRevision: string;
    license: "MIT";
    notice: string;
    packages: Record<string, string>;
  };
  sources: LockedSource[];
};

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOCK_PATH = resolve(ROOT, "upstream/web-source-locks.json");
const PI_REVISION = "b79e4cc834970cca69daebffab7df1da7d1e52c4";
const PI_INTEGRITIES: Readonly<Record<string, string>> = {
  "@earendil-works/pi-agent-core": "sha512-HyUnjaOXj6oN/6SNcr8A1J/ElRQA50FtIE0XUTSKAQVqmdlb9qdojOyUQwF/jULE5+yOEtGuVgi/N1RnBiNG+g==",
  "@earendil-works/pi-ai": "sha512-AClAZxf5+c4RRu44NJPS6wyQy+Nmq+Mzyyrdvm4ZVMNuixelO02RZX4G4Aq1F145Yzp43wnM5S+hLlSI7ypfVw==",
  "@earendil-works/pi-coding-agent": "sha512-jmOlrqUmvhh/siNWFRXjYLJzhKFIHNsAQaysRwzQPQFnPAaV/vhqHsLH/MBsIISA1Rjj7WTUFR3nJrpXoLx39w==",
  "@earendil-works/pi-tui": "sha512-nPUnwDkLtupPXnZQYrCwPFcuTydCDqTY6ZbFqhsL4S4kVq0AT418kPa/6uXwtaCD+MjBNBltb7ScTYX65yeE1w==",
  "@earendil-works/pi-client": "sha512-q398WY/3ZQHTizk7IKxApzqFV0xt4yM9LkSkwyqeLK5Bj5RwRjOWxESt26z4LgNp4O+8hqhqFPf/8fj4H5rE4A==",
  "@earendil-works/pi-protocol": "sha512-acyE9ozxkMiWiz/xyWpU0O9vwnYv0hyG889Vniv6Sg9c9zfsX+8MePnDNphBacY2Fvm1rxdsGmiVDSZl9yuDFA==",
  "@earendil-works/pi-telemetry": "sha512-8e2CuxM+ht+hedQXTZmi5JVl6/xDK9RpSDL2+MbITevKYQhMZ/z6lJOTFgox3HQyGxO8mOZEtYGVeQNaD4OzqA==",
};
const PI_WEB_EXPECTED = {
  "0.8.9": {
    id: "pi-web-0.8.9", status: "historical", gitRevision: "febcba5e33e5eef9bf7f092099105c5dfea742ff",
    importPath: "upstream/pi-web-0.8.9", sourceManifestVersion: "0.8.8",
    npmIntegrity: "sha512-jmsABuL2aJE9yxPok7u97GLj72PjVeJbjHBjx67eXB5lnNJrPLTj6F6Jy7yl3F0vH0K5R0YyZxPZHDCMI770VA==",
    npmTarballSha256: "323838460754b5ea9d56303b6018e7b82ae732d7aca76d9c860a8bd68e74f3ec",
    gitSourceArchiveSha256: "2f04f9f273aaedfcc5dc78a5652fa033d2d929b0440cd480d6713f9479747377",
  },
  "0.8.11": {
    id: "pi-web-0.8.11", status: "active", gitRevision: "28bab3c25f5f6770c9b0b745ebbfec1c27f7b948",
    npmGitHead: "024be0b1154ba8a2650237a2db8bfa89124e167e", importPath: "upstream/pi-web-0.8.11", sourceManifestVersion: "0.8.11",
    npmIntegrity: "sha512-AUnw18qoSA5kvy5hz+Z+PIFqVrvnjM0FFnZjuE6n7TbvDhqIloeM4BbWpD0DUz9jenJYfgSZQxiRKjQxYY3yKg==",
    npmTarballSha256: "69baa3d4dc9328924a8ae03d431ff3ea5e0a707e1c9aeb4708cf31dbb07cb834",
    gitSourceArchiveSha256: "329ac758a3bd70916988f507f71938a9dc28e44bbcb772b5ef34c06dc1bc36a6",
  },
} as const;
const OTHER_EXPECTED: Readonly<Record<string, { package: string; version: string; gitRevision: string; importPath: string }>> = {
  "pi-analytics": { package: "@narumitw/pi-analytics", version: "0.49.6", gitRevision: "1156ee787d7bbf04a2a67f25ace61ef50355cb8d", importPath: "upstream/pi-extensions/pi-analytics-0.49.6" },
  "pi-btw": { package: "@narumitw/pi-btw", version: "0.50.0", gitRevision: "e7d9112f4f3418216a14343c00f6f637e7a3d390", importPath: "upstream/pi-extensions/pi-btw-0.50.0" },
  "pi-stamp": { package: "@narumitw/pi-stamp", version: "0.49.3", gitRevision: "4c2c2e8c4b6c3d21659110ea1966810b1d15e045", importPath: "upstream/pi-extensions/pi-stamp-0.49.3" },
  "pi-worktree": { package: "@narumitw/pi-worktree", version: "0.50.0", gitRevision: "492cc9cef225f20b98b70158156229b1f44a8778", importPath: "upstream/pi-extensions/pi-worktree-0.50.0" },
};

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function sha256(path: string): Promise<string> { return createHash("sha256").update(await readFile(path)).digest("hex"); }

export async function importedTree(root: string): Promise<{ fileCount: number; sha256: string }> {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      assert(!entry.isSymbolicLink(), `${path}: symbolic link imported`);
      if (entry.isDirectory()) {
        assert(!new Set([".git", ".next", "node_modules", ".cache"]).has(entry.name), `${path}: excluded directory imported`);
        await walk(path);
      } else if (entry.isFile()) files.push(path);
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

export function validateActiveHistoricalSchema(locks: SourceLocks): void {
  assert(locks.schemaVersion === 2, "web source lock schemaVersion must be 2");
  const web = locks.sources.filter((source) => source.package === "@agegr/pi-web");
  assert(web.length === 2, "Pi Web lock inventory must contain exactly 0.8.9 and 0.8.11");
  assert(web.filter((source) => source.status === "active").length === 1, "Pi Web must have exactly one active record");
  assert(web.filter((source) => source.status === "historical").length === 1, "Pi Web must have exactly one historical record");
  assert(web.find((source) => source.status === "active")?.version === "0.8.11", "Pi Web 0.8.11 must be active");
  assert(web.find((source) => source.status === "historical")?.version === "0.8.9", "Pi Web 0.8.9 must be historical");
}

export async function validateWebSourceLocks(): Promise<void> {
  const locks = JSON.parse(await readFile(LOCK_PATH, "utf8")) as SourceLocks;
  validateActiveHistoricalSchema(locks);
  assert(locks.policy.webCodeBase === "pi-web-only", "Pi Web must remain the sole Web code/function base");
  assert(locks.policy.aicssSourceCopied === true, "AIcss vendored-component policy must stay recorded");
  assert(locks.piPackageBaseline.version === "0.84.4", "official Pi evidence must target 0.84.4");
  assert(locks.piPackageBaseline.sharedRevision === PI_REVISION, "official Pi shared revision mismatch");
  assert(locks.piPackageBaseline.license === "MIT" && locks.piPackageBaseline.notice.includes("package-specific"), "official Pi MIT/package distinction missing");
  assert(JSON.stringify(locks.piPackageBaseline.packages) === JSON.stringify(PI_INTEGRITIES), "official Pi package integrity inventory mismatch");

  const aicssDir = resolve(ROOT, "src/web/components/aicss");
  assert((await readFile(resolve(aicssDir, "README.md"), "utf8")).includes("https://www.aicss.dev/"), "AIcss provenance README missing");
  const aicssFiles = new Set(await readdir(aicssDir));
  for (const name of ["ApprovalCard", "Orb", "TodoList", "StreamingText"]) assert(aicssFiles.has(`${name}.tsx`) && aicssFiles.has(`${name}.module.css`), `AIcss free component missing: ${name}`);
  for (const name of ["InlineCitations", "ImageGeneration", "ComparisonTable", "FileDiff"]) assert(!aicssFiles.has(`${name}.tsx`), `AIcss locked component must not be vendored: ${name}`);

  assert(locks.sources.length === 6, "web source lock inventory must contain exactly six sources");
  for (const source of locks.sources) {
    if (source.package === "@agegr/pi-web") {
      const expected = PI_WEB_EXPECTED[source.version as keyof typeof PI_WEB_EXPECTED];
      assert(expected, `${source.version}: unexpected Pi Web version`);
      for (const [key, value] of Object.entries(expected)) assert(source[key as keyof LockedSource] === value, `${source.id}.${key}: exact identity mismatch`);
      const identityNote = source.identityNote?.toLowerCase() ?? "";
      assert(identityNote.includes("npm") && (identityNote.includes("git") || identityNote.includes("repository")), `${source.id}: npm/Git distinction missing`);
      assert(source.adaptationBoundary && source.adaptationBoundary.length > 80, `${source.id}: adaptation boundary missing`);
      assert(JSON.stringify(source.excludedSourceFiles) === JSON.stringify([".git/**", ".gitignore", "AGENTS.md", "CONTEXT.md", "bun.lock", "node_modules/**", ".next/**"]), `${source.id}: deterministic exclusions mismatch`);
    } else {
      const expected = OTHER_EXPECTED[source.id];
      assert(expected, `${source.id}: unexpected source lock`);
      for (const [key, value] of Object.entries(expected)) assert(source[key as keyof LockedSource] === value, `${source.id}.${key}: exact identity mismatch`);
    }
    assert(source.license === "MIT" && source.copyright.length > 0, `${source.id}: MIT notice missing`);
    assert(Number.isInteger(source.importedFileCount) && source.importedFileCount > 0, `${source.id}: imported file count missing`);
    assert(/^[a-f0-9]{64}$/.test(source.importedTreeSha256), `${source.id}: imported tree hash missing`);
    const importRoot = resolve(ROOT, source.importPath);
    assert((await stat(importRoot)).isDirectory(), `${source.id}: import directory missing`);
    const manifest = JSON.parse(await readFile(resolve(importRoot, "package.json"), "utf8")) as { name?: string; version?: string; license?: string };
    assert(manifest.name === source.package, `${source.id}: imported package name mismatch`);
    assert(manifest.version === (source.sourceManifestVersion ?? source.version), `${source.id}: imported package version mismatch`);
    assert(manifest.license === "MIT", `${source.id}: imported package license mismatch`);
    const license = await readFile(resolve(importRoot, "LICENSE"), "utf8");
    assert(license.startsWith("MIT License\n") && license.includes(source.copyright), `${source.id}: imported MIT text mismatch`);
    const tree = await importedTree(importRoot);
    assert(tree.fileCount === source.importedFileCount, `${source.id}: imported file count mismatch`);
    assert(tree.sha256 === source.importedTreeSha256, `${source.id}: imported tree hash mismatch`);
  }

  const packageJson = JSON.parse(await readFile(resolve(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string>; files?: string[] };
  for (const source of locks.sources) assert(!(source.package in (packageJson.dependencies ?? {})), `${source.package}: absorbed source must not become a runtime dependency`);
  for (const version of ["0.8.9", "0.8.11"]) assert(packageJson.files?.includes(`!upstream/pi-web-${version}/`), `Pi Web ${version} snapshot must be excluded from npm pack`);

  const inventory = await readFile(resolve(ROOT, "docs/pi-web-0.8.11-disposition-inventory.md"), "utf8");
  for (const term of ["already-present", "scoped-port", "Gateway-adapt", "deferred", "excluded", "built-in subagent", "direct mutation"]) assert(inventory.includes(term), `Pi Web disposition missing: ${term}`);
  const notices = await readFile(resolve(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
  assert(notices.includes("@agegr/pi-web 0.8.11") && notices.includes("Copyright (c) 2026 agegr"), "Pi Web 0.8.11 MIT notice missing");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateWebSourceLocks().then(async () => console.log(`Web source locks valid (${await sha256(LOCK_PATH)})`)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  });
}
