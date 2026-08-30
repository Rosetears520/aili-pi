import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRoleProfiles, type RoleProfile } from "../../src/runtime/roles.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import { FifoTurnScheduler } from "../../src/runtime/persistent-agents/scheduler.js";
import { FORMAL_RESULT_FIELDS, FORMAL_RESULT_MAX_BYTES, SubCoordinator, assertCurrentFormalRoleProfile, parseCanonicalFormalResult, renderCanonicalFormalResultInstruction, truncateTaskOutput, type TaskExecutionOutput } from "../../src/runtime/persistent-agents/sub-coordinator.js";
import { FORMAL_RUNTIME_LIMITS, FORMAL_TASK_REQUEST_SCHEMA, SUB_TOOL_SCHEMA, validateFormalTaskRequest, validateSubRequest } from "../../src/runtime/persistent-agents/sub-schema.js";
import type { AgentRecord } from "../../src/runtime/persistent-agents/types.js";
import type { ResolvedModelChoice } from "../../src/runtime/persistent-agents/model-selection.js";

let scratch = "";
let sequence = 0;
const schedulers: FifoTurnScheduler[] = [];

function continuationAudit(overrides: Record<string, unknown> = {}) {
  return {
    packageId: "P-01",
    canonicalRole: "aili.implementer",
    scope: "Implement only the exact fixture behavior.",
    forbiddenScope: "No unrelated changes.",
    writeScope: { paths: [], resources: [] },
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

// AbortSignal never replays a past abort to late addEventListener callers, so
// executor fixtures must treat an already-aborted signal as settled now.
function abortRace(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new Error("fixture aborted by parent signal"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("fixture aborted by parent signal")), { once: true });
  });
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
  parentId?: string;
  execute?: (input: Parameters<ConstructorParameters<typeof SubCoordinator>[0]["execute"]>[0]) => Promise<TaskExecutionOutput>;
  preflight?: ConstructorParameters<typeof SubCoordinator>[0]["preflight"];
  onSettled?: ConstructorParameters<typeof SubCoordinator>[0]["onSettled"];
  onAsyncSettled?: ConstructorParameters<typeof SubCoordinator>[0]["onAsyncSettled"];
} = {}) {
  const journal = await fixtureJournal(options.parentId);
  const scheduler = new FifoTurnScheduler(options.capacity ?? 32);
  schedulers.push(scheduler);
  const profiles = options.profiles ?? await loadRoleProfiles();
  const coordinator = new SubCoordinator({
    journal,
    scheduler,
    repositoryRoot: options.repositoryRoot,
    loadProfiles: async () => profiles,
    preflight: options.preflight,
    execute: options.execute ?? (async ({ item }) => ({ output: `done:${item.task}` })),
    onSettled: options.onSettled,
    onAsyncSettled: options.onAsyncSettled,
  });
  return { journal, scheduler, profiles, coordinator };
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-sub-"));
  sequence = 0;
});

afterEach(async () => {
  await Promise.all(schedulers.splice(0).map((scheduler) => scheduler.close().catch(() => undefined)));
  await rm(scratch, { recursive: true, force: true });
});

