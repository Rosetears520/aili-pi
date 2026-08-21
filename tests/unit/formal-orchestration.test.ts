import type { BeforeAgentStartEvent, BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  evaluateFormalPhaseGate,
  planFormalHubJoin,
  planFormalPackageExecution,
  type FormalLifecycleSnapshot,
  type FormalPackageExecutionObservation,
} from "../../src/runtime/formal-orchestration.js";
import { registerRoseContext } from "../../src/runtime/rose-context.js";
import { loadRoleProfiles, type RoleProfile } from "../../src/runtime/roles.js";

type PackageOptions = {
  id?: string;
  title?: string;
  status?: string;
  owner?: string;
  dispatch?: string;
  noDispatchReason?: string;
  execution?: string;
  join?: string;
  dependsOn?: string;
  evidence?: string;
  disposition?: string;
  blocker?: string;
  waiverClass?: string;
};

function packageBlock(options: PackageOptions = {}): string {
  const id = options.id ?? "P-01";
  const status = options.status ?? "ready";
  const owner = options.owner ?? "agent:aili.implementer";
  const dispatch = options.dispatch ?? (owner === "ROSE" ? "forbidden" : "required");
  const direct = owner === "ROSE" || dispatch === "waived";
  const execution = options.execution ?? (direct ? "direct" : "sync");
  const join = options.join ?? (direct ? "N/A" : "immediate");
  const executed = status === "running" || status === "returned" || status === "done";
  const returned = status === "returned" || status === "done";
  const waiverEvidence = dispatch === "waived" ? `decision:waiver/${options.waiverClass ?? "complete-user-provided-evidence"}` : undefined;
  return [
    `- [${status === "done" ? "x" : " "}] ${id} — ${options.title ?? "Execute one bounded package"}`,
    "  - Phase: `BUILD`",
    "  - Package kind: `task-execution`",
    `  - Source refs: \`task:${id}\``,
    `  - Accepted task IDs: \`${id}\``,
    `  - Status: \`${status}\``,
    `  - Owner: \`${owner}\``,
    `  - Dispatch: \`${dispatch}\``,
    `  - Dispatch reason: \`${dispatch === "required" ? "Exact bounded execution matches the selected specialist." : "N/A"}\``,
    `  - No-dispatch reason: \`${options.noDispatchReason ?? (dispatch === "waived" ? "Complete bounded evidence makes another dispatch redundant." : "N/A")}\``,
    `  - Execution: \`${execution}\``,
    `  - Join: \`${join}\``,
    `  - Depends on: \`${options.dependsOn ?? "none"}\``,
    "  - Decision gate: `accepted`",
    "  - Final test-plan gate: `accepted`",
    "  - Implementation authorization: `granted`",
    "  - Operation permissions: `granted`",
    "  - Scope: `Implement only the exact fixture behavior.`",
    "  - Forbidden scope: `No dependency, permission, schema, Git, publish, or release changes.`",
    "  - Expected result: `One bounded structured result.`",
    `  - Expected evidence: \`verification:expected-${id}\``,
    "  - Acceptance: `The bounded behavior passes its focused verification.`",
    `  - Dispatch evidence: \`${waiverEvidence ?? (executed && !direct ? `artifact:dispatch-${id}` : "pending")}\``,
    `  - Result evidence: \`${returned && !direct ? `artifact:result-${id}` : "pending"}\``,
    `  - Evidence: \`${options.evidence ?? (returned ? `artifact:evidence-${id}` : "pending")}\``,
    `  - ROSE disposition: \`${options.disposition ?? "pending"}\``,
    `  - Blocker: \`${options.blocker ?? "none"}\``,
    "  - Next action: `Execute or inspect this exact package under the current gate.`",
  ].join("\n");
}

function board(packages: string[], phase = "BUILD", status = "active"): string {
  return [
    "# Task Board",
    "",
    "- Protocol: `aili-task-board/v1`",
    "- Task kind: `formal`",
    "- Task identity: `fixture-change`",
    "- Goal: Validate deterministic formal orchestration.",
    `- Phase: \`${phase}\``,
    `- Board status: \`${status}\``,
    "- Accepted contract: `spec.md accepted`",
    "- Accepted verification: `test-plan.md accepted`",
    "- Decision owner: `ROSE`",
    "- Verification owner: `ROSE`",
    "",
    "## Packages",
    "",
    packages.map((taskPackage) => taskPackage.replace("  - Phase: `BUILD`", `  - Phase: \`${phase}\``)).join("\n\n"),
    "",
  ].join("\n");
}

