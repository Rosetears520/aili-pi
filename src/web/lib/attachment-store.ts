import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Session attachment cache: the only place file content is ever copied is
 * here, and only for paste/drag inputs whose local path the browser cannot
 * reveal. Real-path references (native dialog, @, pasted paths) never touch
 * this store. Bounded by TTL, orphan age, dead-session cleanup, and a hard
 * capacity cap — garbage collection runs once per server startup.
 */

const MAX_NAME_CHARS = 120;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export const ORPHAN_DIR = "orphan";

export interface GcLimits {
  orphanMs: number;
  ttlMs: number;
  hardCapBytes: number;
  targetBytes: number;
}

export const DEFAULT_GC_LIMITS: GcLimits = {
  orphanMs: 24 * 60 * 60 * 1000,
  ttlMs: 30 * 24 * 60 * 60 * 1000,
  hardCapBytes: 2 * 1024 * 1024 * 1024,
  targetBytes: Math.floor(1.5 * 1024 * 1024 * 1024),
};

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}

export function attachmentsBase(): string {
  return join(agentDir(), "aili-uploads");
}

/** Bounded, traversal-free file name for cache storage. */
export function safeName(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "file")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .trim();
  const cleaned = base || "file";
  return cleaned.length > MAX_NAME_CHARS ? cleaned.slice(cleaned.length - MAX_NAME_CHARS) : cleaned;
}

/** Valid session ids double as safe single path segments. */
export function validSessionId(session: unknown): session is string {
  return typeof session === "string" && SESSION_ID_PATTERN.test(session) && session !== ORPHAN_DIR && !session.startsWith(".");
}

export interface StoredAttachment {
  readonly path: string;
  readonly scope: string;
}

export async function storeAttachment(buffer: Buffer, name: string, session: string | null): Promise<StoredAttachment> {
  const scope = validSessionId(session) ? session : ORPHAN_DIR;
  const directory = join(attachmentsBase(), scope);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${Date.now().toString(36)}-${safeName(name)}`);
  await writeFile(path, buffer);
  return { path, scope };
}

interface FileMeta {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

async function walkFiles(root: string): Promise<FileMeta[]> {
  const out: FileMeta[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        try {
          const info = await stat(full);
          out.push({ path: full, size: info.size, mtimeMs: info.mtimeMs });
        } catch { /* vanished mid-walk */ }
      }
    }
  }
  return out;
}

async function removeEmptyDirs(root: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(root, entry.name);
    await removeEmptyDirs(full);
    try {
      if ((await readdir(full)).length === 0) await rm(full, { recursive: true });
    } catch { /* not empty after all */ }
  }
}

export interface GcReport {
  orphanRemoved: number;
  deadSessionRemoved: number;
  expiredRemoved: number;
  evictedForCap: number;
}

export function sessionAlive(session: string): Promise<boolean> {
  // Injected by callers to avoid a static dependency cycle with the session reader.
  return gcSessionProbe?.(session) ?? Promise.resolve(true);
}

let gcSessionProbe: ((session: string) => Promise<boolean>) | null = null;

export function setSessionProbe(probe: (session: string) => Promise<boolean>): void {
  gcSessionProbe = probe;
}

/**
 * Startup garbage collection: orphan age, dead sessions, TTL, then capacity
 * eviction (least-recently-modified first) down to the target. Limits are
 * injectable for testing.
 */
export async function collectGarbage(limits: GcLimits = DEFAULT_GC_LIMITS, probe: (session: string) => Promise<boolean> = sessionAlive): Promise<GcReport> {
  const report: GcReport = { orphanRemoved: 0, deadSessionRemoved: 0, expiredRemoved: 0, evictedForCap: 0 };
  const base = attachmentsBase();
  const now = Date.now();
  let total = 0;
  const survivors: FileMeta[] = [];

  const dirs: string[] = [];
  try {
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(entry.name);
    }
  } catch {
    return report;
  }

  for (const dir of dirs) {
    const alive = dir === ORPHAN_DIR ? true : await probe(dir);
    for (const file of await walkFiles(join(base, dir))) {
      const orphan = dir === ORPHAN_DIR;
      if (orphan && now - file.mtimeMs > limits.orphanMs) {
        await rm(file.path, { force: true });
        report.orphanRemoved += 1;
        continue;
      }
      if (!alive) {
        await rm(file.path, { force: true });
        report.deadSessionRemoved += 1;
        continue;
      }
      if (now - file.mtimeMs > limits.ttlMs) {
        await rm(file.path, { force: true });
        report.expiredRemoved += 1;
        continue;
      }
      total += file.size;
      survivors.push(file);
    }
    if (!alive) await rm(join(base, dir), { recursive: true, force: true });
  }

  if (total > limits.hardCapBytes) {
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of survivors) {
      if (total <= limits.targetBytes) break;
      await rm(file.path, { force: true });
      total -= file.size;
      report.evictedForCap += 1;
    }
  }

  await removeEmptyDirs(base);
  return report;
}
