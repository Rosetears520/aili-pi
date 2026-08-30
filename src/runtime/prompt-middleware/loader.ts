import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { load as parseYaml } from "js-yaml";
import type { PromptModifierDefinition, PromptScope, RuntimePolicyPatch } from "./types.js";

export interface ModifierDiscoveryRoot { path: string; trusted: boolean; }

export async function discoverPromptModifiers(roots: readonly ModifierDiscoveryRoot[]): Promise<readonly PromptModifierDefinition[]> {
  const definitions: PromptModifierDefinition[] = [];
  for (const root of roots) {
    if (!root.trusted) continue;
    let info;
    try { info = await lstat(root.path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`prompt modifier root is unsafe: ${root.path}`);
    const canonical = await realpath(root.path);
    for (const entry of (await readdir(canonical, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new Error(`prompt modifier symlink is forbidden: ${entry.name}`);
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const path = resolve(join(canonical, entry.name));
      if (!path.startsWith(`${canonical}/`)) throw new Error("prompt modifier escaped discovery root");
      definitions.push(parsePromptModifier(await readFile(path, "utf8"), path));
    }
  }
  return Object.freeze(definitions);
}

export function parsePromptModifier(text: string, sourcePath: string): PromptModifierDefinition {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(text.replaceAll("\r\n", "\n"));
  if (!match) throw new Error(`prompt modifier frontmatter is invalid: ${sourcePath}`);
  const metadata = parseYaml(match[1]!) as Record<string, unknown>;
  const body = match[2]!.trim();
  const id = string(metadata.id, "id");
  const name = typeof metadata.name === "string" ? metadata.name.trim() : id;
  const placement = metadata.placement === "prepend" ? "prepend" : metadata.placement === "append" || metadata.placement === undefined ? "append" : fail("placement");
  const scopes = array(metadata.scopes ?? ["main"], "scopes") as PromptScope[];
  const patch = metadata.runtimePolicyPatch && typeof metadata.runtimePolicyPatch === "object" ? metadata.runtimePolicyPatch as RuntimePolicyPatch : undefined;
  return Object.freeze({
    id, name, ...(typeof metadata.description === "string" ? { description: metadata.description.trim() } : {}), placement,
    order: metadata.order === undefined ? 9999 : number(metadata.order, "order"), scopes: Object.freeze(scopes),
    oneShot: metadata.oneShot !== false, requires: Object.freeze(array(metadata.requires ?? [], "requires")), conflicts: Object.freeze(array(metadata.conflicts ?? [], "conflicts")),
    ...(patch ? { runtimePolicyPatch: Object.freeze(patch) } : {}), body, sourcePath,
    hash: createHash("sha256").update(body).digest("hex"),
  });
}
function string(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`prompt modifier ${name} is invalid`); return value.trim(); }
function array(value: unknown, name: string): string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`prompt modifier ${name} is invalid`); return value.map((item) => String(item).trim()); }
function number(value: unknown, name: string): number { if (!Number.isSafeInteger(value)) throw new Error(`prompt modifier ${name} is invalid`); return Number(value); }
function fail(name: string): never { throw new Error(`prompt modifier ${name} is invalid`); }
