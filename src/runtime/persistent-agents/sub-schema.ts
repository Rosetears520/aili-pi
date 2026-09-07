import { Type } from "typebox";
import { BUNDLED_ROLE_SELECTORS, type RoleProfile } from "../roles.js";
import { isExternalCliId, type ExternalCliId } from "./model-selection.js";

export type TaskWorkspaceMode = "auto" | "shared" | "isolated";
export const TASK_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type TaskThinking = (typeof TASK_THINKING_LEVELS)[number];

export interface TaskWriteScope {
  paths: string[];
  resources: string[];
}

export interface TaskFormalContext {
  changeId: string;
}

export interface FormalContinuationAudit {
  packageId: string;
  canonicalRole: string;
  scope: string;
  forbiddenScope: string;
  writeScope: TaskWriteScope;
  acceptanceBoundary: string;
  expectedEvidence: string;
}

export interface NormalizedTaskItem {
  task: string;
  context?: string;
  agent: string;
  name?: string;
  model?: string;
  thinking?: TaskThinking;
  /** Optional registered external CLI selected by the Parent; omitted keeps Pi execution. */
  cli?: ExternalCliId;
  /** Optional in-memory confirmation scope for one named task. */
  selectionScope?: string;
  async?: boolean;
  tools?: string[];
  workspace: TaskWorkspaceMode;
  writeScope: TaskWriteScope;
  cwd?: string;
  /** Cosmetic surface hint for backends with split panes (herdr): which
   *  direction the next parallel pane splits. Layout beyond this hint stays
   *  with the user/model via the herdr skill; it never selects a backend. */
  splitHint?: "right" | "down";
  snippets?: string[];
  formalContext?: TaskFormalContext;
  continuationAudit?: FormalContinuationAudit;
}

export interface NormalizedTaskRequest {
  batch: boolean;
  items: NormalizedTaskItem[];
}

export const FORMAL_RUNTIME_LIMITS = Object.freeze({
  packageIdChars: 64,
  canonicalRoleChars: 128,
  auditFieldChars: 2_048,
  writeScopeItems: 64,
  writeScopeItemChars: 300,
  auditBytes: 16_384,
  hubMessageBytes: 16_384,
});

const FORMAL_SINGLE_LINE_PATTERN = "^(?!\\s)[^\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029]*\\S$";

function FormalExactStringSchema(maxLength: number) {
  return Type.String({ minLength: 1, maxLength, pattern: FORMAL_SINGLE_LINE_PATTERN });
}

const WriteScopeSchema = Type.Object({
  paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  resources: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
}, { additionalProperties: false });

