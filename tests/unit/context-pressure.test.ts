import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { wireContextPressure } from "../../src/runtime/context-pressure.js";
import { createAcpPressureEvaluator, type AcpPressureDecision, type AcpPressureEvaluator } from "../../upstream/billion-context-pi/dist/index.js";

type Handler = (event: unknown, ctx: unknown) => unknown;

function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const pi = {
    on(name: string, handler: Handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    getActiveTools: () => [],
    getAllTools: () => [],
  } as unknown as ExtensionAPI;
  return { pi, handlers };
}

const CODEX_MODEL = { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6" };
const OTHER_MODEL = { provider: "anthropic", api: "anthropic", id: "claude-test" };

function fakeCtx(model: unknown = CODEX_MODEL) {
  const compact = vi.fn();
  const ctx = {
    model,
    sessionManager: {
      getSessionFile: () => "/fixture/session.jsonl",
      getSessionId: () => "s1",
      buildContextEntries: () => [],
    },
    getContextUsage: () => ({ tokens: 1, contextWindow: 200_000, percent: null }),
    compact,
  };
  return { ctx: ctx as unknown as ExtensionContext, compact };
}

function ownsCodexOnly(ctx: ExtensionContext): boolean {
  return !!ctx.model && ctx.model.provider === "openai-codex";
}

function stubEvaluator(decision: Partial<AcpPressureDecision> = {}) {
  let next: AcpPressureDecision = {
    shouldRelieve: false,
    emergency: false,
    tier: null,
    usage: 0.5,
    tokenCount: 100,
    contextLimit: 200,
    reason: "stub",
    ...decision,
  };
  const observed: unknown[] = [];
  const resets: unknown[] = [];
  const evaluator: AcpPressureEvaluator = {
    observe: async (ctx) => {
      observed.push(ctx);
      return next;
    },
    reset: (ctx) => {
      resets.push(ctx);
    },
  };
  return { evaluator, observed, resets, setNext: (patch: Partial<AcpPressureDecision>) => { next = { ...next, ...patch }; } };
}

function wire(stub: ReturnType<typeof stubEvaluator>, log?: (message: string) => void) {
  const { pi, handlers } = fakePi();
  wireContextPressure(pi, { ownsCodexContext: ownsCodexOnly, evaluator: stub.evaluator, log });
  return { handlers };
}

describe("context pressure wiring", () => {
  it("does not compact when the ACP evaluator reports no pressure", async () => {
    const stub = stubEvaluator({ shouldRelieve: false });
    const { handlers } = wire(stub);
    const { ctx, compact } = fakeCtx();

    await handlers.get("turn_end")![0]!({}, ctx);
    expect(stub.observed).toHaveLength(1);
    expect(compact).not.toHaveBeenCalled();
  });

  it("compacts once per pressure epoch and holds repeated turn_end events", async () => {
    const stub = stubEvaluator({ shouldRelieve: true, emergency: false, usage: 0.6 });
    const { handlers } = wire(stub);
    const { ctx, compact } = fakeCtx();
    const turnEnd = handlers.get("turn_end")![0]!;

    await turnEnd({}, ctx);
    expect(compact).toHaveBeenCalledTimes(1);
    expect(compact.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ onComplete: expect.any(Function), onError: expect.any(Function) }),
    );

    // Same epoch: the in-flight guard skips observation entirely.
    await turnEnd({}, ctx);
    expect(compact).toHaveBeenCalledTimes(1);
    expect(stub.observed).toHaveLength(1);

    // Completion clears the guard and the next epoch observes again.
    compact.mock.calls[0]![0].onComplete();
    await turnEnd({}, ctx);
    expect(stub.observed).toHaveLength(2);
    expect(compact).toHaveBeenCalledTimes(2);
  });

  it("emergency decisions also compact through the same path", async () => {
    const stub = stubEvaluator({ shouldRelieve: true, emergency: true, usage: 0.85 });
    const { handlers } = wire(stub);
    const { ctx, compact } = fakeCtx();
    await handlers.get("turn_end")![0]!({}, ctx);
    expect(compact).toHaveBeenCalledTimes(1);
  });

  it("treats an evaluator failure as diagnostic-only and never compacts", async () => {
    const logs: string[] = [];
    const stub = stubEvaluator();
    stub.evaluator.observe = async () => {
      throw new Error("fixture observe failure");
    };
    const { handlers } = wire(stub, (message) => logs.push(message));
    const { ctx, compact } = fakeCtx();
    await handlers.get("turn_end")![0]!({}, ctx);
    expect(compact).not.toHaveBeenCalled();
    expect(logs.some((line) => line.includes("observe failed"))).toBe(true);
  });

  it("rebuilds the pressure baseline after a codex-route session_compact", async () => {
    const stub = stubEvaluator({ shouldRelieve: true });
    const { handlers } = wire(stub);
    const { ctx, compact } = fakeCtx();
    await handlers.get("turn_end")![0]!({}, ctx);
    expect(compact).toHaveBeenCalledTimes(1);

    await handlers.get("session_compact")![0]!({}, ctx);
    expect(stub.resets).toHaveLength(1);

    // In-flight was cleared by the compaction event, so the next turn observes.
    await handlers.get("turn_end")![0]!({}, ctx);
    expect(stub.observed).toHaveLength(2);
  });

  it("cancels Pi threshold auto-compaction only on codex-owned turns", async () => {
    const stub = stubEvaluator();
    const { handlers } = wire(stub);
    const gate = handlers.get("session_before_compact")![0]!;

    const codex = fakeCtx();
    expect(await gate({ reason: "threshold" }, codex.ctx)).toEqual({ cancel: true });
    expect(await gate({ reason: "manual" }, codex.ctx)).toBeUndefined();
    expect(await gate({ reason: "overflow" }, codex.ctx)).toBeUndefined();

    const other = fakeCtx(OTHER_MODEL);
    expect(await gate({ reason: "threshold" }, other.ctx)).toBeUndefined();

    const modelless = fakeCtx(null);
    expect(await gate({ reason: "threshold" }, modelless.ctx)).toBeUndefined();
  });

  it("ignores turn_end on non-codex and modelless contexts", async () => {
    const stub = stubEvaluator({ shouldRelieve: true });
    const { handlers } = wire(stub);
    await handlers.get("turn_end")![0]!({}, fakeCtx(OTHER_MODEL).ctx);
    await handlers.get("turn_end")![0]!({}, fakeCtx(null).ctx);
    expect(stub.observed).toHaveLength(0);
  });

  it("resets evaluator state on session_before_switch and session_shutdown", async () => {
    const stub = stubEvaluator();
    const { handlers } = wire(stub);
    const { ctx } = fakeCtx();
    handlers.get("session_before_switch")![0]!({}, ctx);
    handlers.get("session_shutdown")![0]!({}, ctx);
    expect(stub.resets).toHaveLength(2);
  });
});

