import { describe, expect, it } from "vitest";
import { captureTaskModelRequest, parseCurrentTurnModelAuthority, type CurrentTurnModelCatalog, type CurrentTurnModelCatalogEntry } from "../../src/runtime/persistent-agents/production.js";

const catalog: CurrentTurnModelCatalogEntry[] = [
  {
    provider: "openai-codex",
    model: "gpt-5.6-terra",
    canonical: "openai-codex/gpt-5.6-terra",
    aliases: ["Terra"],
    available: true,
    authenticated: true,
    thinkingLevels: ["low", "medium", "high"],
  },
  {
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    canonical: "openai-codex/gpt-5.6-sol",
    aliases: ["Sol"],
    available: true,
    authenticated: true,
    thinkingLevels: ["low", "medium", "high"],
  },
];

describe("current-turn model authority capture", () => {
  it("defaults ordinary delegation to direct-parent inheritance", () => {
    expect(parseCurrentTurnModelAuthority("开个 code-scout 看一下", catalog)).toEqual({ mode: "inherit-only" });
  });

  it("captures explicit English and Chinese model/thinking directives", () => {
    expect(parseCurrentTurnModelAuthority("Use Terra medium for the code-scout worker.", catalog)).toMatchObject({
      mode: "explicit",
      allowedModels: ["openai-codex/gpt-5.6-terra"],
      allowedThinking: ["medium"],
    });
    expect(parseCurrentTurnModelAuthority("用 Terra medium 开一个 code-scout。", catalog)).toMatchObject({
      mode: "explicit",
      allowedModels: ["openai-codex/gpt-5.6-terra"],
      allowedThinking: ["medium"],
    });
  });

  it("captures explicit delegated model choice without opening thinking override", () => {
    expect(parseCurrentTurnModelAuthority("这轮 subagent 的模型你自己根据任务决定。", catalog)).toMatchObject({
      mode: "delegated-choice",
      thinkingMode: "inherit",
    });
    expect(parseCurrentTurnModelAuthority("Do not let the system choose the worker model.", catalog)).toEqual({ mode: "inherit-only" });
  });

  it("fails closed for an unavailable, ambiguous, or negated model reference", () => {
    expect(parseCurrentTurnModelAuthority("Use Unknown medium for the worker.", catalog)).toEqual({ mode: "inherit-only" });
    expect(parseCurrentTurnModelAuthority("Use Terra or Sol for the worker.", catalog)).toEqual({ mode: "inherit-only" });
    expect(parseCurrentTurnModelAuthority("Do not use Terra for the worker.", catalog)).toEqual({ mode: "inherit-only" });
  });
});

describe("structured task model request capture", () => {
  const fakeCatalog: CurrentTurnModelCatalog = { enumerate: () => catalog };
  const item = (extra: Record<string, unknown> = {}) => ({
    task: "work",
    agent: "general",
    workspace: "auto",
    writeScope: { paths: [], resources: [] },
    ...extra,
  }) as Parameters<typeof captureTaskModelRequest>[0];

  it("returns absent when the task carries no model or thinking request", () => {
    expect(captureTaskModelRequest(item(), { mode: "inherit-only" }, fakeCatalog)).toEqual({ outcome: "absent" });
  });

  it("captures syntactic requests under inherit-only for one fresh confirmation", () => {
    expect(captureTaskModelRequest(item({ model: "openai-codex/gpt-5.6-terra", thinking: "high" }), { mode: "inherit-only" }, fakeCatalog)).toEqual({
      outcome: "captured",
      request: { model: "openai-codex/gpt-5.6-terra", thinking: "high" },
    });
    expect(captureTaskModelRequest(item({ thinking: "high" }), { mode: "inherit-only" }, fakeCatalog)).toEqual({
      outcome: "captured",
      request: { thinking: "high" },
    });
  });

  it("captures authority-authorized requests with canonicalized aliases", () => {
    const authority = { mode: "explicit" as const, allowedModels: ["openai-codex/gpt-5.6-terra"], allowedThinking: ["medium" as const] };
    expect(captureTaskModelRequest(item({ model: "Terra", thinking: "medium" }), authority, fakeCatalog)).toEqual({
      outcome: "captured",
      request: { model: "openai-codex/gpt-5.6-terra", thinking: "medium" },
    });
  });

  it("rejects unauthorized, malformed, and thinking-only-out-of-allowance requests with a reason instead of dropping them", () => {
    const authority = { mode: "explicit" as const, allowedModels: ["openai-codex/gpt-5.6-terra"], allowedThinking: ["medium" as const] };
    const unauthorized = captureTaskModelRequest(item({ model: "openai-codex/gpt-5.6-sol" }), authority, fakeCatalog);
    expect(unauthorized.outcome).toBe("rejected");
    if (unauthorized.outcome === "rejected") expect(unauthorized.reason.length).toBeGreaterThan(0);

    const malformed = captureTaskModelRequest(item({ model: "not a/model!" }), { mode: "inherit-only" }, fakeCatalog);
    expect(malformed.outcome).toBe("rejected");

    const thinking = captureTaskModelRequest(item({ thinking: "high" }), authority, fakeCatalog);
    expect(thinking.outcome).toBe("rejected");
  });
});