const FormalContextSchema = Type.Object({
  changeId: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const FORMAL_CONTINUATION_AUDIT_SCHEMA = Type.Object({
  packageId: Type.String({ minLength: 1, maxLength: FORMAL_RUNTIME_LIMITS.packageIdChars, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }),
  canonicalRole: FormalExactStringSchema(FORMAL_RUNTIME_LIMITS.canonicalRoleChars),
  scope: FormalExactStringSchema(FORMAL_RUNTIME_LIMITS.auditFieldChars),
  forbiddenScope: FormalExactStringSchema(FORMAL_RUNTIME_LIMITS.auditFieldChars),
  writeScope: Type.Object({
    paths: Type.Array(FormalExactStringSchema(FORMAL_RUNTIME_LIMITS.writeScopeItemChars), { maxItems: FORMAL_RUNTIME_LIMITS.writeScopeItems }),
    resources: Type.Array(FormalExactStringSchema(FORMAL_RUNTIME_LIMITS.writeScopeItemChars), { maxItems: FORMAL_RUNTIME_LIMITS.writeScopeItems }),
  }, { additionalProperties: false }),
  acceptanceBoundary: FormalExactStringSchema(FORMAL_RUNTIME_LIMITS.auditFieldChars),
  expectedEvidence: FormalExactStringSchema(FORMAL_RUNTIME_LIMITS.auditFieldChars),
}, { additionalProperties: false });

const SUB_THINKING_SCHEMA = Type.Union([
  Type.Literal("off"),
  Type.Literal("minimal"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("xhigh"),
  Type.Literal("max"),
], {
  description: "Optional per-turn thinking candidate. For an external CLI, omit it to preserve the vendor default unless the Parent has an exact candidate for runtime confirmation, and never invent it autonomously. It bypasses the Pi catalog and is a separate vendor-native choice: never concatenate it with model or infer it from a model-name suffix. The runtime must discover and obey a unique thinking/reasoning/effort option and its value syntax from the selected installed CLI's frozen --help; ambiguous or enumerated-unsupported values fail. Model-facing values are untrusted until the fixed runtime-owned selection questionnaire confirms them.",
});

const FormalItemFields = {
  task: Type.String({ minLength: 1 }),
  context: Type.Optional(Type.String()),
  agent: Type.Optional(Type.String({
    minLength: 1,
    description: "Choose an exact Specialized selector from the active task catalog when one routing responsibility matches. Omit only for ordinary general compatibility; formal packages require their exact Specialized Owner.",
  })),
  name: Type.Optional(Type.String({ minLength: 1 })),
  model: Type.Optional(Type.String({
    minLength: 1,
    description: "Optional per-turn provider/model candidate. Omitted by default; it inherits the current parent resolution. Model-facing values are untrusted until the fixed runtime-owned selection questionnaire confirms them. An explicit request that cannot be resolved or authorized fails the whole call instead of falling back.",
  })),
  thinking: Type.Optional(SUB_THINKING_SCHEMA),
  async: Type.Optional(Type.Boolean({ description: "Set false to wait synchronously or true for background execution. Do not send blocking; blocking is profile-only internal metadata." })),
  tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  workspace: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("shared"), Type.Literal("isolated")])),
  writeScope: Type.Optional(WriteScopeSchema),
  cwd: Type.Optional(Type.String({ minLength: 1 })),
  split: Type.Optional(Type.Union([Type.Literal("right"), Type.Literal("down")])),
  selectionScope: Type.Optional(Type.String({
    minLength: 1,
    maxLength: 200,
    pattern: FORMAL_SINGLE_LINE_PATTERN,
    description: "Optional named one-line task scope for reusing one confirmed choice within the current Parent session and project.",
  })),
};

/**
 * The complete model-facing `sub` surface. Calling it without task_id creates
 * a new Child Session and immediately executes one turn; calling it with
 * task_id reopens the existing Child Session and executes the next turn.
 * There is no public batch form. Calls run foreground by default; top-level
 * background:true returns immediately and is coordinated through hub. Parallel
 * foreground work remains several sub calls in the same assistant message.
 */
export const SUB_TOOL_SCHEMA = Type.Object({
  description: Type.String({
    minLength: 1,
    maxLength: 500,
    description: "Short human-facing summary of this delegation turn.",
  }),
  prompt: Type.String({
    minLength: 1,
    description: "The full task text for this turn. On a new task_id this becomes the child's assignment; with task_id it becomes the next user message in the same child session.",
  }),
  subagent_type: Type.Optional(Type.String({
    minLength: 1,
    description: "Exact role selector for the child (required for a new task; when continuing, omit it or repeat the exact original selector).",
  })),
  task_id: Type.Optional(Type.String({
    minLength: 1,
    maxLength: 160,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$",
    description: "Continue an existing child session. The previous turn must already be settled; a still-running task_id returns SUB_BUSY.",
  })),
  background: Type.Optional(Type.Boolean({
    description: "Run this top-level child turn in the background and return task_id immediately. Coordinate it with hub; nested background remains forbidden.",
  })),
  model: Type.Optional(Type.String({
    minLength: 1,
    description: "Optional per-turn model candidate. For ordinary Pi use a canonical provider/model, bare id, or unambiguous catalog alias. For an external CLI, omit model to preserve the vendor default unless the Parent has an exact candidate to present for runtime confirmation; never invent it autonomously. If supplied, inspect that installed CLI's --help and use its exposed read-only model-list/catalog capability when available; pass one exact vendor-listed ID unchanged. Never silently fix spelling, invent a base model, strip suffixes such as -high, or infer thinking from the ID. If absent, ambiguous, or unverified, ask the user or omit model for the vendor default. thinking remains separate. The runtime uses frozen help only for unique option-name/value syntax. Explicit requests are strict and never fall back.",
  })),
  thinking: Type.Optional(SUB_THINKING_SCHEMA),
  cli: Type.Optional(Type.Union([
    Type.Literal("claude-code"), Type.Literal("codex-cli"), Type.Literal("opencode"), Type.Literal("grok-cli"), Type.Literal("agy-cli"),
  ], { description: "Optional external CLI candidate for this turn. The runtime-owned selection questionnaire confirms the exact registered product before allocation; omitted stays Pi. Omit model and thinking to preserve vendor defaults unless the Parent has exact candidates for runtime confirmation; missing fields preserve vendor defaults and are never invented. If model is supplied, inspect the installed CLI's --help and its read-only model catalog/list when exposed; use one exact listed ID unchanged, or ask/omit when unverified. Supplied thinking is separate. Runtime frozen-help parsing governs option syntax only; never supply arbitrary runner flags." })),
  selectionScope: Type.Optional(Type.String({
    minLength: 1,
    maxLength: 200,
    pattern: FORMAL_SINGLE_LINE_PATTERN,
    description: "Optional named one-line task scope (1-200 characters). A confirmed choice may be reused only within this exact Parent session/project/scope and exact cli/model/thinking fields; omitted applies only to this call.",
  })),
  snippets: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 16, description: "Trusted one-turn prompt modifier IDs; validated against surface and role scope before child startup." })),
  split: Type.Optional(Type.Union([Type.Literal("right"), Type.Literal("down")], {
    description: "Cosmetic herdr-surface hint: direction for the next parallel pane split inside the AILI tab. Ignored on the managed backend and by sequential reuse; finer layout control belongs to the herdr skill.",
  })),
}, { additionalProperties: false });

