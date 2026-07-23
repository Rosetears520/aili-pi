import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fitAggregate, runAiliTask, subagentSemaphore, type AiliTaskResult, type RunOptions } from "../../src/runtime/subagents.js";

const ROOT = resolve(import.meta.dirname, "../..");
let scratch = "";

beforeEach(async () => {
  await mkdir(join(ROOT, ".tmp"), { recursive: true });
  scratch = await mkdtemp(join(ROOT, ".tmp/subagents-"));
  await mkdir(join(scratch, "src"));
  await writeFile(join(scratch, "package.json"), "{}\n");
  subagentSemaphore.active = 0;
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
  subagentSemaphore.active = 0;
});

function resultOutput(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    status: "completed",
    summary: "completed by fixture",
    evidence: ["fixture"],
    changedFiles: [],
    verification: ["unit"],
    blockers: [],
    risks: [],
    confidence: "HIGH",
    ...overrides,
  });
}

function options(output = resultOutput(), inspect?: (input: Record<string, unknown>) => Promise<void> | void): RunOptions {
  return {
    parentTools: ["read", "grep", "find", "ls", "write", "edit", "bash"],
    run: async (input) => {
      await inspect?.(input);
      const path = join(scratch, `output-${Math.random()}.json`);
      await writeFile(path, output);
      return { runId: `run-${Math.random()}`, backend: "headless", cwd: scratch, status: "completed", failureKind: null, artifacts: [{ type: "output", path }] };
    },
  };
}

