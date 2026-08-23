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

  it("counts a non-BMP CJK character consistently across split deltas", () => {
    const character = "𠀀";
    expect(character).toHaveLength(2);
    expect(estimateTokens(character)).toBe(1);

    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 1_000;
    tracker.observeTextDelta(character[0]!);
    expect(tracker.snapshot()).toMatchObject({ status: "waiting", visibleTokens: 0 });
    now = 1_100;
    tracker.observeTextDelta(character[1]!);
    expect(tracker.snapshot().visibleTokens).toBe(estimateTokens(character));
  });
});

describe("ApiTelemetryTracker state machine", () => {
  it("walks waiting → streaming → completed → idle with text deltas", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });

    tracker.begin();
    expect(tracker.snapshot()).toMatchObject({ status: "waiting", visibleTokens: 0 });

    now = 1_000;
    tracker.observeTextDelta("a".repeat(400));
    let snapshot = tracker.snapshot();
    expect(snapshot.status).toBe("streaming");
    expect(snapshot.firstTextAt).toBe(1_000);
    expect(snapshot.ttftMs).toBe(1_000);
    expect(snapshot.visibleTokens).toBe(100);

    now = 2_000;
    tracker.observeTextDelta("a".repeat(400));
    snapshot = tracker.snapshot();
    expect(snapshot.visibleTokens).toBe(200);
    expect(snapshot.lastTextAt).toBe(2_000);

    // Window [1_000, 2_500]: 200 tokens / 1.5s live; the average spans the
    // actual text generation (1_000→2_000): 200 tokens / 1s.
    now = 2_500;
    expect(tracker.snapshot().currentTokensPerSecond).toBeCloseTo(133.33, 1);
    expect(tracker.snapshot().averageTokensPerSecond).toBeCloseTo(200, 1);

    now = 3_000;
    tracker.complete();
    snapshot = tracker.snapshot();
    expect(snapshot).toMatchObject({
      status: "completed",
      visibleTokens: 200,
      finishedAt: 3_000,
      durationMs: 1_000,
    });
    // Avg spans the actual text generation (1_000→2_000), not the turn.
    expect(snapshot.averageTokensPerSecond).toBeCloseTo(200, 1);
    expect(snapshot.currentTokensPerSecond).toBeUndefined();
    expect(tracker.needsTick()).toBe(true);

    now = 3_000 + 8_001;
    expect(tracker.snapshot()).toMatchObject({ status: "idle", visibleTokens: 0 });
    expect(tracker.needsTick()).toBe(false);
  });

  it("marks failures and restarts cleanly on the next turn", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 100;
    tracker.observeTextDelta("abcd");
    now = 200;
    tracker.fail();
    expect(tracker.snapshot().status).toBe("error");
    expect(tracker.snapshot().ttftMs).toBe(100);
    expect(tracker.needsTick()).toBe(false);

    tracker.begin();
    expect(tracker.snapshot()).toMatchObject({ status: "waiting", visibleTokens: 0 });
    // A turn that never streamed text still completes — with no reading.
    now = 300;
    tracker.complete();
    const snapshot = tracker.snapshot();
    expect(snapshot.status).toBe("completed");
    expect(snapshot.averageTokensPerSecond).toBeUndefined();
    expect(snapshot.durationMs).toBeUndefined();
    expect(tracker.needsTick()).toBe(false);
  });

  it("reasoning wait before the first character never enters the average", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();

    // Five seconds of thinking-only updates: still waiting, no tokens.
    now = 5_000;
    tracker.observeContent([{ type: "thinking", thinking: "d".repeat(4_000) }]);
    expect(tracker.snapshot()).toMatchObject({ status: "waiting", visibleTokens: 0 });

    now = 5_000;
    tracker.observeTextDelta("a".repeat(400));
    now = 7_000;
    tracker.observeTextDelta("a".repeat(400));
    const snapshot = tracker.snapshot();
    expect(snapshot.ttftMs).toBe(5_000);
    expect(snapshot.durationMs).toBe(2_000);
    expect(snapshot.averageTokensPerSecond).toBeCloseTo(100, 1);
  });
});

