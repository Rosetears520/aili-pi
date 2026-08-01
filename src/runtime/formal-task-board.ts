import { SPECIALIZED_ROLE_SELECTORS } from "./roles.js";

export const FORMAL_TASK_BOARD_PROTOCOL = "aili-task-board/v1" as const;
export const FORMAL_TASK_EXTERNAL_TRANSPORT = "external-task-session/v1" as const;
export const FORMAL_TASK_EXTERNAL_UNAVAILABLE = "job,turn,history" as const;

export const FORMAL_TASK_BOARD_HEADERS = [
  "Protocol",
  "Task kind",
  "Task identity",
  "Goal",
  "Phase",
  "Board status",
  "Accepted contract",
  "Accepted verification",
  "Decision owner",
  "Verification owner",
] as const;

export const FORMAL_TASK_PACKAGE_FIELDS = [
  "Phase",
  "Package kind",
  "Source refs",
  "Accepted task IDs",
  "Status",
  "Owner",
  "Dispatch",
  "Dispatch reason",
  "No-dispatch reason",
  "Execution",
  "Join",
  "Depends on",
  "Decision gate",
  "Final test-plan gate",
  "Implementation authorization",
  "Operation permissions",
  "Scope",
  "Forbidden scope",
  "Expected result",
  "Expected evidence",
  "Acceptance",
  "Dispatch evidence",
  "Result evidence",
  "Evidence",
  "ROSE disposition",
  "Blocker",
  "Next action",
] as const;

export const FORMAL_TASK_PROGRESS_EVENT_TYPES = [
  "BOARD_CREATED",
  "READY",
  "DISPATCHED",
  "WAIVED",
  "RETURNED",
  "INSPECTED",
  "JOINED",
  "DONE",
  "BLOCKED",
  "UNBLOCKED",
  "CANCELLED",
  "RECONCILED",
] as const;

export type FormalTaskBoardHeaderName = (typeof FORMAL_TASK_BOARD_HEADERS)[number];
export type FormalTaskPackageFieldName = (typeof FORMAL_TASK_PACKAGE_FIELDS)[number];
export type FormalTaskProgressEventType = (typeof FORMAL_TASK_PROGRESS_EVENT_TYPES)[number];
export type FormalTaskBoardClassification = "v1" | "legacy/unmanaged" | "invalid";
export type FormalTaskPackageStatus = "pending" | "ready" | "running" | "returned" | "done" | "blocked" | "cancelled";

export interface FormalTaskBoardDiagnostic {
  severity: "error" | "info";
  code: string;
  message: string;
  line?: number;
  packageId?: string;
  field?: string;
}

export interface FormalTaskField {
  value: string;
  line: number;
}

export interface FormalTaskPackage {
  id: string;
  title: string;
  checked: boolean;
  line: number;
  fields: Partial<Record<FormalTaskPackageFieldName, FormalTaskField>>;
  dependencies: string[];
}

export interface FormalTaskBoard {
  headers: Partial<Record<FormalTaskBoardHeaderName, FormalTaskField>>;
  packages: FormalTaskPackage[];
}

export interface FormalTaskBoardParseResult {
  classification: FormalTaskBoardClassification;
  board?: FormalTaskBoard;
  diagnostics: FormalTaskBoardDiagnostic[];
}

export interface FormalTaskProgressField {
  key: string;
  value: string;
  line: number;
}

export interface FormalTaskProgressEvent {
  timestamp: string;
  subject: string;
  type: string;
  line: number;
  fields: FormalTaskProgressField[];
}

export interface FormalTaskProgressParseResult {
  events: FormalTaskProgressEvent[];
  diagnostics: FormalTaskBoardDiagnostic[];
}

export interface FormalTaskBoardValidationOptions {
  specializedRoleSelectors?: readonly string[];
  bootstrapBridge?: FormalTaskBoardBootstrapBridgeIdentity;
}

export interface FormalTaskBoardBootstrapBridgeIdentity {
  taskIdentity: string;
  userDecisionRef: string;
  transport: typeof FORMAL_TASK_EXTERNAL_TRANSPORT;
}

export interface FormalTaskBoardBootstrapLimitation {
  packageId: string;
  runtime: "external" | "direct";
  externalRef?: string;
  unavailable?: typeof FORMAL_TASK_EXTERNAL_UNAVAILABLE;
  dispatchTiming?: "unverified-before-return";
  acceptedLimitation: string;
}

export interface FormalTaskBoardBootstrapValidation {
  taskIdentity: string;
  userDecisionRef: string;
  transport: typeof FORMAL_TASK_EXTERNAL_TRANSPORT;
  strictDefault: "preserved";
  limitations: readonly FormalTaskBoardBootstrapLimitation[];
}

export interface FormalTaskBoardValidationResult {
  classification: FormalTaskBoardClassification;
  valid: boolean;
  board?: FormalTaskBoard;
  progress?: FormalTaskProgressParseResult;
  bridge?: FormalTaskBoardBootstrapValidation;
  diagnostics: FormalTaskBoardDiagnostic[];
}

interface WorkingPackage extends FormalTaskPackage {
  occurrences: Map<FormalTaskPackageFieldName, FormalTaskField[]>;
}

interface ParsedDisposition {
  kind: "pending" | "accepted" | "partially-accepted" | "rejected" | "superseded" | "needs-follow-up";
}

interface BootstrapBridgeContext {
  identity: FormalTaskBoardBootstrapBridgeIdentity;
  boardEvent: FormalTaskProgressEvent;
}

const EXACT_PROTOCOL_MARKER = `- Protocol: \`${FORMAL_TASK_BOARD_PROTOCOL}\``;
const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const JOIN_ID_PATTERN = /^J-[A-Za-z0-9][A-Za-z0-9._-]{0,61}$/;
const PROGRESS_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const PACKAGE_STATUSES = new Set<FormalTaskPackageStatus>(["pending", "ready", "running", "returned", "done", "blocked", "cancelled"]);
const LIFECYCLE_PHASES = new Set(["IDEATE", "DEFINE", "BUILD", "SHIP"]);
const PACKAGE_KINDS = new Set(["evidence", "task-execution"]);
const AUTHORIZATION_VALUES = new Set(["absent", "granted", "expired", "revoked", "N/A"]);
const DISPATCH_VALUES = new Set(["required", "forbidden", "waived"]);
const EXECUTION_VALUES = new Set(["sync", "async", "direct"]);
const PROGRESS_EVENT_TYPES = new Set<string>(FORMAL_TASK_PROGRESS_EVENT_TYPES);
const PORTABLE_PROGRESS_KEYS = new Set(["evidence", "verification", "disposition", "blocker", "next_action"]);
const HEADER_NAMES = new Set<string>(FORMAL_TASK_BOARD_HEADERS);
const PACKAGE_FIELD_NAMES = new Set<string>(FORMAL_TASK_PACKAGE_FIELDS);
const MAX_SOURCE_CHARS = 1_000_000;
const MAX_SOURCE_LINES = 20_000;
const MAX_LINE_CHARS = 4_096;
const MAX_FIELD_VALUE_CHARS = 2_048;
const MAX_TITLE_CHARS = 256;
const MAX_PACKAGES = 512;
const MAX_PROGRESS_EVENTS = 2_048;
const MAX_PROGRESS_FIELDS = 64;
const MAX_DIAGNOSTICS = 256;

class DiagnosticCollector {
  readonly diagnostics: FormalTaskBoardDiagnostic[] = [];
  private truncated = false;

  add(diagnostic: FormalTaskBoardDiagnostic): void {
    if (this.truncated) return;
    if (this.diagnostics.length >= MAX_DIAGNOSTICS - 1) {
      this.diagnostics.push({
        severity: "error",
        code: "DIAGNOSTICS_TRUNCATED",
        message: "The bounded diagnostic limit was reached.",
      });
      this.truncated = true;
      return;
    }
    this.diagnostics.push({
      ...diagnostic,
      packageId: diagnostic.packageId === undefined ? undefined : diagnostic.packageId.slice(0, 64),
      field: diagnostic.field === undefined ? undefined : diagnostic.field.slice(0, 64),
    });
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortDiagnostics(diagnostics: readonly FormalTaskBoardDiagnostic[]): FormalTaskBoardDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const line = (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER);
    if (line !== 0) return line;
    const packageId = compareStrings(left.packageId ?? "", right.packageId ?? "");
    if (packageId !== 0) return packageId;
    const field = compareStrings(left.field ?? "", right.field ?? "");
    if (field !== 0) return field;
    return compareStrings(left.code, right.code);
  });
}

function boundedLines(source: string, diagnostics: DiagnosticCollector): string[] {
  if (typeof source !== "string") {
    diagnostics.add({ severity: "error", code: "INPUT_TYPE_INVALID", message: "Input must be a string." });
    return [];
  }
  let bounded = source;
  if (bounded.length > MAX_SOURCE_CHARS) {
    diagnostics.add({ severity: "error", code: "INPUT_TOO_LARGE", message: "Input exceeds the bounded parser size." });
    bounded = bounded.slice(0, MAX_SOURCE_CHARS);
  }
  let lines = bounded.split("\n");
  if (lines.length > MAX_SOURCE_LINES) {
    diagnostics.add({ severity: "error", code: "INPUT_TOO_MANY_LINES", message: "Input exceeds the bounded parser line count." });
    lines = lines.slice(0, MAX_SOURCE_LINES);
  }
  return lines.map((sourceLine, index) => {
    const line = sourceLine.endsWith("\r") ? sourceLine.slice(0, -1) : sourceLine;
    if (line.length <= MAX_LINE_CHARS) return line;
    diagnostics.add({
      severity: "error",
      code: "LINE_TOO_LONG",
      message: "A source line exceeds the bounded line length.",
      line: index + 1,
    });
    return line.slice(0, MAX_LINE_CHARS);
  });
}

