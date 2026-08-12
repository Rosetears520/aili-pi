import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  MCP_TOOL_APPROVAL_REQUEST_EVENT,
  type McpToolApprovalRequest,
} from "pi-mcp-adapter";
import { describe, expect, it, vi } from "vitest";
import { createMcpApprovalBridge } from "../../src/runtime/mcp.js";
import { ChildPermissionResolver, ParentApprovalBroker, brokeredChildPermission } from "../../src/runtime/persistent-agents/permission.js";
import type { ModeDef } from "pi-permission-modes/src/schema.ts";

function mode(toolAction: "allow" | "ask" | "deny"): ModeDef {
  return {
    label: "fixture",
    tools: { default: toolAction, overrides: {} },
    read: { default: "allow", overrides: {} },
    write: { default: "deny", overrides: {} },
    edit: { default: "deny", overrides: {} },
    grep: { default: "allow", overrides: {} },
    find: { default: "allow", overrides: {} },
    ls: { default: "allow", overrides: {} },
    bash: { default: "deny", overrides: {} },
    web_search: { default: "deny", overrides: {} },
    sandbox: { enabled: false, writable: false, network: { allowed: [] }, ignoreViolations: false },
  } as unknown as ModeDef;
}

function bus() {
  const handlers = new Map<string, (value: unknown) => void>();
  return {
    handlers,
    pi: {
      events: {
        emit(channel: string, value: unknown) { handlers.get(channel)?.(value); },
        on(channel: string, handler: (value: unknown) => void) {
          handlers.set(channel, handler);
          return () => handlers.delete(channel);
        },
      },
      on() {},
    } as unknown as ExtensionAPI,
  };
}

async function decision(handlers: Map<string, (value: unknown) => void>, origin: McpToolApprovalRequest["origin"]) {
  let claimed: (() => unknown | Promise<unknown>) | undefined;
  handlers.get(MCP_TOOL_APPROVAL_REQUEST_EVENT)?.({
    requestId: origin,
    serverName: "memory",
    originalToolName: "store",
    prefixedToolName: "memory_store",
    args: { value: "bounded" },
    origin,
    claim(handler) { claimed = handler; return true; },
  } satisfies McpToolApprovalRequest);
  return claimed ? await claimed() : undefined;
}

describe("MCP origins use the persistent child permission intersection", () => {
  it.each(["proxy", "direct", "script", "resource", "iframe"] as const)("denies %s before server execution when Pi mode denies custom tools", async (origin) => {
    const runtime = bus();
    const broker = new ParentApprovalBroker({ hasUI: true, ask: async () => "allow" });
    const permission = brokeredChildPermission(
      new ChildPermissionResolver({ mode: mode("deny"), cwd: process.cwd(), sandboxExecutorAvailable: true }),
      broker,
      { agentId: "Agent", jobId: "job" },
    );
    createMcpApprovalBridge({
      decide: async (request) => await permission.decide("mcp", { server: request.serverName, tool: request.prefixedToolName, args: request.args }),
      requestApproval: async (request) => await permission.requestApproval({ toolName: "mcp", summary: `${request.serverName}/${request.originalToolName}` }),
    })(runtime.pi);
    expect(await decision(runtime.handlers, origin)).toBe("deny");
  });

  it("fails headless ask closed and uses one non-sticky grant per call when UI exists", async () => {
    const headless = bus();
    const deniedBroker = new ParentApprovalBroker({ hasUI: false, ask: async () => "allow" });
    const denied = brokeredChildPermission(new ChildPermissionResolver({ mode: mode("ask"), cwd: process.cwd(), sandboxExecutorAvailable: true }), deniedBroker, { agentId: "A", jobId: "J" });
    createMcpApprovalBridge({ decide: async () => "ask" as const, requestApproval: async (request) => await denied.requestApproval({ toolName: "mcp", summary: request.originalToolName }) })(headless.pi);
    expect(await decision(headless.handlers, "proxy")).toBe("deny");

    const interactive = bus();
    const prompts = vi.fn(async () => "allow" as const);
    const broker = new ParentApprovalBroker({ hasUI: true, ask: prompts });
    const allowed = brokeredChildPermission(new ChildPermissionResolver({ mode: mode("ask"), cwd: process.cwd(), sandboxExecutorAvailable: true }), broker, { agentId: "A", jobId: "J" });
    createMcpApprovalBridge({ decide: async () => "ask" as const, requestApproval: async (request) => await allowed.requestApproval({ toolName: "mcp", summary: request.originalToolName }) })(interactive.pi);
    expect(await decision(interactive.handlers, "script")).toBe("allow_once");
    expect(await decision(interactive.handlers, "script")).toBe("allow_once");
    expect(prompts).toHaveBeenCalledTimes(2);
  });
});
