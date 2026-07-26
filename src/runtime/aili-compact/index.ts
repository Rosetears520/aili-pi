import { Type } from "@earendil-works/pi-ai";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { validateLicenseDisposition } from "../registry.js";
import {
  AILI_COMPACT_ENTRY,
  AILI_COMPACT_SCHEMA,
  type CompactBlock,
  type CompactState,
  type CompactTransaction,
  digest,
  extractText,
  isRecord,
  sourceDigest,
  type SessionLikeEntry,
} from "./contracts.js";
import {
  planAdaptiveNudge,
  planJournaledStrategies,
  selectGroupedCandidates,
  INITIAL_NUDGE_STATE,
  type AdaptiveNudgeState,
} from "./automatic.js";
import {
  cacheIdentity,
  classifyCacheRequest,
  emptyCacheTelemetry,
  emptySessionCacheStats,
  recordCacheTelemetry,
  recordSessionCacheUsage,
  replaySessionCacheUsages,
  type CacheRequestClassification,
  type CacheTelemetry,
  type CacheUsage,
  type SessionCacheStats,
} from "./cache.js";
import { decideNativeCompaction, planEmergencyGc, planGenerationalGc, reconstructCompletedCompactionEpoch } from "./compaction.js";
import {
  appendCompactPromptGuidance,
  loadCompactConfig,
  loadCompactConfigResult,
  loadCompactPromptSnapshot,
  type CompactConfig,
  type CompactPromptSnapshot,
} from "./config.js";
import { planCompactCommand, COMPACT_COMMAND_USAGE, type CompactCommandInputs } from "./commands.js";
import { planCompactMutation, planDecompression, planPruneMutation, planRecompression, type MutationGuardInput } from "./mutations.js";
import { classifyProtection } from "./protection.js";
import { presentCache } from "./presentation.js";
import { alignEntriesToMessages, projectMessages, type ProjectionMessage } from "./projector.js";
import { buildReferenceCatalog, pageReferenceCatalog } from "./references.js";
import { gateSubagentEntry } from "./subagent-gating.js";
import { activeBlocks, reduceCompactState } from "./reducer.js";

const COMPACT_TOOL_NAMES = new Set([
  "aili_compact",
  "aili_decompress",
  "aili_prune",
  "aili_search_context",
  "aili_compact_status",
  "aili_context_recap",
]);
const PROTECTED_COOLING_TOOL_NAMES = new Set(["bash", "edit", "write"]);
const PROTECTED_FILE_NAMES = new Set(["credentials.json", "secrets.json", "package.json", "tsconfig.json", "pyproject.toml", "cargo.toml"]);
const MIN_COOLING_CHARS = 8_192;
const MAX_SEARCH_RESULTS = 8;
const MAX_SEARCH_CHARS = 12_000;

type SessionRuntime = {
  completedCacheIdentity?: string;
  systemPromptFingerprint?: string;
  pendingCache?: { identity: string; classification: CacheRequestClassification };
  telemetry: CacheTelemetry;
  sessionCache: SessionCacheStats;
  config: CompactConfig;
  configDiagnostics: readonly string[];
  prompt: CompactPromptSnapshot;
  lastAutoTurnId?: string;
  lastProviderGcLeafId?: string;
  lastWidgetRenderKey?: string;
  projectionHealthy?: boolean;
  nudgeState: AdaptiveNudgeState;
};

export interface AiliCompactDiagnostics {
  enabled: boolean;
  autoCooling: boolean;
  manualMode: boolean;
  epochId: string;
  activeBlocks: number;
  coolingCandidate?: { idHash: string; sourceCount: number };
  diagnostics: readonly string[];
  configDiagnostics: readonly string[];
  customPrompts: { enabled: boolean; fileCount: number; fingerprint?: string; diagnostics: readonly string[] };
  cache: CacheTelemetry;
  sessionCache: SessionCacheStats;
}

