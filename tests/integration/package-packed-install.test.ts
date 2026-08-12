import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const scratchRoots: string[] = [];

async function packAndExtract(): Promise<{ root: string; packageRoot: string; paths: string[] }> {
  await mkdir(resolve(".tmp"), { recursive: true });
  const root = await mkdtemp(resolve(".tmp/packed-install-"));
  scratchRoots.push(root);
  const packDirectory = join(root, "pack");
  const extractDirectory = join(root, "extract");
  await Promise.all([mkdir(packDirectory), mkdir(extractDirectory)]);
  const { stdout } = await execFile("npm", [
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    packDirectory,
  ], {
    cwd: resolve("."),
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = JSON.parse(stdout) as Array<{ filename: string; files: Array<{ path: string }> }>;
  expect(result).toHaveLength(1);
  const candidate = result[0]!;
  await execFile("tar", ["-xzf", join(packDirectory, candidate.filename), "-C", extractDirectory], { timeout: 120_000 });
  return {
    root,
    packageRoot: join(extractDirectory, "package"),
    paths: candidate.files.map((file) => file.path.replace(/^package\//, "")),
  };
}

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("exact packed package runtime", () => {
  it("excludes Workflow-owned globals and loads the Extension from the extracted tarball", async () => {
    const { packageRoot, paths } = await packAndExtract();
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      pi?: { extensions?: string[]; prompts?: string[] };
    };

    expect(manifest.pi?.prompts).toBeUndefined();
    expect(paths.some((path) => path === "prompts" || path.startsWith("prompts/"))).toBe(false);
    expect(paths).not.toContain("upstream/aili-workflows-runtime/AGENTS.md");
    expect(paths.some((path) => path.startsWith("upstream/aili-workflows-runtime/prompts/"))).toBe(false);
    expect(paths).toEqual(expect.arrayContaining([
      "upstream/aili-workflows-runtime/system.md",
      "upstream/aili-workflows-runtime/role-metadata.json",
      "upstream/aili-workflows-runtime/selection-map.json",
      "upstream/aili-workflows-runtime/installation-contract.json",
      "upstream/aili-workflows-runtime/provenance.json",
    ]));

    const entry = join(packageRoot, "extensions", "index.ts");
    const result = await discoverAndLoadExtensions([entry], packageRoot, join(packageRoot, ".tmp-agent"));
    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
  }, 120_000);
});
