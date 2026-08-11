import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  QUALITY_EVALUATOR_VERSION,
  QUALITY_EXTRACTOR_VERSION,
  assessQuality,
  canonicalQualityDurableRef,
  evaluateQuality,
  extractQualityManifest,
  hasMalformedUtf16,
  isQualityInput,
  isQualityManifest,
  isQualityResult,
  normalizeQualityText,
  parseQualityManifest,
  parseQualityResult,
  qualityFactDigest,
  qualityRequirement,
  type FrozenQualityFactV1,
  type FrozenQualitySourceV1,
  type MessageQualityRefV1,
  type QualityDurableRefV1,
  type QualityIdentityContextV1,
  type QualityInputV1,
  type QualityManifestV1,
  type QualityTier,
} from "../../src/runtime/aili-compact/quality.js";

const hash = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const PATH_DIGEST = hash("/canonical/session.jsonl");
const SOURCE_DIGEST = hash("frozen-source-v1");

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function canonicalHash(value: unknown): string {
  return hash(canonical(value));
}

const messageRef: MessageQualityRefV1 = {
  kind: "message",
  branchLeafId: "branch-current",
  epochId: "epoch-current",
  entryId: "entry-message",
};

function context(): QualityIdentityContextV1 {
  return {
    version: 1,
    sessionId: "session-current",
    branchLeafId: "branch-current",
    epochId: "epoch-current",
    canonicalSessionPathDigest: PATH_DIGEST,
    agentIds: ["agent-current"],
    jobIds: ["job-current"],
    turnEntryIds: ["entry-turn"],
    messageEntryIds: ["entry-message"],
    historyEntryIds: ["entry-history"],
  };
}

function input(summary: string, tier: QualityTier = "T1"): QualityInputV1 {
  return {
    version: 1,
    tier,
    catalogId: "catalog-current",
    sourceKind: tier === "T1" ? "messages" : "blocks",
    orderedRefs: [tier === "T1" ? "m000001" : "b000001"],
    sourceDigest: SOURCE_DIGEST,
    summary,
  };
}

function fact(overrides: Partial<FrozenQualityFactV1> = {}): FrozenQualityFactV1 {
  return {
    class: "goal-constraint",
    durableRefs: [messageRef],
    text: "Ship safely",
    anchors: ["Ship safely"],
    current: true,
    releaseRelevant: true,
    status: "active",
    eligibility: "eligible",
    ...overrides,
  };
}

function source(facts: FrozenQualityFactV1[], tier: QualityTier = "T1"): FrozenQualitySourceV1 {
  return {
    version: 1,
    catalogId: "catalog-current",
    sourceKind: tier === "T1" ? "messages" : "blocks",
    orderedRefs: [tier === "T1" ? "m000001" : "b000001"],
    sourceDigest: SOURCE_DIGEST,
    facts,
  };
}

function manifestFor(
  qualityInput: QualityInputV1,
  frozenSource: FrozenQualitySourceV1,
  identity = context(),
): QualityManifestV1 {
  const result = extractQualityManifest(qualityInput, frozenSource, identity);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result.manifest;
}

describe("closed quality contracts", () => {
  it("rejects caller manifests, unknown fields, unknown versions, and malformed nested results", () => {
    const qualityInput = input("Ship safely");
    expect(isQualityInput(qualityInput)).toBe(true);
    expect(isQualityInput({ ...qualityInput, manifest: { forged: true } })).toBe(false);
    expect(isQualityInput({ ...qualityInput, version: 2 })).toBe(false);
    expect(isQualityInput({ ...qualityInput, tier: "T2", sourceKind: "messages" })).toBe(false);

    const frozenSource = source([fact()]);
    const manifest = manifestFor(qualityInput, frozenSource);
    expect(isQualityManifest(manifest)).toBe(true);
    expect(parseQualityManifest({ ...manifest, unknown: true })).toBeUndefined();
    expect(parseQualityManifest({ ...manifest, extractorVersion: "unknown" })).toBeUndefined();
    expect(parseQualityManifest({ ...manifest, facts: [{ ...manifest.facts[0], rawText: "must not persist" }] })).toBeUndefined();

    const result = assessQuality(qualityInput, frozenSource, context());
    expect(result.verdict).toBe("pass");
    expect(isQualityResult(result)).toBe(true);
    expect(parseQualityResult({ ...result, unknown: true })).toBeUndefined();
    expect(parseQualityResult({ ...result, qualityEvidence: { ...result.qualityEvidence, rawSource: "leak" } })).toBeUndefined();
    expect(parseQualityResult({ ...result, evaluatorVersion: "unknown" })).toBeUndefined();
  });

  it("extracts quality input through exactly 18,000 semantic-summary UTF-16 characters", () => {
    const summary = `Ship safely ${"s".repeat(18_000 - "Ship safely ".length)}`;
    expect(summary).toHaveLength(18_000);
    expect(extractQualityManifest(input(summary), source([fact()]), context())).toEqual(expect.objectContaining({ ok: true }));
    expect(isQualityInput(input("s".repeat(18_001)))).toBe(false);
  });

  it("uses tierless active-block quality identity for new writes while retaining legacy tier parsing", () => {
    const activeInput: QualityInputV1 = {
      version: 1,
      semantics: "active-block",
      catalogId: "catalog-current",
      sourceKind: "messages",
      orderedRefs: ["m000001"],
      sourceDigest: SOURCE_DIGEST,
      summary: "Ship safely",
    };
    expect(isQualityInput(activeInput)).toBe(true);
    expect(isQualityInput({ ...activeInput, tier: "T1" })).toBe(false);
    const result = assessQuality(activeInput, source([fact()]), context());
    expect(result.qualityEvidence).toMatchObject({ semantics: "active-block" });
    expect(result.qualityEvidence).not.toHaveProperty("tier");
    expect(qualityRequirement("active-block", "verification", false, false)).toBe("warning");
    expect(qualityRequirement("active-block", "verification", false, true)).toBe("hard");
  });
});

