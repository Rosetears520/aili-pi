import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
import {
	createFileQuoteSnapshot,
	discoverProjectFiles,
	formatQuoteContext,
	registerFileQuoteExtension,
} from "../../extensions/file-context/file-context.js";
import { ProjectFileSearch } from "../../extensions/file-context/file-search.js";
import { createGitContext, parseUnifiedDiff } from "../../extensions/file-context/git-context.js";

describe("restored file context TUI domain", () => {
	it("registers the File Context menu, browse route, and default F8 shortcut", async () => {
		const commands = new Map<string, unknown>();
		const shortcuts = new Map<string, unknown>();
		const pi = {
			registerCommand(name: string, definition: unknown) { commands.set(name, definition); },
			registerShortcut(name: string, definition: unknown) { shortcuts.set(name, definition); },
			on() { return undefined; },
		} as never;
		await registerFileQuoteExtension(pi, {
			loadSettings: async () => ({ settings: { openShortcut: "f8" } }),
			discoverFiles: async () => [],
			createGit: async () => undefined,
		} as never);
		expect(commands.has("file-context")).toBe(true);
		expect(commands.has("file-context-browse")).toBe(true);
		expect(shortcuts.has("f8")).toBe(true);
	});
	it("keeps selected quote snapshots immutable and preserves exact text", () => {
		const quote = createFileQuoteSnapshot("src/example.ts", 2, 3, "const a = 1;\nconst b = 2;");
		expect(Object.isFrozen(quote)).toBe(true);
		expect(quote.text).toBe("const a = 1;\nconst b = 2;");
		expect(formatQuoteContext([quote])).toContain('lines="2-3"');
	});

	it("ranks project files with typo-tolerant search", () => {
		const search = new ProjectFileSearch(["src/file-context.ts", "README.md", "src/runtime/file-context.ts"]);
		expect(search.search("file contxt")[0]).toBe("src/file-context.ts");
	});

	it("parses changed lines for hunk navigation", () => {
		const hunks = parseUnifiedDiff("diff --git a/a.ts b/a.ts\n@@ -1,2 +1,3 @@\n one\n+two\n three\n");
		expect(hunks).toHaveLength(1);
		expect(hunks[0]?.changedLines).toEqual([2]);
	});

	it("discovers regular project files", async () => {
		const root = await mkdtemp(join(tmpdir(), "file-context-tui-"));
		await writeFile(join(root, "visible.ts"), "export {}\n");
		const files = await discoverProjectFiles(root);
		expect(files).toContain("visible.ts");
	});

	it("loads Git status and changed hunks for the explorer", async () => {
		const root = await mkdtemp(join(tmpdir(), "file-context-git-"));
		const git = async (...args: string[]) => {
			await execFileAsync("git", args, { cwd: root });
		};
		await git("init");
		await git("config", "user.email", "file-context@example.invalid");
		await git("config", "user.name", "File Context Test");
		await writeFile(join(root, "tracked.ts"), "one\ntwo\nthree\n");
		await git("add", "tracked.ts");
		await git("commit", "-m", "initial");
		await writeFile(join(root, "tracked.ts"), "one\nchanged\nthree\n");
		await writeFile(join(root, "untracked.ts"), "export {}\n");

		const context = await createGitContext(root);
		expect(context?.project.dirty).toBe(true);
		expect(context?.statuses.get("tracked.ts")).toMatchObject({ code: " M", unstaged: true });
		expect(context?.statuses.get("untracked.ts")).toMatchObject({ code: "??", untracked: true });
		expect((await context?.getFileContext("tracked.ts"))?.hunks[0]?.changedLines).toEqual([2]);
	});
});
