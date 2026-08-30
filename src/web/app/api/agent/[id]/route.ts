import { NextResponse } from "next/server";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession } from "@/lib/rpc-manager";
import { isGatewayAgentMutation, isReadOnlyAgentCommand } from "@/lib/agent-client";
import { requireAiliWebBffBridge } from "@/server/private-bff-bridge";

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let commandType: string | undefined;
  let promptAccepted = false;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };
    commandType = typeof body.type === "string" ? body.type : undefined;

    if (isGatewayAgentMutation(body)) {
      const bridge = requireAiliWebBffBridge();
      if (!bridge.dispatchCompatibilityMutation) {
        return NextResponse.json({ error: "Runtime Gateway compatibility facade is unavailable" }, { status: 503 });
      }
      const result = await bridge.dispatchCompatibilityMutation({
        kind: "agent.command",
        resourceId: id,
        host: req.headers.get("host") ?? undefined,
        origin: req.headers.get("origin") ?? undefined,
        cookie: req.headers.get("cookie") ?? undefined,
        arguments: { command: body },
      });
      const failed = result.status < 200 || result.status >= 300;
      if (failed) {
        const detail = result.body as { error?: string; reason?: string };
        return NextResponse.json({
          error: detail.error ?? detail.reason ?? "Gateway mutation failed",
          ...(body.type === "prompt" ? { code: "prompt_rejected", accepted: false } : {}),
        }, { status: result.status, headers: result.headers });
      }
      promptAccepted = body.type === "prompt";
      const mutation = result.body as { result?: unknown };
      return NextResponse.json({ success: true, data: mutation.result ?? null }, { headers: result.headers });
    }

    if (!isReadOnlyAgentCommand(body)) {
      return NextResponse.json({ error: "Unsupported direct Agent command" }, { status: 400 });
    }

    // Explicitly read-only compatibility commands retain the upstream RPC
    // response shape. Unknown or newly added mutations fail closed above.
    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      promptAccepted = body.type === "prompt";
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({
        error: "Session not found",
        ...(body.type === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 404 });
    }

    const { session } = await startRpcSession(id, filePath, undefined);
    const result = await session.send(body);
    promptAccepted = body.type === "prompt";

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return NextResponse.json({ running: false });
    }

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
