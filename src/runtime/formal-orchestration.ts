import { createHash } from "node:crypto";
import {
  projectAgentCatalog,
  type AgentCatalog,
  type AgentCatalogPackageStatus,
  type AgentCatalogPhase,
} from "./agent-catalog.js";
import {
  validateFormalTaskBoard,
  type FormalTaskBoard,
  type FormalTaskBoardBootstrapBridgeIdentity,
  type FormalTaskBoardBootstrapLimitation,
  type FormalTaskBoardValidationResult,
  type FormalTaskPackage,
  type FormalTaskPackageStatus,
  type FormalTaskProgressEvent,
} from "./formal-task-board.js";
import {
  FORMAL_TASK_BOARD_WAIVER_CLASSES,
  type FormalTaskBoardTransitionOperation,
  type FormalTaskBoardWaiverClass,
  type FormalTaskBoardWorkerFailure,
} from "./formal-task-board-update.js";
import type { LifecycleAgentGuidanceInput } from "./rose-context.js";
import type { RoleProfile } from "./roles.js";
import { roleCanMutate, type FormalContinuationAudit, type TaskWriteScope } from "./persistent-agents/task-schema.js";

const WAIVER_CLASSES = new Set<string>(FORMAL_TASK_BOARD_WAIVER_CLASSES);
const JOIN_ID_PATTERN = /^J-[A-Za-z0-9][A-Za-z0-9._-]{0,61}$/;
const MAX_EVIDENCE_CHARS = 2_048;

export interface OrdinaryLifecycleSnapshot {
  kind: "ordinary";
}

export interface FormalLifecycleSnapshot {
  kind: "formal";
  taskIdentity: string;
  phase: AgentCatalogPhase;
  tasksSource: string;
  progressSource: string;
  profiles: readonly RoleProfile[];
  bootstrapBridge?: FormalTaskBoardBootstrapBridgeIdentity;
}

export type CurrentLifecycleSnapshot = OrdinaryLifecycleSnapshot | FormalLifecycleSnapshot;

export interface FormalOperationGateEvidence {
  state: "allowed" | "blocked";
  evidence: string;
}

export interface FormalOwnershipEvidence {
  classification: "agent-execution" | "rose-direct" | "mixed";
  evidence: string;
}

export interface FormalAsyncSafetyEvidence {
  independent: boolean;
  nonOverlapping: boolean;
  safeToProceed: boolean;
  evidence: string;
}

export interface FormalPackageExecutionObservation {
  packageId: string;
  actors: readonly ("ROSE" | "agent")[];
  settled?: boolean;
  outputReadable?: boolean;
  historyReadable?: boolean;
  inspected?: boolean;
  directWorkStartedAt?: string;
}

export interface FormalOrchestrationDiagnostic {
  code: string;
  message: string;
  packageId?: string;
  field?: string;
}

export interface FormalTaskRequest {
  task: string;
  agent: string;
  async: boolean;
  writeScope: TaskWriteScope;
  formalContext: { changeId: string };
  continuationAudit: FormalContinuationAudit;
}

export interface FormalWaiverAudit {
  packageId: string;
  waiverClass: FormalTaskBoardWaiverClass;
  owner: string;
  evidence: string;
  decision: "ROSE";
  recordedAt: string;
}

interface FormalPlanBase {
  taskIdentity: string;
  phase: AgentCatalogPhase;
  packageId: string;
  guidance: LifecycleAgentGuidanceInput;
  diagnostics: readonly FormalOrchestrationDiagnostic[];
}

export interface OrdinaryDirectPlan {
  status: "ordinary-direct";
  reason: "benefit-based-routing";
  diagnostics: readonly [];
}

export interface FormalTaskRequestPlan extends FormalPlanBase {
  status: "task-request";
  taskRequest: FormalTaskRequest;
  join: "immediate" | string;
}

export interface FormalDirectPlan extends FormalPlanBase {
  status: "formal-direct";
  owner: "ROSE";
  waiver?: FormalWaiverAudit;
}

export interface FormalBlockedPlan {
  status: "blocked";
  taskIdentity?: string;
  phase?: AgentCatalogPhase;
  packageId?: string;
  guidance?: LifecycleAgentGuidanceInput;
  diagnostics: readonly FormalOrchestrationDiagnostic[];
}

export type FormalPackageExecutionPlan =
  | OrdinaryDirectPlan
  | FormalTaskRequestPlan
  | FormalDirectPlan
  | FormalBlockedPlan;

export type FormalPackageExecutionPlanInput =
  | { lifecycle: OrdinaryLifecycleSnapshot }
  | {
    lifecycle: FormalLifecycleSnapshot;
    packageId: string;
    operationGate: FormalOperationGateEvidence;
    ownership: FormalOwnershipEvidence;
    writeScope: TaskWriteScope;
    asyncSafety?: FormalAsyncSafetyEvidence;
    observations?: readonly FormalPackageExecutionObservation[];
  };

interface PreparedFormalLifecycle {
  lifecycle: FormalLifecycleSnapshot;
  board: FormalTaskBoard;
  progress: readonly FormalTaskProgressEvent[];
  validation: FormalTaskBoardValidationResult;
  catalog: AgentCatalog;
  guidance: LifecycleAgentGuidanceInput;
}

type Preparation =
  | { ok: true; value: PreparedFormalLifecycle }
  | { ok: false; diagnostics: readonly FormalOrchestrationDiagnostic[] };

interface ObservationMapResult {
  observations: Map<string, FormalPackageExecutionObservation>;
  diagnostics: FormalOrchestrationDiagnostic[];
}

function diagnostic(
  code: string,
  message: string,
  packageId?: string,
  field?: string,
): FormalOrchestrationDiagnostic {
  return {
    code,
    message,
    ...(packageId === undefined ? {} : { packageId }),
    ...(field === undefined ? {} : { field }),
  };
}

function concrete(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_EVIDENCE_CHARS) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0
    && !/[\r\n\0]/.test(value)
    && !/^(?:pending|none|n\/a|tbd|unverified|-)(?:$|\s|:|—)/.test(normalized);
}

function boundedText(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= MAX_EVIDENCE_CHARS
    && !/[\r\n\0]/.test(value);
}

function packageField(taskPackage: FormalTaskPackage, name: keyof FormalTaskPackage["fields"]): string {
  return taskPackage.fields[name]?.value ?? "";
}

function packageStatus(taskPackage: FormalTaskPackage): FormalTaskPackageStatus {
  return packageField(taskPackage, "Status") as FormalTaskPackageStatus;
}

function eventField(event: FormalTaskProgressEvent, key: string): string | undefined {
  return event.fields.find((field) => field.key === key)?.value;
}

