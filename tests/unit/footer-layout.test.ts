import { visibleWidth } from "@earendil-works/pi-tui";
import { contextTokenLabel, normalizeCodexQuota, permissionModeLabel, renderNativeFooter } from "../../extensions/footer/layout.js";
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
    const primaryRight = "17k/272k · Wk 72% resets Tue · retrying";
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
    expect(primary.indexOf("17k/272k")).toBeLessThan(primary.indexOf("Wk 72%"));
    expect(primary.indexOf("Wk 72%")).toBeLessThan(primary.indexOf("retrying"));
    expect(secondary.indexOf("YOLO")).toBeLessThan(secondary.indexOf("MCP 0/4"));
    expect(secondary.indexOf("MCP 0/4")).toBeLessThan(secondary.indexOf("19:48"));
    expect(secondary).not.toContain("17k/272k");
  });

  it("drops retry, then branch and cwd as needed while retaining the essential groups", () => {
    const narrowPrimary = renderNativeFooter(snapshot, 48)[0];
    expect(narrowPrimary).toContain("openai-codex/gpt-5.6-sol");
    expect(narrowPrimary).toContain("17k/272k");
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

  it("formats actual context tokens compactly and omits invalid numeric usage", () => {
    expect(contextTokenLabel(17_000, 272_000)).toBe("17k/272k");
    expect(contextTokenLabel(9_500, 272_000)).toBe("9.5k/272k");
    expect(contextTokenLabel(undefined, 272_000)).toBeUndefined();
    expect(contextTokenLabel(17_000, 0)).toBeUndefined();
    expect(contextTokenLabel(Number.NaN, 272_000)).toBeUndefined();
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
