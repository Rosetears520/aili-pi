import { NextRequest, NextResponse } from "next/server";
import { openSync, readSync, closeSync, fstatSync } from "node:fs";
import { resolveSessionPath } from "@/lib/session-reader";

const CHUNK_BYTES = 1_048_576;
const MAX_SCAN_BYTES = 16 * CHUNK_BYTES;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

interface PermModeEntry {
  readonly type?: unknown;
  readonly customType?: unknown;
  readonly data?: { mode?: unknown } | null;
}

function permModeFromLine(line: string | undefined): string | null {
  const text = line?.trim();
  if (!text || !text.includes("perm-mode")) return null;
  try {
    const entry = JSON.parse(text) as PermModeEntry;
    if (entry?.type === "custom" && entry?.customType === "perm-mode") {
      const mode = entry.data?.mode;
      if (typeof mode === "string" && mode) return mode;
    }
  } catch { /* not JSON or different shape */ }
  return null;
}

/** Chunked backward scan for the session's most recent `perm-mode` journal entry. */
function readLastPermMode(filePath: string): string | null {
  const fd = openSync(filePath, "r");
  try {
    const size = fstatSync(fd).size;
    const scanLimit = Math.min(size, MAX_SCAN_BYTES);
    let fileEnd = size;
    let carry = "";
    while (fileEnd > size - scanLimit) {
      const length = Math.min(CHUNK_BYTES, fileEnd - (size - scanLimit));
      const start = fileEnd - length;
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, start);
      const chunk = buffer.toString("utf8");
      // The chunk's first line may be cut mid-record; carry it into the next
      // (earlier) chunk unless we are at the file's start.
      const atFileStart = start === 0;
      const body = atFileStart ? chunk + carry : chunk;
      const cut = atFileStart ? 0 : body.indexOf("\n") + 1;
      const scannable = body.slice(cut);
      carry = body.slice(0, cut);
      const lines = scannable.split("\n");
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const mode = permModeFromLine(lines[index]);
        if (mode) return mode;
      }
      if (atFileStart) return permModeFromLine(carry.split("\n")[0]) ?? null;
      fileEnd = start;
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * Journal seed for the web mode chip: the last permission mode recorded in the
 * session file, used only for display until the extension reports its status.
 */
export async function GET(request: NextRequest) {
  const session = request.nextUrl.searchParams.get("session")?.trim() ?? "";
  if (!SESSION_ID_PATTERN.test(session)) {
    return NextResponse.json({ error: "invalid session id" }, { status: 400 });
  }
  try {
    const filePath = await resolveSessionPath(session);
    if (!filePath) return NextResponse.json({ mode: null }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ mode: readLastPermMode(filePath) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
