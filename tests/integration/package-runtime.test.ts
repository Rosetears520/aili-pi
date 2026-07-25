import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));

describe("offline packaged runtime discovery", () => {
  it("loads the complete owned Extension surface without runtime source fetch", async () => {
    const result = await discoverAndLoadExtensions([entry], root, `${root}/.tmp/pi-integration-agent`);
    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
    const extension = result.extensions[0]!;
    const commands = [...extension.commands.keys()];
    const tools = [...extension.tools.keys()];
    const shortcuts = [...extension.shortcuts.keys()];
    expect(commands).toEqual(expect.arrayContaining([
      "aili-doctor", "aili-install-global-resources", "aili-agent-model", "perm", "quota",
      "cache-optimizer", "preview", "preview-browser", "preview-pdf", "preview-clear-cache", "lsp",
    ]));
    expect(commands).not.toContain("aili-mode");
    expect(tools).toEqual(expect.arrayContaining([
      "task", "hub", "web_search", "fetch_content", "get_search_content", "preview_export", "lsp_diagnostics", "lsp_fix",
    ]));
    expect(tools).not.toContain("subagent");
    expect(tools).not.toContain("aili_task");
    expect(shortcuts).toContain("alt+m");
    expect(shortcuts).not.toContain("ctrl+shift+alt+a");
    expect([...extension.handlers.keys()]).toEqual(expect.arrayContaining(["before_agent_start", "session_start", "tool_call"]));
  });

  it("ships the pinned snapshot without registering it as a duplicate Pi skill source", async () => {
    const [compatibility, roles, packageJson] = await Promise.all([
      readFile(new URL("../../manifests/skill-compatibility.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../manifests/roles.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../../package.json", import.meta.url), "utf8").then(JSON.parse),
    ]);
    const skillDirectories = (await readdir(new URL("../../skills/", import.meta.url), { withFileTypes: true })).filter((item) => item.isDirectory()).map((item) => item.name).sort();
    expect(skillDirectories).toEqual(compatibility.records.map((item: { name: string }) => item.name).sort());
    expect(skillDirectories).toHaveLength(64);
    expect(roles.schemaVersion).toBe(2);
    expect(roles.records).toHaveLength(20);
    expect(roles.bundledSelectors).toEqual(expect.arrayContaining(["general", "aili.code-scout", "aili.implementer"]));
    expect(packageJson.pi.prompts).toEqual([
      "./prompts/ideate.md", "./prompts/define.md", "./prompts/build.md", "./prompts/ship.md", "./prompts/local-review.md",
    ]);
    expect(packageJson.pi.skills).toEqual(["./node_modules/pi-web-access/skills"]);
    expect(await readFile(new URL("../../node_modules/pi-web-access/skills/librarian/SKILL.md", import.meta.url), "utf8")).toContain("Librarian");
    await Promise.all(skillDirectories.map((name) => readFile(new URL(`../../skills/${name}/SKILL.md`, import.meta.url), "utf8")));
  });
});
