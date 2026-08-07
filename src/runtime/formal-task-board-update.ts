import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, realpath, rename, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  validateFormalTaskBoard,
  type FormalTaskBoard,
  type FormalTaskPackage,
  type FormalTaskPackageFieldName,
  type FormalTaskPackageStatus,
  type FormalTaskProgressEvent,
} from "./formal-task-board.js";
import type { FormalTaskBoardRootPaths } from "./formal-task-board-root.js";

export const FORMAL_TASK_BOARD_WAIVER_CLASSES = [
  "complete-user-provided-evidence",
  "selector-unavailable-equivalent-capability",
  "measured-dispatch-cost-exceeds-evidence-value",
] as const;

export type FormalTaskBoardWaiverClass = (typeof FORMAL_TASK_BOARD_WAIVER_CLASSES)[number];
export type FormalTaskBoardWorkerFailure =
  | "blocked"
  | "failed"
  | "interrupted"
  | "unexecuted"
  | "missing"
  | "stale"
  | "unreadable";
export type FormalTaskBoardDispositionKind =
  | "pending"
  | "accepted"
  | "partially-accepted"
  | "rejected"
  | "superseded"
  | "needs-follow-up";

export interface FormalTaskBoardDisposition {
  kind: FormalTaskBoardDispositionKind;
  detail?: string;
}

export interface FormalTaskBoardInspection {
  disposition: FormalTaskBoardDisposition;
  evidence: string;
  acceptedClaims: string;
  rejectedClaims: string;
  unverified: string;
  residualTransfer?: string;
  acceptedLimitation?: string;
}

export interface FormalTaskBoardTransitionOperation {
  kind: "transition";
  to: FormalTaskPackageStatus;
  gateEvidence?: string;
  requiredJoins?: readonly string[];
  dispatchEvidence?: string;
  result?: "completed" | "partial";
  evidenceReadable?: boolean;
  resultEvidence?: string;
  evidence?: string;
  failure?: FormalTaskBoardWorkerFailure;
  blocker?: string;
  blockerClearance?: string;
  inspection?: FormalTaskBoardInspection;
  verification?: string;
  cancellationReason?: string;
  nextAction?: string;
  reconciliation?: {
    evidence: string;
  };
}

export interface FormalTaskBoardPrepareWaiverOperation {
  kind: "prepare-waiver";
  waiverClass: FormalTaskBoardWaiverClass;
  reason: string;
  evidence: string;
  roseDecision: "ROSE";
  nextAction?: string;
}

export type FormalTaskBoardUpdateOperation =
  | FormalTaskBoardTransitionOperation
  | FormalTaskBoardPrepareWaiverOperation;

export interface FormalTaskBoardUpdateRequest {
  actor?: "ROSE";
  tasksSource: string;
  progressSource: string;
  packageId: string;
  timestamp: string;
  operation: FormalTaskBoardUpdateOperation;
}

export type FormalTaskBoardUpdateDiagnosticCode =
  | "REQUEST_INVALID"
  | "OLD_PAIR_INVALID"
  | "PACKAGE_NOT_FOUND"
  | "TIMESTAMP_INVALID"
  | "TIMESTAMP_ORDER_INVALID"
  | "VALUE_INVALID"
  | "SAME_STATE_TRANSITION"
  | "ILLEGAL_TRANSITION"
  | "DEPENDENCY_NOT_DONE"
  | "READINESS_EVIDENCE_REQUIRED"
  | "REQUIRED_JOIN_INVALID"
  | "REQUIRED_JOIN_OPEN"
  | "DISPATCH_EVIDENCE_REQUIRED"
  | "RESULT_INVALID"
  | "READABLE_EVIDENCE_REQUIRED"
  | "BLOCKER_REQUIRED"
  | "BLOCKER_CLEARANCE_REQUIRED"
  | "INSPECTION_REQUIRED"
  | "DISPOSITION_INVALID"
  | "PARTIAL_RESIDUAL_REQUIRED"
  | "VERIFICATION_REQUIRED"
  | "CANCELLATION_REASON_REQUIRED"
  | "WAIVER_OWNER_INVALID"
  | "WAIVER_STATE_INVALID"
  | "WAIVER_CLASS_INVALID"
  | "WAIVER_REASON_REQUIRED"
  | "WAIVER_EVIDENCE_REQUIRED"
  | "WAIVER_DECISION_INVALID"
  | "WAIVER_NOT_PREWORK"
  | "CANDIDATE_INVALID"
  | "PATHS_INVALID"
  | "PATH_UNSAFE"
  | "UPDATE_LOCKED"
  | "SOURCE_MISMATCH"
  | "SOURCE_RACE"
  | "WRITE_FAILED"
  | "FSYNC_FAILED"
  | "RENAME_FAILED"
  | "FINAL_PAIR_INVALID"
  | "ROLLBACK_FAILED"
  | "SCRATCH_CLEANUP_FAILED"
  | "IO_FAILURE";

export interface FormalTaskBoardUpdateDiagnostic {
  code: FormalTaskBoardUpdateDiagnosticCode;
  message: string;
  packageId?: string;
  path?: string;
  relatedCodes?: readonly string[];
}

export interface FormalTaskBoardPlannedUpdate {
  status: "planned";
  packageId: string;
  fromStatus: FormalTaskPackageStatus;
  toStatus: FormalTaskPackageStatus;
  tasksSource: string;
  progressSource: string;
  appendedProgress: string;
  eventTypes: readonly string[];
  diagnostics: readonly [];
}

export interface FormalTaskBoardBlockedUpdate {
  status: "blocked";
  packageId?: string;
  diagnostics: readonly FormalTaskBoardUpdateDiagnostic[];
}

export type FormalTaskBoardUpdatePlanResult = FormalTaskBoardPlannedUpdate | FormalTaskBoardBlockedUpdate;

export interface FormalTaskBoardAppliedUpdate extends FormalTaskBoardRootPaths {
  status: "applied";
  packageId: string;
  fromStatus: FormalTaskPackageStatus;
  toStatus: FormalTaskPackageStatus;
  tasksSource: string;
  progressSource: string;
  appendedProgress: string;
  eventTypes: readonly string[];
  diagnostics: readonly FormalTaskBoardUpdateDiagnostic[];
}

export type FormalTaskBoardApplyResult = FormalTaskBoardAppliedUpdate | FormalTaskBoardBlockedUpdate;

export interface FormalTaskBoardGuardedPairRequest {
  actor: "ROSE";
  tasksSource: string;
  progressSource: string;
  candidateTasksSource: string;
  candidateProgressSource: string;
  changeId: string;
  packageId?: string;
}

export interface FormalTaskBoardGuardedLegacyMigrationPairRequest {
  actor: "ROSE";
  tasksSource: string;
  candidateTasksSource: string;
  candidateProgressSource: string;
  changeId: string;
}

export interface FormalTaskBoardGuardedPairApplied extends FormalTaskBoardRootPaths {
  status: "applied";
  tasksSource: string;
  progressSource: string;
  diagnostics: readonly FormalTaskBoardUpdateDiagnostic[];
}

export type FormalTaskBoardGuardedPairResult = FormalTaskBoardGuardedPairApplied | FormalTaskBoardBlockedUpdate;

export interface FormalTaskBoardUpdateHooks {
  beforeWriteCandidate?: (target: "tasks" | "progress") => void | Promise<void>;
  beforeFileSync?: (target: "tasks" | "progress" | "directory") => void | Promise<void>;
  beforeRename?: (target: "tasks" | "progress") => void | Promise<void>;
  /** Internal fail-closed seam immediately before the first canonical rename. */
  beforeCommitValidation?: () => void | Promise<void>;
  /** Runtime-owned evidence CAS repeated across the canonical replacement boundary. */
  commitEvidenceValidation?: () => void | Promise<void>;
  afterRename?: (target: "tasks" | "progress") => void | Promise<void>;
  beforeFinalValidation?: () => void | Promise<void>;
}

