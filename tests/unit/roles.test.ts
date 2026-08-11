import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUNDLED_ROLE_SELECTORS,
  loadRoleProfiles,
  resolveRoleProfileOverrides,
  SPECIALIZED_ROLE_SELECTORS,
  validateRoleProfiles,
} from "../../src/runtime/roles.js";

const scratchRoots: string[] = [];

async function scratch(): Promise<string> {
  await mkdir(resolve(".tmp"), { recursive: true });
  const path = await mkdtemp(resolve(".tmp/role-profile-v2-"));
  scratchRoots.push(path);
  return path;
}

function overrideProfile(name: string, marker: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${marker}`,
    "---",
    "",
    `# ${marker}`,
    "",
    "Override prompt only; bundled policy fields remain authoritative.",
    "",
  ].join("\n");
}

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Pi-owned role profiles", () => {
  it("contains the accepted 19 specialized selectors plus general with schema-v2 policy", async () => {
    const lock = JSON.parse(await readFile(new URL("../../upstream/aili-workflows.lock.json", import.meta.url), "utf8"));
    const manifest = JSON.parse(await readFile(new URL("../../manifests/roles.json", import.meta.url), "utf8"));
    expect(lock).toMatchObject({
      repository: "https://github.com/Rosetears520/aili-workflows.git",
      commit: "bb1fedacc46d71045daa6257d121f2b71ba29d54",
    });
    expect(manifest.source).toEqual({ repository: lock.repository, commit: lock.commit });

    const roles = await loadRoleProfiles();
    expect(roles).toHaveLength(20);
    expect(roles.map((role) => role.selector)).toEqual(BUNDLED_ROLE_SELECTORS);
    expect(new Set(roles.map((role) => role.name)).size).toBe(20);
    expect(roles.filter((role) => role.status === "blocked")).toEqual([]);

    const specialized = roles.filter((role) => role.name !== "general");
    expect(specialized).toHaveLength(19);
    expect(specialized.every((role) => role.toolPolicy === "static" && role.spawns.length === 0)).toBe(true);
    expect(specialized.every((role) => role.tools.length > 0 || role.name === "web-researcher")).toBe(true);
    expect(specialized.every((role) => role.capabilities.length > 0)).toBe(true);
    for (const name of ["implementer", "test-engineer"]) {
      const role = roles.find((item) => item.name === name)!;
      expect(role.status).toBe("adapted");
      expect(role.tools).toEqual(expect.arrayContaining(["write", "edit"]));
      expect(role.tools).not.toContain("bash");
      expect(role.capabilities).toContain("repo.write");
    }

    const general = roles.find((role) => role.name === "general")!;
    expect(general).toMatchObject({
      selector: "general",
      sourceKind: "aili-owned",
      sourcePath: null,
      toolPolicy: "inherit-parent",
      blocking: false,
    });
    expect(general.tools).toEqual([]);
    expect(general.spawns).toEqual(SPECIALIZED_ROLE_SELECTORS);
    expect(general.prompt).toContain("general persistent worker Agent");
    expect(await validateRoleProfiles()).toEqual([]);

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.records).not.toContainEqual(expect.objectContaining({ name: "rose" }));
  });

  it("replaces obsolete process lifecycle wording while preserving authority and output semantics", async () => {
    const roles = await loadRoleProfiles();
    for (const role of roles) {
      expect(role.prompt).not.toContain("OpenCode subagent");
      expect(role.prompt).not.toContain("single-use");
      expect(role.prompt).not.toContain("--no-session");
      expect(role.prompt).not.toContain("Recursive AILI task dispatch is unavailable");
      expect(role.prompt).toContain("parent-scoped persistent official Pi Agent session");
      expect(role.prompt).toContain("Return exactly one JSON object");
    }
    for (const role of roles.filter((candidate) => candidate.name !== "general")) {
      expect(role.prompt).toContain("Your result is evidence for ROSE or the user, not final authority");
      expect(role.prompt).toContain("Do not call subagents");
    }
  });

  it("does not shadow a bundled selector without an explicit override", async () => {
    const root = await scratch();
    const userRoot = resolve(root, "user");
    const projectRoot = resolve(root, "project");
    await mkdir(userRoot, { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(resolve(userRoot, "code-scout.md"), overrideProfile("code-scout", "inactive collision"));

    const resolved = await resolveRoleProfileOverrides({
      projectTrusted: true,
      userRoot,
      projectRoot,
      overrides: [],
      discoveredCandidates: [
        { selector: "aili.code-scout", source: "user", profilePath: "code-scout.md" },
      ],
    });
    expect(resolved.roles.find((role) => role.selector === "aili.code-scout")?.sourceKind).toBe("canonical-adapter");
    expect(resolved.diagnostics).toEqual([
      "aili.code-scout: inactive same-name user profile collision requires explicit opt-in",
    ]);
  });

  it("applies explicit trusted project over user prompt shadowing without broadening policy", async () => {
    const root = await scratch();
    const userRoot = resolve(root, "user");
    const projectRoot = resolve(root, "project");
    await mkdir(userRoot, { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(resolve(userRoot, "code-scout.md"), overrideProfile("code-scout", "user override"));
    await writeFile(resolve(projectRoot, "code-scout.md"), overrideProfile("code-scout", "project override"));

    const bundled = (await loadRoleProfiles()).find((role) => role.selector === "aili.code-scout")!;
    const resolved = await resolveRoleProfileOverrides({
      projectTrusted: true,
      userRoot,
      projectRoot,
      overrides: [
        { selector: "aili.code-scout", source: "user", profilePath: "code-scout.md", enabled: true },
        { selector: "aili.code-scout", source: "project", profilePath: "code-scout.md", enabled: true },
      ],
    });
    const role = resolved.roles.find((candidate) => candidate.selector === "aili.code-scout")!;
    expect(role.sourceKind).toBe("project-override");
    expect(role.prompt).toContain("project override");
    expect(role.tools).toEqual(bundled.tools);
    expect(role.spawns).toEqual(bundled.spawns);
    expect(role.capabilities).toEqual(bundled.capabilities);
  });

  it("ignores an untrusted project override and reports the trust boundary", async () => {
    const root = await scratch();
    const userRoot = resolve(root, "user");
    const projectRoot = resolve(root, "project");
    await mkdir(userRoot, { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    await writeFile(resolve(userRoot, "code-scout.md"), overrideProfile("code-scout", "user override"));
    await writeFile(resolve(projectRoot, "code-scout.md"), overrideProfile("code-scout", "untrusted project"));

    const resolved = await resolveRoleProfileOverrides({
      projectTrusted: false,
      userRoot,
      projectRoot,
      overrides: [
        { selector: "aili.code-scout", source: "user", profilePath: "code-scout.md", enabled: true },
        { selector: "aili.code-scout", source: "project", profilePath: "code-scout.md", enabled: true },
      ],
    });
    const role = resolved.roles.find((candidate) => candidate.selector === "aili.code-scout")!;
    expect(role.sourceKind).toBe("user-override");
    expect(role.prompt).toContain("user override");
    expect(resolved.diagnostics).toContain("aili.code-scout: untrusted project override ignored");
  });
});
