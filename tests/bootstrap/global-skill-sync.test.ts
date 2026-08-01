import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const execFile = promisify(execFileCallback);
const scratch: string[] = [];

type PackageManifest = {
  files?: string[];
  scripts?: Record<string, string>;
};

type LockManifest = {
  packages?: Record<string, Record<string, unknown>>;
};

type PackResult = Array<{
  files?: Array<{ path: string }>;
}>;

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("shared skill distribution boundary", () => {
  it("has no package lifecycle owner or generic skills publication entry", async () => {
    const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as PackageManifest;
    const packageLock = JSON.parse(await readFile(join(ROOT, "package-lock.json"), "utf8")) as LockManifest;

    expect(packageJson.scripts).not.toHaveProperty("postinstall");
    expect(packageLock.packages?.[""]).not.toHaveProperty("hasInstallScript");
    expect(packageJson.files).not.toContain("skills/");
  });

  it("keeps generic skills and the removed synchronizer out of the packed inventory", async () => {
    const temporaryRoot = join(ROOT, ".tmp");
    await mkdir(temporaryRoot, { recursive: true });
    const runRoot = await mkdtemp(join(temporaryRoot, "global-skill-sync-"));
    scratch.push(runRoot);
    const home = join(runRoot, "home");
    const cache = join(runRoot, "npm-cache");
    const packDestination = join(runRoot, "pack");
    await Promise.all([mkdir(home), mkdir(cache), mkdir(packDestination)]);

    const { stdout } = await execFile(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts", "--pack-destination", packDestination],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          npm_config_cache: cache,
          npm_config_offline: "true",
          npm_config_update_notifier: "false",
        },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60_000,
      },
    );
    const result = JSON.parse(stdout) as PackResult;
    const inventory = (result[0]?.files ?? []).map(({ path }) =>
      path.startsWith("package/") ? path : `package/${path}`,
    );

    expect(inventory).toContain("package/extensions/index.ts");
    expect(inventory.some((path) => path.startsWith("package/skills/"))).toBe(false);
    expect(inventory).not.toContain("package/scripts/sync-global-skills.mjs");
    expect(inventory).not.toContain("package/scripts/sync-global-skills.d.mts");
  }, 60_000);
});
