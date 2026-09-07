import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { connect, createServer, type Server, type Socket } from "node:net";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRoleProfiles, type RoleProfile } from "../../src/runtime/roles.js";
import { loadStockDefaults } from "pi-permission-modes/src/config-load.ts";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import type { TaskExecutorInput } from "../../src/runtime/persistent-agents/sub-coordinator.js";
import { HerdrSocketClient } from "../../src/runtime/persistent-agents/backends/herdr/client.js";
import { HerdrProtocolError } from "../../src/runtime/persistent-agents/backends/herdr/protocol.js";
import { bridgeSocketDirFor, generateBridgeToken, herdrLiveName, herdrTabLabel } from "../../src/runtime/persistent-agents/backends/herdr/naming.js";
import { assertHerdrRoleSupported, buildChildArgv, herdrRunLoadout, HerdrExecutionBackend, readBoundedExternalResult, type HerdrExecutionBackendOptions } from "../../src/runtime/persistent-agents/backends/herdr/adapter.js";
import { detectHerdrIntegrationStatus, parseHerdrIntegrationStatus } from "../../src/runtime/persistent-agents/backends/herdr/availability.js";
import { EXTERNAL_CLI_REGISTRY } from "../../src/runtime/persistent-agents/external-cli.js";
import { classifyTurnEnd, createChildBridge, evaluateHerdrChildTool, identityFromArgv, verifyChildLoadout } from "../../src/runtime/persistent-agents/herdr-child/index.js";

let scratch = "";
let sequence = 0;
let savedHerdrEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/herdr-backends-"));
  sequence = 0;
  // Isolate fixtures from the host terminal: running tests from inside a
  // Herdr pane leaks HERDR_ENV/HERDR_WORKSPACE_ID and silently flips the
  // adapter into parent-in-herdr mode against fake snapshots.
  savedHerdrEnv = {};
  for (const key of ["HERDR_ENV", "HERDR_WORKSPACE_ID", "HERDR_TAB_ID", "HERDR_PANE_ID"]) {
    savedHerdrEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Real child bridges live in-process here; their shutdown handler must not
  // exit the test runner.
  process.env.AILI_CHILD_NO_EXIT = "1";
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedHerdrEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.AILI_CHILD_NO_EXIT;
});

// HSTART-AGY-20260907: the three known visible startup markers, not a
// completed answer. Padding/CRLF model stripped terminal rows.
const AGY_STARTUP_UI = "  Antigravity CLI 1.1.27\r\n\r\n  >   \r\n  ? for shortcuts          Gemini 3.8 Flash · high  \r\n";
const AGY_STARTUP_UI_SHORT_FOOTER = "  Antigravity CLI\r\n\r\n  >   \r\n  ? for shortcuts  \r\n";

type StartupRead = Record<string, unknown> | "error" | "hang" | "missing";

/** Minimal scriptable stand-in for the Herdr daemon's socket API. */
class FakeHerdrServer {
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  private server?: Server;
  private readonly sockets = new Set<Socket>();
  protocol = 20;
  workspaces: Array<Record<string, unknown>> = [];
  panes: Array<Record<string, unknown>> = [];
  private tabCounter = 0;
  /** First N agent.start calls answer agent_pane_busy (fresh-pane race). */
  agentStartBusyTimes = 0;
  /** Reject the first agent.start calls targeting this pane (contention). */
  agentStartRejectPane?: { paneId: string; times: number };
  externalPromptMode: "settle" | "blocked" | "idle" | "unknown" = "settle";
  /** Fresh post-acceptance agent.get views, for socket-driven synchronization. */
  readonly externalObservations: Array<Record<string, unknown>> = [];
  /** Simulate the pane record becoming visible before the live-name index. */
  nameLookupNotReadyTimes = 0;
  /** Returned identity is correct while input-ready status/interactive readiness lag. */
  statusNotReadyTimes = 0;
  interactiveReadyFalseTimes = 0;
  externalPromptRejectTimes = 0;
  externalPromptAttemptedCount = 0;
  externalPromptAcceptedCount = 0;
  externalPromptBeforeReadyCount = 0;
  startupReads: StartupRead[] = [];
  startupReadCount = 0;
  onStartupRead?: (pane: Record<string, unknown>, count: number) => void;
  onPromptRejected?: () => void;
  private agyInputVisible = true;
  private lastExternalReadinessObserved = false;
  onAgentStart?: (params: Record<string, unknown>) => void;

  async start(): Promise<string> {
    const socketPath = join(scratch, "herdr.sock");
    await new Promise<void>((resolveListen, rejectListen) => {
      this.server = createServer((socket) => {
        this.sockets.add(socket);
        socket.setEncoding("utf8");
        let buffer = "";
        socket.on("data", (chunk: string) => {
          buffer += chunk;
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (line.length > 0) void this.handle(socket, JSON.parse(line) as { id?: number; method?: string; params?: Record<string, unknown> });
            newline = buffer.indexOf("\n");
          }
        });
        socket.on("close", () => this.sockets.delete(socket));
      });
      this.server.once("error", rejectListen);
      this.server.listen(socketPath, () => resolveListen());
    });
    return socketPath;
  }

  emit(event: string, data: Record<string, unknown>): void {
    const payload = `${JSON.stringify({ event, data })}\n`;
    for (const socket of this.sockets) socket.write(payload);
  }

  private snapshot(): Record<string, unknown> {
    return {
      snapshot: {
        protocol: this.protocol,
        workspaces: this.workspaces,
        tabs: [],
        panes: this.panes,
      },
    };
  }

  private async handle(socket: Socket, request: { id?: number; method?: string; params?: Record<string, unknown> }): Promise<void> {
    const id = request.id ?? 0;
    const method = request.method ?? "";
    const params = request.params ?? {};
    this.calls.push({ method, params });
    const respond = (result: unknown) => socket.write(`${JSON.stringify({ id, result })}\n`);
    switch (method) {
      case "ping":
        respond({ pong: true });
        return;
      case "events.subscribe":
        respond({ subscribed: true });
        this.emit("pane.agent_status_changed", { pane_id: "w1:p1", agent_status: "idle" });
        return;
      case "session.snapshot":
        respond(this.snapshot());
        return;
      case "workspace.create":
        respond({ workspace: { workspace_id: "w1", label: params.label ?? "" }, tab: { tab_id: "w1:t0" }, root_pane: { pane_id: "w1:p0" } });
        return;
      case "workspace.report_metadata":
        respond({ ok: true });
        return;
      case "tab.create": {
        this.tabCounter += 1;
        const tabId = `w1:t${this.tabCounter}`;
        const paneId = `w1:p${this.tabCounter}`;
        this.panes.push({ pane_id: paneId, workspace_id: typeof params.workspace_id === "string" ? params.workspace_id : "w1", tab_id: tabId, terminal_id: `term_${this.tabCounter}`, focused: false, agent: null, agent_status: "unknown", revision: 0, tokens: {} });
        respond({ tab: { tab_id: tabId }, root_pane: { pane_id: paneId } });
        return;
      }
      case "pane.split": {
        this.tabCounter += 1;
        const source = this.panes.find((entry) => entry.pane_id === params.target_pane_id);
        const tabId = (source?.tab_id as string | undefined) ?? "w1:t1";
        const paneId = `w1:p${this.tabCounter}`;
        this.panes.push({ pane_id: paneId, workspace_id: (source?.workspace_id as string | undefined) ?? "w1", tab_id: tabId, terminal_id: `term_${this.tabCounter}`, focused: false, agent: null, agent_status: "unknown", revision: 0, tokens: {} });
        respond({ pane: { pane_id: paneId, tab_id: tabId, workspace_id: (source?.workspace_id as string | undefined) ?? "w1" } });
        return;
      }
      case "pane.report_metadata": {
        const pane = this.panes.find((entry) => entry.pane_id === params.pane_id);
        if (pane) pane.tokens = { ...(pane.tokens as Record<string, string>), ...(params.tokens as Record<string, string>) };
        respond({ ok: true });
        return;
      }
      case "agent.get": {
        const readinessView = (pane: Record<string, unknown>) => {
          const view = { ...pane };
          if (this.statusNotReadyTimes > 0) {
            this.statusNotReadyTimes -= 1;
            view.agent_status = "working";
          }
          if (this.interactiveReadyFalseTimes > 0) {
            this.interactiveReadyFalseTimes -= 1;
            view.interactive_ready = false;
          }
          if (this.externalPromptAcceptedCount > 0) this.externalObservations.push({ ...view });
          this.lastExternalReadinessObserved = (view.agent_status === "idle" || view.agent_status === "done")
            && (!("interactive_ready" in view) || view.interactive_ready === true);
          return view;
        };
        const paneTarget = this.panes.find((entry) => entry.pane_id === params.target);
        if (paneTarget) {
          respond({ type: "agent_info", agent: readinessView(paneTarget) });
          return;
        }
        const pane = this.panes.find((entry) => entry.name === params.target);
        if (pane && this.nameLookupNotReadyTimes > 0) {
          this.nameLookupNotReadyTimes -= 1;
          socket.write(`${JSON.stringify({ id, error: { code: "agent_not_ready", message: `agent ${String(params.target)} is not an active named agent` } })}\n`);
          return;
        }
        if (!pane) {
          socket.write(`${JSON.stringify({ id, error: { code: "agent_not_found", message: "agent target not found" } })}\n`);
          return;
        }
        respond({ type: "agent_info", agent: readinessView(pane) });
        return;
      }
      case "agent.prompt": {
        this.externalPromptAttemptedCount += 1;
        if (!this.lastExternalReadinessObserved) this.externalPromptBeforeReadyCount += 1;
        const pane = this.panes.find((entry) => entry.name === params.target);
        if (!pane) {
          socket.write(`${JSON.stringify({ id, error: { code: "agent_not_ready", message: `agent ${String(params.target)} is not an active named agent` } })}\n`);
          return;
        }
        if (this.externalPromptRejectTimes > 0) {
          this.externalPromptRejectTimes -= 1;
          this.onPromptRejected?.();
          socket.write(`${JSON.stringify({ id, error: { code: "agent_not_ready", message: "agent is not yet accepting interactive input" } })}\n`);
          return;
        }
        this.externalPromptAcceptedCount += 1;
        // Herdr accepting PTY input does not mean Agy consumed it. A boot-only
        // screen cannot manufacture the fake working -> idle transition.
        if (pane.agent === "agy" && !this.agyInputVisible) {
          this.externalPromptBeforeReadyCount += 1;
          respond({ type: "agent_prompted", agent: { ...pane } });
          return;
        }
        const status = this.externalPromptMode === "settle" ? "working" : this.externalPromptMode;
        pane.agent_status = status;
        pane.state_change_seq = Number(pane.state_change_seq ?? 1) + 1;
        respond({ type: "agent_prompted", agent: { ...pane, agent_status: status } });
        if (this.externalPromptMode === "settle") setTimeout(() => {
          pane.agent_status = "idle";
          pane.state_change_seq = Number(pane.state_change_seq ?? 2) + 1;
        }, 20);
        return;
      }
      case "agent.read": {
        const pane = this.panes.find((entry) => entry.name === params.target);
        if (!pane) {
          socket.write(`${JSON.stringify({ id, error: { code: "agent_not_ready", message: `agent ${String(params.target)} is not an active named agent` } })}\n`);
          return;
        }
        if (params.source === "visible") {
          this.startupReadCount += 1;
          const scripted = this.startupReads.length > 1 ? this.startupReads.shift()! : this.startupReads[0];
          if (scripted === "hang") return;
          if (scripted === "error") {
            socket.write(`${JSON.stringify({ id, error: { code: "read_failed", message: "fixture startup read failed" } })}\n`);
            return;
          }
          const read = { pane_id: pane.pane_id, source: "visible", format: "text", text: AGY_STARTUP_UI, truncated: false, ...(typeof scripted === "object" ? scripted : {}) };
          this.agyInputVisible = (read.text === AGY_STARTUP_UI || read.text === AGY_STARTUP_UI_SHORT_FOOTER) && read.truncated === false;
          this.onStartupRead?.(pane, this.startupReadCount);
          respond(scripted === "missing" ? { type: "pane_read" } : { type: "pane_read", read });
          return;
        }
        respond({ type: "pane_read", read: { pane_id: pane.pane_id, workspace_id: pane.workspace_id ?? "w1", tab_id: pane.tab_id ?? "w1:t1", source: params.source, format: params.format ?? "text", text: "vendor completed output", revision: pane.revision ?? 0, truncated: false } });
        return;
      }
      case "agent.start":
        if (this.agentStartBusyTimes > 0) {
          this.agentStartBusyTimes -= 1;
          socket.write(`${JSON.stringify({ id, error: { code: "agent_pane_busy", message: "agent target pane is not an available shell" } })}\n`);
          return;
        }
        if (this.agentStartRejectPane && this.agentStartRejectPane.times > 0 && params.pane_id === this.agentStartRejectPane.paneId) {
          this.agentStartRejectPane.times -= 1;
          socket.write(`${JSON.stringify({ id, error: { code: "agent_pane_not_found", message: "agent target pane does not exist" } })}\n`);
          return;
        }
        this.onAgentStart?.(params);
        {
          const pane = this.panes.find((entry) => entry.pane_id === params.pane_id);
          if (pane) {
            pane.agent = String(params.kind ?? "pi");
            pane.name = String(params.name ?? "pi");
            pane.agent_status = "idle";
            pane.state_change_seq = 1;
            if (params.kind !== "pi") pane.interactive_ready = true;
          }
        }
        respond({ type: "agent_started", agent: { ...this.panes.find((entry) => entry.pane_id === params.pane_id) }, argv: [params.kind, ...((params.args as string[] | undefined) ?? [])] });
        return;
      case "pane.close":
        this.panes = this.panes.filter((pane) => pane.pane_id !== params.pane_id);
        respond({ closed: true });
        return;
      case "tab.close":
        this.panes = this.panes.filter((pane) => pane.tab_id !== params.tab_id);
        respond({ closed: true });
        return;
      case "bogus.method":
        socket.write(`${JSON.stringify({ id, error: { code: "not_found", message: "no such method" } })}\n`);
        return;
      default:
        respond({});
    }
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolveStop) => this.server?.close(() => resolveStop()));
  }
}

