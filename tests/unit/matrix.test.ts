import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  createDrops,
  renderRoseMatrix,
  renderRoseShimmer,
  resolveAppearance,
  roseRainColor,
  ROSE_MATRIX_GLYPHS,
  ROSE_RAIN_PALETTE,
  ROSE_SHIMMER_INDICATOR,
} from "../../extensions/matrix/index.js";

function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function nonSpaceAnsiCells(line: string): boolean {
  return stripAnsi(line).trim().length > 0;
}

describe("Rose Matrix released waterfall geometry", () => {
  it.each([320, 384, 480, 640])("caps sparse even-cell tracks at 96 across ultra-wide %i-cell widgets", (width) => {
    const drops = createDrops(width, 0.65, 4);
    expect(drops.length).toBeLessThanOrEqual(96);
    expect(drops.every((drop) => drop.x % 2 === 0)).toBe(true);
    expect(Math.min(...drops.map((drop) => drop.x))).toBeLessThan(width * 0.1);
    expect(Math.max(...drops.map((drop) => drop.x))).toBeGreaterThanOrEqual(width * 0.9);
    expect(drops.every((drop) => drop.speed >= 8 && drop.speed < 16)).toBe(true);
  });

  it("uses only single-cell glyphs and the agreed six-color weighted palette", () => {
    expect(ROSE_MATRIX_GLYPHS).toHaveLength(78);
    expect(ROSE_MATRIX_GLYPHS.every((glyph) => visibleWidth(glyph) === 1)).toBe(true);
    expect(ROSE_RAIN_PALETTE).toHaveLength(6);
    const counts = Array.from({ length: 100 }, (_, index) => roseRainColor(index).join(","))
      .reduce<Record<string, number>>((result, color) => ({ ...result, [color]: (result[color] ?? 0) + 1 }), {});
    expect(counts).toEqual({
      "136,184,255": 50, "214,244,255": 20, "125,228,255": 15,
      "188,167,255": 8, "199,91,122": 4, "232,167,184": 3,
    });
    expect(new Set(Array.from({ length: 96 }, (_, index) => roseRainColor(index).join(","))).size).toBe(6);
  });

  it.each([1, 40, 80, 120, 240, 320, 640])("renders four visible rows at exactly %i cells in both appearances", (width) => {
    for (const appearance of ["dark", "light"] as const) {
      const lines = renderRoseMatrix(width, 4, 1.25, "thinking", createDrops(width, 0.65, 4), appearance);
      expect(lines).toHaveLength(4);
      expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
      expect(lines.every(nonSpaceAnsiCells)).toBe(true);
    }
  });

  it("repairs an all-empty frame with a vertical, non-blank trail", () => {
    const lines = renderRoseMatrix(40, 4, 0, "requesting", [], "dark");
    expect(lines.every(nonSpaceAnsiCells)).toBe(true);
  });
});

describe("Rose Shimmer", () => {
  it("uses the exact ping-pong indicator sequence", () => {
    expect(ROSE_SHIMMER_INDICATOR).toEqual(["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"]);
  });

  it("is width-safe, uses a four-character highlight, hides elapsed time before 30 seconds, and displays only real output usage", () => {
    const early = renderRoseShimmer(120, "working", 29_999, undefined, "dark");
    const measured = renderRoseShimmer(120, "working", 61_000, 42, "dark");
    expect(visibleWidth(early)).toBe(120);
    expect(early.match(/38;2;214;244;255m/g)).toHaveLength(4);
    expect(early).not.toContain("output tokens");
    expect(measured).toContain("1m 01s");
    expect(measured).toContain("42 output tokens");
  });

  it("recognizes only known themes in auto appearance", () => {
    expect(resolveAppearance("auto", "rose-cyberdeck")).toBe("dark");
    expect(resolveAppearance("auto", "light")).toBe("light");
    expect(resolveAppearance("auto", "custom")).toBeUndefined();
    expect(resolveAppearance("light", "custom")).toBe("light");
  });
});