// Formal identity fields are internal: the model-facing surface dispatches
// formal packages through the dedicated formal_task adapter, and only trusted
// internal callers (that adapter, nested formal children, the ROSE planner)
// may submit requests carrying them.
const FORMAL_ITEM_FIELDS = {
  ...FormalItemFields,
  formalContext: Type.Optional(FormalContextSchema),
  continuationAudit: Type.Optional(FORMAL_CONTINUATION_AUDIT_SCHEMA),
};

export const FORMAL_TASK_REQUEST_SCHEMA = Type.Union([
  Type.Object(FORMAL_ITEM_FIELDS, { additionalProperties: false }),
  Type.Object({
    context: Type.Optional(Type.String()),
    tasks: Type.Array(Type.Object(FORMAL_ITEM_FIELDS, { additionalProperties: false }), { minItems: 1 }),
  }, { additionalProperties: false }),
]);

const SUB_ITEM_KEYS = new Set(["description", "prompt", "subagent_type", "task_id", "background", "model", "thinking", "cli", "selectionScope", "snippets", "split"]);
const FORMAL_ITEM_KEYS = new Set(Object.keys(FORMAL_ITEM_FIELDS));
const FORMAL_BATCH_KEYS = new Set(["context", "tasks"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(", ")}`);
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalModel(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value || value !== value.trim() || /[\s\0\r\n]/.test(value)) {
    throw new Error(`${label} must be one exact model identifier without surrounding or internal whitespace`);
  }
  return value;
}

function optionalThinking(value: unknown, label: string): TaskThinking | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(TASK_THINKING_LEVELS as readonly string[]).includes(value)) {
    throw new Error(`${label} must be one of: ${TASK_THINKING_LEVELS.join(", ")}`);
  }
  return value as TaskThinking;
}

function optionalSelectionScope(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value !== value.trim()
    || /[\u0000-\u001F\u007F-\u009F\u2028\u2029\r\n]/.test(value)) {
    throw new Error(`${label} must be a non-empty single-line string of at most 200 characters`);
  }
  return value;
}

function optionalCli(value: unknown, label: string): ExternalCliId | undefined {
  if (value === undefined) return undefined;
  if (!isExternalCliId(value)) throw new Error(`${label} must be one of: claude-code, codex-cli, opencode, grok-cli, agy-cli`);
  return value;
}

function stringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${label} must be an array of non-empty strings`);
  const normalized = value.map((item) => (item as string).trim());
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicates`);
  return normalized;
}

function normalizeWriteScope(value: unknown, label: string): TaskWriteScope {
  if (value === undefined) return { paths: [], resources: [] };
  const scope = record(value, label);
  rejectUnknownKeys(scope, new Set(["paths", "resources"]), label);
  return {
    paths: stringArray(scope.paths, `${label}.paths`) ?? [],
    resources: stringArray(scope.resources, `${label}.resources`) ?? [],
  };
}

function normalizeFormalContext(value: unknown, label: string): TaskFormalContext | undefined {
  if (value === undefined) return undefined;
  const formalContext = record(value, label);
  rejectUnknownKeys(formalContext, new Set(["changeId"]), label);
  if (typeof formalContext.changeId !== "string"
    || formalContext.changeId.length === 0
    || formalContext.changeId !== formalContext.changeId.trim()) {
    throw new Error(`${label}.changeId must be an exact non-empty string`);
  }
  return { changeId: formalContext.changeId };
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be an exact non-empty string`);
  }
  return value;
}

