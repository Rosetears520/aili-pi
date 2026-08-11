import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterAll, describe, expect, it } from "vitest";

import { AILI_COMPACT_ENTRY, digest, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import type { BranchSessionEntry } from "../../src/runtime/aili-compact/branch-index.js";
import { registerAiliCompact } from "../../src/runtime/aili-compact/index.js";
import { classifyTransparentPromotionGaps, createAiliPlanningResultEnvelope } from "../../src/runtime/aili-compact/promotion-gaps.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";
import { deriveRuntimeCatalogIdForState } from "../../src/runtime/aili-compact/runtime-catalog.js";
import { buildV3RuntimeView } from "../../src/runtime/aili-compact/v3-runtime.js";
import {
  AILI_COMPACT_SCHEMA_V3,
  applyV3Transaction,
  createEmptyV3State,
  v3MessageLeafDigest,
  v3ParentLeafDigest,
  v3SummaryDigest,
  type V3LifecycleState,
  type V3Transaction,
} from "../../src/runtime/aili-compact/v3.js";

type RegisteredTool = { name: string; execute: (...args: any[]) => Promise<any> };
type Handler = (event: any, context: any) => any;

const enabledProject = mkdtempSync(join(tmpdir(), "aili-compact-promotion-enabled-"));
mkdirSync(join(enabledProject, ".pi"), { recursive: true });
writeFileSync(join(enabledProject, ".pi", "aili-compact.jsonc"), '{ "enabled": true }');
afterAll(() => rmSync(enabledProject, { recursive: true, force: true }));

describe("AILI Compact promotion proof source freshness", () => {
  it("emits closed handler-owned status and compact-rejection envelopes", async () => {
    const entries: BranchSessionEntry[] = [{
      id: "manual-on",
      type: "custom",
      customType: AILI_COMPACT_ENTRY,
      data: { schema: "aili.compact.tx.v2", id: "manual-on", kind: "control", epochId: "root", control: "manual-on" },
    }];
    const tools = new Map<string, RegisteredTool>();
    const handlers = new Map<string, Handler>();
    registerAiliCompact({
      registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); },
      registerCommand() {}, on(event: string, handler: Handler) { handlers.set(event, handler); },
      appendEntry() {}, sendUserMessage() {}, getAllTools: () => [], getActiveTools: () => [],
    } as unknown as ExtensionAPI);
    const ctx = extensionContext(entries);
    handlers.get("session_start")!({ type: "session_start" }, ctx);

    const status = await tools.get("aili_compact_status")!.execute("status-call", {}, undefined, undefined, ctx);
    const statusEnvelope = JSON.parse(status.content[0].text) as { attestation: Record<string, unknown>; result: unknown };
    expect(Object.keys(statusEnvelope).sort()).toEqual(["attestation", "result"]);
    expect(statusEnvelope.attestation).toMatchObject({
      toolName: "aili_compact_status", toolCallId: "status-call", outcome: "success",
      resultDigest: digest({ result: statusEnvelope.result, transaction: null }),
    });

    entries.push(message("compact-caller", {
      role: "assistant",
      content: [{ type: "toolCall", id: "compact-call", name: "aili_compact", arguments: {} }],
    }));
    const compact = await tools.get("aili_compact")!.execute("compact-call", {}, undefined, undefined, ctx);
    const compactEnvelope = JSON.parse(compact.content[0].text) as { attestation: Record<string, unknown>; result: unknown };
    expect(compact.isError).toBe(true);
    expect(Object.keys(compactEnvelope).sort()).toEqual(["attestation", "result"]);
    expect(compactEnvelope.attestation).toMatchObject({
      toolName: "aili_compact", toolCallId: "compact-call", outcome: "rejected",
      resultDigest: digest({ result: compactEnvelope.result, transaction: null }),
    });
    expect(Object.prototype.hasOwnProperty.call(compactEnvelope, "transaction")).toBe(false);
  });

  it("advances the raw source binding after an append and retains the 16-block active group", async () => {
    const entries = sixteenChildEntries();
    const tools = new Map<string, RegisteredTool>();
    const handlers = new Map<string, Handler>();
    registerAiliCompact({
      registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); },
      registerCommand() {}, on(event: string, handler: Handler) { handlers.set(event, handler); },
      appendEntry() {}, sendUserMessage() {}, getAllTools: () => [], getActiveTools: () => [],
    } as unknown as ExtensionAPI);
    const ctx = extensionContext(entries);
    handlers.get("session_start")!({ type: "session_start" }, ctx);
    const status = tools.get("aili_compact_status")!;
    const rawReads = watchRawMessageReads(entries);
    const first = JSON.parse((await status.execute("status:one", {}, undefined, undefined, ctx)).content[0].text).result;
    expect(rawReads.count()).toBe(0);
    expect(first.references.lifecycle.activeBlockGroups).toEqual([
      expect.objectContaining({ semantics: "active-block", action: "compact", blockRefs: expect.any(Array) }),
    ]);
    expect(first.references.lifecycle.activeBlockGroups[0]?.blockRefs).toHaveLength(16);

    entries.push(message("fresh:ordinary-append", { role: "user", content: "ordinary append" }));
    rawReads.reset();
    const second = JSON.parse((await status.execute("status:two", {}, undefined, undefined, ctx)).content[0].text).result;
    expect(rawReads.count()).toBe(0);
    expect(second.index).toMatchObject({ healthy: true });
    expect(second.references.lifecycle.activeBlockGroups).toEqual([
      expect.objectContaining({ semantics: "active-block", action: "compact", blockRefs: expect.any(Array) }),
    ]);
    expect(second.references.lifecycle.activeBlockGroups[0]?.blockRefs).toHaveLength(16);
    expect(first.index.counters).toMatchObject({
      gapIndexBuilds: 1,
      gapIndexBuildRawSlotVisits: 0,
      rawEpochSlotStorageIterationVisits: 0,
      sourceFreshnessRawSlotVisits: 0,
    });
    expect(second.index.counters).toMatchObject({
      gapIndexBuilds: 2,
      gapIndexBuildRawSlotVisits: 0,
      rawEpochSlotStorageIterationVisits: 0,
      sourceFreshnessRawSlotVisits: 0,
    });
    expect(second.index.counters.gapIndexBuilds - first.index.counters.gapIndexBuilds).toBe(1);
    expect(second.index.counters.gapIndexBuildRawSlotVisits - first.index.counters.gapIndexBuildRawSlotVisits).toBe(0);
  });

  it("fails open for direct status after a same-tip nested raw result mutation", async () => {
    const { entries, result } = promotionProofEntries();
    const tools = new Map<string, RegisteredTool>();
    const handlers = new Map<string, Handler>();
    registerAiliCompact({
      registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); },
      registerCommand() {},
      on(event: string, handler: Handler) { handlers.set(event, handler); },
      appendEntry() {},
      sendUserMessage() {},
      getAllTools: () => [],
      getActiveTools: () => [],
    } as unknown as ExtensionAPI);
    const ctx = extensionContext(entries);
    handlers.get("session_start")!({ type: "session_start" }, ctx);

    ((result.message as Record<string, unknown>).content) = "{}";
    const status = await tools.get("aili_compact_status")!.execute("status", {}, undefined, undefined, ctx);
    const envelope = JSON.parse(status.content[0].text) as { result: Record<string, any> };
    expect(envelope.result.index).toMatchObject({ healthy: false, diagnostic: "raw-promotion-source-drift" });
    expect(envelope.result.index.counters.sourceFreshnessRawSlotVisits).toBe(3);
    expect(JSON.stringify(envelope.result.references.lifecycle)).not.toContain("fresh-parent");
  });

  it("fails closed when a proof source mutates after an ordinary raw append before status", async () => {
    const { entries, result } = promotionProofEntries();
    const tools = new Map<string, RegisteredTool>();
    const handlers = new Map<string, Handler>();
    registerAiliCompact({
      registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); },
      registerCommand() {},
      on(event: string, handler: Handler) { handlers.set(event, handler); },
      appendEntry() {},
      sendUserMessage() {},
      getAllTools: () => [],
      getActiveTools: () => [],
    } as unknown as ExtensionAPI);
    const ctx = extensionContext(entries);
    handlers.get("session_start")!({ type: "session_start" }, ctx);

    entries.push(message("fresh:ordinary-append", { role: "user", content: "ordinary append" }));
    ((result.message as Record<string, unknown>).content) = "{}";

    const status = await tools.get("aili_compact_status")!.execute("status", {}, undefined, undefined, ctx);
    const envelope = JSON.parse(status.content[0].text) as { result: Record<string, any> };
    expect(envelope.result.index).toMatchObject({ healthy: false, diagnostic: "raw-promotion-source-drift" });
    expect(envelope.result.references.lifecycle.activeBlockGroups).toEqual([]);
    expect(JSON.stringify(envelope.result.references.lifecycle)).not.toContain("fresh-parent");
  });
});

