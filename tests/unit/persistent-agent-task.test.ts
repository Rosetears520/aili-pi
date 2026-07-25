import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRoleProfiles, type RoleProfile } from "../../src/runtime/roles.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import { FifoTurnScheduler } from "../../src/runtime/persistent-agents/scheduler.js";
import { TaskCoordinator, truncateTaskOutput, type TaskExecutionOutput } from "../../src/runtime/persistent-agents/task-coordinator.js";
import { TASK_TOOL_SCHEMA, validateTaskRequest } from "../../src/runtime/persistent-agents/task-schema.js";

let scratch = "";
let sequence = 0;
const schedulers: FifoTurnScheduler[] = [];

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function fixtureJournal(parentId = "parent-1") {
  const parentFile = join(scratch, `${parentId}.jsonl`);
  await writeFile(parentFile, "fixture parent\n");
  const layout = await ensureSidecarLayout(parentFile);
  return (await CoordinatorJournal.open(layout, parentId, {
    eventId: () => `event-${++sequence}`,
    clock: () => new Date(Date.UTC(2026, 6, 25, 1, 0, sequence)),
  })).journal;
}

async function fixtureCoordinator(options: {
  capacity?: number;
  profiles?: RoleProfile[];
  execute?: TaskCoordinator["submit"] extends never ? never : (input: Parameters<ConstructorParameters<typeof TaskCoordinator>[0]["execute"]>[0]) => Promise<TaskExecutionOutput>;
  onSettled?: ConstructorParameters<typeof TaskCoordinator>[0]["onSettled"];
  onAsyncSettled?: ConstructorParameters<typeof TaskCoordinator>[0]["onAsyncSettled"];
} = {}) {
  const journal = await fixtureJournal();
  const scheduler = new FifoTurnScheduler(options.capacity ?? 32);
  schedulers.push(scheduler);
  const profiles = options.profiles ?? await loadRoleProfiles();
  const coordinator = new TaskCoordinator({
    journal,
    scheduler,
    loadProfiles: async () => profiles,
    execute: options.execute ?? (async ({ item }) => ({ output: `done:${item.task}` })),
    onSettled: options.onSettled,
    onAsyncSettled: options.onAsyncSettled,
  });
  return { journal, scheduler, profiles, coordinator };
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-task-"));
  sequence = 0;
});

afterEach(async () => {
  await Promise.all(schedulers.splice(0).map((scheduler) => scheduler.close().catch(() => undefined)));
  await rm(scratch, { recursive: true, force: true });
});

