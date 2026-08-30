import { canonicalCandidateFingerprint, expectedApplicability, hasSensitiveContent, type AutomaticMemoryCandidate, type MemoryApplicability, type MemoryKind, type ObservationBatch } from "./contracts.js";

export interface ManagedMemoryObserver {
  /** Managed-internal extraction only. Implementations receive no MemPalace port or public Agent surface. */
  extract(batch: ObservationBatch): Promise<unknown>;
}

export interface ObserverExtractionResult {
  accepted: readonly AutomaticMemoryCandidate[];
  rejected: readonly { index: number; reason: string }[];
}

export class HybridObserverExtractor {
  constructor(private readonly observer: ManagedMemoryObserver, private readonly maximumCandidates = 32, private readonly maximumContentChars = 1_024) {
    if (!Number.isSafeInteger(maximumCandidates) || maximumCandidates < 1 || !Number.isSafeInteger(maximumContentChars) || maximumContentChars < 32) throw new Error("observer bounds are invalid");
  }

  async extract(batch: ObservationBatch): Promise<ObserverExtractionResult> {
    validateBatch(batch);
    const raw = await this.observer.extract(batch);
    if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.candidates) || raw.candidates.length > this.maximumCandidates) throw new Error("observer returned an incompatible or oversized schema");
    const accepted: AutomaticMemoryCandidate[] = []; const rejected: Array<{ index: number; reason: string }> = [];
    raw.candidates.forEach((value, index) => {
      const parsed = this.validateCandidate(value, batch);
      if (typeof parsed === "string") rejected.push(Object.freeze({ index, reason: parsed })); else accepted.push(parsed);
    });
    return Object.freeze({ accepted: Object.freeze(accepted), rejected: Object.freeze(rejected) });
  }

  private validateCandidate(value: unknown, batch: ObservationBatch): AutomaticMemoryCandidate | string {
    if (!isRecord(value) || value.schemaVersion !== 1 || !nonEmpty(value.id, 256) || !isKind(value.kind) || !isApplicability(value.applicability) || !nonEmpty(value.content, this.maximumContentChars) || typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0.7 || Number(value.confidence) > 1 || !["explicit", "accepted", "verified"].includes(String(value.support)) || !Array.isArray(value.sourceIds) || value.sourceIds.length < 1 || value.sourceIds.length > 32 || !value.sourceIds.every((id) => typeof id === "string") || !nonEmpty(value.sourceProject, 512)) return "candidate-schema-invalid";
    if (expectedApplicability(value.kind) !== value.applicability) return "candidate-kind-scope-invalid";
    const sourceIds = value.sourceIds as string[];
    const sources = batch.sources.filter((source) => sourceIds.includes(source.id));
    if (new Set(sourceIds).size !== sourceIds.length || sources.length !== sourceIds.length || sources.some((source) => source.sourceProject !== value.sourceProject)) return "candidate-source-unsupported";
    if (hasSensitiveContent(value.content)) return "candidate-sensitive";
    if (value.expiresAt !== undefined && (typeof value.expiresAt !== "string" || Number.isNaN(Date.parse(value.expiresAt)))) return "candidate-expiry-invalid";
    if (value.supersedes !== undefined && !nonEmpty(value.supersedes, 256)) return "candidate-supersedes-invalid";
    const content = normalizeEvidenceQuote(value.content);
    if (hasSensitiveContent(content)) return "candidate-sensitive";
    if (!supportMatches(value.kind, value.support as string) || !evidenceMatches(value.kind, sources, content) || isOrdinaryChatter(content)) return "candidate-unsupported-inference";
    const sourceEntryIds = Object.freeze(sourceIds.map((id) => sources.find((source) => source.id === id)!.entryId));
    const base = { schemaVersion: 1 as const, id: value.id, kind: value.kind, applicability: value.applicability, content, confidence: Number(value.confidence), support: value.support as "explicit" | "accepted" | "verified", sourceIds: Object.freeze([...sourceIds]), sourceEntryIds, sourceProject: value.sourceProject, sourceCutoff: batch.cutoff, ...(value.expiresAt ? { expiresAt: value.expiresAt as string } : {}), ...(value.supersedes ? { supersedes: value.supersedes as string } : {}) };
    return Object.freeze({ ...base, fingerprint: canonicalCandidateFingerprint(base) });
  }
}

