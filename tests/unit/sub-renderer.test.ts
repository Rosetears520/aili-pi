import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  SUB_RENDERERS,
  boundedDisplayText,
  renderSubCall,
  renderSubResult,
  type RendererTheme,
  type SubCallArgs,
} from "../../src/runtime/persistent-agents/sub-renderer.js";

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
    taskId: "Worker",
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

describe("shared sub renderers", () => {
  it("renders preparing/running calls with continuation, model, background, and bounded redacted prompt text", () => {
    const args: SubCallArgs = {
      description: "BUILD-06",
      prompt: "first line\nsecond token=super-secret /home/rose/private/project/file",
      subagent_type: "aili.implementer",
      model: "openai-codex/gpt-5.6-terra",
    };
    const preparing = rendered(renderSubCall(args, theme, context(args)));
    const running = rendered(renderSubCall(args, theme, context(args, { executionStarted: true })));
    expect(preparing).toContain("SUB · BUILD-06 · aili.implementer · openai-codex/gpt-5.6-terra · preparing");
    expect(running).toContain("running");
    expect(preparing).not.toContain("super-secret");
    expect(preparing).not.toContain("/home/rose/private");
    expect(boundedDisplayText("inspect openspec/changes/change-id/formal-task-board.md")).toBe("inspect [redacted]");
    expect(preparing).not.toContain("\nsecond");
    expect(preparing).toContain("token=[redacted]");
    expect(preparing).toContain("[redacted]");

    const continuation = rendered(renderSubCall(
      { description: "continue", prompt: "next turn", task_id: "Worker", thinking: "high" },
      theme,
      context({ description: "continue", prompt: "next turn", task_id: "Worker", thinking: "high" }),
    ));
    expect(continuation).toContain("continue Worker · continue · high · preparing");

    const background = rendered(renderSubCall(
      { description: "parallel", prompt: "work", subagent_type: "general", background: true },
      theme,
      context({ description: "parallel", prompt: "work", subagent_type: "general", background: true }, { executionStarted: true }),
    ));
    expect(background).toContain("SUB · parallel · general · background · running");
  });

  it("labels external vendor model and thinking separately without changing model suffixes", () => {
    const args: SubCallArgs = {
      description: "vendor turn",
      prompt: "work",
      subagent_type: "aili.code-reviewer",
      cli: "codex-cli",
      selectionScope: "release-42",
      model: "vendor-model-high",
      thinking: "high",
    };
    const call = rendered(renderSubCall(args, theme, context(args)));
    const normalizedCall = call.replace(/\s+/g, " ");
    expect(normalizedCall).toContain("external CLI: codex-cli");
    expect(normalizedCall).toContain("scope: release-42");
    expect(normalizedCall).toContain("vendor model: vendor-model-high");
    expect(normalizedCall).toContain("vendor thinking: high");

    const output = rendered(renderSubResult(
      result({ batch: false, results: [taskItem("completed", {
        driver: "external-cli",
        evidence: { externalCli: "codex-cli", vendorModel: "vendor-model-high", vendorThinking: "high" },
      })] }),
      { expanded: true, isPartial: false },
      theme,
      context(args),
    ));
    expect(output).toContain("vendor model: vendor-model-high");
    expect(output).toContain("vendor thinking: high");
    expect(output).toContain("Unverified");
  });

  it("renders every accepted terminal/nonterminal state without conflating the aggregate", () => {
    const states = [
      ["accepted", { lifecycle: { agent: "queued", job: "queued", turn: "queued" } }, "queued"],
      ["accepted", { lifecycle: { agent: "running", job: "running", turn: "running" } }, "running"],
      ["completed", {}, "completed"],
      ["completed", { formalResultStatus: "partial" }, "partial"],
      ["completed", { result: "partial" }, "partial"],
      ["failed", {}, "failed"],
      ["failed", { formalResultStatus: "blocked" }, "blocked"],
      ["aborted", {}, "cancelled"],
      ["failed", { formalResultStatus: "malformed" }, "malformed"],
    ] as const;
    for (const [status, override, expected] of states) {
      const details = { batch: false, results: [taskItem(status, override)] };
      expect(rendered(renderSubResult(result(details), { expanded: false, isPartial: false }, theme, context({ prompt: "x" })))).toContain(expected);
    }
    const mixed = rendered(renderSubResult(result({ batch: true, results: [taskItem("completed"), taskItem("failed", { agentId: "Worker-2" })] }), { expanded: false, isPartial: false }, theme, context({ prompt: "x" })));
    expect(mixed).toContain("SUB · failed");
    expect(mixed).toContain("1. aili.implementer");
    expect(mixed).toContain("2. aili.implementer");
  });

  it("renders effective live identity instead of reconstructing the requested call", () => {
    const live = rendered(renderSubResult(
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
      context({ prompt: "x" }),
    ));
    expect(live).toContain("file-context-scout · aili.code-scout · openai-codex/gpt-5.6-sol · high · running");
    expect(live).not.toContain("openai-codex/gpt-5.6-terra");

    const expanded = rendered(renderSubResult(
      result({ batch: false, results: [taskItem("completed", {
        name: "Scout",
        requestedThinking: "low",
        effectiveModel: "openai-codex/gpt-5.6-sol",
        modelSource: "inherited-parent",
        thinkingSource: "model-default",
      })] }),
      { expanded: true, isPartial: false },
      theme,
      context({ prompt: "x" }),
    ));
    expect(expanded).toContain("requested: openai-codex/gpt-5.6-terra");
    expect(expanded).toContain("requested thinking: low");
    expect(expanded).toContain("model source: inherited-parent");
    expect(expanded).toContain("thinking source: model-default");
  });

  it("shows expanded model, mode, ids and references from structured details", () => {
    const text = rendered(renderSubResult(
      result({ batch: false, results: [taskItem("completed")] }),
      { expanded: true, isPartial: false },
      theme,
      context({ prompt: "x" }),
    ));
    for (const expected of [
      "requested: openai-codex/gpt-5.6-terra",
      "effective: openai-codex/gpt-5.6-terra",
      "layer: one-shot",
      "thinking: xhigh",
      "mode: sync",
      "task: Worker",
      "agent: Worker",
      "job: job-1",
      "turn: turn-1",
      "output: agent://Worker",
      "history: history://Worker",
    ]) expect(text).toContain(expected);
  });

  it("bounds Unicode display width and throws on malformed details so Pi can use fallback rendering", () => {
    for (const width of [0, 1, 2, 8, 24]) {
      expect(visibleWidth(boundedDisplayText("任务🚀任务🚀 token=secret", width))).toBeLessThanOrEqual(width);
    }
    expect(() => renderSubCall({} as SubCallArgs, theme, context({}))).toThrow(/malformed/);
    expect(() => renderSubResult(result(undefined), { expanded: false, isPartial: false }, theme, context({ prompt: "x" }))).toThrow(/malformed/);
    expect(() => renderSubResult(result({ batch: false, results: [{ status: "completed", lifecycle: {} }] }), { expanded: false, isPartial: false }, theme, context({ prompt: "x" }))).toThrow(/malformed/);
  });

  it("exports one shared renderer pair for top-level and nested definitions", () => {
    expect(SUB_RENDERERS.renderCall).toBeDefined();
    expect(SUB_RENDERERS.renderResult).toBeDefined();
  });
});
