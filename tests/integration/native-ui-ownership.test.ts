import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);

async function text(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

describe("Pi-native UI ownership", () => {
  it("registers no Matrix, custom header, theme, Zentui editor, or thinking owner", async () => {
    const manifest = JSON.parse(await text("package.json"));
    expect(manifest.pi.extensions).toEqual(["./extensions/index.ts"]);
    expect(manifest.pi.themes).toBeUndefined();
    const registered = manifest.pi.extensions.join("\n");
    expect(registered).not.toMatch(/matrix|header|zentui/i);
    expect(manifest.files).toEqual(expect.arrayContaining(["extensions/index.ts", "extensions/footer/"]));

    const [entry, footer] = await Promise.all([text("extensions/index.ts"), text("extensions/footer/index.ts")]);
    expect(entry).toContain("registerNativeFooter");
    expect(footer).toContain("setFooter");
    expect(footer).not.toMatch(/setWorkingVisible|setWorkingIndicator|setWorkingMessage|setHeader|setEditorComponent|prototype/i);
  });

  it("keeps fixed-editor and WSL image-paste behavior independently owned", async () => {
    const [manifest, bootstrap, keybindings, compositor] = await Promise.all([
      text("package.json"),
      text("scripts/bootstrap.sh"),
      text("scripts/merge-global-keybindings.mjs"),
      text("extensions/zentui/fixed-editor/compositor.ts"),
    ]);
    expect(manifest).not.toContain("./extensions/zentui/index.ts");
    expect(bootstrap).toContain("merge-global-keybindings.mjs");
    expect(keybindings).toContain("app.clipboard.pasteImage");
    expect(compositor).toContain("TerminalSplitCompositor");
  });
});