describe("Pi-subagent AILI policy adapter", () => {
  it("projects the global role, tool intersection, safe child extensions, and excluded lifecycle options", async () => {
    const result = await runAiliTask({ role: "code-scout", task: "read package", tools: ["read"], paths: ["package.json"] }, scratch, undefined, undefined, options(undefined, async (input) => {
      expect(input).toMatchObject({
        backend: "headless",
        mode: "single",
        agent: "aili.code-scout",
        agentScope: "global",
        confirmProjectAgents: false,
        tools: ["read"],
        workspace: "shared",
        worktreePolicy: "never",
        async: false,
        onComplete: "return",
        sandbox: false,
        runsDir: ".tmp/aili-subagent-runs",
      });
      const extensions = input.extensions as string[];
      expect(extensions).toHaveLength(2);
      expect(extensions[0]).toContain("pi-permission-modes/src/index.ts");
      const wrapper = await readFile(extensions[1]!, "utf8");
      expect(wrapper).toContain("AILI_CHILD_POLICY_FILE");
      expect(wrapper).toContain("child-guard.ts");
    }));
    expect(result).toEqual(expect.objectContaining({ status: "completed", confidence: "HIGH", evidence: ["fixture"] }));
  });

  it("rejects stale, recursive, background, worktree, credential, and unbounded-write requests before dispatch", async () => {
    const invalid = [
      { taskId: "old" },
      { resume: true },
      { chain: true },
      { background: true },
      { worktree: true },
    ];
    for (const extra of invalid) {
      const result = await runAiliTask({ role: "code-scout", task: "read", ...extra }, scratch, undefined, undefined, options());
      expect(result.status).toBe("rejected");
    }
    expect((await runAiliTask({ role: "code-scout", task: "token=sk-seeded-secret" }, scratch, undefined, undefined, options())).status).toBe("rejected");
    expect((await runAiliTask({ role: "implementer", task: "write", paths: [] }, scratch, undefined, undefined, options())).status).toBe("rejected");
  });

  it("rejects a third active request and releases capacity after two runs", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolvePromise) => { release = resolvePromise; });
    const heldOptions: RunOptions = {
      parentTools: ["read"],
      run: async () => {
        await held;
        const path = join(scratch, `output-${Math.random()}.json`);
        await writeFile(path, resultOutput());
        return { runId: `run-${Math.random()}`, backend: "headless", cwd: scratch, status: "completed", failureKind: null, artifacts: [{ type: "output", path }] };
      },
    };
    const first = runAiliTask({ role: "code-scout", task: "one" }, scratch, undefined, undefined, heldOptions);
    const second = runAiliTask({ role: "code-scout", task: "two" }, scratch, undefined, undefined, heldOptions);
    try {
      const deadline = Date.now() + 2_000;
      while (subagentSemaphore.active !== 2 && Date.now() < deadline) await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      expect(subagentSemaphore.active).toBe(2);
      const third = await runAiliTask({ role: "code-scout", task: "three" }, scratch, undefined, undefined, heldOptions);
      expect(third).toEqual(expect.objectContaining({ status: "rejected", summary: expect.stringContaining("capacity") }));
    } finally {
      release();
      await Promise.all([first, second]);
    }
    expect(subagentSemaphore.active).toBe(0);
  });

  it("fails closed when upstream output is malformed, oversized, cancelled, or failed", async () => {
    expect((await runAiliTask({ role: "code-scout", task: "bad" }, scratch, undefined, undefined, options("not json"))).status).toBe("protocol_error");
    expect((await runAiliTask({ role: "code-scout", task: "large" }, scratch, undefined, undefined, options("x".repeat(51 * 1024)))).status).toBe("protocol_error");
    const cancelled = await runAiliTask({ role: "code-scout", task: "cancel" }, scratch, undefined, undefined, {
      parentTools: ["read"],
      run: async () => ({ runId: "cancel", backend: "headless", cwd: scratch, status: "cancelled", failureKind: "abort", artifacts: [] }),
    });
    expect(cancelled).toEqual(expect.objectContaining({ status: "cancelled", blockers: ["failureKind=abort"] }));
  });

  it("normalizes observed model output aliases without weakening the structured contract", async () => {
    const observed = resultOutput({
      status: "success",
      evidence: [{ path: "package.json", line: 2, anchor: "name" }],
      verification: "Read package.json only.",
      confidence: "high",
    });
    const result = await runAiliTask({ role: "code-scout", task: "observed" }, scratch, undefined, undefined, options(observed));
    expect(result).toEqual(expect.objectContaining({ status: "completed", confidence: "HIGH", verification: ["Read package.json only."] }));
    expect(result.evidence).toEqual([JSON.stringify({ anchor: "name", line: "2", path: "package.json" })]);
  });

  it("uses the pinned Pi-subagent API with disposable global roles and a fake Pi binary", async () => {
    const home = join(scratch, "home");
    const bin = join(scratch, "bin");
    const argsLog = join(scratch, "pi-args.json");
    await mkdir(join(home, ".pi", "agent", "agents", "aili"), { recursive: true });
    await mkdir(bin);
    await copyFile(join(ROOT, "roles", "code-scout.md"), join(home, ".pi", "agent", "agents", "aili", "code-scout.md"));
    const fakePi = join(bin, "pi");
    await writeFile(fakePi, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.AILI_FAKE_PI_ARGS, JSON.stringify(process.argv.slice(2)));\nconsole.log(JSON.stringify({ type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'text', text: ${JSON.stringify(resultOutput())} }] }] }));\n`);
    await chmod(fakePi, 0o700);
    const previousHome = process.env.HOME;
    const previousPath = process.env.PATH;
    const previousLog = process.env.AILI_FAKE_PI_ARGS;
    process.env.HOME = home;
    process.env.PATH = `${bin}:${previousPath}`;
    process.env.AILI_FAKE_PI_ARGS = argsLog;
    try {
      const result = await runAiliTask({ role: "code-scout", task: "read package", paths: ["package.json"] }, scratch, undefined, undefined, { parentTools: ["read"] });
      expect(result).toEqual(expect.objectContaining({ status: "completed", confidence: "HIGH", metadata: expect.objectContaining({ backend: "headless", artifacts: expect.any(Number) }) }));
      const args = JSON.parse(await readFile(argsLog, "utf8")) as string[];
      expect(args).toEqual(expect.arrayContaining(["--mode", "json", "--no-session", "--exclude-tools", "subagent", "--tools", "read"]));
      expect(args.some((value) => value.includes("pi-permission-modes/src/index.ts"))).toBe(true);
      expect(args.some((value) => value.endsWith("child-policy.ts"))).toBe(true);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousLog === undefined) delete process.env.AILI_FAKE_PI_ARGS;
      else process.env.AILI_FAKE_PI_ARGS = previousLog;
    }
  });

  it("propagates AbortSignal cancellation through the pinned Pi-subagent process lifecycle", async () => {
    const home = join(scratch, "cancel-home");
    const bin = join(scratch, "cancel-bin");
    await mkdir(join(home, ".pi", "agent", "agents", "aili"), { recursive: true });
    await mkdir(bin);
    await copyFile(join(ROOT, "roles", "code-scout.md"), join(home, ".pi", "agent", "agents", "aili", "code-scout.md"));
    const fakePi = join(bin, "pi");
    await writeFile(fakePi, "#!/usr/bin/env node\nsetInterval(() => undefined, 1_000);\n");
    await chmod(fakePi, 0o700);
    const previousHome = process.env.HOME;
    const previousPath = process.env.PATH;
    process.env.HOME = home;
    process.env.PATH = `${bin}:${previousPath}`;
    try {
      const controller = new AbortController();
      const running = runAiliTask({ role: "code-scout", task: "read package", paths: ["package.json"] }, scratch, controller.signal, undefined, { parentTools: ["read"] });
      setTimeout(() => controller.abort(), 50);
      expect(await running).toEqual(expect.objectContaining({ status: "cancelled", metadata: expect.objectContaining({ backend: "headless" }) }));
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  it("caps aggregate model-visible results", () => {
    const make = (id: string): AiliTaskResult => ({ taskId: id, role: "code-scout", status: "completed", summary: "ok", evidence: ["x".repeat(49 * 1024)], changedFiles: [], verification: [], blockers: [], risks: [], confidence: "HIGH", metadata: { truncated: false, active: "0/2" } });
    const fitted = fitAggregate([make("one"), make("two")]);
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(50 * 1024);
    expect(fitted.every((result) => result.status === "protocol_error" && result.metadata.truncated)).toBe(true);
  });
});
