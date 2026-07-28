import {
  Type,
  type Context as PiProviderContext,
  type Model as PiProviderModel,
} from "@earendil-works/pi-ai";
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
  canonicalJson,
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
  planJournaledStrategies,
  selectGroupedCandidates,
} from "./automatic.js";
import {
  classifyCacheRequest,
  emptyCacheTelemetry,
  emptySessionCacheStats,
  recordCacheTelemetry,
  recordSessionCacheUsage,
  replaySessionCacheUsages,
  providerSurfaceIdentities,
  type CacheRequestClassification,
  type CacheTelemetry,
  type CacheUsage,
  type SessionCacheStats,
  type ProviderSurfaceIdentities,
} from "./cache.js";
import { planEmergencyGc, planGenerationalGc, planMajorGc, reconstructCompletedCompactionEpoch } from "./compaction.js";
import {
  appendCompactPromptGuidance,
  loadCompactConfig,
  loadCompactConfigResult,
  loadCompactPromptSnapshot,
  type CompactConfig,
  type CompactPromptSnapshot,
} from "./config.js";
import {
  planCompactCommand,
  COMPACT_COMMAND_USAGE,
  type CommandCandidateSummary,
  type CommandContextOutput,
  type CompactCommandInputs,
} from "./commands.js";
import { buildCompactDoctorTelemetry } from "./doctor-telemetry.js";
import { planDecompression, planPruneMutation, planRecompression, type MutationGuardInput } from "./mutations.js";
import { classifyProtection } from "./protection.js";
import { presentCache } from "./presentation.js";
import { alignEntriesToMessages, type ProjectionMessage } from "./projector.js";
import { projectIndexedProviderMessages } from "./indexed-projector.js";
import { buildReferenceCatalog, pageReferenceCatalog } from "./references.js";
import { gateSubagentEntry } from "./subagent-gating.js";
import { activeBlocks, reduceCompactState, reduceV3LifecycleState } from "./reducer.js";
import {
  CheckpointAttemptCache,
  CheckpointCoordinator,
  PressureCycle,
  observePressure,
  type PressureObservation,
  type RecoveryTuple,
  type ManualCompactPermit,
} from "./recovery.js";
import {
  discoverLegacyRepairCandidates,
  planLegacyRepairs,
  repairBranchSourceEntryIds,
  type RepairDisposition,
} from "./repair.js";
import { buildProtocolAtoms, type ProtocolAtomBuildResult } from "./protocol-atoms.js";
import {
  builtInTokenBoundProfiles,
  estimateTokenBounds,
  planSafeRanges,
  resolveTokenBoundProfile,
  TOKEN_ESTIMATOR_VERSION,
  verifyExactMutationScope,
  type SafeRangePlan,
} from "./safe-planning.js";
import { AILI_COMPACT_PROVIDER_SUFFIX, buildProviderSuffix, type ProviderSuffixResult } from "./provider-suffix.js";
import { QUALITY_EVALUATOR_VERSION, assessQuality, type FrozenQualitySourceV1, type QualityInputV1, type QualityTier } from "./quality.js";
import { buildQualityIdentityContext, freezeBlockQualitySource, freezeMessageQualitySource } from "./quality-source.js";
import {
  evaluateV3CompactEconomics,
  V3_COMPACT_ECONOMICS_VERSION,
  type V3CompactEconomicsInput,
  type V3CompactEconomicsResult,
  type V3OneTimeEconomicsSurfaces,
} from "./economics.js";
import {
  createPiProviderEconomicsSurfaceAdapter,
  type PiProviderEconomicsContextSurface,
  type PiProviderSerializerTarget,
  type V3ProviderEconomicsSurfaceKind,
} from "./provider-economics.js";
import {
  BranchIndexCache,
  auditBranchIndexReplayHealth,
  branchProtocolAtomBuild,
  coldBuildBranchIndex,
  getBranchProtocolAtomForEntry,
  getBranchV3LifecycleReplay,
  lastBranchProtocolAtom,
  listBranchMessageReferences,
  type BranchProviderAlignmentResult,
  type BranchReferencePage,
  type BranchSessionEntry,
} from "./branch-index.js";
import {
  evaluateToolResultCooling,
  resolveToolCoolingPolicy,
  TOOL_COOLING_PROFILE_VERSION,
  type ResultObservationIdentity,
} from "./cooling-profiles.js";
import { TokenCalibrationWindowState } from "./calibration.js";
import { planV3CheckpointCoverage } from "./v3-projector.js";
import {
  V3_PROJECTION_VERSION,
  buildIndexedV3RuntimeView,
  buildV3RuntimeView,
  v3LeafEntryIds,
  type V3RuntimeView,
} from "./v3-runtime.js";
import {
  planV3MessageMutation,
  planV3BlockMutation,
  planV3DecompressMutation,
  planV3RecompressMutation,
  planV3ControlMutation,
  planV3CoolingMutation,
  v3BlockSourceDigest,
  type V3MutationPlanFailure,
  type V3MutationPlannerContext,
  type V3ProtectedOrdinalInterval,
  type V3QualityEvidence,
} from "./v3-mutations.js";
import { applyV3Transaction, v3SummaryDigest, type V3SemanticBlock, type V3Transaction } from "./v3.js";
import { deriveRuntimeCatalogId } from "./runtime-catalog.js";

const COMPACT_TOOL_NAMES = new Set([
  "aili_compact",
  "aili_decompress",
  "aili_prune",
  "aili_search_context",
  "aili_compact_status",
  "aili_context_recap",
]);
const PROTECTED_FILE_NAMES = new Set(["credentials.json", "secrets.json", "package.json", "tsconfig.json", "pyproject.toml", "cargo.toml"]);
const MIN_COOLING_CHARS = 8_192;
const MAX_SEARCH_RESULTS = 8;
const MAX_SEARCH_CHARS = 12_000;

type PublicCompactParams = {
  catalogId: string;
  topic: string;
  summaryMaxChars?: number;
} & (
  | { mode: "range"; ranges: Array<{ startRef: string; endRef: string; summary: string }> }
  | { mode: "message"; items: Array<{ messageRef: string; topic: string; summary: string }> }
  | { mode: "blocks"; blockRefs: string[]; summary: string }
);

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
  safePlan?: SafeRangePlan;
  providerSurfaces?: ProviderSurfaceIdentities;
  providerSuffixContent?: string;
  providerSuffix?: ProviderSuffixResult;
  checkpoint: CheckpointCoordinator;
  checkpointAttempts: CheckpointAttemptCache;
  pressureCycle: PressureCycle;
  pressure?: PressureObservation;
  deterministicCheckpointEligible: "not-evaluated" | "eligible" | `ineligible:${string}` | "Unverified";
  legacyRepairStatus?: Readonly<Record<RepairDisposition, number>> & { repaired: number };
  activationFailOpen?: string;
  manualPermit?: ManualCompactPermit;
  manualRequestSerial: number;
  branchIndex: BranchIndexCache;
  branchIndexHealthy: boolean | "Unverified";
  branchIndexDiagnostic?: string;
  pendingCoolingObservations?: ResultObservationIdentity[];
  coolingObservations: Array<{ identity: ResultObservationIdentity; successful: boolean; assistantTurnId: string }>;
  providerRequestSerial: number;
  calibration?: TokenCalibrationWindowState;
  calibrationKey?: string;
  pendingCalibration?: {
    providerId: string;
    modelId: string;
    fullProviderInputIdentity: string;
    baselinePromptTokens: number;
    hasBinaryOrImage: boolean;
    ambiguousRequest: boolean;
  };
  indexedState?: CompactState;
  indexedView?: V3RuntimeView;
  indexedTransactionCount?: number;
  indexedV3TransactionCount?: number;
  indexedEntryCount?: number;
  indexedSnapshotKeyId?: string;
  indexedSnapshotSourceDigest?: string;
  indexedDerivedIdentity?: string;
  indexedSourceOwnerByEntryId: Map<string, string>;
  indexedPlanningAtomBuild?: ProtocolAtomBuildResult;
  indexedPlanningRefs: Map<string, string>;
  indexedCommandInputs?: CompactCommandInputs;
  indexedCandidateByRef: Map<string, CommandCandidateSummary>;
  indexedContextStatic?: Pick<CommandContextOutput, "activeRecaps" | "policyReasons">;
  indexedCoolingCandidate?: { idHash: string; sourceCount: number };
  /** Absolute selected-branch offset of the first entry owned by the indexed epoch. */
  branchIndexEntryOffset: number;
  indexedProtectionEntryCount: number;
  indexedProtectedEntryIds: Set<string>;
  indexedProtectionReasonsByEntryId: Map<string, readonly string[]>;
  providerIndexFailOpen?: string;
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
  pressureStage: PressureObservation["stage"] | "Unverified";
  headroomTokens: { value?: number; source: PressureObservation["source"] };
  checkpointCoordinatorState: ReturnType<CheckpointCoordinator["snapshot"]>["state"];
  checkpointInFlight: boolean;
  deterministicCheckpointEligible: SessionRuntime["deterministicCheckpointEligible"];
  nativeAutomaticFallback: "enabled" | "disabled-config" | "Unverified-effective";
  nativeAutomaticFallbackProvenance: "explicit-user" | "prospective-marker" | "unknown" | "Unverified";
  lastRecoveryErrorCode: string | null;
  deterministicCheckpointCount: number;
  nativeFallbackCount: number;
  rescueCount: number;
  repairTransactionCount: number;
  legacyRepairStatus: (Readonly<Record<RepairDisposition, number>> & { repaired: number }) | "Unverified";
  quality: { enabled: boolean; acceptedBlocks: number; unevaluatedBlocks: number; warningPolicy: string };
  index: { enabled: boolean; healthy: boolean | "Unverified"; diagnostic?: string; counters: ReturnType<BranchIndexCache["counters"]> };
  providerIdentities: { static?: string; logicalPrefix?: string; suffix?: string; full?: string };
  tokenCalibration: ReturnType<TokenCalibrationWindowState["snapshot"]> | "Unverified";
  doctor: ReturnType<typeof buildCompactDoctorTelemetry>["components"];
}

