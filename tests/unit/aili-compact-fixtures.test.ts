import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyCacheTelemetry, recordCacheTelemetry } from "../../src/runtime/aili-compact/cache.js";
import { isCompactTransaction, sourceDigest, type CompactState, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { alignEntriesToMessages, projectMessages, type ProjectionMessage } from "../../src/runtime/aili-compact/projector.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/aili-compact/${name}`, import.meta.url), "utf8")) as T;
}

describe("AILI Compact synthetic fixtures", () => {
  it("keeps linear and branch histories distinct", () => {
    const linear = fixture<{ entries: SessionLikeEntry[] }>("linear.json");
    const branches = fixture<{ root: SessionLikeEntry[]; transactionBranch: SessionLikeEntry[]; alternateBranch: SessionLikeEntry[] }>("branched.json");
    expect(linear.entries.map((entry) => entry.id)).toEqual(["linear-user", "linear-assistant"]);
    expect(branches.transactionBranch.at(-1)?.id).toBe("branch-assistant");
    expect(branches.alternateBranch.at(-1)?.id).toBe("alternate-user");
  });

  it("keeps malformed transactions inert and recognizes a native epoch", () => {
    const malformed = fixture<{ transactions: unknown[] }>("malformed.json");
    const compacted = fixture<{ entries: SessionLikeEntry[] }>("compacted.json");
    expect(malformed.transactions.every((transaction) => !isCompactTransaction(transaction))).toBe(true);
    expect(reduceCompactState(compacted.entries).epochId).toBe("native-epoch");
  });

  it("preserves a protocol call while applying a deterministic result stub", () => {
    const { entries } = fixture<{ entries: SessionLikeEntry[] }>("protocol-heavy.json");
    const messages = entries.map((entry) => entry.message as ProjectionMessage);
    const alignment = alignEntriesToMessages(entries, messages);
    const state: CompactState = {
      epochId: "root",
      enabled: true,
      autoCooling: true,
      manualMode: false,
      cachePanel: false,
      hasSessionControl: false,
      hasAutoCoolingControl: false,
      hasManualControl: false,
      hasPanelControl: false,
      policyDecisions: [],
      blocks: new Map([["cool", {
        id: "cool",
        kind: "cool",
        epochId: "root",
        sourceEntryIds: ["protocol-result"],
        sourceDigest: sourceDigest(entries, ["protocol-result"]),
        summary: "consumed synthetic result",
        stub: "bounded fixture stub",
        active: true,
      }]]),
      diagnostics: [],
    };
    const projected = projectMessages(messages, state, alignment.byEntryId);
    expect(projected.diagnostic).toBeUndefined();
    expect(projected.messages[1]).toEqual(messages[1]);
    expect(projected.messages[2]).toEqual({
      ...messages[2],
      content: [{ type: "text", text: "bounded fixture stub" }],
    });
  });

  it("accounts for eligible, cold, and missing cache telemetry separately", () => {
    const telemetryFixture = fixture<{ eligibleUsage: { input: number; cacheRead: number; cacheWrite: number }; coldUsage: { input: number; cacheRead: number; cacheWrite: number }; missingUsage: null }>("cache-telemetry.json");
    const eligible = recordCacheTelemetry(emptyCacheTelemetry(), telemetryFixture.eligibleUsage, true, undefined);
    const cold = recordCacheTelemetry(eligible, telemetryFixture.coldUsage, false, "cold");
    const final = recordCacheTelemetry(cold, telemetryFixture.missingUsage ?? undefined, false, "missing-telemetry");
    expect(final).toMatchObject({ eligible: 1, ineligibleCold: 1, unavailable: 1, hitRate: undefined });
    expect(final.window).toHaveLength(1);
  });
});
