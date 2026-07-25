import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateProvenance } from "../../src/runtime/registry.js";

describe("provenance and SBOM", () => {
  it("records adapted/dependency provenance and the no-copy OMP reference boundary", async () => {
    expect(await validateProvenance()).toEqual([]);
    const provenance = JSON.parse(await readFile(new URL("../../manifests/provenance.json", import.meta.url), "utf8"));
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
      status: "reference-only",
      revision: "f1a33d9f4ce55af808eb4e050717c914ed16084b",
      license: "AGPL-3.0-or-later",
      sourceFiles: [],
      symbols: [],
      localChanges: [],
    });
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
    expect(sbom.packages.length).toBeGreaterThan(100);
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "@earendil-works/pi-coding-agent", versionInfo: "0.81.1", licenseDeclared: "MIT" }));
    expect(sbom.relationships).toHaveLength(sbom.packages.length - 1);
  });
});
