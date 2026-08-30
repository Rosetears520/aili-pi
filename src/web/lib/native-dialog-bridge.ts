import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter as pathDelimiter } from "node:path";

// ---------------------------------------------------------------------------
// 原生对话框共享桥：文件与目录两个选择器共用同一条进程管线。统一要点：
// - PowerShell 脚本一律走 -EncodedCommand（UTF-16LE Base64），彻底避开
//   引号/换行在 WSL 互通编组时的歧义；
// - 脚本首行强制 [Console]::OutputEncoding = UTF8（中文 Windows 默认按
//   OEM/GBK 写管道，含中文的路径会变乱码）；
// - stdout/stderr 攒齐 Buffer 后一次性按 UTF-8 解码（逐块拼接会把跨块的
//   多字节字符切碎）并去 BOM；
// - 单实例替换语义：同一时刻只保留一个活动对话框进程，新请求终止上一
//   个，被藏起来或遗忘的对话框不会卡死端点直到超时。
// ---------------------------------------------------------------------------

const dialogProcessGlobal = globalThis as {
  __ailiNativeDialogChild?: ChildProcess | null;
};

export function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(pathDelimiter)) {
    if (!dir) continue;
    const candidate = `${dir.replace(/\/+$/, "")}/${name}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 定位 powershell.exe：先 PATH 查找，回退 Windows 固定路径（WSL 互通）。 */
export function powershellExecutable(fallback = "powershell.exe"): string {
  const direct = findOnPath("powershell.exe");
  if (direct) return direct;
  for (const candidate of [
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
    "/mnt/c/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe",
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return fallback;
}

export interface DialogProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** 运行一个原生对话框进程（单实例替换语义见文件头注释）。 */
export function runDialogProcess(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<DialogProcessResult> {
  return new Promise((resolve, reject) => {
    dialogProcessGlobal.__ailiNativeDialogChild?.kill();
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    dialogProcessGlobal.__ailiNativeDialogChild = child;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => { stdoutChunks.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderrChunks.push(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (dialogProcessGlobal.__ailiNativeDialogChild === child) dialogProcessGlobal.__ailiNativeDialogChild = null;
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (dialogProcessGlobal.__ailiNativeDialogChild === child) dialogProcessGlobal.__ailiNativeDialogChild = null;
      const decode = (chunks: Buffer[]): string =>
        Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
      resolve({ stdout: decode(stdoutChunks), stderr: decode(stderrChunks), code });
    });
  });
}

/** 以 -EncodedCommand 运行 PowerShell 对话框脚本（调用方保证脚本设置 UTF-8 输出）。 */
export async function runPowerShellDialogScript(script: string, timeoutMs: number): Promise<DialogProcessResult> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return await runDialogProcess(
    powershellExecutable(),
    ["-NoProfile", "-STA", "-NonInteractive", "-EncodedCommand", encoded],
    timeoutMs,
  );
}
