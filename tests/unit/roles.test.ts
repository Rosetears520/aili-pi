import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { loadRoleProfiles, validateRoleProfiles } from "../../src/runtime/roles.js";

describe("Pi-owned role profiles", () => {
  it("contains exactly the accepted 19 profiles with explicit ceilings and provenance", async () => {
    const roles = await loadRoleProfiles();
    expect(roles).toHaveLength(19);
    expect(new Set(roles.map((role) => role.name)).size).toBe(19);
    expect(roles.every((role) => role.tools.length > 0 || role.name === "web-researcher")).toBe(true);
    expect(roles.every((role) => role.capabilities.length > 0)).toBe(true);
    expect(roles.filter((role) => role.status === "blocked")).toEqual([]);
    for (const name of ["implementer", "test-engineer"]) {
      const role = roles.find((item) => item.name === name)!;
      expect(role.status).toBe("adapted");
      expect(role.tools).toEqual(expect.arrayContaining(["write", "edit"]));
      expect(role.tools).not.toContain("bash");
      expect(role.capabilities).toContain("repo.write");
    }
    expect(await validateRoleProfiles()).toEqual([]);

    const manifest = await readFile(new URL("../../manifests/roles.json", import.meta.url), "utf8");
    expect(manifest).toContain("7eb35f357ad489f5841ee10dac1e44549c1bdb76");
    expect(manifest).not.toContain('"name": "rose"');
  });

  it("keeps unsupported OpenCode frontmatter inert", async () => {
    const roles = await loadRoleProfiles();
    for (const role of roles) {
      expect(role.prompt).not.toContain("OpenCode subagent");
      expect(role.prompt).toContain("Recursive AILI task dispatch is unavailable");
      expect(role.prompt).toContain("Return exactly one JSON object");
    }
  });
});
