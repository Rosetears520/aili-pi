import { mapMemPalaceScope, type TrustedProjectIdentity } from "../mempalace.js";
import type { MemoryCandidate } from "./types.js";

export interface MemPalacePromotionPlan {
  palace: string;
  wing: string;
  target: string;
  candidate: MemoryCandidate;
  requiresExternalWrite: true;
}

/** Builds an authorized write plan only; the caller still owns the exact MCP write operation. */
export async function planMemPalacePromotion(project: TrustedProjectIdentity, agentId: string, candidate: MemoryCandidate, authorized: boolean): Promise<MemPalacePromotionPlan> {
  if (!authorized) throw new Error("MemPalace durable write requires exact operation authority");
  const mapping = await mapMemPalaceScope(project, agentId);
  return Object.freeze({ palace: mapping.palace, wing: mapping.wing, target: candidate.scope === "shared" ? mapping.shared : mapping.diary, candidate, requiresExternalWrite: true });
}
