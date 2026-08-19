import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viewer = await readFile(new URL("./FileViewer.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("file preview keeps its prose gutter in CSS, cards align with the text", () => {
  // The preview body must not carry inline padding: inline styles would
  // override the gutter token. Geometry lives in globals.css instead.
  const previewStart = viewer.indexOf('className="markdown-body markdown-file-preview"');
  assert.ok(previewStart !== -1, "file preview body should keep the markdown-file-preview scope class");
  const previewOpen = viewer.slice(previewStart, viewer.indexOf(">", previewStart));
  assert.ok(!previewOpen.includes("style="), "file preview body must not carry inline styles");

  // Same alignment rule as chat: prose gutter only, code cards/tables are
  // plain blocks inside the prose box (no breakout selectors).
  const scope = css.slice(css.indexOf(".markdown-body.markdown-file-preview"));
  assert.match(scope.slice(0, 400), /--message-inline-gutter: 32px;/);
  assert.match(scope.slice(0, 400), /padding: 24px var\(--message-inline-gutter\);/);
  assert.ok(
    !css.includes(".markdown-body.markdown-file-preview .markdown-code-block"),
    "file preview code blocks must not carry breakout width/margin rules",
  );
});
