import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyFormalTaskBoardBootstrapReconciliation,
  applyFormalTaskBoardObservedAfterReturn,
  planFormalTaskBoardBootstrapReconciliation,
  planFormalTaskBoardObservedAfterReturn,
  type FormalTaskBoardObservedAfterReturnRequest,
} from "../../src/runtime/formal-task-board-bootstrap.js";
import { validateFormalTaskBoard } from "../../src/runtime/formal-task-board.js";
import type { FormalTaskBoardRootPaths } from "../../src/runtime/formal-task-board-root.js";

const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

function packageBlock(status: "pending" | "ready" | "running" | "returned" | "done" = "ready"): string {
  const advanced = status === "running" || status === "returned" || status === "done";
  const returned = status === "returned" || status === "done";
  return [
    `- [${status === "done" ? "x" : " "}] P-01 — Portable bootstrap package`,
    "  - Phase: `BUILD`",
    "  - Package kind: `task-execution`",
    "  - Source refs: `task:P-01`",
    "  - Accepted task IDs: `P-01`",
    `  - Status: \`${status}\``,
    "  - Owner: `agent:aili.implementer`",
    "  - Dispatch: `required`",
    "  - Dispatch reason: `The exact implementation belongs to the canonical specialist.`",
    "  - No-dispatch reason: `N/A`",
    "  - Execution: `sync`",
    "  - Join: `immediate`",
    "  - Depends on: `none`",
    "  - Decision gate: `accepted`",
    "  - Final test-plan gate: `accepted`",
    "  - Implementation authorization: `granted`",
    "  - Operation permissions: `granted`",
    "  - Scope: `Exercise only the bounded portable bootstrap path.`",
    "  - Forbidden scope: `No Runtime references, migration, restart replay, dependency, Git, or release work.`",
    "  - Expected result: `One canonical update sequence.`",
    "  - Expected evidence: `verification:expected-bootstrap`",
    "  - Acceptance: `ROSE inspection and fresh verification are both required before done.`",
    `  - Dispatch evidence: \`${advanced ? "artifact:dispatch-P-01" : "pending"}\``,
    `  - Result evidence: \`${returned ? "artifact:result-P-01" : "pending"}\``,
    `  - Evidence: \`${returned ? "artifact:actual-P-01" : "pending"}\``,
    `  - ROSE disposition: \`${status === "done" ? "accepted" : "pending"}\``,
    "  - Blocker: `none`",
    "  - Next action: `Perform only the next bounded canonical update.`",
  ].join("\n");
}

function board(status: "pending" | "ready" | "running" | "returned" | "done" = "ready"): string {
  return [
    "# Task Board",
    "",
    "- Protocol: `aili-task-board/v1`",
    "- Task kind: `formal`",
    "- Task identity: `fixture-change`",
    "- Goal: Validate portable bootstrap updates.",
    "- Phase: `BUILD`",
    "- Board status: `active`",
    "- Accepted contract: `spec.md`",
    "- Accepted verification: `test-plan.md accepted`",
    "- Decision owner: `ROSE`",
    "- Verification owner: `ROSE`",
    "",
    "## Packages",
    "",
    packageBlock(status),
    "",
  ].join("\n");
}

function progress(status: "pending" | "ready" | "running" | "returned" | "done" = "ready"): string {
  const events = [
    "[2026-07-30T00:00:00Z] BOARD BOARD_CREATED\nevidence=artifact:board-created",
  ];
  if (status !== "pending") events.push("[2026-07-30T00:00:01Z] P-01 READY\nevidence=verification:gate-P-01");
  if (status === "running" || status === "returned" || status === "done") {
    events.push("[2026-07-30T00:00:02Z] P-01 DISPATCHED\nevidence=artifact:dispatch-P-01");
  }
  if (status === "returned" || status === "done") {
    events.push("[2026-07-30T00:00:03Z] P-01 RETURNED\nevidence=artifact:result-P-01");
  }
  if (status === "done") {
    events.push("[2026-07-30T00:00:04Z] P-01 INSPECTED\ndisposition=accepted\nevidence=artifact:actual-P-01");
    events.push("[2026-07-30T00:00:05Z] P-01 DONE\nverification=verification:fresh-P-01");
  }
  return `${events.join("\n\n")}\n`;
}

