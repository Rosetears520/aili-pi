// AILI-owned TUI /worktree command (user direction 2026-08-20: register the
// upstream pi-worktree SWITCHING behavior in the terminal — list + switch,
// keeping the current conversation). Semantics absorbed from
// upstream/pi-extensions/pi-worktree-0.50.0/src/session.ts (MIT): fork/copy
// the current session into a new session rooted at the target worktree, then
// ctx.switchSession. Switch-only by design — add/remove/prune stay out (the
// same boundary as the web Changes page switcher).

import { existsSync, writeFileSync } from "node:fs";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

interface WorktreeOption {
  path: string;
  branch: string | null;
  isMain: boolean;
}

const execFileAsync = promisify(execFile);

/** Minimal `git worktree list --porcelain` parse (switch-only needs path/branch only). */
async function listWorktreeOptions(cwd: string): Promise<WorktreeOption[]> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, "worktree", "list", "--porcelain"]);
  const options: WorktreeOption[] = [];
  let current: Partial<WorktreeOption> | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current?.path) options.push(current as WorktreeOption);
      current = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "bare" && current) {
      current.isMain = true;
    }
  }
  if (current?.path) options.push(current as WorktreeOption);
  const main = options.find((option) => option.path && !option.branch);
  if (main) main.isMain = true;
  return options.filter((option) => option.path);
}

function label(option: WorktreeOption): string {
  const name = option.isMain ? "main" : (option.branch ?? option.path.split("/").pop() ?? option.path);
  return `${name}  ${option.path}`;
}

function resolveTarget(options: WorktreeOption[], query: string): WorktreeOption | null {
  const needle = query.trim().replace(/\/+$/, "");
  if (!needle) return null;
  return (
    options.find((option) => option.path === needle)
    ?? options.find((option) => option.branch === needle)
    ?? options.find((option) => option.path.endsWith(`/${needle}`) || option.path.endsWith(needle))
    ?? null
  );
}

/** Fork the current session into the target worktree and switch to it. */
async function switchTo(ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1], targetPath: string): Promise<void> {
  const sourceFile = ctx.sessionManager.getSessionFile();
  let targetFile: string;
  if (sourceFile && existsSync(sourceFile)) {
    const persisted = SessionManager.open(sourceFile);
    const forked = SessionManager.forkFrom(sourceFile, targetPath);
    const forkedFile = forked.getSessionFile();
    if (!forkedFile || !existsSync(forkedFile)) throw new Error("Pi did not create the target worktree session file.");
    const leaf = persisted.getLeafId();
    if (leaf !== null && !persisted.getEntry(leaf)) {
      // Active branch missing from the persisted file: fall through to a
      // header-only target instead of corrupting the fork.
      targetFile = writeFreshSession(ctx, targetPath);
    } else {
      targetFile = forkedFile;
    }
  } else {
    targetFile = writeFreshSession(ctx, targetPath);
  }
  const result = await ctx.switchSession(targetFile, {
    withSession: async (replacementCtx) => {
      replacementCtx.ui.notify(`Switched Pi workspace to ${targetPath}.`, "info");
    },
  });
  if (result.cancelled) {
    ctx.ui.notify(`Workspace switch cancelled. The prepared session was retained at ${targetFile}.`, "info");
  }
}

function writeFreshSession(
  ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1],
  targetPath: string,
): string {
  const entries: readonly SessionEntry[] = ctx.sessionManager.getEntries();
  const parent = ctx.sessionManager.getSessionFile();
  const target = SessionManager.create(targetPath, undefined, parent ? { parentSession: parent } : undefined);
  const file = target.getSessionFile();
  const header = target.getHeader();
  if (!file || !header) throw new Error("Pi could not prepare the target worktree session.");
  writeFileSync(file, [header, ...entries].map((entry) => JSON.stringify(entry)).join("\n") + "\n", {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  const verified = SessionManager.open(file);
  if (verified.getCwd() !== targetPath) throw new Error("Pi could not verify the target session cwd.");
  return file;
}

export function registerWorktreeSwitch(pi: Pick<ExtensionAPI, "registerCommand">): void {
  pi.registerCommand("worktree", {
    description: "Switch this conversation to an existing worktree: /worktree [branch|path] (switch-only; no create/remove)",
    handler: async (args, ctx) => {
      let options: WorktreeOption[];
      try {
        options = await listWorktreeOptions(ctx.cwd);
      } catch {
        return ctx.ui.notify("worktree: not inside a git repository with worktrees", "error");
      }
      if (options.length === 0) {
        return ctx.ui.notify("worktree: no worktrees found for this repository", "warning");
      }
      let target = resolveTarget(options, args);
      if (!target) {
        if (args.trim()) {
          return ctx.ui.notify(`worktree: no worktree matches "${args.trim()}"`, "error");
        }
        const choice = await ctx.ui.select("Switch to worktree", options.map((option) => label(option)));
        if (!choice) return ctx.ui.notify("worktree: switch cancelled", "info");
        target = options.find((option) => label(option) === choice) ?? null;
        if (!target) return ctx.ui.notify("worktree: selection could not be resolved", "error");
      }
      try {
        await switchTo(ctx, target.path);
      } catch (error) {
        return ctx.ui.notify(`worktree: switch failed — ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
