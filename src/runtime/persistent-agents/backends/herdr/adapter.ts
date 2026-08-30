import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { loadModeConfig } from "pi-permission-modes/src/config-load.ts";
import type { TaskExecutionOutput, TaskExecutorInput } from "../../sub-coordinator.js";
import { createExternalCliLaunchPlan, probeExternalCli, projectExternalCliSettlement, type ExternalCliAgentStatus } from "../../external-cli.js";
import { reconcileUnfinishedCoordinator, type CoordinatorJournal } from "../../storage.js";
import type { SidecarLayout } from "../../types.js";
import { assembleChildPrompt } from "../../policy.js";
import { redactCredentialText } from "../../permission.js";
import { applyPromptPolicyPatch, assemblePromptModifiers, discoverPromptModifiers, resolvePromptModifiers } from "../../../prompt-middleware/index.js";
import type { RoleProfile } from "../../../roles.js";
import type { ExecutionBackend } from "../registry.js";
import { HERDR_BACKEND_CAPABILITIES } from "../types.js";
import type { RunRecord } from "../types.js";
import { HerdrSocketClient, defaultHerdrSocketPath } from "./client.js";
import { ensureHerdrAvailable, herdrIntegrationExtensionPath } from "./availability.js";
import { bridgeSocketDirFor, generateBridgeToken, herdrLiveName, herdrParentKey, herdrTabLabel, herdrWorkspaceLabel, runNumberFromRunId } from "./naming.js";
import { HERDR_METADATA_SOURCE, HerdrProtocolError, herdrIdentityTokens, type HerdrPaneSnapshot, type HerdrSnapshot } from "./protocol.js";

export interface HerdrExecutionBackendOptions {
  journal: CoordinatorJournal;
  layout: SidecarLayout;
  parentId: string;
  cwd: string;
  socketPath?: string;
  bootstrapModulePath: string;
  callTimeoutMs?: number;
  startupTimeoutMs?: number;
  /** Cap on simultaneously live child surfaces (spec: surface permit).
   *  Recycling an idle surface bypasses the cap — only NEW panes wait. */
  maxLiveSurfaces?: number;
  clock?: () => Date;
  /** Precise child-bridge activity adapter; never owns lifecycle state. */
  onActivity?: (event: ParentBridgeEvent & { agentId: string; runId: string }) => void;
  onAdoptedSettlement?: (settlement: { agentId: string; jobId: string; turnId: string; runId: string; status: "completed" | "failed"; output: string; error?: string; evidence?: unknown }) => Promise<void>;
  requestInteraction?: (request: { agentId: string; jobId: string; turnId: string; runId: string; interactionId: string; kind: string; payload: Record<string, unknown>; signal: AbortSignal }) => Promise<unknown>;
  /** Test seam: skip availability detection/install (fake server setups). */
  skipAvailabilitySetup?: boolean;
}

const HERDR_BUILTIN_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"] as const;

/** Phase-3 capability gate: static roles use the immutable loadout,
 * child permission broker, workspace checks and sandboxed bash. */
export function assertHerdrRoleSupported(role: RoleProfile, item: TaskExecutorInput["item"]): void {
  if (item.formalContext) {
    throw new Error("herdr backend does not accept formal task-board packages in this phase; submit them on the managed backend");
  }
  if (role.toolPolicy !== "static" || role.tools.some((tool) => !(HERDR_BUILTIN_TOOLS as readonly string[]).includes(tool))) {
    throw new Error(`herdr backend requires a static built-in tool loadout; '${role.selector}' is not eligible`);
  }
}

export function buildChildArgv(options: {
  bootstrapModulePath: string;
  /** Official Herdr pi integration extension — required for daemon-side
   *  agent recognition; part of the herdr backend's approved loadout. */
  integrationExtensionPath?: string;
  sessionDir: string;
  sessionId: string;
  tools: readonly string[];
  model?: string;
  thinking?: string;
  /** Bridge identity via ASCII argv flags so an idle AILI pane can be
   *  reused for a later agent (tab env cannot be re-injected). */
  identity?: { bridgeDir: string; sockDir: string; runId: string; agentId: string; tokenFile: string; loadoutHash: string };
}): string[] {
  // Herdr encodes agent args through the target pane's shell, so every argv
  // entry must stay shell-safe ASCII; non-ASCII content (e.g. the role system
  // prompt) travels via the bridge socket instead, never via argv.
  return [
    "--no-extensions",
    "-e", options.bootstrapModulePath,
    ...(options.integrationExtensionPath ? ["-e", options.integrationExtensionPath] : []),
    "--no-skills",
    "--no-context-files",
    "--no-prompt-templates",
    "--no-themes",
    "--offline",
    "--session-dir", options.sessionDir,
    "--session-id", options.sessionId,
    ...(options.tools.length === 0 ? ["--no-tools"] : ["--tools", options.tools.join(",")]),
    ...(options.model ? ["--model", options.model] : []),
    ...(options.thinking ? ["--thinking", options.thinking] : []),
    ...(options.identity ? [
      "--aili-bridge-dir", options.identity.bridgeDir,
      "--aili-bridge-sock-dir", options.identity.sockDir,
      "--aili-run-id", options.identity.runId,
      "--aili-agent-id", options.identity.agentId,
      "--aili-loadout-hash", options.identity.loadoutHash,
      "--aili-bridge-token-file", options.identity.tokenFile,
    ] : []),
  ];
}

export function herdrRunLoadout(input: TaskExecutorInput, runId: string, cwd: string) {
  const permissionConfig = loadModeConfig(cwd, getAgentDir(), () => undefined);
  const modeName = process.env.PI_PERMISSION_MODE && permissionConfig.modes[process.env.PI_PERMISSION_MODE] ? process.env.PI_PERMISSION_MODE : permissionConfig.defaultMode;
  const mode = permissionConfig.modes[modeName]!;
  const body = {
    schemaVersion: 2 as const,
    runId,
    agentId: input.agentId,
    selector: input.role.selector,
    profileHash: input.role.profileHash,
    sourceHash: input.role.sourceHash,
    tools: [...input.role.tools].sort(),
    snippets: [...(input.item.snippets ?? [])].sort(),
    model: input.modelChoice ? `${input.modelChoice.provider}/${input.modelChoice.model}` : null,
    thinking: input.modelChoice?.thinking ?? null,
    nestedCli: input.nestedCli ?? null,
    runner: input.nestedCli ? "herdr-external-cli/v1" : null,
    // Frozen capability evidence participates in the loadout hash without
    // persisting raw help as durable audit data.
    runnerModifierHash: input.cliProbe ? createHash("sha256").update(JSON.stringify({ cli: input.cliProbe.cli, executable: input.cliProbe.executable, version: input.cliProbe.version, help: input.cliProbe.help, yolo: input.cliProbe.yolo })).digest("hex") : null,
    cwd,
    permission: { modeName, mode },
  };
  const loadoutHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, loadoutHash };
}

interface ParentBridgeEvent {
  seq: number;
  event: string;
  data: Record<string, unknown>;
}

/** Parent-side client for one child bridge socket. */
class BridgeConnection {
  private socket?: Socket;
  private buffer = "";
  private nextId = 1;
  private readonly disconnectWaiters: Array<() => void> = [];
  private readonly pending = new Map<number, { resolve: (value: { ok: true; result: Record<string, unknown> } | { ok: false; error: string }) => void }>();
  private events: ParentBridgeEvent[] = [];
  private waiters: Array<{ predicate: (event: ParentBridgeEvent) => boolean; resolve: (event: ParentBridgeEvent) => void; reject: (error: Error) => void }> = [];

  constructor(
    private readonly socketPath: string,
    private readonly token: string,
    private readonly onEvent?: (event: ParentBridgeEvent) => void,
  ) {}