describe("acp pressure evaluator", () => {
  it("drives relief from the real acp-kernel pressure decision and resets cleanly", async () => {
    const previousLimit = process.env.ACP_MODEL_CONTEXT_LIMIT;
    process.env.ACP_MODEL_CONTEXT_LIMIT = "200000";
    try {
      type FixtureEntry = { type: "message"; id: string; parentId: string | null; timestamp: string; message: { role: "user"; content: string } };
      let entries: FixtureEntry[] = [{ type: "message", id: "m1", parentId: null, timestamp: "11", message: { role: "user", content: "small baseline" } }];
      let tokens = 90_000;
      const ctx = {
        model: CODEX_MODEL,
        cwd: "/fixture",
        sessionManager: {
          getSessionFile: () => "/fixture/real-evaluator.jsonl",
          getSessionId: () => "real-1",
          buildContextEntries: () => entries,
        },
        getContextUsage: () => ({ tokens, contextWindow: 200_000, percent: null }),
      } as unknown as ExtensionContext;

      const evaluator = createAcpPressureEvaluator();
      // First observation only establishes the baseline.
      const first = await evaluator.observe(ctx);
      expect(first.shouldRelieve).toBe(false);
      expect(first.contextLimit).toBe(200_000);

      // ~10K estimated tokens per old message keeps every compressible range
      // above the kernel's 5K minimum; with the last 5 messages preserved the
      // T1 pending mass clears the 50K floor, and 30K of real growth clears
      // the ~22.5K adaptive floor — below the 80% emergency line.
      entries = [
        ...Array.from({ length: 10 }, (_, index) => ({
          type: "message" as const,
          id: `old-${index + 1}`,
          parentId: null,
          timestamp: `2${index}`,
          message: { role: "user" as const, content: "y".repeat(41_000) },
        })),
        { type: "message" as const, id: "recent", parentId: null, timestamp: "29", message: { role: "user" as const, content: "current turn" } },
      ];
      tokens = 120_000;
      const second = await evaluator.observe(ctx);
      expect(second.shouldRelieve).toBe(true);
      expect(second.emergency).toBe(false);
      expect(second.usage).toBeGreaterThan(0.5);

      // After a relief-driven compaction the baseline starts over.
      evaluator.reset(ctx);
      const third = await evaluator.observe(ctx);
      expect(third.shouldRelieve).toBe(false);
    } finally {
      if (previousLimit === undefined) delete process.env.ACP_MODEL_CONTEXT_LIMIT;
      else process.env.ACP_MODEL_CONTEXT_LIMIT = previousLimit;
    }
  });
});
