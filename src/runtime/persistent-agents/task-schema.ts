import { Type } from "typebox";
import { BUNDLED_ROLE_SELECTORS, type RoleProfile } from "../roles.js";

export type TaskWorkspaceMode = "auto" | "shared" | "isolated";

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
  async?: boolean;
  tools?: string[];
  workspace: TaskWorkspaceMode;
  writeScope: TaskWriteScope;
  cwd?: string;
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

const ItemFields = {
  task: Type.String({ minLength: 1 }),
  context: Type.Optional(Type.String()),
  agent: Type.Optional(Type.String({
    minLength: 1,
    description: "Choose an exact Specialized selector from the active task catalog when one routing responsibility matches. Omit only for ordinary general compatibility; formal packages require their exact Specialized Owner.",
  })),
  name: Type.Optional(Type.String({ minLength: 1 })),
  model: Type.Optional(Type.String({ minLength: 1, description: "Prefer exact canonical provider/model form (for example, openai-codex/gpt-5.6-terra). A bare model id resolves only by Parent-provider match or one unambiguous authenticated available catalog match." })),
  async: Type.Optional(Type.Boolean({ description: "Set false to wait synchronously or true for background execution. Do not send blocking; blocking is profile-only internal metadata." })),
  tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  workspace: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("shared"), Type.Literal("isolated")])),
  writeScope: Type.Optional(WriteScopeSchema),
  cwd: Type.Optional(Type.String({ minLength: 1 })),
  formalContext: Type.Optional(FormalContextSchema),
  continuationAudit: Type.Optional(FORMAL_CONTINUATION_AUDIT_SCHEMA),
};

export const TASK_TOOL_SCHEMA = Type.Union([
  Type.Object(ItemFields, { additionalProperties: false }),
  Type.Object({
    context: Type.Optional(Type.String()),
    tasks: Type.Array(Type.Object(ItemFields, { additionalProperties: false }), { minItems: 1 }),
  }, { additionalProperties: false }),
]);

const ITEM_KEYS = new Set(Object.keys(ItemFields));
const BATCH_KEYS = new Set(["context", "tasks"]);

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
): NormalizedTaskItem {
  const label = `task item ${index + 1}`;
  const item = record(raw, label);
  rejectUnknownKeys(item, ITEM_KEYS, label);
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
    model: optionalString(item.model, `${label}.model`),
    async: item.async as boolean | undefined,
    tools: stringArray(item.tools, `${label}.tools`),
    workspace,
    writeScope,
    cwd: optionalString(item.cwd, `${label}.cwd`),
    formalContext,
    continuationAudit,
  };
}

export function validateTaskRequest(raw: unknown, profiles: RoleProfile[]): NormalizedTaskRequest {
  const input = record(raw, "task input");
  const roleBySelector = new Map(profiles.map((profile) => [profile.selector, profile]));
  if (roleBySelector.size !== profiles.length) throw new Error("role catalog contains duplicate selectors");
  const hasBatch = Object.prototype.hasOwnProperty.call(input, "tasks");
  if (hasBatch) {
    rejectUnknownKeys(input, BATCH_KEYS, "batch task input");
    if (Object.prototype.hasOwnProperty.call(input, "task")) throw new Error("task input cannot mix flat task and tasks[]");
    if (input.context !== undefined && typeof input.context !== "string") throw new Error("batch context must be a string");
    if (!Array.isArray(input.tasks) || input.tasks.length === 0) throw new Error("batch tasks must be a non-empty array");
    const sharedContext = typeof input.context === "string" ? input.context : undefined;
    return { batch: true, items: input.tasks.map((item, index) => normalizeItem(item, index, roleBySelector, sharedContext)) };
  }
  return { batch: false, items: [normalizeItem(input, 0, roleBySelector)] };
}
