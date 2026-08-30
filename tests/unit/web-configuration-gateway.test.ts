import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WebAccessLifecycle, WEB_SESSION_COOKIE, validateWebListenPolicy } from "../../src/runtime/web/access-policy.js";
import { PrivateWebBff } from "../../src/runtime/web/bff-gateway.js";
import type { JsonValue, MutationEnvelopeV1 } from "../../src/runtime/web/contracts.js";
import { OFFICIAL_PI_VERSION, RuntimeHost, RuntimeHostRegistry } from "../../src/runtime/web/runtime-host.js";

const NOW = new Date("2026-08-30T12:00:00.000Z");
const CAPABILITIES = {
  "models.configure": true,
  "plugins.configure": true,
  "skills.configure": true,
} as const;

async function temporaryRuntime(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "aili-web-configuration-"));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function admittedLifecycle(clientId: string): WebAccessLifecycle {
  return {
    authorizeRequest: () => ({ ok: true, sessionId: clientId, authMode: "session" }),
    authorizeLoopbackRead: () => ({ ok: true, sessionId: clientId, authMode: "session" }),
  } as unknown as WebAccessLifecycle;
}

function envelope(host: Pick<RuntimeHost<object>, "runtimeEpoch" | "sessionHandle">, generation: string, overrides: Partial<MutationEnvelopeV1> = {}): MutationEnvelopeV1 {
  return {
    schemaVersion: 1,
    type: "MutationEnvelopeV1",
    requestId: "configuration-request-1",
    clientId: "configuration-client-1",
    runtimeEpoch: host.runtimeEpoch,
    leaseGeneration: generation,
    sessionHandle: host.sessionHandle,
    sessionLeaf: "configuration",
    requestedAt: NOW.toISOString(),
    capability: "models.configure",
    commandType: "replace",
    arguments: { config: { providers: {} } },
    ...overrides,
  };
}

function admitted(revalidate: () => true | string | Promise<true | string> = () => true) {
  return {
    rootAuthorized: true,
    permissionGranted: true,
    capabilityAllowed: true,
    currentSessionLeaf: "configuration",
    revalidate,
  };
}

