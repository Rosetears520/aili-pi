import type { RuntimePolicyPatch } from "./types.js";

const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls", "web_search", "fetch_content", "search_context", "acp_status"]);

export function applyPromptPolicyPatch(baseTools: readonly string[], patch: RuntimePolicyPatch): readonly string[] {
  const denied = new Set(patch.denyTools ?? []);
  return Object.freeze(baseTools.filter((tool) => !denied.has(tool) && !(patch.forceReadOnly && !READ_ONLY_TOOLS.has(tool))));
}

export function promptPolicyAllowsTool(toolName: string, patch: RuntimePolicyPatch): boolean {
  return !(patch.denyTools?.includes(toolName)) && !(patch.forceReadOnly && !READ_ONLY_TOOLS.has(toolName));
}

export function assertPolicyPatchMonotonic(baseTools: readonly string[], effectiveTools: readonly string[]): void {
  const base = new Set(baseTools);
  if (effectiveTools.some((tool) => !base.has(tool))) throw new Error("prompt policy patch attempted to widen tools");
}
