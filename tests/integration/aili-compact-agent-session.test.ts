import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type CompactionEntry,
  type ExtensionFactory,
  type SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceDigest, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";

const scratchRoot = resolve(".tmp");
const productionEntry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));
const providerName = "aili-compact-agent-session-fixture";
const modelId = "controlled-context-window";
const api = "aili-compact-controlled-stream" as never;

const controlledModel: Model<any> = {
  id: modelId,
  name: "Controlled context-window fixture",
  api,
  provider: providerName,
  baseUrl: "https://fixture.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 256,
  maxTokens: 64,
};

type HookObservation = Pick<SessionBeforeCompactEvent, "reason" | "willRetry"> & {
  firstKeptEntryId: string;
};

type ProviderCall = {
  kind: "agent" | "summary";
  outcome: "overflow" | "threshold" | "success";
  text?: string;
  messages: Context["messages"];
};

class ControlledProvider {
  readonly calls: ProviderCall[] = [];
  private overflowPending = false;
  private thresholdPending = false;
  private responses: string[] = [];

  overflowNextAgentCall(): void {
    this.overflowPending = true;
  }

  thresholdNextAgentCall(): void {
    this.thresholdPending = true;
  }

  enqueue(...responses: string[]): void {
    this.responses.push(...responses);
  }

  readonly streamSimple = (
    model: Model<any>,
    context: Context,
    _options?: SimpleStreamOptions,
  ) => {
    const stream = createAssistantMessageEventStream();
    const messages = structuredClone(context.messages);
    const summary = isNativeSummaryRequest(context);
    const overflow = !summary && this.overflowPending;
    const threshold = !summary && !overflow && this.thresholdPending;
    if (overflow) this.overflowPending = false;
    if (threshold) this.thresholdPending = false;

    const text = summary
      ? "Controlled native checkpoint summary."
      : overflow
        ? ""
        : this.responses.shift() ?? "Controlled continuation response.";
    this.calls.push({
      kind: summary ? "summary" : "agent",
      outcome: overflow ? "overflow" : threshold ? "threshold" : "success",
      ...(overflow ? {} : { text }),
      messages,
    });

    queueMicrotask(() => {
      const message = assistantMessage(model, overflow ? "" : text, overflow, threshold);
      stream.push({ type: "start", partial: message });
      if (overflow) {
        stream.push({ type: "error", reason: "error", error: message });
      } else {
        stream.push({ type: "done", reason: "stop", message });
      }
      stream.end();
    });
    return stream;
  };
}

let scratch = "";
let projectDir = "";
let agentDir = "";
let sessionDir = "";
const liveSessions = new Set<AgentSession>();

beforeEach(() => {
  mkdirSync(scratchRoot, { recursive: true });
  scratch = mkdtempSync(join(scratchRoot, "aili-compact-agent-session-"));
  projectDir = join(scratch, "project");
  agentDir = join(scratch, "home", ".pi", "agent");
  sessionDir = join(scratch, "sessions");
  mkdirSync(join(projectDir, ".pi"), { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
    autoCooling: false,
    planning: { enabled: false },
    providerSuffix: { enabled: false },
  }));
  vi.stubEnv("HOME", join(scratch, "home"));
  vi.stubEnv("USERPROFILE", join(scratch, "home"));
});

