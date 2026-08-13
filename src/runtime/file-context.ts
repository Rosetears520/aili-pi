import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const FILE_CONTEXT_LIMITS = Object.freeze({
  files: 5_000,
  queryChars: 256,
  results: 100,
  previewBytes: 1_048_576,
  gitBytes: 1_100_000,
  gitTimeoutMs: 5_000,
  history: 20,
  snapshotLines: 500,
  snapshotBytes: 51_200,
  attachments: 8,
  attachmentBytes: 102_400,
});

const IGNORED_DIRECTORIES = new Set([".git", ".hg", ".svn", ".next", "build", "coverage", "dist", "node_modules", "target"]);

export interface FileContextCandidate { path: string; size?: number; binary?: boolean }
export interface FileContextRange { startLine?: number; endLine?: number; hunk?: string }
export interface ContentSearchMatch { path: string; lineNumber: number; line: string; ranges: ReadonlyArray<{ start: number; end: number }>; fuzzy: boolean }
export interface GitProvenance {
  status?: string;
  revision?: string;
  blob?: string;
  blame?: string;
  history?: readonly string[];
  diff?: string;
  head?: string;
  branch?: string;
  source?: "worktree" | "revision" | "git_diff";
  base?: string;
}
export interface GitDiffHunk { header: string; oldStart: number; oldCount: number; newStart: number; newCount: number; lines: readonly string[]; changedLines: readonly number[] }
export interface FileContextAttachment {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  sha256: string;
  tokenEstimate: number;
  provenance: Readonly<GitProvenance>;
}

function bounded(value: string, limit: number): string { return value.slice(0, limit); }
function isBinary(content: Buffer): boolean { return content.subarray(0, 8_192).includes(0); }
function isInside(root: string, target: string): boolean { return target === root || target.startsWith(`${root}${sep}`); }
function safeProjectPath(path: string): void {
  if (!path || isAbsolute(path) || path.includes("\0") || path.split(/[\\/]/).includes("..")) throw new Error("file-context path is outside the project root");
}
function frozenProvenance(value: GitProvenance | undefined): Readonly<GitProvenance> {
  return Object.freeze({
    ...(value?.status ? { status: bounded(value.status, FILE_CONTEXT_LIMITS.gitBytes) } : {}),
    ...(value?.revision ? { revision: bounded(value.revision, 256) } : {}),
    ...(value?.blob ? { blob: bounded(value.blob, 256) } : {}),
    ...(value?.head ? { head: bounded(value.head, 256) } : {}),
    ...(value?.branch ? { branch: bounded(value.branch, 256) } : {}),
    ...(value?.blame ? { blame: bounded(value.blame, FILE_CONTEXT_LIMITS.gitBytes) } : {}),
    ...(value?.diff ? { diff: bounded(value.diff, FILE_CONTEXT_LIMITS.gitBytes) } : {}),
    ...(value?.source ? { source: value.source } : {}),
    ...(value?.base ? { base: bounded(value.base, 256) } : {}),
    ...(value?.history ? { history: Object.freeze(value.history.slice(0, FILE_CONTEXT_LIMITS.history).map((entry) => bounded(entry, 512))) } : {}),
  });
}

/** Discover regular, in-root project files without traversing symlinks. */
export async function discoverFileContextFiles(root: string): Promise<readonly string[]> {
  const canonicalRoot = await realpath(root);
  const results: string[] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    if (results.length >= FILE_CONTEXT_LIMITS.files) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (results.length >= FILE_CONTEXT_LIMITS.files || entry.isSymbolicLink() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, path);
      else if (entry.isFile()) results.push(path);
    }
  };
  await walk(canonicalRoot, "");
  return Object.freeze(results);
}

export function searchFileContext(candidates: readonly FileContextCandidate[], query: string): readonly FileContextCandidate[] {
  const normalized = bounded(query, FILE_CONTEXT_LIMITS.queryChars).toLocaleLowerCase();
  const eligible = candidates.filter((candidate) => !candidate.binary && (candidate.size === undefined || candidate.size <= FILE_CONTEXT_LIMITS.previewBytes));
  if (!normalized) return Object.freeze(eligible.slice(0, FILE_CONTEXT_LIMITS.results));
  return Object.freeze(eligible.filter((candidate) => candidate.path.toLocaleLowerCase().includes(normalized)).slice(0, FILE_CONTEXT_LIMITS.results));
}

