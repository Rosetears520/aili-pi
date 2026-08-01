import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { isAbsolute, win32 } from "node:path";
import { parseFormalTaskBoard, validateFormalTaskBoard } from "./formal-task-board.js";
import {
  resolveFormalTaskBoardRoot,
  type FormalTaskBoardRootPaths,
} from "./formal-task-board-root.js";
import {
  applyGuardedFormalTaskBoardLegacyMigrationPair,
  applyGuardedFormalTaskBoardPair,
  type FormalTaskBoardUpdateDiagnostic,
  type FormalTaskBoardUpdateHooks,
} from "./formal-task-board-update.js";

export const FORMAL_TASK_BOARD_LEGACY_MIGRATION = "legacy-opt-in/v1" as const;

export type FormalTaskBoardLegacyMigrationPhase = "IDEATE" | "DEFINE" | "BUILD" | "SHIP";

export interface FormalTaskBoardLegacyOptIn {
  changeId: string;
  userDecisionRef: string;
  timestamp: string;
  phase: FormalTaskBoardLegacyMigrationPhase;
  goal: string;
  acceptedContract: string;
  acceptedVerification: string;
}

export interface FormalTaskBoardLegacyMigrationPlanRequest extends FormalTaskBoardLegacyOptIn {
  tasksSource: string;
  progressSource?: string;
}

export interface FormalTaskBoardLegacyMigrationApplyRequest extends FormalTaskBoardLegacyOptIn {
  repositoryRoot: string;
}

export type FormalTaskBoardLegacyMigrationDiagnosticCode =
  | "REQUEST_INVALID"
  | "EXPLICIT_OPT_IN_REQUIRED"
  | "CHANGE_ID_INVALID"
  | "TIMESTAMP_INVALID"
  | "LEGACY_SOURCE_REQUIRED"
  | "LEGACY_PROGRESS_NOT_EMPTY"
  | "LEGACY_CHECKLIST_REQUIRED"
  | "LEGACY_CHECKLIST_UNREPRESENTABLE"
  | "LEGACY_PACKAGE_ID_INVALID"
  | "LEGACY_PACKAGE_ID_DUPLICATE"
  | "CANDIDATE_INVALID"
  | "EXACT_ROOT_INVALID"
  | "LEGACY_TASKS_MISSING"
  | "SOURCE_READ_FAILED"
  | FormalTaskBoardUpdateDiagnostic["code"];

export interface FormalTaskBoardLegacyMigrationDiagnostic {
  code: FormalTaskBoardLegacyMigrationDiagnosticCode;
  message: string;
  packageId?: string;
  path?: string;
  relatedCodes?: readonly string[];
}

interface LegacyPackage {
  id: string;
  title: string;
  checked: boolean;
}

export interface FormalTaskBoardLegacyMigrationPlanned {
  status: "planned";
  changeId: string;
  packageIds: readonly string[];
  checkedPackageIds: readonly string[];
  legacyTasksSha256: string;
  legacyProgressState: "absent" | "empty";
  tasksSource: string;
  progressSource: string;
  eventTypes: readonly string[];
  diagnostics: readonly [];
}

export interface FormalTaskBoardLegacyMigrationBlocked {
  status: "blocked";
  diagnostics: readonly FormalTaskBoardLegacyMigrationDiagnostic[];
}

export type FormalTaskBoardLegacyMigrationPlanResult =
  | FormalTaskBoardLegacyMigrationPlanned
  | FormalTaskBoardLegacyMigrationBlocked;

export interface FormalTaskBoardLegacyMigrationApplied extends FormalTaskBoardRootPaths {
  status: "applied";
  changeId: string;
  packageIds: readonly string[];
  checkedPackageIds: readonly string[];
  legacyTasksSha256: string;
  legacyProgressState: "absent" | "empty";
  tasksSource: string;
  progressSource: string;
  eventTypes: readonly string[];
  diagnostics: readonly FormalTaskBoardLegacyMigrationDiagnostic[];
}

export type FormalTaskBoardLegacyMigrationApplyResult =
  | FormalTaskBoardLegacyMigrationApplied
  | FormalTaskBoardLegacyMigrationBlocked;

