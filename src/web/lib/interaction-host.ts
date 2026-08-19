// AILI-owned presentation mapping for blocking extension-UI interactions.
//
// Contract: openspec/changes/add-webui-coding-workspace (webui-interaction-shelf,
// design decision 1). Every blocking agent-initiated interaction is assigned
// exactly one presentation mode before any render site sees it, so adding or
// migrating an interaction is a mapping change instead of a new bespoke modal
// or card wired at a call site.
//
//   - composer-shelf (default): the Interaction Shelf docked above the
//     composer. First batch: questionnaire, permission-approval selects,
//     confirm, select, input, and task/hub clarification requests.
//   - modal (explicit exceptions, kept with reasons): editor (large-text
//     editing surface) and custom (raw terminal-style keystream panel).
//
// This module is UI- and DOM-free and never touches the runtime promise
// plumbing (requestExtensionUi/respondToExtensionUi stay the only owners of
// request/response, timeout, and abort behavior).

/** Presentation surfaces an interaction can be assigned to. */
export type InteractionPresentation = "composer-shelf" | "inline" | "popover" | "modal";

/** One interaction's assigned presentation plus the recorded reason. */
export interface InteractionPresentationAssignment {
	presentation: InteractionPresentation;
	reason: string;
}

/** Methods that dock in the composer Interaction Shelf. */
export type ShelfInteractionMethod = "questionnaire" | "select" | "confirm" | "input";

/** Blocking methods kept out of the shelf for now; migration is a one-entry change. */
export type ExplicitModalMethod = "editor" | "custom";

/** Every method that can block the runtime waiting for a user response. */
export type BlockingInteractionMethod = ShelfInteractionMethod | ExplicitModalMethod;

export const BLOCKING_INTERACTION_METHODS: readonly BlockingInteractionMethod[] = [
	"select",
	"confirm",
	"input",
	"editor",
	"custom",
	"questionnaire",
];

export const SHELF_INTERACTION_METHODS: readonly ShelfInteractionMethod[] = [
	"questionnaire",
	"select",
	"confirm",
	"input",
];

/**
 * The shape of an incoming request, restricted to what presentation mapping
 * needs. Permission-approval detection only inspects the select option set.
 */
export interface InteractionRequestShape {
	title?: string;
	options?: readonly string[];
	/** Requests carry more fields than mapping needs; the index signature keeps every method variant assignable. */
	[key: string]: unknown;
}

/** Presentation assignment for every blocking method; keys must stay in lockstep with {@link BLOCKING_INTERACTION_METHODS}. */
export const ASSIGNMENTS: Record<BlockingInteractionMethod, InteractionPresentationAssignment> = {
	questionnaire: {
		presentation: "composer-shelf",
		reason: "questionnaire is a first-batch shelf interaction (docks above the composer, transcript stays usable)",
	},
	select: {
		presentation: "composer-shelf",
		reason: "selects dock in the shelf; permission-mode approval asks (Allow/Deny) arrive as selects and move out of the modal here",
	},
	confirm: {
		presentation: "composer-shelf",
		reason: "confirmations and task/hub clarifications are first-batch shelf interactions",
	},
	input: {
		presentation: "composer-shelf",
		reason: "single-line input fits the shelf card row",
	},
	editor: {
		presentation: "modal",
		reason: "explicit modal exception: large-text editing needs vertical space beyond the shelf",
	},
	custom: {
		presentation: "modal",
		reason: "explicit modal exception: raw terminal-style keystream panel captures keys full-surface",
	},
};

/** Safe default for methods this mapping does not know (never crashes a request). */
export const UNKNOWN_METHOD_FALLBACK: InteractionPresentationAssignment = {
	presentation: "modal",
	reason: "unknown or non-blocking method fallback: preserve the pre-shelf modal behavior rather than crash",
};

/**
 * Permission-mode approval asks raised by pi-permission-modes. `askWithSession`
 * sends ["Allow once", "Allow for session", ("Allow forever",) "Deny"] and the
 * blocked-host ask sends ["Allow for session", "Allow forever", "Deny"], so a
 * select carrying "Deny" plus any "Allow ..." option is an approval ask.
 */
export function isPermissionApprovalRequest(request: InteractionRequestShape): boolean {
	const options = request.options ?? [];
	return options.includes("Deny") && options.some((option) => option.startsWith("Allow "));
}

export function isBlockingInteractionMethod(method: string): method is BlockingInteractionMethod {
	return (BLOCKING_INTERACTION_METHODS as readonly string[]).includes(method);
}

/**
 * Resolve the presentation for one blocking interaction. Unknown or non-blocking
 * methods resolve to the safe modal fallback instead of throwing.
 */
export function resolveInteractionPresentation(
	method: string,
	request?: InteractionRequestShape,
): InteractionPresentationAssignment {
	if (!isBlockingInteractionMethod(method)) return UNKNOWN_METHOD_FALLBACK;
	if (method === "select" && request && isPermissionApprovalRequest(request)) {
		return {
			presentation: "composer-shelf",
			reason: "permission-mode approval ask (Allow/Deny select) docks in the shelf; the choice returns through the existing ui.select response path",
		};
	}
	return ASSIGNMENTS[method];
}
