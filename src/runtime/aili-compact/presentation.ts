import { CACHE_HIT_RATE_TARGET, CACHE_MINIMUM_SAMPLES, type CacheTelemetry, type SessionCacheStats } from "./cache.js";

export { CACHE_HIT_RATE_TARGET };
export const MIN_CACHE_PANEL_COLUMNS = 80;
/** Pi's below-editor widget consumes a two-column horizontal inset. */
export const CACHE_PANEL_INSET_COLUMNS = 2;

export type CachePresentationStatus =
  | "eligible"
  | "below-target"
  | "insufficient-sample"
  | "cold"
  | "state-change"
  | "telemetry-unavailable";

export type CachePanelVisibility = "visible" | "disabled" | "narrow";

/** Numeric-only data needed to render the cache surfaces. */
export interface CachePresentationInput {
  session: SessionCacheStats;
  telemetry: CacheTelemetry;
  activeBlocks: number;
  panelEnabled: boolean;
  terminalColumns: number;
}

export interface CachePresentationDetails {
  title: string;
  lines: readonly string[];
}

export interface CachePanelPresentation {
  visibility: CachePanelVisibility;
  /** Stable content key; it changes only with displayed numeric metadata. */
  renderKey: string;
  lines: readonly string[];
}

/** Canonical cache presentation result for footer, overlay, and side-panel consumers. */
export interface CachePresentation {
  status: CachePresentationStatus;
  footer: string;
  overlay: CachePresentationDetails;
  panel: CachePanelPresentation;
}

/**
 * Builds bounded UI data from observed numeric telemetry only. Source messages,
 * prompts, tool output, and identifiers are intentionally not accepted here.
 */
export function presentCache(input: CachePresentationInput): CachePresentation {
  const status = classifyStatus(input.telemetry);
  const footer = footerText(input.session, status, input.telemetry);
  const lines = detailLines(input.session, status, input.telemetry, input.activeBlocks);
  const visibility = cacheWidgetVisibility(input.panelEnabled, input.terminalColumns);
  return {
    status,
    footer,
    overlay: { title: "AILI Compact 缓存", lines },
    panel: {
      visibility,
      renderKey: cacheNumericRenderKey(input.session, input.telemetry, input.activeBlocks),
      lines: visibility === "visible"
        ? sideBySidePanelLines(
          input.session,
          status,
          input.telemetry,
          input.activeBlocks,
          Math.max(1, input.terminalColumns - CACHE_PANEL_INSET_COLUMNS),
        )
        : [],
    },
  };
}

function classifyStatus(telemetry: CacheTelemetry): CachePresentationStatus {
  if (telemetry.hitRate !== undefined) {
    return telemetry.hitRate >= CACHE_HIT_RATE_TARGET ? "eligible" : "below-target";
  }
  if (telemetry.window.length > 0) return "insufficient-sample";
  if (telemetry.unavailable > 0) return "telemetry-unavailable";
  if (telemetry.ineligibleStateChange > 0) return "state-change";
  return "cold";
}

function footerText(session: SessionCacheStats, status: CachePresentationStatus, telemetry: CacheTelemetry): string {
  const sessionRate = session.hitRate === undefined ? "暂无" : `${formatRate(session.hitRate)}%`;
  return `缓存：当前 Session ${sessionRate}｜AILI ${stabilityLabel(status, telemetry)}`;
}

function sideBySidePanelLines(
  session: SessionCacheStats,
  status: CachePresentationStatus,
  telemetry: CacheTelemetry,
  activeBlocks: number,
  terminalColumns: number,
): readonly string[] {
  const sessionRate = session.hitRate === undefined ? "暂无" : `${formatRate(session.hitRate)}%`;
  const left = [
    "【当前 Session 缓存统计（当前分支）】",
    `命中率：${sessionRate}`,
    `模型响应：${formatCount(session.assistantResponses)} · 遥测不可用：${formatCount(session.telemetryUnavailable)}`,
    `普通输入：${formatCount(session.input)} · 输出：${formatCount(session.output)}`,
    `缓存读取：${formatCount(session.cacheRead)} · 缓存写入：${formatCount(session.cacheWrite)}`,
  ];
  const right = [
    "【AILI 重复请求缓存稳定性诊断】",
    stabilityOutcome(status, telemetry),
    `有效：${telemetry.eligible} · 冷启动：${telemetry.ineligibleCold}`,
    `状态变化：${telemetry.ineligibleStateChange} · 遥测不可用：${telemetry.unavailable}`,
    `活跃压缩块：${activeBlocks}`,
  ];
  return left.map((value, index) => alignColumns(value, right[index]!, terminalColumns));
}

function alignColumns(left: string, right: string, terminalColumns: number): string {
  const gap = Math.max(3, terminalColumns - cacheDisplayWidth(left) - cacheDisplayWidth(right));
  return `${left}${" ".repeat(gap)}${right}`;
}

