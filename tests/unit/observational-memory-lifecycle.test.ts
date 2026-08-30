import { describe, expect, it, vi } from "vitest";
import { AutomaticMemoryRuntime, detectHighValueEvent, PiEntryAncestryLaneTracker, type AutomaticMemoryCandidate, type MemPalacePort } from "../../src/runtime/observational-memory/index.js";

function capture(runtime: AutomaticMemoryRuntime, text = "My preference is concise status output"): void {
  runtime.capture({ id: "source-1", entryId: "entry-1", sessionId: "session", agentId: "main", branchId: "branch", sourceProject: "/project", role: "user", text, createdAt: "2026-08-28T00:00:00.000Z", origin: "foreground" });
}

function port(overrides: Partial<MemPalacePort> = {}): MemPalacePort {
  return {
    search: vi.fn(async () => ({ status: "success" as const, value: { records: [], omitted: 0 } })),
    checkpoint: vi.fn(async (candidates: readonly AutomaticMemoryCandidate[]) => ({ status: "success" as const, value: { receipts: candidates.map((candidate) => ({ schemaVersion: 1 as const, candidateId: candidate.id, fingerprint: candidate.fingerprint, target: "palace#shared", outcome: "committed" as const, settledAt: "2026-08-28T00:00:01.000Z", providerIds: [`provider-${candidate.id}`] })) } })),
    reconcileDuplicate: vi.fn(async () => ({ status: "success" as const, value: { duplicate: false, providerIds: [] } })),
    ...overrides,
  };
}

const observer = {
  async extract(batch: any) {
    return { schemaVersion: 1, candidates: [{ schemaVersion: 1, id: "candidate-1", kind: "preference", applicability: "global-preference", content: batch.sources[0].text, confidence: 0.95, support: "explicit", sourceIds: [batch.sources[0].id], sourceProject: batch.sources[0].sourceProject }] };
  },
};