describe("sub schema and coordinator", () => {
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
  it("renders formal instructions from the parser-owned inventory with exact identities", () => {
    const instruction = renderCanonicalFormalResultInstruction({ packageId: "P-01", roleId: "aili.implementer" });
    const envelope = instruction.slice(instruction.indexOf("CANONICAL RESULT:"));
    const lines = envelope.split("\n");
    expect(lines[0]).toBe("CANONICAL RESULT:");
    expect(lines.slice(1).map((line) => line.slice(0, line.indexOf(":")))).toEqual(FORMAL_RESULT_FIELDS);
    expect(lines).toContain("package_id: P-01");
    expect(lines).toContain("role_id: aili.implementer");
    expect(instruction).toContain("JSON output is forbidden");
    expect(() => renderCanonicalFormalResultInstruction({ packageId: "P-01\nP-02", roleId: "aili.implementer" })).toThrow(/one exact non-empty line/);
  });

  it("validates the exact public sub surface and canonical selectors before durable allocation", async () => {
    const { journal, profiles, coordinator } = await fixtureCoordinator();
    expect(validateSubRequest({ description: "scout", prompt: "focused", subagent_type: "general" }, profiles)).toMatchObject({
      description: "scout",
      item: { task: "focused", agent: "general", name: "scout", async: undefined, workspace: "auto", writeScope: { paths: [], resources: [] } },
    });
    expect(validateSubRequest({ description: "fg", prompt: "work", subagent_type: "general" }, profiles).item.async).toBeUndefined();
    expect(validateSubRequest({ description: "x", prompt: "y", subagent_type: "general", background: true }, profiles).item.async).toBe(true);
    expect(validateSubRequest({ description: "cont", prompt: "more", task_id: "Scout" }, profiles).taskId).toBe("Scout");
    expect(validateSubRequest({ description: "snippet", prompt: "work", subagent_type: "general", snippets: ["diagnose"] }, profiles).item.snippets).toEqual(["diagnose"]);
    expect(validateSubRequest({ description: "cli", prompt: "work", subagent_type: "general", cli: "claude-code" }, profiles).item.cli).toBe("claude-code");
    expect(() => validateSubRequest({ description: "cli", prompt: "work", subagent_type: "general", cli: "claude" }, profiles)).toThrow(/sub\.cli must be one of/);
    expect(() => validateSubRequest({ prompt: "no description" }, profiles)).toThrow(/sub\.description is required/);
    expect(() => validateSubRequest({ description: "x" }, profiles)).toThrow(/sub\.prompt is required/);
    expect(() => validateSubRequest({ description: "x", prompt: "y" }, profiles)).toThrow(/subagent_type is required when creating a new task/);
    expect(() => validateSubRequest({ description: "x", prompt: "y", subagent_type: "aili.general" }, profiles)).toThrow(/not canonical/);
    expect(() => validateSubRequest({ description: "x", prompt: "y", subagent_type: "general", thinking: "turbo" }, profiles)).toThrow(/off, minimal, low, medium, high, xhigh, max/);
    expect(() => validateSubRequest({ description: "x", prompt: "y", subagent_type: "general", task: "legacy" }, profiles)).toThrow(/unknown fields: task/);
    expect(() => validateSubRequest({ description: "x", prompt: "y", subagent_type: "general", tasks: [] }, profiles)).toThrow(/unknown fields: tasks/);
    expect(() => validateSubRequest({ description: "x", prompt: "y", task_id: "../escape" }, profiles)).toThrow(/safe task identity/);
    expect(validateFormalTaskRequest({ task: "formal", agent: "aili.implementer", async: false, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit() }, profiles).items[0]).toMatchObject({
      agent: "aili.implementer",
      async: false,
      formalContext: { changeId: "exact-change" },
      continuationAudit: continuationAudit(),
    });
    expect(() => validateFormalTaskRequest({ task: "formal", formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/explicit Specialized agent selector/);
    expect(() => validateFormalTaskRequest({ task: "formal", agent: "general", async: false, formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/explicit Specialized agent selector/);
    expect(() => validateFormalTaskRequest({ task: "formal", agent: "aili.implementer", formalContext: { changeId: "exact-change" } }, profiles)).toThrow(/explicit boolean async/);
    expect(() => validateFormalTaskRequest({ task: "x", blocking: true }, profiles)).toThrow(/unknown fields: blocking/);
    const publicSchema = JSON.stringify(SUB_TOOL_SCHEMA);
    expect(publicSchema).toContain("subagent_type");
    expect(publicSchema).toContain("task_id");
    expect(publicSchema).toContain("background");
    expect(publicSchema).toContain("per-turn provider/model request");
    expect(publicSchema).not.toContain("gpt-5.6-terra");
    // The public surface has no batch, orchestration, or formal identity fields.
    expect(publicSchema).not.toContain("\"tasks\"");
    expect(publicSchema).not.toContain("writeScope");
    expect(publicSchema).not.toContain("formalContext");
    expect(publicSchema).not.toContain("continuationAudit");
    const formalSchema = JSON.stringify(FORMAL_TASK_REQUEST_SCHEMA);
    expect(formalSchema).toContain("formalContext");
    expect(formalSchema).toContain("changeId");
    expect(formalSchema).toContain("continuationAudit");
    expect(formalSchema).toContain("canonicalRole");

    await expect(coordinator.submit({ description: "unknown", prompt: "valid" })).rejects.toThrow(/subagent_type is required/);
    await expect(coordinator.submit({ description: "unknown", prompt: "valid", subagent_type: "unknown" })).rejects.toThrow(/not canonical/);
    await expect(coordinator.submit({ description: "read keys", prompt: "read ~/.ssh/id_ed25519", subagent_type: "general" })).rejects.toThrow(/credential\/auth\/private-key/);
    expect(journal.getState().lastSequence).toBe(0);
    expect(journal.getState().agents).toEqual({});
  });

  it("resolves every model choice before allocation and rejects an invalid request without allocating", async () => {
    const choices: ResolvedModelChoice[] = [
      { provider: "provider", model: "one", canonical: "provider/one", layer: "one-shot", thinking: "high", source: "confirmed-one-shot", modelSource: "user-one-shot", thinkingSource: "user-one-shot", persistent: false, oneShot: true },
      { provider: "provider", model: "two", canonical: "provider/two", layer: "parent-fallback", thinking: "medium", source: "inherited-parent", modelSource: "inherited-parent", thinkingSource: "inherited-parent", persistent: false, oneShot: false },
    ];
    const preflight = vi.fn(async ({ item }: { item: { task: string } }) => {
      if (item.task === "invalid model") throw new Error("one-shot model is unauthenticated");
      return choices[0]!;
    });
    const { coordinator, journal } = await fixtureCoordinator({ preflight });
    const valid = await coordinator.submit({ description: "valid", prompt: "valid model", subagent_type: "general", model: "provider/one" });
    expect(valid.results[0]).toMatchObject({ status: "completed", effectiveModel: "provider/one" });
    await expect(coordinator.submit({ description: "invalid", prompt: "invalid model", subagent_type: "general", model: "provider/two" })).rejects.toThrow(/unauthenticated/);
    expect(preflight).toHaveBeenCalledTimes(2);
    expect(Object.keys(journal.getState().agents)).toEqual(["valid"]);

    const acceptedFixture = await fixtureCoordinator({
      parentId: "parent-2",
      preflight: async ({ item }) => item.model === "provider/one" ? choices[0]! : choices[1]!,
      execute: async ({ modelChoice }) => ({ output: "ok", model: modelChoice }),
    });
    const accepted = await acceptedFixture.coordinator.submitTrusted({ task: "first turn", agent: "general", async: true, model: "provider/one" });
    const acceptedTwo = await acceptedFixture.coordinator.submitTrusted({ task: "second turn", agent: "general", async: true });
    expect(accepted.results[0]).toMatchObject({ status: "accepted", name: "general", requestedModel: "provider/one", effectiveModel: "provider/one", modelLayer: "one-shot", thinking: "high", source: "confirmed-one-shot", model: { provider: "provider", model: "one", layer: "one-shot", thinking: "high" } });
    expect(acceptedTwo.results[0]).toMatchObject({ status: "accepted", model: { provider: "provider", model: "two", layer: "parent-fallback", thinking: "medium" } });
    expect(acceptedFixture.journal.getState().turns["turn-1"].metadata).toMatchObject({ effectiveModel: "provider/one", modelLayer: "one-shot", thinking: "high" });
    expect(acceptedFixture.journal.getState().turns["turn-2"].metadata).toMatchObject({ effectiveModel: "provider/two", modelLayer: "parent-fallback", thinking: "medium" });
  });

  it("derives CLI backend authority only inside preallocation and rejects non-Herdr or switched-in-place CLI use", async () => {
    const choice: ResolvedModelChoice = {
      provider: "provider", model: "one", canonical: "provider/one", layer: "one-shot", thinking: "medium", source: "confirmed-one-shot", modelSource: "user-one-shot", thinkingSource: "user-one-shot", persistent: false, oneShot: true,
    };
    // External CLI derives the Herdr backend inside preallocation; a resolved
    // non-Herdr submission fails closed before any durable allocation.
    const denied = await fixtureCoordinator({
      preflight: async () => ({ ...choice, backend: "managed", nestedCli: "codex-cli" }),
    });
    await expect(denied.coordinator.submit({ description: "cli", prompt: "run codex", subagent_type: "general", cli: "codex-cli" })).rejects.toThrow(/SUB_CLI_DENIED: external CLI codex-cli requires the Herdr Pi runner/);
    expect(Object.keys(denied.journal.getState().agents)).toEqual([]);

    // A managed Agent identity is frozen: a later task_id turn cannot switch
    // it to a Herdr-backed external CLI runner in place.
    const managed = await fixtureCoordinator({
      preflight: async ({ item }) => (item.cli === "codex-cli" ? { ...choice, backend: "herdr", nestedCli: "codex-cli" } : choice),
    });
    const first = await managed.coordinator.submit({ description: "first", prompt: "first turn", subagent_type: "general" });
    const agentId = first.results[0]!.agentId!;
    await expect(managed.coordinator.submit({ description: "cli", prompt: "second turn with cli", task_id: agentId, cli: "codex-cli" })).rejects.toThrow(new RegExp(`SUB_CLI_MANAGED_CONTINUATION: task_id ${agentId} has frozen backend managed`));
  });

  it("rejects an invalid formal batch atomically before Agent, job, turn, or execution allocation", async () => {
    let executions = 0;
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async () => {
        executions += 1;
        return { output: "must not execute" };
      },
    });

    await expect(coordinator.submitTrusted({
      tasks: [
        { task: "valid formal member", agent: "aili.implementer", async: false, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit() },
        { task: "invalid formal member", agent: "aili.code-scout", formalContext: { changeId: "exact-change" } },
      ],
    })).rejects.toThrow(/explicit boolean async/);
    // The public schema rejects the formal identity fields outright.
    await expect(coordinator.submit({
      description: "smuggle",
      prompt: "formal",
      subagent_type: "aili.implementer",
      formalContext: { changeId: "exact-change" },
    })).rejects.toThrow(/unknown fields: formalContext/);

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
      expect(() => validateFormalTaskRequest(formal(audit), profiles), name).toThrow(/single line|exceeds/);
    }
    const formalSchema = JSON.stringify(FORMAL_TASK_REQUEST_SCHEMA);
    expect(formalSchema).toContain(`\"maxItems\":${FORMAL_RUNTIME_LIMITS.writeScopeItems}`);
    expect(formalSchema).toContain(`\"maxLength\":${FORMAL_RUNTIME_LIMITS.auditFieldChars}`);
    expect(formalSchema).toContain("u001F");
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

  it("emits a structured live allocation snapshot with the effective identity", async () => {
    const updates: Array<{ details: Record<string, unknown> }> = [];
    const choice: ResolvedModelChoice = {
      provider: "provider",
      model: "effective",
      canonical: "provider/effective",
      layer: "parent-fallback",
      thinking: "high",
      speedTier: "priority",
      source: "inherited-parent",
      modelSource: "inherited-parent",
      thinkingSource: "inherited-parent",
      persistent: false,
      oneShot: false,
    };
    const { coordinator } = await fixtureCoordinator({ preflight: async () => choice });
    await coordinator.submit({ description: "live", prompt: "live", subagent_type: "general", model: "provider/requested", thinking: "high" }, undefined, undefined, (update) => {
      updates.push(update as unknown as { details: Record<string, unknown> });
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.details).toMatchObject({
      requestedModel: "provider/requested",
      effectiveModel: "provider/effective",
      thinking: "high",
      speedTier: "priority",
      modelSource: "inherited-parent",
      thinkingSource: "inherited-parent",
    });
  });

  it("creates a new stable Agent per foreground call by default and never requests async delivery", async () => {
    const delivered: string[] = [];
    const { coordinator, journal } = await fixtureCoordinator({
      onAsyncSettled: async (result) => { delivered.push(result.jobId); },
    });
    const first = await coordinator.submit({ description: "Scout", prompt: "one", subagent_type: "general" });
    const second = await coordinator.submit({ description: "Scout", prompt: "two", subagent_type: "general" });
    expect(first.results[0]).toMatchObject({
      status: "completed",
      agentId: "Scout",
      taskId: "Scout",
      jobId: "job-1",
      effectiveMode: "sync",
      effectiveModeReason: "default-sync",
      deliveryRequired: false,
      limits: { maxRuntimeMs: 0, softRequestBudget: 0 },
    });
    expect(second.results[0]).toMatchObject({ status: "completed", agentId: "Scout-2", taskId: "Scout-2", jobId: "job-2" });
    expect(Object.keys(journal.getState().agents)).toEqual(["Scout", "Scout-2"]);
    expect(journal.getState().agents.Scout.state).toBe("idle");
    expect(journal.getState().agents["Scout-2"].state).toBe("idle");
    expect(delivered).toEqual([]);
  });

  it("continues a settled task_id on the same Child Session identity for a new turn", async () => {
    const executions: Array<{ agentId: string; continuation: boolean | undefined; task: string }> = [];
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async (input) => {
        executions.push({ agentId: input.agentId, continuation: input.continuation, task: input.item.task });
        return { output: `done:${input.item.task}` };
      },
    });
    const first = await coordinator.submit({ description: "Scout", prompt: "turn one", subagent_type: "aili.code-scout" });
    expect(first.results[0]).toMatchObject({ status: "completed", agentId: "Scout", taskId: "Scout" });
    const second = await coordinator.submit({ description: "continue", prompt: "turn two", task_id: "Scout", model: "provider/one", thinking: "high" });
    expect(second.results[0]).toMatchObject({
      status: "completed",
      agentId: "Scout",
      taskId: "Scout",
      jobId: "job-2",
      turnId: "turn-2",
      effectiveModeReason: "default-sync",
    });
    expect(journal.getState().agents["Scout"].currentJobId).toBeUndefined();
    expect(Object.keys(journal.getState().agents)).toEqual(["Scout"]);
    expect(executions).toEqual([
      { agentId: "Scout", continuation: false, task: "turn one" },
      { agentId: "Scout", continuation: true, task: "turn two" },
    ]);
    expect(journal.getState().turns["turn-2"].metadata).toMatchObject({ turnSource: "sub.continuation", requestedModel: "provider/one" });
  });

  it("returns SUB_BUSY while the previous turn on a task_id is still running", async () => {
    const gate = deferred<TaskExecutionOutput>();
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async () => await gate.promise,
    });
    const pending = coordinator.submit({ description: "bg", prompt: "slow work", subagent_type: "general" });
    await vi.waitFor(() => expect(journal.getState().jobs["job-1"]?.state).toBe("running"));
    await expect(coordinator.submit({ description: "too soon", prompt: "again", task_id: "bg" }))
      .rejects.toThrow(/^SUB_BUSY: /);
    expect(journal.getState().jobs["job-2"]).toBeUndefined();

    gate.resolve({ output: "slow work done" });
    await pending;
    const continued = await coordinator.submit({ description: "now settled", prompt: "next turn", task_id: "bg" });
    expect(continued.results[0]).toMatchObject({ status: "completed", taskId: "bg", jobId: "job-2" });
  });

  it("rejects selector changes, unknown ids, and aborted Agents on continuation", async () => {
    const { coordinator, journal } = await fixtureCoordinator();
    await coordinator.submit({ description: "Scout", prompt: "first", subagent_type: "aili.code-scout" });
    await expect(coordinator.submit({ description: "switch", prompt: "second", task_id: "Scout", subagent_type: "aili.implementer" }))
      .rejects.toThrow(/^SUB_SELECTOR_MISMATCH: /);
    await expect(coordinator.submit({ description: "ghost", prompt: "second", task_id: "missing" }))
      .rejects.toThrow(/^SUB_NOT_FOUND: /);
    expect(Object.keys(journal.getState().jobs)).toEqual(["job-1"]);

    // A genuinely aborted Child Session is terminal and refuses continuation.
    const abortGate = deferred<TaskExecutionOutput>();
    const aborting = await fixtureCoordinator({
      parentId: "parent-2",
      execute: async (input) => await Promise.race([abortGate.promise, abortRace(input.context.signal)]),
    });
    const controller = new AbortController();
    const pending = aborting.coordinator.submit({ description: "dead", prompt: "cancel me", subagent_type: "general" }, undefined, controller.signal);
    controller.abort();
    await pending;
    expect(aborting.journal.getState().agents["dead"].state).toBe("aborted");
    await expect(aborting.coordinator.submit({ description: "dead", prompt: "second", task_id: "dead" }))
      .rejects.toThrow(/^SUB_TERMINAL: /);
  });

  it("fails a settled turn with SUB_EMPTY_RESULT instead of completed with empty output", async () => {
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async () => ({ output: "   " }),
    });
    const response = await coordinator.submit({ description: "empty", prompt: "say nothing", subagent_type: "general" });
    expect(response.results[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("SUB_EMPTY_RESULT"),
      lifecycle: { agent: "idle", job: "failed", turn: "failed" },
    });
    expect(journal.getState().jobs["job-1"].state).toBe("failed");
    expect(journal.getState().turns["turn-1"].state).toBe("failed");
  });

  it("serializes concurrent allocations without blocking their independent executions", async () => {
    const { coordinator, journal } = await fixtureCoordinator();
    const [first, second] = await Promise.all([
      coordinator.submit({ description: "Scout", prompt: "first", subagent_type: "general" }),
      coordinator.submit({ description: "Scout", prompt: "second", subagent_type: "general" }),
    ]);
    expect(first.results[0]).toMatchObject({ status: "completed", agentId: "Scout", jobId: "job-1" });
    expect(second.results[0]).toMatchObject({ status: "completed", agentId: "Scout-2", jobId: "job-2" });
    expect(Object.keys(journal.getState().agents)).toEqual(["Scout", "Scout-2"]);
  });

  it("keeps async delivery internal-only, reports blocking override, and delivers only async settlement", async () => {
    const gate = deferred<TaskExecutionOutput>();
    const delivered: string[] = [];
    const profiles = await loadRoleProfiles();
    const { coordinator, scheduler } = await fixtureCoordinator({
      profiles,
      execute: async () => await gate.promise,
      onAsyncSettled: async (result) => { delivered.push(result.jobId); },
    });
    // Public top-level background returns immediately and retains automatic delivery.
    const accepted = await coordinator.submit({ description: "background", prompt: "background work", subagent_type: "general", background: true });
    expect(accepted.results[0]).toMatchObject({
      status: "accepted",
      async: true,
      effectiveModeReason: "requested-async",
      deliveryRequired: true,
    });
    expect(scheduler.stats().active).toBe(1);
    gate.resolve({ output: "background done" });
    const settled = await coordinator.getSettlement("job-1");
    expect(settled).toMatchObject({ status: "completed", output: "background done", deliveryRequired: true });
    await vi.waitFor(() => expect(delivered).toEqual(["job-1"]));

    const blockingProfiles = profiles.map((profile) => profile.selector === "general" ? { ...profile, blocking: true } : profile);
    const blocking = await fixtureCoordinator({ profiles: blockingProfiles });
    const result = await blocking.coordinator.submitTrusted({ task: "forced", async: true });
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
    const response = await coordinator.submit({ description: "persist", prompt: "cannot persist", subagent_type: "general" });
    expect(response.results[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("output persistence failed: injected output write failure"),
      lifecycle: { agent: "idle", job: "failed", turn: "failed" },
    });
    expect(journal.getState().jobs["job-1"].state).toBe("failed");
    expect(journal.getState().turns["turn-1"].state).toBe("failed");
  });

  it("returns independent settlements without converting a failed turn into false success", async () => {
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async ({ item }) => item.task === "fail"
        ? { status: "failed", output: "partial evidence", error: "fixture failure" }
        : { output: `ok:${item.task}` },
    });
    const pass = await coordinator.submit({ description: "pass", prompt: "pass", subagent_type: "general" });
    const fail = await coordinator.submit({ description: "fail", prompt: "fail", subagent_type: "aili.code-scout" });
    expect(pass.results[0]).toMatchObject({ status: "completed", output: "ok:pass", selector: "general" });
    expect(fail.results[0]).toMatchObject({ status: "failed", output: "partial evidence", error: "fixture failure", selector: "aili.code-scout" });
    expect(journal.getState().jobs["job-1"].state).toBe("completed");
    expect(journal.getState().jobs["job-2"].state).toBe("failed");
    expect(journal.getState().agents["pass"].state).toBe("idle");
    expect(journal.getState().agents["fail"].state).toBe("idle");
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
    const response = await Promise.all(Array.from({ length: 33 }, (_, index) =>
      coordinator.submitTrusted({ task: `task-${index + 1}`, async: true })));
    expect(response).toHaveLength(33);
    await vi.waitFor(() => expect(started).toHaveLength(32));
    expect(scheduler.stats()).toMatchObject({ active: 32, queued: ["job-33"] });
    expect(journal.getState().jobs["job-33"].state).toBe("queued");

    gates.get("job-1")!.resolve({ output: "first done" });
    await vi.waitFor(() => expect(started).toHaveLength(33));
    expect(started[32]).toBe("job-33");
    for (const [jobId, gate] of gates) if (jobId !== "job-1") gate.resolve({ output: `${jobId} done` });
    await Promise.all(Array.from({ length: 33 }, (_, index) => coordinator.getSettlement(`job-${index + 1}`)!));
    expect(scheduler.stats().queued).toEqual([]);
  }, 15_000);

  it("cancels queued work before start and preserves explicit aborted lifecycle state", async () => {
    const firstGate = deferred<TaskExecutionOutput>();
    const { coordinator, scheduler, journal } = await fixtureCoordinator({
      capacity: 1,
      execute: async ({ jobId }) => jobId === "job-1" ? await firstGate.promise : { output: "should not run" },
    });
    await coordinator.submitTrusted({ task: "occupy", async: true });
    await coordinator.submitTrusted({ task: "queued", async: true });
    expect(scheduler.stats().queued).toEqual(["job-2"]);
    expect(await coordinator.cancel("job-2")).toBe("queued");
    expect(await coordinator.getSettlement("job-2")).toMatchObject({ status: "aborted", lifecycle: { agent: "aborted", job: "aborted", turn: "aborted" } });
    expect(journal.getState().jobs["job-2"].state).toBe("aborted");
    expect(journal.getState().agents["general-2"].state).toBe("aborted");
    expect(journal.getState().turns["turn-2"].metadata).toMatchObject({ completedAt: expect.any(String), outcome: "aborted-before-start" });
    firstGate.resolve({ output: "released" });
    await coordinator.getSettlement("job-1");
  });

  it("settles an adopted Herdr turn through normal output persistence and async delivery callbacks", async () => {
    const persisted: string[] = [];
    const delivered: string[] = [];
    const { journal, coordinator } = await fixtureCoordinator({
      onSettled: async (_result, output) => { persisted.push(output); },
      onAsyncSettled: async (result) => { delivered.push(result.jobId); },
    });
    const now = "2026-08-28T00:00:00.000Z";
    await journal.append({ kind: "agent.created", agentId: "Recovered", payload: { record: { id: "Recovered", name: "Recovered", selector: "general", state: "queued", backend: "herdr", driver: "pi-cli", createdAt: now, updatedAt: now } } });
    await journal.append({ kind: "job.created", agentId: "Recovered", jobId: "job-r", payload: { record: { id: "job-r", agentId: "Recovered", state: "queued", createdAt: now, updatedAt: now, metadata: { effectiveMode: "async", requestedAsync: true } } } });
    await journal.append({ kind: "turn.created", agentId: "Recovered", jobId: "job-r", turnId: "turn-r", payload: { record: { id: "turn-r", agentId: "Recovered", jobId: "job-r", state: "queued", createdAt: now, updatedAt: now, metadata: { taskSummary: "recover" } } } });
    await journal.append({ kind: "agent.state", agentId: "Recovered", payload: { from: "queued", to: "running", currentJobId: "job-r", currentTurnId: "turn-r" } });
    await journal.append({ kind: "job.state", agentId: "Recovered", jobId: "job-r", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Recovered", jobId: "job-r", turnId: "turn-r", payload: { from: "queued", to: "running" } });
    const result = await coordinator.settleRecovered({ agentId: "Recovered", jobId: "job-r", turnId: "turn-r", runId: "run-r", status: "completed", output: "recovered output" });
    expect(result).toMatchObject({ status: "completed", output: "recovered output", deliveryRequired: true });
    expect(persisted).toEqual(["recovered output"]);
    expect(delivered).toEqual(["job-r"]);
    expect(journal.getState().agents.Recovered.state).toBe("idle");
  });

  it("rejects nested background and forces nested work to synchronous execution", async () => {
    let coordinator!: SubCoordinator;
    let nestedResponse: Awaited<ReturnType<SubCoordinator["submit"]>> | undefined;
    const fixture = await fixtureCoordinator({
      execute: async (input) => {
        if (input.depth === 0) {
          const ancestry = {
            parentAgentId: input.agentId,
            parentSelector: input.role.selector,
            parentDepth: input.depth,
            inheritedPermit: input.context.permit,
          };
          const before = fixture.journal.getState().lastSequence;
          await expect(coordinator.submit(
            { description: "bg", prompt: "nested background", subagent_type: "aili.code-scout", background: true },
            ancestry,
          )).rejects.toThrow(/^SUB_BACKGROUND_NESTED: /);
          await expect(coordinator.submitTrusted(
            { task: "nested background", agent: "aili.code-scout", async: true },
            ancestry,
          )).rejects.toThrow(/^SUB_BACKGROUND_NESTED: /);
          expect(fixture.journal.getState().lastSequence).toBe(before);
          nestedResponse = await coordinator.submit(
            { description: "sync", prompt: "nested scout", subagent_type: "aili.code-scout" },
            ancestry,
          );
          return { output: "parent after nested" };
        }
        expect(input.context.nested).toBe(true);
        expect(input.context.maxRuntimeMs).toBe(0);
        return { output: "nested complete" };
      },
    });
    coordinator = fixture.coordinator;
    const result = await coordinator.submit({ description: "parent", prompt: "parent", subagent_type: "general" });
    expect(result.results[0]).toMatchObject({ status: "completed", agentId: "parent" });
    expect(nestedResponse?.results[0]).toMatchObject({
      status: "completed",
      agentId: "parent.sync",
      effectiveMode: "sync",
      effectiveModeReason: "nested-sync",
      deliveryRequired: false,
    });
    expect(fixture.scheduler.stats().active).toBe(0);

    const before = fixture.journal.getState().lastSequence;
    await expect(coordinator.submit(
      { description: "denied", prompt: "denied", subagent_type: "aili.implementer" },
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
    let coordinator!: SubCoordinator;
    let denied = false;
    const fixture = await fixtureCoordinator({
      execute: async (input) => {
        if (input.depth !== 0) return { output: "nested execution must not start" };
        const before = fixture.journal.getState().lastSequence;
        await expect(coordinator.submit(
          { description: "forbidden", prompt: "forbidden specialized child", subagent_type: "aili.implementer" },
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
    await coordinator.submit({ description: "specialized", prompt: "specialized parent", subagent_type: "aili.code-scout" });
    expect(denied).toBe(true);
  });

  it("keeps an accepted top-level background task running when the submitting parent signal aborts", async () => {
    const gate = deferred<TaskExecutionOutput>();
    const delivered: string[] = [];
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async () => await gate.promise,
      onAsyncSettled: async (result) => { delivered.push(result.jobId); },
    });
    const controller = new AbortController();
    const accepted = await coordinator.submitTrusted({ task: "background work", async: true }, undefined, controller.signal);
    expect(accepted.results[0]).toMatchObject({ status: "accepted", async: true });

    controller.abort();
    expect(journal.getState().jobs["job-1"].state).not.toBe("aborted");

    gate.resolve({ output: "background done" });
    const settled = await coordinator.getSettlement("job-1");
    expect(settled).toMatchObject({ status: "completed", output: "background done" });
    await vi.waitFor(() => expect(delivered).toEqual(["job-1"]));
  });

  it("still cancels a top-level foreground task when the parent signal aborts", async () => {
    const gate = deferred<TaskExecutionOutput>();
    const { coordinator, journal } = await fixtureCoordinator({
      execute: async (input) => await Promise.race([gate.promise, abortRace(input.context.signal)]),
    });
    const controller = new AbortController();
    const pending = coordinator.submit({ description: "join", prompt: "join", subagent_type: "general" }, undefined, controller.signal);
    controller.abort();
    const response = await pending;
    expect(response.results[0]).toMatchObject({
      status: "aborted",
      lifecycle: { agent: "aborted", job: "aborted", turn: "aborted" },
    });
    expect(journal.getState().jobs["job-1"].state).toBe("aborted");
    gate.resolve({ output: "unblocked" });
  });

  it("cancels only the foreground turn when the parent signal aborts beside a background one", async () => {
    const gate = deferred<TaskExecutionOutput>();
    const delivered: string[] = [];
    const { coordinator, scheduler, journal } = await fixtureCoordinator({
      capacity: 1,
      execute: async (input) => await Promise.race([gate.promise, abortRace(input.context.signal)]),
      onAsyncSettled: async (result) => { delivered.push(result.jobId); },
    });
    const controller = new AbortController();
    const background = coordinator.submitTrusted({ task: "background work", async: true }, undefined, controller.signal);
    await background;
    await vi.waitFor(() => expect(scheduler.stats().active).toBe(1));
    const pending = coordinator.submit({ description: "join", prompt: "join", subagent_type: "general" }, undefined, controller.signal);

    controller.abort();
    const response = await pending;
    expect(response.results[0]).toMatchObject({ status: "aborted" });
    expect(journal.getState().jobs["job-2"].state).toBe("aborted");
    expect(journal.getState().jobs["job-1"].state).not.toBe("aborted");

    gate.resolve({ output: "background done" });
    const settled = await coordinator.getSettlement("job-1");
    expect(settled).toMatchObject({ status: "completed", output: "background done" });
    await vi.waitFor(() => expect(delivered).toEqual(["job-1"]));
  });

  it("keeps nested tasks cancellable through their parent task's turn signal", async () => {
    let coordinator!: SubCoordinator;
    const fixture = await fixtureCoordinator({
      profiles: await loadRoleProfiles(),
      execute: async (input) => {
        if (input.depth === 0) {
          const nested = coordinator.submit(
            { description: "nested", prompt: "nested join", subagent_type: "aili.code-scout" },
            {
              parentAgentId: input.agentId,
              parentSelector: input.role.selector,
              parentDepth: input.depth,
              inheritedPermit: input.context.permit,
            },
            input.context.signal,
          );
          const nestedResult = await nested;
          return { output: `outer after nested ${nestedResult.results[0]?.status ?? "unsettled"}` };
        }
        return await Promise.race([deferred<TaskExecutionOutput>().promise, abortRace(input.context.signal)]);
      },
    });
    coordinator = fixture.coordinator;
    const outer = coordinator.submit({ description: "parent", prompt: "parent", subagent_type: "general" });
    await vi.waitFor(() => expect(fixture.journal.getState().turns["turn-2"]).toBeDefined());

    expect(await coordinator.cancel("job-1")).toBe("running");
    const response = await outer;
    expect(response.results[0]).toMatchObject({ status: "aborted" });
    expect(await coordinator.getSettlement("job-2")).toMatchObject({ status: "aborted" });
    expect(fixture.journal.getState().jobs["job-1"].state).toBe("aborted");
    expect(fixture.journal.getState().jobs["job-2"].state).toBe("aborted");
  });

  it("does not discard a generated background result when the parent signal aborts at the completion boundary", async () => {
    const executed = deferred<void>();
    const persistenceGate = deferred<void>();
    const { coordinator } = await fixtureCoordinator({
      execute: async () => {
        executed.resolve();
        return { output: "already produced" };
      },
      onSettled: async () => { await persistenceGate.promise; },
    });
    const controller = new AbortController();
    const accepted = await coordinator.submitTrusted({ task: "background work", async: true }, undefined, controller.signal);
    expect(accepted.results[0]).toMatchObject({ status: "accepted" });

    await executed.promise;
    controller.abort();
    persistenceGate.resolve();

    const settled = await coordinator.getSettlement("job-1");
    expect(settled).toMatchObject({ status: "completed", output: "already produced" });
  });

  it("runs background under an already-aborted signal while foreground is cancelled immediately", async () => {
    const { coordinator } = await fixtureCoordinator({
      execute: async ({ item }) => ({ output: `done:${item.task}` }),
    });
    const controller = new AbortController();
    controller.abort();

    const asyncResponse = await coordinator.submitTrusted({ task: "work", async: true }, undefined, controller.signal);
    expect(asyncResponse.results[0]).toMatchObject({ status: "accepted", async: true });
    expect(await coordinator.getSettlement("job-1")).toMatchObject({ status: "completed", output: "done:work" });

    const syncResponse = await coordinator.submit({ description: "join", prompt: "join", subagent_type: "general" }, undefined, controller.signal);
    expect(syncResponse.results[0]).toMatchObject({ status: "aborted" });
  });

  it("requires nested formal work to repeat the exact inherited formalContext before allocation", async () => {
    let coordinator!: SubCoordinator;
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
          { description: "missing", prompt: "missing formal context", subagent_type: "aili.code-scout" },
          ancestry,
        )).rejects.toThrow(/must explicitly repeat the exact same formalContext\.changeId/);
        await expect(coordinator.submitTrusted(
          { task: "wrong formal context", agent: "aili.code-scout", async: false, formalContext: { changeId: "other-change" }, continuationAudit: continuationAudit({ canonicalRole: "aili.code-scout" }) },
          ancestry,
        )).rejects.toThrow(/must explicitly repeat the exact same formalContext\.changeId/);
        expect(fixture.journal.getState().lastSequence).toBe(before);
        checked = true;
        return { output: "formal ancestry checked" };
      },
    });
    coordinator = fixture.coordinator;
    await coordinator.submit({ description: "parent", prompt: "parent", subagent_type: "general" });
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
    const result = await coordinator.submit({ description: "long", prompt: "long", subagent_type: "general" });
    expect(simulatedRequests).toBe(250);
    expect(result.results[0]).toMatchObject({ status: "completed", truncation: { truncated: true } });
  });
});
