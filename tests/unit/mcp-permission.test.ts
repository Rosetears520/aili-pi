import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  MCP_TOOL_APPROVAL_REQUEST_EVENT,
  type McpToolApprovalRequest,
} from "pi-mcp-adapter";
import { describe, expect, it, vi } from "vitest";
import { createMcpApprovalBridge } from "../../src/runtime/mcp.js";

function harness(policy: Parameters<typeof createMcpApprovalBridge>[0]) {
  const eventHandlers = new Map<string, (value: unknown) => void>();
  const extensionHandlers = new Map<string, () => void>();
  createMcpApprovalBridge(policy)({
    events: {
      emit(channel: string, value: unknown) { eventHandlers.get(channel)?.(value); },
      on(channel: string, handler: (value: unknown) => void) {
        eventHandlers.set(channel, handler);
        return () => eventHandlers.delete(channel);
      },
    },
    on(event: string, handler: () => void) { extensionHandlers.set(event, handler); },
  } as unknown as ExtensionAPI);
  return { eventHandlers, extensionHandlers };
}

type ApprovalHarness = { eventHandlers: Map<string, (value: unknown) => void>; extensionHandlers: Map<string, () => void> };

async function request(runtime: ApprovalHarness, origin: McpToolApprovalRequest["origin"]) {
  let handler: (() => unknown | Promise<unknown>) | undefined;
  const claimed = vi.fn((candidate) => {
    handler = candidate;
    return true;
  });
  runtime.eventHandlers.get(MCP_TOOL_APPROVAL_REQUEST_EVENT)?.({
    requestId: `request-${origin}`,
    serverName: "fixture",
    originalToolName: "write_record",
    prefixedToolName: "fixture_write_record",
    args: { value: "safe" },
    origin,
    claim: claimed,
  } satisfies McpToolApprovalRequest);
  return { claimed, decision: handler ? await handler() : undefined };
}

describe("MCP permission bridge", () => {
  it("applies the same allow decision to every adapter origin", async () => {
    const runtime = harness({ decide: async () => "allow" as const });
    for (const origin of ["proxy", "direct", "script", "resource", "iframe"] as const) {
      expect(await request(runtime, origin)).toMatchObject({ decision: "allow_once" });
    }
  });

  it("denies all origins when any effective permission layer denies", async () => {
    const decide = vi.fn(async (item: McpToolApprovalRequest) => item.origin === "proxy" ? "allow" as const : "deny" as const);
    const runtime = harness({ decide });
    expect((await request(runtime, "proxy")).decision).toBe("allow_once");
    for (const origin of ["direct", "script", "resource", "iframe"] as const) {
      expect((await request(runtime, origin)).decision).toBe("deny");
    }
    expect(decide).toHaveBeenCalledTimes(5);
  });

  it("fails ask closed without a broker and never grants a sticky adapter session approval", async () => {
    const noBroker = harness({ decide: async () => "ask" as const });
    expect((await request(noBroker, "proxy")).decision).toBe("deny");

    const broker = vi.fn(async () => "allow" as const);
    const withBroker = harness({ decide: async () => "ask" as const, requestApproval: broker });
    expect((await request(withBroker, "proxy")).decision).toBe("allow_once");
    expect((await request(withBroker, "proxy")).decision).toBe("allow_once");
    expect(broker).toHaveBeenCalledTimes(2);
    withBroker.extensionHandlers.get("session_shutdown")?.();
    expect(withBroker.eventHandlers.has(MCP_TOOL_APPROVAL_REQUEST_EVENT)).toBe(false);
  });

  it("fails closed when permission classification throws", async () => {
    const runtime = harness({ decide: async () => { throw new Error("policy unavailable"); } });
    expect((await request(runtime, "resource")).decision).toBe("deny");
  });
});
