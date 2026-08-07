import { basename } from "node:path";
import type { FormalTaskBoardRootPaths } from "./formal-task-board-root.js";
import {
  applyGuardedFormalTaskBoardPair,
  planFormalTaskBoardUpdate,
  type FormalTaskBoardDisposition,
  type FormalTaskBoardInspection,
  type FormalTaskBoardTransitionOperation,
  type FormalTaskBoardUpdateDiagnostic,
  type FormalTaskBoardUpdateHooks,
  type FormalTaskBoardUpdateOperation,
} from "./formal-task-board-update.js";

export interface FormalTaskBoardBootstrapStep {
  packageId: string;
  timestamp: string;
  operation: FormalTaskBoardUpdateOperation;
}

export interface FormalTaskBoardBootstrapReconciliationRequest {
  actor: "ROSE";
  tasksSource: string;
  progressSource: string;
  steps: readonly FormalTaskBoardBootstrapStep[];
}

export interface FormalTaskBoardObservedAfterReturnRequest {
  actor: "ROSE";
  tasksSource: string;
  progressSource: string;
  timestamp: string;
  packageId: string;
  dispatchEvidence: string;
  result: "completed" | "partial";
  resultEvidence: string;
  evidence: string;
  evidenceReadable: boolean;
  inspection: FormalTaskBoardInspection;
  verification: string;
  nextAction: string;
}

export interface FormalTaskBoardBootstrapPlanned {
  status: "planned";
  operation: "historical-reconciliation" | "observed-after-return";
  packageIds: readonly string[];
  tasksSource: string;
  progressSource: string;
  appendedProgress: string;
  eventTypes: readonly string[];
  diagnostics: readonly [];
}

export interface FormalTaskBoardBootstrapBlocked {
  status: "blocked";
  diagnostics: readonly FormalTaskBoardUpdateDiagnostic[];
}

export type FormalTaskBoardBootstrapPlanResult = FormalTaskBoardBootstrapPlanned | FormalTaskBoardBootstrapBlocked;

export interface FormalTaskBoardBootstrapApplied extends FormalTaskBoardRootPaths {
  status: "applied";
  operation: FormalTaskBoardBootstrapPlanned["operation"];
  packageIds: readonly string[];
  tasksSource: string;
  progressSource: string;
  appendedProgress: string;
  eventTypes: readonly string[];
  diagnostics: readonly FormalTaskBoardUpdateDiagnostic[];
}

export type FormalTaskBoardBootstrapApplyResult = FormalTaskBoardBootstrapApplied | FormalTaskBoardBootstrapBlocked;

const MAX_BOOTSTRAP_STEPS = 512;

function requestDiagnostic(message: string): FormalTaskBoardUpdateDiagnostic {
  return { code: "REQUEST_INVALID", message };
}

function planSteps(
  request: FormalTaskBoardBootstrapReconciliationRequest,
  operation: FormalTaskBoardBootstrapPlanned["operation"],
): FormalTaskBoardBootstrapPlanResult {
  if (!request || typeof request !== "object"
    || request.actor !== "ROSE"
    || typeof request.tasksSource !== "string"
    || typeof request.progressSource !== "string"
    || !Array.isArray(request.steps)
    || request.steps.length === 0
    || request.steps.length > MAX_BOOTSTRAP_STEPS) {
    return { status: "blocked", diagnostics: [requestDiagnostic("Bootstrap requires one bounded ROSE-owned canonical update sequence.")] };
  }

  let tasksSource = request.tasksSource;
  let progressSource = request.progressSource;
  const eventTypes: string[] = [];
  const packageIds: string[] = [];
  for (const step of request.steps) {
    if (!step || typeof step !== "object") {
      return { status: "blocked", diagnostics: [requestDiagnostic("Every bootstrap step must be one canonical update request.")] };
    }
    const planned = planFormalTaskBoardUpdate({
      actor: "ROSE",
      tasksSource,
      progressSource,
      packageId: step.packageId,
      timestamp: step.timestamp,
      operation: step.operation,
    });
    if (planned.status === "blocked") return planned;
    tasksSource = planned.tasksSource;
    progressSource = planned.progressSource;
    eventTypes.push(...planned.eventTypes);
    if (!packageIds.includes(planned.packageId)) packageIds.push(planned.packageId);
  }

  if (!progressSource.startsWith(request.progressSource)) {
    return { status: "blocked", diagnostics: [{ code: "CANDIDATE_INVALID", message: "Bootstrap did not preserve the exact progress prefix." }] };
  }
  return {
    status: "planned",
    operation,
    packageIds,
    tasksSource,
    progressSource,
    appendedProgress: progressSource.slice(request.progressSource.length),
    eventTypes,
    diagnostics: [],
  };
}

