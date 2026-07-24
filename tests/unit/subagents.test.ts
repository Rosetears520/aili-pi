import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import registerCredentialGuard, { bashMentionsCredentialPath, isProtectedChildPath } from "../../src/runtime/credential-guard.js";
import {
  normalizeSubagentCompatibility,
  protectSubagentParams,
  registerSubagent,
  wrapSubagentTool,
} from "../../src/runtime/subagents.js";

function extensions(value: unknown): string[] {
  return (value as { extensions?: string[] }).extensions ?? [];
}

type RenderableTool = {
  name: string;
  renderCall?: (args: unknown, theme: unknown) => { render(width: number): string[] };
};

const plainTheme = {
  fg: (_style: string, text: string) => text,
  bold: (text: string) => text,
};

async function captureSubagentTool(): Promise<RenderableTool> {
  let captured: RenderableTool | undefined;
  await registerSubagent({
    registerTool(tool: RenderableTool) { captured = tool; },
    registerCommand() {},
  } as never);
  if (!captured) throw new Error("subagent tool was not registered");
  return captured;
}

function renderCall(tool: RenderableTool, args: unknown, width = 240): string[] {
  if (!tool.renderCall) throw new Error("subagent tool has no renderCall");
  return tool.renderCall(args, plainTheme).render(width).map((line) =>
    stripVTControlCharacters(line).trimEnd(),
  );
}

