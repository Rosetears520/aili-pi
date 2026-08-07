import { describe, expect, it } from "vitest";
import type { CompactState, SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import {
  buildReferenceCatalog,
  pageReferenceCatalog,
  resolveBlockReference,
  resolveMessageReference,
} from "../../src/runtime/aili-compact/references.js";

function state(overrides: Partial<CompactState> = {}): CompactState {
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
    blocks: new Map(),
    policyDecisions: [],
    diagnostics: [],
    ...overrides,
  };
}

describe("AILI Compact reference catalog", () => {
  it("derives stable message and block ordinals while excluding AILI protocol messages", () => {
    const entries: SessionLikeEntry[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-1", name: "read", arguments: {} }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "read", content: "source" } },
      { id: "compact-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "compact-1", name: "aili_compact", arguments: {} }] } },
      { id: "compact-result", type: "message", message: { role: "toolResult", toolCallId: "compact-1", toolName: "aili_compact", content: "ok" } },
    ];
    const compactState = state({
      blocks: new Map([["block", {
        id: "block",
        kind: "semantic",
        epochId: "root",
        sourceEntryIds: ["user"],
        sourceDigest: "digest",
        summary: "summary",
        active: true,
      }]]),
    });
    const first = buildReferenceCatalog(entries, compactState);
    const second = buildReferenceCatalog(entries, compactState);
    expect(first).toEqual(second);
    expect(first.messages.map(({ ref, entryId, atomEntryIds }) => ({ ref, entryId, atomEntryIds }))).toEqual([
      { ref: "m000001", entryId: "user", atomEntryIds: ["user"] },
      { ref: "m000002", entryId: "call", atomEntryIds: ["call", "result"] },
      { ref: "m000003", entryId: "result", atomEntryIds: ["call", "result"] },
    ]);
    expect(first.blocks).toEqual([expect.objectContaining({ ref: "b000001", blockId: "block", active: true })]);
  });

  it("pages candidates and rejects a stale catalog scope", () => {
    const entries: SessionLikeEntry[] = Array.from({ length: 70 }, (_, index) => ({
      id: `entry-${index}`,
      type: "message",
      message: { role: index % 2 === 0 ? "user" : "assistant", content: `${index}` },
    }));
    const catalog = buildReferenceCatalog(entries, state());
    const page = pageReferenceCatalog(catalog, 32, 64);
    expect(page.messages).toHaveLength(38);
    expect(page.messages[0]?.ref).toBe("m000033");
    expect(page.nextOffset).toBeUndefined();
    expect(resolveMessageReference(catalog, catalog.catalogId, "m000001")?.entryId).toBe("entry-0");
    expect(resolveMessageReference(catalog, "stale", "m000001")).toBeUndefined();
    expect(resolveBlockReference(catalog, catalog.catalogId, "b000001")).toBeUndefined();
  });

  it("keeps protocol atom membership inside the current epoch when call IDs are reused", () => {
    const entries: SessionLikeEntry[] = [
      { id: "old-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "same", name: "read", arguments: {} }] } },
      { id: "old-result", type: "message", message: { role: "toolResult", toolCallId: "same", toolName: "read", content: "old" } },
      { id: "epoch-2", type: "compaction" },
      { id: "new-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "same", name: "read", arguments: {} }] } },
      { id: "new-result", type: "message", message: { role: "toolResult", toolCallId: "same", toolName: "read", content: "new" } },
    ];
    const catalog = buildReferenceCatalog(entries, state({ epochId: "epoch-2" }));
    expect(catalog.messages.map((message) => message.atomEntryIds)).toEqual([
      ["new-call", "new-result"],
      ["new-call", "new-result"],
    ]);
  });

  it("pages active blocks even when earlier replay blocks are inactive and changes catalog identity on lifecycle state", () => {
    const blocks = new Map(Array.from({ length: 33 }, (_, index) => {
      const id = `block-${index}`;
      return [id, {
        id,
        kind: "semantic" as const,
        epochId: "root",
        sourceEntryIds: [`source-${index}`],
        sourceDigest: "digest",
        summary: "summary",
        active: index === 32,
      }];
    }));
    const inactiveCatalog = buildReferenceCatalog([], state({ blocks }));
    expect(pageReferenceCatalog(inactiveCatalog).blocks).toEqual([expect.objectContaining({ ref: "b000033", blockId: "block-32", active: true })]);

    const changed = new Map(blocks);
    changed.set("block-32", { ...changed.get("block-32")!, active: false });
    const changedCatalog = buildReferenceCatalog([], state({ blocks: changed }));
    expect(changedCatalog.catalogId).not.toBe(inactiveCatalog.catalogId);
    expect(pageReferenceCatalog(changedCatalog).blocks).toEqual([]);
  });

  it("resets message ordinals after the completed compaction epoch", () => {
    const entries: SessionLikeEntry[] = [
      { id: "old", type: "message", message: { role: "user", content: "old" } },
      { id: "epoch-2", type: "compaction" },
      { id: "new", type: "message", message: { role: "user", content: "new" } },
    ];
    const catalog = buildReferenceCatalog(entries, state({ epochId: "epoch-2" }));
    expect(catalog.messages).toEqual([expect.objectContaining({ ref: "m000001", entryId: "new", epochId: "epoch-2" })]);
  });
});
