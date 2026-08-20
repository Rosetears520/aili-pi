import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// TUI /worktree contract (user direction 2026-08-20): switch-only, absorbed
// from upstream pi-worktree-0.50.0 session semantics; registered on the sole
// extension entry; no create/remove/prune surface.

const source = await readFile(new URL("../../src/runtime/worktree-switch.ts", import.meta.url), "utf8");
const entry = await readFile(new URL("../../extensions/index.ts", import.meta.url), "utf8");

describe("tui worktree switch command", () => {
  it("registers /worktree on the single extension entry", () => {
    expect(entry).toContain('import { registerWorktreeSwitch }');
    expect(entry).toContain("registerWorktreeSwitch(pi);");
    expect(source).toContain('pi.registerCommand("worktree"');
  });

  it("is switch-only: no add/remove/prune surface", () => {
    expect(source).toContain("Switch this conversation to an existing worktree");
    for (const forbidden of ["worktree add", "removeWorktree", "prune", "git ", '"add"', '"remove"']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("switches by forking the session into the target worktree (upstream semantics)", () => {
    expect(source).toContain("SessionManager.forkFrom(sourceFile, targetPath)");
    expect(source).toContain("ctx.switchSession(targetFile");
    expect(source).toContain("parentSession");
  });

  it("lists via git worktree list --porcelain and resolves by path, branch, or suffix", () => {
    expect(source).toContain('"worktree", "list", "--porcelain"');
    expect(source).toContain("option.branch === needle");
    expect(source).toContain("option.path.endsWith(`/${needle}`)");
  });
});
