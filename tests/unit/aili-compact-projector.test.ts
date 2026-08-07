import { describe, expect, it } from "vitest";
import { alignEntriesToMessages, projectMessages, type ProjectionMessage } from "../../src/runtime/aili-compact/projector.js";
import { sourceDigest, type CompactState, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";

function projectValid<T extends ProjectionMessage>(
  messages: readonly T[],
  compactState: CompactState,
  byEntryId: ReadonlyMap<string, number>,
) {
  const entries: SessionLikeEntry[] = [...byEntryId]
    .sort((left, right) => left[1] - right[1])
    .map(([id, index]) => ({ id, type: "message", message: messages[index] }));
  const blocks = new Map([...compactState.blocks].map(([id, block]) => [id, {
    ...block,
    sourceDigest: sourceDigest(entries, block.sourceEntryIds),
  }]));
  return projectMessages(messages, { ...compactState, blocks }, byEntryId);
}

function state(): CompactState {
  return {
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
    blocks: new Map([["block", { id: "block", kind: "semantic", epochId: "root", sourceEntryIds: ["assistant"], sourceDigest: "x", summary: "summary", active: true }]]),
    diagnostics: [],
  };
}

describe("AILI Compact projector", () => {
  it("hides aligned non-protocol source while retaining user messages and stable output", () => {
    const entries: SessionLikeEntry[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "assistant", type: "message", message: { role: "assistant", content: "old answer" } },
    ];
    const messages = entries.map((entry) => entry.message as { role: string; content: string });
    const alignment = alignEntriesToMessages(entries, messages);
    const first = projectValid(messages, state(), alignment.byEntryId);
    const second = projectValid(messages, state(), alignment.byEntryId);
    expect(first.messages).toEqual([
      { role: "user", content: "question" },
      expect.objectContaining({ role: "assistant", content: [expect.objectContaining({ type: "toolCall", name: "aili_context_recap", arguments: { blockRef: "b000001" } })] }),
      expect.objectContaining({ role: "toolResult", toolName: "aili_context_recap", content: [expect.objectContaining({ text: expect.stringContaining("summary") })] }),
    ]);
    expect(first.messages).toEqual(second.messages);
    expect(first.hash).toBe(second.hash);
    expect(first.earliestChangeIndex).toBe(1);
  });

  it("fails open when a block would hide a Pi tool-call protocol message", () => {
    const messages = [
      { role: "user", content: "question" },
      { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: {} }] },
    ];
    const result = projectValid(messages, state(), new Map([["assistant", 1]]));
    expect(result.messages).toBe(messages);
    expect(result.diagnostic).toBe("invalid-tool-pair");
  });

  it("hides a complete Pi tool-call/result atom as one semantic block", () => {
    const messages = [
      { role: "user", content: "question" },
      { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "notes.txt" } }] },
      { role: "toolResult", toolCallId: "call-1", toolName: "read", content: [{ type: "text", text: "old output" }] },
      { role: "user", content: "current question" },
    ];
    const semantic: CompactState = {
      ...state(),
      blocks: new Map([["semantic", {
        id: "semantic",
        kind: "semantic",
        epochId: "root",
        sourceEntryIds: ["call", "result"],
        sourceDigest: "x",
        summary: "old tool work",
        active: true,
      }]]),
    };
    const result = projectValid(messages, semantic, new Map([["call", 1], ["result", 2]]));
    expect(result.diagnostic).toBeUndefined();
    expect(result.messages).toEqual([
      messages[0],
      expect.objectContaining({ role: "assistant", content: [expect.objectContaining({ name: "aili_context_recap", arguments: { blockRef: "b000001" } })] }),
      expect.objectContaining({ role: "toolResult", toolName: "aili_context_recap", content: [expect.objectContaining({ text: expect.stringContaining("old tool work") })] }),
      messages[3],
    ]);
  });

  it("removes a committed historical compact call/result after its recap becomes active", () => {
    const block = {
      id: "semantic",
      kind: "semantic" as const,
      epochId: "root",
      sourceEntryIds: ["assistant"],
      sourceDigest: "x",
      summary: "stable recap",
      active: true,
    };
    const messages = [
      { role: "user", content: "old question" },
      { role: "assistant", content: "old answer" },
      { role: "user", content: "current question" },
      { role: "assistant", content: [{ type: "toolCall", id: "compact-call", name: "aili_compact", arguments: { summary: "stable recap" } }] },
      { role: "toolResult", toolCallId: "compact-call", toolName: "aili_compact", content: [{ type: "text", text: "created" }], details: { contextTx: { blocks: [block] } } },
    ];
    const semantic: CompactState = { ...state(), blocks: new Map([[block.id, block]]) };
    const result = projectValid(messages, semantic, new Map([["assistant", 1]]));
    expect(result.diagnostic).toBeUndefined();
    expect(JSON.stringify(result.messages)).not.toContain("compact-call");
    expect(JSON.stringify(result.messages)).not.toContain('"summary":"stable recap"');
    expect(JSON.stringify(result.messages)).toContain("stable recap");
  });

  it("cools only a paired tool result and preserves Pi's content-array shape", () => {
    const messages = [
      { role: "user", content: "question" },
      { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: {} }] },
      { role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "very large result" }] },
    ];
    const cooling: CompactState = {
      ...state(),
      blocks: new Map([["cool", {
        id: "cool",
        kind: "cool",
        epochId: "root",
        sourceEntryIds: ["result"],
        sourceDigest: "x",
        summary: "consumed result",
        stub: "bounded stub",
        active: true,
      }]]),
    };
    const result = projectValid(messages, cooling, new Map([["result", 2]]));
    expect(result.diagnostic).toBeUndefined();
    expect(result.messages).toEqual([
      messages[0],
      messages[1],
      { ...messages[2], content: [{ type: "text", text: "bounded stub" }] },
    ]);
  });

  it("fails open rather than cooling an unpaired tool result", () => {
    const messages = [
      { role: "user", content: "question" },
      { role: "toolResult", toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "result" }] },
    ];
    const cooling: CompactState = {
      ...state(),
      blocks: new Map([["cool", {
        id: "cool",
        kind: "cool",
        epochId: "root",
        sourceEntryIds: ["result"],
        sourceDigest: "x",
        summary: "result",
        stub: "bounded stub",
        active: true,
      }]]),
    };
    const result = projectValid(messages, cooling, new Map([["result", 1]]));
    expect(result.messages).toBe(messages);
    expect(result.diagnostic).toBe("invalid-tool-pair");
  });

  it("fails open when projected output would contain an unpaired tool result", () => {
    const messages = [
      { role: "user", content: "question" },
      { role: "toolResult", toolCallId: "missing", toolName: "read", content: [{ type: "text", text: "orphan" }] },
    ];
    const empty: CompactState = { ...state(), blocks: new Map() };
    const result = projectMessages(messages, empty, new Map());
    expect(result.messages).toBe(messages);
    expect(result.diagnostic).toBe("invalid-tool-pair");
  });

  it("returns the exact input references with no partial output for every whole-output fault", () => {
    const base = [
      { role: "user", content: "old question" },
      { role: "assistant", content: "old answer" },
      { role: "user", content: "current question" },
    ];
    const validMap = new Map([["old-user", 0], ["assistant", 1], ["current-user", 2]]);
    const semantic = state();
    const validBlock = semantic.blocks.get("block")!;
    const cases: Array<{ expected: string; messages: readonly any[]; run: () => ReturnType<typeof projectMessages> }> = [
      {
        expected: "invalid-role",
        messages: [{ role: "user", content: "question" }, { role: 7, content: "bad" }],
        run() { return projectMessages(this.messages, { ...state(), blocks: new Map() }, new Map()); },
      },
      {
        expected: "missing-user-message",
        messages: [{ role: "assistant", content: "answer" }],
        run() { return projectMessages(this.messages, { ...state(), blocks: new Map() }, new Map()); },
      },
      {
        expected: "invalid-tool-pair",
        messages: [
          { role: "user", content: "question" },
          { role: "assistant", content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }] },
          { role: "toolResult", toolCallId: "call", toolName: "write", content: "result" },
        ],
        run() { return projectMessages(this.messages, { ...state(), blocks: new Map() }, new Map()); },
      },
      {
        expected: "invalid-role-order",
        messages: [
          { role: "user", content: "question" },
          { role: "assistant", content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }] },
          { role: "user", content: "interleaved" },
          { role: "toolResult", toolCallId: "call", toolName: "read", content: "result" },
        ],
        run() { return projectMessages(this.messages, { ...state(), blocks: new Map() }, new Map()); },
      },
      {
        expected: "unaligned-block:block",
        messages: base,
        run() { return projectMessages(this.messages, semantic, new Map()); },
      },
      {
        expected: "digest-mismatch:block",
        messages: base,
        run() { return projectMessages(this.messages, semantic, validMap); },
      },
      {
        expected: "invalid-recap-anchor:block",
        messages: base,
        run() {
          const withBadAnchor = { ...validBlock, anchorEntryId: "missing" };
          return projectValid(this.messages, { ...semantic, blocks: new Map([["block", withBadAnchor]]) }, validMap);
        },
      },
      {
        expected: "protected-range:block",
        messages: base,
        run() {
          const protectedBlock = { ...validBlock, sourceEntryIds: ["current-user"], anchorEntryId: "current-user" };
          return projectValid(this.messages, { ...semantic, blocks: new Map([["block", protectedBlock]]) }, validMap);
        },
      },
    ];

    for (const fault of cases) {
      const before = JSON.stringify(fault.messages);
      const result = fault.run();
      expect(result.diagnostic, fault.expected).toBe(fault.expected);
      expect(result.messages, fault.expected).toBe(fault.messages);
      expect(result.messages.every((message, index) => message === fault.messages[index]), fault.expected).toBe(true);
      expect(JSON.stringify(fault.messages), fault.expected).toBe(before);
      expect(result.earliestChangeIndex, fault.expected).toBeUndefined();
    }
  });

  it("preserves unmatched external message references and does not mutate source during canonical repeated projection", () => {
    const external = Object.freeze({ role: "system", content: "external policy", providerTag: "untouched" });
    const messages = [
      external,
      Object.freeze({ role: "user", content: "question" }),
      Object.freeze({ role: "assistant", content: "old answer" }),
    ];
    const byEntryId = new Map([["user", 1], ["assistant", 2]]);
    const before = JSON.stringify(messages);
    const first = projectValid(messages, state(), byEntryId);
    const second = projectValid(messages, state(), byEntryId);
    expect(first.diagnostic).toBeUndefined();
    expect(first.messages[0]).toBe(external);
    expect(second.messages).toEqual(first.messages);
    expect(second.hash).toBe(first.hash);
    expect(JSON.stringify(messages)).toBe(before);
    expect(messages[0]).toBe(external);
  });

  it("reports ambiguous entry/message fingerprints without mutating or replacing input references", () => {
    const repeated = { role: "assistant", content: "same" };
    const external = { role: "system", content: "external" };
    const messages = [external, repeated, { ...repeated }];
    const before = JSON.stringify(messages);
    const alignment = alignEntriesToMessages([{ id: "entry", type: "message", message: repeated }], messages);
    expect(alignment.diagnostic).toBe("ambiguous-entry:entry");
    expect(JSON.stringify(messages)).toBe(before);
    expect(messages[0]).toBe(external);
    expect(messages[1]).toBe(repeated);
  });
});
