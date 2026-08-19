import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("assistant code cards and tables align with the prose text width", () => {
  // GitHub-style geometry: the assistant prose body carries a small inline
  // gutter and code cards/tables are plain blocks inside it, so a card's
  // edges align with the text edges. There must be no breakout rules
  // (width/min/margin overrides) for these scopes.
  const scope = css.slice(css.indexOf(".markdown-body.markdown-assistant-body"));
  assert.match(scope.slice(0, 500), /--message-inline-gutter: 12px;/);
  assert.match(scope.slice(0, 500), /padding-inline: var\(--message-inline-gutter\);/);
  assert.ok(
    !css.includes(".markdown-body.markdown-assistant-body .markdown-code-block"),
    "assistant code blocks must not carry breakout width/margin rules",
  );
  assert.ok(
    !css.includes(".markdown-body.markdown-assistant-body .markdown-table-wrap"),
    "assistant tables must not carry breakout width/margin rules",
  );
});

test("no leftover breakout infrastructure from the wide-surface experiments", () => {
  assert.ok(!css.includes("--chat-wide-surface-max"), "the wide-surface cap token is gone");
  assert.ok(!css.includes("chat-scroll-container"), "the container-query context rule is gone");
  assert.ok(!chatSource.includes("chat-scroll-container"), "ChatWindow carries no leftover container class");
  // The scroller remains the horizontal-scroll guard for the chat column.
  assert.match(
    chatSource,
    /className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-4 \[scrollbar-width:none\]"/,
  );
});
