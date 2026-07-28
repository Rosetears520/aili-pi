import { describe, expect, it } from "vitest";
import type { CompactState, SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { findCoolingCandidate } from "../../src/runtime/aili-compact/index.js";

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
  blocks: new Map(),
  policyDecisions: [],
  diagnostics: [],
};

function toolCall(name = "read", argumentsValue: Record<string, unknown> = {}): SessionLikeEntry {
  return {
    id: "call",
    type: "message",
    message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name, arguments: argumentsValue }] },
  };
}

function result(isError = false, toolName = "read"): SessionLikeEntry {
  return {
    id: "result",
    type: "message",
    message: { role: "toolResult", toolCallId: "call-1", toolName, isError, content: "x".repeat(9_000) },
  };
}

function assistant(id: string): SessionLikeEntry {
  return { id, type: "message", message: { role: "assistant", content: id } };
}

describe("AILI Compact consumed-result policy", () => {
  it("never treats elapsed assistant messages as provider-observation evidence", () => {
    expect(findCoolingCandidate([toolCall(), result()], state)).toBeUndefined();
    expect(findCoolingCandidate([toolCall(), result(), assistant("later"), assistant("later-again")], state)).toBeUndefined();
  });

  it("keeps unresolved errors raw regardless of grace age", () => {
    expect(findCoolingCandidate([toolCall(), result(true), assistant("one")], state)).toBeUndefined();
    expect(findCoolingCandidate([
      toolCall(),
      result(true),
      ...Array.from({ length: 8 }, (_, index) => assistant(`later-${index + 1}`)),
    ], state)).toBeUndefined();
  });

  it("never cools protected/unpaired/image/AILI Compact output or an already-active source", () => {
    const compactOutput = { ...result(), message: { ...result().message as Record<string, unknown>, toolName: "aili_compact" } };
    expect(findCoolingCandidate([toolCall(), compactOutput, assistant("later")], state)).toBeUndefined();
    expect(findCoolingCandidate([toolCall("bash"), result(false, "bash"), assistant("later")], state)).toBeUndefined();
    expect(findCoolingCandidate([toolCall("read", { path: ".env.local" }), result(), assistant("later")], state)).toBeUndefined();
    expect(findCoolingCandidate([result(), assistant("later")], state)).toBeUndefined();
    const imageResult = {
      ...result(),
      message: { ...result().message as Record<string, unknown>, content: [{ type: "text", text: "x".repeat(9_000) }, { type: "image", data: "encoded", mimeType: "image/png" }] },
    };
    expect(findCoolingCandidate([toolCall(), imageResult, assistant("later")], state)).toBeUndefined();
    const active: CompactState = { ...state, blocks: new Map([["existing", { id: "existing", kind: "cool", epochId: "root", sourceEntryIds: ["result"], sourceDigest: "x", summary: "x", active: true }]]) };
    expect(findCoolingCandidate([toolCall(), result(), assistant("later")], active)).toBeUndefined();
  });
});