function validateBatch(batch: ObservationBatch): void {
  if (batch.schemaVersion !== 1 || !batch.id || !batch.sources.length || batch.sources.length !== batch.cutoff.sourceCount || batch.sources.some((item) => item.schemaVersion !== 1 || item.branchId !== batch.cutoff.branchId || hasSensitiveContent(item.text))) throw new Error("invalid or unsafe observation batch");
  if (batch.sources[0]?.entryId !== batch.cutoff.fromEntryId || batch.sources.at(-1)?.entryId !== batch.cutoff.coversUpToId) throw new Error("observation batch cutoff mismatch");
}
function supportMatches(kind: MemoryKind, support: string): boolean { return kind === "preference" ? support === "explicit" : kind === "reusable-solution" ? support === "verified" : kind === "project-decision" ? support === "accepted" : support === "explicit" || support === "accepted"; }
function evidenceMatches(kind: MemoryKind, sources: ObservationBatch["sources"], quote: string): boolean {
  const users = sources.filter((source) => source.role === "user");
  const quotedBy = (eligible: ObservationBatch["sources"]): boolean => eligible.some((source) => normalizeEvidenceQuote(source.text).includes(quote));
  if (kind === "preference") {
    const eligible = users.filter((source) => /\b(?:i\s+(?:explicitly\s+)?(?:prefer|always want)|please always|my preference is)\b/i.test(source.text) || /(?:我的偏好是|我(?:明确)?(?:更)?(?:偏好|喜欢)|请(?:始终|总是))/.test(source.text));
    return quotedBy(eligible);
  }
  if (kind === "project-decision") {
    const approvals = users.filter((source) => /\b(?:i|we)\s+(?:accept|approve|choose|decide)|\b(?:accepted|approved|confirmed)\b/i.test(source.text) || /(?:我|我们)(?:接受|批准|确认|选择|决定)|(?:接受|批准|确认)(?:这个|该)?(?:决定|方案)/.test(source.text));
    if (approvals.length === 0) return false;
    // The accepted decision may be stated in an assistant proposal followed by
    // a short user confirmation. Both sources must be explicitly cited.
    return quotedBy([...approvals, ...sources.filter((source) => source.role === "assistant")]);
  }
  if (kind === "reusable-solution") {
    const assistants = sources.filter((source) => source.role === "assistant");
    return quotedBy(assistants) && sources.some((source) => source.role === "tool-outcome" && isVerificationReceipt(source.text));
  }
  const eligible = users.filter((source) => /\b(?:recovery point|resume from|checkpoint|continue from|accept|approved?)\b/i.test(source.text) || /(?:恢复点|从.{1,64}(?:继续|恢复)|检查点|接受|批准|确认)/.test(source.text));
  return quotedBy(eligible);
}
function normalizeEvidenceQuote(value: string): string { return value.normalize("NFKC").replace(/\s+/g, " ").trim(); }
function isVerificationReceipt(text: string): boolean {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    return value.schema === "aili.verification-receipt/v1" && value.success === true && typeof value.tool === "string" && /^[a-f0-9]{64}$/.test(String(value.outputHash)) && Object.keys(value).every((key) => ["schema", "tool", "success", "outputHash"].includes(key));
  } catch { return false; }
}
function isOrdinaryChatter(content: string): boolean { return /^(?:hello|hi|thanks|thank you|okay|ok|sounds good)[.!\s]*$/i.test(content.trim()); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmpty(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= maximum; }
function isKind(value: unknown): value is MemoryKind { return ["preference", "reusable-solution", "project-decision", "recovery-point"].includes(String(value)); }
function isApplicability(value: unknown): value is MemoryApplicability { return ["global-preference", "reusable-solution", "project-decision", "recovery-point"].includes(String(value)); }