const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_SOURCE_CHARS = 1_000_000;
const MAX_SOURCE_LINES = 20_000;
const MAX_LINE_CHARS = 4_096;
const MAX_VALUE_CHARS = 2_048;
const MAX_TITLE_CHARS = 256;
const MAX_PACKAGES = 512;

function diagnostic(
  code: FormalTaskBoardLegacyMigrationDiagnosticCode,
  message: string,
  packageId?: string,
  relatedCodes?: readonly string[],
): FormalTaskBoardLegacyMigrationDiagnostic {
  return { code, message, packageId, relatedCodes };
}

function blocked(...diagnostics: FormalTaskBoardLegacyMigrationDiagnostic[]): FormalTaskBoardLegacyMigrationBlocked {
  return { status: "blocked", diagnostics };
}

function bounded(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_VALUE_CHARS || /[\r\n\0`]/.test(value)) return false;
  return !/^(?:pending|none|n\/a|tbd|unverified|-)(?:$|\s|:|—)/i.test(value.trim());
}

function ordinaryChangeId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value === value.trim()
    && Buffer.byteLength(value, "utf8") <= 255
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && !value.includes("\\")
    && !value.includes("\0")
    && !isAbsolute(value)
    && !win32.isAbsolute(value);
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

function parseLegacyPackages(source: string): LegacyPackage[] | FormalTaskBoardLegacyMigrationBlocked {
  if (source.length > MAX_SOURCE_CHARS) {
    return blocked(diagnostic("LEGACY_CHECKLIST_UNREPRESENTABLE", "The legacy task source exceeds the bounded migration size."));
  }
  const lines = source.split("\n").map((line) => line.endsWith("\r") ? line.slice(0, -1) : line);
  if (lines.length > MAX_SOURCE_LINES || lines.some((line) => line.length > MAX_LINE_CHARS)) {
    return blocked(diagnostic("LEGACY_CHECKLIST_UNREPRESENTABLE", "The legacy checklist exceeds a bounded line limit."));
  }
  const packages: LegacyPackage[] = [];
  const ids = new Set<string>();
  for (const line of lines) {
    if (!/^\s*-\s+\[[^\]]*\]/.test(line)) continue;
    const match = line.match(/^- \[([^\]]*)\]\s+(\S+)\s+(.+)$/);
    if (!match || (match[1] !== " " && match[1] !== "x" && match[1] !== "X")) {
      return blocked(diagnostic(
        "LEGACY_CHECKLIST_UNREPRESENTABLE",
        "Every legacy checklist row must be one top-level unchecked or checked OpenSpec item.",
      ));
    }
    const id = match[2]!;
    const title = match[3]!.replace(/^(?:—|-)\s+/, "").trim();
    if (!PACKAGE_ID_PATTERN.test(id)) {
      return blocked(diagnostic("LEGACY_PACKAGE_ID_INVALID", "A legacy package ID cannot be represented by the stable v1 grammar.", id));
    }
    if (ids.has(id)) {
      return blocked(diagnostic("LEGACY_PACKAGE_ID_DUPLICATE", "A legacy package ID appears more than once.", id));
    }
    if (title.length === 0 || title.length > MAX_TITLE_CHARS || /[\r\n\0]/.test(title)) {
      return blocked(diagnostic("LEGACY_CHECKLIST_UNREPRESENTABLE", "A legacy package title cannot be represented by the bounded v1 grammar.", id));
    }
    if (packages.length >= MAX_PACKAGES) {
      return blocked(diagnostic("LEGACY_CHECKLIST_UNREPRESENTABLE", "The legacy checklist exceeds the bounded package count."));
    }
    ids.add(id);
    packages.push({ id, title, checked: match[1] !== " " });
  }
  return packages.length > 0
    ? packages
    : blocked(diagnostic("LEGACY_CHECKLIST_REQUIRED", "The exact legacy task source contains no representable OpenSpec checklist items."));
}

function packageEvidence(changeId: string, packageId: string, digest: string): string {
  return `artifact:legacy-migration/${changeId}/${packageId}/${digest}`;
}

function decisionEvidence(userDecisionRef: string): string {
  return `decision:legacy-opt-in/${createHash("sha256").update(userDecisionRef).digest("hex")}`;
}

function renderPackage(taskPackage: LegacyPackage, changeId: string, digest: string, phase: FormalTaskBoardLegacyMigrationPhase): string {
  const done = taskPackage.checked;
  const owner = done ? "ROSE" : "agent:aili.implementer";
  return [
    `- [${done ? "x" : " "}] ${taskPackage.id} — ${taskPackage.title}`,
    `  - Phase: \`${phase}\``,
    "  - Package kind: `task-execution`",
    `  - Source refs: \`task:${taskPackage.id}\``,
    `  - Accepted task IDs: \`${taskPackage.id}\``,
    `  - Status: \`${done ? "done" : "pending"}\``,
    `  - Owner: \`${owner}\``,
    `  - Dispatch: \`${done ? "forbidden" : "required"}\``,
    `  - Dispatch reason: \`${done ? "The exact legacy opt-in preserves a previously checked item without dispatch." : "The migrated implementation item remains assigned to the exact Specialized implementer."}\``,
    "  - No-dispatch reason: `N/A`",
    `  - Execution: \`${done ? "direct" : "sync"}\``,
    `  - Join: \`${done ? "N/A" : "immediate"}\``,
    "  - Depends on: `none`",
    `  - Decision gate: \`${done ? "accepted" : "N/A"}\``,
    "  - Final test-plan gate: `accepted`",
    `  - Implementation authorization: \`${done ? "granted" : "absent"}\``,
    "  - Operation permissions: `N/A`",
    "  - Scope: `Preserve and continue only this explicitly migrated legacy checklist item.`",
    "  - Forbidden scope: `No inferred dependency, authority, permission, external write, Git, publish, or release grant.`",
    "  - Expected result: `The migrated package retains its prior checklist state under the v1 contract.`",
    `  - Expected evidence: \`verification:legacy-migration/${changeId}/${taskPackage.id}\``,
    "  - Acceptance: `ROSE confirms the migrated state against the exact legacy source digest.`",
    "  - Dispatch evidence: `pending`",
    "  - Result evidence: `pending`",
    `  - Evidence: \`${done ? packageEvidence(changeId, taskPackage.id, digest) : "pending"}\``,
    `  - ROSE disposition: \`${done ? "accepted" : "pending"}\``,
    "  - Blocker: `none`",
    `  - Next action: \`${done ? "Preserve terminal migrated history; use a new package ID for new scope." : "ROSE confirms the migrated package contract and current gates before readiness."}\``,
  ].join("\n");
}

