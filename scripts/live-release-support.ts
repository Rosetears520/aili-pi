import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionFactory,
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";

import { assertAiliReleaseEvidenceSanitized } from "./aili-compact-evidence-sanitizer.ts";
import type { CompactLiveUsage, CompactScenarioEvent } from "./aili-compact-live-observations.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactObjectKeys(value: JsonRecord, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export interface PersistentTaskObservation {
  status: "PASS" | "NON_PASS";
  reason?: string;
  callId?: string;
  childStatus?: string;
  agentId?: string;
  jobId?: string;
  turnId?: string;
}

export const PERSISTENT_SANDBOX_MARKER_PATH = "child-sandbox-marker.txt";
export const PERSISTENT_SANDBOX_MARKER_BYTES = "CHILD_SANDBOX_OK";
export const PERSISTENT_SANDBOX_TASK_TEXT = `Use bash once to create ${PERSISTENT_SANDBOX_MARKER_PATH} containing ${PERSISTENT_SANDBOX_MARKER_BYTES}, then report completion.`;
export const PERSISTENT_BOUNDARY_TASK_TEXT = "Complete one bounded persistent-child turn and report completion without using tools or writing files.";

/** Require one synchronous task call and its exact completed persistent result. */
export function observePersistentTask(messages: readonly unknown[]): PersistentTaskObservation {
  const calls: JsonRecord[] = [];
  for (const candidate of messages) {
    const message = record(candidate);
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const call = record(part);
      if (call?.type === "toolCall" && call.name === "sub") calls.push(call);
    }
  }
  if (calls.length !== 1) return { status: "NON_PASS", reason: calls.length === 0 ? "task-call-missing" : "duplicate-task-calls" };
  const call = calls[0]!;
  const callId = typeof call.id === "string" && call.id.length > 0 ? call.id : undefined;
  const args = record(call.arguments);
  if (!callId) return { status: "NON_PASS", reason: "task-call-id-missing" };
  if (args?.async !== false) return { status: "NON_PASS", reason: "task-call-not-synchronous", callId };

  const matches = messages.map(record).filter((message) => message?.role === "toolResult"
    && message.toolName === "sub" && message.toolCallId === callId);
  if (matches.length !== 1) return {
    status: "NON_PASS",
    reason: matches.length === 0 ? "matching-task-result-missing" : "duplicate-task-results",
    callId,
  };
  const resultMessage = matches[0]!;
  if (resultMessage.isError === true) return { status: "NON_PASS", reason: "task-result-error", callId };
  const details = record(resultMessage.details);
  const results = Array.isArray(details?.results) ? details.results.map(record) : [];
  if (results.length !== 1 || !results[0]) return { status: "NON_PASS", reason: "persistent-child-result-missing", callId };
  const result = results[0];
  const lifecycle = record(result.lifecycle);
  const agentId = typeof result.agentId === "string" ? result.agentId : undefined;
  const jobId = typeof result.jobId === "string" ? result.jobId : undefined;
  const turnId = typeof result.turnId === "string" ? result.turnId : undefined;
  const completed = result.status === "completed"
    && lifecycle?.agent === "idle"
    && lifecycle.job === "completed"
    && lifecycle.turn === "completed"
    && agentId && jobId && turnId
    && result.outputRef === `agent://${agentId}`
    && result.historyRef === `history://${agentId}`;
  return completed
    ? { status: "PASS", callId, childStatus: "completed", agentId, jobId, turnId }
    : { status: "NON_PASS", reason: "persistent-child-not-completed", callId, childStatus: String(result.status ?? "unavailable"), agentId, jobId, turnId };
}

export interface PersistentBoundaryObservation extends PersistentTaskObservation {
  taskArgumentsExact: boolean;
  zeroParentBashCalls: boolean;
  childLifecycleCompleted: boolean;
}

