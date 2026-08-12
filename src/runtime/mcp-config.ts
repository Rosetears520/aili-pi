import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpConfig, ServerEntry } from "pi-mcp-adapter/types";
import { MEMPALACE_PATH } from "./mempalace.js";

export const ACCEPTED_MCP_SERVER_VERSIONS = Object.freeze({
  mempalace: "3.7.0",
  context7: "4.0.2",
  playwright: "0.0.79",
  codegraph: "1.5.0",
});

export function acceptedMcpServers(): Record<string, ServerEntry> {
  return {
    mempalace: {
      command: "mempalace-mcp",
      args: ["--palace", MEMPALACE_PATH],
      env: { MEMPALACE_PALACE_PATH: MEMPALACE_PATH },
      lifecycle: "lazy",
    },
    context7: {
      command: "npx",
      args: ["-y", "@upstash/context7-mcp@4.0.2"],
      lifecycle: "lazy",
    },
    playwright: {
      command: "npx",
      args: ["-y", "@playwright/mcp@0.0.79", "--browser", "chromium"],
      lifecycle: "lazy",
    },
    codegraph: {
      command: "npx",
      args: ["-y", "@colbymchenry/codegraph@1.5.0", "serve", "--mcp"],
      lifecycle: "lazy",
    },
  };
}

export interface SharedMcpConfigPreview {
  path: string;
  changed: boolean;
  existed: boolean;
  conflicts: string[];
  config: McpConfig;
  redactedText: string;
}

function asConfig(value: unknown): McpConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MCP config root must be an object");
  const candidate = value as { mcpServers?: unknown };
  if (candidate.mcpServers !== undefined && (!candidate.mcpServers || typeof candidate.mcpServers !== "object" || Array.isArray(candidate.mcpServers))) {
    throw new Error("MCP config mcpServers must be an object");
  }
  return { ...(value as Record<string, unknown>), mcpServers: (candidate.mcpServers ?? {}) as Record<string, ServerEntry> } as McpConfig;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
}

export function redactMcpConfig(config: McpConfig): string {
  const redact = (value: unknown, key = ""): unknown => {
    if (/token|secret|password|authorization|cookie|api[_-]?key/i.test(key)) return "[redacted]";
    if (Array.isArray(value)) return value.map((child) => redact(child));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
    return value;
  };
  return `${JSON.stringify(stable(redact(config)), null, 2)}\n`;
}

export function previewSharedMcpConfig(path: string, current: unknown): SharedMcpConfigPreview {
  const config = asConfig(current);
  const accepted = acceptedMcpServers();
  const conflicts = Object.keys(accepted).filter((name) => config.mcpServers[name] !== undefined
    && JSON.stringify(stable(config.mcpServers[name])) !== JSON.stringify(stable(accepted[name])));
  const merged: McpConfig = { ...config, mcpServers: { ...config.mcpServers } };
  if (conflicts.length === 0) Object.assign(merged.mcpServers, accepted);
  return {
    path,
    changed: conflicts.length === 0 && JSON.stringify(stable(config)) !== JSON.stringify(stable(merged)),
    existed: Object.keys(config.mcpServers).length > 0,
    conflicts,
    config: merged,
    redactedText: redactMcpConfig(merged),
  };
}

export async function loadSharedMcpConfigPreview(path: string): Promise<SharedMcpConfigPreview> {
  try {
    return previewSharedMcpConfig(path, JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return previewSharedMcpConfig(path, { mcpServers: {} });
    throw error;
  }
}

export async function writeAcceptedSharedMcpConfig(preview: SharedMcpConfigPreview): Promise<{ path: string; backupPath?: string }> {
  if (preview.conflicts.length > 0) throw new Error(`MCP server name conflict: ${preview.conflicts.join(", ")}`);
  const directory = dirname(preview.path);
  await mkdir(directory, { recursive: true });
  const temp = `${preview.path}.${randomUUID()}.tmp`;
  const backupPath = `${preview.path}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}.${randomUUID()}`;
  let existed = false;
  try {
    const handle = await open(preview.path, "r");
    existed = true;
    try { await writeFile(backupPath, await handle.readFile(), { flag: "wx", mode: 0o600 }); }
    finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await writeFile(temp, `${JSON.stringify(preview.config, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temp, preview.path);
  } finally {
    await rm(temp, { force: true });
  }
  return { path: preview.path, ...(existed ? { backupPath } : {}) };
}
