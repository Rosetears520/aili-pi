import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  Type,
} from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import registerObservationalMemory from "../../extensions/observational-memory/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aili-pi-0844-"));
  roots.push(root);
  return root;
}

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function runtimeWithFaux(options: {
  root: string;
  contextWindow?: number;
  extensions?: InlineExtension[];
}) {
  const faux = fauxProvider({
    provider: `aili-test-${randomUUID()}`,
    models: [{ id: "ordering", contextWindow: options.contextWindow ?? 64_000, maxTokens: 2_048 }],
    tokensPerSecond: 1_000_000,
  });
  const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false, modelsPath: null });
  modelRuntime.registerNativeProvider(faux.provider);
  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    cwd: options.root,
    agentDir: join(options.root, "agent"),
    settingsManager,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: options.extensions ?? [],
    systemPrompt: "Deterministic official Pi integration fixture.",
  });
  await resourceLoader.reload();
  return { faux, modelRuntime, settingsManager, resourceLoader, model: faux.getModel() };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text"
    ? [String((part as { text?: unknown }).text ?? "")]
    : []).join("");
}

describe("official Pi 0.84.4 ordering seams", () => {
  it("resumes a valid JSONL without a trailing newline and keeps the next append parseable", async () => {
    const root = await fixtureRoot();
    const sessionPath = join(root, "resumed.jsonl");
    const header = { type: "session", version: 3, id: randomUUID(), timestamp: new Date().toISOString(), cwd: root };
    const oldEntry = {
      type: "message", id: "11111111", parentId: null, timestamp: new Date().toISOString(),
      message: { role: "user", content: "persisted-before-resume", timestamp: Date.now() },
    };
    await writeFile(sessionPath, `${JSON.stringify(header)}\n${JSON.stringify(oldEntry)}`, "utf8");

    const fixture = await runtimeWithFaux({ root });
    fixture.faux.setResponses([fauxAssistantMessage("resumed-ok")]);
    const manager = SessionManager.open(sessionPath);
    const { session } = await createAgentSession({
      cwd: root,
      model: fixture.model,
      modelRuntime: fixture.modelRuntime,
      resourceLoader: fixture.resourceLoader,
      settingsManager: fixture.settingsManager,
      sessionManager: manager,
      noTools: "all",
    });
    try {
      await session.prompt("append-after-resume", { expandPromptTemplates: false });
    } finally {
      session.dispose();
    }

    const bytes = await readFile(sessionPath, "utf8");
    expect(bytes).toContain(`${JSON.stringify(oldEntry)}\n`);
    const lines = bytes.trimEnd().split("\n");
    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed[0]).toMatchObject({ type: "session", version: 3, id: header.id });
    expect(parsed).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "message", message: expect.objectContaining({ role: "user", content: "persisted-before-resume" }) }),
      expect.objectContaining({ type: "message", message: expect.objectContaining({ role: "user" }) }),
      expect.objectContaining({ type: "message", message: expect.objectContaining({ role: "assistant" }) }),
    ]));
    expect(parsed.some((entry) => entry.type === "message" && entry.message?.role === "user" && textOf(entry.message.content) === "append-after-resume")).toBe(true);
  });

  it("places triggerTurn:false custom delivery after its in-flight tool result and replays a valid provider order", async () => {
    const root = await fixtureRoot();
    let api: ExtensionAPI | undefined;
    const replayContexts: AgentMessage[][] = [];
    const extension: InlineExtension = {
      name: "ordering-injector",
      factory(pi) {
        api = pi;
        pi.on("context", (event) => { replayContexts.push(structuredClone(event.messages)); });
      },
    };
    const fixture = await runtimeWithFaux({ root, extensions: [extension] });
    let releaseTool!: () => void;
    const toolStarted = new Promise<void>((resolve) => { releaseTool = resolve; });
    let entered = false;
    const tool = defineTool({
      name: "held_tool",
      label: "Held tool",
      description: "A deterministic held tool",
      parameters: Type.Object({}),
      async execute() {
        entered = true;
        await toolStarted;
        return { content: [{ type: "text" as const, text: "matching-result" }], details: { owner: "held_tool" } };
      },
    });
    fixture.faux.setResponses([
      fauxAssistantMessage(fauxToolCall("held_tool", {}, { id: "call-held" }), { stopReason: "toolUse" }),
      fauxAssistantMessage("after-tool"),
      fauxAssistantMessage("after-next-user-turn"),
      fauxAssistantMessage("after-background-delivery"),
    ]);
    const manager = SessionManager.create(root, join(root, "sessions"));
    const { session } = await createAgentSession({
      cwd: root,
      model: fixture.model,
      modelRuntime: fixture.modelRuntime,
      resourceLoader: fixture.resourceLoader,
      settingsManager: fixture.settingsManager,
      sessionManager: manager,
      customTools: [tool],
      tools: ["held_tool"],
    });
    try {
      const running = session.prompt("run held tool", { expandPromptTemplates: false });
      await waitFor(() => entered, "held tool never entered");
      api!.sendMessage({ customType: "in-flight-note", content: "queued-during-tool", display: false }, { triggerTurn: false });
      releaseTool();
      await running;

      const ordered = manager.getEntries().filter((entry) => entry.type === "message" || entry.type === "custom_message");
      const assistantCall = ordered.findIndex((entry) => entry.type === "message" && entry.message.role === "assistant" && entry.message.content.some((part) => part.type === "toolCall"));
      const toolResult = ordered.findIndex((entry) => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolCallId === "call-held");
      const custom = ordered.findIndex((entry) => entry.type === "custom_message" && entry.customType === "in-flight-note");
      expect(assistantCall).toBeGreaterThanOrEqual(0);
      expect(toolResult).toBeGreaterThan(assistantCall);
      expect(custom).toBeGreaterThan(toolResult);
      // triggerTurn:false preserves history ordering but does not itself start a
      // provider request. The next explicit prompt replays that ordered history.
      await session.prompt("replay queued custom message", { expandPromptTemplates: false });
      const replay = replayContexts.find((messages) => messages.some((message) => message.role === "custom" && textOf("content" in message ? message.content : undefined) === "queued-during-tool"))!;
      expect(replay).toBeDefined();
      const replayAssistant = replay.findIndex((message) => message.role === "assistant" && message.content.some((part) => part.type === "toolCall" && part.id === "call-held"));
      const replayToolResult = replay.findIndex((message) => message.role === "toolResult" && message.toolCallId === "call-held");
      const replayCustom = replay.findIndex((message) => message.role === "custom" && textOf("content" in message ? message.content : undefined) === "queued-during-tool");
      expect(replayAssistant).toBeGreaterThanOrEqual(0);
      expect(replayToolResult).toBeGreaterThan(replayAssistant);
      expect(replayCustom).toBeGreaterThan(replayToolResult);
      const replayedToolResult = replay[replayToolResult]!;
      expect(textOf("content" in replayedToolResult ? replayedToolResult.content : undefined)).toBe("matching-result");

      const callsBeforeBackgroundDelivery = fixture.faux.state.callCount;
      api!.sendMessage({ customType: "aili.agent-result", content: "background-result", display: true }, { triggerTurn: true, deliverAs: "nextTurn" });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fixture.faux.state.callCount).toBe(callsBeforeBackgroundDelivery);
      await session.prompt("consume next-turn delivery", { expandPromptTemplates: false });
      expect(replayContexts.some((messages) => messages.some((message) => message.role === "custom" && textOf(message.content) === "background-result"))).toBe(true);
    } finally {
      session.dispose();
    }
  });

  it("awaits the side-effect-only memory barrier on native threshold compaction without taking ownership", async () => {
    const root = await fixtureRoot();
    const timeline: string[] = [];
    const observedBodies: string[] = [];
    let releaseObservation!: () => void;
    const observationGate = new Promise<void>((resolve) => { releaseObservation = resolve; });
    const rawMarker = "RAW_TOOL_BODY_MUST_NOT_ENTER_MEMORY";
    const memoryAndOwner: InlineExtension = {
      name: "memory-barrier-and-owner",
      factory(pi) {
        registerObservationalMemory(pi, {
          tokenThreshold: 1,
          observer: {
            async extract(batch) {
              timeline.push("memory:start");
              observedBodies.push(JSON.stringify(batch));
              await observationGate;
              timeline.push("memory:end");
              return { schemaVersion: 1, candidates: [] };
            },
          },
        });
        pi.on("session_before_compact", (event) => {
          timeline.push("owner");
          return {
            compaction: {
              summary: "OWNER_SUMMARY_UNCHANGED",
              firstKeptEntryId: event.preparation.firstKeptEntryId,
              tokensBefore: event.preparation.tokensBefore,
              details: { owner: "fixture-context-owner" },
            },
          };
        });
        pi.on("tool_execution_end", (event) => { timeline.push(`tool:end:${event.toolCallId}`); });
      },
    };
    const fixture = await runtimeWithFaux({ root, contextWindow: 50_000, extensions: [memoryAndOwner] });
    const hugeBody = `${rawMarker}:${Array.from({ length: 60_000 }, (_, index) => `token${index}`).join(" ")}`;
    const tool = defineTool({
      name: "large_result",
      label: "Large result",
      description: "Returns a result larger than the native compaction threshold",
      parameters: Type.Object({}),
      async execute() {
        return { content: [{ type: "text" as const, text: hugeBody }], details: { owner: "large_result", stable: true } };
      },
    });
    fixture.faux.setResponses([
      fauxAssistantMessage(fauxToolCall("large_result", {}, { id: "large-call" }), { stopReason: "toolUse" }),
      fauxAssistantMessage("resumed-after-native-compaction"),
    ]);
    const manager = SessionManager.create(root, join(root, "sessions"));
    const events: string[] = [];
    const { session } = await createAgentSession({
      cwd: root,
      model: fixture.model,
      modelRuntime: fixture.modelRuntime,
      resourceLoader: fixture.resourceLoader,
      settingsManager: fixture.settingsManager,
      sessionManager: manager,
      customTools: [tool],
      tools: ["large_result"],
    });
    session.subscribe((event) => {
      if (event.type === "tool_execution_end") events.push(`tool_execution_end:${event.toolCallId}`);
      if (event.type === "message_end" && event.message.role === "assistant" && textOf(event.message.content) === "resumed-after-native-compaction") timeline.push("assistant:resumed");
      if (event.type === "compaction_start") {
        events.push(`compaction_start:${event.reason}`);
        timeline.push(`compaction:start:${event.reason}`);
        releaseObservation();
      }
    });
    try {
      await session.prompt("produce the large result", { expandPromptTemplates: false });
    } finally {
      session.dispose();
    }

    expect(events).toContain("tool_execution_end:large-call");
    const compactionEventIndex = events.findIndex((event) => event === "compaction_start:threshold" || event === "compaction_start:overflow");
    expect(compactionEventIndex).toBeGreaterThan(events.indexOf("tool_execution_end:large-call"));
    const compactionStart = timeline.findIndex((event) => event === "compaction:start:threshold" || event === "compaction:start:overflow");
    const finalMemoryEnd = timeline.lastIndexOf("memory:end");
    const owner = timeline.indexOf("owner");
    expect(compactionStart).toBeGreaterThan(timeline.indexOf("tool:end:large-call"));
    expect(finalMemoryEnd).toBeGreaterThan(compactionStart);
    expect(owner).toBeGreaterThan(finalMemoryEnd);
    expect(timeline).toContain("assistant:resumed");

    // The official 0.84.4 mid-run path is installed ahead of the post-run
    // threshold/overflow fallback exercised above: it checks shouldCompact,
    // awaits threshold compaction, then returns the rebuilt context for the
    // next assistant request.
    const agentSessionSource = await readFile(new URL("../../node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js", import.meta.url), "utf8");
    expect(agentSessionSource).toMatch(/_compactBeforeNextAssistantResponse[\s\S]*shouldCompact[\s\S]*await this\._runAutoCompaction\("threshold", false\)[\s\S]*messages: this\.agent\.state\.messages\.slice\(\)/);
    expect(observedBodies.join("\n")).not.toContain(rawMarker);

    const toolResult = manager.getEntries().find((entry) => entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolCallId === "large-call");
    expect(toolResult).toMatchObject({
      type: "message",
      message: { details: { owner: "large_result", stable: true }, isError: false },
    });
    expect(toolResult && toolResult.type === "message" && toolResult.message.role === "toolResult" ? textOf(toolResult.message.content) : "").toBe(hugeBody);
    expect(manager.getEntries().find((entry) => entry.type === "compaction")).toMatchObject({
      type: "compaction",
      summary: "OWNER_SUMMARY_UNCHANGED",
      details: { owner: "fixture-context-owner" },
      fromHook: true,
    });
    expect(session.getLastAssistantText()).toBe("resumed-after-native-compaction");
  });
});
