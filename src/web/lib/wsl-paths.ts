"use client";

/** WSL path normalization shared by the composer paste handler and the picker address bar. */

export interface WslPathEnv {
  readonly wsl: boolean;
  readonly distro: string | null;
}

const DRIVE_PATH = /^[A-Za-z]:[\\/](.*)$/;
const UNC_PATH = /^\\\\(?:wsl\$|wsl\.localhost)\\([^\\]+)(?:\\(.*))?$/;

/**
 * Convert a whole-string Windows path to its WSL Linux form.
 * Returns undefined when the text is not exactly one convertible path —
 * prose that merely mentions a path is never touched, and UNC paths naming a
 * different distribution are left unchanged.
 */
export function normalizeWindowsPath(text: string, env: WslPathEnv): string | undefined {
  if (!env.wsl) return undefined;
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes("\n")) return undefined;
  const unc = UNC_PATH.exec(trimmed);
  if (unc) {
    const distro = unc[1] ?? "";
    const rest = unc[2] ?? "";
    if (!env.distro || distro.toLowerCase() !== env.distro.toLowerCase()) return undefined;
    const linux = `/${rest.replace(/\\/g, "/")}`;
    return linux.endsWith("/") && linux.length > 1 ? linux.slice(0, -1) : linux;
  }
  const drive = DRIVE_PATH.exec(trimmed);
  if (drive) {
    const rest = (drive[1] ?? "").replace(/\\/g, "/");
    return `/mnt/${trimmed[0]!.toLowerCase()}${rest ? `/${rest}` : ""}`;
  }
  return undefined;
}

let cachedEnv: Promise<WslPathEnv> | null = null;

/** Fetch (and memoize) the server's WSL facts for paste normalization. */
export function fetchWslEnv(): Promise<WslPathEnv> {
  if (!cachedEnv) {
    cachedEnv = fetch("/api/aili/env", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { wsl: false, distro: null }))
      .then((body: { wsl?: boolean; distro?: string | null }) => ({ wsl: Boolean(body.wsl), distro: body.distro ?? null }))
      .catch(() => ({ wsl: false, distro: null }));
  }
  return cachedEnv;
}
