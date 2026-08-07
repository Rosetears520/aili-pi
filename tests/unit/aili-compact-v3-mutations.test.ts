import { describe, expect, it } from "vitest";
import { digest, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { TOOL_COOLING_PROFILE_VERSION } from "../../src/runtime/aili-compact/cooling-profiles.js";
import {
  QUALITY_EVALUATOR_VERSION,
  QUALITY_EXTRACTOR_VERSION,
  type QualityResultV1,
  type QualitySourceKind,
  type QualityTier,
} from "../../src/runtime/aili-compact/quality.js";
import type { BenefitDecision, SafeRangePlan } from "../../src/runtime/aili-compact/safe-planning.js";
import {
  V3_MUTATION_PLANNER_LIMITS,
  planV3BlockMutation,
  planV3ControlMutation,
  planV3CoolingMutation,
  planV3DecompressMutation,
  planV3MessageMutation,
  planV3Mutation,
  planV3RecompressMutation,
  resolveV3RestillPlannerPolicy,
  v3BlockSourceDigest,
  type V3BenefitEvidence,
  type V3BlockMutationRequest,
  type V3MessageMutationRequest,
  type V3MutationPlannerContext,
  type V3QualityEvidence,
} from "../../src/runtime/aili-compact/v3-mutations.js";
import {
  classifyTransparentPromotionGaps,
  type PromotionGapBlock,
} from "../../src/runtime/aili-compact/promotion-gaps.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  V3_LIMITS,
  advanceV3Epoch,
  applyV3Transaction,
  createEmptyV3State,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3SemanticBlock,
  type V3SemanticCreatePayload,
  type V3Tier,
  type V3TokenMetadata,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

function initialState(): V3LifecycleState {
  return createEmptyV3State({
    sessionId: "session",
    branchLeafId: "branch",
    epochId: "epoch",
    projectionVersion: "projection-v3",
  });
}

function header(state: V3LifecycleState, txId: string, createdAt = 1) {
  return {
    schema: AILI_COMPACT_SCHEMA_V3,
    txId,
    sessionId: state.sessionId,
    branchLeafId: state.branchLeafId,
    epochId: state.epochId,
    catalogId: state.catalogId,
    createdAt,
    projectionVersion: state.projectionVersion,
  } as const;
}

function tokenMetadata(tier: V3Tier, overrides: Partial<V3TokenMetadata> = {}): V3TokenMetadata {
  const sourceTokensLower = tier === "T3" ? 10_000 : 3_000;
  const sourceTokensUpper = sourceTokensLower;
  const replacementTokensUpper = tier === "T3" ? 7_000 : 1_500;
  const steadySavingsTokensLower = sourceTokensLower - replacementTokensUpper;
  const oneTimeCostTokensUpper = 500;
  const base: V3TokenMetadata = {
    estimatorVersion: "estimator-v1",
    providerId: "provider",
    modelId: "model",
    sourceTokensLower,
    sourceTokensUpper,
    replacementTokensUpper,
    steadySavingsTokensLower,
    oneTimeCostTokensUpper,
    breakEvenTurnsUpper: Math.ceil(oneTimeCostTokensUpper / steadySavingsTokensLower),
    savingsRatio: steadySavingsTokensLower / sourceTokensUpper,
    summaryTokensUpper: 300,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    steadySavingsTokensLower: overrides.steadySavingsTokensLower
      ?? merged.sourceTokensLower - merged.replacementTokensUpper,
    breakEvenTurnsUpper: overrides.breakEvenTurnsUpper
      ?? Math.ceil(merged.oneTimeCostTokensUpper / (overrides.steadySavingsTokensLower
        ?? merged.sourceTokensLower - merged.replacementTokensUpper)),
    savingsRatio: overrides.savingsRatio
      ?? (overrides.steadySavingsTokensLower ?? merged.sourceTokensLower - merged.replacementTokensUpper)
        / merged.sourceTokensUpper,
  };
}

function acceptedMetadata() {
  return {
    status: "accepted" as const,
    evaluatorVersion: QUALITY_EVALUATOR_VERSION,
    sourceFactDigest: "f".repeat(64),
    hardFactCount: 0,
    coveredHardFactCount: 0,
    warningCodes: [] as string[],
  };
}

function semanticTransaction(state: V3LifecycleState, txId: string, payload: V3SemanticCreatePayload): V3Transaction {
  return { header: header(state, txId, payload.createdTurnOrdinal), tag: "semantic-create", payload };
}

function t1Transaction(
  state: V3LifecycleState,
  blockId: string,
  ordinal: number,
  createdTurnOrdinal = 1,
): V3Transaction {
  const entryId = `entry:${ordinal}`;
  const summary = `summary:${blockId}`;
  return semanticTransaction(state, `tx:${blockId}`, {
    blockId,
    tier: "T1",
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: entryId,
    createdTurnOrdinal,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "messages", entryIds: [entryId], firstEntryId: entryId, lastEntryId: entryId },
    leafDigest: v3MessageLeafDigest([entryId]),
    leafCount: 1,
    tokens: tokenMetadata("T1"),
    quality: acceptedMetadata(),
  });
}

function parentTransaction(
  state: V3LifecycleState,
  blockId: string,
  tier: "T2" | "T3",
  childIds: readonly string[],
  createdTurnOrdinal: number,
): V3Transaction {
  const children = childIds.map((id) => state.blocks.get(id)!);
  const leafCount = children.reduce((total, child) => total + child.leafCount, 0);
  const summary = `summary:${blockId}`;
  return semanticTransaction(state, `tx:${blockId}`, {
    blockId,
    tier,
    topic: `topic:${blockId}`,
    runId: `run:${blockId}`,
    anchorEntryId: children[0]!.anchorEntryId,
    createdTurnOrdinal,
    summary,
    summaryDigest: v3SummaryDigest(summary),
    source: { kind: "blocks", childBlockIds: [...childIds] },
    leafDigest: v3ParentLeafDigest(tier, leafCount, children.map((child) => child.leafDigest)),
    leafCount,
    tokens: tokenMetadata(tier),
    quality: acceptedMetadata(),
  });
}

