import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RuntimeEventHub } from "../../runtime/web/event-hub.js";
import { validateWebListenPolicy, WebAccessLifecycle } from "../../runtime/web/access-policy.js";
import { PrivateWebBff } from "../../runtime/web/bff-gateway.js";
import { LazyOfficialAgentSession } from "../../runtime/web/lazy-agent-session.js";
import type { MutationEnvelopeV1 } from "../../runtime/web/contracts.js";
import { FOREGROUND_PI_COMMANDS, dispatchOfficialPiMutation } from "./foreground-composition.js";

describe("foreground Runtime composition seams", () => {
  it("keeps launcher readiness conjunctive and installs the bridge from Next instrumentation", async () => {
    const [launcher, instrumentation, composition] = await Promise.all([
      readFile("bin/pi-web.js", "utf8"),
      readFile("src/web/instrumentation.ts", "utf8"),
      readFile("src/web/server/foreground-composition.ts", "utf8"),
    ]);
    expect(launcher).toContain('stdio: ["inherit", "pipe", "inherit", "pipe", "pipe", "pipe"]');
    expect(launcher).toContain("!listenerReady || !runtimeReady");
    expect(launcher).not.toMatch(/process\.argv[^\n]*(?:bootstrap|token|identity)/i);
    expect(instrumentation).toContain("installAiliWebBffBridge");
    expect(instrumentation).toContain("readOneUseIdentity(3)");
    expect(instrumentation).toContain("writeSync(4");
    expect(instrumentation).toContain('"/proc/self/fd/5"');
    expect(instrumentation).toContain('status: "runtime-ready"');
    expect(launcher).toContain('runtimeControl.on("end", () => requestStop');
    expect(instrumentation).toContain("target[REGISTER_SYMBOL] ??=");
    expect(instrumentation).toContain("await composition.dispose()");
    expect(composition).not.toContain("connectProjectionObserver");
    expect(composition).not.toContain("attachObserver");
    expect(composition).not.toContain("tui-projection-unavailable");
    expect(composition).toContain("session-owned-outside-web-runtime");
  });

  it("exchanges an internal one-use loopback bootstrap into an HttpOnly same-site session", () => {
    const lifecycle = new WebAccessLifecycle(validateWebListenPolicy({ hostname: "127.0.0.1", port: 30141 }));
    const bff = new PrivateWebBff(lifecycle, { get: () => undefined });
    bff.armLoopbackBootstrap();
    const site = { host: "127.0.0.1:30141", origin: "http://127.0.0.1:30141" };
    expect(bff.exchangeLoopbackBootstrap({ ...site, origin: "http://other.test" })).toMatchObject({ status: 401 });
    bff.armLoopbackBootstrap();
    const exchanged = bff.exchangeLoopbackBootstrap(site);
    expect(exchanged).toMatchObject({ status: 200, body: { authenticated: true } });
    expect(exchanged.headers["Set-Cookie"]).toContain("HttpOnly");
    expect(exchanged.headers["Set-Cookie"]).toContain("SameSite=Strict");
    expect(JSON.stringify(exchanged.body)).not.toMatch(/[A-Za-z0-9_-]{43}/);
    expect(bff.exchangeLoopbackBootstrap(site)).toMatchObject({ status: 401, body: { error: "bootstrap-unavailable" } });
    bff.dispose();
    lifecycle.dispose();
  });

  it("dispatches every advertised official Pi command and denies unsupported pairs", async () => {
    const calls: string[] = [];
    const session = {
      send: async (command: Record<string, unknown>) => {
        calls.push(String(command.type));
        return command.type === "auto_name" ? { title: "Generated session title" } : undefined;
      },
      isRunning: () => false,
    } as never;
    const args: Readonly<Record<string, MutationEnvelopeV1["arguments"]>> = {
      send: { message: "send" }, follow_up: { message: "later" }, steer: { message: "now" },
      compact: {}, set_auto_compaction: { enabled: true }, abort: {}, abort_compaction: {},
      bash: { command: "pwd" }, abort_bash: {}, clear_queue: {}, set_tools: { toolNames: ["read"] },
      select_thinking: { thinkingLevel: "high" }, select_model: { provider: "provider", modelId: "model" },
      branch: { targetId: "entry-1" }, fork: { entryId: "entry-1" }, reload: {}, rename: { name: "renamed" }, auto_name: {},
      safe_delete: {}, set_perm_mode: { mode: "build" }, set_auto_retry: { enabled: true },
      respond: { command: { type: "extension_ui_response", id: "ui-1", value: true } },
      input: { command: { type: "extension_ui_input", id: "ui-1", data: "answer" } },
    };
    for (const [capability, commands] of Object.entries(FOREGROUND_PI_COMMANDS)) {
      for (const commandType of commands) await dispatchOfficialPiMutation(session, envelope(capability, commandType, args[commandType]!));
    }
    expect(calls).toEqual([
      "prompt", "follow_up", "steer", "compact", "set_auto_compaction", "abort", "abort_compaction",
      "bash", "abort_bash", "clear_queue", "set_tools", "set_thinking_level", "set_model", "navigate_tree",
      "fork", "reload", "set_session_name", "auto_name", "safe_delete", "set_perm_mode", "set_auto_retry",
      "extension_ui_response", "extension_ui_input",
    ]);
    await expect(dispatchOfficialPiMutation(session, envelope("analytics.read", "query", {}))).rejects.toThrow(/unsupported-runtime-command/);
    await expect(dispatchOfficialPiMutation(session, envelope("pi.send", "unlisted", { message: "no" }))).rejects.toThrow(/unsupported-runtime-command/);
  });

  it("awaits asynchronous official runtime cleanup deterministically", async () => {
    let release!: () => void;
    let cleaned = false;
    const session = new LazyOfficialAgentSession({
      sessionId: "private-session",
      compatible: () => true,
      factory: { create: () => ({ dispose: () => new Promise<void>((resolve) => { release = () => { cleaned = true; resolve(); }; }) }) },
    });
    await session.get();
    const disposing = session.dispose();
    expect(cleaned).toBe(false);
    release();
    await disposing;
    expect(cleaned).toBe(true);
  });

  it("wakes push subscribers without polling and preserves bounded backpressure reset", async () => {
    const hub = new RuntimeEventHub("session-push", { runtimeEpoch: "epoch-push", historyLimit: 4, subscriberQueueLimit: 1, idFactory: () => "fixture" });
    const subscription = hub.subscribe(hub.latestCursor);
    const wake = subscription.wait();
    hub.publish("fixture", "state", { state: "running" });
    await wake;
    expect(subscription.drain()).toMatchObject({ kind: "events", events: [{ source: "fixture", sequence: 1 }] });
    hub.publish("fixture", "state", { state: "idle" });
    hub.publish("fixture", "state", { state: "running" });
    expect(subscription.drain()).toMatchObject({ kind: "reset", reason: "backpressure", snapshotRequired: true });
    subscription.close();
  });
});

function envelope(capability: string, commandType: string, argumentsValue: MutationEnvelopeV1["arguments"]): MutationEnvelopeV1 {
  return {
    schemaVersion: 1, type: "MutationEnvelopeV1", requestId: "request-1", clientId: "client-1",
    runtimeEpoch: "epoch-1", leaseGeneration: "generation-1", sessionHandle: "session-1",
    sessionLeaf: "leaf-1", requestedAt: "2026-08-13T00:00:00.000Z", capability, commandType,
    arguments: argumentsValue,
  };
}
