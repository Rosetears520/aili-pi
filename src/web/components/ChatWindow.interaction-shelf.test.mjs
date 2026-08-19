import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const sessionSource = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
const en = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zh = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");

function shelfHostBody() {
  const start = chatWindowSource.indexOf("function InteractionShelfHost");
  assert.ok(start !== -1, "ChatWindow should define InteractionShelfHost");
  const end = chatWindowSource.indexOf("\nfunction ", start + 1);
  return chatWindowSource.slice(start, end);
}

test("interaction shelf docks above the composer inside the composer container", () => {
  const hostCall = chatWindowSource.indexOf("<InteractionShelfHost");
  const composer = chatWindowSource.indexOf("{chatInputElement}", hostCall);
  assert.ok(hostCall !== -1 && composer > hostCall, "InteractionShelfHost must render before the composer input");

  const body = shelfHostBody();
  assert.match(body, /className="interaction-shelf"/);
  assert.match(body, /paddingRight: isMobile \? undefined : 52/);
  assert.match(body, /maxWidth: 820/);
});

test("questionnaire remains the first shelf citizen with no modal chrome", () => {
  const body = shelfHostBody();
  assert.match(body, /<AiliQuestionnaire/);
  assert.match(body, /onRespond=\{\(request, response\) => void onRespond\(request, response\)\}/);
  assert.ok(!body.includes("setTimeout"));
  assert.ok(!body.includes("zIndex"));
  assert.ok(!body.includes('aria-modal'));
  assert.ok(!body.includes('role="dialog"'));

  for (const match of chatWindowSource.matchAll(/<AiliQuestionnaire/g)) {
    const wrapper = chatWindowSource.slice(Math.max(0, match.index - 400), match.index);
    assert.ok(
      !wrapper.includes('role="dialog"') && !wrapper.includes("aria-modal"),
      "AiliQuestionnaire must not be wrapped in a modal dialog",
    );
  }
});

test("select, confirm, and input render inline shelf cards, not modals", () => {
  const cardStart = chatWindowSource.indexOf("function ShelfInteractionCard");
  assert.ok(cardStart !== -1, "ChatWindow should define ShelfInteractionCard");
  const cardEnd = chatWindowSource.indexOf("\nfunction ", cardStart + 1);
  const card = chatWindowSource.slice(cardStart, cardEnd);

  // confirm/select reuse the AIcss ApprovalCard exactly like the modal path;
  // input keeps the compact themed card. No overlay chrome in the shelf card.
  assert.match(card, /variant="command"/);
  assert.match(card, /variant="questions"/);
  assert.match(card, /request\.placeholder/);
  assert.ok(!card.includes("position: \"absolute\""));
  assert.ok(!card.includes("aria-modal"));
});

test("additional pending requests surface as a compact queue indicator", () => {
  const body = shelfHostBody();
  assert.match(body, /const \[primary, \.\.\.waiting\] = queue/);
  assert.match(body, /waiting\.length > 0/);
  assert.match(body, /role="status"/);
  assert.match(body, /t\("chat\.shelfQueue"\)\.replace\("\{count\}", String\(waiting\.length\)\)/);
});

test("shelf render failure falls back without stranding the runtime promise", () => {
  const boundaryStart = chatWindowSource.indexOf("class InteractionShelfBoundary");
  assert.ok(boundaryStart !== -1, "ChatWindow should define InteractionShelfBoundary");
  const boundary = chatWindowSource.slice(boundaryStart, chatWindowSource.indexOf("type ExtensionDialogRequest", boundaryStart));
  assert.match(boundary, /static getDerivedStateFromError/);

  const body = shelfHostBody();
  // Non-questionnaire requests fall back to the modal ExtensionDialog; a
  // questionnaire falls back to an explicit cancel card so the promise settles.
  assert.match(body, /<ExtensionDialog request=\{primary\}/);
  assert.match(body, /<ShelfFallbackCard request=\{primary\}/);
  const fallbackCard = chatWindowSource.slice(
    chatWindowSource.indexOf("function ShelfFallbackCard"),
    chatWindowSource.indexOf("class InteractionShelfBoundary"),
  );
  assert.match(fallbackCard, /cancelled: true/);
});

test("useAgentSession routes blocking requests through the InteractionHost mapping", () => {
  assert.match(sessionSource, /import \{ resolveInteractionPresentation \} from "@\/lib\/interaction-host"/);

  const handler = sessionSource.slice(
    sessionSource.indexOf("const handleExtensionUiRequest"),
    sessionSource.indexOf("const settleUiStage"),
  );
  assert.match(handler, /case "select":/);
  assert.match(handler, /case "confirm":/);
  assert.match(handler, /case "input":/);
  assert.match(handler, /case "questionnaire":/);
  assert.match(handler, /resolveInteractionPresentation\(request\.method, request\)/);
  // Shelf-assigned requests append to the queue (deduped by id); anything the
  // mapping keeps off the shelf (or an unknown method) goes to the modal dialog.
  assert.match(handler, /setExtensionShelfQueue\(\(prev\) => prev\.some\(\(item\) => item\.id === request\.id\) \? prev : \[\.\.\.prev, request\]\)/);
  assert.match(handler, /presentation === "composer-shelf"/);
  assert.match(handler, /case "editor":[\s\S]*?setExtensionDialog\(request\)/);

  // Responding removes the request from the queue so the next pending
  // interaction becomes primary, and never strands the runtime promise.
  const respond = sessionSource.slice(
    sessionSource.indexOf("const respondToExtensionUi"),
    sessionSource.indexOf("const sendExtensionCustomInput"),
  );
  assert.match(respond, /setExtensionShelfQueue\(\(current\) => current\.filter\(\(item\) => item\.id !== request\.id\)\)/);
});

test("shelf strings exist in both i18n catalogs with the {count} placeholder", () => {
  assert.match(en, /"chat\.shelfQueue": "[^"]*\{count\}[^"]*"/);
  assert.match(zh, /"chat\.shelfQueue": "[^"]*\{count\}[^"]*"/);
  assert.match(en, /"chat\.shelfRenderError": "/);
  assert.match(zh, /"chat\.shelfRenderError": "/);
});
