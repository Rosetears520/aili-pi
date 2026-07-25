import { createHash } from "node:crypto";
import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_URL = new URL("../../", import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT_URL);
const ROLES_PATH = resolve(ROOT_PATH, "roles");
const SOURCE_REPOSITORY = "https://github.com/Rosetears520/aili-workflows.git";
const SOURCE_COMMIT = "7eb35f357ad489f5841ee10dac1e44549c1bdb76";
const OUTPUT_CONTRACT = ["status", "summary", "evidence", "changedFiles", "verification", "blockers", "risks", "confidence"] as const;

export const SPECIALIZED_ROLE_NAMES = [
  "agent-evaluator", "ai-regression-scout", "browser-qa-runner", "code-reviewer",
  "code-scout", "convergence-reviewer", "doc-researcher", "e2e-artifact-runner",
  "implementer", "opensource-sanitizer", "plan-auditor", "pr-test-analyzer",
  "security-auditor", "silent-failure-reviewer", "spec-miner", "test-coverage-reviewer",
  "test-engineer", "web-performance-auditor", "web-researcher",
] as const;
export const SPECIALIZED_ROLE_SELECTORS = SPECIALIZED_ROLE_NAMES.map((name) => `aili.${name}`);
export const BUNDLED_ROLE_SELECTORS = [...SPECIALIZED_ROLE_SELECTORS, "general"] as const;

export interface RoleProfile {
  name: string;
  selector: string;
  description: string;
  profilePath: string;
  profileHash: string;
  profileVersion: 2;
  runtimeAdapterVersion: 2;
  sourceKind: "canonical-adapter" | "aili-owned" | "user-override" | "project-override";
  sourcePath: string | null;
  sourceHash: string;
  tools: string[];
  toolPolicy: "static" | "inherit-parent";
  capabilities: string[];
  spawns: string[];
  blocking: boolean;
  model?: string;
  status: "adapted" | "optional" | "blocked";
  compatibilityReason: string;
  sourceFrontmatterDisposition: Record<string, string>;
  prompt: string;
}

interface RolesManifest {
  schemaVersion: 2;
  runtimeAdapterVersion: 2;
  source: { repository: string; commit: string };
  bundledSelectors: string[];
  outputContract: string[];
  turnAuditFields: string[];
  records: Array<Omit<RoleProfile, "prompt" | "sourceKind"> & {
    sourceKind: "canonical-adapter" | "aili-owned";
  }>;
}

export interface RoleProfileOverride {
  selector: string;
  source: "user" | "project";
  profilePath: string;
  expectedHash?: string;
  enabled: true;
}

export interface RoleProfileCandidate {
  selector: string;
  source: "user" | "project";
  profilePath: string;
}

export interface ResolveRoleOverridesOptions {
  projectTrusted: boolean;
  userRoot: string;
  projectRoot: string;
  overrides: RoleProfileOverride[];
  discoveredCandidates?: RoleProfileCandidate[];
}