export function registerAiliCompact(pi: ExtensionAPI): void {
  const sessions = new Map<string, SessionRuntime>();
  const runtimeFor = (ctx: ExtensionContext): SessionRuntime => {
    const id = ctx.sessionManager.getSessionId();
    const existing = sessions.get(id);
    if (existing) return existing;
    const loaded = loadCompactConfigResult(ctx.cwd);
    const current: SessionRuntime = {
      telemetry: emptyCacheTelemetry(),
      sessionCache: emptySessionCacheStats(),
      config: loaded.config,
      configDiagnostics: loaded.diagnostics,
      prompt: loadCompactPromptSnapshot(ctx.cwd, loaded.config),
      nudgeState: { ...INITIAL_NUDGE_STATE },
    };
    sessions.set(id, current);
    return current;
  };
  const initializedRuntimeFor = (ctx: ExtensionContext): SessionRuntime | undefined => sessions.get(ctx.sessionManager.getSessionId());

  pi.registerTool({
    name: "aili_compact",
    label: "AILI Compact",
    description: "Create reversible range/message summaries using references from aili_compact_status.",
    promptSnippet: "Inspect status, then compress historical context by catalogId and message references.",
    promptGuidelines: ["Call alone. Never guess references. Range boundaries must contain complete protocol atoms."],
    executionMode: "sequential",
    parameters: Type.Union([
      Type.Object({
        mode: Type.Literal("range"), catalogId: Type.String({ minLength: 64, maxLength: 64 }), topic: Type.String({ minLength: 1, maxLength: 200 }),
        ranges: Type.Array(Type.Object({ startRef: Type.String({ pattern: "^m\\d{6}$" }), endRef: Type.String({ pattern: "^m\\d{6}$" }), summary: Type.String({ minLength: 1, maxLength: 10_000 }) }), { minItems: 1, maxItems: 16 }),
        summaryMaxChars: Type.Optional(Type.Integer({ minimum: 256, maximum: 10_000 })),
      }),
      Type.Object({
        mode: Type.Literal("message"), catalogId: Type.String({ minLength: 64, maxLength: 64 }), topic: Type.String({ minLength: 1, maxLength: 200 }),
        items: Type.Array(Type.Object({ messageRef: Type.String({ pattern: "^m\\d{6}$" }), topic: Type.String({ minLength: 1, maxLength: 200 }), summary: Type.String({ minLength: 1, maxLength: 10_000 }) }), { minItems: 1, maxItems: 16 }),
        summaryMaxChars: Type.Optional(Type.Integer({ minimum: 256, maximum: 10_000 })),
      }),
    ]),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = runtimeFor(ctx); const entries = branch(ctx); const state = stateFor(ctx, runtime.config);
      if (state.pendingManualTrigger && !manualTriggerAllowsCall(entries, state.pendingManualTrigger, toolCallId)) {
        clearManualTrigger(pi, state);
        return error("The one-shot manual trigger belongs to a different or already-finished turn.");
      }
      if (state.manualMode && !state.pendingManualTrigger) return error("Manual mode requires a fresh /aili-compact compress trigger.");
      const planned = planCompactMutation({ ...params, transactionId: toolCallId }, {
        entries, state, guard: mutationGuard(entries, toolCallId, "aili_compact"),
        normalSummaryMaxChars: runtime.config.compress.summaryMaxChars, hardSummaryMaxChars: runtime.config.compress.summaryHardMaxChars,
        minSourceChars: runtime.config.compress.minSourceChars, minSavingsChars: runtime.config.compress.minSavingsChars,
        protect: ({ sourceEntryIds }) => protectionForIds(entries, sourceEntryIds, ctx.cwd, runtime.config),
        childSummaryIncludes: ({ child, summary }) => summary.includes(child.summary),
      });
      if (!planned.ok) { clearManualTrigger(pi, state); return error(renderMutationFailure(planned)); }
      if (state.pendingManualTrigger) planned.value.transaction.consumeManualTriggerId = state.pendingManualTrigger.id;
      return success(`AILI Compact created ${planned.value.transaction.blocks?.length ?? 0} reversible block(s).`, planned.value.transaction);
    },
  });

  pi.registerTool({
    name: "aili_decompress", label: "AILI Decompress",
    description: "Restore 1..16 active current-epoch block references and preview bounded exact source.",
    promptSnippet: "Restore current block references from aili_compact_status.",
    promptGuidelines: ["Call alone; archived and GC blocks are query-only."], executionMode: "sequential",
    parameters: Type.Object({ catalogId: Type.String({ minLength: 64, maxLength: 64 }), blockRefs: Type.Array(Type.String({ pattern: "^b\\d{6}$" }), { minItems: 1, maxItems: 16 }) }),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = runtimeFor(ctx); const entries = branch(ctx); const state = stateFor(ctx, runtime.config);
      const planned = planDecompression({ transactionId: toolCallId, ...params }, { entries, state, guard: mutationGuard(entries, toolCallId, "aili_decompress") });
      if (!planned.ok) return error(renderMutationFailure(planned));
      return success(JSON.stringify({ restored: params.blockRefs, preview: planned.value.preview }), planned.value.transaction);
    },
  });

  pi.registerTool({
    name: "aili_prune", label: "AILI Prune",
    description: "Prune complete consumed tool-result atoms selected by tool or message reference.",
    promptSnippet: "Prune consumed tool-result atoms only; semantic messages require a summary.",
    promptGuidelines: ["Call alone and use the current catalogId."], executionMode: "sequential",
    parameters: Type.Object({
      catalogId: Type.String({ minLength: 64, maxLength: 64 }),
      tools: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 64 })),
      messageRefs: Type.Optional(Type.Array(Type.String({ pattern: "^m\\d{6}$" }), { maxItems: 64 })),
      keepLatest: Type.Optional(Type.Integer({ minimum: 0, maximum: 16 })),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = runtimeFor(ctx); const entries = branch(ctx); const state = stateFor(ctx, runtime.config);
      const planned = planPruneMutation({ transactionId: toolCallId, ...params }, {
        entries, state, guard: mutationGuard(entries, toolCallId, "aili_prune"),
        hardProtect: ({ atomEntryIds }) => protectionForIds(entries, atomEntryIds, ctx.cwd, runtime.config),
      });
      if (!planned.ok) return error(renderMutationFailure(planned));
      return success(`AILI Compact pruned ${planned.value.selectedAtomCount} consumed atom(s).`, planned.value.transaction);
    },
  });

  pi.registerTool({
    name: "aili_search_context",
    label: "AILI Search Context",
    description: "Search bounded exact excerpts from the current Pi session branch without changing compact state.",
    promptSnippet: "Search original current-branch context before decompressing.",
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 1_000 }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_SEARCH_RESULTS })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const entries = branch(ctx);
      const runtime = runtimeFor(ctx);
      const catalog = buildReferenceCatalog(entries, stateFor(ctx, runtime.config));
      const referencesByEntryId = new Map(catalog.messages.map((message) => [message.entryId, message.ref]));
      const matches = searchCurrentBranch(entries, params.query, params.limit ?? MAX_SEARCH_RESULTS)
        .map((match) => {
          const messageRef = referencesByEntryId.get(match.entryId);
          return { ...(messageRef ? { messageRef } : { archived: true, sourceIdHash: digest(match.entryId).slice(0, 16) }), excerpt: match.excerpt };
        });
      return text(JSON.stringify({ scope: "current_branch", catalogId: catalog.catalogId, matches }, null, 2));
    },
  });

  pi.registerTool({
    name: "aili_compact_status",
    label: "AILI Compact Status",
    description: "Read bounded AILI Compact block, projection, cacheability and diagnostic status.",
    promptSnippet: "Inspect AILI Compact candidates and state before mutating context.",
    parameters: Type.Object({
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 64 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = runtimeFor(ctx);
      const state = stateFor(ctx, runtime.config); const entries = branch(ctx);
      const inputs = commandInputs(entries, state, runtime, ctx.cwd);
      const planned = planCompactCommand(`context ${params.offset ?? 0} ${params.limit ?? 32}`, inputs);
      const references = planned.kind === "context" ? planned.output : pageReferenceCatalog(inputs.catalog, params.offset ?? 0, params.limit ?? 32);
      return text(JSON.stringify({ ...diagnosticsFor(ctx, runtime), references }, null, 2));
    },
  });

  pi.registerTool({
    name: "aili_context_recap",
    label: "AILI Context Recap",
    description: "Read active AILI Compact summaries without restoring raw source context.",
    parameters: Type.Object({ blockRef: Type.Optional(Type.String({ pattern: "^b\\d{6}$" })) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = runtimeFor(ctx);
      const state = stateFor(ctx, runtime.config);
      const catalog = buildReferenceCatalog(branch(ctx), state);
      if (!params.blockRef) {
        const blocks = catalog.blocks.filter((item) => item.active).slice(0, 32).flatMap((item) => {
          const block = state.blocks.get(item.blockId);
          return block ? [{
            blockRef: item.ref,
            topic: block.topic ?? "(none)",
            mode: block.mode ?? "legacy",
            sourceCount: block.sourceEntryIds.length,
            summaryPreview: `${block.summary.slice(0, 200)}${block.summary.length > 200 ? "…" : ""}`,
          }] : [];
        });
        return text(JSON.stringify({ catalogId: catalog.catalogId, activeBlocks: blocks }, null, 2));
      }
      const reference = catalog.blocks.find((item) => item.ref === params.blockRef);
      const block = reference ? state.blocks.get(reference.blockId) : undefined;
      if (!reference || !block) return error(`Unknown or archived AILI Compact block reference: ${params.blockRef}`);
      if (!reference.active || block.queryOnly) return error(`AILI Compact block ${params.blockRef} is inactive or query-only.`);
      return text(JSON.stringify({
        blockRef: reference.ref,
        topic: block.topic ?? "(none)",
        mode: block.mode ?? "legacy",
        sourceCount: block.sourceEntryIds.length,
        summary: block.summary,
      }, null, 2));
    },
  });

  pi.registerCommand("aili-compact", {
    description: "AILI Compact: context, stats, sweep, manual, compress, decompress, recompress, cache, prompt, on, off, restore-all, doctor",
    handler: async (args, ctx) => {
      const runtime = runtimeFor(ctx); const entries = branch(ctx); const state = stateFor(ctx, runtime.config);
      const inputs = commandInputs(entries, state, runtime, ctx.cwd);
      const plan = planCompactCommand(args, inputs);
      const leaf = ctx.sessionManager.getLeafId() ?? "root";
      if (plan.kind === "usage") { ctx.ui.notify(COMPACT_COMMAND_USAGE, "warning"); return; }
      if (plan.kind === "context" || plan.kind === "stats") { ctx.ui.notify(JSON.stringify(plan.output, null, 2), "info"); return; }
      if (plan.kind === "manual-status") { ctx.ui.notify(`AILI Compact manual=${plan.manualMode ? "on" : "off"}; autoCooling=${plan.autoCooling ? "on" : "off"}.`, "info"); return; }
      if (plan.kind === "cache-status") { const view = cachePresentation(state, runtime); ctx.ui.notify([view.overlay.title, ...view.overlay.lines].join("\n"), "info"); return; }
      if (plan.kind === "prompt-status") { ctx.ui.notify(renderPromptStatus(runtime.prompt), "info"); return; }
      if (plan.kind === "prompt-reload") {
        const loaded = loadCompactConfigResult(ctx.cwd); runtime.config = loaded.config; runtime.configDiagnostics = loaded.diagnostics;
        runtime.prompt = loadCompactPromptSnapshot(ctx.cwd, runtime.config); runtime.completedCacheIdentity = undefined;
        ctx.ui.notify(renderPromptStatus(runtime.prompt), "info"); return;
      }
      if (plan.kind === "doctor") {
        const report = compactRuntimeDoctor(state, runtime, await validateLicenseDisposition());
        ctx.ui.notify(JSON.stringify(report, null, 2), report.status === "PASS" ? "info" : "warning");
        return;
      }
      if (plan.kind === "control") {
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`control:${leaf}:${plan.value}`, "control", state.epochId, { control: plan.value }));
      } else if (plan.kind === "manual-control") {
        const control = plan.value === "on" ? "manual-on" : "manual-off";
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`control:${leaf}:${control}`, "control", state.epochId, { control }));
      } else if (plan.kind === "cache-panel") {
        const control = plan.value === "on" ? "panel-on" : "panel-off";
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`control:${leaf}:${control}`, "control", state.epochId, { control }));
      } else if (plan.kind === "sweep") {
        const blocks = findCoolingCandidates(entries, state, plan.limit, runtime.config, ctx.cwd);
        if (blocks.length === 0) { ctx.ui.notify("AILI Compact sweep found no safe grouped candidates.", "info"); return; }
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`sweep:${leaf}:${digest(blocks.map((block) => block.id)).slice(0, 16)}`, "cool", state.epochId, { blocks }));
      } else if (plan.kind === "compress") {
        if (!ctx.isIdle() || ctx.hasPendingMessages()) { ctx.ui.notify("AILI Compact one-shot request is busy; nothing was appended or requested.", "warning"); return; }
        const id = `manual:${leaf}:${digest(plan.focus ?? "").slice(0, 16)}`;
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(id, "control", state.epochId, { control: "manual-trigger", manualTrigger: { id, turnId: leaf, ...(plan.focus ? { focusHash: digest(plan.focus) } : {}) } }));
        try {
          pi.sendUserMessage(`AILI Compact one-shot request${plan.focus ? ` (focus: ${plan.focus})` : ""}: inspect aili_compact_status, then make at most one aili_compact attempt in this turn.`);
        } catch {
          pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`clear:${id}`, "control", state.epochId, { control: "manual-clear", consumeManualTriggerId: id }));
          ctx.ui.notify("AILI Compact could not start the one-shot turn; the trigger was cleared.", "warning");
        }
        return;
      } else if (plan.kind === "decompress") {
        const planned = planDecompression({ transactionId: `decompress:${leaf}`, catalogId: plan.catalogId, blockRefs: plan.blockRefs }, { entries, state });
        if (!planned.ok) { ctx.ui.notify(`${planned.code}: ${planned.message}`, "warning"); return; }
        pi.appendEntry(AILI_COMPACT_ENTRY, { ...planned.value.transaction, kind: "control", control: "decompress" });
      } else if (plan.kind === "recompress") {
        const planned = planRecompression({ transactionId: `recompress:${leaf}`, catalogId: plan.catalogId, blockRefs: plan.blockRefs }, { entries, state });
        if (!planned.ok) { ctx.ui.notify(`${planned.code}: ${planned.message}`, "warning"); return; }
        pi.appendEntry(AILI_COMPACT_ENTRY, planned.value.control);
      }
      publishStatus(ctx, stateFor(ctx, runtime.config), runtime);
      const notice = plan.kind === "control" && plan.value === "off"
        ? "AILI Compact off applied append-only. Pi auto-compaction remains disabled until you explicitly change ~/.pi/agent/settings.json."
        : `AILI Compact ${plan.kind} applied append-only.`;
      ctx.ui.notify(notice, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    const runtime = runtimeFor(ctx);
    const entries = branch(ctx);
    runtime.sessionCache = replaySessionCache(entries);
    publishStatus(ctx, applyCompactConfig(reduceCompactState(entries), runtime.config), runtime);
  });

  // Tree navigation is infrequent and changes the selected branch, so replay
  // once here rather than rescanning on every provider request or widget draw.
  pi.on("session_tree", (_event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    const entries = branch(ctx);
    runtime.sessionCache = replaySessionCache(entries);
    publishStatus(ctx, applyCompactConfig(reduceCompactState(entries), runtime.config), runtime);
  });

  pi.on("before_agent_start", (event, ctx) => {
    // Do not introduce provider-time file I/O: a session_start snapshot is required.
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    let state = stateFor(ctx, runtime.config);
    const leaf = ctx.sessionManager.getLeafId() ?? "root";
    const usage = ctx.getContextUsage();
    if (state.enabled && runtime.lastProviderGcLeafId !== leaf) {
      const gc = planEmergencyGc({
        epochId: state.epochId,
        blocks: [...state.blocks.values()],
        contextTokens: usage?.tokens ?? undefined,
        contextWindow: usage?.contextWindow,
        thresholdPercent: runtime.config.gc.majorThresholdPercent,
        maxOldSummaryChars: runtime.config.gc.maxOldSummaryChars,
        transactionId: `gc:emergency:${leaf}`,
      });
      if (gc) {
        // Provider-free emergency GC is durable AILI state. It never asks Pi
        // for a CompactionEntry and never invokes a hidden model request.
        pi.appendEntry(AILI_COMPACT_ENTRY, gc);
        state = stateFor(ctx, runtime.config);
      }
      runtime.lastProviderGcLeafId = leaf;
    }
    let systemPrompt = event.systemPrompt;
    let changed = false;
    const custom = state.enabled ? appendCompactPromptGuidance(systemPrompt, runtime.prompt) : undefined;
    if (custom) { systemPrompt = custom; changed = true; }
    if (state.enabled) {
      const entries = branch(ctx);
      const contextPercent = usage?.tokens != null && usage.contextWindow > 0 ? (usage.tokens / usage.contextWindow) * 100 : 0;
      const contextChars = entries.reduce((sum, entry) => sum + (isRecord(entry.message) ? extractText(entry.message.content).length : 0), 0);
      const turn = entries.filter((entry) => isRecord(entry.message) && entry.message.role === "assistant").length;
      const iteration = entries.reduce((sum, entry) => sum + (isRecord(entry.message) ? toolCalls(entry.message).length : 0), 0);
      const nudge = planAdaptiveNudge(runtime.nudgeState, { enabled: true, contextPercent, contextChars, turn, iteration }, runtime.config.nudges);
      runtime.nudgeState = nudge.state;
      if (nudge.guidance) {
        const slot = nudge.guidanceKind === "turn" ? "turn-nudge.md" : nudge.guidanceKind === "iteration" ? "iteration-nudge.md" : "context-limit-nudge.md";
        const userGuidance = runtime.prompt.enabled ? runtime.prompt.slots[slot] : undefined;
        systemPrompt = `${systemPrompt}\n\n## AILI Compact adaptive guidance\n${nudge.guidance}${userGuidance ? `\n\nUser preference for this nudge only:\n${userGuidance}` : ""}`;
        changed = true;
      }
    }
    runtime.systemPromptFingerprint = digest({ systemPrompt, nudgePhase: runtime.nudgeState.phase, nudgeSerial: runtime.nudgeState.transitionSerial });
    return changed ? { systemPrompt } : undefined;
  });

  pi.on("context", (event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return { messages: event.messages };
    const state = stateFor(ctx, runtime.config);
    const entries = branch(ctx);
    const inputMessages = event.messages as unknown as ProjectionMessage[];
    const alignment = alignEntriesToMessages(entries, inputMessages);
    if (alignment.diagnostic) {
      runtime.projectionHealthy = false;
      ctx.ui.setStatus("aili-compact", `AILI Compact WARN: ${alignment.diagnostic}`);
      return { messages: event.messages };
    }
    const result = projectMessages(inputMessages, state, alignment.byEntryId);
    const toolApi = pi as ExtensionAPI & { getActiveTools?: () => string[]; getAllTools?: () => Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: readonly string[] }> };
    const allTools = (typeof toolApi.getAllTools === "function" ? toolApi.getAllTools() : []) as Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: readonly string[] }>;
    const activeNames = new Set(typeof toolApi.getActiveTools === "function" ? toolApi.getActiveTools() : allTools.map((tool) => tool.name));
    const model = ctx.model as unknown as Record<string, unknown> | undefined;
    const identity = cacheIdentity({
      providerId: typeof model?.provider === "string" ? model.provider : "unavailable",
      modelId: typeof model?.id === "string" ? model.id : "unavailable",
      sessionId: ctx.sessionManager.getSessionId(), branchLeafId: ctx.sessionManager.getLeafId() ?? "root",
      branchSourceDigest: digest(entries.map((entry) => ({ id: entry.id, type: entry.type, contentDigest: digest(entry.message ?? entry.data ?? null) }))), epochId: state.epochId,
      projectionHash: result.hash, guidanceFingerprint: runtime.systemPromptFingerprint ?? "unavailable",
      activeTools: allTools.filter((tool) => activeNames.has(tool.name)).map((tool) => ({
        name: tool.name, description: tool.description, parameterSchema: tool.parameters,
        immutablePrompt: { snippet: tool.promptSnippet ?? "", guidelines: tool.promptGuidelines ?? [] },
      })),
    });
    runtime.pendingCache = { identity, classification: classifyCacheRequest(runtime.completedCacheIdentity, identity) };
    runtime.projectionHealthy = result.diagnostic === undefined;
    publishStatus(ctx, state, runtime, result.diagnostic);
    return { messages: result.messages as unknown as typeof event.messages };
  });

  pi.on("message_end", (event, ctx) => {
    if (!isRecord(event.message) || event.message.role !== "assistant") return;
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    const usage = cacheUsage(event.message.usage);
    const pending = runtime.pendingCache;
    runtime.sessionCache = recordSessionCacheUsage(runtime.sessionCache, usage);
    runtime.telemetry = recordCacheTelemetry(runtime.telemetry, usage, pending?.classification === "warm-candidate", pending?.classification === "warm-candidate" ? undefined : pending?.classification ?? "missing-telemetry");
    if (pending) runtime.completedCacheIdentity = pending.identity;
    runtime.pendingCache = undefined;
    publishStatus(ctx, stateFor(ctx, runtime.config), runtime);
  });

  pi.on("turn_end", (_event, ctx) => {
    const runtime = initializedRuntimeFor(ctx); if (!runtime) return;
    let state = stateFor(ctx, runtime.config); const entries = branch(ctx); const turnId = lastAssistantEntryId(entries);
    if (state.pendingManualTrigger) {
      pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`clear:${state.pendingManualTrigger.id}`, "control", state.epochId, { control: "manual-clear", consumeManualTriggerId: state.pendingManualTrigger.id }));
      state = stateFor(ctx, runtime.config);
    }
    if (!state.enabled || !turnId || runtime.lastAutoTurnId === turnId) return;
    if (state.autoCooling) {
      const strategy = findStrategyCoolingPlan(entries, state, runtime.config, ctx.cwd);
      if (strategy) {
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`auto:${turnId}:${strategy.policy.strategy}`, "cool", state.epochId, strategy));
        runtime.lastAutoTurnId = turnId; return;
      }
      const candidates = findCoolingCandidates(entries, state, 16, runtime.config, ctx.cwd);
      const gain = candidates.reduce((sum, block) => sum + Math.max(0, block.sourceEntryIds.reduce((chars, id) => {
        const entry = entries.find((candidate) => candidate.id === id); return chars + (entry && isRecord(entry.message) ? extractText(entry.message.content).length : 0);
      }, 0) - block.stub!.length), 0);
      if (candidates.length > 0 && gain >= runtime.config.compress.minSavingsChars) {
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`auto:${turnId}`, "cool", state.epochId, { blocks: candidates }));
        runtime.lastAutoTurnId = turnId; return;
      }
    }
    const gc = planGenerationalGc({
      epochId: state.epochId,
      blocks: [...state.blocks.values()],
      promotionSurvivals: runtime.config.gc.promotionSurvivals,
      maxBlockAge: runtime.config.gc.maxBlockAge,
      maxOldSummaryChars: runtime.config.gc.maxOldSummaryChars,
      transactionId: `gc:${turnId}`,
    });
    if (gc) pi.appendEntry(AILI_COMPACT_ENTRY, gc.transaction);
    runtime.lastAutoTurnId = turnId;
  });

  pi.on("session_before_compact", (event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    const state = stateFor(ctx, runtime.config);
    if (!state.enabled) return;
    const decision = decideNativeCompaction({ reason: event.reason });
    if (event.reason === "manual") {
      ctx.ui.notify("AILI Compact owns compaction. Use /aili-compact context, compress [focus], or sweep 16.", "info");
    }
    // Do not return a Pi compaction envelope here. Threshold and overflow are
    // cancellation-only; provider-free GC runs before provider projection.
    return decision.cancel ? { cancel: true } : undefined;
  });

  pi.on("session_compact", (event, ctx) => {
    const source = event.fromExtension ? "AILI major-GC" : "native emergency";
    const entries = branch(ctx);
    const persistedIndex = entries.findIndex((entry) => entry.id === event.compactionEntry.id);
    const epoch = reconstructCompletedCompactionEpoch({
      cancelled: false,
      compactionEntry: event.compactionEntry as unknown as SessionLikeEntry,
      keptTailEntries: persistedIndex >= 0 ? entries.slice(persistedIndex + 1) : [],
    });
    ctx.ui.setStatus("aili-compact", epoch
      ? `AILI Compact: ${source} epoch ${epoch.epochId}`
      : `AILI Compact WARN: completed ${source} epoch could not be reconstructed`);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    sessions.delete(ctx.sessionManager.getSessionId());
  });
}

