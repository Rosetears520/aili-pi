import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { redactedWebDiagnostic } from "../../src/runtime/web/access-policy.js";
import type { JsonValue, RuntimeSnapshotV1 } from "../../src/runtime/web/contracts.js";
import { OwnerOnlyProjectionServer } from "../../src/runtime/web/projection-channel.js";
import {
  OwnerOnlyProcessLivenessServer,
  currentProcessIdentity,
  isExactProcessAlive,
  markLeaseInterrupted,
  probeOwnerProcessLiveness,
} from "../../src/runtime/web/process-liveness.js";
import { RuntimeHost } from "../../src/runtime/web/runtime-host.js";
import { acquireSessionWriterLease, type SessionWriterLease } from "../../src/runtime/web/session-writer-lease.js";

export const WEB_COMMAND_NAME = "web" as const;
export const SUPPORTED_PI_VERSION = "0.84.1" as const;
export const WEB_CHILD_READY_TIMEOUT_MS = 30_000;
export const WEB_CHILD_STOP_TIMEOUT_MS = 5_000;
const WEB_LEASE_TTL_MS = 30_000;
const WEB_LEASE_RENEW_MS = 10_000;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PI_PACKAGES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
] as const;

export interface PiCompatibilityManifest {
  readonly nodeVersion: string;
  readonly packages: Readonly<Record<(typeof PI_PACKAGES)[number], string>>;
}

interface WebLaunchOptions {
  readonly hostname: string;
  readonly port: number;
  readonly expectedAddress: string;
  readonly cliArguments: readonly string[];
}

interface ActiveWebChild {
  readonly child: ChildProcess;
  readonly expectedAddress: string;
  readonly ready: Promise<string>;
  readonly livenessPipe: Writable;
  stderr: string;
  control: string;
  controlOpen: boolean;
  livenessOpen: boolean;
  settled: boolean;
  readyAddress?: string;
}

let activeWebChild: ActiveWebChild | undefined;
let tuiLease: SessionWriterLease | undefined;
let tuiLeaseTimer: NodeJS.Timeout | undefined;
let tuiLeaseContext: ExtensionContext | undefined;
let tuiRuntimeHost: RuntimeHost | undefined;
let tuiProjectionServer: OwnerOnlyProjectionServer | undefined;
let tuiLivenessServer: OwnerOnlyProcessLivenessServer | undefined;

/** Pure exact-version seam for runtime-host mismatch fixtures. */
export function validatePiCompatibilityManifest(manifest: PiCompatibilityManifest): void {
  if (!isSupportedNodeVersion(manifest.nodeVersion)) throw new Error("AILI Pi Web requires Node.js 22.19.0 or newer");
  for (const packageName of PI_PACKAGES) {
    if (manifest.packages[packageName] !== SUPPORTED_PI_VERSION) {
      throw new Error(`AILI Pi Web requires ${packageName}@${SUPPORTED_PI_VERSION}`);
    }
  }
}

/** Reject an incompatible Package host before mutation handlers are registered. */
export async function assertCompatiblePiHost(
  resolvePackageJson: (packageName: string) => string = defaultPackageResolver,
  nodeVersion = process.versions.node,
): Promise<PiCompatibilityManifest> {
  const packages = {} as Record<(typeof PI_PACKAGES)[number], string>;
  for (const packageName of PI_PACKAGES) {
    let value: { version?: unknown };
    try { value = JSON.parse(await readFile(resolvePackageJson(packageName), "utf8")) as { version?: unknown }; }
    catch { throw new Error(`AILI Pi Web cannot verify the installed ${packageName} host`); }
    if (typeof value.version !== "string") throw new Error(`AILI Pi Web cannot verify the installed ${packageName} host`);
    packages[packageName] = value.version;
  }
  const manifest = Object.freeze({ nodeVersion, packages: Object.freeze(packages) });
  validatePiCompatibilityManifest(manifest);
  return manifest;
}

