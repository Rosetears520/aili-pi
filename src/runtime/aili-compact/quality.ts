import { createHash } from "node:crypto";
import { canonicalJson, digest, isRecord } from "./contracts.js";
import { SEMANTIC_SUMMARY_LIMITS } from "./summary-limits.js";

export const QUALITY_INPUT_VERSION = 1 as const;
export const QUALITY_MANIFEST_VERSION = 1 as const;
export const QUALITY_RESULT_VERSION = 1 as const;
export const QUALITY_EVIDENCE_VERSION = 1 as const;
export const QUALITY_EXTRACTOR_VERSION = "aili-quality-extractor-v1" as const;
export const QUALITY_EVALUATOR_VERSION = "aili-quality-evaluator-v1" as const;

export const MAX_QUALITY_FACTS = 256;
export const MAX_QUALITY_CODES = 16;

const MAX_REFS = 256;
const MAX_FACT_REFS = 8;
const MAX_ANCHORS = 8;
const MAX_SUMMARY_UTF16 = SEMANTIC_SUMMARY_LIMITS.hardMaxChars;
const MAX_FACT_TEXT_UTF16 = 16_000;
const MAX_ANCHOR_UTF16 = 512;
const MAX_IDENTIFIER_UTF16 = 256;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ZERO_DIGEST = "0".repeat(64);

const LEGACY_QUALITY_INPUT_KEYS = ["catalogId", "orderedRefs", "sourceDigest", "sourceKind", "summary", "tier", "version"] as const;
const ACTIVE_QUALITY_INPUT_KEYS = ["catalogId", "orderedRefs", "semantics", "sourceDigest", "sourceKind", "summary", "version"] as const;
const FROZEN_SOURCE_KEYS = ["catalogId", "facts", "orderedRefs", "sourceDigest", "sourceKind", "version"] as const;
const FROZEN_FACT_KEYS = ["anchors", "class", "current", "durableRefs", "eligibility", "releaseRelevant", "status", "text"] as const;
const IDENTITY_CONTEXT_KEYS = [
  "agentIds",
  "branchLeafId",
  "canonicalSessionPathDigest",
  "epochId",
  "historyEntryIds",
  "jobIds",
  "messageEntryIds",
  "sessionId",
  "turnEntryIds",
  "version",
] as const;
const MANIFEST_KEYS = ["extractorVersion", "facts", "sourceDigest", "version"] as const;
const MANIFEST_FACT_KEYS = [
  "anchorDigests",
  "class",
  "current",
  "durableRefs",
  "factId",
  "normalizedAnchors",
  "releaseRelevant",
  "sourceFactDigests",
  "status",
  "summarySpanDigest",
  "summarySpanUtf16",
] as const;
const RESULT_KEYS = ["codes", "counts", "evaluatorVersion", "qualityEvidence", "verdict", "version"] as const;
const COUNTS_KEYS = [
  "coveredFacts",
  "coveredHardFacts",
  "coveredOptionalFacts",
  "coveredWarningFacts",
  "hardFacts",
  "missingHardFacts",
  "missingWarningFacts",
  "optionalFacts",
  "scorePermille",
  "totalFacts",
  "warningFacts",
] as const;
const LEGACY_EVIDENCE_KEYS = [
  "catalogId",
  "codes",
  "counts",
  "evaluatorVersion",
  "extractorVersion",
  "facts",
  "manifestDigest",
  "orderedRefs",
  "sourceDigest",
  "sourceKind",
  "tier",
  "verdict",
  "version",
] as const;
const ACTIVE_EVIDENCE_KEYS = [
  "catalogId",
  "codes",
  "counts",
  "evaluatorVersion",
  "extractorVersion",
  "facts",
  "manifestDigest",
  "orderedRefs",
  "semantics",
  "sourceDigest",
  "sourceKind",
  "verdict",
  "version",
] as const;
const EVIDENCE_FACT_KEYS = [
  "anchorDigests",
  "class",
  "covered",
  "durableRefs",
  "factId",
  "requirement",
  "sourceFactDigests",
  "summarySpanDigest",
  "summarySpanUtf16",
] as const;

export type QualityTier = "T1" | "T2" | "T3";
export type QualitySemantics = QualityTier | "active-block";
export type QualitySourceKind = "messages" | "blocks";
export type QualityVerdict = "pass" | "pass-with-warnings" | "reject";
export type QualityRequirement = "hard" | "warning" | "optional";

export type QualityFactClass =
  | "goal-constraint"
  | "decision"
  | "artifact-symbol"
  | "failure-blocker"
  | "verification"
  | "open-work"
  | "protocol-provenance"
  | "resolved-detail";

export type QualityFactStatus = "active" | "failed" | "unverified" | "open" | "resolved" | "passed" | "neutral";
export type QualityFactEligibility = "eligible" | "secret" | "credential" | "binary" | "protected" | "unclassifiable-high-risk";

export type QualityCode =
  | "invalid-input"
  | "source-summary-scope-mismatch"
  | "invalid-frozen-source"
  | "fact-limit-exceeded"
  | "protected-source-ineligible"
  | "unclassifiable-high-risk"
  | "invalid-durable-ref"
  | "malformed-surrogate"
  | "ambiguous-match"
  | "invalid-manifest"
  | "invalid-span"
  | "overlapping-span"
  | "span-digest-mismatch"
  | "anchor-mismatch"
  | "fact-mismatch"
  | "missing-hard-fact"
  | "contradictory-status"
  | "warning-fact-omitted"
  | "extractor-unavailable"
  | "extractor-error"
  | "evaluator-unavailable"
  | "evaluator-error";

const CODE_ORDER: readonly QualityCode[] = [
  "invalid-input",
  "source-summary-scope-mismatch",
  "invalid-frozen-source",
  "fact-limit-exceeded",
  "protected-source-ineligible",
  "unclassifiable-high-risk",
  "invalid-durable-ref",
  "malformed-surrogate",
  "ambiguous-match",
  "invalid-manifest",
  "invalid-span",
  "overlapping-span",
  "span-digest-mismatch",
  "anchor-mismatch",
  "fact-mismatch",
  "missing-hard-fact",
  "contradictory-status",
  "warning-fact-omitted",
  "extractor-unavailable",
  "extractor-error",
  "evaluator-unavailable",
  "evaluator-error",
];

export interface AgentQualityRefV1 {
  kind: "agent";
  sessionId: string;
  agentId: string;
}

export interface JobQualityRefV1 {
  kind: "job";
  sessionId: string;
  jobId: string;
}

export interface TurnQualityRefV1 {
  kind: "turn";
  branchLeafId: string;
  turnEntryId: string;
}

export interface MessageQualityRefV1 {
  kind: "message";
  branchLeafId: string;
  epochId: string;
  entryId: string;
}

export interface HistoryQualityRefV1 {
  kind: "history";
  canonicalSessionPathDigest: string;
  branchLeafId: string;
  entryId: string;
}

export type QualityDurableRefV1 =
  | AgentQualityRefV1
  | JobQualityRefV1
  | TurnQualityRefV1
  | MessageQualityRefV1
  | HistoryQualityRefV1;

