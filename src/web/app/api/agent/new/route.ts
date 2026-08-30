import { NextResponse } from "next/server";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { requireAiliWebBffBridge } from "@/server/private-bff-bridge";

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

// POST /api/agent/new — retained URL, Gateway-owned creation.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; type?: unknown; toolNames?: unknown; provider?: unknown; modelId?: unknown; thinkingLevel?: unknown };
    if (body.type !== "ensure_session") return NextResponse.json({ error: "New-session creation only accepts ensure_session" }, { status: 400 });
    if (typeof body.cwd !== "string" || !body.cwd) return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    if ((body.provider === undefined) !== (body.modelId === undefined)) return NextResponse.json({ error: "provider and modelId must be provided together" }, { status: 400 });
    if (body.toolNames !== undefined && (!Array.isArray(body.toolNames) || !body.toolNames.every((value) => typeof value === "string"))) {
      return NextResponse.json({ error: "toolNames are invalid" }, { status: 400 });
    }
    if (body.thinkingLevel !== undefined && (typeof body.thinkingLevel !== "string" || !THINKING_LEVELS.has(body.thinkingLevel as ThinkingLevel))) {
      return NextResponse.json({ error: "thinkingLevel is invalid" }, { status: 400 });
    }
    const bridge = requireAiliWebBffBridge();
    if (!bridge.createCompatibilitySession) return NextResponse.json({ error: "Runtime Gateway session creation is unavailable" }, { status: 503 });
    const result = await bridge.createCompatibilitySession({
      host: req.headers.get("host") ?? undefined,
      origin: req.headers.get("origin") ?? undefined,
      cookie: req.headers.get("cookie") ?? undefined,
      cwd: body.cwd,
      ...(body.toolNames ? { toolNames: body.toolNames as string[] } : {}),
      ...(typeof body.provider === "string" ? { provider: body.provider } : {}),
      ...(typeof body.modelId === "string" ? { modelId: body.modelId } : {}),
      ...(typeof body.thinkingLevel === "string" ? { thinkingLevel: body.thinkingLevel } : {}),
    });
    return NextResponse.json(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