function compactRuntimeDoctor(state: CompactState, runtime: SessionRuntime, licenseErrors: readonly string[] = []) {
  const reducer = state.diagnostics.length === 0 ? "PASS" : "ERROR";
  const projection = runtime.projectionHealthy === true ? "PASS" : runtime.projectionHealthy === false ? "ERROR" : "UNVERIFIED";
  const config = runtime.configDiagnostics.length === 0 ? "PASS" : "WARN";
  const prompt = runtime.prompt.diagnostics.length === 0 ? "PASS" : "WARN";
  const cache = runtime.telemetry.window.length >= 5 ? "PASS" : "UNVERIFIED";
  const publicRelease = licenseErrors.length === 0 ? "PASS" : "NON_PASS";
  const status = reducer === "ERROR" || projection === "ERROR" ? "ERROR"
    : config === "WARN" || prompt === "WARN" || projection === "UNVERIFIED" || cache === "UNVERIFIED" || publicRelease === "NON_PASS" ? "NON_PASS" : "PASS";
  return {
    schemaVersion: 1,
    status,
    components: {
      reducer: { status: reducer, diagnosticCount: state.diagnostics.length, diagnosticHash: digest(state.diagnostics).slice(0, 16) },
      reference: { status: "PASS", epochHash: digest(state.epochId).slice(0, 16), activeBlocks: activeBlocks(state).length },
      projection: { status: projection },
      recap: { status: state.diagnostics.some((item) => item.includes("recap")) ? "ERROR" : "PASS" },
      config: { status: config, diagnosticCount: runtime.configDiagnostics.length, diagnosticHash: digest(runtime.configDiagnostics).slice(0, 16) },
      prompt: { status: prompt, fileCount: runtime.prompt.fileCount, fingerprint: runtime.prompt.fingerprint?.slice(0, 16) },
      cache: { status: cache, eligibleWindow: runtime.telemetry.window.length, unavailable: runtime.telemetry.unavailable },
      nativeHook: { status: projection === "PASS" ? "PASS" : projection },
      liveProvider: { status: "UNVERIFIED", code: "UV-LIVE-1" },
      hostOrdering: { status: "UNVERIFIED", codes: ["UV-EXT-ORDER-1", "UV-PI-INTERNAL-1"] },
      publicRelease: licenseErrors.length === 0
        ? { status: publicRelease, code: "AGPL-3.0-OR-LATER" }
        : { status: publicRelease, code: "LICENSE-EVIDENCE-DRIFT", diagnosticCount: licenseErrors.length, diagnosticHash: digest(licenseErrors).slice(0, 16) },
    },
  };
}

