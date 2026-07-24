import { existsSync, readFileSync } from "node:fs";

const LEGACY_THEME = "rem-cyberdeck";
const ROSE_THEME = "rose-cyberdeck";

/** Return non-mutating exact-token guidance for a legacy Pi theme setting. */
export function legacyRoseThemeGuidance(theme: unknown): string | undefined {
  if (typeof theme !== "string") return undefined;
  const parts = theme.split("/");
  if (!parts.some((part) => part === LEGACY_THEME)) return undefined;
  const replacement = parts.map((part) => part === LEGACY_THEME ? ROSE_THEME : part).join("/");
  return `Rose Cyberdeck renamed ${LEGACY_THEME} to ${ROSE_THEME}. Use /settings or edit settings.json: \"theme\": \"${replacement}\".`;
}

/** Read-only startup compatibility detector; malformed settings are intentionally silent. */
export function legacyRoseThemeGuidanceFromSettings(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed !== null && typeof parsed === "object" && "theme" in parsed
      ? legacyRoseThemeGuidance((parsed as { theme?: unknown }).theme)
      : undefined;
  } catch {
    return undefined;
  }
}
