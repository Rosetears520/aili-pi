import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const messageView = await readFile(new URL("./MessageView.tsx", import.meta.url), "utf8");
const card = await readFile(new URL("./InlineFileChange.tsx", import.meta.url), "utf8");
const events = await readFile(new URL("../lib/file-change-events.ts", import.meta.url), "utf8");
const en = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zh = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");

test("ToolCallBlock derives the event from the real tool result and swaps in the card", () => {
  assert.match(messageView, /import \{ deriveFileChangeEvent \} from "@\/lib\/file-change-events"/);
  assert.match(messageView, /import \{ InlineFileChange \} from "\.\/InlineFileChange"/);
  // Derivation only runs on arrived, non-error results — same evidence rule as
  // turn-written-files; reasoning prose is never an input.
  assert.match(messageView, /result && !result\.isError \? deriveFileChangeEvent\(block, result, cwd\) : null/);
  assert.match(messageView, /changeEvent && !expanded \? \(\s*<InlineFileChange/);
  assert.match(messageView, /onShowToolDetails=\{\(\) => setExpanded\(true\)\}/);
});

test("raw tool JSON stays behind the card's explicit details disclosure", () => {
  // The default input pre still exists but only renders under `expanded`,
  // which the card reaches exclusively through "View tool details".
  const expandedInput = messageView.indexOf("{expanded && !questionnaire && (isStreamingInput || !isEditTool)");
  assert.ok(expandedInput !== -1, "input args block must remain gated on explicit expansion");
  assert.match(card, /chat\.changeViewToolDetails/);
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

test("expanding renders the inline shared renderer with the full-diff handoff", () => {
  assert.match(card, /<ChangeDiffView/);
  assert.match(card, /variant="inline"/);
  assert.match(card, /window\.open\(`\/changes\?cwd=\$\{encodeURIComponent\(cwd\)\}`, "aili-changes"\)/);
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
  assert.match(card, /window\.open\(`\/changes\?cwd=\$\{encodeURIComponent\(cwd\)\}`, "aili-changes"\)/);
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
    "chat.changeShowFullDiff",
    "chat.changeDiffUnavailable",
    "chat.changeViewToolDetails",
  ]) {
    assert.ok(en.includes(`"${key}"`), `en must define ${key}`);
    assert.ok(zh.includes(`"${key}"`), `zh-CN must define ${key}`);
  }
  assert.match(en, /"chat\.changeTruncated": "[^"]*\{rows\}[^"]*"/);
  assert.match(zh, /"chat\.changeTruncated": "[^"]*\{rows\}[^"]*"/);
});
