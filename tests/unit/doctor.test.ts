import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessPiCompactionSettings,
  formatDoctorReport,
  inspectSharedWorkflows,
  runBoundedProbe,
  runDoctor,
} from "../../src/runtime/doctor.js";
import {
  assessCapability,
  loadRegistry,
  validateLicenseDispositionData,
  validatePermissionModeAdaptation,
  validatePiHostInstallation,
  validateRegistry,
  validateRegistryData,
  validateStableRelease,
} from "../../src/runtime/registry.js";
import { LIFECYCLE_PROMPTS } from "../../src/runtime/lifecycle.js";

const DOCTOR_HOME = resolve(".tmp/doctor-home");
const AGENT_REFERENCE = ".agents/skills/parallel-subagent-dispatch/references/agent-selection-matrix.md";
const BOARD_REFERENCE = ".agents/skills/aili-delivery-flow/references/formal-task-board.md";
const AGENT_SOURCE = new URL("../../skills/parallel-subagent-dispatch/references/agent-selection-matrix.md", import.meta.url);
const BOARD_SOURCE = new URL("../../skills/aili-delivery-flow/references/formal-task-board.md", import.meta.url);

interface SharedFixture {
  root: string;
  home: string;
  agentPath: string;
  boardPath: string;
  sourceBytes: Map<string, Buffer>;
  entries: string[];
}