describe("automatic observational memory lifecycle", () => {
  it("keeps descendants in one ancestry lane and separates a sibling fork", () => {
    const lanes = new PiEntryAncestryLaneTracker();
    const main = lanes.laneFor([{ id: "root" }, { id: "user-a", parentId: "root" }, { id: "assistant-a", parentId: "user-a" }], "session");
    const continued = lanes.laneFor([{ id: "root" }, { id: "user-a", parentId: "root" }, { id: "assistant-a", parentId: "user-a" }, { id: "user-b", parentId: "assistant-a" }], "session");
    const fork = lanes.laneFor([{ id: "root" }, { id: "user-fork", parentId: "root" }, { id: "assistant-fork", parentId: "user-fork" }], "session");
    const forkContinued = lanes.laneFor([{ id: "root" }, { id: "user-fork", parentId: "root" }, { id: "assistant-fork", parentId: "user-fork" }, { id: "tool-fork", parentId: "assistant-fork" }], "session");
    expect(continued).toBe(main);
    expect(fork).not.toBe(main);
    expect(forkContinued).toBe(fork);
    lanes.clear();
    expect(lanes.laneFor([{ id: "root" }, { id: "user-fork", parentId: "root" }], "new-session")).not.toBe(fork);
  });

  it("detects bounded Chinese high-value preference, decision, result, blocker and recovery signals", () => {
    expect(detectHighValueEvent("我的偏好是输出简洁", "user")).toBe("confirmed-preference");
    expect(detectHighValueEvent("我们决定采用这个接口", "assistant")).toBe("accepted-decision");
    expect(detectHighValueEvent("测试已通过，修复已验证", "tool-outcome")).toBe("verified-solution");
    expect(detectHighValueEvent("因缺少权限无法继续推进", "assistant")).toBe("material-blocker");
    expect(detectHighValueEvent("检查点已就绪，可从这里恢复", "assistant")).toBe("recovery-transition");
    expect(detectHighValueEvent("测试已通过", "assistant")).toBeUndefined();
  });

  it("checkpoints once at the boundary, records settlement and releases pending references", async () => {
    const fake = port();
    const runtime = new AutomaticMemoryRuntime({ observer, port: fake, tokenThreshold: 10_000 });
    capture(runtime);
    await runtime.checkpoint("branch");
    expect(fake.checkpoint).toHaveBeenCalledTimes(1);
    expect(runtime.status()).toMatchObject({ enabled: true, provider: "ready", pendingCount: 0, lastCheckpoint: "settled:1" });
  });

  it("releases five retry-exhausted candidates so a later pending candidate progresses", async () => {
    let checkpointCalls = 0;
    const checkpoint = vi.fn(async (candidates: readonly AutomaticMemoryCandidate[]) => {
      checkpointCalls += 1;
      if (checkpointCalls === 1) return { status: "unavailable" as const, reason: "fixture outage" };
      return { status: "success" as const, value: { receipts: candidates.map((candidate) => ({ schemaVersion: 1 as const, candidateId: candidate.id, fingerprint: candidate.fingerprint, target: "fixture", outcome: "committed" as const, settledAt: "2026-08-28T00:00:01.000Z", providerIds: [`provider-${candidate.id}`] })) } };
    });
    const reconcileDuplicate = vi.fn(async () => ({ status: "unavailable" as const, reason: "fixture outage" }));
    const quotes = ["My preference is alpha", "alpha beta", "beta gamma", "gamma delta", "delta epsilon", "epsilon zeta"];
    const manyObserver = { extract: async (batch: any) => ({ schemaVersion: 1, candidates: quotes.map((content, index) => ({ schemaVersion: 1, id: `candidate-${index}`, kind: "preference", applicability: "global-preference", content, confidence: 0.95, support: "explicit", sourceIds: [batch.sources[0].id], sourceProject: batch.sources[0].sourceProject })) }) };
    const runtime = new AutomaticMemoryRuntime({ observer: manyObserver, port: port({ checkpoint, reconcileDuplicate }) });
    capture(runtime, "My preference is alpha beta gamma delta epsilon zeta");
    for (let boundary = 0; boundary < 4; boundary += 1) await runtime.checkpoint("branch");
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(reconcileDuplicate).toHaveBeenCalledTimes(10);
    expect(checkpoint.mock.calls[1]![0].map((candidate) => candidate.id)).toEqual(["candidate-5"]);
    expect(runtime.status()).toMatchObject({ pendingCount: 0, rejectedCount: 5 });
  });

  it("checkpoints earlier compacted candidates while excluding an observed tail candidate", async () => {
    let writes = 0;
    const checkpoint = vi.fn(async (candidates: readonly AutomaticMemoryCandidate[]) => {
      writes += 1;
      if (writes === 1) return { status: "unavailable" as const, reason: "first boundary unavailable" };
      return { status: "success" as const, value: { receipts: candidates.map((candidate) => ({ schemaVersion: 1 as const, candidateId: candidate.id, fingerprint: candidate.fingerprint, target: "fixture", outcome: "committed" as const, settledAt: "2026-08-28T00:00:01.000Z", providerIds: [`provider-${candidate.id}`] })) } };
    });
    const exactObserver = { extract: async (batch: any) => ({ schemaVersion: 1, candidates: [{ schemaVersion: 1, id: `candidate-${batch.cutoff.coversUpToId}`, kind: "preference", applicability: "global-preference", content: batch.sources[0].text, confidence: 0.95, support: "explicit", sourceIds: [batch.sources[0].id], sourceProject: batch.sources[0].sourceProject }] }) };
    const runtime = new AutomaticMemoryRuntime({ observer: exactObserver, port: port({ checkpoint }), tokenThreshold: 10_000 });
    runtime.capture({ id: "source-early", entryId: "entry-early", sessionId: "session", agentId: "main", branchId: "branch", sourceProject: "/project", role: "user", text: "My preference is the compacted choice", createdAt: "2026-08-28T00:00:00.000Z" });
    await runtime.checkpoint("branch");
    runtime.capture({ id: "source-tail", entryId: "entry-tail", sessionId: "session", agentId: "main", branchId: "branch", sourceProject: "/project", role: "user", text: "My preference is the tail choice", createdAt: "2026-08-28T00:00:02.000Z" });
    await runtime.checkpoint("branch", undefined, ["entry-early", "uncaptured-tool-metadata"]);
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(checkpoint.mock.calls[1]![0].map((candidate) => candidate.sourceCutoff.coversUpToId)).toEqual(["entry-early"]);
    expect(runtime.status().pendingCount).toBe(1);
  });

  it("degrades truthfully without suppressing work when the provider is unavailable", async () => {
    const fake = port({ checkpoint: vi.fn(async () => ({ status: "unavailable" as const, reason: "fixture unavailable" })) });
    const runtime = new AutomaticMemoryRuntime({ observer, port: fake });
    capture(runtime);
    await expect(runtime.checkpoint("branch")).resolves.toBeUndefined();
    expect(runtime.status()).toMatchObject({ provider: "degraded", pendingCount: 1, lastCheckpoint: "checkpoint-unavailable", lastProviderError: "checkpoint:unavailable" });
  });

  it("searches once per topic and marks foreign project decisions reference-only", async () => {
    const search = vi.fn(async () => ({ status: "success" as const, value: { omitted: 0, records: [{ id: "remote-1", fingerprint: "a".repeat(64), kind: "project-decision" as const, applicability: "project-decision" as const, content: "Use the remote build layout", sourceProject: "/other", projectIdentity: "other", sourceAgent: "agent", sourceSession: "session", confidence: 0.9, status: "active" as const }] } }));
    const runtime = new AutomaticMemoryRuntime({ port: port({ search }), currentProjectIdentity: "current", currentSessionId: "session" });
    const first = await runtime.recall("Fix build layout failure");
    const second = await runtime.recall("Fix build layout failure");
    expect(search).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first?.text).toContain("use=reference-only");
  });

  it("starts a fresh diagnostic epoch after authorization", async () => {
    const runtime = new AutomaticMemoryRuntime({ port: port(), authorityArmed: () => true, providerVersionCompatible: () => true });
    runtime.revoke();
    expect(runtime.status()).toMatchObject({ armed: false, lastCheckpoint: "standing-policy-revoked", lastRecall: "standing-policy-revoked" });
    runtime.authorize();
    expect(runtime.status()).toMatchObject({ armed: true, provider: "unarmed", lastCheckpoint: "not-attempted", lastRecall: "not-attempted" });
    expect(runtime.status().lastProviderError).toBeUndefined();
  });

  it("defaults local observation on and clears bounded state on disable/shutdown", async () => {
    const runtime = new AutomaticMemoryRuntime({ observer });
    expect(runtime.status()).toMatchObject({ enabled: true, provider: "unarmed", armed: false });
    capture(runtime);
    await runtime.checkpoint("branch");
    expect(runtime.status().lastCheckpoint).toBe("unarmed-no-live-port");
    runtime.setEnabled(false);
    expect(await runtime.recall("build failure")).toBeUndefined();
    runtime.shutdown();
    expect(runtime.status()).toMatchObject({ enabled: false, pendingCount: 0 });
  });
});
