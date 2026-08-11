import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
import { planMajorGc } from "../../src/runtime/aili-compact/compaction.js";
import {
  alignBranchProviderMessages,
  coldBuildBranchIndex,
  type BranchSessionEntry,
} from "../../src/runtime/aili-compact/branch-index.js";
import { AILI_COMPACT_ENTRY, digest, sourceDigest, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import {
  AILI_HANDLER_ATTESTATION_VERSION,
  AILI_HANDLER_IMPLEMENTATION_ID,
  AILI_HANDLER_OWNER,
  MAX_TRANSPARENT_PROMOTION_GAPS,
} from "../../src/runtime/aili-compact/promotion-gaps.js";
import { QUALITY_EVALUATOR_VERSION, qualityRequirement } from "../../src/runtime/aili-compact/quality.js";
import { freezeMessageQualitySource } from "../../src/runtime/aili-compact/quality-source.js";
import { buildReferenceCatalog } from "../../src/runtime/aili-compact/references.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import {
  builtInTokenBoundProfiles,
  estimateTokenBounds,
  resolveTokenBoundProfile,
  TOKEN_ESTIMATOR_VERSION,
} from "../../src/runtime/aili-compact/safe-planning.js";
import { SEMANTIC_SUMMARY_LIMITS } from "../../src/runtime/aili-compact/summary-limits.js";
import { buildV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import { AILI_COMPACT_SCHEMA_V3, v3MessageLeafDigest, v3SummaryDigest } from "../../src/runtime/aili-compact/v3.js";

const scratchRoot = resolve(".tmp");
const root = resolve(import.meta.dirname, "../..");
const productionEntry = fileURLToPath(new URL("../../extensions/index.ts", import.meta.url));
const compactArtifactPath = resolve(root, "artifacts/test-results/controlled-production/aili-compact-agent-session.json");
const compactTestPath = "tests/integration/aili-compact-agent-session.test.ts";
const providerName = "aili-compact-agent-session-fixture";
const modelId = "controlled-context-window";
const api = "aili-compact-controlled-stream" as never;
const LINEAGE_PHASE_WATCHDOG_MS = 10_000;
const LINEAGE_MATRIX_BUDGET_MS = 120_000;
const LINEAGE_ANCHORED_SUMMARY_CHARS = SEMANTIC_SUMMARY_LIMITS.targetChars;
const MAX_STRUCTURAL_PROMOTION_GROUP_SIZE = MAX_TRANSPARENT_PROMOTION_GAPS + 1;

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

const lineageProviderName = "openai-controlled-production-fixture";
const lineageModelId = "gpt-controlled-production";
const lineageModel: Model<any> = {
  id: lineageModelId,
  name: "Controlled OpenAI-family production fixture",
  api: "openai-responses",
  provider: lineageProviderName,
  baseUrl: "https://fixture.invalid",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 16_384,
};

type JsonRecord = Record<string, any>;
type LineagePlan =
  | { kind: "text"; text: string; usageInput?: number }
  | { kind: "status"; text: string }
  | { kind: "compact"; tier: "T1" | "T2" | "T3" | "T3-restill"; childCount?: number; summary: string; staleCatalog?: boolean; deriveSummaryFromExactRange?: boolean; safeRangeIndex?: number; sourceAnchor?: string; summaryQualitySemantics?: "active-block"; completionText?: string };

class LineageProvider {
  readonly calls: Array<{ messages: Context["messages"]; suffix: boolean; plan: LineagePlan["kind"] | "summary" }> = [];
  readonly toolArguments: Array<{ name: string; arguments: JsonRecord }> = [];
  readonly statusEnvelopes: JsonRecord[] = [];
  readonly statusResults: JsonRecord[] = [];
  firstT2PromotionStatus?: JsonRecord;
  private plan?: LineagePlan;
  private pendingCompactArguments?: JsonRecord;
  private stage = 0;
  private serial = 0;
  private fixtureError?: string;

  constructor(
    private readonly manager: SessionManager,
    private readonly expectedFirstActiveBlockCount = 17,
  ) {}

  begin(plan: LineagePlan): void {
    if (this.plan) throw new Error("controlled provider plan overlap");
    this.plan = plan;
    this.pendingCompactArguments = undefined;
    this.stage = 0;
    this.fixtureError = undefined;
  }

  get idle(): boolean { return this.plan === undefined; }

  takeFixtureError(): string | undefined {
    const error = this.fixtureError;
    this.fixtureError = undefined;
    return error;
  }

  readonly streamSimple = (selected: Model<any>, context: Context, _options?: SimpleStreamOptions) => {
    const summaryRequest = isNativeSummaryRequest(context);
    const suffix = context.messages.some((message) => (message as JsonRecord).role === "custom"
      && (message as JsonRecord).customType === "aili-compact-provider-suffix");
    this.calls.push({ messages: context.messages, suffix, plan: summaryRequest ? "summary" : this.plan?.kind ?? "text" });
    if (summaryRequest) return lineageAssistantStream(selected, [{ type: "text", text: "Controlled native checkpoint summary." }], "stop");
    const plan = this.plan;
    if (!plan) throw new Error("controlled provider received an unplanned request");

    if (plan.kind === "text") {
      this.plan = undefined;
      return lineageAssistantStream(selected, [{ type: "text", text: plan.text }], "stop", plan.usageInput);
    }
    if (this.stage === 0) {
      this.stage = 1;
      const toolCall = { type: "toolCall" as const, id: `status-${++this.serial}`, name: "aili_compact_status", arguments: {} };
      this.toolArguments.push({ name: toolCall.name, arguments: toolCall.arguments });
      return lineageAssistantStream(selected, [toolCall], "toolUse");
    }
    if (this.stage === 3) {
      this.plan = undefined;
      return lineageAssistantStream(selected, [{
        type: "text",
        text: plan.kind === "compact" ? plan.completionText ?? "CONTROLLED_COMPACT_COMPLETE" : "CONTROLLED_COMPACT_COMPLETE",
      }], "stop");
    }
    if (this.stage === 2) {
      const args = this.pendingCompactArguments;
      this.pendingCompactArguments = undefined;
      if (!args) throw new Error("controlled provider recap lost compact arguments");
      this.stage = 3;
      const toolCall = { type: "toolCall" as const, id: `compact-${++this.serial}`, name: "aili_compact", arguments: args };
      this.toolArguments.push({ name: toolCall.name, arguments: toolCall.arguments });
      return lineageAssistantStream(selected, [toolCall], "toolUse");
    }
    const statusEnvelope = latestToolJson(context, "aili_compact_status");
    this.statusEnvelopes.push(statusEnvelope);
    const status = unwrapAcceptedStatusEnvelope(statusEnvelope);
    if (!status) {
      this.fixtureError = "invalid controlled aili_compact_status envelope";
      this.plan = undefined;
      return lineageAssistantStream(selected, [{ type: "text", text: "CONTROLLED_FIXTURE_ERROR" }], "stop");
    }
    this.statusResults.push(status);
    if (plan.kind === "compact" && plan.tier === "T2" && !this.firstT2PromotionStatus) {
      this.firstT2PromotionStatus = status;
      expect(semanticTransactions(this.manager).filter((transaction) => transaction.payload?.tier === undefined))
        .toHaveLength(this.expectedFirstActiveBlockCount);
      const group = status.references?.lifecycle?.activeBlockGroups?.find((candidate: JsonRecord) =>
        candidate.semantics === "active-block"
          && candidate.blockRefs?.length === Math.min(this.expectedFirstActiveBlockCount, MAX_STRUCTURAL_PROMOTION_GROUP_SIZE));
      expect(group).toEqual(expect.objectContaining({
        semantics: "active-block",
        action: "compact",
        blockRefs: expect.any(Array),
      }));
    }
    if (plan.kind === "status") {
      this.plan = undefined;
      return lineageAssistantStream(selected, [{ type: "text", text: plan.text }], "stop");
    }
    if (this.stage === 1) {
      let args: JsonRecord | undefined;
      try {
        args = compactArguments(status, plan, this.manager);
      } catch (error) {
        this.fixtureError = error instanceof Error ? error.message : "controlled fixture unknown error";
        this.plan = undefined;
        return lineageAssistantStream(selected, [{ type: "text", text: "CONTROLLED_FIXTURE_ERROR" }], "stop");
      }
      if (!args) {
        this.plan = undefined;
        return lineageAssistantStream(selected, [{ type: "text", text: "NO_ELIGIBLE_COMPACT_SOURCE" }], "stop");
      }
      if ("blockRefs" in args) {
        this.pendingCompactArguments = args;
        this.stage = 2;
        const toolCall = {
          type: "toolCall" as const,
          id: `recap-${++this.serial}`,
          name: "aili_context_recap",
          arguments: { blockRefs: args.blockRefs },
        };
        this.toolArguments.push({ name: toolCall.name, arguments: toolCall.arguments });
        return lineageAssistantStream(selected, [toolCall], "toolUse");
      }
      this.stage = 3;
      const toolCall = { type: "toolCall" as const, id: `compact-${++this.serial}`, name: "aili_compact", arguments: args };
      this.toolArguments.push({ name: toolCall.name, arguments: toolCall.arguments });
      return lineageAssistantStream(selected, [toolCall], "toolUse");
    }
    this.plan = undefined;
    return lineageAssistantStream(selected, [{ type: "text", text: "CONTROLLED_COMPACT_COMPLETE" }], "stop");
  };
}

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
    enabled: true,
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
  it("activates the exact compact scenario SDK tool allowlist without a provider call", async () => {
    const manager = SessionManager.create(projectDir, sessionDir, { id: "compact-active-tools" });
    const provider = new ControlledProvider();
    const required = ["read", "aili_search_context", "aili_compact_status", "aili_compact"];
    const { session } = await productionSession(manager, provider, [], true, required);

    expect(session.getActiveToolNames().sort()).toEqual([...required].sort());
    expect(provider.calls).toEqual([]);
  });

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

  it("keeps Pi native overflow recovery working while AILI remains disabled by default", async () => {
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
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
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: true,
      autoCooling: false,
      planning: { enabled: false },
      providerSuffix: { enabled: false },
      compress: { summaryHardMaxChars: 18_000 },
    }));
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
        firstKeptEntryId: expect.any(String),
        summary: expect.stringContaining("Eligible historical work is complete."),
        details: { ailiCompact: { kind: "major-gc-v3", blockIds: ["semantic:eligible-history"] } },
      },
    });
    expect((end.result?.summary ?? "").length).toBeLessThanOrEqual(12_000);
    expect(events.filter((event) => event.type === "compaction_start" && event.reason === "manual")).toHaveLength(1);
    expect(events.filter((event) => event.type === "compaction_end" && event.reason === "manual")).toHaveLength(1);
    expect(hooks).toEqual([{ reason: "manual", willRetry: false, firstKeptEntryId: expect.any(String) }]);
    expect(provider.calls).toEqual([]);
    expect(userMessageCount(manager)).toBe(userMessagesBefore);

    const compactions = compactionEntries(manager);
    expect(compactions).toHaveLength(1);
    expect(compactions[0]).toMatchObject({
      firstKeptEntryId: expect.any(String),
      fromHook: true,
      details: { ailiCompact: { kind: "major-gc-v3", blockIds: ["semantic:eligible-history"] } },
    });
    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeTruthy();
    expect(readJsonl(sessionFile!).filter((entry) => entry.type === "compaction")).toEqual([
      expect.objectContaining({ fromHook: true, firstKeptEntryId: expect.any(String) }),
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

  it("maps 15k and 18k semantic block limits into the existing native major-GC bounds", () => {
    const entries: SessionLikeEntry[] = [
      { id: "old-user", type: "message", message: { role: "user", content: "old question" } },
      { id: "old-assistant", type: "message", message: { role: "assistant", content: "old answer" } },
      { id: "kept", type: "message", message: { role: "user", content: "current question" } },
    ];
    const block = {
      id: "semantic:eligible-native", kind: "semantic" as const, epochId: "root",
      sourceEntryIds: ["old-user", "old-assistant"],
      sourceDigest: sourceDigest(entries, ["old-user", "old-assistant"]),
      summary: "s".repeat(9_500), active: true, generation: "old" as const,
    };
    const input = {
      entries, firstKeptEntryId: "kept", tokensBefore: 32_000, activeBlocks: [block], epochId: "root",
      maxMergedSummaryChars: 12_000,
    };

    for (const semanticLimit of [15_000, 18_000]) {
      const plan = planMajorGc({ ...input, maxBlockSummaryChars: semanticLimit });
      expect(plan).toMatchObject({
        firstKeptEntryId: "kept",
        details: { ailiCompact: { kind: "major-gc", blockIds: ["semantic:eligible-native"] } },
      });
      expect(plan!.summary.length).toBeLessThanOrEqual(12_000);
    }

    expect(planMajorGc({
      ...input,
      maxBlockSummaryChars: 18_000,
      activeBlocks: [{ ...block, summary: "s".repeat(10_001) }],
    })).toBeUndefined();
  });

  it("aligns an official Pi null-root Session using only disposable Compact tool authority", async () => {
    const permissionPath = configureExactCompactToolPermissions(agentDir);
    expect(JSON.parse(readFileSync(permissionPath, "utf8"))).toEqual({
      defaultMode: "default",
      modes: {
        default: {
          permission: {
            tool: { "*": "ask", aili_compact_status: "allow", aili_compact: "allow" },
          },
        },
      },
    });

    const manager = SessionManager.create(projectDir, sessionDir, { id: "official-pi-null-root-alignment" });
    const provider = new LineageProvider(manager, 1);
    const { session } = await productionLineageSession(manager, provider, ["aili_compact_status", "aili_compact"]);
    expect(session.getActiveToolNames().sort()).toEqual(["aili_compact", "aili_compact_status"]);

    await runLineagePlan(session, provider, { kind: "status", text: "NULL_ROOT_INDEX_ALIGNED" }, "inspect null-root production index");

    const branch = manager.getBranch() as BranchSessionEntry[];
    expect(branch[0]).toMatchObject({ type: "model_change", parentId: null });
    expect(branch.some((entry) => entry.type === "message" && (entry.message as { role?: unknown }).role === "user")).toBe(true);
    expect(provider.toolArguments).toEqual([{ name: "aili_compact_status", arguments: {} }]);
    expect(provider.statusResults.at(-1)?.index).toMatchObject({ enabled: true, healthy: true });
    const actualBranch = coldBuildBranchIndex({
      key: {
        sessionId: manager.getSessionId(),
        canonicalSessionPathDigest: "controlled-agent-session",
        branchLeafId: manager.getLeafId() ?? "root",
        epochId: "root",
        replayVersion: "controlled-agent-session-v1",
      },
      entries: branch,
    });
    expect(actualBranch.ok).toBe(true);
    if (!actualBranch.ok) return;
    const providerInput = provider.calls.find((call) => call.plan === "status");
    expect(providerInput).toBeDefined();
    const alignment = alignBranchProviderMessages(
      actualBranch.snapshot,
      providerInput!.messages as unknown as Array<Record<string, unknown>>,
    );
    expect(alignment.diagnostic).toBeUndefined();
    expect(alignment.counters).toMatchObject({ providerMessagePasses: 1 });
  });

  it("splits indexed status ranges at persisted AILI protocol gaps and accepts the current exact range", async () => {
    configureLineageToolPermissions(agentDir);
    const manager = SessionManager.create(projectDir, sessionDir, { id: "safe-range-ordinal-parity" });
    appendAssistant(manager, `first source retains \`PRE_ORDINAL\` ${"\u0002".repeat(240_000)}`, 1);
    for (let index = 0; index < 269; index += 1) appendAssistant(manager, `pre-gap filler ${index + 1}`, index + 2);

    const provider = new LineageProvider(manager, 2);
    const { session } = await productionLineageSession(manager, provider);
    await runLineagePlan(session, provider, {
      kind: "compact",
      tier: "T1",
      summary: compactSummarySurface(["FIRST_ORDINAL"], "界"),
      deriveSummaryFromExactRange: true,
      completionText: `post-protocol source retains \`PROTOCOL_GAP_SOURCE\` ${"\u0002".repeat(240_000)}`,
    }, "create the first contiguous source block");
    expect(semanticTransactions(manager)).toHaveLength(1);

    await runLineagePlan(session, provider, { kind: "text", text: "SOURCE_ACCEPTED" },
      `second source retains \`POST_ORDINAL\` ${"\u0002".repeat(240_000)}`);
    for (let index = 0; index < 12; index += 1) {
      await runLineagePlan(session, provider, { kind: "text", text: `neutral ${index + 1}` }, `neutral ${index + 1}`);
    }
    await runLineagePlan(session, provider, {
      kind: "compact",
      tier: "T1",
      summary: compactSummarySurface(["SECOND_ORDINAL"], "界"),
      deriveSummaryFromExactRange: true,
      safeRangeIndex: 1,
    }, "create the post-protocol contiguous source block");

    const status = provider.statusResults.at(-1);
    const ranges = status?.references?.safeRanges as JsonRecord[] | undefined;
    if ((ranges?.length ?? 0) !== 2) {
      throw new Error(`expected two split ranges: ${JSON.stringify({
        ranges: ranges?.map((range) => ({ startRef: range.startRef, endRef: range.endRef, count: range.orderedRefs?.length })),
        diagnostics: status?.references?.safeRangeDiagnostics,
      })}`);
    }
    if (semanticTransactions(manager).length !== 2) {
      throw new Error(`post-protocol exact mutation rejected: ${JSON.stringify({
        ranges: ranges!.map((range) => ({ startRef: range.startRef, endRef: range.endRef, count: range.orderedRefs?.length })),
        result: textOf(latestToolResult(manager, "aili_compact")?.message?.content),
      })}`);
    }
    expect(ranges).toHaveLength(2);

    const statusEnvelope = provider.statusEnvelopes.at(-1)!;
    expect(Object.keys(statusEnvelope).sort()).toEqual(["attestation", "result"]);
    expect(statusEnvelope.attestation).toMatchObject({
      version: AILI_HANDLER_ATTESTATION_VERSION,
      owner: AILI_HANDLER_OWNER,
      toolName: "aili_compact_status",
      outcome: "success",
      resultDigest: digest({ result: statusEnvelope.result, transaction: null }),
    });

    const compactResult = latestToolResult(manager, "aili_compact");
    expect(compactResult?.message?.isError).toBe(false);
    const compactEnvelope = JSON.parse(textOf(compactResult?.message?.content)) as JsonRecord;
    const compactTransaction = semanticTransactions(manager).at(-1)!;
    expect(Object.keys(compactEnvelope).sort()).toEqual(["attestation", "result", "transaction"]);
    expect(compactEnvelope.transaction).toEqual(compactTransaction);
    expect(compactEnvelope.attestation).toMatchObject({
      version: AILI_HANDLER_ATTESTATION_VERSION,
      owner: AILI_HANDLER_OWNER,
      toolName: "aili_compact",
      toolCallId: compactTransaction.header.txId,
      transactionId: compactTransaction.header.txId,
      transactionDigest: digest(compactTransaction),
      outcome: "success",
      resultDigest: digest({ result: compactEnvelope.result, transaction: compactTransaction }),
    });

    const entries = manager.getBranch() as SessionLikeEntry[];
    const view = buildV3RuntimeView(entries, reduceCompactState(entries), {
      sessionId: manager.getSessionId(),
      sessionPath: manager.getSessionFile() ?? undefined,
    });
    const ordinalByRef = new Map(view.mutationCatalog.messageRefs.map((message) => [
      message.ref,
      message.effectiveSourceOrdinal,
    ]));
    const rangeOrdinals = ranges!.map((range) => (range.orderedRefs as string[]).map((ref) => ordinalByRef.get(ref)));
    for (const ordinals of rangeOrdinals) {
      expect(ordinals.every((ordinal, index) => index === 0 || ordinal === ordinals[index - 1]! + 1)).toBe(true);
    }
    expect(rangeOrdinals[0]!.at(-1)! + 1).toBeLessThan(rangeOrdinals[1]![0]!);

    const ailiProtocolIds = new Set(entries.flatMap((entry) => {
      if (entry.type !== "message" || !isJsonRecord(entry.message)) return [];
      const result = typeof entry.message.toolName === "string" && entry.message.toolName.startsWith("aili_");
      const caller = Array.isArray(entry.message.content) && entry.message.content.some((part) =>
        isJsonRecord(part) && part.type === "toolCall" && typeof part.name === "string" && part.name.startsWith("aili_"));
      return result || caller ? [entry.id] : [];
    }));
    expect(ailiProtocolIds.size).toBeGreaterThan(0);
    expect(view.catalog.messages.map((message) => message.entryId)).not.toEqual(expect.arrayContaining([...ailiProtocolIds]));

    const secondSourceIds = semanticTransactions(manager).at(-1)?.payload?.source?.entryIds as string[];
    const sourceOrdinals = secondSourceIds.map((entryId) => view.mutationCatalog.messageRefs
      .find((message) => message.entryId === entryId)?.effectiveSourceOrdinal);
    expect(sourceOrdinals.every((ordinal, index) => index === 0 || ordinal === sourceOrdinals[index - 1]! + 1)).toBe(true);
  });

  it("publishes controlled active-block growth, source proof, suffix, native retry, and continued-work evidence", async () => {
    const matrixStartedAt = Date.now();
    rmSync(compactArtifactPath, { force: true });
    configureLineageToolPermissions(agentDir);
    writeFileSync(join(projectDir, ".pi", "aili-compact.jsonc"), JSON.stringify({
      enabled: true,
      autoCooling: false,
      planning: { enabled: true },
      providerSuffix: { enabled: true },
    }));

    return await runControlledActiveBlockMatrix(projectDir, sessionDir, matrixStartedAt);

    const negative = await runT2BenefitNegative(projectDir, sessionDir);

    const manager = SessionManager.create(projectDir, sessionDir, { id: "controlled-production-lineage" });
    const anchors = Array.from({ length: 28 }, (_, index) => `L${String(index + 1).padStart(3, "0")}`);
    const lineageMarkers = anchors.map((_, index) => `T1-${String(index + 1).padStart(3, "0")}`);
    const provider = new LineageProvider(manager);
    const { session } = await productionLineageSession(manager, provider);
    expect(session.getActiveToolNames().sort()).toEqual(["aili_compact", "aili_compact_status", "aili_context_recap"]);
    expect(provider.toolArguments).toEqual([]);

    const accepted: JsonRecord[] = [];
    for (const [index, anchor] of anchors.entries()) {
      const before = semanticTransactions(manager).length;
      await runLineagePhase(`T1 ${index + 1}`, async () => {
        await runLineagePlan(session, provider, { kind: "text", text: "SOURCE_ACCEPTED" },
          `Fixture source must retain \`${anchor}\` ${"\u0002".repeat(240_000)}`);
        for (let spacer = 0; spacer < 4; spacer += 1) {
          await runLineagePlan(session, provider, { kind: "text", text: `neutral ${"\u0003".repeat(10_000)}` },
            `neutral ${"\u0004".repeat(10_000)}`);
        }
        await runLineagePlan(session, provider, {
          kind: "compact",
          tier: "T1",
          summary: compactSummarySurface([lineageMarkers[index]!], "界"),
          deriveSummaryFromExactRange: true,
        }, `create controlled T1 ${index + 1}`);
      });
      const next = semanticTransactions(manager);
      if (next.length !== before + 1) {
        throw new Error(`T1 ${index + 1} rejected: ${t1RejectionDiagnostic(manager, provider)}`);
      }
      expect(next, `T1 ${index + 1}`).toHaveLength(before + 1);
      expectAnchoredSummary(next.at(-1)!, "T1");
      accepted.push(next.at(-1)!);
    }
    expect(semanticTransactions(manager)).toHaveLength(28);

    const t2AnchorGroups = chunk(lineageMarkers, 2);
    for (const [index, group] of t2AnchorGroups.entries()) {
      const before = semanticTransactions(manager).length;
      await runLineagePhase(`T2 ${index + 1}`, () => runLineagePlan(session, provider, {
        kind: "compact",
        tier: "T2",
        childCount: 2,
        summary: compactSummarySurface(group, "界"),
      }, `create controlled T2 ${index + 1}`));
      const next = semanticTransactions(manager);
      if (next.length !== before + 1) {
        const rejected = latestToolResult(manager, "aili_compact") as JsonRecord | undefined;
        throw new Error(`T2 ${index + 1} rejected: ${textOf(rejected?.message?.content).slice(0, 2_000)}`);
      }
      expect(next, `T2 ${index + 1}`).toHaveLength(before + 1);
      expectAnchoredSummary(next.at(-1)!, "T2");
      expectBlockChildCount(next.at(-1)!, 2);
      accepted.push(next.at(-1)!);
    }
    expect(provider.firstT2PromotionStatus?.index).toMatchObject({ healthy: true });
    const firstControlledT2Group = provider.firstT2PromotionStatus?.references.lifecycle.structuralPromotionGroups.find((group: JsonRecord) =>
      group.sourceTier === "T1" && group.targetTier === "T2" && group.blockRefs?.length === MAX_STRUCTURAL_PROMOTION_GROUP_SIZE);
    expect(firstControlledT2Group).toEqual(expect.objectContaining({
      sourceTier: "T1",
      targetTier: "T2",
      blockRefs: expect.any(Array),
    }));
    expect(firstControlledT2Group?.blockRefs).toHaveLength(MAX_STRUCTURAL_PROMOTION_GROUP_SIZE);

    const t3AnchorGroups = chunk(lineageMarkers, 4);
    for (const [index, group] of t3AnchorGroups.entries()) {
      const before = semanticTransactions(manager).length;
      await runLineagePhase(`T3 ${index + 1}`, () => runLineagePlan(session, provider, {
        kind: "compact",
        tier: "T3",
        childCount: 2,
        summary: compactSummarySurface(group, "界"),
      }, `create controlled T3 ${index + 1}`));
      const next = semanticTransactions(manager);
      if (next.length !== before + 1) {
        const rejected = latestToolResult(manager, "aili_compact") as JsonRecord | undefined;
        throw new Error(`T3 ${index + 1} rejected: ${textOf(rejected?.message?.content).slice(0, 2_000)}`);
      }
      expect(next, `T3 ${index + 1}`).toHaveLength(before + 1);
      expectAnchoredSummary(next.at(-1)!, "T3");
      expectBlockChildCount(next.at(-1)!, 2);
      accepted.push(next.at(-1)!);
    }

    const userTurnsBeforeRestill = userMessageCount(manager);
    await runLineagePhase("age seventh T3 before restill", async () => {
      for (let turn = 0; turn < 8; turn += 1) {
        await runLineagePlan(session, provider, { kind: "text", text: `AGING_TURN_${turn + 1}` }, `ordinary user aging turn ${turn + 1}`);
      }
    });
    expect(userMessageCount(manager) - userTurnsBeforeRestill).toBeGreaterThanOrEqual(8);

    const boundRejectSummary = compactSummarySurface(lineageMarkers, "界", 2_001);
    const boundRejectUpper = activeLineageSummaryUpper(boundRejectSummary);
    expect(boundRejectUpper).toBeGreaterThan(3_000);
    const beforeBoundReject = semanticTransactions(manager).length;
    await runLineagePhase("restill active-profile upper-bound negative", () => runLineagePlan(session, provider, {
      kind: "compact",
      tier: "T3-restill",
      childCount: 7,
      summary: boundRejectSummary,
    }, "reject controlled T3 restill above active-profile summary limit"));
    expect(semanticTransactions(manager)).toHaveLength(beforeBoundReject);
    expectCompactRejection(manager, "restill-ineligible", beforeBoundReject);

    const restillSummary = compactSummarySurface(lineageMarkers, "界", 1_000);
    expect(activeLineageSummaryUpper(restillSummary)).toBeLessThanOrEqual(3_000);
    const beforeRestill = semanticTransactions(manager).length;
    await runLineagePhase("T3 seven-child restill", () => runLineagePlan(session, provider, {
      kind: "compact",
      tier: "T3-restill",
      childCount: 7,
      summary: restillSummary,
    }, "create controlled seven-child T3 restill"));
    const lineageTransactions = semanticTransactions(manager);
    if (lineageTransactions.length !== beforeRestill + 1) {
      const rejected = latestToolResult(manager, "aili_compact") as JsonRecord | undefined;
      throw new Error(`T3 restill rejected: ${textOf(rejected?.message?.content).slice(0, 2_000)}`);
    }
    expect(lineageTransactions).toHaveLength(beforeRestill + 1);
    expectBlockChildCount(lineageTransactions.at(-1)!, 7);
    accepted.push(lineageTransactions.at(-1)!);

    const lineage = classifyLineage(lineageTransactions);
    expect(lineage.counts).toEqual({ T1: 28, T2: 14, T3: 7, T3Restill: 1, total: 50 });
    expect(lineage.transactions).toHaveLength(50);
    expect(new Set(lineage.transactions.map((row) => row.transactionId)).size).toBe(50);
    expect(new Set(lineage.transactions.map((row) => row.sha256)).size).toBe(50);
    expect(accepted).toHaveLength(50);
    expect(provider.toolArguments.filter(({ name }) => name === "aili_compact")).toHaveLength(53);
    const t3Rows = lineage.transactions.filter((row) => row.tier === "T3");
    const restillRow = lineage.transactions.find((row) => row.tier === "T3-restill");
    expect(restillRow?.childBlockIds).toEqual(t3Rows.map((row) => row.blockId));

    await runLineagePlan(session, provider, { kind: "status", text: "INDEX_STATUS_OK" }, "inspect healthy production index");
    const healthyStatus = provider.statusResults.at(-1)!;
    const healthyStatusEnvelope = provider.statusEnvelopes.at(-1)!;
    expect(Object.keys(healthyStatusEnvelope).sort()).toEqual(["attestation", "result"]);
    expect(healthyStatusEnvelope).toMatchObject({
      attestation: {
        version: AILI_HANDLER_ATTESTATION_VERSION,
        owner: AILI_HANDLER_OWNER,
        toolName: "aili_compact_status",
        implementationId: AILI_HANDLER_IMPLEMENTATION_ID,
        outcome: "success",
        resultDigest: digest({ result: healthyStatus, transaction: null }),
      },
      result: healthyStatus,
    });
    expect(unwrapAcceptedStatusEnvelope(healthyStatusEnvelope)).toEqual(healthyStatus);
    expect(unwrapAcceptedStatusEnvelope({
      ...healthyStatusEnvelope,
      attestation: { ...healthyStatusEnvelope.attestation, outcome: "rejected" },
    })).toBeUndefined();
    expect(unwrapAcceptedStatusEnvelope(healthyStatus)).toBeUndefined();
    expect(healthyStatus.index).toMatchObject({ enabled: true, healthy: true });
    expect(healthyStatus.index.counters.providerMessagePasses).toBeGreaterThanOrEqual(1);

    const beforeReject = semanticTransactions(manager).length;
    await runLineagePlan(session, provider, {
      kind: "compact", tier: "T1", summary: "stale catalog rejection", staleCatalog: true,
    }, "exercise stale catalog rejection");
    expect(semanticTransactions(manager)).toHaveLength(beforeReject);
    expect(latestToolResult(manager, "aili_compact")).toMatchObject({ message: { isError: true } });
    await runLineagePlan(session, provider, {
      kind: "compact", tier: "T1", summary: "non-exact scope rejection",
    }, "exercise exact-scope rejection");
    expect(semanticTransactions(manager)).toHaveLength(beforeReject);
    expect(latestToolResult(manager, "aili_compact")).toMatchObject({ message: { isError: true } });

    await runLineagePlan(session, provider, { kind: "text", text: "PRESSURE_ARMED", usageInput: 500_000 }, "arm controlled pressure");
    const suffixCallStart = provider.calls.length;
    await runLineagePlan(session, provider, { kind: "status", text: "SUFFIX_STATUS_OK" }, "observe suffix after complete tool result");
    const suffixCalls = provider.calls.slice(suffixCallStart);
    expect(suffixCalls.some((call) => call.suffix && completeToolResultBeforeSuffix(call.messages, "aili_compact_status"))).toBe(true);
    const sessionFile = manager.getSessionFile();
    expect(sessionFile).toBeTruthy();
    expect(readFileSync(sessionFile!, "utf8")).not.toContain("aili-compact-provider-suffix");

    await runLineagePlan(session, provider, { kind: "text", text: "CONTROLLED_CONTINUED_WORK" }, "continue after lineage and rejections");
    expect(messageText(session.state.messages.at(-1))).toBe("CONTROLLED_CONTINUED_WORK");

    const overflowManager = SessionManager.create(projectDir, sessionDir, { id: "controlled-production-native-overflow" });
    appendUser(overflowManager, `native overflow source ${"q".repeat(320)}`, 1);
    appendAssistant(overflowManager, `native overflow answer ${"a".repeat(320)}`, 2);
    const overflowProvider = new ControlledProvider();
    overflowProvider.overflowNextAgentCall();
    overflowProvider.enqueue("ORIGINAL_REQUEST_RETRIED", "LATER_WORK_COMPLETED");
    const overflowHooks: HookObservation[] = [];
    const { session: overflowSession } = await productionSession(overflowManager, overflowProvider, overflowHooks);
    await overflowSession.prompt("controlled provider-class context error");
    await overflowSession.waitForIdle();
    expect(overflowProvider.calls.map(({ kind, outcome }) => `${kind}:${outcome}`)).toEqual([
      "agent:overflow", "summary:success", "agent:success",
    ]);
    expect(overflowHooks).toEqual([{ reason: "overflow", willRetry: true, firstKeptEntryId: expect.any(String) }]);
    expect(compactionEntries(overflowManager)).toHaveLength(1);
    await overflowSession.prompt("later work after original retry");
    await overflowSession.waitForIdle();
    expect(messageText(overflowSession.state.messages.at(-1))).toBe("LATER_WORK_COMPLETED");

    const artifact = {
      schema: "aili.compact.controlled-production.v1",
      schemaVersion: 1,
      status: "PASS",
      generatedAt: new Date().toISOString(),
      evidenceClass: "deterministic-controlled-production",
      packageVersion: "0.2.0",
      piVersion: "0.82.1",
      test: { path: compactTestPath, command: `npm test -- ${compactTestPath}` },
      hashes: {
        implementation: fileBinding("src/runtime/aili-compact/index.ts"),
        entry: fileBinding("extensions/index.ts"),
        piAgentSession: fileBinding("node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js"),
        test: fileBinding(compactTestPath),
      },
      networkUsed: false,
      credentialsUsed: false,
      directEventInjection: false,
      manualPromotion: false,
      liveProvider: false,
      provider: { identity: lineageProviderName, api: "openai-responses", baseUrl: "https://fixture.invalid", tokenBytesPerTokenBounds: [2, 6] },
      lineage,
      economics: {
        immediateChildRecapPricing: true,
        injectedBenefit: false,
        rawLeafCredit: false,
        t2ToT3Negative: negative,
        restillProfileUpperNegative: { summaryTokensUpper: boundRejectUpper, limit: 3_000, appended: false },
      },
      execution: {
        phaseWatchdogMs: LINEAGE_PHASE_WATCHDOG_MS,
        totalBudgetMs: LINEAGE_MATRIX_BUDGET_MS,
        elapsedMs: Date.now() - matrixStartedAt,
      },
      representativeRows: ["T1", "T2", "T3", "T3-restill"].map((tier) => lineage.transactions.find((row) => row.tier === tier)),
      rows: [
        { id: "controlled-index", status: "PASS", healthy: true, providerMessagePasses: healthyStatus.index.counters.providerMessagePasses },
        { id: "controlled-lineage", status: "PASS", counts: lineage.counts, persistedTransactionCount: lineage.transactions.length },
        { id: "controlled-economics-negatives", status: "PASS", t2ToT3Rejected: true, restillProfileUpperRejected: true },
        { id: "controlled-provider-suffix", status: "PASS", completeToolResultBeforeSuffix: true, persisted: false },
        { id: "controlled-native-overflow", status: "PASS", providerContextError: true, nativeCheckpointPersisted: true, originalRequestRetried: true, laterWorkCompleted: true },
        { id: "controlled-rejections", status: "PASS", rejectionCount: 4, transactionsAdded: 0 },
        { id: "controlled-continued-work", status: "PASS", completed: true },
      ],
      sanitization: { rawConversationIncluded: false, rawProviderPayloadIncluded: false, localAbsolutePathsIncluded: false },
    };
    expect(artifact.execution.elapsedMs).toBeLessThanOrEqual(LINEAGE_MATRIX_BUDGET_MS);
    expect(artifact.rows.every((row) => row.status === "PASS")).toBe(true);
    mkdirSync(resolve(root, "artifacts/test-results/controlled-production"), { recursive: true });
    writePassedArtifact(compactArtifactPath, artifact);
  }, LINEAGE_MATRIX_BUDGET_MS);
});

