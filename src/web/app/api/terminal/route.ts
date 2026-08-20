import { NextRequest, NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
import { getTerminalManager, TERMINAL_WS_PATH } from "@/lib/terminal-manager";

// Issue a terminal session for the user's own shell (webui-user-terminal).
// The HTTP layer performs the same path admission as every other mutating
// route (absolute cwd inside allowed roots), and the transport itself is
// loopback-only in v1: served over a non-loopback host the route fails closed
// so the WebSocket port can never become a side channel around the main
// server's authentication boundary.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export async function GET(request: NextRequest) {
  const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
  if (!cwd || (!cwd.startsWith("/") && !isWindowsAbsolutePath(cwd))) {
    return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
  }

  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").trim();
  if (!LOOPBACK_HOSTS.has(hostname)) {
    return NextResponse.json(
      { error: "terminal is available on loopback hosts only" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const allowedRoots = await getAllowedFileRoots();
    if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
      return NextResponse.json({ error: "cwd is outside the allowed roots" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "failed to resolve allowed roots" }, { status: 500 });
  }

  try {
    const info = getTerminalManager().ensureToken();
    return NextResponse.json(
      { path: info.path, token: info.token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: `terminal unavailable: ${error instanceof Error ? error.message : String(error)}` },
      { status: 503 },
    );
  }
}
