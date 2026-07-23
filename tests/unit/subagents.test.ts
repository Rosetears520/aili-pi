import { describe, expect, it } from "vitest";
import registerCredentialGuard, { bashMentionsCredentialPath, isProtectedChildPath } from "../../src/runtime/credential-guard.js";
import { protectSubagentParams, registerSubagent } from "../../src/runtime/subagents.js";

function extensions(value: unknown): string[] {
  return (value as { extensions?: string[] }).extensions ?? [];
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
