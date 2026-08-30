import { NextResponse } from "next/server";
import { getRpcSession, startRpcSession } from "@/lib/rpc-manager";
import { resolveSessionPath } from "@/lib/session-reader";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // ?attach=1 asks the server to spin up the agent session for an idle
  // (file-only) session so full state — context usage, extension statuses,
  // system prompt — is available on open, not only after the first message.
  // The started session recycles itself after the normal idle timeout.
  const attach = new URL(req.url).searchParams.has("attach");
  try {
    const rpc = getRpcSession(id);
    if (rpc?.isAlive()) {
      const state = await rpc.send({ type: "get_state" });
      return NextResponse.json({ running: true, state });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (attach) {
      try {
        const { session } = await startRpcSession(id, filePath, undefined);
        const state = await session.send({ type: "get_state" });
        return NextResponse.json({ running: true, state });
      } catch {
        // Fall through to the idle response if the session cannot start.
      }
    }
    return NextResponse.json({ running: false });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