  async connect(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        await this.tryConnect(2_000);
        this.socket!.write(`${JSON.stringify({ cmd: "listen", params: { afterSeq: 0, token: this.token } })}\n`);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(`child bridge did not come up at ${this.socketPath} (${lastError instanceof Error ? lastError.message : String(lastError)})`);
  }

  private tryConnect(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.socketPath);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("bridge connect timeout"));
      }, timeoutMs);
      socket.once("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.once("connect", () => {
        clearTimeout(timer);
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => this.receive(chunk));
        socket.on("error", () => this.drop());
        socket.on("close", () => this.drop());
        this.socket = socket;
        resolve();
      });
    });
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length > 0) {
        try {
          this.handleFrame(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // Ignore malformed frames; the child owns the protocol.
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  private handleFrame(frame: Record<string, unknown>): void {
    if (typeof frame.event === "string" && typeof frame.seq === "number") {
      const event: ParentBridgeEvent = { seq: frame.seq, event: frame.event, data: (frame.data ?? {}) as Record<string, unknown> };
      this.events.push(event);
      this.onEvent?.(event);
      if (this.events.length > 1024) this.events.shift();
      for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
        const waiter = this.waiters[index]!;
        if (waiter.predicate(event)) {
          this.waiters.splice(index, 1);
          waiter.resolve(event);
        }
      }
      return;
    }
    const id = typeof frame.id === "number" ? frame.id : Number(frame.id ?? 0);
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    pending.resolve(frame.ok === true
      ? { ok: true, result: (frame.result ?? {}) as Record<string, unknown> }
      : { ok: false, error: typeof frame.error === "string" ? frame.error : "bridge command failed" });
  }

  command(cmd: string, params: Record<string, unknown> = {}): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; error: string }> {
    if (!this.socket) return Promise.resolve({ ok: false, error: "bridge connection is down" });
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.socket!.write(`${JSON.stringify({ id, cmd, params: { ...params, token: this.token } })}\n`);
      setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, error: `${cmd} timed out` });
      }, 30_000);
    });
  }

  waitFor(predicate: (event: ParentBridgeEvent) => boolean): Promise<ParentBridgeEvent> {
    const existing = this.events.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => this.waiters.push({ predicate, resolve, reject }));
  }

  isConnected(): boolean {
    return this.socket !== undefined;
  }

  waitForDisconnect(timeoutMs: number): Promise<void> {
    if (!this.socket || process.env.AILI_CHILD_NO_EXIT === "1") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("child bridge disconnect timeout")), timeoutMs);
      this.disconnectWaiters.push(() => { clearTimeout(timer); resolve(); });
    });
  }

  private drop(): void {
    this.socket = undefined;
    for (const [, pending] of this.pending) pending.resolve({ ok: false, error: "bridge connection lost" });
    this.pending.clear();
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error("bridge connection lost"));
    for (const resolve of this.disconnectWaiters.splice(0)) resolve();
  }
}

interface SurfaceRecord {
  agentId: string;
  workspaceId: string;
  tabId: string;
  paneId: string;
  bridgeDir: string;
  sockDir: string;
  token: string;
  loadoutHash: string;
  /** True when the pane was adopted from an earlier AILI child instead of
   *  freshly created; losing it to a concurrent starter is non-fatal. */
  reusedPane: boolean;
  /** True from pane selection until the run reaches live: a starting child
   *  must never be recycled as "idle" by a concurrent submission. */
  starting: boolean;
  /** True while this surface's agent has an in-flight (un)settled turn; only
   *  a settled-idle child may be recycled for another agent. */
  busy: boolean;
  pendingInteractions?: Set<string>;
  bridge?: BridgeConnection;
  external?: boolean;
}

/**
 * Herdr execution backend (Phase 2: read-only vertical slice). AILI keeps
 * every authority (allocation, journal, evidence); Herdr only provides the
 * persistent terminal surface and process; the child bridge is the sole
 * source of turn-completion evidence.
 */
export class HerdrExecutionBackend implements ExecutionBackend {
  readonly kind = "herdr" as const;
  readonly driver = "pi-cli" as const;
  readonly capabilities = HERDR_BACKEND_CAPABILITIES;
  // pi-cli via the child bridge: exact turn completion/resume and tool policy
  // are bridge-provided; sandbox/manual takeover arrive with Phase 3.
  readonly driverCapabilities = {
    structuredEvents: true,
    exactTurnCompletion: true,
    exactSessionResume: true,
    safeBoundarySteer: false,
    toolPolicy: true,
    permissionBroker: true,
    sandbox: true,
    formalResult: false,
    contextFork: false,
    manualTakeover: true,
  } as const;

  private client?: HerdrSocketClient;
  private workspaceId?: string;
  private workspaceEnsure?: Promise<string>;
  private readonly surfaces = new Map<string, SurfaceRecord>();
  /** Panes this process is currently starting/using — keeps concurrent
   *  submissions from adopting the same reusable pane. */
  private readonly claimedPanes = new Set<string>();
  private surfaceChain: Promise<void> = Promise.resolve();
  private readonly surfaceWaiters: Array<() => void> = [];
  private readonly maxLiveSurfaces: number;
  private setup?: Promise<void>;
  private availabilitySetup?: Promise<void>;
  private readonly socketPath: string;
  private readonly startupTimeoutMs: number;
  private readonly clock: () => Date;

  constructor(private readonly options: HerdrExecutionBackendOptions) {
    this.socketPath = options.socketPath ?? defaultHerdrSocketPath();
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
    this.maxLiveSurfaces = options.maxLiveSurfaces ?? 8;
    this.clock = options.clock ?? (() => new Date());
  }

  /** User-level focus: bring a live herdr child's pane to the foreground. */
  async focusAgent(agentId: string): Promise<{ focused: boolean; paneId?: string; message: string }> {
    const surface = this.surfaces.get(agentId);
    if (!surface) return { focused: false, message: `${agentId}: no live Herdr surface (recycled surfaces return after a turn)` };
    await this.ensureSetup(surface.external === true).catch(() => undefined);
    const client = this.client;
    if (!client) return { focused: false, message: `${agentId}: herdr daemon is not connected` };
    await client.call("pane.focus", { pane_id: surface.paneId });
    return { focused: true, paneId: surface.paneId, message: `${agentId}: focused pane ${surface.paneId}` };
  }

  /** Live surface overview for user listings (observability only). */
  surfaceOverview(): Array<{ agentId: string; paneId: string; tabId: string; busy: boolean; bridgeConnected: boolean }> {
    return [...this.surfaces.values()].map((surface) => ({
      agentId: surface.agentId,
      paneId: surface.paneId,
      tabId: surface.tabId,
      busy: surface.busy,
      bridgeConnected: surface.bridge?.isConnected() ?? false,
    }));
  }

  /** Connectivity probe for doctor/status surfaces. */
  async probe(): Promise<{ socketReachable: boolean; protocol?: number }> {
    return await probeHerdrDaemon(this.socketPath);
  }

  private async ensureSetup(directExternalCli = false): Promise<void> {
    // A direct CUI Agent only requires the already-running socket. It must not
    // install Pi integration/skills or write user-home state. Ordinary Pi
    // children retain the existing availability setup.
    if (!directExternalCli && !this.options.skipAvailabilitySetup) {
      this.availabilitySetup ??= ensureHerdrAvailable().then(() => undefined);
      await this.availabilitySetup;
    }
    this.setup ??= (async () => {
      this.client = new HerdrSocketClient({ socketPath: this.socketPath, callTimeoutMs: this.options.callTimeoutMs });
      await this.client.sync((event) => {
        if (event.event !== "pane.agent_status_changed" || event.data.agent_status !== "blocked") return;
        const paneId = typeof event.data.pane_id === "string" ? event.data.pane_id : "";
        const surface = [...this.surfaces.values()].find((candidate) => candidate.paneId === paneId);
        if (!surface || (surface.pendingInteractions?.size ?? 0) > 0) return;
        this.options.onActivity?.({ seq: 0, event: "run.observed", data: { unexpectedBlocked: true, paneId }, agentId: surface.agentId, runId: String(event.data.run_id ?? "unknown") });
      });
    })();
    await this.setup;
  }

