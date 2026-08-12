import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadAgentCatalog } from "../../src/runtime/agent-catalog.js";
import { runDoctor } from "../../src/runtime/doctor.js";
import { loadRoleProfiles, SPECIALIZED_ROLE_SELECTORS } from "../../src/runtime/roles.js";
import { loadWorkflowRuntimeBundle, WORKFLOW_RUNTIME_ARTIFACTS } from "../../src/runtime/workflow-bundle/index.js";

const commands = [
  { name: "ideate", source: "prompt", path: "prompts/ideate.md" },
  { name: "define", source: "prompt", path: "prompts/define.md" },
  { name: "build", source: "prompt", path: "prompts/build.md" },
  { name: "ship", source: "prompt", path: "prompts/ship.md" },
  { name: "local-review", source: "prompt", path: "prompts/local-review.md" },
] as never;

describe("Workflow runtime bundle consumers", () => {
  it("keeps roles, routing, task catalog and bundle metadata on one 20-specialist identity", async () => {
    const [bundle, roles, catalog] = await Promise.all([
      loadWorkflowRuntimeBundle(),
      loadRoleProfiles(),
      loadAgentCatalog(),
    ]);
    expect(bundle.canonicalSpecialists.map((roleId) => `aili.${roleId}`).sort()).toEqual([...SPECIALIZED_ROLE_SELECTORS].sort());
    expect(roles.filter((role) => role.selector !== "general")).toHaveLength(20);
    expect(catalog.ok && catalog.value.entries).toHaveLength(20);
    const architect = roles.find((role) => role.selector === "aili.solution-architect");
    expect(architect).toMatchObject({ tools: ["read", "grep", "find", "ls"], toolPolicy: "static" });
    expect(architect?.tools).not.toEqual(expect.arrayContaining(["write", "edit", "bash"]));
  });

  it("provides one explicit consumer for every required artifact and retires duplicate installation ownership", async () => {
    const source = await Promise.all([
      readFile(new URL("../../src/runtime/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/runtime/roles.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/runtime/doctor.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/runtime/workflow-bundle/index.ts", import.meta.url), "utf8"),
    ]).then((parts) => parts.join("\n"));
    for (const artifact of Object.values(WORKFLOW_RUNTIME_ARTIFACTS)) expect(source).toContain(artifact);

    const [runtimeIndex, packageJson] = await Promise.all([
      readFile(new URL("../../src/runtime/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../package.json", import.meta.url), "utf8").then(JSON.parse),
    ]);
    expect(runtimeIndex).not.toContain("registerGlobalResourceCommand");
    expect(packageJson.files).toEqual(expect.arrayContaining([
      "!upstream/aili-workflows-runtime/AGENTS.md",
      "!upstream/aili-workflows-runtime/prompts/",
    ]));
    const report = await runDoctor({ getCommands: () => commands }, { home: "/nonexistent-aili-workflow-fixture" });
    expect(report.results).toContainEqual(expect.objectContaining({ id: "workflow.bundle", status: "PASS", evidence: expect.stringContaining("specialists=20") }));
    expect(report.results).toContainEqual(expect.objectContaining({ id: "global.resources", status: "PASS", evidence: expect.stringContaining("ownership=retired") }));
  });
});
