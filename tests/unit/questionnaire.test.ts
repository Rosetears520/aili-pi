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
import { QuestionnaireController, type QuestionnaireFinish } from "../../src/questionnaire/controller.ts";

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

describe("questionnaire controller (shared TUI/Web state machine)", () => {
  function harness(questions: Parameters<typeof normalizeQuestions>[0]) {
    const finishes: QuestionnaireFinish[] = [];
    const controller = new QuestionnaireController(normalizeQuestions(questions), (finish) => finishes.push(finish));
    return { controller, finishes };
  }

  const batch = [
    { id: "a", header: "First", question: "Pick one", options: [{ label: "A1" }, { label: "A2" }] },
    { id: "b", header: "Second", question: "Pick many", options: [{ label: "B1" }, { label: "B2" }], multiple: true },
  ];

  it("single-select answers advance; multi-select toggles stay on the question", () => {
    const { controller } = harness(batch);
    controller.chooseRow(0);
    expect(controller.getSnapshot().index).toBe(1);
    expect(controller.getSnapshot().selected.get("a")).toEqual(new Set(["A1"]));

    controller.chooseRow(0);
    controller.chooseRow(1);
    const snap = controller.getSnapshot();
    expect(snap.index).toBe(1);
    expect(snap.selected.get("b")).toEqual(new Set(["B1", "B2"]));
  });

  it("tab navigation wraps across questions and review; editing an answer jumps back", () => {
    const { controller } = harness(batch);
    controller.chooseRow(0); // → question 2
    controller.next(); // → review
    expect(controller.getSnapshot().phase).toBe("review");
    controller.next(); // wraps to question 1
    expect(controller.getSnapshot().index).toBe(0);
    controller.previous(); // wraps back onto review
    expect(controller.getSnapshot().phase).toBe("review");
    controller.jumpTo(0);
    expect(controller.getSnapshot().index).toBe(0);
  });

  it("submit returns option-ordered answers including unanswered ones", () => {
    const { controller, finishes } = harness(batch);
    controller.chooseRow(0); // a: A1, advance
    controller.chooseRow(1); // b: toggle B2
    controller.enterReview();
    controller.submit();
    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toEqual({
      cancelled: false,
      answers: [
        { id: "a", selectedOptions: ["A1"] },
        { id: "b", selectedOptions: ["B2"] },
      ],
    });
  });

  it("cancel returns a cancelled finish and later input is ignored", () => {
    const { controller, finishes } = harness(batch);
    controller.chooseRow(0);
    controller.cancel();
    controller.chooseRow(0);
    controller.submit();
    expect(finishes).toHaveLength(1);
    expect(finishes[0]!.cancelled).toBe(true);
  });

  it("a single single-select question is simple: answering finishes immediately", () => {
    const { controller, finishes } = harness([{ id: "only", question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] }]);
    expect(controller.getSnapshot().simpleSingle).toBe(true);
    controller.chooseRow(1);
    expect(finishes).toEqual([{ cancelled: false, answers: [{ id: "only", selectedOptions: ["No"] }] }]);
  });

  it("the custom row opens an editor; committing trims, saves, and advances single-select", () => {
    const { controller, finishes } = harness([{ id: "only", question: "Name it", options: [] }]);
    controller.chooseRow(0); // custom row is row 0 when there are no options
    expect(controller.getSnapshot().editing).toBe(true);
    controller.setCustomDraft("  my answer  ");
    controller.commitCustom();
    expect(finishes).toEqual([{ cancelled: false, answers: [{ id: "only", selectedOptions: [], customInput: "my answer" }] }]);
  });

  it("selecting an option clears a custom answer and vice versa", () => {
    const { controller } = harness(batch);
    controller.jumpTo(0);
    controller.chooseRow(2); // custom row on question a
    controller.setCustomDraft("custom");
    controller.commitCustom(); // saves and advances
    expect(controller.getSnapshot().customInputs.get("a")).toBe("custom");
    controller.jumpTo(0);
    controller.chooseRow(0); // pick A1
    expect(controller.getSnapshot().selected.get("a")).toEqual(new Set(["A1"]));
    expect(controller.getSnapshot().customInputs.has("a")).toBe(false);
  });

  it("leaving the editor discards the uncommitted draft", () => {
    const { controller } = harness(batch);
    controller.chooseRow(2);
    controller.setCustomDraft("draft");
    controller.leaveEditing();
    const snap = controller.getSnapshot();
    expect(snap.editing).toBe(false);
    expect(snap.customDraft).toBe("");
    expect(snap.customInputs.has("a")).toBe(false);
  });

  it("moveOption wraps across options and the custom row", () => {
    const { controller } = harness([{ id: "only", question: "Pick", options: [{ label: "X" }, { label: "Y" }] }]);
    controller.moveOption(-1); // 0 → custom row
    expect(controller.getSnapshot().optionIndex).toBe(2);
    controller.moveOption(1); // custom row → wraps to 0
    expect(controller.getSnapshot().optionIndex).toBe(0);
  });

  it("toggleRow selects without advancing (Space parity for mouse-less changes)", () => {
    const { controller } = harness(batch);
    controller.toggleRow(1);
    const snap = controller.getSnapshot();
    expect(snap.index).toBe(0);
    expect(snap.selected.get("a")).toEqual(new Set(["A2"]));
  });
});
