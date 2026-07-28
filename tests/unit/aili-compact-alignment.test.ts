import { describe, expect, it } from "vitest";
import { alignProviderMessages, alignmentFingerprint } from "../../src/runtime/aili-compact/alignment.js";

describe("AILI Compact duplicate-aware alignment", () => {
  it("ignores timestamp/display metadata and walks duplicate occurrences monotonically", () => {
    const entries = [
      { id: "one", type: "message", message: { role: "assistant", content: "same", timestamp: 1 } },
      { id: "two", type: "message", message: { role: "assistant", content: "same", timestamp: 2 } },
    ];
    const messages = [{ role: "assistant", content: "same", timestamp: 10 }, { role: "assistant", content: "same", timestamp: 11 }];
    const result = alignProviderMessages(entries, messages);
    expect(result.diagnostic).toBeUndefined();
    expect([...result.byEntryId]).toEqual([["one", 0], ["two", 1]]);
    expect(alignmentFingerprint(messages[0]!)).toBe(alignmentFingerprint(messages[1]!));
  });

  it("fails open when a duplicate could change the projection action", () => {
    const entries = [
      { id: "one", type: "message", message: { role: "assistant", content: "same" } },
      { id: "two", type: "message", message: { role: "assistant", content: "same" } },
    ];
    const result = alignProviderMessages(entries, [{ role: "assistant", content: "same" }], {
      actionForEntry: (id) => id === "one" ? "hidden" : "raw",
    });
    expect(result.diagnostic).toContain("alignment-ambiguous");
    expect(result.byEntryId.size).toBe(0);
  });

  it("treats a tool protocol atom as indivisible", () => {
    const entries = [
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "tc", name: "read", arguments: {} }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "tc", toolName: "read", content: "body" } },
    ];
    const result = alignProviderMessages(entries, [entries[0]!.message as Record<string, unknown>]);
    expect(result.diagnostic).toContain("alignment-partial-protocol");
    expect(result.byEntryId.size).toBe(0);
  });

  it("excludes the transient suffix from matching", () => {
    const entries = [{ id: "user", type: "message", message: { role: "user", content: "hello" } }];
    const messages = [entries[0]!.message as Record<string, unknown>, { role: "custom", customType: "suffix", content: "state", display: false }];
    const result = alignProviderMessages(entries, messages, { suffixCustomType: "suffix" });
    expect(result.diagnostic).toBeUndefined();
    expect(result.providerMessageVisits).toBe(1);
  });
});