/** Validate only the parent-to-persistent-child lifecycle boundary. */
export function observePersistentBoundaryTask(messages: readonly unknown[]): PersistentBoundaryObservation {
  const task = observePersistentTask(messages);
  const taskCalls: JsonRecord[] = [];
  let parentBashCalls = 0;
  for (const candidate of messages) {
    const message = record(candidate);
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const call = record(part);
      if (call?.type !== "toolCall") continue;
      if (call.name === "sub") taskCalls.push(call);
      if (call.name === "bash") parentBashCalls += 1;
    }
  }
  const args = taskCalls.length === 1 ? record(taskCalls[0]?.arguments) : undefined;
  const writeScope = record(args?.writeScope);
  const taskArgumentsExact = !!args
    && exactObjectKeys(args, ["task", "agent", "async", "tools", "workspace", "writeScope"])
    && args.task === PERSISTENT_BOUNDARY_TASK_TEXT
    && args.agent === "general"
    && args.async === false
    && JSON.stringify(args.tools) === JSON.stringify([])
    && args.workspace === "shared"
    && !!writeScope
    && exactObjectKeys(writeScope, ["paths", "resources"])
    && JSON.stringify(writeScope.paths) === JSON.stringify([])
    && JSON.stringify(writeScope.resources) === JSON.stringify([]);
  const zeroParentBashCalls = parentBashCalls === 0;
  const childLifecycleCompleted = task.status === "PASS";
  const reason = task.status === "NON_PASS"
    ? task.reason
    : !taskArgumentsExact
      ? "task-arguments-not-exact"
      : !zeroParentBashCalls
        ? "parent-bash-call-observed"
        : undefined;
  const observation: PersistentBoundaryObservation = {
    ...task,
    status: taskArgumentsExact && zeroParentBashCalls && childLifecycleCompleted ? "PASS" : "NON_PASS",
    taskArgumentsExact,
    zeroParentBashCalls,
    childLifecycleCompleted,
  };
  if (reason) observation.reason = reason;
  else delete observation.reason;
  return observation;
}

export interface PersistentSandboxObservation extends PersistentTaskObservation {
  taskArgumentsExact: boolean;
  zeroParentBashCalls: boolean;
  childLifecycleCompleted: boolean;
  markerExact: boolean;
  childBashInspection: "Unverified";
  childBashInspectionReason: "child-history-not-exposed-in-parent-task-result";
}

/** Validate the parent-visible sandbox claim without inventing child history access. */
export function observePersistentSandboxTask(messages: readonly unknown[], markerBody: string): PersistentSandboxObservation {
  const task = observePersistentTask(messages);
  const taskCalls: JsonRecord[] = [];
  let parentBashCalls = 0;
  for (const candidate of messages) {
    const message = record(candidate);
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const call = record(part);
      if (call?.type !== "toolCall") continue;
      if (call.name === "sub") taskCalls.push(call);
      if (call.name === "bash") parentBashCalls += 1;
    }
  }
  const args = taskCalls.length === 1 ? record(taskCalls[0]?.arguments) : undefined;
  const writeScope = record(args?.writeScope);
  const taskArgumentsExact = !!args
    && exactObjectKeys(args, ["task", "agent", "async", "tools", "workspace", "writeScope"])
    && args.task === PERSISTENT_SANDBOX_TASK_TEXT
    && args.agent === "general"
    && args.async === false
    && JSON.stringify(args.tools) === JSON.stringify(["bash"])
    && args.workspace === "shared"
    && !!writeScope
    && exactObjectKeys(writeScope, ["paths", "resources"])
    && JSON.stringify(writeScope.paths) === JSON.stringify([PERSISTENT_SANDBOX_MARKER_PATH])
    && JSON.stringify(writeScope.resources) === JSON.stringify([]);
  const zeroParentBashCalls = parentBashCalls === 0;
  const childLifecycleCompleted = task.status === "PASS";
  const markerExact = markerBody === PERSISTENT_SANDBOX_MARKER_BYTES;
  const reason = task.status === "NON_PASS"
    ? task.reason
    : !taskArgumentsExact
      ? "task-arguments-not-exact"
      : !zeroParentBashCalls
        ? "parent-bash-call-observed"
        : !markerExact
          ? markerBody.length === 0 ? "sandbox-marker-missing" : "sandbox-marker-bytes-mismatch"
          : undefined;
  const observation: PersistentSandboxObservation = {
    ...task,
    status: taskArgumentsExact && zeroParentBashCalls && childLifecycleCompleted && markerExact ? "PASS" : "NON_PASS",
    taskArgumentsExact,
    zeroParentBashCalls,
    childLifecycleCompleted,
    markerExact,
    childBashInspection: "Unverified",
    childBashInspectionReason: "child-history-not-exposed-in-parent-task-result",
  };
  if (reason) observation.reason = reason;
  else delete observation.reason;
  return observation;
}