export function registerAiliCompact(pi: ExtensionAPI): void {
  const sessions = new Map<string, SessionRuntime>();
  const runtimeFor = (ctx: ExtensionContext): SessionRuntime => {
    const id = ctx.sessionManager.getSessionId();
    const existing = sessions.get(id);
    if (existing) return existing;
    const loaded = loadCompactConfigResult(ctx.cwd);
    const initialState = applyCompactConfig(reduceCompactState(branch(ctx)), loaded.config);
    const tuple = recoveryTuple(ctx, initialState);
    const current: SessionRuntime = {
      telemetry: emptyCacheTelemetry(),
      sessionCache: emptySessionCacheStats(),
      config: loaded.config,
      configDiagnostics: loaded.diagnostics,
      prompt: loadCompactPromptSnapshot(ctx.cwd, loaded.config),
      checkpoint: new CheckpointCoordinator(tuple),
      checkpointAttempts: new CheckpointAttemptCache(),
      pressureCycle: new PressureCycle(tuple),
      deterministicCheckpointEligible: "not-evaluated",
      manualRequestSerial: 0,
      branchIndex: new BranchIndexCache(loaded.config.index.snapshotLru),
      branchIndexHealthy: "Unverified",
      coolingObservations: [],
      providerRequestSerial: 0,
      branchIndexEntryOffset: 0,
      indexedSourceOwnerByEntryId: new Map(),
      indexedPlanningRefs: new Map(),
      indexedCandidateByRef: new Map(),
      indexedProtectionEntryCount: 0,
      indexedProtectedEntryIds: new Set(),
      indexedProtectionReasonsByEntryId: new Map(),
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
      Type.Object({
        mode: Type.Literal("blocks"), catalogId: Type.String({ minLength: 64, maxLength: 64 }), topic: Type.String({ minLength: 1, maxLength: 200 }),
        blockRefs: Type.Array(Type.String({ pattern: "^b\\d{6}$" }), { minItems: 2, maxItems: 16 }),
        summary: Type.String({ minLength: 1, maxLength: 10_000 }),
        summaryMaxChars: Type.Optional(Type.Integer({ minimum: 256, maximum: 10_000 })),
      }),
    ]),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = runtimeFor(ctx); const entries = branch(ctx); const state = stateFor(ctx, runtime.config);
      if (runtime.manualPermit) {
        const permit = runtime.manualPermit;
        const allowed = manualPermitAllowsCall(entries, permit, toolCallId, ctx.sessionManager.getSessionId(), state.epochId);
        permit.state = allowed ? "consumed" : "invalid";
        runtime.manualPermit = undefined;
        if (!allowed) return error("The one-shot manual permit belongs to a different branch, epoch, or already-finished turn.");
      } else if (state.manualMode) return error("Manual mode requires a fresh /aili-compact compress permit.");
      return executeV3Compact(pi, toolCallId, params as PublicCompactParams, ctx, runtime, entries, state);
    },
  });

  pi.registerTool({
    name: "aili_decompress", label: "AILI Decompress",
    description: "Restore 1..16 active current-epoch block references and preview bounded exact source.",
    promptSnippet: "Restore current block references from aili_compact_status.",
    promptGuidelines: ["Call alone; archived and GC blocks are query-only."], executionMode: "sequential",
    parameters: Type.Object({
      catalogId: Type.String({ minLength: 64, maxLength: 64 }),
      blockRefs: Type.Array(Type.String({ pattern: "^b\\d{6}$" }), { minItems: 1, maxItems: 16 }),
      depth: Type.Optional(Type.Union([Type.Literal("one"), Type.Literal("raw")])),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = runtimeFor(ctx); const entries = branch(ctx); const state = stateFor(ctx, runtime.config);
      return executeDecompress(pi, toolCallId, params, ctx, runtime, entries, state);
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
      const view = v3ViewFor(ctx, entries, state);
      if (params.catalogId !== view.catalog.catalogId) {
        return error(canonicalJson({ code: "stale-catalog", refreshStatus: true }));
      }
      const planned = planPruneMutation({ transactionId: toolCallId, ...params, catalogId: view.legacyCatalog.catalogId }, {
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
      const state = stateFor(ctx, runtime.config);
      const catalog = v3ViewFor(ctx, entries, state).catalog;
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
      const state = runtime.indexedState ?? stateFor(ctx, runtime.config);
      const entries = runtime.indexedState ? undefined : branch(ctx);
      const view = runtime.indexedView ?? v3ViewFor(ctx, entries!, state);
      const indexedPage = runtime.indexedState
        ? runtime.branchIndex.pageReferences(params.offset ?? 0, params.limit ?? 32)?.value
        : undefined;
      const references = indexedPage
        ? indexedContextReferencePage(indexedPage, state, view, runtime)
        : (() => {
          const planned = planCompactCommand(
            `context ${params.offset ?? 0} ${params.limit ?? 32}`,
            commandInputs(entries!, state, runtime, ctx.cwd, view),
          );
          return planned.kind === "context"
            ? planned.output
            : pageReferenceCatalog(view.catalog, params.offset ?? 0, params.limit ?? 32);
        })();
      const safePlan = runtime.safePlan
        ?? (runtime.indexedState && runtime.branchIndex.current
          ? buildIndexedSafePlan(runtime.branchIndex.current, state, view, runtime, ctx)
          : buildCurrentSafePlan(entries!, state, runtime, ctx, view));
      return text(JSON.stringify({
        ...diagnosticsFor(ctx, runtime),
        references: {
          ...references,
          safeRanges: safePlan.ranges.slice(0, 32).map((range) => ({
            rangeId: range.rangeId,
            catalogId: range.catalogId,
            catalogScopeDigest: range.catalogScopeDigest,
            scopeDigest: range.scopeDigest,
            sourceDigest: range.sourceDigest,
            startRef: range.startRef,
            endRef: range.endRef,
            orderedRefs: range.orderedRefs,
            tokenBounds: range.tokenBounds,
          })),
          safeRangeDiagnostics: {
            planningEnabled: runtime.config.planning.enabled,
            exclusionCounts: safePlan.exclusionCounts,
            diagnostics: safePlan.diagnostics,
          },
          lifecycle: v3LifecycleStatus(view, state, runtime.config),
        },
      }, null, 2));
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
      const entries = branch(ctx);
      const view = v3ViewFor(ctx, entries, state);
      const catalog = view.catalog;
      if (!params.blockRef) {
        const blocks = catalog.blocks.filter((item) => item.active).slice(0, 32).flatMap((item) => {
          const legacyBlock = item.family === "legacy" ? state.blocks.get(item.blockId) : undefined;
          const v3Block = item.family === "v3" ? view.state.blocks.get(item.blockId) : undefined;
          return legacyBlock || v3Block ? [{
            blockRef: item.ref,
            schema: item.family === "v3" ? "v3" : "legacy",
            tier: v3Block?.tier,
            topic: legacyBlock?.topic ?? v3Block?.topic ?? "(none)",
            mode: legacyBlock?.mode ?? v3Block?.source.kind ?? "legacy",
            sourceCount: legacyBlock?.sourceEntryIds.length ?? v3Block?.leafCount ?? 0,
            summaryPreview: `${(legacyBlock?.summary ?? v3Block!.summary).slice(0, 200)}${(legacyBlock?.summary ?? v3Block!.summary).length > 200 ? "…" : ""}`,
          }] : [];
        });
        return text(JSON.stringify({ catalogId: catalog.catalogId, activeBlocks: blocks }, null, 2));
      }
      const reference = catalog.blocks.find((item) => item.ref === params.blockRef);
      const legacyBlock = reference?.family === "legacy" ? state.blocks.get(reference.blockId) : undefined;
      const v3Block = reference?.family === "v3" ? view.state.blocks.get(reference.blockId) : undefined;
      const block = legacyBlock ?? v3Block;
      if (!reference || !block) return error(`Unknown or archived AILI Compact block reference: ${params.blockRef}`);
      if (!reference.active || block.queryOnly) return error(`AILI Compact block ${params.blockRef} is inactive or query-only.`);
      return text(JSON.stringify({
        blockRef: reference.ref,
        schema: reference.family === "v3" ? "v3" : "legacy",
        tier: v3Block?.tier,
        topic: block.topic ?? "(none)",
        mode: legacyBlock?.mode ?? v3Block?.source.kind ?? "legacy",
        sourceCount: legacyBlock?.sourceEntryIds.length ?? v3Block?.leafCount ?? 0,
        summary: block.summary,
      }, null, 2));
    },
  });

  pi.registerCommand("aili-compact", {
    description: "AILI Compact: context, stats, sweep, manual, compress, rescue, decompress, recompress, cache, prompt, on, off, restore-all, doctor",
    handler: async (args, ctx) => {
      const runtime = runtimeFor(ctx);
      const normalizedArgs = args.trim().toLocaleLowerCase();
      if (normalizedArgs === "doctor") {
        const state = runtime.indexedState ?? stateFor(ctx, runtime.config);
        const report = compactRuntimeDoctor(state, runtime, await validateLicenseDisposition(), runtime.indexedView);
        ctx.ui.notify(JSON.stringify(report, null, 2), report.status === "PASS" ? "info" : "warning");
        return;
      }
      if (runtime.indexedCommandInputs && (normalizedArgs === "context" || normalizedArgs.startsWith("context "))) {
        const words = normalizedArgs.split(/\s+/u);
        const offset = words[1] === undefined || /^\d+$/u.test(words[1]) ? Number(words[1] ?? 0) : undefined;
        const limit = words[2] === undefined || /^\d+$/u.test(words[2]) ? Number(words[2] ?? 32) : undefined;
        const page = words.length <= 3 && offset !== undefined && Number.isSafeInteger(offset) && offset >= 0
          && limit !== undefined && Number.isSafeInteger(limit) && limit >= 1 && limit <= 64
          ? runtime.branchIndex.pageReferences(offset, limit)?.value
          : undefined;
        const state = runtime.indexedState;
        const view = runtime.indexedView;
        if (!page || !state || !view) {
          ctx.ui.notify(COMPACT_COMMAND_USAGE, "warning");
          return;
        }
        ctx.ui.notify(JSON.stringify(indexedContextReferencePage(page, state, view, runtime), null, 2), "info");
        return;
      }
      if (runtime.indexedCommandInputs && normalizedArgs === "stats") {
        const indexedPlan = planCompactCommand(args, runtime.indexedCommandInputs);
        if (indexedPlan.kind === "stats") {
          ctx.ui.notify(JSON.stringify(indexedPlan.output, null, 2), "info");
          return;
        }
      }
      const entries = branch(ctx); const state = stateFor(ctx, runtime.config);
      ensureRecoveryRuntime(ctx, runtime, state);
      const lifecycleView = v3ViewFor(ctx, entries, state);
      const inputs = commandInputs(entries, state, runtime, ctx.cwd, lifecycleView);
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
        const report = compactRuntimeDoctor(state, runtime, await validateLicenseDisposition(), lifecycleView);
        ctx.ui.notify(JSON.stringify(report, null, 2), report.status === "PASS" ? "info" : "warning");
        return;
      }
      if (plan.kind === "rescue-status") {
        ctx.ui.notify(JSON.stringify(recoveryStatus(runtime, state), null, 2), "info");
        return;
      }
      if (plan.kind === "rescue") {
        if (!state.enabled) {
          ctx.ui.notify("AILI Compact is off; rescue was not invoked. Pi /compact remains host-owned.", "warning");
          return;
        }
        const result = invokeCheckpoint(ctx, runtime, "rescue", plan.policy);
        ctx.ui.notify(result.accepted
          ? `AILI Compact rescue scheduled (${plan.policy}).`
          : `AILI Compact rescue not started: ${result.code}.`, result.accepted ? "info" : "warning");
        return;
      }
      if (plan.kind === "control") {
        appendV3Control(pi, lifecycleView, state, `v3:control:${leaf}:${plan.value}`, plan.value, "explicit-user");
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`control:${leaf}:${plan.value}`, "control", state.epochId, { control: plan.value }));
      } else if (plan.kind === "manual-control") {
        const control = plan.value === "on" ? "manual-on" : "manual-off";
        appendV3Control(pi, lifecycleView, state, `v3:control:${leaf}:${control}`, control, "explicit-user");
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`control:${leaf}:${control}`, "control", state.epochId, { control }));
      } else if (plan.kind === "cache-panel") {
        const control = plan.value === "on" ? "panel-on" : "panel-off";
        appendV3Control(pi, lifecycleView, state, `v3:control:${leaf}:${control}`, control, "explicit-user");
        pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`control:${leaf}:${control}`, "control", state.epochId, { control }));
      } else if (plan.kind === "sweep") {
        const blocks = findCoolingCandidates(entries, state, plan.limit, runtime.config, ctx.cwd, runtimeCoolingEvidence(runtime), coolingExcludedEntryIds(lifecycleView));
        if (blocks.length === 0) { ctx.ui.notify("AILI Compact sweep found no safe grouped candidates.", "info"); return; }
        const appended = appendV3CoolingTransactions(pi, lifecycleView, state, entries, blocks, runtime, `sweep:${leaf}`);
        if (appended === 0) { ctx.ui.notify("AILI Compact sweep found no v3 cooling candidate with exact current observation evidence.", "warning"); return; }
      } else if (plan.kind === "compress") {
        if (!ctx.isIdle() || ctx.hasPendingMessages()) { ctx.ui.notify("AILI Compact one-shot request is busy; nothing was appended or requested.", "warning"); return; }
        if (runtime.manualPermit?.state === "armed") { ctx.ui.notify("AILI Compact already has an active one-shot manual permit.", "warning"); return; }
        runtime.manualRequestSerial += 1;
        const requestId = `manual:${runtime.manualRequestSerial}:${digest([leaf, plan.focus ?? ""]).slice(0, 16)}`;
        runtime.manualPermit = {
          permitId: `manual-permit:${digest([requestId, recoveryTuple(ctx, state)]).slice(0, 24)}`,
          requestId,
          tuple: recoveryTuple(ctx, state),
          turnId: leaf,
          state: "armed",
        };
        try {
          pi.sendUserMessage(`AILI Compact one-shot request${plan.focus ? ` (focus: ${plan.focus})` : ""}: inspect aili_compact_status, then make at most one aili_compact attempt in this turn.`);
        } catch {
          runtime.manualPermit.state = "invalid";
          runtime.manualPermit = undefined;
          ctx.ui.notify("AILI Compact could not start the one-shot turn; the permit was cleared.", "warning");
        }
        return;
      } else if (plan.kind === "decompress") {
        const applied = applyCommandBlockOperation(pi, {
          operation: "decompress",
          transactionId: `decompress:${leaf}`,
          catalogId: plan.catalogId,
          blockRefs: plan.blockRefs,
          depth: plan.depth,
        }, lifecycleView, entries, state);
        if (!applied.ok) { ctx.ui.notify(applied.message, "warning"); return; }
      } else if (plan.kind === "recompress") {
        const applied = applyCommandBlockOperation(pi, {
          operation: "recompress",
          transactionId: `recompress:${leaf}`,
          catalogId: plan.catalogId,
          blockRefs: plan.blockRefs,
        }, lifecycleView, entries, state);
        if (!applied.ok) { ctx.ui.notify(applied.message, "warning"); return; }
      }
      const nextState = stateFor(ctx, runtime.config);
      const nextEntries = branch(ctx);
      syncBranchIndex(ctx, runtime, nextState, false);
      installProductionIndexOracle(ctx, runtime, nextState, nextEntries);
      publishStatus(ctx, nextState, runtime);
      const notice = plan.kind === "control" && plan.value === "off"
        ? "AILI Compact off applied append-only. Pi compaction settings remain user-owned; manual /compact stays available."
        : `AILI Compact ${plan.kind} applied append-only.`;
      ctx.ui.notify(notice, "info");
    },
  });

  pi.on("session_start", (_event, ctx) => {
    const runtime = runtimeFor(ctx);
    const state = activateBranchWithRepair(pi, ctx, runtime);
    const entries = branch(ctx);
    runtime.sessionCache = replaySessionCache(entries);
    syncBranchIndex(ctx, runtime, state, true);
    installProductionIndexOracle(ctx, runtime, state, entries);
    resetRecoveryRuntime(ctx, runtime, state, "session-start");
    publishStatus(ctx, state, runtime);
  });

  // Tree navigation is infrequent and changes the selected branch, so replay
  // once here rather than rescanning on every provider request or widget draw.
  pi.on("session_tree", (_event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    const state = activateBranchWithRepair(pi, ctx, runtime);
    const entries = branch(ctx);
    runtime.sessionCache = replaySessionCache(entries);
    syncBranchIndex(ctx, runtime, state, true);
    installProductionIndexOracle(ctx, runtime, state, entries);
    resetRecoveryRuntime(ctx, runtime, state, "tree-change");
    publishStatus(ctx, state, runtime);
  });

  pi.on("before_agent_start", (event, ctx) => {
    // Do not introduce provider-time file I/O: a session_start snapshot is required.
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    runtime.providerIndexFailOpen = undefined;
    const entries = branch(ctx);
    const indexedState = runtime.indexedState;
    if (!indexedState) {
      runtime.providerIndexFailOpen = "index-oracle-unavailable";
      return undefined;
    }
    syncBranchIndex(ctx, runtime, indexedState, false);
    if (!refreshProductionIndexDerived(ctx, runtime, entries)) {
      runtime.providerIndexFailOpen = runtime.branchIndexDiagnostic ?? "index-derived-unavailable";
      return undefined;
    }
    let state = runtime.indexedState!;
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
        runtime.providerIndexFailOpen = "provider-path-state-update";
      }
      runtime.lastProviderGcLeafId = leaf;
    }
    let systemPrompt = event.systemPrompt;
    let changed = false;
    const custom = state.enabled ? appendCompactPromptGuidance(systemPrompt, runtime.prompt) : undefined;
    if (custom) { systemPrompt = custom; changed = true; }
    // Dynamic pressure/catalog state is provider-only and is appended in the
    // final context hook. The system/tool surface remains byte-stable.
    runtime.systemPromptFingerprint = digest(systemPrompt);
    return changed ? { systemPrompt } : undefined;
  });

  pi.on("context", (event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return { messages: event.messages };
    if (runtime.activationFailOpen || runtime.providerIndexFailOpen) {
      runtime.projectionHealthy = false;
      ctx.ui.setStatus("aili-compact", `AILI Compact WARN: ${runtime.activationFailOpen ?? runtime.providerIndexFailOpen}`);
      return { messages: event.messages };
    }
    const entries = branch(ctx);
    const indexedState = runtime.indexedState;
    if (!indexedState) return { messages: event.messages };
    syncBranchIndex(ctx, runtime, indexedState, false);
    if (!refreshProductionIndexDerived(ctx, runtime, entries)) {
      runtime.projectionHealthy = false;
      ctx.ui.setStatus("aili-compact", `AILI Compact WARN: ${runtime.branchIndexDiagnostic ?? "index-derived-unavailable"}`);
      return { messages: event.messages };
    }
    const state = runtime.indexedState!;
    const view = runtime.indexedView!;
    const snapshot = runtime.branchIndex.current!;
    if (!state.enabled) {
      runtime.projectionHealthy = true;
      publishStatus(ctx, state, runtime);
      return { messages: event.messages };
    }
    const inputMessages = event.messages as unknown as ProjectionMessage[];
    const activeSourceOwner = runtime.indexedSourceOwnerByEntryId;
    const alignment = runtime.branchIndex.alignProviderMessages(inputMessages, {
      suffixCustomType: AILI_COMPACT_PROVIDER_SUFFIX,
      actionForEntry: (entryId) => activeSourceOwner.has(entryId) ? `project:${activeSourceOwner.get(entryId)}` : "raw",
    });
    if (!alignment || alignment.diagnostic) {
      runtime.projectionHealthy = false;
      ctx.ui.setStatus("aili-compact", `AILI Compact WARN: ${alignment?.diagnostic ?? "index-alignment-unavailable"}`);
      return { messages: event.messages };
    }
    const result = projectIndexedProviderMessages<ProjectionMessage>({
      snapshot,
      alignment,
      state,
      view,
      blockReferenceFor: (blockId) => view.blockRefById.get(blockId),
    });
    if (result.diagnostic) {
      runtime.projectionHealthy = false;
      runtime.safePlan = undefined;
      runtime.providerSuffix = undefined;
      runtime.providerSuffixContent = undefined;
      ctx.ui.setStatus("aili-compact", `AILI Compact WARN: ${result.diagnostic}`);
      return { messages: event.messages };
    }
    const logicalProviderMessagesCanonical = result.canonicalMessages;
    const logicalStructuredToolPartCount = result.structuredToolPartCount;
    const logicalHasBinaryOrImage = result.hasBinaryOrImage;
    const toolApi = pi as ExtensionAPI & { getActiveTools?: () => string[]; getAllTools?: () => Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: readonly string[] }> };
    const allTools = (typeof toolApi.getAllTools === "function" ? toolApi.getAllTools() : []) as Array<{ name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: readonly string[] }>;
    const activeNames = new Set(typeof toolApi.getActiveTools === "function" ? toolApi.getActiveTools() : allTools.map((tool) => tool.name));
    const model = ctx.model as unknown as Record<string, unknown> | undefined;
    const catalog = view.catalog;
    runtime.pressure = observeContextPressure(ctx, false);
    const lastAtom = lastBranchProtocolAtom(snapshot);
    const suffix = state.enabled && runtime.config.providerSuffix.enabled && lastAtom?.kind !== "remainder" && runtime.safePlan
      ? buildProviderSuffix({
        planningEnabled: runtime.config.planning.enabled,
        pressureStage: runtime.pressure.stage,
        headroomTokens: runtime.pressure.headroomTokens,
        headroomSource: runtime.pressure.source,
        catalogId: runtime.safePlan.catalogId,
        catalogScopeDigest: runtime.safePlan.catalogScopeDigest,
        safeRanges: runtime.safePlan.ranges,
        eligibleBlockRefs: catalog.blocks.filter((block) => block.active && !block.queryOnly).map((block) => block.ref),
        targetTier: "T1",
        allowedActions: runtime.safePlan.ranges.length > 0 ? ["compress"] : runtime.pressure.stage === "CHECKPOINT_REQUIRED" ? ["checkpoint"] : [],
        checkpointState: runtime.checkpoint.snapshot().state,
      }) : undefined;
    runtime.providerSuffixContent = suffix?.content;
    runtime.providerSuffix = suffix;
    const tools = allTools.filter((tool) => activeNames.has(tool.name)).map((tool) => ({
      name: tool.name, description: tool.description, parameterSchema: tool.parameters,
      immutablePrompt: { snippet: tool.promptSnippet ?? "", guidelines: tool.promptGuidelines ?? [] },
    }));
    const providerMessages = suffix ? [...result.messages, suffix.message] : result.messages;
    runtime.providerSurfaces = providerSurfaceIdentities({
      providerId: typeof model?.provider === "string" ? model.provider : "unavailable",
      modelId: typeof model?.id === "string" ? model.id : "unavailable",
      staticSystemPrompt: runtime.systemPromptFingerprint ?? "unavailable",
      immutableGuidance: { promptFingerprint: runtime.prompt.fingerprint ?? "none" },
      activeTools: tools,
      logicalProviderMessagesCanonical,
      ...(suffix ? { suffixContent: suffix.content } : {}),
      sessionId: ctx.sessionManager.getSessionId(), branchLeafId: ctx.sessionManager.getLeafId() ?? "root",
      branchSourceDigest: snapshot.sourceDigest,
      epochId: state.epochId,
      projectionHash: result.hash,
    });
    const identity = runtime.providerSurfaces.fullProviderInputIdentity;
    runtime.pendingCache = { identity, classification: classifyCacheRequest(runtime.completedCacheIdentity, identity) };
    const providerId = typeof model?.provider === "string" ? model.provider : "unavailable";
    const modelId = typeof model?.id === "string" ? model.id : "unavailable";
    const profile = runtime.safePlan?.tokenProfile ?? resolveTokenBoundProfile(
      providerId,
      modelId,
      TOKEN_ESTIMATOR_VERSION,
      runtimeTokenProfiles(runtime, providerId, modelId),
    );
    const suffixCanonical = suffix ? canonicalJson(suffix.message) : undefined;
    const serializedProviderMessages = suffixCanonical
      ? `${logicalProviderMessagesCanonical.slice(0, -1)}${result.messages.length > 0 ? "," : ""}${suffixCanonical}]`
      : logicalProviderMessagesCanonical;
    const baseline = estimateTokenBounds({
      utf8Bytes: Buffer.byteLength(serializedProviderMessages, "utf8"),
      messageCount: providerMessages.length,
      structuredToolPartCount: logicalStructuredToolPartCount
        + (suffix ? structuredToolPartCount(suffix.message) : 0),
    }, profile);
    runtime.pendingCalibration = {
      providerId,
      modelId,
      fullProviderInputIdentity: identity,
      baselinePromptTokens: Math.max(1, baseline.upper),
      hasBinaryOrImage: logicalHasBinaryOrImage
        || (suffix ? containsBinaryProviderContent(suffix.message) : false),
      ambiguousRequest: runtime.pendingCalibration !== undefined,
    };
    runtime.providerRequestSerial += 1;
    runtime.pendingCoolingObservations = coolingObservationCandidatesFromIndex(
      snapshot,
      alignment,
      state,
      ctx.sessionManager.getSessionId(),
      view.state.branchLeafId,
      identity,
      digest({ identity, serial: runtime.providerRequestSerial }),
      view,
    );
    runtime.projectionHealthy = result.diagnostic === undefined;
    publishStatus(ctx, state, runtime, result.diagnostic);
    return { messages: providerMessages as unknown as typeof event.messages };
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
    const successful = event.message.stopReason !== "error" && event.message.stopReason !== "aborted";
    const calibration = runtime.pendingCalibration;
    if (calibration && runtime.calibration) {
      const inputTokens = typeof usage?.input === "number" && Number.isSafeInteger(usage.input) && usage.input >= 0 ? usage.input : undefined;
      const cacheReadTokens = typeof usage?.cacheRead === "number" && Number.isSafeInteger(usage.cacheRead) && usage.cacheRead >= 0 ? usage.cacheRead : undefined;
      runtime.calibration.observe({
        providerId: calibration.providerId,
        modelId: calibration.modelId,
        estimatorVersion: TOKEN_ESTIMATOR_VERSION,
        completedAtMs: Date.now(),
        fullProviderInputIdentity: calibration.fullProviderInputIdentity,
        projectionKnown: runtime.projectionHealthy === true,
        suffixKnown: true,
        toolSurfaceKnown: runtime.providerSurfaces !== undefined,
        reportedPromptTokens: inputTokens !== undefined && cacheReadTokens !== undefined ? inputTokens + cacheReadTokens : undefined,
        baselinePromptTokens: calibration.baselinePromptTokens,
        hasBinaryOrImage: calibration.hasBinaryOrImage,
        overflow: false,
        retry: calibration.ambiguousRequest,
        cancelled: !successful,
        compaction: false,
        cacheSemanticsReconciled: inputTokens !== undefined && cacheReadTokens !== undefined,
      });
    }
    runtime.pendingCalibration = undefined;
    if (successful && runtime.pendingCoolingObservations) {
      const assistantTurnId = digest({ request: runtime.pendingCoolingObservations[0]?.settledRequestId ?? "none", message: event.message });
      runtime.coolingObservations = [
        ...runtime.coolingObservations,
        ...runtime.pendingCoolingObservations.map((identity) => ({ identity, successful: true, assistantTurnId })),
      ].slice(-512);
    }
    runtime.pendingCoolingObservations = undefined;
    const settledState = stateFor(ctx, runtime.config);
    const settledEntries = branch(ctx);
    syncBranchIndex(ctx, runtime, settledState, false);
    installProductionIndexOracle(ctx, runtime, settledState, settledEntries);
    publishStatus(ctx, settledState, runtime);
  });

  pi.on("turn_end", (_event, ctx) => {
    const runtime = initializedRuntimeFor(ctx); if (!runtime) return;
    if (runtime.manualPermit) {
      runtime.manualPermit.state = "invalid";
      runtime.manualPermit = undefined;
    }
    let state = stateFor(ctx, runtime.config); const entries = branch(ctx); const turnId = lastAssistantEntryId(entries);
    if (state.pendingManualTrigger) {
      pi.appendEntry(AILI_COMPACT_ENTRY, transaction(`clear:${state.pendingManualTrigger.id}`, "control", state.epochId, { control: "manual-clear", consumeManualTriggerId: state.pendingManualTrigger.id }));
      state = stateFor(ctx, runtime.config);
    }
    if (!state.enabled || !turnId || runtime.lastAutoTurnId === turnId) {
      syncBranchIndex(ctx, runtime, state, false);
      installProductionIndexOracle(ctx, runtime, state, branch(ctx));
      return;
    }
    if (state.autoCooling) {
      const view = v3ViewFor(ctx, entries, state);
      const candidates = findCoolingCandidates(entries, state, 16, runtime.config, ctx.cwd, runtimeCoolingEvidence(runtime), coolingExcludedEntryIds(view));
      const gain = candidates.reduce((sum, block) => sum + Math.max(0, block.sourceEntryIds.reduce((chars, id) => {
        const entry = entries.find((candidate) => candidate.id === id); return chars + (entry && isRecord(entry.message) ? extractText(entry.message.content).length : 0);
      }, 0) - block.stub!.length), 0);
      if (candidates.length > 0 && gain >= runtime.config.compress.minSavingsChars) {
        const appended = appendV3CoolingTransactions(pi, view, state, entries, candidates, runtime, `auto:${turnId}`);
        if (appended > 0) {
          runtime.lastAutoTurnId = turnId;
          const nextState = stateFor(ctx, runtime.config);
          const nextEntries = branch(ctx);
          syncBranchIndex(ctx, runtime, nextState, false);
          installProductionIndexOracle(ctx, runtime, nextState, nextEntries);
          return;
        }
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
    const nextState = stateFor(ctx, runtime.config);
    const nextEntries = branch(ctx);
    syncBranchIndex(ctx, runtime, nextState, false);
    installProductionIndexOracle(ctx, runtime, nextState, nextEntries);
  });

  pi.on("session_before_compact", (event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    const state = stateFor(ctx, runtime.config);
    // Off is exact host fallthrough: no attempt identity, cache, permit, or
    // coordinator mutation belongs to AILI in this branch.
    if (!state.enabled) return undefined;
    ensureRecoveryRuntime(ctx, runtime, state);
    const tuple = recoveryTuple(ctx, state);
    const observation = runtime.checkpoint.observeBeforeCompact(event.reason, tuple);
    if (observation.adopted) {
      runtime.pressureCycle.markCheckpointScheduled();
      runtime.pressureCycle.markCheckpointInvoked();
    }
    if (event.reason === "overflow") {
      runtime.pressure = observeContextPressure(ctx, true);
    }
    const deterministic = runtime.config.checkpoint.deterministic;
    const checkpointEntries = event.branchEntries as unknown as SessionLikeEntry[];
    const checkpointView = v3ViewFor(ctx, checkpointEntries, state);
    const checkpointModel = ctx.model as unknown as Record<string, unknown> | undefined;
    const result = runtime.checkpointAttempts.evaluate({
      ...tuple,
      reason: event.reason,
      willRetry: event.willRetry,
      preparation: checkpointPreparationIdentity(event.preparation),
      branchEntries: event.branchEntries.map((entry) => checkpointEntryIdentity(entry as unknown as SessionLikeEntry)),
      replayState: checkpointReplayIdentity(state, checkpointView),
      config: checkpointConfigIdentity(runtime.config),
      policy: observation.policy,
      enabled: state.enabled,
      deterministic,
    }, () => planV3CheckpointCoverage({
      replay: checkpointView.replay,
      entries: checkpointEntries,
      firstKeptEntryId: event.preparation.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore,
      currentIdentity: {
        providerId: typeof checkpointModel?.provider === "string" ? checkpointModel.provider : "unavailable",
        modelId: typeof checkpointModel?.id === "string" ? checkpointModel.id : "unavailable",
        estimatorVersion: TOKEN_ESTIMATOR_VERSION,
        projectionVersion: checkpointView.state.projectionVersion,
        qualityEvaluatorVersion: QUALITY_EVALUATOR_VERSION,
      },
      previousSummary: event.preparation.previousSummary,
      maxSummaryChars: runtime.config.compress.summaryHardMaxChars,
    }) ?? planMajorGc({
      entries: checkpointEntries,
      firstKeptEntryId: event.preparation.firstKeptEntryId,
      tokensBefore: event.preparation.tokensBefore,
      previousSummary: event.preparation.previousSummary,
      activeBlocks: activeBlocks(state),
      epochId: state.epochId,
      maxBlockSummaryChars: runtime.config.gc.maxOldSummaryChars,
      maxMergedSummaryChars: runtime.config.compress.summaryHardMaxChars,
    }));
    runtime.deterministicCheckpointEligible = result?.status === "eligible"
      ? "eligible"
      : result?.status === "ineligible" || result?.status === "error"
        ? `ineligible:${result.code}`
        : "not-evaluated";
    // The only custom result is a fully validated envelope. Every other path
    // returns exact undefined so Pi owns its native checkpoint and retry.
    return result?.status === "eligible" ? { compaction: result.compaction } : undefined;
  });

  pi.on("session_compact", (event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    const source = event.fromExtension ? "extension checkpoint" : "Pi native checkpoint";
    const entries = branch(ctx);
    const persistedIndex = entries.findIndex((entry) => entry.id === event.compactionEntry.id);
    const epoch = reconstructCompletedCompactionEpoch({
      cancelled: false,
      compactionEntry: event.compactionEntry as unknown as SessionLikeEntry,
      keptTailEntries: persistedIndex >= 0 ? entries.slice(persistedIndex + 1) : [],
    });
    if (runtime && epoch) {
      const before = runtime.checkpoint.snapshot().tuple;
      const details = (event.compactionEntry as unknown as { details?: unknown }).details;
      const deterministic = event.fromExtension && isRecord(details) && isRecord(details.ailiCompact)
        && (details.ailiCompact.kind === "major-gc" || details.ailiCompact.kind === "major-gc-v3");
      runtime.checkpoint.observeEpoch(before, epoch.epochId, deterministic ? "deterministic" : event.fromExtension ? "unverified" : "native");
      const nextState = stateFor(ctx, runtime.config);
      const nextTuple = recoveryTuple(ctx, nextState);
      runtime.checkpoint.invalidate(nextTuple, "epoch-transition");
      runtime.checkpointAttempts.clear();
      runtime.pressureCycle.resetForEpoch(nextTuple);
      runtime.pressureCycle.markCheckpointTerminal();
      runtime.deterministicCheckpointEligible = "not-evaluated";
      if (runtime.manualPermit) runtime.manualPermit.state = "invalid";
      runtime.manualPermit = undefined;
      runtime.sessionCache = replaySessionCache(entries);
      syncBranchIndex(ctx, runtime, nextState, true);
      installProductionIndexOracle(ctx, runtime, nextState, entries);
    }
    ctx.ui.setStatus("aili-compact", epoch
      ? `AILI Compact: ${source} epoch ${epoch.epochId}`
      : `AILI Compact WARN: completed ${source} epoch could not be reconstructed`);
  });

  pi.on("agent_settled", (_event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (!runtime) return;
    const state = stateFor(ctx, runtime.config);
    syncBranchIndex(ctx, runtime, state, false);
    installProductionIndexOracle(ctx, runtime, state, branch(ctx));
    ensureRecoveryRuntime(ctx, runtime, state);
    runtime.checkpoint.settleWithoutEpoch();
    runtime.pressureCycle.markCheckpointTerminal();
    const pressure = observeContextPressure(ctx, false);
    runtime.pressure = pressure;
    if (pressure.stage === "NORMAL") runtime.pressureCycle.resetForVerifiedDrop(recoveryTuple(ctx, state), pressure);
    const autoRescue = runtime.config.checkpoint.autoRescue;
    if (state.enabled && autoRescue && pressure.stage === "CHECKPOINT_REQUIRED" && ctx.isIdle()) {
      invokeCheckpoint(ctx, runtime, "auto-rescue", "deterministic-first");
    }
    publishStatus(ctx, state, runtime);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    const runtime = initializedRuntimeFor(ctx);
    if (runtime) {
      const state = stateFor(ctx, runtime.config);
      runtime.checkpoint.invalidate(recoveryTuple(ctx, state), "session-shutdown");
      runtime.checkpointAttempts.clear();
      if (runtime.manualPermit) runtime.manualPermit.state = "invalid";
      runtime.manualPermit = undefined;
      runtime.branchIndex.shutdown();
    }
    sessions.delete(ctx.sessionManager.getSessionId());
  });
}

function compactRuntimeDoctor(
  state: CompactState,
  runtime: SessionRuntime,
  licenseErrors: readonly string[] = [],
  view: V3RuntimeView | undefined = runtime.indexedView,
) {
  const telemetry = doctorTelemetryFor(state, runtime, view);
  const reducer = state.diagnostics.length === 0 ? "PASS" : "ERROR";
  const projection = runtime.projectionHealthy === true ? "PASS" : runtime.projectionHealthy === false ? "ERROR" : "UNVERIFIED";
  const config = runtime.configDiagnostics.length === 0 ? "PASS" : "WARN";
  const prompt = runtime.prompt.diagnostics.length === 0 ? "PASS" : "WARN";
  const cache = runtime.telemetry.window.length >= 5 ? "PASS" : "UNVERIFIED";
  const publicRelease = licenseErrors.length === 0 ? "PASS" : "NON_PASS";
  const checkpoint = runtime.checkpoint.snapshot();
  const coordinator = checkpoint.state === "failed" ? "ERROR" : "PASS";
  const repair = telemetry.components.repair.status;
  const planner = telemetry.components.checkpoint.status;
  const quality = telemetry.components.quality.status;
  const index = telemetry.components.index.status;
  const lifecycle = telemetry.components.lifecycle.status;
  const planning = telemetry.components.planning.status;
  const cacheIdentities = telemetry.components.cacheIdentities.status;
  const calibration = telemetry.components.tokenCalibration.status;
  const recap = state.diagnostics.length > 64
    ? "UNVERIFIED"
    : state.diagnostics.some((item) => item.includes("recap")) ? "ERROR" : "PASS";
  const activeSchemaCounts = "activeSchemaBlockCounts" in telemetry.components.lifecycle
    ? telemetry.components.lifecycle.activeSchemaBlockCounts
    : undefined;
  const activeBlockCount = activeSchemaCounts
    ? activeSchemaCounts.v1 + activeSchemaCounts.v2 + activeSchemaCounts.v3
    : "Unverified";
  const recovery = recoveryStatus(runtime, state);
  const status = reducer === "ERROR" || projection === "ERROR" || repair === "ERROR" || coordinator === "ERROR"
      || index === "ERROR" || lifecycle === "ERROR" || recap === "ERROR"
    ? "ERROR"
    : config === "WARN" || prompt === "WARN" || projection === "UNVERIFIED" || repair === "UNVERIFIED"
      || planner === "UNVERIFIED" || cache === "UNVERIFIED" || index === "UNVERIFIED" || index === "WARN"
      || lifecycle === "UNVERIFIED" || quality !== "PASS" || planning !== "PASS" || cacheIdentities === "UNVERIFIED"
      || calibration === "UNVERIFIED" || recap === "UNVERIFIED" || publicRelease === "NON_PASS"
      || telemetry.components.liveProvider.status === "UNVERIFIED" || telemetry.components.hostOrdering.status === "UNVERIFIED"
      ? "NON_PASS" : "PASS";
  return {
    schemaVersion: 2,
    status,
    ...recovery,
    pressureStage: telemetry.pressureStage,
    headroomTokens: telemetry.headroomTokens,
    components: {
      reducer: { status: reducer, diagnosticCount: state.diagnostics.length, diagnosticHash: compactDiagnosticHash(state.diagnostics) },
      repair: telemetry.components.repair,
      reference: {
        status: activeSchemaCounts ? "PASS" : "UNVERIFIED",
        epochHash: digest(state.epochId).slice(0, 16),
        activeBlocks: activeBlockCount,
      },
      projection: { status: projection },
      recap: { status: recap },
      planning: telemetry.components.planning,
      lifecycle: telemetry.components.lifecycle,
      checkpointPlanner: { status: planner, eligibility: runtime.deterministicCheckpointEligible },
      coordinator: { status: coordinator, state: checkpoint.state, inFlight: checkpoint.inFlight },
      checkpoint: telemetry.components.checkpoint,
      epoch: { status: state.epochId.length > 0 ? "PASS" : "ERROR", epochHash: digest(state.epochId).slice(0, 16) },
      config: { status: config, diagnosticCount: runtime.configDiagnostics.length, diagnosticHash: compactDiagnosticHash(runtime.configDiagnostics) },
      prompt: { status: prompt, fileCount: runtime.prompt.fileCount, fingerprint: runtime.prompt.fingerprint?.slice(0, 16) },
      cache: { status: cache, eligibleWindow: runtime.telemetry.window.length, unavailable: runtime.telemetry.unavailable },
      cacheIdentities: telemetry.components.cacheIdentities,
      quality: telemetry.components.quality,
      tokenEconomics: { status: "PASS", policy: runtime.config.tokenEconomics },
      tokenCalibration: telemetry.components.tokenCalibration,
      providerSuffix: { status: runtime.config.providerSuffix.enabled ? "PASS" : "WARN", persisted: false },
      index: telemetry.components.index,
      nativeHook: { status: projection === "PASS" ? "PASS" : projection },
      liveProvider: telemetry.components.liveProvider,
      hostOrdering: telemetry.components.hostOrdering,
      publicRelease: licenseErrors.length === 0
        ? { status: publicRelease, code: "AGPL-3.0-OR-LATER" }
        : { status: publicRelease, code: "LICENSE-EVIDENCE-DRIFT", diagnosticCount: licenseErrors.length, diagnosticHash: compactDiagnosticHash(licenseErrors) },
    },
  };
}

function doctorTelemetryFor(state: CompactState, runtime: SessionRuntime, view: V3RuntimeView | undefined = runtime.indexedView) {
  const v3Diagnostics = view?.replay.diagnostics ?? [];
  return buildCompactDoctorTelemetry({
    config: runtime.config,
    legacyState: state,
    ...(view ? {
      v3: {
        blocks: view.state.blocks,
        acceptedTransactionCount: view.replay.acceptedTransactionCount,
        diagnosticCount: v3Diagnostics.length,
        diagnosticHash: compactDiagnosticHash(v3Diagnostics.map((item) => `${item.phase}:${item.code}:${item.path}`)),
      },
    } : {}),
    pressure: runtime.pressure,
    checkpoint: runtime.checkpoint.snapshot(),
    deterministicCheckpointEligible: runtime.deterministicCheckpointEligible,
    branchIndexHealthy: runtime.branchIndexHealthy,
    branchIndexDiagnostic: runtime.branchIndexDiagnostic,
    branchIndexCounters: runtime.branchIndex.counters(),
    cache: runtime.telemetry,
    providerSurfaces: runtime.providerSurfaces,
    calibration: runtime.calibration?.snapshot(),
    repairVerified: runtime.legacyRepairStatus ? true : "Unverified",
  });
}

function compactDiagnosticHash(values: readonly string[]): string {
  return digest({
    count: values.length,
    sample: values.slice(0, 64).map((value) => ({ length: value.length, prefix: value.slice(0, 256) })),
  }).slice(0, 16);
}

export function diagnosticsFor(ctx: ExtensionContext, runtime?: SessionRuntime): AiliCompactDiagnostics {
  const loaded = runtime ? undefined : loadCompactConfigResult(ctx.cwd);
  const config = runtime?.config ?? loaded!.config;
  const initialState = runtime?.indexedState ?? stateFor(ctx, config);
  let current: SessionRuntime;
  if (runtime) {
    current = runtime;
  } else {
    const tuple = recoveryTuple(ctx, initialState);
    current = {
      telemetry: emptyCacheTelemetry(),
      sessionCache: replaySessionCache(branch(ctx)),
      config,
      configDiagnostics: loaded!.diagnostics,
      prompt: loadCompactPromptSnapshot(ctx.cwd, config),
      checkpoint: new CheckpointCoordinator(tuple),
      checkpointAttempts: new CheckpointAttemptCache(),
      pressureCycle: new PressureCycle(tuple),
      deterministicCheckpointEligible: "not-evaluated",
      manualRequestSerial: 0,
      branchIndex: new BranchIndexCache(config.index.snapshotLru),
      branchIndexHealthy: "Unverified",
      coolingObservations: [],
      providerRequestSerial: 0,
      branchIndexEntryOffset: 0,
      indexedSourceOwnerByEntryId: new Map(),
      indexedPlanningRefs: new Map(),
      indexedCandidateByRef: new Map(),
      indexedProtectionEntryCount: 0,
      indexedProtectedEntryIds: new Set(),
      indexedProtectionReasonsByEntryId: new Map(),
    };
  }
  const state = current.indexedState ?? stateFor(ctx, current.config);
  const diagnosticEntries = current.indexedState ? undefined : branch(ctx);
  const diagnosticView = current.indexedView
    ?? (diagnosticEntries ? v3ViewFor(ctx, diagnosticEntries, state) : undefined);
  const candidate = state.enabled && diagnosticEntries
    ? findCoolingCandidates(diagnosticEntries, state, 1, current.config, ctx.cwd, runtimeCoolingEvidence(current), diagnosticView ? coolingExcludedEntryIds(diagnosticView) : undefined)[0]
    : undefined;
  const candidateSummary = current.indexedCoolingCandidate
    ?? (candidate ? { idHash: digest(candidate.id).slice(0, 16), sourceCount: candidate.sourceEntryIds.length } : undefined);
  const checkpoint = current.checkpoint.snapshot();
  const doctor = doctorTelemetryFor(state, current, diagnosticView);
  return {
    enabled: state.enabled,
    autoCooling: state.autoCooling,
    manualMode: state.manualMode,
    epochId: state.epochId,
    activeBlocks: activeBlocks(state).length,
    ...(candidateSummary ? { coolingCandidate: candidateSummary } : {}),
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
    pressureStage: doctor.pressureStage,
    headroomTokens: doctor.headroomTokens,
    checkpointCoordinatorState: checkpoint.state,
    checkpointInFlight: checkpoint.inFlight,
    deterministicCheckpointEligible: current.deterministicCheckpointEligible,
    nativeAutomaticFallback: "Unverified-effective",
    nativeAutomaticFallbackProvenance: "Unverified",
    lastRecoveryErrorCode: checkpoint.lastErrorCode ?? null,
    deterministicCheckpointCount: checkpoint.deterministicCheckpointCount,
    nativeFallbackCount: checkpoint.nativeFallbackCount,
    rescueCount: checkpoint.rescueCount,
    repairTransactionCount: state.repairTransactionCount ?? 0,
    legacyRepairStatus: current.legacyRepairStatus ?? "Unverified",
    quality: {
      enabled: current.config.quality.enabled,
      warningPolicy: current.config.quality.warningPolicy,
      acceptedBlocks: [...state.blocks.values()].filter((block) => block.qualityEvidence?.verdict === "pass" || block.qualityEvidence?.verdict === "pass-with-warnings").length,
      unevaluatedBlocks: [...state.blocks.values()].filter((block) => block.kind === "semantic" && !block.qualityEvidence).length,
    },
    index: {
      enabled: current.config.index.enabled,
      healthy: current.branchIndexHealthy,
      ...(current.branchIndexDiagnostic ? { diagnostic: current.branchIndexDiagnostic } : {}),
      counters: current.branchIndex.counters(),
    },
    providerIdentities: {
      static: current.providerSurfaces?.staticSurfaceIdentity,
      logicalPrefix: current.providerSurfaces?.logicalProviderPrefixIdentity,
      suffix: current.providerSurfaces?.suffixFingerprint,
      full: current.providerSurfaces?.fullProviderInputIdentity,
    },
    tokenCalibration: current.calibration?.snapshot() ?? "Unverified",
    doctor: doctor.components,
  };
}

function stateFor(ctx: Pick<ExtensionContext, "sessionManager" | "cwd">, config = loadCompactConfig(ctx.cwd)): CompactState {
  return applyCompactConfig(reduceCompactState(branch(ctx)), config);
}

function v3ViewFor(
  ctx: Pick<ExtensionContext, "sessionManager">,
  entries: readonly SessionLikeEntry[],
  state: CompactState,
): V3RuntimeView {
  return buildV3RuntimeView(entries, state, {
    sessionId: ctx.sessionManager.getSessionId(),
    sessionPath: typeof ctx.sessionManager.getSessionFile === "function"
      ? ctx.sessionManager.getSessionFile() ?? undefined
      : undefined,
  });
}

async function executeV3Compact(
  pi: ExtensionAPI,
  toolCallId: string,
  params: PublicCompactParams,
  ctx: ExtensionContext,
  runtime: SessionRuntime,
  entries: readonly SessionLikeEntry[],
  legacyState: CompactState,
) {
  const guard = mutationGuard(entries, toolCallId, "aili_compact");
  if (!guard.soleCall) {
    return error(canonicalJson({
      code: "sole-call-required",
      siblingToolNames: [...new Set(guard.siblingToolNames)].slice(0, 16),
    }));
  }
  if (!legacyState.enabled) return error(canonicalJson({ code: "compact-disabled" }));

  ensureRecoveryRuntime(ctx, runtime, legacyState);
  const view = v3ViewFor(ctx, entries, legacyState);
  if (view.replay.diagnostics.length > 0) {
    return error(canonicalJson({
      code: "v3-replay-unhealthy",
      diagnostics: view.replay.diagnostics.slice(0, 8).map(({ phase, code, path }) => ({ phase, code, path })),
    }));
  }
  const safePlan = buildCurrentSafePlan(entries, legacyState, runtime, ctx, view);
  const pressure = runtime.pressure ?? observeContextPressure(ctx, false);
  runtime.pressure = pressure;
  if (pressure.stage === "CHECKPOINT_REQUIRED" || pressure.stage === "OVERFLOW_RECOVERY") {
    return error(canonicalJson({ code: "pressure-stage-disallows-semantic", pressureStage: pressure.stage }));
  }
  if (pressure.stage !== "NORMAL" && !runtime.pressureCycle.markSemanticAttempted()) {
    return error(canonicalJson({ code: "semantic-attempt-exhausted", pressureStage: pressure.stage }));
  }

  const createdAt = Date.now();
  const createdTurnOrdinal = entries.filter((entry) => entry.type === "message"
    && isRecord(entry.message) && entry.message.role === "user").length;
  const blockId = `semantic:${digest({ toolCallId, catalogId: view.catalog.catalogId, summary: compactSummary(params) }).slice(0, 48)}`;
  const runId = `run:${digest({ toolCallId, createdTurnOrdinal }).slice(0, 48)}`;
  const summaryMaxChars = params.summaryMaxChars ?? runtime.config.compress.summaryMaxChars;
  const commonFailure = validatePublicCompactParams(params, summaryMaxChars, runtime.config.compress.summaryHardMaxChars);
  if (commonFailure) return error(canonicalJson({ code: "invalid-request", path: commonFailure }));

  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  const providerId = typeof model?.provider === "string" ? model.provider : undefined;
  const modelId = typeof model?.id === "string" ? model.id : undefined;
  const tokenProfile = resolveTokenBoundProfile(
    providerId,
    modelId,
    TOKEN_ESTIMATOR_VERSION,
    runtimeTokenProfiles(runtime, providerId, modelId),
  );
  const identity = buildQualityIdentityContext({
    entries,
    sessionId: view.state.sessionId,
    branchLeafId: view.state.branchLeafId,
    epochId: view.state.epochId,
    sessionPath: typeof ctx.sessionManager.getSessionFile === "function"
      ? ctx.sessionManager.getSessionFile() ?? undefined
      : undefined,
  });
  const plannerContext: V3MutationPlannerContext = {
    state: view.state,
    catalog: view.mutationCatalog,
    safePlan,
    protectedIntervals: protectedV3Intervals(entries, safePlan, view),
    legacyBlockIds: new Set(legacyState.blocks.keys()),
    restillEnabled: runtime.config.tiers.enabled && runtime.config.tiers.restill.enabled,
    restillPolicy: runtime.config.tiers.restill,
  };

  if (params.mode === "blocks") {
    const selected = resolveV3CompactChildren(params.blockRefs, view);
    if (!selected.ok) return error(canonicalJson(selected.failure));
    const childTier = selected.children[0]!.block.tier;
    const targetTier: "T2" | "T3" = childTier === "T1" ? "T2" : "T3";
    const orderedRefs = selected.children.map(({ blockRef }) => blockRef);
    const sourceDigest = v3BlockSourceDigest(view.catalog.catalogId, selected.children.map(({ block }) => block));
    let quality: V3QualityGate;
    try {
      quality = evaluateV3QualityGate(runtime, {
        version: 1,
        tier: targetTier,
        catalogId: view.catalog.catalogId,
        sourceKind: "blocks",
        orderedRefs,
        sourceDigest,
        summary: params.summary,
      }, freezeBlockQualitySource({
        children: selected.children,
        catalogId: view.catalog.catalogId,
        sourceDigest,
        canonicalSessionPathDigest: identity.canonicalSessionPathDigest,
        branchLeafId: view.state.branchLeafId,
        epochId: view.state.epochId,
      }), identity);
    } catch {
      return error(redactedQualityFailure(view.catalog.catalogId, targetTier, orderedRefs, ["extractor-error"]));
    }
    if (!quality.ok) return error(quality.output);
    const firstOrdinal = selected.children[0]!.block.firstLeafOrdinal;
    const candidateRef = predictV3BlockReference(view, firstOrdinal, createdAt, blockId);
    const outputSurface = compactSuccessSurface(view.catalog.catalogId, targetTier, orderedRefs, params.summary);
    const candidate: V3CompactEconomicsInput["candidate"] = {
      blockId,
      blockRef: candidateRef,
      catalogId: view.catalog.catalogId,
      epochId: view.state.epochId,
      projectionVersion: view.state.projectionVersion,
      topic: params.topic,
      summary: params.summary,
      tier: targetTier,
      source: { kind: "blocks", sourceDigest, children: selected.children },
    };
    const oneTime = compactOneTimeSurfaces(toolCallId, params, outputSurface, quality.surface, {
      catalogId: view.catalog.catalogId,
      sourceKind: "blocks",
      orderedRefs,
      sourceDigest,
    });
    const economics = await evaluateRuntimeV3CompactEconomics(ctx.model, {
      candidate,
      profile: tokenProfile,
      pressureStage: pressure.stage,
      oneTime,
      providerSuffix: runtime.providerSuffix,
      policy: runtime.config.tokenEconomics,
    });
    if (!economics.ok) {
      return error(canonicalJson({ code: "token-benefit-unavailable", reason: economics.reason, diagnostic: economics.diagnostic }));
    }
    if (!economics.decision.eligible) {
      return error(canonicalJson({
        code: "token-benefit-ineligible",
        tier: targetTier,
        pressureStage: pressure.stage,
        reasons: economics.decision.reasons,
      }));
    }
    const planned = planV3BlockMutation({
      operation: "compact",
      mode: "blocks",
      catalogId: view.catalog.catalogId,
      transactionId: toolCallId,
      blockId,
      blockRefs: orderedRefs,
      topic: params.topic,
      summary: params.summary,
      summaryMaxChars,
      runId,
      createdAt,
      createdTurnOrdinal,
      benefit: {
        sourceDigest: economics.binding.sourceDigest,
        summaryDigest: economics.binding.summaryDigest,
        orderedRefs: economics.binding.orderedRefs,
        decision: economics.decision,
        tokens: economics.tokens,
      },
      quality: quality.evidence,
    }, plannerContext);
    if (!planned.ok) return error(renderV3MutationFailure(planned));
    return appendV3CompactTransaction(pi, runtime, outputSurface, planned.transaction);
  }

  if (params.mode === "range" && params.ranges.length !== 1) {
    return error(canonicalJson({ code: "invalid-request", path: "$.ranges", message: "v3 T1 requires one exact safe range." }));
  }
  const summary = compactSummary(params);
  const scope = params.mode === "range"
    ? {
      mode: "range" as const,
      catalogId: params.catalogId,
      startRef: params.ranges[0]!.startRef,
      endRef: params.ranges[0]!.endRef,
    }
    : {
      mode: "message" as const,
      catalogId: params.catalogId,
      messageRefs: params.items.map(({ messageRef }) => messageRef),
    };
  const verified = verifyExactMutationScope(safePlan, scope);
  if (!verified.ok) {
    return error(canonicalJson({
      code: verified.code,
      catalogId: safePlan.catalogId,
      freshRanges: verified.freshRanges,
    }));
  }
  const range = verified.range;
  let quality: V3QualityGate;
  try {
    const qualityInput: QualityInputV1 = {
      version: 1,
      tier: "T1",
      catalogId: view.catalog.catalogId,
      sourceKind: "messages",
      orderedRefs: [...range.orderedRefs],
      sourceDigest: range.sourceDigest,
      summary,
    };
    quality = evaluateV3QualityGate(runtime, qualityInput, freezeMessageQualitySource({
      entries,
      orderedEntryIds: range.orderedEntryIds,
      orderedRefs: range.orderedRefs,
      catalogId: view.catalog.catalogId,
      sourceDigest: range.sourceDigest,
      branchLeafId: view.state.branchLeafId,
      epochId: view.state.epochId,
    }), identity);
  } catch {
    return error(redactedQualityFailure(view.catalog.catalogId, "T1", range.orderedRefs, ["extractor-error"]));
  }
  if (!quality.ok) return error(quality.output);
  const firstMessage = view.mutationCatalog.messageRefs.find(({ ref }) => ref === range.orderedRefs[0]);
  if (!firstMessage || !Number.isSafeInteger(firstMessage.effectiveSourceOrdinal)) {
    return error(canonicalJson({ code: "stale-ref", freshRefs: range.orderedRefs.slice(0, 8) }));
  }
  const candidateRef = predictV3BlockReference(view, firstMessage.effectiveSourceOrdinal, createdAt, blockId);
  const outputSurface = compactSuccessSurface(view.catalog.catalogId, "T1", range.orderedRefs, summary);
  const candidate: V3CompactEconomicsInput["candidate"] = {
    blockId,
    blockRef: candidateRef,
    catalogId: view.catalog.catalogId,
    epochId: view.state.epochId,
    projectionVersion: view.state.projectionVersion,
    topic: params.topic,
    summary,
    tier: "T1",
    source: { kind: "messages", range },
  };
  const oneTime = compactOneTimeSurfaces(toolCallId, params, outputSurface, quality.surface, {
    catalogId: view.catalog.catalogId,
    scopeDigest: range.scopeDigest,
    sourceDigest: range.sourceDigest,
    sourceKind: "messages",
    orderedRefs: range.orderedRefs,
    tokenBounds: range.tokenBounds,
  });
  const economics = await evaluateRuntimeV3CompactEconomics(ctx.model, {
    candidate,
    profile: tokenProfile,
    pressureStage: pressure.stage,
    oneTime,
    providerSuffix: runtime.providerSuffix,
    policy: runtime.config.tokenEconomics,
  });
  if (!economics.ok) {
    return error(canonicalJson({ code: "token-benefit-unavailable", reason: economics.reason, diagnostic: economics.diagnostic }));
  }
  if (!economics.decision.eligible) {
    return error(canonicalJson({
      code: "token-benefit-ineligible",
      tier: "T1",
      pressureStage: pressure.stage,
      reasons: economics.decision.reasons,
    }));
  }
  const planned = planV3MessageMutation({
    operation: "compact",
    ...scope,
    transactionId: toolCallId,
    blockId,
    topic: params.topic,
    summary,
    summaryMaxChars,
    runId,
    createdAt,
    createdTurnOrdinal,
    benefit: {
      sourceDigest: economics.binding.sourceDigest,
      summaryDigest: economics.binding.summaryDigest,
      orderedRefs: economics.binding.orderedRefs,
      decision: economics.decision,
      tokens: economics.tokens,
    },
    quality: quality.evidence,
  }, plannerContext);
  if (!planned.ok) return error(renderV3MutationFailure(planned));
  return appendV3CompactTransaction(pi, runtime, outputSurface, planned.transaction);
}

function executeDecompress(
  pi: ExtensionAPI,
  toolCallId: string,
  params: { catalogId: string; blockRefs: string[]; depth?: "one" | "raw" },
  ctx: ExtensionContext,
  runtime: SessionRuntime,
  entries: readonly SessionLikeEntry[],
  legacyState: CompactState,
) {
  const guard = mutationGuard(entries, toolCallId, "aili_decompress");
  if (!guard.soleCall) {
    return error(canonicalJson({
      code: "sole-call-required",
      siblingToolNames: [...new Set(guard.siblingToolNames)].slice(0, 16),
    }));
  }
  if (!legacyState.enabled) return error(canonicalJson({ code: "compact-disabled" }));
  const view = v3ViewFor(ctx, entries, legacyState);
  if (params.catalogId !== view.catalog.catalogId) {
    return error(canonicalJson({
      code: "stale-catalog",
      catalogId: view.catalog.catalogId,
      freshRefs: view.catalog.blocks.filter(({ active, queryOnly }) => active && !queryOnly).slice(0, 8).map(({ ref }) => ref),
    }));
  }
  if (params.blockRefs.length < 1 || params.blockRefs.length > 16
    || new Set(params.blockRefs).size !== params.blockRefs.length) {
    return error(canonicalJson({ code: "invalid-request", path: "$.blockRefs" }));
  }
  const references = params.blockRefs.map((ref) => view.blockByRef.get(ref));
  if (references.some((reference) => !reference)) {
    return error(canonicalJson({ code: "stale-ref", path: "$.blockRefs" }));
  }
  const families = new Set(references.map((reference) => reference!.family));
  if (families.size !== 1) {
    return error(canonicalJson({ code: "mixed-schema-roots", path: "$.blockRefs" }));
  }
  if (families.has("legacy")) {
    const legacyRefs = params.blockRefs.map((ref) => view.legacyRefByCombinedRef.get(ref));
    if (legacyRefs.some((ref) => !ref)) return error(canonicalJson({ code: "stale-ref", path: "$.blockRefs" }));
    const planned = planDecompression({
      transactionId: toolCallId,
      catalogId: view.legacyCatalog.catalogId,
      blockRefs: legacyRefs as string[],
    }, { entries, state: legacyState, guard });
    if (!planned.ok) return error(renderMutationFailure(planned));
    return success(canonicalJson({
      version: 2,
      status: "decompressed",
      depth: "raw",
      restored: params.blockRefs,
      preview: planned.value.preview,
    }), planned.value.transaction);
  }
  if (view.replay.diagnostics.length > 0) {
    return error(canonicalJson({
      code: "v3-replay-unhealthy",
      diagnostics: view.replay.diagnostics.slice(0, 8).map(({ phase, code, path }) => ({ phase, code, path })),
    }));
  }
  const planned = planV3DecompressMutation({
    operation: "decompress",
    catalogId: params.catalogId,
    transactionId: toolCallId,
    blockRefs: params.blockRefs,
    provenanceId: toolCallId,
    createdAt: Date.now(),
    depth: params.depth ?? "one",
  }, {
    state: view.state,
    catalog: view.mutationCatalog,
    legacyBlockIds: new Set(legacyState.blocks.keys()),
  });
  if (!planned.ok) return error(renderV3MutationFailure(planned));
  try {
    pi.appendEntry(AILI_COMPACT_ENTRY, planned.transaction);
  } catch {
    return error(canonicalJson({ code: "append-failed" }));
  }
  runtime.safePlan = undefined;
  runtime.providerSuffix = undefined;
  runtime.providerSuffixContent = undefined;
  return success(canonicalJson({
    version: 3,
    status: "decompressed",
    depth: params.depth ?? "one",
    restored: planned.orderedRefs,
    refreshStatus: true,
  }), planned.transaction);
}

type CommandBlockOperation = {
  operation: "decompress";
  transactionId: string;
  catalogId: string;
  blockRefs: readonly string[];
  depth: "one" | "raw";
} | {
  operation: "recompress";
  transactionId: string;
  catalogId: string;
  blockRefs: readonly string[];
};

function applyCommandBlockOperation(
  pi: ExtensionAPI,
  request: CommandBlockOperation,
  view: V3RuntimeView,
  entries: readonly SessionLikeEntry[],
  legacyState: CompactState,
): { ok: true } | { ok: false; message: string } {
  if (request.catalogId !== view.catalog.catalogId) {
    return { ok: false, message: "stale-catalog: refresh /aili-compact context before retrying." };
  }
  const references = request.blockRefs.map((ref) => view.blockByRef.get(ref));
  if (references.some((reference) => !reference)) return { ok: false, message: "stale-ref: one or more block references are no longer current." };
  const families = new Set(references.map((reference) => reference!.family));
  if (families.size !== 1) return { ok: false, message: "mixed-schema-roots: one command cannot mix legacy and v3 roots." };
  try {
    if (families.has("legacy")) {
      const legacyRefs = request.blockRefs.map((ref) => view.legacyRefByCombinedRef.get(ref));
      if (legacyRefs.some((ref) => !ref)) return { ok: false, message: "stale-ref: legacy reference translation failed." };
      const legacyRequest = {
        transactionId: request.transactionId,
        catalogId: view.legacyCatalog.catalogId,
        blockRefs: legacyRefs as string[],
      };
      if (request.operation === "decompress") {
        const planned = planDecompression(legacyRequest, { entries, state: legacyState });
        if (!planned.ok) return { ok: false, message: renderMutationFailure(planned) };
        pi.appendEntry(AILI_COMPACT_ENTRY, planned.value.transaction);
      } else {
        const planned = planRecompression(legacyRequest, { entries, state: legacyState });
        if (!planned.ok) return { ok: false, message: renderMutationFailure(planned) };
        pi.appendEntry(AILI_COMPACT_ENTRY, planned.value.control);
      }
      return { ok: true };
    }
    if (view.replay.diagnostics.length > 0) return { ok: false, message: "v3-replay-unhealthy: mutation refused." };
    const context: V3MutationPlannerContext = {
      state: view.state,
      catalog: view.mutationCatalog,
      legacyBlockIds: new Set(legacyState.blocks.keys()),
    };
    if (request.operation === "decompress") {
      const planned = planV3DecompressMutation({
        operation: "decompress",
        catalogId: request.catalogId,
        transactionId: request.transactionId,
        blockRefs: request.blockRefs,
        provenanceId: request.transactionId,
        createdAt: Date.now(),
        depth: request.depth,
      }, context);
      if (!planned.ok) return { ok: false, message: renderV3MutationFailure(planned) };
      pi.appendEntry(AILI_COMPACT_ENTRY, planned.transaction);
      return { ok: true };
    }
    const transactions = new Set(request.blockRefs.flatMap((ref) => {
      const reference = view.blockByRef.get(ref);
      const transactionId = reference ? view.state.blocks.get(reference.blockId)?.explicitDecompression?.transactionId : undefined;
      return transactionId ? [transactionId] : [];
    }));
    if (transactions.size !== 1) return { ok: false, message: "provenance-mismatch: roots do not share one exact decompression transaction." };
    const planned = planV3RecompressMutation({
      operation: "recompress",
      catalogId: request.catalogId,
      transactionId: request.transactionId,
      blockRefs: request.blockRefs,
      provenanceId: request.transactionId,
      createdAt: Date.now(),
      decompressionTransactionId: [...transactions][0]!,
    }, context);
    if (!planned.ok) return { ok: false, message: renderV3MutationFailure(planned) };
    pi.appendEntry(AILI_COMPACT_ENTRY, planned.transaction);
    return { ok: true };
  } catch {
    return { ok: false, message: "append-failed: no additional operation was attempted." };
  }
}

/**
 * Record the accepted v3 control arm before its legacy compatibility record.
 * The legacy record remains authoritative for the v1/v2 settings reader until
 * old-session rollback support can be removed; restore-all is applied by both
 * reducers so neither schema family can keep semantic coverage active.
 */
function appendV3Control(
  pi: ExtensionAPI,
  view: V3RuntimeView,
  legacyState: CompactState,
  transactionId: string,
  action: "on" | "off" | "restore-all" | "panel-on" | "panel-off" | "manual-on" | "manual-off" | "manual-trigger" | "manual-clear",
  provenanceKind: "explicit-user" | "automatic",
): boolean {
  if (view.replay.diagnostics.length > 0) return false;
  const planned = planV3ControlMutation({
    operation: "control",
    catalogId: view.catalog.catalogId,
    transactionId,
    action,
    provenanceId: transactionId,
    provenanceKind,
    createdAt: Date.now(),
  }, {
    state: view.state,
    catalog: view.mutationCatalog,
    legacyBlockIds: new Set(legacyState.blocks.keys()),
  });
  if (!planned.ok) return false;
  try {
    pi.appendEntry(AILI_COMPACT_ENTRY, planned.transaction);
    return true;
  } catch {
    return false;
  }
}

function appendV3CoolingTransactions(
  pi: ExtensionAPI,
  view: V3RuntimeView,
  legacyState: CompactState,
  entries: readonly SessionLikeEntry[],
  blocks: readonly CompactBlock[],
  runtime: SessionRuntime,
  transactionPrefix: string,
): number {
  if (view.replay.diagnostics.length > 0) return 0;
  const activeV3Sources = new Set(view.replay.maximalActiveBlocks
    .flatMap((block) => v3LeafEntryIds(view.state, block.blockId)));
  const alreadyCooled = new Set(view.state.cooling.flatMap((cooling) => cooling.targetEntryIds));
  let state = view.state;
  let catalog = { ...view.mutationCatalog };
  let appended = 0;
  for (const block of blocks) {
    const resultEntryId = block.sourceEntryIds.length === 1 ? block.sourceEntryIds[0] : undefined;
    if (!resultEntryId || activeV3Sources.has(resultEntryId) || alreadyCooled.has(resultEntryId)) continue;
    const entry = entries.find((candidate) => candidate.id === resultEntryId);
    if (!entry || entry.type !== "message" || !isRecord(entry.message)
      || entry.message.role !== "toolResult" || typeof entry.message.toolName !== "string"
      || typeof entry.message.toolCallId !== "string") continue;
    const resultMessage = entry.message;
    const resultToolName = resultMessage.toolName as string;
    const resultToolCallId = resultMessage.toolCallId as string;
    const normalizedExactToolName = resultToolName.trim().toLocaleLowerCase("en-US");
    const observation = [...runtime.coolingObservations].reverse().find((candidate) => candidate.successful
      && candidate.identity.sessionId === state.sessionId
      && candidate.identity.branchLeafId === state.branchLeafId
      && candidate.identity.epochId === state.epochId
      && candidate.identity.resultEntryId === resultEntryId
      && candidate.identity.callId === resultToolCallId
      && candidate.identity.toolName.trim().toLocaleLowerCase("en-US") === normalizedExactToolName
      && candidate.identity.resultBodyDigest === digest(extractText(resultMessage.content)));
    if (!observation) continue;
    const profile = resolveToolCoolingPolicy(normalizedExactToolName).policy.profile;
    if (profile !== "retrieval" && profile !== "execution-evidence" && profile !== "mutation-evidence") continue;
    const provenance = {
      kind: "provider-observation" as const,
      sessionId: observation.identity.sessionId,
      branchLeafId: observation.identity.branchLeafId,
      epochId: observation.identity.epochId,
      callEntryId: observation.identity.callEntryId,
      callId: observation.identity.callId,
      normalizedExactToolName,
      resultEntryId: observation.identity.resultEntryId,
      resultBodyDigest: observation.identity.resultBodyDigest,
      providerInputIdentity: observation.identity.providerInputIdentity,
      settledRequestId: observation.identity.settledRequestId,
    };
    const transactionId = `${transactionPrefix}:${digest({ resultEntryId, observation: provenance }).slice(0, 32)}`;
    const context: V3MutationPlannerContext = {
      state,
      catalog,
      legacyBlockIds: new Set(legacyState.blocks.keys()),
    };
    const planned = planV3CoolingMutation({
      operation: "cooling",
      catalogId: catalog.catalogId,
      transactionId,
      targetEntryIds: [resultEntryId],
      profile,
      profileVersion: TOOL_COOLING_PROFILE_VERSION,
      provenance,
      reason: "cool",
      createdAt: Date.now() + appended,
    }, context);
    if (!planned.ok) continue;
    try {
      pi.appendEntry(AILI_COMPACT_ENTRY, planned.transaction);
    } catch {
      break;
    }
    const applied = applyV3Transaction(state, planned.transaction, {
      legacyBlockIds: context.legacyBlockIds,
      expectedCatalogId: catalog.catalogId,
    });
    if (!applied.ok) break;
    state = applied.value.state;
    const publicCatalogId = deriveRuntimeCatalogId({
      stateCatalogId: state.catalogId,
      epochId: state.epochId,
      messages: view.catalog.messages.map((message) => ({
        ref: message.ref,
        entryId: message.entryId,
        atomEntryIds: message.atomEntryIds,
      })),
      blocks: view.catalog.blocks.map((candidate) => ({
        ref: candidate.ref,
        blockId: candidate.blockId,
        family: candidate.family,
        active: candidate.active,
        queryOnly: candidate.queryOnly,
      })),
    });
    catalog = { ...catalog, catalogId: publicCatalogId, stateCatalogId: state.catalogId };
    alreadyCooled.add(resultEntryId);
    appended += 1;
  }
  return appended;
}

type V3QualityGate = {
  ok: true;
  evidence: V3QualityEvidence;
  surface: unknown;
} | {
  ok: false;
  output: string;
};

function evaluateV3QualityGate(
  runtime: SessionRuntime,
  input: QualityInputV1,
  frozen: FrozenQualitySourceV1,
  identity = buildQualityIdentityContext({
    entries: [],
    sessionId: "unavailable",
    branchLeafId: "unavailable",
    epochId: "unavailable",
  }),
): V3QualityGate {
  if (!runtime.config.quality.enabled) {
    return {
      ok: true,
      evidence: { override: "quality-disabled" },
      surface: { status: "unevaluated", override: "quality-disabled" },
    };
  }
  const result = assessQuality(input, frozen, identity);
  const warningRejected = result.verdict === "pass-with-warnings" && runtime.config.quality.warningPolicy === "reject";
  if (result.verdict === "reject" || warningRejected) {
    return {
      ok: false,
      output: redactedQualityFailure(input.catalogId, input.tier, input.orderedRefs, result.codes, result.counts),
    };
  }
  return { ok: true, evidence: { input, result }, surface: result };
}

function redactedQualityFailure(
  catalogId: string,
  tier: QualityTier,
  orderedRefs: readonly string[],
  codes: readonly string[],
  counts?: unknown,
): string {
  return canonicalJson({
    code: "quality-rejected",
    evaluatorVersion: "aili-quality-evaluator-v1",
    tier,
    catalogId,
    refs: orderedRefs.slice(0, 8),
    codes: [...new Set(codes)].slice(0, 16),
    ...(counts === undefined ? {} : { counts }),
  });
}

function compactSummary(params: PublicCompactParams): string {
  if (params.mode === "range") return params.ranges.map(({ summary }) => summary).join("\n\n");
  if (params.mode === "blocks") return params.summary;
  return params.items.length === 1
    ? params.items[0]!.summary
    : params.items.map(({ topic, summary }) => `[${topic}]\n${summary}`).join("\n\n");
}

function validatePublicCompactParams(
  params: PublicCompactParams,
  summaryMaxChars: number,
  summaryHardMaxChars: number,
): string | undefined {
  const summary = compactSummary(params);
  if (params.catalogId.length !== 64) return "$.catalogId";
  if (params.topic.length < 1 || params.topic.length > 200) return "$.topic";
  if (!Number.isSafeInteger(summaryMaxChars) || summaryMaxChars < 256 || summaryMaxChars > 10_000) return "$.summaryMaxChars";
  if (summary.length < 1 || summary.length > summaryMaxChars || summary.length > summaryHardMaxChars) return "$.summary";
  if (params.mode === "message" && (params.items.length < 1 || params.items.length > 16)) return "$.items";
  if (params.mode === "range" && (params.ranges.length < 1 || params.ranges.length > 16)) return "$.ranges";
  if (params.mode === "blocks" && (params.blockRefs.length < 2 || params.blockRefs.length > 16)) return "$.blockRefs";
  return undefined;
}

function resolveV3CompactChildren(
  requestedRefs: readonly string[],
  view: V3RuntimeView,
): { ok: true; children: Array<{ blockRef: string; block: V3SemanticBlock }> }
  | { ok: false; failure: { code: string; path: string; freshRefs: readonly string[] } } {
  if (new Set(requestedRefs).size !== requestedRefs.length) {
    return { ok: false, failure: { code: "duplicate-ref", path: "$.blockRefs", freshRefs: [] } };
  }
  const catalogByRef = new Map(view.mutationCatalog.blockRefs.map((item) => [item.ref, item]));
  const children: Array<{ blockRef: string; block: V3SemanticBlock }> = [];
  for (const blockRef of requestedRefs) {
    const catalog = catalogByRef.get(blockRef);
    if (!catalog || catalog.legacy) {
      return {
        ok: false,
        failure: {
          code: catalog?.legacy ? "legacy-block" : "stale-ref",
          path: "$.blockRefs",
          freshRefs: view.mutationCatalog.blockRefs.filter((item) => !item.legacy).slice(0, 8).map((item) => item.ref),
        },
      };
    }
    const block = view.state.blocks.get(catalog.blockId);
    if (!block) return { ok: false, failure: { code: "stale-ref", path: "$.blockRefs", freshRefs: [] } };
    children.push({ blockRef, block });
  }
  children.sort((left, right) => left.block.firstLeafOrdinal - right.block.firstLeafOrdinal
    || left.block.blockId.localeCompare(right.block.blockId));
  return { ok: true, children };
}

function compactSuccessSurface(
  catalogId: string,
  tier: QualityTier,
  orderedRefs: readonly string[],
  summary: string,
) {
  return {
    version: 3,
    status: "created",
    tier,
    catalogId,
    sourceRefCount: orderedRefs.length,
    sourceDigest: digest(orderedRefs),
    summaryDigest: v3SummaryDigest(summary),
    refreshStatus: true,
  } as const;
}

function compactOneTimeSurfaces(
  toolCallId: string,
  params: PublicCompactParams,
  outputSurface: unknown,
  qualityEvaluation: unknown,
  discoveryStatusInput: unknown,
): V3OneTimeEconomicsSurfaces {
  const outputText = canonicalJson(outputSurface);
  return {
    discoveryStatusInput: {
      role: "toolResult",
      toolName: "aili_compact_status",
      content: [{ type: "text", text: canonicalJson(discoveryStatusInput) }],
    },
    compressionToolCall: {
      role: "assistant",
      content: [{ type: "toolCall", id: toolCallId, name: "aili_compact", arguments: params }],
    },
    compressionToolResult: {
      role: "toolResult",
      toolCallId,
      toolName: "aili_compact",
      content: [{ type: "text", text: outputText }],
      isError: false,
    },
    qualityEvaluation,
  };
}

async function evaluateRuntimeV3CompactEconomics(
  model: PiProviderModel<any> | undefined,
  input: V3CompactEconomicsInput,
): Promise<V3CompactEconomicsResult> {
  const logical = evaluateV3CompactEconomics(input);
  if (!logical.ok) return logical;

  const target = runtimeProviderSerializerTarget(model);
  if (!target) {
    // The accepted contract gives unknown providers a deliberately wide
    // profile. Known provider/model profiles cannot silently skip their
    // production serializer.
    return input.profile.source === "fallback"
      ? logical
      : providerEconomicsUnavailable();
  }

  try {
    const providerSurfaceAdapter = await createPiProviderEconomicsSurfaceAdapter({
      profile: input.profile,
      target,
      contexts: runtimeProviderEconomicsContexts(target, logical, input),
    });
    return evaluateV3CompactEconomics({ ...input, providerSurfaceAdapter });
  } catch {
    return providerEconomicsUnavailable();
  }
}

function runtimeProviderSerializerTarget(
  model: PiProviderModel<any> | undefined,
): PiProviderSerializerTarget | undefined {
  if (!model || typeof model !== "object" || typeof model.api !== "string") return undefined;
  switch (model.api) {
    case "openai-completions":
      return { api: model.api, model: model as PiProviderModel<"openai-completions"> };
    case "openai-responses":
    case "azure-openai-responses":
    case "openai-codex-responses":
      return {
        api: model.api,
        model: model as PiProviderModel<"openai-responses" | "azure-openai-responses" | "openai-codex-responses">,
      };
    case "google-generative-ai":
    case "google-vertex":
      return {
        api: model.api,
        model: model as PiProviderModel<"google-generative-ai" | "google-vertex">,
      };
    case "anthropic-messages":
      return { api: model.api, model: model as PiProviderModel<"anthropic-messages"> };
    default:
      return undefined;
  }
}

function runtimeProviderEconomicsContexts(
  target: PiProviderSerializerTarget,
  logical: Extract<V3CompactEconomicsResult, { ok: true }>,
  input: V3CompactEconomicsInput,
): Partial<Record<V3ProviderEconomicsSurfaceKind, PiProviderEconomicsContextSurface>> {
  const oneTimePair = runtimeProviderContext(target, [
    input.oneTime.compressionToolCall,
    input.oneTime.compressionToolResult,
  ]);
  const contexts: Partial<Record<V3ProviderEconomicsSurfaceKind, PiProviderEconomicsContextSurface>> = {
    replacement: {
      logicalValue: logical.replacementMessages,
      context: runtimeProviderContext(target, logical.replacementMessages),
    },
    "discovery-status": {
      logicalValue: input.oneTime.discoveryStatusInput,
      context: runtimeProviderTextContext(canonicalJson(input.oneTime.discoveryStatusInput)),
    },
    "model-output": {
      logicalValue: input.candidate.summary,
      context: runtimeProviderTextContext(input.candidate.summary),
    },
    "compression-tool-call": {
      logicalValue: input.oneTime.compressionToolCall,
      context: oneTimePair,
      select: (messages) => messages.slice(0, 1),
    },
    "compression-tool-result": {
      logicalValue: input.oneTime.compressionToolResult,
      context: oneTimePair,
      select: (messages) => messages.slice(-1),
    },
    "quality-evaluation": {
      logicalValue: input.oneTime.qualityEvaluation,
      context: runtimeProviderTextContext(canonicalJson(input.oneTime.qualityEvaluation)),
    },
  };
  if (logical.sourceMessages) {
    contexts.source = {
      logicalValue: logical.sourceMessages,
      context: runtimeProviderContext(target, logical.sourceMessages),
    };
  }
  if (input.providerSuffix) {
    const suffixMessages = [input.providerSuffix.message];
    contexts["compression-suffix"] = {
      logicalValue: suffixMessages,
      context: runtimeProviderContext(target, suffixMessages),
    };
  }
  return contexts;
}

function runtimeProviderContext(
  target: PiProviderSerializerTarget,
  messages: readonly unknown[],
): PiProviderContext {
  return {
    messages: messages.map((message, index) => {
      if (!isRecord(message) || typeof message.role !== "string") {
        throw new Error("provider-economics-invalid-logical-message");
      }
      const timestamp = index + 1;
      if (message.role === "custom") {
        const content = typeof message.content === "string"
          ? [{ type: "text" as const, text: message.content }]
          : message.content;
        if (!Array.isArray(content)) throw new Error("provider-economics-invalid-custom-message");
        return { role: "user" as const, content, timestamp };
      }
      if (message.role === "assistant") {
        if (!Array.isArray(message.content)) throw new Error("provider-economics-invalid-assistant-message");
        return {
          ...message,
          role: "assistant" as const,
          api: target.model.api,
          provider: target.model.provider,
          model: target.model.id,
          usage: zeroProviderUsage(),
          stopReason: "toolUse" as const,
          timestamp,
        };
      }
      if (message.role === "toolResult") {
        const content = typeof message.content === "string"
          ? [{ type: "text" as const, text: message.content }]
          : message.content;
        if (!Array.isArray(content)) throw new Error("provider-economics-invalid-tool-result");
        return { ...message, role: "toolResult" as const, content, timestamp };
      }
      if (message.role === "user") {
        return { ...message, role: "user" as const, timestamp };
      }
      throw new Error("provider-economics-unsupported-logical-role");
    }) as PiProviderContext["messages"],
    tools: [],
  };
}

function runtimeProviderTextContext(content: string): PiProviderContext {
  return { messages: [{ role: "user", content, timestamp: 1 }], tools: [] };
}

function zeroProviderUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function providerEconomicsUnavailable(): V3CompactEconomicsResult {
  return {
    ok: false,
    version: V3_COMPACT_ECONOMICS_VERSION,
    reason: "surface-unavailable",
    diagnostic: "Exact provider serialization was unavailable for the active provider/model.",
  };
}

function appendV3CompactTransaction(
  pi: ExtensionAPI,
  runtime: SessionRuntime,
  outputSurface: unknown,
  transaction: V3Transaction,
) {
  try {
    pi.appendEntry(AILI_COMPACT_ENTRY, transaction);
  } catch {
    return error(canonicalJson({ code: "append-failed" }));
  }
  runtime.safePlan = undefined;
  runtime.providerSuffix = undefined;
  runtime.providerSuffixContent = undefined;
  return success(canonicalJson(outputSurface), transaction);
}

function renderV3MutationFailure(failure: V3MutationPlanFailure): string {
  return canonicalJson({
    code: failure.code,
    message: failure.message,
    path: failure.path,
    freshRefs: failure.freshRefs,
  });
}

function predictV3BlockReference(
  view: V3RuntimeView,
  firstLeafOrdinal: number,
  createdAt: number,
  blockId: string,
): string {
  const before = [...view.state.blocks.values()].filter((block) => block.epochId === view.state.epochId)
    .filter((block) => block.firstLeafOrdinal < firstLeafOrdinal
      || (block.firstLeafOrdinal === firstLeafOrdinal && (block.createdAt < createdAt
        || (block.createdAt === createdAt && block.blockId.localeCompare(blockId) < 0))));
  return `b${String(before.length + 1).padStart(6, "0")}`;
}

function protectedV3Intervals(
  entries: readonly SessionLikeEntry[],
  safePlan: SafeRangePlan,
  view: V3RuntimeView,
): readonly V3ProtectedOrdinalInterval[] {
  const protectedAtoms = new Map(safePlan.protectedAtoms.map((value) => [value.atomId, value.reasons] as const));
  const activeV3LeafIds = new Set(view.replay.maximalActiveBlocks
    .flatMap((block) => v3LeafEntryIds(view.state, block.blockId)));
  const ordinals = new Map(view.mutationCatalog.messageRefs.map(({ entryId, effectiveSourceOrdinal }) => [entryId, effectiveSourceOrdinal]));
  const planningEntries = entries.filter((entry) => !isAiliPlanningProtocolEntry(entry));
  return buildProtocolAtoms(planningEntries).atoms.flatMap((atom) => {
    const reasons = protectedAtoms.get(atom.atomId);
    if (!reasons) return [];
    const promotionOnly = reasons.length === 1 && reasons[0] === "caller-protected"
      && atom.entryIds.length > 0
      && atom.entryIds.every((entryId) => activeV3LeafIds.has(entryId));
    if (promotionOnly) return [];
    const values = atom.entryIds.map((entryId) => ordinals.get(entryId))
      .filter((value): value is number => value !== undefined && Number.isSafeInteger(value));
    return values.length === 0 ? [] : [{ firstOrdinal: Math.min(...values), lastOrdinal: Math.max(...values) }];
  });
}

function v3LifecycleStatus(view: V3RuntimeView, legacyState: CompactState, config: CompactConfig) {
  const active = view.replay.maximalActiveBlocks
    .filter((block) => block.epochId === view.state.epochId && block.active && !block.queryOnly)
    .sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal || left.blockId.localeCompare(right.blockId));
  const groups: Array<{ sourceTier: string; targetTier: string; blockRefs: string[]; action: "compact" }> = [];
  let run: V3SemanticBlock[] = [];
  const flush = () => {
    const minimum = run[0]?.tier === "T3" ? config.tiers.restill.minChildren : 2;
    if (run[0]?.tier === "T3" && (!config.tiers.enabled || !config.tiers.restill.enabled)) { run = []; return; }
    for (let offset = 0; offset + minimum <= run.length; offset += 16) {
      const selected = run.slice(offset, Math.min(run.length, offset + 16));
      if (selected.length < minimum) break;
      const refs = selected.flatMap((block) => view.blockRefById.get(block.blockId) ?? []);
      if (refs.length === selected.length) {
        groups.push({
          sourceTier: selected[0]!.tier,
          targetTier: selected[0]!.tier === "T1" ? "T2" : "T3",
          blockRefs: refs,
          action: "compact",
        });
      }
    }
    run = [];
  };
  for (const block of active) {
    const previous = run.at(-1);
    if (previous && (previous.tier !== block.tier || block.firstLeafOrdinal !== previous.lastLeafOrdinal + 1)) flush();
    run.push(block);
  }
  flush();

  const decompressRoots = view.catalog.blocks.filter(({ active: isActive, queryOnly }) => isActive && !queryOnly)
    .slice(0, 32)
    .map((reference) => {
      const block = reference.family === "v3" ? view.state.blocks.get(reference.blockId) : undefined;
      return {
        blockRef: reference.ref,
        schema: reference.family,
        ...(block ? { tier: block.tier } : {}),
        depths: reference.family === "legacy" || block?.source.kind === "messages" ? ["raw"] : ["one", "raw"],
        action: "decompress",
      };
    });
  const v3Recompress = [...view.state.blocks.values()].flatMap((block) => {
    const reference = view.blockRefById.get(block.blockId);
    const explicit = block.explicitDecompression;
    return reference && explicit && !block.active && !block.queryOnly && block.epochId === view.state.epochId
      ? [{
        blockRef: reference,
        schema: "v3" as const,
        tier: block.tier,
        decompressionTransactionId: explicit.transactionId,
        depth: explicit.depth,
        action: "recompress" as const,
      }]
      : [];
  });
  const legacyRecompress = [...legacyState.blocks.values()].flatMap((block) => {
    const reference = view.blockRefById.get(block.id);
    return reference && !block.active && !block.queryOnly && block.epochId === legacyState.epochId && block.deactivationReason === "decompress"
      ? [{ blockRef: reference, schema: "legacy" as const, action: "recompress" as const }]
      : [];
  });
  return {
    schema: "aili.compact.lifecycle-status.v3",
    activeTiers: active.reduce<Record<string, number>>((counts, block) => {
      counts[block.tier] = (counts[block.tier] ?? 0) + 1;
      return counts;
    }, { T1: 0, T2: 0, T3: 0 }),
    structuralPromotionGroups: groups.slice(0, 32),
    decompressRoots,
    recompressRoots: [...v3Recompress, ...legacyRecompress].slice(0, 32),
  };
}

