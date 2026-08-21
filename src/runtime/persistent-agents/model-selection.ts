import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { BUNDLED_ROLE_SELECTORS } from "../roles.js";
import type { CoordinatorJournal } from "./storage.js";
import { assertNoCredentialMaterial } from "./permission.js";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

export type ModelLayer = "direct-user-turn" | "one-shot" | "instance" | "project-role" | "user-role" | "profile" | "parent-fallback" | "runtime-fallback";
/** Compatibility source retained for existing audit consumers. */
export type ModelSource = "direct-user-turn" | "confirmed-one-shot" | "user-one-shot" | "instance-override" | "project-role-override" | "user-role-override" | "inherited-parent" | "profile-fallback" | "runtime-fallback";
export type ModelChoiceSource = "direct-user-turn" | "user-one-shot" | "confirmed-one-shot" | "instance-override" | "project-role-override" | "user-role-override" | "inherited-parent" | "profile-fallback" | "runtime-fallback";
export type ThinkingSource = ModelChoiceSource | "model-default";
export type ModelThinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type SpeedTier = "standard" | "priority";

/** Structured outcome of a model/thinking request at any dispatch boundary. */
export interface SubagentModelDecision {
  requestedModel: string | null;
  requestedThinking: ModelThinking | null;
  overrideDecision:
    | "accepted-direct-user"
    | "accepted-delegated-choice"
    | "confirmed-model-proposal"
    | "auto-approved-bypass"
    | "rejected-unauthorized"
    | "rejected-unsupported"
    | "inherited";
  reason?: string;
}

export interface ModelOverride {
  model: string;
  thinking?: ModelThinking;
}

export interface ModelOverrideConfig {
  schemaVersion: 1;
  roles: Record<string, ModelOverride>;
  metadata?: Record<string, unknown>;
}

export interface LoadedModelConfigs {
  global: ModelOverrideConfig;
  project?: ModelOverrideConfig;
  diagnostics: string[];
  globalBytes: string;
  projectBytes?: string;
}

export const MODEL_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const THINKING = new Set<ModelThinking>(MODEL_THINKING_LEVELS);
const SELECTORS = new Set<string>(BUNDLED_ROLE_SELECTORS as readonly string[]);

export function defaultGlobalModelConfigPath(home = homedir()): string {
  return join(home, ".pi", "agent", "aili", "model-overrides.json");
}

export function defaultProjectModelConfigPath(projectRoot: string): string {
  return resolve(projectRoot, ".pi", "aili", "model-overrides.json");
}

function emptyConfig(): ModelOverrideConfig {
  return { schemaVersion: 1, roles: {} };
}

export function validateModelIdentifier(model: string): { provider: string; model: string; canonical: string } {
  const normalized = model.trim();
  const slash = normalized.indexOf("/");
  if (slash <= 0 || slash === normalized.length - 1 || /[\s\0\r\n]/.test(normalized)) {
    throw new Error(`model must use canonical provider/model form (provider/model): ${model}`);
  }
  return { provider: normalized.slice(0, slash), model: normalized.slice(slash + 1), canonical: normalized };
}

function validateBareModelIdentifier(model: string): string {
  const normalized = model.trim();
  if (!normalized || normalized.includes("/") || /[\s\0\r\n]/.test(normalized)) {
    throw new Error(`bare model must be one exact model id without provider or whitespace: ${model}`);
  }
  return normalized;
}

function validateOverride(value: unknown, label: string): ModelOverride {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => key !== "model" && key !== "thinking");
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(", ")}`);
  if (typeof record.model !== "string") throw new Error(`${label}.model is required`);
  const model = validateModelIdentifier(record.model).canonical;
  if (record.thinking !== undefined && !THINKING.has(record.thinking as ModelThinking)) throw new Error(`${label}.thinking is invalid`);
  return { model, thinking: record.thinking as ModelThinking | undefined };
}

export function parseModelOverrideConfig(bytes: string, scope: string): ModelOverrideConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(bytes);
  } catch (error) {
    throw new Error(`${scope} model config is malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${scope} model config must be an object`);
  const record = raw as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !["schemaVersion", "roles", "metadata"].includes(key));
  if (unknown.length > 0) throw new Error(`${scope} model config contains unknown fields: ${unknown.join(", ")}`);
  if (record.schemaVersion !== 1) throw new Error(`${scope} model config schemaVersion must be 1`);
  if (!record.roles || typeof record.roles !== "object" || Array.isArray(record.roles)) throw new Error(`${scope} model config roles must be an object`);
  const roles: Record<string, ModelOverride> = {};
  for (const [selector, value] of Object.entries(record.roles as Record<string, unknown>)) {
    if (!SELECTORS.has(selector)) throw new Error(`${scope} model config has unknown selector: ${selector}`);
    roles[selector] = validateOverride(value, `${scope}.roles.${selector}`);
  }
  if (record.metadata !== undefined && (!record.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata))) throw new Error(`${scope} model config metadata must be an object`);
  return { schemaVersion: 1, roles, metadata: record.metadata as Record<string, unknown> | undefined };
}

async function readConfig(path: string, scope: string): Promise<{ config: ModelOverrideConfig; bytes: string }> {
  try {
    const bytes = await readFile(path, "utf8");
    return { config: parseModelOverrideConfig(bytes, scope), bytes };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config: emptyConfig(), bytes: "" };
    throw error;
  }
}

export interface ModelConfigStoreOptions {
  globalPath: string;
  projectPath: string;
  beforeRename?: (scope: "global" | "project", temporaryPath: string, targetPath: string) => void | Promise<void>;
}

export class ModelConfigStore {
  constructor(private readonly options: ModelConfigStoreOptions) {}

  async load(projectTrusted: boolean): Promise<LoadedModelConfigs> {
    const global = await readConfig(this.options.globalPath, "global");
    if (!projectTrusted) {
      return {
        global: global.config,
        diagnostics: ["project model config ignored because project trust is inactive"],
        globalBytes: global.bytes,
      };
    }
    const project = await readConfig(this.options.projectPath, "project");
    return {
      global: global.config,
      project: project.config,
      diagnostics: [],
      globalBytes: global.bytes,
      projectBytes: project.bytes,
    };
  }

  async setRole(scope: "global" | "project", selector: string, override: ModelOverride | undefined, projectTrusted: boolean): Promise<ModelOverrideConfig> {
    if (!SELECTORS.has(selector)) throw new Error(`unknown bundled selector: ${selector}`);
    if (scope === "project" && !projectTrusted) throw new Error("project model config write requires active project trust");
    if (override) {
      await assertNoCredentialMaterial(override, "model override");
      validateOverride(override, "model override");
    }
    const path = scope === "global" ? this.options.globalPath : this.options.projectPath;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const lockPath = `${path}.lock`;
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      throw new Error(`${scope} model config lock unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
    let temporary: string | undefined;
    try {
      const loaded = await readConfig(path, scope);
      const next: ModelOverrideConfig = {
        ...loaded.config,
        roles: { ...loaded.config.roles },
      };
      if (override) next.roles[selector] = validateOverride(override, "model override");
      else delete next.roles[selector];
      temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.options.beforeRename?.(scope, temporary, path);
      await rename(temporary, path);
      temporary = undefined;
      return next;
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => undefined);
      await lock.close().catch(() => undefined);
      await rm(lockPath, { force: true }).catch(() => undefined);
    }
  }
}

