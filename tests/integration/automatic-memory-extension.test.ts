import { describe, expect, it, vi } from "vitest";
import registerObservationalMemory, { DEFAULT_MEMPALACE_VERSION_EVIDENCE, exactMemPalaceVersionCompatible } from "../../extensions/observational-memory/index.js";
import { DelegatingMemPalacePort, type ManagedMemoryObserver, type MemPalacePort } from "../../src/runtime/observational-memory/index.js";
import { MEMPALACE_VERSION } from "../../src/runtime/mempalace.js";

type Handler = (event: any, context: any) => unknown;

function harness() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, any>();
  const pi = {
    on: vi.fn((name: string, handler: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler])),
    registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
  } as any;
  return { pi, handlers, commands, one: (name: string) => handlers.get(name)![0]! };
}

function context(overrides: Record<string, unknown> = {}) {
  const notify = vi.fn();
  return {
    cwd: process.cwd(),
    mode: "tui",
    hasUI: true,
    signal: undefined,
    isProjectTrusted: () => false,
    compact: vi.fn(),
    ui: { notify, confirm: vi.fn(async () => false) },
    sessionManager: {
      getSessionId: () => "session-1",
      getBranch: () => Object.freeze([{ id: "root", parentId: null }]),
      getLeafId: () => "root",
    },
    ...overrides,
  } as any;
}

function emptyPort(overrides: Partial<MemPalacePort> = {}): MemPalacePort {
  return {
    search: vi.fn(async () => ({ status: "success" as const, value: { records: [], omitted: 0 } })),
    checkpoint: vi.fn(async () => ({ status: "success" as const, value: { receipts: [] } })),
    reconcileDuplicate: vi.fn(async () => ({ status: "success" as const, value: { duplicate: false, providerIds: [] } })),
    ...overrides,
  };
}

