import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");

test("the changes file list is drag-resizable via the shared panel machinery", () => {
  assert.match(page, /useResizablePanel\(\{/);
  assert.match(page, /cssVariable: "--aili-changes-list-width"/);
  assert.match(page, /storageKey: "aili-changes-list-width"/);
  assert.match(page, /growthDirection: "right"/);
  assert.match(page, /const CHANGES_LIST_MIN_WIDTH = 200/);
  assert.match(page, /const CHANGES_LIST_MAX_WIDTH = 560/);

  // The splitter handle sits between the list and the diff and carries the
  // separator semantics from the hook.
  const listIdx = page.indexOf('className={`aili-changes-list');
  const handleIdx = page.indexOf("aili-changes-resize-handle", listIdx);
  const diffIdx = page.indexOf('className="aili-changes-diff"', handleIdx);
  assert.ok(listIdx !== -1 && handleIdx > listIdx && diffIdx > handleIdx, "handle must sit between list and diff");
  assert.match(page, /\{\.\.\.listResizer\.separatorProps\}/);
  assert.match(page, /ref=\{listResizer\.panelRef\}/);
});

test("the list width is driven by the CSS variable with the old default", () => {
  assert.match(css, /\.aili-changes-list\s*\{[^}]*width: var\(--aili-changes-list-width, 340px\);/);
  // Mobile keeps the fixed proportional width and hides the splitter.
  const mobile = css.slice(css.indexOf("@media (max-width: 720px)"));
  assert.match(mobile.slice(0, 200), /\.aili-changes-list \{ width: 42vw; \}/);
  assert.match(mobile.slice(0, 200), /\.aili-changes-resize-handle \{ display: none; \}/);
});
