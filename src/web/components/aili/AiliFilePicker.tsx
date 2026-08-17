"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderIcon, getFileIcon } from "../FileIcons";
import { filterFileEntries, type FileIndexEntry } from "@/lib/file-fuzzy";
import { fetchWslEnv, normalizeWindowsPath } from "@/lib/wsl-paths";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { fetchImageAttachment, imageMimeFor } from "@/lib/file-attach";

interface DirEntry {
  readonly name: string;
  readonly isDir: boolean;
}

interface Props {
  cwd: string | null;
  onClose(): void;
  onInsertPath(path: string): void;
  onAttachImage(image: { name: string; data: string; mimeType: string }): void;
}



/**
 * Single Plus-button file browser (aicss AI Agent Input reference). Lists the
 * server filesystem under the unified file policy: directories descend,
 * images attach through the normal image flow, every other file inserts its
 * absolute path — non-image contents are never uploaded.
 */
export function AiliFilePicker({ cwd, onClose, onInsertPath, onAttachImage }: Props) {
  const [home, setHome] = useState<string | null>(null);
  const [windowsMounts, setWindowsMounts] = useState<readonly string[]>([]);
  const [dir, setDir] = useState<string>(cwd ?? "");
  const [entries, setEntries] = useState<readonly DirEntry[]>([]);
  const [address, setAddress] = useState<string>(cwd ?? "");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyName, setBusyName] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/aili/env", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body: { home?: string; windowsMounts?: string[] } | undefined) => {
        if (cancelled || !body) return;
        setHome(typeof body.home === "string" ? body.home : null);
        setWindowsMounts(Array.isArray(body.windowsMounts) ? body.windowsMounts : []);
        if (!cwd && typeof body.home === "string") {
          setDir(body.home);
          setAddress(body.home);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [cwd]);

  const loadDir = useCallback(async (target: string) => {
    const trimmed = target.trim().replace(/\/+$/, "") || "/";
    setLoading(true);
    setError(null);
    setFilter("");
    try {
      const response = await fetch(`/api/files/${encodeFilePathForApi(trimmed)}?type=list`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      setDir(typeof body.path === "string" ? body.path : trimmed);
      setAddress(typeof body.path === "string" ? body.path : trimmed);
      setEntries(Array.isArray(body.entries) ? body.entries : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dir) void loadDir(dir);
  }, [dir, loadDir]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onEsc = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  const navigate = useCallback(async (target: string) => {
    const env = await fetchWslEnv();
    const normalized = normalizeWindowsPath(target, env) ?? target;
    await loadDir(normalized);
  }, [loadDir]);

  const parent = useMemo(() => {
    if (dir === "/" || !dir) return null;
    const cut = dir.lastIndexOf("/");
    return cut <= 0 ? "/" : dir.slice(0, cut);
  }, [dir]);

  const visible = useMemo(() => {
    if (!filter.trim()) return entries;
    const mapped: FileIndexEntry[] = entries.map((entry) => ({ path: entry.name, isDir: entry.isDir }));
    const matched = new Set(filterFileEntries(mapped, filter.trim()).map((entry) => entry.path));
    return entries.filter((entry) => matched.has(entry.name));
  }, [entries, filter]);

  const selectFile = useCallback(async (entry: DirEntry) => {
    if (busyName) return;
    const absolute = `${dir}/${entry.name}`;
    const mime = imageMimeFor(entry.name);
    if (!mime) {
      onInsertPath(absolute);
      onClose();
      return;
    }
    setBusyName(entry.name);
    setError(null);
    try {
      const fetched = await fetchImageAttachment(absolute);
      if ("error" in fetched) {
        if (fetched.error.includes("exceeds")) {
          onInsertPath(absolute);
          onClose();
          return;
        }
        throw new Error(fetched.error);
      }
      onAttachImage(fetched);
    } catch (attachError) {
      setError(attachError instanceof Error ? attachError.message : String(attachError));
    } finally {
      setBusyName(null);
    }
  }, [busyName, dir, onAttachImage, onClose, onInsertPath]);

  return (
    <div className="aili-picker" ref={ref} role="dialog" aria-label="Insert file">
      <div className="aili-picker-head">
        <button type="button" className="aili-picker-up" disabled={!parent || loading} onClick={() => parent && void navigate(parent)} title="Parent directory" aria-label="Parent directory">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
        <input
          className="aili-picker-address"
          value={address}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void navigate(address);
            }
          }}
          placeholder="/absolute/path — Enter to open, paste Windows paths to convert"
          aria-label="Directory path"
        />
      </div>
      <div className="aili-picker-shortcuts">
        {cwd && <button type="button" onClick={() => void navigate(cwd)}>CWD</button>}
        {home && <button type="button" onClick={() => void navigate(home)}>Home</button>}
        {windowsMounts.map((mount) => (
          <button key={mount} type="button" onClick={() => void navigate(mount)} title={mount}>
            Windows {mount.slice("/mnt/".length).toUpperCase()}:
          </button>
        ))}
      </div>
      <input
        className="aili-picker-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter…"
        aria-label="Filter files"
        autoFocus
      />
      <div className="aili-picker-list">
        {loading && <p className="aili-picker-empty">Loading…</p>}
        {!loading && error && <p className="aili-picker-error" role="alert">{error}</p>}
        {!loading && !error && visible.length === 0 && <p className="aili-picker-empty">Empty directory</p>}
        {!loading && visible.map((entry) => (
          <button
            key={entry.name}
            type="button"
            className="aili-picker-row"
            disabled={busyName !== null}
            data-busy={busyName === entry.name || undefined}
            onClick={() => void (entry.isDir ? navigate(`${dir}/${entry.name}`) : selectFile(entry))}
            title={entry.isDir ? `Open ${entry.name}` : imageMimeFor(entry.name) ? `Attach ${entry.name} as image` : `Insert ${dir}/${entry.name}`}
          >
            <span className="aili-picker-icon">{entry.isDir ? <FolderIcon size={14} /> : getFileIcon(entry.name, 14)}</span>
            <span className="aili-picker-name">{entry.name}</span>
            {!entry.isDir && imageMimeFor(entry.name) && <span className="aili-picker-kind">image</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