function packageEvents(prepared: PreparedFormalLifecycle, packageId: string, type?: string): FormalTaskProgressEvent[] {
  return prepared.progress.filter((event) => event.subject === packageId && (type === undefined || event.type === type));
}

function prepareFormalLifecycle(lifecycle: FormalLifecycleSnapshot): Preparation {
  const catalog = projectAgentCatalog(lifecycle.profiles);
  if (!catalog.ok) {
    return {
      ok: false,
      diagnostics: catalog.diagnostics.map((entry) => diagnostic(entry.code, entry.message, entry.packageId)),
    };
  }
  const specializedSelectors = catalog.value.entries
    .map((entry) => entry.selector)
    .filter((selector) => selector !== "general");
  const validation = validateFormalTaskBoard(lifecycle.tasksSource, lifecycle.progressSource, {
    specializedRoleSelectors: specializedSelectors,
    bootstrapBridge: lifecycle.bootstrapBridge,
  });
  if (!validation.valid || !validation.board || !validation.progress) {
    return {
      ok: false,
      diagnostics: validation.diagnostics.map((entry) => diagnostic(entry.code, entry.message, entry.packageId, entry.field)),
    };
  }
  const boardIdentity = validation.board.headers["Task identity"]?.value;
  if (boardIdentity !== lifecycle.taskIdentity) {
    return {
      ok: false,
      diagnostics: [diagnostic("LIFECYCLE_IDENTITY_MISMATCH", "Current lifecycle identity does not exactly match the validated task board.", undefined, "Task identity")],
    };
  }
  const boardPhase = validation.board.headers.Phase?.value;
  if (boardPhase !== lifecycle.phase) {
    return {
      ok: false,
      diagnostics: [diagnostic("LIFECYCLE_PHASE_MISMATCH", "Current lifecycle phase does not exactly match the validated task board.", undefined, "Phase")],
    };
  }
  const activeOwners = validation.board.packages.map((taskPackage) => ({
    packageId: taskPackage.id,
    owner: packageField(taskPackage, "Owner"),
    status: packageStatus(taskPackage) as AgentCatalogPackageStatus,
    dispatchReason: packageField(taskPackage, "Dispatch reason"),
  }));
  return {
    ok: true,
    value: {
      lifecycle,
      board: validation.board,
      progress: validation.progress.events,
      validation,
      catalog: catalog.value,
      guidance: {
        profiles: lifecycle.profiles,
        phase: lifecycle.phase,
        activeOwners,
      },
    },
  };
}

function blockedFromPreparation(
  lifecycle: FormalLifecycleSnapshot,
  packageId: string | undefined,
  preparation: Extract<Preparation, { ok: false }>,
): FormalBlockedPlan {
  return {
    status: "blocked",
    taskIdentity: lifecycle.taskIdentity,
    phase: lifecycle.phase,
    ...(packageId === undefined ? {} : { packageId }),
    diagnostics: preparation.diagnostics,
  };
}

function prepareObservations(
  prepared: PreparedFormalLifecycle,
  observations: readonly FormalPackageExecutionObservation[] | undefined,
): ObservationMapResult {
  const diagnostics: FormalOrchestrationDiagnostic[] = [];
  const result = new Map<string, FormalPackageExecutionObservation>();
  if (observations === undefined) return { observations: result, diagnostics };
  if (!Array.isArray(observations)) {
    return { observations: result, diagnostics: [diagnostic("OBSERVATIONS_INVALID", "Package execution observations must be an array.")] };
  }
  const packageIds = new Set(prepared.board.packages.map((taskPackage) => taskPackage.id));
  for (const observation of observations as readonly unknown[]) {
    if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
      diagnostics.push(diagnostic("OBSERVATION_INVALID", "A package execution observation is malformed."));
      continue;
    }
    const candidate = observation as Partial<FormalPackageExecutionObservation>;
    if (typeof candidate.packageId !== "string" || !packageIds.has(candidate.packageId)) {
      diagnostics.push(diagnostic("OBSERVATION_PACKAGE_UNKNOWN", "A package execution observation does not resolve to the current board.", candidate.packageId));
      continue;
    }
    if (result.has(candidate.packageId)) {
      diagnostics.push(diagnostic("OBSERVATION_DUPLICATE", "A package execution observation appears more than once.", candidate.packageId));
      continue;
    }
    if (!Array.isArray(candidate.actors)
      || candidate.actors.some((actor) => actor !== "ROSE" && actor !== "agent")
      || new Set(candidate.actors).size !== candidate.actors.length) {
      diagnostics.push(diagnostic("OBSERVATION_ACTORS_INVALID", "Execution actors must be a unique subset of ROSE and agent.", candidate.packageId));
      continue;
    }
    if (candidate.directWorkStartedAt !== undefined && !validTimestamp(candidate.directWorkStartedAt)) {
      diagnostics.push(diagnostic("DIRECT_WORK_TIMESTAMP_INVALID", "Direct-work timing must be a valid RFC 3339 timestamp.", candidate.packageId));
      continue;
    }
    result.set(candidate.packageId, candidate as FormalPackageExecutionObservation);
  }
  return { observations: result, diagnostics };
}

function validTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function bridgeLimitation(
  prepared: PreparedFormalLifecycle,
  packageId: string,
): FormalTaskBoardBootstrapLimitation | undefined {
  return prepared.validation.bridge?.limitations.find((limitation) => limitation.packageId === packageId);
}

function validateAgentObservation(
  prepared: PreparedFormalLifecycle,
  taskPackage: FormalTaskPackage,
  observation: FormalPackageExecutionObservation | undefined,
  prefix: "DEPENDENCY" | "PHASE",
): FormalOrchestrationDiagnostic[] {
  if (!observation) {
    return [diagnostic(`${prefix}_EVIDENCE_MISSING`, "Agent evidence requires an explicit current package observation.", taskPackage.id)];
  }
  const diagnostics: FormalOrchestrationDiagnostic[] = [];
  if (observation.settled !== true) diagnostics.push(diagnostic(`${prefix}_SETTLEMENT_OPEN`, "Agent runtime settlement is not established.", taskPackage.id));
  if (observation.outputReadable !== true) diagnostics.push(diagnostic(`${prefix}_OUTPUT_UNREADABLE`, "Required Agent output has not been read successfully.", taskPackage.id));
  const external = bridgeLimitation(prepared, taskPackage.id)?.unavailable === "job,turn,history";
  if (!external && observation.historyReadable !== true) {
    diagnostics.push(diagnostic(`${prefix}_HISTORY_UNREADABLE`, "Required Agent history has not been read successfully.", taskPackage.id));
  }
  if (observation.inspected !== true) diagnostics.push(diagnostic(`${prefix}_INSPECTION_MISSING`, "ROSE inspection and disposition are not established.", taskPackage.id));
  return diagnostics;
}

