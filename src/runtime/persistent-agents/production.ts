import { createBashToolDefinition, getAgentDir, type AgentSession, type CreateAgentSessionOptions, type ExtensionAPI, type ExtensionContext, type SessionManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
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
  validateWorkspaceCwd,
  validateWriteScope,
  type IsolatedWorkspaceRecord,
  type WorkspaceLease,
} from "./workspace.js";
import { PersistentAgentRuntime, registerPersistentAgentTools, type PersistentRuntimeExecutorInput } from "./runtime.js";
import { persistFullAgentOutput } from "./output-delivery.js";
import { resolvePersistentAgentSandbox } from "./child-sandbox.js";
import { loadRoleProfiles, type RoleProfile } from "../roles.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assistantText(session: AgentSession): string {
  for (const message of [...session.state.messages].reverse()) {
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
    };
  }

  async resolveParentFallback(): Promise<CatalogModel | undefined> {
    const model = this.context.model;
    return model ? await this.resolve(`${model.provider}/${model.id}`) : undefined;
  }
}

function parseOverride(model: string | undefined): ModelOverride | undefined {
  return model ? { model } : undefined;
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
    const abort = () => { void this.abort("task cancellation"); };
    input.context.signal.addEventListener("abort", abort, { once: true });
    try {
      await prepared.session.prompt(prepared.initialMessage, { expandPromptTemplates: false, source: "extension" });
      await this.owner.finalizeWorkspace(this.state, this.agentId);
      this.owner.schedulePark(this.state, this.agentId);
      return assistantText(prepared.session);
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

  dispose(): void {
    this.disposed = true;
    this.session?.dispose();
    this.session = undefined;
  }

  private async runHubTurn(message: string): Promise<void> {
    const prepared = await this.prepare();
    let status: "completed" | "failed" = "completed";
    let error: string | undefined;
    try {
      await prepared.session.sendUserMessage(message);
      await persistFullAgentOutput(this.state.runtime.layout, this.agentId, assistantText(prepared.session));
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
    this.session?.dispose();
    const prepared = await this.owner.buildChildSession(this.state, this, this.manager, input);
    this.session = prepared.session;
    this.disposed = false;
    return prepared;
  }
}

export class PersistentAgentProduction {
  private readonly parents = new Map<string, Promise<ParentState>>();
  private activeParentPath?: string;

  constructor(private readonly pi: ExtensionAPI) {}

  register(): void {
    registerPersistentAgentTools(this.pi, {
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
        for (const controller of state.controllers.values()) controller.dispose();
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
    const workspace = input ? await this.ensureWorkspace(state, input) : state.workspaces.get(controller.agentId);
    if (!workspace) throw new Error(`${controller.agentId}: workspace record is unavailable for revive`);
    const childCwd = state.childCwds.get(controller.agentId) ?? workspace.root;

    const nestedDefinitions = this.childToolDefinitions(state, input, role);
    const parent: ParentToolSnapshot = {
      active: this.pi.getActiveTools(),
      definitions: new Map(nestedDefinitions.map((definition) => [definition.name, definition])),
    };
    const policy = computeEffectiveTools({
      parent,
      childLoadable: [...BUILTIN_CHILD_TOOLS, "task", "hub"],
      childDefinitions: parent.definitions,
      role,
      callTools: input?.item.tools,
      hardDenied: input ? [] : ["task"],
      currentDepth: input?.depth ?? Number(agent.metadata?.depth ?? 0),
    });
    const modeConfig = loadModeConfig(workspace.root, getAgentDir(), (message) => context.ui.notify(message, "warning"));
    const mode = currentMode(modeConfig, context);
    const sandboxResolution = policy.effectiveTools.includes("bash")
      ? resolvePersistentAgentSandbox(mode.sandbox)
      : { available: false, reason: "bash-not-enabled" };
    const sandboxDefinition = sandboxResolution.operations
      ? createBashToolDefinition(childCwd, { operations: sandboxResolution.operations }) as unknown as ToolDefinition
      : undefined;
    const effectivePolicy = sandboxDefinition
      ? { ...policy, customTools: [...policy.customTools.filter((tool) => tool.name !== "bash"), sandboxDefinition] }
      : policy;

    const configs = await new ModelConfigStore({
      globalPath: defaultGlobalModelConfigPath(),
      projectPath: defaultProjectModelConfigPath(context.cwd),
    }).load(context.isProjectTrusted());
    const choice = await resolveAgentModel({
      input: {
        selector: role.selector,
        agentId: controller.agentId,
        oneShot: parseOverride(input?.item.model),
        projectTrusted: context.isProjectTrusted(),
        profile: parseOverride(role.model),
        parentThinking: "medium",
      },
      journal: state.runtime.journal,
      configs,
      catalog: new ContextModelCatalog(context),
    });
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
          effectiveTools: effectivePolicy.effectiveTools,
          unavailableTools: effectivePolicy.unavailable,
          sandbox: mode.sandbox.enabled ? (sandboxDefinition ? "enabled" : "unavailable") : "disabled",
          sandboxReason: sandboxResolution.reason,
          provider: choice.provider,
          model: choice.model,
          modelLayer: choice.layer,
          thinking: choice.thinking,
          oneShot: choice.oneShot,
          persistent: choice.persistent,
        },
      });
    }

    const resolver = new ChildPermissionResolver({ mode, cwd: childCwd, sandboxExecutorAvailable: Boolean(sandboxDefinition) });
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
    const prompt = assembleChildPrompt({
      runtimeEnvelope: [
        "Official Pi persistent Agent runtime. The parent conversation is not copied.",
        `Agent ID: ${controller.agentId}`,
        `Model: ${choice.canonical} (${choice.layer}, thinking=${choice.thinking})`,
        `Unavailable requested tools: ${policy.unavailable.map((item) => `${item.name}:${item.reason}`).join(", ") || "none"}`,
        `Child sandbox: ${mode.sandbox.enabled ? (sandboxDefinition ? "active" : `unavailable (${sandboxResolution.reason ?? "unknown"})`) : "not required by active mode"}`,
      ].join("\n"),
      role,
      task: input?.item.task ?? "Continue this persistent Agent from the explicit hub message.",
      context: input?.item.context,
      cwd: childCwd,
      workspace: { mode: workspace.mode, root: workspace.root },
    });
    return await createPersistentChildSession({
      cwd: childCwd,
      agentDir: getAgentDir(),
      projectTrusted: context.isProjectTrusted(),
      sessionManager: manager,
      prompt,
      policy: effectivePolicy,
      childExtensions: [
        { name: "aili-child-approval", factory: approval },
        { name: "aili-child-workspace", factory: createWorkspaceMutationGuard(state.leases, controller.agentId) },
      ],
      topLevelExtensionNames: ["aili-runtime", "aili-top-coordinator"],
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
      execute: async (input) => {
        const controller = new ProductionAgentController(this, state, input.agentId, input.sessionManager);
        state.controllers.set(input.agentId, controller);
        state.runtime.hub.registerLive(input.agentId, controller);
        try {
          return { output: await controller.runInitial(input) };
        } catch (error) {
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
        await this.buildChildSession(state, controller, manager);
        state.controllers.set(agentId, controller);
        return controller;
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

  private childToolDefinitions(state: ParentState, input: PersistentRuntimeExecutorInput | undefined, role: RoleProfile): ToolDefinition[] {
    const task: ToolDefinition = {
      name: "task",
      label: "Task",
      description: "Create a nested persistent Agent synchronously within the explicit spawn/depth policy. Use the public async field if supplied; never send profile-only blocking metadata.",
      parameters: TASK_TOOL_SCHEMA,
      execute: async (_id, params) => {
        if (!input) throw new Error("nested task is unavailable outside an inherited scheduled turn");
        const result = await state.runtime.task.submit(params, {
          parentAgentId: input.agentId,
          parentSelector: role.selector,
          parentDepth: input.depth,
          inheritedPermit: input.context.permit,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      },
    };
    const hub: ToolDefinition = {
      name: "hub",
      label: "Hub",
      description: "Inspect or message this Agent and its descendants.",
      parameters: HUB_TOOL_SCHEMA,
      execute: async (_id, params) => {
        const result = await state.runtime.hub.execute(params, { agentId: input?.agentId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
      },
    };
    return [task, hub];
  }

  private async ensureWorkspace(state: ParentState, input: PersistentRuntimeExecutorInput): Promise<WorkspaceLease> {
    const existing = state.workspaces.get(input.agentId);
    if (existing) return existing;
    const projectRoot = state.context.cwd;
    const scope = await validateWriteScope(projectRoot, input.item.writeScope);
    const decision = state.leases.decide(input.agentId, input.item.workspace, projectRoot, scope);
    let root = projectRoot;
    if (decision.mode === "isolated") {
      const record = await state.isolation.create(input.agentId, projectRoot);
      state.isolated.set(input.agentId, record);
      root = record.root;
    }
    const cwd = await validateWorkspaceCwd(root, input.item.cwd);
    const lease: WorkspaceLease = {
      agentId: input.agentId,
      mode: decision.mode,
      projectRoot,
      root,
      scope,
      acquiredAt: new Date().toISOString(),
    };
    state.leases.acquire(lease);
    state.workspaces.set(input.agentId, lease);
    state.childCwds.set(input.agentId, cwd);
    return lease;
  }

  private async releaseAgent(state: ParentState, agentId: string): Promise<void> {
    this.clearPark(state, agentId);
    state.controllers.get(agentId)?.dispose();
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

export function registerPersistentAgentRuntime(pi: ExtensionAPI): void {
  new PersistentAgentProduction(pi).register();
}
