import { afterEach, describe, expect, it, vi } from "vitest";
import roseMatrixExtension from "../../extensions/matrix/index.js";

type Handler = (event: any, context?: any) => void;

function createHarness(themeName = "rose-cyberdeck") {
  const handlers = new Map<string, Handler>();
  const widgets: unknown[] = [];
  const commands = new Map<string, { handler(args: string, ctx: unknown): Promise<void> }>();
  const calls: Array<[string, unknown]> = [];
  let component: { render(width: number): string[] } | undefined;
  const ctx: any = {
    mode: "tui",
    ui: {
      theme: { name: themeName },
      setWorkingVisible: (value: boolean) => calls.push(["working-visible", value]),
      setWorkingMessage: () => calls.push(["working-message", undefined]),
      setWorkingIndicator: () => calls.push(["working-indicator", undefined]),
      setWidget: (_key: string, value: unknown) => {
        widgets.push(value);
        if (typeof value === "function") component = (value as (tui: unknown) => { render(width: number): string[] })({ requestRender() {} });
      },
      notify: (message: string) => calls.push(["notify", message]),
    },
  };
  const pi: any = {
    on(name: string, handler: Handler) { handlers.set(name, handler); },
    registerCommand(name: string, command: { handler(args: string, context: unknown): Promise<void> }) { commands.set(name, command); },
  };
  roseMatrixExtension(pi);
  return {
    ctx,
    emit(name: string, event: any = {}) { handlers.get(name)?.(event, ctx); },
    render() { return component?.render(120) ?? []; },
    calls,
    widgets,
    async command(name: string, args = "") { await commands.get(name)?.handler(args, ctx); },
  };
}

afterEach(() => {
  // Every test ends its run explicitly so its Matrix scheduler is cleared.
});

function status(harness: ReturnType<typeof createHarness>): string {
  return (harness.render()[0] ?? "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

describe("Rose Matrix lifecycle", () => {
  it("uses one five-line Widget and restores Pi defaults at agent end", () => {
    const harness = createHarness();
    harness.emit("agent_start");
    const lines = harness.render();
    expect(lines).toHaveLength(5);
    expect(harness.calls).toContainEqual(["working-visible", false]);

    harness.emit("agent_end");
    expect(harness.widgets.at(-1)).toBeUndefined();
    expect(harness.calls).toContainEqual(["working-visible", true]);
  });

  it("owns exactly one fake-clock timer and clears it on cleanup", () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      harness.emit("agent_start");
      expect(vi.getTimerCount()).toBe(1);
      harness.emit("agent_end");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is idempotent across repeated start and session cleanup", () => {
    const harness = createHarness();
    harness.emit("agent_start");
    harness.emit("agent_start");
    expect(harness.render()).toHaveLength(5);
    harness.emit("session_before_switch");
    expect(harness.widgets.at(-1)).toBeUndefined();
    harness.emit("agent_start");
    harness.emit("session_shutdown");
    expect(harness.widgets.at(-1)).toBeUndefined();
  });

  it("follows requesting → thinking → working and accepted final-tool requesting transition", () => {
    const harness = createHarness();
    harness.emit("agent_start");
    expect(status(harness)).toContain("Connecting to the model");

    harness.emit("message_update", { assistantMessageEvent: { type: "thinking_start", partial: {} } });
    expect(status(harness)).toContain("Weaving the next move");
    harness.emit("message_update", { assistantMessageEvent: { type: "text_delta", partial: {} } });
    expect(status(harness)).toContain("Composing the response");

    harness.emit("tool_execution_start", { toolCallId: "one" });
    harness.emit("tool_execution_start", { toolCallId: "two" });
    expect(status(harness)).toContain("Running tools");
    harness.emit("tool_execution_end", { toolCallId: "two" });
    expect(status(harness)).toContain("Running tools");
    harness.emit("tool_execution_end", { toolCallId: "one" });
    expect(status(harness)).toContain("Connecting to the model");
    harness.emit("message_update", { assistantMessageEvent: { type: "text_start", partial: {} } });
    expect(status(harness)).toContain("Composing the response");
    harness.emit("agent_end");
  });

  it("ignores duplicate tool ends and reports only direct multi-message output usage", () => {
    const harness = createHarness();
    harness.emit("agent_start");
    harness.emit("message_start", { message: { role: "assistant" } });
    harness.emit("message_update", { assistantMessageEvent: { type: "text_delta", partial: { usage: { output: 10 } } } });
    harness.emit("message_update", { assistantMessageEvent: { type: "done", message: { usage: { output: 12 } } } });
    harness.emit("message_end", { message: { role: "assistant", usage: { output: 12 } } });
    harness.emit("message_start", { message: { role: "assistant" } });
    harness.emit("message_update", { assistantMessageEvent: { type: "text_delta", partial: { usage: { output: 4 } } } });
    expect(status(harness)).toContain("16 output tokens");
    harness.emit("tool_execution_start", { toolCallId: "tool" });
    harness.emit("tool_execution_end", { toolCallId: "tool" });
    harness.emit("tool_execution_end", { toolCallId: "tool" });
    expect(status(harness)).toContain("Connecting to the model");
    harness.emit("agent_end");
  });

  it("fails closed for an unknown auto theme without taking over Pi's Working Line", () => {
    const harness = createHarness("custom-theme");
    harness.emit("agent_start");
    expect(harness.render()).toEqual([]);
    expect(harness.calls).not.toContainEqual(["working-visible", false]);
    expect(harness.calls.some(([, message]) => String(message).includes("appearance dark|light"))).toBe(true);
  });

  it("keeps /sakura-matrix as a notifying alias for /rose-matrix", async () => {
    const harness = createHarness();
    await harness.command("sakura-matrix", "status");
    expect(harness.calls.some(([, message]) => String(message).includes("deprecated"))).toBe(true);
    expect(harness.calls.some(([, message]) => String(message).includes("Rose Matrix:"))).toBe(true);
  });
});
