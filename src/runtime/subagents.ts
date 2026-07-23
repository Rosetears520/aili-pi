import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeTarget } from "./path-boundaries.js";
import { loadRoleProfiles, validateRoleProfiles, type RoleProfile } from "./roles.js";

export const SUBAGENT_LIMITS = {
  tasksPerCall: 2,
  activeProcesses: 2,
  taskBytes: 16 * 1024,
  finalBytes: 50 * 1024,
} as const;

export type TaskStatus = "completed" | "failed" | "cancelled" | "protocol_error" | "rejected";

export interface AiliTaskResult {
  taskId: string;
  role: string;
  status: TaskStatus;
  summary: string;
  evidence: string[];
  changedFiles: string[];
  verification: string[];
  blockers: string[];
  risks: string[];
  confidence: "HIGH" | "MED" | "LOW" | "VERY LOW" | "UNKNOWN";
  metadata: {
    truncated: boolean;
    active: string;
    runId?: string;
    backend?: string;
    failureKind?: string | null;
    artifacts?: number;
  };
}

export interface TaskRequest {
  role: string;
  task: string;
  tools?: string[];
  paths?: string[];
  taskId?: unknown;
  resume?: unknown;
  chain?: unknown;
  background?: unknown;
  worktree?: unknown;
}

export interface RunOptions {
  parentTools?: readonly string[];
  policyRoot?: string;
  run?: UpstreamRunner;
}

interface UpstreamArtifact {
  type: string;
  path: string;
}

interface UpstreamResultEnvelope {
  runId: string;
  backend: string;
  cwd: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  failureKind: string | null;
  artifacts: UpstreamArtifact[];
}

interface UpstreamParallelResult {
  mode: "parallel";
}

type UpstreamRunner = (options: Record<string, unknown>) => Promise<UpstreamResultEnvelope | UpstreamParallelResult>;

interface ChildPolicy {
  schemaVersion: 1;
  taskId: string;
  role: string;
  projectRoot: string;
  allowedTools: string[];
  taskBoundaries: string[];
}

interface StructuredOutput {
  status: "completed" | "failed" | "cancelled";
  summary: string;
  evidence: string[];
  changedFiles: string[];
  verification: string[];
  blockers: string[];
  risks: string[];
  confidence: AiliTaskResult["confidence"];
}

class SessionSemaphore {
  active = 0;

  tryAcquire(): boolean {
    if (this.active >= SUBAGENT_LIMITS.activeProcesses) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
  }
}

export const subagentSemaphore = new SessionSemaphore();
const CHILD_GUARD = fileURLToPath(new URL("./child-guard.ts", import.meta.url));
const PERMISSION_MODE_EXTENSION = fileURLToPath(
  new URL("../../node_modules/pi-permission-modes/src/index.ts", import.meta.url),
);
const RUNS_DIR = ".tmp/aili-subagent-runs";

