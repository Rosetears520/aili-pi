import { MEMPALACE_PATH, MEMPALACE_VERSION, type MemPalaceScopeMapping } from "../mempalace.js";
import type { SessionMcpServerState, SessionOwnedMcpInvoker } from "../mcp.js";
import {
  canonicalCandidateFingerprint,
  expectedApplicability,
  hasSensitiveContent,
  validatePolicy,
  type AutomaticMemoryCandidate,
  type AutomaticMemoryPolicy,
  type AutomaticMemoryTool,
  type MemoryApplicability,
  type MemoryKind,
  type PromotionReceipt,
} from "./contracts.js";

export type MemPalacePortFailure = "denied" | "unavailable" | "auth-required" | "cancelled" | "invalid-provider-response" | "ambiguous";
export type MemPalacePortResult<T> = { status: "success"; value: T } | { status: MemPalacePortFailure; reason: string };

export interface MemPalaceSearchRequest { query: string; context?: string; maximumResults: number; kinds: readonly MemoryKind[]; }
export interface DurableMemoryRecord {
  id: string; fingerprint: string; kind: MemoryKind; applicability: MemoryApplicability; content: string;
  sourceProject: string; projectIdentity: string; sourceAgent: string; sourceSession: string; confidence: number;
  status: "active" | "superseded" | "conflict"; expiresAt?: string; supersedes?: string;
}
export interface MemPalaceSearchResult { records: readonly DurableMemoryRecord[]; omitted: number; }
export interface MemPalaceCheckpointResult { receipts: readonly PromotionReceipt[]; diaryProviderId?: string; }
export interface DuplicateReconciliation { duplicate: boolean; providerIds: readonly string[]; }
export interface MemPalacePort {
  search(request: MemPalaceSearchRequest, signal?: AbortSignal): Promise<MemPalacePortResult<MemPalaceSearchResult>>;
  checkpoint(candidates: readonly AutomaticMemoryCandidate[], signal?: AbortSignal): Promise<MemPalacePortResult<MemPalaceCheckpointResult>>;
  reconcileDuplicate(candidate: AutomaticMemoryCandidate, signal?: AbortSignal): Promise<MemPalacePortResult<DuplicateReconciliation>>;
}

/** Session-switch-safe delegate. It owns no client and fails closed while unbound. */
export class DelegatingMemPalacePort implements MemPalacePort {
  private target: MemPalacePort | undefined;
  bind(target: MemPalacePort): void { this.target = target; }
  invalidate(): void { this.target = undefined; }
  search(request: MemPalaceSearchRequest, signal?: AbortSignal): Promise<MemPalacePortResult<MemPalaceSearchResult>> {
    return this.target?.search(request, signal) ?? Promise.resolve(failure("unavailable", "MemPalace session port is not bound"));
  }
  checkpoint(candidates: readonly AutomaticMemoryCandidate[], signal?: AbortSignal): Promise<MemPalacePortResult<MemPalaceCheckpointResult>> {
    return this.target?.checkpoint(candidates, signal) ?? Promise.resolve(failure("unavailable", "MemPalace session port is not bound"));
  }
  reconcileDuplicate(candidate: AutomaticMemoryCandidate, signal?: AbortSignal): Promise<MemPalacePortResult<DuplicateReconciliation>> {
    return this.target?.reconcileDuplicate(candidate, signal) ?? Promise.resolve(failure("unavailable", "MemPalace session port is not bound"));
  }
}

