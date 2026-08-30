import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { listLocalBranches } from "@/lib/git-branches";

/** Local branch listing for the changes page's branch switcher (read-only). */
export async function GET(request: NextRequest) {
  try {
    const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
    if (!cwd.startsWith("/")) return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });

    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { current, branches } = await listLocalBranches(cwd);
    return NextResponse.json({ current, branches }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not a git repository|no such file or directory/i.test(message)) {
      return NextResponse.json({ error: "not a git repository" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
