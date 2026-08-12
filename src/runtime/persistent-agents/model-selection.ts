import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { BUNDLED_ROLE_SELECTORS } from "../roles.js";
import type { CoordinatorJournal } from "./storage.js";
import { assertNoCredentialMaterial } from "./permission.js";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

export type ModelLayer = "one-shot" | "instance" | "project-role" | "user-role" | "profile" | "parent-fallback";
export type ModelThinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

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

const THINKING = new Set<ModelThinking>(["off", "minimal", "low", "medium", "high", "xhigh"]);
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
    throw new Error(`model must use canonical provider/model form (for example, openai-codex/gpt-5.6-terra): ${model}`);
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
  thinkingLevels?: ModelThinking[];
}

export interface ModelCatalog {
  resolve(model: string): Promise<CatalogModel | undefined>;
  resolveParentFallback(): Promise<CatalogModel | undefined>;
  resolveBare?(model: string): Promise<CatalogModel[]>;
}

export class OfficialPiModelCatalog implements ModelCatalog {
  constructor(
    private readonly runtime: ModelRuntime,
    private readonly parentModel: { provider: string; id: string } | undefined,
    private readonly thinkingLevels: (model: { provider: string; id: string }) => ModelThinking[] | undefined = () => undefined,
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
    };
  }

  async resolveParentFallback(): Promise<CatalogModel | undefined> {
    if (!this.parentModel) return undefined;
    return await this.resolve(`${this.parentModel.provider}/${this.parentModel.id}`);
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
      }));
  }
}

export interface ResolveModelInput {
  selector: string;
  agentId: string;
  oneShot?: ModelOverride;
  instance?: ModelOverride;
  projectRole?: ModelOverride;
  projectTrusted: boolean;
  userRole?: ModelOverride;
  profile?: ModelOverride;
  parentThinking?: ModelThinking;
}

export interface ResolvedModelChoice {
  provider: string;
  model: string;
  canonical: string;
  layer: ModelLayer;
  thinking: ModelThinking;
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

export async function resolveModelChoice(input: ResolveModelInput, catalog: ModelCatalog): Promise<ResolvedModelChoice> {
  const layers: Array<{ layer: ModelLayer; value?: ModelOverride; persistent: boolean }> = [
    { layer: "one-shot", value: input.oneShot, persistent: false },
    { layer: "instance", value: input.instance, persistent: true },
    { layer: "project-role", value: input.projectTrusted ? input.projectRole : undefined, persistent: true },
    { layer: "user-role", value: input.userRole, persistent: true },
    { layer: "profile", value: input.profile, persistent: true },
  ];
  const selected = layers.find((candidate) => candidate.value);
  const layer = selected?.layer ?? "parent-fallback";
  const requested = selected?.value;
  let candidate: CatalogModel | undefined;
  if (requested) {
    if (layer === "one-shot" && !requested.model.includes("/")) {
      const bare = validateBareModelIdentifier(requested.model);
      if (!catalog.resolveBare) throw new ModelSelectionError(layer, `bare model '${bare}' cannot be resolved by this catalog`);
      const matches = await catalog.resolveBare(bare);
      const eligible = matches.filter((match) => match.available && match.authenticated);
      const parentProvider = (await catalog.resolveParentFallback())?.provider;
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
      validateModelIdentifier(requested.model);
      candidate = await catalog.resolve(requested.model);
    }
  } else {
    candidate = await catalog.resolveParentFallback();
  }
  if (!candidate) throw new ModelSelectionError(layer, requested ? `unknown explicit model ${requested.model}; lower layers were not considered` : "official parent/fallback model is unavailable");
  const canonical = `${candidate.provider}/${candidate.model}`;
  if (!candidate.available) throw new ModelSelectionError(layer, `${canonical} is unavailable; lower layers were not considered`);
  if (!candidate.authenticated) throw new ModelSelectionError(layer, `${canonical} is unauthenticated; lower layers were not considered`);
  const thinking = requested?.thinking ?? input.parentThinking ?? "medium";
  if (candidate.thinkingLevels && !candidate.thinkingLevels.includes(thinking)) {
    throw new ModelSelectionError(layer, `${canonical} is incompatible with thinking=${thinking}; lower layers were not considered`);
  }
  return {
    provider: candidate.provider,
    model: candidate.model,
    canonical,
    layer,
    thinking,
    persistent: selected?.persistent ?? false,
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
