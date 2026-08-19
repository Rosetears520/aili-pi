// Pi Web 0.8.9 adaptation: browser-facing data is intentionally independent
// from private Pi objects and contains only BFF-issued opaque handles.

export const WEB_WORKBENCH_SCHEMA_VERSION = 1 as const;
export const RUNTIME_SNAPSHOT_TYPE = "RuntimeSnapshotV1" as const;
export const RUNTIME_EVENT_TYPE = "RuntimeEventV1" as const;
export const MUTATION_ENVELOPE_TYPE = "MutationEnvelopeV1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "reset-required" | "offline";
export type WriterSurface = "tui" | "web";

export interface WriterProjectionV1 {
  readonly state: "unowned" | "owned" | "recovering";
  readonly owner?: WriterSurface;
  readonly generation?: string;
  readonly activeTurn: boolean;
  readonly denialReason?: string;
}

export interface RuntimeSnapshotV1 {
  readonly schemaVersion: 1;
  readonly type: typeof RUNTIME_SNAPSHOT_TYPE;
  readonly runtimeEpoch: string;
  readonly sessionHandle: string;
  readonly lastSequence: number;
  readonly cursor: string;
  readonly createdAt: string;
  readonly state: "idle" | "running" | "blocked" | "closed";
  readonly writer: WriterProjectionV1;
  readonly capabilities: Readonly<Record<string, boolean>>;
  readonly projection: Readonly<Record<string, JsonValue>>;
}

export interface RuntimeEventV1 {
  readonly schemaVersion: 1;
  readonly type: typeof RUNTIME_EVENT_TYPE;
  readonly runtimeEpoch: string;
  readonly sessionHandle: string;
  readonly sequence: number;
  readonly cursor: string;
  readonly emittedAt: string;
  readonly source: string;
  readonly eventType: "snapshot" | "state" | "message" | "mutation" | "heartbeat" | "reset" | "closed";
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly runId?: string;
  readonly leaseGeneration?: string;
  readonly requestId?: string;
  readonly capability?: string;
}

export interface MutationEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly type: typeof MUTATION_ENVELOPE_TYPE;
  readonly requestId: string;
  readonly clientId: string;
  readonly runtimeEpoch: string;
  readonly leaseGeneration: string;
  readonly sessionHandle: string;
  readonly sessionLeaf: string;
  readonly requestedAt: string;
  readonly capability: string;
  readonly commandType: string;
  readonly arguments: Readonly<Record<string, JsonValue>>;
}

export interface TimelineItemV1 {
  readonly id: string;
  readonly kind: "user" | "assistant" | "tool" | "system" | "event" | "stamp";
  readonly status: "complete" | "running" | "queued" | "failed" | "interrupted";
  readonly title: string;
  readonly body?: string;
  readonly at?: string;
  readonly media?: readonly MediaPreviewV1[];
}

export interface MediaPreviewV1 {
  readonly id: string;
  readonly label: string;
  readonly mimeType: string;
  /** Same-origin BFF URL only. Never a private filesystem URL. */
  readonly url: string;
}

export interface WorkbenchSessionV1 {
  readonly handle: string;
  readonly projectHandle: string;
  readonly name: string;
  readonly summary?: string;
  readonly modifiedAt: string;
  readonly messageCount: number;
  readonly parentHandle?: string;
  readonly branchLabel?: string;
  readonly transient?: boolean;
  readonly running?: boolean;
  readonly actions: Readonly<{
    resume: boolean;
    rename: boolean;
    export: boolean;
    safeDelete: boolean;
    branch: boolean;
    fork: boolean;
  }>;
  readonly timeline: readonly TimelineItemV1[];
}

export interface WorkbenchProjectV1 {
  readonly handle: string;
  readonly label: string;
  readonly sessions: readonly WorkbenchSessionV1[];
}

export interface SelectableModelV1 {
  readonly provider: string;
  readonly modelId: string;
  readonly label: string;
  readonly thinkingLevels: readonly string[];
  readonly imageInput: boolean;
}

export interface CommandResourceV1 {
  readonly handle: string;
  readonly label: string;
  readonly description?: string;
  readonly source: "builtin" | "extension" | "prompt" | "skill";
  readonly enabled: boolean;
}

