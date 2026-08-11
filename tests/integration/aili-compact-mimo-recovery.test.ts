import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import {
  createAssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const scratchRoot = resolve(".tmp");
const productionEntry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));
const providerName = "mimo-recovery-fixture";
const api = "mimo-recovery-api" as never;
const model: Model<any> = {
  id: "mimo-recovery-model",
  name: "MiMo recovery fixture",
  api,
  provider: providerName,
  baseUrl: "https://fixture.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 20_000,
};

const sessions = new Set<AgentSession>();
const scratchDirectories: string[] = [];

afterEach(() => {
  for (const session of sessions) session.dispose();
  sessions.clear();
  for (const directory of scratchDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("AILI Compact MiMo recovery through official Pi", () => {
  it("uses the prepared checkpoint projection at the safe budget before native compaction", async () => {
    mkdirSync(scratchRoot, { recursive: true });
    const scratch = mkdtempSync(join(scratchRoot, "aili-compact-mimo-recovery-"));
    scratchDirectories.push(scratch);
    const projectDir = join(scratch, "project");
    const agentDir = join(scratch, "home", ".pi", "agent");
    const sessionDir = join(scratch, "sessions");
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: true,
      autoCooling: false,
      planning: { enabled: false },
      providerSuffix: { enabled: false },
    }));

    const manager = SessionManager.create(projectDir, sessionDir, { id: "mimo-prepared-rebuild" });
    manager.appendMessage({ role: "user", content: "old request", timestamp: 1 });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "old response" }],
      timestamp: 2,
      api,
      provider: providerName,
      model: model.id,
      usage: usage(60_000, 1),
      stopReason: "stop",
    } as never);

    const provider = new FixtureProvider();
    const settings = SettingsManager.inMemory({
      compaction: { enabled: true, reserveTokens: 32, keepRecentTokens: 1 },
      retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
    }, { projectTrusted: true });
    const providerExtension: ExtensionFactory = (pi) => {
      pi.registerProvider(providerName, {
        name: "MiMo recovery fixture provider",
        api,
        baseUrl: model.baseUrl,
        apiKey: "fixture-key",
        streamSimple: provider.streamSimple,
        models: [{
          id: model.id,
          name: model.name,
          api,
          reasoning: false,
          input: ["text"],
          cost: model.cost,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        }],
      });
    };
    const loader = new DefaultResourceLoader({
      cwd: projectDir,
      agentDir,
      settingsManager: settings,
      additionalExtensionPaths: [productionEntry],
      extensionFactories: [{ name: "mimo-fixture-provider", factory: providerExtension, hidden: true }],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "MiMo recovery integration fixture.",
    });
    await loader.reload();
    expect(loader.getExtensions().errors).toEqual([]);
    const created = await createAgentSession({
      cwd: projectDir,
      agentDir,
      model,
      resourceLoader: loader,
      settingsManager: settings,
      sessionManager: manager,
      noTools: "all",
      thinkingLevel: "off",
    });
    expect(created.extensionsResult.errors).toEqual([]);
    expect(created.extensionsResult.extensions.map((extension) => extension.resolvedPath)).toContain(productionEntry);
    await created.session.bindExtensions({ mode: "print" });
    sessions.add(created.session);

    await created.session.prompt("continue", { expandPromptTemplates: false, source: "extension" });
    await created.session.waitForIdle();

    expect(provider.contexts).toHaveLength(1);
    expect(provider.nativeSummaryCalls).toBe(0);
    expect(JSON.stringify(provider.contexts)).not.toContain("old response");
    const checkpoint = manager.getEntries().find((entry) => {
      const data = (entry as { data?: { schema?: unknown } }).data;
      return entry.type === "custom" && data?.schema === "aili.compact.mimo-checkpoint.v1";
    }) as { data?: Record<string, unknown> } | undefined;
    expect(checkpoint?.data).toMatchObject({
      schema: "aili.compact.mimo-checkpoint.v1",
      sessionId: "mimo-prepared-rebuild",
      branchId: expect.stringMatching(/^br_/u),
      epochId: expect.any(String),
      sourceRevision: expect.any(String),
      descriptorIdentity: expect.any(String),
      binding: expect.any(String),
    });
    expect(manager.getEntries().filter((entry) => entry.type === "compaction")).toEqual([]);
  });

  it("uses one Pi-native fallback after an overflow when MiMo recovery is unavailable", async () => {
    mkdirSync(scratchRoot, { recursive: true });
    const scratch = mkdtempSync(join(scratchRoot, "aili-compact-mimo-fallback-"));
    scratchDirectories.push(scratch);
    const projectDir = join(scratch, "project");
    const agentDir = join(scratch, "home", ".pi", "agent");
    const sessionDir = join(scratch, "sessions");
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: true,
      autoCooling: false,
      planning: { enabled: false },
      providerSuffix: { enabled: false },
    }));

    const fallbackModel: Model<any> = { ...model, id: "mimo-fallback-model", contextWindow: 40_000, maxTokens: 20_000 };
    const manager = SessionManager.create(projectDir, sessionDir, { id: "mimo-native-fallback" });
    manager.appendMessage({ role: "user", content: "old request", timestamp: 1 });
    const provider = new OverflowFallbackProvider();
    const settings = SettingsManager.inMemory({
      compaction: { enabled: true, reserveTokens: 32, keepRecentTokens: 1 },
      retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
    }, { projectTrusted: true });
    const providerExtension: ExtensionFactory = (pi) => {
      pi.registerProvider(providerName, {
        name: "MiMo fallback fixture provider",
        api,
        baseUrl: fallbackModel.baseUrl,
        apiKey: "fixture-key",
        streamSimple: provider.streamSimple,
        models: [{
          id: fallbackModel.id,
          name: fallbackModel.name,
          api,
          reasoning: false,
          input: ["text"],
          cost: fallbackModel.cost,
          contextWindow: fallbackModel.contextWindow,
          maxTokens: fallbackModel.maxTokens,
        }],
      });
    };
    const loader = new DefaultResourceLoader({
      cwd: projectDir,
      agentDir,
      settingsManager: settings,
      additionalExtensionPaths: [productionEntry],
      extensionFactories: [{ name: "mimo-fallback-provider", factory: providerExtension, hidden: true }],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "MiMo fallback integration fixture.",
    });
    await loader.reload();
    const created = await createAgentSession({
      cwd: projectDir,
      agentDir,
      model: fallbackModel,
      resourceLoader: loader,
      settingsManager: settings,
      sessionManager: manager,
      noTools: "all",
      thinkingLevel: "off",
    });
    expect(created.extensionsResult.errors).toEqual([]);
    await created.session.bindExtensions({ mode: "print" });
    sessions.add(created.session);

    await created.session.prompt("continue after overflow", { expandPromptTemplates: false, source: "extension" });
    await created.session.waitForIdle();

    expect(provider.agentCalls).toBe(2);
    expect(provider.nativeSummaryCalls).toBe(1);
    expect(manager.getEntries().filter((entry) => entry.type === "compaction")).toHaveLength(1);
    expect(manager.getEntries().some((entry) => {
      const data = (entry as { data?: { schema?: unknown } }).data;
      return entry.type === "custom" && data?.schema === "aili.compact.mimo-checkpoint.v1";
    })).toBe(false);
  });
});

