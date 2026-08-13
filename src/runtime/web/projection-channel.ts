import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rm } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { StringDecoder } from "node:string_decoder";
import {
  createOwnerOnlyArtifact,
  removeOwnerOnlyArtifact,
  verifyOwnerOnlyArtifact,
  WEB_BOOTSTRAP_TTL_MS,
  type OwnerOnlyArtifact,
} from "./access-policy.js";
import {
  isSafeRuntimeId,
  parseEventCursor,
  validateRuntimeEvent,
  validateSnapshot,
  type RuntimeEventV1,
  type RuntimeSnapshotV1,
} from "./contracts.js";
import type { EventResetReason, EventReplayResult, RuntimeSubscription } from "./event-hub.js";

export const PROJECTION_PROTOCOL_VERSION = 1 as const;
export const PROJECTION_HELLO_TYPE = "ProjectionHelloV1" as const;
export const PROJECTION_SNAPSHOT_TYPE = "ProjectionSnapshotV1" as const;
export const PROJECTION_EVENT_TYPE = "ProjectionEventV1" as const;
export const PROJECTION_RESET_TYPE = "ProjectionResetV1" as const;
export const PROJECTION_DISCOVERY_TYPE = "ProjectionDiscoveryV1" as const;
export const PROJECTION_MAX_CLIENT_FRAME_BYTES = 8 * 1024;
export const PROJECTION_MAX_SERVER_FRAME_BYTES = 1024 * 1024;
export const PROJECTION_DEFAULT_POLL_MS = 50;

export interface ProjectionHelloV1 {
  readonly schemaVersion: 1;
  readonly type: typeof PROJECTION_HELLO_TYPE;
  readonly clientId: string;
  readonly bootstrapIdentity: string;
}

export interface ProjectionSnapshotFrameV1 {
  readonly schemaVersion: 1;
  readonly type: typeof PROJECTION_SNAPSHOT_TYPE;
  readonly readOnly: true;
  readonly snapshot: RuntimeSnapshotV1;
}

export interface ProjectionEventFrameV1 {
  readonly schemaVersion: 1;
  readonly type: typeof PROJECTION_EVENT_TYPE;
  readonly event: RuntimeEventV1;
}

export interface ProjectionResetFrameV1 {
  readonly schemaVersion: 1;
  readonly type: typeof PROJECTION_RESET_TYPE;
  readonly reason: EventResetReason;
  readonly latestCursor: string;
  readonly snapshotRequired: true;
}

export type ProjectionServerFrameV1 = ProjectionSnapshotFrameV1 | ProjectionEventFrameV1 | ProjectionResetFrameV1;

export interface ProjectionDiscoveryV1 {
  readonly schemaVersion: 1;
  readonly type: typeof PROJECTION_DISCOVERY_TYPE;
  readonly sessionDigest: string;
  readonly endpoint: string;
  readonly bootstrapPath: string;
  readonly readOnly: true;
}

export interface ProjectionSource {
  readonly snapshot: RuntimeSnapshotV1;
  subscribe(cursor?: string): RuntimeSubscription;
}

export interface ProjectionChannelPaths {
  readonly directory: string;
  readonly endpointDirectory: string;
  readonly discoveryPath: string;
  readonly bootstrapPath: string;
  readonly sessionDigest: string;
}

export interface OwnerOnlyProjectionServerOptions {
  readonly runtimeDirectory: string;
  readonly privateSessionIdentity: string;
  readonly source: ProjectionSource;
  readonly now?: () => Date;
  readonly bootstrapTtlMs?: number;
  readonly pollIntervalMs?: number;
  readonly idFactory?: () => string;
  readonly onError?: (error: Error) => void;
}

export interface ProjectionObserverOptions {
  readonly runtimeDirectory: string;
  readonly privateSessionIdentity: string;
  readonly clientId?: string;
  readonly connectTimeoutMs?: number;
  readonly onSnapshot?: (snapshot: RuntimeSnapshotV1) => void;
  readonly onEvent?: (event: RuntimeEventV1) => void;
  readonly onReset?: (reset: ProjectionResetFrameV1) => void;
  readonly onError?: (error: Error) => void;
}

export interface ProjectionObserver {
  readonly readOnly: true;
  readonly clientId: string;
  close(): void;
}

interface ProjectionClientState {
  readonly socket: Socket;
  readonly subscription: RuntimeSubscription;
  readonly pollTimer: NodeJS.Timeout;
}

