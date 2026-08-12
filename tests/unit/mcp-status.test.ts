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
        { name: "configured", status: "not-connected", toolCount: 0, disabled: false },
        { name: "cached", status: "cached", toolCount: 2, disabled: false },
        { name: "connected", status: "connected", toolCount: 1, disabled: false },
        { name: "failed", status: "failed", toolCount: 0, failedAgoSeconds: 4, disabled: false },
        { name: "auth", status: "needs-auth", toolCount: 0, disabled: false },
        { name: "disabled", status: "disabled", toolCount: 0, disabled: true },
      ],
      totalTools: 3,
      totalResources: 0,
      connectedCount: 1,
      disabledCount: 1,
    });
    expect(status.snapshot().servers.map((server) => server.status)).toEqual([
      "not-connected", "cached", "connected", "failed", "needs-auth", "disabled",
    ]);
    status.dispose();
    expect(bus.handlers.has(MCP_STATUS_EVENT)).toBe(false);
  });

  it("ignores malformed snapshots instead of promoting false success", () => {
    const bus = eventBus();
    const status = subscribeMcpStatus(bus.api);
    bus.api.events.emit(MCP_STATUS_EVENT, { version: 1, servers: [{ name: "bad", status: "healthy" }] });
    expect(status.snapshot()).toMatchObject({ servers: [], totalTools: 0 });
  });
});
