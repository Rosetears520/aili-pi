import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { SessionManager, type SessionEntry, type SessionHeader } from "@earendil-works/pi-coding-agent";
import type { JsonValue } from "./contracts.js";

const MAX_JSONL_BYTES = 8 * 1024 * 1024;
const MAX_JSONL_LINES = 8_192;

export interface JsonlBrowserOptions {
  readonly allowedRoots: readonly string[];
  readonly maxBytes?: number;
  readonly maxLines?: number;
  readonly privateSalt?: string;
  readonly sessionManagerOpen?: (path: string) => ReadonlySessionManagerLike;
}

export interface ReadonlySessionManagerLike {
  getHeader(): SessionHeader | null;
  getEntries(): SessionEntry[];
  getSessionName(): string | undefined;
}

export interface OfficialSessionManagerAdapter {
  list(cwd: string, sessionDirectory?: string): ReturnType<typeof SessionManager.list>;
  open(path: string): ReadonlySessionManagerLike;
}

export const officialSessionManagerAdapter: OfficialSessionManagerAdapter = Object.freeze({
  list: (cwd: string, sessionDirectory?: string) => SessionManager.list(cwd, sessionDirectory),
  open: (path: string) => SessionManager.open(path),
});

export interface JsonlSessionDescriptorV1 {
  readonly schemaVersion: 1;
  readonly sessionHandle: string;
  /** @deprecated public compatibility alias; it is the opaque handle, never a Pi id. */
  readonly sessionId: string;
  readonly label: string;
  readonly modifiedAt: string;
  readonly size: number;
}

export interface JsonlProjectionRecordV1 {
  readonly schemaVersion: 1;
  readonly index: number;
  readonly type: string;
  readonly role?: "user" | "assistant" | "tool" | "system";
  readonly content?: string;
  readonly timestamp?: string;
  readonly data?: Readonly<Record<string, JsonValue>>;
}

/**
 * Read-only official Pi SessionManager browsing. This class never imports or
 * creates AgentSession; its injected/default opener is SessionManager.open.
 */
export class ReadonlyJsonlBrowser {
  private readonly roots: string[];
  private readonly maxBytes: number;
  private readonly maxLines: number;
  private readonly privateSalt: string;
  private readonly sessionManagerOpen: (path: string) => ReadonlySessionManagerLike;
  private readonly privatePaths = new Map<string, string>();

  public constructor(options: JsonlBrowserOptions) {
    if (!Array.isArray(options.allowedRoots) || options.allowedRoots.length === 0) throw new Error("at least one allowed JSONL root is required");
    this.roots = [...new Set(options.allowedRoots.map((root) => {
      if (!isAbsolute(root)) throw new Error("allowed JSONL roots must be absolute");
      return resolve(root);
    }))].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
    this.maxBytes = bounded(options.maxBytes ?? MAX_JSONL_BYTES, 1_024, MAX_JSONL_BYTES, "maxBytes");
    this.maxLines = bounded(options.maxLines ?? MAX_JSONL_LINES, 1, MAX_JSONL_LINES, "maxLines");
    this.privateSalt = options.privateSalt ?? randomBytes(32).toString("base64url");
    this.sessionManagerOpen = options.sessionManagerOpen ?? officialSessionManagerAdapter.open;
  }

  public async list(): Promise<readonly JsonlSessionDescriptorV1[]> {
    const descriptors: JsonlSessionDescriptorV1[] = [];
    for (const root of this.roots) {
      const trustedRoot = await trustedRootPath(root);
      const paths = await discoverJsonlFiles(trustedRoot, 2);
      for (const path of paths) {
        const entryName = basename(path);
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > this.maxBytes) continue;
        const sessionHandle = this.opaqueHandle(path);
        this.privatePaths.set(sessionHandle, path);
        let label = safeLabel(basename(entryName, ".jsonl"));
        try { label = safeLabel(this.sessionManagerOpen(path).getSessionName() ?? label); } catch { /* malformed sessions remain listable */ }
        descriptors.push(Object.freeze({
          schemaVersion: 1,
          sessionHandle,
          sessionId: sessionHandle,
          label,
          modifiedAt: new Date(info.mtimeMs).toISOString(),
          size: info.size,
        }));
      }
    }
    return descriptors.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt) || left.sessionHandle.localeCompare(right.sessionHandle));
  }

  public async read(sessionHandle: string): Promise<readonly JsonlProjectionRecordV1[]> {
    const path = this.privatePaths.get(sessionHandle);
    if (!path) throw new Error("unknown JSONL session handle; list sessions first");
    return this.readPrivatePath(path);
  }

  public privatePathForHandle(sessionHandle: string): string | undefined {
    return this.privatePaths.get(sessionHandle);
  }

  /** Server-only official SessionManager adapter for a selected catalog entry. */
  public async readPrivatePath(path: string): Promise<readonly JsonlProjectionRecordV1[]> {
    if (!path.endsWith(".jsonl")) throw new Error("JSONL target must use the .jsonl extension");
    const trustedPath = await this.revalidate(path);
    const before = await lstat(trustedPath);
    if (!before.isFile() || before.isSymbolicLink() || before.size > this.maxBytes) throw new Error("JSONL target is not a permitted regular file");

    // Hold an O_NOFOLLOW descriptor while SessionManager parses the same checked
    // inode, then verify the inode/size did not change around the official read.
    const handle = await open(trustedPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > this.maxBytes || opened.dev !== before.dev || opened.ino !== before.ino) {
        throw new Error("JSONL target changed before open");
      }
      const manager = this.sessionManagerOpen(trustedPath);
      const projected = projectSessionManager(manager, this.maxLines);
      const after = await handle.stat();
      if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size) throw new Error("JSONL target changed while read");
      return projected;
    } finally {
      await handle.close();
    }
  }

  private opaqueHandle(path: string): string {
    return `session-${createHash("sha256").update(this.privateSalt).update("\0").update(path).digest("base64url").slice(0, 32)}`;
  }

  private async revalidate(path: string): Promise<string> {
    if (!isAbsolute(path)) throw new Error("JSONL path must be absolute");
    const resolved = resolve(path);
    const trustedRoots = await Promise.all(this.roots.map(trustedRootPath));
    if (!trustedRoots.some((root) => containedBy(resolved, root))) throw new Error("JSONL path is outside allowed roots");
    const parent = await realpath(dirname(resolved));
    if (!trustedRoots.some((root) => containedBy(parent, root))) throw new Error("JSONL parent escaped allowed roots");
    return resolve(parent, basename(resolved));
  }
}

