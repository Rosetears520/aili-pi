import type {
  AgentTaskProjectionV1,
  ConnectionState,
  JsonValue,
  McpServerProjectionV1,
  RuntimeEventV1,
  RuntimeSnapshotV1,
  RuntimeStatusViewV1,
  WorkbenchProjectionV1,
} from "./contracts.js";
import { assertBoundedPublicJson, validateRuntimeEvent, validateRuntimeSnapshot } from "./contracts.js";

export interface AcceptedRuntimeState {
  readonly snapshot: RuntimeSnapshotV1;
  readonly connection: ConnectionState;
  readonly resetRequired: boolean;
  readonly resetReason?: string;
}

export type RuntimeEventAcceptance =
  | { readonly kind: "applied"; readonly state: AcceptedRuntimeState }
  | { readonly kind: "ignored-stale"; readonly state: AcceptedRuntimeState }
  | { readonly kind: "reset-required"; readonly state: AcceptedRuntimeState };

/**
 * Apply only ordered current-epoch events. This is the browser half of the
 * Pi Web reconnect/reconciliation pattern, strengthened with epoch/sequence.
 */
export function applyRuntimeEvent(current: AcceptedRuntimeState, input: unknown): RuntimeEventAcceptance {
  const event = validateRuntimeEvent(input);
  const snapshot = current.snapshot;
  if (event.runtimeEpoch !== snapshot.runtimeEpoch || event.sessionHandle !== snapshot.sessionHandle) {
    return reset(current, "runtime-epoch-changed");
  }
  if (event.sequence <= snapshot.lastSequence) return { kind: "ignored-stale", state: current };
  if (event.sequence !== snapshot.lastSequence + 1) return reset(current, "runtime-event-gap");
  if (event.leaseGeneration !== undefined && snapshot.writer.generation !== undefined
    && event.leaseGeneration !== snapshot.writer.generation) return { kind: "ignored-stale", state: current };
  if (event.eventType === "reset") return reset(current, "runtime-requested-reset");

  let projection = snapshot.projection;
  let state = snapshot.state;
  let writer = snapshot.writer;
  const patch = record(event.payload.projectionPatch) ? event.payload.projectionPatch as Readonly<Record<string, JsonValue>> : undefined;
  if (patch) {
    projection = Object.freeze({ ...projection, ...patch });
    assertBoundedPublicJson(projection);
  }
  if (event.eventType === "state" && isRuntimeState(event.payload.state)) state = event.payload.state;
  if (event.source === "lease") writer = writerFromEvent(writer, event);

  const next = validateRuntimeSnapshot({
    ...snapshot,
    lastSequence: event.sequence,
    cursor: event.cursor,
    createdAt: event.emittedAt,
    state,
    writer,
    projection,
  });
  return {
    kind: "applied",
    state: Object.freeze({ snapshot: next, connection: event.eventType === "closed" ? "offline" : "connected", resetRequired: false }),
  };
}

export function acceptRuntimeSnapshot(input: unknown, connection: ConnectionState = "connected"): AcceptedRuntimeState {
  return Object.freeze({ snapshot: validateRuntimeSnapshot(input), connection, resetRequired: false });
}

/**
 * Consume only explicit owner projections. Transcript/message text is not an
 * input to this function, so Agent/MCP state cannot be guessed from prose.
 */
export function projectWorkbenchRuntime(state: AcceptedRuntimeState): WorkbenchProjectionV1 {
  const root = state.snapshot.projection;
  const issues: string[] = [];
  // Current RuntimeHost/TUI projection uses top-level Pi fields; a nested
  // `pi` object is also accepted for the richer Web host projection.
  const piInput = explicitRecord(root.pi) ?? root;
  const agentInput = explicitRecord(root.agent);
  const mcpInput = explicitRecord(root.mcp);

  const agents: AgentTaskProjectionV1[] = [];
  if (Array.isArray(agentInput?.tasks)) {
    for (const task of agentInput.tasks.slice(0, 256)) {
      if (!record(task) || !safeId(task.handle) || !boundedText(task.label, 256)
        || !["queued", "running", "blocked", "completed", "failed", "cancelled"].includes(String(task.state))) {
        issues.push("agent-projection-item-invalid");
        continue;
      }
      const ownerAllowed = task.continuationAllowed === true;
      const capabilityAllowed = state.snapshot.capabilities["agent.continue"] === true;
      const writerAllowed = state.connection === "connected" && state.snapshot.writer.state === "owned" && state.snapshot.writer.owner === "web";
      agents.push(Object.freeze({
        handle: task.handle,
        label: task.label,
        state: task.state as AgentTaskProjectionV1["state"],
        ...(boundedText(task.summary, 2_000) ? { summary: task.summary } : {}),
        continuationAllowed: ownerAllowed && capabilityAllowed && writerAllowed,
      }));
    }
  } else if (agentInput !== undefined) issues.push("agent-projection-tasks-missing");

  const mcpServers: McpServerProjectionV1[] = [];
  if (Array.isArray(mcpInput?.servers)) {
    for (const server of mcpInput.servers.slice(0, 256)) {
      if (containsForbiddenMcpFields(server) || !record(server) || !safeId(server.handle) || !boundedText(server.label, 256)
        || !["lazy", "connecting", "connected", "disconnected", "error"].includes(String(server.state)) || typeof server.lazy !== "boolean") {
        issues.push("mcp-projection-item-redacted");
        continue;
      }
      mcpServers.push(Object.freeze({
        handle: server.handle,
        label: server.label,
        state: server.state as McpServerProjectionV1["state"],
        lazy: server.lazy,
        ...(Number.isSafeInteger(server.toolCount) && Number(server.toolCount) >= 0 && Number(server.toolCount) <= 100_000 ? { toolCount: Number(server.toolCount) } : {}),
        ...(boundedText(server.errorCategory, 160) ? { errorCategory: server.errorCategory } : {}),
      }));
    }
  } else if (mcpInput !== undefined) issues.push("mcp-projection-servers-missing");

  const contextTokens = finiteNonNegative(piInput?.contextTokens);
  const contextWindow = finitePositive(piInput?.contextWindow);
  const activeRun = boolean(piInput?.activeRun, state.snapshot.state === "running" || state.snapshot.writer.activeTurn);
  const leafId = safeId(piInput?.leafId) ? piInput.leafId : "root";
  return Object.freeze({
    pi: Object.freeze({
      provider: boundedText(piInput?.provider, 128) ? piInput.provider : null,
      model: boundedText(piInput?.model, 256) ? piInput.model : null,
      thinkingLevel: boundedText(piInput?.thinkingLevel, 64) ? piInput.thinkingLevel : null,
      contextTokens,
      contextWindow,
      connection: state.connection,
      activeRun,
      ...(boundedText(piInput?.runLabel, 160) ? { runLabel: piInput.runLabel } : {}),
      leafId,
    }),
    agents: Object.freeze(agents),
    mcpServers: Object.freeze(mcpServers),
    analyticsAvailable: state.snapshot.capabilities["analytics.read"] === true,
    stampAvailable: state.snapshot.capabilities["stamp.read"] === true,
    btwAvailable: state.snapshot.capabilities["btw.read"] === true,
    worktreeAvailable: state.snapshot.capabilities["worktree.read"] === true,
    projectionIssues: Object.freeze(issues),
  });
}

