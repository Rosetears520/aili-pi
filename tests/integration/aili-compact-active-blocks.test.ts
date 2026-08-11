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
import { AILI_COMPACT_ENTRY, digest, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { QUALITY_EVALUATOR_VERSION } from "../../src/runtime/aili-compact/quality.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { TOKEN_ESTIMATOR_VERSION } from "../../src/runtime/aili-compact/safe-planning.js";
import { buildV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import { AILI_COMPACT_SCHEMA_V3, v3MessageLeafDigest, v3ParentLeafDigest, v3SummaryDigest } from "../../src/runtime/aili-compact/v3.js";

const scratchRoot = resolve(".tmp");
const productionEntry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));
const providerName = "active-block-fixture";
const api = "active-block-api" as never;
const model: Model<any> = {
  id: "active-block-model",
  name: "Active-block fixture",
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

describe("AILI Compact active blocks through official Pi", () => {
  it.each([2, 16])("reads legacy tiers and atomically replaces %i tierless active blocks", async (childCount) => {
    mkdirSync(scratchRoot, { recursive: true });
    const scratch = mkdtempSync(join(scratchRoot, "aili-compact-active-blocks-"));
    scratchDirectories.push(scratch);
    const projectDir = join(scratch, "project");
    const agentDir = join(scratch, "home", ".pi", "agent");
    const sessionDir = join(scratch, "sessions");
    mkdirSync(join(projectDir, ".pi"), { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    configureToolPermissions(agentDir);
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: true,
      autoCooling: false,
      planning: { enabled: false },
      providerSuffix: { enabled: false },
      quality: { enabled: false },
    }));

    const manager = SessionManager.create(projectDir, sessionDir, { id: "active-block-replacement" });
    const sources = appendSourceHistory(manager, childCount + 1);
    appendSeedBlock(manager, "legacy-tiered", sources.slice(0, 2), "T1", 10);
    const activeBlockIds = Array.from({ length: childCount }, (_, index) => {
      const blockId = `active-${index + 1}`;
      appendSeedBlock(manager, blockId, sources.slice(2 + index * 2, 4 + index * 2), undefined, 20 + index);
      return blockId;
    });
    appendRecentTail(manager);
    const seeded = buildV3RuntimeView(manager.getBranch() as SessionLikeEntry[], reduceCompactState(manager.getBranch() as SessionLikeEntry[]), {
      sessionId: manager.getSessionId(), sessionPath: manager.getSessionFile() ?? undefined,
    });
    expect(seeded.replay.diagnostics).toEqual([]);
    expect(seeded.state.blocks.get("legacy-tiered")?.tier).toBe("T1");

    const provider = new ActiveBlockProvider(childCount);
    const settings = SettingsManager.inMemory({
      compaction: { enabled: true, reserveTokens: 32, keepRecentTokens: 1 },
      retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
    }, { projectTrusted: true });
    const providerExtension: ExtensionFactory = (pi) => {
      pi.registerProvider(providerName, {
        name: "Active-block fixture provider",
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
      extensionFactories: [{ name: "active-block-fixture-provider", factory: providerExtension, hidden: true }],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: "Active-block integration fixture.",
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
      tools: ["aili_compact_status", "aili_context_recap", "aili_compact"],
      thinkingLevel: "off",
    });
    expect(created.extensionsResult.errors).toEqual([]);
    await created.session.bindExtensions({ mode: "print" });
    sessions.add(created.session);

    await created.session.prompt("combine the selected active blocks", { expandPromptTemplates: false, source: "extension" });
    await created.session.waitForIdle();

    expect(provider.fixtureError).toBeUndefined();
    expect(provider.toolNames).toEqual([
      "aili_compact_status",
      "aili_context_recap",
      "aili_compact",
      "aili_compact",
      "aili_compact",
    ]);
    expect(provider.compactResult).toBeDefined();
    expect(JSON.stringify(provider.compactResult)).toContain('"semantics":"active-block"');
    expect(JSON.stringify(provider.compactResult)).not.toContain('"tier"');
    const transactions = manager.getEntries().flatMap((entry) => entry.type === "custom"
      && entry.customType === AILI_COMPACT_ENTRY
      && (entry.data as { tag?: unknown }).tag === "semantic-create"
      ? [entry.data as { payload: Record<string, unknown> }]
      : []);
    expect(transactions.some((transaction) => transaction.payload.tier === "T1")).toBe(true);
    const replacement = transactions.find((transaction) => transaction.payload.source
      && typeof transaction.payload.source === "object"
      && (transaction.payload.source as { kind?: unknown }).kind === "blocks");
    expect(replacement, JSON.stringify(provider.compactResult)).toBeDefined();
    expect(replacement!.payload).not.toHaveProperty("tier");
    expect((replacement!.payload.source as { childBlockIds?: unknown }).childBlockIds).toEqual(activeBlockIds);
    expect(JSON.stringify(provider.singleBlockResult)).toMatch(/invalid-request|child|block/i);
    expect(JSON.stringify(provider.oversizedBlockResult)).toMatch(/invalid-request|child|block/i);
    expect(transactions).toHaveLength(childCount + 2);

    const finalView = buildV3RuntimeView(manager.getBranch() as SessionLikeEntry[], reduceCompactState(manager.getBranch() as SessionLikeEntry[]), {
      sessionId: manager.getSessionId(), sessionPath: manager.getSessionFile() ?? undefined,
    });
    const replacementBlockId = replacement!.payload.blockId as string;
    const replacementBlock = finalView.state.blocks.get(replacementBlockId);
    const childBlocks = activeBlockIds.map((blockId) => finalView.state.blocks.get(blockId));
    expect(childBlocks.every((block) => block?.active === false)).toBe(true);
    expect(replacementBlock).toMatchObject({ active: true, leafCount: childCount * 2 });
    expect(replacementBlock).not.toHaveProperty("tier");
    expect(replacementBlock?.leafDigest).toBe(v3ParentLeafDigest(
      undefined,
      childCount * 2,
      childBlocks.map((block) => block!.leafDigest),
    ));
    expect(finalView.replay.maximalActiveBlocks.map((block) => block.blockId)).toEqual(
      expect.arrayContaining(["legacy-tiered", replacementBlockId]),
    );
  }, 15_000);
});

class ActiveBlockProvider {
  readonly toolNames: string[] = [];
  fixtureError?: string;
  compactResult?: unknown;
  singleBlockResult?: unknown;
  oversizedBlockResult?: unknown;
  private stage = 0;
  private serial = 0;
  private catalogId?: string;
  private selectedRefs?: string[];

  constructor(private readonly childCount: number) {}

  readonly streamSimple = (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
    if (this.stage === 0) {
      this.stage = 1;
      return toolStream(selected, this.record({ type: "toolCall", id: `status-${++this.serial}`, name: "aili_compact_status", arguments: {} }));
    }
    if (this.stage === 1) {
      const status = latestToolResult(context, "aili_compact_status")?.result;
      const groups = Array.isArray((status as { references?: { lifecycle?: { activeBlockGroups?: unknown } } } | undefined)
        ?.references?.lifecycle?.activeBlockGroups)
        ? (status as { references: { lifecycle: { activeBlockGroups: Array<{ semantics?: unknown; blockRefs?: unknown }> } } }).references.lifecycle.activeBlockGroups
        : [];
      const group = groups.find((candidate) => candidate.semantics === "active-block"
        && Array.isArray(candidate.blockRefs)
        && candidate.blockRefs.length >= 2);
      if (!group || !Array.isArray(group.blockRefs)) return this.fail(selected, `active group was not exposed by status: ${JSON.stringify(status)}`);
      const catalogId = (status as { references?: { catalogId?: unknown } } | undefined)?.references?.catalogId;
      if (typeof catalogId !== "string") return this.fail(selected, "active status catalog was unavailable");
      this.catalogId = catalogId;
      this.selectedRefs = group.blockRefs.slice(0, this.childCount).filter((value): value is string => typeof value === "string");
      if (this.selectedRefs.length !== this.childCount) return this.fail(selected, "active status block refs were invalid");
      this.stage = 2;
      return toolStream(selected, this.record({
        type: "toolCall",
        id: `recap-${++this.serial}`,
        name: "aili_context_recap",
        arguments: { blockRefs: this.selectedRefs },
      }));
    }
    if (this.stage === 2) {
      const recap = latestToolResult(context, "aili_context_recap");
      if (!this.catalogId || !recap) return this.fail(selected, "active status or recap result was unavailable");
      const refs = recap.blockRefs;
      if (!Array.isArray(refs) || JSON.stringify(refs) !== JSON.stringify(this.selectedRefs)) return this.fail(selected, "recap refs were unavailable");
      this.stage = 3;
      return toolStream(selected, this.record({
        type: "toolCall",
        id: `compact-${++this.serial}`,
        name: "aili_compact",
        arguments: {
          mode: "blocks",
          catalogId: this.catalogId,
          topic: "Active replacement",
          blockRefs: refs,
          summary: `active replacement ${"x".repeat(1_000)}`,
          summaryMaxChars: 18_000,
        },
      }));
    }
    if (this.stage === 3) {
      this.compactResult = latestToolResult(context, "aili_compact")?.result;
      this.stage = 4;
      if (!this.catalogId || !this.selectedRefs) return this.fail(selected, "cardinality probe prerequisites were unavailable");
      return toolStream(selected, this.record({
        type: "toolCall",
        id: `single-block-probe-${++this.serial}`,
        name: "aili_compact",
        arguments: {
          mode: "blocks",
          catalogId: this.catalogId,
          topic: "Forbidden single-block probe",
          blockRefs: this.selectedRefs.slice(0, 1),
          summary: `single ${"x".repeat(1_000)}`,
          summaryMaxChars: 18_000,
        },
      }));
    }
    if (this.stage === 4) {
      this.singleBlockResult = latestToolResult(context, "aili_compact")?.result;
      this.stage = 5;
      if (!this.catalogId || !this.selectedRefs) return this.fail(selected, "oversized probe prerequisites were unavailable");
      return toolStream(selected, this.record({
        type: "toolCall",
        id: `oversized-block-probe-${++this.serial}`,
        name: "aili_compact",
        arguments: {
          mode: "blocks",
          catalogId: this.catalogId,
          topic: "Forbidden oversized block probe",
          blockRefs: Array.from({ length: 17 }, () => this.selectedRefs![0]!),
          summary: `oversized ${"x".repeat(1_000)}`,
          summaryMaxChars: 18_000,
        },
      }));
    }
    this.oversizedBlockResult = latestToolResult(context, "aili_compact")?.result;
    return textStream(selected, "ACTIVE_BLOCK_OK");
  };

  private record(call: { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }) {
    this.toolNames.push(call.name);
    return call;
  }

  private fail(selected: Model<any>, message: string) {
    this.fixtureError = message;
    return textStream(selected, "ACTIVE_BLOCK_FIXTURE_ERROR");
  }
}

function appendSourceHistory(manager: SessionManager, turns: number): string[] {
  const ids: string[] = [];
  for (let index = 0; index < turns; index += 1) {
    ids.push(manager.appendMessage({ role: "user", content: `source user ${index} ${"u".repeat(1_000)}`, timestamp: index * 2 + 1 }));
    ids.push(manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `source assistant ${index} ${"a".repeat(1_000)}` }],
      timestamp: index * 2 + 2,
      api,
      provider: providerName,
      model: model.id,
      usage: usage(1_000, 1),
      stopReason: "stop",
    } as never));
  }
  return ids;
}