function remapAlignmentAfterProjection<T extends ProjectionMessage>(
  source: readonly T[],
  projected: readonly T[],
  alignment: ReadonlyMap<string, number>,
): { byEntryId: ReadonlyMap<string, number>; diagnostic?: string } {
  const queues = new Map<T, number[]>();
  projected.forEach((message, index) => {
    const values = queues.get(message) ?? [];
    values.push(index);
    queues.set(message, values);
  });
  const nextUse = new Map<T, number>();
  const result = new Map<string, number>();
  for (const [entryId, sourceIndex] of alignment) {
    const message = source[sourceIndex];
    if (!message) continue;
    const matches = queues.get(message);
    const cursor = nextUse.get(message) ?? 0;
    const projectedIndex = matches?.[cursor];
    if (projectedIndex === undefined) continue;
    nextUse.set(message, cursor + 1);
    result.set(entryId, projectedIndex);
  }
  return { byEntryId: result };
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

function isAiliPlanningProtocolEntry(entry: SessionLikeEntry): boolean {
  if (entry.type !== "message" || !isRecord(entry.message)) return false;
  if (typeof entry.message.toolName === "string" && entry.message.toolName.startsWith("aili_")) return true;
  return toolCalls(entry.message).some((call) => call.name.startsWith("aili_"));
}

function syncBranchIndex(
  ctx: ExtensionContext,
  runtime: SessionRuntime,
  state: CompactState,
  forceCold: boolean,
): void {
  if (!runtime.config.index.enabled) {
    runtime.branchIndexHealthy = "Unverified";
    runtime.branchIndexDiagnostic = "index-disabled-pure-fallback";
    return;
  }
  const branchEntries = branch(ctx) as BranchSessionEntry[];
  const key = {
    sessionId: ctx.sessionManager.getSessionId(),
    canonicalSessionPathDigest: digest(
      typeof ctx.sessionManager.getSessionFile === "function"
        ? ctx.sessionManager.getSessionFile() ?? `session:${ctx.sessionManager.getSessionId()}`
        : `session:${ctx.sessionManager.getSessionId()}`,
    ),
    branchLeafId: ctx.sessionManager.getLeafId() ?? "root",
    epochId: state.epochId,
    replayVersion: "aili.compact.v1-v3-index.v1",
  };
  const current = runtime.branchIndex.current;
  const requiresCold = forceCold
    || !current
    || current.key.sessionId !== key.sessionId
    || current.key.canonicalSessionPathDigest !== key.canonicalSessionPathDigest
    || current.key.epochId !== key.epochId
    || runtime.branchIndexEntryOffset < 0
    || runtime.branchIndexEntryOffset > branchEntries.length
    || current.stats.entries > branchEntries.length - runtime.branchIndexEntryOffset;
  if (requiresCold) {
    const scope = branchIndexEpochScope(branchEntries, state.epochId);
    const v3ReplaySeed = branchIndexV3ReplaySeed(branchEntries, state.epochId, scope.offset);
    runtime.branchIndexEntryOffset = scope.offset;
    const result = coldBuildBranchIndex({
      key,
      entries: scope.entries,
      ...(v3ReplaySeed ? { v3ReplaySeed } : {}),
      derivedVersions: {
        providerId: typeof (ctx.model as unknown as { provider?: unknown } | undefined)?.provider === "string"
          ? (ctx.model as unknown as { provider: string }).provider : "unavailable",
        modelId: typeof (ctx.model as unknown as { id?: unknown } | undefined)?.id === "string"
          ? (ctx.model as unknown as { id: string }).id : "unavailable",
        estimatorVersion: TOKEN_ESTIMATOR_VERSION,
        projectionVersion: V3_PROJECTION_VERSION,
        qualityVersion: QUALITY_EVALUATOR_VERSION,
        configVersion: digest(runtime.config),
      },
    });
    const snapshot = runtime.branchIndex.install(result);
    const health = snapshot ? auditBranchIndexReplayHealth(snapshot, scope.entries) : undefined;
    runtime.branchIndexHealthy = result.ok && health?.healthy === true;
    runtime.branchIndexDiagnostic = !result.ok ? result.code : health?.healthy ? undefined : health?.diagnostics[0] ?? "branch-replay-oracle-mismatch";
    return;
  }
  const scopedLength = branchEntries.length - runtime.branchIndexEntryOffset;
  if (current.stats.entries === scopedLength) {
    const exactTip = current.tipEntryId === (scopedLength === 0 ? undefined : key.branchLeafId)
      && current.key.branchLeafId === key.branchLeafId;
    runtime.branchIndexHealthy = exactTip;
    runtime.branchIndexDiagnostic = exactTip ? undefined : "tip-mismatch";
    return;
  }
  const suffix = branchEntries.slice(runtime.branchIndexEntryOffset + current.stats.entries);
  const result = runtime.branchIndex.append({
    entries: suffix,
    expectedParentId: current.tipEntryId,
    expectedPriorDigest: current.sourceDigest,
    nextBranchLeafId: key.branchLeafId,
  });
  if (!result || !result.ok) {
    const scope = branchIndexEpochScope(branchEntries, state.epochId);
    const v3ReplaySeed = branchIndexV3ReplaySeed(branchEntries, state.epochId, scope.offset);
    runtime.branchIndexEntryOffset = scope.offset;
    const rebuilt = coldBuildBranchIndex({
      key,
      entries: scope.entries,
      ...(v3ReplaySeed ? { v3ReplaySeed } : {}),
      derivedVersions: current.derivedVersions,
    });
    const snapshot = runtime.branchIndex.install(rebuilt);
    const health = snapshot ? auditBranchIndexReplayHealth(snapshot, scope.entries) : undefined;
    runtime.branchIndexHealthy = rebuilt.ok && health?.healthy === true;
    runtime.branchIndexDiagnostic = !rebuilt.ok ? rebuilt.code : health?.healthy ? undefined : health?.diagnostics[0] ?? "branch-replay-oracle-mismatch";
    return;
  }
  runtime.branchIndexHealthy = true;
  runtime.branchIndexDiagnostic = undefined;
}

function branchIndexEpochScope(
  entries: readonly BranchSessionEntry[],
  epochId: string,
): { entries: readonly BranchSessionEntry[]; offset: number } {
  if (epochId === "root") return { entries, offset: 0 };
  const boundary = entries.findIndex((entry) => entry.type === "compaction" && entry.id === epochId);
  return boundary < 0
    ? { entries: [], offset: entries.length }
    : { entries: entries.slice(boundary + 1), offset: boundary + 1 };
}

function branchIndexV3ReplaySeed(
  entries: readonly BranchSessionEntry[],
  epochId: string,
  epochOffset: number,
) {
  if (epochId === "root" || epochOffset <= 0) return undefined;
  return reduceV3LifecycleState(entries.slice(0, epochOffset));
}

function installProductionIndexOracle(
  ctx: ExtensionContext,
  runtime: SessionRuntime,
  state: CompactState,
  entries: readonly SessionLikeEntry[],
): void {
  const snapshot = runtime.branchIndex.current;
  if (!snapshot || runtime.branchIndexHealthy !== true) return;
  const view = v3ViewFor(ctx, entries, state);
  runtime.indexedState = state;
  runtime.indexedView = view;
  runtime.indexedTransactionCount = snapshot.stats.transactions;
  runtime.indexedV3TransactionCount = getBranchV3LifecycleReplay(snapshot).acceptedTransactionCount;
  runtime.indexedEntryCount = snapshot.stats.entries;
  runtime.indexedSnapshotKeyId = snapshot.keyId;
  runtime.indexedSnapshotSourceDigest = snapshot.sourceDigest;
  runtime.indexedDerivedIdentity = productionDerivedIdentity(ctx, runtime);
  runtime.indexedSourceOwnerByEntryId = indexedSourceOwners(state, view);
  runtime.indexedProtectionEntryCount = entries.length;
  runtime.indexedProtectedEntryIds = collectProtectedEntryIds(entries, runtime, snapshot);
  const planningInputs = indexedPlanningInputs(snapshot, view);
  runtime.indexedPlanningRefs = planningInputs.refs;
  runtime.indexedPlanningAtomBuild = planningInputs.atomBuild;
  const coolingCandidates = runtime.coolingObservations.length > 0
    ? findCoolingCandidates(
      entries,
      state,
      16,
      runtime.config,
      ctx.cwd,
      runtimeCoolingEvidence(runtime),
      coolingExcludedEntryIds(view),
    )
    : [];
  runtime.indexedCoolingCandidate = coolingCandidates[0]
    ? { idHash: digest(coolingCandidates[0].id).slice(0, 16), sourceCount: coolingCandidates[0].sourceEntryIds.length }
    : undefined;
  runtime.indexedCommandInputs = buildIndexedCommandInputs(state, view, runtime, new Set(coolingCandidates.flatMap((block) => block.sourceEntryIds)));
  runtime.indexedCandidateByRef = new Map((runtime.indexedCommandInputs.candidates ?? []).map((candidate) => [candidate.ref, candidate]));
  const indexedContext = planCompactCommand("context 0 1", runtime.indexedCommandInputs);
  runtime.indexedContextStatic = indexedContext.kind === "context"
    ? { activeRecaps: indexedContext.output.activeRecaps, policyReasons: indexedContext.output.policyReasons }
    : undefined;
  runtime.safePlan = runtime.config.planning.enabled
    ? buildIndexedSafePlan(snapshot, state, view, runtime, ctx)
    : undefined;
  runtime.providerIndexFailOpen = undefined;
}

function refreshProductionIndexDerived(
  ctx: ExtensionContext,
  runtime: SessionRuntime,
  entries: readonly SessionLikeEntry[],
): boolean {
  const snapshot = runtime.branchIndex.current;
  const state = runtime.indexedState;
  const previousView = runtime.indexedView;
  if (!snapshot || !state || !previousView || runtime.branchIndexHealthy !== true) return false;
  const derivedIdentity = productionDerivedIdentity(ctx, runtime);
  if (runtime.indexedSnapshotKeyId === snapshot.keyId
    && runtime.indexedSnapshotSourceDigest === snapshot.sourceDigest
    && runtime.indexedEntryCount === snapshot.stats.entries
    && runtime.indexedTransactionCount === snapshot.stats.transactions
    && runtime.indexedDerivedIdentity === derivedIdentity) {
    return true;
  }
  const transactionDelta = snapshot.stats.transactions - (runtime.indexedTransactionCount ?? snapshot.stats.transactions);
  const sourceChanged = runtime.indexedSnapshotKeyId !== snapshot.keyId
    || runtime.indexedSnapshotSourceDigest !== snapshot.sourceDigest
    || runtime.indexedEntryCount !== snapshot.stats.entries;
  if (transactionDelta !== 0) {
    const replay = getBranchV3LifecycleReplay(snapshot);
    const v3Delta = replay.acceptedTransactionCount
      - (runtime.indexedV3TransactionCount ?? replay.acceptedTransactionCount);
    // Legacy/repair state cannot be reconstructed from the v3 root. It is
    // installed by the non-provider oracle or fails open exactly.
    if (transactionDelta !== v3Delta) {
      runtime.branchIndexHealthy = false;
      runtime.branchIndexDiagnostic = "indexed-legacy-or-repair-state-stale";
      return false;
    }
    const indexedEntries = entries as readonly BranchSessionEntry[];
    const scopedLength = indexedEntries.length - runtime.branchIndexEntryOffset;
    const priorIndexedCount = runtime.indexedEntryCount ?? snapshot.stats.entries;
    if (runtime.branchIndexEntryOffset < 0
      || runtime.branchIndexEntryOffset > indexedEntries.length
      || priorIndexedCount > snapshot.stats.entries
      || scopedLength !== snapshot.stats.entries) {
      runtime.branchIndexHealthy = false;
      runtime.branchIndexDiagnostic = "indexed-entry-scope-mismatch";
      return false;
    }
    for (const entry of indexedEntries.slice(runtime.branchIndexEntryOffset + priorIndexedCount)) {
      if (entry.type === "message") runtime.indexedProtectedEntryIds.add(entry.id);
    }
    const view = buildIndexedV3RuntimeView(
      listBranchMessageReferences(snapshot),
      state,
      replay,
      previousView.state,
    );
    runtime.indexedView = view;
    runtime.indexedTransactionCount = snapshot.stats.transactions;
    runtime.indexedV3TransactionCount = replay.acceptedTransactionCount;
    runtime.indexedEntryCount = snapshot.stats.entries;
    runtime.indexedSnapshotKeyId = snapshot.keyId;
    runtime.indexedSnapshotSourceDigest = snapshot.sourceDigest;
    runtime.indexedDerivedIdentity = derivedIdentity;
    runtime.indexedSourceOwnerByEntryId = indexedSourceOwners(state, view);
    runtime.indexedProtectionEntryCount = entries.length;
    const planningInputs = indexedPlanningInputs(snapshot, view);
    runtime.indexedPlanningRefs = planningInputs.refs;
    runtime.indexedPlanningAtomBuild = planningInputs.atomBuild;
    runtime.safePlan = runtime.config.planning.enabled
      ? buildIndexedSafePlan(snapshot, state, view, runtime, ctx)
      : undefined;
    return true;
  }
  if (!sourceChanged) {
    runtime.indexedDerivedIdentity = derivedIdentity;
    runtime.safePlan = runtime.config.planning.enabled
      ? buildIndexedSafePlan(snapshot, state, previousView, runtime, ctx)
      : undefined;
    return true;
  }
  const indexedEntries = entries as readonly BranchSessionEntry[];
  const scopedLength = indexedEntries.length - runtime.branchIndexEntryOffset;
  const priorIndexedCount = runtime.indexedEntryCount ?? snapshot.stats.entries;
  if (runtime.branchIndexEntryOffset < 0
    || runtime.branchIndexEntryOffset > indexedEntries.length
    || priorIndexedCount > snapshot.stats.entries
    || scopedLength !== snapshot.stats.entries) {
    runtime.branchIndexHealthy = false;
    runtime.branchIndexDiagnostic = "indexed-entry-scope-mismatch";
    return false;
  }
  // A provider-boundary append is conservatively protected as a delta.  This
  // reads only D entry identities and never invokes the full-branch policy or
  // subagent classifiers.  The next non-provider oracle event may refine it.
  for (const entry of indexedEntries.slice(runtime.branchIndexEntryOffset + priorIndexedCount)) {
    if (entry.type === "message") runtime.indexedProtectedEntryIds.add(entry.id);
  }
  // A message-only provider append changes neither replay nor catalogs used by
  // the current request. Keep the prior derived view/plan conservative; the
  // next non-provider event installs the exact new oracle and refs.
  runtime.indexedTransactionCount = snapshot.stats.transactions;
  runtime.indexedEntryCount = snapshot.stats.entries;
  runtime.indexedSnapshotKeyId = snapshot.keyId;
  runtime.indexedSnapshotSourceDigest = snapshot.sourceDigest;
  runtime.indexedDerivedIdentity = derivedIdentity;
  runtime.indexedProtectionEntryCount = entries.length;
  return true;
}

function productionDerivedIdentity(ctx: ExtensionContext, runtime: SessionRuntime): string {
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  return digest({
    providerId: typeof model?.provider === "string" ? model.provider : "unavailable",
    modelId: typeof model?.id === "string" ? model.id : "unavailable",
    estimatorVersion: TOKEN_ESTIMATOR_VERSION,
    projectionVersion: V3_PROJECTION_VERSION,
    qualityVersion: QUALITY_EVALUATOR_VERSION,
    configVersion: digest(runtime.config),
  });
}

function indexedSourceOwners(state: CompactState, view: V3RuntimeView): Map<string, string> {
  const result = new Map<string, string>();
  for (const block of activeBlocks(state)) {
    for (const sourceId of block.sourceEntryIds) result.set(sourceId, block.id);
  }
  for (const block of view.replay.maximalActiveBlocks) {
    for (const sourceId of v3LeafEntryIds(view.state, block.blockId)) result.set(sourceId, block.blockId);
  }
  return result;
}

function buildIndexedCommandInputs(
  state: CompactState,
  view: V3RuntimeView,
  runtime: SessionRuntime,
  coolingEntryIds: ReadonlySet<string>,
): CompactCommandInputs {
  const candidates = view.catalog.messages.map((message) => {
    const reasonCodes = runtime.indexedProtectionReasonsByEntryId.get(message.entryId) ?? [];
    return {
      ref: message.ref,
      ...(message.role ? { role: message.role } : {}),
      compressible: coolingEntryIds.has(message.entryId)
        || (reasonCodes.length === 0 && !runtime.indexedSourceOwnerByEntryId.has(message.entryId)),
      reasonCodes,
    };
  });
  const activeRecaps = view.catalog.blocks.flatMap((reference) => {
    const legacyBlock = reference.family === "legacy" ? state.blocks.get(reference.blockId) : undefined;
    const v3Block = reference.family === "v3" ? view.state.blocks.get(reference.blockId) : undefined;
    const block = legacyBlock ?? v3Block;
    return block?.active ? [{ blockRef: reference.ref, topic: block.topic, summary: block.summary }] : [];
  });
  const policyReasons = new Map<string, number>();
  for (const candidate of candidates) {
    for (const reason of candidate.reasonCodes) policyReasons.set(reason, (policyReasons.get(reason) ?? 0) + 1);
  }
  const legacyActive = activeBlocks(state);
  return {
    catalog: view.catalog,
    candidates,
    activeRecaps,
    blockEligibility: view.catalog.blocks.map((reference) => {
      const legacyBlock = reference.family === "legacy" ? state.blocks.get(reference.blockId) : undefined;
      const v3Block = reference.family === "v3" ? view.state.blocks.get(reference.blockId) : undefined;
      return {
        blockRef: reference.ref,
        active: reference.active,
        queryOnly: reference.queryOnly,
        deactivationReason: legacyBlock?.deactivationReason ?? v3Block?.deactivationReason,
      };
    }),
    policyReasons: [...policyReasons].map(([code, count]) => ({ code, count })),
    stats: {
      session: {
        transactions: (state.transactionCount ?? 0) + view.replay.acceptedTransactionCount,
        blocks: state.blocks.size + view.state.blocks.size,
        sourceChars: 0,
        projectedSavingChars: 0,
      },
      branch: {
        transactions: (state.transactionCount ?? 0) + view.replay.acceptedTransactionCount,
        blocks: state.blocks.size + view.state.blocks.size,
        activeBlocks: legacyActive.length + view.replay.maximalActiveBlocks.length,
        cooledResults: legacyActive.filter((block) => block.kind === "cool").length,
      },
      cache: {
        eligibleSamples: runtime.telemetry.window.length,
        cacheReads: runtime.telemetry.cacheRead,
        cacheWrites: runtime.telemetry.cacheWrite,
      },
    },
    enabled: state.enabled,
    manualMode: state.manualMode,
    autoCooling: state.autoCooling,
    pendingManualTrigger: state.pendingManualTrigger !== undefined,
  };
}

function indexedContextReferencePage(
  page: BranchReferencePage,
  state: CompactState,
  view: V3RuntimeView,
  runtime: SessionRuntime,
): CommandContextOutput {
  const activeRecaps = runtime.indexedCommandInputs?.catalog.catalogId === view.catalog.catalogId
    ? runtime.indexedContextStatic?.activeRecaps ?? []
    : indexedActiveRecaps(state, view);
  return {
    catalogId: view.catalog.catalogId,
    epochId: view.catalog.epochId,
    offset: page.offset,
    limit: page.limit,
    refs: page.messages.map((message) => ({
      ref: message.ref,
      ...(message.role ? { role: message.role.slice(0, 32) } : {}),
      atomRefs: [...new Set(message.atomEntryIds.flatMap((entryId) => runtime.indexedPlanningRefs.get(entryId) ?? []))].slice(0, 16),
    })),
    candidates: page.messages.flatMap((message) => {
      const candidate = runtime.indexedCandidateByRef.get(message.ref);
      return candidate ? [{
        ref: candidate.ref,
        compressible: candidate.compressible,
        ...(candidate.role ? { role: candidate.role.slice(0, 32) } : {}),
        reasonCodes: [...new Set(candidate.reasonCodes ?? [])].slice(0, 16),
      }] : [];
    }),
    activeRecaps,
    policyReasons: runtime.indexedContextStatic?.policyReasons ?? [],
    ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
  };
}

function indexedActiveRecaps(state: CompactState, view: V3RuntimeView): CommandContextOutput["activeRecaps"] {
  return view.catalog.blocks.flatMap((reference) => {
    if (!reference.active || reference.queryOnly) return [];
    const legacyBlock = reference.family === "legacy" ? state.blocks.get(reference.blockId) : undefined;
    const v3Block = reference.family === "v3" ? view.state.blocks.get(reference.blockId) : undefined;
    const block = legacyBlock ?? v3Block;
    if (!block) return [];
    return [{
      blockRef: reference.ref,
      ...(block.topic ? { topic: block.topic.slice(0, 200) } : {}),
      summaryPreview: `${block.summary.slice(0, 200)}${block.summary.length > 200 ? "…" : ""}`,
    }];
  });
}

function collectProtectedEntryIds(
  entries: readonly SessionLikeEntry[],
  runtime: SessionRuntime,
  snapshot: NonNullable<BranchIndexCache["current"]>,
): Set<string> {
  const result = new Set<string>();
  const reasonsByEntryId = new Map<string, Set<string>>();
  const mark = (entryId: string, reason: string) => {
    result.add(entryId);
    const reasons = reasonsByEntryId.get(entryId) ?? new Set<string>();
    reasons.add(reason);
    reasonsByEntryId.set(entryId, reasons);
  };
  const configuredTools = new Set(runtime.config.protection.tools.map((name) => name.toLocaleLowerCase()));
  const userIds: string[] = [];
  let latestUserIndex = -1;
  let laterAssistant = false;
  const protectAtom = (entryId: string, reason: string) => {
    const atom = getBranchProtocolAtomForEntry(snapshot, entryId);
    if (atom) for (const atomEntryId of atom.entryIds) mark(atomEntryId, reason);
    else mark(entryId, reason);
  };
  for (const [index, entry] of entries.entries()) {
    if (entry.type !== "message" || !isRecord(entry.message)) continue;
    const message = entry.message;
    const atom = getBranchProtocolAtomForEntry(snapshot, entry.id);
    if (atom?.hardProtected) {
      for (const reason of atom.protectionReasons.length > 0 ? atom.protectionReasons : ["protocol-protected"]) {
        protectAtom(entry.id, reason);
      }
    }
    if (message.role === "user") {
      userIds.push(entry.id);
      latestUserIndex = index;
      laterAssistant = false;
      if (runtime.config.protection.protectUserMessages) mark(entry.id, "protected-user");
    } else if (latestUserIndex >= 0 && message.role === "assistant") laterAssistant = true;
    const calls = toolCalls(message);
    const normalizedResultTool = typeof message.toolName === "string" ? message.toolName.toLocaleLowerCase() : undefined;
    const toolProtected = calls.some((call) => call.name.toLocaleLowerCase().startsWith("aili_")
      || call.name.toLocaleLowerCase() === "task"
      || configuredTools.has(call.name.toLocaleLowerCase()))
      || (normalizedResultTool !== undefined && (normalizedResultTool.startsWith("aili_")
        || normalizedResultTool === "task" || configuredTools.has(normalizedResultTool)));
    const protectedPath = calls.some((call) => containsProtectedPath(toolCallArguments(message, call.id)));
    const protectedTag = runtime.config.protection.protectTags && extractText(message.content).includes("<protect>");
    if (toolProtected) {
      const subagentDisabled = !runtime.config.subagents.enabled
        && (calls.some((call) => call.name.toLocaleLowerCase() === "task") || normalizedResultTool === "task");
      protectAtom(entry.id, subagentDisabled ? "subagent-disabled" : "protected-tool");
    }
    if (protectedPath) protectAtom(entry.id, "protected-path");
    if (protectedTag) protectAtom(entry.id, "protected-tag");
    if (hasImageContent(message.content)) protectAtom(entry.id, "binary-content");
  }
  const recentCount = Math.max(2, Math.floor(runtime.config.protection.recentUserMessages));
  for (const entryId of userIds.slice(-recentCount)) mark(entryId, "recent-user");
  if (latestUserIndex >= 0 && !laterAssistant) {
    for (const entry of entries.slice(latestUserIndex)) if (entry.type === "message") mark(entry.id, "current-turn");
  }
  runtime.indexedProtectionReasonsByEntryId = new Map([...reasonsByEntryId]
    .map(([entryId, reasons]) => [entryId, [...reasons].sort()] as const));
  return result;
}

function buildIndexedSafePlan(
  snapshot: NonNullable<BranchIndexCache["current"]>,
  state: CompactState,
  view: V3RuntimeView,
  runtime: SessionRuntime,
  ctx: ExtensionContext,
): SafeRangePlan {
  const activeSourceIds = new Set([
    ...activeBlocks(state).flatMap((block) => block.sourceEntryIds),
    ...view.replay.maximalActiveBlocks.flatMap((block) => v3LeafEntryIds(view.state, block.blockId)),
    ...view.state.cooling.flatMap((cooling) => cooling.targetEntryIds),
  ]);
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  const refs = runtime.indexedPlanningRefs;
  const indexedAtomBuild = runtime.indexedPlanningAtomBuild ?? branchProtocolAtomBuild(snapshot);
  if (!runtime.indexedPlanningAtomBuild) runtime.indexedPlanningAtomBuild = indexedAtomBuild;
  if (refs.size === 0 && view.catalog.messages.length > 0) {
    for (const message of view.catalog.messages) refs.set(message.entryId, message.ref);
  }
  return planSafeRanges({
    entries: [],
    atomBuild: indexedAtomBuild,
    refs,
    catalogId: view.catalog.catalogId,
    contextWindow: ctx.getContextUsage()?.contextWindow,
    providerId: typeof model?.provider === "string" ? model.provider : undefined,
    modelId: typeof model?.id === "string" ? model.id : undefined,
    tokenProfiles: runtimeTokenProfiles(
      runtime,
      typeof model?.provider === "string" ? model.provider : undefined,
      typeof model?.id === "string" ? model.id : undefined,
    ),
    tailPolicy: {
      preserveRecentAtoms: runtime.config.protection.preserveRecentAtoms,
      preserveRecentTokens: runtime.config.protection.preserveRecentTokens,
      preserveRecentTokenCapRatio: runtime.config.protection.preserveRecentTokenCapRatio,
      preserveLastUserMessage: true,
    },
    additionalProtectedEntryIds: [...new Set([...runtime.indexedProtectedEntryIds, ...activeSourceIds])],
  });
}

function indexedPlanningInputs(
  snapshot: NonNullable<BranchIndexCache["current"]>,
  view: V3RuntimeView,
): { refs: Map<string, string>; atomBuild: ProtocolAtomBuildResult } {
  const refs = new Map(view.catalog.messages.map((message) => [message.entryId, message.ref]));
  const indexedAtomBuild = branchProtocolAtomBuild(snapshot);
  const atoms = indexedAtomBuild.atoms.filter((atom) => atom.entryIds.every((entryId) => refs.has(entryId)));
  const entryToAtomId = new Map<string, string>();
  for (const atom of atoms) for (const entryId of atom.entryIds) entryToAtomId.set(entryId, atom.atomId);
  const atomBuild: ProtocolAtomBuildResult = {
    ...indexedAtomBuild,
    atoms,
    providerEntryCount: atoms.reduce((sum, atom) => sum + atom.entryIds.length, 0),
    sourceDigest: digest(atoms.map((atom) => ({ atomId: atom.atomId, sourceDigest: atom.sourceDigest }))),
    entryToAtomId,
  };
  return { refs, atomBuild };
}

/** Rebuilds the exact mutation recommendation from the current immutable branch snapshot. */
function buildCurrentSafePlan(
  entries: readonly SessionLikeEntry[],
  state: CompactState,
  runtime: SessionRuntime,
  ctx: ExtensionContext,
  currentView?: V3RuntimeView,
): SafeRangePlan {
  const planningEntries = entries.filter((entry) => !isAiliPlanningProtocolEntry(entry));
  const view = currentView ?? v3ViewFor(ctx, entries, state);
  const catalog = view.catalog;
  const refs = new Map(catalog.messages.map((message) => [message.entryId, message.ref]));
  const activeSourceIds = new Set([
    ...activeBlocks(state).flatMap((block) => block.sourceEntryIds),
    ...view.replay.maximalActiveBlocks.flatMap((block) => v3LeafEntryIds(view.state, block.blockId)),
    ...view.state.cooling.flatMap((cooling) => cooling.targetEntryIds),
  ]);
  const protectedEntryIds = catalog.messages.flatMap((message) => {
    const index = entries.findIndex((entry) => entry.id === message.entryId);
    if (index < 0) return [message.entryId];
    const protection = classifyProtection(entries, index, { cwd: ctx.cwd, ...runtime.config.protection });
    const subagent = gateSubagentEntry(entries, index, runtime.config.subagents.enabled);
    return protection.protected
      || (subagent.protected && subagent.reason !== "not-subagent")
      || activeSourceIds.has(message.entryId)
      ? [message.entryId]
      : [];
  });
  const model = ctx.model as unknown as Record<string, unknown> | undefined;
  return planSafeRanges({
    entries: planningEntries,
    atomBuild: buildProtocolAtoms(planningEntries),
    refs,
    catalogId: catalog.catalogId,
    contextWindow: ctx.getContextUsage()?.contextWindow,
    providerId: typeof model?.provider === "string" ? model.provider : undefined,
    modelId: typeof model?.id === "string" ? model.id : undefined,
    tokenProfiles: runtimeTokenProfiles(runtime,
      typeof model?.provider === "string" ? model.provider : undefined,
      typeof model?.id === "string" ? model.id : undefined,
    ),
    tailPolicy: {
      preserveRecentAtoms: runtime.config.protection.preserveRecentAtoms,
      preserveRecentTokens: runtime.config.protection.preserveRecentTokens,
      preserveRecentTokenCapRatio: runtime.config.protection.preserveRecentTokenCapRatio,
      preserveLastUserMessage: true,
    },
    additionalProtectedEntryIds: [...new Set(protectedEntryIds)],
  });
}

function runtimeTokenProfiles(
  runtime: SessionRuntime,
  providerId: string | undefined,
  modelId: string | undefined,
) {
  const profiles = builtInTokenBoundProfiles(providerId, modelId);
  const key = providerId && modelId ? `${providerId}\u0000${modelId}\u0000${TOKEN_ESTIMATOR_VERSION}` : undefined;
  if (!key || profiles.length === 0) {
    if (runtime.calibrationKey !== key) {
      runtime.calibration = undefined;
      runtime.calibrationKey = key;
    }
    return profiles;
  }
  if (runtime.calibrationKey !== key || !runtime.calibration) {
    runtime.calibrationKey = key;
    runtime.calibration = new TokenCalibrationWindowState({ providerId: providerId!, modelId: modelId!, estimatorVersion: TOKEN_ESTIMATOR_VERSION });
  }
  return profiles.map((profile) => runtime.calibration!.applyProfile(profile));
}

function structuredToolPartCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + structuredToolPartCount(item), 0);
  if (!isRecord(value)) return 0;
  return (value.type === "toolCall" ? 1 : 0)
    + Object.values(value).reduce<number>((sum, item) => sum + structuredToolPartCount(item), 0);
}

function containsBinaryProviderContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsBinaryProviderContent);
  if (!isRecord(value)) return false;
  if (typeof value.type === "string" && /^(?:image|image_url|audio|video|file|binary)$/u.test(value.type)) return true;
  return Object.values(value).some(containsBinaryProviderContent);
}

/**
 * Replays and repairs one selected branch before any provider projection is
 * published. A source-branch movement restarts once; every other failure marks
 * the runtime exact-raw fail-open until the next lifecycle activation.
 */
function activateBranchWithRepair(pi: ExtensionAPI, ctx: ExtensionContext, runtime: SessionRuntime): CompactState {
  runtime.activationFailOpen = undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const entries = branch(ctx);
    const sourceIds = repairBranchSourceEntryIds(entries);
    const state = applyCompactConfig(reduceCompactState(entries), runtime.config);
    const plan = planLegacyRepairs({
      branchSourceEntryIds: sourceIds,
      epochId: state.epochId,
      entries,
      blocks: state.blocks,
      candidates: discoverLegacyRepairCandidates(entries, state.blocks),
    });
    runtime.legacyRepairStatus = { ...plan.counts, repaired: state.repairTransactionCount ?? 0 };
    if (!state.enabled || plan.batches.length === 0) return state;

    const sourceIdentity = digest(sourceIds);
    try {
      for (const batch of plan.batches) pi.appendEntry(AILI_COMPACT_ENTRY, batch);
    } catch {
      runtime.activationFailOpen = "repair-append-failed";
      return state;
    }

    const afterEntries = branch(ctx);
    if (digest(repairBranchSourceEntryIds(afterEntries)) !== sourceIdentity) continue;
    const repaired = applyCompactConfig(reduceCompactState(afterEntries), runtime.config);
    const repairedCount = repaired.repairTransactionCount ?? 0;
    runtime.legacyRepairStatus = { ...plan.counts, repaired: repairedCount };
    if (repaired.diagnostics.some((item) => item.startsWith("repair-"))
      || repairedCount < (state.repairTransactionCount ?? 0) + plan.batches.length) {
      runtime.activationFailOpen = "repair-replay-failed";
    }
    return repaired;
  }
  const state = stateFor(ctx, runtime.config);
  runtime.activationFailOpen = "repair-branch-moved";
  return state;
}

