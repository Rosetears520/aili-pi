import { access, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  initializeFormalTaskBoardRoot,
  resolveFormalTaskBoardRoot,
  type FormalTaskBoardIdentity,
} from "../../src/runtime/formal-task-board-root.js";

const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

async function makeRepository(changeIds: string[] = ["exact-change"]): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "aili-formal-root-"));
  scratchRoots.push(scratch);
  const repositoryRoot = join(scratch, "repository");
  await mkdir(join(repositoryRoot, "openspec", "changes"), { recursive: true });
  for (const changeId of changeIds) await mkdir(join(repositoryRoot, "openspec", "changes", changeId), { recursive: true });
  return repositoryRoot;
}

function packageBlock(): string {
  return [
    "- [ ] P-01 — Initialize exact formal root",
    "  - Phase: `BUILD`",
    "  - Package kind: `task-execution`",
    "  - Source refs: `task:P-01`",
    "  - Accepted task IDs: `P-01`",
    "  - Status: `pending`",
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
    "  - Scope: `Initialize only the exact formal root.`",
    "  - Forbidden scope: `No alternate root, dependency, Git, permission, or release changes.`",
    "  - Expected result: `One deterministic paired root.`",
    "  - Expected evidence: `verification:focused-root; artifact:formal-root/P-01`",
    "  - Acceptance: `The exact pair is created or safely reused.`",
    "  - Dispatch evidence: `pending`",
    "  - Result evidence: `pending`",
    "  - Evidence: `pending`",
    "  - ROSE disposition: `pending`",
    "  - Blocker: `none`",
    "  - Next action: `Dispatch the exact ready package.`",
  ].join("\n");
}

function validBoard(changeId = "exact-change"): string {
  return [
    "# Task Board",
    "",
    "- Protocol: `aili-task-board/v1`",
    "- Task kind: `formal`",
    `- Task identity: \`${changeId}\``,
    "- Goal: Initialize one bounded formal board.",
    "- Phase: `BUILD`",
    "- Board status: `active`",
    "- Accepted contract: `spec.md`",
    "- Accepted verification: `test-plan.md accepted`",
    "- Decision owner: `ROSE`",
    "- Verification owner: `ROSE`",
    "",
    "## Packages",
    "",
    packageBlock(),
    "",
  ].join("\n");
}

function validProgress(changeId = "exact-change"): string {
  void changeId;
  return "[2026-07-30T00:00:00Z] BOARD BOARD_CREATED\n";
}