/** In-memory, revocable authority. It persists no policy or memory body. */
export class StandingMemoryAuthority {
  private policy: AutomaticMemoryPolicy | undefined;
  constructor(policy?: AutomaticMemoryPolicy) { if (policy) this.policy = validatePolicy(policy); }
  arm(policy: AutomaticMemoryPolicy): void { this.policy = validatePolicy(policy); }
  revoke(at = new Date().toISOString()): void { if (this.policy) this.policy = validatePolicy({ ...this.policy, revokedAt: at }); }
  snapshot(): AutomaticMemoryPolicy | undefined { return this.policy; }
  authorize(input: { palace: string; projectIdentity: string; server: string; operation: "search" | "checkpoint"; tool: AutomaticMemoryTool; kinds: readonly MemoryKind[] }): AutomaticMemoryPolicy {
    const policy = this.policy;
    if (!policy || policy.revokedAt) throw new Error("automatic memory standing authority is absent or revoked");
    if (policy.palace !== input.palace || policy.trustedProject !== input.projectIdentity || policy.server !== input.server) throw new Error("automatic memory standing authority scope mismatch");
    if (!policy.operations.includes(input.operation) || !policy.tools.includes(input.tool)) throw new Error("automatic memory operation is not authorized");
    if (input.kinds.some((kind) => !policy.eligibleKinds.includes(kind))) throw new Error("automatic memory class is not authorized");
    return policy;
  }
}

export interface SessionMemPalacePortOptions {
  invoker: SessionOwnedMcpInvoker; authority: StandingMemoryAuthority; mapping: MemPalaceScopeMapping;
  server: string; agentId: string; sessionId: string; supportsSupersede?: boolean; maximumCandidates?: number;
  /** Explicit Parent-supplied installed-version evidence; absence fails closed. */
  providerVersion?: string;
}

const ENVELOPE_SCHEMA = "aili.observational-memory/v1";
const DUPLICATE_THRESHOLD = 0.98;
const roomForKind: Record<MemoryKind, string> = {
  preference: "preferences", "reusable-solution": "reusable-solutions",
  "project-decision": "project-decisions", "recovery-point": "recovery-points",
};

/** Parent-owned Route B port over the generic tool of the already-installed adapter. */
export class SessionMemPalacePort implements MemPalacePort {
  private readonly maximumCandidates: number;
  constructor(private readonly options: SessionMemPalacePortOptions) {
    this.maximumCandidates = options.maximumCandidates ?? 5;
    if (!Number.isSafeInteger(this.maximumCandidates) || this.maximumCandidates < 1 || this.maximumCandidates > 5) throw new Error("MemPalace candidate bound is invalid");
    if (options.mapping.palace !== MEMPALACE_PATH || !options.server.trim() || !options.agentId.trim() || !options.sessionId.trim()) throw new Error("MemPalace port scope is invalid");
  }

  async search(request: MemPalaceSearchRequest, signal?: AbortSignal): Promise<MemPalacePortResult<MemPalaceSearchResult>> {
    if (!validSearch(request)) return failure("denied", "MemPalace search is unbounded or invalid");
    const denied = this.authorizationFailure("search", "mempalace_search", request.kinds); if (denied) return denied;
    const unavailable = this.providerFailure(signal); if (unavailable) return unavailable;
    try {
      const raw = await this.call("mempalace_search", Object.freeze({ query: request.query.trim(), limit: request.maximumResults, ...(request.context?.trim() ? { context: request.context.trim() } : {}) }), signal);
      return parseSearch(raw, request.maximumResults);
    } catch (error) { return invocationFailure(error, signal); }
  }

