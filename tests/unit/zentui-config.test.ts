import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig, loadConfig, saveFixedEditorPatch, saveFooterFormatPatch } from "../../extensions/zentui/config.js";
import { roseRuntimeStyle } from "../../extensions/zentui/format.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "aili-rose-zentui-"));
  roots.push(root);
  return { canonical: join(root, "rose-cyberdeck-zentui.json"), legacy: join(root, "rem-cyberdeck-zentui.json") };
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("Zentui Rose config migration", () => {
  it("uses the six-color palette for package-owned default status chrome", () => {
    expect(defaultConfig.colorSources.starship).toBe("theme");
    expect(defaultConfig.colors).toMatchObject({
      contextNormal: "#7DE4FF", contextWarning: "bold #BCA7FF", contextError: "bold #C75B7A",
      cost: "bold #7DE4FF", gitMetricsAdded: "#7DE4FF", gitMetricsDeleted: "#C75B7A",
      sessionDuration: "#BCA7FF", os: "#D6F4FF",
    });
    expect(Object.values(defaultConfig.colors).join(" ")).not.toMatch(/#(?:8CE6C2|F3CE83|FF93B1|F7EEF8|B8BEDD)/i);
  });

  it("maps inherited runtime badges into Rose semantic colors", () => {
    expect(roseRuntimeStyle("bold green")).toBe("cyan");
    expect(roseRuntimeStyle("yellow bold")).toBe("violet");
    expect(roseRuntimeStyle("bold red")).toBe("rose");
    expect(roseRuntimeStyle("bold white")).toBe("ice");
  });

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

  it("keeps the renderer-replacing fixed editor opt-in and preserves unrelated fixed-editor keys", () => {
    expect(defaultConfig.fixedEditor.enabled).toBe(false);
    const { canonical, legacy } = fixture();
    writeFileSync(canonical, JSON.stringify({ fixedEditor: { enabled: true, custom: "keep" } }));
    expect(loadConfig(canonical, legacy).fixedEditor).toMatchObject({
      enabled: true,
      mouseScroll: true,
      copyNotice: true,
      scrollbar: true,
    });
    saveFixedEditorPatch({ scrollbar: false }, canonical);
    expect(JSON.parse(readFileSync(canonical, "utf8")).fixedEditor).toEqual({
      enabled: true,
      custom: "keep",
      scrollbar: false,
    });
  });
});
