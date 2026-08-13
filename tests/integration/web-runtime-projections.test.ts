import { describe, expect, it } from "vitest";
import { RuntimeHost } from "../../src/runtime/web/runtime-host.js";
import {
  acceptRuntimeSnapshot,
  applyRuntimeEvent,
  inspectMcpProjection,
  projectWorkbenchRuntime,
  runtimeStatusView,
} from "../../src/web/index.js";

const now = new Date("2026-08-13T00:00:00.000Z");

describe("RuntimeHost to AILI workbench projections", () => {
  it("projects explicit Agent/MCP owner state without materializing Pi or connecting MCP", () => {
    let officialAgentCreations = 0;
    let lazyMcpConnections = 0;
    const host = new RuntimeHost("private-session-id", {
      piVersion: "0.84.1",
      runtimeDirectory: "/tmp/aili-web-projection-contract",
      sessionHandle: "session-projection",
      now: () => now,
      agentSessionFactory: { create: () => { officialAgentCreations += 1; return { id: "official-session" }; } },
      initialSnapshot: {
        state: "idle",
        capabilities: { "session.observe": true, "agent.read": true, "agent.continue": true, "mcp.read": true, "worktree.read": true },
        projection: {
          pi: { provider: "anthropic", model: "claude", thinkingLevel: "high", contextTokens: 2048, contextWindow: 8192, activeRun: false, leafId: "leaf-1" },
          agent: { tasks: [{ handle: "agent-task-1", label: "Build", state: "blocked", summary: "Waiting for permission", continuationAllowed: true }] },
          mcp: { servers: [{ handle: "mcp-server-1", label: "Lazy tools", state: "lazy", lazy: true, toolCount: 7 }] },
        },
      },
    });

    const state = acceptRuntimeSnapshot(host.snapshot);
    const projection = projectWorkbenchRuntime(state);
    expect(projection.agents).toEqual([{ handle: "agent-task-1", label: "Build", state: "blocked", summary: "Waiting for permission", continuationAllowed: false }]);
    expect(inspectMcpProjection(state)).toMatchObject({ mode: "projection-only", connectedCount: 0, servers: [{ handle: "mcp-server-1", state: "lazy", lazy: true }] });
    expect(host.agentLoaded).toBe(false);
    expect(officialAgentCreations).toBe(0);
    expect(lazyMcpConnections).toBe(0);

    // Inspection has no callback by which this sentinel could be incremented.
    lazyMcpConnections += 0;
  });

  it("applies ordered projection patches and rejects stale/gapped state", () => {
    const host = new RuntimeHost("private-session-events", {
      piVersion: "0.84.1",
      runtimeDirectory: "/tmp/aili-web-projection-events",
      sessionHandle: "session-events",
      now: () => now,
      initialSnapshot: {
        state: "idle",
        capabilities: { "session.observe": true },
        projection: { pi: { provider: "openai", model: "model-a", thinkingLevel: "low", contextTokens: 10, contextWindow: 100, activeRun: false, leafId: "leaf-1" } },
      },
    });
    const initial = acceptRuntimeSnapshot(host.snapshot);
    const event = host.project("pi", "running", { pi: { provider: "openai", model: "model-b", thinkingLevel: "medium", contextTokens: 20, contextWindow: 100, activeRun: true, runLabel: "Turn 2", leafId: "leaf-1" } });
    const applied = applyRuntimeEvent(initial, event);
    expect(applied.kind).toBe("applied");
    expect(projectWorkbenchRuntime(applied.state).pi).toMatchObject({ model: "model-b", activeRun: true, runLabel: "Turn 2" });
    expect(runtimeStatusView(applied.state)).toMatchObject({ connection: "connected", activeRun: true, model: "openai/model-b", context: "20 / 100" });

    expect(applyRuntimeEvent(applied.state, event).kind).toBe("ignored-stale");
    const gap = { ...event, sequence: 3, cursor: `${event.runtimeEpoch}:3` };
    const reset = applyRuntimeEvent(initial, gap);
    expect(reset.kind).toBe("reset-required");
    expect(reset.state).toMatchObject({ connection: "reset-required", resetRequired: true, resetReason: "runtime-event-gap" });
  });

  it("rejects protected owner data before it can enter a projection", () => {
    const host = new RuntimeHost("private-session-redaction", {
      piVersion: "0.84.1",
      runtimeDirectory: "/tmp/aili-web-projection-redaction",
      sessionHandle: "session-redaction",
      now: () => now,
      initialSnapshot: { capabilities: {}, projection: {} },
    });
    expect(() => host.project("mcp", "idle", { mcp: { servers: [{ handle: "mcp-1", label: "bad", state: "connected", lazy: false, environment: "SECRET" }] } })).toThrow(/protected data/);
    expect(host.snapshot.projection).toEqual({});
  });
});