describe("task schema and coordinator", () => {
  it("strictly validates flat/batch inputs and canonical selectors before durable allocation", async () => {
    const { journal, profiles, coordinator } = await fixtureCoordinator();
    expect(validateTaskRequest({ task: "focused" }, profiles)).toMatchObject({
      batch: false,
      items: [{ task: "focused", agent: "general", workspace: "auto", writeScope: { paths: [], resources: [] } }],
    });
    expect(validateTaskRequest({ context: "shared", tasks: [{ task: "one" }, { task: "two", context: "local" }] }, profiles).items[1]?.context).toBe("shared\n\nlocal");
    expect(() => validateTaskRequest({ task: "x", unexpected: true }, profiles)).toThrow(/unknown fields/);
    expect(() => validateTaskRequest({ task: "x", blocking: true }, profiles)).toThrow(/unknown fields: blocking/);
    const publicSchema = JSON.stringify(TASK_TOOL_SCHEMA);
    expect(publicSchema).toContain("Set false to wait synchronously");
    expect(publicSchema).toContain("Do not send blocking");
    expect(publicSchema).not.toContain("\"blocking\":");
    expect(() => validateTaskRequest({ tasks: [] }, profiles)).toThrow(/non-empty/);
    expect(() => validateTaskRequest({ task: "x", agent: "aili.general" }, profiles)).toThrow(/not canonical/);
    expect(() => validateTaskRequest({ task: "x", agent: "task" }, profiles)).toThrow(/not canonical/);
    expect(() => validateTaskRequest({ task: "x", tools: ["read", "read"] }, profiles)).toThrow(/duplicates/);

    await expect(coordinator.submit({
      tasks: [{ task: "valid" }, { task: "invalid", agent: "unknown" }],
    })).rejects.toThrow(/not canonical/);
    await expect(coordinator.submit({ task: "read ~/.ssh/id_ed25519" })).rejects.toThrow(/credential\/auth\/private-key/);
    expect(journal.getState().lastSequence).toBe(0);
    expect(journal.getState().agents).toEqual({});
  });

  it("creates a new stable Agent for every sync item and never requests async delivery", async () => {
    const delivered: string[] = [];
    const { coordinator, journal } = await fixtureCoordinator({
      onAsyncSettled: async (result) => { delivered.push(result.jobId); },
    });
    const first = await coordinator.submit({ task: "one", name: "Scout", async: false });
    const second = await coordinator.submit({ task: "two", name: "Scout", async: false });
    expect(first.results[0]).toMatchObject({
      status: "completed",
      agentId: "Scout",
      jobId: "job-1",
      effectiveMode: "sync",
      effectiveModeReason: "requested-sync",
      deliveryRequired: false,
      limits: { maxRuntimeMs: 0, softRequestBudget: 0 },
    });
    expect(second.results[0]).toMatchObject({ status: "completed", agentId: "Scout-2", jobId: "job-2" });
    expect(Object.keys(journal.getState().agents)).toEqual(["Scout", "Scout-2"]);
    expect(journal.getState().agents.Scout.state).toBe("idle");
    expect(journal.getState().agents["Scout-2"].state).toBe("idle");
    expect(delivered).toEqual([]);
  });

  it("serializes concurrent allocations without blocking their independent executions", async () => {
    const { coordinator, journal } = await fixtureCoordinator();
    const [first, second] = await Promise.all([
      coordinator.submit({ task: "first", name: "Scout", async: false }),
      coordinator.submit({ task: "second", name: "Scout", async: false }),
    ]);
    expect(first.results[0]).toMatchObject({ status: "completed", agentId: "Scout", jobId: "job-1" });
    expect(second.results[0]).toMatchObject({ status: "completed", agentId: "Scout-2", jobId: "job-2" });
    expect(Object.keys(journal.getState().agents)).toEqual(["Scout", "Scout-2"]);
  });

  it("defaults top-level work to async, reports blocking override, and delivers only async settlement", async () => {
    const gate = deferred<TaskExecutionOutput>();
    const delivered: string[] = [];
    const profiles = await loadRoleProfiles();
    const { coordinator, scheduler } = await fixtureCoordinator({
      profiles,
      execute: async () => await gate.promise,
      onAsyncSettled: async (result) => { delivered.push(result.jobId); },
    });
    const accepted = await coordinator.submit({ task: "background" });
    expect(accepted.results[0]).toMatchObject({
      status: "accepted",
      async: true,
      effectiveModeReason: "default-async",
      deliveryRequired: true,
    });
    expect(scheduler.stats().active).toBe(1);
    gate.resolve({ output: "background done" });
    const settled = await coordinator.getSettlement("job-1");
    expect(settled).toMatchObject({ status: "completed", output: "background done", deliveryRequired: true });
    await vi.waitFor(() => expect(delivered).toEqual(["job-1"]));

    const blockingProfiles = profiles.map((profile) => profile.selector === "general" ? { ...profile, blocking: true } : profile);
    const blocking = await fixtureCoordinator({ profiles: blockingProfiles });
    const result = await blocking.coordinator.submit({ task: "forced", async: true });
    expect(result.results[0]).toMatchObject({
      status: "completed",
      effectiveMode: "sync",
      effectiveModeReason: "role-blocking",
      deliveryRequired: false,
    });
  });

  it("turns output persistence failure into a durable failed job instead of false completion", async () => {
    const { coordinator, journal } = await fixtureCoordinator({
      onSettled: async () => { throw new Error("injected output write failure"); },
    });
    const response = await coordinator.submit({ task: "cannot persist", async: false });
    expect(response.results[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("output persistence failed: injected output write failure"),
      lifecycle: { agent: "idle", job: "failed", turn: "failed" },
    });
    expect(journal.getState().jobs["job-1"].state).toBe("failed");
    expect(journal.getState().turns["turn-1"].state).toBe("failed");
  });

  it("returns mixed batch settlements without converting a failed item into false success", async () => {
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async ({ item }) => item.task === "fail"
        ? { status: "failed", output: "partial evidence", error: "fixture failure" }
        : { output: `ok:${item.task}` },
    });
    const response = await coordinator.submit({
      context: "shared",
      tasks: [
        { task: "pass", async: false },
        { task: "fail", async: false, agent: "aili.code-scout" },
      ],
    });
    expect(response.batch).toBe(true);
    expect(response.results).toEqual([
      expect.objectContaining({ status: "completed", output: "ok:pass", selector: "general" }),
      expect.objectContaining({ status: "failed", output: "partial evidence", error: "fixture failure", selector: "aili.code-scout" }),
    ]);
    expect(journal.getState().jobs["job-1"].state).toBe("completed");
    expect(journal.getState().jobs["job-2"].state).toBe("failed");
    expect(journal.getState().agents.general.state).toBe("idle");
    expect(journal.getState().agents["code-scout"].state).toBe("idle");
  });

  it("runs exactly 32 top-level turns and starts the 33rd in durable FIFO order", async () => {
    const gates = new Map<string, ReturnType<typeof deferred<TaskExecutionOutput>>>();
    const started: string[] = [];
    const { coordinator, scheduler, journal } = await fixtureCoordinator({
      execute: async ({ jobId }) => {
        started.push(jobId);
        const gate = deferred<TaskExecutionOutput>();
        gates.set(jobId, gate);
        return await gate.promise;
      },
    });
    const response = await coordinator.submit({
      tasks: Array.from({ length: 33 }, (_, index) => ({ task: `task-${index + 1}` })),
    });
    expect(response.results).toHaveLength(33);
    await vi.waitFor(() => expect(started).toHaveLength(32));
    expect(scheduler.stats()).toMatchObject({ active: 32, queued: ["job-33"] });
    expect(journal.getState().jobs["job-33"].state).toBe("queued");

    gates.get("job-1")!.resolve({ output: "first done" });
    await vi.waitFor(() => expect(started).toHaveLength(33));
    expect(started[32]).toBe("job-33");
    for (const [jobId, gate] of gates) if (jobId !== "job-1") gate.resolve({ output: `${jobId} done` });
    await Promise.all(Array.from({ length: 33 }, (_, index) => coordinator.getSettlement(`job-${index + 1}`)!));
    expect(scheduler.stats().queued).toEqual([]);
  });

  it("cancels queued work before start and preserves explicit aborted lifecycle state", async () => {
    const firstGate = deferred<TaskExecutionOutput>();
    const { coordinator, scheduler, journal } = await fixtureCoordinator({
      capacity: 1,
      execute: async ({ jobId }) => jobId === "job-1" ? await firstGate.promise : { output: "should not run" },
    });
    await coordinator.submit({ task: "occupy" });
    await coordinator.submit({ task: "queued" });
    expect(scheduler.stats().queued).toEqual(["job-2"]);
    expect(await coordinator.cancel("job-2")).toBe("queued");
    expect(await coordinator.getSettlement("job-2")).toMatchObject({ status: "aborted", lifecycle: { agent: "aborted", job: "aborted", turn: "aborted" } });
    expect(journal.getState().jobs["job-2"].state).toBe("aborted");
    expect(journal.getState().agents["general-2"].state).toBe("aborted");
    firstGate.resolve({ output: "released" });
    await coordinator.getSettlement("job-1");
  });

  it("forces nested work to synchronous execution under the inherited ancestor permit", async () => {
    let coordinator!: TaskCoordinator;
    let nestedResponse: Awaited<ReturnType<TaskCoordinator["submit"]>> | undefined;
    const fixture = await fixtureCoordinator({
      execute: async (input) => {
        if (input.depth === 0) {
          nestedResponse = await coordinator.submit(
            { task: "nested scout", agent: "aili.code-scout", async: true },
            {
              parentAgentId: input.agentId,
              parentSelector: input.role.selector,
              parentDepth: input.depth,
              inheritedPermit: input.context.permit,
            },
          );
          return { output: "parent after nested" };
        }
        expect(input.context.nested).toBe(true);
        expect(input.context.maxRuntimeMs).toBe(0);
        return { output: "nested complete" };
      },
    });
    coordinator = fixture.coordinator;
    const result = await coordinator.submit({ task: "parent", async: false });
    expect(result.results[0]).toMatchObject({ status: "completed", agentId: "general" });
    expect(nestedResponse?.results[0]).toMatchObject({
      status: "completed",
      agentId: "general.code-scout",
      effectiveMode: "sync",
      effectiveModeReason: "nested-sync",
      deliveryRequired: false,
    });
    expect(fixture.scheduler.stats().active).toBe(0);

    const before = fixture.journal.getState().lastSequence;
    await expect(coordinator.submit(
      { task: "denied", agent: "aili.implementer" },
      {
        parentAgentId: "general.code-scout",
        parentSelector: "aili.code-scout",
        parentDepth: 1,
        inheritedPermit: { ownerJobId: "expired", token: Symbol("expired") },
      },
    )).rejects.toThrow(/active inherited ancestor permit/);
    expect(fixture.journal.getState().lastSequence).toBe(before);
  });

  it("does not impose request/runtime budgets and explicitly truncates oversized inline output", async () => {
    const large = Array.from({ length: 5_100 }, (_, index) => `${index}:${"x".repeat(110)}`).join("\n");
    const direct = truncateTaskOutput(large);
    expect(direct.truncation).toMatchObject({ truncated: true, limits: { bytes: 500_000, lines: 5_000 } });
    expect(direct.truncation.returnedBytes).toBeLessThanOrEqual(500_000);
    expect(direct.truncation.returnedLines).toBeLessThanOrEqual(5_000);
    expect(direct.output).toContain("5099:");

    let simulatedRequests = 0;
    const { coordinator } = await fixtureCoordinator({
      execute: async ({ context }) => {
        while (simulatedRequests < 250) simulatedRequests += 1;
        expect(context).toMatchObject({ maxRuntimeMs: 0, softRequestBudget: 0 });
        return { output: large };
      },
    });
    const result = await coordinator.submit({ task: "long", async: false });
    expect(simulatedRequests).toBe(250);
    expect(result.results[0]).toMatchObject({ status: "completed", truncation: { truncated: true } });
  });
});
