import { connect, type Socket } from "node:net";
import {
  HERDR_OBSERVED_EVENT_KINDS,
  HerdrProtocolError,
  HerdrUnavailableError,
  SUPPORTED_HERDR_PROTOCOL,
  projectSnapshot,
  type HerdrSnapshot,
  type HerdrSubscriptionEvent,
} from "./protocol.js";

export interface HerdrClientOptions {
  socketPath: string;
  callTimeoutMs?: number;
}

export interface HerdrSyncResult {
  snapshot: HerdrSnapshot;
  /** Events that arrived between subscription confirmation and snapshot
   *  installation, replayed in arrival order (bootstrap-gap prevention). */
  replayed: HerdrSubscriptionEvent[];
}

/**
 * Client for Herdr's raw socket API. The daemon's connection model (verified
 * live, protocol 20): every request is served on its own one-shot
 * connection, closed after one response; an events.subscribe connection
 * stays open as a receive-only event stream. This client therefore keeps a
 * dedicated subscription socket plus one-shot command connections, and
 * re-establishes both on sync with subscribe → buffer → snapshot → replay
 * ordering so no state change is missed between subscription and snapshot.
 */
export class HerdrSocketClient {
  private subscription?: Socket;
  private subscribed = false;
  private nextId = 1;
  private eventObserver?: (event: HerdrSubscriptionEvent) => void;
  private buffering = false;
  private readonly buffered: HerdrSubscriptionEvent[] = [];
  private lastProtocol?: number;
  private readonly callTimeoutMs: number;

  constructor(private readonly options: HerdrClientOptions) {
    this.callTimeoutMs = options.callTimeoutMs ?? 30_000;
  }

  get isConnected(): boolean {
    return this.subscribed;
  }

  /** Verified against the daemon's advertised protocol on every sync. */
  get protocolVersion(): number | undefined {
    return this.lastProtocol;
  }

  async disconnect(): Promise<void> {
    this.subscribed = false;
    this.eventObserver = undefined;
    this.subscription?.destroy();
    this.subscription = undefined;
  }