export function cacheDisplayWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (/\p{Mark}/u.test(character)) continue;
    width += point >= 0x1100 && (
      point <= 0x115f
      || point === 0x2329 || point === 0x232a
      || (point >= 0x2e80 && point <= 0xa4cf && point !== 0x303f)
      || (point >= 0xac00 && point <= 0xd7a3)
      || (point >= 0xf900 && point <= 0xfaff)
      || (point >= 0xfe10 && point <= 0xfe19)
      || (point >= 0xfe30 && point <= 0xfe6f)
      || (point >= 0xff00 && point <= 0xff60)
      || (point >= 0xffe0 && point <= 0xffe6)
      || (point >= 0x1f300 && point <= 0x1faff)
    ) ? 2 : 1;
  }
  return width;
}

function stabilityLabel(status: CachePresentationStatus, telemetry: CacheTelemetry): string {
  switch (status) {
    case "eligible": return `${formatRate(telemetry.hitRate)}% 正常`;
    case "below-target": return `${formatRate(telemetry.hitRate)}% 警告`;
    case "insufficient-sample": return `样本不足 ${telemetry.window.length}/${CACHE_MINIMUM_SAMPLES}`;
    case "cold": return "冷启动";
    case "state-change": return "状态变化";
    case "telemetry-unavailable": return "遥测不可用";
  }
}

function stabilityOutcome(status: CachePresentationStatus, telemetry: CacheTelemetry): string {
  const rate = telemetry.hitRate === undefined ? "暂无" : `${formatRate(telemetry.hitRate)}%`;
  const unavailableReason = status === "cold"
    ? "冷启动"
    : status === "state-change"
      ? "状态变化"
      : "遥测不可用";
  return status === "eligible"
    ? `有效请求滚动命中率：${rate}（目标 ≥ ${CACHE_HIT_RATE_TARGET.toFixed(1)}%）`
    : status === "below-target"
      ? `有效请求滚动命中率：${rate}（低于目标 ${CACHE_HIT_RATE_TARGET.toFixed(1)}%）`
      : status === "insufficient-sample"
        ? `有效请求滚动命中率：暂无（样本不足 ${telemetry.window.length}/${CACHE_MINIMUM_SAMPLES}）`
        : `有效请求滚动命中率：暂无（${unavailableReason}）`;
}

function detailLines(session: SessionCacheStats, status: CachePresentationStatus, telemetry: CacheTelemetry, activeBlocks: number): readonly string[] {
  const outcome = stabilityOutcome(status, telemetry);
  const sessionRate = session.hitRate === undefined ? "暂无" : `${formatRate(session.hitRate)}%`;
  return [
    "【当前 Session 缓存统计（当前分支）】",
    `命中率：${sessionRate}`,
    `模型响应：${formatCount(session.assistantResponses)} · 遥测不可用：${formatCount(session.telemetryUnavailable)}`,
    `普通输入：${formatCount(session.input)} · 输出：${formatCount(session.output)}`,
    `缓存读取：${formatCount(session.cacheRead)} · 缓存写入：${formatCount(session.cacheWrite)}`,
    "【AILI 重复请求缓存稳定性诊断】",
    outcome,
    `有效：${telemetry.eligible} · 冷启动：${telemetry.ineligibleCold} · 状态变化：${telemetry.ineligibleStateChange} · 遥测不可用：${telemetry.unavailable}`,
    `活跃压缩块：${activeBlocks}`,
  ];
}

export function cacheWidgetVisibility(enabled: boolean, terminalColumns: number): CachePanelVisibility {
  if (!enabled) return "disabled";
  return terminalColumns >= MIN_CACHE_PANEL_COLUMNS ? "visible" : "narrow";
}

/** Numeric-only key used by runtime widgets to suppress non-numeric rerenders. */
export function cacheNumericRenderKey(session: SessionCacheStats, telemetry: CacheTelemetry, activeBlocks: number): string {
  return [
    activeBlocks,
    session.assistantResponses,
    session.telemetryUnavailable,
    session.input,
    session.output,
    session.cacheRead,
    session.cacheWrite,
    session.hitRate ?? "unavailable",
    telemetry.eligible,
    telemetry.window.length,
    telemetry.ineligibleCold,
    telemetry.ineligibleStateChange,
    telemetry.unavailable,
    telemetry.cacheRead,
    telemetry.cacheWrite,
    telemetry.input,
    telemetry.hitRate ?? "unavailable",
  ].join(":");
}

export function shouldRerenderCacheWidget(previousKey: string | undefined, session: SessionCacheStats, telemetry: CacheTelemetry, activeBlocks: number): boolean {
  return previousKey !== cacheNumericRenderKey(session, telemetry, activeBlocks);
}

/** Responsive, non-interactive widget output. The input type cannot carry bodies. */
export function renderCacheWidget(input: Omit<CachePresentationInput, "terminalColumns">, width: number): readonly string[] {
  if (cacheWidgetVisibility(input.panelEnabled, width) !== "visible") return [];
  return presentCache({ ...input, terminalColumns: width }).panel.lines;
}

function formatRate(rate: number | undefined): string {
  return (rate ?? 0).toFixed(1);
}

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}