export interface SkillResourceV1 {
  readonly handle: string;
  readonly label: string;
  readonly description?: string;
  readonly source: "user" | "project" | "path";
  readonly enabled: boolean;
  readonly mutable: boolean;
}

export interface PluginResourceV1 {
  readonly handle: string;
  readonly label: string;
  readonly scope: "global" | "project";
  readonly state: "loaded" | "installed" | "disabled" | "error";
  readonly mutable: boolean;
}

export interface FileResourceV1 {
  readonly handle: string;
  readonly parentHandle?: string;
  readonly label: string;
  readonly kind: "directory" | "text" | "image" | "audio" | "pdf" | "docx" | "binary";
  readonly size?: number;
  readonly gitState?: "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflict";
  readonly preview?: string;
  readonly diff?: string;
  readonly mediaUrl?: string;
}

export interface WorktreeResourceV1 {
  readonly handle: string;
  readonly label: string;
  readonly branch?: string;
  readonly current: boolean;
  readonly main: boolean;
  readonly dirty: boolean;
  readonly removable: boolean;
  readonly denialReason?: string;
}

export interface WorkbenchCatalogV1 {
  readonly schemaVersion: 1;
  /** Runtime client identity is memory-only and is not authentication by itself. */
  readonly clientId: string;
  readonly projects: readonly WorkbenchProjectV1[];
  readonly models: readonly SelectableModelV1[];
  readonly commands: readonly CommandResourceV1[];
  readonly skills: readonly SkillResourceV1[];
  readonly plugins: readonly PluginResourceV1[];
  readonly files: readonly FileResourceV1[];
  readonly worktrees: readonly WorktreeResourceV1[];
  readonly locales: readonly ("en" | "zh-CN")[];
}

export interface AgentTaskProjectionV1 {
  readonly handle: string;
  readonly label: string;
  readonly state: "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";
  readonly summary?: string;
  readonly continuationAllowed: boolean;
}

export interface McpServerProjectionV1 {
  readonly handle: string;
  readonly label: string;
  readonly state: "lazy" | "connecting" | "connected" | "disconnected" | "error";
  readonly lazy: boolean;
  readonly toolCount?: number;
  readonly errorCategory?: string;
}

export interface PiStatusProjectionV1 {
  readonly provider: string | null;
  readonly model: string | null;
  readonly thinkingLevel: string | null;
  readonly contextTokens: number | null;
  readonly contextWindow: number | null;
  readonly connection: ConnectionState;
  readonly activeRun: boolean;
  readonly runLabel?: string;
  readonly leafId: string;
}

export interface WorkbenchProjectionV1 {
  readonly pi: PiStatusProjectionV1;
  readonly agents: readonly AgentTaskProjectionV1[];
  readonly mcpServers: readonly McpServerProjectionV1[];
  readonly analyticsAvailable: boolean;
  readonly stampAvailable: boolean;
  readonly btwAvailable: boolean;
  readonly worktreeAvailable: boolean;
  readonly projectionIssues: readonly string[];
}

