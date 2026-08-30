import type { ResolvedPromptModifiers } from "./types.js";

export interface PromptModifierProvenanceRecord {
  turn: number;
  applied: ResolvedPromptModifiers["provenance"];
  policyPatch: ResolvedPromptModifiers["policyPatch"];
  rejected?: { ids: readonly string[]; reason: string };
}

export class PromptModifierProvenanceStore {
  private readonly records: PromptModifierProvenanceRecord[] = [];
  record(turn: number, resolution: ResolvedPromptModifiers): PromptModifierProvenanceRecord {
    const record = Object.freeze({ turn, applied: resolution.provenance, policyPatch: resolution.policyPatch });
    this.records.push(record);
    while (this.records.length > 128) this.records.shift();
    return record;
  }
  recordRejected(turn: number, ids: readonly string[], reason: string): PromptModifierProvenanceRecord {
    const record = Object.freeze({ turn, applied: Object.freeze([]), policyPatch: Object.freeze({}), rejected: Object.freeze({ ids: Object.freeze([...ids]), reason: reason.replace(/[\r\n\0]/g, " ").slice(0, 240) }) });
    this.records.push(record); while (this.records.length > 128) this.records.shift(); return record;
  }
  list(): readonly PromptModifierProvenanceRecord[] { return Object.freeze([...this.records]); }
  clear(): void { this.records.length = 0; }
}
