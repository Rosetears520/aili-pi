import { describe, expect, it } from "vitest";
import {
  CACHE_WINDOW_SIZE,
  cacheIdentity,
  cacheLabel,
  classifyCacheRequest,
  emptyCacheTelemetry,
  emptySessionCacheStats,
  recordCacheTelemetry,
  recordSessionCacheUsage,
  replaySessionCacheUsages,
  providerSurfaceIdentities,
  type CacheIdentityInput,
} from "../../src/runtime/aili-compact/cache.js";

function identity(overrides: Partial<CacheIdentityInput> = {}) {
  return cacheIdentity({
    providerId: "provider",
    modelId: "model",
    sessionId: "session",
    branchLeafId: "leaf",
    branchSourceDigest: "source",
    epochId: "epoch",
    projectionHash: "projection",
    guidanceFingerprint: "guidance",
    activeTools: [{
      name: "read",
      description: "Read a file",
      parameterSchema: { type: "object", properties: { path: { type: "string" } } },
      immutablePrompt: { snippet: "Read files", guidelines: ["Use exact paths"] },
    }],
    ...overrides,
  });
}

describe("AILI Compact cache identity", () => {
  it("is stable for equivalent key and active-tool ordering", () => {
    const tools = [
      { name: "write", description: "Write", parameterSchema: { required: ["path"], type: "object" }, immutablePrompt: ["safe"] },
      { name: "read", description: "Read", parameterSchema: { type: "object", required: ["path"] }, immutablePrompt: ["exact"] },
    ];
    expect(identity({ activeTools: tools })).toBe(identity({ activeTools: [...tools].reverse() }));
  });

  it.each([
    ["providerId", "other"], ["modelId", "other"], ["sessionId", "other"],
    ["branchLeafId", "other"], ["branchSourceDigest", "other"], ["epochId", "other"],
    ["projectionHash", "other"], ["guidanceFingerprint", "other"],
  ] as const)("changes when %s changes", (field, value) => {
    expect(identity({ [field]: value })).not.toBe(identity());
  });

  it("covers tool name, description, schema, and immutable prompt metadata", () => {
    const base = identity();
    const tool = {
      name: "read", description: "Read a file",
      parameterSchema: { type: "object", properties: { path: { type: "string" } } },
      immutablePrompt: { snippet: "Read files", guidelines: ["Use exact paths"] },
    };
    expect(identity({ activeTools: [{ ...tool, name: "get" }] })).not.toBe(base);
    expect(identity({ activeTools: [{ ...tool, description: "Get a file" }] })).not.toBe(base);
    expect(identity({ activeTools: [{ ...tool, parameterSchema: { type: "string" } }] })).not.toBe(base);
    expect(identity({ activeTools: [{ ...tool, immutablePrompt: ["changed"] }] })).not.toBe(base);
  });

  it("classifies against the immediately prior completed identity", () => {
    const current = identity();
    expect(classifyCacheRequest(undefined, current)).toBe("cold");
    expect(classifyCacheRequest(current, current)).toBe("warm-candidate");
    expect(classifyCacheRequest(identity({ epochId: "old" }), current)).toBe("state-change");
  });

  it("separates static, logical-prefix, suffix and full provider surfaces", () => {
    const base = {
      providerId: "provider", modelId: "model", staticSystemPrompt: "stable", immutableGuidance: { version: 1 },
      activeTools: [], logicalProviderMessages: [{ role: "user", content: "same" }],
      sessionId: "session", branchLeafId: "leaf", branchSourceDigest: "source", epochId: "epoch", projectionHash: "projection",
    };
    const first = providerSurfaceIdentities(base);
    const suffixChanged = providerSurfaceIdentities({ ...base, suffixContent: "pressure=PRESSURE" });
    expect(suffixChanged.staticSurfaceIdentity).toBe(first.staticSurfaceIdentity);
    expect(suffixChanged.logicalProviderPrefixIdentity).toBe(first.logicalProviderPrefixIdentity);
    expect(suffixChanged.suffixFingerprint).not.toBe(first.suffixFingerprint);
    expect(suffixChanged.fullProviderInputIdentity).not.toBe(first.fullProviderInputIdentity);

    const projectionChanged = providerSurfaceIdentities({ ...base, logicalProviderMessages: [{ role: "user", content: "changed" }] });
    expect(projectionChanged.staticSurfaceIdentity).toBe(first.staticSurfaceIdentity);
    expect(projectionChanged.logicalProviderPrefixIdentity).not.toBe(first.logicalProviderPrefixIdentity);
  });
});

