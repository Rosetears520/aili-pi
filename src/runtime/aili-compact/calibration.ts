import type { TokenBoundProfile, TokenBounds } from "./safe-planning.js";

export const TOKEN_CALIBRATION_VERSION = "aili.token-calibration.v1" as const;
export const TOKEN_CALIBRATION_WINDOW = 20;
export const TOKEN_CALIBRATION_MINIMUM = 5;
export const TOKEN_CALIBRATION_MAX_AGE_MS = 5 * 60 * 1_000;
const MAX_REASON_COUNT = 1_000_000;

export type CalibrationExclusionReason =
  | "ambiguous-cache"
  | "ambiguous-request"
  | "binary-or-image"
  | "compaction"
  | "identity-mismatch"
  | "invalid-baseline"
  | "invalid-reported-tokens"
  | "outlier"
  | "overflow-retry-cancelled";

export interface TokenCalibrationKey {
  providerId: string;
  modelId: string;
  estimatorVersion: string;
}

export interface TokenCalibrationSampleInput extends TokenCalibrationKey {
  completedAtMs: number;
  fullProviderInputIdentity?: string;
  projectionKnown: boolean;
  suffixKnown: boolean;
  toolSurfaceKnown: boolean;
  reportedPromptTokens?: number;
  baselinePromptTokens?: number;
  hasBinaryOrImage?: boolean;
  overflow?: boolean;
  retry?: boolean;
  cancelled?: boolean;
  compaction?: boolean;
  cacheSemanticsReconciled?: boolean;
}

export interface TokenCalibrationSnapshot extends TokenCalibrationKey {
  version: typeof TOKEN_CALIBRATION_VERSION;
  sampleCount: number;
  lowerMultiplier: number;
  upperMultiplier: number;
  calibrated: boolean;
  exclusionCounts: Readonly<Record<CalibrationExclusionReason, number>>;
}

type Sample = { completedAtMs: number; ratio: number };

export class TokenCalibrationWindowState {
  private samples: Sample[] = [];
  private lowerMultiplier = 1;
  private upperMultiplier = 1;
  private exclusions = emptyExclusions();

  constructor(private readonly key: TokenCalibrationKey) {
    if (!key.providerId || !key.modelId || !key.estimatorVersion) throw new Error("invalid-calibration-key");
  }

  observe(input: TokenCalibrationSampleInput): { accepted: boolean; reason?: CalibrationExclusionReason; snapshot: TokenCalibrationSnapshot } {
    const reason = exclusionReason(this.key, input);
    if (reason) {
      this.exclusions[reason] = boundedIncrement(this.exclusions[reason]);
      return { accepted: false, reason, snapshot: this.snapshot(input.completedAtMs) };
    }
    const ratio = input.reportedPromptTokens! / input.baselinePromptTokens!;
    this.prune(input.completedAtMs);
    this.samples = [...this.samples, { completedAtMs: input.completedAtMs, ratio }].slice(-TOKEN_CALIBRATION_WINDOW);
    if (this.samples.length >= TOKEN_CALIBRATION_MINIMUM) {
      const ratios = this.samples.map((sample) => sample.ratio);
      const desiredLower = clamp(0.90 * Math.min(...ratios), 0.25, 1);
      const desiredUpper = clamp(1.10 * Math.max(...ratios), 1, 4);
      this.lowerMultiplier = limitMovement(this.lowerMultiplier, desiredLower);
      this.upperMultiplier = limitMovement(this.upperMultiplier, desiredUpper);
    }
    return { accepted: true, snapshot: this.snapshot(input.completedAtMs) };
  }

  snapshot(nowMs?: number): TokenCalibrationSnapshot {
    if (nowMs !== undefined) this.prune(nowMs);
    return {
      version: TOKEN_CALIBRATION_VERSION,
      ...this.key,
      sampleCount: this.samples.length,
      lowerMultiplier: this.lowerMultiplier,
      upperMultiplier: this.upperMultiplier,
      calibrated: this.samples.length >= TOKEN_CALIBRATION_MINIMUM,
      exclusionCounts: { ...this.exclusions },
    };
  }

