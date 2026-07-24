import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, saveFooterFormatPatch } from "../../extensions/zentui/config.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aili-rose-zentui-"));
  roots.push(root);
  return { canonical: join(root, "rose-cyberdeck-zentui.json"), legacy: join(root, "rem-cyberdeck-zentui.json") };
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("Zentui Rose config migration", () => {
  it("fallback-reads a valid legacy config and writes only the canonical path on explicit save", () => {
    const { canonical, legacy } = fixture();
    writeFileSync(legacy, JSON.stringify({ footerFormat: "legacy", colors: { editorBorder: "sakura-macaron-gradient" } }));
    const loaded = loadConfig(canonical, legacy);
    expect(loaded.footerFormat).toBe("legacy");
    expect(loaded.colors.editorBorder).toBe("rose-cyberdeck-gradient");

    saveFooterFormatPatch("saved", canonical);
    expect(JSON.parse(readFileSync(canonical, "utf8"))).toMatchObject({ footerFormat: "saved" });
    expect(JSON.parse(readFileSync(legacy, "utf8"))).toMatchObject({ footerFormat: "legacy" });
  });
});
