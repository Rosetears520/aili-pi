import { NextRequest, NextResponse } from "next/server";
import { isAbsolute } from "node:path";
import { listMcpPanelServers, setMcpPanelServerDisabled } from "@/lib/mcp-panel-access";
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
    const list = listMcpPanelServers(undefined, cwd);
    return NextResponse.json({ ...list, reloadHint: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: `mcp config unavailable: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: { cwd?: unknown; name?: unknown; disabled?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const cwd = typeof body.cwd === "string" ? body.cwd.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  if (!cwd || (!isAbsolute(cwd) && !isWindowsAbsolutePath(cwd))) {
    return NextResponse.json({ error: "cwd must be an absolute path" }, { status: 400 });
  }
  if (typeof body.disabled !== "boolean") {
    return NextResponse.json({ error: "disabled must be a boolean" }, { status: 400 });
  }
  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return NextResponse.json({ error: "cwd is outside the allowed roots" }, { status: 403 });
  }
  try {
    const result = setMcpPanelServerDisabled(undefined, cwd, name, body.disabled);
    const list = listMcpPanelServers(undefined, cwd);
    return NextResponse.json({ ...result, servers: list.servers, reloadHint: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
