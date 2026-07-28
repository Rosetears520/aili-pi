import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const script = join(root, "scripts", "validate-aili-compact-openspec-sequence.mjs");
const scratchPrefix = "aili-compact-openspec-sequence-";
const sourceRoots = [
  join(root, "openspec", "config.yaml"),
  join(root, "openspec", "changes", "add-reversible-context-compression"),
  join(root, "openspec", "changes", "fix-aili-compact-recovery-deadlock"),
  join(root, "openspec", "changes", "redesign-aili-compact-lifecycle"),
];

describe("AILI Compact sequential OpenSpec materialization", () => {
  it("materializes and strict-validates base, fix, and redesign in release order", async () => {
    const beforeSources = await sourceSnapshot();
    const beforeScratch = await ownedScratchNames();
    const run = invokeValidator([]);

    expect(run.error).toBeUndefined();
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    const report = parseReport(run.stdout);
    expect(report).toMatchObject({
      schema: "aili.compact.openspec-sequence.v1",
      mode: "openspec-archive",
      materialized: true,
      status: "PASS",
      sequenceResult: "PASS",
      releaseOrder: [
        "add-reversible-context-compression",
        "fix-aili-compact-recovery-deadlock",
        "redesign-aili-compact-lifecycle",
      ],
      scratch: { parent: ".tmp", prefix: scratchPrefix, cleaned: true },
      sourceWorkspaceMutated: false,
    });

    const [base, fix, redesign] = report.stages;
    expect(base).toMatchObject({
      stage: "accepted-base",
      status: "PASS",
      archive: { status: "PASS", exitCode: 0, semanticSuccess: true },
      materialization: { status: "PASS", differences: [] },
      strictValidation: { status: "PASS", summary: { items: 1, passed: 1, failed: 0 } },
    });
    expect(fix).toMatchObject({
      stage: "base-plus-fix",
      status: "PASS",
      archive: { status: "PASS", exitCode: 0, semanticSuccess: true },
      materialization: { status: "PASS", differences: [] },
      strictValidation: { status: "PASS", summary: { items: 2, passed: 2, failed: 0 } },
    });
    const fixReversible = fix.materialization.operations.find((operation: any) => operation.capability === "reversible-context-compression");
    expect(fixReversible).toEqual({
      capability: "reversible-context-compression",
      added: [],
      modified: [
        "Manual mode and commands have functional semantics",
        "Configuration and diagnostics fail safely",
      ],
      removed: ["AILI Compact exclusively owns compaction and GC"],
    });

    expect(redesign).toMatchObject({
      stage: "base-plus-fix-plus-redesign",
      status: "PASS",
      deltaPreflight: { status: "PASS", issues: [] },
      archive: { status: "PASS", exitCode: 0, semanticSuccess: true },
      materialization: { status: "PASS", expectedApplied: true, differences: [] },
      strictValidation: { status: "PASS", summary: { items: 5, passed: 5, failed: 0 } },
    });
    const redesignReversible = redesign.materialization.operations.find((operation: any) => operation.capability === "reversible-context-compression");
    expect(redesignReversible).toMatchObject({
      added: expect.arrayContaining([
        "Configuration defaults and validation are explicit",
        "Compression benefit uses bounded character gain",
        "Semantic blocks purge safely",
      ]),
      modified: [
        "Consumed tool results cool safely and in bounded groups",
        "Adaptive guidance and custom prompts are bounded",
        "Cache identity and telemetry are truthful",
      ],
      removed: [],
    });
    expect(report.blockers).toEqual([]);

    expect(run.stdout).not.toContain(root);
    expect(await sourceSnapshot()).toEqual(beforeSources);
    expect(await ownedScratchNames()).toEqual(beforeScratch);
  }, 180_000);

  it("marks deterministic heading-only fallback Unverified instead of claiming merged-spec PASS", async () => {
    const beforeScratch = await ownedScratchNames();
    const run = invokeValidator(["--force-fallback"]);

    expect(run.error).toBeUndefined();
    expect(run.status).toBe(2);
    const report = parseReport(run.stdout);
    expect(report).toMatchObject({
      mode: "deterministic-requirement-heading-fallback",
      materialized: false,
      status: "Unverified",
      sequenceResult: "Unverified",
      scratch: { cleaned: true },
      sourceWorkspaceMutated: false,
    });
    expect(report.stages.map((stage: any) => stage.status)).toEqual(["Unverified", "Unverified", "Unverified"]);
    expect(report.stages[2]).toMatchObject({
      stage: "base-plus-fix-plus-redesign",
      status: "Unverified",
      deterministicHeadingMerge: { status: "PASS", strictValidation: "Unverified" },
    });
    expect(report.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "openspec-materialization-unavailable", message: "forced-fallback" }),
    ]));
    expect(report.stages[2].deltaPreflight.issues).toEqual([]);
    expect(await ownedScratchNames()).toEqual(beforeScratch);
  }, 30_000);
});

function invokeValidator(extraArguments: string[]) {
  return spawnSync(process.execPath, [script, "--json", ...extraArguments], {
    cwd: root,
    env: { ...process.env, OPENSPEC_TELEMETRY: "0", NO_COLOR: "1", CI: "1" },
    encoding: "utf8",
    timeout: 170_000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
}

function parseReport(stdout: string): any {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return JSON.parse(stdout.slice(start, end + 1));
}

async function ownedScratchNames(): Promise<string[]> {
  try {
    return (await readdir(join(root, ".tmp"))).filter((name) => name.startsWith(scratchPrefix)).sort();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function sourceSnapshot(): Promise<Record<string, string>> {
  const files = (await Promise.all(sourceRoots.map((path) => collectFiles(path)))).flat().sort();
  const snapshot: Record<string, string> = {};
  for (const path of files) {
    const content = await readFile(path);
    snapshot[relative(root, path)] = createHash("sha256").update(content).digest("hex");
  }
  return snapshot;
}

async function collectFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOTDIR") return undefined;
    throw error;
  });
  if (!entries) return [path];
  const nested = await Promise.all(entries.sort((left, right) => left.name.localeCompare(right.name)).map((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? collectFiles(child) : Promise.resolve(entry.isFile() ? [child] : []);
  }));
  return nested.flat();
}
