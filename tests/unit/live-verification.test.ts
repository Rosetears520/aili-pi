import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validateLiveVerificationAtRoot } from "../../src/runtime/registry.js";
import { PERSISTENT_LIVE_IMPLEMENTATION_PATHS } from "../../src/runtime/persistent-agents/live-evidence-contract.js";

const roots: string[] = [];
const now = Date.parse("2026-08-02T12:00:00.000Z");
const capturedAt = "2026-08-02T11:00:00.000Z";
const artifactPath = "artifacts/test-results/persistent-agent-framework/live-smoke-current.json";
const harnessPath = "tests/integration/aili-compact-live-release-gated.test.ts";
const implementationPaths = PERSISTENT_LIVE_IMPLEMENTATION_PATHS;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Persistent Agent live verification manifest", () => {
  it("accepts a fresh exact current PASS artifact", async () => {
    const root = fixture();
    expect(await validateLiveVerificationAtRoot(root, now)).toEqual([]);
  });

  it.each([
    ["stale capture", (manifest: any) => { manifest.capturedAt = "2000-01-01T00:00:00.000Z"; }],
    ["wrong artifact path", (manifest: any) => { manifest.artifact.path = "artifacts/test-results/other.json"; }],
    ["wrong artifact hash", (manifest: any) => { manifest.artifact.sha256 = "0".repeat(64); }],
    ["wrong package", (manifest: any) => { manifest.package.version = "0.1.16"; }],
  ])("fails closed for %s", async (_name, mutate) => {
    const root = fixture();
    const manifest = readJson(root, "manifests/live-verification.json");
    mutate(manifest);
    writeJson(root, "manifests/live-verification.json", manifest);
    expect(await validateLiveVerificationAtRoot(root, now)).not.toEqual([]);
  });

  it("reports the current NON_PASS verdict even when every binding is exact", async () => {
    const root = fixture("NON_PASS");
    expect(await validateLiveVerificationAtRoot(root, now)).toEqual(expect.arrayContaining([
      expect.stringContaining("current verdict is NON_PASS"),
    ]));
  });

  it("makes a newer failed artifact supersede an older PASS manifest", async () => {
    const root = fixture();
    const failed = artifact("NON_PASS", "2026-08-02T11:30:00.000Z");
    writeJson(root, "artifacts/test-results/persistent-agent-framework/live-smoke-newer.json", failed);
    expect(await validateLiveVerificationAtRoot(root, now)).toEqual(expect.arrayContaining([
      expect.stringContaining("newest current artifact"),
    ]));
  });
});

function fixture(status: "PASS" | "NON_PASS" = "PASS"): string {
  const root = mkdtempSync(join(tmpdir(), "aili-live-verification-"));
  roots.push(root);
  writeJson(root, "package.json", { name: "@rosetears/aili-pi", version: "0.2.1" });
  write(root, harnessPath, "export const harness = true;\n");
  const implementation: Record<string, string> = {};
  for (const [index, path] of implementationPaths.entries()) {
    const body = `export const fixture${index} = true;\n`;
    write(root, path, body);
    implementation[path] = sha256(body);
  }
  const evidence = artifact(status, capturedAt);
  const body = writeJson(root, artifactPath, evidence);
  writeJson(root, "manifests/live-verification.json", {
    schemaVersion: 4,
    capturedAt,
    platform: "linux",
    piVersion: "0.84.1",
    runtime: "aili-persistent-agents-v1",
    package: { name: "@rosetears/aili-pi", version: "0.2.1", source: "current workspace package" },
    status,
    artifact: { path: artifactPath, sha256: sha256(body) },
    harness: { path: harnessPath, sha256: sha256(readFileSync(join(root, harnessPath), "utf8")) },
    cleanup: { status: "PASS" },
    probes: (evidence.probes as any[]).map((probe) => ({ id: probe.id, status: probe.status, changedFiles: 0, evidence: artifactPath })),
    implementation,
  });
  return root;
}

function artifact(status: "PASS" | "NON_PASS", time: string): Record<string, unknown> {
  const probeStatus = status === "PASS" ? "PASS" : "NON_PASS";
  return {
    schemaVersion: 1,
    capturedAt: time,
    platform: "linux",
    piVersion: "0.84.1",
    package: { name: "@rosetears/aili-pi", version: "0.2.1", source: "current workspace package" },
    status,
    probes: ["provider-turn", "child-sandbox", "external-workspace-lifecycle"].map((id) => ({ id, status: probeStatus, changedFiles: 0 })),
    sanitization: { rawProviderTranscriptIncluded: false, rawCredentialMaterialIncluded: false, credentialMarkerFindings: 0, localAbsolutePathsIncluded: false },
  };
}

function write(root: string, path: string, body: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body, "utf8");
}

function writeJson(root: string, path: string, value: unknown): string {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  write(root, path, body);
  return body;
}

function readJson(root: string, path: string): any {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