export function runtimeStatusView(state: AcceptedRuntimeState): RuntimeStatusViewV1 {
  const projection = projectWorkbenchRuntime(state);
  const writer = state.snapshot.writer;
  const writable = state.connection === "connected" && writer.state === "owned" && writer.owner === "web" && Boolean(writer.generation);
  const model = [projection.pi.provider, projection.pi.model].filter(Boolean).join("/") || "Unavailable";
  const context = projection.pi.contextTokens !== null && projection.pi.contextWindow !== null
    ? `${formatCount(projection.pi.contextTokens)} / ${formatCount(projection.pi.contextWindow)}`
    : "Unavailable";
  return Object.freeze({
    connection: state.connection,
    writer: writer.state === "unowned" ? "Unowned" : writer.state === "recovering" ? `Recovering ${writer.owner ?? "owner"}` : `${writer.owner === "web" ? "Web" : "TUI"} writer`,
    writable,
    activeRun: projection.pi.activeRun,
    model,
    thinking: projection.pi.thinkingLevel ?? "Unavailable",
    context,
    agent: agentsStatus(projection.agents),
    mcp: mcpStatus(projection.mcpServers),
  });
}

/** Inspection is read-only: the result deliberately has no connect command. */
export function inspectMcpProjection(state: AcceptedRuntimeState): Readonly<{
  mode: "projection-only";
  servers: readonly McpServerProjectionV1[];
  connectedCount: number;
}> {
  const servers = projectWorkbenchRuntime(state).mcpServers;
  return Object.freeze({ mode: "projection-only", servers, connectedCount: servers.filter((server) => server.state === "connected").length });
}

function writerFromEvent(current: RuntimeSnapshotV1["writer"], event: RuntimeEventV1): RuntimeSnapshotV1["writer"] {
  const writerState = event.payload.writerState;
  if (writerState === "unowned") return Object.freeze({ state: "unowned", activeTurn: false });
  if ((writerState === "owned" || writerState === "recovering") && (event.payload.owner === "web" || event.payload.owner === "tui") && event.leaseGeneration) {
    return Object.freeze({
      state: writerState,
      owner: event.payload.owner,
      generation: event.leaseGeneration,
      activeTurn: boolean(event.payload.activeTurn, current.activeTurn),
      ...(writerState === "recovering" ? { denialReason: "disconnect-grace" } : {}),
    });
  }
  if (event.eventType === "heartbeat" && current.state !== "unowned") return Object.freeze({ ...current, activeTurn: boolean(event.payload.activeTurn, current.activeTurn) });
  return current;
}
function reset(current: AcceptedRuntimeState, reason: string): RuntimeEventAcceptance {
  return { kind: "reset-required", state: Object.freeze({ ...current, connection: "reset-required", resetRequired: true, resetReason: reason }) };
}
function agentsStatus(agents: readonly AgentTaskProjectionV1[]): string {
  if (agents.length === 0) return "No projected Agents";
  const running = agents.filter((agent) => agent.state === "running").length;
  return running ? `${running} running / ${agents.length}` : `${agents.length} projected`;
}
function mcpStatus(servers: readonly McpServerProjectionV1[]): string {
  if (servers.length === 0) return "No projected MCP servers";
  return `${servers.filter((server) => server.state === "connected").length} connected / ${servers.length}`;
}
function containsForbiddenMcpFields(value: unknown): boolean {
  if (!record(value)) return true;
  return Object.keys(value).some((key) => /(?:config|environment|env|credential|secret|token|password|argument|payload)/i.test(key));
}
function explicitRecord(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | undefined { return record(value) ? value as Readonly<Record<string, JsonValue>> : undefined; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
function boundedText(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max && !/[\0\r]/.test(value); }
function boolean(value: unknown, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }
function finiteNonNegative(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function finitePositive(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null; }
function isRuntimeState(value: unknown): value is RuntimeSnapshotV1["state"] { return value === "idle" || value === "running" || value === "blocked" || value === "closed"; }
function formatCount(value: number): string { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value); }
