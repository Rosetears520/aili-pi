import { execFile as execFileCallback } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { CoordinatorJournal } from "./storage.js";
import { assertSafeAgentId } from "./storage.js";
import type { SidecarLayout } from "./types.js";
import type { TaskWorkspaceMode, TaskWriteScope } from "./task-schema.js";
import type { FormalContinuationAudit } from "./task-schema.js";
import type { FormalTaskProtection, FormalWorkspaceRequest } from "./task-coordinator.js";
import { assertNoCredentialMaterial } from "./permission.js";
import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";

const execFile = promisify(execFileCallback);

export interface ValidatedWriteScope {
  paths: string[];
  resources: string[];
  declared: boolean;
}

export interface WorkspaceDecision {
  mode: "shared" | "isolated";
  reason: "explicit-shared" | "explicit-isolated" | "disjoint-known-scope" | "overlapping-path-scope" | "undeclared-best-effort";
  diagnostics: string[];
  conflicts: string[];
}

export interface WorkspaceLease {
  agentId: string;
  mode: "shared" | "isolated";
  projectRoot: string;
  root: string;
  scope: ValidatedWriteScope;
  protectedPaths?: string[];
  requestedMode?: TaskWorkspaceMode;
  cwd?: string;
  selector?: string;
  jobId?: string;
  initialTurnId?: string;
  formalProtection?: FormalTaskProtection;
  formalContinuationIdentity?: FormalContinuationAudit;
  formalWorkspaceRequest?: FormalWorkspaceRequest;
  acquiredAt: string;
}

export type FormalWorkspaceLease = WorkspaceLease & {
  requestedMode: TaskWorkspaceMode;
  cwd: string;
  selector: string;
  jobId: string;
  initialTurnId: string;
  formalProtection: FormalTaskProtection;
  formalContinuationIdentity: FormalContinuationAudit;
  formalWorkspaceRequest: FormalWorkspaceRequest;
  protectedPaths: string[];
};

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function normalizeResource(resource: string): string {
  const normalized = resource.trim();
  if (!normalized || normalized.length > 300 || /[\r\n\0]/.test(normalized)) throw new Error(`invalid writeScope resource: ${resource}`);
  return normalized;
}

export async function validateWriteScope(projectRoot: string, scope: TaskWriteScope): Promise<ValidatedWriteScope> {
  const canonicalRoot = await realpath(projectRoot);
  const paths: string[] = [];
  for (const path of scope.paths) {
    await assertNoCredentialMaterial(path, "writeScope path", canonicalRoot);
    if (path.includes("*") || path.includes("?")) throw new Error(`writeScope path globs are unsupported: ${path}`);
    const candidate = resolve(canonicalRoot, path);
    if (!isInside(canonicalRoot, candidate)) throw new Error(`writeScope path escapes project root: ${path}`);
    const normalized = relative(canonicalRoot, candidate).replaceAll(sep, "/") || ".";
    paths.push(normalized);
  }
  const resources = scope.resources.map(normalizeResource);
  return {
    paths: [...new Set(paths)].sort(),
    resources: [...new Set(resources)].sort(),
    declared: paths.length > 0 || resources.length > 0,
  };
}

export async function validateWorkspaceCwd(workspaceRoot: string, requestedCwd?: string): Promise<string> {
  const canonicalRoot = await realpath(workspaceRoot);
  const candidate = resolve(canonicalRoot, requestedCwd ?? ".");
  if (!isInside(canonicalRoot, candidate)) throw new Error(`cwd escapes workspace root: ${requestedCwd}`);
  try {
    const canonical = await realpath(candidate);
    if (!isInside(canonicalRoot, canonical)) throw new Error(`cwd symlink escapes workspace root: ${requestedCwd}`);
    const stat = await lstat(canonical);
    if (!stat.isDirectory()) throw new Error(`cwd is not a directory: ${requestedCwd}`);
    return canonical;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`cwd does not exist: ${requestedCwd}`);
    throw error;
  }
}