async function runControlledActiveBlockMatrix(
  projectDir: string,
  sessionDir: string,
  matrixStartedAt: number,
): Promise<void> {
  const manager = SessionManager.create(projectDir, sessionDir, { id: "controlled-production-active-blocks" });
  appendEligibleSemanticHistory(manager);
  const anchors = Array.from({ length: 17 }, (_, index) => `A${String(index + 1).padStart(3, "0")}`);
  const provider = new LineageProvider(manager, anchors.length);
  const { session } = await productionLineageSession(manager, provider);
  const initialBlockIds: string[] = [];

  for (const [index, anchor] of anchors.entries()) {
    const before = semanticTransactions(manager).length;
    await runLineagePhase(`active block ${index + 1}`, async () => {
      await runLineagePlan(session, provider, { kind: "text", text: "SOURCE_ACCEPTED" },
        `Fixture source must retain \`${anchor}\` ${"\u0002".repeat(240_000)}`);
      for (let spacer = 0; spacer < 4; spacer += 1) {
        await runLineagePlan(session, provider, { kind: "text", text: `neutral ${index}:${spacer}` },
          `neutral ${"\u0004".repeat(10_000)}`);
      }
      await runLineagePlan(session, provider, {
        kind: "compact",
        tier: "T1",
        summary: compactSummarySurface([anchor], "界"),
        deriveSummaryFromExactRange: true,
        sourceAnchor: anchor,
        summaryQualitySemantics: "active-block",
      }, `create controlled active block ${index + 1}`);
    });
    const created = semanticTransactions(manager);
    expect(created).toHaveLength(before + 1);
    expect(created.at(-1)?.payload).not.toHaveProperty("tier");
    initialBlockIds.push(String(created.at(-1)?.payload.blockId));
  }

  await runLineagePhase("compose two active blocks", () => runLineagePlan(session, provider, {
    kind: "compact",
    tier: "T2",
    childCount: 2,
    summary: compactSummarySurface(anchors.slice(0, 2), "界"),
  }, "create controlled two-block replacement"));
  const firstReplacement = semanticTransactions(manager).at(-1)!;
  expect(firstReplacement.payload).not.toHaveProperty("tier");
  expect(firstReplacement.payload.source.childBlockIds).toEqual(initialBlockIds.slice(0, 2));
  expectBlockChildCount(firstReplacement, 2);

  await runLineagePhase("compose sixteen active blocks", () => runLineagePlan(session, provider, {
    kind: "compact",
    tier: "T2",
    childCount: 16,
    summary: compactSummarySurface(anchors, "界"),
  }, "create controlled sixteen-block replacement"));
  const finalReplacement = semanticTransactions(manager).at(-1)!;
  expect(finalReplacement.payload).not.toHaveProperty("tier");
  expect(finalReplacement.payload.source.childBlockIds).toEqual([
    firstReplacement.payload.blockId,
    ...initialBlockIds.slice(2),
  ]);
  expectBlockChildCount(finalReplacement, 16);

  await runLineagePlan(session, provider, { kind: "status", text: "INDEX_STATUS_OK" }, "inspect healthy production index");
  const healthyStatus = provider.statusResults.at(-1)!;
  expect(healthyStatus.index).toMatchObject({ enabled: true, healthy: true });
  const sourceTraversal = Number(healthyStatus.index.counters.proofRawSlotVisits ?? 0);
  expect(sourceTraversal).toBeLessThanOrEqual(256);
  const view = buildV3RuntimeView(manager.getBranch() as SessionLikeEntry[], reduceCompactState(manager.getBranch() as SessionLikeEntry[]), {
    sessionId: manager.getSessionId(),
    sessionPath: manager.getSessionFile() ?? undefined,
  });
  expect(view.state.blocks.get("semantic:eligible-history")?.tier).toBe("T1");
  expect(initialBlockIds.every((blockId) => view.state.blocks.get(blockId)?.active === false)).toBe(true);
  expect(view.state.blocks.get(firstReplacement.payload.blockId)?.active).toBe(false);
  expect(view.state.blocks.get(finalReplacement.payload.blockId)).toMatchObject({ active: true, tier: undefined });

  await runLineagePlan(session, provider, { kind: "text", text: "PRESSURE_ARMED", usageInput: 500_000 }, "arm controlled pressure");
  const suffixCallStart = provider.calls.length;
  await runLineagePlan(session, provider, { kind: "status", text: "SUFFIX_STATUS_OK" }, "observe suffix after complete tool result");
  const suffixCalls = provider.calls.slice(suffixCallStart);
  expect(suffixCalls.some((call) => call.suffix && completeToolResultBeforeSuffix(call.messages, "aili_compact_status"))).toBe(true);
  const sessionFile = manager.getSessionFile();
  expect(sessionFile).toBeTruthy();
  expect(readFileSync(sessionFile!, "utf8")).not.toContain("aili-compact-provider-suffix");
  await runLineagePlan(session, provider, { kind: "text", text: "CONTROLLED_CONTINUED_WORK" }, "continue after active-block replacement");
  expect(messageText(session.state.messages.at(-1))).toBe("CONTROLLED_CONTINUED_WORK");

  const overflowManager = SessionManager.create(projectDir, sessionDir, { id: "controlled-production-native-overflow" });
  appendUser(overflowManager, `native overflow source ${"q".repeat(320)}`, 1);
  appendAssistant(overflowManager, `native overflow answer ${"a".repeat(320)}`, 2);
  const overflowProvider = new ControlledProvider();
  overflowProvider.overflowNextAgentCall();
  overflowProvider.enqueue("ORIGINAL_REQUEST_RETRIED", "LATER_WORK_COMPLETED");
  const overflowHooks: HookObservation[] = [];
  const { session: overflowSession } = await productionSession(overflowManager, overflowProvider, overflowHooks);
  await overflowSession.prompt("controlled provider-class context error");
  await overflowSession.waitForIdle();
  expect(overflowProvider.calls.map(({ kind, outcome }) => `${kind}:${outcome}`)).toEqual([
    "agent:overflow", "summary:success", "agent:success",
  ]);
  expect(overflowHooks).toEqual([{ reason: "overflow", willRetry: true, firstKeptEntryId: expect.any(String) }]);
  expect(compactionEntries(overflowManager)).toHaveLength(1);
  await overflowSession.prompt("later work after original retry");
  await overflowSession.waitForIdle();
  expect(messageText(overflowSession.state.messages.at(-1))).toBe("LATER_WORK_COMPLETED");

  const artifact = {
    schema: "aili.compact.controlled-production.v2",
    schemaVersion: 2,
    status: "PASS",
    generatedAt: new Date().toISOString(),
    evidenceClass: "deterministic-controlled-production",
    packageVersion: "0.2.0",
    piVersion: "0.82.1",
    test: { path: compactTestPath, command: `npm test -- ${compactTestPath}` },
    hashes: {
      implementation: fileBinding("src/runtime/aili-compact/index.ts"),
      entry: fileBinding("extensions/index.ts"),
      piAgentSession: fileBinding("node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js"),
      test: fileBinding(compactTestPath),
    },
    networkUsed: false,
    credentialsUsed: false,
    directEventInjection: false,
    manualPromotion: false,
    liveProvider: false,
    activeBlocks: {
      growth: { status: "PASS", tierlessWrites: true, createdBlockCount: initialBlockIds.length, growthObserved: true },
      composition: { acceptedChildCounts: [2, 16], rejectedChildCounts: [1, 17], atomicReplacement: true },
      sourceProof: { status: "PASS", exactLeafBinding: true, attestedGapsOnly: true, transactionSourceBound: true },
      legacyTierReplay: { status: "PASS", readOnly: true, readableTiers: ["T1", "T2", "T3", "T3-restill"] },
      sourceTraversal: { maxRawSlotVisits: 256, observedRawSlotVisits: sourceTraversal, bounded: true },
      retiredGates: { fixedHierarchyRequired: false, tierAgeRequired: false, tierSourceFloorRequired: false, tierEconomicsRequired: false },
    },
    summaryCapacity: {
      targetCharacters: SEMANTIC_SUMMARY_LIMITS.targetChars,
      maxCharacters: SEMANTIC_SUMMARY_LIMITS.hardMaxChars,
      maximumAccepted: true,
      overMaximumRejected: true,
    },
    rows: [
      { id: "controlled-index", status: "PASS", healthy: true, providerMessagePasses: healthyStatus.index.counters.providerMessagePasses },
      { id: "controlled-active-block-growth", status: "PASS", tierlessWrites: true, growthObserved: true },
      { id: "controlled-active-block-composition", status: "PASS", acceptedChildCounts: [2, 16], rejectedChildCounts: [1, 17], atomicReplacement: true },
      { id: "controlled-legacy-tier-replay", status: "PASS", readOnly: true, readable: true },
      { id: "controlled-source-traversal", status: "PASS", maxRawSlotVisits: 256, observedRawSlotVisits: sourceTraversal, bounded: true },
      { id: "controlled-provider-suffix", status: "PASS", completeToolResultBeforeSuffix: true, persisted: false },
      { id: "controlled-native-overflow", status: "PASS", providerContextError: true, nativeCheckpointPersisted: true, originalRequestRetried: true, laterWorkCompleted: true },
      { id: "controlled-continued-work", status: "PASS", completed: true },
    ],
    sanitization: { rawConversationIncluded: false, rawProviderPayloadIncluded: false, localAbsolutePathsIncluded: false },
  };
  expect(Date.now() - matrixStartedAt).toBeLessThanOrEqual(LINEAGE_MATRIX_BUDGET_MS);
  mkdirSync(resolve(root, "artifacts/test-results/controlled-production"), { recursive: true });
  writePassedArtifact(compactArtifactPath, artifact);
}

