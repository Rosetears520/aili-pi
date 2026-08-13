import {
  SessionManager,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TaskExecutionOutput, TaskExecutorInput } from "./task-coordinator.js";
import type { ResolvedModelChoice } from "./model-selection.js";
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
  persistFormalResultEvidence,
  persistFullAgentOutput,
  readAgentHistory,
  readAgentOutput,
  verifyFormalResultEvidence,
  type ParentDeliveryAdapter,
} from "./output-delivery.js";
import type { FormalResultEvidenceRecord, SidecarLayout } from "./types.js";
import {
  renderCompactAgentCatalog,
  type AgentCatalog,
} from "../agent-catalog.js";
import { resolveFormalTaskBoardRoot } from "../formal-task-board-root.js";
import { applyFormalTaskBoardUpdate, type FormalTaskBoardApplyResult, type FormalTaskBoardUpdateHooks } from "../formal-task-board-update.js";
import { validateFormalTaskBoard, type FormalTaskPackage } from "../formal-task-board.js";
import {
  planFormalRuntimeReconciliation,
  type FormalLifecycleSnapshot,
  type FormalRuntimeReconciliationObservation,
  type FormalRuntimeReconciliationPlan,
} from "../formal-orchestration.js";
import { loadRoleProfiles } from "../roles.js";
import type { FormalContinuationAudit } from "./task-schema.js";
import { registerCanonicalAiliTaskTool } from "./task-registration.js";
import { HUB_RENDERERS, TASK_RENDERERS } from "./task-hub-renderer.js";

export interface PersistentRuntimeExecutorInput extends TaskExecutorInput {
  sessionManager: SessionManager;
}

export interface PersistentAgentRuntimeOptions {
  parentSessionPath: string;
  parentId: string;
  cwd: string;
  execute: (input: PersistentRuntimeExecutorInput) => Promise<TaskExecutionOutput>;
  preallocate?: (input: { item: TaskExecutorInput["item"]; role: TaskExecutorInput["role"]; ancestry?: import("./task-coordinator.js").TaskAncestry }) => ResolvedModelChoice | Promise<ResolvedModelChoice>;
  preflight?: (input: TaskExecutorInput) => void | Promise<void>;
  preflightContinuation?: (agentId: string) => void | Promise<void>;
  parentDelivery: ParentDeliveryAdapter;
  revive: (agentId: string, sessionManager: SessionManager) => Promise<LiveAgentAdapter>;
  modelHubOperation?: (request: Record<string, unknown>, caller: HubCaller) => Promise<unknown>;
  onRelease?: (agentId: string) => void | Promise<void>;
}

export interface FormalRuntimeReconciliationRequest {
  actor: "ROSE";
  changeId: string;
  timestamp: string;
  hooks?: FormalTaskBoardUpdateHooks;
}

export type FormalRuntimeReconciliationApplyResult =
  | {
      status: "applied" | "preserved";
      plan: FormalRuntimeReconciliationPlan;
      updates: readonly FormalTaskBoardApplyResult[];
    }
  | {
      status: "blocked";
      diagnostics: readonly string[];
      plan?: FormalRuntimeReconciliationPlan;
      updates: readonly FormalTaskBoardApplyResult[];
    };

function packageField(taskPackage: FormalTaskPackage, name: keyof FormalTaskPackage["fields"]): string {
  return taskPackage.fields[name]?.value ?? "";
}

