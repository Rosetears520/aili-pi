import type { RoleProfile } from "../roles.js";
import { loadRoleProfiles } from "../roles.js";
import { allocateAgentId, type CoordinatorJournal } from "./storage.js";
import type { AgentRecord, JobRecord, TurnRecord } from "./types.js";
import { evaluateSpawn } from "./policy.js";
import { assertNoCredentialMaterial } from "./permission.js";
import {
  DEFAULT_AGENT_MAX_RUNTIME_MS,
  DEFAULT_AGENT_SOFT_REQUEST_BUDGET,
  FifoTurnScheduler,
  ScheduledTaskCancelledError,
  type ScheduledExecutionContext,
  type ScheduledHandle,
  type SchedulerPermit,
} from "./scheduler.js";
import { validateTaskRequest, type NormalizedTaskItem } from "./task-schema.js";

export interface TaskExecutionOutput {
  status?: "completed" | "failed";
  output: string;
  error?: string;
  evidence?: unknown;
  model?: { provider?: string; model?: string; thinking?: string; layer?: string };
  profile?: { profileHash?: string; sourceHash?: string; version?: number };
  workspace?: Record<string, unknown>;
}

export interface TaskExecutorInput {
  agentId: string;
  jobId: string;
  turnId: string;
  item: NormalizedTaskItem;
  role: RoleProfile;
  depth: number;
  context: ScheduledExecutionContext;
}

export interface OutputTruncation {
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
  originalLines: number;
  returnedLines: number;
  limits: { bytes: 500_000; lines: 5_000 };
}

export interface NormalizedTaskSettlement {
  status: "completed" | "failed" | "aborted";
  agentId: string;
  jobId: string;
  turnId: string;
  selector: string;
  async: boolean;
  effectiveMode: "sync" | "async";
  effectiveModeReason: "default-async" | "requested-async" | "requested-sync" | "role-blocking" | "nested-sync";
  output: string;
  error?: string;
  evidence?: unknown;
  outputRef: string;
  historyRef: string;
  truncation: OutputTruncation;
  lifecycle: { agent: "idle" | "aborted"; job: "completed" | "failed" | "aborted"; turn: "completed" | "failed" | "aborted" };
  model: { requested?: string; provider?: string; model?: string; thinking?: string; layer?: string };
  profile: { profileHash: string; sourceHash: string; version: number };
  workspace: { requested: NormalizedTaskItem["workspace"]; writeScope: NormalizedTaskItem["writeScope"] } & Record<string, unknown>;
  deliveryRequired: boolean;
  limits: { maxRuntimeMs: 0; softRequestBudget: 0 };
}

export interface TaskAcceptedResult {
  status: "accepted";
  agentId: string;
  jobId: string;
  turnId: string;
  selector: string;
  async: true;
  effectiveMode: "async";
  effectiveModeReason: "default-async" | "requested-async";
  lifecycle: { agent: string; job: string; turn: string };
  outputRef: string;
  historyRef: string;
  deliveryRequired: true;
  limits: { maxRuntimeMs: 0; softRequestBudget: 0 };
}

export type TaskItemResult = TaskAcceptedResult | NormalizedTaskSettlement;

export interface TaskResponse {
  batch: boolean;
  results: TaskItemResult[];
}

export interface TaskAncestry {
  parentAgentId: string;
  parentSelector: string;
  parentDepth: number;
  inheritedPermit: SchedulerPermit;
  configuredMaxDepth?: number;
}

export interface TaskCoordinatorOptions {
  journal: CoordinatorJournal;
  scheduler?: FifoTurnScheduler;
  loadProfiles?: () => Promise<RoleProfile[]>;
  execute: (input: TaskExecutorInput) => Promise<TaskExecutionOutput>;
  onSettled?: (settlement: NormalizedTaskSettlement, fullOutput: string) => void | Promise<void>;
  onAsyncSettled?: (settlement: NormalizedTaskSettlement, fullOutput: string) => void | Promise<void>;
  clock?: () => Date;
}

interface CreatedTask {
  item: NormalizedTaskItem;
  role: RoleProfile;
  agentId: string;
  jobId: string;
  turnId: string;
  depth: number;
  effectiveAsync: boolean;
  reason: TaskAcceptedResult["effectiveModeReason"] | "requested-sync" | "role-blocking" | "nested-sync";
  handle: ScheduledHandle<NormalizedTaskSettlement>;
}

