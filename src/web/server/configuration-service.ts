import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import {
  DefaultPackageManager,
  SettingsManager,
  getAgentDir,
  parseFrontmatter,
  type PackageSource,
} from "@earendil-works/pi-coding-agent";
import { writeModelsConfig } from "../lib/models-config-store.js";
import { mergeKeybinds } from "../lib/aili-keybinds.js";
import { getAllowedFileRoots, isExistingFilePathAllowed, isWindowsAbsolutePath } from "../lib/file-access.js";
import { listMcpPanelServers, setMcpPanelServerDisabled } from "../lib/mcp-panel-access.js";
import { invalidateModelsCache } from "../lib/models-cache.js";
import { getProjectTrustStatus, trustProject } from "../lib/project-trust.js";
import { runNpx } from "../lib/npx.js";
import { buildSkillUpdateArgs } from "../lib/skill-updates.js";
import { loadSkillsWithInstallInfo } from "../lib/skills-service.js";
import { writePrivateFileAtomicSync } from "../lib/atomic-file.js";
import type { JsonValue } from "../../runtime/web/contracts.js";

export const CONFIGURATION_COMMANDS = Object.freeze({
  "models.configure": Object.freeze(["replace"]),
  "plugins.configure": Object.freeze(["plugin_action"]),
  "skills.configure": Object.freeze(["toggle_model_invocation", "install", "update"]),
  "mcp.configure": Object.freeze(["set_disabled"]),
  "keybinds.configure": Object.freeze(["replace"]),
  "project_trust.configure": Object.freeze(["trust"]),
} as const);

export interface ConfigurationExecutionResult { readonly result: JsonValue; }

const require = createRequire(import.meta.url);
type RpcManagerMutationHooks = {
  readonly hasBusyRpcSessionForCwd: (cwd: string) => boolean;
  readonly destroyRpcSessionsForCwd: (cwd: string) => Promise<void>;
};
function rpcManagerMutationHooks(): RpcManagerMutationHooks {
  return require("../lib/rpc-manager.js") as RpcManagerMutationHooks;
}

/** Server-only configuration mutation service. It has no AgentSession dependency. */
export class ConfigurationMutationService {
  public async dispose(): Promise<void> { /* owned by the foreground composition */ }

  public async execute(capability: string, commandType: string, args: Readonly<Record<string, JsonValue>>): Promise<ConfigurationExecutionResult> {
    if (!isConfigurationCommand(capability, commandType)) throw new Error("unsupported-configuration-command");
    if (capability === "models.configure") {
      const config = object(args.config);
      writeModelsConfig(config);
      return { result: { success: true } };
    }
    if (capability === "plugins.configure") return { result: await mutatePlugin(args) as JsonValue };
    if (capability === "mcp.configure") return { result: await configureMcp(args) };
    if (capability === "keybinds.configure") return { result: configureKeybinds(args) };
    if (capability === "project_trust.configure") return { result: await configureProjectTrust(args) };
    if (commandType === "toggle_model_invocation") return { result: await toggleSkill(args) };
    if (commandType === "install") return { result: await installSkill(args) };
    return { result: await updateSkill(args) as JsonValue };
  }
}

export function isConfigurationCommand(capability: string, commandType: string): boolean {
  return (CONFIGURATION_COMMANDS as Readonly<Record<string, readonly string[]>>)[capability]?.includes(commandType) === true;
}

async function mutatePlugin(args: Readonly<Record<string, JsonValue>>): Promise<JsonValue> {
  const cwd = requiredString(args.cwd, "cwd");
  const action = requiredString(args.action, "action");
  if (!["install", "remove", "update", "disable", "enable"].includes(action)) throw new Error(`Unsupported action: ${action}`);
  await assertAllowedCwd(cwd);
  const scope = args.scope === "project" ? "project" : "global";
  const agentDir = getAgentDir();
  const trust = getProjectTrustStatus(cwd, agentDir);
  if (scope === "project" && !trust.trusted) throw new Error("Project resources must be trusted before modifying project plugins");
  const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: trust.trusted });
  const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
  const source = typeof args.source === "string" ? args.source.trim() : "";
  const local = scope === "project";
  if (action !== "update" && !source) throw new Error("source required");
  if (action === "install") await manager.installAndPersist(source, { local });
  else if (action === "remove") await manager.removeAndPersist(source, { local });
  else if (action === "update") await manager.update(source || undefined);
  else {
    setPackageDisabled(settings, source, scope, action === "disable");
    await settings.flush();
  }
  // Preserve the retained route's useful response shape without loading an AgentSession.
  return { success: true, action, source, scope };
}

async function toggleSkill(args: Readonly<Record<string, JsonValue>>): Promise<JsonValue> {
  const filePath = requiredString(args.filePath, "filePath");
  if (!existsSync(filePath)) throw new Error("file not found");
  const roots = new Set<string>(await getAllowedFileRoots());
  roots.add(getAgentDir());
  const globalSkills = path.join(homedir(), ".agents", "skills");
  if (existsSync(globalSkills)) roots.add(globalSkills);
  const before = realpathSync(filePath);
  if (!isExistingFilePathAllowed(before, roots)) throw new Error("Access denied");
  const content = readFileSync(before, "utf8");
  const key = "disable-model-invocation";
  const desired = args.disableModelInvocation === true;
  const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content);
  const set = Boolean(frontmatter[key]);
  let updated = content;
  if (desired && !set) {
    updated = content.replace(/^---\r?\n/, `---\n${key}: true\n`);
    if (updated === content) updated = `---\n${key}: true\n---\n${content}`;
  } else if (!desired && set) updated = content.replace(new RegExp(`^${key}\\s*:.*\\r?\\n`, "m"), "");
  if (realpathSync(filePath) !== before) throw new Error("operation-precondition-changed");
  writePrivateFileAtomicSync(before, updated);
  return { success: true };
}

