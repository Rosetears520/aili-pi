import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer, isIP, type AddressInfo } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { redactedWebDiagnostic } from "../../src/runtime/web/access-policy.js";

export const WEB_COMMAND_NAME = "web" as const;
export const CHANGES_COMMAND_NAME = "changes" as const;
export const SUPPORTED_PI_VERSION = "0.84.4" as const;
export const WEB_CHILD_READY_TIMEOUT_MS = 30_000;
export const WEB_CHILD_STOP_TIMEOUT_MS = 5_000;
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
  /** True when the port came from an explicit -p/--port request — those stay
   *  strict (a busy explicitly-requested port is an error, never silently
   *  moved); only the DEFAULT port may fall back to a free one. */
  readonly portExplicit: boolean;
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

/**
 * The web application owns its own in-process official SDK sessions (the
 * upstream pi-web model); it never shares or observes the TUI session, so no
 * writer lease or projection admission applies here.
 */

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
  pi.registerCommand(WEB_COMMAND_NAME, {
    description: "Start or report the Pi-owned AILI Web foreground child",
    handler: async (args, context) => {
      try {
        await assertCompatiblePiHost();
        let portNote = "";
        const address = await ensureWebChild(parseWebLaunchOptions(args), canonicalSessionRoot(context), (requested, actual) => {
          portNote = ` (port ${requested} was busy; using ${actual})`;
        });
        context.ui.notify(`AILI Web is ready at ${address}${portNote}`, "info");
      } catch (error) {
        context.ui.notify(`AILI Web did not start: ${redactedWebDiagnostic(error)}`, "error");
      }
    },
  });
  pi.on("session_shutdown", async (event) => {
    if (event.reason === "quit" || event.reason === "reload") await stopWebChild();
  });
}

/**
 * /changes (user direction 2026-08-25): start (or reuse) the SAME one web
 * child as /web, but hand the user the changes-viewer entry URL for the
 * session directory — the workbench UI itself never has to be opened. The
 * handler stays inert until invoked and the shutdown listener above already
 * owns the shared child's lifecycle.
 */
export function registerChangesCommand(pi: ExtensionAPI): void {
  pi.registerCommand(CHANGES_COMMAND_NAME, {
    description: "Start or report the Pi-owned AILI Web child and open the changes viewer",
    handler: async (args, context) => {
      try {
        await assertCompatiblePiHost();
        const sessionRoot = canonicalSessionRoot(context);
        let portNote = "";
        const address = await ensureWebChild(parseWebLaunchOptions(args), sessionRoot, (requested, actual) => {
          portNote = ` (port ${requested} was busy; using ${actual})`;
        });
        context.ui.notify(`AILI changes viewer is ready at ${changesViewerUrl(address, sessionRoot)}${portNote}`, "info");
      } catch (error) {
        context.ui.notify(`AILI changes viewer did not start: ${redactedWebDiagnostic(error)}`, "error");
      }
    },
  });
}

/** Changes-page entry URL for a ready web child; bare when no session root exists. */
export function changesViewerUrl(address: string, sessionRoot?: string): string {
  const base = address.endsWith("/") ? address.slice(0, -1) : address;
  return sessionRoot ? `${base}/changes?cwd=${encodeURIComponent(sessionRoot)}` : `${base}/changes`;
}

/** Start exactly one packaged child or reuse its private-channel ready address.
 *  When the launch uses the DEFAULT port and that port is already taken by a
 *  foreign process, the child silently moves to a kernel-assigned free port
 *  and onPortFallback reports the switch; explicitly requested ports stay strict. */