function normalizeMarkdownValue(raw: string): string {
  const value = raw.trim();
  const singleCodeSpan = value.match(/^`([^`]*)`$/);
  return singleCodeSpan ? singleCodeSpan[1]! : value;
}

function boundedField(raw: string, line: number, diagnostics: DiagnosticCollector, field: string, packageId?: string): FormalTaskField {
  const value = normalizeMarkdownValue(raw);
  if (value.length > MAX_FIELD_VALUE_CHARS) {
    diagnostics.add({
      severity: "error",
      code: "FIELD_VALUE_TOO_LONG",
      message: "A field value exceeds the bounded value length.",
      line,
      packageId,
      field,
    });
  }
  return { value: value.slice(0, MAX_FIELD_VALUE_CHARS), line };
}

function addOrderDiagnostic<T extends string>(
  orderedNames: readonly T[],
  occurrences: Map<T, FormalTaskField[]>,
  diagnostics: DiagnosticCollector,
  code: string,
  message: string,
  packageId?: string,
): void {
  const unique = orderedNames
    .map((name, index) => ({ name, index, occurrence: occurrences.get(name) }))
    .filter((entry): entry is { name: T; index: number; occurrence: FormalTaskField[] } => entry.occurrence?.length === 1)
    .sort((left, right) => left.occurrence[0]!.line - right.occurrence[0]!.line);
  let previousIndex = -1;
  for (const entry of unique) {
    if (entry.index < previousIndex) {
      diagnostics.add({
        severity: "error",
        code,
        message,
        line: entry.occurrence[0]!.line,
        packageId,
        field: entry.name,
      });
      return;
    }
    previousIndex = entry.index;
  }
}

function parseDependencyValue(value: string): string[] {
  if (value === "none") return [];
  return value.split(",").map((part) => normalizeMarkdownValue(part));
}

function parseCommaList(value: string | undefined): string[] {
  if (value === undefined || value === "none") return [];
  return value.split(",").map((part) => part.trim());
}

const PORTABLE_SOURCE_REF_PATTERN = /^(requirement|decision|risk|artifact|verification|task):(?=[^,`\r\n]*\S)[^,`\r\n]{1,1024}$/;

function isPortableEvidence(value: string | undefined): boolean {
  if (!isConcrete(value)) return false;
  return value!.split(/[;,]/).map((part) => part.trim()).filter(Boolean)
    .every((part) => PORTABLE_SOURCE_REF_PATTERN.test(part));
}

export function parseFormalTaskBoard(source: string): FormalTaskBoardParseResult {
  const diagnostics = new DiagnosticCollector();
  const lines = boundedLines(source, diagnostics);
  const boundedInputFailed = diagnostics.diagnostics.some((diagnostic) => diagnostic.code.startsWith("INPUT_") || diagnostic.code === "LINE_TOO_LONG");
  if (boundedInputFailed) {
    return { classification: "invalid", diagnostics: sortDiagnostics(diagnostics.diagnostics) };
  }

  const exactMarkers = lines.flatMap((line, index) => line === EXACT_PROTOCOL_MARKER ? [index] : []);
  const markerCandidates = lines.flatMap((line, index) => {
    const protocolHeaderLike = /^\s*(?:-\s*)?protocol\b\s*:/i.test(line);
    const namesV1Protocol = /\bprotocol\b/i.test(line) && line.includes(FORMAL_TASK_BOARD_PROTOCOL);
    if (protocolHeaderLike || namesV1Protocol) return [index];
    return [];
  });

  if (exactMarkers.length === 0 && markerCandidates.length === 0) {
    return { classification: "legacy/unmanaged", diagnostics: [] };
  }
  if (exactMarkers.length === 0) {
    const line = markerCandidates[0]!;
    diagnostics.add({
      severity: "error",
      code: lines[line]!.includes("aili-task-board/") && !lines[line]!.includes(FORMAL_TASK_BOARD_PROTOCOL)
        ? "PROTOCOL_MARKER_CONFLICTING"
        : "PROTOCOL_MARKER_MALFORMED",
      message: "The formal protocol marker is malformed or conflicting.",
      line: line + 1,
      field: "Protocol",
    });
    return { classification: "invalid", diagnostics: sortDiagnostics(diagnostics.diagnostics) };
  }
  if (exactMarkers.length > 1) {
    for (const index of exactMarkers.slice(1)) {
      diagnostics.add({
        severity: "error",
        code: "PROTOCOL_MARKER_DUPLICATE",
        message: "The formal protocol marker appears more than once.",
        line: index + 1,
        field: "Protocol",
      });
    }
    return { classification: "invalid", diagnostics: sortDiagnostics(diagnostics.diagnostics) };
  }
  const extraMarkerCandidate = markerCandidates.find((index) => index !== exactMarkers[0]);
  if (extraMarkerCandidate !== undefined) {
    diagnostics.add({
      severity: "error",
      code: "PROTOCOL_MARKER_CONFLICTING",
      message: "An additional protocol marker conflicts with the v1 marker.",
      line: extraMarkerCandidate + 1,
      field: "Protocol",
    });
    return { classification: "invalid", diagnostics: sortDiagnostics(diagnostics.diagnostics) };
  }

  const headerOccurrences = new Map<FormalTaskBoardHeaderName, FormalTaskField[]>();
  const workingPackages: WorkingPackage[] = [];
  let currentPackage: WorkingPackage | undefined;
  let sawPackage = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;

    if (line.startsWith("- [")) {
      sawPackage = true;
      currentPackage = undefined;
      const broadRow = line.match(/^- \[([^\]]*)\]\s+(\S+)(?:\s+(—|-)\s+(.+))?$/);
      if (!broadRow || broadRow[4] === undefined) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_ROW_MALFORMED",
          message: "A package checkbox row does not match the fixed v1 grammar.",
          line: lineNumber,
        });
        continue;
      }
      const marker = broadRow[1]!;
      const rawId = broadRow[2]!;
      const separator = broadRow[3]!;
      const rawTitle = broadRow[4]!.trim();
      if ((marker !== " " && marker !== "x") || separator !== "—" || rawTitle.length === 0) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_ROW_MALFORMED",
          message: "A package checkbox row does not match the fixed v1 grammar.",
          line: lineNumber,
          packageId: rawId,
        });
      }
      if (workingPackages.length >= MAX_PACKAGES) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_LIMIT_EXCEEDED",
          message: "The board exceeds the bounded package count.",
          line: lineNumber,
        });
        continue;
      }
      if (rawTitle.length > MAX_TITLE_CHARS) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_TITLE_TOO_LONG",
          message: "A package title exceeds the bounded title length.",
          line: lineNumber,
          packageId: rawId,
        });
      }
      currentPackage = {
        id: rawId.slice(0, 128),
        title: rawTitle.slice(0, MAX_TITLE_CHARS),
        checked: marker === "x",
        line: lineNumber,
        fields: {},
        dependencies: [],
        occurrences: new Map(),
      };
      workingPackages.push(currentPackage);
      continue;
    }

    const packageField = line.match(/^  - ([A-Za-z][A-Za-z -]*):(?: (.*))?$/);
    if (packageField) {
      const name = packageField[1]!;
      if (!currentPackage) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_FIELD_ORPHAN",
          message: "A package field has no preceding package row.",
          line: lineNumber,
          field: name,
        });
        continue;
      }
      if (!PACKAGE_FIELD_NAMES.has(name)) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_FIELD_UNKNOWN",
          message: "A package contains a field outside the fixed v1 grammar.",
          line: lineNumber,
          packageId: currentPackage.id,
          field: name,
        });
        continue;
      }
      const fieldName = name as FormalTaskPackageFieldName;
      const field = boundedField(packageField[2] ?? "", lineNumber, diagnostics, fieldName, currentPackage.id);
      const occurrences = currentPackage.occurrences.get(fieldName) ?? [];
      occurrences.push(field);
      currentPackage.occurrences.set(fieldName, occurrences);
      if (currentPackage.fields[fieldName] === undefined) currentPackage.fields[fieldName] = field;
      continue;
    }

    const header = line.match(/^- ([A-Za-z][A-Za-z -]*):(?: (.*))?$/);
    if (header) {
      const name = header[1]!;
      if (HEADER_NAMES.has(name)) {
        const headerName = name as FormalTaskBoardHeaderName;
        const field = boundedField(header[2] ?? "", lineNumber, diagnostics, headerName);
        if (sawPackage) {
          diagnostics.add({
            severity: "error",
            code: "BOARD_HEADER_POSITION_INVALID",
            message: "Board headers must precede every package row.",
            line: lineNumber,
            field: headerName,
          });
        }
        const occurrences = headerOccurrences.get(headerName) ?? [];
        occurrences.push(field);
        headerOccurrences.set(headerName, occurrences);
      } else if (PACKAGE_FIELD_NAMES.has(name) && currentPackage) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_FIELD_MALFORMED",
          message: "A package field has invalid indentation or syntax.",
          line: lineNumber,
          packageId: currentPackage.id,
          field: name,
        });
      } else {
        diagnostics.add({
          severity: "error",
          code: "BOARD_HEADER_UNKNOWN",
          message: "The board header contains a field outside the fixed v1 grammar.",
          line: lineNumber,
          field: name,
        });
      }
      continue;
    }

    const malformedPackageField = line.match(/^\s+-\s+([A-Za-z][A-Za-z -]*):/);
    if (malformedPackageField && currentPackage && PACKAGE_FIELD_NAMES.has(malformedPackageField[1]!)) {
      diagnostics.add({
        severity: "error",
        code: "PACKAGE_FIELD_MALFORMED",
        message: "A package field has invalid indentation or syntax.",
        line: lineNumber,
        packageId: currentPackage.id,
        field: malformedPackageField[1]!,
      });
    }
  }

  const headers: Partial<Record<FormalTaskBoardHeaderName, FormalTaskField>> = {};
  for (const name of FORMAL_TASK_BOARD_HEADERS) {
    const occurrences = headerOccurrences.get(name) ?? [];
    if (occurrences.length === 0) {
      diagnostics.add({
        severity: "error",
        code: "BOARD_HEADER_MISSING",
        message: "A required board header is missing.",
        field: name,
      });
    } else {
      headers[name] = occurrences[0]!;
      for (const duplicate of occurrences.slice(1)) {
        diagnostics.add({
          severity: "error",
          code: "BOARD_HEADER_DUPLICATE",
          message: "A required board header appears more than once.",
          line: duplicate.line,
          field: name,
        });
      }
    }
  }
  addOrderDiagnostic(
    FORMAL_TASK_BOARD_HEADERS,
    headerOccurrences,
    diagnostics,
    "BOARD_HEADER_ORDER_INVALID",
    "Board headers do not follow the fixed v1 order.",
  );

  if (workingPackages.length === 0) {
    diagnostics.add({ severity: "error", code: "PACKAGE_REQUIRED", message: "A formal board must contain at least one package." });
  }

  for (const taskPackage of workingPackages) {
    for (const name of FORMAL_TASK_PACKAGE_FIELDS) {
      const occurrences = taskPackage.occurrences.get(name) ?? [];
      if (occurrences.length === 0) {
        diagnostics.add({
          severity: "error",
          code: "PACKAGE_FIELD_MISSING",
          message: "A required package field is missing.",
          line: taskPackage.line,
          packageId: taskPackage.id,
          field: name,
        });
      } else {
        for (const duplicate of occurrences.slice(1)) {
          diagnostics.add({
            severity: "error",
            code: "PACKAGE_FIELD_DUPLICATE",
            message: "A required package field appears more than once.",
            line: duplicate.line,
            packageId: taskPackage.id,
            field: name,
          });
        }
      }
    }
    addOrderDiagnostic(
      FORMAL_TASK_PACKAGE_FIELDS,
      taskPackage.occurrences,
      diagnostics,
      "PACKAGE_FIELD_ORDER_INVALID",
      "Package fields do not follow the fixed v1 order.",
      taskPackage.id,
    );
    const dependencyField = taskPackage.fields["Depends on"];
    taskPackage.dependencies = dependencyField ? parseDependencyValue(dependencyField.value) : [];
  }

  const packages = workingPackages.map(({ occurrences: _occurrences, ...taskPackage }) => taskPackage);
  return {
    classification: "v1",
    board: { headers, packages },
    diagnostics: sortDiagnostics(diagnostics.diagnostics),
  };
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
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth && !Number.isNaN(Date.parse(timestamp));
}

export function parseFormalTaskProgress(source: string): FormalTaskProgressParseResult {
  const diagnostics = new DiagnosticCollector();
  const lines = boundedLines(source, diagnostics);
  const events: FormalTaskProgressEvent[] = [];
  let current: FormalTaskProgressEvent | undefined;
  let previousLineWasBlank = true;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const lineNumber = index + 1;
    if (line.length === 0) {
      current = undefined;
      previousLineWasBlank = true;
      continue;
    }

    if (line.startsWith("[")) {
      const header = line.match(/^\[([^\]]+)\] (\S+) ([A-Z_]+)$/);
      if (!header) {
        diagnostics.add({
          severity: "error",
          code: "PROGRESS_EVENT_HEADER_MALFORMED",
          message: "A progress event header does not match the fixed v1 grammar.",
          line: lineNumber,
        });
        current = undefined;
        previousLineWasBlank = false;
        continue;
      }
      if (current && !previousLineWasBlank) {
        diagnostics.add({
          severity: "error",
          code: "PROGRESS_EVENT_SEPARATOR_MISSING",
          message: "Progress event blocks must be separated by a blank line.",
          line: lineNumber,
        });
      }
      const timestamp = header[1]!;
      const subject = header[2]!.slice(0, 128);
      const type = header[3]!;
      if (!isRfc3339(timestamp)) {
        diagnostics.add({
          severity: "error",
          code: "PROGRESS_TIMESTAMP_INVALID",
          message: "A progress event timestamp is not RFC 3339.",
          line: lineNumber,
        });
      }
      if (subject !== "BOARD" && !PACKAGE_ID_PATTERN.test(subject)) {
        diagnostics.add({
          severity: "error",
          code: "PROGRESS_SUBJECT_INVALID",
          message: "A progress event subject is neither BOARD nor a stable package ID.",
          line: lineNumber,
          packageId: subject,
        });
      }
      if (!PROGRESS_EVENT_TYPES.has(type)) {
        diagnostics.add({
          severity: "error",
          code: "PROGRESS_EVENT_TYPE_UNKNOWN",
          message: "A progress event type is outside the v1 event set.",
          line: lineNumber,
          packageId: subject === "BOARD" ? undefined : subject,
        });
      }
      if (events.length >= MAX_PROGRESS_EVENTS) {
        diagnostics.add({
          severity: "error",
          code: "PROGRESS_EVENT_LIMIT_EXCEEDED",
          message: "Progress exceeds the bounded event count.",
          line: lineNumber,
        });
        current = undefined;
      } else {
        current = { timestamp, subject, type, line: lineNumber, fields: [] };
        events.push(current);
      }
      previousLineWasBlank = false;
      continue;
    }

    if (!current) {
      diagnostics.add({
        severity: "error",
        code: "PROGRESS_FIELD_ORPHAN",
        message: "A progress key=value line has no event header.",
        line: lineNumber,
      });
      previousLineWasBlank = false;
      continue;
    }
    const equals = line.indexOf("=");
    if (equals <= 0) {
      diagnostics.add({
        severity: "error",
        code: "PROGRESS_FIELD_MALFORMED",
        message: "A progress field is not a bounded key=value line.",
        line: lineNumber,
        packageId: current.subject === "BOARD" ? undefined : current.subject,
      });
      previousLineWasBlank = false;
      continue;
    }
    const key = line.slice(0, equals);
    const rawValue = line.slice(equals + 1);
    if (!PROGRESS_KEY_PATTERN.test(key) || rawValue.length === 0) {
      diagnostics.add({
        severity: "error",
        code: "PROGRESS_FIELD_MALFORMED",
        message: "A progress field is not a bounded key=value line.",
        line: lineNumber,
        packageId: current.subject === "BOARD" ? undefined : current.subject,
        field: key,
      });
      previousLineWasBlank = false;
      continue;
    }
    if (!PORTABLE_PROGRESS_KEYS.has(key)) {
      diagnostics.add({
        severity: "error",
        code: ["agent", "job", "turn", "output", "history", "runtime", "external", "transport"].includes(key)
          ? "PROGRESS_RUNTIME_REF_FORBIDDEN"
          : "PROGRESS_FIELD_UNKNOWN",
        message: "A progress event may contain only portable evidence, disposition, blocker, next-action, or verification fields.",
        line: lineNumber,
        packageId: current.subject === "BOARD" ? undefined : current.subject,
        field: key,
      });
      previousLineWasBlank = false;
      continue;
    }
    if (rawValue.length > MAX_FIELD_VALUE_CHARS || current.fields.length >= MAX_PROGRESS_FIELDS) {
      diagnostics.add({
        severity: "error",
        code: current.fields.length >= MAX_PROGRESS_FIELDS ? "PROGRESS_FIELD_LIMIT_EXCEEDED" : "PROGRESS_FIELD_VALUE_TOO_LONG",
        message: "A progress event exceeds a bounded field limit.",
        line: lineNumber,
        packageId: current.subject === "BOARD" ? undefined : current.subject,
        field: key,
      });
      previousLineWasBlank = false;
      continue;
    }
    if (current.fields.some((field) => field.key === key)) {
      diagnostics.add({
        severity: "error",
        code: "PROGRESS_FIELD_DUPLICATE",
        message: "A progress event key appears more than once.",
        line: lineNumber,
        packageId: current.subject === "BOARD" ? undefined : current.subject,
        field: key,
      });
    }
    current.fields.push({ key, value: rawValue, line: lineNumber });
    previousLineWasBlank = false;
  }

  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (!isRfc3339(event.timestamp)) continue;
    const timestamp = Date.parse(event.timestamp);
    if (timestamp < previousTimestamp) {
      diagnostics.add({
        severity: "error",
        code: "PROGRESS_TIMESTAMP_ORDER_INVALID",
        message: "Progress event timestamps move backwards in append order.",
        line: event.line,
        packageId: event.subject === "BOARD" ? undefined : event.subject,
      });
    }
    previousTimestamp = Math.max(previousTimestamp, timestamp);
  }

  return { events, diagnostics: sortDiagnostics(diagnostics.diagnostics) };
}

function fieldValue(taskPackage: FormalTaskPackage, name: FormalTaskPackageFieldName): string | undefined {
  return taskPackage.fields[name]?.value;
}

function headerValue(board: FormalTaskBoard, name: FormalTaskBoardHeaderName): string | undefined {
  return board.headers[name]?.value;
}

function isConcrete(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0
    && !/^(?:pending|none|n\/a|tbd|unverified|-)(?:$|\s|:|—)/.test(normalized);
}

function isSatisfiedGate(name: "Decision gate" | "Final test-plan gate" | "Operation permissions", value: string | undefined): boolean {
  if (value === "N/A") return true;
  if (!isConcrete(value)) return false;
  const normalized = value!.trim().toLowerCase();
  if (name === "Decision gate") return /^(?:accepted|resolved|satisfied|closed)(?:$|\s|:|—)/.test(normalized);
  if (name === "Final test-plan gate") return /^accepted(?:$|\s|:|—)/.test(normalized);
  return /^(?:granted|approved|satisfied)(?:$|\s|:|—)/.test(normalized);
}

function parseDisposition(value: string | undefined): ParsedDisposition | undefined {
  if (value === undefined) return undefined;
  const match = value.match(/^(pending|accepted|partially-accepted|rejected|superseded|needs-follow-up)$/);
  if (!match) return undefined;
  return { kind: match[1] as ParsedDisposition["kind"] };
}

function eventValue(event: FormalTaskProgressEvent, key: string): string | undefined {
  return event.fields.find((field) => field.key === key)?.value;
}

function bridgeConcrete(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= MAX_FIELD_VALUE_CHARS
    && !/[\r\n\0`]/.test(value)
    && isConcrete(value);
}

