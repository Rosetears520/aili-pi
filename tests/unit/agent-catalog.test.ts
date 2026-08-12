import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AGENT_CATALOG_LIMITS,
  loadAgentCatalog,
  projectAgentCatalog,
  projectAgentPhaseView,
  renderCompactAgentCatalog,
  validateAgentPhasePolicy,
  type AgentPhasePolicy,
  type AgentCatalogResult,
  type AgentRoutingManifest,
} from "../../src/runtime/agent-catalog.js";
import {
  loadRoleProfiles,
  SPECIALIZED_ROLE_SELECTORS,
  type RoleProfile,
} from "../../src/runtime/roles.js";

function valueOf<T>(result: AgentCatalogResult<T>): T {
  if (!result.ok) throw new Error(`expected success, received ${result.diagnostics.map((item) => item.code).join(", ")}`);
  return result.value;
}

function codes(result: AgentCatalogResult<unknown>): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function copyProfiles(profiles: readonly RoleProfile[]): RoleProfile[] {
  return profiles.map((profile) => ({
    ...profile,
    tools: [...profile.tools],
    capabilities: [...profile.capabilities],
    spawns: [...profile.spawns],
  }));
}

async function routingFixture(): Promise<AgentRoutingManifest> {
  return JSON.parse(await readFile(new URL("../../manifests/agent-routing.generated.json", import.meta.url), "utf8")) as AgentRoutingManifest;
}

