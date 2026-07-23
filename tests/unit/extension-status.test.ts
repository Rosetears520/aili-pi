import { describe, expect, it } from "vitest";
import { collectExtensionStatusSegments } from "../../extensions/zentui/extension-status.js";
import { defaultConfig } from "../../extensions/zentui/config.js";

describe("Zentui extension statuses", () => {
  it("renders the Codex short-window quota without the 5h label", () => {
    const statuses = collectExtensionStatusSegments(
      new Map([["pi-quota-status", "5h 38% 9:49AM (29/07)"]]),
      defaultConfig,
    );

    expect(statuses.right).toContainEqual(expect.objectContaining({
      key: "pi-quota-status",
      text: "codex 38% 9:49AM (29/07)",
    }));
  });

  it("renders the upstream Codex weekly quota window as 7d without fabricating a short window", () => {
    const statuses = collectExtensionStatusSegments(
      new Map([["pi-quota-status", "Wk 50% 9:49AM (29/07)"]]),
      defaultConfig,
    );

    expect(statuses.right).toContainEqual(expect.objectContaining({
      key: "pi-quota-status",
      text: "7d 50% 9:49AM (29/07)",
    }));
  });
});