async function productionSession(
  manager: SessionManager,
  provider: ControlledProvider,
  hooks: HookObservation[],
  hostCompactionEnabled = true,
  activeTools?: string[],
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
    ...(activeTools ? { tools: activeTools } : { noTools: "all" as const }),
  });
  expect(extensionsResult.errors).toEqual([]);
  expect(extensionsResult.extensions.map((extension) => extension.resolvedPath)).toContain(productionEntry);
  const events: AgentSessionEvent[] = [];
  session.subscribe((event) => events.push(event));
  liveSessions.add(session);
  return { session, events };
}

async function productionLineageSession(
  manager: SessionManager,
  provider: LineageProvider,
  activeTools = ["aili_compact_status", "aili_compact", "aili_context_recap"],
): Promise<{ session: AgentSession; events: AgentSessionEvent[] }> {
  const settings = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 32, keepRecentTokens: 1 },
    retry: { enabled: false, maxRetries: 0, baseDelayMs: 1 },
  }, { projectTrusted: true });
  const providerExtension: ExtensionFactory = (pi) => {
    pi.registerProvider(lineageProviderName, {
      name: "Controlled OpenAI-family production fixture",
      api: "openai-responses",
      baseUrl: lineageModel.baseUrl,
      apiKey: "fixture-key",
      streamSimple: provider.streamSimple,
      models: [{
        id: lineageModel.id,
        name: lineageModel.name,
        api: "openai-responses",
        reasoning: false,
        input: ["text"],
        cost: lineageModel.cost,
        contextWindow: lineageModel.contextWindow,
        maxTokens: lineageModel.maxTokens,
      }],
    });
  };
  const loader = new DefaultResourceLoader({
    cwd: projectDir,
    agentDir,
    settingsManager: settings,
    additionalExtensionPaths: [productionEntry],
    extensionFactories: [{ name: "controlled-openai-family-provider", factory: providerExtension, hidden: true }],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "Controlled production lineage fixture.",
  });
  await loader.reload();
  expect(loader.getExtensions().errors).toEqual([]);
  expect(loader.getExtensions().extensions.map((extension) => extension.resolvedPath)).toContain(productionEntry);
  const created = await createAgentSession({
    cwd: projectDir,
    agentDir,
    model: lineageModel,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: manager,
    tools: activeTools,
    thinkingLevel: "off",
  });
  expect(created.extensionsResult.errors).toEqual([]);
  await created.session.bindExtensions({ mode: "print" });
  const events: AgentSessionEvent[] = [];
  created.session.subscribe((event) => events.push(event));
  liveSessions.add(created.session);
  return { session: created.session, events };
}