/** One-use, restart-bounded bootstrap identity authority. Only a digest is retained. */
export class ProjectionBootstrapAuthority {
  private digest?: Buffer;
  private expiresAt = 0;

  public constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = WEB_BOOTSTRAP_TTL_MS,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 5 * 60_000) {
      throw new Error("projection bootstrap ttl must be between 1 second and 5 minutes");
    }
  }

  public issue(): string {
    this.clear();
    const value = randomBytes(32);
    this.digest = createHash("sha256").update(value).digest();
    this.expiresAt = this.now().getTime() + this.ttlMs;
    const encoded = value.toString("base64url");
    value.fill(0);
    return encoded;
  }

  /** Every attempt consumes the current identity, including a spoofed or expired attempt. */
  public consume(value: string): boolean {
    const expected = this.digest;
    const expiresAt = this.expiresAt;
    this.digest = undefined;
    this.expiresAt = 0;
    if (!expected) return false;
    if (expiresAt <= this.now().getTime() || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
      expected.fill(0);
      return false;
    }
    let candidate: Buffer;
    try { candidate = Buffer.from(value, "base64url"); }
    catch { expected.fill(0); return false; }
    const digest = createHash("sha256").update(candidate).digest();
    candidate.fill(0);
    const accepted = digest.byteLength === expected.byteLength && timingSafeEqual(digest, expected);
    digest.fill(0);
    expected.fill(0);
    return accepted;
  }

  public dispose(): void { this.clear(); }

  private clear(): void {
    this.digest?.fill(0);
    this.digest = undefined;
    this.expiresAt = 0;
  }
}

/** Bounded newline-delimited JSON decoder shared by the server and observer client. */
export class BoundedProjectionFrameDecoder {
  private readonly decoder = new StringDecoder("utf8");
  private buffered = "";

  public constructor(private readonly maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 256 || maxBytes > PROJECTION_MAX_SERVER_FRAME_BYTES) {
      throw new Error("projection frame bound is invalid");
    }
  }

  public push(chunk: Uint8Array): readonly unknown[] {
    this.buffered += this.decoder.write(Buffer.from(chunk));
    if (Buffer.byteLength(this.buffered) > this.maxBytes) throw new Error("projection frame exceeded its bound");
    const values: unknown[] = [];
    let newline = this.buffered.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffered.slice(0, newline);
      this.buffered = this.buffered.slice(newline + 1);
      if (line.length === 0) throw new Error("projection frame is empty");
      try { values.push(JSON.parse(line)); }
      catch { throw new Error("projection frame is malformed"); }
      newline = this.buffered.indexOf("\n");
    }
    if (Buffer.byteLength(this.buffered) > this.maxBytes) throw new Error("projection frame exceeded its bound");
    return values;
  }

  public finish(): void {
    this.buffered += this.decoder.end();
    if (this.buffered.trim() !== "") throw new Error("projection channel ended with a partial frame");
    this.buffered = "";
  }
}

/** Linux owner-only Unix-socket projection server. It has no mutation frame or callback. */
export class OwnerOnlyProjectionServer {
  private readonly paths: ProjectionChannelPaths;
  private readonly authority: ProjectionBootstrapAuthority;
  private readonly pollIntervalMs: number;
  private readonly idFactory: () => string;
  private readonly clients = new Set<ProjectionClientState>();
  private server?: Server;
  private endpoint?: string;
  private discoveryArtifact?: OwnerOnlyArtifact;
  private bootstrapArtifact?: OwnerOnlyArtifact;
  private authChain: Promise<void> = Promise.resolve();
  private closed = false;

  public constructor(private readonly options: OwnerOnlyProjectionServerOptions) {
    this.paths = projectionChannelPaths(options.runtimeDirectory, options.privateSessionIdentity);
    this.authority = new ProjectionBootstrapAuthority(options.now, options.bootstrapTtlMs);
    this.pollIntervalMs = bounded(options.pollIntervalMs ?? PROJECTION_DEFAULT_POLL_MS, 10, 5_000, "projection poll interval");
    this.idFactory = options.idFactory ?? (() => randomBytes(9).toString("base64url"));
  }