describe("generic Pi-subagent wrapper", () => {
  it("retains the pinned upstream public schema and registers no legacy AILI tool", async () => {
    const tools: Array<{ name: string; parameters?: { properties?: Record<string, unknown> } }> = [];
    const commands: string[] = [];
    const pi = {
      registerTool(tool: { name: string; parameters?: { properties?: Record<string, unknown> } }) { tools.push(tool); },
      registerCommand(name: string) { commands.push(name); },
    } as never;
    await registerSubagent(pi);
    expect(tools.map((tool) => tool.name)).toEqual(["subagent"]);
    expect(commands).toContain("subagent");
    expect(tools.map((tool) => tool.name)).not.toContain("aili_task");
    expect(Object.keys(tools[0]!.parameters?.properties ?? {})).toEqual(expect.arrayContaining([
      "agent", "task", "roleContext", "tasks", "concurrency", "failFast", "cancelSiblingsOnFailure",
      "workspace", "worktree", "cwd", "sandbox", "async", "onComplete", "action", "runId",
      "attemptId", "taskId", "pollIntervalMs", "reason", "signal", "escalateAfterMs", "killAfterMs",
    ]));
  });

  it("injects the hard guard while preserving ambient permission policy and generic options", () => {
    const protectedSingle = protectSubagentParams({
      agent: "custom.agent",
      task: "inspect an external directory",
      cwd: "/tmp/external",
      worktree: true,
      sandbox: { allowedDomains: ["api.example.com"] },
      extensions: ["/opt/custom-extension.ts"],
    }) as Record<string, unknown>;
    expect(extensions(protectedSingle)).toEqual(expect.arrayContaining([
      "/opt/custom-extension.ts",
      expect.stringContaining("credential-guard.ts"),
    ]));
    expect(protectedSingle).toMatchObject({ cwd: "/tmp/external", worktree: true, sandbox: { allowedDomains: ["api.example.com"] } });

    const protectedParallel = protectSubagentParams({
      mode: "parallel",
      concurrency: 10,
      tasks: [
        { task: "one", extensions: [] },
        { agent: "aili.code-scout", task: "two", extensions: ["/opt/extra.ts"] },
      ],
    }) as { extensions: string[]; tasks: Array<{ extensions: string[] }> };
    expect(protectedParallel.extensions).toEqual(expect.arrayContaining([expect.stringContaining("credential-guard.ts")]));
    expect(protectedParallel.tasks.every((task) => task.extensions.some((extension) => extension.includes("credential-guard.ts")))).toBe(true);
    expect(protectedParallel.tasks[1]!.extensions).toContain("/opt/extra.ts");
  });

  it("leaves lifecycle actions untouched so upstream status/logs/wait/interrupt/background/reconcile retain their schema", () => {
    const action = { action: "reconcile", runId: "run-123", cwd: "/tmp/external", runsDir: ".runs" };
    expect(protectSubagentParams(action)).toBe(action);
    expect(normalizeSubagentCompatibility(action)).toEqual({ kind: "forward", params: action });
  });

  it("routes ordinary omitted and auto runs to headless while preserving compatible selectors", () => {
    expect(normalizeSubagentCompatibility({ task: "omitted" })).toEqual({
      kind: "forward",
      params: { task: "omitted", backend: "headless" },
    });
    expect(normalizeSubagentCompatibility({ backend: "auto", task: "auto" })).toEqual({
      kind: "forward",
      params: { backend: "headless", task: "auto" },
    });

    for (const params of [
      { backend: "headless", task: "explicit" },
      { backend: "tmux", task: "explicit" },
      { backend: "auto", visible: true, task: "visible" },
      { sandbox: true, task: "sandboxed" },
      { sandbox: { allowedDomains: ["api.example.com"] }, task: "sandboxed" },
    ]) {
      expect(normalizeSubagentCompatibility(params)).toEqual({ kind: "forward", params });
    }
  });

  it("normalizes parallel auto routing without overriding task-level visible intent", () => {
    expect(normalizeSubagentCompatibility({
      mode: "parallel",
      tasks: [{ task: "plain" }, { task: "sandboxed", sandbox: true }],
    })).toEqual({
      kind: "forward",
      params: {
        mode: "parallel",
        backend: "headless",
        tasks: [{ task: "plain" }, { task: "sandboxed", sandbox: true }],
      },
    });

    const compatibleMixed = {
      backend: "auto",
      mode: "parallel",
      tasks: [{ task: "visible", visible: true }, { task: "sandboxed", sandbox: true }],
    };
    expect(normalizeSubagentCompatibility(compatibleMixed)).toEqual({ kind: "forward", params: compatibleMixed });

    expect(normalizeSubagentCompatibility({
      mode: "parallel",
      tasks: [{ task: "visible", visible: true }, { task: "plain" }],
    })).toEqual(expect.objectContaining({
      kind: "reject",
      error: expect.stringMatching(/split the fan-out|explicit compatible backend/),
    }));
  });

  it("rejects explicit inline before upstream startup and marks the tool result as an error", async () => {
    let calls = 0;
    const wrapped = wrapSubagentTool({
      name: "subagent",
      async execute() { calls += 1; return "unexpected"; },
    });
    if (!wrapped.execute) throw new Error("wrapped tool has no execute");
    const result = await wrapped.execute("call-id", { backend: "inline", task: "must not start" }) as {
      content: Array<{ text: string }>;
      isError: boolean;
    };
    expect(calls).toBe(0);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      backend: "inline",
      requestedBackend: "inline",
      status: "failed",
      failureKind: "validation",
      error: expect.stringMatching(/Pi 0\.81\.1.*headless/),
    });

    const mixed = await wrapped.execute("mixed", {
      mode: "parallel",
      tasks: [{ task: "visible", visible: true }, { task: "plain" }],
    }) as { content: Array<{ text: string }>; isError: boolean };
    expect(calls).toBe(0);
    expect(mixed.isError).toBe(true);
    expect(JSON.parse(mixed.content[0]!.text)).toEqual(expect.objectContaining({
      requestedBackend: "auto",
      status: "failed",
      failureKind: "validation",
    }));
    expect(JSON.parse(mixed.content[0]!.text)).not.toHaveProperty("backend");
  });

  it("protects and normalizes both current id-plus-params and direct params execute shapes", async () => {
    const calls: unknown[] = [];
    const wrapped = wrapSubagentTool({
      name: "subagent",
      async execute(...args: unknown[]) { calls.push(args); return "ok"; },
    });
    if (!wrapped.execute) throw new Error("wrapped tool has no execute");
    await wrapped.execute("call-id", { task: "current" });
    await wrapped.execute({ task: "direct" });

    const current = (calls[0] as unknown[])[1] as { backend: string; extensions: string[] };
    const direct = (calls[1] as unknown[])[0] as { backend: string; extensions: string[] };
    expect(current.backend).toBe("headless");
    expect(direct.backend).toBe("headless");
    expect(current.extensions).toEqual(expect.arrayContaining([expect.stringContaining("credential-guard.ts")]));
    expect(direct.extensions).toEqual(expect.arrayContaining([expect.stringContaining("credential-guard.ts")]));
  });

  it("uses the same effective backend for renderer and executor", async () => {
    let rendered: unknown;
    let executed: unknown;
    const wrapped = wrapSubagentTool({
      name: "subagent",
      renderCall(args: unknown) {
        rendered = args;
        return { invalidate() {}, render: () => ["upstream"] } as never;
      },
      async execute(_id: unknown, params: unknown) { executed = params; return "ok"; },
    });
    wrapped.renderCall?.({ task: "parity" }, plainTheme);
    await wrapped.execute?.("call-id", { task: "parity" });
    expect(rendered).toMatchObject({ task: "parity", backend: "headless" });
    expect(executed).toMatchObject({ task: "parity", backend: "headless" });
  });

  it("does not synthesize a renderer when the upstream tool has none", () => {
    const wrapped = wrapSubagentTool({ name: "subagent", execute: async () => "ok" });
    expect(wrapped.renderCall).toBeUndefined();
    expect(typeof wrapped.execute).toBe("function");
  });

  it("renders a named Agent header above the unchanged upstream single-run call", async () => {
    const lines = renderCall(await captureSubagentTool(), {
      agent: "aili.code-scout",
      task: "inspect the quota integration",
    });

    expect(lines[0]).toBe("Agent: aili.code-scout");
    expect(lines[0]).not.toContain("quota integration");
    expect(lines[1]).toContain("subagent run · single · aili.code-scout");
  });

  it("summarizes parallel Agent names, duplicates, and agentless tasks", async () => {
    const lines = renderCall(await captureSubagentTool(), {
      mode: "parallel",
      tasks: [
        { agent: "aili.code-scout", task: "one" },
        { agent: "aili.code-scout", task: "two" },
        { task: "three" },
      ],
    });

    expect(lines[0]).toBe("Agents: aili.code-scout ×2, agentless");
    expect(lines[0]).not.toMatch(/\bone\b|\btwo\b|\bthree\b/);
    expect(lines[1]).toContain("subagent run · parallel · 3 runs");
  });

  it("shows agentless for an unnamed run", async () => {
    const lines = renderCall(await captureSubagentTool(), { task: "inspect" });
    expect(lines[0]).toBe("Agent: agentless");
  });

  it("sanitizes and bounds the Agent heading", async () => {
    const lines = renderCall(await captureSubagentTool(), {
      agent: `bad\x1b[31m\nna\u202Eme${"x".repeat(100)}`,
      task: "inspect",
    });

    expect(lines[0]).toMatch(/^Agent: bad name/);
    expect(lines[0]).not.toContain("\x1b");
    expect([...lines[0]!]).toHaveLength(55);
    expect(lines[0]).toMatch(/…$/);
  });

  it("does not claim an Agent for lifecycle-only actions", async () => {
    const lines = renderCall(await captureSubagentTool(), {
      action: "status",
      runId: "run-123",
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("subagent status · run-123");
    expect(lines[0]).not.toContain("Agent:");
  });
});

