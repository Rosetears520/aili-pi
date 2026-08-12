import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HubService, type LiveAgentAdapter } from "../../src/runtime/persistent-agents/hub.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import { FORMAL_RUNTIME_LIMITS } from "../../src/runtime/persistent-agents/task-schema.js";
import type { AgentRecord, JobRecord, SidecarLayout } from "../../src/runtime/persistent-agents/types.js";

let scratch = "";
let eventId = 0;
let timestamp = 0;
let layout: SidecarLayout;
let journal: CoordinatorJournal;

function options() {
  return {
    eventId: () => `event-${++eventId}`,
    clock: () => new Date(Date.UTC(2026, 6, 25, 2, 0, ++timestamp)),
  };
}

async function createAgent(id: string, target: AgentRecord["state"], parentAgentId?: string, currentJobId?: string, metadata?: AgentRecord["metadata"]): Promise<void> {
  const now = "2026-07-25T02:00:00.000Z";
  const record: AgentRecord = {
    id,
    name: id,
    selector: id.includes("Scout") ? "aili.code-scout" : "general",
    state: "queued",
    parentAgentId,
    currentJobId,
    createdAt: now,
    updatedAt: now,
    metadata,
  };
  await journal.append({ kind: "agent.created", agentId: id, payload: { record } });
  if (target === "aborted") {
    await journal.append({ kind: "agent.state", agentId: id, payload: { from: "queued", to: "aborted" } });
    return;
  }
  if (target !== "queued") await journal.append({ kind: "agent.state", agentId: id, payload: { from: "queued", to: "running" } });
  if (target === "idle" || target === "parked") await journal.append({ kind: "agent.state", agentId: id, payload: { from: "running", to: "idle" } });
  if (target === "parked") await journal.append({ kind: "agent.state", agentId: id, payload: { from: "idle", to: "parked" } });
}

async function createJob(id: string, agentId: string, state: JobRecord["state"]): Promise<void> {
  const now = "2026-07-25T02:00:00.000Z";
  const record: JobRecord = { id, agentId, state: "queued", createdAt: now, updatedAt: now };
  await journal.append({ kind: "job.created", agentId, jobId: id, payload: { record } });
  if (state === "running") await journal.append({ kind: "job.state", agentId, jobId: id, payload: { from: "queued", to: "running" } });
  if (state === "completed") {
    await journal.append({ kind: "job.state", agentId, jobId: id, payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "job.state", agentId, jobId: id, payload: { from: "running", to: "completed" } });
  }
}

function liveFixture(overrides: Partial<LiveAgentAdapter> = {}) {
  const state = { steered: [] as string[], messages: [] as string[], aborted: [] as string[], disposed: 0 };
  const adapter: LiveAgentAdapter = {
    steer: async (message) => { state.steered.push(message); },
    sendUserMessage: async (message) => { state.messages.push(message); },
    abort: async (reason) => { state.aborted.push(reason); },
    dispose: async () => { state.disposed += 1; },
    ...overrides,
  };
  return { state, adapter };
}

