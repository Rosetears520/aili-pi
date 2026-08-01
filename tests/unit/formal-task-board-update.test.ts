import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyFormalTaskBoardUpdate,
  planFormalTaskBoardUpdate,
  type FormalTaskBoardInspection,
  type FormalTaskBoardTransitionOperation,
  type FormalTaskBoardUpdateHooks,
  type FormalTaskBoardUpdateRequest,
} from "../../src/runtime/formal-task-board-update.js";
import type { FormalTaskPackageStatus } from "../../src/runtime/formal-task-board.js";
import type { FormalTaskBoardRootPaths } from "../../src/runtime/formal-task-board-root.js";

type PackageOptions = {
  id?: string;
  title?: string;
  status?: FormalTaskPackageStatus;
  owner?: string;
  dispatch?: string;
  noDispatchReason?: string;
  execution?: string;
  join?: string;
  dependsOn?: string;
  dispatchEvidence?: string;
  resultEvidence?: string;
  evidence?: string;
  disposition?: string;
  blocker?: string;
  nextAction?: string;
};

const scratchRoots: string[] = [];
const PACKAGE_STATUSES: FormalTaskPackageStatus[] = ["pending", "ready", "running", "returned", "done", "blocked", "cancelled"];

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

function packageBlock(options: PackageOptions = {}): string {
  const id = options.id ?? "P-01";
  const status = options.status ?? "pending";
  const owner = options.owner ?? "agent:aili.implementer";
  const direct = owner === "ROSE";
  const dispatch = options.dispatch ?? (direct ? "forbidden" : "required");
  const execution = options.execution ?? (direct ? "direct" : "sync");
  const join = options.join ?? (direct ? "N/A" : "immediate");
  const dispatchedState = status === "running" || status === "returned" || status === "done";
  const returnedState = status === "returned" || status === "done";
  const dispatchEvidence = options.dispatchEvidence ?? (dispatchedState && !direct && dispatch === "required" ? `artifact:dispatch-${id}` : dispatch === "waived" ? `decision:waiver-${id}` : "pending");
  const resultEvidence = options.resultEvidence ?? (returnedState && !direct && dispatch === "required" ? `artifact:result-${id}` : "pending");
  const evidence = options.evidence ?? (status === "returned" || status === "done" ? `artifact://${id}` : "pending");
  const disposition = options.disposition ?? (status === "done" ? "accepted" : "pending");
  const blocker = options.blocker ?? (status === "blocked" ? `runtime failure for ${id}` : "none");
  return [
    `- [${status === "done" ? "x" : " "}] ${id} — ${options.title ?? `Package ${id}`}`,
    "  - Phase: `BUILD`",
    "  - Package kind: `task-execution`",
    `  - Source refs: \`task:${id}\``,
    `  - Accepted task IDs: \`${id}\``,
    `  - Status: \`${status}\``,
    `  - Owner: \`${owner}\``,
    `  - Dispatch: \`${dispatch}\``,
    `  - Dispatch reason: \`${direct ? "The bounded decision is ROSE-owned." : "The bounded implementation belongs to the exact specialist."}\``,
    `  - No-dispatch reason: \`${options.noDispatchReason ?? "N/A"}\``,
    `  - Execution: \`${execution}\``,
    `  - Join: \`${join}\``,
    `  - Depends on: \`${options.dependsOn ?? "none"}\``,
    "  - Decision gate: `accepted`",
    "  - Final test-plan gate: `accepted`",
    "  - Implementation authorization: `granted`",
    "  - Operation permissions: `granted`",
    "  - Scope: `Implement only the bounded fixture scope.`",
    "  - Forbidden scope: `No dependency, Git, permission, or release changes.`",
    "  - Expected result: `One deterministic result.`",
    `  - Expected evidence: \`verification:expected-${id}\``,
    "  - Acceptance: `The exact fixture behavior is verified.`",
    `  - Dispatch evidence: \`${dispatchEvidence}\``,
    `  - Result evidence: \`${resultEvidence}\``,
    `  - Evidence: \`${evidence}\``,
    `  - ROSE disposition: \`${disposition}\``,
    `  - Blocker: \`${blocker}\``,
    `  - Next action: \`${options.nextAction ?? "Perform the next bounded package action."}\``,
  ].join("\n");
}

function board(packages: string[], changeId = "fixture-change"): string {
  return [
    "# Task Board",
    "",
    "Preserve this unrelated introduction byte-for-byte.",
    "",
    "- Protocol: `aili-task-board/v1`",
    "- Task kind: `formal`",
    `- Task identity: \`${changeId}\``,
    "- Goal: Validate deterministic formal updates.",
    "- Phase: `BUILD`",
    "- Board status: `active`",
    "- Accepted contract: `spec.md`",
    "- Accepted verification: `test-plan.md accepted`",
    "- Decision owner: `ROSE`",
    "- Verification owner: `ROSE`",
    "",
    "## Packages",
    "",
    packages.join("\n\n"),
    "",
    "Preserve this unrelated footer too.",
    "",
  ].join("\n");
}

function event(timestamp: string, subject: string, type: string, fields: ReadonlyArray<readonly [string, string]>): string {
  return [`[${timestamp}] ${subject} ${type}`, ...fields.map(([key, value]) => `${key}=${value}`)].join("\n");
}

