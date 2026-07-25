import { Type } from "typebox";
import { BUNDLED_ROLE_SELECTORS, type RoleProfile } from "../roles.js";

export type TaskWorkspaceMode = "auto" | "shared" | "isolated";

export interface TaskWriteScope {
  paths: string[];
  resources: string[];
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
}

export interface NormalizedTaskRequest {
  batch: boolean;
  items: NormalizedTaskItem[];
}

const WriteScopeSchema = Type.Object({
  paths: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  resources: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
}, { additionalProperties: false });

const ItemFields = {
  task: Type.String({ minLength: 1 }),
  context: Type.Optional(Type.String()),
  agent: Type.Optional(Type.String({ minLength: 1 })),
  name: Type.Optional(Type.String({ minLength: 1 })),
  model: Type.Optional(Type.String({ minLength: 1 })),
  async: Type.Optional(Type.Boolean({ description: "Set false to wait synchronously or true for background execution. Do not send blocking; blocking is profile-only internal metadata." })),
  tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  workspace: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("shared"), Type.Literal("isolated")])),
  writeScope: Type.Optional(WriteScopeSchema),
  cwd: Type.Optional(Type.String({ minLength: 1 })),
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
  const selector = optionalString(item.agent, `${label}.agent`) ?? "general";
  if (!roleBySelector.has(selector)) {
    throw new Error(`${label}.agent '${selector}' is not canonical; available selectors: ${(BUNDLED_ROLE_SELECTORS as readonly string[]).join(", ")}`);
  }
  if (item.async !== undefined && typeof item.async !== "boolean") throw new Error(`${label}.async must be boolean`);
  const workspace = item.workspace ?? "auto";
  if (workspace !== "auto" && workspace !== "shared" && workspace !== "isolated") throw new Error(`${label}.workspace must be auto, shared, or isolated`);
  const itemContext = item.context;
  if (itemContext !== undefined && typeof itemContext !== "string") throw new Error(`${label}.context must be a string`);
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
    writeScope: normalizeWriteScope(item.writeScope, `${label}.writeScope`),
    cwd: optionalString(item.cwd, `${label}.cwd`),
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