export interface QualitySpanUtf16 {
  start: number;
  end: number;
}

interface QualityInputFields {
  version: typeof QUALITY_INPUT_VERSION;
  catalogId: string;
  sourceKind: QualitySourceKind;
  orderedRefs: string[];
  sourceDigest: string;
  summary: string;
}

/** Runtime-owned input assembled only after exact source selection is frozen. */
export type QualityInputV1 = (QualityInputFields & {
  /** Read-only legacy quality identity. */
  tier: QualityTier;
}) | (QualityInputFields & {
  /** Tierless active-block quality identity for every new write. */
  semantics: "active-block";
});

/** A fact extracted from the frozen source. It is never caller or Session input. */
export interface FrozenQualityFactV1 {
  class: QualityFactClass;
  durableRefs: QualityDurableRefV1[];
  text: string;
  anchors: string[];
  current: boolean;
  releaseRelevant: boolean;
  status: QualityFactStatus;
  eligibility: QualityFactEligibility;
}

/** Exact in-memory selection snapshot. Source/fact text must never be persisted. */
export interface FrozenQualitySourceV1 {
  version: 1;
  catalogId: string;
  sourceKind: QualitySourceKind;
  orderedRefs: string[];
  sourceDigest: string;
  facts: FrozenQualityFactV1[];
}

export interface QualityIdentityContextV1 {
  version: 1;
  sessionId: string;
  branchLeafId: string;
  epochId: string;
  canonicalSessionPathDigest: string;
  agentIds: string[];
  jobIds: string[];
  turnEntryIds: string[];
  messageEntryIds: string[];
  historyEntryIds: string[];
}

export interface QualityManifestFactV1 {
  factId: string;
  class: QualityFactClass;
  durableRefs: QualityDurableRefV1[];
  sourceFactDigests: string[];
  normalizedAnchors: string[];
  anchorDigests: string[];
  current: boolean;
  releaseRelevant: boolean;
  status: QualityFactStatus;
  summarySpanUtf16: QualitySpanUtf16 | null;
  summarySpanDigest: string | null;
}

/** Runtime-only extractor result. normalizedAnchors intentionally never enter qualityEvidence. */
export interface QualityManifestV1 {
  version: typeof QUALITY_MANIFEST_VERSION;
  extractorVersion: typeof QUALITY_EXTRACTOR_VERSION;
  sourceDigest: string;
  facts: QualityManifestFactV1[];
}

export interface QualityCountsV1 {
  totalFacts: number;
  hardFacts: number;
  warningFacts: number;
  optionalFacts: number;
  coveredFacts: number;
  coveredHardFacts: number;
  coveredWarningFacts: number;
  coveredOptionalFacts: number;
  missingHardFacts: number;
  missingWarningFacts: number;
  scorePermille: number;
}

export interface QualityEvidenceFactV1 {
  factId: string;
  class: QualityFactClass;
  requirement: QualityRequirement;
  durableRefs: QualityDurableRefV1[];
  sourceFactDigests: string[];
  anchorDigests: string[];
  summarySpanUtf16: QualitySpanUtf16 | null;
  summarySpanDigest: string | null;
  covered: boolean;
}

interface QualityEvidenceFields {
  version: typeof QUALITY_EVIDENCE_VERSION;
  extractorVersion: typeof QUALITY_EXTRACTOR_VERSION;
  evaluatorVersion: typeof QUALITY_EVALUATOR_VERSION;
  catalogId: string;
  sourceKind: QualitySourceKind;
  orderedRefs: string[];
  sourceDigest: string;
  manifestDigest: string;
  facts: QualityEvidenceFactV1[];
  verdict: QualityVerdict;
  codes: QualityCode[];
  counts: QualityCountsV1;
}

/** Bounded PR2-persistable evidence: no source body, fact text, or anchor text. */
export type QualityEvidenceV1 = (QualityEvidenceFields & {
  /** Read-only legacy quality identity. */
  tier: QualityTier;
}) | (QualityEvidenceFields & {
  /** Tierless active-block quality identity for every new write. */
  semantics: "active-block";
});

export interface QualityResultV1 {
  version: typeof QUALITY_RESULT_VERSION;
  evaluatorVersion: typeof QUALITY_EVALUATOR_VERSION;
  verdict: QualityVerdict;
  codes: QualityCode[];
  counts: QualityCountsV1;
  qualityEvidence: QualityEvidenceV1;
}

export interface QualityRuntimeOptions {
  extractorAvailable?: boolean;
  evaluatorAvailable?: boolean;
  resolvedDetailT3?: "optional" | "warning";
}

export type QualityExtractionResult =
  | { ok: true; manifest: QualityManifestV1 }
  | { ok: false; code: QualityCode };

