import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanDeliveryIdsFromParentEntries } from "../../src/runtime/persistent-agents/output-delivery.js";
import {
  PersistentAgentRuntime,
  registerPersistentAgentTools,
  type PersistentRuntimeExecutorInput,
} from "../../src/runtime/persistent-agents/runtime.js";

let scratch = "";

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function persistAssistant(input: PersistentRuntimeExecutorInput, text: string): void {
  input.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    api: "fixture",
    provider: "fixture",
    model: "fixture",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
  } as never);
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-runtime-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("internal persistent Agent runtime wiring", () => {
  it("connects task, official child JSONL, output/history, async delivery, stable resume IDs, and no provider replay", async () => {
    const parentFile = join(scratch, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const parentEntries: unknown[] = [];
    let executions = 0;
    const create = () => PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-1",
      cwd: scratch,
      execute: async (input) => {
        executions += 1;
        const output = `execution-${executions}:${input.item.task}`;
        persistAssistant(input, output);
        return { output, model: { provider: "fixture", model: "offline", layer: "parent-fallback" } };
      },
      parentDelivery: {
        scanDeliveryIds: async () => scanDeliveryIdsFromParentEntries(parentEntries),
        send: async (message) => {
          parentEntries.push({ type: "custom_message", ...message });
          return "sent";
        },
      },
      revive: async () => ({
        steer() {},
        sendUserMessage() {},
        dispose() {},
      }),
    });

    const runtime = await create();
    const sync = await runtime.task.submit({ task: "sync work", name: "Scout", async: false });
    expect(sync.results[0]).toMatchObject({ status: "completed", agentId: "Scout", outputRef: "agent://Scout" });
    const scout = runtime.journal.getState().agents.Scout;
    expect(scout.sessionPath).toBeTruthy();
    expect(await readFile(scout.sessionPath!, "utf8")).toContain("execution-1:sync work");
    expect(await runtime.hub.execute({ action: "output", agentId: "Scout" })).toMatchObject({ content: "execution-1:sync work" });
    expect(await runtime.hub.execute({ action: "history", agentId: "Scout" })).toMatchObject({ content: expect.stringContaining("execution-1:sync work") });
    expect(parentEntries).toEqual([]);

    const accepted = await runtime.task.submit({ task: "async work", name: "Worker" });
    expect(accepted.results[0]).toMatchObject({ status: "accepted", agentId: "Worker", jobId: "job-2" });
    await runtime.task.getSettlement("job-2");
    expect(parentEntries).toHaveLength(1);
    expect(scanDeliveryIdsFromParentEntries(parentEntries)).toEqual(new Set(["delivery-job-2"]));
    await runtime.shutdown();

    const beforeResumeExecutions = executions;
    const resumed = await create();
    expect(executions).toBe(beforeResumeExecutions);
    expect(resumed.journal.getState().agents).toMatchObject({ Scout: { state: "idle" }, Worker: { state: "idle" } });
    const next = await resumed.task.submit({ task: "new identity", name: "Scout", async: false });
    expect(next.results[0]).toMatchObject({ agentId: "Scout-2", jobId: "job-3" });
    expect(executions).toBe(beforeResumeExecutions + 1);
    await resumed.shutdown();
  });

  it("registers only canonical internal task/hub tools and the direct-user model command", async () => {
    const parentFile = join(scratch, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-1",
      cwd: scratch,
      execute: async (input) => {
        persistAssistant(input, "tool result");
        return { output: "tool result" };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });
    const tools = new Map<string, any>();
    const commands = new Map<string, any>();
    const directCalls: string[] = [];
    registerPersistentAgentTools({
      registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
      registerCommand(name: string, command: unknown) { commands.set(name, command); },
    } as never, {
      runtimeForContext: async () => runtime,
      directModelCommand: async (args) => {
        directCalls.push(args);
        return "model updated";
      },
    });
    expect([...tools.keys()]).toEqual(["task", "hub"]);
    expect([...tools.keys()]).not.toContain("subagent");
    expect([...tools.keys()]).not.toContain("aili_task");
    expect(commands.has("aili-agent-model")).toBe(true);

    const context = { ui: { notify() {} } } as never;
    const taskResult = await tools.get("task").execute("call-1", { task: "internal", async: false }, new AbortController().signal, undefined, context);
    expect(JSON.parse(taskResult.content[0].text)).toMatchObject({ results: [expect.objectContaining({ status: "completed" })] });
    await commands.get("aili-agent-model").handler("global general provider/model", context);
    expect(directCalls).toEqual(["global general provider/model"]);
    await runtime.shutdown();
  });

  it("leaves legacy runs, user config, and unrelated old/new sidecars byte-identical through migration and rollback", async () => {
    const legacyRun = join(scratch, ".pi", "agent", "runs", "run-old", "result.json");
    const userConfig = join(scratch, ".pi", "agent", "settings.json");
    const unrelatedSidecar = join(scratch, "old-parent", "aili-agents", "coordinator.jsonl");
    await mkdir(resolve(legacyRun, ".."), { recursive: true });
    await mkdir(resolve(userConfig, ".."), { recursive: true });
    await mkdir(resolve(unrelatedSidecar, ".."), { recursive: true });
    await writeFile(legacyRun, "legacy-run-bytes\n");
    await writeFile(userConfig, "user-config-bytes\n");
    await writeFile(unrelatedSidecar, "unrelated-sidecar-bytes\n");
    const before = {
      legacy: digest(await readFile(legacyRun)),
      config: digest(await readFile(userConfig)),
      sidecar: digest(await readFile(unrelatedSidecar)),
    };

    const parentFile = join(scratch, "new-parent.jsonl");
    await writeFile(parentFile, "new parent\n");
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "new-parent",
      cwd: scratch,
      execute: async (input) => {
        persistAssistant(input, "new output");
        return { output: "new output" };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "unavailable" },
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });
    await runtime.task.submit({ task: "new runtime only", async: false });
    await runtime.shutdown();

    expect(digest(await readFile(legacyRun))).toBe(before.legacy);
    expect(digest(await readFile(userConfig))).toBe(before.config);
    expect(digest(await readFile(unrelatedSidecar))).toBe(before.sidecar);
    expect(runtime.layout.root).not.toBe(resolve(unrelatedSidecar, "../.."));
  });
});
