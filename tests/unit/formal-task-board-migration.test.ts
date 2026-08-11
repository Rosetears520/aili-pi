import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyFormalTaskBoardLegacyMigration,
  planFormalTaskBoardLegacyMigration,
  type FormalTaskBoardLegacyMigrationApplyRequest,
  type FormalTaskBoardLegacyMigrationPlanRequest,
} from "../../src/runtime/formal-task-board-migration.js";
import { resolveFormalTaskBoardRoot } from "../../src/runtime/formal-task-board-root.js";
import { parseFormalTaskBoard, validateFormalTaskBoard } from "../../src/runtime/formal-task-board.js";
import type { FormalTaskBoardUpdateHooks } from "../../src/runtime/formal-task-board-update.js";
import { applyGuardedFormalTaskBoardPair } from "../../src/runtime/formal-task-board-update.js";

const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

const legacyTasks = [
  "# Implementation Tasks",
  "",
  "Keep this historical introduction represented by the migration source digest.",
  "",
  "## 1. Existing work",
  "",
  "- [x] 1.1 Preserve the completed legacy package",
  "- [ ] P-02 — Preserve the pending `legacy` package",
  "",
].join("\n");

const optIn: Omit<FormalTaskBoardLegacyMigrationPlanRequest, "tasksSource" | "progressSource"> = {
  changeId: "exact-change",
  userDecisionRef: "user-decision://exact-change-legacy-opt-in",
  timestamp: "2026-07-30T03:00:00Z",
  phase: "BUILD",
  goal: "Continue one explicitly migrated legacy OpenSpec change.",
  acceptedContract: "spec.md legacy opt-in accepted",
  acceptedVerification: "Round-3 test-plan.md explicitly accepted",
};

function codes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map((entry) => entry.code);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function makeRepository(changeIds: string[] = ["exact-change", "unrelated-change"]): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "aili-formal-legacy-migration-"));
  scratchRoots.push(scratch);
  const repositoryRoot = resolve(scratch, "repository");
  await mkdir(resolve(repositoryRoot, "openspec", "changes"), { recursive: true });
  for (const changeId of changeIds) await mkdir(resolve(repositoryRoot, "openspec", "changes", changeId), { recursive: true });
  return repositoryRoot;
}

function changePaths(repositoryRoot: string, changeId = "exact-change") {
  const rootPath = resolve(repositoryRoot, "openspec", "changes", changeId);
  return {
    rootPath,
    tasksPath: resolve(rootPath, "formal-task-board.md"),
    progressPath: resolve(rootPath, "progress.txt"),
  };
}

function applyRequest(repositoryRoot: string, overrides: Partial<FormalTaskBoardLegacyMigrationApplyRequest> = {}): FormalTaskBoardLegacyMigrationApplyRequest {
  return { repositoryRoot, ...optIn, ...overrides };
}

