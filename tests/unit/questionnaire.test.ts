import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  answerFor,
  createAnswers,
  formatQuestionnaireResult,
  normalizeQuestions,
  unavailableResult,
} from "../../src/questionnaire/model.ts";

describe("questionnaire core (absorbed from PiCraft, MIT)", () => {
  it("normalizes valid input and defaults header and multiple", () => {
    const questions = normalizeQuestions([
      { id: "q1", question: "Keep backward compatibility?", options: [{ label: "Yes" }, { label: "No", description: "Breaks the v1 API" }] },
      { id: "q2", header: "Strategy", question: "Which strategy?", options: [], multiple: true },
    ]);
    expect(questions[0]).toMatchObject({ id: "q1", header: "Q1", multiple: false });
    expect(questions[0].options).toEqual([{ label: "Yes" }, { label: "No", description: "Breaks the v1 API" }]);
    expect(questions[1]).toMatchObject({ header: "Strategy", multiple: true, options: [] });
  });

  it("rejects the documented invalid inputs", () => {
    expect(() => normalizeQuestions([])).toThrow(/at least one/);
    // No upper question cap (AILI deviation): a six-question batch normalizes.
    expect(normalizeQuestions(
      Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, question: `q ${i}`, options: [] })),
    )).toHaveLength(6);
    expect(() => normalizeQuestions([{ id: "", question: "x", options: [] }])).toThrow(/non-empty id/);
    expect(() => normalizeQuestions([{ id: "q", question: "x", options: [{ label: "Type your own answer" }] }])).toThrow(/reserved/);
    expect(() => normalizeQuestions([{ id: "q", question: "x", options: [{ label: "a" }, { label: "a" }] }])).toThrow(/duplicated/);
    expect(() => normalizeQuestions([{ id: "q", question: "x", options: [{ label: "a" }], recommended: 1 }])).toThrow(/recommended/);
  });

  it("keeps predefined selections and custom input separate, in option order", () => {
    const [question] = normalizeQuestions([
      { id: "q", question: "pick", multiple: true, options: [{ label: "B" }, { label: "A" }, { label: "C" }] },
    ]);
    const answer = answerFor(question, new Set(["A", "B"]), "  also this  ");
    expect(answer).toEqual({ id: "q", selectedOptions: ["B", "A"], customInput: "also this" });
    expect(createAnswers([question])).toEqual([{ id: "q", selectedOptions: [] }]);
  });

  it("formats explicit unanswered, dismissed, and unavailable results", () => {
    const [question] = normalizeQuestions([{ id: "strategy", header: "Strategy", question: "Which?", options: [{ label: "A" }] }]);
    expect(formatQuestionnaireResult({ questions: [question], answers: createAnswers([question]), cancelled: false }))
      .toContain("strategy: Unanswered");
    expect(formatQuestionnaireResult({ questions: [question], answers: createAnswers([question]), cancelled: true }))
      .toContain("dismissed");
    expect(formatQuestionnaireResult(unavailableResult([question]))).toContain("not running in Pi TUI");
  });
});

describe("questionnaire runtime invariants", () => {
  it("stays active in every permission mode via NEVER_HIDE", async () => {
    const vendor = await readFile(fileURLToPath(new URL("../../src/vendor/pi-permission-modes/index.ts", import.meta.url)), "utf8");
    expect(vendor).toContain('new Set(["show_plan", "questionnaire"])');
  });

  it("never sets an auto-answer timeout on the web questionnaire channel", async () => {
    const rpc = await readFile(fileURLToPath(new URL("../../src/web/lib/rpc-manager.ts", import.meta.url)), "utf8");
    const questionnaireImpl = rpc.slice(rpc.indexOf("questionnaire: (questions"), rpc.indexOf("notify: (message"));
    expect(questionnaireImpl).toContain("undefined,\n          signal");
    expect(questionnaireImpl).not.toMatch(/timeout:\s*\d/);
  });

  it("is composed into the single Pi extension entry", async () => {
    const entry = await readFile(fileURLToPath(new URL("../../extensions/index.ts", import.meta.url)), "utf8");
    expect(entry).toContain("registerQuestionnaireTool(pi)");
  });

  it("web session UI context exposes the questionnaire method", async () => {
    const rpc = await readFile(fileURLToPath(new URL("../../src/web/lib/rpc-manager.ts", import.meta.url)), "utf8");
    expect(rpc).toContain('questionnaire: (questions: QuestionnaireQuestion[]');
  });
});
