import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  discoverFileContextFiles,
  getFileContextGitProvenance,
  parseGitDiffHunks,
  freezeFileContextAttachments,
  openFileContext,
  searchFileContext,
  searchFileContextContent,
  snapshotFileContext,
} from "../../src/runtime/file-context.js";

function render(attachment: { path: string; startLine: number; endLine: number; sha256: string; content: string; tokenEstimate: number }): string {
  return `\n\n[File context: ${attachment.path}:${attachment.startLine}-${attachment.endLine}; sha256=${attachment.sha256}; tokens≈${attachment.tokenEstimate}]\n${attachment.content}\n[/File context]`;
}

function parseRanges(value: string): Array<{ startLine: number; endLine: number }> {
  const ranges = value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    const match = item.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`Invalid line range: ${item}`);
    const startLine = Number(match[1]);
    const endLine = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine) throw new Error(`Invalid line range: ${item}`);
    return { startLine, endLine };
  });
  if (ranges.length === 0) return [{ startLine: 1, endLine: Number.MAX_SAFE_INTEGER }];
  return ranges;
}

async function resolveSelectionRanges(cwd: string, path: string, selection: string, diff: string | undefined): Promise<Array<{ startLine: number; endLine: number }>> {
  if (selection === "hunk") {
    const hunk = parseGitDiffHunks(diff ?? "")[0];
    if (!hunk) throw new Error("No Git diff hunk is available for this file");
    return [{ startLine: hunk.newStart, endLine: Math.max(hunk.newStart, hunk.newStart + hunk.newCount - 1) }];
  }
  void cwd;
  return parseRanges(selection);
}

/** Pi-only controller. Domain search/snapshot/Git behavior stays in src/runtime/file-context.ts. */
export function registerFileContext(pi: ExtensionAPI): void {
  pi.registerCommand("file-context", {
    description: "Attach bounded immutable file context. Args: path[:line[-line][,line[-line]]|hunk].",
    async handler(args, ctx) {
      const request = args.trim() || await ctx.ui.input("Attach file context", "Relative path[:line[-line][,line[-line]]]");
      if (!request) return;
      try {
        const divider = request.indexOf(":");
        const path = (divider < 0 ? request : request.slice(0, divider)).trim();
        const provenance = await getFileContextGitProvenance(ctx.cwd, path);
        const ranges = await resolveSelectionRanges(ctx.cwd, path, divider < 0 ? "" : request.slice(divider + 1).trim(), provenance.diff);
        const attachments = freezeFileContextAttachments(await Promise.all(ranges.map(async (range) => await snapshotFileContext(ctx.cwd, path, range, provenance))));
        ctx.ui.pasteToEditor(attachments.map(render).join(""));
      } catch (error) { ctx.ui.notify(`File context unavailable: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
    },
  });
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
  // Preserve direct interactive browse for an empty invocation in TUI contexts.
  pi.registerCommand("file-context-browse", {
    description: "Prompt for one in-root file and attach an immutable snapshot.",
    async handler(_args, ctx) {
      await openFileContext({
        chooseFile: async () => await ctx.ui.input("Attach file context", "Relative path inside this project"),
        attach: (attachment) => ctx.ui.pasteToEditor(render(attachment)),
        report: (message) => ctx.ui.notify(message, "warning"),
      }, ctx.cwd);
    },
  });
}