function exactFormalString(value: unknown, label: string, maxLength: number): string {
  const normalized = exactString(value, label);
  if (normalized.length > maxLength) throw new Error(`${label} exceeds ${maxLength} characters`);
  if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(normalized)) {
    throw new Error(`${label} must be a single line without control characters`);
  }
  return normalized;
}

function formalStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of non-empty strings`);
  if (value.length > FORMAL_RUNTIME_LIMITS.writeScopeItems) {
    throw new Error(`${label} exceeds ${FORMAL_RUNTIME_LIMITS.writeScopeItems} items`);
  }
  const normalized = value.map((item, index) => exactFormalString(
    item,
    `${label}[${index}]`,
    FORMAL_RUNTIME_LIMITS.writeScopeItemChars,
  ));
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicates`);
  return normalized;
}

export function normalizeFormalContinuationAudit(value: unknown, label = "continuationAudit"): FormalContinuationAudit {
  const audit = record(value, label);
  rejectUnknownKeys(audit, new Set([
    "packageId",
    "canonicalRole",
    "scope",
    "forbiddenScope",
    "writeScope",
    "acceptanceBoundary",
    "expectedEvidence",
  ]), label);
  const writeScope = record(audit.writeScope, `${label}.writeScope`);
  rejectUnknownKeys(writeScope, new Set(["paths", "resources"]), `${label}.writeScope`);
  const packageId = exactFormalString(audit.packageId, `${label}.packageId`, FORMAL_RUNTIME_LIMITS.packageIdChars);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(packageId)) {
    throw new Error(`${label}.packageId is unsafe`);
  }
  const normalized: FormalContinuationAudit = {
    packageId,
    canonicalRole: exactFormalString(audit.canonicalRole, `${label}.canonicalRole`, FORMAL_RUNTIME_LIMITS.canonicalRoleChars),
    scope: exactFormalString(audit.scope, `${label}.scope`, FORMAL_RUNTIME_LIMITS.auditFieldChars),
    forbiddenScope: exactFormalString(audit.forbiddenScope, `${label}.forbiddenScope`, FORMAL_RUNTIME_LIMITS.auditFieldChars),
    writeScope: {
      paths: formalStringArray(writeScope.paths, `${label}.writeScope.paths`),
      resources: formalStringArray(writeScope.resources, `${label}.writeScope.resources`),
    },
    acceptanceBoundary: exactFormalString(audit.acceptanceBoundary, `${label}.acceptanceBoundary`, FORMAL_RUNTIME_LIMITS.auditFieldChars),
    expectedEvidence: exactFormalString(audit.expectedEvidence, `${label}.expectedEvidence`, FORMAL_RUNTIME_LIMITS.auditFieldChars),
  };
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > FORMAL_RUNTIME_LIMITS.auditBytes) {
    throw new Error(`${label} exceeds ${FORMAL_RUNTIME_LIMITS.auditBytes} UTF-8 bytes`);
  }
  return normalized;
}

export function sameFormalContinuationAudit(left: FormalContinuationAudit, right: FormalContinuationAudit): boolean {
  return left.packageId === right.packageId
    && left.canonicalRole === right.canonicalRole
    && left.scope === right.scope
    && left.forbiddenScope === right.forbiddenScope
    && left.acceptanceBoundary === right.acceptanceBoundary
    && left.expectedEvidence === right.expectedEvidence
    && left.writeScope.paths.length === right.writeScope.paths.length
    && left.writeScope.paths.every((value, index) => value === right.writeScope.paths[index])
    && left.writeScope.resources.length === right.writeScope.resources.length
    && left.writeScope.resources.every((value, index) => value === right.writeScope.resources[index]);
}

