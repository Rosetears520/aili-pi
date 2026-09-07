import type { RoleProfile } from "../roles.js";
import type { ModeDef } from "pi-permission-modes/src/schema.ts";
import { loadRoleProfiles } from "../roles.js";
import {
  BACKEND_DRIVERS,
  DEFAULT_EXECUTION_BACKEND,
  resolveAgentBackend,
  resolveAgentDriver,
  type AgentDriverKind,
  type ExecutionBackendKind,
} from "./backends/types.js";
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
  validateFormalTaskRequest,
  validateSubRequest,
  type FormalContinuationAudit,
  type NormalizedTaskItem,
} from "./sub-schema.js";
import type { CurrentTurnModelAuthority, ExternalCliId, ModelChoiceSource, ResolvedModelChoice, SubagentModelDecision, ThinkingSource } from "./model-selection.js";
import type { ExternalCliLaunchPlan, ExternalCliProbe } from "./external-cli.js";
import { boundedDisplayText } from "./sub-renderer.js";

export interface TaskExecutionOutput {
  status?: "completed" | "failed";
  result?: "completed" | "partial";
  output: string;
  error?: string;
  evidence?: unknown;
  model?: { provider?: string; model?: string; thinking?: string; speedTier?: string; layer?: string; modelSource?: string; thinkingSource?: string };
  profile?: { profileHash?: string; sourceHash?: string; version?: number };
  workspace?: Record<string, unknown>;
  /** Execution provenance filled by the executing backend. */
  backend?: ExecutionBackendKind;
  driver?: AgentDriverKind;
  runId?: string;
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

/** Structured failure codes for the model-facing sub surface. */
export type SubRequestErrorCode =
  | "SUB_NOT_FOUND"
  | "SUB_BUSY"
  | "SUB_TERMINAL"
  | "SUB_SELECTOR_MISMATCH"
  | "SUB_OWNERSHIP"
  | "SUB_FORMAL_CONTINUATION_REFUSED"
  | "SUB_BACKGROUND_NESTED"
  | "SUB_MODEL_UNAVAILABLE"
  | "SUB_MODEL_AMBIGUOUS"
  | "SUB_MODEL_DENIED"
  | "SUB_THINKING_UNSUPPORTED"
  | "SUB_CLI_DENIED"
  | "SUB_CLI_MANAGED_CONTINUATION"
  | "SUB_CLI_UNAVAILABLE"
  | "SUB_CLI_PROBE_FAILED"
  | "SUB_CLI_AMBIGUOUS"
  | "SUB_CLI_CONTINUATION"
  | "SUB_SELECTION_DENIED"
  | "SUB_EMPTY_RESULT";

export class SubRequestError extends Error {
  constructor(readonly code: SubRequestErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "SubRequestError";
  }
}

export interface PermissionModeSnapshot {
  name: string;
  mode: ModeDef;
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
  /** Frozen direct-parent identity for this turn. */
  parentResolution?: ResolvedModelChoice;
  /** Frozen current-turn authority captured before this task was allocated. */
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  /** Structured model/thinking request decision recorded at dispatch. */
  modelDecision?: SubagentModelDecision;
  /** True when this turn reopens an existing Child Session instead of creating one. */
  continuation?: boolean;
  /** Backend resolved at allocation (new agents) or frozen on the Agent
   *  record (continuations). Absent means managed for legacy paths. */
  backend?: ExecutionBackendKind;
  /** AILI remains a Pi Driver; this is a separately audited one-turn nested executable. */
  nestedCli?: ExternalCliId;
  /** Bounded deterministic version/help evidence, never credentials or argv. */
  cliProbe?: ExternalCliProbe;
  /** Prevalidated native external-CLI launch plan; never model-supplied. */
  launchPlan?: ExternalCliLaunchPlan;
  /** The exact Parent permission-mode snapshot used for this Herdr run. */
  permissionModeSnapshot?: PermissionModeSnapshot;
}

export interface OutputTruncation {
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
  originalLines: number;
  returnedLines: number;
  limits: { bytes: 500_000; lines: 5_000 };
}

export type TaskEffectiveModeReason =
  | "default-async"
  | "default-sync"
  | "requested-async"
  | "requested-sync"
  | "role-blocking"
  | "nested-sync";

export interface NormalizedTaskSettlement {
  status: "completed" | "failed" | "aborted";
  result?: "completed" | "partial";
  taskId: string;
  agentId: string;
  jobId: string;
  turnId: string;
  selector: string;
  backend: ExecutionBackendKind;
  driver: AgentDriverKind;
  runId?: string;
  async: boolean;
  effectiveMode: "sync" | "async";
  effectiveModeReason: TaskEffectiveModeReason;
  output: string;
  error?: string;
  evidence?: unknown;
  outputRef: string;
  historyRef: string;
  truncation: OutputTruncation;
  lifecycle: { agent: "idle" | "aborted"; job: "completed" | "failed" | "aborted"; turn: "completed" | "failed" | "aborted" };
  name?: string;
  selectionScope?: string;
  executionBoundary?: "trusted-local-vendor";
  executableBinding?: "Unverified";
  externalCli?: ExternalCliId;
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
  /** Structured model/thinking request decision recorded at dispatch. */
  modelDecision?: SubagentModelDecision;
}

export interface TaskAcceptedResult {
  status: "accepted";
  taskId: string;
  agentId: string;
  jobId: string;
  turnId: string;
  selector: string;
  backend: ExecutionBackendKind;
  driver: AgentDriverKind;
  async: true;
  effectiveMode: "async";
  effectiveModeReason: "default-async" | "default-sync" | "requested-async" | "requested-sync";
  lifecycle: { agent: string; job: string; turn: string };
  name: string;
  selectionScope?: string;
  executionBoundary?: "trusted-local-vendor";
  executableBinding?: "Unverified";
  externalCli?: ExternalCliId;
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
  backend: ExecutionBackendKind;
  driver: AgentDriverKind;
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
  selectionScope?: string;
  executionBoundary?: "trusted-local-vendor";
  executableBinding?: "Unverified";
  externalCli?: ExternalCliId;
  parentModel?: string;
  parentThinking?: string;
  parentSpeedTier?: string;
  parentSource?: string;
  taskId: string;
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
  /** Legacy structural authority compatibility; public candidates use the
   * runtime-owned selection questionnaire instead. */
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  /** Compatibility aliases for callers using shorter authority vocabulary. */
  currentTurnAuthority?: CurrentTurnModelAuthority;
  authority?: CurrentTurnModelAuthority;
  configuredMaxDepth?: number;
  formalChangeId?: string;
}

export interface TaskPreflightInput {
  item: NormalizedTaskItem;
  /** Submission signal used to invalidate a pending candidate before allocation. */
  signal?: AbortSignal;
  role: RoleProfile;
  ancestry?: TaskAncestry;
  /** Present when this submission continues an existing Child Session. */
  continuation?: { agentId: string };
}

export interface TaskPreflightResult {
  choice?: ResolvedModelChoice;
  parentResolution?: ResolvedModelChoice;
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  /** Structured model/thinking request decision recorded at dispatch. */
  modelDecision?: SubagentModelDecision;
  /** Atomically derived with authority/loadout before durable allocation. */
  backend?: ExecutionBackendKind;
  nestedCli?: ExternalCliId;
  cliProbe?: ExternalCliProbe;
  launchPlan?: ExternalCliLaunchPlan;
  permissionModeSnapshot?: PermissionModeSnapshot;
}

export interface SubCoordinatorOptions {
  journal: CoordinatorJournal;
  repositoryRoot?: string;
  scheduler?: FifoTurnScheduler;
  loadProfiles?: () => Promise<RoleProfile[]>;
  execute: (input: TaskExecutorInput) => Promise<TaskExecutionOutput>;
  /** Resolves the execution backend for NEW agents from user-owned settings.
   *  Must fail explicitly (throw) when the resolved backend is unavailable;
   *  it never falls back. Continuations ignore this and use the frozen
   *  backend on the Agent record. */
  resolveBackend?: () => ExecutionBackendKind | undefined | Promise<ExecutionBackendKind | undefined>;
  /** Per-item capability gate, run for every item during the all-or-none
   *  preflight (and again for continuations): throwing fails the whole
   *  submission before any durable allocation or surface creation. */
  checkBackendSupport?: (backend: ExecutionBackendKind, item: NormalizedTaskItem, role: RoleProfile) => void | Promise<void>;
  preflight?: (input: TaskPreflightInput) => ResolvedModelChoice | TaskPreflightResult | undefined | Promise<ResolvedModelChoice | TaskPreflightResult | undefined>;
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
  backend: ExecutionBackendKind;
  driver: AgentDriverKind;
  modelChoice?: ResolvedModelChoice;
  parentResolution?: ResolvedModelChoice;
  currentTurnModelAuthority?: CurrentTurnModelAuthority;
  modelDecision?: SubagentModelDecision;
  nestedCli?: ExternalCliId;
  cliProbe?: ExternalCliProbe;
  launchPlan?: ExternalCliLaunchPlan;
  permissionModeSnapshot?: PermissionModeSnapshot;
  effectiveAsync: boolean;
  reason: TaskEffectiveModeReason;
  continuation: boolean;
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
  void repositoryRoot;
  void continuationAudit;
  void writeScope;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(changeId)) {
    throw new Error("formalContext.changeId must be one safe OpenSpec change identifier");
  }
  return {
    changeId,
    protectedPaths: [
      `openspec/changes/${changeId}/formal-task-board.md`,
      `openspec/changes/${changeId}/progress.txt`,
    ],
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

/**
 * The one coordination boundary for persistent Child Agents.
 *
 * `submit` is the model-facing `sub` tool: without task_id it creates a Child
 * Session and immediately runs one turn; with task_id it reopens the existing
 * Child Session and runs the next turn on it. `submitTrusted` is the
 * trusted-internal formal dispatch entry used by the formal_task adapter.
 */
export class SubCoordinator {
  readonly scheduler: FifoTurnScheduler;
  private readonly loadProfiles: () => Promise<RoleProfile[]>;
  private readonly clock: () => Date;
  private readonly handles = new Map<string, ScheduledHandle<NormalizedTaskSettlement>>();
  private readonly settlements = new Map<string, Promise<NormalizedTaskSettlement>>();
  private readonly fullOutputs = new Map<string, string>();
  private submissionTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: SubCoordinatorOptions) {
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
    return await this.submitValidated(raw, "public", ancestry, parentSignalOrUpdate, onUpdate);
  }

  /** Trusted-internal formal dispatch (formal_task adapter, nested formal
   *  children, the ROSE planner): accepts the formal identity fields the
   *  public sub schema never exposes to the model. */
  async submitTrusted(
    raw: unknown,
    ancestry?: TaskAncestry,
    parentSignalOrUpdate?: AbortSignal | TaskUpdateCallback,
    onUpdate?: TaskUpdateCallback,
  ): Promise<TaskResponse> {
    return await this.submitValidated(raw, "formal", ancestry, parentSignalOrUpdate, onUpdate);
  }

  private async submitValidated(
    raw: unknown,
    mode: "public" | "formal",
    ancestry: TaskAncestry | undefined,
    parentSignalOrUpdate: AbortSignal | TaskUpdateCallback | undefined,
    onUpdate: TaskUpdateCallback | undefined,
  ): Promise<TaskResponse> {
    const parentSignal = typeof parentSignalOrUpdate === "function" ? undefined : parentSignalOrUpdate;
    const liveUpdate = typeof parentSignalOrUpdate === "function" ? parentSignalOrUpdate : onUpdate;
    await assertNoCredentialMaterial(raw, "sub input");
    const prepared = await this.serializeSubmission(async () => {
      const profiles = await this.loadProfiles();
      const parse = mode === "public" ? validateSubRequest(raw, profiles) : undefined;
      const taskId = parse?.taskId;
      const request = parse
        ? { batch: false, items: [parse.item] }
        : validateFormalTaskRequest(raw, profiles);
      const bySelector = new Map(profiles.map((profile) => [profile.selector, profile]));
      if (ancestry && !this.scheduler.isPermitActive(ancestry.inheritedPermit)) {
        throw new Error("nested sub requires an active inherited ancestor permit");
      }
      if (ancestry && request.items.some((item) => item.async === true)) {
        throw new SubRequestError("SUB_BACKGROUND_NESTED", "nested sub calls are synchronous; background=true is a top-level-only field");
      }
      if (ancestry?.formalChangeId) {
        for (const item of request.items) {
          if (item.formalContext?.changeId !== ancestry.formalChangeId) {
            throw new Error(`nested task under formalContext '${ancestry.formalChangeId}' must explicitly repeat the exact same formalContext.changeId`);
          }
        }
      }

      if (mode === "public" && taskId !== undefined) {
        // Continuation: reuse the existing Child Session identity, resolve this
        // turn's model/thinking from scratch, and run exactly one new turn.
        if (request.items.length !== 1) throw new Error("sub continuation accepts exactly one turn");
        const item = request.items[0]!;
        const agent = this.continuableAgent(taskId!);
        const explicitSelector = Object.prototype.hasOwnProperty.call(raw, "subagent_type");
        if (explicitSelector && item.agent !== agent.selector) {
          throw new SubRequestError("SUB_SELECTOR_MISMATCH", `task_id ${taskId} owns selector '${agent.selector}' but subagent_type '${item.agent}' was requested; create a new task instead of switching roles`);
        }
        if (ancestry ? agent.parentAgentId !== ancestry.parentAgentId : agent.parentAgentId !== undefined) {
          throw new SubRequestError("SUB_OWNERSHIP", `task_id ${taskId} is not owned by this caller`);
        }
        const frozenDriver = resolveAgentDriver(agent);
        const frozenCli = typeof agent.metadata?.nestedCli === "string" ? agent.metadata.nestedCli : undefined;
        if (frozenDriver === "external-cli") {
          if (item.cli === undefined || item.cli !== frozenCli) {
            throw new SubRequestError("SUB_CLI_CONTINUATION", `task_id ${taskId} is frozen to external CLI ${frozenCli ?? "(unknown)"}; repeat the exact cli to continue or create a separate Agent`);
          }
        } else if (item.cli !== undefined) {
          if (resolveAgentBackend(agent) === "managed") {
            throw new SubRequestError("SUB_CLI_MANAGED_CONTINUATION", `task_id ${taskId} has frozen backend managed; create a new Herdr Agent for external CLI use`);
          }
          throw new SubRequestError("SUB_CLI_CONTINUATION", `task_id ${taskId} has frozen driver ${frozenDriver}; changing it to external CLI is not allowed, create a new Agent`);
        }
        const continuedItem: NormalizedTaskItem = { ...item, agent: agent.selector };
        const role = bySelector.get(agent.selector);
        if (!role) throw new Error(`${agent.selector}: role profile is unavailable`);
        // CLI authority/backend/loadout must be derived before backend support
        // checks. A managed identity may never be switched in place to Herdr.
        const preflight = await this.options.preflight?.({ item: continuedItem, role, ancestry, continuation: { agentId: agent.id }, signal: parentSignal });
        const resolved = this.preflightResult(preflight);
        const frozenBackend = resolveAgentBackend(agent);
        if (resolved.backend !== undefined && resolved.backend !== frozenBackend) {
          throw new SubRequestError("SUB_CLI_MANAGED_CONTINUATION", `task_id ${taskId} has frozen backend ${frozenBackend}; create a new Herdr Agent for external CLI use`);
        }
        if (this.options.checkBackendSupport) {
          await this.options.checkBackendSupport(frozenBackend, continuedItem, role);
        }
        const created = await this.continueAndSchedule(continuedItem, role, agent, ancestry, preflight);
        return { request: { batch: false, items: [continuedItem] }, created: [created] };
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

      // Resolve every exact formal root plus authority/backend/loadout before
      // durable allocation. A CLI may derive Herdr only inside this same
      // preallocation; an unauthorized tool argument cannot influence routing.
      const protections = await Promise.all(request.items.map((item) => this.resolveFormalProtection(item)));
      const choices = await Promise.all(request.items.map(async (item) => {
        const role = bySelector.get(item.agent)!;
        return await this.options.preflight?.({ item, role, ancestry, signal: parentSignal });
      }));
      const needsConfiguredBackend = choices.some((choice) => this.preflightResult(choice).backend === undefined);
      const configuredBackend = needsConfiguredBackend ? await this.resolveSubmissionBackend() : DEFAULT_EXECUTION_BACKEND;
      const itemBackends = choices.map((choice) => this.preflightResult(choice).backend ?? configuredBackend);
      if (new Set(itemBackends).size !== 1) throw new Error("one submission cannot mix execution backends");
      const submissionBackend = itemBackends[0]!;
      await Promise.all(request.items.map(async (item, index) => {
        await this.options.checkBackendSupport?.(submissionBackend, item, bySelector.get(item.agent)!);
        const nestedCli = this.preflightResult(choices[index]!).nestedCli;
        if (nestedCli && submissionBackend !== "herdr") {
          throw new SubRequestError("SUB_CLI_DENIED", `external CLI ${nestedCli} requires the Herdr Pi runner`);
        }
      }));
      const created: CreatedTask[] = [];
      for (let index = 0; index < request.items.length; index += 1) {
        const item = request.items[index]!;
        created.push(await this.createAndSchedule(item, bySelector.get(item.agent)!, ancestry, submissionBackend, protections[index], choices[index], mode !== "public"));
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
    // background tasks outlive the submitting turn; only explicit cancel,
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
          taskId: task.agentId,
          agentId: task.agentId,
          jobId: task.jobId,
          turnId: task.turnId,
          selector: task.role.selector,
          backend: task.backend,
          driver: task.driver,
          name: task.item.name ?? task.role.name,
          ...(task.item.selectionScope === undefined ? {} : { selectionScope: task.item.selectionScope }),
          ...(task.nestedCli === undefined ? {} : { externalCli: task.nestedCli, executionBoundary: "trusted-local-vendor" as const, executableBinding: "Unverified" as const }),
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
          effectiveModeReason: task.reason as TaskAcceptedResult["effectiveModeReason"],
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
      const settled = await task.handle.result;
      return task.modelDecision ? { ...settled, modelDecision: task.modelDecision } : settled;
    }));
    return { batch: prepared.request.batch, results };
  }

  /** The one continuation gate: the Child Session identity must exist, be
   *  settled, ordinary, and owned by the calling context. */
  private continuableAgent(taskId: string): AgentRecord {
    const state = this.options.journal.getState();
    const agent = state.agents[taskId];
    if (!agent) {
      if (state.releasedAgents[taskId]) throw new SubRequestError("SUB_TERMINAL", `task_id ${taskId} was released and cannot be continued`);
      throw new SubRequestError("SUB_NOT_FOUND", `task_id ${taskId} is unknown in this parent`);
    }
    if (agent.state === "queued" || agent.state === "running") {
      throw new SubRequestError("SUB_BUSY", `task_id ${taskId} is still ${agent.state}; wait for the current turn to settle before continuing`);
    }
    if (agent.state === "aborted") {
      throw new SubRequestError("SUB_TERMINAL", `task_id ${taskId} is terminal aborted and cannot be continued`);
    }
    if (agent.metadata?.formalContinuationIdentity !== undefined || agent.metadata?.formalProtection !== undefined) {
      throw new SubRequestError("SUB_FORMAL_CONTINUATION_REFUSED", `task_id ${taskId} is a formal Agent; formal continuation belongs to the formal_task lifecycle and requires a new bounded job/Agent`);
    }
    return agent;
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
      backend: task.backend,
      driver: task.driver,
      requestedModel: task.item.model === undefined ? null : boundedDisplayText(task.item.model, 160),
      ...(task.item.selectionScope === undefined ? {} : { selectionScope: boundedDisplayText(task.item.selectionScope, 200) }),
      ...(task.nestedCli === undefined ? {} : { externalCli: task.nestedCli, executionBoundary: "trusted-local-vendor" as const, executableBinding: "Unverified" as const }),
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
      taskId: task.agentId,
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

  async settleRecovered(input: { agentId: string; jobId: string; turnId: string; runId: string; status: "completed" | "failed"; output: string; error?: string; evidence?: unknown }): Promise<NormalizedTaskSettlement> {
    const state = this.options.journal.getState();
    const agent = state.agents[input.agentId];
    const job = state.jobs[input.jobId];
    const turn = state.turns[input.turnId];
    if (!agent || !job || !turn || agent.currentJobId !== input.jobId || agent.currentTurnId !== input.turnId) throw new Error("recovered settlement identity is not current");
    if (agent.state !== "running" || job.state !== "running" || turn.state !== "running") throw new Error("recovered settlement requires exact running state");
    const profiles = await this.loadProfiles();
    const role = profiles.find((candidate) => candidate.selector === agent.selector);
    if (!role) throw new Error(`recovered settlement role is unavailable: ${agent.selector}`);
    const effectiveAsync = job.metadata?.effectiveMode === "async" || job.metadata?.requestedAsync === true;
    const item: NormalizedTaskItem = { task: String(turn.metadata?.taskSummary ?? "Recovered Herdr turn"), agent: role.selector, name: agent.name, async: effectiveAsync, workspace: "auto", writeScope: { paths: [], resources: [] } };
    const execution: TaskExecutionOutput = { output: input.output, ...(input.error ? { error: input.error } : {}), evidence: input.evidence, backend: "herdr", driver: "pi-cli", runId: input.runId, status: input.status };
    const status = input.status === "completed" && input.output.trim() ? "completed" : "failed";
    let result = this.settlement(status, input.agentId, input.jobId, input.turnId, role, item, undefined, undefined, effectiveAsync, effectiveAsync ? "requested-async" : "default-sync", "herdr", "pi-cli", execution);
    try {
      await this.options.onSettled?.(result, input.output);
      if (effectiveAsync) await this.options.onAsyncSettled?.(result, input.output);
    } catch (error) {
      result = this.settlement("failed", input.agentId, input.jobId, input.turnId, role, item, undefined, undefined, effectiveAsync, effectiveAsync ? "requested-async" : "default-sync", "herdr", "pi-cli", { output: "", error: `recovered output persistence failed: ${error instanceof Error ? error.message : String(error)}`, runId: input.runId });
    }
    if (result.status === "completed") await this.finishCompleted(input.agentId, input.jobId, input.turnId, "completed");
    else await this.finishFailed(input.agentId, input.jobId, input.turnId, result.error ?? "recovered Herdr turn failed");
    this.settlements.set(input.jobId, Promise.resolve(result));
    return result;
  }

  async cancel(jobId: string): Promise<"queued" | "running" | "not-found"> {
    return await this.scheduler.cancel(jobId);
  }

  /** User-facing cancel by task_id: cancels the current turn's job when one is active. */
  async cancelTask(taskId: string): Promise<"queued" | "running" | "not-found" | "idle"> {
    const agent = this.options.journal.getState().agents[taskId];
    if (!agent) return "not-found";
    if (agent.currentJobId && (agent.state === "queued" || agent.state === "running")) {
      return await this.scheduler.cancel(agent.currentJobId);
    }
    return "idle";
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

  private preflightResult(preflight: ResolvedModelChoice | TaskPreflightResult | undefined): TaskPreflightResult {
    return preflight && typeof preflight === "object" && (
      "choice" in preflight || "backend" in preflight || "nestedCli" in preflight || "modelDecision" in preflight || "currentTurnModelAuthority" in preflight || "cliProbe" in preflight || "launchPlan" in preflight || "permissionModeSnapshot" in preflight
    )
      ? preflight as TaskPreflightResult
      : { choice: preflight as ResolvedModelChoice | undefined };
  }

  private async resolveSubmissionBackend(): Promise<ExecutionBackendKind> {
    const resolved = await this.options.resolveBackend?.();
    return resolved ?? DEFAULT_EXECUTION_BACKEND;
  }

  private async createAndSchedule(
    item: NormalizedTaskItem,
    role: RoleProfile,
    ancestry: TaskAncestry | undefined,
    backend: ExecutionBackendKind,
    formalProtection: FormalTaskProtection | undefined,
    preflight: ResolvedModelChoice | TaskPreflightResult | undefined,
    defaultAsync: boolean,
  ): Promise<CreatedTask> {
    const preflightResolved = this.preflightResult(preflight);
    const modelChoice = preflightResolved.choice;
    const nestedCli = preflightResolved.nestedCli;
    const cliProbe = preflightResolved.cliProbe;
    const launchPlan = preflightResolved.launchPlan;
    const permissionModeSnapshot = preflightResolved.permissionModeSnapshot;
    if (preflightResolved.backend !== undefined && preflightResolved.backend !== backend) {
      throw new Error("preallocated backend differs from the submission backend");
    }
    const parentResolution = preflightResolved.parentResolution ?? ancestry?.parentResolution;
    const currentTurnModelAuthority = preflightResolved.currentTurnModelAuthority
      ?? ancestry?.currentTurnModelAuthority
      ?? ancestry?.currentTurnAuthority
      ?? ancestry?.authority;
    const modelDecision = preflightResolved.modelDecision;
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
    const allocationMetadata = { ...formalMetadata, ...(nestedCli === undefined ? {} : { nestedCli }) };
    const modelSources = modelAuditSources(modelChoice);
    const agent: AgentRecord = {
      id: agentId,
      name: item.name ?? role.name,
      selector: role.selector,
      state: "queued",
      backend,
      driver: nestedCli ? "external-cli" : BACKEND_DRIVERS[backend],
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
        ...(nestedCli === undefined ? {} : { nestedCli }),
        ...formalMetadata,
      },
    };
    const effectiveAsync = ancestry ? false : role.blocking ? false : item.async ?? defaultAsync;
    const reason: TaskEffectiveModeReason = ancestry
      ? "nested-sync"
      : role.blocking
        ? "role-blocking"
        : item.async === undefined
          ? (defaultAsync ? "default-async" : "default-sync")
          : item.async
            ? "requested-async"
            : "requested-sync";
    const job = this.jobRecord(jobId, agentId, item, role, modelChoice, modelSources, parentResolution, effectiveAsync, reason, modelDecisionMetadata, allocationMetadata);
    const turn = this.turnRecord(turnId, agentId, jobId, item, role, modelChoice, modelSources, parentResolution, effectiveAsync, reason, modelDecisionMetadata, allocationMetadata);
    await this.options.journal.append({ kind: "agent.created", agentId, payload: { record: agent } });
    await this.options.journal.append({ kind: "job.created", agentId, jobId, payload: { record: job } });
    await this.options.journal.append({ kind: "turn.created", agentId, jobId, turnId, payload: { record: turn } });
    return await this.attachHandle({
      item, role, agentId, jobId, turnId, depth, backend, driver: nestedCli ? "external-cli" : BACKEND_DRIVERS[backend], modelChoice, parentResolution, currentTurnModelAuthority, modelDecision, nestedCli, cliProbe, launchPlan, permissionModeSnapshot,
      effectiveAsync, reason, continuation: false, formalProtection,
    }, ancestry);
  }

  /** Allocate one new turn on an existing settled Child Session identity. */
  private async continueAndSchedule(
    item: NormalizedTaskItem,
    role: RoleProfile,
    agent: AgentRecord,
    ancestry: TaskAncestry | undefined,
    preflight: ResolvedModelChoice | TaskPreflightResult | undefined,
  ): Promise<CreatedTask> {
    const preflightResolved = this.preflightResult(preflight);
    const modelChoice = preflightResolved.choice;
    const nestedCli = preflightResolved.nestedCli;
    const cliProbe = preflightResolved.cliProbe;
    const launchPlan = preflightResolved.launchPlan;
    const permissionModeSnapshot = preflightResolved.permissionModeSnapshot;
    const parentResolution = preflightResolved.parentResolution ?? ancestry?.parentResolution;
    const currentTurnModelAuthority = preflightResolved.currentTurnModelAuthority
      ?? ancestry?.currentTurnModelAuthority
      ?? ancestry?.currentTurnAuthority
      ?? ancestry?.authority;
    const modelDecision = preflightResolved.modelDecision;
    const modelDecisionMetadata = modelDecision ? {
      overrideDecision: modelDecision.overrideDecision,
      ...(modelDecision.reason === undefined ? {} : { modelRequestReason: modelDecision.reason }),
    } : {};
    const before = this.options.journal.getState();
    const agentId = agent.id;
    const jobId = nextNumericId("job", Object.keys(before.jobs));
    const turnId = nextNumericId("turn", Object.keys(before.turns));
    const depth = typeof agent.metadata?.depth === "number" ? agent.metadata.depth : 0;
    // Frozen at creation: a continuation keeps the Agent's original backend
    // even when the user has since switched the default for new agents.
    const backend = resolveAgentBackend(agent);
    if (preflightResolved.backend !== undefined && preflightResolved.backend !== backend) {
      throw new SubRequestError("SUB_CLI_MANAGED_CONTINUATION", `${agentId} has frozen backend ${backend}; create a new Herdr Agent for external CLI use`);
    }
    const driver = nestedCli ? "external-cli" : (backend === "herdr" ? "pi-cli" : resolveAgentDriver(agent));
    const modelSources = modelAuditSources(modelChoice);
    // The previous turn's model choice never leaks into this turn: only the
    // frozen direct-parent snapshot is carried, and it is re-resolved above.
    const effectiveAsync = ancestry ? false : item.async === true;
    const reason: TaskEffectiveModeReason = ancestry
      ? "nested-sync"
      : item.async === true ? "requested-async" : "default-sync";
    const continuationMetadata = {
      turnSource: "sub.continuation",
      continuationOfTaskId: agentId,
      ...(nestedCli === undefined ? {} : { nestedCli }),
    };
    const job = this.jobRecord(jobId, agentId, item, role, modelChoice, modelSources, parentResolution, effectiveAsync, reason, modelDecisionMetadata, continuationMetadata);
    const turn = this.turnRecord(turnId, agentId, jobId, item, role, modelChoice, modelSources, parentResolution, effectiveAsync, reason, modelDecisionMetadata, continuationMetadata);
    await this.options.journal.append({ kind: "job.created", agentId, jobId, payload: { record: job } });
    await this.options.journal.append({ kind: "turn.created", agentId, jobId, turnId, payload: { record: turn } });
    return await this.attachHandle({
      item, role, agentId, jobId, turnId, depth, backend, driver, modelChoice, parentResolution, currentTurnModelAuthority, modelDecision, nestedCli, cliProbe, launchPlan, permissionModeSnapshot,
      effectiveAsync, reason, continuation: true, formalProtection: undefined,
    }, ancestry);
  }

  private jobRecord(
    jobId: string,
    agentId: string,
    item: NormalizedTaskItem,
    role: RoleProfile,
    modelChoice: ResolvedModelChoice | undefined,
    modelSources: ReturnType<typeof modelAuditSources>,
    parentResolution: ResolvedModelChoice | undefined,
    effectiveAsync: boolean,
    reason: TaskEffectiveModeReason,
    modelDecisionMetadata: Record<string, unknown>,
    extraMetadata: Record<string, unknown>,
  ): JobRecord {
    const now = this.clock().toISOString();
    return {
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
        ...extraMetadata,
      },
    };
  }

  private turnRecord(
    turnId: string,
    agentId: string,
    jobId: string,
    item: NormalizedTaskItem,
    role: RoleProfile,
    modelChoice: ResolvedModelChoice | undefined,
    modelSources: ReturnType<typeof modelAuditSources>,
    parentResolution: ResolvedModelChoice | undefined,
    effectiveAsync: boolean,
    reason: TaskEffectiveModeReason,
    modelDecisionMetadata: Record<string, unknown>,
    extraMetadata: Record<string, unknown>,
  ): TurnRecord {
    const now = this.clock().toISOString();
    return {
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
        ...extraMetadata,
      },
    };
  }

  private async attachHandle(
    created: Omit<CreatedTask, "handle">,
    ancestry: TaskAncestry | undefined,
  ): Promise<CreatedTask> {
    const { agentId, jobId, turnId } = created;
    const agentFrom = created.continuation
      ? (this.options.journal.getState().agents[agentId]?.state === "parked" ? "parked" : "idle")
      : "queued";
    const run = (context: ScheduledExecutionContext) => this.runLifecycle({ ...created, context }, agentFrom);
    const onCancelBeforeStart = () => this.cancelBeforeStart(agentId, jobId, turnId, created.role, created.item, created.effectiveAsync, created.reason);
    const handle = ancestry
      ? this.scheduler.runNested(jobId, ancestry.inheritedPermit, run)
      : this.scheduler.enqueue(jobId, run, onCancelBeforeStart);
    this.handles.set(jobId, handle);
    const baseSettlement = handle.result.catch(async (error) => {
      if (error instanceof ScheduledTaskCancelledError && error.beforeStart) {
        return this.cancelledSettlement(agentId, jobId, turnId, created.role, created.item, created.modelChoice, created.parentResolution, created.effectiveAsync, created.reason, created.backend, created.driver, error.message);
      }
      throw error;
    });
    const settlement = baseSettlement.then(async (result) => {
      const fullOutput = this.fullOutputs.get(jobId) ?? "";
      if (created.effectiveAsync) await this.options.onAsyncSettled?.(result, fullOutput);
      return result;
    });
    this.settlements.set(jobId, settlement);
    void settlement.catch(() => undefined);
    const normalizedHandle: ScheduledHandle<NormalizedTaskSettlement> = { ...handle, result: settlement };
    this.handles.set(jobId, normalizedHandle);
    return { ...created, handle: normalizedHandle };
  }

  private async begin(agentId: string, jobId: string, turnId: string, agentFrom: "queued" | "idle" | "parked"): Promise<void> {
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: agentFrom, to: "running", currentJobId: jobId, currentTurnId: turnId } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "running" } });
    await this.options.journal.append({ kind: "turn.audit", agentId, jobId, turnId, payload: { startedAt: this.clock().toISOString() } });
  }

  private async runLifecycle(args: Omit<CreatedTask, "handle"> & { context: ScheduledExecutionContext }, agentFrom: "queued" | "idle" | "parked"): Promise<NormalizedTaskSettlement> {
    const { agentId, jobId, turnId, role, item, modelChoice, parentResolution, currentTurnModelAuthority, modelDecision, effectiveAsync, reason, formalProtection, context, depth, continuation, backend, driver } = args;
    await this.begin(agentId, jobId, turnId, agentFrom);
    let status: NormalizedTaskSettlement["status"] = "completed";
    let output: TaskExecutionOutput;
    try {
      // The executor boundary is the first observable Agent activity. Record it
      // before awaiting the turn so interval evidence never reports completion
      // itself as the first activity.
      await this.options.journal.append({ kind: "turn.audit", agentId, jobId, turnId, payload: { firstActivityAt: this.clock().toISOString() } });
      output = await this.options.execute({ agentId, jobId, turnId, item, role, modelChoice, depth, context, formalProtection, parentResolution, currentTurnModelAuthority, modelDecision, continuation, backend, nestedCli: args.nestedCli, cliProbe: args.cliProbe, launchPlan: args.launchPlan, permissionModeSnapshot: args.permissionModeSnapshot });
      if (context.signal.aborted) throw context.signal.reason ?? new ScheduledTaskCancelledError(jobId, false);
      if (output.status === "failed") status = "failed";
      // A settled turn must carry a real terminal result. `completed` with an
      // empty output is the empty-result regression: fail it explicitly
      // instead of persisting a success with no content.
      if (status === "completed" && output.output.trim().length === 0) {
        status = "failed";
        output = {
          ...output,
          output: "",
          error: `SUB_EMPTY_RESULT: ${agentId}/${turnId} settled without terminal assistant text; the child session history is preserved for diagnosis`,
        };
      }
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
    let result = this.settlement(status, agentId, jobId, turnId, role, item, modelChoice, parentResolution, effectiveAsync, reason, backend, driver, output, formalResultStatus);
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
      result = this.settlement(status, agentId, jobId, turnId, role, item, modelChoice, parentResolution, effectiveAsync, reason, backend, driver, output, formalResultStatus);
    }

    if (status === "completed") await this.finishCompleted(agentId, jobId, turnId, formalResultStatus === "partial" || output.result === "partial" ? "partial" : "completed");
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
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "running", to: "idle", currentJobId: null, currentTurnId: null } });
  }

  private async finishFailed(agentId: string, jobId: string, turnId: string, error: string, formalResult?: "blocked" | "failed"): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "running", to: "failed", outcome: error } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "running", to: "failed", error, ...(formalResult ? { result: formalResult } : {}) } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "running", to: "idle", currentJobId: null, currentTurnId: null } });
  }

  private async finishAborted(agentId: string, jobId: string, turnId: string, error: string): Promise<void> {
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "running", to: "aborted", outcome: error } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "running", to: "aborted", error } });
    await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "running", to: "aborted", currentJobId: null, currentTurnId: null } });
  }

  private async cancelBeforeStart(agentId: string, jobId: string, turnId: string, role: RoleProfile, item: NormalizedTaskItem, effectiveAsync: boolean, reason: TaskEffectiveModeReason): Promise<void> {
    await this.options.journal.append({ kind: "turn.audit", agentId, jobId, turnId, payload: { completedAt: this.clock().toISOString(), outcome: "aborted-before-start" } });
    await this.options.journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "aborted", outcome: "cancelled-before-start" } });
    await this.options.journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "aborted", error: "cancelled-before-start" } });
    const agent = this.options.journal.getState().agents[agentId];
    if (agent?.state === "queued") {
      await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "aborted", currentJobId: null, currentTurnId: null } });
    }
    void role;
    void item;
    void effectiveAsync;
    void reason;
  }

  private cancelledSettlement(agentId: string, jobId: string, turnId: string, role: RoleProfile, item: NormalizedTaskItem, modelChoice: ResolvedModelChoice | undefined, parentResolution: ResolvedModelChoice | undefined, effectiveAsync: boolean, reason: TaskEffectiveModeReason, backend: ExecutionBackendKind, driver: AgentDriverKind, error: string): NormalizedTaskSettlement {
    return this.settlement("aborted", agentId, jobId, turnId, role, item, modelChoice, parentResolution, effectiveAsync, reason, backend, driver, { output: "", error });
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
    reason: TaskEffectiveModeReason,
    backend: ExecutionBackendKind,
    driver: AgentDriverKind,
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
      ...(execution.result ? { result: execution.result } : {}),
      taskId: agentId,
      agentId,
      jobId,
      turnId,
      selector: role.selector,
      backend,
      driver,
      ...(execution.runId ? { runId: execution.runId } : {}),
      name: item.name ?? role.name,
      ...(item.selectionScope === undefined ? {} : { selectionScope: item.selectionScope }),
      ...(driver === "external-cli" ? { ...(item.cli === undefined ? {} : { externalCli: item.cli }), executionBoundary: "trusted-local-vendor" as const, executableBinding: "Unverified" as const } : {}),
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
