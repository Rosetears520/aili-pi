import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { detectLifecycleConflicts } from "./conflicts.js";
import {
  FORMAL_TASK_BOARD_HEADERS,
  FORMAL_TASK_BOARD_PROTOCOL,
  FORMAL_TASK_PACKAGE_FIELDS,
  FORMAL_TASK_PROGRESS_EVENT_TYPES,
} from "./formal-task-board.js";
import { loadRegistry, validateLiveVerification, validateProvenance, validateRegistry } from "./registry.js";
import { inspectGlobalResources } from "./global-resources.js";
import { nativeIntegrationDiagnostics } from "./native-integrations.js";
import { validateRoleProfiles } from "./roles.js";
import { loadWorkflowRuntimeBundle } from "./workflow-bundle/index.js";
import { MCP_ADAPTER_VERSION, mcpConfigEvidencePath } from "./mcp.js";
import { BILLION_CONTEXT_VERSION, CODEX_COMPACT_VERSION } from "./context-runtime.js";
import { PROVIDER_RETRY_VERSION } from "./provider-retry.js";
import { MEMPALACE_PATH, MEMPALACE_VERSION } from "./mempalace.js";

export type DoctorStatus = "PASS" | "WARN" | "SKIP" | "ERROR" | "UNVERIFIED";

export interface DoctorResult {
  id: string;
  status: DoctorStatus;
  evidence: string;
}

export interface DoctorReport {
  schemaVersion: 1;
  status: "PASS" | "NON_PASS";
  results: DoctorResult[];
}

const ROOT = new URL("../../", import.meta.url);

export type SharedWorkflowCompatibility = "present-compatible" | "missing" | "incompatible" | "unverified";
export type SharedWorkflowSourceMatch = "exact" | "compatible-newer" | "modified" | "unknown";

export interface SharedWorkflowInspection {
  compatibility: SharedWorkflowCompatibility;
  sourceMatch: SharedWorkflowSourceMatch;
  references: { readable: number; required: 2 };
  protocols: { compatible: number; required: 2 };
  roles: { observed: number; required: number };
  reasons: string[];
}

const AGENT_SELECTION_PROTOCOL = "aili-agent-selection/v1";
const SHARED_WORKFLOW_RELEASE = "0.4.7";
const SHARED_REFERENCE_MAX_BYTES = 256 * 1024;
const AGENT_SELECTION_PATH = ".agents/skills/parallel-subagent-dispatch/references/agent-selection-matrix.md";
const FORMAL_TASK_BOARD_PATH = ".agents/skills/aili-delivery-flow/references/formal-task-board.md";

interface SharedProtocolRecord {
  protocol: string;
  path: string;
  sha256: string;
}

interface SharedWorkflowContract {
  agentSelection: SharedProtocolRecord;
  formalTaskBoard: SharedProtocolRecord;
  canonicalSpecialists: string[];
}

type SharedReferenceRead =
  | { state: "readable"; bytes: Buffer; text: string }
  | { state: "missing"; reason: string }
  | { state: "unverified"; reason: string };

