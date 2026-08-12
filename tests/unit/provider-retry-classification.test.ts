import { describe, expect, it } from "vitest";
import { classifyProviderError, sanitizeProviderCause } from "../../src/runtime/provider-retry.js";

describe("explainable provider retry classification", () => {
  it("classifies only frozen known retry causes", () => {
    expect(classifyProviderError("Unknown error (no error details in response)")?.category).toBe("unknown-detail");
    expect(classifyProviderError("websocket connection limit reached")?.category).toBe("codex-websocket-limit");
    expect(classifyProviderError("Codex error: An error occurred while processing your request. You can retry your request")?.category).toBe("codex-backend");
    expect(classifyProviderError("ordinary permanent failure")).toBeUndefined();
  });

  it("recognizes an existing watchdog tag idempotently and redacts bounded causes", () => {
    expect(classifyProviderError("[stall-watchdog-retry] provider returned error")?.category).toBe("stall-watchdog");
    const cause = sanitizeProviderCause("Authorization: Bearer-secret\n API_KEY=hunter2 extra");
    expect(cause).toContain("Authorization=[redacted]");
    expect(cause).toContain("API_KEY=[redacted]");
    expect(cause).not.toContain("hunter2");
  });
});
