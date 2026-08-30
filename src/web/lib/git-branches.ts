import { execFile } from "child_process";
import { promisify } from "util";
import { invalidateProjectCache } from "./worktree";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
    // Pin the message locale so refusal texts (dirty-worktree detection in the
    // checkout route) stay matchable regardless of system language.
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

export interface GitBranches {
  /** Checked-out branch of the cwd, null for detached HEAD or non-git dirs */
  readonly current: string | null;
  /** All local branch names, alphabetical */
  readonly branches: readonly string[];
}

/** Pure parser: for-each-ref `%(refname:short)` lines → sorted unique names. */
export function parseBranchListing(forEachRefOutput: string): string[] {
  const names = new Set<string>();
  for (const line of forEachRefOutput.split("\n")) {
    const name = line.trim();
    if (name) names.add(name);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

/** `rev-parse --abbrev-ref HEAD` output → branch name, or null when detached. */
export function parseCurrentBranch(abbrevRefOutput: string): string | null {
  const ref = abbrevRefOutput.trim();
  return ref && ref !== "HEAD" ? ref : null;
}

/** Local branches of the repository containing cwd; throws for non-git dirs. */
export async function listLocalBranches(cwd: string): Promise<GitBranches> {
  const [refOutput, listOutput] = await Promise.all([
    git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(cwd, ["for-each-ref", "refs/heads", "--format=%(refname:short)"]),
  ]);
  return {
    current: parseCurrentBranch(refOutput),
    branches: parseBranchListing(listOutput),
  };
}

/**
 * Switch the worktree containing cwd to an existing LOCAL branch via
 * `git switch`. Dirty trees follow git's default: changes are carried when
 * safe and the switch is refused (throwing git's stderr) when it would
 * overwrite them. Never forces, discards, creates branches, or tracks remotes.
 */
export async function switchBranch(cwd: string, branch: string): Promise<void> {
  const name = branch.trim();
  if (!name || name.startsWith("-") || name.includes("..") || /[\s~^:?*[\\\u0000]/.test(name)) {
    throw new Error("Invalid branch name");
  }
  try {
    await git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
  } catch {
    throw new Error(`No local branch named '${name}'`);
  }
  try {
    await git(cwd, ["switch", "--", name]);
  } catch (error) {
    throw new Error(extractGitError(error));
  }
  // Branch labels are cached per cwd; a switch must be visible immediately.
  invalidateProjectCache();
}

function extractGitError(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr;
  if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
  return error instanceof Error ? error.message : String(error);
}