function boardCreated(changeId = "fixture-change"): string {
  return event("2026-07-30T00:00:00Z", "BOARD", "BOARD_CREATED", [["evidence", `artifact:board-${changeId}`]]);
}

function ready(id: string, second: number): string {
  return event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "READY", [["evidence", `verification:gate-${id}`]]);
}

function dispatched(id: string, second: number): string {
  return event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "DISPATCHED", [["evidence", `artifact:dispatch-${id}`]]);
}

function returned(id: string, second: number): string {
  return event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "RETURNED", [["evidence", `artifact:result-${id}`]]);
}

function inspected(id: string, second: number, disposition = "accepted"): string {
  return event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "INSPECTED", [
    ["disposition", disposition],
    ["evidence", `artifact://${id}`],
  ]);
}

function joined(id: string, second: number, _joinId: string, disposition = "accepted"): string {
  return event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "JOINED", [
    ["disposition", disposition],
    ["evidence", `artifact://${id}`],
  ]);
}

function done(id: string, second: number): string {
  return event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "DONE", [["verification", `verification:vitest-${id}`]]);
}

function cancelled(id: string, second: number): string {
  return event(`2026-07-30T00:00:${String(second).padStart(2, "0")}Z`, id, "CANCELLED", [
    ["blocker", "ROSE cancelled the bounded fixture"],
    ["next_action", "Retain the terminal cancellation."],
  ]);
}

function progress(blocks: string[], changeId = "fixture-change"): string {
  return `${[boardCreated(changeId), ...blocks].join("\n\n")}\n`;
}

function eventsForPackage(options: PackageOptions, startSecond = 1): string[] {
  const id = options.id ?? "P-01";
  const status = options.status ?? "pending";
  const owner = options.owner ?? "agent:aili.implementer";
  const execution = options.execution ?? (owner === "ROSE" ? "direct" : "sync");
  const joinId = options.join ?? (execution === "async" ? "J-01" : execution === "direct" ? "N/A" : "immediate");
  if (status === "cancelled") return [cancelled(id, startSecond)];
  const result: string[] = [];
  if (status === "blocked") return [event(`2026-07-30T00:00:${String(startSecond).padStart(2, "0")}Z`, id, "BLOCKED", [["blocker", options.blocker ?? `runtime failure for ${id}`], ["next_action", options.nextAction ?? "Resolve the bounded blocker."]])];
  if (status === "ready" || status === "running" || status === "returned" || status === "done") result.push(ready(id, startSecond));
  if (owner !== "ROSE" && (status === "running" || status === "returned" || status === "done")) result.push(dispatched(id, startSecond + 1));
  if (owner !== "ROSE" && (status === "returned" || status === "done")) result.push(returned(id, startSecond + 2));
  if (status === "done") {
    const settlement = owner === "ROSE" ? startSecond + 1 : startSecond + 3;
    result.push(inspected(id, settlement));
    if (execution === "async") result.push(joined(id, settlement + 1, joinId));
    result.push(done(id, settlement + (execution === "async" ? 2 : 1)));
  }
  return result;
}

function fixture(options: PackageOptions = {}): { tasksSource: string; progressSource: string } {
  return {
    tasksSource: board([packageBlock(options)]),
    progressSource: progress(eventsForPackage(options)),
  };
}

function acceptedInspection(id = "P-01"): FormalTaskBoardInspection {
  return {
    disposition: { kind: "accepted" },
    evidence: `artifact://${id}; verification:focused-${id}`,
    acceptedClaims: "bounded implementation and focused verification",
    rejectedClaims: "none",
    unverified: "none",
  };
}

function rejectedInspection(id = "P-01", kind: "rejected" | "needs-follow-up" = "rejected"): FormalTaskBoardInspection {
  return {
    disposition: { kind, detail: "current evidence does not satisfy acceptance" },
    evidence: `artifact://${id}; verification:rejected-${id}`,
    acceptedClaims: "readable worker envelope only",
    rejectedClaims: "completion claim",
    unverified: "acceptance behavior",
  };
}

function request(
  sources: { tasksSource: string; progressSource: string },
  operation: FormalTaskBoardUpdateRequest["operation"],
  packageId = "P-01",
  timestamp = "2026-07-30T00:01:00Z",
): FormalTaskBoardUpdateRequest {
  return { actor: "ROSE", ...sources, packageId, timestamp, operation };
}

function operationFor(from: FormalTaskPackageStatus, to: FormalTaskPackageStatus): FormalTaskBoardTransitionOperation {
  const base = { kind: "transition" as const, to, nextAction: `Continue after ${from} to ${to}.` };
  if (to === "ready") return { ...base, gateEvidence: "verification:current-and-accepted", blockerClearance: from === "blocked" ? "verification:clearance-resolved" : undefined };
  if (to === "running") return { ...base, dispatchEvidence: "artifact:dispatch-P-01" };
  if (to === "returned") return { ...base, result: "completed", resultEvidence: "artifact:result-P-01", evidenceReadable: true, evidence: "artifact://P-01" };
  if (to === "done") return { ...base, inspection: acceptedInspection(), verification: "verification:vitest-P-01" };
  if (to === "blocked") return {
    ...base,
    failure: from === "running" ? "failed" : undefined,
    blocker: "runtime failed deterministically",
    inspection: from === "returned" ? rejectedInspection() : undefined,
  };
  if (to === "pending") return { ...base, blockerClearance: "verification:clearance-resolved" };
  if (to === "cancelled") return { ...base, cancellationReason: "ROSE removed this package from accepted scope" };
  return base;
}

