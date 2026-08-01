import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  BUNDLED_ROLE_SELECTORS,
  loadRoleProfiles,
  SPECIALIZED_ROLE_SELECTORS,
  type RoleProfile,
} from "./roles.js";

export const AGENT_CATALOG_PHASES = ["IDEATE", "DEFINE", "BUILD", "SHIP"] as const;
export type AgentCatalogPhase = (typeof AGENT_CATALOG_PHASES)[number];

export const AGENT_CATALOG_LIMITS = Object.freeze({
  descriptionChars: 512,
  routingItems: 8,
  routingItemChars: 1_024,
  compactCatalogChars: 16_384,
  labelChars: 128,
  phaseSelectors: 16,
  activeOwners: 512,
  dispatchReasonChars: 2_048,
  diagnostics: 32,
});

export interface AgentRoutingEntry {
  roleId: string;
  positiveTriggers: readonly string[];
  nearMisses: readonly string[];
  expectedEvidence: readonly string[];
  phaseAffinity: readonly AgentCatalogPhase[];
  executionGuidance: string;
}

export interface AgentCatalogEntry {
  selector: string;
  description: string;
  status: RoleProfile["status"];
  routing: AgentRoutingEntry;
}

export interface AgentCatalog {
  entries: readonly AgentCatalogEntry[];
}

export interface AgentCatalogDiagnostic {
  code: string;
  message: string;
  phase?: string;
  selector?: string;
  packageId?: string;
}

export type AgentCatalogResult<T> =
  | { ok: true; value: T; diagnostics: readonly AgentCatalogDiagnostic[] }
  | { ok: false; diagnostics: readonly AgentCatalogDiagnostic[] };

export type AgentPhasePolicy = Readonly<Record<AgentCatalogPhase, readonly string[]>>;

export interface AgentRoutingManifest {
  schemaVersion: 1;
  source: {
    repository: string;
    commit: string;
    protocol: "aili-agent-selection/v1";
    sourceSha256: string;
  };
  roles: ReadonlyArray<{
    roleId: string;
    selector: string;
    positiveTriggers: readonly string[];
    nearMisses: readonly string[];
    expectedEvidence: readonly string[];
    phaseAffinity: readonly string[];
    executionGuidance: string;
  }>;
}

export type AgentCatalogPackageStatus =
  | "pending"
  | "ready"
  | "running"
  | "returned"
  | "done"
  | "blocked"
  | "cancelled";

export interface AgentCatalogOwnerInput {
  packageId: string;
  owner: string;
  status: AgentCatalogPackageStatus;
  dispatchReason: string;
}

export interface AgentCatalogActivePackage {
  packageId: string;
  status: Exclude<AgentCatalogPackageStatus, "done" | "cancelled">;
  dispatchReason: string;
}

export interface AgentCatalogViewEntry extends AgentCatalogEntry {
  recommended: boolean;
  activePackages: readonly AgentCatalogActivePackage[];
}

export interface AgentCatalogPhaseView {
  phase: AgentCatalogPhase;
  entries: readonly AgentCatalogViewEntry[];
}

const PHASE_SET = new Set<string>(AGENT_CATALOG_PHASES);
const SPECIALIZED_SELECTOR_SET = new Set<string>(SPECIALIZED_ROLE_SELECTORS);
const STATUS_SET = new Set<string>(["adapted", "optional", "blocked"]);
const PACKAGE_STATUS_SET = new Set<string>(["pending", "ready", "running", "returned", "done", "blocked", "cancelled"]);
const TERMINAL_PACKAGE_STATUS_SET = new Set<string>(["done", "cancelled"]);
const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function success<T>(value: T): AgentCatalogResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(diagnostics: readonly AgentCatalogDiagnostic[]): AgentCatalogResult<T> {
  return { ok: false, diagnostics };
}

function boundedLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/[\r\n\0]/g, "?").slice(0, AGENT_CATALOG_LIMITS.labelChars);
}