interface PlannedEvent {
  subject: string;
  type: string;
  fields: ReadonlyArray<readonly [string, string]>;
}

interface MutablePlan {
  fields: Map<FormalTaskPackageFieldName, string>;
  events: PlannedEvent[];
  toStatus: FormalTaskPackageStatus;
}

interface OwnedFileSnapshot {
  path: string;
  bytes: Buffer;
  device: number | bigint;
  inode: number | bigint;
  mode: number;
}

interface ScratchFile {
  path: string;
  device: number | bigint;
  inode: number | bigint;
}

class ApplyFailure extends Error {
  constructor(
    readonly diagnostic: FormalTaskBoardUpdateDiagnostic,
  ) {
    super(diagnostic.message);
  }
}

const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const JOIN_ID_PATTERN = /^J-[A-Za-z0-9][A-Za-z0-9._-]{0,61}$/;
const WAIVER_CLASSES = new Set<string>(FORMAL_TASK_BOARD_WAIVER_CLASSES);
const PORTABLE_EVIDENCE_PATTERN = /^(requirement|decision|risk|artifact|verification|task):(?=[^,`\r\n]*\S)[^,`\r\n]{1,1024}$/;
const MAX_VALUE_CHARS = 2_048;
const ALLOWED_EDGES = new Set([
  "pending>ready",
  "ready>running",
  "running>returned",
  "running>done",
  "running>blocked",
  "returned>done",
  "returned>blocked",
  "blocked>pending",
  "blocked>ready",
]);

function diagnostic(
  code: FormalTaskBoardUpdateDiagnosticCode,
  message: string,
  packageId?: string,
  relatedCodes?: readonly string[],
): FormalTaskBoardUpdateDiagnostic {
  return { code, message, packageId, relatedCodes };
}

function blocked(...diagnostics: FormalTaskBoardUpdateDiagnostic[]): FormalTaskBoardBlockedUpdate {
  return { status: "blocked", packageId: diagnostics[0]?.packageId, diagnostics };
}

function fieldValue(taskPackage: FormalTaskPackage, name: FormalTaskPackageFieldName): string {
  return taskPackage.fields[name]?.value ?? "";
}

function concrete(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0
    && value.length <= MAX_VALUE_CHARS
    && !/[\r\n\0`]/.test(value)
    && !/^(?:pending|none|n\/a|tbd|unverified|-)(?:$|\s|:|—)/.test(normalized);
}

function boundedValue(value: unknown, allowNone = false): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_CHARS || /[\r\n\0`]/.test(value)) return false;
  return allowNone || concrete(value);
}

function isRfc3339(timestamp: string): boolean {
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && !Number.isNaN(Date.parse(timestamp));
}

function portableEvidence(value: unknown): value is string {
  return concrete(value)
    && value.split(/[;,]/).map((part) => part.trim()).filter(Boolean)
      .every((part) => PORTABLE_EVIDENCE_PATTERN.test(part));
}

function formatDisposition(disposition: FormalTaskBoardDisposition): string | undefined {
  if (!disposition || typeof disposition !== "object") return undefined;
  const kinds = new Set<FormalTaskBoardDispositionKind>([
    "pending",
    "accepted",
    "partially-accepted",
    "rejected",
    "superseded",
    "needs-follow-up",
  ]);
  if (!kinds.has(disposition.kind)) return undefined;
  if (disposition.detail !== undefined && !boundedValue(disposition.detail)) return undefined;
  return disposition.kind;
}

function progressField(event: FormalTaskProgressEvent, key: string): string | undefined {
  return event.fields.find((field) => field.key === key)?.value;
}

function packageEvents(events: readonly FormalTaskProgressEvent[], packageId: string): FormalTaskProgressEvent[] {
  return events.filter((event) => event.subject === packageId);
}

function joinIsClosed(board: FormalTaskBoard, events: readonly FormalTaskProgressEvent[], joinId: string): boolean {
  const members = board.packages.filter((candidate) => fieldValue(candidate, "Execution") === "async" && fieldValue(candidate, "Join") === joinId);
  if (members.length === 0) return false;
  return members.every((member) => {
    if (fieldValue(member, "Status") === "cancelled") return true;
    return packageEvents(events, member.id).some((event) => event.type === "JOINED"
      && progressField(event, "disposition") !== undefined
      && progressField(event, "disposition") !== "pending"
      && (concrete(progressField(event, "evidence")) || concrete(progressField(event, "blocker"))));
  });
}

function requireInspection(
  operation: FormalTaskBoardTransitionOperation,
  taskPackage: FormalTaskPackage,
  allowed: readonly FormalTaskBoardDispositionKind[],
): FormalTaskBoardUpdateDiagnostic | undefined {
  const inspection = operation.inspection;
  if (!inspection) return diagnostic("INSPECTION_REQUIRED", "The transition requires a bounded ROSE inspection.", taskPackage.id);
  const disposition = formatDisposition(inspection.disposition);
  if (!disposition || !allowed.includes(inspection.disposition.kind)) {
    return diagnostic("DISPOSITION_INVALID", "The requested disposition cannot close this transition.", taskPackage.id);
  }
  if (!portableEvidence(inspection.evidence)
    || !boundedValue(inspection.acceptedClaims, true)
    || !boundedValue(inspection.rejectedClaims, true)
    || !boundedValue(inspection.unverified, true)) {
    return diagnostic("INSPECTION_REQUIRED", "Inspection evidence and bounded claim sets are required.", taskPackage.id);
  }
  if (inspection.disposition.kind === "partially-accepted") {
    const residual = inspection.residualTransfer;
    const limitation = inspection.acceptedLimitation;
    const residualNamesPackage = concrete(residual)
      && taskPackage.id !== residual
      && operation.kind === "transition";
    if (!residualNamesPackage && !concrete(limitation)) {
      return diagnostic("PARTIAL_RESIDUAL_REQUIRED", "Partial acceptance requires a named residual transfer or accepted bounded limitation.", taskPackage.id);
    }
  }
  return undefined;
}

function inspectionFields(inspection: FormalTaskBoardInspection): Array<readonly [string, string]> {
  return [
    ["disposition", formatDisposition(inspection.disposition)!],
    ["evidence", inspection.evidence],
  ];
}

function updateNextAction(plan: MutablePlan, operation: { nextAction?: string }, packageId: string): FormalTaskBoardUpdateDiagnostic | undefined {
  if (operation.nextAction === undefined) return undefined;
  if (!concrete(operation.nextAction)) return diagnostic("VALUE_INVALID", "Next action must be one bounded concrete line.", packageId);
  plan.fields.set("Next action", operation.nextAction);
  return undefined;
}

