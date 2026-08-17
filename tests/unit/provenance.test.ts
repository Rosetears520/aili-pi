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
      attribution: "Based on opencode-dynamic-context-pruning by Tarquinen; modified by ranxianglei, 2026, with 35 bug fixes plus performance and stability improvements.",
    });

    expect(notice).toContain("Upstream notice: Based on opencode-dynamic-context-pruning by Tarquinen");
    expect(notice).toContain("modified by ranxianglei, 2026");
    expect(notice).toContain("35 bug fixes plus performance and stability improvements");
    expect(notice).toContain("Source files: none copied");
  });

  it("records adapted/dependency provenance and no-copy reference boundaries", async () => {
    expect(await validateProvenance()).toEqual([]);
    const [provenance, notices] = await Promise.all([
      readFile(new URL("../../manifests/provenance.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
    ]);
    expect(provenance.sources).toHaveLength(17);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "adapted")).toHaveLength(7);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "dependency")).toHaveLength(5);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "reference-only")).toHaveLength(5);
    expect(provenance.sources.find((item: { name: string }) => item.name === "Oh My Pi reference")).toMatchObject({
      status: "reference-only",
      revision: "59619623e1eeb7c290649eeaf3a269284ce8adef",
      sourceFiles: [],
      symbols: [],
      localChanges: [],
    });
    expect(provenance.sources.find((item: { name: string }) => item.name === "algal pi-openai-server-compaction reference")).toMatchObject({
      repository: "https://github.com/algal/pi-openai-server-compaction.git",
      revision: "8a3de2f3b0c178fdd6f73f2f94172dfc3943e466",
      license: "MIT",
      status: "reference-only",
      sourceFiles: [],
      symbols: [],
      localChanges: [],
    });
    expect(notices).toContain("## algal pi-openai-server-compaction reference");
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-codex-fast reference")).toMatchObject({ status: "reference-only", revision: "npm:0.1.5" });
    expect(provenance.sources.find((item: { name: string }) => item.name === "Graphify reference")).toMatchObject({ status: "reference-only", revision: "e4bfd2ad1a9393251023a4edef93e93dc798afc7" });
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-tool-display reference")).toMatchObject({ status: "reference-only", revision: "91cef7580078371f8dc49a8607222807ad6a424d" });
    expect(notices).toContain("Source files: none copied");
    expect(provenance.sources.find((item: { name: string }) => item.name === "@agwab/pi-subagent")).toBeUndefined();
    expect(provenance.sources.find((item: { name: string }) => item.name === "@narumitw/pi-lsp")).toBeUndefined();
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-markdown-preview")).toBeUndefined();
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-mcp-adapter")).toEqual(expect.objectContaining({
      status: "dependency",
      version: "2.23.0",
      revision: "49e25be1cb917329980eb7a40786c5b91dddb277",
    }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-permission-modes")).toEqual(expect.objectContaining({
      status: "adapted",
      version: "2.2.0",
      sourceFiles: expect.arrayContaining(["src/vendor/pi-permission-modes/index.ts", "src/vendor/pi-permission-modes/resolve.ts"]),
    }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-sakura-cyberdeck")).toEqual(expect.objectContaining({
      status: "adapted",
      revision: "165a1f8011a12a58a6409b56b8a6c0416cd9b589",
      version: "git:165a1f8011a12a58a6409b56b8a6c0416cd9b589",
      localChanges: expect.arrayContaining([expect.stringContaining("no header, Matrix, Zentui extension or theme is registered")]),
    }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-notify")).toEqual(expect.objectContaining({
      status: "adapted",
      revision: "a17c63ef1c3071d793aad7e9d327a3728f2ad88c",
      version: "1.4.0",
      license: "MIT",
    }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-file-context")).toEqual(expect.objectContaining({
      status: "adapted",
      revision: "7624b3c50d09d2e9dafa8dbc810c7f2adb453d70",
      version: "0.53.0",
      license: "MIT",
    }));
    expect(notices).not.toContain("Version: undefined");
  });

  it("binds aili-workflows provenance to the exact rose-aili release", async () => {
    const [provenance, notices] = await Promise.all([
      readFile(new URL("../../manifests/provenance.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
    ]);
    expect(provenance.sources.find((item: { name: string }) => item.name === "aili-workflows")).toMatchObject({
      repository: "https://github.com/Rosetears520/aili-workflows.git",
      revision: "a69f3149d8f1db81726128c2819a3ccc954b9ccc",
      version: "0.4.7",
      status: "adapted",
    });
    expect(notices).toContain("Revision: a69f3149d8f1db81726128c2819a3ccc954b9ccc");
    expect(notices).toContain("Version: 0.4.7");
  });

  it("emits a deterministic SPDX 2.3 inventory with locked package integrity", async () => {
    const sbom = JSON.parse(await readFile(new URL("../../manifests/sbom.json", import.meta.url), "utf8"));
    expect(sbom.spdxVersion).toBe("SPDX-2.3");
    expect(sbom.name).toBe("@rosetears/aili-pi-0.2.9");
    expect(sbom.creationInfo).toMatchObject({
      created: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      creators: ["Tool: @rosetears/aili-pi scripts/generate-provenance.ts"],
    });
    expect(sbom.packages[0]).toMatchObject({
      name: "@rosetears/aili-pi",
      versionInfo: "0.2.9",
      licenseConcluded: "MIT",
      licenseDeclared: "MIT",
    });
    expect(sbom.packages.length).toBeGreaterThan(100);
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "@earendil-works/pi-coding-agent", versionInfo: "0.84.1", licenseDeclared: "MIT" }));
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "pi-mcp-adapter", versionInfo: "2.23.0", licenseDeclared: "MIT" }));
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "@narumitw/pi-codex-compact", versionInfo: "0.50.0", licenseDeclared: "MIT" }));
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "billion-context-pi", versionInfo: "0.1.34", licenseDeclared: "MIT" }));
    expect(sbom.relationships).toHaveLength(sbom.packages.length - 1);
  });
});
