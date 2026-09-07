// Panel data layer (webui-mcp-management, user direction 2026-08-20: global
// by design — "直接改全局的字段"). The panel manages ONE file: the shared
// global MCP config (~/.config/mcp/mcp.json). Reads are redacted to
// name + disabled + lifecycle; writes go through the adapter's public config writer
// (writeSharedServerEntry) so canonicalization and atomicity stay adapter-owned.
// No project files are ever touched, and there is exactly one state to look at.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { writeSharedServerEntry } from "pi-mcp-adapter/config";
import type { ServerEntry } from "pi-mcp-adapter";

export function resolveSharedMcpConfigPath(env: { XDG_CONFIG_HOME?: string | undefined; HOME?: string | undefined } = process.env as { XDG_CONFIG_HOME?: string | undefined; HOME?: string | undefined }): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return resolve(xdg, "mcp", "mcp.json");
  const home = env.HOME?.trim() || homedir();
  return resolve(home, ".config", "mcp", "mcp.json");
}

export const MCP_LIFECYCLE_MODES = ["eager", "keep-alive", "lazy", "lazy-keep-alive"] as const;
export type McpLifecycle = NonNullable<ServerEntry["lifecycle"]>;
/** Matches pi-mcp-adapter's `definition.lifecycle ?? "lazy"` runtime default. */
export const DEFAULT_MCP_LIFECYCLE: McpLifecycle = "lazy";

export interface McpPanelServer {
  name: string;
  disabled: boolean;
  lifecycle: McpLifecycle;
}

interface SharedFileShape {
  mcpServers?: Record<string, { disabled?: boolean } & Record<string, unknown>>;
  ["mcp-servers"]?: Record<string, { disabled?: boolean } & Record<string, unknown>>;
}

function readSharedServers(filePath: string): Record<string, { disabled?: boolean } & Record<string, unknown>> {
  if (!existsSync(filePath)) return {};
  let raw: SharedFileShape;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("root value must be an object");
    raw = parsed as SharedFileShape;
  } catch (error) {
    throw new Error(`Failed to read shared MCP config at ${filePath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const root = raw.mcpServers !== undefined ? "mcpServers" : raw["mcp-servers"] !== undefined ? "mcp-servers" : undefined;
  if (!root) return {};
  const servers = raw[root];
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error(`Failed to read shared MCP config at ${filePath}: ${root} must be an object`);
  }
  for (const [name, entry] of Object.entries(servers)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Failed to read shared MCP config at ${filePath}: server "${name}" must be an object`);
    }
  }
  return servers;
}

/** All servers defined in the shared global config, redacted. */
export function listMcpPanelServers(_cwd?: string, filePath = resolveSharedMcpConfigPath()): { servers: McpPanelServer[] } {
  const servers = readSharedServers(filePath);
  return {
    servers: Object.keys(servers)
      .filter((name) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
      .map((name) => {
        const lifecycle = servers[name]?.lifecycle;
        if (lifecycle !== undefined && !isMcpLifecycle(lifecycle)) throw new Error(`invalid lifecycle for server: ${name}`);
        return {
          name,
          disabled: Boolean(servers[name]?.disabled),
          lifecycle: lifecycle ?? DEFAULT_MCP_LIFECYCLE,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Flip the global disabled flag for one server in the shared config. */
export function setMcpPanelServerDisabled(name: string, disabled: boolean, _cwd?: string, filePath = resolveSharedMcpConfigPath()): { changed: boolean } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error("invalid server name");
  const servers = readSharedServers(filePath);
  const entry = servers[name];
  if (!entry) throw new Error(`unknown server: ${name}`);
  const current = Boolean(entry.disabled);
  if (current === disabled) return { changed: false };
  const next = { ...entry };
  if (disabled) next.disabled = true;
  else delete next.disabled;
  writeSharedServerEntry(filePath, name, next as ServerEntry);
  return { changed: true };
}

/** Persist one lifecycle mode in the shared global config and enable the server. */
export function setMcpPanelServerLifecycle(name: string, lifecycle: string, _cwd?: string, filePath = resolveSharedMcpConfigPath()): { changed: boolean } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error("invalid server name");
  if (!isMcpLifecycle(lifecycle)) throw new Error("invalid lifecycle");
  const servers = readSharedServers(filePath);
  const entry = servers[name];
  if (!entry) throw new Error(`unknown server: ${name}`);
  const next = { ...entry, lifecycle };
  delete next.disabled;
  if (entry.lifecycle === lifecycle && !Object.hasOwn(entry, "disabled")) return { changed: false };
  writeSharedServerEntry(filePath, name, next as ServerEntry);
  return { changed: true };
}

function isMcpLifecycle(value: unknown): value is McpLifecycle {
  return typeof value === "string" && (MCP_LIFECYCLE_MODES as readonly string[]).includes(value);
}
