import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { MutationOrigin } from "./contracts.js";

interface ProperLockfileOptions {
  readonly realpath: boolean;
  readonly lockfilePath: string;
  readonly stale: number;
  readonly update: number;
  readonly retries: Readonly<{ retries: number; factor: number; minTimeout: number; maxTimeout: number; randomize: boolean }>;
  readonly onCompromised: (error: Error) => void;
}
interface ProperLockfileApi {
  lock(path: string, options: ProperLockfileOptions): Promise<() => Promise<void>>;
}
const require = createRequire(import.meta.url);
const properLockfile = require("proper-lockfile") as ProperLockfileApi;

export const WRITER_LEASE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_LEASE_TTL_MS = 30_000;
export const DEFAULT_DISCONNECT_GRACE_MS = 5_000;

export type LeaseConnectionState = "connected" | "grace";

export interface LeaseProcessIdentityV1 {
  readonly pid: number;
  readonly startFingerprint: string;
}

export interface LeaseLivenessV1 {
  readonly endpointId: string;
  readonly heartbeatAt: string;
}

export interface WriterLeaseRecordV1 {
  readonly schemaVersion: 1;
  /** Private digest only; never the Pi session id or path. */
  readonly sessionDigest: string;
  readonly generation: string;
  readonly owner: MutationOrigin;
  readonly process: LeaseProcessIdentityV1;
  readonly liveness: LeaseLivenessV1;
  readonly acquiredAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly connectionState: LeaseConnectionState;
  readonly graceUntil?: string;
  readonly activeTurn: boolean;
  readonly activeTurnId?: string;
}

export interface SessionWriterLeaseOptions {
  readonly ttlMs?: number;
  readonly disconnectGraceMs?: number;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
  readonly processIdentity?: LeaseProcessIdentityV1;
  readonly livenessEndpointId?: string;
  /** Must prove that the exact pid + start fingerprint is still this owner. */
  readonly isProcessAlive?: (identity: LeaseProcessIdentityV1) => Promise<boolean> | boolean;
  /** Private liveness endpoint probe, separate from heartbeat freshness. */
  readonly probeLiveness?: (endpointId: string, generation: string) => Promise<boolean> | boolean;
  /** Durable service hook; recovery cannot transfer an active turn until this succeeds. */
  readonly markInterrupted?: (record: WriterLeaseRecordV1) => Promise<void> | void;
}

export type LeaseDeniedReason = "held" | "grace" | "active-turn" | "possibly-live" | "unverified" | "recovery-race";

export type LeaseAcquireResult =
  | { readonly acquired: true; readonly lease: SessionWriterLease }
  | { readonly acquired: false; readonly reason: LeaseDeniedReason; readonly holder?: LeaseHolderProjection };

export interface LeaseHolderProjection {
  readonly owner: MutationOrigin;
  readonly generation: string;
  readonly activeTurn: boolean;
  readonly connectionState: LeaseConnectionState;
  readonly expiresAt: string;
  readonly graceUntil?: string;
}

interface NormalizedOptions {
  readonly ttlMs: number;
  readonly disconnectGraceMs: number;
  readonly now: () => Date;
  readonly idFactory: () => string;
  readonly processIdentity: LeaseProcessIdentityV1;
  readonly livenessEndpointId: string;
  readonly isProcessAlive?: SessionWriterLeaseOptions["isProcessAlive"];
  readonly probeLiveness?: SessionWriterLeaseOptions["probeLiveness"];
  readonly markInterrupted?: SessionWriterLeaseOptions["markInterrupted"];
}

/** Session-scoped first-writer generation lease with heartbeat and safe recovery. */
export class SessionWriterLease {
  private released = false;
  private recordValue: WriterLeaseRecordV1;

  public constructor(
    private readonly directory: string,
    record: WriterLeaseRecordV1,
    private readonly options: NormalizedOptions,
  ) {
    this.recordValue = record;
  }

  public get record(): WriterLeaseRecordV1 { return this.recordValue; }
  public get owner(): MutationOrigin { return this.recordValue.owner; }
  public get generation(): string { return this.recordValue.generation; }
  public get activeTurn(): boolean { return this.recordValue.activeTurn; }
  public get processIdentity(): LeaseProcessIdentityV1 { return this.recordValue.process; }