function waiverAudit(
  prepared: PreparedFormalLifecycle,
  taskPackage: FormalTaskPackage,
  observation: FormalPackageExecutionObservation | undefined,
  requireWorkTiming: boolean,
): { audit?: FormalWaiverAudit; diagnostics: FormalOrchestrationDiagnostic[] } {
  const diagnostics: FormalOrchestrationDiagnostic[] = [];
  const events = packageEvents(prepared, taskPackage.id, "WAIVED");
  if (events.length !== 1) {
    diagnostics.push(diagnostic(
      events.length === 0 ? "WAIVER_EVENT_MISSING" : "WAIVER_EVENT_DUPLICATE",
      "A waived package requires exactly one auditable pre-recorded WAIVED event.",
      taskPackage.id,
    ));
    return { diagnostics };
  }
  const event = events[0]!;
  const evidence = eventField(event, "evidence");
  const waiverClass = evidence?.match(/^decision:waiver\/(complete-user-provided-evidence|selector-unavailable-equivalent-capability|measured-dispatch-cost-exceeds-evidence-value)(?:\/|$)/)?.[1];
  const owner = packageField(taskPackage, "Owner");
  if (!waiverClass || !WAIVER_CLASSES.has(waiverClass)) {
    diagnostics.push(diagnostic("WAIVER_CLASS_INVALID", "The recorded waiver class is outside the accepted closed set.", taskPackage.id));
  }
  if (!concrete(evidence) || evidence !== packageField(taskPackage, "Dispatch evidence")) {
    diagnostics.push(diagnostic("WAIVER_AUDIT_INVALID", "The waiver must bind the exact portable Dispatch evidence recorded by ROSE.", taskPackage.id));
  }
  const workStartedAt = observation?.directWorkStartedAt;
  if (requireWorkTiming && workStartedAt === undefined) {
    diagnostics.push(diagnostic("WAIVER_WORK_TIMING_UNVERIFIED", "Completed waived work requires explicit direct-work start timing.", taskPackage.id));
  } else if (workStartedAt !== undefined && Date.parse(event.timestamp) >= Date.parse(workStartedAt)) {
    diagnostics.push(diagnostic("WAIVER_POST_HOC", "The waiver was not recorded before direct work started.", taskPackage.id));
  }
  if (diagnostics.length > 0 || !waiverClass || !evidence || !owner) return { diagnostics };
  return {
    audit: {
      packageId: taskPackage.id,
      waiverClass: waiverClass as FormalTaskBoardWaiverClass,
      owner,
      evidence,
      decision: "ROSE",
      recordedAt: event.timestamp,
    },
    diagnostics,
  };
}

function exactTaskRequest(prepared: PreparedFormalLifecycle, taskPackage: FormalTaskPackage, writeScope: TaskWriteScope): FormalTaskRequest {
  const selector = packageField(taskPackage, "Owner").slice("agent:".length);
  const continuationAudit: FormalContinuationAudit = {
    packageId: taskPackage.id,
    canonicalRole: selector,
    scope: packageField(taskPackage, "Scope"),
    forbiddenScope: packageField(taskPackage, "Forbidden scope"),
    writeScope,
    acceptanceBoundary: packageField(taskPackage, "Acceptance"),
    expectedEvidence: packageField(taskPackage, "Expected evidence"),
  };
  return {
    task: [
      `Formal lifecycle package ${taskPackage.id} — ${taskPackage.title}`,
      `Task identity: ${prepared.lifecycle.taskIdentity}`,
      `Phase: ${prepared.lifecycle.phase}`,
      `Scope: ${packageField(taskPackage, "Scope")}`,
      `Forbidden scope: ${packageField(taskPackage, "Forbidden scope")}`,
      `Expected result: ${packageField(taskPackage, "Expected result")}`,
      `Expected evidence: ${packageField(taskPackage, "Expected evidence")}`,
      `Acceptance: ${packageField(taskPackage, "Acceptance")}`,
      `Write scope paths: ${writeScope.paths.join(", ") || "none"}`,
      `Write scope resources: ${writeScope.resources.join(", ") || "none"}`,
      "Return evidence only. Do not write the owning formal-task-board.md/progress.txt or decide lifecycle phase, acceptance, integration, or verdict.",
      "Any nested task request must explicitly repeat this exact formalContext.changeId; omission or mismatch is denied.",
    ].join("\n"),
    agent: selector,
    async: packageField(taskPackage, "Execution") === "async",
    writeScope,
    formalContext: { changeId: prepared.lifecycle.taskIdentity },
    continuationAudit,
  };
}