afterEach(() => {
  for (const session of liveSessions) session.dispose();
  liveSessions.clear();
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

describe("AILI Compact production AgentSession integration", () => {
  it.each(["overflow", "threshold"] as const)("lets host compaction=false suppress automatic %s while public manual compact remains available", async (scenario) => {
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: false,
      autoCooling: false,
      planning: { enabled: false },
      providerSuffix: { enabled: false },
    }));
    const manager = SessionManager.create(projectDir, sessionDir, { id: `host-disabled-${scenario}` });
    appendUser(manager, `host-disabled old question ${"q".repeat(320)}`, 1);
    appendAssistant(manager, `host-disabled old answer ${"a".repeat(320)}`, 2);

    const provider = new ControlledProvider();
    if (scenario === "overflow") provider.overflowNextAgentCall();
    else provider.thresholdNextAgentCall();
    provider.enqueue("Threshold response completed without automatic compaction.");
    const hooks: HookObservation[] = [];
    const { session } = await productionSession(manager, provider, hooks, false);

    await session.prompt(`trigger host-disabled ${scenario}`);
    await session.waitForIdle();
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({ kind: "agent", outcome: scenario });
    expect(hooks).toEqual([]);
    expect(compactionEntries(manager)).toEqual([]);

    const completion = nextCompactionEnd(session, "manual");
    const result = await session.compact();
    const end = await completion;
    expect(result.summary).toContain("Controlled native checkpoint summary.");
    expect(end).toMatchObject({ aborted: false, willRetry: false });
    expect(provider.calls.at(-1)).toMatchObject({ kind: "summary", outcome: "success" });
    expect(hooks).toEqual([{ reason: "manual", willRetry: false, firstKeptEntryId: expect.any(String) }]);
    expect(compactionEntries(manager)).toEqual([
      expect.objectContaining({ fromHook: false, summary: expect.stringContaining("Controlled native checkpoint summary.") }),
    ]);
  });

  it("keeps Pi native overflow recovery working when AILI is explicitly disabled", async () => {
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: false,
      autoCooling: false,
      planning: { enabled: false },
      providerSuffix: { enabled: false },
    }));
    const manager = SessionManager.create(projectDir, sessionDir, { id: "disabled-native-fallthrough" });
    appendUser(manager, `disabled old question ${"q".repeat(320)}`, 1);
    appendAssistant(manager, `disabled old answer ${"a".repeat(320)}`, 2);

    const provider = new ControlledProvider();
    provider.overflowNextAgentCall();
    provider.enqueue("Recovered while AILI stayed disabled.", "Continued while AILI stayed disabled.");
    const hooks: HookObservation[] = [];
    const { session } = await productionSession(manager, provider, hooks);

    await session.prompt("trigger disabled controlled overflow");
    await session.waitForIdle();
    expect(provider.calls.map(({ kind, outcome }) => `${kind}:${outcome}`)).toEqual([
      "agent:overflow",
      "summary:success",
      "agent:success",
    ]);
    expect(hooks).toEqual([{ reason: "overflow", willRetry: true, firstKeptEntryId: expect.any(String) }]);
    expect(compactionEntries(manager)).toEqual([
      expect.objectContaining({ fromHook: false, summary: expect.stringContaining("Controlled native checkpoint summary.") }),
    ]);
    expect(manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "aili-compact")).toEqual([]);

    await session.prompt("continue after disabled checkpoint");
    await session.waitForIdle();
    expect(provider.calls.at(-1)).toMatchObject({
      kind: "agent",
      outcome: "success",
      text: "Continued while AILI stayed disabled.",
    });
    expect(messageText(session.state.messages.at(-1))).toBe("Continued while AILI stayed disabled.");
    expect(compactionEntries(manager)).toHaveLength(1);
  });

  it("falls through a controlled overflow to Pi native compaction, retries once, and completes the next turn", async () => {
    const manager = SessionManager.create(projectDir, sessionDir, { id: "overflow-fallthrough" });
    appendUser(manager, `old question ${"q".repeat(320)}`, 1);
    appendAssistant(manager, `old answer ${"a".repeat(320)}`, 2);

    const provider = new ControlledProvider();
    provider.overflowNextAgentCall();
    provider.enqueue("Recovered after native checkpoint.", "Post-checkpoint turn completed.");
    const hooks: HookObservation[] = [];
    const { session, events } = await productionSession(manager, provider, hooks);

    const firstPrompt = "trigger controlled overflow";
    await session.prompt(firstPrompt);
    await session.waitForIdle();

    expect(provider.calls.map(({ kind, outcome, text }) => ({ kind, outcome, text }))).toEqual([
      { kind: "agent", outcome: "overflow", text: undefined },
      { kind: "summary", outcome: "success", text: "Controlled native checkpoint summary." },
      { kind: "agent", outcome: "success", text: "Recovered after native checkpoint." },
    ]);
    expect(hooks).toEqual([{ reason: "overflow", willRetry: true, firstKeptEntryId: expect.any(String) }]);

    const overflowEnds = events.filter((event): event is Extract<AgentSessionEvent, { type: "compaction_end" }> =>
      event.type === "compaction_end" && event.reason === "overflow");
    expect(events.filter((event) => event.type === "compaction_start" && event.reason === "overflow")).toHaveLength(1);
    expect(overflowEnds).toHaveLength(1);
    expect(overflowEnds[0]).toMatchObject({
      aborted: false,
      willRetry: true,
      result: { summary: expect.stringContaining("Controlled native checkpoint summary.") },
    });

    const compactions = compactionEntries(manager);
    expect(compactions).toHaveLength(1);
    expect(compactions[0]).toMatchObject({
      summary: expect.stringContaining("Controlled native checkpoint summary."),
      fromHook: false,
    });
    expect(manager.getBranch().filter((entry) => entry.type === "message"
      && entry.message.role === "user" && textOf(entry.message.content) === firstPrompt)).toHaveLength(1);
    expect(manager.getBranch().filter((entry) => entry.type === "message"
      && entry.message.role === "assistant" && entry.message.stopReason === "error")).toHaveLength(1);

    await session.prompt("continue after checkpoint");
    await session.waitForIdle();
    expect(provider.calls.map(({ kind, outcome }) => `${kind}:${outcome}`)).toEqual([
      "agent:overflow",
      "summary:success",
      "agent:success",
      "agent:success",
    ]);
    expect(provider.calls.at(-1)?.text).toBe("Post-checkpoint turn completed.");
    expect(messageText(session.state.messages.at(-1))).toBe("Post-checkpoint turn completed.");
    expect(compactionEntries(manager)).toHaveLength(1);

    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeTruthy();
    const reopened = SessionManager.open(sessionFile!, sessionDir, projectDir);
    const resumedContext = JSON.stringify(reopened.buildSessionContext().messages);
    expect(resumedContext).toContain("Controlled native checkpoint summary.");
    expect(resumedContext).toContain("Recovered after native checkpoint.");
    expect(resumedContext).toContain("Post-checkpoint turn completed.");
    expect(readJsonl(sessionFile!).filter((entry) => entry.type === "compaction")).toHaveLength(1);

    // This is the real production AgentSession/Extension flow with a deterministic
    // local provider. It deliberately does not claim the separately gated live-provider run.
    expect({
      agentSessionClass: session.constructor.name,
      extensionEntry: productionEntry,
      providerEvidence: provider.constructor.name,
      liveProviderOverflowGate: "Unverified",
    }).toEqual({
      agentSessionClass: "AgentSession",
      extensionEntry: productionEntry,
      providerEvidence: "ControlledProvider",
      liveProviderOverflowGate: "Unverified",
    });
  });

  it("persists and resumes a production custom rescue checkpoint with one compact and zero provider sends", async () => {
    const manager = SessionManager.create(projectDir, sessionDir, { id: "custom-rescue" });
    const { tailId } = appendEligibleSemanticHistory(manager);
    const userMessagesBefore = userMessageCount(manager);

    const provider = new ControlledProvider();
    const hooks: HookObservation[] = [];
    const { session, events } = await productionSession(manager, provider, hooks);
    const completion = nextCompactionEnd(session, "manual");

    await session.prompt("/aili-compact rescue");
    const end = await completion;
    await session.waitForIdle();

    expect(end).toMatchObject({
      aborted: false,
      willRetry: false,
      result: {
        firstKeptEntryId: tailId,
        summary: expect.stringContaining("Eligible historical work is complete."),
        details: { ailiCompact: { kind: "major-gc", blockIds: ["semantic:eligible-history"] } },
      },
    });
    expect(events.filter((event) => event.type === "compaction_start" && event.reason === "manual")).toHaveLength(1);
    expect(events.filter((event) => event.type === "compaction_end" && event.reason === "manual")).toHaveLength(1);
    expect(hooks).toEqual([{ reason: "manual", willRetry: false, firstKeptEntryId: tailId }]);
    expect(provider.calls).toEqual([]);
    expect(userMessageCount(manager)).toBe(userMessagesBefore);

    const compactions = compactionEntries(manager);
    expect(compactions).toHaveLength(1);
    expect(compactions[0]).toMatchObject({
      firstKeptEntryId: tailId,
      fromHook: true,
      details: { ailiCompact: { kind: "major-gc", blockIds: ["semantic:eligible-history"] } },
    });
    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeTruthy();
    expect(readJsonl(sessionFile!).filter((entry) => entry.type === "compaction")).toEqual([
      expect.objectContaining({ fromHook: true, firstKeptEntryId: tailId }),
    ]);

    closeSession(session);
    const reopened = SessionManager.open(sessionFile!, sessionDir, projectDir);
    const resumedProvider = new ControlledProvider();
    resumedProvider.enqueue("Resumed after custom checkpoint.");
    const resumedHooks: HookObservation[] = [];
    const { session: resumed } = await productionSession(reopened, resumedProvider, resumedHooks);

    await resumed.prompt("resume persisted checkpoint");
    await resumed.waitForIdle();

    expect(resumedProvider.calls).toHaveLength(1);
    expect(resumedProvider.calls[0]).toMatchObject({ kind: "agent", outcome: "success" });
    expect(JSON.stringify(resumedProvider.calls[0]?.messages)).toContain("Eligible historical work is complete.");
    expect(messageText(resumed.state.messages.at(-1))).toBe("Resumed after custom checkpoint.");
    expect(compactionEntries(reopened)).toHaveLength(1);
    expect(resumedHooks).toEqual([]);
  });
});