async function fixtureJournal(parentId = "parent-herdr"): Promise<CoordinatorJournal> {
  const parentFile = join(scratch, `${parentId}.jsonl`);
  await writeFile(parentFile, "fixture parent\n");
  const layout = await ensureSidecarLayout(parentFile);
  return (await CoordinatorJournal.open(layout, parentId, {
    eventId: () => `event-${++sequence}`,
    clock: () => new Date(Date.UTC(2026, 7, 26, 2, 0, sequence)),
  })).journal;
}

function executorInput(agentId: string, role: RoleProfile, overrides: Partial<TaskExecutorInput> = {}): TaskExecutorInput {
  return {
    agentId,
    jobId: "job-1",
    turnId: "turn-1",
    item: {
      task: "Review the fixture diff.",
      agent: role.selector,
      workspace: "auto",
      writeScope: { paths: [], resources: [] },
    },
    role,
    depth: 0,
    context: { signal: new AbortController().signal } as never,
    backend: "herdr",
    ...overrides,
  } as TaskExecutorInput;
}

describe("herdr socket client", () => {
  it("connects, snapshots, replays events buffered during sync, and guards the protocol version", async () => {
    const server = new FakeHerdrServer();
    const socketPath = await server.start();
    const client = new HerdrSocketClient({ socketPath, callTimeoutMs: 2_000 });
    const received: string[] = [];
    const sync = await client.sync((event) => received.push(event.event));
    expect(sync.snapshot.protocol).toBe(20);
    // The fake server emits one event between subscribe and snapshot install.
    expect(sync.replayed.map((event) => event.event)).toEqual(["pane.agent_status_changed"]);
    expect(received).toEqual(["pane.agent_status_changed"]);
    expect(client.protocolVersion).toBe(20);
    await expect(client.call("bogus.method")).rejects.toThrow(HerdrProtocolError);
    await client.disconnect();

    server.protocol = 21;
    const guardClient = new HerdrSocketClient({ socketPath, callTimeoutMs: 2_000 });
    await expect(guardClient.sync()).rejects.toThrow(/protocol 21 .*not supported/);
    await guardClient.disconnect();
    await server.stop();
  });

  it("reproduces agent_not_ready when post-readiness Agent APIs receive a pane id", async () => {
    const server = new FakeHerdrServer();
    server.panes = [{ pane_id: "w9:p6", workspace_id: "w9", tab_id: "w9:t1", agent: null, agent_status: "unknown" }];
    const socketPath = await server.start();
    const client = new HerdrSocketClient({ socketPath, callTimeoutMs: 2_000 });
    await client.sync();
    await client.call("agent.start", { name: "named-agent", kind: "codex", pane_id: "w9:p6", args: [] });
    await expect(client.call("agent.get", { target: "w9:p6" })).resolves.toMatchObject({ agent: { name: "named-agent", pane_id: "w9:p6" } });
    await expect(client.call("agent.get", { target: "w9:p6" })).resolves.toMatchObject({ agent: { name: "named-agent", pane_id: "w9:p6" } });
    await expect(client.call("agent.prompt", { target: "w9:p6", text: "x" })).rejects.toMatchObject({ herdrCode: "agent_not_ready" });
    await expect(client.call("agent.read", { target: "w9:p6" })).rejects.toMatchObject({ herdrCode: "agent_not_ready" });
    await expect(client.call("agent.get", { target: "named-agent" })).resolves.toMatchObject({ agent: { pane_id: "w9:p6" } });
    await client.disconnect();
    await server.stop();
  });

  it("fails explicitly when the daemon socket is unreachable", async () => {
    const client = new HerdrSocketClient({ socketPath: join(scratch, "missing.sock"), callTimeoutMs: 500 });
    await expect(client.sync()).rejects.toThrow(/cannot connect to herdr socket/);
  });
});

describe("herdr integration availability", () => {
  it("maps only agy-cli to the declarative antigravity integration", () => {
    expect(EXTERNAL_CLI_REGISTRY["agy-cli"].requiredHerdrIntegration).toBe("antigravity-cli");
    for (const id of ["claude-code", "codex-cli", "opencode", "grok-cli"] as const) {
      expect(EXTERNAL_CLI_REGISTRY[id].requiredHerdrIntegration).toBeUndefined();
    }
  });

  it("parses only the exact integration id and exact current state", () => {
    const output = "antigravity-cli-old: current\nantigravity-cli: outdated\npi: current\n";
    expect(parseHerdrIntegrationStatus(output, "antigravity-cli")).toBe("outdated");
    expect(parseHerdrIntegrationStatus("antigravity-cli: current\n", "antigravity-cli")).toBe("current");
    expect(parseHerdrIntegrationStatus("antigravity-cli: current (v2) (/home/user/.gemini/config/hooks/herdr-agent-state.sh)\n", "antigravity-cli")).toBe("current");
    expect(parseHerdrIntegrationStatus(output, "antigravity")).toBeUndefined();
    expect(() => parseHerdrIntegrationStatus("", "--bad")).toThrow(/exact lowercase identifier/);
  });

  it("detects missing/current status with one no-shell read-only command and does not modify HOME", async () => {
    const binDir = join(scratch, "integration-bin");
    const homeDir = join(scratch, "integration-home");
    await mkdir(binDir, { recursive: true });
    await mkdir(homeDir, { recursive: true });
    const fakeHerdr = join(binDir, "herdr-fixture");
    await writeFile(fakeHerdr, "#!/usr/bin/env node\nif (process.argv.slice(2).join(' ') !== 'integration status') process.exit(9)\nprocess.stdout.write(process.env.FIXTURE_STATUS || 'antigravity-cli: missing\\n')\n", { mode: 0o700 });
    const priorHome = process.env.HOME;
    process.env.HOME = homeDir;
    try {
      process.env.FIXTURE_STATUS = "antigravity-cli: missing\n";
      await expect(detectHerdrIntegrationStatus("antigravity-cli", fakeHerdr)).resolves.toMatchObject({ status: "missing", current: false });
      process.env.FIXTURE_STATUS = "antigravity-cli: current\n";
      await expect(detectHerdrIntegrationStatus("antigravity-cli", fakeHerdr)).resolves.toMatchObject({ status: "current", current: true });
      expect(await import("node:fs/promises").then(({ readdir }) => readdir(homeDir))).toEqual([]);
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
      delete process.env.FIXTURE_STATUS;
    }
  });
});

describe("external CLI structured result evidence", () => {
  it("classifies pending, empty, invalid identity, and valid correlated results", async () => {
    const path = join(scratch, "external-result.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "pending", output: "" }));
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "missing" });

    await writeFile(path, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "completed", output: "" }));
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "empty" });

    await writeFile(path, JSON.stringify({ schemaVersion: 1, runId: "run-stale", turnId: "turn-1", status: "completed", output: "stale" }));
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "invalid" });

    await writeFile(path, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "completed", output: "# Actual review", changedFiles: [], verification: ["checked"] }));
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "valid", result: { status: "completed", output: "# Actual review" } });
    await writeFile(path, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "partial", output: "# Partial review" }));
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "valid", result: { status: "partial", output: "# Partial review" } });
  });

  it("distinguishes transient writes from oversized documents and read I/O failures", async () => {
    const path = join(scratch, "external-result-invalid.json");
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "missing" });
    await writeFile(path, "");
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "empty", transient: true });
    await writeFile(path, "not-json");
    await expect(readBoundedExternalResult(path, "run-1", "turn-1")).resolves.toMatchObject({ kind: "invalid", transient: true });
    await writeFile(path, "x".repeat(64 * 1024 + 1));
    expect(await readBoundedExternalResult(path, "run-1", "turn-1")).toEqual({ kind: "invalid", diagnostic: "result exceeds 65536-byte bound" });
    await rm(path);
    await mkdir(path);
    expect(await readBoundedExternalResult(path, "run-1", "turn-1")).toEqual({ kind: "invalid", diagnostic: "result read failed (EISDIR)" });
  });

  it.each([
    ["run identity", { runId: "stale-run" }],
    ["turn identity", { turnId: "stale-turn" }],
    ["schema", { schemaVersion: 2 }],
    ["status", { status: "success" }],
    ["non-string final status", { status: ["completed"] }],
    ["non-string pending status", { status: ["pending"] }],
    ["changedFiles", { changedFiles: [1] }],
    ["verification", { verification: "unchecked" }],
    ["output type", { output: null }],
  ] as const)("rejects stable %s errors even in pending documents", async (_label, invalidFields) => {
    const path = join(scratch, "external-result-stable-invalid.json");
    for (const status of ["completed", "pending"]) {
      await writeFile(path, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status, output: "result", ...invalidFields }));
      const result = await readBoundedExternalResult(path, "run-1", "turn-1");
      expect(result).toMatchObject({ kind: "invalid" });
      expect(result).not.toHaveProperty("transient");
    }
  });
});