describe("exact normalization, digest framing, and UTF-16 spans", () => {
  it("uses NFC/newline normalization without trimming, collapsing, or case folding", () => {
    expect(normalizeQualityText("  A  Cafe\u0301\r\nB\rC  ")).toBe("  A  Café\nB\nC  ");
    expect(normalizeQualityText("ABC")).not.toBe(normalizeQualityText("abc"));
    expect(hasMalformedUtf16("ok 🔐")).toBe(false);
    expect(hasMalformedUtf16("bad \ud800")).toBe(true);
    expect(() => normalizeQualityText("bad \udc00")).toThrow(/surrogate/);
  });

  it("matches an independently written golden manifest across NFC composition and an emoji pair", () => {
    const summary = "Cafe\u0301 🔐";
    const qualityInput = input(summary);
    const durableRef: MessageQualityRefV1 = { ...messageRef };
    const frozenSource = source([fact({ text: "Café 🔐", anchors: ["Café 🔐"] })]);
    const extraction = extractQualityManifest(qualityInput, frozenSource, context());
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) return;

    const normalizedText = "Café 🔐";
    const durableIdentity = "message=branch-current/epoch-current/entry-message";
    const sourceFactDigest = hash(`goal-constraint\u0000${durableIdentity}\u0000${normalizedText}`);
    const manuallyWrittenFact = {
      factId: canonicalHash({ class: "goal-constraint", durableRefs: [durableRef], sourceFactDigests: [sourceFactDigest] }),
      class: "goal-constraint" as const,
      durableRefs: [durableRef],
      sourceFactDigests: [sourceFactDigest],
      normalizedAnchors: [normalizedText],
      anchorDigests: [hash(normalizedText)],
      current: true,
      releaseRelevant: true,
      status: "active" as const,
      summarySpanUtf16: { start: 0, end: 8 },
      summarySpanDigest: hash(normalizedText),
    };
    expect(extraction.manifest).toEqual({
      version: 1,
      extractorVersion: QUALITY_EXTRACTOR_VERSION,
      sourceDigest: SOURCE_DIGEST,
      facts: [manuallyWrittenFact],
    });
    expect(summary.length).toBe(8);
    expect(summary.slice(6).length).toBe(2);
    expect(qualityFactDigest("goal-constraint", durableRef, "Cafe\u0301 🔐")).toBe(sourceFactDigest);
  });

  it("maps CRLF spans against the unchanged summary and digests their normalized slices", () => {
    const summary = "before\r\nShip safely\rAfter";
    const manifest = manifestFor(input(summary), source([fact()]));
    expect(manifest.facts[0]?.summarySpanUtf16).toEqual({ start: 8, end: 19 });
    expect(manifest.facts[0]?.summarySpanDigest).toBe(hash("Ship safely"));
  });
});

