import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);

export interface RoleProfile {
  name: string;
  description: string;
  profilePath: string;
  profileHash: string;
  tools: string[];
  capabilities: string[];
  status: "adapted" | "optional" | "blocked";
  compatibilityReason: string;
  prompt: string;
}

interface RolesManifest {
  schemaVersion: 1;
  outputContract: string[];
  records: Omit<RoleProfile, "prompt">[];
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function promptBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  if (!match) throw new Error("role profile lacks Pi frontmatter");
  return match[1].trim();
}

export async function loadRoleProfiles(): Promise<RoleProfile[]> {
  const manifest = JSON.parse(await readFile(new URL("manifests/roles.json", ROOT), "utf8")) as RolesManifest;
  if (manifest.schemaVersion !== 1 || manifest.records.length !== 19) throw new Error("role manifest must contain exactly 19 schema-v1 profiles");
  const roles: RoleProfile[] = [];
  for (const record of manifest.records) {
    const content = await readFile(new URL(record.profilePath, ROOT), "utf8");
    if (hash(content) !== record.profileHash) throw new Error(`${record.name}: role profile hash drift`);
    roles.push({ ...record, prompt: promptBody(content) });
  }
  return roles;
}

export async function validateRoleProfiles(): Promise<string[]> {
  const errors: string[] = [];
  try {
    const roles = await loadRoleProfiles();
    const names = new Set<string>();
    for (const role of roles) {
      if (names.has(role.name)) errors.push(`${role.name}: duplicate role`);
      names.add(role.name);
      if (!role.prompt.includes("Recursive AILI task dispatch is unavailable")) errors.push(`${role.name}: recursion guard missing`);
      if (!role.prompt.includes("Return exactly one JSON object")) errors.push(`${role.name}: output contract missing`);
      if (role.prompt.includes("OpenCode subagent") || role.prompt.includes(".agents/skills/")) errors.push(`${role.name}: unsupported source backend wording remains`);
    }
    const files = (await readdir(new URL("roles/", ROOT))).filter((name) => name.endsWith(".md"));
    if (files.length !== 19) errors.push(`role files: expected 19, found ${files.length}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}