function planReadiness(
  board: FormalTaskBoard,
  events: readonly FormalTaskProgressEvent[],
  taskPackage: FormalTaskPackage,
  from: FormalTaskPackageStatus,
  operation: FormalTaskBoardTransitionOperation,
  plan: MutablePlan,
): FormalTaskBoardUpdateDiagnostic | undefined {
  if (!portableEvidence(operation.gateEvidence)) {
    return diagnostic("READINESS_EVIDENCE_REQUIRED", "pending or blocked to ready requires current portable gate evidence.", taskPackage.id);
  }
  for (const dependencyId of taskPackage.dependencies) {
    const dependency = board.packages.find((candidate) => candidate.id === dependencyId);
    if (!dependency || fieldValue(dependency, "Status") !== "done") {
      return diagnostic("DEPENDENCY_NOT_DONE", "Every dependency must currently be done before readiness.", taskPackage.id);
    }
    const dependencyJoin = fieldValue(dependency, "Execution") === "async" ? fieldValue(dependency, "Join") : undefined;
    if (dependencyJoin && !joinIsClosed(board, events, dependencyJoin)) {
      return diagnostic("REQUIRED_JOIN_OPEN", "An asynchronous dependency join is still open.", taskPackage.id);
    }
  }
  if (operation.requiredJoins !== undefined) {
    if (!Array.isArray(operation.requiredJoins) || operation.requiredJoins.length > 512) {
      return diagnostic("REQUIRED_JOIN_INVALID", "Required joins must be a bounded list of stable join IDs.", taskPackage.id);
    }
    const unique = new Set<string>();
    for (const joinId of operation.requiredJoins) {
      if (typeof joinId !== "string" || !JOIN_ID_PATTERN.test(joinId) || unique.has(joinId)) {
        return diagnostic("REQUIRED_JOIN_INVALID", "Required joins must be unique stable join IDs.", taskPackage.id);
      }
      unique.add(joinId);
      if (!joinIsClosed(board, events, joinId)) {
        return diagnostic("REQUIRED_JOIN_OPEN", "A caller-declared current-gate join is still open.", taskPackage.id);
      }
    }
  }
  if (from === "blocked") {
    if (!portableEvidence(operation.blockerClearance)) {
      return diagnostic("BLOCKER_CLEARANCE_REQUIRED", "blocked to ready requires portable blocker-clearance evidence.", taskPackage.id);
    }
    plan.fields.set("Blocker", "none");
    if (fieldValue(taskPackage, "Dispatch") === "required") plan.fields.set("Dispatch evidence", "pending");
    plan.fields.set("Result evidence", "pending");
    plan.fields.set("Evidence", "pending");
    plan.fields.set("ROSE disposition", "pending");
    plan.events.push({
      subject: taskPackage.id,
      type: "UNBLOCKED",
      fields: [["evidence", operation.blockerClearance]],
    });
  }
  plan.fields.set("Status", "ready");
  plan.toStatus = "ready";
  plan.events.push({
    subject: taskPackage.id,
    type: "READY",
    fields: [["evidence", operation.gateEvidence]],
  });
  return undefined;
}

function planStart(
  taskPackage: FormalTaskPackage,
  operation: FormalTaskBoardTransitionOperation,
  plan: MutablePlan,
): FormalTaskBoardUpdateDiagnostic | undefined {
  const owner = fieldValue(taskPackage, "Owner");
  const dispatch = fieldValue(taskPackage, "Dispatch");
  plan.fields.set("Status", "running");
  plan.toStatus = "running";
  if (owner.startsWith("agent:") && dispatch === "required") {
    if (!portableEvidence(operation.dispatchEvidence)) {
      return diagnostic("DISPATCH_EVIDENCE_REQUIRED", "Agent dispatch requires a portable dispatch evidence anchor.", taskPackage.id);
    }
    plan.fields.set("Dispatch evidence", operation.dispatchEvidence);
    plan.events.push({
      subject: taskPackage.id,
      type: "DISPATCHED",
      fields: [["evidence", operation.dispatchEvidence]],
    });
    return undefined;
  }
  if (owner === "ROSE" || (owner.startsWith("agent:") && dispatch === "waived")) {
    plan.events.push({
      subject: taskPackage.id,
      type: "READY",
      fields: [["next_action", operation.nextAction ?? fieldValue(taskPackage, "Next action")]],
    });
    return undefined;
  }
  return diagnostic("ILLEGAL_TRANSITION", "The package ownership and dispatch mode cannot start execution.", taskPackage.id);
}

function planReturn(
  taskPackage: FormalTaskPackage,
  operation: FormalTaskBoardTransitionOperation,
  plan: MutablePlan,
): FormalTaskBoardUpdateDiagnostic | undefined {
  if (!fieldValue(taskPackage, "Owner").startsWith("agent:") || fieldValue(taskPackage, "Dispatch") !== "required") {
    return diagnostic("ILLEGAL_TRANSITION", "Only a required Agent package can enter returned.", taskPackage.id);
  }
  if (operation.result !== "completed" && operation.result !== "partial") {
    return diagnostic("RESULT_INVALID", "returned requires a completed or partial canonical Agent result.", taskPackage.id);
  }
  if (operation.evidenceReadable !== true
    || !portableEvidence(operation.resultEvidence)
    || !portableEvidence(operation.evidence)) {
    return diagnostic("READABLE_EVIDENCE_REQUIRED", "returned requires readable portable result and actual evidence anchors.", taskPackage.id);
  }
  plan.fields.set("Status", "returned");
  plan.fields.set("Result evidence", operation.resultEvidence);
  plan.fields.set("Evidence", operation.evidence);
  plan.fields.set("ROSE disposition", "pending");
  plan.fields.set("Blocker", "none");
  plan.toStatus = "returned";
  plan.events.push({
    subject: taskPackage.id,
    type: "RETURNED",
    fields: [["evidence", operation.resultEvidence]],
  });
  if (operation.reconciliation) {
    plan.events.push({
      subject: taskPackage.id,
      type: "RECONCILED",
      fields: [["evidence", operation.reconciliation.evidence]],
    });
  }
  return undefined;
}

function planCompletion(
  board: FormalTaskBoard,
  taskPackage: FormalTaskPackage,
  from: FormalTaskPackageStatus,
  operation: FormalTaskBoardTransitionOperation,
  plan: MutablePlan,
): FormalTaskBoardUpdateDiagnostic | undefined {
  const owner = fieldValue(taskPackage, "Owner");
  const dispatch = fieldValue(taskPackage, "Dispatch");
  if (from === "running" && owner !== "ROSE" && dispatch !== "waived") {
    return diagnostic("ILLEGAL_TRANSITION", "Required Agent work must return before ROSE can complete it.", taskPackage.id);
  }
  if (from === "returned" && (!owner.startsWith("agent:") || dispatch !== "required")) {
    return diagnostic("ILLEGAL_TRANSITION", "Only returned required Agent work can use returned to done.", taskPackage.id);
  }
  const inspectionDiagnostic = requireInspection(operation, taskPackage, ["accepted", "partially-accepted"]);
  if (inspectionDiagnostic) return inspectionDiagnostic;
  if (!portableEvidence(operation.verification)) {
    return diagnostic("VERIFICATION_REQUIRED", "done requires fresh portable claim-matched verification evidence selected by ROSE.", taskPackage.id);
  }
  const inspection = operation.inspection!;
  if (inspection.residualTransfer !== undefined
    && !board.packages.some((candidate) => candidate.id === inspection.residualTransfer && candidate.id !== taskPackage.id)) {
    return diagnostic("PARTIAL_RESIDUAL_REQUIRED", "Residual transfer must name another current package.", taskPackage.id);
  }
  plan.fields.set("Status", "done");
  plan.fields.set("Evidence", inspection.evidence);
  plan.fields.set("ROSE disposition", formatDisposition(inspection.disposition)!);
  plan.fields.set("Blocker", "none");
  plan.toStatus = "done";
  plan.events.push({ subject: taskPackage.id, type: "INSPECTED", fields: inspectionFields(inspection) });
  if (fieldValue(taskPackage, "Execution") === "async") {
    const joinFields: Array<readonly [string, string]> = [
      ["disposition", formatDisposition(inspection.disposition)!],
      ["evidence", inspection.evidence],
    ];
    plan.events.push({ subject: taskPackage.id, type: "JOINED", fields: joinFields });
  }
  plan.events.push({ subject: taskPackage.id, type: "DONE", fields: [["verification", operation.verification]] });
  return undefined;
}