  public async start(): Promise<ProjectionDiscoveryV1> {
    if (this.closed) throw new Error("projection server is closed");
    if (this.server && this.endpoint) return this.discovery(this.endpoint);
    await mkdir(this.paths.directory, { recursive: true, mode: 0o700 });
    await mkdir(this.paths.endpointDirectory, { recursive: true, mode: 0o700 });
    await verifyOwnerOnlyArtifact(this.paths.directory, "directory");
    await verifyOwnerOnlyArtifact(this.paths.endpointDirectory, "directory");
    await cleanupStaleProjectionArtifacts(this.paths);

    const endpoint = join(this.paths.endpointDirectory, `${this.paths.sessionDigest.slice(0, 16)}-${safeSuffix(this.idFactory())}.sock`);
    if (Buffer.byteLength(endpoint) > 100) throw new Error("projection endpoint path is too long for a Unix socket");
    const server = createServer((socket) => this.accept(socket));
    this.server = server;
    this.endpoint = endpoint;
    server.on("error", (error) => this.report(error));
    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        const onError = (error: Error) => { server.off("listening", onListening); rejectListen(error); };
        const onListening = () => { server.off("error", onError); resolveListen(); };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(endpoint);
      });
      await chmod(endpoint, 0o600);
      await verifyOwnerOnlySocket(endpoint);
      await this.rotateBootstrap();
      const discovery = this.discovery(endpoint);
      this.discoveryArtifact = await createOwnerOnlyArtifact(this.paths.discoveryPath, `${JSON.stringify(discovery)}\n`);
      return discovery;
    } catch (error) {
      await this.close().catch(() => undefined);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.authority.dispose();
    for (const client of [...this.clients]) this.drop(client);
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((resolveClose) => server.close(() => resolveClose())).catch(() => undefined);
    const failures: string[] = [];
    for (const artifact of [this.bootstrapArtifact, this.discoveryArtifact]) {
      if (!artifact) continue;
      try { await artifact.cleanup(); } catch (error) { failures.push(errorMessage(error)); }
    }
    this.bootstrapArtifact = undefined;
    this.discoveryArtifact = undefined;
    if (this.endpoint) {
      try { await removeOwnerOnlySocket(this.endpoint); } catch (error) { failures.push(errorMessage(error)); }
      this.endpoint = undefined;
    }
    if (failures.length) throw new Error(`projection cleanup failed: ${failures.join("; ").slice(0, 240)}`);
  }

  private accept(socket: Socket): void {
    socket.setTimeout(WEB_BOOTSTRAP_TTL_MS, () => socket.destroy(new Error("projection authentication timed out")));
    const decoder = new BoundedProjectionFrameDecoder(PROJECTION_MAX_CLIENT_FRAME_BYTES);
    let processing = false;
    const deny = (error: unknown) => {
      this.report(error);
      socket.destroy();
    };
    socket.on("data", (chunk: Buffer) => {
      if (processing) return deny(new Error("concurrent projection authentication frame rejected"));
      processing = true;
      socket.pause();
      let values: readonly unknown[];
      try { values = decoder.push(chunk); }
      catch (error) { deny(error); return; }
      if (values.length === 0) { processing = false; socket.resume(); return; }
      if (values.length !== 1) return deny(new Error("projection channel accepts exactly one client hello"));
      try { decoder.finish(); }
      catch (error) { deny(error); return; }
      let hello: ProjectionHelloV1;
      try { hello = validateProjectionHello(values[0]); }
      catch (error) { deny(error); return; }
      socket.removeAllListeners("data");
      socket.setTimeout(0);
      this.authenticate(hello.bootstrapIdentity).then((authenticated) => {
        if (!authenticated || this.closed) return deny(new Error("projection bootstrap identity was rejected"));
        socket.on("data", () => deny(new Error("read-only projection channel rejects client control frames")));
        this.attachAuthenticated(socket);
      }).catch(deny);
    });
    socket.once("error", () => { /* The owning channel reports bounded errors through explicit operations. */ });
  }

  private authenticate(value: string): Promise<boolean> {
    let accepted = false;
    this.authChain = this.authChain.then(async () => {
      accepted = this.authority.consume(value);
      try { await this.bootstrapArtifact?.cleanup(); } catch (error) { this.report(error); }
      this.bootstrapArtifact = undefined;
      if (!this.closed) await this.rotateBootstrap();
    });
    return this.authChain.then(() => accepted);
  }

  private attachAuthenticated(socket: Socket): void {
    const snapshot = validateSnapshot(this.options.source.snapshot);
    const subscription = this.options.source.subscribe(snapshot.cursor);
    if (!writeProjectionFrame(socket, { schemaVersion: 1, type: PROJECTION_SNAPSHOT_TYPE, readOnly: true, snapshot })) {
      subscription.close();
      socket.destroy();
      return;
    }
    // A long fallback interval remains for defensive reconciliation, but normal
    // delivery is wake-driven by RuntimeEventHub rather than polling.
    const pollTimer = setInterval(() => {
      const state = [...this.clients].find((candidate) => candidate.socket === socket);
      if (state) this.flushClient(state);
    }, Math.max(this.pollIntervalMs, 30_000));
    pollTimer.unref();
    const state: ProjectionClientState = { socket, subscription, pollTimer };
    this.clients.add(state);
    socket.once("close", () => this.drop(state));
    const pump = async () => {
      while (this.clients.has(state)) {
        await subscription.wait();
        if (!this.clients.has(state)) break;
        this.flushClient(state);
      }
    };
    void pump().catch((error) => { this.report(error); this.drop(state); });
    this.flushClient(state);
  }

  private flushClient(state: ProjectionClientState): void {
    try { this.writeReplay(state, state.subscription.drain()); }
    catch (error) { this.report(error); this.drop(state); }
  }

  private writeReplay(client: ProjectionClientState, replay: EventReplayResult): void {
    if (replay.kind === "reset") {
      const frame: ProjectionResetFrameV1 = {
        schemaVersion: 1,
        type: PROJECTION_RESET_TYPE,
        reason: replay.reason,
        latestCursor: replay.latestCursor,
        snapshotRequired: true,
      };
      if (!writeProjectionFrame(client.socket, frame)) this.drop(client);
      return;
    }
    for (const event of replay.events) {
      if (!writeProjectionFrame(client.socket, { schemaVersion: 1, type: PROJECTION_EVENT_TYPE, event })) {
        this.drop(client);
        return;
      }
    }
  }

  private drop(client: ProjectionClientState): void {
    if (!this.clients.delete(client)) return;
    clearInterval(client.pollTimer);
    client.subscription.close();
    client.socket.destroy();
  }

  private async rotateBootstrap(): Promise<void> {
    const value = this.authority.issue();
    try { this.bootstrapArtifact = await createOwnerOnlyArtifact(this.paths.bootstrapPath, `${value}\n`); }
    finally { /* The immutable string is never logged, journalled, or returned publicly. */ }
  }

  private discovery(endpoint: string): ProjectionDiscoveryV1 {
    return Object.freeze({
      schemaVersion: 1,
      type: PROJECTION_DISCOVERY_TYPE,
      sessionDigest: this.paths.sessionDigest,
      endpoint,
      bootstrapPath: this.paths.bootstrapPath,
      readOnly: true,
    });
  }

  private report(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error(errorMessage(error)));
  }
}

