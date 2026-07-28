import { describe, expect, it } from "vitest";
import { digest, sourceDigest, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { assessQuality } from "../../src/runtime/aili-compact/quality.js";
import { buildQualityIdentityContext, freezeMessageQualitySource } from "../../src/runtime/aili-compact/quality-source.js";

const entries: SessionLikeEntry[] = [
  { id: "user", type: "message", message: { role: "user", content: "Must keep `REC-001`; next work is tests." } },
  { id: "assistant", type: "message", message: { role: "assistant", content: "Decision: use v3. Verification passed." } },
];

describe("AILI Compact runtime quality source", () => {
  it("classifies exact selected source and builds current durable identities", () => {
    const selected = entries.map((entry) => entry.id);
    const frozen = freezeMessageQualitySource({
      entries, orderedEntryIds: selected, orderedRefs: ["m000001", "m000002"],
      catalogId: digest("catalog"), sourceDigest: sourceDigest(entries, selected), branchLeafId: "leaf", epochId: "root",
    });
    expect(frozen.facts.map((fact) => fact.class)).toEqual(["goal-constraint", "open-work", "decision", "verification"]);
    const identity = buildQualityIdentityContext({ entries, sessionId: "session", branchLeafId: "leaf", epochId: "root" });
    const summary = "Keep REC-001; next work is tests. Open work remains. Decision: use v3. Verification passed.";
    const result = assessQuality({
      version: 1, tier: "T1", catalogId: frozen.catalogId, sourceKind: "messages",
      orderedRefs: frozen.orderedRefs, sourceDigest: frozen.sourceDigest, summary,
    }, frozen, identity);
    expect(result.codes).toEqual([]);
    expect(result.verdict).toBe("pass");
    expect(JSON.stringify(result)).not.toContain("next work is tests");
  });

  it("marks credential-like source ineligible without echoing it in the result", () => {
    const secret = "api_key=PRIVATE-123456";
    const protectedEntries: SessionLikeEntry[] = [{ id: "secret", type: "message", message: { role: "user", content: `Must keep ${secret}` } }];
    const digestValue = sourceDigest(protectedEntries, ["secret"]);
    const frozen = freezeMessageQualitySource({
      entries: protectedEntries, orderedEntryIds: ["secret"], orderedRefs: ["m000001"],
      catalogId: digest("catalog"), sourceDigest: digestValue, branchLeafId: "leaf", epochId: "root",
    });
    const result = assessQuality({
      version: 1, tier: "T1", catalogId: frozen.catalogId, sourceKind: "messages",
      orderedRefs: frozen.orderedRefs, sourceDigest: frozen.sourceDigest, summary: "keep the credential",
    }, frozen, buildQualityIdentityContext({ entries: protectedEntries, sessionId: "session", branchLeafId: "leaf", epochId: "root" }));
    expect(result.codes).toEqual(["protected-source-ineligible"]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
