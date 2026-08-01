import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import type { AgentRecord, SidecarLayout } from "../../src/runtime/persistent-agents/types.js";
import {
  createWorkspaceMutationGuard,
  GitIsolationAdapter,
  validateWorkspaceCwd,
  validateWriteScope,
  WorkspaceLeaseManager,
  type WorkspaceLease,
} from "../../src/runtime/persistent-agents/workspace.js";

const exec = promisify(execFile);
let scratch = "";
let layout: SidecarLayout;
let journal: CoordinatorJournal;
let events = 0;

async function git(cwd: string, args: string[]): Promise<string> {
  return (await exec("git", args, { cwd, encoding: "utf8" })).stdout;
}

async function createAgent(id: string): Promise<void> {
  const now = "2026-07-25T04:00:00.000Z";
  const record: AgentRecord = { id, name: id, selector: "general", state: "queued", createdAt: now, updatedAt: now };
  await journal.append({ kind: "agent.created", agentId: id, payload: { record } });
}

function lease(agentId: string, mode: "shared" | "isolated", root: string, scope: Awaited<ReturnType<typeof validateWriteScope>>): WorkspaceLease {
  return { agentId, mode, projectRoot: root, root, scope, acquiredAt: "2026-07-25T04:00:00.000Z" };
}

function formalLease(
  agentId: string,
  mode: "shared" | "isolated",
  projectRoot: string,
  root: string,
  scope: Awaited<ReturnType<typeof validateWriteScope>>,
  protectedPaths: [string, string],
): WorkspaceLease {
  const writeScope = { paths: [...scope.paths], resources: [...scope.resources] };
  return {
    agentId,
    mode,
    projectRoot,
    root,
    scope,
    protectedPaths,
    requestedMode: mode,
    cwd: root,
    selector: "aili.implementer",
    jobId: `job-${agentId}`,
    initialTurnId: `turn-${agentId}`,
    formalProtection: { changeId: "formal", protectedPaths },
    formalContinuationIdentity: {
      packageId: "P-01",
      canonicalRole: "aili.implementer",
      scope: "bounded fixture",
      forbiddenScope: "everything else",
      writeScope,
      acceptanceBoundary: "blocked owning files",
      expectedEvidence: "focused bytes and event result",
    },
    formalWorkspaceRequest: { mode, writeScope, cwd: ".", selector: "aili.implementer" },
    acquiredAt: "2026-07-30T00:00:00.000Z",
  };
}

