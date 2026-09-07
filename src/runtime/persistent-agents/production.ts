import { createBashToolDefinition, createEditToolDefinition, createFindToolDefinition, createGrepToolDefinition, createLsToolDefinition, createReadToolDefinition, createWriteToolDefinition, getAgentDir, type AgentSession, type CreateAgentSessionOptions, type ExtensionAPI, type ExtensionContext, type SessionManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { clampThinkingLevel, getSupportedThinkingLevels, type Model } from "@earendil-works/pi-ai";
import { loadModeConfig } from "pi-permission-modes/src/config-load.ts";
import type { ModeDef, PermissionModeConfig } from "pi-permission-modes/src/schema.ts";
import { FORMAL_TASK_REQUEST_SCHEMA, SUB_TOOL_SCHEMA, normalizeFormalContinuationAudit, type FormalContinuationAudit } from "./sub-schema.js";
import { assembleChildPrompt, computeEffectiveTools, type ParentToolSnapshot } from "./policy.js";
import { applyPromptPolicyPatch, assemblePromptModifiers, discoverPromptModifiers, resolvePromptModifiers } from "../prompt-middleware/index.js";
import { askUserQuestionnaire } from "../../questionnaire/index.js";
import { normalizeQuestions } from "../../questionnaire/model.js";
import { createChildApprovalBridge, createPersistentChildSession } from "./session-factory.js";
import { brokeredChildPermission, ChildPermissionResolver, ParentApprovalBroker } from "./permission.js";
import {
  ModelConfigStore,
  ModelConfigurationService,
  ModelSelectionError,
  defaultGlobalModelConfigPath,
  defaultProjectModelConfigPath,
  revalidateResolvedModelChoice,
  resolveAgentModel,
  resolveSubModelIdentifier,
  normalizeModelKey,
  SubModelRequestError,
  type CatalogModel,
  type CurrentTurnModelAuthority,
  type ModelCatalog,
  type ModelOverride,
  type ModelSource,
  type ModelThinking,
  type SubagentModelDecision,
  type TaskModelRequest,
  MODEL_THINKING_LEVELS,
  type ResolvedModelChoice,
  type SpeedTier,
  validateCurrentTurnModelRequest,
  validateCurrentTurnCliRequest,
  validateModelIdentifier,
  type ExternalCliId,
} from "./model-selection.js";
import {
  GitIsolationAdapter,
  WorkspaceLeaseManager,
  createWorkspaceMutationGuard,
  persistFormalWorkspaceLease,
  validateWorkspaceCwd,
  validateWriteScope,
  type FormalWorkspaceLease,
  type IsolatedWorkspaceRecord,
  type WorkspaceLease,
} from "./workspace.js";
import { PersistentAgentRuntime, registerPersistentAgentTools, type PersistentRuntimeExecutorInput } from "./runtime.js";
import { BackendConfigStore, defaultGlobalBackendConfigPath, describeBackendSelection, parseBackendCommand, resolveBackendSelection, resolveHerdrRuntimeOptions } from "./backends/settings.js";
import { assertHerdrRoleSupported, probeHerdrDaemon } from "./backends/herdr/adapter.js";
import { detectHerdrIntegrationStatus } from "./backends/herdr/availability.js";
import { createExternalCliLaunchPlan, EXTERNAL_CLI_REGISTRY, probeExternalCli } from "./external-cli.js";
import { resolveAgentBackend, type ExecutionBackendKind } from "./backends/types.js";
import { formalChildHardDeniedTools, resolvePersistentAgentSandbox } from "./child-sandbox.js";
import {
  SubRequestError,
  assertCurrentFormalRoleProfile,
  renderCanonicalFormalResultInstruction,
  resolveFormalTaskProtection,
  type FormalTaskProtection,
  type FormalWorkspaceRequest,
  type TaskExecutorInput,
  type TaskPreflightInput,
  type TaskPreflightResult,
  type TaskUpdateCallback,
} from "./sub-coordinator.js";
import { loadRoleProfiles, type RoleProfile } from "../roles.js";
import { loadAgentCatalog } from "../agent-catalog.js";
import { SUB_RENDERERS } from "./sub-renderer.js";
import { createAiliMcpExtension, MCP_TOOL_NAMES, resolveSharedMcpConfigPath } from "../mcp.js";
import { createProviderRoutedContextExtension } from "../context-runtime.js";
import { createExplainableRetryExtension } from "../provider-retry.js";
import { createCodexFastExtension } from "../codex-fast.js";

const BUILTIN_CHILD_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"] as const;
const DEFAULT_IDLE_TTL_MS = 420_000;

interface ParentState {
  parentPath: string;
  parentId: string;
  context: ExtensionContext;
  runtime: PersistentAgentRuntime;
  approval: ParentApprovalBroker;
  models: ModelConfigurationService;
  leases: WorkspaceLeaseManager;
  isolation: GitIsolationAdapter;
  workspaces: Map<string, WorkspaceLease>;
  childCwds: Map<string, string>;
  isolated: Map<string, IsolatedWorkspaceRecord>;
  controllers: Map<string, ProductionAgentController>;
  parkTimers: Map<string, NodeJS.Timeout>;
  speedTier: SpeedTier;
  /** Legacy authority shape retained for nested compatibility, not inferred
   * from Parent prose or used as a public per-turn request gate. */
  currentTurnModelAuthority: CurrentTurnModelAuthority;
}

export interface PersistentAgentProductionOptions {
  childModelRuntime?: CreateAgentSessionOptions["modelRuntime"];
  /** Optional deterministic override for the user-global backend config path. */
  globalBackendConfigPath?: string;
}

interface PreflightBoundary {
  sessionId: string;
  cwd: string;
  parentPath: string;
  epoch: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function persistedFormalProtection(metadata: Record<string, unknown> | undefined): FormalTaskProtection | undefined {
  const value = metadata?.formalProtection;
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.changeId !== "string" || !Array.isArray(value.protectedPaths)) {
    throw new Error("persisted formal task-board protection is malformed");
  }
  const expected = [
    `openspec/changes/${value.changeId}/formal-task-board.md`,
    `openspec/changes/${value.changeId}/progress.txt`,
  ] as const;
  if (value.protectedPaths.length !== 2
    || value.protectedPaths.some((path, index) => path !== expected[index])) {
    throw new Error("persisted formal task-board protection does not match its exact change identity");
  }
  return { changeId: value.changeId, protectedPaths: expected };
}

function sameFormalProtection(left: FormalTaskProtection | undefined, right: FormalTaskProtection | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function sameIdentity(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function persistedFormalWorkspaceRequest(metadata: Record<string, unknown> | undefined): FormalWorkspaceRequest | undefined {
  const value = metadata?.formalWorkspaceRequest;
  if (value === undefined) return undefined;
  if (!isRecord(value)
    || !["auto", "shared", "isolated"].includes(String(value.mode))
    || typeof value.cwd !== "string"
    || typeof value.selector !== "string"
    || !isRecord(value.writeScope)
    || !Array.isArray(value.writeScope.paths)
    || !value.writeScope.paths.every((path) => typeof path === "string")
    || !Array.isArray(value.writeScope.resources)
    || !value.writeScope.resources.every((resource) => typeof resource === "string")) {
    throw new Error("persisted formal workspace request is malformed");
  }
  return value as unknown as FormalWorkspaceRequest;
}

function persistedFormalWorkspaceLease(raw: Record<string, unknown> | undefined, agentId: string): FormalWorkspaceLease | undefined {
  if (raw === undefined) return undefined;
  const formalProtection = persistedFormalProtection(raw);
  const formalWorkspaceRequest = persistedFormalWorkspaceRequest(raw);
  let formalContinuationIdentity: FormalContinuationAudit;
  try {
    formalContinuationIdentity = normalizeFormalContinuationAudit(raw.formalContinuationIdentity, `${agentId}.workspaceLease.formalContinuationIdentity`);
  } catch (error) {
    throw new Error(`${agentId}: persisted formal workspace lease continuation identity is malformed (${error instanceof Error ? error.message : String(error)})`);
  }
  if (raw.agentId !== agentId
    || (raw.mode !== "shared" && raw.mode !== "isolated")
    || !["auto", "shared", "isolated"].includes(String(raw.requestedMode))
    || typeof raw.projectRoot !== "string"
    || typeof raw.root !== "string"
    || typeof raw.cwd !== "string"
    || typeof raw.selector !== "string"
    || typeof raw.jobId !== "string"
    || typeof raw.initialTurnId !== "string"
    || typeof raw.acquiredAt !== "string"
    || !isRecord(raw.scope)
    || !Array.isArray(raw.scope.paths)
    || !raw.scope.paths.every((path) => typeof path === "string")
    || !Array.isArray(raw.scope.resources)
    || !raw.scope.resources.every((resource) => typeof resource === "string")
    || typeof raw.scope.declared !== "boolean"
    || !formalProtection
    || !formalWorkspaceRequest
    || !Array.isArray(raw.protectedPaths)
    || !raw.protectedPaths.every((path) => typeof path === "string")) {
    throw new Error(`${agentId}: persisted formal workspace lease is malformed`);
  }
  return { ...(raw as unknown as FormalWorkspaceLease), formalProtection, formalWorkspaceRequest, formalContinuationIdentity };
}

function assistantText(session: AgentSession, fromMessageIndex = 0): string {
  for (const message of session.state.messages.slice(fromMessageIndex).reverse()) {
    if (message.role !== "assistant") continue;
    const text = typeof message.content === "string"
      ? message.content
      : message.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n");
    // A tool-only assistant message has no terminal text. Keep scanning older
    // assistant messages of the same turn instead of returning "" for a turn
    // that did produce a textual result earlier.
    if (text.trim().length > 0) return text;
  }
  return "";
}

function resolveCurrentMode(config: PermissionModeConfig, context: ExtensionContext): { name: string; mode: ModeDef } {
  let selected: string | undefined;
  for (const entry of context.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "perm-mode" && isRecord(entry.data) && typeof entry.data.mode === "string" && config.modes[entry.data.mode]) {
      selected = entry.data.mode;
    }
  }
  if (!selected && process.env.PI_PERMISSION_MODE && config.modes[process.env.PI_PERMISSION_MODE]) selected = process.env.PI_PERMISSION_MODE;
  if (!selected && !context.hasUI) {
    selected = config.cycleOrder.find((name) => config.modes[name]?.sandbox.enabled && !config.modes[name]?.sandbox.writable)
      ?? config.cycleOrder.find((name) => config.modes[name]?.sandbox.enabled);
  }
  const name = selected ?? config.defaultMode;
  return { name, mode: config.modes[name] ?? config.modes[config.defaultMode]! };
}

function currentMode(config: PermissionModeConfig, context: ExtensionContext): ModeDef {
  return resolveCurrentMode(config, context).mode;
}

/** The active permission-mode name, resolved exactly like the child permission
 *  path does (session `perm-mode` entries, then PI_PERMISSION_MODE, then the
 *  headless sandbox fallback, then the config default). */
export function resolveCurrentPermissionModeName(context: ExtensionContext): string {
  const config = loadModeConfig(context.cwd, getAgentDir(), () => undefined);
  return resolveCurrentMode(config, context).name;
}

/** YOLO permits only a verified vendor bypass flag; it does not relax
 * model/CLI validation or the trusted-local vendor boundary. */
export function isBypassPermissionMode(context: ExtensionContext): boolean {
  return resolveCurrentPermissionModeName(context) === "yolo";
}

export interface CurrentTurnModelCatalogEntry extends CatalogModel {
  canonical?: string;
  /** Deterministic user-facing aliases advertised by the Pi model catalog. */
  aliases?: readonly string[];
  /** Pi-declared input modalities only; these are not tool capabilities. */
  input?: readonly ("text" | "image")[];
}

export interface CurrentTurnModelCatalog {
  enumerate(): readonly CurrentTurnModelCatalogEntry[];
}

function modelCatalogAliases(model: Record<string, unknown>): string[] {
  const values: unknown[] = [model.id, model.name, model.displayName, model.label, model.alias];
  if (Array.isArray(model.aliases)) values.push(...model.aliases);
  const aliases = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const alias = value.trim();
    if (alias.length < 2 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(alias)) continue;
    if (/^(?:model|default|unknown|none)$/i.test(alias)) continue;
    aliases.add(alias);
    for (const part of alias.split(/[\s/._:-]+/)) {
      if (part.length >= 3 && !/^(?:model|default|unknown|none|gpt|claude|sonnet|opus|haiku|agent|agents|worker|workers|child|children|task|tasks|persistent|controlled|fixture|test)$/i.test(part)) aliases.add(part);
    }
  }
  return [...aliases];
}

/** One scope predicate is shared by display, canonical/bare resolution,
 * runtime fallback and execution-time revalidation. Pi represents no scope as
 * an empty list; a non-empty list permits only exact provider/model entries. */
export function isModelInEffectiveScope(context: Pick<ExtensionContext, "scopedModels">, provider: string, modelId: string): boolean {
  const scoped = context.scopedModels ?? [];
  return scoped.length === 0 || scoped.some((entry) => entry.model.provider === provider && entry.model.id === modelId);
}

export class ContextModelCatalog implements ModelCatalog, CurrentTurnModelCatalog {
  constructor(private readonly context: ExtensionContext) {}

  private isAvailable(provider: string, modelId: string): boolean {
    return isModelInEffectiveScope(this.context, provider, modelId)
      && this.context.modelRegistry.getAvailable().some((candidate) => candidate.provider === provider && candidate.id === modelId);
  }

  private describe(model: Model<any>): CurrentTurnModelCatalogEntry {
    const available = this.isAvailable(model.provider, model.id);
    const authenticated = this.context.modelRegistry.hasConfiguredAuth(model);
    return {
      provider: model.provider,
      model: model.id,
      canonical: `${model.provider}/${model.id}`,
      available,
      authenticated,
      thinkingLevels: getSupportedThinkingLevels(model) as ModelThinking[],
      // Persistent children use an empty in-memory SettingsManager. Pi's
      // omitted-thinking behavior is therefore exactly medium -> target clamp.
      defaultThinking: clampThinkingLevel(model, "medium") as ModelThinking,
      input: (model.input ?? []).filter((input): input is "text" | "image" => input === "text" || input === "image"),
      aliases: modelCatalogAliases(model as unknown as Record<string, unknown>),
    };
  }

  async resolve(canonical: string): Promise<CatalogModel | undefined> {
    const slash = canonical.indexOf("/");
    if (slash <= 0 || slash === canonical.length - 1) return undefined;
    const provider = canonical.slice(0, slash);
    const modelId = canonical.slice(slash + 1);
    if (!isModelInEffectiveScope(this.context, provider, modelId)) return undefined;
    const model = this.context.modelRegistry.find(provider, modelId);
    return model ? this.describe(model) : undefined;
  }

  async resolveParentFallback(): Promise<CatalogModel | undefined> {
    const model = this.context.model;
    return model ? await this.resolve(`${model.provider}/${model.id}`) : undefined;
  }

  async resolveRuntimeFallback(): Promise<CatalogModel | undefined> {
    const candidates = [...this.context.modelRegistry.getAvailable()]
      .filter((candidate) => isModelInEffectiveScope(this.context, candidate.provider, candidate.id))
      .sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`));
    for (const candidate of candidates) {
      const resolved = await this.resolve(`${candidate.provider}/${candidate.id}`);
      if (resolved?.available && resolved.authenticated) return resolved;
    }
    return undefined;
  }

  async resolveBare(modelId: string): Promise<CatalogModel[]> {
    return this.context.modelRegistry.getAll()
      .filter((model) => model.id === modelId && isModelInEffectiveScope(this.context, model.provider, model.id))
      .map((model) => this.describe(model));
  }

  enumerate(): readonly CurrentTurnModelCatalogEntry[] {
    return this.context.modelRegistry.getAll()
      .filter((model) => isModelInEffectiveScope(this.context, model.provider, model.id))
      .map((model) => this.describe(model))
      .filter((model) => model.available && model.authenticated)
      .sort((left, right) => left.canonical!.localeCompare(right.canonical!));
  }
}

const SUBAGENT_CAPABILITY_BEGIN = "<!-- AILI_SUBAGENT_CAPABILITIES_BEGIN -->";
const SUBAGENT_CAPABILITY_END = "<!-- AILI_SUBAGENT_CAPABILITIES_END -->";
const SUBAGENT_CATALOG_MAX_MODELS = 64;
const SUBAGENT_CATALOG_MAX_BYTES = 16 * 1024;

function hasUnsafeCatalogText(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
}

function boundedUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end]! & 0b1100_0000) === 0b1000_0000) end -= 1;
  return `${bytes.subarray(0, end).toString("utf8")}…`;
}

function escapeCatalogField(value: string, maxBytes: number): string | undefined {
  if (!value || hasUnsafeCatalogText(value)) return undefined;
  return boundedUtf8(value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|"), maxBytes);
}

/** Pure, bounded Parent-only projection. It does not resolve credentials,
 * refresh a provider, or grant authorization. */
export function renderSubagentModelCapabilities(
  catalog: CurrentTurnModelCatalog | readonly CurrentTurnModelCatalogEntry[],
  authority: CurrentTurnModelAuthority,
): string {
  const entries = authorityCatalogEntries(catalog)
    .sort((left, right) => (left.canonical ?? "").localeCompare(right.canonical ?? ""));
  const lines = [
    SUBAGENT_CAPABILITY_BEGIN,
    "Subagent model catalog (discovery only; not authorization)",
    "Availability is local catalog/configured-auth state, not proof of a provider request. Input modalities do not imply audio/video/ASR, filesystem, browser, or network tools.",
  ];
  let included = 0;
  for (const entry of entries) {
    if (included >= SUBAGENT_CATALOG_MAX_MODELS) break;
    const canonical = escapeCatalogField(entry.canonical ?? `${entry.provider}/${entry.model}`, 256);
    if (!canonical) continue;
    const thinking = (entry.thinkingLevels ?? []).filter((level) => !hasUnsafeCatalogText(level)).join(",") || "off";
    const defaultThinking = entry.defaultThinking && !hasUnsafeCatalogText(entry.defaultThinking) ? entry.defaultThinking : "medium";
    const input = (entry.input ?? []).filter((value) => value === "text" || value === "image").join(",") || "text";
    const line = `- ${canonical} | thinking: ${boundedUtf8(thinking, 128)} | default: ${defaultThinking} | input: ${input}`;
    const candidate = [...lines, line].join("\n");
    if (Buffer.byteLength(candidate, "utf8") > SUBAGENT_CATALOG_MAX_BYTES - 512) break;
    lines.push(line);
    included += 1;
  }
  const omitted = Math.max(0, entries.length - included);
  if (omitted > 0) lines.push(`- [${omitted} model(s) omitted by the bounded catalog; do not infer or guess omitted identities.]`);
  const selectors = boundedUtf8(authority.allowedSelectors?.slice(0, 16).join(", ") ?? "all selectors", 512);
  const models = Array.isArray(authority.allowedModels)
    ? boundedUtf8(authority.allowedModels.slice(0, 16).join(", "), 2_048)
    : authority.allowedModels ?? "none";
  const allowedThinking = authority.allowedThinking === undefined
    ? []
    : Array.isArray(authority.allowedThinking) ? authority.allowedThinking : [authority.allowedThinking];
  const thinkingAuthority = boundedUtf8(allowedThinking.slice(0, 16).join(", ") || "none", 256);
  const modelAuthority = authority.mode === "explicit"
    ? `legacy authority metadata is ignored for authorization; candidate models=${models}; thinking=${thinkingAuthority}`
    : authority.mode === "delegated-choice"
      ? `legacy delegated-choice metadata is ignored for authorization; selector scope=${selectors}`
      : "Parent aligns task, model, thinking, and CLI requirements before submitting structured parameters; clarify uncertainty with the user first";
  lines.push("Subagent model selection boundary");
  lines.push(modelAuthority);
  lines.push("External CLI routing: the Parent may submit one registered cli value as a structured request after requirements alignment; omitted cli stays Pi. Strict preflight runs without an extra selection questionnaire, including headless mode. External execution is trusted-local, not a Pi child hard-permission or OS-sandbox boundary; actual executable binding is Unverified. Omit external model or thinking to preserve vendor defaults; never silently fix spelling, invent a base model, strip suffixes such as -high, or infer thinking from an ID. The runtime still uses frozen --help only to resolve uniquely evidenced native option names/value syntax.");
  lines.push("Per-turn model/thinking fields independently override persistent configuration without changing it or the next turn. selectionScope is descriptive only, never permission or a reusable authorization cache. Ordinary tool permissions, questions, credential/sandbox denials, and durable model-config confirmations remain. Runtime validation cannot prove the Parent understood the user correctly.");
  const closing = `\n${SUBAGENT_CAPABILITY_END}`;
  const body = lines.join("\n");
  return Buffer.byteLength(`${body}${closing}`, "utf8") <= SUBAGENT_CATALOG_MAX_BYTES
    ? `${body}${closing}`
    : `${boundedUtf8(body, SUBAGENT_CATALOG_MAX_BYTES - Buffer.byteLength(closing, "utf8") - Buffer.byteLength("…", "utf8"))}${closing}`;
}

export function appendSubagentModelCapabilities(systemPrompt: string, section: string): string {
  const pattern = new RegExp(`\\n?${SUBAGENT_CAPABILITY_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${SUBAGENT_CAPABILITY_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
  const base = systemPrompt.replace(pattern, "").trimEnd();
  return `${base}${base ? "\n\n" : ""}${section}`;
}

export function defaultCurrentTurnModelAuthority(): CurrentTurnModelAuthority {
  return { mode: "inherit-only" };
}

function authorityCatalogEntries(catalog: CurrentTurnModelCatalog | readonly CurrentTurnModelCatalogEntry[]): CurrentTurnModelCatalogEntry[] {
  const entries = Array.isArray(catalog) ? [...catalog] : [...(catalog as CurrentTurnModelCatalog).enumerate()];
  return entries.filter((entry) => entry.available && entry.authenticated).map((entry) => ({
    ...entry,
    canonical: entry.canonical || `${entry.provider}/${entry.model}`,
    aliases: [...new Set([entry.canonical || `${entry.provider}/${entry.model}`, entry.model, ...(entry.aliases ?? [])])],
  }));
}

/**
 * Compatibility-only projection. Natural-language input is intentionally not
 * an authorization source. Public dispatch uses strict structured requests
 * after Parent requirements alignment. Keep the symbol for consumers not yet
 * migrated, but always return the inert default.
 */
export function parseCurrentTurnModelAuthority(
  _prompt: string,
  _catalog: CurrentTurnModelCatalog | readonly CurrentTurnModelCatalogEntry[],
): CurrentTurnModelAuthority {
  return defaultCurrentTurnModelAuthority();
}

/** Compatibility names for callers that describe the operation as capture/resolve. */
export const captureCurrentTurnModelAuthority = parseCurrentTurnModelAuthority;
export const resolveCurrentTurnModelAuthority = parseCurrentTurnModelAuthority;
export const determineCurrentTurnModelAuthority = parseCurrentTurnModelAuthority;

function authorityModelList(authority: CurrentTurnModelAuthority): string[] {
  const values = authority.allowedModels ?? authority.allowedCanonicalModels ?? authority.models;
  if (values === undefined || values === "available") return [];
  return typeof values === "string" ? [values] : [...values];
}

function normalizeTaskModelReference(
  model: string,
  authority: CurrentTurnModelAuthority,
  catalog: CurrentTurnModelCatalog,
): string {
  if (authority.mode === "inherit-only" || authority.mode === "delegated-choice" || model.includes("/")) return model;
  const normalized = model.trim().toLowerCase();
  const allowed = new Set(authorityModelList(authority).map((value) => value.toLowerCase()));
  const matches = catalog.enumerate().filter((entry) => {
    const canonical = entry.canonical ?? `${entry.provider}/${entry.model}`;
    if (authority.mode === "explicit" && allowed.size > 0 && !allowed.has(canonical.toLowerCase())) return false;
    return [entry.model, canonical, ...(entry.aliases ?? [])].some((alias) => alias.toLowerCase() === normalized);
  });
  if (matches.length > 1) {
    throw new Error(`current-turn model request is ambiguous for '${model}': ${matches.map((entry) => entry.canonical).join(", ")}`);
  }
  if (matches[0]) return matches[0].canonical ?? `${matches[0].provider}/${matches[0].model}`;
  // Compact-alias fallback: `glm5.1` → `glm-5.1` when exactly one allowed
  // available entry normalizes to the same key.
  const compact = normalizeModelKey(model);
  if (compact.length === 0) return model;
  const compactMatches = catalog.enumerate().filter((entry) => {
    const canonical = entry.canonical ?? `${entry.provider}/${entry.model}`;
    if (authority.mode === "explicit" && allowed.size > 0 && !allowed.has(canonical.toLowerCase())) return false;
    return [entry.model, canonical, ...(entry.aliases ?? [])].some((alias) => normalizeModelKey(alias) === compact);
  });
  if (compactMatches.length > 1) {
    throw new Error(`current-turn model request is ambiguous for '${model}': ${compactMatches.map((entry) => entry.canonical).join(", ")}`);
  }
  return compactMatches[0] ? compactMatches[0].canonical ?? `${compactMatches[0].provider}/${compactMatches[0].model}` : model;
}

export type TaskModelRequestCapture =
  | { outcome: "absent" }
  | { outcome: "captured"; request: TaskModelRequest }
  | { outcome: "rejected"; reason: string };

/** Structured capture of a model-facing task request against the current-turn
 *  authority: absent, captured (authorized or syntactic), or rejected with a
 *  bounded reason. Never silently drops a request. */
export function captureTaskModelRequest(
  item: TaskExecutorInput["item"],
  authority: CurrentTurnModelAuthority,
  catalog: CurrentTurnModelCatalog,
): TaskModelRequestCapture {
  if (item.model === undefined && item.thinking === undefined) return { outcome: "absent" };
  if (authority.allowedSelectors !== undefined && !authority.allowedSelectors.includes(item.agent)) {
    return {
      outcome: "rejected",
      reason: `current-turn authority is scoped to ${authority.allowedSelectors.join(", ")}; requested selector '${item.agent}' is outside that scope`,
    };
  }
  if (authority.mode === "inherit-only") {
    // Compatibility capture is syntactic, not proof of user intent or tool
    // permission. Public dispatch separately validates the structured request.
    try {
      const model = item.model === undefined
        ? undefined
        : item.model.includes("/")
          ? validateModelIdentifier(item.model).canonical
          : validateBareModel(item.model);
      return {
        outcome: "captured",
        request: {
          ...(model === undefined ? {} : { model }),
          ...(item.thinking === undefined ? {} : { thinking: item.thinking }),
        },
      };
    } catch (error) {
      return { outcome: "rejected", reason: error instanceof Error ? error.message : String(error) };
    }
  }
  try {
    const requested = {
      ...(item.model === undefined ? {} : { model: normalizeTaskModelReference(item.model, authority, catalog) }),
      ...(item.thinking === undefined ? {} : { thinking: item.thinking }),
    };
    const validated = validateCurrentTurnModelRequest(requested, authority) as TaskModelRequest | undefined;
    if (!validated || (validated.model === undefined && validated.thinking === undefined)) {
      return { outcome: "rejected", reason: "current-turn authority did not authorize the requested model/thinking" };
    }
    return { outcome: "captured", request: validated };
  } catch (error) {
    // Callers must surface this as a structured candidate failure; never turn
    // it into an authorization decision by interpreting surrounding prose.
    return { outcome: "rejected", reason: error instanceof Error ? error.message : String(error) };
  }
}

function validateBareModel(model: string): string {
  const normalized = model.trim();
  if (!normalized || normalized.includes("/") || /[\s\0\r\n]/.test(normalized)) {
    throw new Error("bare model must be one exact model id");
  }
  return normalized;
}

function parseOverride(model: string | undefined): ModelOverride | undefined {
  return model ? { model } : undefined;
}

function persistedParentResolution(agent: { metadata?: Record<string, unknown>; parentAgentId?: string }, fallback?: ResolvedModelChoice): ResolvedModelChoice | undefined {
  const metadata = agent.metadata ?? {};
  if (metadata.parentResolutionPresent === false) return undefined;
  const canonical = typeof metadata.parentModel === "string" ? metadata.parentModel : undefined;
  if (!canonical) {
    if (metadata.parentResolutionPresent === true || agent.parentAgentId) {
      throw new Error("persisted nested Agent is missing its frozen direct-parent model identity");
    }
    return fallback;
  }
  const separator = canonical.indexOf("/");
  const thinking = metadata.parentThinking;
  const speedTier = metadata.parentSpeedTier;
  const parentSource = metadata.parentSource;
  const validParentSources = ["structured-request", "direct-user-turn", "confirmed-one-shot", "user-one-shot", "instance-override", "project-role-override", "user-role-override", "inherited-parent", "profile-fallback", "runtime-fallback"];
  if (separator <= 0 || separator === canonical.length - 1
    || typeof thinking !== "string"
    || !(MODEL_THINKING_LEVELS as readonly string[]).includes(thinking)
    || (speedTier !== "standard" && speedTier !== "priority")
    || (parentSource !== undefined && (typeof parentSource !== "string" || !validParentSources.includes(parentSource)))) {
    throw new Error("persisted direct-parent model identity is incomplete");
  }
  const directParentSource: ModelSource = typeof parentSource === "string" ? parentSource as ModelSource : "inherited-parent";
  const directParentModelSource = directParentSource === "confirmed-one-shot" ? "user-one-shot" : directParentSource;
  return {
    provider: canonical.slice(0, separator),
    model: canonical.slice(separator + 1),
    canonical,
    layer: "parent-fallback",
    source: directParentSource,
    modelSource: directParentModelSource,
    thinkingSource: directParentModelSource,
    thinking: thinking as ModelThinking,
    speedTier,
    persistent: false,
    oneShot: false,
  };
}

function supportedThinkingLevels(model: Model<any>): ModelThinking[] {
  return getSupportedThinkingLevels(model) as ModelThinking[];
}

function withoutSubCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^SUB_[A-Z_]+:\s*/, "");
}

function correctiveModelGuidance(item: TaskExecutorInput["item"], catalog: ContextModelCatalog, error: unknown): string {
  const requested = item.model?.includes("/") ? item.model : undefined;
  const candidate = requested ? catalog.enumerate().find((entry) => entry.canonical === requested) : undefined;
  const levels = candidate?.thinkingLevels?.join(", ") ?? "a supported thinking level";
  const model = candidate?.canonical ?? requested ?? "the canonical provider/model";
  return `${withoutSubCode(error)}. Align unclear requirements with the user before submitting a corrected structured request for ${item.agent} (model=${model}, thinking=${levels}). Availability is not tool permission; no fallback was used.`;
}

class ProductionAgentController {
  private session?: AgentSession;
  private disposed = false;

  constructor(
    private readonly owner: PersistentAgentProduction,
    private readonly state: ParentState,
    readonly agentId: string,
    private readonly manager: SessionManager,
  ) {}

  /** Run exactly one turn: an initial assignment on a fresh session, or the
   *  next user message on the reopened Child Session of a continuation. */
  async runInitial(input: PersistentRuntimeExecutorInput): Promise<string> {
    const prepared = await this.prepare(input);
    const promptStart = prepared.session.state.messages.length;
    const abort = () => { void this.abort("task cancellation"); };
    input.context.signal.addEventListener("abort", abort, { once: true });
    try {
      if (input.continuation) {
        await prepared.session.sendUserMessage(input.item.task);
      } else {
        await prepared.session.prompt(prepared.initialMessage, { expandPromptTemplates: false, source: "extension" });
      }
      await this.owner.finalizeWorkspace(this.state, this.agentId);
      this.owner.schedulePark(this.state, this.agentId);
      const text = assistantText(prepared.session, promptStart);
      if (text.trim().length === 0) {
        throw new Error(`SUB_EMPTY_RESULT: ${this.agentId}/${input.turnId} settled without terminal assistant text; the child session history is preserved for diagnosis`);
      }
      return text;
    } finally {
      input.context.signal.removeEventListener("abort", abort);
    }
  }

  async abort(_reason: string): Promise<void> {
    this.owner.clearPark(this.state, this.agentId);
    await this.session?.abort();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const session = this.session;
    this.session = undefined;
    if (!session) return;
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  }

  private async prepare(input?: PersistentRuntimeExecutorInput): Promise<{ session: AgentSession; initialMessage: string }> {
    await this.dispose();
    let prepared: Awaited<ReturnType<PersistentAgentProduction["buildChildSession"]>> | undefined;
    try {
      prepared = await this.owner.buildChildSession(this.state, this, this.manager, input);
      this.session = prepared.session;
      this.disposed = false;
      return prepared;
    } catch (error) {
      if (prepared) {
        await prepared.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
        prepared.session.dispose();
      }
      throw error;
    }
  }
}

export class PersistentAgentProduction {
  private readonly parents = new Map<string, Promise<ParentState>>();

  private optionalSessionFile(context: ExtensionContext): string | undefined {
    const manager = context.sessionManager as SessionManager & { getSessionFile?: () => string | undefined };
    return typeof manager.getSessionFile === "function" ? manager.getSessionFile() : undefined;
  }
  /** User-owned, session-local backend overrides set by /aili-agent-backend.
   *  Keyed by parent session path and kept OUTSIDE ParentState so the
   *  command works before the runtime (and its sidecar) may exist — official
   *  Pi can defer materializing the session JSONL until the first persisted
   *  entry, and runtime creation must not precede that. */
  private readonly sessionBackendOverrides = new Map<string, ExecutionBackendKind>();
  private activeParentPath?: string;
  /** Invalidates pending preflights even when reload reuses the same IDs. */
  private sessionEpoch = 0;

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly options: PersistentAgentProductionOptions = {},
  ) {}

  async register(): Promise<void> {
    const catalog = await loadAgentCatalog();
    if (!catalog.ok) {
      throw new Error(`persistent task Agent Catalog is non-pass: ${catalog.diagnostics.map((diagnostic) => diagnostic.code).join(", ") || "UNKNOWN"}`);
    }
    registerPersistentAgentTools(this.pi, {
      catalog: catalog.value,
      runtimeForContext: async (context) => (await this.parent(context)).runtime,
      directModelCommand: async (args, context) => await this.directModel(args, context),
      directFastCommand: async (args, context) => await this.directFast(args, context),
      directBackendCommand: async (args, context) => await this.directBackend(args, context),
      directAgentsCommand: async (args, context) => await this.directAgents(args, context),
    });
    this.pi.on("session_start", (_event, context) => {
      const nextPath = this.optionalSessionFile(context);
      this.sessionEpoch += 1;
      this.activeParentPath = nextPath;
    });
    this.pi.on("before_agent_start", async (event, context) => {
      // The Parent owns conversational interpretation. This extension only
      // publishes discovery data; no input text is parsed into authority.
      const authority = defaultCurrentTurnModelAuthority();
      const catalog: CurrentTurnModelCatalog | readonly CurrentTurnModelCatalogEntry[] = context.modelRegistry
        ? new ContextModelCatalog(context)
        : [];
      const section = renderSubagentModelCapabilities(catalog, authority);
      const parentPath = this.optionalSessionFile(context);
      const existing = parentPath ? this.parents.get(parentPath) : undefined;
      if (existing) {
        const state = await existing;
        state.context = context;
        state.currentTurnModelAuthority = authority;
      }
      // Pi chains systemPrompt results from earlier handlers. Replace only our
      // own delimiter so re-entry/tool loops remain byte-stable.
      return { systemPrompt: appendSubagentModelCapabilities(event.systemPrompt, section) };
    });
    this.pi.on("session_shutdown", async () => {
      this.sessionEpoch += 1;
      try {
        for (const pending of this.parents.values()) {
          const state = await pending.catch(() => undefined);
          if (!state) continue;
          state.approval.shutdown();
          for (const timer of state.parkTimers.values()) clearTimeout(timer);
          await Promise.all([...state.controllers.values()].map(async (controller) => await controller.dispose()));
          await state.runtime.shutdown();
        }
      } finally {
        this.parents.clear();
      }
    });
  }

  async buildChildSession(
    state: ParentState,
    controller: ProductionAgentController,
    manager: SessionManager,
    input?: PersistentRuntimeExecutorInput,
  ): Promise<{ session: AgentSession; initialMessage: string }> {
    const context = state.context;
    const agent = state.runtime.journal.getState().agents[controller.agentId];
    if (!agent) throw new Error(`${controller.agentId}: Agent registry record is missing`);
    const roles = await loadRoleProfiles();
    const role = roles.find((candidate) => candidate.selector === agent.selector);
    if (!role) throw new Error(`${agent.selector}: role profile is unavailable`);
    assertCurrentFormalRoleProfile(agent, role);
    const storedProtection = persistedFormalProtection(agent.metadata);
    if (input?.item.formalContext && !input.formalProtection) {
      throw new Error(`${controller.agentId}: formal task-board protection was not resolved before allocation`);
    }
    if (input?.formalProtection && !sameFormalProtection(input.formalProtection, storedProtection)) {
      throw new Error(`${controller.agentId}: formal task-board protection differs from the durable Agent record`);
    }
    const formalProtection = input?.formalProtection ?? storedProtection;
    const workspace = input ? await this.ensureWorkspace(state, input, formalProtection) : state.workspaces.get(controller.agentId);
    if (!workspace) throw new Error(`${controller.agentId}: workspace record is unavailable for revive`);
    if (!sameFormalProtection(
      formalProtection,
      workspace.protectedPaths ? { changeId: formalProtection?.changeId ?? "", protectedPaths: workspace.protectedPaths as [string, string] } : undefined,
    )) {
      throw new Error(`${controller.agentId}: revived workspace protection differs from the durable Agent record`);
    }
    if (formalProtection) await this.assertFormalExecutionIdentity(state, controller.agentId, input, role);
    const childCwd = state.childCwds.get(controller.agentId) ?? workspace.root;
    const modeConfig = loadModeConfig(workspace.root, getAgentDir(), (message) => context.ui.notify(message, "warning"));
    const mode = currentMode(modeConfig, context);
    const protectedDenyWrite = (workspace.protectedPaths ?? []).map((path) => resolve(workspace.root, path));
    const sandbox = resolvePersistentAgentSandbox(mode.sandbox, protectedDenyWrite);
    const formalHardDenied = formalChildHardDeniedTools(protectedDenyWrite, sandbox);
    const sandboxedBash = sandbox.operations
      ? createBashToolDefinition(childCwd, { operations: sandbox.operations }) as unknown as ToolDefinition
      : undefined;

    const nestedDefinitions = this.childToolDefinitions(state, input, role, sandboxedBash);
    const parentActive = this.pi.getActiveTools();
    const parentDefinitions = new Map<string, ToolDefinition>([
      ["read", createReadToolDefinition(childCwd) as unknown as ToolDefinition],
      ["bash", (sandboxedBash ?? createBashToolDefinition(childCwd)) as unknown as ToolDefinition],
      ["edit", createEditToolDefinition(childCwd) as unknown as ToolDefinition],
      ["write", createWriteToolDefinition(childCwd) as unknown as ToolDefinition],
      ["grep", createGrepToolDefinition(childCwd) as unknown as ToolDefinition],
      ["find", createFindToolDefinition(childCwd) as unknown as ToolDefinition],
      ["ls", createLsToolDefinition(childCwd) as unknown as ToolDefinition],
    ]);
    for (const definition of nestedDefinitions) parentDefinitions.set(definition.name, definition);
    const parent: ParentToolSnapshot = {
      active: parentActive,
      definitions: parentDefinitions,
    };
    const snippetIds = input?.item.snippets ?? [];
    const snippetDefinitions = snippetIds.length ? await discoverPromptModifiers([
      { path: join(getAgentDir(), "snippets"), trusted: true },
      { path: join(childCwd, ".pi", "snippets"), trusted: context.isProjectTrusted() },
    ]) : [];
    const roleAllowedSnippets = snippetDefinitions.filter((definition) => definition.scopes.includes(`role:${role.selector}`)).map((definition) => definition.id);
    const snippetResolution = snippetIds.length ? resolvePromptModifiers(
      snippetDefinitions,
      snippetIds,
      { surface: "subagent", role: role.selector, allowedIds: roleAllowedSnippets, capabilities: role.capabilities },
    ) : undefined;
    const requestedTools = snippetResolution
      ? [...applyPromptPolicyPatch(input?.item.tools ?? parentActive, snippetResolution.policyPatch)]
      : input?.item.tools;
    const mcpRequested = requestedTools?.some((name) => (MCP_TOOL_NAMES as readonly string[]).includes(name)) ?? false;
    const mcpRoleCeiling = role.toolPolicy === "inherit-parent"
      || role.capabilities.includes("memory.provider.mempalace")
      || role.tools.some((name) => (MCP_TOOL_NAMES as readonly string[]).includes(name));
    const effectiveRole = mcpRequested && mcpRoleCeiling && role.toolPolicy === "static"
      ? { ...role, tools: [...new Set([...role.tools, ...MCP_TOOL_NAMES])] }
      : role;
    const policy = computeEffectiveTools({
      parent,
      childLoadable: [...BUILTIN_CHILD_TOOLS, "sub", ...MCP_TOOL_NAMES],
      childDefinitions: parent.definitions,
      role: effectiveRole,
      callTools: requestedTools,
      hardDenied: [...(input ? [] : ["sub"]), ...formalHardDenied],
      currentDepth: input?.depth ?? Number(agent.metadata?.depth ?? 0),
    });
    const catalog = new ContextModelCatalog(context);
    const contextParent: ResolvedModelChoice | undefined = context.model ? {
      provider: context.model.provider,
      model: context.model.id,
      canonical: `${context.model.provider}/${context.model.id}`,
      layer: "parent-fallback",
      source: "inherited-parent",
      modelSource: "inherited-parent",
      thinkingSource: "inherited-parent",
      thinking: context.thinkingLevel as ModelThinking,
      speedTier: state.speedTier,
      persistent: false,
      oneShot: false,
    } : undefined;
    // Nested turns use the frozen direct-parent snapshot captured with the
    // accepted task. Continuation turns re-resolve current per-turn policy the
    // same way and never reuse the previous turn's one-shot.
    const parentResolution = input?.parentResolution ?? persistedParentResolution(agent, contextParent);
    if (input && input.depth > 0 && !parentResolution) throw new Error(`${controller.agentId}: nested turn is missing its frozen direct-parent model identity`);
    let choice = input?.modelChoice;
    if (choice) {
      await revalidateResolvedModelChoice(choice, catalog);
    } else {
      const configs = await new ModelConfigStore({
        globalPath: defaultGlobalModelConfigPath(),
        projectPath: defaultProjectModelConfigPath(context.cwd),
      }).load(context.isProjectTrusted());
      choice = await resolveAgentModel({
        input: {
          selector: role.selector,
          agentId: controller.agentId,
          projectTrusted: context.isProjectTrusted(),
          profile: parseOverride(role.model),
          parent: parentResolution,
          parentThinking: context.thinkingLevel as ModelThinking,
        },
        journal: state.runtime.journal,
        configs,
        catalog,
      });
    }
    const model = context.modelRegistry.find(choice.provider, choice.model);
    if (!model) throw new Error(`${choice.canonical}: resolved model disappeared before Agent turn start`);
    const turnId = input?.turnId ?? state.runtime.journal.getState().agents[controller.agentId]?.currentTurnId;
    if (turnId && state.runtime.journal.getState().turns[turnId]?.state === "running") {
      await state.runtime.journal.append({
        kind: "turn.audit",
        agentId: controller.agentId,
        jobId: input?.jobId,
        turnId,
        payload: {
          selector: role.selector,
          requestedModel: input?.item.model ?? null,
          requestedThinking: input?.item.thinking ?? null,
          profileHash: role.profileHash,
          sourceHash: role.sourceHash,
          profileVersion: role.profileVersion,
          runtimeAdapterVersion: role.runtimeAdapterVersion,
          effectiveTools: policy.effectiveTools,
          unavailableTools: policy.unavailable,
          provider: choice.provider,
          model: choice.model,
          effectiveModel: choice.canonical,
          modelLayer: choice.layer,
          source: choice.source,
          modelSource: choice.modelSource ?? choice.source,
          thinkingSource: choice.thinkingSource ?? (choice.layer === "parent-fallback" ? "inherited-parent" : choice.layer === "one-shot" ? (choice.source === "structured-request" ? "structured-request" : "user-one-shot") : "model-default"),
          ...(parentResolution?.canonical ? { parentModel: parentResolution.canonical } : {}),
          ...(parentResolution?.thinking ? { parentThinking: parentResolution.thinking } : {}),
          ...(parentResolution?.source ? { parentSource: parentResolution.source } : {}),
          thinking: choice.thinking,
          speedTier: choice.speedTier ?? "standard",
          effectiveMode: input
            ? (state.runtime.journal.getState().turns[turnId]?.metadata?.effectiveMode ?? "sync")
            : "sync",
          outputRef: `agent://${controller.agentId}`,
          historyRef: `history://${controller.agentId}`,
          oneShot: choice.oneShot,
          persistent: choice.persistent,
          ...(input?.modelDecision ? {
            overrideDecision: input.modelDecision.overrideDecision,
            ...(input.modelDecision.reason === undefined ? {} : { modelRequestReason: input.modelDecision.reason }),
          } : {}),
        },
      });
    }

    const resolver = new ChildPermissionResolver({ mode, cwd: childCwd, sandboxExecutorAvailable: sandbox.available });
    const permission = brokeredChildPermission(resolver, state.approval, {
      agentId: controller.agentId,
      jobId: input?.jobId ?? `sub-${controller.agentId}`,
      signal: input?.context.signal,
    });
    const approval = createChildApprovalBridge({
      agentId: controller.agentId,
      jobId: input?.jobId,
      cwd: childCwd,
      decide: permission.decide,
      requestApproval: permission.requestApproval,
    });
    const mcp = createAiliMcpExtension({
      configPath: resolveSharedMcpConfigPath(),
      approvalPolicy: {
        decide: async (request) => await permission.decide("mcp", {
          tool: request.prefixedToolName,
          server: request.serverName,
          args: request.args,
          origin: request.origin,
        }),
        requestApproval: async (request) => await permission.requestApproval({
          toolName: `mcp:${request.serverName}/${request.originalToolName}`,
          summary: `MCP ${request.origin} ${request.serverName}/${request.originalToolName}`,
        }),
      },
    });
    const prompt = assembleChildPrompt({
      runtimeEnvelope: [
        "Official Pi persistent Agent runtime. The parent conversation is not copied.",
        `Agent ID: ${controller.agentId}`,
        `Model: ${choice.canonical} (${choice.source ?? choice.layer}, thinking=${choice.thinking}, speed=${choice.speedTier ?? "standard"})`,
        `Unavailable requested tools: ${policy.unavailable.map((item) => `${item.name}:${item.reason}`).join(", ") || "none"}`,
        `Child sandbox: ${mode.sandbox.enabled ? (sandbox.available ? "active" : `unavailable (${sandbox.reason ?? "unknown"})`) : "not required by active mode"}`,
      ].join("\n"),
      role,
      task: snippetResolution
        ? assemblePromptModifiers("", input?.item.task ?? "Continue this persistent Agent.", snippetResolution.ordered).dynamicMessage
        : input?.item.task ?? "Continue this persistent Agent.",
      context: input?.item.context,
      cwd: childCwd,
      workspace: { mode: workspace.mode, root: workspace.root },
      ...(formalProtection ? {
        formalResultInstruction: renderCanonicalFormalResultInstruction({
          packageId: normalizeFormalContinuationAudit(
            agent.metadata?.formalContinuationIdentity,
            `${controller.agentId}.formalContinuationIdentity`,
          ).packageId,
          roleId: role.selector,
        }),
      } : {}),
    });
    return await createPersistentChildSession({
      cwd: childCwd,
      agentDir: getAgentDir(),
      projectTrusted: context.isProjectTrusted(),
      sessionManager: manager,
      prompt,
      policy,
      childExtensions: [
        { name: "aili-child-approval", factory: approval },
        { name: "aili-child-workspace", factory: createWorkspaceMutationGuard(state.leases, controller.agentId) },
        { name: "aili-child-mcp", factory: mcp },
        { name: "aili-child-context", factory: createProviderRoutedContextExtension() },
        { name: "aili-child-retry", factory: createExplainableRetryExtension() },
        { name: "aili-child-codex-fast", factory: createCodexFastExtension(choice.provider, choice.speedTier ?? "standard", async (evidence) => {
          if (turnId) await state.runtime.journal.append({ kind: "turn.audit", agentId: controller.agentId, jobId: input?.jobId, turnId, payload: { speedTier: choice.speedTier ?? "standard", priorityRequestApplied: evidence.applied, priorityRequestReason: evidence.reason } });
        }) },
      ],
      topLevelExtensionNames: ["aili-runtime", "aili-top-coordinator"],
      modelRuntime: this.options.childModelRuntime,
      model: model as CreateAgentSessionOptions["model"],
      thinkingLevel: choice.thinking as CreateAgentSessionOptions["thinkingLevel"],
    });
  }

  clearPark(state: ParentState, agentId: string): void {
    const timer = state.parkTimers.get(agentId);
    if (timer) clearTimeout(timer);
    state.parkTimers.delete(agentId);
  }

  schedulePark(state: ParentState, agentId: string, ttlMs = DEFAULT_IDLE_TTL_MS): void {
    this.clearPark(state, agentId);
    if (ttlMs <= 0) return;
    // Internal resource recovery only: after the idle TTL the live controller
    // is disposed while the settled Child Session stays continuable by task_id.
    const timer = setTimeout(() => {
      void (async () => {
        const controller = state.controllers.get(agentId);
        if (!controller) return;
        await controller.dispose().catch(() => undefined);
        state.controllers.delete(agentId);
      })();
    }, ttlMs);
    timer.unref?.();
    state.parkTimers.set(agentId, timer);
  }

  async finalizeWorkspace(state: ParentState, agentId: string): Promise<void> {
    const record = state.isolated.get(agentId);
    if (!record) return;
    state.isolated.set(agentId, await state.isolation.finalize(record));
  }

  private async parent(context: ExtensionContext): Promise<ParentState> {
    const parentPath = context.sessionManager.getSessionFile();
    if (!parentPath) throw new Error("persistent Agents require a durable parent Pi Session JSONL; save/start the parent session first");
    if (this.activeParentPath !== undefined && this.activeParentPath !== parentPath) {
      // Also invalidate pending work when the host switches without shutdown.
      this.sessionEpoch += 1;
    }
    this.activeParentPath = parentPath;
    let pending = this.parents.get(parentPath);
    if (!pending) {
      pending = this.createParent(context, parentPath);
      this.parents.set(parentPath, pending);
    }
    const state = await pending;
    state.context = context;
    return state;
  }

  private async createParent(context: ExtensionContext, parentPath: string): Promise<ParentState> {
    const parentId = context.sessionManager.getSessionId();
    let state!: ParentState;
    const approval = new ParentApprovalBroker({
      get hasUI() { return state?.context.hasUI ?? context.hasUI; },
      ask: async (packet) => {
        const active = state?.context ?? context;
        if (!active.hasUI) return "dismiss";
        const activityBackend = packet.modeLabel === "Herdr" ? "herdr" as const : "managed" as const;
        const activityDriver = activityBackend === "herdr" ? "pi-cli" as const : "pi-sdk" as const;
        if (activityBackend === "managed") state?.runtime.activity.publish({ kind: "interaction.requested", source: "precise", agentId: packet.agentId, jobId: packet.jobId, backend: activityBackend, driver: activityDriver, data: { interactionKind: "permission", promptKind: "select" } });
        try {
          const choice = await active.ui.select("AILI Agent tool approval", ["Allow once", "Deny"], { signal: active.signal });
          return choice === "Allow once" ? "allow" : choice === "Deny" ? "deny" : "dismiss";
        } finally {
          if (activityBackend === "managed") state?.runtime.activity.publish({ kind: "interaction.resolved", source: "precise", agentId: packet.agentId, jobId: packet.jobId, backend: activityBackend, driver: activityDriver, data: { interactionKind: "permission" } });
        }
      },
    });
    let modelService!: ModelConfigurationService;
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentPath,
      parentId,
      cwd: context.cwd,
      requestInteraction: async (request) => {
        // Herdr exposes only a blocked lifecycle status here, not a bounded
        // operation packet that could prove existing task authorization.
        // Fail closed without opening a Parent/user dialog.
        if (request.kind === "external-cui-confirmation") return "deny";
        if (request.kind === "permission") {
          return approval.request({ agentId: request.agentId, jobId: request.jobId, toolName: String(request.payload.toolName ?? "unknown"), summary: String(request.payload.summary ?? "Herdr child permission request"), modeLabel: "Herdr" }, request.signal);
        }
        const active = state?.context ?? context;
        if (!active.hasUI || request.signal.aborted) return "deny";
        const options = Array.isArray(request.payload.options) ? request.payload.options.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
        const question = String(request.payload.question ?? "Herdr child question");
        return approval.requestQuestion({
          agentId: request.agentId,
          jobId: request.jobId,
          question,
          signal: request.signal,
          fallback: "deny",
          render: async () => {
            const result = await askUserQuestionnaire(active, normalizeQuestions([{ id: request.interactionId, header: "Agent question", question, options: options.map((label) => ({ label })) }]), request.signal);
            const answer = result.answers[0];
            return answer?.customInput ?? answer?.selectedOptions[0] ?? "deny";
          },
        });
      },
      herdrMaxLiveSurfaces: (await resolveHerdrRuntimeOptions({
        cwd: context.cwd,
        projectTrusted: context.isProjectTrusted(),
        globalPath: this.globalBackendConfigPath(),
      })).maxLiveSurfaces,
      resolveBackend: async () => {
        // Always read live state: the session override may have been set
        // after this runtime was constructed.
        const selection = await resolveBackendSelection({
          cwd: context.cwd,
          sessionOverride: this.sessionBackendOverrides.get(parentPath),
          projectTrusted: (state?.context ?? context).isProjectTrusted(),
          globalPath: this.globalBackendConfigPath(),
        });
        return selection.backend;
      },
      preallocate: async (input) => await this.prepareTaskPreflight(state, parentPath, input),
      preflight: async (input) => {
        if (!input.formalProtection) return;
        await this.ensureWorkspace(state, input, input.formalProtection);
        await this.assertFormalExecutionIdentity(state, input.agentId, input);
      },
      execute: async (input) => {
        const controller = new ProductionAgentController(this, state, input.agentId, input.sessionManager);
        state.controllers.set(input.agentId, controller);
        try {
          return { output: await controller.runInitial(input) };
        } catch (error) {
          await controller.dispose().catch(() => undefined);
          state.controllers.delete(input.agentId);
          return { status: "failed", output: "", error: error instanceof Error ? error.message : String(error) };
        }
      },
      parentDelivery: {
        scanDeliveryIds: async () => new Set((state?.context ?? context).sessionManager.getEntries()
          .filter((entry) => entry.type === "custom_message" && isRecord(entry.details) && typeof entry.details.deliveryId === "string")
          .map((entry) => (entry as { details: { deliveryId: string } }).details.deliveryId)),
        send: async (message) => {
          if (this.activeParentPath !== parentPath) return "unavailable";
          this.pi.sendMessage({ customType: message.customType, content: message.content, display: message.display, details: message.details }, { triggerTurn: true, deliverAs: "nextTurn" });
          return "sent";
        },
      },
    });
    const store = new ModelConfigStore({
      globalPath: defaultGlobalModelConfigPath(),
      projectPath: defaultProjectModelConfigPath(context.cwd),
    });
    modelService = new ModelConfigurationService(store, runtime.journal, async (override) => {
      const resolved = await new ContextModelCatalog(state.context).resolve(override.model);
      if (!resolved?.available || !resolved.authenticated) throw new Error(`${override.model}: model is unavailable or unauthenticated`);
    });
    state = {
      parentPath,
      parentId,
      context,
      runtime,
      approval,
      models: modelService,
      leases: new WorkspaceLeaseManager(),
      isolation: new GitIsolationAdapter(runtime.layout, runtime.journal),
      workspaces: new Map(),
      childCwds: new Map(),
      isolated: new Map(),
      controllers: new Map(),
      parkTimers: new Map(),
      speedTier: "standard",
      currentTurnModelAuthority: defaultCurrentTurnModelAuthority(),
    };
    return state;
  }

  /** /aili-agents: user-level agent overview + herdr focus. Read-only against
   *  the durable journal; live surface info is advisory only. */
  private async directAgents(args: string, context: ExtensionContext): Promise<string> {
    const state = await this.parent(context);
    const trimmed = args.trim();
    if (trimmed.startsWith("answer ")) {
      const rest = trimmed.slice("answer ".length).trim();
      const separator = rest.indexOf(" ");
      if (separator < 1) throw new Error("usage: /aili-agents answer <interaction_id> <answer>");
      const id = rest.slice(0, separator);
      const answer = rest.slice(separator + 1).trim();
      if (!answer || !state.approval.answerInteraction(id, answer)) throw new Error(`interaction ${id} is not pending`);
      return `interaction ${id} answered`;
    }
    if (trimmed === "interactions" || trimmed.startsWith("interactions ")) {
      const taskId = trimmed.slice("interactions".length).trim() || undefined;
      return JSON.stringify(state.approval.pendingInteractions(taskId), null, 2);
    }
    if (trimmed.startsWith("inspect ")) {
      const taskId = trimmed.slice("inspect ".length).trim();
      if (!taskId) throw new Error("usage: /aili-agents inspect <task_id>");
      const snapshot = state.runtime.journal.getState();
      const agent = snapshot.agents[taskId] ?? snapshot.releasedAgents[taskId];
      if (!agent) throw new Error(`${taskId} is unknown in this parent session`);
      const run = Object.values(snapshot.runs).filter((item) => item.agentId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
      const loadout = run ? await readFile(join(state.runtime.layout.root, "herdr-runs", run.runId, "loadout.json"), "utf8").then(JSON.parse).catch(() => undefined) : undefined;
      const diff = run ? await readFile(join(state.runtime.layout.root, "herdr-runs", run.runId, "loadout-diff.json"), "utf8").then(JSON.parse).catch(() => undefined) : undefined;
      return JSON.stringify({ agent, run, loadout, diff, activity: state.runtime.activity.overlay(taskId, 30_000) }, null, 2);
    }
    if (trimmed.startsWith("activity ")) {
      const taskId = trimmed.slice("activity ".length).trim();
      if (!taskId) throw new Error("usage: /aili-agents activity <task_id>");
      return JSON.stringify({ overlay: state.runtime.activity.overlay(taskId, 30_000), events: state.runtime.activity.list(taskId).slice(-50) }, null, 2);
    }
    if (trimmed.startsWith("focus ")) {
      const taskId = trimmed.slice("focus ".length).trim();
      if (!taskId) throw new Error("usage: /aili-agents focus <task_id>");
      const agent = state.runtime.journal.getState().agents[taskId] ?? state.runtime.journal.getState().releasedAgents[taskId];
      if (!agent) throw new Error(`${taskId} is unknown in this parent session`);
      const backend = agent.backend ?? "managed";
      if (backend !== "herdr") return `${taskId} runs on the managed backend: no external execution surface to focus`;
      const result = await state.runtime.herdrBackend.focusAgent(taskId);
      return result.message;
    }
    const journalState = state.runtime.journal.getState();
    const surfaces = new Map(state.runtime.herdrBackend.surfaceOverview().map((entry) => [entry.agentId, entry]));
    const agents = Object.values(journalState.agents);
    if (agents.length === 0) return "No active persistent Agents in this parent session";
    const lines = agents
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((agent) => {
        const backend = agent.backend ?? "managed";
        const surface = surfaces.get(agent.id);
        const surfaceText = surface ? ` · pane ${surface.paneId}${surface.busy ? " busy" : " idle"}` : "";
        const activity = state.runtime.activity.overlay(agent.id, 30_000);
        const activityText = activity.state === "stalled" ? `${activity.workState} (stalled)` : activity.workState;
        return `${agent.id} · ${agent.selector} · ${agent.state} · ${backend}${surfaceText} · activity ${activityText}`;
      });
    lines.push("", "usage: /aili-agents focus <task_id> | activity <task_id> | inspect <task_id> | interactions [task_id] | answer <interaction_id> <answer>");
    return lines.join("\n");
  }

  /** /aili-agent-backend: user-only backend switch. Deliberately runtime-free:
   *  it must work before the parent session JSONL is materialized on disk
   *  (official Pi defers that write), where runtime/sidecar creation would
   *  fail. The override lives in sessionBackendOverrides and is picked up by
   *  the runtime whenever it is first created. */
  private async directBackend(args: string, context: ExtensionContext): Promise<string> {
    const command = parseBackendCommand(args);
    const parentPath = (context.sessionManager as SessionManager & { getSessionFile?: () => string | undefined }).getSessionFile?.();
    if (command?.scope === "session" && command.action === "status") {
      const selection = await resolveBackendSelection({
        cwd: context.cwd,
        sessionOverride: parentPath ? this.sessionBackendOverrides.get(parentPath) : undefined,
        projectTrusted: context.isProjectTrusted(),
        globalPath: this.globalBackendConfigPath(),
      });
      const lines = [describeBackendSelection(selection, ["managed", "herdr"])];
      try {
        const { detectHerdrComponents, describeHerdrAvailability } = await import("./backends/herdr/availability.js");
        const [availability, probe] = await Promise.all([
          detectHerdrComponents(),
          probeHerdrDaemon(),
        ]);
        lines.push("", describeHerdrAvailability(availability, probe.socketReachable));
      } catch {
        // Status stays useful even when probing fails; explicit errors come
        // from actual submissions, never silent fallbacks.
      }
      return lines.join("\n");
    }
    if (!command) {
      throw new Error("usage: /aili-agent-backend <s|h|m> | global <herdr|managed|clear> (status|herdr|manage also supported)");
    }
    if (!parentPath) {
      throw new Error("persistent Agents require a durable parent Pi Session; save/start the parent session before switching backends");
    }
    if (command.scope === "global") {
      // Do not alter the live session override until the lock-protected atomic
      // replacement has succeeded. A malformed config, held lock, or failed
      // replacement therefore leaves both durable and session state intact.
      await new BackendConfigStore({ globalPath: this.globalBackendConfigPath() })
        .setGlobalBackend(command.action === "clear" ? undefined : command.action);
      if (command.action === "clear") this.sessionBackendOverrides.delete(parentPath);
      else this.sessionBackendOverrides.set(parentPath, command.action);
      return [
        command.action === "clear"
          ? "Global backend preference cleared; New Agents now use trusted project settings or the managed default"
          : `Global backend preference set to ${command.action}; New Agents in this session now use ${command.action}`,
        "Existing Agents: unchanged (each agent keeps its creation-time backend)",
      ].join("\n");
    }
    if (command.action === "status") {
      // The status branch above handles this command before a durable-session
      // requirement or a session override can be applied.
      throw new Error("backend status command was not handled");
    }
    const action = command.action;
    this.sessionBackendOverrides.set(parentPath, action);
    const lines = [
      `New Agents: ${action}`,
      "Existing Agents: unchanged (each agent keeps its creation-time backend)",
    ];
    try {
      const probe = await probeHerdrDaemon();
      if (action === "herdr" && !probe.socketReachable) {
        lines.push("warning: herdr daemon socket is unreachable; new-agent submissions will fail explicitly instead of falling back");
      }
    } catch {
      // Probe failures are advisory only.
    }
    return lines.join("\n");
  }

  private globalBackendConfigPath(): string {
    return this.options.globalBackendConfigPath ?? defaultGlobalBackendConfigPath();
  }

  /** Recheck every allocatable result, independently of explicit fields or UI.
   * Recheck synchronous state again after realpath itself yields to the host. */
  private async assertPreflightBoundaryCurrent(
    state: ParentState,
    context: ExtensionContext,
    boundary: PreflightBoundary,
    signal?: AbortSignal,
  ): Promise<void> {
    const active = state.context;
    const contextCwd = context.cwd;
    const activeCwd = active.cwd;
    const current = () => !signal?.aborted && !context.signal?.aborted && !state.context.signal?.aborted
      && this.sessionEpoch === boundary.epoch
      && (this.activeParentPath === undefined || this.activeParentPath === boundary.parentPath)
      && state.parentPath === boundary.parentPath
      && state.parentId === boundary.sessionId
      && context.sessionManager.getSessionId() === boundary.sessionId
      && state.context.sessionManager.getSessionId() === boundary.sessionId
      && this.optionalSessionFile(context) === boundary.parentPath
      && this.optionalSessionFile(state.context) === boundary.parentPath;
    const fail = () => {
      // Retain the legacy public error code, not the retired UI dependency.
      throw new SubRequestError("SUB_SELECTION_DENIED", "subagent preflight expired: request aborted or Parent session/canonical project changed before allocation");
    };
    if (!current()) fail();
    const projects = await Promise.all([contextCwd, activeCwd, state.runtime.repositoryRoot]
      .map((cwd) => realpath(cwd).catch(() => undefined)));
    if (!current() || context.cwd !== contextCwd || state.context.cwd !== activeCwd
      || projects.some((project) => project !== boundary.cwd)) fail();
  }

  private async prepareTaskPreflight(
    state: ParentState,
    parentPath: string,
    input: TaskPreflightInput,
  ): Promise<TaskPreflightResult> {
    const { item, role, ancestry, continuation } = input;
    const parentContext = state.context;
    const signals = [input.signal, parentContext.signal].filter((signal): signal is AbortSignal => signal !== undefined);
    const requestSignal = signals.length > 0 ? AbortSignal.any(signals) : undefined;
    if (requestSignal?.aborted) {
      throw new SubRequestError("SUB_SELECTION_DENIED", "the subagent request was already aborted before preflight");
    }
    const sessionId = parentContext.sessionManager.getSessionId();
    const epoch = this.sessionEpoch;
    const project = await realpath(parentContext.cwd);
    const boundary: PreflightBoundary = { sessionId, epoch, parentPath, cwd: project };
    await this.assertPreflightBoundaryCurrent(state, parentContext, boundary, requestSignal);
    const authority = ancestry?.currentTurnModelAuthority
      ?? ancestry?.currentTurnAuthority
      ?? ancestry?.authority
      ?? defaultCurrentTurnModelAuthority();
    let nestedCli: ExternalCliId | undefined;
    if (item.cli !== undefined) {
      try {
        nestedCli = validateCurrentTurnCliRequest(item.cli, authority);
      } catch (error) {
        throw new SubRequestError("SUB_CLI_DENIED", error instanceof Error ? error.message : String(error));
      }
    }
    if (ancestry && !ancestry.parentResolution) {
      throw new Error(`${role.selector}: nested sub is missing the frozen direct-parent model identity`);
    }
    const parent: ResolvedModelChoice | undefined = ancestry?.parentResolution ?? (parentContext.model ? {
      provider: parentContext.model.provider,
      model: parentContext.model.id,
      canonical: `${parentContext.model.provider}/${parentContext.model.id}`,
      layer: "parent-fallback",
      source: "inherited-parent",
      modelSource: "inherited-parent",
      thinkingSource: "inherited-parent",
      thinking: parentContext.thinkingLevel as ModelThinking,
      speedTier: state.speedTier,
      persistent: false,
      oneShot: false,
    } : undefined);
    const existing = continuation ? state.runtime.journal.getState().agents[continuation.agentId] : undefined;
    if (existing && nestedCli !== undefined) {
      if (resolveAgentBackend(existing) !== "herdr" || existing.driver !== "external-cli") {
        throw new SubRequestError("SUB_CLI_CONTINUATION", `${existing.id} has a frozen non-external driver; create a new Agent for ${nestedCli}`);
      }
      if (existing.metadata?.nestedCli !== nestedCli) {
        throw new SubRequestError("SUB_CLI_CONTINUATION", `${existing.id} is frozen to external CLI ${String(existing.metadata?.nestedCli ?? "unknown")}; changing the product is not allowed`);
      }
    }

    const configured = await resolveBackendSelection({
      cwd: parentContext.cwd,
      sessionOverride: this.sessionBackendOverrides.get(parentPath),
      projectTrusted: parentContext.isProjectTrusted(),
      globalPath: this.globalBackendConfigPath(),
    });
    const backend = nestedCli ? "herdr" as const : existing ? resolveAgentBackend(existing) : configured.backend;
    const permissionModeSnapshot = (() => {
      const config = loadModeConfig(parentContext.cwd, getAgentDir(), () => undefined);
      const resolvedMode = resolveCurrentMode(config, parentContext);
      return { name: resolvedMode.name, mode: structuredClone(resolvedMode.mode) };
    })();

    const catalog = nestedCli ? undefined : new ContextModelCatalog(parentContext);
    let canonicalModel: string | undefined;
    if (!nestedCli && item.model !== undefined) {
      try {
        canonicalModel = (await resolveSubModelIdentifier(item.model, catalog!)).canonical;
      } catch (error) {
        if (error instanceof SubModelRequestError) throw new SubRequestError(error.code, withoutSubCode(error));
        throw error;
      }
    }

    const hasRequest = nestedCli !== undefined || item.model !== undefined || item.thinking !== undefined;
    const modelDecision: SubagentModelDecision | undefined = hasRequest ? {
      requestedModel: item.model ?? null,
      requestedThinking: item.thinking ?? null,
      overrideDecision: "accepted-structured-request",
    } : undefined;

    if (nestedCli !== undefined) {
      assertHerdrRoleSupported(role, { ...item, cli: nestedCli });
      const requiredIntegration = EXTERNAL_CLI_REGISTRY[nestedCli].requiredHerdrIntegration;
      if (requiredIntegration) {
        const integration = await detectHerdrIntegrationStatus(requiredIntegration);
        if (!integration.current) {
          throw new SubRequestError(
            "SUB_CLI_UNAVAILABLE",
            `requested ${nestedCli} requires Herdr integration '${requiredIntegration}' with exact status current (observed ${integration.status ?? "missing/unavailable"}); run manually: 'herdr integration install ${requiredIntegration}'. AILI will not install it automatically`,
          );
        }
      }
      const availability = await probeHerdrDaemon();
      if (!availability.socketReachable) {
        throw new SubRequestError("SUB_CLI_UNAVAILABLE", "requested external CLI requires an available Herdr daemon; no fallback to managed Pi is permitted");
      }
      const cliProbe = await probeExternalCli(nestedCli, requestSignal);
      const launchPlan = createExternalCliLaunchPlan(cliProbe, permissionModeSnapshot?.name === "yolo", {
        model: item.model,
        thinking: item.thinking,
      });
      await this.assertPreflightBoundaryCurrent(state, parentContext, boundary, requestSignal);
      return {
        parentResolution: parent,
        currentTurnModelAuthority: authority,
        ...(modelDecision ? { modelDecision } : {}),
        backend,
        nestedCli,
        cliProbe,
        launchPlan,
        permissionModeSnapshot,
      };
    }

    // Fields are independent, turn-local structured requests, not a claim
    // that a user confirmation took place. Never persist them as overrides.
    const oneShot: TaskModelRequest | undefined = hasRequest ? {
      ...(canonicalModel === undefined ? {} : { model: canonicalModel }),
      ...(item.thinking === undefined ? {} : { thinking: item.thinking }),
    } : undefined;
    const configs = await new ModelConfigStore({
      globalPath: defaultGlobalModelConfigPath(),
      projectPath: defaultProjectModelConfigPath(parentContext.cwd),
    }).load(parentContext.isProjectTrusted());
    const resolutionInput = {
      selector: role.selector,
      agentId: continuation?.agentId ?? `preflight:${role.selector}`,
      oneShot,
      projectTrusted: parentContext.isProjectTrusted(),
      profile: parseOverride(role.model),
      parent,
      parentThinking: parentContext.thinkingLevel as ModelThinking,
    } as const;
    let choice: ResolvedModelChoice;
    try {
      choice = await resolveAgentModel({ input: resolutionInput, journal: state.runtime.journal, configs, catalog: catalog! });
    } catch (error) {
      if (error instanceof SubRequestError) throw error;
      if (error instanceof ModelSelectionError && (item.model !== undefined || item.thinking !== undefined)) {
        const code = error.message.includes("thinking") ? "SUB_THINKING_UNSUPPORTED" : "SUB_MODEL_UNAVAILABLE";
        throw new SubRequestError(code, correctiveModelGuidance(item, catalog!, error));
      }
      throw error;
    }
    await this.assertPreflightBoundaryCurrent(state, parentContext, boundary, requestSignal);
    return {
      choice,
      parentResolution: parent,
      currentTurnModelAuthority: authority,
      backend,
      permissionModeSnapshot,
      ...(modelDecision ? { modelDecision } : {}),
    };
  }

  private childToolDefinitions(
    state: ParentState,
    input: PersistentRuntimeExecutorInput | undefined,
    role: RoleProfile,
    sandboxedBash?: ToolDefinition,
  ): ToolDefinition[] {
    const task: ToolDefinition = {
      name: "sub",
      label: "Sub",
      description: "Run one nested persistent Agent turn synchronously within the explicit spawn/depth policy. Align requirements before supplying per-turn model/thinking/cli; strict preflight has no extra selection confirmation. selectionScope is descriptive only and ordinary permissions remain. Nested calls are foreground and synchronous; task_id continues a settled nested child of this caller.",
      parameters: SUB_TOOL_SCHEMA,
      ...SUB_RENDERERS,
      execute: async (_id, params, signal, onUpdate) => {
        if (!input) throw new Error("nested sub is unavailable outside an inherited scheduled turn");
        const result = await state.runtime.sub.submit(params, {
          parentAgentId: input.agentId,
          parentSelector: role.selector,
          parentDepth: input.depth,
          inheritedPermit: input.context.permit,
          ...(input.modelChoice ? { parentResolution: input.modelChoice } : {}),
          currentTurnModelAuthority: input.currentTurnModelAuthority ?? defaultCurrentTurnModelAuthority(),
          authority: input.currentTurnModelAuthority ?? defaultCurrentTurnModelAuthority(),
          ...(input.item.formalContext ? { formalChangeId: input.item.formalContext.changeId } : {}),
        }, signal, onUpdate as unknown as TaskUpdateCallback | undefined);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      },
    };
    return [task, ...(sandboxedBash ? [sandboxedBash] : [])];
  }

  private async validateFormalWorkspaceLocation(state: ParentState, lease: FormalWorkspaceLease): Promise<string> {
    const agentId = lease.agentId;
    if (!sameIdentity(lease.protectedPaths, lease.formalProtection.protectedPaths)
      || lease.selector !== lease.formalWorkspaceRequest.selector
      || lease.formalContinuationIdentity.canonicalRole !== lease.selector
      || lease.requestedMode !== lease.formalWorkspaceRequest.mode
      || (lease.requestedMode === "shared" && lease.mode !== "shared")
      || (lease.requestedMode === "isolated" && lease.mode !== "isolated")) {
      throw new Error(`${agentId}: persisted formal workspace mode/protection/role identity is inconsistent`);
    }
    const canonicalProject = await realpath(state.context.cwd);
    const storedProject = await realpath(lease.projectRoot).catch((error) => {
      throw new Error(`${agentId}: persisted workspace project root is unavailable (${error instanceof Error ? error.message : String(error)})`);
    });
    if (storedProject !== lease.projectRoot || storedProject !== canonicalProject) {
      throw new Error(`${agentId}: persisted workspace project root differs from the current exact root`);
    }
    if (lease.mode === "shared") {
      const sharedRoot = await realpath(lease.root).catch((error) => {
        throw new Error(`${agentId}: persisted shared workspace root is unavailable (${error instanceof Error ? error.message : String(error)})`);
      });
      if (sharedRoot !== canonicalProject || lease.root !== canonicalProject) {
        throw new Error(`${agentId}: persisted shared workspace root differs from the current exact root`);
      }
    } else {
      const isolated = await state.isolation.restore(agentId);
      if (isolated.projectRoot !== lease.projectRoot || isolated.root !== lease.root) {
        throw new Error(`${agentId}: isolated workspace mode/root differs from the durable lease; shared fallback is forbidden`);
      }
      state.isolated.set(agentId, isolated);
    }
    const expectedScope = await validateWriteScope(canonicalProject, lease.formalWorkspaceRequest.writeScope);
    if (!sameIdentity(expectedScope, lease.scope)) {
      throw new Error(`${agentId}: persisted formal workspace writeScope differs from the canonical scope`);
    }
    const canonicalCwd = await validateWorkspaceCwd(lease.root, lease.formalWorkspaceRequest.cwd);
    if (canonicalCwd !== lease.cwd) throw new Error(`${agentId}: persisted formal workspace cwd differs from the current exact cwd`);
    return canonicalCwd;
  }

  private async restoreFormalWorkspace(state: ParentState, agentId: string): Promise<WorkspaceLease | undefined> {
    const existing = state.workspaces.get(agentId);
    if (existing) return existing;
    const lease = persistedFormalWorkspaceLease(state.runtime.journal.getState().workspaceLeases[agentId], agentId);
    if (!lease) return undefined;
    const canonicalCwd = await this.validateFormalWorkspaceLocation(state, lease);
    state.leases.acquire(lease);
    state.workspaces.set(agentId, lease);
    state.childCwds.set(agentId, canonicalCwd);
    return lease;
  }

  private async assertFormalExecutionIdentity(
    state: ParentState,
    agentId: string,
    input?: TaskExecutorInput,
    knownRole?: RoleProfile,
  ): Promise<void> {
    const registry = state.runtime.journal.getState();
    const agent = registry.agents[agentId];
    if (!agent) throw new Error(`${agentId}: formal Agent registry record is missing`);
    const protection = persistedFormalProtection(agent.metadata);
    if (!protection) {
      if (registry.workspaceLeases[agentId]) throw new Error(`${agentId}: ordinary Agent has an unexpected formal workspace lease`);
      return;
    }
    const continuation = normalizeFormalContinuationAudit(agent.metadata?.formalContinuationIdentity, `${agentId}.formalContinuationIdentity`);
    const request = persistedFormalWorkspaceRequest(agent.metadata);
    if (!request || request.selector !== agent.selector || continuation.canonicalRole !== agent.selector) {
      throw new Error(`${agentId}: persisted formal role/workspace continuation identity is inconsistent`);
    }
    const role = knownRole ?? (await loadRoleProfiles()).find((candidate) => candidate.selector === agent.selector);
    if (!role) throw new Error(`${agent.selector}: role profile is unavailable`);
    assertCurrentFormalRoleProfile(agent, role);
    const currentProtection = await resolveFormalTaskProtection(
      state.context.cwd,
      protection.changeId,
      continuation,
      request.writeScope,
    );
    if (!sameFormalProtection(protection, currentProtection)) {
      throw new Error(`${agentId}: formal change/protected paths differ from the current canonical board identity`);
    }
    const lease = await this.restoreFormalWorkspace(state, agentId);
    if (!lease) throw new Error(`${agentId}: formal workspace lease is missing; continuation is refused`);
    const durableLease = persistedFormalWorkspaceLease(registry.workspaceLeases[agentId], agentId);
    if (!durableLease || !sameIdentity(lease, durableLease)) {
      throw new Error(`${agentId}: active formal workspace lease differs from the durable journal identity`);
    }
    await this.validateFormalWorkspaceLocation(state, lease as FormalWorkspaceLease);
    if (!sameFormalProtection(protection, lease.formalProtection)
      || !sameIdentity(continuation, lease.formalContinuationIdentity)
      || !sameIdentity(request, lease.formalWorkspaceRequest)
      || lease.selector !== agent.selector
      || !sameIdentity(lease.protectedPaths, protection.protectedPaths)) {
      throw new Error(`${agentId}: formal change/protected paths/workspace/role continuation identity differs from the durable lease`);
    }
    const job = registry.jobs[lease.jobId!];
    const turn = registry.turns[lease.initialTurnId!];
    if (!job || job.agentId !== agentId || !turn || turn.agentId !== agentId || turn.jobId !== job.id) {
      throw new Error(`${agentId}: formal workspace lease lost its exact initial job/turn ownership`);
    }
    for (const key of ["formalProtection", "formalContinuationIdentity", "formalWorkspaceRequest"] as const) {
      const expected = lease[key];
      if (!sameIdentity(agent.metadata?.[key], expected)
        || !sameIdentity(job.metadata?.[key], expected)
        || !sameIdentity(turn.metadata?.[key], expected)) {
        throw new Error(`${agentId}: formal ${key} differs across Agent/job/initial turn/workspace lease`);
      }
    }
    if (input) {
      if (input.agentId !== agentId
        || input.jobId !== lease.jobId
        || input.turnId !== lease.initialTurnId
        || input.role.selector !== agent.selector
        || input.item.formalContext?.changeId !== protection.changeId
        || !sameFormalProtection(input.formalProtection, protection)
        || !sameIdentity(input.item.continuationAudit, continuation)
        || input.item.workspace !== request.mode
        || (input.item.cwd ?? ".") !== request.cwd
        || !sameIdentity(input.item.writeScope, request.writeScope)) {
        throw new Error(`${agentId}: initial formal task identity differs from the durable Agent/job/turn/workspace lease`);
      }
    }
  }

  private async ensureWorkspace(
    state: ParentState,
    input: TaskExecutorInput,
    formalProtection?: FormalTaskProtection,
  ): Promise<WorkspaceLease> {
    const existing = state.workspaces.get(input.agentId);
    if (existing) {
      const current = existing.protectedPaths
        ? { changeId: formalProtection?.changeId ?? "", protectedPaths: existing.protectedPaths as [string, string] }
        : undefined;
      if (!sameFormalProtection(formalProtection, current)) {
        throw new Error(`${input.agentId}: workspace protection changed during the Agent lifecycle`);
      }
      if (formalProtection) {
        const request = persistedFormalWorkspaceRequest(state.runtime.journal.getState().agents[input.agentId]?.metadata);
        if (!request
          || request.mode !== input.item.workspace
          || request.cwd !== (input.item.cwd ?? ".")
          || request.selector !== input.role.selector
          || !sameIdentity(request.writeScope, input.item.writeScope)) {
          throw new Error(`${input.agentId}: formal workspace mode, cwd, role, or writeScope changed during the Agent lifecycle`);
        }
      }
      return existing;
    }
    const projectRoot = formalProtection ? await realpath(state.context.cwd) : state.context.cwd;
    const scope = await validateWriteScope(projectRoot, input.item.writeScope);
    const decision = state.leases.decide(input.agentId, input.item.workspace, projectRoot, scope);
    let root = projectRoot;
    if (decision.mode === "isolated") {
      const record = await state.isolation.create(input.agentId, projectRoot);
      state.isolated.set(input.agentId, record);
      root = record.root;
    }
    const cwd = await validateWorkspaceCwd(root, input.item.cwd);
    const agent = state.runtime.journal.getState().agents[input.agentId];
    if (!agent) throw new Error(`${input.agentId}: Agent record disappeared before workspace acquisition`);
    const formalContinuationIdentity = formalProtection
      ? normalizeFormalContinuationAudit(agent.metadata?.formalContinuationIdentity, `${input.agentId}.formalContinuationIdentity`)
      : undefined;
    const formalWorkspaceRequest = formalProtection ? persistedFormalWorkspaceRequest(agent.metadata) : undefined;
    if (formalProtection && (!formalWorkspaceRequest
      || formalWorkspaceRequest.mode !== input.item.workspace
      || formalWorkspaceRequest.cwd !== (input.item.cwd ?? ".")
      || formalWorkspaceRequest.selector !== input.role.selector
      || !sameIdentity(formalWorkspaceRequest.writeScope, input.item.writeScope))) {
      throw new Error(`${input.agentId}: formal workspace request differs from the durable Agent identity`);
    }
    const lease: WorkspaceLease = {
      agentId: input.agentId,
      mode: decision.mode,
      projectRoot,
      root,
      scope,
      ...(formalProtection ? { protectedPaths: [...formalProtection.protectedPaths] } : {}),
      ...(formalProtection && formalContinuationIdentity && formalWorkspaceRequest ? {
        requestedMode: input.item.workspace,
        cwd,
        selector: input.role.selector,
        jobId: input.jobId,
        initialTurnId: input.turnId,
        formalProtection,
        formalContinuationIdentity,
        formalWorkspaceRequest,
      } : {}),
      acquiredAt: new Date().toISOString(),
    };
    state.leases.acquire(lease);
    if (formalProtection) {
      try {
        await persistFormalWorkspaceLease(state.runtime.journal, lease as FormalWorkspaceLease);
      } catch (error) {
        state.leases.release(input.agentId);
        throw error;
      }
    }
    state.workspaces.set(input.agentId, lease);
    state.childCwds.set(input.agentId, cwd);
    return lease;
  }

  private async directFast(args: string, context: ExtensionContext): Promise<string> {
    const enabled = args.trim();
    if (enabled !== "true" && enabled !== "false") throw new Error("usage: /codex-fast <true|false>");
    const state = await this.parent(context);
    state.speedTier = enabled === "true" ? "priority" : "standard";
    return `Persistent Agent Codex Fast ${enabled === "true" ? "enabled" : "disabled"} for this Parent session`;
  }

  private async directModel(args: string, context: ExtensionContext): Promise<string> {
    const [scope, target, model, thinking] = args.trim().split(/\s+/);
    if (!scope || !target || !model || !["global", "project", "instance"].includes(scope)) {
      throw new Error("usage: /aili-agent-model <global|project|instance> <selector|agent-id> <provider/model|clear> [thinking]");
    }
    const state = await this.parent(context);
    const override = model === "clear" ? undefined : { model, ...(thinking ? { thinking: thinking as ModelThinking } : {}) };
    if (scope === "instance") await state.models.userSetInstance(target, override);
    else await state.models.userSetRole(scope as "global" | "project", target, override, context.isProjectTrusted());
    return `${scope} model override ${override ? `set to ${override.model}` : "cleared"} for ${target}`;
  }
}

export async function registerPersistentAgentRuntime(pi: ExtensionAPI): Promise<void> {
  await new PersistentAgentProduction(pi).register();
}
