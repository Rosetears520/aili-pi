import { describe, expect, it } from "vitest";
import { InteractionBroker } from "../../src/runtime/persistent-agents/interaction-broker.js";

describe("InteractionBroker", () => {
  it("owns pending interaction lifecycle and scoped suspension", async () => {
    const broker = new InteractionBroker();
    let release!: (answer: "allow" | "deny") => void;
    const rendered = new Promise<"allow" | "deny">((resolve) => { release = resolve; });
    const pending = broker.request({ kind: "permission", agentId: "a", jobId: "j", request: { tool: "bash" }, render: async () => rendered, fallback: "deny" as const });
    expect(broker.pendingRecords("j")).toHaveLength(1);
    expect(broker.pendingRecords("other")).toHaveLength(0);
    const id = broker.pendingRecords("j")[0]!.id;
    expect(broker.answer(id, "allow")).toBe(true);
    await expect(pending).resolves.toBe("allow");
    expect(broker.pendingRecords()).toHaveLength(0);
  });

  it("keeps generic questions answerable and never reuses a settled answer", async () => {
    const broker = new InteractionBroker();
    const pending = broker.request({
      kind: "question",
      agentId: "worker",
      jobId: "job",
      request: { question: "Which fixture?" },
      render: async () => new Promise<string>(() => undefined),
      fallback: "deny",
    });
    const id = broker.pendingRecords("job")[0]!.id;
    expect(broker.answer(id, "fixture-a")).toBe(true);
    await expect(pending).resolves.toBe("fixture-a");
    expect(broker.answer(id, "fixture-b")).toBe(false);
    expect(broker.pendingRecords()).toEqual([]);
  });

  it("fails closed on cancellation expiry and shutdown", async () => {
    const broker = new InteractionBroker();
    await expect(broker.request({ kind: "question", agentId: "a", jobId: "j", request: {}, render: async () => new Promise<string>(() => {}), timeoutMs: 5, fallback: "expired" })).resolves.toBe("expired");
    const controller = new AbortController(); controller.abort();
    await expect(broker.request({ kind: "permission", agentId: "a", jobId: "j", request: {}, render: async () => "allow", signal: controller.signal, fallback: "deny" })).resolves.toBe("deny");
    broker.shutdown();
    await expect(broker.request({ kind: "permission", agentId: "a", jobId: "j", request: {}, render: async () => "allow", fallback: "deny" })).resolves.toBe("deny");
  });
});