function pathsOverlap(left: string, right: string): boolean {
  if (left === "." || right === ".") return true;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function scopeConflicts(left: ValidatedWriteScope, right: ValidatedWriteScope): string[] {
  const conflicts: string[] = [];
  for (const leftPath of left.paths) {
    for (const rightPath of right.paths) if (pathsOverlap(leftPath, rightPath)) conflicts.push(`path:${leftPath}<->${rightPath}`);
  }
  for (const resource of left.resources) if (right.resources.includes(resource)) conflicts.push(`resource:${resource}`);
  return [...new Set(conflicts)];
}

async function canonicalMutationTarget(path: string, followedLinks = new Set<string>()): Promise<string> {
  const missingSegments: string[] = [];
  let current = path;
  while (true) {
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        if (followedLinks.has(current)) throw new Error(`workspace mutation symlink cycle at ${current}`);
        followedLinks.add(current);
        const target = resolve(dirname(current), await readlink(current), ...missingSegments.reverse());
        return await canonicalMutationTarget(target, followedLinks);
      }
      return resolve(await realpath(current), ...missingSegments.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

function assertCompleteFormalLease(lease: WorkspaceLease): void {
  const hasFormalState = lease.protectedPaths !== undefined
    || lease.formalProtection !== undefined
    || lease.formalContinuationIdentity !== undefined
    || lease.formalWorkspaceRequest !== undefined
    || lease.requestedMode !== undefined
    || lease.cwd !== undefined
    || lease.selector !== undefined
    || lease.jobId !== undefined
    || lease.initialTurnId !== undefined;
  if (!hasFormalState) return;
  const protection = lease.formalProtection;
  const continuation = lease.formalContinuationIdentity;
  const request = lease.formalWorkspaceRequest;
  if (!protection || !continuation || !request || !lease.protectedPaths
    || !lease.requestedMode || !lease.cwd || !lease.selector || !lease.jobId || !lease.initialTurnId) {
    throw new Error(`${lease.agentId}: formal workspace lease protection is incomplete`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(protection.changeId)
    || protection.changeId === "." || protection.changeId === "..") {
    throw new Error(`${lease.agentId}: formal workspace lease change identity is invalid`);
  }
  const expected = [
    `openspec/changes/${protection.changeId}/formal-task-board.md`,
    `openspec/changes/${protection.changeId}/progress.txt`,
  ];
  if (lease.protectedPaths.length !== 2
    || protection.protectedPaths.length !== 2
    || expected.some((path, index) => lease.protectedPaths![index] !== path || protection.protectedPaths[index] !== path)) {
    throw new Error(`${lease.agentId}: formal workspace lease protected paths are inconsistent`);
  }
  if (lease.selector !== request.selector
    || lease.selector !== continuation.canonicalRole
    || lease.requestedMode !== request.mode
    || (lease.requestedMode === "shared" && lease.mode !== "shared")
    || (lease.requestedMode === "isolated" && lease.mode !== "isolated")
    || JSON.stringify(request.writeScope) !== JSON.stringify(continuation.writeScope)) {
    throw new Error(`${lease.agentId}: formal workspace lease role, mode, or write scope is inconsistent`);
  }
}

export class WorkspaceLeaseManager {
  private readonly leases = new Map<string, WorkspaceLease>();
  private readonly observedMutations = new Map<string, string>();

  decide(agentId: string, requested: TaskWorkspaceMode, projectRoot: string, scope: ValidatedWriteScope): WorkspaceDecision {
    assertSafeAgentId(agentId);
    const conflicts = [...this.leases.values()].flatMap((lease) => scopeConflicts(scope, lease.scope));
    const pathConflicts = conflicts.filter((conflict) => conflict.startsWith("path:"));
    const resourceConflicts = conflicts.filter((conflict) => conflict.startsWith("resource:"));
    if (requested === "isolated") {
      if (resourceConflicts.length > 0) throw new Error(`isolated workspace cannot isolate shared resources: ${resourceConflicts.join(", ")}`);
      return { mode: "isolated", reason: "explicit-isolated", diagnostics: [], conflicts };
    }
    if (requested === "shared") {
      if (conflicts.length > 0) throw new Error(`shared workspace scope conflict; retry isolated: ${conflicts.join(", ")}`);
      return { mode: "shared", reason: "explicit-shared", diagnostics: [], conflicts: [] };
    }
    if (!scope.declared) {
      return {
        mode: "shared",
        reason: "undeclared-best-effort",
        diagnostics: ["writeScope is undeclared; shared conflict detection is observable best-effort, not complete containment"],
        conflicts: [],
      };
    }
    if (resourceConflicts.length > 0) throw new Error(`auto workspace cannot isolate shared resources: ${resourceConflicts.join(", ")}`);
    if (pathConflicts.length > 0) return { mode: "isolated", reason: "overlapping-path-scope", diagnostics: ["known path overlap selected isolated workspace"], conflicts };
    return { mode: "shared", reason: "disjoint-known-scope", diagnostics: [], conflicts: [] };
  }

  acquire(lease: WorkspaceLease): void {
    if (this.leases.has(lease.agentId)) throw new Error(`${lease.agentId}: workspace lease already active`);
    assertCompleteFormalLease(lease);
    for (const protectedPath of lease.protectedPaths ?? []) {
      if (!protectedPath || protectedPath !== protectedPath.trim() || isAbsolute(protectedPath)
        || !isInside(lease.root, resolve(lease.root, protectedPath))) {
        throw new Error(`${lease.agentId}: protected workspace path is invalid`);
      }
    }
    const decision = this.decide(lease.agentId, lease.mode, lease.projectRoot, lease.scope);
    if (decision.mode !== lease.mode) throw new Error(`${lease.agentId}: lease mode does not match conflict decision`);
    this.leases.set(lease.agentId, structuredClone(lease));
  }

  release(agentId: string): void {
    this.leases.delete(agentId);
    for (const [key, owner] of this.observedMutations) if (owner === agentId) this.observedMutations.delete(key);
  }

  active(): WorkspaceLease[] {
    return [...this.leases.values()].map((lease) => structuredClone(lease));
  }

  get(agentId: string): WorkspaceLease | undefined {
    const lease = this.leases.get(agentId);
    return lease ? structuredClone(lease) : undefined;
  }

  async assertFileMutation(agentId: string, path: string): Promise<{ allowed: true; diagnostic?: string }> {
    const lease = this.leases.get(agentId);
    if (!lease) throw new Error(`${agentId}: no active workspace lease`);
    await assertNoCredentialMaterial(path, "workspace mutation", lease.root);
    const absolute = resolve(lease.root, path);
    if (!isInside(lease.root, absolute)) throw new Error(`${agentId}: mutation escapes workspace root`);
    const relativePath = relative(lease.root, absolute).replaceAll(sep, "/") || ".";
    const canonicalRoot = await realpath(lease.root);
    const canonicalTarget = await canonicalMutationTarget(absolute);
    if (!isInside(canonicalRoot, canonicalTarget)) throw new Error(`${agentId}: mutation symlink escapes workspace root`);
    const protectedTargets = await Promise.all((lease.protectedPaths ?? [])
      .map(async (protectedPath) => await canonicalMutationTarget(resolve(lease.root, protectedPath))));
    if ((lease.protectedPaths ?? []).includes(relativePath) || protectedTargets.includes(canonicalTarget)) {
      throw new Error(`${agentId}: mutation of the formal task-board owning file is denied`);
    }
    if (lease.scope.declared && lease.scope.paths.length > 0 && !lease.scope.paths.some((declared) => pathsOverlap(declared, relativePath))) {
      throw new Error(`${agentId}: mutation is outside declared writeScope; retry with corrected scope`);
    }
    if (lease.mode === "isolated") return { allowed: true };
    const key = `path:${relative(projectRootOf(lease), absolute).replaceAll(sep, "/")}`;
    const owner = this.observedMutations.get(key);
    if (owner && owner !== agentId) throw new Error(`${agentId}: second conflicting mutation blocked; retry in isolated workspace (owner ${owner})`);
    for (const other of this.leases.values()) {
      if (other.agentId === agentId || other.mode === "isolated") continue;
      if (scopeConflicts({ paths: [relativePath], resources: [], declared: true }, other.scope).length > 0) {
        throw new Error(`${agentId}: mutation conflicts with ${other.agentId}; retry in isolated workspace`);
      }
    }
    this.observedMutations.set(key, agentId);
    return { allowed: true, diagnostic: lease.scope.declared ? undefined : "undeclared write observed and leased best-effort" };
  }

  assertResourceMutation(agentId: string, resource: string): { allowed: true } {
    const lease = this.leases.get(agentId);
    if (!lease) throw new Error(`${agentId}: no active workspace lease`);
    const normalized = normalizeResource(resource);
    if (lease.scope.declared && lease.scope.resources.length > 0 && !lease.scope.resources.includes(normalized)) {
      throw new Error(`${agentId}: resource is outside declared writeScope`);
    }
    const key = `resource:${normalized}`;
    const owner = this.observedMutations.get(key);
    if (owner && owner !== agentId) throw new Error(`${agentId}: second conflicting resource mutation blocked; owner ${owner}`);
    this.observedMutations.set(key, agentId);
    return { allowed: true };
  }
}

export async function persistFormalWorkspaceLease(journal: CoordinatorJournal, lease: FormalWorkspaceLease): Promise<void> {
  await journal.append({
    kind: "workspace.lease",
    agentId: lease.agentId,
    jobId: lease.jobId,
    turnId: lease.initialTurnId,
    payload: { record: lease as unknown as Record<string, unknown> },
  });
}

export function createWorkspaceMutationGuard(manager: WorkspaceLeaseManager, agentId: string): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.on("tool_call", async (event) => {
      if ((event.toolName !== "write" && event.toolName !== "edit") || !event.input || typeof event.input !== "object") return undefined;
      const path = (event.input as Record<string, unknown>).path;
      if (typeof path !== "string") return { block: true, reason: "workspace mutation path is missing" };
      try {
        await manager.assertFileMutation(agentId, path);
        return undefined;
      } catch (error) {
        return { block: true, reason: error instanceof Error ? error.message : String(error) };
      }
    });
  };
}

function projectRootOf(lease: WorkspaceLease): string {
  return lease.mode === "isolated" ? lease.projectRoot : lease.root;
}

async function git(cwd: string, args: string[], allowFailure = false): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFile("git", args, { cwd, encoding: "utf8" });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    if (allowFailure) return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", code: typeof failure.code === "number" ? failure.code : 1 };
    throw new Error(`git ${args.join(" ")} failed: ${(failure.stderr ?? failure.message).trim()}`);
  }
}