function paths(repositoryRoot: string, changeId = "exact-change") {
  const rootPath = join(repositoryRoot, "openspec", "changes", changeId);
  return {
    rootPath,
    tasksPath: join(rootPath, "formal-task-board.md"),
    progressPath: join(rootPath, "progress.txt"),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function diagnosticCodes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("formal OpenSpec task-board root", () => {
  it("resolves only the exact lifecycle-selected root without writing or guessing an alternate change", async () => {
    const repositoryRoot = await makeRepository(["exact-change", "alternate-change"]);
    const exact = paths(repositoryRoot);
    const alternate = paths(repositoryRoot, "alternate-change");
    const alternateBytes = "# unrelated legacy checklist\n- [ ] leave unchanged\n";
    await writeFile(alternate.tasksPath, alternateBytes);

    const result = await resolveFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
    });

    expect(result).toEqual({
      status: "resolved",
      pairState: "absent",
      repositoryRoot: resolve(repositoryRoot),
      ...exact,
      diagnostics: [],
    });
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await exists(exact.progressPath)).toBe(false);
    expect(await readFile(alternate.tasksPath, "utf8")).toBe(alternateBytes);
    expect(await exists(alternate.progressPath)).toBe(false);
  });

  it("creates a caller-supplied valid pair only at the exact formal root with conservative modes", async () => {
    const repositoryRoot = await makeRepository(["exact-change", "alternate-change"]);
    const exact = paths(repositoryRoot);
    const alternate = paths(repositoryRoot, "alternate-change");
    const tasksSource = validBoard();
    const progressSource = validProgress();
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource,
      progressSource,
    });

    expect(result.status).toBe("created");
    expect(result).toMatchObject(exact);
    expect(await readFile(exact.tasksPath, "utf8")).toBe(tasksSource);
    expect(await readFile(exact.progressPath, "utf8")).toBe(progressSource);
    expect((await stat(exact.tasksPath)).mode & 0o077).toBe(0);
    expect((await stat(exact.progressPath)).mode & 0o077).toBe(0);
    expect(await exists(join(repositoryRoot, "task", "exact-change"))).toBe(false);
    expect(await exists(join(repositoryRoot, ".aili", "tasks"))).toBe(false);
    expect(await exists(join(repositoryRoot, "TODO.md"))).toBe(false);
    expect(await exists(alternate.tasksPath)).toBe(false);
    expect(await exists(alternate.progressPath)).toBe(false);
  });

  it("leaves a legacy tasks.md byte-identical while creating only the canonical owning pair", async () => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const legacyPath = join(exact.rootPath, "tasks.md");
    const legacyBytes = "# Legacy OpenSpec checklist\n\n- [ ] preserve this file\n";
    await writeFile(legacyPath, legacyBytes);

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("created");
    expect(await readFile(legacyPath, "utf8")).toBe(legacyBytes);
    expect(await readFile(exact.tasksPath, "utf8")).toBe(validBoard());
    expect(await readFile(exact.progressPath, "utf8")).toBe(validProgress());
  });

  it("reuses an existing valid pair byte-identically without requiring replacement candidates", async () => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const tasksSource = validBoard();
    const progressSource = validProgress();
    await writeFile(exact.tasksPath, tasksSource);
    await writeFile(exact.progressPath, progressSource);

    const resolution = await resolveFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
    });
    expect(resolution).toMatchObject({
      status: "resolved",
      pairState: "present",
      tasksSource,
      progressSource,
    });

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: "not used for reuse",
      progressSource: "not used for reuse",
    });

    expect(result.status).toBe("reused");
    expect(await readFile(exact.tasksPath, "utf8")).toBe(tasksSource);
    expect(await readFile(exact.progressPath, "utf8")).toBe(progressSource);
  });

  it.each(["tasks", "progress"] as const)("blocks a %s-only existing pair with zero repair writes", async (present) => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const presentPath = present === "tasks" ? exact.tasksPath : exact.progressPath;
    const absentPath = present === "tasks" ? exact.progressPath : exact.tasksPath;
    const original = present === "tasks" ? validBoard() : validProgress();
    await writeFile(presentPath, original);

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("OWNED_PAIR_INCOMPLETE");
    expect(await readFile(presentPath, "utf8")).toBe(original);
    expect(await exists(absentPath)).toBe(false);
  });

  it.each([
    { state: "missing" } as const,
    { state: "ambiguous" } as const,
  ])("blocks explicit $state identity with zero writes", async (identity) => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity,
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain(identity.state === "missing" ? "IDENTITY_MISSING" : "IDENTITY_AMBIGUOUS");
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await exists(exact.progressPath)).toBe(false);
  });

  it.each(["", " ", " exact-change", "exact-change ", ".", "..", "../exact-change", "/tmp/exact-change", "C:\\tmp\\exact-change", "nested/exact-change", "nested\\exact-change"])(
    "rejects unsafe resolved change ID %j without mutation",
    async (changeId) => {
      const repositoryRoot = await makeRepository();
      const exact = paths(repositoryRoot);
      const identity: FormalTaskBoardIdentity = { state: "resolved", changeId };
      const result = await initializeFormalTaskBoardRoot({
        repositoryRoot,
        identity,
        tasksSource: validBoard(),
        progressSource: validProgress(),
      });

      expect(result.status).toBe("blocked");
      expect(diagnosticCodes(result)).toContain("CHANGE_ID_INVALID");
      expect(await exists(exact.tasksPath)).toBe(false);
      expect(await exists(exact.progressPath)).toBe(false);
    },
  );

  it.each([
    (repositoryRoot: string) => repositoryRoot.slice(1),
    (repositoryRoot: string) => `${repositoryRoot}/../repository`,
  ])("rejects a non-exact repository-root spelling before mutation", async (repositoryRootVariant) => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot: repositoryRootVariant(repositoryRoot),
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("REPOSITORY_ROOT_INVALID");
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await exists(exact.progressPath)).toBe(false);
  });

  it("rejects a missing exact change root without creating directories or files", async () => {
    const repositoryRoot = await makeRepository([]);
    const exact = paths(repositoryRoot);
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("PATH_MISSING");
    expect(await exists(exact.rootPath)).toBe(false);
  });

  it("rejects a symlinked repository root", async () => {
    const repositoryRoot = await makeRepository();
    const alias = join(repositoryRoot, "..", "repository-link");
    await symlink(repositoryRoot, alias, "dir");

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot: alias,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("PATH_SYMLINK");
    expect(await exists(paths(repositoryRoot).tasksPath)).toBe(false);
  });

  it("rejects a symlinked exact change root without writing through it", async () => {
    const repositoryRoot = await makeRepository([]);
    const external = await mkdtemp(join(tmpdir(), "aili-formal-root-external-"));
    scratchRoots.push(external);
    const changeRoot = paths(repositoryRoot).rootPath;
    await symlink(external, changeRoot, "dir");

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("PATH_SYMLINK");
    expect(await exists(join(external, "formal-task-board.md"))).toBe(false);
    expect(await exists(join(external, "progress.txt"))).toBe(false);
  });

  it("rejects a symlink at an owned file without changing its target", async () => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const external = join(repositoryRoot, "..", "external-tasks.md");
    const externalBytes = "outside-owned-root\n";
    await writeFile(external, externalBytes);
    await symlink(external, exact.tasksPath);

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("PATH_SYMLINK");
    expect(await readFile(external, "utf8")).toBe(externalBytes);
    expect(await exists(exact.progressPath)).toBe(false);
  });

  it.each(["tasks", "progress"] as const)("rejects a non-regular %s owned-path collision before creating its pair", async (target) => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const collisionPath = target === "tasks" ? exact.tasksPath : exact.progressPath;
    const otherPath = target === "tasks" ? exact.progressPath : exact.tasksPath;
    await mkdir(collisionPath);

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("OWNED_PATH_COLLISION");
    expect((await lstat(collisionPath)).isDirectory()).toBe(true);
    expect(await exists(otherPath)).toBe(false);
  });

  it.each([
    {
      name: "legacy task source",
      tasksSource: "# Legacy tasks\n\n- [ ] old checklist\n",
      progressSource: validProgress(),
      code: "CANDIDATE_LEGACY_UNMANAGED",
    },
    {
      name: "mismatched formal identity",
      tasksSource: validBoard("other-change"),
      progressSource: validProgress("other-change"),
      code: "CANDIDATE_IDENTITY_MISMATCH",
    },
    {
      name: "duplicate BOARD_CREATED event",
      tasksSource: validBoard(),
      progressSource: `${validProgress()}\n${validProgress()}`,
      code: "CANDIDATE_INVALID",
    },
    {
      name: "a transition beyond the initial BOARD_CREATED event",
      tasksSource: validBoard(),
      progressSource: `${validProgress()}\n[2026-07-30T00:00:01Z] P-01 READY\nevidence=not-yet-initial\n`,
      code: "CANDIDATE_INVALID",
    },
  ])("rejects $name candidate bytes before mutation", async ({ tasksSource, progressSource, code }) => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource,
      progressSource,
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain(code);
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await exists(exact.progressPath)).toBe(false);
  });

  it("leaves an existing invalid pair byte-identical", async () => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const invalidTasks = validBoard().replace("agent:aili.implementer", "agent:general");
    const originalProgress = validProgress();
    await writeFile(exact.tasksPath, invalidTasks);
    await writeFile(exact.progressPath, originalProgress);

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("EXISTING_PAIR_INVALID");
    expect(await readFile(exact.tasksPath, "utf8")).toBe(invalidTasks);
    expect(await readFile(exact.progressPath, "utf8")).toBe(originalProgress);
  });

  it.each([
    {
      name: "legacy board",
      tasksSource: "# Legacy board\n\n- [ ] old checklist\n",
      progressSource: validProgress(),
      code: "EXISTING_PAIR_LEGACY_UNMANAGED",
    },
    {
      name: "mismatched identity",
      tasksSource: validBoard("other-change"),
      progressSource: validProgress("other-change"),
      code: "EXISTING_IDENTITY_MISMATCH",
    },
  ])("leaves an existing $name pair byte-identical", async ({ tasksSource, progressSource, code }) => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    await writeFile(exact.tasksPath, tasksSource);
    await writeFile(exact.progressPath, progressSource);

    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain(code);
    expect(await readFile(exact.tasksPath, "utf8")).toBe(tasksSource);
    expect(await readFile(exact.progressPath, "utf8")).toBe(progressSource);
  });

  it("requires both initial sources before creating either canonical file", async () => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("INITIAL_SOURCES_MISSING");
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await exists(exact.progressPath)).toBe(false);
  });

  it("uses exclusive creation and rolls back only its first file when the second path loses a race", async () => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const raceWinner = "race-winner-progress-bytes\n";
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
      hooks: {
        beforeCreate: async (path, ordinal) => {
          expect(isAbsolute(path)).toBe(true);
          if (ordinal === 2) await writeFile(path, raceWinner, { flag: "wx" });
        },
      },
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("CREATE_RACE");
    expect(diagnosticCodes(result)).not.toContain("ROLLBACK_FAILED");
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await readFile(exact.progressPath, "utf8")).toBe(raceWinner);
  });

  it("detects first-file byte races before creating the second file and rolls back its own inode", async () => {
    const repositoryRoot = await makeRepository();
    const exact = paths(repositoryRoot);
    const result = await initializeFormalTaskBoardRoot({
      repositoryRoot,
      identity: { state: "resolved", changeId: "exact-change" },
      tasksSource: validBoard(),
      progressSource: validProgress(),
      hooks: {
        beforeCreate: async (_path, ordinal) => {
          if (ordinal === 2) await writeFile(exact.tasksPath, "raced bytes\n");
        },
      },
    });

    expect(result.status).toBe("blocked");
    expect(diagnosticCodes(result)).toContain("CREATE_RACE");
    expect(diagnosticCodes(result)).not.toContain("ROLLBACK_FAILED");
    expect(await exists(exact.tasksPath)).toBe(false);
    expect(await exists(exact.progressPath)).toBe(false);
  });
});
