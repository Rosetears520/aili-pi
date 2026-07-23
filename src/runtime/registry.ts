import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { loadRoleProfiles, validateRoleProfiles } from "./roles.ts";

const ROOT = new URL("../../", import.meta.url);

export type CompatibilityStatus = "native" | "adapted" | "optional" | "blocked";

export interface CapabilityRecord {
  id: string;
  provider: string;
  adapterOwner: string;
  platforms: string[];
  class: "required" | "optional";
  risk: { secret: string; network: string; sideEffect: string };
  probe: { id: string; kind: string; timeoutMs: number };
  dependentSkills: { source: string; capability: string };
  optionalPack?: {
    id: string;
    missingBehavior: string;
    enableGuidance: string;
    sideEffects: string[];
    futureOwner: string;
  };
}

interface CapabilityManifest {
  schemaVersion: number;
  providers: string[];
  capabilities: CapabilityRecord[];
}

interface CompatibilityRecord {
  name: string;
  requiredCapabilities: string[];
  optionalCapabilities: string[];
  status: CompatibilityStatus;
  reason: string;
  verification: string[];
  unverified: string[];
}

interface CompatibilityManifest {
  schemaVersion: number;
  allowedStatuses: string[];
  records: CompatibilityRecord[];
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, ROOT), "utf8")) as T;
}

export async function loadRegistry(): Promise<{
  capabilities: CapabilityManifest;
  compatibility: CompatibilityManifest;
}> {
  return {
    capabilities: await json<CapabilityManifest>("manifests/capabilities.json"),
    compatibility: await json<CompatibilityManifest>("manifests/skill-compatibility.json"),
  };
}

export async function validateRegistry(): Promise<string[]> {
  const { capabilities, compatibility } = await loadRegistry();
  return validateRegistryData(capabilities, compatibility);
}

export function validateRegistryData(
  capabilities: CapabilityManifest,
  compatibility: CompatibilityManifest,
): string[] {
  const errors: string[] = [];
  const capabilityIds = new Set<string>();
  const skillNames = new Set<string>();
  const allowedStatuses = new Set(["native", "adapted", "optional", "blocked"]);

  if (capabilities.schemaVersion !== 1) errors.push("capabilities: unsupported schemaVersion");
  if (compatibility.schemaVersion !== 1) errors.push("compatibility: unsupported schemaVersion");
  if (JSON.stringify([...compatibility.allowedStatuses].sort()) !== JSON.stringify([...allowedStatuses].sort())) {
    errors.push("compatibility: allowedStatuses must be exactly native, adapted, optional, blocked");
  }

  for (const capability of capabilities.capabilities) {
    if (!capability.id || capabilityIds.has(capability.id)) errors.push(`capability: duplicate or missing id ${capability.id}`);
    capabilityIds.add(capability.id);
    if (!capabilities.providers.includes(capability.provider)) errors.push(`${capability.id}: unknown provider ${capability.provider}`);
    if (!capability.adapterOwner || capability.platforms.length === 0) errors.push(`${capability.id}: missing owner or platform`);
    if (!capability.probe?.id || !capability.probe.kind || capability.probe.timeoutMs <= 0) errors.push(`${capability.id}: missing or invalid probe`);
    if (capability.dependentSkills.capability !== capability.id) errors.push(`${capability.id}: dependent-skill selector mismatch`);
    if (capability.class === "optional" && !capability.optionalPack) errors.push(`${capability.id}: optional pack guidance is missing`);
  }

  for (const skill of compatibility.records) {
    if (!skill.name || skillNames.has(skill.name)) errors.push(`skill: duplicate or missing name ${skill.name}`);
    skillNames.add(skill.name);
    if (!allowedStatuses.has(skill.status)) errors.push(`${skill.name}: invalid status ${skill.status}`);
    if (!skill.reason || skill.verification.length === 0) errors.push(`${skill.name}: evidence or reason is missing`);
    for (const id of [...skill.requiredCapabilities, ...skill.optionalCapabilities]) {
      if (!capabilityIds.has(id)) errors.push(`${skill.name}: dangling capability ${id}`);
    }
  }

  for (const capability of capabilities.capabilities) {
    const hasDependent = compatibility.records.some((skill) =>
      [...skill.requiredCapabilities, ...skill.optionalCapabilities].includes(capability.id),
    );
    if (!hasDependent) errors.push(`${capability.id}: no dependent skills`);
  }
  return errors;
}

export async function validateStableRelease(): Promise<string[]> {
  const registryErrors = await validateRegistry();
  const { compatibility } = await loadRegistry();
  const errors = [
    ...registryErrors,
    ...(await validateProvenance()),
    ...(await validateLiveVerification()),
    ...compatibility.records
      .filter((record) => record.status === "blocked")
      .map((record) => `${record.name}: blocked (${record.reason})`),
  ];
  const packageJson = await json<{ pi?: { prompts?: string[] } }>("package.json");
  if (packageJson.pi?.prompts?.length !== 5) errors.push("lifecycle prompts: expected exactly five prompt resources");
  for (const prompt of packageJson.pi?.prompts ?? []) {
    try { await access(new URL(prompt, ROOT)); } catch { errors.push(`lifecycle prompt: missing ${prompt}`); }
  }
  try {
    const roles = (await readdir(new URL("roles/", ROOT))).filter((name) => name.endsWith(".md"));
    if (roles.length !== 19) errors.push(`roles: expected 19 generated profiles, found ${roles.length}`);
    for (const error of await validateRoleProfiles()) errors.push(`roles: ${error}`);
    for (const role of await loadRoleProfiles()) {
      if (role.status === "blocked") errors.push(`role ${role.name}: blocked (${role.compatibilityReason})`);
    }
  } catch {
    errors.push("roles: required generated profiles are missing");
  }
  if (process.platform !== "linux") errors.push(`platform: unsupported ${process.platform}; stable scope is linux-only`);
  return errors;
}