/** Content search deliberately consumes a supplied bounded loader, keeping TUI and filesystem ownership separate. */
export async function searchFileContextContent(
  files: readonly string[],
  load: (path: string) => Promise<{ path: string; content: string }>,
  query: string,
  options: { caseSensitive?: boolean; fuzzy?: boolean } = {},
): Promise<{ matches: readonly ContentSearchMatch[]; truncated: boolean; skippedFiles: number }> {
  if (!query.trim() || query.length > FILE_CONTEXT_LIMITS.queryChars) return { matches: [], truncated: false, skippedFiles: 0 };
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  const matches: ContentSearchMatch[] = [];
  let skippedFiles = 0;
  let truncated = false;
  for (const path of files) {
    try {
      const loaded = await load(path);
      for (const [index, line] of loaded.content.split(/\r?\n/).entries()) {
        const haystack = options.caseSensitive ? line : line.toLocaleLowerCase();
        const start = haystack.indexOf(needle);
        const fuzzy = options.fuzzy === true && start < 0 ? fuzzyRange(haystack, needle) : undefined;
        if (start < 0 && !fuzzy) continue;
        if (matches.length >= FILE_CONTEXT_LIMITS.results) { truncated = true; continue; }
        const ranges = fuzzy ?? literalRanges(haystack, needle);
        matches.push({ path: loaded.path, lineNumber: index + 1, line, ranges, fuzzy: Boolean(fuzzy) });
      }
    } catch { skippedFiles++; }
  }
  return { matches: Object.freeze(matches), truncated, skippedFiles };
}

function literalRanges(line: string, needle: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (let index = line.indexOf(needle); index >= 0; index = line.indexOf(needle, index + Math.max(needle.length, 1))) ranges.push({ start: index, end: index + needle.length });
  return ranges;
}
function fuzzyRange(line: string, needle: string): Array<{ start: number; end: number }> | undefined {
  const indexes: number[] = []; let at = 0;
  for (const character of needle) { at = line.indexOf(character, at); if (at < 0) return undefined; indexes.push(at++); }
  return indexes.map((index) => ({ start: index, end: index + 1 }));
}

export function freezeFileContextAttachments(attachments: readonly FileContextAttachment[]): readonly FileContextAttachment[] {
  if (attachments.length > FILE_CONTEXT_LIMITS.attachments) throw new Error("file-context attachment count exceeds the limit");
  const total = attachments.reduce((size, attachment) => size + Buffer.byteLength(attachment.content), 0);
  if (total > FILE_CONTEXT_LIMITS.attachmentBytes) throw new Error("file-context attachments exceed the total byte limit");
  return Object.freeze([...attachments]);
}

/** Build a single immutable selection snapshot; snapshots never reread the file. */
export function makeFileContextAttachment(path: string, content: string, range: FileContextRange = {}, provenance?: GitProvenance): FileContextAttachment {
  const lines = content.split(/\r?\n/);
  const startLine = Math.max(1, Math.min(range.startLine ?? 1, lines.length || 1));
  const requestedEnd = Math.max(startLine, range.endLine ?? lines.length);
  const endLine = Math.min(lines.length, startLine + FILE_CONTEXT_LIMITS.snapshotLines - 1, requestedEnd);
  const selected = bounded(lines.slice(startLine - 1, endLine).join("\n"), FILE_CONTEXT_LIMITS.snapshotBytes);
  return Object.freeze({
    path, content: selected, startLine,
    endLine: startLine + Math.max(0, selected.split(/\r?\n/).length - 1),
    sha256: createHash("sha256").update(selected).digest("hex"),
    tokenEstimate: Math.ceil(Buffer.byteLength(selected, "utf8") / 4),
    provenance: frozenProvenance(provenance),
  });
}

/** Preserve exact multi-range selection order and prevent attachments beyond upstream ceilings. */
export function makeFileContextAttachments(path: string, content: string, ranges: readonly FileContextRange[], provenance?: GitProvenance): readonly FileContextAttachment[] {
  return freezeFileContextAttachments(ranges.map((range) => makeFileContextAttachment(path, content, range, provenance)));
}

