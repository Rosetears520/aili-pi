import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globalResourcePaths, inspectGlobalResources, ROSE_MARKER_END, ROSE_MARKER_START } from "../../src/runtime/global-resources.js";

let home = "";

beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "aili-global-resources-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe("retired global Pi resource ownership", () => {
  it("reports legacy APPEND_SYSTEM and role files without mutating them", async () => {
    const paths = globalResourcePaths(home);
    await mkdir(paths.roleDirectory, { recursive: true });
    const append = `${ROSE_MARKER_START}\nlegacy\n${ROSE_MARKER_END}\n`;
    await writeFile(paths.appendSystemPath, append);
    await writeFile(join(paths.roleDirectory, "code-scout.md"), "legacy role\n");

    expect(await inspectGlobalResources(home)).toEqual({
      ...paths,
      appendSystem: "installed",
      roles: { expected: 0, installed: 0, missing: [], stale: ["code-scout.md"] },
      ownership: "retired",
    });
    expect(await readFile(paths.appendSystemPath, "utf8")).toBe(append);
    expect(await readFile(join(paths.roleDirectory, "code-scout.md"), "utf8")).toBe("legacy role\n");
  });

  it("distinguishes missing and malformed legacy markers without creating resources", async () => {
    const paths = globalResourcePaths(home);
    expect(await inspectGlobalResources(home)).toEqual(expect.objectContaining({ appendSystem: "missing", ownership: "retired" }));
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await writeFile(paths.appendSystemPath, `${ROSE_MARKER_START}\nbroken\n`);
    expect(await inspectGlobalResources(home)).toEqual(expect.objectContaining({ appendSystem: "malformed", ownership: "retired" }));
    expect(await readFile(paths.appendSystemPath, "utf8")).toBe(`${ROSE_MARKER_START}\nbroken\n`);
  });
});
