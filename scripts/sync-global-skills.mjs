import { cp, lstat, readdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME_PATH = ["@rosetears", "aili-pi"];

async function directoryEntry(path) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return "other";
    return info.isDirectory() ? "directory" : "other";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}

async function skillNames(sourceRoot) {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const skillFile = join(sourceRoot, entry.name, "SKILL.md");
    try {
      const info = await lstat(skillFile);
      if (info.isFile() && !info.isSymbolicLink()) names.push(entry.name);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return names.sort((left, right) => left.localeCompare(right));
}

function temporaryPath(parent, name, purpose) {
  return join(parent, `.${name}.aili-pi-${purpose}-${process.pid}-${randomUUID()}`);
}

/** True only for the two locations owned by Pi's package manager. */
export function isPiManagedNpmPackageRoot(packageRoot, home = homedir()) {
  const expectedRoots = [
    join(home, ".pi", "agent", "npm", "node_modules", ...PACKAGE_NAME_PATH),
    join(home, ".pi", "npm", "node_modules", ...PACKAGE_NAME_PATH),
  ].map((path) => resolve(path));
  return expectedRoots.includes(resolve(packageRoot));
}

/**
 * Replace only existing, real skill directories that have the same name as an
 * embedded AILI snapshot skill. Unmatched user skills and package-only skills
 * are intentionally left alone.
 */
export async function syncExistingGlobalSkills(options = {}) {
  const packageRoot = resolve(options.packageRoot ?? PACKAGE_ROOT);
  const home = resolve(options.home ?? homedir());
  const sourceRoot = join(packageRoot, "skills");
  const targetRoot = join(home, ".agents", "skills");
  const sourceNames = await skillNames(sourceRoot);
  const rootKind = await directoryEntry(targetRoot);
  if (rootKind === "missing") {
    return { scanned: sourceNames.length, updated: [], skippedMissing: sourceNames, skippedUnsafe: [] };
  }
  if (rootKind !== "directory") {
    throw new Error(`refusing to sync skills through a non-directory or symlink target: ${targetRoot}`);
  }

  const matched = [];
  const skippedMissing = [];
  const skippedUnsafe = [];
  for (const name of sourceNames) {
    const targetKind = await directoryEntry(join(targetRoot, name));
    if (targetKind === "directory") matched.push(name);
    else if (targetKind === "missing") skippedMissing.push(name);
    else skippedUnsafe.push(name);
  }

  const stages = new Map();
  try {
    for (const name of matched) {
      const stage = temporaryPath(targetRoot, name, "stage");
      await cp(join(sourceRoot, name), stage, { recursive: true, errorOnExist: true, force: false });
      stages.set(name, stage);
    }

    const updated = [];
    for (const name of matched) {
      const target = join(targetRoot, name);
      const stage = stages.get(name);
      const previous = temporaryPath(targetRoot, name, "previous");
      let movedPrevious = false;
      try {
        await rename(target, previous);
        movedPrevious = true;
        await rename(stage, target);
        stages.delete(name);
        await rm(previous, { recursive: true, force: true });
        updated.push(name);
      } catch (error) {
        if (movedPrevious) {
          const targetKind = await directoryEntry(target);
          if (targetKind === "missing") await rename(previous, target).catch(() => undefined);
        }
        throw error;
      } finally {
        await rm(previous, { recursive: true, force: true });
      }
    }

    return { scanned: sourceNames.length, updated, skippedMissing, skippedUnsafe };
  } finally {
    await Promise.all([...stages.values()].map((path) => rm(path, { recursive: true, force: true })));
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--if-pi-managed")) {
    throw new Error("usage: sync-global-skills.mjs [--if-pi-managed]");
  }
  if (args[0] === "--if-pi-managed" && !isPiManagedNpmPackageRoot(PACKAGE_ROOT)) {
    console.log("AILI skills: global sync skipped outside a Pi-managed npm package root");
    return;
  }
  const report = await syncExistingGlobalSkills();
  console.log(
    `AILI skills: scanned=${report.scanned} updated=${report.updated.length} unchanged=${report.skippedMissing.length + report.skippedUnsafe.length}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
