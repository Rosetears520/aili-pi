import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeFooterLifecycle } from "../../extensions/footer/lifecycle.js";

afterEach(() => vi.useRealTimers());

describe("Pi-native footer lifecycle", () => {
  it("wakes once per minute while idle and renders only on a clock change", () => {
    vi.useFakeTimers();
    let now = 0;
    const render = vi.fn();
    const delays: number[] = [];
    const lifecycle = new NativeFooterLifecycle({
      now: () => now,
      setTimeout: (callback, delay) => {
        delays.push(delay);
        return globalThis.setTimeout(callback, delay as number) as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (timer) => globalThis.clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
    });
    lifecycle.start(render);

    // Idle schedule aligns just past the minute boundary: no 1 Hz wakeups.
    expect(delays[0]).toBeGreaterThanOrEqual(30_000);

    now = 59_999;
    vi.advanceTimersByTime(delays[0]!);
    // The tick landed before the minute changed: no render, next wake scheduled.
    expect(render).not.toHaveBeenCalled();

    now = 60_000;
    vi.advanceTimersByTime(delays[1]!);
    expect(render).toHaveBeenCalledTimes(1);

    lifecycle.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ticks at 1 Hz while fast, then returns to minute wakes after activity ends", () => {
    vi.useFakeTimers();
    let minute = 0;
    let signal = "waiting";
    let fast = true;
    const render = vi.fn();
    const delays: number[] = [];
    const lifecycle = new NativeFooterLifecycle({
      now: () => minute * 60_000,
      needsFastTick: () => fast,
      renderSignal: () => signal,
      setTimeout: (callback, delay) => {
        delays.push(delay);
        return globalThis.setTimeout(callback, delay as number) as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (timer) => globalThis.clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
    });
    lifecycle.start(render);
    expect(delays[0]).toBe(1_000);

    // Same signature across five fast ticks: no render.
    vi.advanceTimersByTime(5_000);
    expect(delays.filter((delay) => delay === 1_000).length).toBeGreaterThanOrEqual(5);
    expect(render).not.toHaveBeenCalled();

    // Speed change renders once.
    signal = "streaming\n68";
    vi.advanceTimersByTime(1_000);
    expect(render).toHaveBeenCalledTimes(1);

    // Retention ends: the next scheduled wake is minute-scale, not 1 Hz.
    fast = false;
    vi.advanceTimersByTime(1_000);
    const last = delays.at(-1)!;
    expect(last).toBeGreaterThanOrEqual(30_000);

    lifecycle.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("activityChanged retunes the cadence without rendering", () => {
    vi.useFakeTimers();
    let fast = false;
    const render = vi.fn();
    const delays: number[] = [];
    const lifecycle = new NativeFooterLifecycle({
      now: () => 0,
      needsFastTick: () => fast,
      setTimeout: (callback, delay) => {
        delays.push(delay);
        return globalThis.setTimeout(callback, delay as number) as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout: (timer) => globalThis.clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
    });
    lifecycle.start(render);
    expect(delays[0]).toBeGreaterThanOrEqual(30_000);

    // A stream event turns on the fast cadence but must not render.
    fast = true;
    lifecycle.activityChanged();
    expect(render).not.toHaveBeenCalled();
    expect(delays[1]).toBe(1_000);

    // Repeated stream-event kicks with an unchanged mode stay free.
    const delayCount = delays.length;
    lifecycle.activityChanged();
    lifecycle.activityChanged();
    expect(delays.length).toBe(delayCount);

    lifecycle.stop();
  });

  it("requests status redraw only when the status snapshot changes", () => {
    const render = vi.fn();
    const lifecycle = new NativeFooterLifecycle({
      setTimeout: vi.fn(() => ({ unref() {} }) as unknown as ReturnType<typeof setTimeout>),
      clearTimeout: vi.fn(),
    });
    lifecycle.start(render);
    lifecycle.statusChanged(new Map([["quota", "72%"]]));
    lifecycle.statusChanged(new Map([["quota", "72%"]]));
    lifecycle.statusChanged(new Map([["quota", "71%"]]));
    expect(render).toHaveBeenCalledTimes(2);
    lifecycle.stop();
  });
});
