import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createProviderRoutedContextExtension, forcePiOwnedCodexRetry } from "../../src/runtime/context-runtime.js";
import type { CodexCompactSettingsRuntime } from "@narumitw/pi-codex-compact/src/settings.js";

function settings(): CodexCompactSettingsRuntime {
  const state = {
    kind: "loaded" as const,
    path: "/fixture/pi-codex-compact.json",
    settings: { enabled: true, requestTimeoutMs: 30_000, maxRetries: 2, replacementTokenBudget: 64_000, notifyOnFallback: false },
    document: {},
  };
  return { get: () => structuredClone(state), reload: async () => structuredClone(state), update: async () => structuredClone(state), flush: async () => undefined };
}

describe("Codex Remote V2 composition", () => {
  it("forces loaded and updated settings to zero transport retries", async () => {
    const owned = forcePiOwnedCodexRetry(settings());
    expect(owned.get().settings.maxRetries).toBe(0);
    expect((await owned.reload()).settings.maxRetries).toBe(0);
    expect((await owned.update({ maxRetries: 2 })).settings.maxRetries).toBe(0);
  });

  it("forces extension transport retry to zero while leaving Pi as retry owner", async () => {
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings() })(pi);
    const compact = handlers.get("session_before_compact")!;
    expect(compact).toHaveLength(2);

    const stream = vi.fn((..._args: any[]) => ({ async *[Symbol.asyncIterator]() { yield { type: "error", error: { errorMessage: "fixture" } }; } }));
    const model = { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6-sol" };
    const ctx = {
      model,
      hasUI: false,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionId: () => "s1", getBranch: () => [] },
      modelRegistry: {
        getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "redacted" }),
        getProvider: () => ({ stream }),
      },
      getSystemPrompt: () => "system",
    };
    const event = { signal: new AbortController().signal, branchEntries: [], preparation: { firstKeptEntryId: "missing", tokensBefore: 1 } };
    expect(await compact[0]!(event, ctx)).toBeUndefined();
    expect(await compact[1]!(event, ctx)).toBeUndefined();
    if (stream.mock.calls.length > 0) expect(stream.mock.calls[0]![2]).toMatchObject({ maxRetries: 0 });
  });
});
