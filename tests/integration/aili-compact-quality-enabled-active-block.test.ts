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
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCompactConfig } from "../../src/runtime/aili-compact/config.js";
import { AILI_COMPACT_ENTRY, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { qualityRequirement } from "../../src/runtime/aili-compact/quality.js";
import { freezeMessageQualitySource } from "../../src/runtime/aili-compact/quality-source.js";
import { buildReferenceCatalog } from "../../src/runtime/aili-compact/references.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { buildV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import type { V3Transaction } from "../../src/runtime/aili-compact/v3.js";

const scratchRoot = resolve(".tmp");
const productionEntry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));
const providerName = "quality-enabled-active-block-fixture";
const api = "quality-enabled-active-block-api" as never;
const acceptedSourceMarker = "PP2_ACCEPTED_SOURCE";
const rejectedSourceMarker = "PP2_REJECTED_SOURCE";
const model: Model<any> = {
  id: "quality-enabled-active-block-model",
  name: "Quality-enabled active-block fixture",
  api,
  provider: providerName,
  baseUrl: "https://fixture.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 16_384,
};

const sessions = new Set<AgentSession>();
const scratchDirectories: string[] = [];

afterEach(() => {
  for (const session of sessions) session.dispose();
  sessions.clear();
  for (const directory of scratchDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("AILI Compact default quality through official Pi", () => {
  it("accepts an exact active block, rejects an incomplete quality summary without appending, and retains the block", async () => {
    mkdirSync(scratchRoot, { recursive: true });
    const scratch = mkdtempSync(join(scratchRoot, "aili-compact-quality-enabled-"));
    scratchDirectories.push(scratch);
    const projectDir = join(scratch, "project");
    const homeDir = join(scratch, "home");
    const agentDir = join(homeDir, ".pi", "agent");
    const sessionDir = join(scratch, "sessions");
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    configureCompactToolPermissions(agentDir);
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: true,
      autoCooling: false,
      providerSuffix: { enabled: false },
    }));

    expect(loadCompactConfig(projectDir, homeDir).quality).toEqual({ enabled: true, warningPolicy: "record" });

    const manager = SessionManager.create(projectDir, sessionDir, { id: "pp2-quality-enabled-active-block" });
    manager.appendMessage({ role: "user", content: sourceBody(acceptedSourceMarker), timestamp: 1 });
    for (let index = 0; index < 10; index += 1) {
      manager.appendMessage({ role: "user", content: `historical filler request ${index + 1}`, timestamp: index * 2 + 2 });
      manager.appendMessage({
        role: "assistant",
        content: [{ type: "text", text: `historical filler ${index + 1}` }],
        timestamp: index * 2 + 3,
        api,
        provider: providerName,
        model: model.id,
        usage: usage(1, 1),
        stopReason: "stop",
      } as never);
    }

    const provider = new QualityEnabledProvider(manager);
    const { session } = await productionSession(projectDir, agentDir, manager, provider);

    await session.prompt("create one exact quality-checked active block", { expandPromptTemplates: false, source: "extension" });
    await session.waitForIdle();

    const accepted = semanticTransactions(manager);
    expect(provider.fixtureError).toBeUndefined();
    expect(provider.calls).toHaveLength(3);
    expect(provider.acceptedRange).toBeDefined();
    expect(provider.acceptedResult).toMatchObject({
      attestation: { toolName: "aili_compact", outcome: "success" },
      result: { semantics: "active-block" },
    });
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.payload).not.toHaveProperty("tier");
    expect(accepted[0]!.payload).toMatchObject({
      source: { kind: "messages" },
      quality: { status: expect.stringMatching(/^accepted/u) },
    });

    const exactSourceIds = entryIdsForRange(manager, provider.acceptedRange!);
    expect(accepted[0]!.payload.source).toMatchObject({
      kind: "messages",
      entryIds: exactSourceIds,
      firstEntryId: exactSourceIds[0],
      lastEntryId: exactSourceIds.at(-1),
    });
    expectContiguousReferences(manager, provider.acceptedRange!);

    const acceptedBlockId = accepted[0]!.payload.blockId;
    const acceptedSummaryDigest = accepted[0]!.payload.summaryDigest.slice(0, 16);
    const acceptedView = v3View(manager);
    const acceptedBlockRef = acceptedView.blockRefById.get(acceptedBlockId);
    expect(acceptedBlockRef).toMatch(/^b\d{6}$/u);
    expect(acceptedView.state.blocks.get(acceptedBlockId)).toMatchObject({ active: true, quality: { status: expect.stringMatching(/^accepted/u) } });

    await session.prompt(sourceBody(rejectedSourceMarker), { expandPromptTemplates: false, source: "extension" });
    await session.waitForIdle();
    for (let index = 0; index < 5; index += 1) {
      await session.prompt(`ordinary post-source filler ${index + 1}`, { expandPromptTemplates: false, source: "extension" });
      await session.waitForIdle();
    }

    expect(JSON.stringify(provider.nextRequestAfterAcceptance)).toContain(`[AILI Compact descriptor; block=${acceptedBlockRef}`);
    expect(JSON.stringify(provider.nextRequestAfterAcceptance)).toContain(`summary=${acceptedSummaryDigest}`);

    const beforeRejectedMutation = semanticTransactions(manager).length;
    await session.prompt("attempt deliberately incomplete quality summary", { expandPromptTemplates: false, source: "extension" });
    await session.waitForIdle();

    expect(provider.rejectedRange).toBeDefined();
    expect(provider.rejectedResult).toMatchObject({
      attestation: { toolName: "aili_compact", outcome: "rejected" },
      result: { code: "quality-rejected" },
    });
    expect(provider.rejectedResult).not.toHaveProperty("transaction");
    expect(semanticTransactions(manager)).toHaveLength(beforeRejectedMutation);

    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeTruthy();
    session.dispose();
    sessions.delete(session);
    const reopenedManager = SessionManager.open(sessionFile!, sessionDir, projectDir);
    const reopenedView = v3View(reopenedManager);
    expect(reopenedView.state.blocks.get(acceptedBlockId)).toMatchObject({
      active: true,
      summaryDigest: accepted[0]!.payload.summaryDigest,
      source: { kind: "messages", entryIds: exactSourceIds },
    });

    const reopenedProvider = new ReopenedBlockObserver();
    const { session: reopenedSession } = await productionSession(projectDir, agentDir, reopenedManager, reopenedProvider);
    await reopenedSession.prompt("observe reopened active block", { expandPromptTemplates: false, source: "extension" });
    await reopenedSession.waitForIdle();

    expect(JSON.stringify(reopenedProvider.contexts)).toContain(`[AILI Compact descriptor; block=${acceptedBlockRef}`);
    expect(JSON.stringify(reopenedProvider.contexts)).toContain(`summary=${acceptedSummaryDigest}`);
  }, 20_000);
});

