import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRoleProfiles, type RoleProfile } from "../../src/runtime/roles.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import { FifoTurnScheduler } from "../../src/runtime/persistent-agents/scheduler.js";
import { FORMAL_RESULT_MAX_BYTES, TaskCoordinator, assertCurrentFormalRoleProfile, parseCanonicalFormalResult, truncateTaskOutput, type TaskExecutionOutput } from "../../src/runtime/persistent-agents/task-coordinator.js";
import { FORMAL_RUNTIME_LIMITS, TASK_TOOL_SCHEMA, validateTaskRequest } from "../../src/runtime/persistent-agents/task-schema.js";
import type { AgentRecord } from "../../src/runtime/persistent-agents/types.js";

let scratch = "";
let sequence = 0;
const schedulers: FifoTurnScheduler[] = [];

function continuationAudit(overrides: Record<string, unknown> = {}) {
  return {
    packageId: "P-01",
    canonicalRole: "aili.implementer",
    scope: "Implement only the exact fixture behavior.",
    forbiddenScope: "No unrelated changes.",
    writeScope: { paths: ["src"], resources: [] },
    acceptanceBoundary: "Focused verification passes.",
    expectedEvidence: "Focused result and exact anchors.",
    ...overrides,
  };
}

function canonicalResult(status: "completed" | "partial" | "blocked" | "unverified" = "completed"): string {
  return [
    "CANONICAL RESULT:", "result_id: result-P-01", "trace_id: trace-P-01", "lane: implementation",
    "owner: implementer", "package_id: P-01", "role_id: aili.implementer", `status: ${status}`,
    "confidence: HIGH", "worktree_context_ref: N/A", "declared_repository: fixture", "cwd: .",
    "target_rules_ref: AGENTS.md", "artifact_destination: N/A", "inspected_scope: fixture", "summary: result",
    "evidence: artifact:result/P-01", "changed_files: []", "verification: verification:focused-P-01",
    "checks: focused", "freshness: current", "skipped_checks: none", "soft_boundary_limitations: none",
    "blockers: none", "risks: none", "unverified: none", "continuation_recommendation: none",
    "findings: []", "convergence_links: N/A", "review_arbitration_ref: N/A",
  ].join("\n");
}

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
  repositoryRoot?: string;
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
    repositoryRoot: options.repositoryRoot,
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
  it("accepts only the exact bounded canonical formal terminal envelope", () => {
    const expected = { packageId: "P-01", roleId: "aili.implementer" };
    for (const status of ["completed", "partial", "blocked", "unverified"] as const) {
      expect(parseCanonicalFormalResult(canonicalResult(status), expected)).toMatchObject({ ok: true, value: { status } });
    }
    const valid = canonicalResult();
    const invalid = [
      "",
      "   ",
      "ordinary response",
      "[tool:read]",
      valid.replace("CANONICAL RESULT:\n", ""),
      valid.replace("package_id: P-01", "package_id: P-02"),
      valid.replace("role_id: aili.implementer", "role_id: aili.code-scout"),
      valid.replace("status: completed", "status: done"),
      valid.replace("evidence: artifact:result/P-01", "evidence: []"),
      valid.replace("verification: verification:focused-P-01", "verification: none"),
      valid.replace("summary: result", "summary: result\nsummary: duplicate"),
      valid.slice(0, valid.indexOf("verification:")),
      `${valid}\n${"x".repeat(FORMAL_RESULT_MAX_BYTES)}`,
    ];
    for (const output of invalid) expect(parseCanonicalFormalResult(output, expected).ok, output.slice(0, 40)).toBe(false);
  });
  it("strictly validates flat/batch inputs and canonical selectors before durable allocation", async () => {
    const { journal, profiles, coordinator } = await fixtureCoordinator();
    expect(validateTaskRequest({ task: "focused" }, profiles)).toMatchObject({
      batch: false,
      items: [{ task: "focused", agent: "general", workspace: "auto", writeScope: { paths: [], resources: [] } }],
    });
    expect(validateTaskRequest({ context: "shared", tasks: [{ task: "one" }, { task: "two", context: "local" }] }, profiles).items[1]?.context).toBe("shared\n\nlocal");
    expect(validateTaskRequest({ task: "formal", agent: "aili.implementer", async: false, writeScope: { paths: ["src"] }, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit() }, profiles).items[0]).toMatchObject({
      agent: "aili.implementer",
      async: false,
      formalContext: { changeId: "exact-change" },
      continuationAudit: continuationAudit(),
    });
    expect(() => validateTaskRequest({ task: "formal", formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/explicit Specialized agent selector/);
    expect(() => validateTaskRequest({ task: "formal", agent: "general", async: false, formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/explicit Specialized agent selector/);
    expect(() => validateTaskRequest({ task: "formal", agent: "aili.implementer", formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/explicit boolean async/);
    expect(() => validateTaskRequest({ task: "formal", agent: " aili.implementer ", async: true, formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/exact agent value/);
    expect(() => validateTaskRequest({ task: "x", unexpected: true }, profiles)).toThrow(/unknown fields/);
    expect(() => validateTaskRequest({ task: "x", formalContext: { changeId: "change", tasksPath: "tasks.md" } }, profiles)).toThrow(/formalContext contains unknown fields: tasksPath/);
    expect(() => validateTaskRequest({ tasks: [{ task: "x", formalContext: { changeId: "change", phase: "BUILD" } }] }, profiles)).toThrow(/formalContext contains unknown fields: phase/);
    expect(() => validateTaskRequest({ task: "x", formalContext: { changeId: " change " } }, profiles)).toThrow(/exact non-empty string/);
    expect(() => validateTaskRequest({ task: "formal", agent: "aili.implementer", async: false, formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/requires an exact continuationAudit sibling/);
    expect(() => validateTaskRequest({ task: "ordinary", continuationAudit: continuationAudit() }, profiles)).toThrow(/requires formalContext/);
    expect(() => validateTaskRequest({ task: "formal", agent: "aili.implementer", async: false, writeScope: { paths: ["src"] }, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit({ canonicalRole: "aili.code-scout" }) }, profiles)).toThrow(/canonicalRole must equal/);
    expect(() => validateTaskRequest({ task: "formal", agent: "aili.implementer", async: false, writeScope: { paths: ["src"] }, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit({ writeScope: { paths: [], resources: [] } }) }, profiles)).toThrow(/writeScope must equal/);
    expect(() => validateTaskRequest({ task: "formal", agent: "aili.implementer", async: false, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit({ writeScope: { paths: [], resources: [] } }) }, profiles)).toThrow(/non-empty normalized writeScope/);
    expect(() => validateTaskRequest({ task: "x", blocking: true }, profiles)).toThrow(/unknown fields: blocking/);
    const publicSchema = JSON.stringify(TASK_TOOL_SCHEMA);
    expect(publicSchema).toContain("Set false to wait synchronously");
    expect(publicSchema).toContain("Do not send blocking");
    expect(publicSchema).toContain("Choose an exact Specialized selector from the active task catalog");
    expect(publicSchema).toContain("Omit only for ordinary general compatibility");
    expect(publicSchema).toContain("formalContext");
    expect(publicSchema).toContain("changeId");
    expect(publicSchema).toContain("continuationAudit");
    expect(publicSchema).toContain("canonicalRole");
    expect(publicSchema).not.toContain("tasksPath");
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

  it("rejects an invalid formal batch atomically before Agent, job, turn, or execution allocation", async () => {
    let executions = 0;
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async () => {
        executions += 1;
        return { output: "must not execute" };
      },
    });

    await expect(coordinator.submit({
      tasks: [
        { task: "valid formal member", agent: "aili.implementer", async: false, writeScope: { paths: ["src"] }, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit() },
        { task: "invalid formal member", agent: "aili.code-scout", formalContext: { changeId: "exact-change" } },
      ],
    })).rejects.toThrow(/explicit boolean async/);

    expect(journal.getState()).toMatchObject({
      lastSequence: 0,
      agents: {},
      jobs: {},
      turns: {},
    });
    expect(executions).toBe(0);
  });

  it("enforces bounded exact continuation audits in runtime validation and TypeBox metadata", async () => {
    const profiles = await loadRoleProfiles();
    const formal = (audit: Record<string, unknown>) => ({
      task: "formal",
      agent: "aili.implementer",
      async: false,
      writeScope: (audit.writeScope as { paths?: string[]; resources?: string[] } | undefined) ?? { paths: ["src"], resources: [] },
      formalContext: { changeId: "exact-change" },
      continuationAudit: audit,
    });
    for (const [name, audit] of [
      ["multiline", continuationAudit({ scope: "line one\nline two" })],
      ["control", continuationAudit({ expectedEvidence: "bad\u0001evidence" })],
      ["field", continuationAudit({ acceptanceBoundary: "x".repeat(FORMAL_RUNTIME_LIMITS.auditFieldChars + 1) })],
      ["items", continuationAudit({ writeScope: { paths: Array.from({ length: FORMAL_RUNTIME_LIMITS.writeScopeItems + 1 }, (_, index) => `src/${index}`), resources: [] } })],
      ["item-length", continuationAudit({ writeScope: { paths: ["x".repeat(FORMAL_RUNTIME_LIMITS.writeScopeItemChars + 1)], resources: [] } })],
      ["total-size", continuationAudit({
        writeScope: {
          paths: [],
          resources: Array.from({ length: FORMAL_RUNTIME_LIMITS.writeScopeItems }, (_, index) => `${index}-`.padEnd(FORMAL_RUNTIME_LIMITS.writeScopeItemChars, "x")),
        },
      })],
    ] as const) {
      expect(() => validateTaskRequest(formal(audit), profiles), name).toThrow(/single line|exceeds/);
    }
    const publicSchema = JSON.stringify(TASK_TOOL_SCHEMA);
    expect(publicSchema).toContain(`\"maxItems\":${FORMAL_RUNTIME_LIMITS.writeScopeItems}`);
    expect(publicSchema).toContain(`\"maxLength\":${FORMAL_RUNTIME_LIMITS.auditFieldChars}`);
    expect(publicSchema).toContain("u001F");
  });

  it("requires a new formal Agent when any durable RoleProfile identity field drifts", async () => {
    const role = (await loadRoleProfiles()).find((candidate) => candidate.selector === "aili.implementer")!;
    const agent: AgentRecord = {
      id: "implementer",
      name: "implementer",
      selector: role.selector,
      state: "parked",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      metadata: {
        formalContinuationIdentity: continuationAudit(),
        selector: role.selector,
        profileHash: role.profileHash,
        sourceHash: role.sourceHash,
        profileVersion: role.profileVersion,
        runtimeAdapterVersion: role.runtimeAdapterVersion,
      },
    };
    expect(() => assertCurrentFormalRoleProfile(agent, role)).not.toThrow();
    for (const changed of [
      { ...agent, selector: "aili.code-scout" },
      { ...agent, metadata: { ...agent.metadata, selector: "aili.code-scout" } },
      { ...agent, metadata: { ...agent.metadata, profileHash: "changed" } },
      { ...agent, metadata: { ...agent.metadata, sourceHash: "changed" } },
      { ...agent, metadata: { ...agent.metadata, profileVersion: 1 } },
      { ...agent, metadata: { ...agent.metadata, runtimeAdapterVersion: 1 } },
    ]) {
      expect(() => assertCurrentFormalRoleProfile(changed, role)).toThrow(/create a new Agent/);
    }
    expect(() => assertCurrentFormalRoleProfile({ ...agent, metadata: { profileHash: "ordinary drift" } }, role)).not.toThrow();
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

  it("preserves the specialized Agent non-nesting spawn policy", async () => {
    let coordinator!: TaskCoordinator;
    let denied = false;
    const fixture = await fixtureCoordinator({
      execute: async (input) => {
        if (input.depth !== 0) return { output: "nested execution must not start" };
        const before = fixture.journal.getState().lastSequence;
        await expect(coordinator.submit(
          { task: "forbidden specialized child", agent: "aili.implementer", async: false },
          {
            parentAgentId: input.agentId,
            parentSelector: input.role.selector,
            parentDepth: input.depth,
            inheritedPermit: input.context.permit,
          },
        )).rejects.toThrow(/nested spawn denied/);
        expect(fixture.journal.getState().lastSequence).toBe(before);
        denied = true;
        return { output: "non-nesting preserved" };
      },
    });
    coordinator = fixture.coordinator;
    await coordinator.submit({ task: "specialized parent", agent: "aili.code-scout", async: false });
    expect(denied).toBe(true);
  });

  it("requires nested formal work to repeat the exact inherited formalContext before allocation", async () => {
    let coordinator!: TaskCoordinator;
    let checked = false;
    const fixture = await fixtureCoordinator({
      execute: async (input) => {
        if (input.depth !== 0) return { output: "unexpected nested execution" };
        const ancestry = {
          parentAgentId: input.agentId,
          parentSelector: input.role.selector,
          parentDepth: input.depth,
          inheritedPermit: input.context.permit,
          formalChangeId: "exact-change",
        };
        const before = fixture.journal.getState().lastSequence;
        await expect(coordinator.submit(
          { task: "missing formal context", agent: "aili.code-scout", async: false },
          ancestry,
        )).rejects.toThrow(/must explicitly repeat the exact same formalContext\.changeId/);
        await expect(coordinator.submit(
          { task: "wrong formal context", agent: "aili.code-scout", async: false, formalContext: { changeId: "other-change" }, continuationAudit: continuationAudit({ canonicalRole: "aili.code-scout", writeScope: { paths: [], resources: [] } }) },
          ancestry,
        )).rejects.toThrow(/must explicitly repeat the exact same formalContext\.changeId/);
        expect(fixture.journal.getState().lastSequence).toBe(before);
        checked = true;
        return { output: "formal ancestry checked" };
      },
    });
    coordinator = fixture.coordinator;
    await coordinator.submit({ task: "parent", async: false });
    expect(checked).toBe(true);
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
