import { describe, expect, it } from "vitest";

import type { SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { buildProtocolAtoms } from "../../src/runtime/aili-compact/protocol-atoms.js";

const entry = (id: string, message: unknown): SessionLikeEntry => ({ id, type: "message", message });
const message = (id: string, role: string, content: unknown): SessionLikeEntry => entry(id, { role, content });
const call = (id: string, calls: readonly { id: string; name: string }[]): SessionLikeEntry => entry(id, {
  role: "assistant",
  content: calls.map((item) => ({ type: "toolCall", ...item, arguments: {} })),
});
const result = (id: string, toolCallId: string, toolName: string, content: unknown = "ok"): SessionLikeEntry => entry(id, {
  role: "toolResult",
  toolCallId,
  toolName,
  content,
});

describe("AILI Compact protocol atom builder", () => {
  it("keeps ordinary and summary messages in deterministic source order", () => {
    const entries: SessionLikeEntry[] = [
      message("u", "user", "question"),
      { id: "metadata", type: "custom", data: { ignored: true } },
      message("a", "assistant", "answer"),
      message("summary", "custom", "checkpoint summary"),
    ];
    const first = buildProtocolAtoms(entries);
    const second = buildProtocolAtoms(entries);

    expect(first.atoms.map((atom) => ({ id: atom.atomId, kind: atom.kind, entries: atom.entryIds }))).toEqual([
      { id: "a000001", kind: "message", entries: ["u"] },
      { id: "a000002", kind: "message", entries: ["a"] },
      { id: "a000003", kind: "summary", entries: ["summary"] },
    ]);
    expect(first.providerEntryCount).toBe(3);
    expect(first.sourceDigest).toBe(second.sourceDigest);
    expect(first.atoms.map((atom) => atom.sourceDigest)).toEqual(second.atoms.map((atom) => atom.sourceDigest));
    expect(first.entryToAtomId.get("a")).toBe("a000002");
  });

  it("groups an assistant's sibling calls with every matching result as one atom", () => {
    const built = buildProtocolAtoms([
      call("caller", [{ id: "read-1", name: "read" }, { id: "grep-1", name: "grep" }]),
      result("grep-result", "grep-1", "GREP"),
      result("read-result", "read-1", "read"),
      message("after", "assistant", "done"),
    ]);

    expect(built.atoms).toHaveLength(2);
    expect(built.atoms[0]).toEqual(expect.objectContaining({
      kind: "tool-protocol",
      entryIds: ["caller", "grep-result", "read-result"],
      toolCallIds: ["read-1", "grep-1"],
      structuredToolPartCount: 4,
      hardProtected: false,
      protectionReasons: [],
      turnState: "tool-open",
    }));
  });

  it("hard-protects an incomplete sibling group as one remainder atom", () => {
    const built = buildProtocolAtoms([
      call("caller", [{ id: "one", name: "read" }, { id: "two", name: "grep" }]),
      result("one-result", "one", "read"),
      message("next", "user", "continue"),
    ]);

    expect(built.atoms[0]).toEqual(expect.objectContaining({
      kind: "remainder",
      entryIds: ["caller", "one-result"],
      hardProtected: true,
      protectionReasons: expect.arrayContaining(["incomplete-tool-protocol"]),
    }));
    expect(built.atoms[1]!.entryIds).toEqual(["next"]);
  });

  it("fails closed for duplicate, malformed, and orphan protocol metadata", () => {
    const duplicateCall = buildProtocolAtoms([
      call("caller", [{ id: "same", name: "read" }, { id: "same", name: "grep" }]),
      result("result", "same", "read"),
    ]).atoms[0]!;
    expect(duplicateCall.kind).toBe("remainder");
    expect(duplicateCall.protectionReasons).toContain("duplicate-tool-call");

    const duplicateResult = buildProtocolAtoms([
      call("caller", [{ id: "one", name: "read" }]),
      result("r1", "one", "read"),
      result("r2", "one", "read"),
    ]).atoms[0]!;
    expect(duplicateResult.protectionReasons).toContain("duplicate-tool-result");

    const malformed = buildProtocolAtoms([entry("caller", {
      role: "assistant",
      content: [{ type: "toolCall", id: "missing-name", arguments: {} }],
    })]).atoms[0]!;
    expect(malformed).toEqual(expect.objectContaining({ kind: "remainder", hardProtected: true }));
    expect(malformed.protectionReasons).toContain("malformed-tool-protocol");

    const orphan = buildProtocolAtoms([
      result("r1", "lost-1", "read"),
      result("r2", "lost-2", "grep"),
    ]).atoms[0]!;
    expect(orphan.entryIds).toEqual(["r1", "r2"]);
    expect(orphan.protectionReasons).toContain("orphan-tool-result");
  });

  it("protects the complete group when any member contains binary content", () => {
    const built = buildProtocolAtoms([
      call("caller", [{ id: "read-1", name: "read" }]),
      result("result", "read-1", "read", [
        { type: "text", text: "partial" },
        { type: "image", data: "opaque" },
      ]),
    ]);

    expect(built.atoms).toHaveLength(1);
    expect(built.atoms[0]).toEqual(expect.objectContaining({
      kind: "remainder",
      entryIds: ["caller", "result"],
      protectionReasons: expect.arrayContaining(["binary"]),
    }));
  });

  it("does not publish an ambiguous entry lookup for duplicate entry IDs", () => {
    const built = buildProtocolAtoms([
      message("duplicate", "user", "one"),
      message("duplicate", "assistant", "two"),
    ]);

    expect(built.atoms.every((atom) => atom.protectionReasons.includes("duplicate-entry-id"))).toBe(true);
    expect(built.entryToAtomId.has("duplicate")).toBe(false);
    expect(built.diagnosticCounts["duplicate-entry-id"]).toBe(2);
  });
});
