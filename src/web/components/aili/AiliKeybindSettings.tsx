"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeKeybinding, saveWebKeybinds, WEB_KEYBIND_ACTIONS, WEB_KEYBIND_ACTION_LABELS, type WebKeybindAction, type WebKeybinds } from "@/lib/aili-keybinds";

export function AiliKeybindSettings({ keybinds, onChange }: {
  keybinds: WebKeybinds;
  onChange: (next: WebKeybinds) => void;
}) {
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState<WebKeybindAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Every close path MUST clear the capture state: a leaked capture state
  // keeps a window-level capture-phase keydown listener running invisibly
  // after the popover is gone, eating every keystroke on the page (the
  // terminal and composer included) until Esc happens to be pressed.
  const closeSettings = useCallback(() => {
    setOpen(false);
    setCapturing(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".aili-keybind-settings")) closeSettings();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, closeSettings]);

  const commit = useCallback(async (action: WebKeybindAction, binding: string | undefined) => {
    setCapturing(null);
    if (binding === undefined) { setError("Invalid or reserved combination"); return; }
    setError(null);
    const next: Record<string, string[]> = {};
    for (const key of WEB_KEYBIND_ACTIONS) next[key] = key === action ? (binding === "none" ? ["none"] : [binding]) : [...(keybinds[key] ?? [])];
    try {
      onChange(await saveWebKeybinds(next));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  }, [keybinds, onChange]);

  useEffect(() => {
    // The capture listener exists ONLY while the popover is open AND an
    // action is being captured; invalid input (plain letters, bare modifiers)
    // passes through untouched instead of being swallowed page-wide.
    if (!open || !capturing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setCapturing(null);
        return;
      }
      const parts: string[] = [];
      if (event.ctrlKey) parts.push("ctrl");
      if (event.altKey) parts.push("alt");
      if (event.shiftKey) parts.push("shift");
      if (event.metaKey) parts.push("meta");
      const key = event.key.trim().toLowerCase();
      if (!/^[a-z0-9]$/.test(key) || parts.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const normalized = normalizeKeybinding([...parts, key].join("+"));
      void commit(capturing, normalized);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, capturing, commit]);

  return (
    <div className="aili-keybind-settings" style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className="aili-icon-button"
        onClick={() => { if (open) closeSettings(); else setOpen(true); }}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
        </svg>
      </button>
      {open && (
        <div className="aili-menu aili-keybind-popover" role="dialog" aria-label="Keyboard shortcuts">
          {WEB_KEYBIND_ACTIONS.map((action) => {
            const keys = keybinds[action] ?? [];
            const binding = keys[0] === "none" ? "Disabled" : keys.length ? keys.join(", ") : "not set";
            return (
              <div key={action} className="aili-keybind-row">
                <span style={{ flex: 1 }}>{WEB_KEYBIND_ACTION_LABELS[action]}</span>
                <button
                  type="button"
                  className="aili-keybind-capture"
                  data-capturing={capturing === action}
                  onClick={() => { setError(null); setCapturing(action); }}
                >
                  {capturing === action ? "Press keys…" : binding}
                </button>
                <button
                  type="button"
                  className="aili-keybind-disable"
                  title={`Disable “${WEB_KEYBIND_ACTION_LABELS[action]}”`}
                  aria-label={`Disable “${WEB_KEYBIND_ACTION_LABELS[action]}”`}
                  disabled={keys[0] === "none"}
                  onClick={() => void commit(action, "none")}
                >
                  ⃠
                </button>
              </div>
            );
          })}
          {error && <p className="aili-keybind-error" role="alert">{error}</p>}
          <p className="aili-keybind-hint">Click a binding, press a combination (with a modifier). Esc cancels; the ⃠ button disables the shortcut.</p>
        </div>
      )}
    </div>
  );
}