describe("herdr naming and gating", () => {
  it("generates daemon-valid unique live names and tab labels", () => {
    const a = herdrLiveName("parent-one", 3);
    const b = herdrLiveName("parent-two", 3);
    expect(a).toMatch(/^[a-z][a-z0-9_-]{0,31}$/);
    expect(b).toMatch(/^[a-z][a-z0-9_-]{0,31}$/);
    expect(a).not.toEqual(b);
    expect(herdrTabLabel("Worker", "Parser Scout 词")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateBridgeToken()).toMatch(/^[0-9a-f]{48}$/);
  });

  it("accepts static built-in write roles after security bootstrap and rejects formal packages", async () => {
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const implementer = profiles.find((role) => role.selector === "aili.implementer")!;
    expect(() => assertHerdrRoleSupported(reviewer, executorInput("Worker", reviewer).item)).not.toThrow();
    expect(() => assertHerdrRoleSupported(implementer, executorInput("Worker", implementer).item)).not.toThrow();
    expect(() => assertHerdrRoleSupported(reviewer, {
      task: "x",
      agent: reviewer.selector,
      workspace: "auto",
      writeScope: { paths: [], resources: [] },
      formalContext: { changeId: "some-change" },
    })).toThrow(/formal task-board packages/);
  });

  it("binds the immutable external-CLI runner into the loadout hash without persisting raw help", async () => {
    const profiles = await loadRoleProfiles();
    const worker = profiles.find((role) => role.selector === "aili.implementer")!;
    const probeOne = { cli: "codex-cli" as const, executable: "codex", version: "codex 1.0.0", help: "usage: codex exec <prompt>", identity: "confirmed" as const, completed: { version: true as const, help: true as const }, outputTruncated: false, yolo: { disposition: "yolo-unavailable" as const, argv: [] as const } };
    const probeTwo = { ...probeOne, version: "codex 1.1.0" };
    const base = executorInput("Worker", worker);
    const plain = herdrRunLoadout(base, "run-1", scratch);
    expect(plain.runner).toBeNull();
    expect(plain.runnerModifierHash).toBeNull();
    expect(plain.nestedCli).toBeNull();
    const withCli = herdrRunLoadout({ ...base, nestedCli: "codex-cli", cliProbe: probeOne }, "run-2", scratch);
    expect(withCli.nestedCli).toBe("codex-cli");
    expect(withCli.runner).toBe("herdr-external-cli/v1");
    expect(withCli.executableBinding).toBe("Unverified");
    expect(withCli.executionBoundary).toBe("trusted-local-vendor");
    expect(withCli.runnerModifierHash).toBe(createHash("sha256").update(JSON.stringify({ cli: probeOne.cli, executable: probeOne.executable, version: probeOne.version, help: probeOne.help, yolo: probeOne.yolo })).digest("hex"));
    expect(herdrRunLoadout({ ...base, nestedCli: "codex-cli", cliProbe: probeOne, permissionModeSnapshot: { name: "build", mode: loadStockDefaults().modes.build } }, "run-mode", scratch).permission.modeName).toBe("build");
    // Raw bounded help never lands in the durable loadout: only its hash does.
    expect(JSON.stringify(withCli)).not.toContain("usage: codex exec");
    const changedProbe = herdrRunLoadout({ ...base, nestedCli: "codex-cli", cliProbe: probeTwo }, "run-3", scratch);
    expect(changedProbe.runnerModifierHash).not.toBe(withCli.runnerModifierHash);
    expect(changedProbe.loadoutHash).not.toBe(withCli.loadoutHash);
  });

  it("builds a locked-down, shell-safe ASCII child argv", () => {
    const argv = buildChildArgv({
      bootstrapModulePath: "/pkg/herdr-child/index.ts",
      sessionDir: "/sidecar/herdr-sessions/Worker",
      sessionId: "Worker",
      tools: ["read", "grep"],
      model: "google/gemini-2.5-pro",
      thinking: "high",
    });
    expect(argv).toContain("--no-extensions");
    expect(argv.join(" ")).toContain("-e /pkg/herdr-child/index.ts");
    expect(argv.join(" ")).toContain("--tools read,grep");
    expect(argv.join(" ")).toContain("--model google/gemini-2.5-pro");
    // Herdr shell-encodes argv: every entry must stay printable ASCII.
    expect(argv.every((entry) => /^[\x20-\x7e]+$/.test(entry) && !/["'`\\$]/.test(entry))).toBe(true);
  });
});

describe("child turn-end classification", () => {
  it("treats tool-call rounds as progress, textual stops as completed, errors as failed", () => {
    expect(classifyTurnEnd({ content: [{ type: "tool_call", id: "t1" }], stopReason: "toolUse" })).toEqual({ kind: "progress", stopReason: "toolUse" });
    expect(classifyTurnEnd({ content: [{ type: "text", text: "审阅结论:…" }], stopReason: "stop", model: "p/m", usage: { input: 1, output: 2, totalTokens: 3, cost: { total: 0.5 } } }))
      .toEqual({ kind: "completed", text: "审阅结论:…", model: "p/m", usage: { input: 1, output: 2, totalTokens: 3, costTotal: 0.5 } });
    expect(classifyTurnEnd({ content: [], stopReason: "error" })).toEqual({ kind: "failed", error: "child turn ended with stopReason error" });
  });

  it("verifies the immutable per-Run child loadout before bridge startup", async () => {
    const dir = join(scratch, "verified-loadout");
    await mkdir(dir, { recursive: true });
    const body = { schemaVersion: 2, runId: "run-1", agentId: "Worker", selector: "aili.code-scout", profileHash: "p", sourceHash: "s", tools: ["read"], snippets: [], model: null, thinking: null, cwd: scratch, permission: { modeName: "build", mode: { label: "Build", color: "accent", sandbox: { enabled: true, writable: true }, permission: { read: "allow" } } } };
    const loadoutHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    await writeFile(join(dir, "loadout.json"), `${JSON.stringify({ ...body, loadoutHash }, null, 2)}\n`, { mode: 0o600 });
    expect(() => verifyChildLoadout({ dir, sockDir: dir, runId: "run-1", agentId: "Worker", token: "t".repeat(43), loadoutHash })).not.toThrow();
    expect(() => verifyChildLoadout({ dir, sockDir: dir, runId: "run-2", agentId: "Worker", token: "t".repeat(43), loadoutHash })).toThrow(/verification failed/);
  });

  it("enforces immutable tool, workspace, permission and sandbox policy", async () => {
    const loadout = { runId: "run-1", agentId: "Worker", cwd: scratch, tools: ["read", "write", "edit", "bash"], permission: { modeName: "build", mode: { label: "Build", color: "accent", sandbox: { enabled: true, writable: true }, permission: { path: "allow", read: "allow", write: "ask", edit: "allow", bash: "allow" } } } } as const;
    await expect(evaluateHerdrChildTool(loadout as never, "unknown", {}, true, async () => "allow")).resolves.toMatchObject({ block: true });
    await expect(evaluateHerdrChildTool(loadout as never, "write", { path: "../escape.txt" }, true, async () => "allow")).resolves.toMatchObject({ reason: /workspace boundary/ });
    await expect(evaluateHerdrChildTool(loadout as never, "write", { path: "safe.txt" }, true, async () => "deny")).resolves.toMatchObject({ reason: /permission denied/ });
    await expect(evaluateHerdrChildTool(loadout as never, "write", { path: "safe.txt" }, true, async () => "allow")).resolves.toBeUndefined();
    await expect(evaluateHerdrChildTool(loadout as never, "bash", { command: "pwd" }, false, async () => "allow")).resolves.toMatchObject({ reason: /sandbox unavailable/ });
    await expect(evaluateHerdrChildTool(loadout as never, "read", { path: ".env" }, true, async () => "allow")).resolves.toMatchObject({ reason: /credential/ });
  });

  it("waits for agent_settled instead of treating retrying turn_end as terminal", async () => {
    const source = await readFile("src/runtime/persistent-agents/herdr-child/index.ts", "utf8");
    const turnEndStart = source.indexOf('pi.on("turn_end"');
    const settledStart = source.indexOf('pi.on("agent_settled"');
    const shutdownStart = source.indexOf('pi.on("session_shutdown"');
    const turnEnd = source.slice(turnEndStart, settledStart);
    const settled = source.slice(settledStart, shutdownStart);
    expect(turnEnd).toContain("retry-or-final-error");
    expect(turnEnd).not.toContain('bridge.emit("turn.failed"');
    expect(settled).toContain('bridge.emit("turn.failed"');
    expect(settled).toContain('bridge.emit("turn.completed"');
  });

  it("parses bridge identity directly from argv (no flag-registration timing)", async () => {
    const tokenFile = join(scratch, "argv-token");
    await writeFile(tokenFile, `${"t".repeat(43)}\n`, { mode: 0o600 });
    const identity = identityFromArgv([
      "pi", "--no-extensions",
      "--aili-bridge-dir", "/sidecar/herdr-runs/run-2",
      "--aili-bridge-sock-dir", "/run/user/1000/.aili-bridges/abc123",
      "--aili-run-id", "run-2",
      "--aili-agent-id", "Worker",
      "--aili-loadout-hash", "a".repeat(64),
      "--aili-bridge-token-file", tokenFile,
    ]);
    expect(identity).toEqual({ dir: "/sidecar/herdr-runs/run-2", sockDir: "/run/user/1000/.aili-bridges/abc123", runId: "run-2", agentId: "Worker", loadoutHash: "a".repeat(64), token: "t".repeat(43) });
    await expect(readFile(tokenFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(identityFromArgv(["pi", "--no-extensions"])).toBeUndefined();
    expect(identityFromArgv(["pi", "--aili-bridge-dir"])).toBeUndefined();
  });
});

describe("child bridge server", () => {  it("authenticates commands, replays events after a sequence, and dual-writes the log", async () => {
    const dir = join(scratch, "run-1");
    await mkdir(dir, { recursive: true });
    const token = generateBridgeToken();
    const bridge = createChildBridge({ dir, sockDir: dir, runId: "run-1", agentId: "Worker", token });
    await bridge.start();
    bridge.emit("session.ready", { reason: "test" });

    const socket = await new Promise<import("node:net").Socket>((resolveConnect) => {
      const sock = connect(join(dir, "bridge.sock"), () => resolveConnect(sock));
    });
    socket.setEncoding("utf8");
    let buffer = "";
    const frames: Array<Record<string, unknown>> = [];
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) frames.push(JSON.parse(line) as Record<string, unknown>);
        newline = buffer.indexOf("\n");
      }
    });
    const waitFrames = (count: number) => new Promise<void>((resolveWait) => {
      const check = () => frames.length >= count ? resolveWait() : setTimeout(check, 20);
      check();
    });

    socket.write(`${JSON.stringify({ id: 1, cmd: "status", params: { token: "wrong" } })}\n`);
    await waitFrames(1);
    expect(frames[0]).toMatchObject({ id: 1, ok: false, error: "bridge token mismatch" });

    socket.write(`${JSON.stringify({ cmd: "listen", params: { afterSeq: 0, token } })}\n`);
    await waitFrames(3);
    expect(frames.slice(1).map((frame) => frame.event)).toEqual(["bridge.ready", "session.ready"]);

    const interaction = bridge.requestInteraction("question", { question: "Choose", options: ["A", "B"] }, 5_000);
    await waitFrames(4);
    const requested = frames.find((frame) => frame.event === "interaction.requested") as { data?: { interactionId?: string } } | undefined;
    expect(requested?.data?.interactionId).toBeTruthy();
    socket.write(`${JSON.stringify({ id: 2, cmd: "shutdown", params: { token } })}\n`);
    await waitFrames(5);
    expect(frames.at(-1)).toMatchObject({ id: 2, ok: false, error: "pending interactions block shutdown" });
    socket.write(`${JSON.stringify({ id: 3, cmd: "answer_interaction", params: { token, interactionId: requested!.data!.interactionId, answer: "A" } })}\n`);
    await expect(interaction).resolves.toBe("A");
    await waitFrames(7);

    const beforeSubmit = frames.length;
    socket.write(`${JSON.stringify({ id: 4, cmd: "submit_turn", params: { token, task: "do it" } })}\n`);
    await waitFrames(beforeSubmit + 3);
    const events = frames.map((frame) => frame.event).filter(Boolean);
    expect(events).toContain("turn.submitted");
    expect(events).toContain("turn.failed"); // no Pi binding in this unit test

    bridge.emit("tool.completed", { token: "super-secret-token", summary: "api_key=super-secret" });
    const log = await readFile(join(dir, "events.jsonl"), "utf8");
    expect(log).not.toContain("super-secret");
    expect(log).toContain("[REDACTED]");
    const entries = log.trim().split("\n").map((line) => JSON.parse(line) as { seq: number });
    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries.map((entry) => entry.seq)).toEqual([...entries.map((entry) => entry.seq)].sort((a, b) => a - b));
    const beforeAck = frames.length;
    socket.write(`${JSON.stringify({ id: 5, cmd: "ack", params: { token, seq: entries.at(-1)!.seq } })}\n`);
    await waitFrames(beforeAck + 1);
    expect(frames.at(-1)).toMatchObject({ id: 5, ok: true, result: { lastAck: entries.at(-1)!.seq } });
    expect(JSON.parse(await readFile(join(dir, "bridge-ack.json"), "utf8"))).toMatchObject({ lastAck: entries.at(-1)!.seq });
    socket.destroy();
    await bridge.stop();
  });
});

