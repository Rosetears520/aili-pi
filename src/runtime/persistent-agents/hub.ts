import { createHash } from "node:crypto";
import { Type } from "typebox";
import type { CoordinatorJournal } from "./storage.js";
import type { AgentRecord, CoordinatorState, TurnRecord } from "./types.js";
import { assertNoCredentialMaterial } from "./permission.js";

export const HUB_TOOL_SCHEMA = Type.Union([
  Type.Object({ action: Type.Literal("list"), includeReleased: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("send"), agentId: Type.String({ minLength: 1 }), message: Type.String({ minLength: 1 }), messageId: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("wait"), jobIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))), messageIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))), timeoutMs: Type.Optional(Type.Number({ minimum: 0 })), pollIntervalMs: Type.Optional(Type.Number({ minimum: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("inbox"), agentId: Type.String({ minLength: 1 }), mode: Type.Optional(Type.Union([Type.Literal("peek"), Type.Literal("drain")])) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("output"), agentId: Type.String({ minLength: 1 }), offset: Type.Optional(Type.Number({ minimum: 0 })), limit: Type.Optional(Type.Number({ minimum: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("history"), agentId: Type.String({ minLength: 1 }), offset: Type.Optional(Type.Number({ minimum: 0 })), limit: Type.Optional(Type.Number({ minimum: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("jobs"), jobId: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("cancel"), id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
  Type.Object({ action: Type.Literal("model"), operation: Type.Union([Type.Literal("query"), Type.Literal("request"), Type.Literal("clear")]), agentId: Type.Optional(Type.String({ minLength: 1 })), selector: Type.Optional(Type.String({ minLength: 1 })), model: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false }),
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
        strictKeys(input, ["action", "agentId", "message", "messageId"]);
        {
          const agentId = requiredString(input.agentId, "hub.agentId");
          return await this.withAgentOperation(agentId, async () => await this.send(agentId, requiredString(input.message, "hub.message"), caller, typeof input.messageId === "string" ? input.messageId : undefined));
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
        strictKeys(input, ["action", "operation", "agentId", "selector", "model"]);
        if (!this.options.model) throw new Error("hub model operations are unavailable");
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
    return {
      agents: Object.values(state.agents).filter(visible),
      released: includeReleased ? Object.values(state.releasedAgents).filter(visible) : [],
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

  private async putMessage(message: DurableMessage, status: string, details: Record<string, unknown> = {}): Promise<void> {
    await this.options.journal.append({
      kind: "message.put",
      agentId: message.agentId,
      messageId: message.id,
      payload: {
        status,
        agentId: message.agentId,
        senderAgentId: message.senderAgentId,
        createdAt: message.createdAt,
        contentHash: createHash("sha256").update(message.content).digest("hex"),
        ...details,
      },
    });
  }

  private async send(agentId: string, content: string, caller: HubCaller, requestedMessageId?: string): Promise<Record<string, unknown>> {
    await assertNoCredentialMaterial(content, "hub message");
    const agent = this.ownedAgent(agentId, caller);
    if (agent.state === "aborted") throw new Error(`${agentId}: Agent is terminal aborted`);
    const state = this.options.journal.getState();
    const messageId = requestedMessageId?.trim() || nextId("message", Object.keys(state.messages));
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(messageId) || messageId.includes("..")) throw new Error("messageId is unsafe");
    const existing = this.messageReceipt(messageId);
    if (existing) {
      if (existing.agentId !== agentId) throw new Error(`${messageId}: message ID is owned by another Agent`);
      const queued = this.options.journal.getState().mailboxes[agentId]?.messages.some((item) => item.id === messageId);
      return { messageId, deduplicated: true, ...(queued && existing.status === "pending" ? { ...existing, status: "queued" } : existing) };
    }
    const message: DurableMessage = {
      id: messageId,
      agentId,
      senderAgentId: caller.agentId,
      content,
      createdAt: this.clock().toISOString(),
    };
    await this.putMessage(message, "pending");

    if (agent.state === "running") {
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

    if (agent.state === "parked") {
      let revived: LiveAgentAdapter;
      try {
        revived = await this.options.revive(agent);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.putMessage(message, "failed", { permanent: true, reason });
        return { messageId, status: "failed", permanent: true, reason };
      }
      this.live.set(agentId, revived);
      return await this.startMessageTurn(agent, message, revived, "parked");
    }

    if (agent.state === "idle") {
      const live = this.live.get(agentId);
      if (!live) return await this.enqueueAfterLiveFailure(message, "idle Agent live adapter is unavailable");
      return await this.startMessageTurn(agent, message, live, "idle");
    }
    throw new Error(`${agentId}: Agent state ${agent.state} cannot receive messages`);
  }

  private async startMessageTurn(agent: AgentRecord, message: DurableMessage, live: LiveAgentAdapter, priorState: "idle" | "parked"): Promise<Record<string, unknown>> {
    const state = this.options.journal.getState();
    const turnId = nextId("turn", Object.keys(state.turns));
    const now = this.clock().toISOString();
    const turn: TurnRecord = {
      id: turnId,
      agentId: agent.id,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      metadata: { source: "hub.send", messageId: message.id },
    };
    await this.options.journal.append({ kind: "turn.created", agentId: agent.id, turnId, payload: { record: turn } });
    await this.options.journal.append({ kind: "agent.state", agentId: agent.id, payload: { from: priorState, to: "running", currentTurnId: turnId, currentJobId: null } });
    await this.options.journal.append({ kind: "turn.state", agentId: agent.id, turnId, payload: { from: "queued", to: "running" } });
    try {
      await live.sendUserMessage(message.content);
      await this.putMessage(message, "delivered", { delivery: priorState === "parked" ? "revive-turn" : "idle-turn", turnId });
      return { messageId: message.id, status: "delivered", delivery: priorState === "parked" ? "revive-turn" : "idle-turn", turnId };
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
