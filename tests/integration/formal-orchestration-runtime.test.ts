import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  planFormalPackageExecution,
  planFormalRuntimeReconciliation,
  type FormalLifecycleSnapshot,
  type FormalRuntimeReconciliationObservation,
} from "../../src/runtime/formal-orchestration.js";
import { planFormalTaskBoardUpdate } from "../../src/runtime/formal-task-board-update.js";
import { PersistentAgentRuntime, type PersistentRuntimeExecutorInput } from "../../src/runtime/persistent-agents/runtime.js";
import { buildFormalTaskDispatch } from "../../src/runtime/persistent-agents/formal-task-tool.js";
import { persistFullAgentOutput } from "../../src/runtime/persistent-agents/output-delivery.js";
import { loadRoleProfiles, type RoleProfile } from "../../src/runtime/roles.js";

let scratch = "";

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/formal-orchestration-runtime-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function runtime(id = "P-01") {
  const suffix = id.toLowerCase();
  return {
    agent: `agent-${suffix}`,
    job: `job-${suffix}`,
    turn: `turn-${suffix}`,
    output: `agent://agent-${suffix}/job-${suffix}/turn-${suffix}/output`,
    history: `history://agent-${suffix}/job-${suffix}/turn-${suffix}`,
  };
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

function continuationAudit(writeScope = { paths: [] as string[], resources: [] as string[] }, packageId = "P-01") {
  return {
    packageId,
    canonicalRole: "aili.implementer",
    scope: "Implement only the bounded fixture scope.",
    forbiddenScope: "No dependency, Git, permission, board-authority, or release changes.",
    writeScope,
    acceptanceBoundary: "The exact fixture behavior is verified by ROSE.",
    expectedEvidence: `verification:focused-${packageId}; artifact:result/${packageId}`,
  };
}

function canonicalResult(packageId = "P-01", status: "completed" | "partial" | "blocked" | "unverified" = "completed", roleId = "aili.implementer"): string {
  return [
    "CANONICAL RESULT:",
    `result_id: result-${packageId}`,
    `trace_id: trace-${packageId}`,
    "lane: implementation",
    "owner: implementer",
    `package_id: ${packageId}`,
    `role_id: ${roleId}`,
    `status: ${status}`,
    "confidence: HIGH",
    "worktree_context_ref: N/A",
    "declared_repository: fixture",
    "cwd: .",
    "target_rules_ref: AGENTS.md",
    "artifact_destination: N/A",
    "inspected_scope: bounded fixture",
    "summary: bounded result",
    `evidence: artifact:result/${packageId}`,
    "changed_files: []",
    `verification: verification:focused-${packageId}`,
    "checks: focused fixture",
    "freshness: current",
    "skipped_checks: none",
    "soft_boundary_limitations: none",
    "blockers: none",
    "risks: none",
    "unverified: none",
    "continuation_recommendation: none",
    "findings: []",
    "convergence_links: N/A",
    "review_arbitration_ref: N/A",
  ].join("\n");
}

type PackageOptions = {
  id?: string;
  status?: "pending" | "ready" | "running" | "returned" | "done" | "blocked" | "cancelled";
  execution?: "sync" | "async";
  join?: string;
};

function packageBlock(options: PackageOptions = {}): string {
  const id = options.id ?? "P-01";
  const status = options.status ?? "ready";
  const execution = options.execution ?? "sync";
  const joinId = options.join ?? (execution === "async" ? "J-01" : "immediate");
  const executed = status === "running" || status === "returned" || status === "done";
  return [
    `- [${status === "done" ? "x" : " "}] ${id} — Package ${id}`,
    "  - Phase: `BUILD`",
    "  - Package kind: `task-execution`",
    `  - Source refs: \`task:${id}\``,
    `  - Accepted task IDs: \`${id}\``,
    `  - Status: \`${status}\``,
    "  - Owner: `agent:aili.implementer`",
    "  - Dispatch: `required`",
    "  - Dispatch reason: `The bounded implementation belongs to the exact specialist.`",
    "  - No-dispatch reason: `N/A`",
    `  - Execution: \`${execution}\``,
    `  - Join: \`${joinId}\``,
    "  - Depends on: `none`",
    "  - Decision gate: `accepted`",
    "  - Final test-plan gate: `accepted`",
    "  - Implementation authorization: `granted`",
    "  - Operation permissions: `granted`",
    "  - Scope: `Implement only the bounded fixture scope.`",
    "  - Forbidden scope: `No dependency, Git, permission, board-authority, or release changes.`",
    "  - Expected result: `One deterministic result.`",
    `  - Expected evidence: \`verification:focused-${id}; artifact:result/${id}\``,
    "  - Acceptance: `The exact fixture behavior is verified by ROSE.`",
    `  - Dispatch evidence: \`${executed ? `artifact:dispatch-${id}` : "pending"}\``,
    `  - Result evidence: \`${status === "returned" || status === "done" ? `artifact:result-${id}` : "pending"}\``,
    `  - Evidence: \`${status === "returned" || status === "done" ? `artifact:evidence-${id}` : "pending"}\``,
    `  - ROSE disposition: \`${status === "done" ? "accepted" : "pending"}\``,
    `  - Blocker: \`${status === "blocked" ? `runtime failure for ${id}` : "none"}\``,
    "  - Next action: `ROSE performs the next bounded package action.`",
  ].join("\n");
}

function board(changeId: string, packages: string[]): string {
  return [
    "# Task Board",
    "",
    "- Protocol: `aili-task-board/v1`",
    "- Task kind: `formal`",
    `- Task identity: \`${changeId}\``,
    "- Goal: Validate exact formal Runtime protection and reconciliation.",
    "- Phase: `BUILD`",
    "- Board status: `active`",
    "- Accepted contract: `spec.md accepted`",
    "- Accepted verification: `test-plan.md accepted`",
    "- Decision owner: `ROSE`",
    "- Verification owner: `ROSE`",
    "",
    "## Packages",
    "",
    packages.join("\n\n"),
    "",
  ].join("\n");
}

function event(timestamp: string, subject: string, type: string, fields: Array<[string, string]>): string {
  return [`[${timestamp}] ${subject} ${type}`, ...fields.map(([key, value]) => `${key}=${value}`)].join("\n");
}

function boardCreated(changeId: string): string {
  return event("2026-07-30T00:00:00Z", "BOARD", "BOARD_CREATED", [["evidence", `artifact:board-${changeId}`]]);
}

function dispatched(id: string, second = 1, execution = "sync", joinId = "immediate"): string {
  void execution;
  void joinId;
  return [
    event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "READY", [["evidence", `artifact:ready-${id}`]]),
    event(`2026-07-30T00:00:${String(second + 1).padStart(2, "0")}Z`, id, "DISPATCHED", [["evidence", `artifact:dispatch-${id}`]]),
  ].join("\n\n");
}