function recoveryTuple(ctx: Pick<ExtensionContext, "sessionManager">, state: CompactState): RecoveryTuple {
  const sourceEntryIds = branch(ctx).filter((entry) => entry.type !== "custom").map((entry) => entry.id);
  return {
    sessionId: ctx.sessionManager.getSessionId(),
    branchId: `br_${digest(sourceEntryIds)}`,
    epochId: state.epochId,
  };
}

function ensureRecoveryRuntime(ctx: ExtensionContext, runtime: SessionRuntime, state: CompactState): void {
  const tuple = recoveryTuple(ctx, state);
  const current = runtime.checkpoint.snapshot().tuple;
  if (current.sessionId === tuple.sessionId && current.branchId === tuple.branchId && current.epochId === tuple.epochId) return;
  runtime.checkpoint.invalidate(tuple, "recovery-tuple-changed");
  runtime.checkpointAttempts.clear();
  runtime.pressureCycle.resetForEpoch(tuple);
  runtime.deterministicCheckpointEligible = "not-evaluated";
}

function resetRecoveryRuntime(
  ctx: ExtensionContext,
  runtime: SessionRuntime,
  state: CompactState,
  code: string,
): void {
  const tuple = recoveryTuple(ctx, state);
  runtime.checkpoint.invalidate(tuple, code);
  runtime.checkpointAttempts.clear();
  runtime.pressureCycle.resetForEpoch(tuple);
  runtime.pressure = undefined;
  runtime.deterministicCheckpointEligible = "not-evaluated";
  if (runtime.manualPermit) runtime.manualPermit.state = "invalid";
  runtime.manualPermit = undefined;
}