describe("formal task-board explicit legacy migration planner", () => {
  it("keeps ordinary legacy inspection unmanaged and byte-identical until explicit opt-in", async () => {
    const repositoryRoot = await makeRepository();
    const exact = changePaths(repositoryRoot);
    await writeFile(exact.tasksPath, legacyTasks);
    const before = await readFile(exact.tasksPath);

    expect(parseFormalTaskBoard(legacyTasks)).toEqual({ classification: "legacy/unmanaged", diagnostics: [] });
    expect(validateFormalTaskBoard(legacyTasks, "unmanaged progress")).toMatchObject({
      classification: "legacy/unmanaged",
      valid: false,
      diagnostics: [{ code: "LEGACY_UNMANAGED" }],
    });
    const root = await resolveFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
    });
    expect(root.status).toBe("blocked");
    expect(codes(root)).toContain("OWNED_PAIR_INCOMPLETE");
    expect(await readFile(exact.tasksPath)).toEqual(before);
    expect(await exists(exact.progressPath)).toBe(false);
  });

  it("plans one strict v1 pair while preserving representable IDs, checkmarks, order, titles, and migration evidence", () => {
    const original = legacyTasks;
    const planned = planFormalTaskBoardLegacyMigration({ ...optIn, tasksSource: legacyTasks });
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;

    const digest = createHash("sha256").update(legacyTasks).digest("hex");
    expect(planned).toMatchObject({
      changeId: "exact-change",
      packageIds: ["1.1", "P-02"],
      checkedPackageIds: ["1.1"],
      legacyTasksSha256: digest,
      legacyProgressState: "absent",
      eventTypes: ["BOARD_CREATED", "READY", "INSPECTED", "DONE"],
    });
    const validation = validateFormalTaskBoard(planned.tasksSource, planned.progressSource);
    expect(validation.valid).toBe(true);
    expect(validation.board?.packages.map((taskPackage) => ({
      id: taskPackage.id,
      title: taskPackage.title,
      checked: taskPackage.checked,
      status: taskPackage.fields.Status?.value,
    }))).toEqual([
      { id: "1.1", title: "Preserve the completed legacy package", checked: true, status: "done" },
      { id: "P-02", title: "Preserve the pending `legacy` package", checked: false, status: "pending" },
    ]);
    expect(planned.progressSource).toContain("evidence=decision:legacy-opt-in/");
    expect(planned.progressSource).toContain(`artifact:legacy-source/exact-change/${digest}`);
    expect(planned.progressSource).not.toMatch(/^(?:runtime|agent|job|turn|output|history|decision)=/m);
    expect(planned.tasksSource).not.toContain("Runtime:");
    expect(legacyTasks).toBe(original);
  });

  it("requires an explicit exact decision and refuses lossy or informal migration inputs", () => {
    const valid = planFormalTaskBoardLegacyMigration({ ...optIn, tasksSource: legacyTasks });
    expect(valid.status).toBe("planned");
    if (valid.status !== "planned") return;
    const variants: Array<[string, FormalTaskBoardLegacyMigrationPlanRequest, string]> = [
      ["missing opt-in", { ...optIn, userDecisionRef: "", tasksSource: legacyTasks }, "EXPLICIT_OPT_IN_REQUIRED"],
      ["unsafe identity", { ...optIn, changeId: "../other", tasksSource: legacyTasks }, "CHANGE_ID_INVALID"],
      ["already v1", { ...optIn, tasksSource: valid.tasksSource }, "LEGACY_SOURCE_REQUIRED"],
      ["non-empty progress", { ...optIn, tasksSource: legacyTasks, progressSource: "legacy history bytes\n" }, "LEGACY_PROGRESS_NOT_EMPTY"],
      ["nested checklist", { ...optIn, tasksSource: `${legacyTasks}  - [ ] N-01 Nested item\n` }, "LEGACY_CHECKLIST_UNREPRESENTABLE"],
      ["duplicate ID", { ...optIn, tasksSource: `${legacyTasks}- [ ] 1.1 Duplicate item\n` }, "LEGACY_PACKAGE_ID_DUPLICATE"],
      ["invalid ID", { ...optIn, tasksSource: "# Tasks\n\n- [ ] bad/id Invalid item\n" }, "LEGACY_PACKAGE_ID_INVALID"],
    ];
    for (const [name, request, code] of variants) {
      expect(codes(planFormalTaskBoardLegacyMigration(request)), name).toContain(code);
    }
    expect(planFormalTaskBoardLegacyMigration({ ...optIn, tasksSource: legacyTasks, progressSource: "" })).toMatchObject({
      status: "planned",
      legacyProgressState: "empty",
    });
  });
});