function observedRequest(): FormalTaskBoardObservedAfterReturnRequest {
  return {
    actor: "ROSE",
    tasksSource: board("ready"),
    progressSource: progress("ready"),
    timestamp: "2026-07-30T00:02:00Z",
    packageId: "P-01",
    dispatchEvidence: "artifact:dispatch-observed-P-01",
    result: "completed",
    resultEvidence: "artifact:result-observed-P-01",
    evidence: "artifact:actual-observed-P-01",
    evidenceReadable: true,
    inspection: {
      disposition: { kind: "accepted" },
      evidence: "artifact:actual-observed-P-01",
      acceptedClaims: "the bounded result only",
      rejectedClaims: "none",
      unverified: "none",
    },
    verification: "verification:fresh-observed-P-01",
    nextAction: "Retain the completed package without replay.",
  };
}

async function makeRepository(sources: { tasksSource: string; progressSource: string }): Promise<FormalTaskBoardRootPaths> {
  const scratch = await mkdtemp(resolve(tmpdir(), "aili-formal-bootstrap-"));
  scratchRoots.push(scratch);
  const repositoryRoot = resolve(scratch, "repository");
  const rootPath = resolve(repositoryRoot, "openspec", "changes", "fixture-change");
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

describe("formal task-board canonical bootstrap planner", () => {
  it("records an observed result only through canonical portable transitions", () => {
    const request = observedRequest();
    const planned = planFormalTaskBoardObservedAfterReturn(request);
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.eventTypes).toEqual(["DISPATCHED", "RETURNED", "INSPECTED", "DONE"]);
    expect(planned.tasksSource).toContain("- [x] P-01 —");
    expect(planned.progressSource.startsWith(request.progressSource)).toBe(true);
    expect(planned.tasksSource).not.toContain("Runtime:");
    expect(planned.appendedProgress).not.toMatch(/^(?:agent|job|turn|output|history|runtime|external|transport)=/m);
    expect(validateFormalTaskBoard(planned.tasksSource, planned.progressSource).valid).toBe(true);
  });

  it("keeps zero false completion when actor, readability, inspection, or verification is invalid", () => {
    const request = observedRequest();
    expect(codes(planFormalTaskBoardObservedAfterReturn({ ...request, actor: "worker" as never }))).toContain("REQUEST_INVALID");
    expect(codes(planFormalTaskBoardObservedAfterReturn({ ...request, evidenceReadable: false }))).toContain("READABLE_EVIDENCE_REQUIRED");
    expect(codes(planFormalTaskBoardObservedAfterReturn({
      ...request,
      inspection: { ...request.inspection, disposition: { kind: "rejected" } },
    }))).toContain("DISPOSITION_INVALID");
    expect(codes(planFormalTaskBoardObservedAfterReturn({ ...request, verification: "pending" }))).toContain("VERIFICATION_REQUIRED");
  });

  it("prevalidates every candidate in a bounded ROSE-owned sequence", () => {
    const request = {
      actor: "ROSE" as const,
      tasksSource: board("pending"),
      progressSource: progress("pending"),
      steps: [
        {
          packageId: "P-01",
          timestamp: "2026-07-30T00:01:00Z",
          operation: { kind: "transition" as const, to: "ready" as const, gateEvidence: "verification:ready-P-01" },
        },
        {
          packageId: "P-01",
          timestamp: "2026-07-30T00:02:00Z",
          operation: { kind: "transition" as const, to: "running" as const, dispatchEvidence: "artifact:dispatch-P-01" },
        },
      ],
    };
    const planned = planFormalTaskBoardBootstrapReconciliation(request);
    expect(planned.status).toBe("planned");
    if (planned.status === "planned") {
      expect(planned.eventTypes).toEqual(["READY", "DISPATCHED"]);
      expect(validateFormalTaskBoard(planned.tasksSource, planned.progressSource).valid).toBe(true);
    }
    expect(codes(planFormalTaskBoardBootstrapReconciliation({ ...request, steps: [...request.steps, { ...request.steps[1]!, operation: { kind: "transition", to: "done" } }] }))).toContain("ILLEGAL_TRANSITION");
  });
});