export interface IsolatedWorkspaceRecord {
  agentId: string;
  mode: "isolated";
  status: "active" | "finalized" | "cleaned" | "cleanup-failed";
  projectRoot: string;
  root: string;
  branch: string;
  baselineCommit: string;
  resultCommit?: string;
  patchPath?: string;
  mainHead: string;
  mainStatus: string;
  diagnostics: string[];
}

export class GitIsolationAdapter {
  constructor(
    private readonly layout: SidecarLayout,
    private readonly journal: CoordinatorJournal,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(agentId: string, projectRoot: string): Promise<IsolatedWorkspaceRecord> {
    assertSafeAgentId(agentId);
    const canonicalProject = await realpath(projectRoot);
    const top = (await git(canonicalProject, ["rev-parse", "--show-toplevel"])).stdout.trim();
    if (await realpath(top) !== canonicalProject) throw new Error("isolated workspace requires the declared project root to be the Git top-level");
    const mainHead = (await git(canonicalProject, ["rev-parse", "HEAD"])).stdout.trim();
    const mainStatus = (await git(canonicalProject, ["status", "--porcelain=v1", "-z"])).stdout;
    const baselinePatch = (await git(canonicalProject, ["diff", "--binary", "HEAD"])).stdout;
    const untracked = (await git(canonicalProject, ["ls-files", "--others", "--exclude-standard", "-z"])).stdout.split("\0").filter(Boolean);
    const workspacesRoot = resolve(this.layout.root, "workspaces");
    await mkdir(workspacesRoot, { recursive: true, mode: 0o700 });
    const isolatedRoot = resolve(workspacesRoot, agentId);
    if (!isInside(workspacesRoot, isolatedRoot)) throw new Error("isolated workspace path escapes sidecar");
    const branch = `aili-agent/${agentId.toLowerCase()}-${this.clock().getTime()}`;
    const diagnostics: string[] = [];
    let added = false;
    try {
      await git(canonicalProject, ["worktree", "add", "--detach", isolatedRoot, mainHead]);
      added = true;
      await git(isolatedRoot, ["switch", "-c", branch]);
      if (baselinePatch) {
        const baselinePatchPath = resolve(this.layout.patchesDir, `${agentId}.baseline.patch`);
        await writeFile(baselinePatchPath, baselinePatch, { encoding: "utf8", mode: 0o600 });
        await git(isolatedRoot, ["apply", "--whitespace=nowarn", baselinePatchPath]);
      }
      for (const path of untracked) {
        const source = resolve(canonicalProject, path);
        const target = resolve(isolatedRoot, path);
        if (!isInside(canonicalProject, source) || !isInside(isolatedRoot, target)) throw new Error(`untracked path escapes repository: ${path}`);
        const stat = await lstat(source);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`untracked isolation supports real files only: ${path}`);
        await mkdir(resolve(target, ".."), { recursive: true });
        await copyFile(source, target);
      }
      await git(isolatedRoot, ["add", "-A"]);
      await git(isolatedRoot, ["-c", "user.name=AILI Agent", "-c", "user.email=aili-agent@example.invalid", "commit", "--allow-empty", "-m", "AILI projected dirty baseline"]);
      const baselineCommit = (await git(isolatedRoot, ["rev-parse", "HEAD"])).stdout.trim();
      diagnostics.push(`projected ${untracked.length} untracked files and ${baselinePatch ? "a dirty patch" : "no tracked diff"}`);
      const record: IsolatedWorkspaceRecord = {
        agentId,
        mode: "isolated",
        status: "active",
        projectRoot: canonicalProject,
        root: isolatedRoot,
        branch,
        baselineCommit,
        mainHead,
        mainStatus,
        diagnostics,
      };
      await this.put(record);
      return record;
    } catch (error) {
      if (added) await git(canonicalProject, ["worktree", "remove", "--force", isolatedRoot], true);
      throw error;
    }
  }