function promotionProofEntries(): { entries: BranchSessionEntry[]; result: BranchSessionEntry } {
  const left = message("fresh:left", { role: "assistant", content: "left" });
  const call = message("fresh:status-call", {
    role: "assistant",
    content: [{ type: "toolCall", id: "fresh:status-call", name: "aili_compact_status" }],
  });
  const result = message("fresh:status-result", {
    role: "toolResult",
    toolCallId: call.id,
    toolName: "aili_compact_status",
    content: JSON.stringify(createAiliPlanningResultEnvelope({
      toolName: "aili_compact_status",
      toolCallId: call.id,
      identity: { sessionId: "fresh-session", branchLeafId: "fresh-leaf", epochId: "root", revision: "aili.v3.projection.1" },
      outcome: "success",
      result: { status: "ok" },
    })),
  });
  const right = message("fresh:right", { role: "assistant", content: "right" });
  const entries: BranchSessionEntry[] = [left, call, result, right];
  let state = createEmptyV3State({
    sessionId: "fresh-session", branchLeafId: "fresh-leaf", epochId: "root", projectionVersion: "aili.v3.projection.1",
  });
  const leftTransaction = t1(state, "fresh:left-block", left.id, 1, catalogId(entries, state));
  state = apply(state, leftTransaction, new Map([[left.id, 1]]));
  entries.push(custom("fresh:left-entry", leftTransaction));
  const rightTransaction = t1(state, "fresh:right-block", right.id, 2, catalogId(entries, state));
  state = apply(state, rightTransaction, new Map([[right.id, 4]]));
  entries.push(custom("fresh:right-entry", rightTransaction));
  const children = [state.blocks.get("fresh:left-block")!, state.blocks.get("fresh:right-block")!];
  const proofs = classifyTransparentPromotionGaps(entries.slice(0, 4), state.blocks, children, {
    sessionId: state.sessionId, branchLeafId: state.branchLeafId, epochId: state.epochId, revision: state.projectionVersion,
  });
  if (!proofs.ok) throw new Error(`fixture proof failed: ${proofs.reason}`);
  const summary = "fresh parent";
  const parent: V3Transaction = {
    header: header(state, "fresh:parent", 3, catalogId(entries, state)),
    tag: "semantic-create",
    payload: {
      blockId: "fresh-parent",
      tier: "T2",
      topic: "fresh parent",
      runId: "fresh-run",
      anchorEntryId: left.id,
      createdTurnOrdinal: 3,
      summary,
      summaryDigest: v3SummaryDigest(summary),
      source: { kind: "blocks", childBlockIds: children.map((child) => child.blockId), transparentGaps: proofs.proofs },
      leafDigest: v3ParentLeafDigest("T2", 2, children.map((child) => child.leafDigest)),
      leafCount: 2,
      tokens: tokens("T2"),
      quality: quality(),
    },
  };
  entries.push(custom("fresh:parent-entry", parent));
  return { entries, result };
}

