import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createProviderRoutedContextExtension } from "../../src/runtime/context-runtime.js";

function harness() {
  const tools: string[] = [];
  const commands: string[] = [];
  const registrations: string[] = [];
  const handlers = new Map<string, Array<(...args: any[]) => any>>();
  const pi = {
    registerTool(tool: { name: string }) { tools.push(tool.name); },
    registerCommand(name: string) { commands.push(name); },
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    getActiveTools: () => [],
    getAllTools: () => [],
    on(name: string, handler: (...args: any[]) => any) {
      registrations.push(name);
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
  } as unknown as ExtensionAPI;
  createProviderRoutedContextExtension()(pi);
  return { tools, commands, registrations, handlers };
}

describe("provider-routed context runtime load", () => {
  it("registers compression/context tools and one Codex command without ACP delegation", async () => {
    const runtime = harness();
    let providerRequests = 0;
    for (const handler of runtime.handlers.get("session_start") ?? []) {
      await handler({ type: "session_start", reason: "startup" }, {
        cwd: ".",
        hasUI: false,
        mode: "print",
        model: undefined,
        sessionManager: { getSessionId: () => "fixture" },
        modelRegistry: { getApiKeyAndHeaders: async () => { providerRequests += 1; return { ok: false, error: "not configured" }; } },
        ui: { notify() {}, setWidget() {} },
      });
    }
    expect(runtime.tools).toEqual(expect.arrayContaining(["compress", "decompress", "search_context", "acp_status"]));
    expect(runtime.tools).not.toEqual(expect.arrayContaining(["acp_delegate", "acp_delegate_wait", "acp_delegate_cancel"]));
    expect(runtime.commands).toContain("codex-compact");
    expect(runtime.tools.some((name) => name.startsWith("aili_"))).toBe(false);
    expect(runtime.commands).not.toContain("aili-compact");
    expect(providerRequests).toBe(0);
    expect(new Set(runtime.tools).size).toBe(runtime.tools.length);
    expect(new Set(runtime.commands).size).toBe(runtime.commands.length);
    expect(runtime.registrations.filter((name) => name === "context")).toHaveLength(2);
    expect(runtime.registrations.filter((name) => name === "session_before_compact")).toHaveLength(2);
    expect(runtime.registrations.filter((name) => name === "before_provider_request")).toHaveLength(1);
  });
});
