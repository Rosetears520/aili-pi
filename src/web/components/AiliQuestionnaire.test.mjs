import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AiliQuestionnaire.tsx", import.meta.url), "utf8");

test("drives the shared questionnaire controller instead of local form state", () => {
  assert.match(source, /from "\.\.\/\.\.\/questionnaire\/controller\.ts"/);
  assert.match(source, /new QuestionnaireController\(/);
  assert.match(source, /useSyncExternalStore/);
  // Class methods must be passed bound: React invokes the accessors as
  // plain functions, so bare `controller.subscribe` references lose `this`
  // and crash the page the moment the questionnaire mounts.
  assert.match(source, /useSyncExternalStore\(\s*\(listener\) => controller\.subscribe\(listener\),\s*\(\) => controller\.getSnapshot\(\),\s*\)/);
  // The response callback goes through a ref so parent re-renders never
  // recreate the controller and reset answers.
  assert.match(source, /respondRef\.current\(request/);
});

test("shows one question at a time with a trailing review tab", () => {
  assert.match(source, /controller\.activeQuestion\(\)/);
  assert.match(source, /controller\.enterReview\(\)/);
  assert.match(source, /controller\.jumpTo\(i\)/);
  assert.match(source, /state\.simpleSingle/);
  assert.match(source, /chat\.questionnaireReviewTitle/);
});

test("keeps TUI keyboard parity on the shelf", () => {
  for (const key of ["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft", "Tab", "Escape", "Enter"]) {
    assert.ok(source.includes(`case "${key}"`) || source.includes(`"${key}"`), `missing ${key} handling`);
  }
  assert.match(source, /controller\.moveOption\(-1\)/);
  assert.match(source, /controller\.moveOption\(1\)/);
  assert.match(source, /controller\.toggleRow\(\)/);
  assert.match(source, /controller\.chooseRow\(\)/);
});
