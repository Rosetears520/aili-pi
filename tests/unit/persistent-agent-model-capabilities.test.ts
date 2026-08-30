import { describe, expect, it } from "vitest";
import {
  appendSubagentModelCapabilities,
  isModelInEffectiveScope,
  parseCurrentTurnModelAuthority,
  renderSubagentModelCapabilities,
  type CurrentTurnModelCatalogEntry,
} from "../../src/runtime/persistent-agents/production.js";

const entries: CurrentTurnModelCatalogEntry[] = [
  { provider: "zai-coding-cn", model: "glm-5.3-flash", canonical: "zai-coding-cn/glm-5.3-flash", available: true, authenticated: true, thinkingLevels: ["off", "medium", "max"], defaultThinking: "medium", input: ["text", "image"] },
  { provider: "hidden", model: "no-auth", canonical: "hidden/no-auth", available: true, authenticated: false },
];

describe("subagent model capability projection", () => {
  it("keeps model authority separate from Parent-selected external CLI routing", () => {
    const authority = parseCurrentTurnModelAuthority("Use Claude Code for the subagent.", entries);
    expect(authority).toEqual({ mode: "inherit-only" });
    const text = renderSubagentModelCapabilities(entries, authority);
    expect(text).toContain("zai-coding-cn/glm-5.3-flash");
    expect(text).not.toContain("hidden/no-auth");
    expect(text).toContain("discovery only; not authorization");
    expect(text).toContain("External CLI routing: the Parent may select a registered cli value");
    expect(parseCurrentTurnModelAuthority("Use Agy CLI for the subagent.", entries)).toEqual({ mode: "inherit-only" });
    expect(parseCurrentTurnModelAuthority("用 agy 启动 gemini-3.7-flash", entries)).toEqual({ mode: "inherit-only" });
    expect(text).toContain("audio/video/ASR");
  });

  it("renders deterministically, bounds entries, and replaces only its own section", () => {
    const many = Array.from({ length: 70 }, (_, index): CurrentTurnModelCatalogEntry => ({
      provider: "p", model: `m-${String(70 - index).padStart(3, "0")}`, canonical: `p/m-${String(70 - index).padStart(3, "0")}`,
      available: true, authenticated: true, thinkingLevels: ["medium"], defaultThinking: "medium", input: ["text"],
    }));
    const section = renderSubagentModelCapabilities(many, { mode: "inherit-only" });
    expect(Buffer.byteLength(section, "utf8")).toBeLessThanOrEqual(16 * 1024 + 3);
    expect(section).toContain("6 model(s) omitted");
    expect(section.indexOf("p/m-001")).toBeLessThan(section.indexOf("p/m-002"));
    const once = appendSubagentModelCapabilities("base", section);
    expect(appendSubagentModelCapabilities(once, section).match(/AILI_SUBAGENT_CAPABILITIES_BEGIN/g)).toHaveLength(1);
  });

  it("uses the one exact scope predicate", () => {
    const scoped = { scopedModels: [{ model: { provider: "p", id: "one" } }] } as never;
    expect(isModelInEffectiveScope(scoped, "p", "one")).toBe(true);
    expect(isModelInEffectiveScope(scoped, "p", "two")).toBe(false);
    expect(isModelInEffectiveScope({ scopedModels: [] } as never, "p", "two")).toBe(true);
  });
});
