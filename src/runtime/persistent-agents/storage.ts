import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  COORDINATOR_SCHEMA_VERSION,
  DEFAULT_IDLE_TTL_MS,
  type AgentRecord,
  type AgentState,
  type CoordinatorEvent,
  type CoordinatorEventInput,
  type CoordinatorSnapshot,
  type CoordinatorState,
  type JobRecord,
  type JobState,
  type ReplayDiagnostics,
  type ReplayResult,
  type SidecarLayout,
  type TurnRecord,
  type TurnState,
} from "./types.js";

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const AGENT_TRANSITIONS: Record<AgentState, ReadonlySet<AgentState>> = {
  queued: new Set(["running", "parked", "aborted"]),
  running: new Set(["idle", "parked", "aborted"]),
  idle: new Set(["running", "parked", "aborted"]),
  parked: new Set(["running", "aborted"]),
  aborted: new Set(),
};
const JOB_TRANSITIONS: Record<JobState, ReadonlySet<JobState>> = {
  queued: new Set(["running", "aborted", "unexecuted"]),
  running: new Set(["completed", "failed", "aborted"]),
  completed: new Set(),
  failed: new Set(),
  aborted: new Set(),
  unexecuted: new Set(),
};
const TURN_TRANSITIONS: Record<TurnState, ReadonlySet<TurnState>> = {
  queued: new Set(["running", "aborted", "interrupted"]),
  running: new Set(["completed", "failed", "aborted", "interrupted"]),
  completed: new Set(),
  failed: new Set(),
  aborted: new Set(),
  interrupted: new Set(),
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function durableAppend(path: string, content: string): Promise<void> {
  const handle = await open(path, "a", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function lstatOptional(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function assertSafeAgentId(agentId: string): void {
  if (!AGENT_ID_PATTERN.test(agentId) || agentId.includes("..") || agentId.endsWith(".")) {
    throw new Error(`unsafe Agent ID: ${agentId}`);
  }
}

export function sanitizeAgentName(requestedName: string | undefined): string {
  const normalized = (requestedName ?? "agent")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 64);
  return normalized || "agent";
}

export function allocateAgentId(
  requestedName: string | undefined,
  existingIds: Iterable<string>,
  parentAgentId?: string,
): string {
  if (parentAgentId) assertSafeAgentId(parentAgentId);
  const used = new Set(existingIds);
  const base = sanitizeAgentName(requestedName);
  for (let suffix = 1; suffix < 100_000; suffix += 1) {
    const child = suffix === 1 ? base : `${base}-${suffix}`;
    const candidate = parentAgentId ? `${parentAgentId}.${child}` : child;
    assertSafeAgentId(candidate);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`unable to allocate Agent ID for ${base}`);
}

export function sidecarLayoutForParent(parentSessionPath: string): SidecarLayout {
  if (!isAbsolute(parentSessionPath) || !parentSessionPath.endsWith(".jsonl")) {
    throw new Error("parent session path must be an absolute .jsonl file");
  }
  const stem = parentSessionPath.slice(0, -".jsonl".length);
  const root = resolve(stem, "aili-agents");
  return {
    parentSessionPath,
    root,
    coordinatorPath: resolve(root, "coordinator.jsonl"),
    snapshotPath: resolve(root, "snapshot.json"),
    agentsDir: resolve(root, "agents"),
    patchesDir: resolve(root, "patches"),
    workspacesPath: resolve(root, "workspaces.jsonl"),
  };
}

async function requireRealPath(path: string, kind: "file" | "directory"): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || (kind === "file" ? !stat.isFile() : !stat.isDirectory())) {
    throw new Error(`${kind} must be real and non-symlinked: ${path}`);
  }
}

export async function ensureSidecarLayout(parentSessionPath: string): Promise<SidecarLayout> {
  const layout = sidecarLayoutForParent(parentSessionPath);
  await requireRealPath(parentSessionPath, "file");
  const existingRoot = await lstatOptional(layout.root);
  if (existingRoot?.isSymbolicLink()) throw new Error(`sidecar root must not be a symlink: ${layout.root}`);
  if (existingRoot && !existingRoot.isDirectory()) throw new Error(`sidecar root is not a directory: ${layout.root}`);
  await mkdir(layout.agentsDir, { recursive: true, mode: 0o700 });
  await mkdir(layout.patchesDir, { recursive: true, mode: 0o700 });
  await requireRealPath(layout.root, "directory");
  await requireRealPath(layout.agentsDir, "directory");
  await requireRealPath(layout.patchesDir, "directory");
  return layout;
}

export function createInitialCoordinatorState(parentId: string): CoordinatorState {
  if (!parentId.trim()) throw new Error("parentId is required");
  return {
    schemaVersion: COORDINATOR_SCHEMA_VERSION,
    parentId,
    lastSequence: 0,
    appliedEventIds: [],
    agents: {},
    releasedAgents: {},
    jobs: {},
    turns: {},
    mailboxes: {},
    deliveries: {},
    models: {},
    workspaces: {},
    messages: {},
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function validateEventEnvelope(event: CoordinatorEvent, parentId: string): void {
  if (event.schemaVersion !== COORDINATOR_SCHEMA_VERSION) throw new Error(`event ${event.eventId}: unsupported schemaVersion`);
  if (event.parentId !== parentId) throw new Error(`event ${event.eventId}: parent ownership mismatch`);
  if (!Number.isSafeInteger(event.sequence) || event.sequence <= 0) throw new Error(`event ${event.eventId}: invalid sequence`);
  requireString(event.eventId, "eventId");
  requireString(event.timestamp, "timestamp");
  requireRecord(event.payload, "payload");
}

function recordFromPayload<T extends AgentRecord | JobRecord | TurnRecord>(event: CoordinatorEvent): T {
  return clone(requireRecord(event.payload.record, `${event.kind}.record`) as unknown as T);
}

function applyStateTransition<T extends string>(
  label: string,
  current: T,
  payload: Record<string, unknown>,
  allowed: Record<T, ReadonlySet<T>>,
): T {
  const from = requireString(payload.from, `${label}.from`) as T;
  const to = requireString(payload.to, `${label}.to`) as T;
  if (from !== current) throw new Error(`${label}: stale transition ${from}->${to}; current=${current}`);
  if (!allowed[current]?.has(to)) throw new Error(`${label}: invalid transition ${from}->${to}`);
  return to;
}

export function applyCoordinatorEvent(current: CoordinatorState, event: CoordinatorEvent): CoordinatorState {
  validateEventEnvelope(event, current.parentId);
  if (event.sequence !== current.lastSequence + 1) throw new Error(`event ${event.eventId}: non-contiguous sequence`);
  if (current.appliedEventIds.includes(event.eventId)) throw new Error(`event ${event.eventId}: duplicate eventId`);
  const state = clone(current);
  const now = event.timestamp;

  switch (event.kind) {
    case "agent.created": {
      const record = recordFromPayload<AgentRecord>(event);
      assertSafeAgentId(record.id);
      if (record.id !== event.agentId) throw new Error("agent.created ID mismatch");
      if (state.agents[record.id] || state.releasedAgents[record.id]) throw new Error(`${record.id}: duplicate Agent ownership`);
      if (record.state !== "queued") throw new Error(`${record.id}: new Agent must be queued`);
      state.agents[record.id] = record;
      break;
    }
    case "agent.state": {
      const id = requireString(event.agentId, "agentId");
      const record = state.agents[id];
      if (!record) throw new Error(`${id}: unknown Agent`);
      record.state = applyStateTransition(`Agent ${id}`, record.state, event.payload, AGENT_TRANSITIONS);
      if (typeof event.payload.currentTurnId === "string") record.currentTurnId = event.payload.currentTurnId;
      else if (event.payload.currentTurnId === null) delete record.currentTurnId;
      if (typeof event.payload.currentJobId === "string") record.currentJobId = event.payload.currentJobId;
      else if (event.payload.currentJobId === null) delete record.currentJobId;
      record.updatedAt = now;
      break;
    }
    case "agent.session": {
      const id = requireString(event.agentId, "agentId");
      const record = state.agents[id];
      if (!record) throw new Error(`${id}: unknown Agent`);
      const path = requireString(event.payload.path, "agent.session.path");
      if (record.sessionPath && record.sessionPath !== path) throw new Error(`${id}: conflicting child-session ownership`);
      const otherOwner = [...Object.values(state.agents), ...Object.values(state.releasedAgents)].find((candidate) => candidate.id !== id && candidate.sessionPath === path);
      if (otherOwner) throw new Error(`${id}: child session already owned by ${otherOwner.id}`);
      record.sessionPath = path;
      record.updatedAt = now;
      break;
    }
    case "agent.released": {
      const id = requireString(event.agentId, "agentId");
      const record = state.agents[id];
      if (!record) throw new Error(`${id}: unknown Agent`);
      if (record.state === "running" || record.state === "queued") throw new Error(`${id}: active Agent cannot be released`);
      state.releasedAgents[id] = clone(record);
      delete state.agents[id];
      break;
    }
    case "job.created": {
      const record = recordFromPayload<JobRecord>(event);
      if (record.id !== event.jobId || record.agentId !== event.agentId) throw new Error("job.created ID mismatch");
      if (!state.agents[record.agentId]) throw new Error(`${record.id}: unknown owning Agent`);
      if (state.jobs[record.id]) throw new Error(`${record.id}: duplicate job`);
      if (record.state !== "queued") throw new Error(`${record.id}: new job must be queued`);
      state.jobs[record.id] = record;
      break;
    }
    case "job.state": {
      const id = requireString(event.jobId, "jobId");
      const record = state.jobs[id];
      if (!record) throw new Error(`${id}: unknown job`);
      record.state = applyStateTransition(`Job ${id}`, record.state, event.payload, JOB_TRANSITIONS);
      record.updatedAt = now;
      if (typeof event.payload.error === "string") record.error = event.payload.error;
      break;
    }
    case "turn.created": {
      const record = recordFromPayload<TurnRecord>(event);
      if (record.id !== event.turnId || record.agentId !== event.agentId || (record.jobId && record.jobId !== event.jobId)) throw new Error("turn.created ID mismatch");
      if (!state.agents[record.agentId]) throw new Error(`${record.id}: unknown owning Agent`);
      if (record.jobId && !state.jobs[record.jobId]) throw new Error(`${record.id}: unknown owning job`);
      if (state.turns[record.id]) throw new Error(`${record.id}: duplicate turn`);
      if (record.state !== "queued") throw new Error(`${record.id}: new turn must be queued`);
      state.turns[record.id] = record;
      break;
    }
    case "turn.state": {
      const id = requireString(event.turnId, "turnId");
      const record = state.turns[id];
      if (!record) throw new Error(`${id}: unknown turn`);
      record.state = applyStateTransition(`Turn ${id}`, record.state, event.payload, TURN_TRANSITIONS);
      record.updatedAt = now;
      if (typeof event.payload.outcome === "string") record.outcome = event.payload.outcome;
      break;
    }
    case "turn.audit": {
      const id = requireString(event.turnId, "turnId");
      const record = state.turns[id];
      if (!record || record.agentId !== event.agentId) throw new Error(`${id}: unknown or mismatched turn audit owner`);
      if (record.state !== "running") throw new Error(`${id}: turn audit is accepted only while running`);
      record.metadata = { ...(record.metadata ?? {}), ...structuredClone(event.payload) };
      record.updatedAt = now;
      break;
    }
    case "mailbox.put": {
      const id = requireString(event.agentId, "agentId");
      if (!state.agents[id]) throw new Error(`${id}: unknown Agent mailbox`);
      const messages = event.payload.messages;
      if (!Array.isArray(messages)) throw new Error(`${id}: mailbox messages must be an array`);
      if (messages.length > 100) throw new Error(`${id}: mailbox exceeds cap 100`);
      const messageIds = messages.map((message) => requireString(requireRecord(message, `${id}.mailbox.message`).id, `${id}.mailbox.message.id`));
      if (new Set(messageIds).size !== messageIds.length) throw new Error(`${id}: mailbox contains duplicate message IDs`);
      state.mailboxes[id] = { agentId: id, messages: clone(messages as Array<Record<string, unknown>>) };
      break;
    }
    case "message.put": {
      const id = requireString(event.messageId, "messageId");
      const agentId = requireString(event.payload.agentId, "message.agentId");
      if (!state.agents[agentId] && !state.releasedAgents[agentId]) throw new Error(`${id}: unknown message Agent`);
      const status = requireString(event.payload.status, "message.status");
      const existing = state.messages[id];
      if (!existing && status !== "pending") throw new Error(`${id}: first message state must be pending`);
      if (existing) {
        if (existing.agentId !== agentId) throw new Error(`${id}: conflicting message ownership`);
        if (existing.status !== "pending") throw new Error(`${id}: terminal message receipt cannot transition`);
        if (!["delivered", "queued", "failed", "overflow"].includes(status)) throw new Error(`${id}: invalid message transition`);
      }
      state.messages[id] = clone(event.payload);
      break;
    }
    case "delivery.put": {
      const id = requireString(event.deliveryId, "deliveryId");
      const status = requireString(event.payload.status, "delivery.status");
      const existing = state.deliveries[id];
      if (!existing && status !== "pending") throw new Error(`${id}: first delivery state must be pending`);
      if (existing) {
        if (existing.status !== "pending" || status !== "delivered") throw new Error(`${id}: invalid delivery transition`);
        if (existing.agentId !== event.payload.agentId || existing.jobId !== event.payload.jobId) throw new Error(`${id}: conflicting delivery ownership`);
      }
      state.deliveries[id] = clone(event.payload);
      break;
    }
    case "model.put": {
      const id = requireString(event.agentId, "agentId");
      if (!state.agents[id]) throw new Error(`${id}: unknown Agent model override`);
      requireString(event.payload.model, "model override");
      state.models[id] = clone(event.payload);
      break;
    }
    case "model.clear": {
      const id = requireString(event.agentId, "agentId");
      if (!state.agents[id]) throw new Error(`${id}: unknown Agent model override`);
      delete state.models[id];
      break;
    }
    case "workspace.put": {
      const id = requireString(event.agentId, "agentId");
      if (!state.agents[id] && !state.releasedAgents[id]) throw new Error(`${id}: unknown Agent workspace`);
      const existing = state.workspaces[id];
      if (existing) {
        if (existing.mode !== event.payload.mode || existing.root !== event.payload.root || existing.projectRoot !== event.payload.projectRoot) throw new Error(`${id}: conflicting workspace ownership`);
        const allowed: Record<string, string[]> = { active: ["finalized", "cleaned", "cleanup-failed"], finalized: ["cleaned", "cleanup-failed"], cleaned: [], "cleanup-failed": [] };
        if (!allowed[String(existing.status)]?.includes(String(event.payload.status))) throw new Error(`${id}: invalid workspace transition ${String(existing.status)}->${String(event.payload.status)}`);
      } else if (event.payload.status !== "active") {
        throw new Error(`${id}: first workspace state must be active`);
      }
      state.workspaces[id] = clone(event.payload);
      break;
    }
    default:
      throw new Error(`unsupported coordinator event kind: ${(event as CoordinatorEvent).kind}`);
  }

  state.lastSequence = event.sequence;
  state.appliedEventIds.push(event.eventId);
  return state;
}

async function parseJournal(path: string, parentId: string): Promise<{ events: CoordinatorEvent[]; diagnostics: Omit<ReplayDiagnostics, "snapshotLoaded"> }> {
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const hasFinalNewline = content.endsWith("\n") || content.length === 0;
  const lines = content.split("\n");
  if (hasFinalNewline) lines.pop();
  const events: CoordinatorEvent[] = [];
  let toleratedFinalPartialLine = false;
  let ignoredBytes = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim()) throw new Error(`coordinator journal line ${index + 1}: empty middle line`);
    let event: CoordinatorEvent;
    try {
      event = JSON.parse(line) as CoordinatorEvent;
    } catch (error) {
      const isFinalUnterminated = index === lines.length - 1 && !hasFinalNewline;
      if (isFinalUnterminated) {
        toleratedFinalPartialLine = true;
        ignoredBytes = Buffer.byteLength(line);
        break;
      }
      throw new Error(`coordinator journal line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      validateEventEnvelope(event, parentId);
    } catch (error) {
      throw new Error(`coordinator journal line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
    events.push(event);
  }
  return { events, diagnostics: { toleratedFinalPartialLine, ignoredBytes } };
}

function validateSnapshot(snapshot: CoordinatorSnapshot, parentId: string): CoordinatorState {
  if (snapshot.schemaVersion !== COORDINATOR_SCHEMA_VERSION || snapshot.parentId !== parentId) throw new Error("snapshot schema or parent ownership mismatch");
  if (!snapshot.state || snapshot.state.schemaVersion !== COORDINATOR_SCHEMA_VERSION || snapshot.state.parentId !== parentId) throw new Error("snapshot state ownership mismatch");
  if (snapshot.checkpointSequence !== snapshot.state.lastSequence) throw new Error("snapshot checkpoint mismatch");
  if (!Number.isSafeInteger(snapshot.checkpointSequence) || snapshot.checkpointSequence < 0) throw new Error("snapshot sequence is invalid");
  if (!Array.isArray(snapshot.state.appliedEventIds) || snapshot.state.appliedEventIds.length !== snapshot.state.lastSequence) throw new Error("snapshot event index is invalid");
  if (new Set(snapshot.state.appliedEventIds).size !== snapshot.state.appliedEventIds.length) throw new Error("snapshot contains duplicate event IDs");
  const activeAgents = snapshot.state.agents ?? {};
  const releasedAgents = snapshot.state.releasedAgents ?? {};
  for (const id of Object.keys(activeAgents)) if (releasedAgents[id]) throw new Error(`${id}: snapshot Agent is both active and released`);
  const sessionOwners = new Map<string, string>();
  for (const [id, agent] of [...Object.entries(activeAgents), ...Object.entries(releasedAgents)]) {
    if (agent.id !== id) throw new Error(`${id}: snapshot Agent key mismatch`);
    assertSafeAgentId(id);
    if (!(agent.state in AGENT_TRANSITIONS)) throw new Error(`${id}: snapshot Agent state is invalid`);
    if (agent.sessionPath) {
      const owner = sessionOwners.get(agent.sessionPath);
      if (owner) throw new Error(`${id}: snapshot child session also owned by ${owner}`);
      sessionOwners.set(agent.sessionPath, id);
    }
  }
  for (const [id, job] of Object.entries(snapshot.state.jobs ?? {})) {
    if (job.id !== id || (!activeAgents[job.agentId] && !releasedAgents[job.agentId])) throw new Error(`${id}: snapshot job ownership mismatch`);
    if (!(job.state in JOB_TRANSITIONS)) throw new Error(`${id}: snapshot job state is invalid`);
  }
  for (const [id, turn] of Object.entries(snapshot.state.turns ?? {})) {
    if (turn.id !== id || (!activeAgents[turn.agentId] && !releasedAgents[turn.agentId])) throw new Error(`${id}: snapshot turn ownership mismatch`);
    if (turn.jobId && !snapshot.state.jobs[turn.jobId]) throw new Error(`${id}: snapshot turn job mismatch`);
    if (!(turn.state in TURN_TRANSITIONS)) throw new Error(`${id}: snapshot turn state is invalid`);
  }
  return clone(snapshot.state);
}

async function loadSnapshot(path: string, parentId: string): Promise<CoordinatorState | undefined> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return validateSnapshot(JSON.parse(content) as CoordinatorSnapshot, parentId);
  } catch (error) {
    throw new Error(`invalid coordinator snapshot: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function replayCoordinator(layout: SidecarLayout, parentId: string): Promise<ReplayResult> {
  const [{ events, diagnostics }, snapshotState] = await Promise.all([
    parseJournal(layout.coordinatorPath, parentId),
    loadSnapshot(layout.snapshotPath, parentId),
  ]);
  const seen = new Set<string>();
  let expectedSequence = 1;
  for (const event of events) {
    if (event.sequence !== expectedSequence) throw new Error(`event ${event.eventId}: journal sequence gap at ${expectedSequence}`);
    if (seen.has(event.eventId)) throw new Error(`event ${event.eventId}: duplicate eventId`);
    seen.add(event.eventId);
    expectedSequence += 1;
  }

  let state = snapshotState ?? createInitialCoordinatorState(parentId);
  if (snapshotState) {
    const snapshotIds = new Set(snapshotState.appliedEventIds);
    for (const event of events.filter((candidate) => candidate.sequence <= snapshotState.lastSequence)) {
      if (!snapshotIds.has(event.eventId)) throw new Error(`snapshot/journal event mismatch at sequence ${event.sequence}`);
    }
  }
  for (const event of events.filter((candidate) => candidate.sequence > state.lastSequence)) {
    state = applyCoordinatorEvent(state, event);
  }
  if (events.length < state.lastSequence) throw new Error("snapshot checkpoint exceeds retained coordinator journal");
  return {
    state,
    events,
    diagnostics: { ...diagnostics, snapshotLoaded: snapshotState !== undefined },
  };
}

export interface CoordinatorJournalOptions {
  clock?: () => Date;
  eventId?: () => string;
}

export class CoordinatorJournal {
  private state: CoordinatorState;
  private tail: Promise<void> = Promise.resolve();
  private readonly clock: () => Date;
  private readonly nextEventId: () => string;

  private constructor(
    readonly layout: SidecarLayout,
    state: CoordinatorState,
    options: CoordinatorJournalOptions,
  ) {
    this.state = state;
    this.clock = options.clock ?? (() => new Date());
    this.nextEventId = options.eventId ?? randomUUID;
  }

  static async open(layout: SidecarLayout, parentId: string, options: CoordinatorJournalOptions = {}): Promise<{ journal: CoordinatorJournal; replay: ReplayResult }> {
    const replay = await replayCoordinator(layout, parentId);
    return { journal: new CoordinatorJournal(layout, replay.state, options), replay };
  }

  getState(): CoordinatorState {
    return clone(this.state);
  }

  append(input: CoordinatorEventInput): Promise<CoordinatorEvent> {
    const operation = this.tail.then(async () => {
      const event: CoordinatorEvent = {
        schemaVersion: COORDINATOR_SCHEMA_VERSION,
        eventId: this.nextEventId(),
        sequence: this.state.lastSequence + 1,
        timestamp: this.clock().toISOString(),
        parentId: this.state.parentId,
        ...input,
      };
      const nextState = applyCoordinatorEvent(this.state, event);
      await durableAppend(this.layout.coordinatorPath, `${JSON.stringify(event)}\n`);
      this.state = nextState;
      return event;
    });
    // Keep one ordered writer chain. A failed append poisons later operations
    // so they reject rather than hanging or pretending the failed write did
    // not happen.
    this.tail = operation.then(() => undefined);
    void this.tail.catch(() => undefined);
    return operation;
  }

  async flush(): Promise<void> {
    await this.tail;
  }

  compact(): Promise<CoordinatorSnapshot> {
    const operation = this.tail.then(async () => {
      const snapshot: CoordinatorSnapshot = {
        schemaVersion: COORDINATOR_SCHEMA_VERSION,
        parentId: this.state.parentId,
        checkpointSequence: this.state.lastSequence,
        createdAt: this.clock().toISOString(),
        state: clone(this.state),
      };
      const temporary = `${this.layout.snapshotPath}.${process.pid}.${randomUUID()}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.layout.snapshotPath);
      return snapshot;
    });
    this.tail = operation.then(() => undefined);
    void this.tail.catch(() => undefined);
    return operation;
  }
}

