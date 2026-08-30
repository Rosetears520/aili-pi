import { assertSharedPromotion } from "../mempalace.js";
import { canonicalCandidateFingerprint, hasSensitiveContent, validateReceipt, type AutomaticMemoryCandidate, type PromotionReceipt } from "./contracts.js";
import type { AtomicObservation, MemoryCandidate } from "./types.js";

export interface PromotionDecision { accepted: boolean; reason: string; candidate?: MemoryCandidate; }
export type ProviderSettlement =
  | { status: "success"; receipt: unknown }
  | { status: "duplicate"; receipt: unknown }
  | { status: "conflict"; receipt: unknown }
  | { status: "rejected"; receipt: unknown }
  | { status: "ambiguous" | "retryable-failure"; detail?: string };
export type CandidatePromotionState = "pending" | "reconciliation-required" | "committed" | "duplicate" | "conflict" | "rejected";

interface StateRecord { candidate: AutomaticMemoryCandidate; state: CandidatePromotionState; attempts: number; receipt?: PromotionReceipt; terminalReason?: string; }

/** Owns candidate references and idempotency. No candidate is committed before a final provider settlement. */
export class PromotionStateController {
  private readonly records = new Map<string, StateRecord>();
  private readonly committedFingerprints = new Map<string, string>();
  private readonly committedIds = new Set<string>();
  constructor(private readonly maximumPending = 128, private readonly maximumAttempts = 3) {
    if (!Number.isSafeInteger(maximumPending) || maximumPending < 1 || !Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) throw new Error("promotion bounds are invalid");
  }

  stage(candidate: AutomaticMemoryCandidate): { accepted: boolean; reason: string; state: CandidatePromotionState } {
    validateCandidate(candidate);
    const existing = this.records.get(candidate.id);
    if (existing) {
      if (existing.candidate.fingerprint !== candidate.fingerprint) throw new Error("candidate id conflict");
      return { accepted: existing.state === "pending" || existing.state === "reconciliation-required", reason: `candidate-${existing.state}`, state: existing.state };
    }
    if (this.committedFingerprints.has(candidate.fingerprint)) return { accepted: false, reason: "candidate-duplicate", state: "duplicate" };
    if ([...this.records.values()].some((item) => item.candidate.fingerprint === candidate.fingerprint && (item.state === "pending" || item.state === "reconciliation-required"))) return { accepted: false, reason: "candidate-coalesced", state: "pending" };
    if (candidate.expiresAt && Date.parse(candidate.expiresAt) <= Date.now()) return { accepted: false, reason: "candidate-expired", state: "rejected" };
    if (candidate.supersedes) {
      const prior = this.records.get(candidate.supersedes);
      if ((!prior || prior.state !== "committed") && !this.committedIds.has(candidate.supersedes)) return { accepted: false, reason: "superseded-candidate-not-committed", state: "rejected" };
    }
    const pending = [...this.records.values()].filter((item) => item.state === "pending" || item.state === "reconciliation-required").length;
    if (pending >= this.maximumPending) return { accepted: false, reason: "promotion-capacity-reached", state: "rejected" };
    this.records.set(candidate.id, { candidate, state: "pending", attempts: 0 });
    return { accepted: true, reason: "candidate-pending-provider", state: "pending" };
  }

  beginAttempt(candidateId: string): { attempt: number; reconcileFirst: boolean } {
    const record = this.require(candidateId);
    if (record.state !== "pending" && record.state !== "reconciliation-required") throw new Error("candidate is already terminal");
    if (record.attempts >= this.maximumAttempts) throw new Error("candidate retry bound reached");
    record.attempts += 1;
    return { attempt: record.attempts, reconcileFirst: record.state === "reconciliation-required" };
  }

  settle(candidateId: string, settlement: ProviderSettlement): CandidatePromotionState {
    const record = this.require(candidateId);
    if (record.state !== "pending" && record.state !== "reconciliation-required") return record.state;
    if (record.attempts < 1) throw new Error("provider attempt was not started");
    if (settlement.status === "ambiguous" || settlement.status === "retryable-failure") {
      record.state = "reconciliation-required";
      return record.state;
    }
    if (!("receipt" in settlement)) throw new Error("provider settlement receipt missing");
    const receipt = validateReceipt(settlement.receipt);
    if (receipt.candidateId !== candidateId || receipt.fingerprint !== record.candidate.fingerprint || receipt.outcome !== settlement.status.replace("success", "committed")) throw new Error("provider settlement receipt mismatch");
    record.receipt = receipt;
    record.state = settlement.status === "success" ? "committed" : settlement.status;
    if (record.state === "committed" || record.state === "duplicate") {
      this.committedFingerprints.set(record.candidate.fingerprint, candidateId);
      if (record.state === "committed") this.committedIds.add(candidateId);
      this.retainHistory();
    }
    return record.state;
  }