async function agyStartupFixture(server: FakeHerdrServer, options: Partial<HerdrExecutionBackendOptions> = {}) {
  const journal = await fixtureJournal("parent-agy-startup");
  const reviewer = (await loadRoleProfiles()).find((role) => role.selector === "aili.code-reviewer")!;
  const agentId = "AgyStartup";
  const timestamp = "2026-09-07T00:00:00.000Z";
  await journal.append({ kind: "agent.created", agentId, payload: { record: { id: agentId, name: agentId, selector: reviewer.selector, state: "queued", backend: "herdr", driver: "external-cli", createdAt: timestamp, updatedAt: timestamp } } });
  await journal.append({ kind: "job.created", agentId, jobId: "job-1", payload: { record: { id: "job-1", agentId, state: "queued", createdAt: timestamp, updatedAt: timestamp } } });
  await journal.append({ kind: "turn.created", agentId, jobId: "job-1", turnId: "turn-1", payload: { record: { id: "turn-1", agentId, jobId: "job-1", state: "queued", createdAt: timestamp, updatedAt: timestamp } } });
  await journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
  await journal.append({ kind: "job.state", agentId, jobId: "job-1", payload: { from: "queued", to: "running" } });
  await journal.append({ kind: "turn.state", agentId, jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });
  const socketPath = await server.start();
  const acceptedPrompts: string[] = [];
  const backend = new HerdrExecutionBackend({
    journal, layout: journal.layout, parentId: "parent-agy-startup", cwd: scratch, socketPath,
    bootstrapModulePath: "/dev/null", skipAvailabilitySetup: true, startupTimeoutMs: 1_000, callTimeoutMs: 5_000,
    onExternalPromptAccepted: async ({ prompt, resultPath, runId, turnId }) => {
      acceptedPrompts.push(prompt);
      await writeFile(resultPath, JSON.stringify({ schemaVersion: 1, runId, turnId, status: "completed", output: "# Agy fixture result" }));
    },
    ...options,
  });
  const input = executorInput(agentId, reviewer, {
    nestedCli: "agy-cli",
    permissionModeSnapshot: { name: "build", mode: loadStockDefaults().modes.build },
    cliProbe: { cli: "agy-cli", executable: "agy", version: "agy fixture", help: "Usage of agy:", identity: "confirmed", completed: { version: true, help: true }, outputTruncated: false, yolo: { disposition: "yolo-unavailable", argv: [] } },
    item: { task: "Review only this fixture.\nKeep this exact text: 中文 > ?", agent: reviewer.selector, workspace: "auto", writeScope: { paths: [], resources: [] } },
  });
  return { backend, input, journal, acceptedPrompts };
}

describe("Agy startup visible-input gate (HSTART-AGY-20260907)", () => {
  it("waits through idle+ready shell/boot screens, then sends the original prompt exactly once", async () => {
    const server = new FakeHerdrServer();
    server.startupReads = [{ text: "$ agy\n" }, { text: "Starting CLI UI...\nLogin complete\n" }, { text: AGY_STARTUP_UI }];
    server.onStartupRead = () => {
      expect(server.externalPromptAttemptedCount).toBe(0);
      expect(server.panes[0]).toMatchObject({ agent_status: "idle", interactive_ready: true });
    };
    const { backend, input, acceptedPrompts } = await agyStartupFixture(server);
    try {
      await expect(backend.execute(input)).resolves.toMatchObject({ status: "completed", output: "# Agy fixture result" });
      expect(server.startupReadCount).toBe(3);
      expect(server.externalPromptAttemptedCount).toBe(1);
      expect(server.externalPromptAcceptedCount).toBe(1);
      expect(server.externalPromptBeforeReadyCount).toBe(0);
      const promptIndex = server.calls.findIndex((call) => call.method === "agent.prompt");
      const prompt = server.calls[promptIndex]!;
      expect(prompt.params.text).toBe(acceptedPrompts[0]);
      expect(String(prompt.params.text).split(input.item.task)).toHaveLength(2);
      expect(server.calls.slice(promptIndex - 3, promptIndex).map((call) => [call.method, call.params.target])).toEqual([
        ["agent.read", prompt.params.target], ["agent.get", "w1:p1"], ["agent.get", prompt.params.target],
      ]);
      for (const call of server.calls.filter((call) => call.method === "agent.read" && call.params.source === "visible")) {
        expect(call.params).toMatchObject({ target: prompt.params.target, source: "visible", lines: 200, format: "text", strip_ansi: true });
      }
    } finally { await server.stop(); }
  });

  it("also accepts the plain short footer without a right-side column", async () => {
    const server = new FakeHerdrServer();
    server.startupReads = [{ text: AGY_STARTUP_UI_SHORT_FOOTER }];
    const { backend, input } = await agyStartupFixture(server);
    try {
      await expect(backend.execute(input)).resolves.toMatchObject({ status: "completed" });
      expect(server.startupReadCount).toBe(1);
      expect(server.externalPromptAttemptedCount).toBe(1);
      expect(server.externalPromptAcceptedCount).toBe(1);
    } finally { await server.stop(); }
  });

  const absentScreens: Array<[string, StartupRead]> = [
    ["shell only", { text: "$ agy\n" }],
    ["boot only", { text: "Starting CLI UI...\nLogin complete\n" }],
    ["welcome without input", { text: "Antigravity CLI\n? for shortcuts\n" }],
    ["nonempty input", { text: "Antigravity CLI\n> old task\n? for shortcuts\n" }],
    ["missing footer", { text: "Antigravity CLI\n>\n" }],
    ["embedded footer substring", { text: "Antigravity CLI\n>\nLoading ? for shortcuts          Gemini 3.8 Flash · high\n" }],
    ["footer without token boundary", { text: "Antigravity CLI\n>\n? for shortcutsExtra\n" }],
    ["missing heading", { text: ">\n? for shortcuts\n" }],
    ["markers on one line", { text: "Antigravity CLI > ? for shortcuts" }],
    ["wrong visual order", { text: "? for shortcuts\n>\nAntigravity CLI\n" }],
    ["truncated UI", { text: AGY_STARTUP_UI, truncated: true }],
    ["missing truncation evidence", { text: AGY_STARTUP_UI, truncated: undefined }],
    ["missing text", { text: undefined }],
    ["oversized UI", { text: `${AGY_STARTUP_UI}${"x".repeat(64 * 1024)}` }],
    ["stale scrollback", { text: AGY_STARTUP_UI, source: "recent_unwrapped" }],
    ["missing read", "missing"],
    ["read failure", "error"],
    ["unanswered read", "hang"],
  ];
  it.each(absentScreens)("fails boundedly with zero prompts for %s", async (_label, read) => {
    const server = new FakeHerdrServer();
    server.startupReads = [read];
    const { backend, input, journal } = await agyStartupFixture(server, { startupTimeoutMs: 350 });
    const began = Date.now();
    try {
      await expect(backend.execute(input)).rejects.toThrow(/startup (?:deadline|timeout)|read_failed/);
      expect(Date.now() - began).toBeLessThan(2_000);
      expect(server.startupReadCount).toBeGreaterThan(0);
      expect(server.startupReadCount).toBeLessThanOrEqual(5);
      expect(server.externalPromptAttemptedCount).toBe(0);
      expect(server.externalPromptAcceptedCount).toBe(0);
      expect(journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "failed" });
      expect(server.panes).toEqual([]);
    } finally { await server.stop(); }
  });

  it.each(["pane", "name", "read"] as const)("rejects %s identity drift after an otherwise matching UI", async (drift) => {
    const server = new FakeHerdrServer();
    if (drift === "read") server.startupReads = [{ pane_id: "w9:p9" }];
    else server.onStartupRead = (pane) => { pane[drift === "pane" ? "pane_id" : "name"] = "drifted"; };
    const { backend, input } = await agyStartupFixture(server, { startupTimeoutMs: 350 });
    try {
      await expect(backend.execute(input)).rejects.toThrow(/identity changed|agent_not_found/);
      expect(server.externalPromptAttemptedCount).toBe(0);
      expect(server.externalPromptAcceptedCount).toBe(0);
    } finally { await server.stop(); }
  });

  it.each(["working", "interactive", "sequence"] as const)("discards UI across a post-read %s transition and reads it afresh", async (transition) => {
    const server = new FakeHerdrServer();
    server.onStartupRead = (pane, count) => {
      expect(server.externalPromptAttemptedCount).toBe(0);
      if (count !== 1) return;
      if (transition === "working") server.statusNotReadyTimes = 1;
      if (transition === "interactive") server.interactiveReadyFalseTimes = 1;
      if (transition === "sequence") pane.state_change_seq = Number(pane.state_change_seq) + 1;
    };
    const { backend, input } = await agyStartupFixture(server);
    try {
      await expect(backend.execute(input)).resolves.toMatchObject({ status: "completed" });
      expect(server.startupReadCount).toBe(2);
      expect(server.externalPromptAttemptedCount).toBe(1);
      expect(server.externalPromptAcceptedCount).toBe(1);
    } finally { await server.stop(); }
  });

  it.each(["working", "blocked", "unknown", "interactive"] as const)("never prompts when post-read %s remains non-ready", async (transition) => {
    const server = new FakeHerdrServer();
    server.onStartupRead = (pane) => {
      if (transition === "interactive") pane.interactive_ready = false;
      else pane.agent_status = transition;
    };
    const { backend, input } = await agyStartupFixture(server, { startupTimeoutMs: 350 });
    try {
      await expect(backend.execute(input)).rejects.toThrow(/startup timeout/);
      expect(server.externalPromptAttemptedCount).toBe(0);
      expect(server.externalPromptAcceptedCount).toBe(0);
    } finally { await server.stop(); }
  });

  it("rechecks visible UI on explicit preacceptance rejection, without changing or replaying accepted text", async () => {
    const server = new FakeHerdrServer();
    server.externalPromptRejectTimes = 1;
    server.onPromptRejected = () => { server.startupReads = [{ text: "Reinitializing UI..." }, { text: AGY_STARTUP_UI }]; };
    const { backend, input, acceptedPrompts } = await agyStartupFixture(server);
    try {
      await expect(backend.execute(input)).resolves.toMatchObject({ status: "completed" });
      expect(server.startupReadCount).toBe(3);
      expect(server.externalPromptAttemptedCount).toBe(2);
      expect(server.externalPromptAcceptedCount).toBe(1);
      expect(server.calls.filter((call) => call.method === "agent.prompt").map((call) => call.params.text)).toEqual([acceptedPrompts[0], acceptedPrompts[0]]);
    } finally { await server.stop(); }
  });

  it("uses the original startup budget rather than granting the visible UI a new timeout", async () => {
    const server = new FakeHerdrServer();
    server.agentStartBusyTimes = 1; // consumes the existing 300ms retry interval
    server.startupReads = [{ text: "Booting..." }];
    const { backend, input } = await agyStartupFixture(server, { startupTimeoutMs: 550 });
    try {
      await expect(backend.execute(input)).rejects.toThrow(/startup (?:deadline|timeout)/);
      expect(server.startupReadCount).toBeGreaterThan(0);
      expect(server.startupReadCount).toBeLessThanOrEqual(3);
      expect(server.externalPromptAttemptedCount).toBe(0);
    } finally { await server.stop(); }
  });

  it.each(["claude-code", "codex-cli", "opencode", "grok-cli"] as const)("does not add a pre-prompt UI read for %s", async (cli) => {
    const server = new FakeHerdrServer();
    server.startupReads = ["error"];
    const { backend, input } = await agyStartupFixture(server);
    input.nestedCli = cli;
    input.cliProbe = { ...input.cliProbe!, cli, executable: EXTERNAL_CLI_REGISTRY[cli].executables[0]! };
    try {
      await expect(backend.execute(input)).resolves.toMatchObject({ status: "completed" });
      expect(server.startupReadCount).toBe(0);
      const promptIndex = server.calls.findIndex((call) => call.method === "agent.prompt");
      expect(server.calls.slice(0, promptIndex).some((call) => call.method === "agent.read")).toBe(false);
      expect(server.externalPromptAcceptedCount).toBe(1);
    } finally { await server.stop(); }
  });

  it("does not send when cancelled during the UI read", async () => {
    const server = new FakeHerdrServer();
    const controller = new AbortController();
    server.onStartupRead = () => controller.abort(new Error("fixture cancelled"));
    const { backend, input } = await agyStartupFixture(server);
    input.context = { signal: controller.signal } as never;
    try {
      await expect(backend.execute(input)).rejects.toThrow();
      expect(server.externalPromptAttemptedCount).toBe(0);
      expect(server.externalPromptAcceptedCount).toBe(0);
    } finally { await server.stop(); }
  });

  it.each(["invalid", "empty", "empty-file", "partial"] as const)("preserves %s result semantics after one accepted Agy prompt", async (kind) => {
    const server = new FakeHerdrServer();
    const { backend, input } = await agyStartupFixture(server, {
      onExternalPromptAccepted: async ({ resultPath, runId, turnId }) => {
        if (kind === "empty-file") { await writeFile(resultPath, ""); return; }
        if (kind === "invalid") { await writeFile(resultPath, "not-json"); return; }
        await writeFile(resultPath, JSON.stringify({ schemaVersion: 1, runId, turnId, status: kind === "partial" ? "partial" : "completed", output: kind === "empty" ? "" : "# Partial Agy review" }));
      },
    });
    try {
      const began = Date.now();
      const output = await backend.execute(input);
      if (kind === "partial") expect(output).toMatchObject({ status: "completed", result: "partial", output: "# Partial Agy review" });
      else {
        expect(output).toMatchObject({ status: "failed", error: `external-output-${kind === "empty-file" ? "empty" : kind}` });
        expect(Date.now() - began).toBeGreaterThanOrEqual(1_500);
        expect(server.externalObservations.length).toBeGreaterThan(2);
        expect(server.panes).toEqual([]);
      }
      expect(server.externalPromptAttemptedCount).toBe(1);
      expect(server.externalPromptAcceptedCount).toBe(1);
      expect(server.startupReadCount).toBe(1);
    } finally { await server.stop(); }
  });
});

