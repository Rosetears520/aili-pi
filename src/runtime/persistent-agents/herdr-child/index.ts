import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { createBashToolDefinition, type BashOperations, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isOutside, isProtectedWrite } from "pi-permission-modes/src/paths.ts";
import type { ModeDef, Surface } from "pi-permission-modes/src/schema.ts";
import { decide } from "../../../vendor/pi-permission-modes/resolve.js";
import { SandboxController } from "../../../vendor/pi-permission-modes/index.js";
import { findCredentialMaterial, redactCredentialText } from "../permission.js";

/**
 * AILI Child Bootstrap — runs inside the external child Pi CLI process of the
 * herdr execution backend (spec: herdr-child-bridge). The child OWNS a 0600
 * Unix socket server; the AILI parent connects as a client. Events are
 * dual-written: pushed live to connected clients and appended to
 * events.jsonl with monotonic sequence numbers so a restarted parent can
 * resume from its last seen sequence. Wire format is newline-delimited JSON:
 *   client→server {id, cmd, params}            → {id, ok, result} | {id, ok:false, error}
 *   client→server {cmd:"listen", afterSeq}     → replayed then live event frames
 *   server→client {seq, ts, event, data}       (unsolicited event frames)
 */

const EVENT_LOG_MAX_BYTES = 4 * 1024 * 1024;
const REPLAY_BUFFER_LIMIT = 512;

export interface BridgeIdentity {
  /** Sidecar run directory: events.jsonl and durable artifacts live here. */
  dir: string;
  /** Short-lived socket directory. Unix socket paths are capped at ~108
   *  bytes and sidecar paths exceed that, so the socket itself lives in a
   *  short runtime directory ($XDG_RUNTIME_DIR or /tmp) next to the run. */
  sockDir: string;
  runId: string;
  agentId: string;
  token: string;
  loadoutHash?: string;
}

interface TurnPayload {
  runId: string;
  jobId: string;
  turnId: string;
}

export interface ChildBridge {
  emit(event: string, data: Record<string, unknown>): void;
  state(): { phase: BridgePhase; controlMode: BridgeControlMode; pendingTurn?: TurnPayload; pendingInteractions: number };
  requestInteraction(kind: "permission" | "question", request: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
  bindSubmission(callback: (task: string) => void): void;
  /** Clears the pending submitted turn so the next submit_turn is accepted. */
  settleTurn(): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type BridgePhase = "starting" | "ready" | "turn-active" | "idle" | "exiting";
export type BridgeControlMode = "aili" | "human" | "mixed";

function identityFromEnv(): BridgeIdentity | undefined {
  if (process.env.AILI_HERDR_CHILD !== "1") return undefined;
  const dir = process.env.AILI_BRIDGE_DIR;
  const runId = process.env.AILI_RUN_ID;
  const agentId = process.env.AILI_AGENT_ID;
  const tokenFile = process.env.AILI_BRIDGE_TOKEN_FILE;
  const loadoutHash = process.env.AILI_LOADOUT_HASH;
  const token = tokenFile ? readOneUseBridgeToken(tokenFile) : undefined;
  if (!dir || !runId || !agentId || !token || !loadoutHash) return undefined;
  const sockDir = process.env.AILI_BRIDGE_SOCK_DIR ?? dir;
  return { dir, sockDir, runId, agentId, token, loadoutHash };
}

/** Identity flags are parsed straight from process.argv: pi.getFlag() is not
 *  reliably populated during the initial extension load, and a stale pane env
 *  from a previous run must never win over the argv identity. */
export function identityFromArgv(argv: readonly string[]): BridgeIdentity | undefined {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length - 1; index += 1) {
    if (argv[index] === "--aili-bridge-dir" || argv[index] === "--aili-bridge-sock-dir" || argv[index] === "--aili-run-id" || argv[index] === "--aili-agent-id" || argv[index] === "--aili-loadout-hash" || argv[index] === "--aili-bridge-token-file") {
      values.set(argv[index]!, argv[index + 1]!);
    }
  }
  const dir = values.get("--aili-bridge-dir");
  const runId = values.get("--aili-run-id");
  const agentId = values.get("--aili-agent-id");
  const tokenFile = values.get("--aili-bridge-token-file");
  const token = tokenFile ? readOneUseBridgeToken(tokenFile) : undefined;
  const loadoutHash = values.get("--aili-loadout-hash");
  if (!dir || !runId || !agentId || !token || !loadoutHash) return undefined;
  return { dir, sockDir: values.get("--aili-bridge-sock-dir") ?? dir, runId, agentId, token, loadoutHash };
}

function readOneUseBridgeToken(path: string): string | undefined {
  try {
    const info = statSync(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) return undefined;
    const token = readFileSync(path, "utf8").trim();
    rmSync(path, { force: true });
    return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : undefined;
  } catch { return undefined; }
}

export interface VerifiedChildLoadout { runId: string; agentId: string; cwd: string; tools: string[]; permission: { modeName: string; mode: ModeDef }; }

export function verifyChildLoadout(identity: BridgeIdentity): VerifiedChildLoadout {
  const path = join(identity.dir, "loadout.json");
  const info = statSync(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("Herdr child loadout permissions are invalid");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const storedHash = parsed.loadoutHash;
  delete parsed.loadoutHash;
  const calculated = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  if (typeof identity.loadoutHash !== "string" || !/^[a-f0-9]{64}$/.test(identity.loadoutHash)
    || storedHash !== identity.loadoutHash || calculated !== identity.loadoutHash
    || parsed.runId !== identity.runId || parsed.agentId !== identity.agentId) {
    throw new Error("Herdr child immutable loadout verification failed");
  }
  const tools = parsed.tools;
  const permission = parsed.permission as VerifiedChildLoadout["permission"] | undefined;
  if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== "string") || typeof parsed.cwd !== "string" || !permission?.mode?.permission || !permission.mode.sandbox) {
    throw new Error("Herdr child security loadout is incomplete");
  }
  return { runId: identity.runId, agentId: identity.agentId, cwd: parsed.cwd, tools: tools as string[], permission };
}

