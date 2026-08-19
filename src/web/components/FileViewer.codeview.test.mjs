import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Task 3.1 contract (add-webui-coding-workspace): the read-only CodeView gains
// copy-contents, go-to-line (with the #L deep-link form), and keeps the
// always-visible current file path — without gaining any write path.

const source = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
const en = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zh = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");

test("copy button copies the file contents and confirms", () => {
  const copyMatch = source.match(/const copyContent = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[/);
  assert.ok(copyMatch, "copyContent handler must exist");
  assert.match(copyMatch[0], /navigator\.clipboard\.writeText\(data\?\.content \?\? ""\)/);
  assert.match(copyMatch[0], /setCopied\(true\)/);
  assert.match(source, /onClick=\{copyContent\}/);
  assert.match(source, /t\("viewer\.copyContent"\)/);
  assert.match(source, /t\("viewer\.copied"\)/);
});

test("go-to-line accepts bare numbers and the #L deep-link form", () => {
  const gotoMatch = source.match(/const goToLine = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[/);
  assert.ok(gotoMatch, "goToLine handler must exist");
  assert.ok(gotoMatch[0].includes("#?L?(\\d+)"), "must accept bare numbers and the #L form");
  assert.match(gotoMatch[0], /data-line-number/);
  // The jump must scroll ONLY the viewer container: scrollIntoView walks and
  // scrolls every ancestor (chat history fold, page), which folds the chat
  // and snaps views to their start.
  assert.ok(!gotoMatch[0].includes("scrollIntoView"), "must not use scrollIntoView");
  assert.match(gotoMatch[0], /container\.scrollTop \+=/);
  assert.match(gotoMatch[0], /getBoundingClientRect/);
  assert.match(source, /if \(event\.key === "Enter"\) goToLine\(\)/);
});

test("the current file path stays visible in the source toolbar", () => {
  assert.match(source, /className="file-viewer-path"[^>]*title=\{filePath\}/);
  assert.match(source, /getRelativeFilePath\(filePath, cwd\)/);
});

test("the viewer stays read-only: no write or save path is introduced", () => {
  assert.ok(!source.includes("type=save"), "no save control");
  assert.ok(!/\/api\/files\/[^\n`]*type=write/.test(source), "no file write API calls");
});

test("viewer strings exist in both i18n catalogs", () => {
  for (const key of ["viewer.copyContent", "viewer.copied", "viewer.goToLine"]) {
    assert.ok(en.includes(`"${key}"`), `en must define ${key}`);
    assert.ok(zh.includes(`"${key}"`), `zh-CN must define ${key}`);
  }
});