function apply(
  state: V3LifecycleState,
  transaction: V3Transaction,
  messageOrdinals?: ReadonlyMap<string, number>,
): V3LifecycleState {
  const result = applyV3Transaction(state, transaction, { messageOrdinals });
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function addT1(state: V3LifecycleState, blockId: string, ordinal: number, turn = 1): V3LifecycleState {
  return apply(state, t1Transaction(state, blockId, ordinal, turn), new Map([[`entry:${ordinal}`, ordinal]]));
}

function addParent(
  state: V3LifecycleState,
  blockId: string,
  tier: "T2" | "T3",
  childIds: readonly string[],
  turn: number,
): V3LifecycleState {
  return apply(state, parentTransaction(state, blockId, tier, childIds, turn));
}

function qualityResult(
  tier: QualityTier,
  sourceKind: QualitySourceKind,
  catalogId: string,
  orderedRefs: readonly string[],
  sourceDigest: string,
): QualityResultV1 {
  const counts = {
    totalFacts: 0,
    hardFacts: 0,
    warningFacts: 0,
    optionalFacts: 0,
    coveredFacts: 0,
    coveredHardFacts: 0,
    coveredWarningFacts: 0,
    coveredOptionalFacts: 0,
    missingHardFacts: 0,
    missingWarningFacts: 0,
    scorePermille: 1_000,
  };
  return {
    version: 1,
    evaluatorVersion: QUALITY_EVALUATOR_VERSION,
    verdict: "pass",
    codes: [],
    counts,
    qualityEvidence: {
      version: 1,
      extractorVersion: QUALITY_EXTRACTOR_VERSION,
      evaluatorVersion: QUALITY_EVALUATOR_VERSION,
      tier,
      catalogId,
      sourceKind,
      orderedRefs: [...orderedRefs],
      sourceDigest,
      manifestDigest: digest(["manifest", tier, sourceKind, sourceDigest]),
      facts: [],
      verdict: "pass",
      codes: [],
      counts,
    },
  };
}

function qualityEvidence(
  tier: QualityTier,
  sourceKind: QualitySourceKind,
  catalogId: string,
  orderedRefs: readonly string[],
  sourceDigest: string,
  summary: string,
): V3QualityEvidence {
  return {
    input: {
      version: 1,
      tier,
      catalogId,
      sourceKind,
      orderedRefs: [...orderedRefs],
      sourceDigest,
      summary,
    },
    result: qualityResult(tier, sourceKind, catalogId, orderedRefs, sourceDigest),
  };
}

function benefitEvidence(
  tier: V3Tier,
  orderedRefs: readonly string[],
  sourceDigest: string,
  tokens = tokenMetadata(tier),
  summary = "summary",
): V3BenefitEvidence {
  const decision: BenefitDecision = {
    eligible: true,
    reasons: [],
    tier,
    pressureStage: "NORMAL",
    horizonTurns: 8,
    sourceLower: tokens.sourceTokensLower,
    sourceUpper: tokens.sourceTokensUpper,
    replacementUpper: tokens.replacementTokensUpper,
    steadySavingsLower: tokens.steadySavingsTokensLower,
    savingsRatio: tokens.savingsRatio,
    oneTimeCostUpper: tokens.oneTimeCostTokensUpper,
    breakEvenTurnsUpper: tokens.breakEvenTurnsUpper,
    netSavingsLower: 8 * tokens.steadySavingsTokensLower - tokens.oneTimeCostTokensUpper,
    saturated: false,
  };
  return { sourceDigest, summaryDigest: v3SummaryDigest(summary), orderedRefs: [...orderedRefs], decision, tokens };
}

function safePlan(
  catalogId: string,
  refs: readonly string[],
  entryIds: readonly string[],
  sourceDigest: string,
  tokens = tokenMetadata("T1"),
): SafeRangePlan {
  const tokenBounds = {
    lower: tokens.sourceTokensLower,
    upper: tokens.sourceTokensUpper,
    saturated: false,
    source: "provider-calibrated" as const,
    profileKey: "provider/model/estimator-v1",
  };
  return {
    version: "aili.safe-planning.v1",
    atomVersion: "atoms-v1",
    catalogId,
    catalogScopeDigest: digest(["catalog-scope", catalogId]),
    scopeDigest: digest(["scope", ...refs]),
    sourceDigest: digest(["plan", sourceDigest]),
    tokenProfile: {
      providerId: tokens.providerId,
      modelId: tokens.modelId,
      estimatorVersion: tokens.estimatorVersion,
      source: "provider-calibrated",
      profileKey: tokenBounds.profileKey,
      minBytesPerToken: 1,
      maxBytesPerToken: 4,
      messageOverheadLower: 1,
      messageOverheadUpper: 2,
      toolPartOverheadLower: 1,
      toolPartOverheadUpper: 2,
    },
    tail: {
      configuredAtoms: 8,
      configuredTokens: 12_000,
      tokenCapRatio: 0.1,
      effectiveTokenBudget: 12_000,
      windowSource: "fallback",
      protectedAtomIds: [],
      coveredTokenBounds: { ...tokenBounds, lower: 0, upper: 0 },
    },
    ranges: [{
      rangeId: digest(["range", ...refs]),
      catalogId,
      catalogScopeDigest: digest(["catalog-scope", catalogId]),
      scopeDigest: digest(["range-scope", ...refs]),
      sourceDigest,
      atomIds: refs.map((ref) => `atom:${ref}`),
      orderedEntryIds: [...entryIds],
      orderedRefs: [...refs],
      startRef: refs[0]!,
      endRef: refs.at(-1)!,
      tokenBounds,
    }],
    protectedAtoms: [],
    exclusionCounts: {} as SafeRangePlan["exclusionCounts"],
    diagnostics: [],
  };
}

function messageContext(state: V3LifecycleState, protectedRef?: string) {
  const refs = ["m000001", "m000002"];
  const entryIds = ["entry:1", "entry:2"];
  const sourceDigest = digest(["message-source", ...entryIds]);
  const plan = safePlan(state.catalogId, refs, entryIds, sourceDigest);
  const context: V3MutationPlannerContext = {
    state,
    safePlan: plan,
    catalog: {
      catalogId: state.catalogId,
      stateCatalogId: state.catalogId,
      sessionId: state.sessionId,
      branchLeafId: state.branchLeafId,
      epochId: state.epochId,
      projectionVersion: state.projectionVersion,
      messageRefs: refs.map((ref, index) => ({
        ref,
        entryId: entryIds[index]!,
        effectiveSourceOrdinal: index + 1,
        protected: ref === protectedRef,
      })),
      blockRefs: [],
    },
  };
  return { context, refs, entryIds, sourceDigest };
}

function blockContext(
  state: V3LifecycleState,
  onlyIds?: readonly string[],
  promotionGapEntries: readonly SessionLikeEntry[] = [],
) {
  const blocks = [...state.blocks.values()]
    .filter((block) => onlyIds === undefined || onlyIds.includes(block.blockId))
    .sort((left, right) => left.firstLeafOrdinal - right.firstLeafOrdinal || left.blockId.localeCompare(right.blockId));
  const blockRefs = blocks.map((block, index) => ({
    ref: `b${String(index + 1).padStart(6, "0")}`,
    blockId: block.blockId,
    effectiveSourceOrdinal: block.firstLeafOrdinal,
  }));
  const refById = new Map(blockRefs.map((item) => [item.blockId, item.ref] as const));
  const context: V3MutationPlannerContext = {
    state,
    catalog: {
      catalogId: state.catalogId,
      stateCatalogId: state.catalogId,
      sessionId: state.sessionId,
      branchLeafId: state.branchLeafId,
      epochId: state.epochId,
      projectionVersion: state.projectionVersion,
      messageRefs: [],
      blockRefs,
    },
    promotionGapEntries,
  };
  return { context, refById };
}

function messageEntry(
  id: string,
  message: Record<string, unknown>,
): SessionLikeEntry {
  return { id, type: "message", message };
}

function promotionChildren(): { blocks: Map<string, PromotionGapBlock>; children: PromotionGapBlock[] } {
  const children: PromotionGapBlock[] = [
    {
      blockId: "left",
      firstLeafOrdinal: 1,
      lastLeafOrdinal: 1,
      source: { kind: "messages", entryIds: ["entry:1"] },
    },
    {
      blockId: "right",
      firstLeafOrdinal: 4,
      lastLeafOrdinal: 4,
      source: { kind: "messages", entryIds: ["entry:4"] },
    },
  ];
  return { blocks: new Map(children.map((block) => [block.blockId, block])), children };
}

function promotionChildrenFor(entries: readonly SessionLikeEntry[]): { blocks: Map<string, PromotionGapBlock>; children: PromotionGapBlock[] } {
  const providerCount = entries.filter((entry) => entry.type === "message" && entry.message !== undefined).length;
  const children: PromotionGapBlock[] = [
    {
      blockId: "left",
      firstLeafOrdinal: 1,
      lastLeafOrdinal: 1,
      source: { kind: "messages", entryIds: ["entry:1"] },
    },
    {
      blockId: "right",
      firstLeafOrdinal: providerCount,
      lastLeafOrdinal: providerCount,
      source: { kind: "messages", entryIds: ["entry:4"] },
    },
  ];
  return { blocks: new Map(children.map((block) => [block.blockId, block])), children };
}

function blockRequest(
  context: V3MutationPlannerContext,
  blockRefs: readonly string[],
  blockId = "planned-parent",
  createdTurnOrdinal = 10,
  tokenOverride?: V3TokenMetadata,
): V3BlockMutationRequest {
  const selected = blockRefs.map((ref) => {
    const catalog = context.catalog.blockRefs.find((item) => item.ref === ref)!;
    return { catalog, block: context.state.blocks.get(catalog.blockId)! };
  }).sort((left, right) => left.catalog.effectiveSourceOrdinal - right.catalog.effectiveSourceOrdinal);
  const tier: V3Tier = selected[0]!.block.tier === "T1" ? "T2" : "T3";
  const orderedRefs = selected.map((item) => item.catalog.ref);
  const sourceDigest = v3BlockSourceDigest(context.catalog.catalogId, selected.map((item) => item.block));
  const summary = `summary:${blockId}`;
  return {
    operation: "compact",
    mode: "blocks",
    catalogId: context.catalog.catalogId,
    transactionId: `tx:${blockId}`,
    blockId,
    topic: `topic:${blockId}`,
    summary,
    summaryMaxChars: 6_000,
    runId: `run:${blockId}`,
    createdAt: createdTurnOrdinal,
    createdTurnOrdinal,
    blockRefs,
    benefit: benefitEvidence(tier, orderedRefs, sourceDigest, tokenOverride ?? tokenMetadata(tier), summary),
    quality: qualityEvidence(tier, "blocks", context.catalog.catalogId, orderedRefs, sourceDigest, summary),
  };
}

function activeT3Run(count = 2): V3LifecycleState {
  let state = initialState();
  for (let ordinal = 1; ordinal <= count * 4; ordinal += 1) state = addT1(state, `t1:${ordinal}`, ordinal);
  for (let index = 0; index < count * 2; index += 1) {
    state = addParent(state, `t2:${index + 1}`, "T2", [`t1:${index * 2 + 1}`, `t1:${index * 2 + 2}`], 2);
  }
  for (let index = 0; index < count; index += 1) {
    state = addParent(state, `t3:${index + 1}`, "T3", [`t2:${index * 2 + 1}`, `t2:${index * 2 + 2}`], 3);
  }
  return state;
}

function restillFixture(count = 2) {
  const state = activeT3Run(count);
  const blockIds = Array.from({ length: count }, (_, index) => `t3:${index + 1}`);
  const fixture = blockContext(state, blockIds);
  return {
    ...fixture,
    refs: blockIds.map((blockId) => fixture.refById.get(blockId)!),
  };
}

describe("v3 exact T1 mutation planning", () => {
  it("maps one exact current safe range into an applicable T1 transaction without mutating state", () => {
    const state = initialState();
    const { context, refs, entryIds, sourceDigest } = messageContext(state);
    const request: V3MessageMutationRequest = {
      operation: "compact",
      mode: "message",
      catalogId: state.catalogId,
      messageRefs: refs,
      transactionId: "tx:t1",
      blockId: "t1:planned",
      topic: "exact topic",
      summary: "exact safe summary",
      summaryMaxChars: 6_000,
      runId: "run:t1",
      createdAt: 1,
      createdTurnOrdinal: 1,
      benefit: benefitEvidence("T1", refs, sourceDigest, tokenMetadata("T1"), "exact safe summary"),
      quality: qualityEvidence("T1", "messages", state.catalogId, refs, sourceDigest, "exact safe summary"),
    };

    const result = planV3Mutation(request, context);
    expect(result).toMatchObject({ ok: true, orderedRefs: refs, sourceDigest, targetTier: "T1" });
    expect(state.blocks.size).toBe(0);
    if (!result.ok || result.transaction.tag !== "semantic-create") return;
    expect(result.transaction.payload).toMatchObject({
      tier: "T1",
      source: { kind: "messages", entryIds, firstEntryId: entryIds[0], lastEntryId: entryIds[1] },
      leafDigest: v3MessageLeafDigest(entryIds),
      leafCount: 2,
      quality: { status: "accepted", hardFactCount: 0, coveredHardFactCount: 0 },
    });
    expect(applyV3Transaction(state, result.transaction, {
      messageOrdinals: new Map(entryIds.map((id, index) => [id, index + 1])),
    }).ok).toBe(true);

    const { messageRefs: _messageRefs, ...semanticFields } = request;
    const rangeRequest: V3MessageMutationRequest = {
      ...semanticFields,
      transactionId: "tx:t1:range",
      blockId: "t1:range",
      mode: "range",
      startRef: refs[0]!,
      endRef: refs.at(-1)!,
    };
    expect(planV3MessageMutation(rangeRequest, context)).toMatchObject({ ok: true, orderedRefs: refs });
  });

  it("accepts exactly 256 message leaves and rejects the 257th before transaction construction", () => {
    const run = (count: number) => {
      const state = initialState();
      const refs = Array.from({ length: count }, (_, index) => `m${String(index + 1).padStart(6, "0")}`);
      const entryIds = Array.from({ length: count }, (_, index) => `entry:${index + 1}`);
      const sourceDigest = digest(["message-source", ...entryIds]);
      const context: V3MutationPlannerContext = {
        state,
        safePlan: safePlan(state.catalogId, refs, entryIds, sourceDigest),
        catalog: {
          catalogId: state.catalogId,
          stateCatalogId: state.catalogId,
          sessionId: state.sessionId,
          branchLeafId: state.branchLeafId,
          epochId: state.epochId,
          projectionVersion: state.projectionVersion,
          messageRefs: refs.map((ref, index) => ({ ref, entryId: entryIds[index]!, effectiveSourceOrdinal: index + 1 })),
          blockRefs: [],
        },
      };
      const request: V3MessageMutationRequest = {
        operation: "compact", mode: "message", catalogId: state.catalogId, messageRefs: refs,
        transactionId: `tx:${count}`, blockId: `t1:${count}`, topic: "topic", summary: "summary", runId: "run",
        createdAt: 1, createdTurnOrdinal: 1,
        benefit: benefitEvidence("T1", refs, sourceDigest),
        quality: qualityEvidence("T1", "messages", state.catalogId, refs, sourceDigest, "summary"),
      };
      return planV3MessageMutation(request, context);
    };
    expect(run(256)).toMatchObject({ ok: true, targetTier: "T1" });
    expect(run(257)).toMatchObject({ ok: false, code: "source-summary-scope-mismatch" });
  });

  it("fails closed for non-exact scope, protected source, benefit drift, and quality drift", () => {
    const state = initialState();
    const fixture = messageContext(state);
    const base: V3MessageMutationRequest = {
      operation: "compact",
      mode: "message",
      catalogId: state.catalogId,
      messageRefs: fixture.refs,
      transactionId: "tx:t1",
      blockId: "t1",
      topic: "topic",
      summary: "summary",
      runId: "run",
      createdAt: 1,
      createdTurnOrdinal: 1,
      benefit: benefitEvidence("T1", fixture.refs, fixture.sourceDigest),
      quality: qualityEvidence("T1", "messages", state.catalogId, fixture.refs, fixture.sourceDigest, "summary"),
    };
    expect(planV3MessageMutation({ ...base, messageRefs: [fixture.refs[0]!] }, fixture.context))
      .toMatchObject({ ok: false, code: "source-summary-scope-mismatch" });
    expect(planV3MessageMutation(base, messageContext(state, fixture.refs[1]).context))
      .toMatchObject({ ok: false, code: "protected-source" });
    expect(planV3MessageMutation({
      ...base,
      benefit: { ...base.benefit, sourceDigest: "a".repeat(64) },
    }, fixture.context)).toMatchObject({ ok: false, code: "benefit-mismatch" });
    expect(planV3MessageMutation({
      ...base,
      benefit: {
        ...base.benefit,
        decision: { ...base.benefit.decision, eligible: false, reasons: ["minimum-steady-savings"] },
      },
    }, fixture.context)).toMatchObject({ ok: false, code: "benefit-rejected" });
    expect(planV3MessageMutation({
      ...base,
      quality: qualityEvidence("T1", "messages", state.catalogId, fixture.refs, "a".repeat(64), "summary"),
    }, fixture.context)).toMatchObject({ ok: false, code: "quality-mismatch" });
    expect(state.blocks.size).toBe(0);
  });
});

describe("v3 block-mode promotion and restill planning", () => {
  it("classifies only complete AILI planning atoms and rejects bounded gap failures", () => {
    const { blocks, children } = promotionChildren();
    const complete = [
      messageEntry("entry:1", { role: "assistant", content: "left" }),
      messageEntry("status:call", {
        role: "assistant",
        toolCalls: [{ id: "status:call", name: "aili_compact_status" }],
      }),
      messageEntry("status:result", {
        role: "toolResult",
        toolCallId: "status:call",
        toolName: "aili_compact_status",
        content: "ok",
      }),
      messageEntry("entry:4", { role: "assistant", content: "right" }),
    ];
    expect(classifyTransparentPromotionGaps(complete, blocks, children)).toMatchObject({
      ok: true,
      proofs: [{
        version: 1,
        leftChildBlockId: "left",
        rightChildBlockId: "right",
        leftLeafEntryId: "entry:1",
        rightLeafEntryId: "entry:4",
        messageCount: 2,
        gapDigest: expect.any(String),
      }],
    });

    const cases: Array<{ entries: SessionLikeEntry[]; reason: string }> = [
      {
        entries: [
          complete[0]!,
          messageEntry("ordinary", { role: "assistant", content: "not planning" }),
          complete[3]!,
        ],
        reason: "non-transparent-protocol",
      },
      {
        entries: [
          complete[0]!,
          messageEntry("third-party:call", { role: "assistant", toolCalls: [{ id: "third-party:call", name: "read" }] }),
          messageEntry("third-party:result", { role: "toolResult", toolCallId: "third-party:call", toolName: "read", content: "ok" }),
          complete[3]!,
        ],
        reason: "non-aili-planning-message",
      },
      {
        entries: [
          complete[0]!,
          complete[1]!,
          complete[3]!,
        ],
        reason: "non-transparent-protocol",
      },
      {
        entries: [
          complete[0]!,
          complete[1]!,
          messageEntry("status:wrong-result", {
            role: "toolResult",
            toolCallId: "other-call",
            toolName: "aili_compact_status",
            content: "malformed",
          }),
          complete[3]!,
        ],
        reason: "non-transparent-protocol",
      },
      {
        entries: [
          complete[0]!,
          complete[1]!,
          complete[2]!,
          messageEntry("mixed:ordinary", { role: "user", content: "mixed gap" }),
          complete[3]!,
        ],
        reason: "non-transparent-protocol",
      },
      {
        entries: [complete[0]!, complete[1]!, complete[2]!],
        reason: "missing-or-mismatched-endpoint",
      },
    ];
    for (const testCase of cases) {
      const testChildren = testCase.entries.some((entry) => entry.id === "entry:4")
        ? promotionChildrenFor(testCase.entries)
        : { blocks, children };
      expect(classifyTransparentPromotionGaps(testCase.entries, testChildren.blocks, testChildren.children)).toEqual({
        ok: false,
        pairIndex: 0,
        reason: testCase.reason,
      });
    }

    const oversized = [
      complete[0]!,
      ...Array.from({ length: 257 }, (_, index) => messageEntry(`oversized:${index}`, { role: "assistant", content: "gap" })),
      complete[3]!,
    ];
    const oversizedChildren = promotionChildrenFor(oversized);
    expect(classifyTransparentPromotionGaps(oversized, oversizedChildren.blocks, oversizedChildren.children)).toMatchObject({
      ok: false,
      reason: "oversized-gap",
    });

    const tooManyChildren = Array.from({ length: 17 }, (_, index): PromotionGapBlock => ({
      blockId: `child:${index}`,
      firstLeafOrdinal: index + 1,
      lastLeafOrdinal: index + 1,
      source: { kind: "messages", entryIds: [`child-entry:${index}`] },
    }));
    expect(classifyTransparentPromotionGaps(
      tooManyChildren.map((child) => messageEntry(child.source.kind === "messages" ? child.source.entryIds[0]! : child.blockId, { role: "assistant", content: "child" })),
      new Map(tooManyChildren.map((child) => [child.blockId, child])),
      tooManyChildren,
    )).toMatchObject({ ok: false, reason: "invalid-child-count" });
  });

  it("persists a replayable proof when block planning bridges only AILI protocol", () => {
    let state = initialState();
    state = addT1(state, "gap:left", 1);
    state = addT1(state, "gap:right", 4);
    const entries = [
      messageEntry("entry:1", { role: "assistant", content: "left" }),
      messageEntry("status:call", {
        role: "assistant",
        toolCalls: [{ id: "status:call", name: "aili_compact_status" }],
      }),
      messageEntry("status:result", {
        role: "toolResult",
        toolCallId: "status:call",
        toolName: "aili_compact_status",
        content: "ok",
      }),
      messageEntry("entry:4", { role: "assistant", content: "right" }),
    ];
    const fixture = blockContext(state, undefined, entries);
    const refs = [fixture.refById.get("gap:left")!, fixture.refById.get("gap:right")!];
    const result = planV3BlockMutation(blockRequest(fixture.context, refs, "gap-parent"), fixture.context);

    expect(result).toMatchObject({ ok: true, targetTier: "T2", orderedRefs: refs });
    if (!result.ok || result.transaction.tag !== "semantic-create") return;
    expect(result.transaction.payload.source).toMatchObject({
      kind: "blocks",
      childBlockIds: ["gap:left", "gap:right"],
      transparentGaps: [{
        version: 1,
        leftChildBlockId: "gap:left",
        rightChildBlockId: "gap:right",
        leftLeafEntryId: "entry:1",
        rightLeafEntryId: "entry:4",
        messageCount: 2,
        gapDigest: expect.any(String),
      }],
    });
    expect(result.transaction.payload.leafCount).toBe(2);
    expect(state.blocks.size).toBe(2);
  });

  it("sorts caller refs by effective source ordinal and accepts the exact 2 and 16 child boundaries", () => {
    let state = initialState();
    for (let ordinal = 1; ordinal <= 16; ordinal += 1) state = addT1(state, `t1:${ordinal}`, ordinal);
    const fixture = blockContext(state, Array.from({ length: 16 }, (_, index) => `t1:${index + 1}`));
    const refs = Array.from({ length: 16 }, (_, index) => fixture.refById.get(`t1:${index + 1}`)!);

    const twoRequest = blockRequest(fixture.context, [refs[1]!, refs[0]!], "t2:two");
    twoRequest.topic = "t".repeat(200);
    twoRequest.summaryMaxChars = 256;
    const two = planV3BlockMutation(twoRequest, fixture.context);
    expect(two).toMatchObject({ ok: true, orderedRefs: [refs[0], refs[1]], targetTier: "T2" });
    if (two.ok && two.transaction.tag === "semantic-create") {
      expect(two.transaction.payload.source).toEqual({ kind: "blocks", childBlockIds: ["t1:1", "t1:2"] });
    }

    const sixteen = planV3BlockMutation(blockRequest(fixture.context, [...refs].reverse(), "t2:sixteen"), fixture.context);
    expect(sixteen).toMatchObject({ ok: true, orderedRefs: refs, targetTier: "T2" });
    expect(planV3BlockMutation(blockRequest(fixture.context, [refs[0]!], "too-few"), fixture.context))
      .toMatchObject({ ok: false, code: "invalid-request" });
    expect(planV3BlockMutation({
      ...blockRequest(fixture.context, refs, "too-many"),
      blockRefs: [...refs, "b999999"],
    }, fixture.context)).toMatchObject({ ok: false, code: "invalid-request" });
    expect(planV3BlockMutation({ ...twoRequest, topic: "t".repeat(201) }, fixture.context))
      .toMatchObject({ ok: false, code: "invalid-request" });
    expect(planV3BlockMutation({ ...twoRequest, summaryMaxChars: 255 }, fixture.context))
      .toMatchObject({ ok: false, code: "invalid-request" });
  });

  it("rejects duplicate, stale, legacy, query-only, inactive, mixed-tier, active-parent, gaps, and protection", () => {
    let baseState = addT1(initialState(), "t1:1", 1);
    baseState = addT1(baseState, "t1:2", 2);
    baseState = addT1(baseState, "t1:3", 3);
    const base = blockContext(baseState);
    const r1 = base.refById.get("t1:1")!;
    const r2 = base.refById.get("t1:2")!;
    expect(planV3BlockMutation(blockRequest(base.context, [r1, r1]), base.context))
      .toMatchObject({ ok: false, code: "duplicate-ref" });
    expect(planV3BlockMutation({ ...blockRequest(base.context, [r1, r2]), catalogId: "0".repeat(64) }, base.context))
      .toMatchObject({ ok: false, code: "stale-catalog" });
    expect(planV3BlockMutation({
      ...blockRequest(base.context, [r1, r2]),
      blockRefs: [r1, "b999998"],
    }, base.context)).toMatchObject({ ok: false, code: "stale-ref" });

    const legacyContext: V3MutationPlannerContext = {
      ...base.context,
      catalog: {
        ...base.context.catalog,
        blockRefs: [...base.context.catalog.blockRefs, {
          ref: "b999999", blockId: "legacy:1", effectiveSourceOrdinal: 4, legacy: true,
        }],
      },
    };
    expect(planV3BlockMutation({ ...blockRequest(base.context, [r1, r2]), blockRefs: [r1, "b999999"] }, legacyContext))
      .toMatchObject({ ok: false, code: "legacy-block" });

    let parentState = addParent(baseState, "t2:1", "T2", ["t1:1", "t1:2"], 2);
    const parentFixture = blockContext(parentState);
    const childRefs = [parentFixture.refById.get("t1:1")!, parentFixture.refById.get("t1:2")!];
    expect(planV3BlockMutation(blockRequest(parentFixture.context, childRefs, "new-parent"), parentFixture.context))
      .toMatchObject({ ok: false, code: "active-parent" });

    const mixedRefs = [parentFixture.refById.get("t2:1")!, parentFixture.refById.get("t1:3")!];
    expect(planV3BlockMutation(blockRequest(parentFixture.context, mixedRefs, "mixed"), parentFixture.context))
      .toMatchObject({ ok: false, code: "mixed-tier" });

    let gapState = addT1(initialState(), "gap:1", 1);
    gapState = addT1(gapState, "gap:3", 3);
    const gap = blockContext(gapState);
    const gapRefs = [gap.refById.get("gap:1")!, gap.refById.get("gap:3")!];
    expect(planV3BlockMutation(blockRequest(gap.context, gapRefs, "gap-parent"), gap.context))
      .toMatchObject({ ok: false, code: "invalid-promotion-gap" });
    expect(planV3BlockMutation(blockRequest({ ...base.context, protectedIntervals: [{ firstOrdinal: 2, lastOrdinal: 2 }] }, [r1, r2]), {
      ...base.context, protectedIntervals: [{ firstOrdinal: 2, lastOrdinal: 2 }],
    })).toMatchObject({ ok: false, code: "protected-source" });

    const advanced = advanceV3Epoch(baseState, "epoch:next");
    if (!advanced.ok) throw new Error(`${advanced.code}:${advanced.path}`);
    const queryState = advanced.value;
    const queryFixture = blockContext(queryState);
    const queryRefs = [queryFixture.refById.get("t1:1")!, queryFixture.refById.get("t1:2")!];
    expect(planV3BlockMutation(blockRequest(queryFixture.context, queryRefs, "query"), queryFixture.context))
      .toMatchObject({ ok: false, code: "query-only-child" });

    const restored = apply(baseState, {
      header: header(baseState, "restore-all"),
      tag: "control",
      payload: {
        action: "restore-all", targetBlockIds: [], provenance: { kind: "explicit-user", id: "user:restore" }, reason: "restore-all",
      },
    });
    const inactive = blockContext(restored);
    const inactiveRefs = [inactive.refById.get("t1:1")!, inactive.refById.get("t1:2")!];
    expect(planV3BlockMutation(blockRequest(inactive.context, inactiveRefs, "inactive"), inactive.context))
      .toMatchObject({ ok: false, code: "inactive-child" });
  });

  it("enforces strict default T3 restill thresholds at and across their boundaries", () => {
    const fixture = restillFixture();
    const refs = [...fixture.refs].reverse();
    const boundaryTokens = tokenMetadata("T3", {
      sourceTokensLower: 8_000,
      sourceTokensUpper: 8_000,
      replacementTokensUpper: 6_000,
      steadySavingsTokensLower: 2_000,
      savingsRatio: 0.25,
      summaryTokensUpper: 3_000,
    });
    const accepted = planV3BlockMutation(blockRequest(fixture.context, refs, "t3:restill", 11, boundaryTokens), fixture.context);
    expect(accepted).toMatchObject({ ok: true, targetTier: "T3" });

    expect(planV3BlockMutation(blockRequest(fixture.context, refs, "young", 10, boundaryTokens), fixture.context))
      .toMatchObject({ ok: false, code: "restill-ineligible" });
    expect(planV3BlockMutation(blockRequest(fixture.context, refs, "summary-large", 11, {
      ...boundaryTokens, summaryTokensUpper: 3_001,
    }), fixture.context)).toMatchObject({ ok: false, code: "restill-ineligible" });
    const lowRatio = tokenMetadata("T3", {
      sourceTokensLower: 10_000,
      sourceTokensUpper: 10_000,
      replacementTokensUpper: 7_600,
      steadySavingsTokensLower: 2_400,
      savingsRatio: 0.24,
    });
    expect(planV3BlockMutation(blockRequest(fixture.context, refs, "ratio-low", 11, lowRatio), fixture.context))
      .toMatchObject({ ok: false, code: "restill-ineligible" });
    expect(planV3BlockMutation(blockRequest({ ...fixture.context, restillEnabled: false }, refs, "disabled", 11, boundaryTokens), {
      ...fixture.context, restillEnabled: false,
    })).toMatchObject({ ok: false, code: "restill-ineligible" });
  });

  it("ignores attempts to loosen any runtime restill policy below the stable defaults", () => {
    expect(resolveV3RestillPlannerPolicy({
      minChildren: 1,
      minSourceTokens: 7_999,
      minSavingsTokens: 1_023,
      minSavingsRatio: 0.24,
      maxSummaryTokens: 3_001,
      minTurnsSinceCreate: 7,
    })).toEqual(V3_LIMITS.restill);
  });

  it("applies a tightened minChildren at its exact boundary", () => {
    const fixture = restillFixture(3);
    const context: V3MutationPlannerContext = {
      ...fixture.context,
      restillPolicy: { minChildren: 3 },
    };
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "children:exact", 11), context))
      .toMatchObject({ ok: true, targetTier: "T3" });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs.slice(0, 2), "children:below", 11), context))
      .toMatchObject({ ok: false, code: "restill-ineligible", path: "$.blockRefs" });
  });

  it("applies a tightened minSourceTokens at its exact boundary", () => {
    const fixture = restillFixture();
    const context: V3MutationPlannerContext = {
      ...fixture.context,
      restillPolicy: { minSourceTokens: 9_000 },
    };
    const exact = tokenMetadata("T3", {
      sourceTokensLower: 9_000,
      sourceTokensUpper: 9_000,
      replacementTokensUpper: 6_000,
    });
    const below = tokenMetadata("T3", {
      sourceTokensLower: 8_999,
      sourceTokensUpper: 8_999,
      replacementTokensUpper: 5_999,
    });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "source:exact", 11, exact), context))
      .toMatchObject({ ok: true, targetTier: "T3" });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "source:below", 11, below), context))
      .toMatchObject({ ok: false, code: "restill-ineligible", path: "$.blockRefs" });
  });

  it("applies a tightened minSavingsTokens at its exact boundary", () => {
    const fixture = restillFixture();
    const context: V3MutationPlannerContext = {
      ...fixture.context,
      restillPolicy: { minSavingsTokens: 3_000 },
    };
    const exact = tokenMetadata("T3", {
      sourceTokensLower: 10_000,
      sourceTokensUpper: 10_000,
      replacementTokensUpper: 7_000,
    });
    const below = tokenMetadata("T3", {
      sourceTokensLower: 10_000,
      sourceTokensUpper: 10_000,
      replacementTokensUpper: 7_001,
    });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "savings:exact", 11, exact), context))
      .toMatchObject({ ok: true, targetTier: "T3" });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "savings:below", 11, below), context))
      .toMatchObject({ ok: false, code: "restill-ineligible", path: "$.blockRefs" });
  });

  it("applies a tightened minSavingsRatio at its exact boundary", () => {
    const fixture = restillFixture();
    const context: V3MutationPlannerContext = {
      ...fixture.context,
      restillPolicy: { minSavingsRatio: 0.30 },
    };
    const exact = tokenMetadata("T3", {
      sourceTokensLower: 10_000,
      sourceTokensUpper: 10_000,
      replacementTokensUpper: 7_000,
    });
    const below = tokenMetadata("T3", {
      sourceTokensLower: 10_000,
      sourceTokensUpper: 10_000,
      replacementTokensUpper: 7_001,
    });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "ratio:exact", 11, exact), context))
      .toMatchObject({ ok: true, targetTier: "T3" });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "ratio:below", 11, below), context))
      .toMatchObject({ ok: false, code: "restill-ineligible", path: "$.blockRefs" });
  });

  it("applies a tightened maxSummaryTokens at its exact boundary", () => {
    const fixture = restillFixture();
    const context: V3MutationPlannerContext = {
      ...fixture.context,
      restillPolicy: { maxSummaryTokens: 2_000 },
    };
    const exact = tokenMetadata("T3", { summaryTokensUpper: 2_000 });
    const above = tokenMetadata("T3", { summaryTokensUpper: 2_001 });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "summary:exact", 11, exact), context))
      .toMatchObject({ ok: true, targetTier: "T3" });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "summary:above", 11, above), context))
      .toMatchObject({ ok: false, code: "restill-ineligible", path: "$.blockRefs" });
  });

  it("applies a tightened minTurnsSinceCreate at its exact boundary", () => {
    const fixture = restillFixture();
    const context: V3MutationPlannerContext = {
      ...fixture.context,
      restillPolicy: { minTurnsSinceCreate: 10 },
    };
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "turns:exact", 13), context))
      .toMatchObject({ ok: true, targetTier: "T3" });
    expect(planV3BlockMutation(blockRequest(context, fixture.refs, "turns:below", 12), context))
      .toMatchObject({ ok: false, code: "restill-ineligible", path: "$.blockRefs" });
  });
});