async function createSharedFixture(options: {
  agent?: Buffer | string | "missing";
  board?: Buffer | string | "missing";
  agentSymlink?: boolean;
} = {}): Promise<SharedFixture> {
  const root = await mkdtemp(join(tmpdir(), "aili-pi-doctor-"));
  const home = join(root, "home");
  const agentPath = join(home, AGENT_REFERENCE);
  const boardPath = join(home, BOARD_REFERENCE);
  const canonicalAgent = await readFile(AGENT_SOURCE);
  const canonicalBoard = await readFile(BOARD_SOURCE);
  const agent = options.agent ?? canonicalAgent;
  const board = options.board ?? canonicalBoard;
  await mkdir(home, { recursive: true });
  if (agent !== "missing") {
    await mkdir(dirname(agentPath), { recursive: true });
    if (options.agentSymlink) {
      const target = join(root, "agent-target.md");
      await writeFile(target, agent);
      await symlink(target, agentPath);
    } else {
      await writeFile(agentPath, agent);
    }
  }
  if (board !== "missing") {
    await mkdir(dirname(boardPath), { recursive: true });
    await writeFile(boardPath, board);
  }
  const sourceBytes = new Map<string, Buffer>();
  for (const path of [agentPath, boardPath]) {
    try {
      sourceBytes.set(path, await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { root, home, agentPath, boardPath, sourceBytes, entries: await fixtureEntries(home) };
}

async function fixtureEntries(home: string): Promise<string[]> {
  return (await readdir(home, { recursive: true, encoding: "utf8" })).sort();
}

async function expectFixtureUnchanged(fixture: SharedFixture): Promise<void> {
  expect(await fixtureEntries(fixture.home)).toEqual(fixture.entries);
  for (const [path, bytes] of fixture.sourceBytes) expect(await readFile(path)).toEqual(bytes);
}

async function disposeFixture(fixture: SharedFixture): Promise<void> {
  await rm(fixture.root, { recursive: true, force: true });
}

const commands: Array<{
  name: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: { path: string; source: string; scope: "user"; origin: "package" };
}> = LIFECYCLE_PROMPTS.map((name) => ({
  name,
  source: "prompt" as const,
  sourceInfo: { path: `/home/.pi/agent/prompts/${name}.md`, source: "rose-aili", scope: "user" as const, origin: "package" as const },
}));
commands.push({
  name: "perm",
  source: "extension" as const,
  sourceInfo: { path: "/extensions/index.ts", source: "@rosetears/aili-pi", scope: "user" as const, origin: "package" as const },
});

describe("capability registry", () => {
  it("is complete, internally linked, and keeps compatibility states exclusive", async () => {
    expect(await validateRegistry()).toEqual([]);
    const { capabilities, compatibility } = await loadRegistry();
    expect(capabilities.capabilities.map((item) => item.id).sort()).toEqual([
      "artifact.store", "artifact.transform", "browser.qa", "context.compaction", "mcp.runtime", "memory.provider.mempalace", "provider.retry",
      "repo.read", "repo.write", "subagent.dispatch", "web.fetch",
    ]);
    expect(compatibility.records).toHaveLength(58);
    expect(new Set(compatibility.records.map((record) => record.status))).toEqual(new Set(["optional", "native", "adapted"]));
    expect(compatibility.records.filter((record) => record.requiredCapabilities.includes("subagent.dispatch")).every((record) => record.status === "adapted" && record.unverified.length === 0)).toBe(true);
  });

  it("accepts current permission and dispatch evidence without requiring retired Compact live evidence", async () => {
    expect(await validatePermissionModeAdaptation()).toEqual([]);
    expect(await validatePiHostInstallation()).toEqual([]);
    const errors = await validateStableRelease();
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("permission adaptation:")]));
    expect(errors).not.toEqual(expect.arrayContaining([
      expect.stringContaining("live verification:"),
    ]));
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("i-have-adhd: blocked")]));
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("native integration evidence")]));
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("separate AGPL/MIT license disposition")]));
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("dependency/lockfile approval")]));
  });

  it("validates the repository-owner-authorized MIT candidate identity", () => {
    const valid = {
      packageManifest: { name: "@rosetears/aili-pi", version: "0.2.2", license: "MIT" },
      packageLockRoot: { name: "@rosetears/aili-pi", version: "0.2.2", license: "MIT" },
      licenseSha256: "50d626e331a5b05c3a574ae969762851070af5b32dbc73cc2277409eec1358f4",
      readme: "@rosetears/aili-pi is licensed under the MIT License.",
      notices: "This distribution is licensed under MIT. Adapted sources retain their own license terms.",
      sbomRoot: { name: "@rosetears/aili-pi", versionInfo: "0.2.2", licenseConcluded: "MIT", licenseDeclared: "MIT" },
    };
    expect(validateLicenseDispositionData(valid)).toEqual([]);

    expect(validateLicenseDispositionData({
      ...valid,
      packageLockRoot: { ...valid.packageLockRoot, version: "0.1.13" },
      sbomRoot: { ...valid.sbomRoot, versionInfo: "0.1.13" },
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("package-lock"),
      expect.stringContaining("SPDX root"),
    ]));

    expect(validateLicenseDispositionData({
      ...valid,
      readme: "license declaration missing",
    })).toEqual([expect.stringContaining("README")]);

    expect(validateLicenseDispositionData({
      ...valid,
      packageManifest: { ...valid.packageManifest, license: "AGPL-3.0-or-later" },
      licenseSha256: "0".repeat(64),
      readme: "",
      notices: "Third-party terms are omitted.",
      sbomRoot: { ...valid.sbomRoot, licenseDeclared: "AGPL-3.0-or-later" },
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("package manifest"),
      expect.stringContaining("license text"),
      expect.stringContaining("README"),
      expect.stringContaining("third-party notice"),
      expect.stringContaining("SPDX root"),
    ]));
  });

  it("rejects duplicate IDs, unknown providers, missing probes, invalid states, and dangling references", async () => {
    const loaded = await loadRegistry();
    const capabilities = structuredClone(loaded.capabilities);
    const compatibility = structuredClone(loaded.compatibility);
    capabilities.capabilities[1]!.id = capabilities.capabilities[0]!.id;
    capabilities.capabilities[2]!.provider = "unknown";
    capabilities.capabilities[3]!.probe.id = "";
    compatibility.records[0]!.status = "invalid" as never;
    compatibility.records[1]!.requiredCapabilities.push("missing.capability");
    const errors = validateRegistryData(capabilities, compatibility);
    expect(errors.join("\n")).toMatch(/duplicate|unknown provider|invalid probe|invalid status|dangling capability/);
  });

  it("returns visible SKIP/WARN decisions and never treats absent providers as executed", async () => {
    expect(await assessCapability("web.fetch", new Set())).toEqual(expect.objectContaining({ status: "WARN", message: expect.stringContaining("No work ran") }));
    expect(await assessCapability("web.fetch", new Set(["pi-web-access"]))).toEqual(expect.objectContaining({ status: "PASS" }));
    expect(await assessCapability("repo.write", new Set())).toEqual(expect.objectContaining({ status: "WARN", message: expect.stringContaining("No work ran") }));
    expect(await assessCapability("repo.read", new Set(["pi-core"]))).toEqual(expect.objectContaining({ status: "PASS" }));
    expect(await assessCapability("unknown", new Set())).toEqual(expect.objectContaining({ status: "ERROR", message: expect.stringContaining("no work ran") }));
  });
});