function resolveBootstrapBridge(
  board: FormalTaskBoard,
  progress: FormalTaskProgressParseResult,
  option: FormalTaskBoardBootstrapBridgeIdentity | undefined,
  diagnostics: DiagnosticCollector,
): BootstrapBridgeContext | undefined {
  if (option === undefined) return undefined;
  if (!option || typeof option !== "object" || option.taskIdentity !== headerValue(board, "Task identity")) {
    diagnostics.add({
      severity: "error",
      code: "BRIDGE_OPTION_IDENTITY_INVALID",
      message: "The bootstrap bridge identity must exactly match the current formal task identity.",
      field: "Task identity",
    });
    return undefined;
  }
  if (!bridgeConcrete(option.userDecisionRef)) {
    diagnostics.add({
      severity: "error",
      code: "BRIDGE_OPTION_DECISION_INVALID",
      message: "The bootstrap bridge requires one concrete bounded user-decision reference.",
      field: "decision",
    });
    return undefined;
  }
  if (option.transport !== FORMAL_TASK_EXTERNAL_TRANSPORT) {
    diagnostics.add({
      severity: "error",
      code: "BRIDGE_OPTION_TRANSPORT_INVALID",
      message: "The bootstrap bridge transport must be exactly external-task-session/v1.",
      field: "transport",
    });
    return undefined;
  }

  const candidates = progress.events.filter((event) => event.subject === "BOARD"
    && event.type === "RECONCILED"
    && (eventValue(event, "transport") !== undefined
      || eventValue(event, "task_identity") !== undefined
      || eventValue(event, "strict_default") === "preserved"));
  const matching = candidates.filter((event) => eventValue(event, "task_identity") === option.taskIdentity
    && eventValue(event, "transport") === option.transport
    && eventValue(event, "decision") === option.userDecisionRef
    && eventValue(event, "strict_default") === "preserved"
    && eventValue(event, "phase") === headerValue(board, "Phase")
    && eventValue(event, "acceptance") === headerValue(board, "Accepted verification"));
  if (matching.length !== 1) {
    diagnostics.add({
      severity: "error",
      code: candidates.length === 0 ? "BRIDGE_BOARD_RECONCILIATION_MISSING" : "BRIDGE_BOARD_RECONCILIATION_INVALID",
      message: candidates.length === 0
        ? "The exact bootstrap bridge requires one BOARD RECONCILED identity/decision binding."
        : "The BOARD RECONCILED bootstrap binding is incomplete, conflicting, or duplicated.",
      field: "RECONCILED",
    });
    return undefined;
  }
  return { identity: option, boardEvent: matching[0]! };
}

