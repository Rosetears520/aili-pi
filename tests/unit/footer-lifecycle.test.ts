import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeFooterLifecycle } from "../../extensions/footer/lifecycle.js";

afterEach(() => vi.useRealTimers());

describe("Pi-native footer lifecycle", () => {
  it("refreshes the clock no more than once per minute and disposes its timer", () => {
    vi.useFakeTimers();
    let now = 0;
    const render = vi.fn();
    const lifecycle = new NativeFooterLifecycle({ now: () => now });
    lifecycle.start(render);

    now = 59_999;
    vi.advanceTimersByTime(60_000);
    expect(render).not.toHaveBeenCalled();
    now = 60_000;
    vi.advanceTimersByTime(60_000);
    expect(render).toHaveBeenCalledTimes(1);

    lifecycle.stop();
    now = 120_000;
    vi.advanceTimersByTime(120_000);
    expect(render).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requests status redraw only when the status snapshot changes", () => {
    const render = vi.fn();
    const lifecycle = new NativeFooterLifecycle({
      setInterval: vi.fn(() => ({ unref() {} }) as ReturnType<typeof setInterval>),
      clearInterval: vi.fn(),
    });
    lifecycle.start(render);
    lifecycle.statusChanged(new Map([["quota", "72%"]]));
    lifecycle.statusChanged(new Map([["quota", "72%"]]));
    lifecycle.statusChanged(new Map([["quota", "71%"]]));
    expect(render).toHaveBeenCalledTimes(2);
    lifecycle.stop();
  });

  it("ticks at 1 Hz but renders only when the telemetry signal changes", () => {
    vi.useFakeTimers();
    const signalOf = (status: string, speed: string) => `${status}\u0000${speed}`;
    let signal = signalOf("streaming", "68");
    let minute = 0;
    const render = vi.fn();
    const lifecycle = new NativeFooterLifecycle({ now: () => minute * 60_000, renderSignal: () => signal });
    lifecycle.start(render);

    // Same signature across five ticks: no render.
    vi.advanceTimersByTime(5_000);
    expect(render).not.toHaveBeenCalled();

    signal = signalOf("streaming", "69");
    vi.advanceTimersByTime(1_000);
    expect(render).toHaveBeenCalledTimes(1);

    // A new clock minute also renders even with a stable signal.
    minute = 1;
    vi.advanceTimersByTime(1_000);
    expect(render).toHaveBeenCalledTimes(2);

    // Idle signature: back to at most one render per minute.
    signal = "idle";
    vi.advanceTimersByTime(60_000);
    expect(render).toHaveBeenCalledTimes(3);

    lifecycle.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