export function diagnosticsFor(ctx: ExtensionContext, runtime?: SessionRuntime): AiliCompactDiagnostics {
  const loaded = runtime ? undefined : loadCompactConfigResult(ctx.cwd);
  const config = runtime?.config ?? loaded!.config;
  const current = runtime ?? {
    telemetry: emptyCacheTelemetry(),
    sessionCache: replaySessionCache(branch(ctx)),
    config,
    configDiagnostics: loaded!.diagnostics,
    prompt: loadCompactPromptSnapshot(ctx.cwd, config),
  };
  const state = stateFor(ctx, current.config);
  const candidate = state.enabled ? findCoolingCandidate(branch(ctx), state) : undefined;
  return {
    enabled: state.enabled,
    autoCooling: state.autoCooling,
    manualMode: state.manualMode,
    epochId: state.epochId,
    activeBlocks: activeBlocks(state).length,
    ...(candidate ? { coolingCandidate: { idHash: digest(candidate.id).slice(0, 16), sourceCount: candidate.sourceEntryIds.length } } : {}),
    diagnostics: state.diagnostics,
    configDiagnostics: current.configDiagnostics,
    customPrompts: {
      enabled: current.prompt.enabled,
      fileCount: current.prompt.fileCount,
      ...(current.prompt.fingerprint ? { fingerprint: current.prompt.fingerprint } : {}),
      diagnostics: current.prompt.diagnostics,
    },
    cache: current.telemetry,
    sessionCache: current.sessionCache,
  };
}