/** NFC + newline normalization, deliberately without trimming, collapsing, or case folding. */
export function normalizeQualityText(value: string): string {
  if (hasMalformedUtf16(value)) throw new TypeError("quality text contains a malformed UTF-16 surrogate");
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

export function hasMalformedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** Canonical durable identity used by the normative fact-digest framing. */
export function canonicalQualityDurableRef(ref: QualityDurableRefV1): string {
  switch (ref.kind) {
    case "agent": return `agent=${ref.sessionId}/${ref.agentId}`;
    case "job": return `job=${ref.sessionId}/${ref.jobId}`;
    case "turn": return `turn=${ref.branchLeafId}/${ref.turnEntryId}`;
    case "message": return `message=${ref.branchLeafId}/${ref.epochId}/${ref.entryId}`;
    case "history": return `history=${ref.canonicalSessionPathDigest}/${ref.branchLeafId}/${ref.entryId}`;
  }
}

/** SHA-256 over UTF-8(class + NUL + durableRef + NUL + normalizedText). */
export function qualityFactDigest(factClass: QualityFactClass, durableRef: QualityDurableRefV1, text: string): string {
  return sha256Utf8(`${factClass}\u0000${canonicalQualityDurableRef(durableRef)}\u0000${normalizeQualityText(text)}`);
}

export function parseQualityInput(value: unknown): QualityInputV1 | undefined {
  try {
    if (!isRecord(value)) return undefined;
    const legacy = hasExactKeys(value, LEGACY_QUALITY_INPUT_KEYS);
    const active = hasExactKeys(value, ACTIVE_QUALITY_INPUT_KEYS);
    if (!legacy && !active) return undefined;
    if (value.version !== QUALITY_INPUT_VERSION || !isQualitySourceKind(value.sourceKind)) return undefined;
    const legacyTier = legacy && isQualityTier(value.tier) ? value.tier : undefined;
    if (legacy && (!legacyTier || !tierMatchesSourceKind(legacyTier, value.sourceKind))) return undefined;
    if (active && value.semantics !== "active-block") return undefined;
    if (!isIdentifier(value.catalogId) || !isHash(value.sourceDigest)) return undefined;
    const orderedRefs = parseIdentifierArray(value.orderedRefs, MAX_REFS, false);
    if (!orderedRefs || typeof value.summary !== "string" || value.summary.length === 0 || value.summary.length > MAX_SUMMARY_UTF16) return undefined;
    if (hasMalformedUtf16(value.summary)) return undefined;
    return {
      version: QUALITY_INPUT_VERSION,
      ...(legacy ? { tier: legacyTier! } : { semantics: "active-block" as const }),
      catalogId: value.catalogId,
      sourceKind: value.sourceKind,
      orderedRefs,
      sourceDigest: value.sourceDigest,
      summary: value.summary,
    };
  } catch {
    return undefined;
  }
}

export function isQualityInput(value: unknown): value is QualityInputV1 {
  return parseQualityInput(value) !== undefined;
}

export function parseFrozenQualitySource(value: unknown): FrozenQualitySourceV1 | undefined {
  try {
    if (!isRecord(value) || !hasExactKeys(value, FROZEN_SOURCE_KEYS)) return undefined;
    if (value.version !== 1 || !isIdentifier(value.catalogId) || !isQualitySourceKind(value.sourceKind) || !isHash(value.sourceDigest)) return undefined;
    const orderedRefs = parseIdentifierArray(value.orderedRefs, MAX_REFS, false);
    if (!orderedRefs || !Array.isArray(value.facts) || value.facts.length > MAX_QUALITY_FACTS) return undefined;
    const facts: FrozenQualityFactV1[] = [];
    for (const item of value.facts) {
      const fact = parseFrozenFact(item);
      if (!fact) return undefined;
      facts.push(fact);
    }
    return {
      version: 1,
      catalogId: value.catalogId,
      sourceKind: value.sourceKind,
      orderedRefs,
      sourceDigest: value.sourceDigest,
      facts,
    };
  } catch {
    return undefined;
  }
}

export function parseQualityIdentityContext(value: unknown): QualityIdentityContextV1 | undefined {
  try {
    if (!isRecord(value) || !hasExactKeys(value, IDENTITY_CONTEXT_KEYS) || value.version !== 1) return undefined;
    if (!isIdentifier(value.sessionId) || !isIdentifier(value.branchLeafId) || !isIdentifier(value.epochId) || !isHash(value.canonicalSessionPathDigest)) return undefined;
    const agentIds = parseIdentifierArray(value.agentIds, MAX_REFS, true);
    const jobIds = parseIdentifierArray(value.jobIds, MAX_REFS, true);
    const turnEntryIds = parseIdentifierArray(value.turnEntryIds, MAX_REFS, true);
    const messageEntryIds = parseIdentifierArray(value.messageEntryIds, MAX_REFS, true);
    const historyEntryIds = parseIdentifierArray(value.historyEntryIds, MAX_REFS, true);
    if (!agentIds || !jobIds || !turnEntryIds || !messageEntryIds || !historyEntryIds) return undefined;
    return {
      version: 1,
      sessionId: value.sessionId,
      branchLeafId: value.branchLeafId,
      epochId: value.epochId,
      canonicalSessionPathDigest: value.canonicalSessionPathDigest,
      agentIds,
      jobIds,
      turnEntryIds,
      messageEntryIds,
      historyEntryIds,
    };
  } catch {
    return undefined;
  }
}

export function parseQualityManifest(value: unknown): QualityManifestV1 | undefined {
  try {
    if (!isRecord(value) || !hasExactKeys(value, MANIFEST_KEYS)) return undefined;
    if (value.version !== QUALITY_MANIFEST_VERSION || value.extractorVersion !== QUALITY_EXTRACTOR_VERSION || !isHash(value.sourceDigest)) return undefined;
    if (!Array.isArray(value.facts) || value.facts.length > MAX_QUALITY_FACTS) return undefined;
    const facts: QualityManifestFactV1[] = [];
    const factIds = new Set<string>();
    for (const item of value.facts) {
      const fact = parseManifestFact(item);
      if (!fact || factIds.has(fact.factId)) return undefined;
      factIds.add(fact.factId);
      facts.push(fact);
    }
    return {
      version: QUALITY_MANIFEST_VERSION,
      extractorVersion: QUALITY_EXTRACTOR_VERSION,
      sourceDigest: value.sourceDigest,
      facts,
    };
  } catch {
    return undefined;
  }
}

export function isQualityManifest(value: unknown): value is QualityManifestV1 {
  return parseQualityManifest(value) !== undefined;
}

export function parseQualityResult(value: unknown): QualityResultV1 | undefined {
  try {
    if (!isRecord(value) || !hasExactKeys(value, RESULT_KEYS)) return undefined;
    if (value.version !== QUALITY_RESULT_VERSION || value.evaluatorVersion !== QUALITY_EVALUATOR_VERSION || !isQualityVerdict(value.verdict)) return undefined;
    const codes = parseCodes(value.codes);
    const counts = parseCounts(value.counts);
    const qualityEvidence = parseQualityEvidence(value.qualityEvidence);
    if (!codes || !counts || !qualityEvidence) return undefined;
    if (canonicalJson(codes) !== canonicalJson(qualityEvidence.codes)
      || canonicalJson(counts) !== canonicalJson(qualityEvidence.counts)
      || value.verdict !== qualityEvidence.verdict) return undefined;
    if (value.verdict === "pass" && codes.length > 0) return undefined;
    if (value.verdict === "pass-with-warnings" && !codes.includes("warning-fact-omitted")) return undefined;
    if (value.verdict === "reject" && qualityEvidence.facts.length !== 0) return undefined;
    if (value.verdict !== "reject" && qualityEvidence.facts.length !== counts.totalFacts) return undefined;
    return {
      version: QUALITY_RESULT_VERSION,
      evaluatorVersion: QUALITY_EVALUATOR_VERSION,
      verdict: value.verdict,
      codes,
      counts,
      qualityEvidence,
    };
  } catch {
    return undefined;
  }
}

export function isQualityResult(value: unknown): value is QualityResultV1 {
  return parseQualityResult(value) !== undefined;
}

export function extractQualityManifest(
  inputValue: unknown,
  frozenSourceValue: unknown,
  identityContextValue: unknown,
  options: Pick<QualityRuntimeOptions, "extractorAvailable"> = {},
): QualityExtractionResult {
  try {
    if (options.extractorAvailable === false) return { ok: false, code: "extractor-unavailable" };
    if (isRecord(inputValue) && typeof inputValue.summary === "string" && hasMalformedUtf16(inputValue.summary)) {
      return { ok: false, code: "malformed-surrogate" };
    }
    const input = parseQualityInput(inputValue);
    if (!input) return { ok: false, code: "invalid-input" };
    if (isRecord(frozenSourceValue) && Array.isArray(frozenSourceValue.facts) && frozenSourceValue.facts.length > MAX_QUALITY_FACTS) {
      return { ok: false, code: "fact-limit-exceeded" };
    }
    if (containsMalformedFrozenText(frozenSourceValue)) return { ok: false, code: "malformed-surrogate" };
    const frozenSource = parseFrozenQualitySource(frozenSourceValue);
    if (!frozenSource) return { ok: false, code: "invalid-frozen-source" };
    const identityContext = parseQualityIdentityContext(identityContextValue);
    if (!identityContext) return { ok: false, code: "invalid-durable-ref" };
    if (input.catalogId !== frozenSource.catalogId
      || input.sourceKind !== frozenSource.sourceKind
      || input.sourceDigest !== frozenSource.sourceDigest
      || canonicalJson(input.orderedRefs) !== canonicalJson(frozenSource.orderedRefs)) {
      return { ok: false, code: "source-summary-scope-mismatch" };
    }

    const normalizedSummary = normalizeQualityText(input.summary);
    const boundaryIndex = buildNormalizedBoundaryIndex(input.summary, normalizedSummary);
    const facts: QualityManifestFactV1[] = [];
    const factIds = new Set<string>();

    for (const sourceFact of frozenSource.facts) {
      if (sourceFact.eligibility === "unclassifiable-high-risk") return { ok: false, code: "unclassifiable-high-risk" };
      if (sourceFact.eligibility !== "eligible") return { ok: false, code: "protected-source-ineligible" };
      const durableRefs = [...sourceFact.durableRefs].sort((left, right) => compareCodeUnits(
        canonicalQualityDurableRef(left),
        canonicalQualityDurableRef(right),
      ));
      if (!durableRefs.every((ref) => isCurrentDurableRef(ref, identityContext))) return { ok: false, code: "invalid-durable-ref" };
      const normalizedText = normalizeQualityText(sourceFact.text);
      const normalizedAnchors = sourceFact.anchors.map(normalizeQualityText);
      if (new Set(normalizedAnchors).size !== normalizedAnchors.length
        || normalizedAnchors.some((anchor) => !normalizedText.includes(anchor))) {
        return { ok: false, code: "invalid-frozen-source" };
      }
      const sourceFactDigests = durableRefs.map((ref) => qualityFactDigest(sourceFact.class, ref, normalizedText));
      const anchorDigests = normalizedAnchors.map(sha256Utf8);
      const factId = digest({ class: sourceFact.class, durableRefs, sourceFactDigests });
      if (factIds.has(factId)) return { ok: false, code: "invalid-frozen-source" };
      factIds.add(factId);

      const locations: QualitySpanUtf16[] = [];
      let missing = false;
      for (const anchor of normalizedAnchors) {
        const location = locateNormalizedAnchor(input.summary, normalizedSummary, boundaryIndex, anchor);
        if (location === "ambiguous" || location === "invalid") return { ok: false, code: "ambiguous-match" };
        if (location === "missing") {
          missing = true;
        } else {
          locations.push(location);
        }
      }
      if (!missing && locations.some((location, index) => index > 0 && location.start < locations[index - 1]!.end)) {
        return { ok: false, code: "ambiguous-match" };
      }
      const summarySpanUtf16 = missing
        ? null
        : { start: locations[0]!.start, end: locations.at(-1)!.end };
      const summarySpanDigest = summarySpanUtf16
        ? sha256Utf8(normalizeQualityText(input.summary.slice(summarySpanUtf16.start, summarySpanUtf16.end)))
        : null;
      facts.push({
        factId,
        class: sourceFact.class,
        durableRefs,
        sourceFactDigests,
        normalizedAnchors,
        anchorDigests,
        current: sourceFact.current,
        releaseRelevant: sourceFact.releaseRelevant,
        status: sourceFact.status,
        summarySpanUtf16,
        summarySpanDigest,
      });
    }
    if (hasOverlappingSpans(facts)) return { ok: false, code: "overlapping-span" };
    return {
      ok: true,
      manifest: {
        version: QUALITY_MANIFEST_VERSION,
        extractorVersion: QUALITY_EXTRACTOR_VERSION,
        sourceDigest: input.sourceDigest,
        facts,
      },
    };
  } catch {
    return { ok: false, code: "extractor-error" };
  }
}

export function evaluateQuality(
  inputValue: unknown,
  manifestValue: unknown,
  frozenSourceValue: unknown,
  identityContextValue: unknown,
  options: Pick<QualityRuntimeOptions, "evaluatorAvailable" | "resolvedDetailT3"> = {},
): QualityResultV1 {
  let parsedInput: QualityInputV1 | undefined;
  try {
    if (isRecord(inputValue) && typeof inputValue.summary === "string" && hasMalformedUtf16(inputValue.summary)) {
      return failureResult(undefined, ["malformed-surrogate"]);
    }
    parsedInput = parseQualityInput(inputValue);
    if (!parsedInput) return failureResult(undefined, ["invalid-input"]);
    if (options.evaluatorAvailable === false) return failureResult(parsedInput, ["evaluator-unavailable"]);
    const manifest = parseQualityManifest(manifestValue);
    if (!manifest || manifest.sourceDigest !== parsedInput.sourceDigest) return failureResult(parsedInput, ["invalid-manifest"]);
    const spanFailure = validateManifestSpans(manifest, parsedInput.summary);
    if (spanFailure) return failureResult(parsedInput, [spanFailure], digest(manifest));

    const extraction = extractQualityManifest(parsedInput, frozenSourceValue, identityContextValue);
    if (!extraction.ok) return failureResult(parsedInput, [extraction.code], digest(manifest));
    const expected = extraction.manifest;
    const mismatch = classifyManifestMismatch(manifest, expected);
    if (mismatch) return failureResult(parsedInput, [mismatch], digest(expected));
    const frozenSource = parseFrozenQualitySource(frozenSourceValue);
    if (!frozenSource) return failureResult(parsedInput, ["invalid-frozen-source"], digest(expected));
    return evaluateExtractedQuality(parsedInput, expected, frozenSource, options);
  } catch {
    return failureResult(parsedInput, ["evaluator-error"]);
  }
}

/** Full local gate. The manifest never crosses the caller boundary. */
export function assessQuality(
  inputValue: unknown,
  frozenSourceValue: unknown,
  identityContextValue: unknown,
  options: QualityRuntimeOptions = {},
): QualityResultV1 {
  let parsedInput: QualityInputV1 | undefined;
  try {
    parsedInput = parseQualityInput(inputValue);
    if (options.extractorAvailable === false) return failureResult(parsedInput, ["extractor-unavailable"]);
    const extraction = extractQualityManifest(inputValue, frozenSourceValue, identityContextValue, options);
    if (!extraction.ok) return failureResult(parsedInput, [extraction.code]);
    if (!parsedInput) return failureResult(undefined, ["invalid-input"]);
    if (options.evaluatorAvailable === false) return failureResult(parsedInput, ["evaluator-unavailable"]);
    const spanFailure = validateManifestSpans(extraction.manifest, parsedInput.summary);
    if (spanFailure) return failureResult(parsedInput, [spanFailure], digest(extraction.manifest));
    const frozenSource = parseFrozenQualitySource(frozenSourceValue);
    if (!frozenSource) return failureResult(parsedInput, ["invalid-frozen-source"], digest(extraction.manifest));
    return evaluateExtractedQuality(parsedInput, extraction.manifest, frozenSource, options);
  } catch {
    return failureResult(parsedInput, ["evaluator-error"]);
  }
}

function evaluateExtractedQuality(
  input: QualityInputV1,
  manifest: QualityManifestV1,
  frozenSource: FrozenQualitySourceV1,
  options: Pick<QualityRuntimeOptions, "evaluatorAvailable" | "resolvedDetailT3">,
): QualityResultV1 {
  const requirements = manifest.facts.map((fact) => qualityRequirement(
    qualitySemantics(input),
    fact.class,
    fact.current,
    fact.releaseRelevant,
    options.resolvedDetailT3 ?? "optional",
  ));
  const counts = qualityCounts(manifest.facts, requirements);
  const codes: QualityCode[] = [];
  if (counts.missingHardFacts > 0) codes.push("missing-hard-fact");
  if (counts.missingWarningFacts > 0) codes.push("warning-fact-omitted");
  if (hasContradictoryStatus(input.summary, frozenSource.facts)) codes.push("contradictory-status");
  const orderedCodes = canonicalCodes(codes);
  const verdict: QualityVerdict = orderedCodes.includes("missing-hard-fact") || orderedCodes.includes("contradictory-status")
    ? "reject"
    : orderedCodes.length > 0 ? "pass-with-warnings" : "pass";
  const evidenceFacts = manifest.facts.map((fact, index): QualityEvidenceFactV1 => ({
    factId: fact.factId,
    class: fact.class,
    requirement: requirements[index]!,
    durableRefs: fact.durableRefs.map(cloneDurableRef),
    sourceFactDigests: [...fact.sourceFactDigests],
    anchorDigests: [...fact.anchorDigests],
    summarySpanUtf16: cloneSpan(fact.summarySpanUtf16),
    summarySpanDigest: fact.summarySpanDigest,
    covered: fact.summarySpanUtf16 !== null,
  }));
  return makeResult(input, verdict, orderedCodes, counts, digest(manifest), evidenceFacts);
}

export function qualityRequirement(
  semantics: QualitySemantics,
  factClass: QualityFactClass,
  current: boolean,
  releaseRelevant: boolean,
  resolvedDetailT3: "optional" | "warning" = "optional",
): QualityRequirement {
  if (semantics === "active-block") {
    if (factClass === "resolved-detail") return "warning";
    if (factClass === "artifact-symbol" && !current) return "warning";
    if (factClass === "verification") return current || releaseRelevant ? "hard" : "warning";
    return "hard";
  }
  if (factClass === "resolved-detail") return semantics === "T3" ? resolvedDetailT3 : "warning";
  if (factClass === "artifact-symbol" && semantics === "T3" && !current) return "warning";
  if (factClass === "verification") {
    if (semantics === "T3" || current || (semantics === "T2" && releaseRelevant)) return "hard";
    return "warning";
  }
  return "hard";
}

function parseFrozenFact(value: unknown): FrozenQualityFactV1 | undefined {
  if (!isRecord(value) || !hasExactKeys(value, FROZEN_FACT_KEYS)) return undefined;
  if (!isQualityFactClass(value.class) || !isQualityFactStatus(value.status) || !isQualityFactEligibility(value.eligibility)) return undefined;
  if (typeof value.current !== "boolean" || typeof value.releaseRelevant !== "boolean") return undefined;
  if (typeof value.text !== "string" || value.text.length === 0 || value.text.length > MAX_FACT_TEXT_UTF16 || hasMalformedUtf16(value.text)) return undefined;
  const durableRefs = parseDurableRefs(value.durableRefs);
  const anchors = parseTextArray(value.anchors, MAX_ANCHORS, MAX_ANCHOR_UTF16, false);
  if (!durableRefs || !anchors || anchors.some(hasMalformedUtf16)) return undefined;
  return {
    class: value.class,
    durableRefs,
    text: value.text,
    anchors,
    current: value.current,
    releaseRelevant: value.releaseRelevant,
    status: value.status,
    eligibility: value.eligibility,
  };
}

function parseManifestFact(value: unknown): QualityManifestFactV1 | undefined {
  if (!isRecord(value) || !hasExactKeys(value, MANIFEST_FACT_KEYS)) return undefined;
  if (!isHash(value.factId) || !isQualityFactClass(value.class) || typeof value.current !== "boolean"
    || typeof value.releaseRelevant !== "boolean" || !isQualityFactStatus(value.status)) return undefined;
  const durableRefs = parseDurableRefs(value.durableRefs);
  const sourceFactDigests = parseHashArray(value.sourceFactDigests, MAX_FACT_REFS, false);
  const normalizedAnchors = parseTextArray(value.normalizedAnchors, MAX_ANCHORS, MAX_ANCHOR_UTF16, false);
  const anchorDigests = parseHashArray(value.anchorDigests, MAX_ANCHORS, false);
  if (!durableRefs || !isCanonicalRefOrder(durableRefs) || !sourceFactDigests || !normalizedAnchors || !anchorDigests) return undefined;
  if (sourceFactDigests.length !== durableRefs.length || anchorDigests.length !== normalizedAnchors.length) return undefined;
  if (normalizedAnchors.some((anchor) => hasMalformedUtf16(anchor) || normalizeQualityText(anchor) !== anchor)) return undefined;
  const summarySpanUtf16 = parseNullableSpan(value.summarySpanUtf16);
  if (summarySpanUtf16 === undefined) return undefined;
  const summarySpanDigest = value.summarySpanDigest;
  if (summarySpanDigest !== null && !isHash(summarySpanDigest)) return undefined;
  if ((summarySpanUtf16 === null) !== (summarySpanDigest === null)) return undefined;
  return {
    factId: value.factId,
    class: value.class,
    durableRefs,
    sourceFactDigests,
    normalizedAnchors,
    anchorDigests,
    current: value.current,
    releaseRelevant: value.releaseRelevant,
    status: value.status,
    summarySpanUtf16,
    summarySpanDigest,
  };
}

export function parseQualityEvidence(value: unknown): QualityEvidenceV1 | undefined {
  if (!isRecord(value)) return undefined;
  const legacy = hasExactKeys(value, LEGACY_EVIDENCE_KEYS);
  const active = hasExactKeys(value, ACTIVE_EVIDENCE_KEYS);
  if (!legacy && !active) return undefined;
  if (value.version !== QUALITY_EVIDENCE_VERSION || value.extractorVersion !== QUALITY_EXTRACTOR_VERSION
    || value.evaluatorVersion !== QUALITY_EVALUATOR_VERSION
    || !isIdentifier(value.catalogId) || !isQualitySourceKind(value.sourceKind)
    || !isHash(value.sourceDigest) || !isHash(value.manifestDigest) || !isQualityVerdict(value.verdict)) return undefined;
  const legacyTier = legacy && isQualityTier(value.tier) ? value.tier : undefined;
  if (legacy && (!legacyTier || !tierMatchesSourceKind(legacyTier, value.sourceKind))) return undefined;
  if (active && value.semantics !== "active-block") return undefined;
  const orderedRefs = parseIdentifierArray(value.orderedRefs, MAX_REFS, true);
  const codes = parseCodes(value.codes);
  const counts = parseCounts(value.counts);
  if (!orderedRefs || !codes || !counts || !Array.isArray(value.facts) || value.facts.length > MAX_QUALITY_FACTS) return undefined;
  const facts: QualityEvidenceFactV1[] = [];
  const factIds = new Set<string>();
  for (const item of value.facts) {
    const fact = parseEvidenceFact(item);
    if (!fact || factIds.has(fact.factId)) return undefined;
    factIds.add(fact.factId);
    facts.push(fact);
  }
  if (value.verdict === "reject" && facts.length > 0) return undefined;
  if (value.verdict !== "reject") {
    const derivedCounts = countsFromEvidence(facts);
    if (canonicalJson(derivedCounts) !== canonicalJson(counts)) return undefined;
  }
  if (hasOverlappingSpans(facts)) return undefined;
  return {
    version: QUALITY_EVIDENCE_VERSION,
    extractorVersion: QUALITY_EXTRACTOR_VERSION,
    evaluatorVersion: QUALITY_EVALUATOR_VERSION,
    ...(legacy ? { tier: legacyTier! } : { semantics: "active-block" as const }),
    catalogId: value.catalogId,
    sourceKind: value.sourceKind,
    orderedRefs,
    sourceDigest: value.sourceDigest,
    manifestDigest: value.manifestDigest,
    facts,
    verdict: value.verdict,
    codes,
    counts,
  };
}

function parseEvidenceFact(value: unknown): QualityEvidenceFactV1 | undefined {
  if (!isRecord(value) || !hasExactKeys(value, EVIDENCE_FACT_KEYS)) return undefined;
  if (!isHash(value.factId) || !isQualityFactClass(value.class) || !isQualityRequirement(value.requirement) || typeof value.covered !== "boolean") return undefined;
  const durableRefs = parseDurableRefs(value.durableRefs);
  const sourceFactDigests = parseHashArray(value.sourceFactDigests, MAX_FACT_REFS, false);
  const anchorDigests = parseHashArray(value.anchorDigests, MAX_ANCHORS, false);
  const summarySpanUtf16 = parseNullableSpan(value.summarySpanUtf16);
  if (!durableRefs || !isCanonicalRefOrder(durableRefs) || !sourceFactDigests || !anchorDigests || summarySpanUtf16 === undefined) return undefined;
  if (durableRefs.length !== sourceFactDigests.length) return undefined;
  const summarySpanDigest = value.summarySpanDigest;
  if (summarySpanDigest !== null && !isHash(summarySpanDigest)) return undefined;
  if ((summarySpanUtf16 === null) !== (summarySpanDigest === null) || value.covered !== (summarySpanUtf16 !== null)) return undefined;
  return {
    factId: value.factId,
    class: value.class,
    requirement: value.requirement,
    durableRefs,
    sourceFactDigests,
    anchorDigests,
    summarySpanUtf16,
    summarySpanDigest,
    covered: value.covered,
  };
}

function parseCounts(value: unknown): QualityCountsV1 | undefined {
  if (!isRecord(value) || !hasExactKeys(value, COUNTS_KEYS)) return undefined;
  for (const key of COUNTS_KEYS) {
    if (!isNonNegativeSafeInteger(value[key])) return undefined;
  }
  const counts = value as unknown as QualityCountsV1;
  if (counts.totalFacts > MAX_QUALITY_FACTS || counts.scorePermille > 1_000) return undefined;
  if (counts.totalFacts !== counts.hardFacts + counts.warningFacts + counts.optionalFacts) return undefined;
  if (counts.coveredFacts !== counts.coveredHardFacts + counts.coveredWarningFacts + counts.coveredOptionalFacts) return undefined;
  if (counts.missingHardFacts !== counts.hardFacts - counts.coveredHardFacts) return undefined;
  if (counts.missingWarningFacts !== counts.warningFacts - counts.coveredWarningFacts) return undefined;
  if (counts.coveredFacts > counts.totalFacts || counts.coveredOptionalFacts > counts.optionalFacts) return undefined;
  return { ...counts };
}

function parseCodes(value: unknown): QualityCode[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_QUALITY_CODES || !value.every(isQualityCode)) return undefined;
  if (new Set(value).size !== value.length) return undefined;
  const canonical = canonicalCodes(value);
  return canonicalJson(canonical) === canonicalJson(value) ? canonical : undefined;
}