/** Register inert handlers. No process is spawned until /web is invoked. */
export function registerWebCommand(pi: ExtensionAPI): void {
  registerTuiStartupAdmission(pi);
  registerTuiProjectionEvents(pi);
  pi.registerCommand(WEB_COMMAND_NAME, {
    description: "Start or report the Pi-owned AILI Web foreground child",
    handler: async (args, context) => {
      try {
        await assertCompatiblePiHost();
        const address = await ensureWebChild(parseWebLaunchOptions(args));
        context.ui.notify(`AILI Web is ready at ${address}`, "info");
      } catch (error) {
        context.ui.notify(`AILI Web did not start: ${redactedWebDiagnostic(error)}`, "error");
      }
    },
  });
  pi.on("session_shutdown", async (event) => {
    await releaseTuiRuntime();
    if (event.reason === "quit" || event.reason === "reload") await stopWebChild();
  });
}

/** Start exactly one packaged child or reuse its private-channel ready address. */
export async function ensureWebChild(options: WebLaunchOptions): Promise<string> {
  const current = activeWebChild;
  if (current && current.controlOpen && current.livenessOpen && current.child.exitCode === null && current.child.signalCode === null) return current.ready;
  if (current) await stopWebChild();

  const executable = join(ROOT, "bin", "pi-web.js");
  const child = spawn(process.execPath, [executable, ...options.cliArguments, "--managed"], {
    cwd: process.cwd(),
    detached: false,
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe", "pipe"],
    env: inheritedWebEnvironment(options),
  });
  let identityPipe: Writable;
  let controlPipe: Readable;
  let livenessPipe: Writable;
  try {
    identityPipe = requiredWritablePipe(child, 3);
    controlPipe = requiredReadablePipe(child, 4);
    livenessPipe = requiredWritablePipe(child, 5);
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  const oneUseIdentity = randomBytes(32);
  const identityCopy = Buffer.from(oneUseIdentity);
  oneUseIdentity.fill(0);
  identityPipe.end(identityCopy, () => identityCopy.fill(0));

  let resolveReady!: (address: string) => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<string>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const state: ActiveWebChild = {
    child,
    expectedAddress: options.expectedAddress,
    ready,
    livenessPipe,
    stderr: "",
    control: "",
    controlOpen: true,
    livenessOpen: true,
    settled: false,
  };
  activeWebChild = state;

  const fail = (reason: string): void => {
    if (state.settled) return;
    state.settled = true;
    const detail = state.stderr ? `; child=${redactedWebDiagnostic(state.stderr)}` : "";
    rejectReady(new Error(`${reason}${detail}`));
    if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill("SIGTERM");
    if (activeWebChild === state) activeWebChild = undefined;
  };
  const timer = setTimeout(() => fail("readiness timed out"), WEB_CHILD_READY_TIMEOUT_MS);
  timer.unref();

  child.stderr?.on("data", (chunk: Buffer | string) => {
    state.stderr = `${state.stderr}${String(chunk)}`.slice(-4096);
  });
  child.stdout?.on("data", () => { /* Child output cannot define readiness and is not injected into the TUI. */ });
  controlPipe.on("error", (error) => {
    state.controlOpen = false;
    fail(`private readiness channel failed: ${redactedWebDiagnostic(error)}`);
  });
  controlPipe.on("end", () => {
    state.controlOpen = false;
    fail("private readiness channel closed before readiness");
  });
  livenessPipe.on("error", () => { state.livenessOpen = false; });
  livenessPipe.on("close", () => { state.livenessOpen = false; });
  controlPipe.on("data", (chunk: Buffer | string) => {
    if (state.settled) return;
    state.control += String(chunk);
    if (state.control.length > 8192) return fail("private readiness frame exceeded its bound");
    const newline = state.control.indexOf("\n");
    if (newline < 0) return;
    const line = state.control.slice(0, newline);
    let message: { schemaVersion?: unknown; status?: unknown; address?: unknown; reason?: unknown };
    try { message = JSON.parse(line) as typeof message; }
    catch { fail("private readiness frame was malformed"); return; }
    if (message.schemaVersion !== 1) { fail("private readiness frame version was rejected"); return; }
    if (message.status === "failed") { fail(typeof message.reason === "string" ? message.reason : "child startup failed"); return; }
    if (message.status !== "ready" || message.address !== state.expectedAddress) {
      fail("private readiness identity or address was rejected");
      return;
    }
    state.settled = true;
    state.readyAddress = state.expectedAddress;
    clearTimeout(timer);
    resolveReady(state.expectedAddress);
  });
  child.once("error", (error) => fail(`child process error: ${redactedWebDiagnostic(error)}`));
  child.once("exit", (code, signal) => {
    clearTimeout(timer);
    state.livenessPipe.destroy();
    if (!state.settled) fail(`child exited before readiness (code=${code ?? "null"}; signal=${signal ?? "none"})`);
    if (activeWebChild === state) activeWebChild = undefined;
  });
  return ready;
}

/** Stop the Pi-owned child with bounded escalation and no detached survivor. */
export async function stopWebChild(): Promise<void> {
  const state = activeWebChild;
  activeWebChild = undefined;
  if (!state) return;
  state.livenessPipe.destroy();
  if (state.child.exitCode !== null || state.child.signalCode !== null) return;
  state.child.kill("SIGTERM");
  await new Promise<void>((resolveStop) => {
    let done = false;
    let timer: NodeJS.Timeout;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); resolveStop(); } };
    state.child.once("exit", finish);
    timer = setTimeout(() => {
      if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill("SIGKILL");
      finish();
    }, WEB_CHILD_STOP_TIMEOUT_MS);
    timer.unref();
  });
}

