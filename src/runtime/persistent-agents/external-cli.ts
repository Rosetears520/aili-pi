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
  /** Exact declarative Herdr integration prerequisite. This is detection-only
   * metadata and never authorizes automatic installation. */
  requiredHerdrIntegration?: string;
  /** Additional startup evidence; absent for vendors using Herdr readiness alone. */
  startupReadiness?: "agy-visible-input";
}

export const EXTERNAL_CLI_REGISTRY: Readonly<Record<ExternalCliId, ExternalCliDefinition>> = Object.freeze({
  "claude-code": { id: "claude-code", executables: ["claude"], herdrKind: "claude", yolo: { argv: ["--dangerously-skip-permissions"], evidence: /(?:^|\s)--dangerously-skip-permissions(?:\s|,|$)/m } },
  "codex-cli": { id: "codex-cli", executables: ["codex"], herdrKind: "codex", yolo: { argv: ["--dangerously-bypass-approvals-and-sandbox"], evidence: /(?:^|\s)--dangerously-bypass-approvals-and-sandbox(?:\s|,|$)/m } },
  opencode: { id: "opencode", executables: ["opencode"], herdrKind: "opencode", yolo: { argv: ["--yolo"], evidence: /(?:^|\s)--yolo(?:\s|,|$)/m } },
  "grok-cli": { id: "grok-cli", executables: ["grok-cli", "grok"], herdrKind: "grok", genericIdentity: /(?:grok[- ]?cli|xai\s+grok)/i },
  "agy-cli": {
    id: "agy-cli",
    executables: ["agy"],
    herdrKind: "agy",
    requiredHerdrIntegration: "antigravity-cli",
    startupReadiness: "agy-visible-input",
    yolo: { argv: ["--dangerously-skip-permissions"], evidence: /(?:^|\s)--dangerously-skip-permissions(?:\s|,|$)/m },
  },
});

const PROBE_TIMEOUT_MS = 5_000;
const PROBE_MAX_BYTES = 64 * 1024;

export interface ExternalCliProbe {
  cli: ExternalCliId;
  executable: string;
  version: string;
  help: string;
  /** Parent-side probe identity only; it does not bind Herdr's executable. */
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
  /** Herdr accepts kind/args, not the probed executable path. */
  executableBinding?: "Unverified";
}

/** One option declaration parsed only from the selected executable's frozen,
 * bounded `--help`. The flag is package-parsed evidence, never a flag supplied
 * by a prompt or tool argument. */
export interface ExternalCliChoiceOption {
  flag: string;
  syntax: "separate" | "equals";
  block: string;
}

type ExternalCliChoiceKind = "model" | "thinking";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const OPTION_LINE = /^\s*--?[A-Za-z0-9][A-Za-z0-9-]*(?:\s*,\s*--?[A-Za-z0-9][A-Za-z0-9-]*)?/u;
const VALUE_MARKER = "(?:<[^>\\r\\n]+>|\\[[^\\]\\r\\n]+\\]|[A-Z][A-Z0-9_-]*|(?:string|value|name|id|model|engine|level|effort))";