function progress(changeId: string, events: string[] = []): string {
  return `${[boardCreated(changeId), ...events].join("\n\n")}\n`;
}

function canonicalPackageBlock(status: "pending" | "ready" = "pending"): string {
  return [
    "- [ ] P-01 — Package P-01",
    "  - Phase: `BUILD`",
    "  - Package kind: `task-execution`",
    "  - Source refs: `task:P-01`",
    "  - Accepted task IDs: `P-01`",
    `  - Status: \`${status}\``,
    "  - Owner: `agent:aili.implementer`",
    "  - Dispatch: `required`",
    "  - Dispatch reason: `The bounded implementation belongs to the exact specialist.`",
    "  - No-dispatch reason: `N/A`",
    "  - Execution: `sync`",
    "  - Join: `immediate`",
    "  - Depends on: `none`",
    "  - Decision gate: `N/A`",
    "  - Final test-plan gate: `accepted`",
    "  - Implementation authorization: `granted`",
    "  - Operation permissions: `N/A`",
    "  - Scope: `Implement only the bounded fixture scope.`",
    "  - Forbidden scope: `No dependency, Git, permission, board-authority, or release changes.`",
    "  - Expected result: `One deterministic result.`",
    "  - Expected evidence: `verification:focused-P-01; artifact:result/P-01`",
    "  - Acceptance: `The exact fixture behavior is verified by ROSE.`",
    "  - Dispatch evidence: `pending`",
    "  - Result evidence: `pending`",
    "  - Evidence: `pending`",
    "  - ROSE disposition: `pending`",
    "  - Blocker: `none`",
    "  - Next action: `ROSE performs the next bounded package action.`",
  ].join("\n");
}

function canonicalProgress(ready = false): string {
  return ready
    ? "[2026-07-30T00:00:00Z] BOARD BOARD_CREATED\n\n[2026-07-30T00:00:01Z] P-01 READY\nevidence=artifact:ready/P-01\n"
    : "[2026-07-30T00:00:00Z] BOARD BOARD_CREATED\n";
}

async function writePair(project: string, changeId: string, taskIdentity = changeId): Promise<void> {
  const root = join(project, "openspec", "changes", changeId);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "formal-task-board.md"), board(taskIdentity, [canonicalPackageBlock()]));
  await writeFile(join(root, "progress.txt"), canonicalProgress());
}

function lifecycle(profiles: readonly RoleProfile[], packages: string[], events: string[] = []): FormalLifecycleSnapshot {
  return {
    kind: "formal",
    taskIdentity: "fixture-change",
    phase: "BUILD",
    tasksSource: board("fixture-change", packages),
    progressSource: progress("fixture-change", events),
    profiles,
  };
}

function observation(id = "P-01", overrides: Partial<FormalRuntimeReconciliationObservation> = {}): FormalRuntimeReconciliationObservation {
  const refs = runtime(id);
  return {
    packageId: id,
    formalProtection: { changeId: "fixture-change" },
    formalContinuationIdentity: continuationAudit({ paths: [], resources: [] }, id),
    agent: { id: refs.agent, state: "idle", released: false },
    job: { id: refs.job, agentId: refs.agent, state: "completed" },
    turn: { id: refs.turn, agentId: refs.agent, jobId: refs.job, state: "completed" },
    output: { state: "readable", result: "completed" },
    history: { state: "readable" },
    ...overrides,
  };
}

