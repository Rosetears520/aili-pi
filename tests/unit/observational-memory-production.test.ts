import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

const thinking = vi.hoisted(() => ({ levels: ["low", "off"] as string[] }));
vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getSupportedThinkingLevels: () => thinking.levels };
});

import { ParentPiManagedMemoryObserver, type ObservationBatch } from "../../src/runtime/observational-memory/index.js";

function batch(id = "b".repeat(64)): ObservationBatch {
  const source = Object.freeze({ schemaVersion: 1 as const, id: "source-1", entryId: "entry-1", sessionId: "session-1", agentId: "main", branchId: "lane-1", sourceProject: "/project", role: "user" as const, text: "I prefer concise output", estimatedTokens: 6, createdAt: "2026-08-28T00:00:00.000Z" });
  const cutoff = Object.freeze({ schemaVersion: 1 as const, sessionId: "session-1", branchId: "lane-1", fromEntryId: "entry-1", coversUpToId: "entry-1", sourceCount: 1, estimatedTokens: 6, contentHash: "a".repeat(64) });
  return Object.freeze({ schemaVersion: 1 as const, id, cutoff, sources: Object.freeze([source]) });
}

function response(text: string, overrides: Record<string, unknown> = {}) {
  return { stopReason: "stop", content: [{ type: "text", text }], ...overrides };
}

function context(complete: (...args: any[]) => Promise<unknown>, model: Record<string, unknown> = {}) {
  return {
    model: { id: "fixture", provider: "fixture", api: "openai-responses", reasoning: true, maxTokens: 8192, contextWindow: 32768, ...model },
    modelRegistry: { complete: vi.fn(complete) },
  } as any;
}

describe("ParentPiManagedMemoryObserver production boundary", () => {
  it("uses one fixed bounded prompt, an immutable batch, low thinking, and no tools", async () => {
    const complete = vi.fn(async () => response('{"schemaVersion":1,"candidates":[]}'));
    const ctx = context(complete);
    const observer = new ParentPiManagedMemoryObserver({ timeoutMs: 250, maximumOutputTokens: 512 });
    const input = batch();
    const before = JSON.stringify(input);
    observer.bind(ctx);

    await expect(observer.extract(input)).resolves.toEqual({ schemaVersion: 1, candidates: [] });
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input)).toBe(true);
    const [model, request, options] = complete.mock.calls[0] as unknown as [any, any, any];
    expect(model).toBe(ctx.model);
    expect(request.systemPrompt).toContain("Return exactly one JSON object and no markdown");
    expect(request.systemPrompt).toContain("immutable observation batch");
    expect(request).not.toHaveProperty("tools");
    expect(request.messages).toHaveLength(1);
    expect(JSON.parse(request.messages[0].content[0].text)).toEqual(input);
    expect(options).toMatchObject({ reasoningEffort: "low", maxTokens: 512, cacheRetention: "none", maxRetries: 0, timeoutMs: 250 });
    expect(options.sessionId).toBe(`aili-memory-observer-${input.id.slice(0, 32)}`);
  });

  it("uses off when low is unavailable and rejects unsupported higher thinking", async () => {
    thinking.levels = ["off"];
    const offComplete = vi.fn(async () => response('{"schemaVersion":1,"candidates":[]}'));
    const off = new ParentPiManagedMemoryObserver();
    off.bind(context(offComplete));
    await off.extract(batch());
    const [, , offOptions] = offComplete.mock.calls[0] as unknown as [any, any, any];
    expect(offOptions).not.toHaveProperty("reasoningEffort");

    thinking.levels = ["medium", "high"];
    const denied = new ParentPiManagedMemoryObserver();
    denied.bind(context(vi.fn()));
    await expect(denied.extract(batch())).rejects.toThrow(/no supported low\/off/);
    thinking.levels = ["low", "off"];
  });

  it.each([
    ["markdown", response("```json\n{}\n```")],
    ["empty", response("   ")],
    ["non-text", { stopReason: "stop", content: [{ type: "toolCall", id: "x", name: "read", arguments: {} }] }],
    ["non-terminal", response("{}", { stopReason: "length" })],
  ])("fails closed for %s output", async (_label, fixture) => {
    const observer = new ParentPiManagedMemoryObserver();
    observer.bind(context(async () => fixture));
    await expect(observer.extract(batch())).rejects.toThrow(/memory observer/);
  });

  it("fails on timeout and explicit cancellation", async () => {
    const waitsForAbort = (_model: unknown, _request: unknown, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    });
    const timed = new ParentPiManagedMemoryObserver({ timeoutMs: 5 });
    timed.bind(context(waitsForAbort));
    await expect(timed.extract(batch())).rejects.toMatchObject({ name: "AbortError" });

    const cancelled = new ParentPiManagedMemoryObserver({ timeoutMs: 1_000 });
    cancelled.bind(context(waitsForAbort));
    const pending = cancelled.extract(batch());
    cancelled.invalidate();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects a completion from a stale Parent session", async () => {
    let settle!: (value: unknown) => void;
    const oldContext = context(() => new Promise((resolve) => { settle = resolve; }));
    const observer = new ParentPiManagedMemoryObserver({ timeoutMs: 1_000 });
    observer.bind(oldContext);
    const pending = observer.extract(batch());
    observer.bind(context(async () => response('{"schemaVersion":1,"candidates":[]}')));
    settle(response('{"schemaVersion":1,"candidates":[]}'));
    await expect(pending).rejects.toThrow(/binding became stale/);
  });

  it("contains no public Agent, Herdr, process-spawn, or tool registration surface", async () => {
    const source = await readFile(new URL("../../src/runtime/observational-memory/production.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/registerTool|createAgent|new\s+Agent|herdr|child_process|\bspawn\s*\(/i);
    expect(source).toContain("Deliberately omit tools");
  });
});
