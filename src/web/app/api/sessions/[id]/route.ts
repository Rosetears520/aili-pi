import { NextResponse } from "next/server";
import { existsSync, statSync } from "fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  resolveSessionPath,
  resolveSessionIdByPath,
  invalidateSessionListCache,
  buildSessionContext,
} from "@/lib/session-reader";
import { getRpcSession } from "@/lib/rpc-manager";
import { projectTreeForResponse } from "@/lib/project-tree";
import { computeSessionTotalActiveMs } from "@/lib/session-timing";
import { requireAiliWebBffBridge } from "@/server/private-bff-bridge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const rpc = getRpcSession(id);
    const liveRpc = rpc?.isAlive() ? rpc : undefined;
    const resolvedPath = liveRpc ? null : await resolveSessionPath(id);
    if (!liveRpc && !resolvedPath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sm = liveRpc?.inner.sessionManager ?? SessionManager.open(resolvedPath!);
    const filePath = liveRpc?.sessionFile || sm.getSessionFile() || resolvedPath || "";
    const entries = sm.getEntries();
    const leafId = sm.getLeafId();
    const tree = projectTreeForResponse(sm.getTree());
    const searchParams = new URL(req.url).searchParams;
    const deferThinking = searchParams.has("deferThinking");
    const deferToolResultImages = searchParams.has("deferMedia");
    const context = buildSessionContext(entries as never, leafId, { deferThinking, deferToolResultImages });
    const totalActiveMs = computeSessionTotalActiveMs(entries);

    const header = sm.getHeader();
    let modified = header?.timestamp ?? new Date().toISOString();
    try { modified = statSync(filePath).mtime.toISOString(); } catch { /* use header timestamp */ }
    const parentSessionId = header?.parentSession
      ? await resolveSessionIdByPath(header.parentSession)
      : undefined;
    const info = header ? {
      path: filePath,
      id: header.id,
      cwd: header.cwd ?? "",
      name: sm.getSessionName(),
      created: header.timestamp,
      modified,
      messageCount: context.messages.length,
      firstMessage: context.messages.find((m) => m.role === "user")
        ? (() => {
            const msg = context.messages.find((m) => m.role === "user")!;
            const c = (msg as { content: unknown }).content;
            return typeof c === "string" ? c : (Array.isArray(c) ? (c.find((b: { type: string }) => b.type === "text") as { text: string } | undefined)?.text ?? "" : "") || "(no messages)";
          })()
        : "(no messages)",
      parentSessionId,
      transient: !filePath || !existsSync(filePath),
    } : null;

    return NextResponse.json({
      sessionId: id,
      filePath,
      info,
      leafId,
      tree,
      context,
      totalActiveMs,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// PATCH /api/sessions/[id]  body: { name: string }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { name } = await req.json() as { name?: string };
    if (typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const bridge = requireAiliWebBffBridge();
    if (!bridge.dispatchCompatibilityMutation) {
      return NextResponse.json({ error: "Runtime Gateway compatibility facade is unavailable" }, { status: 503 });
    }
    const result = await bridge.dispatchCompatibilityMutation({
      kind: "session.rename",
      resourceId: id,
      host: req.headers.get("host") ?? undefined,
      origin: req.headers.get("origin") ?? undefined,
      cookie: req.headers.get("cookie") ?? undefined,
      arguments: { name },
    });
    if (result.status >= 200 && result.status < 300) invalidateSessionListCache();
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/sessions/[id]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const bridge = requireAiliWebBffBridge();
    if (!bridge.dispatchCompatibilityMutation) {
      return NextResponse.json({ error: "Runtime Gateway compatibility facade is unavailable" }, { status: 503 });
    }
    const result = await bridge.dispatchCompatibilityMutation({
      kind: "session.delete",
      resourceId: id,
      host: req.headers.get("host") ?? undefined,
      origin: req.headers.get("origin") ?? undefined,
      cookie: req.headers.get("cookie") ?? undefined,
      arguments: {},
    });
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