function sixteenChildEntries(): BranchSessionEntry[] {
  const entries = Array.from({ length: 300 }, (_, index) => message(`history:${index + 1}`, {
    role: "assistant", content: `historical:${index + 1}`,
  }));
  for (let index = 0; index < 16; index += 1) {
    const source = message(`sixteen:${index + 1}`, {
      role: "assistant", content: `source:${index + 1}`,
    });
    entries.push(source);
    const view = buildV3RuntimeView(entries, reduceCompactState(entries), {
      sessionId: "fresh-session", sessionPath: "fresh-session.jsonl",
    });
    const transaction = t1(view.state, `sixteen:block:${index + 1}`, source.id, index + 1, view.catalog.catalogId, "active");
    entries.push(custom(`sixteen:entry:${index + 1}`, transaction));
  }
  return entries;
}

function watchRawMessageReads(entries: readonly BranchSessionEntry[]) {
  let count = 0;
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    let value = entry.message;
    Object.defineProperty(entry, "message", {
      configurable: true,
      enumerable: true,
      get() { count += 1; return value; },
      set(next: unknown) { value = next; },
    });
  }
  return {
    count: () => count,
    reset: () => { count = 0; },
  };
}

function extensionContext(entries: BranchSessionEntry[]) {
  return {
    cwd: enabledProject,
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => ({ tokens: 100, contextWindow: 128_000 }),
    sessionManager: {
      getSessionId: () => "fresh-session",
      getSessionFile: () => "fresh-session.jsonl",
      getLeafId: () => entries.at(-1)?.id ?? null,
      getBranch: () => entries,
    },
    ui: { setStatus() {}, setWidget() {}, notify() {} },
  };
}