function stateFor(ctx: Pick<ExtensionContext, "sessionManager" | "cwd">, config = loadCompactConfig(ctx.cwd)): CompactState {
  return applyCompactConfig(reduceCompactState(branch(ctx)), config);
}

export function applyCompactConfig(state: CompactState, config: CompactConfig): CompactState {
  return {
    ...state,
    enabled: state.hasSessionControl ? state.enabled : config.enabled,
    autoCooling: state.hasAutoCoolingControl ? state.autoCooling : config.autoCooling,
    manualMode: state.hasManualControl ? state.manualMode : config.manualMode,
    cachePanel: state.hasPanelControl ? state.cachePanel : config.cachePanel,
  };
}

function branch(ctx: Pick<ExtensionContext, "sessionManager">): SessionLikeEntry[] {
  return ctx.sessionManager.getBranch() as SessionLikeEntry[];
}

function replaySessionCache(entries: readonly SessionLikeEntry[]): SessionCacheStats {
  const usages: Array<CacheUsage | undefined> = [];
  for (const entry of entries) {
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") continue;
    usages.push(cacheUsage(entry.message.usage));
  }
  return replaySessionCacheUsages(usages);
}

function cacheUsage(value: unknown): CacheUsage | undefined {
  if (!isRecord(value)) return undefined;
  return {
    ...(value.input !== undefined ? { input: value.input as number } : {}),
    ...(value.output !== undefined ? { output: value.output as number } : {}),
    ...(value.cacheRead !== undefined ? { cacheRead: value.cacheRead as number } : {}),
    ...(value.cacheWrite !== undefined ? { cacheWrite: value.cacheWrite as number } : {}),
  };
}

function transaction(
  id: string,
  kind: CompactTransaction["kind"],
  epochId: string,
  extra: Omit<CompactTransaction, "schema" | "id" | "kind" | "epochId">,
): CompactTransaction {
  return { schema: AILI_COMPACT_SCHEMA, id, kind, epochId, ...extra };
}

function success(message: string, contextTx: CompactTransaction): AgentToolResult<{ contextTx: CompactTransaction }> {
  return { content: [{ type: "text", text: message }], details: { contextTx } };
}

function text(message: string): AgentToolResult<Record<string, never>> {
  return { content: [{ type: "text", text: message }], details: {} };
}

function renderMutationFailure(failure: { code: string; message: string; reasons: readonly string[] }): string {
  const reasons = [...new Set(failure.reasons)].slice(0, 16);
  return `${failure.code}: ${failure.message}${reasons.length > 0 ? ` (${reasons.join(",")})` : ""}`;
}

function error(message: string): AgentToolResult<Record<string, never>> {
  return { content: [{ type: "text", text: message }], details: {}, isError: true } as unknown as AgentToolResult<Record<string, never>>;
}