function bridgePackageCandidates(
  events: readonly FormalTaskProgressEvent[],
  packageId: string,
): FormalTaskProgressEvent[] {
  return events.filter((event) => event.subject === packageId
    && event.type === "RECONCILED"
    && (eventValue(event, "transport") !== undefined
      || eventValue(event, "task_identity") !== undefined
      || eventValue(event, "external") !== undefined));
}

function hasSyntheticExternalFields(event: FormalTaskProgressEvent): boolean {
  return ["agent", "job", "turn", "output", "history"].some((key) => eventValue(event, key) !== undefined);
}

function resolveBootstrapPackageReconciliation(
  taskPackage: FormalTaskPackage,
  events: readonly FormalTaskProgressEvent[],
  context: BootstrapBridgeContext,
  diagnostics: DiagnosticCollector,
): FormalTaskProgressEvent | undefined {
  const candidates = bridgePackageCandidates(events, taskPackage.id);
  if (candidates.length === 0) return undefined;
  const disposition = fieldValue(taskPackage, "ROSE disposition");
  const parsedDisposition = parseDisposition(disposition);
  const evidence = fieldValue(taskPackage, "Evidence");
  const matching = candidates.filter((event) => {
    const base = fieldValue(taskPackage, "Status") === "done"
      && (parsedDisposition?.kind === "accepted" || parsedDisposition?.kind === "partially-accepted")
      && eventValue(event, "task_identity") === context.identity.taskIdentity
      && eventValue(event, "transport") === context.identity.transport
      && eventValue(event, "decision") === context.identity.userDecisionRef
      && eventValue(event, "runtime") === "direct"
      && (eventValue(event, "result") === "completed" || eventValue(event, "result") === "partial")
      && bridgeConcrete(eventValue(event, "inspection"))
      && eventValue(event, "disposition") === disposition
      && bridgeConcrete(evidence)
      && eventValue(event, "evidence") === evidence
      && bridgeConcrete(eventValue(event, "verification"))
      && bridgeConcrete(eventValue(event, "limitation"))
      && eventValue(event, "authority") === "none"
      && !hasSyntheticExternalFields(event);
    if (!base) return false;
    return eventValue(event, "external") === undefined
      && eventValue(event, "unavailable") === undefined
      && eventValue(event, "dispatch_timing") === undefined;
  });
  if (matching.length !== 1 || candidates.length !== 1) {
    diagnostics.add({
      severity: "error",
      code: "BRIDGE_PACKAGE_RECONCILIATION_INVALID",
      message: "Package RECONCILED evidence is incomplete, mixed with synthetic references, conflicting, or duplicated.",
      line: candidates[0]?.line ?? taskPackage.line,
      packageId: taskPackage.id,
      field: "RECONCILED",
    });
    return undefined;
  }
  return matching[0]!;
}

function firstEvent(events: readonly FormalTaskProgressEvent[], type: string): FormalTaskProgressEvent | undefined {
  return events.find((event) => event.type === type);
}

function lastEventBefore(
  allEvents: readonly FormalTaskProgressEvent[],
  events: readonly FormalTaskProgressEvent[],
  type: string,
  before: FormalTaskProgressEvent,
): FormalTaskProgressEvent | undefined {
  const beforeIndex = allEvents.indexOf(before);
  return [...events].reverse().find((event) => event.type === type && allEvents.indexOf(event) < beforeIndex);
}

function addRequiredEventDataDiagnostic(
  diagnostics: DiagnosticCollector,
  taskPackage: FormalTaskPackage,
  event: FormalTaskProgressEvent,
  field: string,
): void {
  diagnostics.add({
    severity: "error",
    code: "PROGRESS_EVENT_DATA_INVALID",
    message: "A required progress event field is missing or inconsistent.",
    line: event.line,
    packageId: taskPackage.id,
    field,
  });
}

