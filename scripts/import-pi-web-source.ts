import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCE = resolve(ROOT, ".tmp/pi-web-git-0.8.11");
const DESTINATION = resolve(ROOT, "upstream/pi-web-0.8.11");
const STAGING = resolve(ROOT, "upstream/.pi-web-0.8.11.importing");
const LOCK_PATH = resolve(ROOT, "upstream/web-source-locks.json");
const EXCLUDED = new Set([".gitignore", "AGENTS.md", "CONTEXT.md", "bun.lock", "source.tgz"]);
const EXCLUDED_DIRECTORIES = new Set([".git", ".next", "node_modules"]);
const HISTORICAL = {
  path: resolve(ROOT, "upstream/pi-web-0.8.9"),
  fileCount: 376,
  tree: "21cc3896e8942cc0789b3012f86eb30b0dbc7fe983aa483fc339526c01b24820",
};

type TreeIdentity = { fileCount: number; sha256: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function treeIdentity(root: string): Promise<TreeIdentity> {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      assert(!entry.isSymbolicLink(), `${relative(root, path)}: symbolic links are not importable`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
      else throw new Error(`${relative(root, path)}: unsupported source entry`);
    }
  };
  await walk(root);
  files.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
  const aggregate = createHash("sha256");
  for (const file of files) {
    const name = relative(root, file).split(sep).join("/");
    aggregate.update(`${name}\0${await sha256(file)}\n`);
  }
  return { fileCount: files.length, sha256: aggregate.digest("hex") };
}

function excluded(relativePath: string, directory: boolean): boolean {
  const segments = relativePath.split("/");
  if (segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) return true;
  return !directory && EXCLUDED.has(relativePath);
}

async function copySnapshot(sourceRoot: string, destinationRoot: string): Promise<void> {
  const walk = async (sourceDirectory: string): Promise<void> => {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const sourcePath = resolve(sourceDirectory, entry.name);
      const relativePath = relative(sourceRoot, sourcePath).split(sep).join("/");
      assert(!entry.isSymbolicLink(), `${relativePath}: symbolic links are not importable`);
      if (excluded(relativePath, entry.isDirectory())) continue;
      const destinationPath = resolve(destinationRoot, relativePath);
      if (entry.isDirectory()) {
        await mkdir(destinationPath, { recursive: true });
        await walk(sourcePath);
      } else if (entry.isFile()) {
        await mkdir(dirname(destinationPath), { recursive: true });
        await copyFile(sourcePath, destinationPath);
      } else {
        throw new Error(`${relativePath}: unsupported source entry`);
      }
    }
  };
  await mkdir(destinationRoot);
  await walk(sourceRoot);
}

async function updateLock(identity: TreeIdentity): Promise<void> {
  const locks = JSON.parse(await readFile(LOCK_PATH, "utf8")) as {
    sources: Array<{ id: string; importedFileCount: number; importedTreeSha256: string }>;
  };
  const active = locks.sources.filter((source) => source.id === "pi-web-0.8.11");
  assert(active.length === 1, "source lock must contain one pi-web-0.8.11 record");
  active[0].importedFileCount = identity.fileCount;
  active[0].importedTreeSha256 = identity.sha256;
  await writeFile(LOCK_PATH, `${JSON.stringify(locks, null, 2)}\n`, "utf8");
}

export async function importPiWebSource(): Promise<TreeIdentity> {
  assert((await stat(SOURCE)).isDirectory(), "downloaded Pi Web Git-tag evidence is missing");
  assert(!(await pathExists(DESTINATION)), "refusing to overwrite upstream/pi-web-0.8.11");
  assert(!(await pathExists(STAGING)), "stale import staging directory exists; inspect it rather than deleting automatically");

  const historicalBefore = await treeIdentity(HISTORICAL.path);
  assert(historicalBefore.fileCount === HISTORICAL.fileCount && historicalBefore.sha256 === HISTORICAL.tree,
    "historical Pi Web 0.8.9 snapshot drifted before import");

  await copySnapshot(SOURCE, STAGING);
  const staged = await treeIdentity(STAGING);
  await rename(STAGING, DESTINATION);
  const imported = await treeIdentity(DESTINATION);
  assert(imported.fileCount === staged.fileCount && imported.sha256 === staged.sha256, "snapshot changed during atomic import");

  const historicalAfter = await treeIdentity(HISTORICAL.path);
  assert(historicalAfter.fileCount === HISTORICAL.fileCount && historicalAfter.sha256 === HISTORICAL.tree,
    "historical Pi Web 0.8.9 snapshot drifted during import");

  await updateLock(imported);
  return imported;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  importPiWebSource()
    .then((identity) => console.log(`Imported Pi Web 0.8.11: ${identity.fileCount} files, ${identity.sha256}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
