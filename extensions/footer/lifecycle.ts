const MINUTE_MS = 60_000;

export interface NativeFooterLifecycleOptions {
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
  /** Tick cadence while telemetry is live (waiting/streaming/retention). */
  fastTickMs?: number;
  /** True while 1 Hz ticks are needed; false while the footer is idle. */
  needsFastTick?: () => boolean;
  /**
   * Signature of render-affecting external state (e.g. telemetry). A tick only
   * requests a render when the signature changes, so an idle footer never
   * redraws just because a timer fired.
   */
  renderSignal?: () => string;
}

/**
 * Adaptive footer refresh: 1 Hz while telemetry is live, one wake per minute
 * (aligned to the clock boundary) while idle. Stream events never render;
 * they may call {@link activityChanged} to retune the timer only.
 */
export class NativeFooterLifecycle {
  private readonly now: () => number;
  private readonly schedule: NonNullable<NativeFooterLifecycleOptions["setTimeout"]>;
  private readonly cancel: NonNullable<NativeFooterLifecycleOptions["clearTimeout"]>;
  private readonly fastTickMs: number;
  private readonly needsFastTick: (() => boolean) | undefined;
  private readonly renderSignal: (() => string) | undefined;
  private timer?: ReturnType<typeof globalThis.setTimeout>;
  private mode: "fast" | "idle" | null = null;
  private requestRender?: () => void;
  private lastSignal = "";
  private lastStatusKey = "";

  constructor(options: NativeFooterLifecycleOptions = {}) {
    this.now = options.now ?? Date.now;
    this.schedule = options.setTimeout ?? globalThis.setTimeout;
    this.cancel = options.clearTimeout ?? globalThis.clearTimeout;
    this.fastTickMs = options.fastTickMs ?? 1_000;
    this.needsFastTick = options.needsFastTick;
    this.renderSignal = options.renderSignal;
  }

  start(requestRender: () => void): void {
    this.stop();
    this.requestRender = requestRender;
    this.lastSignal = this.signal();
    this.applyMode();
  }

  /**
   * Stream-event hook: retunes the timer cadence (idle ↔ 1 Hz) WITHOUT
   * requesting a render. Rendering still happens only on a tick whose signal
   * changed, at most 1 Hz.
   */
  activityChanged(): void {
    if (this.timer === undefined) return;
    this.applyMode();
  }

  statusChanged(statuses: ReadonlyMap<string, string>): void {
    const next = [...statuses.entries()].map(([key, value]) => `${key}\0${value}`).sort().join("\x01");
    if (next === this.lastStatusKey) return;
    this.lastStatusKey = next;
    this.requestRender?.();
  }

  stop(): void {
    if (this.timer !== undefined) this.cancel(this.timer);
    this.timer = undefined;
    this.mode = null;
    this.requestRender = undefined;
    this.lastSignal = "";
    this.lastStatusKey = "";
  }

  /** Clock minute plus the caller's render signal; equal values never re-render. */
  private signal(): string {
    const minute = Math.floor(this.now() / MINUTE_MS);
    return this.renderSignal ? `${minute}\0${this.renderSignal()}` : `${minute}`;
  }

  private tick(): void {
    this.timer = undefined;
    const next = this.signal();
    if (next !== this.lastSignal) {
      this.lastSignal = next;
      this.requestRender?.();
    }
    // Force a reschedule: the tick consumed the pending timer.
    this.mode = null;
    this.applyMode();
  }

  private applyMode(): void {
    const nextMode = this.needsFastTick?.() ? "fast" : "idle";
    if (nextMode === this.mode) return;
    if (this.timer !== undefined) {
      this.cancel(this.timer);
      this.timer = undefined;
    }
    this.mode = nextMode;
    const delay = nextMode === "fast" ? this.fastTickMs : this.idleDelay();
    this.timer = this.schedule(() => this.tick(), delay);
    this.timer.unref?.();
  }

  /** One wake just past each minute boundary so the clock renders on time. */
  private idleDelay(): number {
    const intoMinute = this.now() % MINUTE_MS;
    return MINUTE_MS - intoMinute + 1;
  }
}
