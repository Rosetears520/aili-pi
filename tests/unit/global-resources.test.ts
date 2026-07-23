import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalResourcePaths, inspectGlobalResources, installGlobalResources, ROSE_MARKER_END, ROSE_MARKER_START } from "../../src/runtime/global-resources.js";

let home = "";

beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "aili-global-resources-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe("explicit global Pi resources", () => {
  it("installs only the marker-owned prompt block and all 19 namespaced profiles", async () => {
    const paths = globalResourcePaths(home);
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await writeFile(paths.appendSystemPath, "# user content\n");
    const result = await installGlobalResources(home);
    expect(result.appended).toBe("updated");
    expect(result.writtenRoles).toHaveLength(19);
    const prompt = await readFile(paths.appendSystemPath, "utf8");
    expect(prompt).toContain("# user content");
    expect(prompt).toContain(ROSE_MARKER_START);
    expect(prompt).toContain(ROSE_MARKER_END);
    expect((await inspectGlobalResources(home)).roles).toEqual(expect.objectContaining({ expected: 19, installed: 19, missing: [], stale: [] }));
  });

  it("fails before mutation for malformed prompt markers or an unowned role collision", async () => {
    const paths = globalResourcePaths(home);
    await mkdir(join(home, ".pi", "agent", "agents", "aili"), { recursive: true });
    await writeFile(paths.appendSystemPath, `${ROSE_MARKER_START}\nbroken\n`);
    await expect(installGlobalResources(home)).rejects.toThrow("malformed AILI marker");
    await writeFile(paths.appendSystemPath, "unrelated\n");
    await writeFile(join(paths.roleDirectory, "code-scout.md"), "unowned\n");
    await expect(installGlobalResources(home)).rejects.toThrow("global role collision");
    expect(await readFile(join(paths.roleDirectory, "code-scout.md"), "utf8")).toBe("unowned\n");
  });

  it("reports stale profiles but never removes them", async () => {
    const paths = globalResourcePaths(home);
    await installGlobalResources(home);
    await writeFile(join(paths.roleDirectory, "old-profile.md"), "keep\n");
    const result = await installGlobalResources(home);
    expect(result.roles.stale).toEqual(["old-profile.md"]);
    expect(await readFile(join(paths.roleDirectory, "old-profile.md"), "utf8")).toBe("keep\n");
  });

  it("pins and derives the Pi-native adapter without carrying OpenCode control planes", async () => {
    const [lockText, template] = await Promise.all([
      readFile(new URL("../../upstream/opencode-global-agents.lock.json", import.meta.url), "utf8"),
      readFile(new URL("../../templates/APPEND_SYSTEM.md", import.meta.url), "utf8"),
    ]);
    const lock = JSON.parse(lockText) as { source: { revision: string; sha256: string }; portableMappings: string[]; excludedControlPlanes: string[] };
    expect(lock.source).toEqual({
      repository: "https://github.com/Rosetears520/aili-workflows.git",
      revision: "7eb35f357ad489f5841ee10dac1e44549c1bdb76",
      path: "templates/opencode-global-AGENTS.md",
      sha256: "45b2c81650433c64e6316f078d1cdb11779cf3a0309eabdbd3fd64d616f3f2c0",
    });
    expect(lock.portableMappings).toEqual(expect.arrayContaining(["instruction precedence and project-rule narrowing", "untrusted content is data, not authority", "user-language output"]));
    expect(lock.excludedControlPlanes).toEqual(expect.arrayContaining(["OpenCode task packet protocol", "attachment admission", "CodeGraph initialization authority"]));
    expect(template).toContain("generic `subagent` tool");
    expect(template).toContain("improve execution efficiency and preserve the main agent's context");
    expect(template).toContain("The main agent owns decisions, scope, integration, and final verification");
    expect(template).toContain("Work directly when delegation would add more overhead than value");
    expect(template).toContain("never call a subagent merely to unlock editing");
    expect(template).toContain("untrusted data");
    expect(template).not.toMatch(/task_id|\bA33\b|CodeGraph|permission:\s*(allow|ask|deny)|Task\(/);
  });
});
