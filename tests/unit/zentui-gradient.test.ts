import { describe, expect, it } from "vitest";
import { renderRoseGradient, ROSE_GRADIENT, ROSE_GRADIENT_STOPS } from "../../extensions/zentui/gradient.js";

describe("Zentui Rose gradient", () => {
  it("uses the exact canonical Rose-to-ice stops", () => {
    expect(ROSE_GRADIENT).toBe("rose-cyberdeck-gradient");
    expect(ROSE_GRADIENT_STOPS).toEqual([
      [199, 91, 122], [232, 167, 184], [188, 167, 255],
      [136, 184, 255], [125, 228, 255], [214, 244, 255],
    ]);
  });

  it("starts single-character reasoning markers at brand Rose", () => {
    expect(renderRoseGradient("✦")).toBe("\x1b[38;2;199;91;122m✦\x1b[0m");
  });
});
