import { describe, expect, it } from "vitest";
import {
  FORMAL_TASK_PACKAGE_FIELDS,
  FORMAL_TASK_PROGRESS_EVENT_TYPES,
  parseFormalTaskBoard,
  parseFormalTaskProgress,
  validateFormalTaskBoard,
} from "../../src/runtime/formal-task-board.js";

type PackageOptions = {
  id?: string;
  title?: string;
  checked?: boolean;
  phase?: string;
  packageKind?: string;
  sourceRefs?: string;
  acceptedTaskIds?: string;
  status?: string;
  owner?: string;
  dispatch?: string;
  dispatchReason?: string;
  noDispatchReason?: string;
  execution?: string;
  join?: string;
  dependsOn?: string;
  decisionGate?: string;
  finalTestPlanGate?: string;
  implementationAuthorization?: string;
  operationPermissions?: string;
  dispatchEvidence?: string;
  resultEvidence?: string;
  expectedEvidence?: string;
  evidence?: string;
  disposition?: string;
  blocker?: string;
  nextAction?: string;
};

function packageBlock(options: PackageOptions = {}): string {
  const id = options.id ?? "P-01";
  const status = options.status ?? "ready";
  const owner = options.owner ?? "agent:aili.implementer";
  const dispatch = options.dispatch ?? "required";
  const execution = options.execution ?? "sync";
  const join = options.join ?? "immediate";
  const checked = options.checked ?? status === "done";
  return [
    `- [${checked ? "x" : " "}] ${id} — ${options.title ?? "Implement bounded behavior"}`,
    `  - Phase: \`${options.phase ?? "BUILD"}\``,
    `  - Package kind: \`${options.packageKind ?? "task-execution"}\``,
    `  - Source refs: \`${options.sourceRefs ?? `task:${id}`}\``,
    `  - Accepted task IDs: \`${options.acceptedTaskIds ?? id}\``,
    `  - Status: \`${status}\``,
    `  - Owner: \`${owner}\``,
    `  - Dispatch: \`${dispatch}\``,
    `  - Dispatch reason: \`${options.dispatchReason ?? "Bounded implementation belongs to the exact specialist."}\``,
    `  - No-dispatch reason: \`${options.noDispatchReason ?? "N/A"}\``,
    `  - Execution: \`${execution}\``,
    `  - Join: \`${join}\``,
    `  - Depends on: \`${options.dependsOn ?? "none"}\``,
    `  - Decision gate: \`${options.decisionGate ?? "N/A"}\``,
    `  - Final test-plan gate: \`${options.finalTestPlanGate ?? "accepted"}\``,
    `  - Implementation authorization: \`${options.implementationAuthorization ?? "granted"}\``,
    `  - Operation permissions: \`${options.operationPermissions ?? "N/A"}\``,
    "  - Scope: `Implement only the bounded fixture scope.`",
    "  - Forbidden scope: `No filesystem, dependency, Git, permission, or release changes.`",
    "  - Expected result: `One deterministic result.`",
    `  - Expected evidence: \`${options.expectedEvidence ?? `verification:focused-${id}; artifact:result/${id}`}\``,
    "  - Acceptance: `The exact fixture behavior is verified.`",
    `  - Dispatch evidence: \`${options.dispatchEvidence ?? (dispatch === "required" && (status === "running" || status === "returned" || status === "done") ? `artifact:dispatch/${id}` : "pending")}\``,
    `  - Result evidence: \`${options.resultEvidence ?? (dispatch === "required" && (status === "returned" || status === "done") ? `artifact:result/${id}` : "pending")}\``,
    `  - Evidence: \`${options.evidence ?? "pending"}\``,
    `  - ROSE disposition: \`${options.disposition ?? "pending"}\``,
    `  - Blocker: \`${options.blocker ?? "none"}\``,
    `  - Next action: \`${options.nextAction ?? "Dispatch or wait for a non-dependency gate."}\``,
  ].join("\n");
}

