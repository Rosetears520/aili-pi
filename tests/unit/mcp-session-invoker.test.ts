import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  MCP_STATUS_EVENT,
  MCP_STATUS_SNAPSHOT_VERSION,
  MCP_TOOL_APPROVAL_REQUEST_EVENT,
  type McpToolApprovalDecision,
} from "pi-mcp-adapter";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface AdapterSurface {
  registerTool(tool: unknown): unknown;
}

const adapterMock = vi.hoisted(() => ({
  install: undefined as undefined | ((pi: AdapterSurface) => void),
}));

vi.mock("pi-mcp-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pi-mcp-adapter")>();
  return {
    ...actual,
    createMcpAdapter: vi.fn(() => (pi: AdapterSurface) => adapterMock.install?.(pi)),
  };
});

import { createAiliMcpExtension, sessionOwnedMcpInvokerFor } from "../../src/runtime/mcp.js";

type EventHandler = (value: unknown) => void;
type LifecycleHandler = (event: unknown, context: ExtensionContext) => void;

function fakePi() {
  const eventHandlers = new Map<string, Set<EventHandler>>();
  const lifecycleHandlers = new Map<string, LifecycleHandler[]>();
  const registered: unknown[] = [];
  const registerReceivers: unknown[] = [];
  const registrationResult = { delegated: true };
  const pi = {
    events: {
      on(name: string, handler: EventHandler) {
        const handlers = eventHandlers.get(name) ?? new Set<EventHandler>();
        handlers.add(handler);
        eventHandlers.set(name, handlers);
        return () => handlers.delete(handler);
      },
      emit(name: string, value: unknown) {
        for (const handler of eventHandlers.get(name) ?? []) handler(value);
      },
    },
    on(name: string, handler: LifecycleHandler) {
      const handlers = lifecycleHandlers.get(name) ?? [];
      handlers.push(handler);
      lifecycleHandlers.set(name, handlers);
    },
    registerTool(this: unknown, tool: unknown) {
      registered.push(tool);
      registerReceivers.push(this);
      return registrationResult;
    },
  };
  return {
    pi: pi as unknown as ExtensionAPI,
    surface: pi,
    registered,
    registerReceivers,
    registrationResult,
    emit: pi.events.emit,
    lifecycle(name: string, context = {} as ExtensionContext) {
      for (const handler of lifecycleHandlers.get(name) ?? []) handler({}, context);
    },
  };
}

