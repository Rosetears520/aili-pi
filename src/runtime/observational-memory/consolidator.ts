import { createHash } from "node:crypto";
import type { AtomicObservation, MemoryCandidate } from "./types.js";

export function consolidateObservations(observations: readonly AtomicObservation[], maximum = 32): readonly MemoryCandidate[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error("consolidation bound is invalid");
  const ordered = [...observations].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return Object.freeze(ordered.slice(-maximum).map((item) => Object.freeze({
    observationId: item.id,
    scope: "diary" as const,
    summary: item.summary,
    confidence: item.confidence,
    sourceEventIds: Object.freeze([item.eventId]),
    consolidationHash: createHash("sha256").update(item.id).update("\0").update(item.summary).digest("hex"),
  })));
}