describe("shared workflow doctor compatibility", () => {
  it("accepts the exact pinned protocol references without mutating the fixture", async () => {
    const fixture = await createSharedFixture();
    try {
      expect(await inspectSharedWorkflows(fixture.home)).toEqual({
        compatibility: "present-compatible",
        sourceMatch: "exact",
        references: { readable: 2, required: 2 },
        protocols: { compatible: 2, required: 2 },
        roles: { observed: 20, required: 20 },
        reasons: ["compatible"],
      });
      const report = await runDoctor({ getCommands: () => commands }, { home: fixture.home });
      expect(report.results).toContainEqual(expect.objectContaining({
        id: "shared.workflows",
        status: "PASS",
        evidence: expect.stringContaining("compatibility=present-compatible; source_match=exact"),
      }));
      await expectFixtureUnchanged(fixture);
    } finally {
      await disposeFixture(fixture);
    }
  });

  it("keeps structurally compatible hash drift compatible and non-exact", async () => {
    const board = `${await readFile(BOARD_SOURCE, "utf8")}\n<!-- locally retained note -->\n`;
    const fixture = await createSharedFixture({ board });
    try {
      const inspection = await inspectSharedWorkflows(fixture.home);
      expect(inspection).toEqual(expect.objectContaining({
        compatibility: "present-compatible",
        sourceMatch: "modified",
        protocols: { compatible: 2, required: 2 },
        roles: { observed: 20, required: 20 },
      }));
      expect(inspection.sourceMatch).not.toBe("compatible-newer");
      await expectFixtureUnchanged(fixture);
    } finally {
      await disposeFixture(fixture);
    }
  });

  it("reports a required missing reference as an error with install guidance", async () => {
    const fixture = await createSharedFixture({ board: "missing" });
    try {
      expect(await inspectSharedWorkflows(fixture.home)).toEqual(expect.objectContaining({
        compatibility: "missing",
        sourceMatch: "unknown",
        references: { readable: 1, required: 2 },
      }));
      const report = await runDoctor({ getCommands: () => commands }, { home: fixture.home });
      expect(report.status).toBe("NON_PASS");
      expect(report.results).toContainEqual(expect.objectContaining({
        id: "shared.workflows",
        status: "ERROR",
        evidence: expect.stringMatching(/compatibility=missing; source_match=unknown;.*remediation=npx -y rose-aili@0\.4\.7 install/),
      }));
      await expectFixtureUnchanged(fixture);
    } finally {
      await disposeFixture(fixture);
    }
  });

  it("rejects unsupported protocols, invalid role inventories, and invalid board cores", async () => {
    const canonicalAgent = await readFile(AGENT_SOURCE, "utf8");
    const canonicalBoard = await readFile(BOARD_SOURCE, "utf8");
    const cases = [
      canonicalAgent.replaceAll("aili-agent-selection/v1", "aili-agent-selection/v2"),
      canonicalAgent.replace("| `opensource-sanitizer` |", "| `unknown-specialist` |"),
      canonicalAgent.replace(/^\| `opensource-sanitizer` \|.*\n/m, ""),
      canonicalAgent.replace("| `opensource-sanitizer` |", "| `code-scout` |"),
    ];
    for (const agent of cases) {
      const fixture = await createSharedFixture({ agent });
      try {
        expect(await inspectSharedWorkflows(fixture.home)).toEqual(expect.objectContaining({
          compatibility: "incompatible",
          sourceMatch: "modified",
        }));
        await expectFixtureUnchanged(fixture);
      } finally {
        await disposeFixture(fixture);
      }
    }

    for (const board of [
      canonicalBoard.replaceAll("aili-task-board/v1", "aili-task-board/v2"),
      canonicalBoard.replace("  - Next action: `<next action>`\n", ""),
      canonicalBoard.replace("RECONCILED\n", ""),
    ]) {
      const fixture = await createSharedFixture({ board });
      try {
        const inspection = await inspectSharedWorkflows(fixture.home);
        expect(inspection.compatibility).toBe("incompatible");
        expect(inspection.sourceMatch).toBe("modified");
        await expectFixtureUnchanged(fixture);
      } finally {
        await disposeFixture(fixture);
      }
    }
  });

  it("treats a reference symlink as unverified without disclosing its path", async () => {
    const fixture = await createSharedFixture({ agentSymlink: true });
    try {
      const inspection = await inspectSharedWorkflows(fixture.home);
      expect(inspection).toEqual(expect.objectContaining({
        compatibility: "unverified",
        sourceMatch: "unknown",
        reasons: ["reference-symlink"],
      }));
      expect((await lstat(fixture.agentPath)).isSymbolicLink()).toBe(true);
      const report = await runDoctor({ getCommands: () => commands }, { home: fixture.home });
      const result = report.results.find((item) => item.id === "shared.workflows")!;
      expect(result.status).toBe("UNVERIFIED");
      expect(result.evidence).toContain("remediation=npx -y rose-aili@0.4.7 update");
      expect(result.evidence).not.toContain(fixture.home);
      await expectFixtureUnchanged(fixture);
    } finally {
      await disposeFixture(fixture);
    }
  });

  it("has no child-process, network, or filesystem-write execution path in the doctor owner", async () => {
    const source = await readFile(new URL("../../src/runtime/doctor.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/node:child_process|child_process|\bspawn(?:Sync)?\s*\(|\bexecFile(?:Sync)?\s*\(|\bfetch\s*\(/);
    expect(source).not.toMatch(/import\s*\{[^}]*\b(?:mkdir|writeFile|rename|copyFile)\b[^}]*\}\s*from\s*["']node:fs\/promises["']/s);
  });
});

describe("doctor", () => {
  it("reports both JSON evidence and a human non-pass without swallowing missing work", async () => {
    const report = await runDoctor({ getCommands: () => commands }, { home: DOCTOR_HOME });
    expect(report.status).toBe("NON_PASS");
    expect(report.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "skill.snapshot", status: "PASS" }),
      expect.objectContaining({ id: "package.resources", status: "PASS", evidence: expect.stringContaining("prompts=rose-aili-owned") }),
      expect.objectContaining({ id: "rose.prompts", status: "PASS", evidence: expect.stringContaining("one rose-aili global owner") }),
      expect.objectContaining({ id: "capability.registry", status: "PASS" }),
      expect.objectContaining({ id: "optional.packs", status: "SKIP" }),
      expect.objectContaining({ id: "roles.agents", status: "PASS", evidence: expect.stringContaining("profiles=21") }),
      expect.objectContaining({ id: "agent.framework", status: "UNVERIFIED", evidence: expect.stringContaining("public tools=task,hub") }),
      expect.objectContaining({ id: "permission.native", status: "PASS" }),
      expect.objectContaining({ id: "global.resources", status: expect.stringMatching(/^(PASS|UNVERIFIED)$/) }),
      expect.objectContaining({ id: "shared.workflows", status: "ERROR", evidence: expect.stringContaining("compatibility=missing") }),
      expect.objectContaining({ id: "provenance", status: "PASS" }),
    ]));
    expect(formatDoctorReport(report)).toContain("AILI doctor: NON_PASS");
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("reports cooperative Pi compaction settings without exposing file content", () => {
    expect(assessPiCompactionSettings('{"theme":"rose","compaction":{"enabled":false}}')).toEqual({
      id: "pi.compaction", status: "UNVERIFIED", evidence: "nativeAutomaticFallback=disabled-config; nativeAutomaticFallbackProvenance=unknown; global=disabled; project=absent; manual=available",
    });
    expect(assessPiCompactionSettings('{"compaction":{"enabled":false}}', '{"compaction":{"enabled":true},"secret":"do-not-render"}')).toEqual({
      id: "pi.compaction", status: "PASS", evidence: "nativeAutomaticFallback=enabled; nativeAutomaticFallbackProvenance=explicit-user; global=disabled; project=enabled",
    });
    expect(assessPiCompactionSettings(undefined)).toEqual({
      id: "pi.compaction", status: "PASS", evidence: "nativeAutomaticFallback=enabled; nativeAutomaticFallbackProvenance=unknown; global=absent; project=absent",
    });
    expect(assessPiCompactionSettings('{broken SECRET_TOKEN')).toEqual({
      id: "pi.compaction", status: "ERROR", evidence: "global=malformed; project=not-evaluated",
    });
    expect(assessPiCompactionSettings('[]')).toEqual({
      id: "pi.compaction", status: "ERROR", evidence: "global=non-object; project=not-evaluated",
    });
  });

  it("keeps malformed command ownership as an exact failed component", async () => {
    const report = await runDoctor({ getCommands: () => commands.filter((item) => item.name !== "ship") }, { home: DOCTOR_HOME });
    expect(report.results).toContainEqual(expect.objectContaining({ id: "rose.prompts", status: "ERROR" }));
  });

  it("keeps a legacy AILI mode command non-pass", async () => {
    const report = await runDoctor({ getCommands: () => [...commands, { ...commands.at(-1)!, name: "aili-mode" }] }, { home: DOCTOR_HOME });
    expect(report.results).toContainEqual(expect.objectContaining({ id: "permission.native", status: "ERROR", evidence: expect.stringContaining("legacy=aili-mode") }));
  });

  it("distinguishes timeout, malformed evidence, errors, and unsupported platforms", async () => {
    expect(await runBoundedProbe("timeout", 1, () => new Promise(() => undefined))).toEqual(expect.objectContaining({ status: "ERROR", evidence: expect.stringContaining("timeout") }));
    expect(await runBoundedProbe("malformed", 10, async () => "")).toEqual(expect.objectContaining({ status: "UNVERIFIED" }));
    expect(await runBoundedProbe("throws", 10, async () => { throw new Error("probe failed"); })).toEqual(expect.objectContaining({ status: "ERROR", evidence: "probe failed" }));
    const unsupported = await runDoctor({ getCommands: () => commands }, { platform: "win32", home: DOCTOR_HOME });
    expect(unsupported.results).toContainEqual(expect.objectContaining({ id: "platform", status: "ERROR" }));
    expect(unsupported.status).toBe("NON_PASS");
    const macos = await runDoctor({ getCommands: () => commands }, { platform: "darwin", home: DOCTOR_HOME });
    expect(macos.results).toContainEqual(expect.objectContaining({ id: "platform", status: "ERROR", evidence: expect.stringContaining("supported=linux") }));
  });
});
