import { createHash, randomBytes, randomUUID } from "node:crypto";

export const RUNTIME_SCHEMA_VERSION = 1 as const;
export const RUNTIME_SNAPSHOT_TYPE = "RuntimeSnapshotV1" as const;
export const RUNTIME_EVENT_TYPE = "RuntimeEventV1" as const;
export const MUTATION_ENVELOPE_TYPE = "MutationEnvelopeV1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type MutationOrigin = "tui" | "web";
export type RuntimeState = "idle" | "running" | "blocked" | "closed";

export interface WriterProjectionV1 {
  readonly state: "unowned" | "owned" | "recovering";
  readonly owner?: MutationOrigin;
  readonly generation?: string;
  readonly activeTurn: boolean;
  readonly denialReason?: string;
}

export interface RuntimeSnapshotV1 {
  readonly schemaVersion: 1;
  readonly type: typeof RUNTIME_SNAPSHOT_TYPE;
  readonly runtimeEpoch: string;
  readonly sessionHandle: string;
  readonly lastSequence: number;
  readonly cursor: string;
  readonly createdAt: string;
  readonly state: RuntimeState;
  readonly writer: WriterProjectionV1;
  readonly capabilities: Readonly<Record<string, boolean>>;
  readonly projection: Readonly<Record<string, JsonValue>>;
}

export type RuntimeEventKind = "snapshot" | "state" | "message" | "mutation" | "heartbeat" | "reset" | "closed";

export interface RuntimeEventV1 {
  readonly schemaVersion: 1;
  readonly type: typeof RUNTIME_EVENT_TYPE;
  readonly runtimeEpoch: string;
  readonly sessionHandle: string;
  readonly sequence: number;
  readonly cursor: string;
  readonly runId?: string;
  readonly leaseGeneration?: string;
  readonly requestId?: string;
  readonly capability?: string;
  readonly emittedAt: string;
  readonly source: string;
  readonly eventType: RuntimeEventKind;
  readonly payload: Readonly<Record<string, JsonValue>>;
}

export interface MutationEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly type: typeof MUTATION_ENVELOPE_TYPE;
  readonly requestId: string;
  readonly clientId: string;
  readonly runtimeEpoch: string;
  readonly leaseGeneration: string;
  readonly sessionHandle: string;
  readonly sessionLeaf: string;
  readonly requestedAt: string;
  readonly capability: string;
  readonly commandType: string;
  readonly arguments: Readonly<Record<string, JsonValue>>;
}

export type MutationDisposition = "pending" | "rejected" | "completed" | "failed" | "unknown";

