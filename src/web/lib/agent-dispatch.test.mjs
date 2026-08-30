import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  AGENT_DISPATCH_TOOL_NAMES,
  agentDispatchCallIdentity,
  agentDispatchPreview,
  agentDispatchResultIdentities,
  agentDispatchRow,
  agentLiveProgress,
} = await jiti.import("./agent-dispatch.ts");

const RESULT_DETAILS = {
  batch: false,
  results: [{
    status: "completed",
    agentId: "Reviewer",
    jobId: "job-1",
    turnId: "turn-1",
    selector: "aili.code-reviewer",
    name: "Reviewer",
    requestedModel: "openai-codex/gpt-5.6-terra",
    requestedThinking: "high",
    effectiveModel: "openai-codex/gpt-5.6-terra",
    thinking: "high",
    modelLayer: "one-shot",
    modelSource: "user-one-shot",
    thinkingSource: "user-one-shot",
    effectiveModeReason: "requested-sync",
    backend: "herdr",
    driver: "pi-cli",
    runId: "run-1",
    controlMode: "aili",
    pendingInteractions: 1,
    activity: { state: "active", since: "2026-08-28T00:00:00.000Z" },
    surface: { workspace: "w1", tab: "t1", pane: "p1" },
    lifecycle: { agent: "idle", job: "completed", turn: "completed" },
    modelDecision: { overrideDecision: "auto-approved-bypass" },
    outputRef: "agent://Reviewer",
    historyRef: "history://Reviewer",
  }],
};

test("dispatch tool names cover sub only", () => {
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("sub"), true);
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("task"), false);
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("formal_task"), false);
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("hub"), false);
});

test("preview falls back to call arguments while running", () => {
  const preview = agentDispatchPreview({ description: "review", prompt: "review the diff", subagent_type: "aili.code-reviewer", model: "openai-codex/gpt-5.6-terra", thinking: "high", background: true }, undefined);
  assert.equal(preview, "review · aili.code-reviewer · openai-codex/gpt-5.6-terra · thinking=high · running · background");
});

test("preview marks task_id continuations", () => {
  const preview = agentDispatchPreview({ task_id: "task-7", description: "review", subagent_type: "aili.code-reviewer" }, undefined);
  assert.equal(preview, "continue task-7 · aili.code-reviewer · running");
});

test("preview renders the identity row from result details", () => {
  const preview = agentDispatchPreview({ description: "review" }, RESULT_DETAILS);
  assert.equal(preview, "Reviewer · aili.code-reviewer · openai-codex/gpt-5.6-terra · thinking=high · completed");
});

test("preview aggregates batches", () => {
  const details = { results: RESULT_DETAILS.results.concat([{ ...RESULT_DETAILS.results[0], status: "failed" }]) };
  assert.equal(agentDispatchPreview({}, details), "batch 2 · partial");
  const uniform = { results: RESULT_DETAILS.results.concat([RESULT_DETAILS.results[0]]) };
  assert.equal(agentDispatchPreview({}, uniform), "batch 2 · completed");
});

test("expanded rows carry model provenance and the override decision", () => {
  const identities = agentDispatchResultIdentities(RESULT_DETAILS);
  assert.equal(identities.length, 1);
  const rows = identities[0].rows;
  assert.ok(rows.some(([label, value]) => label === "requested" && value === "openai-codex/gpt-5.6-terra · thinking=high"));
  assert.ok(rows.some(([label, value]) => label === "override decision" && value === "auto-approved-bypass"));
  assert.ok(rows.some(([label, value]) => label === "lifecycle" && value === "idle / completed / completed"));
  assert.ok(rows.some(([label]) => label === "output"));
  assert.ok(rows.some(([label, value]) => label === "backend" && value === "herdr"));
  assert.ok(rows.some(([label, value]) => label === "activity" && value.startsWith("active")));
  assert.ok(rows.some(([label, value]) => label === "surface" && value === "w1 / t1 / p1"));
  assert.equal(agentDispatchRow(identities[0]).endsWith("completed"), true);
});

test("live progress prefers the structured snapshot over raw JSON", () => {
  const live = agentLiveProgress({
    status: "running",
    name: "Reviewer",
    selector: "aili.code-reviewer",
    effectiveModel: "openai-codex/gpt-5.6-terra",
    thinking: "high",
    content: [{ type: "text", text: "{\"status\":\"running\"}" }],
  });
  assert.equal(live, "Reviewer · aili.code-reviewer · openai-codex/gpt-5.6-terra · thinking=high · running");
  assert.equal(agentLiveProgress({ batch: true, status: "running", results: [{}, {}] }), "batch 2 · running");
  assert.equal(agentLiveProgress(undefined), null);
});
