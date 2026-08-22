import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ApiTelemetrySnapshot } from "../../src/runtime/telemetry/types.js";

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
  telemetry?: ApiTelemetrySnapshot;
}

/**
 * Footer tone levels mapped by the extension host onto current theme semantic
 * colors only — no raw RGB ever appears in this module.
 */
export type FooterTone = "primary" | "secondary" | "muted" | "warning" | "alert";

export interface FooterSegment {
  readonly text: string;
  readonly tone: FooterTone;
}

/** One rendered footer line: colored segments whose text joins to `text`. */
export interface FooterLineView {
  readonly segments: readonly FooterSegment[];
  readonly text: string;
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

function modelSegments(snapshot: NativeFooterSnapshot): FooterSegment[] {
  const model = plainDisplayText(snapshot.model) ?? "no-model";
  const provider = plainDisplayText(snapshot.provider);
  const identity = provider ? `${provider}/${model}` : model;
  const thinking = plainDisplayText(snapshot.thinking) ?? "off";
  return [
    { text: identity, tone: "primary" },
    { text: thinking, tone: "secondary" },
  ];
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

/** Context occupancy percent; undefined when usage is not measurable. */
export function contextPercent(tokens: unknown, contextWindow: unknown): number | undefined {
  if (!isTokenCount(tokens) || !isContextWindow(contextWindow)) return undefined;
  return (tokens / contextWindow) * 100;
}

/** Compact occupancy label ("17k/272k (6%)") mirroring the web top-bar format. */
export function contextTokenLabel(tokens: unknown, contextWindow: unknown): string | undefined {
  if (!isTokenCount(tokens) || !isContextWindow(contextWindow)) return undefined;
  return `${formatTokenCount(tokens)}/${formatTokenCount(contextWindow)} (${Math.floor((tokens / contextWindow) * 100)}%)`;
}

/** 70%/90% occupancy thresholds escalate to warning/alert tones. */
export function contextTone(tokens: unknown, contextWindow: unknown): FooterTone {
  const percent = contextPercent(tokens, contextWindow);
  if (percent === undefined) return "secondary";
  if (percent >= 90) return "alert";
  if (percent >= 70) return "warning";
  return "secondary";
}

function percentOf(label: string | undefined): number | undefined {
  const match = label?.match(/(\d{1,3})%/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : undefined;
}

function quotaTone(label: string | undefined): FooterTone {
  const percent = percentOf(label);
  if (percent === undefined) return "muted";
  if (percent >= 90) return "alert";
  if (percent >= 70) return "warning";
  return "muted";
}

function formatDuration(durationMs: number): string {
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

/**
 * Speed state machine label: live 3s-window speed while streaming, average
 * speed plus duration briefly after completion, nothing once idle again.
 */
export function speedLabel(telemetry: ApiTelemetrySnapshot | undefined): string | undefined {
  if (!telemetry) return undefined;
  if (telemetry.status === "starting" || telemetry.status === "streaming") {
    return telemetry.currentTokensPerSecond !== undefined
      ? `${Math.round(telemetry.currentTokensPerSecond)} t/s`
      : undefined;
  }
  if (telemetry.status === "completed") {
    if (telemetry.averageTokensPerSecond === undefined) return undefined;
    const parts = [
      `${Math.round(telemetry.averageTokensPerSecond)} avg`,
      ...(telemetry.durationMs !== undefined ? [formatDuration(telemetry.durationMs)] : []),
    ];
    return parts.join(" · ");
  }
  return undefined;
}

interface FitPlan {
  readonly separator: string;
  /** Cell budget per field; a field may be shorter than its budget. */
  readonly widths: number[];
  /** Set when only one field can survive at this width. */
  readonly singleIndex?: number;
}

/**
 * Plan how peer fields share a too-narrow cell budget. Short fields are
 * completed first (for example context usage or the clock), then the remaining
 * field receives the available cells.
 */
function planFit(values: readonly string[], width: number, preferEnd = false): FitPlan {
  if (values.length === 1) return { separator: " · ", widths: [width] };

  let separator = " · ";
  let separatorWidth = visibleWidth(separator);
  if (separatorWidth * (values.length - 1) + values.length > width) {
    separator = "·";
    separatorWidth = visibleWidth(separator);
  }
  if (separatorWidth * (values.length - 1) + values.length > width) {
    const singleIndex = preferEnd ? values.length - 1 : 0;
    return { separator, widths: values.map(() => 0), singleIndex };
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

  return { separator, widths };
}

function fitSegments(values: readonly string[], width: number, preferEnd = false): string {
  if (width <= 0 || values.length === 0) return "";
  if (visibleWidth(joinSegments(values)) <= width) return joinSegments(values);
  const plan = planFit(values, width, preferEnd);
  if (plan.singleIndex !== undefined) return truncateCell(values[plan.singleIndex]!, width);
  return joinSegments(values.map((value, index) => truncateCell(value, plan.widths[index]!)), plan.separator);
}

/** Fit colored segments with the same sharing plan `fitSegments` uses for text. */
function fitSegmentList(segments: readonly FooterSegment[], width: number, preferEnd = false): FooterSegment[] {
  if (width <= 0 || segments.length === 0) return [];
  const values = segments.map((segment) => segment.text);
  if (visibleWidth(joinSegments(values)) <= width) return [...segments];
  const plan = planFit(values, width, preferEnd);
  if (plan.singleIndex !== undefined) {
    const survivor = segments[plan.singleIndex]!;
    return [{ text: truncateCell(survivor.text, width), tone: survivor.tone }];
  }
  return segments.map((segment, index) => ({ text: truncateCell(segment.text, plan.widths[index]!), tone: segment.tone }));
}

/** Truncate a colored segment row to a cell budget, dropping tailed segments. */
function truncateSegmentRow(segments: readonly FooterSegment[], width: number): FooterSegment[] {
  if (width <= 0) return [];
  let remaining = width;
  const kept: FooterSegment[] = [];
  for (const segment of segments) {
    const cellWidth = visibleWidth(segment.text);
    if (cellWidth <= remaining) {
      kept.push(segment);
      remaining -= cellWidth;
      continue;
    }
    kept.push({ text: truncateCell(segment.text, remaining), tone: segment.tone });
    return kept;
  }
  return kept;
}

function segmentsText(segments: readonly FooterSegment[], separator = " · "): string {
  return segments.map((segment) => segment.text).join(separator);
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

function mcpLabel(connected: unknown, enabled: unknown): string | undefined {
  if (!isCount(connected) || !isCount(enabled)) return undefined;
  return `MCP ${connected}/${enabled}`;
}

/** Interleave plain separator segments so `segments` join back to `text` byte-exactly. */
function withSeparators(segments: readonly FooterSegment[], separator: string): FooterSegment[] {
  if (segments.length === 0) return [];
  const out: FooterSegment[] = [];
  for (const segment of segments) {
    if (out.length > 0) out.push({ text: separator, tone: "muted" });
    out.push(segment);
  }
  return out;
}

function lineView(left: readonly FooterSegment[], right: readonly FooterSegment[], width: number, leftSeparator: string): FooterLineView {
  const leftText = segmentsText(left, leftSeparator);
  const rightText = segmentsText(right);
  const hasRight = rightText.length > 0;
  const gap = hasRight ? Math.max(0, width - visibleWidth(leftText) - visibleWidth(rightText)) : 0;
  const padding: FooterSegment = { text: " ".repeat(gap), tone: "muted" };
  const segments = hasRight
    ? [...withSeparators(left, leftSeparator), padding, ...withSeparators(right, " · ")]
    : withSeparators(left, leftSeparator);
  return { segments, text: alignSides(leftText, rightText, width) };
}

function renderPrimaryView(snapshot: NativeFooterSnapshot, width: number): FooterLineView {
  const leftSegments = modelSegments(snapshot);
  const left = segmentsText(leftSegments, " ");
  const context = contextTokenLabel(snapshot.contextTokens, snapshot.contextWindow);
  const quota = normalizeCodexQuota(snapshot.quota) ?? plainDisplayText(snapshot.quota);
  const requiredRight: FooterSegment[] = [
    ...(context ? [{ text: context, tone: contextTone(snapshot.contextTokens, snapshot.contextWindow) }] : []),
    ...(quota ? [{ text: quota, tone: quotaTone(quota) }] : []),
  ];
  const retry = plainDisplayText(snapshot.retry);
  const withRetry: FooterSegment[] = retry ? [...requiredRight, { text: retry, tone: "warning" }] : requiredRight;
  const completeRight = segmentsText(withRetry);

  // Retry is the first field sacrificed. It is never allowed to force a
  // required model, context, or quota field to truncate.
  if (retry && fitsAligned(left, completeRight, width)) {
    return lineView(leftSegments, withRetry, width, " ");
  }

  if (requiredRight.length === 0) return lineView(truncateSegmentRow(leftSegments, width), [], width, " ");
  const required = segmentsText(requiredRight);
  if (fitsAligned(left, required, width)) return lineView(leftSegments, requiredRight, width, " ");
  if (width < 3) return lineView(truncateSegmentRow(leftSegments, width), [], width, " ");

  const naturalRightBudget = width - visibleWidth(left) - 1;
  const rightBudget = Math.min(
    visibleWidth(required),
    width - 2,
    Math.max(1, naturalRightBudget, Math.floor(width * 0.45)),
  );
  const fittedRight = fitSegmentList(requiredRight, rightBudget);
  const leftBudget = Math.max(1, width - visibleWidth(segmentsText(fittedRight)) - 1);
  const fittedLeft = truncateSegmentRow(leftSegments, leftBudget);
  return lineView(fittedLeft, fittedRight, width, " ");
}

function renderSecondaryView(snapshot: NativeFooterSnapshot, width: number): FooterLineView {
  const cwd = plainDisplayText(snapshot.cwd);
  const branch = plainDisplayText(snapshot.gitBranch);
  const permission = permissionModeLabel(snapshot.permissionMode);
  const mcp = mcpLabel(snapshot.mcpConnectedCount, snapshot.mcpEnabledCount);
  const clock = plainDisplayText(snapshot.clock);
  const speed = speedLabel(snapshot.telemetry);
  const rightSegments: FooterSegment[] = [
    ...(speed ? [{ text: speed, tone: "secondary" as const }] : []),
    ...(permission ? [{ text: permission, tone: "primary" as const }] : []),
    ...(mcp ? [{ text: mcp, tone: "muted" as const }] : []),
    ...(clock ? [{ text: clock, tone: "muted" as const }] : []),
  ];
  let leftSegments: FooterSegment[] = [
    ...(cwd ? [{ text: cwd, tone: "muted" as const }] : []),
    ...(branch ? [{ text: branch, tone: "secondary" as const }] : []),
  ];
  const right = segmentsText(rightSegments);

  // Branch is less important than cwd. Both are dropped before MCP/clock are
  // truncated so the live state remains visible at narrow terminal widths.
  while (right && leftSegments.length > 1 && !fitsAligned(segmentsText(leftSegments), right, width)) {
    // Drop less-important segments first; never drop the cwd itself — the
    // truncate fallback below keeps the project identity visible instead.
    leftSegments = leftSegments.slice(0, -1);
  }

  const left = segmentsText(leftSegments);
  if (fitsAligned(left, right, width)) return lineView(leftSegments, rightSegments, width, " · ");
  if (!right) return lineView(truncateSegmentRow(leftSegments, width), [], width, " · ");
  // Never drop the cwd identity entirely (user report 2026-08-20): truncate
  // it to whatever budget remains so the project stays visible at any width.
  const fittedRight = fitSegmentList(rightSegments, width, true);
  const leftBudget = width - visibleWidth(segmentsText(fittedRight)) - 1;
  if (leftBudget >= 1) {
    const view = lineView(truncateSegmentRow(leftSegments, leftBudget), fittedRight, width, " · ");
    if (visibleWidth(view.text) <= width) return view;
  }
  return lineView([], fittedRight, width, " · ");
}

export function renderNativeFooterView(snapshot: NativeFooterSnapshot, width: number): [FooterLineView, FooterLineView] {
  if (!Number.isFinite(width) || width <= 0) {
    return [{ segments: [], text: "" }, { segments: [], text: "" }];
  }
  const safeWidth = Math.floor(width);
  return [renderPrimaryView(snapshot, safeWidth), renderSecondaryView(snapshot, safeWidth)];
}

export function renderNativeFooter(snapshot: NativeFooterSnapshot, width: number): [string, string] {
  const [primary, secondary] = renderNativeFooterView(snapshot, width);
  return [primary.text, secondary.text];
}
