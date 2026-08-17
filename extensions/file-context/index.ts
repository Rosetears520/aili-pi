import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import {
	discoverFileContextFiles,
	searchFileContext,
	searchFileContextContent,
	snapshotFileContext,
} from "../../src/runtime/file-context.js";
import { registerFileQuoteExtension } from "./file-context.js";
import { loadFileContextSettingsSync } from "./file-context-settings.js";

/**
 * Register the restored upstream TUI plus the bounded legacy commands. The
 * explorer owns interaction and selected quote lifecycle; the old commands
 * continue to use src/runtime/file-context.ts for small, non-interactive
 * integrations.
 */
export async function registerFileContext(pi: ExtensionAPI): Promise<void> {
	const settings = loadFileContextSettingsSync(join(getAgentDir(), "pi-file-context.json"));
	const registration = registerFileQuoteExtension(pi, { settings });

	pi.registerCommand("file-context-search", {
		description: "Search bounded project file content and report path:line matches.",
		async handler(args, ctx) {
			const query = args.trim() || await ctx.ui.input("Search file context", "Text to find");
			if (!query) return;
			try {
				const files = await discoverFileContextFiles(ctx.cwd);
				const result = await searchFileContextContent(files, async (path) => {
					const attachment = await snapshotFileContext(ctx.cwd, path);
					return { path, content: attachment.content };
				}, query);
				const lines = result.matches.map((match) => `${match.path}:${match.lineNumber}: ${match.line}`);
				ctx.ui.notify(lines.length ? lines.join("\n").slice(0, 4_000) : "No file-context content matches.", "info");
			} catch (error) { ctx.ui.notify(`File-context search unavailable: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
		},
	});
	pi.registerCommand("file-context-files", {
		description: "Search bounded project file paths.",
		async handler(args, ctx) {
			try {
				const files = await discoverFileContextFiles(ctx.cwd);
				const result = searchFileContext(files.map((path) => ({ path })), args.trim()).map((item) => item.path);
				ctx.ui.notify(result.length ? result.join("\n").slice(0, 4_000) : "No file-context path matches.", "info");
			} catch (error) { ctx.ui.notify(`File-context file search unavailable: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
		},
	});
	await registration;
}
