import { describe, expect, it } from "vitest";
import { collectExtensionStatusSegments } from "../../extensions/zentui/extension-status.js";
import { defaultConfig } from "../../extensions/zentui/config.js";

describe("Zentui extension statuses", () => {
  it("renders the upstream Codex weekly quota window as 7d without fabricating a 5h window", () => {
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