export const WEB_DEFAULT_PORT = 30141;

export function parseWebLaunchOptions(argumentsText: string): WebLaunchOptions {
  const tokens = argumentsText.trim() ? argumentsText.trim().split(/\s+/) : [];
  let hostname = "127.0.0.1";
  let port = WEB_DEFAULT_PORT;
  for (let index = 0; index < tokens.length; index += 1) {
    const item = tokens[index]!;
    if (item === "--hostname" || item === "-H") hostname = requiredOptionValue(tokens, ++index, "hostname");
    else if (item === "--port" || item === "-p") {
      const portText = requiredOptionValue(tokens, ++index, "port");
      if (!/^[0-9]{1,5}$/.test(portText)) throw new Error("web port must be from 1 through 65535");
      port = Number(portText);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("web port must be from 1 through 65535");
    } else throw new Error("unsupported /web option");
  }
  hostname = normalizeHostname(hostname);
  return Object.freeze({
    hostname,
    port,
    expectedAddress: `http://${formatHost(hostname, port)}`,
    cliArguments: Object.freeze(["--hostname", hostname, "--port", String(port)]),
  });
}

function registerTuiStartupAdmission(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, context) => {
    if (context.mode !== "tui") return;
    try { await assertCompatiblePiHost(); }
    catch (error) {
      context.ui.notify(redactedWebDiagnostic(error), "error");
      context.shutdown();
      return;
    }
    await releaseTuiRuntime();
    const root = join(resolve(getAgentDir()), ".aili-runtime");
    let result: Awaited<ReturnType<typeof acquireSessionWriterLease>>;
    try {
      tuiLivenessServer = new OwnerOnlyProcessLivenessServer(root, (generation) => tuiLease?.generation === generation);
      await tuiLivenessServer.start();
      result = await acquireSessionWriterLease(root, context.sessionManager.getSessionId(), "tui", {
        ttlMs: WEB_LEASE_TTL_MS,
        processIdentity: currentProcessIdentity(),
        livenessEndpointId: tuiLivenessServer.endpointId,
        isProcessAlive: isExactProcessAlive,
        probeLiveness: (endpointId, generation) => probeOwnerProcessLiveness(root, endpointId, generation),
        markInterrupted: (record) => markLeaseInterrupted(root, record),
      });
    } catch {
      context.ui.notify("This session is not available in stock Pi: writer admission could not be verified", "error");
      await releaseTuiRuntime();
      context.shutdown();
      return;
    }
    if (!result.acquired) {
      const owner = result.holder?.owner ?? "unverified";
      context.ui.notify(`This session is not available in stock Pi: writer=${owner}; reason=${result.reason}`, "error");
      await releaseTuiRuntime();
      context.shutdown();
      return;
    }
    tuiLease = result.lease;
    tuiLeaseContext = context;
    try {
      tuiRuntimeHost = new RuntimeHost(context.sessionManager.getSessionId(), {
        piVersion: SUPPORTED_PI_VERSION,
        runtimeDirectory: root,
        writerLease: result.lease,
        initialSnapshot: {
          state: "idle",
          capabilities: { "session.observe": true },
          projection: tuiProjection(context, "idle"),
        },
      });
      await tuiRuntimeHost.initialize();
      tuiProjectionServer = new OwnerOnlyProjectionServer({
        runtimeDirectory: root,
        privateSessionIdentity: context.sessionManager.getSessionId(),
        source: tuiRuntimeHost,
        onError: (error) => context.ui.notify(`AILI projection channel: ${redactedWebDiagnostic(error)}`, "error"),
      });
      await tuiProjectionServer.start();
    } catch (error) {
      context.ui.notify(`This session is not available in stock Pi: private projection startup failed (${redactedWebDiagnostic(error)})`, "error");
      await releaseTuiRuntime();
      context.shutdown();
      return;
    }
    tuiLeaseTimer = setInterval(() => {
      const host = tuiRuntimeHost;
      const activeContext = tuiLeaseContext;
      if (!host || !activeContext) return;
      host.heartbeatWriter().then((renewed) => {
        if (renewed) return;
        activeContext.ui.notify("AILI writer admission was lost; stock Pi is shutting down before another mutation", "error");
        activeContext.shutdown();
      }).catch(() => {
        activeContext.ui.notify("AILI writer admission could not be verified; stock Pi is shutting down before another mutation", "error");
        activeContext.shutdown();
      });
    }, WEB_LEASE_RENEW_MS);
    tuiLeaseTimer.unref();
  });
}