async function installSkill(args: Readonly<Record<string, JsonValue>>): Promise<JsonValue> {
  const pkg = requiredString(args.package, "package").trim();
  const scope = args.scope === "project" ? "project" : "global";
  const cwd = typeof args.cwd === "string" ? args.cwd : "";
  if (scope === "project") {
    if (!cwd) throw new Error("cwd required for project install");
    await assertAllowedCwd(cwd);
    if (!getProjectTrustStatus(cwd, getAgentDir()).trusted) throw new Error("Project resources must be trusted before installing project skills");
  }
  const command = ["skills", "add", pkg, "-y", "--agent", "pi", ...(scope === "global" ? ["-g"] : [])];
  const { stdout, stderr } = await runNpx(command, { timeout: 60_000, cwd: scope === "project" ? cwd : undefined, env: { ...process.env, FORCE_COLOR: "0" } });
  const output = boundedOutput(`${stdout}${stderr}`);
  if (!/Installation complete|Installed \d+ skill/.test(output)) throw new Error(output || "Install failed");
  return { success: true, output };
}

async function updateSkill(args: Readonly<Record<string, JsonValue>>): Promise<JsonValue> {
  const cwd = requiredString(args.cwd, "cwd");
  const pkg = requiredString(args.package, "package");
  const scope = args.scope === "global" || args.scope === "project" ? args.scope : undefined;
  if (!scope) throw new Error("scope required");
  await assertAllowedCwd(cwd);
  const loaded = await loadSkillsWithInstallInfo(cwd);
  const skill = loaded.skills.find((item) => item.install?.package === pkg && item.install.scope === scope);
  if (!skill?.install) throw new Error("Installed skill not found");
  if (!skill.install.canCheckForUpdates) throw new Error("This skill cannot be updated automatically");
  const { stdout, stderr } = await runNpx(buildSkillUpdateArgs(skill.install), { timeout: 60_000, cwd: scope === "project" ? cwd : undefined, env: { ...process.env, FORCE_COLOR: "0" } });
  return { success: true, output: boundedOutput(`${stdout}${stderr}`) };
}

async function configureMcp(args: Readonly<Record<string, JsonValue>>): Promise<JsonValue> {
  const requestedCwd = requiredString(args.cwd, "cwd").trim();
  if (!path.isAbsolute(requestedCwd) && !isWindowsAbsolutePath(requestedCwd)) throw new Error("cwd must be an absolute path");
  const cwd = path.isAbsolute(requestedCwd) ? path.resolve(requestedCwd) : requestedCwd;
  const name = requiredString(args.name, "name");
  if (typeof args.disabled !== "boolean") throw new Error("disabled must be a boolean");
  await assertAllowedCwd(cwd);
  const changed = setMcpPanelServerDisabled(name, args.disabled, cwd).changed;
  return { changed, servers: listMcpPanelServers(cwd).servers as unknown as JsonValue, reloadHint: true };
}

function configureKeybinds(args: Readonly<Record<string, JsonValue>>): JsonValue {
  const merged = mergeKeybinds(args.bindings);
  writePrivateFileAtomicSync(
    path.join(getAgentDir(), "aili-web-keybinds.json"),
    `${JSON.stringify(merged, null, 2)}\n`,
  );
  return merged as JsonValue;
}

async function configureProjectTrust(args: Readonly<Record<string, JsonValue>>): Promise<JsonValue> {
  const cwd = path.resolve(requiredString(args.cwd, "cwd"));
  let directory = false;
  try { directory = statSync(cwd).isDirectory(); } catch { /* bounded validation below */ }
  if (!directory) throw new Error("Directory does not exist");
  await assertAllowedCwd(cwd);
  const agentDir = getAgentDir();
  const current = getProjectTrustStatus(cwd, agentDir);
  if (!current.requiresTrust) throw new Error("This project has no resources that require trust");
  const rpc = rpcManagerMutationHooks();
  if (rpc.hasBusyRpcSessionForCwd(cwd)) throw new Error("Wait for the active session to finish before trusting this project");
  // Revalidate the root immediately before the security decision is persisted.
  await assertAllowedCwd(cwd);
  const status = trustProject(cwd, agentDir);
  invalidateModelsCache();
  await rpc.destroyRpcSessionsForCwd(cwd);
  return status as unknown as JsonValue;
}

async function assertAllowedCwd(cwd: string): Promise<void> {
  const roots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, roots)) throw new Error("Access denied");
}
function getSource(entry: PackageSource): string { return typeof entry === "string" ? entry : entry.source; }
function setPackageDisabled(settings: SettingsManager, source: string, scope: "global" | "project", disabled: boolean): void {
  const current = scope === "project" ? settings.getProjectSettings().packages ?? [] : settings.getGlobalSettings().packages ?? [];
  const next = current.map((entry): PackageSource => getSource(entry) !== source ? entry : disabled
    ? { ...(typeof entry === "string" ? { source: entry } : entry), extensions: [], skills: [], prompts: [], themes: [] }
    : getSource(entry));
  if (scope === "project") settings.setProjectPackages(next); else settings.setPackages(next);
}
function object(value: JsonValue | undefined): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("config required"); return value as Record<string, unknown>; }
function requiredString(value: JsonValue | undefined, name: string): string { if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error(`${name} required`); return value; }
function boundedOutput(value: string): string { return value.replace(/\x1B\[[0-9;]*m/g, "").slice(-4 * 1024); }