function parseDurableRefs(value: unknown): QualityDurableRefV1[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FACT_REFS) return undefined;
  const refs: QualityDurableRefV1[] = [];
  for (const item of value) {
    const ref = parseDurableRef(item);
    if (!ref) return undefined;
    refs.push(ref);
  }
  if (new Set(refs.map(canonicalQualityDurableRef)).size !== refs.length) return undefined;
  return refs;
}

function parseDurableRef(value: unknown): QualityDurableRefV1 | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "agent" && hasExactKeys(value, ["agentId", "kind", "sessionId"]) && isIdentifier(value.sessionId) && isIdentifier(value.agentId)) {
    return { kind: "agent", sessionId: value.sessionId, agentId: value.agentId };
  }
  if (value.kind === "job" && hasExactKeys(value, ["jobId", "kind", "sessionId"]) && isIdentifier(value.sessionId) && isIdentifier(value.jobId)) {
    return { kind: "job", sessionId: value.sessionId, jobId: value.jobId };
  }
  if (value.kind === "turn" && hasExactKeys(value, ["branchLeafId", "kind", "turnEntryId"]) && isIdentifier(value.branchLeafId) && isIdentifier(value.turnEntryId)) {
    return { kind: "turn", branchLeafId: value.branchLeafId, turnEntryId: value.turnEntryId };
  }
  if (value.kind === "message" && hasExactKeys(value, ["branchLeafId", "entryId", "epochId", "kind"])
    && isIdentifier(value.branchLeafId) && isIdentifier(value.epochId) && isIdentifier(value.entryId)) {
    return { kind: "message", branchLeafId: value.branchLeafId, epochId: value.epochId, entryId: value.entryId };
  }
  if (value.kind === "history" && hasExactKeys(value, ["branchLeafId", "canonicalSessionPathDigest", "entryId", "kind"])
    && isHash(value.canonicalSessionPathDigest) && isIdentifier(value.branchLeafId) && isIdentifier(value.entryId)) {
    return { kind: "history", canonicalSessionPathDigest: value.canonicalSessionPathDigest, branchLeafId: value.branchLeafId, entryId: value.entryId };
  }
  return undefined;
}

