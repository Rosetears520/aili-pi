import {
  SessionManager,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TaskExecutionOutput, TaskExecutorInput } from "./task-coordinator.js";
import { TaskCoordinator } from "./task-coordinator.js";
import { HUB_TOOL_SCHEMA, HubService, type HubCaller, type LiveAgentAdapter } from "./hub.js";
import { TASK_TOOL_SCHEMA } from "./task-schema.js";
import {
  createChildSessionManager,
  ensureSidecarLayout,
  openChildSessionManager,
  reconcileUnfinishedCoordinator,
  registerChildSession,
  resumeCoordinator,
  type CoordinatorJournal,
} from "./storage.js";
import {
  AsyncDeliveryService,
  persistFullAgentOutput,
  readAgentHistory,
  readAgentOutput,
  type ParentDeliveryAdapter,
} from "./output-delivery.js";
import type { SidecarLayout } from "./types.js";

export interface PersistentRuntimeExecutorInput extends TaskExecutorInput {
  sessionManager: SessionManager;
}

export interface PersistentAgentRuntimeOptions {
  parentSessionPath: string;
  parentId: string;
  cwd: string;
  execute: (input: PersistentRuntimeExecutorInput) => Promise<TaskExecutionOutput>;
  parentDelivery: ParentDeliveryAdapter;
  revive: (agentId: string, sessionManager: SessionManager) => Promise<LiveAgentAdapter>;
  modelHubOperation?: (request: Record<string, unknown>, caller: HubCaller) => Promise<unknown>;
  onRelease?: (agentId: string) => void | Promise<void>;
}

export class PersistentAgentRuntime {
  readonly layout: SidecarLayout;
  readonly journal: CoordinatorJournal;
  readonly task: TaskCoordinator;
  readonly hub: HubService;
  readonly delivery: AsyncDeliveryService;
  private readonly childManagers = new Map<string, SessionManager>();

  private constructor(
    private readonly options: PersistentAgentRuntimeOptions,
    initialized: { layout: SidecarLayout; journal: CoordinatorJournal },
  ) {
    this.layout = initialized.layout;
    this.journal = initialized.journal;
    this.delivery = new AsyncDeliveryService(this.layout, this.journal, options.parentDelivery);
    this.task = new TaskCoordinator({
      journal: this.journal,
      execute: async (input) => {
        const manager = await this.childManager(input.agentId);
        return await options.execute({ ...input, sessionManager: manager });
      },
      onSettled: async (settlement, fullOutput) => {
        await persistFullAgentOutput(this.layout, settlement.agentId, fullOutput);
      },
      onAsyncSettled: async (settlement, fullOutput) => {
        await this.delivery.complete(settlement, fullOutput);
      },
    });
    this.hub = new HubService({
      journal: this.journal,
      revive: async (agent) => {
        if (!agent.sessionPath) throw new Error(`${agent.id}: no registered child session`);
        const manager = await openChildSessionManager(this.layout, agent.sessionPath);
        this.childManagers.set(agent.id, manager);
        return await options.revive(agent.id, manager);
      },
      cancelJob: async (jobId) => await this.task.cancel(jobId),
      output: async (agent, offset, limit) => await readAgentOutput(this.layout, this.journal, agent.id, offset, limit),
      history: async (agent, offset, limit) => await readAgentHistory(this.layout, this.journal, agent.id, offset, limit),
      model: options.modelHubOperation,
      onRelease: async (agent) => await options.onRelease?.(agent.id),
    });
  }

  static async create(options: PersistentAgentRuntimeOptions): Promise<PersistentAgentRuntime> {
    const layout = await ensureSidecarLayout(options.parentSessionPath);
    const resumed = await resumeCoordinator(layout, options.parentId);
    const runtime = new PersistentAgentRuntime(options, { layout, journal: resumed.journal });
    await runtime.delivery.recoverPending();
    return runtime;
  }

  async shutdown(): Promise<void> {
    await this.task.scheduler.close();
    await reconcileUnfinishedCoordinator(this.journal, "graceful-shutdown");
    for (const manager of this.childManagers.values()) void manager;
    this.childManagers.clear();
  }

  private async childManager(agentId: string): Promise<SessionManager> {
    const existing = this.childManagers.get(agentId);
    if (existing) return existing;
    const record = this.journal.getState().agents[agentId];
    if (!record) throw new Error(`${agentId}: unknown Agent before child session creation`);
    if (record.sessionPath) {
      const manager = await openChildSessionManager(this.layout, record.sessionPath);
      this.childManagers.set(agentId, manager);
      return manager;
    }
    const created = await createChildSessionManager(this.layout, this.options.cwd, agentId);
    await registerChildSession(this.journal, agentId, created.sessionPath);
    this.childManagers.set(agentId, created.sessionManager);
    return created.sessionManager;
  }
}

export interface InternalPersistentToolRegistrationOptions {
  runtimeForContext: (context: ExtensionContext) => Promise<PersistentAgentRuntime>;
  directModelCommand?: (args: string, context: ExtensionContext) => Promise<string>;
}

/**
 * Canonical registration surface shared by production and deterministic tests.
 * It registers only task/hub plus the direct-user model command when configured;
 * no legacy compatibility alias is created.
 */
export function registerPersistentAgentTools(pi: ExtensionAPI, options: InternalPersistentToolRegistrationOptions): void {
  pi.registerTool({
    name: "task",
    label: "Task",
    description: "Create one or more parent-scoped persistent AILI Agents; omitted agent defaults to general. Use async:false to wait synchronously or async:true for background execution. Never send blocking: it is profile-only internal metadata.",
    parameters: TASK_TOOL_SCHEMA,
    async execute(_toolCallId, params, signal, _onUpdate, context) {
      const runtime = await options.runtimeForContext(context);
      const result = await runtime.task.submit(params, undefined, signal);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  pi.registerTool({
    name: "hub",
    label: "Hub",
    description: "Inspect and control persistent Agents, jobs, messages, output, history, cancellation, and model requests.",
    parameters: HUB_TOOL_SCHEMA,
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      const runtime = await options.runtimeForContext(context);
      const result = await runtime.hub.execute(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  if (options.directModelCommand) {
    pi.registerCommand("aili-agent-model", {
      description: "Direct user operation for AILI Agent instance/global/project model overrides",
      handler: async (args, context) => {
        try {
          context.ui.notify(await options.directModelCommand!(args, context), "info");
        } catch (error) {
          context.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      },
    });
  }
}