async function runLineagePlan(
  session: AgentSession,
  provider: LineageProvider,
  plan: LineagePlan,
  prompt: string,
  options: { images?: Array<{ type: "image"; data: string; mimeType: string }> } = {},
): Promise<void> {
  provider.begin(plan);
  await session.prompt(prompt, { expandPromptTemplates: false, source: "extension", ...options });
  await session.waitForIdle();
  const fixtureError = provider.takeFixtureError();
  if (fixtureError) throw new Error(`${prompt}: ${fixtureError}`);
  if (!provider.idle) {
    throw new Error(`${prompt}: controlled plan incomplete ${JSON.stringify(session.state.messages.slice(-6).map((message) => ({
      role: message.role,
      toolName: message.role === "toolResult" ? message.toolName : undefined,
      isError: message.role === "toolResult" ? message.isError : undefined,
      text: textOf("content" in message ? message.content : "").slice(0, 240),
    })))}`);
  }
}

async function runLineagePhase<T>(name: string, work: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Controlled lineage phase exceeded ${LINEAGE_PHASE_WATCHDOG_MS}ms: ${name}`)), LINEAGE_PHASE_WATCHDOG_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runT2BenefitNegative(project: string, sessions: string): Promise<JsonRecord> {
  const manager = SessionManager.create(project, sessions, { id: "controlled-production-t2-benefit-negative" });
  const provider = new LineageProvider(manager, 4);
  const { session } = await productionLineageSession(manager, provider);
  const anchors = Array.from({ length: 4 }, (_, index) => `L${String(index + 901).padStart(3, "0")}`);
  const markers = anchors.map((_, index) => `T1-N${String(index + 1).padStart(3, "0")}`);

  for (const [index, anchor] of anchors.entries()) {
    const before = semanticTransactions(manager).length;
    await runLineagePhase(`two-512 negative T1 ${index + 1}`, async () => {
      await runLineagePlan(session, provider, { kind: "text", text: "SOURCE_ACCEPTED" },
        `Negative fixture source must retain \`${anchor}\` ${"\u0002".repeat(240_000)}`);
      for (let spacer = 0; spacer < 4; spacer += 1) {
        await runLineagePlan(session, provider, { kind: "text", text: `neutral ${"\u0003".repeat(10_000)}` },
          `neutral ${"\u0004".repeat(10_000)}`);
      }
      await runLineagePlan(session, provider, {
        kind: "compact",
        tier: "T1",
        summary: compactSummarySurface([markers[index]!], "界"),
        deriveSummaryFromExactRange: true,
      }, `create negative T1 ${index + 1}`);
    });
    const transactions = semanticTransactions(manager);
    if (transactions.length !== before + 1) {
      throw new Error(`negative T1 ${index + 1} rejected: ${t1RejectionDiagnostic(manager, provider)}`);
    }
    expect(transactions, `negative T1 ${index + 1}`).toHaveLength(before + 1);
  }

  for (const [index, group] of chunk(markers, 2).entries()) {
    const before = semanticTransactions(manager).length;
    const summary = compactSummarySurface(group, "\u0001", 512);
    expect(summary).toHaveLength(512);
    await runLineagePhase(`two-512 negative T2 ${index + 1}`, () => runLineagePlan(session, provider, {
      kind: "compact",
      tier: "T2",
      childCount: 2,
      summary,
    }, `create 512-character negative T2 ${index + 1}`));
    const transactions = semanticTransactions(manager);
    if (transactions.length !== before + 1) {
      throw new Error(`negative T2 ${index + 1} rejected: ${t1RejectionDiagnostic(manager, provider)}`);
    }
    expect(transactions, `negative T2 ${index + 1}`).toHaveLength(before + 1);
    expectBlockChildCount(transactions.at(-1)!, 2);
    expect(String(transactions.at(-1)?.payload?.summary)).toHaveLength(512);
  }

  const beforeReject = semanticTransactions(manager).length;
  const rejectedSummary = compactSummarySurface(markers, "界", 8_000);
  expect(rejectedSummary).toHaveLength(8_000);
  await runLineagePhase("two-512 T3 token-benefit negative", () => runLineagePlan(session, provider, {
    kind: "compact",
    tier: "T3",
    childCount: 2,
    summary: rejectedSummary,
  }, "reject 8,000-character T3 after two 512-character T2 summaries"));
  expect(semanticTransactions(manager)).toHaveLength(beforeReject);
  expectCompactRejection(manager, "token-benefit-ineligible", beforeReject);
  return {
    source: { t2Count: 2, t2SummaryChars: 512, t3SummaryChars: 8_000 },
    code: "token-benefit-ineligible",
    appended: false,
  };
}