export function planFormalPackageExecution(input: FormalPackageExecutionPlanInput): FormalPackageExecutionPlan {
  if (input.lifecycle.kind === "ordinary") {
    return { status: "ordinary-direct", reason: "benefit-based-routing", diagnostics: [] };
  }
  const formalInput = input as Extract<FormalPackageExecutionPlanInput, { lifecycle: FormalLifecycleSnapshot }>;
  const lifecycle = formalInput.lifecycle;
  const preparation = prepareFormalLifecycle(lifecycle);
  if (!preparation.ok) return blockedFromPreparation(lifecycle, formalInput.packageId, preparation);
  const prepared = preparation.value;
  const taskPackage = prepared.board.packages.find((candidate) => candidate.id === formalInput.packageId);
  if (!taskPackage) {
    return {
      status: "blocked",
      taskIdentity: lifecycle.taskIdentity,
      phase: lifecycle.phase,
      packageId: formalInput.packageId,
      guidance: prepared.guidance,
      diagnostics: [diagnostic("PACKAGE_UNKNOWN", "The requested package does not exist on the exact current board.", formalInput.packageId)],
    };
  }
  const diagnostics: FormalOrchestrationDiagnostic[] = [];
  if (packageStatus(taskPackage) !== "ready") {
    diagnostics.push(diagnostic("PACKAGE_NOT_READY", "Only a validated ready package may produce an execution plan.", taskPackage.id, "Status"));
  }
  if (!formalInput.operationGate || formalInput.operationGate.state !== "allowed" || !concrete(formalInput.operationGate.evidence)) {
    diagnostics.push(diagnostic("OPERATION_GATE_BLOCKED", "A current concrete operation gate must allow the package; board ownership grants no permission.", taskPackage.id));
  }
  if (!formalInput.ownership || !concrete(formalInput.ownership.evidence)) {
    diagnostics.push(diagnostic("OWNERSHIP_EVIDENCE_MISSING", "Current bounded ownership classification evidence is required.", taskPackage.id));
  } else if (formalInput.ownership.classification === "mixed") {
    diagnostics.push(diagnostic("MIXED_AUTHORITY_SCOPE", "A package mixing ROSE authority with delegated execution must be split before ready.", taskPackage.id));
  }

  const observationResult = prepareObservations(prepared, formalInput.observations);
  diagnostics.push(...observationResult.diagnostics);
  const observation = observationResult.observations.get(taskPackage.id);
  const owner = packageField(taskPackage, "Owner");
  const dispatch = packageField(taskPackage, "Dispatch");
  const expectedOwnership = owner === "ROSE" ? "rose-direct" : "agent-execution";
  if (formalInput.ownership?.classification !== "mixed" && formalInput.ownership?.classification !== expectedOwnership) {
    diagnostics.push(diagnostic("OWNERSHIP_MISMATCH", "Current ownership classification does not match the exact board Owner.", taskPackage.id, "Owner"));
  }

  for (const dependencyId of taskPackage.dependencies) {
    const dependency = prepared.board.packages.find((candidate) => candidate.id === dependencyId);
    if (!dependency || packageField(dependency, "Owner") === "ROSE" || packageField(dependency, "Dispatch") === "waived") continue;
    diagnostics.push(...validateAgentObservation(prepared, dependency, observationResult.observations.get(dependencyId), "DEPENDENCY"));
  }

  if (owner === "ROSE") {
    if (observation?.actors.includes("agent")) {
      diagnostics.push(diagnostic("DIRECT_PACKAGE_DISPATCH_FORBIDDEN", "A ROSE-owned package must not dispatch an Agent.", taskPackage.id));
    }
    if (diagnostics.length > 0) return { status: "blocked", taskIdentity: lifecycle.taskIdentity, phase: lifecycle.phase, packageId: taskPackage.id, guidance: prepared.guidance, diagnostics };
    return {
      status: "formal-direct",
      taskIdentity: lifecycle.taskIdentity,
      phase: lifecycle.phase,
      packageId: taskPackage.id,
      owner: "ROSE",
      guidance: prepared.guidance,
      diagnostics: [],
    };
  }

  if (dispatch === "waived") {
    if (observation?.actors.includes("agent")) diagnostics.push(diagnostic("WAIVED_PACKAGE_DISPATCH_FORBIDDEN", "A valid waived package remains direct and must not dispatch.", taskPackage.id));
    const waiver = waiverAudit(prepared, taskPackage, observation, observation?.directWorkStartedAt !== undefined);
    diagnostics.push(...waiver.diagnostics);
    if (diagnostics.length > 0 || !waiver.audit) return { status: "blocked", taskIdentity: lifecycle.taskIdentity, phase: lifecycle.phase, packageId: taskPackage.id, guidance: prepared.guidance, diagnostics };
    return {
      status: "formal-direct",
      taskIdentity: lifecycle.taskIdentity,
      phase: lifecycle.phase,
      packageId: taskPackage.id,
      owner: "ROSE",
      waiver: waiver.audit,
      guidance: prepared.guidance,
      diagnostics: [],
    };
  }

  const selector = owner.startsWith("agent:") ? owner.slice("agent:".length) : "";
  const catalogEntry = prepared.catalog.entries.find((entry) => entry.selector === selector);
  const role = prepared.lifecycle.profiles.find((candidate) => candidate.selector === selector);
  if (!catalogEntry || selector === "general") {
    diagnostics.push(diagnostic("FORMAL_SELECTOR_INVALID", "Formal dispatch requires the exact current Specialized Owner selector.", taskPackage.id, "Owner"));
  } else if (catalogEntry.status === "blocked") {
    diagnostics.push(diagnostic("FORMAL_SELECTOR_UNAVAILABLE", "The exact required Specialized selector is currently blocked; no fallback is permitted.", taskPackage.id, "Owner"));
  }
  const writeScope = formalInput.writeScope;
  const validWriteScope = writeScope && Array.isArray(writeScope.paths) && Array.isArray(writeScope.resources)
    && [...writeScope.paths, ...writeScope.resources].every(boundedText)
    && writeScope.paths.length <= 64 && writeScope.resources.length <= 64
    && new Set(writeScope.paths).size === writeScope.paths.length
    && new Set(writeScope.resources).size === writeScope.resources.length;
  if (!validWriteScope) {
    diagnostics.push(diagnostic("WRITE_SCOPE_INVALID", "Formal planning requires one explicit normalized writeScope.", taskPackage.id));
  } else if (role && roleCanMutate(role) && writeScope.paths.length === 0 && writeScope.resources.length === 0) {
    diagnostics.push(diagnostic("WRITE_SCOPE_REQUIRED", "A mutation-capable formal role requires at least one explicit path or resource.", taskPackage.id));
  }
  if (observation?.actors.includes("ROSE") || observation?.directWorkStartedAt !== undefined) {
    diagnostics.push(diagnostic("DUPLICATE_SCOPE", "ROSE direct work duplicates required Agent-owned scope.", taskPackage.id));
  }
  if (observation?.actors.includes("agent")) {
    diagnostics.push(diagnostic("PACKAGE_EXECUTION_ALREADY_STARTED", "A ready package cannot produce a second Agent dispatch request.", taskPackage.id));
  }
  const execution = packageField(taskPackage, "Execution");
  if (execution === "async") {
    const safety = formalInput.asyncSafety;
    if (!safety || !safety.independent || !safety.nonOverlapping || !safety.safeToProceed || !concrete(safety.evidence)) {
      diagnostics.push(diagnostic("ASYNC_SAFETY_UNVERIFIED", "Async dispatch requires explicit independent, non-overlapping, safe-to-proceed evidence.", taskPackage.id));
    }
  }
  if (diagnostics.length > 0) return { status: "blocked", taskIdentity: lifecycle.taskIdentity, phase: lifecycle.phase, packageId: taskPackage.id, guidance: prepared.guidance, diagnostics };
  return {
    status: "task-request",
    taskIdentity: lifecycle.taskIdentity,
    phase: lifecycle.phase,
    packageId: taskPackage.id,
    taskRequest: exactTaskRequest(prepared, taskPackage, writeScope),
    join: packageField(taskPackage, "Join"),
    guidance: prepared.guidance,
    diagnostics: [],
  };
}

export type FormalHubRequest =
  | { action: "wait"; jobIds: string[] }
  | { action: "jobs"; jobId: string }
  | { action: "output"; agentId: string; offset: 0; limit: 500 }
  | { action: "history"; agentId: string; offset: 0; limit: 500 };

