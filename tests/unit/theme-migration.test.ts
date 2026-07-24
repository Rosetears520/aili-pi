import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { legacyRoseThemeGuidance } from "../../src/runtime/rose-theme.js";

describe("Rose theme migration", () => {
  it("ships a Rose-owned canonical theme palette", async () => {
    const theme = JSON.parse(await readFile(new URL("../../themes/rose-cyberdeck.json", import.meta.url), "utf8"));
    expect(theme.name).toBe("rose-cyberdeck");
    expect(theme.vars).toMatchObject({ void: "#10121D", blue: "#88B8FF", cyan: "#7DE4FF", violet: "#BCA7FF", ice: "#D6F4FF", rose: "#C75B7A", roseSoft: "#E8A7B8", roseDeep: "#A8455F", successGreen: "#5A8A72" });
    expect(theme.vars.rem).toBeUndefined();
  });

  it("replaces only exact legacy tokens", () => {
    expect(legacyRoseThemeGuidance("rem-cyberdeck")).toContain('"theme": "rose-cyberdeck"');
    expect(legacyRoseThemeGuidance("light/rem-cyberdeck")).toContain('"theme": "light/rose-cyberdeck"');
    expect(legacyRoseThemeGuidance("rem-cyberdeck/light")).toContain('"theme": "rose-cyberdeck/light"');
    expect(legacyRoseThemeGuidance("my-rem-cyberdeck-copy")).toBeUndefined();
    expect(legacyRoseThemeGuidance("rose-cyberdeck")).toBeUndefined();
  });
});