export async function evaluateHerdrChildTool(loadout: VerifiedChildLoadout, toolName: string, input: Record<string, unknown>, sandboxReady: boolean, requestApproval: (request: Record<string, unknown>) => Promise<unknown>): Promise<{ block: true; reason: string } | undefined> {
  if (!loadout.tools.includes(toolName)) return { block: true, reason: `Herdr loadout denies tool ${toolName}` };
  const credential = await findCredentialMaterial(input, loadout.cwd);
  if (credential) return { block: true, reason: `Herdr child denied credential/private material (${credential.reason})` };
  const fileSurface = ["read", "write", "edit", "grep", "find", "ls"].includes(toolName);
  const target = fileSurface && typeof input.path === "string" ? input.path : toolName === "bash" && typeof input.command === "string" ? input.command : toolName;
  const surface = (fileSurface || toolName === "bash" ? toolName : "tool") as Surface;
  const outside = fileSurface && typeof input.path === "string" ? isOutside(loadout.cwd, input.path) : false;
  if (outside && (toolName === "write" || toolName === "edit")) return { block: true, reason: "Herdr child workspace boundary denial" };
  if ((toolName === "write" || toolName === "edit") && typeof input.path === "string" && !loadout.permission.mode.bypassProtectedPaths && isProtectedWrite(loadout.cwd, input.path)) return { block: true, reason: "Herdr child protected-path denial" };
  const action = decide(loadout.permission.mode, surface, target, { isOutside: outside, fallback: "deny" });
  if (toolName === "bash" && !sandboxReady) return { block: true, reason: "Herdr child sandbox unavailable" };
  if (action === "deny") return { block: true, reason: `Herdr ${loadout.permission.modeName} denies ${toolName}` };
  if (action === "ask" && await requestApproval({ toolName, summary: `${toolName} ${String(target).slice(0, 300)}` }) !== "allow") return { block: true, reason: "Herdr child permission denied or expired" };
}

function assistantText(message: { content: unknown }): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part) && typeof part === "object" && (part as { type?: string }).type === "text" && typeof (part as { text?: unknown }).text === "string")
    .map((part) => part.text)
    .join("\n");
}

