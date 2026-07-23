import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeTarget } from "../../src/runtime/path-boundaries.js";

describe("canonical task boundaries", () => {
  it("resolves existing parents, rejects symlink escapes, and identifies credentials", async () => {
    const base = await mkdtemp(join(tmpdir(), "aili-path-boundary-"));
    const project = join(base, "project");
    const external = join(base, "external");
    await mkdir(join(project, "src"), { recursive: true });
    await mkdir(external);
    await writeFile(join(project, ".env"), "fixture-secret\n");
    await symlink(external, join(project, "escape"));

    expect(await canonicalizeTarget(project, "src/new/deep.ts")).toEqual(expect.objectContaining({ insideProject: true, protectedCredential: false }));
    expect(await canonicalizeTarget(project, "escape/new.ts")).toEqual(expect.objectContaining({ insideProject: false, canonicalTarget: join(external, "new.ts") }));
    expect(await canonicalizeTarget(project, ".env")).toEqual(expect.objectContaining({ insideProject: true, protectedCredential: true }));
  });
});