/** Read-only compatibility inspection for the two shared workflow protocol references. */
export async function inspectSharedWorkflows(home = homedir()): Promise<SharedWorkflowInspection> {
  if (!home || !isAbsolute(home)) return sharedWorkflowInspection("unverified", "unknown", 0, 0, 0, ["home-unavailable"]);
  const contract = await loadSharedWorkflowContract();
  if (!contract) return sharedWorkflowInspection("unverified", "unknown", 0, 0, 0, ["contract-unavailable"]);

  const records = [contract.agentSelection, contract.formalTaskBoard] as const;
  const reads = await Promise.all(records.map((record) => readSharedReference(join(home, record.path))));
  const readable = reads.filter((item): item is Extract<SharedReferenceRead, { state: "readable" }> => item.state === "readable");
  const sourceMatch: SharedWorkflowSourceMatch = readable.length !== records.length
    ? "unknown"
    : readable.every((item, index) => sha256(item.bytes) === records[index]!.sha256)
      ? "exact"
      : "modified";
  const agent = reads[0]!.state === "readable" ? inspectAgentSelection(reads[0]!.text, contract.canonicalSpecialists) : undefined;
  const board = reads[1]!.state === "readable" ? inspectFormalTaskBoardReference(reads[1]!.text) : undefined;
  const protocols = Number(agent?.protocolCompatible ?? false) + Number(board?.protocolCompatible ?? false);
  const observedRoles = agent?.observedRoles ?? 0;

  const missing = reads.filter((item) => item.state === "missing");
  if (missing.length > 0) {
    return sharedWorkflowInspection("missing", "unknown", readable.length, protocols, observedRoles, ["required-reference-missing"]);
  }
  const ambiguous = reads.filter((item): item is Extract<SharedReferenceRead, { state: "unverified" }> => item.state === "unverified");
  if (ambiguous.length > 0) {
    return sharedWorkflowInspection("unverified", "unknown", readable.length, protocols, observedRoles, uniqueReasons(ambiguous.map((item) => item.reason)));
  }

  const reasons = uniqueReasons([...agent!.reasons, ...board!.reasons]);
  return sharedWorkflowInspection(
    reasons.length === 0 ? "present-compatible" : "incompatible",
    sourceMatch,
    2,
    protocols,
    observedRoles,
    reasons.length === 0 ? ["compatible"] : reasons,
  );
}

function sharedWorkflowInspection(
  compatibility: SharedWorkflowCompatibility,
  sourceMatch: SharedWorkflowSourceMatch,
  readable: number,
  protocols: number,
  observedRoles: number,
  reasons: string[],
): SharedWorkflowInspection {
  return {
    compatibility,
    sourceMatch,
    references: { readable: Math.min(2, Math.max(0, readable)), required: 2 },
    protocols: { compatible: Math.min(2, Math.max(0, protocols)), required: 2 },
    roles: { observed: Math.min(99, Math.max(0, observedRoles)), required: 20 },
    reasons: uniqueReasons(reasons).slice(0, 4),
  };
}

async function loadSharedWorkflowContract(): Promise<SharedWorkflowContract | undefined> {
  try {
    const value = JSON.parse(await readFile(new URL("upstream/aili-workflows.lock.json", ROOT), "utf8")) as {
      release?: {
        version?: unknown;
        protocols?: { agentSelection?: Partial<SharedProtocolRecord>; formalTaskBoard?: Partial<SharedProtocolRecord> };
        canonicalSpecialists?: unknown;
      };
    };
    const agentSelection = value.release?.protocols?.agentSelection;
    const formalTaskBoard = value.release?.protocols?.formalTaskBoard;
    const roles = value.release?.canonicalSpecialists;
    if (value.release?.version !== SHARED_WORKFLOW_RELEASE
      || !validProtocolRecord(agentSelection, AGENT_SELECTION_PROTOCOL, AGENT_SELECTION_PATH)
      || !validProtocolRecord(formalTaskBoard, FORMAL_TASK_BOARD_PROTOCOL, FORMAL_TASK_BOARD_PATH)
      || !Array.isArray(roles)
      || roles.length !== 20
      || roles.some((role) => typeof role !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(role))
      || new Set(roles).size !== roles.length) {
      return undefined;
    }
    return {
      agentSelection: agentSelection as SharedProtocolRecord,
      formalTaskBoard: formalTaskBoard as SharedProtocolRecord,
      canonicalSpecialists: [...roles] as string[],
    };
  } catch {
    return undefined;
  }
}

function validProtocolRecord(
  record: Partial<SharedProtocolRecord> | undefined,
  protocol: string,
  path: string,
): record is SharedProtocolRecord {
  return record?.protocol === protocol && record.path === path && typeof record.sha256 === "string" && /^[a-f0-9]{64}$/.test(record.sha256);
}