export async function ensureWebChild(
  options: WebLaunchOptions,
  seededAllowedRoot?: string,
  onPortFallback?: (requestedPort: number, actualPort: number) => void,
): Promise<string> {
  const current = activeWebChild;
  if (current && current.controlOpen && current.livenessOpen && current.child.exitCode === null && current.child.signalCode === null) return current.ready;
  if (current) await stopWebChild();

  let launch = options;
  if (!options.portExplicit && options.port === WEB_DEFAULT_PORT) {
    const actual = await reserveWebPort(options.hostname, options.port);
    if (actual !== options.port) {
      launch = withWebPort(options, actual);
      onPortFallback?.(options.port, actual);
    }
  }

  const child = spawn(process.execPath, [join(ROOT, "bin", "pi-web.js"), ...launch.cliArguments, "--managed"], {
    cwd: process.cwd(),
    detached: false,
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe", "pipe"],
    env: inheritedWebEnvironment(launch, seededAllowedRoot),
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
    expectedAddress: launch.expectedAddress,
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
  let portExplicit = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const item = tokens[index]!;
    if (item === "--hostname" || item === "-H") hostname = requiredOptionValue(tokens, ++index, "hostname");
    else if (item === "--port" || item === "-p") {
      const portText = requiredOptionValue(tokens, ++index, "port");
      if (!/^[0-9]{1,5}$/.test(portText)) throw new Error("web port must be from 1 through 65535");
      port = Number(portText);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("web port must be from 1 through 65535");
      portExplicit = true;
    } else throw new Error("unsupported /web option");
  }
  hostname = normalizeHostname(hostname);
  return Object.freeze({
    hostname,
    port,
    portExplicit,
    expectedAddress: `http://${formatHost(hostname, port)}`,
    cliArguments: Object.freeze(["--hostname", hostname, "--port", String(port)]),
  });
}

function withWebPort(options: WebLaunchOptions, port: number): WebLaunchOptions {
  return Object.freeze({
    hostname: options.hostname,
    port,
    portExplicit: options.portExplicit,
    expectedAddress: `http://${formatHost(options.hostname, port)}`,
    cliArguments: Object.freeze(["--hostname", options.hostname, "--port", String(port)]),
  });
}

/**
 * The default web port (30141) is commonly held by a leftover server from an
 * earlier Pi session or a standalone pi-web; failing /web and /changes with
 * EADDRINUSE in that situation helps nobody. Probe the preferred port and,
 * when it is busy, let the kernel assign a free loopback port instead. The
 * probe-close-spawn window is a benign local race: a collision then still
 * surfaces as the normal readiness failure.
 */
async function reserveWebPort(hostname: string, preferred: number): Promise<number> {
  const canBind = (port: number) => new Promise<boolean>((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, hostname, () => probe.close(() => resolve(true)));
  });
  if (await canBind(preferred)) return preferred;
  const askKernel = new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, hostname, () => {
      const address = probe.address() as AddressInfo;
      probe.close(() => resolve(address.port));
    });
  });
  return askKernel;
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

function inheritedWebEnvironment(options: WebLaunchOptions, seededAllowedRoot?: string): NodeJS.ProcessEnv {
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
  // An operator-configured root policy always wins; otherwise the validated
  // session directory is the only mutation root this Web child exposes.
  if (environment.PI_WEB_ALLOWED_ROOTS === undefined && seededAllowedRoot) {
    environment.PI_WEB_ALLOWED_ROOTS = JSON.stringify([seededAllowedRoot]);
  }
  return environment;
}

/** A session-derived root is admitted only as one canonical existing directory. */
export function canonicalSessionRoot(context: ExtensionContext): string | undefined {
  const recorded = context.sessionManager.getCwd?.();
  if (!recorded || !isAbsolute(recorded)) return undefined;
  try {
    const canonical = realpathSync(recorded);
    if (!statSync(canonical).isDirectory()) return undefined;
    return canonical;
  } catch {
    return undefined;
  }
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
  let directory: string;
  try { directory = dirname(require.resolve(packageName)); }
  catch { directory = manualNodeModulesPackageDir(packageName); }
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

// ESM-only packages without a require export still own a readable manifest on
// disk; resolve it by walking node_modules upward from this extension.
function manualNodeModulesPackageDir(packageName: string): string {
  const segments = packageName.split("/");
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(directory, "node_modules", ...segments);
    if (existsSync(resolve(candidate, "package.json"))) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("installed Pi package manifest is missing");
}
