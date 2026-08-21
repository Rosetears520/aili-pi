import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

register(new URL("../aicss/module-css-stub.mjs", import.meta.url));

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { AiliAgentResultCard } = await jiti.import("./AiliAgentResultCard.tsx");
const { I18nProvider } = await jiti.import("../../hooks/useI18n.tsx");

function renderCard(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(AiliAgentResultCard, props)),
  );
}

test("renders the agent identity row with model provenance", () => {
  const html = renderCard({
    content: "Agent Reviewer · aili.code-reviewer · job job-1.\nFull output: agent://Reviewer\nPreview:\nbounded preview text",
    details: {
      deliveryId: "d-1",
      agentId: "Reviewer",
      jobId: "job-1",
      turnId: "turn-1",
      status: "completed",
      selector: "aili.code-reviewer",
      name: "Reviewer",
      requestedModel: "openai-codex/gpt-5.6-terra",
      requestedThinking: "high",
      effectiveModel: "openai-codex/gpt-5.6-terra",
      thinking: "high",
      modelSource: "user-one-shot",
      outputRef: "agent://Reviewer",
      historyRef: "history://Reviewer",
    },
  });
  assert.match(html, /AGENT/);
  assert.match(html, /Reviewer · aili\.code-reviewer · openai-codex\/gpt-5\.6-terra · thinking=high · completed/);
  assert.match(html, /model source/);
  assert.match(html, /user-one-shot/);
  assert.match(html, /agent:\/\/Reviewer/);
  // The preview stays behind its disclosure until requested.
  assert.doesNotMatch(html, /bounded preview text/);
  assert.match(html, /preview/);
});

test("renders without details as nothing (falls back to the generic view upstream)", () => {
  assert.equal(renderCard({ content: "plain" }), "");
});
