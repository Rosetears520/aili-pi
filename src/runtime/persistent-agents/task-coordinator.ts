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
import type { CurrentTurnModelAuthority, ModelChoiceSource, ResolvedModelChoice, SubagentModelDecision, ThinkingSource } from "./model-selection.js";
import { boundedDisplayText } from "./task-hub-renderer.js";

export interface TaskExecutionOutput {
  status?: "completed" | "failed";
  result?: "completed" | "partial";
  output: string;
  error?: string;
  evidence?: unknown;
  model?: { provider?: string; model?: string; thinking?: string; speedTier?: string; layer?: string; modelSource?: string; thinkingSource?: string };
  profile?: { profileHash?: string; sourceHash?: string; version?: number };
  workspace?: Record<string, unknown>;
}

export const FORMAL_RESULT_MAX_BYTES = 256_000;
export const FORMAL_RESULT_MAX_LINES = 1_000;
export const FORMAL_RESULT_FIELDS = [
  "result_id", "trace_id", "lane", "owner", "package_id", "role_id", "status", "confidence",
  "worktree_context_ref", "declared_repository", "cwd", "target_rules_ref", "artifact_destination",
  "inspected_scope", "summary", "evidence", "changed_files", "verification", "checks", "freshness",
  "skipped_checks", "soft_boundary_limitations", "blockers", "risks", "unverified",
  "continuation_recommendation", "findings", "convergence_links", "review_arbitration_ref",
] as const;

export interface CanonicalFormalResultExpectation {
  packageId: string;
  roleId: string;
}

export interface CanonicalFormalResult {
  status: "completed" | "partial" | "blocked" | "unverified";
  fields: Readonly<Record<(typeof FORMAL_RESULT_FIELDS)[number], string>>;
}

export type CanonicalFormalResultParse =
  | { ok: true; value: CanonicalFormalResult }
  | { ok: false; error: string };

function assertFormalInstructionIdentity(value: string, label: string): void {
  if (value.length === 0 || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) {
    throw new Error(`${label} must be one exact non-empty line`);
  }
}

/**
 * Render the formal-only output override from the parser's own field inventory.
 * Keeping the template here prevents the Worker instruction and settlement
 * parser from acquiring independent field lists.
 */
export function renderCanonicalFormalResultInstruction(expected: CanonicalFormalResultExpectation): string {
  assertFormalInstructionIdentity(expected.packageId, "formal result package_id");
  assertFormalInstructionIdentity(expected.roleId, "formal result role_id");
  const fieldLines = FORMAL_RESULT_FIELDS.map((field) => {
    if (field === "package_id") return `${field}: ${expected.packageId}`;
    if (field === "role_id") return `${field}: ${expected.roleId}`;
    if (field === "status") return `${field}: <completed|partial|blocked|unverified>`;
    if (field === "evidence" || field === "verification") return `${field}: <non-empty portable evidence>`;
    return `${field}: <non-empty single-line value>`;
  });
  return [
    "This formal-only result contract is authoritative and overrides every JSON or output instruction in the selected role profile above.",
    "Return only the exact plain-text multiline envelope whose marker and complete parser-owned field inventory are shown below. JSON output is forbidden. Do not use a Markdown fence or add prose before or after the envelope.",
    "Use every field exactly once in the shown order. Every field value must be non-empty, trimmed, and confined to one line; replace every angle-bracket placeholder.",
    `package_id must be exactly '${expected.packageId}' and role_id must be exactly '${expected.roleId}'.`,
    "status must be completed, partial, blocked, or unverified. evidence and verification must contain portable evidence, not n/a, none, [], or -.",
    "CANONICAL RESULT:",
    ...fieldLines,
  ].join("\n");
}

