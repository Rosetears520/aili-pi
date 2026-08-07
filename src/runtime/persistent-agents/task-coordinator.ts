import { relative, sep } from "node:path";
import type { RoleProfile } from "../roles.js";
import { loadRoleProfiles } from "../roles.js";
import { resolveFormalTaskBoardRoot } from "../formal-task-board-root.js";
import { parseFormalTaskBoard } from "../formal-task-board.js";
import { allocateAgentId, type CoordinatorJournal } from "./storage.js";
import type { AgentRecord, FormalResultEvidenceStatus, JobRecord, TurnRecord } from "./types.js";
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
import {
  sameFormalContinuationAudit,
  validateTaskRequest,
  type FormalContinuationAudit,
  type NormalizedTaskItem,
} from "./task-schema.js";

export interface TaskExecutionOutput {
  status?: "completed" | "failed";
  result?: "completed" | "partial";
  output: string;
  error?: string;
  evidence?: unknown;
  model?: { provider?: string; model?: string; thinking?: string; layer?: string };
  profile?: { profileHash?: string; sourceHash?: string; version?: number };
  workspace?: Record<string, unknown>;
}

export const FORMAL_RESULT_MAX_BYTES = 256_000;
export const FORMAL_RESULT_MAX_LINES = 1_000;
const FORMAL_RESULT_FIELDS = [
  "result_id", "trace_id", "lane", "owner", "package_id", "role_id", "status", "confidence",
  "worktree_context_ref", "declared_repository", "cwd", "target_rules_ref", "artifact_destination",
  "inspected_scope", "summary", "evidence", "changed_files", "verification", "checks", "freshness",
  "skipped_checks", "soft_boundary_limitations", "blockers", "risks", "unverified",
  "continuation_recommendation", "findings", "convergence_links", "review_arbitration_ref",
] as const;

export interface CanonicalFormalResult {
  status: "completed" | "partial" | "blocked" | "unverified";
  fields: Readonly<Record<(typeof FORMAL_RESULT_FIELDS)[number], string>>;
}

export type CanonicalFormalResultParse =
  | { ok: true; value: CanonicalFormalResult }
  | { ok: false; error: string };

/** Strict parser for the one formal terminal envelope. Ordinary output never passes through it. */
export function parseCanonicalFormalResult(
  output: string,
  expected: { packageId: string; roleId: string },
): CanonicalFormalResultParse {
  const bytes = Buffer.byteLength(output);
  if (bytes === 0 || output.trim().length === 0) return { ok: false, error: "formal result is empty" };
  if (bytes > FORMAL_RESULT_MAX_BYTES) return { ok: false, error: "formal result exceeds the byte bound" };
  if (output.includes("\r") || output.includes("\0")) return { ok: false, error: "formal result contains forbidden control bytes" };
  const lines = output.endsWith("\n") ? output.slice(0, -1).split("\n") : output.split("\n");
  if (lines.length > FORMAL_RESULT_MAX_LINES) return { ok: false, error: "formal result exceeds the line bound" };
  if (lines[0] !== "CANONICAL RESULT:") return { ok: false, error: "formal result must start with exact CANONICAL RESULT:" };
  if (lines.slice(1).includes("CANONICAL RESULT:")) return { ok: false, error: "formal result contains a duplicate terminal marker" };
  if (lines.length !== FORMAL_RESULT_FIELDS.length + 1) return { ok: false, error: "formal result has missing, extra, or multiline fields" };
  const required = new Set<string>(FORMAL_RESULT_FIELDS);
  const fields = {} as Record<(typeof FORMAL_RESULT_FIELDS)[number], string>;
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) return { ok: false, error: "formal result contains a malformed field" };
    const key = line.slice(0, separator);
    const rawValue = line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (!required.has(key)) return { ok: false, error: `formal result contains unknown or duplicate field '${key}'` };
    if (value.length === 0 || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
      return { ok: false, error: `formal result field '${key}' must be one exact non-empty line` };
    }
    fields[key as (typeof FORMAL_RESULT_FIELDS)[number]] = value;
    required.delete(key);
  }
  if (required.size > 0) return { ok: false, error: `formal result is missing required field '${[...required][0]}'` };
  if (fields.package_id !== expected.packageId) return { ok: false, error: "formal result package_id does not match the continuation audit" };
  if (fields.role_id !== expected.roleId) return { ok: false, error: "formal result role_id does not match the exact selector" };
  if (!["completed", "partial", "blocked", "unverified"].includes(fields.status)) {
    return { ok: false, error: "formal result status is not canonical" };
  }
  const semanticallyEmpty = new Set(["n/a", "none", "[]", "-"]);
  if (semanticallyEmpty.has(fields.evidence.toLowerCase()) || semanticallyEmpty.has(fields.verification.toLowerCase())) {
    return { ok: false, error: "formal result evidence and verification must be non-empty portable evidence" };
  }
  return { ok: true, value: { status: fields.status as CanonicalFormalResult["status"], fields } };
}

