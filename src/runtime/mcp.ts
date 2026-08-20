import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  createMcpAdapter,
  MCP_STATUS_EVENT,
  MCP_STATUS_SNAPSHOT_VERSION,
  MCP_TOOL_APPROVAL_REQUEST_EVENT,
  type McpAdapterOptions,
  type McpServerRuntimeStatus,
  type McpStatusSnapshot,
  type McpToolApprovalDecision,
  type McpToolApprovalRequest,
} from "pi-mcp-adapter";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Action } from "pi-permission-modes/src/schema.ts";
import { publishMcpRuntimeSnapshot } from "./mcp-runtime-store.js";

export const MCP_ADAPTER_VERSION = "2.23.0";
export const MCP_TOOL_NAMES = ["mcp", "mcpScript"] as const;

const EMPTY_STATUS: McpStatusSnapshot = {
  version: MCP_STATUS_SNAPSHOT_VERSION,
  servers: [],
  totalTools: 0,
  totalResources: 0,
  connectedCount: 0,
  disabledCount: 0,
};

export interface McpEnvironment {
  HOME?: string;
  XDG_CONFIG_HOME?: string;
}

export function resolveSharedMcpConfigPath(env: McpEnvironment = process.env): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return resolve(xdg, "mcp", "mcp.json");
  const home = env.HOME?.trim() || homedir();
  if (!home) throw new Error("MCP config path requires HOME or XDG_CONFIG_HOME");
  return resolve(home, ".config", "mcp", "mcp.json");
}

export interface McpStatusStore {
  snapshot(): McpStatusSnapshot;
  dispose(): void;
}

function validServerStatus(value: unknown): value is McpServerRuntimeStatus {
  return value === "connected"
    || value === "cached"
    || value === "failed"
    || value === "needs-auth"
    || value === "not-connected"
    || value === "disabled";
}

export function isMcpStatusSnapshot(value: unknown): value is McpStatusSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<McpStatusSnapshot>;
  return candidate.version === MCP_STATUS_SNAPSHOT_VERSION
    && Array.isArray(candidate.servers)
    && candidate.servers.every((server) => Boolean(server)
      && typeof server === "object"
      && typeof server.name === "string"
      && validServerStatus(server.status)
      && Number.isInteger(server.toolCount)
      && typeof server.disabled === "boolean")
    && [candidate.totalTools, candidate.totalResources, candidate.connectedCount, candidate.disabledCount]
      .every((count) => Number.isInteger(count) && Number(count) >= 0);
}

export function subscribeMcpStatus(pi: Pick<ExtensionAPI, "events">): McpStatusStore {
  let current = structuredClone(EMPTY_STATUS);
  const unsubscribe = pi.events.on(MCP_STATUS_EVENT, (value) => {
    if (isMcpStatusSnapshot(value)) current = structuredClone(value);
  });
  return {
    snapshot: () => structuredClone(current),
    dispose: unsubscribe,
  };
}

export interface McpApprovalPolicy {
  decide(request: McpToolApprovalRequest): Action | Promise<Action>;
  requestApproval?(request: McpToolApprovalRequest): "allow" | "deny" | Promise<"allow" | "deny">;
}

export function createMcpApprovalBridge(policy: McpApprovalPolicy): ExtensionFactory {
  return (pi) => {
    const unsubscribe = pi.events.on(MCP_TOOL_APPROVAL_REQUEST_EVENT, (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const request = value as McpToolApprovalRequest;
      if (typeof request.claim !== "function") return;
      request.claim(async (): Promise<McpToolApprovalDecision> => {
        try {
          const action = await policy.decide(request);
          if (action === "deny") return "deny";
          if (action === "allow") return "allow_once";
          if (!policy.requestApproval) return "deny";
          return await policy.requestApproval(request) === "allow" ? "allow_once" : "deny";
        } catch {
          return "deny";
        }
      });
    });
    pi.on("session_shutdown", unsubscribe);
  };
}

export interface AiliMcpExtensionOptions extends McpAdapterOptions {
  approvalPolicy?: McpApprovalPolicy;
}

/** Create one session-owned adapter factory; calling this twice never shares adapter state. */
export function createAiliMcpExtension(options: AiliMcpExtensionOptions = {}): ExtensionFactory {
  const configPath = options.config !== undefined
    ? undefined
    : options.configPath ?? resolveSharedMcpConfigPath();
  const adapter = createMcpAdapter({
    ...(options.config !== undefined ? { config: options.config } : {}),
    ...(configPath !== undefined ? { configPath } : {}),
  });
  const approval = options.approvalPolicy ? createMcpApprovalBridge(options.approvalPolicy) : undefined;
  return (pi) => {
    approval?.(pi);
    adapter(pi);
    // Feed the process-level runtime snapshot store for the web MCP panel
    // (latest view wins; the web side validates and redacts on read).
    const store = subscribeMcpStatus(pi);
    pi.events.on(MCP_STATUS_EVENT, () => publishMcpRuntimeSnapshot(store.snapshot()));
    publishMcpRuntimeSnapshot(store.snapshot());
  };
}

export function mcpConfigEvidencePath(env: McpEnvironment = process.env): string {
  const path = resolveSharedMcpConfigPath(env);
  const home = env.HOME?.trim();
  return home && path.startsWith(resolve(home) + "/")
    ? `~/${path.slice(resolve(home).length + 1)}`
    : path;
}
