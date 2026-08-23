/**
 * Shared Visible Text Speed telemetry contract.
 *
 * The metric is NOT API throughput: it is the generation speed of assistant
 * text the user can currently see. Only `text` / `text_delta` content counts —
 * thinking/reasoning, tool-call arguments, and tool results never do, and a
 * provider usage count never overwrites the visible-text estimate. Every
 * surface (TUI footer, WebUI badge) reads these snapshots and never recomputes
 * speed from raw stream events.
 */

export type ApiTelemetryStatus =
  | "idle"
  | "waiting"
  | "streaming"
  | "completed"
  | "error";

export interface ApiTelemetrySnapshot {
  status: ApiTelemetryStatus;

  /** Wall-clock ms of the assistant turn start (entering `waiting`). */
  startedAt?: number;
  /** Wall-clock ms of the first visible text; absent while `waiting`. */
  firstTextAt?: number;
  /** Wall-clock ms of the most recent visible text. */
  lastTextAt?: number;
  /** Wall-clock ms when the turn completed or failed. */
  finishedAt?: number;

  /** Estimated visible-text tokens (never replaced by provider usage). */
  visibleTokens: number;

  /** Visible-text speed over the recent 3-second sliding window, tokens/second. */
  currentTokensPerSecond?: number;

  /**
   * Mean visible-text speed across the actual text span:
   * visibleTokens / (lastTextAt - firstTextAt). Reasoning time before the
   * first character never enters this value.
   */
  averageTokensPerSecond?: number;

  /** Visible-text generation span: lastTextAt - firstTextAt. */
  durationMs?: number;

  /** Latency from turn start to the first visible character. */
  ttftMs?: number;
}
