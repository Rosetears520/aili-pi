import { describe, expect, it } from "vitest";
import { ContextTurnRouter, freezeContextRoute, resolveContextOwner } from "../../src/runtime/context-runtime.js";

describe("provider-routed context owner", () => {
  it("selects Codex Remote V2 only for canonical openai-codex Responses", () => {
    expect(resolveContextOwner({ provider: "openai-codex", api: "openai-codex-responses", modelId: "gpt-5.6" }))
      .toBe("codex-remote-v2");
    for (const provider of ["openai", "azure", "anthropic", "custom-openai"]) {
      expect(resolveContextOwner({ provider, api: "openai-responses", modelId: "fixture" })).toBe("billion-context");
    }
  });

  it("fails contradictory and incomplete identity before a route exists", () => {
    expect(() => freezeContextRoute({ provider: "", api: "openai-responses", modelId: "x" })).toThrow(/requires canonical/);
    expect(() => freezeContextRoute({ provider: "openai-codex", api: "openai-responses", modelId: "x" })).toThrow(/Contradictory/);
    expect(() => freezeContextRoute({ provider: "anthropic", api: "openai-codex-responses", modelId: "x" })).toThrow(/cannot be owned/);
  });

  it("freezes identity for a turn and resets only at the terminal boundary", () => {
    const router = new ContextTurnRouter();
    const codex = { model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6" } } as never;
    const other = { model: { provider: "anthropic", api: "anthropic-messages", id: "claude" } } as never;
    expect(router.route(codex).owner).toBe("codex-remote-v2");
    expect(() => router.route(other)).toThrow(/changed during/);
    router.endTurn();
    expect(router.route(other).owner).toBe("billion-context");
  });
});
