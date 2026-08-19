import { describe, expect, it } from "vitest";
import { parseUnifiedPatch } from "../../src/web/lib/patch.ts";

// Characterization suite (task 2.1, add-webui-coding-workspace): parseUnifiedPatch
// becomes the single diff parser behind ChangeDiffView, so its row semantics are
// pinned here before any consolidation edit.

const SAMPLE = [
	"--- a/src/app.ts",
	"+++ b/src/app.ts",
	"@@ -10,4 +10,5 @@ function main() {",
	" const keep = 1;",
	"-const old = 2;",
	"+const neu = 2;",
	"+const extra = 3;",
	" const tail = 4;",
].join("\n");

describe("parseUnifiedPatch row semantics", () => {
	it("reads file paths and line rows from a unified patch", () => {
		const files = parseUnifiedPatch(SAMPLE)!;
		expect(files).not.toBeNull();
		expect(files).toHaveLength(1);
		expect(files[0].oldPath).toBe("a/src/app.ts");
		expect(files[0].newPath).toBe("b/src/app.ts");

		// Consecutive -/+ lines pair into single rows (left removed cell +
		// right added cell); a lone added line stays a right-only row.
		const lines = files[0].rows.filter((row) => row.type === "line");
		expect(lines).toHaveLength(4);

		const [ctx1, pair, addExtra, ctx2] = lines as Extract<typeof files[0]["rows"][number], { type: "line" }>[];
		expect(ctx1.left).toMatchObject({ lineNo: 10, type: "context" });
		expect(ctx1.right).toMatchObject({ lineNo: 10, type: "context" });
		expect(pair.left).toMatchObject({ lineNo: 11, type: "removed", text: "const old = 2;" });
		expect(pair.right).toMatchObject({ lineNo: 11, type: "added", text: "const neu = 2;" });
		expect(addExtra.left.type).toBe("empty");
		expect(addExtra.right).toMatchObject({ lineNo: 12, type: "added", text: "const extra = 3;" });
		expect(ctx2.left).toMatchObject({ lineNo: 12, type: "context", text: "const tail = 4;" });
		expect(ctx2.right).toMatchObject({ lineNo: 13, type: "context" });
	});

	it("keeps hunk headers as hunk rows and pairs removed/added blocks", () => {
		const files = parseUnifiedPatch(SAMPLE)!;
		const hunks = files[0].rows.filter((row) => row.type === "hunk");
		expect(hunks).toHaveLength(1);
		expect((hunks[0] as { text: string }).text).toContain("@@ -10,4 +10,5 @@");
	});

	it("does not split one file when a hunk body contains ---/+++ content lines", () => {
		const tricky = [
			"--- a/log.md",
			"+++ b/log.md",
			"@@ -1,2 +1,2 @@",
			"--- old header inside hunk body",
			"+++ new header inside hunk body",
			" context",
		].join("\n");
		const files = parseUnifiedPatch(tricky)!;
		expect(files).toHaveLength(1);
		const lines = files[0].rows.filter((row) => row.type === "line") as Extract<(typeof files[0]["rows"])[number], { type: "line" }>[];
		expect(lines).toHaveLength(2);
		expect(lines[0].left).toMatchObject({ type: "removed", text: "-- old header inside hunk body" });
		expect(lines[0].right).toMatchObject({ type: "added", text: "++ new header inside hunk body" });
		expect(lines[1].left.type).toBe("context");
	});

	it("returns null when the text contains no diff rows", () => {
		expect(parseUnifiedPatch("just prose\nno patch here")).toBeNull();
		expect(parseUnifiedPatch("")).toBeNull();
	});

	it("tracks line numbers across multiple hunks", () => {
		const multi = [
			"--- a/f.ts",
			"+++ b/f.ts",
			"@@ -1,1 +1,1 @@",
			"-a",
			"+b",
			"@@ -100,1 +100,1 @@",
			"-c",
			"+d",
		].join("\n");
		const files = parseUnifiedPatch(multi)!;
		const lines = files[0].rows.filter((row) => row.type === "line") as Extract<(typeof files[0]["rows"])[number], { type: "line" }>[];
		expect(lines.map((row) => [row.left.lineNo, row.right.lineNo])).toEqual([[1, 1], [100, 100]]);
	});
});
