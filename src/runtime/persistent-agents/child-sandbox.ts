import type { BashOperations } from "@earendil-works/pi-coding-agent";
import type { SandboxProfile } from "pi-permission-modes/src/schema.ts";

export interface PersistentAgentSandboxProvider {
  currentProfile(): SandboxProfile;
  operations(options: { readOnly: boolean }): BashOperations | null;
  diagnostic(): string | undefined;
}

export interface PersistentAgentSandboxResolution {
  available: boolean;
  operations?: BashOperations;
  reason?: string;
}

let activeProvider: PersistentAgentSandboxProvider | undefined;

function profileKey(profile: SandboxProfile): string {
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
  });
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

export function resolvePersistentAgentSandbox(profile: SandboxProfile): PersistentAgentSandboxResolution {
  if (!profile.enabled) return { available: false, reason: "active mode does not require a sandbox" };
  const provider = activeProvider;
  if (!provider) return { available: false, reason: "process-owned permission sandbox provider is unavailable" };
  if (profileKey(provider.currentProfile()) !== profileKey(profile)) {
    return { available: false, reason: "child and process-owned sandbox profiles differ" };
  }
  const operations = provider.operations({ readOnly: !profile.writable });
  if (!operations) return { available: false, reason: provider.diagnostic() ?? "process-owned permission sandbox is not ready" };
  return { available: true, operations };
}
