import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import ailiPi from "../../extensions/index.js";
import { detectLifecycleConflicts } from "../../src/runtime/conflicts.js";
import { detectLifecycleIntent, LIFECYCLE_PROMPTS } from "../../src/runtime/lifecycle.js";
import { runtimeComponents } from "../../src/runtime/index.js";
import {
  buildRoseAppendix,
  LIFECYCLE_AGENT_GUIDANCE_MAX_CHARS,
  renderLifecycleAgentGuidance,
} from "../../src/runtime/rose-context.js";
import { loadRoleProfiles } from "../../src/runtime/roles.js";

type BeforeStartHandler = (event: BeforeAgentStartEvent, context: never) => BeforeAgentStartEventResult | void | Promise<BeforeAgentStartEventResult | void>;

function command(name: string, source = "prompt") {
  return { name, source: source as "extension" | "prompt" | "skill", sourceInfo: { path: `/package/prompts/${name}.md`, source: "@rosetears/aili-pi", scope: "user" as const, origin: "package" as const } };
}

async function runtimeHarness(
  commands = LIFECYCLE_PROMPTS.map((name) => command(name)),
  activeTools = ["read", "grep", "find", "ls", "write", "edit", "bash", "task"],
) {
  const beforeStart: BeforeStartHandler[] = [];
  const registeredCommands: string[] = [];
  const registeredShortcuts: string[] = [];
  const registeredTools: string[] = [];
  const registeredToolDefinitions: Array<{ name: string; description?: string; promptSnippet?: string; promptGuidelines?: string[]; parameters?: unknown }> = [];
  const pi = new Proxy({
    on(event: string, handler: BeforeStartHandler) { if (event === "before_agent_start") beforeStart.push(handler); },
    getCommands: () => [...commands, ...registeredCommands.map((name) => command(name, "extension"))],
    getAllTools: () => registeredToolDefinitions.map((tool) => ({
      ...tool,
      sourceInfo: { path: "<inline:aili-runtime>", source: "extension:aili-runtime", scope: "temporary", origin: "top-level" },
    })),
    getActiveTools: () => activeTools,
    setActiveTools() {},
    registerCommand(name: string) { registeredCommands.push(name); },
    registerShortcut(shortcut: string) { registeredShortcuts.push(shortcut); },
    registerTool(tool: { name: string; description?: string; promptSnippet?: string; promptGuidelines?: string[]; parameters?: unknown }) {
      registeredTools.push(tool.name);
      registeredToolDefinitions.push(tool);
    },
    registerFlag() {},
    registerMessageRenderer() {},
    appendEntry() {},
    sendMessage() {},
  }, { get(target, property, receiver) { return property in target ? Reflect.get(target, property, receiver) : () => undefined; } }) as unknown as ExtensionAPI;
  await ailiPi(pi);
  return { beforeStart, registeredCommands, registeredShortcuts, registeredTools, registeredToolDefinitions, pi };
}

function event(contextFiles?: Array<{ path: string; content: string }>): BeforeAgentStartEvent {
  return { type: "before_agent_start", prompt: "define the change", systemPrompt: "PI BASE PROMPT", systemPromptOptions: { cwd: "/project", contextFiles } };
}

function expectAlignedGovernance(surface: string): void {
  const boundaries: Array<[string, RegExp]> = [
    ["ordinary discovery scan", /scan before duplicating material discovery or execution/i],
    ["exact specialist preference", /prefer an exact Specialized Agent when one routing row clearly matches/i],
    ["ordinary general compatibility", /general.*only when no specialist fits or for ordinary compatibility/i],
    ["ROSE formal authority", /ROSE owns decisions, decomposition, integration, and final verification/i],
    ["exact formal owner", /ready Agent-owned formal package must use its exact Specialized owner/i],
    ["formal benefit override", /ordinary benefit logic cannot replace that owner/i],
    ["formal general exclusion", /general.*is not a formal package owner/i],
    ["persistent identity boundary", /same Agent identity only while package, role, scope, permissions, acceptance boundary, and expected evidence remain unchanged/i],
    ["new identity boundary", /new scope, package, or claim requires a new job or Agent/i],
    ["async inspection", /inspect async output.*before dependent work or the final verdict/i],
    ["human artifact prose", /Human-facing persisted prose uses ordinary language without epistemic claim-tag prefixes/i],
    ["artifact authority", /Artifacts may record decisions and authorization but never create them/i],
    ["BUILD authorization", /Final test-plan acceptance does not start BUILD or authorize implementation/i],
    ["YOLO authorization", /YOLO changes tool permissions only and never implies BUILD, commit, push, or release authorization/i],
  ];
  for (const [boundary, pattern] of boundaries) expect(surface, boundary).toMatch(pattern);
}

