import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const {
  AGENT_DISPATCH_TOOL_NAMES,
  agentDispatchPreview,
  agentDispatchResultIdentities,
  agentDispatchRow,
  agentLiveProgress,
  hubCallSummary,
  hubResultRows,
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
    lifecycle: { agent: "idle", job: "completed", turn: "completed" },
    modelDecision: { overrideDecision: "auto-approved-bypass" },
    outputRef: "agent://Reviewer",
    historyRef: "history://Reviewer",
  }],
};

test("dispatch tool names include the rename and the legacy name", () => {
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("sub"), true);
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("task"), true);
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("formal_task"), true);
  assert.equal(AGENT_DISPATCH_TOOL_NAMES.has("hub"), false);
});

test("preview falls back to call arguments while running", () => {
  const preview = agentDispatchPreview({ task: "review", agent: "aili.code-reviewer", model: "openai-codex/gpt-5.6-terra", thinking: "high", async: false }, undefined);
  assert.equal(preview, "aili.code-reviewer · aili.code-reviewer · openai-codex/gpt-5.6-terra · thinking=high · running");
});

test("preview renders the identity row from result details", () => {
  const preview = agentDispatchPreview({ task: "review" }, RESULT_DETAILS);
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

test("hub call summary and result rows", () => {
  assert.equal(hubCallSummary({ action: "send", agentId: "Reviewer", message: "hi" }), "send · Reviewer");
  assert.equal(hubCallSummary({}), null);
  const rows = hubResultRows({ status: "delivered", messageId: "m-1", messages: [1, 2] });
  assert.ok(rows.includes("status: delivered"));
  assert.ok(rows.includes("messages: 2"));
});
