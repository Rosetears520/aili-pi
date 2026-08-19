import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scratchRoot = resolve(".tmp");
let scratch = "";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout;
}

function fixtureTool(name: string) {
  return {
    name,
    label: name,
    description: `${name} host-seam fixture`,
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: "text" as const, text: name }], details: {} };
    },
  };
}

beforeEach(async () => {
  await mkdir(scratchRoot, { recursive: true });
  scratch = await mkdtemp(join(scratchRoot, "persistent-agent-host-seams-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("official Pi 0.84.2 persistent Agent host seams", () => {
  it("creates and reopens a parent-scoped child Session JSONL without a model call", async () => {
    const cwd = join(scratch, "project");
    const sessionDir = join(scratch, "sessions");
    const parent = SessionManager.create(cwd, sessionDir, { id: "parent" });
    parent.appendCustomMessageEntry("fixture.parent", "parent", false);
    const parentFile = parent.getSessionFile();
    expect(parentFile).toBeTruthy();

    const childDir = join(parentFile!.slice(0, -".jsonl".length), "aili-agents", "agents");
    await mkdir(childDir, { recursive: true });
    const child = SessionManager.create(cwd, childDir, {
      id: "Scout",
      parentSession: parentFile,
    });
    child.appendCustomMessageEntry("fixture.child", "child-state", false, { turn: 1 });
    child.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "persist child session" }],
      timestamp: Date.now(),
      api: "fixture",
      provider: "fixture",
      model: "fixture",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
    } as never);
    const childFile = child.getSessionFile();

    expect(childFile).toBeTruthy();
    expect(childFile!.startsWith(childDir)).toBe(true);
    expect(existsSync(childFile!)).toBe(true);
    expect(child.getHeader()).toMatchObject({ id: "Scout", parentSession: parentFile });

    const reopened = SessionManager.open(childFile!, childDir);
    expect(reopened.getHeader()).toMatchObject({ id: "Scout", parentSession: parentFile });
    expect(reopened.getEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "custom_message",
        customType: "fixture.child",
        details: { turn: 1 },
      }),
      expect.objectContaining({ type: "message", message: expect.objectContaining({ role: "assistant" }) }),
    ]));
  });

  it("filters the top-level coordinator and rebuilds a loadable child custom tool", async () => {
    const cwd = join(scratch, "project");
    const agentDir = join(scratch, "agent-home");
    await mkdir(cwd, { recursive: true });
    await mkdir(agentDir, { recursive: true });

    const topCoordinator: ExtensionFactory = (pi) => {
      pi.registerTool(fixtureTool("top_coordinator_tool"));
    };
    const childBridge: ExtensionFactory = (pi) => {
      pi.registerTool(fixtureTool("child_bridge_tool"));
    };
    const settings = SettingsManager.inMemory({}, { projectTrusted: true });
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: settings,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [
        { name: "top-coordinator", factory: topCoordinator, hidden: true },
        { name: "child-bridge", factory: childBridge, hidden: true },
      ],
      extensionsOverride: (base) => ({
        ...base,
        extensions: base.extensions.filter((extension) => extension.path !== "<inline:top-coordinator>"),
      }),
    });
    await loader.reload();

    expect(loader.getExtensions().extensions.map((extension) => extension.path)).toEqual(["<inline:child-bridge>"]);

    const { session } = await createAgentSession({
      cwd,
      agentDir,
      resourceLoader: loader,
      settingsManager: settings,
      sessionManager: SessionManager.inMemory(cwd),
      tools: ["child_bridge_tool"],
    });
    try {
      expect(session.getActiveToolNames()).toEqual(["child_bridge_tool"]);
      expect(session.getToolDefinition("child_bridge_tool")).toBeDefined();
      expect(session.getToolDefinition("top_coordinator_tool")).toBeUndefined();
    } finally {
      session.dispose();
    }
  });

  it("allows a child-only tool_call handler to await an external parent decision", async () => {
    let settleDecision: ((allowed: boolean) => void) | undefined;
    const decision = new Promise<boolean>((resolveDecision) => {
      settleDecision = resolveDecision;
    });
    const childPolicy: ExtensionFactory = (pi) => {
      pi.on("tool_call", async (event) => {
        if (event.toolName !== "write") return;
        return (await decision) ? undefined : { block: true, reason: "parent denied" };
      });
    };
    const loader = new DefaultResourceLoader({
      cwd: scratch,
      agentDir: join(scratch, "agent-home"),
      settingsManager: SettingsManager.inMemory({}, { projectTrusted: true }),
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [{ name: "child-policy", factory: childPolicy, hidden: true }],
    });
    await loader.reload();
    const extension = loader.getExtensions().extensions[0];
    const handler = extension?.handlers.get("tool_call")?.[0];
    expect(handler).toBeDefined();

    let settled = false;
    const pending = handler!(
      { type: "tool_call", toolCallId: "call-1", toolName: "write", input: { path: "safe.txt" } },
      {},
    ).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    settleDecision!(false);
    await expect(pending).resolves.toEqual({ block: true, reason: "parent denied" });
  });

  it("forks the parent JSONL without copying its Agent sidecar", async () => {
    const cwd = join(scratch, "project");
    const sessionDir = join(scratch, "sessions");
    const parent = SessionManager.create(cwd, sessionDir, { id: "parent" });
    const leafId = parent.appendCustomMessageEntry("fixture.parent", "fork-point", false);
    const parentFile = parent.getSessionFile()!;
    const oldSidecar = join(parentFile.slice(0, -".jsonl".length), "aili-agents");
    const marker = join(oldSidecar, "coordinator.jsonl");
    await mkdir(oldSidecar, { recursive: true });
    await writeFile(marker, "fixture\n");

    const forkFile = parent.createBranchedSession(leafId);
    expect(forkFile).toBeTruthy();
    const forkSidecar = join(forkFile!.slice(0, -".jsonl".length), "aili-agents");
    expect(forkFile).not.toBe(parentFile);
    expect(existsSync(forkSidecar)).toBe(false);
  });

  it("projects a dirty baseline into a disposable Git worktree and captures changes", async () => {
    const repo = join(scratch, "repo");
    const isolated = join(scratch, "isolated");
    await mkdir(repo, { recursive: true });
    await git(repo, ["init", "-q"]);
    await git(repo, ["config", "user.name", "AILI Fixture"]);
    await git(repo, ["config", "user.email", "fixture@example.invalid"]);
    await writeFile(join(repo, "tracked.txt"), "base\n");
    await git(repo, ["add", "tracked.txt"]);
    await git(repo, ["commit", "-qm", "fixture baseline"]);

    await writeFile(join(repo, "tracked.txt"), "dirty baseline\n");
    const baselinePatch = await git(repo, ["diff", "--binary", "HEAD", "--", "tracked.txt"]);
    const patchFile = join(scratch, "baseline.patch");
    await writeFile(patchFile, baselinePatch);

    await git(repo, ["worktree", "add", "--detach", isolated, "HEAD"]);
    try {
      await git(isolated, ["apply", "--whitespace=nowarn", patchFile]);
      expect(await readFile(join(isolated, "tracked.txt"), "utf8")).toBe("dirty baseline\n");

      await writeFile(join(isolated, "tracked.txt"), "child result\n");
      const resultPatch = await git(isolated, ["diff", "--binary", "HEAD", "--", "tracked.txt"]);
      expect(resultPatch).toContain("+child result");
      expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe("dirty baseline\n");
    } finally {
      await git(repo, ["worktree", "remove", "--force", isolated]);
    }
    expect(existsSync(isolated)).toBe(false);
  });

  it("binds host seam evidence to the installed and declared Pi 0.84.1 baseline", async () => {
    const projectPackage = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    const installedPackage = JSON.parse(
      await readFile(resolve("node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"),
    ) as { version: string };

    expect(projectPackage.devDependencies["@earendil-works/pi-coding-agent"]).toBe("0.84.2");
    expect(installedPackage.version).toBe("0.84.2");
  });
});
