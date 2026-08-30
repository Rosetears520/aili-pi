import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { translateConfigurationRoute } from "@/server/configuration-route-facade";

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

// Retained URL: translation only. Runtime Gateway owns the private atomic write.
export async function PUT(request: Request) {
  return translateConfigurationRoute(
    request,
    "keybinds.configure",
    "replace",
    (body) => ({ bindings: body }),
    () => 500,
  );
}