function appendRecentTail(manager: SessionManager): void {
  for (let index = 0; index < 16; index += 1) {
    manager.appendMessage({ role: "user", content: `recent tail ${index} ${"t".repeat(4_000)}`, timestamp: 100 + index * 2 });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `recent tail response ${index} ${"r".repeat(4_000)}` }],
      timestamp: 101 + index * 2,
      api,
      provider: providerName,
      model: model.id,
      usage: usage(1, 1),
      stopReason: "stop",
    } as never);
  }
}

function appendSeedBlock(
  manager: SessionManager,
  blockId: string,
  entryIds: string[],
  tier: "T1" | undefined,
  createdAt: number,
): void {
  const entries = manager.getBranch() as SessionLikeEntry[];
  const view = buildV3RuntimeView(entries, reduceCompactState(entries), {
    sessionId: manager.getSessionId(),
    sessionPath: manager.getSessionFile() ?? undefined,
  });
  const summary = `${blockId} summary ${"s".repeat(15_000)}`;
  manager.appendCustomEntry(AILI_COMPACT_ENTRY, {
    header: {
      schema: AILI_COMPACT_SCHEMA_V3,
      txId: `seed-${blockId}`,
      sessionId: view.state.sessionId,
      branchLeafId: view.state.branchLeafId,
      epochId: view.state.epochId,
      catalogId: view.catalog.catalogId,
      createdAt,
      projectionVersion: view.state.projectionVersion,
    },
    tag: "semantic-create",
    payload: {
      blockId,
      ...(tier ? { tier } : {}),
      topic: blockId,
      runId: `seed-${blockId}`,
      anchorEntryId: entryIds[0],
      createdTurnOrdinal: createdAt,
      summary,
      summaryDigest: v3SummaryDigest(summary),
      source: { kind: "messages", entryIds, firstEntryId: entryIds[0], lastEntryId: entryIds.at(-1) },
      leafDigest: v3MessageLeafDigest(entryIds),
      leafCount: entryIds.length,
      tokens: {
        estimatorVersion: TOKEN_ESTIMATOR_VERSION,
        providerId: providerName,
        modelId: model.id,
        sourceTokensLower: 20_000,
        sourceTokensUpper: 20_000,
        replacementTokensUpper: 1_000,
        steadySavingsTokensLower: 19_000,
        oneTimeCostTokensUpper: 1_000,
        breakEvenTurnsUpper: 1,
        savingsRatio: 0.95,
        summaryTokensUpper: 1_000,
      },
      quality: {
        status: "accepted",
        evaluatorVersion: QUALITY_EVALUATOR_VERSION,
        sourceFactDigest: digest(entryIds),
        hardFactCount: 1,
        coveredHardFactCount: 1,
        warningCodes: [],
      },
    },
  });
}

