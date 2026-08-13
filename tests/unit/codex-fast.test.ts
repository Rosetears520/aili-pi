import { describe, expect, it } from "vitest";
import { applyCodexPriorityPayload } from "../../src/runtime/codex-fast.js";

describe("Codex Fast service tier", () => {
  it("adds priority only to supported Codex payloads without changing identity", () => {
    expect(applyCodexPriorityPayload({ model: "gpt-5.6-terra" }, "openai-codex", "priority")).toEqual({
      payload: { model: "gpt-5.6-terra", service_tier: "priority" },
      evidence: { configured: "priority", applied: true, reason: "priority" },
    });
  });
  it("does not alter unsupported providers or standard requests", () => {
    const payload = { model: "other" };
    expect(applyCodexPriorityPayload(payload, "anthropic", "priority")).toEqual({ payload, evidence: { configured: "priority", applied: false, reason: "unsupported" } });
    expect(applyCodexPriorityPayload(payload, "openai-codex", "standard")).toEqual({ payload, evidence: { configured: "standard", applied: false, reason: "standard" } });
  });
});
