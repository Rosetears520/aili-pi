import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FILE_CONTEXT_LIMITS, freezeFileContextAttachments, makeFileContextAttachment, makeFileContextAttachments, parseGitDiffHunks, searchFileContext, searchFileContextContent } from "../../src/runtime/file-context.js";

describe("pi-file-context adaptation inventory", () => {
  it("locks the exact MIT upstream and exact pi-tui-kit disposition", async () => {
    const source = JSON.parse(await readFile(new URL("../../upstream/pi-file-context-0.53.0/SOURCE_INVENTORY.json", import.meta.url), "utf8"));
    expect(source).toMatchObject({
      revision: "7624b3c50d09d2e9dafa8dbc810c7f2adb453d70",
      package: { name: "@narumitw/pi-file-context", version: "0.53.0", license: "MIT" },
      companion: { name: "@narumitw/pi-tui-kit", version: "0.53.0" },
    });
    expect(JSON.stringify(source)).not.toContain("^0.51.0");
  });

  it("keeps file search, multi-range immutable snapshots and hunk parsing bounded", () => {
    expect(searchFileContext([{ path: "src/a.ts" }, { path: "README.md" }], "SRC")).toEqual([{ path: "src/a.ts" }]);
    const content = Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join("\n");
    const attachment = makeFileContextAttachment("src/a.ts", content);
    expect(attachment.endLine).toBe(FILE_CONTEXT_LIMITS.snapshotLines);
    expect(attachment.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(attachment)).toBe(true);
    expect(Object.isFrozen(attachment.provenance)).toBe(true);
    expect(freezeFileContextAttachments([attachment])).toEqual([attachment]);
    expect(makeFileContextAttachments("src/a.ts", content, [{ startLine: 2, endLine: 3 }, { startLine: 5, endLine: 5 }]).map((item) => [item.startLine, item.endLine])).toEqual([[2, 3], [5, 5]]);
    expect(parseGitDiffHunks("@@ -1,2 +1,3 @@\n one\n-two\n+two changed\n+three")[0]).toMatchObject({ oldStart: 1, newStart: 1, changedLines: [2, 3] });
  });

  it("searches bounded content with literal and fuzzy results", async () => {
    const result = await searchFileContextContent(["src/a.ts", "README.md"], async (path) => ({
      path,
      content: path === "src/a.ts" ? "Alpha beta\nneedle twice needle" : "alphabet soup",
    }), "needle");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ path: "src/a.ts", lineNumber: 2, fuzzy: false, ranges: [{ start: 0, end: 6 }, { start: 13, end: 19 }] });
    const fuzzy = await searchFileContextContent(["README.md"], async (path) => ({ path, content: "alphabet soup" }), "aps", { fuzzy: true });
    expect(fuzzy.matches[0]).toMatchObject({ fuzzy: true });
  });
});
