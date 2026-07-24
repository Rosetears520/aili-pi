import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { resolvePermissionModesPackageRoot } from "../../src/runtime/package-resolution.js";

const execFileAsync = promisify(execFile);

async function exists(path: URL): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("generated permission-mode adaptation", () => {
  it("matches the exact pi-permission-modes 2.2.0 baseline and declared local diff", async () => {
    const root = new URL("../../", import.meta.url);
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", "scripts/sync-permission-modes.ts", "--verify"],
      { cwd: root },
    );
    const lock = JSON.parse(await readFile(new URL("../../upstream/pi-permission-modes.lock.json", import.meta.url), "utf8"));
    expect(stdout).toContain("PASS: pi-permission-modes@2.2.0 adapted matcher");
    expect(lock.package).toMatchObject({
      version: "2.2.0",
      revision: "23d65d10a53b67043cae42322acf9044d6edb196",
      license: "MIT",
    });
    expect(lock.upstreamFiles).toHaveLength(3);
    expect(lock.adaptedFiles).toHaveLength(3);
  });

  it("resolves a hoisted dependency from npm's scoped-package layout", async () => {
    const scratchParent = new URL("../../.tmp/", import.meta.url);
    await mkdir(scratchParent, { recursive: true });
    const scratch = await mkdtemp(fileURLToPath(new URL("permission-mode-hoist-", scratchParent)));
    try {
      const packageRuntime = join(scratch, "node_modules", "@rosetears", "aili-pi", "src", "runtime");
      const dependencyRoot = join(scratch, "node_modules", "pi-permission-modes");
      await mkdir(packageRuntime, { recursive: true });
      await mkdir(dependencyRoot, { recursive: true });
      const caller = join(packageRuntime, "registry.ts");
      await writeFile(caller, "// resolution fixture\n");
      await cp(new URL("../../node_modules/pi-permission-modes/package.json", import.meta.url), join(dependencyRoot, "package.json"));

      const resolved = resolvePermissionModesPackageRoot(pathToFileURL(caller));
      expect(resolve(fileURLToPath(resolved))).toBe(resolve(dependencyRoot));
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it("fails closed when adapted permission source drifts", async () => {
    const scratchParent = new URL("../../.tmp/", import.meta.url);
    await mkdir(scratchParent, { recursive: true });
    const scratch = await mkdtemp(fileURLToPath(new URL("permission-mode-drift-", scratchParent)));
    try {
      await mkdir(join(scratch, "scripts"), { recursive: true });
      await mkdir(join(scratch, "node_modules", "pi-permission-modes", "src"), { recursive: true });
      await mkdir(join(scratch, "src", "vendor"), { recursive: true });
      await mkdir(join(scratch, "src", "runtime"), { recursive: true });
      await mkdir(join(scratch, "licenses"), { recursive: true });
      await mkdir(join(scratch, "upstream"), { recursive: true });
      await cp(new URL("../../scripts/sync-permission-modes.ts", import.meta.url), join(scratch, "scripts", "sync-permission-modes.ts"));
      await cp(new URL("../../src/runtime/package-resolution.ts", import.meta.url), join(scratch, "src", "runtime", "package-resolution.ts"));
      await cp(new URL("../../node_modules/pi-permission-modes/src/index.ts", import.meta.url), join(scratch, "node_modules", "pi-permission-modes", "src", "index.ts"));
      await cp(new URL("../../node_modules/pi-permission-modes/src/resolve.ts", import.meta.url), join(scratch, "node_modules", "pi-permission-modes", "src", "resolve.ts"));
      await cp(new URL("../../node_modules/pi-permission-modes/package.json", import.meta.url), join(scratch, "node_modules", "pi-permission-modes", "package.json"));
      await cp(new URL("../../node_modules/pi-permission-modes/LICENSE", import.meta.url), join(scratch, "node_modules", "pi-permission-modes", "LICENSE"));
      await cp(new URL("../../src/vendor/pi-permission-modes", import.meta.url), join(scratch, "src", "vendor", "pi-permission-modes"), { recursive: true });
      await cp(new URL("../../licenses/pi-permission-modes-MIT.txt", import.meta.url), join(scratch, "licenses", "pi-permission-modes-MIT.txt"));
      await cp(new URL("../../upstream/pi-permission-modes.lock.json", import.meta.url), join(scratch, "upstream", "pi-permission-modes.lock.json"));
      const changed = join(scratch, "src", "vendor", "pi-permission-modes", "resolve.ts");
      await writeFile(changed, `${await readFile(changed, "utf8")}\nmanual drift\n`);

      await expect(
        execFileAsync(process.execPath, ["--experimental-strip-types", "scripts/sync-permission-modes.ts", "--verify"], { cwd: scratch }),
      ).rejects.toThrow("permission-mode adaptation drifted");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});

describe("generated skill baseline", () => {
  it("never permits a lock or snapshot to exist without the other", async () => {
    const lockExists = await exists(new URL("../../upstream/aili-workflows.lock.json", import.meta.url));
    const snapshotExists = await exists(new URL("../../skills", import.meta.url));

    expect(lockExists).toBe(snapshotExists);
  });

  it("matches the pinned upstream lock and complete compatibility inventory", async () => {
    const root = new URL("../../", import.meta.url);
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", "scripts/sync-skills.ts", "--verify"],
      { cwd: root },
    );
    const lock = JSON.parse(await readFile(new URL("../../upstream/aili-workflows.lock.json", import.meta.url), "utf8"));
    const compatibility = JSON.parse(
      await readFile(new URL("../../manifests/skill-compatibility.json", import.meta.url), "utf8"),
    );

    expect(stdout).toContain("PASS: 64 skills");
    expect(lock.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(lock.skillCount).toBe(64);
    expect(compatibility.records).toHaveLength(64);
    expect(new Set(compatibility.records.map((record: { name: string }) => record.name)).size).toBe(64);
  });

  it("fails closed when a generated skill is edited", async () => {
    const scratchParent = new URL("../../.tmp/", import.meta.url);
    await mkdir(scratchParent, { recursive: true });
    const scratch = await mkdtemp(fileURLToPath(new URL("generated-drift-", scratchParent)));
    try {
      await mkdir(join(scratch, "scripts"), { recursive: true });
      await mkdir(join(scratch, "upstream"), { recursive: true });
      await mkdir(join(scratch, "manifests"), { recursive: true });
      await cp(new URL("../../skills", import.meta.url), join(scratch, "skills"), { recursive: true });
      await cp(new URL("../../scripts/sync-skills.ts", import.meta.url), join(scratch, "scripts/sync-skills.ts"));
      await cp(
        new URL("../../upstream/aili-workflows.lock.json", import.meta.url),
        join(scratch, "upstream/aili-workflows.lock.json"),
      );
      await cp(
        new URL("../../manifests/skill-compatibility.json", import.meta.url),
        join(scratch, "manifests/skill-compatibility.json"),
      );
      const changedSkill = join(scratch, "skills/aili-delivery-flow/SKILL.md");
      const original = await readFile(changedSkill, "utf8");
      await writeFile(changedSkill, `${original}\nmanual drift\n`);

      await expect(
        execFileAsync(process.execPath, ["--experimental-strip-types", "scripts/sync-skills.ts", "--verify"], {
          cwd: scratch,
        }),
      ).rejects.toThrow("generated skill snapshot drifted");
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
