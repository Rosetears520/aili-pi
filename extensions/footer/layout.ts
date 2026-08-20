import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface NativeFooterSnapshot {
  provider?: string;
  model?: string;
  thinking?: string;
  quota?: string;
  permissionMode?: string;
  retry?: string;
  clock?: string;
  cwd?: string;
  gitBranch?: string;
  contextTokens?: number | null;
  contextWindow?: number | null;
  mcpConnectedCount?: number | null;
  mcpEnabledCount?: number | null;
}

export function plainDisplayText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function modelLabel(snapshot: NativeFooterSnapshot): string {
  const model = plainDisplayText(snapshot.model) ?? "no-model";
  const provider = plainDisplayText(snapshot.provider);
  const identity = provider ? `${provider}/${model}` : model;
  return `${identity} ${plainDisplayText(snapshot.thinking) ?? "off"}`;
}

export function normalizeCodexQuota(value: unknown): string | undefined {
  const text = plainDisplayText(value);
  const match = text?.match(/(?:^| · )5h\s+(\d{1,3})%\s+(\d{1,2}):(\d{2})(AM|PM)\s+\((\d{2})\/(\d{2})\)/i);
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

export function permissionModeLabel(value: unknown): string | undefined {
  const text = plainDisplayText(value);
  return text?.match(/^(Default|Plan|Build|YOLO)\b/)?.[1];
}

function truncateCell(value: string, width: number): string {
  if (width <= 0) return "";
  return truncateToWidth(value, width, width > 1 ? "…" : "");
}

function joinSegments(values: readonly string[], separator = " · "): string {
  return values.join(separator);
}

/**
 * Fit required peer fields without dropping one merely because a neighboring
 * field is long. Short fields are completed first (for example context usage
 * or the clock), then the remaining field receives the available cells.
 */
function fitSegments(values: readonly string[], width: number, preferEnd = false): string {
  if (width <= 0 || values.length === 0) return "";
  const complete = joinSegments(values);
  if (visibleWidth(complete) <= width) return complete;
  if (values.length === 1) return truncateCell(values[0], width);

  let separator = " · ";
  let separatorWidth = visibleWidth(separator);
  if (separatorWidth * (values.length - 1) + values.length > width) {
    separator = "·";
    separatorWidth = visibleWidth(separator);
  }
  if (separatorWidth * (values.length - 1) + values.length > width) {
    const value = preferEnd ? values.at(-1)! : values[0];
    return truncateCell(value, width);
  }

  const widths = values.map(() => 1);
  let remaining = width - separatorWidth * (values.length - 1) - values.length;
  const directionalOrder = values.map((_value, index) => index);
  if (preferEnd) directionalOrder.reverse();

  // Give every field up to three cells before spending the rest on completion.
  for (let target = 2; target <= 3 && remaining > 0; target++) {
    for (const index of directionalOrder) {
      if (remaining <= 0) break;
      if (visibleWidth(values[index]) < target) continue;
      widths[index]++;
      remaining--;
    }
  }

  while (remaining > 0) {
    const candidates = directionalOrder
      .filter((index) => widths[index] < visibleWidth(values[index]))
      .sort((left, right) => {
        const leftNeed = visibleWidth(values[left]) - widths[left];
        const rightNeed = visibleWidth(values[right]) - widths[right];
        return leftNeed - rightNeed || directionalOrder.indexOf(left) - directionalOrder.indexOf(right);
      });
    if (candidates.length === 0) break;
    const index = candidates[0];
    const addition = Math.min(remaining, visibleWidth(values[index]) - widths[index]);
    widths[index] += addition;
    remaining -= addition;
  }

  return joinSegments(values.map((value, index) => truncateCell(value, widths[index])), separator);
}

function alignSides(left: string, right: string, width: number): string {
  if (!right) return truncateCell(left, width);
  if (!left) {
    const fitted = truncateCell(right, width);
    return `${" ".repeat(Math.max(0, width - visibleWidth(fitted)))}${fitted}`;
  }
  const gap = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
  return `${left}${" ".repeat(gap)}${right}`;
}

function fitsAligned(left: string, right: string, width: number): boolean {
  if (!left || !right) return visibleWidth(left || right) <= width;
  return visibleWidth(left) + 1 + visibleWidth(right) <= width;
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isContextWindow(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Format a token count compactly while retaining a useful fractional value below 10k. */
export function formatTokenCount(value: number): string {
  if (value < 1_000) return `${Math.round(value)}`;
  if (value < 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  if (value < 10_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  return `${Math.round(value / 1_000_000)}m`;
}

export function contextTokenLabel(tokens: unknown, contextWindow: unknown): string | undefined {
  if (!isTokenCount(tokens) || !isContextWindow(contextWindow)) return undefined;
  return `${formatTokenCount(tokens)}/${formatTokenCount(contextWindow)}`;
}

function mcpLabel(connected: unknown, enabled: unknown): string | undefined {
  if (!isCount(connected) || !isCount(enabled)) return undefined;
  return `MCP ${connected}/${enabled}`;
}

function renderPrimary(snapshot: NativeFooterSnapshot, width: number): string {
  const left = modelLabel(snapshot);
  const requiredRight = [
    contextTokenLabel(snapshot.contextTokens, snapshot.contextWindow),
    normalizeCodexQuota(snapshot.quota) ?? plainDisplayText(snapshot.quota),
  ].filter((value): value is string => Boolean(value));
  const retry = plainDisplayText(snapshot.retry);
  const withRetry = retry ? [...requiredRight, retry] : requiredRight;
  const completeRight = joinSegments(withRetry);

  // Retry is the first field sacrificed. It is never allowed to force a
  // required model, context, or quota field to truncate.
  if (retry && fitsAligned(left, completeRight, width)) return alignSides(left, completeRight, width);

  const required = joinSegments(requiredRight);
  if (!required) return truncateCell(left, width);
  if (fitsAligned(left, required, width)) return alignSides(left, required, width);
  if (width < 3) return truncateCell(left, width);

  const naturalRightBudget = width - visibleWidth(left) - 1;
  const rightBudget = Math.min(
    visibleWidth(required),
    width - 2,
    Math.max(1, naturalRightBudget, Math.floor(width * 0.45)),
  );
  const fittedRight = fitSegments(requiredRight, rightBudget);
  const leftBudget = Math.max(1, width - visibleWidth(fittedRight) - 1);
  const fittedLeft = truncateCell(left, leftBudget);
  return alignSides(fittedLeft, fittedRight, width);
}

function renderSecondary(snapshot: NativeFooterSnapshot, width: number): string {
  const cwd = plainDisplayText(snapshot.cwd);
  const branch = plainDisplayText(snapshot.gitBranch);
  const rightSegments = [
    permissionModeLabel(snapshot.permissionMode),
    mcpLabel(snapshot.mcpConnectedCount, snapshot.mcpEnabledCount),
    plainDisplayText(snapshot.clock),
  ].filter((value): value is string => Boolean(value));
  const right = joinSegments(rightSegments);
  const leftSegments = [cwd, branch].filter((value): value is string => Boolean(value));

  // Branch is less important than cwd. Both are dropped before MCP/clock are
  // truncated so the live state remains visible at narrow terminal widths.
  while (right && leftSegments.length > 1 && !fitsAligned(joinSegments(leftSegments), right, width)) {
    // Drop less-important segments first; never drop the cwd itself — the
    // truncate fallback below keeps the project identity visible instead.
    leftSegments.pop();
  }

  const left = joinSegments(leftSegments);
  if (fitsAligned(left, right, width)) return alignSides(left, right, width);
  if (!right) return truncateCell(left, width);
  // Never drop the cwd identity entirely (user report 2026-08-20): truncate
  // it to whatever budget remains so the project stays visible at any width.
  const fittedRight = fitSegments(rightSegments, width, true);
  const leftBudget = width - visibleWidth(fittedRight) - 1;
  if (leftBudget >= 1) {
    const withLeft = alignSides(truncateCell(left, leftBudget), fittedRight, width);
    if (visibleWidth(withLeft) <= width) return withLeft;
  }
  return alignSides("", fittedRight, width);
}

export function renderNativeFooter(snapshot: NativeFooterSnapshot, width: number): [string, string] {
  if (!Number.isFinite(width) || width <= 0) return ["", ""];
  const safeWidth = Math.floor(width);
  return [renderPrimary(snapshot, safeWidth), renderSecondary(snapshot, safeWidth)];
}