  apply(bounds: TokenBounds, nowMs?: number): TokenBounds {
    const snapshot = this.snapshot(nowMs);
    if (!snapshot.calibrated || bounds.saturated) return bounds;
    return {
      ...bounds,
      lower: Math.max(0, Math.floor(bounds.lower * snapshot.lowerMultiplier)),
      upper: Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(bounds.upper * snapshot.upperMultiplier)),
      source: "provider-calibrated",
    };
  }

  /** Produces a widened exact-key profile; it can never narrow an upper bound. */
  applyProfile(profile: TokenBoundProfile, nowMs?: number): TokenBoundProfile {
    const snapshot = this.snapshot(nowMs);
    if (!snapshot.calibrated
      || profile.providerId !== this.key.providerId
      || profile.modelId !== this.key.modelId
      || profile.estimatorVersion !== this.key.estimatorVersion) return profile;
    return {
      ...profile,
      source: "provider-calibrated",
      maxBytesPerToken: Math.max(profile.maxBytesPerToken, Math.ceil(profile.maxBytesPerToken / snapshot.lowerMultiplier)),
      minBytesPerToken: Math.max(1, Math.min(profile.minBytesPerToken, Math.floor(profile.minBytesPerToken / snapshot.upperMultiplier))),
      messageOverheadLower: Math.max(0, Math.floor(profile.messageOverheadLower * snapshot.lowerMultiplier)),
      messageOverheadUpper: Math.max(profile.messageOverheadUpper, Math.ceil(profile.messageOverheadUpper * snapshot.upperMultiplier)),
      toolPartOverheadLower: Math.max(0, Math.floor(profile.toolPartOverheadLower * snapshot.lowerMultiplier)),
      toolPartOverheadUpper: Math.max(profile.toolPartOverheadUpper, Math.ceil(profile.toolPartOverheadUpper * snapshot.upperMultiplier)),
    };
  }

  private prune(nowMs: number): void {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return;
    const cutoff = Math.max(0, nowMs - TOKEN_CALIBRATION_MAX_AGE_MS);
    this.samples = this.samples.filter((sample) => sample.completedAtMs >= cutoff && sample.completedAtMs <= nowMs);
  }
}

function exclusionReason(key: TokenCalibrationKey, input: TokenCalibrationSampleInput): CalibrationExclusionReason | undefined {
  if (input.providerId !== key.providerId || input.modelId !== key.modelId || input.estimatorVersion !== key.estimatorVersion) return "identity-mismatch";
  if (!input.fullProviderInputIdentity || !input.projectionKnown || !input.suffixKnown || !input.toolSurfaceKnown) return "ambiguous-request";
  if (input.hasBinaryOrImage) return "binary-or-image";
  if (input.compaction) return "compaction";
  if (input.overflow || input.retry || input.cancelled) return "overflow-retry-cancelled";
  if (input.cacheSemanticsReconciled !== true) return "ambiguous-cache";
  if (!positiveInteger(input.reportedPromptTokens)) return "invalid-reported-tokens";
  if (!positiveInteger(input.baselinePromptTokens)) return "invalid-baseline";
  const ratio = input.reportedPromptTokens / input.baselinePromptTokens;
  return ratio < 0.25 || ratio > 4 ? "outlier" : undefined;
}

function positiveInteger(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function limitMovement(previous: number, desired: number): number {
  return clamp(desired, previous * 0.75, previous * 1.25);
}

function boundedIncrement(value: number): number {
  return Math.min(MAX_REASON_COUNT, value + 1);
}

function emptyExclusions(): Record<CalibrationExclusionReason, number> {
  return {
    "ambiguous-cache": 0,
    "ambiguous-request": 0,
    "binary-or-image": 0,
    compaction: 0,
    "identity-mismatch": 0,
    "invalid-baseline": 0,
    "invalid-reported-tokens": 0,
    outlier: 0,
    "overflow-retry-cancelled": 0,
  };
}
