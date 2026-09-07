import { Type } from "typebox";
import {
  SessionManager,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TaskExecutorInput, TaskPreflightInput, TaskUpdateCallback } from "./sub-coordinator.js";
import type { ResolvedModelChoice } from "./model-selection.js";
import { SubCoordinator } from "./sub-coordinator.js";
import { ActivityBus, type ActivityKind } from "./activity-bus.js";
import { DEFAULT_EXECUTION_BACKEND, type ExecutionBackendKind } from "./backends/types.js";
import { ExecutionBackendRegistry } from "./backends/registry.js";
import { ManagedExecutionBackend } from "./backends/managed.js";
import { assertHerdrRoleSupported, defaultBootstrapModulePath, HerdrExecutionBackend } from "./backends/herdr/adapter.js";
import { SUB_TOOL_SCHEMA } from "./sub-schema.js";
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
import type { FormalContinuationAudit } from "./sub-schema.js";
import { registerCanonicalAiliSubTool } from "./sub-registration.js";
import { SUB_RENDERERS } from "./sub-renderer.js";

export interface PersistentRuntimeExecutorInput extends TaskExecutorInput {
  sessionManager: SessionManager;
}

export interface PersistentAgentRuntimeOptions {
  parentSessionPath: string;
  parentId: string;
  cwd: string;
  execute: (input: PersistentRuntimeExecutorInput) => Promise<import("./sub-coordinator.js").TaskExecutionOutput>;
  /** Resolves the user-owned backend selection for NEW agents (settings +
   *  session override). Returning a kind that is not registered fails the
   *  submission explicitly before allocation — no fallback. */
  resolveBackend?: () => Promise<ExecutionBackendKind> | ExecutionBackendKind | undefined;
  preallocate?: (input: TaskPreflightInput) => ResolvedModelChoice | import("./sub-coordinator.js").TaskPreflightResult | undefined | Promise<ResolvedModelChoice | import("./sub-coordinator.js").TaskPreflightResult | undefined>;
  preflight?: (input: TaskExecutorInput) => void | Promise<void>;
  parentDelivery: ParentDeliveryAdapter;
  requestInteraction?: (request: { agentId: string; jobId: string; turnId: string; runId: string; interactionId: string; kind: string; payload: Record<string, unknown>; signal: AbortSignal }) => Promise<unknown>;
  /** Path of the child bootstrap module passed to herdr children (-e). */
  bootstrapModulePath?: string;
  /** Cap on simultaneously live herdr child surfaces (surface permit). */
  herdrMaxLiveSurfaces?: number;
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
  readonly sub: SubCoordinator;
  readonly delivery: AsyncDeliveryService;
  readonly activity: ActivityBus;
  /** Execution backends available to this runtime (ADR-001/ADR-005). */
  readonly backends = new ExecutionBackendRegistry();
  readonly herdrBackend: HerdrExecutionBackend;
  private readonly childManagers = new Map<string, SessionManager>();

  /** Repository root the coordinators resolve formal board roots against. */
  get repositoryRoot(): string {
    return this.options.cwd;
  }