function helpOptionBlocks(help: string): string[] {
  const blocks: string[] = [];
  let current: string[] | undefined;
  for (const line of help.split(/\r?\n/u)) {
    if (OPTION_LINE.test(line)) {
      if (current) blocks.push(current.join("\n"));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) blocks.push(current.join("\n"));
  return blocks;
}

function optionSyntax(block: string, declaration: string, flag: string, kind: ExternalCliChoiceKind): ExternalCliChoiceOption["syntax"] | undefined {
  const escaped = escapeRegExp(flag);
  if (new RegExp(`${escaped}\\s*=\\s*${VALUE_MARKER}(?=\\s|,|$)`, "u").test(declaration)) return "equals";
  if (new RegExp(`${escaped}\\s+${VALUE_MARKER}(?=\\s|,|$)`, "u").test(declaration)) return "separate";

  // Some CLIs (notably Go flag output and OpenCode) omit a metavar and put
  // the value-taking option's description after a wide spacing column. Admit
  // only descriptions that themselves establish the requested semantic; a
  // bare semantic-looking boolean flag is not enough.
  const flagAt = declaration.indexOf(flag);
  const trailing = flagAt < 0 ? "" : declaration.slice(flagAt + flag.length);
  if (!/^\s{2,}\S/u.test(trailing)) return undefined;
  const description = `${trailing.trim()} ${block.split("\n").slice(1).join(" ")}`;
  if (kind === "model" && /\b(?:model|engine)\b.*\b(?:for|to\s+use|name|id|format)\b/iu.test(description)) return "separate";
  if (kind === "thinking" && /\b(?:thinking|reasoning|effort)\b/iu.test(description)
    && /(?:\([^)]*[,|][^)]*\)|\{[^}]*[,|][^}]*\}|\b(?:level|value|choice)s?\b)/iu.test(description)) return "separate";
  return undefined;
}

function semanticChoiceBlock(block: string, kind: ExternalCliChoiceKind): boolean {
  const [declaration = "", ...descriptionLines] = block.split("\n");
  const description = descriptionLines.join(" ");
  const flags = declaration.match(/--?[A-Za-z0-9][A-Za-z0-9-]*/g) ?? [];
  const semanticFlag = flags.some((flag) => {
    const name = flag.replace(/^-+/, "").toLowerCase();
    return kind === "model"
      ? /^(?:model|engine)$|-(?:model|engine)$/u.test(name)
      : /^(?:thinking|reasoning|effort)(?:-level)?$|-(?:thinking|reasoning|effort)(?:-level)?$/u.test(name);
  });
  if (semanticFlag) return true;
  if (kind === "model") {
    return /<\s*(?:model|engine)\s*>|\b(?:select|choose|specify|use)\s+(?:the\s+)?(?:AI\s+)?(?:model|engine)\b|\b(?:model|engine)\s+(?:to|that|which)\s+(?:use|run|select)\b/iu.test(`${declaration} ${description}`);
  }
  return /<\s*(?:thinking|reasoning|effort|level)\s*>/iu.test(declaration)
    && /\b(?:thinking|reasoning|effort)\b/iu.test(description);
}

/** Conservatively discovers one value-taking option from frozen help. More
 * than one semantic option is ambiguity, not a preference or fallback. Within
 * the unique option declaration an explicit `--long` spelling wins over a
 * short/single-dash spelling, and the displayed equals/separate form is kept. */
export function discoverExternalCliChoiceOption(help: string, kind: ExternalCliChoiceKind): ExternalCliChoiceOption {
  const matches: ExternalCliChoiceOption[] = [];
  for (const block of helpOptionBlocks(help)) {
    if (!semanticChoiceBlock(block, kind)) continue;
    const declaration = block.split("\n", 1)[0] ?? "";
    const flags = declaration.match(/--?[A-Za-z0-9][A-Za-z0-9-]*/g) ?? [];
    const ordered = [...flags.filter((flag) => flag.startsWith("--")), ...flags.filter((flag) => !flag.startsWith("--"))];
    const selected = ordered.map((flag) => ({ flag, syntax: optionSyntax(block, declaration, flag, kind) })).find((candidate) => candidate.syntax !== undefined);
    if (selected?.syntax) matches.push({ flag: selected.flag, syntax: selected.syntax, block });
  }
  if (matches.length === 0) {
    throw new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `installed help has no uniquely identifiable value-taking ${kind} option`);
  }
  if (matches.length !== 1) {
    throw new ExternalCliProbeError("SUB_CLI_AMBIGUOUS", `installed help has ${matches.length} semantic ${kind} options; refusing to guess`);
  }
  return matches[0]!;
}