function expectedAgentEdge(from: FormalTaskPackageStatus, to: FormalTaskPackageStatus): boolean {
  const edges = new Set([
    "pending>ready",
    "ready>running",
    "running>returned",
    "running>blocked",
    "returned>done",
    "returned>blocked",
    "blocked>pending",
    "blocked>ready",
  ]);
  return (from !== "done" && from !== "cancelled" && to === "cancelled") || edges.has(`${from}>${to}`);
}

async function makeRepository(sources: { tasksSource: string; progressSource: string }, changeId = "fixture-change"): Promise<FormalTaskBoardRootPaths> {
  const scratch = await mkdtemp(join(tmpdir(), "aili-formal-update-"));
  scratchRoots.push(scratch);
  const repositoryRoot = resolve(scratch, "repository");
  const rootPath = resolve(repositoryRoot, "openspec", "changes", changeId);
  await mkdir(rootPath, { recursive: true });
  const paths = {
    repositoryRoot,
    rootPath,
    tasksPath: resolve(rootPath, "formal-task-board.md"),
    progressPath: resolve(rootPath, "progress.txt"),
  };
  await writeFile(paths.tasksPath, sources.tasksSource);
  await writeFile(paths.progressPath, sources.progressSource);
  return paths;
}

function codes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map((entry) => entry.code);
}