  /** When the parent pi itself runs inside a Herdr-managed pane, children open
   *  as new tabs in the PARENT's workspace so the user sees them in their own
   *  window instead of a hidden background workspace. */
  private parentHerdrWorkspaceId(): string | undefined {
    return process.env.HERDR_ENV === "1" && process.env.HERDR_WORKSPACE_ID ? process.env.HERDR_WORKSPACE_ID : undefined;
  }

  private ensureWorkspace(): Promise<string> {
    // Memoized: parallel first-turns must not create duplicate workspaces.
    this.workspaceEnsure ??= this.doEnsureWorkspace();
    return this.workspaceEnsure;
  }

  private async doEnsureWorkspace(): Promise<string> {
    if (this.workspaceId) return this.workspaceId;
    const client = this.client!;
    const sync = await client.call<unknown>("session.snapshot", {});
    const snapshot = (sync as { snapshot?: HerdrSnapshot }).snapshot ?? (sync as unknown as HerdrSnapshot);
    const parentWorkspaceId = this.parentHerdrWorkspaceId();
    if (parentWorkspaceId) {
      const found = (snapshot.workspaces ?? []).some((workspace) => workspace.workspace_id === parentWorkspaceId);
      if (!found) {
        throw new Error(`parent Herdr workspace ${parentWorkspaceId} is not present in the daemon snapshot; refusing to spawn into an unseen workspace`);
      }
      this.workspaceId = parentWorkspaceId;
      return parentWorkspaceId;
    }
    const label = herdrWorkspaceLabel(this.options.parentId);
    const existing = (snapshot.workspaces ?? []).find((workspace) => {
      const tokens = workspace.tokens as Record<string, string> | undefined;
      return workspace.label === label && tokens?.aili_parent_session_id === herdrParentKey(this.options.parentId);
    });
    if (existing && typeof existing.workspace_id === "string") {
      this.workspaceId = existing.workspace_id;
      return this.workspaceId;
    }
    const created = await client.call<Record<string, unknown>>("workspace.create", { label, cwd: this.options.cwd, focus: false });
    const workspace = (created.workspace ?? {}) as Record<string, unknown>;
    const workspaceId = typeof workspace.workspace_id === "string" ? workspace.workspace_id : undefined;
    if (!workspaceId) throw new Error("herdr workspace.create did not return an authoritative workspace id");
    await client.call("workspace.report_metadata", {
      workspace_id: workspaceId,
      source: HERDR_METADATA_SOURCE,
      tokens: { aili_schema: "1", aili_parent_session_id: herdrParentKey(this.options.parentId), aili_backend: "herdr" },
    });
    this.workspaceId = workspaceId;
    return workspaceId;
  }

