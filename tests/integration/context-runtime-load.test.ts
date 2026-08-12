import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createProviderRoutedContextExtension } from "../../src/runtime/context-runtime.js";

function harness() {
  const tools: string[] = [];
  const commands: string[] = [];
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  const pi = {
    registerTool(tool: { name: string }) { tools.push(tool.name); },
    registerCommand(name: string) { commands.push(name); },
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    getActiveTools: () => [],
    getAllTools: () => [],
    on(name: string, handler: (...args: any[]) => any) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
  } as unknown as ExtensionAPI;
  createProviderRoutedContextExtension()(pi);
  return { tools, commands, handlers };
}

describe("provider-routed context runtime load", () => {
  it("registers complete ACP tools and one Codex command without AILI Compact", () => {
    const runtime = harness();
    expect(runtime.tools).toEqual(expect.arrayContaining(["compress", "decompress", "search_context", "acp_status"]));
    expect(runtime.commands).toContain("codex-compact");
    expect(runtime.tools.some((name) => name.startsWith("aili_"))).toBe(false);
    expect(runtime.commands).not.toContain("aili-compact");
  });
});
