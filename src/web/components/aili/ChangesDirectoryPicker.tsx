"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

interface BrowsableDirectory {
  readonly name: string;
  readonly path: string;
}

interface BrowseResponse {
  readonly path?: string;
  readonly parentPath?: string | null;
  readonly directories?: readonly BrowsableDirectory[];
}

interface Props {
  /** Directory the browser opens in; null starts at the server home. */
  readonly initialDir: string | null;
  onChoose(path: string): void;
  onClose(): void;
}

/**
 * Standalone directory chooser for the changes page: walk the local
 * filesystem through /api/cwd/browse, or pop the native OS dialog via
 * /api/cwd/pick (Windows-native on WSL). Confirming re-validates the pick
 * through /api/cwd/validate — the established trust entry that allowlists
 * the directory server-side — before handing it back to the page.
 */
export function ChangesDirectoryPicker({ initialDir, onChoose, onClose }: Props) {
  const { t } = useI18n();
  const [dir, setDir] = useState(initialDir ?? "");
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly BrowsableDirectory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const loadDir = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = target ? `?path=${encodeURIComponent(target)}` : "";
      const response = await fetch(`/api/cwd/browse${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      const resolved = typeof body.path === "string" ? body.path : target;
      setDir(resolved);
      setParent(typeof body.parentPath === "string" ? body.parentPath : null);
      setEntries(Array.isArray(body.directories) ? body.directories : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDir(initialDir ?? "");
  }, [initialDir, loadDir]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  const confirm = useCallback(async (target: string) => {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/cwd/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: target }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) throw new Error(body?.error ?? `HTTP ${response.status}`);
      onChoose(typeof body.cwd === "string" ? body.cwd : target);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError));
    } finally {
      setBusy(false);
    }
  }, [busy, onChoose]);

  const pickNative = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/cwd/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialDirectory: dir || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      if (body?.status === "picked" && typeof body.path === "string") {
        await confirm(body.path);
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : String(pickError));
    } finally {
      setBusy(false);
    }
  }, [busy, confirm, dir]);

  return (
    <div className="aili-changes-picker-overlay">
      <div ref={cardRef} className="aili-changes-picker" role="dialog" aria-label={t("changes.pickTitle")}>
        <div className="aili-changes-picker-head">
          <button
            type="button"
            className="aili-changes-picker-up"
            disabled={!parent || loading || busy}
            onClick={() => parent && void loadDir(parent)}
            title={t("changes.pickParent")}
            aria-label={t("changes.pickParent")}
          >↑</button>
          <span className="aili-changes-picker-path" title={dir}>{dir || t("changes.pickHome")}</span>
          <button
            type="button"
            className="aili-changes-picker-native"
            disabled={busy}
            onClick={() => void pickNative()}
            title={t("changes.pickSystem")}
          >{t("changes.pickSystem")}</button>
        </div>
        <div className="aili-changes-picker-list">
          {loading && <p className="aili-changes-picker-empty">{t("changes.loading")}</p>}
          {!loading && entries.length === 0 && <p className="aili-changes-picker-empty">{t("changes.pickNoSubdirs")}</p>}
          {!loading && entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="aili-changes-picker-entry"
              disabled={busy}
              onClick={() => void loadDir(entry.path)}
              title={entry.path}
            >
              <span aria-hidden>▸</span>
              <span className="aili-changes-picker-name">{entry.name}</span>
            </button>
          ))}
        </div>
        {error && <p className="aili-changes-picker-error" role="alert">{error}</p>}
        <div className="aili-changes-picker-foot">
          <button type="button" className="aili-changes-picker-cancel" disabled={busy} onClick={onClose}>{t("changes.pickCancel")}</button>
          <button
            type="button"
            className="aili-changes-picker-confirm"
            disabled={!dir || loading || busy}
            onClick={() => void confirm(dir)}
          >{t("changes.pickConfirm")}</button>
        </div>
      </div>
    </div>
  );
}
