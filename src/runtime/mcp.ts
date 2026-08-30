import type { ExtensionAPI, ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
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
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Action } from "pi-permission-modes/src/schema.ts";
import { publishMcpRuntimeSnapshot } from "./mcp-runtime-store.js";

export const MCP_ADAPTER_VERSION = "2.23.0";
export const MCP_TOOL_NAMES = ["mcp", "mcpScript"] as const;

export type SessionMcpServerState = "connected" | "cached" | "failed" | "needs-auth" | "not-connected" | "disabled";

export interface SessionMcpInvocation {
  server: string;
  tool: string;
  args: Readonly<Record<string, unknown>>;
  signal?: AbortSignal;
}

/**
 * Programmatic calls must be supplied by the owner of the already-installed MCP
 * session. Implementations are responsible for using that session's connection,
 * approval bridge, cancellation, output guard, authentication, and shutdown.
 * AILI intentionally provides no fallback implementation or second MCP client.
 */
export interface SessionOwnedMcpInvoker {
  serverState(server: string): SessionMcpServerState;
  invoke(input: SessionMcpInvocation): Promise<unknown>;
}

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

type GenericMcpTool = {
  name: string;
  execute(toolCallId: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: undefined, ctx: ExtensionContext): Promise<unknown>;
};
type AutomaticApproval = { server: string; tool: string; argsHash: string; claimed: boolean };
type InvokerBinding = {
  context?: ExtensionContext;
  generation: number;
  registration: number;
  tool?: GenericMcpTool;
  statuses: Map<string, SessionMcpServerState>;
};

const automaticApproval = new AsyncLocalStorage<AutomaticApproval>();
const invokerBindings = new WeakMap<ExtensionAPI, InvokerBinding>();
const MEMORY_TOOLS = new Set(["mempalace_search", "mempalace_check_duplicate", "mempalace_add_drawer", "mempalace_diary_write"]);

function bindingFor(pi: ExtensionAPI): InvokerBinding {
  let binding = invokerBindings.get(pi);
  if (!binding) { binding = { generation: 0, registration: 0, statuses: new Map() }; invokerBindings.set(pi, binding); }
  return binding;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("MCP arguments must be finite JSON"); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("MCP arguments must be plain JSON");
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function argsHash(args: Readonly<Record<string, unknown>>): string {
  return createHash("sha256").update(canonicalJson(args)).digest("hex");
}

function exactKeys(args: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(args, key)) && Object.keys(args).every((key) => allowed.has(key));
}
function boundedString(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function validAutomaticMemoryInvocation(input: SessionMcpInvocation): boolean {
  if (!boundedString(input.server, 128) || !MEMORY_TOOLS.has(input.tool)) return false;
  const a = input.args;
  if (input.tool === "mempalace_search") return exactKeys(a, ["query", "limit"], ["context"]) && boundedString(a.query, 250) && Number.isSafeInteger(a.limit) && Number(a.limit) >= 1 && Number(a.limit) <= 32 && (a.context === undefined || boundedString(a.context, 1_024));
  if (input.tool === "mempalace_check_duplicate") return exactKeys(a, ["content", "threshold"]) && boundedString(a.content, 8_192) && typeof a.threshold === "number" && a.threshold >= 0 && a.threshold <= 1;
  if (input.tool === "mempalace_add_drawer") return exactKeys(a, ["wing", "room", "content", "added_by"]) && boundedString(a.wing, 128) && boundedString(a.room, 64) && boundedString(a.content, 8_192) && boundedString(a.added_by, 128);
  return exactKeys(a, ["agent_name", "entry", "topic", "wing"]) && boundedString(a.agent_name, 128) && boundedString(a.entry, 2_048) && boundedString(a.topic, 128) && boundedString(a.wing, 128);
}

function unwrapMcpResult(result: unknown, server: string, tool: string): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("MCP invocation returned an invalid result");
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) throw new Error("MCP invocation omitted bounded details");
  const d = details as Record<string, unknown>;
  if (d.error !== undefined) throw new Error("MCP invocation failed closed");
  if (d.mode !== "call" || d.server !== server || d.tool !== tool) throw new Error("MCP invocation identity mismatch");
  const raw = d.mcpResult;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || (raw as Record<string, unknown>).omitted === true) throw new Error("MCP raw result was omitted or spilled");
  const envelope = raw as Record<string, unknown>;
  if (envelope.isError === true || !Array.isArray(envelope.content) || envelope.content.length !== 1) throw new Error("MCP provider result envelope is invalid");
  const block = envelope.content[0];
  if (!block || typeof block !== "object" || Array.isArray(block) || (block as Record<string, unknown>).type !== "text" || typeof (block as Record<string, unknown>).text !== "string") throw new Error("MCP provider result is not bounded JSON text");
  const text = (block as Record<string, unknown>).text as string;
  if (Buffer.byteLength(text, "utf8") > 16_384) throw new Error("MCP provider JSON exceeds the invocation bound");
  try { return JSON.parse(text); } catch { throw new Error("MCP provider returned non-JSON text"); }
}