  terminalizeRetryExhausted(candidateId: string): Readonly<{ terminalized: boolean; reason: string }> {
    const record = this.require(candidateId);
    if (record.state !== "pending" && record.state !== "reconciliation-required") return Object.freeze({ terminalized: false, reason: "candidate-already-terminal" });
    if (record.attempts < this.maximumAttempts) return Object.freeze({ terminalized: false, reason: "candidate-retry-bound-not-reached" });
    record.state = "rejected";
    record.terminalReason = "candidate-retry-bound-exhausted";
    return Object.freeze({ terminalized: true, reason: record.terminalReason });
  }

  status(candidateId: string): Readonly<{ state: CandidatePromotionState; attempts: number; fingerprint: string; receipt?: PromotionReceipt; reason?: string }> {
    const record = this.require(candidateId);
    return Object.freeze({ state: record.state, attempts: record.attempts, fingerprint: record.candidate.fingerprint, ...(record.receipt ? { receipt: record.receipt } : {}), ...(record.terminalReason ? { reason: record.terminalReason } : {}) });
  }

  pendingCandidates(): readonly AutomaticMemoryCandidate[] {
    return Object.freeze([...this.records.values()].filter((record) => record.state === "pending" || record.state === "reconciliation-required").map((record) => record.candidate));
  }

  releaseExpired(at = Date.now()): number {
    let released = 0;
    for (const [id, record] of this.records) {
      if ((record.state === "pending" || record.state === "reconciliation-required") && record.candidate.expiresAt && Date.parse(record.candidate.expiresAt) <= at) {
        this.records.delete(id); released += 1;
      }
    }
    return released;
  }

  releaseTerminal(): number {
    let released = 0;
    for (const [id, record] of this.records) {
      if (record.state === "pending" || record.state === "reconciliation-required") continue;
      this.records.delete(id); released += 1;
    }
    return released;
  }

  clear(): void { this.records.clear(); this.committedFingerprints.clear(); this.committedIds.clear(); }

  private retainHistory(): void {
    const maximum = this.maximumPending * 4;
    while (this.committedIds.size > maximum) this.committedIds.delete(this.committedIds.values().next().value!);
    while (this.committedFingerprints.size > maximum) this.committedFingerprints.delete(this.committedFingerprints.keys().next().value!);
  }

  private require(id: string): StateRecord { const record = this.records.get(id); if (!record) throw new Error("unknown promotion candidate"); return record; }
}

/** Compatibility façade for the session-only API; authorization creates a candidate but no durable state. */
export class MemoryPromotionController {
  decide(observation: AtomicObservation, scope: "diary" | "shared", authorized: boolean): PromotionDecision {
    if (!observation.summary.trim() || observation.summary.length > 4_096 || hasSensitiveContent(observation.summary)) return { accepted: false, reason: "candidate-sensitive-or-invalid" };
    if (scope === "shared") assertSharedPromotion(authorized);
    if (!authorized) return { accepted: false, reason: "durable-promotion-authority-required" };
    if (observation.confidence < 0.7) return { accepted: false, reason: "candidate-confidence-too-low" };
    return { accepted: true, reason: "candidate-awaiting-provider", candidate: Object.freeze({ observationId: observation.id, scope, summary: observation.summary, confidence: observation.confidence, sourceEventIds: [observation.eventId] }) };
  }
}

function validateCandidate(candidate: AutomaticMemoryCandidate): void {
  if (candidate.schemaVersion !== 1 || !candidate.id || !candidate.content.trim() || candidate.content.length > 1_024 || hasSensitiveContent(candidate.content) || candidate.sourceIds.length < 1 || candidate.sourceIds.length > 32 || !Array.isArray(candidate.sourceEntryIds) || candidate.sourceEntryIds.length !== candidate.sourceIds.length || new Set(candidate.sourceEntryIds).size !== candidate.sourceEntryIds.length || candidate.sourceEntryIds.some((id) => !id || id.length > 256) || candidate.fingerprint !== canonicalCandidateFingerprint(candidate)) throw new Error("invalid promotion candidate");
}
