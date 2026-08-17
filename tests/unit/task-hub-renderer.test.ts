import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  HUB_RENDERERS,
  TASK_RENDERERS,
  boundedDisplayText,
  renderHubCall,
  renderHubResult,
  renderTaskCall,
  renderTaskResult,
  type HubCallArgs,
  type RendererTheme,
  type TaskCallArgs,
} from "../../src/runtime/persistent-agents/task-hub-renderer.js";

const theme: RendererTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

function context<T>(args: T, overrides: Record<string, unknown> = {}) {
  return {
    args,
    toolCallId: "call-1",
    invalidate() {},
    lastComponent: undefined,
    state: {},
    cwd: "/fixture",
    executionStarted: false,
    argsComplete: true,
    isPartial: false,
    expanded: false,
    showImages: false,
    isError: false,
    ...overrides,
  } as never;
}

function rendered(component: { render(width: number): string[] }, width = 120): string {
  return component.render(width).join("\n");
}

function result(details: unknown): AgentToolResult<unknown> {
  return { content: [{ type: "text", text: "raw fallback" }], details };
}

function taskItem(status: string, overrides: Record<string, unknown> = {}) {
  return {
    status,
    agentId: "Worker",
    jobId: "job-1",
    turnId: "turn-1",
    selector: "aili.implementer",
    effectiveMode: "sync",
    lifecycle: {
      agent: status === "aborted" ? "aborted" : "idle",
      job: status === "aborted" ? "aborted" : status === "failed" ? "failed" : "completed",
      turn: status === "aborted" ? "aborted" : status === "failed" ? "failed" : "completed",
    },
    model: {
      requested: "openai-codex/gpt-5.6-terra",
      provider: "openai-codex",
      model: "gpt-5.6-terra",
      layer: "one-shot",
      thinking: "xhigh",
    },
    outputRef: "agent://Worker",
    historyRef: "history://Worker",
    ...overrides,
  };
}

