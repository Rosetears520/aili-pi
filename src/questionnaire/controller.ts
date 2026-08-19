// AILI-owned shared questionnaire interaction state machine.
//
// The tabbed answer/review flow was absorbed into the TUI prompt byte-exact
// from PiCraft (upstream/picraft-questionnaire-55642c8/PROVENANCE.md). This
// controller is the AILI extraction of that flow so every surface drives the
// same phases instead of re-deriving its own: one active question at a time
// plus a trailing Review tab. The semantics mirror the TUI prompt one-to-one:
//
//   - single-select answers advance (and finish a one-question form);
//   - multi-select toggles stay on the question;
//   - the custom-answer row sits after the last option and opens an editor;
//   - committing a custom answer clears a single-select pick and vice versa;
//   - a single single-select question is "simple": no tabs or review, and
//     answering finishes immediately;
//   - no auto-answer: only submit()/cancel() (or a simple-single answer)
//     finish the form, and a finished controller ignores further input.
//
// The controller is UI- and DOM-free; TUI keybindings, web clicks, and web
// keyboard events all map onto the same mutations below.

import { answerFor, type QuestionnaireAnswer, type QuestionnaireQuestion } from "./model.ts";

export type QuestionnairePhase = "answer" | "review";

export interface QuestionnaireSnapshot {
	phase: QuestionnairePhase;
	/** Active question index (answer phase only). */
	index: number;
	/** Focused row on the active question: 0..options.length, where options.length is the custom row. */
	optionIndex: number;
	/** Custom-answer editor open on the active question. */
	editing: boolean;
	/** Live text in the open custom editor (uncommitted). */
	customDraft: string;
	selected: ReadonlyMap<string, ReadonlySet<string>>;
	customInputs: ReadonlyMap<string, string>;
	/** One single-select question: no tabs or review, answering finishes the form. */
	simpleSingle: boolean;
}

export interface QuestionnaireFinish {
	cancelled: boolean;
	answers: QuestionnaireAnswer[];
}

type Listener = () => void;

export class QuestionnaireController {
	private readonly questions: QuestionnaireQuestion[];
	private readonly onFinish: (finish: QuestionnaireFinish) => void;
	private readonly listeners = new Set<Listener>();
	private selected = new Map<string, Set<string>>();
	private customInputs = new Map<string, string>();
	private phase: QuestionnairePhase = "answer";
	private index = 0;
	private optionIndex = 0;
	private editing = false;
	private customDraft = "";
	private finished = false;
	private snapshot: QuestionnaireSnapshot;

	constructor(
		questions: readonly QuestionnaireQuestion[],
		onFinish: (finish: QuestionnaireFinish) => void,
	) {
		this.questions = [...questions];
		this.onFinish = onFinish;
		for (const question of this.questions) this.selected.set(question.id, new Set());
		this.snapshot = this.buildSnapshot();
	}