async function readSharedReference(path: string): Promise<SharedReferenceRead> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const initial = await lstat(path);
    if (initial.isSymbolicLink()) return { state: "unverified", reason: "reference-symlink" };
    if (!initial.isFile()) return { state: "unverified", reason: "reference-not-regular" };
    if (initial.size > SHARED_REFERENCE_MAX_BYTES) return { state: "unverified", reason: "reference-size-limit" };

    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!before.isFile()) return { state: "unverified", reason: "reference-not-regular" };
    if (before.size > SHARED_REFERENCE_MAX_BYTES) return { state: "unverified", reason: "reference-size-limit" };
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.byteLength !== before.size) {
      return { state: "unverified", reason: "reference-read-ambiguous" };
    }
    try {
      return { state: "readable", bytes, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    } catch {
      return { state: "unverified", reason: "reference-encoding-invalid" };
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", reason: "required-reference-missing" }
      : { state: "unverified", reason: "reference-io-unverified" };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function inspectAgentSelection(text: string, requiredRoles: readonly string[]): {
  protocolCompatible: boolean;
  observedRoles: number;
  reasons: string[];
} {
  const protocolCompatible = hasOnlyProtocolMarkers(text, AGENT_SELECTION_PROTOCOL, "## Selection matrix");
  const reasons: string[] = protocolCompatible ? [] : ["agent-protocol-invalid"];
  const section = markdownSection(text, "## Selection matrix", "## Selection algorithm");
  const lines = section?.split(/\r?\n/) ?? [];
  const header = "| Role ID | Use when | Do not use when | Expected evidence | Phase affinity | Execution guidance |";
  const headerIndex = lines.indexOf(header);
  if (headerIndex < 0 || !/^\|(?:\s*:?-{3,}:?\s*\|){6}$/.test(lines[headerIndex + 1] ?? "")) {
    reasons.push("agent-structure-invalid");
    return { protocolCompatible, observedRoles: 0, reasons };
  }
  const rows: string[][] = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith("|")) break;
    if (!line.endsWith("|")) {
      reasons.push("agent-structure-invalid");
      break;
    }
    rows.push(line.slice(1, -1).split("|").map((cell) => cell.trim()));
  }
  const roleIds = rows.map((cells) => /^`([a-z0-9]+(?:-[a-z0-9]+)*)`$/.exec(cells[0] ?? "")?.[1]);
  if (rows.some((cells) => cells.length !== 6 || cells.some((cell) => cell.length === 0) || !/^`[a-z0-9]+(?:-[a-z0-9]+)*`$/.test(cells[0] ?? ""))) {
    reasons.push("agent-structure-invalid");
  }
  const observed = roleIds.filter((role): role is string => role !== undefined);
  const expected = new Set(requiredRoles);
  if (observed.length !== requiredRoles.length
    || new Set(observed).size !== observed.length
    || observed.some((role) => !expected.has(role))
    || requiredRoles.some((role) => !observed.includes(role))) {
    reasons.push("agent-role-inventory-invalid");
  }
  return { protocolCompatible, observedRoles: observed.length, reasons: uniqueReasons(reasons) };
}

function inspectFormalTaskBoardReference(text: string): { protocolCompatible: boolean; reasons: string[] } {
  const protocolCompatible = hasOnlyProtocolMarkers(text, FORMAL_TASK_BOARD_PROTOCOL, "## Creation and placement");
  const reasons: string[] = protocolCompatible ? [] : ["board-protocol-invalid"];
  const header = firstMarkdownFence(markdownSection(text, "## Board header", "## Package contract"));
  const taskPackage = firstMarkdownFence(markdownSection(text, "## Package contract", "## Package kinds and source references"));
  const progress = firstMarkdownFence(markdownSection(text, "## Progress events"));
  if (!header || !taskPackage || !progress
    || !hasRequiredFields(header, FORMAL_TASK_BOARD_HEADERS, "- ")
    || !taskPackage.split(/\r?\n/).includes("- [ ] <package-id> — <title>")
    || !hasRequiredFields(taskPackage, FORMAL_TASK_PACKAGE_FIELDS, "  - ")
    || !hasExactUniqueLines(progress, FORMAL_TASK_PROGRESS_EVENT_TYPES)) {
    reasons.push("board-structure-invalid");
  }
  return { protocolCompatible, reasons: uniqueReasons(reasons) };
}