function assertChildSessionPathLocation(layout: SidecarLayout, sessionPath: string): string {
  if (!isAbsolute(sessionPath) || !sessionPath.endsWith(".jsonl")) throw new Error("child session path must be an absolute .jsonl file");
  const normalized = resolve(sessionPath);
  if (!isInside(resolve(layout.agentsDir), normalized)) throw new Error(`child session escapes parent-owned agents directory: ${sessionPath}`);
  return normalized;
}

export async function validateExactChildSessionPath(layout: SidecarLayout, sessionPath: string): Promise<string> {
  const normalized = assertChildSessionPathLocation(layout, sessionPath);
  const canonicalAgentsDir = await realpath(layout.agentsDir);
  const stat = await lstat(normalized);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`child session must be a real file: ${sessionPath}`);
  const canonical = await realpath(normalized);
  if (!isInside(canonicalAgentsDir, canonical)) throw new Error(`child session escapes parent-owned agents directory: ${sessionPath}`);
  return canonical;
}

export async function createChildSessionManager(
  layout: SidecarLayout,
  cwd: string,
  agentId: string,
): Promise<{ sessionManager: SessionManager; sessionPath: string }> {
  assertSafeAgentId(agentId);
  const sessionManager = SessionManager.create(cwd, layout.agentsDir, {
    id: agentId,
    parentSession: layout.parentSessionPath,
  });
  const sessionPath = sessionManager.getSessionFile();
  if (!sessionPath) throw new Error(`${agentId}: official Pi did not return a persistent child session path`);
  // Official Pi may defer the physical JSONL write until the first persisted
  // entry. Record its exact SDK-returned location now; resume/open validates the
  // real file and canonical path before use.
  return { sessionManager, sessionPath: assertChildSessionPathLocation(layout, sessionPath) };
}

