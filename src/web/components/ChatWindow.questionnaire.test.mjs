import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("questionnaire renders inline above the composer, not as a modal overlay", () => {
  // The shelf is part of the conversation flow: no dialog role, no backdrop,
  // no absolute overlay around AiliQuestionnaire specifically (the generic
  // ExtensionDialog modals for confirm/select/input/editor are unaffected).
  // Runtime blocking stays in the extension layer.
  const shelfIndex = source.indexOf('className="questionnaire-shelf"');
  assert.ok(shelfIndex !== -1, "ChatWindow should dock the questionnaire in a questionnaire-shelf");

  const shelf = source.slice(shelfIndex, source.indexOf("{chatInputElement}", shelfIndex));
  assert.match(shelf, /<AiliQuestionnaire/);
  assert.match(shelf, /respondToExtensionUi\(request, response\)/);
  assert.ok(!shelf.includes("setTimeout"));
  assert.ok(!shelf.includes("zIndex"));
  assert.ok(!shelf.includes("aria-modal"));
  assert.ok(!shelf.includes("position: \"absolute\""));

  for (const questionnaireIndex of source.matchAll(/<AiliQuestionnaire/g)) {
    const wrapper = source.slice(Math.max(0, questionnaireIndex.index - 400), questionnaireIndex.index);
    assert.ok(
      !wrapper.includes('role="dialog"') && !wrapper.includes("aria-modal"),
      "AiliQuestionnaire must not be wrapped in a modal dialog",
    );
  }
});

test("the shelf sits inside the composer container and shares its column geometry", () => {
  const shelfIndex = source.indexOf('className="questionnaire-shelf"');
  const composerIndex = source.indexOf("{chatInputElement}", shelfIndex);
  assert.ok(shelfIndex !== -1 && composerIndex > shelfIndex, "shelf must render before the composer input");

  const shelf = source.slice(shelfIndex, composerIndex);
  assert.match(shelf, /paddingRight: isMobile \? undefined : 52/);
  assert.match(shelf, /maxWidth: 820/);
});