/** Connect to a TUI-owned projection. The returned API deliberately exposes no send method. */
export async function connectProjectionObserver(options: ProjectionObserverOptions): Promise<ProjectionObserver> {
  const paths = projectionChannelPaths(options.runtimeDirectory, options.privateSessionIdentity);
  const discovery = await readProjectionDiscovery(paths);
  await verifyOwnerOnlyArtifact(discovery.bootstrapPath, "file");
  const bootstrapBuffer = await readFile(discovery.bootstrapPath);
  if (bootstrapBuffer.byteLength > 128) { bootstrapBuffer.fill(0); throw new Error("projection bootstrap artifact exceeded its bound"); }
  const bootstrapIdentity = bootstrapBuffer.toString("utf8").trim();
  bootstrapBuffer.fill(0);
  if (!/^[A-Za-z0-9_-]{43}$/.test(bootstrapIdentity)) throw new Error("projection bootstrap artifact is malformed");
  const clientId = options.clientId ?? `observer-${randomBytes(12).toString("base64url")}`;
  if (!isSafeRuntimeId(clientId)) throw new Error("projection observer client identity is invalid");
  const socket = createConnection(discovery.endpoint);
  const decoder = new BoundedProjectionFrameDecoder(PROJECTION_MAX_SERVER_FRAME_BYTES);
  const timeoutMs = bounded(options.connectTimeoutMs ?? 5_000, 100, 60_000, "projection connect timeout");

  return new Promise<ProjectionObserver>((resolveObserver, rejectObserver) => {
    let ready = false;
    const timer = setTimeout(() => fail(new Error("projection observer connection timed out")), timeoutMs);
    timer.unref();
    const observer: ProjectionObserver = Object.freeze({ readOnly: true, clientId, close: () => socket.destroy() });
    const fail = (error: Error) => {
      if (!ready) { clearTimeout(timer); rejectObserver(error); }
      else options.onError?.(error);
      socket.destroy();
    };
    socket.once("connect", () => {
      const hello: ProjectionHelloV1 = { schemaVersion: 1, type: PROJECTION_HELLO_TYPE, clientId, bootstrapIdentity };
      const line = Buffer.from(`${JSON.stringify(hello)}\n`, "utf8");
      if (line.byteLength > PROJECTION_MAX_CLIENT_FRAME_BYTES || !socket.write(line)) fail(new Error("projection hello could not be sent"));
    });
    socket.on("data", (chunk: Buffer) => {
      let values: readonly unknown[];
      try { values = decoder.push(chunk); }
      catch (error) { fail(error instanceof Error ? error : new Error(errorMessage(error))); return; }
      for (const value of values) {
        let frame: ProjectionServerFrameV1;
        try { frame = validateProjectionServerFrame(value); }
        catch (error) { fail(error instanceof Error ? error : new Error(errorMessage(error))); return; }
        if (frame.type === PROJECTION_SNAPSHOT_TYPE) {
          options.onSnapshot?.(frame.snapshot);
          if (!ready) { ready = true; clearTimeout(timer); resolveObserver(observer); }
        } else if (!ready) {
          fail(new Error("projection server sent an event before its snapshot"));
          return;
        } else if (frame.type === PROJECTION_EVENT_TYPE) options.onEvent?.(frame.event);
        else options.onReset?.(frame);
      }
    });
    socket.once("error", (error) => fail(error));
    socket.once("close", () => {
      if (!ready) fail(new Error("projection observer closed before its snapshot"));
    });
  });
}