export interface CatalogModel {
  provider: string;
  model: string;
  available: boolean;
  authenticated: boolean;
  thinkingLevels?: readonly ModelThinking[];
  /** Catalog-advertised preferred thinking level for this model, when known. */
  defaultThinking?: ModelThinking;
  /** Compatibility aliases used by catalog adapters. */
  thinkingDefault?: ModelThinking;
  supportedDefaultThinking?: ModelThinking;
  defaultThinkingLevel?: ModelThinking;
}

export interface ModelCatalog {
  resolve(model: string): Promise<CatalogModel | undefined>;
  resolveParentFallback(): Promise<CatalogModel | undefined>;
  resolveProfileFallback?(selector: string): Promise<CatalogModel | undefined>;
  resolveRuntimeFallback?(): Promise<CatalogModel | undefined>;
  resolveBare?(model: string): Promise<CatalogModel[]>;
}

export class OfficialPiModelCatalog implements ModelCatalog {
  constructor(
    private readonly runtime: ModelRuntime,
    private readonly parentModel: { provider: string; id: string } | undefined,
    private readonly thinkingLevels: (model: { provider: string; id: string }) => readonly ModelThinking[] | undefined = () => undefined,
    private readonly defaultThinking: (model: { provider: string; id: string }) => ModelThinking | undefined = () => undefined,
  ) {}

  async resolve(model: string): Promise<CatalogModel | undefined> {
    const parsed = validateModelIdentifier(model);
    const found = this.runtime.getModel(parsed.provider, parsed.model);
    if (!found) return undefined;
    const available = this.runtime.getAvailableSnapshot().some((candidate) => candidate.provider === found.provider && candidate.id === found.id);
    return {
      provider: found.provider,
      model: found.id,
      available,
      authenticated: this.runtime.hasConfiguredAuth(found.provider),
      thinkingLevels: this.thinkingLevels({ provider: found.provider, id: found.id }),
      defaultThinking: this.defaultThinking({ provider: found.provider, id: found.id }),
    };
  }

  async resolveParentFallback(): Promise<CatalogModel | undefined> {
    if (!this.parentModel) return undefined;
    return await this.resolve(`${this.parentModel.provider}/${this.parentModel.id}`);
  }

