import { randomUUID } from "node:crypto";
import {
  createRuntimeEpoch,
  createRuntimeEvent,
  eventCursor,
  parseEventCursor,
  type JsonValue,
  type RuntimeEventKind,
  type RuntimeEventV1,
  type RuntimeSnapshotV1,
} from "./contracts.js";

export type EventResetReason = "epoch" | "gap" | "backpressure" | "closed";

export type EventReplayResult =
  | { readonly kind: "events"; readonly events: readonly RuntimeEventV1[]; readonly latestCursor: string }
  | { readonly kind: "reset"; readonly reason: EventResetReason; readonly snapshotRequired: true; readonly latestCursor: string };

export interface SnapshotFirstReplay {
  readonly snapshot: RuntimeSnapshotV1;
  readonly replay: EventReplayResult;
}

export interface RuntimeSubscription {
  readonly id: string;
  drain(): EventReplayResult;
  /** Resolve when replay data or a reset is available. This is the push seam used by SSE. */
  wait(): Promise<void>;
  close(): void;
}

export interface RuntimeEventHubOptions {
  readonly runtimeEpoch?: string;
  readonly historyLimit?: number;
  readonly subscriberQueueLimit?: number;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
}

interface Subscriber {
  afterSequence: number;
  queue: RuntimeEventV1[];
  reset?: EventReplayResult & { kind: "reset" };
  waiter?: () => void;
}

/** Ordered, bounded, per-session replay hub used by both SSE and private IPC. */
export class RuntimeEventHub {
  readonly runtimeEpoch: string;
  private readonly historyLimit: number;
  private readonly queueLimit: number;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly subscribers = new Map<string, Subscriber>();
  private history: RuntimeEventV1[] = [];
  private nextSequence = 1;
  private closed = false;

  public constructor(readonly sessionHandle: string, options: RuntimeEventHubOptions = {}) {
    this.runtimeEpoch = options.runtimeEpoch ?? createRuntimeEpoch();
    this.historyLimit = bounded(options.historyLimit ?? 256, "historyLimit");
    this.queueLimit = bounded(options.subscriberQueueLimit ?? 64, "subscriberQueueLimit");
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  public get latestSequence(): number { return this.nextSequence - 1; }
  public get latestCursor(): string { return eventCursor(this.runtimeEpoch, this.latestSequence); }
  public get earliestSequence(): number { return this.history[0]?.sequence ?? this.nextSequence; }
  public get subscriberCount(): number { return this.subscribers.size; }

  public publish(
    source: string,
    eventType: RuntimeEventKind,
    payload: Readonly<Record<string, JsonValue>>,
    metadata: string | { readonly runId?: string; readonly leaseGeneration?: string; readonly requestId?: string; readonly capability?: string } = {},
  ): RuntimeEventV1 {
    if (this.closed) throw new Error("runtime event hub is closed");
    const options = typeof metadata === "string" ? { runId: metadata } : metadata;
    const event = createRuntimeEvent({
      runtimeEpoch: this.runtimeEpoch,
      sessionHandle: this.sessionHandle,
      sequence: this.nextSequence++,
      emittedAt: this.now().toISOString(),
      source,
      eventType,
      payload,
      ...options,
    });
    this.history.push(event);
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.reset || event.sequence <= subscriber.afterSequence) continue;
      if (subscriber.queue.length >= this.queueLimit) {
        subscriber.queue = [];
        subscriber.reset = this.reset("backpressure");
      } else {
        subscriber.queue.push(event);
      }
      notify(subscriber);
    }
    return event;
  }

  public replay(cursor?: string): EventReplayResult {
    if (this.closed) return this.reset("closed");
    if (cursor === undefined) return { kind: "events", events: [...this.history], latestCursor: this.latestCursor };
    const parsed = parseEventCursor(cursor);
    if (!parsed || parsed.runtimeEpoch !== this.runtimeEpoch) return this.reset("epoch");
    if (parsed.sequence < this.earliestSequence - 1 || parsed.sequence > this.latestSequence) return this.reset("gap");
    return { kind: "events", events: this.history.filter((event) => event.sequence > parsed.sequence), latestCursor: this.latestCursor };
  }

  /** Initial clients accept this snapshot before applying any later events. */
  public snapshotFirst(snapshot: RuntimeSnapshotV1, cursor?: string): SnapshotFirstReplay {
    if (snapshot.runtimeEpoch !== this.runtimeEpoch || snapshot.sessionHandle !== this.sessionHandle || snapshot.lastSequence !== this.latestSequence) {
      throw new Error("snapshot is not current for runtime event hub");
    }
    if (cursor === undefined) return { snapshot, replay: { kind: "events", events: [], latestCursor: this.latestCursor } };
    return { snapshot, replay: this.replay(cursor) };
  }

  public subscribe(cursor?: string): RuntimeSubscription {
    const id = `sub-${this.idFactory()}`;
    const initial = this.replay(cursor);
    const parsed = cursor === undefined ? undefined : parseEventCursor(cursor);
    const subscriber: Subscriber = {
      afterSequence: parsed?.runtimeEpoch === this.runtimeEpoch ? parsed.sequence : 0,
      queue: initial.kind === "events" ? [...initial.events] : [],
      reset: initial.kind === "reset" ? initial : undefined,
    };
    this.subscribers.set(id, subscriber);
    return {
      id,
      drain: () => {
        const current = this.subscribers.get(id);
        if (!current) return this.reset("closed");
        if (current.reset) {
          const reset = current.reset;
          current.reset = undefined;
          current.afterSequence = this.latestSequence;
          return reset;
        }
        const events = current.queue;
        current.queue = [];
        if (events.length) current.afterSequence = events.at(-1)!.sequence;
        return { kind: "events", events, latestCursor: this.latestCursor };
      },
      wait: () => {
        const current = this.subscribers.get(id);
        if (!current || current.reset || current.queue.length > 0) return Promise.resolve();
        if (current.waiter) throw new Error("runtime subscription already has a pending wait");
        return new Promise<void>((resolveWait) => {
          const latest = this.subscribers.get(id);
          if (!latest || latest.reset || latest.queue.length > 0) resolveWait();
          else latest.waiter = resolveWait;
        });
      },
      close: () => {
        const current = this.subscribers.get(id);
        if (current) notify(current);
        this.subscribers.delete(id);
      },
    };
  }

  public heartbeat(): RuntimeEventV1 {
    return this.publish("runtime", "heartbeat", { cursor: this.latestCursor });
  }

  public close(): void {
    this.closed = true;
    for (const subscriber of this.subscribers.values()) notify(subscriber);
    this.subscribers.clear();
    this.history = [];
  }

  private reset(reason: EventResetReason): EventReplayResult & { kind: "reset" } {
    return { kind: "reset", reason, snapshotRequired: true, latestCursor: this.latestCursor };
  }
}

function notify(subscriber: Subscriber): void {
  const waiter = subscriber.waiter;
  subscriber.waiter = undefined;
  waiter?.();
}

function bounded(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 4_096) throw new Error(`${name} must be 1..4096`);
  return value;
}
