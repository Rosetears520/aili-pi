"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChangeDiffView, type DiffView } from "@/components/aili/ChangeDiffView";
import { ChangesDirectoryPicker } from "@/components/aili/ChangesDirectoryPicker";
// ChangeDiffView translates its truncation notice, and /changes opens as its
// own browser tab outside the chat page's provider tree — the page must carry
// its own I18nProvider or useI18n throws on mount.
import { I18nProvider, useI18n } from "@/hooks/useI18n";
import type { GitStatusResponse } from "@/lib/git-types";
import { buildChangeTree, type ChangeTreeNode } from "@/lib/file-tree";
import { getRecentProjects } from "@/lib/project-groups";
import { useResizablePanel } from "@/hooks/useResizablePanel";

const CHANGES_LIST_MIN_WIDTH = 200;
const CHANGES_LIST_MAX_WIDTH = 560;
const CHANGES_LIST_DEFAULT_WIDTH = 340;
const CWD_STORAGE_KEY = "aili-changes-cwd";
const LIST_VIEW_STORAGE_KEY = "aili-changes-list-view";
const RECENT_PROJECTS_KEY = "aili-changes-recent-projects";
const RECENT_PROJECTS_MAX = 8;
const PICK_OTHER_PROJECT_VALUE = "__aili-pick-directory__";
const FOCUS_RELOAD_THROTTLE_MS = 2_000;

interface RemoteCompare {
  readonly available: boolean;
  readonly reason?: string;
  readonly repositoryRoot?: string;
  readonly upstream?: string;
  readonly ahead?: number;
  readonly behind?: number;
  readonly files?: readonly { file: string; status: string }[];
}

interface Diffstat {
  readonly repositoryRoot?: string;
  readonly stats?: Record<string, { a: number; d: number }>;
}

interface WorktreeEntry {
  readonly path: string;
  readonly branch: string | null;
  readonly isMain: boolean;
}

interface BranchesInfo {
  readonly current: string | null;
  readonly branches: readonly string[];
}

type Scope = "working" | "upstream";
type ListView = "tree" | "flat";

interface FileRow {
  readonly key: string;
  readonly relative: string;
  readonly label: string;
  readonly absolute: string;
}

function readCwdParam(): string {
  try {
    return new URLSearchParams(window.location.search).get("cwd")?.trim() ?? "";
  } catch {
    return "";
  }
}

function readInitialListView(): ListView {
  try {
    return window.localStorage.getItem(LIST_VIEW_STORAGE_KEY) === "flat" ? "flat" : "tree";
  } catch {
    return "tree";
  }
}

