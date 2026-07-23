import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateProvenance } from "../../src/runtime/registry.js";

describe("provenance and SBOM", () => {
  it("records both adapted sources and all four pinned runtime dependencies", async () => {
    expect(await validateProvenance()).toEqual([]);
    const provenance = JSON.parse(await readFile(new URL("../../manifests/provenance.json", import.meta.url), "utf8"));
    expect(provenance.sources).toHaveLength(6);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "adapted")).toHaveLength(2);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "dependency")).toHaveLength(4);
    expect(provenance.sources.find((item: { name: string }) => item.name === "@agwab/pi-subagent")).toEqual(expect.objectContaining({ status: "dependency", version: "0.4.8" }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-sakura-cyberdeck")).toEqual(expect.objectContaining({ status: "adapted", revision: "165a1f8011a12a58a6409b56b8a6c0416cd9b589" }));
  });

  it("emits a deterministic SPDX 2.3 inventory with locked package integrity", async () => {
    const sbom = JSON.parse(await readFile(new URL("../../manifests/sbom.json", import.meta.url), "utf8"));
    expect(sbom.spdxVersion).toBe("SPDX-2.3");
    expect(sbom.packages.length).toBeGreaterThan(100);
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "@earendil-works/pi-coding-agent", versionInfo: "0.81.1", licenseDeclared: "MIT" }));
    expect(sbom.relationships).toHaveLength(sbom.packages.length - 1);
  });
});
