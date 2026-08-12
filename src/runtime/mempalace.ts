import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { basename } from "node:path";

export const MEMPALACE_VERSION = "3.7.0";
export const MEMPALACE_PATH = "/home/rosetears/code/ai/.mempalace";

export interface TrustedProjectIdentity {
  root: string;
  remote?: string;
  trusted: boolean;
}

export interface MemPalaceScopeMapping {
  palace: typeof MEMPALACE_PATH;
  projectIdentity: string;
  wing: string;
  shared: "shared";
  diary: string;
}

function slug(value: string): string {
  const normalized = value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 48) || "project";
}

function stableSuffix(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export async function normalizeTrustedProject(input: TrustedProjectIdentity): Promise<{ root: string; identity: string }> {
  if (!input.trusted) throw new Error("MemPalace mapping requires a trusted project");
  if (!input.root || !input.root.startsWith("/")) throw new Error("MemPalace mapping requires an absolute project root");
  const stats = await lstat(input.root);
  if (!stats.isDirectory() && !stats.isSymbolicLink()) throw new Error("MemPalace project root must be a directory");
  const root = await realpath(input.root);
  const remote = input.remote?.trim();
  const identity = remote ? `${remote}\u0000${root}` : root;
  return { root, identity };
}

export async function mapMemPalaceScope(
  input: TrustedProjectIdentity,
  agentId: string,
): Promise<MemPalaceScopeMapping> {
  const project = await normalizeTrustedProject(input);
  const safeAgent = slug(agentId.trim());
  if (!agentId.trim()) throw new Error("MemPalace diary requires a stable Agent identity");
  const projectName = slug(basename(project.root));
  const projectIdentity = stableSuffix(project.identity);
  return {
    palace: MEMPALACE_PATH,
    projectIdentity,
    wing: `${projectName}-${projectIdentity}`,
    shared: "shared",
    diary: `${safeAgent}-${projectIdentity}`,
  };
}

export function assertSharedPromotion(authorized: boolean): "shared" {
  if (!authorized) throw new Error("Shared memory promotion requires explicit authority");
  return "shared";
}