// Reuse the startup fixture, but leave the runtime's pending document alone.
// Real socket observations synchronize phases; real timers exercise the old
// 1.5s failure window without advancing timers ahead of filesystem/socket I/O.
async function pendingExternalFixture(server: FakeHerdrServer, initialText?: string) {
  let resultPath = "";
  const fixture = await agyStartupFixture(server, {
    onExternalPromptAccepted: async (event) => {
      resultPath = event.resultPath;
      if (initialText !== undefined) await writeFile(resultPath, initialText);
    },
  });
  const controller = new AbortController();
  fixture.input.context = { signal: controller.signal } as never;
  let settled = false;
  const execution = fixture.backend.execute(fixture.input);
  // Observe both outcomes immediately, including unexpected early failure.
  void execution.then(() => { settled = true; }, () => { settled = true; });
  return {
    ...fixture, controller, execution,
    get resultPath() { return resultPath; },
    isSettled: () => settled,
    stop: async () => {
      controller.abort(new Error("fixture cleanup"));
      await execution.catch(() => undefined);
      await server.stop();
    },
  };
}

describe("external asynchronous completion (HASYNC-AGY-20260907)", () => {
  it.each([
    ["pending", "completed"], ["pending", "partial"], ["missing", "completed"],
  ] as const)("retains idle + %s beyond the old grace, then returns delayed %s", async (kind, status) => {
    const server = new FakeHerdrServer();
    const fixture = await pendingExternalFixture(server);
    try {
      await expect.poll(() => server.externalObservations.at(-1)?.agent_status).toBe("idle");
      if (kind === "missing") await rm(fixture.resultPath);
      const observed = server.externalObservations.length;
      const began = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 1_750));
      expect(Date.now() - began).toBeGreaterThan(1_500);
      expect(fixture.isSettled()).toBe(false);
      expect(server.externalObservations.length).toBeGreaterThan(observed + 2);
      expect(server.panes).toHaveLength(1);
      expect(server.calls.some((call) => call.method === "pane.close" || call.method === "tab.close")).toBe(false);
      expect(fixture.backend.surfaceOverview()).toMatchObject([{ agentId: fixture.input.agentId, busy: true }]);
      expect(fixture.journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "live" });
      // No more working transitions: only the result changes while still idle.
      await writeFile(fixture.resultPath, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status, output: "# Delayed result" }));
      await expect(fixture.execution).resolves.toMatchObject({ status: "completed", result: status, output: "# Delayed result" });
      expect(server.externalPromptAcceptedCount).toBe(1);
      expect(server.externalPromptAttemptedCount).toBe(1);
      expect(server.panes).toEqual([]);
      expect(fixture.journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "stopped" });
    } finally { await fixture.stop(); }
  });

  it("keeps sampling after idle/pending and does not consume a valid result while working or non-ready", async () => {
    const server = new FakeHerdrServer();
    const fixture = await pendingExternalFixture(server);
    try {
      await expect.poll(() => server.externalObservations.at(-1)?.agent_status).toBe("idle");
      const pane = server.panes[0]!;
      pane.agent_status = "working";
      pane.state_change_seq = 4;
      await expect.poll(() => server.externalObservations.at(-1)?.agent_status).toBe("working");
      await writeFile(fixture.resultPath, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "completed", output: "# Resumed result" }));
      const observed = server.externalObservations.length;
      await expect.poll(() => server.externalObservations.length).toBeGreaterThan(observed + 1);
      expect(fixture.isSettled()).toBe(false);
      pane.agent_status = "idle";
      pane.interactive_ready = false;
      await expect.poll(() => server.externalObservations.at(-1)?.interactive_ready).toBe(false);
      expect(fixture.isSettled()).toBe(false);
      pane.interactive_ready = true;
      pane.state_change_seq = 1; // historical sequence cannot settle this turn
      await expect.poll(() => server.externalObservations.at(-1)?.state_change_seq).toBe(1);
      expect(fixture.isSettled()).toBe(false);
      expect(fixture.backend.surfaceOverview()).toMatchObject([{ busy: true }]);
      expect(server.calls.some((call) => call.method === "pane.close" || call.method === "tab.close")).toBe(false);
      pane.agent_status = "done";
      pane.state_change_seq = 5;
      const output = await fixture.execution;
      expect(output).toMatchObject({ status: "completed", output: "# Resumed result", evidence: { finalStateSequence: 5 } });
      expect((output.evidence as { lifecycle: string[] }).lifecycle).toEqual(expect.arrayContaining(["working", "idle", "done"]));
      expect(server.externalPromptAttemptedCount).toBe(1);
    } finally { await fixture.stop(); }
  });

  it.each(["empty-file", "half-json", "empty-output"] as const)("recovers a transient %s write while continuing lifecycle observations", async (kind) => {
    const server = new FakeHerdrServer();
    const initial = kind === "empty-file" ? "" : kind === "half-json" ? '{"schemaVersion":1,'
      : JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "completed", output: " " });
    const fixture = await pendingExternalFixture(server, initial);
    try {
      await expect.poll(() => server.externalObservations.length).toBeGreaterThanOrEqual(2);
      expect(fixture.isSettled()).toBe(false);
      // Exercise a truncate/half-JSON/final overwrite, not an atomic rename.
      await writeFile(fixture.resultPath, '{"schemaVersion":1,"runId":');
      const observed = server.externalObservations.length;
      await expect.poll(() => server.externalObservations.length).toBeGreaterThan(observed + 1);
      expect(fixture.isSettled()).toBe(false);
      await writeFile(fixture.resultPath, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "completed", output: "# Recovered write" }));
      await expect(fixture.execution).resolves.toMatchObject({ status: "completed", output: "# Recovered write" });
      expect(server.externalPromptAttemptedCount).toBe(1);
    } finally { await fixture.stop(); }
  });

  it.each(["working", "unknown", "interactive", "sequence"] as const)("invalidates the idle write grace when current %s readiness is lost", async (loss) => {
    const server = new FakeHerdrServer();
    const fixture = await pendingExternalFixture(server, '{"schemaVersion":');
    try {
      // Two fresh idle observations ensure the initial retry window opened.
      await expect.poll(() => server.externalObservations.length).toBeGreaterThanOrEqual(2);
      const pane = server.panes[0]!;
      if (loss === "interactive") pane.interactive_ready = false;
      else if (loss === "sequence") pane.state_change_seq = 1;
      else pane.agent_status = loss;
      const observed = server.externalObservations.length;
      await expect.poll(() => server.externalObservations.length).toBeGreaterThan(observed);
      await new Promise((resolve) => setTimeout(resolve, 1_750));
      expect(fixture.isSettled()).toBe(false);
      expect(fixture.journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "live" });
      expect(server.panes).toHaveLength(1);
      pane.agent_status = "idle";
      pane.interactive_ready = true;
      pane.state_change_seq = 5;
      const beforeReady = server.externalObservations.length;
      // The still-malformed file gets a NEW grace, not the expired old one.
      await expect.poll(() => server.externalObservations.length).toBeGreaterThan(beforeReady + 1);
      expect(fixture.isSettled()).toBe(false);
      await writeFile(fixture.resultPath, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "completed", output: "# Fresh idle result" }));
      await expect(fixture.execution).resolves.toMatchObject({ status: "completed", output: "# Fresh idle result" });
      expect(server.externalPromptAttemptedCount).toBe(1);
    } finally { await fixture.stop(); }
  });

  it.each([
    ["final identity", { runId: "stale-run" }, "external-output-invalid"],
    ["pending run identity", { status: "pending", runId: "stale-run" }, "external-output-invalid"],
    ["pending turn identity", { status: "pending", turnId: "stale-turn" }, "external-output-invalid"],
    ["pending schema", { status: "pending", schemaVersion: 2 }, "external-output-invalid"],
    ["final status", { status: "success" }, "external-output-invalid"],
    ["pending optional field", { status: "pending", verification: [false] }, "external-output-invalid"],
    ["blocked result", { status: "blocked", output: "" }, "external-output-blocked"],
  ] as const)("fails %s without retrying it as a write in progress", async (_label, fields, error) => {
    const server = new FakeHerdrServer();
    const fixture = await pendingExternalFixture(server, JSON.stringify({ schemaVersion: 1, runId: "run-1", turnId: "turn-1", status: "completed", output: "result", ...fields }));
    try {
      await expect(fixture.execution).resolves.toMatchObject({ status: "failed", error });
      expect(server.externalObservations).toHaveLength(1);
      expect(server.externalPromptAttemptedCount).toBe(1);
      expect(fixture.journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "failed" });
      expect(server.panes).toEqual([]);
    } finally { await fixture.stop(); }
  });

  it.each(["cancel", "loss", "blocked"] as const)("terminates explicitly on %s while awaiting a delayed pending result", async (terminal) => {
    const server = new FakeHerdrServer();
    const fixture = await pendingExternalFixture(server);
    try {
      await expect.poll(() => server.externalObservations.at(-1)?.agent_status).toBe("idle");
      await new Promise((resolve) => setTimeout(resolve, 1_750));
      expect(fixture.isSettled()).toBe(false);
      expect(fixture.journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "live" });
      if (terminal === "cancel") fixture.controller.abort(new Error("fixture cancelled pending result"));
      else if (terminal === "loss") server.panes = [];
      else server.panes[0]!.agent_status = "blocked";
      if (terminal === "blocked") await expect(fixture.execution).resolves.toMatchObject({ status: "failed", error: "blocked/need-user" });
      else await expect(fixture.execution).rejects.toThrow(terminal === "cancel" ? /fixture cancelled pending result/ : /pane was lost; prompt was not replayed/);
      expect(fixture.journal.getState().runs["run-1"]).toMatchObject({ lifecycle: terminal === "loss" ? "lost" : "failed" });
      expect(fixture.backend.surfaceOverview()).toEqual([]);
      expect(server.panes).toEqual([]);
      expect(server.externalPromptAttemptedCount).toBe(1);
      expect(server.externalPromptAcceptedCount).toBe(1);
    } finally { await fixture.stop(); }
  });

  it.each(["pane", "name"] as const)("rejects frozen %s identity drift during pending wait", async (identity) => {
    const server = new FakeHerdrServer();
    const fixture = await pendingExternalFixture(server);
    try {
      await expect.poll(() => server.externalObservations.at(-1)?.agent_status).toBe("idle");
      server.panes[0]![identity === "pane" ? "pane_id" : "name"] = "drifted";
      await expect(fixture.execution).rejects.toThrow(/identity changed|pane was lost/);
      expect(fixture.backend.surfaceOverview()).toEqual([]);
      expect(server.externalPromptAttemptedCount).toBe(1);
    } finally { await fixture.stop(); }
  });

  it.each(["idle", "unknown"] as const)("still bounds unobserved working when a valid result accompanies persistent %s", async (status) => {
    const server = new FakeHerdrServer();
    server.externalPromptMode = status;
    const { backend, input, journal } = await agyStartupFixture(server, { startupTimeoutMs: 350 });
    try {
      await expect(backend.execute(input)).rejects.toThrow(/did not enter working.*startup transition deadline/);
      expect(journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "failed" });
      expect(server.panes).toEqual([]);
      expect(server.externalPromptAttemptedCount).toBe(1);
    } finally { await server.stop(); }
  });
});

