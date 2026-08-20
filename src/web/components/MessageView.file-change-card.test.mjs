import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const messageView = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");
const card = await readFile(new URL("./InlineFileChange.tsx", import.meta.url), "utf8");
const events = await readFile(new URL("../lib/file-change-events.ts", import.meta.url), "utf8");
const en = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zh = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");

test("ToolCallBlock derives the event and renders the card permanently", () => {
  assert.match(messageView, /import \{ deriveFileChangeEvent \} from "@\/lib\/file-change-events"/);
  assert.match(messageView, /import \{ InlineFileChange \} from "\.\/InlineFileChange"/);
  // Derivation only runs on arrived, non-error results — same evidence rule as
  // turn-written-files; reasoning prose is never an input.
  assert.match(messageView, /result && !result\.isError \? deriveFileChangeEvent\(block, result, cwd\) : null/);
  // The card is never replaced by raw details (user direction 2026-08-20);
  // the ⋯ toggle expands details BELOW it.
  assert.match(messageView, /changeEvent \? \(\s*<InlineFileChange/);
  assert.ok(!messageView.includes("changeEvent && !expanded"), "card must not be swapped out");
  assert.match(messageView, /onShowToolDetails=\{\(\) => setExpanded\(\(value\) => !value\)\}/);
});

test("raw tool JSON stays behind the row-end ⋯ disclosure", () => {
  assert.match(card, /chat\.changeViewToolDetails/);
  assert.match(card, /toolDetailsOpen/);
  assert.match(card, /clickEvent\.stopPropagation\(\);\s*\n\s*onShowToolDetails\(\)/);
  // The old underlined body button and the card↔raw swap are gone.
  assert.ok(!/textDecoration: "underline"[\s\S]*changeViewToolDetails/.test(card));
  // With a card present, details show RAW input/result — never a second diff.
  assert.match(messageView, /Boolean\(changeEvent\)/);
  assert.match(messageView, /changeEvent \? \(\s*\/\/ The card above already renders the diff/);
});

test("collapsed card row carries the full contract anatomy", () => {
  // operation glyph + label, file icon, filename (primary), parent path
  // (secondary), +N −M, chevron.
  assert.match(card, /OPERATION_GLYPH/);
  assert.match(card, /chat\.change(Edited|Created|Deleted|Renamed)/);
  assert.match(card, /getFileIcon\(event\.fileName/);
  assert.match(card, /fontWeight: 600/);
  assert.match(card, /trimParent\(event\.parentPath, cwd\)/);
  assert.match(card, /\+{event\.additions}/);
  assert.match(card, /-{event\.deletions}/);
  assert.match(card, /transform: expanded \? "rotate\(180deg\)"/);
});

test("expanding renders the inline shared renderer (scroll window, no handoff)", () => {
  assert.match(card, /<ChangeDiffView patch=\{patch\} variant="inline" \/>/);
  assert.ok(!card.includes("window.open"), "no full-diff handoff from the card");
});

test("timeline cards are git-free: tool data only, no git fetches", () => {
  // User direction 2026-08-19: the timeline shows what THIS tool changed;
  // git state is the Changes page's concern. The card must not call git APIs.
  assert.ok(!card.includes("/api/git/diff"), "InlineFileChange must not fetch git state");
  assert.ok(!card.includes("useEffect"), "no lazy fetch effects in the card");
  // Writes expand on the synthesized /dev/null diff of the content the tool
  // wrote; "diff unavailable" remains only for contentless mutations.
  assert.match(card, /const patch = event\.diff/);
  assert.match(card, /chat\.changeDiffUnavailable/);
  // The full-diff handoff goes to the git-backed Changes page, which is where
  // git relevance begins.
});

test("filename click opens the file without toggling the diff", () => {
  assert.match(card, /clickEvent\.stopPropagation\(\)/);
  assert.match(card, /onOpenFile\?\.\(event\.path\)/);
});

test("derivation never synthesizes events from bash output or reasoning", () => {
  assert.match(events, /bash output|assistant reasoning/);
  assert.match(events, /result\.isError\) return null/);
  assert.match(events, /if \(!result \|\| result\.isError\) return null/);
});

test("change-card strings exist in both i18n catalogs", () => {
  for (const key of [
    "chat.changeEdited",
    "chat.changeCreated",
    "chat.changeDeleted",
    "chat.changeRenamed",
    "chat.changeDiffUnavailable",
    "chat.changeViewToolDetails",
  ]) {
    assert.ok(en.includes(`"${key}"`), `en must define ${key}`);
    assert.ok(zh.includes(`"${key}"`), `zh-CN must define ${key}`);
  }
  assert.match(en, /"chat\.changeTruncated": "[^"]*\{rows\}[^"]*"/);
  assert.match(zh, /"chat\.changeTruncated": "[^"]*\{rows\}[^"]*"/);
});