describe("Pi Session cache totals", () => {
  it("replays persisted assistant usage and then updates incrementally", () => {
    const first = { input: 10, output: 5, cacheRead: 90, cacheWrite: 0 };
    const second = { input: 20, output: 10, cacheRead: 80, cacheWrite: 0 };
    const replayed = replaySessionCacheUsages([first, second, undefined]);
    let incremental = recordSessionCacheUsage(emptySessionCacheStats(), first);
    incremental = recordSessionCacheUsage(incremental, second);
    incremental = recordSessionCacheUsage(incremental, undefined);

    expect(replayed).toEqual(incremental);
    expect(replayed).toMatchObject({
      assistantResponses: 3,
      telemetryUnavailable: 1,
      input: 30,
      output: 15,
      cacheRead: 170,
      cacheWrite: 0,
      hitRate: 85,
    });
  });

  it("does not synthesize missing cache fields", () => {
    const stats = recordSessionCacheUsage(emptySessionCacheStats(), { input: 10, output: 2, cacheRead: 5 });
    expect(stats).toEqual({
      assistantResponses: 1,
      telemetryUnavailable: 1,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });
});

describe("AILI Compact cache telemetry", () => {
  it("requires five warm samples and uses the exact prompt-token formula", () => {
    let telemetry = emptyCacheTelemetry();
    telemetry = recordCacheTelemetry(telemetry, { input: 900, cacheRead: 0, cacheWrite: 0 }, false, "cold");
    for (let index = 0; index < 4; index += 1) {
      telemetry = recordCacheTelemetry(telemetry, { input: 10, cacheRead: 85, cacheWrite: 5 }, true, undefined);
    }
    expect(telemetry.ineligibleCold).toBe(1);
    expect(telemetry.hitRate).toBeUndefined();
    expect(cacheLabel(telemetry)).toBe("cache: insufficient sample (4/5)");
    telemetry = recordCacheTelemetry(telemetry, { input: 10, cacheRead: 85, cacheWrite: 5 }, true, undefined);
    expect(telemetry.hitRate).toBe(85);
    expect(cacheLabel(telemetry)).toContain("OK");
  });

  it("requires both cache fields and a nonzero prompt-token total", () => {
    let telemetry = emptyCacheTelemetry();
    telemetry = recordCacheTelemetry(telemetry, { input: 10, cacheRead: 5 }, true, undefined);
    telemetry = recordCacheTelemetry(telemetry, { input: 0, cacheRead: 0, cacheWrite: 0 }, true, undefined);
    expect(telemetry.unavailable).toBe(2);
    expect(telemetry.eligible).toBe(0);
  });

  it("keeps exactly the last twenty eligible responses", () => {
    let telemetry = emptyCacheTelemetry();
    for (let index = 0; index < CACHE_WINDOW_SIZE + 1; index += 1) {
      telemetry = recordCacheTelemetry(telemetry, { input: index === 0 ? 100 : 0, cacheRead: 90, cacheWrite: 10 }, true, undefined);
    }
    expect(telemetry.eligible).toBe(21);
    expect(telemetry.window).toHaveLength(20);
    expect(telemetry.input).toBe(0);
    expect(telemetry.hitRate).toBe(90);
  });

  it("counts cold, state changes, and unavailable responses separately", () => {
    let telemetry = emptyCacheTelemetry();
    telemetry = recordCacheTelemetry(telemetry, undefined, false, "cold");
    telemetry = recordCacheTelemetry(telemetry, undefined, false, "state-change");
    telemetry = recordCacheTelemetry(telemetry, undefined, true, "missing-telemetry");
    expect(telemetry).toMatchObject({ ineligibleCold: 1, ineligibleStateChange: 1, unavailable: 1, eligible: 0 });
  });
});
