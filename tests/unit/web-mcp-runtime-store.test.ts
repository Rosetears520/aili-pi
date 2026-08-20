import { describe, expect, it } from "vitest";
import { publishMcpRuntimeSnapshot, readMcpRuntimeSnapshot } from "../../src/runtime/mcp-runtime-store.ts";

// Runtime snapshot store (webui-mcp-management tail): the AILI MCP extension
// pushes the adapter's McpStatusSnapshot; the web reads a validated, redacted
// view. Invalid data must never leak through.

describe("mcp runtime snapshot store", () => {
  it("round-trips a redacted snapshot", () => {
    publishMcpRuntimeSnapshot({
      version: 2,
      servers: [
        { name: "context7", status: "connected", toolCount: 7, resourceCount: 2, disabled: false, command: "npx", env: { TOKEN: "x" } },
        { name: "graphify", status: "failed", toolCount: 0, disabled: false, failedAgoSeconds: 12 },
        { name: "playwright", status: "disabled", toolCount: 0, disabled: true },
      ],
      totalTools: 7,
      totalResources: 2,
      connectedCount: 1,
      disabledCount: 1,
    });
    const snapshot = readMcpRuntimeSnapshot();
    expect(snapshot?.servers.map((server) => [server.name, server.status])).toEqual([
      ["context7", "connected"],
      ["graphify", "failed"],
      ["playwright", "disabled"],
    ]);
    expect(snapshot?.connectedCount).toBe(1);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("command");
    expect(serialized).not.toContain("TOKEN");
    expect(serialized).not.toContain("failedAgoSeconds");
  });

  it("drops malformed entries and rejects garbage wholesale", () => {
    publishMcpRuntimeSnapshot({ servers: [{ name: "../evil", status: "connected", toolCount: 1 }, { name: "ok", status: "weird-state", toolCount: 1 }, { name: 5 }] });
    expect(readMcpRuntimeSnapshot()?.servers).toEqual([]);
    publishMcpRuntimeSnapshot("nope");
    expect(readMcpRuntimeSnapshot()).toBeNull();
    publishMcpRuntimeSnapshot(null);
    expect(readMcpRuntimeSnapshot()).toBeNull();
  });
});