  async finalize(record: IsolatedWorkspaceRecord): Promise<IsolatedWorkspaceRecord> {
    if (record.status !== "active" && record.status !== "finalized") throw new Error(`${record.agentId}: isolated workspace is not active or finalized`);
    await git(record.root, ["add", "-A"]);
    await git(record.root, ["-c", "user.name=AILI Agent", "-c", "user.email=aili-agent@example.invalid", "commit", "--allow-empty", "-m", `AILI Agent result ${record.agentId}`]);
    const resultCommit = (await git(record.root, ["rev-parse", "HEAD"])).stdout.trim();
    const patch = (await git(record.root, ["diff", "--binary", record.baselineCommit, resultCommit])).stdout;
    const patchPath = resolve(this.layout.patchesDir, `${record.agentId}.patch`);
    await writeFile(patchPath, patch, { encoding: "utf8", mode: 0o600 });
    const currentHead = (await git(record.projectRoot, ["rev-parse", "HEAD"])).stdout.trim();
    const currentStatus = (await git(record.projectRoot, ["status", "--porcelain=v1", "-z"])).stdout;
    if (currentHead !== record.mainHead || currentStatus !== record.mainStatus) {
      throw new Error(`${record.agentId}: main workspace changed during isolation; result preserved but automatic reconciliation is forbidden`);
    }
    const finalized: IsolatedWorkspaceRecord = { ...record, status: "finalized", resultCommit, patchPath };
    await this.put(finalized);
    return finalized;
  }

