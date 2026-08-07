import { isRecord, type SessionLikeEntry } from "./contracts.js";

/** Bounded, content-free explanations returned by the protection classifier. */
export const PROTECTION_REASON_CODES = [
  "protocol",
  "incomplete",
  "binary",
  "current-turn",
  "recent-user",
  "protected-user",
  "protected-tool",
  "protected-file",
  "protected-tag",
  "metadata-unknown",
] as const;

export type ProtectionReasonCode = typeof PROTECTION_REASON_CODES[number];

export interface ProtectionPolicy {
  cwd: string;
  recentUserMessages?: number;
  protectUserMessages?: boolean;
  protectTags?: boolean;
  tools?: readonly string[];
  fileGlobs?: readonly string[];
}

export interface ProtectionDecision {
  protected: boolean;
  /** Ordered, deduplicated reason codes. Never includes source content or metadata. */
  reasons: readonly ProtectionReasonCode[];
}

type ToolCall = { entryIndex: number; id: string; name: string; args: unknown };
type ToolResult = { entryIndex: number; id: string; name: string; content: unknown };

const PATH_KEYS = new Set(["path", "file", "filename", "filePath", "file_path"]);
const HARD_SECRET_BASENAMES = [
  /^\.env(?:\..*)?$/i,
  /(?:^|[-_.])(?:credentials?|secrets?)(?:[-_.]|$)/i,
  /^(?:id_)?(?:rsa|dsa|ecdsa|ed25519)(?:\.[^/]*)?$/i,
  /^(?:private[-_.]?)?keys?(?:\.[^/]*)?$/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
];

/**
 * Classifies one replay entry without I/O or dependencies. Hard rules are always
 * applied after configurable additions, so configuration cannot remove them.
 */
export function classifyProtection(
  entries: readonly SessionLikeEntry[],
  entryIndex: number,
  policy: ProtectionPolicy,
): ProtectionDecision {
  if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= entries.length) {
    return decision(["metadata-unknown"]);
  }
  const entry = entries[entryIndex]!;
  if (entry.type !== "message" || !isRecord(entry.message)) return decision(["metadata-unknown"]);

  const messages = entries.map((candidate) => candidate.type === "message" && isRecord(candidate.message) ? candidate.message : undefined);
  const message = entry.message;
  const calls = collectCalls(entries);
  const results = collectResults(entries);
  const atomIndexes = atomFor(entryIndex, calls, results);
  const reasons = new Set<ProtectionReasonCode>();

  const atomMessages = [...atomIndexes].map((index) => messages[index]).filter((value): value is Record<string, unknown> => value !== undefined);
  const atomCalls = calls.filter((call) => atomIndexes.has(call.entryIndex));
  const atomResults = results.filter((result) => atomIndexes.has(result.entryIndex));

  if (atomCalls.some((call) => call.name.startsWith("aili_")) || atomResults.some((result) => result.name.startsWith("aili_"))) reasons.add("protocol");
  if (isProtocol(message) && !isCompleteAtom(atomIndexes, atomCalls, atomResults)) reasons.add("incomplete");
  if (atomMessages.some(hasMalformedProtocolMetadata)) reasons.add("metadata-unknown");
  if (atomMessages.some((candidate) => hasBinary(candidate.content))) reasons.add("binary");

  const latestUser = latestRoleIndex(messages, "user");
  const laterAssistant = messages.slice(entryIndex + 1).some((candidate) => candidate?.role === "assistant");
  if (latestUser >= 0 && entryIndex >= latestUser && !laterAssistant) reasons.add("current-turn");

  if (message.role === "user") {
    const recentCount = Math.max(2, Math.floor(policy.recentUserMessages ?? 2));
    const recentUsers = messages.flatMap((candidate, index) => candidate?.role === "user" ? [index] : []).slice(-recentCount);
    if (recentUsers.includes(entryIndex)) reasons.add("recent-user");
    if (policy.protectUserMessages === true) reasons.add("protected-user");
  }

  const configuredTools = new Set((policy.tools ?? []).map((name) => name.toLocaleLowerCase()));
  if (atomCalls.some((call) => configuredTools.has(call.name)) || atomResults.some((result) => configuredTools.has(result.name))) reasons.add("protected-tool");

  for (const call of atomCalls) {
    const paths = extractKnownPaths(call.args);
    if (!paths.valid) {
      reasons.add("metadata-unknown");
      continue;
    }
    if (paths.values.some((path) => isProtectedFile(path, policy.cwd, policy.fileGlobs ?? []))) reasons.add("protected-file");
  }
  if (atomResults.some((result) => !callForResult(result, calls))) reasons.add("metadata-unknown");

  if (policy.protectTags === true && atomMessages.some((candidate) => hasBalancedProtectRegion(textContent(candidate.content)))) reasons.add("protected-tag");
  return decision([...reasons]);
}