function formalMetadata(record: { metadata?: Record<string, unknown> } | undefined): {
  protection?: { changeId: string };
  identity?: FormalContinuationAudit;
} {
  const protection = record?.metadata?.formalProtection;
  const identity = record?.metadata?.formalContinuationIdentity;
  return {
    protection: protection && typeof protection === "object" && !Array.isArray(protection)
      && typeof (protection as { changeId?: unknown }).changeId === "string"
      ? protection as { changeId: string }
      : undefined,
    identity: identity && typeof identity === "object" && !Array.isArray(identity)
      ? identity as FormalContinuationAudit
      : undefined,
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function evidenceState(error: unknown): "missing" | "unreadable" {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
    ? "missing"
    : "unreadable";
}

interface FormalReconciliationCheckpointEntry {
  agentId: string;
  jobId: string;
  turnId: string;
  agentState: string;
  evidence?: FormalResultEvidenceRecord;
}

interface FormalReconciliationCheckpoint {
  sequence: number;
  entries: FormalReconciliationCheckpointEntry[];
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
      repositoryRoot: options.cwd,
      preflight: options.preallocate,
      execute: async (input) => {
        // Allocate and register the exact child history before any fallible
        // preflight. If preflight fails, persist that failure as non-provider
        // runtime evidence so official Pi materializes the deferred JSONL.
        const manager = await this.childManager(input.agentId);
        try {
          await options.preflight?.(input);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          manager.appendMessage({
            role: "assistant",
            content: [{ type: "text", text: `Agent preflight failed before execution: ${message}` }],
            timestamp: Date.now(),
            api: "aili-runtime",
            provider: "aili-runtime",
            model: "preflight",
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: "error",
            errorMessage: message,
          } as never);
          throw error;
        }
        return await options.execute({ ...input, sessionManager: manager });
      },
      onSettled: async (settlement, fullOutput) => {
        await persistFullAgentOutput(this.layout, settlement.agentId, fullOutput);
      },
      onFormalSettled: async (settlement, fullOutput) => {
        await persistFormalResultEvidence(this.layout, this.journal, settlement, fullOutput);
      },
      onAsyncSettled: async (settlement, fullOutput) => {
        await this.delivery.complete(settlement, fullOutput);
      },
    });
    this.hub = new HubService({
      journal: this.journal,
      ...(options.preflightContinuation ? {
        preflightContinuation: async (agent) => await options.preflightContinuation!(agent.id),
      } : {}),
      revive: async (agent) => {
        await options.preflightContinuation?.(agent.id);
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

  /**
   * Explicit ROSE-owned restart reconciliation. Runtime creation never invokes
   * this entry: it performs no model call, replay, redispatch, selector fallback,
   * inspection, acceptance, join closure, done transition, or phase advance.
   */
  async reconcileFormalTaskBoard(request: FormalRuntimeReconciliationRequest): Promise<FormalRuntimeReconciliationApplyResult> {
    if (!request || request.actor !== "ROSE" || typeof request.changeId !== "string" || request.changeId.length === 0) {
      return { status: "blocked", diagnostics: ["Formal reconciliation requires one exact ROSE-owned change identity."], updates: [] };
    }
    const collected = await this.collectFormalRuntimeReconciliation(request.changeId);
    if (!collected.lifecycle) return { status: "blocked", diagnostics: collected.diagnostics, updates: [] };
    if (collected.diagnostics.length > 0) return { status: "blocked", diagnostics: collected.diagnostics, updates: [] };
    const plan = planFormalRuntimeReconciliation(collected.lifecycle, collected.observations);
    if (plan.status === "blocked") {
      return { status: "blocked", diagnostics: plan.diagnostics.map((entry) => entry.code), plan, updates: [] };
    }
    const operations = plan.decisions.filter((decision) => decision.operation !== undefined);
    if (operations.length === 0) return { status: "preserved", plan, updates: [] };
    const updates: FormalTaskBoardApplyResult[] = [];
    const hooks: FormalTaskBoardUpdateHooks = {
      ...(request.hooks ?? {}),
      beforeCommitValidation: async () => {
        await request.hooks?.beforeCommitValidation?.();
        await this.revalidateFormalRuntimeReconciliation(collected.checkpoint);
      },
      commitEvidenceValidation: async () => {
        await this.revalidateFormalRuntimeReconciliation(collected.checkpoint);
      },
    };
    for (const decision of operations) {
      const current = await resolveFormalTaskBoardRoot({
        repositoryRoot: this.options.cwd,
        identity: { state: "resolved", changeId: request.changeId },
      });
      if (current.status !== "resolved" || current.pairState !== "present") {
        return { status: "blocked", diagnostics: current.diagnostics.map((entry) => entry.code), plan, updates };
      }
      const update = await applyFormalTaskBoardUpdate(current, {
        actor: "ROSE",
        tasksSource: current.tasksSource,
        progressSource: current.progressSource,
        packageId: decision.packageId,
        timestamp: request.timestamp,
        operation: decision.operation!,
      }, hooks);
      updates.push(update);
      if (update.status === "blocked") {
        return { status: "blocked", diagnostics: update.diagnostics.map((entry) => entry.code), plan, updates };
      }
    }
    return { status: "applied", plan, updates };
  }

  private async collectFormalRuntimeReconciliation(changeId: string): Promise<{
    lifecycle?: FormalLifecycleSnapshot;
    observations: FormalRuntimeReconciliationObservation[];
    diagnostics: string[];
    checkpoint: FormalReconciliationCheckpoint;
  }> {
    const root = await resolveFormalTaskBoardRoot({
      repositoryRoot: this.options.cwd,
      identity: { state: "resolved", changeId },
    });
    if (root.status !== "resolved" || root.pairState !== "present") {
      return { observations: [], diagnostics: root.diagnostics.map((entry) => entry.code), checkpoint: { sequence: this.journal.getState().lastSequence, entries: [] } };
    }
    const validation = validateFormalTaskBoard(root.tasksSource, root.progressSource);
    if (!validation.valid || !validation.board) {
      return { observations: [], diagnostics: validation.diagnostics.map((entry) => entry.code), checkpoint: { sequence: this.journal.getState().lastSequence, entries: [] } };
    }
    const phase = validation.board.headers.Phase?.value;
    if (phase !== "IDEATE" && phase !== "DEFINE" && phase !== "BUILD" && phase !== "SHIP") {
      return { observations: [], diagnostics: ["PHASE_INVALID"], checkpoint: { sequence: this.journal.getState().lastSequence, entries: [] } };
    }
    const lifecycle: FormalLifecycleSnapshot = {
      kind: "formal",
      taskIdentity: changeId,
      phase,
      tasksSource: root.tasksSource,
      progressSource: root.progressSource,
      profiles: await loadRoleProfiles(),
    };
    const state = this.journal.getState();
    const observations: FormalRuntimeReconciliationObservation[] = [];
    const diagnostics: string[] = [];
    const checkpoint: FormalReconciliationCheckpoint = { sequence: state.lastSequence, entries: [] };
    for (const taskPackage of validation.board.packages) {
      if (packageField(taskPackage, "Status") !== "running") continue;
      const expectedRole = packageField(taskPackage, "Owner").replace(/^agent:/, "");
      const currentCandidates = Object.values(state.jobs).filter((job) => {
        const metadata = formalMetadata(job);
        const identity = metadata.identity;
        if (!(metadata.protection?.changeId === changeId
          && identity?.packageId === taskPackage.id
          && identity.canonicalRole === expectedRole
          && identity.scope === packageField(taskPackage, "Scope")
          && identity.forbiddenScope === packageField(taskPackage, "Forbidden scope")
          && identity.acceptanceBoundary === packageField(taskPackage, "Acceptance")
          && identity.expectedEvidence === packageField(taskPackage, "Expected evidence"))) return false;
        const candidateAgent = state.agents[job.agentId] ?? state.releasedAgents[job.agentId];
        const candidateTurns = Object.values(state.turns).filter((turn) => turn.jobId === job.id && turn.agentId === job.agentId);
        if (!candidateAgent || candidateAgent.selector !== expectedRole || candidateTurns.length !== 1) return false;
        const agentIdentity = formalMetadata(candidateAgent);
        const turnIdentity = formalMetadata(candidateTurns[0]);
        return sameValue(metadata.protection, agentIdentity.protection)
          && sameValue(metadata.protection, turnIdentity.protection)
          && sameValue(identity, agentIdentity.identity)
          && sameValue(identity, turnIdentity.identity);
      });
      if (currentCandidates.length > 1) {
        diagnostics.push(`RECONCILIATION_CANDIDATE_AMBIGUOUS:${taskPackage.id}`);
        continue;
      }
      const job = currentCandidates[0];
      if (!job) continue;
      const activeAgent = state.agents[job.agentId];
      const releasedAgent = state.releasedAgents[job.agentId];
      const agent = activeAgent ?? releasedAgent;
      const turns = Object.values(state.turns).filter((turn) => turn.jobId === job.id && turn.agentId === job.agentId);
      if (turns.length > 1) {
        diagnostics.push(`RECONCILIATION_CANDIDATE_AMBIGUOUS:${taskPackage.id}`);
        continue;
      }
      const turn = turns[0];
      const jobMetadata = formalMetadata(job);
      const agentMetadata = formalMetadata(agent);
      const turnMetadata = formalMetadata(turn);
      const identityConflict = !agent || !turn
        || !sameValue(jobMetadata.protection, agentMetadata.protection)
        || !sameValue(jobMetadata.protection, turnMetadata.protection)
        || !sameValue(jobMetadata.identity, agentMetadata.identity)
        || !sameValue(jobMetadata.identity, turnMetadata.identity);
      const resultEvidence = state.formalResultEvidence[job.id];
      let outputState: "readable" | "missing" | "stale" | "unreadable" = identityConflict ? "stale" : resultEvidence ? "readable" : "missing";
      let historyState: "readable" | "missing" | "stale" | "unreadable" = identityConflict ? "stale" : resultEvidence ? "readable" : "missing";
      if (agent && !identityConflict && resultEvidence) {
        try {
          await verifyFormalResultEvidence(this.layout, state, resultEvidence);
        } catch (error) {
          outputState = evidenceState(error);
          historyState = evidenceState(error);
        }
      }
      const result = job.metadata?.formalWorkerResult;
      const workerResult = result === "completed" || result === "partial" || result === "blocked" || result === "failed"
        ? result
        : undefined;
      if (agent && turn) {
        checkpoint.entries.push({
          agentId: agent.id,
          jobId: job.id,
          turnId: turn.id,
          agentState: agent.state,
          ...(resultEvidence ? { evidence: resultEvidence } : {}),
        });
      }
      observations.push({
        packageId: taskPackage.id,
        formalProtection: jobMetadata.protection ?? { changeId: "missing" },
        formalContinuationIdentity: jobMetadata.identity ?? {
          packageId: "missing",
          canonicalRole: "missing",
          scope: "missing",
          forbiddenScope: "missing",
          writeScope: { paths: [], resources: [] },
          acceptanceBoundary: "missing",
          expectedEvidence: "missing",
        },
        ...(agent ? { agent: { id: agent.id, state: agent.state, released: releasedAgent !== undefined } } : {}),
        job: { id: job.id, agentId: job.agentId, state: job.state },
        ...(turn ? { turn: { id: turn.id, agentId: turn.agentId, jobId: turn.jobId!, state: turn.state } } : {}),
        output: {
          state: outputState,
          ...(workerResult ? { result: workerResult } : {}),
          ...(resultEvidence ? { digest: resultEvidence.outputSha256 } : {}),
        },
        history: { state: historyState },
      });
    }
    return { lifecycle, observations, diagnostics, checkpoint };
  }

  private async revalidateFormalRuntimeReconciliation(checkpoint: FormalReconciliationCheckpoint): Promise<void> {
    const state = this.journal.getState();
    if (state.lastSequence !== checkpoint.sequence) throw new Error("formal reconciliation Journal sequence changed after collection");
    for (const expected of checkpoint.entries) {
      const agent = state.agents[expected.agentId];
      const job = state.jobs[expected.jobId];
      const turn = state.turns[expected.turnId];
      if (!agent || state.releasedAgents[expected.agentId] || agent.state !== expected.agentState
        || !job || job.agentId !== agent.id || !turn || turn.agentId !== agent.id || turn.jobId !== job.id) {
        throw new Error("formal reconciliation Agent/job/turn identity changed after collection");
      }
      const currentEvidence = state.formalResultEvidence[expected.jobId];
      if (!sameValue(currentEvidence, expected.evidence)) throw new Error("formal reconciliation result evidence changed after collection");
      if (expected.evidence) await verifyFormalResultEvidence(this.layout, state, expected.evidence);
    }
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
  catalog: AgentCatalog;
  directModelCommand?: (args: string, context: ExtensionContext) => Promise<string>;
  directFastCommand?: (args: string, context: ExtensionContext) => Promise<string>;
}

const TASK_DESCRIPTION = "Delegate bounded work to parent-scoped persistent AILI Agents. Ordinary Pi remains benefit-based: direct work is valid when delegation adds no concrete benefit, and omitted agent retains general compatibility. In an active formal lifecycle, ROSE owns decomposition, decisions, integration, and final verification; dispatch each ready Agent-owned package to its exact Specialized selector before duplicate direct work. Formal calls explicitly set agent and async: use async:false for prerequisites with an immediate join, and async:true only for independent packages with a named join, then inspect output/history before dependents. Direct execution requires a valid pre-recorded waiver. Workers never write the owning formal-task-board.md/progress.txt or decide phase/verdict. Never send blocking: it is profile-only internal metadata.";

const TASK_PROMPT_SNIPPET = "Ordinary Pi keeps benefit-based direct work and omitted agent remains general-compatible. In a formal lifecycle, dispatch the ready package's exact Specialized selector with explicit async before duplicate direct work.";

const TASK_PROMPT_GUIDELINES = [
  "Ordinary routing: outside a formal lifecycle, delegate only for concrete benefit; direct work remains valid and omitted agent retains general compatibility.",
  "ROSE authority: ROSE owns formal decomposition, material decisions, result disposition, integration, final verification, phase advancement, and verdict.",
  "Formal dispatch: ready Agent-owned packages use the exact Specialized selector in agent and explicitly set async; omitted agent/general is ordinary compatibility, not formal ownership.",
  "Prerequisite execution: use async:false with Join: immediate whenever the result is needed by the next decision or package.",
  "Independent async execution: use async:true only for independent packages with a stable named Join; collect terminal state and inspect output/history before dependents or phase gates.",
  "Direct exception: perform Agent-owned scope directly only after a valid waiver is recorded before the work.",
  "Worker boundary: workers return evidence only; they never write the owning formal-task-board.md/progress.txt or decide lifecycle phase, acceptance, or final verdict.",
];

/**
 * Canonical registration surface shared by production and deterministic tests.
 * It registers only task/hub plus the direct-user model command when configured;
 * no legacy compatibility alias is created.
 */
export function registerPersistentAgentTools(pi: ExtensionAPI, options: InternalPersistentToolRegistrationOptions): void {
  const compactCatalog = renderCompactAgentCatalog(options.catalog);
  if (!compactCatalog.ok) {
    throw new Error(`task Agent Catalog metadata is non-pass: ${compactCatalog.diagnostics.map((diagnostic) => diagnostic.code).join(", ") || "UNKNOWN"}`);
  }
  registerCanonicalAiliTaskTool(pi, {
    name: "task",
    label: "Task",
    description: TASK_DESCRIPTION,
    promptSnippet: TASK_PROMPT_SNIPPET,
    promptGuidelines: [...TASK_PROMPT_GUIDELINES, compactCatalog.value],
    parameters: TASK_TOOL_SCHEMA,
    ...TASK_RENDERERS,
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
    ...HUB_RENDERERS,
    async execute(_toolCallId, params, _signal, _onUpdate, context) {
      const runtime = await options.runtimeForContext(context);
      const result = await runtime.hub.execute(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  if (options.directFastCommand) {
    pi.registerCommand("codex-fast", {
      description: "Enable or disable the Persistent Agent Codex priority tier",
      handler: async (args, context) => {
        try {
          context.ui.notify(await options.directFastCommand!(args, context), "info");
        } catch (error) {
          context.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      },
    });
  }
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
