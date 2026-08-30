import { DefaultPackageManager, SettingsManager, getAgentDir, type PackageSource } from "@earendil-works/pi-coding-agent";
import { getProjectTrustStatus } from "../lib/project-trust.js";
import type { PluginDiagnostic, PluginPackageInfo, PluginsResponse, PluginScope } from "../lib/api-types.js";

function sourceOf(entry: PackageSource): string { return typeof entry === "string" ? entry : entry.source; }
function disabled(entry: PackageSource): boolean { return typeof entry !== "string" && [entry.extensions, entry.skills, entry.prompts, entry.themes].every((value) => Array.isArray(value) && value.length === 0); }

/** Server-only package query; routes never receive a package manager. */
export async function readPlugins(cwd: string): Promise<PluginsResponse> {
  const agentDir = getAgentDir();
  const trust = getProjectTrustStatus(cwd, agentDir);
  const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: trust.trusted });
  const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
  const disabledKeys = new Set<string>();
  for (const [scope, entries] of [["global", settings.getGlobalSettings().packages ?? []], ["project", settings.getProjectSettings().packages ?? []]] as const) {
    for (const entry of entries) if (disabled(entry)) disabledKeys.add(`${scope}\0${sourceOf(entry)}`);
  }
  const diagnostics: PluginDiagnostic[] = [];
  try { await manager.resolve(async (source) => { diagnostics.push({ type: "warning", source, message: "Package is configured but not installed yet." }); return "skip"; }); }
  catch (error) { diagnostics.push({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
  const packages = manager.listConfiguredPackages().map((pkg): PluginPackageInfo => {
    const scope: PluginScope = pkg.scope === "project" ? "project" : "global";
    const isDisabled = disabledKeys.has(`${scope}\0${pkg.source}`);
    return { source: pkg.source, scope, filtered: pkg.filtered, disabled: isDisabled, installedPath: pkg.installedPath, counts: { extensions: 0, skills: 0, prompts: 0, themes: 0 }, resources: [], status: isDisabled ? "disabled" : pkg.installedPath ? "installed" : "missing" };
  });
  return { packages, totals: { extensions: 0, skills: 0, prompts: 0, themes: 0 }, diagnostics, projectResourcesLoaded: trust.trusted };
}
