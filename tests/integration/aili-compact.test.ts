import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { registerAiliCompact } from "../../src/runtime/aili-compact/index.js";
import { sourceDigest } from "../../src/runtime/aili-compact/contracts.js";

type RegisteredTool = {
  name: string;
  execute: (...args: any[]) => Promise<any>;
};

type Handler = (event: any, context: any) => any;

function harness(options: { sendUserMessageThrows?: boolean } = {}) {
  const tools: RegisteredTool[] = [];
  const commands: string[] = [];
  const commandHandlers = new Map<string, (args: string, context: any) => Promise<void>>();
  const handlers = new Map<string, Handler>();
  const appended: Array<{ customType: string; data: unknown }> = [];
  const requested: string[] = [];
  registerAiliCompact({
    registerTool(tool: RegisteredTool) { tools.push(tool); },
    registerCommand(name: string, command: { handler: (args: string, context: any) => Promise<void> }) { commands.push(name); commandHandlers.set(name, command.handler); },
    on(event: string, handler: Handler) { handlers.set(event, handler); },
    appendEntry(customType: string, data: unknown) { appended.push({ customType, data }); },
    sendUserMessage(message: string) { if (options.sendUserMessageThrows) throw new Error("send failed"); requested.push(message); },
  } as unknown as ExtensionAPI);
  return { tools, commands, commandHandlers, handlers, appended, requested };
}

function successfulCompactResult(id: string, contextTx: Record<string, unknown> & { id?: unknown; kind?: unknown }, toolCallId = typeof contextTx.id === "string" ? contextTx.id : `call:${id}`) {
  const toolName = contextTx.kind === "prune" ? "aili_prune" : contextTx.kind === "decompress" ? "aili_decompress" : "aili_compact";
  return { id, type: "message", message: { role: "toolResult", toolCallId, toolName, content: [], isError: false, details: { contextTx } } };
}

function context(entries: any[], usage?: { tokens: number | null; contextWindow: number }, cwd = "/project", activity = { idle: true, pending: false }) {
  const statuses: string[] = [];
  const notifications: string[] = [];
  const widgets: Array<{ key: string; content: string[] | undefined }> = [];
  return {
    cwd,
    isIdle: () => activity.idle,
    hasPendingMessages: () => activity.pending,
    getContextUsage: () => usage,
    sessionManager: {
      getSessionId: () => "session",
      getLeafId: () => entries.at(-1)?.id ?? null,
      getBranch: () => entries,
    },
    ui: {
      setStatus(_key: string, value: string) { statuses.push(value); },
      setWidget(key: string, content: string[] | undefined) { widgets.push({ key, content }); },
      notify(value: string) { notifications.push(value); },
    },
    statuses,
    notifications,
    widgets,
  };
}

function mutationCall(entries: any[], id: string, name: "aili_compact" | "aili_decompress" | "aili_prune", arguments_: Record<string, unknown>) {
  entries.push({ id: `assistant:${id}`, type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: arguments_ }] } });
}

async function statusSnapshot(runtime: ReturnType<typeof harness>, entries: any[]) {
  const status = runtime.tools.find((tool) => tool.name === "aili_compact_status")!;
  return JSON.parse((await status.execute("status", {}, undefined, undefined, context(entries))).content[0].text);
}

function projectHealthy(runtime: ReturnType<typeof harness>, entries: any[], ctx: any) {
  return runtime.handlers.get("context")!({ type: "context", messages: entries.filter((entry) => entry.type === "message").map((entry) => entry.message) }, ctx);
}