export interface LiveCaptureBundle {
  persistentArtifact: JsonRecord;
  compactArtifact: JsonRecord;
}

export const DEFAULT_COMPACT_LIVE_MAX_INPUT_CHARACTERS = 600_000;
export const MAX_COMPACT_LIVE_MAX_INPUT_CHARACTERS = 2_000_000;
const HASH = /^[a-f0-9]{64}$/;

export interface CompactLiveCaptureBudget {
  maxInputCharacters: number;
  source: "conservative-default" | "explicit-operation-budget";
}

export type CompactLiveInputSelection = {
  status: "WITHIN_BUDGET";
  requiredInputCharacters: number;
  maxInputCharacters: number;
} | {
  status: "NON_PASS";
  reason: "capture-input-budget-exceeded";
  requiredInputCharacters: number;
  maxInputCharacters: number;
};

/** Parse an exact future operation budget without raising the default implicitly. */
export function compactLiveCaptureBudget(value?: string): CompactLiveCaptureBudget {
  if (value === undefined || value === "") {
    return { maxInputCharacters: DEFAULT_COMPACT_LIVE_MAX_INPUT_CHARACTERS, source: "conservative-default" };
  }
  if (!/^\d+$/.test(value)) throw new Error("AILI_COMPACT_LIVE_MAX_INPUT_CHARS must be an exact positive integer");
  const maxInputCharacters = Number(value);
  if (!Number.isSafeInteger(maxInputCharacters) || maxInputCharacters < 1 || maxInputCharacters > MAX_COMPACT_LIVE_MAX_INPUT_CHARACTERS) {
    throw new Error(`AILI_COMPACT_LIVE_MAX_INPUT_CHARS must be between 1 and ${MAX_COMPACT_LIVE_MAX_INPUT_CHARACTERS}`);
  }
  return { maxInputCharacters, source: "explicit-operation-budget" };
}

export function selectCompactLiveInput(requiredInputCharacters: number, budget: CompactLiveCaptureBudget): CompactLiveInputSelection {
  if (!Number.isSafeInteger(requiredInputCharacters) || requiredInputCharacters < 1) {
    throw new Error("required live capture input characters must be an exact positive integer");
  }
  return requiredInputCharacters <= budget.maxInputCharacters
    ? { status: "WITHIN_BUDGET", requiredInputCharacters, maxInputCharacters: budget.maxInputCharacters }
    : { status: "NON_PASS", reason: "capture-input-budget-exceeded", requiredInputCharacters, maxInputCharacters: budget.maxInputCharacters };
}

export interface ProductionCompactScenarioInput {
  cwd: string;
  sessionDir: string;
  agentDir: string;
  productionEntry: string;
  modelRuntime: ModelRuntime;
  model: Model<any>;
  sessionId: string;
  sessionManager?: SessionManager;
  systemPrompt: string;
  tools?: string[];
  config?: JsonRecord;
  settings?: JsonRecord;
  extensionFactories?: Array<{ name: string; factory: ExtensionFactory; hidden?: boolean; placement?: "before" | "after" }>;
}

