import { createBashToolDefinition, createEditToolDefinition, createFindToolDefinition, createGrepToolDefinition, createLsToolDefinition, createReadToolDefinition, createWriteToolDefinition, getAgentDir, type AgentSession, type CreateAgentSessionOptions, type ExtensionAPI, type ExtensionContext, type SessionManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { loadModeConfig } from "pi-permission-modes/src/config-load.ts";
import type { ModeDef, PermissionModeConfig } from "pi-permission-modes/src/schema.ts";
import { TASK_TOOL_SCHEMA } from "./task-schema.js";
import { HUB_TOOL_SCHEMA, type HubCaller, type LiveAgentAdapter } from "./hub.js";
import { assembleChildPrompt, computeEffectiveTools, type ParentToolSnapshot } from "./policy.js";
import { createChildApprovalBridge, createPersistentChildSession } from "./session-factory.js";
import { brokeredChildPermission, ChildPermissionResolver, ParentApprovalBroker } from "./permission.js";
import {
  ModelConfigStore,
  ModelConfigurationService,
  defaultGlobalModelConfigPath,
  defaultProjectModelConfigPath,
  revalidateResolvedModelChoice,
  resolveAgentModel,
  type CatalogModel,
  type ModelCatalog,
  type ModelOverride,
  type ModelThinking,
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
import { persistFullAgentOutput } from "./output-delivery.js";
import { formalChildHardDeniedTools, resolvePersistentAgentSandbox } from "./child-sandbox.js";
import {
  assertCurrentFormalRoleProfile,
  renderCanonicalFormalResultInstruction,
  resolveFormalTaskProtection,
  type FormalTaskProtection,
  type FormalWorkspaceRequest,
  type TaskExecutorInput,
} from "./task-coordinator.js";
import { normalizeFormalContinuationAudit, type FormalContinuationAudit } from "./task-schema.js";
import { loadRoleProfiles, type RoleProfile } from "../roles.js";
import { loadAgentCatalog } from "../agent-catalog.js";
import { HUB_RENDERERS, TASK_RENDERERS } from "./task-hub-renderer.js";
import { createAiliMcpExtension, MCP_TOOL_NAMES, resolveSharedMcpConfigPath } from "../mcp.js";
import { createProviderRoutedContextExtension } from "../context-runtime.js";
import { createExplainableRetryExtension } from "../provider-retry.js";

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
}

export interface PersistentAgentProductionOptions {
  childModelRuntime?: CreateAgentSessionOptions["modelRuntime"];
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
    if (typeof message.content === "string") return message.content;
    return message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function currentMode(config: PermissionModeConfig, context: ExtensionContext): ModeDef {
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
  return config.modes[selected ?? config.defaultMode] ?? config.modes[config.defaultMode]!;
}

class ContextModelCatalog implements ModelCatalog {
  constructor(private readonly context: ExtensionContext) {}

  async resolve(canonical: string): Promise<CatalogModel | undefined> {
    const slash = canonical.indexOf("/");
    if (slash <= 0 || slash === canonical.length - 1) return undefined;
    const provider = canonical.slice(0, slash);
    const modelId = canonical.slice(slash + 1);
    const model = this.context.modelRegistry.find(provider, modelId);
    if (!model) return undefined;
    return {
      provider: model.provider,
      model: model.id,
      available: this.context.modelRegistry.getAvailable().some((candidate) => candidate.provider === model.provider && candidate.id === model.id),
      authenticated: this.context.modelRegistry.hasConfiguredAuth(model),
      thinkingLevels: supportedThinkingLevels(model),
    };
  }

  async resolveParentFallback(): Promise<CatalogModel | undefined> {
    const model = this.context.model;
    return model ? await this.resolve(`${model.provider}/${model.id}`) : undefined;
  }

  async resolveBare(modelId: string): Promise<CatalogModel[]> {
    return this.context.modelRegistry.getAll()
      .filter((model) => model.id === modelId)
      .map((model) => ({
        provider: model.provider,
        model: model.id,
        available: this.context.modelRegistry.getAvailable().some((candidate) => candidate.provider === model.provider && candidate.id === model.id),
        authenticated: this.context.modelRegistry.hasConfiguredAuth(model),
        thinkingLevels: supportedThinkingLevels(model),
      }));
  }
}

function parseOverride(model: string | undefined): ModelOverride | undefined {
  return model ? { model } : undefined;
}

function supportedThinkingLevels(model: { reasoning?: boolean; thinkingLevelMap?: Partial<Record<ModelThinking, string | null>> }): ModelThinking[] {
  if (!model.reasoning) return ["off"];
  const levels: ModelThinking[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  return model.thinkingLevelMap
    ? levels.filter((level) => model.thinkingLevelMap?.[level] !== null)
    : levels;
}

class ProductionAgentController implements LiveAgentAdapter {
  private session?: AgentSession;
  private disposed = false;

  constructor(
    private readonly owner: PersistentAgentProduction,
    private readonly state: ParentState,
    readonly agentId: string,
    private readonly manager: SessionManager,
  ) {}

  async runInitial(input: PersistentRuntimeExecutorInput): Promise<string> {
    const prepared = await this.prepare(input);
    const promptStart = prepared.session.state.messages.length;
    const abort = () => { void this.abort("task cancellation"); };
    input.context.signal.addEventListener("abort", abort, { once: true });
    try {
      await prepared.session.prompt(prepared.initialMessage, { expandPromptTemplates: false, source: "extension" });
      await this.owner.finalizeWorkspace(this.state, this.agentId);
      this.owner.schedulePark(this.state, this.agentId);
      return assistantText(prepared.session, promptStart);
    } finally {
      input.context.signal.removeEventListener("abort", abort);
    }
  }

  async steer(message: string): Promise<void> {
    if (!this.session) throw new Error(`${this.agentId}: live session is unavailable`);
    await this.session.steer(message);
  }

  async sendUserMessage(message: string): Promise<void> {
    if (this.disposed) throw new Error(`${this.agentId}: live controller is disposed`);
    this.owner.clearPark(this.state, this.agentId);
    setTimeout(() => {
      void this.runHubTurn(message).catch(async (error) => {
        const turnId = this.state.runtime.journal.getState().agents[this.agentId]?.currentTurnId;
        if (turnId) await this.state.runtime.hub.settleMessageTurn(this.agentId, turnId, "failed", error instanceof Error ? error.message : String(error));
      });
    }, 0);
  }

  async abort(_reason: string): Promise<void> {
    this.owner.clearPark(this.state, this.agentId);
    await this.session?.abort();
  }

  async prepareForRevive(): Promise<void> {
    await this.prepare();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const session = this.session;
    this.session = undefined;
    if (!session) return;
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  }

  private async runHubTurn(message: string): Promise<void> {
    const prepared = this.session
      ? { session: this.session, initialMessage: "" }
      : await this.prepare();
    let status: "completed" | "failed" = "completed";
    let error: string | undefined;
    try {
      const turnStart = prepared.session.state.messages.length;
      await prepared.session.sendUserMessage(message);
      await persistFullAgentOutput(this.state.runtime.layout, this.agentId, assistantText(prepared.session, turnStart));
      await this.owner.finalizeWorkspace(this.state, this.agentId);
    } catch (failure) {
      status = "failed";
      error = failure instanceof Error ? failure.message : String(failure);
    }
    const turnId = this.state.runtime.journal.getState().agents[this.agentId]?.currentTurnId;
    if (turnId) await this.state.runtime.hub.settleMessageTurn(this.agentId, turnId, status, error);
    this.owner.schedulePark(this.state, this.agentId);
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
  private activeParentPath?: string;

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
    });
    this.pi.on("session_start", (_event, context) => {
      this.activeParentPath = context.sessionManager.getSessionFile();
    });
    this.pi.on("session_shutdown", async () => {
      for (const pending of this.parents.values()) {
        const state = await pending.catch(() => undefined);
        if (!state) continue;
        state.approval.shutdown();
        for (const timer of state.parkTimers.values()) clearTimeout(timer);
        await Promise.all([...state.controllers.values()].map(async (controller) => await controller.dispose()));
        await state.runtime.shutdown();
      }
      this.parents.clear();
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
    const requestedTools = input?.item.tools;
    const mcpRequested = requestedTools?.some((name) => (MCP_TOOL_NAMES as readonly string[]).includes(name)) ?? false;
    const mcpRoleCeiling = role.toolPolicy === "inherit-parent"
      || role.capabilities.includes("memory.provider.mempalace")
      || role.tools.some((name) => (MCP_TOOL_NAMES as readonly string[]).includes(name));
    const effectiveRole = mcpRequested && mcpRoleCeiling && role.toolPolicy === "static"
      ? { ...role, tools: [...new Set([...role.tools, ...MCP_TOOL_NAMES])] }
      : role;
    const policy = computeEffectiveTools({
      parent,
      childLoadable: [...BUILTIN_CHILD_TOOLS, "task", "hub", ...MCP_TOOL_NAMES],
      childDefinitions: parent.definitions,
      role: effectiveRole,
      callTools: requestedTools,
      hardDenied: [...(input ? [] : ["task"]), ...formalHardDenied],
      currentDepth: input?.depth ?? Number(agent.metadata?.depth ?? 0),
    });
    const catalog = new ContextModelCatalog(context);
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
          thinking: choice.thinking,
          effectiveMode: input ? (state.runtime.journal.getState().turns[turnId]?.metadata?.effectiveMode ?? "sync") : "hub",
          outputRef: `agent://${controller.agentId}`,
          historyRef: `history://${controller.agentId}`,
          oneShot: choice.oneShot,
          persistent: choice.persistent,
        },
      });
    }

    const resolver = new ChildPermissionResolver({ mode, cwd: childCwd, sandboxExecutorAvailable: sandbox.available });
    const permission = brokeredChildPermission(resolver, state.approval, {
      agentId: controller.agentId,
      jobId: input?.jobId ?? `hub-${controller.agentId}`,
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
        `Model: ${choice.canonical} (${choice.layer}, thinking=${choice.thinking})`,
        `Unavailable requested tools: ${policy.unavailable.map((item) => `${item.name}:${item.reason}`).join(", ") || "none"}`,
        `Child sandbox: ${mode.sandbox.enabled ? (sandbox.available ? "active" : `unavailable (${sandbox.reason ?? "unknown"})`) : "not required by active mode"}`,
      ].join("\n"),
      role,
      task: input?.item.task ?? "Continue this persistent Agent from the explicit hub message.",
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
    const timer = setTimeout(() => {
      void (async () => {
        if (await state.runtime.hub.park(agentId)) state.controllers.delete(agentId);
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
        const choice = await active.ui.select("AILI Agent tool approval", ["Allow once", "Deny"], { signal: active.signal });
        return choice === "Allow once" ? "allow" : choice === "Deny" ? "deny" : "dismiss";
      },
    });
    let modelService!: ModelConfigurationService;
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentPath,
      parentId,
      cwd: context.cwd,
      preallocate: async ({ item, role }) => {
        const configs = await new ModelConfigStore({
          globalPath: defaultGlobalModelConfigPath(),
          projectPath: defaultProjectModelConfigPath(context.cwd),
        }).load(context.isProjectTrusted());
        return await resolveAgentModel({
          input: {
            selector: role.selector,
            // Before allocation there cannot be a durable instance override for
            // this new Agent identity. One-shot/config/profile/Parent layers are
            // resolved atomically for the whole request.
            agentId: `preflight:${role.selector}`,
            oneShot: parseOverride(item.model),
            projectTrusted: context.isProjectTrusted(),
            profile: parseOverride(role.model),
            parentThinking: context.thinkingLevel as ModelThinking,
          },
          journal: state.runtime.journal,
          configs,
          catalog: new ContextModelCatalog(context),
        });
      },
      preflight: async (input) => {
        if (!input.formalProtection) return;
        await this.ensureWorkspace(state, input, input.formalProtection);
        await this.assertFormalExecutionIdentity(state, input.agentId, input);
      },
      preflightContinuation: async (agentId) => await this.assertFormalExecutionIdentity(state, agentId),
      execute: async (input) => {
        const controller = new ProductionAgentController(this, state, input.agentId, input.sessionManager);
        state.controllers.set(input.agentId, controller);
        state.runtime.hub.registerLive(input.agentId, controller);
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
      revive: async (agentId, manager) => {
        const controller = new ProductionAgentController(this, state, agentId, manager);
        try {
          await controller.prepareForRevive();
          state.controllers.set(agentId, controller);
          return controller;
        } catch (error) {
          await controller.dispose().catch(() => undefined);
          throw error;
        }
      },
      modelHubOperation: async (request, caller) => await this.modelHub(state, modelService, request, caller),
      onRelease: async (agentId) => await this.releaseAgent(state, agentId),
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
    };
    return state;
  }

  private childToolDefinitions(
    state: ParentState,
    input: PersistentRuntimeExecutorInput | undefined,
    role: RoleProfile,
    sandboxedBash?: ToolDefinition,
  ): ToolDefinition[] {
    const task: ToolDefinition = {
      name: "task",
      label: "Task",
      description: "Create a nested persistent Agent synchronously within the explicit spawn/depth policy. Use the public async field if supplied; never send profile-only blocking metadata.",
      parameters: TASK_TOOL_SCHEMA,
      ...TASK_RENDERERS,
      execute: async (_id, params) => {
        if (!input) throw new Error("nested task is unavailable outside an inherited scheduled turn");
        const result = await state.runtime.task.submit(params, {
          parentAgentId: input.agentId,
          parentSelector: role.selector,
          parentDepth: input.depth,
          inheritedPermit: input.context.permit,
          ...(input.item.formalContext ? { formalChangeId: input.item.formalContext.changeId } : {}),
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      },
    };
    const hub: ToolDefinition = {
      name: "hub",
      label: "Hub",
      description: "Inspect or message this Agent and its descendants.",
      parameters: HUB_TOOL_SCHEMA,
      ...HUB_RENDERERS,
      execute: async (_id, params) => {
        const result = await state.runtime.hub.execute(params, { agentId: input?.agentId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      },
    };
    return [task, hub, ...(sandboxedBash ? [sandboxedBash] : [])];
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

  private async releaseAgent(state: ParentState, agentId: string): Promise<void> {
    this.clearPark(state, agentId);
    await state.controllers.get(agentId)?.dispose();
    state.controllers.delete(agentId);
    const isolated = state.isolated.get(agentId);
    if (isolated) {
      const finalized = isolated.status === "active" ? await state.isolation.finalize(isolated) : isolated;
      await state.isolation.cleanup(finalized);
      state.isolated.delete(agentId);
    }
    state.leases.release(agentId);
    state.workspaces.delete(agentId);
    state.childCwds.delete(agentId);
  }

  private async modelHub(state: ParentState, service: ModelConfigurationService, request: Record<string, unknown>, caller: HubCaller): Promise<unknown> {
    const operation = String(request.operation ?? "");
    const agentId = typeof request.agentId === "string" ? request.agentId : undefined;
    const selector = typeof request.selector === "string" ? request.selector : undefined;
    if (Boolean(agentId) === Boolean(selector)) throw new Error("hub model requires exactly one of agentId or selector");
    if (caller.agentId && agentId !== caller.agentId) throw new Error("child Agent may request model changes only for itself");
    if (operation === "query") {
      if (agentId) return { agentId, override: state.runtime.journal.getState().models[agentId] ?? null };
      const configs = await new ModelConfigStore({ globalPath: defaultGlobalModelConfigPath(), projectPath: defaultProjectModelConfigPath(state.context.cwd) }).load(state.context.isProjectTrusted());
      return { selector, global: configs.global.roles[selector!] ?? null, project: configs.project?.roles[selector!] ?? null, diagnostics: configs.diagnostics };
    }
    if (operation !== "request" && operation !== "clear") throw new Error(`unsupported hub model operation: ${operation}`);
    const override = operation === "clear" ? undefined : parseOverride(typeof request.model === "string" ? request.model : undefined);
    if (operation === "request" && !override) throw new Error("hub model request requires model");
    const confirmation = {
      hasUI: state.context.hasUI,
      confirm: async (packet: { scope: "instance" | "global" | "project"; target: string; oldValue?: ModelOverride; newValue?: ModelOverride }) => {
        if (!state.context.hasUI) return "dismiss" as const;
        const allowed = await state.context.ui.confirm("AILI Agent model change", `scope=${packet.scope}\ntarget=${packet.target}\nold=${packet.oldValue?.model ?? "none"}\nnew=${packet.newValue?.model ?? "none"}`, { signal: state.context.signal });
        return allowed ? "confirm" as const : "deny" as const;
      },
    };
    return agentId
      ? await service.requestInstanceChange(agentId, override, confirmation)
      : await service.requestRoleChange("global", selector!, override, state.context.isProjectTrusted(), confirmation);
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
