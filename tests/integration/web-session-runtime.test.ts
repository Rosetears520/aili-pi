import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateWebListenPolicy, WebAccessLifecycle } from "../../src/runtime/web/access-policy.js";
import { PrivateWebBff } from "../../src/runtime/web/bff-gateway.js";
import { RuntimeHost, RuntimeHostRegistry } from "../../src/runtime/web/runtime-host.js";
import { GatewayClient, type FetchResponseLike, type WorkbenchFetch } from "../../src/web/gateway-client.js";
import { PrivateWebBffBridge } from "../../src/web/server/private-bff-bridge.js";

const cleanup: string[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

function response(status: number, body: unknown): FetchResponseLike { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

describe("Pi Web workbench through PrivateWebBff and RuntimeHost", () => {
  it("executes Queue Next and Steer once with distinct gateway commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aili-web-session-runtime-")); cleanup.push(directory);
    const clock = new Date("2026-08-13T00:00:00.000Z");
    let officialAgentCreations = 0;
    const executed: string[] = [];
    const registry = new RuntimeHostRegistry<{ id: string }>();
    const host = registry.create("private-pi-session", {
      piVersion: "0.84.2",
      runtimeDirectory: directory,
      sessionHandle: "session-browser",
      now: () => clock,
      agentSessionFactory: { create: () => { officialAgentCreations += 1; return { id: "official-pi-session" }; } },
      initialSnapshot: {
        state: "running",
        capabilities: { "pi.follow_up": true, "pi.steer": true, "session.observe": true },
        projection: { pi: { provider: "provider", model: "model", thinkingLevel: "high", contextTokens: 1, contextWindow: 10, activeRun: true, leafId: "leaf-1" } },
      },
    });
    await host.initialize();
    const acquired = await host.acquireWriter("web");
    expect(acquired.acquired).toBe(true);

    const policy = validateWebListenPolicy({ hostname: "127.0.0.1", port: 30141, expectedHost: "127.0.0.1:30141", expectedOrigin: "http://127.0.0.1:30141", allowedRoots: [] });
    const lifecycle = new WebAccessLifecycle(policy, undefined, () => clock);
    const bootstrap = lifecycle.createBootstrap();
    const browser = lifecycle.consumeBootstrap(bootstrap, { host: policy.expectedHost, origin: policy.expectedOrigin });
    expect(browser).toBeDefined();
    const cookie = browser!.setCookie.split(";", 1)[0]!;
    const bff = new PrivateWebBff(lifecycle, registry, {
      admitMutation: () => ({
        rootAuthorized: true,
        permissionGranted: true,
        capabilityAllowed: true,
        currentSessionLeaf: "leaf-1",
        revalidate: () => true,
      }),
    });

    const bridge = new PrivateWebBffBridge(bff, {
      catalog: () => ({ status: 200, headers: {}, body: {
        schemaVersion: 1,
        clientId: browser!.sessionId,
        projects: [], models: [], commands: [], skills: [], plugins: [], files: [], worktrees: [], locales: ["en"],
      } }),
      execute: async (_session, admitted) => { executed.push(admitted.commandType); },
    });
    const fetcher: WorkbenchFetch = async (url, init) => {
      const parsed = new URL(url, policy.expectedOrigin);
      const body = init?.body;
      const result = await bridge.dispatch({
        method: init?.method === "POST" ? "POST" : "GET",
        segments: parsed.pathname.replace(/^\/api\/runtime\/v1\/?/, "").split("/").filter(Boolean),
        host: policy.expectedHost,
        origin: policy.expectedOrigin,
        cookie,
        cursor: parsed.searchParams.get("cursor") ?? undefined,
        contentType: init?.headers?.["Content-Type"],
        contentLength: body === undefined ? undefined : new TextEncoder().encode(body).byteLength,
        body: body === undefined ? undefined : JSON.parse(body),
      });
      return response(result.status, result.body);
    };

    let request = 0;
    const client = new GatewayClient({ fetch: fetcher, now: () => clock, requestId: () => `request-${++request}` });
    await client.catalog();
    const connected = await client.connect("session-browser");
    expect(host.agentLoaded).toBe(false);
    expect(officialAgentCreations).toBe(0);

    const queued = await client.mutate("queue-next", connected.snapshot, "leaf-1", { message: "after this turn" });
    expect(queued.disposition).toBe("completed");
    const steered = await client.mutate("steer", host.snapshot, "leaf-1", { message: "change direction now" });
    expect(steered.disposition).toBe("completed");
    expect(executed).toEqual(["follow_up", "steer"]);
    expect(officialAgentCreations).toBe(1);

    // Request IDs are distinct and no browser direct-RPC route was touched.
    expect(request).toBe(2);
    await registry.disposeAll();
    lifecycle.dispose();
  });

  it("rejects an observer mutation before official Pi materialization", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aili-web-observer-runtime-")); cleanup.push(directory);
    const clock = new Date("2026-08-13T00:00:00.000Z");
    let officialAgentCreations = 0;
    const registry = new RuntimeHostRegistry<{ id: string }>();
    const host = registry.create("private-observed-session", {
      piVersion: "0.84.2", runtimeDirectory: directory, sessionHandle: "session-observer", now: () => clock,
      agentSessionFactory: { create: () => { officialAgentCreations += 1; return { id: "unexpected" }; } },
      initialSnapshot: { state: "running", capabilities: { "pi.steer": true }, projection: { pi: { activeRun: true, leafId: "leaf-1" } } },
    });
    await host.initialize();
    await host.acquireWriter("tui");
    const clientSnapshot = host.snapshot;
    expect(clientSnapshot.writer.owner).toBe("tui");
    expect(host.agentLoaded).toBe(false);
    expect(officialAgentCreations).toBe(0);
    // GatewayClient/createMutationEnvelope fails before a request can be sent.
    let mutationRequests = 0;
    const client = new GatewayClient({ fetch: async (url) => {
      if (url === "/api/runtime/v1/workbench/catalog") return response(200, { schemaVersion: 1, clientId: "observer-client", projects: [], models: [], commands: [], skills: [], plugins: [], files: [], worktrees: [], locales: ["en"] });
      mutationRequests += 1;
      return response(500, {});
    } });
    await client.catalog();
    await expect(client.mutate("steer", clientSnapshot, "leaf-1", { message: "not allowed" })).rejects.toThrow(/does not own/);
    expect(mutationRequests).toBe(0);
    expect(host.agentLoaded).toBe(false);
    await registry.disposeAll();
  });
});
