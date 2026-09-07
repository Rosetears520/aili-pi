import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, type Api, type AssistantMessageEventStream, type Model, type Provider } from "@earendil-works/pi-ai";
import { createCheckpointDetails, checkpointMarker } from "@narumitw/pi-codex-compact/src/checkpoint.js";
import { resolveCompactionRouteForApi } from "@narumitw/pi-codex-compact/src/model-api.js";
import { createProviderRoutedContextExtension, forcePiOwnedCodexRetry } from "../../src/runtime/context-runtime.js";
import type { CodexCompactSettingsRuntime, CodexCompactSettingsState } from "@narumitw/pi-codex-compact/src/settings.js";

function settings(): CodexCompactSettingsRuntime {
  let state: CodexCompactSettingsState = {
    kind: "loaded",
    path: "/fixture/pi-codex-compact.json",
    settings: { enabled: true, protocol: "auto" as const, requestTimeoutMs: 30_000, maxRetries: 2, replacementTokenBudget: 64_000, notifyOnFallback: false },
    document: {},
  };
  return {
    get: () => structuredClone(state),
    reload: async () => structuredClone(state),
    update: async (patch) => {
      state = { ...state, settings: { ...state.settings, ...patch, protocol: patch.protocol ?? state.settings.protocol } };
      return structuredClone(state);
    },
    flush: async () => undefined,
  };
}

function codexModel(id = "gpt-5.6-sol"): Model<Api> {
  return { provider: "openai-codex", api: "openai-codex-responses", id } as Model<Api>;
}

function deferred<T = void>(): { promise: Promise<T>; resolve(value?: T): void } {
  let resolve!: (value?: T) => void;
  const promise = new Promise<T>((done) => { resolve = (value?: T) => done(value as T); });
  return { promise, resolve };
}

