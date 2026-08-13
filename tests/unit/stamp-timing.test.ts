import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { captureStampProvenance, formatStampEntry, isStampEntry, registerStampCommand, STAMP_ENTRY_TYPE } from "../../extensions/stamp/index.js";

describe("AILI Stamp retained timing and provenance", () => {
  it("accepts only complete versioned timing/provenance entries", () => {
    expect(isStampEntry({ version: 2, kind: "assistant", timestamp: 10, completedAt: 20, firstContentAt: 15 })).toBe(true);
    expect(isStampEntry({ version: 3, kind: "assistant", timestamp: 10, completedAt: 20, firstContentAt: 15, thinking: "high" })).toBe(true);
    expect(isStampEntry({ version: 3, kind: "assistant", timestamp: 10, thinking: "" })).toBe(false);
    expect(isStampEntry({ version: 2, kind: "assistant", timestamp: 10, firstContentAt: 15 })).toBe(false);
    expect(isStampEntry({ version: 1, kind: "tool", name: "read", startedAt: 20, completedAt: 10, outcome: "success" })).toBe(false);
    expect(isStampEntry({ version: 2, kind: "assistant", timestamp: 10, provenance: { provider: "openai" } })).toBe(false);
    expect(isStampEntry({ version: 2, kind: "assistant", timestamp: 10, ignored: "payload" })).toBe(false);
  });

  it("copies only Pi/provider-reported provenance and never derives unavailable fields", () => {
    expect(captureStampProvenance({
      api: "responses", provider: "openai", model: "requested", responseModel: "reported",
      stopReason: "stop", usage: { input: 12, output: 3, cost: { total: 0.004 } },
    })).toEqual({
      api: "responses", provider: "openai", requestedModel: "requested", responseModel: "reported",
      stopReason: "stop", usage: { inputTokens: 12, outputTokens: 3, estimatedCost: 0.004 },
    });
    expect(captureStampProvenance({ api: "responses", provider: "openai" })).toBeUndefined();
    expect(captureStampProvenance({ api: "responses", provider: "openai", model: "requested", error: "raw error", toolResult: { payload: "never copied" } })).toEqual({ api: "responses", provider: "openai", requestedModel: "requested" });
  });

  it("records local lifecycle timing and tool outcome without call IDs or payloads", () => {
    const listeners = new Map<string, Function>();
    const entries: Array<{ type: string; data: unknown }> = [];
    const values = [125, 160, 200, 350];
    const pi = {
      registerCommand() {},
      registerEntryRenderer() {},
      appendEntry(type: string, data: unknown) { entries.push({ type, data }); },
      on(name: string, listener: Function) { listeners.set(name, listener); },
    } as unknown as ExtensionAPI;
    registerStampCommand(pi, () => values.shift() ?? 0);

    listeners.get("session_start")!({}, { mode: "tui", hasUI: true });
    listeners.get("message_start")!({ message: { role: "assistant", timestamp: 100 } });
    listeners.get("message_update")!({ message: { role: "assistant", timestamp: 100 }, assistantMessageEvent: { type: "text_delta", delta: "x" } });
    listeners.get("message_end")!({ message: { role: "assistant", timestamp: 100 } });
    listeners.get("turn_end")!({ message: { role: "assistant", timestamp: 100, api: "responses", provider: "openai", model: "gpt-test" }, toolResults: [] });
    listeners.get("tool_execution_start")!({ toolCallId: "secret-call-id", toolName: "read" });
    listeners.get("tool_execution_end")!({ toolCallId: "secret-call-id", isError: true });
    listeners.get("turn_end")!({ message: { role: "user", timestamp: 400 }, toolResults: [{ toolCallId: "secret-call-id", result: "raw payload" }] });

    expect(entries).toEqual([
      { type: STAMP_ENTRY_TYPE, data: { version: 3, kind: "assistant", timestamp: 100, completedAt: 160, firstContentAt: 125, provenance: { api: "responses", provider: "openai", requestedModel: "gpt-test" } } },
      { type: STAMP_ENTRY_TYPE, data: { version: 1, kind: "tool", name: "read", startedAt: 200, completedAt: 350, outcome: "error" } },
    ]);
    expect(JSON.stringify(entries)).not.toContain("secret-call-id");
    expect(JSON.stringify(entries)).not.toContain("raw payload");
  });

  it("renders one local-time line with model, active thinking, and reported tokens", () => {
    const timestamp = new Date(2026, 7, 13, 22, 24, 23).getTime();
    expect(formatStampEntry({
      version: 3, kind: "assistant", timestamp, firstContentAt: timestamp + 7_200, completedAt: timestamp + 8_000,
      thinking: "high",
      provenance: { api: "responses", provider: "openai", requestedModel: "gpt-5.6-terra", usage: { inputTokens: 1_000, outputTokens: 234 } },
    })).toBe("22:24:23 · first 7.2s · total 8.0s · gpt-5.6-terra high · out 0.2k");
    expect(formatStampEntry({
      version: 3, kind: "assistant", timestamp, provenance: { api: "responses", provider: "openai", requestedModel: "gpt-5.6-terra", usage: { inputTokens: 82_000, outputTokens: 72 } },
    })).toBe("22:24:23 · gpt-5.6-terra · out 72");
  });
});
