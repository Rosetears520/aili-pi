import { visibleWidth } from "@earendil-works/pi-tui";
import { MCP_STATUS_EVENT, MCP_STATUS_SNAPSHOT_VERSION, type McpStatusSnapshot } from "pi-mcp-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";
import nativeFooter from "../../extensions/footer/index.js";

type Handler = (event: unknown, context: any) => void;
type EventHandler = (value: unknown) => void;

function harness() {
  const handlers = new Map<string, Handler[]>();
  const eventHandlers = new Map<string, Set<EventHandler>>();
  let footerFactory: ((tui: any, theme: any, data: any) => any) | undefined;
  const setFooter = vi.fn((factory) => { footerFactory = factory; });
  const events = {
    emit(channel: string, value: unknown) {
      eventHandlers.get(channel)?.forEach((handler) => handler(value));
    },
    on(channel: string, handler: EventHandler) {
      const listeners = eventHandlers.get(channel) ?? new Set<EventHandler>();
      listeners.add(handler);
      eventHandlers.set(channel, listeners);
      return () => listeners.delete(handler);
    },
  };
  const pi = {
    events,
    on(event: string, handler: Handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); },
  };
  const ctx = {
    mode: "tui",
    cwd: "/tmp/project",
    model: { provider: "openai-codex", id: "gpt-5.6-sol", contextWindow: 272_000 },
    getContextUsage: () => ({ tokens: 17_000, contextWindow: undefined, percent: 90 }),
    ui: { setFooter },
  };
  nativeFooter(pi as never);
  const emit = (event: string, context = ctx) => handlers.get(event)?.forEach((handler) => handler({ type: event }, context));
  const emitRaw = (event: string, payload: Record<string, unknown>) =>
    handlers.get(event)?.forEach((handler) => handler({ type: event, ...payload }, ctx));
  const emitMcp = (snapshot: McpStatusSnapshot) => eventHandlers.get(MCP_STATUS_EVENT)?.forEach((handler) => handler(snapshot));
  return { ctx, emit, emitRaw, emitMcp, setFooter, factory: () => footerFactory };
}

function mcpSnapshot(): McpStatusSnapshot {
  return {
    version: MCP_STATUS_SNAPSHOT_VERSION,
    servers: [
      { name: "one", status: "not-connected", listenState: "disconnected", toolCount: 0, disabled: false },
      { name: "two", status: "cached", listenState: "not-listening", toolCount: 2, disabled: false },
      { name: "three", status: "not-connected", listenState: "disconnected", toolCount: 0, disabled: false },
      { name: "four", status: "not-connected", listenState: "disconnected", toolCount: 0, disabled: false },
      { name: "off", status: "disabled", listenState: "disconnected", toolCount: 0, disabled: true },
    ],
    totalTools: 2,
    totalResources: 0,
    connectedCount: 0,
    disabledCount: 1,
  };
}

afterEach(() => vi.useRealTimers());