  async cleanup(record: IsolatedWorkspaceRecord): Promise<IsolatedWorkspaceRecord> {
    if (record.status !== "active" && record.status !== "finalized") throw new Error(`${record.agentId}: isolated workspace cannot be cleaned from ${record.status}`);
    const result = await git(record.projectRoot, ["worktree", "remove", "--force", record.root], true);
    if (result.code !== 0) {
      const failed: IsolatedWorkspaceRecord = { ...record, status: "cleanup-failed", diagnostics: [...record.diagnostics, result.stderr.trim() || "worktree cleanup failed"] };
      await this.put(failed);
      throw new Error(`${record.agentId}: isolated workspace cleanup failed; artifact retained at ${record.root}`);
    }
    const cleaned: IsolatedWorkspaceRecord = { ...record, status: "cleaned" };
    await this.put(cleaned);
    return cleaned;
  }

  assertResumable(agentId: string): IsolatedWorkspaceRecord | undefined {
    const raw = this.journal.getState().workspaces[agentId];
    if (!raw || raw.mode !== "isolated") return undefined;
    const record = raw as unknown as IsolatedWorkspaceRecord;
    if (record.status === "cleaned") throw new Error(`${agentId}: isolated workspace was cleaned; transcript/output remain readable but Agent cannot revive`);
    if (record.status === "cleanup-failed") throw new Error(`${agentId}: isolated workspace cleanup failed; resolve retained artifact before revive`);
    return structuredClone(record);
  }

