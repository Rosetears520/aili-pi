import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface PackageManifest {
  name: string;
  bin?: unknown;
  engines?: { node?: string };
  files?: string[];
  pi?: { extensions?: string[]; prompts?: string[]; skills?: string[]; themes?: string[] };
}

async function readManifest(): Promise<PackageManifest> {
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

describe("Pi package baseline", () => {
  it("declares one AILI extension, five prompts, one Rem theme, and no replacement CLI", async () => {
    const manifest = await readManifest();

    expect(manifest.name).toBe("@rosetears/aili-pi");
    expect(manifest.bin).toBeUndefined();
    expect(manifest.engines?.node).toBe(">=22.19.0");
    expect(manifest.pi?.extensions).toEqual([
      "./extensions/index.ts",
      "./extensions/header/index.ts",
      "./extensions/matrix/index.ts",
      "./extensions/zentui/index.ts",
    ]);
    expect(manifest.pi?.prompts).toHaveLength(5);
    expect(manifest.pi?.themes).toEqual(["./themes/rem-cyberdeck.json"]);
  });

  it("references package resources that exist", async () => {
    const manifest = await readManifest();
    const resources = [...(manifest.pi?.extensions ?? []), ...(manifest.pi?.prompts ?? []), ...(manifest.pi?.skills ?? []), ...(manifest.pi?.themes ?? [])];

    await Promise.all(resources.map((resource) => access(new URL(`../../${resource}`, import.meta.url))));
  });

  it("exposes the AILI entry plus the three selected Sakura-derived Extension resources", async () => {
    const manifest = await readManifest();
    expect(manifest.pi?.extensions).toHaveLength(4);
    expect(manifest.files).toContain("extensions/");
    expect(manifest.files).toContain("src/");
    expect(manifest.files).toContain("themes/");
  });

  it("packages five described prompts with explicit lifecycle boundaries", async () => {
    const manifest = await readManifest();
    const prompts = manifest.pi?.prompts ?? [];
    const contents = await Promise.all(
      prompts.map((prompt) => readFile(new URL(`../../${prompt}`, import.meta.url), "utf8")),
    );
    expect(contents.every((content) => content.startsWith("---\ndescription:"))).toBe(true);
    expect(contents.join("\n")).toContain("does not itself grant approval");
    expect(contents.join("\n")).toContain("not a fifth lifecycle mode");
  });

  it("keeps the AILI snapshot packaged but registers only the non-conflicting librarian skill", async () => {
    const manifest = await readManifest();
    expect(manifest.files).toContain("skills/");
    expect(manifest.pi?.skills).toEqual(["./node_modules/pi-web-access/skills"]);
  });

  it("includes user documentation and generated provenance gates", async () => {
    const manifest = await readManifest();
    expect(manifest.files).toEqual(expect.arrayContaining(["README.md", "THIRD_PARTY_NOTICES.md", "manifests/"]));
    const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
    expect(readme).toContain("universal OS sandbox");
    expect(readme).toContain("/aili-doctor");
    expect(readme).toContain("Rem Cyberdeck");
    expect(readme).toContain("fixed-bottom editor");
  });
});