  private openSocket(timeoutMs: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.options.socketPath);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new HerdrUnavailableError(`herdr socket connect timeout (${this.options.socketPath})`));
      }, timeoutMs);
      socket.once("error", (error: Error) => {
        clearTimeout(timer);
        socket.destroy();
        reject(new HerdrUnavailableError(`cannot connect to herdr socket ${this.options.socketPath} (${error.message})`));
      });
      socket.once("connect", () => {
        clearTimeout(timer);
        socket.setEncoding("utf8");
        socket.on("error", () => socket.destroy());
        resolve(socket);
      });
    });
  }

  /** One request per one-shot connection — the daemon closes after one
   *  response, so each call opens, sends, awaits exactly one frame, closes. */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = `aili-${this.nextId++}`;
    const socket = await this.openSocket(Math.min(this.callTimeoutMs, 5_000));
    return await new Promise<T>((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new HerdrUnavailableError(`${method} timed out after ${this.callTimeoutMs}ms`, "herdr-timeout"));
      }, this.callTimeoutMs);
      const finish = (error: Error | undefined, result?: unknown) => {
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result as T);
      };
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const line = buffer.slice(0, newline).trim();
        if (line.length === 0) return;
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(line) as Record<string, unknown>;
        } catch {
          finish(new HerdrProtocolError(`${method} returned a malformed frame`));
          return;
        }
        const error = frame.error as { code?: string; message?: string } | undefined;
        if (error && typeof error.code === "string") {
          finish(new HerdrProtocolError(error.message ?? "herdr request failed", error.code));
        } else {
          finish(undefined, frame.result);
        }
      });
      socket.on("close", () => {
        clearTimeout(timer);
        reject(new HerdrUnavailableError(`herdr closed the connection before responding to ${method}`));
      });
      socket.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (error) finish(new HerdrUnavailableError(`${method} write failed (${error.message})`));
      });
    });
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscribed && this.subscription) return;
    this.subscription?.destroy();
    const socket = await this.openSocket(5_000);
    socket.on("data", (chunk: string) => this.receiveSubscription(chunk));
    socket.on("close", () => {
      this.subscribed = false;
      this.subscription = undefined;
    });
    await new Promise<void>((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(() => reject(new HerdrUnavailableError("events.subscribe timed out")), this.callTimeoutMs);
      const onStart = (chunk: string) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const line = buffer.slice(0, newline).trim();
        if (line.length === 0) return;
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(line) as Record<string, unknown>;
        } catch {
          clearTimeout(timer);
          reject(new HerdrProtocolError("events.subscribe returned a malformed frame"));
          return;
        }
        const result = frame.result as Record<string, unknown> | undefined;
        const error = frame.error as { code?: string; message?: string } | undefined;
        if (error && typeof error.code === "string") {
          clearTimeout(timer);
          reject(new HerdrProtocolError(error.message ?? "events.subscribe failed", error.code));
          return;
        }
        // Real daemon: {result:{type:"subscription_started"}}; test fakes may
        // acknowledge differently — any successful response starts the stream.
        if (!result) return;
        clearTimeout(timer);
        socket.off("data", onStart);
        this.subscribed = true;
        resolve();
      };
      socket.on("data", onStart);
      socket.write(`${JSON.stringify({ id: "aili-subscribe", method: "events.subscribe", params: { subscriptions: HERDR_OBSERVED_EVENT_KINDS.map((type) => ({ type })) } })}\n`, (error) => {
        if (error) {
          clearTimeout(timer);
          reject(new HerdrUnavailableError(`events.subscribe write failed (${error.message})`));
        }
      });
    });
  }

  /** Gap-free (re)establishment of Herdr state + event stream. */
  async sync(observer?: (event: HerdrSubscriptionEvent) => void): Promise<HerdrSyncResult> {
    this.eventObserver = undefined;
    this.buffering = true;
    this.buffered.length = 0;
    try {
      await this.ensureSubscribed();
      const raw = await this.call("session.snapshot", {});
      const snapshot = projectSnapshot(raw);
      if (typeof snapshot.protocol === "number" && snapshot.protocol !== SUPPORTED_HERDR_PROTOCOL) {
        throw new HerdrProtocolError(`daemon protocol ${snapshot.protocol} is not supported (expected ${SUPPORTED_HERDR_PROTOCOL}); refusing to guess state`, "protocol-mismatch");
      }
      this.lastProtocol = snapshot.protocol ?? SUPPORTED_HERDR_PROTOCOL;
      // Install the snapshot first, then apply buffered events in order.
      const replayed = [...this.buffered];
      this.buffering = false;
      this.buffered.length = 0;
      this.eventObserver = observer;
      for (const event of replayed) observer?.(event);
      return { snapshot, replayed };
    } catch (error) {
      this.buffering = false;
      this.buffered.length = 0;
      throw error;
    }
  }

  private receiveSubscription(chunk: string): void {
    let buffer = chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) {
        try {
          const frame = JSON.parse(line) as Record<string, unknown>;
          if (typeof frame.event === "string") {
            const event: HerdrSubscriptionEvent = { event: frame.event, data: (frame.data ?? {}) as Record<string, unknown> };
            if (this.buffering) this.buffered.push(event);
            else this.eventObserver?.(event);
          }
        } catch {
          // Ignore malformed frames; the daemon owns the stream.
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
}

export function defaultHerdrSocketPath(): string {
  if (process.env.HERDR_SOCK) return process.env.HERDR_SOCK;
  if (process.env.XDG_CONFIG_HOME) return `${process.env.XDG_CONFIG_HOME.replace(/\/$/, "")}/herdr/herdr.sock`;
  const home = process.env.HOME ?? "~";
  return `${home}/.config/herdr/herdr.sock`;
}
