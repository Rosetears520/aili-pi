import { NextRequest, NextResponse } from "next/server";
import { isAbsolute } from "node:path";
import { listMcpPanelServers } from "@/lib/mcp-panel-access";
import { translateConfigurationRoute } from "@/server/configuration-route-facade";
import { readMcpRuntimeSnapshot } from "../../../../runtime/mcp-runtime-store.ts";
import { getAllowedFileRoots, isExistingFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
export async function GET(request: NextRequest) {
  const cwd = request.nextUrl.searchParams.get("cwd")?.trim() ?? "";
  if (!cwd || (!isAbsolute(cwd) && !isWindowsAbsolutePath(cwd))) {
    return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
  }
  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return NextResponse.json({ error: "cwd is outside the allowed roots" }, { status: 403 });
  }
  try {
    const list = listMcpPanelServers(cwd);
    return NextResponse.json({ ...list, runtime: readMcpRuntimeSnapshot(), reloadHint: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: `mcp config unavailable: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

// Retained URL: translation only. Runtime Gateway is the sole mutation owner.
export async function PATCH(request: NextRequest) {
  return translateConfigurationRoute(request, "mcp.configure", "set_disabled", undefined, () => 400);
}
