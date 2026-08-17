#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, readSync, realpathSync, statSync, writeSync } from "node:fs";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPPORTED_PI_VERSION = "0.84.1";
const SUPPORTED_PI_PACKAGES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
const SOURCE_REVISION = "5a53c18ca9328400a3dfb8c48c1e4f343b3e4903";
const READY_PATTERN = /(?:^|\s)(?:✓\s*)?Ready(?:\s|$)/m;
const STOP_TIMEOUT_MS = 5_000;
let managed = false;

function parseOptions(args) {
  let hostname = process.env.PI_WEB_HOSTNAME ?? "127.0.0.1";
  let port = process.env.PORT ?? "30141";
  let open = false;
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === "--managed") managed = true;
    else if (item === "--open") open = true;
    else if (item === "--hostname" || item === "-H") hostname = optionValue(args, ++index, "hostname");
    else if (item === "--port" || item === "-p") port = optionValue(args, ++index, "port");
    else if (item === "--no-open") { /* retained as an inert compatibility option; this launcher never detaches a browser. */ }
    else throw new Error("unsupported pi-web option");
  }
  hostname = normalizeHostname(hostname);
  if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("port must be from 1 through 65535");
  return { hostname, port, open };
}

function optionValue(args, index, name) {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new Error(`missing value for ${name}`);
  return value;
}

function normalizeHostname(value) {
  const candidate = String(value).trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (candidate === "localhost" || isIP(candidate) !== 0) return candidate;
  if (!candidate || candidate.includes("%") || candidate.length > 253
    || !candidate.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error("invalid hostname");
  }
  return candidate;
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

/** One best-effort operator-facing browser launch; failures only log. */
function openBrowser(address) {
  const candidates = ["xdg-open", "x-www-browser", "www-browser"];
  const tryNext = (index) => {
    if (index >= candidates.length) {
      process.stdout.write(`pi-web: open ${address} manually\n`);
      return;
    }
    const child = spawn(candidates[index], [address], { stdio: "ignore", shell: false });
    child.once("error", () => tryNext(index + 1));
    child.once("spawn", () => child.unref());
  };
  tryNext(0);
}

function formatHost(hostname, port) {
  return hostname.includes(":") ? `[${hostname}]:${port}` : `${hostname}:${port}`;
}

function checkPrelisten(hostname, port) {
  const loopback = isLoopback(hostname);
  if (!loopback && (!process.env.PI_WEB_EXPECTED_HOST || !process.env.PI_WEB_EXPECTED_ORIGIN)) {
    throw new Error("non-loopback pi-web requires explicit PI_WEB_EXPECTED_HOST and PI_WEB_EXPECTED_ORIGIN before listen");
  }
  const host = process.env.PI_WEB_EXPECTED_HOST ?? formatHost(hostname, port);
  const origin = process.env.PI_WEB_EXPECTED_ORIGIN ?? `http://${host}`;
  if (!exactHost(host) || !exactOrigin(origin, host)) throw new Error("PI_WEB_EXPECTED_HOST and PI_WEB_EXPECTED_ORIGIN must be exact");
  const roots = canonicalRoots(process.env.PI_WEB_ALLOWED_ROOTS);
  const phrase = process.env.PI_WEB_PASSWORD;
  const phraseValid = typeof phrase === "string" && phrase.length >= 12 && phrase.length <= 1024 && !phrase.includes("\0");
  if (!loopback) {
    if (!phraseValid) throw new Error("non-loopback pi-web requires a valid PI_WEB_PASSWORD before listen");
    if (roots.length === 0) throw new Error("non-loopback pi-web requires canonical PI_WEB_ALLOWED_ROOTS before listen");
  } else if (phrase !== undefined && !phraseValid) {
    throw new Error("configured PI_WEB_PASSWORD is invalid");
  }
  return { host, origin, roots };
}

function exactHost(value) {
  const match = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\]):([0-9]{1,5})$/i.exec(value);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65535;
}

function exactOrigin(value, host) {
  return (value === `http://${host}` || value === `https://${host}`) && exactHost(host);
}

function canonicalRoots(value) {
  if (!value) return [];
  let roots;
  if (value.trim().startsWith("[")) {
    try { roots = JSON.parse(value); }
    catch { throw new Error("PI_WEB_ALLOWED_ROOTS must be a JSON array or path-delimited list"); }
  } else roots = value.split(delimiter).filter(Boolean);
  if (!Array.isArray(roots) || roots.some((item) => typeof item !== "string")) {
    throw new Error("PI_WEB_ALLOWED_ROOTS must contain only paths");
  }
  const output = [];
  for (const rootPath of roots) {
    if (!isAbsolute(rootPath) || rootPath.includes("\0")) throw new Error("PI_WEB_ALLOWED_ROOTS must contain absolute paths");
    let canonical;
    try {
      canonical = realpathSync(rootPath);
      if (!statSync(canonical).isDirectory()) throw new Error("not-directory");
    } catch {
      throw new Error("PI_WEB_ALLOWED_ROOTS contains a missing or non-directory root");
    }
    if (!output.includes(canonical)) output.push(canonical);
  }
  output.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  return output;
}

