import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type NativeExtension = (pi: ExtensionAPI) => void | Promise<void>;

export const NATIVE_INTEGRATIONS = [
  "pi-permission-modes@2.2.0",
  "pi-quota-status@0.3.0",
  "pi-web-access@0.13.0",
] as const;

/**
 * Initialise the pinned upstream extensions through AILI's single package entry.
 * They remain upstream-owned implementations; this module adds no substitute
 * command, tool, permission, or provider behavior.
 */
export async function registerNativeIntegrations(pi: ExtensionAPI): Promise<void> {
  for (const moduleName of [
    "pi-permission-modes/src/index.ts",
    "pi-quota-status",
    "pi-web-access",
  ]) {
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