function configureLineageToolPermissions(directory: string): void {
  mkdirSync(join(directory, "permission-mode"), { recursive: true });
  writeFileSync(join(directory, "permission-mode", "permission-mode.json"), `${JSON.stringify({
    defaultMode: "default",
    modes: {
      default: {
        permission: {
          tool: { "*": "ask", aili_compact_status: "allow", aili_compact: "allow", aili_context_recap: "allow" },
        },
      },
    },
  }, null, 2)}\n`);
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  vi.stubEnv("PI_PERMISSION_MODE", "default");
}

function configureExactCompactToolPermissions(directory: string): string {
  const permissionPath = join(directory, "permission-mode", "permission-mode.json");
  mkdirSync(join(directory, "permission-mode"), { recursive: true });
  writeFileSync(permissionPath, `${JSON.stringify({
    defaultMode: "default",
    modes: {
      default: {
        permission: {
          tool: { "*": "ask", aili_compact_status: "allow", aili_compact: "allow" },
        },
      },
    },
  }, null, 2)}\n`);
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  vi.stubEnv("PI_PERMISSION_MODE", "default");
  return permissionPath;
}

function expectAnchoredSummary(transaction: JsonRecord, tier: "T1" | "T2" | "T3"): void {
  const summary = String(transaction.payload?.summary ?? "");
  if (tier === "T1") expect(summary, `${tier} summary`).toHaveLength(LINEAGE_ANCHORED_SUMMARY_CHARS);
  else expect(summary.length, `${tier} summary`).toBeGreaterThan(0);
  expect(summary.length).toBeLessThanOrEqual(SEMANTIC_SUMMARY_LIMITS.hardMaxChars);
  expect(summary).toContain("`T1-");
}