export async function openChildSessionManager(layout: SidecarLayout, sessionPath: string): Promise<SessionManager> {
  const exactPath = await validateExactChildSessionPath(layout, sessionPath);
  return SessionManager.open(exactPath, layout.agentsDir);
}

export async function registerChildSession(journal: CoordinatorJournal, agentId: string, sessionPath: string): Promise<void> {
  await journal.append({ kind: "agent.session", agentId, payload: { path: sessionPath } });
}

export interface ResumeCoordinatorResult {
  journal: CoordinatorJournal;
  replay: ReplayResult;
  reconciled: Array<{ type: "interrupted" | "unexecuted"; agentId: string; id: string }>;
}

async function validateRegisteredSessions(layout: SidecarLayout, state: CoordinatorState): Promise<void> {
  for (const agent of [...Object.values(state.agents), ...Object.values(state.releasedAgents)]) {
    if (agent.sessionPath) await validateExactChildSessionPath(layout, agent.sessionPath);
  }
}

export async function reconcileUnfinishedCoordinator(
  journal: CoordinatorJournal,
  reason: "process-loss" | "graceful-shutdown" = "process-loss",
): Promise<ResumeCoordinatorResult["reconciled"]> {
  const reconciled: ResumeCoordinatorResult["reconciled"] = [];
  const initial = journal.getState();
  for (const agent of Object.values(initial.agents)) {
    if (agent.state !== "running" && agent.state !== "queued") continue;
    if (agent.currentTurnId) {
      const turn = journal.getState().turns[agent.currentTurnId];
      if (turn && (turn.state === "running" || turn.state === "queued")) {
        await journal.append({
          kind: "turn.state",
          agentId: agent.id,
          jobId: turn.jobId,
          turnId: turn.id,
          payload: { from: turn.state, to: "interrupted", outcome: `${reason}:no-auto-replay` },
        });
        reconciled.push({ type: "interrupted", agentId: agent.id, id: turn.id });
      }
    }
    if (agent.currentJobId) {
      const job = journal.getState().jobs[agent.currentJobId];
      if (job?.state === "queued") {
        await journal.append({
          kind: "job.state",
          agentId: agent.id,
          jobId: job.id,
          payload: { from: "queued", to: "unexecuted", error: `${reason}:no-auto-replay` },
        });
        reconciled.push({ type: "unexecuted", agentId: agent.id, id: job.id });
      } else if (job?.state === "running") {
        await journal.append({
          kind: "job.state",
          agentId: agent.id,
          jobId: job.id,
          payload: { from: "running", to: "failed", error: `${reason}:interrupted` },
        });
      }
    }
    await journal.append({
      kind: "agent.state",
      agentId: agent.id,
      payload: { from: agent.state, to: "parked", reason: `${reason}:no-auto-replay` },
    });
  }
  return reconciled;
}