describe("Pi-native footer runtime", () => {
  it("renders two aligned lines with actual token usage in the primary right group", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T19:48:00Z"));
    const runtime = harness();
    runtime.emit("session_start");
    const component = runtime.factory()!({ requestRender: vi.fn() }, { fg: (_color: string, text: string) => text }, {
      onBranchChange: () => vi.fn(),
      getExtensionStatuses: () => new Map([
        ["aili-provider-retry", "retrying"],
        ["pi-quota-status", "Wk 72%"],
        ["pi-cache-stats", "· OpenAI cache 3/10·0.002M/0.005M 40.0%"],
      ]),
      getGitBranch: () => "main",
    });

    const clock = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const lines = component.render(120);
    expect(lines[0].startsWith("openai-codex/gpt-5.6-sol")).toBe(true);
    expect(lines[0].endsWith(`17k/272k (6%) · Wk 72% · retrying`)).toBe(true);
    expect(lines[1].startsWith("project · main")).toBe(true);
    expect(lines[1].endsWith(`MCP 0/0 · ${clock}`)).toBe(true);
    expect(lines.map((line: string) => visibleWidth(line))).toEqual([120, 120]);
    expect(lines[1]).not.toContain("17k/272k (6%)");
    expect(lines.join(" ")).not.toContain("ctx 90%");
    expect(lines.join(" ")).not.toContain("OpenAI cache");
    component.dispose();
  });

  it("streams visible-text telemetry into the footer speed segment", () => {
    vi.useFakeTimers();
    const start = new Date("2025-01-01T19:48:00Z").getTime();
    vi.setSystemTime(start);
    const runtime = harness();
    runtime.emit("session_start");
    const component = runtime.factory()!({ requestRender: vi.fn() }, { fg: (_color: string, text: string) => text }, {
      onBranchChange: () => vi.fn(),
      getExtensionStatuses: () => new Map(),
      getGitBranch: () => "main",
    });

    // No speed segment while idle.
    expect(component.render(120)[1]).not.toContain("t/s");

    // Turn starts: waiting (reasoning) shows no speed text.
    runtime.emitRaw("message_start", { message: { role: "assistant" } });
    runtime.emitRaw("message_update", {
      message: { role: "assistant" },
      assistantMessageEvent: { type: "thinking_delta", delta: "d".repeat(2_000) },
    });
    expect(component.render(120)[1]).not.toContain("t/s");
    expect(component.render(120)[1]).not.toContain("avg");

    // Visible text: 100 tokens at T0, another 100 at T0+1s (text_delta only).
    runtime.emitRaw("message_update", {
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "a".repeat(400) },
    });
    vi.setSystemTime(start + 1_000);
    runtime.emitRaw("message_update", {
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "a".repeat(400) },
    });
    vi.setSystemTime(start + 1_500);
    expect(component.render(120)[1]).toContain("133 t/s");

    // Completion keeps the visible-text estimate (provider usage ignored)
    // and reports the text generation span, not the whole turn.
    vi.setSystemTime(start + 2_000);
    runtime.emitRaw("message_end", { message: { role: "assistant", usage: { output: 987 }, stopReason: "stop" } });
    expect(component.render(120)[1]).toContain("200 avg · 1.0s");
    vi.setSystemTime(start + 2_000 + 8_001);
    expect(component.render(120)[1]).not.toContain("avg");
    component.dispose();
  });

  it("never shows a speed reading for a pure tool-call turn", () => {
    vi.useFakeTimers();
    const start = new Date("2025-01-01T19:48:00Z").getTime();
    vi.setSystemTime(start);
    const runtime = harness();
    runtime.emit("session_start");
    const component = runtime.factory()!({ requestRender: vi.fn() }, { fg: (_color: string, text: string) => text }, {
      onBranchChange: () => vi.fn(),
      getExtensionStatuses: () => new Map(),
      getGitBranch: () => "main",
    });

    runtime.emitRaw("message_start", { message: { role: "assistant" } });
    for (let i = 1; i <= 4; i++) {
      vi.setSystemTime(start + i * 500);
      runtime.emitRaw("message_update", {
        message: { role: "assistant" },
        assistantMessageEvent: { type: "thinking_delta", delta: "d".repeat(500) },
      });
      runtime.emitRaw("message_update", {
        message: { role: "assistant" },
        assistantMessageEvent: { type: "toolcall_delta", delta: "{\"cmd\":\"ls\"}" },
      });
      expect(component.render(120)[1]).not.toContain("t/s");
    }
    vi.setSystemTime(start + 3_000);
    runtime.emitRaw("message_end", { message: { role: "assistant", usage: { output: 421 }, stopReason: "toolUse" } });
    expect(component.render(120)[1]).not.toContain("avg");
    component.dispose();
  });

  it("requests a redraw and renders the latest versioned MCP snapshot", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T19:48:00Z"));
    const runtime = harness();
    runtime.emit("session_start");
    const requestRender = vi.fn();
    const component = runtime.factory()!({ requestRender }, { fg: (_color: string, text: string) => text }, {
      onBranchChange: () => vi.fn(),
      getExtensionStatuses: () => new Map(),
      getGitBranch: () => "main",
    });

    expect(component.render(80)[1]).toContain("MCP 0/0");
    requestRender.mockClear();
    runtime.emitMcp(mcpSnapshot());
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(component.render(80)[1]).toContain("MCP 0/4");

    requestRender.mockClear();
    component.dispose();
    runtime.emitMcp(mcpSnapshot());
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("replaces and shuts down through Pi disposal without stale lifecycle ownership", () => {
    const runtime = harness();
    runtime.emit("session_start");
    const firstFactory = runtime.factory();
    expect(firstFactory).toBeTypeOf("function");
    const firstUnsubscribe = vi.fn();
    const firstComponent = firstFactory!({ requestRender: vi.fn() }, { fg: (_color: string, text: string) => text }, {
      onBranchChange: () => firstUnsubscribe,
      getExtensionStatuses: () => new Map([["pi-quota-status", "Wk 72%"]]),
      getGitBranch: () => "main",
    });

    runtime.emit("model_select");
    expect(runtime.setFooter).toHaveBeenCalledWith(undefined);
    firstComponent.dispose();
    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);

    const secondFactory = runtime.factory();
    const secondUnsubscribe = vi.fn();
    const secondComponent = secondFactory!({ requestRender: vi.fn() }, { fg: (_color: string, text: string) => text }, {
      onBranchChange: () => secondUnsubscribe,
      getExtensionStatuses: () => new Map(),
      getGitBranch: () => null,
    });
    runtime.emit("session_shutdown");
    secondComponent.dispose();
    expect(secondUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