class QualityEnabledProvider {
  readonly calls: Context["messages"][] = [];
  fixtureError?: string;
  acceptedRange?: SafeRange;
  rejectedRange?: SafeRange;
  acceptedResult?: JsonRecord;
  rejectedResult?: JsonRecord;
  nextRequestAfterAcceptance?: Context["messages"];
  private stage = 0;
  private serial = 0;

  constructor(private readonly manager: SessionManager) {}

  readonly streamSimple = (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
    this.calls.push(structuredClone(context.messages));
    try {
      return this.nextResponse(selected, context);
    } catch (error) {
      this.fixtureError = error instanceof Error ? error.message : String(error);
      return textStream(selected, "PP2_FIXTURE_ERROR");
    }
  };

  private nextResponse(selected: Model<any>, context: Context) {
    switch (this.stage++) {
      case 0:
        return toolStream(selected, this.tool("aili_compact_status", {}));
      case 1: {
        const status = statusResult(context);
        const range = rangeContaining(this.manager, status, acceptedSourceMarker);
        this.acceptedRange = range;
        return toolStream(selected, this.tool("aili_compact", {
          mode: "range",
          catalogId: range.catalogId,
          topic: "PP-2 accepted source-backed active block",
          ranges: [{ startRef: range.startRef, endRef: range.endRef, summary: completeQualitySummary(this.manager, range) }],
          summaryMaxChars: 18_000,
        }));
      }
      case 2:
        this.acceptedResult = toolEnvelope(context, "aili_compact");
        return textStream(selected, "PP2_ACCEPTED_MUTATION_COMPLETE");
      case 3:
        this.nextRequestAfterAcceptance = structuredClone(context.messages);
        return textStream(selected, "PP2_REJECTED_SOURCE_RECORDED");
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        return textStream(selected, "PP2_FILLER_COMPLETE");
      case 9:
        return toolStream(selected, this.tool("aili_compact_status", {}));
      case 10: {
        const status = statusResult(context);
        const range = rangeContaining(this.manager, status, rejectedSourceMarker);
        this.rejectedRange = range;
        return toolStream(selected, this.tool("aili_compact", {
          mode: "range",
          catalogId: range.catalogId,
          topic: "PP-2 incomplete quality negative",
          ranges: [{
            startRef: range.startRef,
            endRef: range.endRef,
            summary: `Intentionally incomplete summary without the required source anchor ${"x".repeat(3_000)}`,
          }],
          summaryMaxChars: 18_000,
        }));
      }
      case 11:
        this.rejectedResult = toolEnvelope(context, "aili_compact");
        return textStream(selected, "PP2_QUALITY_REJECTION_OBSERVED");
      default:
        throw new Error(`unexpected deterministic provider stage ${this.stage - 1}`);
    }
  }

