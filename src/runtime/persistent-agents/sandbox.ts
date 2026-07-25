import { lstat } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBashToolDefinition, type BashOperations, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { profileToConfig, readOnlyOverride, type SandboxConfig } from "pi-permission-modes/src/config-load.ts";
import { createSandboxedBashOps } from "pi-permission-modes/src/sandbox.ts";
import type { SandboxProfile } from "pi-permission-modes/src/schema.ts";
import { resolvePermissionModesPackageRoot } from "../package-resolution.js";

type SandboxManagerType = Parameters<typeof createSandboxedBashOps>[0];
let managerPromise: Promise<SandboxManagerType> | undefined;

function resolveProfilePath(cwd: string, path: string): string {
  if (path === ".") return cwd;
  if (path.startsWith("./") || path.startsWith("../")) return resolve(cwd, path);
  return isAbsolute(path) ? path : path;
}

async function installedSandboxManager(): Promise<SandboxManagerType> {
  managerPromise ??= (async () => {
    const permissionRoot = resolvePermissionModesPackageRoot();
    const requireFromPermissionModes = createRequire(new URL("package.json", permissionRoot));
    const entry = requireFromPermissionModes.resolve("@anthropic-ai/sandbox-runtime");
    const loaded = await import(pathToFileURL(entry).href) as { SandboxManager?: SandboxManagerType };
    if (!loaded.SandboxManager) throw new Error("sandbox runtime did not export SandboxManager");
    return loaded.SandboxManager;
  })();
  return await managerPromise;
}

export function childSandboxConfig(profile: SandboxProfile, cwd: string): Partial<SandboxConfig> {
  const projected = profileToConfig({
    ...profile,
    allowWrite: (profile.allowWrite ?? []).map((path) => resolveProfilePath(cwd, path)),
    denyWrite: (profile.denyWrite ?? []).map((path) => resolveProfilePath(cwd, path)),
    denyRead: (profile.denyRead ?? []).map((path) => resolveProfilePath(cwd, path)),
  });
  return profile.writable ? projected : readOnlyOverride(projected);
}

export async function childGitMetadataBlocksSandbox(cwd: string): Promise<boolean> {
  try {
    return (await lstat(resolve(cwd, ".git"))).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function createChildSandboxBash(
  profile: SandboxProfile,
  cwd: string,
): Promise<{ operations?: BashOperations; definition?: ToolDefinition; reason?: string }> {
  if (!profile.enabled) return { reason: "sandbox-disabled-by-mode" };
  if (await childGitMetadataBlocksSandbox(cwd)) return { reason: "sandbox-unavailable-for-git-worktree-metadata" };
  try {
    const manager = await installedSandboxManager();
    if (!manager.isSandboxingEnabled()) return { reason: "parent-sandbox-controller-unavailable" };
    const operations = createSandboxedBashOps(manager, childSandboxConfig(profile, cwd));
    return {
      operations,
      definition: createBashToolDefinition(cwd, { operations }) as unknown as ToolDefinition,
    };
  } catch (error) {
    return { reason: `sandbox-load-failed:${error instanceof Error ? error.message : String(error)}` };
  }
}