describe("herdr execution backend end-to-end (fake daemon + real child bridge)", () => {
  it("starts an authorized vendor kind directly, prompts it, and applies the post-working guard", async () => {
    const journal = await fixtureJournal("parent-direct-cli");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    server.nameLookupNotReadyTimes = 1;
    server.statusNotReadyTimes = 2;
    server.interactiveReadyFalseTimes = 2;
    server.externalPromptRejectTimes = 2;
    const socketPath = await server.start();
    const executable = join(scratch, "codex");
    await writeFile(executable, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'codex 1.0'; else printf '%s\\n' 'Options:' '  --model <MODEL>' '      Model to use' '  --reasoning-level=<LEVEL>' '      Reasoning effort. Possible values: low, high'; fi\n", { mode: 0o700 });
    const priorPath = process.env.PATH;
    process.env.PATH = `${scratch}:${priorPath ?? ""}`;
    await journal.append({ kind: "agent.created", agentId: "Direct", payload: { record: { id: "Direct", name: "Direct", selector: reviewer.selector, state: "queued", backend: "herdr", driver: "external-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "job.created", agentId: "Direct", jobId: "job-1", payload: { record: { id: "job-1", agentId: "Direct", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "turn.created", agentId: "Direct", jobId: "job-1", turnId: "turn-1", payload: { record: { id: "turn-1", agentId: "Direct", jobId: "job-1", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "agent.state", agentId: "Direct", payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
    await journal.append({ kind: "job.state", agentId: "Direct", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Direct", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });
    const backend = new HerdrExecutionBackend({
      journal, layout: journal.layout, parentId: "parent-direct-cli", cwd: scratch, socketPath,
      bootstrapModulePath: "/dev/null", skipAvailabilitySetup: true, startupTimeoutMs: 2_000,
      onExternalPromptAccepted: async ({ resultPath, runId, turnId, prompt }) => {
        expect(resultPath).toBe(join(bridgeSocketDirFor(join(journal.layout.root, "herdr-runs", runId)), "external-result.json"));
        expect(resultPath).not.toContain(join(journal.layout.root, "herdr-runs"));
        expect(/^[\x00-\x7F]+$/u.test(resultPath)).toBe(true);
        expect(prompt).toContain(resultPath);
        expect(prompt.indexOf("Review the fixture diff.")).toBeGreaterThanOrEqual(0);
        expect(prompt.indexOf("HIGH PRIORITY — mandatory external result return channel:")).toBeGreaterThan(prompt.indexOf("Review the fixture diff."));
        expect(prompt.trimEnd().endsWith("Replace the pending document already at that path; do not include credentials.")).toBe(true);
        expect(prompt).toContain("The file already exists: overwrite it");
        expect(prompt).toContain("Wait for any background tools needed by this task to finish");
        await writeFile(resultPath, JSON.stringify({ schemaVersion: 1, runId, turnId, status: "completed", output: "# Structured review result", changedFiles: [], verification: ["fixture"] }));
      },
    });
    try {
      const output = await backend.execute(executorInput("Direct", reviewer, {
        nestedCli: "codex-cli",
        item: { task: "Review the fixture diff.", agent: reviewer.selector, model: "vendor-model-high", thinking: "high", workspace: "auto", writeScope: { paths: [], resources: [] } },
      }));
      expect(output).toMatchObject({ backend: "herdr", driver: "external-cli", runId: "run-1", output: "# Structured review result", evidence: { vendorModel: "vendor-model-high", vendorThinking: "high", executionBoundary: "trusted-local-vendor", executableBinding: "Unverified", diagnosticExcerpt: "vendor completed output", prePromptStateSequence: 1, finalStateSequence: 3 } });
      const start = server.calls.find((call) => call.method === "agent.start");
      expect(start?.params.kind).toBe("codex");
      expect(start?.params.args).toEqual(["--model", "vendor-model-high", "--reasoning-level=high"]);
      const liveName = start?.params.name;
      const promptCall = server.calls.find((call) => call.method === "agent.prompt");
      expect(promptCall?.params.target).toBe(liveName);
      expect(typeof promptCall?.params.text).toBe("string");
      const promptIndex = server.calls.findIndex((call) => call.method === "agent.prompt");
      const readinessGets = server.calls.slice(0, promptIndex).filter((call) => call.method === "agent.get");
      expect(readinessGets.some((call) => call.params.target === start?.params.pane_id)).toBe(true);
      expect(readinessGets.some((call) => call.params.target === liveName)).toBe(true);
      expect(promptIndex).toBeGreaterThan(server.calls.map((call) => call.method).lastIndexOf("agent.get", promptIndex - 1));
      expect(server.externalPromptBeforeReadyCount).toBe(0);
      expect(server.externalPromptAttemptedCount).toBe(3);
      expect(server.externalPromptAcceptedCount).toBe(1);
      expect(server.calls.slice(0, promptIndex).some((call) => call.method === "agent.read")).toBe(false);
      expect(server.startupReadCount).toBe(0);
      expect(server.calls.find((call) => call.method === "agent.read")?.params.target).toBe(liveName);
      expect(server.calls.filter((call) => call.method === "agent.start" && call.params.kind === "pi")).toHaveLength(0);
      expect(journal.getState().runs["run-1"]).toMatchObject({ driver: "external-cli", lifecycle: "stopped", stopReason: "structured-external-result" });
    } finally {
      process.env.PATH = priorPath;
      await server.stop();
    }
  });

  it("denies a blocked external CUI confirmation without opening a user dialog", async () => {
    const journal = await fixtureJournal("parent-direct-cli-blocked");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    server.externalPromptMode = "blocked";
    const socketPath = await server.start();
    const executable = join(scratch, "codex");
    await writeFile(executable, "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'codex 1.0'; else printf '%s\\n' 'Options:' '  --model <MODEL>' '      Model to use' '  --reasoning-level=<LEVEL>' '      Reasoning effort. Possible values: low, high'; fi\n", { mode: 0o700 });
    const priorPath = process.env.PATH;
    process.env.PATH = `${scratch}:${priorPath ?? ""}`;
    await journal.append({ kind: "agent.created", agentId: "Blocked", payload: { record: { id: "Blocked", name: "Blocked", selector: reviewer.selector, state: "queued", backend: "herdr", driver: "external-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "job.created", agentId: "Blocked", jobId: "job-1", payload: { record: { id: "job-1", agentId: "Blocked", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "turn.created", agentId: "Blocked", jobId: "job-1", turnId: "turn-1", payload: { record: { id: "turn-1", agentId: "Blocked", jobId: "job-1", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "agent.state", agentId: "Blocked", payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
    await journal.append({ kind: "job.state", agentId: "Blocked", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Blocked", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });
    const interactions: string[] = [];
    const backend = new HerdrExecutionBackend({
      journal, layout: journal.layout, parentId: "parent-direct-cli-blocked", cwd: scratch, socketPath,
      bootstrapModulePath: "/dev/null", skipAvailabilitySetup: true, startupTimeoutMs: 2_000,
      requestInteraction: async (request) => { interactions.push(request.kind); return "deny"; },
    });
    try {
      const output = await backend.execute(executorInput("Blocked", reviewer, {
        nestedCli: "codex-cli",
        item: { task: "Review the fixture diff.", agent: reviewer.selector, model: "vendor-model-high", thinking: "high", workspace: "auto", writeScope: { paths: [], resources: [] } },
      }));
      expect(output).toMatchObject({ status: "failed", driver: "external-cli", error: "blocked/need-user", evidence: { vendorModel: "vendor-model-high", vendorThinking: "high" } });
      expect(interactions).toEqual(["external-cui-confirmation"]);
      expect(journal.getState().runs["run-1"]).toMatchObject({ lifecycle: "failed" });
    } finally {
      process.env.PATH = priorPath;
      await server.stop();
    }
  });

  it("creates the surface, starts the agent, settles the turn on bridge evidence, and records the run", async () => {
    const journal = await fixtureJournal();
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;

    const server = new FakeHerdrServer();
    const socketPath = await server.start();

    // The child bridge is the REAL implementation; every Run starts a fresh
    // child process while the durable Pi session identity is reused.
    let startedChildren = 0;
    server.onAgentStart = () => {
      const childRunId = `run-${++startedChildren}`;
      void (async () => {
        const runDir = join(journal.layout.root, "herdr-runs", childRunId);
        const tokenFile = join(runDir, "bridge-token");
        const token = (await readFile(tokenFile, "utf8")).trim();
        const bridge = createChildBridge({ dir: runDir, sockDir: bridgeSocketDirFor(runDir), runId: childRunId, agentId: "Worker", token });
        await bridge.start();
        bridge.bindSubmission((task) => {
          void (async () => {
            const pending = bridge.state().pendingTurn!;
            bridge.emit("turn.started", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId });
            const answer = await bridge.requestInteraction("question", { question: "Continue?", options: ["A", "B"] }, 5_000);
            bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: `structured result for: ${task.slice(0, 24)} answer=${String(answer)}`, model: "fixture/model-x", usage: { input: 10, output: 5, totalTokens: 15, costTotal: 0.01 } });
            bridge.settleTurn();
          })();
        });
      })();
    };

    await journal.append({
      kind: "agent.created",
      agentId: "Worker",
      payload: {
        record: { id: "Worker", name: "Worker", selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
      },
    });
    await journal.append({
      kind: "job.created",
      agentId: "Worker",
      jobId: "job-1",
      payload: { record: { id: "job-1", agentId: "Worker", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } },
    });
    await journal.append({
      kind: "turn.created",
      agentId: "Worker",
      jobId: "job-1",
      turnId: "turn-1",
      payload: { record: { id: "turn-1", agentId: "Worker", jobId: "job-1", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } },
    });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
    await journal.append({ kind: "job.state", agentId: "Worker", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });

    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-herdr",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
      requestInteraction: async (request) => request.kind === "question" ? "A" : "deny",
    });
    const output = await backend.execute(executorInput("Worker", reviewer));
    expect(output.backend).toBe("herdr");
    expect(output.driver).toBe("pi-cli");
    expect(output.runId).toBe("run-1");
    expect(output.output).toMatch(/^structured result for:.*answer=A/);
    expect(output.model?.model).toBe("model-x");

    const state = journal.getState();
    expect(state.runs["run-1"]!.lifecycle).toBe("stopped");
    expect(state.runs["run-1"]!.backend).toBe("herdr");
    expect(state.runs["run-1"]!.stopReason).toBe("completed");

    const methods = server.calls.map((call) => call.method);
    // Two-step startup ordering: surface exists before agent.start, metadata
    // attached, and Herdr is never used to settle anything.
    expect(methods.indexOf("tab.create")).toBeLessThan(methods.indexOf("agent.start"));
    expect(methods).toContain("pane.report_metadata");
    expect(methods).toContain("workspace.report_metadata");
    expect(methods).not.toContain("agent.read");
    const start = server.calls.find((call) => call.method === "agent.start");
    expect(start?.params.name).toMatch(/^ap-[0-9a-f]{6}-1$/);
    expect((start?.params.args as string[]).join(" ")).toContain("--no-extensions");
    const audit = state.turns["turn-1"]!.metadata;
    expect(JSON.stringify(audit)).toContain("herdr");

    // Continuation (task_id): a second turn starts a fresh child and records run-2.
    // (The coordinator's finishCompleted equivalent, done manually here.)
    await journal.append({ kind: "turn.state", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { from: "running", to: "completed", outcome: "completed" } });
    await journal.append({ kind: "job.state", agentId: "Worker", jobId: "job-1", payload: { from: "running", to: "completed", result: "completed" } });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "running", to: "idle", currentJobId: null, currentTurnId: null } });
    await journal.append({
      kind: "job.created",
      agentId: "Worker",
      jobId: "job-2",
      payload: { record: { id: "job-2", agentId: "Worker", state: "queued", createdAt: "2026-08-26T00:01:00.000Z", updatedAt: "2026-08-26T00:01:00.000Z" } },
    });
    await journal.append({
      kind: "turn.created",
      agentId: "Worker",
      jobId: "job-2",
      turnId: "turn-2",
      payload: { record: { id: "turn-2", agentId: "Worker", jobId: "job-2", state: "queued", createdAt: "2026-08-26T00:01:00.000Z", updatedAt: "2026-08-26T00:01:00.000Z" } },
    });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "idle", to: "running", currentJobId: "job-2", currentTurnId: "turn-2" } });
    await journal.append({ kind: "job.state", agentId: "Worker", jobId: "job-2", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Worker", jobId: "job-2", turnId: "turn-2", payload: { from: "queued", to: "running" } });
    const second = await backend.execute(executorInput("Worker", reviewer, { jobId: "job-2", turnId: "turn-2" }));
    expect(second.runId).toBe("run-2");
    expect(second.output).toMatch(/^structured result for:/);
    expect(journal.getState().runs["run-2"]!.lifecycle).toBe("stopped");
    expect(server.calls.filter((call) => call.method === "agent.start")).toHaveLength(2);
    expect(server.calls.filter((call) => call.method === "tab.create")).toHaveLength(2);
    expect(server.calls.filter((call) => call.method === "tab.close")).toHaveLength(2);
    await server.stop();
  });

  it("spawns into the parent's own herdr workspace as a focused tab when pi runs inside herdr", async () => {
    const journal = await fixtureJournal("parent-in-herdr");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    server.workspaces = [{ workspace_id: "w-user", number: 1, label: "user", focused: true, pane_count: 1, tab_count: 1, active_tab_id: "w-user:t1", agent_status: "idle" }];
    server.agentStartBusyTimes = 2;
    const socketPath = await server.start();
    server.onAgentStart = () => {
      void (async () => {
        const runDir = join(journal.layout.root, "herdr-runs", "run-1");
        const tokenFile = join(runDir, "bridge-token");
        const token = (await readFile(tokenFile, "utf8")).trim();
        const bridge = createChildBridge({ dir: runDir, sockDir: bridgeSocketDirFor(runDir), runId: "run-1", agentId: "Worker", token });
        await bridge.start();
        bridge.bindSubmission((task) => {
          const pending = bridge.state().pendingTurn!;
          bridge.emit("turn.started", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId });
          bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: "visible-tab result", model: "fixture/model-x", usage: { input: 1, output: 1, totalTokens: 2, costTotal: 0 } });
          bridge.settleTurn();
        });
      })();
    };
    await journal.append({
      kind: "agent.created",
      agentId: "Worker",
      payload: {
        record: { id: "Worker", name: "Worker", selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
      },
    });
    await journal.append({ kind: "job.created", agentId: "Worker", jobId: "job-1", payload: { record: { id: "job-1", agentId: "Worker", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({
      kind: "turn.created",
      agentId: "Worker",
      jobId: "job-1",
      turnId: "turn-1",
      payload: { record: { id: "turn-1", agentId: "Worker", jobId: "job-1", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } },
    });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
    await journal.append({ kind: "job.state", agentId: "Worker", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });

    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-in-herdr",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
    });
    process.env.HERDR_ENV = "1";
    process.env.HERDR_WORKSPACE_ID = "w-user";
    try {
      const output = await backend.execute(executorInput("Worker", reviewer));
      expect(output.output).toBe("visible-tab result");
      // The user's own workspace is reused — no background aili- workspace.
      expect(server.calls.find((call) => call.method === "workspace.create")).toBeUndefined();
      const tab = server.calls.find((call) => call.method === "tab.create");
      expect(tab?.params.workspace_id).toBe("w-user");
      expect(tab?.params.focus).toBe(true);
      // The fresh pane's shell race (agent_pane_busy) is retried, not fatal.
      expect(server.calls.filter((call) => call.method === "agent.start")).toHaveLength(3);
    } finally {
      delete process.env.HERDR_ENV;
      delete process.env.HERDR_WORKSPACE_ID;
      await server.stop();
    }
  });

  it("reuses an idle AILI-owned pane instead of opening another tab", async () => {
    const journal = await fixtureJournal("parent-reuse");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    server.workspaces = [{ workspace_id: "w-user", number: 1, label: "user", focused: true, pane_count: 1, tab_count: 2, active_tab_id: "w-user:t1", agent_status: "idle" }];
    // A previous AILI child exited; its pane is back to a shell, tagged ours.
    server.panes = [{ pane_id: "w-user:p9", workspace_id: "w-user", tab_id: "w-user:t9", terminal_id: "term_x", focused: false, agent: null, agent_status: "unknown", revision: 3, tokens: { aili_schema: "1" } }];
    const socketPath = await server.start();
    server.onAgentStart = () => {
      void (async () => {
        const runDir = join(journal.layout.root, "herdr-runs", "run-1");
        const tokenFile = join(runDir, "bridge-token");
        const token = (await readFile(tokenFile, "utf8")).trim();
        const bridge = createChildBridge({ dir: runDir, sockDir: bridgeSocketDirFor(runDir), runId: "run-1", agentId: "Worker", token });
        await bridge.start();
        bridge.bindSubmission((task) => {
          const pending = bridge.state().pendingTurn!;
          bridge.emit("turn.started", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId });
          bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: `reused-pane result: ${task.slice(0, 10)}`, model: "fixture/model-x", usage: { input: 1, output: 1, totalTokens: 2, costTotal: 0 } });
          bridge.settleTurn();
        });
      })();
    };
    await journal.append({
      kind: "agent.created",
      agentId: "Worker",
      payload: {
        record: { id: "Worker", name: "Worker", selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
      },
    });
    await journal.append({ kind: "job.created", agentId: "Worker", jobId: "job-1", payload: { record: { id: "job-1", agentId: "Worker", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "turn.created", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { record: { id: "turn-1", agentId: "Worker", jobId: "job-1", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
    await journal.append({ kind: "job.state", agentId: "Worker", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });

    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-reuse",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
    });
    process.env.HERDR_ENV = "1";
    process.env.HERDR_WORKSPACE_ID = "w-user";
    try {
      const output = await backend.execute(executorInput("Worker", reviewer));
      expect(output.output).toMatch(/^reused-pane result:/);
      expect(server.calls.find((call) => call.method === "tab.create")).toBeUndefined();
      const start = server.calls.find((call) => call.method === "agent.start");
      expect(start?.params.pane_id).toBe("w-user:p9");
      expect((start?.params.args as string[]).join(" ")).toContain("--aili-agent-id Worker");
    } finally {
      delete process.env.HERDR_ENV;
      delete process.env.HERDR_WORKSPACE_ID;
      await server.stop();
    }
  });

  it("falls back to a fresh tab when a reused pane is concurrently taken", async () => {
    const journal = await fixtureJournal("parent-contention");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    server.workspaces = [{ workspace_id: "w-user", number: 1, label: "user", focused: true, pane_count: 1, tab_count: 2, active_tab_id: "w-user:t1", agent_status: "idle" }];
    server.panes = [{ pane_id: "w-user:p9", workspace_id: "w-user", tab_id: "w-user:t9", terminal_id: "term_x", focused: false, agent: null, agent_status: "unknown", revision: 3, tokens: { aili_schema: "1" } }];
    server.agentStartRejectPane = { paneId: "w-user:p9", times: 1 };
    const socketPath = await server.start();
    server.onAgentStart = () => {
      void (async () => {
        const runDir = join(journal.layout.root, "herdr-runs", "run-1");
        const tokenFile = join(runDir, "bridge-token");
        const token = (await readFile(tokenFile, "utf8")).trim();
        const bridge = createChildBridge({ dir: runDir, sockDir: bridgeSocketDirFor(runDir), runId: "run-1", agentId: "Worker", token });
        await bridge.start();
        bridge.bindSubmission((task) => {
          const pending = bridge.state().pendingTurn!;
          bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: `fallback result: ${task.slice(0, 8)}`, model: "fixture/model-x", usage: { input: 1, output: 1, totalTokens: 2, costTotal: 0 } });
          bridge.settleTurn();
        });
      })();
    };
    await journal.append({
      kind: "agent.created",
      agentId: "Worker",
      payload: {
        record: { id: "Worker", name: "Worker", selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
      },
    });
    await journal.append({ kind: "job.created", agentId: "Worker", jobId: "job-1", payload: { record: { id: "job-1", agentId: "Worker", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "turn.created", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { record: { id: "turn-1", agentId: "Worker", jobId: "job-1", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
    await journal.append({ kind: "job.state", agentId: "Worker", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });

    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-contention",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
    });
    process.env.HERDR_ENV = "1";
    process.env.HERDR_WORKSPACE_ID = "w-user";
    try {
      const output = await backend.execute(executorInput("Worker", reviewer));
      expect(output.output).toMatch(/^fallback result:/);
      // The reused pane was rejected once (contention), so a fresh tab opened
      // and the second agent.start landed on the new pane.
      const starts = server.calls.filter((call) => call.method === "agent.start");
      expect(starts).toHaveLength(2);
      expect(starts[0]?.params.pane_id).toBe("w-user:p9");
      expect(starts[1]?.params.pane_id).toBe("w1:p1");
      expect(server.calls.filter((call) => call.method === "tab.create")).toHaveLength(1);
      expect(journal.getState().runs["run-1"]!.lifecycle).toBe("stopped");
    } finally {
      delete process.env.HERDR_ENV;
      delete process.env.HERDR_WORKSPACE_ID;
      await server.stop();
    }
  });

  it("runs two parallel children with distinct run ids, panes, and a healthy journal", async () => {
    const journal = await fixtureJournal("parent-parallel");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    const socketPath = await server.start();
    server.onAgentStart = (params) => {
      const identity = identityFromArgv((params.args as string[]) ?? []);
      if (!identity) return;
      void (async () => {
        const bridge = createChildBridge(identity);
        await bridge.start();
        bridge.bindSubmission((task) => {
          const pending = bridge.state().pendingTurn!;
          bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: `${identity.agentId} said: ${task.slice(0, 6)}`, model: "fixture/model-x", usage: { input: 1, output: 1, totalTokens: 2, costTotal: 0 } });
          bridge.settleTurn();
        });
      })();
    };
    for (const agentId of ["WorkerA", "WorkerB"]) {
      await journal.append({
        kind: "agent.created",
        agentId,
        payload: {
          record: { id: agentId, name: agentId, selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" },
        },
      });
      await journal.append({ kind: "job.created", agentId, jobId: `job-${agentId}`, payload: { record: { id: `job-${agentId}`, agentId, state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
      await journal.append({ kind: "turn.created", agentId, jobId: `job-${agentId}`, turnId: `turn-${agentId}`, payload: { record: { id: `turn-${agentId}`, agentId, jobId: `job-${agentId}`, state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
      await journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "running", currentJobId: `job-${agentId}`, currentTurnId: `turn-${agentId}` } });
      await journal.append({ kind: "job.state", agentId, jobId: `job-${agentId}`, payload: { from: "queued", to: "running" } });
      await journal.append({ kind: "turn.state", agentId, jobId: `job-${agentId}`, turnId: `turn-${agentId}`, payload: { from: "queued", to: "running" } });
    }

    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-parallel",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
    });
    const outputs = await Promise.all([
      backend.execute(executorInput("WorkerA", reviewer, { jobId: "job-WorkerA", turnId: "turn-WorkerA" })),
      backend.execute(executorInput("WorkerB", reviewer, {
        jobId: "job-WorkerB",
        turnId: "turn-WorkerB",
        item: {
          task: "Review the fixture diff.",
          agent: reviewer.selector,
          workspace: "auto" as const,
          writeScope: { paths: [], resources: [] },
          splitHint: "down" as const,
        },
      })),
    ]);
    expect(outputs[0]!.output).toMatch(/^WorkerA said:/);
    expect(outputs[1]!.output).toMatch(/^WorkerB said:/);
    const state = journal.getState();
    expect(state.runs["run-1"]!.lifecycle).toBe("stopped");
    expect(state.runs["run-2"]!.lifecycle).toBe("stopped");
    expect(new Set([state.runs["run-1"]!.agentId, state.runs["run-2"]!.agentId])).toEqual(new Set(["WorkerA", "WorkerB"]));
    // One workspace, ONE tab; the parallel pair are split panes inside it.
    expect(server.calls.filter((call) => call.method === "workspace.create")).toHaveLength(1);
    expect(server.calls.filter((call) => call.method === "tab.create")).toHaveLength(1);
    expect(server.calls.filter((call) => call.method === "pane.split")).toHaveLength(1);
    const split = server.calls.find((call) => call.method === "pane.split");
    expect(split?.params.direction).toBe("down");
    const starts = server.calls.filter((call) => call.method === "agent.start").map((call) => call.params.pane_id);
    expect(new Set(starts).size).toBe(2);
    expect(server.calls.filter((call) => call.method === "pane.close")).toHaveLength(1);
    expect(server.calls.filter((call) => call.method === "tab.close")).toHaveLength(1);
    // The journal writer chain is healthy after parallel allocation.
    await journal.append({ kind: "turn.audit", agentId: "WorkerA", jobId: "job-WorkerA", turnId: "turn-WorkerA", payload: { postParallel: true } });
    expect(journal.getState().turns["turn-WorkerA"]!.metadata?.postParallel).toBe(true);
    await server.stop();
  });

  it("closes an idle child tab and restores the next Agent on demand", async () => {
    const journal = await fixtureJournal("parent-recycle");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    const socketPath = await server.start();
    server.onAgentStart = (params) => {
      const identity = identityFromArgv((params.args as string[]) ?? []);
      if (!identity) return;
      void (async () => {
        const bridge = createChildBridge(identity);
        await bridge.start();
        bridge.bindSubmission((task) => {
          const pending = bridge.state().pendingTurn!;
          bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: `${identity.agentId} said: ${task.slice(0, 6)}`, model: "fixture/model-x", usage: { input: 1, output: 1, totalTokens: 2, costTotal: 0 } });
          bridge.settleTurn();
        });
      })();
    };
    const seedRunning = async (agentId: string, jobId: string, turnId: string) => {
      await journal.append({
        kind: "agent.created",
        agentId,
        payload: { record: { id: agentId, name: agentId, selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } },
      });
      await journal.append({ kind: "job.created", agentId, jobId, payload: { record: { id: jobId, agentId, state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
      await journal.append({ kind: "turn.created", agentId, jobId, turnId, payload: { record: { id: turnId, agentId, jobId, state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
      await journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "running", currentJobId: jobId, currentTurnId: turnId } });
      await journal.append({ kind: "job.state", agentId, jobId, payload: { from: "queued", to: "running" } });
      await journal.append({ kind: "turn.state", agentId, jobId, turnId, payload: { from: "queued", to: "running" } });
    };
    await seedRunning("Old", "job-1", "turn-1");
    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-recycle",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
    });
    const first = await backend.execute(executorInput("Old", reviewer));
    expect(first.output).toMatch(/^Old said:/);
    expect(server.calls.filter((call) => call.method === "tab.create")).toHaveLength(1);

    // The next sequential Agent starts a new tab/process while durable session state remains continuable.
    await seedRunning("New", "job-2", "turn-2");
    const second = await backend.execute(executorInput("New", reviewer, { jobId: "job-2", turnId: "turn-2" }));
    expect(second.output).toMatch(/^New said:/);
    expect(server.calls.filter((call) => call.method === "tab.create")).toHaveLength(2);
    expect(server.calls.filter((call) => call.method === "tab.close")).toHaveLength(2);
    const starts = server.calls.filter((call) => call.method === "agent.start");
    expect(starts).toHaveLength(2);
    expect(new Set(starts.map((start) => start.params.pane_id)).size).toBe(2);
    const state = journal.getState();
    expect(state.runs["run-1"]!.lifecycle).toBe("stopped");
    expect(state.runs["run-2"]!.lifecycle).toBe("stopped");
    await server.stop();
  });

  it("caps live surfaces: a saturated backend serializes onto a recycled pane instead of splitting", async () => {
    const journal = await fixtureJournal("parent-cap");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const server = new FakeHerdrServer();
    const socketPath = await server.start();
    let release: (() => void) | undefined;
    server.onAgentStart = (params) => {
      const identity = identityFromArgv((params.args as string[]) ?? []);
      if (!identity) return;
      void (async () => {
        const bridge = createChildBridge(identity);
        await bridge.start();
        bridge.bindSubmission((task) => {
          const pending = bridge.state().pendingTurn!;
          // Hold the FIRST child's turn until the test releases it, proving
          // the second submission waits instead of opening a second pane.
          const fire = () => {
            bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: `${identity.agentId} done`, model: "fixture/model-x", usage: { input: 1, output: 1, totalTokens: 2, costTotal: 0 } });
            bridge.settleTurn();
          };
          if (identity.agentId === "Held") { release = fire; } else { fire(); }
          void task;
        });
      })();
    };
    const seedRunning = async (agentId: string) => {
      await journal.append({
        kind: "agent.created",
        agentId,
        payload: { record: { id: agentId, name: agentId, selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } },
      });
      await journal.append({ kind: "job.created", agentId, jobId: `job-${agentId}`, payload: { record: { id: `job-${agentId}`, agentId, state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
      await journal.append({ kind: "turn.created", agentId, jobId: `job-${agentId}`, turnId: `turn-${agentId}`, payload: { record: { id: `turn-${agentId}`, agentId, jobId: `job-${agentId}`, state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
      await journal.append({ kind: "agent.state", agentId, payload: { from: "queued", to: "running", currentJobId: `job-${agentId}`, currentTurnId: `turn-${agentId}` } });
      await journal.append({ kind: "job.state", agentId, jobId: `job-${agentId}`, payload: { from: "queued", to: "running" } });
      await journal.append({ kind: "turn.state", agentId, jobId: `job-${agentId}`, turnId: `turn-${agentId}`, payload: { from: "queued", to: "running" } });
    };
    await seedRunning("Held");
    await seedRunning("Second");
    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-cap",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
      maxLiveSurfaces: 1,
    });
    const first = backend.execute(executorInput("Held", reviewer, { jobId: "job-Held", turnId: "turn-Held" }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.calls.filter((call) => call.method === "tab.create")).toHaveLength(1);
    // Saturated: the second submission must NOT split another pane while the
    // first turn is being held.
    const second = backend.execute(executorInput("Second", reviewer, { jobId: "job-Second", turnId: "turn-Second" }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(server.calls.filter((call) => call.method === "pane.split")).toHaveLength(0);
    release?.();
    const outputs = await Promise.all([first, second]);
    expect(outputs.map((output) => output.output).sort()).toEqual(["Held done", "Second done"]);
    // After the first settled its tab closed; the queued child starts a fresh tab without splitting a stale pane.
    expect(server.calls.filter((call) => call.method === "tab.create")).toHaveLength(2);
    expect(server.calls.filter((call) => call.method === "pane.split")).toHaveLength(0);
    await server.stop();
  });

  it("refuses continuation when the role profile drifted since creation (strict resume)", async () => {
    const journal = await fixtureJournal("parent-drift");
    const profiles = await loadRoleProfiles();
    const reviewer = profiles.find((role) => role.selector === "aili.code-reviewer")!;
    const scout = profiles.find((role) => role.selector === "aili.code-scout")!;
    const server = new FakeHerdrServer();
    const socketPath = await server.start();
    server.onAgentStart = () => {
      void (async () => {
        const runDir = join(journal.layout.root, "herdr-runs", "run-1");
        const tokenFile = join(runDir, "bridge-token");
        const token = (await readFile(tokenFile, "utf8")).trim();
        const bridge = createChildBridge({ dir: runDir, sockDir: bridgeSocketDirFor(runDir), runId: "run-1", agentId: "Worker", token });
        await bridge.start();
        bridge.bindSubmission(() => {
          const pending = bridge.state().pendingTurn!;
          bridge.emit("turn.completed", { runId: pending.runId, jobId: pending.jobId, turnId: pending.turnId, text: "first turn", model: "fixture/model-x", usage: { input: 1, output: 1, totalTokens: 2, costTotal: 0 } });
          bridge.settleTurn();
        });
      })();
    };
    await journal.append({
      kind: "agent.created",
      agentId: "Worker",
      payload: { record: { id: "Worker", name: "Worker", selector: reviewer.selector, state: "queued", backend: "herdr", driver: "pi-cli", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } },
    });
    await journal.append({ kind: "job.created", agentId: "Worker", jobId: "job-1", payload: { record: { id: "job-1", agentId: "Worker", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "turn.created", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { record: { id: "turn-1", agentId: "Worker", jobId: "job-1", state: "queued", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" } } });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "queued", to: "running", currentJobId: "job-1", currentTurnId: "turn-1" } });
    await journal.append({ kind: "job.state", agentId: "Worker", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Worker", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });
    const backend = new HerdrExecutionBackend({
      journal,
      layout: journal.layout,
      parentId: "parent-drift",
      cwd: scratch,
      socketPath,
      bootstrapModulePath: "/dev/null",
      skipAvailabilitySetup: true,
      startupTimeoutMs: 5_000,
    });
    const first = await backend.execute(executorInput("Worker", reviewer));
    expect(first.output).toBe("first turn");
    // Loadout was frozen at creation with the reviewer profile.
    const loadout = JSON.parse(await readFile(join(journal.layout.root, "herdr-sessions", "Worker", "loadout.json"), "utf8")) as { profileHash: string };
    expect(loadout.profileHash).toBe(reviewer.profileHash);
    // A different role profile (same agent identity) fails closed.
    await expect(backend.execute(executorInput("Worker", scout))).rejects.toThrow(/role selector changed since this Agent was created/);
    await server.stop();
  });
});
