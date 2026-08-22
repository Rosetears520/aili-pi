import { describe, expect, it } from "vitest";
import {
  ApiTelemetryTracker,
  estimateTokens,
  estimateUpdatedTokens,
} from "../../src/runtime/telemetry/speed.js";

function textBlock(text: string): { type: "text"; text: string } {
  return { type: "text", text };
}

describe("shared token estimator", () => {
  it("counts CJK characters as one token each and other text at four characters per token", () => {
    expect(estimateTokens("你好")).toBe(2);
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("extends a cached estimate by the new suffix only", () => {
    expect(estimateUpdatedTokens(undefined, "abcd")).toBe(1);
    expect(estimateUpdatedTokens({ text: "abcd", tokens: 1 }, "abcdefgh")).toBe(2);
    // Non-prefix text falls back to a full re-estimate.
    expect(estimateUpdatedTokens({ text: "abcd", tokens: 1 }, "zz")).toBeCloseTo(0.5);
  });

  it("counts streamed text and thinking blocks while excluding tool-call arguments", () => {
    let now = 1_000;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    tracker.observeContent([
      textBlock("a"),
      { type: "thinking", thinking: "b" },
      { type: "toolCall", id: "t", name: "x", arguments: { big: "payload" }, rawInput: "{\"big\":\"payload\"}" },
      { type: "image", data: "…" } as never,
    ]);
    // Only "ab" counts: 2 non-CJK characters = 0.5 tokens.
    expect(tracker.snapshot().outputTokens).toBeCloseTo(0.5);

    // Growing tool-call input must not move the estimate.
    now = 1_100;
    tracker.observeContent([
      textBlock("a"),
      { type: "thinking", thinking: "b" },
      { type: "toolCall", id: "t", name: "x", arguments: { big: "payload" }, rawInput: "{\"big\":\"payload\",\"more\":\"stuff\"}" },
    ]);
    expect(tracker.snapshot().outputTokens).toBeCloseTo(0.5);
    expect(tracker.snapshot().status).toBe("streaming");
  });
});

describe("ApiTelemetryTracker", () => {
  it("walks starting → streaming → completed with usage-backed totals", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });

    tracker.begin();
    expect(tracker.snapshot()).toMatchObject({ status: "starting", outputTokens: 0 });

    now = 1_000;
    tracker.observeContent([textBlock("a".repeat(400))]);
    let snapshot = tracker.snapshot();
    expect(snapshot.status).toBe("streaming");
    expect(snapshot.firstTokenAt).toBe(1_000);
    expect(snapshot.ttftMs).toBe(1_000);
    expect(snapshot.outputTokens).toBe(100);

    now = 2_000;
    tracker.observeContent([textBlock("a".repeat(800))]);
    snapshot = tracker.snapshot();
    expect(snapshot.outputTokens).toBe(200);
    // Window [1_000, 2_500] covers the entire stream: 200 tokens / 1.5s.
    now = 2_500;
    expect(tracker.snapshot().currentTokensPerSecond).toBeCloseTo(133.33, 1);
    expect(tracker.snapshot().averageTokensPerSecond).toBeCloseTo(133.33, 1);

    now = 3_000;
    tracker.complete(240);
    snapshot = tracker.snapshot();
    expect(snapshot).toMatchObject({
      status: "completed",
      outputTokens: 240,
      usageBacked: true,
      durationMs: 3_000,
      finishedAt: 3_000,
    });
    expect(snapshot.averageTokensPerSecond).toBeCloseTo(120, 1);
    expect(snapshot.currentTokensPerSecond).toBeUndefined();
    expect(tracker.needsTick()).toBe(true);
  });

  it("slides the three-second window and decays to undefined once the stream stalls", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 1_000;
    tracker.observeContent([textBlock("a".repeat(400))]);
    now = 2_000;
    tracker.observeContent([textBlock("a".repeat(800))]);

    // Window [1_100, 4_100]: only the second 100 tokens are inside it.
    now = 4_100;
    expect(tracker.snapshot().currentTokensPerSecond).toBeCloseTo(100 / 3, 1);

    // Last sample (t=2_000) is now outside [2_100, 5_100].
    now = 5_100;
    expect(tracker.snapshot().currentTokensPerSecond).toBeUndefined();
  });

  it("holds the completed reading for the retain window, then returns to idle", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now, completedRetainMs: 8_000 });
    tracker.begin();
    now = 500;
    tracker.observeContent([textBlock("a".repeat(4))]);
    now = 1_000;
    tracker.complete(1);

    now = 9_000;
    expect(tracker.snapshot().status).toBe("completed");
    expect(tracker.needsTick()).toBe(true);

    now = 9_001;
    expect(tracker.snapshot()).toMatchObject({ status: "idle", outputTokens: 0 });
    expect(tracker.needsTick()).toBe(false);
  });

  it("marks failures and restarts cleanly on the next message", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 100;
    tracker.observeContent([textBlock("abcd")]);
    now = 200;
    tracker.fail();
    expect(tracker.snapshot().status).toBe("error");
    expect(tracker.snapshot().durationMs).toBe(200);

    tracker.begin();
    expect(tracker.snapshot()).toMatchObject({ status: "starting", outputTokens: 0, usageBacked: false });
    // A message that never streamed text still completes with its usage count.
    now = 300;
    tracker.complete(50);
    expect(tracker.snapshot()).toMatchObject({ status: "completed", outputTokens: 50, usageBacked: true });
  });

  it("collapses same-tick observations instead of storing duplicate samples", () => {
    let now = 1_000;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    tracker.observeContent([textBlock("a".repeat(4))]);
    tracker.observeContent([textBlock("a".repeat(8))]);
    expect(tracker.snapshot().outputTokens).toBe(2);
  });

  it("re-estimates a block whose content was rewritten in place", () => {
    let now = 1_000;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    tracker.observeContent([textBlock("abcd")]);
    now = 1_200;
    // Same index, unrelated text: the prefix cache must not be applied.
    tracker.observeContent([textBlock("zzzz")]);
    expect(tracker.snapshot().outputTokens).toBe(1);
  });

  it("exposes a stable display signature that only changes with rendered values", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 1_000;
    tracker.observeContent([textBlock("a".repeat(400))]);
    now = 1_200;
    const first = tracker.displaySignature();
    now = 1_250;
    expect(tracker.displaySignature()).toBe(first);
    now = 2_500;
    const second = tracker.displaySignature();
    expect(second).not.toBe(first);
  });
});
