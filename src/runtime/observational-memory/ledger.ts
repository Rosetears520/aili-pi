import type { AtomicObservation } from "./types.js";

export class ObservationLedger {
  private readonly byId = new Map<string, AtomicObservation>();
  private readonly byEvent = new Map<string, string>();
  constructor(private readonly maximum = 1_024) { if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error("observation retention bound is invalid"); }

  append(observation: AtomicObservation): AtomicObservation {
    validate(observation);
    const existingId = this.byEvent.get(observation.eventId);
    if (existingId) {
      const existing = this.byId.get(existingId)!;
      if (JSON.stringify(existing) !== JSON.stringify(observation)) throw new Error(`observation event conflict: ${observation.eventId}`);
      return existing;
    }
    if (this.byId.has(observation.id)) throw new Error(`duplicate observation id: ${observation.id}`);
    if (observation.parentObservationId && !this.byId.has(observation.parentObservationId)) throw new Error("observation parent is unknown");
    const frozen = Object.freeze({ ...observation });
    this.byId.set(frozen.id, frozen);
    this.byEvent.set(frozen.eventId, frozen.id);
    while (this.byId.size > this.maximum) {
      const oldest = [...this.byId.values()].sort(order)[0]!;
      this.byId.delete(oldest.id); this.byEvent.delete(oldest.eventId);
    }
    return frozen;
  }

  activeView(branchId: string, headId?: string): readonly AtomicObservation[] {
    const branch = [...this.byId.values()].filter((item) => item.branchId === branchId);
    if (!headId) return Object.freeze(branch.sort(order));
    const active = new Set<string>();
    let cursor: string | undefined = headId;
    while (cursor) {
      const item = this.byId.get(cursor);
      if (!item) break;
      active.add(item.id);
      cursor = item.parentObservationId;
    }
    return Object.freeze([...this.byId.values()].filter((item) => active.has(item.id)).sort(order));
  }

  all(): readonly AtomicObservation[] { return Object.freeze([...this.byId.values()].sort(order)); }
}

function order(a: AtomicObservation, b: AtomicObservation): number { return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id); }
function validate(value: AtomicObservation): void {
  if (value.schemaVersion !== 1 || !value.id || !value.eventId || !value.sessionId || !value.agentId || !value.branchId || !value.summary.trim()) throw new Error("invalid atomic observation");
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 || Number.isNaN(Date.parse(value.createdAt))) throw new Error("invalid observation confidence or timestamp");
  if (value.summary.length > 4_096 || /(?:api[_-]?key|password|private[_-]?key|bearer\s+)/i.test(value.summary)) throw new Error("observation contains forbidden or oversized content");
}
