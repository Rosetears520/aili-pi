import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import ailiPi from "../../extensions/index.js";
import { detectLifecycleConflicts } from "../../src/runtime/conflicts.js";
import { detectLifecycleIntent, LIFECYCLE_PROMPTS } from "../../src/runtime/lifecycle.js";
import { runtimeComponents } from "../../src/runtime/index.js";

type BeforeStartHandler = (event: BeforeAgentStartEvent, context: never) => BeforeAgentStartEventResult | void | Promise<BeforeAgentStartEventResult | void>;

function command(name: string, source = "prompt") {
  return { name, source: source as "extension" | "prompt" | "skill", sourceInfo: { path: `/package/prompts/${name}.md`, source: "@rosetears/aili-pi", scope: "user" as const, origin: "package" as const } };
}

async function runtimeHarness(commands = LIFECYCLE_PROMPTS.map((name) => command(name))) {
  const beforeStart: BeforeStartHandler[] = [];
  const registeredCommands: string[] = [];
  const registeredShortcuts: string[] = [];
  const registeredTools: string[] = [];
  const pi = new Proxy({
    on(event: string, handler: BeforeStartHandler) { if (event === "before_agent_start") beforeStart.push(handler); },
    getCommands: () => [...commands, ...registeredCommands.map((name) => command(name, "extension"))],
    getAllTools: () => [],
    getActiveTools: () => ["read", "grep", "find", "ls", "write", "edit", "bash"],
    setActiveTools() {},
    registerCommand(name: string) { registeredCommands.push(name); },
    registerShortcut(shortcut: string) { registeredShortcuts.push(shortcut); },
    registerTool(tool: { name: string }) { registeredTools.push(tool.name); },
    registerFlag() {},
    registerMessageRenderer() {},
    appendEntry() {},
    sendMessage() {},
  }, { get(target, property, receiver) { return property in target ? Reflect.get(target, property, receiver) : () => undefined; } }) as unknown as ExtensionAPI;
  await ailiPi(pi);
  return { beforeStart, registeredCommands, registeredShortcuts, registeredTools };
}

function event(contextFiles?: Array<{ path: string; content: string }>): BeforeAgentStartEvent {
  return { type: "before_agent_start", prompt: "define the change", systemPrompt: "PI BASE PROMPT", systemPromptOptions: { cwd: "/project", contextFiles } };
}

describe("AILI runtime composition", () => {
  it("exports one extension entry and keeps native integrations behind it", () => {
    expect(runtimeComponents.map((component) => component.id)).toEqual([
      "rose-context", "lifecycle-routing", "task-runtime", "native-integrations",
      "global-resources", "capability-registry", "doctor", "shortcuts", "status",
    ]);
  });

  it("registers delegated and selected community surfaces without legacy AILI mode controls", async () => {
    const harness = await runtimeHarness();
    expect(harness.registeredCommands).toEqual(expect.arrayContaining([
      "aili-doctor", "aili-install-global-resources", "perm",
      "cache-optimizer", "preview", "preview-browser", "preview-pdf", "preview-clear-cache", "lsp",
    ]));
    expect(harness.registeredCommands).not.toContain("aili-mode");
    expect(harness.registeredShortcuts).toContain("alt+m");
    expect(harness.registeredShortcuts).not.toContain("ctrl+shift+alt+a");
    expect(harness.registeredTools).toEqual(expect.arrayContaining([
      "subagent", "web_search", "fetch_content", "get_search_content", "preview_export", "lsp_diagnostics", "lsp_fix",
    ]));
    expect(harness.registeredTools).not.toContain("aili_task");
  });

  it("appends only dynamic runtime state while the static ROSE adapter is global", async () => {
    const harness = await runtimeHarness();
    const context = {
      model: undefined,
      modelRegistry: undefined,
      sessionManager: { getSessionId: () => "test-session" },
    };
    const results = await Promise.all(harness.beforeStart.map((handler) => handler(event([{ path: "/project/AGENTS.md", content: "rules" }]), context as never)));
    const result = results.find((candidate) => candidate?.systemPrompt?.includes("AILI runtime summary"));
    expect(result).toBeDefined();
    expect(result?.systemPrompt).toMatch(/^PI BASE PROMPT/);
    expect(result?.systemPrompt).toContain("rose_static_rules=global APPEND_SYSTEM marker resource");
    expect(result?.systemPrompt).toContain("project_rules=loaded (/project/AGENTS.md)");
    expect(result?.systemPrompt).toContain("permission_runtime=pi-permission-modes");
  });
});

describe("lifecycle routing and conflicts", () => {
  it("maps slash and natural-language delivery intent without adding a fifth mode", () => {
    expect(detectLifecycleIntent("/build accepted-change")).toBe("BUILD");
    expect(detectLifecycleIntent("Please write a spec for this feature")).toBe("DEFINE");
    expect(detectLifecycleIntent("/local-review current diff")).toBeUndefined();
  });

  it("fails conflict inspection for duplicate and missing lifecycle prompts", () => {
    const healthy = LIFECYCLE_PROMPTS.map((name) => command(name));
    expect(detectLifecycleConflicts(healthy)).toEqual([]);
    expect(detectLifecycleConflicts([...healthy, command("ship:1", "skill")]).map((item) => item.name)).toEqual(["ship"]);
    expect(detectLifecycleConflicts(healthy.filter((item) => item.name !== "ideate")).map((item) => item.name)).toEqual(["ideate"]);
  });
});