  async checkpoint(candidates: readonly AutomaticMemoryCandidate[], signal?: AbortSignal): Promise<MemPalacePortResult<MemPalaceCheckpointResult>> {
    if (candidates.length < 1 || candidates.length > this.maximumCandidates || candidates.some((candidate) => !validCandidateForPort(candidate))) return failure("denied", "MemPalace checkpoint candidate bound or schema is invalid");
    if (candidates.some((candidate) => candidate.supersedes) && this.options.supportsSupersede !== true) return failure("denied", "MemPalace provider has no evidenced non-destructive supersede support");
    const kinds = [...new Set(candidates.map((candidate) => candidate.kind))];
    for (const tool of ["mempalace_check_duplicate", "mempalace_add_drawer", "mempalace_diary_write"] as const) { const denied = this.authorizationFailure("checkpoint", tool, kinds); if (denied) return denied; }
    const unavailable = this.providerFailure(signal); if (unavailable) return unavailable;

    const receipts: PromotionReceipt[] = [];
    const settled: Array<{ candidate: AutomaticMemoryCandidate; providerIds: readonly string[] }> = [];
    let partialFailure: MemPalacePortResult<never> | undefined;
    for (const candidate of candidates) {
      const content = encodeDrawer(candidate, this.options.mapping, this.options.agentId, this.options.sessionId);
      const probe = encodeSemanticProbe(candidate);
      try {
        const duplicateRaw = await this.call("mempalace_check_duplicate", Object.freeze({ content: probe, threshold: DUPLICATE_THRESHOLD }), signal);
        const duplicate = parseDuplicate(duplicateRaw);
        if (duplicate.status !== "success") { partialFailure = duplicate; break; }
        if (duplicate.value.duplicate) {
          receipts.push(makeReceipt(candidate, this.options.mapping, "duplicate", duplicate.value.providerIds));
          settled.push({ candidate, providerIds: duplicate.value.providerIds });
          continue;
        }
        const addRaw = await this.call("mempalace_add_drawer", Object.freeze({ wing: this.options.mapping.wing, room: roomForKind[candidate.kind], content, added_by: this.options.agentId }), signal);
        const added = parseAdd(addRaw);
        if (added.status !== "success") { partialFailure = added; break; }
        receipts.push(makeReceipt(candidate, this.options.mapping, added.value.alreadyExists ? "duplicate" : "committed", [added.value.id]));
        settled.push({ candidate, providerIds: [added.value.id] });
      } catch (error) { partialFailure = invocationFailure(error, signal); break; }
    }

    let diaryProviderId: string | undefined;
    if (settled.length > 0) {
      const entry = buildDiaryEntry(settled);
      try {
        const diaryRaw = await this.call("mempalace_diary_write", Object.freeze({ agent_name: this.options.agentId, entry, topic: "automatic-memory-checkpoint", wing: this.options.mapping.wing }), signal);
        const diary = parseDiary(diaryRaw); if (diary.status === "success") diaryProviderId = diary.value;
      } catch { /* Best effort exactly once; settled drawers are never retried for diary failure. */ }
    }
    if (receipts.length === 0 && partialFailure) return partialFailure;
    // Missing receipts deliberately make the caller reconcile only unsettled candidates.
    return { status: "success", value: Object.freeze({ receipts: Object.freeze(receipts), ...(diaryProviderId ? { diaryProviderId } : {}) }) };
  }

  async reconcileDuplicate(candidate: AutomaticMemoryCandidate, signal?: AbortSignal): Promise<MemPalacePortResult<DuplicateReconciliation>> {
    if (!validCandidateForPort(candidate)) return failure("denied", "MemPalace reconciliation candidate is invalid");
    const kinds = [candidate.kind];
    const denied = this.authorizationFailure("checkpoint", "mempalace_check_duplicate", kinds); if (denied) return denied;
    const probe = encodeSemanticProbe(candidate);
    try {
      const checked = parseDuplicate(await this.call("mempalace_check_duplicate", Object.freeze({ content: probe, threshold: DUPLICATE_THRESHOLD }), signal));
      if (checked.status !== "success") return checked;
      if (checked.value.duplicate) return checked;
      const searched = await this.search({ query: candidate.fingerprint, context: "exact automatic-memory fingerprint reconciliation", maximumResults: 8, kinds }, signal);
      if (searched.status !== "success") return searched;
      const ids = searched.value.records.filter((record) => record.fingerprint === candidate.fingerprint && record.status === "active").map((record) => record.id);
      return { status: "success", value: Object.freeze({ duplicate: ids.length > 0, providerIds: Object.freeze(ids) }) };
    } catch (error) { return invocationFailure(error, signal); }
  }

