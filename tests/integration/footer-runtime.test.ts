import { describe, expect, it, vi } from "vitest";
import nativeFooter from "../../extensions/footer/index.js";

type Handler = (event: unknown, context: any) => void;

function harness() {
  const handlers = new Map<string, Handler[]>();
  let footerFactory: ((tui: any, theme: any, data: any) => any) | undefined;
  const setFooter = vi.fn((factory) => { footerFactory = factory; });
  const pi = { on(event: string, handler: Handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); } };
  const ctx = {
    mode: "tui",
    cwd: "/tmp/project",
    model: { provider: "openai-codex", id: "gpt-5.6-sol" },
    getContextUsage: () => ({ percent: 25 }),
    ui: { setFooter },
  };
  nativeFooter(pi as never);
  const emit = (event: string, context = ctx) => handlers.get(event)?.forEach((handler) => handler({ type: event }, context));
  return { ctx, emit, setFooter, factory: () => footerFactory };
}

describe("Pi-native footer runtime", () => {
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
