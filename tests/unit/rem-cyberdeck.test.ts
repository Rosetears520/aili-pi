import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderRemHeader, summarizeGitPorcelain } from "../../src/runtime/rem-cyberdeck.js";

describe("Rem Cyberdeck public surfaces", () => {
  it("keeps every header line inside the requested terminal width", () => {
    for (const width of [1, 12, 40, 120]) {
      expect(renderRemHeader(width).every((line) => visibleWidth(line) <= width)).toBe(true);
    }
  });

  it("reports Git branch and dirty state from bounded porcelain output", () => {
    expect(summarizeGitPorcelain("## rem-theme...origin/rem-theme\n M src/runtime/rem-cyberdeck.ts\n")).toEqual({ branch: "rem-theme", dirty: true });
    expect(summarizeGitPorcelain("## main\n")).toEqual({ branch: "main", dirty: false });
  });
});