export interface MutationDispositionV1 {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly clientId: string;
  readonly runtimeEpoch: string;
  readonly leaseGeneration: string;
  readonly sessionHandle: string;
  readonly capability: string;
  readonly commandType: string;
  readonly origin: MutationOrigin;
  readonly disposition: MutationDisposition;
  readonly reason: string;
  readonly at: string;
  readonly sequence?: number;
  /** A one-way digest for collision detection; mutation arguments are never journalled. */
  readonly identityDigest: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_COMMAND = /^[a-z][a-z0-9_.:-]{0,95}$/;
const PROTECTED_KEY = /(?:^|[_-])(?:password|passwd|secret|credential|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|environment|env|mcp[_-]?config|tool[_-]?(?:argument|arguments|result|results|payload)|cwd|session[_-]?file|jsonl|private[_-]?path|file[_-]?path|filename|path)(?:$|[_-])/i;
const PROTECTED_EXACT_KEY = /^(?:password|passwd|secret|credentials?|authorization|cookie|environment|env|cwd|jsonl|path|filename)$/i;
const SECRET_TEXT = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/;
const MAX_PUBLIC_DEPTH = 24;
const MAX_PUBLIC_NODES = 16_384;
const MAX_PUBLIC_KEYS = 1_024;
const MAX_PUBLIC_ARRAY = 4_096;
const MAX_PUBLIC_STRING = 65_536;

export function isSafeRuntimeId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

/** Create an opaque public handle without disclosing a Pi id or JSONL path. */
export function createOpaqueSessionHandle(): string {
  return `session-${randomBytes(24).toString("base64url")}`;
}

/** Deterministically map a private session identity into a public handle using a private salt. */
export function deriveOpaqueSessionHandle(privateIdentity: string, privateSalt: string): string {
  if (!privateIdentity || !privateSalt) throw new Error("private session identity and salt are required");
  return `session-${createHash("sha256").update(privateSalt).update("\0").update(privateIdentity).digest("base64url").slice(0, 32)}`;
}

export function createRuntimeEpoch(): string {
  return `epoch-${randomUUID()}`;
}

export function mutationIdentityDigest(envelope: MutationEnvelopeV1, origin: MutationOrigin): string {
  return createHash("sha256").update(stableJson({
    origin,
    requestId: envelope.requestId,
    clientId: envelope.clientId,
    runtimeEpoch: envelope.runtimeEpoch,
    leaseGeneration: envelope.leaseGeneration,
    sessionHandle: envelope.sessionHandle,
    sessionLeaf: envelope.sessionLeaf,
    capability: envelope.capability,
    commandType: envelope.commandType,
    arguments: envelope.arguments,
  })).digest("hex");
}

export function eventCursor(runtimeEpoch: string, sequence: number): string {
  return `${runtimeEpoch}:${sequence}`;
}

export function parseEventCursor(value: string): { runtimeEpoch: string; sequence: number } | undefined {
  if (typeof value !== "string") return undefined;
  const split = value.lastIndexOf(":");
  if (split <= 0) return undefined;
  const runtimeEpoch = value.slice(0, split);
  const sequence = Number(value.slice(split + 1));
  return isSafeRuntimeId(runtimeEpoch) && Number.isSafeInteger(sequence) && sequence >= 0
    ? { runtimeEpoch, sequence }
    : undefined;
}

export function validateSnapshot(value: unknown): RuntimeSnapshotV1 {
  if (!isPlainRecord(value)) throw new Error("invalid RuntimeSnapshotV1");
  const snapshot = value as unknown as RuntimeSnapshotV1;
  if (snapshot.schemaVersion !== 1 || snapshot.type !== RUNTIME_SNAPSHOT_TYPE
    || !isSafeRuntimeId(snapshot.runtimeEpoch) || !isSafeRuntimeId(snapshot.sessionHandle)
    || !Number.isSafeInteger(snapshot.lastSequence) || snapshot.lastSequence < 0
    || snapshot.cursor !== eventCursor(snapshot.runtimeEpoch, snapshot.lastSequence)
    || !isIsoDate(snapshot.createdAt) || !["idle", "running", "blocked", "closed"].includes(snapshot.state)
    || !validWriter(snapshot.writer) || !booleanRecord(snapshot.capabilities) || !isPlainRecord(snapshot.projection)) {
    throw new Error("invalid RuntimeSnapshotV1");
  }
  assertPublicProjection(snapshot.projection);
  return deepFreeze(structuredClone(snapshot));
}

export function validateRuntimeEvent(value: unknown): RuntimeEventV1 {
  if (!isPlainRecord(value)) throw new Error("invalid RuntimeEventV1");
  const event = value as unknown as RuntimeEventV1;
  if (event.schemaVersion !== 1 || event.type !== RUNTIME_EVENT_TYPE
    || !isSafeRuntimeId(event.runtimeEpoch) || !isSafeRuntimeId(event.sessionHandle)
    || !Number.isSafeInteger(event.sequence) || event.sequence < 1
    || event.cursor !== eventCursor(event.runtimeEpoch, event.sequence)
    || (event.runId !== undefined && !isSafeRuntimeId(event.runId))
    || (event.leaseGeneration !== undefined && !isSafeRuntimeId(event.leaseGeneration))
    || (event.requestId !== undefined && !isSafeRuntimeId(event.requestId))
    || (event.capability !== undefined && !SAFE_COMMAND.test(event.capability))
    || !isIsoDate(event.emittedAt) || !isSafeRuntimeId(event.source)
    || !["snapshot", "state", "message", "mutation", "heartbeat", "reset", "closed"].includes(event.eventType)
    || !isPlainRecord(event.payload)) {
    throw new Error("invalid RuntimeEventV1");
  }
  assertPublicProjection(event.payload);
  return deepFreeze(structuredClone(event));
}

export function validateMutationEnvelope(value: unknown): MutationEnvelopeV1 {
  if (!isPlainRecord(value)) throw new Error("invalid MutationEnvelopeV1");
  const envelope = value as unknown as MutationEnvelopeV1;
  if (envelope.schemaVersion !== 1 || envelope.type !== MUTATION_ENVELOPE_TYPE
    || !isSafeRuntimeId(envelope.requestId) || !isSafeRuntimeId(envelope.clientId)
    || !isSafeRuntimeId(envelope.runtimeEpoch) || !isSafeRuntimeId(envelope.leaseGeneration)
    || !isSafeRuntimeId(envelope.sessionHandle) || !isSafeRuntimeId(envelope.sessionLeaf)
    || !isIsoDate(envelope.requestedAt) || !SAFE_COMMAND.test(envelope.capability)
    || !SAFE_COMMAND.test(envelope.commandType) || !isPlainRecord(envelope.arguments)) {
    throw new Error("invalid MutationEnvelopeV1");
  }
  // Arguments are private inbound data and may contain operation paths. They are
  // validated as bounded JSON but are never copied to snapshots, events, or the journal.
  assertJsonValue(envelope.arguments);
  return deepFreeze(structuredClone(envelope));
}

export function createRuntimeEvent(input: {
  runtimeEpoch: string;
  sessionHandle: string;
  sequence: number;
  source: string;
  eventType: RuntimeEventKind;
  payload: Readonly<Record<string, JsonValue>>;
  emittedAt?: string;
  runId?: string;
  leaseGeneration?: string;
  requestId?: string;
  capability?: string;
}): RuntimeEventV1 {
  return validateRuntimeEvent({
    schemaVersion: 1,
    type: RUNTIME_EVENT_TYPE,
    runtimeEpoch: input.runtimeEpoch,
    sessionHandle: input.sessionHandle,
    sequence: input.sequence,
    cursor: eventCursor(input.runtimeEpoch, input.sequence),
    emittedAt: input.emittedAt ?? new Date().toISOString(),
    source: input.source,
    eventType: input.eventType,
    payload: input.payload,
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.leaseGeneration === undefined ? {} : { leaseGeneration: input.leaseGeneration }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.capability === undefined ? {} : { capability: input.capability }),
  });
}