export type ChildTurnOutcome =
  | { kind: "completed"; text: string; model?: string; usage: { input: number; output: number; totalTokens: number; costTotal: number } }
  | { kind: "failed"; error: string }
  | { kind: "progress"; stopReason: string };

/** Pi fires turn_end for EVERY assistant message, including tool-call rounds
 *  (stopReason "toolUse", no terminal text). Only a textual terminal message
 *  settles the submitted turn; tool rounds are progress, never failure. */
export function classifyTurnEnd(message: { content: unknown; stopReason?: string; model?: string; usage?: Record<string, unknown> }): ChildTurnOutcome {
  const text = assistantText(message);
  const usage = message.usage as { input?: number; output?: number; totalTokens?: number; cost?: { total?: number } } | undefined;
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    return { kind: "failed", error: `child turn ended with stopReason ${String(message.stopReason)}` };
  }
  if (text.trim().length > 0) {
    return {
      kind: "completed",
      text,
      model: message.model ?? undefined,
      usage: { input: usage?.input ?? 0, output: usage?.output ?? 0, totalTokens: usage?.totalTokens ?? 0, costTotal: usage?.cost?.total ?? 0 },
    };
  }
  return { kind: "progress", stopReason: String(message.stopReason ?? "unknown") };
}

function sanitizeBridgeData(value: unknown, key = "", depth = 0): unknown {
  if (depth > 12) return "[REDACTED_DEPTH]";
  if (/token|secret|password|credential|authorization|private.?key|api.?key/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactCredentialText(value).slice(0, 500_000);
  if (Array.isArray(value)) return value.slice(0, 1_024).map((item) => sanitizeBridgeData(item, "", depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 1_024).map(([nestedKey, nested]) => [nestedKey, sanitizeBridgeData(nested, nestedKey, depth + 1)]));
  return value;
}

export function createChildBridge(identity: BridgeIdentity): ChildBridge {
  mkdirSync(identity.dir, { recursive: true });
  mkdirSync(identity.sockDir, { recursive: true, mode: 0o700 });
  const logPath = join(identity.dir, "events.jsonl");
  const socketPath = join(identity.sockDir, "bridge.sock");
  let seq = 0;
  let lastAck = 0;
  const ackPath = join(identity.dir, "bridge-ack.json");
  let phase: BridgePhase = "starting";
  let controlMode: BridgeControlMode = "aili";
  let pendingTurn: TurnPayload | undefined;
  const clients = new Set<Socket>();
  const interactions = new Map<string, { resolve(value: unknown): void; timer?: ReturnType<typeof setTimeout> }>();
  let interactionSequence = 0;
  const replay: Array<{ seq: number; ts: number; event: string; data: Record<string, unknown> }> = [];
  let submitToPi: (task: string) => void = (task) => {
    void task;
    emit("turn.failed", { runId: pendingTurn?.runId ?? identity.runId, jobId: pendingTurn?.jobId, turnId: pendingTurn?.turnId, error: "bridge received submit_turn before its Pi session binding" });
    phase = "idle";
    pendingTurn = undefined;
  };

  function loadExistingSeq(): void {
    if (!existsSync(logPath)) return;
    try {
      for (const line of readFileSync(logPath, "utf8").split("\n")) {
        if (line.trim().length === 0) continue;
        const parsed = JSON.parse(line) as { seq?: number };
        if (typeof parsed.seq === "number" && parsed.seq > seq) seq = parsed.seq;
      }
    } catch {
      // Corrupt tail tolerated; sequence continues above the highest parse.
    }
  }

  function rotateIfNeeded(): void {
    try {
      if (statSync(logPath).size < EVENT_LOG_MAX_BYTES) return;
      renameSync(logPath, join(identity.dir, "events.1.jsonl"));
    } catch {
      // Rotation failure must not break the live stream.
    }
  }

  function emit(event: string, data: Record<string, unknown>): void {
    seq += 1;
    const sanitized = sanitizeBridgeData(data) as Record<string, unknown>;
    const frame = { seq, ts: Date.now(), event, data: sanitized };
    try {
      rotateIfNeeded();
      appendFileSync(logPath, `${JSON.stringify(frame)}\n`, "utf8");
    } catch {
      // Live socket delivery stays authoritative for this slice.
    }
    replay.push(frame);
    if (replay.length > REPLAY_BUFFER_LIMIT) replay.shift();
    const payload = `${JSON.stringify(frame)}\n`;
    for (const client of clients) {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }

  function respond(socket: Socket, id: string | number, ok: boolean, body: unknown): void {
    const frame = ok
      ? { id, ok: true as const, result: body }
      : { id, ok: false as const, error: typeof body === "string" ? body : JSON.stringify(body) };
    try {
      socket.write(`${JSON.stringify(frame)}\n`);
    } catch {
      clients.delete(socket);
    }
  }

  function handleFrame(socket: Socket, frame: { id?: string | number; cmd?: string; params?: Record<string, unknown> }): void {
    const id = frame.id ?? 0;
    const params = frame.params ?? {};
    if (params.token !== identity.token) {
      respond(socket, id, false, "bridge token mismatch");
      return;
    }
    if (frame.cmd === "listen") {
      const afterSeq = Math.max(typeof params.afterSeq === "number" ? params.afterSeq : 0, lastAck);
      for (const entry of replay) {
        if (entry.seq > afterSeq) {
          try {
            socket.write(`${JSON.stringify(entry)}\n`);
          } catch {
            return;
          }
        }
      }
      clients.add(socket);
      return;
    }
    switch (frame.cmd) {
      case "ack": {
        const acknowledged = typeof params.seq === "number" && Number.isSafeInteger(params.seq) ? params.seq : 0;
        if (acknowledged < lastAck || acknowledged > seq) { respond(socket, id, false, "invalid bridge ack"); return; }
        lastAck = acknowledged;
        writeFileSync(ackPath, `${JSON.stringify({ schemaVersion: 1, lastAck })}\n`, { mode: 0o600 });
        respond(socket, id, true, { lastAck });
        return;
      }
      case "status": {
        respond(socket, id, true, { runId: identity.runId, agentId: identity.agentId, loadoutHash: identity.loadoutHash ?? "fixture-unbound", phase, controlMode, lastSeq: seq, lastAck });
        return;
      }
      case "submit_turn": {
        if (phase === "turn-active" || phase === "exiting") {
          respond(socket, id, false, `bridge is ${phase}`);
          return;
        }
        const task = typeof params.task === "string" ? params.task : "";
        if (task.trim().length === 0) {
          respond(socket, id, false, "submit_turn requires a non-empty task");
          return;
        }
        pendingTurn = {
          runId: typeof params.runId === "string" && params.runId.length > 0 ? params.runId : identity.runId,
          jobId: typeof params.jobId === "string" ? params.jobId : "",
          turnId: typeof params.turnId === "string" ? params.turnId : "",
        };
        phase = "turn-active";
        emit("turn.submitted", { ...pendingTurn });
        respond(socket, id, true, { accepted: true });
        submitToPi(task);
        return;
      }
      case "answer_interaction": {
        const interactionId = typeof params.interactionId === "string" ? params.interactionId : "";
        const pending = interactions.get(interactionId);
        if (!pending) { respond(socket, id, false, "unknown interaction"); return; }
        if (pending.timer) clearTimeout(pending.timer);
        interactions.delete(interactionId);
        pending.resolve(params.answer);
        emit("interaction.resolved", { runId: identity.runId, interactionId });
        respond(socket, id, true, { resolved: true });
        return;
      }
      case "shutdown": {
        if (interactions.size > 0) { respond(socket, id, false, "pending interactions block shutdown"); return; }
        respond(socket, id, true, { exiting: true });
        emit("session.exiting", { runId: identity.runId });
        phase = "exiting";
        // Test seam: unit tests host real bridges in-process and must not exit.
        if (process.env.AILI_CHILD_NO_EXIT !== "1") setTimeout(() => process.exit(0), 50).unref();
        return;
      }
      default:
        respond(socket, id, false, `unsupported command: ${String(frame.cmd)}`);
    }
  }

  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) {
          try {
            handleFrame(socket, JSON.parse(line) as { id?: string | number; cmd?: string; params?: Record<string, unknown> });
          } catch {
            respond(socket, 0, false, "malformed json frame");
          }
        }
        newline = buffer.indexOf("\n");
      }
    });
    socket.on("error", () => clients.delete(socket));
    socket.on("close", () => clients.delete(socket));
  });

  loadExistingSeq();

  return {
    emit,
    state: () => ({ phase, controlMode, pendingTurn, pendingInteractions: interactions.size }),
    requestInteraction(kind, request, timeoutMs = 60_000) {
      const interactionId = `interaction-${++interactionSequence}`;
      return new Promise((resolve) => {
        const entry: { resolve(value: unknown): void; timer?: ReturnType<typeof setTimeout> } = { resolve };
        entry.timer = setTimeout(() => { interactions.delete(interactionId); emit("interaction.expired", { runId: identity.runId, interactionId }); resolve("deny"); }, timeoutMs);
        interactions.set(interactionId, entry);
        emit("interaction.requested", { runId: identity.runId, interactionId, kind, request });
      });
    },
    bindSubmission(callback) {
      submitToPi = callback;
    },
    settleTurn() {
      pendingTurn = undefined;
      if (phase === "turn-active") phase = "idle";
    },
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        // A crashed previous incarnation may have left the socket file.
        rmSync(socketPath, { force: true });
        server.listen(socketPath, () => {
          try {
            chmodSync(socketPath, 0o600);
            if ((statSync(socketPath).mode & 0o077) !== 0) throw new Error("bridge socket permissions are too broad");
          } catch (error) {
            server.close(() => reject(error));
            return;
          }
          phase = "ready";
          emit("bridge.ready", { runId: identity.runId, agentId: identity.agentId, pid: process.pid });
          resolve();
        });
      });
    },
    async stop() {
      for (const client of clients) client.destroy();
      clients.clear();
      for (const [interactionId, interaction] of interactions) { if (interaction.timer) clearTimeout(interaction.timer); interaction.resolve("deny"); interactions.delete(interactionId); }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export default function registerAiliHerdrChild(pi: ExtensionAPI): void {
  // Identity rides argv flags (ASCII-safe through herdr's shell encoding) so
  // an idle AILI pane can be reused for a later agent without re-creating
  // the tab; environment variables remain as a fallback.
  pi.registerFlag("aili-bridge-dir", { type: "string", description: "AILI bridge sidecar run directory" });
  pi.registerFlag("aili-bridge-sock-dir", { type: "string", description: "AILI bridge socket directory" });
  pi.registerFlag("aili-run-id", { type: "string", description: "AILI run id" });
  pi.registerFlag("aili-agent-id", { type: "string", description: "AILI agent id" });
  pi.registerFlag("aili-loadout-hash", { type: "string", description: "AILI immutable loadout hash" });
  pi.registerFlag("aili-bridge-token-file", { type: "string", description: "AILI one-use bridge token file" });
  const identity = identityFromArgv(process.argv) ?? identityFromEnv();
  if (!identity) return;
  const loadout = verifyChildLoadout(identity);
  const bridge = createChildBridge(identity);
  let announcedTurnId: string | undefined;
  let terminalCandidate: Exclude<ChildTurnOutcome, { kind: "progress" }> | undefined;
  let uiPromptSequence = 0;
  let activeUiPromptSpan: string | undefined;
  const sandbox = new SandboxController();
  let bashOperations: BashOperations | undefined;
  if (loadout.tools.includes("bash")) {
    const proxy: BashOperations = { exec: (...args) => bashOperations ? bashOperations.exec(...args) : Promise.reject(new Error("Herdr child sandbox is not ready")) };
    pi.registerTool(createBashToolDefinition(loadout.cwd, { operations: proxy }));
  }
  bridge.bindSubmission((task) => {
    pi.sendUserMessage(task, { expandPromptTemplates: false });
  });

  pi.on("session_start", async (_event, ctx) => {
    await sandbox.init({ cwd: loadout.cwd, noSandbox: false, hasUI: false, notify: () => undefined, profile: loadout.permission.mode.sandbox, askHost: async () => false });
    if (loadout.tools.includes("bash")) {
      if (!loadout.permission.mode.sandbox.enabled || !sandbox.ready || sandbox.disabled) throw new Error(`Herdr child sandbox unavailable: ${sandbox.warn ?? "not ready"}`);
      bashOperations = sandbox.bashOps({ readOnly: !loadout.permission.mode.sandbox.writable }) ?? undefined;
      if (!bashOperations) throw new Error("Herdr child sandbox operations are unavailable");
    }
    await bridge.start();
    bridge.emit("session.ready", { runId: identity.runId, reason: "child-security-ready", mode: loadout.permission.modeName });
    ctx.ui.setStatus?.("aili-herdr-security", `Herdr ${loadout.permission.modeName}`);
  });

  // Pi 0.84.4 emits these notification-only events around blocking extension
  // UI. Preserve that exact child signal over the bridge; it is activity
  // evidence only and cannot answer an interaction or settle a turn.
  pi.on("ui_prompt_start", (event) => {
    activeUiPromptSpan ??= `ui-prompt-${++uiPromptSequence}`;
    bridge.emit("ui.prompt.started", {
      runId: identity.runId,
      spanId: activeUiPromptSpan,
      reason: event.reason,
      kind: event.kind,
      ...(event.title ? { title: event.title } : {}),
    });
  });

  pi.on("ui_prompt_end", () => {
    if (!activeUiPromptSpan) return;
    bridge.emit("ui.prompt.ended", { runId: identity.runId, spanId: activeUiPromptSpan });
    activeUiPromptSpan = undefined;
  });

  pi.on("tool_call", async (event) => evaluateHerdrChildTool(
    loadout,
    event.toolName,
    event.input && typeof event.input === "object" ? event.input as Record<string, unknown> : {},
    event.toolName !== "bash" || (sandbox.ready && bashOperations !== undefined),
    async (request) => bridge.requestInteraction("permission", request),
  ));

  pi.on("turn_start", () => {
    const pending = bridge.state().pendingTurn;
    if (pending) {
      if (announcedTurnId !== pending.turnId) {
        announcedTurnId = pending.turnId;
        bridge.emit("turn.started", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId });
      } else {
        bridge.emit("turn.progress", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, phase: "tool-round" });
      }
    } else {
      // Input that did not come through the AILI bridge is human presence.
      bridge.emit("manual.input", { runId: identity.runId });
    }
  });

  pi.on("turn_end", (event) => {
    const pending = bridge.state().pendingTurn;
    if (!pending) return;
    const outcome = classifyTurnEnd(event.message as { content: unknown; stopReason?: string; model?: string; usage?: Record<string, unknown> });
    if (outcome.kind === "progress") {
      bridge.emit("turn.progress", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, stopReason: outcome.stopReason });
      return;
    }
    // A turn_end error may be followed by Pi's automatic retry. Keep only a
    // candidate and wait for agent_settled, which Pi emits after retries,
    // compaction and queued continuations are fully finished.
    terminalCandidate = outcome;
    bridge.emit("turn.progress", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, phase: outcome.kind === "failed" ? "retry-or-final-error" : "terminal-candidate" });
  });

  pi.on("agent_settled", () => {
    const pending = bridge.state().pendingTurn;
    if (!pending) return;
    const outcome = terminalCandidate;
    if (!outcome || outcome.kind === "failed") {
      bridge.emit("turn.failed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, error: outcome?.error ?? "agent settled without a terminal result" });
    } else {
      bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: outcome.text, model: outcome.model, usage: outcome.usage });
    }
    terminalCandidate = undefined;
    bridge.settleTurn();
    announcedTurnId = undefined;
  });

  pi.on("session_shutdown", async () => {
    if (activeUiPromptSpan) {
      bridge.emit("ui.prompt.ended", { runId: identity.runId, spanId: activeUiPromptSpan, aborted: true });
      activeUiPromptSpan = undefined;
    }
    bridge.emit("session.exited", { runId: identity.runId });
    await sandbox.reset();
  });
}
