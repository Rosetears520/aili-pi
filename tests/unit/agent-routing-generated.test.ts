import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAgentRoutingManifest,
  renderAgentRoutingManifest,
} from "../../scripts/sync-agent-routing.js";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const scratchRoots: string[] = [];

async function fixture(): Promise<string> {
  await mkdir(join(root, ".tmp"), { recursive: true });
  const scratch = await mkdtemp(join(root, ".tmp", "aili-agent-routing-"));
  scratchRoots.push(scratch);
  await Promise.all([
    mkdir(join(scratch, "upstream"), { recursive: true }),
    mkdir(join(scratch, "skills", "parallel-subagent-dispatch", "references"), { recursive: true }),
    mkdir(join(scratch, "manifests"), { recursive: true }),
  ]);
  await Promise.all([
    cp(new URL("../../upstream/aili-workflows.lock.json", import.meta.url), join(scratch, "upstream", "aili-workflows.lock.json")),
    cp(new URL("../../skills/parallel-subagent-dispatch/references/agent-selection-matrix.md", import.meta.url),
      join(scratch, "skills", "parallel-subagent-dispatch", "references", "agent-selection-matrix.md")),
    cp(new URL("../../manifests/roles.json", import.meta.url), join(scratch, "manifests", "roles.json")),
  ]);
  const lock = JSON.parse(await readFile(join(scratch, "upstream", "aili-workflows.lock.json"), "utf8"));
  const roles = JSON.parse(await readFile(join(scratch, "manifests", "roles.json"), "utf8"));
  roles.source = { repository: lock.repository, commit: lock.commit };
  await writeFile(join(scratch, "manifests", "roles.json"), `${JSON.stringify(roles, null, 2)}\n`, "utf8");
  return scratch;
}

async function replaceMatrix(scratch: string, replace: (matrix: string) => string, bindHash: boolean): Promise<void> {
  const matrixPath = join(scratch, "skills", "parallel-subagent-dispatch", "references", "agent-selection-matrix.md");
  const matrix = replace(await readFile(matrixPath, "utf8"));
  await writeFile(matrixPath, matrix, "utf8");
  if (!bindHash) return;
  const lockPath = join(scratch, "upstream", "aili-workflows.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  lock.release.protocols.agentSelection.sha256 = createHash("sha256").update(matrix).digest("hex");
  lock.release.protocols.agentSelection.bytes = Buffer.byteLength(matrix);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(scratchRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("generated agent routing", () => {
  it("renders deterministic routing-only rows in canonical lock order", async () => {
    const rendered = await renderAgentRoutingManifest(root);
    expect(rendered).toBe(await renderAgentRoutingManifest(root));
    expect(rendered).toBe(await readFile(new URL("../../manifests/agent-routing.generated.json", import.meta.url), "utf8"));

    const manifest = JSON.parse(rendered);
    const lock = JSON.parse(await readFile(new URL("../../upstream/aili-workflows.lock.json", import.meta.url), "utf8"));
    const roleManifest = JSON.parse(await readFile(new URL("../../manifests/roles.json", import.meta.url), "utf8"));
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      source: {
        repository: lock.repository,
        commit: lock.commit,
        protocol: "aili-agent-selection/v1",
        sourceSha256: lock.release.protocols.agentSelection.sha256,
      },
    });
    expect(roleManifest.source).toEqual({ repository: lock.repository, commit: lock.commit });
    expect(manifest.source.repository).toBe(roleManifest.source.repository);
    expect(manifest.source.commit).toBe(roleManifest.source.commit);
    expect(manifest.roles.map((role: { roleId: string }) => role.roleId)).toEqual(lock.release.canonicalSpecialists);
    expect(manifest.roles).toHaveLength(20);
    expect(manifest.roles).toContainEqual(expect.objectContaining({ roleId: "solution-architect", selector: "aili.solution-architect" }));
    expect(Object.keys(manifest.roles[0])).toEqual([
      "roleId", "selector", "positiveTriggers", "nearMisses", "expectedEvidence", "phaseAffinity", "executionGuidance",
    ]);
    expect(rendered).not.toContain('"description"');
    expect(rendered).not.toContain('"tools"');
    expect(rendered).not.toContain('"permission"');
    expect(rendered).not.toContain('"permissions"');
  });

  it("passes the CLI drift check", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", "scripts/sync-agent-routing.ts", "--verify"],
      { cwd: root },
    );
    expect(stdout).toContain("Agent routing verified: 20 canonical specialists");
  });

  it("rejects source hash drift", async () => {
    const scratch = await fixture();
    await replaceMatrix(scratch, (matrix) => `${matrix}\n`, false);
    await expect(buildAgentRoutingManifest(scratch)).rejects.toThrow("agent-selection source hash drift");
  });

  it("rejects a roles manifest source identity mismatch", async () => {
    const scratch = await fixture();
    const rolesPath = join(scratch, "manifests", "roles.json");
    const roles = JSON.parse(await readFile(rolesPath, "utf8"));
    roles.source.commit = "0".repeat(40);
    await writeFile(rolesPath, `${JSON.stringify(roles, null, 2)}\n`, "utf8");
    await expect(buildAgentRoutingManifest(scratch)).rejects.toThrow("roles manifest source identity mismatch");
  });

  it("rejects general and duplicate specialist rows even when source identity is rebound", async () => {
    const generalScratch = await fixture();
    await replaceMatrix(generalScratch, (matrix) => matrix.replace("| `code-scout` |", "| `general` |"), true);
    await expect(buildAgentRoutingManifest(generalScratch)).rejects.toThrow("general is not a canonical specialist role");

    const duplicateScratch = await fixture();
    await replaceMatrix(duplicateScratch, (matrix) => matrix.replace("| `doc-researcher` |", "| `code-scout` |"), true);
    await expect(buildAgentRoutingManifest(duplicateScratch)).rejects.toThrow("duplicate role ID in selection matrix: code-scout");
  });

  it("rejects duplicate selectors and canonical selector mismatches", async () => {
    const duplicateScratch = await fixture();
    const rolesPath = join(duplicateScratch, "manifests", "roles.json");
    const roles = JSON.parse(await readFile(rolesPath, "utf8"));
    roles.records.find((role: { name: string }) => role.name === "doc-researcher").selector = "aili.code-scout";
    await writeFile(rolesPath, `${JSON.stringify(roles, null, 2)}\n`, "utf8");
    await expect(buildAgentRoutingManifest(duplicateScratch)).rejects.toThrow("duplicate selector in roles manifest: aili.code-scout");

    const mismatchScratch = await fixture();
    const mismatchRolesPath = join(mismatchScratch, "manifests", "roles.json");
    const mismatchRoles = JSON.parse(await readFile(mismatchRolesPath, "utf8"));
    mismatchRoles.records.find((role: { name: string }) => role.name === "code-scout").selector = "aili.scout";
    await writeFile(mismatchRolesPath, `${JSON.stringify(mismatchRoles, null, 2)}\n`, "utf8");
    await expect(buildAgentRoutingManifest(mismatchScratch)).rejects.toThrow("selector mismatch; expected aili.code-scout");
  });
});
