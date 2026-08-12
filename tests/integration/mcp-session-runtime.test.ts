import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { createAiliMcpExtension, resolveSharedMcpConfigPath } from "../../src/runtime/mcp.js";

let scratch = "";

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

async function session(name: string, configPath: string) {
  const cwd = resolve(scratch, name);
  const agentDir = resolve(scratch, "agent");
  await Promise.all([mkdir(cwd, { recursive: true }), mkdir(agentDir, { recursive: true })]);
  const extension: ExtensionFactory = createAiliMcpExtension({ configPath });
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
    extensionFactories: [{ name: `mcp-${name}`, factory: extension, hidden: true }],
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  const created = await createAgentSession({
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: settings,
    resourceLoader: loader,
    tools: ["mcp", "mcpScript"],
  });
  await created.session.bindExtensions({ mode: "print" });
  return { ...created, loader };
}

describe("session-owned MCP adapter composition", () => {
  it("creates isolated Parent/Worker extension runtimes with one shared path and no ambient extensions", async () => {
    scratch = await mkdtemp(resolve(".tmp/mcp-session-runtime-"));
    const configPath = resolveSharedMcpConfigPath({ HOME: resolve(scratch, "home") });
    const [parent, workerA, workerB] = await Promise.all([
      session("parent", configPath), session("worker-a", configPath), session("worker-b", configPath),
    ]);
    expect(new Set([parent.session, workerA.session, workerB.session]).size).toBe(3);
    for (const runtime of [parent, workerA, workerB]) {
      expect(runtime.session.getActiveToolNames()).toEqual(expect.arrayContaining(["mcp", "mcpScript"]));
      expect(runtime.loader.getExtensions().extensions).toHaveLength(1);
      expect(runtime.loader.getExtensions().extensions[0]?.path).toMatch(/^<inline:mcp-/);
    }

    workerA.session.dispose();
    expect(parent.session.getActiveToolNames()).toContain("mcp");
    expect(workerB.session.getActiveToolNames()).toContain("mcp");
    parent.session.dispose();
    workerB.session.dispose();
  });

  it("does not connect or start a process for an empty lazy configuration during inspection", async () => {
    scratch = await mkdtemp(resolve(".tmp/mcp-session-lazy-"));
    const runtime = await session("lazy", resolve(scratch, "missing", "mcp.json"));
    const mcp = runtime.session.getToolDefinition("mcp")!;
    const result = await mcp.execute("status", {}, undefined, undefined, {
      mode: "print", hasUI: false, cwd: resolve(scratch, "lazy"),
    } as never);
    expect(result.details).toMatchObject({ mode: "status", connectedCount: 0 });
    expect((result.details as { servers: Array<{ status: string }> }).servers.every((server) => server.status !== "connected")).toBe(true);
    runtime.session.dispose();
  });
});
