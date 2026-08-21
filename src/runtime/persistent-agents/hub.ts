import { createHash } from "node:crypto";
import { Type } from "typebox";
import type { CoordinatorJournal } from "./storage.js";
import type { AgentRecord, CoordinatorState, ModelIdentityProjection, TurnRecord } from "./types.js";
import { assertNoCredentialMaterial } from "./permission.js";
import {
  FORMAL_CONTINUATION_AUDIT_SCHEMA,
  FORMAL_RUNTIME_LIMITS,
  normalizeFormalContinuationAudit,
  sameFormalContinuationAudit,
  type FormalContinuationAudit,
} from "./task-schema.js";

const OrdinaryHubSendSchema = Type.Object({
  action: Type.Literal("send"),
  agentId: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
  messageId: Type.Optional(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

const FormalHubSendSchema = Type.Object({
  action: Type.Literal("send"),
  agentId: Type.String({ minLength: 1 }),
  message: Type.String({
    minLength: 1,
    maxLength: FORMAL_RUNTIME_LIMITS.hubMessageBytes,
    pattern: "^(?!\\s)[^\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029]*\\S$",
  }),
  messageId: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
  continuationAudit: FORMAL_CONTINUATION_AUDIT_SCHEMA,
}, { additionalProperties: false });

export const HUB_TOOL_SCHEMA = Type.Union([
  Type.Object({ action: Type.Literal("list"), includeReleased: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
  OrdinaryHubSendSchema,
  FormalHubSendSchema,
  Type.Object({ action: Type.Literal("wait"), jobIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))), messageIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))), timeoutMs: Type.Optional(Type.Number({ minimum: 0 })), pollIntervalMs: Type.Optional(Type.Number({ minimum: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("inbox"), agentId: Type.String({ minLength: 1 }), mode: Type.Optional(Type.Union([Type.Literal("peek"), Type.Literal("drain")])) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("output"), agentId: Type.String({ minLength: 1 }), offset: Type.Optional(Type.Number({ minimum: 0 })), limit: Type.Optional(Type.Number({ minimum: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("history"), agentId: Type.String({ minLength: 1 }), offset: Type.Optional(Type.Number({ minimum: 0 })), limit: Type.Optional(Type.Number({ minimum: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("jobs"), jobId: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("cancel"), id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("model"), operation: Type.Union([Type.Literal("query"), Type.Literal("request"), Type.Literal("clear")]), agentId: Type.Optional(Type.String({ minLength: 1 })), selector: Type.Optional(Type.String({ minLength: 1 })), model: Type.Optional(Type.String({ minLength: 1 })), thinking: Type.Optional(Type.Union([Type.Literal("off"), Type.Literal("minimal"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"), Type.Literal("xhigh"), Type.Literal("max")])) }, { additionalProperties: false }),
]);

export interface HubCaller {
  agentId?: string;
}

export interface LiveAgentAdapter {
  steer(message: string): void | Promise<void>;
  sendUserMessage(message: string): void | Promise<void>;
  abort?(reason: string): void | Promise<void>;
  dispose(): void | Promise<void>;
}

export class PermanentReviveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentReviveError";
  }
}

export interface HubServiceOptions {
  journal: CoordinatorJournal;
  revive: (agent: AgentRecord) => Promise<LiveAgentAdapter>;
  preflightContinuation?: (agent: AgentRecord) => void | Promise<void>;
  cancelJob?: (jobId: string) => Promise<"queued" | "running" | "not-found">;
  output?: (agent: AgentRecord, offset: number, limit: number) => Promise<unknown>;
  history?: (agent: AgentRecord, offset: number, limit: number) => Promise<unknown>;
  model?: (request: Record<string, unknown>, caller: HubCaller) => Promise<unknown>;
  onRelease?: (agent: AgentRecord) => void | Promise<void>;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface DurableMessage {
  id: string;
  agentId: string;
  senderAgentId?: string;
  content: string;
  createdAt: string;
  formalContinuationIdentity?: FormalContinuationAudit;
}

function nextId(prefix: string, existing: Iterable<string>): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const id of existing) {
    const match = id.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function strictKeys(value: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`hub input contains unknown fields: ${unknown.join(", ")}`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function formalHubMessage(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error("hub.message for a formal Agent must be an exact non-empty string");
  }
  if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(value)) {
    throw new Error("hub.message for a formal Agent must be a single line without control characters");
  }
  if (Buffer.byteLength(value, "utf8") > FORMAL_RUNTIME_LIMITS.hubMessageBytes) {
    throw new Error(`hub.message for a formal Agent exceeds ${FORMAL_RUNTIME_LIMITS.hubMessageBytes} UTF-8 bytes`);
  }
  return value;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function nonNegativeInteger(value: unknown, fallback: number, label: string, minimum = 0): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`${label} must be an integer >= ${minimum}`);
  return value as number;
}

function isDescendant(state: CoordinatorState, ancestorId: string, targetId: string): boolean {
  if (ancestorId === targetId) return true;
  let cursor = state.agents[targetId] ?? state.releasedAgents[targetId];
  const seen = new Set<string>();
  while (cursor?.parentAgentId && !seen.has(cursor.id)) {
    if (cursor.parentAgentId === ancestorId) return true;
    seen.add(cursor.id);
    cursor = state.agents[cursor.parentAgentId] ?? state.releasedAgents[cursor.parentAgentId];
  }
  return false;
}

function metadataString(
  keys: string | readonly string[],
  ...sources: Array<Record<string, unknown> | undefined>
): string | undefined {
  const candidates = typeof keys === "string" ? [keys] : keys;
  for (const source of sources) {
    for (const key of candidates) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
      const nested = source?.model;
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        const nestedValue = (nested as Record<string, unknown>)[key];
        if (typeof nestedValue === "string" && nestedValue.trim().length > 0) return nestedValue.trim();
      }
    }
  }
  return undefined;
}

function metadataObject(
  key: string,
  ...sources: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  for (const source of sources) {
    const value = source?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return undefined;
}

function canonicalMetadataModel(provider: string | undefined, model: string | undefined): string | undefined {
  return provider && model ? `${provider}/${model}` : undefined;
}

interface HubIdentityProjection extends ModelIdentityProjection {
  name?: string;
  status: string;
  agentState?: string;
  jobState?: string;
  turnState?: string;
  outputRef: string;
  historyRef: string;
  turnId?: string;
  jobId?: string;
  parentAgentId?: string;
}

/**
 * Durable display identity is resolved newest-to-oldest (turn, job, Agent),
 * field by field.  In particular, an execution audit containing an undefined
 * field cannot erase the Agent's frozen allocation identity.
 */
function hubIdentity(
  agent: AgentRecord,
  job?: { id: string; metadata?: Record<string, unknown>; state?: string },
  turn?: TurnRecord,
  preferFrozenAgent = false,
): HubIdentityProjection {
  const newestSources = [
    turn?.metadata,
    turn as unknown as Record<string, unknown> | undefined,
    job?.metadata,
    job as unknown as Record<string, unknown> | undefined,
  ];
  const agentSources = [agent.metadata, agent as unknown as Record<string, unknown>];
  const sources = preferFrozenAgent ? [...agentSources, ...newestSources] : [...newestSources, ...agentSources];
  const currentOrSources = (keys: string | readonly string[]): string | undefined => {
    const keyList = typeof keys === "string" ? [keys] : keys;
    return currentTurnMetadata && keyList.some((key) => Object.prototype.hasOwnProperty.call(currentTurnMetadata, key))
      ? metadataString(keys, currentTurnMetadata)
      : metadataString(keys, ...sources);
  };
  const currentTurnMetadata = turn?.metadata;
  const rawModel = currentOrSources("model");
  const modelProvider = rawModel?.includes("/") ? rawModel.slice(0, rawModel.indexOf("/")) : undefined;
  const model = rawModel?.includes("/") ? rawModel.slice(rawModel.indexOf("/") + 1) : rawModel;
  const provider = currentOrSources("provider") ?? modelProvider;
  const effectiveModel = currentOrSources(["effectiveModel", "effective", "canonical"])
    ?? (rawModel?.includes("/") ? rawModel : undefined)
    ?? canonicalMetadataModel(provider, model);
  const requestedModel = currentTurnMetadata && Object.prototype.hasOwnProperty.call(currentTurnMetadata, "requestedModel")
    ? metadataString(["requestedModel", "requested"], currentTurnMetadata)
    : currentOrSources(["requestedModel", "requested"]);
  const requestedThinking = currentTurnMetadata && Object.prototype.hasOwnProperty.call(currentTurnMetadata, "requestedThinking")
    ? metadataString("requestedThinking", currentTurnMetadata)
    : currentOrSources("requestedThinking");
  const modelLayer = currentOrSources(["modelLayer", "layer"]);
  const thinking = currentOrSources("thinking");
  const rawSource = currentOrSources("source");
  const source = rawSource && !rawSource.startsWith("hub.") ? rawSource : undefined;
  const modelSource = currentOrSources("modelSource") ?? source;
  const thinkingSource = currentOrSources("thinkingSource");
  const effectiveMode = currentOrSources(["effectiveMode", "mode"]);
  const effectiveModeReason = currentOrSources("effectiveModeReason");
  const service = currentOrSources(["service", "serviceMode"]);
  const speedTier = currentOrSources("speedTier");
  const parentResolution = metadataObject("parentResolution", ...sources);
  const parentModel = currentOrSources(["parentModel", "parentEffectiveModel", "parentCanonicalModel"])
    ?? metadataString(["effectiveModel", "effective", "canonical"], parentResolution);
  const parentThinking = currentOrSources("parentThinking")
    ?? metadataString("thinking", parentResolution);
  const parentSpeedTier = currentOrSources("parentSpeedTier")
    ?? metadataString("speedTier", parentResolution);
  const parentSource = currentOrSources("parentSource")
    ?? metadataString(["modelSource", "source"], parentResolution);
  const effectiveProvenance = currentOrSources(["effectiveProvenance", "effectiveSource"]);
  const jobId = turn?.jobId ?? job?.id ?? agent.currentJobId;
  const turnId = turn?.id ?? agent.currentTurnId;
  const outputRef = metadataString("outputRef", ...sources) ?? `agent://${agent.id}`;
  const historyRef = metadataString("historyRef", ...sources) ?? `history://${agent.id}`;
  return {
    name: agent.name,
    ...(requestedModel ? { requestedModel, requested: requestedModel } : {}),
    ...(requestedThinking ? { requestedThinking } : {}),
    ...(effectiveModel ? { effectiveModel, effective: effectiveModel, canonical: effectiveModel } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(modelLayer ? { modelLayer, layer: modelLayer } : {}),
    ...(thinking ? { thinking } : {}),
    ...(modelSource ? { modelSource } : {}),
    ...(thinkingSource ? { thinkingSource } : {}),
    ...(source ? { source } : {}),
    ...(speedTier ? { speedTier } : {}),
    ...(service ? { service } : {}),
    ...(parentModel ? { parentModel } : {}),
    ...(parentThinking ? { parentThinking } : {}),
    ...(parentSpeedTier ? { parentSpeedTier } : {}),
    ...(parentSource ? { parentSource } : {}),
    ...(effectiveProvenance ? { effectiveProvenance } : {}),
    ...(effectiveMode ? { effectiveMode } : {}),
    ...(effectiveModeReason ? { effectiveModeReason } : {}),
    status: turn?.state ?? job?.state ?? agent.state,
    agentState: agent.state,
    ...(job?.state ? { jobState: job.state } : {}),
    ...(turn?.state ? { turnState: turn.state } : {}),
    outputRef,
    historyRef,
    ...(turnId ? { turnId } : {}),
    ...(jobId ? { jobId } : {}),
    ...(agent.parentAgentId ? { parentAgentId: agent.parentAgentId } : {}),
  };
}

/** Copy only the Agent's recorded/frozen identity into a hub continuation.
 * No root Parent model or call argument is consulted here. */
function frozenContinuationMetadata(agent: AgentRecord): Record<string, unknown> {
  // Only the direct-parent snapshot is carried across a continuation. The
  // prior Agent effective identity may be a turn-local one-shot and must not
  // become the next turn's requested/effective model.
  const projection = hubIdentity(agent, undefined, undefined, true);
  const copied: Record<string, unknown> = {};
  for (const [field, value] of [
    ["parentModel", projection.parentModel],
    ["parentThinking", projection.parentThinking],
    ["parentSpeedTier", projection.parentSpeedTier],
    ["parentSource", projection.parentSource],
  ] as const) {
    if (typeof value === "string" && value.length > 0) copied[field] = value;
  }
  return copied;
}

export class HubService {
  private readonly live = new Map<string, LiveAgentAdapter>();
  private readonly agentTails = new Map<string, Promise<void>>();
  private readonly clock: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HubServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  registerLive(agentId: string, live: LiveAgentAdapter): void {
    const state = this.options.journal.getState();
    if (!state.agents[agentId]) throw new Error(`${agentId}: cannot register live adapter for unknown Agent`);
    if (this.live.has(agentId)) throw new Error(`${agentId}: live adapter already registered`);
    this.live.set(agentId, live);
  }

  unregisterLive(agentId: string): void {
    this.live.delete(agentId);
  }

  async park(agentId: string): Promise<boolean> {
    return await this.withAgentOperation(agentId, async () => {
      const agent = this.options.journal.getState().agents[agentId];
      if (!agent || agent.state !== "idle") return false;
      const live = this.live.get(agentId);
      if (live) await live.dispose();
      this.live.delete(agentId);
      await this.options.journal.append({ kind: "agent.state", agentId, payload: { from: "idle", to: "parked", currentJobId: null, currentTurnId: null } });
      return true;
    });
  }

  async execute(raw: unknown, caller: HubCaller = {}): Promise<unknown> {
    const input = record(raw, "hub input");
    const action = requiredString(input.action, "hub.action");
    switch (action) {
      case "list":
        strictKeys(input, ["action", "includeReleased"]);
        return this.list(caller, input.includeReleased === true);
      case "send":
        strictKeys(input, ["action", "agentId", "message", "messageId", "continuationAudit"]);
        {
          const agentId = requiredString(input.agentId, "hub.agentId");
          return await this.withAgentOperation(agentId, async () => await this.send(
            agentId,
            input.message,
            caller,
            typeof input.messageId === "string" ? input.messageId : undefined,
            input.continuationAudit,
          ));
        }
      case "inbox":
        strictKeys(input, ["action", "agentId", "mode"]);
        {
          const agentId = requiredString(input.agentId, "hub.agentId");
          return await this.withAgentOperation(agentId, async () => await this.inbox(agentId, input.mode === "drain" ? "drain" : "peek", caller));
        }
      case "jobs":
        strictKeys(input, ["action", "jobId"]);
        return this.jobs(caller, typeof input.jobId === "string" ? input.jobId : undefined);
      case "cancel":
        strictKeys(input, ["action", "id"]);
        {
          const id = requiredString(input.id, "hub.id");
          const key = this.options.journal.getState().jobs[id]?.agentId ?? id;
          return await this.withAgentOperation(key, async () => await this.cancel(id, caller));
        }
      case "wait":
        strictKeys(input, ["action", "jobIds", "messageIds", "timeoutMs", "pollIntervalMs"]);
        return await this.wait(input, caller);
      case "output":
      case "history": {
        strictKeys(input, ["action", "agentId", "offset", "limit"]);
        const agent = this.ownedAgent(requiredString(input.agentId, "hub.agentId"), caller, true);
        const offset = nonNegativeInteger(input.offset, 0, "hub.offset");
        const limit = nonNegativeInteger(input.limit, 500, "hub.limit", 1);
        const resolver = action === "output" ? this.options.output : this.options.history;
        if (!resolver) throw new Error(`hub ${action} resolver is unavailable`);
        return await resolver(agent, offset, limit);
      }
      case "model":
        strictKeys(input, ["action", "operation", "agentId", "selector", "model", "thinking"]);
        if (!this.options.model) throw new Error("hub model operations are unavailable");
        if (typeof input.agentId === "string" && input.agentId.trim()) {
          const agentId = requiredString(input.agentId, "hub.agentId");
          return await this.withAgentOperation(agentId, async () => await this.options.model!(input, caller));
        }
        return await this.options.model(input, caller);
      default:
        throw new Error(`unknown hub action: ${action}`);
    }
  }

  async settleMessageTurn(agentId: string, turnId: string, status: "completed" | "failed" | "aborted", error?: string): Promise<void> {
    await this.withAgentOperation(agentId, async () => await this.settleMessageTurnUnlocked(agentId, turnId, status, error));
  }

  private async settleMessageTurnUnlocked(agentId: string, turnId: string, status: "completed" | "failed" | "aborted", error?: string): Promise<void> {
    const state = this.options.journal.getState();
    const agent = state.agents[agentId];
    const turn = state.turns[turnId];
    if (!agent || !turn || turn.agentId !== agentId || turn.state !== "running" || agent.state !== "running") {
      throw new Error(`${agentId}/${turnId}: no matching running message turn`);
    }
    await this.options.journal.append({
      kind: "turn.state",
      agentId,
      turnId,
      payload: { from: "running", to: status, outcome: error ?? status },
    });
    await this.options.journal.append({
      kind: "agent.state",
      agentId,
      payload: { from: "running", to: status === "aborted" ? "aborted" : "idle", currentTurnId: null },
    });
  }

  private async withAgentOperation<T>(agentId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.agentTails.get(agentId) ?? Promise.resolve();
    const current = previous.then(operation);
    const tail = current.then(() => undefined, () => undefined);
    this.agentTails.set(agentId, tail);
    try {
      return await current;
    } finally {
      if (this.agentTails.get(agentId) === tail) this.agentTails.delete(agentId);
    }
  }

  private list(caller: HubCaller, includeReleased: boolean) {
    const state = this.options.journal.getState();
    const visible = (agent: AgentRecord) => !caller.agentId || isDescendant(state, caller.agentId, agent.id);
    const display = (agent: AgentRecord) => {
      const latestTurn = Object.values(state.turns)
        .filter((candidate) => candidate.agentId === agent.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      const job = latestTurn?.jobId
        ? state.jobs[latestTurn.jobId]
        : agent.currentJobId
          ? state.jobs[agent.currentJobId]
          : undefined;
      const identity = hubIdentity(agent, job, latestTurn);
      return {
        ...agent,
        display: {
          selector: agent.selector,
          name: agent.name,
          ...identity,
        },
      };
    };
    return {
      agents: Object.values(state.agents).filter(visible).map(display),
      released: includeReleased ? Object.values(state.releasedAgents).filter(visible).map(display) : [],
    };
  }

  private ownedAgent(agentId: string, caller: HubCaller, includeReleased = false): AgentRecord {
    const state = this.options.journal.getState();
    const agent = state.agents[agentId] ?? (includeReleased ? state.releasedAgents[agentId] : undefined);
    if (!agent) throw new Error(`${agentId}: unknown Agent in this parent`);
    if (caller.agentId && !isDescendant(state, caller.agentId, agentId)) throw new Error(`${agentId}: cross-owner Agent access denied`);
    return agent;
  }

  private messageReceipt(messageId: string): Record<string, unknown> | undefined {
    return this.options.journal.getState().messages[messageId];
  }

  private messageReceiptPayload(message: DurableMessage, status: string, details: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      status,
      agentId: message.agentId,
      senderAgentId: message.senderAgentId,
      createdAt: message.createdAt,
      contentHash: contentHash(message.content),
      ...(message.formalContinuationIdentity ? { formalContinuationIdentity: message.formalContinuationIdentity } : {}),
      ...details,
    };
  }

  private async putMessage(message: DurableMessage, status: string, details: Record<string, unknown> = {}): Promise<void> {
    await this.options.journal.append({
      kind: "message.put",
      agentId: message.agentId,
      messageId: message.id,
      payload: this.messageReceiptPayload(message, status, details),
    });
  }

  private continuationIdentity(agent: AgentRecord, supplied: unknown): FormalContinuationAudit | undefined {
    const persisted = agent.metadata?.formalContinuationIdentity;
    if (persisted === undefined) {
      if (supplied !== undefined) throw new Error(`${agent.id}: ordinary Agent cannot accept a formal continuationAudit`);
      return undefined;
    }
    const expected = normalizeFormalContinuationAudit(persisted, `${agent.id}.metadata.formalContinuationIdentity`);
    if (expected.canonicalRole !== agent.selector) {
      throw new Error(`${agent.id}: persisted formal continuation role does not match the exact Agent selector`);
    }
    if (supplied === undefined) {
      throw new Error(`${agent.id}: formal continuation requires the complete unchanged continuationAudit; create a new bounded job/Agent`);
    }
    const actual = normalizeFormalContinuationAudit(supplied, "hub.continuationAudit");
    if (!sameFormalContinuationAudit(expected, actual)) {
      throw new Error(`${agent.id}: formal continuation identity changed; create a new bounded job/Agent`);
    }
    return expected;
  }

  private formalTurnWorkspaceMetadata(agent: AgentRecord): Record<string, unknown> {
    const formalProtection = agent.metadata?.formalProtection;
    if (formalProtection === undefined) return {};
    const lease = this.options.journal.getState().workspaceLeases[agent.id];
    if (!lease) {
      if (this.options.preflightContinuation) {
        throw new Error(`${agent.id}: formal workspace lease is unavailable; continuation is refused`);
      }
      return {
        formalProtection: structuredClone(formalProtection),
        formalWorkspaceRequest: structuredClone(agent.metadata?.formalWorkspaceRequest),
      };
    }
    for (const key of ["formalProtection", "formalContinuationIdentity", "formalWorkspaceRequest"] as const) {
      if (JSON.stringify(agent.metadata?.[key]) !== JSON.stringify(lease[key])) {
        throw new Error(`${agent.id}: formal ${key} differs from the durable workspace lease; continuation is refused`);
      }
    }
    return {
      formalProtection: structuredClone(lease.formalProtection),
      formalWorkspaceRequest: structuredClone(lease.formalWorkspaceRequest),
      formalWorkspaceIdentity: {
        mode: lease.mode,
        requestedMode: lease.requestedMode,
        projectRoot: lease.projectRoot,
        root: lease.root,
        cwd: lease.cwd,
        scope: structuredClone(lease.scope),
        selector: lease.selector,
      },
    };
  }

  private formalSteerPreflight(agent: AgentRecord, identity: FormalContinuationAudit): {
    live: LiveAgentAdapter;
    turnId: string;
    auditCount: number;
  } {
    const state = this.options.journal.getState();
    const currentAgent = state.agents[agent.id];
    const turnId = currentAgent?.currentTurnId;
    const turn = turnId ? state.turns[turnId] : undefined;
    if (!currentAgent || currentAgent.state !== "running" || !turnId || !turn
      || turn.agentId !== agent.id || turn.state !== "running") {
      throw new Error(`${agent.id}: running formal Agent has no exact running turn for continuation audit`);
    }
    const existing = turn.metadata?.formalContinuationAudits;
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new Error(`${agent.id}/${turnId}: formal continuation audit history is malformed`);
    }
    const seen = new Set<string>();
    for (const [index, value] of (existing ?? []).entries()) {
      const entry = record(value, `${agent.id}/${turnId}.formalContinuationAudits[${index}]`);
      if (Object.keys(entry).length !== 3
        || !Object.hasOwn(entry, "messageId")
        || !Object.hasOwn(entry, "contentHash")
        || !Object.hasOwn(entry, "unchangedIdentity")
        || typeof entry.messageId !== "string"
        || !/^[A-Za-z0-9._:-]{1,160}$/.test(entry.messageId)
        || entry.messageId.includes("..")
        || typeof entry.contentHash !== "string"
        || !/^[0-9a-f]{64}$/.test(entry.contentHash)
        || seen.has(entry.messageId)) {
        throw new Error(`${agent.id}/${turnId}: formal continuation audit history is malformed`);
      }
      let priorIdentity: FormalContinuationAudit;
      try {
        priorIdentity = normalizeFormalContinuationAudit(entry.unchangedIdentity, `${agent.id}/${turnId}.formalContinuationAudits[${index}].unchangedIdentity`);
      } catch {
        throw new Error(`${agent.id}/${turnId}: formal continuation audit history is malformed`);
      }
      if (!sameFormalContinuationAudit(identity, priorIdentity)) {
        throw new Error(`${agent.id}/${turnId}: formal continuation audit history changed identity`);
      }
      seen.add(entry.messageId);
    }
    const live = this.live.get(agent.id);
    if (!live) throw new Error(`${agent.id}: running formal Agent live adapter is unavailable`);
    return { live, turnId, auditCount: existing?.length ?? 0 };
  }

  private async prepareFormalSteer(
    agent: AgentRecord,
    message: DurableMessage,
    identity: FormalContinuationAudit,
    turnId: string,
    auditCount: number,
  ): Promise<void> {
    const hash = contentHash(message.content);
    await this.options.journal.append({
      kind: "formal.message.prepared",
      agentId: agent.id,
      turnId,
      messageId: message.id,
      payload: {
        expectedAuditCount: auditCount,
        audit: { messageId: message.id, contentHash: hash, unchangedIdentity: identity },
        receipt: this.messageReceiptPayload(message, "pending"),
      },
    });
  }

  private assertFormalDuplicate(
    messageId: string,
    existing: Record<string, unknown>,
    message: DurableMessage,
    identity: FormalContinuationAudit,
  ): void {
    let storedIdentity: FormalContinuationAudit;
    try {
      storedIdentity = normalizeFormalContinuationAudit(existing.formalContinuationIdentity, `${messageId}.formalContinuationIdentity`);
    } catch {
      throw new Error(`${messageId}: formal message ID collides with a different or malformed audit`);
    }
    if (existing.agentId !== message.agentId
      || existing.senderAgentId !== message.senderAgentId
      || existing.contentHash !== contentHash(message.content)
      || !sameFormalContinuationAudit(storedIdentity, identity)) {
      throw new Error(`${messageId}: formal message ID collides with different agent, sender, content, or continuation audit`);
    }
  }

  private async send(
    agentId: string,
    rawContent: unknown,
    caller: HubCaller,
    requestedMessageId?: string,
    suppliedContinuationAudit?: unknown,
  ): Promise<Record<string, unknown>> {
    const agent = this.ownedAgent(agentId, caller);
    if (agent.state === "aborted") throw new Error(`${agentId}: Agent is terminal aborted`);
    const continuationIdentity = this.continuationIdentity(agent, suppliedContinuationAudit);
    const content = continuationIdentity ? formalHubMessage(rawContent) : requiredString(rawContent, "hub.message");
    await assertNoCredentialMaterial(content, "hub message");
    if (continuationIdentity) await this.options.preflightContinuation?.(agent);
    const formalTurnMetadata = continuationIdentity ? this.formalTurnWorkspaceMetadata(agent) : {};
    const state = this.options.journal.getState();
    const messageId = requestedMessageId?.trim() || nextId("message", Object.keys(state.messages));
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(messageId) || messageId.includes("..")) throw new Error("messageId is unsafe");
    const message: DurableMessage = {
      id: messageId,
      agentId,
      senderAgentId: caller.agentId,
      content,
      createdAt: this.clock().toISOString(),
      formalContinuationIdentity: continuationIdentity,
    };
    const existing = this.messageReceipt(messageId);
    if (existing) {
      if (continuationIdentity) this.assertFormalDuplicate(messageId, existing, message, continuationIdentity);
      else if (existing.agentId !== agentId) throw new Error(`${messageId}: message ID is owned by another Agent`);
      const queued = this.options.journal.getState().mailboxes[agentId]?.messages.some((item) => item.id === messageId);
      return { messageId, deduplicated: true, ...(queued && existing.status === "pending" ? { ...existing, status: "queued" } : existing) };
    }

    if (agent.state === "running") {
      if (continuationIdentity) {
        const preflight = this.formalSteerPreflight(agent, continuationIdentity);
        await this.prepareFormalSteer(agent, message, continuationIdentity, preflight.turnId, preflight.auditCount);
        try {
          await preflight.live.steer(content);
        } catch (error) {
          return await this.enqueueAfterLiveFailure(message, error instanceof Error ? error.message : String(error));
        }
        await this.putMessage(message, "delivered", { delivery: "steer-safe-boundary" });
        return { messageId, status: "delivered", delivery: "steer-safe-boundary" };
      }
      await this.putMessage(message, "pending");
      const live = this.live.get(agentId);
      if (!live) return await this.enqueueAfterLiveFailure(message, "running Agent live adapter is unavailable");
      try {
        await live.steer(content);
        await this.putMessage(message, "delivered", { delivery: "steer-safe-boundary" });
        return { messageId, status: "delivered", delivery: "steer-safe-boundary" };
      } catch (error) {
        return await this.enqueueAfterLiveFailure(message, error instanceof Error ? error.message : String(error));
      }
    }

    await this.putMessage(message, "pending");

    if (agent.state === "parked") {
      let revived: LiveAgentAdapter;
      try {
        // The revive boundary receives the same frozen allocation snapshot as
        // the continuation turn.  This is an evidence hand-off only; it never
        // falls back to the root Main model or writes a new override.
        const continuationIdentity = frozenContinuationMetadata(agent);
        const frozenAgent = {
          ...agent,
          requestedModel: undefined,
          requestedThinking: undefined,
          effectiveModel: undefined,
          provider: undefined,
          model: undefined,
          modelLayer: undefined,
          thinking: undefined,
          modelSource: undefined,
          thinkingSource: undefined,
          source: undefined,
          speedTier: undefined,
          metadata: {
            ...(agent.metadata ?? {}),
            requestedModel: null,
            requestedThinking: null,
            effectiveModel: null,
            provider: null,
            model: null,
            modelLayer: null,
            thinking: null,
            modelSource: null,
            thinkingSource: null,
            source: null,
            speedTier: null,
            ...continuationIdentity,
          },
        } as AgentRecord;
        revived = await this.options.revive(frozenAgent);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.putMessage(message, "failed", { permanent: true, reason });
        return { messageId, status: "failed", permanent: true, reason };
      }
      this.live.set(agentId, revived);
      return await this.startMessageTurn(agent, message, revived, "parked", continuationIdentity, formalTurnMetadata);
    }

    if (agent.state === "idle") {
      const live = this.live.get(agentId);
      if (!live) return await this.enqueueAfterLiveFailure(message, "idle Agent live adapter is unavailable");
      return await this.startMessageTurn(agent, message, live, "idle", continuationIdentity, formalTurnMetadata);
    }
    throw new Error(`${agentId}: Agent state ${agent.state} cannot receive messages`);
  }

  private async startMessageTurn(
    agent: AgentRecord,
    message: DurableMessage,
    live: LiveAgentAdapter,
    priorState: "idle" | "parked",
    continuationIdentity?: FormalContinuationAudit,
    formalTurnMetadata: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const state = this.options.journal.getState();
    const turnId = nextId("turn", Object.keys(state.turns));
    const now = this.clock().toISOString();
    const frozenIdentity = frozenContinuationMetadata(agent);
    const turn: TurnRecord = {
      id: turnId,
      agentId: agent.id,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      metadata: {
        turnSource: "hub.send",
        service: "hub",
        effectiveMode: "hub",
        effectiveModeReason: "hub-follow-up",
        messageId: message.id,
        requestedModel: null,
        requestedThinking: null,
        effectiveModel: null,
        provider: null,
        model: null,
        modelLayer: null,
        thinking: null,
        speedTier: null,
        modelSource: null,
        thinkingSource: null,
        source: null,
        outputRef: `agent://${agent.id}`,
        historyRef: `history://${agent.id}`,
        ...(continuationIdentity ? { formalContinuationIdentity: continuationIdentity } : {}),
        ...formalTurnMetadata,
        ...frozenIdentity,
      },
    };
    await this.options.journal.append({ kind: "turn.created", agentId: agent.id, turnId, payload: { record: turn } });
    await this.options.journal.append({ kind: "agent.state", agentId: agent.id, payload: { from: priorState, to: "running", currentTurnId: turnId, currentJobId: null } });
    await this.options.journal.append({ kind: "turn.state", agentId: agent.id, turnId, payload: { from: "queued", to: "running" } });
    try {
      await live.sendUserMessage(message.content);
      await this.putMessage(message, "delivered", { delivery: priorState === "parked" ? "revive-turn" : "idle-turn", turnId });
      const current = this.options.journal.getState();
      const currentTurn = current.turns[turnId];
      const currentJob = currentTurn?.jobId ? current.jobs[currentTurn.jobId] : undefined;
      const identity = hubIdentity(agent, currentJob, currentTurn);
      return {
        messageId: message.id,
        status: "delivered",
        delivery: priorState === "parked" ? "revive-turn" : "idle-turn",
        turnId,
        ...(identity.effectiveModel ? { effectiveModel: identity.effectiveModel } : {}),
        ...(identity.thinking ? { thinking: identity.thinking } : {}),
        ...(identity.modelLayer ? { modelLayer: identity.modelLayer } : {}),
        ...(identity.source ? { source: identity.source } : {}),
        ...(identity.parentSource ? { parentSource: identity.parentSource } : {}),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.options.journal.append({ kind: "turn.state", agentId: agent.id, turnId, payload: { from: "running", to: "failed", outcome: reason } });
      await this.options.journal.append({ kind: "agent.state", agentId: agent.id, payload: { from: "running", to: priorState, currentTurnId: null } });
      if (priorState === "parked") {
        await Promise.resolve(live.dispose()).catch(() => undefined);
        this.live.delete(agent.id);
      }
      return await this.enqueueAfterLiveFailure(message, reason);
    }
  }

  private async enqueueAfterLiveFailure(message: DurableMessage, reason: string): Promise<Record<string, unknown>> {
    const state = this.options.journal.getState();
    const current = state.mailboxes[message.agentId]?.messages ?? [];
    if (current.length >= 100) {
      await this.putMessage(message, "overflow", { reason: "mailbox-cap-100", liveFailure: reason });
      return { messageId: message.id, status: "failed", overflow: true, reason: "mailbox-cap-100" };
    }
    const queued = [...current, message as unknown as Record<string, unknown>];
    await this.options.journal.append({ kind: "mailbox.put", agentId: message.agentId, messageId: message.id, payload: { messages: queued } });
    await this.putMessage(message, "queued", { liveFailure: reason });
    return { messageId: message.id, status: "queued", mailboxSize: queued.length, reason };
  }

  private async inbox(agentId: string, mode: "peek" | "drain", caller: HubCaller) {
    this.ownedAgent(agentId, caller);
    const messages = this.options.journal.getState().mailboxes[agentId]?.messages ?? [];
    if (mode === "drain" && messages.length > 0) {
      await this.options.journal.append({ kind: "mailbox.put", agentId, payload: { messages: [] } });
    }
    return { agentId, mode, count: messages.length, messages };
  }

  private jobs(caller: HubCaller, jobId?: string) {
    const state = this.options.journal.getState();
    const visible = Object.values(state.jobs).filter((job) => {
      if (jobId && job.id !== jobId) return false;
      return !caller.agentId || isDescendant(state, caller.agentId, job.agentId);
    }).map((job) => {
      const agent = state.agents[job.agentId] ?? state.releasedAgents[job.agentId];
      const turn = Object.values(state.turns).find((candidate) => candidate.jobId === job.id && candidate.agentId === job.agentId);
      const identity = agent
        ? hubIdentity(agent, job, turn)
        : {
          status: job.state,
          jobId: job.id,
          outputRef: `agent://${job.agentId}`,
          historyRef: `history://${job.agentId}`,
        } satisfies HubIdentityProjection;
      return {
        ...job,
        display: {
          selector: agent?.selector,
          name: agent?.name,
          ...identity,
        },
      };
    });
    if (jobId && visible.length === 0) throw new Error(`${jobId}: unknown or cross-owner job`);
    return { jobs: visible };
  }

  private async cancel(id: string, caller: HubCaller): Promise<Record<string, unknown>> {
    const state = this.options.journal.getState();
    const job = state.jobs[id];
    if (job) {
      this.ownedAgent(job.agentId, caller);
      if (!this.options.cancelJob) throw new Error("job cancellation bridge is unavailable");
      const live = this.live.get(job.agentId);
      await live?.abort?.(`hub cancel ${id}`);
      return { id, kind: "job", result: await this.options.cancelJob(id), transcriptPreserved: true };
    }
    const agent = this.ownedAgent(id, caller);
    if (agent.state === "queued" && agent.currentJobId) return await this.cancel(agent.currentJobId, caller);
    if (agent.state === "running") {
      if (agent.currentJobId) return await this.cancel(agent.currentJobId, caller);
      const live = this.live.get(agent.id);
      await live?.abort?.(`hub cancel ${id}`);
      if (agent.currentTurnId) await this.settleMessageTurnUnlocked(agent.id, agent.currentTurnId, "aborted", "hub cancel");
      return { id, kind: "agent", result: "aborted", transcriptPreserved: true };
    }
    const live = this.live.get(agent.id);
    if (live) await live.dispose();
    this.live.delete(agent.id);
    await this.options.onRelease?.(agent);
    await this.options.journal.append({ kind: "agent.released", agentId: agent.id, payload: { reason: "hub cancel/release" } });
    return { id, kind: "agent", result: "released", transcriptPreserved: true };
  }

  private async wait(input: Record<string, unknown>, caller: HubCaller) {
    const jobIds = Array.isArray(input.jobIds) ? input.jobIds.map((id) => requiredString(id, "hub.jobIds[]")) : [];
    const messageIds = Array.isArray(input.messageIds) ? input.messageIds.map((id) => requiredString(id, "hub.messageIds[]")) : [];
    if (jobIds.length + messageIds.length === 0) throw new Error("hub wait requires jobIds or messageIds");
    const timeoutMs = nonNegativeInteger(input.timeoutMs, 30_000, "hub.timeoutMs");
    const pollIntervalMs = nonNegativeInteger(input.pollIntervalMs, 25, "hub.pollIntervalMs", 1);
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const state = this.options.journal.getState();
      const jobs = jobIds.map((id) => state.jobs[id]).filter(Boolean);
      for (const job of jobs) this.ownedAgent(job!.agentId, caller, true);
      const messages = messageIds.map((id) => state.messages[id]);
      for (const message of messages) {
        if (message && typeof message.agentId === "string") this.ownedAgent(message.agentId, caller, true);
      }
      const unknown = [
        ...jobIds.filter((id) => !state.jobs[id]),
        ...messageIds.filter((id) => !state.messages[id]),
      ];
      const jobsDone = jobs.length === jobIds.length && jobs.every((job) => ["completed", "failed", "aborted", "unexecuted"].includes(job!.state));
      const messagesDone = messages.length === messageIds.length && messages.every((message) => ["delivered", "queued", "failed", "overflow"].includes(String(message!.status)));
      if (unknown.length === 0 && jobsDone && messagesDone) return { completed: true, timedOut: false, jobs, messages };
      if (Date.now() >= deadline) return { completed: false, timedOut: true, unknown, jobs, messages };
      await this.sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
    }
  }
}