function latestToolResult(context: Context, toolName: string): { result?: unknown; blockRefs?: unknown } | undefined {
  const message = [...context.messages].reverse().find((item) => item.role === "toolResult" && item.toolName === toolName);
  const body = textOf(message?.content);
  if (!body) return message ? { result: { missingBody: true, content: message.content } } : undefined;
  try {
    const parsed = JSON.parse(body) as { result?: unknown };
    const result = parsed.result ?? parsed;
    const blockRefs = toolName === "aili_context_recap"
      ? (result as { blockRefs?: unknown }).blockRefs
      : undefined;
    return { result, blockRefs };
  } catch {
    return { result: { unparsableBody: body } };
  }
}

function toolStream(selected: Model<any>, call: AssistantMessage["content"][number]) {
  return assistantStream(selected, [call], "toolUse");
}

function textStream(selected: Model<any>, text: string) {
  return assistantStream(selected, [{ type: "text", text }], "stop");
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

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? [part.text] : []).join("");
}

function configureToolPermissions(agentDir: string): void {
  mkdirSync(join(agentDir, "permission-mode"), { recursive: true });
  writeFileSync(join(agentDir, "permission-mode", "permission-mode.json"), JSON.stringify({
    defaultMode: "default",
    modes: {
      default: {
        permission: { tool: { "*": "ask", aili_compact_status: "allow", aili_context_recap: "allow", aili_compact: "allow" } },
      },
    },
  }));
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_PERMISSION_MODE", "default");
}
