import { describe, expect, it } from "vitest";
import { EXTERNAL_CLI_REGISTRY, createExternalCliLaunchPlan, type ExternalCliProbe } from "../../src/runtime/persistent-agents/external-cli.js";

function probe(help: string): ExternalCliProbe {
  return {
    cli: "agy-cli",
    executable: "agy",
    version: "agy test",
    help,
    identity: "confirmed",
    completed: { version: true, help: true },
    outputTruncated: false,
    yolo: { disposition: "yolo-unavailable", argv: [] },
  };
}

describe("external CLI vendor-native model and thinking planning", () => {
  it("registers the visible startup-input strategy only for Agy", () => {
    expect(EXTERNAL_CLI_REGISTRY["agy-cli"].startupReadiness).toBe("agy-visible-input");
    for (const id of ["claude-code", "codex-cli", "opencode", "grok-cli"] as const) {
      expect(EXTERNAL_CLI_REGISTRY[id].startupReadiness).toBeUndefined();
    }
  });

  it("keeps the exact model and effort in separate package-owned argv entries", () => {
    const plan = createExternalCliLaunchPlan(
      probe("  --model <MODEL>\n  --effort <EFFORT>\n      Possible values: low, medium, high\n  --other"),
      { model: "gemini-3.7-flash-high", thinking: "high" },
    );
    expect(plan.argv).toEqual(["--model", "gemini-3.7-flash-high", "--effort", "high"]);
  });

  it("preserves AGY defaults when both choices are omitted", () => {
    expect(createExternalCliLaunchPlan(probe("agy help")).argv).toEqual([]);
  });

  it("fails explicitly when the effort value is not supported by frozen help", () => {
    expect(() => createExternalCliLaunchPlan(
      probe("  --model <MODEL>\n  --effort <EFFORT>\n      Possible values: low, medium\n  --other"),
      { model: "vendor-model-with-high-suffix", thinking: "high" },
    )).toThrow(/SUB_CLI_PROBE_FAILED.*does not enumerate thinking value 'high'.*no thinking fallback/i);
  });

  it("fails explicitly when the installed model flag is absent", () => {
    expect(() => createExternalCliLaunchPlan(
      probe("  --effort <EFFORT>\n      Possible values: high"),
      { model: "arbitrary-vendor-model" },
    )).toThrow(/SUB_CLI_PROBE_FAILED.*no uniquely identifiable value-taking model option/i);
  });
});
