import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import registerCredentialGuard from "../../src/runtime/credential-guard.js";
import { protectSubagentParams, registerSubagent } from "../../src/runtime/subagents.js";

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  details: unknown;
  isError: boolean;
}

interface RegisteredTool {
  name: string;
  execute: (...args: unknown[]) => Promise<ToolResult>;
}

let scratch = "";
let previousPath: string | undefined;
const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout;
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "aili-generic-subagent-"));
  const bin = join(scratch, "bin");
  await mkdir(bin);
  const fakePi = join(bin, "pi");
  await writeFile(fakePi, "#!/bin/sh\ncase \"$*\" in\n  *force-worker-failure*) exit 7 ;;\n  *slow-worker*) sleep 2 ;;\nesac\nif [ -n \"${AILI_FAKE_PI_ARGS:-}\" ]; then printf '%s\\n' \"$@\" > \"$AILI_FAKE_PI_ARGS\"; fi\nif [ -n \"${AILI_FAKE_PI_MODE:-}\" ]; then printf '%s\\n' \"${PI_PERMISSION_MODE:-}\" > \"$AILI_FAKE_PI_MODE\"; fi\nprintf '%s\\n' '{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"generic fixture complete\"}]}]}'\n");
  await chmod(fakePi, 0o700);
  previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
});

afterEach(async () => {
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  await rm(scratch, { recursive: true, force: true });
});

async function genericTool(): Promise<RegisteredTool> {
  const tools: RegisteredTool[] = [];
  const pi = {
    registerTool(tool: RegisteredTool) { tools.push(tool); },
    registerCommand() {},
  } as never;
  await registerSubagent(pi);
  const tool = tools.find((candidate) => candidate.name === "subagent");
  if (!tool) throw new Error("generic subagent tool was not registered");
  return tool;
}

