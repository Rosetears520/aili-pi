import { NextRequest, NextResponse } from "next/server";
import { isAbsolute } from "node:path";
import { getAllowedFileRoots, isExistingFilePathAllowed, isWindowsAbsolutePath } from "@/lib/file-access";
// Backend pending (drift-log D-2026-08-20-7): the adapter's config functions
// ship as raw TypeScript behind a restrictive exports map; bundling the deep
// import into the Next server needs a BFF-side placement (strip-types
// process) instead of the webpack graph. Until then the panel reports the
// backend as pending instead of half-working.
const listMcpPanelServers = undefined as never;
const setMcpPanelServerDisabled = undefined as never;

// MCP management panel endpoints (webui-mcp-management): config-layer truth
// only — per-server identity + disabled state, toggles persisted through the
// adapter's own project-layer writer. No server definitions, commands, args,
// env, or credentials are ever returned. Config changes apply on session
// reload (adapter semantics); the panel must not claim live restarts.

export async function GET() {
  return NextResponse.json(
    { error: "MCP config backend pending: the adapter config layer is not yet wired into the web server process (see openspec drift-log D-2026-08-20-7)" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "MCP config backend pending: the adapter config layer is not yet wired into the web server process (see openspec drift-log D-2026-08-20-7)" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
