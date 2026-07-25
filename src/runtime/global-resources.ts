import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadRoleProfiles, type RoleProfile } from "./roles.js";

const ROOT = new URL("../../", import.meta.url);
export const ROSE_MARKER_START = "<!-- AILI-PI:ROSE:START -->";
export const ROSE_MARKER_END = "<!-- AILI-PI:ROSE:END -->";

export interface GlobalResourceReport {
  appendSystemPath: string;
  roleDirectory: string;
  appendSystem: "missing" | "installed" | "malformed";
  roles: { expected: number; installed: number; missing: string[]; stale: string[] };
}

export interface GlobalResourceInstallResult extends GlobalResourceReport {
  appended: "created" | "updated" | "unchanged";
  writtenRoles: string[];
}

export function globalResourcePaths(home = homedir()): { appendSystemPath: string; roleDirectory: string } {
  const agentDirectory = join(home, ".pi", "agent");
  return {
    appendSystemPath: join(agentDirectory, "APPEND_SYSTEM.md"),
    roleDirectory: join(agentDirectory, "agents", "aili"),
  };
}

function markerState(content: string): "missing" | "installed" | "malformed" {
  const starts = content.split(ROSE_MARKER_START).length - 1;
  const ends = content.split(ROSE_MARKER_END).length - 1;
  if (starts === 0 && ends === 0) return "missing";
  if (starts === 1 && ends === 1 && content.indexOf(ROSE_MARKER_START) < content.indexOf(ROSE_MARKER_END)) return "installed";
  return "malformed";
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function requireRealDirectory(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`global resource directory is not a real directory: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

async function expectedRoles(): Promise<RoleProfile[]> {
  // The 19 specialized profiles retain their existing global `aili.<role>`
  // installation surface. `general` is owned by the new internal task runtime;
  // installing it under agents/aili would create the forbidden `aili.general`
  // alias.
  return (await loadRoleProfiles()).filter((role) => role.selector !== "general");
}

export async function inspectGlobalResources(home = homedir()): Promise<GlobalResourceReport> {
  const { appendSystemPath, roleDirectory } = globalResourcePaths(home);
  const roles = await expectedRoles();
  const appendContent = await readOptional(appendSystemPath);
  const missing: string[] = [];
  let installed = 0;
  for (const role of roles) {
    const content = await readOptional(join(roleDirectory, `${role.name}.md`));
    if (content === undefined) missing.push(role.name);
    else if (content === await readFile(new URL(role.profilePath, ROOT), "utf8")) installed += 1;
    else missing.push(role.name);
  }
  let stale: string[] = [];
  try {
    const files = await readdir(roleDirectory);
    const expected = new Set(roles.map((role) => `${role.name}.md`));
    stale = files.filter((file) => file.endsWith(".md") && !expected.has(file)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    appendSystemPath,
    roleDirectory,
    appendSystem: appendContent === undefined ? "missing" : markerState(appendContent),
    roles: { expected: roles.length, installed, missing, stale },
  };
}

function updatedAppendSystem(existing: string | undefined, block: string): { content: string; action: "created" | "updated" | "unchanged" } {
  if (existing === undefined) return { content: `${block}\n`, action: "created" };
  const state = markerState(existing);
  if (state === "malformed") throw new Error("APPEND_SYSTEM.md contains malformed AILI marker boundaries; no mutation was made");
  if (state === "missing") return { content: `${existing.replace(/\s*$/, "")}\n\n${block}\n`, action: "updated" };
  const start = existing.indexOf(ROSE_MARKER_START);
  const end = existing.indexOf(ROSE_MARKER_END) + ROSE_MARKER_END.length;
  const content = `${existing.slice(0, start)}${block}${existing.slice(end)}`;
  return { content, action: content === existing ? "unchanged" : "updated" };
}

/**
 * Explicit global-resource operation. Package load never calls this function.
 * Callers must obtain the user approval required for the exact home-directory
 * target before invoking it outside a disposable test home.
 */
export async function installGlobalResources(home = homedir()): Promise<GlobalResourceInstallResult> {
  const { appendSystemPath, roleDirectory } = globalResourcePaths(home);
  const roles = await expectedRoles();
  const template = await readFile(new URL("templates/APPEND_SYSTEM.md", ROOT), "utf8");
  const existingAppend = await readOptional(appendSystemPath);
  const append = updatedAppendSystem(existingAppend, template.trim());
  const roleContents = await Promise.all(roles.map(async (role) => ({ role, content: await readFile(new URL(role.profilePath, ROOT), "utf8") })));

  await requireRealDirectory(join(home, ".pi"));
  await requireRealDirectory(join(home, ".pi", "agent"));
  await requireRealDirectory(join(home, ".pi", "agent", "agents"));
  await requireRealDirectory(roleDirectory);
  for (const { role, content } of roleContents) {
    const target = join(roleDirectory, `${role.name}.md`);
    const existing = await readOptional(target);
    if (existing !== undefined && existing !== content) {
      throw new Error(`global role collision at ${target}; no mutation was made`);
    }
  }

  await mkdir(join(home, ".pi", "agent", "agents"), { recursive: true });
  await mkdir(roleDirectory, { recursive: true });
  if (append.action !== "unchanged") await writeFile(appendSystemPath, append.content, "utf8");
  const writtenRoles: string[] = [];
  for (const { role, content } of roleContents) {
    const target = join(roleDirectory, `${role.name}.md`);
    if ((await readOptional(target)) === undefined) {
      await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
      writtenRoles.push(role.name);
    }
  }
  return { ...(await inspectGlobalResources(home)), appended: append.action, writtenRoles };
}

export function registerGlobalResourceCommand(pi: import("@earendil-works/pi-coding-agent").ExtensionAPI): void {
  pi.registerCommand("aili-install-global-resources", {
    description: "Explicitly install the AILI-owned APPEND_SYSTEM marker block and global AILI role profiles",
    handler: async (_args, context) => {
      try {
        const result = await installGlobalResources();
        context.ui.notify(`AILI global resources: append=${result.appended}; roles_written=${result.writtenRoles.length}; stale=${result.roles.stale.length}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.ui.notify(`AILI global resources: ${message.slice(0, 240)}`, "error");
      }
    },
  });
}