function assertChoiceValue(value: string, kind: ExternalCliChoiceKind): void {
  if (!value || value !== value.trim() || value.startsWith("-") || /[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)) {
    throw new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${kind} choice must be one exact value and cannot be interpreted as a runner flag`);
  }
}

function blockHasExactValue(block: string, value: string): boolean {
  return new RegExp(`(?:^|[^A-Za-z0-9._-])${escapeRegExp(value)}(?=$|[^A-Za-z0-9._-])`, "iu").test(block);
}

function blockEnumeratesThinkingValues(block: string): boolean {
  const evidenced = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
    .filter((value) => blockHasExactValue(block, value));
  return evidenced.length >= 2 || /(?:possible|allowed|valid|supported)\s+values?|choices?\s*[:=]|\{[^}\r\n]*[,|][^}\r\n]*\}/iu.test(block);
}

function appendChoiceArg(argv: string[], option: ExternalCliChoiceOption, value: string): void {
  if (option.syntax === "equals") argv.push(`${option.flag}=${value}`);
  else argv.push(option.flag, value);
}

/** Converts frozen package-parsed probe evidence into a launch plan. Vendor
 * values remain independent fields; no Pi catalog, per-CLI option map, suffix
 * inference, arbitrary prompt flag, or fallback encoding is consulted. */

export function createExternalCliLaunchPlan(
  probe: ExternalCliProbe,
  enableYolo: boolean,
  requested: { model?: string; thinking?: string } = {},
): ExternalCliLaunchPlan {
  const definition = EXTERNAL_CLI_REGISTRY[probe.cli];
  if (!definition.executables.includes(probe.executable)) throw new ExternalCliProbeError("SUB_CLI_AMBIGUOUS", "probe executable is not registered for the requested product");
  const available = probe.yolo.disposition === "available";
  const argv = enableYolo && available ? [...probe.yolo.argv] : [];
  if (requested.model !== undefined) {
    assertChoiceValue(requested.model, "model");
    appendChoiceArg(argv, discoverExternalCliChoiceOption(probe.help, "model"), requested.model);
  }
  if (requested.thinking !== undefined) {
    assertChoiceValue(requested.thinking, "thinking");
    const option = discoverExternalCliChoiceOption(probe.help, "thinking");
    if (blockEnumeratesThinkingValues(option.block) && !blockHasExactValue(option.block, requested.thinking)) {
      throw new ExternalCliProbeError("SUB_CLI_PROBE_FAILED", `${probe.cli} installed help does not enumerate thinking value '${requested.thinking}'; no thinking fallback is permitted`);
    }
    appendChoiceArg(argv, option, requested.thinking);
  }
  return {
    cli: probe.cli,
    executable: probe.executable,
    herdrKind: definition.herdrKind,
    argv,
    yolo: enableYolo && available ? "enabled" : available ? "available" : "yolo-unavailable",
    executableBinding: "Unverified",
  };
}

export type ExternalCliAgentStatus = "working" | "idle" | "done" | "blocked" | "unknown" | string;

/** Pure post-prompt guard used by the socket driver and deterministic tests. */
export function projectExternalCliSettlement(statuses: readonly ExternalCliAgentStatus[]): "settled" | "active" {
  let enteredWorking = false;
  for (const status of statuses) if (status === "working") enteredWorking = true;
  const current = statuses.at(-1);
  // Settlement is a projection of the current state, not a historical "ever
  // idle" latch. A later working/unknown state remains active.
  return enteredWorking && (current === "idle" || current === "done") ? "settled" : "active";
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
    "The vendor is started as a Herdr-recognized CUI Agent with a package-owned executable/YOLO policy and package-parsed frozen-help choice flags; no Pi child, shell, install, login, or model-supplied runner flags are used. It is trusted-local execution, not a Pi child hard-permission boundary or AILI OS sandbox.",
    "Actual Herdr executable binding: Unverified; the cooperating local operator must keep Parent and pane installations consistent.",
    `Frozen --version:\n${probe.version}`,
    `Frozen --help:\n${probe.help}`,
    "[/AILI direct external CUI Agent capability evidence]",
  ].join("\n");
}