/** True only when an incremental event can be applied to the accepted state. */
export function isCurrentRuntimeEvent(current: Pick<RuntimeSnapshotV1, "runtimeEpoch" | "sessionHandle" | "lastSequence" | "writer">, event: RuntimeEventV1): boolean {
  if (event.runtimeEpoch !== current.runtimeEpoch || event.sessionHandle !== current.sessionHandle || event.sequence !== current.lastSequence + 1) return false;
  if (event.leaseGeneration !== undefined && current.writer.generation !== undefined && event.leaseGeneration !== current.writer.generation) return false;
  return true;
}

/** Reject a late mutation acknowledgement from another epoch or generation. */
export function isCurrentMutationDisposition(current: Pick<RuntimeSnapshotV1, "runtimeEpoch" | "sessionHandle" | "writer">, disposition: MutationDispositionV1): boolean {
  return disposition.runtimeEpoch === current.runtimeEpoch
    && disposition.sessionHandle === current.sessionHandle
    && current.writer.generation === disposition.leaseGeneration;
}

export function assertPublicProjection(value: unknown): asserts value is JsonValue {
  const budget = { nodes: 0 };
  visitJson(value, 0, budget, true);
}

function validWriter(value: unknown): value is WriterProjectionV1 {
  if (!isPlainRecord(value) || !["unowned", "owned", "recovering"].includes(String(value.state))
    || (value.owner !== undefined && value.owner !== "tui" && value.owner !== "web")
    || (value.generation !== undefined && !isSafeRuntimeId(value.generation))
    || typeof value.activeTurn !== "boolean"
    || (value.denialReason !== undefined && (typeof value.denialReason !== "string" || value.denialReason.length > 160))) return false;
  if (value.state === "unowned") return value.owner === undefined && value.generation === undefined && value.activeTurn === false;
  if (value.state === "recovering" && value.denialReason === undefined) return false;
  return value.owner !== undefined && value.generation !== undefined;
}

function booleanRecord(value: unknown): value is Record<string, boolean> {
  return isPlainRecord(value) && Object.entries(value).length <= MAX_PUBLIC_KEYS
    && Object.entries(value).every(([key, item]) => SAFE_COMMAND.test(key) && typeof item === "boolean");
}

function stableJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key]!)}`).join(",")}}`;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertJsonValue(value: unknown): asserts value is JsonValue {
  visitJson(value, 0, { nodes: 0 }, false);
}

function visitJson(value: unknown, depth: number, budget: { nodes: number }, publicValue: boolean): void {
  budget.nodes += 1;
  if (budget.nodes > MAX_PUBLIC_NODES || depth > MAX_PUBLIC_DEPTH) throw new Error("runtime value exceeds its bounded size");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > MAX_PUBLIC_STRING) throw new Error("runtime string exceeds its bounded size");
    if (publicValue && SECRET_TEXT.test(value)) throw new Error("public runtime projection contains secret material");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("runtime value contains a non-finite number");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PUBLIC_ARRAY) throw new Error("runtime array exceeds its bounded size");
    for (const entry of value) visitJson(entry, depth + 1, budget, publicValue);
    return;
  }
  if (isPlainRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_PUBLIC_KEYS) throw new Error("runtime object exceeds its bounded size");
    for (const [key, entry] of entries) {
      if (key.length > 128) throw new Error("runtime projection key is too long");
      if (publicValue && (PROTECTED_KEY.test(key) || PROTECTED_EXACT_KEY.test(key))) throw new Error("public runtime projection contains protected data");
      visitJson(entry, depth + 1, budget, publicValue);
    }
    return;
  }
  throw new Error("runtime value contains a non-JSON value");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
