import { describe, expect, it } from "vitest";
import { cacheIdentity } from "../../src/runtime/aili-compact/cache.js";
import { sourceDigest, type CompactBlock, type CompactState, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { alignEntriesToMessages, projectMessages, type ProjectionMessage } from "../../src/runtime/aili-compact/projector.js";

function state(blocks: CompactBlock[]): CompactState {
  return {
    epochId: "root", enabled: true, autoCooling: true, manualMode: false, cachePanel: false,
    hasSessionControl: false, hasAutoCoolingControl: false, hasManualControl: false, hasPanelControl: false,
    blocks: new Map(blocks.map((block) => [block.id, block])), policyDecisions: [], diagnostics: [],
  };
}

function identity(projectionHash: string): string {
  return cacheIdentity({
    providerId: "fixture", modelId: "fixture", sessionId: "session", branchLeafId: "leaf",
    branchSourceDigest: "branch", epochId: "root", projectionHash, guidanceFingerprint: "guidance",
    activeTools: [{ name: "aili_compact", description: "fixture", parameterSchema: { type: "object" }, immutablePrompt: ["sole call"] }],
  });
}

describe("AILI Compact cache-safe projection sequences", () => {
  it("keeps grouped cooling canonical for unchanged inputs and exposes a deliberate earliest change", () => {
    const entries: SessionLikeEntry[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "calls", type: "message", message: { role: "assistant", content: [
        { type: "toolCall", id: "read-1", name: "read", arguments: {} },
        { type: "toolCall", id: "read-2", name: "read", arguments: {} },
      ] } },
      { id: "result-1", type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "one" }] } },
      { id: "result-2", type: "message", message: { role: "toolResult", toolCallId: "read-2", toolName: "read", content: [{ type: "text", text: "two" }] } },
      { id: "consumed", type: "message", message: { role: "assistant", content: "done" } },
    ];
    const blocks: CompactBlock[] = ["result-1", "result-2"].map((id) => ({
      id: `cool:${id}`, kind: "cool", epochId: "root", sourceEntryIds: [id],
      sourceDigest: sourceDigest(entries, [id]), summary: "consumed", stub: `stub:${id}`, active: true,
    }));
    const messages = entries.map((entry) => entry.message as ProjectionMessage);
    const alignment = alignEntriesToMessages(entries, messages);
    const first = projectMessages(messages, state(blocks), alignment.byEntryId);
    const second = projectMessages(messages, state(blocks), alignment.byEntryId);
    expect(first.diagnostic).toBeUndefined();
    expect(first.hash).toBe(second.hash);
    expect(first.messages).toEqual(second.messages);
    expect(first.earliestChangeIndex).toBe(2);
    expect(identity(first.hash)).toBe(identity(second.hash));
    expect(identity(first.hash)).not.toBe(identity(projectMessages(messages, state([]), alignment.byEntryId).hash));
  });

  it("keeps recap insertion and stale compact-call cleanup canonical without raw-source duplication", () => {
    const source: SessionLikeEntry = { id: "source", type: "message", message: { role: "assistant", content: "RAW_SOURCE" } };
    const transaction = {
      schema: "aili.compact.tx.v2", id: "compact-1", kind: "compact", epochId: "root",
      blocks: [{ id: "block", kind: "semantic", epochId: "root", sourceEntryIds: ["source"], sourceDigest: sourceDigest([source], ["source"]), summary: "VISIBLE_RECAP", active: true }],
    };
    const entries: SessionLikeEntry[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } }, source,
      { id: "compact-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "compact-1", name: "aili_compact", arguments: { summary: "VISIBLE_RECAP" } }] } },
      { id: "compact-result", type: "message", message: { role: "toolResult", toolCallId: "compact-1", toolName: "aili_compact", content: "created", isError: false, details: { contextTx: transaction } } },
      { id: "current", type: "message", message: { role: "user", content: "current" } },
    ];
    const semantic: CompactBlock = {
      id: "block", kind: "semantic", epochId: "root", sourceEntryIds: ["source"], sourceDigest: sourceDigest(entries, ["source"]),
      summary: "VISIBLE_RECAP", active: true, mode: "message", topic: "topic", batchTopic: "batch", anchorEntryId: "source", runId: "compact-1", childBlockIds: [], generation: "young", survivedCount: 0, age: 0,
    };
    const messages = entries.map((entry) => entry.message as ProjectionMessage);
    const alignment = alignEntriesToMessages(entries, messages);
    const projected = projectMessages(messages, state([semantic]), alignment.byEntryId);
    expect(projected.diagnostic).toBeUndefined();
    expect(JSON.stringify(projected.messages)).toContain("VISIBLE_RECAP");
    expect(JSON.stringify(projected.messages)).not.toContain("RAW_SOURCE");
    expect(JSON.stringify(projected.messages)).not.toContain('"name":"aili_compact"');
    expect(projectMessages(messages, state([semantic]), alignment.byEntryId).hash).toBe(projected.hash);
  });
});