describe("observational-memory Pi extension integration", () => {
  it("registers the side-effect barrier and treats manual, threshold, and overflow identically", async () => {
    const fakeObserver: ManagedMemoryObserver = { extract: vi.fn(async () => ({ schemaVersion: 1, candidates: [] })) };
    const h = harness();
    registerObservationalMemory(h.pi, { observer: fakeObserver, port: emptyPort() });
    expect(h.pi.on.mock.calls[0]![0]).toBe("session_before_compact");

    const ctx = context();
    for (const reason of ["manual", "threshold", "overflow"] as const) {
      const preparation = Object.freeze({ firstKeptEntryId: "entry-2", tokensBefore: 123, messagesToSummarize: Object.freeze([]) });
      const branchEntries = Object.freeze([Object.freeze({ type: "message", id: "entry-1", parentId: null })]);
      const event = Object.freeze({ reason, willRetry: reason === "overflow", signal: new AbortController().signal, preparation, branchEntries });
      const before = JSON.stringify({ reason, preparation, branchEntries });
      const result = await h.one("session_before_compact")(event, ctx);
      expect(result).toBeUndefined();
      expect(JSON.stringify({ reason, preparation, branchEntries })).toBe(before);
      expect(Object.isFrozen(event)).toBe(true);
    }
    expect(ctx.compact).not.toHaveBeenCalled();
  });

  it("injects recall at most once per settled run and keeps status body-free", async () => {
    const body = "PRIVATE FIXTURE MEMORY BODY";
    const search = vi.fn(async () => ({ status: "success" as const, value: { omitted: 0, records: [{ id: "durable-1", fingerprint: "a".repeat(64), kind: "preference" as const, applicability: "global-preference" as const, content: body, sourceProject: "/elsewhere", projectIdentity: "other", sourceAgent: "agent", sourceSession: "old", confidence: 0.9, status: "active" as const }] } }));
    const h = harness();
    registerObservationalMemory(h.pi, { port: emptyPort({ search }) });
    const ctx = context();

    const first: any = await h.one("before_agent_start")({ prompt: "How should status output be formatted?" }, ctx);
    const second: any = await h.one("before_agent_start")({ prompt: "How should status output be formatted?" }, ctx);
    expect(first?.message).toMatchObject({ customType: "observational-memory-recall", display: false });
    expect(first.message.content).toContain(body);
    expect(second).toBeUndefined();
    expect(search).toHaveBeenCalledTimes(1);

    await h.commands.get("memory-auto").handler("status", ctx);
    const statusText = ctx.ui.notify.mock.calls.at(-1)![0];
    expect(statusText).not.toContain(body);
    expect(statusText).not.toContain("durable-1");
    expect(statusText).toMatch(/召回ID=durable-[a-f0-9]{20}/);

    await h.one("agent_settled")({}, ctx);
    const nextRun: any = await h.one("before_agent_start")({ prompt: "How should status output be formatted?" }, ctx);
    expect(nextRun?.message).toBeDefined();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("captures only synthetic allowlisted verification receipts, never raw generic tool bodies", async () => {
    const extract = vi.fn(async () => ({ schemaVersion: 1, candidates: [] }));
    const h = harness();
    registerObservationalMemory(h.pi, { observer: { extract }, port: emptyPort() });
    const ctx = context();
    await h.one("tool_execution_end")({ toolName: "read", toolCallId: "raw", input: { path: "x" }, result: { content: "PRIVATE RAW BODY" }, isError: false }, ctx);
    await h.one("tool_execution_end")({ toolName: "bash", toolCallId: "verify", input: { command: "npm run typecheck" }, result: { content: "SECRET BUILD LOG" }, isError: false }, ctx);
    await h.one("session_before_compact")({ signal: new AbortController().signal, preparation: { firstKeptEntryId: "kept" }, branchEntries: [{ id: "verify" }] }, ctx);
    const batch = (extract.mock.calls as any)[0]?.[0];
    expect(batch.sources).toHaveLength(1);
    expect(batch.sources[0].text).toMatch(/^\{"schema":"aili\.verification-receipt\/v1","tool":"bash","success":true,"outputHash":"[a-f0-9]{64}"\}$/);
    expect(JSON.stringify(batch)).not.toContain("SECRET BUILD LOG");
    expect(JSON.stringify(batch)).not.toContain("PRIVATE RAW BODY");
  });

  it("defaults local observation on but durable unarmed", async () => {
    const h = harness();
    registerObservationalMemory(h.pi, { observer: { extract: async () => ({ schemaVersion: 1, candidates: [] }) } });
    const ctx = context();
    await h.commands.get("memory-auto").handler("status", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("本地=开；持久=未授权"), expect.any(String));
  });

  it("authorization fails closed outside an interactive trusted project and requires exact installed evidence", async () => {
    expect(DEFAULT_MEMPALACE_VERSION_EVIDENCE).toEqual({ accepted: MEMPALACE_VERSION });
    expect(Object.isFrozen(DEFAULT_MEMPALACE_VERSION_EVIDENCE)).toBe(true);
    expect(exactMemPalaceVersionCompatible({ accepted: MEMPALACE_VERSION })).toBe(false);
    expect(exactMemPalaceVersionCompatible({ accepted: MEMPALACE_VERSION, installed: `${MEMPALACE_VERSION}.1` })).toBe(false);
    expect(exactMemPalaceVersionCompatible({ accepted: MEMPALACE_VERSION, installed: MEMPALACE_VERSION })).toBe(true);

    const h = harness();
    registerObservationalMemory(h.pi, { port: emptyPort(), providerVersionEvidence: { accepted: MEMPALACE_VERSION, installed: MEMPALACE_VERSION } });
    for (const denied of [context({ mode: "print", hasUI: false }), context({ isProjectTrusted: () => false })]) {
      await h.commands.get("memory-auto").handler("authorize", denied);
      expect(denied.ui.confirm).not.toHaveBeenCalled();
    }

    const trustedHarness = harness();
    const resolveProviderVersion = vi.fn(async () => MEMPALACE_VERSION);
    registerObservationalMemory(trustedHarness.pi, { port: emptyPort(), resolveProviderVersion });
    const trusted = context({ isProjectTrusted: () => true });
    trusted.ui.confirm.mockResolvedValue(true);
    await trustedHarness.one("session_start")({ reason: "startup" }, trusted);
    expect(resolveProviderVersion).not.toHaveBeenCalled();
    await trustedHarness.commands.get("memory-auto").handler("authorize", trusted);
    expect(resolveProviderVersion).toHaveBeenCalledTimes(1);
    expect(trusted.ui.confirm).toHaveBeenCalledTimes(1);
    expect(trusted.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("持久=已授权；版本=兼容"), "info");
    expect(trusted.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("检查点=未尝试；召回=未尝试"), "info");
  });

  it("probes only after approval and remains unarmed on absent, mismatched, or failed version evidence", async () => {
    for (const resolveProviderVersion of [
      vi.fn(async () => ""),
      vi.fn(async () => "mempalace 3.7.1"),
      vi.fn(async () => { throw new Error("not installed"); }),
    ]) {
      const checkpoint = vi.fn(async () => ({ status: "success" as const, value: { receipts: [] } }));
      const h = harness();
      registerObservationalMemory(h.pi, { port: emptyPort({ checkpoint }), resolveProviderVersion });
      const ctx = context({ isProjectTrusted: () => true });
      ctx.ui.confirm.mockResolvedValue(true);
      await h.one("session_start")({ reason: "startup" }, ctx);
      expect(resolveProviderVersion).not.toHaveBeenCalled();
      await h.commands.get("memory-auto").handler("authorize", ctx);
      expect(resolveProviderVersion).toHaveBeenCalledTimes(1);
      expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("持久记忆未授权"), "warning");
      await h.commands.get("memory-auto").handler("status", ctx);
      expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("持久=未授权；版本=未验证"), "warning");
      expect(checkpoint).not.toHaveBeenCalled();
    }
  });

  it("does not probe when interactive authorization is declined", async () => {
    const resolveProviderVersion = vi.fn(async () => MEMPALACE_VERSION);
    const h = harness();
    registerObservationalMemory(h.pi, { port: emptyPort(), resolveProviderVersion });
    const ctx = context({ isProjectTrusted: () => true });
    await h.one("session_start")({ reason: "startup" }, ctx);
    await h.commands.get("memory-auto").handler("authorize", ctx);
    expect(resolveProviderVersion).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenLastCalledWith("持久记忆未授权。", "warning");
  });

  it("supports t/f/s aliases while retaining full-word controls", async () => {
    const h = harness();
    registerObservationalMemory(h.pi, { port: emptyPort() });
    const ctx = context();
    expect(h.commands.get("memory-auto").description).toContain("t/on");
    await h.commands.get("memory-auto").handler("f", ctx);
    expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("本地=关"), expect.any(String));
    await h.commands.get("memory-auto").handler("t", ctx);
    expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("本地=开"), expect.any(String));
    await h.commands.get("memory-auto").handler("s", ctx);
    expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("原因=无"), expect.any(String));
    await h.commands.get("memory-auto").handler("off", ctx);
    await h.commands.get("memory-auto").handler("on", ctx);
    await h.commands.get("memory-auto").handler("status", ctx);
    expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("本地=开"), expect.any(String));
  });

  it("invalidates delegated session ports across switch/shutdown lanes", async () => {
    const target = emptyPort();
    const delegated = new DelegatingMemPalacePort();
    expect((await delegated.search({ query: "x", maximumResults: 1, kinds: ["preference"] })).status).toBe("unavailable");
    delegated.bind(target);
    expect((await delegated.search({ query: "x", maximumResults: 1, kinds: ["preference"] })).status).toBe("success");
    delegated.invalidate();
    expect((await delegated.search({ query: "x", maximumResults: 1, kinds: ["preference"] })).status).toBe("unavailable");

    const old = harness();
    registerObservationalMemory(old.pi, { observer: { extract: async () => ({ schemaVersion: 1, candidates: [] }) } });
    const oldCtx = context();
    await old.one("session_start")({ reason: "startup" }, oldCtx);
    await old.one("session_shutdown")({ reason: "resume" }, oldCtx);
    await expect(old.one("session_before_compact")({ reason: "manual", signal: new AbortController().signal }, oldCtx)).resolves.toBeUndefined();

    const replacement = harness();
    registerObservationalMemory(replacement.pi, { observer: { extract: async () => ({ schemaVersion: 1, candidates: [] }) } });
    const replacementCtx = context({ sessionManager: { getSessionId: () => "session-2", getBranch: () => Object.freeze([{ id: "new-root", parentId: null }]), getLeafId: () => "new-root" } });
    await replacement.one("session_start")({ reason: "resume", previousSessionFile: "fixture.jsonl" }, replacementCtx);
    expect(replacement.one("session_shutdown")).toBeTypeOf("function");
  });
});
