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

  it("keeps exact selected durable refs valid beyond a 256-entry unrelated branch", () => {
    const unrelated = Array.from({ length: 300 }, (_, index): SessionLikeEntry => ({
      id: `unrelated-${index}`,
      type: "message",
      message: { role: "assistant", content: `neutral-${index}` },
    }));
    const selectedEntries: SessionLikeEntry[] = [{
      id: "selected",
      type: "message",
      message: { role: "user", content: "Must retain `SELECTED-001`." },
    }];
    const branch = [...unrelated, ...selectedEntries];
    const frozen = freezeMessageQualitySource({
      entries: branch,
      orderedEntryIds: ["selected"],
      orderedRefs: ["m000301"],
      catalogId: digest("large-catalog"),
      sourceDigest: sourceDigest(branch, ["selected"]),
      branchLeafId: "leaf",
      epochId: "root",
    });
    const scopedIdentity = buildQualityIdentityContext({
      entries: selectedEntries,
      sessionId: "session",
      branchLeafId: "leaf",
      epochId: "root",
    });
    const result = assessQuality({
      version: 1,
      tier: "T1",
      catalogId: frozen.catalogId,
      sourceKind: "messages",
      orderedRefs: frozen.orderedRefs,
      sourceDigest: frozen.sourceDigest,
      summary: "Retain SELECTED-001.",
    }, frozen, scopedIdentity);
    expect(result.verdict).toBe("pass");

    const staleFrozen = freezeMessageQualitySource({
      entries: branch,
      orderedEntryIds: ["unrelated-0"],
      orderedRefs: ["m000001"],
      catalogId: digest("large-catalog"),
      sourceDigest: sourceDigest(branch, ["unrelated-0"]),
      branchLeafId: "leaf",
      epochId: "root",
    });
    const stale = assessQuality({
      version: 1,
      tier: "T1",
      catalogId: staleFrozen.catalogId,
      sourceKind: "messages",
      orderedRefs: staleFrozen.orderedRefs,
      sourceDigest: staleFrozen.sourceDigest,
      summary: "neutral-0",
    }, staleFrozen, scopedIdentity);
    expect(stale.codes).toEqual(["invalid-durable-ref"]);
  });
});