function invokeCheckpoint(
  ctx: ExtensionContext,
  runtime: SessionRuntime,
  source: "rescue" | "auto-rescue",
  policy: "deterministic-first" | "native-only",
): { accepted: boolean; code: string } {
  const cycle = runtime.pressureCycle.snapshot();
  if (cycle.checkpointScheduled || cycle.checkpointAttempted) return { accepted: false, code: "checkpoint-cycle-exhausted" };
  const scheduled = runtime.checkpoint.schedule(source, policy);
  if (!scheduled.accepted || !scheduled.requestId) return { accepted: false, code: scheduled.code };
  runtime.pressureCycle.markCheckpointScheduled();
  runtime.pressureCycle.markCheckpointInvoked();
  const invoked = runtime.checkpoint.invoke(scheduled.requestId, ({ onComplete, onError }) => {
    ctx.compact({ onComplete: () => onComplete(), onError });
  });
  return invoked ? { accepted: true, code: "scheduled" } : { accepted: false, code: "compact-invocation-failed" };
}

function observeContextPressure(ctx: ExtensionContext, overflow: boolean): PressureObservation {
  const usage = ctx.getContextUsage();
  const fallbackTokens = typeof usage?.tokens === "number" && Number.isFinite(usage.tokens)
    ? undefined
    : Math.ceil(branch(ctx).reduce((total, entry) => {
      if (entry.type !== "message" || !isRecord(entry.message)) return total;
      return total + extractText(entry.message.content).length;
    }, 0) / 4);
  return observePressure({
    contextTokens: usage?.tokens,
    contextWindow: usage?.contextWindow,
    fallbackTokens,
    overflow,
  });
}

