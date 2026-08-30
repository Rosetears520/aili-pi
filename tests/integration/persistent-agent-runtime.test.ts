import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAgentHistory, readAgentOutput, scanDeliveryIdsFromParentEntries } from "../../src/runtime/persistent-agents/output-delivery.js";
import {
  PersistentAgentRuntime,
  registerPersistentAgentTools,
  type PersistentRuntimeExecutorInput,
} from "../../src/runtime/persistent-agents/runtime.js";
import { SUB_TOOL_SCHEMA } from "../../src/runtime/persistent-agents/sub-schema.js";
import { loadAgentCatalog } from "../../src/runtime/agent-catalog.js";
import type { ResolvedModelChoice } from "../../src/runtime/persistent-agents/model-selection.js";

let scratch = "";

function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function persistAssistant(input: PersistentRuntimeExecutorInput, text: string): void {
  input.sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    api: "fixture",
    provider: "fixture",
    model: "fixture",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
  } as never);
}

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-runtime-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("internal persistent Agent runtime wiring", () => {
  it("connects sub, official child JSONL, output/history reads, background delivery, stable resume IDs, and no provider replay", async () => {
    const parentFile = join(scratch, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const parentEntries: unknown[] = [];
    let executions = 0;
    const frozen: ResolvedModelChoice = { provider: "fixture", model: "offline", canonical: "fixture/offline", layer: "parent-fallback", thinking: "high", persistent: false, oneShot: false };
    const create = () => PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-1",
      cwd: scratch,
      preallocate: async () => frozen,
      execute: async (input) => {
        executions += 1;
        const output = `execution-${executions}:${input.item.task}`;
        persistAssistant(input, output);
        expect(input.modelChoice).toEqual(frozen);
        return { output, model: input.modelChoice };
      },
      parentDelivery: {
        scanDeliveryIds: async () => scanDeliveryIdsFromParentEntries(parentEntries),
        send: async (message) => {
          parentEntries.push({ type: "custom_message", ...message });
          return "sent";
        },
      },
    });

    const runtime = await create();
    const sync = await runtime.sub.submit({ description: "Scout", prompt: "sync work", subagent_type: "general" });
    expect(sync.results[0]).toMatchObject({ status: "completed", agentId: "Scout", taskId: "Scout", outputRef: "agent://Scout", model: { provider: "fixture", model: "offline", layer: "parent-fallback", thinking: "high" } });
    const scout = runtime.journal.getState().agents.Scout;
    expect(scout.sessionPath).toBeTruthy();
    expect(await readFile(scout.sessionPath!, "utf8")).toContain("execution-1:sync work");
    expect(await readAgentOutput(runtime.layout, runtime.journal, "Scout")).toMatchObject({ content: "execution-1:sync work" });
    expect((await readAgentHistory(runtime.layout, runtime.journal, "Scout")).content).toContain("execution-1:sync work");
    expect(parentEntries).toEqual([]);

    // Async execution stays reachable through the trusted internal surface
    // (the public sub schema hides background in this build).
    const accepted = await runtime.sub.submitTrusted({ task: "async work", async: true });
    expect(accepted.results[0]).toMatchObject({ status: "accepted", agentId: "general", taskId: "general", jobId: "job-2", model: { provider: "fixture", model: "offline", layer: "parent-fallback", thinking: "high" } });
    await runtime.sub.getSettlement("job-2");
    expect(parentEntries).toHaveLength(1);
    expect(parentEntries[0]).toMatchObject({
      details: {
        selector: "general",
        effectiveMode: "async",
        effectiveModel: "fixture/offline",
        modelLayer: "parent-fallback",
        thinking: "high",
        agentId: "general",
        jobId: "job-2",
        turnId: "turn-2",
      },
    });
    expect(runtime.journal.getState().jobs["job-2"]).toMatchObject({ state: "completed", agentId: "general" });
    expect(scanDeliveryIdsFromParentEntries(parentEntries)).toEqual(new Set(["delivery-job-2"]));
    await runtime.shutdown();

    const beforeResumeExecutions = executions;
    const resumed = await create();
    expect(executions).toBe(beforeResumeExecutions);
    expect(resumed.journal.getState().agents).toMatchObject({ Scout: { state: "idle" }, general: { state: "idle" } });
    const next = await resumed.sub.submit({ description: "Scout-2", prompt: "new identity", subagent_type: "general" });
    expect(next.results[0]).toMatchObject({ agentId: "Scout-2", jobId: "job-3" });
    expect(executions).toBe(beforeResumeExecutions + 1);
    await resumed.shutdown();
  });

  it("public sub depends on no project files: no openspec, no board, no configs", async () => {
    // 完全空的项目目录——连 openspec/ 都不存在，也没有任何配置文件。
    const project = join(scratch, "empty-project");
    const sessionDir = join(scratch, "sessions");
    await mkdir(project, { recursive: true });
    await mkdir(sessionDir, { recursive: true });
    const parentFile = join(sessionDir, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-empty",
      cwd: project,
      execute: async (input) => {
        persistAssistant(input, "board-free result");
        return { output: "board-free result" };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
    });
    const response = await runtime.sub.submit({ description: "Scout", prompt: "work without any board", subagent_type: "general" });
    expect(response.results[0]).toMatchObject({ status: "completed", taskId: "Scout", output: "board-free result" });
    // 公开 sub 不在项目目录里产生或依赖任何文件（持久化都在父会话所属的 sidecar）。
    expect(await readdir(project)).toEqual([]);
    await runtime.shutdown();
  });

  it("retains a formal preflight error after registering a readable child history without executor work", async () => {
    const parentFile = join(scratch, "parent.jsonl");
    const changeId = "preflight-failure";
    await writeFile(parentFile, "fixture parent\n");
    const formalRoot = join(scratch, "openspec", "changes", changeId);
    await mkdir(formalRoot, { recursive: true });
    await writeFile(join(formalRoot, "formal-task-board.md"), [
      "# Task Board", "", "- Protocol: `aili-task-board/v1`", "- Task kind: `formal`",
      `- Task identity: \`${changeId}\``, "- Goal: bounded preflight fixture", "- Phase: `BUILD`", "- Board status: `active`",
      "- Accepted contract: `fixture`", "- Accepted verification: `accepted fixture`", "- Decision owner: `ROSE`", "- Verification owner: `ROSE`", "", "## Packages", "",
      "- [ ] P-01 — Preserve preflight error",
      "  - Phase: `BUILD`", "  - Package kind: `task-execution`", "  - Source refs: `task:P-01`", "  - Accepted task IDs: `P-01`", "  - Status: `ready`", "  - Owner: `agent:aili.implementer`", "  - Dispatch: `required`", "  - Dispatch reason: `fixture`", "  - No-dispatch reason: `N/A`", "  - Execution: `sync`", "  - Join: `immediate`", "  - Depends on: `none`", "  - Decision gate: `N/A`", "  - Final test-plan gate: `accepted`", "  - Implementation authorization: `granted`", "  - Operation permissions: `N/A`", "  - Scope: `fixture scope`", "  - Forbidden scope: `outside fixture`", "  - Expected result: `preflight failure`", "  - Expected evidence: `verification:preflight; artifact:result`", "  - Acceptance: `error remains exact`", "  - Dispatch evidence: `pending`", "  - Result evidence: `pending`", "  - Evidence: `pending`", "  - ROSE disposition: `pending`", "  - Blocker: `none`", "  - Next action: `run fixture`", "",
    ].join("\n"));
    await writeFile(join(formalRoot, "progress.txt"), "[2026-07-29T00:00:00Z] BOARD BOARD_CREATED\n\n[2026-07-29T00:00:01Z] P-01 READY\nevidence=artifact:ready/P-01\n");
    let executions = 0;
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile, parentId: "parent-1", cwd: scratch,
      preflight: async () => { throw new Error("injected formal preflight failure"); },
      execute: async () => { executions += 1; return { output: "unexpected" }; },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
    });
    const audit = { packageId: "P-01", canonicalRole: "aili.implementer", scope: "fixture scope", forbiddenScope: "outside fixture", writeScope: { paths: [], resources: [] }, acceptanceBoundary: "error remains exact", expectedEvidence: "verification:preflight; artifact:result" };
    const response = await runtime.sub.submitTrusted({ task: "must not execute", agent: "aili.implementer", async: false, formalContext: { changeId }, continuationAudit: audit });
    expect(response.results[0]).toMatchObject({ status: "failed", error: "injected formal preflight failure", formalResultStatus: "malformed" });
    expect(executions).toBe(0);
    const agent = runtime.journal.getState().agents[response.results[0]!.agentId]!;
    expect(agent.sessionPath).toBeTruthy();
    expect(await readFile(agent.sessionPath!, "utf8")).toContain('"type":"session"');
    expect(runtime.journal.getState().formalResultEvidence[response.results[0]!.jobId]).toMatchObject({ historyPath: agent.sessionPath, canonicalStatus: "malformed" });
    await runtime.shutdown();
  });

  it("registers only the canonical internal sub tool and the direct-user commands", async () => {
    const parentFile = join(scratch, "parent.jsonl");
    await writeFile(parentFile, "fixture parent\n");
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "parent-1",
      cwd: scratch,
      execute: async (input) => {
        persistAssistant(input, "tool result");
        return { output: "tool result" };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "sent" },
    });
    const tools = new Map<string, any>();
    const commands = new Map<string, any>();
    const directCalls: string[] = [];
    const fastCalls: string[] = [];
    const catalog = await loadAgentCatalog();
    if (!catalog.ok) throw new Error(catalog.diagnostics.map((diagnostic) => diagnostic.code).join(", "));
    registerPersistentAgentTools({
      registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
      registerCommand(name: string, command: unknown) { commands.set(name, command); },
    } as never, {
      catalog: catalog.value,
      runtimeForContext: async () => runtime,
      directModelCommand: async (args) => {
        directCalls.push(args);
        return "model updated";
      },
      directFastCommand: async (args) => {
        fastCalls.push(args);
        return "fast updated";
      },
    });
    expect([...tools.keys()]).toEqual(["sub", "hub"]);
    expect([...tools.keys()]).not.toContain("formal_task");
    expect([...tools.keys()]).not.toContain("subagent");
    expect([...tools.keys()]).not.toContain("aili_task");
    expect(commands.has("aili-agent-model")).toBe(true);
    expect(commands.has("codex-fast")).toBe(true);
    expect(commands.has("sub-cancel")).toBe(true);

    const taskTool = tools.get("sub");
    expect(taskTool.description).toContain("Delegate one bounded turn to a persistent AILI child Agent");
    expect(taskTool.description).toContain("task_id to continue the same child session");
    expect(taskTool.description).toContain("issue several sub calls in the same assistant message");
    expect(taskTool.description).toContain("Calls run foreground by default");
    expect(taskTool.description).toContain("background:true");
    expect(JSON.stringify(taskTool.parameters)).toContain("background");
    expect(taskTool.description).toContain("fails this call instead of falling back");
    expect(taskTool.description).toContain("free-form progress.txt");
    expect(taskTool.description).toContain("formal-task-board.md is optional");
    expect(taskTool.promptGuidelines[0]).toContain("SUB_BUSY");
    expect(taskTool.promptSnippet).toContain("foreground by default");
    expect(taskTool.promptSnippet).toContain("hub coordinates");
    expect(taskTool.promptGuidelines).toEqual([
      expect.stringMatching(/^One call = one turn:/),
      expect.stringMatching(/^Parallel foreground calls/),
      expect.stringMatching(/^Per-turn model\/thinking:/),
      expect.stringMatching(/^Delegated children are observable surfaces:/),
      expect.stringMatching(/^Ordinary routing:/),
      expect.stringMatching(/^Progress:/),
      expect.stringMatching(/^Worker boundary:/),
      expect.stringContaining("Specialized Agent catalog (generated routing cues"),
    ]);
    expect(taskTool.promptGuidelines.at(-1)).toContain("aili.code-scout — Read-only code scouting Worker");
    expect(taskTool.promptGuidelines.at(-1)).toContain("aili.solution-architect — Repository-grounded solution-design Worker");
    expect(taskTool.promptGuidelines.at(-1)).toContain("phases(advisory)=IDEATE/DEFINE/BUILD");
    expect(taskTool.promptGuidelines.at(-1)).not.toContain("toolPolicy");
    expect(taskTool.parameters).toBe(SUB_TOOL_SCHEMA);
    expect(taskTool.renderCall).toBeTypeOf("function");
    expect(taskTool.renderResult).toBeTypeOf("function");

    const context = { ui: { notify() {} } } as never;
    const taskResult = await taskTool.execute("call-1", { description: "internal", prompt: "internal", subagent_type: "general" }, new AbortController().signal, undefined, context);
    expect(JSON.parse(taskResult.content[0].text)).toMatchObject({ results: [expect.objectContaining({ status: "completed" })] });
    const background = await taskTool.execute("call-bg", { description: "background", prompt: "background", subagent_type: "general", background: true }, new AbortController().signal, undefined, context);
    const accepted = JSON.parse(background.content[0].text);
    expect(accepted.results[0]).toMatchObject({ status: "accepted", taskId: expect.any(String) });
    const hub = tools.get("hub");
    const jobs = await hub.execute("hub-jobs", { action: "jobs" }, new AbortController().signal, undefined, context);
    expect(JSON.parse(jobs.content[0].text).jobs).toBeDefined();
    const waited = await hub.execute("hub-wait", { action: "wait", task_id: accepted.results[0].taskId, timeout_ms: 5_000 }, new AbortController().signal, undefined, context);
    expect(JSON.parse(waited.content[0].text).state).toBe("completed");
    const output = await hub.execute("hub-output", { action: "output", task_id: accepted.results[0].taskId }, new AbortController().signal, undefined, context);
    expect(JSON.parse(output.content[0].text).content).toContain("tool result");
    await commands.get("aili-agent-model").handler("global general provider/model", context);
    expect(directCalls).toEqual(["global general provider/model"]);
    await commands.get("codex-fast").handler("true", context);
    expect(fastCalls).toEqual(["true"]);
    await commands.get("sub-cancel").handler("Scout", context);
    await runtime.shutdown();
  });

  it("leaves legacy runs, user config, and unrelated old/new sidecars byte-identical through migration and rollback", async () => {
    const legacyRun = join(scratch, ".pi", "agent", "runs", "run-old", "result.json");
    const userConfig = join(scratch, ".pi", "agent", "settings.json");
    const unrelatedSidecar = join(scratch, "old-parent", "aili-agents", "coordinator.jsonl");
    await mkdir(resolve(legacyRun, ".."), { recursive: true });
    await mkdir(resolve(userConfig, ".."), { recursive: true });
    await mkdir(resolve(unrelatedSidecar, ".."), { recursive: true });
    await writeFile(legacyRun, "legacy-run-bytes\n");
    await writeFile(userConfig, "user-config-bytes\n");
    await writeFile(unrelatedSidecar, "unrelated-sidecar-bytes\n");
    const before = {
      legacy: digest(await readFile(legacyRun)),
      config: digest(await readFile(userConfig)),
      sidecar: digest(await readFile(unrelatedSidecar)),
    };

    const parentFile = join(scratch, "new-parent.jsonl");
    await writeFile(parentFile, "new parent\n");
    const runtime = await PersistentAgentRuntime.create({
      parentSessionPath: parentFile,
      parentId: "new-parent",
      cwd: scratch,
      execute: async (input) => {
        persistAssistant(input, "new output");
        return { output: "new output" };
      },
      parentDelivery: { scanDeliveryIds: async () => new Set(), send: async () => "unavailable" },
    });
    await runtime.sub.submit({ description: "new runtime only", prompt: "new runtime only", subagent_type: "general" });
    await runtime.shutdown();

    expect(digest(await readFile(legacyRun))).toBe(before.legacy);
    expect(digest(await readFile(userConfig))).toBe(before.config);
    expect(digest(await readFile(unrelatedSidecar))).toBe(before.sidecar);
    expect(runtime.layout.root).not.toBe(resolve(unrelatedSidecar, "../.."));
  });
});
