// Panel data layer (webui-mcp-management, user direction 2026-08-20: global
// by design — "直接改全局的字段"). The panel manages ONE file: the shared
// global MCP config (~/.config/mcp/mcp.json). Reads are redacted to
// name + disabled; writes go through the vendored adapter writer
// (writeSharedServerEntry) so file format and atomicity stay adapter-owned.
// No project files are ever touched, and there is exactly one state to look at.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { writeSharedServerEntry } from "../../vendor/pi-mcp-adapter-config/config.ts";

export function resolveSharedMcpConfigPath(env: { XDG_CONFIG_HOME?: string | undefined; HOME?: string | undefined } = process.env as { XDG_CONFIG_HOME?: string | undefined; HOME?: string | undefined }): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return resolve(xdg, "mcp", "mcp.json");
  const home = env.HOME?.trim() || homedir();
  return resolve(home, ".config", "mcp", "mcp.json");
}

export interface McpPanelServer {
  name: string;
  disabled: boolean;
}

interface SharedFileShape {
  mcpServers?: Record<string, { disabled?: boolean } & Record<string, unknown>>;
  ["mcp-servers"]?: Record<string, { disabled?: boolean } & Record<string, unknown>>;
}

function readSharedServers(filePath: string): Record<string, { disabled?: boolean } & Record<string, unknown>> {
  if (!existsSync(filePath)) return {};
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as SharedFileShape;
    const servers = raw.mcpServers ?? raw["mcp-servers"];
    return servers && typeof servers === "object" && !Array.isArray(servers) ? servers : {};
  } catch {
    return {};
  }
}

/** All servers defined in the shared global config, redacted. */
export function listMcpPanelServers(_cwd?: string, filePath = resolveSharedMcpConfigPath()): { servers: McpPanelServer[] } {
  const servers = readSharedServers(filePath);
  return {
    servers: Object.keys(servers)
      .filter((name) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
      .map((name) => ({ name, disabled: Boolean(servers[name]?.disabled) }))
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
  writeSharedServerEntry(filePath, name, next);
  return { changed: true };
}