function checkpointPreparationIdentity(value: {
  firstKeptEntryId: string;
  tokensBefore: number;
  previousSummary?: string;
  messagesToSummarize?: unknown;
  turnPrefixMessages?: unknown;
  fileOps?: unknown;
  settings?: unknown;
}): unknown {
  return {
    firstKeptEntryId: value.firstKeptEntryId,
    tokensBefore: value.tokensBefore,
    previousSummary: value.previousSummary ?? null,
    messagesToSummarizeDigest: digest(value.messagesToSummarize ?? []),
    turnPrefixMessagesDigest: digest(value.turnPrefixMessages ?? []),
    fileOpsDigest: digest(value.fileOps ?? null),
    settingsDigest: digest(value.settings ?? null),
  };
}

function checkpointEntryIdentity(entry: SessionLikeEntry): unknown {
  return { id: entry.id, type: entry.type, customType: entry.customType ?? null, payloadDigest: digest(entry.message ?? entry.data ?? entry.details ?? entry.content ?? null) };
}

function checkpointReplayIdentity(state: CompactState, view?: V3RuntimeView): unknown {
  return {
    epochId: state.epochId,
    enabled: state.enabled,
    activeBlocks: activeBlocks(state).map((block) => ({
      id: block.id,
      epochId: block.epochId,
      sourceEntryIds: block.sourceEntryIds,
      sourceDigest: block.sourceDigest,
      summaryDigest: digest(block.summary),
      childBlockIds: block.childBlockIds ?? [],
      generation: block.generation ?? null,
      queryOnly: block.queryOnly === true,
    })),
    diagnostics: state.diagnostics,
    v3: view ? {
      catalogId: view.state.catalogId,
      acceptedTransactions: view.replay.acceptedTransactionCount,
      diagnostics: view.replay.diagnostics,
      maximalBlocks: view.replay.maximalActiveBlocks.map((block) => ({
        blockId: block.blockId,
        tier: block.tier,
        leafDigest: block.leafDigest,
        leafCount: block.leafCount,
        summaryDigest: block.summaryDigest,
        quality: block.quality,
      })),
    } : null,
  };
}