async function createRepo(name = "repo") {
  const repo = join(scratch, name);
  await mkdir(repo, { recursive: true });
  await git(repo, ["init", "-q"]);
  await git(repo, ["config", "user.name", "AILI Fixture"]);
  await git(repo, ["config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(repo, "tracked.txt"), "base\n");
  await git(repo, ["add", "tracked.txt"]);
  await git(repo, ["commit", "-qm", "base"]);
  return repo;
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-workspace-"));
  const parent = join(scratch, "parent.jsonl");
  await writeFile(parent, "fixture parent\n");
  layout = await ensureSidecarLayout(parent);
  events = 0;
  journal = (await CoordinatorJournal.open(layout, "parent-1", {
    eventId: () => `event-${++events}`,
    clock: () => new Date(Date.UTC(2026, 6, 25, 4, 0, events)),
  })).journal;
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("workspace scope and conflict leases", () => {
  it("validates scope/cwd boundaries and rejects traversal, credential paths, globs, and symlink escapes", async () => {
    const project = join(scratch, "project");
    const outside = join(scratch, "outside");
    await mkdir(join(project, "src"), { recursive: true });
    await mkdir(outside);
    expect(await validateWriteScope(project, { paths: ["src", "src/module.ts"], resources: ["port:3000", "port:3000"] })).toEqual({
      paths: ["src", "src/module.ts"],
      resources: ["port:3000"],
      declared: true,
    });
    await expect(validateWriteScope(project, { paths: ["../outside"], resources: [] })).rejects.toThrow(/escapes project root/);
    await expect(validateWriteScope(project, { paths: ["~/.ssh/id_ed25519"], resources: [] })).rejects.toThrow(/credential/);
    await expect(validateWriteScope(project, { paths: ["src/*.ts"], resources: [] })).rejects.toThrow(/globs are unsupported/);
    expect(await validateWorkspaceCwd(project, "src")).toBe(await accessReal(join(project, "src")));
    await symlink(outside, join(project, "linked-outside"));
    await expect(validateWorkspaceCwd(project, "linked-outside")).rejects.toThrow(/symlink escapes/);
    await expect(validateWorkspaceCwd(project, "missing")).rejects.toThrow(/does not exist/);
  });

  it("shares disjoint known scopes, isolates path overlap, blocks resource overlap, and labels undeclared best-effort", async () => {
    const project = join(scratch, "project");
    await mkdir(project);
    const manager = new WorkspaceLeaseManager();
    const scopeA = await validateWriteScope(project, { paths: ["src/a"], resources: [] });
    const scopeB = await validateWriteScope(project, { paths: ["src/b"], resources: [] });
    const scopeOverlap = await validateWriteScope(project, { paths: ["src/a/file.ts"], resources: [] });
    const resourceA = await validateWriteScope(project, { paths: [], resources: ["db:test"] });
    const resourceB = await validateWriteScope(project, { paths: [], resources: ["db:test"] });
    manager.acquire(lease("A", "shared", project, scopeA));
    expect(manager.decide("B", "auto", project, scopeB)).toMatchObject({ mode: "shared", reason: "disjoint-known-scope" });
    manager.acquire(lease("B", "shared", project, scopeB));
    expect(manager.decide("C", "auto", project, scopeOverlap)).toMatchObject({ mode: "isolated", reason: "overlapping-path-scope" });
    manager.acquire(lease("C", "isolated", project, scopeOverlap));
    manager.acquire(lease("ResourceA", "shared", project, resourceA));
    expect(() => manager.decide("ResourceB", "auto", project, resourceB)).toThrow(/cannot isolate shared resources/);

    const undeclared = await validateWriteScope(project, { paths: [], resources: [] });
    expect(manager.decide("Unknown", "auto", project, undeclared)).toMatchObject({
      mode: "shared",
      reason: "undeclared-best-effort",
      diagnostics: [expect.stringContaining("best-effort")],
    });
  });

  it("blocks the second observable shared mutation and out-of-scope writes with isolated retry guidance", async () => {
    const project = join(scratch, "project");
    const outside = join(scratch, "mutation-outside");
    await mkdir(project);
    await mkdir(outside);
    const manager = new WorkspaceLeaseManager();
    const undeclared = await validateWriteScope(project, { paths: [], resources: [] });
    manager.acquire(lease("A", "shared", project, undeclared));
    manager.acquire(lease("B", "shared", project, undeclared));
    await symlink(outside, join(project, "escape"));
    await expect(manager.assertFileMutation("A", "escape/file.ts")).rejects.toThrow(/symlink escapes workspace root/);
    expect(await manager.assertFileMutation("A", "same.txt")).toMatchObject({ allowed: true, diagnostic: expect.stringContaining("best-effort") });
    await expect(manager.assertFileMutation("B", "same.txt")).rejects.toThrow(/second conflicting mutation blocked.*isolated workspace/);
    expect(manager.assertResourceMutation("A", "port:4000")).toEqual({ allowed: true });
    expect(() => manager.assertResourceMutation("B", "port:4000")).toThrow(/second conflicting resource mutation/);

    const declared = await validateWriteScope(project, { paths: ["src"], resources: ["db:one"] });
    manager.acquire(lease("Declared", "shared", project, declared));
    expect(await manager.assertFileMutation("Declared", "src/in-scope.ts")).toEqual({ allowed: true });
    await expect(manager.assertFileMutation("Declared", "other/file.ts")).rejects.toThrow(/outside declared writeScope/);
    expect(() => manager.assertResourceMutation("Declared", "db:two")).toThrow(/outside declared writeScope/);

    let guardA: ((event: { toolName: string; input: unknown }) => Promise<unknown>) | undefined;
    let guardB: typeof guardA;
    createWorkspaceMutationGuard(manager, "A")({ on: (_event: string, callback: typeof guardA) => { guardA = callback; } } as never);
    createWorkspaceMutationGuard(manager, "B")({ on: (_event: string, callback: typeof guardB) => { guardB = callback; } } as never);
    expect(await guardA!({ toolName: "write", input: { path: "guard.txt" } })).toBeUndefined();
    expect(await guardB!({ toolName: "edit", input: { path: "guard.txt" } })).toMatchObject({ block: true, reason: expect.stringContaining("isolated workspace") });
  });

  it("fails closed for formal resource-only file writes, path-only resource writes, and in-root symlink scope escapes", async () => {
    const project = join(scratch, "formal-scope-project");
    await mkdir(join(project, "allowed"), { recursive: true });
    await mkdir(join(project, "other"), { recursive: true });
    await symlink("../other", join(project, "allowed", "link"));
    const protectedPaths: [string, string] = [
      "openspec/changes/formal/formal-task-board.md",
      "openspec/changes/formal/progress.txt",
    ];

    const resourceOnlyManager = new WorkspaceLeaseManager();
    const resourceOnly = await validateWriteScope(project, { paths: [], resources: ["db:test"] });
    resourceOnlyManager.acquire(formalLease("ResourceOnly", "shared", project, project, resourceOnly, protectedPaths));
    await expect(resourceOnlyManager.assertFileMutation("ResourceOnly", "other/file.ts")).rejects.toThrow(/explicit path writeScope/);

    const pathOnlyManager = new WorkspaceLeaseManager();
    const pathOnly = await validateWriteScope(project, { paths: ["allowed"], resources: [] });
    pathOnlyManager.acquire(formalLease("PathOnly", "shared", project, project, pathOnly, protectedPaths));
    expect(() => pathOnlyManager.assertResourceMutation("PathOnly", "db:test")).toThrow(/explicit resource writeScope/);
    await expect(pathOnlyManager.assertFileMutation("PathOnly", "allowed/link/file.ts")).rejects.toThrow(/outside declared writeScope/);
    expect(await pathOnlyManager.assertFileMutation("PathOnly", "allowed/file.ts")).toEqual({ allowed: true });
  });

  it("blocks formal owning-file write/edit events for path variants and aliases before existing or missing bytes can change", async () => {
    const protectedPaths: [string, string] = [
      "openspec/changes/formal/formal-task-board.md",
      "openspec/changes/formal/progress.txt",
    ];
    for (const mode of ["shared", "isolated"] as const) {
      const project = join(scratch, `${mode}-project`);
      const root = mode === "shared" ? project : join(scratch, `${mode}-workspace`);
      await mkdir(join(project, "openspec", "changes", "formal"), { recursive: true });
      await mkdir(join(root, "openspec", "changes", "formal"), { recursive: true });
      const board = join(root, protectedPaths[0]!);
      const progress = join(root, protectedPaths[1]!);
      const adjacent = join(root, "openspec", "changes", "formal", "evidence.txt");
      const boardBefore = Buffer.from([0x62, 0x6f, 0x61, 0x72, 0x64, 0x00, 0xff]);
      const progressBefore = Buffer.from([0x70, 0x72, 0x6f, 0x67, 0x72, 0x65, 0x73, 0x73, 0x0a]);
      await writeFile(board, boardBefore);
      await writeFile(progress, progressBefore);
      const manager = new WorkspaceLeaseManager();
      const scope = await validateWriteScope(project, {
        paths: ["openspec/changes/formal"],
        resources: [],
      });
      const agentId = `${mode}-formal`;
      expect(() => manager.acquire({
        agentId,
        mode,
        projectRoot: project,
        root,
        scope,
        protectedPaths,
        acquiredAt: "2026-07-30T00:00:00.000Z",
      })).toThrow(/formal workspace lease protection is incomplete/);
      manager.acquire(formalLease(agentId, mode, project, root, scope, protectedPaths));

      let guard: ((event: { toolName: string; input: unknown }) => Promise<unknown>) | undefined;
      createWorkspaceMutationGuard(manager, agentId)({
        on(event: string, callback: typeof guard) {
          if (event === "tool_call") guard = callback;
        },
      } as never);
      const attempt = async (toolName: "write" | "edit", path: string) => {
        const result = await guard!({ toolName, input: { path } }) as { block?: boolean; reason?: string } | undefined;
        if (!result?.block) await writeFile(resolve(root, path), Buffer.from("mutated"));
        return result;
      };
      const boardAlias = join(root, "board-alias.md");
      const progressAlias = join(root, "progress-alias.md");
      await symlink(board, boardAlias);
      await symlink(progress, progressAlias);

      for (const [toolName, path] of [
        ["write", protectedPaths[0]],
        ["edit", progress],
        ["write", "openspec/changes/formal/../formal/formal-task-board.md"],
        ["edit", "board-alias.md"],
        ["write", progressAlias],
      ] as const) {
        expect(await attempt(toolName, path)).toMatchObject({
          block: true,
          reason: expect.stringContaining("formal task-board owning file is denied"),
        });
      }
      expect(await readFile(board)).toEqual(boardBefore);
      expect(await readFile(progress)).toEqual(progressBefore);

      await rm(board);
      await rm(progress);
      for (const [toolName, path] of [
        ["edit", protectedPaths[0]],
        ["write", protectedPaths[1]],
        ["write", "board-alias.md"],
        ["edit", "progress-alias.md"],
      ] as const) {
        expect(await attempt(toolName, path)).toMatchObject({ block: true });
      }
      await expect(access(board)).rejects.toThrow();
      await expect(access(progress)).rejects.toThrow();

      expect(await guard!({ toolName: "write", input: { path: "openspec/changes/formal/evidence.txt" } })).toBeUndefined();
      await writeFile(adjacent, "lawful\n");
      expect(await readFile(adjacent, "utf8")).toBe("lawful\n");
    }
  });
});

describe("audited Git isolation", () => {
  it("projects a dirty baseline, returns child-only patch/branch evidence, leaves main untouched, and prevents revive after cleanup", async () => {
    const repo = await createRepo();
    await writeFile(join(repo, "tracked.txt"), "dirty baseline\n");
    await writeFile(join(repo, "untracked.txt"), "untracked baseline\n");
    await createAgent("Worker");
    const adapter = new GitIsolationAdapter(layout, journal, () => new Date(1_750_000_000_000));
    const isolated = await adapter.create("Worker", repo);
    expect(await readFile(join(isolated.root, "tracked.txt"), "utf8")).toBe("dirty baseline\n");
    expect(await readFile(join(isolated.root, "untracked.txt"), "utf8")).toBe("untracked baseline\n");
    expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe("dirty baseline\n");
    expect(isolated.branch).toMatch(/^aili-agent\/worker-/);

    await writeFile(join(isolated.root, "tracked.txt"), "child result\n");
    await writeFile(join(isolated.root, "child-only.txt"), "child only\n");
    const finalized = await adapter.finalize(isolated);
    const patch = await readFile(finalized.patchPath!, "utf8");
    expect(patch).toContain("+child result");
    expect(patch).toContain("+child only");
    expect(patch).not.toContain("+dirty baseline");
    expect((await git(repo, ["rev-parse", finalized.branch])).trim()).toBe(finalized.resultCommit);
    expect(await readFile(join(repo, "tracked.txt"), "utf8")).toBe("dirty baseline\n");
    await expect(access(join(repo, "child-only.txt"))).rejects.toThrow();

    expect(await adapter.restore("Worker")).toMatchObject({
      agentId: "Worker",
      mode: "isolated",
      status: "finalized",
      root: isolated.root,
      resultCommit: finalized.resultCommit,
    });

    const cleaned = await adapter.cleanup(finalized);
    await expect(access(cleaned.root)).rejects.toThrow();
    expect(() => adapter.assertResumable("Worker")).toThrow(/was cleaned.*cannot revive/);
    await expect(adapter.restore("Worker")).rejects.toThrow(/cannot revive|shared fallback is forbidden/);
    expect(journal.getState().workspaces.Worker.status).toBe("cleaned");
  });

  it("fails clearly outside Git and retains a cleanup-failure diagnostic instead of shared fallback", async () => {
    const notGit = join(scratch, "not-git");
    await mkdir(notGit);
    await createAgent("NoGit");
    const adapter = new GitIsolationAdapter(layout, journal);
    await expect(adapter.create("NoGit", notGit)).rejects.toThrow(/Git top-level/);
    expect(journal.getState().workspaces.NoGit).toBeUndefined();

    const repo = await createRepo("cleanup-repo");
    await createAgent("Cleanup");
    const active = await adapter.create("Cleanup", repo);
    await rm(join(repo, ".git"), { recursive: true, force: true });
    await expect(adapter.cleanup(active)).rejects.toThrow(/cleanup failed.*artifact retained/);
    expect(journal.getState().workspaces.Cleanup.status).toBe("cleanup-failed");
    expect(() => adapter.assertResumable("Cleanup")).toThrow(/cleanup failed/);
    await access(active.root);
  });
});

async function accessReal(path: string): Promise<string> {
  await access(path);
  return await (await import("node:fs/promises")).realpath(path);
}