export interface RuntimeStatusViewV1 {
  readonly connection: ConnectionState;
  readonly writer: string;
  readonly writable: boolean;
  readonly activeRun: boolean;
  readonly model: string;
  readonly thinking: string;
  readonly context: string;
  readonly agent: string;
  readonly mcp: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_COMMAND = /^[a-z][a-z0-9_.:-]{0,95}$/;
const PROTECTED_KEY = /(?:password|passwd|secret|credential|authorization|cookie|api.?key|access.?token|refresh.?token|environment|\benv\b|mcp.?config|tool.?(?:argument|arguments|result|results|payload)|session.?file|jsonl|private.?path)/i;
const MAX_DEPTH = 20;
const MAX_NODES = 16_384;
const MAX_STRING = 65_536;

export function validateRuntimeSnapshot(value: unknown): RuntimeSnapshotV1 {
  if (!record(value)) throw new Error("invalid RuntimeSnapshotV1");
  const writer = validateWriter(value.writer);
  if (value.schemaVersion !== 1 || value.type !== RUNTIME_SNAPSHOT_TYPE
    || !safeId(value.runtimeEpoch) || !safeId(value.sessionHandle)
    || !Number.isSafeInteger(value.lastSequence) || Number(value.lastSequence) < 0
    || value.cursor !== `${value.runtimeEpoch}:${value.lastSequence}`
    || !isoDate(value.createdAt) || !["idle", "running", "blocked", "closed"].includes(String(value.state))
    || !booleanRecord(value.capabilities) || !record(value.projection)) {
    throw new Error("invalid RuntimeSnapshotV1");
  }
  assertBoundedPublicJson(value.projection);
  return freezeClone({ ...value, writer }) as unknown as RuntimeSnapshotV1;
}

export function validateRuntimeEvent(value: unknown): RuntimeEventV1 {
  if (!record(value) || value.schemaVersion !== 1 || value.type !== RUNTIME_EVENT_TYPE
    || !safeId(value.runtimeEpoch) || !safeId(value.sessionHandle)
    || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1
    || value.cursor !== `${value.runtimeEpoch}:${value.sequence}` || !isoDate(value.emittedAt)
    || !safeId(value.source) || !["snapshot", "state", "message", "mutation", "heartbeat", "reset", "closed"].includes(String(value.eventType))
    || !record(value.payload)) throw new Error("invalid RuntimeEventV1");
  for (const optional of ["runId", "leaseGeneration", "requestId"] as const) {
    if (value[optional] !== undefined && !safeId(value[optional])) throw new Error("invalid RuntimeEventV1");
  }
  if (value.capability !== undefined && (typeof value.capability !== "string" || !SAFE_COMMAND.test(value.capability))) throw new Error("invalid RuntimeEventV1");
  assertBoundedPublicJson(value.payload);
  return freezeClone(value) as unknown as RuntimeEventV1;
}

export function validateWorkbenchCatalog(value: unknown): WorkbenchCatalogV1 {
  if (!record(value) || value.schemaVersion !== 1 || !safeId(value.clientId)
    || !Array.isArray(value.projects) || !Array.isArray(value.models) || !Array.isArray(value.commands)
    || !Array.isArray(value.skills) || !Array.isArray(value.plugins) || !Array.isArray(value.files)
    || !Array.isArray(value.worktrees) || !Array.isArray(value.locales)) throw new Error("invalid WorkbenchCatalogV1");
  assertBoundedPublicJson(value);
  for (const project of value.projects) validateProject(project);
  for (const model of value.models) validateModel(model);
  for (const item of value.commands) validateCommand(item);
  for (const item of value.skills) validateSkill(item);
  for (const item of value.plugins) validatePlugin(item);
  for (const item of value.files) validateFile(item);
  for (const item of value.worktrees) validateWorktree(item);
  if (!value.locales.every((locale) => locale === "en" || locale === "zh-CN")) throw new Error("invalid catalog locale");
  return freezeClone(value) as unknown as WorkbenchCatalogV1;
}

export interface WorkbenchHistoryV1 {
  readonly schemaVersion: 1;
  readonly sessionHandle: string;
  readonly timeline: readonly TimelineItemV1[];
}

export function validateWorkbenchHistory(value: unknown): WorkbenchHistoryV1 {
  if (!record(value) || value.schemaVersion !== 1 || !safeId(value.sessionHandle)
    || !Array.isArray(value.timeline)) throw new Error("invalid WorkbenchHistoryV1");
  assertBoundedPublicJson(value);
  for (const item of value.timeline) validateTimeline(item);
  return freezeClone(value) as unknown as WorkbenchHistoryV1;
}

export function createMutationEnvelope(input: {
  readonly requestId: string;
  readonly clientId: string;
  readonly snapshot: RuntimeSnapshotV1;
  readonly sessionLeaf: string;
  readonly capability: string;
  readonly commandType: string;
  readonly arguments?: Readonly<Record<string, JsonValue>>;
  readonly requestedAt?: string;
}): MutationEnvelopeV1 {
  const generation = input.snapshot.writer.generation;
  if (input.snapshot.writer.state !== "owned" || input.snapshot.writer.owner !== "web" || !generation) throw new Error("Web does not own the session writer lease");
  if (!safeId(input.requestId) || !safeId(input.clientId) || !safeId(input.sessionLeaf)
    || !SAFE_COMMAND.test(input.capability) || !SAFE_COMMAND.test(input.commandType)) throw new Error("invalid mutation identity");
  const args = input.arguments ?? {};
  assertBoundedJson(args);
  return Object.freeze({
    schemaVersion: 1,
    type: MUTATION_ENVELOPE_TYPE,
    requestId: input.requestId,
    clientId: input.clientId,
    runtimeEpoch: input.snapshot.runtimeEpoch,
    leaseGeneration: generation,
    sessionHandle: input.snapshot.sessionHandle,
    sessionLeaf: input.sessionLeaf,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    capability: input.capability,
    commandType: input.commandType,
    arguments: freezeClone(args),
  });
}

export function safeRuntimeId(value: unknown): value is string { return safeId(value); }
export function assertBoundedPublicJson(value: unknown): asserts value is JsonValue { visit(value, 0, { count: 0 }, true); }
export function assertBoundedJson(value: unknown): asserts value is JsonValue { visit(value, 0, { count: 0 }, false); }

function validateWriter(value: unknown): WriterProjectionV1 {
  if (!record(value) || !["unowned", "owned", "recovering"].includes(String(value.state)) || typeof value.activeTurn !== "boolean") throw new Error("invalid writer projection");
  if (value.state === "unowned") {
    if (value.owner !== undefined || value.generation !== undefined || value.activeTurn !== false) throw new Error("invalid unowned writer projection");
  } else if ((value.owner !== "tui" && value.owner !== "web") || !safeId(value.generation)) throw new Error("invalid owned writer projection");
  if (value.denialReason !== undefined && (typeof value.denialReason !== "string" || value.denialReason.length > 160)) throw new Error("invalid writer denial reason");
  return freezeClone(value) as unknown as WriterProjectionV1;
}

function validateProject(value: unknown): void {
  if (!record(value) || !safeId(value.handle) || !boundedText(value.label, 160) || !Array.isArray(value.sessions)) throw new Error("invalid project resource");
  for (const session of value.sessions) {
    if (!record(session) || !safeId(session.handle) || session.projectHandle !== value.handle || !boundedText(session.name, 200)
      || !isoDate(session.modifiedAt) || !Number.isSafeInteger(session.messageCount) || Number(session.messageCount) < 0
      || !record(session.actions) || !Array.isArray(session.timeline)) throw new Error("invalid session resource");
    for (const action of ["resume", "rename", "export", "safeDelete", "branch", "fork"]) if (typeof session.actions[action] !== "boolean") throw new Error("invalid session action");
    if (session.summary !== undefined && !boundedText(session.summary, 2_000)) throw new Error("invalid session summary");
    if (session.branchLabel !== undefined && !boundedText(session.branchLabel, 160)) throw new Error("invalid branch label");
    if (session.transient !== undefined && typeof session.transient !== "boolean") throw new Error("invalid transient state");
    if (session.running !== undefined && typeof session.running !== "boolean") throw new Error("invalid running state");
    if ((session.transient === true || session.running === true) && session.actions.safeDelete === true) throw new Error("unsafe session deletion projection");
    if (session.transient === true && session.actions.export === true) throw new Error("transient session cannot be exported");
    if (session.parentHandle !== undefined && !safeId(session.parentHandle)) throw new Error("invalid parent session handle");
    for (const item of session.timeline) validateTimeline(item);
  }
}
function validateTimeline(value: unknown): void {
  if (!record(value) || !safeId(value.id) || !["user", "assistant", "tool", "system", "event", "stamp"].includes(String(value.kind))
    || !["complete", "running", "queued", "failed", "interrupted"].includes(String(value.status)) || !boundedText(value.title, 300)) throw new Error("invalid timeline item");
  if (value.body !== undefined && !boundedText(value.body, 32_768)) throw new Error("invalid timeline body");
  if (value.at !== undefined && !isoDate(value.at)) throw new Error("invalid timeline timestamp");
  if (value.media !== undefined) {
    if (!Array.isArray(value.media) || value.media.length > 10) throw new Error("invalid timeline media");
    for (const media of value.media) if (!record(media) || !safeId(media.id) || !boundedText(media.label, 200) || !boundedText(media.mimeType, 100) || !trustedBffUrl(media.url)) throw new Error("invalid media preview");
  }
}
function validateModel(value: unknown): void {
  if (!record(value) || !boundedText(value.provider, 128) || !boundedText(value.modelId, 256) || !boundedText(value.label, 256)
    || !Array.isArray(value.thinkingLevels) || !value.thinkingLevels.every((item) => boundedText(item, 32)) || typeof value.imageInput !== "boolean") throw new Error("invalid model resource");
}
function validateCommand(value: unknown): void {
  if (!record(value) || !safeId(value.handle) || !boundedText(value.label, 256)
    || !["builtin", "extension", "prompt", "skill"].includes(String(value.source)) || typeof value.enabled !== "boolean") throw new Error("invalid command resource");
  if (value.description !== undefined && !boundedText(value.description, 2_000)) throw new Error("invalid command description");
}
function validateSkill(value: unknown): void {
  if (!record(value) || !safeId(value.handle) || !boundedText(value.label, 256)
    || !["user", "project", "path"].includes(String(value.source)) || typeof value.enabled !== "boolean" || typeof value.mutable !== "boolean") throw new Error("invalid skill resource");
  if (value.description !== undefined && !boundedText(value.description, 2_000)) throw new Error("invalid skill description");
}
function validatePlugin(value: unknown): void {
  if (!record(value) || !safeId(value.handle) || !boundedText(value.label, 256)
    || !["global", "project"].includes(String(value.scope)) || !["loaded", "installed", "disabled", "error"].includes(String(value.state)) || typeof value.mutable !== "boolean") throw new Error("invalid plugin resource");
}
function validateFile(value: unknown): void {
  if (!record(value) || !safeId(value.handle) || !boundedText(value.label, 256)
    || !["directory", "text", "image", "audio", "pdf", "docx", "binary"].includes(String(value.kind))) throw new Error("invalid file resource");
  if (value.parentHandle !== undefined && !safeId(value.parentHandle)) throw new Error("invalid parent file handle");
  if (value.size !== undefined && (!Number.isSafeInteger(value.size) || Number(value.size) < 0 || Number(value.size) > 1024 * 1024 * 1024)) throw new Error("invalid file size");
  if (value.preview !== undefined && !boundedText(value.preview, 65_536)) throw new Error("invalid file preview");
  if (value.diff !== undefined && !boundedText(value.diff, 65_536)) throw new Error("invalid file diff");
  if (value.mediaUrl !== undefined && !trustedBffUrl(value.mediaUrl)) throw new Error("file media URL bypasses the BFF");
}
function validateWorktree(value: unknown): void {
  if (!record(value) || !safeId(value.handle) || !boundedText(value.label, 256)
    || typeof value.current !== "boolean" || typeof value.main !== "boolean" || typeof value.dirty !== "boolean" || typeof value.removable !== "boolean") throw new Error("invalid Worktree resource");
  if ((value.current || value.main || value.dirty) && value.removable) throw new Error("unsafe Worktree removal projection");
}
function trustedBffUrl(value: unknown): value is string { return typeof value === "string" && value.startsWith("/api/runtime/v1/") && !value.includes("\\") && !value.includes("\0") && !value.includes("//"); }
function safeId(value: unknown): value is string { return typeof value === "string" && SAFE_ID.test(value); }
function boundedText(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length <= maximum && !/[\0\r]/.test(value); }
function isoDate(value: unknown): value is string { return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value)); }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function booleanRecord(value: unknown): boolean { return record(value) && Object.keys(value).length <= 1_024 && Object.entries(value).every(([key, nested]) => SAFE_COMMAND.test(key) && typeof nested === "boolean"); }
function visit(value: unknown, depth: number, budget: { count: number }, publicValue: boolean): void {
  if (++budget.count > MAX_NODES || depth > MAX_DEPTH) throw new Error("workbench value exceeds its bound");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") { if (value.length > MAX_STRING) throw new Error("workbench string exceeds its bound"); return; }
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("workbench value is not finite"); return; }
  if (Array.isArray(value)) { if (value.length > 4_096) throw new Error("workbench array exceeds its bound"); for (const nested of value) visit(nested, depth + 1, budget, publicValue); return; }
  if (!record(value)) throw new Error("workbench value is not JSON");
  const entries = Object.entries(value);
  if (entries.length > 1_024) throw new Error("workbench object exceeds its bound");
  for (const [key, nested] of entries) {
    if (key.length > 128 || (publicValue && PROTECTED_KEY.test(key))) throw new Error("workbench public data contains a protected key");
    visit(nested, depth + 1, budget, publicValue);
  }
}
function freezeClone<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (nested: unknown): void => { if (!nested || typeof nested !== "object" || Object.isFrozen(nested)) return; Object.freeze(nested); for (const item of Object.values(nested)) freeze(item); };
  freeze(clone);
  return clone;
}
