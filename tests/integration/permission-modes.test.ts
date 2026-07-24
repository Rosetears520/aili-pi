import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import registerPermissionModes from "../../src/vendor/pi-permission-modes/index.js";

type Handler = (event: unknown, context: unknown) => unknown | Promise<unknown>;

type Harness = {
  cwd: string;
  selections: string[];
  toolCall(event: { toolCallId: string; toolName: string; input: Record<string, unknown> }, options?: { hasUI?: boolean }): Promise<unknown>;
  executeBash(command: string): Promise<unknown>;
  shutdown(): Promise<void>;
};

async function permissionHarness(options: {
  overlay?: Record<string, unknown>;
  select?: () => Promise<string | undefined>;
} = {}): Promise<Harness> {
  const cwd = await mkdtemp(join(tmpdir(), "aili-permission-mode-"));
  const agentDir = join(cwd, "agent");
  await mkdir(agentDir, { recursive: true });
  if (options.overlay) {
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(join(cwd, ".pi", "permission-mode.json"), `${JSON.stringify(options.overlay, null, 2)}\n`);
  }

  const handlers = new Map<string, Handler[]>();
  const tools: Array<{ name: string; execute?: (...args: unknown[]) => Promise<unknown> }> = [];
  const selections: string[] = [];
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const previousMode = process.env.PI_PERMISSION_MODE;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_PERMISSION_MODE = "yolo";

  const pi = new Proxy({
    registerFlag() {},
    getFlag() { return false; },
    registerShortcut() {},
    registerCommand() {},
    registerTool(tool: { name: string; execute?: (...args: unknown[]) => Promise<unknown> }) { tools.push(tool); },
    getAllTools() { return tools; },
    setActiveTools() {},
    appendEntry() {},
    on(event: string, handler: Handler) {
      const registered = handlers.get(event) ?? [];
      registered.push(handler);
      handlers.set(event, registered);
    },
  }, {
    get(target, property, receiver) {
      return property in target ? Reflect.get(target, property, receiver) : () => undefined;
    },
  });

  await registerPermissionModes(pi as never);

  const context = (hasUI: boolean) => ({
    cwd,
    hasUI,
    sessionManager: { getEntries: () => [] },
    ui: {
      theme: { fg: (_style: string, text: string) => text },
      notify() {},
      setStatus() {},
      async select(title: string, choices: string[]) {
        selections.push(`${title}\n${choices.join("|")}`);
        return await options.select?.();
      },
    },
  });

  for (const handler of handlers.get("session_start") ?? []) {
    await handler({ type: "session_start" }, context(true));
  }

  return {
    cwd,
    selections,
    async toolCall(event, callOptions = {}) {
      let result: unknown;
      for (const handler of handlers.get("tool_call") ?? []) {
        result = await handler(event, context(callOptions.hasUI ?? true));
        if (result !== undefined) return result;
      }
      return result;
    },
    async executeBash(command: string) {
      const bash = tools.find((tool) => tool.name === "bash");
      if (!bash?.execute) throw new Error("adapted permission extension did not register bash");
      return await bash.execute("bash-fixture", { command }, undefined, undefined, context(true));
    },
    async shutdown() {
      for (const handler of handlers.get("session_shutdown") ?? []) {
        await handler({ type: "session_shutdown" }, context(false));
      }
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      if (previousMode === undefined) delete process.env.PI_PERMISSION_MODE;
      else process.env.PI_PERMISSION_MODE = previousMode;
      await rm(cwd, { recursive: true, force: true });
    },
  };
}

const tighteningOverlay = (action: "ask" | "deny") => ({
  modes: {
    yolo: {
      permission: {
        bash: action === "ask"
          ? { "*": "ask", "*blocked*": "deny" }
          : { "*": "deny" },
      },
    },
  },
});

