const MINUTE_MS = 60_000;

export interface NativeFooterLifecycleOptions {
  now?: () => number;
  setInterval?: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval?: (timer: ReturnType<typeof globalThis.setInterval>) => void;
}

export class NativeFooterLifecycle {
  private readonly now: () => number;
  private readonly schedule: NonNullable<NativeFooterLifecycleOptions["setInterval"]>;
  private readonly cancel: NonNullable<NativeFooterLifecycleOptions["clearInterval"]>;
  private timer?: ReturnType<typeof globalThis.setInterval>;
  private requestRender?: () => void;
  private lastClockMinute = -1;
  private lastStatusKey = "";

  constructor(options: NativeFooterLifecycleOptions = {}) {
    this.now = options.now ?? Date.now;
    this.schedule = options.setInterval ?? globalThis.setInterval;
    this.cancel = options.clearInterval ?? globalThis.clearInterval;
  }

  start(requestRender: () => void): void {
    this.stop();
    this.requestRender = requestRender;
    this.lastClockMinute = Math.floor(this.now() / MINUTE_MS);
    this.timer = this.schedule(() => {
      const minute = Math.floor(this.now() / MINUTE_MS);
      if (minute === this.lastClockMinute) return;
      this.lastClockMinute = minute;
      this.requestRender?.();
    }, MINUTE_MS);
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
    this.lastClockMinute = -1;
    this.lastStatusKey = "";
  }
}
