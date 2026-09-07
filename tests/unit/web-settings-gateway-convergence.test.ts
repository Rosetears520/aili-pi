import { describe, expect, it } from "vitest";
import { GatewayClient, type FetchResponseLike } from "../../src/web/gateway-client.js";
import type { RuntimeSnapshotV1 } from "../../src/web/contracts.js";

const snapshot: RuntimeSnapshotV1 = {
  schemaVersion: 1,
  type: "RuntimeSnapshotV1",
  runtimeEpoch: "epoch-settings",
  sessionHandle: "session-settings",
  lastSequence: 0,
  cursor: "epoch-settings:0",
  createdAt: "2026-01-01T00:00:00.000Z",
  state: "idle",
  writer: { state: "owned", owner: "web", generation: "generation-settings", activeTurn: false },
  capabilities: {
    "mcp.configure": true,
    "keybinds.configure": true,
    "project_trust.configure": true,
  },
  projection: {},
};

function response(status: number, body: unknown): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("Web settings Gateway convergence", () => {
  it.each([
    ["mcp.configure", "set_disabled", { cwd: "/workspace", name: "docs", disabled: true }],
    ["mcp.configure", "set_lifecycle", { cwd: "/workspace", name: "docs", lifecycle: "lazy-keep-alive" }],
    ["keybinds.configure", "replace", { bindings: { "mode.cycle": ["alt+m"] } }],
    ["project_trust.configure", "trust", { cwd: "/workspace" }],
  ] as const)("sends %s only through the configuration RuntimeHost", async (capability, commandType, args) => {
    const requests: Array<{ url: string; init?: { body?: string } }> = [];
    const client = new GatewayClient({
      requestId: () => `request-${commandType}`,
      now: () => new Date("2026-01-01T00:00:01.000Z"),
      fetch: async (url, init) => {
        requests.push({ url, init });
        if (url.endsWith("/auth/session")) return response(200, { clientId: "client-settings" });
        if (url.endsWith("/configuration")) return response(200, snapshot);
        return response(200, { disposition: "completed", reason: "completed", sequence: 1, result: { ok: true } });
      },
    });

    await expect(client.configure(capability, commandType, args)).resolves.toMatchObject({ disposition: "completed" });
    expect(requests.map((item) => item.url)).toEqual([
      "/api/runtime/v1/auth/session",
      "/api/runtime/v1/configuration",
      "/api/runtime/v1/mutations",
    ]);
    const envelope = JSON.parse(requests[2]!.init!.body!) as Record<string, unknown>;
    expect(envelope).toMatchObject({
      capability,
      commandType,
      arguments: args,
      sessionHandle: "session-settings",
      sessionLeaf: "configuration",
    });
  });
});
