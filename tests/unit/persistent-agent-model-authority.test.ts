import { describe, expect, it } from "vitest";
import { parseCurrentTurnModelAuthority, type CurrentTurnModelCatalogEntry } from "../../src/runtime/persistent-agents/production.js";

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
