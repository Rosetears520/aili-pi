import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("project and third-party license disposition", () => {
  it("keeps root metadata and license on MIT with a complete retained-boundary disposition", async () => {
    const [manifest, lock, license, readme, disposition] = await Promise.all([
      readFile(new URL("../../package.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../LICENSE", import.meta.url), "utf8"),
      readFile(new URL("../../README.md", import.meta.url), "utf8"),
      readFile(new URL("../../docs/license-disposition.md", import.meta.url), "utf8"),
    ]);
    expect(manifest.license).toBe("MIT");
    expect(lock.packages[""].license).toBe("MIT");
    expect(license).toMatch(/^MIT License/);
    expect(readme).toContain("licensed under the MIT License");
    for (const boundary of ["upstream/billion-context-pi/", "upstream/pi-retry-0.31.0/", "upstream/pi-codex-compact-", "npm dependencies"]) {
      expect(disposition).toContain(boundary);
    }
    expect(disposition).toContain("Playwright MCP remains Apache-2.0");
  });
});