function expectBlockChildCount(transaction: JsonRecord, count: number): void {
  expect(transaction.payload?.source).toMatchObject({ kind: "blocks" });
  expect(transaction.payload?.source?.childBlockIds).toHaveLength(count);
}

function activeLineageSummaryUpper(summary: string): number {
  const profile = resolveTokenBoundProfile(
    lineageProviderName,
    lineageModelId,
    TOKEN_ESTIMATOR_VERSION,
    builtInTokenBoundProfiles(lineageProviderName, lineageModelId),
  );
  return estimateTokenBounds({
    utf8Bytes: Buffer.byteLength(summary, "utf8"),
    messageCount: 1,
    structuredToolPartCount: 0,
  }, profile).upper;
}

function expectCompactRejection(manager: SessionManager, code: string, expectedSemanticTransactionCount: number): void {
  const result = latestToolResult(manager, "aili_compact") as JsonRecord | undefined;
  expect(result?.message?.isError).toBe(false);
  expect(result?.message?.toolName).toBe("aili_compact");
  const body = textOf(result?.message?.content);
  expect(body).not.toBe("");
  const envelope = JSON.parse(body) as unknown;
  expect(isJsonRecord(envelope)).toBe(true);
  if (!isJsonRecord(envelope)) throw new Error("aili_compact rejection result is not a JSON envelope");
  expect(hasExactKeys(envelope, ["attestation", "result"])).toBe(true);
  expect(isJsonRecord(envelope.attestation)).toBe(true);
  expect(isJsonRecord(envelope.result)).toBe(true);
  if (!isJsonRecord(envelope.attestation) || !isJsonRecord(envelope.result)) {
    throw new Error("aili_compact rejection envelope is malformed");
  }
  const attestation = envelope.attestation as JsonRecord;
  const rejected = envelope.result as JsonRecord;
  expect(hasExactKeys(attestation, [
    "version", "owner", "toolName", "toolCallId", "sessionId", "branchLeafId", "epochId",
    "implementationId", "outcome", "resultDigest",
  ])).toBe(true);
  expect(attestation).toMatchObject({
    version: AILI_HANDLER_ATTESTATION_VERSION,
    owner: AILI_HANDLER_OWNER,
    toolName: "aili_compact",
    implementationId: AILI_HANDLER_IMPLEMENTATION_ID,
    outcome: "rejected",
  });
  expect(attestation.toolCallId).toBe(result?.message?.toolCallId);
  expect(attestation.sessionId).toBe(manager.getSessionId());
  expect([attestation.toolCallId, attestation.sessionId, attestation.branchLeafId, attestation.epochId]
    .every((value) => typeof value === "string" && value.length > 0)).toBe(true);
  expect(attestation.resultDigest).toBe(digest({ result: rejected, transaction: null }));
  expect(rejected.code).toBe(code);
  expect(Object.prototype.hasOwnProperty.call(envelope, "transaction")).toBe(false);
  expect(semanticTransactions(manager)).toHaveLength(expectedSemanticTransactionCount);
}

