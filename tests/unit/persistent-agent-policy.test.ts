import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SessionManager, type ExtensionAPI, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRoleProfiles, type RoleProfile } from "../../src/runtime/roles.js";
import {
  assembleChildPrompt,
  computeEffectiveTools,
  evaluateSpawn,
  TurnBoundaryPolicyManager,
  type ParentToolSnapshot,
} from "../../src/runtime/persistent-agents/policy.js";
import {
  createChildApprovalBridge,
  createChildResourceLoader,
  createPersistentChildSession,
} from "../../src/runtime/persistent-agents/session-factory.js";

let scratch = "";

function tool(name: string): ToolDefinition {
  return {
    name,
    label: name,
    description: `${name} fixture`,
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: "text" as const, text: name }], details: {} };
    },
  };
}

function parent(active: string[], definitions: ToolDefinition[] = []): ParentToolSnapshot {
  return { active, definitions: new Map(definitions.map((definition) => [definition.name, definition])) };
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-policy-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("persistent child prompt and policy assembly", () => {
  it("assembles only explicit task/context and trusted resources without parent conversation copying", async () => {
    const role = (await loadRoleProfiles()).find((candidate) => candidate.selector === "general")!;
    const prompt = assembleChildPrompt({
      runtimeEnvelope: "permission and messaging envelope",
      role,
      task: "Inspect the focused module",
      context: "Only this explicit context is shared",
      cwd: "/project",
      workspace: { mode: "shared", root: "/project", diagnostic: "best-effort undeclared writes" },
      resources: [
        { kind: "rule", path: "AGENTS.md", content: "trusted project rules", trusted: true },
        { kind: "context", path: "SECRET-NOTES.md", content: "untrusted hidden parent fact", trusted: false },
      ],
      approvedPlanRef: "plan://accepted/1",
      sharedRefs: ["agent://Earlier"],
    });

    expect(prompt.systemPrompt).toContain(role.prompt);
    expect(prompt.systemPrompt).toContain("trusted project rules");
    expect(prompt.systemPrompt).not.toContain("untrusted hidden parent fact");
    expect(prompt.systemPrompt).toContain("parent conversation is not part");
    expect(prompt.initialMessage).toContain("Inspect the focused module");
    expect(prompt.initialMessage).toContain("Only this explicit context is shared");
    expect(prompt.initialMessage).toContain("plan://accepted/1");
    expect(prompt.includedResources).toEqual([{ kind: "rule", path: "AGENTS.md" }]);
    expect(prompt.diagnostics).toEqual(["context:SECRET-NOTES.md: excluded because project/resource trust is inactive"]);
  });

  it("intersects parent active, child loadable, role, hard guard, call narrowing, and spawn policy", async () => {
    const roles = await loadRoleProfiles();
    const general = roles.find((role) => role.selector === "general")!;
    const scout = roles.find((role) => role.selector === "aili.code-scout")!;
    const taskTool = tool("task");
    const webTool = tool("web_search");
    const snapshot = parent(["read", "write", "task", "web_search", "subagent", "missing"], [taskTool, webTool, tool("subagent")]);

    const generalPolicy = computeEffectiveTools({
      parent: snapshot,
      childLoadable: ["read", "write", "task", "web_search", "subagent", "missing"],
      childDefinitions: new Map([["task", taskTool], ["web_search", webTool]]),
      role: general,
      currentDepth: 0,
    });
    expect(generalPolicy.effectiveTools).toEqual(["read", "write", "task", "web_search"]);
    expect(generalPolicy.customTools.map((definition) => definition.name)).toEqual(["task", "web_search"]);
    expect(generalPolicy.unavailable).toEqual(expect.arrayContaining([
      { name: "subagent", reason: "hard-guard" },
      { name: "missing", reason: "parent-definition-missing" },
    ]));

    const specialized = computeEffectiveTools({
      parent: snapshot,
      childLoadable: snapshot.active,
      role: scout,
      callTools: ["read", "write", "task", "not-active"],
      currentDepth: 0,
    });
    expect(specialized.effectiveTools).toEqual(["read"]);
    expect(specialized.unavailable).toEqual(expect.arrayContaining([
      { name: "write", reason: "role-ceiling" },
      { name: "task", reason: "role-ceiling" },
      { name: "not-active", reason: "parent-inactive" },
    ]));
  });

  it("allows an approved same-name custom Bash definition to replace execution without expanding the tool ceiling", async () => {
    const general = (await loadRoleProfiles()).find((role) => role.selector === "general")!;
    const sandboxedBash = tool("bash");
    const policy = computeEffectiveTools({
      parent: parent(["read", "bash"]),
      childLoadable: ["read", "bash"],
      childDefinitions: new Map([["bash", sandboxedBash]]),
      role: general,
      currentDepth: 0,
    });
    expect(policy.effectiveTools).toEqual(["read", "bash"]);
    expect(policy.customTools).toEqual([sandboxedBash]);

    const withoutParentBash = computeEffectiveTools({
      parent: parent(["read"]),
      childLoadable: ["read", "bash"],
      childDefinitions: new Map([["bash", sandboxedBash]]),
      role: general,
      currentDepth: 0,
    });
    expect(withoutParentBash.effectiveTools).toEqual(["read"]);
    expect(withoutParentBash.customTools).toEqual([]);

    const formallyDenied = computeEffectiveTools({
      parent: parent(["read", "bash"]),
      childLoadable: ["read", "bash"],
      childDefinitions: new Map([["bash", sandboxedBash]]),
      role: general,
      callTools: ["bash"],
      hardDenied: ["bash"],
      currentDepth: 0,
    });
    expect(formallyDenied.effectiveTools).toEqual([]);
    expect(formallyDenied.customTools).toEqual([]);
    expect(formallyDenied.unavailable).toContainEqual({ name: "bash", reason: "hard-guard" });
  });

  it("enforces explicit non-self spawn allowlists, the depth cap, and synchronous nesting", async () => {
    const roles = await loadRoleProfiles();
    const general = roles.find((role) => role.selector === "general")!;
    const scout = roles.find((role) => role.selector === "aili.code-scout")!;
    expect(evaluateSpawn(general, "aili.code-scout", 0)).toEqual({
      allowed: true,
      target: "aili.code-scout",
      depth: 1,
      async: false,
    });
    expect(evaluateSpawn(general, "general", 0)).toMatchObject({ allowed: false, reason: "self-recursion", async: false });
    expect(evaluateSpawn(general, "aili.code-scout", 4, 99)).toMatchObject({ allowed: false, reason: "depth-exceeded", async: false });
    expect(evaluateSpawn(scout, "aili.implementer", 0)).toMatchObject({ allowed: false, reason: "role-disallowed", async: false });
    expect(evaluateSpawn(general, "unknown", 0)).toMatchObject({ allowed: false, reason: "unknown-selector", async: false });
  });

  it("hot reloads valid profile/tool drift only at turn boundaries and fails closed on invalid profiles", async () => {
    const general = (await loadRoleProfiles()).find((role) => role.selector === "general")!;
    let selected: RoleProfile = { ...general, profileHash: "profile-v1" };
    let builds = 0;
    let disposals = 0;
    let model = "model-v1";
    const manager = new TurnBoundaryPolicyManager<{ id: number; dispose(): void }>();
    const prepare = () => manager.prepareAtTurnBoundary({
      selector: "general",
      parent: parent(["read"]),
      childLoadable: ["read"],
      depth: 0,
      modelAudit: { provider: "fixture", model, thinking: "low" },
      loadProfiles: async () => [selected],
      build: async () => ({ id: ++builds, dispose: () => { disposals += 1; } }),
    });

    expect(await prepare()).toMatchObject({ rebuilt: true, handle: { id: 1 } });
    expect(await prepare()).toMatchObject({ rebuilt: false, handle: { id: 1 } });
    selected = { ...selected, profileHash: "profile-v2" };
    expect(await prepare()).toMatchObject({ rebuilt: true, handle: { id: 2 }, audit: { profileHash: "profile-v2", model: "model-v1" } });
    expect(disposals).toBe(1);
    model = "model-v2";
    expect(await prepare()).toMatchObject({ rebuilt: true, handle: { id: 3 }, audit: { model: "model-v2" } });
    expect(disposals).toBe(2);

    manager.markRunning();
    await expect(prepare()).rejects.toThrow(/in-flight turn/);
    manager.markSettled();
    await expect(manager.prepareAtTurnBoundary({
      selector: "general",
      parent: parent(["read"]),
      childLoadable: ["read"],
      depth: 0,
      loadProfiles: async () => [],
      build: async () => ({ id: 99, dispose() {} }),
    })).rejects.toThrow(/unavailable or invalid/);
    expect(manager.getAudit()).toMatchObject({ profileHash: "profile-v2", model: "model-v2" });
    await manager.dispose();
    expect(disposals).toBe(3);
  });
});

describe("child-only resource and approval bridges", () => {
  it("loads only named child extensions and creates an offline child AgentSession with the approved tools", async () => {
    const cwd = join(scratch, "project");
    const agentDir = join(scratch, "agent-dir");
    await mkdir(cwd, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    const childTool = tool("child_bridge_tool");
    const childExtension = (pi: ExtensionAPI) => pi.registerTool(childTool);
    const role = (await loadRoleProfiles()).find((candidate) => candidate.selector === "general")!;
    const prompt = assembleChildPrompt({
      runtimeEnvelope: "child-only runtime",
      role,
      task: "No model call is made by this fixture",
      cwd,
      workspace: { mode: "shared", root: cwd },
    });
    const policy = computeEffectiveTools({
      parent: parent(["read", "child_bridge_tool"], [childTool]),
      childLoadable: ["read", "child_bridge_tool"],
      role,
      currentDepth: 0,
    });

    const resources = await createChildResourceLoader({
      cwd,
      agentDir,
      projectTrusted: true,
      systemPrompt: prompt.systemPrompt,
      childExtensions: [{ name: "child-bridge", factory: childExtension }],
    });
    expect(resources.loader.getExtensions().extensions.map((extension) => extension.path)).toEqual(["<inline:child-bridge>"]);
    expect(resources.loader.getSystemPrompt()).toBe(prompt.systemPrompt);
    await expect(createChildResourceLoader({
      cwd,
      agentDir,
      projectTrusted: true,
      systemPrompt: prompt.systemPrompt,
      childExtensions: [{ name: "aili-top-coordinator", factory: childExtension }],
    })).rejects.toThrow(/top-level Extension/);

    const runtime = await createPersistentChildSession({
      cwd,
      agentDir,
      projectTrusted: true,
      sessionManager: SessionManager.inMemory(cwd),
      prompt,
      policy,
    });
    expect(runtime.session.getActiveToolNames()).toEqual(expect.arrayContaining(["read", "child_bridge_tool"]));
    expect(runtime.initialMessage).toContain("No model call");
    await runtime.dispose();
  });

  it("hard-denies credential paths before approval and routes asks through a sanitized parent packet", async () => {
    let handler: ((event: { toolName: string; input: unknown }) => Promise<unknown>) | undefined;
    let classifications = 0;
    const packets: unknown[] = [];
    const bridge = createChildApprovalBridge({
      agentId: "Worker",
      jobId: "job-1",
      cwd: scratch,
      decide: async () => {
        classifications += 1;
        return "ask" as const;
      },
      requestApproval: async (packet) => {
        packets.push(packet);
        return "allow" as const;
      },
    });
    bridge({
      on(event: string, callback: typeof handler) {
        if (event === "tool_call") handler = callback;
      },
    } as never);

    expect(await handler!({ toolName: "read", input: { path: "~/.ssh/id_ed25519" } })).toMatchObject({ block: true });
    expect(classifications).toBe(0);
    expect(packets).toEqual([]);

    expect(await handler!({ toolName: "bash", input: { command: "curl https://example.test" } })).toBeUndefined();
    expect(classifications).toBe(1);
    expect(packets).toEqual([{
      agentId: "Worker",
      jobId: "job-1",
      toolName: "bash",
      summary: "bash curl https://example.test",
    }]);
  });
});
