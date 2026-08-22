import { visibleWidth } from "@earendil-works/pi-tui";
import {
  contextTokenLabel,
  contextTone,
  normalizeCodexQuota,
  permissionModeLabel,
  renderNativeFooter,
  renderNativeFooterView,
  speedLabel,
} from "../../extensions/footer/layout.js";
import type { ApiTelemetrySnapshot } from "../../src/runtime/telemetry/types.js";
import { describe, expect, it } from "vitest";

const snapshot = {
  provider: "openai-codex",
  model: "gpt-5.6-sol",
  thinking: "xhigh",
  permissionMode: "YOLO (alt+m)  Network: open",
  retry: "retrying",
  quota: "Wk 72% resets Tue",
  clock: "19:48",
  contextTokens: 17_000,
  contextWindow: 272_000,
  mcpConnectedCount: 0,
  mcpEnabledCount: 4,
  gitBranch: "feature/native-ui",
  cwd: "aili-pi",
};

describe("Pi-native minimal footer layout", () => {
  it("aligns both left/right field groups to the display-cell edges at a fixed width", () => {
    const width = 100;
    const [primary, secondary] = renderNativeFooter(snapshot, width);
    const primaryRight = "17k/272k (6%) · Wk 72% resets Tue · retrying";
    const secondaryLeft = "aili-pi · feature/native-ui";
    const secondaryRight = "YOLO · MCP 0/4 · 19:48";

    expect(visibleWidth(primary)).toBe(width);
    expect(primary.startsWith("openai-codex/gpt-5.6-sol")).toBe(true);
    expect(primary.endsWith(primaryRight)).toBe(true);
    expect(primary.indexOf(primaryRight)).toBe(width - visibleWidth(primaryRight));

    expect(visibleWidth(secondary)).toBe(width);
    expect(secondary.startsWith(secondaryLeft)).toBe(true);
    expect(secondary.endsWith(secondaryRight)).toBe(true);
    expect(secondary.indexOf(secondaryRight)).toBe(width - visibleWidth(secondaryRight));
  });

  it("orders context before quota/retry and permission before MCP/time", () => {
    const [primary, secondary] = renderNativeFooter(snapshot, 100);
    expect(primary.indexOf("17k/272k (6%)")).toBeLessThan(primary.indexOf("Wk 72%"));
    expect(primary.indexOf("Wk 72%")).toBeLessThan(primary.indexOf("retrying"));
    expect(secondary.indexOf("YOLO")).toBeLessThan(secondary.indexOf("MCP 0/4"));
    expect(secondary.indexOf("MCP 0/4")).toBeLessThan(secondary.indexOf("19:48"));
    expect(secondary).not.toContain("17k/272k (6%)");
  });

  it("drops retry, then branch and cwd as needed while retaining the essential groups", () => {
    const narrowPrimary = renderNativeFooter(snapshot, 54)[0];
    expect(narrowPrimary).toContain("openai-codex/gpt-5.6-sol");
    expect(narrowPrimary).toContain("17k/272k (6%)");
    expect(narrowPrimary).toContain("Wk 72%");
    expect(narrowPrimary).not.toContain("retrying");

    const withoutBranch = renderNativeFooter(snapshot, 36)[1];
    expect(withoutBranch).toContain("aili-pi");
    expect(withoutBranch).not.toContain("feature/native-ui");
    expect(withoutBranch).toContain("MCP 0/4");
    expect(withoutBranch).toContain("19:48");

    const rightOnly = renderNativeFooter(snapshot, 28)[1];
    expect(rightOnly).not.toContain("aili-pi");
    expect(rightOnly).not.toContain("feature/native-ui");
    expect(rightOnly).toContain("MCP 0/4");
    expect(rightOnly).toContain("19:48");
  });

  it.each([0, 1, 8, 24, 40, 80])("never exceeds %i display cells per line", (width) => {
    for (const line of renderNativeFooter({ ...snapshot, model: "模型-sol" }, width)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(Math.max(0, width));
    }
  });

  it("shows concrete context occupancy with a percentage and omits invalid numeric usage", () => {
    expect(contextTokenLabel(17_000, 272_000)).toBe("17k/272k (6%)");
    expect(contextTokenLabel(136_000, 272_000)).toBe("136k/272k (50%)");
    expect(contextTokenLabel(9_500, 272_000)).toBe("9.5k/272k (3%)");
    expect(contextTokenLabel(undefined, 272_000)).toBeUndefined();
    expect(contextTokenLabel(17_000, 0)).toBeUndefined();
    expect(contextTokenLabel(Number.NaN, 272_000)).toBeUndefined();
  });

  it("escalates the context tone at the 70% and 90% occupancy thresholds", () => {
    expect(contextTone(17_000, 272_000)).toBe("secondary");
    expect(contextTone(200_000, 272_000)).toBe("warning");
    expect(contextTone(250_000, 272_000)).toBe("alert");
    expect(contextTone(undefined, 272_000)).toBe("secondary");
  });

  it("omits unavailable secondary data and normalizes multiline status text", () => {
    expect(renderNativeFooter({ provider: "openai-codex", model: "sol", quota: "quota\n72%\treset" }, 80)).toEqual([
      expect.stringMatching(/^openai-codex\/sol off\s+quota 72% reset$/),
      "",
    ]);
  });

  it("renders actual thinking, normalized Codex quota and permission state", () => {
    expect(renderNativeFooter({ provider: "openai-codex", model: "gpt-5.6-terra", thinking: "high", quota: "5h 75% 11:38AM (20/08)", permissionMode: "YOLO (alt+m)", mcpConnectedCount: 0, mcpEnabledCount: 4, clock: "18:31" }, 120)).toEqual([
      expect.stringContaining("openai-codex/gpt-5.6-terra high"),
      expect.stringContaining("YOLO · MCP 0/4 · 18:31"),
    ]);
    expect(normalizeCodexQuota("5h 75% 11:38AM (20/08)")).toBe("codex 75% 08/20 11:38");
    expect(normalizeCodexQuota("Wk 75%")).toBeUndefined();
    expect(normalizeCodexQuota("5h 101% 13:61PM (00/13)")).toBeUndefined();
    expect(permissionModeLabel("Build (sandboxed)")).toBe("Build");
  });
});