export interface FormalHubJoinMember {
  packageId: string;
  status: FormalTaskPackageStatus;
  joined: boolean;
}

export interface FormalHubJoinPlan {
  status: "closed" | "collect" | "waiting" | "blocked";
  joinId: string;
  members: readonly FormalHubJoinMember[];
  requests: readonly FormalHubRequest[];
  guidance?: LifecycleAgentGuidanceInput;
  diagnostics: readonly FormalOrchestrationDiagnostic[];
}

export function planFormalHubJoin(lifecycle: FormalLifecycleSnapshot, joinId: string): FormalHubJoinPlan {
  const preparation = prepareFormalLifecycle(lifecycle);
  if (!preparation.ok) return { status: "blocked", joinId, members: [], requests: [], diagnostics: preparation.diagnostics };
  const prepared = preparation.value;
  if (!JOIN_ID_PATTERN.test(joinId)) {
    return { status: "blocked", joinId, members: [], requests: [], guidance: prepared.guidance, diagnostics: [diagnostic("JOIN_ID_INVALID", "A formal async join requires a stable named Join ID.")] };
  }
  const packages = prepared.board.packages.filter((taskPackage) => packageField(taskPackage, "Execution") === "async"
    && packageField(taskPackage, "Join") === joinId
    && packageStatus(taskPackage) !== "cancelled");
  if (packages.length === 0) {
    return { status: "blocked", joinId, members: [], requests: [], guidance: prepared.guidance, diagnostics: [diagnostic("JOIN_UNKNOWN", "The named Join has no current noncancelled members.")] };
  }
  const diagnostics: FormalOrchestrationDiagnostic[] = [];
  const members = packages.map((taskPackage): FormalHubJoinMember => {
    const joined = packageEvents(prepared, taskPackage.id, "JOINED").length === 1;
    if (packageStatus(taskPackage) === "blocked") {
      diagnostics.push(diagnostic("JOIN_MEMBER_BLOCKED", "A blocked async member prevents the named Join from satisfying dependent or phase gates.", taskPackage.id));
    }
    return { packageId: taskPackage.id, status: packageStatus(taskPackage), joined };
  });
  if (diagnostics.length > 0) return { status: "blocked", joinId, members, requests: [], guidance: prepared.guidance, diagnostics };
  if (members.every((member) => member.joined)) return { status: "closed", joinId, members, requests: [], guidance: prepared.guidance, diagnostics: [] };
  return { status: "waiting", joinId, members, requests: [], guidance: prepared.guidance, diagnostics: [] };
}

export type FormalRuntimeEvidenceState = "readable" | "missing" | "stale" | "unreadable";
export type FormalRuntimeWorkerResult = "completed" | "partial" | "blocked" | "failed";

export interface FormalRuntimeReconciliationObservation {
  packageId: string;
  formalProtection: { changeId: string };
  formalContinuationIdentity: FormalContinuationAudit;
  agent?: { id: string; state: "queued" | "running" | "idle" | "parked" | "aborted"; released: boolean };
  job?: { id: string; agentId: string; state: "queued" | "running" | "completed" | "failed" | "aborted" | "unexecuted" };
  turn?: { id: string; agentId: string; jobId: string; state: "queued" | "running" | "completed" | "failed" | "aborted" | "interrupted" };
  continuationTurns?: readonly { id: string; state: "queued" | "running" | "completed" | "failed" | "aborted" | "interrupted" }[];
  output: { state: FormalRuntimeEvidenceState; result?: FormalRuntimeWorkerResult; digest?: string };
  history: { state: FormalRuntimeEvidenceState };
}

export interface FormalRuntimeReconciliationDecision {
  packageId: string;
  currentStatus: FormalTaskPackageStatus;
  decision: "returned" | "blocked" | "waiting" | "preserve";
  reason: string;
  requiresInspection?: true;
  operation?: FormalTaskBoardTransitionOperation;
}

export interface FormalRuntimeReconciliationJoin {
  joinId: string;
  status: "closed" | "open" | "blocked";
  members: readonly string[];
}

export interface FormalRuntimeReconciliationEventPlan {
  subject: string;
  type: "RECONCILED";
  fields: {
    evidence: string;
  };
}

export interface FormalRuntimeReconciliationPlan {
  status: "planned" | "blocked";
  taskIdentity: string;
  decisions: readonly FormalRuntimeReconciliationDecision[];
  events: readonly FormalRuntimeReconciliationEventPlan[];
  joins: readonly FormalRuntimeReconciliationJoin[];
  authority: {
    boardWrite: false;
    redispatch: false;
    acceptance: false;
    joinClosureFromSettlement: false;
    phaseAdvance: false;
  };
  diagnostics: readonly FormalOrchestrationDiagnostic[];
}

function reconciliationAuthority(): FormalRuntimeReconciliationPlan["authority"] {
  return {
    boardWrite: false,
    redispatch: false,
    acceptance: false,
    joinClosureFromSettlement: false,
    phaseAdvance: false,
  };
}

function reconciliationEvidence(changeId: string, packageId: string, decision: "returned" | "blocked", reason: string): string {
  const digest = createHash("sha256").update(JSON.stringify({ changeId, packageId, decision, reason })).digest("hex").slice(0, 32);
  return `artifact:formal-reconciliation/${changeId}/${packageId}/${digest}`;
}

function blockedReconciliation(
  taskPackage: FormalTaskPackage,
  failure: FormalTaskBoardWorkerFailure,
  reason: string,
  changeId: string,
): FormalRuntimeReconciliationDecision {
  const evidence = reconciliationEvidence(changeId, taskPackage.id, "blocked", reason);
  return {
    packageId: taskPackage.id,
    currentStatus: packageStatus(taskPackage),
    decision: "blocked",
    reason,
    ...(packageField(taskPackage, "Execution") === "async" ? { requiresInspection: true as const } : {}),
    operation: {
      kind: "transition",
      to: "blocked",
      failure,
      blocker: reason,
      evidence,
      nextAction: "ROSE inspects the bounded reconciliation evidence and decides any new lawful package.",
      reconciliation: { evidence },
    },
  };
}

function evidenceFailure(state: FormalRuntimeEvidenceState): FormalTaskBoardWorkerFailure | undefined {
  if (state === "readable") return undefined;
  return state;
}

