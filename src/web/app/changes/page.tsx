"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AiliFileDiff, type DiffView } from "@/components/aili/AiliFileDiff";
import type { GitStatusResponse } from "@/lib/git-types";

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

type Scope = "working" | "upstream";

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

/** VS Code-style changes viewer: relative paths, numstat counts, on-demand patches. */
export default function ChangesPage() {
  const [cwd, setCwd] = useState(readCwdParam);
  const [scope, setScope] = useState<Scope>("working");
  const [view, setView] = useState<DiffView>(() => (typeof window !== "undefined" && window.localStorage.getItem("aili-diff-view") === "split" ? "split" : "unified"));
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [remote, setRemote] = useState<RemoteCompare | null>(null);
  const [diffstat, setDiffstat] = useState<Diffstat | null>(null);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repositoryRoot = scope === "working" ? status?.repositoryRoot ?? null : remote?.repositoryRoot ?? null;

  const applyView = useCallback((next: DiffView) => {
    setView(next);
    try { window.localStorage.setItem("aili-diff-view", next); } catch { /* storage unavailable */ }
  }, []);

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

  if (!cwd) {
    return (
      <main className="aili-changes-page">
        <div className="aili-changes-empty">No working directory known — open this page from a session's Changes button.</div>
      </main>
    );
  }

  const upstreamMeta = scope === "upstream" && remote?.available
    ? `${remote.upstream} · ↑${remote.ahead} ↓${remote.behind}`
    : null;

  return (
    <main className="aili-changes-page" aria-label="Changes viewer">
      <header className="aili-changes-head">
        <strong>Changes</strong>
        <span className="aili-changes-repo">{repositoryRoot ?? cwd}</span>
        {upstreamMeta && <span className="aili-changes-meta">{upstreamMeta}</span>}
        <span style={{ flex: 1 }} />
        <div className="aili-inspector-tabs" role="tablist">
          <button role="tab" aria-selected={scope === "working"} onClick={() => setScope("working")}>Working tree</button>
          <button role="tab" aria-selected={scope === "upstream"} onClick={() => setScope("upstream")}>vs Upstream</button>
        </div>
        <div className="aili-inspector-tabs" role="tablist" aria-label="Diff layout">
          <button role="tab" aria-selected={view === "unified"} onClick={() => applyView("unified")}>Unified</button>
          <button role="tab" aria-selected={view === "split"} onClick={() => applyView("split")}>Split</button>
        </div>
        <button type="button" className="aili-changes-refresh" onClick={() => void reload()} title="Refresh">⟳</button>
        <button type="button" className="aili-changes-refresh" onClick={() => window.close()} title="Close tab">✕</button>
      </header>
      <div className="aili-changes-body">
        <div className="aili-changes-list">
          {loading && <p className="aili-inspector-empty">Loading…</p>}
          {!loading && files.length === 0 && (
            <p className="aili-inspector-empty">
              {scope === "working" ? "No local changes" : remote?.available ? "No differences versus upstream" : "No upstream branch configured"}
            </p>
          )}
          {!loading && files.map((row) => {
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
        </div>
        <div className="aili-changes-diff">
          {error && <p className="aili-inspector-error" role="alert">{error}</p>}
          {selected && patch !== null && <AiliFileDiff file={selected.relative} patch={patch} view={view} />}
          {selected && patch === null && !error && <p className="aili-inspector-empty">Loading diff…</p>}
          {!selected && <p className="aili-inspector-empty">Select a file</p>}
        </div>
      </div>
    </main>
  );
}