export function projectSessionManager(manager: ReadonlySessionManagerLike, maxEntries = MAX_JSONL_LINES): readonly JsonlProjectionRecordV1[] {
  const entries = manager.getEntries().slice(0, maxEntries);
  return entries.map((entry, index) => projectEntry(entry, index));
}

/** Compatibility parser for bounded fixtures; production browsing uses SessionManager. */
export function projectJsonl(text: string, maxLines = MAX_JSONL_LINES): readonly JsonlProjectionRecordV1[] {
  const entries: SessionEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (value.type !== "session" && typeof value.type === "string" && typeof value.id === "string" && entries.length < maxLines) entries.push(value as unknown as SessionEntry);
    } catch { /* ignore a truncated final line */ }
  }
  return entries.map((entry, index) => projectEntry(entry, index));
}

async function discoverJsonlFiles(root: string, depth: number): Promise<readonly string[]> {
  const output: string[] = [];
  const visit = async (directory: string, remaining: number): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => Buffer.from(left.name).compare(Buffer.from(right.name)))) {
      if (output.length >= 4_096) throw new Error("JSONL catalog exceeds its bounded file count");
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isFile() && entry.name.endsWith(".jsonl")) output.push(path);
      else if (entry.isDirectory() && remaining > 0) {
        const canonical = await realpath(path);
        if (containedBy(canonical, root)) await visit(canonical, remaining - 1);
      }
    }
  };
  await visit(root, depth);
  return output;
}

function projectEntry(entry: SessionEntry, index: number): JsonlProjectionRecordV1 {
  const raw = entry as unknown as Record<string, unknown>;
  const message = isRecord(raw.message) ? raw.message : undefined;
  const role = roleOf(message?.role);
  const content = projectContent(message?.content);
  const data = publicData(raw, message);
  return Object.freeze({
    schemaVersion: 1,
    index,
    type: boundedType(entry.type),
    ...(role ? { role } : {}),
    ...(content ? { content } : {}),
    ...(!Number.isNaN(Date.parse(entry.timestamp)) ? { timestamp: entry.timestamp } : {}),
    ...(Object.keys(data).length ? { data } : {}),
  });
}

function publicData(value: Record<string, unknown>, message?: Record<string, unknown>): Readonly<Record<string, JsonValue>> {
  const data: Record<string, JsonValue> = {};
  const allowed: ReadonlyArray<readonly [string, unknown]> = [
    ["entryId", value.id], ["status", message?.status ?? value.status], ["model", message?.model ?? value.model],
    ["provider", message?.provider ?? value.provider], ["toolName", message?.toolName],
  ];
  for (const [key, item] of allowed) {
    if (typeof item === "string") data[key] = item.slice(0, 512);
    else if (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) data[key] = item;
  }
  return Object.freeze(data);
}

function projectContent(value: unknown): string | undefined {
  if (typeof value === "string") return value.slice(0, 32_768);
  if (!Array.isArray(value)) return undefined;
  const text = value.flatMap((part) => isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("");
  return text ? text.slice(0, 32_768) : undefined;
}
function roleOf(value: unknown): JsonlProjectionRecordV1["role"] | undefined {
  return value === "user" || value === "assistant" || value === "tool" || value === "system" ? value : undefined;
}
function boundedType(value: string): string { return value.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 96) || "record"; }
function safeLabel(value: string): string { return value.replace(/[^A-Za-z0-9_. -]/g, "_").slice(0, 128) || "session"; }
async function trustedRootPath(root: string): Promise<string> {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("allowed JSONL root is not a regular directory");
  return realpath(root);
}
function containedBy(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function bounded(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is outside its permitted range`);
  return value;
}
