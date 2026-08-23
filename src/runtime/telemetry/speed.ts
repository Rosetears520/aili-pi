/**
 * Runtime-neutral Visible Text Speed telemetry: the single implementation of
 * output token estimation and tok/s math shared by the TUI footer and the
 * WebUI. Pure TypeScript — no Node built-ins, no DOM — so the same module
 * semantics hold in the Pi extension host and in the browser bundle.
 *
 * Feeding contract: both surfaces observe the same assistant stream with the
 * same estimator over the same visible text. The TUI hot path feeds
 * `observeTextDelta` (per-delta, O(delta) cost); the WebUI feeds
 * `observeContent` (per-block incremental fallback). Provider usage counts
 * never participate: the metric is visible text, not API throughput.
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
 * Visible text of one assistant content block. Thinking/reasoning and
 * tool-call arguments never count toward Visible Text Speed.
 */
function estimateBlockText(block: EstimateBlock): string {
  if (!isRecord(block)) return "";
  if (block.type === "text" && typeof block.text === "string") return block.text;
  return "";
}

interface WindowSample {
  readonly at: number;
  readonly cumulativeTokens: number;
}

interface WindowSampleNode {
  sample: WindowSample;
  next?: WindowSampleNode;
}

export interface ApiTelemetryTrackerOptions {
  now?: () => number;
  windowMs?: number;
  completedRetainMs?: number;
}

/**
 * One assistant turn's telemetry. `begin` when the turn starts (the tracker
 * enters `waiting`), `observeTextDelta`/`observeContent` as visible text
 * arrives (memory-only; never a render side effect), `complete`/`fail` when
 * the turn ends. Snapshots are computed lazily on read.
 */
export class ApiTelemetryTracker {
  private readonly now: () => number;
  private readonly windowMs: number;
  private readonly completedRetainMs: number;
  private status: ApiTelemetryStatus = "idle";
  private startedAt: number | undefined;
  private firstTextAt: number | undefined;
  private lastTextAt: number | undefined;
  private finishedAt: number | undefined;
  /** Per-block last-seen estimates for the content fallback path. */
  private blockCaches: TokenEstimateCacheEntry[] = [];
  private visibleTokens = 0;
  private sampleHead: WindowSampleNode | undefined;
  private sampleTail: WindowSampleNode | undefined;
  /** Carries a split UTF-16 surrogate pair across adjacent text deltas. */
  private pendingHighSurrogate: { value: string; at: number } | undefined;

  public constructor(options: ApiTelemetryTrackerOptions = {}) {
    // Resolve the global clock lazily so test fake-timer installs apply.
    this.now = options.now ?? (() => Date.now());
    this.windowMs = options.windowMs ?? SPEED_WINDOW_MS;
    this.completedRetainMs = options.completedRetainMs ?? COMPLETED_RETAIN_MS;
  }

  public get streaming(): boolean {
    return this.status === "waiting" || this.status === "streaming";
  }

  /** A new assistant turn started: waiting for the first visible text. */
  public begin(now = this.now()): void {
    this.status = "waiting";
    this.startedAt = now;
    this.firstTextAt = undefined;
    this.lastTextAt = undefined;
    this.finishedAt = undefined;
    this.blockCaches = [];
    this.visibleTokens = 0;
    this.sampleHead = undefined;
    this.sampleTail = undefined;
    this.pendingHighSurrogate = undefined;
  }

  /**
   * TUI hot path: one visible-text delta. Cost is O(delta.length) — no
   * accumulated-text scan, array shifting, render, or IO.
   */
  public observeTextDelta(delta: string, now = this.now()): void {
    if (!this.streaming || !delta) return;
    let text = this.pendingHighSurrogate
      ? this.pendingHighSurrogate.value + delta
      : delta;
    this.pendingHighSurrogate = undefined;
    const lastCodeUnit = text.charCodeAt(text.length - 1);
    if (isHighSurrogate(lastCodeUnit)) {
      this.pendingHighSurrogate = { value: text.slice(-1), at: now };
      text = text.slice(0, -1);
    }
    if (!text) return;
    this.markVisibleText(now);
    this.visibleTokens += estimateTokens(text);
    this.pushSample(now, this.visibleTokens);
  }

  /**
   * WebUI / compatibility fallback: accumulated assistant content blocks.
   * Counts text blocks only; estimation is incremental per block, so an
   * update costs O(changed block), never O(message).
   */
  public observeContent(content: readonly EstimateBlock[] | undefined | null, now = this.now()): void {
    if (!this.streaming) return;
    const nextCaches: TokenEstimateCacheEntry[] = [];
    let total = 0;
    let visibleTextChanged = false;
    if (Array.isArray(content)) {
      for (let index = 0; index < content.length; index++) {
        const text = estimateBlockText(content[index]!);
        const previous = index < this.blockCaches.length ? this.blockCaches[index] : undefined;
        if ((previous?.text ?? "") !== text) visibleTextChanged = true;
        // Unchanged blocks reuse their cache entry by reference (O(1)); only
        // the growing block pays for a prefix comparison over its own length.
        const entry = previous && previous.text === text
          ? previous
          : { text, tokens: estimateUpdatedTokens(previous, text) };
        nextCaches.push(entry);
        total += entry.tokens;
      }
    }
    for (let index = nextCaches.length; index < this.blockCaches.length; index++) {
      if (this.blockCaches[index]!.text) visibleTextChanged = true;
    }
    this.blockCaches = nextCaches;
    this.visibleTokens = total;
    if (!visibleTextChanged || total <= 0) return;
    this.markVisibleText(now);
    this.pushSample(now, total);
  }