	get simpleSingle(): boolean {
		return this.questions.length === 1 && this.questions[0]?.multiple !== true;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getSnapshot(): QuestionnaireSnapshot {
		return this.snapshot;
	}

	activeQuestion(): QuestionnaireQuestion | undefined {
		return this.phase === "answer" ? this.questions[this.index] : undefined;
	}

	/** Next question tab, wrapping past the last question onto Review. */
	next(): void {
		this.moveTab(1);
	}

	/** Previous tab, wrapping back from the first question onto Review. */
	previous(): void {
		this.moveTab(-1);
	}

	jumpTo(questionIndex: number): void {
		if (questionIndex < 0 || questionIndex >= this.questions.length) return;
		this.jumpToPosition(questionIndex);
	}

	enterReview(): void {
		this.jumpToPosition(this.questions.length);
	}

	/** Moves the focused row; wraps across options and the custom row. */
	moveOption(delta: 1 | -1): void {
		if (this.finished) return;
		const question = this.activeQuestion();
		if (!question || this.editing) return;
		const total = question.options.length + 1;
		this.optionIndex = total > 0 ? (this.optionIndex + delta + total) % total : 0;
		this.commit();
	}

	/** Points the focused row at a specific option (mouse parity for arrows). */
	focusOption(optionIndex: number): void {
		if (this.finished) return;
		const question = this.activeQuestion();
		if (!question || this.editing) return;
		if (optionIndex < 0 || optionIndex > question.options.length) return;
		this.optionIndex = optionIndex;
		this.commit();
	}

	/** Confirm on the focused row (Enter): the TUI selectCurrent semantics. */
	chooseRow(optionIndex: number = this.optionIndex): void {
		if (this.finished) return;
		const question = this.activeQuestion();
		if (!question || this.editing) return;
		if (optionIndex === question.options.length) {
			this.beginEditing();
			return;
		}
		const option = question.options[optionIndex];
		if (!option) return;
		this.optionIndex = optionIndex;
		if (question.multiple) {
			this.toggleLabel(question, option.label);
			return;
		}
		this.selectSingle(question, option.label);
	}

	/** Toggle on the focused row (Space): selects without advancing. */
	toggleRow(optionIndex: number = this.optionIndex): void {
		if (this.finished) return;
		const question = this.activeQuestion();
		if (!question || this.editing) return;
		if (optionIndex === question.options.length) {
			this.beginEditing();
			return;
		}
		const option = question.options[optionIndex];
		if (!option) return;
		this.optionIndex = optionIndex;
		if (question.multiple) {
			this.toggleLabel(question, option.label);
			return;
		}
		this.selected.set(question.id, new Set([option.label]));
		this.customInputs.delete(question.id);
		this.commit();
	}

	/** Mouse click on an option row. */
	chooseOption(label: string): void {
		if (this.finished) return;
		const question = this.activeQuestion();
		if (!question || this.editing) return;
		const optionIndex = question.options.findIndex((option) => option.label === label);
		if (optionIndex < 0) return;
		this.optionIndex = optionIndex;
		if (question.multiple) {
			this.toggleLabel(question, label);
			return;
		}
		this.selectSingle(question, label);
	}

	beginEditing(): void {
		if (this.finished) return;
		const question = this.activeQuestion();
		if (!question || this.editing) return;
		this.optionIndex = question.options.length;
		this.editing = true;
		this.customDraft = this.customInputs.get(question.id) ?? "";
		this.commit();
	}

	setCustomDraft(text: string): void {
		if (this.finished || !this.editing) return;
		this.customDraft = text;
		this.commit();
	}

	/** Commits the custom editor (Enter): saves or clears, then advances for single-select. */
	commitCustom(): void {
		if (this.finished) return;
		const question = this.activeQuestion();
		if (!question || !this.editing) return;
		const custom = this.customDraft.trim();
		this.editing = false;
		this.customDraft = "";
		if (custom) {
			this.customInputs.set(question.id, custom);
			if (!question.multiple) this.selected.set(question.id, new Set());
		} else {
			this.customInputs.delete(question.id);
		}
		if (custom && !question.multiple) this.advance();
		else this.commit();
	}

	/** Leaves the custom editor without saving (Esc or tab navigation). */
	leaveEditing(): void {
		if (this.finished || !this.editing) return;
		this.editing = false;
		this.customDraft = "";
		this.commit();
	}

	submit(): void {
		this.finish(false);
	}

	cancel(): void {
		this.finish(true);
	}

	private selectSingle(question: QuestionnaireQuestion, label: string): void {
		this.selected.set(question.id, new Set([label]));
		this.customInputs.delete(question.id);
		this.advance();
	}

	private toggleLabel(question: QuestionnaireQuestion, label: string): void {
		const set = this.selected.get(question.id) ?? new Set<string>();
		if (set.has(label)) set.delete(label);
		else set.add(label);
		this.selected.set(question.id, set);
		this.commit();
	}

	private advance(): void {
		if (this.simpleSingle) {
			this.finish(false);
			return;
		}
		this.jumpToPosition(Math.min(this.index + 1, this.questions.length));
	}

	private moveTab(delta: -1 | 1): void {
		if (this.finished || this.simpleSingle) return;
		const total = this.questions.length + 1;
		const position = this.phase === "review" ? this.questions.length : this.index;
		this.jumpToPosition((position + delta + total) % total);
	}

	private jumpToPosition(position: number): void {
		if (this.finished || this.simpleSingle) return;
		this.leaveEditing();
		if (position >= this.questions.length) this.phase = "review";
		else {
			this.phase = "answer";
			this.index = position;
		}
		this.optionIndex = 0;
		this.commit();
	}

	private finish(cancelled: boolean): void {
		if (this.finished) return;
		this.finished = true;
		this.editing = false;
		this.customDraft = "";
		const answers = this.questions.map((question) =>
			answerFor(question, this.selected.get(question.id) ?? new Set(), this.customInputs.get(question.id)),
		);
		this.commit();
		this.onFinish({ cancelled, answers });
	}

	private commit(): void {
		this.snapshot = this.buildSnapshot();
		for (const listener of this.listeners) listener();
	}

	private buildSnapshot(): QuestionnaireSnapshot {
		return {
			phase: this.phase,
			index: this.index,
			optionIndex: this.optionIndex,
			editing: this.editing,
			customDraft: this.customDraft,
			selected: new Map([...this.selected].map(([id, set]) => [id, new Set(set)])),
			customInputs: new Map(this.customInputs),
			simpleSingle: this.simpleSingle,
		};
	}
}