function addDiagnostic(
  diagnostics: AgentCatalogDiagnostic[],
  code: string,
  message: string,
  context: Pick<AgentCatalogDiagnostic, "phase" | "selector" | "packageId"> = {},
): void {
  if (diagnostics.length >= AGENT_CATALOG_LIMITS.diagnostics) return;
  if (diagnostics.length === AGENT_CATALOG_LIMITS.diagnostics - 1) {
    diagnostics.push({ code: "DIAGNOSTIC_LIMIT_EXCEEDED", message: "Agent Catalog diagnostic limit exceeded." });
    return;
  }
  diagnostics.push({
    code,
    message,
    ...(context.phase === undefined ? {} : { phase: boundedLabel(context.phase) }),
    ...(context.selector === undefined ? {} : { selector: boundedLabel(context.selector) }),
    ...(context.packageId === undefined ? {} : { packageId: boundedLabel(context.packageId) }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedDescription(
  value: unknown,
  diagnostics: AgentCatalogDiagnostic[],
  selector: string | undefined,
): string | undefined {
  const context = selector === undefined ? {} : { selector };
  if (typeof value !== "string" || value.trim().length === 0) {
    addDiagnostic(diagnostics, "DESCRIPTION_INVALID", "Role description must be a non-empty string.", context);
    return undefined;
  }
  if (value.length > AGENT_CATALOG_LIMITS.descriptionChars) {
    addDiagnostic(diagnostics, "DESCRIPTION_TOO_LONG", "Role description exceeds the Agent Catalog character limit.", context);
    return undefined;
  }
  if (/[\r\n\u2028\u2029]/.test(value)) {
    addDiagnostic(diagnostics, "DESCRIPTION_MULTILINE", "Role description must contain exactly one line.", context);
    return undefined;
  }
  if (/[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
    addDiagnostic(diagnostics, "DESCRIPTION_INVALID", "Role description contains a forbidden control character.", context);
    return undefined;
  }
  return value.trim().replace(/[ \t]+/g, " ");
}

function boundedRoutingList(
  value: unknown,
  label: "positiveTriggers" | "nearMisses" | "expectedEvidence",
  diagnostics: AgentCatalogDiagnostic[],
  selector: string | undefined,
): readonly string[] | undefined {
  const context = selector === undefined ? {} : { selector };
  if (!Array.isArray(value) || value.length === 0) {
    addDiagnostic(diagnostics, "ROUTING_FIELD_INVALID", `Generated routing ${label} must be a non-empty array.`, context);
    return undefined;
  }
  if (value.length > AGENT_CATALOG_LIMITS.routingItems) {
    addDiagnostic(diagnostics, "ROUTING_LIMIT_EXCEEDED", `Generated routing ${label} exceeds the Agent Catalog item limit.`, context);
    return undefined;
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== "string"
      || item.length === 0
      || item.length > AGENT_CATALOG_LIMITS.routingItemChars
      || item !== item.trim()
      || /[\r\n\0\x00-\x1F\x7F]/.test(item)
    ) {
      addDiagnostic(diagnostics, "ROUTING_FIELD_INVALID", `Generated routing ${label} contains a malformed item.`, context);
      continue;
    }
    if (seen.has(item)) {
      addDiagnostic(diagnostics, "ROUTING_FIELD_DUPLICATE", `Generated routing ${label} contains a duplicate item.`, context);
      continue;
    }
    seen.add(item);
    result.push(item);
  }
  return Object.freeze(result);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function bundledRoutingManifest(): unknown {
  return JSON.parse(readFileSync(new URL("../../manifests/agent-routing.generated.json", import.meta.url), "utf8")) as unknown;
}

export function projectAgentCatalog(
  profiles: readonly RoleProfile[],
  routingInput?: unknown,
): AgentCatalogResult<AgentCatalog> {
  const diagnostics: AgentCatalogDiagnostic[] = [];
  if (!Array.isArray(profiles)) {
    addDiagnostic(diagnostics, "PROFILE_INPUT_INVALID", "Agent Catalog profiles must be an array.");
    return failure(diagnostics);
  }
  if (profiles.length !== BUNDLED_ROLE_SELECTORS.length) {
    addDiagnostic(diagnostics, "PROFILE_COUNT_INVALID", "Agent Catalog requires the exact current RoleProfile inventory.");
  }

  let routing: unknown;
  try {
    routing = routingInput ?? bundledRoutingManifest();
  } catch {
    addDiagnostic(diagnostics, "ROUTING_MANIFEST_LOAD_FAILED", "Generated Agent routing failed to load; no Agent Catalog was produced.");
    return failure(diagnostics);
  }

  if (!isRecord(routing) || !exactKeys(routing, ["schemaVersion", "source", "roles"])) {
    addDiagnostic(diagnostics, "ROUTING_MANIFEST_INVALID", "Generated Agent routing must use the exact supported manifest shape.");
    return failure(diagnostics);
  }
  if (routing.schemaVersion !== 1 || !isRecord(routing.source)
    || !exactKeys(routing.source, ["repository", "commit", "protocol", "sourceSha256"])
    || typeof routing.source.repository !== "string"
    || !/^[0-9a-f]{40}$/.test(String(routing.source.commit))
    || routing.source.protocol !== "aili-agent-selection/v1"
    || !/^[0-9a-f]{64}$/.test(String(routing.source.sourceSha256))) {
    addDiagnostic(diagnostics, "ROUTING_SOURCE_INVALID", "Generated Agent routing source identity or protocol is invalid.");
  }
  if (!Array.isArray(routing.roles) || routing.roles.length !== SPECIALIZED_ROLE_SELECTORS.length) {
    addDiagnostic(diagnostics, "ROUTING_ROLE_COUNT_INVALID", "Generated Agent routing requires every canonical Specialized selector exactly once.");
  }

  const profileBySelector = new Map<string, { description: string; status: RoleProfile["status"] }>();
  const names = new Set<string>();
  const selectors = new Set<string>();
  for (let index = 0; index < Math.min(profiles.length, BUNDLED_ROLE_SELECTORS.length); index += 1) {
    const candidate: unknown = profiles[index];
    if (!isRecord(candidate)) {
      addDiagnostic(diagnostics, "PROFILE_INVALID", "Agent Catalog contains a malformed RoleProfile.");
      continue;
    }
    const name = typeof candidate.name === "string" ? candidate.name : undefined;
    const selector = typeof candidate.selector === "string" ? candidate.selector : undefined;
    const context = selector === undefined ? {} : { selector };
    if (name === undefined || name.length === 0) addDiagnostic(diagnostics, "PROFILE_NAME_INVALID", "RoleProfile name is missing.", context);
    else if (names.has(name)) addDiagnostic(diagnostics, "PROFILE_NAME_DUPLICATE", "Agent Catalog contains a duplicate RoleProfile name.", context);
    else names.add(name);
    if (selector === undefined || selector.length === 0) addDiagnostic(diagnostics, "PROFILE_SELECTOR_INVALID", "RoleProfile selector is missing.");
    else if (selectors.has(selector)) addDiagnostic(diagnostics, "PROFILE_SELECTOR_DUPLICATE", "Agent Catalog contains a duplicate selector.", context);
    else selectors.add(selector);

    const expectedSelector = BUNDLED_ROLE_SELECTORS[index];
    const expectedName = expectedSelector === "general" ? "general" : expectedSelector.slice("aili.".length);
    if (selector !== expectedSelector || name !== expectedName) {
      addDiagnostic(diagnostics, "PROFILE_SELECTOR_ORDER_INVALID", "RoleProfiles must use the exact canonical selector and name order.", context);
    }
    if (candidate.profileVersion !== 2 || candidate.runtimeAdapterVersion !== 2) {
      addDiagnostic(diagnostics, "PROFILE_VERSION_INVALID", "RoleProfile version is not current.", context);
    }
    if (!STATUS_SET.has(String(candidate.status))) {
      addDiagnostic(diagnostics, "PROFILE_STATUS_INVALID", "RoleProfile status is invalid.", context);
    }
    const description = normalizedDescription(candidate.description, diagnostics, selector);
    if (
      selector === expectedSelector
      && name === expectedName
      && description !== undefined
      && STATUS_SET.has(String(candidate.status))
      && candidate.profileVersion === 2
      && candidate.runtimeAdapterVersion === 2
    ) {
      profileBySelector.set(selector, { description, status: candidate.status as RoleProfile["status"] });
    }
  }

  const entries: AgentCatalogEntry[] = [];
  const routingSelectors = new Set<string>();
  if (Array.isArray(routing.roles)) {
    const rowKeys = ["roleId", "selector", "positiveTriggers", "nearMisses", "expectedEvidence", "phaseAffinity", "executionGuidance"];
    for (const value of routing.roles) {
      if (!isRecord(value) || !exactKeys(value, rowKeys)) {
        addDiagnostic(diagnostics, "ROUTING_ROLE_INVALID", "Generated Agent routing contains a role with unsupported or missing fields.");
        continue;
      }
      const selector = typeof value.selector === "string" ? value.selector : undefined;
      const roleId = typeof value.roleId === "string" ? value.roleId : undefined;
      const context = selector === undefined ? {} : { selector };
      if (!selector || !roleId || selector !== `aili.${roleId}` || !SPECIALIZED_SELECTOR_SET.has(selector)) {
        addDiagnostic(diagnostics, "ROUTING_SELECTOR_INVALID", "Generated Agent routing role does not map to an exact canonical Specialized selector.", context);
        continue;
      }
      if (routingSelectors.has(selector)) {
        addDiagnostic(diagnostics, "ROUTING_SELECTOR_DUPLICATE", "Generated Agent routing contains a duplicate selector.", context);
        continue;
      }
      routingSelectors.add(selector);
      const descriptionProfile = profileBySelector.get(selector);
      if (!descriptionProfile) {
        addDiagnostic(diagnostics, "ROUTING_SELECTOR_UNKNOWN", "Generated Agent routing selector has no validated RoleProfile description.", context);
        continue;
      }
      const positiveTriggers = boundedRoutingList(value.positiveTriggers, "positiveTriggers", diagnostics, selector);
      const nearMisses = boundedRoutingList(value.nearMisses, "nearMisses", diagnostics, selector);
      const expectedEvidence = boundedRoutingList(value.expectedEvidence, "expectedEvidence", diagnostics, selector);
      const phaseAffinity = Array.isArray(value.phaseAffinity) ? value.phaseAffinity : [];
      if (phaseAffinity.length === 0 || phaseAffinity.length > AGENT_CATALOG_PHASES.length
        || phaseAffinity.some((phase) => typeof phase !== "string" || !PHASE_SET.has(phase))
        || new Set(phaseAffinity).size !== phaseAffinity.length) {
        addDiagnostic(diagnostics, "ROUTING_PHASE_AFFINITY_INVALID", "Generated phase affinity must contain unique supported phases and is advisory only.", context);
      }
      const executionGuidance = normalizedDescription(value.executionGuidance, diagnostics, selector);
      if (positiveTriggers && nearMisses && expectedEvidence && executionGuidance
        && phaseAffinity.length > 0 && phaseAffinity.every((phase) => typeof phase === "string" && PHASE_SET.has(phase))
        && new Set(phaseAffinity).size === phaseAffinity.length) {
        entries.push(Object.freeze({
          selector,
          description: descriptionProfile.description,
          status: descriptionProfile.status,
          routing: Object.freeze({
            roleId,
            positiveTriggers,
            nearMisses,
            expectedEvidence,
            phaseAffinity: Object.freeze(phaseAffinity as AgentCatalogPhase[]),
            executionGuidance,
          }),
        }));
      }
    }
  }
  for (const selector of SPECIALIZED_ROLE_SELECTORS) {
    if (!routingSelectors.has(selector)) addDiagnostic(diagnostics, "ROUTING_SELECTOR_MISSING", "Generated Agent routing is missing a canonical Specialized selector.", { selector });
  }
  if (diagnostics.length > 0) return failure(diagnostics);
  return success({ entries: Object.freeze(entries) });
}

export async function loadAgentCatalog(
  profileLoader: () => Promise<readonly RoleProfile[]> = loadRoleProfiles,
  routingLoader: () => Promise<unknown> = async () => JSON.parse(
    await readFile(new URL("../../manifests/agent-routing.generated.json", import.meta.url), "utf8"),
  ) as unknown,
): Promise<AgentCatalogResult<AgentCatalog>> {
  let profiles: readonly RoleProfile[];
  try {
    profiles = await profileLoader();
  } catch {
    return failure([{
      code: "ROLE_PROFILE_LOAD_FAILED",
      message: "Canonical RoleProfiles failed to load or validate; no Agent Catalog was produced.",
    }]);
  }
  try {
    return projectAgentCatalog(profiles, await routingLoader());
  } catch {
    return failure([{
      code: "ROUTING_MANIFEST_LOAD_FAILED",
      message: "Generated Agent routing failed to load; no Agent Catalog was produced.",
    }]);
  }
}

export function validateAgentPhasePolicy(catalog: AgentCatalog, policy: unknown): AgentCatalogResult<AgentPhasePolicy> {
  const diagnostics: AgentCatalogDiagnostic[] = [];
  if (!isRecord(policy)) {
    addDiagnostic(diagnostics, "PHASE_POLICY_INVALID", "Agent phase policy must be an object.");
    return failure(diagnostics);
  }
  for (const key of Object.keys(policy)) {
    if (!PHASE_SET.has(key)) addDiagnostic(diagnostics, "PHASE_UNKNOWN", "Agent phase policy contains an unknown phase.", { phase: key });
  }

  const normalized: Partial<Record<AgentCatalogPhase, readonly string[]>> = {};
  for (const phase of AGENT_CATALOG_PHASES) {
    const selectors = policy[phase];
    if (!Array.isArray(selectors) || selectors.length === 0 || selectors.length > AGENT_CATALOG_LIMITS.phaseSelectors) {
      addDiagnostic(diagnostics, "PHASE_SELECTORS_INVALID", "Agent phase recommendations must be a non-empty bounded array.", { phase });
      continue;
    }
    const seen = new Set<string>();
    const accepted: string[] = [];
    for (const selector of selectors) {
      if (typeof selector !== "string" || selector.length === 0) {
        addDiagnostic(diagnostics, "PHASE_SELECTOR_INVALID", "Agent phase recommendation contains a malformed selector.", { phase });
        continue;
      }
      if (seen.has(selector)) {
        addDiagnostic(diagnostics, "PHASE_SELECTOR_DUPLICATE", "Agent phase recommendation contains a duplicate selector.", { phase, selector });
        continue;
      }
      seen.add(selector);
      const entry = catalog.entries.find((candidate) => candidate.selector === selector);
      if (!entry) {
        addDiagnostic(diagnostics, "PHASE_SELECTOR_UNKNOWN", "Agent phase recommendation is absent from the current catalog.", { phase, selector });
        continue;
      }
      if (!SPECIALIZED_SELECTOR_SET.has(selector)) {
        addDiagnostic(diagnostics, "PHASE_SELECTOR_NOT_SPECIALIZED", "Formal phase recommendations require a Specialized selector.", { phase, selector });
        continue;
      }
      accepted.push(selector);
    }
    normalized[phase] = Object.freeze(accepted);
  }

  if (diagnostics.length > 0) return failure(diagnostics);
  return success(Object.freeze(normalized) as AgentPhasePolicy);
}

function concreteDispatchReason(value: unknown): string | undefined {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > AGENT_CATALOG_LIMITS.dispatchReasonChars
    || /[\r\n\0`]/.test(value)
  ) return undefined;
  const normalized = value.trim().replace(/[ \t]+/g, " ");
  if (!normalized || /^(?:pending|none|n\/a|tbd|unverified|-)(?:$|\s|:|—)/i.test(normalized)) return undefined;
  return normalized;
}

export function projectAgentPhaseView(
  profiles: readonly RoleProfile[],
  phase: string,
  activeOwners: readonly AgentCatalogOwnerInput[] = [],
): AgentCatalogResult<AgentCatalogPhaseView> {
  const catalogResult = projectAgentCatalog(profiles);
  if (!catalogResult.ok) return failure(catalogResult.diagnostics);
  if (!PHASE_SET.has(phase)) {
    return failure([{ code: "PHASE_UNKNOWN", message: "Agent Catalog view requires a known lifecycle phase.", phase: boundedLabel(phase) }]);
  }
  if (!Array.isArray(activeOwners) || activeOwners.length > AGENT_CATALOG_LIMITS.activeOwners) {
    return failure([{ code: "OWNER_INPUT_LIMIT_EXCEEDED", message: "Active Agent Owner input is malformed or exceeds its bound." }]);
  }

  const diagnostics: AgentCatalogDiagnostic[] = [];
  const seenPackages = new Set<string>();
  const activeBySelector = new Map<string, AgentCatalogActivePackage[]>();
  for (const candidate of activeOwners as readonly unknown[]) {
    if (!isRecord(candidate)) {
      addDiagnostic(diagnostics, "OWNER_INPUT_INVALID", "Active Agent Owner input is malformed.");
      continue;
    }
    const packageId = typeof candidate.packageId === "string" ? candidate.packageId : undefined;
    const packageContext = packageId === undefined ? {} : { packageId };
    if (packageId === undefined || !PACKAGE_ID_PATTERN.test(packageId)) {
      addDiagnostic(diagnostics, "OWNER_PACKAGE_INVALID", "Active Agent Owner package id is invalid.", packageContext);
      continue;
    }
    if (seenPackages.has(packageId)) {
      addDiagnostic(diagnostics, "OWNER_PACKAGE_DUPLICATE", "Active Agent Owner package id is duplicated.", packageContext);
      continue;
    }
    seenPackages.add(packageId);
    if (typeof candidate.status !== "string" || !PACKAGE_STATUS_SET.has(candidate.status)) {
      addDiagnostic(diagnostics, "OWNER_STATUS_INVALID", "Active Agent Owner package status is invalid.", packageContext);
      continue;
    }
    if (TERMINAL_PACKAGE_STATUS_SET.has(candidate.status)) continue;
    if (candidate.owner === "ROSE") continue;
    if (typeof candidate.owner !== "string" || !candidate.owner.startsWith("agent:")) {
      addDiagnostic(diagnostics, "OWNER_SELECTOR_INVALID", "Nonterminal Agent Owner must name an exact canonical selector.", packageContext);
      continue;
    }
    const selector = candidate.owner.slice("agent:".length);
    const context = { packageId, selector };
    if (!SPECIALIZED_SELECTOR_SET.has(selector) || !catalogResult.value.entries.some((entry) => entry.selector === selector)) {
      addDiagnostic(diagnostics, "OWNER_SELECTOR_UNKNOWN", "Nonterminal Agent Owner does not resolve to a current Specialized selector.", context);
      continue;
    }
    const dispatchReason = concreteDispatchReason(candidate.dispatchReason);
    if (dispatchReason === undefined) {
      addDiagnostic(diagnostics, "OWNER_REASON_REQUIRED", "Foregrounded Agent Owner requires a concrete one-line dispatch reason.", context);
      continue;
    }
    const packages = activeBySelector.get(selector) ?? [];
    packages.push(Object.freeze({
      packageId,
      status: candidate.status as AgentCatalogActivePackage["status"],
      dispatchReason,
    }));
    activeBySelector.set(selector, packages);
  }
  if (diagnostics.length > 0) return failure(diagnostics);

  const typedPhase = phase as AgentCatalogPhase;
  const recommendedSelectors = catalogResult.value.entries
    .filter((entry) => entry.routing.phaseAffinity.includes(typedPhase))
    .map((entry) => entry.selector);
  const recommendedSet = new Set(recommendedSelectors);
  const displayedSelectors = [
    ...recommendedSelectors,
    ...catalogResult.value.entries
      .map((entry) => entry.selector)
      .filter((selector) => activeBySelector.has(selector) && !recommendedSet.has(selector)),
  ];
  const entries = displayedSelectors.map((selector) => {
    const entry = catalogResult.value.entries.find((candidate) => candidate.selector === selector)!;
    return Object.freeze({
      ...entry,
      recommended: recommendedSet.has(selector),
      activePackages: Object.freeze(activeBySelector.get(selector) ?? []),
    });
  });
  return success(Object.freeze({ phase: typedPhase, entries: Object.freeze(entries) }));
}

export function renderCompactAgentCatalog(catalog: AgentCatalog): AgentCatalogResult<string> {
  const lines = [
    "Specialized Agent catalog (generated routing cues and phase affinity are selection advice only; they never grant tools or permissions):",
    ...catalog.entries.map((entry) => [
      `- ${entry.selector} — ${entry.description}`,
      `use=${entry.routing.positiveTriggers.join(" / ")}`,
      `avoid=${entry.routing.nearMisses.join(" / ")}`,
      `evidence=${entry.routing.expectedEvidence.join(" / ")}`,
      `phases(advisory)=${entry.routing.phaseAffinity.join("/")}`,
      `execution=${entry.routing.executionGuidance}`,
    ].join(" | ")),
  ];
  const content = lines.join("\n");
  if (content.length > AGENT_CATALOG_LIMITS.compactCatalogChars) {
    return failure([{
      code: "COMPACT_CATALOG_LIMIT_EXCEEDED",
      message: "Generated Agent Catalog exceeds its task metadata character limit.",
    }]);
  }
  return success(content);
}
