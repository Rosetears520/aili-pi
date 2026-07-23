import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function exists(path: URL): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

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