function readStoredProjects(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_PROJECTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Canonical project roots the user picked on this page, most recent first. */
function rememberProjectRoot(root: string): readonly string[] {
  const next = [root, ...readStoredProjects().filter((item) => item !== root)].slice(0, RECENT_PROJECTS_MAX);
  try { window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

/**
 * VS Code-style changes viewer: relative paths, numstat counts, on-demand
 * patches. The provider wrapper keeps every branch — including the bare-open
 * empty state — under i18n, because the tab has no chat-page provider tree.
 */
export default function ChangesPage() {
  return (
    <I18nProvider>
      <ChangesPageBody />
    </I18nProvider>
  );
}

function ChangesPageBody() {
  const { t } = useI18n();
  const [cwd, setCwd] = useState(readCwdParam);
  const [scope, setScope] = useState<Scope>("working");
  const [view, setView] = useState<DiffView>(() => (typeof window !== "undefined" && window.localStorage.getItem("aili-diff-view") === "split" ? "split" : "unified"));
  const [listView, setListView] = useState<ListView>(readInitialListView);
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [remote, setRemote] = useState<RemoteCompare | null>(null);
  const [diffstat, setDiffstat] = useState<Diffstat | null>(null);
  const [selected, setSelected] = useState<FileRow | null>(null);
  // Worktree & branch switching (user direction 2026-08-20 + 2026-08-25):
  // pick an EXISTING worktree or switch to an EXISTING local branch of this
  // repository — creation stays out of this page by contract. The working
  // directory itself may also be swapped to any local repository.
  const [worktrees, setWorktrees] = useState<WorktreeEntry[]>([]);
  const [currentWorktree, setCurrentWorktree] = useState<string | null>(null);
  const [currentProjectRoot, setCurrentProjectRoot] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchesInfo | null>(null);
  const [switchingBranch, setSwitchingBranch] = useState(false);
  const [recentProjects, setRecentProjects] = useState<readonly { key: string; root: string }[]>([]);
  const [storedProjects, setStoredProjects] = useState<readonly string[]>([]);
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(() => new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [patch, setPatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bare /changes opens (standalone pi-changes, bookmarks, tab duplication):
  // restore the last chosen directory after re-validating it server-side —
  // validate is the trust entry that re-allows the root after a restart.
  const restoreAttemptedRef = useRef(cwd !== "");

  useEffect(() => {
    if (cwd || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(CWD_STORAGE_KEY); } catch { stored = null; }
    if (!stored) return;
    fetch("/api/cwd/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: stored }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { success?: boolean; cwd?: string } | null) => {
        if (body?.success && typeof body.cwd === "string") setCwd(body.cwd);
        else { try { window.localStorage.removeItem(CWD_STORAGE_KEY); } catch { /* storage unavailable */ } }
      })
      .catch(() => undefined);
  }, [cwd]);

  /** Project dropdown history: Pi's own session scan (same source as the
   *  sidebar) plus the canonical roots picked on this page. */
  useEffect(() => {
    fetch("/api/sessions", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { sessions?: unknown[] } | null) => {
        if (!body || !Array.isArray(body.sessions)) return;
        setRecentProjects(getRecentProjects(body.sessions as Parameters<typeof getRecentProjects>[0]));
      })
      .catch(() => undefined);
  }, [cwd]);

  useEffect(() => {
    setStoredProjects(readStoredProjects());
  }, []);

  const projects = useMemo(() => {
    const seen = new Set<string>();
    const merged: { key: string; root: string }[] = [];
    const push = (root: string, key: string) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      merged.push({ key, root });
    };
    if (currentProjectRoot) push(currentProjectRoot, currentProjectRoot);
    for (const project of recentProjects) push(project.root, project.key);
    for (const root of storedProjects) push(root, root);
    return merged.slice(0, 12);
  }, [currentProjectRoot, recentProjects, storedProjects]);

  /** Point every surface at a new working directory and keep URL/storage in
   *  sync so refresh, tab duplication, and reopen all land on the same repo. */
  const applyCwd = useCallback((next: string) => {
    setSelected(null);
    setPatch(null);
    setCollapsedDirs(new Set());
    setCwd(next);
    try { window.localStorage.setItem(CWD_STORAGE_KEY, next); } catch { /* storage unavailable */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("cwd", next);
      window.history.replaceState(null, "", url.toString());
    } catch { /* history unavailable */ }
  }, []);

  // Draggable splitter between the file list and the diff, sharing the
  // sidebar's resizable-panel machinery (pointer drag, arrow keys, persisted
  // width). The live width is written to --aili-changes-list-width.
  const listWidthRef = useRef(CHANGES_LIST_DEFAULT_WIDTH);
  const listResizer = useResizablePanel({
    ariaLabel: t("changes.resizeList"),
    cssVariable: "--aili-changes-list-width",
    defaultWidth: CHANGES_LIST_DEFAULT_WIDTH,
    getMaxWidth: () => Math.floor(window.innerWidth / 2),
    growthDirection: "right",
    maxWidth: CHANGES_LIST_MAX_WIDTH,
    minWidth: CHANGES_LIST_MIN_WIDTH,
    storageKey: "aili-changes-list-width",
    widthRef: listWidthRef,
  });

  const repositoryRoot = scope === "working" ? status?.repositoryRoot ?? null : remote?.repositoryRoot ?? null;

  const applyView = useCallback((next: DiffView) => {
    setView(next);
    try { window.localStorage.setItem("aili-diff-view", next); } catch { /* storage unavailable */ }
  }, []);

  const applyListView = useCallback((next: ListView) => {
    setListView(next);
    try { window.localStorage.setItem(LIST_VIEW_STORAGE_KEY, next); } catch { /* storage unavailable */ }
  }, []);

  // One reload drives every header surface, including worktrees and branches:
  // the refresh button, scope switches, and focus auto-refresh must all be
  // able to pick up branch switches made outside the browser (2026-08-25 fix —
  // the worktree/branch data used to be fetched once per cwd and went stale).
  const reload = useCallback(async () => {
    if (!cwd) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(null);
    setPatch(null);
    const scopeParam = scope === "working" ? "working" : "upstream";
    const loads: Array<Promise<unknown>> = [
      fetch(`/api/git/diffstat?cwd=${encodeURIComponent(cwd)}&scope=${scopeParam}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((body: Diffstat) => { if (!cancelled) setDiffstat(body); }),
      fetch(`/api/worktrees?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { projectRoot?: string; worktrees?: WorktreeEntry[]; currentWorktreePath?: string | null } | null) => {
          if (cancelled || !body) return;
          setWorktrees(body.worktrees ?? []);
          setCurrentWorktree(body.currentWorktreePath ?? null);
          if (typeof body.projectRoot === "string" && body.projectRoot) {
            setCurrentProjectRoot(body.projectRoot);
            setStoredProjects(rememberProjectRoot(body.projectRoot));
          }
        })
        .catch(() => undefined),
      fetch(`/api/git/branches?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { current?: string | null; branches?: string[] } | null) => {
          if (cancelled) return;
          if (body && Array.isArray(body.branches)) {
            setBranches({ current: typeof body.current === "string" ? body.current : null, branches: body.branches });
          } else setBranches(null);
        })
        .catch(() => { if (!cancelled) setBranches(null); }),
    ];
    if (scope === "working") {
      loads.push(
        fetch(`/api/git/status?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" })
          .then((response) => response.json())
          .then((body: GitStatusResponse) => { if (!cancelled) setStatus(body); }),
      );
    } else {
      loads.push(
        fetch(`/api/git/remote-compare?cwd=${encodeURIComponent(cwd)}`, { cache: "no-store" })
          .then((response) => response.json())
          .then((body: RemoteCompare) => { if (!cancelled) setRemote(body); })
          .catch(() => { if (!cancelled) setRemote({ available: false, reason: "unavailable" }); }),
      );
    }
    try {
      await Promise.all(loads);
    } catch (loadError) {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      if (!cancelled) setLoading(false);
    }
    return () => { cancelled = true; };
  }, [cwd, scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Branch switches made in a terminal must show up once the tab regains
  // focus; throttled so tab-flurried users do not spam the git endpoints.
  const lastFocusReloadRef = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      if (!cwd) return;
      const now = Date.now();
      if (now - lastFocusReloadRef.current < FOCUS_RELOAD_THROTTLE_MS) return;
      lastFocusReloadRef.current = now;
      void reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [cwd, reload]);

  const files = useMemo<FileRow[]>(() => {
    if (scope === "working") {
      const root = status?.repositoryRoot ?? "";
      return (status?.files ?? []).map((file) => ({
        key: file.filePath,
        relative: root && file.filePath.startsWith(`${root}/`) ? file.filePath.slice(root.length + 1) : file.filePath,
        label: file.code,
        absolute: file.filePath,
      }));
    }
    const root = remote?.repositoryRoot ?? "";
    return (remote?.files ?? []).map((entry) => ({
      key: entry.file,
      relative: entry.file,
      label: entry.status.length > 1 ? entry.status[0] ?? "M" : entry.status,
      absolute: root ? `${root}/${entry.file}` : entry.file,
    }));
  }, [scope, status, remote]);

  const statFor = useCallback((row: FileRow) => {
    if (scope === "working") {
      const relative = status?.repositoryRoot && row.absolute.startsWith(`${status.repositoryRoot}/`)
        ? row.absolute.slice(status.repositoryRoot.length + 1)
        : row.absolute;
      return diffstat?.stats?.[relative];
    }
    return diffstat?.stats?.[row.relative];
  }, [scope, diffstat, status]);

  const rowByKey = useMemo(() => new Map(files.map((row) => [row.key, row])), [files]);

  const tree = useMemo(() => buildChangeTree(files.map((row) => {
    const stat = statFor(row);
    return { key: row.key, relative: row.relative, additions: stat?.a ?? -1, deletions: stat?.d ?? -1 };
  })), [files, statFor]);

  const toggleDir = useCallback((path: string) => {
    setCollapsedDirs((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const loadPatch = useCallback(async (row: FileRow) => {
    if (!cwd) return;
    setSelected(row);
    setPatch(null);
    setError(null);
    try {
      if (scope === "working") {
        const query = `cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(row.absolute)}`;
        const response = await fetch(`/api/git/diff?${query}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok || !body?.supported) throw new Error(body?.error ?? "diff unavailable for this file");
        setPatch(typeof body.patch === "string" ? body.patch : "");
      } else {
        const query = `cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(row.relative)}`;
        const response = await fetch(`/api/git/remote-compare?${query}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
        setPatch(typeof body?.path?.patch === "string" ? body.path.patch : "");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [cwd, scope]);

  /** Switch to an existing local branch (git switch; git itself refuses when
   *  carried changes would be overwritten). On success everything reloads. */
  const switchToBranch = useCallback(async (branch: string) => {
    if (!cwd || !branch || switchingBranch) return;
    setSwitchingBranch(true);
    setError(null);
    try {
      const response = await fetch("/api/git/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, branch }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) throw new Error(body?.error ?? `HTTP ${response.status}`);
      await reload();
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : String(switchError));
    } finally {
      setSwitchingBranch(false);
    }
  }, [cwd, reload, switchingBranch]);

  if (!cwd) {
    return (
      <main className="aili-changes-page">
        <div className="aili-changes-empty">
          <p>{t("changes.noDirectory")}</p>
          <button type="button" className="aili-changes-empty-pick" onClick={() => setShowPicker(true)}>{t("changes.chooseDirectory")}</button>
        </div>
        {showPicker && (
          <ChangesDirectoryPicker
            initialDir={null}
            onChoose={(path) => { setShowPicker(false); applyCwd(path); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </main>
    );
  }

  const upstreamMeta = scope === "upstream" && remote?.available
    ? `${remote.upstream} · ↑${remote.ahead} ↓${remote.behind}`
    : null;
  const currentBranch = branches?.current
    ?? worktrees.find((worktree) => worktree.path === currentWorktree)?.branch
    ?? null;
  const nonGit = scope === "working" && status?.isGitRepository === false;

  /** A branch held by a SIBLING worktree — selecting it navigates to that
   *  worktree instead of attempting a checkout git would refuse. */
  const worktreeOwningBranch = useCallback((branch: string): WorktreeEntry | null =>
    worktrees.find((worktree) => worktree.branch === branch && worktree.path !== currentWorktree) ?? null,
  [worktrees, currentWorktree]);

  const renderTreeNodes = (nodes: readonly ChangeTreeNode[], depth: number) => nodes.map((node) => {
    if (node.kind === "dir") {
      const collapsed = collapsedDirs.has(node.path);
      return (
        <Fragment key={node.path}>
          <button
            type="button"
            className="aili-file-tree-dir"
            style={{ paddingLeft: 6 + depth * 14 }}
            aria-expanded={!collapsed}
            onClick={() => toggleDir(node.path)}
          >
            <span className="aili-file-tree-caret" data-collapsed={collapsed} aria-hidden>▾</span>
            <span className="aili-file-tree-name" title={node.path}>{node.name}</span>
            <span className="aili-file-tree-files">{node.fileCount}</span>
            <span className="aili-file-counts">
              {node.additions > 0 && <span className="aili-count-add">+{node.additions}</span>}
              {node.deletions > 0 && <span className="aili-count-del">−{node.deletions}</span>}
            </span>
          </button>
          {!collapsed && renderTreeNodes(node.children, depth + 1)}
        </Fragment>
      );
    }
    const row = rowByKey.get(node.key);
    if (!row) return null;
    return (
      <button
        key={node.key}
        type="button"
        className="aili-file-row aili-file-tree-file"
        style={{ paddingLeft: 6 + depth * 14 + 16 }}
        data-active={row.key === selected?.key}
        onClick={() => void loadPatch(row)}
      >
        <span className="aili-file-status">{row.label}</span>
        <span className="aili-file-name" title={row.relative}>{node.name}</span>
        {(node.additions >= 0 || node.deletions >= 0) && (
          <span className="aili-file-counts">
            {node.additions >= 0 && <span className="aili-count-add">+{node.additions}</span>}
            {node.deletions >= 0 && <span className="aili-count-del">−{node.deletions}</span>}
          </span>
        )}
      </button>
    );
  });

  return (
    <main className="aili-changes-page" aria-label={t("changes.title")}>
      <header className="aili-changes-head">
        <strong>{t("changes.title")}</strong>
          <select
            aria-label={t("changes.project")}
            title={t("changes.project")}
            value={currentProjectRoot ?? cwd}
            onChange={(event) => {
              const next = event.target.value;
              if (next === PICK_OTHER_PROJECT_VALUE) { setShowPicker(true); return; }
              if (next && next !== cwd) applyCwd(next);
            }}
            style={{ marginLeft: 4, maxWidth: 220, height: 24, padding: "0 6px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          >
            {projects.map((project) => (
              <option key={project.root} value={project.root}>{project.root.split("/").pop() ?? project.root}</option>
            ))}
            <option value={PICK_OTHER_PROJECT_VALUE}>＋ {t("changes.pickOtherProject")}</option>
          </select>
          {branches && branches.branches.length > 0 && (
            <select
              aria-label={t("changes.branch")}
              title={t("changes.switchBranchHint")}
              value={currentBranch ?? ""}
              disabled={switchingBranch}
              onChange={(event) => {
                const next = event.target.value;
                if (!next) return;
                const owner = worktreeOwningBranch(next);
                // Git refuses to check a branch out twice; a branch held by a
                // sibling worktree navigates there instead of erroring.
                if (owner) { applyCwd(owner.path); return; }
                void switchToBranch(next);
              }}
              style={{ marginLeft: 4, maxWidth: 220, height: 24, padding: "0 6px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            >
              {!currentBranch && <option value="" disabled>{t("changes.detached")}</option>}
              {branches.branches.map((branch) => (
                <option key={branch} value={branch}>{`${branch}${worktreeOwningBranch(branch) ? t("changes.inWorktree") : ""}`}</option>
              ))}
            </select>
          )}
        <span className="aili-changes-repo">{repositoryRoot ?? cwd}</span>
        {upstreamMeta && <span className="aili-changes-meta">{upstreamMeta}</span>}
        <span style={{ flex: 1 }} />
        <div className="aili-inspector-tabs" role="tablist">
          <button role="tab" aria-selected={scope === "working"} onClick={() => setScope("working")}>{t("changes.workingTree")}</button>
          <button role="tab" aria-selected={scope === "upstream"} onClick={() => setScope("upstream")}>{t("changes.vsUpstream")}</button>
        </div>
        <div className="aili-inspector-tabs" role="tablist" aria-label={t("changes.diffLayout")}>
          <button role="tab" aria-selected={view === "unified"} onClick={() => applyView("unified")}>{t("changes.unified")}</button>
          <button role="tab" aria-selected={view === "split"} onClick={() => applyView("split")}>{t("changes.split")}</button>
        </div>
        <button type="button" className="aili-changes-refresh" onClick={() => void reload()} title={t("changes.refresh")}>⟳</button>
        <button type="button" className="aili-changes-refresh" onClick={() => window.close()} title={t("changes.closeTab")}>✕</button>
      </header>
      <div className="aili-changes-body">
        <div
          ref={listResizer.panelRef}
          id="aili-changes-list"
          className={`aili-changes-list${listResizer.isResizing ? " is-resizing" : ""}`}
          style={{ "--aili-changes-list-width": `${listResizer.width}px` } as CSSProperties}
        >
          <div className="aili-changes-list-bar">
            <span className="aili-changes-list-count">{files.length === 1 ? t("changes.oneFile") : t("changes.fileCount", { count: files.length })}</span>
            <div className="aili-inspector-tabs" role="tablist" aria-label={t("changes.listLayout")}>
              <button role="tab" aria-selected={listView === "tree"} onClick={() => applyListView("tree")}>{t("changes.tree")}</button>
              <button role="tab" aria-selected={listView === "flat"} onClick={() => applyListView("flat")}>{t("changes.flat")}</button>
            </div>
          </div>
          {loading && <p className="aili-inspector-empty">{t("changes.loading")}</p>}
          {nonGit && !loading && (
            <div className="aili-inspector-empty">
              <p>{t("changes.notGit")}</p>
              <button type="button" className="aili-changes-empty-pick" onClick={() => setShowPicker(true)}>{t("changes.chooseAnother")}</button>
            </div>
          )}
          {!loading && !nonGit && files.length === 0 && (
            <p className="aili-inspector-empty">
              {scope === "working" ? t("changes.noLocalChanges") : remote?.available ? t("changes.noUpstreamDiff") : t("changes.noUpstream")}
            </p>
          )}
          {!loading && !nonGit && listView === "flat" && files.map((row) => {
            const stat = statFor(row);
            return (
              <button key={row.key} type="button" className="aili-file-row" data-active={row.key === selected?.key} onClick={() => void loadPatch(row)}>
                <span className="aili-file-status">{row.label}</span>
                <span className="aili-file-name" title={row.relative}>{row.relative}</span>
                {stat && (
                  <span className="aili-file-counts">
                    {stat.a >= 0 ? <span className="aili-count-add">+{stat.a}</span> : null}
                    {stat.d >= 0 ? <span className="aili-count-del">−{stat.d}</span> : null}
                  </span>
                )}
              </button>
            );
          })}
          {!loading && !nonGit && listView === "tree" && renderTreeNodes(tree, 0)}
        </div>
        <div
          {...listResizer.separatorProps}
          aria-controls="aili-changes-list"
          className={`panel-resize-handle aili-changes-resize-handle${listResizer.isResizing ? " is-resizing" : ""}`}
          title={t("changes.dragResize")}
        />
        <div className="aili-changes-diff">
          {error && <p className="aili-inspector-error" role="alert">{error}</p>}
          {selected && patch !== null && <ChangeDiffView file={selected.relative} patch={patch} view={view} />}
          {selected && patch === null && !error && <p className="aili-inspector-empty">{t("changes.loadingDiff")}</p>}
          {!selected && <p className="aili-inspector-empty">{t("changes.selectFile")}</p>}
        </div>
      </div>
      {showPicker && (
        <ChangesDirectoryPicker
          initialDir={cwd}
          onChoose={(path) => { setShowPicker(false); applyCwd(path); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </main>
  );
}