function board(packages: string[], overrides: Partial<Record<"Protocol" | "Task kind" | "Task identity" | "Goal" | "Phase" | "Board status" | "Accepted contract" | "Accepted verification" | "Decision owner" | "Verification owner", string>> = {}): string {
  return [
    "# Task Board",
    "",
    `- Protocol: \`${overrides.Protocol ?? "aili-task-board/v1"}\``,
    `- Task kind: \`${overrides["Task kind"] ?? "formal"}\``,
    `- Task identity: \`${overrides["Task identity"] ?? "fixture-change"}\``,
    `- Goal: ${overrides.Goal ?? "Validate one bounded formal board."}`,
    `- Phase: \`${overrides.Phase ?? "BUILD"}\``,
    `- Board status: \`${overrides["Board status"] ?? "active"}\``,
    `- Accepted contract: \`${overrides["Accepted contract"] ?? "spec.md"}\``,
    `- Accepted verification: \`${overrides["Accepted verification"] ?? "test-plan.md accepted"}\``,
    `- Decision owner: \`${overrides["Decision owner"] ?? "ROSE"}\``,
    `- Verification owner: \`${overrides["Verification owner"] ?? "ROSE"}\``,
    "",
    "## Packages",
    "",
    packages.join("\n\n"),
    "",
  ].join("\n");
}

