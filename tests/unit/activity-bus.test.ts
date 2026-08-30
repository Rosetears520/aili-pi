import { describe, expect, it } from "vitest";
import { ActivityBus } from "../../src/runtime/persistent-agents/activity-bus.js";

describe("ActivityBus", () => {
  it("emits one backend-neutral vocabulary with monotonic sequence", () => {
    let now = new Date("2026-08-28T00:00:00.000Z");
    const bus = new ActivityBus("parent", () => now);
    bus.subscribe(() => { throw new Error("display failed"); });
    const first = bus.publish({ kind: "turn.started", source: "auxiliary", agentId: "a", jobId: "j", turnId: "t", backend: "managed", driver: "pi-sdk" });
    now = new Date("2026-08-28T00:00:01.000Z");
    const second = bus.publish({ kind: "turn.completed", source: "precise", agentId: "a", jobId: "j", turnId: "t", backend: "managed", driver: "pi-sdk" });
    expect([first.seq, second.seq]).toEqual([1, 2]);
    const precise = bus.publish({ kind: "tool.completed", source: "precise", sourceSequence: 7, agentId: "a", runId: "run-1", backend: "herdr", driver: "pi-cli" });
    expect(bus.publish({ kind: "tool.completed", source: "precise", sourceSequence: 7, agentId: "a", runId: "run-1", backend: "herdr", driver: "pi-cli" })).toBe(precise);
    expect(bus.list()).toHaveLength(3);
    expect(second).toMatchObject({ parentId: "parent", backend: "managed", driver: "pi-sdk", source: "precise" });
  });

  it("computes stall/recovery as an overlay without lifecycle mutation", () => {
    let now = new Date("2026-08-28T00:00:00.000Z");
    const bus = new ActivityBus("parent", () => now);
    bus.publish({ kind: "turn.started", source: "auxiliary", agentId: "a", backend: "herdr", driver: "pi-cli" });
    now = new Date("2026-08-28T00:01:00.000Z");
    expect(bus.overlay("a", 30_000).state).toBe("stalled");
    bus.publish({ kind: "tool.completed", source: "precise", agentId: "a", backend: "herdr", driver: "pi-cli" });
    expect(bus.overlay("a", 30_000).state).toBe("active");
    bus.publish({ kind: "ui.prompt.started", source: "precise", agentId: "a", backend: "herdr", driver: "pi-cli" });
    expect(bus.overlay("a", 30_000).workState).toBe("waiting-for-user");
    bus.publish({ kind: "ui.prompt.ended", source: "precise", agentId: "a", backend: "herdr", driver: "pi-cli" });
    expect(bus.overlay("a", 30_000).workState).toBe("working");
    bus.publish({ kind: "turn.completed", source: "precise", agentId: "a", backend: "herdr", driver: "pi-cli" });
    expect(bus.overlay("a", 30_000).state).toBe("idle");
  });
});
