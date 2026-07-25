import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeComponent } from "./contracts.js";
import { registerRoseContext } from "./rose-context.js";
import { registerDoctor } from "./doctor.js";
import { registerPersistentAgentRuntime } from "./persistent-agents/production.js";
import { registerNativeIntegrations } from "./native-integrations.js";
import { registerAiliCompact } from "./aili-compact/index.js";
import { registerGlobalResourceCommand } from "./global-resources.js";

export const runtimeComponents: readonly RuntimeComponent[] = [
  { id: "rose-context", availability: "available", register: registerRoseContext },
  { id: "lifecycle-routing", availability: "available" },
  { id: "task-runtime", availability: "available", register: registerPersistentAgentRuntime },
  { id: "native-integrations", availability: "available", register: registerNativeIntegrations },
  { id: "aili-compact", availability: "available", register: registerAiliCompact },
  { id: "global-resources", availability: "available", register: registerGlobalResourceCommand },
  { id: "capability-registry", availability: "available" },
  { id: "doctor", availability: "available", register: registerDoctor },
  { id: "shortcuts", availability: "available" },
  { id: "status", availability: "available" },
] as const;

export async function registerAiliRuntime(pi: ExtensionAPI): Promise<void> {
  for (const component of runtimeComponents) await component.register?.(pi);
}
