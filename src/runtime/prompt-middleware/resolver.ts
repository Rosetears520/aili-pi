import { createHash } from "node:crypto";
import type { ModifierResolutionContext, PromptModifierDefinition, ResolvedPromptModifiers, RuntimePolicyPatch } from "./types.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function resolvePromptModifiers(definitions: readonly PromptModifierDefinition[], selectedIds: readonly string[], context: ModifierResolutionContext): ResolvedPromptModifiers {
  const byId = new Map<string, PromptModifierDefinition>();
  for (const definition of definitions) {
    validateDefinition(definition);
    if (byId.has(definition.id)) throw new Error(`duplicate prompt modifier id: ${definition.id}`);
    byId.set(definition.id, freezeDefinition(definition));
  }
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error("prompt modifier selection contains duplicates");
  const selected = selectedIds.map((id) => {
    const definition = byId.get(id);
    if (!definition) throw new Error(`unknown prompt modifier: ${id}`);
    return definition;
  });
  const selectedSet = new Set(selectedIds);
  const capabilities = new Set(context.capabilities ?? []);
  if (context.surface === "subagent" && context.allowedIds === undefined) throw new Error("subagent prompt modifiers require an explicit role allowlist");
  const allowed = context.allowedIds ? new Set(context.allowedIds) : undefined;
  for (const definition of selected) {
    if (allowed && !allowed.has(definition.id)) throw new Error(`prompt modifier is not allowed for this role: ${definition.id}`);
    const inScope = definition.scopes.includes(context.surface)
      || (context.role !== undefined && definition.scopes.includes(`role:${context.role}`));
    if (!inScope) throw new Error(`prompt modifier scope mismatch: ${definition.id}`);
    for (const required of definition.requires) if (!selectedSet.has(required)) throw new Error(`prompt modifier ${definition.id} requires ${required}`);
    for (const conflict of definition.conflicts) if (selectedSet.has(conflict)) throw new Error(`prompt modifier conflict: ${definition.id} vs ${conflict}`);
    for (const capability of definition.runtimePolicyPatch?.requireCapabilities ?? []) if (!capabilities.has(capability)) throw new Error(`prompt modifier ${definition.id} requires capability ${capability}`);
  }
  const ordered = [...selected].sort((a, b) => a.placement.localeCompare(b.placement) || a.order - b.order || a.id.localeCompare(b.id));
  const denyTools = [...new Set(ordered.flatMap((item) => [...(item.runtimePolicyPatch?.denyTools ?? [])]))].sort();
  const requireCapabilities = [...new Set(ordered.flatMap((item) => [...(item.runtimePolicyPatch?.requireCapabilities ?? [])]))].sort();
  const policyPatch: RuntimePolicyPatch = {
    ...(denyTools.length ? { denyTools } : {}),
    ...(requireCapabilities.length ? { requireCapabilities } : {}),
    ...(ordered.some((item) => item.runtimePolicyPatch?.forceReadOnly === true) ? { forceReadOnly: true } : {}),
  };
  return Object.freeze({ ordered: Object.freeze(ordered), policyPatch: Object.freeze(policyPatch), provenance: Object.freeze(ordered.map(({ id, hash, sourcePath, placement, order }) => Object.freeze({ id, hash, sourcePath, placement, order }))) });
}

function validateDefinition(value: PromptModifierDefinition): void {
  if (!SAFE_ID.test(value.id) || !value.name.trim() || !value.body.trim() || !/^[a-f0-9]{64}$/.test(value.hash)
    || createHash("sha256").update(value.body).digest("hex") !== value.hash) throw new Error("invalid prompt modifier definition");
  if (value.placement !== "prepend" && value.placement !== "append") throw new Error("invalid prompt modifier placement");
  if (!Number.isFinite(value.order) || !Number.isSafeInteger(value.order)) throw new Error("invalid prompt modifier order");
  if (!value.scopes.length || value.scopes.some((scope) => scope !== "main" && scope !== "subagent" && !scope.startsWith("role:"))) throw new Error("invalid prompt modifier scope");
}

function freezeDefinition(value: PromptModifierDefinition): PromptModifierDefinition {
  const patch = value.runtimePolicyPatch ? Object.freeze({
    ...(value.runtimePolicyPatch.denyTools ? { denyTools: Object.freeze([...value.runtimePolicyPatch.denyTools]) } : {}),
    ...(value.runtimePolicyPatch.requireCapabilities ? { requireCapabilities: Object.freeze([...value.runtimePolicyPatch.requireCapabilities]) } : {}),
    ...(value.runtimePolicyPatch.forceReadOnly ? { forceReadOnly: true } : {}),
  }) : undefined;
  return Object.freeze({ ...value, scopes: Object.freeze([...value.scopes]), requires: Object.freeze([...value.requires]), conflicts: Object.freeze([...value.conflicts]), ...(patch ? { runtimePolicyPatch: patch } : {}) });
}