describe("configuration RuntimeHost gateway", () => {
  it("dispatches the model/plugin/skill command matrix to the exact service callback with bounded results", async () => {
    await temporaryRuntime(async (runtimeDirectory) => {
      const calls: Array<{ capability: string; commandType: string; arguments: Readonly<Record<string, JsonValue>> }> = [];
      let serviceCreations = 0;
      let disposals = 0;
      const service = { dispose: async () => { disposals += 1; } };
      const registry = new RuntimeHostRegistry<typeof service>();
      const host = registry.create("configuration-service", {
        piVersion: OFFICIAL_PI_VERSION,
        runtimeDirectory,
        sessionHandle: "configuration-public",
        now: () => NOW,
        initialSnapshot: { capabilities: CAPABILITIES, projection: { service: "configuration" } },
        agentSessionFactory: { create: async () => { serviceCreations += 1; return service; } },
        lease: {
          idFactory: () => "configuration-lease",
          processIdentity: { pid: 7001, startFingerprint: "configuration-process" },
          livenessEndpointId: "configuration-endpoint",
        },
      });
      await host.initialize();
      const writer = await host.acquireWriter("web");
      if (!writer.acquired) throw new Error("fixture lease unavailable");
      const bff = new PrivateWebBff(admittedLifecycle("configuration-client-1"), registry, {
        admitMutation: () => admitted(),
      });
      const request = { contentType: "application/json", contentLength: 512 };
      const commands = [
        ["models.configure", "replace", { config: { providers: {} } }],
        ["plugins.configure", "plugin_action", { action: "enable", source: "npm:fixture", scope: "global", cwd: "/fixture" }],
        ["skills.configure", "toggle_model_invocation", { filePath: "/fixture/SKILL.md", disableModelInvocation: true }],
        ["skills.configure", "install", { package: "fixture/skill", scope: "project", cwd: "/fixture" }],
        ["skills.configure", "update", { package: "fixture/skill", scope: "project", cwd: "/fixture" }],
      ] as const;
      for (const [index, [capability, commandType, args]] of commands.entries()) {
        const response = await bff.mutate(request, envelope(host, writer.lease.generation, {
          requestId: `configuration-request-${index + 1}`,
          capability,
          commandType,
          arguments: args,
        }), (_service, mutation) => {
          calls.push({ capability: mutation.capability, commandType: mutation.commandType, arguments: mutation.arguments });
          return { result: { success: true, operation: mutation.commandType.slice(0, 64) } };
        });
        expect(response).toMatchObject({ status: 200, body: { disposition: "completed", reason: "mutation-completed", result: { success: true, operation: commandType } } });
        expect(JSON.stringify(response.body).length).toBeLessThan(1024);
      }
      expect(calls).toEqual(commands.map(([capability, commandType, arguments_]) => ({ capability, commandType, arguments: arguments_ })));
      expect(serviceCreations).toBe(1);
      expect(host.snapshot.projection).toEqual({ service: "configuration" });

      await registry.disposeAll();
      expect(disposals).toBe(1);
      expect(registry.get(host.sessionHandle)).toBeUndefined();
      expect(host.snapshot.state).toBe("closed");
    });
  });

  it("denies transport and admission failures before service creation or execution", async () => {
    await temporaryRuntime(async (runtimeDirectory) => {
      let factoryCalls = 0;
      let executionCalls = 0;
      const host = new RuntimeHost<object>("configuration-service", {
        piVersion: OFFICIAL_PI_VERSION,
        runtimeDirectory,
        sessionHandle: "configuration-public",
        now: () => NOW,
        mutationFreshnessMs: 60_000,
        initialSnapshot: { capabilities: CAPABILITIES },
        agentSessionFactory: { create: async () => { factoryCalls += 1; return {}; } },
        lease: { idFactory: () => "configuration-lease", processIdentity: { pid: 7002, startFingerprint: "configuration-process" }, livenessEndpointId: "configuration-endpoint" },
      });
      await host.initialize();
      const writer = await host.acquireWriter("web");
      if (!writer.acquired) throw new Error("fixture lease unavailable");
      const execute = () => { executionCalls += 1; };
      const policy = validateWebListenPolicy({ hostname: "127.0.0.1", port: 30141 });
      const lifecycle = new WebAccessLifecycle(policy, undefined, () => NOW);
      const site = { host: policy.expectedHost, origin: policy.expectedOrigin };
      const exchange = lifecycle.consumeBootstrap(lifecycle.createBootstrap(), site)!;
      const cookie = exchange.setCookie.split(";", 1)[0]!;
      expect(cookie.startsWith(`${WEB_SESSION_COOKIE}=`)).toBe(true);
      const browserClient = cookie.slice(cookie.indexOf("=") + 1);
      const gateway = new PrivateWebBff(lifecycle, { get: () => host }, { admitMutation: () => admitted() });
      const valid = envelope(host, writer.lease.generation, { clientId: browserClient });

      await expect(gateway.mutate({ ...site, contentType: "application/json", contentLength: 100 }, valid, execute))
        .resolves.toMatchObject({ status: 401 });
      await expect(gateway.mutate({ ...site, origin: "http://evil.invalid", cookie, contentType: "application/json", contentLength: 100 }, valid, execute))
        .resolves.toMatchObject({ status: 401 });
      await expect(gateway.mutate({ ...site, cookie, contentType: "text/plain", contentLength: 100 }, valid, execute))
        .resolves.toMatchObject({ status: 401, body: { error: "json-content-type-required" } });
      await expect(gateway.mutate({ ...site, cookie, contentType: "application/json", contentLength: 300_000 }, valid, execute))
        .resolves.toMatchObject({ status: 413 });
      await expect(gateway.mutate({ ...site, cookie, contentType: "application/json", contentLength: 100 }, { ...valid, requestId: "" }, execute))
        .resolves.toMatchObject({ status: 400, body: { error: "invalid-mutation-envelope" } });
      await expect(gateway.mutate({ ...site, cookie, contentType: "application/json", contentLength: 100 }, { ...valid, clientId: "wrong-client" }, execute))
        .resolves.toMatchObject({ status: 401, body: { error: "client-identity-mismatch" } });

      const directCases: Array<[string, MutationEnvelopeV1, ReturnType<typeof admitted>]> = [
        ["wrong-capability", envelope(host, writer.lease.generation, { requestId: "deny-capability", capability: "plugins.configure" }), { ...admitted(), capabilityAllowed: false }],
        ["stale-request", envelope(host, writer.lease.generation, { requestId: "deny-stale", requestedAt: "2026-08-30T11:00:00.000Z" }), admitted()],
        ["stale-generation", envelope(host, "generation-stale", { requestId: "deny-generation" }), admitted()],
        ["failed-revalidation", envelope(host, writer.lease.generation, { requestId: "deny-revalidation" }), admitted(() => "project-trust-revalidation-failed")],
      ];
      for (const [, mutation, context] of directCases) {
        const result = await host.mutate("web", mutation, {
          ...context,
          authenticatedClientId: mutation.clientId,
          channelAuthenticated: true,
          browserPolicyValidated: true,
        }, execute);
        expect(["rejected", "failed"]).toContain(result.disposition.disposition);
      }
      expect(factoryCalls).toBe(0);
      expect(executionCalls).toBe(0);
      expect(host.agentLoaded).toBe(false);
      await host.dispose();
    });
  });

  it("reuses duplicate dispositions, rejects request-id collisions, and executes once", async () => {
    await temporaryRuntime(async (runtimeDirectory) => {
      let calls = 0;
      const host = new RuntimeHost<object>("configuration-service", {
        piVersion: OFFICIAL_PI_VERSION,
        runtimeDirectory,
        sessionHandle: "configuration-public",
        now: () => NOW,
        initialSnapshot: { capabilities: CAPABILITIES },
        agentSessionFactory: { create: async () => ({}) },
        lease: { idFactory: () => "configuration-lease", processIdentity: { pid: 7003, startFingerprint: "configuration-process" }, livenessEndpointId: "configuration-endpoint" },
      });
      await host.initialize();
      const writer = await host.acquireWriter("web");
      if (!writer.acquired) throw new Error("fixture lease unavailable");
      const base = envelope(host, writer.lease.generation);
      const context = { ...admitted(), authenticatedClientId: base.clientId, channelAuthenticated: true, browserPolicyValidated: true };
      const first = await host.mutate("web", base, context, () => { calls += 1; return { result: { success: true } }; });
      const duplicate = await host.mutate("web", base, context, () => { throw new Error("duplicate executed"); });
      const collision = await host.mutate("web", { ...base, arguments: { config: { changed: true } } }, context, () => { throw new Error("collision executed"); });
      expect(duplicate).toMatchObject({ disposition: first.disposition, result: first.result });
      expect(duplicate.event).toBeUndefined();
      expect(collision.disposition).toMatchObject({ disposition: "rejected", reason: "request-id-collision" });
      expect(calls).toBe(1);
      await host.dispose();
    });
  });

  it("keeps project mutations behind allowed-root/trust revalidation and UI/retained routes translation-only", async () => {
    const [service, facade, models, pluginsRoute, skillInstall, modelsUi, pluginsUi, skillsUi, composition] = await Promise.all([
      readFile("src/web/server/configuration-service.ts", "utf8"),
      readFile("src/web/server/configuration-route-facade.ts", "utf8"),
      readFile("src/web/app/api/models-config/route.ts", "utf8"),
      readFile("src/web/app/api/plugins/route.ts", "utf8"),
      readFile("src/web/app/api/skills/install/route.ts", "utf8"),
      readFile("src/web/components/ModelsConfig.tsx", "utf8"),
      readFile("src/web/components/PluginsConfig.tsx", "utf8"),
      readFile("src/web/components/SkillsConfig.tsx", "utf8"),
      readFile("src/web/server/foreground-composition.ts", "utf8"),
    ]);
    expect(service).toMatch(/scope === "project"[\s\S]{0,500}assertAllowedCwd\(cwd\)[\s\S]{0,500}getProjectTrustStatus/);
    expect(service).toMatch(/mutatePlugin[\s\S]*assertAllowedCwd\(cwd\)[\s\S]*scope === "project" && !trust\.trusted/);
    expect(service).toMatch(/updateSkill[\s\S]*assertAllowedCwd\(cwd\)/);
    expect(composition).toContain("Deliberately a service object: configuration never creates an AgentSession.");
    expect(composition).toContain("composition.configurationService as unknown as ForegroundAgentSession");

    expect(facade).toContain("bridge.dispatch");
    for (const route of [models, pluginsRoute, skillInstall]) expect(route).toContain("translateConfigurationRoute");
    expect(models).not.toContain("writeModelsConfig");
    expect(skillInstall).not.toMatch(/runNpx|DefaultPackageManager|writeFile/);
    for (const component of [modelsUi, pluginsUi, skillsUi]) {
      expect(component).toContain("getGatewayClient");
      expect(component).toContain(".configure(");
      expect(component).not.toMatch(/writeModelsConfig|runNpx|DefaultPackageManager|SettingsManager|writePrivateFile/);
    }
  });
});
