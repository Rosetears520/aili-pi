import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateProvenance } from "../../src/runtime/registry.js";
import { renderSourceNotice } from "../../scripts/generate-provenance.js";

describe("provenance and SBOM", () => {
  it("renders optional upstream attribution without claiming copied files", () => {
    const notice = renderSourceNotice({
      name: "opencode-acp",
      repository: "https://example.invalid/opencode-acp.git",
      revision: "0000000000000000000000000000000000000000",
      version: "test",
      license: "test-only",
      status: "reference-only",
      sourceFiles: [],
      symbols: [],
      localChanges: [],
      verification: ["test fixture"],
      attribution: "Based on opencode-dynamic-context-pruning by Tarquinen; modified by ranxianglei, 2026, with 34 bug fixes and performance/stability improvements.",
    });

    expect(notice).toContain("Upstream notice: Based on opencode-dynamic-context-pruning by Tarquinen");
    expect(notice).toContain("modified by ranxianglei, 2026");
    expect(notice).toContain("34 bug fixes and performance/stability improvements");
    expect(notice).toContain("Source files: none copied");
  });

  it("records adapted/dependency provenance and the no-copy OMP reference boundary", async () => {
    expect(await validateProvenance()).toEqual([]);
    const [provenance, notices] = await Promise.all([
      readFile(new URL("../../manifests/provenance.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
    ]);
    expect(provenance.sources).toHaveLength(10);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "adapted")).toHaveLength(3);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "dependency")).toHaveLength(5);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "reference-only")).toHaveLength(2);
    expect(provenance.sources.find((item: { name: string }) => item.name === "Oh My Pi reference")).toMatchObject({
      status: "reference-only",
      revision: "59619623e1eeb7c290649eeaf3a269284ce8adef",
      sourceFiles: [],
      symbols: [],
      localChanges: [],
    });
    expect(provenance.sources.find((item: { name: string }) => item.name === "opencode-acp reference")).toMatchObject({
      repository: "https://github.com/ranxianglei/opencode-acp.git",
      revision: "f1a33d9f4ce55af808eb4e050717c914ed16084b",
      version: "1.12.6",
      license: "AGPL-3.0-or-later",
      status: "reference-only",
      sourceFiles: [],
      symbols: [],
      localChanges: [],
    });
    expect(notices).toContain("## opencode-acp reference");
    expect(notices).toContain("Based on opencode-dynamic-context-pruning by Tarquinen");
    expect(notices).toContain("Source files: none copied");
    expect(provenance.sources.find((item: { name: string }) => item.name === "@agwab/pi-subagent")).toBeUndefined();
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-permission-modes")).toEqual(expect.objectContaining({
      status: "adapted",
      version: "2.2.0",
      sourceFiles: expect.arrayContaining(["src/vendor/pi-permission-modes/index.ts", "src/vendor/pi-permission-modes/resolve.ts"]),
    }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-sakura-cyberdeck")).toEqual(expect.objectContaining({
      status: "adapted",
      revision: "165a1f8011a12a58a6409b56b8a6c0416cd9b589",
      localChanges: expect.arrayContaining([expect.stringContaining("Rose Shimmer")]),
    }));
  });

  it("emits a deterministic SPDX 2.3 inventory with locked package integrity", async () => {
    const sbom = JSON.parse(await readFile(new URL("../../manifests/sbom.json", import.meta.url), "utf8"));
    expect(sbom.spdxVersion).toBe("SPDX-2.3");
    expect(sbom.name).toBe("@rosetears/aili-pi-0.1.13");
    expect(sbom.packages[0]).toMatchObject({
      name: "@rosetears/aili-pi",
      versionInfo: "0.1.13",
      licenseConcluded: "AGPL-3.0-or-later",
      licenseDeclared: "AGPL-3.0-or-later",
    });
    expect(sbom.packages.length).toBeGreaterThan(100);
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "@earendil-works/pi-coding-agent", versionInfo: "0.82.1", licenseDeclared: "MIT" }));
    expect(sbom.relationships).toHaveLength(sbom.packages.length - 1);
  });
});