export async function validateLiveVerification(): Promise<string[]> {
  const errors: string[] = [];
  try {
    const evidence = await json<{
      schemaVersion?: number; platform?: string; piVersion?: string; status?: string;
      probes?: Array<{ id?: string; status?: string; changedFiles?: number }>;
      implementation?: Record<string, string>;
    }>("manifests/live-verification.json");
    if (evidence.schemaVersion !== 1 || evidence.platform !== "linux" || evidence.piVersion !== "0.81.1" || evidence.status !== "passed") errors.push("live verification: identity is incomplete or non-pass");
    const genericProbe = evidence.probes?.find((probe) => probe.id === "generic-agentless-read-package");
    const credentialProbe = evidence.probes?.find((probe) => probe.id === "generic-credential-guard");
    if (evidence.probes?.length !== 3 || evidence.probes.some((probe) => probe.status !== "passed") || genericProbe?.changedFiles !== 0 || credentialProbe?.changedFiles !== 0) {
      errors.push("live verification: required probes are missing, non-pass, or mutated files");
    }
    for (const [filePath, expected] of Object.entries(evidence.implementation ?? {})) {
      const content = await readFile(new URL(filePath, ROOT), "utf8");
      const actual = createHash("sha256").update(content).digest("hex");
      if (actual !== expected) errors.push(`live verification: implementation drift ${filePath}`);
    }
    if (Object.keys(evidence.implementation ?? {}).length !== 3) errors.push("live verification: implementation binding must contain exactly three files");
  } catch (error) {
    errors.push(`live verification: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export async function validateProvenance(): Promise<string[]> {
  const errors: string[] = [];
  try {
    const provenance = await json<{ schemaVersion: number; sources: Array<{ name: string; revision: string; license: string; status: string; repository: string; sourceFiles: string[]; symbols: string[]; localChanges: string[]; verification: string[] }> }>("manifests/provenance.json");
    const sbom = await json<{ spdxVersion?: string; packages?: Array<{ SPDXID?: string; name?: string; licenseDeclared?: string }> }>("manifests/sbom.json");
    const notices = await readFile(new URL("THIRD_PARTY_NOTICES.md", ROOT), "utf8");
    if (provenance.schemaVersion !== 1 || provenance.sources.length !== 9) errors.push("provenance: expected nine schema-v1 source records");
    const names = new Set<string>();
    for (const source of provenance.sources) {
      if (!source.name || names.has(source.name)) errors.push(`provenance: duplicate or missing source ${source.name}`);
      names.add(source.name);
      if ((!/^[0-9a-f]{40}$/.test(source.revision) && !/^npm:[0-9]+\.[0-9]+\.[0-9]+$/.test(source.revision)) || !source.repository.startsWith("https://") || !source.license || source.verification.length === 0) errors.push(`provenance: incomplete identity for ${source.name}`);
      if (source.status === "adapted" && (source.sourceFiles.length === 0 || source.symbols.length === 0 || source.localChanges.length === 0)) errors.push(`provenance: incomplete adapted source ${source.name}`);
      if (source.status === "reference-only" && (source.sourceFiles.length > 0 || source.symbols.length > 0 || source.localChanges.length > 0)) errors.push(`provenance: reference-only source claims reuse ${source.name}`);
      if (source.status === "dependency" && (source.sourceFiles.length === 0 || source.symbols.length === 0 || source.localChanges.length === 0)) errors.push(`provenance: incomplete dependency source ${source.name}`);
      if (!notices.includes(`## ${source.name}`) || !notices.includes(`Revision: ${source.revision}`)) errors.push(`provenance: notice missing ${source.name}`);
    }
    if (sbom.spdxVersion !== "SPDX-2.3" || !Array.isArray(sbom.packages) || sbom.packages.length < 3) errors.push("provenance: invalid or empty SPDX SBOM");
    if (sbom.packages?.some((item) => !item.SPDXID || !item.name || !item.licenseDeclared)) errors.push("provenance: incomplete SPDX package record");
  } catch (error) {
    errors.push(`provenance: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export interface CapabilityDecision {
  status: "PASS" | "WARN" | "SKIP" | "ERROR";
  capability: string;
  message: string;
}

export async function assessCapability(
  capabilityId: string,
  enabledProviders: ReadonlySet<string>,
): Promise<CapabilityDecision> {
  const { capabilities } = await loadRegistry();
  const capability = capabilities.capabilities.find((item) => item.id === capabilityId);
  if (!capability) return { status: "ERROR", capability: capabilityId, message: "Unknown capability; no work ran." };
  if (enabledProviders.has(capability.provider)) {
    return { status: "PASS", capability: capabilityId, message: `Provider ${capability.provider} is enabled.` };
  }
  if (capability.class === "optional") {
    return {
      status: "SKIP",
      capability: capabilityId,
      message: `${capability.optionalPack?.missingBehavior ?? "Optional capability is unavailable."} Pack=${capability.optionalPack?.id ?? "unverified"}. No work ran.`,
    };
  }
  return { status: "WARN", capability: capabilityId, message: `Required provider ${capability.provider} is unavailable. No work ran.` };
}
