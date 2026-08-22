/**
 * Runtime-neutral API speed telemetry: the single implementation of output
 * token estimation and tok/s math shared by the TUI footer and the WebUI.
 * Pure TypeScript — no Node built-ins, no DOM — so the same module instance
 * semantics hold in the Pi extension host and in the browser bundle.
 *
 * Feeding contract: both surfaces observe the same assistant stream and call
 * `observeText` with the same accumulated text (see `streamEstimateText`), so
 * identical streams produce identical snapshots on every surface.
 */

import type { ApiTelemetrySnapshot, ApiTelemetryStatus } from "./types.js";

export type { ApiTelemetrySnapshot, ApiTelemetryStatus } from "./types.js";

/** Sliding window for the "current" speed reading. */
export const SPEED_WINDOW_MS = 3_000;

/** How long a completed reading stays visible before reverting to idle. */
export const COMPLETED_RETAIN_MS = 8_000;

/** Minimum observable span before a window speed is reported. */
const MIN_SPEED_SPAN_MS = 500;

// CJK chars ~1 token each (GLM/DeepSeek/GPT-o200k); other chars ~4 chars/token.
const CJK_PATTERN = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}\uac00-\ud7af]/u;

export function estimateTokens(text: string): number {
  let cjk = 0;
  let rest = 0;
  for (const ch of text) {
    if (CJK_PATTERN.test(ch)) cjk++;
    else rest++;
  }
  return cjk + rest / 4;
}

export interface TokenEstimateCacheEntry {
  text: string;
  tokens: number;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

export function estimateUpdatedTokens(previous: TokenEstimateCacheEntry | undefined, text: string): number {
  if (!previous || !text.startsWith(previous.text)) return estimateTokens(text);

  let baseTokens = previous.tokens;
  let suffixStart = previous.text.length;
  // A streamed delta can complete a surrogate pair that was counted as two
  // non-CJK code points in the previous update.
  if (
    suffixStart > 0
    && suffixStart < text.length
    && isHighSurrogate(previous.text.charCodeAt(suffixStart - 1))
    && isLowSurrogate(text.charCodeAt(suffixStart))
  ) {
    baseTokens -= 1 / 4;
    suffixStart--;
  }
  return baseTokens + estimateTokens(text.slice(suffixStart));
}

type EstimateBlock = unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Streamed text of one assistant content block. Tool-call arguments are
 * excluded: their partial shape differs between the pi-ai host and the web
 * wire projection, so counting them would break the "identical input on every
 * surface" contract.
 */
function estimateBlockText(block: EstimateBlock): string {
  if (!isRecord(block)) return "";
  if (block.type === "text" && typeof block.text === "string") return block.text;
  if (block.type === "thinking" && typeof block.thinking === "string") return block.thinking;
  return "";
}

interface WindowSample {
  readonly at: number;
  readonly cumulativeTokens: number;
}

export interface ApiTelemetryTrackerOptions {
  now?: () => number;
  windowMs?: number;
  completedRetainMs?: number;
}

/**
 * One streaming assistant message's telemetry. `begin` on message start,
 * `observeText` on every stream update (cheap; no render side effects),
 * `complete`/`fail` on message end. Snapshots are computed lazily on read.
 */
export class ApiTelemetryTracker {
  private readonly now: () => number;
  private readonly windowMs: number;
  private readonly completedRetainMs: number;
  private status: ApiTelemetryStatus = "idle";
  private startedAt: number | undefined;
  private firstTokenAt: number | undefined;
  private finishedAt: number | undefined;
  /** Per-block last-seen estimates; unchanged blocks are reused by reference. */
  private blockCaches: TokenEstimateCacheEntry[] = [];
  private outputTokens = 0;
  private usageBacked = false;
  private samples: WindowSample[] = [];

  public constructor(options: ApiTelemetryTrackerOptions = {}) {
    // Resolve the global clock lazily so test fake-timer installs apply.
    this.now = options.now ?? (() => Date.now());
    this.windowMs = options.windowMs ?? SPEED_WINDOW_MS;
    this.completedRetainMs = options.completedRetainMs ?? COMPLETED_RETAIN_MS;
  }

  public get streaming(): boolean {
    return this.status === "starting" || this.status === "streaming";
  }

  /** A new assistant message started streaming. */
  public begin(now = this.now()): void {
    this.status = "starting";
    this.startedAt = now;
    this.firstTokenAt = undefined;
    this.finishedAt = undefined;
    this.blockCaches = [];
    this.outputTokens = 0;
    this.usageBacked = false;
    this.samples = [];
  }

  /**
   * Accumulated assistant content blocks observed. Estimation is incremental
   * per block, so a stream update costs O(changed block), not O(message); no
   * render or IO is ever triggered from here.
   */
  public observeContent(content: readonly EstimateBlock[] | undefined | null, now = this.now()): void {
    if (!this.streaming) return;
    const nextCaches: TokenEstimateCacheEntry[] = [];
    let total = 0;
    if (Array.isArray(content)) {
      for (let index = 0; index < content.length; index++) {
        const text = estimateBlockText(content[index]!);
        const previous = index < this.blockCaches.length ? this.blockCaches[index] : undefined;
        // Unchanged blocks reuse their cache entry by reference (O(1)); only
        // the growing block pays for a prefix comparison over its own length.
        const entry = previous && previous.text === text
          ? previous
          : { text, tokens: estimateUpdatedTokens(previous, text) };
        nextCaches.push(entry);
        total += entry.tokens;
      }
    }
    this.blockCaches = nextCaches;
    if (total <= 0) return;
    if (this.firstTokenAt === undefined) {
      this.firstTokenAt = now;
      this.status = "streaming";
    }
    if (total === this.outputTokens) return;
    this.outputTokens = total;
    this.pushSample(now, total);
  }