  async restore(agentId: string): Promise<IsolatedWorkspaceRecord> {
    const record = this.assertResumable(agentId);
    if (!record) throw new Error(`${agentId}: isolated workspace journal record is missing; shared fallback is forbidden`);
    if (record.status !== "active" && record.status !== "finalized") {
      throw new Error(`${agentId}: isolated workspace cannot revive from ${record.status}; shared fallback is forbidden`);
    }
    const [projectRoot, workspaceRoot] = await Promise.all([realpath(record.projectRoot), realpath(record.root)]).catch((error) => {
      throw new Error(`${agentId}: isolated workspace paths are unavailable; shared fallback is forbidden (${error instanceof Error ? error.message : String(error)})`);
    });
    if (projectRoot !== record.projectRoot || workspaceRoot !== record.root) {
      throw new Error(`${agentId}: isolated workspace canonical root changed; shared fallback is forbidden`);
    }
    const [projectTop, workspaceTop, branch, head] = await Promise.all([
      git(projectRoot, ["rev-parse", "--show-toplevel"]),
      git(workspaceRoot, ["rev-parse", "--show-toplevel"]),
      git(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      git(workspaceRoot, ["rev-parse", "HEAD"]),
    ]).catch((error) => {
      throw new Error(`${agentId}: isolated workspace Git identity cannot be verified; shared fallback is forbidden (${error instanceof Error ? error.message : String(error)})`);
    });
    if (await realpath(projectTop.stdout.trim()) !== projectRoot
      || await realpath(workspaceTop.stdout.trim()) !== workspaceRoot
      || branch.stdout.trim() !== record.branch) {
      throw new Error(`${agentId}: isolated workspace Git root or branch identity changed; shared fallback is forbidden`);
    }
    const expectedHead = record.status === "finalized" ? record.resultCommit : undefined;
    if (expectedHead && head.stdout.trim() !== expectedHead) {
      throw new Error(`${agentId}: finalized isolated workspace result commit changed; shared fallback is forbidden`);
    }
    const ancestor = await git(workspaceRoot, ["merge-base", "--is-ancestor", record.baselineCommit, "HEAD"], true);
    if (ancestor.code !== 0) throw new Error(`${agentId}: isolated workspace baseline is not an ancestor; shared fallback is forbidden`);
    return record;
  }

  private async put(record: IsolatedWorkspaceRecord): Promise<void> {
    await this.journal.append({ kind: "workspace.put", agentId: record.agentId, payload: record as unknown as Record<string, unknown> });
  }
}