export function projectionChannelPaths(runtimeDirectory: string, privateSessionIdentity: string): ProjectionChannelPaths {
  if (!isAbsolute(runtimeDirectory) || !privateSessionIdentity) throw new Error("projection channel requires an absolute runtime directory and private session identity");
  const directory = join(resolve(runtimeDirectory), "projection-channels");
  const runtimeRoot = typeof process.env.XDG_RUNTIME_DIR === "string" && isAbsolute(process.env.XDG_RUNTIME_DIR)
    ? resolve(process.env.XDG_RUNTIME_DIR)
    : tmpdir();
  const endpointDirectory = join(runtimeRoot, `aili-pi-${typeof process.getuid === "function" ? process.getuid() : process.pid}`, "projection-channels");
  const sessionDigest = createHash("sha256").update(privateSessionIdentity).digest("hex");
  return Object.freeze({
    directory,
    endpointDirectory,
    sessionDigest,
    discoveryPath: join(directory, `${sessionDigest}.discovery.json`),
    bootstrapPath: join(directory, `${sessionDigest}.bootstrap`),
  });
}

export function validateProjectionHello(value: unknown): ProjectionHelloV1 {
  if (!plainRecord(value) || value.schemaVersion !== 1 || value.type !== PROJECTION_HELLO_TYPE
    || !isSafeRuntimeId(value.clientId) || typeof value.bootstrapIdentity !== "string"
    || !/^[A-Za-z0-9_-]{43}$/.test(value.bootstrapIdentity)
    || Object.keys(value).some((key) => !["schemaVersion", "type", "clientId", "bootstrapIdentity"].includes(key))) {
    throw new Error("invalid ProjectionHelloV1");
  }
  return Object.freeze({ schemaVersion: 1, type: PROJECTION_HELLO_TYPE, clientId: value.clientId, bootstrapIdentity: value.bootstrapIdentity });
}