function renderEvent(timestamp: string, subject: string, type: string, fields: ReadonlyArray<readonly [string, string]>): string {
  return [`[${timestamp}] ${subject} ${type}`, ...fields.map(([key, value]) => `${key}=${value}`)].join("\n");
}

function validationCodes(diagnostics: readonly { code: string }[]): string[] {
  return [...new Set(diagnostics.map((entry) => entry.code))].slice(0, 32);
}

export function planFormalTaskBoardLegacyMigration(
  request: FormalTaskBoardLegacyMigrationPlanRequest,
): FormalTaskBoardLegacyMigrationPlanResult {
  try {
    if (!request || typeof request !== "object" || typeof request.tasksSource !== "string") {
      return blocked(diagnostic("REQUEST_INVALID", "The legacy migration request does not match the bounded internal contract."));
    }
    if (!ordinaryChangeId(request.changeId)) {
      return blocked(diagnostic("CHANGE_ID_INVALID", "The explicit legacy opt-in must name one ordinary exact change ID."));
    }
    if (!bounded(request.userDecisionRef)) {
      return blocked(diagnostic("EXPLICIT_OPT_IN_REQUIRED", "One concrete bounded user-decision reference is required for this exact change."));
    }
    if (typeof request.timestamp !== "string" || !isRfc3339(request.timestamp)) {
      return blocked(diagnostic("TIMESTAMP_INVALID", "The migration timestamp must be one real RFC 3339 instant."));
    }
    if (!new Set<FormalTaskBoardLegacyMigrationPhase>(["IDEATE", "DEFINE", "BUILD", "SHIP"]).has(request.phase)
      || !bounded(request.goal)
      || !bounded(request.acceptedContract)
      || !bounded(request.acceptedVerification)) {
      return blocked(diagnostic("REQUEST_INVALID", "Formal headers must be concrete bounded values under one lifecycle phase."));
    }
    const parsed = parseFormalTaskBoard(request.tasksSource);
    if (parsed.classification !== "legacy/unmanaged") {
      return blocked(diagnostic(
        "LEGACY_SOURCE_REQUIRED",
        "Only an unmarked legacy/unmanaged checklist can use the explicit migration operation.",
        undefined,
        validationCodes(parsed.diagnostics),
      ));
    }
    if (request.progressSource !== undefined && request.progressSource !== "") {
      return blocked(diagnostic("LEGACY_PROGRESS_NOT_EMPTY", "Non-empty unmanaged progress cannot be rewritten or discarded by the v1 migration."));
    }
    const legacyPackages = parseLegacyPackages(request.tasksSource);
    if (!Array.isArray(legacyPackages)) return legacyPackages;
    const digest = createHash("sha256").update(request.tasksSource).digest("hex");
    const migrationDecision = decisionEvidence(request.userDecisionRef);
    const tasksSource = [
      "# Task Board",
      "",
      "- Protocol: `aili-task-board/v1`",
      "- Task kind: `formal`",
      `- Task identity: \`${request.changeId}\``,
      `- Goal: \`${request.goal}\``,
      `- Phase: \`${request.phase}\``,
      "- Board status: `active`",
      `- Accepted contract: \`${request.acceptedContract}\``,
      `- Accepted verification: \`${request.acceptedVerification}\``,
      "- Decision owner: `ROSE`",
      "- Verification owner: `ROSE`",
      "",
      "## Migrated packages",
      "",
      legacyPackages.map((taskPackage) => renderPackage(taskPackage, request.changeId, digest, request.phase)).join("\n\n"),
      "",
    ].join("\n");
    const events = [
      renderEvent(request.timestamp, "BOARD", "BOARD_CREATED", [
        ["evidence", `${migrationDecision},artifact:legacy-source/${request.changeId}/${digest}`],
      ]),
      ...legacyPackages.flatMap((taskPackage) => taskPackage.checked
        ? [
            renderEvent(request.timestamp, taskPackage.id, "READY", [
              ["evidence", migrationDecision],
            ]),
            renderEvent(request.timestamp, taskPackage.id, "INSPECTED", [
              ["disposition", "accepted"],
              ["evidence", packageEvidence(request.changeId, taskPackage.id, digest)],
            ]),
            renderEvent(request.timestamp, taskPackage.id, "DONE", [
              ["verification", `verification:legacy-checkmark/${request.changeId}/${taskPackage.id}/${digest}`],
            ]),
          ]
        : []),
    ];
    const progressSource = `${events.join("\n\n")}\n`;
    const candidate = validateFormalTaskBoard(tasksSource, progressSource);
    if (!candidate.valid) {
      return blocked(diagnostic(
        "CANDIDATE_INVALID",
        "The explicit legacy migration candidate failed strict v1 validation.",
        undefined,
        validationCodes(candidate.diagnostics),
      ));
    }
    return {
      status: "planned",
      changeId: request.changeId,
      packageIds: legacyPackages.map((taskPackage) => taskPackage.id),
      checkedPackageIds: legacyPackages.filter((taskPackage) => taskPackage.checked).map((taskPackage) => taskPackage.id),
      legacyTasksSha256: digest,
      legacyProgressState: request.progressSource === undefined ? "absent" : "empty",
      tasksSource,
      progressSource,
      eventTypes: ["BOARD_CREATED", ...legacyPackages.flatMap((taskPackage) => taskPackage.checked ? ["READY", "INSPECTED", "DONE"] : [])],
      diagnostics: [],
    };
  } catch {
    return blocked(diagnostic("REQUEST_INVALID", "The legacy migration could not be planned without mutation."));
  }
}