function planBlock(
  taskPackage: FormalTaskPackage,
  from: FormalTaskPackageStatus,
  operation: FormalTaskBoardTransitionOperation,
  plan: MutablePlan,
): FormalTaskBoardUpdateDiagnostic | undefined {
  if (!concrete(operation.blocker) || !concrete(operation.nextAction)) {
    return diagnostic("BLOCKER_REQUIRED", "blocked requires a concrete blocker and next action.", taskPackage.id);
  }
  if (from === "running" && operation.failure === undefined) {
    return diagnostic("RESULT_INVALID", "running to blocked requires an explicit bounded worker/runtime failure class.", taskPackage.id);
  }
  if (from === "returned") {
    const inspectionDiagnostic = requireInspection(operation, taskPackage, ["rejected", "needs-follow-up"]);
    if (inspectionDiagnostic) return inspectionDiagnostic;
  }
  if (fieldValue(taskPackage, "Execution") === "async" && !operation.inspection && !operation.reconciliation) {
    return diagnostic("INSPECTION_REQUIRED", "A settled async blocker requires ROSE inspection and disposition before JOINED.", taskPackage.id);
  }
  if (operation.inspection) {
    const inspectionDiagnostic = requireInspection(operation, taskPackage, ["rejected", "needs-follow-up"]);
    if (inspectionDiagnostic) return inspectionDiagnostic;
  }
  plan.fields.set("Status", "blocked");
  plan.fields.set("Blocker", operation.blocker);
  plan.fields.set("Next action", operation.nextAction);
  if (operation.evidence !== undefined) {
    if (!portableEvidence(operation.evidence)) return diagnostic("VALUE_INVALID", "Blocked evidence must use portable evidence anchors.", taskPackage.id);
    plan.fields.set("Evidence", operation.evidence);
  }
  if (operation.inspection) {
    plan.fields.set("Evidence", operation.inspection.evidence);
    plan.fields.set("ROSE disposition", formatDisposition(operation.inspection.disposition)!);
  } else {
    plan.fields.set("ROSE disposition", "pending");
  }
  plan.toStatus = "blocked";
  const blockedEvent: PlannedEvent = {
    subject: taskPackage.id,
    type: "BLOCKED",
    fields: [
      ["blocker", operation.blocker],
      ["next_action", operation.nextAction],
    ],
  };
  if (from === "running") plan.events.push(blockedEvent);
  if (from === "running" && operation.reconciliation) {
    plan.events.push({
      subject: taskPackage.id,
      type: "RECONCILED",
      fields: [["evidence", operation.reconciliation.evidence]],
    });
  }
  if (operation.inspection) {
    plan.events.push({ subject: taskPackage.id, type: "INSPECTED", fields: inspectionFields(operation.inspection) });
    if (fieldValue(taskPackage, "Execution") === "async") {
      plan.events.push({
        subject: taskPackage.id,
        type: "JOINED",
        fields: [
          ["disposition", formatDisposition(operation.inspection.disposition)!],
          ["blocker", operation.blocker],
        ],
      });
    }
  }
  if (from === "returned") plan.events.push(blockedEvent);
  return undefined;
}

function planUnblockPending(
  taskPackage: FormalTaskPackage,
  operation: FormalTaskBoardTransitionOperation,
  plan: MutablePlan,
): FormalTaskBoardUpdateDiagnostic | undefined {
  if (!portableEvidence(operation.blockerClearance)) {
    return diagnostic("BLOCKER_CLEARANCE_REQUIRED", "blocked to pending requires portable blocker-clearance evidence.", taskPackage.id);
  }
  plan.fields.set("Status", "pending");
  if (fieldValue(taskPackage, "Dispatch") === "required") plan.fields.set("Dispatch evidence", "pending");
  plan.fields.set("Result evidence", "pending");
  plan.fields.set("Evidence", "pending");
  plan.fields.set("ROSE disposition", "pending");
  plan.fields.set("Blocker", "none");
  plan.toStatus = "pending";
  plan.events.push({
    subject: taskPackage.id,
    type: "UNBLOCKED",
    fields: [["evidence", operation.blockerClearance]],
  });
  return undefined;
}

function planCancellation(
  taskPackage: FormalTaskPackage,
  operation: FormalTaskBoardTransitionOperation,
  plan: MutablePlan,
): FormalTaskBoardUpdateDiagnostic | undefined {
  if (!concrete(operation.cancellationReason)) {
    return diagnostic("CANCELLATION_REASON_REQUIRED", "Cancellation requires a concrete bounded ROSE reason.", taskPackage.id);
  }
  if (operation.inspection) {
    const inspectionDiagnostic = requireInspection(operation, taskPackage, ["rejected", "superseded", "needs-follow-up"]);
    if (inspectionDiagnostic) return inspectionDiagnostic;
    plan.fields.set("Evidence", operation.inspection.evidence);
    plan.fields.set("ROSE disposition", formatDisposition(operation.inspection.disposition)!);
    plan.events.push({ subject: taskPackage.id, type: "INSPECTED", fields: inspectionFields(operation.inspection) });
  }
  plan.fields.set("Status", "cancelled");
  plan.toStatus = "cancelled";
  plan.events.push({
    subject: taskPackage.id,
    type: "CANCELLED",
    fields: [
      ["blocker", operation.cancellationReason],
      ["next_action", operation.nextAction ?? fieldValue(taskPackage, "Next action")],
    ],
  });
  return undefined;
}

function planTransition(
  board: FormalTaskBoard,
  events: readonly FormalTaskProgressEvent[],
  taskPackage: FormalTaskPackage,
  operation: FormalTaskBoardTransitionOperation,
): MutablePlan | FormalTaskBoardUpdateDiagnostic {
  const from = fieldValue(taskPackage, "Status") as FormalTaskPackageStatus;
  const to = operation.to;
  if (operation.reconciliation !== undefined) {
    if (from !== "running" || (to !== "returned" && to !== "blocked")
      || !operation.reconciliation || !portableEvidence(operation.reconciliation.evidence)) {
      return diagnostic("ILLEGAL_TRANSITION", "Reconciliation authority is limited to running-to-returned or running-to-blocked with portable evidence.", taskPackage.id);
    }
  }
  if (from === to) return diagnostic("SAME_STATE_TRANSITION", "A same-state edit cannot manufacture transition evidence.", taskPackage.id);
  if (from === "done" || from === "cancelled") {
    return diagnostic("ILLEGAL_TRANSITION", "done and cancelled package IDs are terminal and cannot reopen.", taskPackage.id);
  }
  const cancellation = to === "cancelled";
  if (!cancellation && !ALLOWED_EDGES.has(`${from}>${to}`)) {
    return diagnostic("ILLEGAL_TRANSITION", "The requested edge is outside the accepted seven-state graph.", taskPackage.id);
  }
  const plan: MutablePlan = { fields: new Map(), events: [], toStatus: to };
  let failure: FormalTaskBoardUpdateDiagnostic | undefined;
  if (cancellation) failure = planCancellation(taskPackage, operation, plan);
  else if (to === "ready") failure = planReadiness(board, events, taskPackage, from, operation, plan);
  else if (from === "ready" && to === "running") failure = planStart(taskPackage, operation, plan);
  else if (from === "running" && to === "returned") failure = planReturn(taskPackage, operation, plan);
  else if (to === "done") failure = planCompletion(board, taskPackage, from, operation, plan);
  else if (to === "blocked") failure = planBlock(taskPackage, from, operation, plan);
  else if (from === "blocked" && to === "pending") failure = planUnblockPending(taskPackage, operation, plan);
  if (failure) return failure;
  const nextActionDiagnostic = updateNextAction(plan, operation, taskPackage.id);
  return nextActionDiagnostic ?? plan;
}