describe("formal task-board explicit legacy migration apply", () => {
  it("upgrades only the exact opted-in change in place and leaves unrelated changes byte-identical", async () => {
    const repositoryRoot = await makeRepository();
    const exact = changePaths(repositoryRoot);
    const unrelated = changePaths(repositoryRoot, "unrelated-change");
    const unrelatedTasks = "# Unrelated Tasks\n\n- [x] U-01 Leave this change untouched\n";
    const unrelatedProgress = "unrelated progress bytes remain unmanaged\n";
    await writeFile(exact.tasksPath, legacyTasks);
    await writeFile(unrelated.tasksPath, unrelatedTasks);
    await writeFile(unrelated.progressPath, unrelatedProgress);

    const applied = await applyFormalTaskBoardLegacyMigration(applyRequest(repositoryRoot));
    expect(applied.status).toBe("applied");
    if (applied.status !== "applied") return;
    expect(applied.legacyProgressState).toBe("absent");
    expect(await readFile(exact.tasksPath, "utf8")).toBe(applied.tasksSource);
    expect(await readFile(exact.progressPath, "utf8")).toBe(applied.progressSource);
    expect(validateFormalTaskBoard(applied.tasksSource, applied.progressSource).valid).toBe(true);
    expect(await readFile(unrelated.tasksPath, "utf8")).toBe(unrelatedTasks);
    expect(await readFile(unrelated.progressPath, "utf8")).toBe(unrelatedProgress);
    expect((await readdir(exact.rootPath)).filter((name) => name.startsWith(".aili-formal-update"))).toEqual([]);

    const resolved = await resolveFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
    });
    expect(resolved).toMatchObject({ status: "resolved", pairState: "present" });

    const second = await applyFormalTaskBoardLegacyMigration(applyRequest(repositoryRoot));
    expect(codes(second)).toContain("LEGACY_SOURCE_REQUIRED");
    expect(await readFile(exact.tasksPath, "utf8")).toBe(applied.tasksSource);
    expect(await readFile(exact.progressPath, "utf8")).toBe(applied.progressSource);
  });

  it("supports an exact empty progress file but never discards non-empty unmanaged history", async () => {
    const emptyRepository = await makeRepository(["exact-change"]);
    const empty = changePaths(emptyRepository);
    await writeFile(empty.tasksPath, legacyTasks);
    await writeFile(empty.progressPath, "");
    const applied = await applyFormalTaskBoardLegacyMigration(applyRequest(emptyRepository));
    expect(applied).toMatchObject({ status: "applied", legacyProgressState: "empty" });

    const historyRepository = await makeRepository(["exact-change"]);
    const history = changePaths(historyRepository);
    const unmanagedHistory = "legacy progress must not be discarded\n";
    await writeFile(history.tasksPath, legacyTasks);
    await writeFile(history.progressPath, unmanagedHistory);
    const blocked = await applyFormalTaskBoardLegacyMigration(applyRequest(historyRepository));
    expect(codes(blocked)).toContain("LEGACY_PROGRESS_NOT_EMPTY");
    expect(await readFile(history.tasksPath, "utf8")).toBe(legacyTasks);
    expect(await readFile(history.progressPath, "utf8")).toBe(unmanagedHistory);
  });

  it.each([
    ["before progress installation", { beforeRename: (target: string) => { if (target === "progress") throw new Error("injected"); } }],
    ["after progress installation", { beforeFinalValidation: () => { throw new Error("injected"); } }],
  ] as Array<[string, FormalTaskBoardUpdateHooks]>)
    ("rolls back exact legacy bytes and restores progress absence after injected %s failure", async (_name, hooks) => {
      const repositoryRoot = await makeRepository(["exact-change"]);
      const exact = changePaths(repositoryRoot);
      await writeFile(exact.tasksPath, legacyTasks);

      const result = await applyFormalTaskBoardLegacyMigration(applyRequest(repositoryRoot), hooks);
      expect(result.status).toBe("blocked");
      expect(codes(result)).not.toContain("ROLLBACK_FAILED");
      expect(await readFile(exact.tasksPath, "utf8")).toBe(legacyTasks);
      expect(await exists(exact.progressPath)).toBe(false);
      expect((await readdir(exact.rootPath)).filter((name) => name.startsWith(".aili-formal-update"))).toEqual([]);
    });

  it("preserves a concurrently created progress file instead of overwriting or deleting it", async () => {
    const repositoryRoot = await makeRepository(["exact-change"]);
    const exact = changePaths(repositoryRoot);
    const concurrentProgress = "concurrent owner progress bytes\n";
    await writeFile(exact.tasksPath, legacyTasks);

    const result = await applyFormalTaskBoardLegacyMigration(applyRequest(repositoryRoot), {
      beforeRename: async (target) => {
        if (target === "progress") await writeFile(exact.progressPath, concurrentProgress, { flag: "wx" });
      },
    });
    expect(codes(result)).toContain("SOURCE_RACE");
    expect(await readFile(exact.tasksPath, "utf8")).toBe(legacyTasks);
    expect(await readFile(exact.progressPath, "utf8")).toBe(concurrentProgress);
  });

  it("never scans an alternate legacy change when the exact selected change has no task file", async () => {
    const repositoryRoot = await makeRepository(["exact-change", "unrelated-change"]);
    const exact = changePaths(repositoryRoot);
    const unrelated = changePaths(repositoryRoot, "unrelated-change");
    await writeFile(unrelated.tasksPath, legacyTasks);

    const result = await applyFormalTaskBoardLegacyMigration(applyRequest(repositoryRoot));
    expect(codes(result)).toContain("LEGACY_TASKS_MISSING");
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await exists(exact.progressPath)).toBe(false);
    expect(await readFile(unrelated.tasksPath, "utf8")).toBe(legacyTasks);
    expect(await exists(unrelated.progressPath)).toBe(false);
  });

  it("keeps absent-progress installation exclusive to the explicit migration entry point", async () => {
    const repositoryRoot = await makeRepository(["exact-change"]);
    const exact = changePaths(repositoryRoot);
    await writeFile(exact.tasksPath, legacyTasks);
    const planned = planFormalTaskBoardLegacyMigration({ ...optIn, tasksSource: legacyTasks });
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;

    expect(codes(await applyGuardedFormalTaskBoardPair({ repositoryRoot, ...exact }, null as never))).toContain("REQUEST_INVALID");

    const result = await applyGuardedFormalTaskBoardPair({ repositoryRoot, ...exact }, {
      tasksSource: legacyTasks,
      candidateTasksSource: planned.tasksSource,
      candidateProgressSource: planned.progressSource,
      changeId: "exact-change",
    } as never);
    expect(codes(result)).toContain("REQUEST_INVALID");
    expect(await readFile(exact.tasksPath, "utf8")).toBe(legacyTasks);
    expect(await exists(exact.progressPath)).toBe(false);
  });
});