export interface ResolvedRoleProfiles {
  roles: RoleProfile[];
  diagnostics: string[];
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function profileFrontmatter(content: string): { name?: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("role profile lacks Pi frontmatter");
  return {
    name: match[1].match(/^name:\s*(.+)$/m)?.[1]?.trim(),
    body: match[2].trim(),
  };
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function readBundledProfile(record: RolesManifest["records"][number]): Promise<RoleProfile> {
  if (record.profilePath !== `roles/${record.name}.md`) throw new Error(`${record.name}: invalid bundled profile path`);
  const expected = resolve(ROOT_PATH, record.profilePath);
  if (!isInside(ROLES_PATH, expected)) throw new Error(`${record.name}: bundled profile escapes roles root`);
  const stat = await lstat(expected);
  if (stat.isSymbolicLink()) throw new Error(`${record.name}: bundled profile must not be a symlink`);
  const canonical = await realpath(expected);
  if (!isInside(await realpath(ROLES_PATH), canonical)) throw new Error(`${record.name}: bundled profile canonical path escapes roles root`);
  const content = await readFile(canonical, "utf8");
  if (hash(content) !== record.profileHash) throw new Error(`${record.name}: role profile hash drift`);
  const parsed = profileFrontmatter(content);
  if (parsed.name !== record.name) throw new Error(`${record.name}: profile frontmatter name mismatch`);
  return { ...record, prompt: parsed.body };
}

function validateManifest(manifest: RolesManifest): void {
  if (manifest.schemaVersion !== 2 || manifest.runtimeAdapterVersion !== 2) {
    throw new Error("role manifest must use schema v2 and runtime adapter v2");
  }
  if (manifest.source?.repository !== SOURCE_REPOSITORY || manifest.source?.commit !== SOURCE_COMMIT) {
    throw new Error("role manifest source provenance mismatch");
  }
  if (JSON.stringify(manifest.outputContract) !== JSON.stringify(OUTPUT_CONTRACT)) {
    throw new Error("role manifest output contract mismatch");
  }
  const turnAuditFields = ["selector", "profileHash", "sourceHash", "profileVersion", "runtimeAdapterVersion", "effectiveTools", "provider", "model", "thinking"];
  if (JSON.stringify(manifest.turnAuditFields) !== JSON.stringify(turnAuditFields)) {
    throw new Error("role manifest turn audit field inventory mismatch");
  }
  if (JSON.stringify(manifest.bundledSelectors) !== JSON.stringify(BUNDLED_ROLE_SELECTORS)) {
    throw new Error("role manifest bundled selector inventory mismatch");
  }
  if (!Array.isArray(manifest.records) || manifest.records.length !== 20) {
    throw new Error("role manifest must contain exactly 20 schema-v2 profiles");
  }
}

export async function loadRoleProfiles(): Promise<RoleProfile[]> {
  const manifest = JSON.parse(await readFile(new URL("manifests/roles.json", ROOT_URL), "utf8")) as RolesManifest;
  validateManifest(manifest);
  const roles = await Promise.all(manifest.records.map(readBundledProfile));
  const selectors = roles.map((role) => role.selector);
  if (new Set(selectors).size !== selectors.length) throw new Error("role manifest contains duplicate selectors");
  if (JSON.stringify(selectors) !== JSON.stringify(BUNDLED_ROLE_SELECTORS)) throw new Error("role record selector order mismatch");
  return roles;
}

async function readOverrideProfile(
  bundled: RoleProfile,
  override: RoleProfileOverride,
  allowedRoot: string,
): Promise<RoleProfile> {
  const canonicalRoot = await realpath(allowedRoot);
  const requested = resolve(allowedRoot, override.profilePath);
  const stat = await lstat(requested);
  if (stat.isSymbolicLink()) throw new Error(`${override.selector}: override profile must not be a symlink`);
  const canonical = await realpath(requested);
  if (!isInside(canonicalRoot, canonical)) throw new Error(`${override.selector}: override profile escapes configured root`);
  const content = await readFile(canonical, "utf8");
  const contentHash = hash(content);
  if (override.expectedHash && override.expectedHash !== contentHash) throw new Error(`${override.selector}: override profile hash mismatch`);
  const parsed = profileFrontmatter(content);
  if (parsed.name !== bundled.name) throw new Error(`${override.selector}: override frontmatter name mismatch`);
  return {
    ...bundled,
    profilePath: canonical,
    profileHash: contentHash,
    sourceKind: override.source === "project" ? "project-override" : "user-override",
    sourcePath: canonical,
    sourceHash: contentHash,
    prompt: parsed.body,
  };
}

/**
 * Apply only explicitly enabled same-selector overrides. Policy fields remain
 * bundled and therefore cannot broaden tools/spawns/capabilities. Project
 * content wins over user content only after project trust is active.
 */
export async function resolveRoleProfileOverrides(options: ResolveRoleOverridesOptions): Promise<ResolvedRoleProfiles> {
  const bundled = await loadRoleProfiles();
  const bySelector = new Map(bundled.map((role) => [role.selector, role]));
  const diagnostics: string[] = [];
  const selected = new Map<string, RoleProfileOverride>();
  const explicitKeys = new Set(options.overrides.filter((override) => override.enabled === true).map((override) => `${override.source}:${override.selector}:${override.profilePath}`));
  for (const candidate of options.discoveredCandidates ?? []) {
    if (!bySelector.has(candidate.selector)) continue;
    if (!explicitKeys.has(`${candidate.source}:${candidate.selector}:${candidate.profilePath}`)) {
      diagnostics.push(`${candidate.selector}: inactive same-name ${candidate.source} profile collision requires explicit opt-in`);
    }
  }

  for (const override of options.overrides) {
    if (override.enabled !== true) continue;
    if (!bySelector.has(override.selector)) {
      diagnostics.push(`${override.selector}: unknown bundled selector override ignored`);
      continue;
    }
    if (override.source === "project" && !options.projectTrusted) {
      diagnostics.push(`${override.selector}: untrusted project override ignored`);
      continue;
    }
    const current = selected.get(override.selector);
    if (!current || (current.source === "user" && override.source === "project")) selected.set(override.selector, override);
  }

  const roles: RoleProfile[] = [];
  for (const role of bundled) {
    const override = selected.get(role.selector);
    if (!override) {
      roles.push(role);
      continue;
    }
    const root = override.source === "project" ? options.projectRoot : options.userRoot;
    try {
      roles.push(await readOverrideProfile(role, override, root));
    } catch (error) {
      throw new Error(`${override.selector}: explicit ${override.source} profile override failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { roles, diagnostics };
}

export async function validateRoleProfiles(): Promise<string[]> {
  const errors: string[] = [];
  try {
    const roles = await loadRoleProfiles();
    const names = new Set<string>();
    const selectors = new Set<string>();
    for (const role of roles) {
      if (names.has(role.name)) errors.push(`${role.name}: duplicate role`);
      if (selectors.has(role.selector)) errors.push(`${role.selector}: duplicate selector`);
      names.add(role.name);
      selectors.add(role.selector);
      if (role.profileVersion !== 2 || role.runtimeAdapterVersion !== 2) errors.push(`${role.name}: profile/runtime version mismatch`);
      if (!role.prompt.includes("parent-scoped persistent official Pi Agent session")) errors.push(`${role.name}: persistent adapter contract missing`);
      if (!role.prompt.includes("Return exactly one JSON object")) errors.push(`${role.name}: output contract missing`);
      if (role.prompt.includes("OpenCode subagent") || role.prompt.includes(".agents/skills/") || role.prompt.includes("single-use") || role.prompt.includes("--no-session") || role.prompt.includes("Recursive AILI task dispatch is unavailable")) {
        errors.push(`${role.name}: obsolete source/runtime backend wording remains`);
      }
      if (role.name === "general") {
        if (role.selector !== "general" || role.toolPolicy !== "inherit-parent") errors.push("general: selector/tool policy mismatch");
        if (JSON.stringify(role.spawns) !== JSON.stringify(SPECIALIZED_ROLE_SELECTORS)) errors.push("general: spawn policy mismatch");
      } else {
        if (role.selector !== `aili.${role.name}` || role.toolPolicy !== "static") errors.push(`${role.name}: selector/tool policy mismatch`);
        if (role.spawns.length !== 0) errors.push(`${role.name}: specialized spawns must be empty`);
      }
    }
    const files = (await readdir(new URL("roles/", ROOT_URL))).filter((name) => name.endsWith(".md"));
    if (files.length !== 20) errors.push(`role files: expected 20, found ${files.length}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}
