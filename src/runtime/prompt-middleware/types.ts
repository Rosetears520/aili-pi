export type PromptPlacement = "prepend" | "append";
export type PromptScope = "main" | "subagent" | `role:${string}`;

export interface RuntimePolicyPatch {
  denyTools?: readonly string[];
  requireCapabilities?: readonly string[];
  forceReadOnly?: boolean;
}

export interface PromptModifierDefinition {
  id: string;
  name: string;
  description?: string;
  placement: PromptPlacement;
  order: number;
  scopes: readonly PromptScope[];
  oneShot: boolean;
  requires: readonly string[];
  conflicts: readonly string[];
  runtimePolicyPatch?: RuntimePolicyPatch;
  body: string;
  sourcePath: string;
  hash: string;
}

export interface ModifierResolutionContext {
  surface: "main" | "subagent";
  role?: string;
  allowedIds?: readonly string[];
  capabilities?: readonly string[];
}

export interface ResolvedPromptModifiers {
  ordered: readonly PromptModifierDefinition[];
  policyPatch: RuntimePolicyPatch;
  provenance: readonly { id: string; hash: string; sourcePath: string; placement: PromptPlacement; order: number }[];
}
