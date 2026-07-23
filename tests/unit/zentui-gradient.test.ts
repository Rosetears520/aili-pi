import { describe, expect, it } from "vitest";
import {
  renderSakuraGradient,
  SAKURA_MACARON_STOPS,
} from "../../extensions/zentui/gradient.js";

describe("Zentui Sakura reasoning gradient", () => {
  it("uses the exact pinned Sakura Macaron stops", () => {
    expect(SAKURA_MACARON_STOPS).toEqual([
      [242, 167, 198],
      [252, 201, 185],
      [239, 195, 230],
      [199, 184, 245],
      [159, 211, 242],
    ]);
  });

  it("starts single-character reasoning markers at Sakura pink", () => {
    expect(renderSakuraGradient("✦")).toBe("\x1b[38;2;242;167;198m✦\x1b[0m");
  });
});