  public async heartbeat(input: { readonly activeTurn?: boolean; readonly activeTurnId?: string; readonly connected?: boolean } = {}): Promise<boolean> {
    if (this.released) return false;
    try {
      return await withLeaseOperationLock(this.directory, async (assertOwned) => {
        if (this.released) return false;
        const now = this.options.now();
        const current = await readLeaseRecord(this.directory);
        if (!sameOwner(current, this.recordValue)) return false;
        const activeTurn = input.activeTurn ?? current.activeTurn;
        const next = makeRecord({
          ...current,
          liveness: { ...current.liveness, heartbeatAt: now.toISOString() },
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + this.options.ttlMs).toISOString(),
          connectionState: input.connected === false ? "grace" : "connected",
          ...(input.connected === false ? { graceUntil: new Date(now.getTime() + this.options.disconnectGraceMs).toISOString() } : { graceUntil: undefined }),
          activeTurn,
          ...(activeTurn ? { activeTurnId: input.activeTurnId ?? current.activeTurnId ?? `turn-${this.options.idFactory()}` } : { activeTurnId: undefined }),
        });
        assertOwned();
        const written = await replaceRecordIfGeneration(this.directory, current.generation, next);
        if (written) this.recordValue = next;
        return written;
      });
    } catch { return false; }
  }

  public async renew(ttlMs = this.options.ttlMs, now = this.options.now()): Promise<boolean> {
    if (!validTtl(ttlMs)) return false;
    try {
      return await withLeaseOperationLock(this.directory, async (assertOwned) => {
        const current = await readLeaseRecord(this.directory);
        if (this.released || !sameOwner(current, this.recordValue)) return false;
        const next = makeRecord({
          ...current,
          liveness: { ...current.liveness, heartbeatAt: now.toISOString() },
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        });
        assertOwned();
        const written = await replaceRecordIfGeneration(this.directory, current.generation, next);
        if (written) this.recordValue = next;
        return written;
      });
    } catch { return false; }
  }

  public async setActiveTurn(active: boolean, turnId?: string): Promise<boolean> {
    return this.heartbeat({ activeTurn: active, activeTurnId: turnId, connected: true });
  }

  public async disconnect(): Promise<boolean> {
    return this.heartbeat({ connected: false });
  }

  /** Reconnect is valid only for the exact generation/process/start identity. */
  public async reconnect(generation: string, process: LeaseProcessIdentityV1): Promise<boolean> {
    if (generation !== this.recordValue.generation || !sameProcess(process, this.recordValue.process)) return false;
    return this.heartbeat({ connected: true });
  }

  /** Explicit release is accepted only when the current generation has no active turn. */
  public async release(): Promise<boolean> {
    if (this.released) return false;
    try {
      return await withLeaseOperationLock(this.directory, async (assertOwned) => {
        const current = await readLeaseRecord(this.directory);
        if (this.released || !sameOwner(current, this.recordValue) || current.activeTurn) return false;
        const retired = `${this.directory}.released-${this.options.idFactory()}`;
        assertOwned();
        try { await rename(this.directory, retired); }
        catch { return false; }
        await rm(retired, { recursive: true, force: true });
        this.released = true;
        return true;
      });
    } catch { return false; }
  }
}

export async function acquireSessionWriterLease(
  root: string,
  sessionIdentity: string,
  owner: MutationOrigin,
  input: SessionWriterLeaseOptions = {},
): Promise<LeaseAcquireResult> {
  if (!root || !sessionIdentity || (owner !== "tui" && owner !== "web")) throw new Error("invalid session writer lease request");
  const options = normalizeOptions(input);
  const directory = leaseDirectory(root, sessionIdentity);
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 });

  try {
    return await withLeaseOperationLock(directory, async (assertOwned) => {
      const attempt = async (): Promise<LeaseAcquireResult | undefined> => {
        assertOwned();
        try {
          await mkdir(directory, { mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          return undefined;
        }
        const now = options.now();
        const record = makeRecord({
          schemaVersion: 1,
          sessionDigest: sessionDigest(sessionIdentity),
          generation: `generation-${options.idFactory()}`,
          owner,
          process: options.processIdentity,
          liveness: { endpointId: options.livenessEndpointId, heartbeatAt: now.toISOString() },
          acquiredAt: now.toISOString(),
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + options.ttlMs).toISOString(),
          connectionState: "connected",
          activeTurn: false,
        });
        try {
          assertOwned();
          await createRecord(directory, record);
          return { acquired: true, lease: new SessionWriterLease(directory, record, options) };
        } catch (error) {
          await rm(directory, { recursive: true, force: true }).catch(() => undefined);
          throw error;
        }
      };

      const first = await attempt();
      if (first) return first;
      const existing = await readLeaseRecord(directory);
      if (!existing) return { acquired: false, reason: "unverified" };
      return recoverExpiredLease(directory, existing, options, attempt, assertOwned);
    });
  } catch {
    return { acquired: false, reason: "recovery-race" };
  }
}