function writePassedArtifact(path: string, artifact: JsonRecord): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`);
  renameSync(temporary, path);
}

function unwrapAcceptedStatusEnvelope(envelope: JsonRecord): JsonRecord | undefined {
  if (!hasExactKeys(envelope, ["attestation", "result"])) return undefined;
  const { attestation, result } = envelope;
  if (!isJsonRecord(attestation) || !isJsonRecord(result)) return undefined;
  if (!hasExactKeys(attestation, [
    "version", "owner", "toolName", "toolCallId", "sessionId", "branchLeafId", "epochId",
    "implementationId", "outcome", "resultDigest",
  ])) return undefined;
  if (attestation.version !== AILI_HANDLER_ATTESTATION_VERSION
    || attestation.owner !== AILI_HANDLER_OWNER
    || attestation.toolName !== "aili_compact_status"
    || attestation.implementationId !== AILI_HANDLER_IMPLEMENTATION_ID
    || attestation.outcome !== "success") return undefined;
  if (![attestation.toolCallId, attestation.sessionId, attestation.branchLeafId, attestation.epochId]
    .every((value) => typeof value === "string" && value.length > 0)) return undefined;
  if (typeof attestation.resultDigest !== "string" || !/^[0-9a-f]{64}$/.test(attestation.resultDigest)) return undefined;
  if (attestation.resultDigest !== digest({ result, transaction: null })) return undefined;
  return result;
}

function hasExactKeys(record: JsonRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(record).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected.slice().sort()[index]);
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function t1RejectionDiagnostic(manager: SessionManager, provider: LineageProvider): string {
  const compactCalled = provider.toolArguments.at(-1)?.name === "aili_compact";
  if (!compactCalled) {
    const sequence = provider.toolArguments.map(({ name }) => name);
    const statusEnvelope = provider.statusEnvelopes.at(-1);
    const keys = statusEnvelope ? Object.keys(statusEnvelope).sort() : [];
    const groups = statusEnvelope?.result?.references?.lifecycle?.activeBlockGroups ?? [];
    const diagnostics = statusEnvelope?.result?.references?.lifecycle?.promotionDiagnostics ?? [];
    return `provider tool sequence=${JSON.stringify(sequence)}; status envelope keys=${JSON.stringify(keys)}; active block groups=${JSON.stringify(groups)}; promotion diagnostics=${JSON.stringify(diagnostics)}`;
  }
  const rejected = latestToolResult(manager, "aili_compact") as JsonRecord | undefined;
  return textOf(rejected?.message?.content).slice(0, 2_000);
}

function compactArguments(
  status: JsonRecord,
  plan: Extract<LineagePlan, { kind: "compact" }>,
  manager: SessionManager,
): JsonRecord | undefined {
  const catalogId = String(status.references?.catalogId ?? "");
  const selectedCatalog = plan.staleCatalog && catalogId.length === 64
    ? `${catalogId[0] === "0" ? "1" : "0"}${catalogId.slice(1)}`
    : catalogId;
  if (plan.tier === "T1") {
    const range = plan.sourceAnchor
      ? safeRangeContainingSourceAnchor(status, manager, plan.sourceAnchor)
      : status.references?.safeRanges?.[plan.safeRangeIndex ?? 0];
    if (range) {
      const summary = plan.deriveSummaryFromExactRange
        ? exactT1Summary(status, range, manager, plan.summary, plan.summaryQualitySemantics ?? "T1")
        : plan.summary;
      return {
        mode: "range", catalogId: selectedCatalog, topic: "controlled T1 lineage",
        ranges: [{ startRef: range.startRef, endRef: range.endRef, summary }],
        summaryMaxChars: SEMANTIC_SUMMARY_LIMITS.hardMaxChars,
      };
    }
    const message = status.references?.refs?.[0];
    if (!message?.ref) return undefined;
    return {
      mode: "range", catalogId: selectedCatalog, topic: "controlled rejection",
      ranges: [{ startRef: message.ref, endRef: message.ref, summary: plan.summary }],
      summaryMaxChars: SEMANTIC_SUMMARY_LIMITS.hardMaxChars,
    };
  }
  const group = (status.references?.lifecycle?.activeBlockGroups ?? [])
    .find((candidate: JsonRecord) => candidate.semantics === "active-block" && candidate.blockRefs?.length >= (plan.childCount ?? 2));
  if (!group) return undefined;
  return {
    mode: "blocks", catalogId: selectedCatalog, topic: "controlled active-block composition",
    blockRefs: group.blockRefs.slice(0, plan.childCount ?? 2),
    summary: exactBlockSummary(status, manager, group.blockRefs.slice(0, plan.childCount ?? 2), plan.summary),
    summaryMaxChars: SEMANTIC_SUMMARY_LIMITS.hardMaxChars,
  };
}

function safeRangeContainingSourceAnchor(
  status: JsonRecord,
  manager: SessionManager,
  sourceAnchor: string,
): JsonRecord {
  const ranges = status.references?.safeRanges;
  const entries = manager.getBranch() as SessionLikeEntry[];
  const catalog = buildReferenceCatalog(entries, reduceCompactState(entries));
  const entryIdByRef = new Map(catalog.messages.map((message) => [message.ref, message.entryId]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const range = Array.isArray(ranges) ? ranges.find((candidate): candidate is JsonRecord => {
    if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.orderedRefs)) return false;
    return candidate.orderedRefs.some((ref: unknown) => typeof ref === "string"
      && messageText(entryById.get(entryIdByRef.get(ref) ?? "")?.message).includes(sourceAnchor));
  }) : undefined;
  if (!range) throw new Error(`fixture-safe-range-source-anchor-missing:${sourceAnchor}`);
  return range;
}

function exactT1Summary(
  status: JsonRecord,
  range: JsonRecord,
  manager: SessionManager,
  fallbackSummary: string,
  qualitySemantics: "T1" | "active-block" = "T1",
): string {
  const entries = manager.getBranch() as SessionLikeEntry[];
  const catalogId = typeof status.references?.catalogId === "string" ? status.references.catalogId : undefined;
  if (!catalogId || range.catalogId !== catalogId) throw new Error("fixture-range-catalog-id-mismatch");
  const orderedRefs = Array.isArray(range.orderedRefs) && range.orderedRefs.every((ref: unknown) => typeof ref === "string")
    ? range.orderedRefs as string[] : [];
  if (orderedRefs.length === 0 || orderedRefs[0] !== range.startRef || orderedRefs.at(-1) !== range.endRef) {
    throw new Error("fixture-range-endpoint-mismatch");
  }
  if (typeof range.sourceDigest !== "string") throw new Error("fixture-source-digest-missing");
  const catalog = buildReferenceCatalog(entries, reduceCompactState(entries));
  const entryIdByRef = new Map(catalog.messages.map((message) => [message.ref, message.entryId]));
  const orderedEntryIds = orderedRefs.map((ref) => {
    const entryId = entryIdByRef.get(ref);
    if (!entryId) throw new Error("fixture-source-entry-missing");
    return entryId;
  });
  const frozen = freezeMessageQualitySource({
    entries,
    orderedEntryIds,
    orderedRefs,
    catalogId,
    sourceDigest: range.sourceDigest,
    branchLeafId: "fixture-branch",
    epochId: "root",
  });
  const anchors = [...new Set(frozen.facts.flatMap((fact) => fact.eligibility === "eligible"
    && qualityRequirement(qualitySemantics, fact.class, fact.current, fact.releaseRelevant) === "hard" ? fact.anchors : []))];
  const markers = [...fallbackSummary.matchAll(/`([^`]+)`/gu)].map((match) => match[1]!);
  return anchors.length === 0 ? fallbackSummary : compactSummarySurface([...markers, ...anchors], "界");
}

