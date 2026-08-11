import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendCompactPromptGuidance,
  DEFAULT_COMPACT_CONFIG,
  loadCompactConfigResult,
  loadCompactPromptSnapshot,
  resolveCompactConfig,
  resolveCompactConfigResult,
} from "../../src/runtime/aili-compact/config.js";
import { applyCompactConfig } from "../../src/runtime/aili-compact/index.js";
import { reduceCompactState } from "../../src/runtime/aili-compact/reducer.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("AILI Compact configuration", () => {
  it("applies global < project deep precedence and exact defaults", () => {
    const config = resolveCompactConfig(
      {
        enabled: false,
        protection: { tools: ["read", "read"], recentUserMessages: 4 },
        nudges: { minContextPercent: 40 },
        experimental: { customPrompts: true },
      },
      {
        autoCooling: false,
        protection: { tools: ["write"] },
        nudges: { maxContextPercent: 60 },
        experimental: { customPrompts: false },
      },
    );
    expect(config).toMatchObject({
      enabled: false,
      manualMode: false,
      autoCooling: false,
      cachePanel: true,
      customPrompts: false,
      compress: { mode: "range", summaryMaxChars: 15_000, summaryHardMaxChars: 18_000, minSourceChars: 5_000, minSavingsChars: 1_000 },
      protection: { tools: ["write", "aili_*"], recentUserMessages: 4 },
      nudges: { minContextPercent: 40, maxContextPercent: 60, emergencyPercent: 98 },
      strategies: { dedupe: { enabled: true }, purgeErrors: { enabled: true, graceTurns: 5 } },
      subagents: { enabled: false },
      gc: { promotionSurvivals: 5, maxBlockAge: 15, maxOldSummaryChars: 3_000, majorThresholdPercent: 100 },
      checkpoint: { mode: "hybrid", deterministic: true, nativeFallback: true, autoRescue: true },
      planning: { enabled: true },
      quality: { enabled: true, warningPolicy: "record" },
      providerSuffix: { enabled: true, maxChars: 2_048, maxTokens: 512 },
      index: { enabled: true, snapshotLru: 4 },
    });
    expect(DEFAULT_COMPACT_CONFIG.enabled).toBe(false);
    expect(resolveCompactConfig(undefined, undefined)).toEqual(DEFAULT_COMPACT_CONFIG);
    expect(resolveCompactConfig(undefined, { enabled: true }).enabled).toBe(true);
  });

  it("rejects unknown, malformed, wrong-type, range and cross-threshold values without applying them", () => {
    const result = resolveCompactConfigResult(
      { enabled: "no", unknown: true, compress: { summaryMaxChars: 20_000 } },
      { nudges: { minContextPercent: 80, maxContextPercent: 20 } },
    );
    expect(result.config.enabled).toBe(false);
    expect(result.config.compress.summaryMaxChars).toBe(15_000);
    expect(result.config.nudges).toMatchObject({ minContextPercent: 45, maxContextPercent: 55, emergencyPercent: 98 });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      "config-invalid-type:global:enabled",
      "config-unknown-key:global:unknown",
      "config-out-of-range:global:compress.summaryMaxChars",
      "config-invalid-thresholds:project:nudges",
    ]));
  });

  it("uses a 15,000-character semantic target and accepts only an 18,000-character configured ceiling", () => {
    const exact = resolveCompactConfigResult({
      compress: { summaryMaxChars: 18_000, summaryHardMaxChars: 18_000 },
    }, undefined);
    expect(exact.config.compress).toMatchObject({ summaryMaxChars: 18_000, summaryHardMaxChars: 18_000 });
    expect(exact.diagnostics).toEqual([]);

    const oversized = resolveCompactConfigResult({
      compress: { summaryMaxChars: 18_001, summaryHardMaxChars: 18_001 },
    }, undefined);
    expect(oversized.config.compress).toMatchObject({ summaryMaxChars: 15_000, summaryHardMaxChars: 18_000 });
    expect(oversized.diagnostics).toEqual(expect.arrayContaining([
      "config-out-of-range:global:compress.summaryMaxChars",
      "config-out-of-range:global:compress.summaryHardMaxChars",
    ]));
  });

  it("accepts maxBlockAge as a deprecated compatibility no-op with a bounded diagnostic", () => {
    const result = resolveCompactConfigResult({ gc: { maxBlockAge: 42 } }, undefined);
    expect(result.config.gc.maxBlockAge).toBe(42);
    expect(result.diagnostics).toEqual(["config-deprecated:maxBlockAge"]);
  });

  it("accepts only safe hybrid checkpoint configuration", () => {
    const configured = resolveCompactConfigResult(
      { checkpoint: { deterministic: false, autoRescue: false } },
      { checkpoint: { mode: "hybrid", nativeFallback: true } },
    );
    expect(configured.config.checkpoint).toEqual({ mode: "hybrid", deterministic: false, nativeFallback: true, autoRescue: false });
    expect(configured.diagnostics).toEqual([]);

    const unsafe = resolveCompactConfigResult({ checkpoint: { mode: "exclusive", nativeFallback: false } }, undefined);
    expect(unsafe.config.checkpoint).toEqual(DEFAULT_COMPACT_CONFIG.checkpoint);
    expect(unsafe.diagnostics).toEqual(expect.arrayContaining([
      "config-invalid-type:global:checkpoint.mode",
      "config-invalid-unsafe-checkpoint",
    ]));
  });

  it("rejects retired tier and tier-specific economics configuration", () => {
    const result = resolveCompactConfigResult({
      planning: { enabled: false },
      protection: { preserveRecentAtoms: 12, preserveRecentTokens: 20_000, preserveRecentTokenCapRatio: 0.2, preserveLastUserMessage: false },
      tokenEconomics: { minSavingsRatio: 0.3, minSteadySavingsTokens: { T1: 512 }, maxBreakEvenTurns: { NORMAL: 4 } },
      tiers: { restill: { minSourceTokens: 10_000, minTurnsSinceCreate: 12 } },
      index: { snapshotLru: 2 },
    }, undefined);
    expect(result.config).toMatchObject({
      planning: { enabled: false },
      protection: { preserveRecentAtoms: 12, preserveRecentTokens: 20_000, preserveRecentTokenCapRatio: 0.2, preserveLastUserMessage: true },
      index: { snapshotLru: 2 },
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      "config-invalid-unsafe-protection",
      "config-unknown-key:global:tokenEconomics",
      "config-unknown-key:global:tiers",
    ]));
  });

  it("reports malformed JSONC and keeps the valid file contribution", () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-config-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    mkdirSync(join(home, ".pi", "agent"), { recursive: true });
    mkdirSync(join(project, ".pi"), { recursive: true });
    writeFileSync(join(home, ".pi", "agent", "aili-compact.jsonc"), "{ invalid");
    writeFileSync(join(project, ".pi", "aili-compact.jsonc"), '{ "cachePanel": true }');
    const result = loadCompactConfigResult(project, home);
    expect(result.config.cachePanel).toBe(true);
    expect(result.diagnostics).toContain("config-invalid-jsonc:global");
  });

  it("loads only six fixed opt-in prompt slots with project override and no writes", () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-prompts-"));
    temporaryDirectories.push(root);
    const home = join(root, "home");
    const project = join(root, "project");
    const globalPrompts = join(home, ".pi", "agent", "aili-compact-prompts");
    const projectPrompts = join(project, ".pi", "aili-compact-prompts");
    mkdirSync(globalPrompts, { recursive: true });
    mkdirSync(projectPrompts, { recursive: true });
    writeFileSync(join(globalPrompts, "system.md"), "global system");
    writeFileSync(join(globalPrompts, "compress-range.md"), "global range");
    writeFileSync(join(globalPrompts, "unknown.md"), "ignored body");
    writeFileSync(join(projectPrompts, "system.md"), "project system");
    writeFileSync(join(projectPrompts, "turn-nudge.md"), "project turn");

    const snapshot = loadCompactPromptSnapshot(project, { ...resolveCompactConfig(undefined, undefined), customPrompts: true }, home);
    expect(snapshot).toMatchObject({ enabled: true, fileCount: 3, diagnostics: ["prompt-unknown-slot"] });
    expect(snapshot.slots).toEqual({
      "system.md": "project system",
      "compress-range.md": "global range",
      "turn-nudge.md": "project turn",
    });
    expect(JSON.stringify(snapshot)).not.toContain("ignored body");
    const guidance = appendCompactPromptGuidance("BASE", snapshot)!;
    expect(guidance).toContain("### System guidance\nproject system");
    expect(guidance).toContain("### Range compression guidance\nglobal range");
    expect(guidance).toContain("### Turn guidance\nproject turn");
    expect(guidance).toContain("immutable schema");
  });

  it("enforces per-file and total prompt limits without retaining rejected bodies", () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-prompts-"));
    temporaryDirectories.push(root);
    const project = join(root, "project");
    const promptDirectory = join(project, ".pi", "aili-compact-prompts");
    mkdirSync(promptDirectory, { recursive: true });
    const oversized = "x".repeat(4 * 1024 + 1);
    writeFileSync(join(promptDirectory, "system.md"), oversized);
    writeFileSync(join(promptDirectory, "compress-range.md"), "r".repeat(4_000));
    writeFileSync(join(promptDirectory, "compress-message.md"), "m".repeat(4_000));
    writeFileSync(join(promptDirectory, "turn-nudge.md"), "t".repeat(400));

    const snapshot = loadCompactPromptSnapshot(project, { ...resolveCompactConfig(undefined, undefined), customPrompts: true }, join(root, "home"));
    expect(snapshot.fileCount).toBe(2);
    expect(snapshot.diagnostics).toEqual(expect.arrayContaining(["prompt-file-limit", "prompt-total-limit"]));
    expect(JSON.stringify(snapshot)).not.toContain(oversized.slice(0, 64));
  });

  it("does not read or create prompt directories while opt-in is disabled", () => {
    const root = mkdtempSync(join(tmpdir(), "aili-compact-prompts-"));
    temporaryDirectories.push(root);
    const project = join(root, "project");
    const snapshot = loadCompactPromptSnapshot(project, resolveCompactConfig(undefined, undefined), join(root, "home"));
    expect(snapshot).toEqual(expect.objectContaining({ enabled: false, fileCount: 0, slots: {} }));
    expect(existsSync(join(project, ".pi", "aili-compact-prompts"))).toBe(false);
  });

  it("applies enabled, manual-mode, auto-cooling and panel controls independently", () => {
    const state = reduceCompactState([
      { id: "off", type: "custom", customType: "aili-compact", data: { schema: "aili.compact.tx.v1", id: "off", kind: "control", epochId: "root", control: "off" } },
      { id: "manual", type: "custom", customType: "aili-compact", data: { schema: "aili.compact.tx.v1", id: "manual", kind: "control", epochId: "root", control: "manual-on" } },
    ]);
    expect(applyCompactConfig(state, { ...resolveCompactConfig(undefined, undefined), enabled: true, autoCooling: false, cachePanel: true })).toMatchObject({
      enabled: false,
      autoCooling: false,
      manualMode: true,
      cachePanel: true,
    });
  });
});