describe("exact durable reference identities", () => {
  const allRefs: QualityDurableRefV1[] = [
    { kind: "agent", sessionId: "session-current", agentId: "agent-current" },
    { kind: "job", sessionId: "session-current", jobId: "job-current" },
    { kind: "turn", branchLeafId: "branch-current", turnEntryId: "entry-turn" },
    messageRef,
    { kind: "history", canonicalSessionPathDigest: PATH_DIGEST, branchLeafId: "branch-current", entryId: "entry-history" },
  ];

  it("accepts all five canonical kinds and rejects aliases, stale IDs, branches, and epochs", () => {
    const valid = extractQualityManifest(input("Ship safely"), source([fact({ durableRefs: allRefs })]), context());
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.manifest.facts[0]?.durableRefs.map(canonicalQualityDurableRef)).toEqual([
        "agent=session-current/agent-current",
        `history=${PATH_DIGEST}/branch-current/entry-history`,
        "job=session-current/job-current",
        "message=branch-current/epoch-current/entry-message",
        "turn=branch-current/entry-turn",
      ]);
    }

    const stale = extractQualityManifest(input("Ship safely"), source([fact({
      durableRefs: [{ ...messageRef, branchLeafId: "branch-stale" }],
    })]), context());
    expect(stale).toEqual({ ok: false, code: "invalid-durable-ref" });

    const wrongEpoch = extractQualityManifest(input("Ship safely"), source([fact({
      durableRefs: [{ ...messageRef, epochId: "epoch-stale" }],
    })]), context());
    expect(wrongEpoch).toEqual({ ok: false, code: "invalid-durable-ref" });

    const alias = structuredClone(source([fact()])) as unknown as { facts: Array<Record<string, unknown>> };
    alias.facts[0]!.durableRefs = [{ kind: "message", displayRef: "m000001" }];
    expect(extractQualityManifest(input("Ship safely"), alias, context()))
      .toEqual({ ok: false, code: "invalid-frozen-source" });
  });
});

describe("tier policy, deterministic scoring, and redacted failure", () => {
  it("rejects a missing hard blocker and never returns source/fact text", () => {
    const secretMarker = "PRIVATE-BLOCKER-BODY-7291";
    const qualityInput = input("A harmless recap");
    const frozenSource = source([fact({
      class: "failure-blocker",
      text: secretMarker,
      anchors: [secretMarker],
      status: "failed",
    })]);
    const result = assessQuality(qualityInput, frozenSource, context());
    expect(result.verdict).toBe("reject");
    expect(result.codes).toContain("missing-hard-fact");
    expect(result.counts).toEqual(expect.objectContaining({ hardFacts: 1, missingHardFacts: 1, scorePermille: 0 }));
    expect(result.qualityEvidence.facts).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(secretMarker);
    expect(isQualityResult(result)).toBe(true);
  });

  it("commits warning-only loss with bounded evidence and a stable weighted score", () => {
    const qualityInput = input("Ship safely");
    const frozenSource = source([
      fact(),
      fact({
        class: "resolved-detail",
        text: "Old chronology detail",
        anchors: ["Old chronology detail"],
        current: false,
        releaseRelevant: false,
        status: "resolved",
      }),
    ]);
    const result = assessQuality(qualityInput, frozenSource, context());
    expect(result.verdict).toBe("pass-with-warnings");
    expect(result.codes).toEqual(["warning-fact-omitted"]);
    expect(result.counts).toEqual(expect.objectContaining({
      hardFacts: 1,
      warningFacts: 1,
      coveredHardFacts: 1,
      missingWarningFacts: 1,
      scorePermille: 800,
    }));
    expect(result.qualityEvidence.facts).toHaveLength(2);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Ship safely");
    expect(serialized).not.toContain("Old chronology detail");
    expect(serialized).not.toContain("normalizedAnchors");
    expect(isQualityResult(result)).toBe(true);
  });

  it("implements the accepted tier-specific hard, warning, and optional matrix", () => {
    expect(qualityRequirement("T1", "verification", false, false)).toBe("warning");
    expect(qualityRequirement("T1", "verification", true, false)).toBe("hard");
    expect(qualityRequirement("T2", "verification", false, false)).toBe("warning");
    expect(qualityRequirement("T2", "verification", false, true)).toBe("hard");
    expect(qualityRequirement("T3", "verification", false, false)).toBe("hard");
    expect(qualityRequirement("T3", "artifact-symbol", false, false)).toBe("warning");
    expect(qualityRequirement("T3", "artifact-symbol", true, false)).toBe("hard");
    expect(qualityRequirement("T2", "protocol-provenance", false, false)).toBe("hard");
    expect(qualityRequirement("T3", "resolved-detail", false, false)).toBe("optional");
    expect(qualityRequirement("T3", "resolved-detail", false, false, "warning")).toBe("warning");
  });

  it("rejects a T3 completion claim that contradicts Unverified source status", () => {
    const qualityInput = input("release complete and passing", "T3");
    const frozenSource = source([fact({
      class: "verification",
      text: "release status unverified",
      anchors: ["release"],
      status: "unverified",
      current: true,
    })], "T3");
    const result = assessQuality(qualityInput, frozenSource, context());
    expect(result.verdict).toBe("reject");
    expect(result.codes).toEqual(["contradictory-status"]);
    expect(result.counts.missingHardFacts).toBe(0);
    expect(result.qualityEvidence.facts).toEqual([]);
  });

  it("rejects protected and unclassifiable source without echoing it", () => {
    const protectedText = "token=do-not-echo-485";
    const protectedResult = assessQuality(input("summary"), source([fact({
      text: protectedText,
      anchors: [protectedText],
      eligibility: "credential",
    })]), context());
    expect(protectedResult.codes).toEqual(["protected-source-ineligible"]);
    expect(JSON.stringify(protectedResult)).not.toContain(protectedText);

    const highRisk = assessQuality(input("summary"), source([fact({ eligibility: "unclassifiable-high-risk" })]), context());
    expect(highRisk.codes).toEqual(["unclassifiable-high-risk"]);
  });
});

