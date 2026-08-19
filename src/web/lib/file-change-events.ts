// AILI-owned FileChangeEvent derivation from real tool results.
//
// Contract: webui-inline-file-change-events (add-webui-coding-workspace,
// design decision 2). Events are derived exclusively from arrived, non-error
// results of file-mutating tools carrying real patch data — never from
// assistant reasoning or prose, and never synthesized from bash output.
//
//   pi `edit`   → details.patch / details.diff is the real unified patch.
//   pi `write`  → result carries no details; additions come from the input
//                 content line count, and the card may lazily enrich the
//                 patch/counts from /api/git/diff inside a git worktree.
//   other tools (incl. MCP-decorated names) → same treatment when a non-error
//                 result carries details.patch/details.diff with a resolvable
//                 input path. Renames/deletes stay schema-level only: no
//                 current tool reports them, and parsing bash output to guess
//                 file operations is forbidden by the contract.

// Imports carry explicit .ts extensions so the root NodeNext typecheck
// (reached through tests/unit) and the web bundler both resolve them.
import type { ToolResultMessage } from "./types.ts";
import { resolveLocalFilePath } from "./file-links.ts";
import { isEditToolName, isWriteToolName } from "./tool-names.ts";

export type FileChangeOperation = "edit" | "create" | "delete" | "rename";

export interface FileChangeEvent {
	id: string;
	/** Resolved absolute path of the changed file. */
	path: string;
	fileName: string;
	/** Parent directory (secondary display); empty string when the file sits in cwd root. */
	parentPath: string;
	language?: string;
	operation: FileChangeOperation;
	additions: number;
	deletions: number;
	/** Unified patch when one exists (tool result, synthesized new-file content, or git enrichment); null = truly unavailable. */
	diff: string | null;
	diffAvailable: boolean;
	/** True when `diff` was synthesized from the write input's content rather than reported by the tool or git. */
	diffIsSynthesized?: boolean;
	toolCallId: string;
	timestamp: number;
	/** Present only when a tool actually reports a rename. */
	oldPath?: string;
}

export interface FileChangeToolCall {
	toolCallId: string;
	toolName: string;
	input?: Record<string, unknown>;
}

/** Count +/− lines of a unified patch, ignoring file headers. */
export function countPatchChanges(patch: string): { additions: number; deletions: number } {
	let additions = 0;
	let deletions = 0;
	for (const line of patch.split(/\r?\n/)) {
		if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) continue;
		if (line.startsWith("+")) additions += 1;
		else if (line.startsWith("-")) deletions += 1;
	}
	return { additions, deletions };
}

function readToolPath(input: Record<string, unknown> | undefined): string | null {
	if (!input) return null;
	const value = input.file_path ?? input.path;
	return typeof value === "string" && value.length > 0 ? value : null;
}

function readResultPatch(result: ToolResultMessage): string | null {
	const details = (result as ToolResultMessage & { details?: unknown }).details;
	if (typeof details !== "object" || details === null || Array.isArray(details)) return null;
	const record = details as Record<string, unknown>;
	if (typeof record.patch === "string" && record.patch.length > 0) return record.patch;
	if (typeof record.diff === "string" && record.diff.length > 0) return record.diff;
	return null;
}

function countContentLines(content: string): number {
	if (content === "") return 0;
	return content.split(/\r?\n/).length;
}

// Display-only new-file patch built from the write input's own content. This
// is not invented data — it is exactly what the tool wrote — but it is also
// not a tool-reported or git-computed diff, so it stays flagged and yields to
// git's real before/after whenever enrichment succeeds.
function synthesizeNewFilePatch(displayPath: string, content: string): string {
	const lines = content === "" ? [] : content.replace(/\r\n/g, "\n").split("\n");
	const body = lines.map((line) => `+${line}`).join("\n");
	return [
		"--- /dev/null",
		`+++ ${displayPath}`,
		`@@ -0,0 +1,${lines.length} @@`,
		body,
	].join("\n");
}

/**
 * Derive one change event from a tool-call/result pair, or null when the pair
 * is not evidence of a real, successful file mutation (no result yet, error
 * result, unresolvable path, or a tool that is not a file-mutating tool).
 */
export function deriveFileChangeEvent(
	call: FileChangeToolCall,
	result: ToolResultMessage | undefined,
	cwd?: string,
	timestamp: number = 0,
): FileChangeEvent | null {
	if (!isWriteToolName(call.toolName) && !isEditToolName(call.toolName)) return null;
	// No result yet (still streaming) or failed — nothing was written.
	if (!result || result.isError) return null;

	const rawPath = readToolPath(call.input);
	if (!rawPath) return null;
	const path = resolveLocalFilePath(rawPath, cwd);
	if (!path) return null;

	const patch = readResultPatch(result);
	const fileName = path.split("/").pop() ?? path;
	const parentPath = path.slice(0, path.length - fileName.length - 1);

	if (patch) {
		// Real patch from the tool result: counts come from the patch itself.
		const { additions, deletions } = countPatchChanges(patch);
		return {
			id: `${call.toolCallId}:${path}`,
			path,
			fileName,
			parentPath,
			// A patch means content changed in place: "edit" regardless of the
			// tool's name (pi write never carries a patch; foreign tools that
			// do are modifying, not necessarily creating).
			operation: "edit",
			additions,
			deletions,
			diff: patch,
			diffAvailable: true,
			toolCallId: call.toolCallId,
			timestamp,
		};
	}

	// `write` results carry no details: additions from the input content; deletions unknown until the card enriches from git (or never, outside
	// git worktrees). The input content is itself real tool data, so a create
	// event synthesizes a /dev/null full-add patch as its base diff — the card
	// stays expandable everywhere (user direction 2026-08-19: writes in
	// git-ignored paths must still show their diff, cap, and full-diff handoff),
	// and git enrichment upgrades it to a real before/after when available.
	if (isWriteToolName(call.toolName) && typeof call.input?.content === "string") {
		return {
			id: `${call.toolCallId}:${path}`,
			path,
			fileName,
			parentPath,
			operation: "create",
			additions: countContentLines(call.input.content),
			deletions: 0,
			diff: synthesizeNewFilePatch(rawPath, call.input.content),
			diffAvailable: true,
			diffIsSynthesized: true,
			toolCallId: call.toolCallId,
			timestamp,
		};
	}

	// A mutating tool succeeded but reported neither a patch nor (for write)
	// content — no honest diff exists. A path-only event keeps the timeline
	// truthful without inventing counts.
	return {
		id: `${call.toolCallId}:${path}`,
		path,
		fileName,
		parentPath,
		operation: isEditToolName(call.toolName) ? "edit" : "create",
		additions: 0,
		deletions: 0,
		diff: null,
		diffAvailable: false,
		toolCallId: call.toolCallId,
		timestamp,
	};
}