function isCurrentDurableRef(ref: QualityDurableRefV1, context: QualityIdentityContextV1): boolean {
  switch (ref.kind) {
    case "agent": return ref.sessionId === context.sessionId && context.agentIds.includes(ref.agentId);
    case "job": return ref.sessionId === context.sessionId && context.jobIds.includes(ref.jobId);
    case "turn": return ref.branchLeafId === context.branchLeafId && context.turnEntryIds.includes(ref.turnEntryId);
    case "message": return ref.branchLeafId === context.branchLeafId && ref.epochId === context.epochId && context.messageEntryIds.includes(ref.entryId);
    case "history": return ref.canonicalSessionPathDigest === context.canonicalSessionPathDigest
      && ref.branchLeafId === context.branchLeafId && context.historyEntryIds.includes(ref.entryId);
  }
}

function locateNormalizedAnchor(
  originalSummary: string,
  normalizedSummary: string,
  boundaryIndex: ReadonlyMap<number, readonly number[]>,
  anchor: string,
): QualitySpanUtf16 | "missing" | "ambiguous" | "invalid" {
  const normalizedStart = normalizedSummary.indexOf(anchor);
  if (normalizedStart < 0) return "missing";
  if (normalizedSummary.indexOf(anchor, normalizedStart + 1) >= 0) return "ambiguous";
  const normalizedEnd = normalizedStart + anchor.length;
  const starts = boundaryIndex.get(normalizedStart);
  const ends = boundaryIndex.get(normalizedEnd);
  if (!starts || !ends) return "invalid";
  for (const start of [...starts].sort((left, right) => right - left)) {
    for (const end of [...ends].sort((left, right) => right - left)) {
      if (end <= start) continue;
      if (normalizeQualityText(originalSummary.slice(start, end)) === anchor) return { start, end };
    }
  }
  return "invalid";
}