function validateCompactSources(entries: readonly SessionLikeEntry[], state: CompactState, ids: readonly string[]): { error?: string } {
  if (!state.enabled) return { error: "AILI Compact is off for this session." };
  if (new Set(ids).size !== ids.length) return { error: "Each entry may appear only once." };
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const protectedIds = lastUserEntryIds(entries, 2);
  const activeSourceIds = new Set(activeBlocks(state).flatMap((block) => block.sourceEntryIds));
  for (const id of ids) {
    const entry = byId.get(id);
    if (!entry || entry.type !== "message" || !isRecord(entry.message)) return { error: `Unknown or non-message entry: ${id}` };
    if (protectedIds.has(id)) return { error: `Recent user entry is protected: ${id}` };
    if (activeSourceIds.has(id)) return { error: `Entry is already covered by an active AILI Compact block: ${id}` };
    if (isAiliCompactProtocolMessage(entry.message)) return { error: `AILI Compact entry is protected: ${id}` };
  }
  const selectedIds = new Set(ids);
  for (const id of ids) {
    const entry = byId.get(id)!;
    if (isProtocolMessage(entry.message as Record<string, unknown>) && !isCompleteSelectedProtocolAtom(entries, selectedIds, entry)) {
      return { error: `Tool protocol atom is incomplete: ${id}` };
    }
  }
  return {};
}

function lastUserEntryIds(entries: readonly SessionLikeEntry[], count: number): Set<string> {
  const ids = new Set<string>();
  for (const entry of [...entries].reverse()) {
    if (entry.type === "message" && isRecord(entry.message) && entry.message.role === "user") ids.add(entry.id);
    if (ids.size === count) break;
  }
  return ids;
}

function isProtocolMessage(message: Record<string, unknown>): boolean {
  return message.role === "toolResult" || toolCallIds(message).length > 0;
}

function isAiliCompactProtocolMessage(message: Record<string, unknown>): boolean {
  if (typeof message.toolName === "string" && COMPACT_TOOL_NAMES.has(message.toolName)) return true;
  return toolCalls(message).some((call) => COMPACT_TOOL_NAMES.has(call.name));
}

function toolCalls(message: Record<string, unknown>): Array<{ id: string; name: string }> {
  const calls: Array<{ id: string; name: string }> = [];
  if (Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) {
      if (isRecord(call) && typeof call.id === "string" && typeof call.name === "string") calls.push({ id: call.id, name: call.name });
    }
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (isRecord(part) && part.type === "toolCall" && typeof part.id === "string" && typeof part.name === "string") calls.push({ id: part.id, name: part.name });
    }
  }
  return calls;
}

function toolCallIds(message: Record<string, unknown>): string[] {
  return toolCalls(message).map((call) => call.id);
}

function isCompleteSelectedProtocolAtom(
  entries: readonly SessionLikeEntry[],
  selectedIds: ReadonlySet<string>,
  entry: SessionLikeEntry,
): boolean {
  if (!isRecord(entry.message)) return false;
  const message = entry.message;
  if (message.role === "assistant") {
    const callIds = toolCallIds(message);
    return callIds.length > 0 && callIds.every((toolCallId) => {
      const results = entries.filter((candidate) => candidate.type === "message"
        && isRecord(candidate.message)
        && candidate.message.role === "toolResult"
        && candidate.message.toolCallId === toolCallId);
      return results.length > 0 && results.every((result) => selectedIds.has(result.id));
    });
  }
  const toolCallId = message.toolCallId;
  if (message.role !== "toolResult" || typeof toolCallId !== "string") return false;
  const callers = entries.filter((candidate) => candidate.type === "message"
    && isRecord(candidate.message)
    && candidate.message.role === "assistant"
    && toolCallIds(candidate.message).includes(toolCallId));
  return callers.length === 1
    && selectedIds.has(callers[0]!.id)
    && isCompleteSelectedProtocolAtom(entries, selectedIds, callers[0]!);
}

function hasImageContent(content: unknown): boolean {
  return Array.isArray(content) && content.some((part) => isRecord(part) && part.type === "image");
}

function searchCurrentBranch(entries: readonly SessionLikeEntry[], query: string, limit: number) {
  const normalized = query.toLocaleLowerCase();
  const results: Array<{ entryId: string; excerpt: string }> = [];
  let remaining = MAX_SEARCH_CHARS;
  for (const entry of entries) {
    if (entry.type !== "message" || !isRecord(entry.message)) continue;
    const source = extractText(entry.message.content);
    const index = source.toLocaleLowerCase().indexOf(normalized);
    if (index < 0) continue;
    const excerpt = source.slice(Math.max(0, index - 600), Math.min(source.length, index + query.length + 1_200));
    if (excerpt.length > remaining) break;
    results.push({ entryId: entry.id, excerpt });
    remaining -= excerpt.length;
    if (results.length === limit) break;
  }
  return results;
}

function lastAssistantEntryId(entries: readonly SessionLikeEntry[]): string | undefined {
  return [...entries].reverse().find((entry) => entry.type === "message" && isRecord(entry.message) && entry.message.role === "assistant")?.id;
}

function findStrategyCoolingPlan(
  entries: readonly SessionLikeEntry[],
  state: CompactState,
  config: CompactConfig,
  cwd: string,
): { blocks: CompactBlock[]; policy: NonNullable<CompactTransaction["policy"]> } | undefined {
  const journaled = new Set(activeBlocks(state).flatMap((block) => block.sourceEntryIds));
  const results = entries.flatMap((entry, replayIndex) => {
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "toolResult"
      || typeof entry.message.toolName !== "string" || typeof entry.message.toolCallId !== "string") return [];
    const source = extractText(entry.message.content);
    const assistantTurnsAfter = entries.slice(replayIndex + 1).filter((candidate) => isRecord(candidate.message) && candidate.message.role === "assistant").length;
    const protection = classifyProtection(entries, replayIndex, { cwd, ...config.protection });
    return [{
      id: entry.id,
      sourceEntryIds: [entry.id],
      replayIndex,
      consumedTurn: replayIndex + assistantTurnsAfter,
      consumed: assistantTurnsAfter >= (entry.message.isError === true ? config.strategies.purgeErrors.graceTurns : 1),
      toolName: entry.message.toolName,
      contentDigest: digest(source),
      isError: entry.message.isError === true,
      assistantTurnsAfter,
      sourceChars: source.length,
      projectedChars: 96,
      ...(protection.protected ? { protectedReason: protection.reasons[0] ?? "protected" } : {}),
    }];
  });
  const strategy = planJournaledStrategies(results, {
    dedupeEnabled: config.strategies.dedupe.enabled,
    purgeErrorsEnabled: config.strategies.purgeErrors.enabled,
    errorGraceTurns: config.strategies.purgeErrors.graceTurns,
    keepLatest: 1,
    journaledSourceEntryIds: journaled,
  });
  if (strategy.candidates.length === 0) return undefined;
  const preferred = strategy.candidates.some((candidate) => candidate.strategy === "purge-error") ? "purge-error" : "dedupe";
  const grouped = selectGroupedCandidates(strategy.candidates.filter((candidate) => candidate.strategy === preferred), {
    maxCandidates: 16,
    minAggregateGainChars: config.compress.minSavingsChars,
    journaledSourceEntryIds: journaled,
  });
  if (grouped.kind !== "transaction") return undefined;
  const blocks = grouped.candidates.map((candidate) => {
    const entry = entries.find((item) => item.id === candidate.sourceEntryIds[0]);
    const toolName = isRecord(entry?.message) && typeof entry.message.toolName === "string" ? entry.message.toolName.toLocaleLowerCase() : "tool";
    const stub = `[AILI Compact ${candidate.strategy}; tool=${toolName}; source=${candidate.id}; sha256=${results.find((result) => result.id === candidate.id)?.contentDigest.slice(0, 16) ?? "unavailable"}]`;
    return {
      id: `${candidate.strategy}:${candidate.id}`,
      kind: "cool" as const,
      epochId: state.epochId,
      sourceEntryIds: [...candidate.sourceEntryIds],
      sourceDigest: sourceDigest(entries, candidate.sourceEntryIds),
      summary: `${candidate.strategy} consumed ${toolName} result`,
      stub,
      active: true,
    };
  });
  return { blocks, policy: { strategy: preferred, sourceEntryIds: [...grouped.sourceEntryIds] } };
}