describe("adapted permission-mode dispatcher", () => {
  it("keeps stock YOLO silent for distinct multiline, heredoc, and external-path commands", async () => {
    const harness = await permissionHarness();
    try {
      for (const [index, command] of [
        "printf first\nprintf second",
        "node <<'NODE'\nconsole.log('fixture')\nNODE",
        "cd /tmp\nprintf external",
        "printf a\nprintf b\nprintf c",
      ].entries()) {
        await expect(harness.toolCall({ toolCallId: `yolo-${index}`, toolName: "bash", input: { command } })).resolves.toBeUndefined();
        const execution = await harness.executeBash(command) as { content?: Array<{ text?: string }> };
        expect(execution.content?.map((part) => part.text).join("")).toMatch(/firstsecond|fixture|external|abc/);
      }
      expect(harness.selections).toEqual([]);
    } finally {
      await harness.shutdown();
    }
  });

  it("applies multiline patterns through file, external-directory, and web-search dispatcher surfaces", async () => {
    const harness = await permissionHarness({
      overlay: {
        modes: {
          yolo: {
            permission: {
              read: { "*": "allow", "*blocked\npath*": "deny" },
              external_directory: { "*": "allow", "*blocked\noutside*": "deny" },
              web_search: { "*": "allow", "*blocked\nquery*": "deny" },
            },
          },
        },
      },
    });
    try {
      await expect(harness.toolCall({
        toolCallId: "read-newline",
        toolName: "read",
        input: { path: "/tmp/blocked\npath" },
      })).resolves.toEqual({ block: true, reason: expect.stringContaining("blocked by") });
      await expect(harness.toolCall({
        toolCallId: "external-newline",
        toolName: "read",
        input: { path: "/tmp/blocked\noutside" },
      })).resolves.toEqual({ block: true, reason: expect.stringContaining("blocked by") });
      await expect(harness.toolCall({
        toolCallId: "query-newline",
        toolName: "web_search",
        input: { query: "allowed prefix\nblocked\nquery" },
      })).resolves.toEqual({ block: true, reason: "web search blocked by YOLO" });
      expect(harness.selections).toEqual([]);
    } finally {
      await harness.shutdown();
    }
  });

  it("preserves custom unsandboxed ask, exact-command session grants, deny, and no-UI fail-closed behavior", async () => {
    let choice: string | undefined = "Allow for session";
    const asking = await permissionHarness({
      overlay: tighteningOverlay("ask"),
      select: async () => choice,
    });
    try {
      const first = "printf one\nprintf two";
      await expect(asking.toolCall({ toolCallId: "ask-1", toolName: "bash", input: { command: first } })).resolves.toBeUndefined();
      await expect(asking.toolCall({ toolCallId: "ask-2", toolName: "bash", input: { command: first } })).resolves.toBeUndefined();
      expect(asking.selections).toHaveLength(1);

      choice = "Deny";
      await expect(asking.toolCall({ toolCallId: "ask-3", toolName: "bash", input: { command: "printf different\nprintf command" } })).resolves.toEqual({
        block: true,
        reason: "bash blocked",
      });
      expect(asking.selections).toHaveLength(2);

      await expect(asking.toolCall(
        { toolCallId: "ask-headless", toolName: "bash", input: { command: "printf no\nprintf ui" } },
        { hasUI: false },
      )).resolves.toEqual({ block: true, reason: "bash blocked" });
      expect(asking.selections).toHaveLength(2);

      await expect(asking.toolCall({
        toolCallId: "deny-specific",
        toolName: "bash",
        input: { command: "printf prefix\nprintf blocked" },
      })).resolves.toEqual({ block: true, reason: "bash command denied by policy" });
      expect(asking.selections).toHaveLength(2);
    } finally {
      await asking.shutdown();
    }

    const denying = await permissionHarness({ overlay: tighteningOverlay("deny") });
    try {
      await expect(denying.toolCall({
        toolCallId: "deny-all",
        toolName: "bash",
        input: { command: "printf denied\nprintf multiline" },
      })).resolves.toEqual({ block: true, reason: "bash command denied by policy" });
      expect(denying.selections).toEqual([]);
    } finally {
      await denying.shutdown();
    }
  });
});
