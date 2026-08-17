import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

/**
 * Per-file add/remove counts for a comparison scope, from Git numstat
 * aggregation only — file contents are never read. Paths in the response are
 * repository-root relative; binary or otherwise unmeasurable files report -1.
 */
export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
    const scope = request.nextUrl.searchParams.get("scope")?.trim() ?? "working";
    if (!cwd.startsWith("/")) return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
    if (scope !== "working" && scope !== "upstream") return NextResponse.json({ error: "scope must be working or upstream" }, { status: 400 });

    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const repositoryRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    if (!repositoryRoot) return NextResponse.json({ error: "not a git repository" }, { status: 400 });

    const ref = scope === "working" ? "HEAD" : "@{u}";
    const output = await git(repositoryRoot, ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--numstat", "-z", ref]);
    const stats: Record<string, { a: number; d: number }> = {};
    for (const token of output.split("\0")) {
      if (!token) continue;
      const parts = token.split("\t");
      if (parts.length < 3) continue;
      const added = Number(parts[0]);
      const deleted = Number(parts[1]);
      stats[parts.slice(2).join("\t")] = {
        a: Number.isInteger(added) && added >= 0 ? added : -1,
        d: Number.isInteger(deleted) && deleted >= 0 ? deleted : -1,
      };
    }
    return NextResponse.json({ repositoryRoot, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no upstream configured") || message.includes("no configured upstream")) {
      return NextResponse.json({ available: false, reason: "no-upstream" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
