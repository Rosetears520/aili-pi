import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXTERNAL_CLI_REGISTRY, createExternalCliLaunchPlan, discoverExternalCliChoiceOption, externalCliRunnerModifier, probeExternalCli, projectExternalCliSettlement } from "../../src/runtime/persistent-agents/external-cli.js";
import { validateCurrentTurnCliRequest } from "../../src/runtime/persistent-agents/model-selection.js";

let scratch = "";
let priorPath = "";

beforeEach(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  scratch = await mkdtemp(resolve(".tmp/persistent-agent-cli-"));
  priorPath = process.env.PATH ?? "";
  // Full PATH isolation: probes must observe only the fake executables this
  // fixture creates, never a vendor CLI installed on the host.
  process.env.PATH = scratch;
});

afterEach(async () => {
  process.env.PATH = priorPath;
  await rm(scratch, { recursive: true, force: true });
});

async function fake(name: string, body: string): Promise<void> {
  const path = join(scratch, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  await chmod(path, 0o700);
}

describe("external CLI deterministic probe", () => {
  it("runs exact version then help without a shell and creates immutable guidance", async () => {
    await fake("claude", "if [ \"$1\" = \"--version\" ]; then echo 'Claude Code 1.0'; exit 0; fi\nif [ \"$1\" = \"--help\" ]; then echo 'usage: claude --print <prompt>'; exit 0; fi\nexit 9");
    const probe = await probeExternalCli("claude-code");
    expect(probe).toMatchObject({ cli: "claude-code", executable: "claude", identity: "confirmed", completed: { version: true, help: true }, outputTruncated: false, yolo: { disposition: "yolo-unavailable", argv: [] } });
    expect(probe.version).toContain("Claude Code 1.0");
    expect(probe.help).toContain("--print");
    const modifier = externalCliRunnerModifier(probe);
    expect(modifier).toContain("--version then --help");
    expect(modifier).toContain("no Pi child, shell, install, login");
    expect(modifier).toContain("package-parsed frozen-help choice flags");
    expect(modifier).toContain("Herdr-recognized CUI Agent");
    expect(modifier).toContain("Frozen --help");
    expect(modifier).toContain("Actual Herdr executable binding: Unverified");
  });

  it("treats a registered cli value as a structured Parent choice rather than phrase authorization", () => {
    expect(validateCurrentTurnCliRequest("agy-cli", { mode: "inherit-only" })).toBe("agy-cli");
    expect(validateCurrentTurnCliRequest("codex-cli", { mode: "inherit-only" })).toBe("codex-cli");
    expect(validateCurrentTurnCliRequest(undefined, { mode: "inherit-only" })).toBeUndefined();
  });

  it("fails missing executables before surface allocation", async () => {
    await expect(probeExternalCli("agy-cli")).rejects.toThrow(/^SUB_CLI_UNAVAILABLE: agy-cli is not installed; expected executable: agy$/);
  });

  it("rejects failed probes and preserves vendor defaults when external model/thinking are omitted", async () => {
    await fake("codex", "exit 3");
    await expect(probeExternalCli("codex-cli")).rejects.toThrow(/^SUB_CLI_PROBE_FAILED: codex --version exited 3$/);
    await fake("opencode", "if [ \"$1\" = \"--version\" ]; then echo 'opencode 1.0'; exit 0; fi\necho 'interactive shell only'; exit 0");
    const probe = await probeExternalCli("opencode");
    expect(probe.yolo).toEqual({ disposition: "yolo-unavailable", argv: [] });
    // Empty native choice argv is the vendor-default contract: omission does
    // not cause the runtime to synthesize either model or thinking flags.
    expect(createExternalCliLaunchPlan(probe, false, {})).toMatchObject({ argv: [], yolo: "yolo-unavailable", herdrKind: "opencode" });
    expect(createExternalCliLaunchPlan(probe, true)).toMatchObject({ argv: [], yolo: "yolo-unavailable", herdrKind: "opencode" });
  });

  it("derives an exact allowlisted YOLO flag only from bounded help", async () => {
    await fake("claude", "if [ \"$1\" = \"--version\" ]; then echo 'Claude Code 1.0'; else echo 'usage: claude --dangerously-skip-permissions'; fi");
    const probe = await probeExternalCli("claude-code");
    expect(probe.yolo).toEqual({ disposition: "available", argv: ["--dangerously-skip-permissions"] });
    expect(createExternalCliLaunchPlan(probe, false)).toMatchObject({ argv: [], yolo: "available" });
    expect(createExternalCliLaunchPlan(probe, true)).toMatchObject({ argv: ["--dangerously-skip-permissions"], yolo: "enabled", herdrKind: "claude", executableBinding: "Unverified" });
  });

  it("requires a post-prompt working transition and current idle/done state", () => {
    expect(projectExternalCliSettlement(["idle"])).toBe("active");
    expect(projectExternalCliSettlement(["idle", "blocked", "unknown", "idle"])).toBe("active");
    expect(projectExternalCliSettlement(["idle", "working", "blocked", "done"])).toBe("settled");
    expect(projectExternalCliSettlement(["working", "idle", "working"])).toBe("active");
    expect(projectExternalCliSettlement(["working", "idle", "unknown"])).toBe("active");
  });

  it("maps Agy CLI to Herdr's agy kind and enables only its verified YOLO flag", async () => {
    await fake("agy", "if [ \"$1\" = \"--version\" ]; then echo '1.1.22'; else echo 'Usage of agy: --dangerously-skip-permissions --prompt-interactive'; fi");
    const probe = await probeExternalCli("agy-cli");
    expect(probe).toMatchObject({ cli: "agy-cli", executable: "agy", yolo: { disposition: "available", argv: ["--dangerously-skip-permissions"] } });
    expect(createExternalCliLaunchPlan(probe, true)).toMatchObject({ herdrKind: "agy", argv: ["--dangerously-skip-permissions"], yolo: "enabled" });
  });

  it("discovers alternate model/thinking names and obeys displayed value syntax", async () => {
    await fake("agy", "if [ \"$1\" = \"--version\" ]; then echo 'agy 1.1.22'; else printf '%s\\n' 'Usage: agy' '  --engine <MODEL>' '      Select the model engine to use' '  --reasoning-level=<LEVEL>' '      Reasoning effort. Possible values: low, medium, high'; fi");
    const probe = await probeExternalCli("agy-cli");
    expect(discoverExternalCliChoiceOption(probe.help, "model")).toMatchObject({ flag: "--engine", syntax: "separate" });
    expect(discoverExternalCliChoiceOption(probe.help, "thinking")).toMatchObject({ flag: "--reasoning-level", syntax: "equals" });
    expect(createExternalCliLaunchPlan(probe, false, { model: "vendor-model", thinking: "high" }).argv)
      .toEqual(["--engine", "vendor-model", "--reasoning-level=high"]);
  });

  it("parses real-shaped codex, opencode, and agy option blocks generically", () => {
    expect(discoverExternalCliChoiceOption("Options:\n  -m, --model <MODEL>\n      Model to use for the task", "model"))
      .toMatchObject({ flag: "--model", syntax: "separate" });
    expect(discoverExternalCliChoiceOption("Options:\n  -m, --model         model to use in the format of provider/model  [string]", "model"))
      .toMatchObject({ flag: "--model", syntax: "separate" });
    const agyHelp = "Usage of agy:\n  --effort                        Reasoning effort for the current CLI session (low|medium|high)\n  --model                         Model for the current CLI session";
    expect(discoverExternalCliChoiceOption(agyHelp, "model"))
      .toMatchObject({ flag: "--model", syntax: "separate" });
    expect(discoverExternalCliChoiceOption(agyHelp, "thinking"))
      .toMatchObject({ flag: "--effort", syntax: "separate" });
  });

  it("fails closed for ambiguous semantics, enumerated unsupported thinking, and flag-shaped values", async () => {
    const ambiguous = "Options:\n  --engine <MODEL>\n      Model to use\n  --fallback-model <MODEL>\n      Model to use as fallback";
    expect(() => discoverExternalCliChoiceOption(ambiguous, "model"))
      .toThrow(/SUB_CLI_AMBIGUOUS: installed help has 2 semantic model options/);
    expect(() => discoverExternalCliChoiceOption("Options:\n  --json\n      Print JSON", "thinking"))
      .toThrow(/SUB_CLI_PROBE_FAILED: installed help has no uniquely identifiable value-taking thinking option/);

    await fake("codex", "if [ \"$1\" = \"--version\" ]; then echo 'codex 1.0'; else printf '%s\\n' 'Options:' '  --engine <MODEL>' '      Model to use' '  --reasoning-level=<LEVEL>' '      Reasoning effort. Possible values: low, medium'; fi");
    const probe = await probeExternalCli("codex-cli");
    expect(() => createExternalCliLaunchPlan(probe, false, { thinking: "high" }))
      .toThrow(/does not enumerate thinking value 'high'.*no thinking fallback/);
    expect(() => createExternalCliLaunchPlan(probe, false, { model: "--arbitrary-runner-flag" }))
      .toThrow(/cannot be interpreted as a runner flag/);
  });

  it("requires product identity for a generic grok executable and prefers grok-cli", async () => {
    await fake("grok", "if [ \"$1\" = \"--version\" ]; then echo 'unrelated grok tool 0.1'; exit 0; fi\necho 'usage: grok --print <prompt>'; exit 0");
    await expect(probeExternalCli("grok-cli")).rejects.toThrow(/^SUB_CLI_AMBIGUOUS: generic grok executable did not prove Grok CLI product identity$/);
    await fake("grok-cli", "if [ \"$1\" = \"--version\" ]; then echo 'grok-cli 1.0 (xai grok)'; exit 0; fi\necho 'usage: grok-cli --print <prompt>'; exit 0");
    const probe = await probeExternalCli("grok-cli");
    expect(probe.executable).toBe("grok-cli");
    expect(EXTERNAL_CLI_REGISTRY["grok-cli"].executables[0]).toBe("grok-cli");
  });

  it("bounds oversized probe output and redacts credential-shaped text", async () => {
    await fake("claude", "if [ \"$1\" = \"--version\" ]; then printf 'Claude Code 1.0 token=sk-secret-canary-value\\n'; exit 0; fi\nprintf 'usage: claude --print <prompt>\\n'; i=0; while [ $i -lt 3000 ]; do printf 'fillerfillerfillerfillerfillerfillerfillerfillerfillerfiller\\n'; i=$((i+1)); done; exit 0");
    const probe = await probeExternalCli("claude-code");
    expect(probe.outputTruncated).toBe(true);
    const combined = Buffer.byteLength(`${probe.version}${probe.help}`, "utf8");
    expect(combined).toBeLessThanOrEqual(64 * 1024);
    expect(probe.version).toContain("<redacted>");
    expect(probe.version).not.toContain("sk-secret-canary-value");
    expect(probe.help).toContain("--print");
  });

  it("bounds hanging probes at the helper boundary", async () => {
    // PATH is intentionally isolated, so use the known local Node runtime
    // rather than assuming a `sleep` binary exists in the fixture directory.
    const node = process.execPath.replaceAll("'", "'\\''");
    const pidPath = join(scratch, "agy.pid");
    await fake("agy", `echo $$ > '${pidPath}'\nexec '${node}' -e 'setTimeout(() => {}, 20000)'`);
    vi.useFakeTimers();
    try {
      const pending = probeExternalCli("agy-cli");
      // Attach the rejection handler before advancing time so the synchronous
      // timer rejection never becomes an unhandled rejection.
      const assertion = expect(pending).rejects.toThrow(/timed out/);
      // Let the real helper process start before advancing the fake timeout;
      // this proves the rejection is not produced by a timer-only fixture.
      await vi.advanceTimersByTimeAsync(50);
      const pid = Number((await readFile(pidPath, "utf8")).trim());
      expect(pid).toBeGreaterThan(0);
      expect(() => process.kill(pid, 0)).not.toThrow();
      await vi.advanceTimersByTimeAsync(5_100);
      await assertion;
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      vi.useRealTimers();
    }
  }, 10_000);

  it("fails closed when the probe is aborted before it starts", async () => {
    await fake("claude", "if [ \"$1\" = \"--version\" ]; then echo 'Claude Code 1.0'; exit 0; fi\necho 'usage: claude --print <prompt>'; exit 0");
    const controller = new AbortController();
    controller.abort();
    await expect(probeExternalCli("claude-code", controller.signal)).rejects.toThrow(/aborted/);
  });
});