describe("v3 decompression and exact recompression planning", () => {
  it("raw-decompresses a T1 root and recompresses only its exact provenance", () => {
    let state = addT1(initialState(), "t1:raw", 1);
    let fixture = blockContext(state);
    const rootRef = fixture.refById.get("t1:raw")!;
    expect(planV3DecompressMutation({
      operation: "decompress", catalogId: state.catalogId, transactionId: "t1:one",
      blockRefs: [rootRef], provenanceId: "user:t1", createdAt: 2, depth: "one",
    }, fixture.context)).toMatchObject({ ok: false, code: "invalid-root" });
    const raw = planV3DecompressMutation({
      operation: "decompress", catalogId: state.catalogId, transactionId: "t1:raw",
      blockRefs: [rootRef], provenanceId: "user:t1", createdAt: 2, depth: "raw",
    }, fixture.context);
    expect(raw).toMatchObject({ ok: true, transaction: { tag: "decompress", payload: { depth: "raw" } } });
    if (!raw.ok) return;
    state = apply(state, raw.transaction);
    fixture = blockContext(state);
    expect(planV3RecompressMutation({
      operation: "recompress", catalogId: state.catalogId, transactionId: "t1:recompress",
      blockRefs: [fixture.refById.get("t1:raw")!], provenanceId: "user:t1", createdAt: 3,
      decompressionTransactionId: "t1:raw",
    }, fixture.context)).toMatchObject({ ok: true, transaction: { tag: "recompress" } });
  });

  it("defaults v3 parents to one, supports raw, and recompresses only the exact decompression", () => {
    let state = addT1(initialState(), "t1:1", 1);
    state = addT1(state, "t1:2", 2);
    state = addParent(state, "t2:1", "T2", ["t1:1", "t1:2"], 2);
    const fixture = blockContext(state);
    const rootRef = fixture.refById.get("t2:1")!;
    const one = planV3DecompressMutation({
      operation: "decompress",
      catalogId: state.catalogId,
      transactionId: "decompress:one",
      blockRefs: [rootRef],
      provenanceId: "user:one",
      createdAt: 3,
    }, fixture.context);
    expect(one).toMatchObject({ ok: true, transaction: { tag: "decompress", payload: { depth: "one" } } });
    const raw = planV3DecompressMutation({
      operation: "decompress",
      catalogId: state.catalogId,
      transactionId: "decompress:raw",
      blockRefs: [rootRef],
      provenanceId: "user:raw",
      createdAt: 3,
      depth: "raw",
    }, fixture.context);
    expect(raw).toMatchObject({ ok: true, transaction: { tag: "decompress", payload: { depth: "raw" } } });
    if (!one.ok) return;
    state = apply(state, one.transaction);
    const exposed = blockContext(state);
    const decompressedRef = exposed.refById.get("t2:1")!;
    const exact = planV3RecompressMutation({
      operation: "recompress",
      catalogId: state.catalogId,
      transactionId: "recompress:one",
      blockRefs: [decompressedRef],
      provenanceId: "user:recompress",
      createdAt: 4,
      decompressionTransactionId: "decompress:one",
    }, exposed.context);
    expect(exact).toMatchObject({ ok: true, transaction: { tag: "recompress" } });
    expect(planV3RecompressMutation({
      operation: "recompress",
      catalogId: state.catalogId,
      transactionId: "recompress:wrong",
      blockRefs: [decompressedRef],
      provenanceId: "user:recompress",
      createdAt: 4,
      decompressionTransactionId: "wrong-transaction",
    }, exposed.context)).toMatchObject({ ok: false, code: "provenance-mismatch" });
  });

  it("accepts 16 non-overlapping roots, rejects 17, and enforces the 256-block raw closure cap", () => {
    let rootsState = initialState();
    for (let ordinal = 1; ordinal <= 32; ordinal += 1) rootsState = addT1(rootsState, `root-leaf:${ordinal}`, ordinal);
    for (let index = 0; index < 16; index += 1) {
      rootsState = addParent(rootsState, `root:${index + 1}`, "T2", [`root-leaf:${index * 2 + 1}`, `root-leaf:${index * 2 + 2}`], 2);
    }
    const rootsFixture = blockContext(rootsState, Array.from({ length: 16 }, (_, index) => `root:${index + 1}`));
    const rootRefs = Array.from({ length: 16 }, (_, index) => rootsFixture.refById.get(`root:${index + 1}`)!);
    expect(planV3DecompressMutation({
      operation: "decompress", catalogId: rootsState.catalogId, transactionId: "roots:16",
      blockRefs: [...rootRefs].reverse(), provenanceId: "user:roots", createdAt: 3, depth: "raw",
    }, rootsFixture.context)).toMatchObject({ ok: true, orderedRefs: rootRefs });
    expect(planV3DecompressMutation({
      operation: "decompress", catalogId: rootsState.catalogId, transactionId: "roots:17",
      blockRefs: [...rootRefs, "b999999"], provenanceId: "user:roots", createdAt: 3, depth: "raw",
    }, rootsFixture.context)).toMatchObject({ ok: false, code: "invalid-request" });

    const buildWideTree = (groups: number) => {
      let state = initialState();
      for (let ordinal = 1; ordinal <= groups * 16; ordinal += 1) state = addT1(state, `leaf:${ordinal}`, ordinal);
      for (let group = 0; group < groups; group += 1) {
        state = addParent(state, `middle:${group + 1}`, "T2", Array.from({ length: 16 }, (_, index) => `leaf:${group * 16 + index + 1}`), 2);
      }
      return addParent(state, "wide-root", "T3", Array.from({ length: groups }, (_, index) => `middle:${index + 1}`), 3);
    };
    const exactState = buildWideTree(15); // root + 15 T2 + 240 T1 = 256
    const exactFixture = blockContext(exactState, ["wide-root"]);
    expect(planV3DecompressMutation({
      operation: "decompress", catalogId: exactState.catalogId, transactionId: "closure:256",
      blockRefs: [exactFixture.refById.get("wide-root")!], provenanceId: "user:closure", createdAt: 4, depth: "raw",
    }, exactFixture.context)).toMatchObject({ ok: true });

    const largeState = buildWideTree(16); // 273 unique closure members
    const largeFixture = blockContext(largeState, ["wide-root"]);
    expect(planV3DecompressMutation({
      operation: "decompress", catalogId: largeState.catalogId, transactionId: "closure:257-plus",
      blockRefs: [largeFixture.refById.get("wide-root")!], provenanceId: "user:closure", createdAt: 4, depth: "raw",
    }, largeFixture.context)).toMatchObject({ ok: false, code: "closure-too-large" });
  }, 30_000);

  it("plans closed control records against the exact current catalog", () => {
    const fixture = blockContext(addT1(initialState(), "t1:control", 1));
    const accepted = planV3ControlMutation({
      operation: "control",
      catalogId: fixture.context.catalog.catalogId,
      transactionId: "control:restore-all",
      action: "restore-all",
      provenanceId: "user:restore-all",
      provenanceKind: "explicit-user",
      createdAt: 5,
    }, fixture.context);
    expect(accepted).toMatchObject({
      ok: true,
      transaction: {
        tag: "control",
        payload: { action: "restore-all", targetBlockIds: [], reason: "restore-all" },
      },
    });
    expect(planV3ControlMutation({
      operation: "control",
      catalogId: "0".repeat(64),
      transactionId: "control:stale",
      action: "off",
      provenanceId: "user:off",
      provenanceKind: "explicit-user",
      createdAt: 6,
    }, fixture.context)).toMatchObject({ ok: false, code: "stale-catalog" });
    expect(planV3ControlMutation({
      operation: "control",
      catalogId: fixture.context.catalog.catalogId,
      transactionId: "control:automatic-restore",
      action: "restore-all",
      provenanceId: "automatic:restore",
      provenanceKind: "automatic",
      createdAt: 7,
    }, fixture.context)).toMatchObject({ ok: false, code: "provenance-mismatch" });
  });

  it("binds cooling to one exact current provider-observed result", () => {
    const fixture = messageContext(initialState());
    const provenance = {
      kind: "provider-observation" as const,
      sessionId: fixture.context.state.sessionId,
      branchLeafId: fixture.context.state.branchLeafId,
      epochId: fixture.context.state.epochId,
      callEntryId: fixture.entryIds[0]!,
      callId: "call:read",
      normalizedExactToolName: "read",
      resultEntryId: fixture.entryIds[1]!,
      resultBodyDigest: digest("result body"),
      providerInputIdentity: digest("provider input"),
      settledRequestId: "request:later",
    };
    expect(planV3CoolingMutation({
      operation: "cooling",
      catalogId: fixture.context.catalog.catalogId,
      transactionId: "cool:result",
      targetEntryIds: [fixture.entryIds[1]!],
      profile: "retrieval",
      profileVersion: TOOL_COOLING_PROFILE_VERSION,
      provenance,
      reason: "cool",
      createdAt: 8,
    }, fixture.context)).toMatchObject({
      ok: true,
      orderedRefs: [fixture.refs[1]],
      transaction: { tag: "cooling", payload: { targetEntryIds: [fixture.entryIds[1]] } },
    });
    expect(planV3CoolingMutation({
      operation: "cooling",
      catalogId: fixture.context.catalog.catalogId,
      transactionId: "cool:mismatch",
      targetEntryIds: [fixture.entryIds[0]!],
      profile: "retrieval",
      profileVersion: TOOL_COOLING_PROFILE_VERSION,
      provenance,
      reason: "cool",
      createdAt: 9,
    }, fixture.context)).toMatchObject({ ok: false, code: "invalid-request" });
  });

  it("enforces the 256-block raw closure cap across all roots, not once per root", () => {
    const buildTwoRootTree = (firstGroupSize: 15 | 16) => {
      const groupSizes = [firstGroupSize, ...Array.from({ length: 14 }, () => 16)];
      let state = initialState();
      let ordinal = 1;
      const middleIds: string[] = [];
      for (const [groupIndex, size] of groupSizes.entries()) {
        const leafIds: string[] = [];
        for (let index = 0; index < size; index += 1) {
          const id = `aggregate-leaf:${ordinal}`;
          state = addT1(state, id, ordinal);
          leafIds.push(id);
          ordinal += 1;
        }
        const middleId = `aggregate-middle:${groupIndex + 1}`;
        state = addParent(state, middleId, "T2", leafIds, 2);
        middleIds.push(middleId);
      }
      state = addParent(state, "aggregate-root:1", "T3", middleIds.slice(0, 7), 3);
      state = addParent(state, "aggregate-root:2", "T3", middleIds.slice(7), 3);
      return state;
    };
    const plan = (state: V3LifecycleState, txId: string) => {
      const fixture = blockContext(state, ["aggregate-root:1", "aggregate-root:2"]);
      return planV3DecompressMutation({
        operation: "decompress", catalogId: state.catalogId, transactionId: txId,
        blockRefs: [fixture.refById.get("aggregate-root:1")!, fixture.refById.get("aggregate-root:2")!],
        provenanceId: "user:aggregate", createdAt: 4, depth: "raw",
      }, fixture.context);
    };
    // 239 leaves + 15 immediate parents + 2 roots = 256 unique closure members.
    expect(plan(buildTwoRootTree(15), "aggregate:256")).toMatchObject({ ok: true });
    // 240 leaves + 15 immediate parents + 2 roots = 257 unique closure members.
    expect(plan(buildTwoRootTree(16), "aggregate:257")).toMatchObject({ ok: false, code: "closure-too-large" });
  }, 30_000);

  it("returns deterministic bounded errors and never commits a partial transition", () => {
    let state = addT1(initialState(), "t1:1", 1);
    state = addT1(state, "t1:3", 3);
    const fixture = blockContext(state);
    const before = state;
    const result = planV3BlockMutation(blockRequest(
      fixture.context,
      [fixture.refById.get("t1:1")!, fixture.refById.get("t1:3")!],
      "will-not-exist",
    ), fixture.context);
    expect(result).toMatchObject({ ok: false, code: "invalid-promotion-gap" });
    expect(state).toBe(before);
    expect(state.blocks.has("will-not-exist")).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeLessThanOrEqual(V3_MUTATION_PLANNER_LIMITS.maxErrorMessageChars);
    expect(result.path.length).toBeLessThanOrEqual(V3_MUTATION_PLANNER_LIMITS.maxErrorPathChars);
    expect(result.freshRefs.length).toBeLessThanOrEqual(V3_MUTATION_PLANNER_LIMITS.maxFreshRefs);
  });
});