export async function snapshotFileContext(root: string, selectedPath: string, range: FileContextRange = {}, provenance?: GitProvenance): Promise<FileContextAttachment> {
  safeProjectPath(selectedPath);
  const canonicalRoot = await realpath(root);
  const candidate = resolve(canonicalRoot, selectedPath);
  if (!isInside(canonicalRoot, candidate)) throw new Error("file-context selection escapes the project root");
  // Reject the link itself even if its resolved target remains under the root.
  if ((await lstat(candidate)).isSymbolicLink()) throw new Error("file-context selection is a symlink");
  const canonicalPath = await realpath(candidate);
  if (!isInside(canonicalRoot, canonicalPath)) throw new Error("file-context selection escapes the project root");
  const metadata = await stat(canonicalPath);
  if (!metadata.isFile()) throw new Error("file-context selection is not a regular file");
  if (metadata.size > FILE_CONTEXT_LIMITS.previewBytes) throw new Error("file-context selection exceeds the 1 MiB preview limit");
  const bytes = await readFile(canonicalPath);
  if (isBinary(bytes)) throw new Error("file-context selection is binary");
  return makeFileContextAttachment(relative(canonicalRoot, canonicalPath), bytes.toString("utf8"), range, provenance);
}

async function git(root: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", args, { cwd: root, timeout: FILE_CONTEXT_LIMITS.gitTimeoutMs, maxBuffer: FILE_CONTEXT_LIMITS.gitBytes, windowsHide: true });
    return result.stdout.slice(0, FILE_CONTEXT_LIMITS.gitBytes);
  } catch { return undefined; }
}

/** Bounded Git data used as immutable selection provenance; every Git failure is local to this optional enrichment. */
export async function getFileContextGitProvenance(root: string, projectPath: string, revision?: string): Promise<Readonly<GitProvenance>> {
  safeProjectPath(projectPath);
  const [head, branch, status, diff, blob, blame, history] = await Promise.all([
    git(root, ["rev-parse", "--verify", "HEAD"]),
    git(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    git(root, ["status", "--porcelain=v1", "--", projectPath]),
    git(root, ["diff", "--no-ext-diff", "--no-textconv", "--unified=3", "HEAD", "--", projectPath]),
    git(root, ["rev-parse", "--verify", `HEAD:${projectPath}`]),
    git(root, ["blame", "--no-textconv", "--line-porcelain", "-L", "1,1", ...(revision ? [revision] : []), "--", projectPath]),
    git(root, ["log", `--max-count=${FILE_CONTEXT_LIMITS.history}`, "--format=%H%x1f%an%x1f%at%x1f%s", "--follow", "--", projectPath]),
  ]);
  return frozenProvenance({ head: head?.trim(), branch: branch?.trim() || undefined, status: status?.trim() || undefined, revision, blob: blob?.trim() || undefined, diff, blame, history: history?.split("\n").filter(Boolean) });
}

export function parseGitDiffHunks(diff: string): readonly GitDiffHunk[] {
  const hunks: GitDiffHunk[] = [];
  let current: { header: string; oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[]; changedLines: number[]; line: number } | undefined;
  for (const sourceLine of diff.split("\n")) {
    const header = sourceLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (header) {
      if (current) hunks.push({ ...current, lines: Object.freeze(current.lines), changedLines: Object.freeze(current.changedLines) });
      current = { header: sourceLine, oldStart: Number(header[1]), oldCount: Number(header[2] ?? 1), newStart: Number(header[3]), newCount: Number(header[4] ?? 1), lines: [], changedLines: [], line: Number(header[3]) };
      continue;
    }
    if (!current) continue;
    current.lines.push(sourceLine);
    if (sourceLine.startsWith("+")) current.changedLines.push(current.line++);
    else if (!sourceLine.startsWith("-")) current.line++;
  }
  if (current) hunks.push({ ...current, lines: Object.freeze(current.lines), changedLines: Object.freeze(current.changedLines) });
  return Object.freeze(hunks);
}

export interface FileContextTui {
  chooseFile(cwd: string): Promise<string | undefined>;
  attach(attachment: FileContextAttachment): void;
  report(message: string): void;
}

/** Thin registration seam: all selection/snapshot/Git policy stays TUI-independent. */
export async function openFileContext(tui: FileContextTui, cwd: string): Promise<void> {
  try {
    const path = await tui.chooseFile(cwd);
    if (!path) return;
    const provenance = await getFileContextGitProvenance(cwd, path);
    const attachment = await snapshotFileContext(cwd, path, {}, provenance);
    tui.attach(attachment);
  } catch (error) { tui.report(`File context unavailable: ${error instanceof Error ? error.message : String(error)}`); }
}