async function productionSession(
  manager: SessionManager,
  provider: ControlledProvider,
  hooks: HookObservation[],
  hostCompactionEnabled = true,
): Promise<{ session: AgentSession; events: AgentSessionEvent[] }> {
  const settings = SettingsManager.inMemory({
    compaction: { enabled: hostCompactionEnabled, reserveTokens: 32, keepRecentTokens: 1 },
    retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
  }, { projectTrusted: true });
  const providerExtension: ExtensionFactory = (pi) => {
    pi.registerProvider(providerName, {
      name: "Controlled AgentSession fixture",
      api,
      baseUrl: controlledModel.baseUrl,
      apiKey: "fixture-key",
      streamSimple: provider.streamSimple,
      models: [{
        id: controlledModel.id,
        name: controlledModel.name,
        api,
        reasoning: false,
        input: ["text"],
        cost: controlledModel.cost,
        contextWindow: controlledModel.contextWindow,
        maxTokens: controlledModel.maxTokens,
      }],
    });
  };
  const observerExtension: ExtensionFactory = (pi) => {
    pi.on("session_before_compact", (event) => {
      hooks.push({
        reason: event.reason,
        willRetry: event.willRetry,
        firstKeptEntryId: event.preparation.firstKeptEntryId,
      });
    });
  };
  const loader = new DefaultResourceLoader({
    cwd: projectDir,
    agentDir,
    settingsManager: settings,
    additionalExtensionPaths: [productionEntry],
    extensionFactories: [
      { name: "controlled-provider", factory: providerExtension, hidden: true },
      { name: "compaction-observer", factory: observerExtension, hidden: true },
    ],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Controlled AgentSession integration fixture.",
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  expect(loader.getExtensions().extensions.map((extension) => extension.resolvedPath)).toContain(productionEntry);

  const { session, extensionsResult } = await createAgentSession({
    cwd: projectDir,
    agentDir,
    model: controlledModel,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
    noTools: "all",
  });
  expect(extensionsResult.errors).toEqual([]);
  expect(extensionsResult.extensions.map((extension) => extension.resolvedPath)).toContain(productionEntry);
  const events: AgentSessionEvent[] = [];
  session.subscribe((event) => events.push(event));
  liveSessions.add(session);
  return { session, events };
}

function appendEligibleSemanticHistory(manager: SessionManager): { tailId: string } {
  const sourceIds: string[] = [];
  sourceIds.push(appendUser(manager, `old question one ${"x".repeat(180)}`, 1));
  sourceIds.push(appendAssistant(manager, `old answer one ${"y".repeat(180)}`, 2));
  sourceIds.push(appendUser(manager, `old question two ${"m".repeat(180)}`, 3));
  sourceIds.push(appendAssistant(manager, `old answer two ${"n".repeat(180)}`, 4));
  const sourceEntries = manager.getBranch() as unknown as SessionLikeEntry[];
  const transactionId = "eligible-semantic-transaction";
  const contextTx = {
    schema: "aili.compact.tx.v2" as const,
    id: transactionId,
    kind: "compact" as const,
    epochId: "root",
    blocks: [{
      id: "semantic:eligible-history",
      kind: "semantic" as const,
      epochId: "root",
      sourceEntryIds: sourceIds,
      sourceDigest: sourceDigest(sourceEntries, sourceIds),
      summary: "Eligible historical work is complete.",
      active: true,
      mode: "range" as const,
      topic: "Eligible history",
      batchTopic: "Eligible history",
      anchorEntryId: sourceIds[0]!,
      runId: transactionId,
      childBlockIds: [],
      generation: "old" as const,
      survivedCount: 5,
      age: 5,
    }],
  };
  manager.appendMessage({
    role: "assistant",
    content: [{ type: "toolCall", id: transactionId, name: "aili_compact", arguments: {} }],
    timestamp: 5,
    api,
    provider: providerName,
    model: modelId,
    usage: usage(1, 1),
    stopReason: "toolUse",
  } as never);
  manager.appendMessage({
    role: "toolResult",
    toolCallId: transactionId,
    toolName: "aili_compact",
    content: [{ type: "text", text: "semantic block committed" }],
    isError: false,
    details: { contextTx },
    timestamp: 6,
  });
  return { tailId: appendUser(manager, "tail that must remain", 7) };
}

function appendUser(manager: SessionManager, content: string, timestamp: number): string {
  return manager.appendMessage({ role: "user", content, timestamp });
}

function appendAssistant(manager: SessionManager, text: string, timestamp: number): string {
  return manager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp,
    api,
    provider: providerName,
    model: modelId,
    usage: usage(1, 1),
    stopReason: "stop",
  } as never);
}

