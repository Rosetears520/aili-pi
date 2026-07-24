import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { renderRoseHeader } from "../../extensions/header/index.js";

describe("Rose Cyberdeck header", () => {
  it("renders Rose telemetry within the requested width", () => {
    const lines = renderRoseHeader(80);
    const plain = lines.join("\n").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    expect(plain).toContain("ROSE CYBERDECK");
    expect(lines.every((line) => visibleWidth(line) <= 80)).toBe(true);
  });
});