function buildNormalizedBoundaryIndex(value: string, normalizedValue = normalizeQualityText(value)): Map<number, number[]> {
  const result = new Map<number, number[]>();
  if (normalizedValue === value) {
    for (let offset = 0; offset <= value.length; offset += 1) {
      if (isUtf16Boundary(value, offset)) result.set(offset, [offset]);
    }
    return result;
  }
  for (let offset = 0; offset <= value.length; offset += 1) {
    if (!isUtf16Boundary(value, offset)) continue;
    const normalizedOffset = normalizeQualityText(value.slice(0, offset)).length;
    const offsets = result.get(normalizedOffset) ?? [];
    offsets.push(offset);
    result.set(normalizedOffset, offsets);
  }
  return result;
}

function validateManifestSpans(manifest: QualityManifestV1, summary: string): QualityCode | undefined {
  if (hasMalformedUtf16(summary)) return "malformed-surrogate";
  for (const fact of manifest.facts) {
    const span = fact.summarySpanUtf16;
    if (!span) continue;
    if (span.start < 0 || span.end > summary.length || span.start >= span.end
      || !isUtf16Boundary(summary, span.start) || !isUtf16Boundary(summary, span.end)) return "invalid-span";
    const normalizedSlice = normalizeQualityText(summary.slice(span.start, span.end));
    if (sha256Utf8(normalizedSlice) !== fact.summarySpanDigest) return "span-digest-mismatch";
    if (fact.normalizedAnchors.some((anchor) => !normalizedSlice.includes(anchor))) return "anchor-mismatch";
    if (fact.anchorDigests.some((anchorDigest, index) => anchorDigest !== sha256Utf8(fact.normalizedAnchors[index]!))) return "anchor-mismatch";
  }
  return hasOverlappingSpans(manifest.facts) ? "overlapping-span" : undefined;
}