function isFormalRuntimeReconciliationObservation(value: unknown): value is FormalRuntimeReconciliationObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<FormalRuntimeReconciliationObservation>;
  const formalProtection = candidate.formalProtection as Partial<FormalRuntimeReconciliationObservation["formalProtection"]> | undefined;
  const identity = candidate.formalContinuationIdentity as Partial<FormalContinuationAudit> | undefined;
  const output = candidate.output as Partial<FormalRuntimeReconciliationObservation["output"]> | undefined;
  const history = candidate.history as Partial<FormalRuntimeReconciliationObservation["history"]> | undefined;
  const evidenceStates = new Set<FormalRuntimeEvidenceState>(["readable", "missing", "stale", "unreadable"]);
  const results = new Set<FormalRuntimeWorkerResult>(["completed", "partial", "blocked", "failed"]);
  if (!boundedText(candidate.packageId)
    || !formalProtection || !boundedText(formalProtection.changeId)
    || !identity || !boundedText(identity.packageId) || !boundedText(identity.canonicalRole)
    || !boundedText(identity.scope) || !boundedText(identity.forbiddenScope)
    || !identity.writeScope || !Array.isArray(identity.writeScope.paths) || !Array.isArray(identity.writeScope.resources)
    || identity.writeScope.paths.length > 64 || identity.writeScope.resources.length > 64
    || ![...identity.writeScope.paths, ...identity.writeScope.resources].every(boundedText)
    || !boundedText(identity.acceptanceBoundary) || !boundedText(identity.expectedEvidence)
    || !output || !output.state || !evidenceStates.has(output.state)
    || (output.result !== undefined && !results.has(output.result))
    || (output.digest !== undefined && !/^[0-9a-f]{64}$/.test(output.digest))
    || !history || !history.state || !evidenceStates.has(history.state)) return false;
  if (candidate.agent !== undefined && (!boundedText(candidate.agent.id)
    || !["queued", "running", "idle", "parked", "aborted"].includes(candidate.agent.state)
    || typeof candidate.agent.released !== "boolean")) return false;
  if (candidate.job !== undefined && (!boundedText(candidate.job.id) || !boundedText(candidate.job.agentId)
    || !["queued", "running", "completed", "failed", "aborted", "unexecuted"].includes(candidate.job.state))) return false;
  if (candidate.turn !== undefined && (!boundedText(candidate.turn.id) || !boundedText(candidate.turn.agentId)
    || !boundedText(candidate.turn.jobId)
    || !["queued", "running", "completed", "failed", "aborted", "interrupted"].includes(candidate.turn.state))) return false;
  if (candidate.continuationTurns !== undefined) {
    if (!Array.isArray(candidate.continuationTurns) || candidate.continuationTurns.length > 64) return false;
    const ids = new Set<string>();
    for (const turn of candidate.continuationTurns) {
      if (!turn || !boundedText(turn.id)
        || !["queued", "running", "completed", "failed", "aborted", "interrupted"].includes(turn.state)
        || ids.has(turn.id)) return false;
      ids.add(turn.id);
    }
  }
  return true;
}

function reconcileRunningPackage(
  taskPackage: FormalTaskPackage,
  observation: FormalRuntimeReconciliationObservation | undefined,
  changeId: string,
): FormalRuntimeReconciliationDecision {
  if (!observation) return blockedReconciliation(taskPackage, "missing", "No exact current Journal observation is bound to the running package.", changeId);
  const identity = observation.formalContinuationIdentity;
  const expectedRole = packageField(taskPackage, "Owner").replace(/^agent:/, "");
  if (observation.formalProtection.changeId !== changeId
    || observation.packageId !== taskPackage.id
    || identity.packageId !== taskPackage.id
    || identity.canonicalRole !== expectedRole
    || identity.scope !== packageField(taskPackage, "Scope")
    || identity.forbiddenScope !== packageField(taskPackage, "Forbidden scope")
    || identity.acceptanceBoundary !== packageField(taskPackage, "Acceptance")
    || identity.expectedEvidence !== packageField(taskPackage, "Expected evidence")
    || (observation.agent && observation.job && observation.job.agentId !== observation.agent.id)
    || (observation.agent && observation.turn && observation.turn.agentId !== observation.agent.id)
    || (observation.job && observation.turn && observation.turn.jobId !== observation.job.id)) {
    return blockedReconciliation(taskPackage, "stale", "The Journal protection and continuation identity do not exactly bind the current package.", changeId);
  }
  if (!observation.agent || observation.agent.released) {
    return blockedReconciliation(taskPackage, "stale", "The current package is bound to a missing or released Agent.", changeId);
  }
  if (!observation.job || !observation.turn) {
    return blockedReconciliation(taskPackage, "missing", "The exact bound job or turn is missing from the current Journal observation.", changeId);
  }
  const continuations = observation.continuationTurns ?? [];
  if (continuations.some((turn) => turn.state === "failed")) {
    return blockedReconciliation(taskPackage, "failed", "A same-identity formal continuation turn failed.", changeId);
  }
  if (continuations.some((turn) => turn.state === "aborted" || turn.state === "interrupted")) {
    return blockedReconciliation(taskPackage, "interrupted", "A same-identity formal continuation turn was aborted or interrupted.", changeId);
  }
  if (continuations.some((turn) => turn.state === "queued" || turn.state === "running")) {
    return {
      packageId: taskPackage.id,
      currentStatus: "running",
      decision: "waiting",
      reason: "A same-identity formal continuation turn remains nonterminal; preserve the package without replay or transition.",
    };
  }
  if (continuations.some((turn) => turn.state === "completed")) {
    return blockedReconciliation(taskPackage, "missing", "A completed same-identity continuation has no fresh immutable canonical result evidence; the initial result cannot be reused.", changeId);
  }
  if (observation.job.state === "queued" || observation.job.state === "running"
    || observation.turn.state === "queued" || observation.turn.state === "running") {
    return {
      packageId: taskPackage.id,
      currentStatus: "running",
      decision: "waiting",
      reason: "The exact referenced job/turn remains nonterminal; no replay or board transition is planned.",
    };
  }
  if (observation.job.state === "unexecuted") {
    return blockedReconciliation(taskPackage, "unexecuted", "The bound job was never executed and will not be replayed automatically.", changeId);
  }
  if (observation.turn.state === "interrupted" || observation.job.state === "aborted" || observation.turn.state === "aborted") {
    return blockedReconciliation(taskPackage, "interrupted", "The bound Agent turn was interrupted or aborted and will not be replayed automatically.", changeId);
  }
  if (observation.job.state === "failed" || observation.turn.state === "failed") {
    return blockedReconciliation(taskPackage, "failed", "The bound Agent job or turn failed.", changeId);
  }
  const outputFailure = evidenceFailure(observation.output.state);
  if (outputFailure) return blockedReconciliation(taskPackage, outputFailure, `The exact bounded Agent output is ${observation.output.state}.`, changeId);
  const historyFailure = evidenceFailure(observation.history.state);
  if (historyFailure) return blockedReconciliation(taskPackage, historyFailure, `The exact bounded Agent history is ${observation.history.state}.`, changeId);
  if (observation.output.result === "blocked") {
    return blockedReconciliation(taskPackage, "blocked", "The readable worker result reports a blocked outcome.", changeId);
  }
  if (observation.output.result === "failed") {
    return blockedReconciliation(taskPackage, "failed", "The readable worker result reports failure.", changeId);
  }
  if (observation.job.state !== "completed" || observation.turn.state !== "completed"
    || (observation.output.result !== "completed" && observation.output.result !== "partial")) {
    return blockedReconciliation(taskPackage, "missing", "Terminal Journal state lacks a readable completed or partial canonical result.", changeId);
  }
  const evidence = reconciliationEvidence(changeId, taskPackage.id, "returned", `readable-${observation.output.result}`);
  const resultEvidence = `verification:formal-result/${changeId}/${taskPackage.id}/${observation.output.digest?.slice(0, 32) ?? observation.output.result}`;
  return {
    packageId: taskPackage.id,
    currentStatus: "running",
    decision: "returned",
    reason: `The exact ${observation.output.result} result and history are readable; ROSE inspection remains required.`,
    operation: {
      kind: "transition",
      to: "returned",
      result: observation.output.result,
      evidenceReadable: true,
      resultEvidence,
      evidence,
      nextAction: "ROSE inspects the returned evidence and records disposition without treating returned as done.",
      reconciliation: { evidence },
    },
  };
}

