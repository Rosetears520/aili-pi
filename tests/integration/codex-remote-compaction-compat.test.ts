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
    expect(compact).toHaveLength(3);

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
    expect(await compact[2]!(event, ctx)).toBeUndefined();
    if (stream.mock.calls.length > 0) expect(stream.mock.calls[0]![2]).toMatchObject({ maxRetries: 0 });
  });

  it("gates Pi threshold auto-compaction to the ACP WHEN policy on codex turns", async () => {
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings() })(pi);
    const compact = handlers.get("session_before_compact")!;

    const codexCtx = {
      model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6-sol" },
      hasUI: false,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionId: () => "s1", getBranch: () => [], getSessionFile: () => "/fixture/s.jsonl" },
      getSystemPrompt: () => "system",
    };
    const thresholdEvent = { reason: "threshold" as const, signal: new AbortController().signal, branchEntries: [], preparation: { firstKeptEntryId: "x", tokensBefore: 1 } };
    // Handler order: ACP ownership cancel, pressure gate, codex-compact.
    expect(await compact[0]!(thresholdEvent, codexCtx)).toBeUndefined();
    expect(await compact[1]!(thresholdEvent, codexCtx)).toEqual({ cancel: true });

    for (const reason of ["manual", "overflow"] as const) {
      const otherCtx = {
        model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6-sol" },
        hasUI: false,
        ui: { setStatus: vi.fn(), notify: vi.fn() },
        sessionManager: { getSessionId: () => "s1", getBranch: () => [], getSessionFile: () => "/fixture/s.jsonl" },
        getSystemPrompt: () => "system",
      };
      expect(await compact[1]!({ ...thresholdEvent, reason }, otherCtx)).toBeUndefined();
    }

    // Non-codex turns keep ACP as the compaction owner instead; a separate
    // extension instance avoids the turn-frozen route collision with the
    // codex assertions above.
    const acpHandlers = new Map<string, Array<(...args: any[]) => any>>();
    const acpPi = {
      on(name: string, handler: (...args: any[]) => any) { const list = acpHandlers.get(name) ?? []; list.push(handler); acpHandlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings() })(acpPi);
    const acpCompact = acpHandlers.get("session_before_compact")!;
    const acpCtx = {
      model: { provider: "anthropic", api: "anthropic", id: "claude-test" },
      hasUI: false,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionId: () => "s2", getBranch: () => [], getSessionFile: () => "/fixture/s2.jsonl" },
      getSystemPrompt: () => "system",
    };
    expect(await acpCompact[0]!(thresholdEvent, acpCtx)).toEqual({ cancel: true });
    expect(await acpCompact[1]!(thresholdEvent, acpCtx)).toBeUndefined();
  });
});