function planWaiver(
  events: readonly FormalTaskProgressEvent[],
  taskPackage: FormalTaskPackage,
  operation: FormalTaskBoardPrepareWaiverOperation,
): MutablePlan | FormalTaskBoardUpdateDiagnostic {
  const status = fieldValue(taskPackage, "Status") as FormalTaskPackageStatus;
  const owner = fieldValue(taskPackage, "Owner");
  if (!owner.startsWith("agent:")) return diagnostic("WAIVER_OWNER_INVALID", "Only an Agent-owned package can receive a dispatch waiver.", taskPackage.id);
  if (status !== "pending" && status !== "ready") {
    return diagnostic("WAIVER_STATE_INVALID", "A waiver must be recorded while work is still pending or ready.", taskPackage.id);
  }
  if (!WAIVER_CLASSES.has(operation.waiverClass)) {
    return diagnostic("WAIVER_CLASS_INVALID", "The waiver class is outside the accepted closed set.", taskPackage.id);
  }
  if (!concrete(operation.reason)) return diagnostic("WAIVER_REASON_REQUIRED", "A waiver requires a concrete no-dispatch reason.", taskPackage.id);
  if (!portableEvidence(operation.evidence)) return diagnostic("WAIVER_EVIDENCE_REQUIRED", "A waiver requires current portable Dispatch evidence.", taskPackage.id);
  if (operation.roseDecision !== "ROSE") return diagnostic("WAIVER_DECISION_INVALID", "Only an explicit ROSE waiver decision is accepted.", taskPackage.id);
  const existingEvents = packageEvents(events, taskPackage.id);
  if (fieldValue(taskPackage, "Dispatch") !== "required"
    || fieldValue(taskPackage, "Dispatch evidence") !== "pending"
    || existingEvents.some((event) => ["DISPATCHED", "RETURNED", "INSPECTED", "DONE", "BLOCKED", "WAIVED"].includes(event.type))) {
    return diagnostic("WAIVER_NOT_PREWORK", "Waiver preparation cannot follow dispatch, execution, settlement, inspection, or an earlier waiver.", taskPackage.id);
  }
  const plan: MutablePlan = { fields: new Map(), events: [], toStatus: status };
  const waiverClassEvidence = `decision:waiver/${operation.waiverClass}`;
  const waiverEvidence = operation.evidence.split(/[;,]/).map((part) => part.trim()).includes(waiverClassEvidence)
    ? operation.evidence
    : `${operation.evidence},${waiverClassEvidence}`;
  plan.fields.set("Dispatch", "waived");
  plan.fields.set("No-dispatch reason", operation.reason);
  plan.fields.set("Execution", "direct");
  plan.fields.set("Join", "N/A");
  plan.fields.set("Dispatch evidence", waiverEvidence);
  plan.events.push({
    subject: taskPackage.id,
    type: "WAIVED",
    fields: [["evidence", waiverEvidence]],
  });
  const nextActionDiagnostic = updateNextAction(plan, operation, taskPackage.id);
  return nextActionDiagnostic ?? plan;
}

function sourceLines(source: string): Array<{ body: string; ending: string }> {
  if (source.length === 0) return [];
  const result: Array<{ body: string; ending: string }> = [];
  let start = 0;
  while (start < source.length) {
    const newline = source.indexOf("\n", start);
    const end = newline === -1 ? source.length : newline;
    const carriage = end > start && source[end - 1] === "\r";
    result.push({
      body: source.slice(start, carriage ? end - 1 : end),
      ending: newline === -1 ? "" : carriage ? "\r\n" : "\n",
    });
    if (newline === -1) break;
    start = newline + 1;
  }
  return result;
}

function renderTasksSource(source: string, taskPackage: FormalTaskPackage, plan: MutablePlan): string | undefined {
  const lines = sourceLines(source);
  const packageLine = lines[taskPackage.line - 1];
  if (!packageLine) return undefined;
  packageLine.body = packageLine.body.replace(/^- \[[ x]\]/, `- [${plan.toStatus === "done" ? "x" : " "}]`);
  for (const [name, value] of plan.fields) {
    if (!boundedValue(value, value === "none" || value === "pending" || value === "direct" || value === "N/A")) return undefined;
    const lineNumber = taskPackage.fields[name]?.line;
    if (lineNumber === undefined || !lines[lineNumber - 1]) return undefined;
    lines[lineNumber - 1]!.body = `  - ${name}: \`${value}\``;
  }
  return lines.map((line) => `${line.body}${line.ending}`).join("");
}

function renderEvent(timestamp: string, event: PlannedEvent): string | undefined {
  if ((event.subject !== "BOARD" && !PACKAGE_ID_PATTERN.test(event.subject)) || event.fields.length === 0) return undefined;
  const keys = new Set<string>();
  const lines = [`[${timestamp}] ${event.subject} ${event.type}`];
  for (const [key, value] of event.fields) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key) || keys.has(key) || !boundedValue(value, true)) return undefined;
    keys.add(key);
    lines.push(`${key}=${value}`);
  }
  return lines.join("\n");
}

function appendEvents(progressSource: string, timestamp: string, events: readonly PlannedEvent[]): { source: string; appended: string } | undefined {
  const blocks: string[] = [];
  for (const event of events) {
    const rendered = renderEvent(timestamp, event);
    if (!rendered) return undefined;
    blocks.push(rendered);
  }
  const separator = progressSource.length === 0
    ? ""
    : progressSource.endsWith("\n\n")
      ? ""
      : progressSource.endsWith("\n")
        ? "\n"
        : "\n\n";
  const appended = `${separator}${blocks.join("\n\n")}\n`;
  return { source: `${progressSource}${appended}`, appended };
}

function validationCodes(diagnostics: readonly { code: string }[]): string[] {
  return [...new Set(diagnostics.map((entry) => entry.code))].slice(0, 32);
}

export function planFormalTaskBoardUpdate(request: FormalTaskBoardUpdateRequest): FormalTaskBoardUpdatePlanResult {
  try {
    if (!request || typeof request !== "object"
      || request.actor !== "ROSE"
      || typeof request.tasksSource !== "string"
      || typeof request.progressSource !== "string"
      || typeof request.packageId !== "string"
      || !PACKAGE_ID_PATTERN.test(request.packageId)
      || !request.operation
      || typeof request.operation !== "object") {
      return blocked(diagnostic("REQUEST_INVALID", "The update request does not match the bounded internal contract."));
    }
    if (typeof request.timestamp !== "string" || !isRfc3339(request.timestamp)) {
      return blocked(diagnostic("TIMESTAMP_INVALID", "The update timestamp must be a real RFC 3339 instant.", request.packageId));
    }
    const oldValidation = validateFormalTaskBoard(request.tasksSource, request.progressSource);
    if (!oldValidation.valid || !oldValidation.board || !oldValidation.progress) {
      return blocked(diagnostic(
        "OLD_PAIR_INVALID",
        "The exact caller-supplied current pair failed package-2.1 validation.",
        request.packageId,
        validationCodes(oldValidation.diagnostics),
      ));
    }
    const lastTimestamp = oldValidation.progress.events.at(-1)?.timestamp;
    if (lastTimestamp !== undefined && Date.parse(request.timestamp) < Date.parse(lastTimestamp)) {
      return blocked(diagnostic("TIMESTAMP_ORDER_INVALID", "The update timestamp would move append-only history backwards.", request.packageId));
    }
    const taskPackage = oldValidation.board.packages.find((candidate) => candidate.id === request.packageId);
    if (!taskPackage) return blocked(diagnostic("PACKAGE_NOT_FOUND", "The selected package ID does not exist exactly once.", request.packageId));
    const fromStatus = fieldValue(taskPackage, "Status") as FormalTaskPackageStatus;
    const planned = request.operation.kind === "prepare-waiver"
      ? planWaiver(oldValidation.progress.events, taskPackage, request.operation)
      : request.operation.kind === "transition"
        ? planTransition(oldValidation.board, oldValidation.progress.events, taskPackage, request.operation)
        : diagnostic("REQUEST_INVALID", "The update operation kind is not supported.", request.packageId);
    if ("code" in planned) return blocked(planned);
    const tasksSource = renderTasksSource(request.tasksSource, taskPackage, planned);
    const progress = appendEvents(request.progressSource, request.timestamp, planned.events);
    if (!tasksSource || !progress || planned.events.length === 0) {
      return blocked(diagnostic("VALUE_INVALID", "The requested field or event value cannot be represented by the bounded v1 grammar.", request.packageId));
    }
    if (!progress.source.startsWith(request.progressSource)) {
      return blocked(diagnostic("CANDIDATE_INVALID", "The candidate progress source did not preserve the exact old prefix.", request.packageId));
    }
    const candidateValidation = validateFormalTaskBoard(tasksSource, progress.source);
    if (!candidateValidation.valid) {
      return blocked(diagnostic(
        "CANDIDATE_INVALID",
        "The planned pair failed package-2.1 validation and was not applied.",
        request.packageId,
        validationCodes(candidateValidation.diagnostics),
      ));
    }
    return {
      status: "planned",
      packageId: request.packageId,
      fromStatus,
      toStatus: planned.toStatus,
      tasksSource,
      progressSource: progress.source,
      appendedProgress: progress.appended,
      eventTypes: planned.events.map((event) => event.type),
      diagnostics: [],
    };
  } catch {
    return blocked(diagnostic("REQUEST_INVALID", "The update request could not be planned without mutation."));
  }
}

