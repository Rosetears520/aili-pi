import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { ensureWebChild, parseWebLaunchOptions, stopWebChild } from "../../extensions/web/index.js";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(".");
const LAUNCHER = join(ROOT, "bin", "pi-web.js");
const WEB_BUILD = join(ROOT, "dist", "web");
const READY_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 8_000;

const scratchRoots: string[] = [];

/** The packaged launcher refuses to start without its staged build; those runs stay in the unskipped web-build job. */
const webBuildStaged = existsSync(join(WEB_BUILD, ".next", "BUILD_ID")) && existsSync(join(WEB_BUILD, "build-manifest.json"));

interface Launch {
  root: string;
  port: number;
  baseUrl: string;
  child: ReturnType<typeof spawn>;
}

async function freePort(): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const port = await new Promise<number>((resolvePort, rejectPort) => {
      const server = createServer();
      server.once("error", rejectPort);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => resolvePort(typeof address === "object" && address ? address.port : 0));
      });
    });
    if (port > 0) return port;
  }
  throw new Error("no disposable web port is available");
}

async function launch(options: { seedAllowedRoot?: boolean } = {}): Promise<Launch> {
  const root = await mkdtemp(join(tmpdir(), "aili-web-lifecycle-"));
  scratchRoots.push(root);
  const home = join(root, "home");
  const sessions = join(home, "sessions");
  const project = join(root, "project");
  await Promise.all([mkdir(sessions, { recursive: true }), mkdir(project, { recursive: true })]);
  const sessionDir = join(root, "session");
  await mkdir(sessionDir, { recursive: true });
  const fixture = SessionManager.create(project, sessionDir);
  fixture.appendSessionInfo("foreground lifecycle fixture");
  fixture.appendMessage({ role: "user", content: [{ type: "text", text: "lifecycle probe" }], timestamp: Date.now() });
  // SessionManager flushes its buffered entries only once an assistant message
  // arrives, so the fixture needs both sides to exist on disk.
  fixture.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "fixture acknowledged" }],
    api: "anthropic",
    provider: "anthropic",
    model: "fixture-model",
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: Date.now(),
  });
  await writeFile(join(project, "note.txt"), "fixture project file\n", { encoding: "utf8" });

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [LAUNCHER, "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOME: home,
      PI_CODING_AGENT_SESSION_DIR: sessionDir,
      ...(options.seedAllowedRoot ? { PI_WEB_ALLOWED_ROOTS: project } : {}),
      no_proxy: "127.0.0.1,localhost",
      NO_PROXY: "127.0.0.1,localhost",
      http_proxy: "",
      https_proxy: "",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
    },
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => { output += String(chunk); });
  child.stderr?.on("data", (chunk: Buffer) => { output += String(chunk); });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`pi-web exited before readiness (code=${child.exitCode}); output: ${output.slice(-2_000)}`);
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error(`pi-web did not become ready in ${READY_TIMEOUT_MS}ms; output: ${output.slice(-2_000)}`);
    }
    if (output.includes(`pi-web ready: ${baseUrl}`)) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  return { root, port, baseUrl, child };
}

async function stop(launchResult: Launch): Promise<void> {
  const { child, port, root } = launchResult;
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise<void>((resolveStop, rejectStop) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); }, STOP_TIMEOUT_MS);
      child.once("exit", () => { clearTimeout(timer); resolveStop(); });
    });
  }
  // No orphan listener survives the foreground launcher.
  await expectPortClosed(port, root);
}

