import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const scratchRoots: string[] = [];

interface PackageManifest {
  name?: string;
  version?: string;
  pi?: { extensions?: string[]; prompts?: string[]; skills?: string[] };
}

async function readManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
}

function expectOutsideRepository(path: string): void {
  const fromRepository = relative(repositoryRoot, path);
  expect(fromRepository === ".." || fromRepository.startsWith(`..${sep}`)).toBe(true);
}

async function packAndInstall(): Promise<{
  installRoot: string;
  packageRoot: string;
  paths: string[];
}> {
  const packRoot = await mkdtemp(join(tmpdir(), "aili-packed-tarball-"));
  const installRoot = await mkdtemp(join(tmpdir(), "aili-packed-install-"));
  scratchRoots.push(packRoot, installRoot);
  expectOutsideRepository(packRoot);
  expectOutsideRepository(installRoot);

  const npmEnvironment = {
    ...process.env,
    npm_config_logs_dir: join(installRoot, "npm-logs"),
    npm_config_update_notifier: "false",
  };
  const { stdout } = await execFile("npm", [
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    packRoot,
  ], {
    cwd: repositoryRoot,
    env: npmEnvironment,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const result = JSON.parse(stdout) as Array<{ filename: string; files: Array<{ path: string }> }>;
  expect(result).toHaveLength(1);
  const candidate = result[0]!;
  const tarball = resolve(packRoot, candidate.filename);

  await writeFile(join(installRoot, "package.json"), JSON.stringify({ private: true }), "utf8");
  await execFile("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    tarball,
  ], {
    cwd: installRoot,
    env: npmEnvironment,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    installRoot,
    packageRoot: join(installRoot, "node_modules", "@rosetears", "aili-pi"),
    paths: candidate.files.map((file) => file.path.replace(/^package\//, "")),
  };
}

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("exact packed package runtime", () => {
  it("installs from the registry outside the repository and then loads the installed Extension locally", async () => {
    const { installRoot, packageRoot, paths } = await packAndInstall();
    const manifest = await readManifest(join(packageRoot, "package.json"));

    expect(manifest.pi?.extensions).toEqual(["./extensions/index.ts"]);
    expect(manifest.pi?.prompts).toBeUndefined();
    expect(manifest.pi?.skills).toBeUndefined();
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

    const bundledRoot = join(packageRoot, "node_modules");
    const [codex, cache, acp, nestedTui, mcp, web, tui] = await Promise.all([
      readManifest(join(bundledRoot, "@narumitw", "pi-codex-compact", "package.json")),
      readManifest(join(bundledRoot, "pi-cache-optimizer", "package.json")),
      readManifest(join(bundledRoot, "acp-kernel", "package.json")),
      readManifest(join(bundledRoot, "@narumitw", "pi-codex-compact", "node_modules", "@narumitw", "pi-tui-kit", "package.json")),
      readManifest(join(installRoot, "node_modules", "pi-mcp-adapter", "package.json")),
      readManifest(join(installRoot, "node_modules", "pi-web-access", "package.json")),
      readManifest(join(installRoot, "node_modules", "@narumitw", "pi-tui-kit", "package.json")),
    ]);
    expect(codex).toMatchObject({ name: "@narumitw/pi-codex-compact", version: "0.52.0" });
    expect(cache).toMatchObject({ name: "pi-cache-optimizer", version: "2.8.6" });
    expect(acp).toMatchObject({ name: "acp-kernel", version: "0.0.19" });
    expect(nestedTui).toMatchObject({ name: "@narumitw/pi-tui-kit", version: "0.59.0" });
    expect(mcp).toMatchObject({ name: "pi-mcp-adapter", version: "2.32.1" });
    expect(web).toMatchObject({ name: "pi-web-access", version: "0.27.0" });
    expect(tui).toMatchObject({ name: "@narumitw/pi-tui-kit", version: "0.60.0" });

    const entry = join(packageRoot, manifest.pi!.extensions![0]!);
    const result = await discoverAndLoadExtensions([entry], packageRoot, join(installRoot, ".tmp-agent"));
    expect(result.errors).toEqual([]);
    expect(result.extensions).toHaveLength(1);
  }, 300_000);
});