describe("formal task-board deterministic update planner", () => {
  it("implements the complete Agent state table and rejects every other edge including same-state and terminal reopen", () => {
    for (const from of PACKAGE_STATUSES) {
      const sources = fixture({ status: from });
      for (const to of PACKAGE_STATUSES) {
        const result = planFormalTaskBoardUpdate(request(sources, operationFor(from, to)));
        expect(result.status, `${from} -> ${to}`).toBe(expectedAgentEdge(from, to) ? "planned" : "blocked");
        if (result.status === "planned") {
          expect(result.fromStatus).toBe(from);
          expect(result.toStatus).toBe(to);
        }
      }
    }
  });

  it("requires done dependencies plus explicit current gate evidence before pending becomes ready", () => {
    const doneDependency: PackageOptions = { id: "D-01", status: "done" };
    const pending: PackageOptions = { id: "P-01", status: "pending", dependsOn: "D-01" };
    const readySources = {
      tasksSource: board([packageBlock(doneDependency), packageBlock(pending)]),
      progressSource: progress(eventsForPackage(doneDependency)),
    };
    const planned = planFormalTaskBoardUpdate(request(readySources, {
      kind: "transition",
      to: "ready",
      gateEvidence: "verification:accepted-current-operation",
      nextAction: "Dispatch the now-ready package.",
    }));
    expect(planned.status).toBe("planned");
    if (planned.status === "planned") {
      expect(planned.tasksSource).toContain("  - Status: `ready`");
      expect(planned.appendedProgress).toContain("evidence=verification:accepted-current-operation");
    }

    const unfinishedDependency: PackageOptions = { id: "D-01", status: "ready" };
    const unfinishedSources = {
      tasksSource: board([packageBlock(unfinishedDependency), packageBlock(pending)]),
      progressSource: progress(eventsForPackage(unfinishedDependency)),
    };
    expect(codes(planFormalTaskBoardUpdate(request(unfinishedSources, {
      kind: "transition",
      to: "ready",
      gateEvidence: "verification:accepted-current-operation",
    })))).toContain("DEPENDENCY_NOT_DONE");
    expect(codes(planFormalTaskBoardUpdate(request(readySources, { kind: "transition", to: "ready" })))).toContain("READINESS_EVIDENCE_REQUIRED");
  });

  it("records portable dispatch and result evidence without writing Runtime references", () => {
    const ready = fixture({ status: "ready" });
    const running = planFormalTaskBoardUpdate(request(ready, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
      nextAction: "Wait synchronously for the exact result.",
    }));
    expect(running.status).toBe("planned");
    if (running.status !== "planned") return;
    expect(running.eventTypes).toEqual(["DISPATCHED"]);
    expect(running.tasksSource).toContain("  - Dispatch evidence: `artifact:dispatch-P-01`");
    expect(running.tasksSource).not.toContain("  - Runtime:");

    const returnedResult = planFormalTaskBoardUpdate(request(running, {
      kind: "transition",
      to: "returned",
      result: "partial",
      resultEvidence: "artifact:result-P-01",
      evidenceReadable: true,
      evidence: "artifact://P-01; artifact:partial-readable",
      nextAction: "ROSE inspects accepted and residual claims.",
    }, "P-01", "2026-07-30T00:02:00Z"));
    expect(returnedResult.status).toBe("planned");
    if (returnedResult.status === "planned") {
      expect(returnedResult.eventTypes).toEqual(["RETURNED"]);
      expect(returnedResult.tasksSource).toContain("- [ ] P-01 —");
      expect(returnedResult.tasksSource).toContain("  - Status: `returned`");
      expect(returnedResult.tasksSource).not.toContain("- [x] P-01 —");
    }
  });

  it("blocks failed, interrupted, unexecuted, missing, stale, and unreadable results instead of returning them", () => {
    for (const failure of ["blocked", "failed", "interrupted", "unexecuted", "missing", "stale", "unreadable"] as const) {
      const running = fixture({ status: "running" });
      const result = planFormalTaskBoardUpdate(request(running, {
        kind: "transition",
        to: "blocked",
        failure,
        blocker: `${failure} canonical runtime evidence`,
        nextAction: "ROSE resolves the explicit blocker.",
      }));
      expect(result.status, failure).toBe("planned");
      if (result.status === "planned") {
        expect(result.toStatus).toBe("blocked");
        expect(result.eventTypes).toEqual(["BLOCKED"]);
      }
    }
    const unreadableReturn = planFormalTaskBoardUpdate(request(fixture({ status: "running" }), {
      kind: "transition",
      to: "returned",
      result: "completed",
      evidenceReadable: false,
      evidence: "artifact://unreadable",
    }));
    expect(codes(unreadableReturn)).toContain("READABLE_EVIDENCE_REQUIRED");
  });

  it("completes returned and direct work only after accepted inspection and fresh verification", () => {
    const returnedSource = fixture({ status: "returned" });
    const returnedDone = planFormalTaskBoardUpdate(request(returnedSource, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(),
      verification: "verification:fresh-returned-check",
      nextAction: "Package completed after ROSE inspection.",
    }));
    expect(returnedDone.status).toBe("planned");
    if (returnedDone.status === "planned") {
      expect(returnedDone.eventTypes).toEqual(["INSPECTED", "DONE"]);
      expect(returnedDone.tasksSource).toContain("- [x] P-01 —");
    }

    const direct = fixture({ status: "running", owner: "ROSE" });
    const directDone = planFormalTaskBoardUpdate(request(direct, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(),
      verification: "verification:fresh-direct-check",
    }));
    expect(directDone.status).toBe("planned");
    if (directDone.status === "planned") expect(directDone.eventTypes).toEqual(["INSPECTED", "DONE"]);

    for (const disposition of ["rejected", "needs-follow-up"] as const) {
      const rejected = planFormalTaskBoardUpdate(request(returnedSource, {
        kind: "transition",
        to: "done",
        inspection: rejectedInspection("P-01", disposition),
        verification: "verification:must-not-credit",
      }));
      expect(codes(rejected)).toContain("DISPOSITION_INVALID");
    }
    expect(codes(planFormalTaskBoardUpdate(request(returnedSource, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(),
    })))).toContain("VERIFICATION_REQUIRED");
  });

  it("runs the full ROSE-owned and valid-waived direct paths without fabricating an Agent return", () => {
    const roseReady = fixture({ status: "ready", owner: "ROSE" });
    const roseRunning = planFormalTaskBoardUpdate(request(roseReady, {
      kind: "transition",
      to: "running",
      nextAction: "ROSE performs the direct bounded work.",
    }));
    expect(roseRunning.status).toBe("planned");
    if (roseRunning.status !== "planned") return;
    expect(roseRunning.eventTypes).toEqual(["READY"]);
    expect(roseRunning.tasksSource).not.toContain("  - Runtime:");
    const roseDone = planFormalTaskBoardUpdate(request(roseRunning, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(),
      verification: "verification:rose-direct-fresh",
    }, "P-01", "2026-07-30T00:02:00Z"));
    expect(roseDone.status).toBe("planned");
    if (roseDone.status === "planned") expect(roseDone.eventTypes).toEqual(["INSPECTED", "DONE"]);

    const waived = planFormalTaskBoardUpdate(request(fixture({ status: "ready" }), {
      kind: "prepare-waiver",
      waiverClass: "selector-unavailable-equivalent-capability",
      reason: "The selector is currently unavailable and ROSE has equivalent lawful tools and evidence capability.",
      evidence: "artifact:selector-unavailable; verification:rose-equivalent",
      roseDecision: "ROSE",
    }));
    expect(waived.status).toBe("planned");
    if (waived.status !== "planned") return;
    const waivedRunning = planFormalTaskBoardUpdate(request(waived, {
      kind: "transition",
      to: "running",
    }, "P-01", "2026-07-30T00:02:00Z"));
    expect(waivedRunning.status).toBe("planned");
    if (waivedRunning.status !== "planned") return;
    const waivedDone = planFormalTaskBoardUpdate(request(waivedRunning, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(),
      verification: "verification:waived-direct-fresh",
    }, "P-01", "2026-07-30T00:03:00Z"));
    expect(waivedDone.status).toBe("planned");
    if (waivedDone.status === "planned") expect(waivedDone.eventTypes).toEqual(["INSPECTED", "DONE"]);
  });

  it("accepts partial completion only with a named residual package or explicit bounded limitation", () => {
    const returnedPackage: PackageOptions = { id: "P-01", status: "returned" };
    const residualPackage: PackageOptions = { id: "R-02", status: "pending" };
    const sources = {
      tasksSource: board([packageBlock(returnedPackage), packageBlock(residualPackage)]),
      progressSource: progress(eventsForPackage(returnedPackage)),
    };
    const partialInspection: FormalTaskBoardInspection = {
      ...acceptedInspection(),
      disposition: { kind: "partially-accepted", detail: "accepted claims only; residual transferred" },
      rejectedClaims: "one residual fixture",
      unverified: "one bounded residual",
      residualTransfer: "R-02",
    };
    const transferred = planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "done",
      inspection: partialInspection,
      verification: "verification:partial-transfer",
      nextAction: "Transfer the residual fixture to R-02",
    }));
    expect(transferred.status).toBe("planned");
    if (transferred.status === "planned") expect(transferred.appendedProgress).not.toContain("residual_transfer=");

    const limited = planFormalTaskBoardUpdate(request(fixture({ status: "returned" }), {
      kind: "transition",
      to: "done",
      inspection: {
        ...partialInspection,
        disposition: { kind: "partially-accepted", detail: "accepted bounded limitation: offline-only fixture" },
        evidence: "artifact://P-01; risk:offline-only-limitation",
        residualTransfer: undefined,
        acceptedLimitation: "offline-only behavior is explicitly accepted",
      },
      verification: "verification:partial-limitation",
    }));
    expect(limited.status).toBe("planned");

    const unbounded = planFormalTaskBoardUpdate(request(fixture({ status: "returned" }), {
      kind: "transition",
      to: "done",
      inspection: { ...partialInspection, residualTransfer: undefined, acceptedLimitation: undefined },
      verification: "verification:must-not-pass",
    }));
    expect(codes(unbounded)).toContain("PARTIAL_RESIDUAL_REQUIRED");
  });

  it("requires explicit blocker clearance and emits UNBLOCKED before READY", () => {
    const blockedSource = fixture({ status: "blocked" });
    expect(codes(planFormalTaskBoardUpdate(request(blockedSource, {
      kind: "transition",
      to: "pending",
    })))).toContain("BLOCKER_CLEARANCE_REQUIRED");

    const pending = planFormalTaskBoardUpdate(request(blockedSource, {
      kind: "transition",
      to: "pending",
      blockerClearance: "verification:runtime-restored",
      nextAction: "Re-evaluate current gates.",
    }));
    expect(pending.status).toBe("planned");
    if (pending.status === "planned") {
      expect(pending.eventTypes).toEqual(["UNBLOCKED"]);
      expect(pending.tasksSource).toContain("  - Evidence: `pending`");
    }

    const ready = planFormalTaskBoardUpdate(request(blockedSource, {
      kind: "transition",
      to: "ready",
      blockerClearance: "verification:runtime-restored",
      gateEvidence: "verification:dependencies-and-operation-current",
      nextAction: "Dispatch after clearance.",
    }));
    expect(ready.status).toBe("planned");
    if (ready.status === "planned") {
      expect(ready.eventTypes).toEqual(["UNBLOCKED", "READY"]);
      expect(ready.tasksSource).toContain("  - Evidence: `pending`");
    }

    const failedRun = planFormalTaskBoardUpdate(request(fixture({ status: "running" }), {
      kind: "transition",
      to: "blocked",
      failure: "failed",
      blocker: "the first bounded attempt failed",
      nextAction: "Clear the blocker before retrying.",
    }));
    expect(failedRun.status).toBe("planned");
    if (failedRun.status !== "planned") return;
    const retryPending = planFormalTaskBoardUpdate(request(failedRun, {
      kind: "transition",
      to: "pending",
      blockerClearance: "verification:first-attempt-cleared",
    }, "P-01", "2026-07-30T00:02:00Z"));
    expect(retryPending.status).toBe("planned");
    if (retryPending.status !== "planned") return;
    const retryReady = planFormalTaskBoardUpdate(request(retryPending, {
      kind: "transition",
      to: "ready",
      gateEvidence: "verification:retry-gates-current",
    }, "P-01", "2026-07-30T00:03:00Z"));
    expect(retryReady.status).toBe("planned");
    if (retryReady.status !== "planned") return;
    const retryRunning = planFormalTaskBoardUpdate(request(retryReady, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01-retry",
    }, "P-01", "2026-07-30T00:04:00Z"));
    expect(retryRunning.status).toBe("planned");
  });

  it("pre-records only a closed-class Agent waiver before work and rejects invalid or post-hoc waiver", () => {
    const ready = fixture({ status: "ready" });
    const waived = planFormalTaskBoardUpdate(request(ready, {
      kind: "prepare-waiver",
      waiverClass: "complete-user-provided-evidence",
      reason: "The user supplied complete bounded evidence and dispatch adds no material evidence.",
      evidence: "artifact:user-complete-bounded-fixture",
      roseDecision: "ROSE",
      nextAction: "ROSE may now start the exact direct scope.",
    }));
    expect(waived.status).toBe("planned");
    if (waived.status !== "planned") return;
    expect(waived.eventTypes).toEqual(["WAIVED"]);
    expect(waived.tasksSource).toContain("  - Dispatch: `waived`");
    expect(waived.tasksSource).toContain("  - Execution: `direct`");
    expect(waived.tasksSource).toContain("  - Join: `N/A`");
    const started = planFormalTaskBoardUpdate(request(waived, {
      kind: "transition",
      to: "running",
      nextAction: "Perform the bounded direct work.",
    }, "P-01", "2026-07-30T00:02:00Z"));
    expect(started.status).toBe("planned");

    const invalidClass = planFormalTaskBoardUpdate(request(ready, {
      kind: "prepare-waiver",
      waiverClass: "convenience" as never,
      reason: "Generic convenience is not an accepted class.",
      evidence: "claim://unsupported",
      roseDecision: "ROSE",
    }));
    expect(codes(invalidClass)).toContain("WAIVER_CLASS_INVALID");
    const postHoc = planFormalTaskBoardUpdate(request(fixture({ status: "running" }), {
      kind: "prepare-waiver",
      waiverClass: "complete-user-provided-evidence",
      reason: "Too late after dispatch.",
      evidence: "user://late",
      roseDecision: "ROSE",
    }));
    expect(codes(postHoc)).toContain("WAIVER_STATE_INVALID");
  });

  it("closes sync normally, appends async INSPECTED/JOINED/DONE, and treats join members order-independently", () => {
    const asyncOne: PackageOptions = { id: "A-01", status: "returned", execution: "async", join: "J-01" };
    const asyncTwo: PackageOptions = { id: "A-02", status: "returned", execution: "async", join: "J-01" };
    const initial = {
      tasksSource: board([packageBlock(asyncOne), packageBlock(asyncTwo)]),
      progressSource: progress([...eventsForPackage(asyncOne, 1), ...eventsForPackage(asyncTwo, 3)]),
    };
    const complete = (sources: { tasksSource: string; progressSource: string }, id: string, minute: number) => planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(id),
      verification: `verification:${id}-fresh`,
      nextAction: `Close ${id} after join evidence.`,
    }, id, `2026-07-30T00:0${minute}:00Z`));

    const secondFirst = complete(initial, "A-02", 1);
    expect(secondFirst.status).toBe("planned");
    if (secondFirst.status !== "planned") return;
    expect(secondFirst.eventTypes).toEqual(["INSPECTED", "JOINED", "DONE"]);
    const firstSecond = complete(secondFirst, "A-01", 2);
    expect(firstSecond.status).toBe("planned");

    const firstFirst = complete(initial, "A-01", 1);
    expect(firstFirst.status).toBe("planned");
    if (firstFirst.status !== "planned") return;
    expect(complete(firstFirst, "A-02", 2).status).toBe("planned");

    const syncDone = planFormalTaskBoardUpdate(request(fixture({ status: "returned" }), {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(),
      verification: "verification:sync-fresh",
    }));
    expect(syncDone.status).toBe("planned");
    if (syncDone.status === "planned") expect(syncDone.eventTypes).toEqual(["INSPECTED", "DONE"]);
  });

  it("keeps dependent readiness blocked until every caller-declared stable async join member is closed", () => {
    const doneMember: PackageOptions = { id: "A-01", status: "done", execution: "async", join: "J-01" };
    const returnedMember: PackageOptions = { id: "A-02", status: "returned", execution: "async", join: "J-01" };
    const dependent: PackageOptions = { id: "P-01", status: "pending" };
    const sources = {
      tasksSource: board([packageBlock(doneMember), packageBlock(returnedMember), packageBlock(dependent)]),
      progressSource: progress([...eventsForPackage(doneMember, 1), ...eventsForPackage(returnedMember, 10)]),
    };
    const blockedReady = planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "ready",
      gateEvidence: "verification:waits-for-J-01",
      requiredJoins: ["J-01"],
    }));
    expect(codes(blockedReady)).toContain("REQUIRED_JOIN_OPEN");

    const memberDone = planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection("A-02"),
      verification: "verification:A-02-fresh",
    }, "A-02"));
    expect(memberDone.status).toBe("planned");
    if (memberDone.status !== "planned") return;
    const nowReady = planFormalTaskBoardUpdate(request(memberDone, {
      kind: "transition",
      to: "ready",
      gateEvidence: "verification:J-01-now-closed",
      requiredJoins: ["J-01"],
    }, "P-01", "2026-07-30T00:02:00Z"));
    expect(nowReady.status).toBe("planned");
  });

  it("settles an async failure only with explicit blocker inspection and JOINED evidence", () => {
    const running = fixture({ status: "running", execution: "async", join: "J-FAIL" });
    const withoutInspection = planFormalTaskBoardUpdate(request(running, {
      kind: "transition",
      to: "blocked",
      failure: "interrupted",
      blocker: "the async turn was interrupted",
      nextAction: "ROSE decides a lawful recovery.",
    }));
    expect(codes(withoutInspection)).toContain("INSPECTION_REQUIRED");

    const settled = planFormalTaskBoardUpdate(request(running, {
      kind: "transition",
      to: "blocked",
      failure: "interrupted",
      blocker: "the async turn was interrupted",
      inspection: rejectedInspection("P-01", "needs-follow-up"),
      nextAction: "ROSE decides a lawful recovery.",
    }));
    expect(settled.status).toBe("planned");
    if (settled.status === "planned") expect(settled.eventTypes).toEqual(["BLOCKED", "INSPECTED", "JOINED"]);
  });

  it("preserves the exact progress prefix and emits deterministic RFC3339 package fields in order", () => {
    const sources = fixture({ status: "ready" });
    const oldHash = createHash("sha256").update(sources.progressSource).digest("hex");
    const planned = planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
      nextAction: "Wait for the bounded sync result.",
    }, "P-01", "2026-07-30T01:02:03.456Z"));
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.progressSource.slice(0, sources.progressSource.length)).toBe(sources.progressSource);
    expect(createHash("sha256").update(planned.progressSource.slice(0, sources.progressSource.length)).digest("hex")).toBe(oldHash);
    expect(planned.appendedProgress).toBe([
      "",
      "[2026-07-30T01:02:03.456Z] P-01 DISPATCHED",
      "evidence=artifact:dispatch-P-01",
      "",
    ].join("\n"));
  });

  it("returns bounded diagnostics for malformed requests, invalid old pairs, backward timestamps, and unbounded values", () => {
    expect(codes(planFormalTaskBoardUpdate(null as never))).toContain("REQUEST_INVALID");
    const sources = fixture({ status: "pending" });
    const invalidOld = { ...sources, tasksSource: sources.tasksSource.replace("agent:aili.implementer", "agent:general") };
    expect(codes(planFormalTaskBoardUpdate(request(invalidOld, {
      kind: "transition",
      to: "ready",
      gateEvidence: "verification:current",
    })))).toContain("OLD_PAIR_INVALID");
    expect(codes(planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "ready",
      gateEvidence: "verification:current",
    }, "P-01", "2026-07-29T23:59:59Z")))).toContain("TIMESTAMP_ORDER_INVALID");
    expect(codes(planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "ready",
      gateEvidence: "raw\ntranscript",
    })))).toContain("READINESS_EVIDENCE_REQUIRED");
  });

  it("changes only the selected package fields, checkbox, and appended progress", () => {
    const first: PackageOptions = { id: "P-01", status: "returned" };
    const second: PackageOptions = { id: "P-02", status: "pending" };
    const sources = {
      tasksSource: board([packageBlock(first), packageBlock(second)]),
      progressSource: progress(eventsForPackage(first)),
    };
    const secondBlock = packageBlock(second);
    const planned = planFormalTaskBoardUpdate(request(sources, {
      kind: "transition",
      to: "done",
      inspection: acceptedInspection(),
      verification: "verification:selected-only",
      nextAction: "Selected package is complete.",
    }));
    expect(planned.status).toBe("planned");
    if (planned.status === "planned") {
      expect(planned.tasksSource).toContain("Preserve this unrelated introduction byte-for-byte.");
      expect(planned.tasksSource).toContain("Preserve this unrelated footer too.");
      expect(planned.tasksSource).toContain(secondBlock);
    }
  });
});