class FixtureProvider {
  readonly contexts: Context["messages"][] = [];
  nativeSummaryCalls = 0;

  readonly streamSimple = (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
    if (context.systemPrompt?.startsWith("You are a context summarization assistant.") === true) this.nativeSummaryCalls += 1;
    this.contexts.push(structuredClone(context.messages));
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      const message = {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "MIMO_OK" }],
        api: selected.api,
        provider: selected.provider,
        model: selected.id,
        usage: usage(1, 1),
        stopReason: "stop" as const,
        timestamp: Date.now(),
      };
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", reason: "stop", message });
      stream.end();
    });
    return stream;
  };
}

class OverflowFallbackProvider {
  agentCalls = 0;
  nativeSummaryCalls = 0;

  readonly streamSimple = (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
    const stream = createAssistantMessageEventStream();
    const nativeSummary = context.systemPrompt?.startsWith("You are a context summarization assistant.") === true;
    if (nativeSummary) this.nativeSummaryCalls += 1;
    else this.agentCalls += 1;
    queueMicrotask(() => {
      const overflow = !nativeSummary && this.agentCalls === 1;
      const message = {
        role: "assistant" as const,
        content: overflow ? [] : [{ type: "text" as const, text: nativeSummary ? "Native fallback summary." : "FALLBACK_OK" }],
        api: selected.api,
        provider: selected.provider,
        model: selected.id,
        usage: usage(1, 1),
        stopReason: overflow ? "error" as const : "stop" as const,
        ...(overflow ? { errorMessage: "context_length_exceeded: controlled MiMo fallback" } : {}),
        timestamp: Date.now(),
      };
      stream.push({ type: "start", partial: message });
      if (overflow) stream.push({ type: "error", reason: "error", error: message });
      else stream.push({ type: "done", reason: "stop", message });
      stream.end();
    });
    return stream;
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