function hasOnlyProtocolMarkers(text: string, expected: string, preambleEnd: string): boolean {
  const markers = [...text.matchAll(/^- Protocol: `([^`]+)`\s*$/gm)].map((match) => match[1]);
  const preamble = text.slice(0, text.indexOf(preambleEnd) < 0 ? 0 : text.indexOf(preambleEnd));
  return markers.length > 0 && markers.every((marker) => marker === expected)
    && preamble.split(/\r?\n/).includes(`- Protocol: \`${expected}\``);
}

function markdownSection(text: string, start: string, end?: string): string | undefined {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return undefined;
  const contentStart = startIndex + start.length;
  const endIndex = end ? text.indexOf(end, contentStart) : text.length;
  return endIndex < 0 ? undefined : text.slice(contentStart, endIndex);
}

function firstMarkdownFence(section: string | undefined): string | undefined {
  return section?.match(/```(?:markdown|text)\r?\n([\s\S]*?)\r?\n```/)?.[1];
}

function hasRequiredFields(text: string, fields: readonly string[], prefix: string): boolean {
  const lines = text.split(/\r?\n/);
  return fields.every((field) => lines.filter((line) => line.startsWith(`${prefix}${field}: \``) && line.endsWith("`")).length === 1);
}

function hasExactUniqueLines(text: string, values: readonly string[]): boolean {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length === values.length && values.every((value) => lines.filter((line) => line === value).length === 1);
}

