/**
 * AILI web keybinds — opencode-style configurable shortcuts.
 * Action id → one or more key strings ("alt+m"), "none" disables the action.
 * Persisted server-side under the Pi agent directory; cached in localStorage.
 */

export interface WebKeybinds {
  readonly [action: string]: readonly string[];
}

export const WEB_KEYBIND_ACTIONS = ["mode.cycle", "changes.open", "panel.btw"] as const;
export type WebKeybindAction = (typeof WEB_KEYBIND_ACTIONS)[number];

export const WEB_KEYBIND_ACTION_LABELS: Readonly<Record<WebKeybindAction, string>> = {
  "mode.cycle": "Cycle permission mode",
  "changes.open": "Open changes inspector",
  "panel.btw": "Open BTW side thread",
};

export const DEFAULT_WEB_KEYBINDS: WebKeybinds = Object.freeze({
  "mode.cycle": ["alt+m"],
  "changes.open": ["alt+d"],
  "panel.btw": [],
});

const KEY_PATTERN = /^(?:ctrl|alt|shift|meta)(?:\+(?:ctrl|alt|shift|meta))*\+[a-z0-9]$/i;

/** Returns the normalized binding or a bounded error naming the entry. */
export function normalizeKeybinding(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "none") return "none";
  if (!KEY_PATTERN.test(trimmed)) return undefined;
  const parts = trimmed.split("+");
  const key = parts.pop()!;
  const order = { ctrl: 0, alt: 1, shift: 2, meta: 3 } as const;
  return [...new Set(parts)].sort((a, b) => order[a as keyof typeof order] - order[b as keyof typeof order]).concat(key).join("+");
}

/** Per-entry validation: invalid entries fall back to defaults individually. */
export function mergeKeybinds(raw: unknown): WebKeybinds {
  const merged: Record<string, string[]> = {};
  for (const [action, defaults] of Object.entries(DEFAULT_WEB_KEYBINDS)) merged[action] = [...defaults];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [action, value] of Object.entries(raw)) {
      if (!WEB_KEYBIND_ACTIONS.includes(action as WebKeybindAction)) continue;
      const candidates = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
      const normalized = candidates.map(String).map(normalizeKeybinding).filter((item): item is string => Boolean(item));
      merged[action] = normalized.includes("none") ? ["none"] : normalized.filter((item) => item !== "none");
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(merged).map(([action, keys]) => [action, Object.freeze(keys)])));
}

/** KeyboardEvent → normalized key string using the same grammar. */
export function eventToBinding(event: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; key: string }): string | undefined {
  const key = event.key.trim().toLowerCase();
  if (!/^[a-z0-9]$/.test(key)) return undefined;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("meta");
  if (parts.length === 0) return undefined;
  return [...parts, key].join("+");
}

export function isTextInput(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const tag = (target as HTMLElement).tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || (target as HTMLElement).isContentEditable;
}

export function actionForBinding(keybinds: WebKeybinds, binding: string | undefined): WebKeybindAction | undefined {
  if (!binding) return undefined;
  for (const action of WEB_KEYBIND_ACTIONS) {
    if (keybinds[action]?.includes(binding)) return action;
  }
  return undefined;
}

export async function fetchWebKeybinds(): Promise<WebKeybinds> {
  try {
    const response = await fetch("/api/aili/keybinds", { cache: "no-store" });
    if (!response.ok) return mergeKeybinds(null);
    return mergeKeybinds(await response.json());
  } catch {
    const cached = globalThis.localStorage?.getItem("aili-web-keybinds");
    return mergeKeybinds(cached ? JSON.parse(cached) : null);
  }
}

export async function saveWebKeybinds(next: WebKeybinds): Promise<WebKeybinds> {
  const response = await fetch("/api/aili/keybinds", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(next),
  });
  if (!response.ok) throw new Error(`keybind save failed (HTTP ${response.status})`);
  const merged = mergeKeybinds(await response.json());
  globalThis.localStorage?.setItem("aili-web-keybinds", JSON.stringify(merged));
  return merged;
}
