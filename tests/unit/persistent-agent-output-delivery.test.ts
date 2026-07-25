import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentOutputPath,
  AsyncDeliveryService,
  BUILTIN_PARENT_DELETE_GAP,
  confirmedDeleteParentAndSidecar,
  initializeEmptyForkSidecar,
  inspectParentSidecar,
  parseAgentReference,
  persistFullAgentOutput,
  readAgentHistory,
  readAgentOutput,
  scanDeliveryIdsFromParentEntries,
  type ParentResultMessage,
} from "../../src/runtime/persistent-agents/output-delivery.js";
import { CoordinatorJournal, ensureSidecarLayout } from "../../src/runtime/persistent-agents/storage.js";
import type { AgentRecord, SidecarLayout } from "../../src/runtime/persistent-agents/types.js";
import type { NormalizedTaskSettlement } from "../../src/runtime/persistent-agents/task-coordinator.js";

let scratch = "";
let parentFile = "";
let layout: SidecarLayout;
let journal: CoordinatorJournal;
let counter = 0;

function options() {
  return {
    eventId: () => `event-${++counter}`,
    clock: () => new Date(Date.UTC(2026, 6, 25, 3, 0, counter)),
  };
}

async function createPersistedAgent(agentId = "Worker"): Promise<AgentRecord> {
  const now = "2026-07-25T03:00:00.000Z";
  const record: AgentRecord = {
    id: agentId,
    name: agentId,
    selector: "general",
    state: "queued",
    createdAt: now,
    updatedAt: now,
  };
  await journal.append({ kind: "agent.created", agentId, payload: { record } });
  const child = SessionManager.create(scratch, layout.agentsDir, { id: agentId, parentSession: parentFile });
  child.appendCustomMessageEntry("fixture.context", "child custom state", false, { turn: 1 });
  child.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "full child response" }],
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
  const sessionPath = child.getSessionFile()!;
  await journal.append({ kind: "agent.session", agentId, payload: { path: sessionPath } });
  return journal.getState().agents[agentId];
}