describe("formal task Runtime allocation and protection identity", () => {
  it("fails closed for every non-canonical formal result and persists only exact completed/partial as completed", async () => {
    const project = join(scratch, "formal-result-parser");
    await mkdir(join(project, "openspec", "changes"), { recursive: true });
    await writePair(project, "fixture-change");
    const parentFile = join(project, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const valid = canonicalResult();
    const outputs: Record<string, string> = {
      completed: valid,
      partial: canonicalResult("P-01", "partial"),
      blocked: canonicalResult("P-01", "blocked"),
      unverified: canonicalResult("P-01", "unverified"),
      empty: "",
      whitespace: "   ",
      malformed: "ordinary response",
      duplicate: valid.replace("summary: bounded result", "summary: bounded result\nsummary: duplicate"),
      wrongPackage: valid.replace("package_id: P-01", "package_id: P-02"),
      wrongRole: valid.replace("role_id: aili.implementer", "role_id: aili.code-scout"),
      truncated: valid.slice(0, valid.indexOf("verification:")),
      overBound: `${valid}\n${"x".repeat(256_000)}`,
    };
    const runtimeInstance = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-formal-result-parser",
      cwd: project,
      execute: async (input) => {
        const output = outputs[input.item.task]!;
        persistAssistant(input, output);
        return { output };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });
    for (const name of Object.keys(outputs)) {
      const response = await runtimeInstance.task.submitTrusted({
        task: name,
        agent: "aili.implementer",
        async: false,
        workspace: "shared",
        formalContext: { changeId: "fixture-change" },
        continuationAudit: continuationAudit(),
      });
      const settlement = response.results[0]!;
      const job = runtimeInstance.journal.getState().jobs[settlement.jobId]!;
      if (name === "completed" || name === "partial") {
        expect(settlement.status, name).toBe("completed");
        expect(job.state, name).toBe("completed");
        expect(job.metadata?.formalWorkerResult, name).toBe(name);
      } else {
        expect(settlement.status, name).toBe("failed");
        expect(job.state, name).toBe("failed");
        expect(job.metadata?.formalWorkerResult, name).toBe(name === "blocked" || name === "unverified" ? "blocked" : "failed");
      }
      expect(runtimeInstance.journal.getState().formalResultEvidence[settlement.jobId]).toMatchObject({
        agentId: settlement.agentId,
        jobId: settlement.jobId,
        turnId: settlement.turnId,
        changeId: "fixture-change",
        packageId: "P-01",
        roleId: "aili.implementer",
      });
    }
    await runtimeInstance.shutdown();
  });

  it("rejects malformed/non-v1/non-exact roots before any child allocation and persists the valid derived deny set", async () => {
    const project = join(scratch, "project");
    await mkdir(join(project, "openspec", "changes"), { recursive: true });
    await writePair(project, "exact-change");
    await writePair(project, "alternate-change");
    await writePair(project, "identity-mismatch", "another-identity");
    const legacy = join(project, "openspec", "changes", "legacy-change");
    await mkdir(legacy);
    await writeFile(join(legacy, "formal-task-board.md"), "# Legacy\n- [ ] item\n");
    await writeFile(join(legacy, "progress.txt"), "legacy progress\n");
    await symlink(join(project, "openspec", "changes", "exact-change"), join(project, "openspec", "changes", "linked-change"));
    const parentFile = join(project, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    let executions = 0;
    let executedInput: PersistentRuntimeExecutorInput | undefined;
    const create = () => PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-1",
      cwd: project,
      execute: async (input) => {
        executions += 1;
        executedInput = input;
        const output = canonicalResult();
        persistAssistant(input, output);
        return { output };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });
    const runtimeInstance = await create();

    await expect(runtimeInstance.task.submitTrusted({
      task: "formal omitted agent",
      async: false,
      formalContext: { changeId: "exact-change" },
      continuationAudit: continuationAudit(),
    })).rejects.toThrow(/explicit Specialized agent selector/);
    await expect(runtimeInstance.task.submitTrusted({
      task: "formal general agent",
      agent: "general",
      async: false,
      formalContext: { changeId: "exact-change" },
      continuationAudit: continuationAudit(),
    })).rejects.toThrow(/explicit Specialized agent selector/);
    await expect(runtimeInstance.task.submitTrusted({
      task: "formal omitted async",
      agent: "aili.implementer",
      formalContext: { changeId: "exact-change" },
      continuationAudit: continuationAudit(),
    })).rejects.toThrow(/explicit boolean async/);

    for (const changeId of ["unknown-change", "legacy-change", "identity-mismatch", "linked-change", "../exact-change"]) {
      await expect(runtimeInstance.task.submitTrusted({
        task: "must not allocate",
        agent: "aili.implementer",
        async: false,
        formalContext: { changeId },
        continuationAudit: continuationAudit(),
      })).rejects.toThrow(/formalContext|exact v1|ordinary path/i);
    }
    await expect(runtimeInstance.task.submitTrusted({
      tasks: [
        { task: "valid member", agent: "aili.implementer", async: false, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit() },
        { task: "invalid formal member", agent: "aili.implementer", formalContext: { changeId: "exact-change" } },
      ],
    })).rejects.toThrow(/explicit boolean async/);
    await expect(runtimeInstance.task.submitTrusted({
      tasks: [
        { task: "valid root member", agent: "aili.implementer", async: false, formalContext: { changeId: "exact-change" }, continuationAudit: continuationAudit() },
        { task: "invalid root member", agent: "aili.implementer", async: false, formalContext: { changeId: "missing-change" }, continuationAudit: continuationAudit() },
      ],
    })).rejects.toThrow(/formalContext|exact v1/i);
    expect(runtimeInstance.journal.getState().agents).toEqual({});
    expect(executions).toBe(0);

    const formal = await runtimeInstance.task.submitTrusted({
      task: "valid formal package",
      agent: "aili.implementer",
      async: false,
      workspace: "shared",
      writeScope: { paths: ["openspec/changes/exact-change"], resources: [] },
      formalContext: { changeId: "exact-change" },
      continuationAudit: continuationAudit({ paths: ["openspec/changes/exact-change"], resources: [] }),
    });
    const expectedProtection = {
      changeId: "exact-change",
      protectedPaths: [
        "openspec/changes/exact-change/formal-task-board.md",
        "openspec/changes/exact-change/progress.txt",
      ],
    };
    expect(formal.results[0]).toMatchObject({ status: "completed", selector: "aili.implementer" });
    expect(executedInput?.item.formalContext).toEqual({ changeId: "exact-change" });
    expect(executedInput?.formalProtection).toEqual(expectedProtection);
    const agentId = formal.results[0]!.agentId;
    expect(runtimeInstance.journal.getState().agents[agentId]?.metadata?.formalProtection).toEqual(expectedProtection);
    expect(runtimeInstance.journal.getState().agents[agentId]?.metadata?.formalContinuationIdentity).toEqual(continuationAudit({ paths: ["openspec/changes/exact-change"], resources: [] }));
    expect(runtimeInstance.journal.getState().jobs[formal.results[0]!.jobId]?.metadata?.formalProtection).toEqual(expectedProtection);
    expect(runtimeInstance.journal.getState().turns[formal.results[0]!.turnId]?.metadata?.formalProtection).toEqual(expectedProtection);

    const ordinary = await runtimeInstance.task.submitTrusted({ task: "ordinary compatibility", async: false });
    expect(ordinary.results[0]).toMatchObject({ status: "completed", selector: "general", effectiveModeReason: "requested-sync" });
    expect(runtimeInstance.journal.getState().agents[ordinary.results[0]!.agentId]?.metadata).not.toHaveProperty("formalProtection");
    await runtimeInstance.shutdown();

    const resumed = await create();
    expect(resumed.journal.getState().agents[agentId]?.metadata?.formalProtection).toEqual(expectedProtection);
    expect(executions).toBe(2);
    await resumed.shutdown();
  });

  it("carries the exact board identity from orchestration through allocation and one audited hub continuation", async () => {
    const project = join(scratch, "continuation-project");
    await mkdir(join(project, "openspec", "changes"), { recursive: true });
    await writePair(project, "fixture-change");
    const profiles = await loadRoleProfiles();
    const plan = planFormalPackageExecution({
      lifecycle: {
        kind: "formal",
        taskIdentity: "fixture-change",
        phase: "BUILD",
        tasksSource: board("fixture-change", [canonicalPackageBlock("ready")]),
        progressSource: canonicalProgress(true),
        profiles,
      },
      packageId: "P-01",
      operationGate: { state: "allowed", evidence: "Exact bounded operation is approved." },
      ownership: { classification: "agent-execution", evidence: "The board assigns this package to the exact specialist." },
    });
    expect(plan.status).toBe("task-request");
    if (plan.status !== "task-request") throw new Error("fixture formal package must produce a task request");
    expect(Object.keys(plan.taskRequest.formalContext)).toEqual(["changeId"]);
    expect(plan.taskRequest.continuationAudit).toEqual(continuationAudit());

    const parentFile = join(project, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const continued: string[] = [];
    const runtimeInstance = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-continuation",
      cwd: project,
      execute: async (input) => {
        const output = canonicalResult();
        persistAssistant(input, output);
        return { output };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => ({
        steer(message) { continued.push(`steer:${message}`); },
        sendUserMessage(message) { continued.push(message); },
        dispose() {},
      }),
    });
    const result = await runtimeInstance.task.submitTrusted(plan.taskRequest);
    const agentId = result.results[0]!.agentId;
    expect(runtimeInstance.journal.getState().agents[agentId]?.metadata?.formalContinuationIdentity).toEqual(plan.taskRequest.continuationAudit);
    expect(await runtimeInstance.hub.park(agentId)).toBe(true);
    const receipt = await runtimeInstance.hub.execute({
      action: "send",
      agentId,
      message: "Clarify the same package evidence.",
      continuationAudit: plan.taskRequest.continuationAudit,
    }) as { turnId: string };
    expect(continued).toEqual(["Clarify the same package evidence."]);
    expect(runtimeInstance.journal.getState().turns[receipt.turnId]?.metadata?.formalContinuationIdentity).toEqual(plan.taskRequest.continuationAudit);

    const before = runtimeInstance.journal.getState();
    const messageCount = Object.keys(before.messages).length;
    const turnCount = Object.keys(before.turns).length;
    await expect(runtimeInstance.hub.execute({
      action: "send",
      agentId,
      message: "Expand scope.",
      continuationAudit: { ...plan.taskRequest.continuationAudit, scope: "A changed scope." },
    })).rejects.toThrow(/create a new bounded job\/Agent/);
    expect(Object.keys(runtimeInstance.journal.getState().messages)).toHaveLength(messageCount);
    expect(Object.keys(runtimeInstance.journal.getState().turns)).toHaveLength(turnCount);
    await runtimeInstance.hub.settleMessageTurn(agentId, receipt.turnId, "completed");
    await runtimeInstance.shutdown();

    const revivedMessages: string[] = [];
    const resumed = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-continuation",
      cwd: project,
      execute: async () => { throw new Error("restart must not replay the initial job"); },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => ({
        steer(message) { revivedMessages.push(`steer:${message}`); },
        sendUserMessage(message) { revivedMessages.push(message); },
        dispose() {},
      }),
    });
    expect(resumed.journal.getState().agents[agentId]?.state).toBe("parked");
    const revived = await resumed.hub.execute({
      action: "send",
      agentId,
      message: "Continue after restart with the same board protection.",
      continuationAudit: plan.taskRequest.continuationAudit,
    }) as { turnId: string };
    expect(revivedMessages).toEqual(["Continue after restart with the same board protection."]);
    expect(resumed.journal.getState().turns[revived.turnId]?.metadata?.formalProtection).toEqual({
      changeId: "fixture-change",
      protectedPaths: [
        "openspec/changes/fixture-change/formal-task-board.md",
        "openspec/changes/fixture-change/progress.txt",
      ],
    });
    await resumed.shutdown();
  });
});