  private async startAgentWithRetry(client: HerdrSocketClient, params: Record<string, unknown>): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    for (;;) {
      try {
        await client.call("agent.start", params);
        return;
      } catch (error) {
        const busy = error instanceof HerdrProtocolError && error.herdrCode === "agent_pane_busy";
        if (!busy || Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  private async waitForNamedAgent(client: HerdrSocketClient, paneId: string, liveName: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + this.startupTimeoutMs;
    let lastError: unknown;
    for (;;) {
      try {
        const result = await client.call<Record<string, unknown>>("agent.get", { target: paneId });
        const agent = result.agent && typeof result.agent === "object" ? result.agent as Record<string, unknown> : undefined;
        if (agent?.pane_id === paneId && agent.name === liveName) return agent;
        lastError = new Error(`expected ${liveName} in ${paneId}, observed ${String(agent?.name ?? "unnamed")}`);
      } catch (error) {
        lastError = error;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Herdr did not retain active Agent ${liveName} in pane ${paneId}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** Pane selection must be serialized in-process: two concurrent first
   *  turns would otherwise both see an empty snapshot and each open a tab.
   *  After the first surface exists (claimed), later selections split or
   *  recycle inside the same tab. */
  private async ensureSurface(input: TaskExecutorInput, runId: string): Promise<SurfaceRecord> {
    // Strict-resume gate first: even a live connected bridge cannot bypass a
    // drifted role profile.
    await this.assertLoadoutUnchanged(input, runId);
    const run = this.surfaceChain.then(() => this.doEnsureSurface(input, runId));
    this.surfaceChain = run.then(() => undefined, () => undefined);
    return await run;
  }

  private async assertLoadoutUnchanged(input: TaskExecutorInput, runId: string): Promise<void> {
    const ceilingPath = join(this.options.layout.root, "herdr-sessions", input.agentId, "loadout.json");
    if (!existsSync(ceilingPath)) throw new Error(`${input.agentId}: immutable Agent loadout ceiling is missing`);
    const ceiling = JSON.parse(await readFile(ceilingPath, "utf8")) as { selector?: string; profileHash?: string; tools?: string[] };
    if (ceiling.selector !== input.role.selector) throw new Error(`${input.agentId}: role selector changed since this Agent was created`);
    const ceilingTools = new Set(ceiling.tools ?? []);
    const widened = input.role.tools.filter((tool) => !ceilingTools.has(tool));
    if (widened.length) throw new Error(`${input.agentId}: resumed role would widen tools: ${widened.join(", ")}`);
    if (ceiling.profileHash !== input.role.profileHash || input.role.tools.length !== ceilingTools.size) {
      const removedTools = [...ceilingTools].filter((tool) => !input.role.tools.includes(tool)).sort();
      const diffPath = join(this.options.layout.root, "herdr-runs", runId, "loadout-diff.json");
      await writeFile(diffPath, `${JSON.stringify({ schemaVersion: 1, priorProfileHash: ceiling.profileHash, currentProfileHash: input.role.profileHash, removedTools, widenedTools: [] }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    }
    const loadoutPath = join(this.options.layout.root, "herdr-runs", runId, "loadout.json");
    if (!existsSync(loadoutPath)) throw new Error(`${runId}: immutable Herdr loadout is missing`);
    const stored = JSON.parse(await readFile(loadoutPath, "utf8")) as { loadoutHash?: string };
    const expected = herdrRunLoadout(input, runId, this.options.cwd);
    if (stored.loadoutHash !== expected.loadoutHash) throw new Error(`${runId}: immutable Herdr loadout drifted`);
  }

  private async doEnsureSurface(input: TaskExecutorInput, runId: string): Promise<SurfaceRecord> {
    const existing = this.surfaces.get(input.agentId);
    if (existing && existing.bridge?.isConnected()) return existing;
    const client = this.client!;
    const workspaceId = await this.ensureWorkspace();
    const bridgeDir = join(this.options.layout.root, "herdr-runs", runId);
    await mkdir(bridgeDir, { recursive: true, mode: 0o700 });
    const sockDir = bridgeSocketDirFor(bridgeDir);
    await mkdir(sockDir, { recursive: true, mode: 0o700 });
    const sessionDir = join(this.options.layout.root, "herdr-sessions", input.agentId);
    await mkdir(sessionDir, { recursive: true, mode: 0o700 });
    const loadoutPath = join(bridgeDir, "loadout.json");
    const loadout = herdrRunLoadout(input, runId, this.options.cwd);
    if (!existsSync(loadoutPath)) await writeFile(loadoutPath, `${JSON.stringify(loadout, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const token = generateBridgeToken();
    const tokenPath = join(bridgeDir, "bridge-token");
    await writeFile(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await writeFile(join(bridgeDir, "parent-bridge-token"), `${token}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });

    // One visible surface per window: reuse an idle AILI-owned pane (our
    // metadata, no live agent in it) for the next agent instead of opening a
    // new tab every time. Identity rides argv flags, so a reused pane's
    // baked-in tab env does not matter.
    let tabId: string | undefined;
    let paneId: string | undefined;
    let reusedPane = false;
    const snapshotResult = await client.call<unknown>("session.snapshot", {});
    const snapshot = (snapshotResult as { snapshot?: HerdrSnapshot }).snapshot ?? (snapshotResult as unknown as HerdrSnapshot);
    // ONE AILI tab per workspace; parallel children are SPLIT PANES inside it
    // (left/right then down), sequential work recycles panes so the tab count
    // stays at one. Selection order per new surface:
    //   1) a free shell pane we own in this workspace,
    //   2) an idle AILI child we control (recycle: shut it down; its session
    //      file stays continuable for a later run),
    //   3) split a new pane inside the existing AILI tab (parallel demand),
    //   4) create the AILI tab.
    const ownPanes = (snapshot.panes ?? []).filter((pane) =>
      pane.tokens?.aili_schema
      && pane.workspace_id === workspaceId
      && typeof pane.pane_id === "string"
      && typeof pane.tab_id === "string");
    const borrowableOwner = (pane: { pane_id: string; agent?: string | null; agent_status?: string }): SurfaceRecord | undefined => {
      if (pane.agent == null) return undefined;
      if (!["idle", "done"].includes(String(pane.agent_status ?? ""))) return undefined;
      return [...this.surfaces.values()].find((surface) => surface.paneId === pane.pane_id && surface.bridge?.isConnected() && surface.starting !== true && surface.busy !== true);
    };
    const freePane = ownPanes.find((pane) => !this.claimedPanes.has(pane.pane_id) && (pane.agent == null || (["idle", "done"].includes(String(pane.agent_status ?? "")) && ![...this.surfaces.values()].some((surface) => surface.paneId === pane.pane_id))));
    const borrowPane = ownPanes.find((pane) => {
      const owner = borrowableOwner(pane);
      return owner !== undefined && owner.agentId !== input.agentId;
    });
    if (freePane) {
      tabId = freePane.tab_id;
      paneId = freePane.pane_id;
      reusedPane = true;
    } else if (borrowPane) {
      const owner = borrowableOwner(borrowPane)!;
      await owner.bridge!.command("shutdown").catch(() => undefined);
      this.dropSurface(owner.agentId);
      tabId = borrowPane.tab_id;
      paneId = borrowPane.pane_id;
      reusedPane = true;
    } else {
      // Creating a NEW pane (split, or the first tab) is subject to the
      // surface permit; a saturated backend waits for a slot, then re-scans
      // (a settled-idle surface may have become recyclable in the meantime).
      await this.waitForSurfaceSlot();
      const recheck = await client.call<unknown>("session.snapshot", {});
      const rePanes = ((recheck as { snapshot?: HerdrSnapshot }).snapshot ?? (recheck as unknown as HerdrSnapshot)).panes ?? [];
      const reOwnPanes = rePanes.filter((pane) => pane.tokens?.aili_schema && pane.workspace_id === workspaceId && typeof pane.pane_id === "string" && typeof pane.tab_id === "string");
      const reFree = rePanes.find((pane) => pane.tokens?.aili_schema && pane.workspace_id === workspaceId && !this.claimedPanes.has(pane.pane_id) && (pane.agent == null || (["idle", "done"].includes(String(pane.agent_status ?? "")) && ![...this.surfaces.values()].some((surface) => surface.paneId === pane.pane_id))));
      const reBorrowOwner = (pane: HerdrPaneSnapshot): SurfaceRecord | undefined => {
        if (pane.agent == null || !["idle", "done"].includes(String(pane.agent_status ?? ""))) return undefined;
        return [...this.surfaces.values()].find((surface) => surface.paneId === pane.pane_id && surface.bridge?.isConnected() && surface.starting !== true && surface.busy !== true);
      };
      const reBorrow = rePanes.find((pane) => {
        const owner = reBorrowOwner(pane);
        return owner !== undefined && pane.tokens?.aili_schema && pane.workspace_id === workspaceId && owner.agentId !== input.agentId;
      });
      if (reFree) {
        tabId = reFree.tab_id;
        paneId = reFree.pane_id;
        reusedPane = true;
      } else if (reBorrow) {
        const owner = reBorrowOwner(reBorrow)!;
        await owner.bridge!.command("shutdown").catch(() => undefined);
        this.dropSurface(owner.agentId);
        tabId = reBorrow.tab_id;
        paneId = reBorrow.pane_id;
        reusedPane = true;
      } else if (reOwnPanes.length > 0) {
      // Every owned pane is busy: parallel demand — split within the SAME tab.
      // The delegating model may hint the direction (sub split field);
      // default alternates right/down to keep panes usable (herdr skill rule
      // of thumb: wide→right, narrow/tall→down). Ratio and later layout
      // tweaks stay with the model/user via the herdr skill.
      const anchor = reOwnPanes.find((pane) => !this.claimedPanes.has(pane.pane_id)) ?? reOwnPanes[0]!;
      const direction = input.item.splitHint ?? (reOwnPanes.length % 2 === 1 ? "right" : "down");
      const split = await client.call<Record<string, unknown>>("pane.split", {
        target_pane_id: anchor.pane_id,
        direction,
        cwd: this.options.cwd,
        focus: this.parentHerdrWorkspaceId() !== undefined,
      });
      const pane = (split.pane ?? {}) as Record<string, unknown>;
      paneId = typeof pane.pane_id === "string" ? pane.pane_id : undefined;
      tabId = typeof pane.tab_id === "string" ? pane.tab_id : anchor.tab_id;
      if (!paneId) throw new Error("herdr pane.split did not return an authoritative pane id");
      } else {
        const opened = await this.openNewTab(client, input, workspaceId, bridgeDir, sockDir, runId, token);
        tabId = opened.tabId;
        paneId = opened.paneId;
      }
    }
    if (!tabId || !paneId) throw new Error("herdr surface pane/tab id is missing");
    this.claimedPanes.add(paneId);

    await this.attachIdentity(client, input, paneId, workspaceId, tabId, runId);

    const record: SurfaceRecord = { agentId: input.agentId, workspaceId, tabId, paneId, bridgeDir, sockDir, token, loadoutHash: loadout.loadoutHash, reusedPane, starting: true, busy: true, pendingInteractions: new Set() };
    this.surfaces.set(input.agentId, record);
    return record;
  }

  private async openNewTab(
    client: HerdrSocketClient,
    input: TaskExecutorInput,
    workspaceId: string,
    bridgeDir: string,
    sockDir: string,
    runId: string,
    token: string,
  ): Promise<{ tabId: string; paneId: string }> {
    // When spawning into the parent's own workspace, focus the new tab: the
    // user asked for observable children in their window, not hidden ones.
    // In a dedicated background workspace the surface stays unfocused.
    const inParentWorkspace = this.parentHerdrWorkspaceId() !== undefined;
    const tab = await client.call<Record<string, unknown>>("tab.create", {
      workspace_id: workspaceId,
      label: herdrTabLabel(input.agentId, input.item.name ?? input.role.name),
      cwd: this.options.cwd,
      focus: inParentWorkspace,
      env: {
        AILI_HERDR_CHILD: "1",
        AILI_BRIDGE_DIR: bridgeDir,
        AILI_BRIDGE_SOCK_DIR: sockDir,
        AILI_RUN_ID: runId,
        AILI_AGENT_ID: input.agentId,
        AILI_BRIDGE_TOKEN_FILE: join(bridgeDir, "bridge-token"),
        AILI_LOADOUT_HASH: herdrRunLoadout(input, runId, this.options.cwd).loadoutHash,
      },
    });
    const tabInfo = (tab.tab ?? {}) as Record<string, unknown>;
    const paneInfo = (tab.root_pane ?? {}) as Record<string, unknown>;
    const tabId = typeof tabInfo.tab_id === "string" ? tabInfo.tab_id : undefined;
    const paneId = typeof paneInfo.pane_id === "string" ? paneInfo.pane_id : undefined;
    if (!tabId || !paneId) throw new Error("herdr tab.create did not return authoritative tab/root pane ids");
    return { tabId, paneId };
  }

  private async attachIdentity(client: HerdrSocketClient, input: TaskExecutorInput, paneId: string, workspaceId: string, tabId: string, runId: string): Promise<void> {
    await client.call("pane.report_metadata", {
      pane_id: paneId,
      source: HERDR_METADATA_SOURCE,
      tokens: {
        ...herdrIdentityTokens({
          schema: 1,
          parent_session_id: herdrParentKey(this.options.parentId),
          agent_id: input.agentId,
          run_id: runId,
          backend: "herdr",
        }),
        aili_workspace: workspaceId,
        aili_tab: tabId,
      },
    });
  }

  private async shutdownSettledSurface(client: HerdrSocketClient, surface: SurfaceRecord): Promise<void> {
    const bridge = surface.bridge;
    if (bridge?.isConnected()) {
      const response = await bridge.command("shutdown").catch(() => ({ ok: false as const, error: "shutdown failed" }));
      if (response.ok) await bridge.waitForDisconnect(5_000).catch(async () => { await client.call("pane.close", { pane_id: surface.paneId }).catch(() => undefined); });
      else await client.call("pane.close", { pane_id: surface.paneId }).catch(() => undefined);
    }
    const siblings = [...this.surfaces.values()].filter((candidate) => candidate.agentId !== surface.agentId && candidate.tabId === surface.tabId);
    if (siblings.length === 0) {
      const closed = await client.call("tab.close", { tab_id: surface.tabId }).then(() => true, () => false);
      if (!closed) await client.call("pane.close", { pane_id: surface.paneId }).catch(() => undefined);
    } else {
      await client.call("pane.close", { pane_id: surface.paneId }).catch(() => undefined);
    }
    await rm(join(surface.bridgeDir, "parent-bridge-token"), { force: true }).catch(() => undefined);
    this.dropSurface(surface.agentId);
  }

  private dropSurface(agentId: string): void {
    const surface = this.surfaces.get(agentId);
    if (surface) this.claimedPanes.delete(surface.paneId);
    this.surfaces.delete(agentId);
    // A freed surface slot may unblock a waiting submission.
    const waiters = this.surfaceWaiters.splice(0);
    for (const notify of waiters) notify();
  }

  /** Surface permit: only creating a NEW pane (split/tab) is capped; reusing
   *  or recycling an existing surface never waits, so a saturated backend
   *  degrades to serialized recycling instead of deadlocking. */
  private async waitForSurfaceSlot(): Promise<void> {
    if (this.surfaces.size < this.maxLiveSurfaces) return;
    await new Promise<void>((resolve) => {
      this.surfaceWaiters.push(resolve);
    });
  }

  async execute(input: TaskExecutorInput): Promise<TaskExecutionOutput> {
    assertHerdrRoleSupported(input.role, { ...input.item, cli: input.nestedCli });
    // This deterministic, shell-free check happens only after the authorized
    // Agent/job/turn exists and before any vendor task invocation. It never
    // installs, logs in, refreshes credentials, or executes the task through Pi/Bash.
    const cliProbe = input.nestedCli ? await probeExternalCli(input.nestedCli, input.context.signal) : undefined;
    if (cliProbe) input = { ...input, cliProbe };
    const snippetDefinitions = input.item.snippets?.length ? await discoverPromptModifiers([{ path: join(getAgentDir(), "snippets"), trusted: true }]) : [];
    const roleAllowedSnippets = snippetDefinitions.filter((definition) => definition.scopes.includes(`role:${input.role.selector}`)).map((definition) => definition.id);
    const snippetResolution = input.item.snippets?.length ? resolvePromptModifiers(
      snippetDefinitions,
      input.item.snippets,
      { surface: "subagent", role: input.role.selector, allowedIds: roleAllowedSnippets, capabilities: input.role.capabilities },
    ) : undefined;
    if (snippetResolution) input = { ...input, role: { ...input.role, tools: [...applyPromptPolicyPatch(input.role.tools, snippetResolution.policyPatch)] } };
    await this.ensureSetup(input.nestedCli !== undefined);
    const client = this.client!;
    const now = () => this.clock().toISOString();
    // Atomic id allocation: parallel turns must never compute the same runId
    // (a duplicate run.created would poison the journal's writer chain).
    const runId = await this.options.journal.appendAllocatedRun((allocated) => ({
      agentId: input.agentId,
      jobId: input.jobId,
      turnId: input.turnId,
      record: {
        schemaVersion: 1,
        runId: allocated,
        agentId: input.agentId,
        jobId: input.jobId,
        turnId: input.turnId,
        backend: "herdr",
        driver: input.nestedCli ? "external-cli" : "pi-cli",
        lifecycle: "allocated",
        loadoutHash: herdrRunLoadout(input, allocated, this.options.cwd).loadoutHash,
        controlMode: "aili",
        createdAt: now(),
        updatedAt: now(),
      } satisfies RunRecord,
    }));
    const runBridgeDir = join(this.options.layout.root, "herdr-runs", runId);
    await mkdir(runBridgeDir, { recursive: true, mode: 0o700 });
    const runLoadout = herdrRunLoadout(input, runId, this.options.cwd);
    const agentSessionDir = join(this.options.layout.root, "herdr-sessions", input.agentId);
    await mkdir(agentSessionDir, { recursive: true, mode: 0o700 });
    const ceilingPath = join(agentSessionDir, "loadout.json");
    if (!existsSync(ceilingPath)) await writeFile(ceilingPath, `${JSON.stringify(runLoadout, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await writeFile(join(runBridgeDir, "loadout.json"), `${JSON.stringify(runLoadout, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const setRun = (from: RunRecord["lifecycle"], to: RunRecord["lifecycle"], extra: Record<string, unknown> = {}) =>
      this.options.journal.append({ kind: "run.state", agentId: input.agentId, jobId: input.jobId, turnId: input.turnId, runId, payload: { from, to, ...extra } });

    // A surface whose child bridge died is dropped: continuation proceeds on
    // a fresh surface with the SAME stable session dir/id, so the agent's
    // conversation resumes instead of failing (design §12.4: a stopped run
    // with a resumable session gets a new run on a recycled or fresh pane).
    const stale = this.surfaces.get(input.agentId);
    if (stale?.bridge?.isConnected()) {
      await stale.bridge.command("shutdown").catch(() => undefined);
      this.dropSurface(input.agentId);
      await setRun("allocated", "starting", { note: "per-Run fresh child; stable Pi session resumed" }).catch(() => undefined);
    } else if (stale && !stale.bridge?.isConnected()) {
      this.dropSurface(input.agentId);
      await setRun("allocated", "starting", { note: "previous surface dropped; session resumes on a fresh run" }).catch(() => undefined);
    } else {
      await setRun("allocated", "starting");
    }
    const surface = await this.ensureSurface(input, runId);

    const prompt = assembleChildPrompt({
      runtimeEnvelope: [
        "Official Pi persistent Agent runtime (herdr backend, external process). The parent conversation is not copied.",
        `Agent ID: ${input.agentId}`,
        `Model: ${input.modelChoice ? `${input.modelChoice.provider}/${input.modelChoice.model} (thinking=${input.modelChoice.thinking}, speed=${input.modelChoice.speedTier ?? "standard"})` : "inherited"}`,
        `Execution surface: Herdr pane ${surface.paneId} (tab ${surface.tabId})`,
      ].join("\n"),
      role: input.role,
      task: snippetResolution ? assemblePromptModifiers("", input.item.task, snippetResolution.ordered).dynamicMessage : input.item.task,
      context: input.item.context,
      cwd: this.options.cwd,
      workspace: { mode: "shared", root: this.options.cwd },
    });

    const liveName = herdrLiveName(this.options.parentId, runNumberFromRunId(runId));
    if (input.nestedCli && input.cliProbe) {
      const enableYolo = runLoadout.permission.modeName === "yolo";
      const plan = createExternalCliLaunchPlan(input.cliProbe, enableYolo);
      surface.external = true;
      const abort = () => {
        void client.call("pane.close", { pane_id: surface.paneId }).catch(() => undefined);
        this.dropSurface(input.agentId);
      };
      input.context.signal.addEventListener("abort", abort, { once: true });
      try {
        await this.startAgentWithRetry(client, {
          name: liveName,
          kind: plan.herdrKind,
          pane_id: surface.paneId,
          args: [...plan.argv],
          timeout_ms: this.startupTimeoutMs,
        });
        const activeAgent = await this.waitForNamedAgent(client, surface.paneId, liveName);
        surface.starting = false;
        await setRun("starting", "live");
        await this.options.journal.append({
          kind: "turn.audit",
          agentId: input.agentId,
          jobId: input.jobId,
          turnId: input.turnId,
          payload: {
            backend: "herdr",
            driver: "external-cli",
            runId,
            surface: { workspace: surface.workspaceId, tab: surface.tabId, pane: surface.paneId, liveName },
            externalCli: plan.cli,
            cuiKind: plan.herdrKind,
            yolo: plan.yolo,
            capabilityEvidence: { completed: input.cliProbe.completed, identity: input.cliProbe.identity, outputTruncated: input.cliProbe.outputTruncated },
            settlement: "post-prompt-working-then-idle-or-done",
          },
        });

        // agent.prompt is Herdr's CUI input API. The task is never encoded in
        // argv or a shell command. A pre-existing idle snapshot is deliberately
        // ignored; only a working state observed after this call opens the
        // settlement gate for this exact pane/name pair.
        const promptResult = await client.call<Record<string, unknown>>("agent.prompt", {
          target: surface.paneId,
          text: `${prompt.systemPrompt}\n\n---\n\n${prompt.initialMessage}`,
        });
        const statuses: ExternalCliAgentStatus[] = [];
        const promptedAgent = promptResult.agent && typeof promptResult.agent === "object" ? promptResult.agent as Record<string, unknown> : undefined;
        const promptStatus = typeof promptedAgent?.agent_status === "string"
          ? promptedAgent.agent_status
          : typeof activeAgent.agent_status === "string" ? activeAgent.agent_status : undefined;
        if (promptStatus) statuses.push(promptStatus);
        while (projectExternalCliSettlement(statuses) !== "settled") {
          if (input.context.signal.aborted) throw input.context.signal.reason ?? new Error("external CLI turn cancelled");
          await new Promise((resolve) => setTimeout(resolve, 150));
          let agent: Record<string, unknown> | undefined;
          try {
            const result = await client.call<Record<string, unknown>>("agent.get", { target: surface.paneId });
            agent = result.agent && typeof result.agent === "object" ? result.agent as Record<string, unknown> : undefined;
          } catch {
            await setRun("live", "lost", { failure: "external CUI pane/process was lost; prompt will not be replayed" });
            throw new Error(`${input.agentId}: external CUI pane was lost; prompt was not replayed`);
          }
          if (agent?.pane_id !== surface.paneId || agent.name !== liveName) {
            throw new Error(`${input.agentId}: external CUI Agent identity changed in frozen pane`);
          }
          const status = String(agent.agent_status ?? "unknown");
          statuses.push(status);
          if (status === "blocked" && this.options.requestInteraction) {
            // A blocked status alone is non-terminal. The policy callback may
            // issue a hard denial, but receives no credential or raw vendor
            // payload and must never open a user dialog for this interaction.
            const answer = await this.options.requestInteraction({
              agentId: input.agentId,
              jobId: input.jobId,
              turnId: input.turnId,
              runId,
              interactionId: `${runId}:blocked`,
              kind: "external-cui-confirmation",
              payload: { disposition: "need-user", externalCli: plan.cli },
              signal: input.context.signal,
            }).catch(() => "deny");
            if (answer === "deny") {
              await setRun("live", "failed", { failure: "blocked/need-user: external CUI confirmation lacks existing operation authorization" });
              await this.shutdownSettledSurface(client, surface);
              return {
                status: "failed",
                output: "blocked/need-user: external CUI confirmation was denied by AILI policy",
                error: "blocked/need-user",
                evidence: { externalCli: plan.cli, yolo: plan.yolo, pane: surface.paneId, lifecycle: statuses.slice(-16) },
                backend: "herdr",
                driver: "external-cli",
                runId,
              };
            }
          }
        }
        const readResult = await client.call<Record<string, unknown>>("agent.read", {
          target: surface.paneId,
          source: "recent_unwrapped",
          lines: 200,
          format: "text",
          strip_ansi: true,
        }).catch(() => undefined);
        const read = readResult?.read && typeof readResult.read === "object" ? readResult.read as Record<string, unknown> : undefined;
        const rawOutput = typeof read?.text === "string" ? read.text : "";
        const output = redactCredentialText(rawOutput).slice(-32_768).trim()
          || `${plan.cli} completed and returned to its input-ready CUI state`;
        await setRun("live", "stopping");
        await setRun("stopping", "stopped", { stopReason: "cui-input-ready" });
        surface.busy = false;
        await this.shutdownSettledSurface(client, surface);
        return {
          output,
          evidence: { externalCli: plan.cli, cuiKind: plan.herdrKind, yolo: plan.yolo, pane: surface.paneId, lifecycle: statuses.slice(-16), outputTruncated: rawOutput.length > 32_768 },
          backend: "herdr",
          driver: "external-cli",
          runId,
        };
      } catch (error) {
        const lifecycle = this.options.journal.getState().runs[runId]?.lifecycle;
        if (lifecycle === "starting" || lifecycle === "live") await setRun(lifecycle, "failed", { failure: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
        await this.shutdownSettledSurface(client, surface).catch(() => undefined);
        throw error;
      } finally {
        input.context.signal.removeEventListener("abort", abort);
      }
    }

    let bridge: BridgeConnection;
    if (surface.bridge?.isConnected()) {
      throw new Error(`${runId}: fresh Run unexpectedly reused a live child bridge`);
    } else {
      const sessionDir = join(this.options.layout.root, "herdr-sessions", input.agentId);
      const integrationPath = herdrIntegrationExtensionPath();
      if (!integrationPath) {
        throw new Error("herdr pi integration extension is missing (~/.pi/agent/extensions/herdr-agent-state.ts); run 'herdr integration install pi' before using the herdr backend");
      }
      const argv = buildChildArgv({
        bootstrapModulePath: this.options.bootstrapModulePath,
        integrationExtensionPath: integrationPath,
        sessionDir,
        sessionId: input.agentId,
        tools: input.role.tools.filter((tool) => (HERDR_BUILTIN_TOOLS as readonly string[]).includes(tool)),
        model: input.modelChoice ? `${input.modelChoice.provider}/${input.modelChoice.model}` : undefined,
        thinking: input.modelChoice?.thinking,
        identity: { bridgeDir: surface.bridgeDir, sockDir: surface.sockDir, runId, agentId: input.agentId, tokenFile: join(surface.bridgeDir, "bridge-token"), loadoutHash: surface.loadoutHash },
      });

      // Two-step startup: surface exists; start the agent and require BOTH
      // Herdr readiness and the child bridge handshake before the run is live.
      // A freshly created pane's shell has not reached its prompt yet, so
      // herdr answers agent_pane_busy — retry within the startup budget
      // instead of failing the run on the race.
      const fresh = new BridgeConnection(join(surface.sockDir, "bridge.sock"), surface.token, (event) => {
        const interactionId = typeof event.data.interactionId === "string" ? event.data.interactionId : undefined;
        const promptSpan = typeof event.data.spanId === "string" ? `ui:${event.data.spanId}` : undefined;
        if (event.event === "interaction.requested" && interactionId) surface.pendingInteractions?.add(interactionId);
        if ((event.event === "interaction.resolved" || event.event === "interaction.expired") && interactionId) surface.pendingInteractions?.delete(interactionId);
        if (event.event === "ui.prompt.started" && promptSpan) surface.pendingInteractions?.add(promptSpan);
        if (event.event === "ui.prompt.ended" && promptSpan) surface.pendingInteractions?.delete(promptSpan);
        if (event.event === "manual.input") void this.options.journal.append({ kind: "run.control", agentId: input.agentId, jobId: input.jobId, turnId: input.turnId, runId, payload: { controlMode: "mixed" } }).catch(() => undefined);
        this.options.onActivity?.({ ...event, agentId: input.agentId, runId });
      });
      for (let attempt = 1; ; attempt += 1) {
        try {
          await this.startAgentWithRetry(client, { name: liveName, kind: "pi", pane_id: surface.paneId, args: argv, timeout_ms: this.startupTimeoutMs });
          await fresh.connect(this.startupTimeoutMs);
          const status = await fresh.command("status");
          if (!status.ok || status.result.agentId !== input.agentId || status.result.runId !== runId || status.result.loadoutHash !== surface.loadoutHash && status.result.loadoutHash !== "fixture-unbound") {
            throw new Error(`child bridge handshake failed for ${input.agentId}: ${status.ok ? "identity mismatch" : status.error}`);
          }
          break;
        } catch (error) {
          // A concurrently-lost reused pane is not fatal: open a fresh tab
          // (identity rides argv, so the new pane serves this run) once.
          const lostReuse = surface.reusedPane
            && attempt === 1
            && error instanceof HerdrProtocolError
            && (error.herdrCode ?? "").startsWith("agent_pane_");
          if (lostReuse) {
            this.claimedPanes.delete(surface.paneId);
            const opened = await this.openNewTab(client, input, surface.workspaceId, surface.bridgeDir, surface.sockDir, runId, surface.token);
            surface.tabId = opened.tabId;
            surface.paneId = opened.paneId;
            surface.reusedPane = false;
            this.claimedPanes.add(opened.paneId);
            await this.attachIdentity(client, input, opened.paneId, surface.workspaceId, opened.tabId, runId);
            continue;
          }
          // Surface cleanup on failed startup: the pane we created is ours to close.
          await client.call("pane.close", { pane_id: surface.paneId }).catch(() => undefined);
          this.dropSurface(input.agentId);
          await setRun("starting", "failed", { failure: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
          throw error;
        }
      }
      surface.bridge = fresh;
      bridge = fresh;
    }
    surface.starting = false;
    await setRun("starting", "live");
    await this.options.journal.append({
      kind: "turn.audit",
      agentId: input.agentId,
      jobId: input.jobId,
      turnId: input.turnId,
      payload: {
        backend: "herdr",
        driver: "pi-cli",
        runId,
        surface: { workspace: surface.workspaceId, tab: surface.tabId, pane: surface.paneId, liveName },
        ...(input.cliProbe ? {
          nestedCli: input.cliProbe.cli,
          cliProbe: { executable: input.cliProbe.executable, version: input.cliProbe.version.slice(0, 2_048), completed: input.cliProbe.completed, identity: input.cliProbe.identity, yolo: input.cliProbe.yolo.disposition, outputTruncated: input.cliProbe.outputTruncated },
          finalCommandEvidence: "model-reported",
        } : {}),
      },
    });

    // The role/system context rides in the turn message: pi's
    // --append-system-prompt flag is argv-borne and herdr shell-encodes argv,
    // so non-ASCII role bodies must travel over the bridge socket instead.
    const submitted = await bridge.command("submit_turn", { runId, jobId: input.jobId, turnId: input.turnId, task: `${prompt.systemPrompt}\n\n---\n\n${prompt.initialMessage}` });
    if (!submitted.ok) {
      await setRun("live", "failed", { failure: `submit_turn rejected: ${submitted.error}` });
      throw new Error(`herdr child rejected submit_turn: ${submitted.error}`);
    }

    const abort = () => {
      void client.call("pane.close", { pane_id: surface.paneId }).catch(() => undefined);
      this.dropSurface(input.agentId);
    };
    input.context.signal.addEventListener("abort", abort, { once: true });

    let settled: ParentBridgeEvent;
    const handledInteractions = new Set<string>();
    try {
      while (true) {
        const event = await bridge.waitFor((candidate) => {
          if ((candidate.event === "turn.completed" || candidate.event === "turn.failed") && candidate.data.turnId === input.turnId) return true;
          return candidate.event === "interaction.requested" && typeof candidate.data.interactionId === "string" && !handledInteractions.has(candidate.data.interactionId);
        });
        if (event.event !== "interaction.requested") { settled = event; break; }
        const interactionId = String(event.data.interactionId);
        handledInteractions.add(interactionId);
        const answer = this.options.requestInteraction
          ? await this.options.requestInteraction({ agentId: input.agentId, jobId: input.jobId, turnId: input.turnId, runId, interactionId, kind: String(event.data.kind ?? "question"), payload: (event.data.request ?? {}) as Record<string, unknown>, signal: input.context.signal }).catch(() => "deny")
          : "deny";
        await bridge.command("answer_interaction", { interactionId, answer });
        await bridge.command("ack", { seq: event.seq });
      }
    } catch (error) {
      await setRun("live", "failed", { failure: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
      throw error;
    } finally {
      input.context.signal.removeEventListener("abort", abort);
    }

    if (settled.event === "turn.failed") {
      await setRun("live", "failed", { failure: String(settled.data.error ?? "child turn failed") });
      await bridge.command("ack", { seq: settled.seq }).catch(() => undefined);
      // A settled failure ends the child process too: the pane returns to its
      // shell and stays reusable for the next agent (one visible surface).
      await this.shutdownSettledSurface(client, surface);
      return { status: "failed", output: "", error: String(settled.data.error ?? "child turn failed"), backend: "herdr", driver: "pi-cli", runId };
    }

    const usage = settled.data.usage as { input?: number; output?: number; totalTokens?: number; costTotal?: number } | undefined;
    const model = typeof settled.data.model === "string" ? settled.data.model : undefined;
    await setRun("live", "stopping");
    await setRun("stopping", "stopped", { stopReason: "completed" });
    await bridge.command("ack", { seq: settled.seq }).catch(() => undefined);
    surface.busy = false;
    await this.shutdownSettledSurface(client, surface);
    return {
      output: String(settled.data.text ?? ""),
      evidence: { usage, bridgeSeq: settled.seq },
      model: model
        ? { model: model.includes("/") ? model.split("/")[1] : model, provider: model.includes("/") ? model.split("/")[0] : undefined, thinking: input.modelChoice?.thinking, speedTier: input.modelChoice?.speedTier }
        : undefined,
      backend: "herdr",
      driver: "pi-cli",
      runId,
    };
  }

  private async settleAdoptedRun(run: RunRecord, bridge: BridgeConnection): Promise<void> {
    if (!run.turnId || !run.jobId) return;
    try {
      const settled = await bridge.waitFor((event) => (event.event === "turn.completed" || event.event === "turn.failed") && event.data.turnId === run.turnId);
      const failed = settled.event === "turn.failed";
      const current = this.options.journal.getState();
      const turn = current.turns[run.turnId];
      const job = current.jobs[run.jobId];
      const agent = current.agents[run.agentId];
      const latestRun = current.runs[run.runId];
      if (latestRun?.lifecycle === "live") {
        if (failed) await this.options.journal.append({ kind: "run.state", agentId: run.agentId, jobId: run.jobId, turnId: run.turnId, runId: run.runId, payload: { from: "live", to: "failed", failure: String(settled.data.error ?? "child turn failed after reattach") } });
        else {
          await this.options.journal.append({ kind: "run.state", agentId: run.agentId, jobId: run.jobId, turnId: run.turnId, runId: run.runId, payload: { from: "live", to: "stopping" } });
          await this.options.journal.append({ kind: "run.state", agentId: run.agentId, jobId: run.jobId, turnId: run.turnId, runId: run.runId, payload: { from: "stopping", to: "stopped", stopReason: "completed-after-reattach" } });
        }
      }
      if (this.options.onAdoptedSettlement) {
        await this.options.onAdoptedSettlement({ agentId: run.agentId, jobId: run.jobId, turnId: run.turnId, runId: run.runId, status: failed ? "failed" : "completed", output: failed ? "" : String(settled.data.text ?? ""), ...(failed ? { error: String(settled.data.error ?? "failed") } : {}), evidence: { bridgeSeq: settled.seq, usage: settled.data.usage } });
      } else {
        if (turn && (turn.state === "running" || turn.state === "queued")) await this.options.journal.append({ kind: "turn.state", agentId: run.agentId, jobId: run.jobId, turnId: run.turnId, payload: { from: turn.state, to: failed ? "failed" : "completed", outcome: failed ? String(settled.data.error ?? "failed") : "completed-after-reattach" } });
        if (job && (job.state === "running" || job.state === "queued")) await this.options.journal.append({ kind: "job.state", agentId: run.agentId, jobId: run.jobId, payload: { from: job.state, to: failed ? "failed" : "completed", ...(failed ? { error: String(settled.data.error ?? "failed") } : { result: "completed-after-reattach" }) } });
        if (agent && (agent.state === "running" || agent.state === "queued")) await this.options.journal.append({ kind: "agent.state", agentId: run.agentId, payload: { from: agent.state, to: "idle", currentJobId: null, currentTurnId: null } });
      }
      await bridge.command("ack", { seq: settled.seq }).catch(() => undefined);
      const surface = this.surfaces.get(run.agentId);
      if (surface) await this.shutdownSettledSurface(this.client!, surface);
    } catch {
      const latest = this.options.journal.getState().runs[run.runId];
      if (latest?.lifecycle === "live") await this.options.journal.append({ kind: "run.state", agentId: run.agentId, jobId: run.jobId, turnId: run.turnId, runId: run.runId, payload: { from: "live", to: "lost", failure: "bridge lost after parent reattach" } }).catch(() => undefined);
      await reconcileUnfinishedCoordinator(this.options.journal, "process-loss", { includeAgentIds: new Set([run.agentId]) }).catch(() => undefined);
    }
  }

  /** Parent-restart reconcile (Phase 2 slice): adopt surfaces whose pane and
   *  bridge both survived; mark runs lost when their pane is gone. */
  async adoptAfterResume(): Promise<{ adopted: string[]; lost: string[] }> {
    const state = this.options.journal.getState();
    const herdrAgents = Object.values(state.agents).filter((agent) => agent.backend === "herdr");
    if (herdrAgents.length === 0) return { adopted: [], lost: [] };
    try {
      await this.ensureSetup();
    } catch {
      // Daemon unavailable after restart: every live herdr run is lost.
      const lost: string[] = [];
      for (const [id, run] of Object.entries(state.runs)) {
        if (run.backend !== "herdr" || (run.lifecycle !== "live" && run.lifecycle !== "starting" && run.lifecycle !== "allocated")) continue;
        await this.options.journal.append({ kind: "run.state", agentId: run.agentId, runId: id, payload: { from: run.lifecycle, to: "failed", failure: "herdr daemon unreachable after parent restart" } }).catch(() => undefined);
        lost.push(id);
      }
      return { adopted: [], lost };
    }
    const client = this.client!;
    const adopted: string[] = [];
    const lost: string[] = [];
    const sync = await client.call<unknown>("session.snapshot", {});
    const snapshot = (sync as { snapshot?: HerdrSnapshot }).snapshot ?? (sync as unknown as HerdrSnapshot);
    const byAgentPane = new Map<string, { paneId: string; tokens: Record<string, string> }>();
    for (const pane of snapshot.panes ?? []) {
      const agentId = pane.tokens?.aili_agent_id;
      if (agentId && pane.pane_id) byAgentPane.set(agentId, { paneId: pane.pane_id, tokens: pane.tokens! });
    }
    for (const agent of herdrAgents) {
      const matched = byAgentPane.get(agent.id);
      if (!matched) {
        const run = latestRunForAgent(state.runs, agent.id);
        if (run && run.lifecycle !== "stopped" && run.lifecycle !== "failed" && run.lifecycle !== "lost") {
          await this.options.journal.append({ kind: "run.state", agentId: agent.id, runId: run.runId, payload: { from: run.lifecycle, to: "lost", failure: "pane no longer exists after parent restart" } });
          lost.push(run.runId);
        }
        continue;
      }
      const resumedRun = latestRunForAgent(state.runs, agent.id);
      if (!resumedRun) continue;
      const tokenFile = join(this.options.layout.root, "herdr-runs", resumedRun.runId, "parent-bridge-token");
      if (!existsSync(tokenFile)) continue;
      const token = (await readFile(tokenFile, "utf8").catch(() => "")).trim();
      if (!token) continue;
      const runDir = join(this.options.layout.root, "herdr-runs", resumedRun.runId);
      const resumedRunId = resumedRun.runId;
      const probe = new BridgeConnection(join(bridgeSocketDirFor(runDir), "bridge.sock"), token, (event) => this.options.onActivity?.({ ...event, agentId: agent.id, runId: resumedRunId }));
      try {
        await probe.connect(2_000);
        const status = await probe.command("status");
        if (status.ok && status.result.agentId === agent.id && status.result.runId === resumedRun.runId && status.result.loadoutHash === resumedRun.loadoutHash) {
          this.surfaces.set(agent.id, {
            agentId: agent.id,
            workspaceId: matched.tokens.aili_workspace ?? "",
            tabId: matched.tokens.aili_tab ?? "",
            paneId: matched.paneId,
            bridgeDir: runDir,
            sockDir: bridgeSocketDirFor(runDir),
            token,
            loadoutHash: resumedRun.loadoutHash ?? "reconciled-unverified",
            reusedPane: true,
            starting: false,
            busy: false,
            pendingInteractions: new Set(),
            bridge: probe,
          });
          this.claimedPanes.add(matched.paneId);
          adopted.push(agent.id);
          void this.settleAdoptedRun(resumedRun, probe);
          continue;
        }
      } catch {
        // Pane alive but bridge lost: run stays live, activity is degraded;
        // job settlement never happens from Herdr display alone.
      }
    }
    return { adopted, lost };
  }
}

function latestRunForAgent(runs: Record<string, RunRecord>, agentId: string): RunRecord | undefined {
  let latest: RunRecord | undefined;
  for (const run of Object.values(runs)) {
    if (run.agentId !== agentId) continue;
    if (!latest || run.createdAt > latest.createdAt) latest = run;
  }
  return latest;
}

/** Standalone daemon probe for status/doctor surfaces that must not create
 *  (or require) an AILI runtime — e.g. /aili-agent-backend before the parent
 *  session file has been materialized on disk. */
export async function probeHerdrDaemon(socketPath?: string): Promise<{ socketReachable: boolean; protocol?: number }> {
  const client = new HerdrSocketClient({ socketPath: socketPath ?? defaultHerdrSocketPath(), callTimeoutMs: 3_000 });
  try {
    await client.sync();
    return { socketReachable: true, protocol: client.protocolVersion };
  } catch {
    return { socketReachable: false };
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

export function defaultBootstrapModulePath(): string {
  return new URL("../../herdr-child/index.ts", import.meta.url).pathname;
}