function uniqueReasons(reasons: readonly string[]): string[] {
  return [...new Set(reasons)];
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sharedWorkflowDoctorResult(inspection: SharedWorkflowInspection): DoctorResult {
  const remediation = inspection.compatibility === "missing"
    ? `npx -y rose-aili@${SHARED_WORKFLOW_RELEASE} install`
    : inspection.compatibility === "present-compatible"
      ? "none"
      : `npx -y rose-aili@${SHARED_WORKFLOW_RELEASE} update`;
  const status: DoctorStatus = inspection.compatibility === "present-compatible"
    ? "PASS"
    : inspection.compatibility === "unverified" ? "UNVERIFIED" : "ERROR";
  return {
    id: "shared.workflows",
    status,
    evidence: [
      `compatibility=${inspection.compatibility}`,
      `source_match=${inspection.sourceMatch}`,
      `references=${inspection.references.readable}/${inspection.references.required}`,
      `protocols=${inspection.protocols.compatible}/${inspection.protocols.required}`,
      `roles=${inspection.roles.observed}/${inspection.roles.required}`,
      `reason=${inspection.reasons.join(",") || "unknown"}`,
      `remediation=${remediation}`,
    ].join("; ").slice(0, 360),
  };
}

export async function runDoctor(
  pi: Pick<ExtensionAPI, "getCommands">,
  options: {
    platform?: NodeJS.Platform;
    home?: string;
  } = {},
): Promise<DoctorReport> {
  const results: DoctorResult[] = [];
  try {
    const packageJson = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8")) as {
      version?: string;
      engines?: { node?: string };
      pi?: { extensions?: string[]; prompts?: string[]; skills?: string[]; themes?: string[] };
    };
    const dependencies = (packageJson as { dependencies?: Record<string, string> }).dependencies ?? {};
    const expectedDependencies = ["@narumitw/pi-codex-compact@0.50.0", "acp-kernel@0.0.19", "pi-mcp-adapter@2.23.0", "pi-permission-modes@2.2.0", "pi-quota-status@0.3.0", "pi-web-access@0.13.0"];
    const dependencyState = expectedDependencies.every((entry) => {
      const separator = entry.lastIndexOf("@");
      return dependencies[entry.slice(0, separator)] === entry.slice(separator + 1);
    });
    results.push({ id: "package", status: dependencyState ? "PASS" : "ERROR", evidence: `version=${packageJson.version ?? "unverified"}; node=${packageJson.engines?.node ?? "unverified"}; native_dependencies=${dependencyState ? "exact" : "drift"}` });
    const resources = [...(packageJson.pi?.extensions ?? []), ...(packageJson.pi?.skills ?? []), ...(packageJson.pi?.themes ?? [])];
    const expectedResources = ["./extensions/index.ts", "./node_modules/pi-web-access/skills"];
    const resourceState = packageJson.pi?.prompts === undefined
      && resources.length === expectedResources.length
      && expectedResources.every((resource) => resources.includes(resource));
    results.push({ id: "package.resources", status: resourceState ? "PASS" : "ERROR", evidence: `declared=${resources.length}; prompts=${packageJson.pi?.prompts === undefined ? "rose-aili-owned" : "duplicate"}; native_ui=${resourceState ? "minimal-footer" : "drift"}; web_skill=${resourceState ? "pi-web-access@0.13.0" : "drift"}; foreground_web=excluded` });
  } catch (error) {
    results.push({ id: "package", status: "ERROR", evidence: boundedError(error) });
  }

  try {
    const [lock, bundle] = await Promise.all([
      readFile(new URL("upstream/aili-workflows.lock.json", ROOT), "utf8").then((content) => JSON.parse(content) as {
        commit?: string; contentHash?: string; skillCount?: number; fileCount?: number;
      }),
      loadWorkflowRuntimeBundle(),
    ]);
    results.push({ id: "skill.snapshot", status: lock.commit && lock.contentHash ? "PASS" : "ERROR", evidence: `commit=${lock.commit ?? "missing"}; hash=${lock.contentHash ?? "missing"}; skills=${lock.skillCount ?? "missing"}; files=${lock.fileCount ?? "missing"}` });
    results.push({ id: "workflow.bundle", status: "PASS", evidence: `release=${bundle.package}@${bundle.version}; commit=${bundle.commit}; specialists=${bundle.canonicalSpecialists.length}; artifacts=${Object.keys(bundle.protocols).length + 5}` });
  } catch (error) {
    results.push({ id: "skill.snapshot", status: "ERROR", evidence: boundedError(error) });
    results.push({ id: "workflow.bundle", status: "ERROR", evidence: boundedError(error) });
  }

  try {
    results.push(sharedWorkflowDoctorResult(await inspectSharedWorkflows(options.home)));
  } catch {
    results.push(sharedWorkflowDoctorResult(sharedWorkflowInspection("unverified", "unknown", 0, 0, 0, ["inspection-failed"])));
  }

  results.push({
    id: "context.runtime",
    status: "PASS",
    evidence: `codex=pi-codex-compact@${CODEX_COMPACT_VERSION}; other=billion-context-pi@${BILLION_CONTEXT_VERSION}; route=turn-frozen; retry_owner=pi`,
  });
  results.push({
    id: "provider.retry",
    status: "PASS",
    evidence: `classifier=pi-retry@${PROVIDER_RETRY_VERSION}; attempts_budget_backoff=pi-0.84.1; diagnostics=bounded-redacted`,
  });
  results.push({
    id: "memory.mempalace",
    status: "UNVERIFIED",
    evidence: `version=${MEMPALACE_VERSION}; palace=${MEMPALACE_PATH}; source=mcp-only; runtime_health=operation-evidence-required; fallback=none`,
  });

  const commands = pi.getCommands();
  const conflicts = detectLifecycleConflicts(commands);
  results.push({ id: "rose.prompts", status: conflicts.length === 0 ? "PASS" : "ERROR", evidence: conflicts.length === 0 ? "Workflow prompts have one rose-aili global owner" : `conflicts=${conflicts.map((item) => item.name).join(",")}` });
  results.push(await inspectPiCompactionSettings(options.home));
  try {
    results.push({
      id: "mcp.runtime",
      status: "PASS",
      evidence: `adapter=pi-mcp-adapter@${MCP_ADAPTER_VERSION}; config=${mcpConfigEvidencePath({ HOME: options.home })}; status=lazy-event-snapshot; transport_probe=not-run`,
    });
  } catch (error) {
    results.push({ id: "mcp.runtime", status: "ERROR", evidence: boundedError(error) });
  }

  try {
    const errors = await validateRegistry();
    const { capabilities, compatibility } = await loadRegistry();
    results.push({ id: "capability.registry", status: errors.length === 0 ? "PASS" : "ERROR", evidence: errors.length === 0 ? `capabilities=${capabilities.capabilities.length}; skills=${compatibility.records.length}` : errors.slice(0, 5).join("; ") });
    const optional = capabilities.capabilities.filter((item) => item.class === "optional");
    results.push({ id: "optional.packs", status: "SKIP", evidence: optional.map((item) => `${item.id}:${item.optionalPack?.id}`).join(",") });
  } catch (error) {
    results.push({ id: "capability.registry", status: "ERROR", evidence: boundedError(error) });
  }

  try {
    const [profileErrors] = await Promise.all([
      validateRoleProfiles(),
      ...[
        "src/runtime/persistent-agents/runtime.ts",
        "src/runtime/persistent-agents/storage.ts",
        "src/runtime/persistent-agents/task-coordinator.ts",
        "src/runtime/persistent-agents/hub.ts",
        "src/runtime/persistent-agents/output-delivery.ts",
      ].map((path) => readFile(new URL(path, ROOT), "utf8")),
    ]);
    results.push({
      id: "roles.agents",
      status: profileErrors.length === 0 ? "PASS" : "ERROR",
      evidence: profileErrors.length === 0 ? "profiles=21; selectors=20 specialized + general" : profileErrors.slice(0, 3).join("; "),
    });
    const liveErrors = await validateLiveVerification();
    results.push({
      id: "agent.framework",
      status: profileErrors.length > 0 ? "ERROR" : liveErrors.length > 0 ? "UNVERIFIED" : "PASS",
      evidence: profileErrors.length > 0
        ? `public runtime registered but profile validation failed: ${profileErrors.slice(0, 3).join("; ")}`
        : liveErrors.length > 0
          ? `public tools=task,hub; deterministic runtime gates pass; ${liveErrors.slice(0, 2).join("; ")}`
          : "public tools=task,hub; legacy subagent absent; deterministic and Pi 0.84.1 provider/sandbox/external-workspace lifecycle gates pass",
    });
  } catch (error) {
    results.push({ id: "agent.framework", status: "ERROR", evidence: boundedError(error) });
  }
  results.push({ id: "permission.native", ...nativeIntegrationDiagnostics(pi.getCommands()) });
  try {
    const global = await inspectGlobalResources(options.home);
    results.push({ id: "global.resources", status: "PASS", evidence: `ownership=${global.ownership}; legacy_append=${global.appendSystem}; legacy_roles=${global.roles.stale.length}; action=report-only; path=${global.roleDirectory}` });
  } catch (error) {
    results.push({ id: "global.resources", status: "ERROR", evidence: boundedError(error) });
  }
  const platform = options.platform ?? process.platform;
  results.push({ id: "platform", status: platform === "linux" ? "PASS" : "ERROR", evidence: `platform=${platform}; supported=linux; node=${process.version}` });
  const provenanceErrors = await validateProvenance();
  results.push({ id: "provenance", status: provenanceErrors.length === 0 ? "PASS" : "ERROR", evidence: provenanceErrors.length === 0 ? "notices and SPDX SBOM are complete" : provenanceErrors.slice(0, 3).join("; ") });

  return {
    schemaVersion: 1,
    status: results.every((item) => item.status === "PASS" || item.status === "SKIP") ? "PASS" : "NON_PASS",
    results,
  };
}

