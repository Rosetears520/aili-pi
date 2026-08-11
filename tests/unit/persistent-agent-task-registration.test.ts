import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { persistentTaskAwarePermissionApi } from "../../src/runtime/native-integrations.js";
import { registerCanonicalAiliTaskTool } from "../../src/runtime/persistent-agents/task-registration.js";

interface ToolInfoFixture {
  name: string;
  description: string;
  parameters: unknown;
  promptGuidelines?: readonly string[];
  sourceInfo: {
    path: string;
    source: string;
    scope: string;
    origin: string;
    baseDir?: string;
  };
}

function canonicalDefinition(): ToolDefinition {
  return {
    name: "task",
    label: "Task",
    description: "Canonical fixture task",
    parameters: Type.Object({}),
    promptGuidelines: ["Use task only for the fixture."],
    async execute() {
      return { content: [{ type: "text", text: "ok" }], details: {} };
    },
  };
}

function harness() {
  let winner: ToolInfoFixture | undefined;
  let active = true;
  let handler: ((event: unknown, context: unknown) => unknown) | undefined;
  const canonicalSourceInfo = {
    path: "/fixture/extensions/aili.ts",
    source: "extension:aili-runtime",
    scope: "temporary",
    origin: "top-level",
    baseDir: "/fixture/extensions",
  };
  const api = {
    registerTool(definition: ToolDefinition) {
      winner = {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
        promptGuidelines: definition.promptGuidelines,
        sourceInfo: canonicalSourceInfo,
      };
    },
    getAllTools() { return winner ? [winner] : []; },
    getActiveTools() { return active && winner ? [winner.name] : []; },
    on(event: string, candidate: (event: unknown, context: unknown) => unknown) {
      if (event === "tool_call") handler = candidate;
    },
  } as unknown as ExtensionAPI;
  return {
    api,
    setWinner(value: ToolInfoFixture | undefined) { winner = value; },
    setActive(value: boolean) { active = value; },
    invoke() {
      if (!handler) throw new Error("tool_call handler was not registered");
      return handler({ type: "tool_call", toolName: "task", toolCallId: "fixture", input: {} }, {});
    },
  };
}

function registerGenericGate(api: ExtensionAPI) {
  const generic = vi.fn(() => ({ block: true, reason: "generic custom-tool gate" }));
  persistentTaskAwarePermissionApi(api).on("tool_call", generic as never);
  return generic;
}

describe("canonical persistent task reservation", () => {
  it.each(["task-before-permission", "permission-before-task"] as const)(
    "accepts the genuine active canonical task in %s registration order",
    (order) => {
      const fixture = harness();
      let generic: ReturnType<typeof registerGenericGate>;
      if (order === "task-before-permission") {
        registerCanonicalAiliTaskTool(fixture.api, canonicalDefinition());
        generic = registerGenericGate(fixture.api);
      } else {
        generic = registerGenericGate(fixture.api);
        registerCanonicalAiliTaskTool(fixture.api, canonicalDefinition());
      }
      expect(fixture.invoke()).toBeUndefined();
      expect(generic).not.toHaveBeenCalled();
    },
  );

  it("rejects a visible pre-existing same-name custom tool at the registration boundary", () => {
    const fixture = harness();
    fixture.setWinner({
      name: "task",
      description: "Pre-existing custom task",
      parameters: Type.Object({}),
      sourceInfo: { path: "/fixture/custom.ts", source: "extension:custom", scope: "temporary", origin: "top-level" },
    });
    expect(() => registerCanonicalAiliTaskTool(fixture.api, canonicalDefinition())).toThrow(/collision exists before/);
  });

  it.each([
    { source: "extension:custom", description: "Winning custom task" },
    { source: "mcp", description: "Winning MCP task descriptor" },
  ])("keeps a same-name $source winner under generic permission gating", ({ source, description }) => {
    const fixture = harness();
    registerCanonicalAiliTaskTool(fixture.api, canonicalDefinition());
    const generic = registerGenericGate(fixture.api);
    fixture.setWinner({
      name: "task",
      description,
      parameters: Type.Object({}),
      promptGuidelines: ["Spoofed task metadata."],
      sourceInfo: { path: `/fixture/${source}.ts`, source, scope: "temporary", origin: "top-level" },
    });
    expect(fixture.invoke()).toEqual({ block: true, reason: "generic custom-tool gate" });
    expect(generic).toHaveBeenCalledOnce();
  });

  it("keeps an inactive canonical task under generic permission gating", () => {
    const fixture = harness();
    registerCanonicalAiliTaskTool(fixture.api, canonicalDefinition());
    const generic = registerGenericGate(fixture.api);
    fixture.setActive(false);
    expect(fixture.invoke()).toEqual({ block: true, reason: "generic custom-tool gate" });
    expect(generic).toHaveBeenCalledOnce();
  });

  it("keeps a descriptor-reference clone with another Extension source under generic gating", () => {
    const fixture = harness();
    const definition = canonicalDefinition();
    registerCanonicalAiliTaskTool(fixture.api, definition);
    const generic = registerGenericGate(fixture.api);
    fixture.setWinner({
      name: "task",
      description: definition.description,
      parameters: definition.parameters,
      promptGuidelines: definition.promptGuidelines,
      sourceInfo: {
        path: "/fixture/extensions/clone.ts",
        source: "extension:clone",
        scope: "temporary",
        origin: "top-level",
        baseDir: "/fixture/extensions",
      },
    });
    expect(fixture.invoke()).toEqual({ block: true, reason: "generic custom-tool gate" });
    expect(generic).toHaveBeenCalledOnce();
  });
});