const validArgs = () => ({ query: "remember this", limit: 4 });
const invocation = (overrides: Partial<{ server: string; tool: string; args: Record<string, unknown>; signal: AbortSignal }> = {}) => ({
  server: "memory-server",
  tool: "mempalace_search",
  args: validArgs(),
  ...overrides,
});
const success = (value: unknown, server = "memory-server", tool = "mempalace_search") => ({
  details: {
    mode: "call",
    server,
    tool,
    mcpResult: { content: [{ type: "text", text: JSON.stringify(value) }] },
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  adapterMock.install = undefined;
});

describe("session-owned MCP invoker", () => {
  it("lazily binds an invoker obtained before exact mcp registration and session start", async () => {
    const harness = fakePi();
    const invoker = sessionOwnedMcpInvokerFor(harness.pi);
    await expect(invoker.invoke(invocation())).rejects.toThrow("unavailable");

    const execute = vi.fn(async () => success({ memories: ["one"] }));
    adapterMock.install = (pi) => { pi.registerTool({ name: "mcp", execute }); };
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");
    harness.emit(MCP_STATUS_EVENT, {
      version: MCP_STATUS_SNAPSHOT_VERSION,
      servers: [{ name: "memory-server", status: "connected", toolCount: 1, disabled: false }],
      totalTools: 1,
      totalResources: 0,
      connectedCount: 1,
      disabledCount: 0,
    });

    await expect(invoker.invoke(invocation())).resolves.toEqual({ memories: ["one"] });
    expect(invoker.serverState("memory-server")).toBe("connected");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not carry a stale server failure into a new session generation", () => {
    const harness = fakePi();
    adapterMock.install = (pi) => { pi.registerTool({ name: "mcp", execute: async () => success("ok") }); };
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.emit(MCP_STATUS_EVENT, {
      version: MCP_STATUS_SNAPSHOT_VERSION,
      servers: [{ name: "memory-server", status: "failed", toolCount: 0, disabled: false }],
      totalTools: 0,
      totalResources: 0,
      connectedCount: 0,
      disabledCount: 0,
    });
    const invoker = sessionOwnedMcpInvokerFor(harness.pi);
    harness.lifecycle("session_start");
    expect(invoker.serverState("memory-server")).toBe("not-connected");
  });

  it("delegates non-mcp registrations unchanged without capturing them", async () => {
    const harness = fakePi();
    const invoker = sessionOwnedMcpInvokerFor(harness.pi);
    let decorated!: AdapterSurface;
    adapterMock.install = (pi) => {
      decorated = pi;
      expect(pi.registerTool({ name: "mcpScript", execute: vi.fn() })).toBe(harness.registrationResult);
      expect(pi.registerTool({ name: "other", execute: vi.fn() })).toBe(harness.registrationResult);
    };
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");

    expect(harness.registered).toHaveLength(2);
    expect(harness.registerReceivers).toEqual([harness.surface, harness.surface]);
    await expect(invoker.invoke(invocation())).rejects.toThrow("unavailable");

    decorated.registerTool({ name: "mcp", execute: async () => success("bound") });
    await expect(invoker.invoke(invocation())).resolves.toBe("bound");
  });

  it("keeps captured tools scoped to their exact adapter surface", async () => {
    const first = fakePi();
    const second = fakePi();
    const firstInvoker = sessionOwnedMcpInvokerFor(first.pi);
    const secondInvoker = sessionOwnedMcpInvokerFor(second.pi);
    adapterMock.install = (pi) => pi.registerTool({ name: "mcp", execute: async () => success("second") });
    createAiliMcpExtension({ config: { mcpServers: {} } })(second.pi);
    second.lifecycle("session_start");

    await expect(secondInvoker.invoke(invocation())).resolves.toBe("second");
    await expect(firstInvoker.invoke(invocation())).rejects.toThrow("unavailable");
  });

  it.each(["shutdown", "generation", "registration"] as const)("fails an in-flight invocation after stale %s state", async (change) => {
    const harness = fakePi();
    const pending = deferred<unknown>();
    let decorated!: AdapterSurface;
    adapterMock.install = (pi) => {
      decorated = pi;
      pi.registerTool({ name: "mcp", execute: () => pending.promise });
    };
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");
    const running = sessionOwnedMcpInvokerFor(harness.pi).invoke(invocation());

    if (change === "shutdown") harness.lifecycle("session_shutdown");
    if (change === "generation") harness.lifecycle("session_start", { renewed: true } as unknown as ExtensionContext);
    if (change === "registration") decorated.registerTool({ name: "mcp", execute: async () => success("new") });
    pending.resolve(success("old"));

    await expect(running).rejects.toThrow("became stale");
  });

  it("passes caller cancellation to the registered tool", async () => {
    const harness = fakePi();
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    adapterMock.install = (pi) => pi.registerTool({
      name: "mcp",
      execute: (_id: string, _params: unknown, signal: AbortSignal | undefined) => new Promise((_resolve, reject) => {
        receivedSignal = signal;
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    });
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");

    const reason = new Error("caller cancelled");
    const running = sessionOwnedMcpInvokerFor(harness.pi).invoke(invocation({ signal: controller.signal }));
    controller.abort(reason);
    await expect(running).rejects.toBe(reason);
    expect(receivedSignal).toBe(controller.signal);
  });

  it.each([
    ["unknown tool", { tool: "other" }],
    ["extra argument", { args: { ...validArgs(), extra: true } }],
    ["oversized query", { args: { query: "q".repeat(251), limit: 4 } }],
    ["out-of-range limit", { args: { query: "q", limit: 33 } }],
    ["non-JSON argument", { args: { query: "q", limit: 4, context: new Date() } }],
  ])("rejects %s before execute", async (_label, override) => {
    const harness = fakePi();
    const execute = vi.fn(async () => success("unexpected"));
    adapterMock.install = (pi) => pi.registerTool({ name: "mcp", execute });
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");

    await expect(sessionOwnedMcpInvokerFor(harness.pi).invoke(invocation(override))).rejects.toThrow("not allowlisted");
    expect(execute).not.toHaveBeenCalled();
  });

  it("unwraps bounded JSON only when result identity matches", async () => {
    const harness = fakePi();
    adapterMock.install = (pi) => pi.registerTool({ name: "mcp", execute: async () => success({ ok: true, count: 2 }) });
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");
    await expect(sessionOwnedMcpInvokerFor(harness.pi).invoke(invocation())).resolves.toEqual({ ok: true, count: 2 });
  });

  it.each([
    ["details error", { details: { error: "no", mode: "call", server: "memory-server", tool: "mempalace_search", mcpResult: {} } }],
    ["server mismatch", success({}, "other-server")],
    ["tool mismatch", success({}, "memory-server", "mempalace_diary_write")],
    ["omitted output", { details: { mode: "call", server: "memory-server", tool: "mempalace_search" } }],
    ["spilled output", { details: { mode: "call", server: "memory-server", tool: "mempalace_search", mcpResult: { omitted: true, spillPath: "/tmp/result" } } }],
    ["non-JSON output", { details: { mode: "call", server: "memory-server", tool: "mempalace_search", mcpResult: { content: [{ type: "text", text: "not json" }] } } }],
    ["oversized output", { details: { mode: "call", server: "memory-server", tool: "mempalace_search", mcpResult: { content: [{ type: "text", text: JSON.stringify("x".repeat(16_385)) }] } } }],
  ])("fails closed for %s", async (_label, result) => {
    const harness = fakePi();
    adapterMock.install = (pi) => pi.registerTool({ name: "mcp", execute: async () => result });
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");
    await expect(sessionOwnedMcpInvokerFor(harness.pi).invoke(invocation())).rejects.toThrow(/MCP/);
  });

  it("claims approval only for the invocation-scoped exact server, tool, and args", async () => {
    const harness = fakePi();
    const claims: Array<{ label: string; decision?: () => McpToolApprovalDecision }> = [];
    const request = (label: string, serverName: string, originalToolName: string, args: Record<string, unknown>, origin = "proxy") => ({
      origin,
      serverName,
      originalToolName,
      args,
      claim(decision: () => McpToolApprovalDecision) {
        claims.push({ label, decision });
        return true;
      },
    });
    adapterMock.install = (pi) => pi.registerTool({
      name: "mcp",
      execute: async () => {
        harness.emit(MCP_TOOL_APPROVAL_REQUEST_EVENT, request("server", "other", "mempalace_search", validArgs()));
        harness.emit(MCP_TOOL_APPROVAL_REQUEST_EVENT, request("tool", "memory-server", "mempalace_diary_write", validArgs()));
        harness.emit(MCP_TOOL_APPROVAL_REQUEST_EVENT, request("args", "memory-server", "mempalace_search", { query: "different", limit: 4 }));
        harness.emit(MCP_TOOL_APPROVAL_REQUEST_EVENT, request("foreground", "memory-server", "mempalace_search", validArgs(), "interactive"));
        harness.emit(MCP_TOOL_APPROVAL_REQUEST_EVENT, request("exact", "memory-server", "mempalace_search", { limit: 4, query: "remember this" }));
        return success("ok");
      },
    });
    createAiliMcpExtension({ config: { mcpServers: {} } })(harness.pi);
    harness.lifecycle("session_start");

    await expect(sessionOwnedMcpInvokerFor(harness.pi).invoke(invocation())).resolves.toBe("ok");
    expect(claims.map((claim) => claim.label)).toEqual(["exact"]);
    expect(await claims[0]?.decision?.()).toBe("allow_once");

    harness.emit(MCP_TOOL_APPROVAL_REQUEST_EVENT, request("ordinary", "memory-server", "mempalace_search", validArgs()));
    expect(claims.map((claim) => claim.label)).toEqual(["exact"]);
  });
});
