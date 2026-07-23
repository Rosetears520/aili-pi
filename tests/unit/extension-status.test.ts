import { describe, expect, it } from "vitest";
import type { PolishedTuiConfig } from "../../extensions/zentui/config.js";
import { defaultConfig, mergeConfig } from "../../extensions/zentui/config.js";
import { collectExtensionStatusSegments } from "../../extensions/zentui/extension-status.js";

function withStatusOverrides(
  placements: Record<string, "off" | "left" | "middle" | "right">,
  colorModes: Record<string, "zentui" | "original"> = {},
): PolishedTuiConfig {
  return {
    ...defaultConfig,
    extensionStatuses: {
      ...defaultConfig.extensionStatuses,
      placements: { ...defaultConfig.extensionStatuses.placements, ...placements },
      colorModes: { ...defaultConfig.extensionStatuses.colorModes, ...colorModes },
    },
  };
}

function rightText(value: string, config = defaultConfig): string[] {
  return collectExtensionStatusSegments(
    new Map([["pi-quota-status", value]]),
    config,
  ).right.map((segment) => segment.text);
}

describe("Zentui extension statuses", () => {
  it("treats the dependency's legacy 5h label as the single Codex weekly fallback", () => {
    expect(rightText("5h 38% 9:49AM (29/07)")).toEqual([
      "codex 38% 9:49AM (29/07)",
    ]);
  });

  it("renders an explicit upstream weekly segment as the single Codex quota", () => {
    expect(rightText("Wk 50% 9:49AM (29/07)")).toEqual([
      "codex 50% 9:49AM (29/07)",
    ]);
  });

  it("prefers explicit weekly data and removes the legacy duplicate", () => {
    expect(rightText("5h 80% 1:00PM · Wk 37% 9:49AM (29/07)")).toEqual([
      "codex 37% 9:49AM (29/07)",
    ]);
  });

  it("leaves an unrecognized quota status message unchanged", () => {
    expect(rightText("Codex quota unavailable (/quota doctor)")).toEqual([
      "Codex quota unavailable (/quota doctor)",
    ]);
  });

  it("preserves safe original SGR color around the selected weekly value", () => {
    const config = withStatusOverrides(
      {},
      { "pi-quota-status": "original" },
    );

    expect(rightText(
      "\x1b[31m5h 80% 1:00PM\x1b[0m · \x1b[32mWk 37% 9:49AM (29/07)\x1b[0m",
      config,
    )).toEqual([
      "\x1b[32mcodex 37% 9:49AM (29/07)\x1b[0m",
    ]);
  });

  it("retains the cache-off default when unrelated status placements are customized", () => {
    const config = mergeConfig({
      extensionStatuses: { placements: { "custom-status": "left" } },
    });
    const statuses = collectExtensionStatusSegments(
      new Map([
        ["custom-status", "custom"],
        ["pi-cache-stats", "OpenAI cache 0/0 · 0M/0M tok"],
        ["pi-quota-status", "Wk 37% 9:49AM (29/07)"],
      ]),
      config,
    );

    expect(statuses.left.map((segment) => segment.key)).toEqual(["custom-status"]);
    expect(statuses.right.map((segment) => segment.key)).toEqual(["pi-quota-status"]);
  });

  it("hides cache statistics by default so quota remains visible", () => {
    const statuses = collectExtensionStatusSegments(
      new Map([
        ["pi-cache-stats", "OpenAI cache 0/0 · 0M/0M tok"],
        ["pi-quota-status", "Wk 37% 9:49AM (29/07)"],
      ]),
      defaultConfig,
    );

    expect(statuses.right.map((segment) => segment.key)).toEqual([
      "pi-quota-status",
    ]);
  });

  it("keeps quota ahead of cache when cache is explicitly re-enabled", () => {
    const config = withStatusOverrides({ "pi-cache-stats": "right" });
    const statuses = collectExtensionStatusSegments(
      new Map([
        ["pi-cache-stats", "OpenAI cache 0/0 · 0M/0M tok"],
        ["pi-quota-status", "Wk 37% 9:49AM (29/07)"],
      ]),
      config,
    );

    expect(statuses.right.map((segment) => segment.key)).toEqual([
      "pi-quota-status",
      "pi-cache-stats",
    ]);
  });
});