export async function resumeCoordinator(
  layout: SidecarLayout,
  parentId: string,
  options: CoordinatorJournalOptions = {},
): Promise<ResumeCoordinatorResult> {
  const opened = await CoordinatorJournal.open(layout, parentId, options);
  const { journal, replay } = opened;
  await validateRegisteredSessions(layout, journal.getState());
  const reconciled = await reconcileUnfinishedCoordinator(journal, "process-loss");
  return { journal, replay, reconciled };
}

export interface DisposableLiveSession {
  dispose(): void | Promise<void>;
}

export interface TimerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultScheduler: TimerScheduler = {
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

interface IdleEntry {
  live: DisposableLiveSession;
  onPark: () => void | Promise<void>;
  timer?: unknown;
}

export class IdleLifecycleRegistry {
  private readonly entries = new Map<string, IdleEntry>();

  constructor(
    readonly idleTtlMs = DEFAULT_IDLE_TTL_MS,
    private readonly scheduler: TimerScheduler = defaultScheduler,
    private readonly onTimerError: (error: unknown) => void = () => undefined,
  ) {}

  trackIdle(agentId: string, live: DisposableLiveSession, onPark: () => void | Promise<void>): void {
    assertSafeAgentId(agentId);
    this.clear(agentId);
    const entry: IdleEntry = { live, onPark };
    if (this.idleTtlMs > 0) {
      entry.timer = this.scheduler.setTimeout(() => {
        void this.parkNow(agentId).catch(this.onTimerError);
      }, this.idleTtlMs);
    }
    this.entries.set(agentId, entry);
  }