export async function inspectSessionWriterLease(root: string, sessionIdentity: string): Promise<LeaseHolderProjection | undefined> {
  const record = await readLeaseRecord(leaseDirectory(root, sessionIdentity));
  return record ? holder(record) : undefined;
}

export function leaseDirectory(root: string, sessionIdentity: string): string {
  return join(root, "writer-leases", `${sessionDigest(sessionIdentity)}.lease`);
}

function sessionDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function recoverExpiredLease(
  directory: string,
  existing: WriterLeaseRecordV1,
  options: NormalizedOptions,
  attempt: () => Promise<LeaseAcquireResult | undefined>,
  assertOperationLockOwned: () => void,
): Promise<LeaseAcquireResult> {
  const nowMs = options.now().getTime();
  if (existing.connectionState === "grace" && Date.parse(existing.graceUntil ?? "") > nowMs) return denied("grace", existing);
  if (Date.parse(existing.expiresAt) > nowMs) return denied("held", existing);

  // A stale heartbeat is not proof of death. Recovery always requires both
  // exact process/start and private endpoint liveness probes.
  if (!options.isProcessAlive || !options.probeLiveness) return denied("possibly-live", existing);
  let processAlive: boolean;
  let endpointAlive: boolean;
  try {
    [processAlive, endpointAlive] = await Promise.all([
      options.isProcessAlive(existing.process),
      options.probeLiveness(existing.liveness.endpointId, existing.generation),
    ]);
  } catch {
    return denied("unverified", existing);
  }
  if (processAlive || endpointAlive) return denied("possibly-live", existing);
  if (existing.activeTurn && !options.markInterrupted) return denied("active-turn", existing);
  if (existing.activeTurn) {
    try { await options.markInterrupted!(existing); }
    catch { return denied("active-turn", existing); }
  }

  // The sibling operation lock serializes all owners across the full liveness,
  // interruption, and retirement sequence. A compromised lock fails closed.
  assertOperationLockOwned();
  const latest = await readLeaseRecord(directory);
  if (!latest || latest.generation !== existing.generation || latest.updatedAt !== existing.updatedAt) return denied("recovery-race", latest ?? existing);
  const retired = `${directory}.retired-${options.idFactory()}`;
  try {
    assertOperationLockOwned();
    await rename(directory, retired);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return (await attempt()) ?? { acquired: false, reason: "recovery-race" };
    return { acquired: false, reason: "recovery-race" };
  }
  await rm(retired, { recursive: true, force: true });
  return (await attempt()) ?? { acquired: false, reason: "recovery-race" };
}

function normalizeOptions(input: SessionWriterLeaseOptions): NormalizedOptions {
  const ttlMs = input.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const disconnectGraceMs = input.disconnectGraceMs ?? DEFAULT_DISCONNECT_GRACE_MS;
  if (!validTtl(ttlMs)) throw new Error("lease ttl must be between 1 second and 10 minutes");
  if (!Number.isSafeInteger(disconnectGraceMs) || disconnectGraceMs < 1_000 || disconnectGraceMs > 60_000) {
    throw new Error("disconnect grace must be between 1 second and 1 minute");
  }
  const idFactory = input.idFactory ?? randomUUID;
  const processIdentity = input.processIdentity ?? { pid: process.pid, startFingerprint: processStartFingerprint() };
  if (!validProcess(processIdentity)) throw new Error("invalid lease process identity");
  const livenessEndpointId = input.livenessEndpointId ?? `liveness-${idFactory()}`;
  if (!safeId(livenessEndpointId)) throw new Error("invalid liveness endpoint identity");
  return { ttlMs, disconnectGraceMs, now: input.now ?? (() => new Date()), idFactory, processIdentity, livenessEndpointId, isProcessAlive: input.isProcessAlive, probeLiveness: input.probeLiveness, markInterrupted: input.markInterrupted };
}

function processStartFingerprint(): string {
  try {
    const stat = readFileSync(`/proc/${process.pid}/stat`, { encoding: "utf8", flag: "r" });
    const end = stat.lastIndexOf(")");
    if (end < 1) throw new Error("Linux process start identity is unavailable");
    const fields = stat.slice(end + 2).trim().split(/\s+/);
    const startTime = fields[19];
    if (startTime && /^\d+$/.test(startTime)) {
      return createHash("sha256").update(`${process.pid}:${startTime}`).digest("base64url").slice(0, 32);
    }
  } catch { /* Linux /proc is required for production recovery; fixtures may inject identity. */ }
  throw new Error("Linux process start identity is unavailable");
}

function denied(reason: LeaseDeniedReason, record: WriterLeaseRecordV1): LeaseAcquireResult {
  return { acquired: false, reason, holder: holder(record) };
}