/**
 * Build a bounded, non-mutating restart plan from one explicit current formal
 * snapshot and exact Journal/hub observations. Settlement alone never writes
 * the board, redispatches, closes a Join, accepts evidence, or advances phase.
 */
export function planFormalRuntimeReconciliation(
  lifecycle: FormalLifecycleSnapshot,
  observations: readonly FormalRuntimeReconciliationObservation[],
): FormalRuntimeReconciliationPlan {
  const preparation = prepareFormalLifecycle(lifecycle);
  if (!preparation.ok) {
    return {
      status: "blocked",
      taskIdentity: lifecycle.taskIdentity,
      decisions: [],
      events: [],
      joins: [],
      authority: reconciliationAuthority(),
      diagnostics: preparation.diagnostics,
    };
  }
  const prepared = preparation.value;
  const diagnostics: FormalOrchestrationDiagnostic[] = [];
  const byPackage = new Map<string, FormalRuntimeReconciliationObservation>();
  const packageIds = new Set(prepared.board.packages.map((taskPackage) => taskPackage.id));
  if (!Array.isArray(observations)) {
    diagnostics.push(diagnostic("RECONCILIATION_OBSERVATIONS_INVALID", "Runtime reconciliation observations must be an explicit bounded array."));
  } else if (observations.length > prepared.board.packages.length) {
    diagnostics.push(diagnostic("RECONCILIATION_OBSERVATIONS_INVALID", "Runtime reconciliation observations exceed the current board package bound."));
  } else {
    for (const observation of observations as readonly unknown[]) {
      if (!isFormalRuntimeReconciliationObservation(observation)) {
        diagnostics.push(diagnostic("RECONCILIATION_OBSERVATION_INVALID", "A Runtime reconciliation observation is malformed."));
        continue;
      }
      const candidate = observation;
      if (!packageIds.has(candidate.packageId)) {
        diagnostics.push(diagnostic("RECONCILIATION_PACKAGE_UNKNOWN", "A Runtime observation does not bind to the exact current board.", candidate.packageId));
        continue;
      }
      if (byPackage.has(candidate.packageId)) {
        diagnostics.push(diagnostic("RECONCILIATION_OBSERVATION_DUPLICATE", "A package has more than one current Runtime observation.", candidate.packageId));
        continue;
      }
      byPackage.set(candidate.packageId, candidate);
    }
  }

  if (diagnostics.length > 0) {
    return {
      status: "blocked",
      taskIdentity: lifecycle.taskIdentity,
      decisions: [],
      events: [],
      joins: [],
      authority: reconciliationAuthority(),
      diagnostics,
    };
  }

  const decisions = prepared.board.packages.map((taskPackage): FormalRuntimeReconciliationDecision => {
    const status = packageStatus(taskPackage);
    const observation = byPackage.get(taskPackage.id);
    if (status === "done" || status === "cancelled") {
      if (observation?.agent?.released
        || observation?.output.state === "stale"
        || observation?.output.state === "missing"
        || observation?.output.state === "unreadable"
        || observation?.history.state === "stale"
        || observation?.history.state === "missing"
        || observation?.history.state === "unreadable") {
        diagnostics.push(diagnostic("TERMINAL_EVIDENCE_GAP", "Released, stale, missing, or unreadable historical evidence is visible without reopening the terminal package.", taskPackage.id));
      }
      return { packageId: taskPackage.id, currentStatus: status, decision: "preserve", reason: "Done and cancelled packages remain terminal." };
    }
    if (status !== "running") {
      return { packageId: taskPackage.id, currentStatus: status, decision: "preserve", reason: "Reconciliation does not infer a new transition for this current board state." };
    }
    return reconcileRunningPackage(taskPackage, observation, lifecycle.taskIdentity);
  });

  const joins = [...new Set(prepared.board.packages
    .filter((taskPackage) => packageField(taskPackage, "Execution") === "async" && JOIN_ID_PATTERN.test(packageField(taskPackage, "Join")))
    .map((taskPackage) => packageField(taskPackage, "Join")))]
    .map((joinId): FormalRuntimeReconciliationJoin => {
      const members = prepared.board.packages.filter((taskPackage) => packageField(taskPackage, "Execution") === "async"
        && packageField(taskPackage, "Join") === joinId);
      const activeMembers = members.filter((taskPackage) => packageStatus(taskPackage) !== "cancelled");
      const alreadyClosed = activeMembers.every((taskPackage) => packageEvents(prepared, taskPackage.id, "JOINED").length === 1);
      const blockedMember = activeMembers.some((taskPackage) => packageStatus(taskPackage) === "blocked"
        || decisions.find((decision) => decision.packageId === taskPackage.id)?.decision === "blocked");
      return {
        joinId,
        status: blockedMember ? "blocked" : alreadyClosed ? "closed" : "open",
        members: members.map((taskPackage) => taskPackage.id),
      };
    });

  const events = decisions.flatMap((decision): FormalRuntimeReconciliationEventPlan[] => {
    const evidence = decision.operation?.reconciliation?.evidence;
    return evidence ? [{ subject: decision.packageId, type: "RECONCILED", fields: { evidence } }] : [];
  });

  return {
    status: diagnostics.some((entry) => entry.code.startsWith("RECONCILIATION_")) ? "blocked" : "planned",
    taskIdentity: lifecycle.taskIdentity,
    decisions,
    events,
    joins,
    authority: reconciliationAuthority(),
    diagnostics,
  };
}

