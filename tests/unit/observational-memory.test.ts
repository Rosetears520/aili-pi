import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AutomaticMemoryRuntime, BoundedSourceEnvelopeStore, consolidateObservations, ManagedInternalMemoryScheduler, MemoryPromotionController, ObservationLedger, planMemPalacePromotion, projectMemoryRecall, type AtomicObservation, type MemPalacePort } from "../../src/runtime/observational-memory/index.js";

function observation(id: string, parentObservationId?: string, branchId = "main", confidence = 0.9): AtomicObservation {
  return { schemaVersion: 1, id, sessionId: "session", agentId: "agent", branchId, ...(parentObservationId ? { parentObservationId } : {}), eventId: `event-${id}`, summary: `decision ${id}`, confidence, createdAt: `2026-08-27T00:00:0${id.length}.000Z` };
}

describe("observational memory", () => {
  it("keeps idempotent branch-aware ledger views", () => {
    const ledger = new ObservationLedger();
    const root = ledger.append(observation("root"));
    const main = ledger.append(observation("main-1", root.id));
    ledger.append(observation("fork-1", root.id, "fork"));
    expect(ledger.append({ ...main })).toBe(main);
    expect(() => ledger.append({ ...main, summary: "conflicting retry" })).toThrow(/event conflict/);
    expect(ledger.activeView("main", main.id).map((item) => item.id)).toEqual(["root", "main-1"]);
    expect(ledger.activeView("fork", "fork-1").map((item) => item.id)).toEqual(["root", "fork-1"]);
    const bounded = new ObservationLedger(2); bounded.append(observation("one")); bounded.append(observation("two")); bounded.append(observation("three"));
    expect(bounded.all().map((item) => item.id)).toEqual(["two", "three"]);
  });

  it("requires exact authority for durable promotion and deduplicates", () => {
    const controller = new MemoryPromotionController();
    const item = observation("durable");
    expect(controller.decide(item, "diary", false)).toMatchObject({ accepted: false, reason: "durable-promotion-authority-required" });
    expect(controller.decide(item, "diary", true)).toMatchObject({ accepted: true, reason: "candidate-awaiting-provider", candidate: { observationId: "durable" } });
    expect(controller.decide(item, "diary", true)).toMatchObject({ accepted: true, reason: "candidate-awaiting-provider" });
    expect(() => controller.decide(item, "shared", false)).toThrow(/explicit authority/);
    expect(controller.decide({ ...item, summary: "password=secret" }, "diary", true)).toMatchObject({ accepted: false, reason: "candidate-sensitive-or-invalid" });
    expect(controller.decide({ ...observation("replacement"), supersedes: "missing" }, "diary", true)).toMatchObject({ accepted: true, reason: "candidate-awaiting-provider" });
    expect(controller.decide({ ...observation("replacement"), supersedes: "durable" }, "diary", true)).toMatchObject({ accepted: true });
  });

  it("produces deterministic budgeted recall", () => {
    const items = [observation("a", undefined, "main", 0.8), observation("b", undefined, "main", 0.9)];
    const first = projectMemoryRecall(items, 100);
    expect(first.ids).toHaveLength(2);
    expect(first.ids.every((id) => /^session-[a-f0-9]{20}$/.test(id))).toBe(true);
    expect(first.text).toContain("UNTRUSTED HISTORICAL DATA ONLY");
    expect(first.text).toContain('body="decision b"');
    expect(projectMemoryRecall(items, 100)).toEqual(first);
    expect(projectMemoryRecall(items, 1).omitted).toBe(2);
    expect(consolidateObservations(items)).toEqual(consolidateObservations(items));
  });

  it("isolates bounded managed-internal observation work and denies recursion", async () => {
    const scheduler = new ManagedInternalMemoryScheduler();
    await expect(scheduler.submit({ id: "recursive", origin: "memory-internal", run: async () => 1 })).rejects.toThrow(/recursion/);
    await expect(scheduler.submit({ id: "one", origin: "foreground", run: async () => "done" })).resolves.toBe("done");
    expect(scheduler.status).toMatchObject({ backend: "managed-internal", public: false, queued: 0 });
  });

  it("plans but never performs an authorized MemPalace durable write", async () => {
    const root = await mkdtemp(join(tmpdir(), "memory-project-"));
    try {
      const candidate = { observationId: "o1", scope: "diary" as const, summary: "stable decision", confidence: 0.9, sourceEventIds: ["e1"] };
      await expect(planMemPalacePromotion({ root, trusted: true }, "agent", candidate, false)).rejects.toThrow(/authority/);
      await expect(planMemPalacePromotion({ root, trusted: true }, "agent", candidate, true)).resolves.toMatchObject({ target: expect.any(String), requiresExternalWrite: true });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("checkpoints one production-sized candidate chunk per boundary", async () => {
    const checkpointSizes: number[] = [];
    const port: MemPalacePort = {
      search: async () => ({ status: "success", value: { records: [], omitted: 0 } }),
      reconcileDuplicate: async () => ({ status: "success", value: { duplicate: false, providerIds: [] } }),
      checkpoint: async (candidates) => { checkpointSizes.push(candidates.length); return { status: "success", value: { receipts: candidates.map((candidate) => ({ schemaVersion: 1 as const, candidateId: candidate.id, fingerprint: candidate.fingerprint, target: "fixture", outcome: "committed" as const, settledAt: "2026-08-28T00:00:00.000Z", providerIds: [`provider-${candidate.id}`] })) } }; },
    };
    const runtime = new AutomaticMemoryRuntime({ port, observer: { extract: async (batch) => ({ schemaVersion: 1, candidates: Array.from({ length: 6 }, (_, index) => ({ schemaVersion: 1, id: `c${index}`, kind: "preference", applicability: "global-preference", content: ["My preference is alpha", "alpha beta", "beta gamma", "gamma delta", "delta epsilon", "epsilon zeta"][index], confidence: 0.9, support: "explicit", sourceIds: [batch.sources[0]!.id], sourceProject: batch.sources[0]!.sourceProject })) }) } });
    runtime.capture({ id: "source", entryId: "entry", sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "project-label", role: "user", text: "My preference is alpha beta gamma delta epsilon zeta", createdAt: "2026-08-28T00:00:00.000Z" });
    await runtime.checkpoint("main");
    expect(checkpointSizes).toEqual([5]);
    expect(runtime.status().pendingCount).toBe(1);
    await runtime.checkpoint("main");
    expect(checkpointSizes).toEqual([5, 1]);
    expect(runtime.status().pendingCount).toBe(0);
  });

  it("never evicts unobserved source and obscures absolute project paths", () => {
    const store = new BoundedSourceEnvelopeStore(2, 64);
    const capture = (entryId: string) => store.capture({ id: `source-${entryId}`, entryId, sessionId: "session", agentId: "agent", branchId: "main", sourceProject: "/private/work/project", role: "user", text: `explicit source ${entryId}`, createdAt: "2026-08-28T00:00:00.000Z" });
    expect(capture("one")).toMatchObject({ accepted: true, envelope: { sourceProject: expect.stringMatching(/^project-[a-f0-9]{24}$/) } });
    expect(capture("two")).toMatchObject({ accepted: true });
    expect(capture("three")).toEqual({ accepted: false, reason: "source-capacity-reached-unobserved-preserved" });
    const batch = store.cutBatch("main", "one")!;
    expect(batch.sources.map((source) => source.entryId)).toEqual(["one"]);
    store.commitCoverage(batch.id);
    expect(capture("three")).toMatchObject({ accepted: true });
    expect(store.cutBatch("main")?.sources.map((source) => source.entryId)).toEqual(["two", "three"]);
  });

  it("rejects credential-bearing observations", () => {
    const ledger = new ObservationLedger();
    expect(() => ledger.append({ ...observation("secret"), summary: "api_key=secret" })).toThrow(/forbidden/);
  });
});