export function planFormalTaskBoardBootstrapReconciliation(
  request: FormalTaskBoardBootstrapReconciliationRequest,
): FormalTaskBoardBootstrapPlanResult {
  return planSteps(request, "historical-reconciliation");
}

function observedSteps(request: FormalTaskBoardObservedAfterReturnRequest): readonly FormalTaskBoardBootstrapStep[] {
  const start: FormalTaskBoardTransitionOperation = {
    kind: "transition",
    to: "running",
    dispatchEvidence: request.dispatchEvidence,
    nextAction: "ROSE waits for the bounded canonical result.",
  };
  const returned: FormalTaskBoardTransitionOperation = {
    kind: "transition",
    to: "returned",
    result: request.result,
    resultEvidence: request.resultEvidence,
    evidenceReadable: request.evidenceReadable,
    evidence: request.evidence,
    nextAction: "ROSE inspects the returned evidence before any completion decision.",
  };
  const done: FormalTaskBoardTransitionOperation = {
    kind: "transition",
    to: "done",
    inspection: request.inspection,
    verification: request.verification,
    nextAction: request.nextAction,
  };
  return [
    { packageId: request.packageId, timestamp: request.timestamp, operation: start },
    { packageId: request.packageId, timestamp: request.timestamp, operation: returned },
    { packageId: request.packageId, timestamp: request.timestamp, operation: done },
  ];
}

export function planFormalTaskBoardObservedAfterReturn(
  request: FormalTaskBoardObservedAfterReturnRequest,
): FormalTaskBoardBootstrapPlanResult {
  if (!request || typeof request !== "object") {
    return { status: "blocked", diagnostics: [requestDiagnostic("Observed-after-return bootstrap requires one explicit ROSE request.")] };
  }
  return planSteps({
    actor: request.actor,
    tasksSource: request.tasksSource,
    progressSource: request.progressSource,
    steps: observedSteps(request),
  }, "observed-after-return");
}

async function applyPlannedBootstrap(
  paths: FormalTaskBoardRootPaths,
  current: { actor: "ROSE"; tasksSource: string; progressSource: string },
  planned: FormalTaskBoardBootstrapPlanResult,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardBootstrapApplyResult> {
  if (planned.status === "blocked") return planned;
  const guarded = await applyGuardedFormalTaskBoardPair(paths, {
    actor: "ROSE",
    tasksSource: current.tasksSource,
    progressSource: current.progressSource,
    candidateTasksSource: planned.tasksSource,
    candidateProgressSource: planned.progressSource,
    changeId: basename(paths.rootPath),
    packageId: planned.packageIds.length === 1 ? planned.packageIds[0] : undefined,
  }, hooks);
  if (guarded.status === "blocked") return guarded;
  return {
    ...paths,
    status: "applied",
    operation: planned.operation,
    packageIds: planned.packageIds,
    tasksSource: planned.tasksSource,
    progressSource: planned.progressSource,
    appendedProgress: planned.appendedProgress,
    eventTypes: planned.eventTypes,
    diagnostics: guarded.diagnostics,
  };
}

export async function applyFormalTaskBoardBootstrapReconciliation(
  paths: FormalTaskBoardRootPaths,
  request: FormalTaskBoardBootstrapReconciliationRequest,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardBootstrapApplyResult> {
  return await applyPlannedBootstrap(paths, request, planFormalTaskBoardBootstrapReconciliation(request), hooks);
}

export async function applyFormalTaskBoardObservedAfterReturn(
  paths: FormalTaskBoardRootPaths,
  request: FormalTaskBoardObservedAfterReturnRequest,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardBootstrapApplyResult> {
  return await applyPlannedBootstrap(paths, request, planFormalTaskBoardObservedAfterReturn(request), hooks);
}

export type { FormalTaskBoardDisposition, FormalTaskBoardInspection };
