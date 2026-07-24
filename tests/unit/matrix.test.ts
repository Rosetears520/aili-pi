import { createHash } from "node:crypto";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  createDrops,
  renderRoseMatrix,
  renderRoseShimmer,
  resolveAppearance,
  ROSE_MATRIX_GLYPHS,
  ROSE_RAIN_PALETTE,
  ROSE_SHIMMER_INDICATOR,
} from "../../extensions/matrix/index.js";

function dropGeometry(width: number): unknown[] {
  return createDrops(width, 0.65, 4).map(({ color: _color, ...geometry }) => geometry);
}

function nonSpaceAnsiCells(line: string): boolean {
  return line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim().length > 0;
}

describe("Rose Matrix deterministic geometry", () => {
  it("keeps the ordinary-width geometry sequence independently from palette", () => {
    const digest = createHash("sha256")
      .update(JSON.stringify(dropGeometry(240)))
      .digest("hex");

    expect(digest).toBe("0f72954fa7128286bf1aae3eba5155c574f8a33bc9982238bb918e2a9fdf55fa");
  });

  it.each([320, 384, 480, 640])("spreads bounded tracks across ultra-wide %i-cell widgets", (width) => {
    const columns = createDrops(width, 0.65, 4).map((drop) => drop.x);
    expect(columns.length).toBeLessThanOrEqual(96);
    expect(Math.min(...columns)).toBeLessThan(width * 0.1);
    expect(Math.max(...columns)).toBeGreaterThanOrEqual(width * 0.9);
  });

  it("uses only single-cell glyphs and the accepted Rose weighting", () => {
    expect(ROSE_MATRIX_GLYPHS).toHaveLength(78);
    expect(ROSE_MATRIX_GLYPHS.every((glyph) => visibleWidth(glyph) === 1)).toBe(true);
    expect(ROSE_RAIN_PALETTE).toHaveLength(12);
    expect(ROSE_RAIN_PALETTE.filter(([r, g, b]) => (r === 136 && g === 184 && b === 255) || (r === 125 && g === 228 && b === 255) || (r === 214 && g === 244 && b === 255))).toHaveLength(10);
    expect(ROSE_RAIN_PALETTE.some(([, g]) => g === 138)).toBe(false);
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
    expect(lines).toHaveLength(4);
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
