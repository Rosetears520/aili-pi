import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
const appShell = await readFile(new URL("../../components/AppShell.tsx", import.meta.url), "utf8");
const gitBranchesLib = await readFile(new URL("../../lib/git-branches.ts", import.meta.url), "utf8");

test("every activation opens a NEW changes tab instead of reusing a named window", () => {
  assert.match(appShell, /window\.open\(`\/changes\?cwd=\$\{encodeURIComponent\(ailiCwd\)\}`, "_blank"\)/);
  assert.doesNotMatch(appShell, /"aili-changes"\)/);
});

test("reload refreshes worktree and branch data alongside the diff payloads", () => {
  // The 2026-08-25 staleness fix: the ⟳ button and scope switches go through
  // reload(), so /api/worktrees and /api/git/branches must be fetched there —
  // not in a once-per-cwd effect.
  const reloadStart = page.indexOf("const reload = useCallback");
  const reloadEnd = page.indexOf("}, [cwd, scope]);", reloadStart);
  const reloadBody = page.slice(reloadStart, reloadEnd);
  assert.ok(reloadStart !== -1 && reloadEnd > reloadStart, "reload callback must exist");
  assert.match(reloadBody, /\/api\/worktrees\?cwd=/);
  assert.match(reloadBody, /\/api\/git\/branches\?cwd=/);
  assert.doesNotMatch(reloadBody, /useEffect/, "reload itself must not be an effect");
  // Focus auto-refresh picks up terminal-side branch switches.
  assert.match(page, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(page, /FOCUS_RELOAD_THROTTLE_MS = 2_000/);
});

test("the header carries an always-on branch switcher for existing local branches", () => {
  assert.match(page, /t\("changes\.branch"\)/);
  assert.match(page, /\/api\/git\/checkout/);
  assert.match(page, /t\("changes\.detached"\)/);
  assert.match(page, /switchToBranch/);
});

test("a branch held by a sibling worktree routes to that worktree instead of erroring", () => {
  assert.match(page, /worktreeOwningBranch = useCallback/);
  assert.match(page, /worktree\.branch === branch && worktree\.path !== currentWorktree/);
  assert.match(page, /applyCwd\(owner\.path\)/);
  assert.match(page, /t\("changes\.inWorktree"\)/);
});

test("the project dropdown lists Pi session history plus a picker entry", () => {
  assert.match(page, /t\("changes\.project"\)/);
  assert.match(page, /PICK_OTHER_PROJECT_VALUE/);
  assert.match(page, /value=\{PICK_OTHER_PROJECT_VALUE\}/);
  assert.match(page, /fetch\("\/api\/sessions"/);
  assert.match(page, /getRecentProjects/);
  assert.match(page, /RECENT_PROJECTS_KEY = "aili-changes-recent-projects"/);
  assert.match(page, /rememberProjectRoot/);
  // Canonical project roots only — picked worktrees are stored as their root.
  assert.match(page, /setCurrentProjectRoot\(body\.projectRoot\)/);
});

test("the header can switch the working directory and restores the last one", () => {
  assert.match(page, /ChangesDirectoryPicker/);
  assert.match(page, /aili-changes-empty-pick/);
  assert.match(page, /CWD_STORAGE_KEY = "aili-changes-cwd"/);
  assert.match(page, /\/api\/cwd\/validate/);
  assert.match(page, /history\.replaceState/);
  assert.match(page, /t\("changes\.notGit"\)/);
});

test("the file list offers a collapsible tree view next to the flat list", () => {
  assert.match(page, /buildChangeTree/);
  assert.match(page, /LIST_VIEW_STORAGE_KEY = "aili-changes-list-view"/);
  assert.match(page, /t\("changes\.listLayout"\)/);
  assert.match(page, /aili-file-tree-dir/);
  assert.match(page, /aria-expanded=\{!collapsed\}/);
  assert.match(page, /collapsedDirs/);
  // Flat rendering stays available as a toggle.
  assert.match(page, /listView === "flat"/);
  assert.match(page, /listView === "tree"/);
  assert.match(css, /\.aili-file-tree-dir\s*\{/);
  assert.match(css, /\.aili-file-tree-caret\[data-collapsed="true"\]/);
  assert.match(css, /\.aili-changes-picker\s*\{/);
  assert.match(css, /\.aili-changes-list-bar\s*\{/);
});

test("the page and picker surface text through the shared i18n message packs", async () => {
  const { readFile } = await import("node:fs/promises");
  const en = await readFile(new URL("../../lib/i18n/messages/en.ts", import.meta.url), "utf8");
  const zh = await readFile(new URL("../../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");
  // Both locales must carry the changes.* namespace used by the page/picker.
  for (const key of ["changes.title", "changes.workingTree", "changes.vsUpstream", "changes.branch", "changes.detached", "changes.project", "changes.pickOtherProject", "changes.inWorktree", "changes.switchBranchHint", "changes.notGit", "changes.pickTitle", "changes.pickConfirm"]) {
    assert.ok(en.includes(`"${key}"`), `en must define ${key}`);
    assert.ok(zh.includes(`"${key}"`), `zh-CN must define ${key}`);
  }
  assert.match(zh, /"changes\.title":\s*"变更"/);
  assert.match(zh, /"changes\.fileCount":\s*"\{count\} 个文件"/);
  // Every visible literal on the page routes through t(); the provider
  // wrapper keeps even the bare-open empty state translated.
  assert.match(page, /export default function ChangesPage\(\) \{\s*\n\s*return \(\s*\n\s*<I18nProvider>/);
  assert.match(page, /t\("changes\.noDirectory"\)/);
  assert.match(page, /t\("changes\.fileCount", \{ count: files\.length \}\)/);
});

test("branch switching stays within existing local branches — no force or creation surface", () => {
  const lib = gitBranchesLib;
  assert.match(lib, /"switch", "--", name/);
  assert.match(lib, /invalidateProjectCache\(\)/);
  assert.doesNotMatch(lib, /--force/);
  assert.doesNotMatch(lib, /checkout --orphan/);
  assert.doesNotMatch(lib, /switch -c/);
});