describe("AILI runtime composition", () => {
  it("exports one extension entry and keeps native integrations behind it", () => {
    expect(runtimeComponents.map((component) => component.id)).toEqual([
      "rose-context", "lifecycle-routing", "task-runtime", "mcp-runtime", "context-runtime", "provider-retry", "native-integrations",
      "capability-registry", "doctor", "shortcuts", "status",
    ]);
  });

  it("registers delegated and selected community surfaces without legacy AILI mode controls", async () => {
    const harness = await runtimeHarness();
    expect(harness.registeredCommands).toEqual(expect.arrayContaining([
      "aili-doctor", "perm", "cache-optimizer",
    ]));
    expect(harness.registeredCommands).not.toContain("aili-install-global-resources");
    expect(harness.registeredCommands).not.toContain("aili-compact");
    expect(harness.registeredCommands.filter((name) => [
      "preview", "preview-browser", "preview-pdf", "preview-clear-cache", "lsp",
    ].includes(name))).toEqual([]);
    expect(harness.registeredCommands).not.toContain("aili-mode");
    expect(harness.registeredShortcuts).toContain("alt+m");
    expect(harness.registeredShortcuts).not.toContain("ctrl+shift+alt+a");
    expect(harness.registeredTools).toEqual(expect.arrayContaining([
      "task", "hub", "mcp", "mcpScript", "compress", "decompress", "search_context", "acp_status", "web_search", "fetch_content", "get_search_content",
    ]));
    expect(harness.registeredTools.filter((name) => name.startsWith("aili_compact") || [
      "aili_decompress", "aili_prune", "aili_search_context", "aili_context_recap",
    ].includes(name))).toEqual([]);
    expect(harness.registeredTools.filter((name) => ["preview_export", "lsp_diagnostics", "lsp_fix"].includes(name))).toEqual([]);
    expect(harness.registeredTools).not.toContain("subagent");
    expect(harness.registeredTools).not.toContain("aili_task");

    const profiles = await loadRoleProfiles();
    const task = harness.registeredToolDefinitions.find((tool) => tool.name === "task")!;
    const catalogGuideline = task.promptGuidelines?.at(-1) ?? "";
    expect(task.description).toContain("Delegate bounded work to parent-scoped persistent AILI Agents");
    expect(task.promptSnippet).toContain("exact Specialized selector with explicit async");
    expect(catalogGuideline).toContain("Specialized Agent catalog (generated routing cues");
    expect(catalogGuideline).toContain(`aili.code-scout — ${profiles.find((profile) => profile.selector === "aili.code-scout")!.description}`);
    expect(catalogGuideline).toContain("use=Files, symbols, call paths");
    expect(catalogGuideline).toContain("phases(advisory)=IDEATE/DEFINE/BUILD");
    expect(catalogGuideline).toContain("never grant tools or permissions");
    expect(catalogGuideline).not.toContain("toolPolicy");
    expect(catalogGuideline).not.toContain("capabilities");
    expect(JSON.stringify(task.parameters)).toContain("Choose an exact Specialized selector from the active task catalog");
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
    expect(result?.systemPrompt).toContain("# AILI Pi System Projection");
    expect(result?.systemPrompt).toContain("rose_static_rules=validated rose-aili Workflow system bundle injected by this Extension");
    expect(result?.systemPrompt).toContain("project_rules=loaded (/project/AGENTS.md)");
    expect(result?.systemPrompt).toContain("delegation_policy=benefit-based");
    expect(result?.systemPrompt).toContain("Agents improve efficiency and preserve parent context");
    expect(result?.systemPrompt).toContain("ordinary direct work remains valid when delegation has no concrete benefit");
    expect(result?.systemPrompt).toContain("omitted task.agent retains general compatibility");
    expect(result?.systemPrompt).not.toContain("delegation_gate=");
    expect(result?.systemPrompt).toContain("permission_runtime=pi-permission-modes");
    expect(result?.systemPrompt).not.toContain("<!-- AILI-PI:ROSE:START -->");
    expect(result?.systemPrompt).not.toContain("# AILI ROSE — Pi governance adapter");
  });

  it("keeps the concise runtime summary aligned with the readable static adapter contract", async () => {
    const harness = await runtimeHarness();
    const appendix = buildRoseAppendix(event(), harness.pi);
    const template = await readFile(new URL("../../templates/APPEND_SYSTEM.md", import.meta.url), "utf8");

    expectAlignedGovernance(appendix);
    expectAlignedGovernance(template);
    expect(template.match(/<!-- AILI-PI:ROSE:START -->/g)).toHaveLength(1);
    expect(template.match(/<!-- AILI-PI:ROSE:END -->/g)).toHaveLength(1);
  });

  it("renders only current phase recommendations and nonterminal Agent Owners from explicit lifecycle input", async () => {
    const harness = await runtimeHarness();
    const profiles = await loadRoleProfiles();
    const lifecycle = {
      profiles,
      phase: "BUILD",
      activeOwners: [
        {
          packageId: "3.2",
          owner: "agent:aili.implementer",
          status: "ready",
          dispatchReason: "Bounded production guidance implementation is ready.",
        },
        {
          packageId: "3.2-scout",
          owner: "agent:aili.code-scout",
          status: "returned",
          dispatchReason: "Returned repository evidence still needs ROSE inspection.",
        },
        {
          packageId: "3.1-done",
          owner: "agent:aili.code-reviewer",
          status: "done",
          dispatchReason: "pending",
        },
      ],
    } as const;
    const appendix = buildRoseAppendix(event(), harness.pi, lifecycle);
    const guidance = renderLifecycleAgentGuidance(lifecycle);
    if (!guidance.ok) throw new Error(guidance.diagnostics.map((diagnostic) => diagnostic.code).join(", "));

    expect(appendix).toContain("## Active formal lifecycle Agent guidance");
    expect(appendix).toContain("phase=BUILD");
    expect(appendix).toContain("aili.implementer");
    expect(appendix).toContain("3.2:ready (Bounded production guidance implementation is ready.)");
    expect(appendix).toContain("aili.code-scout");
    expect(appendix).toContain("3.2-scout:returned");
    expect(appendix).not.toContain("aili.code-reviewer");
    expect(appendix).toContain("use=One complete bounded implementation package is authorized inside accepted scope.");
    expect(appendix).toContain("phase_affinity=BUILD (advisory only; grants no tools or permissions)");
    expect(guidance.value).not.toContain(profiles.find((profile) => profile.selector === "aili.implementer")!.prompt);
    expect(guidance.value).not.toContain("profileHash");
    expect(guidance.value).not.toContain("profilePath");
    expect(guidance.value).not.toContain("sourceKind");
    expect(guidance.value).not.toContain("model=");
    expect(guidance.value).not.toContain("tool-policy:");
    expect(guidance.value).not.toContain("capabilities:");
  });

  it("fails lifecycle guidance visibly for invalid Owner data and bounded-output overflow", async () => {
    const harness = await runtimeHarness();
    const profiles = await loadRoleProfiles();
    const invalid = buildRoseAppendix(event(), harness.pi, {
      profiles,
      phase: "BUILD",
      activeOwners: [{
        packageId: "3.2-invalid",
        owner: "agent:general",
        status: "ready",
        dispatchReason: "A formal package cannot use general ownership.",
      }],
    });
    expect(invalid).toContain("lifecycle_agent_guidance=non-pass (OWNER_SELECTOR_UNKNOWN)");

    const overflow = renderLifecycleAgentGuidance({
      profiles,
      phase: "BUILD",
      activeOwners: Array.from({ length: 12 }, (_, index) => ({
        packageId: `P-${index}`,
        owner: "agent:aili.implementer",
        status: "ready" as const,
        dispatchReason: `${String(index)}${"x".repeat(1_900)}`,
      })),
    });
    expect(overflow).toEqual({
      ok: false,
      diagnostics: [{
        code: "LIFECYCLE_GUIDANCE_LIMIT_EXCEEDED",
        message: "Active lifecycle Agent guidance exceeds its model-context character limit.",
        phase: "BUILD",
      }],
    });
    expect(LIFECYCLE_AGENT_GUIDANCE_MAX_CHARS).toBe(16_384);
  });

  it("omits task and lifecycle catalog guidance when task is inactive", async () => {
    const harness = await runtimeHarness(
      LIFECYCLE_PROMPTS.map((name) => command(name)),
      ["read", "grep", "find", "ls", "write", "edit", "bash"],
    );
    const appendix = buildRoseAppendix(event(), harness.pi, {
      profiles: await loadRoleProfiles(),
      phase: "BUILD",
      activeOwners: [],
    });

    expect(appendix).not.toContain("task_runtime=");
    expect(appendix).not.toContain("delegation_policy=");
    expect(appendix).not.toContain("Active formal lifecycle Agent guidance");
    expect(appendix).not.toContain("Specialized Agent catalog");
    expect(appendix).not.toContain("aili.implementer");
    expect(appendix).toContain("ordinary_routing=");
    expect(appendix).toContain("formal_routing=");
    expect(appendix).toContain("permission_runtime=pi-permission-modes");
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