  hasTimer(agentId: string): boolean {
    return this.entries.get(agentId)?.timer !== undefined;
  }

  clear(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (entry?.timer !== undefined) this.scheduler.clearTimeout(entry.timer);
    this.entries.delete(agentId);
  }

  async parkNow(agentId: string): Promise<boolean> {
    const entry = this.entries.get(agentId);
    if (!entry) return false;
    if (entry.timer !== undefined) this.scheduler.clearTimeout(entry.timer);
    this.entries.delete(agentId);
    await entry.live.dispose();
    await entry.onPark();
    return true;
  }

  async revive<T>(agent: AgentRecord, openExactSession: (sessionPath: string) => T | Promise<T>): Promise<T> {
    if (agent.state === "aborted") throw new Error(`${agent.id}: aborted Agent cannot revive`);
    if (agent.state !== "parked") throw new Error(`${agent.id}: only parked Agent can revive`);
    if (!agent.sessionPath) throw new Error(`${agent.id}: parked Agent has no registered session path`);
    return await openExactSession(agent.sessionPath);
  }

  async teardown(): Promise<void> {
    const ids = [...this.entries.keys()];
    const failures: unknown[] = [];
    for (const id of ids) {
      try {
        await this.parkNow(id);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "one or more idle Agents failed to park during teardown");
  }
}