function exactBlockSummary(
  status: JsonRecord,
  manager: SessionManager,
  blockRefs: readonly string[],
  fallbackSummary: string,
): string {
  const entries = manager.getBranch() as SessionLikeEntry[];
  const view = buildV3RuntimeView(entries, reduceCompactState(entries), {
    sessionId: manager.getSessionId(),
    sessionPath: manager.getSessionFile() ?? undefined,
  });
  if (status.references?.catalogId !== view.catalog.catalogId) throw new Error("fixture-block-catalog-id-mismatch");
  const refToBlockId = new Map(view.mutationCatalog.blockRefs.map((reference) => [reference.ref, reference.blockId]));
  const sourceSummaries = blockRefs.map((ref) => {
    const blockId = refToBlockId.get(ref);
    const block = blockId ? view.state.blocks.get(blockId) : undefined;
    if (!block) throw new Error("fixture-source-block-missing");
    return block.summary;
  });
  const markers = [...fallbackSummary.matchAll(/`([^`]+)`/gu)].map((match) => match[1]!);
  const anchors = [...new Set(sourceSummaries.flatMap((summary) => summary.match(/L\d{3}|SOURCE_ACCEPTED/gu) ?? []))];
  if (anchors.length === 0) return fallbackSummary;
  const fill = fallbackSummary.includes("\u0001") ? "\u0001" : "界";
  return compactSummarySurface([...markers, ...anchors], fill, fallbackSummary.length);
}


function latestToolJson(context: Context, toolName: string): JsonRecord {
  const message = [...context.messages].reverse().find((item) => item.role === "toolResult" && item.toolName === toolName);
  if (!message) throw new Error(`missing controlled ${toolName} result`);
  const body = textOf(message.content);
  const parsed = JSON.parse(body) as JsonRecord;
  if (!parsed || typeof parsed !== "object") throw new Error(`invalid controlled ${toolName} result`);
  return parsed;
}

function lineageAssistantStream(
  selected: Model<any>,
  content: AssistantMessage["content"],
  stopReason: "stop" | "toolUse",
  input = 2,
) {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant", content, api: selected.api, provider: selected.provider, model: selected.id,
    usage: usage(input, 2), stopReason, timestamp: Date.now(),
  };
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    stream.push({ type: "done", reason: stopReason, message });
    stream.end();
  });
  return stream;
}

function compactSummarySurface(anchors: readonly string[], fill: string, targetLength: number = LINEAGE_ANCHORED_SUMMARY_CHARS): string {
  const prefix = anchors.map((anchor) => `\`${anchor}\``).join(" ");
  return `${prefix} ${fill.repeat(Math.max(0, targetLength - prefix.length - 1))}`;
}

function semanticTransactions(manager: SessionManager): JsonRecord[] {
  return manager.getEntries().flatMap((entry) => entry.type === "custom" && entry.customType === AILI_COMPACT_ENTRY
    && (entry.data as JsonRecord | undefined)?.tag === "semantic-create" ? [entry.data as JsonRecord] : []);
}

function classifyLineage(transactions: readonly JsonRecord[]) {
  const byBlock = new Map(transactions.map((transaction) => [transaction.payload.blockId, transaction] as const));
  const rows = transactions.map((transaction, index) => {
    const childIds = transaction.payload.source?.kind === "blocks" ? transaction.payload.source.childBlockIds as string[] : [];
    const restill = transaction.payload.tier === "T3" && childIds.length > 0
      && childIds.every((id) => byBlock.get(id)?.payload?.tier === "T3");
    return {
      sequence: index + 1,
      tier: restill ? "T3-restill" : transaction.payload.tier,
      transactionId: transaction.header.txId,
      blockId: transaction.payload.blockId,
      sha256: sha256(JSON.stringify(transaction)),
      sourceKind: transaction.payload.source.kind,
      sourceCount: transaction.payload.source.kind === "messages"
        ? transaction.payload.source.entryIds.length : transaction.payload.source.childBlockIds.length,
      childBlockIds: transaction.payload.source.kind === "blocks" ? [...transaction.payload.source.childBlockIds] : [],
      summarySha256: sha256(transaction.payload.summary),
    };
  });
  const count = (tier: string) => rows.filter((row) => row.tier === tier).length;
  return { counts: { T1: count("T1"), T2: count("T2"), T3: count("T3"), T3Restill: count("T3-restill"), total: rows.length }, transactions: rows };
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function completeToolResultBeforeSuffix(messages: Context["messages"], toolName: string): boolean {
  const suffixIndex = messages.findIndex((message) => (message as JsonRecord).role === "custom"
    && (message as JsonRecord).customType === "aili-compact-provider-suffix");
  if (suffixIndex < 1) return false;
  const previous = messages[suffixIndex - 1];
  return previous?.role === "toolResult" && previous.toolName === toolName && previous.isError === false;
}

function latestToolResult(manager: SessionManager, toolName: string): JsonRecord | undefined {
  return [...manager.getEntries()].reverse().find((entry) => entry.type === "message"
    && entry.message.role === "toolResult" && entry.message.toolName === toolName) as unknown as JsonRecord | undefined;
}

function fileBinding(path: string) {
  return { path, sha256: sha256(readFileSync(resolve(root, path))) };
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function appendEligibleSemanticHistory(manager: SessionManager): { tailId: string } {
  const sourceIds: string[] = [];
  sourceIds.push(appendUser(manager, `old question one ${"x".repeat(180)}`, 1));
  sourceIds.push(appendAssistant(manager, `old answer one ${"y".repeat(180)}`, 2));
  sourceIds.push(appendUser(manager, `old question two ${"m".repeat(180)}`, 3));
  sourceIds.push(appendAssistant(manager, `old answer two ${"n".repeat(180)}`, 4));
  const sourceEntries = manager.getBranch() as unknown as SessionLikeEntry[];
  const view = buildV3RuntimeView(sourceEntries, reduceCompactState(sourceEntries), {
    sessionId: manager.getSessionId(),
    sessionPath: manager.getSessionFile() ?? undefined,
  });
  const transactionId = "eligible-semantic-transaction";
  const contextTx = {
    header: {
      schema: AILI_COMPACT_SCHEMA_V3,
      txId: transactionId,
      sessionId: view.state.sessionId,
      branchLeafId: view.state.branchLeafId,
      epochId: view.state.epochId,
      catalogId: view.catalog.catalogId,
      createdAt: 5,
      projectionVersion: view.state.projectionVersion,
    },
    tag: "semantic-create" as const,
    payload: {
      blockId: "semantic:eligible-history",
      tier: "T1" as const,
      topic: "Eligible history",
      runId: transactionId,
      anchorEntryId: sourceIds[0]!,
      createdTurnOrdinal: 1,
      summary: "Eligible historical work is complete.",
      summaryDigest: v3SummaryDigest("Eligible historical work is complete."),
      source: { kind: "messages" as const, entryIds: sourceIds, firstEntryId: sourceIds[0]!, lastEntryId: sourceIds.at(-1)! },
      leafDigest: v3MessageLeafDigest(sourceIds),
      leafCount: sourceIds.length,
      tokens: {
        estimatorVersion: TOKEN_ESTIMATOR_VERSION,
        providerId: providerName,
        modelId,
        sourceTokensLower: 1_000,
        sourceTokensUpper: 1_000,
        replacementTokensUpper: 100,
        steadySavingsTokensLower: 900,
        oneTimeCostTokensUpper: 100,
        breakEvenTurnsUpper: 1,
        savingsRatio: 0.9,
        summaryTokensUpper: 100,
      },
      quality: {
        status: "accepted" as const,
        evaluatorVersion: QUALITY_EVALUATOR_VERSION,
        sourceFactDigest: sourceDigest(sourceEntries, sourceIds),
        hardFactCount: 1,
        coveredHardFactCount: 1,
        warningCodes: [],
      },
    },
  };
  manager.appendCustomEntry(AILI_COMPACT_ENTRY, contextTx);
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