export function findCoolingCandidate(entries: readonly SessionLikeEntry[], state: CompactState): CompactBlock | undefined {
  return findCoolingCandidates(entries, state, 1)[0];
}

export function findCoolingCandidates(
  entries: readonly SessionLikeEntry[], state: CompactState, limit = 16, config?: CompactConfig, cwd = "/",
): CompactBlock[] {
  const activeSourceIds = new Set(activeBlocks(state).flatMap((block) => block.sourceEntryIds));
  const blocks: CompactBlock[] = [];
  for (const [index, entry] of entries.entries()) {
    if (blocks.length >= Math.max(1, Math.min(16, limit))) break;
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "toolResult" || activeSourceIds.has(entry.id)) continue;
    const source = extractText(entry.message.content); const toolName = typeof entry.message.toolName === "string" ? entry.message.toolName.toLocaleLowerCase() : undefined;
    const protection = config ? classifyProtection(entries, index, { cwd, ...config.protection }) : undefined;
    if (entry.message.isError === true && config && !config.strategies.purgeErrors.enabled) continue;
    const subagent = toolName === "task" ? gateSubagentEntry(entries, index, config?.subagents.enabled === true) : undefined;
    if (source.length < MIN_COOLING_CHARS || hasImageContent(entry.message.content) || !toolName
      || typeof entry.message.toolCallId !== "string" || COMPACT_TOOL_NAMES.has(toolName)
      || PROTECTED_COOLING_TOOL_NAMES.has(toolName) || protection?.protected || subagent?.protected
      || !hasPriorToolCallEntry(entries, index, entry.message.toolCallId) || hasProtectedToolCallPath(entries, index, entry.message.toolCallId)) continue;
    const assistantMessagesAfter = entries.slice(index + 1).filter((next) => next.type === "message" && isRecord(next.message) && next.message.role === "assistant").length;
    const requiredConsumption = entry.message.isError === true ? (config?.strategies.purgeErrors.graceTurns ?? 2) : 1;
    if (assistantMessagesAfter < requiredConsumption) continue;
    const outcome = entry.message.isError === true ? "error" : "success";
    const stub = `${source.slice(0, 700)}\n… [AILI Compact cooled ${entry.id}; outcome=${outcome}; sha256=${digest(source).slice(0, 16)}] …\n${source.slice(-700)}`;
    blocks.push({ id: `cool:${entry.id}`, kind: "cool", epochId: state.epochId, sourceEntryIds: [entry.id],
      sourceDigest: sourceDigest(entries, [entry.id]), summary: `Consumed ${outcome} tool result ${toolName}`, stub, active: true });
  }
  return blocks;
}

function hasPriorToolCallEntry(entries: readonly SessionLikeEntry[], index: number, toolCallId: string): boolean {
  return entries.slice(0, index).some((entry) => {
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") return false;
    if (Array.isArray(entry.message.toolCalls) && entry.message.toolCalls.some((call) => isRecord(call) && call.id === toolCallId)) return true;
    return Array.isArray(entry.message.content)
      && entry.message.content.some((part) => isRecord(part) && part.type === "toolCall" && part.id === toolCallId);
  });
}

function hasProtectedToolCallPath(entries: readonly SessionLikeEntry[], index: number, toolCallId: string): boolean {
  for (const entry of entries.slice(0, index).reverse()) {
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "assistant") continue;
    const args = toolCallArguments(entry.message, toolCallId);
    if (args !== undefined) return containsProtectedPath(args);
  }
  return false;
}

function toolCallArguments(message: Record<string, unknown>, toolCallId: string): unknown | undefined {
  if (Array.isArray(message.toolCalls)) {
    const call = message.toolCalls.find((candidate) => isRecord(candidate) && candidate.id === toolCallId);
    if (isRecord(call)) return call.arguments;
  }
  if (Array.isArray(message.content)) {
    const call = message.content.find((candidate) => isRecord(candidate) && candidate.type === "toolCall" && candidate.id === toolCallId);
    if (isRecord(call)) return call.arguments;
  }
  return undefined;
}

function containsProtectedPath(value: unknown, depth = 0): boolean {
  if (depth > 3) return false;
  if (Array.isArray(value)) return value.some((item) => containsProtectedPath(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, candidate]) => {
    if (typeof candidate === "string" && /(?:path|file|filename)$/i.test(key) && isProtectedPath(candidate)) return true;
    return containsProtectedPath(candidate, depth + 1);
  });
}

function isProtectedPath(path: string): boolean {
  const fileName = path.replaceAll("\\", "/").split("/").at(-1)?.toLocaleLowerCase() ?? "";
  return fileName === ".env"
    || fileName.startsWith(".env.")
    || fileName.endsWith(".pem")
    || fileName.endsWith(".key")
    || PROTECTED_FILE_NAMES.has(fileName);
}

function mutationGuard(entries: readonly SessionLikeEntry[], toolCallId: string, toolName: string): MutationGuardInput {
  const assistant = [...entries].reverse().find((entry) => entry.type === "message" && isRecord(entry.message)
    && entry.message.role === "assistant" && toolCalls(entry.message).some((call) => call.id === toolCallId));
  if (!assistant || !isRecord(assistant.message)) return { soleCall: false, siblingToolNames: ["unproven-assistant-atom"] };
  const calls = toolCalls(assistant.message);
  return { soleCall: calls.length === 1 && calls[0]?.id === toolCallId && calls[0]?.name === toolName,
    siblingToolNames: calls.filter((call) => call.id !== toolCallId).map((call) => call.name) };
}

