const MINUTE_MS = 60_000;

export interface NativeFooterLifecycleOptions {
  now?: () => number;
  setInterval?: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval?: (timer: ReturnType<typeof globalThis.setInterval>) => void;
  /** Footer tick cadence; 1000ms keeps live telemetry at 1 Hz. */
  fastTickMs?: number;
  /**
   * Signature of render-affecting external state (e.g. telemetry). A tick only
   * requests a render when the signature changes, so idle footers stay at one
   * redraw per clock minute.
   */
  renderSignal?: () => string;
}

export class NativeFooterLifecycle {
  private readonly now: () => number;
  private readonly schedule: NonNullable<NativeFooterLifecycleOptions["setInterval"]>;
  private readonly cancel: NonNullable<NativeFooterLifecycleOptions["clearInterval"]>;
  private readonly fastTickMs: number;
  private readonly renderSignal: (() => string) | undefined;
  private timer?: ReturnType<typeof globalThis.setInterval>;
  private requestRender?: () => void;
  private lastSignal = "";
  private lastStatusKey = "";

  constructor(options: NativeFooterLifecycleOptions = {}) {
    this.now = options.now ?? Date.now;
    this.schedule = options.setInterval ?? globalThis.setInterval;
    this.cancel = options.clearInterval ?? globalThis.clearInterval;
    this.fastTickMs = options.fastTickMs ?? 1_000;
    this.renderSignal = options.renderSignal;
  }

  start(requestRender: () => void): void {
    this.stop();
    this.requestRender = requestRender;
    this.lastSignal = this.signal();
    this.timer = this.schedule(() => {
      const next = this.signal();
      if (next === this.lastSignal) return;
      this.lastSignal = next;
      this.requestRender?.();
    }, this.fastTickMs);
    this.timer.unref?.();
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
    this.requestRender = undefined;
    this.lastSignal = "";
    this.lastStatusKey = "";
  }

  /** Clock minute plus the caller's render signal; equal values never re-render. */
  private signal(): string {
    const minute = Math.floor(this.now() / MINUTE_MS);
    return this.renderSignal ? `${minute}\0${this.renderSignal()}` : `${minute}`;
  }
}
