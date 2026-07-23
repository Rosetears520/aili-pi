import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface PackageManifest {
  name: string;
  bin?: unknown;
  engines?: { node?: string };
  files?: string[];
  pi?: { extensions?: string[]; prompts?: string[]; themes?: string[] };
}

async function readManifest(): Promise<PackageManifest> {
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

describe("Pi package baseline", () => {
  it("declares one AILI extension, five prompts, and no replacement CLI or theme", async () => {
    const manifest = await readManifest();

    expect(manifest.name).toBe("@rosetears/aili-pi");
    expect(manifest.bin).toBeUndefined();
    expect(manifest.engines?.node).toBe(">=22.19.0");
    expect(manifest.pi?.extensions).toEqual(["./extensions/index.ts"]);
    expect(manifest.pi?.prompts).toHaveLength(5);
    expect(manifest.pi?.themes).toBeUndefined();
  });

  it("references package resources that exist", async () => {
    const manifest = await readManifest();
    const resources = [...(manifest.pi?.extensions ?? []), ...(manifest.pi?.prompts ?? [])];

    await Promise.all(resources.map((resource) => access(new URL(`../../${resource}`, import.meta.url))));
  });

  it("exposes only the owned entry as an Extension resource", async () => {
    const manifest = await readManifest();
    expect(manifest.pi?.extensions).toEqual(["./extensions/index.ts"]);
    expect(manifest.files).toContain("extensions/");
    expect(manifest.files).toContain("src/");
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

  it("includes user documentation and generated provenance gates", async () => {
    const manifest = await readManifest();
    expect(manifest.files).toEqual(expect.arrayContaining(["README.md", "THIRD_PARTY_NOTICES.md", "manifests/"]));
    const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
    expect(readme).toContain("universal OS sandbox");
    expect(readme).toContain("/aili-doctor");
    expect(readme).toContain("Theme, TUI, and font resources are deferred");
  });
});