  private constructor(
    private readonly options: PersistentAgentRuntimeOptions,
    initialized: { layout: SidecarLayout; journal: CoordinatorJournal },
  ) {
    this.layout = initialized.layout;
    this.journal = initialized.journal;
    this.activity = new ActivityBus(options.parentId);
    this.delivery = new AsyncDeliveryService(this.layout, this.journal, options.parentDelivery);
    // The previous in-process execution path, unchanged, behind the backend
    // seam: child-session allocation, fallible preflight with durable failure
    // evidence, and the production controller call now live in the adapter.
    this.backends.register(new ManagedExecutionBackend({
      journal: this.journal,
      childManager: (agentId) => this.childManager(agentId),
      preflight: options.preflight,
      execute: options.execute,
    }));
    this.herdrBackend = new HerdrExecutionBackend({
      journal: this.journal,
      layout: this.layout,
      parentId: options.parentId,
      cwd: options.cwd,
      bootstrapModulePath: options.bootstrapModulePath ?? defaultBootstrapModulePath(),
      maxLiveSurfaces: options.herdrMaxLiveSurfaces,
      requestInteraction: options.requestInteraction,
      onAdoptedSettlement: async (settlement) => { await this.sub.settleRecovered(settlement); },
      onActivity: (event) => {
        const kind = event.event === "interaction.expired" ? "interaction.resolved" : event.event as ActivityKind;
        const supported = new Set<ActivityKind>(["turn.started", "turn.completed", "turn.failed", "ui.prompt.started", "ui.prompt.ended", "interaction.requested", "interaction.resolved", "manual.input", "run.observed"]);
        if (!supported.has(kind)) return;
        this.activity.publish({
          kind,
          source: "precise",
          agentId: event.agentId,
          runId: event.runId,
          ...(typeof event.data.jobId === "string" ? { jobId: event.data.jobId } : {}),
          ...(typeof event.data.turnId === "string" ? { turnId: event.data.turnId } : {}),
          backend: "herdr",
          driver: "pi-cli",
          ...(event.seq > 0 ? { sourceSequence: event.seq } : {}),
        });
      },
    });
    this.backends.register(this.herdrBackend);
    this.sub = new SubCoordinator({
      journal: this.journal,
      repositoryRoot: options.cwd,
      preflight: options.preallocate,
      resolveBackend: async () => {
        const kind = (await options.resolveBackend?.()) ?? DEFAULT_EXECUTION_BACKEND;
        // Fail here, before any durable allocation, when the resolved backend
        // is not available in this build. Never substitute another backend.
        this.backends.require(kind);
        return kind;
      },
      checkBackendSupport: (backend, item, role) => {
        if (backend === "herdr") assertHerdrRoleSupported(role, item);
      },
      execute: async (input) => {
        const backendKind = input.backend ?? DEFAULT_EXECUTION_BACKEND;
        const backend = this.backends.require(backendKind);
        const turnDriver = input.nestedCli ? "external-cli" as const : backend.driver;
        this.activity.publish({ kind: "turn.started", source: "auxiliary", agentId: input.agentId, jobId: input.jobId, turnId: input.turnId, backend: backendKind, driver: turnDriver });
        try {
          const output = await backend.execute(input);
          this.activity.publish({ kind: output.status === "failed" ? "turn.failed" : "turn.completed", source: "auxiliary", agentId: input.agentId, jobId: input.jobId, turnId: input.turnId, runId: output.runId, backend: output.backend ?? backendKind, driver: output.driver ?? turnDriver });
          return output;
        } catch (error) {
          this.activity.publish({ kind: "turn.failed", source: "auxiliary", agentId: input.agentId, jobId: input.jobId, turnId: input.turnId, backend: backendKind, driver: turnDriver, data: { error: error instanceof Error ? error.message.slice(0, 160) : "execution failed" } });
          throw error;
        }
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
  }

  static async create(options: PersistentAgentRuntimeOptions): Promise<PersistentAgentRuntime> {
    const layout = await ensureSidecarLayout(options.parentSessionPath);
    const resumed = await resumeCoordinator(layout, options.parentId, { deferHerdrReconcile: true });
    const runtime = new PersistentAgentRuntime(options, { layout, journal: resumed.journal });
    await runtime.delivery.recoverPending();
    // Preserve live Herdr jobs until bridge adoption has had the first chance
    // to reattach and replay completion evidence. Only non-adopted Herdr jobs
    // are then reconciled as interrupted/unexecuted.
    const adoption = await runtime.herdrBackend.adoptAfterResume().catch(() => ({ adopted: [] as string[], lost: [] as string[] }));
    const adopted = new Set(adoption.adopted);
    const pendingHerdr = new Set(Object.values(runtime.journal.getState().agents)
      .filter((agent) => agent.backend === "herdr" && (agent.state === "running" || agent.state === "queued") && !adopted.has(agent.id))
      .map((agent) => agent.id));
    if (pendingHerdr.size) await reconcileUnfinishedCoordinator(runtime.journal, "process-loss", { includeAgentIds: pendingHerdr });
    return runtime;
  }

  async shutdown(): Promise<void> {
    await this.sub.scheduler.close();
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
  directBackendCommand?: (args: string, context: ExtensionContext) => Promise<string>;
  directAgentsCommand?: (args: string, context: ExtensionContext) => Promise<string>;
}

const HUB_TOOL_SCHEMA = Type.Object({
  action: Type.Union([Type.Literal("jobs"), Type.Literal("wait"), Type.Literal("output"), Type.Literal("history"), Type.Literal("send"), Type.Literal("cancel")]),
  task_id: Type.Optional(Type.String({ minLength: 1 })),
  job_id: Type.Optional(Type.String({ minLength: 1 })),
  prompt: Type.Optional(Type.String({ minLength: 1 })),
  timeout_ms: Type.Optional(Type.Number({ minimum: 0 })),
  offset: Type.Optional(Type.Number({ minimum: 0 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
}, { additionalProperties: false });

const SUB_DESCRIPTION = "Delegate one bounded turn to a persistent AILI child Agent with its own context. Omit task_id to create the child and run this turn immediately; pass task_id to continue the same child session with a further turn. Calls run foreground by default; set background:true on a top-level call to return task_id immediately and coordinate it through hub. For parallel work, issue several sub calls in the same assistant message: official Pi executes them concurrently and this turn waits for all of them before continuing. The Parent must align task, model, thinking, and CLI requirements with the user before submitting accurate structured parameters; clarify uncertainty first. Strict preflight then runs without an extra selection questionnaire, even without UI. Unavailable or invalid values fail without allocation or fallback. Per-turn model/thinking fields independently override persistent configuration without changing it or the next turn. Omit cli for ordinary Pi execution and omit external model/thinking to preserve vendor defaults. Optional selectionScope is a descriptive one-line task label (1-200 chars), never permission or an authorization cache. For multi-step work, keep a free-form progress.txt at the owning task or change root; create it when absent and do not format-validate it. A formal-task-board.md is optional and never required by sub.";

const SUB_PROMPT_SNIPPET = "sub runs one child turn: foreground by default, top-level background:true for cross-turn work, task_id reuse for follow-up; Parent aligns requirements before supplying model/thinking/cli; strict preflight has no extra selection confirmation; optional selectionScope is descriptive only; hub coordinates jobs/wait/output/history/send/cancel.";

const SUB_PROMPT_GUIDELINES = [
  "One call = one turn: create with subagent_type, or continue a settled task_id; a running task_id returns SUB_BUSY and is never steered or queued.",
  "Parallel foreground calls in one message execute concurrently and wait together. For cross-turn work, use background:true then hub jobs/wait/output/history/send; never invent a fixed wait timeout unless the task requires one.",
  "Before sub, the Parent aligns requirements with the user and resolves unclear model/thinking/cli choices; then submit accurate structured parameters for strict preflight without an extra selection confirmation. Runtime validation cannot prove correct understanding of the user. Fields independently override persistent configuration for this turn only; omitted fields retain ordinary inheritance/default rules. Unavailable values, unsupported thinking, malformed fields, capability drift, abort, or changed session/project fail without allocation or fallback. No self-reported confirmed field or replacement authorization token is accepted. For an external CLI, omit model/thinking for vendor defaults or use one exact vendor-listed model ID and separate thinking value; never silently fix spelling, strip suffixes, infer thinking, or provide runner flags. An external continuation must repeat its frozen cli; omission or change cannot silently switch to a Pi driver. Optional selectionScope is descriptive only. Ordinary tool permissions/questions, credential and sandbox denials, and durable model-config confirmations remain; headless selection does not grant headless tool approval.",
  "Delegated children are observable surfaces: on the herdr backend they run as visible terminals in the user's Herdr window — one AILI tab, parallel work splits panes inside it (optional split: right|down hints the next pane's direction). sub owns the child lifecycle: never start or stop agents, close sub-owned panes, or resend the same task yourself. Direct vendor CLI execution is trusted-local and is not a Pi child hard-permission or AILI OS-sandbox boundary; actual executable binding is Unverified. For Herdr/external-CLI diagnosis, especially an external-output-* failure, use the installed herdr skill for bounded read-only agent get/read, pane read, status, and visible-surface inspection before deciding. The skill may also adjust user-requested layout (focus, move, resize, split ratio), but it never replaces the runtime's structured result evidence and is not an automatic completion gate. External result validation proves only bounded transport/schema/correlation; the Parent must judge whether the content actually answers the task and must not trigger automatic recovery or replay.",
  "Ordinary routing: outside a formal lifecycle, delegate only for concrete benefit; direct work remains valid.",
  "Progress: for multi-step work, create progress.txt at the owning task or change root when absent and append concise free-form progress. It has no fixed grammar and must not trigger format validation. formal-task-board.md is optional, human-readable only, and never required by sub.",
  "Worker boundary: workers return evidence only; they never write the owning progress.txt or optional formal-task-board.md, or decide lifecycle phase, acceptance, or final verdict.",
];


/**
 * Canonical registration surface shared by production and deterministic tests.
 * It registers sub plus the modernized hub coordination surface and direct-user commands.
 * formal_task and legacy run/attempt selectors remain absent.
 */
export function registerPersistentAgentTools(pi: ExtensionAPI, options: InternalPersistentToolRegistrationOptions): void {
  const compactCatalog = renderCompactAgentCatalog(options.catalog);
  if (!compactCatalog.ok) {
    throw new Error(`sub Agent Catalog metadata is non-pass: ${compactCatalog.diagnostics.map((diagnostic) => diagnostic.code).join(", ") || "UNKNOWN"}`);
  }
  registerCanonicalAiliSubTool(pi, {
    name: "sub",
    label: "Sub",
    description: SUB_DESCRIPTION,
    promptSnippet: SUB_PROMPT_SNIPPET,
    promptGuidelines: [...SUB_PROMPT_GUIDELINES, compactCatalog.value],
    parameters: SUB_TOOL_SCHEMA,
    ...SUB_RENDERERS,
    async execute(_toolCallId, params, signal, onUpdate, context) {
      const runtime = await options.runtimeForContext(context);
      const result = await runtime.sub.submit(params, undefined, signal, onUpdate as unknown as TaskUpdateCallback | undefined);
      const enriched = { ...result, results: result.results.map((item) => {
        const taskId = item.taskId ?? item.agentId;
        const activityEvents = runtime.activity.list(taskId).slice(-20);
        const pendingInteractions = activityEvents.filter((event) => event.kind === "interaction.requested").length - activityEvents.filter((event) => event.kind === "interaction.resolved").length;
        const run = Object.values(runtime.journal.getState().runs).filter((candidate) => candidate.agentId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
        return { ...item, activity: runtime.activity.overlay(taskId, 30_000), activityEvents, pendingInteractions: Math.max(0, pendingInteractions), controlMode: run?.controlMode };
      }) };
      return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }], details: enriched };
    },
  });
  pi.registerTool({
    name: "hub",
    label: "Hub",
    description: "Coordinate top-level background sub tasks: inspect jobs, wait without polling loops, read output/history, continue a settled task, or cancel an active task.",
    parameters: HUB_TOOL_SCHEMA,
    async execute(_toolCallId, raw, signal, _onUpdate, context) {
      const runtime = await options.runtimeForContext(context);
      const input = raw as { action: string; task_id?: string; job_id?: string; prompt?: string; timeout_ms?: number; offset?: number; limit?: number };
      const state = () => runtime.journal.getState();
      const taskId = input.task_id?.trim();
      const latestTaskJob = taskId
        ? Object.values(state().jobs).filter((job) => job.agentId === taskId).sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1)?.id
        : undefined;
      const jobId = input.job_id?.trim() ?? (taskId ? state().agents[taskId]?.currentJobId ?? latestTaskJob : undefined);
      let result: unknown;
      if (input.action === "jobs") {
        result = { agents: state().agents, jobs: state().jobs, turns: state().turns };
      } else if (input.action === "wait") {
        if (!jobId) throw new Error("hub wait requires job_id or task_id with an active job");
        const started = Date.now();
        while (true) {
          if (signal?.aborted) throw new Error("hub wait aborted");
          const job = state().jobs[jobId];
          if (!job) throw new Error(`hub wait: unknown job ${jobId}`);
          if (["completed", "failed", "aborted", "unexecuted"].includes(job.state)) { result = job; break; }
          if (input.timeout_ms !== undefined && Date.now() - started >= input.timeout_ms) { result = { status: "timeout", job }; break; }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } else if (input.action === "output" || input.action === "history") {
        if (!taskId) throw new Error(`hub ${input.action} requires task_id`);
        const reader = input.action === "output" ? readAgentOutput : readAgentHistory;
        result = await reader(runtime.layout, runtime.journal, taskId, input.offset ?? 0, input.limit ?? 500);
      } else if (input.action === "send") {
        if (!taskId || !input.prompt?.trim()) throw new Error("hub send requires task_id and prompt");
        result = await runtime.sub.submit({ description: `Continue ${taskId}`, prompt: input.prompt, task_id: taskId, background: true }, undefined, signal);
      } else if (input.action === "cancel") {
        if (!taskId) throw new Error("hub cancel requires task_id");
        result = await runtime.sub.cancelTask(taskId);
      } else throw new Error(`unsupported hub action: ${input.action}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  pi.registerCommand("sub-cancel", {
    description: "Cancel the active turn of one persistent sub task (usage: /sub-cancel <task_id>)",
    handler: async (args, context) => {
      const taskId = args.trim();
      try {
        if (!taskId) throw new Error("usage: /sub-cancel <task_id>");
        const runtime = await options.runtimeForContext(context);
        const result = await runtime.sub.cancelTask(taskId);
        const message = result === "idle"
          ? `${taskId} has no active turn`
          : result === "not-found"
            ? `${taskId} is unknown in this parent session`
            : `${taskId} turn cancellation requested (${result})`;
        context.ui.notify(message, "info");
      } catch (error) {
        context.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
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
  if (options.directBackendCommand) {
    pi.registerCommand("aili-agent-backend", {
      description: "Subagent 后端：s=状态，h=Herdr，m=manage；global herdr|managed|clear 持久化（兼容 status|herdr|managed）；只影响新建 Agent",
      handler: async (args, context) => {
        try {
          context.ui.notify(await options.directBackendCommand!(args, context), "info");
        } catch (error) {
          context.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      },
    });
  }
  if (options.directAgentsCommand) {
    pi.registerCommand("aili-agents", {
      description: "Direct user overview of persistent Agents (usage: /aili-agents [focus <task_id>]); lists backend/run/state and focuses a live Herdr pane",
      handler: async (args, context) => {
        try {
          context.ui.notify(await options.directAgentsCommand!(args, context), "info");
        } catch (error) {
          context.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      },
    });
  }
}
