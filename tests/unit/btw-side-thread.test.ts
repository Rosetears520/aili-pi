import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { BtwTuiController, buildBtwSideOnlyContext, registerBtwCommand } from "../../extensions/btw/index.js";
import { BtwSideThreadRuntime, type BtwSideTurnRequest } from "../../src/runtime/btw/side-thread.js";

function ids(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? `id-${index}`;
}

const selection = { provider: "openai-codex", model: "gpt-5.6", thinking: "high" as const };

describe("AILI in-memory BTW side threads", () => {
  it("requires explicit model and thinking selection and keeps side state isolated", () => {
    const runtime = new BtwSideThreadRuntime({ createId: ids("thread", "message", "steer") });
    expect(() => runtime.create({ provider: "", model: "gpt-5.6", thinking: "high" })).toThrow(/explicit provider and model/);
    expect(() => runtime.create({ provider: "openai-codex", model: "gpt-5.6", thinking: "invalid" as never })).toThrow(/explicit thinking/);

    const thread = runtime.create(selection);
    runtime.appendUser(thread.id, "Investigate the regression");
    runtime.queueSteering(thread.id, "Focus on the parser");

    expect(runtime.get(thread.id)).toMatchObject({
      selection,
      messages: [{ role: "user", text: "Investigate the regression" }],
      steeringQueue: ["Focus on the parser"],
    });
    // The runtime has no provider or Pi-session dependency; these calls only
    // mutate its own process-local maps.
    expect(runtime.takeSteering(thread.id)).toEqual(["Focus on the parser"]);
    expect(runtime.get(thread.id)?.steeringQueue).toEqual([]);
  });

  it("runs an injected selected-model side turn and appends only its answer", async () => {
    const calls: BtwSideTurnRequest[] = [];
    const runtime = new BtwSideThreadRuntime({
      createId: ids("thread", "question", "answer"),
      sideTurnRunner: async (request) => {
        calls.push(request);
        return "The deterministic side answer.";
      },
    });
    const thread = runtime.create(selection);
    runtime.queueSteering(thread.id, "Keep the answer concise");

    const result = await runtime.runSideTurn(thread.id, "What changed?");

    expect(calls).toEqual([expect.objectContaining({
      selection,
      question: "What changed?",
      steering: ["Keep the answer concise"],
      messages: [expect.objectContaining({ role: "user", text: "What changed?" })],
    })]);
    expect(result).toMatchObject({
      state: "idle",
      messages: [
        { role: "user", text: "What changed?" },
        { role: "assistant", text: "The deterministic side answer." },
      ],
      steeringQueue: [],
    });
  });

  it("passes selected model and thinking to the injected command runner without a main mutation", async () => {
    let handler: ((args: string, context: ExtensionCommandContext) => Promise<void>) | undefined;
    const requests: BtwSideTurnRequest[] = [];
    const notifications: string[] = [];
    const controller = new BtwTuiController(async (request) => {
      requests.push(request);
      return "Mocked independent side answer";
    });
    const pi = {
      registerCommand(name: string, command: { handler: (args: string, context: ExtensionCommandContext) => Promise<void> }) {
        if (name === "btw") handler = command.handler;
      },
      on() {},
    } as unknown as ExtensionAPI;
    registerBtwCommand(pi, controller);
    const selections = ["New side thread", "mock-provider / side-model", "high"];
    const inputs = ["What is isolated?"];
    const context = {
      mode: "tui",
      hasUI: true,
      sessionManager: { getSessionId: () => "command-session" },
      scopedModels: [{ model: { provider: "mock-provider", id: "side-model" } }],
      model: undefined,
      ui: {
        select: async () => selections.shift(),
        input: async () => inputs.shift(),
        notify: (message: string) => notifications.push(message),
      },
    } as unknown as ExtensionCommandContext;

    await handler!("", context);

    expect(requests).toEqual([expect.objectContaining({
      selection: { provider: "mock-provider", model: "side-model", thinking: "high" },
      question: "What is isolated?",
      steering: [],
    })]);
    expect(controller.runtime("command-session").list()).toMatchObject([{
      messages: [
        { role: "user", text: "What is isolated?" },
        { role: "assistant", text: "Mocked independent side answer" },
      ],
    }]);
    expect(notifications).toContain("BTW side answer retained only in the in-memory side thread");
  });

  it("bounds copied side material while retaining the current side question", () => {
    const context = buildBtwSideOnlyContext({
      threadId: "btw-bounded",
      selection,
      question: "What must the side turn answer?",
      messages: [{
        id: "message-long",
        role: "user",
        text: "x".repeat(30_000),
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
      steering: [],
    });
    const content = context.messages[0]?.content;

    expect(typeof content).toBe("string");
    expect(content).toContain("What must the side turn answer?");
    expect((content as string).length).toBeLessThan(25_000);
    expect(context.tools).toEqual([]);
  });

  it("binds the selected TUI model to ModelRegistry.complete with a bounded side-only context", async () => {
    let handler: ((args: string, context: ExtensionCommandContext) => Promise<void>) | undefined;
    const completeCalls: Array<{ model: unknown; context: unknown; options: unknown }> = [];
    const selectedModel = { provider: "mock-provider", id: "side-model", api: "pi-messages" };
    const pi = {
      registerCommand(name: string, command: { handler: (args: string, context: ExtensionCommandContext) => Promise<void> }) {
        if (name === "btw") handler = command.handler;
      },
      on() {},
    } as unknown as ExtensionAPI;
    registerBtwCommand(pi);
    const selections = ["New side thread", "mock-provider / side-model", "high"];
    const inputs = ["What remains isolated?"];
    const context = {
      mode: "tui",
      hasUI: true,
      sessionManager: { getSessionId: () => "registry-session" },
      scopedModels: [{ model: selectedModel }],
      model: undefined,
      modelRegistry: {
        find: (provider: string, model: string) => provider === "mock-provider" && model === "side-model" ? selectedModel : undefined,
        complete: async (model: unknown, sideContext: unknown, options: unknown) => {
          completeCalls.push({ model, context: sideContext, options });
          return { content: [{ type: "text", text: "Mocked registry side answer" }] };
        },
      },
      ui: {
        select: async () => selections.shift(),
        input: async () => inputs.shift(),
        notify() {},
      },
    } as unknown as ExtensionCommandContext;

    await handler!("", context);

    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0]?.model).toBe(selectedModel);
    expect(completeCalls[0]?.options).toEqual({ reasoning: "high" });
    expect(completeCalls[0]?.context).toMatchObject({
      tools: [],
      messages: [{
        role: "user",
        content: expect.stringContaining("What remains isolated?"),
      }],
    });
    expect(completeCalls[0]?.context).not.toHaveProperty("sessionManager");
  });

  it("previews without a main mutation and returns an editor draft only after authorization", () => {
    const runtime = new BtwSideThreadRuntime({ createId: ids("thread", "message-1", "message-2", "preview") });
    const thread = runtime.create(selection);
    runtime.appendUser(thread.id, "Compare the two approaches");
    runtime.appendAssistant(thread.id, "Approach A has fewer moving parts.");
    const before = runtime.get(thread.id);

    const preview = runtime.previewBringToMain(thread.id);
    expect(preview.text).toContain("User: Compare the two approaches");
    expect(preview.text).toContain("Assistant: Approach A has fewer moving parts.");
    expect(runtime.get(thread.id)).toEqual(before);
    expect(() => runtime.bringToMain(preview.previewId, "request-1", false)).toThrow(/writer authorization/);

    const draft = runtime.bringToMain(preview.previewId, "request-1", true);
    expect(draft.text).toBe(preview.text);
    expect(runtime.bringToMain(preview.previewId, "request-1", true)).toBe(draft);
  });

  it("cancels only the selected side thread and intentionally has no recovery state", () => {
    const runtime = new BtwSideThreadRuntime({ createId: ids("one", "two") });
    const first = runtime.create(selection);
    const second = runtime.create({ provider: "anthropic", model: "claude", thinking: "low" });
    runtime.queueSteering(first.id, "discard me");
    runtime.cancel(first.id);

    expect(runtime.get(first.id)).toMatchObject({ state: "cancelled", steeringQueue: [] });
    expect(runtime.get(second.id)?.state).toBe("idle");
    expect(() => runtime.appendUser(first.id, "not accepted")).toThrow(/cancelled/);

    runtime.clear();
    expect(runtime.list()).toEqual([]);
    expect(runtime.get(second.id)).toBeUndefined();
  });
});
