import { readdir, realpath, stat } from "fs/promises";
import { homedir } from "os";
import path from "path";

export interface BrowsableDirectory {
  name: string;
  path: string;
}

export function shouldShowWindowsDrivePicker(
  directory?: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "win32" && !directory;
}

export function getBrowseStartDirectory(directory?: string): string {
  return directory || homedir();
}

export function getWindowsDriveCandidates(): BrowsableDirectory[] {
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => ({
    name: `${letter}:`,
    path: `${letter}:\\`,
  }));
}

export async function listWindowsDrives(): Promise<BrowsableDirectory[]> {
  const candidates = await Promise.all(getWindowsDriveCandidates().map(async (drive) => {
    try {
      const driveStat = await stat(drive.path);
      return driveStat.isDirectory() ? drive : null;
    } catch {
      return null;
    }
  }));

  return candidates.filter((drive): drive is BrowsableDirectory => drive !== null);
}

export function normalizeDirectory(directory: string): string {
  if (directory === "~") return homedir();
  if (directory.startsWith("~/")) return path.resolve(homedir(), directory.slice(2));
  return path.resolve(directory);
}

export function getParentDirectory(directory: string): string | null {
  const pathApi = /^[a-zA-Z]:[\\/]/.test(directory) || directory.startsWith("\\\\")
    ? path.win32
    : path.posix;
  const normalized = pathApi.normalize(directory);
  const parent = pathApi.dirname(normalized);
  return parent === normalized ? null : parent;
}

export async function resolveDirectory(directory: string): Promise<string> {
  return realpath(normalizeDirectory(directory));
}

export async function listDirectories(directory: string): Promise<BrowsableDirectory[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  // 忽略损坏、不可访问或不指向目录的符号链接。
  const candidates = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) {
      return { name: entry.name, path: path.join(directory, entry.name) };
    }
    if (!entry.isSymbolicLink()) return null;

    try {
      const entryPath = path.join(directory, entry.name);
      const realEntryPath = await realpath(entryPath);
      const entryStat = await stat(realEntryPath);
      if (!entryStat.isDirectory()) return null;
      return { name: entry.name, path: entryPath };
    } catch {
      return null;
    }
  }));

  return candidates
    .filter((entry): entry is BrowsableDirectory => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

// ---------------------------------------------------------------------------
// 原生资源管理器打开（Windows/WSL → Windows 资源管理器，macOS → Finder，
// 其他 Linux → xdg-open）。Web 服务与 agent 同机运行，因此在服务端派生
// 宿主机命令即可；WSL 下通过 wslpath -w 把 POSIX 路径转成 \\wsl$\… UNC 路径
// 再交给 explorer.exe。
// ---------------------------------------------------------------------------

import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { powershellExecutable, runDialogProcess } from "./native-dialog-bridge.ts";

export interface SystemExplorerLauncher {
  command: string;
  label: string;
  /** WSL：需要先用 `wslpath -w` 把 POSIX 路径翻译成 Windows 路径。 */
  requiresWslPath: boolean;
  /** explorer / explorer.exe 即使成功打开也常返回退出码 1，不能按码判败。 */
  ignoreExitCode: boolean;
}

/** 按平台选择原生资源管理器命令（纯函数，便于测试）。 */
export function systemExplorerLauncher(
  platform: NodeJS.Platform = process.platform,
  wsl = false,
): SystemExplorerLauncher {
  if (platform === "win32") {
    return { command: "explorer", label: "Windows Explorer", requiresWslPath: false, ignoreExitCode: true };
  }
  if (platform === "darwin") {
    return { command: "open", label: "Finder", requiresWslPath: false, ignoreExitCode: false };
  }
  if (wsl) {
    return { command: "explorer.exe", label: "Windows Explorer (WSL)", requiresWslPath: true, ignoreExitCode: true };
  }
  return { command: "xdg-open", label: "system file manager", requiresWslPath: false, ignoreExitCode: false };
}

/** WSL 环境检测：环境变量优先，回退读内核版本（含 microsoft 标记）。 */
export async function isWslEnvironment(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    const release = await readFile("/proc/sys/kernel/osrelease", "utf8");
    return /microsoft/i.test(release);
  } catch {
    return false;
  }
}

