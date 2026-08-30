import { estimateTokens, hashParts, hasSensitiveContent, type ObservationBatch, type SourceEnvelope, type SourceRole } from "./contracts.js";

export interface SourceCaptureInput {
  id: string;
  entryId: string;
  sessionId: string;
  agentId: string;
  branchId: string;
  sourceProject: string;
  role: SourceRole;
  text: string;
  createdAt: string;
  origin?: "foreground" | "memory-internal" | "provider-retry" | "raw-log";
}

export type CaptureResult = { accepted: true; envelope: SourceEnvelope } | { accepted: false; reason: string };

/** Bounded, in-process source owner. Coverage is committed only after extraction settles. */
export class BoundedSourceEnvelopeStore {
  private readonly branches = new Map<string, SourceEnvelope[]>();
  private readonly covered = new Map<string, Set<string>>();
  private readonly active = new Map<string, ObservationBatch>();

  constructor(private readonly maximumEntries = 256, private readonly maximumTextChars = 8_192) {
    if (!Number.isSafeInteger(maximumEntries) || maximumEntries < 1 || !Number.isSafeInteger(maximumTextChars) || maximumTextChars < 32) throw new Error("source envelope bounds are invalid");
  }

  capture(input: SourceCaptureInput): CaptureResult {
    if (input.origin && input.origin !== "foreground") return { accepted: false, reason: `source-${input.origin}-excluded` };
    if (!input.id || !input.entryId || !input.sessionId || !input.agentId || !input.branchId || !input.sourceProject || !input.text.trim() || Number.isNaN(Date.parse(input.createdAt))) return { accepted: false, reason: "source-invalid" };
    if (input.role === "tool-outcome" && (/^\s*(?:debug|trace|stdout|stderr|progress)\b/i.test(input.text) || input.text.length > this.maximumTextChars)) return { accepted: false, reason: "source-raw-tool-output-excluded" };
    if (hasSensitiveContent(input.text)) return { accepted: false, reason: "source-sensitive-excluded" };
    const text = input.text.slice(0, this.maximumTextChars).trim();
    const list = this.branches.get(input.branchId) ?? [];
    const existing = list.find((item) => item.entryId === input.entryId);
    if (existing) return existing.text === text ? { accepted: true, envelope: existing } : { accepted: false, reason: "source-entry-conflict" };
    if (list.length >= this.maximumEntries && !this.evictCovered(list, input.branchId)) return { accepted: false, reason: "source-capacity-reached-unobserved-preserved" };
    const sourceProject = opaqueProjectLabel(input.sourceProject);
    const envelope = Object.freeze({ schemaVersion: 1 as const, id: input.id, entryId: input.entryId, sessionId: input.sessionId, agentId: input.agentId, branchId: input.branchId, sourceProject, role: input.role, text, estimatedTokens: estimateTokens(text), createdAt: input.createdAt });
    list.push(envelope); this.branches.set(input.branchId, list);
    return { accepted: true, envelope };
  }

  unobservedTokens(branchId: string): number { return this.eligible(branchId).reduce((total, item) => total + item.estimatedTokens, 0); }

  cutBatch(branchId: string, compactedEntries?: string | readonly string[]): ObservationBatch | undefined {
    const current = this.active.get(branchId);
    if (current) return current;
    let sources = this.eligible(branchId);
    if (typeof compactedEntries === "string") {
      const cutoff = sources.findIndex((item) => item.entryId === compactedEntries);
      if (cutoff < 0) return undefined;
      sources = sources.slice(0, cutoff + 1);
    } else if (compactedEntries) {
      const eligibleByEntry = new Map(sources.map((source) => [source.entryId, source]));
      sources = compactedEntries.flatMap((entryId) => { const source = eligibleByEntry.get(entryId); return source ? [source] : []; });
    }
    if (!sources.length) return undefined;
    const first = sources[0]!; const last = sources.at(-1)!;
    const contentHash = hashParts(...sources.map((item) => `${item.entryId}:${item.id}:${item.text}`));
    const cutoff = Object.freeze({ schemaVersion: 1 as const, sessionId: first.sessionId, branchId, fromEntryId: first.entryId, coversUpToId: last.entryId, sourceCount: sources.length, estimatedTokens: sources.reduce((sum, item) => sum + item.estimatedTokens, 0), contentHash });
    const batch = Object.freeze({ schemaVersion: 1 as const, id: hashParts(branchId, first.entryId, last.entryId, contentHash), cutoff, sources: Object.freeze([...sources]) });
    this.active.set(branchId, batch);
    return batch;
  }

  commitCoverage(batchId: string): boolean {
    const found = [...this.active.entries()].find(([, batch]) => batch.id === batchId);
    if (!found) return false;
    const [branchId, batch] = found; const set = this.covered.get(branchId) ?? new Set<string>();
    batch.sources.forEach((item) => set.add(item.entryId)); this.covered.set(branchId, set); this.active.delete(branchId);
    return true;
  }

  releaseBatch(batchId: string): boolean {
    const found = [...this.active.entries()].find(([, batch]) => batch.id === batchId);
    if (!found) return false;
    this.active.delete(found[0]); return true;
  }

  clear(): void { this.branches.clear(); this.covered.clear(); this.active.clear(); }

  private eligible(branchId: string): SourceEnvelope[] {
    const covered = this.covered.get(branchId) ?? new Set<string>();
    return (this.branches.get(branchId) ?? []).filter((item) => !covered.has(item.entryId));
  }

  private evictCovered(list: SourceEnvelope[], branchId: string): boolean {
    const covered = this.covered.get(branchId);
    if (!covered) return false;
    const activeIds = new Set(this.active.get(branchId)?.sources.map((item) => item.entryId) ?? []);
    const index = list.findIndex((item) => covered.has(item.entryId) && !activeIds.has(item.entryId));
    if (index < 0) return false;
    const [removed] = list.splice(index, 1);
    if (removed) covered.delete(removed.entryId);
    return true;
  }
}

function opaqueProjectLabel(value: string): string {
  return /^(?:\/|[A-Za-z]:[\\/])/.test(value) ? `project-${hashParts(value).slice(0, 24)}` : value;
}
