import { describe, expect, it, vi } from "vitest";
import { UiPromptActivityProjection, registerUiPromptActivity } from "../../src/runtime/ui-prompt-activity.js";
import { InteractionBroker } from "../../src/runtime/persistent-agents/interaction-broker.js";

const selectPrompt = { reason: "ui_prompt" as const, kind: "select" as const, title: "Prompt modifier" };

describe("Pi UI prompt activity projection", () => {
  it("projects start/end and coalesces nested prompt observations", () => {
    const activity = new UiPromptActivityProjection();
    expect(activity.snapshot()).toEqual({ state: "working" });
    expect(activity.start(selectPrompt)).toMatchObject({ state: "waiting-for-user", prompt: selectPrompt });
    activity.start({ reason: "ui_prompt", kind: "confirm", title: "Nested" });
    expect(activity.end()).toMatchObject({ state: "waiting-for-user", prompt: selectPrompt });
    expect(activity.end()).toEqual({ state: "working" });
  });

  it("clears an unfinished prompt on abort/settlement cleanup", () => {
    const activity = new UiPromptActivityProjection();
    activity.start({ reason: "ui_prompt", kind: "custom", title: "Questionnaire" });
    expect(activity.clear()).toEqual({ state: "working" });
    // A late best-effort end notification is harmless.
    expect(activity.end()).toEqual({ state: "working" });
  });

  it("registers notification-only, synchronous handlers for production status", () => {
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const pi = { on: (name: string, handler: (...args: any[]) => unknown) => handlers.set(name, handler) };
    const status = vi.fn();
    registerUiPromptActivity(pi as never);
    expect(handlers.get("ui_prompt_start")!(selectPrompt, { ui: { setStatus: status } })).toBeUndefined();
    expect(status).toHaveBeenLastCalledWith("aili-ui-activity", "Waiting for user: Prompt modifier");
    expect(handlers.get("ui_prompt_end")!({}, { ui: { setStatus: status } })).toBeUndefined();
    expect(status).toHaveBeenLastCalledWith("aili-ui-activity", undefined);
  });

  it("does not become a second InteractionBroker owner", async () => {
    const broker = new InteractionBroker();
    const gate = new Promise<string>(() => undefined);
    const pending = broker.request({
      kind: "question",
      agentId: "A",
      jobId: "J",
      request: {},
      render: async () => await gate,
      fallback: "deny",
    });
    expect(broker.pendingRecords()).toHaveLength(1);
    const activity = new UiPromptActivityProjection();
    activity.start(selectPrompt);
    activity.end();
    expect(broker.pendingRecords()).toHaveLength(1);
    broker.shutdown();
    expect(await pending).toBe("deny");
  });
});