async function wslToWindowsPath(posixPath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("wslpath", ["-w", posixPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`wslpath is unavailable: ${String(error)}`)));
    child.on("close", (code) => {
      const translated = stdout.trim();
      if (code === 0 && translated) resolve(translated);
      else reject(new Error(`wslpath -w failed for ${posixPath}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

export interface SystemExplorerOpenResult {
  /** 解析后的真实目录路径。 */
  path: string;
  /** 实际派生的打开命令。 */
  via: string;
  label: string;
  /** WSL 下翻译出的 Windows UNC 路径。 */
  windowsPath?: string;
}

function spawnDetached(command: string, args: string[], ignoreExitCode: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    // ENOENT 等派生失败通过 error 事件到达；成功派发即认为已打开
    // （explorer 系列不等待用户关闭窗口）。
    child.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
    child.unref();
    void ignoreExitCode;
    resolve();
  });
}

/** 用宿主机原生资源管理器打开一个已存在的目录。 */
export async function openInSystemExplorer(directory: string): Promise<SystemExplorerOpenResult> {
  const resolved = await resolveDirectory(directory);
  const directoryStat = await stat(resolved);
  if (!directoryStat.isDirectory()) {
    throw new Error("Path is not a directory");
  }
  const launcher = systemExplorerLauncher(process.platform, await isWslEnvironment());
  let target = resolved;
  if (launcher.requiresWslPath) {
    target = await wslToWindowsPath(resolved);
  }
  await spawnDetached(launcher.command, [target], launcher.ignoreExitCode);
  return {
    path: resolved,
    via: launcher.command,
    label: launcher.label,
    ...(launcher.requiresWslPath ? { windowsPath: target } : {}),
  };
}

// ---------------------------------------------------------------------------
// 原生目录选择对话框（Windows/WSL：PowerShell 拉起 Vista 风格文件夹选择，
// 可见完整 shell 命名空间（含侧栏 Linux/WSL 节点）；macOS：osascript；
// 其他 Linux：zenity）。选中的 Windows 路径经 wslpath -u 翻译回服务端路径。
// ---------------------------------------------------------------------------

/** 组装 PowerShell 目录选择脚本（纯函数，便于测试）。 */
export function folderPickPowershellScript(initialDirectory?: string): string {
  const lines = [
    // 管道输出必须是 UTF-8：中文 Windows 的 PowerShell 默认按 OEM/GBK 写
    // 管道，含中文的路径会变乱码，服务端 wslpath/校验随之失败。
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
    "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
    "$dlg = New-Object System.Windows.Forms.OpenFileDialog",
    "$dlg.Title = 'Select working directory'",
    "$dlg.ValidateNames = $false",
    "$dlg.CheckFileExists = $false",
    "$dlg.CheckPathExists = $true",
    "$dlg.FileName = 'Select this folder'",
    "$dlg.Filter = 'Folder|no.files'",
    // 关键：禁止 Windows 自动把过滤器的扩展名补到文件名后面——否则
    // 返回的是 “…\Select this folder.files”，后缀剥离会失配。
    "$dlg.AddExtension = $false",
  ];
  if (initialDirectory) {
    const safe = initialDirectory.replace(/'/g, "''");
    lines.push(`$dlg.InitialDirectory = '${safe}'`);
  }
  lines.push(
    // 从 WSL/后台进程拉起的对话框不会自动置顶：挂一个 TopMost 的隐藏
    // owner 窗体并把对话框 ShowDialog(owner)，强制它显示在最前。
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.TopMost = $true",
    "$owner.ShowInTaskbar = $false",
    "$owner.WindowState = 'Minimized'",
    "$owner.Show()",
    "$owner.Activate()",
    "try {",
    "  if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {",
    "    Write-Output $dlg.FileName",
    "  }",
    "}",
    "finally {",
    "  $owner.Close()",
    "}",
  );
  return lines.join("\r\n");
}

/**
 * 去掉 OpenFileDialog 文件名技巧留下的 “Select this folder” 后缀。
 * 兼容 Windows 自动补扩展名的变体（AddExtension 未关时会得到
 * “…/Select this folder.files” 这类尾巴）。
 */
export function stripFolderPickSuffix(path: string): string {
  const marker = "Select this folder";
  let value = path.trim();
  const match = new RegExp(`${marker}(?:\\.[^\\\\/]+)?$`).exec(value);
  if (match) {
    value = value.slice(0, match.index);
  }
  return value.replace(/[\\/]+$/, "");
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    // 分块 Buffer 必须攒齐后一次性按 UTF-8 解码：逐块字符串拼接会把跨块的
    // 多字节字符切碎。
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => { stdoutChunks.push(chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderrChunks.push(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const decode = (chunks: Buffer[]): string =>
        Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
      resolve({ stdout: decode(stdoutChunks), stderr: decode(stderrChunks), code });
    });
  });
}

async function wslPathToServer(windowsPath: string): Promise<string> {
  const { stdout, code } = await runCommand("wslpath", ["-u", windowsPath], 5_000);
  const translated = stdout.trim();
  if (code === 0 && translated) return translated;
  throw new Error(`wslpath -u failed for ${windowsPath}`);
}

export type SystemDirectoryPick =
  | { status: "picked"; path: string; windowsPath: string }
  | { status: "cancelled" };

/**
 * 弹出宿主机原生目录选择对话框并等待用户选择。
 * WSL/Windows 使用 PowerShell（Vista 风格对话框），选中的 Windows 路径
 * 会翻译成服务端路径（WSL 下为 POSIX 路径，/mnt/… 或 ~/…）。
 * 用户取消时返回 cancelled，不抛错。
 */
export async function pickSystemDirectory(options: { initialDirectory?: string; timeoutMs?: number } = {}): Promise<SystemDirectoryPick> {
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const wsl = await isWslEnvironment();
  if (process.platform === "win32" || wsl) {
    let initialWindowsPath: string | undefined;
    if (options.initialDirectory && wsl) {
      try {
        initialWindowsPath = await wslToWindowsPath(options.initialDirectory);
      } catch {
        initialWindowsPath = undefined;
      }
    } else if (options.initialDirectory) {
      initialWindowsPath = options.initialDirectory;
    }
    const encoded = Buffer.from(folderPickPowershellScript(initialWindowsPath), "utf16le").toString("base64");
    const { stdout, stderr, code } = await runDialogProcess(
      powershellExecutable(),
      ["-NoProfile", "-STA", "-NonInteractive", "-EncodedCommand", encoded],
      timeoutMs,
    );
    const picked = stripFolderPickSuffix(stdout);
    if (!picked) {
      if (code !== 0 && code !== null && stderr.trim()) {
        throw new Error(`powershell folder pick failed (${code}): ${stderr.trim().slice(0, 300)}`);
      }
      return { status: "cancelled" };
    }
    const serverPath = wsl ? await wslPathToServer(picked) : picked;
    return { status: "picked", path: serverPath, windowsPath: picked };
  }
  if (process.platform === "darwin") {
    const { stdout } = await runCommand("osascript", ["-e", "POSIX path of (choose folder)"], timeoutMs);
    const picked = stdout.trim().replace(/\/$/, "");
    if (!picked) return { status: "cancelled" };
    return { status: "picked", path: picked, windowsPath: picked };
  }
  const { stdout } = await runCommand("zenity", ["--file-selection", "--directory"], timeoutMs);
  const picked = stdout.trim();
  if (!picked) return { status: "cancelled" };
  return { status: "picked", path: picked, windowsPath: picked };
}
