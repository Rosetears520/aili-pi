import { NextResponse } from "next/server";
import { isWsl, wslDistroName } from "@/lib/allowed-roots";
import { findOnPath, runDialogProcess, runPowerShellDialogScript } from "@/lib/native-dialog-bridge";

const DIALOG_TIMEOUT_MS = 10 * 60_000;
const CANCEL_MARKER = "##AILI_CANCELLED##";
const PROBE_TIMEOUT_MS = 8_000;

const globalRef = globalThis as {
  __ailiNativeDialogChild?: import("node:child_process").ChildProcess | null;
};

type ChildProcessLike = import("node:child_process").ChildProcess;

/** WSL path -> the form the Windows dialog accepts as an initial directory. */
function windowsInitialDirectory(cwd: string | null): string {
  if (!cwd) return "";
  const distro = wslDistroName();
  const drive = /^\/mnt\/([a-z])(\/.*)?$/.exec(cwd);
  if (drive) {
    const rest = (drive[2] ?? "").replace(/\//g, "\\");
    return `${drive[1]!.toUpperCase()}:${rest}`;
  }
  if (distro && cwd.startsWith("/")) return `\\\\wsl.localhost\\${distro}${cwd.replace(/\//g, "\\")}`;
  return "";
}

/** Windows dialog path -> WSL Linux path. */
function toWslPath(windowsPath: string): string | null {
  const unc = /^\\\\(?:wsl$|wsl\.localhost)\\([^\\]+)(\\.*)?$/.exec(windowsPath);
  if (unc) {
    const distro = wslDistroName();
    if (!distro || (unc[1] ?? "").toLowerCase() !== distro.toLowerCase()) return null;
    return ((unc[2] ?? "").replace(/\\/g, "/")) || "/";
  }
  const drive = /^([A-Za-z]):((?:\\|\/).*)$/.exec(windowsPath);
  if (drive) {
    const rest = (drive[2] ?? "").replace(/\\/g, "/");
    return `/mnt/${drive[1]!.toLowerCase()}${rest}`;
  }
  return null;
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeDoubleQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * Opens the platform-native multi-select file dialog and returns the selected
 * files as server-local paths: Windows Explorer dialog through WSL interop
 * (forced to the foreground via a topmost hidden owner form — a background
 * interop process otherwise leaves the dialog buried behind every window),
 * AppleScript `choose file` on macOS, zenity/kdialog on Linux. Cancelling
 * returns an empty list.
 */
export async function POST(request: Request) {
  let cwd: string | null = null;
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const raw = (body as { cwd?: unknown }).cwd;
      if (typeof raw === "string" && raw.startsWith("/")) cwd = raw;
    }
  } catch { /* body optional */ }

  try {
    if (isWsl()) {
      const initialDirectory = windowsInitialDirectory(cwd);
      const script = [
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
        "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
        "$owner = New-Object System.Windows.Forms.Form",
        "$owner.TopMost = $true",
        "$owner.ShowInTaskbar = $false",
        "$owner.WindowState = 'Minimized'",
        "$owner.Opacity = 0",
        "[void]$owner.Show()",
        "$d = New-Object System.Windows.Forms.OpenFileDialog",
        "$d.Multiselect = $true",
        "$d.Title = 'AILI Pi - select files'",
        initialDirectory ? `$d.InitialDirectory = '${escapeSingleQuotes(initialDirectory)}'` : "",
        "$ok = $d.ShowDialog($owner)",
        "$owner.Close()",
        `if ($ok -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileNames } else { '${CANCEL_MARKER}' }`,
      ].filter(Boolean).join("\n");
      const { stdout } = await runPowerShellDialogScript(script, DIALOG_TIMEOUT_MS);
      const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0 || lines.includes(CANCEL_MARKER)) {
        return NextResponse.json({ paths: [] }, { headers: { "Cache-Control": "no-store" } });
      }
      const paths: string[] = [];
      for (const line of lines) {
        const converted = toWslPath(line);
        if (converted) paths.push(converted);
      }
      return NextResponse.json({ paths }, { headers: { "Cache-Control": "no-store" } });
    }

    if (process.platform === "darwin") {
      const osascript = findOnPath("osascript");
      if (!osascript) return NextResponse.json({ error: "osascript unavailable" }, { status: 501 });
      const args = [
        "-e", "with timeout of 3600 seconds",
        "-e", `set chosen to choose file with multiple selections allowed with prompt "AILI Pi - select files"${cwd ? ` default location POSIX file "${escapeDoubleQuotes(cwd)}"` : ""}`,
        "-e", "end timeout",
        "-e", "set out to \"\"",
        "-e", "repeat with f in chosen",
        "-e", "set out to out & (POSIX path of f) & linefeed",
        "-e", "end repeat",
        "-e", "return out",
      ];
      const { stdout, code } = await runDialogProcess(osascript, args, DIALOG_TIMEOUT_MS);
      if (code !== 0) return NextResponse.json({ paths: [] }, { headers: { "Cache-Control": "no-store" } });
      const paths = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return NextResponse.json({ paths }, { headers: { "Cache-Control": "no-store" } });
    }

    const zenity = findOnPath("zenity");
    const kdialog = findOnPath("kdialog");
    if (zenity) {
      const { stdout, code } = await runDialogProcess(zenity, [
        "--file-selection", "--multiple", "--separator=\n",
        "--title=AILI Pi - select files",
        ...(cwd ? [`--filename=${cwd}/`] : []),
      ], DIALOG_TIMEOUT_MS);
      if (code !== 0) return NextResponse.json({ paths: [] }, { headers: { "Cache-Control": "no-store" } });
      const paths = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return NextResponse.json({ paths }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kdialog) {
      const { stdout, code } = await runDialogProcess(kdialog, [
        "--getopenfilename", cwd ?? ".", "--multiple", "--separate",
        "--title", "AILI Pi - select files",
      ], DIALOG_TIMEOUT_MS);
      if (code !== 0) return NextResponse.json({ paths: [] }, { headers: { "Cache-Control": "no-store" } });
      const paths = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return NextResponse.json({ paths }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "no native file dialog available" }, { status: 501 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
