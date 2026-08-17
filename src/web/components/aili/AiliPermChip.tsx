"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PermStatusView } from "@/lib/aili-status";

interface PermMode {
  readonly key: string;
  readonly label: string;
}

const FALLBACK_MODES: readonly PermMode[] = [
  { key: "default", label: "Default" },
  { key: "plan", label: "Plan" },
  { key: "build", label: "Build" },
  { key: "yolo", label: "YOLO" },
];

export function AiliPermChip({ status, onRunCommand, onSwitchMode, disabled, sessionId }: {
  status: PermStatusView | undefined;
  onRunCommand: (command: string) => void;
  /** Preferred direct switch path: invokes the /perm handler without the prompt pipeline. */
  onSwitchMode?: (mode: string) => void;
  disabled: boolean;
  sessionId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [modes, setModes] = useState<readonly PermMode[]>(FALLBACK_MODES);
  const [cycleOrder, setCycleOrder] = useState<readonly string[]>(FALLBACK_MODES.map((mode) => mode.key));
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const [defaultKey, setDefaultKey] = useState<string | null>(null);
  const [optimisticKey, setOptimisticKey] = useState<string | null>(null);
  const optimisticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/aili/perm-modes", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body) => {
        if (cancelled || !Array.isArray(body?.modes)) return;
        setModes(body.modes.map((mode: PermMode) => ({ key: mode.key, label: mode.label })));
        if (Array.isArray(body?.cycleOrder) && body.cycleOrder.length > 0) setCycleOrder(body.cycleOrder.map(String));
        if (typeof body?.defaultMode === "string") setDefaultKey(body.defaultMode || null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Journal seed: display the session's last recorded mode until the
  // extension reports its live status. Deduplicated so an on-demand resolve
  // (cycling before anything is known) joins the in-flight request.
  const seedRequestRef = useRef<Promise<void> | null>(null);
  const refreshSeed = useCallback((): Promise<void> => {
    if (!sessionId) return Promise.resolve();
    if (!seedRequestRef.current) {
      seedRequestRef.current = fetch(`/api/aili/perm-mode?session=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((body) => {
          if (typeof body?.mode === "string") setSeedKey(body.mode || null);
        })
        .catch(() => undefined)
        .finally(() => { seedRequestRef.current = null; });
    }
    return seedRequestRef.current;
  }, [sessionId]);

  useEffect(() => {
    if (status?.label || seedKey !== null) return;
    void refreshSeed();
  }, [status?.label, seedKey, refreshSeed]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const statusKey = useMemo(() => {
    if (!status) return undefined;
    return modes.find((mode) => mode.label.toLowerCase() === status.label.toLowerCase())?.key;
  }, [modes, status]);

  // Extension status is authoritative; optimistic and journal values only
  // cover the gap before a status arrives or reconciles.
  useEffect(() => {
    if (statusKey && optimisticKey === statusKey) {
      setOptimisticKey(null);
      if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    }
  }, [statusKey, optimisticKey]);

  const currentKey = optimisticKey ?? statusKey ?? seedKey ?? defaultKey ?? undefined;
  const currentLabel = currentKey ? modes.find((mode) => mode.key === currentKey)?.label : undefined;

  const applyMode = (key: string) => {
    setOptimisticKey(key);
    if (optimisticTimer.current) clearTimeout(optimisticTimer.current);
    optimisticTimer.current = setTimeout(() => setOptimisticKey(null), 8_000);
    if (onSwitchMode) onSwitchMode(key);
    else onRunCommand(`/perm ${key}`);
  };

  // Direct-feel cycling like the TUI's alt+m: compute the next entry from the
  // cycle order and switch immediately (optimistic display, no transcript echo
  // — suppression lives in ChatWindow's command path).
  useEffect(() => {
    const onCycle = () => {
      if (disabled) return;
      const order = cycleOrder.filter((key) => modes.some((mode) => mode.key === key));
      if (order.length === 0) return;
      if (!currentKey) {
        // Mode not resolved yet (session just opened): resolve it first instead
        // of guessing the first cycle entry, then let the next press cycle.
        void refreshSeed();
        return;
      }
      const index = order.indexOf(currentKey);
      applyMode(order[(index + 1) % order.length]!);
    };
    window.addEventListener("aili:mode:cycle", onCycle);
    return () => window.removeEventListener("aili:mode:cycle", onCycle);
  });

  const pick = (key: string) => {
    setOpen(false);
    if (!disabled && key !== currentKey) applyMode(key);
  };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((value) => !value)}
        disabled={disabled}
        title={status ? status.raw : currentLabel ? `Permission mode: ${currentLabel}` : "Permission mode"}
        aria-label="Permission mode"
        aria-expanded={open}
        className="aili-chip"
        data-tone={status?.sandboxWarning ? "warn" : "ok"}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="aili-chip-label">{currentLabel ?? status?.label ?? "Mode"}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg>
      </button>
      {open && (
        <div className="aili-menu" role="menu">
          {modes.map((mode) => (
            <button key={mode.key} type="button" role="menuitem" className="aili-menu-item" data-active={mode.key === currentKey} onClick={() => pick(mode.key)}>
              <span style={{ width: 10, flexShrink: 0 }}>{mode.key === currentKey ? "✓" : ""}</span>
              <span style={{ flex: 1 }}>{mode.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
