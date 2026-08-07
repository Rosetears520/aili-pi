import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { isAbsolute } from "node:path";
import {
  profileToConfig,
  readOnlyOverride,
  type SandboxConfig,
} from "pi-permission-modes/src/config-load.ts";
import type { SandboxProfile } from "pi-permission-modes/src/schema.ts";

export interface PersistentAgentSandboxProvider {
  currentProfile(): SandboxProfile;
  operations(options: { readOnly: boolean; denyWrite: readonly string[] }): BashOperations | null;
  diagnostic(): string | undefined;
}

export interface PersistentAgentSandboxResolution {
  available: boolean;
  operations?: BashOperations;
  reason?: string;
}

export function formalChildBashHardDenied(
  denyWrite: readonly string[],
  resolution: PersistentAgentSandboxResolution,
): boolean {
  return denyWrite.length > 0
    && (!validFormalDenyWrite(denyWrite) || !resolution.available || !resolution.operations);
}

export function formalChildHardDeniedTools(
  denyWrite: readonly string[],
  resolution: PersistentAgentSandboxResolution,
): readonly ["bash"] | readonly [] {
  return formalChildBashHardDenied(denyWrite, resolution) ? ["bash"] : [];
}

let activeProvider: PersistentAgentSandboxProvider | undefined;

function profileKey(profile: SandboxProfile, exactFormalProfile: boolean): string {
  return JSON.stringify({
    enabled: profile.enabled,
    writable: profile.writable,
    allowWrite: profile.allowWrite ?? [],
    denyWrite: profile.denyWrite ?? [],
    denyRead: profile.denyRead ?? [],
    network: {
      allowedDomains: profile.network?.allowedDomains ?? [],
      deniedDomains: profile.network?.deniedDomains ?? [],
    },
    ...(exactFormalProfile ? { askOnBlockedHost: profile.askOnBlockedHost } : {}),
  });
}

export function composePersistentAgentSandboxConfig(
  profile: SandboxProfile,
  readOnly: boolean,
  denyWrite: readonly string[],
): Partial<SandboxConfig> {
  const base = profileToConfig(profile);
  const selected = readOnly ? readOnlyOverride(base) : base;
  return {
    ...selected,
    network: selected.network ? {
      allowedDomains: [...(selected.network.allowedDomains ?? [])],
      deniedDomains: [...(selected.network.deniedDomains ?? [])],
    } : undefined,
    filesystem: {
      ...selected.filesystem,
      denyRead: [...(selected.filesystem?.denyRead ?? [])],
      allowWrite: [...(selected.filesystem?.allowWrite ?? [])],
      denyWrite: [...new Set([...(selected.filesystem?.denyWrite ?? []), ...denyWrite])],
    },
  };
}

function validFormalDenyWrite(paths: readonly string[]): boolean {
  return paths.length === 2
    && new Set(paths).size === 2
    && paths.every((path) => path.length > 0 && path === path.trim() && isAbsolute(path) && !/[\r\n\0]/.test(path));
}

/**
 * Bind persistent children to the one process-owned permission-mode sandbox.
 * The provider remains the lifecycle owner; child sessions never initialize,
 * reconfigure, or reset the process-global sandbox runtime themselves.
 */
export function installPersistentAgentSandboxProvider(provider: PersistentAgentSandboxProvider): () => void {
  const previous = activeProvider;
  activeProvider = provider;
  return () => {
    if (activeProvider === provider) activeProvider = previous;
  };
}

export function resolvePersistentAgentSandbox(
  profile: SandboxProfile,
  denyWrite: readonly string[] = [],
): PersistentAgentSandboxResolution {
  const formal = denyWrite.length > 0;
  if (formal && !validFormalDenyWrite(denyWrite)) {
    return { available: false, reason: "formal child sandbox requires exactly two distinct absolute denyWrite paths" };
  }
  if (!profile.enabled) return { available: false, reason: "active mode does not require a sandbox" };
  const provider = activeProvider;
  if (!provider) return { available: false, reason: "process-owned permission sandbox provider is unavailable" };
  try {
    if (profileKey(provider.currentProfile(), formal) !== profileKey(profile, formal)) {
      return { available: false, reason: "child and process-owned sandbox profiles differ" };
    }
    const operations = provider.operations({ readOnly: !profile.writable, denyWrite });
    if (!operations) return { available: false, reason: provider.diagnostic() ?? "process-owned permission sandbox is not ready" };
    return { available: true, operations };
  } catch (error) {
    if (!formal) throw error;
    return {
      available: false,
      reason: `formal child sandbox operations are unavailable (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}