function settlement(agentId = "Worker", overrides: Partial<NormalizedTaskSettlement> = {}): NormalizedTaskSettlement {
  return {
    status: "completed",
    agentId,
    jobId: "job-1",
    turnId: "turn-1",
    selector: "general",
    async: true,
    effectiveMode: "async",
    effectiveModeReason: "default-async",
    output: "bounded",
    outputRef: `agent://${agentId}`,
    historyRef: `history://${agentId}`,
    truncation: {
      truncated: false,
      originalBytes: 7,
      returnedBytes: 7,
      originalLines: 1,
      returnedLines: 1,
      limits: { bytes: 500_000, lines: 5_000 },
    },
    lifecycle: { agent: "idle", job: "completed", turn: "completed" },
    model: {},
    profile: { profileHash: "profile", sourceHash: "source", version: 2 },
    workspace: { requested: "shared", writeScope: { paths: [], resources: [] } },
    deliveryRequired: true,
    limits: { maxRuntimeMs: 0, softRequestBudget: 0 },
    ...overrides,
  };
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-output-"));
  parentFile = join(scratch, "parent.jsonl");
  await writeFile(parentFile, "fixture parent\n");
  layout = await ensureSidecarLayout(parentFile);
  counter = 0;
  journal = (await CoordinatorJournal.open(layout, "parent-1", options())).journal;
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("durable Agent output and exactly-once parent delivery", () => {
  it("persists full raw output and child JSONL before one bounded parent result message", async () => {
    await createPersistedAgent();
    const entries: unknown[] = [];
    const sent: ParentResultMessage[] = [];
    const fullOutput = `prefix-${"x".repeat(6_000)}-tail`;
    const parent = {
      scanDeliveryIds: async () => scanDeliveryIdsFromParentEntries(entries),
      send: async (message: ParentResultMessage) => {
        expect(await readFile(agentOutputPath(layout, "Worker"), "utf8")).toBe(fullOutput);
        expect(journal.getState().deliveries[message.details.deliveryId]?.status).toBe("pending");
        sent.push(message);
        entries.push({ type: "custom_message", ...message });
        return "sent" as const;
      },
    };
    const service = new AsyncDeliveryService(layout, journal, parent);
    const [firstCompletion, duplicateCompletion] = await Promise.all([
      service.complete(settlement(), fullOutput),
      service.complete(settlement(), "different retry bytes"),
    ]);
    expect(firstCompletion).toMatchObject({ status: "delivered", deliveryId: "delivery-job-1" });
    expect(duplicateCompletion).toMatchObject({ status: "delivered", deduplicated: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.details).toMatchObject({
      deliveryId: "delivery-job-1",
      outputRef: "agent://Worker",
      historyRef: "history://Worker",
      previewTruncated: true,
    });
    expect(sent[0]?.content).toContain("preview truncated to 5000 characters");
    expect(sent[0]?.content).toContain("-tail");
    expect(journal.getState().deliveries["delivery-job-1"].status).toBe("delivered");
    expect(await readFile(agentOutputPath(layout, "Worker"), "utf8")).toBe(fullOutput);
    expect(sent).toHaveLength(1);
  });

  it("recovers a crash after parent append before journal ack without duplicate injection", async () => {
    await createPersistedAgent();
    const entries: unknown[] = [];
    let sends = 0;
    const crashing = new AsyncDeliveryService(layout, journal, {
      scanDeliveryIds: async () => scanDeliveryIdsFromParentEntries(entries),
      send: async (message) => {
        sends += 1;
        entries.push({ type: "custom_message", ...message });
        throw new Error("crash after parent append before ack");
      },
    });
    expect(await crashing.complete(settlement(), "complete raw output")).toMatchObject({ status: "pending" });
    expect(journal.getState().deliveries["delivery-job-1"].status).toBe("pending");

    await journal.flush();
    const reopened = (await CoordinatorJournal.open(layout, "parent-1", options())).journal;
    const sendAgain = vi.fn(async () => "sent" as const);
    const recovered = new AsyncDeliveryService(layout, reopened, {
      scanDeliveryIds: async () => scanDeliveryIdsFromParentEntries(entries),
      send: sendAgain,
    });
    expect(await recovered.recoverPending()).toEqual([{ deliveryId: "delivery-job-1", status: "delivered", deduplicated: true }]);
    expect(sendAgain).not.toHaveBeenCalled();
    expect(sends).toBe(1);
    expect(reopened.getState().deliveries["delivery-job-1"].status).toBe("delivered");
  });

  it("keeps parent-unavailable completion pending and never creates delivery for sync results", async () => {
    await createPersistedAgent();
    const service = new AsyncDeliveryService(layout, journal, {
      scanDeliveryIds: async () => new Set(),
      send: async () => "unavailable",
    });
    expect(await service.complete(settlement(), "raw")).toMatchObject({ status: "pending" });
    const sync = settlement("Worker", { async: false, effectiveMode: "sync", deliveryRequired: false, effectiveModeReason: "requested-sync" });
    expect(await service.complete(sync, "sync raw")).toEqual({ status: "skipped-sync" });
    expect(Object.keys(journal.getState().deliveries)).toEqual(["delivery-job-1"]);
  });

  it("refuses pending delivery when the registered child JSONL is missing", async () => {
    const now = "2026-07-25T03:00:00.000Z";
    await journal.append({
      kind: "agent.created",
      agentId: "Missing",
      payload: { record: { id: "Missing", name: "Missing", selector: "general", state: "queued", createdAt: now, updatedAt: now } },
    });
    await journal.append({ kind: "agent.session", agentId: "Missing", payload: { path: join(layout.agentsDir, "missing.jsonl") } });
    const service = new AsyncDeliveryService(layout, journal, { scanDeliveryIds: async () => new Set(), send: async () => "sent" });
    await expect(service.complete(settlement("Missing"), "raw")).rejects.toThrow(/ENOENT|real file/);
    expect(journal.getState().deliveries).toEqual({});
  });
});

describe("output/history references and parent-owned retention", () => {
  it("resolves bounded output/history from disk after Agent release", async () => {
    await createPersistedAgent();
    await expect(persistFullAgentOutput(layout, "Worker", `api_${"key"}=secret-value`)).rejects.toThrow(/credential\/auth\/private-key/);
    await expect(access(agentOutputPath(layout, "Worker"))).rejects.toThrow();
    await persistFullAgentOutput(layout, "Worker", "line-1\nline-2\nline-3");
    expect(parseAgentReference("agent://Worker")).toEqual({ kind: "output", agentId: "Worker" });
    expect(parseAgentReference("history://Worker")).toEqual({ kind: "history", agentId: "Worker" });
    expect(() => parseAgentReference("agent://../escape")).toThrow();

    expect(await readAgentOutput(layout, journal, "Worker", 1, 1)).toMatchObject({
      content: "line-2",
      total: 3,
      returned: 1,
      truncated: true,
    });
    const history = await readAgentHistory(layout, journal, "Worker", 0, 20);
    expect(history.content).toContain("[custom:fixture.context] child custom state");
    expect(history.content).toContain("[assistant] full child response");

    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "queued", to: "running" } });
    await journal.append({ kind: "agent.state", agentId: "Worker", payload: { from: "running", to: "idle" } });
    await journal.append({ kind: "agent.released", agentId: "Worker", payload: { reason: "fixture release" } });
    expect(journal.getState().releasedAgents.Worker.sessionPath).toBeTruthy();
    expect((await readAgentOutput(layout, journal, "Worker")).content).toContain("line-3");
    expect((await readAgentHistory(layout, journal, "Worker")).content).toContain("full child response");
  });

  it("initializes forks empty, preserves orphan sidecars, and requires exact confirmed parent cascade", async () => {
    await createPersistedAgent("Original");
    const originalRoot = layout.root;
    const forkParent = join(scratch, "fork.jsonl");
    await writeFile(forkParent, "fork parent\n");
    const fork = await initializeEmptyForkSidecar(forkParent, "fork-parent");
    expect(fork.diagnostic).toContain("no child artifacts copied");
    expect((await CoordinatorJournal.open(fork.layout, "fork-parent", options())).journal.getState().agents).toEqual({});
    expect(await readFile(journal.getState().agents.Original.sessionPath!, "utf8")).toContain("full child response");

    await rm(forkParent);
    expect(await inspectParentSidecar(forkParent)).toMatchObject({
      status: "orphaned",
      diagnostic: expect.stringContaining(BUILTIN_PARENT_DELETE_GAP),
    });
    await access(fork.layout.root);

    await expect(confirmedDeleteParentAndSidecar({ parentSessionPath: parentFile, parentId: "parent-1", confirmation: "yes" })).rejects.toThrow(/exact parent deletion confirmation/);
    expect(await confirmedDeleteParentAndSidecar({ parentSessionPath: parentFile, parentId: "parent-1", confirmation: "DELETE parent-1" })).toEqual({
      deletedParent: true,
      deletedSidecar: true,
    });
    await expect(access(originalRoot)).rejects.toThrow();
    await expect(access(parentFile)).rejects.toThrow();
  });
});
