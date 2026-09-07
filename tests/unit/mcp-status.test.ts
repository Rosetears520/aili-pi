import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MCP_STATUS_EVENT, MCP_STATUS_SNAPSHOT_VERSION } from "pi-mcp-adapter";
import { describe, expect, it } from "vitest";
import { subscribeMcpStatus } from "../../src/runtime/mcp.js";

function eventBus() {
  const handlers = new Map<string, (value: unknown) => void>();
  return {
    handlers,
    api: {
      events: {
        emit(channel: string, value: unknown) { handlers.get(channel)?.(value); },
        on(channel: string, handler: (value: unknown) => void) {
          handlers.set(channel, handler);
          return () => handlers.delete(channel);
        },
      },
    } as Pick<ExtensionAPI, "events">,
  };
}

describe("lazy MCP status store", () => {
  it("consumes machine-readable adapter snapshots without a transport operation", () => {
    const bus = eventBus();
    const status = subscribeMcpStatus(bus.api);
    expect(status.snapshot()).toMatchObject({ servers: [], connectedCount: 0 });

    bus.api.events.emit(MCP_STATUS_EVENT, {
      version: MCP_STATUS_SNAPSHOT_VERSION,
      servers: [
        { name: "configured", status: "not-connected", listenState: "disconnected", toolCount: 0, disabled: false },
        { name: "cached", status: "cached", listenState: "not-listening", toolCount: 2, disabled: false },
        { name: "connected", status: "connected", listenState: "active", catalogStale: false, toolCount: 1, disabled: false, upstreamExtra: "private" },
        { name: "failed", status: "failed", listenState: "dropped", toolCount: 0, failedAgoSeconds: 4, disabled: false },
        { name: "auth", status: "needs-auth", listenState: "re-establishing", toolCount: 0, disabled: false },
        { name: "disabled", status: "disabled", listenState: "legacy", toolCount: 0, disabled: true },
      ],
      totalTools: 3,
      totalResources: 0,
      connectedCount: 1,
      disabledCount: 1,
    });
    expect(status.snapshot().servers.map((server) => server.status)).toEqual([
      "not-connected", "cached", "connected", "failed", "needs-auth", "disabled",
    ]);
    expect(status.snapshot().servers[2]).not.toHaveProperty("upstreamExtra");
    status.dispose();
    expect(bus.handlers.has(MCP_STATUS_EVENT)).toBe(false);
  });

  it("ignores malformed snapshots instead of promoting false success", () => {
    const bus = eventBus();
    const status = subscribeMcpStatus(bus.api);
    bus.api.events.emit(MCP_STATUS_EVENT, { version: 1, servers: [{ name: "bad", status: "healthy" }] });
    expect(status.snapshot()).toMatchObject({ servers: [], totalTools: 0 });

    bus.api.events.emit(MCP_STATUS_EVENT, {
      version: MCP_STATUS_SNAPSHOT_VERSION,
      servers: [{ name: "missing-listen-state", status: "connected", toolCount: 1, disabled: false }],
      totalTools: 1, totalResources: 0, connectedCount: 1, disabledCount: 0,
    });
    bus.api.events.emit(MCP_STATUS_EVENT, {
      version: MCP_STATUS_SNAPSHOT_VERSION,
      servers: [{ name: "bad-catalog", status: "connected", listenState: "active", catalogStale: "yes", toolCount: 1, disabled: false }],
      totalTools: 1, totalResources: 0, connectedCount: 1, disabledCount: 0,
    });
    expect(status.snapshot()).toMatchObject({ servers: [], totalTools: 0 });
  });
});
