import { describe, expect, it, vi } from "vitest";
import {
  AutomaticObservationCoordinator,
  BoundedSourceEnvelopeStore,
  HybridObserverExtractor,
  ManagedInternalMemoryScheduler,
  PromotionStateController,
  canonicalCandidateFingerprint,
  detectHighValueEvent,
  validatePolicy,
  validateReceipt,
  type AutomaticMemoryCandidate,
  type ManagedMemoryObserver,
  type ObservationBatch,
} from "../../src/runtime/observational-memory/index.js";

function capture(store: BoundedSourceEnvelopeStore, entryId: string, text: string, branchId = "main") {
  return store.capture({ id: `source-${branchId}-${entryId}`, entryId, sessionId: "session", agentId: "agent", branchId, sourceProject: "/trusted/project", role: "user", text, createdAt: "2026-08-28T00:00:00.000Z" });
}

function candidate(batch: ObservationBatch, overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1, id: "candidate-1", kind: "preference", applicability: "global-preference", content: batch.sources[0]!.text, confidence: 0.9, support: "explicit", sourceIds: [batch.sources[0]!.id], sourceProject: batch.sources[0]!.sourceProject, ...overrides };
}

function acceptedCandidate(batch: ObservationBatch, overrides: Partial<AutomaticMemoryCandidate> = {}): AutomaticMemoryCandidate {
  const base = { schemaVersion: 1 as const, id: "candidate-1", kind: "preference" as const, applicability: "global-preference" as const, content: batch.sources[0]!.text, confidence: 0.9, support: "explicit" as const, sourceIds: [batch.sources[0]!.id], sourceEntryIds: [batch.sources[0]!.entryId], sourceProject: batch.sources[0]!.sourceProject, sourceCutoff: batch.cutoff, ...overrides };
  return Object.freeze({ ...base, fingerprint: canonicalCandidateFingerprint(base) });
}

