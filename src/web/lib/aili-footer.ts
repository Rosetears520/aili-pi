import { stripAnsi } from "@/lib/ansi";

/**
 * Shared context/quota label rules for the AILI web surfaces. The codex quota
 * normalization mirrors the TUI footer rule in extensions/footer/layout.ts and
 * must stay in lock-step with that file.
 */

function plainDisplayText(text: string): string {
  return stripAnsi(text)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Locale-independent k/M compaction matching the top-bar strip style ("83k", "2.9M"). */
export function formatCompactTokens(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

/**
 * Context capacity label ("83k/1M (8.3%)") used by the top-bar strip and
 * session panel. Falls back to "?/window" when occupancy is not yet estimated.
 */
export function contextCapacityLabel(
  tokens: number | null | undefined,
  contextWindow: number | null | undefined,
  percent: number | null | undefined,
): string | undefined {
  if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow) || contextWindow <= 0) return undefined;
  const windowText = formatCompactTokens(contextWindow);
  if (percent === null || percent === undefined || typeof tokens !== "number" || !Number.isFinite(tokens)) {
    return `?/${windowText}`;
  }
  return `${formatCompactTokens(tokens)}/${windowText} (${percent.toFixed(1)}%)`;
}

/**
 * Normalize the codex subscription quota segment the way the TUI footer does:
 * "5h 42% 03:45PM (22/08)" → "codex 42% 08/22 15:45". Returns undefined for
 * any other quota text, which is exactly the "only show on codex models" gate:
 * non-codex providers never emit this segment shape.
 */
export function normalizeCodexQuotaText(text: string): string | undefined {
  const plain = plainDisplayText(text);
  const match = plain.match(/(?:^| · )5h\s+(\d{1,3})%\s+(\d{1,2}):(\d{2})(AM|PM)\s+\((\d{2})\/(\d{2})\)/i);
  if (!match) return undefined;
  const percentage = Number(match[1]);
  const hour12 = Number(match[2]);
  const minute = Number(match[3]);
  const day = Number(match[5]);
  const month = Number(match[6]);
  if (percentage > 100 || hour12 < 1 || hour12 > 12 || minute > 59 || day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  let hour = hour12 % 12;
  if (match[4]?.toUpperCase() === "PM") hour += 12;
  return `codex ${percentage}% ${match[6]}/${match[5]} ${String(hour).padStart(2, "0")}:${match[3]}`;
}