export interface ProductionCompactScenario {
  session: AgentSession;
  manager: SessionManager;
  events: CompactScenarioEvent[];
  toolExecutions: Array<{ toolCallId: string; toolName: string; isError: boolean; result: unknown }>;
  extensionOrder: string[];
  activeToolNames: string[];
  prompt(text: string, classification?: "user" | "continued"): Promise<void>;
  dispose(): void;
}

/**
 * Build one real Pi AgentSession with the production package entry. The helper
 * records only bounded semantic event codes; callers decide whether a row has
 * enough real observations to pass.
 */
export async function createProductionCompactScenario(input: ProductionCompactScenarioInput): Promise<ProductionCompactScenario> {
  await mkdir(join(input.cwd, ".pi"), { recursive: true });
  await mkdir(input.sessionDir, { recursive: true });
  await writeFile(join(input.cwd, ".pi", "aili-compact.jsonc"), JSON.stringify({ enabled: true, ...(input.config ?? { autoCooling: false }) }), "utf8");
  const manager = input.sessionManager ?? SessionManager.create(input.cwd, input.sessionDir, { id: input.sessionId });
  const events: CompactScenarioEvent[] = [];
  const toolExecutions: Array<{ toolCallId: string; toolName: string; isError: boolean; result: unknown }> = [];
  const providerTurns: Array<"user" | "tool-result" | "continued" | "retry"> = [];
  const pendingBeforeCompact = new Map<"manual" | "threshold" | "overflow", Extract<CompactScenarioEvent, { code: "before-compact" }>>();
  let nextPromptClassification: "user" | "continued" = "user";
  let overflowCheckpointObserved = false;
  const observer: ExtensionFactory = (pi) => {
    pi.on("context", (event) => {
      const messages = event.messages as unknown as JsonRecord[];
      const suffix = messages.at(-1);
      const prior = messages.at(-2);
      const turn = prior?.role === "toolResult" ? "tool-result" : nextPromptClassification;
      providerTurns.push(overflowCheckpointObserved ? "retry" : turn);
      if (suffix?.role === "custom" && suffix.customType === "aili-compact-provider-suffix") {
        events.push({
          code: "provider-suffix",
          turn: turn === "tool-result" ? "tool-result" : "user",
          role: "custom",
          order: "after-complete-projection",
          ...(turn === "tool-result" ? { completeRealToolResult: prior?.role === "toolResult" } : {}),
          protocolError: false,
        });
      }
      return undefined;
    });
    pi.on("message_end", (event) => {
      const message = event.message as unknown as JsonRecord;
      if (message.role !== "assistant") return;
      const usage = compactUsage(message.usage);
      const succeeded = message.stopReason !== "error" && message.stopReason !== "aborted";
      const turn = providerTurns.shift() ?? nextPromptClassification;
      events.push({ code: "provider-call", turn, succeeded, ...(usage ? { usage } : {}) });
      const errorText = typeof message.errorMessage === "string" ? message.errorMessage : "";
      if (!succeeded && /context(?:_|\s|-)*(?:length|window)|too (?:long|many tokens)|token limit/i.test(errorText)) {
        events.push({ code: "provider-overflow", recognized: true, errorCode: "context-length-exceeded", thresholdCompactedFirst: pendingBeforeCompact.has("threshold") });
      }
      if (turn === "retry" && succeeded) overflowCheckpointObserved = false;
    });
    pi.on("tool_execution_end", (event) => {
      toolExecutions.push({ toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError, result: event.result });
    });
    pi.on("session_before_compact", (event) => {
      const observed: Extract<CompactScenarioEvent, { code: "before-compact" }> = {
        code: "before-compact",
        reason: event.reason,
        willRetry: event.willRetry,
        outcome: "undefined-native-fallback",
      };
      pendingBeforeCompact.set(event.reason, observed);
      events.push(observed);
      return undefined;
    });
    pi.on("session_compact", (event) => {
      const origin = event.fromExtension ? "custom" : "native";
      const pending = pendingBeforeCompact.get(event.reason);
      if (pending) pending.outcome = event.fromExtension ? "custom" : "undefined-native-fallback";
      events.push({ code: "checkpoint", reason: event.reason, origin, persisted: true, newEpoch: true });
      if (event.reason === "overflow") overflowCheckpointObserved = true;
    });
  };
  const settings = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
    retry: { enabled: true, maxRetries: 2, baseDelayMs: 100 },
    ...input.settings,
  }, { projectTrusted: true });
  const observerName = `compact-live-observer-${input.sessionId}`;
  const beforePaths = new Set((input.extensionFactories ?? []).filter((item) => item.placement === "before").map((item) => `<inline:${item.name}>`));
  const afterPaths = new Set((input.extensionFactories ?? []).filter((item) => item.placement !== "before").map((item) => `<inline:${item.name}>`));
  const loader = new DefaultResourceLoader({
    cwd: input.cwd,
    agentDir: input.agentDir,
    settingsManager: settings,
    additionalExtensionPaths: [input.productionEntry],
    extensionFactories: [
      ...(input.extensionFactories ?? []).map(({ placement: _placement, ...factory }) => factory),
      { name: observerName, factory: observer, hidden: true },
    ],
    extensionsOverride: (base) => ({
      ...base,
      extensions: [...base.extensions].sort((left, right) => {
        const rank = (path: string) => beforePaths.has(path) ? 0 : path === input.productionEntry ? 1 : afterPaths.has(path) ? 2 : path === `<inline:${observerName}>` ? 3 : 4;
        return rank(left.path) - rank(right.path);
      }),
    }),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: input.systemPrompt,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  if (loaded.errors.length > 0) throw new Error("production-extension-load-failed");
  const created = await createAgentSession({
    cwd: input.cwd,
    agentDir: input.agentDir,
    model: input.model,
    modelRuntime: input.modelRuntime,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
    tools: input.tools ?? ["read"],
    thinkingLevel: "off",
  });
  if (created.extensionsResult.errors.length > 0) {
    created.session.dispose();
    throw new Error("production-extension-bind-failed");
  }
  const requestedTools = input.tools ?? ["read"];
  const activeToolNames = created.session.getActiveToolNames();
  const missingTools = requestedTools.filter((name) => !activeToolNames.includes(name));
  if (missingTools.length > 0) {
    created.session.dispose();
    throw new Error(`active-tools-missing:${missingTools.join(",")}`);
  }
  return {
    session: created.session,
    manager,
    events,
    toolExecutions,
    extensionOrder: loaded.extensions.map((extension) => extension.path),
    activeToolNames,
    async prompt(text, classification = "user") {
      nextPromptClassification = classification;
      await created.session.prompt(text, { expandPromptTemplates: false, source: "extension" });
      await created.session.waitForIdle();
    },
    dispose: () => created.session.dispose(),
  };
}

export interface ProductionPtyResizeProbeInput {
  cwd: string;
  piExecutable: string;
  productionEntry: string;
  harnessPath: string;
  candidate: { packageVersion: string; piVersion: "0.82.1"; implementationSha256: string };
  expectedHarnessSha256: string;
  timeoutMs?: number;
}

export type ProductionPtyResizeProbeResult = {
  status: "PASS";
  evidence: NonNullable<Extract<CompactScenarioEvent, { code: "native-integration" }>["resizeProbe"]>;
} | { status: "NON_PASS"; reason: string };

/**
 * Start the repository-local official Pi CLI in a real Unix PTY. Python is used
 * only as a stdlib forkpty/ioctl bridge; no terminal event is injected into Pi.
 */
export async function runProductionPtyResizeProbe(input: ProductionPtyResizeProbeInput): Promise<ProductionPtyResizeProbeResult> {
  if (process.platform !== "linux") return { status: "NON_PASS", reason: "linux-pty-prerequisite-unavailable" };
  const timeoutMs = Math.min(15_000, Math.max(4_000, input.timeoutMs ?? 8_000));
  let piBytes: Buffer; let entryBytes: Buffer; let harnessBytes: Buffer;
  try {
    [piBytes, entryBytes, harnessBytes] = await Promise.all([
      readFile(input.piExecutable), readFile(input.productionEntry), readFile(input.harnessPath),
    ]);
  } catch {
    return { status: "NON_PASS", reason: "pty-bound-executable-or-harness-unavailable" };
  }
  if (sha256(harnessBytes) !== input.expectedHarnessSha256) {
    return { status: "NON_PASS", reason: "pty-harness-binding-drift" };
  }
  await mkdir(input.cwd, { recursive: true });
  const python = String.raw`
import base64, fcntl, hashlib, json, os, pty, select, signal, struct, sys, time
cfg=json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
cap=100000
transcript=bytearray()
def size(fd, cols, rows):
  fcntl.ioctl(fd, __import__("termios").TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
def read_for(fd, seconds):
  end=time.monotonic()+seconds
  while time.monotonic()<end and len(transcript)<cap:
    ready,_,_=select.select([fd],[],[],min(0.1,max(0,end-time.monotonic())))
    if not ready: continue
    try:
      chunk=os.read(fd,min(4096,cap-len(transcript)))
      if not chunk: break
      transcript.extend(chunk)
    except OSError: break
pid,fd=pty.fork()
if pid==0:
  os.chdir(cfg["cwd"])
  env=dict(os.environ)
  env["NO_COLOR"]="1"
  os.execve(cfg["node"],[cfg["node"],cfg["cli"],"--offline","--no-session","--no-extensions","--extension",cfg["entry"],"--no-skills","--no-prompt-templates","--no-themes","--no-context-files","--approve"],env)
result={"childStarted":True,"ioctlApplied":False,"queriedWindowMatched":False,"productionCommandObserved":False,"postResizeOutputObserved":False}
try:
  size(fd,96,28)
  read_for(fd,1.8)
  os.write(fd,b"/aili-compact status\r")
  read_for(fd,1.8)
  result["productionCommandObserved"]=b"AILI Compact" in transcript
  before=len(transcript)
  size(fd,132,42)
  result["ioctlApplied"]=True
  raw=fcntl.ioctl(fd,__import__("termios").TIOCGWINSZ,struct.pack("HHHH",0,0,0,0))
  rows,cols,_,_=struct.unpack("HHHH",raw)
  result["queriedWindowMatched"]=(cols==132 and rows==42)
  read_for(fd,1.8)
  result["postResizeOutputObserved"]=(len(transcript)>before)
finally:
  try: os.write(fd,b"\x03\x04")
  except OSError: pass
  time.sleep(0.1)
  try: os.kill(pid,signal.SIGTERM)
  except ProcessLookupError: pass
  try: os.waitpid(pid,0)
  except ChildProcessError: pass
result["transcriptSha256"]=hashlib.sha256(bytes(transcript)).hexdigest()
result["transcriptBytes"]=len(transcript)
print(json.dumps(result,separators=(",",":")))
`;
  const payload = Buffer.from(JSON.stringify({
    cwd: input.cwd,
    node: process.execPath,
    cli: input.piExecutable,
    entry: input.productionEntry,
  })).toString("base64");
  const observed = await new Promise<JsonRecord | undefined>((resolve) => {
    const child = spawn("python3", ["-c", python, payload], { cwd: input.cwd, stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { if (output.length < 20_000) output += chunk.toString("utf8"); });
    child.on("error", () => { clearTimeout(timer); resolve(undefined); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(undefined);
      try { resolve(record(JSON.parse(output.trim().split("\n").at(-1) ?? ""))); } catch { resolve(undefined); }
    });
  });
  if (!observed) return { status: "NON_PASS", reason: "python3-pty-prerequisite-unavailable-or-failed" };
  if (observed.childStarted !== true || observed.ioctlApplied !== true || observed.queriedWindowMatched !== true
    || observed.productionCommandObserved !== true || observed.postResizeOutputObserved !== true
    || !HASH.test(String(observed.transcriptSha256 ?? "")) || !Number.isSafeInteger(observed.transcriptBytes)
    || Number(observed.transcriptBytes) <= 0 || Number(observed.transcriptBytes) > 100_000) {
    return { status: "NON_PASS", reason: "production-pty-resize-observation-incomplete" };
  }
  return {
    status: "PASS",
    evidence: {
      mechanism: "python3-stdlib-forkpty-tiocswinsz",
      directEventInjection: false,
      executable: { path: "node_modules/@earendil-works/pi-coding-agent/dist/cli.js", sha256: sha256(piBytes) },
      productionEntry: { path: "extensions/index.ts", sha256: sha256(entryBytes) },
      harness: { path: "tests/integration/aili-compact-live-release-gated.test.ts", sha256: sha256(harnessBytes) },
      candidate: input.candidate,
      initial: { columns: 96, rows: 28 },
      resized: { columns: 132, rows: 42 },
      ioctlApplied: true,
      queriedWindowMatched: true,
      productionCommandObserved: true,
      postResizeOutputObserved: true,
      transcriptSha256: String(observed.transcriptSha256),
      transcriptBytes: Number(observed.transcriptBytes),
    },
  };
}

function compactUsage(value: unknown): CompactLiveUsage | undefined {
  const usage = record(value);
  if (!usage) return undefined;
  const compact = {
    input: Number(usage.input ?? 0), output: Number(usage.output ?? 0),
    cacheRead: Number(usage.cacheRead ?? 0), cacheWrite: Number(usage.cacheWrite ?? 0),
    totalTokens: Number(usage.totalTokens ?? 0),
  };
  return Object.values(compact).every((item) => Number.isSafeInteger(item) && item >= 0) && compact.totalTokens > 0 ? compact : undefined;
}

export type RealOverflowAttemptClassification = {
  status: "PROVIDER_CONTEXT_ERROR";
  source: "message-end" | "assistant-fallback";
  fallbackEvent?: Extract<CompactScenarioEvent, { code: "provider-overflow" }>;
} | {
  status: "NON_PASS";
  reason: "overflow-preflight-or-stage-failed" | "overflow-message-end-missing" | "provider-context-error-not-induced";
  source: "message-end" | "assistant-fallback" | "none";
};

/** Classify one bounded overflow attempt; persisted assistant error state is fallback only. */
export function classifyRealOverflowAttempt(
  events: readonly CompactScenarioEvent[],
  eventStart: number,
  messages: readonly unknown[],
  promptFailed: boolean,
): RealOverflowAttemptClassification {
  const attemptEvents = events.slice(eventStart);
  const overflow = attemptEvents.find((event): event is Extract<CompactScenarioEvent, { code: "provider-overflow" }> => event.code === "provider-overflow" && event.recognized);
  if (overflow) return { status: "PROVIDER_CONTEXT_ERROR", source: "message-end" };
  const messageEndObserved = attemptEvents.some((event) => event.code === "provider-call");
  if (messageEndObserved) return { status: "NON_PASS", reason: "provider-context-error-not-induced", source: "message-end" };

  const assistant = [...messages].reverse().map(record).find((message) => message?.role === "assistant");
  const errorText = typeof assistant?.errorMessage === "string" ? assistant.errorMessage : "";
  if (assistant?.stopReason === "error" && /context(?:_|\s|-)*(?:length|window)|too (?:long|many tokens)|token limit/i.test(errorText)) {
    return {
      status: "PROVIDER_CONTEXT_ERROR",
      source: "assistant-fallback",
      fallbackEvent: {
        code: "provider-overflow",
        recognized: true,
        errorCode: "context-length-exceeded",
        thresholdCompactedFirst: attemptEvents.some((event) => event.code === "before-compact" && event.reason === "threshold"),
      },
    };
  }
  return promptFailed
    ? { status: "NON_PASS", reason: "overflow-preflight-or-stage-failed", source: assistant ? "assistant-fallback" : "none" }
    : { status: "NON_PASS", reason: "overflow-message-end-missing", source: assistant ? "assistant-fallback" : "none" };
}

/** Capture succeeds only when the real-provider boundary is observed. */
export function assertLiveCaptureClaims(bundle: LiveCaptureBundle): void {
  const probes = Array.isArray(bundle.persistentArtifact.probes) ? bundle.persistentArtifact.probes.map(record) : [];
  const probePassed = (id: string) => probes.some((probe) => probe?.id === id && probe.status === "PASS");
  const representative = record(bundle.compactArtifact.representative);
  const transport = record(representative?.transport);
  const ordering = record(representative?.extensionOrdering);
  const before = record(ordering?.before);
  const after = record(ordering?.after);
  const parentPersistentChild = record(representative?.parentPersistentChild);
  const missing: string[] = [];
  if (!probePassed("provider-turn")) missing.push("persistent-provider-turn");
  if (transport?.status !== "PASS") missing.push("official-pi-transport");
  if (before?.status !== "PASS" || after?.status !== "PASS") missing.push("controlled-extension-order");
  if (parentPersistentChild?.status !== "PASS") missing.push("parent-persistent-child-lifecycle");
  if (missing.length > 0) throw new Error(`capture-required-claims-missing:${missing.join(",")}`);
}

export async function executeLiveCaptureLifecycle(input: {
  environment: Record<string, string>;
  capture: () => Promise<LiveCaptureBundle>;
  failure: (reason: string) => LiveCaptureBundle;
  cleanup: () => Promise<void>;
  verifyCleanup: () => Promise<boolean>;
  downgradeForCleanupFailure: (bundle: LiveCaptureBundle) => LiveCaptureBundle;
  publish: (bundle: LiveCaptureBundle) => Promise<void>;
  assertPublished?: (bundle: LiveCaptureBundle) => void;
}): Promise<LiveCaptureBundle> {
  const keys = Object.keys(input.environment);
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  let bundle: LiveCaptureBundle | undefined;
  let cleanupPassed = false;
  Object.assign(process.env, input.environment);
  try {
    bundle = await input.capture();
  } catch {
    bundle = input.failure("live-capture-failed");
  } finally {
    try {
      await input.cleanup();
      cleanupPassed = await input.verifyCleanup();
    } catch {
      cleanupPassed = false;
    } finally {
      for (const key of keys) {
        const value = prior[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
  const publishable = cleanupPassed ? bundle! : input.downgradeForCleanupFailure(bundle!);
  await input.publish(publishable);
  input.assertPublished?.(publishable);
  return publishable;
}

/** Stage sanitized bytes beside each target and rename the manifest last. */
export async function atomicPublishLiveEvidence(
  root: string,
  files: readonly { path: string; body: string; manifest?: boolean }[],
): Promise<void> {
  assertAiliReleaseEvidenceSanitized(files.map((file) => file.body));
  const staged: Array<{ target: string; temporary: string; manifest: boolean }> = [];
  try {
    for (const [index, file] of files.entries()) {
      const target = join(root, file.path);
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.tmp-live-${process.pid}-${index}`;
      await writeFile(temporary, file.body, { encoding: "utf8", flag: "wx" });
      staged.push({ target, temporary, manifest: file.manifest === true });
    }
    for (const item of staged.filter((item) => !item.manifest)) await rename(item.temporary, item.target);
    for (const item of staged.filter((item) => item.manifest)) await rename(item.temporary, item.target);
  } finally {
    await Promise.all(staged.map((item) => rm(item.temporary, { force: true }).catch(() => undefined)));
  }
}
