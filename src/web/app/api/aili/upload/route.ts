import { NextRequest, NextResponse } from "next/server";
import { storeAttachment, validSessionId } from "@/lib/attachment-store";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function capMessage(): string {
  return `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB copy limit for pasted/dropped files — open it with the Plus button's native file dialog instead to reference the original by path.`;
}

/**
 * Stores one pasted/dropped file (whose local path the browser never reveals)
 * in the session attachment cache and returns its absolute path. The file is
 * referenced by path afterwards — its contents never enter the model context
 * directly. Native-dialog and @ selections bypass this endpoint entirely.
 */
export async function POST(request: NextRequest) {
  const rawName = request.nextUrl.searchParams.get("name") ?? "file";
  const rawSession = request.nextUrl.searchParams.get("session");
  const session = validSessionId(rawSession) ? rawSession : null;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isInteger(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: capMessage() }, { status: 413 });
  }
  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: capMessage() }, { status: 413 });
    }
    const stored = await storeAttachment(buffer, rawName, session);
    return NextResponse.json({ path: stored.path, scope: stored.scope }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