describe("formal task-board guarded filesystem apply", () => {
  it("applies one candidate through exact root-owned paths and preserves unrelated files", async () => {
    const sources = fixture({ status: "ready" });
    const paths = await makeRepository(sources);
    const unrelatedPath = resolve(paths.rootPath, "unrelated.md");
    const unrelated = "unrelated bytes stay unchanged\n";
    await writeFile(unrelatedPath, unrelated);
    const update = request(sources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
      nextAction: "Wait for the exact sync return.",
    });
    const result = await applyFormalTaskBoardUpdate(paths, update);
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(await readFile(paths.tasksPath, "utf8")).toBe(result.tasksSource);
    expect(await readFile(paths.progressPath, "utf8")).toBe(result.progressSource);
    expect(result.progressSource.startsWith(sources.progressSource)).toBe(true);
    expect(await readFile(unrelatedPath, "utf8")).toBe(unrelated);
    expect((await readdir(paths.rootPath)).filter((name) => name.startsWith(".aili-formal-update-"))).toEqual([]);
  });

  it.each([
    ["tasks candidate write", { beforeWriteCandidate: (target: string) => { if (target === "tasks") throw new Error("injected"); } }],
    ["progress append", { beforeWriteCandidate: (target: string) => { if (target === "progress") throw new Error("injected"); } }],
    ["tasks fsync", { beforeFileSync: (target: string) => { if (target === "tasks") throw new Error("injected"); } }],
    ["progress fsync", { beforeFileSync: (target: string) => { if (target === "progress") throw new Error("injected"); } }],
    ["directory fsync", { beforeFileSync: (target: string) => { if (target === "directory") throw new Error("injected"); } }],
    ["tasks rename", { beforeRename: (target: string) => { if (target === "tasks") throw new Error("injected"); } }],
    ["progress rename", { beforeRename: (target: string) => { if (target === "progress") throw new Error("injected"); } }],
    ["after tasks replacement", { afterRename: (target: string) => { if (target === "tasks") throw new Error("injected"); } }],
    ["after progress replacement", { afterRename: (target: string) => { if (target === "progress") throw new Error("injected"); } }],
    ["final validation", { beforeFinalValidation: () => { throw new Error("injected"); } }],
  ] as Array<[string, FormalTaskBoardUpdateHooks]>)
    ("rolls back exact pre-call bytes after injected %s failure", async (_name, hooks) => {
      const sources = fixture({ status: "ready" });
      const paths = await makeRepository(sources);
      const result = await applyFormalTaskBoardUpdate(paths, request(sources, {
        kind: "transition",
        to: "running",
        dispatchEvidence: "artifact:dispatch-P-01",
      }), hooks);
      expect(result.status).toBe("blocked");
      expect(await readFile(paths.tasksPath, "utf8")).toBe(sources.tasksSource);
      expect(await readFile(paths.progressPath, "utf8")).toBe(sources.progressSource);
      expect((await readdir(paths.rootPath)).filter((name) => name.startsWith(".aili-formal-update-"))).toEqual([]);
      expect(codes(result)).not.toContain("ROLLBACK_FAILED");
    });

  it("rejects an old-pair source mismatch and a pre-replacement race without overwriting current bytes", async () => {
    const sources = fixture({ status: "ready" });
    const paths = await makeRepository(sources);
    const staleRequest = request({ ...sources, progressSource: `${sources.progressSource}\n` }, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
    });
    const stale = await applyFormalTaskBoardUpdate(paths, staleRequest);
    expect(stale.status).toBe("blocked");
    expect(await readFile(paths.tasksPath, "utf8")).toBe(sources.tasksSource);
    expect(await readFile(paths.progressPath, "utf8")).toBe(sources.progressSource);

    const raceBytes = `${sources.progressSource}\n[2026-07-30T00:00:30Z] P-01 READY\ngate=external-race\n`;
    const raced = await applyFormalTaskBoardUpdate(paths, request(sources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
    }), {
      beforeRename: async (target) => {
        if (target === "tasks") await writeFile(paths.progressPath, raceBytes);
      },
    });
    expect(raced.status).toBe("blocked");
    expect(codes(raced)).toContain("SOURCE_RACE");
    expect(await readFile(paths.tasksPath, "utf8")).toBe(sources.tasksSource);
    expect(await readFile(paths.progressPath, "utf8")).toBe(raceBytes);
  });

  it("does not roll back over an in-place concurrent change after the first atomic replacement", async () => {
    const sources = fixture({ status: "ready" });
    const paths = await makeRepository(sources);
    const concurrentTasks = sources.tasksSource.replace("Package P-01", "Concurrent owner edit");
    const result = await applyFormalTaskBoardUpdate(paths, request(sources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
    }), {
      afterRename: async (target) => {
        if (target === "tasks") await writeFile(paths.tasksPath, concurrentTasks);
      },
    });
    expect(result.status).toBe("blocked");
    expect(codes(result)).toEqual(expect.arrayContaining(["SOURCE_RACE", "ROLLBACK_FAILED"]));
    expect(await readFile(paths.tasksPath, "utf8")).toBe(concurrentTasks);
    expect(await readFile(paths.progressPath, "utf8")).toBe(sources.progressSource);
  });

  it("serializes updater calls with one exclusive exact-root lock", async () => {
    const sources = fixture({ status: "ready" });
    const paths = await makeRepository(sources);
    let releaseFirst!: () => void;
    const firstMayContinue = new Promise<void>((resolvePromise) => {
      releaseFirst = resolvePromise;
    });
    let firstHasLock!: () => void;
    const lockObserved = new Promise<void>((resolvePromise) => {
      firstHasLock = resolvePromise;
    });
    const update = request(sources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
    });
    const first = applyFormalTaskBoardUpdate(paths, update, {
      beforeWriteCandidate: async (target) => {
        if (target === "tasks") {
          firstHasLock();
          await firstMayContinue;
        }
      },
    });
    await lockObserved;
    const second = await applyFormalTaskBoardUpdate(paths, update);
    expect(codes(second)).toContain("UPDATE_LOCKED");
    releaseFirst();
    expect((await first).status).toBe("applied");
    expect((await readdir(paths.rootPath)).filter((name) => name.startsWith(".aili-formal-update"))).toEqual([]);
  });

  it("rejects invalid current pairs, symlinks, and caller-supplied unowned paths with zero updater mutation", async () => {
    const sources = fixture({ status: "ready" });
    const invalidSources = { ...sources, tasksSource: sources.tasksSource.replace("agent:aili.implementer", "agent:general") };
    const invalidPaths = await makeRepository(invalidSources);
    const invalid = await applyFormalTaskBoardUpdate(invalidPaths, request(invalidSources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
    }));
    expect(codes(invalid)).toContain("OLD_PAIR_INVALID");
    expect(await readFile(invalidPaths.tasksPath, "utf8")).toBe(invalidSources.tasksSource);
    expect(await readFile(invalidPaths.progressPath, "utf8")).toBe(invalidSources.progressSource);

    const safePaths = await makeRepository(sources);
    const outside = resolve(safePaths.rootPath, "outside.md");
    const outsideBytes = "outside must not be touched\n";
    await writeFile(outside, outsideBytes);
    const unowned = await applyFormalTaskBoardUpdate({ ...safePaths, tasksPath: outside }, request(sources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
    }));
    expect(codes(unowned)).toContain("PATHS_INVALID");
    expect(await readFile(outside, "utf8")).toBe(outsideBytes);
    expect(await readFile(safePaths.tasksPath, "utf8")).toBe(sources.tasksSource);

    const symlinkPaths = await makeRepository(sources);
    const realTasks = resolve(symlinkPaths.rootPath, "real-tasks.md");
    await writeFile(realTasks, sources.tasksSource);
    await rm(symlinkPaths.tasksPath);
    await symlink(realTasks, symlinkPaths.tasksPath);
    const symlinkResult = await applyFormalTaskBoardUpdate(symlinkPaths, request(sources, {
      kind: "transition",
      to: "running",
      dispatchEvidence: "artifact:dispatch-P-01",
    }));
    expect(symlinkResult.status).toBe("blocked");
    expect(await readFile(realTasks, "utf8")).toBe(sources.tasksSource);
    expect(await readFile(symlinkPaths.progressPath, "utf8")).toBe(sources.progressSource);
  });
});