function continuationAudit(overrides: Record<string, unknown> = {}) {
  return {
    packageId: "P-01",
    canonicalRole: "aili.code-scout",
    scope: "Inspect only the bounded package.",
    forbiddenScope: "Do not write or expand the claim.",
    writeScope: { paths: [], resources: [] },
    acceptanceBoundary: "Return evidence for ROSE inspection.",
    expectedEvidence: "Exact source anchors and focused checks.",
    ...overrides,
  };
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-hub-"));
  eventId = 0;
  timestamp = 0;
  const parent = join(scratch, "parent.jsonl");
  await writeFile(parent, "fixture parent\n");
  layout = await ensureSidecarLayout(parent);
  journal = (await CoordinatorJournal.open(layout, "parent-1", options())).journal;
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("hub lifecycle and messaging", () => {
  it("delivers running messages through safe-boundary steer and durably deduplicates success", async () => {
    await createAgent("Running", "running");
    const live = liveFixture();
    const hub = new HubService({ journal, revive: async () => live.adapter });
    hub.registerLive("Running", live.adapter);

    await expect(hub.execute({ action: "send", agentId: "Running", message: "token=secret", messageId: "secret-msg" })).rejects.toThrow(/credential\/auth\/private-key/);
    expect(journal.getState().messages["secret-msg"]).toBeUndefined();
    expect(await hub.execute({ action: "send", agentId: "Running", message: "aside", messageId: "msg-1" })).toMatchObject({
      status: "delivered",
      delivery: "steer-safe-boundary",
    });
    expect(live.state.steered).toEqual(["aside"]);
    expect(journal.getState().mailboxes.Running).toBeUndefined();
    expect(await hub.execute({ action: "send", agentId: "Running", message: "aside", messageId: "msg-1" })).toMatchObject({
      status: "delivered",
      deduplicated: true,
    });
    expect(live.state.steered).toEqual(["aside"]);
  });

  it("parks an idle live Agent through the same per-Agent serialization boundary", async () => {
    await createAgent("Idle", "idle");
    const live = liveFixture();
    const hub = new HubService({ journal, revive: async () => live.adapter });
    hub.registerLive("Idle", live.adapter);
    expect(await hub.park("Idle")).toBe(true);
    expect(live.state.disposed).toBe(1);
    expect(journal.getState().agents.Idle.state).toBe("parked");
    expect(await hub.park("Idle")).toBe(false);
  });

  it("starts exactly one idle turn, revives a parked Agent, and settles both back to idle", async () => {
    await createAgent("Idle", "idle");
    await createAgent("Parked", "parked");
    const idleLive = liveFixture();
    const parkedLive = liveFixture();
    const revive = vi.fn(async () => parkedLive.adapter);
    const hub = new HubService({ journal, revive });
    hub.registerLive("Idle", idleLive.adapter);

    const idleReceipt = await hub.execute({ action: "send", agentId: "Idle", message: "wake" }) as { turnId: string };
    expect(idleLive.state.messages).toEqual(["wake"]);
    expect(journal.getState().agents.Idle.state).toBe("running");
    expect(journal.getState().turns[idleReceipt.turnId].state).toBe("running");
    await hub.settleMessageTurn("Idle", idleReceipt.turnId, "completed");
    expect(journal.getState().agents.Idle.state).toBe("idle");

    const parkedReceipt = await hub.execute({ action: "send", agentId: "Parked", message: "revive" }) as { turnId: string };
    expect(revive).toHaveBeenCalledOnce();
    expect(parkedLive.state.messages).toEqual(["revive"]);
    await hub.settleMessageTurn("Parked", parkedReceipt.turnId, "failed", "fixture turn failure");
    expect(journal.getState().agents.Parked.state).toBe("idle");
    expect(journal.getState().turns[parkedReceipt.turnId].state).toBe("failed");
  });

  it("allows only an unchanged formal identity and audits both revived-turn and running-steer continuation", async () => {
    const identity = continuationAudit();
    await createAgent("FormalScout", "parked", undefined, undefined, { formalContinuationIdentity: identity });
    const live = liveFixture();
    const hub = new HubService({ journal, revive: async () => live.adapter });

    const revived = await hub.execute({
      action: "send",
      agentId: "FormalScout",
      message: "Clarify the same evidence.",
      messageId: "formal-revive",
      continuationAudit: identity,
    }) as { turnId: string };
    expect(live.state.messages).toEqual(["Clarify the same evidence."]);
    expect(journal.getState().turns[revived.turnId]?.metadata?.formalContinuationIdentity).toEqual(identity);
    expect(journal.getState().messages["formal-revive"]?.formalContinuationIdentity).toEqual(identity);

    await expect(hub.execute({
      action: "send",
      agentId: "FormalScout",
      message: "Supplement unchanged evidence.",
      messageId: "formal-steer",
      continuationAudit: identity,
    })).resolves.toMatchObject({ delivery: "steer-safe-boundary" });
    expect(live.state.steered).toEqual(["Supplement unchanged evidence."]);
    expect(journal.getState().turns[revived.turnId]?.metadata?.formalContinuationAudits).toEqual([
      {
        messageId: "formal-steer",
        contentHash: createHash("sha256").update("Supplement unchanged evidence.").digest("hex"),
        unchangedIdentity: identity,
      },
    ]);
    await journal.flush();
    const replayed = (await CoordinatorJournal.open(layout, "parent-1", options())).journal.getState();
    expect(replayed.turns[revived.turnId]?.metadata?.formalContinuationAudits).toEqual(
      journal.getState().turns[revived.turnId]?.metadata?.formalContinuationAudits,
    );
    expect(replayed.messages["formal-steer"]).toMatchObject({
      status: "delivered",
      contentHash: createHash("sha256").update("Supplement unchanged evidence.").digest("hex"),
      formalContinuationIdentity: identity,
    });
  });

  it("preflights the exact running turn and leaves all durable state unchanged when formal audit append fails", async () => {
    const identity = continuationAudit();
    await createAgent("FormalScout", "running", undefined, undefined, { formalContinuationIdentity: identity });
    const live = liveFixture();
    const hub = new HubService({ journal, revive: async () => live.adapter });
    hub.registerLive("FormalScout", live.adapter);

    const beforeMissingTurn = journal.getState();
    await expect(hub.execute({
      action: "send",
      agentId: "FormalScout",
      message: "Must not steer without a running turn.",
      messageId: "formal-no-turn",
      continuationAudit: identity,
    })).rejects.toThrow(/no exact running turn/);
    expect(journal.getState()).toEqual(beforeMissingTurn);
    expect(live.state.steered).toEqual([]);

    await createAgent("FormalScoutReady", "parked", undefined, undefined, { formalContinuationIdentity: identity });
    const ready = await hub.execute({
      action: "send",
      agentId: "FormalScoutReady",
      message: "Create the exact running turn.",
      messageId: "formal-ready",
      continuationAudit: identity,
    }) as { turnId: string };
    const beforeAppendFailure = journal.getState();
    const append = vi.spyOn(journal, "append").mockRejectedValueOnce(new Error("injected formal audit append failure"));
    await expect(hub.execute({
      action: "send",
      agentId: "FormalScoutReady",
      message: "Must not steer or enqueue after audit failure.",
      messageId: "formal-audit-failure",
      continuationAudit: identity,
    })).rejects.toThrow(/injected formal audit append failure/);
    append.mockRestore();
    expect(journal.getState()).toEqual(beforeAppendFailure);
    expect(journal.getState().turns[ready.turnId]?.metadata?.formalContinuationAudits).toBeUndefined();
    expect(journal.getState().messages["formal-audit-failure"]).toBeUndefined();
    expect(journal.getState().mailboxes.FormalScoutReady).toBeUndefined();
    expect(live.state.steered).toEqual([]);
  });

  it("deduplicates formal message IDs only for the exact agent, sender, content hash, and continuation identity", async () => {
    const identity = continuationAudit();
    await createAgent("FormalScout", "parked", undefined, undefined, { formalContinuationIdentity: identity });
    await createAgent("OtherFormalScout", "parked", undefined, undefined, { formalContinuationIdentity: identity });
    const live = liveFixture();
    const hub = new HubService({ journal, revive: async () => live.adapter });
    await hub.execute({
      action: "send",
      agentId: "FormalScout",
      message: "Open the running turn.",
      messageId: "formal-open",
      continuationAudit: identity,
    });
    await hub.execute({
      action: "send",
      agentId: "FormalScout",
      message: "Exact dedupe body.",
      messageId: "formal-dedupe",
      continuationAudit: identity,
    });
    const executionCount = live.state.steered.length;
    expect(await hub.execute({
      action: "send",
      agentId: "FormalScout",
      message: "Exact dedupe body.",
      messageId: "formal-dedupe",
      continuationAudit: identity,
    })).toMatchObject({ deduplicated: true, status: "delivered" });

    for (const [label, request] of [
      ["content", { agentId: "FormalScout", message: "Different body.", continuationAudit: identity }],
      ["sender", { agentId: "FormalScout", message: "Exact dedupe body.", continuationAudit: identity, caller: { agentId: "FormalScout" } }],
      ["audit", { agentId: "FormalScout", message: "Exact dedupe body.", continuationAudit: continuationAudit({ expectedEvidence: "Different evidence." }) }],
      ["agent", { agentId: "OtherFormalScout", message: "Exact dedupe body.", continuationAudit: identity }],
    ] as const) {
      const before = journal.getState();
      await expect(hub.execute({
        action: "send",
        agentId: request.agentId,
        message: request.message,
        messageId: "formal-dedupe",
        continuationAudit: request.continuationAudit,
      }, "caller" in request ? request.caller : {}), label).rejects.toThrow(/collides|continuation identity changed/);
      expect(journal.getState(), label).toEqual(before);
      expect(live.state.steered, label).toHaveLength(executionCount);
    }
  });

  it("enforces exact bounded formal hub messages without changing ordinary message trimming", async () => {
    const identity = continuationAudit();
    await createAgent("FormalScout", "idle", undefined, undefined, { formalContinuationIdentity: identity });
    await createAgent("Ordinary", "running");
    const live = liveFixture();
    const hub = new HubService({ journal, revive: async () => live.adapter });
    hub.registerLive("FormalScout", live.adapter);
    hub.registerLive("Ordinary", live.adapter);
    for (const [name, message] of [
      ["padded", " padded"],
      ["newline", "line one\nline two"],
      ["control", "bad\u0001message"],
      ["oversized", "x".repeat(FORMAL_RUNTIME_LIMITS.hubMessageBytes + 1)],
    ]) {
      const before = journal.getState();
      await expect(hub.execute({
        action: "send",
        agentId: "FormalScout",
        message,
        messageId: `formal-${name}`,
        continuationAudit: identity,
      }), name).rejects.toThrow(/exact|single line|exceeds/);
      expect(journal.getState(), name).toEqual(before);
    }
    await expect(hub.execute({ action: "send", agentId: "Ordinary", message: " ordinary " })).resolves.toMatchObject({ status: "delivered" });
    expect(live.state.steered).toEqual(["ordinary"]);
  });

  it("rejects every omitted or changed formal identity field before message, mailbox, turn, or execution", async () => {
    const identity = continuationAudit();
    const without = (key: string) => Object.fromEntries(Object.entries(identity).filter(([candidate]) => candidate !== key));
    await createAgent("FormalScout", "idle", undefined, undefined, { formalContinuationIdentity: identity });
    const live = liveFixture();
    const hub = new HubService({ journal, revive: async () => live.adapter });
    hub.registerLive("FormalScout", live.adapter);
    const variants: Array<[string, unknown]> = [
      ["omitted", undefined],
      ["package", { ...identity, packageId: "P-02" }],
      ["role", { ...identity, canonicalRole: "aili.implementer" }],
      ["scope", { ...identity, scope: "Changed scope." }],
      ["forbidden", { ...identity, forbiddenScope: "Changed forbidden scope." }],
      ["write", { ...identity, writeScope: { paths: ["src"], resources: [] } }],
      ["acceptance", { ...identity, acceptanceBoundary: "Changed acceptance claim." }],
      ["evidence", { ...identity, expectedEvidence: "Changed evidence claim." }],
      ["missing-package", without("packageId")],
      ["missing-role", without("canonicalRole")],
      ["missing-scope", without("scope")],
      ["missing-forbidden", without("forbiddenScope")],
      ["missing-write", without("writeScope")],
      ["missing-acceptance", without("acceptanceBoundary")],
      ["missing-evidence", without("expectedEvidence")],
    ];
    for (const [name, candidate] of variants) {
      const before = journal.getState().lastSequence;
      await expect(hub.execute({
        action: "send",
        agentId: "FormalScout",
        message: `rejected-${name}`,
        messageId: `rejected-${name}`,
        ...(candidate === undefined ? {} : { continuationAudit: candidate }),
      }), name).rejects.toThrow(/continuationAudit|new bounded job\/Agent|continuation identity changed|must be/);
      expect(journal.getState().lastSequence, name).toBe(before);
    }
    expect(journal.getState().messages).toEqual({});
    expect(journal.getState().mailboxes.FormalScout).toBeUndefined();
    expect(Object.values(journal.getState().turns).filter((turn) => turn.agentId === "FormalScout")).toEqual([]);
    expect(live.state.messages).toEqual([]);
    expect(live.state.steered).toEqual([]);
  });

  it("does not reuse aborted or released formal Agents", async () => {
    const identity = continuationAudit();
    await createAgent("DeadScout", "aborted", undefined, undefined, { formalContinuationIdentity: identity });
    await createAgent("ReleasedScout", "idle", undefined, undefined, { formalContinuationIdentity: identity });
    const hub = new HubService({ journal, revive: async () => { throw new Error("must not revive"); } });
    await hub.execute({ action: "cancel", id: "ReleasedScout" });
    const beforeMessages = Object.keys(journal.getState().messages).length;
    const beforeTurns = Object.keys(journal.getState().turns).length;
    await expect(hub.execute({ action: "send", agentId: "DeadScout", message: "no", continuationAudit: identity })).rejects.toThrow(/terminal aborted/);
    await expect(hub.execute({ action: "send", agentId: "ReleasedScout", message: "no", continuationAudit: identity })).rejects.toThrow(/unknown Agent/);
    expect(Object.keys(journal.getState().messages)).toHaveLength(beforeMessages);
    expect(Object.keys(journal.getState().turns)).toHaveLength(beforeTurns);
  });

  it("serializes concurrent sends so one idle identity never starts two turns", async () => {
    await createAgent("Idle", "idle");
    const live = liveFixture({
      sendUserMessage: async (message) => {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
        live.state.messages.push(message);
      },
    });
    const hub = new HubService({ journal, revive: async () => live.adapter });
    hub.registerLive("Idle", live.adapter);
    const [first, second] = await Promise.all([
      hub.execute({ action: "send", agentId: "Idle", message: "first", messageId: "concurrent-1" }),
      hub.execute({ action: "send", agentId: "Idle", message: "second", messageId: "concurrent-2" }),
    ]);
    expect(first).toMatchObject({ delivery: "idle-turn" });
    expect(second).toMatchObject({ delivery: "steer-safe-boundary" });
    expect(live.state.messages).toEqual(["first"]);
    expect(live.state.steered).toEqual(["second"]);
    expect(Object.values(journal.getState().turns).filter((turn) => turn.agentId === "Idle")).toHaveLength(1);
  });

  it("does not inflate mailbox on permanent revive failure or allow aborted revival", async () => {
    await createAgent("Parked", "parked");
    await createAgent("Dead", "aborted");
    const hub = new HubService({
      journal,
      revive: async () => { throw new Error("session path is permanently invalid"); },
    });
    expect(await hub.execute({ action: "send", agentId: "Parked", message: "cannot revive", messageId: "revive-fail" })).toMatchObject({
      status: "failed",
      permanent: true,
    });
    expect(journal.getState().mailboxes.Parked).toBeUndefined();
    await expect(hub.execute({ action: "send", agentId: "Dead", message: "no" })).rejects.toThrow(/terminal aborted/);
  });

  it("persists only failed live handoffs, survives replay, caps at 100, and rejects the newest overflow", async () => {
    await createAgent("Idle", "idle");
    const hub = new HubService({ journal, revive: async () => { throw new Error("not used"); } });
    for (let index = 1; index <= 100; index += 1) {
      expect(await hub.execute({ action: "send", agentId: "Idle", message: `message-${index}`, messageId: `m-${index}` })).toMatchObject({ status: "queued", mailboxSize: index });
    }
    expect(await hub.execute({ action: "send", agentId: "Idle", message: "overflow", messageId: "m-101" })).toMatchObject({
      status: "failed",
      overflow: true,
    });
    expect(journal.getState().mailboxes.Idle.messages).toHaveLength(100);
    expect(journal.getState().mailboxes.Idle.messages.at(-1)).toMatchObject({ id: "m-100" });
    expect(await hub.execute({ action: "send", agentId: "Idle", message: "same", messageId: "m-1" })).toMatchObject({
      status: "queued",
      deduplicated: true,
    });
    expect(journal.getState().mailboxes.Idle.messages).toHaveLength(100);

    await journal.flush();
    const reopened = (await CoordinatorJournal.open(layout, "parent-1", options())).journal;
    const resumedHub = new HubService({ journal: reopened, revive: async () => { throw new Error("not used"); } });
    expect(await resumedHub.execute({ action: "inbox", agentId: "Idle" })).toMatchObject({ count: 100, mode: "peek" });
    expect(await resumedHub.execute({ action: "inbox", agentId: "Idle", mode: "drain" })).toMatchObject({ count: 100, mode: "drain" });
    expect(reopened.getState().mailboxes.Idle.messages).toEqual([]);
  }, 15_000);

  it("enforces descendant ownership and scopes list/jobs without cross-parent control", async () => {
    await createAgent("Parent", "idle");
    await createAgent("Parent.Scout", "idle", "Parent");
    await createAgent("Sibling", "idle");
    await createJob("job-child", "Parent.Scout", "completed");
    const hub = new HubService({ journal, revive: async () => { throw new Error("not used"); } });

    expect(await hub.execute({ action: "list" }, { agentId: "Parent" })).toMatchObject({
      agents: expect.arrayContaining([expect.objectContaining({ id: "Parent" }), expect.objectContaining({ id: "Parent.Scout" })]),
    });
    expect((await hub.execute({ action: "jobs" }, { agentId: "Parent" }) as { jobs: JobRecord[] }).jobs.map((job) => job.id)).toEqual(["job-child"]);
    await expect(hub.execute({ action: "send", agentId: "Sibling", message: "cross" }, { agentId: "Parent" })).rejects.toThrow(/cross-owner/);
    await expect(hub.execute({ action: "jobs", jobId: "job-child" }, { agentId: "Sibling" })).rejects.toThrow(/cross-owner/);
  });

  it("routes job cancellation, releases idle identity without deleting history, and resolves output/history/model adapters", async () => {
    await createAgent("Running", "running", undefined, "job-1");
    await createJob("job-1", "Running", "running");
    await createAgent("Idle", "idle");
    await createAgent("Wake", "idle");
    const live = liveFixture();
    const wakeLive = liveFixture();
    const cancelJob = vi.fn(async () => "running" as const);
    const model = vi.fn(async () => ({ operation: "query", value: "fixture/model" }));
    const hub = new HubService({
      journal,
      revive: async () => live.adapter,
      cancelJob,
      output: async (agent, offset, limit) => ({ agent: agent.id, offset, limit, source: "disk" }),
      history: async (agent, offset, limit) => ({ agent: agent.id, offset, limit, entries: [] }),
      model,
    });
    hub.registerLive("Running", live.adapter);
    hub.registerLive("Wake", wakeLive.adapter);
    expect(await hub.execute({ action: "cancel", id: "job-1" })).toMatchObject({ result: "running", transcriptPreserved: true });
    expect(live.state.aborted).toEqual(["hub cancel job-1"]);
    expect(cancelJob).toHaveBeenCalledWith("job-1");

    await hub.execute({ action: "send", agentId: "Wake", message: "start turn" });
    expect(journal.getState().agents.Wake.state).toBe("running");
    expect(await hub.execute({ action: "cancel", id: "Wake" })).toMatchObject({ result: "aborted", transcriptPreserved: true });
    expect(wakeLive.state.aborted).toEqual(["hub cancel Wake"]);
    expect(journal.getState().agents.Wake.state).toBe("aborted");

    expect(await hub.execute({ action: "cancel", id: "Idle" })).toMatchObject({ result: "released", transcriptPreserved: true });
    expect(journal.getState().agents.Idle).toBeUndefined();
    expect(journal.getState().releasedAgents.Idle).toBeTruthy();
    expect(await hub.execute({ action: "output", agentId: "Idle", offset: 2, limit: 7 })).toEqual({ agent: "Idle", offset: 2, limit: 7, source: "disk" });
    expect(await hub.execute({ action: "history", agentId: "Idle" })).toMatchObject({ agent: "Idle", entries: [] });
    expect(await hub.execute({ action: "model", operation: "query", agentId: "Running" })).toEqual({ operation: "query", value: "fixture/model" });
    expect(model).toHaveBeenCalledOnce();
  });

  it("waits only for terminal owned jobs/messages and never reports unknown or pending IDs completed", async () => {
    await createAgent("Idle", "idle");
    await createJob("job-1", "Idle", "completed");
    const hub = new HubService({ journal, revive: async () => { throw new Error("not used"); } });
    const queued = await hub.execute({ action: "send", agentId: "Idle", message: "mail", messageId: "msg-queued" }) as { messageId: string };
    expect(await hub.execute({ action: "wait", jobIds: ["job-1"], messageIds: [queued.messageId], timeoutMs: 0 })).toMatchObject({
      completed: true,
      timedOut: false,
    });
    expect(await hub.execute({ action: "wait", jobIds: ["missing"], timeoutMs: 0 })).toMatchObject({
      completed: false,
      timedOut: true,
      unknown: ["missing"],
    });
    await expect(hub.execute({ action: "wait", timeoutMs: 0 })).rejects.toThrow(/requires jobIds or messageIds/);
  });
});