function classifyManifestMismatch(actual: QualityManifestV1, expected: QualityManifestV1): QualityCode | undefined {
  if (actual.facts.length !== expected.facts.length) return "fact-mismatch";
  for (let index = 0; index < actual.facts.length; index += 1) {
    const left = actual.facts[index]!;
    const right = expected.facts[index]!;
    if (canonicalJson(left.normalizedAnchors) !== canonicalJson(right.normalizedAnchors)
      || canonicalJson(left.anchorDigests) !== canonicalJson(right.anchorDigests)) return "anchor-mismatch";
    if (canonicalJson(left.summarySpanUtf16) !== canonicalJson(right.summarySpanUtf16)
      || left.summarySpanDigest !== right.summarySpanDigest) return "fact-mismatch";
    const leftWithoutSummary = {
      factId: left.factId,
      class: left.class,
      durableRefs: left.durableRefs,
      sourceFactDigests: left.sourceFactDigests,
      current: left.current,
      releaseRelevant: left.releaseRelevant,
      status: left.status,
    };
    const rightWithoutSummary = {
      factId: right.factId,
      class: right.class,
      durableRefs: right.durableRefs,
      sourceFactDigests: right.sourceFactDigests,
      current: right.current,
      releaseRelevant: right.releaseRelevant,
      status: right.status,
    };
    if (canonicalJson(leftWithoutSummary) !== canonicalJson(rightWithoutSummary)) return "fact-mismatch";
  }
  return undefined;
}

function qualityCounts(facts: readonly QualityManifestFactV1[], requirements: readonly QualityRequirement[]): QualityCountsV1 {
  let hardFacts = 0;
  let warningFacts = 0;
  let optionalFacts = 0;
  let coveredHardFacts = 0;
  let coveredWarningFacts = 0;
  let coveredOptionalFacts = 0;
  for (let index = 0; index < facts.length; index += 1) {
    const covered = facts[index]!.summarySpanUtf16 !== null;
    const requirement = requirements[index]!;
    if (requirement === "hard") {
      hardFacts += 1;
      if (covered) coveredHardFacts += 1;
    } else if (requirement === "warning") {
      warningFacts += 1;
      if (covered) coveredWarningFacts += 1;
    } else {
      optionalFacts += 1;
      if (covered) coveredOptionalFacts += 1;
    }
  }
  const denominator = hardFacts * 4 + warningFacts;
  const numerator = coveredHardFacts * 4 + coveredWarningFacts;
  return {
    totalFacts: facts.length,
    hardFacts,
    warningFacts,
    optionalFacts,
    coveredFacts: coveredHardFacts + coveredWarningFacts + coveredOptionalFacts,
    coveredHardFacts,
    coveredWarningFacts,
    coveredOptionalFacts,
    missingHardFacts: hardFacts - coveredHardFacts,
    missingWarningFacts: warningFacts - coveredWarningFacts,
    scorePermille: denominator === 0 ? 1_000 : Math.floor((numerator * 1_000) / denominator),
  };
}

function countsFromEvidence(facts: readonly QualityEvidenceFactV1[]): QualityCountsV1 {
  return qualityCounts(
    facts.map((fact): QualityManifestFactV1 => ({
      factId: fact.factId,
      class: fact.class,
      durableRefs: fact.durableRefs,
      sourceFactDigests: fact.sourceFactDigests,
      normalizedAnchors: [],
      anchorDigests: fact.anchorDigests,
      current: false,
      releaseRelevant: false,
      status: "neutral",
      summarySpanUtf16: fact.summarySpanUtf16,
      summarySpanDigest: fact.summarySpanDigest,
    })),
    facts.map((fact) => fact.requirement),
  );
}

function hasContradictoryStatus(summary: string, facts: readonly FrozenQualityFactV1[]): boolean {
  if (!facts.some((fact) => fact.status === "failed" || fact.status === "unverified" || fact.status === "open")) return false;
  const normalized = normalizeQualityText(summary);
  const completion = /(?:^|[^\p{L}\p{N}_])(?:complete|completed|pass|passed|passing|success|successful|resolved)(?:$|[^\p{L}\p{N}_])/iu.test(normalized);
  const qualification = /(?:^|[^\p{L}\p{N}_])(?:not|unverified|failed|failing|incomplete|pending|open|blocked)(?:$|[^\p{L}\p{N}_])/iu.test(normalized);
  return completion && !qualification;
}