export function assessPiCompactionSettings(globalText: string | undefined, projectText?: string): DoctorResult {
  const global = parsePiSettings(globalText);
  if (global.state === "malformed" || global.state === "non-object") {
    return { id: "pi.compaction", status: "ERROR", evidence: `global=${global.state}; project=not-evaluated` };
  }
  const project = parsePiSettings(projectText);
  if (project.state === "malformed" || project.state === "non-object") {
    return { id: "pi.compaction", status: "ERROR", evidence: `global=${settingsLocationState(global)}; project=${project.state}` };
  }
  const globalValue = global.state === "valid" ? global.value.compaction?.enabled : undefined;
  const projectValue = project.state === "valid" ? project.value.compaction?.enabled : undefined;
  if ((globalValue !== undefined && typeof globalValue !== "boolean")
    || (projectValue !== undefined && typeof projectValue !== "boolean")) {
    return { id: "pi.compaction", status: "ERROR", evidence: `global=${settingsLocationState(global)}; project=${settingsLocationState(project)}; value=invalid-type` };
  }
  const effective = typeof projectValue === "boolean" ? projectValue : typeof globalValue === "boolean" ? globalValue : true;
  const explicitTrue = projectValue === true || (projectValue === undefined && globalValue === true);
  return effective
    ? {
      id: "pi.compaction",
      status: "PASS",
      evidence: `nativeAutomaticFallback=enabled; nativeAutomaticFallbackProvenance=${explicitTrue ? "explicit-user" : "unknown"}; global=${settingsLocationState(global)}; project=${settingsLocationState(project)}`,
    }
    : {
      id: "pi.compaction",
      status: "UNVERIFIED",
      evidence: `nativeAutomaticFallback=disabled-config; nativeAutomaticFallbackProvenance=unknown; global=${settingsLocationState(global)}; project=${settingsLocationState(project)}; manual=available`,
    };
}

