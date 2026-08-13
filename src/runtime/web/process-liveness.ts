import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, rm } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createOwnerOnlyArtifact, verifyOwnerOnlyArtifact, type OwnerOnlyArtifact } from "./access-policy.js";
import type { LeaseProcessIdentityV1, WriterLeaseRecordV1 } from "./session-writer-lease.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_FRAME = 256;

export class OwnerOnlyProcessLivenessServer {
  readonly endpointId: string;
  private readonly endpoint: string;
  private readonly discoveryPath: string;
  private server?: Server;
  private artifact?: OwnerOnlyArtifact;
  private closed = false;
  private readonly activeSockets = new Set<Socket>();

  public constructor(
    runtimeDirectory: string,
    private readonly ownsGeneration: (generation: string) => boolean,
    endpointId = `liveness-${randomBytes(12).toString("base64url")}`,
  ) {
    if (!isAbsolute(runtimeDirectory) || !SAFE_ID.test(endpointId)) throw new Error("invalid process liveness endpoint");
    if (typeof ownsGeneration !== "function") throw new Error("process liveness ownership probe is required");
    this.endpointId = endpointId;
    const runtimeRoot = resolve(runtimeDirectory);
    this.discoveryPath = join(runtimeRoot, "liveness", `${endpointId}.json`);
    const socketRoot = resolve(join(tmpdir(), `aili-pi-${typeof process.getuid === "function" ? process.getuid() : process.pid}`, "liveness"));
    this.endpoint = join(socketRoot, `${endpointId}.sock`);
    if (Buffer.byteLength(this.endpoint) > 100) throw new Error("process liveness endpoint path is too long");
  }

