import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mergeKeybinds } from "@/lib/aili-keybinds";

function keybindsPath(): string {
  return join(getAgentDir(), "aili-web-keybinds.json");
}

export async function GET() {
  try {
    const raw = await readFile(keybindsPath(), "utf8");
    return NextResponse.json(JSON.parse(raw), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid-json" }, { status: 400 }); }
  const merged = mergeKeybinds(body);
  try {
    await writeFile(keybindsPath(), `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    return NextResponse.json({ error: `keybind persistence failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
  return NextResponse.json(merged, { headers: { "Cache-Control": "no-store" } });
}