describe("secondary line keeps the cwd identity under squeeze", () => {
  it("truncates the left side instead of dropping it when the right is wide", () => {
    const line = renderNativeFooter({
      permissionMode: "Default",
      mcpConnectedCount: 5,
      mcpEnabledCount: 5,
      clock: "20:53",
      cwd: "aili-pi/implementer-9-1786611318131",
      gitBranch: "feature/glm-4.7-aliyun",
    }, 60)[1];
    expect(line).toContain("Default");
    expect(line).toContain("MCP 5/5");
    // The project-prefixed cwd is truncated, not removed.
    expect(line).toContain("aili-pi");
  });
});

describe("shared telemetry speed label", () => {
  it("shows the 3s-window speed while streaming and avg+duration after completion", () => {
    expect(speedLabel(undefined)).toBeUndefined();
    expect(speedLabel({ status: "idle", outputTokens: 0, usageBacked: false })).toBeUndefined();
    expect(speedLabel({ status: "starting", outputTokens: 0, usageBacked: false })).toBeUndefined();
    expect(speedLabel({ status: "streaming", outputTokens: 120, usageBacked: false, currentTokensPerSecond: 68.4 }))
      .toBe("68 t/s");
    expect(speedLabel({
      status: "completed",
      outputTokens: 1_300,
      usageBacked: true,
      averageTokensPerSecond: 68.2,
      durationMs: 18_700,
    })).toBe("68 avg · 18.7s");
    expect(speedLabel({ status: "completed", outputTokens: 5_000, usageBacked: true, averageTokensPerSecond: 41, durationMs: 125_000 }))
      .toBe("41 avg · 2m05s");
    // Errors never linger as a speed reading.
    expect(speedLabel({ status: "error", outputTokens: 3, usageBacked: false })).toBeUndefined();
  });

  it("places the speed segment before permission on the secondary line", () => {
    const telemetry: ApiTelemetrySnapshot = { status: "streaming", outputTokens: 40, usageBacked: false, currentTokensPerSecond: 68 };
    const line = renderNativeFooter({ ...snapshot, telemetry }, 100)[1];
    expect(line).toContain("68 t/s · YOLO · MCP 0/4 · 19:48");
  });

  it("keeps the speed segment inside the cell budget at narrow widths", () => {
    const telemetry: ApiTelemetrySnapshot = { status: "streaming", outputTokens: 40, usageBacked: false, currentTokensPerSecond: 68 };
    for (const width of [0, 1, 8, 24, 40, 80]) {
      for (const line of renderNativeFooter({ ...snapshot, telemetry }, width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(Math.max(0, width));
      }
    }
  });
});

describe("footer segment tones", () => {
  it("maps each segment to a semantic tone and joins back to the plain line", () => {
    const [primary, secondary] = renderNativeFooterView(snapshot, 100);
    const toneOf = (segments: readonly { text: string; tone: string }[], text: string) =>
      segments.find((segment) => segment.text === text)?.tone;
    expect(toneOf(primary.segments, "openai-codex/gpt-5.6-sol")).toBe("primary");
    expect(toneOf(primary.segments, "xhigh")).toBe("secondary");
    expect(toneOf(primary.segments, "17k/272k (6%)")).toBe("secondary");
    expect(toneOf(primary.segments, "retrying")).toBe("warning");
    expect(toneOf(secondary.segments, "YOLO")).toBe("primary");
    expect(toneOf(secondary.segments, "feature/native-ui")).toBe("secondary");
    expect(toneOf(secondary.segments, "MCP 0/4")).toBe("muted");
    expect(toneOf(secondary.segments, "19:48")).toBe("muted");
    expect(primary.segments.map((segment) => segment.text).join("")).toBe(primary.text);
    expect(secondary.segments.map((segment) => segment.text).join("")).toBe(secondary.text);
  });

  it("escalates context and quota segments to warning tones near their limits", () => {
    const [primary] = renderNativeFooterView({ ...snapshot, contextTokens: 250_000, quota: "5h 95% 11:38AM (20/08)" }, 100);
    const toneOf = (text: string) => primary.segments.find((segment) => segment.text === text)?.tone;
    expect(toneOf("250k/272k (91%)")).toBe("alert");
    expect(toneOf("codex 95% 08/20 11:38")).toBe("alert");
  });

  it("tones the live speed segment as secondary", () => {
    const [, secondary] = renderNativeFooterView({
      ...snapshot,
      telemetry: { status: "streaming", outputTokens: 40, usageBacked: false, currentTokensPerSecond: 68 },
    }, 100);
    expect(secondary.segments.find((segment) => segment.text === "68 t/s")?.tone).toBe("secondary");
  });
});
