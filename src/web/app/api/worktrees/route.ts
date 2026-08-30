import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { findCurrentWorktreePath, listWorktrees, resolveProject } from "@/lib/worktree";
import { allowFileRoot, getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed } from "@/lib/file-access";
import { projectIdentityKey } from "@/lib/project-identity";
import { rejectCompatibilityMutation } from "@/lib/compatibility-mutation";

/** Same gate as /api/files: only session cwds / project roots / explicitly
 *  allowed dirs may be inspected through this compatibility endpoint. */
async function checkCwdAllowed(cwd: string): Promise<NextResponse | null> {
  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots) || !isExistingFilePathAllowed(cwd, allowedRoots)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  return null;
}

// GET /api/worktrees?cwd=  →  { projectRoot, projectKey, isGit, isTopLevel, currentWorktreePath, worktrees }
export async function GET(req: Request) {
  try {
    const cwd = new URL(req.url).searchParams.get("cwd");
    if (!cwd) {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    const denied = await checkCwdAllowed(cwd);
    if (denied) return denied;

    const project = await resolveProject(cwd);
    let worktrees: Awaited<ReturnType<typeof listWorktrees>> = [];
    let currentWorktreePath: string | null = null;
    let isGit = true;
    try {
      // For a removed-worktree cwd (session of a deleted worktree), fall back
      // to the inferred project root so the switcher still shows the project.
      worktrees = await listWorktrees(existsSync(cwd) ? cwd : project.projectRoot);
      currentWorktreePath = findCurrentWorktreePath(worktrees, cwd);
    } catch {
      isGit = false;
    }
    // Every listed path is a git-verified worktree of this project; allow the
    // file explorer to browse them even before they have any session (the
    // in-memory allowlist from addWorktree does not survive server restarts).
    for (const w of worktrees) allowFileRoot(w.path);
    return NextResponse.json({
      projectRoot: project.projectRoot,
      projectKey: projectIdentityKey(project.projectRoot),
      isGit,
      isTopLevel: project.isTopLevel,
      currentWorktreePath,
      worktrees,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// These retained UI URLs cannot construct the opaque handle + writer lease
// required by the existing Gateway contracts. Never fall back to direct Git.
export async function POST() {
  return rejectCompatibilityMutation("/api/worktrees POST", "worktree-add");
}

export async function DELETE() {
  return rejectCompatibilityMutation("/api/worktrees DELETE", "worktree-remove");
}