/** Return a lazy invoker tied to this exact Pi extension surface. It may be obtained before MCP registration. */
export function sessionOwnedMcpInvokerFor(pi: ExtensionAPI): SessionOwnedMcpInvoker {
  const binding = bindingFor(pi);
  return {
    serverState(server) { return binding.context ? binding.statuses.get(server) ?? "not-connected" : "not-connected"; },
    async invoke(input) {
      if (!validAutomaticMemoryInvocation(input)) throw new Error("automatic memory MCP invocation is not allowlisted");
      if (input.signal?.aborted) throw input.signal.reason ?? Object.assign(new Error("aborted"), { name: "AbortError" });
      const tool = binding.tool; const ctx = binding.context; const generation = binding.generation; const registration = binding.registration;
      if (!tool || !ctx) throw new Error("session MCP invoker is unavailable");
      const hash = argsHash(input.args);
      const result = await automaticApproval.run({ server: input.server, tool: input.tool, argsHash: hash, claimed: false }, () => tool.execute(`aili-memory-${generation}-${registration}`, { server: input.server, tool: input.tool, args: input.args }, input.signal, undefined, ctx));
      if (binding.context !== ctx || binding.tool !== tool || binding.generation !== generation || binding.registration !== registration) throw new Error("session MCP invoker became stale");
      return unwrapMcpResult(result, input.server, input.tool);
    },
  };
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
    const binding = bindingFor(pi);
    pi.on("session_start", (_event, ctx) => {
      binding.generation += 1;
      binding.context = ctx;
      // Status events belong to the adapter session that emitted them. A reload
      // may reuse the ExtensionAPI object, so never carry failed/auth state into
      // the new session generation while the adapter reconnects.
      binding.statuses.clear();
    });
    pi.on("session_shutdown", () => { binding.generation += 1; binding.context = undefined; binding.tool = undefined; binding.statuses.clear(); });
    if (typeof pi.events?.on === "function") {
      pi.events.on(MCP_STATUS_EVENT, (value) => {
        if (!isMcpStatusSnapshot(value)) return;
        binding.statuses = new Map(value.servers.map((server) => [server.name, server.status]));
      });
      pi.events.on(MCP_TOOL_APPROVAL_REQUEST_EVENT, (value) => {
        const active = automaticApproval.getStore();
        if (!active || active.claimed || !value || typeof value !== "object" || Array.isArray(value)) return;
        const request = value as McpToolApprovalRequest;
        if (request.origin !== "proxy" || request.serverName !== active.server || request.originalToolName !== active.tool) return;
        let hash: string; try { hash = argsHash(request.args); } catch { return; }
        if (hash === active.argsHash && request.claim(() => "allow_once")) active.claimed = true;
      });
    }
    approval?.(pi);
    const decorated = new Proxy(pi, {
      get(target, property) {
        if (property === "registerTool") return (tool: unknown) => {
          if (tool && typeof tool === "object" && (tool as { name?: unknown }).name === "mcp" && typeof (tool as { execute?: unknown }).execute === "function") {
            binding.registration += 1;
            binding.tool = tool as GenericMcpTool;
          }
          return Reflect.apply(target.registerTool as (value: unknown) => unknown, target, [tool]);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    adapter(decorated);
    // Feed the process-level runtime snapshot store for the web MCP panel
    // (latest view wins; the web side validates and redacts on read). Guarded:
    // minimal harnesses (unit tests) may omit the event bus entirely.
    if (typeof pi.events?.on === "function") {
      const store = subscribeMcpStatus(pi);
      pi.events.on(MCP_STATUS_EVENT, () => publishMcpRuntimeSnapshot(store.snapshot()));
      publishMcpRuntimeSnapshot(store.snapshot());
    }
  };
}

export function mcpConfigEvidencePath(env: McpEnvironment = process.env): string {
  const path = resolveSharedMcpConfigPath(env);
  const home = env.HOME?.trim();
  return home && path.startsWith(resolve(home) + "/")
    ? `~/${path.slice(resolve(home).length + 1)}`
    : path;
}