function hasBoundedPartialDisposition(
  disposition: ParsedDisposition,
  taskPackage: FormalTaskPackage,
  packages: readonly FormalTaskPackage[],
): boolean {
  if (disposition.kind !== "partially-accepted") return false;
  const nextAction = fieldValue(taskPackage, "Next action");
  const evidence = fieldValue(taskPackage, "Evidence");
  if (evidence?.split(/[;,]/).some((reference) => /^\s*(?:risk|decision):/.test(reference))) return true;

  const referencesPackage = (value: string | undefined, packageId: string): boolean => {
    if (!value) return false;
    const escaped = packageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Za-z0-9._-])${escaped}(?:$|[^A-Za-z0-9._-])`).test(value);
  };
  return packages.some((candidate) => candidate.id !== taskPackage.id
    && referencesPackage(nextAction, candidate.id));
}

function combineDiagnostics(...groups: readonly FormalTaskBoardDiagnostic[][]): DiagnosticCollector {
  const collector = new DiagnosticCollector();
  for (const group of groups) for (const diagnostic of group) collector.add(diagnostic);
  return collector;
}

export function validateFormalTaskBoard(
  boardSource: string,
  progressSource: string,
  options: FormalTaskBoardValidationOptions = {},
): FormalTaskBoardValidationResult {
  const parsedBoard = parseFormalTaskBoard(boardSource);
  if (parsedBoard.classification === "legacy/unmanaged") {
    return {
      classification: "legacy/unmanaged",
      valid: false,
      diagnostics: [{
        severity: "info",
        code: "LEGACY_UNMANAGED",
        message: "The task file has no exact standalone v1 marker and remains legacy/unmanaged.",
      }],
    };
  }
  if (parsedBoard.classification === "invalid" || !parsedBoard.board) {
    return { classification: "invalid", valid: false, diagnostics: parsedBoard.diagnostics };
  }

  const parsedProgress = parseFormalTaskProgress(progressSource);
  const diagnostics = combineDiagnostics(parsedBoard.diagnostics, parsedProgress.diagnostics);
  const board = parsedBoard.board;
  const configuredSelectors = options?.specializedRoleSelectors;
  const selectorSet = new Set(Array.isArray(configuredSelectors) ? configuredSelectors : SPECIALIZED_ROLE_SELECTORS);
  const statuses = new Map<FormalTaskPackage, FormalTaskPackageStatus | undefined>();
  const dispositions = new Map<FormalTaskPackage, ParsedDisposition | undefined>();
  const bridgePackageReconciliations = new Map<FormalTaskPackage, FormalTaskProgressEvent>();
  const owners = new Map<FormalTaskPackage, "ROSE" | "agent" | "invalid">();

  const protocol = headerValue(board, "Protocol");
  if (protocol !== FORMAL_TASK_BOARD_PROTOCOL) {
    diagnostics.add({ severity: "error", code: "PROTOCOL_VALUE_INVALID", message: "Protocol must be exactly aili-task-board/v1.", line: board.headers.Protocol?.line, field: "Protocol" });
  }
  if (headerValue(board, "Task kind") !== "formal") {
    diagnostics.add({ severity: "error", code: "TASK_KIND_INVALID", message: "Task kind must be exactly formal.", line: board.headers["Task kind"]?.line, field: "Task kind" });
  }
  const phase = headerValue(board, "Phase");
  if (phase !== undefined && !LIFECYCLE_PHASES.has(phase)) {
    diagnostics.add({ severity: "error", code: "PHASE_INVALID", message: "Phase is outside the formal lifecycle set.", line: board.headers.Phase?.line, field: "Phase" });
  }
  const boardStatus = headerValue(board, "Board status");
  if (boardStatus !== undefined && !new Set(["active", "blocked", "done", "cancelled"]).has(boardStatus)) {
    diagnostics.add({ severity: "error", code: "BOARD_STATUS_INVALID", message: "Board status is outside the v1 board state set.", line: board.headers["Board status"]?.line, field: "Board status" });
  }
  if (headerValue(board, "Decision owner") !== "ROSE") {
    diagnostics.add({ severity: "error", code: "DECISION_OWNER_INVALID", message: "Decision owner must be exactly ROSE.", line: board.headers["Decision owner"]?.line, field: "Decision owner" });
  }
  if (headerValue(board, "Verification owner") !== "ROSE") {
    diagnostics.add({ severity: "error", code: "VERIFICATION_OWNER_INVALID", message: "Verification owner must be exactly ROSE.", line: board.headers["Verification owner"]?.line, field: "Verification owner" });
  }
  for (const name of FORMAL_TASK_BOARD_HEADERS) {
    const field = board.headers[name];
    if (field && field.value.length === 0) {
      diagnostics.add({ severity: "error", code: "BOARD_HEADER_VALUE_EMPTY", message: "A required board header value is empty.", line: field.line, field: name });
    }
  }
  if ((phase === "BUILD" || phase === "SHIP") && !isConcrete(headerValue(board, "Accepted contract"))) {
    diagnostics.add({ severity: "error", code: "PHASE_CONTRACT_GATE_OPEN", message: "BUILD or SHIP cannot clear the accepted-contract gate from pending text.", line: board.headers["Accepted contract"]?.line, field: "Accepted contract" });
  }
  if ((phase === "BUILD" || phase === "SHIP") && !isConcrete(headerValue(board, "Accepted verification"))) {
    diagnostics.add({ severity: "error", code: "PHASE_VERIFICATION_GATE_OPEN", message: "BUILD or SHIP cannot clear the accepted-verification gate from pending text.", line: board.headers["Accepted verification"]?.line, field: "Accepted verification" });
  }
  const bridgeContext = resolveBootstrapBridge(board, parsedProgress, options?.bootstrapBridge, diagnostics);

  const packageById = new Map<string, FormalTaskPackage>();
  const duplicateIds = new Set<string>();
  const acceptedTaskOwners = new Map<string, string>();
  for (const taskPackage of board.packages) {
    if (!PACKAGE_ID_PATTERN.test(taskPackage.id)) {
      diagnostics.add({ severity: "error", code: "PACKAGE_ID_INVALID", message: "Package ID does not match the stable ASCII token grammar.", line: taskPackage.line, packageId: taskPackage.id });
    }
    if (packageById.has(taskPackage.id)) {
      duplicateIds.add(taskPackage.id);
      diagnostics.add({ severity: "error", code: "PACKAGE_ID_DUPLICATE", message: "Package ID appears more than once.", line: taskPackage.line, packageId: taskPackage.id });
    } else {
      packageById.set(taskPackage.id, taskPackage);
    }
  }

  for (const taskPackage of board.packages) {
    for (const name of FORMAL_TASK_PACKAGE_FIELDS) {
      const field = taskPackage.fields[name];
      if (field && field.value.length === 0) {
        diagnostics.add({ severity: "error", code: "PACKAGE_FIELD_VALUE_EMPTY", message: "A required package field value is empty.", line: field.line, packageId: taskPackage.id, field: name });
      }
    }

    const statusValue = fieldValue(taskPackage, "Status");
    const status = statusValue !== undefined && PACKAGE_STATUSES.has(statusValue as FormalTaskPackageStatus)
      ? statusValue as FormalTaskPackageStatus
      : undefined;
    statuses.set(taskPackage, status);
    if (statusValue !== undefined && status === undefined) {
      diagnostics.add({ severity: "error", code: "PACKAGE_STATUS_INVALID", message: "Package Status is outside the seven-state set.", line: taskPackage.fields.Status?.line, packageId: taskPackage.id, field: "Status" });
    }
    if (status && taskPackage.checked !== (status === "done")) {
      diagnostics.add({ severity: "error", code: "CHECKBOX_STATUS_MISMATCH", message: "The checkbox must be checked if and only if Status is done.", line: taskPackage.line, packageId: taskPackage.id, field: "Status" });
    }

    const packagePhase = fieldValue(taskPackage, "Phase");
    if (packagePhase !== undefined && !LIFECYCLE_PHASES.has(packagePhase)) {
      diagnostics.add({ severity: "error", code: "PACKAGE_PHASE_INVALID", message: "Package Phase is outside the formal lifecycle set.", line: taskPackage.fields.Phase?.line, packageId: taskPackage.id, field: "Phase" });
    }
    const packageKind = fieldValue(taskPackage, "Package kind");
    if (packageKind !== undefined && !PACKAGE_KINDS.has(packageKind)) {
      diagnostics.add({ severity: "error", code: "PACKAGE_KIND_INVALID", message: "Package kind must be evidence or task-execution.", line: taskPackage.fields["Package kind"]?.line, packageId: taskPackage.id, field: "Package kind" });
    }
    const sourceRefs = parseCommaList(fieldValue(taskPackage, "Source refs"));
    if (sourceRefs.length === 0 || sourceRefs.some((reference) => !PORTABLE_SOURCE_REF_PATTERN.test(reference))) {
      diagnostics.add({ severity: "error", code: "SOURCE_REFS_INVALID", message: "Source refs must contain one or more typed portable identifiers.", line: taskPackage.fields["Source refs"]?.line, packageId: taskPackage.id, field: "Source refs" });
    }
    const acceptedTaskIds = parseCommaList(fieldValue(taskPackage, "Accepted task IDs"));
    if (packageKind === "evidence" && fieldValue(taskPackage, "Accepted task IDs") !== "none") {
      diagnostics.add({ severity: "error", code: "EVIDENCE_ACCEPTED_TASKS_INVALID", message: "An evidence package must use Accepted task IDs none.", line: taskPackage.fields["Accepted task IDs"]?.line, packageId: taskPackage.id, field: "Accepted task IDs" });
    }
    if (packageKind === "task-execution") {
      if (acceptedTaskIds.length === 0 || acceptedTaskIds.some((taskId) => !PACKAGE_ID_PATTERN.test(taskId))) {
        diagnostics.add({ severity: "error", code: "ACCEPTED_TASK_IDS_INVALID", message: "A task-execution package requires one or more stable accepted task IDs.", line: taskPackage.fields["Accepted task IDs"]?.line, packageId: taskPackage.id, field: "Accepted task IDs" });
      }
      for (const taskId of acceptedTaskIds) {
        const owner = acceptedTaskOwners.get(taskId);
        if (owner) {
          diagnostics.add({ severity: "error", code: "ACCEPTED_TASK_ID_DUPLICATE", message: "An accepted task ID belongs to more than one current task-execution package.", line: taskPackage.fields["Accepted task IDs"]?.line, packageId: taskPackage.id, field: "Accepted task IDs" });
        } else {
          acceptedTaskOwners.set(taskId, taskPackage.id);
        }
        if (!sourceRefs.includes(`task:${taskId}`)) {
          diagnostics.add({ severity: "error", code: "ACCEPTED_TASK_SOURCE_REF_MISSING", message: "Every accepted task ID must have a matching task: Source ref.", line: taskPackage.fields["Source refs"]?.line, packageId: taskPackage.id, field: "Source refs" });
        }
      }
    }

    const implementationAuthorization = fieldValue(taskPackage, "Implementation authorization");
    if (implementationAuthorization !== undefined && !AUTHORIZATION_VALUES.has(implementationAuthorization)) {
      diagnostics.add({ severity: "error", code: "IMPLEMENTATION_AUTHORIZATION_INVALID", message: "Implementation authorization is outside the exact authorization set.", line: taskPackage.fields["Implementation authorization"]?.line, packageId: taskPackage.id, field: "Implementation authorization" });
    }
    const advanced = status === "ready" || status === "running" || status === "returned" || status === "done";
    if (advanced) {
      for (const gate of ["Decision gate", "Final test-plan gate", "Operation permissions"] as const) {
        const value = fieldValue(taskPackage, gate);
        if (!isSatisfiedGate(gate, value)) {
          diagnostics.add({ severity: "error", code: "PACKAGE_GATE_OPEN", message: "An advanced package cannot retain an open applicable gate.", line: taskPackage.fields[gate]?.line, packageId: taskPackage.id, field: gate });
        }
      }
      if (packageKind === "task-execution" && packagePhase === "BUILD" && implementationAuthorization !== "granted") {
        diagnostics.add({ severity: "error", code: "BUILD_IMPLEMENTATION_AUTHORIZATION_REQUIRED", message: "A ready or active BUILD task-execution package requires exact granted implementation authorization.", line: taskPackage.fields["Implementation authorization"]?.line, packageId: taskPackage.id, field: "Implementation authorization" });
      }
    }

    const owner = fieldValue(taskPackage, "Owner");
    let ownerKind: "ROSE" | "agent" | "invalid" = "invalid";
    let selector: string | undefined;
    if (owner === "ROSE") {
      ownerKind = "ROSE";
    } else if (owner === "general" || owner === "agent:general" || owner === "agent:aili.general") {
      diagnostics.add({ severity: "error", code: "OWNER_GENERAL_FORBIDDEN", message: "general cannot own a formal Agent package.", line: taskPackage.fields.Owner?.line, packageId: taskPackage.id, field: "Owner" });
    } else if (owner?.startsWith("agent:")) {
      selector = owner.slice("agent:".length);
      if (selectorSet.has(selector) && selector !== "general") {
        ownerKind = "agent";
      } else {
        diagnostics.add({ severity: "error", code: "OWNER_SELECTOR_INVALID", message: "Agent owner is not an exact current specialized selector.", line: taskPackage.fields.Owner?.line, packageId: taskPackage.id, field: "Owner" });
      }
    } else if (owner !== undefined) {
      diagnostics.add({ severity: "error", code: "OWNER_INVALID", message: "Owner must be ROSE or agent:<specialized-selector>.", line: taskPackage.fields.Owner?.line, packageId: taskPackage.id, field: "Owner" });
    }
    owners.set(taskPackage, ownerKind);

    const dispatch = fieldValue(taskPackage, "Dispatch");
    const execution = fieldValue(taskPackage, "Execution");
    const join = fieldValue(taskPackage, "Join");
    if (dispatch !== undefined && !DISPATCH_VALUES.has(dispatch)) {
      diagnostics.add({ severity: "error", code: "DISPATCH_INVALID", message: "Dispatch is outside the formal dispatch set.", line: taskPackage.fields.Dispatch?.line, packageId: taskPackage.id, field: "Dispatch" });
    }
    if (execution !== undefined && !EXECUTION_VALUES.has(execution)) {
      diagnostics.add({ severity: "error", code: "EXECUTION_INVALID", message: "Execution is outside the formal execution set.", line: taskPackage.fields.Execution?.line, packageId: taskPackage.id, field: "Execution" });
    }
    if (dispatch === "required" && !isConcrete(fieldValue(taskPackage, "Dispatch reason"))) {
      diagnostics.add({ severity: "error", code: "DISPATCH_REASON_REQUIRED", message: "Required dispatch needs a concrete dispatch reason.", line: taskPackage.fields["Dispatch reason"]?.line, packageId: taskPackage.id, field: "Dispatch reason" });
    }
    if (dispatch !== "waived" && fieldValue(taskPackage, "No-dispatch reason") !== "N/A") {
      diagnostics.add({ severity: "error", code: "NO_DISPATCH_REASON_INVALID", message: "Non-waived packages must use N/A for No-dispatch reason.", line: taskPackage.fields["No-dispatch reason"]?.line, packageId: taskPackage.id, field: "No-dispatch reason" });
    }

    if (ownerKind === "ROSE") {
      if (dispatch !== "forbidden") diagnostics.add({ severity: "error", code: "OWNER_DISPATCH_MISMATCH", message: "ROSE owner requires Dispatch forbidden.", line: taskPackage.fields.Dispatch?.line, packageId: taskPackage.id, field: "Dispatch" });
      if (execution !== "direct") diagnostics.add({ severity: "error", code: "OWNER_EXECUTION_MISMATCH", message: "ROSE owner requires Execution direct.", line: taskPackage.fields.Execution?.line, packageId: taskPackage.id, field: "Execution" });
      if (join !== "N/A") diagnostics.add({ severity: "error", code: "OWNER_JOIN_MISMATCH", message: "ROSE owner requires Join N/A.", line: taskPackage.fields.Join?.line, packageId: taskPackage.id, field: "Join" });
    }

    if (ownerKind === "agent") {
      if (dispatch === "required") {
        const validSync = execution === "sync" && join === "immediate";
        const validAsync = execution === "async" && join !== undefined && JOIN_ID_PATTERN.test(join);
        if (!validSync && !validAsync) {
          diagnostics.add({ severity: "error", code: "AGENT_EXECUTION_JOIN_MISMATCH", message: "Required Agent execution must be sync/immediate or async/a stable named join.", line: taskPackage.fields.Execution?.line, packageId: taskPackage.id, field: "Execution|Join" });
        }
        if (fieldValue(taskPackage, "No-dispatch reason") !== "N/A") {
          diagnostics.add({ severity: "error", code: "NO_DISPATCH_REASON_INVALID", message: "Required Agent dispatch must use N/A for No-dispatch reason.", line: taskPackage.fields["No-dispatch reason"]?.line, packageId: taskPackage.id, field: "No-dispatch reason" });
        }
      } else if (dispatch === "waived") {
        if (execution !== "direct" || join !== "N/A") {
          diagnostics.add({ severity: "error", code: "WAIVER_EXECUTION_JOIN_MISMATCH", message: "A waived Agent package requires direct execution and Join N/A.", line: taskPackage.fields.Execution?.line, packageId: taskPackage.id, field: "Execution|Join" });
        }
        if (!isConcrete(fieldValue(taskPackage, "No-dispatch reason"))) {
          diagnostics.add({ severity: "error", code: "WAIVER_REASON_REQUIRED", message: "A waived Agent package needs a concrete pre-recorded reason.", line: taskPackage.fields["No-dispatch reason"]?.line, packageId: taskPackage.id, field: "No-dispatch reason" });
        }
        if (!isPortableEvidence(fieldValue(taskPackage, "Dispatch evidence"))) {
          diagnostics.add({ severity: "error", code: "WAIVER_EVIDENCE_REQUIRED", message: "A waived Agent package needs concrete pre-recorded portable Dispatch evidence.", line: taskPackage.fields["Dispatch evidence"]?.line, packageId: taskPackage.id, field: "Dispatch evidence" });
        }
      } else if (dispatch !== undefined) {
        diagnostics.add({ severity: "error", code: "AGENT_DISPATCH_MISMATCH", message: "An Agent owner requires Dispatch required or a valid waiver.", line: taskPackage.fields.Dispatch?.line, packageId: taskPackage.id, field: "Dispatch" });
      }
    }

    if ((ownerKind === "ROSE" || dispatch === "waived") && status === "returned") {
      diagnostics.add({ severity: "error", code: "DIRECT_RETURNED_INVALID", message: "A direct package cannot use returned state.", line: taskPackage.fields.Status?.line, packageId: taskPackage.id, field: "Status" });
    }

    const evidence = fieldValue(taskPackage, "Evidence");
    const expectedEvidence = fieldValue(taskPackage, "Expected evidence");
    const dispatchEvidence = fieldValue(taskPackage, "Dispatch evidence");
    const resultEvidence = fieldValue(taskPackage, "Result evidence");
    for (const name of ["Dispatch evidence", "Result evidence", "Evidence"] as const) {
      const value = fieldValue(taskPackage, name);
      if (value !== undefined && value !== "pending" && !isPortableEvidence(value)) {
        diagnostics.add({ severity: "error", code: "PACKAGE_EVIDENCE_SYNTAX_INVALID", message: "Package evidence fields must be pending or typed portable identifiers.", line: taskPackage.fields[name]?.line, packageId: taskPackage.id, field: name });
      }
    }
    if (!isPortableEvidence(expectedEvidence)) {
      diagnostics.add({ severity: "error", code: "EXPECTED_EVIDENCE_INVALID", message: "Expected evidence must name prospective typed portable evidence.", line: taskPackage.fields["Expected evidence"]?.line, packageId: taskPackage.id, field: "Expected evidence" });
    }
    if (ownerKind === "agent" && dispatch === "required" && (status === "running" || status === "returned" || status === "done") && !isPortableEvidence(dispatchEvidence)) {
      diagnostics.add({ severity: "error", code: "DISPATCH_EVIDENCE_REQUIRED", message: "A dispatched Agent state requires portable Dispatch evidence.", line: taskPackage.fields["Dispatch evidence"]?.line, packageId: taskPackage.id, field: "Dispatch evidence" });
    }
    if ((status === "returned" || status === "done") && ownerKind === "agent" && dispatch === "required" && !isPortableEvidence(resultEvidence)) {
      diagnostics.add({ severity: "error", code: "RESULT_EVIDENCE_REQUIRED", message: "Returned or done Agent state requires portable Result evidence.", line: taskPackage.fields["Result evidence"]?.line, packageId: taskPackage.id, field: "Result evidence" });
    }
    if ((status === "returned" || status === "done") && !isPortableEvidence(evidence)) {
      diagnostics.add({ severity: "error", code: "ACTUAL_EVIDENCE_REQUIRED", message: "Returned or done state requires typed portable actual Evidence.", line: taskPackage.fields.Evidence?.line, packageId: taskPackage.id, field: "Evidence" });
    }
    if (status === "done" && evidence !== undefined && expectedEvidence !== undefined && evidence === expectedEvidence) {
      diagnostics.add({ severity: "error", code: "EXPECTED_EVIDENCE_SUBSTITUTION", message: "Expected evidence text cannot substitute for actual Evidence.", line: taskPackage.fields.Evidence?.line, packageId: taskPackage.id, field: "Evidence" });
    }
    for (const name of ["Scope", "Forbidden scope", "Expected result", "Expected evidence", "Acceptance"] as const) {
      if (!isConcrete(fieldValue(taskPackage, name))) {
        diagnostics.add({ severity: "error", code: "PACKAGE_BOUNDARY_REQUIRED", message: "Every package requires concrete bounded scope, result, evidence, and acceptance text.", line: taskPackage.fields[name]?.line, packageId: taskPackage.id, field: name });
      }
    }

    const disposition = parseDisposition(fieldValue(taskPackage, "ROSE disposition"));
    dispositions.set(taskPackage, disposition);
    if (fieldValue(taskPackage, "ROSE disposition") !== undefined && disposition === undefined) {
      diagnostics.add({ severity: "error", code: "DISPOSITION_INVALID", message: "ROSE disposition is outside the formal disposition set.", line: taskPackage.fields["ROSE disposition"]?.line, packageId: taskPackage.id, field: "ROSE disposition" });
    }
    if (status === "done" && disposition?.kind !== "accepted" && disposition?.kind !== "partially-accepted") {
      diagnostics.add({ severity: "error", code: "DONE_DISPOSITION_INVALID", message: "Done requires accepted or bounded partially-accepted disposition.", line: taskPackage.fields["ROSE disposition"]?.line, packageId: taskPackage.id, field: "ROSE disposition" });
    }
    if (status === "blocked" && !isConcrete(fieldValue(taskPackage, "Blocker"))) {
      diagnostics.add({ severity: "error", code: "BLOCKER_REQUIRED", message: "Blocked state requires a concrete blocker.", line: taskPackage.fields.Blocker?.line, packageId: taskPackage.id, field: "Blocker" });
    }
    if (!isConcrete(fieldValue(taskPackage, "Next action"))) {
      diagnostics.add({ severity: "error", code: "NEXT_ACTION_REQUIRED", message: "Every package requires a concrete Next action.", line: taskPackage.fields["Next action"]?.line, packageId: taskPackage.id, field: "Next action" });
    }
  }

  if (bridgeContext) {
    for (const taskPackage of board.packages) {
      const candidates = bridgePackageCandidates(parsedProgress.events, taskPackage.id);
      if (candidates.length === 0) continue;
      const reconciled = resolveBootstrapPackageReconciliation(
        taskPackage,
        parsedProgress.events,
        bridgeContext,
        diagnostics,
      );
      if (reconciled) bridgePackageReconciliations.set(taskPackage, reconciled);
    }
  }

  for (const taskPackage of board.packages) {
    const seen = new Set<string>();
    for (const dependency of taskPackage.dependencies) {
      if (dependency.length === 0 || dependency === "none" || !PACKAGE_ID_PATTERN.test(dependency)) {
        diagnostics.add({ severity: "error", code: "DEPENDENCY_ID_INVALID", message: "A dependency is not a stable package ID.", line: taskPackage.fields["Depends on"]?.line, packageId: taskPackage.id, field: "Depends on" });
        continue;
      }
      if (seen.has(dependency)) {
        diagnostics.add({ severity: "error", code: "DEPENDENCY_DUPLICATE", message: "A package lists the same dependency more than once.", line: taskPackage.fields["Depends on"]?.line, packageId: taskPackage.id, field: "Depends on" });
      }
      seen.add(dependency);
      if (!packageById.has(dependency) || duplicateIds.has(dependency)) {
        diagnostics.add({ severity: "error", code: "DEPENDENCY_MISSING", message: "A dependency does not resolve to one existing package.", line: taskPackage.fields["Depends on"]?.line, packageId: taskPackage.id, field: "Depends on" });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycleIds = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    const taskPackage = packageById.get(id);
    for (const dependency of taskPackage?.dependencies ?? []) {
      if (!packageById.has(dependency) || duplicateIds.has(dependency)) continue;
      if (visiting.has(dependency)) {
        const start = stack.indexOf(dependency);
        for (const cycleId of stack.slice(start)) cycleIds.add(cycleId);
      } else if (!visited.has(dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const taskPackage of board.packages) if (!duplicateIds.has(taskPackage.id)) visit(taskPackage.id);
  for (const taskPackage of board.packages) {
    if (cycleIds.has(taskPackage.id)) {
      diagnostics.add({ severity: "error", code: "DEPENDENCY_CYCLE", message: "The dependency graph contains a cycle.", line: taskPackage.fields["Depends on"]?.line, packageId: taskPackage.id, field: "Depends on" });
    }
  }

  for (const taskPackage of board.packages) {
    const status = statuses.get(taskPackage);
    if (status !== "ready" && status !== "running" && status !== "returned" && status !== "done") continue;
    for (const dependencyId of taskPackage.dependencies) {
      const dependency = packageById.get(dependencyId);
      if (dependency && statuses.get(dependency) !== "done") {
        diagnostics.add({ severity: "error", code: "DEPENDENCY_NOT_DONE", message: "A package advanced while a dependency was not done.", line: taskPackage.fields.Status?.line, packageId: taskPackage.id, field: "Status" });
      }
    }
  }

  for (const taskPackage of board.packages) {
    if (fieldValue(taskPackage, "Execution") !== "async") continue;
    if (board.packages.some((candidate) => candidate.dependencies.includes(taskPackage.id))) {
      diagnostics.add({ severity: "error", code: "ASYNC_DEPENDENCY_BOUND", message: "A package whose output is a dependency must use synchronous immediate execution.", line: taskPackage.fields.Execution?.line, packageId: taskPackage.id, field: "Execution" });
    }
  }

  const packageIds = new Set(board.packages.map((taskPackage) => taskPackage.id));
  for (const event of parsedProgress.events) {
    if (event.subject !== "BOARD" && PACKAGE_ID_PATTERN.test(event.subject) && !packageIds.has(event.subject)) {
      diagnostics.add({ severity: "error", code: "PROGRESS_SUBJECT_ORPHAN", message: "A progress event references no package in the board.", line: event.line, packageId: event.subject });
    }
    if (event.type === "BOARD_CREATED" && event.subject !== "BOARD") {
      diagnostics.add({ severity: "error", code: "PROGRESS_BOARD_CREATED_SUBJECT_INVALID", message: "BOARD_CREATED must use BOARD as its subject.", line: event.line, packageId: event.subject });
    }
    for (const field of event.fields) {
      if ((field.key === "evidence" || field.key === "verification") && !isPortableEvidence(field.value)) {
        diagnostics.add({ severity: "error", code: "PROGRESS_EVIDENCE_INVALID", message: "Progress evidence must use typed portable identifiers.", line: field.line, packageId: event.subject === "BOARD" ? undefined : event.subject, field: field.key });
      }
      if (field.key === "disposition" && parseDisposition(field.value) === undefined) {
        diagnostics.add({ severity: "error", code: "PROGRESS_DISPOSITION_INVALID", message: "Progress disposition is outside the formal disposition set.", line: field.line, packageId: event.subject === "BOARD" ? undefined : event.subject, field: field.key });
      }
      if ((field.key === "blocker" || field.key === "next_action") && !isConcrete(field.value)) {
        diagnostics.add({ severity: "error", code: "PROGRESS_FIELD_VALUE_INVALID", message: "Progress blocker and next action values must be concrete and bounded.", line: field.line, packageId: event.subject === "BOARD" ? undefined : event.subject, field: field.key });
      }
    }
  }

  const boardCreated = parsedProgress.events.filter((event) => event.subject === "BOARD" && event.type === "BOARD_CREATED");
  if (boardCreated.length === 0) {
    diagnostics.add({ severity: "error", code: "PROGRESS_BOARD_CREATED_MISSING", message: "Formal progress must begin with one BOARD BOARD_CREATED event.", field: "BOARD_CREATED" });
  } else {
    if (parsedProgress.events[0] !== boardCreated[0]) {
      diagnostics.add({ severity: "error", code: "PROGRESS_BOARD_CREATED_ORDER_INVALID", message: "BOARD_CREATED must be the first progress event.", line: boardCreated[0]!.line, field: "BOARD_CREATED" });
    }
    for (const duplicate of boardCreated.slice(1)) {
      diagnostics.add({ severity: "error", code: "PROGRESS_BOARD_CREATED_DUPLICATE", message: "BOARD_CREATED appears more than once.", line: duplicate.line, field: "BOARD_CREATED" });
    }
  }

  const eventsByPackage = new Map<string, FormalTaskProgressEvent[]>();
  for (const event of parsedProgress.events) {
    if (event.subject === "BOARD") continue;
    const events = eventsByPackage.get(event.subject) ?? [];
    events.push(event);
    eventsByPackage.set(event.subject, events);
  }
  const terminalEventTypes = new Set(["DONE", "CANCELLED"]);
  for (const taskPackage of board.packages) {
    let terminalSeen = false;
    const packageEvents = eventsByPackage.get(taskPackage.id) ?? [];
    for (const event of packageEvents) {
      if (terminalSeen && event.type !== "RECONCILED") {
        diagnostics.add({ severity: "error", code: "TERMINAL_EVENT_REOPEN", message: "Progress attempts to advance a terminal package ID.", line: event.line, packageId: taskPackage.id });
      }
      if (terminalEventTypes.has(event.type)) terminalSeen = true;
    }
    const status = statuses.get(taskPackage);
    const readyAnchor = [...packageEvents].reverse().find((event) => event.type === "READY");
    const blockedAnchors = packageEvents.filter((event) => event.type === "BLOCKED");
    const unblockedAnchors = packageEvents.filter((event) => event.type === "UNBLOCKED");
    const doneAnchor = firstEvent(packageEvents, "DONE");
    const cancelledAnchor = firstEvent(packageEvents, "CANCELLED");
    if (doneAnchor && status !== "done") {
      diagnostics.add({ severity: "error", code: "TERMINAL_STATUS_MISMATCH", message: "A DONE progress anchor requires current Status done.", line: doneAnchor.line, packageId: taskPackage.id, field: "Status" });
    }
    if (cancelledAnchor && status !== "cancelled") {
      diagnostics.add({ severity: "error", code: "TERMINAL_STATUS_MISMATCH", message: "A CANCELLED progress anchor requires current Status cancelled.", line: cancelledAnchor.line, packageId: taskPackage.id, field: "Status" });
    }
    if (status === "cancelled" && !cancelledAnchor) {
      diagnostics.add({ severity: "error", code: "CANCELLED_EVENT_MISSING", message: "Cancelled state requires a CANCELLED progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "CANCELLED" });
    }
    if (status === "blocked" && blockedAnchors.length === 0) {
      diagnostics.add({ severity: "error", code: "BLOCKED_EVENT_MISSING", message: "Blocked state requires a BLOCKED progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "BLOCKED" });
    }
    for (const blocked of blockedAnchors) {
      if (status === "blocked" && eventValue(blocked, "blocker") !== fieldValue(taskPackage, "Blocker") && blocked === blockedAnchors.at(-1)) {
        addRequiredEventDataDiagnostic(diagnostics, taskPackage, blocked, "blocker");
      }
    }
    for (const unblocked of unblockedAnchors) {
      const priorBlocked = blockedAnchors.some((blocked) => parsedProgress.events.indexOf(blocked) < parsedProgress.events.indexOf(unblocked));
      if (!priorBlocked) diagnostics.add({ severity: "error", code: "UNBLOCKED_ORDER_INVALID", message: "UNBLOCKED requires an earlier BLOCKED event.", line: unblocked.line, packageId: taskPackage.id, field: "UNBLOCKED" });
    }
    if (status === "pending") {
      const lastBlocked = [...packageEvents].reverse().find((event) => event.type === "BLOCKED");
      const lastUnblocked = [...packageEvents].reverse().find((event) => event.type === "UNBLOCKED");
      const hasUnclosedHistory = packageEvents.some((event) => event.type !== "RECONCILED") && lastBlocked === undefined;
      const remainsBlocked = lastBlocked !== undefined
        && (lastUnblocked === undefined || parsedProgress.events.indexOf(lastUnblocked) < parsedProgress.events.indexOf(lastBlocked));
      if (hasUnclosedHistory || remainsBlocked) {
        diagnostics.add({ severity: "error", code: "PROGRESS_STATUS_AHEAD", message: "Pending board state conflicts with recorded transition progress.", line: taskPackage.line, packageId: taskPackage.id, field: "Status" });
      }
    }
    if ((status === "ready" || status === "running" || status === "returned" || status === "done") && !readyAnchor) {
      diagnostics.add({ severity: "error", code: "READY_EVENT_MISSING", message: "An advanced package state requires a READY progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "READY" });
    }
    if (readyAnchor) {
      const latestTransition = [...packageEvents].reverse().find((event) => event.type === "DISPATCHED" || event.type === "RETURNED" || event.type === "INSPECTED" || event.type === "DONE");
      if (status !== "ready" && latestTransition && parsedProgress.events.indexOf(readyAnchor) > parsedProgress.events.indexOf(latestTransition)) {
        diagnostics.add({ severity: "error", code: "READY_EVENT_ORDER_INVALID", message: "READY must precede execution, result, inspection, and completion events.", line: readyAnchor.line, packageId: taskPackage.id, field: "READY" });
      }
    }
  }

  const joinedPackages = new Set<string>();
  for (const taskPackage of board.packages) {
    const packageEvents = eventsByPackage.get(taskPackage.id) ?? [];
    const status = statuses.get(taskPackage);
    const ownerKind = owners.get(taskPackage);
    const dispatch = fieldValue(taskPackage, "Dispatch");
    const execution = fieldValue(taskPackage, "Execution");
    const bridgeReconciled = bridgePackageReconciliations.get(taskPackage);
    const disposition = dispositions.get(taskPackage);

    const dispatched = [...packageEvents].reverse().find((event) => event.type === "DISPATCHED");
    const returned = [...packageEvents].reverse().find((event) => event.type === "RETURNED");
    if (ownerKind === "agent" && dispatch === "required" && (status === "running" || status === "returned" || status === "done")) {
      if (!dispatched && !bridgeReconciled) {
        diagnostics.add({ severity: "error", code: "DISPATCH_EVENT_MISSING", message: "A dispatched Agent state requires a DISPATCHED progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "DISPATCHED" });
      } else if (dispatched && eventValue(dispatched, "evidence") !== fieldValue(taskPackage, "Dispatch evidence")) {
        addRequiredEventDataDiagnostic(diagnostics, taskPackage, dispatched, "evidence");
      }
    }
    if (ownerKind === "agent" && dispatch === "required" && (status === "returned" || status === "done") && !returned && !bridgeReconciled) {
      diagnostics.add({ severity: "error", code: "RETURNED_EVENT_MISSING", message: "Returned or done Agent state requires a RETURNED progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "RETURNED" });
    }
    if (returned && eventValue(returned, "evidence") !== fieldValue(taskPackage, "Result evidence")) {
      addRequiredEventDataDiagnostic(diagnostics, taskPackage, returned, "evidence");
    }

    const done = firstEvent(packageEvents, "DONE");
    const historicalInspected = done
      ? lastEventBefore(parsedProgress.events, packageEvents, "INSPECTED", done)
      : firstEvent(packageEvents, "INSPECTED");
    const inspected = bridgeReconciled ?? historicalInspected;
    if (inspected) {
      const inspectedDisposition = parseDisposition(eventValue(inspected, "disposition"));
      const inspectedEvidence = isConcrete(eventValue(inspected, "evidence")) || isConcrete(eventValue(inspected, "blocker"));
      if (inspectedDisposition?.kind === "pending" || inspectedDisposition?.kind !== disposition?.kind || !inspectedEvidence) {
        addRequiredEventDataDiagnostic(diagnostics, taskPackage, inspected, "disposition|evidence|blocker");
      }
    }
    if (status === "done") {
      if (!done && !bridgeReconciled) {
        diagnostics.add({ severity: "error", code: "DONE_EVENT_MISSING", message: "Done state requires a DONE progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "DONE" });
      }
      if (!inspected) {
        diagnostics.add({ severity: "error", code: "INSPECTED_EVENT_MISSING", message: "Done state requires an earlier INSPECTED progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "INSPECTED" });
      }
      const verification = bridgeReconciled
        ? eventValue(bridgeReconciled, "verification") ?? eventValue(bridgeReconciled, "evidence")
        : done
          ? eventValue(done, "verification") ?? eventValue(done, "evidence")
          : undefined;
      if ((done || bridgeReconciled) && !isConcrete(verification)) {
        addRequiredEventDataDiagnostic(diagnostics, taskPackage, bridgeReconciled ?? done!, "verification");
      }
      if (ownerKind === "agent" && dispatch === "required" && dispatched && returned && historicalInspected && done && !bridgeReconciled) {
        const order = [dispatched, returned, historicalInspected, done].map((event) => parsedProgress.events.indexOf(event));
        if (order.some((value, index) => index > 0 && value <= order[index - 1]!)) {
          diagnostics.add({ severity: "error", code: "AGENT_EVENT_ORDER_INVALID", message: "Agent completion anchors are not in dispatch-return-inspect-done order.", line: done.line, packageId: taskPackage.id });
        }
      }
    } else if (status === "returned" && disposition?.kind !== "pending" && !inspected) {
      diagnostics.add({ severity: "error", code: "INSPECTED_EVENT_MISSING", message: "A dispositioned returned package requires an INSPECTED progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "INSPECTED" });
    }

    if (dispatch === "waived") {
      const waived = firstEvent(packageEvents, "WAIVED");
      if (dispatched) {
        diagnostics.add({ severity: "error", code: "WAIVER_DISPATCH_CONFLICT", message: "A waived direct package cannot also contain a DISPATCHED anchor.", line: dispatched.line, packageId: taskPackage.id, field: "WAIVED|DISPATCHED" });
      }
      if (!waived) {
        diagnostics.add({ severity: "error", code: "WAIVER_EVENT_MISSING", message: "A waived package requires a pre-recorded WAIVED progress anchor.", line: taskPackage.line, packageId: taskPackage.id, field: "WAIVED" });
      } else {
        const validWaiverData = eventValue(waived, "evidence") === fieldValue(taskPackage, "Dispatch evidence");
        if (!validWaiverData) addRequiredEventDataDiagnostic(diagnostics, taskPackage, waived, "evidence");
        const firstDirectCompletion = inspected ?? done;
        if (firstDirectCompletion && parsedProgress.events.indexOf(waived) >= parsedProgress.events.indexOf(firstDirectCompletion)) {
          diagnostics.add({ severity: "error", code: "WAIVER_NOT_PRE_RECORDED", message: "WAIVED must precede direct inspection and completion evidence.", line: waived.line, packageId: taskPackage.id, field: "WAIVED" });
        }
      }
    }

    if (execution === "async") {
      const joined = [...packageEvents].reverse().find((event) => event.type === "JOINED");
      if (joined) {
        const joinedDisposition = parseDisposition(eventValue(joined, "disposition"));
        const validEvidence = isConcrete(eventValue(joined, "evidence")) || isConcrete(eventValue(joined, "blocker"));
        if (disposition?.kind === "pending"
          || joinedDisposition?.kind !== disposition?.kind
          || !validEvidence) {
          addRequiredEventDataDiagnostic(diagnostics, taskPackage, joined, "disposition|evidence|blocker");
        } else {
          joinedPackages.add(taskPackage.id);
        }
        if (!inspected) {
          diagnostics.add({ severity: "error", code: "ASYNC_JOIN_INSPECTION_MISSING", message: "JOINED requires an earlier INSPECTED progress anchor.", line: joined.line, packageId: taskPackage.id, field: "JOINED" });
        }
        if (status === "pending" || status === "ready" || status === "running") {
          diagnostics.add({ severity: "error", code: "ASYNC_JOIN_PREMATURE", message: "JOINED cannot close an unsettled async package.", line: joined.line, packageId: taskPackage.id, field: "JOINED" });
        }
        if (inspected && parsedProgress.events.indexOf(joined) <= parsedProgress.events.indexOf(inspected)) {
          diagnostics.add({ severity: "error", code: "ASYNC_JOIN_ORDER_INVALID", message: "JOINED must follow ROSE inspection and disposition.", line: joined.line, packageId: taskPackage.id, field: "JOINED" });
        }
        if (done && parsedProgress.events.indexOf(joined) >= parsedProgress.events.indexOf(done)) {
          diagnostics.add({ severity: "error", code: "ASYNC_JOIN_ORDER_INVALID", message: "JOINED must precede DONE.", line: joined.line, packageId: taskPackage.id, field: "JOINED" });
        }
      }
      if (status === "done" && !joined) {
        diagnostics.add({ severity: "error", code: "ASYNC_JOIN_ANCHOR_MISSING", message: "A completed async package requires a JOINED progress anchor after ROSE inspection.", line: taskPackage.line, packageId: taskPackage.id, field: "JOINED" });
      }
    }

    if (status === "done" && disposition?.kind === "partially-accepted" && !hasBoundedPartialDisposition(disposition, taskPackage, board.packages)) {
      diagnostics.add({ severity: "error", code: "PARTIAL_DISPOSITION_UNBOUNDED", message: "Partially accepted done state must name a residual package or an accepted bounded limitation.", line: taskPackage.fields["ROSE disposition"]?.line, packageId: taskPackage.id, field: "ROSE disposition" });
    }
  }

  for (const taskPackage of board.packages) {
    const status = statuses.get(taskPackage);
    if (status !== "ready" && status !== "running" && status !== "returned" && status !== "done") continue;
    for (const dependencyId of taskPackage.dependencies) {
      const dependency = packageById.get(dependencyId);
      if (dependency && fieldValue(dependency, "Execution") === "async" && !joinedPackages.has(dependency.id)) {
        diagnostics.add({ severity: "error", code: "DEPENDENCY_JOIN_OPEN", message: "A package advanced before its async dependency join closed.", line: taskPackage.fields.Status?.line, packageId: taskPackage.id, field: "Status" });
      }
    }
  }

  if (boardStatus === "done") {
    for (const taskPackage of board.packages) {
      const status = statuses.get(taskPackage);
      if (status !== "done" && status !== "cancelled") {
        diagnostics.add({ severity: "error", code: "BOARD_DONE_NONTERMINAL", message: "Board done cannot hide a nonterminal noncancelled package.", line: taskPackage.fields.Status?.line, packageId: taskPackage.id, field: "Board status" });
      }
      if (fieldValue(taskPackage, "Execution") === "async" && status !== "cancelled" && !joinedPackages.has(taskPackage.id)) {
        diagnostics.add({ severity: "error", code: "BOARD_DONE_OPEN_JOIN", message: "Board done cannot hide an open async join.", line: taskPackage.fields.Join?.line, packageId: taskPackage.id, field: "Join" });
      }
    }

    const boardEvents = parsedProgress.events.filter((event) => event.subject === "BOARD");
    const boardDone = firstEvent(boardEvents, "DONE");
    const boardInspected = boardDone
      ? lastEventBefore(parsedProgress.events, boardEvents, "INSPECTED", boardDone)
      : firstEvent(boardEvents, "INSPECTED");
    if (!boardInspected) {
      diagnostics.add({ severity: "error", code: "BOARD_DONE_INSPECTION_MISSING", message: "Board done requires an earlier BOARD INSPECTED anchor.", field: "Board status" });
    } else if (!isConcrete(eventValue(boardInspected, "evidence"))) {
      diagnostics.add({ severity: "error", code: "BOARD_DONE_INSPECTION_INVALID", message: "BOARD INSPECTED requires bounded phase-appropriate inspection evidence.", line: boardInspected.line, field: "Board status" });
    }
    if (!boardDone) {
      diagnostics.add({ severity: "error", code: "BOARD_DONE_EVENT_MISSING", message: "Board done requires a BOARD DONE anchor.", field: "Board status" });
    } else if (!isConcrete(eventValue(boardDone, "verification"))) {
      diagnostics.add({ severity: "error", code: "BOARD_DONE_VERIFICATION_MISSING", message: "BOARD DONE requires fresh claim-matched verification evidence.", line: boardDone.line, field: "Board status" });
    }
    if (boardInspected) {
      const inspectedIndex = parsedProgress.events.indexOf(boardInspected);
      for (const taskPackage of board.packages) {
        const status = statuses.get(taskPackage);
        const packageEvents = eventsByPackage.get(taskPackage.id) ?? [];
        const packageClosure = status === "done"
          ? firstEvent(packageEvents, "DONE")
          : status === "cancelled"
            ? firstEvent(packageEvents, "CANCELLED")
            : undefined;
        const joined = fieldValue(taskPackage, "Execution") === "async" && status !== "cancelled"
          ? firstEvent(packageEvents, "JOINED")
          : undefined;
        if ((packageClosure && parsedProgress.events.indexOf(packageClosure) >= inspectedIndex)
          || (joined && parsedProgress.events.indexOf(joined) >= inspectedIndex)) {
          diagnostics.add({ severity: "error", code: "BOARD_DONE_ORDER_INVALID", message: "BOARD INSPECTED must follow every package terminal and join anchor.", line: boardInspected.line, packageId: taskPackage.id, field: "Board status" });
        }
      }
    }
  }

  const activeBoardDone = firstEvent(parsedProgress.events.filter((event) => event.subject === "BOARD"), "DONE");
  if (activeBoardDone && boardStatus !== "done") {
    diagnostics.add({ severity: "error", code: "BOARD_DONE_STATUS_MISMATCH", message: "A BOARD DONE anchor requires Board status done.", line: activeBoardDone.line, field: "Board status" });
  }
  const boardEvents = parsedProgress.events.filter((event) => event.subject === "BOARD");
  let boardTerminalSeen = false;
  for (const event of boardEvents) {
    if (boardTerminalSeen && event.type !== "RECONCILED") {
      diagnostics.add({ severity: "error", code: "BOARD_TERMINAL_EVENT_REOPEN", message: "Progress attempts to advance a terminal Board.", line: event.line, field: "Board status" });
    }
    if (event.type === "DONE" || event.type === "CANCELLED") boardTerminalSeen = true;
  }

  if (bridgeContext && bridgePackageReconciliations.size === 0) {
    diagnostics.add({
      severity: "error",
      code: "BRIDGE_PACKAGE_RECONCILIATION_MISSING",
      message: "The bootstrap bridge cannot be active without at least one exact package RECONCILED limitation.",
      field: "RECONCILED",
    });
  }
  const bridgeLimitations: FormalTaskBoardBootstrapLimitation[] = [];
  for (const [taskPackage, reconciled] of bridgePackageReconciliations) {
    bridgeLimitations.push({
      packageId: taskPackage.id,
      runtime: "direct",
      acceptedLimitation: eventValue(reconciled, "limitation")!,
    });
    diagnostics.add({
      severity: "info",
      code: "BOOTSTRAP_BRIDGE_LIMITATION",
      message: "Historical terminal anchors are supplied only by append-only bootstrap reconciliation.",
      line: reconciled.line,
      packageId: taskPackage.id,
      field: "RECONCILED",
    });
  }

  const sorted = sortDiagnostics(diagnostics.diagnostics);
  return {
    classification: "v1",
    valid: sorted.every((diagnostic) => diagnostic.severity !== "error"),
    board,
    progress: parsedProgress,
    bridge: bridgeContext
      ? {
          taskIdentity: bridgeContext.identity.taskIdentity,
          userDecisionRef: bridgeContext.identity.userDecisionRef,
          transport: bridgeContext.identity.transport,
          strictDefault: "preserved",
          limitations: bridgeLimitations,
        }
      : undefined,
    diagnostics: sorted,
  };
}