function manualTriggerAllowsCall(
  entries: readonly SessionLikeEntry[],
  trigger: NonNullable<CompactState["pendingManualTrigger"]>,
  toolCallId: string,
): boolean {
  const triggerIndex = entries.findIndex((entry) => entry.type === "custom" && entry.customType === AILI_COMPACT_ENTRY
    && isRecord(entry.data) && isRecord(entry.data.manualTrigger) && entry.data.manualTrigger.id === trigger.id);
  if (triggerIndex < 0 || (triggerIndex > 0 && entries[triggerIndex - 1]?.id !== trigger.turnId)) return false;
  const callIndex = entries.findIndex((entry, index) => index > triggerIndex && entry.type === "message" && isRecord(entry.message)
    && entry.message.role === "assistant" && toolCalls(entry.message).some((call) => call.id === toolCallId && call.name === "aili_compact"));
  if (callIndex < 0) return false;
  const between = entries.slice(triggerIndex + 1, callIndex);
  return between.filter((entry) => entry.type === "message" && isRecord(entry.message) && entry.message.role === "user").length === 1
    && !between.some((entry) => entry.type === "message" && isRecord(entry.message) && entry.message.role === "assistant");
}

function clearManualTrigger(pi: ExtensionAPI, state: CompactState): void {
  if (!state.pendingManualTrigger) return;
  pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`clear:${state.pendingManualTrigger.id}`, "control", state.epochId, { control: "manual-clear", consumeManualTriggerId: state.pendingManualTrigger.id }));
}

function protectionForIds(entries: readonly SessionLikeEntry[], ids: readonly string[], cwd: string, config: CompactConfig) {
  const wanted = new Set(ids); const reasons = new Set<string>();
  entries.forEach((entry, index) => {
    if (!wanted.has(entry.id)) return;
    for (const reason of classifyProtection(entries, index, { cwd, ...config.protection }).reasons) reasons.add(reason);
    const subagent = gateSubagentEntry(entries, index, config.subagents.enabled);
    if (subagent.protected && subagent.reason !== "not-subagent") reasons.add(`subagent-${subagent.reason}`);
  });
  return { protected: reasons.size > 0, reasons: [...reasons] };
}

function commandInputs(entries: readonly SessionLikeEntry[], state: CompactState, runtime: SessionRuntime, cwd: string): CompactCommandInputs {
  const catalog = buildReferenceCatalog(entries, state); const indexById = new Map(entries.map((entry, index) => [entry.id, index]));
  const active = activeBlocks(state); const activeSources = new Set(active.flatMap((block) => block.sourceEntryIds));
  const sourceChars = active.reduce((sum, block) => sum + block.sourceEntryIds.reduce((chars, id) => {
    const entry = entries.find((item) => item.id === id);
    return chars + (entry && isRecord(entry.message) ? extractText(entry.message.content).length : 0);
  }, 0), 0);
  const projectedSavingChars = active.reduce((sum, block) => {
    const original = block.sourceEntryIds.reduce((chars, id) => {
      const entry = entries.find((item) => item.id === id);
      return chars + (entry && isRecord(entry.message) ? extractText(entry.message.content).length : 0);
    }, 0);
    const projected = block.kind === "cool" ? block.stub?.length ?? original : block.summary.length + 256;
    return sum + Math.max(0, original - projected);
  }, 0);
  const cooling = new Set(findCoolingCandidates(entries, state, 16, runtime.config, cwd).flatMap((block) => block.sourceEntryIds));
  const candidates = catalog.messages.map((message) => {
    const index = indexById.get(message.entryId);
    const decision = index === undefined ? { protected: true, reasons: ["metadata-unknown"] as readonly string[] }
      : classifyProtection(entries, index, { cwd, ...runtime.config.protection });
    const reasonCodes = [...decision.reasons];
    if (index !== undefined) {
      const subagent = gateSubagentEntry(entries, index, runtime.config.subagents.enabled);
      if (subagent.protected && subagent.reason !== "not-subagent") reasonCodes.push(`subagent-${subagent.reason}`);
    }
    return { ref: message.ref, role: message.role, compressible: reasonCodes.length === 0 && !activeSources.has(message.entryId), reasonCodes };
  });
  return {
    catalog, candidates: candidates.map((candidate) => cooling.has(catalog.messages.find((message) => message.ref === candidate.ref)!.entryId) ? { ...candidate, compressible: true } : candidate),
    activeRecaps: catalog.blocks.flatMap((reference) => { const block = state.blocks.get(reference.blockId); return block?.active ? [{ blockRef: reference.ref, topic: block.topic, summary: block.summary }] : []; }),
    blockEligibility: catalog.blocks.map((reference) => { const block = state.blocks.get(reference.blockId); return { blockRef: reference.ref, active: reference.active, queryOnly: reference.queryOnly, deactivationReason: block?.deactivationReason }; }),
    policyReasons: [...new Set(candidates.flatMap((candidate) => candidate.reasonCodes))].map((code) => ({ code, count: candidates.filter((candidate) => candidate.reasonCodes.includes(code)).length })),
    stats: {
      session: { transactions: state.transactionCount ?? 0, blocks: state.blocks.size, sourceChars, projectedSavingChars },
      branch: { transactions: state.transactionCount ?? 0, blocks: state.blocks.size, activeBlocks: active.length, cooledResults: active.filter((block) => block.kind === "cool").length },
      cache: { eligibleSamples: runtime.telemetry.window.length, cacheReads: runtime.telemetry.cacheRead, cacheWrites: runtime.telemetry.cacheWrite },
    }, enabled: state.enabled, manualMode: state.manualMode, autoCooling: state.autoCooling, pendingManualTrigger: state.pendingManualTrigger !== undefined,
  };
}

function cachePresentation(state: CompactState, runtime: Pick<SessionRuntime, "telemetry" | "sessionCache">) {
  return presentCache({
    session: runtime.sessionCache,
    telemetry: runtime.telemetry,
    activeBlocks: activeBlocks(state).length,
    panelEnabled: state.cachePanel,
    terminalColumns: process.stdout.columns ?? 120,
  });
}

function publishStatus(ctx: ExtensionContext, state: CompactState, runtime: SessionRuntime, diagnostic?: string): void {
  const presentation = cachePresentation(state, runtime);
  ctx.ui.setStatus("aili-compact", diagnostic ? `AILI Compact WARN: ${diagnostic}` : renderStatus(state, runtime));
  const ui = ctx.ui as ExtensionContext["ui"] & { setWidget?: (key: string, content: string[] | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }) => void };
  if (typeof ui.setWidget === "function") {
    const widgetRenderKey = `${presentation.panel.visibility}:${presentation.panel.renderKey}`;
    if (runtime.lastWidgetRenderKey !== widgetRenderKey) {
      ui.setWidget("aili-compact-cache", presentation.panel.visibility === "visible" ? [...presentation.panel.lines] : undefined, { placement: "belowEditor" });
      runtime.lastWidgetRenderKey = widgetRenderKey;
    }
  }
}

function renderPromptStatus(prompt: CompactPromptSnapshot): string {
  const status = prompt.enabled ? "on" : "off";
  const fingerprint = prompt.fingerprint ? `; fingerprint=${prompt.fingerprint.slice(0, 16)}` : "";
  const diagnostics = prompt.diagnostics.length > 0 ? `; warnings=${prompt.diagnostics.join(",")}` : "";
  return `AILI Compact custom prompts ${status}; files=${prompt.fileCount}${fingerprint}${diagnostics}`;
}

function renderStatus(state: CompactState, runtime: Pick<SessionRuntime, "telemetry" | "sessionCache">): string {
  return `AILI Compact ${state.enabled ? "on" : "off"}; blocks=${activeBlocks(state).length}; ${cachePresentation(state, runtime).footer}`;
}
