import { NextRequest, NextResponse } from "next/server";
import { openInSystemExplorer } from "@/lib/directory-browser";

// POST /api/cwd/open { path }：用宿主机原生资源管理器打开一个已存在的目录。
// Windows 与 WSL 都打开 Windows 资源管理器（WSL 先经 wslpath -w 翻译成
// \\wsl$\… UNC 路径），macOS 打开 Finder，其他 Linux 走 xdg-open。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { path?: unknown } | null;
    const requested = typeof body?.path === "string" ? body.path.trim() : "";
    if (!requested) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }
    const result = await openInSystemExplorer(requested);
    return NextResponse.json({
      status: "opened",
      path: result.path,
      via: result.via,
      label: result.label,
      ...(result.windowsPath === undefined ? {} : { windowsPath: result.windowsPath }),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
