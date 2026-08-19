// AILI Unified User Interaction: the model-facing `questionnaire` tool.
//
// Schema, normalization, result formatting, and the TUI prompt are absorbed
// byte-exact from PiCraft (MIT, Losomz/AgentFramework
// packages/picraft/extensions/questionnaire@55642c8 — see
// upstream/picraft-questionnaire-55642c8/PROVENANCE.md). This file is the
// AILI-owned glue around them:
//
//   - the tool is a non-mutating, non-permission interaction tool and stays
//     active in all four permission modes (default/plan/build/yolo; the
//     pi-permission-modes NEVER_HIDE set enforces it as a runtime invariant);
//   - presentation routes per host: Pi TUI gets the absorbed tabbed prompt,
//     AILI Web gets one full questionnaire card through a dedicated
//     extension-UI `questionnaire` method, generic RPC hosts get a
//     sequential ui.select fallback, and headless hosts (json/print) get an
//     explicit unavailable result — never an invented answer;
//   - no timeout is ever set: the user is never auto-answered.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import {
	createAnswers,
	formatQuestionnaireResult,
	normalizeQuestions,
	unavailableResult,
	type QuestionnaireAnswer,
	type QuestionnaireQuestion,
	type QuestionnaireQuestionInput,
	type QuestionnaireResult,
} from "./model.ts";
import { requestQuestionnaire } from "./ui.ts";

const OptionSchema = Type.Object(
	{
		label: Type.String({ minLength: 1, maxLength: 80, description: "Concise display label" }),
		description: Type.Optional(
			Type.String({ maxLength: 240, description: "Short explanation of the choice and its tradeoffs" }),
		),
	},
	{ additionalProperties: false },
);

const QuestionSchema = Type.Object(
	{
		id: Type.String({ minLength: 1, maxLength: 64, description: "Stable unique question id" }),
		header: Type.Optional(Type.String({ maxLength: 30, description: "Short tab label" })),
		question: Type.String({ minLength: 1, maxLength: 500, description: "Complete question shown to the user" }),
		options: Type.Array(OptionSchema, { maxItems: 5, description: "Up to five predefined choices; the UI adds a free-form custom entry that does not count toward this limit. Use an empty array for free text only" }),
		multiple: Type.Optional(Type.Boolean({ description: "Allow selecting more than one option" })),
		recommended: Type.Optional(
			Type.Integer({ minimum: 0, maximum: 4, description: "Zero-based index of the recommended option" }),
		),
	},
	{ additionalProperties: false },
);

const QuestionnaireParameters = Type.Object(
	{
		questions: Type.Array(QuestionSchema, {
			minItems: 1,
			description: "Related clarification questions to ask together; four or fewer is recommended",
		}),
	},
	{ additionalProperties: false },
);

/** The AILI Web host exposes this extra UI method on its extension UI context. */
type QuestionnaireCapableUi = {
	questionnaire?: (questions: QuestionnaireQuestion[], signal?: AbortSignal) => Promise<QuestionnaireResult>;
};

const CUSTOM_LABEL = "Type your own answer";

async function askOverGenericRpc(
	ctx: ExtensionContext,
	questions: QuestionnaireQuestion[],
	signal?: AbortSignal,
): Promise<QuestionnaireResult> {
	const answers: QuestionnaireAnswer[] = [];
	for (const question of questions) {
		if (signal?.aborted) break;
		const labels = question.options.map((option) => option.label);
		if (question.multiple) {
			const selected = new Set<string>();
			for (;;) {
				const choice = await ctx.ui.select(
					`${question.question}\n(select every option that applies; pick Done when finished)`,
					[...labels.filter((label) => !selected.has(label)), "Done"],
					{ signal },
				);
				if (choice === undefined || choice === "Done") break;
				selected.add(choice);
				if (selected.size >= labels.length) break;
			}
			answers.push({ id: question.id, selectedOptions: labels.filter((label) => selected.has(label)) });
			continue;
		}
		const choice = labels.length > 0
			? await ctx.ui.select(question.question, [...labels, CUSTOM_LABEL], { signal })
			: undefined;
		if (choice !== undefined && choice !== CUSTOM_LABEL) {
			answers.push({ id: question.id, selectedOptions: [choice] });
			continue;
		}
		const custom = await ctx.ui.input(question.question, "Your answer", { signal });
		answers.push(custom ? { id: question.id, selectedOptions: [], customInput: custom } : { id: question.id, selectedOptions: [] });
	}
	return { questions, answers, cancelled: signal?.aborted === true };
}