describe("formal task-board canonical bootstrap apply", () => {
  it("applies the guarded pair at formal-task-board.md and leaves legacy tasks.md byte-identical", async () => {
    const request = observedRequest();
    const paths = await makeRepository(request);
    const legacyPath = resolve(paths.rootPath, "tasks.md");
    const legacyBytes = "# Legacy tasks\n\n- [ ] do not migrate me\n";
    await writeFile(legacyPath, legacyBytes);
    const applied = await applyFormalTaskBoardObservedAfterReturn(paths, request);
    expect(applied.status).toBe("applied");
    if (applied.status !== "applied") return;
    expect(await readFile(paths.tasksPath, "utf8")).toBe(applied.tasksSource);
    expect(await readFile(paths.progressPath, "utf8")).toBe(applied.progressSource);
    expect(await readFile(legacyPath, "utf8")).toBe(legacyBytes);
    expect((await readdir(paths.rootPath)).filter((name) => name.startsWith(".aili-formal-update"))).toEqual([]);
  });

  it("preserves exact current bytes on mismatch, symlink, and injected replacement failure", async () => {
    const request = observedRequest();
    const mismatchPaths = await makeRepository(request);
    const concurrent = `${request.progressSource}\n`;
    await writeFile(mismatchPaths.progressPath, concurrent);
    const mismatch = await applyFormalTaskBoardObservedAfterReturn(mismatchPaths, request);
    expect(codes(mismatch)).toContain("SOURCE_MISMATCH");
    expect(await readFile(mismatchPaths.progressPath, "utf8")).toBe(concurrent);

    const symlinkPaths = await makeRepository(request);
    const realBoard = resolve(symlinkPaths.rootPath, "real-board.md");
    await writeFile(realBoard, request.tasksSource);
    await rm(symlinkPaths.tasksPath);
    await symlink(realBoard, symlinkPaths.tasksPath);
    const symlinked = await applyFormalTaskBoardObservedAfterReturn(symlinkPaths, request);
    expect(symlinked.status).toBe("blocked");
    expect(await readFile(realBoard, "utf8")).toBe(request.tasksSource);

    const rollbackPaths = await makeRepository(request);
    const rollback = await applyFormalTaskBoardObservedAfterReturn(rollbackPaths, request, {
      beforeRename: (target) => {
        if (target === "progress") throw new Error("injected");
      },
    });
    expect(rollback.status).toBe("blocked");
    expect(await readFile(rollbackPaths.tasksPath, "utf8")).toBe(request.tasksSource);
    expect(await readFile(rollbackPaths.progressPath, "utf8")).toBe(request.progressSource);
  });

  it("applies an explicit canonical batch through the same guarded pair", async () => {
    const sources = { tasksSource: board("pending"), progressSource: progress("pending") };
    const request = {
      actor: "ROSE" as const,
      ...sources,
      steps: [{
        packageId: "P-01",
        timestamp: "2026-07-30T00:01:00Z",
        operation: { kind: "transition" as const, to: "ready" as const, gateEvidence: "verification:ready-P-01" },
      }],
    };
    const paths = await makeRepository(sources);
    const applied = await applyFormalTaskBoardBootstrapReconciliation(paths, request);
    expect(applied.status).toBe("applied");
    if (applied.status === "applied") expect(applied.eventTypes).toEqual(["READY"]);
  });
});