export interface FormalPhaseEvidence {
  finalInspection: string;
  verification: { fresh: boolean; evidence: string };
  materialDelta: { present: boolean; evidence: string };
  residualUnverified: readonly string[];
}

export interface FormalPhaseGateInput {
  lifecycle: FormalLifecycleSnapshot;
  observations: readonly FormalPackageExecutionObservation[];
  phaseEvidence: FormalPhaseEvidence;
}

export interface FormalPhaseGateResult {
  status: "eligible" | "blocked";
  taskIdentity: string;
  phase: AgentCatalogPhase;
  requiredPhase?: "DEFINE";
  guidance?: LifecycleAgentGuidanceInput;
  residualUnverified: readonly string[];
  diagnostics: readonly FormalOrchestrationDiagnostic[];
}

export function evaluateFormalPhaseGate(input: FormalPhaseGateInput): FormalPhaseGateResult {
  const preparation = prepareFormalLifecycle(input.lifecycle);
  if (!preparation.ok) {
    return {
      status: "blocked",
      taskIdentity: input.lifecycle.taskIdentity,
      phase: input.lifecycle.phase,
      residualUnverified: [],
      diagnostics: preparation.diagnostics,
    };
  }
  const prepared = preparation.value;
  const diagnostics: FormalOrchestrationDiagnostic[] = [];
  const observationResult = prepareObservations(prepared, input.observations);
  diagnostics.push(...observationResult.diagnostics);
  const boardStatus = prepared.board.headers["Board status"]?.value;
  if (boardStatus !== "active" && boardStatus !== "done") {
    diagnostics.push(diagnostic("PHASE_BOARD_BLOCKED", "A blocked or cancelled board cannot satisfy a phase completion gate.", undefined, "Board status"));
  }

  for (const taskPackage of prepared.board.packages) {
    const status = packageStatus(taskPackage);
    if (status === "cancelled") continue;
    const disposition = packageField(taskPackage, "ROSE disposition");
    if (status === "returned" && disposition === "pending") {
      diagnostics.push(diagnostic("RETURNED_DISPOSITION_PENDING", "A returned result requires ROSE inspection and disposition before the phase gate.", taskPackage.id));
    }
    if (status !== "done") {
      diagnostics.push(diagnostic("PACKAGE_NOT_DONE", "Every accepted noncancelled package must be done before phase completion.", taskPackage.id));
      continue;
    }
    const observation = observationResult.observations.get(taskPackage.id);
    if (!observation) {
      diagnostics.push(diagnostic("PHASE_EXECUTION_EVIDENCE_MISSING", "A done package requires an explicit current execution observation.", taskPackage.id));
    }
    const owner = packageField(taskPackage, "Owner");
    const dispatch = packageField(taskPackage, "Dispatch");
    if (observation) {
      if (observation.actors.includes("ROSE") && observation.actors.includes("agent")) {
        diagnostics.push(diagnostic("DUPLICATE_SCOPE", "Both ROSE and an Agent executed the same formal package scope.", taskPackage.id));
      }
      if (owner === "ROSE" || dispatch === "waived") {
        if (observation.actors.length !== 1 || observation.actors[0] !== "ROSE") {
          diagnostics.push(diagnostic("DIRECT_EXECUTION_ACTOR_INVALID", "ROSE-owned and waived packages require direct ROSE execution evidence only.", taskPackage.id));
        }
      } else if (observation.actors.length !== 1 || observation.actors[0] !== "agent") {
        diagnostics.push(diagnostic("AGENT_EXECUTION_ACTOR_INVALID", "Required Agent-owned packages require exact Agent execution evidence without duplicate direct scope.", taskPackage.id));
      }
    }
    if (owner !== "ROSE" && dispatch !== "waived") {
      if (observation) diagnostics.push(...validateAgentObservation(prepared, taskPackage, observation, "PHASE"));
    }
    if (dispatch === "waived") {
      diagnostics.push(...waiverAudit(prepared, taskPackage, observation, true).diagnostics);
    }
    if (packageField(taskPackage, "Execution") === "async" && packageEvents(prepared, taskPackage.id, "JOINED").length !== 1) {
      diagnostics.push(diagnostic("PHASE_JOIN_OPEN", "Every async member requires a closed inspected Join before phase completion.", taskPackage.id));
    }
  }

  if (!input.phaseEvidence || !concrete(input.phaseEvidence.finalInspection)) {
    diagnostics.push(diagnostic("PHASE_FINAL_INSPECTION_MISSING", "Phase completion requires bounded phase-appropriate final inspection evidence."));
  }
  if (!input.phaseEvidence?.verification || input.phaseEvidence.verification.fresh !== true || !concrete(input.phaseEvidence.verification.evidence)) {
    diagnostics.push(diagnostic("PHASE_FRESH_VERIFICATION_MISSING", "Phase completion requires fresh claim-matched verification evidence."));
  }
  const materialDelta = input.phaseEvidence?.materialDelta;
  if (!materialDelta || !concrete(materialDelta.evidence)) {
    diagnostics.push(diagnostic("MATERIAL_DELTA_EVIDENCE_MISSING", "Current material-delta inspection evidence is required."));
  }
  if (materialDelta?.present === true) {
    diagnostics.push(diagnostic("MATERIAL_DELTA_REQUIRES_DEFINE", "A material architecture, contract, permission, acceptance, or verification delta requires DEFINE reacceptance."));
  }
  const residual = input.phaseEvidence?.residualUnverified;
  if (!Array.isArray(residual) || residual.some((item) => !boundedText(item))) {
    diagnostics.push(diagnostic("RESIDUAL_UNVERIFIED_INVALID", "Residual Unverified items must be an explicit bounded array."));
  }
  return {
    status: diagnostics.length === 0 ? "eligible" : "blocked",
    taskIdentity: input.lifecycle.taskIdentity,
    phase: input.lifecycle.phase,
    ...(materialDelta?.present === true ? { requiredPhase: "DEFINE" as const } : {}),
    guidance: prepared.guidance,
    residualUnverified: Array.isArray(residual) ? residual : [],
    diagnostics,
  };
}