async function askUser(
	ctx: ExtensionContext,
	questions: QuestionnaireQuestion[],
	signal?: AbortSignal,
): Promise<QuestionnaireResult> {
	if (ctx.mode === "tui") {
		return requestQuestionnaire(ctx, questions, signal);
	}
	const questionnaire = (ctx.ui as QuestionnaireCapableUi).questionnaire;
	if (typeof questionnaire === "function") {
		return questionnaire.call(ctx.ui, questions, signal);
	}
	if (ctx.hasUI) {
		return askOverGenericRpc(ctx, questions, signal);
	}
	return unavailableResult(questions);
}

export function registerQuestionnaireTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "questionnaire",
		label: "Clarify Intent",
		description:
			"Ask the user structured clarification questions when missing intent or a consequential preference blocks correct progress. Investigate code, configuration, documentation, and existing conventions first. Default to a conservative standard choice when the decision is reversible or several choices are equally acceptable. Batch related questions (four or fewer is recommended), provide concise options with tradeoffs, and never add an Other option because custom input is supplied by the UI and does not count toward the option limit.",
		promptSnippet: "Ask one or more structured questions when a material user decision is required",
		promptGuidelines: [
			"Use questionnaire only when unresolved user intent would materially change scope, behavior, compatibility, or an irreversible decision; investigate discoverable facts first.",
			"When choices are known, provide 2-5 concise options with tradeoffs and put the recommended option first. Use an empty options array only for a genuinely open-ended question; free-form input is always available.",
			"Do not use questionnaire for reversible details with a safe conventional default; choose the conservative default and continue.",
			"When a persistent worker reports a decision that needs the user, ask here with questionnaire and relay the answer back to the worker; workers cannot ask the user directly.",
		],
		parameters: QuestionnaireParameters,
		executionMode: "sequential",

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const questions = normalizeQuestions(params.questions as QuestionnaireQuestionInput[]);
			const details = await askUser(ctx, questions, signal);
			if (details.cancelled) ctx.abort();
			return {
				content: [{ type: "text" as const, text: formatQuestionnaireResult(details) }],
				details,
				...(details.cancelled ? { terminate: true } : {}),
			};
		},

		renderCall(args, theme) {
			const count = args.questions.length;
			const headers = args.questions.map((question) => question.header || question.id).join(", ");
			const suffix = headers ? ` (${headers})` : "";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("clarify "))}${theme.fg("muted", `${count} question${count === 1 ? "" : "s"}${suffix}`)}`,
				0,
				0,
			);
		},

		renderResult(result, _options, theme) {
			const details = result.details as QuestionnaireResult | undefined;
			if (!details) {
				const content = result.content[0];
				return new Text(content?.type === "text" ? content.text : "", 0, 0);
			}
			if (details.unavailable) return new Text(theme.fg("warning", "No interactive user available"), 0, 0);
			if (details.cancelled) return new Text(theme.fg("warning", "Questionnaire dismissed"), 0, 0);

			const answers = new Map(details.answers.map((answer) => [answer.id, answer]));
			const lines = details.questions.map((question) => {
				const answer = answers.get(question.id);
				const values = [...(answer?.selectedOptions ?? []), ...(answer?.customInput ? [answer.customInput] : [])];
				const value = values.length > 0 ? values.join(", ") : "Unanswered";
				return `${theme.fg(values.length > 0 ? "success" : "warning", values.length > 0 ? "[x] " : "[ ] ")}${theme.fg("accent", question.header)}: ${theme.fg("text", value)}`;
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}

// Re-exported for the AILI Web UI context implementation (rpc-manager).
export { createAnswers, type QuestionnaireQuestion, type QuestionnaireResult };