function payload(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe("generic subagent lifecycle with a disposable Pi fixture", () => {
  it("uses the compatible omitted-backend path and forwards the explicit parent permission mode", async () => {
    const modeLog = join(scratch, "child-mode.txt");
    const previousMode = process.env.PI_PERMISSION_MODE;
    const previousLog = process.env.AILI_FAKE_PI_MODE;
    process.env.PI_PERMISSION_MODE = "yolo";
    process.env.AILI_FAKE_PI_MODE = modeLog;
    try {
      const tool = await genericTool();
      const single = payload(await tool.execute("default-single", {
        task: "Complete the default fixture.",
        roleContext: "fixture",
        cwd: scratch,
        tools: [],
      }, undefined, undefined, { cwd: scratch }));
      expect(single).toMatchObject({ status: "completed", backend: "headless" });
      expect((await readFile(modeLog, "utf8")).trim()).toBe("yolo");

      const parallel = payload(await tool.execute("default-parallel", {
        mode: "parallel",
        cwd: scratch,
        concurrency: 2,
        tasks: [{ task: "one", tools: [] }, { task: "two", tools: [] }],
      }, undefined, undefined, { cwd: scratch }));
      expect(parallel).toMatchObject({ status: "completed", startedCount: 2 });
      expect((parallel.runs as Array<{ backend: string }>).map((run) => run.backend)).toEqual(["headless", "headless"]);
    } finally {
      if (previousMode === undefined) delete process.env.PI_PERMISSION_MODE;
      else process.env.PI_PERMISSION_MODE = previousMode;
      if (previousLog === undefined) delete process.env.AILI_FAKE_PI_MODE;
      else process.env.AILI_FAKE_PI_MODE = previousLog;
    }
  });

  it("returns an actionable validation failure for explicit inline without starting Pi", async () => {
    const argsLog = join(scratch, "must-not-exist.txt");
    const previousLog = process.env.AILI_FAKE_PI_ARGS;
    process.env.AILI_FAKE_PI_ARGS = argsLog;
    try {
      const tool = await genericTool();
      const result = await tool.execute("inline", {
        backend: "inline",
        task: "This must not start.",
      }, undefined, undefined, { cwd: scratch });
      expect(result.isError).toBe(true);
      expect(payload(result)).toMatchObject({
        status: "failed",
        failureKind: "validation",
        error: expect.stringMatching(/Pi 0\.81\.1.*headless/),
      });
      await expect(readFile(argsLog, "utf8")).rejects.toThrow();
    } finally {
      if (previousLog === undefined) delete process.env.AILI_FAKE_PI_ARGS;
      else process.env.AILI_FAKE_PI_ARGS = previousLog;
    }
  });

  it("keeps credential denial active for an async custom-extension run even when YOLO is selected", async () => {
    const previousMode = process.env.PI_PERMISSION_MODE;
    process.env.PI_PERMISSION_MODE = "yolo";
    try {
      const params = protectSubagentParams({
        task: "background credential fixture",
        roleContext: "fixture",
        async: true,
        extensions: ["/tmp/custom-extension.ts"],
      }) as { extensions: string[]; async: boolean };
      expect(params.async).toBe(true);
      expect(params.extensions).toEqual(expect.arrayContaining(["/tmp/custom-extension.ts", expect.stringContaining("credential-guard.ts")]));

      let handler: ((event: { toolName: string; input: unknown }) => Promise<{ block: boolean } | undefined>) | undefined;
      registerCredentialGuard({ on(event: string, callback: typeof handler) { if (event === "tool_call") handler = callback; } } as never);
      if (!handler) throw new Error("credential guard hook was not registered");
      await expect(handler({ toolName: "bash", input: { command: "bash -c 'cat .env'" } })).resolves.toEqual(expect.objectContaining({ block: true }));
    } finally {
      if (previousMode === undefined) delete process.env.PI_PERMISSION_MODE;
      else process.env.PI_PERMISSION_MODE = previousMode;
    }
  });

  it("keeps recursive subagent dispatch structurally excluded from workers", async () => {
    const argsLog = join(scratch, "child-args.txt");
    const previousLog = process.env.AILI_FAKE_PI_ARGS;
    process.env.AILI_FAKE_PI_ARGS = argsLog;
    try {
      const tool = await genericTool();
      const result = payload(await tool.execute("no-recursion", {
        backend: "headless",
        task: "Complete the recursion fixture.",
        roleContext: "fixture",
        cwd: scratch,
        tools: [],
      }, undefined, undefined, { cwd: scratch }));
      expect(result).toMatchObject({ status: "completed" });
      expect((await readFile(argsLog, "utf8")).split("\n")).toEqual(expect.arrayContaining(["--exclude-tools", "subagent"]));
    } finally {
      if (previousLog === undefined) delete process.env.AILI_FAKE_PI_ARGS;
      else process.env.AILI_FAKE_PI_ARGS = previousLog;
    }
  });

  it("accepts an external cwd, preserves a generic result, and forwards lifecycle actions without a new run", async () => {
    const tool = await genericTool();
    const external = join(scratch, "external-root");
    await mkdir(external);
    const run = payload(await tool.execute("run", {
      backend: "headless",
      task: "Complete the fixture task.",
      roleContext: "Be concise.",
      cwd: external,
      extensions: [],
      tools: [],
      captureToolCalls: true,
    }, undefined, undefined, { cwd: scratch }));
    expect(run).toMatchObject({ tool: "subagent", status: "completed", workspace: { cwd: external } });
    const runId = run.runId as string;
    expect(runId).toEqual(expect.any(String));

    for (const action of ["status", "logs", "wait", "mark-background", "reconcile"] as const) {
      const result = payload(await tool.execute(action, { action, runId, cwd: external }, undefined, undefined, { cwd: scratch }));
      expect(result).toMatchObject({ tool: "subagent", action });
    }
    const interrupted = payload(await tool.execute("interrupt", { action: "interrupt", runId, cwd: external, reason: "fixture" }, undefined, undefined, { cwd: scratch }));
    expect(interrupted).toMatchObject({ tool: "subagent", action: "interrupt" });
  });

  it("starts async work and waits for its durable terminal result", async () => {
    const tool = await genericTool();
    const started = payload(await tool.execute("async", {
      backend: "headless",
      task: "Complete asynchronously.",
      roleContext: "fixture",
      cwd: scratch,
      async: true,
    }, undefined, undefined, { cwd: scratch }));
    expect(started).toMatchObject({ tool: "subagent", status: "running" });
    const waited = payload(await tool.execute("wait", {
      action: "wait",
      runId: started.runId,
      cwd: scratch,
      timeoutMs: 5_000,
    }, undefined, undefined, { cwd: scratch }));
    expect(waited).toMatchObject({ tool: "subagent", action: "wait", status: "completed" });
  });

  it("loads optional AILI and non-AILI named agents without changing generic result semantics", async () => {
    const home = join(scratch, "home");
    await mkdir(join(home, ".pi", "agent", "agents", "aili"), { recursive: true });
    await copyFile(join(process.cwd(), "roles", "code-scout.md"), join(home, ".pi", "agent", "agents", "aili", "code-scout.md"));
    await writeFile(join(home, ".pi", "agent", "agents", "generic.md"), "---\nname: generic\ntools:\n  - read\n---\nGeneric fixture agent.\n");
    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const tool = await genericTool();
      for (const agent of ["aili.code-scout", "generic"]) {
        const result = payload(await tool.execute(agent, {
          backend: "headless",
          agent,
          agentScope: "global",
          task: "Complete the fixture task.",
          tools: [],
        }, undefined, undefined, { cwd: scratch }));
        expect(result).toMatchObject({ tool: "subagent", status: "completed" });
      }
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });

  it("fails an explicit worktree request loudly on a non-Git disposable root", async () => {
    const tool = await genericTool();
    const result = payload(await tool.execute("worktree", {
      backend: "headless",
      task: "This must not run in a shared fallback workspace.",
      roleContext: "fixture",
      cwd: scratch,
      worktree: true,
    }, undefined, undefined, { cwd: scratch }));
    expect(result).toMatchObject({ tool: "subagent", status: "failed" });
    expect(String(result.error)).toMatch(/git|worktree/i);
  });

  it("records either a deny-all sandbox result or a visible sandbox-unavailable degradation", async () => {
    const tool = await genericTool();
    const result = payload(await tool.execute("sandbox", {
      backend: "headless",
      task: "Complete the offline sandbox fixture.",
      roleContext: "fixture",
      cwd: scratch,
      sandbox: true,
    }, undefined, undefined, { cwd: scratch }));
    expect(result).toMatchObject({ tool: "subagent" });
    if (result.status === "completed") {
      expect(result).toMatchObject({ sandbox: { enabled: true } });
      expect((result.sandbox as { allowedDomains?: string[] }).allowedDomains ?? []).toEqual([]);
    } else {
      expect(result).toMatchObject({ status: "failed", failureKind: "sandbox" });
    }

    const disabledSandbox = payload(await tool.execute("sandbox-disabled", {
      backend: "headless",
      task: "Complete the sandbox-disabled fixture.",
      roleContext: "fixture",
      cwd: scratch,
      sandbox: false,
    }, undefined, undefined, { cwd: scratch }));
    expect(disabledSandbox).toMatchObject({ tool: "subagent", status: "completed", sandbox: { enabled: false } });

    const domainSandbox = payload(await tool.execute("sandbox-domain", {
      backend: "headless",
      task: "Complete the explicit-domain sandbox fixture.",
      roleContext: "fixture",
      cwd: scratch,
      sandbox: { allowedDomains: ["api.example.com"] },
    }, undefined, undefined, { cwd: scratch }));
    expect(domainSandbox).toMatchObject({
      tool: "subagent",
      status: "completed",
      sandbox: { enabled: true, allowedDomains: ["api.example.com"] },
    });

    const originalPath = process.env.PATH;
    process.env.PATH = join(scratch, "bin");
    try {
      const unavailable = payload(await tool.execute("sandbox-unavailable", {
        backend: "headless",
        task: "Report sandbox setup only.",
        roleContext: "fixture",
        cwd: scratch,
        sandbox: { allowedDomains: ["api.example.com"] },
      }, undefined, undefined, { cwd: scratch }));
      expect(unavailable).toMatchObject({ tool: "subagent", status: "failed", failureKind: "sandbox" });
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });

  it("creates and removes an explicit worktree in a disposable Git fixture", async () => {
    const repository = join(scratch, "worktree-repository");
    await mkdir(repository);
    await git(repository, ["init", "-q"]);
    await git(repository, ["config", "user.email", "fixture@example.test"]);
    await git(repository, ["config", "user.name", "Fixture"]);
    await git(repository, ["commit", "--allow-empty", "-qm", "fixture"]);

    const tool = await genericTool();
    const result = payload(await tool.execute("worktree", {
      backend: "headless",
      task: "Complete the disposable worktree fixture.",
      roleContext: "fixture",
      cwd: repository,
      worktree: true,
    }, undefined, undefined, { cwd: repository }));
    expect(result).toMatchObject({
      tool: "subagent",
      status: "completed",
      workspace: { mode: "worktree", worktreeCleanupStatus: "removed" },
    });
    expect(await git(repository, ["worktree", "list", "--porcelain"])).not.toContain(".pi-subagent-worktrees");
  });

  it("retains a failed worktree for inspection rather than silently cleaning it", async () => {
    const repository = join(scratch, "failed-worktree-repository");
    await mkdir(repository);
    await git(repository, ["init", "-q"]);
    await git(repository, ["config", "user.email", "fixture@example.test"]);
    await git(repository, ["config", "user.name", "Fixture"]);
    await git(repository, ["commit", "--allow-empty", "-qm", "fixture"]);
    const tool = await genericTool();
    const result = payload(await tool.execute("failed-worktree", {
      backend: "headless",
      task: "force-worker-failure",
      roleContext: "fixture",
      cwd: repository,
      worktree: true,
    }, undefined, undefined, { cwd: repository }));
    const workspace = result.workspace as { worktreePath?: string; worktreeCleanupStatus?: string };
    expect(result).toMatchObject({ tool: "subagent", status: "failed", workspace: { mode: "worktree", worktreeCleanupStatus: "kept" } });
    expect(workspace.worktreePath).toEqual(expect.any(String));
    try {
      expect(await git(repository, ["worktree", "list", "--porcelain"])).toContain(workspace.worktreePath!);
    } finally {
      await git(repository, ["worktree", "remove", "--force", workspace.worktreePath!]);
    }
  });

  it("fails fast and cancels/skips siblings without restoring the former two-child cap", async () => {
    const tool = await genericTool();
    const result = payload(await tool.execute("parallel-fail-fast", {
      backend: "headless",
      mode: "parallel",
      cwd: scratch,
      concurrency: 2,
      failFast: true,
      cancelSiblingsOnFailure: true,
      tasks: [
        { task: "force-worker-failure", roleContext: "fixture" },
        { task: "slow-worker", roleContext: "fixture" },
        { task: "must-not-start", roleContext: "fixture" },
      ],
    }, undefined, undefined, { cwd: scratch }));
    expect(result).toMatchObject({ tool: "subagent", mode: "parallel", status: "failed", failFastTriggered: true });
    expect(result.skippedCount).toBeGreaterThanOrEqual(1);
  });

  it("uses upstream parallel fan-out above the former AILI two-child cap", async () => {
    const tool = await genericTool();
    const result = payload(await tool.execute("parallel", {
      backend: "headless",
      mode: "parallel",
      cwd: scratch,
      concurrency: 3,
      tasks: [
        { task: "one", roleContext: "fixture", extensions: [] },
        { task: "two", roleContext: "fixture", extensions: [] },
        { task: "three", roleContext: "fixture", extensions: [] },
      ],
    }, undefined, undefined, { cwd: scratch }));
    expect(result).toMatchObject({ tool: "subagent", mode: "parallel", status: "completed", totalTasks: 3, concurrencyLimit: 3, startedCount: 3 });
  });
});
