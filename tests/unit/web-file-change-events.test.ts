import { describe, expect, it } from "vitest";
import {
	countPatchChanges,
	deriveFileChangeEvent,
} from "../../src/web/lib/file-change-events.ts";
import type { ToolResultMessage } from "../../src/web/lib/types.ts";

const CWD = "/repo";

function call(overrides: Partial<{ toolCallId: string; toolName: string; input: Record<string, unknown> }> = {}) {
	return {
		toolCallId: overrides.toolCallId ?? "tc-1",
		toolName: overrides.toolName ?? "edit",
		input: overrides.input ?? { file_path: "/repo/src/app.ts" },
	};
}

function result(overrides: Partial<ToolResultMessage> & { details?: unknown } = {}): ToolResultMessage {
	return {
		type: "toolResult",
		toolCallId: "tc-1",
		content: [{ type: "text", text: "ok" }],
		isError: false,
		...overrides,
	} as ToolResultMessage;
}

const EDIT_PATCH = ["--- a/src/app.ts", "+++ b/src/app.ts", "@@ -1,3 +1,4 @@", " ctx", "-old", "+neu", "+extra"].join("\n");

describe("countPatchChanges", () => {
	it("counts added and removed lines, ignoring file headers", () => {
		expect(countPatchChanges(EDIT_PATCH)).toEqual({ additions: 2, deletions: 1 });
	});

	it("counts nothing for header-only text", () => {
		expect(countPatchChanges("--- a/x\n+++ b/x")).toEqual({ additions: 0, deletions: 0 });
	});
});

describe("deriveFileChangeEvent (real tool results only)", () => {
	it("derives an edit event from details.patch with patch-based counts", () => {
		const event = deriveFileChangeEvent(call(), result({ details: { patch: EDIT_PATCH } }), CWD, 123);
		expect(event).toMatchObject({
			operation: "edit",
			fileName: "app.ts",
			parentPath: "/repo/src",
			additions: 2,
			deletions: 1,
			diff: EDIT_PATCH,
			diffAvailable: true,
			toolCallId: "tc-1",
			timestamp: 123,
		});
	});

	it("accepts details.diff as the patch carrier and MCP-decorated tool names", () => {
		const event = deriveFileChangeEvent(
			call({ toolName: "mcp.tools.edit", toolCallId: "tc-2" }),
			result({ toolCallId: "tc-2", details: { diff: EDIT_PATCH } }),
			CWD,
		);
		expect(event?.diffAvailable).toBe(true);
		expect(event?.toolCallId).toBe("tc-2");
	});

	it("derives a write create event whose base diff is synthesized from the input content", () => {
		const content = ["line 1", "line 2", "line 3"].join("\n");
		const event = deriveFileChangeEvent(
			call({ toolName: "write", input: { file_path: "/repo/new.ts", content } }),
			result(),
			CWD,
		);
		expect(event).toMatchObject({
			operation: "create",
			additions: 3,
			deletions: 0,
			diffAvailable: true,
			diffIsSynthesized: true,
		});
		// The synthesized patch is a /dev/null full-add of exactly the written
		// content — real tool data, flagged so git enrichment can upgrade it.
		const diff = event?.diff ?? "";
		expect(diff.startsWith("--- /dev/null\n")).toBe(true);
		expect(diff).toContain("@@ -0,0 +1,3 @@");
		expect(diff.endsWith("+line 1\n+line 2\n+line 3")).toBe(true);
	});

	it("an empty write counts zero additions and still carries a synthesized empty diff", () => {
		const event = deriveFileChangeEvent(
			call({ toolName: "write", input: { file_path: "/repo/empty.txt", content: "" } }),
			result(),
			CWD,
		);
		expect(event).toMatchObject({ operation: "create", additions: 0, diffIsSynthesized: true });
	});

	it("produces a path-only event when a mutating tool succeeds without patch or content", () => {
		const event = deriveFileChangeEvent(call({ toolName: "edit" }), result(), CWD);
		expect(event).toMatchObject({ fileName: "app.ts", additions: 0, deletions: 0, diffAvailable: false });
	});

	it("produces nothing for failed, cancelled, or not-yet-arrived calls", () => {
		expect(deriveFileChangeEvent(call(), result({ isError: true }), CWD)).toBeNull();
		expect(deriveFileChangeEvent(call(), undefined, CWD)).toBeNull();
	});

	it("produces nothing for non-mutating tools even when their output mentions files", () => {
		const bashResult = result({ details: undefined, content: [{ type: "text", text: "renamed foo.ts → bar.ts" }] });
		expect(deriveFileChangeEvent(call({ toolName: "bash", input: { command: "mv foo.ts bar.ts" } }), bashResult, CWD)).toBeNull();
		expect(deriveFileChangeEvent(call({ toolName: "read", input: { file_path: "/repo/src/app.ts" } }), result(), CWD)).toBeNull();
	});

	it("produces nothing without a resolvable path", () => {
		expect(deriveFileChangeEvent(call({ input: {} }), result(), CWD)).toBeNull();
		expect(deriveFileChangeEvent(call({ input: { file_path: "" } }), result(), CWD)).toBeNull();
	});

	it("keeps rename schema-level: no event ever carries a guessed oldPath", () => {
		const event = deriveFileChangeEvent(call(), result({ details: { patch: EDIT_PATCH } }), CWD);
		expect(event?.oldPath).toBeUndefined();
	});
});
