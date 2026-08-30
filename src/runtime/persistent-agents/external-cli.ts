import { spawn } from "node:child_process";
import { basename } from "node:path";
import type { ExternalCliId } from "./model-selection.js";
import { redactCredentialText } from "./permission.js";

export interface ExternalCliDefinition {
  id: ExternalCliId;
  executables: readonly string[];
  /** Herdr's built-in, recognized CUI Agent kind. */
  herdrKind: "claude" | "codex" | "gemini" | "opencode" | "grok" | "agy";
  /** Exact native argv which may be enabled only when every token is present
   * in bounded installed help and the active AILI mode already permits it. */
  yolo?: { argv: readonly string[]; evidence: RegExp };
  /** Generic grok must prove the installed product from bounded help/version. */
  genericIdentity?: RegExp;
}

export const EXTERNAL_CLI_REGISTRY: Readonly<Record<ExternalCliId, ExternalCliDefinition>> = Object.freeze({
  "claude-code": { id: "claude-code", executables: ["claude"], herdrKind: "claude", yolo: { argv: ["--dangerously-skip-permissions"], evidence: /(?:^|\s)--dangerously-skip-permissions(?:\s|,|$)/m } },
  "codex-cli": { id: "codex-cli", executables: ["codex"], herdrKind: "codex", yolo: { argv: ["--dangerously-bypass-approvals-and-sandbox"], evidence: /(?:^|\s)--dangerously-bypass-approvals-and-sandbox(?:\s|,|$)/m } },
  opencode: { id: "opencode", executables: ["opencode"], herdrKind: "opencode", yolo: { argv: ["--yolo"], evidence: /(?:^|\s)--yolo(?:\s|,|$)/m } },
  "grok-cli": { id: "grok-cli", executables: ["grok-cli", "grok"], herdrKind: "grok", genericIdentity: /(?:grok[- ]?cli|xai\s+grok)/i },
  "agy-cli": { id: "agy-cli", executables: ["agy"], herdrKind: "agy", yolo: { argv: ["--dangerously-skip-permissions"], evidence: /(?:^|\s)--dangerously-skip-permissions(?:\s|,|$)/m } },
});

const PROBE_TIMEOUT_MS = 5_000;
const PROBE_MAX_BYTES = 64 * 1024;

export interface ExternalCliProbe {
  cli: ExternalCliId;
  executable: string;
  version: string;
  help: string;
  identity: "confirmed";
  completed: { version: true; help: true };
  outputTruncated: boolean;
  yolo: { disposition: "available" | "yolo-unavailable"; argv: readonly string[] };
}

export interface ExternalCliLaunchPlan {
  cli: ExternalCliId;
  executable: string;
  herdrKind: ExternalCliDefinition["herdrKind"];
  argv: readonly string[];
  yolo: "enabled" | "available" | "yolo-unavailable";
}

/** Converts frozen probe evidence into a model-independent launch plan. No
 * caller text can contribute executable or argv fragments. */
export function createExternalCliLaunchPlan(probe: ExternalCliProbe, enableYolo: boolean): ExternalCliLaunchPlan {
  const definition = EXTERNAL_CLI_REGISTRY[probe.cli];
  if (!definition.executables.includes(probe.executable)) throw new ExternalCliProbeError("SUB_CLI_AMBIGUOUS", "probe executable is not registered for the requested product");
  const available = probe.yolo.disposition === "available";
  return {
    cli: probe.cli,
    executable: probe.executable,
    herdrKind: definition.herdrKind,
    argv: enableYolo && available ? [...probe.yolo.argv] : [],
    yolo: enableYolo && available ? "enabled" : available ? "available" : "yolo-unavailable",
  };
}

export type ExternalCliAgentStatus = "working" | "idle" | "done" | "blocked" | "unknown" | string;

/** Pure post-prompt guard used by the socket driver and deterministic tests. */
export function projectExternalCliSettlement(statuses: readonly ExternalCliAgentStatus[]): "settled" | "active" {
  let enteredWorking = false;
  for (const status of statuses) {
    if (status === "working") enteredWorking = true;
    else if (enteredWorking && (status === "idle" || status === "done")) return "settled";
  }
  return "active";
}

export class ExternalCliProbeError extends Error {
  constructor(readonly code: "SUB_CLI_UNAVAILABLE" | "SUB_CLI_PROBE_FAILED" | "SUB_CLI_AMBIGUOUS", message: string) {
    super(`${code}: ${message}`);
    this.name = "ExternalCliProbeError";
  }
}

function boundedUtf8(value: Buffer, maxBytes: number): { text: string; truncated: boolean } {
  if (value.byteLength <= maxBytes) return { text: value.toString("utf8"), truncated: false };
  const suffix = "…[truncated]";
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  let end = Math.max(0, maxBytes - suffixBytes);
  while (end > 0 && (value[end]! & 0b1100_0000) === 0b1000_0000) end -= 1;
  return { text: `${value.subarray(0, end).toString("utf8")}${suffix}`, truncated: true };
}

interface ProbeRun {
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
  signal: string | null;
  outputTruncated: boolean;
}

/** Runs one exact argv without a shell. `detached` creates a process group on
 * POSIX so timeout/abort terminates descendants instead of leaving a vendor
 * helper behind. */
