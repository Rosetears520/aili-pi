import { NextResponse } from "next/server";
import { homedir } from "node:os";
import { isWsl, wslDistroName, wslWindowsDriveMounts } from "@/lib/allowed-roots";

/**
 * Server environment facts the file picker and paste normalization need:
 * whether this is WSL (and which distribution), the server home directory,
 * and the Windows drive mounts available under the unified file policy.
 */
export async function GET() {
  const wsl = isWsl();
  return NextResponse.json({
    wsl,
    distro: wsl ? wslDistroName() : null,
    home: homedir(),
    windowsMounts: wsl ? wslWindowsDriveMounts() : [],
  }, { headers: { "Cache-Control": "no-store" } });
}
