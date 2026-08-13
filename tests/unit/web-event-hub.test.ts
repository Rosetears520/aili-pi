import { describe, expect, it } from "vitest";
import { RuntimeEventHub } from "../../src/runtime/web/event-hub.js";
import { validateSnapshot, type RuntimeSnapshotV1 } from "../../src/runtime/web/contracts.js";

function currentSnapshot(hub: RuntimeEventHub): RuntimeSnapshotV1 {
  return validateSnapshot({
    schemaVersion: 1,
    type: "RuntimeSnapshotV1",
    runtimeEpoch: hub.runtimeEpoch,
    sessionHandle: hub.sessionHandle,
    lastSequence: hub.latestSequence,
    cursor: hub.latestCursor,
    createdAt: "2026-08-13T00:00:00.000Z",
    state: "idle",
    writer: { state: "unowned", activeTurn: false },
    capabilities: { "session.read": true },
    projection: { status: "ready" },
  });
}

describe("runtime event replay hub", () => {
  it("publishes ordered metadata-bound events and incrementally replays by cursor", () => {
    const hub = new RuntimeEventHub("session-public-1", {
      runtimeEpoch: "epoch-1",
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    });
    const first = hub.publish("runtime", "state", { state: "running" }, { runId: "run-1" });
    const second = hub.publish("runtime", "mutation", { status: "completed" }, {
      runId: "run-1",
      leaseGeneration: "lease-1",
      requestId: "request-1",
      capability: "prompt.submit",
    });

    expect(first).toMatchObject({ sequence: 1, cursor: "epoch-1:1", runtimeEpoch: "epoch-1", sessionHandle: "session-public-1" });
    expect(second).toMatchObject({
      sequence: 2,
      cursor: "epoch-1:2",
      leaseGeneration: "lease-1",
      requestId: "request-1",
      capability: "prompt.submit",
    });
    expect(hub.replay(first.cursor)).toEqual({ kind: "events", events: [second], latestCursor: second.cursor });
    expect(hub.replay(second.cursor)).toEqual({ kind: "events", events: [], latestCursor: second.cursor });
  });

  it("requires snapshot reset for an old epoch, evicted gap, or future cursor", () => {
    const hub = new RuntimeEventHub("session-public-1", { runtimeEpoch: "epoch-1", historyLimit: 2 });
    hub.publish("runtime", "message", { index: 1 });
    hub.publish("runtime", "message", { index: 2 });
    hub.publish("runtime", "message", { index: 3 });

    expect(hub.earliestSequence).toBe(2);
    expect(hub.replay("epoch-old:2")).toEqual({
      kind: "reset",
      reason: "epoch",
      snapshotRequired: true,
      latestCursor: "epoch-1:3",
    });
    expect(hub.replay("epoch-1:0")).toMatchObject({ kind: "reset", reason: "gap", snapshotRequired: true });
    expect(hub.replay("epoch-1:4")).toMatchObject({ kind: "reset", reason: "gap", snapshotRequired: true });
    expect(hub.replay("not-a-cursor")).toMatchObject({ kind: "reset", reason: "epoch", snapshotRequired: true });
    expect(hub.replay("epoch-1:1")).toMatchObject({ kind: "events", events: [{ sequence: 2 }, { sequence: 3 }] });
  });

  it("delivers a current snapshot before only the later requested replay", () => {
    const hub = new RuntimeEventHub("session-public-1", { runtimeEpoch: "epoch-1" });
    const first = hub.publish("runtime", "message", { index: 1 });
    hub.publish("runtime", "message", { index: 2 });
    const snapshot = currentSnapshot(hub);

    expect(hub.snapshotFirst(snapshot)).toEqual({
      snapshot,
      replay: { kind: "events", events: [], latestCursor: "epoch-1:2" },
    });
    expect(hub.snapshotFirst(snapshot, first.cursor).replay).toMatchObject({
      kind: "events",
      events: [{ sequence: 2 }],
      latestCursor: "epoch-1:2",
    });
    expect(() => hub.snapshotFirst({ ...snapshot, lastSequence: 1, cursor: "epoch-1:1" })).toThrow(/not current/);
  });

  it("turns subscriber queue overflow into one reset and resumes after the accepted snapshot boundary", () => {
    const ids = ["one"];
    const hub = new RuntimeEventHub("session-public-1", {
      runtimeEpoch: "epoch-1",
      subscriberQueueLimit: 2,
      idFactory: () => ids.shift() ?? "unexpected",
    });
    const subscription = hub.subscribe(hub.latestCursor);
    hub.publish("runtime", "message", { index: 1 });
    hub.publish("runtime", "message", { index: 2 });
    hub.publish("runtime", "message", { index: 3 });

    expect(subscription.id).toBe("sub-one");
    expect(subscription.drain()).toEqual({
      kind: "reset",
      reason: "backpressure",
      snapshotRequired: true,
      latestCursor: "epoch-1:3",
    });

    const fourth = hub.publish("runtime", "message", { index: 4 });
    expect(subscription.drain()).toEqual({ kind: "events", events: [fourth], latestCursor: "epoch-1:4" });
    expect(subscription.drain()).toEqual({ kind: "events", events: [], latestCursor: "epoch-1:4" });
  });

  it("bounds subscription lifecycle and resets all reads after closure", () => {
    const hub = new RuntimeEventHub("session-public-1", { runtimeEpoch: "epoch-1", idFactory: () => "one" });
    const subscription = hub.subscribe();
    expect(hub.subscriberCount).toBe(1);
    subscription.close();
    expect(hub.subscriberCount).toBe(0);
    expect(subscription.drain()).toMatchObject({ kind: "reset", reason: "closed", snapshotRequired: true });

    hub.close();
    expect(hub.replay()).toMatchObject({ kind: "reset", reason: "closed", snapshotRequired: true });
    expect(() => hub.publish("runtime", "message", {})).toThrow(/closed/);
  });
});