function holder(record: WriterLeaseRecordV1): LeaseHolderProjection {
  return Object.freeze({ owner: record.owner, generation: record.generation, activeTurn: record.activeTurn, connectionState: record.connectionState, expiresAt: record.expiresAt, ...(record.graceUntil ? { graceUntil: record.graceUntil } : {}) });
}

async function createRecord(directory: string, record: WriterLeaseRecordV1): Promise<void> {
  const handle = await open(join(directory, "lease.json"), "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
}

async function replaceRecordIfGeneration(directory: string, generation: string, record: WriterLeaseRecordV1): Promise<boolean> {
  const current = await readLeaseRecord(directory);
  if (!current || current.generation !== generation) return false;
  const temporary = join(directory, `.lease-${generation}-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  const latest = await readLeaseRecord(directory);
  if (!latest || latest.generation !== generation) {
    await rm(temporary, { force: true });
    return false;
  }
  await rename(temporary, join(directory, "lease.json"));
  return true;
}

async function withLeaseOperationLock<T>(
  directory: string,
  operation: (assertOwned: () => void) => Promise<T>,
): Promise<T> {
  const lockTarget = `${directory}.operations`;
  await mkdir(dirname(lockTarget), { recursive: true, mode: 0o700 });
  let compromised: Error | undefined;
  const release = await properLockfile.lock(lockTarget, {
    realpath: false,
    lockfilePath: `${lockTarget}.lock`,
    stale: 30_000,
    update: 10_000,
    retries: { retries: 20, factor: 1.5, minTimeout: 5, maxTimeout: 100, randomize: true },
    onCompromised: (error) => { compromised = error; },
  });
  const assertOwned = () => { if (compromised) throw compromised; };
  try {
    assertOwned();
    const result = await operation(assertOwned);
    assertOwned();
    return result;
  } finally {
    try { await release(); }
    catch (error) { if (!compromised) compromised = error as Error; }
    if (compromised) throw compromised;
  }
}

export function validateWriterLeaseRecord(value: unknown): WriterLeaseRecordV1 {
  if (!validRecord(value)) throw new Error("invalid WriterLeaseRecordV1");
  return Object.freeze(structuredClone(value));
}

async function readLeaseRecord(directory: string): Promise<WriterLeaseRecordV1 | undefined> {
  try {
    const info = await stat(join(directory, "lease.json"));
    if (!info.isFile() || info.size > 16_384) return undefined;
    const value = JSON.parse(await readFile(join(directory, "lease.json"), "utf8")) as unknown;
    return validRecord(value) ? Object.freeze(value) : undefined;
  } catch {
    return undefined;
  }
}

function makeRecord(input: WriterLeaseRecordV1): WriterLeaseRecordV1 {
  const record = { ...input } as Record<string, unknown>;
  if (record.graceUntil === undefined) delete record.graceUntil;
  if (record.activeTurnId === undefined) delete record.activeTurnId;
  if (!validRecord(record)) throw new Error("invalid writer lease record");
  return Object.freeze(record as unknown as WriterLeaseRecordV1);
}

function validRecord(value: unknown): value is WriterLeaseRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<WriterLeaseRecordV1>;
  return record.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(record.sessionDigest ?? "") && safeId(record.generation)
    && (record.owner === "tui" || record.owner === "web") && validProcess(record.process)
    && !!record.liveness && safeId(record.liveness.endpointId) && isDate(record.liveness.heartbeatAt)
    && isDate(record.acquiredAt) && isDate(record.updatedAt) && isDate(record.expiresAt)
    && (record.connectionState === "connected" || record.connectionState === "grace")
    && (record.connectionState !== "grace" || isDate(record.graceUntil)) && typeof record.activeTurn === "boolean"
    && (!record.activeTurn || safeId(record.activeTurnId));
}

function validProcess(value: unknown): value is LeaseProcessIdentityV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const processIdentity = value as Partial<LeaseProcessIdentityV1>;
  return Number.isSafeInteger(processIdentity.pid) && (processIdentity.pid ?? 0) > 0 && safeId(processIdentity.startFingerprint);
}
function sameOwner(left: WriterLeaseRecordV1 | undefined, right: WriterLeaseRecordV1): left is WriterLeaseRecordV1 {
  return !!left && left.generation === right.generation && sameProcess(left.process, right.process);
}
function sameProcess(left: LeaseProcessIdentityV1, right: LeaseProcessIdentityV1): boolean {
  return left.pid === right.pid && left.startFingerprint === right.startFingerprint;
}
function validTtl(value: number): boolean { return Number.isSafeInteger(value) && value >= 1_000 && value <= 600_000; }
function isDate(value: unknown): value is string { return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value)); }
function safeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