describe("shared task/hub renderers", () => {
  it("renders preparing/running flat calls with bounded redacted single-line assignments", () => {
    const args: TaskCallArgs = {
      name: "BUILD-06",
      agent: "aili.implementer",
      model: "openai-codex/gpt-5.6-terra",
      task: "first line\nsecond token=super-secret /home/rose/private/project/file",
    };
    const preparing = rendered(renderTaskCall(args, theme, context(args)));
    const running = rendered(renderTaskCall(args, theme, context(args, { executionStarted: true })));
    expect(preparing).toContain("TASK · BUILD-06 · aili.implementer · openai-codex/gpt-5.6-terra · preparing");
    expect(running).toContain("running");
    expect(preparing).not.toContain("super-secret");
    expect(preparing).not.toContain("/home/rose/private");
    expect(boundedDisplayText("inspect openspec/changes/change-id/formal-task-board.md")).toBe("inspect [redacted]");
    expect(preparing).not.toContain("\nsecond");
    expect(preparing).toContain("token=[redacted]");
    expect(preparing).toContain("[redacted]");
  });

  it("renders batch identity and every accepted terminal/nonterminal state without conflating the aggregate", () => {
    const args: TaskCallArgs = { tasks: [{ task: "one", agent: "aili.code-scout" }, { task: "two", agent: "aili.implementer" }] };
    expect(rendered(renderTaskCall(args, theme, context(args)))).toContain("batch 2 · preparing");
    const states = [
      ["accepted", { lifecycle: { agent: "queued", job: "queued", turn: "queued" } }, "queued"],
      ["accepted", { lifecycle: { agent: "running", job: "running", turn: "running" } }, "running"],
      ["completed", {}, "completed"],
      ["completed", { formalResultStatus: "partial" }, "partial"],
      ["failed", {}, "failed"],
      ["failed", { formalResultStatus: "blocked" }, "blocked"],
      ["aborted", {}, "cancelled"],
      ["failed", { formalResultStatus: "malformed" }, "malformed"],
    ] as const;
    for (const [status, override, expected] of states) {
      const details = { batch: false, results: [taskItem(status, override)] };
      expect(rendered(renderTaskResult(result(details), { expanded: false, isPartial: false }, theme, context({ task: "x" })))).toContain(expected);
    }
    const mixed = rendered(renderTaskResult(result({ batch: true, results: [taskItem("completed"), taskItem("failed", { agentId: "Worker-2" })] }), { expanded: false, isPartial: false }, theme, context(args)));
    expect(mixed).toContain("TASK · failed");
    expect(mixed).toContain("1. aili.implementer");
    expect(mixed).toContain("2. aili.implementer");
  });

  it("renders effective live identity instead of reconstructing the requested call", () => {
    const live = rendered(renderTaskResult(
      result({
        status: "running",
        name: "file-context-scout",
        selector: "aili.code-scout",
        requestedModel: "openai-codex/gpt-5.6-terra",
        effectiveModel: "openai-codex/gpt-5.6-sol",
        thinking: "high",
        modelSource: "inherited-parent",
        thinkingSource: "inherited-parent",
        agentId: "Scout",
        jobId: "job-1",
        turnId: "turn-1",
        lifecycle: { agent: "queued", job: "queued", turn: "queued" },
      }),
      { expanded: false, isPartial: true },
      theme,
      context({ task: "x" }),
    ));
    expect(live).toContain("file-context-scout · aili.code-scout · openai-codex/gpt-5.6-sol · high · running");
    expect(live).not.toContain("openai-codex/gpt-5.6-terra");
    const batch = rendered(renderTaskResult(
      result({
        status: "allocated",
        batch: true,
        results: [
          { status: "allocated", name: "one", selector: "aili.code-scout", effectiveModel: "provider/one", thinking: "low", lifecycle: { agent: "queued", job: "queued", turn: "queued" } },
          { status: "allocated", name: "two", selector: "aili.implementer", effectiveModel: "provider/two", thinking: "high", lifecycle: { agent: "queued", job: "queued", turn: "queued" } },
        ],
      }),
      { expanded: false, isPartial: true },
      theme,
      context({ task: "batch" }),
    ));
    expect(batch).toContain("batch 2");
    expect(batch).toContain("provider/one");
    expect(batch).toContain("provider/two");

    const expanded = rendered(renderTaskResult(
      result({ batch: false, results: [taskItem("completed", {
        name: "Scout",
        requestedThinking: "low",
        effectiveModel: "openai-codex/gpt-5.6-sol",
        modelSource: "inherited-parent",
        thinkingSource: "model-default",
      })] }),
      { expanded: true, isPartial: false },
      theme,
      context({ task: "x" }),
    ));
    expect(expanded).toContain("requested: openai-codex/gpt-5.6-terra");
    expect(expanded).toContain("requested thinking: low");
    expect(expanded).toContain("model source: inherited-parent");
    expect(expanded).toContain("thinking source: model-default");
  });

  it("shows expanded model, mode, ids and references from structured details", () => {
    const text = rendered(renderTaskResult(
      result({ batch: false, results: [taskItem("completed")] }),
      { expanded: true, isPartial: false },
      theme,
      context({ task: "x" }),
    ));
    for (const expected of [
      "requested: openai-codex/gpt-5.6-terra",
      "effective: openai-codex/gpt-5.6-terra",
      "layer: one-shot",
      "thinking: xhigh",
      "mode: sync",
      "agent: Worker",
      "job: job-1",
      "turn: turn-1",
      "output: agent://Worker",
      "history: history://Worker",
    ]) expect(text).toContain(expected);
  });

  it("renders all public hub actions with their target and bounded structured results", () => {
    const calls: HubCallArgs[] = [
      { action: "list" }, { action: "jobs", jobId: "job-1" }, { action: "wait", jobIds: ["job-1"] },
      { action: "send", agentId: "Worker" }, { action: "inbox", agentId: "Worker" },
      { action: "output", agentId: "Worker" }, { action: "history", agentId: "Worker" },
      { action: "cancel", id: "job-1" }, { action: "model", agentId: "Worker", model: "provider/model" },
    ];
    for (const args of calls) {
      const call = rendered(renderHubCall(args, theme, context(args)));
      expect(call).toContain(`HUB · ${args.action}`);
      if (args.agentId || args.jobId || args.id || args.jobIds?.[0]) {
        expect(call).toContain(args.agentId ?? args.jobId ?? args.id ?? args.jobIds![0]!);
      }
    }
    const hub = rendered(renderHubResult(
      result({ completed: true, jobs: [{ id: "job-1" }], agentId: "Worker", status: "completed" }),
      { expanded: true, isPartial: false },
      theme,
      context({ action: "wait", jobIds: ["job-1"] }),
    ));
    expect(hub).toContain("✓ HUB · wait");
    expect(hub).toContain("completed · agentId=Worker · jobs=1");
  });

  it("bounds Unicode display width and throws on malformed details so Pi can use fallback rendering", () => {
    for (const width of [0, 1, 2, 8, 24]) {
      expect(visibleWidth(boundedDisplayText("任务🚀任务🚀 token=secret", width))).toBeLessThanOrEqual(width);
    }
    expect(() => renderTaskCall({} as TaskCallArgs, theme, context({}))).toThrow(/malformed/);
    expect(() => renderTaskResult(result(undefined), { expanded: false, isPartial: false }, theme, context({ task: "x" }))).toThrow(/malformed/);
    expect(() => renderTaskResult(result({ batch: false, results: [{ status: "completed", lifecycle: {} }] }), { expanded: false, isPartial: false }, theme, context({ task: "x" }))).toThrow(/malformed/);
    expect(() => renderHubCall({} as HubCallArgs, theme, context({}))).toThrow(/malformed/);
    expect(() => renderHubResult(result(undefined), { expanded: false, isPartial: false }, theme, context({ action: "list" }))).toThrow(/malformed/);
  });

  it("exports one shared renderer pair for top-level and nested definitions", () => {
    expect(TASK_RENDERERS.renderCall).toBeDefined();
    expect(TASK_RENDERERS.renderResult).toBeDefined();
    expect(HUB_RENDERERS.renderCall).toBeDefined();
    expect(HUB_RENDERERS.renderResult).toBeDefined();
  });
});