export interface FormalTaskProtection {
  changeId: string;
  protectedPaths: readonly [string, string];
}

export interface FormalWorkspaceRequest {
  mode: NormalizedTaskItem["workspace"];
  writeScope: NormalizedTaskItem["writeScope"];
  cwd: string;
  selector: string;
}

export interface TaskExecutorInput {
  agentId: string;
  jobId: string;
  turnId: string;
  item: NormalizedTaskItem;
  role: RoleProfile;
  depth: number;
  context: ScheduledExecutionContext;
  formalProtection?: FormalTaskProtection;
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
  formalResultStatus?: FormalResultEvidenceStatus;
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
  formalChangeId?: string;
}

export interface TaskCoordinatorOptions {
  journal: CoordinatorJournal;
  repositoryRoot?: string;
  scheduler?: FifoTurnScheduler;
  loadProfiles?: () => Promise<RoleProfile[]>;
  execute: (input: TaskExecutorInput) => Promise<TaskExecutionOutput>;
  onSettled?: (settlement: NormalizedTaskSettlement, fullOutput: string) => void | Promise<void>;
  onFormalSettled?: (settlement: NormalizedTaskSettlement, fullOutput: string) => void | Promise<void>;
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
  formalProtection?: FormalTaskProtection;
  handle: ScheduledHandle<NormalizedTaskSettlement>;
}