function nextNumericId(prefix: string, existing: Iterable<string>): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const id of existing) {
    const match = id.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

function tailByUtf8Bytes(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxBytes) return value;
  let start = buffer.byteLength - maxBytes;
  while (start < buffer.byteLength && (buffer[start]! & 0b1100_0000) === 0b1000_0000) start += 1;
  return buffer.subarray(start).toString("utf8");
}

export function truncateTaskOutput(output: string): { output: string; truncation: OutputTruncation } {
  const originalBytes = Buffer.byteLength(output);
  const originalLines = output.length === 0 ? 0 : output.split("\n").length;
  const lines = output.split("\n");
  let returned = lines.length > 5_000 ? lines.slice(-5_000).join("\n") : output;
  returned = tailByUtf8Bytes(returned, 500_000);
  const returnedBytes = Buffer.byteLength(returned);
  const returnedLines = returned.length === 0 ? 0 : returned.split("\n").length;
  return {
    output: returned,
    truncation: {
      truncated: returnedBytes !== originalBytes || returnedLines !== originalLines,
      originalBytes,
      returnedBytes,
      originalLines,
      returnedLines,
      limits: { bytes: 500_000, lines: 5_000 },
    },
  };
}

export class TaskCoordinator {
  readonly scheduler: FifoTurnScheduler;
  private readonly loadProfiles: () => Promise<RoleProfile[]>;
  private readonly clock: () => Date;
  private readonly handles = new Map<string, ScheduledHandle<NormalizedTaskSettlement>>();
  private readonly settlements = new Map<string, Promise<NormalizedTaskSettlement>>();
  private readonly fullOutputs = new Map<string, string>();
  private submissionTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: TaskCoordinatorOptions) {
    this.scheduler = options.scheduler ?? new FifoTurnScheduler();
    this.loadProfiles = options.loadProfiles ?? loadRoleProfiles;
    this.clock = options.clock ?? (() => new Date());
  }

  async submit(raw: unknown, ancestry?: TaskAncestry, parentSignal?: AbortSignal): Promise<TaskResponse> {
    await assertNoCredentialMaterial(raw, "task input");
    const prepared = await this.serializeSubmission(async () => {
      const profiles = await this.loadProfiles();
      const request = validateTaskRequest(raw, profiles);
      const bySelector = new Map(profiles.map((profile) => [profile.selector, profile]));
      if (ancestry && !this.scheduler.isPermitActive(ancestry.inheritedPermit)) {
        throw new Error("nested task requires an active inherited ancestor permit");
      }

      // Resolve every role/spawn decision before the first durable allocation.
      for (const item of request.items) {
        const role = bySelector.get(item.agent)!;
        if (ancestry) {
          const parentRole = bySelector.get(ancestry.parentSelector);
          if (!parentRole) throw new Error(`${ancestry.parentSelector}: parent selector is unavailable`);
          const spawn = evaluateSpawn(parentRole, role.selector, ancestry.parentDepth, ancestry.configuredMaxDepth);
          if (!spawn.allowed) throw new Error(`${role.selector}: nested spawn denied (${spawn.reason})`);
        }
      }

      const created: CreatedTask[] = [];
      for (const item of request.items) created.push(await this.createAndSchedule(item, bySelector.get(item.agent)!, ancestry));
      return { request, created };
    });

    let abortListener: (() => void) | undefined;
    if (parentSignal) {
      abortListener = () => {
        for (const task of prepared.created) void this.cancel(task.jobId);
      };
      parentSignal.addEventListener("abort", abortListener, { once: true });
      if (parentSignal.aborted) abortListener();
      void Promise.allSettled(prepared.created.map((task) => task.handle.result)).then(() => {
        if (abortListener) parentSignal.removeEventListener("abort", abortListener);
      });
    }

    const results = await Promise.all(prepared.created.map(async (task): Promise<TaskItemResult> => {
      if (task.effectiveAsync) {
        const state = this.options.journal.getState();
        return {
          status: "accepted",
          agentId: task.agentId,
          jobId: task.jobId,
          turnId: task.turnId,
          selector: task.role.selector,
          async: true,
          effectiveMode: "async",
          effectiveModeReason: task.reason as "default-async" | "requested-async",
          lifecycle: {
            agent: state.agents[task.agentId]?.state ?? "queued",
            job: state.jobs[task.jobId]?.state ?? "queued",
            turn: state.turns[task.turnId]?.state ?? "queued",
          },
          outputRef: `agent://${task.agentId}`,
          historyRef: `history://${task.agentId}`,
          deliveryRequired: true,
          limits: { maxRuntimeMs: 0, softRequestBudget: 0 },
        };
      }
      return await task.handle.result;
    }));
    return { batch: prepared.request.batch, results };
  }

  private async serializeSubmission<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.submissionTail.then(operation);
    this.submissionTail = current.then(() => undefined, () => undefined);
    return await current;
  }

  getSettlement(jobId: string): Promise<NormalizedTaskSettlement> | undefined {
    return this.settlements.get(jobId);
  }

  getHandle(jobId: string): ScheduledHandle<NormalizedTaskSettlement> | undefined {
    return this.handles.get(jobId);
  }

  async cancel(jobId: string): Promise<"queued" | "running" | "not-found"> {
    return await this.scheduler.cancel(jobId);
  }

  private async createAndSchedule(item: NormalizedTaskItem, role: RoleProfile, ancestry?: TaskAncestry): Promise<CreatedTask> {
    const before = this.options.journal.getState();
    const agentId = allocateAgentId(item.name ?? role.name, [...Object.keys(before.agents), ...Object.keys(before.releasedAgents)], ancestry?.parentAgentId);
    const jobId = nextNumericId("job", Object.keys(before.jobs));
    const turnId = nextNumericId("turn", Object.keys(before.turns));
    const depth = ancestry ? ancestry.parentDepth + 1 : 0;
    const now = this.clock().toISOString();
    const agent: AgentRecord = {
      id: agentId,
      name: item.name ?? role.name,
      selector: role.selector,
      state: "queued",
      parentAgentId: ancestry?.parentAgentId,
      currentJobId: jobId,
      currentTurnId: turnId,
      createdAt: now,
      updatedAt: now,
      metadata: {
        depth,
        profileHash: role.profileHash,
        sourceHash: role.sourceHash,
        profileVersion: role.profileVersion,
      },
    };
    const job: JobRecord = {
      id: jobId,
      agentId,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      metadata: { requestedModel: item.model, requestedAsync: item.async, workspace: item.workspace, writeScope: item.writeScope },
    };
    const turn: TurnRecord = {
      id: turnId,
      agentId,
      jobId,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      metadata: {
        task: item.task,
        profileHash: role.profileHash,
        sourceHash: role.sourceHash,
        maxRuntimeMs: DEFAULT_AGENT_MAX_RUNTIME_MS,
        softRequestBudget: DEFAULT_AGENT_SOFT_REQUEST_BUDGET,
      },
    };
    await this.options.journal.append({ kind: "agent.created", agentId, payload: { record: agent } });
    await this.options.journal.append({ kind: "job.created", agentId, jobId, payload: { record: job } });
    await this.options.journal.append({ kind: "turn.created", agentId, jobId, turnId, payload: { record: turn } });

    const effectiveAsync = ancestry ? false : role.blocking ? false : item.async ?? true;
    const reason: CreatedTask["reason"] = ancestry
      ? "nested-sync"
      : role.blocking
        ? "role-blocking"
        : item.async === false
          ? "requested-sync"
          : item.async === true
            ? "requested-async"
            : "default-async";
    const run = (context: ScheduledExecutionContext) => this.runLifecycle({ item, role, agentId, jobId, turnId, depth, effectiveAsync, reason, context });
    const onCancelBeforeStart = () => this.cancelBeforeStart(agentId, jobId, turnId, role, item, effectiveAsync, reason);
    const handle = ancestry
      ? this.scheduler.runNested(jobId, ancestry.inheritedPermit, run)
      : this.scheduler.enqueue(jobId, run, onCancelBeforeStart);
    this.handles.set(jobId, handle);
    const baseSettlement = handle.result.catch(async (error) => {
      if (error instanceof ScheduledTaskCancelledError && error.beforeStart) {
        return this.cancelledSettlement(agentId, jobId, turnId, role, item, effectiveAsync, reason, error.message);
      }
      throw error;
    });
    const settlement = baseSettlement.then(async (result) => {
      const fullOutput = this.fullOutputs.get(jobId) ?? "";
      if (effectiveAsync) await this.options.onAsyncSettled?.(result, fullOutput);
      return result;
    });
    this.settlements.set(jobId, settlement);
    void settlement.catch(() => undefined);
    const normalizedHandle: ScheduledHandle<NormalizedTaskSettlement> = { ...handle, result: settlement };
    this.handles.set(jobId, normalizedHandle);
    return { item, role, agentId, jobId, turnId, depth, effectiveAsync, reason, handle: normalizedHandle };
  }

  private async begin(agentId: string, jobId: string, turnId: string): Promise<void> {
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "running" } });
  }

  private async runLifecycle(args: Omit<CreatedTask, "handle"> & { context: ScheduledExecutionContext }): Promise<NormalizedTaskSettlement> {
    const { agentId, jobId, turnId, role, item, effectiveAsync, reason, context, depth } = args;
    await this.begin(agentId, jobId, turnId);
    let status: NormalizedTaskSettlement["status"] = "completed";
    let output: TaskExecutionOutput;
    try {
      output = await this.options.execute({ agentId, jobId, turnId, item, role, depth, context });
      if (context.signal.aborted) throw context.signal.reason ?? new ScheduledTaskCancelledError(jobId, false);
      if (output.status === "failed") status = "failed";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status = context.signal.aborted || error instanceof ScheduledTaskCancelledError ? "aborted" : "failed";
      output = { output: "", error: message };
    }

    let result = this.settlement(status, agentId, jobId, turnId, role, item, effectiveAsync, reason, output);
    try {
      await this.options.onSettled?.(result, output.output);
    } catch (error) {
      const message = `output persistence failed: ${error instanceof Error ? error.message : String(error)}`;
      status = status === "aborted" ? "aborted" : "failed";
      output = { output: "", error: message };
      result = this.settlement(status, agentId, jobId, turnId, role, item, effectiveAsync, reason, output);
    }

    if (status === "completed") await this.finishCompleted(agentId, jobId, turnId);
    else if (status === "aborted") await this.finishAborted(agentId, jobId, turnId, output.error ?? "aborted");
    else await this.finishFailed(agentId, jobId, turnId, output.error ?? "Agent execution reported failure");
    return result;
  }

  private async finishCompleted(agentId: string, jobId: string, turnId: string): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "running", to: "completed", outcome: "completed" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "running", to: "completed" } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "running", to: "idle" } });
  }

  private async finishFailed(agentId: string, jobId: string, turnId: string, error: string): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "running", to: "failed", outcome: error } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "running", to: "failed", error } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "running", to: "idle" } });
  }

  private async finishAborted(agentId: string, jobId: string, turnId: string, error: string): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "running", to: "aborted", outcome: error } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "running", to: "aborted", error } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "running", to: "aborted" } });
  }

  private async cancelBeforeStart(agentId: string, jobId: string, turnId: string, role: RoleProfile, item: NormalizedTaskItem, effectiveAsync: boolean, reason: CreatedTask["reason"]): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "aborted", outcome: "cancelled-before-start" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "aborted", error: "cancelled-before-start" } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "aborted" } });
    void role;
    void item;
    void effectiveAsync;
    void reason;
  }

  private cancelledSettlement(agentId: string, jobId: string, turnId: string, role: RoleProfile, item: NormalizedTaskItem, effectiveAsync: boolean, reason: CreatedTask["reason"], error: string): NormalizedTaskSettlement {
    return this.settlement("aborted", agentId, jobId, turnId, role, item, effectiveAsync, reason, { output: "", error });
  }

  private settlement(
    status: NormalizedTaskSettlement["status"],
    agentId: string,
    jobId: string,
    turnId: string,
    role: RoleProfile,
    item: NormalizedTaskItem,
    effectiveAsync: boolean,
    reason: CreatedTask["reason"],
    execution: TaskExecutionOutput,
  ): NormalizedTaskSettlement {
    this.fullOutputs.set(jobId, execution.output);
    const truncated = truncateTaskOutput(execution.output);
    const lifecycle = status === "completed"
      ? { agent: "idle" as const, job: "completed" as const, turn: "completed" as const }
      : status === "failed"
        ? { agent: "idle" as const, job: "failed" as const, turn: "failed" as const }
        : { agent: "aborted" as const, job: "aborted" as const, turn: "aborted" as const };
    return {
      status,
      agentId,
      jobId,
      turnId,
      selector: role.selector,
      async: effectiveAsync,
      effectiveMode: effectiveAsync ? "async" : "sync",
      effectiveModeReason: reason,
      output: truncated.output,
      error: execution.error,
      evidence: execution.evidence,
      outputRef: `agent://${agentId}`,
      historyRef: `history://${agentId}`,
      truncation: truncated.truncation,
      lifecycle,
      model: { requested: item.model, ...execution.model },
      profile: {
        profileHash: execution.profile?.profileHash ?? role.profileHash,
        sourceHash: execution.profile?.sourceHash ?? role.sourceHash,
        version: execution.profile?.version ?? role.profileVersion,
      },
      workspace: { requested: item.workspace, writeScope: item.writeScope, ...(execution.workspace ?? {}) },
      deliveryRequired: effectiveAsync,
      limits: { maxRuntimeMs: 0, softRequestBudget: 0 },
    };
  }
}
