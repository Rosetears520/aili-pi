export const DEFAULT_PARENT_CONCURRENCY = 32;
export const DEFAULT_AGENT_MAX_RUNTIME_MS = 0;
export const DEFAULT_AGENT_SOFT_REQUEST_BUDGET = 0;

export class ScheduledTaskCancelledError extends Error {
  constructor(readonly jobId: string, readonly beforeStart: boolean) {
    super(`${jobId}: scheduled task cancelled${beforeStart ? " before start" : ""}`);
    this.name = "ScheduledTaskCancelledError";
  }
}

export interface SchedulerPermit {
  readonly ownerJobId: string;
  readonly token: symbol;
}

export interface ScheduledExecutionContext {
  signal: AbortSignal;
  permit: SchedulerPermit;
  maxRuntimeMs: 0;
  softRequestBudget: 0;
  nested: boolean;
}

export interface ScheduledHandle<T> {
  jobId: string;
  result: Promise<T>;
  state(): "queued" | "running" | "settled" | "cancelled";
}

interface QueueEntry<T> {
  jobId: string;
  controller: AbortController;
  run: (context: ScheduledExecutionContext) => Promise<T>;
  onCancelBeforeStart?: () => void | Promise<void>;
  resolve: (result: T) => void;
  reject: (error: unknown) => void;
  state: "queued" | "running" | "settled" | "cancelled";
  permit?: SchedulerPermit;
}

export class FifoTurnScheduler {
  private readonly queue: Array<QueueEntry<unknown>> = [];
  private readonly running = new Map<string, QueueEntry<unknown>>();
  private readonly nestedRunning = new Map<string, { controller: AbortController }>();
  private readonly known = new Set<string>();
  private readonly permitTokens = new Set<symbol>();
  private readonly nestedTails = new Map<symbol, Promise<void>>();
  private closed = false;

  constructor(readonly capacity = DEFAULT_PARENT_CONCURRENCY) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new Error("scheduler capacity must be a positive integer");
  }

  enqueue<T>(
    jobId: string,
    run: (context: ScheduledExecutionContext) => Promise<T>,
    onCancelBeforeStart?: () => void | Promise<void>,
  ): ScheduledHandle<T> {
    if (this.closed) throw new Error("scheduler is closed");
    if (this.known.has(jobId)) throw new Error(`${jobId}: duplicate scheduled job`);
    this.known.add(jobId);
    let resolveResult!: (result: T) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const entry: QueueEntry<T> = {
      jobId,
      controller: new AbortController(),
      run,
      onCancelBeforeStart,
      resolve: resolveResult,
      reject: rejectResult,
      state: "queued",
    };
    this.queue.push(entry as QueueEntry<unknown>);
    this.drain();
    return { jobId, result, state: () => entry.state };
  }

  runNested<T>(
    jobId: string,
    inheritedPermit: SchedulerPermit,
    run: (context: ScheduledExecutionContext) => Promise<T>,
  ): ScheduledHandle<T> {
    if (this.closed) throw new Error("scheduler is closed");
    if (!this.permitTokens.has(inheritedPermit.token)) throw new Error(`${jobId}: nested execution requires an active ancestor permit`);
    if (this.known.has(jobId)) throw new Error(`${jobId}: duplicate scheduled job`);
    this.known.add(jobId);
    let state: "queued" | "running" | "settled" | "cancelled" = "queued";
    const controller = new AbortController();
    const previous = this.nestedTails.get(inheritedPermit.token) ?? Promise.resolve();
    const operation = previous.then(async () => {
      state = "running";
      return await run({
        signal: controller.signal,
        permit: inheritedPermit,
        maxRuntimeMs: DEFAULT_AGENT_MAX_RUNTIME_MS,
        softRequestBudget: DEFAULT_AGENT_SOFT_REQUEST_BUDGET,
        nested: true,
      });
    });
    this.nestedRunning.set(jobId, { controller });
    const result = operation.then(
      (value) => {
        state = "settled";
        this.nestedRunning.delete(jobId);
        return value;
      },
      (error) => {
        state = controller.signal.aborted ? "cancelled" : "settled";
        this.nestedRunning.delete(jobId);
        throw error;
      },
    );
    this.nestedTails.set(inheritedPermit.token, result.then(() => undefined, () => undefined));
    return { jobId, result, state: () => state };
  }

  async cancel(jobId: string): Promise<"queued" | "running" | "not-found"> {
    const queuedIndex = this.queue.findIndex((entry) => entry.jobId === jobId);
    if (queuedIndex >= 0) {
      const [entry] = this.queue.splice(queuedIndex, 1);
      entry!.state = "cancelled";
      entry!.controller.abort(new ScheduledTaskCancelledError(jobId, true));
      try {
        await entry!.onCancelBeforeStart?.();
      } finally {
        entry!.reject(new ScheduledTaskCancelledError(jobId, true));
      }
      return "queued";
    }
    const running = this.running.get(jobId);
    if (running) {
      running.controller.abort(new ScheduledTaskCancelledError(jobId, false));
      return "running";
    }
    const nested = this.nestedRunning.get(jobId);
    if (nested) {
      nested.controller.abort(new ScheduledTaskCancelledError(jobId, false));
      return "running";
    }
    return "not-found";
  }

  isPermitActive(permit: SchedulerPermit): boolean {
    return this.permitTokens.has(permit.token);
  }

  stats(): { active: number; capacity: number; queued: string[]; running: string[]; closed: boolean } {
    return {
      active: this.running.size,
      capacity: this.capacity,
      queued: this.queue.map((entry) => entry.jobId),
      running: [...this.running.keys()],
      closed: this.closed,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const entry of [...this.queue]) await this.cancel(entry.jobId);
    for (const entry of this.running.values()) entry.controller.abort(new ScheduledTaskCancelledError(entry.jobId, false));
    for (const [jobId, entry] of this.nestedRunning) entry.controller.abort(new ScheduledTaskCancelledError(jobId, false));
  }

  private drain(): void {
    while (!this.closed && this.running.size < this.capacity && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      entry.state = "running";
      const permit: SchedulerPermit = { ownerJobId: entry.jobId, token: Symbol(entry.jobId) };
      entry.permit = permit;
      this.permitTokens.add(permit.token);
      this.running.set(entry.jobId, entry);
      void entry.run({
        signal: entry.controller.signal,
        permit,
        maxRuntimeMs: DEFAULT_AGENT_MAX_RUNTIME_MS,
        softRequestBudget: DEFAULT_AGENT_SOFT_REQUEST_BUDGET,
        nested: false,
      }).then(
        (result) => {
          entry.state = "settled";
          entry.resolve(result);
        },
        (error) => {
          entry.state = entry.controller.signal.aborted ? "cancelled" : "settled";
          entry.reject(error);
        },
      ).finally(() => {
        this.running.delete(entry.jobId);
        this.permitTokens.delete(permit.token);
        this.nestedTails.delete(permit.token);
        this.drain();
      });
    }
  }
}
