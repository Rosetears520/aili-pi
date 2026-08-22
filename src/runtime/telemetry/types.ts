/**
 * Shared API performance telemetry contract.
 *
 * One snapshot shape, one speed algorithm, consumed by every surface (TUI
 * footer, WebUI streaming badge). Presentation layers never recompute token
 * speed from raw stream events; they read these snapshots only.
 */

export type ApiTelemetryStatus =
  | "idle"
  | "starting"
  | "streaming"
  | "completed"
  | "error";

export interface ApiTelemetrySnapshot {
  status: ApiTelemetryStatus;

  /** Wall-clock ms of the streaming assistant message start. */
  startedAt?: number;
  /** Wall-clock ms of the first observed output text. */
  firstTokenAt?: number;
  /** Wall-clock ms when the message completed or failed. */
  finishedAt?: number;

  /** Estimated output tokens (provider usage count once a message ends). */
  outputTokens: number;
  /** True once a real provider usage count replaced the character estimate. */
  usageBacked: boolean;

  /** Output speed over the recent 3-second sliding window, tokens/second. */
  currentTokensPerSecond?: number;

  /** Mean output speed from first token to completion, tokens/second. */
  averageTokensPerSecond?: number;

  /** Elapsed ms from message start to completion (or to `now` while live). */
  durationMs?: number;

  /** First-token latency in ms; absent when no output was observed. */
  ttftMs?: number;
}
