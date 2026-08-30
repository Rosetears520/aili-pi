import { NextRequest, NextResponse } from "next/server";
import { pickSystemDirectory } from "@/lib/directory-browser";

// POST /api/cwd/pick { initialDirectory?: string }：弹出宿主机原生目录
// 选择对话框并等待用户选择。Windows 与 WSL 都使用 Windows 原生对话框
// （Vista 风格，可见 Linux/WSL 节点）；选中的路径会翻译成服务端路径。
// 用户取消返回 { status: "cancelled" }，不报错。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { initialDirectory?: unknown } | null;
    const initialDirectory = typeof body?.initialDirectory === "string" && body.initialDirectory.trim()
      ? body.initialDirectory.trim()
      : undefined;
    const result = await pickSystemDirectory({ initialDirectory });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