  async resolveRuntimeFallback(): Promise<CatalogModel | undefined> {
    const candidates = [...this.runtime.getAvailableSnapshot()]
      .sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`));
    for (const candidate of candidates) {
      const resolved = await this.resolve(`${candidate.provider}/${candidate.id}`);
      if (resolved?.available && resolved.authenticated) return resolved;
    }
    return undefined;
  }

  async resolveBare(model: string): Promise<CatalogModel[]> {
    const id = validateBareModelIdentifier(model);
    return this.runtime.getModels()
      .filter((candidate) => candidate.id === id)
      .map((candidate) => ({
        provider: candidate.provider,
        model: candidate.id,
        available: this.runtime.getAvailableSnapshot().some((available) => available.provider === candidate.provider && available.id === candidate.id),
        authenticated: this.runtime.hasConfiguredAuth(candidate.provider),
        thinkingLevels: this.thinkingLevels({ provider: candidate.provider, id: candidate.id }),
        defaultThinking: this.defaultThinking({ provider: candidate.provider, id: candidate.id }),
      }));
  }
}

export type CurrentTurnModelAuthorityMode = "inherit-only" | "explicit" | "delegated-choice";

/**
 * User-owned authority for model-facing task values. The discriminator is
 * intentionally explicit: no role, task text, or model suggestion can create
 * this authority implicitly.
 *
 * `kind`, `models`, and `thinking` are accepted as compatibility aliases for
 * callers that used the earlier authority vocabulary; the validator requires
 * one unambiguous discriminator and normalizes all aliases.
 */
export interface CurrentTurnModelAuthority {
  mode?: CurrentTurnModelAuthorityMode;
  kind?: CurrentTurnModelAuthorityMode;
  allowedModels?: readonly string[] | string | "available";
  allowedCanonicalModels?: readonly string[] | string | "available";
  models?: readonly string[] | string | "available";
  allowedThinking?: readonly ModelThinking[] | ModelThinking;
  allowedCanonicalThinking?: readonly ModelThinking[] | ModelThinking;
  thinking?: readonly ModelThinking[] | ModelThinking;
  /** Delegated-choice thinking authority defaults to inherit unless explicitly available. */
  thinkingMode?: "inherit" | "available";
}

export type TaskModelAuthority = CurrentTurnModelAuthority;
export type ModelAuthority = CurrentTurnModelAuthority;
export type CurrentTurnAuthority = CurrentTurnModelAuthority;
export type CurrentTurnModelPermission = CurrentTurnModelAuthority;
export type TaskModelPermission = CurrentTurnModelAuthority;

export interface TaskModelRequest {
  model?: string;
  thinking?: ModelThinking;
}

function authorityArray<T>(value: unknown, label: string): T[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return [...value] as T[];
  if (typeof value === "string") return [value as T];
  throw new Error(`${label} must be an array or one exact value`);
}

function normalizeCurrentTurnAuthority(authority: CurrentTurnModelAuthority): {
  mode: CurrentTurnModelAuthorityMode;
  allowedModels?: string[] | "available";
  allowedThinking?: ModelThinking[];
  thinkingMode?: "inherit" | "available";
} {
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
    throw new Error("current-turn model authority is required and must be an object");
  }
  const raw = authority as Record<string, unknown>;
  const unknown = Object.keys(raw).filter((key) => ![
    "mode", "kind", "allowedModels", "allowedCanonicalModels", "models", "allowedThinking", "allowedCanonicalThinking", "thinking", "thinkingMode",
  ].includes(key));
  if (unknown.length > 0) throw new Error(`current-turn model authority contains unknown fields: ${unknown.join(", ")}`);
  if (raw.mode !== undefined && raw.kind !== undefined && raw.mode !== raw.kind) {
    throw new Error("current-turn model authority mode and kind must agree");
  }
  const mode = (raw.mode ?? raw.kind) as CurrentTurnModelAuthorityMode | undefined;
  if (mode !== "inherit-only" && mode !== "explicit" && mode !== "delegated-choice") {
    throw new Error("current-turn model authority must be inherit-only, explicit, or delegated-choice");
  }
  const normalizedMode = mode as CurrentTurnModelAuthorityMode;
  const modelAliasValues = [raw.allowedModels, raw.allowedCanonicalModels, raw.models].filter((value) => value !== undefined);
  if (modelAliasValues.some((value) => JSON.stringify(value) !== JSON.stringify(modelAliasValues[0]))) {
    throw new Error("current-turn model authority model allowances must agree");
  }
  const thinkingAliasValues = [raw.allowedThinking, raw.allowedCanonicalThinking, raw.thinking].filter((value) => value !== undefined);
  if (thinkingAliasValues.some((value) => JSON.stringify(value) !== JSON.stringify(thinkingAliasValues[0]))) {
    throw new Error("current-turn model authority thinking allowances must agree");
  }
  const rawModelAllowance = modelAliasValues[0];
  if (rawModelAllowance === "available" && normalizedMode !== "delegated-choice") {
    throw new Error("current-turn model authority models=available requires delegated-choice");
  }
  const modelValues = rawModelAllowance === "available"
    ? undefined
    : authorityArray<unknown>(rawModelAllowance, "current-turn model authority allowedModels");
  const allowedModels = rawModelAllowance === "available"
    ? "available" as const
    : modelValues?.map((value, index) => {
      if (typeof value !== "string") throw new Error(`current-turn model authority allowedModels[${index}] must be canonical`);
      return validateModelIdentifier(value).canonical;
    });
  if (Array.isArray(allowedModels) && new Set(allowedModels).size !== allowedModels.length) {
    throw new Error("current-turn model authority allowedModels must not contain duplicates");
  }
  const thinkingValues = authorityArray<unknown>(thinkingAliasValues[0], "current-turn model authority allowedThinking");
  const allowedThinking = thinkingValues?.map((value, index) => {
    if (typeof value !== "string" || !THINKING.has(value as ModelThinking)) {
      throw new Error(`current-turn model authority allowedThinking[${index}] is invalid`);
    }
    return value as ModelThinking;
  });
  if (allowedThinking && new Set(allowedThinking).size !== allowedThinking.length) {
    throw new Error("current-turn model authority allowedThinking must not contain duplicates");
  }
  if (normalizedMode === "inherit-only" && (allowedModels !== undefined || allowedThinking !== undefined)) {
    throw new Error("inherit-only current-turn model authority cannot contain explicit allowances");
  }
  if (normalizedMode === "explicit" && allowedModels === undefined && allowedThinking === undefined) {
    throw new Error("explicit current-turn model authority must declare allowed models or thinking levels");
  }
  if (normalizedMode !== "delegated-choice" && raw.thinkingMode !== undefined) {
    throw new Error("current-turn model authority thinkingMode requires delegated-choice");
  }
  const thinkingMode = normalizedMode === "delegated-choice"
    ? raw.thinkingMode === "available" ? "available" as const : "inherit" as const
    : undefined;
  return {
    mode: normalizedMode,
    ...(allowedModels === undefined ? {} : { allowedModels }),
    ...(allowedThinking === undefined ? {} : { allowedThinking }),
    ...(thinkingMode === undefined ? {} : { thinkingMode }),
  };
}

/** Validate and normalize the user-owned authority itself before using it. */
export function validateCurrentTurnAuthority(authority: CurrentTurnModelAuthority): {
  mode: CurrentTurnModelAuthorityMode;
  allowedModels?: string[] | "available";
  allowedThinking?: ModelThinking[];
  thinkingMode?: "inherit" | "available";
} {
  return normalizeCurrentTurnAuthority(authority);
}

/**
 * Hard, deterministic validation for model-facing values in the current turn.
 * A missing authority fails closed for every explicit value. Canonical model
 * identity and thinking levels are validated before any catalog lookup.
 */
export function validateCurrentTurnModelRequest(
  requested: TaskModelRequest | undefined,
  authority: CurrentTurnModelAuthority,
): TaskModelRequest | undefined;
export function validateCurrentTurnModelRequest(
  authority: CurrentTurnModelAuthority,
  requested: TaskModelRequest | undefined,
): TaskModelRequest | undefined;
export function validateCurrentTurnModelRequest(
  first: TaskModelRequest | CurrentTurnModelAuthority | undefined,
  second: CurrentTurnModelAuthority | TaskModelRequest | undefined,
): TaskModelRequest | undefined {
  const authorityFirst = looksLikeCurrentTurnAuthority(first);
  const requested = (authorityFirst ? second : first) as TaskModelRequest | undefined;
  const authority = (authorityFirst ? first : second) as CurrentTurnModelAuthority;
  const normalizedAuthority = normalizeCurrentTurnAuthority(authority);
  if (requested === undefined) return undefined;
  if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
    throw new Error("current-turn model request must be an object");
  }
  const raw = requested as Record<string, unknown>;
  const unknown = Object.keys(raw).filter((key) => key !== "model" && key !== "thinking");
  if (unknown.length > 0) throw new Error(`current-turn model request contains unknown fields: ${unknown.join(", ")}`);
  const hasModel = raw.model !== undefined;
  const hasThinking = raw.thinking !== undefined;
  if (!hasModel && !hasThinking) return undefined;
  if (normalizedAuthority.mode === "inherit-only") {
    throw new Error("current-turn model request is unauthorized: authority is inherit-only");
  }

  let model: string | undefined;
  if (hasModel) {
    if (typeof raw.model !== "string") throw new Error("current-turn model request.model must be a model identifier");
    if (!raw.model.includes("/") && normalizedAuthority.mode === "delegated-choice" && (normalizedAuthority.allowedModels === undefined || normalizedAuthority.allowedModels === "available")) {
      model = validateBareModelIdentifier(raw.model);
    } else {
      model = validateModelIdentifier(raw.model).canonical;
    }
    if (normalizedAuthority.mode === "explicit"
      && (!Array.isArray(normalizedAuthority.allowedModels) || !normalizedAuthority.allowedModels.includes(model))) {
      throw new Error(`current-turn model request model '${model}' is not authorized by the explicit allowance`);
    }
    if (normalizedAuthority.mode === "explicit" && normalizedAuthority.allowedModels === undefined) {
      throw new Error("current-turn model request model is unauthorized: no explicit model allowance");
    }
    if (normalizedAuthority.mode === "delegated-choice"
      && Array.isArray(normalizedAuthority.allowedModels)
      && !normalizedAuthority.allowedModels.includes(model)) {
      throw new Error(`current-turn model request model '${model}' is not authorized by the delegated allowance`);
    }
  }

  let thinking: ModelThinking | undefined;
  if (hasThinking) {
    if (typeof raw.thinking !== "string" || !THINKING.has(raw.thinking as ModelThinking)) {
      throw new Error("current-turn model request.thinking is invalid");
    }
    thinking = raw.thinking as ModelThinking;
    if (normalizedAuthority.mode === "explicit"
      && (!normalizedAuthority.allowedThinking || !normalizedAuthority.allowedThinking.includes(thinking))) {
      throw new Error(`current-turn model request thinking '${thinking}' is not authorized by the explicit allowance`);
    }
    if (normalizedAuthority.mode === "explicit" && normalizedAuthority.allowedThinking === undefined) {
      throw new Error("current-turn model request thinking is unauthorized: no explicit thinking allowance");
    }
    if (normalizedAuthority.mode === "delegated-choice"
      && normalizedAuthority.thinkingMode !== "available"
      && (normalizedAuthority.allowedThinking === undefined || !normalizedAuthority.allowedThinking.includes(thinking))) {
      throw new Error(`current-turn model request thinking '${thinking}' is not authorized by delegated model-choice authority`);
    }
    if (normalizedAuthority.mode === "delegated-choice"
      && normalizedAuthority.thinkingMode === "available"
      && normalizedAuthority.allowedThinking !== undefined
      && !normalizedAuthority.allowedThinking.includes(thinking)) {
      throw new Error(`current-turn model request thinking '${thinking}' is not authorized by the delegated allowance`);
    }
  }
  return {
    ...(model === undefined ? {} : { model }),
    ...(thinking === undefined ? {} : { thinking }),
  };
}

/** Compatibility aliases for callers that name the boundary by task rather than turn. */
function looksLikeCurrentTurnAuthority(value: unknown): value is CurrentTurnModelAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return [
    "mode", "kind", "allowedModels", "allowedCanonicalModels", "models",
    "allowedThinking", "allowedCanonicalThinking",
  ].some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

export function validateTaskModelAuthority(
  requested: TaskModelRequest | undefined,
  authority: CurrentTurnModelAuthority,
): TaskModelRequest | undefined;
export function validateTaskModelAuthority(
  authority: CurrentTurnModelAuthority,
  requested: TaskModelRequest | undefined,
): TaskModelRequest | undefined;
export function validateTaskModelAuthority(
  first: TaskModelRequest | CurrentTurnModelAuthority | undefined,
  second: CurrentTurnModelAuthority | TaskModelRequest | undefined,
): TaskModelRequest | undefined {
  return looksLikeCurrentTurnAuthority(first)
    ? validateCurrentTurnModelRequest(second as TaskModelRequest | undefined, first)
    : validateCurrentTurnModelRequest(first as TaskModelRequest | undefined, second as CurrentTurnModelAuthority);
}

export const validateTaskModelRequestAuthority = validateTaskModelAuthority;
export const validateTaskModelRequest = validateTaskModelAuthority;
export const validateCurrentTurnPermission = validateTaskModelAuthority;
export const validateModelAuthority = validateTaskModelAuthority;

export function assertCurrentTurnModelRequest(
  requested: TaskModelRequest | undefined,
  authority: CurrentTurnModelAuthority,
): void;
export function assertCurrentTurnModelRequest(
  authority: CurrentTurnModelAuthority,
  requested: TaskModelRequest | undefined,
): void;
export function assertCurrentTurnModelRequest(
  first: TaskModelRequest | CurrentTurnModelAuthority | undefined,
  second: CurrentTurnModelAuthority | TaskModelRequest | undefined,
): void {
  if (looksLikeCurrentTurnAuthority(first)) {
    validateCurrentTurnModelRequest(first, second as TaskModelRequest | undefined);
  } else {
    validateCurrentTurnModelRequest(first as TaskModelRequest | undefined, second as CurrentTurnModelAuthority);
  }
}

export const assertCurrentTurnPermission = assertCurrentTurnModelRequest;

export interface ResolveModelInput {
  selector: string;
  agentId: string;
  /** Already-authorized one-shot values. Use the hard validator above first. */
  oneShot?: TaskModelRequest;
  /** Already-authorized current-turn user instruction (explicit or delegated
   *  authority). Ranks above every persistent layer and applies without a
   *  fresh confirmation. Pass through validateCurrentTurnModelRequest first. */
  directUserTurn?: TaskModelRequest;
  instance?: ModelOverride;
  projectRole?: ModelOverride;
  projectTrusted: boolean;
  userRole?: ModelOverride;
  /** Role profile model, used only when no direct Parent identity exists. */
  profile?: ModelOverride;
  authority?: CurrentTurnModelAuthority;
  currentTurnAuthority?: CurrentTurnModelAuthority;
  /** One-shot thinking-only compatibility inputs for task callers. */
  oneShotThinking?: ModelThinking;
  taskThinking?: ModelThinking;
  thinking?: ModelThinking;
  /** A direct Persistent parent snapshot whose model and thinking are exact. */
  parent?: Pick<ResolvedModelChoice, "provider" | "model" | "canonical" | "thinking" | "speedTier" | "source" | "modelSource" | "thinkingSource" | "parentSource">;
  parentThinking?: ModelThinking;
}

export interface ResolvedModelChoice {
  provider: string;
  model: string;
  canonical: string;
  layer: ModelLayer;
  thinking: ModelThinking;
  speedTier?: SpeedTier;
  /** Legacy audit field retained for compatibility. */
  source?: ModelSource;
  modelSource?: ModelChoiceSource;
  /** Source of the direct Parent snapshot, when this choice inherited one. */
  parentSource?: ModelSource;
  thinkingSource?: ThinkingSource;
  persistent: boolean;
  oneShot: boolean;
}

export async function revalidateResolvedModelChoice(choice: ResolvedModelChoice, catalog: ModelCatalog): Promise<void> {
  const candidate = await catalog.resolve(choice.canonical);
  if (!candidate || candidate.provider !== choice.provider || candidate.model !== choice.model) {
    throw new ModelSelectionError(choice.layer, `${choice.canonical} is no longer present; frozen identity was not switched`);
  }
  if (!candidate.available) throw new ModelSelectionError(choice.layer, `${choice.canonical} is no longer available; frozen identity was not switched`);
  if (!candidate.authenticated) throw new ModelSelectionError(choice.layer, `${choice.canonical} is no longer authenticated; frozen identity was not switched`);
  if (candidate.thinkingLevels && !candidate.thinkingLevels.includes(choice.thinking)) {
    throw new ModelSelectionError(choice.layer, `${choice.canonical} no longer supports thinking=${choice.thinking}; frozen identity was not switched`);
  }
}

export class ModelSelectionError extends Error {
  constructor(readonly layer: ModelLayer, message: string) {
    super(`${layer} model selection failed: ${message}`);
    this.name = "ModelSelectionError";
  }
}

function targetModelDefaultThinking(candidate: CatalogModel): ModelThinking {
  const preferred = candidate.defaultThinking
    ?? candidate.thinkingDefault
    ?? candidate.supportedDefaultThinking
    ?? candidate.defaultThinkingLevel;
  if (preferred && (!candidate.thinkingLevels || candidate.thinkingLevels.includes(preferred))) return preferred;
  if (candidate.thinkingLevels?.includes("medium")) return "medium";
  if (candidate.thinkingLevels && candidate.thinkingLevels.length > 0) return candidate.thinkingLevels[0]!;
  return "medium";
}

export async function resolveModelChoice(input: ResolveModelInput, catalog: ModelCatalog): Promise<ResolvedModelChoice> {
  const aliases = [input.oneShotThinking, input.taskThinking, input.thinking].filter((value): value is ModelThinking => value !== undefined);
  if (new Set(aliases).size > 1) throw new ModelSelectionError("one-shot", "conflicting one-shot thinking values were supplied");
  let oneShotThinking: ModelThinking | undefined = aliases[0];
  if (input.oneShot?.thinking !== undefined && oneShotThinking !== undefined && input.oneShot.thinking !== oneShotThinking) {
    throw new ModelSelectionError("one-shot", "one-shot model and thinking values disagree");
  }

  let oneShot = input.oneShot;
  const authority = input.authority ?? input.currentTurnAuthority;
  if (authority) {
    const requested: TaskModelRequest | undefined = oneShot || oneShotThinking !== undefined
      ? {
        ...(oneShot ? { model: oneShot.model } : {}),
        ...((oneShot?.thinking ?? oneShotThinking) !== undefined
          ? { thinking: oneShot?.thinking ?? oneShotThinking }
          : {}),
      }
      : undefined;
    const authorized = validateCurrentTurnModelRequest(requested, authority);
    const authorizedModel = authorized?.model;
    oneShot = authorizedModel === undefined
      ? (authorized?.thinking !== undefined ? { thinking: authorized.thinking } : undefined)
      : { model: authorizedModel, ...(authorized?.thinking === undefined ? {} : { thinking: authorized.thinking }) };
    oneShotThinking = authorized?.thinking;
  } else if (oneShot && oneShotThinking !== undefined && oneShot.thinking === undefined) {
    oneShot = { ...oneShot, thinking: oneShotThinking };
  }

  const layers: Array<{
    layer: ModelLayer;
    value?: { model?: string; thinking?: ModelThinking };
    persistent: boolean;
    source: ModelSource;
    modelSource: ModelChoiceSource;
  }> = [
    { layer: "direct-user-turn", value: input.directUserTurn, persistent: false, source: "direct-user-turn", modelSource: "direct-user-turn" },
    { layer: "instance", value: input.instance, persistent: true, source: "instance-override", modelSource: "instance-override" },
    { layer: "project-role", value: input.projectTrusted ? input.projectRole : undefined, persistent: true, source: "project-role-override", modelSource: "project-role-override" },
    { layer: "user-role", value: input.userRole, persistent: true, source: "user-role-override", modelSource: "user-role-override" },
    // A confirmed one-shot is lower than user-owned configuration but higher
    // than the direct Parent/profile/runtime fallbacks.
    { layer: "one-shot", value: oneShot, persistent: false, source: "confirmed-one-shot", modelSource: "user-one-shot" },
  ];
  // Model and thinking resolve per field: each takes the first layer that
  // provides it, so a persistent model override never shadows an authorized
  // current-turn thinking instruction and vice versa.
  const modelLayer = layers.find((candidate) => typeof candidate.value?.model === "string" && candidate.value.model.trim().length > 0);
  const oneShotThinkingLayer = oneShotThinking !== undefined ? {
    layer: "one-shot" as const,
    value: { thinking: oneShotThinking } as { model?: string; thinking?: ModelThinking },
    persistent: false,
    source: "confirmed-one-shot" as const,
    modelSource: "user-one-shot" as const,
  } : undefined;
  // The profile fallback only participates when no user-facing layer provided
  // the field — mirroring its model role as the last configured source.
  const profileThinkingLayer = input.profile?.thinking !== undefined && modelLayer === undefined ? {
    layer: "profile" as const,
    value: { thinking: input.profile.thinking } as { model?: string; thinking?: ModelThinking },
    persistent: true,
    source: "profile-fallback" as const,
    modelSource: "profile-fallback" as const,
  } : undefined;
  const thinkingLayer = layers.find((candidate) => candidate.value?.thinking !== undefined)
    ?? oneShotThinkingLayer
    ?? profileThinkingLayer;
  const selectedLayer = modelLayer ?? thinkingLayer;
  const fallbackLayer: ModelLayer = input.parent ? "parent-fallback" : input.profile ? "profile" : "runtime-fallback";
  const layer: ModelLayer = selectedLayer?.layer ?? fallbackLayer;
  const source: ModelSource = selectedLayer?.source
    ?? (layer === "profile" ? "profile-fallback" : layer === "runtime-fallback" ? "runtime-fallback" : "inherited-parent");
  const modelSource: ModelChoiceSource = selectedLayer?.modelSource
    ?? (layer === "profile" ? "profile-fallback" : layer === "runtime-fallback" ? "runtime-fallback" : "inherited-parent");
  const requested = modelLayer?.value ?? (layer === "profile" ? input.profile : undefined);
  let fallbackParent: CatalogModel | undefined;
  let fallbackLoaded = false;
  const getFallbackParent = async (): Promise<CatalogModel | undefined> => {
    if (!fallbackLoaded) {
      fallbackLoaded = true;
      fallbackParent = await catalog.resolveParentFallback();
    }
    return fallbackParent;
  };
  let runtimeFallback: CatalogModel | undefined;
  let runtimeFallbackLoaded = false;
  const getRuntimeFallback = async (): Promise<CatalogModel | undefined> => {
    if (!runtimeFallbackLoaded) {
      runtimeFallbackLoaded = true;
      runtimeFallback = catalog.resolveRuntimeFallback
        ? await catalog.resolveRuntimeFallback()
        : await getFallbackParent();
    }
    return runtimeFallback;
  };

  let candidate: CatalogModel | undefined;
  let requestedCanonical: string | undefined;
  if (requested) {
    if (typeof requested.model !== "string" || !requested.model.trim()) {
      throw new ModelSelectionError(layer, "explicit model is missing");
    }
    if (!requested.model.includes("/")) {
      if (layer !== "one-shot" && layer !== "direct-user-turn") {
        throw new ModelSelectionError(layer, `explicit model '${requested.model}' must use canonical provider/model form`);
      }
      const bare = validateBareModelIdentifier(requested.model);
      if (!catalog.resolveBare) throw new ModelSelectionError(layer, `bare model '${bare}' cannot be resolved by this catalog`);
      const matches = await catalog.resolveBare(bare);
      const eligible = matches.filter((match) => match.available && match.authenticated);
      const parentProvider = input.parent?.provider ?? (await getFallbackParent())?.provider;
      const parentMatches = parentProvider ? matches.filter((match) => match.provider === parentProvider) : [];
      if (parentMatches.length > 0) {
        const usableParentMatches = parentMatches.filter((match) => match.available && match.authenticated);
        if (usableParentMatches.length === 1) candidate = usableParentMatches[0];
        else if (usableParentMatches.length > 1) {
          throw new ModelSelectionError(layer, `bare model '${bare}' is ambiguous on Parent provider ${parentProvider}: ${usableParentMatches.map((match) => `${match.provider}/${match.model}`).join(", ")}`);
        } else {
          throw new ModelSelectionError(layer, `bare model '${bare}' matches Parent provider ${parentProvider} but is unavailable or unauthenticated; other providers were not considered`);
        }
      } else if (eligible.length === 1) candidate = eligible[0];
      else if (eligible.length > 1) {
        throw new ModelSelectionError(layer, `bare model '${bare}' is ambiguous across authenticated available candidates: ${eligible.map((match) => `${match.provider}/${match.model}`).join(", ")}`);
      } else {
        throw new ModelSelectionError(layer, `bare model '${bare}' has no authenticated available candidate${matches.length > 0 ? `; observed: ${matches.map((match) => `${match.provider}/${match.model}`).join(", ")}` : ""}`);
      }
    } else {
      requestedCanonical = validateModelIdentifier(requested.model).canonical;
      candidate = await catalog.resolve(requestedCanonical);
    }
  } else if (input.parent) {
    const parentCanonical = validateModelIdentifier(input.parent.canonical).canonical;
    candidate = await catalog.resolve(parentCanonical);
    if (candidate && `${candidate.provider}/${candidate.model}` !== input.parent.canonical) {
      throw new ModelSelectionError(layer, `direct parent identity changed from ${input.parent.canonical}; frozen identity was not switched`);
    }
  } else if (input.profile) {
    candidate = await catalog.resolve(input.profile.model);
  } else {
    candidate = await getRuntimeFallback();
  }

  if (!candidate) {
    throw new ModelSelectionError(layer, requested ? `unknown explicit model ${requested.model}; lower layers were not considered` : "runtime fallback model is unavailable");
  }
  const canonical = `${candidate.provider}/${candidate.model}`;
  if (requestedCanonical && canonical !== requestedCanonical) {
    throw new ModelSelectionError(layer, `catalog identity ${canonical} did not match explicit model ${requestedCanonical}; lower layers were not considered`);
  }
  if (!candidate.available) throw new ModelSelectionError(layer, `${canonical} is unavailable; lower layers were not considered`);
  if (!candidate.authenticated) throw new ModelSelectionError(layer, `${canonical} is unauthenticated; lower layers were not considered`);

  const explicitThinking = thinkingLayer?.value?.thinking;
  let thinking: ModelThinking;
  let thinkingSource: ThinkingSource;
  if (explicitThinking !== undefined) {
    if (!THINKING.has(explicitThinking)) throw new ModelSelectionError(layer, `${canonical} is incompatible with thinking=${String(explicitThinking)}; lower layers were not considered`);
    thinking = explicitThinking;
    thinkingSource = thinkingLayer!.modelSource;
  } else {
    const inheritsDirectParent = input.parent !== undefined && (!selectedLayer || canonical === input.parent.canonical);
    if (inheritsDirectParent) {
      // The direct parent's effective thinking is frozen and must not be
      // replaced by a role/profile/default heuristic for nested work.
      thinking = input.parent!.thinking;
      thinkingSource = "inherited-parent";
    } else if (!selectedLayer && layer === "parent-fallback") {
      thinking = input.parentThinking ?? "medium";
      thinkingSource = "inherited-parent";
    } else {
      thinking = targetModelDefaultThinking(candidate);
      thinkingSource = selectedLayer ? "model-default" : modelSource;
    }
  }
  if (!THINKING.has(thinking)) {
    throw new ModelSelectionError(layer, `${canonical} is incompatible with thinking=${String(thinking)}; lower layers were not considered`);
  }
  if (candidate.thinkingLevels && !candidate.thinkingLevels.includes(thinking)) {
    throw new ModelSelectionError(layer, `${canonical} is incompatible with thinking=${thinking}; lower layers were not considered`);
  }

  return {
    provider: candidate.provider,
    model: candidate.model,
    canonical,
    layer,
    thinking,
    speedTier: input.parent?.speedTier ?? "standard",
    source,
    modelSource,
    thinkingSource,
    ...(input.parent?.source ? { parentSource: input.parent.source } : {}),
    persistent: selectedLayer?.persistent ?? (layer === "profile" || layer === "runtime-fallback"),
    oneShot: layer === "one-shot",
  };
}

export async function resolveAgentModel(options: {
  input: Omit<ResolveModelInput, "instance" | "projectRole" | "userRole">;
  journal: CoordinatorJournal;
  configs: LoadedModelConfigs;
  catalog: ModelCatalog;
}): Promise<ResolvedModelChoice> {
  const instance = options.journal.getState().models[options.input.agentId] as unknown as ModelOverride | undefined;
  return await resolveModelChoice({
    ...options.input,
    instance,
    projectRole: options.configs.project?.roles[options.input.selector],
    userRole: options.configs.global.roles[options.input.selector],
  }, options.catalog);
}

export interface ModelChangeConfirmation {
  hasUI: boolean;
  confirm(packet: { scope: "instance" | "global" | "project"; target: string; oldValue?: ModelOverride; newValue?: ModelOverride }): Promise<"confirm" | "deny" | "dismiss">;
}

export interface TaskModelRequestConfirmation {
  hasUI: boolean;
  /** Optional hard authority supplied by a direct-user current-turn decision. */
  authority?: CurrentTurnModelAuthority;
  confirm(packet: { parent: string; requested: string }): Promise<"confirm" | "deny" | "dismiss">;
}

/** Model-facing task arguments are untrusted requests, not direct-user overrides. */
export async function confirmTaskModelRequest(
  requested: TaskModelRequest | undefined,
  parent: Pick<ResolvedModelChoice, "canonical" | "thinking"> | undefined,
  confirmation: TaskModelRequestConfirmation,
  authority?: CurrentTurnModelAuthority,
): Promise<TaskModelRequest | undefined> {
  if (!requested) return undefined;
  const validated = confirmation.authority || authority
    ? validateCurrentTurnModelRequest(requested, confirmation.authority ?? authority!)
    : requested;
  if (!validated?.model && validated?.thinking === undefined) return undefined;
  const effectiveRequested: TaskModelRequest = {
    ...(validated?.model === undefined ? {} : { model: validated.model }),
    ...(validated?.thinking === undefined ? {} : { thinking: validated.thinking }),
  };
  // A model-facing argument never becomes authority when no direct Parent
  // identity is available to present/compare.
  if (!parent) return undefined;
  if (effectiveRequested.model !== undefined && effectiveRequested.model === parent.canonical && effectiveRequested.thinking === undefined) return undefined;
  if (effectiveRequested.model === undefined && effectiveRequested.thinking === parent.thinking) return undefined;
  if (!confirmation.hasUI) return undefined;
  const summary = effectiveRequested.model !== undefined
    ? effectiveRequested.model
    : `${parent.canonical} thinking=${effectiveRequested.thinking}`;
  try {
    return await confirmation.confirm({ parent: parent.canonical, requested: summary }) === "confirm"
      ? effectiveRequested
      : undefined;
  } catch {
    // Dismissal, expiry, abort, and UI bridge loss all retain normal
    // configured/parent resolution; none grants the requested model.
    return undefined;
  }
}

export class ModelConfigurationService {
  constructor(
    private readonly store: ModelConfigStore,
    private readonly journal: CoordinatorJournal,
    private readonly validateUsable?: (override: ModelOverride) => Promise<void>,
  ) {}

  async userSetRole(scope: "global" | "project", selector: string, override: ModelOverride | undefined, projectTrusted: boolean): Promise<void> {
    if (override) await this.validateUsable?.(override);
    await this.store.setRole(scope, selector, override, projectTrusted);
  }

  async userSetInstance(agentId: string, override: ModelOverride | undefined): Promise<void> {
    if (!this.journal.getState().agents[agentId]) throw new Error(`${agentId}: unknown active Agent`);
    if (override) {
      await assertNoCredentialMaterial(override, "instance model override");
      validateOverride(override, "instance model override");
      await this.validateUsable?.(override);
      await this.journal.append({ kind: "model.put", agentId, payload: { ...override, source: "direct-user" } });
    } else {
      await this.journal.append({ kind: "model.clear", agentId, payload: { source: "direct-user" } });
    }
  }

  async requestRoleChange(
    scope: "global" | "project",
    selector: string,
    override: ModelOverride | undefined,
    projectTrusted: boolean,
    confirmation: ModelChangeConfirmation,
  ): Promise<{ status: "changed" | "denied" }> {
    if (scope === "project" && !projectTrusted) throw new Error("project model config write requires active project trust");
    const configs = await this.store.load(projectTrusted);
    const oldValue = (scope === "global" ? configs.global : configs.project)?.roles[selector];
    if (!confirmation.hasUI) return { status: "denied" };
    if (override) {
      await assertNoCredentialMaterial(override, "model-facing role override request");
      validateOverride(override, "model-facing role override request");
      await this.validateUsable?.(override);
    }
    const decision = await confirmation.confirm({ scope, target: selector, oldValue, newValue: override });
    if (decision !== "confirm") return { status: "denied" };
    await this.store.setRole(scope, selector, override, projectTrusted);
    return { status: "changed" };
  }

  async requestInstanceChange(
    agentId: string,
    override: ModelOverride | undefined,
    confirmation: ModelChangeConfirmation,
  ): Promise<{ status: "changed" | "denied" }> {
    const agent = this.journal.getState().agents[agentId];
    if (!agent) throw new Error(`${agentId}: unknown active Agent`);
    const oldValue = this.journal.getState().models[agentId] as unknown as ModelOverride | undefined;
    if (!confirmation.hasUI) return { status: "denied" };
    if (override) {
      await assertNoCredentialMaterial(override, "model-facing instance override request");
      validateOverride(override, "model-facing instance override request");
      await this.validateUsable?.(override);
    }
    const decision = await confirmation.confirm({ scope: "instance", target: agentId, oldValue, newValue: override });
    if (decision !== "confirm") return { status: "denied" };
    await this.userSetInstance(agentId, override);
    return { status: "changed" };
  }
}