function makeResult(
  input: QualityInputV1,
  verdict: QualityVerdict,
  codes: QualityCode[],
  counts: QualityCountsV1,
  manifestDigest: string,
  facts: QualityEvidenceFactV1[],
): QualityResultV1 {
  const redactedFacts = verdict === "reject" ? [] : facts.map(cloneEvidenceFact);
  const evidence: QualityEvidenceV1 = {
    version: QUALITY_EVIDENCE_VERSION,
    extractorVersion: QUALITY_EXTRACTOR_VERSION,
    evaluatorVersion: QUALITY_EVALUATOR_VERSION,
    ...qualityIdentity(input),
    catalogId: input.catalogId,
    sourceKind: input.sourceKind,
    orderedRefs: [...input.orderedRefs],
    sourceDigest: input.sourceDigest,
    manifestDigest,
    facts: redactedFacts,
    verdict,
    codes: [...codes],
    counts: { ...counts },
  };
  return {
    version: QUALITY_RESULT_VERSION,
    evaluatorVersion: QUALITY_EVALUATOR_VERSION,
    verdict,
    codes: [...codes],
    counts: { ...counts },
    qualityEvidence: evidence,
  };
}

function failureResult(input: QualityInputV1 | undefined, codes: readonly QualityCode[], manifestDigest = ZERO_DIGEST): QualityResultV1 {
  const fallback: QualityInputV1 = input ?? {
    version: QUALITY_INPUT_VERSION,
    semantics: "active-block",
    catalogId: "unknown",
    sourceKind: "messages",
    orderedRefs: [],
    sourceDigest: ZERO_DIGEST,
    summary: "invalid",
  };
  return makeResult(fallback, "reject", canonicalCodes(codes), emptyCounts(), manifestDigest, []);
}

function emptyCounts(): QualityCountsV1 {
  return {
    totalFacts: 0,
    hardFacts: 0,
    warningFacts: 0,
    optionalFacts: 0,
    coveredFacts: 0,
    coveredHardFacts: 0,
    coveredWarningFacts: 0,
    coveredOptionalFacts: 0,
    missingHardFacts: 0,
    missingWarningFacts: 0,
    scorePermille: 0,
  };
}

function parseNullableSpan(value: unknown): QualitySpanUtf16 | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, ["end", "start"]) || !isNonNegativeSafeInteger(value.start) || !isNonNegativeSafeInteger(value.end)) return undefined;
  return { start: value.start, end: value.end };
}

function isUtf16Boundary(value: string, offset: number): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > value.length) return false;
  if (offset === 0 || offset === value.length) return true;
  const previous = value.charCodeAt(offset - 1);
  const next = value.charCodeAt(offset);
  return !(previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff);
}

function hasOverlappingSpans(facts: readonly { summarySpanUtf16: QualitySpanUtf16 | null }[]): boolean {
  const spans = facts.flatMap((fact) => fact.summarySpanUtf16 ? [fact.summarySpanUtf16] : [])
    .sort((left, right) => left.start - right.start || left.end - right.end);
  return spans.some((span, index) => index > 0 && span.start < spans[index - 1]!.end);
}

function containsMalformedFrozenText(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.facts)) return false;
  for (const item of value.facts) {
    if (!isRecord(item)) continue;
    if (typeof item.text === "string" && hasMalformedUtf16(item.text)) return true;
    if (Array.isArray(item.anchors) && item.anchors.some((anchor) => typeof anchor === "string" && hasMalformedUtf16(anchor))) return true;
  }
  return false;
}

function parseIdentifierArray(value: unknown, maxItems: number, allowEmpty: boolean): string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maxItems || !value.every(isIdentifier)) return undefined;
  if (new Set(value).size !== value.length) return undefined;
  return [...value];
}

function parseTextArray(value: unknown, maxItems: number, maxLength: number, allowEmpty: boolean): string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maxItems) return undefined;
  if (!value.every((item) => typeof item === "string" && item.length > 0 && item.length <= maxLength)) return undefined;
  if (new Set(value).size !== value.length) return undefined;
  return [...value];
}

function parseHashArray(value: unknown, maxItems: number, allowEmpty: boolean): string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maxItems || !value.every(isHash)) return undefined;
  return [...value];
}

function canonicalCodes(codes: readonly QualityCode[]): QualityCode[] {
  const unique = new Set(codes);
  return CODE_ORDER.filter((code) => unique.has(code)).slice(0, MAX_QUALITY_CODES);
}

function cloneDurableRef(ref: QualityDurableRefV1): QualityDurableRefV1 {
  return { ...ref };
}

function cloneSpan(span: QualitySpanUtf16 | null): QualitySpanUtf16 | null {
  return span ? { ...span } : null;
}

function cloneEvidenceFact(fact: QualityEvidenceFactV1): QualityEvidenceFactV1 {
  return {
    ...fact,
    durableRefs: fact.durableRefs.map(cloneDurableRef),
    sourceFactDigests: [...fact.sourceFactDigests],
    anchorDigests: [...fact.anchorDigests],
    summarySpanUtf16: cloneSpan(fact.summarySpanUtf16),
  };
}

function isCanonicalRefOrder(refs: readonly QualityDurableRefV1[]): boolean {
  return refs.every((ref, index) => index === 0
    || compareCodeUnits(canonicalQualityDurableRef(refs[index - 1]!), canonicalQualityDurableRef(ref)) < 0);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_IDENTIFIER_UTF16
    && !value.includes("\u0000") && !hasMalformedUtf16(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isQualityTier(value: unknown): value is QualityTier {
  return value === "T1" || value === "T2" || value === "T3";
}

function qualityIdentity(value: QualityInputV1): { tier: QualityTier } | { semantics: "active-block" } {
  return "tier" in value ? { tier: value.tier } : { semantics: value.semantics };
}

function qualitySemantics(value: QualityInputV1): QualitySemantics {
  return "tier" in value ? value.tier : value.semantics;
}

function isQualitySourceKind(value: unknown): value is QualitySourceKind {
  return value === "messages" || value === "blocks";
}

function tierMatchesSourceKind(tier: QualityTier, sourceKind: QualitySourceKind): boolean {
  return tier === "T1" ? sourceKind === "messages" : sourceKind === "blocks";
}

function isQualityFactClass(value: unknown): value is QualityFactClass {
  return value === "goal-constraint" || value === "decision" || value === "artifact-symbol"
    || value === "failure-blocker" || value === "verification" || value === "open-work"
    || value === "protocol-provenance" || value === "resolved-detail";
}

function isQualityFactStatus(value: unknown): value is QualityFactStatus {
  return value === "active" || value === "failed" || value === "unverified" || value === "open"
    || value === "resolved" || value === "passed" || value === "neutral";
}

function isQualityFactEligibility(value: unknown): value is QualityFactEligibility {
  return value === "eligible" || value === "secret" || value === "credential" || value === "binary"
    || value === "protected" || value === "unclassifiable-high-risk";
}

function isQualityRequirement(value: unknown): value is QualityRequirement {
  return value === "hard" || value === "warning" || value === "optional";
}

function isQualityVerdict(value: unknown): value is QualityVerdict {
  return value === "pass" || value === "pass-with-warnings" || value === "reject";
}

function isQualityCode(value: unknown): value is QualityCode {
  return typeof value === "string" && CODE_ORDER.includes(value as QualityCode);
}
