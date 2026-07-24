import { describe, expect, it } from "vitest";
import { renderRoseGradient, renderRoseToolCompleteGradient, ROSE_GRADIENT, ROSE_GRADIENT_STOPS, ROSE_TOOL_COMPLETE_STOPS } from "../../extensions/zentui/gradient.js";

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

  it("renders completed tool frames with a cool Blue-to-Ice gradient", () => {
    expect(ROSE_TOOL_COMPLETE_STOPS).toEqual([[136, 184, 255], [125, 228, 255], [214, 244, 255]]);
    expect(renderRoseToolCompleteGradient("✓")).toBe("\x1b[38;2;136;184;255m✓\x1b[0m");
  });
});
