import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isCanonicalAiliTaskActive } from "./persistent-agents/task-registration.ts";

type NativeExtension = (pi: ExtensionAPI) => void | Promise<void>;

const PERMISSION_MODE_MODULE = "../vendor/pi-permission-modes/index.ts";

export const NATIVE_INTEGRATIONS = [
  "pi-permission-modes@2.2.0 (AILI multiline-glob adaptation)",
  "pi-quota-status@0.3.0",
  "pi-web-access@0.13.0",
  "pi-cache-optimizer@2.6.18",
] as const;

const INTEGRATION_MODULES = [
  PERMISSION_MODE_MODULE,
  "pi-quota-status",
  "pi-web-access",
  "pi-cache-optimizer/index.ts",
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
    await (loaded.default as NativeExtension)(moduleName === PERMISSION_MODE_MODULE
      ? persistentTaskAwarePermissionApi(pi)
      : pi);
  }
}

/**
 * The persistent task boundary owns its own role, tool, workspace, credential,
 * sandbox, and per-child approval checks. The generic custom-tool prompt is
 * bypassed only while the exact reserved AILI definition is the active Pi
 * winner; same-name collisions and inactive task state retain generic gating.
 */
export function persistentTaskAwarePermissionApi(pi: ExtensionAPI): ExtensionAPI {
  type ExtensionHandler = (event: unknown, context: unknown) => unknown;
  const on = pi.on.bind(pi) as (event: string, handler: ExtensionHandler) => void;
  const wrappedOn = ((event: string, handler: ExtensionHandler) => {
    if (event !== "tool_call") return on(event, handler);
    return on(event, (toolEvent: unknown, context: unknown) => {
      const toolName = toolEvent && typeof toolEvent === "object" && "toolName" in toolEvent
        ? (toolEvent as { toolName?: unknown }).toolName
        : undefined;
      return toolName === "sub" && isCanonicalAiliTaskActive(pi)
        ? undefined
        : handler(toolEvent, context);
    });
  }) as ExtensionAPI["on"];
  return new Proxy(pi, {
    get(target, property) {
      if (property === "on") return wrappedOn;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
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
