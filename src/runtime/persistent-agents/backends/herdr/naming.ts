import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Bridge sockets cannot live in the sidecar: Unix socket paths are capped
 *  at ~108 bytes and session sidecar paths exceed that. They live in a
 *  short per-run directory under the runtime dir, addressed by a hash of the
 *  sidecar run directory (stable across parent restarts). */
export function bridgeSocketDirFor(sidecarRunDir: string): string {
  const runtimeDir = process.env.XDG_RUNTIME_DIR ?? tmpdir();
  return join(runtimeDir, ".aili-bridges", createHash("sha256").update(sidecarRunDir).digest("hex").slice(0, 16));
}

/** Herdr live agent names must match [a-z][a-z0-9_-]{0,31} and be unique
 *  among live agents on the whole daemon (multiple parents share it), so the
 *  machine-generated name mixes a per-parent key with the run number. The
 *  user-visible name never becomes the live name (ADR/decision 8). */
export function herdrParentKey(parentId: string): string {
  return createHash("sha256").update(parentId).digest("hex").slice(0, 6);
}

export function herdrLiveName(parentId: string, runNumber: number): string {
  const name = `ap-${herdrParentKey(parentId)}-${runNumber}`;
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name)) throw new Error(`generated herdr live name is invalid: ${name}`);
  return name;
}

export function herdrWorkspaceLabel(parentId: string): string {
  return `aili-${herdrParentKey(parentId)}`;
}

export function herdrTabLabel(agentId: string, alias: string): string {
  const safe = (alias || agentId).normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 24) || agentId.slice(0, 24);
  return safe;
}

/** Per-agent bridge secret. Stored only in the AILI sidecar (0600) and the
 *  child's environment — never in Herdr metadata. */
export function generateBridgeToken(): string {
  return randomBytes(24).toString("hex");
}

export function runNumberFromRunId(runId: string): number {
  const match = runId.match(/^run-(\d+)$/);
  return match ? Number(match[1]) : 0;
}
