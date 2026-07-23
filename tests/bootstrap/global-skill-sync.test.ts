import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { isPiManagedNpmPackageRoot, syncExistingGlobalSkills } from "../../scripts/sync-global-skills.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const execFile = promisify(execFileCallback);
const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("global AILI skill synchronization", () => {
  it("replaces only existing same-name skill directories and leaves all other user skills untouched", async () => {
    const home = await mkdtemp(join(tmpdir(), "aili-global-skills-"));
    scratch.push(home);
    const targetRoot = join(home, ".agents", "skills");
    const matching = join(targetRoot, "aili-delivery-flow");
    const userOnly = join(targetRoot, "user-only-skill");

    await mkdir(targetRoot, { recursive: true });
    await cp(join(ROOT, "skills", "aili-delivery-flow"), matching, { recursive: true });
    await writeFile(join(matching, "stale-user-file.txt"), "replace me\n");
    await mkdir(userOnly);
    await writeFile(join(userOnly, "SKILL.md"), "user owned\n");

    const report = await syncExistingGlobalSkills({ packageRoot: ROOT, home });

    expect(report.updated).toEqual(["aili-delivery-flow"]);
    expect(report.skippedMissing).toContain("academic-paper-review");
    expect(await readFile(join(matching, "SKILL.md"), "utf8")).toBe(
      await readFile(join(ROOT, "skills", "aili-delivery-flow", "SKILL.md"), "utf8"),
    );
    await expect(readFile(join(matching, "stale-user-file.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(userOnly, "SKILL.md"), "utf8")).toBe("user owned\n");
    await expect(readFile(join(targetRoot, "academic-paper-review", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not replace a same-name symlink or non-directory", async () => {
    const home = await mkdtemp(join(tmpdir(), "aili-global-skills-"));
    scratch.push(home);
    const targetRoot = join(home, ".agents", "skills");
    await mkdir(targetRoot, { recursive: true });
    const target = join(targetRoot, "aili-delivery-flow");
    await writeFile(target, "not a skill directory\n");

    const report = await syncExistingGlobalSkills({ packageRoot: ROOT, home });

    expect(report.updated).toEqual([]);
    expect(report.skippedUnsafe).toEqual(["aili-delivery-flow"]);
    expect(await readFile(target, "utf8")).toBe("not a skill directory\n");
  });

  it("runs the lifecycle script only from a Pi-managed npm package root", async () => {
    const home = await mkdtemp(join(tmpdir(), "aili-global-skills-"));
    scratch.push(home);
    const packageRoot = join(home, ".pi", "agent", "npm", "node_modules", "@rosetears", "aili-pi");
    const target = join(home, ".agents", "skills", "aili-delivery-flow");
    await mkdir(join(packageRoot, "scripts"), { recursive: true });
    await mkdir(join(home, ".agents", "skills"), { recursive: true });
    await cp(join(ROOT, "skills"), join(packageRoot, "skills"), { recursive: true });
    await cp(join(ROOT, "scripts", "sync-global-skills.mjs"), join(packageRoot, "scripts", "sync-global-skills.mjs"));
    await cp(join(ROOT, "skills", "aili-delivery-flow"), target, { recursive: true });
    await writeFile(join(target, "stale-user-file.txt"), "replace me\n");

    const { stdout } = await execFile(
      process.execPath,
      [join(packageRoot, "scripts", "sync-global-skills.mjs"), "--if-pi-managed"],
      { env: { HOME: home, PATH: process.env.PATH } },
    );

    expect(stdout).toContain("updated=1");
    await expect(readFile(join(target, "stale-user-file.txt"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recognizes only Pi-managed npm package roots for lifecycle synchronization", () => {
    const home = "/tmp/aili-home";
    expect(
      isPiManagedNpmPackageRoot(
        join(home, ".pi", "agent", "npm", "node_modules", "@rosetears", "aili-pi"),
        home,
      ),
    ).toBe(true);
    expect(
      isPiManagedNpmPackageRoot(join(home, ".pi", "npm", "node_modules", "@rosetears", "aili-pi"), home),
    ).toBe(true);
    expect(isPiManagedNpmPackageRoot(join(home, "code", "aili-pi"), home)).toBe(false);
  });
});
