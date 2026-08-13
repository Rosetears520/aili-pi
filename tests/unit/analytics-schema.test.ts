import { describe, expect, it } from "vitest";
import { parseAnalyticsCommand, renderSafeAnalyticsSummary } from "../../extensions/analytics/index.js";
import { AnalyticsScopeRegistry, createOpaqueAnalyticsScope, decodeAnalyticsEvent, normalizeAnalyticsEvent } from "../../src/runtime/analytics/store.js";

const scope = "fixtureOpaqueScope_1234567890";

function allowed() {
  return {
    timestampMs: 1_760_000_000_000,
    scope,
    kind: "response" as const,
    durationMs: 25,
    provider: "OpenAI-Codex",
    model: "gpt-5.6",
    responseCount: 1,
    inputTokens: 12,
    outputTokens: 4,
    costMicros: 7,
    outcome: "success" as const,
  };
}

describe("content-free Analytics schema", () => {
  it("accepts only normalized allowlisted metadata", () => {
    expect(normalizeAnalyticsEvent(allowed())).toEqual({
      formatVersion: 1,
      ...allowed(),
      provider: "openai-codex",
    });
  });

  it.each(["prompt", "reply", "thinking", "arguments", "result", "rawError", "cwd", "path", "title", "label", "sessionId"])("rejects content-bearing field %s without reproducing it", (field) => {
    const marker = "fixture-private-content";
    expect(() => normalizeAnalyticsEvent({ ...allowed(), [field]: marker })).toThrow(/forbidden or unsupported/);
    try { normalizeAnalyticsEvent({ ...allowed(), [field]: marker }); }
    catch (error) { expect(String(error)).not.toContain(marker); }
  });

  it("rejects unbounded or unsafe dimensions and unknown schema versions", () => {
    expect(() => normalizeAnalyticsEvent({ ...allowed(), tool: "x".repeat(97) })).toThrow(/tool is invalid/);
    expect(() => normalizeAnalyticsEvent({ ...allowed(), model: "contains spaces" })).toThrow(/model is invalid/);
    expect(() => decodeAnalyticsEvent({ ...allowed(), formatVersion: 2 })).toThrow(/unsupported schema/);
  });

  it("uses independent opaque session scopes outside model context", () => {
    const values = ["scope_abcdefghijklmnop", "scope_qrstuvwxyzABCDEF"];
    const scopes = new AnalyticsScopeRegistry(() => values.shift()!);
    expect(scopes.scopeForSession("raw-pi-session-a")).toBe("scope_abcdefghijklmnop");
    expect(scopes.scopeForSession("raw-pi-session-a")).toBe("scope_abcdefghijklmnop");
    expect(scopes.scopeForSession("raw-pi-session-b")).toBe("scope_qrstuvwxyzABCDEF");
    expect(createOpaqueAnalyticsScope()).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });

  it("keeps the retained TUI surface to safe summaries and explicit cleanup commands", () => {
    expect(parseAnalyticsCommand("clear all", 1_000)).toEqual({ kind: "all" });
    expect(parseAnalyticsCommand("clear 100 200", 1_000)).toEqual({ kind: "range", range: { fromMs: 100, toMs: 200 } });
    expect(() => parseAnalyticsCommand("clear now", 1_000)).toThrow(/accepts/);
    const summary = renderSafeAnalyticsSummary({ records: 1, responseCount: 1, llmCallCount: 0, toolCount: 0, errorCount: 0, durationMs: 2, inputTokens: 3, outputTokens: 4, costMicros: 5, corruptRecords: 0, truncatedDimensions: false }, 99, "all");
    expect(summary).toContain("storeBytes=99");
    expect(summary).not.toContain(scope);
  });
});