function assertCompatibleRuntime() {
  if (!supportedNode(process.versions.node)) throw new Error("pi-web requires Node.js 22.19.0 or newer");
  const require = createRequire(import.meta.url);
  for (const packageName of SUPPORTED_PI_PACKAGES) {
    let packagePath;
    try { packagePath = resolvePackageJson(require, packageName); }
    catch { throw new Error(`compatible ${packageName} host is missing`); }
    const value = readJson(packagePath, `installed ${packageName} manifest`);
    if (value.version !== SUPPORTED_PI_VERSION) throw new Error(`pi-web requires ${packageName}@${SUPPORTED_PI_VERSION}`);
  }
  const nextManifest = readJson(resolvePackageJson(require, "next"), "installed Next manifest");
  if (nextManifest.version !== "16.2.12") throw new Error("locked Next runtime version mismatch");
}

function supportedNode(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (!match) return false;
  const current = [Number(match[1]), Number(match[2]), Number(match[3])];
  const minimum = [22, 19, 0];
  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
}

function assertBuild(appRoot) {
  const buildId = resolve(appRoot, ".next", "BUILD_ID");
  const manifestPath = resolve(appRoot, "build-manifest.json");
  if (!regularFile(buildId) || readFileSync(buildId, "utf8").trim() === "") {
    throw new Error("packaged Pi Web build is missing; run npm run build:web before packaging");
  }
  if (!regularFile(manifestPath)) throw new Error("packaged Pi Web build manifest is missing");
  const manifest = readJson(manifestPath, "packaged Pi Web build manifest");
  if (manifest.schemaVersion !== 1 || manifest.source !== "upstream/pi-web-0.8.8"
    || manifest.sourceRevision !== SOURCE_REVISION || manifest.piVersion !== SUPPORTED_PI_VERSION) {
    throw new Error("packaged Pi Web build manifest is incompatible");
  }
}

