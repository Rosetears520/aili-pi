import { createHash } from "node:crypto";
import type { PromptModifierDefinition } from "./types.js";

export interface PromptAssembly {
  dynamicMessage: string;
  stablePrefixHash: string;
  effectiveHash: string;
}

export function assemblePromptModifiers(stablePrefix: string, userMessage: string, ordered: readonly PromptModifierDefinition[], memoryRecall = "", runtimeDelta = ""): PromptAssembly {
  const prepend = ordered.filter((item) => item.placement === "prepend").map((item) => item.body.trim());
  const append = ordered.filter((item) => item.placement === "append").map((item) => item.body.trim());
  const dynamicMessage = [memoryRecall.trim(), ...prepend, userMessage.trim(), ...append, runtimeDelta.trim()].filter(Boolean).join("\n\n");
  return Object.freeze({
    dynamicMessage,
    stablePrefixHash: createHash("sha256").update(stablePrefix).digest("hex"),
    effectiveHash: createHash("sha256").update(stablePrefix).update("\0").update(dynamicMessage).digest("hex"),
  });
}