  public async start(): Promise<void> {
    if (this.closed) throw new Error("process liveness server is closed");
    if (this.server) return;
    const endpointDirectory = dirname(this.endpoint);
    const discoveryDirectory = dirname(this.discoveryPath);
    const runtimeRoot = dirname(discoveryDirectory);
    await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
    await verifyOwnerOnlyArtifact(runtimeRoot, "directory");
    await mkdir(discoveryDirectory, { recursive: true, mode: 0o700 });
    await chmod(discoveryDirectory, 0o700);
    await verifyOwnerOnlyArtifact(discoveryDirectory, "directory");
    await mkdir(endpointDirectory, { recursive: true, mode: 0o700 });
    await chmod(endpointDirectory, 0o700);
    try { await verifyOwnerOnlyArtifact(this.discoveryPath, "file"); await rm(this.discoveryPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await verifyOwnerOnlyArtifact(endpointDirectory, "directory");
    try { await verifyOwnerSocket(this.endpoint); await rm(this.endpoint); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const server = createServer((socket) => this.accept(socket));
    this.server = server;
    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        const error = (cause: Error) => { server.off("listening", listening); rejectListen(cause); };
        const listening = () => { server.off("error", error); resolveListen(); };
        server.once("error", error);
        server.once("listening", listening);
        server.listen(this.endpoint);
      });
      server.unref();
      await chmod(this.endpoint, 0o600);
      await verifyOwnerSocket(this.endpoint);
      try { await verifyOwnerOnlyArtifact(this.discoveryPath, "file"); await rm(this.discoveryPath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      this.artifact = await createOwnerOnlyArtifact(this.discoveryPath, `${JSON.stringify({ schemaVersion: 1, endpointId: this.endpointId, endpoint: this.endpoint })}\n`);
    } catch (error) {
      for (const socket of this.activeSockets) socket.destroy();
      if (server.listening) await new Promise<void>((resolveClose) => server.close(() => resolveClose())).catch(() => undefined);
      this.server = undefined;
      this.activeSockets.clear();
      try { await verifyOwnerSocket(this.endpoint); await rm(this.endpoint); }
      catch { /* preserve original startup error */ }
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const server = this.server;
    this.server = undefined;
    for (const socket of this.activeSockets) socket.destroy();
    this.activeSockets.clear();
    if (server?.listening) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    const failures: string[] = [];
    if (this.artifact) {
      try { await this.artifact.cleanup(); } catch { failures.push("discovery-artifact"); }
    }
    this.artifact = undefined;
    try {
      try { await verifyOwnerSocket(this.endpoint); await rm(this.endpoint); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    } catch { failures.push("socket-endpoint"); }
    if (failures.length) throw new Error(`process liveness cleanup failed: ${failures.join(",")}`);
  }

  private accept(socket: Socket): void {
    this.activeSockets.add(socket);
    socket.once("close", () => this.activeSockets.delete(socket));
    socket.setTimeout(1_000, () => socket.destroy());
    let buffered = "";
    socket.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      if (Buffer.byteLength(buffered) > MAX_FRAME) return socket.destroy();
      const newline = buffered.indexOf("\n");
      if (newline < 0) return;
      const generation = buffered.slice(0, newline);
      let owns = false;
      if (SAFE_ID.test(generation)) try { owns = this.ownsGeneration(generation); } catch { owns = false; }
      const valid = buffered.slice(newline + 1) === "" && owns;
      socket.removeAllListeners("data");
      socket.end(valid ? "1\n" : "0\n");
    });
    socket.once("error", () => undefined);
  }
}

export async function probeOwnerProcessLiveness(runtimeDirectory: string, endpointId: string, generation: string): Promise<boolean> {
  if (!isAbsolute(runtimeDirectory) || !SAFE_ID.test(endpointId) || !SAFE_ID.test(generation)) return false;
  const runtimeRoot = resolve(runtimeDirectory);
  const discoveryDirectory = join(runtimeRoot, "liveness");
  const discoveryPath = join(discoveryDirectory, `${endpointId}.json`);
  try {
    await verifyOwnerOnlyArtifact(runtimeRoot, "directory");
    await verifyOwnerOnlyArtifact(discoveryDirectory, "directory");
    await verifyOwnerOnlyArtifact(discoveryPath, "file");
    const info = await lstat(discoveryPath);
    if (info.size < 2 || info.size > 4_096) return false;
    const value = JSON.parse(await readFile(discoveryPath, "utf8")) as { schemaVersion?: unknown; endpointId?: unknown; endpoint?: unknown };
    const endpoint = value.endpoint;
    const socketRoot = resolve(join(tmpdir(), `aili-pi-${typeof process.getuid === "function" ? process.getuid() : process.pid}`, "liveness"));
    if (value.schemaVersion !== 1 || value.endpointId !== endpointId || typeof endpoint !== "string" || !contained(socketRoot, endpoint)
      || dirname(endpoint) !== socketRoot || endpoint !== join(socketRoot, `${endpointId}.sock`)) return false;
    await verifyOwnerSocket(endpoint);
    return await probeSocket(endpoint, generation);
  } catch { return false; }
}

export function currentProcessIdentity(): LeaseProcessIdentityV1 {
  const fingerprint = processStartFingerprint(process.pid);
  if (!fingerprint) throw new Error("Linux process start identity is unavailable");
  return Object.freeze({ pid: process.pid, startFingerprint: fingerprint });
}

export function isExactProcessAlive(identity: LeaseProcessIdentityV1): boolean {
  return processStartFingerprint(identity.pid) === identity.startFingerprint;
}

export async function markLeaseInterrupted(runtimeDirectory: string, record: WriterLeaseRecordV1): Promise<void> {
  if (!isAbsolute(runtimeDirectory)) throw new Error("interrupted-turn runtime directory must be absolute");
  const activeTurnId = record.activeTurnId;
  if (!/^[a-f0-9]{64}$/.test(record.sessionDigest) || !SAFE_ID.test(record.generation)
    || !record.activeTurn || typeof activeTurnId !== "string" || !SAFE_ID.test(activeTurnId)) throw new Error("invalid interrupted-turn lease identity");
  const runtimeRoot = resolve(runtimeDirectory);
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  await verifyOwnerOnlyArtifact(runtimeRoot, "directory");
  const interruptedRoot = join(runtimeRoot, "interrupted-turns");
  await mkdir(interruptedRoot, { recursive: true, mode: 0o700 });
  await chmod(interruptedRoot, 0o700);
  await verifyOwnerOnlyArtifact(interruptedRoot, "directory");
  const directory = join(interruptedRoot, record.sessionDigest);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await verifyOwnerOnlyArtifact(directory, "directory");
  const path = join(directory, `${record.generation}.json`);
  let handle;
  try { handle = await open(path, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") { await verifyOwnerOnlyArtifact(path, "file"); return; }
    throw error;
  }
  try {
    await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, sessionDigest: record.sessionDigest, generation: record.generation, owner: record.owner, activeTurnId: record.activeTurnId, interruptedAt: new Date().toISOString() })}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  await verifyOwnerOnlyArtifact(path, "file");
}

function processStartFingerprint(pid: number): string | undefined {
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 4_194_304) return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, { encoding: "utf8", flag: "r" });
    const end = stat.lastIndexOf(")");
    if (end < 1) return undefined;
    const fields = stat.slice(end + 2).trim().split(/\s+/);
    const startTime = fields[19];
    if (!startTime || !/^\d+$/.test(startTime)) return undefined;
    return createHash("sha256").update(`${pid}:${startTime}`).digest("base64url").slice(0, 32);
  } catch { return undefined; }
}

async function probeSocket(endpoint: string, generation: string): Promise<boolean> {
  return new Promise<boolean>((resolveProbe) => {
    const socket = createConnection({ path: endpoint });
    let settled = false;
    let response = "";
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe(result);
    };
    socket.setTimeout(1_000, () => finish(false));
    socket.once("connect", () => { socket.write(`${generation}\n`); });
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (response.length > 8) return finish(false);
      if (response.includes("\n")) finish(response === "1\n");
    });
    socket.once("error", () => finish(false));
    socket.once("end", () => finish(response === "1\n"));
    socket.once("close", () => finish(response === "1\n"));
  });
}

async function verifyOwnerSocket(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isSocket() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error("unsafe process liveness socket");
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw new Error("process liveness socket owner mismatch");
}
function contained(root: string, target: string): boolean {
  if (!isAbsolute(target)) return false;
  const nested = relative(resolve(root), resolve(target));
  return nested === "" || (nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested));
}
