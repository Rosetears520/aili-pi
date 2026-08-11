import { describe, expect, it } from "vitest";
import {
  AILI_COMPACT_PROVIDER_SUFFIX,
  buildProviderSuffix,
  MAX_PROVIDER_SUFFIX_CHARS,
  MAX_PROVIDER_SUFFIX_TOKENS,
} from "../../src/runtime/aili-compact/provider-suffix.js";

const identity = "a".repeat(64);

describe("AILI Compact provider-only suffix", () => {
  it("omits normal/no-action state and narrow planning disablement", () => {
    const base = { planningEnabled: true, pressureStage: "NORMAL" as const, headroomSource: "fallback" as const,
      catalogId: identity, catalogScopeDigest: identity, safeRanges: [], allowedActions: [], checkpointState: "idle" };
    expect(buildProviderSuffix(base)).toBeUndefined();
    expect(buildProviderSuffix({ ...base, planningEnabled: false, pressureStage: "PRESSURE", allowedActions: ["compress"] })).toBeUndefined();
  });

  it("emits stable ordered bounded metadata without source text", () => {
    const result = buildProviderSuffix({
      planningEnabled: true, pressureStage: "PRESSURE", headroomTokens: 4096, headroomSource: "observed",
      catalogId: identity, catalogScopeDigest: "b".repeat(64),
      safeRanges: [{ rangeId: "r000002", startRef: "m000010", endRef: "m000020" }, { rangeId: "r000001", startRef: "m000001", endRef: "m000005" }],
      eligibleBlockRefs: ["b000002", "b000001"], allowedActions: ["checkpoint", "compress"], checkpointState: "idle",
    })!;
    expect(result.message).toMatchObject({ role: "custom", customType: AILI_COMPACT_PROVIDER_SUFFIX, display: false, timestamp: 0 });
    expect(result.content.indexOf("r000001")).toBeLessThan(result.content.indexOf("r000002"));
    expect(result.content).toContain("semantics=active-block");
    expect(result.content).not.toContain("targetTier");
    expect(result.content).not.toContain("raw source");
    expect(result.content.length).toBeLessThanOrEqual(MAX_PROVIDER_SUFFIX_CHARS);
    expect(result.estimatedTokens).toBeLessThanOrEqual(MAX_PROVIDER_SUFFIX_TOKENS);
    expect(buildProviderSuffix({
      planningEnabled: true, pressureStage: "PRESSURE", headroomTokens: 4096, headroomSource: "observed",
      catalogId: identity, catalogScopeDigest: "b".repeat(64), safeRanges: [], allowedActions: ["compress"], checkpointState: "idle",
    })?.fingerprint).toHaveLength(64);
  });

  it("drops optional refs deterministically before bounded status fallback", () => {
    const ranges = Array.from({ length: 1_000 }, (_, index) => ({
      rangeId: `r${String(index + 1).padStart(6, "0")}`,
      startRef: `m${String(index * 2 + 1).padStart(6, "0")}`,
      endRef: `m${String(index * 2 + 2).padStart(6, "0")}`,
    }));
    const result = buildProviderSuffix({ planningEnabled: true, pressureStage: "FORCE_SEMANTIC", headroomSource: "fallback",
      catalogId: identity, catalogScopeDigest: identity, safeRanges: ranges, allowedActions: ["compress"], checkpointState: "idle" })!;
    expect(result.content.length).toBeLessThanOrEqual(MAX_PROVIDER_SUFFIX_CHARS);
    expect(result.estimatedTokens).toBeLessThanOrEqual(MAX_PROVIDER_SUFFIX_TOKENS);
    expect(result.content).toContain("r000001");
    expect(result.content).not.toContain("r001000");
  });
});
