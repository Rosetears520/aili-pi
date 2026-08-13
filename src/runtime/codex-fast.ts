import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { SpeedTier } from "./persistent-agents/model-selection.js";

export interface CodexFastEvidence { configured: SpeedTier; applied: boolean; reason: "priority" | "unsupported" | "standard" }

/** Fast is a request tier, never a separate model/provider identity. */
export function applyCodexPriorityPayload(payload: unknown, provider: string | undefined, tier: SpeedTier): { payload: unknown; evidence: CodexFastEvidence } {
  if (tier !== "priority") return { payload, evidence: { configured: tier, applied: false, reason: "standard" } };
  if (provider !== "openai-codex" || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { payload, evidence: { configured: tier, applied: false, reason: "unsupported" } };
  }
  return { payload: { ...(payload as Record<string, unknown>), service_tier: "priority" }, evidence: { configured: tier, applied: true, reason: "priority" } };
}

export function createCodexFastExtension(provider: string | undefined, tier: SpeedTier = "standard", onEvidence?: (evidence: CodexFastEvidence) => void): ExtensionFactory {
  return (pi) => {
    pi.on("before_provider_request", (event) => {
      const result = applyCodexPriorityPayload(event.payload, provider, tier);
      onEvidence?.(result.evidence);
      return result.evidence.applied ? result.payload : undefined;
    });
  };
}
