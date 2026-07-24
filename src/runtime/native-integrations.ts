import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type NativeExtension = (pi: ExtensionAPI) => void | Promise<void>;

export const NATIVE_INTEGRATIONS = [
  "pi-permission-modes@2.2.0 (AILI multiline-glob adaptation)",
  "pi-quota-status@0.3.0",
  "pi-web-access@0.13.0",
  "pi-cache-optimizer@2.6.18",
  "pi-markdown-preview@0.10.1",
  "@narumitw/pi-lsp@0.25.0",
] as const;

const INTEGRATION_MODULES = [
  "../vendor/pi-permission-modes/index.ts",
  "pi-quota-status",
  "pi-web-access",
  "pi-cache-optimizer/index.ts",
  "pi-markdown-preview",
  "@narumitw/pi-lsp/src/pi-lsp.ts",
] as const;

/**
 * Initialise pinned native integrations through AILI's single package entry.
 * Permission modes uses the revision-bound adapted entry that changes only
 * shared multiline glob matching; the remaining integrations stay upstream-owned.
 */
export async function registerNativeIntegrations(pi: ExtensionAPI): Promise<void> {
  for (const moduleName of INTEGRATION_MODULES) {
    const loaded = await import(moduleName) as { default?: unknown };
    if (typeof loaded.default !== "function") {
      throw new Error(`${moduleName} does not expose an Extension default export`);
    }
    await (loaded.default as NativeExtension)(pi);
  }
}

export function nativeIntegrationDiagnostics(commands: ReturnType<ExtensionAPI["getCommands"]>): {
  status: "PASS" | "ERROR";
  evidence: string;
} {
  const names = commands.map((command) => command.name);
  const missing = ["perm"].filter((name) => !names.includes(name));
  const legacy = names.filter((name) => name === "aili-mode");
  if (missing.length > 0 || legacy.length > 0) {
    return {
      status: "ERROR",
      evidence: `missing=${missing.join(",") || "none"}; legacy=${legacy.join(",") || "none"}`,
    };
  }
  return { status: "PASS", evidence: NATIVE_INTEGRATIONS.join(",") };
}
