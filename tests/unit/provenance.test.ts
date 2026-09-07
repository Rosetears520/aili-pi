import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateProvenance } from "../../src/runtime/registry.js";
import { integrityToSpdxChecksum, renderSourceNotice, validateDependencySource } from "../../scripts/generate-provenance.js";

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
    expect(provenance.sources).toHaveLength(20);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "adapted")).toHaveLength(9);
    expect(provenance.sources.filter((item: { status: string }) => item.status === "dependency")).toHaveLength(6);
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
    expect(notices).toContain("## @agegr/pi-web 0.8.11");
    expect(notices).toContain("Copyright (c) 2026 agegr");
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-codex-fast reference")).toMatchObject({ status: "reference-only", revision: "npm:0.1.5" });
    expect(provenance.sources.find((item: { name: string }) => item.name === "Graphify reference")).toMatchObject({ status: "reference-only", revision: "e4bfd2ad1a9393251023a4edef93e93dc798afc7" });
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-tool-display reference")).toMatchObject({ status: "reference-only", revision: "91cef7580078371f8dc49a8607222807ad6a424d" });
    expect(notices).toContain("Source files: none copied");
    expect(provenance.sources.find((item: { name: string }) => item.name === "@agwab/pi-subagent")).toBeUndefined();
    expect(provenance.sources.find((item: { name: string }) => item.name === "@narumitw/pi-lsp")).toBeUndefined();
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-markdown-preview")).toBeUndefined();
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-mcp-adapter")).toEqual(expect.objectContaining({
      status: "dependency",
      version: "2.32.1",
      revision: "10a45367e033a32026987a75d6f401e37340c86f",
    }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-codex-compact")).toEqual(expect.objectContaining({
      status: "dependency",
      version: "0.52.0",
      revision: "04aae270c51cf4de70479d84317eb15ac8e20e33",
      sourceFiles: expect.arrayContaining(["upstream/pi-codex-compact-0.52.0-src/**"]),
    }));
    expect(provenance.sources.find((item: { name: string }) => item.name === "pi-tui-kit")).toEqual(expect.objectContaining({
      status: "dependency",
      version: "0.60.0",
      revision: "a96c77a6415076182c6817d2abd6739e59418401",
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

  it("rejects dependency provenance version and license drift from the root lock", async () => {
    const [provenance, lock] = await Promise.all([
      readFile(new URL("../../manifests/provenance.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
    ]);
    const source = provenance.sources.find((item: { name: string }) => item.name === "pi-mcp-adapter");
    expect(() => validateDependencySource({ ...source, version: "0.0.0" }, lock.packages)).toThrow(/does not match lock/);
    expect(() => validateDependencySource({ ...source, license: "Apache-2.0" }, lock.packages)).toThrow(/does not match lock/);
  });

  it("binds aili-workflows provenance to the exact rose-aili release", async () => {
    const [provenance, notices] = await Promise.all([
      readFile(new URL("../../manifests/provenance.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
    ]);
    expect(provenance.sources.find((item: { name: string }) => item.name === "aili-workflows")).toMatchObject({
      repository: "https://github.com/Rosetears520/aili-workflows.git",
      revision: "a5284ee105a084392a944aee04313dcf7c294a64",
      version: "0.4.8",
      status: "adapted",
    });
    expect(notices).toContain("Revision: a5284ee105a084392a944aee04313dcf7c294a64");
    expect(notices).toContain("Version: 0.4.8");
  });

  it("converts locked npm SHA512 integrity to canonical SPDX hex", async () => {
    const [lock, sbom] = await Promise.all([
      readFile(new URL("../../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../manifests/sbom.json", import.meta.url), "utf8").then(JSON.parse),
    ]);
    for (const [path, locked] of Object.entries(lock.packages as Record<string, { integrity?: string }>)) {
      if (!locked.integrity) continue;
      const record = sbom.packages.find((item: { comment?: string }) => item.comment?.includes(`lock path=${path};`));
      expect(record).toBeDefined();
      expect(record.checksums).toEqual([{ algorithm: "SHA512", checksumValue: integrityToSpdxChecksum(locked.integrity) }]);
    }
    expect(integrityToSpdxChecksum("sha512-QXKLJnukHn1ZQhywAu1O5SrOXoEMm/ZRrKO9pI5CERgmHrE2zgq/KH97Hs1RmVrszTlH9iVw2KTwndIguAvTVg=="))
      .toMatch(/^[a-f0-9]{128}$/);
  });

  it("rejects unsupported algorithms and malformed SHA512 integrity", () => {
    expect(() => integrityToSpdxChecksum("sha1-abc")).toThrow(/unsupported or invalid npm integrity/);
    expect(() => integrityToSpdxChecksum("sha512-YQ==")).toThrow(/must decode to exactly 64 bytes/);
    expect(() => integrityToSpdxChecksum("sha512-")).toThrow(/unsupported or invalid npm integrity/);
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
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "@earendil-works/pi-coding-agent", versionInfo: "0.84.4", licenseDeclared: "MIT" }));
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "pi-mcp-adapter", versionInfo: "2.32.1", licenseDeclared: "MIT" }));
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "@narumitw/pi-codex-compact", versionInfo: "0.52.0", licenseDeclared: "MIT" }));
    expect(sbom.packages).toContainEqual(expect.objectContaining({ name: "billion-context-pi", versionInfo: "0.1.34", licenseDeclared: "MIT" }));
    expect(sbom.relationships).toHaveLength(sbom.packages.length - 1);
  });
});
