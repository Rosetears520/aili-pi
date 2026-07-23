import { createHash } from "node:crypto";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  createDrops,
  renderSakuraMatrix,
  SAKURA_MATRIX_GLYPHS,
} from "../../extensions/matrix/index.js";

function dropColumns(width: number): number[] {
  return createDrops(width, 0.65, 4).map((drop) => drop.x);
}

describe("Sakura Matrix width behavior", () => {
  it("preserves the complete pinned ordinary-width drop sequence", () => {
    const digest = createHash("sha256")
      .update(JSON.stringify(createDrops(240, 0.65, 4)))
      .digest("hex");

    expect(digest).toBe("5a7cbb4a2a1b2b2e1f841096e52e0ac97a6ed40cdeda30636f57aff5cb56b1a6");
  });

  it.each([320, 384, 480, 640])("spreads the bounded tracks across an ultra-wide %i-cell widget", (width) => {
    const columns = dropColumns(width);

    expect(columns.length).toBeLessThanOrEqual(96);
    expect(columns).toEqual(dropColumns(width));
    expect(Math.min(...columns)).toBeLessThan(width * 0.1);
    expect(Math.max(...columns)).toBeGreaterThanOrEqual(width * 0.9);
  });

  it("uses only single-cell waterfall glyphs", () => {
    expect(SAKURA_MATRIX_GLYPHS).toHaveLength(78);
    expect(SAKURA_MATRIX_GLYPHS.every((glyph) => visibleWidth(glyph) === 1)).toBe(true);
  });

  it.each([1, 40, 80, 320])("renders every line at exactly %i visible cells", (width) => {
    const lines = renderSakuraMatrix(width, 4, 1.25, "thinking", createDrops(width, 0.65, 4));

    expect(lines).toHaveLength(4);
    expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
  });
});
