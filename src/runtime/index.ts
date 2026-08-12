import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeComponent } from "./contracts.js";
import { registerRoseContext, type LifecycleAgentGuidanceProvider } from "./rose-context.js";
import { registerDoctor } from "./doctor.js";
import { registerPersistentAgentRuntime } from "./persistent-agents/production.js";
import { registerNativeIntegrations } from "./native-integrations.js";
import { loadWorkflowRuntimeBundle } from "./workflow-bundle/index.js";
import { createAiliMcpExtension } from "./mcp.js";
import { createProviderRoutedContextExtension } from "./context-runtime.js";
import { createExplainableRetryExtension } from "./provider-retry.js";

export const runtimeComponents: readonly RuntimeComponent[] = [
  { id: "rose-context", availability: "available", register: registerRoseContext },
  { id: "lifecycle-routing", availability: "available" },
  { id: "task-runtime", availability: "available", register: registerPersistentAgentRuntime },
  { id: "mcp-runtime", availability: "available", register: createAiliMcpExtension() },
  { id: "context-runtime", availability: "available", register: createProviderRoutedContextExtension() },
  { id: "provider-retry", availability: "available", register: createExplainableRetryExtension() },
  { id: "native-integrations", availability: "available", register: registerNativeIntegrations },
  { id: "capability-registry", availability: "available" },
  { id: "doctor", availability: "available", register: registerDoctor },
  { id: "shortcuts", availability: "available" },
  { id: "status", availability: "available" },
] as const;

export interface AiliRuntimeOptions {
  lifecycleAgentGuidanceProvider?: LifecycleAgentGuidanceProvider;
}

export async function registerAiliRuntime(pi: ExtensionAPI, options: AiliRuntimeOptions = {}): Promise<void> {
  const workflowBundle = await loadWorkflowRuntimeBundle();
  for (const component of runtimeComponents) {
    if (component.id === "rose-context") {
      registerRoseContext(pi, {
        lifecycleAgentGuidanceProvider: options.lifecycleAgentGuidanceProvider,
        workflowSystem: workflowBundle.system,
      });
      continue;
    }
    await component.register?.(pi);
  }
}