function event(timestamp: string, subject: string, type: string, fields: Record<string, string>): string {
  return [`[${timestamp}] ${subject} ${type}`, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join("\n");
}

function boardCreated(timestamp = "2026-07-29T00:00:00Z"): string {
  return event(timestamp, "BOARD", "BOARD_CREATED", {});
}

function agentDoneEvents(id = "P-01", options: { execution?: "sync" | "async"; join?: string; joined?: boolean; startSecond?: number } = {}): string[] {
  const second = options.startSecond ?? 1;
  const at = (offset: number) => `2026-07-29T00:00:${String(second + offset).padStart(2, "0")}Z`;
  const events = [
    event(at(-1), id, "READY", { evidence: `artifact:ready/${id}` }),
    event(at(0), id, "DISPATCHED", {
      evidence: `artifact:dispatch/${id}`,
    }),
    event(at(1), id, "RETURNED", { evidence: `artifact:result/${id}` }),
    event(at(2), id, "INSPECTED", { disposition: "accepted", evidence: `verification:${id}` }),
  ];
  if (options.joined) {
    events.push(event(at(3), id, "JOINED", {
      disposition: "accepted",
      evidence: `verification:${id}`,
    }));
  }
  events.push(event(at(options.joined ? 4 : 3), id, "DONE", { verification: "verification:formal-task-board" }));
  return events;
}

function progress(blocks: string[]): string {
  return `${blocks.join("\n\n")}\n`;
}

function boardDoneEvents(startSecond = 50): string[] {
  const at = (offset: number) => `2026-07-29T00:00:${String(startSecond + offset).padStart(2, "0")}Z`;
  return [
    event(at(0), "BOARD", "INSPECTED", { evidence: "artifact:formal-board; verification:accepted-packages" }),
    event(at(1), "BOARD", "DONE", { verification: "verification:formal-task-board" }),
  ];
}

function diagnosticCodes(result: { diagnostics: Array<{ code: string }> }): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("formal task-board v1 parser and validator", () => {
  it("parses one ordered valid v1 board without rewriting source text", () => {
    const source = board([
      packageBlock({ id: "P-02", title: "Second package" }),
      packageBlock({ id: "P-01", title: "First dependency-order-independent package", status: "pending" }),
    ]);
    const original = source;
    const parsed = parseFormalTaskBoard(source);
    const validation = validateFormalTaskBoard(source, progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "P-02", "READY", { evidence: "artifact:ready/P-02" }),
    ]));

    expect(parsed.classification).toBe("v1");
    expect(parsed.board?.packages.map((taskPackage) => taskPackage.id)).toEqual(["P-02", "P-01"]);
    expect(parsed.board?.packages[0]?.fields.Status?.value).toBe("ready");
    expect(parsed.diagnostics).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(source).toBe(original);
  });

  it("returns byte-for-byte deterministic parse and validation results", () => {
    const source = board([packageBlock()]);
    const progressSource = progress([boardCreated()]);
    expect(parseFormalTaskBoard(source)).toEqual(parseFormalTaskBoard(source));
    expect(parseFormalTaskProgress(progressSource)).toEqual(parseFormalTaskProgress(progressSource));
    expect(validateFormalTaskBoard(source, progressSource)).toEqual(validateFormalTaskBoard(source, progressSource));
    expect(FORMAL_TASK_PACKAGE_FIELDS).toEqual([
      "Phase", "Package kind", "Source refs", "Accepted task IDs", "Status", "Owner", "Dispatch", "Dispatch reason",
      "No-dispatch reason", "Execution", "Join", "Depends on", "Decision gate", "Final test-plan gate",
      "Implementation authorization", "Operation permissions", "Scope", "Forbidden scope", "Expected result",
      "Expected evidence", "Acceptance", "Dispatch evidence", "Result evidence", "Evidence", "ROSE disposition",
      "Blocker", "Next action",
    ]);
  });

  it("returns bounded diagnostics instead of throwing on non-string input or invalid runtime options", () => {
    expect(parseFormalTaskBoard(null as never)).toMatchObject({ classification: "invalid" });
    expect(diagnosticCodes(parseFormalTaskProgress(null as never))).toContain("INPUT_TYPE_INVALID");
    expect(validateFormalTaskBoard(board([packageBlock()]), progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "P-01", "READY", { evidence: "artifact:ready/P-01" }),
    ]), null as never).valid).toBe(true);
  });

  it("rejects missing, duplicate, malformed, and out-of-order headers and fields", () => {
    const valid = board([packageBlock()]);
    const missingHeader = valid.replace("- Goal: Validate one bounded formal board.\n", "");
    const duplicateHeader = valid.replace("- Phase: `BUILD`", "- Phase: `BUILD`\n- Phase: `BUILD`");
    const missingField = valid.replace("  - Owner: `agent:aili.implementer`\n", "");
    const duplicateField = valid.replace("  - Status: `ready`", "  - Status: `ready`\n  - Status: `ready`");
    const malformedField = valid.replace("  - Owner: `agent:aili.implementer`", "    - Owner: `agent:aili.implementer`");
    const outOfOrder = valid.replace(
      "  - Status: `ready`\n  - Owner: `agent:aili.implementer`",
      "  - Owner: `agent:aili.implementer`\n  - Status: `ready`",
    );
    const outOfOrderHeader = valid.replace(
      "- Protocol: `aili-task-board/v1`\n- Task kind: `formal`",
      "- Task kind: `formal`\n- Protocol: `aili-task-board/v1`",
    );
    const malformedRow = valid.replace("- [ ] P-01 —", "- [maybe] P-01 -");
    const trailingUnknownHeader = `${valid}- Unexpected header: value\n`;

    expect(diagnosticCodes(parseFormalTaskBoard(missingHeader))).toContain("BOARD_HEADER_MISSING");
    expect(diagnosticCodes(parseFormalTaskBoard(duplicateHeader))).toContain("BOARD_HEADER_DUPLICATE");
    expect(diagnosticCodes(parseFormalTaskBoard(missingField))).toContain("PACKAGE_FIELD_MISSING");
    expect(diagnosticCodes(parseFormalTaskBoard(duplicateField))).toContain("PACKAGE_FIELD_DUPLICATE");
    expect(diagnosticCodes(parseFormalTaskBoard(malformedField))).toEqual(expect.arrayContaining(["PACKAGE_FIELD_MALFORMED", "PACKAGE_FIELD_MISSING"]));
    expect(diagnosticCodes(parseFormalTaskBoard(outOfOrder))).toContain("PACKAGE_FIELD_ORDER_INVALID");
    expect(diagnosticCodes(parseFormalTaskBoard(outOfOrderHeader))).toContain("BOARD_HEADER_ORDER_INVALID");
    expect(diagnosticCodes(parseFormalTaskBoard(malformedRow))).toContain("PACKAGE_ROW_MALFORMED");
    expect(diagnosticCodes(parseFormalTaskBoard(trailingUnknownHeader))).toContain("BOARD_HEADER_UNKNOWN");
  });

  it("classifies malformed, duplicate, and conflicting protocol markers as invalid", () => {
    const valid = board([packageBlock()]);
    const malformed = valid.replace("- Protocol: `aili-task-board/v1`", "- Protocol: aili-task-board/v1");
    const malformedCase = valid.replace("- Protocol: `aili-task-board/v1`", "- protocol: `aili-task-board/v1`");
    const duplicate = valid.replace("- Protocol: `aili-task-board/v1`", "- Protocol: `aili-task-board/v1`\n- Protocol: `aili-task-board/v1`");
    const conflicting = valid.replace("- Protocol: `aili-task-board/v1`", "- Protocol: `aili-task-board/v1`\n- Protocol: `aili-task-board/v2`");

    expect(parseFormalTaskBoard(malformed).classification).toBe("invalid");
    expect(diagnosticCodes(parseFormalTaskBoard(malformed))).toContain("PROTOCOL_MARKER_MALFORMED");
    expect(parseFormalTaskBoard(malformedCase).classification).toBe("invalid");
    expect(diagnosticCodes(parseFormalTaskBoard(malformedCase))).toContain("PROTOCOL_MARKER_MALFORMED");
    expect(diagnosticCodes(parseFormalTaskBoard(duplicate))).toContain("PROTOCOL_MARKER_DUPLICATE");
    expect(diagnosticCodes(parseFormalTaskBoard(conflicting))).toContain("PROTOCOL_MARKER_CONFLICTING");
  });

  it("rejects duplicate and invalid stable package IDs", () => {
    const duplicate = board([packageBlock({ id: "P-01" }), packageBlock({ id: "P-01", status: "pending" })]);
    const invalid = board([packageBlock({ id: "bad/id" })]);
    expect(diagnosticCodes(validateFormalTaskBoard(duplicate, progress([boardCreated()])))).toContain("PACKAGE_ID_DUPLICATE");
    expect(diagnosticCodes(validateFormalTaskBoard(invalid, progress([boardCreated()])))).toContain("PACKAGE_ID_INVALID");
  });

  it("rejects missing dependencies and dependency cycles without promoting pending work", () => {
    const missing = board([packageBlock({ id: "P-01", status: "pending", dependsOn: "P-99" })]);
    const cycle = board([
      packageBlock({ id: "P-01", status: "pending", dependsOn: "P-02" }),
      packageBlock({ id: "P-02", status: "pending", dependsOn: "P-01" }),
    ]);
    expect(diagnosticCodes(validateFormalTaskBoard(missing, progress([boardCreated()])))).toContain("DEPENDENCY_MISSING");
    expect(diagnosticCodes(validateFormalTaskBoard(cycle, progress([boardCreated()])))).toContain("DEPENDENCY_CYCLE");
    const cyclePackages = validateFormalTaskBoard(cycle, progress([boardCreated()])).diagnostics
      .filter((diagnostic) => diagnostic.code === "DEPENDENCY_CYCLE")
      .map((diagnostic) => diagnostic.packageId);
    expect(cyclePackages).toEqual(["P-01", "P-02"]);
  });

  it("rejects general and selectors outside the current specialized authority", () => {
    const general = board([packageBlock({ owner: "agent:general" })]);
    const unknown = board([packageBlock({ owner: "agent:aili.not-a-role" })]);
    expect(diagnosticCodes(validateFormalTaskBoard(general, progress([boardCreated()])))).toContain("OWNER_GENERAL_FORBIDDEN");
    expect(diagnosticCodes(validateFormalTaskBoard(unknown, progress([boardCreated()])))).toContain("OWNER_SELECTOR_INVALID");
  });

  it("rejects invalid Owner, Dispatch, Execution, and Join combinations", () => {
    const roseRequired = board([packageBlock({ owner: "ROSE", dispatch: "required", execution: "sync", join: "immediate" })]);
    const agentDirect = board([packageBlock({ dispatch: "required", execution: "direct", join: "N/A" })]);
    const agentForbidden = board([packageBlock({ dispatch: "forbidden" })]);
    expect(diagnosticCodes(validateFormalTaskBoard(roseRequired, progress([boardCreated()])))).toEqual(expect.arrayContaining([
      "OWNER_DISPATCH_MISMATCH",
      "OWNER_EXECUTION_MISMATCH",
      "OWNER_JOIN_MISMATCH",
    ]));
    expect(diagnosticCodes(validateFormalTaskBoard(agentDirect, progress([boardCreated()])))).toContain("AGENT_EXECUTION_JOIN_MISMATCH");
    expect(diagnosticCodes(validateFormalTaskBoard(agentForbidden, progress([boardCreated()])))).toContain("AGENT_DISPATCH_MISMATCH");
  });

  it("enforces the seven-state checkbox invariant", () => {
    const checkedReady = board([packageBlock({ status: "ready", checked: true })]);
    const invalidStatus = board([packageBlock({ status: "complete" })]);
    expect(diagnosticCodes(validateFormalTaskBoard(checkedReady, progress([boardCreated()])))).toContain("CHECKBOX_STATUS_MISMATCH");
    expect(diagnosticCodes(validateFormalTaskBoard(invalidStatus, progress([boardCreated()])))).toContain("PACKAGE_STATUS_INVALID");
    for (const status of ["pending", "ready", "running", "returned", "done", "blocked", "cancelled"]) {
      expect(diagnosticCodes(validateFormalTaskBoard(board([packageBlock({ status })]), progress([boardCreated()]))))
        .not.toContain("PACKAGE_STATUS_INVALID");
    }
    expect(FORMAL_TASK_PROGRESS_EVENT_TYPES).toEqual([
      "BOARD_CREATED", "READY", "DISPATCHED", "WAIVED", "RETURNED", "INSPECTED", "JOINED", "DONE",
      "BLOCKED", "UNBLOCKED", "CANCELLED", "RECONCILED",
    ]);
  });

  it("does not treat pending operation-gate prose as accepted gate evidence", () => {
    const source = board([packageBlock()], { "Accepted verification": "pending user acceptance" });
    expect(diagnosticCodes(validateFormalTaskBoard(source, progress([
      boardCreated().replace("acceptance=test-plan.md accepted", "acceptance=pending user acceptance"),
    ])))).toContain("PHASE_VERIFICATION_GATE_OPEN");
  });

  it("rejects Board Runtime fields and runtime-private progress references", () => {
    const source = board([packageBlock()]).replace(
      "  - Dispatch evidence: `pending`",
      "  - Runtime: `agent=agent-1; job=job-1`\n  - Dispatch evidence: `pending`",
    );
    const progressSource = progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "P-01", "READY", { agent: "agent-1", history: "history://private" }),
    ]);
    expect(diagnosticCodes(parseFormalTaskBoard(source))).toContain("PACKAGE_FIELD_UNKNOWN");
    expect(diagnosticCodes(parseFormalTaskProgress(progressSource))).toEqual(expect.arrayContaining([
      "PROGRESS_RUNTIME_REF_FORBIDDEN",
      "PROGRESS_RUNTIME_REF_FORBIDDEN",
    ]));
  });

  it("does not let Expected evidence or runtime references substitute for actual Evidence", () => {
    const expected = "A focused test result and bounded artifact anchor.";
    const source = board([packageBlock({
      status: "done",
      expectedEvidence: expected,
      evidence: expected,
      disposition: "accepted",
      nextAction: "Completed after ROSE inspection.",
    })], { "Board status": "done" });
    const result = validateFormalTaskBoard(source, progress([boardCreated(), ...agentDoneEvents(), ...boardDoneEvents()]));
    expect(diagnosticCodes(result)).toContain("EXPECTED_EVIDENCE_SUBSTITUTION");

    const pendingEvidence = source.replace(`  - Evidence: \`${expected}\``, "  - Evidence: `pending`");
    expect(diagnosticCodes(validateFormalTaskBoard(pendingEvidence, progress([boardCreated(), ...agentDoneEvents(), ...boardDoneEvents()])))).toContain("ACTUAL_EVIDENCE_REQUIRED");
  });

  it("rejects done with a rejecting disposition and blocked without a concrete blocker", () => {
    const rejected = board([packageBlock({
      status: "done",
      evidence: "verification:P-01",
      disposition: "rejected",
      nextAction: "Transfer repair to P-02.",
    })], { "Board status": "done" });
    const rejectedProgress = progress([
      boardCreated(),
      ...agentDoneEvents().map((block) => block.replace("disposition=accepted", "disposition=rejected")),
      ...boardDoneEvents(),
    ]);
    const blocked = board([packageBlock({ status: "blocked", blocker: "none", nextAction: "Resolve the named runtime failure." })], { "Board status": "blocked" });

    expect(diagnosticCodes(validateFormalTaskBoard(rejected, rejectedProgress))).toContain("DONE_DISPOSITION_INVALID");
    expect(diagnosticCodes(validateFormalTaskBoard(blocked, progress([boardCreated()])))).toContain("BLOCKER_REQUIRED");
  });

  it("rejects malformed, unknown, and orphan progress records", () => {
    const source = board([packageBlock()]);
    const malformedProgress = progress([
      event("not-rfc3339", "BOARD", "BOARD_CREATED", {}),
      "[2026-07-29T00:00:01Z] ORPHAN UNKNOWN_EVENT\nnot-a-key-value",
    ]);
    const parsed = parseFormalTaskProgress(malformedProgress);
    const validated = validateFormalTaskBoard(source, malformedProgress);
    expect(diagnosticCodes(parsed)).toEqual(expect.arrayContaining([
      "PROGRESS_TIMESTAMP_INVALID",
      "PROGRESS_EVENT_TYPE_UNKNOWN",
      "PROGRESS_FIELD_MALFORMED",
    ]));
    expect(diagnosticCodes(validated)).toContain("PROGRESS_SUBJECT_ORPHAN");
  });

  it("rejects impossible RFC 3339 dates and duplicate progress keys", () => {
    const progressSource = [
      "[2026-02-29T00:00:00Z] BOARD BOARD_CREATED",
      "evidence=artifact:board-created",
      "evidence=artifact:board-created",
      "",
    ].join("\n");
    expect(diagnosticCodes(parseFormalTaskProgress(progressSource))).toEqual(expect.arrayContaining([
      "PROGRESS_TIMESTAMP_INVALID",
      "PROGRESS_FIELD_DUPLICATE",
    ]));
  });

  it("keeps a done board invalid while one async join member lacks JOINED evidence", () => {
    const source = board([
      packageBlock({
        id: "A-01",
        status: "done",
        execution: "async",
        join: "J-01",
        evidence: "verification:A-01",
        disposition: "accepted",
        nextAction: "Completed after J-01 closed.",
      }),
      packageBlock({
        id: "A-02",
        status: "done",
        execution: "async",
        join: "J-01",
        evidence: "verification:A-02",
        disposition: "accepted",
        nextAction: "Wait for J-01 closure evidence.",
      }),
    ], { "Board status": "done" });
    const progressSource = progress([
      boardCreated(),
      ...agentDoneEvents("A-01", { execution: "async", join: "J-01", joined: true, startSecond: 1 }),
      ...agentDoneEvents("A-02", { execution: "async", join: "J-01", joined: false, startSecond: 10 }),
      ...boardDoneEvents(),
    ]);
    const result = validateFormalTaskBoard(source, progressSource);
    expect(diagnosticCodes(result)).toEqual(expect.arrayContaining(["ASYNC_JOIN_ANCHOR_MISSING", "BOARD_DONE_OPEN_JOIN"]));
  });

  it("rejects JOINED claims that have no actual prior INSPECTED event", () => {
    const source = board([packageBlock({
      id: "A-01",
      status: "returned",
      execution: "async",
      join: "J-01",
      evidence: "verification:A-01",
      disposition: "pending",
      nextAction: "ROSE must inspect the returned evidence.",
    })]);
    const progressSource = progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "A-01", "READY", { evidence: "artifact:ready/A-01" }),
      event("2026-07-29T00:00:01Z", "A-01", "DISPATCHED", {
        evidence: "artifact:dispatch/A-01",
      }),
      event("2026-07-29T00:00:02Z", "A-01", "RETURNED", { evidence: "artifact:result/A-01" }),
      event("2026-07-29T00:00:03Z", "A-01", "JOINED", {
        disposition: "pending",
        evidence: "verification:A-01",
      }),
    ]);
    expect(diagnosticCodes(validateFormalTaskBoard(source, progressSource))).toEqual(expect.arrayContaining([
      "PROGRESS_EVENT_DATA_INVALID",
      "ASYNC_JOIN_INSPECTION_MISSING",
    ]));
  });

  it("rejects a post-dispatch waiver and an unbounded partial acceptance", () => {
    const waived = board([packageBlock({
      id: "W-01",
      status: "done",
      owner: "agent:aili.test-engineer",
      dispatch: "waived",
      noDispatchReason: "The user supplied complete bounded evidence before direct work.",
      execution: "direct",
      join: "N/A",
      dispatchEvidence: "artifact:user-fixture-evidence",
      evidence: "verification:waived-direct",
      disposition: "accepted",
      nextAction: "Completed after direct verification.",
    })], { "Board status": "done" });
    const waivedProgress = progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "W-01", "READY", { evidence: "artifact:ready/W-01" }),
      event("2026-07-29T00:00:02Z", "W-01", "DISPATCHED", { evidence: "artifact:user-fixture-evidence" }),
      event("2026-07-29T00:00:02Z", "W-01", "WAIVED", {
        evidence: "artifact:user-fixture-evidence",
      }),
      event("2026-07-29T00:00:03Z", "W-01", "INSPECTED", { disposition: "accepted", evidence: "verification:waived-direct" }),
      event("2026-07-29T00:00:04Z", "W-01", "DONE", { verification: "verification:waived-direct" }),
      ...boardDoneEvents(),
    ]);
    expect(diagnosticCodes(validateFormalTaskBoard(waived, waivedProgress))).toContain("WAIVER_DISPATCH_CONFLICT");

    const partial = board([
      packageBlock({
        id: "P-01",
        status: "done",
        evidence: "verification:P-01",
        disposition: "partially-accepted",
        nextAction: "Keep the unspecified remainder open.",
      }),
      packageBlock({ id: "P-02", status: "pending" }),
    ]);
    const partialProgress = progress([
      boardCreated(),
      ...agentDoneEvents().map((block) => block.replace("disposition=accepted", "disposition=partially-accepted")),
    ]);
    expect(diagnosticCodes(validateFormalTaskBoard(partial, partialProgress))).toContain("PARTIAL_DISPOSITION_UNBOUNDED");
  });

  it("requires board-level inspection and fresh verification before Board status done", () => {
    const source = board([packageBlock({
      status: "done",
      evidence: "verification:P-01",
      disposition: "accepted",
      nextAction: "Completed after ROSE inspection.",
    })], { "Board status": "done" });
    const withoutBoardClosure = validateFormalTaskBoard(source, progress([boardCreated(), ...agentDoneEvents()]));
    expect(diagnosticCodes(withoutBoardClosure)).toEqual(expect.arrayContaining([
      "BOARD_DONE_INSPECTION_MISSING",
      "BOARD_DONE_EVENT_MISSING",
    ]));

    const nonterminal = board([packageBlock({ status: "ready" })], { "Board status": "done" });
    expect(diagnosticCodes(validateFormalTaskBoard(nonterminal, progress([boardCreated(), ...boardDoneEvents()]))))
      .toContain("BOARD_DONE_NONTERMINAL");

    const prematureClosure = validateFormalTaskBoard(source, progress([
      boardCreated(),
      ...boardDoneEvents(1),
      ...agentDoneEvents("P-01", { startSecond: 10 }),
    ]));
    expect(diagnosticCodes(prematureClosure)).toContain("BOARD_DONE_ORDER_INVALID");
  });

  it("rejects terminal progress anchors that conflict with current board state", () => {
    const source = board([packageBlock({ status: "ready" })]);
    const progressSource = progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "P-01", "DONE", { verification: "verification:stale-terminal" }),
    ]);
    expect(diagnosticCodes(validateFormalTaskBoard(source, progressSource))).toContain("TERMINAL_STATUS_MISMATCH");
  });

  it("accepts pre-recorded waived Agent direct work and ROSE direct work", () => {
    const source = board([
      packageBlock({
        id: "W-01",
        status: "done",
        owner: "agent:aili.test-engineer",
        dispatch: "waived",
        dispatchReason: "The exact specialist would normally own the focused evidence.",
        noDispatchReason: "The user supplied complete bounded evidence before direct work.",
        execution: "direct",
        join: "N/A",
        dispatchEvidence: "artifact:user-fixture-evidence",
        evidence: "verification:waived-direct",
        disposition: "accepted",
        nextAction: "Completed after pre-recorded waiver and verification.",
      }),
      packageBlock({
        id: "R-01",
        status: "done",
        owner: "ROSE",
        dispatch: "forbidden",
        dispatchReason: "Final bounded decision and integration are ROSE-owned.",
        execution: "direct",
        join: "N/A",
        evidence: "decision:R-01; verification:rose-direct",
        disposition: "accepted",
        nextAction: "Completed after direct verification.",
      }),
    ], { "Board status": "done" });
    const progressSource = progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "W-01", "READY", { evidence: "artifact:ready/W-01" }),
      event("2026-07-29T00:00:02Z", "W-01", "WAIVED", { evidence: "artifact:user-fixture-evidence" }),
      event("2026-07-29T00:00:03Z", "W-01", "INSPECTED", { disposition: "accepted", evidence: "verification:waived-direct" }),
      event("2026-07-29T00:00:04Z", "W-01", "DONE", { verification: "verification:waived-direct" }),
      event("2026-07-29T00:00:05Z", "R-01", "READY", { evidence: "artifact:ready/R-01" }),
      event("2026-07-29T00:00:06Z", "R-01", "INSPECTED", { disposition: "accepted", evidence: "decision:R-01; verification:rose-direct" }),
      event("2026-07-29T00:00:07Z", "R-01", "DONE", { verification: "verification:rose-direct" }),
      ...boardDoneEvents(8),
    ]);
    expect(validateFormalTaskBoard(source, progressSource)).toMatchObject({ classification: "v1", valid: true, diagnostics: [] });
  });

  it("accepts a canonical evidence package without inventing accepted task ownership", () => {
    const source = board([packageBlock({
      id: "E-01",
      phase: "DEFINE",
      packageKind: "evidence",
      sourceRefs: "decision:open-routing-decision, risk:dispatch-cost",
      acceptedTaskIds: "none",
      expectedEvidence: "verification:npm run typecheck",
      owner: "ROSE",
      dispatch: "forbidden",
      execution: "direct",
      join: "N/A",
      implementationAuthorization: "N/A",
    })]);
    const progressSource = progress([
      boardCreated(),
      event("2026-07-29T00:00:01Z", "E-01", "READY", { evidence: "artifact:ready/E-01" }),
    ]);
    expect(validateFormalTaskBoard(source, progressSource)).toMatchObject({ classification: "v1", valid: true, diagnostics: [] });
  });

  it("rejects invalid package kind/source/task ownership and open BUILD authorization", () => {
    const invalidKind = board([packageBlock({ packageKind: "implementation" })]);
    const invalidSource = board([packageBlock({ sourceRefs: "https://example.invalid/task" })]);
    const duplicateTask = board([
      packageBlock({ id: "P-01", acceptedTaskIds: "T-01", sourceRefs: "task:T-01" }),
      packageBlock({ id: "P-02", acceptedTaskIds: "T-01", sourceRefs: "task:T-01" }),
    ]);
    const openAuthorization = board([packageBlock({ implementationAuthorization: "absent" })]);
    const openPermission = board([packageBlock({ operationPermissions: "absent" })]);

    expect(diagnosticCodes(validateFormalTaskBoard(invalidKind, progress([boardCreated()])))).toContain("PACKAGE_KIND_INVALID");
    expect(diagnosticCodes(validateFormalTaskBoard(invalidSource, progress([boardCreated()])))).toContain("SOURCE_REFS_INVALID");
    expect(diagnosticCodes(validateFormalTaskBoard(duplicateTask, progress([boardCreated()])))).toContain("ACCEPTED_TASK_ID_DUPLICATE");
    expect(diagnosticCodes(validateFormalTaskBoard(openAuthorization, progress([boardCreated()])))).toContain("BUILD_IMPLEMENTATION_AUTHORIZATION_REQUIRED");
    expect(diagnosticCodes(validateFormalTaskBoard(openPermission, progress([boardCreated()])))).toContain("PACKAGE_GATE_OPEN");
  });

  it("rejects untyped package evidence and exact fields outside the canonical contract", () => {
    const untyped = board([packageBlock({ expectedEvidence: "a test someday", evidence: "https://example.invalid/result" })]);
    const unknownField = board([packageBlock()]).replace(
      "  - Result evidence: `pending`",
      "  - Adapter session: `private`\n  - Result evidence: `pending`",
    );
    expect(diagnosticCodes(validateFormalTaskBoard(untyped, progress([boardCreated()])))).toEqual(expect.arrayContaining([
      "EXPECTED_EVIDENCE_INVALID",
      "PACKAGE_EVIDENCE_SYNTAX_INVALID",
    ]));
    expect(diagnosticCodes(parseFormalTaskBoard(unknownField))).toContain("PACKAGE_FIELD_UNKNOWN");
  });

  it("rejects backward timestamps, package terminal reopen, and Board terminal reopen", () => {
    const source = board([packageBlock({ status: "cancelled" })], { "Board status": "cancelled" });
    const progressSource = progress([
      boardCreated("2026-07-29T00:00:02Z"),
      event("2026-07-29T00:00:01Z", "P-01", "CANCELLED", { next_action: "Create a new package ID for changed scope." }),
      event("2026-07-29T00:00:03Z", "P-01", "READY", { evidence: "artifact:invalid-reopen" }),
      event("2026-07-29T00:00:04Z", "BOARD", "CANCELLED", { next_action: "Keep the terminal Board closed." }),
      event("2026-07-29T00:00:05Z", "BOARD", "BLOCKED", { blocker: "A terminal Board cannot be blocked again." }),
    ]);
    expect(diagnosticCodes(validateFormalTaskBoard(source, progressSource))).toEqual(expect.arrayContaining([
      "PROGRESS_TIMESTAMP_ORDER_INVALID",
      "TERMINAL_EVENT_REOPEN",
      "BOARD_TERMINAL_EVENT_REOPEN",
    ]));
  });

  it("bounds oversized board and progress input deterministically", () => {
    const oversized = "x".repeat(1_000_001);
    expect(parseFormalTaskBoard(oversized)).toEqual(parseFormalTaskBoard(oversized));
    expect(parseFormalTaskBoard(oversized)).toMatchObject({ classification: "invalid" });
    expect(diagnosticCodes(parseFormalTaskProgress(oversized))).toContain("INPUT_TOO_LARGE");
  });

  it("keeps unmarked OpenSpec tasks legacy/unmanaged and byte-unchanged", () => {
    const legacy = "# Tasks\n\n- [x] 1. Existing OpenSpec checklist\n";
    const original = legacy;
    const parsed = parseFormalTaskBoard(legacy);
    const validated = validateFormalTaskBoard(legacy, "arbitrary unmanaged progress");
    expect(parsed).toEqual({ classification: "legacy/unmanaged", diagnostics: [] });
    expect(validated.classification).toBe("legacy/unmanaged");
    expect(validated.valid).toBe(false);
    expect(diagnosticCodes(validated)).toEqual(["LEGACY_UNMANAGED"]);
    expect(legacy).toBe(original);
  });
});
