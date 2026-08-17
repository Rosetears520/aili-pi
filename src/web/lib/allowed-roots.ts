import { readFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { toSlashPath } from "./paths";

// In-memory roots that should be browsable in addition to roots derived from
// persisted sessions. Stored on globalThis so Next.js hot-reload keeps them.
declare global {
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
  var __piAdditionalAllowedRoots: Set<string> | undefined;
  var __piStartupAllowedRoots: Set<string> | undefined;
}

/**
 * Allowed roots are internal bookkeeping keys that are never displayed, so they
 * are stored slash-normalized for consistent Set membership. Correctness does
 * not depend on it — isPathWithinRoots() re-normalizes whatever it is given.
 */
export function normalizeSlashes(filePath: string): string {
  return toSlashPath(filePath);
}

export function getAdditionalAllowedRoots(): Set<string> {
  if (!globalThis.__piAdditionalAllowedRoots) {
    globalThis.__piAdditionalAllowedRoots = new Set();
  }
  return globalThis.__piAdditionalAllowedRoots;
}

export function allowFileRoot(root: string): void {
  if (!root) return;
  const normalizedRoot = normalizeSlashes(root);
  getAdditionalAllowedRoots().add(normalizedRoot);
  globalThis.__piAllowedRootsCache?.roots.add(normalizedRoot);
}


export function isWsl(): boolean {
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

export function wslDistroName(): string | null {
  const fromEnv = process.env.WSL_DISTRO_NAME?.trim();
  return fromEnv || null;
}

/**
 * Windows drive mounts only: drvfs/9p entries whose mount point is exactly
 * /mnt/<drive-letter>. Never the whole /mnt tree — non-Windows mounts
 * (network volumes, manual mounts) must opt in via AILI_WEB_FILE_ROOTS.
 */
export function wslWindowsDriveMounts(): string[] {
  try {
    const mounts = readFileSync("/proc/mounts", "utf8");
    const roots: string[] = [];
    for (const line of mounts.split("\n")) {
      const parts = line.split(/\s+/);
      const mountPoint = parts[1];
      const fsType = parts[2];
      if (!mountPoint || !/^\/mnt\/[a-z]$/.test(mountPoint)) continue;
      if (fsType === "drvfs" || fsType === "9p") roots.push(mountPoint);
    }
    return roots;
  } catch {
    return [];
  }
}

function expandTilde(entry: string): string {
  if (entry === "~") return homedir();
  if (entry.startsWith("~/") || entry.startsWith("~\\")) return path.join(homedir(), entry.slice(2));
  return entry;
}

/**
 * Startup-configured extra roots: the AILI_WEB_FILE_ROOTS environment
 * variable (colon-separated, ~ expanded) plus WSL Windows drive mounts.
 * Computed once per process; mount changes require a restart.
 */
export function getStartupAllowedRoots(): Set<string> {
  if (!globalThis.__piStartupAllowedRoots) {
    const roots = new Set<string>();
    for (const entry of (process.env.AILI_WEB_FILE_ROOTS ?? "").split(":")) {
      const trimmed = entry.trim();
      if (trimmed) roots.add(normalizeSlashes(expandTilde(trimmed)));
    }
    if (isWsl()) {
      for (const mount of wslWindowsDriveMounts()) roots.add(normalizeSlashes(mount));
    }
    // Persistent scratch for pasted/dropped files (browser-side pastes never
    // reveal local paths, so the content is stored here and referenced by path).
    // Mirrors the SDK's getAgentDir(): PI_CODING_AGENT_DIR overrides the default.
    const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(homedir(), ".pi", "agent");
    roots.add(normalizeSlashes(path.join(agentDir, "aili-uploads")));
    globalThis.__piStartupAllowedRoots = roots;
  }
  return globalThis.__piStartupAllowedRoots;
}