describe("Visible Text Speed counting rules", () => {
  it("thinking/reasoning never increases visibleTokens", () => {
    let now = 1_000;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    tracker.observeContent([{ type: "thinking", thinking: "d".repeat(10_000) }]);
    tracker.observeTextDelta("a".repeat(400));
    now = 1_100;
    tracker.observeContent([
      { type: "thinking", thinking: "d".repeat(20_000) },
      textBlock("a".repeat(400)),
    ]);
    expect(tracker.snapshot().visibleTokens).toBe(100);
    expect(tracker.snapshot().status).toBe("streaming");
  });

  it("tool-call blocks and tool results never increase visibleTokens", () => {
    let now = 1_000;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    tracker.observeContent([
      textBlock("a"),
      { type: "toolCall", id: "t", name: "x", arguments: { big: "payload" }, rawInput: "{\"big\":\"payload\"}" },
      { type: "thinking", thinking: "b" },
      { type: "image", data: "…" } as never,
    ]);
    expect(tracker.snapshot().visibleTokens).toBeCloseTo(0.25);

    const lastTextAt = tracker.snapshot().lastTextAt;
    // Growing tool-call input must not move the estimate or the visible-text
    // timestamp used by completed average/duration calculations.
    now = 1_100;
    tracker.observeContent([
      textBlock("a"),
      { type: "toolCall", id: "t", name: "x", arguments: { big: "payload" }, rawInput: "{\"big\":\"payload\",\"more\":\"stuff\"}" },
    ]);
    expect(tracker.snapshot().visibleTokens).toBeCloseTo(0.25);
    expect(tracker.snapshot().lastTextAt).toBe(lastTextAt);
  });

  it("a pure tool-call turn never shows a speed reading", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    for (let i = 1; i <= 10; i++) {
      now = i * 500;
      tracker.observeContent([
        { type: "thinking", thinking: "plan" },
        { type: "toolCall", id: `t${i}`, name: "bash", arguments: { cmd: "ls" }, rawInput: "{\"cmd\":\"ls\"}" },
      ]);
      expect(tracker.snapshot().currentTokensPerSecond).toBeUndefined();
      expect(tracker.snapshot().status).toBe("waiting");
    }
    now = 6_000;
    tracker.complete();
    const snapshot = tracker.snapshot();
    expect(snapshot.status).toBe("completed");
    expect(snapshot.visibleTokens).toBe(0);
    expect(snapshot.averageTokensPerSecond).toBeUndefined();
    expect(snapshot.currentTokensPerSecond).toBeUndefined();
    expect(tracker.needsTick()).toBe(false);
  });

  it("completion never overwrites the visible-text estimate with provider usage", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 500;
    tracker.observeTextDelta("a".repeat(400));
    now = 1_500;
    tracker.observeTextDelta("a".repeat(400));
    // Provider usage (e.g. usage.output = 987 including reasoning) has no
    // parameter to enter here; the estimate stays 200 visible tokens.
    tracker.complete();
    expect(tracker.snapshot().visibleTokens).toBe(200);
    expect(tracker.snapshot().averageTokensPerSecond).toBeCloseTo(200, 1);
  });
});

describe("sliding-window live speed", () => {
  it("tracks a continuous delta stream and slides the 3-second window", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 1_000;
    tracker.observeTextDelta("a".repeat(400));
    now = 2_000;
    tracker.observeTextDelta("a".repeat(400));

    // Window [1_100, 4_100]: only the second 100 tokens are inside it.
    now = 4_100;
    expect(tracker.snapshot().currentTokensPerSecond).toBeCloseTo(100 / 3, 1);
  });

  it("drops the live speed after more than 3 seconds without visible text", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 1_000;
    tracker.observeTextDelta("a".repeat(400));
    now = 2_000;
    tracker.observeTextDelta("a".repeat(400));

    now = 5_100;
    expect(tracker.snapshot().currentTokensPerSecond).toBeUndefined();
    // Average stays frozen over the actual text span, not polluted by the pause.
    expect(tracker.snapshot().averageTokensPerSecond).toBeCloseTo(200, 1);
  });

  it("does not extend text timing when WebUI re-observes unchanged content", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    now = 1_000;
    tracker.observeContent([textBlock("a".repeat(400))]);
    now = 2_000;
    tracker.observeContent([textBlock("a".repeat(800))]);

    // Badge ticks and thinking/tool renders repeatedly present the same text.
    for (now = 2_300; now <= 5_000; now += 300) {
      tracker.observeContent([
        textBlock("a".repeat(800)),
        { type: "thinking", thinking: `still thinking at ${now}` },
        { type: "toolCall", id: "t", name: "x", rawInput: String(now) },
      ]);
    }
    tracker.complete();
    const snapshot = tracker.snapshot();
    expect(snapshot.lastTextAt).toBe(2_000);
    expect(snapshot.durationMs).toBe(1_000);
    expect(snapshot.averageTokensPerSecond).toBeCloseTo(200, 1);
  });

  it("keeps the same-tick collapse and re-estimate guards for the content path", () => {
    let now = 1_000;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    tracker.observeContent([textBlock("a".repeat(4))]);
    tracker.observeContent([textBlock("a".repeat(8))]);
    expect(tracker.snapshot().visibleTokens).toBe(2);

    now = 1_200;
    // Same index, unrelated text: the prefix cache must not be applied.
    tracker.observeContent([textBlock("zzzz")]);
    expect(tracker.snapshot().visibleTokens).toBe(1);
  });
});

describe("delta hot path stays independent of accumulated length", () => {
  it("accumulates per-delta estimates without any prefix scan over history", () => {
    // 2_000 deltas of 20 chars: the delta path must total the same as one
    // estimate of the concatenation (fractional parts included).
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    const delta = "abcdefghijklmnopqrst";
    let expected = 0;
    for (let i = 0; i < 2_000; i++) {
      now = i;
      tracker.observeTextDelta(delta);
      expected += estimateTokens(delta);
    }
    expect(tracker.snapshot().visibleTokens).toBeCloseTo(expected, 5);
    expect(tracker.snapshot().visibleTokens).toBeCloseTo(2_000 * 5, 5);
    // The tracker never retains accumulated text: only bounded samples.
    tracker.begin();
    expect(tracker.snapshot().visibleTokens).toBe(0);
  });
});

describe("display signature", () => {
  it("only changes with rendered values", () => {
    let now = 0;
    const tracker = new ApiTelemetryTracker({ now: () => now });
    tracker.begin();
    const waiting = tracker.displaySignature();
    expect(waiting).toContain("waiting");

    now = 1_000;
    tracker.observeTextDelta("a".repeat(400));
    now = 1_200;
    const first = tracker.displaySignature();
    now = 1_250;
    expect(tracker.displaySignature()).toBe(first);
    now = 2_500;
    expect(tracker.displaySignature()).not.toBe(first);
  });
});
