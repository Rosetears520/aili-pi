import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PersistentAgentRuntime, type PersistentRuntimeExecutorInput } from "../../src/runtime/persistent-agents/runtime.js";
import type { ResolvedModelChoice } from "../../src/runtime/persistent-agents/model-selection.js";

let scratch = "";

function persistAssistant(input: PersistentRuntimeExecutorInput, text: string): void {
  input.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    api: "fixture",
    provider: "fixture",
    model: "fixture",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
  } as never);
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/task-hub-identity-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("task/hub/delivery/audit identity convergence", () => {
  it("preflights a batch atomically and propagates each frozen effective identity", async () => {
    const parent = join(scratch, "parent.jsonl");
    await writeFile(parent, "fixture parent\n");
    const choices: Record<string, ResolvedModelChoice> = {
      first: { provider: "provider-a", model: "model-a", canonical: "provider-a/model-a", layer: "one-shot", thinking: "high", persistent: false, oneShot: true },
      second: { provider: "provider-b", model: "model-b", canonical: "provider-b/model-b", layer: "parent-fallback", thinking: "medium", persistent: false, oneShot: false },
    };
    const deliveries: unknown[] = [];
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parent,
      parentId: "parent-1",
      cwd: scratch,
      preallocate: async ({ item }) => {
        if (item.task === "reject") throw new Error("injected unavailable model");
        return choices[item.task]!;
      },
      execute: async (input) => {
        const output = `done:${input.item.task}`;
        persistAssistant(input, output);
        return { output, model: input.modelChoice };
      },
      parentDelivery: {
        scanDeliveryIds: async () => new Set(),
        send: async (message) => { deliveries.push(message); return "sent"; },
      },
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });

    await expect(runtime.task.submit({ tasks: [{ task: "first" }, { task: "reject" }] })).rejects.toThrow(/unavailable model/);
    expect(runtime.journal.getState()).toMatchObject({ lastSequence: 0, agents: {}, jobs: {}, turns: {} });

    const response = await runtime.task.submit({ tasks: [{ task: "first" }, { task: "second" }] });
    expect(response.results[0]).toMatchObject({ status: "accepted", model: choices.first });
    expect(response.results[1]).toMatchObject({ status: "accepted", model: choices.second });
    await Promise.all([runtime.task.getSettlement("job-1"), runtime.task.getSettlement("job-2")]);

    const state = runtime.journal.getState();
    expect(state.turns["turn-1"].metadata).toMatchObject({ effectiveModel: "provider-a/model-a", provider: "provider-a", model: "model-a", modelLayer: "one-shot", thinking: "high" });
    expect(state.turns["turn-2"].metadata).toMatchObject({ effectiveModel: "provider-b/model-b", provider: "provider-b", model: "model-b", modelLayer: "parent-fallback", thinking: "medium" });
    expect(deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ details: expect.objectContaining({ agentId: "general", jobId: "job-1", effectiveModel: "provider-a/model-a", modelLayer: "one-shot", thinking: "high" }) }),
      expect.objectContaining({ details: expect.objectContaining({ agentId: "general-2", jobId: "job-2", effectiveModel: "provider-b/model-b", modelLayer: "parent-fallback", thinking: "medium" }) }),
    ]));
    expect(await runtime.hub.execute({ action: "jobs" })).toMatchObject({ jobs: expect.arrayContaining([
      expect.objectContaining({ id: "job-1", display: expect.objectContaining({ effectiveModel: "provider-a/model-a", effectiveMode: "async", turnId: "turn-1", outputRef: "agent://general", historyRef: "history://general" }) }),
      expect.objectContaining({ id: "job-2", display: expect.objectContaining({ effectiveModel: "provider-b/model-b", effectiveMode: "async", turnId: "turn-2", outputRef: "agent://general-2", historyRef: "history://general-2" }) }),
    ]) });
    expect(await runtime.hub.execute({ action: "list" })).toMatchObject({ agents: expect.arrayContaining([
      expect.objectContaining({ id: "general", display: expect.objectContaining({ effectiveModel: "provider-a/model-a", effectiveMode: "async", turnId: "turn-1" }) }),
      expect.objectContaining({ id: "general-2", display: expect.objectContaining({ effectiveModel: "provider-b/model-b", effectiveMode: "async", turnId: "turn-2" }) }),
    ]) });
    await runtime.shutdown();
  });
});
