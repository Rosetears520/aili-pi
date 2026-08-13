import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WebAccessLifecycle, WEB_SESSION_COOKIE, validateWebListenPolicy } from "../../src/runtime/web/access-policy.js";
import { PrivateWebBff } from "../../src/runtime/web/bff-gateway.js";
import type { MutationEnvelopeV1 } from "../../src/runtime/web/contracts.js";
import { OFFICIAL_PI_VERSION, RuntimeHost, RuntimeHostRegistry } from "../../src/runtime/web/runtime-host.js";

async function withRuntimeDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "aili-runtime-host-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function browserCookie(setCookie: string): { cookie: string; clientId: string } {
  const cookie = setCookie.split(";", 1)[0]!;
  const [name, clientId] = cookie.split("=");
  expect(name).toBe(WEB_SESSION_COOKIE);
  return { cookie, clientId: clientId! };
}

function admittedLifecycle(clientId: string): WebAccessLifecycle {
  return {
    authorize: () => ({ ok: true, sessionId: clientId, authMode: "session" }),
    authorizeRequest: () => ({ ok: true, sessionId: clientId, authMode: "session" }),
  } as unknown as WebAccessLifecycle;
}

describe("RuntimeHost and private browser BFF", () => {
  it("exposes only an opaque snapshot, snapshot-first replay, and ordered lifecycle events", async () => {
    await withRuntimeDirectory(async (runtimeDirectory) => {
      const host = new RuntimeHost("internal-jsonl-identity", {
        piVersion: OFFICIAL_PI_VERSION,
        runtimeDirectory,
        sessionHandle: "session-public-1",
        now: () => new Date("2026-08-13T00:00:00.000Z"),
        initialSnapshot: {
          capabilities: { "session.read": true },
          projection: { status: "ready" },
        },
      });
      await host.initialize();

      const initial = host.snapshot;
      expect(initial).toMatchObject({
        runtimeEpoch: host.runtimeEpoch,
        sessionHandle: "session-public-1",
        lastSequence: 0,
        state: "idle",
        writer: { state: "unowned", activeTurn: false },
      });
      expect(JSON.stringify(initial)).not.toContain("internal-jsonl-identity");
      expect(host.agentLoaded).toBe(false);
      expect(host.connect()).toEqual({
        snapshot: initial,
        replay: { kind: "events", events: [], latestCursor: initial.cursor },
      });

      const event = host.publish("agent", "message", { status: "streaming" }, "run-1");
      expect(event).toMatchObject({
        runtimeEpoch: host.runtimeEpoch,
        sessionHandle: host.sessionHandle,
        sequence: 1,
        runId: "run-1",
        eventType: "message",
        source: "agent",
      });
      expect(host.snapshot).toMatchObject({ lastSequence: 1, cursor: event.cursor });
      expect(host.connect(initial.cursor).replay).toEqual({ kind: "events", events: [event], latestCursor: event.cursor });

      await host.dispose();
      expect(host.snapshot).toMatchObject({ state: "closed", lastSequence: 2 });
      expect(host.replay()).toMatchObject({ kind: "reset", reason: "closed", snapshotRequired: true });
      expect(() => host.publish("agent", "message", {})).toThrow(/closed/);
    });
  });

  it("routes an authenticated browser mutation through one host admission, lease generation, and lazy AgentSession", async () => {
    await withRuntimeDirectory(async (runtimeDirectory) => {
      const now = new Date("2026-08-13T00:00:00.000Z");
      let factoryCalls = 0;
      let executionCalls = 0;
      const registry = new RuntimeHostRegistry<{ id: string }>();
      const host = registry.create("internal-jsonl-identity", {
        piVersion: OFFICIAL_PI_VERSION,
        runtimeDirectory,
        sessionHandle: "session-public-1",
        now: () => now,
        initialSnapshot: { capabilities: { "prompt.submit": true } },
        agentSessionFactory: {
          create: (identity) => {
            factoryCalls += 1;
            expect(identity).toBe("internal-jsonl-identity");
            return { id: "official-agent-1" };
          },
        },
        lease: {
          idFactory: () => "web-1",
          processIdentity: { pid: 501, startFingerprint: "start-501" },
          livenessEndpointId: "endpoint-web-1",
        },
      });
      await host.initialize();
      expect(registry.get("session-public-1")).toBe(host);
      expect(registry.getPrivate("internal-jsonl-identity")).toBe(host);
      expect(host.agentLoaded).toBe(false);

      const writer = await host.acquireWriter("web");
      expect(writer).toMatchObject({ acquired: true, lease: { generation: "generation-web-1", owner: "web" } });
      if (!writer.acquired) throw new Error("fixture writer lease was not acquired");
      expect(host.snapshot.writer).toMatchObject({ state: "owned", owner: "web", generation: writer.lease.generation, activeTurn: false });

      const policy = validateWebListenPolicy({ hostname: "127.0.0.1", port: 30141 });
      const lifecycle = new WebAccessLifecycle(policy, undefined, () => now);
      const site = { host: policy.expectedHost, origin: policy.expectedOrigin };
      const bff = new PrivateWebBff(lifecycle, registry);
      const bootstrapResponse = bff.consumeBootstrap(lifecycle.createBootstrap(), site);
      expect(bootstrapResponse).toMatchObject({
        status: 303,
        body: { redirect: "/" },
        headers: { Location: "/", "Cache-Control": "private, no-store, max-age=0" },
      });
      const { cookie } = browserCookie(bootstrapResponse.headers["Set-Cookie"]!);
      const clientId = "client-browser-1";
      const mutationBff = new PrivateWebBff(admittedLifecycle(clientId), registry, {
        admitMutation: () => ({
          rootAuthorized: true,
          permissionGranted: true,
          capabilityAllowed: true,
          currentSessionLeaf: "leaf-1",
          revalidate: () => true,
        }),
      });
      const request = { ...site, cookie: "fixture-browser-cookie", contentType: "application/json", contentLength: 256 };
      const envelope: MutationEnvelopeV1 = {
        schemaVersion: 1,
        type: "MutationEnvelopeV1",
        requestId: "request-1",
        clientId,
        runtimeEpoch: host.runtimeEpoch,
        leaseGeneration: writer.lease.generation,
        sessionHandle: host.sessionHandle,
        sessionLeaf: "leaf-1",
        requestedAt: now.toISOString(),
        capability: "prompt.submit",
        commandType: "prompt.submit",
        arguments: { text: "hello" },
      };

      expect(bff.snapshot({ ...site, cookie }, host.sessionHandle)).toMatchObject({
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Security-Policy": expect.stringContaining("default-src 'self'"),
        },
      });
      expect(bff.connect({ ...site, cookie }, host.sessionHandle).body).toMatchObject({ snapshot: { sessionHandle: host.sessionHandle } });

      const execute = (session: { id: string }, admitted: MutationEnvelopeV1) => {
        executionCalls += 1;
        expect(session.id).toBe("official-agent-1");
        expect(admitted.requestId).toBe("request-1");
      };
      const completed = await mutationBff.mutate(request, envelope, execute);
      expect(completed).toMatchObject({
        status: 200,
        body: { disposition: "completed", reason: "mutation-completed", sequence: 3 },
      });
      expect(factoryCalls).toBe(1);
      expect(executionCalls).toBe(1);
      expect(host.agentLoaded).toBe(true);
      expect(host.snapshot).toMatchObject({ lastSequence: 4, writer: { generation: writer.lease.generation, activeTurn: false } });

      const duplicate = await mutationBff.mutate(request, envelope, execute);
      expect(duplicate).toEqual(completed);
      expect(factoryCalls).toBe(1);
      expect(executionCalls).toBe(1);

      await registry.disposeAll();
      expect(registry.get(host.sessionHandle)).toBeUndefined();
    });
  });

  it("rejects browser identity mismatch, invalid envelopes, size overflow, and missing mutation policy before host execution", async () => {
    await withRuntimeDirectory(async (runtimeDirectory) => {
      const now = new Date("2026-08-13T00:00:00.000Z");
      const host = new RuntimeHost("internal-identity", {
        piVersion: OFFICIAL_PI_VERSION,
        runtimeDirectory,
        sessionHandle: "session-public-1",
        now: () => now,
      });
      const lifecycle = new WebAccessLifecycle(validateWebListenPolicy({ hostname: "127.0.0.1", port: 30141 }), undefined, () => now);
      const site = { host: "127.0.0.1:30141", origin: "http://127.0.0.1:30141" };
      const bff = new PrivateWebBff(lifecycle, { get: () => host });
      const exchanged = lifecycle.consumeBootstrap(lifecycle.createBootstrap(), site)!;
      const { cookie } = browserCookie(exchanged.setCookie);
      const base = {
        schemaVersion: 1,
        type: "MutationEnvelopeV1",
        requestId: "request-1",
        clientId: "client-safe-1",
        runtimeEpoch: host.runtimeEpoch,
        leaseGeneration: "generation-1",
        sessionHandle: host.sessionHandle,
        sessionLeaf: "leaf-1",
        requestedAt: now.toISOString(),
        capability: "prompt.submit",
        commandType: "prompt.submit",
        arguments: {},
      } as const satisfies MutationEnvelopeV1;

      await expect(bff.mutate(
        { ...site, cookie, contentType: "application/json", contentLength: 128 },
        { ...base, clientId: "client-not-the-browser-session" },
        () => undefined,
      )).resolves.toMatchObject({ status: 401, body: { error: "client-identity-mismatch" } });
      await expect(bff.mutate({ ...site, cookie, contentType: "application/json", contentLength: 128 }, { ...base, requestId: "" }, () => undefined))
        .resolves.toMatchObject({ status: 400, body: { error: "invalid-mutation-envelope" } });
      await expect(bff.mutate({ ...site, cookie, contentType: "application/json", contentLength: 300_000 }, base, () => undefined))
        .resolves.toMatchObject({ status: 413, body: { error: "request-too-large" } });
      await expect(bff.mutate({ ...site, cookie, contentType: "text/plain", contentLength: 128 }, base, () => undefined))
        .resolves.toMatchObject({ status: 401, body: { error: "json-content-type-required" } });
      const policyless = new PrivateWebBff(admittedLifecycle("client-safe-1"), { get: () => host });
      await expect(policyless.mutate({ ...site, contentType: "application/json", contentLength: 128 }, base, () => undefined))
        .resolves.toMatchObject({ status: 401, body: { error: "mutation-policy-unavailable" } });
    });
  });
});