describe("fail-closed span and evaluator boundaries", () => {
  it("rejects malformed surrogates, ambiguous anchors, and the 257th fact", () => {
    expect(extractQualityManifest(input("bad \ud800"), source([fact()]), context()))
      .toEqual({ ok: false, code: "malformed-surrogate" });
    expect(extractQualityManifest(input("Ship safely then Ship safely"), source([fact()]), context()))
      .toEqual({ ok: false, code: "ambiguous-match" });
    expect(extractQualityManifest(input("none"), source(Array.from({ length: 257 }, (_, index) => fact({
      text: `fact-${index}`,
      anchors: [`fact-${index}`],
    }))), context())).toEqual({ ok: false, code: "fact-limit-exceeded" });
  });

  it("rejects out-of-bounds, split-surrogate, overlapping, and tampered spans", () => {
    const summary = "alpha 🔐 beta";
    const qualityInput = input(summary);
    const frozenSource = source([
      fact({ text: "🔐", anchors: ["🔐"] }),
      fact({ class: "decision", text: "beta", anchors: ["beta"] }),
    ]);
    const manifest = manifestFor(qualityInput, frozenSource);

    const outOfBounds = structuredClone(manifest);
    outOfBounds.facts[0]!.summarySpanUtf16 = { start: 6, end: 99 };
    expect(evaluateQuality(qualityInput, outOfBounds, frozenSource, context()).codes).toEqual(["invalid-span"]);

    const splitSurrogate = structuredClone(manifest);
    splitSurrogate.facts[0]!.summarySpanUtf16 = { start: 7, end: 8 };
    expect(evaluateQuality(qualityInput, splitSurrogate, frozenSource, context()).codes).toEqual(["invalid-span"]);

    const overlap = structuredClone(manifest);
    overlap.facts[1]!.summarySpanUtf16 = { start: 0, end: summary.length };
    overlap.facts[1]!.summarySpanDigest = hash(normalizeQualityText(summary));
    expect(evaluateQuality(qualityInput, overlap, frozenSource, context()).codes).toEqual(["overlapping-span"]);

    const tamperedDigest = structuredClone(manifest);
    tamperedDigest.facts[0]!.summarySpanDigest = hash("different");
    expect(evaluateQuality(qualityInput, tamperedDigest, frozenSource, context()).codes).toEqual(["span-digest-mismatch"]);

    const tamperedAnchor = structuredClone(manifest);
    tamperedAnchor.facts[0]!.normalizedAnchors = ["missing"];
    tamperedAnchor.facts[0]!.anchorDigests = [hash("missing")];
    expect(evaluateQuality(qualityInput, tamperedAnchor, frozenSource, context()).codes).toEqual(["anchor-mismatch"]);
  });

  it("fails closed when extractor/evaluator is unavailable or an evaluator boundary throws", () => {
    const qualityInput = input("Ship safely");
    const frozenSource = source([fact()]);
    const manifest = manifestFor(qualityInput, frozenSource);
    expect(assessQuality(qualityInput, frozenSource, context(), { extractorAvailable: false }).codes)
      .toEqual(["extractor-unavailable"]);
    expect(evaluateQuality(qualityInput, manifest, frozenSource, context(), { evaluatorAvailable: false }).codes)
      .toEqual(["evaluator-unavailable"]);

    const throwingOptions = new Proxy({}, { get: () => { throw new Error("fault injection"); } });
    const result = evaluateQuality(qualityInput, manifest, frozenSource, context(), throwingOptions);
    expect(result.verdict).toBe("reject");
    expect(result.codes).toEqual(["evaluator-error"]);
    expect(result.evaluatorVersion).toBe(QUALITY_EVALUATOR_VERSION);
  });
});
