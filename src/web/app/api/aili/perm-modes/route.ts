import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface ModeDefJson { label?: unknown; color?: unknown }
interface PermModesConfig {
  defaultMode?: unknown;
  cycleOrder?: unknown;
  modes?: Record<string, ModeDefJson>;
}

/** ESM-only packages without full exports still ship the defaults file on disk. */
function stockDefaultsPath(): string {
  const require = createRequire(import.meta.url);
  try {
    return join(dirname(require.resolve("pi-permission-modes/package.json")), "permission-mode.defaults.json");
  } catch { /* fall through to the node_modules walk */ }
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = resolve(directory, "node_modules", "pi-permission-modes", "permission-mode.defaults.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("permission-mode defaults not found");
}

function userOverridesPath(): string {
  return join(getAgentDir(), "permission-mode", "permission-mode.json");
}

export async function GET() {
  let config: PermModesConfig = {};
  try { config = JSON.parse(await readFile(stockDefaultsPath(), "utf8")) as PermModesConfig; }
  catch { return NextResponse.json({ error: "permission-mode defaults are unreadable" }, { status: 500 }); }
  if (existsSync(userOverridesPath())) {
    try {
      const overrides = JSON.parse(await readFile(userOverridesPath(), "utf8")) as PermModesConfig;
      config = {
        defaultMode: overrides.defaultMode ?? config.defaultMode,
        cycleOrder: overrides.cycleOrder ?? config.cycleOrder,
        modes: { ...(config.modes ?? {}), ...(overrides.modes ?? {}) },
      };
    } catch { /* malformed overrides fall back to stock defaults */ }
  }
  const modes = Object.entries(config.modes ?? {}).map(([key, def]) => ({
    key,
    label: typeof def.label === "string" ? def.label : key,
    color: typeof def.color === "string" ? def.color : null,
  }));
  const order = Array.isArray(config.cycleOrder)
    ? config.cycleOrder.filter((item): item is string => typeof item === "string")
    : modes.map((mode) => mode.key);
  const ordered = [
    ...order.map((key) => modes.find((mode) => mode.key === key)).filter((mode): mode is { key: string; label: string; color: string | null } => Boolean(mode)),
    ...modes.filter((mode) => !order.includes(mode.key)),
  ];
  const defaultMode = typeof config.defaultMode === "string" && ordered.some((mode) => mode.key === config.defaultMode)
    ? config.defaultMode
    : ordered[0]?.key ?? null;
  return NextResponse.json({ modes: ordered, cycleOrder: order, defaultMode }, { headers: { "Cache-Control": "no-store" } });
}
