// Config-layer access for the web MCP management panel (webui-mcp-management).
//
// The adapter's own config layer is the single configuration authority: list
// via loadMcpConfig precedence, toggles via the project-layer `disabled`
// override writer (enabling writes an explicit false only when a lower source
// is disabled). Everything is redacted to name + disabled — server
// definitions, commands, args, env, and credentials never cross this
// boundary. Effect timing is the adapter's honest semantics: config changes
// apply after a session reload, not as a live server restart.
//
// The "./config" subpath is unblocked by scripts/patch-mcp-adapter-exports.mjs
// (prebuild:web) plus transpilePackages in next.config.ts.

import { loadMcpConfig, writeProjectServerDisabledOverride } from "../../vendor/pi-mcp-adapter-config/config.ts";

export interface McpPanelServer {
	name: string;
	disabled: boolean;
}

const SERVER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Configured servers for a cwd, redacted to identity + disabled state. */
export function listMcpPanelServers(overridePath: string | undefined, cwd: string): { servers: McpPanelServer[] } {
	const config = loadMcpConfig(overridePath, cwd);
	const servers: McpPanelServer[] = [];
	for (const [name, entry] of Object.entries(config.mcpServers ?? {})) {
		if (!SERVER_NAME_PATTERN.test(name)) continue;
		servers.push({ name, disabled: Boolean((entry as { disabled?: boolean } | undefined)?.disabled) });
	}
	servers.sort((a, b) => a.name.localeCompare(b.name));
	return { servers };
}

/** Persist a per-server enable/disable through the adapter's override writer. */
export function setMcpPanelServerDisabled(
	overridePath: string | undefined,
	cwd: string,
	serverName: string,
	disabled: boolean,
): { changed: boolean; path: string } {
	if (!SERVER_NAME_PATTERN.test(serverName)) throw new Error("invalid server name");
	const known = listMcpPanelServers(overridePath, cwd).servers.some((server) => server.name === serverName);
	if (!known) throw new Error(`unknown server: ${serverName}`);
	return writeProjectServerDisabledOverride(overridePath, cwd, serverName, disabled);
}