  private tool(name: "aili_compact_status" | "aili_compact", arguments_: Record<string, unknown>) {
    return { type: "toolCall" as const, id: `${name}-${++this.serial}`, name, arguments: arguments_ };
  }
}

class ReopenedBlockObserver {
  readonly contexts: Context["messages"][] = [];

  readonly streamSimple = (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
    this.contexts.push(structuredClone(context.messages));
    return textStream(selected, "PP2_REOPENED_ACTIVE_BLOCK_OBSERVED");
  };
}

async function productionSession(
  projectDir: string,
  agentDir: string,
  manager: SessionManager,
  provider: { streamSimple: (selected: Model<any>, context: Context, options?: SimpleStreamOptions) => ReturnType<typeof createAssistantMessageEventStream> },
): Promise<{ session: AgentSession }> {
  const settings = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 32, keepRecentTokens: 1 },
    retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
  }, { projectTrusted: true });
  const providerExtension: ExtensionFactory = (pi) => {
    pi.registerProvider(providerName, {
      name: "Quality-enabled active-block deterministic provider",
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
    extensionFactories: [{ name: "quality-enabled-active-block-provider", factory: providerExtension, hidden: true }],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "PP-2 quality-enabled active-block fixture.",
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  expect(loader.getExtensions().extensions.map((extension) => extension.resolvedPath)).toContain(productionEntry);

  const created = await createAgentSession({
    cwd: projectDir,
    agentDir,
    model,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
    tools: ["aili_compact_status", "aili_compact"],
    thinkingLevel: "off",
  });
  expect(created.extensionsResult.errors).toEqual([]);
  expect(created.session.getActiveToolNames().sort()).toEqual(["aili_compact", "aili_compact_status"]);
  await created.session.bindExtensions({ mode: "print" });
  sessions.add(created.session);
  return { session: created.session };
}

type JsonRecord = Record<string, unknown>;
type SafeRange = {
  catalogId: string;
  sourceDigest: string;
  startRef: string;
  endRef: string;
  orderedRefs: string[];
};
type SemanticCreate = Extract<V3Transaction, { tag: "semantic-create" }>;

function sourceBody(marker: string): string {
  return `Decision requires exact retention of \`${marker}\` ${"source".repeat(10_000)}`;
}

function semanticTransactions(manager: SessionManager): SemanticCreate[] {
  return manager.getEntries().flatMap((entry) => {
    const transaction = entry.type === "custom" && entry.customType === AILI_COMPACT_ENTRY
      ? entry.data as V3Transaction
      : undefined;
    return transaction?.tag === "semantic-create" ? [transaction] : [];
  });
}

function v3View(manager: SessionManager) {
  const entries = manager.getBranch() as SessionLikeEntry[];
  return buildV3RuntimeView(entries, reduceCompactState(entries), {
    sessionId: manager.getSessionId(),
    sessionPath: manager.getSessionFile() ?? undefined,
  });
}

function statusResult(context: Context): JsonRecord {
  const result = toolEnvelope(context, "aili_compact_status").result;
  if (!isRecord(result)) throw new Error("status result was not an object");
  return result;
}

function toolEnvelope(context: Context, toolName: string): JsonRecord {
  const message = [...context.messages].reverse().find((item) => item.role === "toolResult" && item.toolName === toolName);
  const text = textOf(message?.content);
  if (!text) throw new Error(`missing ${toolName} tool result`);
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) throw new Error(`${toolName} result was not an envelope`);
  return parsed;
}

function rangeContaining(manager: SessionManager, status: JsonRecord, marker: string): SafeRange {
  const references = recordAt(status, "references");
  const candidates = Array.isArray(references?.safeRanges) ? references.safeRanges : [];
  const catalog = buildReferenceCatalog(manager.getBranch() as SessionLikeEntry[], reduceCompactState(manager.getBranch() as SessionLikeEntry[]));
  const entryIdByRef = new Map(catalog.messages.map((message) => [message.ref, message.entryId]));
  const entryById = new Map(manager.getBranch().map((entry) => [entry.id, entry]));
  const range = candidates.map(parseSafeRange).find((candidate) => candidate !== undefined
    && candidate.orderedRefs.some((ref) => {
      const entry = entryById.get(entryIdByRef.get(ref) ?? "");
      return entry?.type === "message" && "content" in entry.message && textOf(entry.message.content).includes(marker);
    }));
  if (!range) throw new Error(`missing exact safe range for ${marker}`);
  return range;
}

function parseSafeRange(value: unknown): SafeRange | undefined {
  if (!isRecord(value)
    || typeof value.catalogId !== "string"
    || typeof value.sourceDigest !== "string"
    || typeof value.startRef !== "string"
    || typeof value.endRef !== "string"
    || !Array.isArray(value.orderedRefs)
    || !value.orderedRefs.every((ref): ref is string => typeof ref === "string")) return undefined;
  return {
    catalogId: value.catalogId,
    sourceDigest: value.sourceDigest,
    startRef: value.startRef,
    endRef: value.endRef,
    orderedRefs: value.orderedRefs,
  };
}

function completeQualitySummary(manager: SessionManager, range: SafeRange): string {
  const entries = manager.getBranch() as SessionLikeEntry[];
  const entryIds = entryIdsForRange(manager, range);
  const frozen = freezeMessageQualitySource({
    entries,
    orderedEntryIds: entryIds,
    orderedRefs: range.orderedRefs,
    catalogId: range.catalogId,
    sourceDigest: range.sourceDigest,
    branchLeafId: manager.getLeafId() ?? "root",
    epochId: "root",
  });
  const anchors = [...new Set(frozen.facts.flatMap((fact) => fact.eligibility === "eligible"
    && qualityRequirement("active-block", fact.class, fact.current, fact.releaseRelevant) === "hard" ? fact.anchors : []))];
  if (anchors.length === 0) throw new Error("fixture selected no hard quality anchors");
  const prefix = anchors.map((anchor) => `\`${anchor}\``).join(" ");
  return `${prefix} ${"summary".repeat(500)}`;
}

function entryIdsForRange(manager: SessionManager, range: SafeRange): string[] {
  const catalog = buildReferenceCatalog(manager.getBranch() as SessionLikeEntry[], reduceCompactState(manager.getBranch() as SessionLikeEntry[]));
  const entryIdByRef = new Map(catalog.messages.map((message) => [message.ref, message.entryId]));
  return range.orderedRefs.map((ref) => {
    const entryId = entryIdByRef.get(ref);
    if (!entryId) throw new Error(`missing source entry for ${ref}`);
    return entryId;
  });
}

function expectContiguousReferences(manager: SessionManager, range: SafeRange): void {
  expect(range.orderedRefs[0]).toBe(range.startRef);
  expect(range.orderedRefs.at(-1)).toBe(range.endRef);
  const catalog = buildReferenceCatalog(manager.getBranch() as SessionLikeEntry[], reduceCompactState(manager.getBranch() as SessionLikeEntry[]));
  const positions = range.orderedRefs.map((ref) => catalog.messages.findIndex((message) => message.ref === ref));
  expect(positions.every((position, index) => position >= 0 && (index === 0 || position === positions[index - 1]! + 1))).toBe(true);
}

function textStream(selected: Model<any>, text: string) {
  return assistantStream(selected, [{ type: "text", text }], "stop");
}

function toolStream(selected: Model<any>, call: AssistantMessage["content"][number]) {
  return assistantStream(selected, [call], "toolUse");
}

function assistantStream(selected: Model<any>, content: AssistantMessage["content"], stopReason: "stop" | "toolUse") {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant",
    content,
    api: selected.api,
    provider: selected.provider,
    model: selected.id,
    usage: usage(1, 1),
    stopReason,
    timestamp: Date.now(),
  };
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: stopReason, message });
    stream.end();
  });
  return stream;
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

function configureCompactToolPermissions(agentDir: string): void {
  mkdirSync(join(agentDir, "permission-mode"), { recursive: true });
  writeFileSync(join(agentDir, "permission-mode", "permission-mode.json"), JSON.stringify({
    defaultMode: "default",
    modes: {
      default: {
        permission: { tool: { "*": "ask", aili_compact_status: "allow", aili_compact: "allow" } },
      },
    },
  }));
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_PERMISSION_MODE", "default");
}

function recordAt(value: JsonRecord, key: string): JsonRecord | undefined {
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => isRecord(part) && typeof part.text === "string" ? [part.text] : []).join("");
}
