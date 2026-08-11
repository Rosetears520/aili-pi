import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface PackageManifest {
  name: string;
  version: string;
  license: string;
  bin?: unknown;
  engines?: { node?: string };
  files?: string[];
  pi?: { extensions?: string[]; prompts?: string[]; skills?: string[]; themes?: string[] };
  bundledDependencies?: string[];
  bundleDependencies?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: unknown;
}

async function readManifest(): Promise<PackageManifest> {
  return JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
}

describe("Pi package baseline", () => {
  it("declares one AILI extension, five prompts, one Rose theme, and no replacement CLI", async () => {
    const manifest = await readManifest();

    expect(manifest.name).toBe("@rosetears/aili-pi");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.license).toBe("AGPL-3.0-or-later");
    expect(manifest.bin).toBeUndefined();
    expect(manifest.engines?.node).toBe(">=22.19.0");
    expect(manifest.pi?.extensions).toEqual([
      "./extensions/index.ts",
      "./extensions/header/index.ts",
      "./extensions/matrix/index.ts",
      "./extensions/zentui/index.ts",
    ]);
    expect(manifest.pi?.prompts).toHaveLength(5);
    expect(manifest.pi?.themes).toEqual(["./themes/rose-cyberdeck.json"]);
    expect(manifest.bundledDependencies).toEqual(["pi-cache-optimizer"]);
    expect(manifest.bundleDependencies).toEqual(["pi-cache-optimizer"]);
    expect(manifest.dependencies).not.toHaveProperty("@narumitw/pi-lsp");
    expect(manifest.dependencies).not.toHaveProperty("pi-markdown-preview");
    expect(manifest.dependencies).not.toHaveProperty("@agwab/pi-subagent");
    expect(manifest.devDependencies?.["@earendil-works/pi-coding-agent"]).toBe("0.82.1");
    expect(JSON.stringify(manifest.overrides ?? {})).not.toContain("372000");
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
    expect(manifest.files).toContain("!src/runtime/aili-compact/");
    expect(manifest.files).toContain("!docs/aili-compact.md");
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

  it("keeps the repository snapshot out of the package and registers only the Pi-owned skill", async () => {
    const manifest = await readManifest();
    expect(manifest.files).not.toContain("skills/");
    expect(manifest.pi?.skills).toEqual(["./node_modules/pi-web-access/skills"]);
  });

  it("includes user documentation and generated provenance gates", async () => {
    const manifest = await readManifest();
    expect(manifest.files).toEqual(expect.arrayContaining(["README.md", "THIRD_PARTY_NOTICES.md", "manifests/", "upstream/", "licenses/"]));
    const [readme, permissionLock, packageLock, licenseText] = await Promise.all([
      readFile(new URL("../../README.md", import.meta.url), "utf8"),
      readFile(new URL("../../upstream/pi-permission-modes.lock.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../LICENSE", import.meta.url), "utf8"),
      access(new URL("../../src/vendor/pi-permission-modes/index.ts", import.meta.url)),
      access(new URL("../../licenses/pi-permission-modes-MIT.txt", import.meta.url)),
    ]);
    expect(readme).toContain("universal OS sandbox");
    expect(readme).toContain("/aili-doctor");
    expect(readme).toContain("Rose Cyberdeck");
    expect(readme).toContain("/rose-matrix");
    expect(readme).toContain("fixed-bottom editor");
    expect(readme).toContain("public `task`/`hub` persistent Agent framework");
    expect(readme).not.toContain("@agwab/pi-subagent");
    expect(readme).toContain("npx -y rose-aili@0.4.2 install");
    expect(readme).toContain("npx -y rose-aili@0.4.2 update");
    expect(readme).toContain("A moving `rose-aili@latest`");
    expect(readme).toContain("Pi alone installs, lists, updates, and removes the Package resources");
    expect(readme).toContain("65-skill/588-file verification snapshot");
    expect(readme).toContain("not included in the npm tarball");
    expect(readme).not.toContain("During a Pi-managed npm install or update, the package replaces");
    expect(readme).not.toContain("installed Package embeds the pinned skills");
    expect(readme).toContain("version 0.1.13 and later is licensed under `AGPL-3.0-or-later`");
    expect(packageLock).toMatchObject({
      name: "@rosetears/aili-pi",
      version: "0.2.0",
      packages: { "": { name: "@rosetears/aili-pi", version: "0.2.0", license: "AGPL-3.0-or-later" } },
    });
    expect(JSON.stringify(packageLock)).not.toContain("@agwab/pi-subagent");
    expect(createHash("sha256").update(licenseText).digest("hex")).toBe("0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0");
    expect(licenseText).toContain("GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007");
    expect(licenseText).toContain("How to Apply These Terms to Your New Programs");
    expect(licenseText).toContain("either version 3 of the License, or\n    (at your option) any later version");
    expect(permissionLock.package).toMatchObject({ version: "2.2.0", revision: "23d65d10a53b67043cae42322acf9044d6edb196" });
  });
});
