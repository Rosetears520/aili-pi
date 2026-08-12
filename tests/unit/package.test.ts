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
  it("declares one AILI entry with its minimal footer, five prompts, and no replacement CLI or theme", async () => {
    const manifest = await readManifest();

    expect(manifest.name).toBe("@rosetears/aili-pi");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.license).toBe("MIT");
    expect(manifest.bin).toBeUndefined();
    expect(manifest.engines?.node).toBe(">=22.19.0");
    expect(manifest.pi?.extensions).toEqual(["./extensions/index.ts"]);
    expect(manifest.pi?.prompts).toHaveLength(5);
    expect(manifest.pi?.themes).toBeUndefined();
    expect(manifest.bundledDependencies).toEqual(["@narumitw/pi-codex-compact", "acp-kernel", "pi-cache-optimizer"]);
    expect(manifest.bundleDependencies).toEqual(["@narumitw/pi-codex-compact", "acp-kernel", "pi-cache-optimizer"]);
    expect(manifest.dependencies).not.toHaveProperty("@narumitw/pi-lsp");
    expect(manifest.dependencies).not.toHaveProperty("pi-markdown-preview");
    expect(manifest.dependencies).not.toHaveProperty("@agwab/pi-subagent");
    expect(manifest.devDependencies?.["@earendil-works/pi-agent-core"]).toBe("0.84.1");
    expect(manifest.devDependencies?.["@earendil-works/pi-ai"]).toBe("0.84.1");
    expect(manifest.devDependencies?.["@earendil-works/pi-coding-agent"]).toBe("0.84.1");
    expect(manifest.devDependencies?.["@earendil-works/pi-tui"]).toBe("0.84.1");
    expect(manifest.dependencies?.["pi-mcp-adapter"]).toBe("2.23.0");
    expect(JSON.stringify(manifest.overrides ?? {})).not.toContain("372000");
  });

  it("references package resources that exist", async () => {
    const manifest = await readManifest();
    const resources = [...(manifest.pi?.extensions ?? []), ...(manifest.pi?.prompts ?? []), ...(manifest.pi?.skills ?? []), ...(manifest.pi?.themes ?? [])];

    await Promise.all(resources.map((resource) => access(new URL(`../../${resource}`, import.meta.url))));
  });

  it("exposes only the AILI entry and package-owned minimal footer source", async () => {
    const manifest = await readManifest();
    expect(manifest.pi?.extensions).toHaveLength(1);
    expect(manifest.pi?.extensions).not.toEqual(expect.arrayContaining([
      "./extensions/header/index.ts",
      "./extensions/matrix/index.ts",
      "./extensions/zentui/index.ts",
    ]));
    expect(manifest.files).toContain("extensions/index.ts");
    expect(manifest.files).toContain("extensions/footer/");
    expect(manifest.files).toContain("src/");
    expect(manifest.files).not.toContain("!src/runtime/aili-compact/");
    expect(manifest.files).not.toContain("!docs/aili-compact.md");
    expect(manifest.files).not.toContain("themes/");
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
    expect(manifest.files).toEqual(expect.arrayContaining([
      "!upstream/aili-workflows-runtime/AGENTS.md",
      "!upstream/aili-workflows-runtime/prompts/",
    ]));
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
    expect(readme).toContain("Pi-native UI");
    expect(readme).not.toContain("/rose-matrix");
    expect(readme).not.toContain("fixed-bottom editor");
    expect(readme).toContain("public `task`/`hub` persistent Agent framework");
    expect(readme).not.toContain("@agwab/pi-subagent");
    expect(readme).toContain("npx -y rose-aili@0.4.7 install");
    expect(readme).toContain("npx -y rose-aili@0.4.7 update");
    expect(readme).toContain("A moving `rose-aili@latest`");
    expect(readme).toContain("Pi alone installs, lists, updates, and removes the Package resources");
    expect(readme).toContain("58-skill/562-file verification snapshot");
    expect(readme).toContain("20 specialized `aili.*` selectors");
    expect(readme).toContain("no longer registers `/aili-install-global-resources`");
    expect(readme).toContain("not included in the npm tarball");
    expect(readme).not.toContain("During a Pi-managed npm install or update, the package replaces");
    expect(readme).not.toContain("installed Package embeds the pinned skills");
    expect(readme).toContain("is licensed under the MIT License");
    expect(packageLock).toMatchObject({
      name: "@rosetears/aili-pi",
      version: "0.2.1",
      packages: { "": { name: "@rosetears/aili-pi", version: "0.2.1", license: "MIT" } },
    });
    expect(JSON.stringify(packageLock)).not.toContain("@agwab/pi-subagent");
    expect(createHash("sha256").update(licenseText).digest("hex")).toBe("50d626e331a5b05c3a574ae969762851070af5b32dbc73cc2277409eec1358f4");
    expect(licenseText).toMatch(/^MIT License/);
    expect(licenseText).toContain("Permission is hereby granted, free of charge");
    expect(licenseText).toContain("THE SOFTWARE IS PROVIDED \"AS IS\"");
    expect(permissionLock.package).toMatchObject({ version: "2.2.0", revision: "23d65d10a53b67043cae42322acf9044d6edb196" });
  });
});