export function assertCurrentFormalRoleProfile(agent: AgentRecord, role: RoleProfile): void {
  const metadata = agent.metadata;
  if (metadata?.formalContinuationIdentity === undefined && metadata?.formalProtection === undefined) return;
  const unchanged = agent.selector === role.selector
    && metadata.selector === role.selector
    && metadata.profileHash === role.profileHash
    && metadata.sourceHash === role.sourceHash
    && metadata.profileVersion === role.profileVersion
    && metadata.runtimeAdapterVersion === role.runtimeAdapterVersion;
  if (!unchanged) {
    throw new Error(`${agent.id}: formal Agent RoleProfile identity drifted; create a new Agent`);
  }
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

export async function resolveFormalTaskProtection(
  repositoryRoot: string,
  changeId: string,
  continuationAudit: FormalContinuationAudit,
  writeScope: NormalizedTaskItem["writeScope"],
): Promise<FormalTaskProtection> {
  const resolution = await resolveFormalTaskBoardRoot({
    repositoryRoot,
    identity: { state: "resolved", changeId },
  });
  if (resolution.status !== "resolved") {
    const codes = resolution.diagnostics.map((entry) => entry.code).join(", ") || "UNKNOWN";
    throw new Error(`formalContext '${changeId}' failed exact v1 root validation: ${codes}`);
  }
  if (resolution.pairState !== "present") {
    throw new Error(`formalContext '${changeId}' requires an existing valid v1 formal-task-board.md/progress.txt pair`);
  }
  const parsed = parseFormalTaskBoard(resolution.tasksSource);
  const taskPackage = parsed.board?.packages.find((candidate) => candidate.id === continuationAudit.packageId);
  if (parsed.classification !== "v1" || !taskPackage) {
    throw new Error("formal continuationAudit must identify one exact package on the validated board before Agent allocation");
  }
  const field = (name: keyof typeof taskPackage.fields) => taskPackage.fields[name]?.value ?? "";
  const owner = field("Owner");
  const expectedAudit: FormalContinuationAudit = {
    packageId: taskPackage.id,
    canonicalRole: owner.startsWith("agent:") ? owner.slice("agent:".length) : "",
    scope: field("Scope"),
    forbiddenScope: field("Forbidden scope"),
    writeScope,
    acceptanceBoundary: field("Acceptance"),
    expectedEvidence: field("Expected evidence"),
  };
  if (!sameFormalContinuationAudit(continuationAudit, expectedAudit)) {
    throw new Error("formal continuationAudit does not match the exact board package, canonical role, scope, permission, acceptance, or evidence contract; create a new bounded job/Agent");
  }
  const projectRelative = (path: string) => relative(resolution.repositoryRoot, path).replaceAll(sep, "/");
  return {
    changeId,
    protectedPaths: [projectRelative(resolution.tasksPath), projectRelative(resolution.progressPath)],
  };
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
      if (ancestry?.formalChangeId) {
        for (const item of request.items) {
          if (item.formalContext?.changeId !== ancestry.formalChangeId) {
            throw new Error(`nested task under formalContext '${ancestry.formalChangeId}' must explicitly repeat the exact same formalContext.changeId`);
          }
        }
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

      // Resolve every exact formal root before the first durable Agent/job/turn
      // allocation. A malformed batch therefore cannot partially allocate.
      const protections = await Promise.all(request.items.map((item) => this.resolveFormalProtection(item)));
      const created: CreatedTask[] = [];
      for (let index = 0; index < request.items.length; index += 1) {
        const item = request.items[index]!;
        created.push(await this.createAndSchedule(item, bySelector.get(item.agent)!, ancestry, protections[index]));
      }
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

  private async resolveFormalProtection(item: NormalizedTaskItem): Promise<FormalTaskProtection | undefined> {
    if (!item.formalContext) return undefined;
    if (!this.options.repositoryRoot) {
      throw new Error("formalContext requires the current project root before Agent allocation");
    }
    if (!item.continuationAudit) {
      throw new Error("formal continuationAudit must identify one exact package on the validated board before Agent allocation");
    }
    return await resolveFormalTaskProtection(
      this.options.repositoryRoot,
      item.formalContext.changeId,
      item.continuationAudit,
      item.writeScope,
    );
  }

  private async createAndSchedule(
    item: NormalizedTaskItem,
    role: RoleProfile,
    ancestry?: TaskAncestry,
    formalProtection?: FormalTaskProtection,
  ): Promise<CreatedTask> {
    const before = this.options.journal.getState();
    const agentId = allocateAgentId(item.name ?? role.name, [...Object.keys(before.agents), ...Object.keys(before.releasedAgents)], ancestry?.parentAgentId);
    const jobId = nextNumericId("job", Object.keys(before.jobs));
    const turnId = nextNumericId("turn", Object.keys(before.turns));
    const depth = ancestry ? ancestry.parentDepth + 1 : 0;
    const now = this.clock().toISOString();
    const formalWorkspaceRequest: FormalWorkspaceRequest | undefined = formalProtection ? {
      mode: item.workspace,
      writeScope: item.writeScope,
      cwd: item.cwd ?? ".",
      selector: role.selector,
    } : undefined;
    const formalMetadata = formalProtection ? {
      formalProtection,
      formalContinuationIdentity: item.continuationAudit,
      formalWorkspaceRequest,
    } : {};
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
        selector: role.selector,
        profileHash: role.profileHash,
        sourceHash: role.sourceHash,
        profileVersion: role.profileVersion,
        runtimeAdapterVersion: role.runtimeAdapterVersion,
        ...formalMetadata,
      },
    };
    const job: JobRecord = {
      id: jobId,
      agentId,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      metadata: {
        requestedModel: item.model,
        requestedAsync: item.async,
        workspace: item.workspace,
        writeScope: item.writeScope,
        ...formalMetadata,
      },
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
        ...formalMetadata,
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
    const run = (context: ScheduledExecutionContext) => this.runLifecycle({ item, role, agentId, jobId, turnId, depth, effectiveAsync, reason, formalProtection, context });
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
    return { item, role, agentId, jobId, turnId, depth, effectiveAsync, reason, formalProtection, handle: normalizedHandle };
  }

  private async begin(agentId: string, jobId: string, turnId: string): Promise<void> {
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "running" } });
  }

  private async runLifecycle(args: Omit<CreatedTask, "handle"> & { context: ScheduledExecutionContext }): Promise<NormalizedTaskSettlement> {
    const { agentId, jobId, turnId, role, item, effectiveAsync, reason, formalProtection, context, depth } = args;
    await this.begin(agentId, jobId, turnId);
    let status: NormalizedTaskSettlement["status"] = "completed";
    let output: TaskExecutionOutput;
    try {
      output = await this.options.execute({ agentId, jobId, turnId, item, role, depth, context, formalProtection });
      if (context.signal.aborted) throw context.signal.reason ?? new ScheduledTaskCancelledError(jobId, false);
      if (output.status === "failed") status = "failed";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status = context.signal.aborted || error instanceof ScheduledTaskCancelledError ? "aborted" : "failed";
      output = { output: "", error: message };
    }

    let formalResultStatus: FormalResultEvidenceStatus | undefined;
    if (formalProtection) {
      const parsed = parseCanonicalFormalResult(output.output, {
        packageId: item.continuationAudit!.packageId,
        roleId: role.selector,
      });
      formalResultStatus = parsed.ok ? parsed.value.status : "malformed";
      if (status === "completed" && (!parsed.ok || parsed.value.status === "blocked" || parsed.value.status === "unverified")) {
        status = "failed";
        output = {
          ...output,
          error: parsed.ok
            ? `formal canonical result reported ${parsed.value.status}`
            : `malformed formal canonical result: ${parsed.error}`,
        };
      }
    }

    let result = this.settlement(status, agentId, jobId, turnId, role, item, effectiveAsync, reason, output, formalResultStatus);
    try {
      await this.options.onSettled?.(result, output.output);
      if (formalProtection) {
        if (!this.options.onFormalSettled) throw new Error("formal result evidence persistence is unavailable");
        await this.options.onFormalSettled(result, output.output);
      }
    } catch (error) {
      const message = `output persistence failed: ${error instanceof Error ? error.message : String(error)}`;
      status = status === "aborted" ? "aborted" : "failed";
      output = { output: "", error: message };
      formalResultStatus ??= formalProtection ? "malformed" : undefined;
      result = this.settlement(status, agentId, jobId, turnId, role, item, effectiveAsync, reason, output, formalResultStatus);
    }

    if (status === "completed") await this.finishCompleted(agentId, jobId, turnId, formalResultStatus === "partial" ? "partial" : "completed");
    else if (status === "aborted") await this.finishAborted(agentId, jobId, turnId, output.error ?? "aborted");
    else await this.finishFailed(
      agentId,
      jobId,
      turnId,
      output.error ?? "Agent execution reported failure",
      formalResultStatus === "blocked" || formalResultStatus === "unverified" ? "blocked" : formalResultStatus ? "failed" : undefined,
    );
    return result;
  }

  private async finishCompleted(agentId: string, jobId: string, turnId: string, result: "completed" | "partial"): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "running", to: "completed", outcome: "completed" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "running", to: "completed", result } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "running", to: "idle" } });
  }

  private async finishFailed(agentId: string, jobId: string, turnId: string, error: string, formalResult?: "blocked" | "failed"): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "running", to: "failed", outcome: error } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "running", to: "failed", error, ...(formalResult ? { result: formalResult } : {}) } });
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
    formalResultStatus?: FormalResultEvidenceStatus,
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
      ...(formalResultStatus ? { formalResultStatus } : {}),
    };
  }
}