describe("non-removable credential guard", () => {
  it("denies credential/auth/private-key file targets across external paths", async () => {
    await expect(isProtectedChildPath("/tmp/external", "/tmp/external/.env")).resolves.toBe(true);
    await expect(isProtectedChildPath("/tmp/external", "~/.ssh/id_ed25519")).resolves.toBe(true);
    await expect(isProtectedChildPath("/tmp/external", "/tmp/external/package.json")).resolves.toBe(false);
  });

  it("denies direct and nested bash credential reads without exposing content", () => {
    expect(bashMentionsCredentialPath("cat .env")).toBe(true);
    expect(bashMentionsCredentialPath("bash -c 'cat ~/.ssh/id_rsa'")).toBe(true);
    expect(bashMentionsCredentialPath("cat /tmp/external/package.json")).toBe(false);
  });

  it("blocks the actual child tool hook even when the caller supplied custom extensions", async () => {
    let handler: ((event: { toolName: string; input: unknown }) => Promise<{ block: boolean; reason: string } | undefined>) | undefined;
    registerCredentialGuard({ on(event: string, callback: typeof handler) { if (event === "tool_call") handler = callback; } } as never);
    if (!handler) throw new Error("credential guard hook was not registered");
    await expect(handler({ toolName: "read", input: { path: "/tmp/external/.env" } })).resolves.toEqual(expect.objectContaining({ block: true, reason: expect.not.stringContaining("content") }));
    await expect(handler({ toolName: "bash", input: { command: "bash -c 'cat ~/.ssh/id_ed25519'" } })).resolves.toEqual(expect.objectContaining({ block: true }));
    await expect(handler({ toolName: "read", input: { path: "/tmp/external/package.json" } })).resolves.toBeUndefined();
  });
});