async function loadUpstreamRunner(): Promise<UpstreamRunner> {
  const moduleName = "@agwab/pi-subagent/api";
  const loaded = await import(moduleName) as { runSubagent?: unknown };
  if (typeof loaded.runSubagent !== "function") {
    throw new Error("@agwab/pi-subagent/api does not expose runSubagent");
  }
  return loaded.runSubagent as UpstreamRunner;
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function activeLabel(): string {
  return `${subagentSemaphore.active}/${SUBAGENT_LIMITS.activeProcesses}`;
}

function resultBase(taskId: string, role: string, status: TaskStatus, summary: string): AiliTaskResult {
  return {
    taskId,
    role,
    status,
    summary,
    evidence: [],
    changedFiles: [],
    verification: [],
    blockers: [],
    risks: [],
    confidence: "UNKNOWN",
    metadata: { truncated: false, active: activeLabel() },
  };
}

function redact(value: string): string {
  let output = value;
  for (const [name, secret] of Object.entries(process.env)) {
    if (secret && /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && secret.length >= 4) {
      output = output.replaceAll(secret, "[REDACTED]");
    }
  }
  return output
    .replace(/\b(?:sk|ghp|github_pat|AIza)[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/([?&](?:api[_-]?key|token|secret|password)=)[^\s&#]+/gi, "$1[REDACTED]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 4_096);
}

function taskContainsCredential(task: string): boolean {
  return /\b(?:sk|ghp|github_pat|AIza)[A-Za-z0-9_-]{8,}\b/.test(task)
    || /(?:api[_-]?key|token|secret|password)=\S+/i.test(task)
    || Object.entries(process.env).some(([name, value]) =>
      Boolean(value && value.length >= 4 && /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name) && task.includes(value)),
    );
}

function stringArray(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value : typeof value === "string" ? [value] : undefined;
  if (!items || items.length > 64) return undefined;
  const normalized: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && bytes(item) <= 4_096) {
      normalized.push(item);
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const entries = Object.entries(item as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0 || entries.length > 8 || entries.some(([key, entry]) => !/^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(key) || (typeof entry !== "string" && !(typeof entry === "number" && Number.isFinite(entry))))) return undefined;
    const encoded = JSON.stringify(Object.fromEntries(entries.map(([key, entry]) => [key, typeof entry === "number" ? String(entry) : entry])));
    if (bytes(encoded) > 4_096) return undefined;
    normalized.push(encoded);
  }
  return normalized;
}

function parseStructuredOutput(value: string): StructuredOutput | undefined {
  const body = value.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const status = parsed.status === "success" ? "completed" : parsed.status;
    const confidence = typeof parsed.confidence === "string" ? parsed.confidence.trim().toUpperCase() : "";
    const arrays = ["evidence", "changedFiles", "verification", "blockers", "risks"]
      .map((key) => [key, stringArray(parsed[key])] as const);
    if (
      !["completed", "failed", "cancelled"].includes(String(status))
      || typeof parsed.summary !== "string"
      || !["HIGH", "MED", "LOW", "VERY LOW", "UNKNOWN"].includes(confidence)
      || arrays.some(([, items]) => items === undefined)
    ) return undefined;
    return {
      status: status as StructuredOutput["status"],
      summary: parsed.summary,
      evidence: arrays[0]![1]!,
      changedFiles: arrays[1]![1]!,
      verification: arrays[2]![1]!,
      blockers: arrays[3]![1]!,
      risks: arrays[4]![1]!,
      confidence: confidence as StructuredOutput["confidence"],
    };
  } catch {
    return undefined;
  }
}

async function readOutput(result: UpstreamResultEnvelope): Promise<string> {
  const output = result.artifacts.find((artifact) => artifact.type === "output");
  if (!output) return "";
  try {
    const content = await readFile(resolve(result.cwd, output.path), "utf8");
    return content.slice(0, SUBAGENT_LIMITS.finalBytes + 1);
  } catch {
    return "";
  }
}

async function writeChildPolicy(root: string, policy: ChildPolicy): Promise<{ directory: string; extension: string }> {
  const policyRoot = join(root, ".tmp", "aili-subagent-policy-");
  await mkdir(join(root, ".tmp"), { recursive: true });
  const directory = await mkdtemp(policyRoot);
  await chmod(directory, 0o700);
  const policyPath = join(directory, "policy.json");
  const extension = join(directory, "child-policy.ts");
  await writeFile(policyPath, `${JSON.stringify(policy)}\n`, { encoding: "utf8", mode: 0o600 });
  await writeFile(
    extension,
    `import guard from ${JSON.stringify(CHILD_GUARD)};\nprocess.env.AILI_CHILD_POLICY_FILE = ${JSON.stringify(policyPath)};\nexport default guard;\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return { directory, extension };
}

async function resolveTaskBoundaries(cwd: string, paths: string[] | undefined): Promise<{ root: string; boundaries: string[] } | undefined> {
  const rootTarget = await canonicalizeTarget(cwd, cwd);
  if (!rootTarget.insideProject) return undefined;
  const root = rootTarget.canonicalRoot;
  const boundaries: string[] = [];
  for (const rawPath of paths?.length ? paths : [root]) {
    const target = await canonicalizeTarget(root, rawPath);
    if (!target.insideProject || target.protectedCredential) return undefined;
    boundaries.push(target.canonicalTarget);
  }
  return { root, boundaries };
}

function projectTools(role: RoleProfile, request: TaskRequest, parentTools: readonly string[]): string[] {
  return role.tools.filter((tool) => parentTools.includes(tool) && (request.tools === undefined || request.tools.includes(tool)));
}

function normalizeResult(taskId: string, role: string, result: UpstreamResultEnvelope, output: string): AiliTaskResult {
  const base = resultBase(taskId, role, result.status === "cancelled" ? "cancelled" : result.status === "completed" ? "completed" : "failed", "Pi-subagent run completed");
  base.metadata = {
    truncated: bytes(output) > SUBAGENT_LIMITS.finalBytes,
    active: activeLabel(),
    runId: result.runId,
    backend: result.backend,
    failureKind: result.failureKind,
    artifacts: result.artifacts.length,
  };
  if (result.status !== "completed") {
    base.summary = result.status === "cancelled" ? "Pi-subagent run was cancelled" : "Pi-subagent run failed";
    if (result.failureKind) base.blockers = [`failureKind=${result.failureKind}`];
    return base;
  }
  if (base.metadata.truncated) {
    base.status = "protocol_error";
    base.summary = "Pi-subagent output exceeded the AILI 50 KiB normalization limit";
    return base;
  }
  const structured = parseStructuredOutput(output);
  if (!structured) {
    base.status = "protocol_error";
    base.summary = "Pi-subagent completed without a valid AILI structured result";
    base.blockers = ["result=missing-or-invalid-structured-json"];
    return base;
  }
  return {
    ...base,
    status: structured.status,
    summary: redact(structured.summary),
    evidence: structured.evidence.map(redact),
    changedFiles: structured.changedFiles.map(redact),
    verification: structured.verification.map(redact),
    blockers: structured.blockers.map(redact),
    risks: structured.risks.map(redact),
    confidence: structured.confidence,
  };
}

/**
 * Thin AILI policy adapter over @agwab/pi-subagent/api. The dependency owns
 * spawning, process cancellation, JSONL parsing, and artifact lifecycle.
 */
export async function runAiliTask(
  request: TaskRequest,
  cwd: string,
  signal?: AbortSignal,
  onStatus?: (status: string) => void,
  options: RunOptions = {},
): Promise<AiliTaskResult> {
  const taskId = randomUUID();
  if (request.taskId !== undefined || request.resume !== undefined || request.chain !== undefined || request.background !== undefined || request.worktree !== undefined) {
    return resultBase(taskId, request.role, "rejected", "Resume, chain, background, worktree, and caller-supplied task IDs are not supported");
  }
  if (bytes(request.task) > SUBAGENT_LIMITS.taskBytes) return resultBase(taskId, request.role, "rejected", "Task packet exceeds 16 KiB");
  if (taskContainsCredential(request.task)) return resultBase(taskId, request.role, "rejected", "Task packet appears to contain credential material; no run started");

  const role = (await loadRoleProfiles()).find((candidate) => candidate.name === request.role);
  if (!role) return resultBase(taskId, request.role, "rejected", "Unknown AILI role");
  if (role.status !== "adapted") return resultBase(taskId, role.name, "rejected", role.compatibilityReason);
  if (!options.parentTools) return resultBase(taskId, role.name, "rejected", "Parent-active tool authority is unavailable; no run started");

  const tools = projectTools(role, request, options.parentTools);
  if (tools.some((tool) => tool === "write" || tool === "edit") && !request.paths?.length) {
    return resultBase(taskId, role.name, "rejected", "Write-capable child requires at least one explicit task path boundary; no run started");
  }
  const boundaries = await resolveTaskBoundaries(cwd, request.paths);
  if (!boundaries) return resultBase(taskId, role.name, "rejected", "Task path boundary is external, protected, or unclassifiable");
  if (!subagentSemaphore.tryAcquire()) return resultBase(taskId, role.name, "rejected", "AILI child capacity is full; no run started");

  let policyDirectory = "";
  try {
    const policy = await writeChildPolicy(boundaries.root, {
      schemaVersion: 1,
      taskId,
      role: role.name,
      projectRoot: boundaries.root,
      allowedTools: tools,
      taskBoundaries: boundaries.boundaries,
    });
    policyDirectory = policy.directory;
    onStatus?.(`task=${taskId}; role=${role.name}; active=${activeLabel()}`);
    const runner = options.run ?? await loadUpstreamRunner();
    const upstream = await runner({
      backend: "headless",
      mode: "single",
      agent: `aili.${role.name}`,
      agentScope: "global",
      confirmProjectAgents: false,
      task: request.task,
      cwd: boundaries.root,
      tools,
      extensions: [PERMISSION_MODE_EXTENSION, policy.extension],
      workspace: "shared",
      worktreePolicy: "never",
      async: false,
      onComplete: "return",
      sandbox: false,
      captureToolCalls: true,
      runsDir: RUNS_DIR,
      correlationId: taskId,
      signal,
    });
    if ("mode" in upstream) {
      return resultBase(taskId, role.name, "failed", "Pi-subagent unexpectedly returned a parallel result");
    }
    return normalizeResult(taskId, role.name, upstream, await readOutput(upstream));
  } catch (error) {
    const result = resultBase(taskId, role.name, signal?.aborted ? "cancelled" : "failed", signal?.aborted ? "Pi-subagent run was cancelled" : "Pi-subagent setup or execution failed");
    result.blockers = [redact(error instanceof Error ? error.message : String(error))];
    return result;
  } finally {
    subagentSemaphore.release();
    if (policyDirectory) await rm(policyDirectory, { recursive: true, force: true });
  }
}

const TaskItem = Type.Object({
  role: Type.String({ description: "One of the 19 AILI role profile names" }),
  task: Type.String({ description: "Bounded single-use assignment" }),
  tools: Type.Optional(Type.Array(Type.String(), { description: "Optional narrowing of the role tool ceiling" })),
  paths: Type.Optional(Type.Array(Type.String(), { description: "Required project-local path boundaries for mutation-capable roles" })),
}, { additionalProperties: false });
const TaskParams = Type.Object({ tasks: Type.Array(TaskItem, { minItems: 1, maxItems: 2 }) }, { additionalProperties: false });

export function registerAiliTask(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "aili_task",
    label: "AILI Task",
    description: "Run one or two fresh terminal AILI roles through Pi-subagent. Resume, worktree, background, recursion, and automatic retry are unavailable.",
    parameters: TaskParams,
    async execute(_id, params, signal, onUpdate, context) {
      const parentTools = pi.getActiveTools();
      const results = await Promise.all(params.tasks.map((task) =>
        runAiliTask(task, context.cwd, signal, (status) => onUpdate?.({ content: [{ type: "text", text: status }], details: [] }), { parentTools }),
      ));
      const fitted = fitAggregate(results);
      return { content: [{ type: "text", text: JSON.stringify(fitted) }], details: fitted, isError: fitted.some((result) => result.status !== "completed") };
    },
  });
}

export async function subagentDiagnostics(): Promise<{ status: "UNVERIFIED" | "ERROR"; evidence: string }> {
  const errors = await validateRoleProfiles();
  return errors.length === 0
    ? { status: "UNVERIFIED", evidence: "profiles=19 packaged; global ~/.pi/agent/agents/aili installation is required before runs" }
    : { status: "ERROR", evidence: errors.slice(0, 4).join("; ") };
}

export function fitAggregate(results: AiliTaskResult[]): AiliTaskResult[] {
  const fitted = structuredClone(results);
  if (bytes(JSON.stringify(fitted)) <= SUBAGENT_LIMITS.finalBytes) return fitted;
  for (const result of fitted) {
    result.status = "protocol_error";
    result.summary = "Aggregate AILI task output exceeded the 50 KiB model-visible limit";
    result.metadata.truncated = true;
    for (const key of ["evidence", "changedFiles", "verification", "blockers", "risks"] as const) result[key] = [];
  }
  return fitted;
}
