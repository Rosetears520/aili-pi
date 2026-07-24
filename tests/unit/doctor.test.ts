import { describe, expect, it } from "vitest";
import { formatDoctorReport, runBoundedProbe, runDoctor } from "../../src/runtime/doctor.js";
import {
  assessCapability,
  loadRegistry,
  validatePermissionModeAdaptation,
  validateRegistry,
  validateRegistryData,
  validateStableRelease,
} from "../../src/runtime/registry.js";
import { LIFECYCLE_PROMPTS } from "../../src/runtime/lifecycle.js";

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
    const errors = await validateStableRelease();
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("permission adaptation:")]));
    expect(errors).not.toEqual(expect.arrayContaining([expect.stringContaining("native integration evidence")]));
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
    const report = await runDoctor({ getCommands: () => commands });
    expect(report.status).toBe("NON_PASS");
    expect(report.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "skill.snapshot", status: "PASS" }),
      expect.objectContaining({ id: "capability.registry", status: "PASS" }),
      expect.objectContaining({ id: "optional.packs", status: "SKIP" }),
      expect.objectContaining({ id: "roles.subagents", status: "UNVERIFIED" }),
      expect.objectContaining({ id: "permission.native", status: "PASS" }),
      expect.objectContaining({ id: "global.resources", status: expect.stringMatching(/^(PASS|UNVERIFIED)$/) }),
      expect.objectContaining({ id: "provenance", status: "PASS" }),
    ]));
    expect(formatDoctorReport(report)).toContain("AILI doctor: NON_PASS");
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("keeps malformed command ownership as an exact failed component", async () => {
    const report = await runDoctor({ getCommands: () => commands.filter((item) => item.name !== "ship") });
    expect(report.results).toContainEqual(expect.objectContaining({ id: "rose.prompts", status: "ERROR" }));
  });

  it("keeps a legacy AILI mode command non-pass", async () => {
    const report = await runDoctor({ getCommands: () => [...commands, { ...commands.at(-1)!, name: "aili-mode" }] });
    expect(report.results).toContainEqual(expect.objectContaining({ id: "permission.native", status: "ERROR", evidence: expect.stringContaining("legacy=aili-mode") }));
  });

  it("distinguishes timeout, malformed evidence, errors, and unsupported platforms", async () => {
    expect(await runBoundedProbe("timeout", 1, () => new Promise(() => undefined))).toEqual(expect.objectContaining({ status: "ERROR", evidence: expect.stringContaining("timeout") }));
    expect(await runBoundedProbe("malformed", 10, async () => "")).toEqual(expect.objectContaining({ status: "UNVERIFIED" }));
    expect(await runBoundedProbe("throws", 10, async () => { throw new Error("probe failed"); })).toEqual(expect.objectContaining({ status: "ERROR", evidence: "probe failed" }));
    const unsupported = await runDoctor({ getCommands: () => commands }, { platform: "win32" });
    expect(unsupported.results).toContainEqual(expect.objectContaining({ id: "platform", status: "ERROR" }));
    expect(unsupported.status).toBe("NON_PASS");
    const macos = await runDoctor({ getCommands: () => commands }, { platform: "darwin" });
    expect(macos.results).toContainEqual(expect.objectContaining({ id: "platform", status: "ERROR", evidence: expect.stringContaining("supported=linux") }));
  });
});