  /**
   * Turn ended normally. Provider usage counts deliberately do NOT
   * participate: the completed reading stays on the visible-text estimate.
   */
  public complete(now = this.now()): void {
    if (!this.streaming) return;
    this.flushPendingHighSurrogate();
    this.finishedAt = now;
    this.status = "completed";
    if (this.visibleTokens > 0) this.pushSample(now, this.visibleTokens);
  }

  public fail(now = this.now()): void {
    if (!this.streaming) return;
    this.finishedAt = now;
    this.status = "error";
  }

  public reset(): void {
    this.status = "idle";
    this.startedAt = undefined;
    this.firstTextAt = undefined;
    this.lastTextAt = undefined;
    this.finishedAt = undefined;
    this.blockCaches = [];
    this.visibleTokens = 0;
    this.sampleHead = undefined;
    this.sampleTail = undefined;
    this.pendingHighSurrogate = undefined;
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

    const textSpan = this.firstTextAt !== undefined && this.lastTextAt !== undefined
      ? Math.max(0, this.lastTextAt - this.firstTextAt)
      : undefined;
    const averageTokensPerSecond = textSpan !== undefined && textSpan > 0
      ? (this.visibleTokens * 1_000) / textSpan
      : undefined;
    return {
      status: this.status,
      ...(this.startedAt !== undefined ? { startedAt: this.startedAt } : {}),
      ...(this.firstTextAt !== undefined ? { firstTextAt: this.firstTextAt } : {}),
      ...(this.lastTextAt !== undefined ? { lastTextAt: this.lastTextAt } : {}),
      ...(this.finishedAt !== undefined ? { finishedAt: this.finishedAt } : {}),
      visibleTokens: this.visibleTokens,
      ...(this.status === "streaming" ? { currentTokensPerSecond: this.windowSpeed(now) } : {}),
      ...(averageTokensPerSecond !== undefined ? { averageTokensPerSecond } : {}),
      ...(textSpan !== undefined ? { durationMs: textSpan } : {}),
      ...(this.firstTextAt !== undefined && this.startedAt !== undefined
        ? { ttftMs: Math.max(0, this.firstTextAt - this.startedAt) }
        : {}),
    };
  }

  /**
   * Cheap change-detection signature for low-frequency UI refresh loops: two
   * equal signatures guarantee an identical footer rendering. Only values a
   * surface actually displays participate — the live average drifts with
   * `now` but is never rendered while streaming.
   */
  public displaySignature(now = this.now()): string {
    const snapshot = this.snapshot(now);
    if (snapshot.status === "waiting" || snapshot.status === "streaming") {
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

  /** True while a live or retained reading still needs 1 Hz UI ticks. */
  public needsTick(now = this.now()): boolean {
    if (this.streaming) return true;
    if (this.status !== "completed" || this.finishedAt === undefined) return false;
    const hasCompletedReading = this.visibleTokens > 0
      && this.firstTextAt !== undefined
      && this.lastTextAt !== undefined
      && this.lastTextAt > this.firstTextAt;
    return hasCompletedReading && now - this.finishedAt <= this.completedRetainMs;
  }

  private flushPendingHighSurrogate(): void {
    const pending = this.pendingHighSurrogate;
    if (!pending) return;
    this.pendingHighSurrogate = undefined;
    this.markVisibleText(pending.at);
    this.visibleTokens += estimateTokens(pending.value);
    this.pushSample(pending.at, this.visibleTokens);
  }

  private markVisibleText(now: number): void {
    if (this.firstTextAt === undefined) {
      this.firstTextAt = now;
      this.status = "streaming";
    }
    this.lastTextAt = now;
  }

  private pushSample(at: number, cumulativeTokens: number): void {
    const last = this.sampleTail;
    if (last && at <= last.sample.at) {
      // Same-tick updates collapse into the newest cumulative value.
      last.sample = { at: last.sample.at, cumulativeTokens };
      return;
    }
    const node: WindowSampleNode = { sample: { at, cumulativeTokens } };
    if (last) last.next = node;
    else this.sampleHead = node;
    this.sampleTail = node;
    this.prune(at);
  }

  /** Keep the newest sample at or before the window cutoff plus everything after it. */
  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.sampleHead?.next && this.sampleHead.next.sample.at <= cutoff) {
      this.sampleHead = this.sampleHead.next;
    }
  }

  private windowSpeed(now: number): number | undefined {
    const first = this.sampleHead?.sample;
    const last = this.sampleTail?.sample;
    if (!first || !last) return undefined;
    const cutoff = now - this.windowMs;
    if (last.at <= cutoff) return undefined;
    const windowStart = Math.max(cutoff, first.at, this.firstTextAt ?? now);
    const span = now - windowStart;
    if (span < MIN_SPEED_SPAN_MS) return undefined;
    // The head is the newest sample at or before the cutoff (or the very first
    // sample ever), so its cumulative count is the window baseline.
    const baseline = first.at <= cutoff ? first.cumulativeTokens : 0;
    const tokens = last.cumulativeTokens - baseline;
    if (tokens <= 0) return undefined;
    return (tokens * 1_000) / span;
  }
}

function idleSnapshot(): ApiTelemetrySnapshot {
  return { status: "idle", visibleTokens: 0 };
}