function message(id: string, body: unknown): BranchSessionEntry {
  return { id, type: "message", message: body };
}

function custom(id: string, data: unknown): BranchSessionEntry {
  return { id, type: "custom", customType: AILI_COMPACT_ENTRY, data };
}

function catalogId(entries: readonly SessionLikeEntry[], state: V3LifecycleState): string {
  return deriveRuntimeCatalogIdForState(entries, reduceCompactState(entries), state);
}

function header(state: V3LifecycleState, txId: string, createdAt: number, catalogId: string) {
  return {
    schema: AILI_COMPACT_SCHEMA_V3,
    txId,
    sessionId: state.sessionId,
    branchLeafId: state.branchLeafId,
    epochId: state.epochId,
    catalogId,
    createdAt,
    projectionVersion: state.projectionVersion,
  } as const;
}

function t1(
  state: V3LifecycleState,
  blockId: string,
  entryId: string,
  ordinal: number,
  catalog: string,
  tier: "T1" | "active" = "T1",
): V3Transaction {
  const summary = `summary:${blockId}`;
  return {
    header: header(state, `tx:${blockId}`, ordinal, catalog),
    tag: "semantic-create",
    payload: {
      blockId, ...(tier === "active" ? {} : { tier }), topic: blockId, runId: `run:${blockId}`, anchorEntryId: entryId, createdTurnOrdinal: ordinal,
      summary, summaryDigest: v3SummaryDigest(summary),
      source: { kind: "messages", entryIds: [entryId], firstEntryId: entryId, lastEntryId: entryId },
      leafDigest: v3MessageLeafDigest([entryId]), leafCount: 1, tokens: tokens("T1"), quality: quality(),
    },
  };
}

function apply(state: V3LifecycleState, transaction: V3Transaction, messageOrdinals: ReadonlyMap<string, number>): V3LifecycleState {
  const result = applyV3Transaction(state, transaction, { expectedCatalogId: transaction.header.catalogId, messageOrdinals });
  if (!result.ok) throw new Error(`${result.code}:${result.path}`);
  return result.value.state;
}

function tokens(tier: "T1" | "T2") {
  const sourceTokensLower = 3_000;
  const replacementTokensUpper = tier === "T1" ? 1_000 : 1_500;
  return {
    estimatorVersion: "fixture-estimator", providerId: "fixture", modelId: "fixture",
    sourceTokensLower, sourceTokensUpper: sourceTokensLower, replacementTokensUpper,
    steadySavingsTokensLower: sourceTokensLower - replacementTokensUpper,
    oneTimeCostTokensUpper: 500, breakEvenTurnsUpper: 1,
    savingsRatio: (sourceTokensLower - replacementTokensUpper) / sourceTokensLower,
    summaryTokensUpper: 300,
  };
}

function quality() {
  return {
    status: "accepted" as const, evaluatorVersion: "fixture-quality", sourceFactDigest: "f".repeat(64),
    hardFactCount: 1, coveredHardFactCount: 1, warningCodes: [],
  };
}
