import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Task 3.2/3.3 contract (add-webui-coding-workspace), amended by user
// direction 2026-08-19 ("以现有功能为准，扩展现有而不是另起一个新的"): the
// sidebar already owns the explorer chrome — project path display,
// branch/worktree switching above the tree, and the explorer toolbar with
// refresh (onExplorerRefresh + done indicator). The tree itself must stay
// chrome-free; its only new behavior is changed-file clicks opening diff mode.

const source = await readFile(new URL("./FileExplorer.tsx", import.meta.url), "utf8");
const sidebar = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");

test("the tree adds no duplicate header chrome (cwd display lives in the sidebar)", () => {
  assert.ok(!source.includes("files.currentCwd"), "tree must not render its own cwd row");
  // The sidebar keeps the single source of explorer chrome: refresh with
  // feedback, upload, changed-count toggle.
  assert.match(sidebar, /onExplorerRefresh\(\)/);
  assert.match(sidebar, /t\("sidebar\.refreshExplorer"\)/);
  // Listing and git effects still re-run through the sidebar refresh key.
  assert.match(source, /, \[cwd, refreshKey, treeRefreshKey\]\);/);
});

test("changed tree files open in diff mode; clean files open source", () => {
  const click = source.match(/const handleClick = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[/);
  assert.ok(click, "tree click handler must exist");
  assert.match(click[0], /gitStatus \? \{ modeHint: "diff" \} : undefined/);
  // The changes summary rows keep their existing diff-mode opens.
  assert.match(source, /onOpenFile\(status\.filePath, name, \{ modeHint: "diff" \}\)/);
});