describe("formal Runtime restart reconciliation planner", () => {
  it("maps only completed/partial readable evidence to returned and never to done or an authority action", async () => {
    const profiles = await loadRoleProfiles();
    for (const result of ["completed", "partial"] as const) {
      const source = lifecycle(profiles, [packageBlock({ status: "running" })], [dispatched("P-01")]);
      const plan = planFormalRuntimeReconciliation(source, [observation("P-01", {
        output: { state: "readable", result },
      })]);
      expect(plan.status).toBe("planned");
      expect(plan.decisions).toEqual([expect.objectContaining({ decision: "returned", operation: expect.objectContaining({ to: "returned", result }) })]);
      expect(plan.events).toEqual([{ subject: "P-01", type: "RECONCILED", fields: { evidence: expect.stringMatching(/^artifact:formal-reconciliation\//) } }]);
      expect(plan.decisions[0]?.operation).not.toMatchObject({ to: "done" });
      expect(plan.authority).toEqual({ boardWrite: false, redispatch: false, acceptance: false, joinClosureFromSettlement: false, phaseAdvance: false });
      const operation = plan.decisions[0]?.operation;
      if (!operation) throw new Error("returned reconciliation requires a transition operation");
      expect(planFormalTaskBoardUpdate({
        actor: "ROSE",
        tasksSource: source.tasksSource,
        progressSource: source.progressSource,
        packageId: "P-01",
        timestamp: "2026-07-30T00:01:00Z",
        operation,
      }).status).toBe("planned");
    }
  });

  it("maps blocked/failed/interrupted/unexecuted/missing/stale/unreadable evidence to blocked with zero replay", async () => {
    const profiles = await loadRoleProfiles();
    const source = lifecycle(profiles, [packageBlock({ status: "running" })], [dispatched("P-01")]);
    const cases: Array<[string, FormalRuntimeReconciliationObservation[]]> = [
      ["blocked", [observation("P-01", { output: { state: "readable", result: "blocked" } })]],
      ["failed", [observation("P-01", { job: { id: runtime().job, agentId: runtime().agent, state: "failed" } })]],
      ["interrupted", [observation("P-01", { turn: { id: runtime().turn, agentId: runtime().agent, jobId: runtime().job, state: "interrupted" } })]],
      ["unexecuted", [observation("P-01", { job: { id: runtime().job, agentId: runtime().agent, state: "unexecuted" } })]],
      ["missing", []],
      ["stale", [observation("P-01", { output: { state: "stale", result: "completed" } })]],
      ["unreadable", [observation("P-01", { history: { state: "unreadable" } })]],
      ["released", [observation("P-01", { agent: { id: runtime().agent, state: "parked", released: true } })]],
      ["binding-conflict", [observation("P-01", { formalProtection: { changeId: "other-change" } })]],
    ];
    for (const [name, observations] of cases) {
      const plan = planFormalRuntimeReconciliation(source, observations);
      expect(plan.decisions[0], name).toMatchObject({ decision: "blocked", operation: { to: "blocked" } });
      expect(plan.authority.redispatch, name).toBe(false);
    }
  });

  it("fails closed without a write plan when one package has multiple Journal candidates", async () => {
    const profiles = await loadRoleProfiles();
    const source = lifecycle(profiles, [
      packageBlock({ id: "P-01", status: "running" }),
      packageBlock({ id: "P-02", status: "running" }),
    ], [dispatched("P-01", 1), dispatched("P-02", 3)]);
    const duplicate = planFormalRuntimeReconciliation(source, [observation("P-01"), observation("P-01")]);
    expect(duplicate.status).toBe("blocked");
    expect(duplicate.decisions).toEqual([]);
    expect(duplicate.events).toEqual([]);
    expect(duplicate.diagnostics.map((entry) => entry.code)).toContain("RECONCILIATION_OBSERVATION_DUPLICATE");
  });

  it("recovers async members independently, keeps joins open from settlement alone, and preserves terminal stale/released history", async () => {
    const profiles = await loadRoleProfiles();
    const source = lifecycle(profiles, [
      packageBlock({ id: "P-01", status: "running", execution: "async", join: "J-01" }),
      packageBlock({ id: "P-02", status: "running", execution: "async", join: "J-01" }),
    ], [
      dispatched("P-01", 1, "async", "J-01"),
      dispatched("P-02", 2, "async", "J-01"),
    ]);
    const partial = planFormalRuntimeReconciliation(source, [
      observation("P-01"),
      observation("P-02", {
        agent: { id: runtime("P-02").agent, state: "running", released: false },
        job: { id: runtime("P-02").job, agentId: runtime("P-02").agent, state: "running" },
        turn: { id: runtime("P-02").turn, agentId: runtime("P-02").agent, jobId: runtime("P-02").job, state: "running" },
        output: { state: "missing" },
        history: { state: "readable" },
      }),
    ]);
    expect(partial.decisions).toEqual([
      expect.objectContaining({ packageId: "P-01", decision: "returned" }),
      expect.objectContaining({ packageId: "P-02", decision: "waiting" }),
    ]);
    expect(partial.joins).toEqual([{ joinId: "J-01", status: "open", members: ["P-01", "P-02"] }]);
    expect(partial.authority).toMatchObject({ redispatch: false, joinClosureFromSettlement: false, phaseAdvance: false });

    const failedAsync = planFormalRuntimeReconciliation(source, [
      observation("P-01", { job: { id: runtime().job, agentId: runtime().agent, state: "failed" } }),
      observation("P-02", {
        agent: { id: runtime("P-02").agent, state: "running", released: false },
        job: { id: runtime("P-02").job, agentId: runtime("P-02").agent, state: "running" },
        turn: { id: runtime("P-02").turn, agentId: runtime("P-02").agent, jobId: runtime("P-02").job, state: "running" },
        output: { state: "missing" },
        history: { state: "readable" },
      }),
    ]);
    expect(failedAsync.decisions[0]).toMatchObject({ packageId: "P-01", decision: "blocked", requiresInspection: true });
    expect(failedAsync.decisions[0]).toHaveProperty("operation.to", "blocked");
    expect(failedAsync.joins).toEqual([{ joinId: "J-01", status: "blocked", members: ["P-01", "P-02"] }]);

    for (const status of ["done", "cancelled"] as const) {
      const id = status === "done" ? "P-DONE" : "P-CANCELLED";
      const events = status === "done"
        ? [
          dispatched(id, 1),
          event("2026-07-30T00:00:03Z", id, "RETURNED", [["evidence", `artifact:result-${id}`]]),
          event("2026-07-30T00:00:04Z", id, "INSPECTED", [["disposition", "accepted"], ["evidence", `artifact:evidence-${id}`]]),
          event("2026-07-30T00:00:05Z", id, "DONE", [["verification", `verification:vitest-${id}`]]),
        ]
        : [event("2026-07-30T00:00:01Z", id, "CANCELLED", [["blocker", "ROSE cancelled the bounded fixture"], ["next_action", "Preserve terminal cancellation."]])];
      const terminal = lifecycle(profiles, [packageBlock({ id, status })], events);
      const stale = observation(id, {
        agent: { id: runtime(id).agent, state: "parked", released: true },
        output: { state: "stale", result: "completed" },
        history: { state: "unreadable" },
      });
      const plan = planFormalRuntimeReconciliation(terminal, [stale]);
      expect(plan.decisions[0]).toMatchObject({ currentStatus: status, decision: "preserve" });
      expect(plan.diagnostics.map((entry) => entry.code)).toContain("TERMINAL_EVIDENCE_GAP");
    }
  });

  it("runs only through the explicit ROSE entry, applies portable evidence atomically, and is idempotent", async () => {
    const project = join(scratch, "explicit-reconciliation");
    const changeRoot = join(project, "openspec", "changes", "fixture-change");
    await mkdir(changeRoot, { recursive: true });
    await writeFile(join(changeRoot, "formal-task-board.md"), board("fixture-change", [canonicalPackageBlock("ready")]));
    await writeFile(join(changeRoot, "progress.txt"), canonicalProgress(true));
    const parentFile = join(project, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    let executions = 0;
    let revives = 0;
    let modelCalls = 0;
    const runtimeInstance = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-explicit-reconciliation",
      cwd: project,
      execute: async (input) => {
        executions += 1;
        const output = canonicalResult();
        persistAssistant(input, output);
        return { output, result: "completed" };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => {
        revives += 1;
        return { steer() {}, sendUserMessage() {}, dispose() {} };
      },
      modelHubOperation: async () => {
        modelCalls += 1;
        return {};
      },
    });
    const submitted = await runtimeInstance.task.submitTrusted({
      task: "complete exact formal package",
      agent: "aili.implementer",
      async: false,
      workspace: "shared",
      formalContext: { changeId: "fixture-change" },
      continuationAudit: continuationAudit(),
    });
    await persistFullAgentOutput(runtimeInstance.layout, submitted.results[0]!.agentId, canonicalResult("P-01", "blocked"));
    const runningBoard = board("fixture-change", [packageBlock({ status: "running" })]);
    const runningProgress = progress("fixture-change", [dispatched("P-01")]);
    await writeFile(join(changeRoot, "formal-task-board.md"), runningBoard);
    await writeFile(join(changeRoot, "progress.txt"), runningProgress);

    const first = await runtimeInstance.reconcileFormalTaskBoard({
      actor: "ROSE",
      changeId: "fixture-change",
      timestamp: "2026-07-30T00:01:00Z",
    });
    expect(first.status).toBe("applied");
    const tasksAfterFirst = await readFile(join(changeRoot, "formal-task-board.md"), "utf8");
    const progressAfterFirst = await readFile(join(changeRoot, "progress.txt"), "utf8");
    expect(tasksAfterFirst).toContain("  - Status: `returned`");
    expect(tasksAfterFirst).not.toContain("Runtime:");
    expect(progressAfterFirst.startsWith(runningProgress)).toBe(true);
    expect(progressAfterFirst).toContain("P-01 RETURNED");
    expect(progressAfterFirst).toContain("P-01 RECONCILED");
    expect(progressAfterFirst).not.toMatch(/^(?:agent|job|turn|output|history|runtime|decision)=/m);
    if (!("plan" in first) || !first.plan) throw new Error("applied reconciliation must retain its plan");
    expect(first.plan.decisions[0]).toMatchObject({ decision: "returned", operation: { result: "completed" } });
    expect(first.plan.decisions[0]?.operation).toMatchObject({ resultEvidence: expect.stringMatching(/^verification:formal-result\/fixture-change\/P-01\/[0-9a-f]{32}$/) });

    const second = await runtimeInstance.reconcileFormalTaskBoard({
      actor: "ROSE",
      changeId: "fixture-change",
      timestamp: "2026-07-30T00:02:00Z",
    });
    expect(second.status).toBe("preserved");
    expect(await readFile(join(changeRoot, "progress.txt"), "utf8")).toBe(progressAfterFirst);
    expect(executions).toBe(1);
    expect(revives).toBe(0);
    expect(modelCalls).toBe(0);
    await runtimeInstance.shutdown();
  });

  it("filters candidates by the full current change/package/role identity and blocks only two exact current candidates", async () => {
    const project = join(scratch, "candidate-identity");
    await mkdir(join(project, "openspec", "changes"), { recursive: true });
    await writePair(project, "fixture-change");
    await writePair(project, "other-change");
    const parentFile = join(project, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const runtimeInstance = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-candidate-identity",
      cwd: project,
      execute: async (input) => {
        const output = canonicalResult();
        persistAssistant(input, output);
        return { output };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });
    for (const changeId of ["other-change", "fixture-change"]) {
      await runtimeInstance.task.submitTrusted({
        task: `complete ${changeId}`,
        agent: "aili.implementer",
        async: false,
        workspace: "shared",
        formalContext: { changeId },
        continuationAudit: continuationAudit(),
      });
    }
    const changeRoot = join(project, "openspec", "changes", "fixture-change");
    const runningBoard = board("fixture-change", [packageBlock({ status: "running" })]);
    const runningProgress = progress("fixture-change", [dispatched("P-01")]);
    await writeFile(join(changeRoot, "formal-task-board.md"), runningBoard);
    await writeFile(join(changeRoot, "progress.txt"), runningProgress);
    const selected = await runtimeInstance.reconcileFormalTaskBoard({ actor: "ROSE", changeId: "fixture-change", timestamp: "2026-07-30T00:01:00Z" });
    expect(selected.status).toBe("applied");
    expect(await readFile(join(changeRoot, "formal-task-board.md"), "utf8")).toContain("  - Status: `returned`");

    await writeFile(join(changeRoot, "formal-task-board.md"), runningBoard);
    await writeFile(join(changeRoot, "progress.txt"), runningProgress);
    await runtimeInstance.task.submitTrusted({
      task: "second exact current candidate",
      agent: "aili.implementer",
      async: false,
      workspace: "shared",
      formalContext: { changeId: "fixture-change" },
      continuationAudit: continuationAudit(),
    });
    const ambiguous = await runtimeInstance.reconcileFormalTaskBoard({ actor: "ROSE", changeId: "fixture-change", timestamp: "2026-07-30T00:02:00Z" });
    expect(ambiguous).toMatchObject({ status: "blocked", diagnostics: ["RECONCILIATION_CANDIDATE_AMBIGUOUS:P-01"], updates: [] });
    expect(await readFile(join(changeRoot, "formal-task-board.md"), "utf8")).toBe(runningBoard);
    expect(await readFile(join(changeRoot, "progress.txt"), "utf8")).toBe(runningProgress);
    await runtimeInstance.shutdown();
  });

  it("revalidates immutable evidence, Journal sequence, and Agent release before guarded commit with zero board mutation", async () => {
    for (const race of ["output", "journal", "release"] as const) {
      const project = join(scratch, `precommit-${race}`);
      await mkdir(join(project, "openspec", "changes"), { recursive: true });
      await writePair(project, "fixture-change");
      const parentFile = join(project, "parent.jsonl");
      await writeFile(parentFile, "fixture parent\n");
      const runtimeInstance = await PersistentAgentRuntime.create({
        parentSessionPath: parentFile,
        parentId: `parent-precommit-${race}`,
        cwd: project,
        execute: async (input) => {
          const output = canonicalResult();
          persistAssistant(input, output);
          return { output };
        },
        parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
        revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
      });
      const submitted = await runtimeInstance.task.submitTrusted({
        task: `race ${race}`,
        agent: "aili.implementer",
        async: false,
        workspace: "shared",
        formalContext: { changeId: "fixture-change" },
        continuationAudit: continuationAudit(),
      });
      const settled = submitted.results[0]!;
      const changeRoot = join(project, "openspec", "changes", "fixture-change");
      const runningBoard = board("fixture-change", [packageBlock({ status: "running" })]);
      const runningProgress = progress("fixture-change", [dispatched("P-01")]);
      await writeFile(join(changeRoot, "formal-task-board.md"), runningBoard);
      await writeFile(join(changeRoot, "progress.txt"), runningProgress);
      const result = await runtimeInstance.reconcileFormalTaskBoard({
        actor: "ROSE",
        changeId: "fixture-change",
        timestamp: "2026-07-30T00:01:00Z",
        hooks: {
          beforeRename: async (target) => {
            if (target !== "tasks") return;
            if (race === "output") {
              const evidence = runtimeInstance.journal.getState().formalResultEvidence[settled.jobId]!;
              await writeFile(evidence.outputPath, `${canonicalResult()}\nchanged`);
            } else if (race === "journal") {
              await runtimeInstance.journal.append({ kind: "model.put", agentId: settled.agentId, payload: { model: "fixture/model" } });
            } else {
              await runtimeInstance.journal.append({ kind: "agent.released", agentId: settled.agentId, payload: { reason: "race fixture" } });
            }
          },
        },
      });
      expect(result.status, race).toBe("blocked");
      expect(await readFile(join(changeRoot, "formal-task-board.md"), "utf8"), race).toBe(runningBoard);
      expect(await readFile(join(changeRoot, "progress.txt"), "utf8"), race).toBe(runningProgress);
      await runtimeInstance.shutdown();
    }
  });

  it("maps a missing exact Journal binding to blocked without dispatch, fallback, acceptance, done, or JOINED", async () => {
    const project = join(scratch, "missing-reconciliation");
    const changeRoot = join(project, "openspec", "changes", "fixture-change");
    await mkdir(changeRoot, { recursive: true });
    const runningBoard = board("fixture-change", [packageBlock({ status: "running", execution: "async", join: "J-01" })]);
    const runningProgress = progress("fixture-change", [dispatched("P-01", 1, "async", "J-01")]);
    await writeFile(join(changeRoot, "formal-task-board.md"), runningBoard);
    await writeFile(join(changeRoot, "progress.txt"), runningProgress);
    const parentFile = join(project, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    let executions = 0;
    const runtimeInstance = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-missing-reconciliation",
      cwd: project,
      execute: async () => { executions += 1; return { output: "must not execute" }; },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
      revive: async () => { throw new Error("must not revive"); },
      modelHubOperation: async () => { throw new Error("must not select a fallback model"); },
    });
    const result = await runtimeInstance.reconcileFormalTaskBoard({
      actor: "ROSE",
      changeId: "fixture-change",
      timestamp: "2026-07-30T00:01:00Z",
    });
    expect(result.status).toBe("applied");
    const tasks = await readFile(join(changeRoot, "formal-task-board.md"), "utf8");
    const writtenProgress = await readFile(join(changeRoot, "progress.txt"), "utf8");
    expect(tasks).toContain("  - Status: `blocked`");
    expect(writtenProgress).toContain("P-01 BLOCKED");
    expect(writtenProgress).toContain("P-01 RECONCILED");
    expect(writtenProgress).not.toContain("P-01 JOINED");
    expect(writtenProgress).not.toContain("P-01 DONE");
    expect(executions).toBe(0);
    await runtimeInstance.shutdown();
  });
});

describe("formal_task adapter", () => {
  async function writeReadyPair(project: string, status: "pending" | "ready" = "ready"): Promise<void> {
    const root = join(project, "openspec", "changes", "fixture-change");
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "formal-task-board.md"), board("fixture-change", [canonicalPackageBlock(status)]));
    await writeFile(join(root, "progress.txt"), canonicalProgress(status === "ready"));
  }

  it("constructs the ordinary task request from the validated ready package", async () => {
    const project = join(scratch, "formal-task-project");
    await mkdir(join(project, "openspec", "changes"), { recursive: true });
    await writeReadyPair(project);

    const request = await buildFormalTaskDispatch(project, { changeId: "fixture-change", packageId: "P-01" });
    expect(request.agent).toBe("aili.implementer");
    expect(request.async).toBe(false);
    expect(request.formalContext).toEqual({ changeId: "fixture-change" });
    expect(request.continuationAudit).toEqual(continuationAudit());
    expect(request.task).toContain("Formal lifecycle package P-01");
    expect(request.task).toContain("Task identity: fixture-change");
    expect(request.task).toContain("Return evidence only");
  });

  it("fails closed on unknown packages, non-ready status, and missing pairs without touching ordinary dispatch", async () => {
    const project = join(scratch, "formal-task-closed-project");
    await mkdir(join(project, "openspec", "changes"), { recursive: true });
    await writeReadyPair(project);

    await expect(buildFormalTaskDispatch(project, { changeId: "fixture-change", packageId: "P-unknown" }))
      .rejects.toThrow(/is not on the validated board/);

    const pendingProject = join(scratch, "formal-task-pending-project");
    await mkdir(join(pendingProject, "openspec", "changes"), { recursive: true });
    await writeReadyPair(pendingProject, "pending");
    await expect(buildFormalTaskDispatch(pendingProject, { changeId: "fixture-change", packageId: "P-01" }))
      .rejects.toThrow(/only a ready package can be dispatched/);

    const emptyProject = join(scratch, "formal-task-empty-project");
    await mkdir(join(emptyProject, "openspec", "changes"), { recursive: true });
    await expect(buildFormalTaskDispatch(emptyProject, { changeId: "missing-change", packageId: "P-01" }))
      .rejects.toThrow(/root validation|requires an existing valid/);
  });
});
