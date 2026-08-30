import { describe, expect, it } from "vitest";
import { captureTaskModelRequest, ContextModelCatalog, parseCurrentTurnModelAuthority, type CurrentTurnModelCatalog, type CurrentTurnModelCatalogEntry } from "../../src/runtime/persistent-agents/production.js";
import { resolveModelChoice } from "../../src/runtime/persistent-agents/model-selection.js";

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

  it("captures explicit English and Chinese model/thinking directives with an exact named-selector scope", () => {
    expect(parseCurrentTurnModelAuthority("Use Terra medium for the code-scout worker.", catalog)).toMatchObject({
      mode: "explicit",
      allowedModels: ["openai-codex/gpt-5.6-terra"],
      allowedThinking: ["medium"],
      allowedSelectors: ["aili.code-scout"],
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

  it("does not make an exact extended model id ambiguous with its shorter prefix", () => {
    const overlappingCatalog: CurrentTurnModelCatalogEntry[] = [
      ...catalog,
      {
        provider: "openai-codex",
        model: "gpt-5.6-sol-new",
        canonical: "openai-codex/gpt-5.6-sol-new",
        available: true,
        authenticated: true,
        thinkingLevels: ["low", "medium", "high"],
      },
    ];
    expect(parseCurrentTurnModelAuthority("Use openai-codex/gpt-5.6-sol-new for the subagent.", overlappingCatalog)).toEqual({
      mode: "explicit",
      allowedModels: ["openai-codex/gpt-5.6-sol-new"],
    });
  });

  it("keeps an exact unavailable canonical request explicit so catalog resolution can fail strictly", () => {
    expect(parseCurrentTurnModelAuthority("Use other/missing for the subagent.", catalog)).toEqual({
      mode: "explicit",
      allowedModels: ["other/missing"],
    });
  });

  it("fails closed for an unavailable bare name, ambiguous, or negated model reference", () => {
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

  it("rejects a value-authorized request when its selector is outside the user-named scope", () => {
    const authority = {
      mode: "explicit" as const,
      allowedModels: ["openai-codex/gpt-5.6-terra"],
      allowedSelectors: ["aili.code-scout"],
    };
    const mismatch = captureTaskModelRequest(item({ model: "Terra" }), authority, fakeCatalog);
    expect(mismatch).toMatchObject({ outcome: "rejected" });
    if (mismatch.outcome === "rejected") expect(mismatch.reason).toMatch(/outside that scope/);
    expect(captureTaskModelRequest(item({ agent: "aili.code-scout", model: "Terra" }), authority, fakeCatalog)).toEqual({
      outcome: "captured",
      request: { model: "openai-codex/gpt-5.6-terra" },
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

describe("isolated child model-default thinking", () => {
  it("derives the default from the registry model alone; parent/project settings never leak into it", async () => {
    const model = {
      id: "glm-5.3",
      name: "GLM 5.3",
      provider: "zai-coding-cn",
      reasoning: true,
      input: ["text", "image"],
      thinkingLevelMap: { off: "off", low: "low", medium: "medium", high: "high", xhigh: "xhigh" },
    };
    // The fake context carries file-backed-looking parent and project settings
    // that prefer xhigh. The isolated-child default must ignore them: Pi's
    // persistent children run on an empty in-memory SettingsManager, so the
    // default is exactly medium clamped to the target model.
    const context = {
      scopedModels: [],
      model: { ...model, thinking: "xhigh" },
      settings: {
        "agent.thinking": "xhigh",
        "model.thinking": "xhigh",
        "defaultThinking": "xhigh",
      },
      modelRegistry: {
        getAll: () => [model],
        getAvailable: () => [model],
        hasConfiguredAuth: () => true,
        find: (provider: string, id: string) => (provider === model.provider && id === model.id ? model : undefined),
      },
    } as never;
    const catalog = new ContextModelCatalog(context);
    const entry = catalog.enumerate().find((candidate) => candidate.canonical === "zai-coding-cn/glm-5.3")!;
    expect(entry).toMatchObject({ available: true, authenticated: true, defaultThinking: "medium" });
    expect(entry.defaultThinking).not.toBe("xhigh");

    // The same boundary holds for the resolver: an omitted thinking with no
    // explicit authority yields the model default, never a parent setting.
    const choice = await resolveModelChoice({ selector: "aili.code-scout", agentId: "Worker", projectTrusted: false }, catalog);
    expect(choice).toMatchObject({ canonical: "zai-coding-cn/glm-5.3", thinking: "medium", thinkingSource: "model-default" });
  });
});