export function validateProjectionServerFrame(value: unknown): ProjectionServerFrameV1 {
  if (!plainRecord(value) || value.schemaVersion !== 1 || typeof value.type !== "string") throw new Error("invalid projection server frame");
  if (value.type === PROJECTION_SNAPSHOT_TYPE && value.readOnly === true
    && exactKeys(value, ["schemaVersion", "type", "readOnly", "snapshot"])) {
    return Object.freeze({ schemaVersion: 1, type: PROJECTION_SNAPSHOT_TYPE, readOnly: true, snapshot: validateSnapshot(value.snapshot) });
  }
  if (value.type === PROJECTION_EVENT_TYPE && exactKeys(value, ["schemaVersion", "type", "event"])) {
    return Object.freeze({ schemaVersion: 1, type: PROJECTION_EVENT_TYPE, event: validateRuntimeEvent(value.event) });
  }
  if (value.type === PROJECTION_RESET_TYPE && value.snapshotRequired === true
    && exactKeys(value, ["schemaVersion", "type", "reason", "latestCursor", "snapshotRequired"])
    && ["epoch", "gap", "backpressure", "closed"].includes(String(value.reason))
    && typeof value.latestCursor === "string" && parseEventCursor(value.latestCursor)) {
    return Object.freeze({
      schemaVersion: 1,
      type: PROJECTION_RESET_TYPE,
      reason: value.reason as EventResetReason,
      latestCursor: value.latestCursor,
      snapshotRequired: true,
    });
  }
  throw new Error("invalid projection server frame");
}

async function readProjectionDiscovery(paths: ProjectionChannelPaths): Promise<ProjectionDiscoveryV1> {
  await verifyOwnerOnlyArtifact(paths.discoveryPath, "file");
  const info = await lstat(paths.discoveryPath);
  if (info.size > 4_096) throw new Error("projection discovery artifact exceeded its bound");
  let value: unknown;
  try { value = JSON.parse(await readFile(paths.discoveryPath, "utf8")); }
  catch { throw new Error("projection discovery artifact is malformed"); }
  if (!plainRecord(value) || value.schemaVersion !== 1 || value.type !== PROJECTION_DISCOVERY_TYPE
    || value.sessionDigest !== paths.sessionDigest || value.readOnly !== true
    || typeof value.endpoint !== "string" || typeof value.bootstrapPath !== "string"
    || !contained(paths.endpointDirectory, value.endpoint) || value.bootstrapPath !== paths.bootstrapPath) {
    throw new Error("projection discovery artifact was rejected");
  }
  await verifyOwnerOnlySocket(value.endpoint);
  return Object.freeze({
    schemaVersion: 1,
    type: PROJECTION_DISCOVERY_TYPE,
    sessionDigest: paths.sessionDigest,
    endpoint: value.endpoint,
    bootstrapPath: value.bootstrapPath,
    readOnly: true,
  });
}

async function cleanupStaleProjectionArtifacts(paths: ProjectionChannelPaths): Promise<void> {
  try {
    await verifyOwnerOnlyArtifact(paths.discoveryPath, "file");
    const info = await lstat(paths.discoveryPath);
    if (info.size > 4_096) throw new Error("stale projection discovery exceeded its bound");
    const value = JSON.parse(await readFile(paths.discoveryPath, "utf8")) as unknown;
    if (plainRecord(value) && typeof value.endpoint === "string" && contained(paths.endpointDirectory, value.endpoint)) {
      await removeOwnerOnlySocket(value.endpoint).catch(() => undefined);
    }
    await removeOwnerOnlyArtifact(paths.discoveryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try { await removeOwnerOnlyArtifact(paths.bootstrapPath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

function writeProjectionFrame(socket: Socket, frame: ProjectionServerFrameV1): boolean {
  const line = Buffer.from(`${JSON.stringify(frame)}\n`, "utf8");
  if (line.byteLength > PROJECTION_MAX_SERVER_FRAME_BYTES) return false;
  return socket.write(line);
}

async function verifyOwnerOnlySocket(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isSocket() || info.isSymbolicLink()) throw new Error("projection endpoint is not a Unix socket");
  if ((info.mode & 0o077) !== 0) throw new Error("projection endpoint permissions are too broad");
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new Error("projection endpoint has a different owner");
}

async function removeOwnerOnlySocket(path: string): Promise<boolean> {
  try { await verifyOwnerOnlySocket(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  await rm(path);
  return true;
}

function contained(root: string, target: string): boolean {
  if (!isAbsolute(target)) return false;
  const nested = relative(resolve(root), resolve(target));
  return nested === "" || (nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested));
}

function safeSuffix(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  if (!safe) throw new Error("projection endpoint identity is invalid");
  return safe;
}

function bounded(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is outside its permitted range`);
  return value;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 160) || "projection operation failed";
}