export async function inspectPiCompactionSettings(home = process.env.HOME, cwd = process.cwd()): Promise<DoctorResult> {
  if (!home) return { id: "pi.compaction", status: "ERROR", evidence: "global=home-unavailable; project=not-evaluated" };
  const global = await readOptionalSettings(join(home, ".pi", "agent", "settings.json"));
  if (global.state === "unreadable") return { id: "pi.compaction", status: "ERROR", evidence: "global=unreadable; project=not-evaluated" };
  const project = await readOptionalSettings(join(cwd, ".pi", "settings.json"));
  if (project.state === "unreadable") return { id: "pi.compaction", status: "ERROR", evidence: "global=unchecked; project=unreadable" };
  return assessPiCompactionSettings(global.text, project.text);
}

function parsePiSettings(text: string | undefined): { state: "valid"; value: { compaction?: { enabled?: unknown } } } | { state: "missing" | "malformed" | "non-object" } {
  if (text === undefined) return { state: "missing" };
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { state: "non-object" };
    const compaction = (value as { compaction?: unknown }).compaction;
    if (compaction !== undefined && (compaction === null || typeof compaction !== "object" || Array.isArray(compaction))) return { state: "non-object" };
    return { state: "valid", value: value as { compaction?: { enabled?: unknown } } };
  } catch {
    return { state: "malformed" };
  }
}

function settingsLocationState(value: ReturnType<typeof parsePiSettings>): string {
  if (value.state !== "valid") return value.state === "missing" ? "absent" : value.state;
  const enabled = value.value.compaction?.enabled;
  return enabled === undefined ? "no-override" : enabled === true ? "enabled" : enabled === false ? "disabled" : "invalid-type";
}

async function readOptionalSettings(path: string): Promise<{ state: "readable" | "missing" | "unreadable"; text?: string }> {
  try {
    return { state: "readable", text: await readFile(path, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
    return { state: "unreadable" };
  }
}

export async function runBoundedProbe(
  id: string,
  timeoutMs: number,
  probe: () => Promise<string>,
): Promise<DoctorResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const evidence = await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`probe timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    if (typeof evidence !== "string" || evidence.trim() === "") {
      return { id, status: "UNVERIFIED", evidence: "probe returned malformed or empty evidence" };
    }
    return { id, status: "PASS", evidence: evidence.slice(0, 240) };
  } catch (error) {
    return { id, status: "ERROR", evidence: boundedError(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  return [`AILI doctor: ${report.status}`, ...report.results.map((item) => `${item.status.padEnd(10)} ${item.id}: ${item.evidence}`)].join("\n");
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 240);
}

export function registerDoctor(pi: ExtensionAPI): void {
  pi.registerCommand("aili-doctor", {
    description: "Report AILI runtime health (append --json for machine-readable output)",
    handler: async (args, context) => {
      const report = await runDoctor(pi);
      context.ui.notify(args.trim() === "--json" ? JSON.stringify(report, null, 2) : formatDoctorReport(report), report.status === "PASS" ? "info" : "warning");
    },
  });
}