function checkpointConfigIdentity(config: CompactConfig): unknown {
  return { checkpoint: config.checkpoint, gc: { maxOldSummaryChars: config.gc.maxOldSummaryChars }, summaryHardMaxChars: config.compress.summaryHardMaxChars };
}

function recoveryStatus(runtime: SessionRuntime, state?: CompactState) {
  const checkpoint = runtime.checkpoint.snapshot();
  return {
    checkpointCoordinatorState: checkpoint.state,
    checkpointInFlight: checkpoint.inFlight,
    pressureStage: runtime.pressure?.stage ?? "Unverified",
    headroomTokens: runtime.pressure ? { value: runtime.pressure.headroomTokens, source: runtime.pressure.source } : { source: "Unverified" },
    deterministicCheckpointEligible: runtime.deterministicCheckpointEligible,
    nativeAutomaticFallback: "Unverified-effective" as const,
    nativeAutomaticFallbackProvenance: "Unverified" as const,
    legacyRepairStatus: runtime.legacyRepairStatus ?? "Unverified",
    lastRecoveryErrorCode: checkpoint.lastErrorCode ?? null,
    deterministicCheckpointCount: checkpoint.deterministicCheckpointCount,
    nativeFallbackCount: checkpoint.nativeFallbackCount,
    rescueCount: checkpoint.rescueCount,
    repairTransactionCount: state?.repairTransactionCount ?? 0,
    staleCallbackCount: checkpoint.staleCallbackCount,
  };
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

function success(
  message: string,
  contextTx: CompactTransaction | V3Transaction,
): AgentToolResult<{ contextTx: CompactTransaction | V3Transaction }> {
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

interface CoolingRuntimeEvidence {
  observations: readonly { identity: ResultObservationIdentity; successful: boolean; assistantTurnId: string }[];
}

function coolingExcludedEntryIds(view: V3RuntimeView): ReadonlySet<string> {
  return new Set([
    ...view.replay.maximalActiveBlocks.flatMap((block) => v3LeafEntryIds(view.state, block.blockId)),
    ...view.state.cooling.flatMap((cooling) => cooling.targetEntryIds),
  ]);
}

function runtimeCoolingEvidence(runtime: SessionRuntime): CoolingRuntimeEvidence {
  return { observations: runtime.coolingObservations };
}

export function findCoolingCandidates(
  entries: readonly SessionLikeEntry[], state: CompactState, limit = 16, config?: CompactConfig, cwd = "/",
  evidence?: CoolingRuntimeEvidence,
  additionalExcludedEntryIds: ReadonlySet<string> = new Set(),
): CompactBlock[] {
  const activeSourceIds = new Set([
    ...activeBlocks(state).flatMap((block) => block.sourceEntryIds),
    ...additionalExcludedEntryIds,
  ]);
  const blocks: CompactBlock[] = [];
  for (const [index, entry] of entries.entries()) {
    if (blocks.length >= Math.max(1, Math.min(16, limit))) break;
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "toolResult" || activeSourceIds.has(entry.id)) continue;
    const message = entry.message;
    const source = extractText(message.content); const toolName = typeof message.toolName === "string" ? message.toolName.toLocaleLowerCase() : undefined;
    const protection = config ? classifyProtection(entries, index, { cwd, ...config.protection }) : undefined;
    if (message.isError === true && config && !config.strategies.purgeErrors.enabled) continue;
    const subagent = toolName === "task" ? gateSubagentEntry(entries, index, config?.subagents.enabled === true) : undefined;
    if (source.length < MIN_COOLING_CHARS || hasImageContent(message.content) || !toolName
      || typeof message.toolCallId !== "string" || COMPACT_TOOL_NAMES.has(toolName)
      || protection?.protected || subagent?.protected
      || !hasPriorToolCallEntry(entries, index, message.toolCallId) || hasProtectedToolCallPath(entries, index, message.toolCallId)) continue;
    const toolCallId = message.toolCallId;
    const callEntry = entries.slice(0, index).reverse().find((candidate) => candidate.type === "message"
      && isRecord(candidate.message) && candidate.message.role === "assistant"
      && toolCallIds(candidate.message).includes(toolCallId));
    const observations = evidence?.observations ?? [];
    const observed = [...observations].reverse().find((candidate) => candidate.identity.resultEntryId === entry.id
      && candidate.identity.callId === toolCallId
      && candidate.identity.toolName.toLocaleLowerCase() === toolName
      && candidate.identity.resultBodyDigest === digest(source));
    if (!callEntry || !observed) continue;
    const equalResults = entries.flatMap((candidate) => candidate.type === "message" && isRecord(candidate.message)
      && candidate.message.role === "toolResult" && candidate.message.toolName === message.toolName
      && digest(extractText(candidate.message.content)) === digest(source) ? [candidate.id] : []);
    const durableRefs = hasDurableCoolingReference(entries, index, entry.id, toolCallId, source)
      ? [digest({ entryId: entry.id, toolCallId })]
      : [];
    const decision = evaluateToolResultCooling({
      identity: observed.identity,
      isError: message.isError === true,
      isComplete: true,
      hasBinaryOrSecret: hasImageContent(message.content) || protection?.protected === true,
      inCurrentTurn: !entries.slice(index + 1).some((candidate) => candidate.type === "message" && isRecord(candidate.message) && candidate.message.role === "user"),
      durableRefs,
      observations,
      latestEqualResultEntryId: equalResults.at(-1),
    });
    if (!decision.eligible) continue;
    const outcome = message.isError === true ? "error" : "success";
    const stub = decision.stub;
    blocks.push({ id: `cool:${entry.id}`, kind: "cool", epochId: state.epochId, sourceEntryIds: [entry.id],
      sourceDigest: sourceDigest(entries, [entry.id]), summary: `Consumed ${outcome} tool result ${toolName}`, stub, active: true });
  }
  return blocks;
}

function coolingObservationCandidates(
  entries: readonly SessionLikeEntry[],
  state: CompactState,
  sessionId: string,
  branchLeafId: string,
  providerInputIdentity: string,
  settledRequestId: string,
  view?: V3RuntimeView,
): ResultObservationIdentity[] {
  const activeSourceIds = new Set([
    ...activeBlocks(state).flatMap((block) => block.sourceEntryIds),
    ...(view?.replay.maximalActiveBlocks.flatMap((block) => v3LeafEntryIds(view.state, block.blockId)) ?? []),
    ...(view?.state.cooling.flatMap((cooling) => cooling.targetEntryIds) ?? []),
  ]);
  return entries.flatMap((entry, index) => {
    if (entry.type !== "message" || !isRecord(entry.message) || entry.message.role !== "toolResult"
      || typeof entry.message.toolCallId !== "string" || typeof entry.message.toolName !== "string"
      || activeSourceIds.has(entry.id)) return [];
    const message = entry.message;
    const toolCallId = message.toolCallId as string;
    const callEntry = entries.slice(0, index).reverse().find((candidate) => candidate.type === "message"
      && isRecord(candidate.message) && candidate.message.role === "assistant"
      && toolCallIds(candidate.message).includes(toolCallId));
    if (!callEntry) return [];
    return [{
      sessionId,
      branchLeafId,
      epochId: state.epochId,
      callEntryId: callEntry.id,
      callId: toolCallId,
      toolName: (message.toolName as string).toLocaleLowerCase(),
      resultEntryId: entry.id,
      resultBodyDigest: digest(extractText(message.content)),
      providerInputIdentity,
      settledRequestId,
    }];
  });
}

function coolingObservationCandidatesFromIndex(
  snapshot: NonNullable<BranchIndexCache["current"]>,
  alignment: BranchProviderAlignmentResult,
  state: CompactState,
  sessionId: string,
  branchLeafId: string,
  providerInputIdentity: string,
  settledRequestId: string,
  view?: V3RuntimeView,
): ResultObservationIdentity[] {
  const activeSourceIds = new Set([
    ...activeBlocks(state).flatMap((block) => block.sourceEntryIds),
    ...(view?.replay.maximalActiveBlocks.flatMap((block) => v3LeafEntryIds(view.state, block.blockId)) ?? []),
    ...(view?.state.cooling.flatMap((cooling) => cooling.targetEntryIds) ?? []),
  ]);
  const observations: ResultObservationIdentity[] = [];
  for (const [entryId, descriptor] of alignment.descriptorByEntryId) {
    if (descriptor.role !== "toolResult"
      || !descriptor.toolCallId
      || !descriptor.toolName
      || activeSourceIds.has(entryId)) continue;
    const atom = getBranchProtocolAtomForEntry(snapshot, entryId);
    if (!atom) continue;
    const callEntryId = atom.entryIds.find((candidateId) => {
      const candidate = alignment.descriptorByEntryId.get(candidateId);
      return candidate?.role === "assistant" && candidate.toolCallIds.includes(descriptor.toolCallId!);
    });
    if (!callEntryId) continue;
    observations.push({
      sessionId,
      branchLeafId,
      epochId: state.epochId,
      callEntryId,
      callId: descriptor.toolCallId,
      toolName: descriptor.toolName.toLocaleLowerCase(),
      resultEntryId: entryId,
      resultBodyDigest: descriptor.resultBodyDigest ?? digest(""),
      providerInputIdentity,
      settledRequestId,
    });
  }
  return observations;
}

function hasDurableCoolingReference(
  entries: readonly SessionLikeEntry[],
  resultIndex: number,
  resultEntryId: string,
  toolCallId: string,
  source: string,
): boolean {
  if (/\b(?:agent|job|task|hub)(?:Id|Ref)?\s*[:=]\s*[A-Za-z0-9._:-]+/u.test(source)) return true;
  return entries.slice(resultIndex + 1).some((entry) => {
    if (entry.type !== "message" || !isRecord(entry.message)) return false;
    const text = extractText(entry.message.content);
    return text.includes(resultEntryId) || text.includes(toolCallId);
  });
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

function manualPermitAllowsCall(
  entries: readonly SessionLikeEntry[],
  permit: ManualCompactPermit,
  toolCallId: string,
  sessionId: string,
  epochId: string,
): boolean {
  if (permit.state !== "armed" || permit.tuple.sessionId !== sessionId || permit.tuple.epochId !== epochId) return false;
  const anchorIndex = permit.turnId === "root" ? -1 : entries.findIndex((entry) => entry.id === permit.turnId);
  if (anchorIndex < -1) return false;
  const prefixSourceIds = entries.slice(0, anchorIndex + 1).filter((entry) => entry.type !== "custom").map((entry) => entry.id);
  if (`br_${digest(prefixSourceIds)}` !== permit.tuple.branchId) return false;
  const callIndex = entries.findIndex((entry, index) => index > anchorIndex && entry.type === "message" && isRecord(entry.message)
    && entry.message.role === "assistant" && toolCalls(entry.message).some((call) => call.id === toolCallId && call.name === "aili_compact"));
  if (callIndex < 0) return false;
  const between = entries.slice(anchorIndex + 1, callIndex);
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

function commandInputs(
  entries: readonly SessionLikeEntry[],
  state: CompactState,
  runtime: SessionRuntime,
  cwd: string,
  currentView?: V3RuntimeView,
): CompactCommandInputs {
  const view = currentView ?? buildV3RuntimeView(entries, state, { sessionId: "unavailable" });
  const catalog = view.catalog; const indexById = new Map(entries.map((entry, index) => [entry.id, index]));
  const active = activeBlocks(state);
  const activeV3 = view.replay.maximalActiveBlocks;
  const activeSources = new Set([
    ...active.flatMap((block) => block.sourceEntryIds),
    ...activeV3.flatMap((block) => v3LeafEntryIds(view.state, block.blockId)),
  ]);
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
  const cooling = new Set(findCoolingCandidates(entries, state, 16, runtime.config, cwd, runtimeCoolingEvidence(runtime), coolingExcludedEntryIds(view)).flatMap((block) => block.sourceEntryIds));
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
    activeRecaps: catalog.blocks.flatMap((reference) => {
      const legacyBlock = reference.family === "legacy" ? state.blocks.get(reference.blockId) : undefined;
      const v3Block = reference.family === "v3" ? view.state.blocks.get(reference.blockId) : undefined;
      const block = legacyBlock ?? v3Block;
      return block?.active ? [{ blockRef: reference.ref, topic: block.topic, summary: block.summary }] : [];
    }),
    blockEligibility: catalog.blocks.map((reference) => {
      const legacyBlock = reference.family === "legacy" ? state.blocks.get(reference.blockId) : undefined;
      const v3Block = reference.family === "v3" ? view.state.blocks.get(reference.blockId) : undefined;
      return {
        blockRef: reference.ref,
        active: reference.active,
        queryOnly: reference.queryOnly,
        deactivationReason: legacyBlock?.deactivationReason ?? v3Block?.deactivationReason,
      };
    }),
    policyReasons: [...new Set(candidates.flatMap((candidate) => candidate.reasonCodes))].map((code) => ({ code, count: candidates.filter((candidate) => candidate.reasonCodes.includes(code)).length })),
    stats: {
      session: { transactions: (state.transactionCount ?? 0) + view.replay.acceptedTransactionCount, blocks: state.blocks.size + view.state.blocks.size, sourceChars, projectedSavingChars },
      branch: { transactions: (state.transactionCount ?? 0) + view.replay.acceptedTransactionCount, blocks: state.blocks.size + view.state.blocks.size, activeBlocks: active.length + activeV3.length, cooledResults: active.filter((block) => block.kind === "cool").length },
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