function isInside(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

async function assertDirectory(path: string, repositoryRoot: string): Promise<void> {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new ApplyFailure({ code: "PATH_UNSAFE", message: "A required update directory is not an ordinary directory.", path });
  }
  const canonical = await realpath(path);
  if (canonical !== path || !isInside(repositoryRoot, canonical)) {
    throw new ApplyFailure({ code: "PATH_UNSAFE", message: "A required update directory is non-canonical or outside the repository.", path });
  }
}

async function inspectPaths(paths: FormalTaskBoardRootPaths, changeId: string): Promise<void> {
  const ordinaryChangeId = typeof changeId === "string"
    && changeId.length > 0
    && changeId === changeId.trim()
    && Buffer.byteLength(changeId, "utf8") <= 255
    && changeId !== "."
    && changeId !== ".."
    && !changeId.includes("/")
    && !changeId.includes("\\")
    && !changeId.includes("\0")
    && !isAbsolute(changeId);
  if (!paths || typeof paths !== "object"
    || !isAbsolute(paths.repositoryRoot)
    || paths.repositoryRoot !== resolve(paths.repositoryRoot)
    || !ordinaryChangeId) {
    throw new ApplyFailure({ code: "PATHS_INVALID", message: "Caller-supplied root paths are not exact absolute package-2.2 paths." });
  }
  const expectedRoot = resolve(paths.repositoryRoot, "openspec", "changes", changeId);
  if (paths.rootPath !== expectedRoot
    || paths.tasksPath !== resolve(expectedRoot, "formal-task-board.md")
    || paths.progressPath !== resolve(expectedRoot, "progress.txt")
    || paths.tasksPath === paths.progressPath) {
    throw new ApplyFailure({ code: "PATHS_INVALID", message: "Caller-supplied owned paths do not match the exact formal change root." });
  }
  for (const directory of [
    paths.repositoryRoot,
    resolve(paths.repositoryRoot, "openspec"),
    resolve(paths.repositoryRoot, "openspec", "changes"),
    paths.rootPath,
  ]) {
    await assertDirectory(directory, paths.repositoryRoot);
  }
}

async function readOwnedFile(path: string, repositoryRoot: string): Promise<OwnedFileSnapshot> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new ApplyFailure({ code: "PATH_UNSAFE", message: "An owned update path is not an ordinary file.", path });
    const bytes = await handle.readFile();
    const current = await lstat(path);
    const canonical = await realpath(path);
    if (current.isSymbolicLink()
      || !current.isFile()
      || current.dev !== metadata.dev
      || current.ino !== metadata.ino
      || canonical !== path
      || !isInside(repositoryRoot, canonical)) {
      throw new ApplyFailure({ code: "SOURCE_RACE", message: "An owned path changed identity while it was read.", path });
    }
    return { path, bytes, device: metadata.dev, inode: metadata.ino, mode: metadata.mode };
  } finally {
    await handle?.close();
  }
}

function sameIdentity(left: OwnedFileSnapshot | ScratchFile, right: OwnedFileSnapshot | ScratchFile): boolean {
  return left.device === right.device && left.inode === right.inode;
}

async function verifyCurrent(snapshot: OwnedFileSnapshot, expectedBytes: Buffer, repositoryRoot: string): Promise<OwnedFileSnapshot> {
  const current = await readOwnedFile(snapshot.path, repositoryRoot);
  if (!sameIdentity(snapshot, current) || !current.bytes.equals(expectedBytes)) {
    throw new ApplyFailure({ code: "SOURCE_RACE", message: "The exact current pair changed before replacement.", path: snapshot.path });
  }
  return current;
}

async function verifyAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
    throw new ApplyFailure({ code: "SOURCE_RACE", message: "An owned path expected to be absent now exists.", path });
  } catch (error) {
    if (error instanceof ApplyFailure) throw error;
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") {
      throw new ApplyFailure({ code: "IO_FAILURE", message: "An absent owned path could not be inspected safely.", path });
    }
  }
}