describe("AILI Compact runtime", () => {
  it("registers the fixed model-tool and command namespace once", () => {
    const runtime = harness();
    expect(runtime.tools.map((tool) => tool.name)).toEqual([
      "aili_compact",
      "aili_decompress",
      "aili_prune",
      "aili_search_context",
      "aili_compact_status",
      "aili_context_recap",
    ]);
    expect(runtime.commands).toEqual(["aili-compact"]);
    expect([...runtime.handlers.keys()]).toEqual(expect.arrayContaining(["before_agent_start", "context", "message_end", "turn_end", "session_before_compact", "session_compact", "session_shutdown"]));
  });

  it("injects an opt-in project custom-prompt snapshot only through Pi's system-prompt hook", () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-runtime-"));
    try {
      const project = join(root, "project");
      const promptDirectory = join(project, ".pi", "aili-compact-prompts");
      mkdirSync(promptDirectory, { recursive: true });
      writeFileSync(join(project, ".pi", "aili-compact.jsonc"), '{ "experimental": { "customPrompts": true } }');
      writeFileSync(join(promptDirectory, "system.md"), "Prefer preserving accepted decisions in summaries.");
      const runtime = harness();
      const ctx = context([], undefined, project);
      runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
      const result = runtime.handlers.get("before_agent_start")!({ type: "before_agent_start", prompt: "question", systemPrompt: "PI BASE", systemPromptOptions: {} }, ctx);
      expect(result).toEqual(expect.objectContaining({
        systemPrompt: expect.stringContaining("Prefer preserving accepted decisions in summaries."),
      }));
      expect(result.systemPrompt).toContain("AILI Compact user-configured guidance");
      expect(result.systemPrompt).toContain("source-fidelity");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps prompt files inert unless the ACP-style opt-in is enabled", () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-runtime-"));
    try {
      const project = join(root, "project");
      const promptDirectory = join(project, ".pi", "aili-compact-prompts");
      mkdirSync(promptDirectory, { recursive: true });
      writeFileSync(join(project, ".pi", "aili-compact.jsonc"), '{ "experimental": { "customPrompts": false } }');
      writeFileSync(join(promptDirectory, "system.md"), "This must not be injected.");
      const runtime = harness();
      const ctx = context([], undefined, project);
      runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
      expect(runtime.handlers.get("before_agent_start")!({ type: "before_agent_start", prompt: "question", systemPrompt: "PI BASE", systemPromptOptions: {} }, ctx)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("suppresses an enabled custom-prompt snapshot after an append-only off control", () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-runtime-"));
    try {
      const project = join(root, "project");
      const promptDirectory = join(project, ".pi", "aili-compact-prompts");
      mkdirSync(promptDirectory, { recursive: true });
      writeFileSync(join(project, ".pi", "aili-compact.jsonc"), '{ "experimental": { "customPrompts": true } }');
      writeFileSync(join(promptDirectory, "system.md"), "This must be suppressed after off.");
      const entries = [{
        id: "off",
        type: "custom",
        customType: "aili-compact",
        data: { schema: "aili.compact.tx.v1", id: "off", kind: "control", epochId: "root", control: "off" },
      }];
      const runtime = harness();
      const ctx = context(entries, undefined, project);
      runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
      expect(runtime.handlers.get("before_agent_start")!({ type: "before_agent_start", prompt: "question", systemPrompt: "PI BASE", systemPromptOptions: {} }, ctx)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps an enabled prompt snapshot session-scoped until explicit reload", async () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-runtime-"));
    try {
      const project = join(root, "project");
      const promptDirectory = join(project, ".pi", "aili-compact-prompts");
      mkdirSync(promptDirectory, { recursive: true });
      const configPath = join(project, ".pi", "aili-compact.jsonc");
      writeFileSync(configPath, '{ "experimental": { "customPrompts": false } }');
      writeFileSync(join(promptDirectory, "system.md"), "Reloaded session guidance.");
      const runtime = harness();
      const ctx = context([], undefined, project);
      runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
      const beforeAgentStart = runtime.handlers.get("before_agent_start")!;
      expect(beforeAgentStart({ type: "before_agent_start", prompt: "question", systemPrompt: "PI BASE", systemPromptOptions: {} }, ctx)).toBeUndefined();

      writeFileSync(configPath, '{ "experimental": { "customPrompts": true } }');
      expect(beforeAgentStart({ type: "before_agent_start", prompt: "question", systemPrompt: "PI BASE", systemPromptOptions: {} }, ctx)).toBeUndefined();
      await runtime.commandHandlers.get("aili-compact")!("prompt reload", ctx);
      expect(beforeAgentStart({ type: "before_agent_start", prompt: "question", systemPrompt: "PI BASE", systemPromptOptions: {} }, ctx)).toEqual(expect.objectContaining({
        systemPrompt: expect.stringContaining("Reloaded session guidance."),
      }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("commits a message transaction from status references and projects only the provider copy", async () => {
    const runtime = harness();
    const oldAnswer = "old answer ".repeat(600);
    const entries: any[] = [
      { id: "user-1", type: "message", message: { role: "user", content: "old question" } },
      { id: "assistant-1", type: "message", message: { role: "assistant", content: oldAnswer } },
      { id: "user-2", type: "message", message: { role: "user", content: "current question" } },
    ];
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    const status = await statusSnapshot(runtime, entries);
    const assistantRef = status.references.refs.find((ref: any) => ref.role === "assistant").ref;
    const params = { mode: "message", catalogId: status.references.catalogId, topic: "Completed work", items: [{ messageRef: assistantRef, topic: "Answer", summary: "old work is complete" }] };
    mutationCall(entries, "call-1", "aili_compact", params);
    const compact = runtime.tools.find((tool) => tool.name === "aili_compact")!;
    const result = await compact.execute("call-1", params, undefined, undefined, ctx);
    expect(result.details.contextTx.blocks[0]).toMatchObject({ id: "block:call-1:1", sourceEntryIds: ["assistant-1"], active: true, mode: "message" });
    expect(entries[1].message.content).toBe(oldAnswer);

    entries.push(successfulCompactResult("compact-result", result.details.contextTx, "call-1"));
    const projected = runtime.handlers.get("context")!({ type: "context", messages: entries.filter((entry) => entry.type === "message").map((entry) => entry.message) }, ctx);
    expect(projected.messages).toEqual([
      { role: "user", content: "old question" },
      expect.objectContaining({ role: "assistant", content: [expect.objectContaining({ name: "aili_context_recap", arguments: { blockRef: "b000001" } })] }),
      expect.objectContaining({ role: "toolResult", toolName: "aili_context_recap", content: [expect.objectContaining({ text: expect.stringContaining("old work is complete") })] }),
      { role: "user", content: "current question" },
    ]);
    expect(JSON.stringify(projected.messages)).not.toContain('"name":"aili_compact"');
    expect(ctx.statuses.at(-1)).toContain("AILI Compact on");
  });

  it("accepts a complete range atom and rejects a split message atom", async () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "old-user", type: "message", message: { role: "user", content: "old question" } },
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "notes.txt" } }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "old output ".repeat(700) }] } },
      { id: "current", type: "message", message: { role: "user", content: "current question" } },
    ];
    const compact = runtime.tools.find((tool) => tool.name === "aili_compact")!;
    const status = await statusSnapshot(runtime, entries);
    const atomRefs = status.references.refs.find((ref: any) => ref.ref === "m000002").atomRefs;
    const fullParams = { mode: "range", catalogId: status.references.catalogId, topic: "Tool work", ranges: [{ startRef: atomRefs[0], endRef: atomRefs.at(-1), summary: "old tool work" }] };
    mutationCall(entries, "atom", "aili_compact", fullParams);
    const full = await compact.execute("atom", fullParams, undefined, undefined, context(entries));
    expect(full.isError).not.toBe(true);
    expect(full.details.contextTx.blocks[0]?.sourceEntryIds).toEqual(["call", "result"]);

    const refreshed = await statusSnapshot(runtime, entries);
    const partialParams = { mode: "range", catalogId: refreshed.references.catalogId, topic: "Partial", ranges: [{ startRef: "m000002", endRef: "m000002", summary: "partial" }] };
    mutationCall(entries, "partial", "aili_compact", partialParams);
    const partial = await compact.execute("partial", partialParams, undefined, undefined, context(entries));
    expect(partial.isError).toBe(true);
    expect(partial.content[0].text).toContain("incomplete-atom");
  });

  it("fails open after an append-only session off control", () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "assistant", type: "message", message: { role: "assistant", content: "answer" } },
      {
        id: "off",
        type: "custom",
        customType: "aili-compact",
        data: { schema: "aili.compact.tx.v1", id: "off", kind: "control", epochId: "root", control: "off" },
      },
    ];
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    const messages = entries.filter((entry) => entry.type === "message").map((entry) => entry.message);
    const result = runtime.handlers.get("context")!({ type: "context", messages }, ctx);
    expect(result.messages).toBe(messages);
    expect(ctx.statuses.at(-1)).toContain("AILI Compact off");
  });

  it("shows the left/right aligned cache columns by default", () => {
    const runtime = harness();
    const ctx = context([
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "assistant", type: "message", message: { role: "assistant", content: "answer", usage: { input: 10, output: 5, cacheRead: 90, cacheWrite: 0 } } },
    ]);

    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);

    expect(ctx.widgets).toHaveLength(1);
    expect(ctx.widgets[0]?.key).toBe("aili-compact-cache");
    expect(ctx.widgets[0]?.content).toHaveLength(5);
    expect(ctx.widgets[0]?.content?.[0]).toMatch(/^【当前 Session 缓存统计（当前分支）】\s+【AILI 重复请求缓存稳定性诊断】$/);
    expect(ctx.widgets[0]?.content?.[1]).toMatch(/^命中率：90\.0%\s+有效请求滚动命中率：暂无（冷启动）$/);
  });

  it("does not rerender the cache widget when numeric presentation state is unchanged", () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "assistant", type: "message", message: { role: "assistant", content: "answer" } },
      {
        id: "panel-on",
        type: "custom",
        customType: "aili-compact",
        data: { schema: "aili.compact.tx.v1", id: "panel-on", kind: "control", epochId: "root", control: "panel-on" },
      },
    ];
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    const messages = entries.filter((entry) => entry.type === "message").map((entry) => entry.message);
    runtime.handlers.get("context")!({ type: "context", messages }, ctx);
    runtime.handlers.get("context")!({ type: "context", messages }, ctx);
    expect(ctx.widgets).toHaveLength(1);
    expect(ctx.widgets[0]?.key).toBe("aili-compact-cache");
  });

  it("replays current-branch Session usage once at startup and updates it incrementally", async () => {
    const historical = { id: "assistant-1", type: "message", message: { role: "assistant", content: "first", usage: { input: 10, output: 5, cacheRead: 90, cacheWrite: 0 } } };
    const entries: any[] = [{ id: "user", type: "message", message: { role: "user", content: "question" } }, historical];
    const runtime = harness();
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);

    await runtime.commandHandlers.get("aili-compact")!("cache", ctx);
    expect(ctx.notifications.at(-1)).toContain("【当前 Session 缓存统计（当前分支）】");
    expect(ctx.notifications.at(-1)).toContain("命中率：90.0%");
    expect(ctx.notifications.at(-1)).toContain("普通输入：10 · 输出：5");
    expect(ctx.notifications.at(-1)).toContain("缓存读取：90 · 缓存写入：0");

    const nextUsage = { input: 20, output: 10, cacheRead: 80, cacheWrite: 0 };
    runtime.handlers.get("message_end")!({ type: "message_end", message: { role: "assistant", usage: nextUsage } }, ctx);
    const status = await runtime.tools.find((tool) => tool.name === "aili_compact_status")!.execute("status", {}, undefined, undefined, ctx);
    expect(JSON.parse(status.content[0].text).sessionCache).toMatchObject({
      assistantResponses: 2, telemetryUnavailable: 0, input: 30, output: 15, cacheRead: 170, cacheWrite: 0, hitRate: 85,
    });

    entries.push({ id: "assistant-2", type: "message", message: { role: "assistant", content: "second", usage: nextUsage } });
    const reloaded = harness();
    const reloadedContext = context(entries);
    reloaded.handlers.get("session_start")!({ type: "session_start", reason: "reload" }, reloadedContext);
    await reloaded.commandHandlers.get("aili-compact")!("cache", reloadedContext);
    expect(reloadedContext.notifications.at(-1)).toContain("命中率：85.0%");
    expect(reloadedContext.notifications.at(-1)).toContain("模型响应：2 · 遥测不可用：0");
  });

  it("replays Session usage only when tree navigation selects another branch", async () => {
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "assistant", type: "message", message: { role: "assistant", content: "answer", usage: { input: 50, output: 5, cacheRead: 50, cacheWrite: 0 } } },
    ];
    const runtime = harness();
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    entries.splice(1, 1, { id: "alternate", type: "message", message: { role: "assistant", content: "alternate", usage: { input: 80, output: 8, cacheRead: 20, cacheWrite: 0 } } });
    runtime.handlers.get("session_tree")!({ type: "session_tree", newLeafId: "alternate" }, ctx);
    await runtime.commandHandlers.get("aili-compact")!("cache", ctx);
    expect(ctx.notifications.at(-1)).toContain("命中率：20.0%");
    expect(ctx.notifications.at(-1)).toContain("普通输入：80 · 输出：8");
    expect(ctx.notifications.at(-1)).toContain("缓存读取：20 · 缓存写入：0");
  });

  it("refuses to create a second active block over the same source reference", async () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "user-1", type: "message", message: { role: "user", content: "old question" } },
      { id: "assistant-1", type: "message", message: { role: "assistant", content: "old answer ".repeat(600) } },
      { id: "user-2", type: "message", message: { role: "user", content: "current question" } },
    ];
    entries.push(successfulCompactResult("existing-block", {
      schema: "aili.compact.tx.v1",
      id: "existing",
      kind: "compact",
      epochId: "root",
      blocks: [{
        id: "block:existing",
        kind: "semantic",
        epochId: "root",
        sourceEntryIds: ["assistant-1"],
        sourceDigest: sourceDigest(entries, ["assistant-1"]),
        summary: "old work",
        active: true,
      }],
    }));
    const status = await statusSnapshot(runtime, entries);
    const params = { mode: "message", catalogId: status.references.catalogId, topic: "Duplicate", items: [{ messageRef: "m000002", topic: "Duplicate", summary: "duplicate" }] };
    mutationCall(entries, "call-2", "aili_compact", params);
    const compact = runtime.tools.find((tool) => tool.name === "aili_compact")!;
    const result = await compact.execute("call-2", params, undefined, undefined, context(entries));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("invalid-lineage");
  });

  it("warns that turning AILI off does not re-enable Pi auto-compaction", async () => {
    const runtime = harness();
    const ctx = context([{ id: "user", type: "message", message: { role: "user", content: "question" } }]);
    await runtime.commandHandlers.get("aili-compact")!("off", ctx);
    expect(ctx.notifications.at(-1)).toContain("Pi auto-compaction remains disabled");
  });

  it("persists manual-mode toggles as independent session controls", async () => {
    const runtime = harness();
    const ctx = context([{ id: "user", type: "message", message: { role: "user", content: "question" } }]);
    await runtime.commandHandlers.get("aili-compact")!("manual on", ctx);
    expect(runtime.appended).toEqual([expect.objectContaining({
      customType: "aili-compact",
      data: expect.objectContaining({ kind: "control", control: "manual-on" }),
    })]);
  });

  it("runs a bounded manual sweep only for a safely consumed paired tool result", async () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "notes.txt" } }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "call-1", toolName: "read", content: "x".repeat(9_000) } },
      { id: "later", type: "message", message: { role: "assistant", content: "consumed" } },
    ];
    await runtime.commandHandlers.get("aili-compact")!("sweep", context(entries));
    expect(runtime.appended).toEqual([expect.objectContaining({
      customType: "aili-compact",
      data: expect.objectContaining({
        kind: "cool",
        blocks: [expect.objectContaining({ id: "cool:result", sourceEntryIds: ["result"], kind: "cool" })],
      }),
    })]);
  });

  it("reports a bounded cooling candidate without exposing tool output", async () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "notes.txt" } }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "call-1", toolName: "read", content: "x".repeat(9_000) } },
      { id: "completed-turn", type: "message", message: { role: "assistant", content: "consumed" } },
    ];
    const status = runtime.tools.find((tool) => tool.name === "aili_compact_status")!;
    const result = await status.execute("status", {}, undefined, undefined, context(entries));
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      autoCooling: true,
      coolingCandidate: { idHash: expect.stringMatching(/^[a-f0-9]{16}$/), sourceCount: 1 },
    });
    expect(result.content[0].text).not.toContain("x".repeat(40));
    expect(result.content[0].text).not.toContain("sourceEntryIds");
  });

  it("exposes a bounded reference catalog and read-only recap list/get", async () => {
    const runtime = harness();
    const source = { id: "old", type: "message", message: { role: "assistant", content: "old source body" } };
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      source,
      successfulCompactResult("block-result", {
        schema: "aili.compact.tx.v1",
        id: "block-call",
        kind: "compact",
        epochId: "root",
        blocks: [{ id: "block:one", kind: "semantic", epochId: "root", sourceEntryIds: ["old"], sourceDigest: sourceDigest([source], ["old"]), summary: "persisted recap summary", active: true }],
      }),
    ];
    const ctx = context(entries);
    const status = runtime.tools.find((tool) => tool.name === "aili_compact_status")!;
    const statusResult = JSON.parse((await status.execute("status", { offset: 0, limit: 1 }, undefined, undefined, ctx)).content[0].text);
    expect(statusResult.references).toMatchObject({
      catalogId: expect.any(String),
      offset: 0,
      limit: 1,
      refs: [expect.objectContaining({ ref: "m000001", role: "user", atomRefs: ["m000001"] })],
      candidates: [expect.objectContaining({ ref: "m000001", compressible: expect.any(Boolean), reasonCodes: expect.any(Array) })],
      activeRecaps: [expect.objectContaining({ blockRef: "b000001", summaryPreview: "persisted recap summary" })],
      policyReasons: expect.any(Array),
      nextOffset: 1,
    });
    expect(JSON.stringify(statusResult.references)).not.toContain("old source body");

    const recap = runtime.tools.find((tool) => tool.name === "aili_context_recap")!;
    const listed = JSON.parse((await recap.execute("list", {}, undefined, undefined, ctx)).content[0].text);
    expect(listed.activeBlocks).toEqual([expect.objectContaining({ blockRef: "b000001", summaryPreview: "persisted recap summary" })]);
    const fetched = JSON.parse((await recap.execute("get", { blockRef: "b000001" }, undefined, undefined, ctx)).content[0].text);
    expect(fetched).toMatchObject({ blockRef: "b000001", summary: "persisted recap summary" });
    expect(JSON.stringify(fetched)).not.toContain("old source body");
  });

  it("appends at most one automatic cooling transaction for the same completed assistant turn", () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "notes.txt" } }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "call-1", toolName: "read", content: "x".repeat(9_000) } },
      { id: "completed-turn", type: "message", message: { role: "assistant", content: "consumed" } },
    ];
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    runtime.handlers.get("turn_end")!({ type: "turn_end" }, ctx);
    runtime.handlers.get("turn_end")!({ type: "turn_end" }, ctx);
    expect(runtime.appended).toHaveLength(1);
    expect(runtime.appended[0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({ kind: "cool", blocks: [expect.objectContaining({ id: "cool:result" })] }),
    }));
  });

  it("journals one grouped dedupe strategy transaction at turn end", () => {
    const runtime = harness();
    const repeated = "d".repeat(3_000);
    const entries: any[] = [
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "call-1", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "one.txt" } }] } },
      { id: "result-1", type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "read", content: repeated } },
      { id: "used-1", type: "message", message: { role: "assistant", content: "used one" } },
      { id: "call-2", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-2", name: "read", arguments: { path: "two.txt" } }] } },
      { id: "result-2", type: "message", message: { role: "toolResult", toolCallId: "read-2", toolName: "read", content: repeated } },
      { id: "used-2", type: "message", message: { role: "assistant", content: "used two" } },
    ];
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    runtime.handlers.get("turn_end")!({ type: "turn_end" }, ctx);
    expect(runtime.appended).toHaveLength(1);
    expect(runtime.appended[0]!.data).toMatchObject({
      kind: "cool",
      policy: { strategy: "dedupe", sourceEntryIds: ["result-1"] },
      blocks: [expect.objectContaining({ id: "dedupe:result-1", sourceEntryIds: ["result-1"] })],
    });
  });

  it("injects bounded adaptive guidance through the public system-prompt hook", () => {
    const runtime = harness();
    const entries: any[] = [{ id: "user", type: "message", message: { role: "user", content: "x".repeat(7_000) } }];
    const ctx = context(entries, { tokens: 6_000, contextWindow: 10_000 });
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    const result = runtime.handlers.get("before_agent_start")!({ type: "before_agent_start", systemPrompt: "PI BASE" }, ctx);
    expect(result.systemPrompt).toContain("AILI Compact adaptive guidance");
    expect(result.systemPrompt).toContain("aili_compact_status");
  });

  it("appends replayable emergency summary GC only at the provider boundary", () => {
    const runtime = harness();
    const source = { id: "source", type: "message", message: { role: "assistant", content: "source" } };
    const entries: any[] = [source, { id: "current", type: "message", message: { role: "user", content: "current" } }];
    entries.push(successfulCompactResult("block-result", {
      schema: "aili.compact.tx.v2", id: "block-tx", kind: "compact", epochId: "root",
      blocks: [{ id: "block", kind: "semantic", epochId: "root", sourceEntryIds: ["source"], sourceDigest: sourceDigest(entries, ["source"]), summary: "s".repeat(4_000), active: true,
        mode: "message", topic: "topic", batchTopic: "batch", anchorEntryId: "source", runId: "block-tx", childBlockIds: [], generation: "old", survivedCount: 5, age: 5 }],
    }));
    const ctx = context(entries, { tokens: 10_000, contextWindow: 10_000 });
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    runtime.handlers.get("before_agent_start")!({ type: "before_agent_start", systemPrompt: "PI BASE" }, ctx);
    expect(runtime.appended).toEqual([expect.objectContaining({ data: expect.objectContaining({
      kind: "control", id: "gc:emergency:block-result",
      lifecycleUpdates: [{ blockId: "block", summary: expect.stringMatching(/…$/) }],
    }) })]);
  });

  it("classifies runtime cache telemetry over one cold plus five warm requests", async () => {
    const runtime = harness();
    const entries: any[] = [{ id: "user", type: "message", message: { role: "user", content: "question" } }];
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    runtime.handlers.get("before_agent_start")!({ type: "before_agent_start", systemPrompt: "PI BASE" }, ctx);
    const messages = entries.map((entry) => entry.message);
    for (let index = 0; index < 6; index++) {
      runtime.handlers.get("context")!({ type: "context", messages }, ctx);
      runtime.handlers.get("message_end")!({ message: { role: "assistant", usage: { input: 10, output: 5, cacheRead: 90, cacheWrite: 0 } } }, ctx);
    }
    const status = await runtime.tools.find((tool) => tool.name === "aili_compact_status")!.execute("status", {}, undefined, undefined, ctx);
    const details = JSON.parse(status.content[0].text);
    expect(details.cache).toMatchObject({ eligible: 5, ineligibleCold: 1, unavailable: 0, hitRate: 90 });
    expect(details.sessionCache).toMatchObject({ assistantResponses: 6, input: 60, output: 30, cacheRead: 540, cacheWrite: 0, hitRate: 90 });
  });

  it("archives pre-native-epoch blocks for query-only access", async () => {
    const runtime = harness();
    const source = { id: "old", type: "message", message: { role: "assistant", content: "archived needle" } };
    const entries: any[] = [
      source,
      successfulCompactResult("old-block", {
        schema: "aili.compact.tx.v1",
        id: "old-tx",
        kind: "compact",
        epochId: "root",
        blocks: [{ id: "block:old", kind: "semantic", epochId: "root", sourceEntryIds: ["old"], sourceDigest: sourceDigest([source], ["old"]), summary: "old", active: true }],
      }),
      { id: "native-epoch", type: "compaction" },
      { id: "current", type: "message", message: { role: "user", content: "current question" } },
    ];
    const ctx = context(entries);
    const status = await statusSnapshot(runtime, entries);
    const params = { catalogId: status.references.catalogId, blockRefs: ["b000001"] };
    mutationCall(entries, "restore-old", "aili_decompress", params);
    const decompress = runtime.tools.find((tool) => tool.name === "aili_decompress")!;
    const restored = await decompress.execute("restore-old", params, undefined, undefined, ctx);
    expect(restored.isError).toBe(true);
    expect(restored.content[0].text).toContain("unknown-reference");

    const search = runtime.tools.find((tool) => tool.name === "aili_search_context")!;
    const searched = await search.execute("search-old", { query: "needle" }, undefined, undefined, ctx);
    expect(JSON.parse(searched.content[0].text)).toMatchObject({
      scope: "current_branch",
      catalogId: expect.any(String),
      matches: [{ archived: true, sourceIdHash: expect.stringMatching(/^[a-f0-9]{16}$/), excerpt: "archived needle" }],
    });
  });

  it("rejects sibling mutation calls and stale catalogs without committing", async () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "old", type: "message", message: { role: "assistant", content: "historical source ".repeat(500) } },
      { id: "current", type: "message", message: { role: "user", content: "current" } },
    ];
    const status = await statusSnapshot(runtime, entries);
    const compact = runtime.tools.find((tool) => tool.name === "aili_compact")!;
    const params = { mode: "message", catalogId: status.references.catalogId, topic: "History", items: [{ messageRef: "m000001", topic: "History", summary: "bounded history" }] };
    entries.push({ id: "assistant:sibling", type: "message", message: { role: "assistant", content: [
      { type: "toolCall", id: "sibling", name: "aili_compact", arguments: params },
      { type: "toolCall", id: "other", name: "read", arguments: { path: "notes.txt" } },
    ] } });
    const sibling = await compact.execute("sibling", params, undefined, undefined, context(entries));
    expect(sibling.isError).toBe(true);
    expect(sibling.content[0].text).toContain("mutation-conflict");

    entries.push({ id: "catalog-change", type: "message", message: { role: "assistant", content: "new branch content" } });
    mutationCall(entries, "stale", "aili_compact", params);
    const stale = await compact.execute("stale", params, undefined, undefined, context(entries));
    expect(stale.isError).toBe(true);
    expect(stale.content[0].text).toContain("stale-catalog");
  });

  it("decompresses by status block ref with a bounded UTF-8 preview", async () => {
    const runtime = harness();
    const source = { id: "old", type: "message", message: { role: "assistant", content: "界".repeat(2_000) } };
    const entries: any[] = [source, successfulCompactResult("block-result", {
      schema: "aili.compact.tx.v1", id: "block-call", kind: "compact", epochId: "root",
      blocks: [{ id: "block:one", kind: "semantic", epochId: "root", sourceEntryIds: ["old"], sourceDigest: sourceDigest([source], ["old"]), summary: "old source", active: true }],
    }), { id: "current", type: "message", message: { role: "user", content: "current" } }];
    const status = await statusSnapshot(runtime, entries);
    const blockRef = status.references.activeRecaps[0].blockRef;
    const params = { catalogId: status.references.catalogId, blockRefs: [blockRef] };
    mutationCall(entries, "restore", "aili_decompress", params);
    const result = await runtime.tools.find((tool) => tool.name === "aili_decompress")!.execute("restore", params, undefined, undefined, context(entries));
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.restored).toEqual([blockRef]);
    expect(result.details.contextTx).toMatchObject({ kind: "decompress", deactivateBlockIds: ["block:one"] });
    expect(Buffer.byteLength(payload.preview.excerpts.map((item: any) => item.text).join(""), "utf8")).toBeLessThanOrEqual(2_000);
    expect(payload.preview).toMatchObject({ utf8Bytes: 1_998, truncated: true });
  });

  it("issues one append plus one request for manual one-shot and has no effects while busy", async () => {
    const runtime = harness();
    const entries = [{ id: "user", type: "message", message: { role: "user", content: "question" } }];
    await runtime.commandHandlers.get("aili-compact")!("compress accepted decisions", context(entries));
    expect(runtime.appended).toHaveLength(1);
    expect(runtime.appended[0]?.data).toMatchObject({ kind: "control", control: "manual-trigger" });
    expect(runtime.requested).toEqual([expect.stringContaining("accepted decisions")]);

    const busy = harness();
    await busy.commandHandlers.get("aili-compact")!("compress", context(entries, undefined, "/project", { idle: false, pending: true }));
    expect(busy.appended).toEqual([]);
    expect(busy.requested).toEqual([]);
  });

  it("clears a one-shot trigger if the visible request cannot be started", async () => {
    const runtime = harness({ sendUserMessageThrows: true });
    const ctx = context([{ id: "user", type: "message", message: { role: "user", content: "question" } }]);
    await runtime.commandHandlers.get("aili-compact")!("compress", ctx);
    expect(runtime.requested).toEqual([]);
    expect(runtime.appended).toHaveLength(2);
    const trigger = runtime.appended[0]!.data as any;
    expect(runtime.appended[1]!.data).toMatchObject({ control: "manual-clear", consumeManualTriggerId: trigger.manualTrigger.id });
    expect(ctx.notifications.at(-1)).toContain("trigger was cleared");
  });

  it("binds a manual trigger to one exact turn and rejects reuse", async () => {
    const runtime = harness();
    const source = { id: "source", type: "message", message: { role: "assistant", content: "x".repeat(7_000) } };
    const entries: any[] = [
      { id: "anchor", type: "message", message: { role: "user", content: "earlier request" } }, source,
      { id: "manual-on-entry", type: "custom", customType: "aili-compact", data: { schema: "aili.compact.tx.v2", id: "manual-on", kind: "control", epochId: "root", control: "manual-on" } },
      { id: "trigger-entry", type: "custom", customType: "aili-compact", data: { schema: "aili.compact.tx.v2", id: "trigger-tx", kind: "control", epochId: "root", control: "manual-trigger", manualTrigger: { id: "trigger", turnId: "manual-on-entry" } } },
      { id: "one-shot-user", type: "message", message: { role: "user", content: "one shot" } },
    ];
    const snapshot = await statusSnapshot(runtime, entries);
    mutationCall(entries, "manual-compact", "aili_compact", {});
    const compact = runtime.tools.find((tool) => tool.name === "aili_compact")!;
    const first = await compact.execute("manual-compact", {
      mode: "message", catalogId: snapshot.references.catalogId, topic: "manual",
      items: [{ messageRef: "m000002", topic: "source", summary: "bounded manual summary" }],
    }, undefined, undefined, context(entries));
    expect(first.isError).not.toBe(true);
    expect(first.details.contextTx.consumeManualTriggerId).toBe("trigger");
    entries.push(successfulCompactResult("manual-result", first.details.contextTx, "manual-compact"));
    mutationCall(entries, "manual-reuse", "aili_compact", {});
    const reused = await compact.execute("manual-reuse", {
      mode: "message", catalogId: snapshot.references.catalogId, topic: "manual",
      items: [{ messageRef: "m000002", topic: "source", summary: "second" }],
    }, undefined, undefined, context(entries));
    expect(reused.isError).toBe(true);
    expect(reused.content[0].text).toContain("fresh /aili-compact compress trigger");
  });

  it("keeps task/subagent atoms protected for model compact and prune while default-off", async () => {
    const runtime = harness();
    const makeEntries = () => [
      { id: "user", type: "message", message: { role: "user", content: "delegate" } },
      { id: "task-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "task-1", name: "task", arguments: { task: "bounded" } }] } },
      { id: "task-result", type: "message", message: { role: "toolResult", toolCallId: "task-1", toolName: "task", content: "x".repeat(9_000), details: { status: "accepted", agentId: "agent-1", jobId: "job-1" } } },
      { id: "later", type: "message", message: { role: "assistant", content: "waiting" } },
      { id: "current", type: "message", message: { role: "user", content: "continue" } },
    ];
    const compactEntries: any[] = makeEntries();
    const compactSnapshot = await statusSnapshot(runtime, compactEntries);
    mutationCall(compactEntries, "compact-task", "aili_compact", {});
    const compact = runtime.tools.find((tool) => tool.name === "aili_compact")!;
    const compactResult = await compact.execute("compact-task", {
      mode: "message", catalogId: compactSnapshot.references.catalogId, topic: "task",
      items: [{ messageRef: "m000002", topic: "task", summary: "task summary" }],
    }, undefined, undefined, context(compactEntries));
    expect(compactResult.isError).toBe(true);
    expect(compactResult.content[0].text).toContain("subagent-disabled");

    const pruneEntries: any[] = makeEntries();
    const pruneSnapshot = await statusSnapshot(runtime, pruneEntries);
    mutationCall(pruneEntries, "prune-task", "aili_prune", {});
    const prune = runtime.tools.find((tool) => tool.name === "aili_prune")!;
    const pruneResult = await prune.execute("prune-task", { catalogId: pruneSnapshot.references.catalogId, messageRefs: ["m000002"] }, undefined, undefined, context(pruneEntries));
    expect(pruneResult.isError).toBe(true);
    expect(pruneResult.content[0].text).toContain("subagent-disabled");
  });

  it("prunes an explicitly referenced consumed protocol atom", async () => {
    const runtime = harness();
    const entries: any[] = [
      { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "read-1", name: "read", arguments: { path: "notes.txt" } }] } },
      { id: "result", type: "message", message: { role: "toolResult", toolCallId: "read-1", toolName: "read", content: "consumed output" } },
      { id: "consumed", type: "message", message: { role: "assistant", content: "used the result" } },
      { id: "current", type: "message", message: { role: "user", content: "current" } },
    ];
    const status = await statusSnapshot(runtime, entries);
    const params = { catalogId: status.references.catalogId, messageRefs: [status.references.refs[0].ref] };
    mutationCall(entries, "prune", "aili_prune", params);
    const result = await runtime.tools.find((tool) => tool.name === "aili_prune")!.execute("prune", params, undefined, undefined, context(entries));
    expect(result.isError).not.toBe(true);
    expect(result.details.contextTx).toMatchObject({ kind: "prune", blocks: [{ sourceEntryIds: ["call", "result"] }] });
  });

  it("keeps context, stats, and sweep command bounds distinct", async () => {
    const runtime = harness();
    const entries: any[] = [{ id: "user", type: "message", message: { role: "user", content: "question" } }];
    const ctx = context(entries);
    await runtime.commandHandlers.get("aili-compact")!("context 0 1", ctx);
    expect(JSON.parse(ctx.notifications.at(-1)!)).toMatchObject({ offset: 0, limit: 1, refs: expect.any(Array), candidates: expect.any(Array) });
    await runtime.commandHandlers.get("aili-compact")!("stats", ctx);
    expect(JSON.parse(ctx.notifications.at(-1)!)).toMatchObject({ scope: "current-session/current-branch", session: expect.any(Object), branch: expect.any(Object), cache: expect.any(Object) });
    await runtime.commandHandlers.get("aili-compact")!("sweep 16", ctx);
    expect(runtime.appended).toEqual([]);
    expect(ctx.notifications.at(-1)).toContain("no safe grouped candidates");
  });

  it("persists the cache-widget toggle as append-only session control", async () => {
    const runtime = harness();
    const ctx = context([{ id: "user", type: "message", message: { role: "user", content: "question" } }]);
    await runtime.commandHandlers.get("aili-compact")!("cache panel on", ctx);
    expect(runtime.appended).toEqual([expect.objectContaining({
      customType: "aili-compact",
      data: expect.objectContaining({ kind: "control", control: "panel-on" }),
    })]);
  });

  it("reports bounded local doctor severity instead of command-registration health", async () => {
    const runtime = harness();
    const entries = [{ id: "user", type: "message", message: { role: "user", content: "RAW_DOCTOR_SENTINEL" } }];
    const ctx = context(entries);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    await runtime.commandHandlers.get("aili-compact")!("doctor", ctx);
    expect(JSON.parse(ctx.notifications.at(-1)!)).toMatchObject({
      status: "NON_PASS",
      components: {
        projection: { status: "UNVERIFIED" },
        publicRelease: { status: "PASS", code: "AGPL-3.0-OR-LATER" },
      },
    });
    expect(ctx.notifications.at(-1)).not.toContain("RAW_DOCTOR_SENTINEL");

    runtime.handlers.get("context")!({ type: "context", messages: [{ role: "assistant", content: "invalid" }] }, ctx);
    await runtime.commandHandlers.get("aili-compact")!("doctor", ctx);
    expect(JSON.parse(ctx.notifications.at(-1)!)).toMatchObject({ status: "ERROR", components: { projection: { status: "ERROR" } } });
  });

  it("cancels healthy manual Pi compaction with AILI Compact guidance", () => {
    const runtime = harness();
    const ctx = context([{ id: "user", type: "message", message: { role: "user", content: "question" } }]);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    projectHealthy(runtime, ctx.sessionManager.getBranch(), ctx);
    const result = runtime.handlers.get("session_before_compact")!({ reason: "manual" }, ctx);
    expect(result).toEqual({ cancel: true });
    expect(ctx.notifications.at(-1)).toContain("/aili-compact context");
  });

  it("cancels manual Pi compaction even when projection health is unavailable", () => {
    const runtime = harness();
    const ctx = context([
      { id: "user", type: "message", message: { role: "user", content: "question" } },
      { id: "orphan", type: "message", message: { role: "toolResult", toolCallId: "missing", toolName: "read", content: "orphan" } },
    ]);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    expect(runtime.handlers.get("session_before_compact")!({ reason: "manual" }, ctx)).toEqual({ cancel: true });
    expect(ctx.notifications.at(-1)).toContain("/aili-compact context");
  });

  it("cancels threshold and overflow without returning a Pi compaction envelope", () => {
    const runtime = harness();
    const ctx = context([{ id: "user", type: "message", message: { role: "user", content: "question" } }]);
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    expect(runtime.handlers.get("session_before_compact")!({ reason: "threshold" }, ctx)).toEqual({ cancel: true });
    expect(runtime.handlers.get("session_before_compact")!({ reason: "overflow" }, ctx)).toEqual({ cancel: true });
    expect(ctx.notifications).toEqual([]);
  });

  it("never returns a Pi major-GC envelope from overflow", () => {
    const runtime = harness();
    const oldUser = { id: "old-user", type: "message", message: { role: "user", content: "old question" } };
    const oldAssistant = { id: "old-assistant", type: "message", message: { role: "assistant", content: "old answer" } };
    const middleUser = { id: "middle-user", type: "message", message: { role: "user", content: "middle question" } };
    const middleAssistant = { id: "middle-assistant", type: "message", message: { role: "assistant", content: "middle answer" } };
    const laterUser = { id: "later-user", type: "message", message: { role: "user", content: "later question" } };
    const laterAssistant = { id: "later-assistant", type: "message", message: { role: "assistant", content: "later answer" } };
    const entries: any[] = [oldUser, oldAssistant, middleUser, middleAssistant, laterUser, laterAssistant];
    const coveredSourceIds = entries.map((entry) => entry.id);
    entries.push({ id: "semantic-call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "semantic-tx", name: "aili_compact", arguments: {} }] } });
    entries.push(successfulCompactResult("semantic", {
      schema: "aili.compact.tx.v2",
      id: "semantic-tx",
      kind: "compact",
      epochId: "root",
      blocks: [{
        id: "semantic:old",
        kind: "semantic",
        epochId: "root",
        sourceEntryIds: coveredSourceIds,
        sourceDigest: sourceDigest(entries, coveredSourceIds),
        summary: "Old work is complete.",
        active: true,
        mode: "range",
        topic: "Old work",
        batchTopic: "Old work",
        anchorEntryId: "old-user",
        runId: "semantic-tx",
        childBlockIds: [],
        generation: "old",
        survivedCount: 5,
        age: 5,
      }],
    }));
    entries.push({ id: "tail-one", type: "message", message: { role: "user", content: "tail question" } });
    entries.push({ id: "kept", type: "message", message: { role: "user", content: "current question" } });
    const ctx = context(entries, { tokens: 32_000, contextWindow: 32_000 });
    runtime.handlers.get("session_start")!({ type: "session_start" }, ctx);
    projectHealthy(runtime, entries, ctx);
    const result = runtime.handlers.get("session_before_compact")!({
      reason: "overflow",
      branchEntries: entries,
      preparation: { firstKeptEntryId: "tail-one", tokensBefore: 32_000 },
    }, ctx);
    expect(result).toEqual({ cancel: true });
    expect(result).not.toHaveProperty("compaction");
    expect(ctx.notifications).toEqual([]);
  });

  it("cancels threshold compaction without using a native fallback budget", () => {
    const runtime = harness();
    const activeEntries = (content: string) => {
      const source = { id: "old", type: "message", message: { role: "assistant", content } };
      const entries: any[] = [source, { id: "user", type: "message", message: { role: "user", content: "current" } }];
      const transactionId = `block-tx:${content.length}`;
      entries.push({ id: `call:${content.length}`, type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: transactionId, name: "aili_compact", arguments: {} }] } });
      entries.push(successfulCompactResult("tx", {
        schema: "aili.compact.tx.v1",
        id: transactionId,
        kind: "compact",
        epochId: "root",
        blocks: [{ id: "block", kind: "semantic", epochId: "root", sourceEntryIds: ["old"], sourceDigest: sourceDigest(entries, ["old"]), summary: "old", active: true }],
      }));
      return entries;
    };
    const safe = context(activeEntries("x".repeat(40_000)), { tokens: 19_500, contextWindow: 20_000 });
    runtime.handlers.get("session_start")!({ type: "session_start" }, safe);
    projectHealthy(runtime, safe.sessionManager.getBranch(), safe);
    expect(runtime.handlers.get("session_before_compact")!({ reason: "threshold" }, safe)).toEqual({ cancel: true });

    const unsafe = context(activeEntries("x".repeat(400)), { tokens: 20_000, contextWindow: 20_000 });
    runtime.handlers.get("session_start")!({ type: "session_start" }, unsafe);
    projectHealthy(runtime, unsafe.sessionManager.getBranch(), unsafe);
    expect(runtime.handlers.get("session_before_compact")!({ reason: "threshold" }, unsafe)).toEqual({ cancel: true });
  });
});