describe("automatic observational memory core contracts", () => {
  it("fails closed for incompatible policies and body-bearing receipts", () => {
    expect(() => validatePolicy({ schemaVersion: 2 })).toThrow(/policy/);
    expect(() => validatePolicy({ schemaVersion: 1, id: "p", palace: "one", trustedProject: "/p", server: "mcp", operations: ["delete"], eligibleKinds: ["preference"] })).toThrow(/operations/);
    const receipt = { schemaVersion: 1, candidateId: "c", fingerprint: "a".repeat(64), target: "wing", outcome: "committed", settledAt: "2026-08-28T00:00:00.000Z", providerIds: ["provider-1"] };
    expect(validateReceipt(receipt)).toEqual(receipt);
    expect(() => validateReceipt({ ...receipt, content: "must not appear" })).toThrow(/bodies/);
    expect(() => validateReceipt({ ...receipt, providerIds: Array.from({ length: 33 }, (_, index) => String(index)) })).toThrow(/receipt/);
  });

  it("captures bounded multi-role source with exact branch coverage and exclusions", () => {
    const store = new BoundedSourceEnvelopeStore(3, 128);
    expect(capture(store, "1", "I prefer concise updates").accepted).toBe(true);
    expect(store.capture({ id: "a2", entryId: "2", sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "/trusted/project", role: "assistant", text: "Decision accepted", createdAt: "2026-08-28T00:00:01.000Z" }).accepted).toBe(true);
    expect(store.capture({ id: "a3", entryId: "3", sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "/trusted/project", role: "tool-outcome", text: "tests passed", createdAt: "2026-08-28T00:00:02.000Z" }).accepted).toBe(true);
    expect(store.capture({ id: "retry", entryId: "4", sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "/trusted/project", role: "assistant", text: "retrying", origin: "provider-retry", createdAt: "2026-08-28T00:00:03.000Z" })).toMatchObject({ accepted: false });
    expect(store.capture({ id: "internal", entryId: "5", sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "/trusted/project", role: "assistant", text: "memory work", origin: "memory-internal", createdAt: "2026-08-28T00:00:04.000Z" })).toMatchObject({ accepted: false });
    expect(capture(store, "fork-1", "separate branch", "fork").accepted).toBe(true);
    const first = store.cutBatch("main", "2")!;
    expect(first.sources.map((item) => item.entryId)).toEqual(["1", "2"]);
    expect(first.cutoff).toMatchObject({ fromEntryId: "1", coversUpToId: "2", sourceCount: 2 });
    expect(store.cutBatch("main")).toBe(first);
    expect(store.commitCoverage(first.id)).toBe(true);
    const second = store.cutBatch("main")!;
    expect(second.sources.map((item) => item.entryId)).toEqual(["3"]);
    expect(store.cutBatch("fork")!.sources.map((item) => item.entryId)).toEqual(["fork-1"]);
  });

  it("cuts an ordered compacted set through its last captured entry and ignores uncaptured metadata", () => {
    const store = new BoundedSourceEnvelopeStore();
    capture(store, "observed", "My preference is compacted");
    capture(store, "tail", "My preference is not compacted");
    const batch = store.cutBatch("main", ["observed", "uncaptured-tool-metadata"] as const)!;
    expect(batch.sources.map((source) => source.entryId)).toEqual(["observed"]);
    expect(batch.cutoff.coversUpToId).toBe("observed");
  });

  it("does not observe ordinary runs and coalesces qualifying triggers at one concurrency", async () => {
    const store = new BoundedSourceEnvelopeStore(); capture(store, "1", "short ordinary text");
    let release!: (value: unknown) => void;
    const extract = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const observer: ManagedMemoryObserver = { extract };
    const coordinator = new AutomaticObservationCoordinator(store, new HybridObserverExtractor(observer), new ManagedInternalMemoryScheduler(), 100);
    expect(coordinator.consider("main")).toMatchObject({ scheduled: false, reason: "below-threshold" });
    expect(detectHighValueEvent("ordinary conversation", "user")).toBeUndefined();
    const highValue = detectHighValueEvent("I prefer concise updates", "user");
    expect(highValue).toBe("confirmed-preference");
    const first = coordinator.consider("main", highValue);
    expect(first).toMatchObject({ scheduled: true, reason: "high-value" });
    expect(coordinator.consider("main", "accepted-decision")).toMatchObject({ scheduled: false, reason: "coalesced" });
    expect(extract).toHaveBeenCalledTimes(1);
    release({ schemaVersion: 1, candidates: [] });
    await expect(first.settlement).resolves.toMatchObject({ accepted: [] });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("schedules observation when the source token clock reaches its threshold", async () => {
    const store = new BoundedSourceEnvelopeStore(); capture(store, "1", "A sufficiently long accepted project decision for the source token clock");
    const extract = vi.fn(async () => ({ schemaVersion: 1, candidates: [] }));
    const coordinator = new AutomaticObservationCoordinator(store, new HybridObserverExtractor({ extract }), new ManagedInternalMemoryScheduler(), 4);
    const trigger = coordinator.consider("main");
    expect(trigger).toMatchObject({ scheduled: true, reason: "token-threshold" });
    await expect(trigger.settlement).resolves.toMatchObject({ accepted: [] });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("post-validates model candidates and rejects unsupported scope, chatter and source claims", async () => {
    const store = new BoundedSourceEnvelopeStore(); capture(store, "1", "I explicitly prefer concise status updates");
    const batch = store.cutBatch("main")!;
    const observer: ManagedMemoryObserver = { extract: async () => ({ schemaVersion: 1, candidates: [
      candidate(batch),
      candidate(batch, { id: "wrong-scope", applicability: "project-decision" }),
      candidate(batch, { id: "chatter", content: "thanks" }),
      candidate(batch, { id: "paraphrase", content: "Use concise status updates" }),
      candidate(batch, { id: "invented", sourceIds: ["missing"] }),
      candidate(batch, { id: "wrong-support", kind: "reusable-solution", applicability: "reusable-solution", support: "explicit" }),
    ] }) };
    const result = await new HybridObserverExtractor(observer).extract(batch);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({ kind: "preference", sourceEntryIds: ["1"], sourceCutoff: batch.cutoff, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(result.rejected.map((item) => item.reason)).toEqual(["candidate-kind-scope-invalid", "candidate-unsupported-inference", "candidate-unsupported-inference", "candidate-source-unsupported", "candidate-unsupported-inference"]);
  });

  it("derives cited entry IDs independently for candidates from a mixed compacted-tail batch", async () => {
    const store = new BoundedSourceEnvelopeStore();
    capture(store, "compacted", "My preference is compacted output");
    capture(store, "tail", "My preference is tail output");
    const batch = store.cutBatch("main")!;
    const result = await new HybridObserverExtractor({ extract: async () => ({ schemaVersion: 1, candidates: [
      { ...candidate(batch), id: "compacted-candidate", content: batch.sources[0]!.text, sourceIds: [batch.sources[0]!.id] },
      { ...candidate(batch), id: "tail-candidate", content: batch.sources[1]!.text, sourceIds: [batch.sources[1]!.id] },
    ] }) }).extract(batch);
    expect(result.accepted.map((item) => ({ id: item.id, entries: item.sourceEntryIds, batchCutoff: item.sourceCutoff.coversUpToId }))).toEqual([
      { id: "compacted-candidate", entries: ["compacted"], batchCutoff: "tail" },
      { id: "tail-candidate", entries: ["tail"], batchCutoff: "tail" },
    ]);
  });

  it("terminalizes retry exhaustion with an explicit rejection reason", () => {
    const store = new BoundedSourceEnvelopeStore(); capture(store, "1", "I explicitly prefer concise status updates");
    const item = acceptedCandidate(store.cutBatch("main")!);
    const controller = new PromotionStateController(4, 2);
    controller.stage(item);
    controller.beginAttempt(item.id); controller.settle(item.id, { status: "ambiguous" });
    controller.beginAttempt(item.id); controller.settle(item.id, { status: "retryable-failure" });
    expect(controller.terminalizeRetryExhausted(item.id)).toEqual({ terminalized: true, reason: "candidate-retry-bound-exhausted" });
    expect(controller.status(item.id)).toMatchObject({ state: "rejected", reason: "candidate-retry-bound-exhausted" });
    expect(controller.releaseTerminal()).toBe(1);
  });

  it("binds an accepted project decision to its proposal and user approval", async () => {
    const store = new BoundedSourceEnvelopeStore();
    store.capture({ id: "proposal", entryId: "1", sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "/trusted/project", role: "assistant", text: "Use the Runtime Gateway as the only mutation owner.", createdAt: "2026-08-28T00:00:00.000Z" });
    store.capture({ id: "approval", entryId: "2", sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "/trusted/project", role: "user", text: "Approved.", createdAt: "2026-08-28T00:00:01.000Z" });
    const batch = store.cutBatch("main")!;
    const sourceProject = batch.sources[0]!.sourceProject;
    const result = await new HybridObserverExtractor({ extract: async () => ({ schemaVersion: 1, candidates: [{ schemaVersion: 1, id: "decision", kind: "project-decision", applicability: "project-decision", content: "Use the Runtime Gateway as the only mutation owner.", confidence: 0.95, support: "accepted", sourceIds: ["proposal", "approval"], sourceProject }] }) }).extract(batch);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({ kind: "project-decision", sourceEntryIds: ["1", "2"] });
  });

  it("commits fingerprints only after final provider settlement and reconciles ambiguity", () => {
    const store = new BoundedSourceEnvelopeStore(); capture(store, "1", "I explicitly prefer concise status updates"); const batch = store.cutBatch("main")!;
    const item = acceptedCandidate(batch); const controller = new PromotionStateController(4, 2);
    expect(controller.stage(item)).toMatchObject({ accepted: true, state: "pending" });
    expect(controller.stage({ ...item, id: "semantic-copy" })).toMatchObject({ accepted: false, reason: "candidate-coalesced", state: "pending" });
    expect(controller.beginAttempt(item.id)).toEqual({ attempt: 1, reconcileFirst: false });
    expect(controller.settle(item.id, { status: "ambiguous" })).toBe("reconciliation-required");
    expect(controller.status(item.id)).toMatchObject({ state: "reconciliation-required", attempts: 1 });
    expect(controller.beginAttempt(item.id)).toEqual({ attempt: 2, reconcileFirst: true });
    const receipt = { schemaVersion: 1, candidateId: item.id, fingerprint: item.fingerprint, target: "palace/wing", outcome: "committed", settledAt: "2026-08-28T00:00:00.000Z", providerIds: ["remote-1"] };
    expect(controller.settle(item.id, { status: "success", receipt })).toBe("committed");
    expect(controller.stage({ ...item, id: "later-copy" })).toMatchObject({ accepted: false, reason: "candidate-duplicate" });
    expect(() => controller.beginAttempt(item.id)).toThrow(/terminal/);
  });
});
