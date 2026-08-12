import { lstat, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const ROSE_MARKER_START = "<!-- AILI-PI:ROSE:START -->";
export const ROSE_MARKER_END = "<!-- AILI-PI:ROSE:END -->";

export interface GlobalResourceReport {
  appendSystemPath: string;
  roleDirectory: string;
  appendSystem: "missing" | "installed" | "malformed";
  roles: { expected: 0; installed: 0; missing: string[]; stale: string[] };
  ownership: "retired";
}

export function globalResourcePaths(home = homedir()): { appendSystemPath: string; roleDirectory: string } {
  const agentDirectory = join(home, ".pi", "agent");
  return {
    appendSystemPath: join(agentDirectory, "APPEND_SYSTEM.md"),
    roleDirectory: join(agentDirectory, "agents", "aili"),
  };
}

function markerState(content: string): "missing" | "installed" | "malformed" {
  const starts = content.split(ROSE_MARKER_START).length - 1;
  const ends = content.split(ROSE_MARKER_END).length - 1;
  if (starts === 0 && ends === 0) return "missing";
  if (starts === 1 && ends === 1 && content.indexOf(ROSE_MARKER_START) < content.indexOf(ROSE_MARKER_END)) return "installed";
  return "malformed";
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return undefined;
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Legacy APPEND_SYSTEM and global role files are report-only. rose-aili owns
 * current global AGENTS/prompts; aili-pi never rewrites or removes user files.
 */
export async function inspectGlobalResources(home = homedir()): Promise<GlobalResourceReport> {
  const { appendSystemPath, roleDirectory } = globalResourcePaths(home);
  const appendContent = await readOptional(appendSystemPath);
  let stale: string[] = [];
  try {
    stale = (await readdir(roleDirectory)).filter((file) => file.endsWith(".md")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    appendSystemPath,
    roleDirectory,
    appendSystem: appendContent === undefined ? "missing" : markerState(appendContent),
    roles: { expected: 0, installed: 0, missing: [], stale },
    ownership: "retired",
  };
}
