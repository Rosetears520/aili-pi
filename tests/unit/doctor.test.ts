import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assessAiliCompactHealth,
  collectLocalAiliCompactHealthEvidence,
  formatDoctorReport,
  runBoundedProbe,
  runDoctor,
  type AiliCompactHealthEvidence,
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

const commands: Array<{
  name: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: { path: string; source: string; scope: "user"; origin: "package" };
}> = LIFECYCLE_PROMPTS.map((name) => ({
  name,
  source: "prompt" as const,
  sourceInfo: { path: `/prompts/${name}.md`, source: "@rosetears/aili-pi", scope: "user" as const, origin: "package" as const },
}));
commands.push({
  name: "aili-compact",
  source: "extension" as const,
  sourceInfo: { path: "/extensions/index.ts", source: "@rosetears/aili-pi", scope: "user" as const, origin: "package" as const },
});
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
      "artifact.store", "artifact.transform", "browser.qa", "memory.project",
      "repo.read", "repo.write", "subagent.dispatch", "web.fetch",
    ]);
    expect(compatibility.records).toHaveLength(64);
    expect(new Set(compatibility.records.map((record) => record.status))).toEqual(new Set(["native", "optional", "adapted"]));
    expect(compatibility.records.filter((record) => record.requiredCapabilities.includes("subagent.dispatch")).every((record) => record.status === "adapted" && record.unverified.length === 0)).toBe(true);
  });

  it("binds release evidence to the exact adapted permission entry and hashes", async () => {
    expect(await validatePermissionModeAdaptation()).toEqual([]);
    expect(await validatePiHostInstallation()).toEqual([]);
    const errors = await validateStableRelease();
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("permission adaptation:")]));
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("native integration evidence")]));
    expect(errors).toEqual([]);
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("separate AGPL/MIT license disposition")]));
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("dependency/lockfile approval")]));
  });

  it("validates the package-wide AGPL disposition and rejects stale generated metadata", () => {
    const valid = {
      packageManifest: { name: "@rosetears/aili-pi", version: "0.1.13", license: "AGPL-3.0-or-later" },
      packageLockRoot: { name: "@rosetears/aili-pi", version: "0.1.13", license: "AGPL-3.0-or-later" },
      licenseSha256: "0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0",
      readme: "version 0.1.13 and later is licensed under `AGPL-3.0-or-later`. Corresponding source is available from the repository declared in `package.json`.",
      notices: "This distribution is AGPL-3.0-or-later licensed. Adapted sources retain their own license terms.",
      sbomRoot: { name: "@rosetears/aili-pi", versionInfo: "0.1.13", licenseConcluded: "AGPL-3.0-or-later", licenseDeclared: "AGPL-3.0-or-later" },
    };
    expect(validateLicenseDispositionData(valid)).toEqual([]);
    expect(validateLicenseDispositionData({
      ...valid,
      packageManifest: { ...valid.packageManifest, license: "MIT" },
      packageLockRoot: { ...valid.packageLockRoot, version: "0.1.12" },
      licenseSha256: "0".repeat(64),
      readme: "",
      notices: "This distribution is MIT-licensed. Third-party terms are omitted.",
      sbomRoot: { ...valid.sbomRoot, licenseDeclared: "MIT" },
    })).toEqual(expect.arrayContaining([
      expect.stringContaining("package manifest"),
      expect.stringContaining("package-lock"),
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

describe("doctor", () => {
  it("reports both JSON evidence and a human non-pass without swallowing missing work", async () => {
    const report = await runDoctor({ getCommands: () => commands }, { home: DOCTOR_HOME });
    expect(report.status).toBe("NON_PASS");
    expect(report.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "skill.snapshot", status: "PASS" }),
      expect.objectContaining({ id: "capability.registry", status: "PASS" }),
      expect.objectContaining({ id: "aili.compact", status: "UNVERIFIED", evidence: expect.stringContaining("reducer=pass") }),
      expect.objectContaining({ id: "optional.packs", status: "SKIP" }),
      expect.objectContaining({ id: "roles.agents", status: "PASS", evidence: expect.stringContaining("profiles=20") }),
      expect.objectContaining({ id: "agent.framework", status: "PASS", evidence: expect.stringContaining("public tools=task,hub") }),
      expect.objectContaining({ id: "permission.native", status: "PASS" }),
      expect.objectContaining({ id: "global.resources", status: expect.stringMatching(/^(PASS|UNVERIFIED)$/) }),
      expect.objectContaining({ id: "provenance", status: "PASS" }),
    ]));
    expect(formatDoctorReport(report)).toContain("AILI doctor: NON_PASS");
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("uses bounded injectable invariant evidence and makes known failures errors", () => {
    const healthy = collectLocalAiliCompactHealthEvidence();
    const fullyVerified: AiliCompactHealthEvidence = {
      ...healthy,
      live: { status: "pass", count: 1 },
      hostOrdering: { status: "pass", count: 2 },
    };
    expect(assessAiliCompactHealth(true, fullyVerified)).toEqual(expect.objectContaining({ status: "PASS" }));

    const failed = structuredClone(fullyVerified);
    failed.projection = { status: "fail", error: "projection-invariant" };
    expect(assessAiliCompactHealth(true, failed)).toEqual(expect.objectContaining({
      status: "ERROR",
      evidence: expect.stringContaining("projection=fail:error=projection-invariant"),
    }));
    expect(assessAiliCompactHealth(false, fullyVerified).status).toBe("ERROR");
  });

  it("redacts unbounded health evidence and keeps optional evidence non-pass", async () => {
    const injected = collectLocalAiliCompactHealthEvidence();
    injected.cache = { status: "fail", count: Number.MAX_SAFE_INTEGER, hash: "not-a-hash", error: "raw prompt SECRET_TOKEN and tool body" };
    const report = await runDoctor(
      { getCommands: () => commands },
      { home: DOCTOR_HOME, ailiCompactEvidence: injected },
    );
    const compact = report.results.find((item) => item.id === "aili.compact")!;
    expect(compact.status).toBe("WARN");
    expect(compact.evidence).toContain("cache=fail:error=invalid-evidence-error");
    expect(compact.evidence).not.toMatch(/SECRET_TOKEN|raw prompt|tool body|not-a-hash|9007199254740991/);
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