function responseSse(item: Record<string, unknown>): string {
  return [
    { type: "response.output_item.done", item },
    { type: "response.completed", response: { output: [item] } },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

function fakeResponsesProvider(options: {
  input?: (model: Model<Api>) => Record<string, unknown>[];
  onFetchStart?: () => void;
  waitBeforeResponse?: Promise<void>;
}) {
  const requestBodies: Record<string, unknown>[] = [];
  const item = { type: "compaction", encrypted_content: "opaque-response" };
  const fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    options.onFetchStart?.();
    await options.waitBeforeResponse;
    return new Response(responseSse(item), { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  const stream = vi.fn((activeModel: Model<Api>, _context: unknown, streamOptions: any): AssistantMessageEventStream => {
    const events = createAssistantMessageEventStream();
    void (async () => {
      const usage = { input: 3, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 4, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
      const baseMessage = {
        role: "assistant" as const,
        content: [],
        api: activeModel.api,
        provider: activeModel.provider,
        model: activeModel.id,
        usage,
        stopReason: "pending" as const,
        timestamp: Date.now(),
      };
      try {
        const rawPayload = {
          model: activeModel.id,
          input: options.input?.(activeModel) ?? [{
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "fixture history" }],
          }],
        };
        const prepared = await streamOptions.onPayload(rawPayload, activeModel);
        const response = await streamOptions.fetch("https://fixture.invalid/v1/responses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(prepared),
          signal: streamOptions.signal,
        });
        await response.arrayBuffer();
        if (streamOptions.signal?.aborted) throw new DOMException("Compaction aborted", "AbortError");
        events.push({ type: "start", partial: baseMessage });
        events.push({ type: "done", reason: "stop", message: { ...baseMessage, stopReason: "stop" } });
      } catch (error) {
        events.push({
          type: "error",
          reason: streamOptions.signal?.aborted ? "aborted" : "error",
          error: {
            ...baseMessage,
            stopReason: streamOptions.signal?.aborted ? "aborted" : "error",
            errorMessage: error instanceof Error ? error.message : String(error),
          },
        });
      }
    })();
    return events;
  });
  return { fetch, requestBodies, stream, provider: { stream } as unknown as Provider };
}

describe("Codex Remote V2 composition", () => {
  it("keeps auto on Codex Remote V2 without adopting generic OpenAI/Azure routes", () => {
    expect(resolveCompactionRouteForApi("openai-codex-responses", { enabled: true, protocol: "auto" }))
      .toEqual({ kind: "remote", protocol: "remote-v2", api: "openai-codex-responses" });
    expect(resolveCompactionRouteForApi("openai-codex-responses", { enabled: true, protocol: "responses-compact" }))
      .toEqual({ kind: "remote", protocol: "responses-compact", api: "openai-codex-responses" });
    expect(resolveCompactionRouteForApi("openai-responses", { enabled: true, protocol: "auto" }))
      .toMatchObject({ kind: "remote", protocol: "responses-compact" });
    expect(resolveCompactionRouteForApi("azure-openai-responses", { enabled: true, protocol: "auto" }))
      .toMatchObject({ kind: "remote", protocol: "responses-compact" });
  });

  it("gates upstream generic Responses hooks out of the AILI Codex route", async () => {
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings() })(pi);
    const controller = new AbortController();
    controller.abort();
    expect(await handlers.get("session_before_compact")!.at(-1)!(
      { signal: controller.signal, branchEntries: [], preparation: { firstKeptEntryId: "missing", tokensBefore: 1 } },
      { model: { provider: "openai", api: "openai-responses", id: "fixture" } },
    )).toBeUndefined();
  });

  it("forces every settings view/update to zero retries while passing protocol through", async () => {
    const runtime = settings();
    const update = vi.spyOn(runtime, "update");
    const owned = forcePiOwnedCodexRetry(runtime);
    expect(owned.get().settings).toMatchObject({ maxRetries: 0, protocol: "auto" });
    expect((await owned.reload()).settings).toMatchObject({ maxRetries: 0, protocol: "auto" });
    expect((await owned.update({ protocol: "remote-v2", maxRetries: 2 })).settings)
      .toMatchObject({ maxRetries: 0, protocol: "remote-v2" });
    expect(update).toHaveBeenCalledWith({ protocol: "remote-v2", maxRetries: 0 }, undefined);
  });

  it("continues a compatible checkpoint and rejects mismatched or aborted ownership", async () => {
    const details = createCheckpointDetails({
      provider: "openai-codex",
      api: "openai-codex-responses",
      modelId: "gpt-5.6-sol",
      protocol: "remote-v2",
      replacementHistory: [{ type: "compaction", encrypted_content: "opaque-fixture" }],
      keptMessages: [],
      checkpointId: "checkpoint-fixture",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const summary = "portable fallback";
    const branch = [{ type: "compaction", id: "compact-1", parentId: null, timestamp: 1, summary, details }];
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings() })(pi);
    const context = handlers.get("context")!.at(-1)!;
    const canonical = {
      model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6-sol" },
      sessionManager: { getBranch: () => branch, getSessionId: () => "s1" },
    };
    const projected = context({ messages: [{ role: "compactionSummary", summary, timestamp: 1 }] }, canonical);
    expect(projected.messages[0].content[0].text).toContain(checkpointMarker(details.checkpointId));

    const mismatch = { ...canonical, model: { ...canonical.model, id: "different-model" } };
    expect(() => context(
      { messages: [{ role: "compactionSummary", summary, timestamp: 1 }] },
      mismatch,
    )).toThrow(/identity changed during the active turn/);
    handlers.get("agent_end")!.at(-1)!();
    expect(context(
      { messages: [{ role: "compactionSummary", summary, timestamp: 1 }] },
      canonical,
    ).messages[0].content[0].text).toContain(checkpointMarker(details.checkpointId));
    handlers.get("agent_end")!.at(-1)!();
    expect(context(
      { messages: [{ role: "compactionSummary", summary, timestamp: 1 }] },
      mismatch,
    )).toBeUndefined();
    handlers.get("agent_end")!.at(-1)!();

    const compact = handlers.get("session_before_compact")!.at(-1)!;
    const controller = new AbortController();
    controller.abort();
    expect(await compact(
      { signal: controller.signal, branchEntries: [], preparation: { firstKeptEntryId: "missing", tokensBefore: 1 } },
      canonical,
    )).toEqual({ cancel: true });
  });

  it("rejects provider, API, model, and protocol checkpoint drift at all three Codex gates", async () => {
    const branch: SessionEntry[] = [];
    const auth = vi.fn(async () => ({ ok: false as const, error: "fixture unavailable" }));
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings() })(pi);
    const ctx = {
      model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-5.6-sol" },
      hasUI: false,
      ui: { setStatus: vi.fn(), notify: vi.fn() },
      sessionManager: { getSessionId: () => "s1", getBranch: () => branch },
      modelRegistry: { getApiKeyAndHeaders: auth, getProvider: () => ({}) },
      getSystemPrompt: () => "system",
    };
    const context = handlers.get("context")!.at(-1)!;
    const request = handlers.get("before_provider_request")!.at(-1)!;
    const compact = handlers.get("session_before_compact")!.at(-1)!;
    const mismatches = [
      { provider: "different-provider", api: "openai-codex-responses" as const, modelId: "gpt-5.6-sol", protocol: "remote-v2" as const },
      { provider: "openai-codex", api: "openai-responses" as const, modelId: "gpt-5.6-sol", protocol: "remote-v2" as const },
      { provider: "openai-codex", api: "openai-codex-responses" as const, modelId: "different-model", protocol: "remote-v2" as const },
      { provider: "openai-codex", api: "openai-codex-responses" as const, modelId: "gpt-5.6-sol", protocol: "responses-compact" as const },
    ];

    for (const identity of mismatches) {
      const details = createCheckpointDetails({
        ...identity,
        replacementHistory: [{ type: "compaction", encrypted_content: "opaque-fixture" }],
        keptMessages: [],
        checkpointId: "checkpoint-fixture",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      branch.splice(0, branch.length, {
        type: "compaction",
        id: "compact-1",
        parentId: null,
        timestamp: "2026-01-01T00:00:00.000Z",
        summary: "portable fallback",
        firstKeptEntryId: "missing",
        tokensBefore: 1,
        details,
      });
      const marker = checkpointMarker(details.checkpointId);
      expect(context({ messages: [{ role: "compactionSummary", summary: "portable fallback", timestamp: 1 }] }, ctx)).toBeUndefined();
      expect(request({ payload: { input: [{ type: "message", role: "user", content: [{ type: "input_text", text: marker }] }] } }, ctx)).toBeUndefined();
      expect(await compact({ signal: new AbortController().signal, branchEntries: branch, preparation: { firstKeptEntryId: "missing", tokensBefore: 1 } }, ctx)).toBeUndefined();
    }

    expect(auth).not.toHaveBeenCalled();
  });

  it("makes one actual fake request with zero retries and a continuation payload", async () => {
    const recent = { role: "user" as const, content: "recent", timestamp: 1 };
    const prior = createCheckpointDetails({
      provider: "openai-codex",
      api: "openai-codex-responses",
      modelId: "gpt-5.6-sol",
      protocol: "remote-v2",
      replacementHistory: [{ type: "compaction", encrypted_content: "opaque-fixture" }],
      keptMessages: [recent],
      checkpointId: "checkpoint-fixture",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const fake = fakeResponsesProvider({
      input: () => [{ type: "message", role: "user", content: [{ type: "input_text", text: checkpointMarker(prior.checkpointId) }] }],
    });
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings(), fetch: fake.fetch })(pi);
    const compact = handlers.get("session_before_compact")!.at(-1)!;
    const branch: SessionEntry[] = [
      {
        type: "compaction",
        id: "compact-1",
        parentId: null,
        timestamp: "2026-01-01T00:00:00.000Z",
        summary: "existing checkpoint",
        firstKeptEntryId: "kept-entry",
        tokensBefore: 1,
        details: prior,
      },
      {
        type: "message",
        id: "kept-entry",
        parentId: "compact-1",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: recent,
      },
    ];
    const ctx = {
      model: codexModel(),
      hasUI: false,
      ui: { setStatus: vi.fn() },
      sessionManager: { getSessionId: () => "s1", getBranch: () => branch },
      modelRegistry: {
        getApiKeyAndHeaders: async () => ({ ok: true }),
        getProvider: () => fake.provider,
      },
      getSystemPrompt: () => "system",
    };
    const event = { signal: new AbortController().signal, branchEntries: branch, preparation: { firstKeptEntryId: "kept-entry", tokensBefore: 1 } };
    const result = await compact(event, ctx);

    expect(result?.compaction?.details).toMatchObject({ provider: "openai-codex", api: "openai-codex-responses", modelId: "gpt-5.6-sol", protocol: "remote-v2" });
    expect(fake.fetch).toHaveBeenCalledTimes(1);
    expect(fake.stream).toHaveBeenCalledTimes(1);
    expect(fake.stream.mock.calls[0]![2]).toMatchObject({ maxRetries: 0, transport: "sse", cacheRetention: "none" });
    expect(fake.requestBodies[0]!.input).toEqual([
      ...prior.replacementHistory,
      { type: "compaction_trigger" },
    ]);
    expect(JSON.stringify(fake.requestBodies[0])).not.toContain(checkpointMarker(prior.checkpointId));
  });

  it("discards an in-flight compaction after a public branch-switch boundary", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const fake = fakeResponsesProvider({ onFetchStart: () => started.resolve(), waitBeforeResponse: release.promise });
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings(), fetch: fake.fetch })(pi);
    const branch: SessionEntry[] = [{
      type: "message",
      id: "kept-entry",
      parentId: null,
      timestamp: "2026-01-01T00:00:01.000Z",
      message: { role: "user", content: "recent", timestamp: 1 },
    }];
    let sessionId = "s1";
    const ctx = {
      model: codexModel(),
      hasUI: false,
      ui: { setStatus: vi.fn() },
      sessionManager: { getSessionId: () => sessionId, getBranch: () => branch },
      modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true }), getProvider: () => fake.provider },
      getSystemPrompt: () => "system",
    };
    const pending = handlers.get("session_before_compact")!.at(-1)!({
      signal: new AbortController().signal,
      branchEntries: branch,
      preparation: { firstKeptEntryId: "kept-entry", tokensBefore: 1 },
    }, ctx);
    await started.promise;
    branch.push({ type: "message", id: "branch-change", parentId: "kept-entry", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "user", content: "branch change", timestamp: 2 } });
    sessionId = "s2";
    handlers.get("session_before_switch")!.at(-1)!({ type: "session_before_switch", reason: "resume" }, ctx);
    handlers.get("session_before_tree")!.at(-1)!({ type: "session_before_tree", preparation: {}, signal: new AbortController().signal }, ctx);
    release.resolve();

    expect(await pending).toEqual({ cancel: true });
    expect(fake.fetch).toHaveBeenCalledTimes(1);
    expect(fake.stream).toHaveBeenCalledTimes(1);
  });

  it("discards an in-flight compaction after the event aborts", async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const fake = fakeResponsesProvider({ onFetchStart: () => started.resolve(), waitBeforeResponse: release.promise });
    const handlers = new Map<string, Array<(...args: any[]) => any>>();
    const pi = {
      on(name: string, handler: (...args: any[]) => any) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); },
      registerTool: vi.fn(), registerCommand: vi.fn(), getActiveTools: () => [], getAllTools: () => [],
    } as unknown as ExtensionAPI;
    createProviderRoutedContextExtension({ settingsRuntime: settings(), fetch: fake.fetch })(pi);
    const branch: SessionEntry[] = [{
      type: "message",
      id: "kept-entry",
      parentId: null,
      timestamp: "2026-01-01T00:00:01.000Z",
      message: { role: "user", content: "recent", timestamp: 1 },
    }];
    const ctx = {
      model: codexModel(),
      hasUI: false,
      ui: { setStatus: vi.fn() },
      sessionManager: { getSessionId: () => "s1", getBranch: () => branch },
      modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true }), getProvider: () => fake.provider },
      getSystemPrompt: () => "system",
    };
    const controller = new AbortController();
    const pending = handlers.get("session_before_compact")!.at(-1)!({
      signal: controller.signal,
      branchEntries: branch,
      preparation: { firstKeptEntryId: "kept-entry", tokensBefore: 1 },
    }, ctx);
    await started.promise;
    controller.abort();
    release.resolve();

    expect(await pending).toEqual({ cancel: true });
    expect(fake.fetch).toHaveBeenCalledTimes(1);
    expect(fake.stream).toHaveBeenCalledTimes(1);
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
    expect(stream).toHaveBeenCalledTimes(1);
    expect(stream.mock.calls[0]![2]).toMatchObject({ maxRetries: 0 });
  });
});