function regularFile(path) {
  try {
    const info = lstatSync(path);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} is unreadable or malformed`); }
}

function resolvePackageJson(require, packageName) {
  let directory;
  try { directory = dirname(require.resolve(packageName)); }
  catch { directory = manualNodeModulesPackageDir(packageName); }
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(directory, "package.json");
    if (regularFile(candidate)) {
      const value = readJson(candidate, "installed package manifest");
      if (value.name === packageName) return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("installed package manifest is missing");
}

// ESM-only packages without a require export still own a readable manifest on
// disk; resolve it by walking node_modules upward from this launcher.
function manualNodeModulesPackageDir(packageName) {
  const segments = packageName.split("/");
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolve(directory, "node_modules", ...segments);
    if (regularFile(resolve(candidate, "package.json"))) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("installed package manifest is missing");
}

function runtimeIdentity() {
  if (!managed) return randomBytes(32);
  const value = Buffer.alloc(32);
  let offset = 0;
  while (offset < value.byteLength) {
    const count = readSync(3, value, offset, value.byteLength - offset, null);
    if (count === 0) break;
    offset += count;
  }
  if (offset !== 32 || value.every((byte) => byte === 0)) {
    value.fill(0);
    throw new Error("managed parent identity was rejected");
  }
  const trailing = Buffer.alloc(1);
  try {
    if (readSync(3, trailing, 0, 1, null) !== 0) {
      value.fill(0);
      throw new Error("managed parent identity was rejected");
    }
  } finally { trailing.fill(0); }
  return value;
}

function sendControl(message) {
  if (!managed) return true;
  try {
    writeSync(4, `${JSON.stringify(message)}\n`);
    return true;
  } catch {
    return false;
  }
}

function monitorParent(onDeath) {
  if (!managed) return undefined;
  // Node child "pipes" are socketpairs on Linux; read the inherited fd directly
  // because /proc/self/fd cannot reopen a socket.
  const stream = createReadStream("/proc/self/fd/5", { fd: 5 });
  stream.on("error", onDeath);
  stream.on("end", onDeath);
  stream.resume();
  return stream;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assertCompatibleRuntime();
  const policy = checkPrelisten(options.hostname, options.port);
  const appRoot = resolve(root, "dist", "web");
  assertBuild(appRoot);
  const require = createRequire(import.meta.url);
  const nextCli = resolve(dirname(resolvePackageJson(require, "next")), "dist", "bin", "next");
  if (!regularFile(nextCli)) throw new Error("locked Next runtime is missing");
  const identity = runtimeIdentity();

  const childEnvironment = { ...process.env };
  delete childEnvironment.PI_WEB_PASSWORD;
  const child = spawn(process.execPath, [nextCli, "start", "-H", options.hostname, "-p", options.port], {
    cwd: appRoot,
    env: {
      ...childEnvironment,
      PI_WEB_HOSTNAME: options.hostname,
      PORT: options.port,
      PI_WEB_EXPECTED_HOST: policy.host,
      PI_WEB_EXPECTED_ORIGIN: policy.origin,
      PI_WEB_ALLOWED_ROOTS: JSON.stringify(policy.roots),
      PI_WEB_CANONICAL_ALLOWED_ROOTS: JSON.stringify(policy.roots),
      ...(typeof process.env.PI_WEB_PASSWORD === "string" ? { PI_WEB_PASSWORD: process.env.PI_WEB_PASSWORD } : {}),
    },
    // fd3 carries the one-use identity, fd4 reverses Runtime readiness, and
    // fd5 makes the Next process observe launcher death. None is browser-visible.
    stdio: ["inherit", "pipe", "inherit", "pipe", "pipe", "pipe"],
    detached: false,
    shell: false,
  });
  const identityPipe = child.stdio[3];
  const runtimeControl = child.stdio[4];
  const childLiveness = child.stdio[5];
  if (!identityPipe || typeof identityPipe.write !== "function"
    || !runtimeControl || typeof runtimeControl.read !== "function"
    || !childLiveness || typeof childLiveness.write !== "function") {
    identity.fill(0);
    child.kill("SIGTERM");
    throw new Error("Next private runtime channels are unavailable");
  }
  const identityCopy = Buffer.from(identity);
  identity.fill(0);
  identityPipe.once("error", () => { identityCopy.fill(0); child.kill("SIGTERM"); });
  identityPipe.end(identityCopy, () => identityCopy.fill(0));

  let ready = false;
  let listenerReady = false;
  let runtimeReady = false;
  let runtimeFrame = "";
  let outputTail = "";
  let stopTimer;
  const signalHandlers = new Map();
  const requestStop = (signal = "SIGTERM") => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    if (!stopTimer) {
      stopTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }, STOP_TIMEOUT_MS);
      stopTimer.unref();
    }
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => requestStop(signal);
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
  const parentMonitor = monitorParent(() => requestStop("SIGTERM"));
  const announceReady = () => {
    if (ready || !listenerReady || !runtimeReady) return;
    ready = true;
    if (!sendControl({ schemaVersion: 1, status: "ready", address: policy.origin })) requestStop("SIGTERM");
    else if (!managed) process.stdout.write(`pi-web ready: ${policy.origin}\n`);
    if (options.open && !managed) openBrowser(policy.origin);
  };

  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    process.stdout.write(text);
    outputTail = `${outputTail}${text}`.slice(-8192);
    if (READY_PATTERN.test(outputTail)) {
      listenerReady = true;
      announceReady();
    }
  });
  runtimeControl.on("data", (chunk) => {
    if (runtimeReady) return requestStop("SIGTERM");
    runtimeFrame += String(chunk);
    if (runtimeFrame.length > 8192) return requestStop("SIGTERM");
    const newline = runtimeFrame.indexOf("\n");
    if (newline < 0) return;
    let message;
    try { message = JSON.parse(runtimeFrame.slice(0, newline)); }
    catch { requestStop("SIGTERM"); return; }
    if (runtimeFrame.slice(newline + 1).trim() !== "" || message?.schemaVersion !== 1 || message?.status !== "runtime-ready") {
      requestStop("SIGTERM");
      return;
    }
    runtimeReady = true;
    announceReady();
  });
  runtimeControl.on("error", () => requestStop("SIGTERM"));
  runtimeControl.on("end", () => requestStop("SIGTERM"));
  childLiveness.on("error", () => requestStop("SIGTERM"));

  childLiveness.write("owned\n");

  const result = await new Promise((resolveExit) => {
    child.once("error", (error) => {
      sendControl({ schemaVersion: 1, status: "failed", reason: redactedDiagnostic(error) });
      resolveExit({ code: 1, signal: null });
    });
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  }).finally(() => {
    if (stopTimer) clearTimeout(stopTimer);
    childLiveness.destroy();
    parentMonitor?.destroy();
    for (const [signal, handler] of signalHandlers) process.off(signal, handler);
  });
  if (!ready) sendControl({ schemaVersion: 1, status: "failed", reason: "child exited before readiness" });
  process.exitCode = result.code ?? (result.signal ? 1 : 0);
}

main().catch((error) => {
  const message = redactedDiagnostic(error);
  sendControl({ schemaVersion: 1, status: "failed", reason: message });
  process.stderr.write(`pi-web: ${message}\n`);
  process.exitCode = 1;
});

function redactedDiagnostic(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\b(authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi, "$1: [REDACTED]")
    .replace(/\b(password|passphrase|secret|token|api[-_]?key|bootstrap|credential)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_-]+/gi, "$1 [REDACTED]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240) || "startup failed";
}