async function readExactSource(path: string, optional: boolean): Promise<string | undefined> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error("Owned migration path is not an ordinary file.");
    return await handle.readFile({ encoding: "utf8" });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (optional && code === "ENOENT") return undefined;
    throw error;
  } finally {
    await handle?.close();
  }
}

function exactPaths(
  resolution: Awaited<ReturnType<typeof resolveFormalTaskBoardRoot>>,
): FormalTaskBoardRootPaths | undefined {
  if (!resolution.rootPath || !resolution.tasksPath || !resolution.progressPath) return undefined;
  return {
    repositoryRoot: resolution.repositoryRoot,
    rootPath: resolution.rootPath,
    tasksPath: resolution.tasksPath,
    progressPath: resolution.progressPath,
  };
}

export async function applyFormalTaskBoardLegacyMigration(
  request: FormalTaskBoardLegacyMigrationApplyRequest,
  hooks?: FormalTaskBoardUpdateHooks,
): Promise<FormalTaskBoardLegacyMigrationApplyResult> {
  if (!request || typeof request !== "object" || typeof request.repositoryRoot !== "string" || request.repositoryRoot.length === 0) {
    return blocked(diagnostic("REQUEST_INVALID", "The exact migration apply request requires one repository root."));
  }
  const resolution = await resolveFormalTaskBoardRoot({
    repositoryRoot: request.repositoryRoot,
    identity: { state: "resolved", changeId: request.changeId },
  });
  const paths = exactPaths(resolution);
  if (!paths) {
    return blocked(diagnostic(
      "EXACT_ROOT_INVALID",
      "The exact legacy change root could not be derived without scanning or fallback.",
      undefined,
      validationCodes(resolution.diagnostics),
    ));
  }
  if (resolution.status === "resolved") {
    return blocked(diagnostic(
      resolution.pairState === "absent" ? "LEGACY_TASKS_MISSING" : "LEGACY_SOURCE_REQUIRED",
      resolution.pairState === "absent"
        ? "The exact selected change has no legacy task file to migrate."
        : "The exact selected change is already a strict v1 pair and was not rewritten.",
    ));
  }
  const rootCodes = validationCodes(resolution.diagnostics);
  if (!rootCodes.includes("EXISTING_PAIR_LEGACY_UNMANAGED") && !rootCodes.includes("OWNED_PAIR_INCOMPLETE")) {
    return blocked(diagnostic(
      "EXACT_ROOT_INVALID",
      "The exact selected change root is unsafe or is not a migratable legacy layout.",
      undefined,
      rootCodes,
    ));
  }

  let tasksSource: string | undefined;
  let progressSource: string | undefined;
  try {
    [tasksSource, progressSource] = await Promise.all([
      readExactSource(paths.tasksPath, true),
      readExactSource(paths.progressPath, true),
    ]);
  } catch {
    return blocked(diagnostic("SOURCE_READ_FAILED", "The exact legacy sources could not be read safely without mutation."));
  }
  if (tasksSource === undefined) {
    return blocked(diagnostic("LEGACY_TASKS_MISSING", "The exact selected change has no legacy task file to migrate."));
  }
  const planned = planFormalTaskBoardLegacyMigration({
    ...request,
    tasksSource,
    progressSource,
  });
  if (planned.status === "blocked") return planned;

  const guarded = progressSource === undefined
    ? await applyGuardedFormalTaskBoardLegacyMigrationPair(paths, {
        actor: "ROSE",
        tasksSource,
        candidateTasksSource: planned.tasksSource,
        candidateProgressSource: planned.progressSource,
        changeId: request.changeId,
      }, hooks)
    : await applyGuardedFormalTaskBoardPair(paths, {
        actor: "ROSE",
        tasksSource,
        progressSource,
        candidateTasksSource: planned.tasksSource,
        candidateProgressSource: planned.progressSource,
        changeId: request.changeId,
      }, hooks);
  if (guarded.status === "blocked") {
    return { status: "blocked", diagnostics: guarded.diagnostics };
  }
  return {
    ...paths,
    status: "applied",
    changeId: planned.changeId,
    packageIds: planned.packageIds,
    checkedPackageIds: planned.checkedPackageIds,
    legacyTasksSha256: planned.legacyTasksSha256,
    legacyProgressState: planned.legacyProgressState,
    tasksSource: planned.tasksSource,
    progressSource: planned.progressSource,
    eventTypes: planned.eventTypes,
    diagnostics: guarded.diagnostics,
  };
}
