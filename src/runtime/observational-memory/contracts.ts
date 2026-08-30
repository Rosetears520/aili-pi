import { createHash } from "node:crypto";

export const AUTOMATIC_MEMORY_SCHEMA_VERSION = 1 as const;
export type MemoryKind = "preference" | "reusable-solution" | "project-decision" | "recovery-point";
export type MemoryApplicability = "global-preference" | "reusable-solution" | "project-decision" | "recovery-point";
export type SourceRole = "user" | "assistant" | "tool-outcome";

export interface SourceCutoff {
  schemaVersion: 1;
  sessionId: string;
  branchId: string;
  fromEntryId: string;
  coversUpToId: string;
  sourceCount: number;
  estimatedTokens: number;
  contentHash: string;
}

export interface SourceEnvelope {
  schemaVersion: 1;
  id: string;
  entryId: string;
  sessionId: string;
  agentId: string;
  branchId: string;
  sourceProject: string;
  role: SourceRole;
  text: string;
  estimatedTokens: number;
  createdAt: string;
}

export interface ObservationBatch {
  schemaVersion: 1;
  id: string;
  cutoff: SourceCutoff;
  sources: readonly SourceEnvelope[];
}

export interface AutomaticMemoryCandidate {
  schemaVersion: 1;
  id: string;
  kind: MemoryKind;
  applicability: MemoryApplicability;
  content: string;
  confidence: number;
  support: "explicit" | "accepted" | "verified";
  sourceIds: readonly string[];
  /** Exact entry IDs corresponding, in citation order, to sourceIds. */
  sourceEntryIds: readonly string[];
  sourceProject: string;
  sourceCutoff: SourceCutoff;
  expiresAt?: string;
  supersedes?: string;
  fingerprint: string;
}

export const AUTOMATIC_MEMORY_TOOLS = ["mempalace_search", "mempalace_check_duplicate", "mempalace_add_drawer", "mempalace_diary_write"] as const;
export type AutomaticMemoryTool = typeof AUTOMATIC_MEMORY_TOOLS[number];

export interface AutomaticMemoryPolicy {
  schemaVersion: 1;
  id: string;
  palace: string;
  /** Stable identity returned by normalizeTrustedProject/mapMemPalaceScope, never an untrusted cwd. */
  trustedProject: string;
  server: string;
  operations: readonly ("search" | "checkpoint")[];
  /** Exact MCP tool names covered by standing authority. */
  tools: readonly AutomaticMemoryTool[];
  eligibleKinds: readonly MemoryKind[];
  revokedAt?: string;
}

export interface PromotionReceipt {
  schemaVersion: 1;
  candidateId: string;
  fingerprint: string;
  target: string;
  outcome: "committed" | "duplicate" | "conflict" | "rejected";
  settledAt: string;
  providerIds: readonly string[];
}

const sensitive = /(?:api[_-]?key|password|passphrase|private[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?(?:token|cookie)|authorization\s*:|proxy-authorization\s*:|cookie\s*:|set-cookie\s*:|bearer\s+[a-z0-9._~+\/-]+|-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----|\bAKIA[0-9A-Z]{16}\b|\bgh[opusr]_[A-Za-z0-9_]{20,}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@]+:[^\s@]+@|\b(?:ssh-rsa|ssh-ed25519)\s+[A-Za-z0-9+/]{32,})/i;
const applicabilityFor: Record<MemoryKind, MemoryApplicability> = {
  preference: "global-preference",
  "reusable-solution": "reusable-solution",
  "project-decision": "project-decision",
  "recovery-point": "recovery-point",
};

export function hasSensitiveContent(value: string): boolean { return sensitive.test(value); }
export function expectedApplicability(kind: MemoryKind): MemoryApplicability { return applicabilityFor[kind]; }
export function estimateTokens(value: string): number { return Math.max(1, Math.ceil(Buffer.byteLength(value, "utf8") / 4)); }
export function hashParts(...parts: readonly string[]): string { return createHash("sha256").update(parts.join("\0")).digest("hex"); }
export function canonicalCandidateFingerprint(value: Pick<AutomaticMemoryCandidate, "kind" | "applicability" | "content" | "sourceProject">): string {
  const content = value.content.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const projectScope = value.kind === "project-decision" || value.kind === "recovery-point"
    ? value.sourceProject.trim().toLocaleLowerCase("en-US")
    : "";
  return hashParts(value.kind, value.applicability, projectScope, content);
}

export function validatePolicy(value: unknown): AutomaticMemoryPolicy {
  if (!isRecord(value) || value.schemaVersion !== 1 || !nonEmpty(value.id, 128) || !nonEmpty(value.palace, 256) || !nonEmpty(value.trustedProject, 512) || !nonEmpty(value.server, 512)) throw new Error("invalid automatic memory policy");
  if (!stringArray(value.operations, ["search", "checkpoint"], 2) || !stringArray(value.tools, AUTOMATIC_MEMORY_TOOLS, 4) || !stringArray(value.eligibleKinds, Object.keys(applicabilityFor), 4)) throw new Error("invalid automatic memory policy operations");
  if (value.operations.length < 1 || value.tools.length < 1 || value.eligibleKinds.length < 1 || [value.operations, value.tools, value.eligibleKinds].some((items) => new Set(items).size !== items.length)) throw new Error("automatic memory policy permissions must be non-empty and unique");
  if (value.revokedAt !== undefined && !validDate(value.revokedAt)) throw new Error("invalid automatic memory policy revocation");
  const requiredTools = (value.operations as string[]).flatMap((operation) => operation === "search"
    ? ["mempalace_search"]
    : ["mempalace_check_duplicate", "mempalace_add_drawer", "mempalace_diary_write"]);
  if (requiredTools.some((tool) => !(value.tools as string[]).includes(tool))) throw new Error("automatic memory policy tool mismatch");
  return Object.freeze({ ...value, operations: Object.freeze([...value.operations]), tools: Object.freeze([...value.tools]), eligibleKinds: Object.freeze([...value.eligibleKinds]) }) as AutomaticMemoryPolicy;
}

export function validateReceipt(value: unknown): PromotionReceipt {
  if (!isRecord(value) || value.schemaVersion !== 1 || !nonEmpty(value.candidateId, 256) || !/^[a-f0-9]{64}$/.test(String(value.fingerprint)) || !nonEmpty(value.target, 512) || !["committed", "duplicate", "conflict", "rejected"].includes(String(value.outcome)) || !validDate(value.settledAt) || !stringArray(value.providerIds, undefined, 32) || !(value.providerIds as string[]).every((id) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))) throw new Error("invalid promotion receipt");
  const allowed = new Set(["schemaVersion", "candidateId", "fingerprint", "target", "outcome", "settledAt", "providerIds"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("promotion receipt must not contain bodies or unknown fields");
  return Object.freeze({ ...value, providerIds: Object.freeze([...value.providerIds]) }) as PromotionReceipt;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmpty(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function validDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function stringArray(value: unknown, allowed?: readonly string[], maximum = 64): value is string[] {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 512 && (!allowed || allowed.includes(item)));
}