function registerTuiProjectionEvents(pi: ExtensionAPI): void {
  pi.on("agent_start", async (_event, context) => {
    if (!await setTuiActiveTurn(context, true)) return;
    projectTui(context, "running", { agentState: "running" });
  });
  pi.on("agent_end", (_event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { agentState: "ended" }));
  pi.on("agent_settled", async (_event, context) => {
    if (!await setTuiActiveTurn(context, false)) return;
    projectTui(context, "idle", { agentState: "settled" });
  });
  pi.on("turn_start", (event, context) => projectTui(context, "running", { turnIndex: event.turnIndex, turnState: "running" }));
  pi.on("turn_end", (event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { turnIndex: event.turnIndex, turnState: "ended" }));
  pi.on("message_start", (event, context) => projectTui(context, "running", { messageRole: event.message.role, messageState: "started" }));
  pi.on("message_update", (event, context) => projectTui(context, "running", { messageRole: event.message.role, messageState: "streaming" }));
  pi.on("message_end", (event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { messageRole: event.message.role, messageState: "ended" }));
  pi.on("tool_execution_start", (event, context) => projectTui(context, "running", { toolName: event.toolName, toolState: "running" }));
  pi.on("tool_execution_end", (event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { toolName: event.toolName, toolState: event.isError ? "failed" : "completed" }));
  pi.on("model_select", (event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { provider: event.model.provider, model: event.model.id }));
  pi.on("thinking_level_select", (event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { thinkingLevel: event.level }));
  pi.on("session_info_changed", (event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { sessionName: event.name ?? null }));
  pi.on("session_compact", (event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { compactionState: event.reason }));
  pi.on("session_tree", (_event, context) => projectTui(context, context.isIdle() ? "idle" : "running", { treeState: "changed" }));
}

async function setTuiActiveTurn(context: ExtensionContext, active: boolean): Promise<boolean> {
  if (context !== tuiLeaseContext || !tuiRuntimeHost) return false;
  try {
    const updated = await tuiRuntimeHost.heartbeatWriter(active);
    if (updated) return true;
  } catch { /* fall through to one fail-closed shutdown path */ }
  context.ui.notify("AILI writer active-turn state could not be verified; stock Pi is shutting down", "error");
  context.shutdown();
  return false;
}