async function runProbe(executable: string, args: readonly string[], signal: AbortSignal | undefined, outputLimit: number): Promise<ProbeRun> {
  return await new Promise<ProbeRun>((resolve, reject) => {
    let settled = false;
    let child: ReturnType<typeof spawn>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    let outputTruncated = false;
    const capture = (target: Buffer[], chunk: Buffer) => {
      const remaining = Math.max(0, outputLimit - capturedBytes);
      if (chunk.byteLength > remaining) outputTruncated = true;
      if (remaining > 0) {
        const kept = chunk.subarray(0, remaining);
        target.push(Buffer.from(kept));
        capturedBytes += kept.byteLength;
      }
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const terminate = () => {
      if (!child.pid) return;
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
      setTimeout(() => {
        if (child.exitCode === null) {
          try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        }
      }, 100).unref();
    };
    const abort = () => {
      terminate();
      finish(() => reject(new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${basename(executable)} probe aborted`)));
    };
    try {
      child = spawn(executable, [...args], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }
    timer = setTimeout(() => {
      terminate();
      finish(() => reject(new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${basename(executable)} ${args[0]} timed out after ${PROBE_TIMEOUT_MS}ms`)));
    }, PROBE_TIMEOUT_MS);
    timer.unref?.();
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => capture(stdout, Buffer.from(chunk)));
    child.stderr?.on("data", (chunk: Buffer) => capture(stderr, Buffer.from(chunk)));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code, exitSignal) => finish(() => resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), code, signal: exitSignal, outputTruncated })));
  });
}

function combinedOutput(run: ProbeRun, remaining: number): { text: string; truncated: boolean } {
  const bounded = boundedUtf8(Buffer.concat([run.stdout, run.stderr]), remaining);
  return { text: bounded.text, truncated: bounded.truncated || run.outputTruncated };
}

/** Deterministic pre-task identity probe. It never interprets or runs a task,
 * invokes no shell/profile, and intentionally inherits normal HOME so the
 * explicitly authorized product can describe its installed behavior. */
export async function probeExternalCli(cli: ExternalCliId, signal?: AbortSignal): Promise<ExternalCliProbe> {
  const definition = EXTERNAL_CLI_REGISTRY[cli];
  let lastMissing: unknown;
  for (const executable of definition.executables) {
    let versionRun: ProbeRun;
    try {
      versionRun = await runProbe(executable, ["--version"], signal, PROBE_MAX_BYTES);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { lastMissing = error; continue; }
      if (error instanceof ExternalCliProbeError) throw error;
      throw new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${basename(executable)} --version could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
    const version = combinedOutput(versionRun, PROBE_MAX_BYTES);
    if (versionRun.code !== 0 || versionRun.signal) {
      throw new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${basename(executable)} --version exited ${versionRun.signal ?? versionRun.code}`);
    }
    let helpRun: ProbeRun;
    try {
      helpRun = await runProbe(executable, ["--help"], signal, Math.max(0, PROBE_MAX_BYTES - Buffer.byteLength(version.text, "utf8")));
    } catch (error) {
      if (error instanceof ExternalCliProbeError) throw error;
      throw new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${basename(executable)} --help could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
    const help = combinedOutput(helpRun, Math.max(0, PROBE_MAX_BYTES - Buffer.byteLength(version.text, "utf8")));
    if (helpRun.code !== 0 || helpRun.signal) {
      throw new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${basename(executable)} --help exited ${helpRun.signal ?? helpRun.code}`);
    }
    if (executable === "grok" && definition.genericIdentity && !definition.genericIdentity.test(`${version.text}\n${help.text}`)) {
      throw new ExternalCliProbeError("SUB_CLI_AMBIGUOUS", "generic grok executable did not prove Grok CLI product identity");
    }
    const yolo = definition.yolo && definition.yolo.evidence.test(help.text)
      ? { disposition: "available" as const, argv: definition.yolo.argv }
      : { disposition: "yolo-unavailable" as const, argv: [] as const };
    return {
      cli,
      executable: basename(executable),
      version: redactCredentialText(version.text),
      help: redactCredentialText(help.text),
      identity: "confirmed",
      completed: { version: true, help: true },
      outputTruncated: version.truncated || help.truncated,
      yolo,
    };
  }
  void lastMissing;
  throw new ExternalCliProbeError("SUB_CLI_UNAVAILABLE", `${cli} is not installed; expected executable: ${definition.executables.join(" or ")}`);
}

/** Bounded diagnostic rendering. Execution never consumes this text: the
 * direct Herdr driver consumes only createExternalCliLaunchPlan(). */
export function externalCliRunnerModifier(probe: ExternalCliProbe): string {
  return [
    "[AILI direct external CUI Agent capability evidence]",
    `Authorized product: ${probe.cli}; executable: ${probe.executable}; deterministic --version then --help probes completed.`,
    `YOLO capability: ${probe.yolo.disposition}.`,
    "The vendor is started as a Herdr-recognized CUI Agent with package-owned argv; no Pi child, shell, install, login, or model-supplied flags are used.",
    `Frozen --version:\n${probe.version}`,
    `Frozen --help:\n${probe.help}`,
    "[/AILI direct external CUI Agent capability evidence]",
  ].join("\n");
}