function normalizeItem(
  raw: unknown,
  index: number,
  roleBySelector: Map<string, RoleProfile>,
  sharedContext?: string,
  allowedKeys: Set<string> = FORMAL_ITEM_KEYS,
): NormalizedTaskItem {
  const label = `task item ${index + 1}`;
  const item = record(raw, label);
  rejectUnknownKeys(item, allowedKeys, label);
  const task = optionalString(item.task, `${label}.task`);
  if (!task) throw new Error(`${label}.task is required`);
  const hasExplicitAgent = Object.prototype.hasOwnProperty.call(item, "agent");
  const selector = optionalString(item.agent, `${label}.agent`) ?? "general";
  if (!roleBySelector.has(selector)) {
    throw new Error(`${label}.agent '${selector}' is not canonical; available selectors: ${(BUNDLED_ROLE_SELECTORS as readonly string[]).join(", ")}`);
  }
  if (item.async !== undefined && typeof item.async !== "boolean") throw new Error(`${label}.async must be boolean`);
  const workspace = item.workspace ?? "auto";
  if (workspace !== "auto" && workspace !== "shared" && workspace !== "isolated") throw new Error(`${label}.workspace must be auto, shared, or isolated`);
  const itemContext = item.context;
  if (itemContext !== undefined && typeof itemContext !== "string") throw new Error(`${label}.context must be a string`);
  const formalContext = normalizeFormalContext(item.formalContext, `${label}.formalContext`);
  const continuationAudit = item.continuationAudit === undefined
    ? undefined
    : normalizeFormalContinuationAudit(item.continuationAudit, `${label}.continuationAudit`);
  if (formalContext && (!hasExplicitAgent || item.agent !== selector || selector === "general")) {
    throw new Error(`${label}.formalContext requires an explicit Specialized agent selector provided as the exact agent value`);
  }
  if (formalContext && typeof item.async !== "boolean") {
    throw new Error(`${label}.formalContext requires an explicit boolean async value`);
  }
  if (formalContext && !continuationAudit) {
    throw new Error(`${label}.formalContext requires an exact continuationAudit sibling; create a new bounded job/Agent when identity is unavailable`);
  }
  if (!formalContext && continuationAudit) {
    throw new Error(`${label}.continuationAudit requires formalContext`);
  }
  const writeScope = normalizeWriteScope(item.writeScope, `${label}.writeScope`);
  const splitHint = item.split === "right" || item.split === "down" ? item.split : undefined;
  if (item.split !== undefined && splitHint === undefined) throw new Error(`${label}.split must be exactly right or down`);
  if (continuationAudit && continuationAudit.canonicalRole !== selector) {
    throw new Error(`${label}.continuationAudit.canonicalRole must equal the exact canonical agent selector`);
  }
  if (continuationAudit && !sameFormalContinuationAudit(
    continuationAudit,
    { ...continuationAudit, writeScope },
  )) {
    throw new Error(`${label}.continuationAudit.writeScope must equal the normalized task writeScope`);
  }
  const contextParts = [sharedContext, itemContext as string | undefined].filter((part): part is string => Boolean(part?.trim()));
  return {
    task,
    context: contextParts.length > 0 ? contextParts.join("\n\n") : undefined,
    agent: selector,
    name: optionalString(item.name, `${label}.name`),
    model: optionalModel(item.model, `${label}.model`),
    thinking: optionalThinking(item.thinking, `${label}.thinking`),
    ...(item.selectionScope === undefined ? {} : { selectionScope: optionalSelectionScope(item.selectionScope, `${label}.selectionScope`) }),
    async: item.async as boolean | undefined,
    tools: stringArray(item.tools, `${label}.tools`),
    workspace,
    writeScope,
    cwd: optionalString(item.cwd, `${label}.cwd`),
    ...(splitHint === undefined ? {} : { splitHint }),
    formalContext,
    continuationAudit,
  };
}

/** Trusted-internal validation for formal dispatch adapters: allows the
 *  formalContext/continuationAudit identity fields the public sub schema
 *  never exposes to the model. */
