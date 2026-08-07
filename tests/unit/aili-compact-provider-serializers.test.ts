import { describe, expect, it } from "vitest";
import { convertMessages as convertOpenAiMessages } from "@earendil-works/pi-ai/api/openai-completions";
import { convertResponsesMessages } from "@earendil-works/pi-ai/api/openai-responses-shared";
import { stream as streamAnthropic } from "@earendil-works/pi-ai/api/anthropic-messages";
import { convertMessages as convertGoogleMessages } from "@earendil-works/pi-ai/api/google-shared";
import type { Context } from "@earendil-works/pi-ai";
import { sourceDigest, type CompactState, type SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { alignEntriesToMessages, projectMessages } from "../../src/runtime/aili-compact/projector.js";

const RAW_SOURCE = "RAW_SOURCE_SENTINEL";
const VISIBLE_SUMMARY = "VISIBLE_SUMMARY";
const TX_DETAILS = "TX_DETAILS_SENTINEL";
const DIAGNOSTIC = "DIAGNOSTIC_SENTINEL";
const PROMPT_SNAPSHOT = "PROMPT_SNAPSHOT_SENTINEL";
const TOOL_RESULT = "VISIBLE_TOOL_RESULT";

function projectedContext(): Context {
  const entries: SessionLikeEntry[] = [
    { id: "user", type: "message", message: { role: "user", content: "VISIBLE_USER", timestamp: 1 } },
    {
      id: "raw",
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: RAW_SOURCE }],
        api: "openai-completions",
        provider: "openai",
        model: "test",
        diagnostics: [{ message: DIAGNOSTIC }],
        usage: usage(),
        stopReason: "stop",
        timestamp: 2,
      },
    },
    {
      id: "tool-call",
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "offline-tool-call", name: "read", arguments: { path: "fixture.txt" } }],
        timestamp: 3,
      },
    },
    {
      id: "tool-result",
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "offline-tool-call",
        toolName: "read",
        content: [{ type: "text", text: TOOL_RESULT }],
        timestamp: 4,
      },
    },
  ];
  const messages = entries.map((entry) => entry.message as Record<string, unknown>);
  const state: CompactState = {
    epochId: "root",
    enabled: true,
    autoCooling: true,
    manualMode: false,
    cachePanel: false,
    hasSessionControl: false,
    hasAutoCoolingControl: false,
    hasManualControl: false,
    hasPanelControl: false,
    blocks: new Map([["block", {
      id: "block",
      kind: "semantic",
      epochId: "root",
      sourceEntryIds: ["raw"],
      sourceDigest: sourceDigest(entries, ["raw"]),
      summary: VISIBLE_SUMMARY,
      active: true,
      mode: "message",
      topic: "Fixture",
      batchTopic: "Fixture",
      anchorEntryId: "raw",
      runId: "fixture",
      childBlockIds: [],
      generation: "young",
      survivedCount: 0,
      age: 0,
    }]]),
    policyDecisions: [],
    diagnostics: [],
  };
  const alignment = alignEntriesToMessages(entries, messages);
  const projected = projectMessages(messages, state, alignment.byEntryId);
  expect(projected.diagnostic).toBeUndefined();
  expect(JSON.stringify(projected.messages)).not.toContain(RAW_SOURCE);

  const providerMessages: Record<string, unknown>[] = projected.messages.map((message, index) => {
    if (message.role === "assistant") {
      return {
        ...message,
        api: "openai-completions",
        provider: "openai",
        model: "test",
        diagnostics: [{ message: DIAGNOSTIC }],
        usage: usage(),
        stopReason: "stop",
        timestamp: index + 10,
      };
    }
    if (message.role === "toolResult") {
      return { ...message, details: { contextTx: TX_DETAILS }, timestamp: index + 10 };
    }
    return { ...message, timestamp: index + 10 };
  });
  return { messages: providerMessages, tools: [], promptSnapshot: PROMPT_SNAPSHOT } as unknown as Context;
}

function usage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function assertNoMetadataLeak(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  expect(serialized).toContain("VISIBLE_USER");
  expect(serialized).toContain(VISIBLE_SUMMARY);
  expect(serialized).toContain(TOOL_RESULT);
  expect(serialized).not.toContain(RAW_SOURCE);
  expect(serialized).not.toContain(TX_DETAILS);
  expect(serialized).not.toContain(DIAGNOSTIC);
  expect(serialized).not.toContain(PROMPT_SNAPSHOT);
}

function model(api: string, provider: string, id: string) {
  return {
    id,
    name: id,
    api,
    provider,
    baseUrl: "https://invalid.local",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 4_096,
  } as any;
}

describe("AILI Compact provider serializer boundary", () => {
  it("keeps Pi-only details and diagnostics out of OpenAI chat completions", () => {
    const payload = convertOpenAiMessages(model("openai-completions", "openai", "gpt-4o-mini"), projectedContext(), {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsReasoningSummary: false,
      supportsVerbosity: false,
      supportsServiceTier: false,
      supportsStrictMode: false,
      supportsStore: false,
      supportsCacheControl: false,
      requiresAssistantAfterToolResult: false,
      requiresThinkingAsText: false,
      requiresReasoningContentOnAssistantMessages: false,
      requiresToolResultName: false,
      maxTokensField: "max_tokens",
      deferredToolsMode: undefined,
    } as any);
    assertNoMetadataLeak(payload);
  });

  it("keeps Pi-only details and diagnostics out of OpenAI Responses", () => {
    const payload = convertResponsesMessages(model("openai-responses", "openai", "gpt-4o-mini"), projectedContext(), new Set(["openai"]));
    assertNoMetadataLeak(payload);
  });

  it("keeps Pi-only details and diagnostics out of Gemini content", () => {
    const payload = convertGoogleMessages(model("google-generative-ai", "google", "gemini-2.5-flash"), projectedContext());
    assertNoMetadataLeak(payload);
  });

  it("keeps Pi-only details and diagnostics out of Anthropic payloads without a network request", async () => {
    let resolvePayload!: (payload: unknown) => void;
    const captured = new Promise<unknown>((resolve) => { resolvePayload = resolve; });
    streamAnthropic(model("anthropic-messages", "anthropic", "claude-sonnet-4-20250514"), projectedContext(), {
      client: {
        messages: {
          create() {
            throw new Error("fixture-stop-after-payload");
          },
        },
      } as any,
      onPayload(payload) {
        resolvePayload(payload);
        return payload;
      },
    });
    assertNoMetadataLeak(await captured);
  });
});
