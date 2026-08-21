import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanDeliveryIdsFromParentEntries } from "../../src/runtime/persistent-agents/output-delivery.js";
import {
  PersistentAgentRuntime,
  registerPersistentAgentTools,
  type PersistentRuntimeExecutorInput,
} from "../../src/runtime/persistent-agents/runtime.js";
import { TASK_TOOL_SCHEMA } from "../../src/runtime/persistent-agents/task-schema.js";
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
  it("connects task, official child JSONL, output/history, async delivery, stable resume IDs, and no provider replay", async () => {
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
      revive: async () => ({
        steer() {},
        sendUserMessage() {},
        dispose() {},
      }),
    });

    const runtime = await create();
    const sync = await runtime.task.submit({ task: "sync work", name: "Scout", async: false });
    expect(sync.results[0]).toMatchObject({ status: "completed", agentId: "Scout", outputRef: "agent://Scout", model: { provider: "fixture", model: "offline", layer: "parent-fallback", thinking: "high" } });
    const scout = runtime.journal.getState().agents.Scout;
    expect(scout.sessionPath).toBeTruthy();
    expect(await readFile(scout.sessionPath!, "utf8")).toContain("execution-1:sync work");
    expect(await runtime.hub.execute({ action: "output", agentId: "Scout" })).toMatchObject({ content: "execution-1:sync work" });
    expect(await runtime.hub.execute({ action: "history", agentId: "Scout" })).toMatchObject({ content: expect.stringContaining("execution-1:sync work") });
    expect(parentEntries).toEqual([]);

    const accepted = await runtime.task.submit({ task: "async work", name: "Worker" });
    expect(accepted.results[0]).toMatchObject({ status: "accepted", agentId: "Worker", jobId: "job-2", model: { provider: "fixture", model: "offline", layer: "parent-fallback", thinking: "high" } });
    await runtime.task.getSettlement("job-2");
    expect(parentEntries).toHaveLength(1);
    expect(parentEntries[0]).toMatchObject({
      details: {
        selector: "general",
        effectiveMode: "async",
        effectiveModel: "fixture/offline",
        modelLayer: "parent-fallback",
        thinking: "high",
        agentId: "Worker",
        jobId: "job-2",
        turnId: "turn-2",
      },
    });
    expect(await runtime.hub.execute({ action: "jobs", jobId: "job-2" })).toMatchObject({
      jobs: [{ display: { selector: "general", effectiveModel: "fixture/offline", modelLayer: "parent-fallback", thinking: "high", turnId: "turn-2" } }],
    });
    expect(scanDeliveryIdsFromParentEntries(parentEntries)).toEqual(new Set(["delivery-job-2"]));
    await runtime.shutdown();

    const beforeResumeExecutions = executions;
    const resumed = await create();
    expect(executions).toBe(beforeResumeExecutions);
    expect(resumed.journal.getState().agents).toMatchObject({ Scout: { state: "idle" }, Worker: { state: "idle" } });
    const next = await resumed.task.submit({ task: "new identity", name: "Scout", async: false });
    expect(next.results[0]).toMatchObject({ agentId: "Scout-2", jobId: "job-3" });
    expect(executions).toBe(beforeResumeExecutions + 1);
    await resumed.shutdown();
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
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });
    const audit = { packageId: "P-01", canonicalRole: "aili.implementer", scope: "fixture scope", forbiddenScope: "outside fixture", writeScope: { paths: [], resources: [] }, acceptanceBoundary: "error remains exact", expectedEvidence: "verification:preflight; artifact:result" };
    const response = await runtime.task.submitTrusted({ task: "must not execute", agent: "aili.implementer", async: false, formalContext: { changeId }, continuationAudit: audit });
    expect(response.results[0]).toMatchObject({ status: "failed", error: "injected formal preflight failure", formalResultStatus: "malformed" });
    expect(executions).toBe(0);
    const agent = runtime.journal.getState().agents[response.results[0]!.agentId]!;
    expect(agent.sessionPath).toBeTruthy();
    expect(await readFile(agent.sessionPath!, "utf8")).toContain('"type":"session"');
    expect(runtime.journal.getState().formalResultEvidence[response.results[0]!.jobId]).toMatchObject({ historyPath: agent.sessionPath, canonicalStatus: "malformed" });
    await runtime.shutdown();
  });

  it("registers only canonical internal task/formal_task/hub tools and the direct-user model command", async () => {
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
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
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
    expect([...tools.keys()]).toEqual(["task", "formal_task", "hub"]);
    expect([...tools.keys()]).not.toContain("subagent");
    expect([...tools.keys()]).not.toContain("aili_task");
    expect(commands.has("aili-agent-model")).toBe(true);
    expect(commands.has("codex-fast")).toBe(true);

    const taskTool = tools.get("task");
    expect(taskTool.description).toContain("Ordinary Pi remains benefit-based");
    expect(taskTool.description).toContain("omitted agent retains general compatibility");
    expect(taskTool.description).toContain("Formal package dispatch belongs to the formal_task tool");
    expect(taskTool.description).toContain("async:false for prerequisites with an immediate join");
    expect(taskTool.description).toContain("async:true only for independent work with a named join");
    expect(taskTool.description).toContain("inspect output/history before dependents");
    expect(taskTool.description).toContain("Workers never decide lifecycle phase or verdict");
    const formalTool = tools.get("formal_task");
    expect(formalTool.description).toContain("validated v1 formal-task-board.md/progress.txt pair");
    expect(formalTool.description).toContain("only validates the pair and constructs the ordinary task request");
    expect(formalTool.description).toContain("never falls back to ordinary dispatch");
    expect(formalTool.description).toContain("ROSE owns phase, acceptance, integration, and verdict");
    expect(taskTool.promptSnippet).toContain("benefit-based direct work");
    expect(taskTool.promptSnippet).toContain("omitted agent remains general-compatible");
    expect(taskTool.promptSnippet).toContain("Dispatch formal packages through formal_task");
    expect(taskTool.promptGuidelines).toEqual([
      expect.stringMatching(/^Ordinary routing:/),
      expect.stringMatching(/^Formal boundary:/),
      expect.stringMatching(/^Prerequisite execution:/),
      expect.stringMatching(/^Worker boundary:/),
      expect.stringContaining("Specialized Agent catalog (generated routing cues"),
    ]);
    expect(taskTool.promptGuidelines.at(-1)).toContain("aili.code-scout — Read-only code scouting Worker");
    expect(taskTool.promptGuidelines.at(-1)).toContain("aili.solution-architect — Repository-grounded solution-design Worker");
    expect(taskTool.promptGuidelines.at(-1)).toContain("phases(advisory)=IDEATE/DEFINE/BUILD");
    expect(taskTool.promptGuidelines.at(-1)).not.toContain("toolPolicy");
    expect(taskTool.parameters).toBe(TASK_TOOL_SCHEMA);
    expect(taskTool.renderCall).toBeTypeOf("function");
    expect(taskTool.renderResult).toBeTypeOf("function");
    expect(tools.get("hub").renderCall).toBeTypeOf("function");
    expect(tools.get("hub").renderResult).toBeTypeOf("function");

    const context = { ui: { notify() {} } } as never;
    const taskResult = await taskTool.execute("call-1", { task: "internal", async: false }, new AbortController().signal, undefined, context);
    expect(JSON.parse(taskResult.content[0].text)).toMatchObject({ results: [expect.objectContaining({ status: "completed" })] });
    await commands.get("aili-agent-model").handler("global general provider/model", context);
    expect(directCalls).toEqual(["global general provider/model"]);
    await commands.get("codex-fast").handler("true", context);
    expect(fastCalls).toEqual(["true"]);
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
      revive: async () => ({ steer() {}, sendUserMessage() {}, dispose() {} }),
    });
    await runtime.task.submit({ task: "new runtime only", async: false });
    await runtime.shutdown();

    expect(digest(await readFile(legacyRun))).toBe(before.legacy);
    expect(digest(await readFile(userConfig))).toBe(before.config);
    expect(digest(await readFile(unrelatedSidecar))).toBe(before.sidecar);
    expect(runtime.layout.root).not.toBe(resolve(unrelatedSidecar, "../.."));
  });
});
