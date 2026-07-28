import { describe, expect, it } from "vitest";
import { TOKEN_CALIBRATION_MAX_AGE_MS, TokenCalibrationWindowState } from "../../src/runtime/aili-compact/calibration.js";

const key = { providerId: "provider", modelId: "model", estimatorVersion: "v1" };
const sample = (completedAtMs: number, ratio = 1) => ({
  ...key, completedAtMs, fullProviderInputIdentity: "a".repeat(64), projectionKnown: true, suffixKnown: true,
  toolSurfaceKnown: true, reportedPromptTokens: Math.round(1_000 * ratio), baselinePromptTokens: 1_000,
  cacheSemanticsReconciled: true,
});

describe("AILI Compact token calibration", () => {
  it("calibrates only after five eligible scoped samples and retains twenty", () => {
    const state = new TokenCalibrationWindowState(key);
    for (let index = 0; index < 4; index += 1) expect(state.observe(sample(index)).snapshot.calibrated).toBe(false);
    expect(state.observe(sample(4, 1.2)).snapshot).toMatchObject({ calibrated: true, sampleCount: 5 });
    for (let index = 5; index < 25; index += 1) state.observe(sample(index, 1.1));
    expect(state.snapshot(25).sampleCount).toBe(20);
  });

  it("rejects unsafe samples with bounded reasons", () => {
    const state = new TokenCalibrationWindowState(key);
    expect(state.observe({ ...sample(1), providerId: "other" })).toMatchObject({ accepted: false, reason: "identity-mismatch" });
    expect(state.observe({ ...sample(2), overflow: true })).toMatchObject({ accepted: false, reason: "overflow-retry-cancelled" });
    expect(state.observe({ ...sample(3, 4), reportedPromptTokens: 4_001 })).toMatchObject({ accepted: false, reason: "outlier" });
    expect(state.snapshot(3).exclusionCounts).toMatchObject({ "identity-mismatch": 1, "overflow-retry-cancelled": 1, outlier: 1 });
  });

  it("bounds multiplier movement and expires samples after five minutes", () => {
    const state = new TokenCalibrationWindowState(key);
    for (let index = 0; index < 5; index += 1) state.observe(sample(index, 2));
    const calibrated = state.snapshot(5);
    expect(calibrated.lowerMultiplier).toBe(1);
    expect(calibrated.upperMultiplier).toBe(1.25);
    const bounds = state.apply({ lower: 100, upper: 200, saturated: false, source: "baseline", profileKey: "k" }, 5);
    expect(bounds).toMatchObject({ lower: 100, upper: 250, source: "provider-calibrated" });
    expect(state.applyProfile({ ...key, minBytesPerToken: 4, maxBytesPerToken: 6, messageOverheadLower: 2,
      messageOverheadUpper: 8, toolPartOverheadLower: 4, toolPartOverheadUpper: 16 }, 5)).toMatchObject({
      source: "provider-calibrated", minBytesPerToken: 3, maxBytesPerToken: 6, messageOverheadUpper: 10, toolPartOverheadUpper: 20,
    });
    expect(state.snapshot(TOKEN_CALIBRATION_MAX_AGE_MS + 10).sampleCount).toBe(0);
  });
});