  /** Final assistant message; `finalOutputTokens` is the provider usage count. */
  public complete(finalOutputTokens?: number, now = this.now()): void {
    if (!this.streaming) return;
    this.finishedAt = now;
    this.status = "completed";
    this.applyUsage(finalOutputTokens);
    this.pushSample(now, this.outputTokens);
  }

  public fail(now = this.now()): void {
    if (!this.streaming) return;
    this.finishedAt = now;
    this.status = "error";
    this.pushSample(now, this.outputTokens);
  }

  public reset(): void {
    this.status = "idle";
    this.startedAt = undefined;
    this.firstTokenAt = undefined;
    this.finishedAt = undefined;
    this.blockCaches = [];
    this.outputTokens = 0;
    this.usageBacked = false;
    this.samples = [];
  }

  public snapshot(now = this.now()): ApiTelemetrySnapshot {
    if (
      (this.status === "completed" || this.status === "error")
      && this.finishedAt !== undefined
      && now - this.finishedAt > this.completedRetainMs
    ) {
      return idleSnapshot();
    }
    if (this.status === "idle") return idleSnapshot();

    const finished = this.status === "completed" || this.status === "error";
    const end = finished ? this.finishedAt! : Math.max(now, this.startedAt ?? now);
    const durationMs = this.startedAt !== undefined ? Math.max(0, end - this.startedAt) : undefined;
    const averageTokensPerSecond = this.firstTokenAt !== undefined && end > this.firstTokenAt
      ? (this.outputTokens * 1_000) / (end - this.firstTokenAt)
      : undefined;
    return {
      status: this.status,
      ...(this.startedAt !== undefined ? { startedAt: this.startedAt } : {}),
      ...(this.firstTokenAt !== undefined ? { firstTokenAt: this.firstTokenAt } : {}),
      ...(this.finishedAt !== undefined ? { finishedAt: this.finishedAt } : {}),
      outputTokens: this.outputTokens,
      usageBacked: this.usageBacked,
      ...(this.streaming ? { currentTokensPerSecond: this.windowSpeed(now) } : {}),
      ...(averageTokensPerSecond !== undefined ? { averageTokensPerSecond } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(this.firstTokenAt !== undefined && this.startedAt !== undefined
        ? { ttftMs: Math.max(0, this.firstTokenAt - this.startedAt) }
        : {}),
    };
  }

  /**
   * Cheap change-detection signature for low-frequency UI refresh loops: two
   * equal signatures guarantee an identical footer rendering. Only values a
   * surface actually displays participate — live average speed drifts with
   * `now` but is never rendered while streaming.
   */
  public displaySignature(now = this.now()): string {
    const snapshot = this.snapshot(now);
    if (snapshot.status === "starting" || snapshot.status === "streaming") {
      const speed = snapshot.currentTokensPerSecond !== undefined
        ? Math.round(snapshot.currentTokensPerSecond)
        : "";
      return `${snapshot.status}\0${speed}`;
    }
    const average = snapshot.averageTokensPerSecond !== undefined
      ? Math.round(snapshot.averageTokensPerSecond)
      : "";
    const seconds = snapshot.durationMs !== undefined ? Math.floor(snapshot.durationMs / 1_000) : "";
    return `${snapshot.status}\0${average}\0${seconds}`;
  }

  /** True while a live or retained reading still needs periodic UI ticks. */
  public needsTick(now = this.now()): boolean {
    if (this.streaming) return true;
    if (this.status === "completed" || this.status === "error") {
      return this.finishedAt === undefined || now - this.finishedAt <= this.completedRetainMs;
    }
    return false;
  }

  private applyUsage(finalOutputTokens: number | undefined): void {
    if (typeof finalOutputTokens !== "number" || !Number.isFinite(finalOutputTokens) || finalOutputTokens <= 0) return;
    this.outputTokens = finalOutputTokens;
    this.usageBacked = true;
  }

  private pushSample(at: number, cumulativeTokens: number): void {
    const last = this.samples.at(-1);
    if (last && at <= last.at) {
      // Same-tick updates collapse into the newest cumulative value.
      this.samples[this.samples.length - 1] = { at: last.at, cumulativeTokens };
      return;
    }
    this.samples.push({ at, cumulativeTokens });
    this.prune(at);
  }

  /** Keep the newest sample at or before the window cutoff plus everything after it. */
  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    let keep = 0;
    while (keep + 1 < this.samples.length && this.samples[keep + 1]!.at <= cutoff) keep++;
    if (keep > 0) this.samples.splice(0, keep);
  }

  private windowSpeed(now: number): number | undefined {
    if (this.samples.length === 0) return undefined;
    const last = this.samples.at(-1)!;
    const cutoff = now - this.windowMs;
    if (last.at <= cutoff) return undefined;
    const windowStart = Math.max(cutoff, this.samples[0]!.at, this.firstTokenAt ?? now);
    const span = now - windowStart;
    if (span < MIN_SPEED_SPAN_MS) return undefined;
    // The sample at index 0 is the newest one at or before the cutoff (or the
    // very first sample ever), so its cumulative count is the window baseline.
    const baseline = this.samples[0]!.at <= cutoff ? this.samples[0]!.cumulativeTokens : 0;
    const tokens = last.cumulativeTokens - baseline;
    if (tokens <= 0) return undefined;
    return (tokens * 1_000) / span;
  }
}

function idleSnapshot(): ApiTelemetrySnapshot {
  return { status: "idle", outputTokens: 0, usageBacked: false };
}