export function classifyAllProtections(entries: readonly SessionLikeEntry[], policy: ProtectionPolicy): readonly ProtectionDecision[] {
  return entries.map((_entry, index) => classifyProtection(entries, index, policy));
}

/** Dependency-free glob matcher: `*` stays in a segment, `**` crosses `/`, and `?` matches one non-`/`. */
export function matchProtectionGlob(path: string, glob: string): boolean {
  const normalizedPath = normalizeSeparators(path);
  const normalizedGlob = normalizeSeparators(glob);
  let expression = "^";
  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const character = normalizedGlob[index]!;
    if (character === "*") {
      if (normalizedGlob[index + 1] === "*") {
        while (normalizedGlob[index + 1] === "*") index += 1;
        expression += normalizedGlob[index + 1] === "/" ? "(?:.*/)?" : ".*";
        if (normalizedGlob[index + 1] === "/") index += 1;
      } else expression += "[^/]*";
    } else if (character === "?") expression += "[^/]";
    else expression += character.replace(/[\\^$.[\]{}()+|]/g, "\\$&");
  }
  try {
    return new RegExp(`${expression}$`, "i").test(normalizedPath);
  } catch {
    return false;
  }
}

/** Lexically resolves a path against cwd. It never accesses the filesystem. */
export function normalizeProtectionPath(path: string, cwd: string): { absolute: string; relative?: string } | undefined {
  if (!path || path.includes("\0")) return undefined;
  const source = normalizeSeparators(path);
  const base = normalizeSeparators(cwd || "/");
  const absoluteInput = source.startsWith("/") || /^[A-Za-z]:\//.test(source);
  const combined = absoluteInput ? source : `${base}/${source}`;
  const drive = combined.match(/^[A-Za-z]:/)?.[0].toLocaleLowerCase();
  const root = drive ? `${drive}/` : "/";
  const parts: string[] = [];
  for (const part of combined.replace(/^[A-Za-z]:/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const absolute = `${root}${parts.join("/")}`.replace(/\/$/, "") || root;
  const normalizedCwd = lexicalAbsolute(base);
  const prefix = normalizedCwd.endsWith("/") ? normalizedCwd : `${normalizedCwd}/`;
  return { absolute, ...(absolute.startsWith(prefix) ? { relative: absolute.slice(prefix.length) } : absolute === normalizedCwd ? { relative: "" } : {}) };
}

export function hasBalancedProtectRegion(text: string): boolean {
  let depth = 0;
  let opened = false;
  for (const match of text.matchAll(/<\/?protect>/g)) {
    if (match[0] === "<protect>") {
      depth += 1;
      opened = true;
    } else {
      if (depth === 0) return false;
      depth -= 1;
      if (opened && depth === 0) return true;
    }
  }
  return false;
}

function decision(reasons: readonly ProtectionReasonCode[]): ProtectionDecision {
  const set = new Set(reasons);
  const ordered = PROTECTION_REASON_CODES.filter((reason) => set.has(reason));
  return { protected: ordered.length > 0, reasons: ordered };
}

function collectCalls(entries: readonly SessionLikeEntry[]): ToolCall[] {
  const calls: ToolCall[] = [];
  entries.forEach((entry, entryIndex) => {
    if (entry.type !== "message" || !isRecord(entry.message)) return;
    const candidates = [
      ...(Array.isArray(entry.message.toolCalls) ? entry.message.toolCalls : []),
      ...(Array.isArray(entry.message.content) ? entry.message.content.filter((part) => isRecord(part) && part.type === "toolCall") : []),
    ];
    for (const candidate of candidates) if (isRecord(candidate) && typeof candidate.id === "string" && typeof candidate.name === "string") {
      calls.push({ entryIndex, id: candidate.id, name: candidate.name.toLocaleLowerCase(), args: candidate.arguments });
    }
  });
  return calls;
}

function collectResults(entries: readonly SessionLikeEntry[]): ToolResult[] {
  const results: ToolResult[] = [];
  entries.forEach((entry, entryIndex) => {
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "toolResult") return;
    if (typeof entry.message.toolCallId === "string" && typeof entry.message.toolName === "string") {
      results.push({ entryIndex, id: entry.message.toolCallId, name: entry.message.toolName.toLocaleLowerCase(), content: entry.message.content });
    }
  });
  return results;
}

function atomFor(index: number, calls: readonly ToolCall[], results: readonly ToolResult[]): Set<number> {
  const ids = new Set(calls.filter((call) => call.entryIndex === index).map((call) => call.id));
  for (const result of results) if (result.entryIndex === index) ids.add(result.id);
  // A result belongs to the complete assistant transaction, including sibling calls/results.
  const callerIndexes = new Set(calls.filter((call) => ids.has(call.id)).map((call) => call.entryIndex));
  for (const call of calls) if (callerIndexes.has(call.entryIndex)) ids.add(call.id);
  const indexes = new Set([index]);
  for (const call of calls) if (ids.has(call.id)) indexes.add(call.entryIndex);
  for (const result of results) if (ids.has(result.id)) indexes.add(result.entryIndex);
  return indexes;
}

function isCompleteAtom(indexes: ReadonlySet<number>, calls: readonly ToolCall[], results: readonly ToolResult[]): boolean {
  if (calls.length === 0 || results.length === 0) return false;
  return calls.every((call) => results.some((result) => result.id === call.id))
    && results.every((result) => calls.some((call) => call.id === result.id))
    && [...indexes].length >= 2;
}

function callForResult(result: ToolResult, calls: readonly ToolCall[]): ToolCall | undefined {
  const matches = calls.filter((call) => call.id === result.id);
  return matches.length === 1 ? matches[0] : undefined;
}

function isProtocol(message: Record<string, unknown>): boolean {
  return message.role === "toolResult" || Array.isArray(message.toolCalls)
    || (Array.isArray(message.content) && message.content.some((part) => isRecord(part) && part.type === "toolCall"));
}

function hasBinary(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some((part) => isRecord(part) && part.type !== "text" && part.type !== "toolCall");
}

function hasMalformedProtocolMetadata(message: Record<string, unknown>): boolean {
  if (message.role === "toolResult") {
    return typeof message.toolCallId !== "string" || typeof message.toolName !== "string";
  }
  const candidates = [
    ...(Array.isArray(message.toolCalls) ? message.toolCalls : []),
    ...(Array.isArray(message.content) ? message.content.filter((part) => isRecord(part) && part.type === "toolCall") : []),
  ];
  return candidates.some((candidate) => !isRecord(candidate)
    || typeof candidate.id !== "string"
    || typeof candidate.name !== "string"
    || !isRecord(candidate.arguments));
}

function extractKnownPaths(args: unknown): { valid: boolean; values: string[] } {
  if (!isRecord(args)) return { valid: false, values: [] };
  const values: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (!PATH_KEYS.has(key)) continue;
    if (typeof value !== "string" || !value) return { valid: false, values: [] };
    values.push(value);
  }
  return { valid: true, values };
}

function isProtectedFile(path: string, cwd: string, configuredGlobs: readonly string[]): boolean {
  const normalized = normalizeProtectionPath(path, cwd);
  if (!normalized) return true;
  const basename = normalized.absolute.split("/").at(-1) ?? "";
  if (HARD_SECRET_BASENAMES.some((pattern) => pattern.test(basename))) return true;
  return configuredGlobs.some((glob) => matchProtectionGlob(normalized.absolute, glob) || (normalized.relative !== undefined && matchProtectionGlob(normalized.relative, glob)));
}

function latestRoleIndex(messages: readonly (Record<string, unknown> | undefined)[], role: string): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) if (messages[index]?.role === role) return index;
  return -1;
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => isRecord(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : []).join("\n");
}

function normalizeSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

function lexicalAbsolute(value: string): string {
  const source = normalizeSeparators(value);
  const drive = source.match(/^[A-Za-z]:/)?.[0].toLocaleLowerCase();
  const root = drive ? `${drive}/` : "/";
  const parts: string[] = [];
  for (const part of source.replace(/^[A-Za-z]:/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${root}${parts.join("/")}`.replace(/\/$/, "") || root;
}
