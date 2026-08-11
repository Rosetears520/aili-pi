import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async (_text: string) => {}),
}));
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  copyToClipboard,
}));

import {
  renderTranscriptScrollbar,
  TerminalSplitCompositor,
} from "../../extensions/zentui/fixed-editor/compositor.js";
import type { PiFixedEditorCapabilities } from "../../extensions/zentui/fixed-editor/pi-compat.js";

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function method(
  target: Record<PropertyKey, unknown>,
  key: "render" | "doRender" | "write",
) {
  return {
    target,
    key,
    method: Reflect.get(target, key) as (...args: unknown[]) => unknown,
    ownDescriptor: Object.getOwnPropertyDescriptor(target, key),
  };
}

function renderable(lines: string[]) {
  const target = { render: (_width: number) => lines };
  return {
    target,
    render: target.render,
    ownDescriptor: Object.getOwnPropertyDescriptor(target, "render"),
  };
}

function harness(rootLines: string[], scrollbar = true) {
  let listener: ((data: string) => { consume?: boolean; data?: string } | undefined) | undefined;
  const writes: string[] = [];
  const terminal = { rows: 6, columns: 10, write: (data: string) => writes.push(data) };
  const tui = {
    render: (_width: number) => rootLines,
    doRender: () => {},
  };
  const requestRender = vi.fn();
  const capabilities: PiFixedEditorCapabilities = {
    tui,
    terminal,
    cluster: {
      status: null,
      aboveWidget: null,
      editor: renderable(["editor"]),
      belowWidget: null,
      footer: null,
    },
    renderMethod: method(tui, "render"),
    doRenderMethod: method(tui, "doRender"),
    writeMethod: method(terminal, "write"),
    rowsOwnDescriptor: Object.getOwnPropertyDescriptor(terminal, "rows"),
    readRawRows: () => 6,
    getColumns: () => 10,
    hasVisibleOverlay: () => false,
    getCursorBookkeeping: () => ({ hardwareCursorRow: 1, previousViewportTop: 0 }),
    addInputListener: (next) => {
      listener = next;
      return () => { listener = undefined; };
    },
    removeInputListener: () => { listener = undefined; },
    requestRender,
  };
  const onCopy = vi.fn();
  const compositor = new TerminalSplitCompositor(
    capabilities,
    () => ({ enabled: true, mouseScroll: true, copyNotice: true, scrollbar }),
    onCopy,
  );
  expect(compositor.install()).toBe(true);
  return {
    compositor,
    tui,
    requestRender,
    onCopy,
    input(data: string) { return listener?.(data); },
    render() { return tui.render(10); },
  };
}

afterEach(() => {
  copyToClipboard.mockClear();
  vi.useRealTimers();
});

describe("fixed-editor scrollbar", () => {
  it("maps top, middle and bottom viewport positions without changing line width", () => {
    const lines = Array.from({ length: 5 }, (_, index) => `row-${index}`);
    for (const start of [0, 5, 10]) {
      const rendered = renderTranscriptScrollbar(lines, 10, start, 15, 5);
      expect(rendered).toHaveLength(5);
      expect(rendered.every((line) => visibleWidth(line) === 10)).toBe(true);
      const thumbRows = rendered.flatMap((line, index) => stripAnsi(line).endsWith("┃") ? [index] : []);
      expect(thumbRows).toHaveLength(2);
      if (start === 0) expect(thumbRows[0]).toBe(0);
      if (start === 5) expect(thumbRows[0]).toBe(2);
      if (start === 10) expect(thumbRows.at(-1)).toBe(4);
    }
  });

  it("renders only on overflow and keeps the original root render width", () => {
    const overflow = harness(Array.from({ length: 8 }, (_, index) => `line-${index}`));
    const rendered = overflow.render();
    expect(rendered).toHaveLength(5);
    expect(rendered.every((line) => visibleWidth(line) === 10)).toBe(true);
    expect(rendered.some((line) => /[│┃]$/.test(stripAnsi(line)))).toBe(true);
    overflow.compositor.dispose();

    const fitting = harness(Array.from({ length: 5 }, (_, index) => `line-${index}`));
    expect(fitting.render().some((line) => /[│┃]$/.test(stripAnsi(line)))).toBe(false);
    fitting.compositor.dispose();
  });
});

describe("fixed-editor cross-viewport selection", () => {
  it("auto-scrolls at the edge and copies one complete cross-viewport range", async () => {
    vi.useFakeTimers();
    const lines = Array.from({ length: 12 }, (_, index) => `line-${String(index).padStart(2, "0")}`);
    const view = harness(lines);
    view.render();

    view.input("\x1b[<0;8;5M");
    view.input("\x1b[<32;1;1M");
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(140);
    view.input("\x1b[<0;1;1m");
    await vi.runAllTicks();

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard.mock.calls[0]?.[0]).toContain("ine-05");
    expect(copyToClipboard.mock.calls[0]?.[0]).toContain("line-11");
    expect(view.onCopy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    view.compositor.dispose();
  });

  it("clamps an active drag into the pinned cluster and releases without sticking", async () => {
    vi.useFakeTimers();
    const view = harness(Array.from({ length: 12 }, (_, index) => `line-${String(index).padStart(2, "0")}`));
    view.render();
    view.input("\x1b[<0;1;1M");
    view.input("\x1b[<32;5;6M");
    view.input("\x1b[<0;5;6m");
    await vi.runAllTicks();
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard.mock.calls[0]?.[0]).toContain("line-07");
    expect(copyToClipboard.mock.calls[0]?.[0]).toContain("line");
    expect(vi.getTimerCount()).toBe(0);
    view.compositor.dispose();
  });

  it("does not start selection in the scrollbar or pinned cluster and clears timers on dispose", () => {
    vi.useFakeTimers();
    const view = harness(Array.from({ length: 12 }, (_, index) => `line-${index}`));
    view.render();
    view.input("\x1b[<0;10;2M");
    view.input("\x1b[<32;4;1M");
    expect(vi.getTimerCount()).toBe(0);
    view.input("\x1b[<0;3;6M");
    view.input("\x1b[<32;4;1M");
    expect(vi.getTimerCount()).toBe(0);

    view.input("\x1b[<0;2;2M");
    view.input("\x1b[<32;2;1M");
    expect(vi.getTimerCount()).toBe(1);
    view.compositor.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