async function expectPortClosed(port: number, root: string): Promise<void> {
  let closed = false;
  for (let attempt = 0; !closed && attempt < 20; attempt += 1) {
    closed = await new Promise<boolean>((resolveClosed) => {
      const probe = createServer();
      const timer = setTimeout(() => { probe.close(); resolveClosed(false); }, 2_000);
      probe.once("error", () => { clearTimeout(timer); resolveClosed(false); });
      probe.listen(port, "127.0.0.1", () => {
        clearTimeout(timer);
        probe.close(() => resolveClosed(true));
      });
    });
    if (!closed) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  expect(closed, `the pi-web port ${port} must be free after shutdown (${root})`).toBe(true);
}

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("pi-web foreground process lifecycle", () => {
  it.skipIf(!webBuildStaged)("serves the staged workbench, exchanges one loopback bootstrap, and stops with its child", { timeout: 90_000 }, async () => {
    const running = await launch();
    try {
      const page = await fetch(running.baseUrl, { redirect: "manual" });
      expect(page.status).toBe(200);
      expect(page.headers.get("x-content-type-options")).toBe("nosniff");

      // Loopback reads are policy-exempt; cross-site reads stay denied.
      const unauthenticated = await fetch(`${running.baseUrl}/api/runtime/v1/workbench/catalog`, {
        headers: { Origin: running.baseUrl },
      });
      expect(unauthenticated.status).toBe(200);
      const crossSite = await fetch(`${running.baseUrl}/api/runtime/v1/workbench/catalog`, {
        headers: { Origin: "http://evil.example" },
      });
      // Denied either by the upstream proxy middleware (403) or the BFF (401).
      expect([401, 403]).toContain(crossSite.status);

      const bootstrap = await fetch(`${running.baseUrl}/api/runtime/v1/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: running.baseUrl },
        body: "{}",
      });
      expect(bootstrap.status).toBe(200);
      const cookie = bootstrap.headers.get("set-cookie") ?? "";
      expect(cookie).toContain("aili_web_session=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");

      const replay = await fetch(`${running.baseUrl}/api/runtime/v1/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: running.baseUrl },
        body: "{}",
      });
      // Loopback re-arms a fresh one-use exchange for the next same-site
      // browser instead of dead-ending it; each exchange is still one-use.
      expect(replay.status).toBe(200);

      const catalog = await fetch(`${running.baseUrl}/api/runtime/v1/workbench/catalog`, {
        headers: { Cookie: cookie.split(";")[0] },
      });
      expect(catalog.status).toBe(200);
      const body = await catalog.json() as { projects: Array<{ sessions: Array<{ name: string; capabilitiesNeverLeakPaths?: never }> }> };
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0]?.sessions[0]?.name).toBe("foreground lifecycle fixture");
      expect(JSON.stringify(body)).not.toContain("aili-web-lifecycle-");

      const stream = await fetch(`${running.baseUrl}/api/runtime/v1/sessions/${await firstHandle(running.baseUrl, cookie.split(";")[0]!)}/stream`, {
        headers: { Cookie: cookie.split(";")[0] },
      });
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      const reader = stream.body?.getReader();
      expect(reader).toBeDefined();
      const firstChunk = new TextDecoder().decode((await reader!.read()).value ?? new Uint8Array());
      expect(firstChunk).toContain("event: snapshot");
      await reader!.cancel();
    } finally {
      await stop(running);
    }
  });

  it.skipIf(!webBuildStaged)("unlocks mutation capabilities only when a canonical allowed root covers the session project", { timeout: 90_000 }, async () => {
    const readOnly = await launch();
    let readOnlyCapabilities: Record<string, unknown>;
    try {
      const { cookie, handle } = await authenticate(readOnly);
      readOnlyCapabilities = await capabilitiesOf(readOnly.baseUrl, cookie, handle);
    } finally {
      await stop(readOnly);
    }
    expect(readOnlyCapabilities["session.observe"]).toBe(true);
    expect(readOnlyCapabilities["pi.send"]).not.toBe(true);

    const writable = await launch({ seedAllowedRoot: true });
    try {
      const { cookie, handle } = await authenticate(writable);
      const writableCapabilities = await capabilitiesOf(writable.baseUrl, cookie, handle);
      expect(writableCapabilities["pi.send"]).toBe(true);
      expect(writableCapabilities["pi.steer"]).toBe(true);
      expect(writableCapabilities["pi.compact"]).toBe(true);
    } finally {
      await stop(writable);
    }
  });
  it.skipIf(!webBuildStaged)("manages the /web command's child: identity stays out of argv and readiness returns on the private channel", { timeout: 90_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "aili-web-managed-"));
    scratchRoots.push(root);
    const sessionDir = join(root, "session");
    const project = join(root, "project");
    await Promise.all([mkdir(sessionDir, { recursive: true }), mkdir(project, { recursive: true })]);
    const port = await freePort();
    const previous = { ...process.env };
    try {
      process.env.HOME = join(root, "home");
      await mkdir(process.env.HOME, { recursive: true });
      process.env.PI_CODING_AGENT_SESSION_DIR = sessionDir;
      const options = parseWebLaunchOptions(`--port ${port}`);
      const address = await ensureWebChild(options);
      expect(address).toBe(options.expectedAddress);
      const page = await fetch(address, { redirect: "manual" });
      expect(page.status).toBe(200);
      await stopWebChild();
      await expectPortClosed(port, root);
      // A stopped managed child is replaced, not reused.
      const restarted = await ensureWebChild(parseWebLaunchOptions(`--port ${port}`));
      expect(restarted).toBe(address);
      await stopWebChild();
      await expectPortClosed(port, root);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

async function authenticate(running: Launch): Promise<{ cookie: string; handle: string }> {
  const bootstrap = await fetch(`${running.baseUrl}/api/runtime/v1/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: running.baseUrl },
    body: "{}",
  });
  expect(bootstrap.status).toBe(200);
  const cookie = (bootstrap.headers.get("set-cookie") ?? "").split(";")[0]!;
  const handle = await firstHandle(running.baseUrl, cookie);
  return { cookie, handle };
}

async function firstHandle(baseUrl: string, cookie: string): Promise<string> {
  const catalog = await fetch(`${baseUrl}/api/runtime/v1/workbench/catalog`, { headers: { Cookie: cookie } });
  const body = await catalog.json() as { projects: Array<{ sessions: Array<{ handle: string }> }> };
  const handle = body.projects[0]?.sessions[0]?.handle;
  if (!handle) throw new Error("the lifecycle fixture session is missing from the workbench catalog");
  return handle;
}

async function capabilitiesOf(baseUrl: string, cookie: string, handle: string): Promise<Record<string, unknown>> {
  const connect = await fetch(`${baseUrl}/api/runtime/v1/sessions/${handle}/connect`, { headers: { Cookie: cookie } });
  const body = await connect.json() as { snapshot: { capabilities: Record<string, unknown> } };
  return body.snapshot.capabilities;
}