  private call(tool: AutomaticMemoryTool, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown> {
    return this.options.invoker.invoke({ server: this.options.server, tool, args, ...(signal ? { signal } : {}) });
  }
  private authorizationFailure(operation: "search" | "checkpoint", tool: AutomaticMemoryTool, kinds: readonly MemoryKind[]): MemPalacePortResult<never> | undefined {
    try { this.options.authority.authorize({ palace: this.options.mapping.palace, projectIdentity: this.options.mapping.projectIdentity, server: this.options.server, operation, tool, kinds }); return undefined; }
    catch (error) { return failure("denied", error instanceof Error ? error.message : "automatic memory authority denied"); }
  }
  private providerFailure(signal?: AbortSignal): MemPalacePortResult<never> | undefined {
    if (signal?.aborted) return failure("cancelled", "MemPalace operation was cancelled");
    if (this.options.providerVersion !== MEMPALACE_VERSION) return failure("unavailable", "MemPalace accepted provider version has not been evidenced; live operation is unverified");
    const state = this.options.invoker.serverState(this.options.server);
    if (state === "needs-auth") return failure("auth-required", "MemPalace server requires authentication");
    if (state === "disabled" || state === "failed") return failure("unavailable", "MemPalace server is unavailable");
    return undefined;
  }
}

export type RecalledMemoryUse = "applicable" | "reference-only" | "excluded";
export function classifyRecalledMemory(record: DurableMemoryRecord, currentProjectIdentity: string, currentSessionId: string): RecalledMemoryUse {
  if (record.status !== "active" || (record.expiresAt !== undefined && Date.parse(record.expiresAt) <= Date.now())) return "excluded";
  if (record.applicability === "global-preference") return "applicable";
  if (record.applicability === "reusable-solution" || record.applicability === "project-decision") return record.projectIdentity === currentProjectIdentity ? "applicable" : "reference-only";
  return record.projectIdentity === currentProjectIdentity && record.sourceSession === currentSessionId ? "applicable" : "reference-only";
}

function encodeDrawer(candidate: AutomaticMemoryCandidate, mapping: MemPalaceScopeMapping, agentId: string, sessionId: string): string {
  const sourceProject = /^(?:\/|[A-Za-z]:[\\/])/.test(candidate.sourceProject) ? `project-${candidate.fingerprint.slice(0, 24)}` : candidate.sourceProject;
  const envelope = { schema: ENVELOPE_SCHEMA, fingerprint: candidate.fingerprint, kind: candidate.kind, applicability: candidate.applicability, sourceProject, projectIdentity: mapping.projectIdentity, sourceAgent: agentId, sourceSession: sessionId, confidence: candidate.confidence, status: "active", text: candidate.content, ...(candidate.expiresAt ? { expiresAt: candidate.expiresAt } : {}), ...(candidate.supersedes ? { supersedes: candidate.supersedes } : {}) };
  return canonicalJson(envelope);
}
function encodeSemanticProbe(candidate: AutomaticMemoryCandidate): string {
  const content = candidate.content.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
  return canonicalJson({ schema: "aili.observational-memory-semantic/v1", kind: candidate.kind, applicability: candidate.applicability, content });
}
function buildDiaryEntry(settled: readonly { candidate: AutomaticMemoryCandidate; providerIds: readonly string[] }[]): string {
  const lines = settled.slice(0, 5).map(({ candidate, providerIds }) => {
    const content = candidate.content.normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    return `- [${candidate.kind}] ${content} (drawer ${providerIds[0]})`;
  });
  return `Automatic memory checkpoint settled:\n${lines.join("\n")}`.slice(0, 2_048);
}
function parseSearch(raw: unknown, maximum: number): MemPalacePortResult<MemPalaceSearchResult> {
  if (!isRecord(raw) || typeof raw.query !== "string" || !Object.hasOwn(raw, "filters") || !Number.isSafeInteger(raw.total_before_filter) || Number(raw.total_before_filter) < 0 || !Array.isArray(raw.results) || raw.results.length > maximum) return failure("invalid-provider-response", "MemPalace search response schema is invalid");
  const records: DurableMemoryRecord[] = []; let omitted = 0;
  for (const item of raw.results) { const parsed = parseSearchItem(item); if (parsed) records.push(parsed); else omitted += 1; }
  return { status: "success", value: Object.freeze({ records: Object.freeze(records), omitted }) };
}
function parseSearchItem(value: unknown): DurableMemoryRecord | undefined {
  if (!isRecord(value)) return undefined;
  const id = stableId(value.drawer_id ?? value.id); const content = typeof value.content === "string" ? value.content : undefined;
  if (!id || !content || Buffer.byteLength(content, "utf8") > 8_192) return undefined;
  let envelope: unknown; try { envelope = JSON.parse(content); } catch { return undefined; }
  if (!validEnvelope(envelope)) return undefined;
  return Object.freeze({ id, fingerprint: envelope.fingerprint, kind: envelope.kind, applicability: envelope.applicability, content: envelope.text, sourceProject: envelope.sourceProject, projectIdentity: envelope.projectIdentity, sourceAgent: envelope.sourceAgent, sourceSession: envelope.sourceSession, confidence: envelope.confidence, status: envelope.status, ...(envelope.expiresAt ? { expiresAt: envelope.expiresAt } : {}), ...(envelope.supersedes ? { supersedes: envelope.supersedes } : {}) });
}
function parseDuplicate(raw: unknown): MemPalacePortResult<DuplicateReconciliation> {
  if (isRecord(raw) && raw.vector_disabled === true) return failure("unavailable", "MemPalace duplicate vectors are disabled; a reliable non-match cannot be established");
  if (!isRecord(raw) || typeof raw.is_duplicate !== "boolean" || !Array.isArray(raw.matches) || raw.matches.length > 16) return failure("invalid-provider-response", "MemPalace duplicate response schema is invalid");
  const ids = raw.matches.map((match) => typeof match === "string" ? stableId(match) : isRecord(match) ? stableId(match.drawer_id ?? match.id) : undefined).filter((id): id is string => Boolean(id));
  if (raw.is_duplicate && ids.length === 0) return failure("invalid-provider-response", "MemPalace duplicate response omitted stable IDs");
  return { status: "success", value: Object.freeze({ duplicate: raw.is_duplicate, providerIds: Object.freeze([...new Set(ids)]) }) };
}
function parseAdd(raw: unknown): MemPalacePortResult<{ id: string; alreadyExists: boolean }> {
  if (!isRecord(raw)) return failure("ambiguous", "MemPalace add completion is ambiguous");
  if (raw.success !== true) return failure("ambiguous", typeof raw.reason === "string" ? raw.reason.slice(0, 256) : "MemPalace add completion is ambiguous");
  const id = stableId(raw.drawer_id); if (!id) return failure("invalid-provider-response", "MemPalace add response omitted drawer_id");
  return { status: "success", value: { id, alreadyExists: raw.reason === "already_exists" } };
}
function parseDiary(raw: unknown): MemPalacePortResult<string> {
  if (!isRecord(raw) || raw.success !== true) return failure("unavailable", isRecord(raw) && typeof raw.reason === "string" ? raw.reason.slice(0, 256) : "MemPalace diary write failed");
  const id = stableId(raw.entry_id); return id ? { status: "success", value: id } : failure("invalid-provider-response", "MemPalace diary response omitted entry_id");
}
function makeReceipt(candidate: AutomaticMemoryCandidate, mapping: MemPalaceScopeMapping, outcome: PromotionReceipt["outcome"], providerIds: readonly string[]): PromotionReceipt {
  return Object.freeze({ schemaVersion: 1, candidateId: candidate.id, fingerprint: candidate.fingerprint, target: `${mapping.palace}#${mapping.wing}/${roomForKind[candidate.kind]}`, outcome, settledAt: new Date().toISOString(), providerIds: Object.freeze([...providerIds]) });
}
function validEnvelope(value: unknown): value is { fingerprint: string; kind: MemoryKind; applicability: MemoryApplicability; sourceProject: string; projectIdentity: string; sourceAgent: string; sourceSession: string; confidence: number; status: "active" | "superseded" | "conflict"; text: string; expiresAt?: string; supersedes?: string } {
  if (!isRecord(value) || value.schema !== ENVELOPE_SCHEMA || !/^[a-f0-9]{64}$/.test(String(value.fingerprint)) || !isKind(value.kind) || value.applicability !== expectedApplicability(value.kind) || !nonEmpty(value.sourceProject, 512) || !nonEmpty(value.projectIdentity, 128) || !nonEmpty(value.sourceAgent, 256) || !nonEmpty(value.sourceSession, 256) || typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1 || !["active", "superseded", "conflict"].includes(String(value.status)) || !nonEmpty(value.text, 1_024) || hasSensitiveContent(value.text)) return false;
  if (value.expiresAt !== undefined && (typeof value.expiresAt !== "string" || Number.isNaN(Date.parse(value.expiresAt)))) return false;
  return value.supersedes === undefined || stableId(value.supersedes) !== undefined;
}
function validSearch(request: MemPalaceSearchRequest): boolean { return request.query.trim().length > 0 && request.query.length <= 250 && (!request.context || request.context.length <= 1_024) && Number.isSafeInteger(request.maximumResults) && request.maximumResults >= 1 && request.maximumResults <= 32 && request.kinds.length >= 1 && request.kinds.length <= 4 && request.kinds.every(isKind); }
function validCandidateForPort(value: AutomaticMemoryCandidate): boolean { return value.schemaVersion === 1 && nonEmpty(value.id, 256) && isKind(value.kind) && value.applicability === expectedApplicability(value.kind) && nonEmpty(value.content, 1_024) && !hasSensitiveContent(value.content) && value.sourceIds.length >= 1 && value.sourceIds.length <= 32 && Array.isArray(value.sourceEntryIds) && value.sourceEntryIds.length === value.sourceIds.length && value.sourceEntryIds.every((id) => nonEmpty(id, 256)) && nonEmpty(value.sourceProject, 512) && (value.supersedes === undefined || stableId(value.supersedes) !== undefined) && value.fingerprint === canonicalCandidateFingerprint(value); }
function canonicalJson(value: unknown): string { if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`; }
function stableId(value: unknown): string | undefined { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) ? value : undefined; }
function isKind(value: unknown): value is MemoryKind { return ["preference", "reusable-solution", "project-decision", "recovery-point"].includes(String(value)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmpty(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function failure<T extends MemPalacePortFailure>(status: T, reason: string): { status: T; reason: string } { return { status, reason }; }
function invocationFailure(error: unknown, signal?: AbortSignal): MemPalacePortResult<never> { if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) return failure("cancelled", "MemPalace operation was cancelled"); return failure("unavailable", "MemPalace session invocation failed"); }

/** Test-only Parent-owned harness; it never touches MCP or disk. */
export class FakeSessionMcpInvoker implements SessionOwnedMcpInvoker {
  readonly calls: Array<{ server: string; tool: string; args: Readonly<Record<string, unknown>> }> = [];
  constructor(private state: SessionMcpServerState = "connected", private readonly handler: (input: { server: string; tool: string; args: Readonly<Record<string, unknown>>; signal?: AbortSignal }) => unknown | Promise<unknown> = () => ({ query: "", filters: {}, total_before_filter: 0, results: [] })) {}
  serverState(): SessionMcpServerState { return this.state; }
  setServerState(state: SessionMcpServerState): void { this.state = state; }
  async invoke(input: { server: string; tool: string; args: Readonly<Record<string, unknown>>; signal?: AbortSignal }): Promise<unknown> { if (input.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" }); this.calls.push({ server: input.server, tool: input.tool, args: input.args }); return this.handler(input); }
}
