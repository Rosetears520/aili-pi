import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChangeDiffView.tsx", import.meta.url), "utf8");
const messageView = await readFile(new URL("../MessageView.tsx", import.meta.url), "utf8");
const changesPage = await readFile(new URL("../../app/changes/page.tsx", import.meta.url), "utf8");
const fileViewer = await readFile(new URL("../FileViewer.tsx", import.meta.url), "utf8");

test("ChangeDiffView owns parsing through the single shared parser", () => {
  assert.match(source, /import \{ parseUnifiedPatch/);
  // No second inline patch parser: the component must not re-parse @@ hunks itself.
  assert.ok(!/@@ -\\d/.test(source), "ChangeDiffView must not carry its own hunk regex parser");
});

test("inline variant is unified-only inside a scroll window (no truncation)", () => {
  assert.match(source, /variant === "inline" \? "unified" : view/);
  // User direction 2026-08-20: ~12-row scroll window instead of a 50-row cap;
  // vertical + horizontal scrolling, no full-diff handoff.
  assert.ok(!source.includes("INLINE_MAX_ROWS"), "no inline row cap");
  assert.ok(!source.includes("onShowFull"), "no full-diff handoff prop");
  assert.match(source, /aili-diff-scroll/);
  assert.match(source, /variant === "inline"\s*\? <div className="aili-diff-scroll">\{body\}<\/div>\s*: body/);
  // Inline bodies carry no card header: the timeline card owns the header row.
  assert.match(source, /variant === "full" && \(\s*<header className="aili-diff-head">/);
});

test("full variant keeps unified/split views, per-file counts, and the render cap", () => {
  assert.match(source, /FULL_MAX_ROWS = 3_000/);
  assert.match(source, /t\("chat\.changeTruncated", \{ rows: FULL_MAX_ROWS \}\)/);
  assert.match(source, /view === "unified"/);
  assert.match(source, /className="aili-diff-body aili-split"/);
  assert.match(source, /countFileChanges/);
});

test("unparseable patch text stays visible as plain text", () => {
  assert.match(source, /files\.length === 0/);
  assert.match(source, /<pre/);
});

test("timeline, tool details, and the Changes page all render through ChangeDiffView", () => {
  assert.match(messageView, /import \{ ChangeDiffView \} from "\.\/aili\/ChangeDiffView"/);
  assert.match(messageView, /variant="full" view="split"/);
  assert.match(changesPage, /import \{ ChangeDiffView, type DiffView \} from "@\/components\/aili\/ChangeDiffView"/);
  assert.match(changesPage, /<ChangeDiffView file=\{selected\.relative\} patch=\{patch\} view=\{view\}/);
});

test("/changes mounts its own I18nProvider (the tab has no chat-page provider tree)", () => {
  // ChangeDiffView calls useI18n, which throws outside a provider; the changes
  // page opens as its own tab, so it must carry the provider itself.
  assert.match(changesPage, /import \{ I18nProvider \} from "@\/hooks\/useI18n"/);
  const providerIndex = changesPage.indexOf("<I18nProvider>");
  assert.ok(providerIndex !== -1, "changes page must wrap its tree in I18nProvider");
  assert.ok(changesPage.indexOf('<main className="aili-changes-page"', providerIndex) > providerIndex, "provider must wrap the page main");
});

test("duplicate diff renderers are gone from the web tree", () => {
  assert.ok(!messageView.includes("SplitPatchView"), "SplitPatchView must be deleted from MessageView");
  assert.ok(!messageView.includes("PatchTextView"), "PatchTextView must be deleted from MessageView");
  // FileViewer keeps the shared parser for its feature-bearing viewer surface
  // (syntax highlighting + line selection); it must not grow a second component.
  assert.match(fileViewer, /import \{ parseUnifiedPatch \} from "@\/lib\/patch"/);
  assert.ok(!fileViewer.includes("AiliFileDiff"));
  assert.ok(!changesPage.includes("AiliFileDiff"));
});

test("changes page offers worktree switching without creation", () => {
  assert.match(changesPage, /\/api\/worktrees\?cwd=/);
  assert.match(changesPage, /aria-label="Worktrees"/);
  assert.match(changesPage, /setCwd\(next\)/);
  assert.ok(!/createWorktree|new-worktree/i.test(changesPage), "no worktree creation UI");
});