describe("RoleProfile-derived Agent Catalog", () => {
  it("joins every generated routing row to its validated RoleProfile description without permission metadata", async () => {
    const profiles = await loadRoleProfiles();
    const routing = await routingFixture();
    const catalog = valueOf(projectAgentCatalog(profiles, routing));

    expect(catalog.entries.map((entry) => entry.selector)).toEqual(routing.roles.map((role) => role.selector));
    expect(new Set(catalog.entries.map((entry) => entry.selector)).size).toBe(SPECIALIZED_ROLE_SELECTORS.length);
    expect(catalog.entries).toHaveLength(20);
    expect(catalog.entries).toContainEqual(expect.objectContaining({ selector: "aili.solution-architect" }));
    for (const entry of catalog.entries) {
      const profile = profiles.find((candidate) => candidate.selector === entry.selector)!;
      const route = routing.roles.find((candidate) => candidate.selector === entry.selector)!;
      expect(entry.description).toBe(profile.description.trim().replace(/[ \t]+/g, " "));
      expect(entry.status).toBe(profile.status);
      expect(entry.routing).toEqual({
        roleId: route.roleId,
        positiveTriggers: route.positiveTriggers,
        nearMisses: route.nearMisses,
        expectedEvidence: route.expectedEvidence,
        phaseAffinity: route.phaseAffinity,
        executionGuidance: route.executionGuidance,
      });
      expect(Object.keys(entry).sort()).toEqual(["description", "routing", "selector", "status"]);
    }

    const serialized = JSON.stringify(catalog);
    for (const profile of profiles) {
      expect(serialized).not.toContain(profile.profileHash);
      expect(serialized).not.toContain(profile.sourceHash);
      expect(serialized).not.toContain(profile.prompt);
      expect(serialized).not.toContain(profile.profilePath);
      if (profile.sourcePath) expect(serialized).not.toContain(profile.sourcePath);
      if (profile.model) expect(serialized).not.toContain(profile.model);
    }
    expect(serialized).not.toContain('"tools"');
    expect(serialized).not.toContain('"capabilities"');
    expect(serialized).not.toContain('"toolPolicy"');
    expect(serialized).not.toContain('"blocking"');
    expect(serialized).not.toContain('"general"');
  });

  it("derives advisory phase recommendations from generated routing and descriptions only from profiles", async () => {
    const profiles = await loadRoleProfiles();
    const routing = await routingFixture();

    for (const phase of ["IDEATE", "DEFINE", "BUILD", "SHIP"] as const) {
      const view = valueOf(projectAgentPhaseView(profiles, phase));
      const expected = routing.roles.filter((role) => role.phaseAffinity.includes(phase)).map((role) => role.selector);
      expect(view.entries.map((entry) => entry.selector)).toEqual(expected);
      expect(view.entries.every((entry) => entry.recommended && entry.activePackages.length === 0)).toBe(true);
      for (const entry of view.entries) {
        const profile = profiles.find((candidate) => candidate.selector === entry.selector)!;
        expect(entry.description).toBe(profile.description);
        expect(entry.routing.phaseAffinity).toContain(phase);
      }
    }
  });

  it("regenerates normalized descriptions from supplied RoleProfiles without a second description map", async () => {
    const profiles = copyProfiles(await loadRoleProfiles());
    const scout = profiles.find((profile) => profile.selector === "aili.code-scout")!;
    scout.description = "  Inspect   exact\tcurrent repository evidence.  ";

    const catalog = valueOf(projectAgentCatalog(profiles));
    const view = valueOf(projectAgentPhaseView(profiles, "DEFINE"));
    expect(catalog.entries.find((entry) => entry.selector === scout.selector)?.description).toBe("Inspect exact current repository evidence.");
    expect(view.entries.find((entry) => entry.selector === scout.selector)?.description).toBe("Inspect exact current repository evidence.");
  });

  it("foregrounds only nonterminal canonical Agent Owners and requires a concrete dispatch reason", async () => {
    const profiles = await loadRoleProfiles();
    const view = valueOf(projectAgentPhaseView(profiles, "BUILD", [
      {
        packageId: "3.1-extra-scout",
        owner: "agent:aili.code-scout",
        status: "ready",
        dispatchReason: "  Exact repository discovery is required before this package can proceed.  ",
      },
      {
        packageId: "3.1-second-scout",
        owner: "agent:aili.code-scout",
        status: "returned",
        dispatchReason: "Returned scouting evidence still requires ROSE disposition.",
      },
      {
        packageId: "3.1-terminal",
        owner: "agent:aili.code-reviewer",
        status: "done",
        dispatchReason: "pending",
      },
      {
        packageId: "3.1-rose",
        owner: "ROSE",
        status: "ready",
        dispatchReason: "pending",
      },
    ]));

    expect(view.entries.map((entry) => entry.selector)).toEqual([
      "aili.code-scout",
      "aili.implementer",
      "aili.test-engineer",
      "aili.browser-qa-runner",
      "aili.e2e-artifact-runner",
    ]);
    const scout = view.entries.find((entry) => entry.selector === "aili.code-scout")!;
    expect(scout.recommended).toBe(true);
    expect(scout.activePackages).toEqual([
      {
        packageId: "3.1-extra-scout",
        status: "ready",
        dispatchReason: "Exact repository discovery is required before this package can proceed.",
      },
      {
        packageId: "3.1-second-scout",
        status: "returned",
        dispatchReason: "Returned scouting evidence still requires ROSE disposition.",
      },
    ]);
    expect(view.entries.some((entry) => entry.selector === "aili.code-reviewer")).toBe(false);
  });

  it("fails visibly for unknown phases, unknown phase selectors, general ownership, and missing Owner reasons", async () => {
    const profiles = await loadRoleProfiles();
    const catalog = valueOf(projectAgentCatalog(profiles));
    const recommended = (phase: "IDEATE" | "DEFINE" | "BUILD" | "SHIP") =>
      catalog.entries.filter((entry) => entry.routing.phaseAffinity.includes(phase)).map((entry) => entry.selector);
    const policy: AgentPhasePolicy = {
      IDEATE: recommended("IDEATE"),
      DEFINE: recommended("DEFINE"),
      BUILD: recommended("BUILD"),
      SHIP: recommended("SHIP"),
    };
    const invalidPolicy = { ...policy, BUILD: [...policy.BUILD, "aili.unknown"] };

    expect(codes(projectAgentPhaseView(profiles, "DEPLOY"))).toContain("PHASE_UNKNOWN");
    expect(codes(validateAgentPhasePolicy(catalog, invalidPolicy))).toContain("PHASE_SELECTOR_UNKNOWN");
    expect(codes(projectAgentPhaseView(profiles, "BUILD", [{
      packageId: "P-general",
      owner: "agent:general",
      status: "ready",
      dispatchReason: "The package needs a formal owner.",
    }]))).toContain("OWNER_SELECTOR_UNKNOWN");
    expect(codes(projectAgentPhaseView(profiles, "BUILD", [{
      packageId: "P-no-reason",
      owner: "agent:aili.code-scout",
      status: "ready",
      dispatchReason: "pending",
    }]))).toContain("OWNER_REASON_REQUIRED");
  });

  it("rejects duplicate profiles/selectors and noncanonical order instead of returning a partial catalog", async () => {
    const profiles = copyProfiles(await loadRoleProfiles());
    profiles[1] = { ...profiles[0]!, tools: [...profiles[0]!.tools], capabilities: [...profiles[0]!.capabilities], spawns: [...profiles[0]!.spawns] };
    const duplicated = projectAgentCatalog(profiles);
    expect(duplicated.ok).toBe(false);
    expect(codes(duplicated)).toEqual(expect.arrayContaining(["PROFILE_NAME_DUPLICATE", "PROFILE_SELECTOR_DUPLICATE", "PROFILE_SELECTOR_ORDER_INVALID"]));

    const reordered = copyProfiles(await loadRoleProfiles());
    [reordered[0], reordered[1]] = [reordered[1]!, reordered[0]!];
    expect(codes(projectAgentCatalog(reordered))).toContain("PROFILE_SELECTOR_ORDER_INVALID");
  });

  it("rejects malformed RoleProfile descriptions and generated routing drift without fallback", async () => {
    const base = await loadRoleProfiles();
    const routing = await routingFixture();
    const mutateDescription = (description: string): AgentCatalogResult<unknown> => {
      const profiles = copyProfiles(base);
      profiles[0]!.description = description;
      return projectAgentCatalog(profiles);
    };

    expect(codes(mutateDescription("   "))).toContain("DESCRIPTION_INVALID");
    expect(codes(mutateDescription("first line\nsecond line"))).toContain("DESCRIPTION_MULTILINE");
    expect(codes(mutateDescription("x".repeat(AGENT_CATALOG_LIMITS.descriptionChars + 1)))).toContain("DESCRIPTION_TOO_LONG");
    expect(codes(mutateDescription("invalid\0description"))).toContain("DESCRIPTION_INVALID");

    const duplicateAuthority = structuredClone(routing) as AgentRoutingManifest & { roles: Array<Record<string, unknown>> };
    duplicateAuthority.roles[0]!.description = "A forbidden second description authority.";
    expect(codes(projectAgentCatalog(base, duplicateAuthority))).toContain("ROUTING_ROLE_INVALID");

    const missing = structuredClone(routing);
    missing.roles = missing.roles.slice(1);
    expect(codes(projectAgentCatalog(base, missing))).toEqual(expect.arrayContaining(["ROUTING_ROLE_COUNT_INVALID", "ROUTING_SELECTOR_MISSING"]));

    const invalidPhase = structuredClone(routing);
    invalidPhase.roles[0]!.phaseAffinity = ["DEPLOY"];
    expect(codes(projectAgentCatalog(base, invalidPhase))).toContain("ROUTING_PHASE_AFFINITY_INVALID");
  });

  it("renders bounded compact task metadata from routing plus descriptions without authorization fields", async () => {
    const profiles = await loadRoleProfiles();
    const compact = valueOf(renderCompactAgentCatalog(valueOf(projectAgentCatalog(profiles, await routingFixture()))));
    expect(compact).toContain(`aili.code-scout — ${profiles.find((profile) => profile.selector === "aili.code-scout")!.description}`);
    expect(compact).toContain("use=Files, symbols, call paths");
    expect(compact).toContain("phases(advisory)=IDEATE/DEFINE/BUILD");
    expect(compact).toContain("never grant tools or permissions");
    expect(compact).not.toContain("toolPolicy");
    expect(compact).not.toContain("capabilities");
    expect(compact.length).toBeLessThanOrEqual(AGENT_CATALOG_LIMITS.compactCatalogChars);
  });

  it("converts RoleProfile or generated-routing load exceptions into bounded non-pass results with no fallback", async () => {
    const failed = await loadAgentCatalog(async () => {
      throw new Error("/private/source/path: role profile hash drift");
    });
    expect(failed).toEqual({
      ok: false,
      diagnostics: [{
        code: "ROLE_PROFILE_LOAD_FAILED",
        message: "Canonical RoleProfiles failed to load or validate; no Agent Catalog was produced.",
      }],
    });
    expect(JSON.stringify(failed)).not.toContain("/private/source/path");
    expect((failed as { value?: unknown }).value).toBeUndefined();

    const routingFailed = await loadAgentCatalog(loadRoleProfiles, async () => {
      throw new Error("/private/source/path: generated routing drift");
    });
    expect(routingFailed).toEqual({
      ok: false,
      diagnostics: [{
        code: "ROUTING_MANIFEST_LOAD_FAILED",
        message: "Generated Agent routing failed to load; no Agent Catalog was produced.",
      }],
    });
    expect(JSON.stringify(routingFailed)).not.toContain("/private/source/path");
  });
});
