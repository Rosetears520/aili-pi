import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CODEX_COMPACT_TOOL_NAME, wireContextPressure } from "../../src/runtime/context-pressure.js";
import { createAcpPressureEvaluator, type AcpPressureDecision, type AcpPressureEvaluator } from "../../upstream/billion-context-pi/dist/index.js";

type Handler = (event: any, ctx: any) => any;

const CODEX_MODEL = { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6" };
const OTHER_MODEL = { provider: "anthropic", api: "anthropic", id: "claude-test" };

function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, any>();
  const sendMessage = vi.fn();
  const pi = {
    on(name: string, handler: Handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    registerTool(tool: any) { tools.set(tool.name, tool); },
    registerCommand: vi.fn(),
    getActiveTools: () => [...tools.keys()],
    getAllTools: () => [...tools.values()],
    sendMessage,
  } as unknown as ExtensionAPI;
  return { pi, handlers, tools, sendMessage };
}

function fakeCtx(model: unknown = CODEX_MODEL) {
  const compact = vi.fn();
  const ctx = {
    model,
    cwd: "/fixture",
    sessionManager: {
      getSessionFile: () => "/fixture/session.jsonl",
      getSessionId: () => "s1",
    },
    compact,
  } as unknown as ExtensionContext;
  return { ctx, compact };
}

function decision(patch: Partial<AcpPressureDecision> = {}): AcpPressureDecision {
  return {
    shouldRelieve: false,
    emergency: false,
    tier: null,
    usage: 0.5,
    tokenCount: 100,
    contextLimit: 200,
    reason: "fixture",
    ...patch,
  };
}

function stubEvaluator(initial: AcpPressureDecision = decision()) {
  let next = initial;
  const observe = vi.fn(async () => next);
  const reset = vi.fn();
  const evaluator: AcpPressureEvaluator = { observe, reset };
  return { evaluator, observe, reset, set: (patch: Partial<AcpPressureDecision>) => { next = decision({ ...next, ...patch }); } };
}

function ownsCodex(ctx: ExtensionContext): boolean {
  return ctx.model?.provider === "openai-codex" && ctx.model.api === "openai-codex-responses";
}

function setup(stub = stubEvaluator()) {
  const runtime = fakePi();
  wireContextPressure(runtime.pi, { ownsCodexContext: ownsCodex, evaluator: stub.evaluator });
  return { ...runtime, stub };
}

describe("provider-routed context pressure", () => {
  it("makes a normal Codex pressure nudge advisory", async () => {
    const runtime = setup(stubEvaluator(decision({ shouldRelieve: true, usage: 0.23 })));
    const { ctx, compact } = fakeCtx();

    const result = await runtime.handlers.get("context")![0]!({ messages: [] }, ctx);
    const text = result.messages[0].content[0].text;

    expect(text).toContain("consider compaction");
    expect(text).toContain("continuing without compaction is valid");
    expect(text).toContain("only when both a safe boundary exists and whole-context compaction is materially useful");
    expect(text).not.toContain("earliest safe boundary");
    expect(text).not.toMatch(/must compact/i);
    expect(compact).not.toHaveBeenCalled();
  });

  it("makes an emergency Codex pressure nudge urgent without compacting", async () => {
    const runtime = setup(stubEvaluator(decision({ shouldRelieve: true, usage: 0.9, emergency: true })));
    const { ctx, compact } = fakeCtx();
    const original = [{ role: "user", content: "keep me" }];

    const result = await runtime.handlers.get("context")![0]!({ messages: original }, ctx);
    const text = result.messages[1].content[0].text;

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBe(original[0]);
    expect(text).toContain("Context pressure is critical");
    expect(text).toContain("At the earliest safe boundary, call compact_context()");
    expect(compact).not.toHaveBeenCalled();
    expect(runtime.handlers.has("turn_end")).toBe(false);
  });

  it("does nothing when ACP reports no pressure or the route is not Codex", async () => {
    const runtime = setup();
    expect(await runtime.handlers.get("context")![0]!({ messages: [] }, fakeCtx().ctx)).toBeUndefined();
    expect(await runtime.handlers.get("context")![0]!({ messages: [] }, fakeCtx(OTHER_MODEL).ctx)).toBeUndefined();
    expect(runtime.stub.observe).toHaveBeenCalledTimes(1);
  });

  it("lets ACP own normal timing by cancelling only Codex threshold compaction", async () => {
    const runtime = setup();
    const gate = runtime.handlers.get("session_before_compact")![0]!;
    const codex = fakeCtx().ctx;

    expect(await gate({ reason: "threshold" }, codex)).toEqual({ cancel: true });
    expect(await gate({ reason: "manual" }, codex)).toBeUndefined();
    expect(await gate({ reason: "overflow" }, codex)).toBeUndefined();
    expect(await gate({ reason: "threshold" }, fakeCtx(OTHER_MODEL).ctx)).toBeUndefined();
  });

  it("defers model-requested Codex compaction until agent_settled and resumes on success", async () => {
    const runtime = setup();
    const { ctx, compact } = fakeCtx();
    const tool = runtime.tools.get(CODEX_COMPACT_TOOL_NAME)!;

    const queued = await tool.execute("call-1", {}, undefined, undefined, ctx);
    expect(queued.content[0].text).toContain("queued");
    expect(compact).not.toHaveBeenCalled();

    await runtime.handlers.get("agent_settled")![0]!({}, ctx);
    expect(compact).toHaveBeenCalledTimes(1);
    const callbacks = compact.mock.calls[0]![0];
    expect(callbacks).toEqual(expect.objectContaining({ onComplete: expect.any(Function), onError: expect.any(Function) }));

    // Pi emits session_compact before ctx.compact's onComplete callback.
    await runtime.handlers.get("session_compact")![0]!({}, ctx);
    callbacks.onComplete();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage.mock.calls[0]![0]).toMatchObject({ customType: "aili-compaction-continuation", display: false });
    expect(runtime.sendMessage.mock.calls[0]![1]).toEqual({ deliverAs: "followUp", triggerTurn: true });
  });

  it("deduplicates queued requests and clears them after another successful compaction", async () => {
    const runtime = setup();
    const { ctx, compact } = fakeCtx();
    const tool = runtime.tools.get(CODEX_COMPACT_TOOL_NAME)!;

    await tool.execute("call-1", {}, undefined, undefined, ctx);
    const duplicate = await tool.execute("call-2", {}, undefined, undefined, ctx);
    expect(duplicate.content[0].text).toContain("already queued");

    await runtime.handlers.get("session_compact")![0]!({}, ctx);
    await runtime.handlers.get("agent_settled")![0]!({}, ctx);
    expect(compact).not.toHaveBeenCalled();
    expect(runtime.stub.reset).toHaveBeenCalledTimes(1);
  });

  it("does not deliver a stale continuation after the session is invalidated", async () => {
    const runtime = setup();
    const { ctx, compact } = fakeCtx();
    const tool = runtime.tools.get(CODEX_COMPACT_TOOL_NAME)!;

    await tool.execute("call-1", {}, undefined, undefined, ctx);
    await runtime.handlers.get("agent_settled")![0]!({}, ctx);
    const callbacks = compact.mock.calls[0]![0];
    await runtime.handlers.get("session_before_switch")![0]!({}, ctx);
    callbacks.onComplete();

    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["Pi cancellation", new Error("Compaction cancelled")],
    ["AbortError", Object.assign(new Error("abort-secret-detail"), { name: "AbortError" })],
  ])("continues after %s without labeling cancellation as failed", async (_label, error) => {
    const runtime = setup();
    const { ctx, compact } = fakeCtx();
    const tool = runtime.tools.get(CODEX_COMPACT_TOOL_NAME)!;

    await tool.execute("call-1", {}, undefined, undefined, ctx);
    await runtime.handlers.get("agent_settled")![0]!({}, ctx);
    compact.mock.calls[0]![0].onError(error);

    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    const continuation = runtime.sendMessage.mock.calls[0]![0].content;
    expect(continuation).toContain("was cancelled and did not complete");
    expect(continuation).not.toContain("failed");
    expect(continuation).not.toContain(error.message);
    expect(runtime.sendMessage.mock.calls[0]![1]).toEqual({ deliverAs: "followUp", triggerTurn: true });
  });

  it("continues without exposing provider errors when deferred compaction genuinely fails", async () => {
    const runtime = setup();
    const { ctx, compact } = fakeCtx();
    const tool = runtime.tools.get(CODEX_COMPACT_TOOL_NAME)!;

    await tool.execute("call-1", {}, undefined, undefined, ctx);
    await runtime.handlers.get("agent_settled")![0]!({}, ctx);
    compact.mock.calls[0]![0].onError(new Error("provider-secret-detail"));

    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(runtime.sendMessage.mock.calls[0]![0].content).toContain("compaction failed");
    expect(runtime.sendMessage.mock.calls[0]![0].content).not.toContain("provider-secret-detail");
  });

  it("blocks ACP range compression on Codex because those blocks are not projected", async () => {
    const runtime = setup();
    const gate = runtime.handlers.get("tool_call")![0]!;
    expect(await gate({ toolName: "compress", input: {} }, fakeCtx().ctx)).toEqual(expect.objectContaining({ block: true }));
    expect(await gate({ toolName: "compress", input: {} }, fakeCtx(OTHER_MODEL).ctx)).toBeUndefined();
  });

  it("rejects compact_context on non-Codex routes", async () => {
    const runtime = setup();
    const tool = runtime.tools.get(CODEX_COMPACT_TOOL_NAME)!;
    await expect(tool.execute("call-1", {}, undefined, undefined, fakeCtx(OTHER_MODEL).ctx)).rejects.toThrow("Codex Remote V2");
  });
});

describe("ACP pressure evaluator", () => {
  it("reuses the kernel nudge decision and resets its pressure epoch", async () => {
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
      expect((await evaluator.observe(ctx)).shouldRelieve).toBe(false);

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
      expect((await evaluator.observe(ctx)).shouldRelieve).toBe(true);

      evaluator.reset(ctx);
      expect((await evaluator.observe(ctx)).shouldRelieve).toBe(false);
    } finally {
      if (previousLimit === undefined) delete process.env.ACP_MODEL_CONTEXT_LIMIT;
      else process.env.ACP_MODEL_CONTEXT_LIMIT = previousLimit;
    }
  });
});