function projectTui(context: ExtensionContext, state: RuntimeSnapshotV1["state"], patch: Readonly<Record<string, JsonValue>>): void {
  if (context !== tuiLeaseContext || !tuiRuntimeHost) return;
  try { tuiRuntimeHost.project("tui", state, { ...tuiProjection(context, state), ...patch }); }
  catch (error) {
    context.ui.notify(`AILI projection update failed: ${redactedWebDiagnostic(error)}`, "error");
    context.shutdown();
  }
}

function tuiProjection(context: ExtensionContext, state: RuntimeSnapshotV1["state"]): Readonly<Record<string, JsonValue>> {
  const usage = context.getContextUsage();
  return Object.freeze({
    surface: "tui",
    readOnlyObserver: true,
    state,
    idle: context.isIdle(),
    provider: context.model?.provider ?? null,
    model: context.model?.id ?? null,
    thinkingLevel: context.thinkingLevel ?? null,
    leafId: context.sessionManager.getLeafId() ?? null,
    ...(usage ? { contextTokens: usage.tokens, contextWindow: usage.contextWindow } : {}),
  });
}

async function releaseTuiRuntime(): Promise<void> {
  if (tuiLeaseTimer) clearInterval(tuiLeaseTimer);
  tuiLeaseTimer = undefined;
  tuiLeaseContext = undefined;
  const server = tuiProjectionServer;
  const host = tuiRuntimeHost;
  const lease = tuiLease;
  const liveness = tuiLivenessServer;
  tuiProjectionServer = undefined;
  tuiLivenessServer = undefined;
  tuiRuntimeHost = undefined;
  tuiLease = undefined;
  await server?.close().catch(() => undefined);
  await host?.dispose().catch(() => undefined);
  if (lease && !host) await lease.release().catch(() => false);
  await liveness?.close().catch(() => undefined);
}

function requiredReadablePipe(child: ChildProcess, index: number): Readable {
  const pipe = child.stdio[index];
  if (!pipe || typeof (pipe as Readable).read !== "function") throw new Error("Web child private read pipe is unavailable");
  return pipe as Readable;
}

function requiredWritablePipe(child: ChildProcess, index: number): Writable {
  const pipe = child.stdio[index];
  if (!pipe || typeof (pipe as Writable).write !== "function") throw new Error("Web child private write pipe is unavailable");
  return pipe as Writable;
}

function inheritedWebEnvironment(options: WebLaunchOptions): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PI_WEB_EXPECTED_HOST: formatHost(options.hostname, options.port),
    PI_WEB_EXPECTED_ORIGIN: options.expectedAddress,
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^PI_WEB_/i.test(key) && key !== "PORT") environment[key] = value;
  }
  for (const key of ["PI_WEB_PASSWORD", "PI_WEB_ALLOWED_ROOTS"] as const) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function requiredOptionValue(tokens: readonly string[], index: number, option: string): string {
  const value = tokens[index];
  if (!value || value.startsWith("-")) throw new Error(`missing value for ${option}`);
  return value;
}

function normalizeHostname(value: string): string {
  const hostname = value.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (hostname === "localhost" || isIP(hostname) !== 0) return hostname;
  if (!hostname || hostname.length > 253 || !hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error("invalid web hostname");
  }
  return hostname;
}

function formatHost(hostname: string, port: number): string {
  return hostname.includes(":") ? `[${hostname}]:${port}` : `${hostname}:${port}`;
}

function isSupportedNodeVersion(value: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (!match) return false;
  const current = [Number(match[1]), Number(match[2]), Number(match[3])];
  const minimum = [22, 19, 0];
  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index]! > minimum[index]!) return true;
    if (current[index]! < minimum[index]!) return false;
  }
  return true;
}

function defaultPackageResolver(packageName: string): string {
  const require = createRequire(import.meta.url);
  let directory = dirname(require.resolve(packageName));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(directory, "package.json");
    try {
      const value = JSON.parse(readFileSync(candidate, "utf8")) as { name?: unknown };
      if (value.name === packageName) return candidate;
    } catch { /* ascend to the owning package root */ }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("installed Pi package manifest is missing");
}