export function validateFormalTaskRequest(raw: unknown, profiles: RoleProfile[]): NormalizedTaskRequest {
  const input = record(raw, "formal task input");
  const roleBySelector = new Map(profiles.map((profile) => [profile.selector, profile]));
  if (roleBySelector.size !== profiles.length) throw new Error("role catalog contains duplicate selectors");
  const hasBatch = Object.prototype.hasOwnProperty.call(input, "tasks");
  if (hasBatch) {
    rejectUnknownKeys(input, FORMAL_BATCH_KEYS, "batch formal task input");
    if (input.context !== undefined && typeof input.context !== "string") throw new Error("batch context must be a string");
    if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new Error("batch tasks must be a non-empty array");
    const sharedContext = typeof input.context === "string" ? input.context : undefined;
    return { batch: true, items: input.tasks.map((item, index) => normalizeItem(item, index, roleBySelector, sharedContext, FORMAL_ITEM_KEYS)) };
  }
  return { batch: false, items: [normalizeItem(input, 0, roleBySelector, undefined, FORMAL_ITEM_KEYS)] };
}

export interface SubRequestParse {
  /** Human-facing turn summary (also used as the child display name on creation). */
  description: string;
  /** Internal normalized item: prompt→task, subagent_type→agent. */
  item: NormalizedTaskItem;
  /** Present when this call continues an existing Child Session. */
  taskId?: string;
}

/** Validate the model-facing `sub` call: one turn, foreground by default,
 *  optional top-level background, no batch or backend selector. */
export function validateSubRequest(raw: unknown, profiles: RoleProfile[]): SubRequestParse {
  const input = record(raw, "sub input");
  if (Object.prototype.hasOwnProperty.call(input, "backend")) {
    // Backend selection changes security, recovery, and process semantics;
    // it is user-only and must stay outside the model-facing surface.
    throw new Error("sub.backend is not a model-facing field: the execution backend is user-only (settings or /aili-agent-backend)");
  }
  rejectUnknownKeys(input, SUB_ITEM_KEYS, "sub input");
  const description = optionalString(input.description, "sub.description");
  if (!description) throw new Error("sub.description is required");
  if (description.length > 500) throw new Error("sub.description must be at most 500 characters");
  const prompt = optionalString(input.prompt, "sub.prompt");
  if (!prompt) throw new Error("sub.prompt is required");
  const roleBySelector = new Map(profiles.map((profile) => [profile.selector, profile]));
  if (roleBySelector.size !== profiles.length) throw new Error("role catalog contains duplicate selectors");
  const hasSelector = Object.prototype.hasOwnProperty.call(input, "subagent_type");
  const selector = optionalString(input.subagent_type, "sub.subagent_type") ?? "general";
  if (!roleBySelector.has(selector)) {
    throw new Error(`sub.subagent_type '${selector}' is not canonical; available selectors: ${(BUNDLED_ROLE_SELECTORS as readonly string[]).join(", ")}`);
  }
  const taskId = optionalString(input.task_id, "sub.task_id");
  if (taskId === undefined && !hasSelector) {
    // A new Child Session requires an explicit routing decision; continuation
    // may omit the selector because the Child Session identity already owns it.
    throw new Error("sub.subagent_type is required when creating a new task (omit it only when continuing with task_id)");
  }
  if (taskId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(taskId)) {
    throw new Error("sub.task_id is not a safe task identity");
  }
  if (input.background !== undefined && typeof input.background !== "boolean") throw new Error("sub.background must be a boolean");
  const model = optionalModel(input.model, "sub.model");
  const thinking = optionalThinking(input.thinking, "sub.thinking");
  const cli = optionalCli(input.cli, "sub.cli");
  const selectionScope = optionalSelectionScope(input.selectionScope, "sub.selectionScope");
  const snippets = stringArray(input.snippets, "sub.snippets");
  const split = input.split === "right" || input.split === "down" ? input.split : undefined;
  if (input.split !== undefined && split === undefined) throw new Error("sub.split must be exactly right or down");
  return {
    description,
    item: {
      task: prompt,
      agent: selector,
      name: description,
      model,
      thinking,
      ...(cli === undefined ? {} : { cli }),
      ...(selectionScope === undefined ? {} : { selectionScope }),
      async: input.background === undefined ? undefined : input.background,
      workspace: "auto",
      writeScope: { paths: [], resources: [] },
      ...(snippets === undefined ? {} : { snippets }),
      ...(split === undefined ? {} : { splitHint: split }),
    },
    ...(taskId === undefined ? {} : { taskId }),
  };
}
