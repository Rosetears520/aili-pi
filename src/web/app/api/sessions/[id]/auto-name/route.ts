import { NextResponse } from "next/server";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { requireAiliWebBffBridge } from "@/server/private-bff-bridge";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const bridge = requireAiliWebBffBridge();
    if (!bridge.dispatchCompatibilityMutation) {
      return NextResponse.json({ error: "Runtime Gateway compatibility facade is unavailable" }, { status: 503 });
    }
    const result = await bridge.dispatchCompatibilityMutation({
      kind: "session.auto_name",
      resourceId: id,
      host: req.headers.get("host") ?? undefined,
      origin: req.headers.get("origin") ?? undefined,
      cookie: req.headers.get("cookie") ?? undefined,
      arguments: {},
    });
    if (result.status >= 200 && result.status < 300) {
      const generated = (result.body as { result?: { title?: unknown; usage?: unknown } }).result;
      if (!generated || typeof generated.title !== "string") {
        return NextResponse.json({ error: "Runtime Gateway returned an invalid session title" }, { status: 502 });
      }
      invalidateSessionListCache();
      return NextResponse.json({ title: generated.title, usage: generated.usage ?? null }, { status: result.status, headers: result.headers });
    }
    const failure = result.body as { error?: unknown; reason?: unknown };
    return NextResponse.json({
      error: typeof failure.error === "string"
        ? failure.error
        : typeof failure.reason === "string"
          ? failure.reason
          : "Runtime Gateway title generation failed",
    }, { status: result.status, headers: result.headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
