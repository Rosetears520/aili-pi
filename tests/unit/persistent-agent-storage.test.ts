import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allocateAgentId,
  assertSafeAgentId,
  CoordinatorJournal,
  createChildSessionManager,
  ensureSidecarLayout,
  IdleLifecycleRegistry,
  openChildSessionManager,
  registerChildSession,
  reconcileUnfinishedCoordinator,
  replayCoordinator,
  resumeCoordinator,
  sanitizeAgentName,
  sidecarLayoutForParent,
  type TimerScheduler,
} from "../../src/runtime/persistent-agents/storage.js";
import type { AgentRecord, JobRecord, SidecarLayout, TurnRecord } from "../../src/runtime/persistent-agents/types.js";

let scratch = "";
let layout: SidecarLayout;
let parentFile = "";
let idCounter = 0;
let timeCounter = 0;

function journalOptions() {
  return {
    eventId: () => `event-${++idCounter}`,
    clock: () => new Date(Date.UTC(2026, 6, 25, 0, 0, ++timeCounter)),
  };
}

async function createFixtureLayout(): Promise<SidecarLayout> {
  const cwd = join(scratch, "project");
  const sessions = join(scratch, "sessions");
  await mkdir(cwd, { recursive: true });
  await mkdir(sessions, { recursive: true });
  const parent = SessionManager.create(cwd, sessions, { id: "parent" });
  parent.appendCustomMessageEntry("fixture.parent", "owned", false);
  parentFile = parent.getSessionFile()!;
  // SessionManager may defer the first physical write until a persisted model
  // message; the storage fixture only needs the exact owned parent path.
  await writeFile(parentFile, "fixture parent session\n", "utf8");
  return await ensureSidecarLayout(parentFile);
}