async function stageFile(
  rootPath: string,
  label: string,
  bytes: Buffer,
  mode: number,
  hookTarget?: "tasks" | "progress",
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<ScratchFile> {
  const path = resolve(rootPath, `.aili-formal-update-${label}-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  let identity: ScratchFile | undefined;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const metadata = await handle.stat();
    identity = { path, device: metadata.dev, inode: metadata.ino };
    if (hookTarget) {
      try {
        await hooks?.beforeWriteCandidate?.(hookTarget);
      } catch {
        throw new ApplyFailure({ code: "WRITE_FAILED", message: `Injected ${hookTarget} candidate write failure.`, path });
      }
    }
    await handle.writeFile(bytes);
    await handle.chmod(mode & 0o777);
    if (hookTarget) {
      try {
        await hooks?.beforeFileSync?.(hookTarget);
      } catch {
        throw new ApplyFailure({ code: "FSYNC_FAILED", message: `Injected ${hookTarget} fsync failure.`, path });
      }
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    return identity;
  } catch (error) {
    try {
      await handle?.close();
    } catch {
      // The primary write/fsync failure remains authoritative; guarded cleanup follows.
    }
    if (identity) await removeScratch(identity);
    if (error instanceof ApplyFailure) throw error;
    throw new ApplyFailure({ code: "WRITE_FAILED", message: "A guarded candidate file could not be staged.", path });
  }
}

async function acquireUpdateLock(rootPath: string): Promise<ScratchFile> {
  const path = resolve(rootPath, ".aili-formal-update.lock");
  let handle: FileHandle | undefined;
  let identity: ScratchFile | undefined;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const metadata = await handle.stat();
    identity = { path, device: metadata.dev, inode: metadata.ino };
    await handle.writeFile(`${process.pid}:${randomUUID()}\n`, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    return identity;
  } catch (error) {
    try {
      await handle?.close();
    } catch {
      // The acquisition diagnostic remains authoritative.
    }
    if (identity) await removeScratch(identity);
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    throw new ApplyFailure({
      code: code === "EEXIST" ? "UPDATE_LOCKED" : "IO_FAILURE",
      message: code === "EEXIST"
        ? "Another guarded update currently owns the exact formal root."
        : "The guarded update lock could not be acquired.",
      path,
    });
  }
}

async function removeScratch(scratch: ScratchFile): Promise<boolean> {
  try {
    const metadata = await lstat(scratch.path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.dev !== scratch.device || metadata.ino !== scratch.inode) return false;
    await unlink(scratch.path);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

async function syncDirectory(rootPath: string, hooks?: FormalTaskBoardUpdateHooks): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    try {
      await hooks?.beforeFileSync?.("directory");
    } catch {
      throw new ApplyFailure({ code: "FSYNC_FAILED", message: "Injected directory fsync failure.", path: rootPath });
    }
    handle = await open(rootPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    await handle.sync();
  } catch (error) {
    if (error instanceof ApplyFailure) throw error;
    throw new ApplyFailure({ code: "FSYNC_FAILED", message: "The formal root directory could not be synchronized.", path: rootPath });
  } finally {
    await handle?.close();
  }
}

async function installedSnapshot(path: string, expected: Buffer, repositoryRoot: string): Promise<OwnedFileSnapshot> {
  const snapshot = await readOwnedFile(path, repositoryRoot);
  if (!snapshot.bytes.equals(expected)) {
    throw new ApplyFailure({ code: "SOURCE_RACE", message: "A replaced owned path did not retain the exact candidate bytes.", path });
  }
  return snapshot;
}

async function beforeCandidateRename(
  target: "tasks" | "progress",
  targetPath: string,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<void> {
  try {
    await hooks?.beforeRename?.(target);
  } catch {
    throw new ApplyFailure({ code: "RENAME_FAILED", message: `Injected ${target} replacement failure.`, path: targetPath });
  }
}

async function replaceCandidate(target: "tasks" | "progress", scratch: ScratchFile, targetPath: string): Promise<void> {
  try {
    await rename(scratch.path, targetPath);
  } catch {
    throw new ApplyFailure({ code: "RENAME_FAILED", message: `Atomic ${target} replacement failed.`, path: targetPath });
  }
}

async function installAbsentCandidate(scratch: ScratchFile, targetPath: string): Promise<void> {
  try {
    await link(scratch.path, targetPath);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    throw new ApplyFailure({
      code: code === "EEXIST" ? "SOURCE_RACE" : "RENAME_FAILED",
      message: code === "EEXIST"
        ? "The absent progress path was created concurrently and was not overwritten."
        : "Atomic progress installation at the absent owned path failed.",
      path: targetPath,
    });
  }
}

async function afterCandidateRename(
  target: "tasks" | "progress",
  targetPath: string,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<void> {
  try {
    await hooks?.afterRename?.(target);
  } catch {
    throw new ApplyFailure({ code: "RENAME_FAILED", message: `Injected post-${target}-replacement failure.`, path: targetPath });
  }
}

async function validateCommitEvidence(
  stage: "before-tasks" | "after-tasks" | "before-progress" | "after-progress" | "before-complete",
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<void> {
  try {
    await hooks?.commitEvidenceValidation?.();
  } catch {
    throw new ApplyFailure({
      code: "FINAL_PAIR_INVALID",
      message: `Guarded reconciliation evidence changed at ${stage}.`,
    });
  }
}

async function rollbackOne(
  installed: OwnedFileSnapshot | undefined,
  rollback: ScratchFile,
  original: OwnedFileSnapshot,
  repositoryRoot: string,
): Promise<boolean> {
  if (!installed) return true;
  try {
    const current = await readOwnedFile(original.path, repositoryRoot);
    if (!sameIdentity(installed, current) || !current.bytes.equals(installed.bytes)) return false;
    await rename(rollback.path, original.path);
    const restored = await readOwnedFile(original.path, repositoryRoot);
    return restored.bytes.equals(original.bytes);
  } catch {
    return false;
  }
}

async function rollbackAbsent(
  installed: OwnedFileSnapshot | undefined,
  candidateBytes: Buffer,
  repositoryRoot: string,
  path: string,
): Promise<boolean> {
  if (!installed) return true;
  try {
    const current = await readOwnedFile(path, repositoryRoot);
    if (!sameIdentity(installed, current) || !current.bytes.equals(candidateBytes)) return false;
    await unlink(path);
    await verifyAbsent(path);
    return true;
  } catch {
    return false;
  }
}

async function cleanupScratch(files: readonly ScratchFile[]): Promise<boolean> {
  const results = await Promise.all(files.map(async (file) => await removeScratch(file)));
  return results.every(Boolean);
}

async function applyGuardedFormalTaskBoardPairInternal(
  paths: FormalTaskBoardRootPaths,
  request: FormalTaskBoardGuardedPairRequest | FormalTaskBoardGuardedLegacyMigrationPairRequest,
  progressWasAbsent: boolean,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardGuardedPairResult> {
  const currentProgressSource = !progressWasAbsent && request && typeof request === "object" && "progressSource" in request
    ? request.progressSource
    : undefined;
  const packageId = request && typeof request === "object" && "packageId" in request ? request.packageId : undefined;
  let scratch: ScratchFile[] = [];
  let originalTasks: OwnedFileSnapshot | undefined;
  let originalProgress: OwnedFileSnapshot | undefined;
  let rollbackTasks: ScratchFile | undefined;
  let rollbackProgress: ScratchFile | undefined;
  let installedTasks: OwnedFileSnapshot | undefined;
  let installedProgress: OwnedFileSnapshot | undefined;
  try {
    if (!request || typeof request !== "object"
      || request.actor !== "ROSE"
      || typeof request.tasksSource !== "string"
      || (!progressWasAbsent && typeof currentProgressSource !== "string")
      || typeof request.candidateTasksSource !== "string"
      || typeof request.candidateProgressSource !== "string"
      || typeof request.changeId !== "string") {
      return blocked(diagnostic("REQUEST_INVALID", "The guarded pair request does not match the bounded internal contract."));
    }
    if (currentProgressSource !== undefined && !request.candidateProgressSource.startsWith(currentProgressSource)) {
      return blocked(diagnostic("CANDIDATE_INVALID", "The guarded candidate did not preserve the exact old progress prefix.", packageId));
    }
    const candidateValidation = validateFormalTaskBoard(request.candidateTasksSource, request.candidateProgressSource);
    if (!candidateValidation.valid) {
      return blocked(diagnostic(
        "CANDIDATE_INVALID",
        "The guarded candidate pair failed validation before filesystem mutation.",
        packageId,
        validationCodes(candidateValidation.diagnostics),
      ));
    }
    await inspectPaths(paths, request.changeId);
    const updateLock = await acquireUpdateLock(paths.rootPath);
    scratch.push(updateLock);
    originalTasks = await readOwnedFile(paths.tasksPath, paths.repositoryRoot);
    if (progressWasAbsent) await verifyAbsent(paths.progressPath);
    else originalProgress = await readOwnedFile(paths.progressPath, paths.repositoryRoot);
    if (!originalTasks.bytes.equals(Buffer.from(request.tasksSource, "utf8"))
      || (originalProgress && !originalProgress.bytes.equals(Buffer.from(currentProgressSource!, "utf8")))) {
      throw new ApplyFailure(diagnostic("SOURCE_MISMATCH", "Disk bytes do not match the caller-supplied exact current pair.", packageId));
    }
    const candidateTasks = Buffer.from(request.candidateTasksSource, "utf8");
    const candidateProgress = Buffer.from(request.candidateProgressSource, "utf8");
    const stagedTasks = await stageFile(paths.rootPath, "tasks-candidate", candidateTasks, originalTasks.mode, "tasks", hooks);
    scratch.push(stagedTasks);
    const stagedProgress = await stageFile(paths.rootPath, "progress-candidate", candidateProgress, originalProgress?.mode ?? 0o600, "progress", hooks);
    scratch.push(stagedProgress);
    rollbackTasks = await stageFile(paths.rootPath, "tasks-rollback", originalTasks.bytes, originalTasks.mode);
    scratch.push(rollbackTasks);
    if (originalProgress) {
      rollbackProgress = await stageFile(paths.rootPath, "progress-rollback", originalProgress.bytes, originalProgress.mode);
      scratch.push(rollbackProgress);
    }

    try {
      await hooks?.beforeCommitValidation?.();
    } catch {
      throw new ApplyFailure({ code: "FINAL_PAIR_INVALID", message: "Guarded pre-commit revalidation failed before canonical mutation." });
    }

    await beforeCandidateRename("tasks", paths.tasksPath, hooks);
    await validateCommitEvidence("before-tasks", hooks);
    await verifyCurrent(originalTasks, originalTasks.bytes, paths.repositoryRoot);
    if (originalProgress) await verifyCurrent(originalProgress, originalProgress.bytes, paths.repositoryRoot);
    else await verifyAbsent(paths.progressPath);
    await replaceCandidate("tasks", stagedTasks, paths.tasksPath);
    installedTasks = {
      path: paths.tasksPath,
      bytes: candidateTasks,
      device: stagedTasks.device,
      inode: stagedTasks.inode,
      mode: originalTasks.mode,
    };
    installedTasks = await installedSnapshot(paths.tasksPath, candidateTasks, paths.repositoryRoot);
    await afterCandidateRename("tasks", paths.tasksPath, hooks);
    await validateCommitEvidence("after-tasks", hooks);
    await beforeCandidateRename("progress", paths.progressPath, hooks);
    await validateCommitEvidence("before-progress", hooks);
    await installedSnapshot(paths.tasksPath, candidateTasks, paths.repositoryRoot);
    if (originalProgress) {
      await verifyCurrent(originalProgress, originalProgress.bytes, paths.repositoryRoot);
      await replaceCandidate("progress", stagedProgress, paths.progressPath);
    } else {
      await verifyAbsent(paths.progressPath);
      await installAbsentCandidate(stagedProgress, paths.progressPath);
    }
    installedProgress = {
      path: paths.progressPath,
      bytes: candidateProgress,
      device: stagedProgress.device,
      inode: stagedProgress.inode,
      mode: originalProgress?.mode ?? 0o600,
    };
    installedProgress = await installedSnapshot(paths.progressPath, candidateProgress, paths.repositoryRoot);
    await afterCandidateRename("progress", paths.progressPath, hooks);
    await validateCommitEvidence("after-progress", hooks);
    await syncDirectory(paths.rootPath, hooks);
    try {
      await hooks?.beforeFinalValidation?.();
    } catch {
      throw new ApplyFailure({ code: "FINAL_PAIR_INVALID", message: "Injected final-pair validation failure." });
    }
    const [finalTasks, finalProgress] = await Promise.all([
      installedSnapshot(paths.tasksPath, candidateTasks, paths.repositoryRoot),
      installedSnapshot(paths.progressPath, candidateProgress, paths.repositoryRoot),
    ]);
    const finalValidation = validateFormalTaskBoard(finalTasks.bytes.toString("utf8"), finalProgress.bytes.toString("utf8"));
    if (!finalValidation.valid
      || (originalProgress && !finalProgress.bytes.subarray(0, originalProgress.bytes.length).equals(originalProgress.bytes))) {
      throw new ApplyFailure({
        code: "FINAL_PAIR_INVALID",
        message: "The final pair failed validation or append-only prefix verification.",
        relatedCodes: validationCodes(finalValidation.diagnostics),
      });
    }
    await validateCommitEvidence("before-complete", hooks);
    const cleanupOk = await cleanupScratch(scratch);
    scratch = [];
    return {
      ...paths,
      status: "applied",
      tasksSource: request.candidateTasksSource,
      progressSource: request.candidateProgressSource,
      diagnostics: cleanupOk
        ? []
        : [diagnostic("SCRATCH_CLEANUP_FAILED", "The valid final pair was retained, but guarded scratch cleanup was incomplete.", packageId)],
    };
  } catch (error) {
    const primary = error instanceof ApplyFailure
      ? error.diagnostic
      : diagnostic("IO_FAILURE", "The guarded update failed without a completion claim.", packageId);
    const rollbackDiagnostics: FormalTaskBoardUpdateDiagnostic[] = [];
    if (originalTasks && rollbackTasks) {
      const progressRestored = progressWasAbsent
        ? await rollbackAbsent(installedProgress, Buffer.from(request.candidateProgressSource, "utf8"), paths.repositoryRoot, paths.progressPath)
        : originalProgress && rollbackProgress
          ? await rollbackOne(installedProgress, rollbackProgress, originalProgress, paths.repositoryRoot)
          : false;
      const tasksRestored = await rollbackOne(installedTasks, rollbackTasks, originalTasks, paths.repositoryRoot);
      if (!progressRestored || !tasksRestored) {
        rollbackDiagnostics.push(diagnostic("ROLLBACK_FAILED", "The updater could not prove exact rollback of every path it replaced.", packageId));
      } else if (installedTasks || installedProgress) {
        try {
          await syncDirectory(paths.rootPath);
        } catch {
          rollbackDiagnostics.push(diagnostic("ROLLBACK_FAILED", "Restored bytes could not be durably synchronized.", packageId));
        }
      }
    }
    const cleanupOk = await cleanupScratch(scratch);
    if (!cleanupOk) rollbackDiagnostics.push(diagnostic("SCRATCH_CLEANUP_FAILED", "Operation-created scratch could not be fully removed.", packageId));
    return blocked(primary, ...rollbackDiagnostics);
  }
}

export async function applyGuardedFormalTaskBoardPair(
  paths: FormalTaskBoardRootPaths,
  request: FormalTaskBoardGuardedPairRequest,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardGuardedPairResult> {
  return await applyGuardedFormalTaskBoardPairInternal(paths, request, false, hooks);
}

export async function applyGuardedFormalTaskBoardLegacyMigrationPair(
  paths: FormalTaskBoardRootPaths,
  request: FormalTaskBoardGuardedLegacyMigrationPairRequest,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardGuardedPairResult> {
  return await applyGuardedFormalTaskBoardPairInternal(paths, request, true, hooks);
}

export async function applyFormalTaskBoardUpdate(
  paths: FormalTaskBoardRootPaths,
  request: FormalTaskBoardUpdateRequest,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardApplyResult> {
  const planned = planFormalTaskBoardUpdate(request);
  if (planned.status === "blocked") return planned;
  const oldValidation = validateFormalTaskBoard(request.tasksSource, request.progressSource);
  const changeId = oldValidation.board?.headers["Task identity"]?.value;
  if (!changeId) {
    return blocked(diagnostic("OLD_PAIR_INVALID", "The exact formal identity is unavailable from the current pair.", request.packageId));
  }
  const applied = await applyGuardedFormalTaskBoardPair(paths, {
    actor: "ROSE",
    tasksSource: request.tasksSource,
    progressSource: request.progressSource,
    candidateTasksSource: planned.tasksSource,
    candidateProgressSource: planned.progressSource,
    changeId,
    packageId: request.packageId,
  }, hooks);
  if (applied.status === "blocked") return applied;
  return {
    ...paths,
    status: "applied",
    packageId: planned.packageId,
    fromStatus: planned.fromStatus,
    toStatus: planned.toStatus,
    tasksSource: planned.tasksSource,
    progressSource: planned.progressSource,
    appendedProgress: planned.appendedProgress,
    eventTypes: planned.eventTypes,
    diagnostics: applied.diagnostics,
  };
}
