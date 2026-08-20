// Process-level MCP runtime snapshot store (webui-mcp-management tail).
//
// The adapter publishes McpStatusSnapshot via pi.events (per-session). This
// tiny module has NO adapter imports (it must be safely importable from both
// the pi runtime loader and the Next webpack graph): the AILI MCP extension
// pushes the latest snapshot here on every MCP_STATUS_EVENT, and the web MCP
// route reads it. One snapshot per process is correct for v1 — the managed
// config is global, and every session in the process shares the adapter view.
// Reads are validated and redacted to name/state/toolCount/resourceCount.

export interface McpRuntimeServer {
  name: string;
  status: "connected" | "cached" | "failed" | "needs-auth" | "not-connected" | "disabled";
  toolCount: number;
  resourceCount?: number;
  disabled: boolean;
}

export interface McpRuntimeSnapshot {
  servers: McpRuntimeServer[];
  totalTools: number;
  connectedCount: number;
  disabledCount: number;
}

const VALID_STATES = new Set(["connected", "cached", "failed", "needs-auth", "not-connected", "disabled"]);

export function redactMcpRuntimeSnapshot(value: unknown): McpRuntimeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { servers?: unknown; totalTools?: unknown; connectedCount?: unknown; disabledCount?: unknown };
  if (!Array.isArray(candidate.servers)) return null;
  const servers: McpRuntimeServer[] = [];
  for (const raw of candidate.servers.slice(0, 256)) {
    if (!raw || typeof raw !== "object") continue;
    const server = raw as Record<string, unknown>;
    const name = typeof server.name === "string" ? server.name : null;
    const status = typeof server.status === "string" && VALID_STATES.has(server.status) ? server.status : null;
    const toolCount = Number.isInteger(server.toolCount) && Number(server.toolCount) >= 0 ? Number(server.toolCount) : 0;
    if (!name || !status || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) continue;
    servers.push({
      name,
      status: status as McpRuntimeServer["status"],
      toolCount,
      ...(Number.isInteger(server.resourceCount) && Number(server.resourceCount) >= 0 ? { resourceCount: Number(server.resourceCount) } : {}),
      disabled: server.disabled === true,
    });
  }
  const count = (input: unknown): number => (Number.isInteger(input) && Number(input) >= 0 ? Number(input) : 0);
  return {
    servers,
    totalTools: count(candidate.totalTools),
    connectedCount: count(candidate.connectedCount),
    disabledCount: count(candidate.disabledCount),
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __ailiMcpRuntimeSnapshot: unknown;
}

export function publishMcpRuntimeSnapshot(value: unknown): void {
  globalThis.__ailiMcpRuntimeSnapshot = value;
}

export function readMcpRuntimeSnapshot(): McpRuntimeSnapshot | null {
  return redactMcpRuntimeSnapshot(globalThis.__ailiMcpRuntimeSnapshot);
}