function agent(id: string, state: AgentRecord["state"] = "queued", current?: { jobId?: string; turnId?: string }): AgentRecord {
  return {
    id,
    name: id,
    selector: "general",
    state,
    currentJobId: current?.jobId,
    currentTurnId: current?.turnId,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function job(id: string, agentId: string): JobRecord {
  return {
    id,
    agentId,
    state: "queued",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function turn(id: string, agentId: string, jobId: string): TurnRecord {
  return {
    id,
    agentId,
    jobId,
    state: "queued",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-storage-"));
  idCounter = 0;
  timeCounter = 0;
  layout = await createFixtureLayout();
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("parent-owned persistent Agent storage", () => {
  it("creates the parent sibling layout and allocates deterministic path-safe IDs", async () => {
    expect(layout.root).toBe(parentFile.slice(0, -".jsonl".length) + "/aili-agents");
    expect(layout).toMatchObject({
      coordinatorPath: join(layout.root, "coordinator.jsonl"),
      snapshotPath: join(layout.root, "snapshot.json"),
      agentsDir: join(layout.root, "agents"),
      patchesDir: join(layout.root, "patches"),
      workspacesPath: join(layout.root, "workspaces.jsonl"),
    });
    expect(sanitizeAgentName("  Code Scout / α  ")).toBe("Code-Scout");
    expect(allocateAgentId("Scout", [])).toBe("Scout");
    expect(allocateAgentId("Scout", ["Scout", "Scout-2"])).toBe("Scout-3");
    expect(allocateAgentId("Child", ["Parent.Child"], "Parent")).toBe("Parent.Child-2");
    expect(() => assertSafeAgentId("../escape")).toThrow(/unsafe Agent ID/);
    expect(() => sidecarLayoutForParent("relative.jsonl")).toThrow(/absolute/);

    const maliciousParent = join(scratch, "malicious.jsonl");
    await writeFile(maliciousParent, "fixture");
    const maliciousLayout = sidecarLayoutForParent(maliciousParent);
    await mkdir(join(scratch, "redirect"));
    await mkdir(resolve(maliciousLayout.root, ".."), { recursive: true });
    await symlink(join(scratch, "redirect"), maliciousLayout.root);
    await expect(ensureSidecarLayout(maliciousParent)).rejects.toThrow(/must not be a symlink/);
  });

  it("serializes concurrent appends, rejects invalid transitions, and replays stable identity", async () => {
    const { journal } = await CoordinatorJournal.open(layout, "parent-1", journalOptions());
    await Promise.all([
      journal.append({ kind: "agent.created", agentId: "Scout", payload: { record: agent("Scout") } }),
      journal.append({ kind: "agent.created", agentId: "Scout-2", payload: { record: agent("Scout-2") } }),
    ]);
    await journal.append({ kind: "agent.state", agentId: "Scout", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "agent.state", agentId: "Scout", payload: { from: "running", to: "idle" } });
    await journal.flush();

    const lines = (await readFile(layout.coordinatorPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(new Set(lines.map((event) => event.eventId)).size).toBe(4);
    const replay = await replayCoordinator(layout, "parent-1");
    expect(replay.state.agents.Scout.state).toBe("idle");
    expect(allocateAgentId("Scout", Object.keys(replay.state.agents))).toBe("Scout-3");
    await expect(replayCoordinator(layout, "another-parent")).rejects.toThrow(/ownership mismatch/);

    const reopened = await CoordinatorJournal.open(layout, "parent-1", journalOptions());
    await expect(reopened.journal.append({
      kind: "agent.state",
      agentId: "Scout",
      payload: { from: "queued", to: "running" },
    })).rejects.toThrow(/stale transition/);
  });

  it("atomically snapshots state and applies only later journal events", async () => {
    const { journal } = await CoordinatorJournal.open(layout, "parent-1", journalOptions());
    await journal.append({ kind: "agent.created", agentId: "Worker", payload: { record: agent("Worker") } });
    const snapshot = await journal.compact();
    expect(snapshot.checkpointSequence).toBe(1);
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "queued", to: "running" } });
    await journal.flush();

    const replay = await replayCoordinator(layout, "parent-1");
    expect(replay.diagnostics.snapshotLoaded).toBe(true);
    expect(replay.state.lastSequence).toBe(2);
    expect(replay.state.agents.Worker.state).toBe("running");

    await writeFile(layout.snapshotPath, "{invalid snapshot\n");
    await expect(replayCoordinator(layout, "parent-1")).rejects.toThrow(/invalid coordinator snapshot/);
  });

  it("reports one final partial line but fails closed on complete corruption and duplicate event IDs", async () => {
    const { journal } = await CoordinatorJournal.open(layout, "parent-1", journalOptions());
    await journal.append({ kind: "agent.created", agentId: "Worker", payload: { record: agent("Worker") } });
    await journal.flush();
    await writeFile(layout.coordinatorPath, `${await readFile(layout.coordinatorPath, "utf8")}{\"schemaVersion\":1`, "utf8");

    const tolerated = await replayCoordinator(layout, "parent-1");
    expect(tolerated.diagnostics).toMatchObject({ toleratedFinalPartialLine: true, snapshotLoaded: false });
    expect(tolerated.diagnostics.ignoredBytes).toBeGreaterThan(0);
    expect(tolerated.state.agents.Worker).toBeTruthy();

    const firstLine = (await readFile(layout.coordinatorPath, "utf8")).split("\n")[0]!;
    await writeFile(layout.coordinatorPath, `${firstLine}\n{oops}\n`);
    await expect(replayCoordinator(layout, "parent-1")).rejects.toThrow(/line 2/);

    const event1 = JSON.parse(firstLine);
    const event2 = { ...event1, sequence: 2 };
    await writeFile(layout.coordinatorPath, `${JSON.stringify(event1)}\n${JSON.stringify(event2)}\n`);
    await expect(replayCoordinator(layout, "parent-1")).rejects.toThrow(/duplicate eventId/);
  });

  it("creates, registers, and reopens the exact official Pi child JSONL without model work", async () => {
    const { journal } = await CoordinatorJournal.open(layout, "parent-1", journalOptions());
    await journal.append({ kind: "agent.created", agentId: "Scout", payload: { record: agent("Scout") } });
    const created = await createChildSessionManager(layout, join(scratch, "project"), "Scout");
    created.sessionManager.appendCustomMessageEntry("fixture.child", "persisted", false, { turn: 1 });
    created.sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "persist child session" }],
      timestamp: Date.now(),
      api: "fixture",
      provider: "fixture",
      model: "fixture",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
    } as never);
    await registerChildSession(journal, "Scout", created.sessionPath);
    await journal.flush();

    expect(journal.getState().agents.Scout.sessionPath).toBe(created.sessionPath);
    const reopened = await openChildSessionManager(layout, created.sessionPath);
    expect(reopened.getHeader()).toMatchObject({ id: "Scout", parentSession: parentFile });
    expect(reopened.getEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "custom_message", customType: "fixture.child", details: { turn: 1 } }),
    ]));

    await journal.append({ kind: "agent.created", agentId: "Scout-2", payload: { record: agent("Scout-2") } });
    await expect(registerChildSession(journal, "Scout-2", created.sessionPath)).rejects.toThrow(/already owned/);
    await expect(journal.append({ kind: "agent.state", agentId: "Scout", payload: { from: "queued", to: "running" } })).rejects.toThrow();
  });

  it("rehydrates without session/model work and reconciles running and queued work without replay", async () => {
    const { journal } = await CoordinatorJournal.open(layout, "parent-1", journalOptions());
    await journal.append({ kind: "agent.created", agentId: "Running", payload: { record: agent("Running", "queued", { jobId: "job-1", turnId: "turn-1" }) } });
    await journal.append({ kind: "job.created", agentId: "Running", jobId: "job-1", payload: { record: job("job-1", "Running") } });
    await journal.append({ kind: "turn.created", agentId: "Running", jobId: "job-1", turnId: "turn-1", payload: { record: turn("turn-1", "Running", "job-1") } });
    await journal.append({ kind: "agent.state", agentId: "Running", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "job.state", agentId: "Running", jobId: "job-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.state", agentId: "Running", jobId: "job-1", turnId: "turn-1", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "turn.audit", agentId: "Running", jobId: "job-1", turnId: "turn-1", payload: { provider: "fixture", model: "model", modelLayer: "parent-fallback", effectiveTools: ["read"] } });

    await journal.append({ kind: "agent.created", agentId: "Queued", payload: { record: agent("Queued", "queued", { jobId: "job-2" }) } });
    await journal.append({ kind: "job.created", agentId: "Queued", jobId: "job-2", payload: { record: job("job-2", "Queued") } });
    await journal.flush();

    const resumed = await resumeCoordinator(layout, "parent-1", journalOptions());
    const state = resumed.journal.getState();
    expect(state.agents.Running.state).toBe("parked");
    expect(state.turns["turn-1"].state).toBe("interrupted");
    expect(state.turns["turn-1"].metadata).toMatchObject({ provider: "fixture", model: "model", modelLayer: "parent-fallback", effectiveTools: ["read"] });
    expect(state.jobs["job-1"].state).toBe("failed");
    expect(state.agents.Queued.state).toBe("parked");
    expect(state.jobs["job-2"].state).toBe("unexecuted");
    expect(resumed.reconciled).toEqual(expect.arrayContaining([
      { type: "interrupted", agentId: "Running", id: "turn-1" },
      { type: "unexecuted", agentId: "Queued", id: "job-2" },
    ]));

    const resumedAgain = await resumeCoordinator(layout, "parent-1", journalOptions());
    expect(resumedAgain.reconciled).toEqual([]);
    expect(resumedAgain.journal.getState().lastSequence).toBe(state.lastSequence);

    await resumedAgain.journal.append({ kind: "agent.created", agentId: "Graceful", payload: { record: agent("Graceful", "queued", { jobId: "job-3" }) } });
    await resumedAgain.journal.append({ kind: "job.created", agentId: "Graceful", jobId: "job-3", payload: { record: job("job-3", "Graceful") } });
    expect(await reconcileUnfinishedCoordinator(resumedAgain.journal, "graceful-shutdown")).toContainEqual({
      type: "unexecuted",
      agentId: "Graceful",
      id: "job-3",
    });
    expect(resumedAgain.journal.getState().agents.Graceful.state).toBe("parked");
    expect(resumedAgain.journal.getState().jobs["job-3"].error).toBe("graceful-shutdown:no-auto-replay");
  });

  it("parks on the default TTL, disables only timers at non-positive TTL, revives exact parked refs, and tears down", async () => {
    class FakeScheduler implements TimerScheduler {
      callbacks: Array<{ callback: () => void; delay: number; cleared: boolean }> = [];
      setTimeout(callback: () => void, delay: number) {
        const entry = { callback, delay, cleared: false };
        this.callbacks.push(entry);
        return entry;
      }
      clearTimeout(handle: unknown) {
        (handle as { cleared: boolean }).cleared = true;
      }
    }
    const scheduler = new FakeScheduler();
    let disposed = 0;
    let resolveParked!: () => void;
    const parked = new Promise<void>((resolvePromise) => { resolveParked = resolvePromise; });
    const registry = new IdleLifecycleRegistry(undefined, scheduler);
    registry.trackIdle("Worker", { dispose: () => { disposed += 1; } }, () => resolveParked());
    expect(scheduler.callbacks[0]?.delay).toBe(420_000);
    expect(registry.hasTimer("Worker")).toBe(true);
    scheduler.callbacks[0]!.callback();
    await parked;
    expect(disposed).toBe(1);
    expect(registry.hasTimer("Worker")).toBe(false);

    const noTimer = new IdleLifecycleRegistry(0, scheduler);
    let teardownParked = false;
    noTimer.trackIdle("Idle", { dispose: () => { disposed += 1; } }, () => { teardownParked = true; });
    expect(noTimer.hasTimer("Idle")).toBe(false);
    await noTimer.teardown();
    expect(teardownParked).toBe(true);
    expect(disposed).toBe(2);

    const parkedAgent = { ...agent("Parked", "parked"), sessionPath: join(layout.agentsDir, "exact.jsonl") };
    expect(await noTimer.revive(parkedAgent, async (path) => `opened:${path}`)).toBe(`opened:${parkedAgent.sessionPath}`);
    await expect(noTimer.revive(agent("Dead", "aborted"), async () => "never")).rejects.toThrow(/cannot revive/);
  });
});
