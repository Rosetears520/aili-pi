import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { loadStockDefaults } from "pi-permission-modes/src/config-load.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNoCredentialMaterial,
  brokeredChildPermission,
  ChildPermissionResolver,
  findCredentialMaterial,
  ParentApprovalBroker,
  redactCredentialText,
  type ApprovalRequestPacket,
} from "../../src/runtime/persistent-agents/permission.js";
import { createChildApprovalBridge } from "../../src/runtime/persistent-agents/session-factory.js";

let scratch = "";

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-permission-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("child pi-permission-modes policy adapter", () => {
  it("reuses mode resolution, project boundaries, custom surfaces, and fail-closed sandbox availability", async () => {
    const config = loadStockDefaults();
    const defaultResolver = new ChildPermissionResolver({ mode: config.modes.default, cwd: scratch, sandboxExecutorAvailable: false });
    expect(await defaultResolver.decide("read", { path: resolve(scratch, "file.ts") })).toMatchObject({ action: "allow", requiresSandbox: false });
    expect(await defaultResolver.decide("write", { path: resolve(scratch, "file.ts") })).toMatchObject({ action: "ask" });
    expect(await defaultResolver.decide("read", { path: "/outside/file.ts" })).toMatchObject({ action: "ask" });
    expect(await defaultResolver.decide("custom_tool", {})).toMatchObject({ action: "ask", target: "custom_tool" });
    expect(await defaultResolver.decide("bash", { command: "git status" })).toMatchObject({
      action: "deny",
      requiresSandbox: true,
      reason: expect.stringContaining("no audited child sandbox executor"),
    });

    const buildResolver = new ChildPermissionResolver({ mode: config.modes.build, cwd: scratch, sandboxExecutorAvailable: true });
    expect(await buildResolver.decide("bash", { command: "git status" })).toMatchObject({ action: "allow", requiresSandbox: true });
    const planResolver = new ChildPermissionResolver({ mode: config.modes.plan, cwd: scratch, sandboxExecutorAvailable: true });
    expect(await planResolver.decide("write", { path: resolve(scratch, "source.ts") })).toMatchObject({ action: "deny" });
    expect(await planResolver.decide("write", { path: resolve(scratch, "plan.md") })).toMatchObject({ action: "allow" });
  });

  it("hard-denies credentials before mode or approval regardless of YOLO policy", async () => {
    const config = loadStockDefaults();
    const resolver = new ChildPermissionResolver({ mode: config.modes.yolo, cwd: scratch, sandboxExecutorAvailable: false });
    expect(await resolver.decide("read", { path: "~/.ssh/id_ed25519" })).toMatchObject({ action: "deny", reason: expect.stringContaining("credential") });
    expect(await resolver.decide("custom_tool", { nested: { apiKey: "secret-value" } })).toMatchObject({ action: "deny", reason: expect.stringContaining("credential") });
    expect(await resolver.decide("bash", { command: "curl -H 'Authorization: Bearer abc123' example.test" })).toMatchObject({ action: "deny" });
    expect(await findCredentialMaterial({ payload: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----" }, scratch)).toMatchObject({ reason: "private-key material" });
    await expect(assertNoCredentialMaterial("token=secret", "artifact", scratch)).rejects.toThrow(/denied credential/);
    expect(redactCredentialText("token=secret Bearer abc")).toBe("token=<redacted> Bearer <redacted>");
  });
});

describe("parent approval broker", () => {
  it("denies without UI and requires a fresh prompt for every ask", async () => {
    const packets: ApprovalRequestPacket[] = [];
    const noUi = new ParentApprovalBroker({ hasUI: false, ask: async () => "allow" });
    expect(await noUi.request({ agentId: "A", jobId: "J", toolName: "write", summary: "write file", modeLabel: "Default" })).toBe("deny");

    const broker = new ParentApprovalBroker({
      hasUI: true,
      ask: async (packet) => {
        packets.push(packet);
        return "allow";
      },
    });
    const request = { agentId: "A", jobId: "J", toolName: "write", summary: "token=secret /project/file", modeLabel: "Default" };
    expect(await broker.request(request)).toBe("allow");
    expect(await broker.request(request)).toBe("allow");
    expect(packets).toHaveLength(2);
    expect(packets[0]?.requestId).not.toBe(packets[1]?.requestId);
    expect(packets[0]?.summary).toBe("token=<redacted> /project/file");
  });

  it("settles hanging asks on job abort, parent shutdown, prompt rejection, and bridge loss", async () => {
    const never = new Promise<"allow">(() => undefined);
    const broker = new ParentApprovalBroker({ hasUI: true, ask: async () => await never });
    const abortController = new AbortController();
    const aborted = broker.request({ agentId: "A", jobId: "job-abort", toolName: "write", summary: "write", modeLabel: "Default" }, abortController.signal);
    expect(broker.pendingCount("job-abort")).toBe(1);
    abortController.abort();
    expect(await aborted).toBe("deny");
    expect(broker.pendingCount()).toBe(0);

    const shutdown = broker.request({ agentId: "A", jobId: "job-shutdown", toolName: "bash", summary: "bash", modeLabel: "Default" });
    expect(broker.pendingCount()).toBe(1);
    broker.shutdown();
    expect(await shutdown).toBe("deny");
    expect(await broker.request({ agentId: "A", jobId: "later", toolName: "read", summary: "read", modeLabel: "Default" })).toBe("deny");

    const rejecting = new ParentApprovalBroker({ hasUI: true, ask: async () => { throw new Error("bridge lost"); } });
    expect(await rejecting.request({ agentId: "A", jobId: "J", toolName: "write", summary: "write", modeLabel: "Default" })).toBe("deny");
  });

  it("integrates per-call child decisions without treating parent task acceptance as blanket authority", async () => {
    const config = loadStockDefaults();
    const resolver = new ChildPermissionResolver({ mode: config.modes.default, cwd: scratch, sandboxExecutorAvailable: false });
    const prompts = vi.fn(async () => "allow" as const);
    const broker = new ParentApprovalBroker({ hasUI: true, ask: prompts });
    const callbacks = brokeredChildPermission(resolver, broker, { agentId: "Worker", jobId: "job-1" });
    let handler: ((event: { toolName: string; input: unknown }) => Promise<unknown>) | undefined;
    createChildApprovalBridge({
      agentId: "Worker",
      jobId: "job-1",
      cwd: scratch,
      decide: callbacks.decide,
      requestApproval: callbacks.requestApproval,
    })({
      on(event: string, callback: typeof handler) {
        if (event === "tool_call") handler = callback;
      },
    } as never);

    expect(await handler!({ toolName: "write", input: { path: resolve(scratch, "one.ts") } })).toBeUndefined();
    expect(await handler!({ toolName: "write", input: { path: resolve(scratch, "two.ts") } })).toBeUndefined();
    expect(prompts).toHaveBeenCalledTimes(2);
    expect(await handler!({ toolName: "custom", input: { password: "secret" } })).toMatchObject({ block: true, reason: expect.stringContaining("credential") });
    expect(prompts).toHaveBeenCalledTimes(2);
  });
});
