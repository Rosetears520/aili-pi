import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;
const MAX_PATCH_CHARS = 800_000;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

/**
 * Read-only local-versus-upstream comparison: ahead/behind counts versus the
 * configured upstream branch, plus the changed-file list (repo-root-relative
 * names + status) and, when a path is requested, that file's actual unified
 * patch. Never fetches or mutates.
 */
export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
    const path = request.nextUrl.searchParams.get("path")?.trim() ?? "";
    if (!cwd.startsWith("/")) return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });

    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const repositoryRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    if (!repositoryRoot) return NextResponse.json({ error: "not a git repository" }, { status: 400 });

    let upstream: string | null = null;
    try {
      upstream = (await git(repositoryRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])).trim() || null;
    } catch { /* no upstream configured */ }
    if (!upstream) {
      return NextResponse.json({ available: false, reason: "no-upstream", repositoryRoot }, { headers: { "Cache-Control": "no-store" } });
    }

    const counts = (await git(repositoryRoot, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`])).trim().split(/\s+/);
    const behind = Number(counts[0] ?? 0);
    const ahead = Number(counts[1] ?? 0);

    const nameStatus = await git(repositoryRoot, ["diff", "--no-ext-diff", "--no-textconv", "--name-status", "-z", upstream]);
    const entries: Array<{ file: string; status: string }> = [];
    const tokens = nameStatus.split("\0").filter(Boolean);
    for (let index = 0; index + 1 < tokens.length; index += 2) {
      entries.push({ status: tokens[index], file: tokens[index + 1] });
    }

    let patch: string | undefined;
    let truncated = false;
    if (path) {
      if (!entries.some((entry) => entry.file === path) && !isExistingFilePathAllowed(`${repositoryRoot}/${path}`, allowedRoots)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      const diff = await git(repositoryRoot, ["diff", "--no-ext-diff", "--no-textconv", "--unified=3", upstream, "--", path]);
      if (diff.length > MAX_PATCH_CHARS) {
        patch = diff.slice(0, MAX_PATCH_CHARS);
        truncated = true;
      } else {
        patch = diff;
      }
    }

    return NextResponse.json({
      available: true,
      repositoryRoot,
      upstream,
      ahead,
      behind,
      files: entries,
      ...(path ? { path: { file: path, patch, truncated } } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