function event(timestamp: string, subject: string, type: string, fields: Record<string, string>): string {
  return [`[${timestamp}] ${subject} ${type}`, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join("\n");
}

function created(phase = "BUILD"): string {
  return event("2026-07-30T00:00:00Z", "BOARD", "BOARD_CREATED", { evidence: `artifact:board-${phase}` });
}

function dispatched(id: string, execution = "sync", join = "immediate"): string {
  void execution;
  void join;
  return event("2026-07-30T00:00:01Z", id, "DISPATCHED", { evidence: `artifact:dispatch-${id}` });
}

function doneAgentEvents(id = "P-01", execution = "sync", join = "immediate", joined = false): string[] {
  const events = [
    dispatched(id, execution, join),
    event("2026-07-30T00:00:02Z", id, "RETURNED", { evidence: `artifact:result-${id}` }),
    event("2026-07-30T00:00:03Z", id, "INSPECTED", { disposition: "accepted", evidence: `artifact:evidence-${id}` }),
  ];
  if (joined) events.push(event("2026-07-30T00:00:04Z", id, "JOINED", { disposition: "accepted", evidence: `artifact:evidence-${id}` }));
  events.push(event(joined ? "2026-07-30T00:00:05Z" : "2026-07-30T00:00:04Z", id, "DONE", { verification: "verification:vitest-fresh" }));
  return events;
}

function progress(blocks: string[]): string {
  return `${blocks.join("\n\n")}\n`;
}

function lifecycle(
  profiles: readonly RoleProfile[],
  packages: string[],
  events: string[] = [],
  phase = "BUILD",
): FormalLifecycleSnapshot {
  const supplied = events.join("\n");
  const readiness = packages.flatMap((taskPackage) => {
    const id = taskPackage.match(/^- \[[ x]\] (\S+)/m)?.[1];
    const status = taskPackage.match(/  - Status: `([^`]+)`/)?.[1];
    if (!id || !status || !["ready", "running", "returned", "done"].includes(status)
      || supplied.includes(` ${id} READY`)) return [];
    return [event("2026-07-30T00:00:00Z", id, "READY", { evidence: `artifact:ready-${id}` })];
  });
  return {
    kind: "formal",
    taskIdentity: "fixture-change",
    phase: phase as FormalLifecycleSnapshot["phase"],
    tasksSource: board(packages, phase),
    progressSource: progress([created(phase), ...readiness, ...events]),
    profiles,
  };
}

function allowed() {
  return { state: "allowed", evidence: "Current operation policy and exact approvals allow this bounded package." } as const;
}

function ownership(classification: "agent-execution" | "rose-direct" | "mixed") {
  return { classification, evidence: "The accepted package boundary assigns this exact responsibility." } as const;
}

function observation(overrides: Partial<FormalPackageExecutionObservation> = {}): FormalPackageExecutionObservation {
  return {
    packageId: "P-01",
    actors: ["agent"],
    settled: true,
    outputReadable: true,
    historyReadable: true,
    inspected: true,
    ...overrides,
  };
}

function codes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map((entry) => entry.code);
}

describe("formal lifecycle orchestration planner", () => {
  it("keeps ordinary Pi benefit-based without a task request, waiver, or quota", () => {
    const result = planFormalPackageExecution({ lifecycle: { kind: "ordinary" } });
    expect(result).toEqual({ status: "ordinary-direct", reason: "benefit-based-routing", diagnostics: [] });
    expect(result).not.toHaveProperty("taskRequest");
  });

  it("maps ready Specialized Owners in every phase to exact explicit task inputs", async () => {
    const profiles = await loadRoleProfiles();
    const cases = [
      ["IDEATE", "aili.code-scout"],
      ["DEFINE", "aili.spec-miner"],
      ["BUILD", "aili.implementer"],
      ["SHIP", "aili.code-reviewer"],
    ] as const;
    for (const [phase, selector] of cases) {
      const result = planFormalPackageExecution({
        lifecycle: lifecycle(profiles, [packageBlock({ owner: `agent:${selector}` })], [], phase),
        packageId: "P-01",
        operationGate: allowed(),
        ownership: ownership("agent-execution"),
      });
      expect(result.status).toBe("task-request");
      if (result.status !== "task-request") continue;
      expect(result.taskRequest.agent).toBe(selector);
      expect(result.taskRequest.async).toBe(false);
      expect(result.taskRequest.formalContext).toEqual({ changeId: "fixture-change" });
      expect(Object.keys(result.taskRequest.formalContext)).toEqual(["changeId"]);
      expect(result.taskRequest.continuationAudit).toEqual({
        packageId: "P-01",
        canonicalRole: selector,
        scope: "Implement only the exact fixture behavior.",
        forbiddenScope: "No dependency, permission, schema, Git, publish, or release changes.",
        writeScope: { paths: [], resources: [] },
        acceptanceBoundary: "The bounded behavior passes its focused verification.",
        expectedEvidence: "verification:expected-P-01",
      });
      expect(result.taskRequest.task).toContain("Scope: Implement only the exact fixture behavior.");
      expect(result.taskRequest.task).toContain("Forbidden scope:");
      expect(result.join).toBe("immediate");
    }
  });

  it("never dispatches ROSE-owned or valid pre-recorded waived packages", async () => {
    const profiles = await loadRoleProfiles();
    const rose = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock({ owner: "ROSE" })]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("rose-direct"),
    });
    expect(rose.status).toBe("formal-direct");
    expect(rose).not.toHaveProperty("taskRequest");

    const waivedEvent = event("2026-07-30T00:00:01Z", "P-01", "WAIVED", {
      evidence: "decision:waiver/complete-user-provided-evidence",
    });
    const waived = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock({ dispatch: "waived" })], [waivedEvent]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
    });
    expect(waived.status).toBe("formal-direct");
    if (waived.status === "formal-direct") expect(waived.waiver?.waiverClass).toBe("complete-user-provided-evidence");
    expect(waived).not.toHaveProperty("taskRequest");
  });

  it("fails closed for general/unknown Owners, non-ready state, open dependencies, and mixed authority", async () => {
    const profiles = await loadRoleProfiles();
    const general = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock({ owner: "agent:general" })]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
    });
    expect(codes(general)).toContain("OWNER_GENERAL_FORBIDDEN");

    const unknown = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock({ owner: "agent:aili.not-a-role" })]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
    });
    expect(codes(unknown)).toContain("OWNER_SELECTOR_INVALID");

    const pending = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock({ status: "pending" })]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
    });
    expect(codes(pending)).toContain("PACKAGE_NOT_READY");

    const dependency = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [
        packageBlock({ id: "D-01", status: "pending" }),
        packageBlock({ id: "P-01", dependsOn: "D-01" }),
      ]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
    });
    expect(codes(dependency)).toContain("DEPENDENCY_NOT_DONE");

    const mixed = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock()]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("mixed"),
    });
    expect(codes(mixed)).toContain("MIXED_AUTHORITY_SCOPE");
  });

  it("requires current operation authority and blocks duplicate ROSE execution of Agent scope", async () => {
    const profiles = await loadRoleProfiles();
    const result = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock()]),
      packageId: "P-01",
      operationGate: { state: "blocked", evidence: "Dependency installation has no exact approval." },
      ownership: ownership("agent-execution"),
      observations: [observation({ actors: ["ROSE"], directWorkStartedAt: "2026-07-30T00:00:02Z" })],
    });
    expect(codes(result)).toEqual(expect.arrayContaining(["OPERATION_GATE_BLOCKED", "DUPLICATE_SCOPE"]));
    expect(result).not.toHaveProperty("taskRequest");
  });

  it("maps sync to async:false and independent named joins to async:true only with explicit safety", async () => {
    const profiles = await loadRoleProfiles();
    const asyncLifecycle = lifecycle(profiles, [packageBlock({ execution: "async", join: "J-01" })]);
    const unsafe = planFormalPackageExecution({
      lifecycle: asyncLifecycle,
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
    });
    expect(codes(unsafe)).toContain("ASYNC_SAFETY_UNVERIFIED");
    const safe = planFormalPackageExecution({
      lifecycle: asyncLifecycle,
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
      asyncSafety: {
        independent: true,
        nonOverlapping: true,
        safeToProceed: true,
        evidence: "Inputs and scope are independent and current work does not consume this result.",
      },
    });
    expect(safe.status).toBe("task-request");
    if (safe.status === "task-request") expect(safe.taskRequest).toMatchObject({ agent: "aili.implementer", async: true });
  });

  it("rejects invalid closed-class and post-hoc waivers", async () => {
    const profiles = await loadRoleProfiles();
    for (const [waiverClass, startedAt, expected] of [
      ["convenience", undefined, "WAIVER_CLASS_INVALID"],
      ["complete-user-provided-evidence", "2026-07-30T00:00:00Z", "WAIVER_POST_HOC"],
    ] as const) {
      const waivedEvent = event("2026-07-30T00:00:01Z", "P-01", "WAIVED", {
        evidence: `decision:waiver/${waiverClass}`,
      });
      const result = planFormalPackageExecution({
        lifecycle: lifecycle(profiles, [packageBlock({ dispatch: "waived", waiverClass })], [waivedEvent]),
        packageId: "P-01",
        operationGate: allowed(),
        ownership: ownership("agent-execution"),
        ...(startedAt ? { observations: [observation({ actors: ["ROSE"], directWorkStartedAt: startedAt })] } : {}),
      });
      expect(codes(result)).toContain(expected);
    }
  });

  it("requires settled readable inspected dependency evidence before a dependent dispatch", async () => {
    const profiles = await loadRoleProfiles();
    const source = lifecycle(profiles, [
      packageBlock({ id: "D-01", status: "done", evidence: "artifact:evidence-D-01", disposition: "accepted" }),
      packageBlock({ id: "P-01", dependsOn: "D-01" }),
    ], doneAgentEvents("D-01"));
    const unreadable = planFormalPackageExecution({
      lifecycle: source,
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
      observations: [observation({ packageId: "D-01", outputReadable: false })],
    });
    expect(codes(unreadable)).toContain("DEPENDENCY_OUTPUT_UNREADABLE");
    const ready = planFormalPackageExecution({
      lifecycle: source,
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
      observations: [observation({ packageId: "D-01" })],
    });
    expect(ready.status).toBe("task-request");
  });
});

describe("formal hub joins and phase gates", () => {
  it("projects existing hub wait/jobs/output/history requests without invoking or changing hub", async () => {
    const profiles = await loadRoleProfiles();
    const running = lifecycle(profiles, [packageBlock({ status: "running", execution: "async", join: "J-01" })], [dispatched("P-01", "async", "J-01")]);
    const plan = planFormalHubJoin(running, "J-01");
    expect(plan.status).toBe("waiting");
    expect(plan.requests).toEqual([]);

    const closed = lifecycle(profiles, [packageBlock({ status: "done", execution: "async", join: "J-01", evidence: "artifact:evidence-P-01", disposition: "accepted" })], doneAgentEvents("P-01", "async", "J-01", true));
    expect(planFormalHubJoin(closed, "J-01")).toMatchObject({ status: "closed", requests: [] });
  });

  it("keeps multi-member Join semantics independent of completion order and fails visibly for a blocked member", async () => {
    const profiles = await loadRoleProfiles();
    const completionOutOfBoardOrder = lifecycle(profiles, [
      packageBlock({ id: "P-01", status: "done", execution: "async", join: "J-01", evidence: "artifact:evidence-P-01", disposition: "accepted" }),
      packageBlock({ id: "P-02", status: "done", execution: "async", join: "J-01", evidence: "artifact:evidence-P-02", disposition: "accepted" }),
    ], [
      dispatched("P-01", "async", "J-01"),
      event("2026-07-30T00:00:02Z", "P-02", "DISPATCHED", {
        evidence: "artifact:dispatch-P-02",
      }),
      event("2026-07-30T00:00:03Z", "P-02", "RETURNED", { evidence: "artifact:result-P-02" }),
      event("2026-07-30T00:00:04Z", "P-02", "INSPECTED", { disposition: "accepted", evidence: "artifact:evidence-P-02" }),
      event("2026-07-30T00:00:05Z", "P-02", "JOINED", { disposition: "accepted", evidence: "artifact:evidence-P-02" }),
      event("2026-07-30T00:00:06Z", "P-02", "DONE", { verification: "verification:vitest-P-02" }),
      event("2026-07-30T00:00:07Z", "P-01", "RETURNED", { evidence: "artifact:result-P-01" }),
      event("2026-07-30T00:00:08Z", "P-01", "INSPECTED", { disposition: "accepted", evidence: "artifact:evidence-P-01" }),
      event("2026-07-30T00:00:09Z", "P-01", "JOINED", { disposition: "accepted", evidence: "artifact:evidence-P-01" }),
      event("2026-07-30T00:00:10Z", "P-01", "DONE", { verification: "verification:vitest-P-01" }),
    ]);
    const closed = planFormalHubJoin(completionOutOfBoardOrder, "J-01");
    expect(closed).toMatchObject({
      status: "closed",
      members: [
        { packageId: "P-01", joined: true },
        { packageId: "P-02", joined: true },
      ],
      requests: [],
    });

    const blockedMember = lifecycle(profiles, [packageBlock({
      status: "blocked",
      execution: "async",
      join: "J-FAIL",
      evidence: "artifact:blocked-inspection",
      disposition: "needs-follow-up",
      blocker: "The async worker was interrupted.",
    })], [
      dispatched("P-01", "async", "J-FAIL"),
      event("2026-07-30T00:00:02Z", "P-01", "BLOCKED", { blocker: "The async worker was interrupted.", next_action: "ROSE decides a lawful recovery." }),
      event("2026-07-30T00:00:03Z", "P-01", "INSPECTED", { disposition: "needs-follow-up", evidence: "artifact:blocked-inspection" }),
      event("2026-07-30T00:00:04Z", "P-01", "JOINED", { disposition: "needs-follow-up", blocker: "The async worker was interrupted." }),
    ]);
    const blocked = planFormalHubJoin(blockedMember, "J-FAIL");
    expect(blocked.status).toBe("blocked");
    expect(codes(blocked)).toContain("JOIN_MEMBER_BLOCKED");
  });

  it("allows completion only from the evidence graph, never terminal calls or worker claims", async () => {
    const profiles = await loadRoleProfiles();
    const source = lifecycle(profiles, [packageBlock({ status: "done", evidence: "artifact:evidence-P-01", disposition: "accepted" })], doneAgentEvents());
    const phaseEvidence = {
      finalInspection: "diff://final changed scope inspected by ROSE",
      verification: { fresh: true, evidence: "verification:vitest-fresh-formal-orchestration" },
      materialDelta: { present: false, evidence: "Inspection found no material architecture or contract delta." },
      residualUnverified: ["Unverified: external provider availability remains outside this bounded package."],
    } as const;
    const eligible = evaluateFormalPhaseGate({ lifecycle: source, observations: [observation()], phaseEvidence });
    expect(eligible.status).toBe("eligible");
    expect(eligible.residualUnverified).toEqual(phaseEvidence.residualUnverified);

    const ignoredCalls = evaluateFormalPhaseGate({
      lifecycle: source,
      observations: [],
      phaseEvidence,
      agentCallCount: 99,
    } as Parameters<typeof evaluateFormalPhaseGate>[0] & { agentCallCount: number });
    expect(ignoredCalls.status).toBe("blocked");
    expect(codes(ignoredCalls)).toContain("PHASE_EXECUTION_EVIDENCE_MISSING");
  });

  it("blocks returned-without-disposition, unreadable refs, duplicate scope, missing final checks, and material delta", async () => {
    const profiles = await loadRoleProfiles();
    const returned = lifecycle(profiles, [packageBlock({ status: "returned", evidence: "artifact:evidence-P-01" })], [
      dispatched("P-01"),
      event("2026-07-30T00:00:02Z", "P-01", "RETURNED", { evidence: "artifact:result-P-01" }),
    ]);
    const baseEvidence = {
      finalInspection: "pending",
      verification: { fresh: false, evidence: "pending" },
      materialDelta: { present: true, evidence: "A public contract changed during BUILD." },
      residualUnverified: [],
    } as const;
    const returnedGate = evaluateFormalPhaseGate({ lifecycle: returned, observations: [], phaseEvidence: baseEvidence });
    expect(codes(returnedGate)).toEqual(expect.arrayContaining([
      "RETURNED_DISPOSITION_PENDING",
      "PACKAGE_NOT_DONE",
      "PHASE_FINAL_INSPECTION_MISSING",
      "PHASE_FRESH_VERIFICATION_MISSING",
      "MATERIAL_DELTA_REQUIRES_DEFINE",
    ]));
    expect(returnedGate.requiredPhase).toBe("DEFINE");

    const done = lifecycle(profiles, [packageBlock({ status: "done", evidence: "artifact:evidence-P-01", disposition: "accepted" })], doneAgentEvents());
    const unreadable = evaluateFormalPhaseGate({
      lifecycle: done,
      observations: [observation({ actors: ["ROSE", "agent"], outputReadable: false, historyReadable: false })],
      phaseEvidence: {
        finalInspection: "diff://final",
        verification: { fresh: true, evidence: "verification:vitest-fresh" },
        materialDelta: { present: false, evidence: "No material delta found in the accepted scope." },
        residualUnverified: [],
      },
    });
    expect(codes(unreadable)).toEqual(expect.arrayContaining(["DUPLICATE_SCOPE", "PHASE_OUTPUT_UNREADABLE", "PHASE_HISTORY_UNREADABLE"]));
  });

  it("keeps a post-hoc waiver from satisfying the phase gate", async () => {
    const profiles = await loadRoleProfiles();
    const source = lifecycle(profiles, [packageBlock({
      status: "done",
      dispatch: "waived",
      evidence: "artifact:waived-direct-result",
      disposition: "accepted",
    })], [
      event("2026-07-30T00:00:01Z", "P-01", "WAIVED", {
        evidence: "decision:waiver/complete-user-provided-evidence",
      }),
      event("2026-07-30T00:00:03Z", "P-01", "INSPECTED", { disposition: "accepted", evidence: "artifact:waived-direct-result" }),
      event("2026-07-30T00:00:04Z", "P-01", "DONE", { verification: "verification:vitest-fresh" }),
    ]);
    const result = evaluateFormalPhaseGate({
      lifecycle: source,
      observations: [observation({ actors: ["ROSE"], directWorkStartedAt: "2026-07-30T00:00:00Z" })],
      phaseEvidence: {
        finalInspection: "diff://final",
        verification: { fresh: true, evidence: "verification:vitest-fresh" },
        materialDelta: { present: false, evidence: "No material delta found in the accepted scope." },
        residualUnverified: [],
      },
    });
    expect(codes(result)).toContain("WAIVER_POST_HOC");
  });

  it("keeps a named async join open until inspected JOINED evidence exists", async () => {
    const profiles = await loadRoleProfiles();
    const returned = lifecycle(profiles, [packageBlock({ status: "returned", execution: "async", join: "J-01", evidence: "artifact:evidence-P-01" })], [
      dispatched("P-01", "async", "J-01"),
      event("2026-07-30T00:00:02Z", "P-01", "RETURNED", { evidence: "artifact:result-P-01" }),
    ]);
    const join = planFormalHubJoin(returned, "J-01");
    expect(join.status).toBe("waiting");
    expect(join.members[0]).toMatchObject({ joined: false, status: "returned" });
  });
});

describe("production lifecycle guidance provider seam", () => {
  it("reads explicit current planner guidance only while task is active", async () => {
    const profiles = await loadRoleProfiles();
    const plan = planFormalPackageExecution({
      lifecycle: lifecycle(profiles, [packageBlock()]),
      packageId: "P-01",
      operationGate: allowed(),
      ownership: ownership("agent-execution"),
    });
    if (plan.status !== "task-request") throw new Error(codes(plan).join(", "));
    let handler: ((event: BeforeAgentStartEvent) => BeforeAgentStartEventResult | void) | undefined;
    let providerCalls = 0;
    const pi = {
      on: (name: string, candidate: (event: BeforeAgentStartEvent) => BeforeAgentStartEventResult) => { if (name === "before_agent_start") handler = candidate; },
      getActiveTools: () => ["sub"],
      getCommands: () => [],
    } as unknown as ExtensionAPI;
    registerRoseContext(pi, {
      lifecycleAgentGuidanceProvider: () => {
        providerCalls += 1;
        return plan.guidance;
      },
    });
    const result = handler?.({
      type: "before_agent_start",
      prompt: "continue",
      systemPrompt: "PI",
      systemPromptOptions: { cwd: "/project" },
    });
    expect(providerCalls).toBe(1);
    expect(result?.systemPrompt).toContain("Active formal lifecycle Agent guidance");
    expect(result?.systemPrompt).toContain("P-01:ready");
  });
});