function assistantMessage(model: Model<any>, text: string, overflow: boolean, threshold = false): AssistantMessage {
  return {
    role: "assistant",
    content: overflow ? [] : [{ type: "text", text }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: overflow ? usage(0, 0) : threshold ? usage(224, 1) : usage(2, 2),
    stopReason: overflow ? "error" : "stop",
    ...(overflow ? { errorMessage: "context_length_exceeded: controlled AgentSession fixture" } : {}),
    timestamp: Date.now(),
  };
}

function usage(input: number, output: number) {
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function isNativeSummaryRequest(context: Context): boolean {
  return context.systemPrompt?.startsWith("You are a context summarization assistant.") === true;
}

function compactionEntries(manager: SessionManager): CompactionEntry[] {
  return manager.getEntries().filter((entry): entry is CompactionEntry => entry.type === "compaction");
}

function userMessageCount(manager: SessionManager): number {
  return manager.getBranch().filter((entry) => entry.type === "message" && entry.message.role === "user").length;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("");
}

function messageText(message: unknown): string {
  return message && typeof message === "object" && "content" in message ? textOf(message.content) : "";
}

function readJsonl(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

function nextCompactionEnd(
  session: AgentSession,
  reason: "manual" | "threshold" | "overflow",
): Promise<Extract<AgentSessionEvent, { type: "compaction_end" }>> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      rejectPromise(new Error(`Timed out waiting for ${reason} compaction_end`));
    }, 5_000);
    const unsubscribe = session.subscribe((event) => {
      if (event.type !== "compaction_end" || event.reason !== reason) return;
      clearTimeout(timeout);
      unsubscribe();
      resolvePromise(event);
    });
  });
}

function closeSession(session: AgentSession): void {
  session.dispose();
  liveSessions.delete(session);
}