/** Strict parser for the one formal terminal envelope. Ordinary output never passes through it. */
export function parseCanonicalFormalResult(
  output: string,
  expected: CanonicalFormalResultExpectation,
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
    if (value.length === 0 || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) {
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
  modelChoice?: ResolvedModelChoice;
  depth: number;
  context: ScheduledExecutionContext;
  formalProtection?: FormalTaskProtection;
  /** Frozen direct-parent identity for this turn, including hub/revive preparation. */
  parentResolution?: ResolvedModelChoice;
  /** Frozen current-turn authority captured before this task was allocated. */
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  /** Structured model/thinking request decision recorded at dispatch. */
  modelDecision?: SubagentModelDecision;
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
  name?: string;
  requestedModel?: string | null;
  effectiveModel?: string | null;
  modelLayer?: string | null;
  thinking?: string | null;
  source?: string | null;
  parentModel?: string | null;
  parentThinking?: string | null;
  parentSpeedTier?: string | null;
  parentSource?: string | null;
  model: { requested?: string; requestedThinking?: string; provider?: string; model?: string; thinking?: string; speedTier?: string; layer?: string; modelSource?: string; thinkingSource?: string };
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
  name: string;
  requestedModel: string | null;
  effectiveModel: string | null;
  modelLayer: string | null;
  thinking: string | null;
  source: string | null;
  parentModel?: string | null;
  parentThinking?: string | null;
  parentSpeedTier?: string | null;
  parentSource?: string | null;
  model: { requested?: string; requestedThinking?: string; provider?: string; model?: string; thinking?: string; speedTier?: string; layer?: string; modelSource?: string; thinkingSource?: string };
  /** Structured model/thinking request decision recorded at dispatch. */
  modelDecision?: SubagentModelDecision;
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

export interface TaskLiveSnapshot {
  /** Allocation evidence is deliberately distinct from the authoritative final result. */
  status: "allocated" | "running";
  name: string;
  selector: string;
  requestedModel: string | null;
  /** Short aliases retained for display consumers that use the final-result vocabulary. */
  requested?: string;
  effectiveModel?: string;
  effective?: string;
  provider?: string;
  model?: string;
  layer?: string;
  thinking?: string;
  speedTier?: string;
  modelSource?: string;
  thinkingSource?: string;
  source?: string;
  parentModel?: string;
  parentThinking?: string;
  parentSpeedTier?: string;
  parentSource?: string;
  agentId: string;
  jobId: string;
  turnId: string;
  lifecycle: {
    agent: AgentRecord["state"];
    job: JobRecord["state"];
    turn: TurnRecord["state"];
  };
}

export interface TaskLiveBatchSnapshot {
  status: "allocated" | "running";
  batch: true;
  results: TaskLiveSnapshot[];
}

export interface TaskLiveUpdate {
  content: [{ type: "text"; text: string }];
  details: TaskLiveSnapshot | TaskLiveBatchSnapshot;
}

export type TaskUpdateCallback = (partialResult: TaskLiveUpdate) => void;

export interface TaskAncestry {
  parentAgentId: string;
  parentSelector: string;
  parentDepth: number;
  inheritedPermit: SchedulerPermit;
  /** Frozen direct-parent resolution used by nested work, never the root Main implicitly. */
  parentResolution?: ResolvedModelChoice;
  /** User-owned authority captured for the latest direct Parent turn. */
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  /** Compatibility aliases for callers using shorter authority vocabulary. */
  currentTurnAuthority?: CurrentTurnModelAuthority;
  authority?: CurrentTurnModelAuthority;
  configuredMaxDepth?: number;
  formalChangeId?: string;
}

export interface TaskPreflightResult {
  choice?: ResolvedModelChoice;
  parentResolution?: ResolvedModelChoice;
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  /** Structured model/thinking request decision recorded at dispatch. */
  modelDecision?: SubagentModelDecision;
}

export interface TaskCoordinatorOptions {
  journal: CoordinatorJournal;
  repositoryRoot?: string;
  scheduler?: FifoTurnScheduler;
  loadProfiles?: () => Promise<RoleProfile[]>;
  execute: (input: TaskExecutorInput) => Promise<TaskExecutionOutput>;
  preflight?: (input: { item: NormalizedTaskItem; role: RoleProfile; ancestry?: TaskAncestry }) => ResolvedModelChoice | TaskPreflightResult | undefined | Promise<ResolvedModelChoice | TaskPreflightResult | undefined>;
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
  modelChoice?: ResolvedModelChoice;
  parentResolution?: ResolvedModelChoice;
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  modelDecision?: SubagentModelDecision;
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

function modelAuditSources(choice: ResolvedModelChoice | undefined): {
  modelSource?: ModelChoiceSource | string;
  thinkingSource?: ThinkingSource | string;
  source?: string;
} {
  if (!choice) return {};
  const modelSource = choice.modelSource ?? choice.source;
  const thinkingSource = choice.thinkingSource
    ?? (choice.layer === "parent-fallback" ? "inherited-parent" : choice.layer === "one-shot" ? "user-one-shot" : "model-default");
  return {
    ...(modelSource === undefined ? {} : { modelSource }),
    ...(thinkingSource === undefined ? {} : { thinkingSource }),
    ...(choice.source === undefined ? {} : { source: choice.source }),
  };
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

  async submit(
    raw: unknown,
    ancestry?: TaskAncestry,
    parentSignalOrUpdate?: AbortSignal | TaskUpdateCallback,
    onUpdate?: TaskUpdateCallback,
  ): Promise<TaskResponse> {
    const parentSignal = typeof parentSignalOrUpdate === "function" ? undefined : parentSignalOrUpdate;
    const liveUpdate = typeof parentSignalOrUpdate === "function" ? parentSignalOrUpdate : onUpdate;
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

      // Resolve every exact formal root and model/provider/thinking choice before
      // the first durable Agent/job/turn allocation. A malformed or unusable
      // batch therefore cannot partially allocate.
      const protections = await Promise.all(request.items.map((item) => this.resolveFormalProtection(item)));
      const choices = await Promise.all(request.items.map(async (item) => {
        const role = bySelector.get(item.agent)!;
        return await this.options.preflight?.({ item, role, ancestry });
      }));
      const created: CreatedTask[] = [];
      for (let index = 0; index < request.items.length; index += 1) {
        const item = request.items[index]!;
        created.push(await this.createAndSchedule(item, bySelector.get(item.agent)!, ancestry, protections[index], choices[index]));
      }
      return { request, created };
    });

    // Every callback is emitted only after the complete preflight and the
    // durable Agent/job/turn allocation for each item. It is bounded display
    // evidence; callback failures cannot change the authoritative result.
    if (prepared.created.length === 1) this.emitLiveSnapshot(prepared.created[0]!, liveUpdate);
    else this.emitLiveBatch(prepared.created, liveUpdate);

    // The submitting turn's signal owns only the tasks that join its
    // lifecycle: synchronous top-level tasks and every nested task (nested
    // work runs under its own parent Agent's turn signal). Accepted top-level
    // async tasks outlive the submitting turn; only explicit hub cancel,
    // runtime/session shutdown, scheduler close, or their own failure may end
    // them. `ancestry !== undefined` is defensive redundancy while nested
    // items are forced synchronous — nesting always binds the ancestor
    // lifecycle, so it stays in the parent-bound subset explicitly.
    const parentBoundTasks = prepared.created.filter(
      (task) => !task.effectiveAsync || ancestry !== undefined,
    );

    let abortListener: (() => void) | undefined;
    if (parentSignal && parentBoundTasks.length > 0) {
      abortListener = () => {
        for (const task of parentBoundTasks) void this.cancel(task.jobId);
      };
      parentSignal.addEventListener("abort", abortListener, { once: true });
      if (parentSignal.aborted) abortListener();
      void Promise.allSettled(parentBoundTasks.map((task) => task.handle.result)).then(() => {
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
          name: task.item.name ?? task.role.name,
          requestedModel: task.item.model ?? null,
          effectiveModel: task.modelChoice?.canonical ?? null,
          modelLayer: task.modelChoice?.layer ?? null,
          thinking: task.modelChoice?.thinking ?? null,
          source: task.modelChoice?.source ?? null,
          ...(task.parentResolution?.canonical ? { parentModel: task.parentResolution.canonical } : {}),
          ...(task.parentResolution?.thinking ? { parentThinking: task.parentResolution.thinking } : {}),
          ...(task.parentResolution?.speedTier ? { parentSpeedTier: task.parentResolution.speedTier } : {}),
          ...(task.parentResolution?.source ? { parentSource: task.parentResolution.source } : {}),
          async: true,
          effectiveMode: "async",
          effectiveModeReason: task.reason as "default-async" | "requested-async",
          lifecycle: {
            agent: state.agents[task.agentId]?.state ?? "queued",
            job: state.jobs[task.jobId]?.state ?? "queued",
            turn: state.turns[task.turnId]?.state ?? "queued",
          },
          model: { requested: task.item.model, requestedThinking: task.item.thinking, ...(task.modelChoice ?? {}) },
          ...(task.modelDecision ? { modelDecision: task.modelDecision } : {}),
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

  private liveSnapshot(task: CreatedTask): TaskLiveSnapshot {
    const state = this.options.journal.getState();
    const agent = state.agents[task.agentId] ?? state.releasedAgents[task.agentId];
    const job = state.jobs[task.jobId];
    const turn = state.turns[task.turnId];
    const sources = modelAuditSources(task.modelChoice);
    return {
      status: turn?.state === "running" ? "running" : "allocated",
      name: boundedDisplayText(task.item.name ?? task.role.name, 160),
      selector: boundedDisplayText(task.role.selector, 160),
      requestedModel: task.item.model === undefined ? null : boundedDisplayText(task.item.model, 160),
      ...(task.item.model === undefined ? {} : { requested: boundedDisplayText(task.item.model, 160) }),
      ...(task.modelChoice?.canonical ? {
        effectiveModel: boundedDisplayText(task.modelChoice.canonical, 160),
        effective: boundedDisplayText(task.modelChoice.canonical, 160),
      } : {}),
      ...(task.modelChoice?.provider ? { provider: boundedDisplayText(task.modelChoice.provider, 96) } : {}),
      ...(task.modelChoice?.model ? { model: boundedDisplayText(task.modelChoice.model, 128) } : {}),
      ...(task.modelChoice?.layer ? { layer: boundedDisplayText(task.modelChoice.layer, 64) } : {}),
      ...(task.modelChoice?.thinking ? { thinking: boundedDisplayText(task.modelChoice.thinking, 32) } : {}),
      ...(task.modelChoice?.speedTier ? { speedTier: boundedDisplayText(task.modelChoice.speedTier, 32) } : {}),
      ...(sources.modelSource === undefined ? {} : { modelSource: boundedDisplayText(sources.modelSource, 64) }),
      ...(sources.thinkingSource === undefined ? {} : { thinkingSource: boundedDisplayText(sources.thinkingSource, 64) }),
      ...(sources.source === undefined ? {} : { source: boundedDisplayText(sources.source, 64) }),
      ...(task.parentResolution?.canonical ? { parentModel: boundedDisplayText(task.parentResolution.canonical, 160) } : {}),
      ...(task.parentResolution?.thinking ? { parentThinking: boundedDisplayText(task.parentResolution.thinking, 32) } : {}),
      ...(task.parentResolution?.speedTier ? { parentSpeedTier: boundedDisplayText(task.parentResolution.speedTier, 32) } : {}),
      ...(task.parentResolution?.source ? { parentSource: boundedDisplayText(task.parentResolution.source, 64) } : {}),
      agentId: task.agentId,
      jobId: task.jobId,
      turnId: task.turnId,
      lifecycle: {
        agent: agent?.state ?? "queued",
        job: job?.state ?? "queued",
        turn: turn?.state ?? "queued",
      },
    };
  }

  private emitLiveSnapshot(task: CreatedTask, onUpdate: TaskUpdateCallback | undefined): void {
    if (!onUpdate) return;
    try {
      const snapshot = this.liveSnapshot(task);
      onUpdate({
        content: [{ type: "text", text: JSON.stringify(snapshot) }],
        details: snapshot,
      });
    } catch {
      // UI live evidence is explicitly non-authoritative and must never turn
      // a successfully allocated task into a failed execution.
    }
  }

  private emitLiveBatch(tasks: CreatedTask[], onUpdate: TaskUpdateCallback | undefined): void {
    if (!onUpdate) return;
    try {
      const results = tasks.map((task) => this.liveSnapshot(task));
      const details: TaskLiveBatchSnapshot = {
        status: results.some((result) => result.status === "running") ? "running" : "allocated",
        batch: true,
        results,
      };
      onUpdate({
        content: [{ type: "text", text: JSON.stringify(details) }],
        details,
      });
    } catch {
      // UI live evidence is explicitly non-authoritative and must never turn
      // a successfully allocated batch into a failed execution.
    }
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
    preflight?: ResolvedModelChoice | TaskPreflightResult,
  ): Promise<CreatedTask> {
    const preflightResult: TaskPreflightResult = preflight && typeof preflight === "object" && "choice" in preflight
      ? preflight as TaskPreflightResult
      : { choice: preflight as ResolvedModelChoice | undefined };
    const modelChoice = preflightResult.choice;
    const parentResolution = preflightResult.parentResolution ?? ancestry?.parentResolution;
    const currentTurnModelAuthority = preflightResult.currentTurnModelAuthority
      ?? ancestry?.currentTurnModelAuthority
      ?? ancestry?.currentTurnAuthority
      ?? ancestry?.authority;
    const modelDecision = preflightResult.modelDecision;
    const modelDecisionMetadata = modelDecision ? {
      overrideDecision: modelDecision.overrideDecision,
      ...(modelDecision.reason === undefined ? {} : { modelRequestReason: modelDecision.reason }),
    } : {};
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
    const modelSources = modelAuditSources(modelChoice);
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
        requestedModel: item.model,
        effectiveModel: modelChoice?.canonical,
        provider: modelChoice?.provider,
        model: modelChoice?.model,
        modelLayer: modelChoice?.layer,
        thinking: modelChoice?.thinking,
        speedTier: modelChoice?.speedTier,
        ...modelSources,
        parentResolutionPresent: parentResolution !== undefined,
        ...(parentResolution?.canonical ? { parentModel: parentResolution.canonical } : {}),
        ...(parentResolution?.thinking ? { parentThinking: parentResolution.thinking } : {}),
        ...(parentResolution?.speedTier ? { parentSpeedTier: parentResolution.speedTier } : {}),
        ...(parentResolution?.source ? { parentSource: parentResolution.source } : {}),
        ...formalMetadata,
      },
    };
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
    const job: JobRecord = {
      id: jobId,
      agentId,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      metadata: {
        requestedModel: item.model,
        requestedThinking: item.thinking,
        effectiveModel: modelChoice?.canonical,
        modelLayer: modelChoice?.layer,
        thinking: modelChoice?.thinking,
        speedTier: modelChoice?.speedTier,
        ...modelSources,
        parentResolutionPresent: parentResolution !== undefined,
        ...(parentResolution?.canonical ? { parentModel: parentResolution.canonical } : {}),
        ...(parentResolution?.thinking ? { parentThinking: parentResolution.thinking } : {}),
        ...(parentResolution?.speedTier ? { parentSpeedTier: parentResolution.speedTier } : {}),
        ...(parentResolution?.source ? { parentSource: parentResolution.source } : {}),
        requestedAsync: item.async,
        effectiveMode: effectiveAsync ? "async" : "sync",
        effectiveModeReason: reason,
        workspace: item.workspace,
        writeScope: item.writeScope,
        ...modelDecisionMetadata,
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
        taskSummary: boundedDisplayText(item.task, 160),
        requestedModel: item.model,
        requestedThinking: item.thinking,
        profileHash: role.profileHash,
        sourceHash: role.sourceHash,
        maxRuntimeMs: DEFAULT_AGENT_MAX_RUNTIME_MS,
        softRequestBudget: DEFAULT_AGENT_SOFT_REQUEST_BUDGET,
        effectiveModel: modelChoice?.canonical,
        provider: modelChoice?.provider,
        model: modelChoice?.model,
        modelLayer: modelChoice?.layer,
        thinking: modelChoice?.thinking,
        speedTier: modelChoice?.speedTier,
        ...modelSources,
        parentResolutionPresent: parentResolution !== undefined,
        ...(parentResolution?.canonical ? { parentModel: parentResolution.canonical } : {}),
        ...(parentResolution?.thinking ? { parentThinking: parentResolution.thinking } : {}),
        ...(parentResolution?.speedTier ? { parentSpeedTier: parentResolution.speedTier } : {}),
        ...(parentResolution?.source ? { parentSource: parentResolution.source } : {}),
        scheduledAt: now,
        effectiveMode: effectiveAsync ? "async" : "sync",
        effectiveModeReason: reason,
        outputRef: `agent://${agentId}`,
        historyRef: `history://${agentId}`,
        ...modelDecisionMetadata,
        ...formalMetadata,
      },
    };
    await this.options.journal.append({ kind: "agent.created", agentId, payload: { record: agent } });
    await this.options.journal.append({ kind: "job.created", agentId, jobId, payload: { record: job } });
    await this.options.journal.append({ kind: "turn.created", agentId, jobId, turnId, payload: { record: turn } });

    const run = (context: ScheduledExecutionContext) => this.runLifecycle({ item, role, agentId, jobId, turnId, depth, modelChoice, parentResolution, currentTurnModelAuthority, modelDecision, effectiveAsync, reason, formalProtection, context });
    const onCancelBeforeStart = () => this.cancelBeforeStart(agentId, jobId, turnId, role, item, effectiveAsync, reason);
    const handle = ancestry
      ? this.scheduler.runNested(jobId, ancestry.inheritedPermit, run)
      : this.scheduler.enqueue(jobId, run, onCancelBeforeStart);
    this.handles.set(jobId, handle);
    const baseSettlement = handle.result.catch(async (error) => {
      if (error instanceof ScheduledTaskCancelledError && error.beforeStart) {
        return this.cancelledSettlement(agentId, jobId, turnId, role, item, modelChoice, parentResolution, effectiveAsync, reason, error.message);
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
    return { item, role, agentId, jobId, turnId, depth, modelChoice, parentResolution, currentTurnModelAuthority, modelDecision, effectiveAsync, reason, formalProtection, handle: normalizedHandle };
  }

  private async begin(agentId: string, jobId: string, turnId: string): Promise<void> {
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "turn.audit", agentId, jobId, turnId, payload: { startedAt: this.clock().toISOString() } });
  }

  private async runLifecycle(args: Omit<CreatedTask, "handle"> & { context: ScheduledExecutionContext }): Promise<NormalizedTaskSettlement> {
    const { agentId, jobId, turnId, role, item, modelChoice, parentResolution, currentTurnModelAuthority, modelDecision, effectiveAsync, reason, formalProtection, context, depth } = args;
    await this.begin(agentId, jobId, turnId);
    let status: NormalizedTaskSettlement["status"] = "completed";
    let output: TaskExecutionOutput;
    try {
      // The executor boundary is the first observable Agent activity. Record it
      // before awaiting the turn so interval evidence never reports completion
      // itself as the first activity.
      await this.options.journal.append({ kind: "turn.audit", agentId, jobId, turnId, payload: { firstActivityAt: this.clock().toISOString() } });
      output = await this.options.execute({ agentId, jobId, turnId, item, role, modelChoice, depth, context, formalProtection, parentResolution, currentTurnModelAuthority, modelDecision });
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

    await this.options.journal.append({ kind: "turn.audit", agentId, jobId, turnId, payload: { completedAt: this.clock().toISOString(), outcome: status } });
    let result = this.settlement(status, agentId, jobId, turnId, role, item, modelChoice, parentResolution, effectiveAsync, reason, output, formalResultStatus);
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
      result = this.settlement(status, agentId, jobId, turnId, role, item, modelChoice, parentResolution, effectiveAsync, reason, output, formalResultStatus);
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
    await this.options.journal.append({ kind: "turn.audit", agentId, jobId, turnId, payload: { completedAt: this.clock().toISOString(), outcome: "aborted-before-start" } });
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "aborted", outcome: "cancelled-before-start" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "aborted", error: "cancelled-before-start" } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "aborted" } });
    void role;
    void item;
    void effectiveAsync;
    void reason;
  }

  private cancelledSettlement(agentId: string, jobId: string, turnId: string, role: RoleProfile, item: NormalizedTaskItem, modelChoice: ResolvedModelChoice | undefined, parentResolution: ResolvedModelChoice | undefined, effectiveAsync: boolean, reason: CreatedTask["reason"], error: string): NormalizedTaskSettlement {
    return this.settlement("aborted", agentId, jobId, turnId, role, item, modelChoice, parentResolution, effectiveAsync, reason, { output: "", error });
  }

  private settlement(
    status: NormalizedTaskSettlement["status"],
    agentId: string,
    jobId: string,
    turnId: string,
    role: RoleProfile,
    item: NormalizedTaskItem,
    modelChoice: ResolvedModelChoice | undefined,
    parentResolution: ResolvedModelChoice | undefined,
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
      name: item.name ?? role.name,
      requestedModel: item.model ?? null,
      effectiveModel: modelChoice?.canonical ?? (execution.model?.provider && execution.model.model ? `${execution.model.provider}/${execution.model.model}` : null),
      modelLayer: modelChoice?.layer ?? execution.model?.layer ?? null,
      thinking: modelChoice?.thinking ?? execution.model?.thinking ?? null,
      source: modelChoice?.source ?? null,
      ...(parentResolution?.canonical ? { parentModel: parentResolution.canonical } : {}),
      ...(parentResolution?.thinking ? { parentThinking: parentResolution.thinking } : {}),
      ...(parentResolution?.speedTier ? { parentSpeedTier: parentResolution.speedTier } : {}),
      ...(parentResolution?.source ? { parentSource: parentResolution.source } : {}),
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
      model: {
        requested: item.model,
        requestedThinking: item.thinking,
        ...(modelChoice ?? (execution.model ? {
          provider: execution.model.provider,
          model: execution.model.model,
          thinking: execution.model.thinking,
          speedTier: execution.model.speedTier,
          layer: execution.model.layer,
          modelSource: execution.model.modelSource,
          thinkingSource: execution.model.thinkingSource,
        } : {})),
      },
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
