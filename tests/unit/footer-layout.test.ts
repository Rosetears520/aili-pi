import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { renderNativeFooter } from "../../extensions/footer/layout.js";

const snapshot = {
  provider: "openai-codex",
  model: "gpt-5.6-sol",
  quota: "Wk 72% resets Tue",
  updateAge: "updated 4m",
  clock: "19:48",
  context: "ctx 24%",
  gitBranch: "feature/native-ui",
  cwd: "aili-pi",
};

describe("Pi-native minimal footer layout", () => {
  it("prioritizes model and quota and drops optional fields deterministically", () => {
    expect(renderNativeFooter(snapshot, 120)).toContain("openai-codex/gpt-5.6-sol · Wk 72%");
    const narrow = renderNativeFooter(snapshot, 48);
    expect(narrow).toContain("openai-codex/gpt-5.6-sol");
    expect(narrow).not.toContain("aili-pi");
    expect(renderNativeFooter(snapshot, 48)).toBe(narrow);
  });

  it.each([0, 1, 8, 24, 40, 80])("never exceeds %i display cells", (width) => {
    expect(visibleWidth(renderNativeFooter({ ...snapshot, model: "模型-sol" }, width))).toBeLessThanOrEqual(Math.max(0, width));
  });

  it("omits unavailable optional data and normalizes multiline status text", () => {
    const line = renderNativeFooter({ provider: "openai-codex", model: "sol", quota: "quota\n72%\treset" }, 80);
    expect(line).toBe("openai-codex/sol · quota 72% reset");
    expect(line).not.toContain("undefined");
  });
});
