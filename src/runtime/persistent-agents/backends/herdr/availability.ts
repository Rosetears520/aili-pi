import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { HerdrUnavailableError } from "./protocol.js";

/** The user-approved official installation chain, executed in order when a
 *  component is missing (decision 19 / spec: availability detection and
 *  guided installation). Detection is idempotent; each failure names its
 *  step and never triggers a backend fallback. */
export const HERDR_INSTALL_STEPS = [
  { component: "binary", command: "curl -fsSL https://herdr.dev/install.sh | sh" },
  { component: "pi-integration", command: "herdr integration install pi" },
  { component: "pi-skill", command: "npx skills add herdrdev/herdr --skill herdr -g -a pi" },
] as const;

export type HerdrComponentState =
  | { component: "binary"; present: boolean; detail?: string }
  | { component: "pi-integration"; present: boolean; detail?: string }
  | { component: "pi-skill"; present: boolean; detail?: string };

export interface HerdrAvailability {
  binary: HerdrComponentState;
  integration: HerdrComponentState;
  skill: HerdrComponentState;
  allPresent: boolean;
  installedNow: string[];
}

async function run(command: string, args: string[], timeoutMs = 20_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const maxBytes = 64 * 1024;
    const append = (current: string, chunk: unknown) => current.length >= maxBytes ? current : `${current}${Buffer.from(chunk as Uint8Array).toString("utf8")}`.slice(0, maxBytes);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function shell(command: string): Promise<{ code: number; output: string }> {
  return run("sh", ["-c", command], 300_000).then((result) => ({ code: result.code, output: `${result.stdout}${result.stderr}`.trim() }));
}

/** Detects the three components. Missing components are then installed via
 *  the official commands, in order. Returns the final state and which
 *  components this call installed. */
export async function ensureHerdrAvailable(): Promise<HerdrAvailability> {
  const installedNow: string[] = [];
  let binary = await detectBinary();
  if (!binary.present) {
    await installStep("binary");
    binary = await detectBinary();
    if (!binary.present) throw new HerdrUnavailableError("official herdr installer completed but the binary is still not detected");
    installedNow.push("binary");
  }
  let integration = await detectIntegration();
  if (!integration.present) {
    await installStep("pi-integration");
    integration = await detectIntegration();
    if (!integration.present) throw new HerdrUnavailableError("'herdr integration install pi' completed but the pi integration is still not detected");
    installedNow.push("pi-integration");
  }
  let skill = await detectSkill();
  if (!skill.present) {
    await installStep("pi-skill");
    skill = await detectSkill();
    if (!skill.present) throw new HerdrUnavailableError("'npx skills add herdrdev/herdr --skill herdr -g -a pi' completed but the pi-side herdr skill is still not detected");
    installedNow.push("pi-skill");
  }
  return { binary, integration, skill, allPresent: true, installedNow };
}

async function installStep(component: string): Promise<void> {
  const step = HERDR_INSTALL_STEPS.find((entry) => entry.component === component);
  if (!step) throw new Error(`unknown herdr install component: ${component}`);
  const result = await shell(step.command);
  if (result.code !== 0) {
    throw new HerdrUnavailableError(`herdr setup step '${step.command}' failed (exit ${result.code}): ${result.output.slice(0, 400)}`, "herdr-setup-failed");
  }
}

export async function detectHerdrComponents(): Promise<HerdrAvailability> {
  const binary = await detectBinary();
  const integration = await detectIntegration();
  const skill = await detectSkill();
  return { binary, integration, skill, allPresent: binary.present && integration.present && skill.present, installedNow: [] };
}

async function detectBinary(): Promise<HerdrComponentState> {
  const result = await run("herdr", ["--version"], 10_000);
  if (result.code === 0 && result.stdout.trim().length > 0) return { component: "binary", present: true, detail: result.stdout.trim() };
  return { component: "binary", present: false, detail: result.stderr.trim().slice(0, 200) || undefined };
}

/** Parse one exact integration row from bounded `herdr integration status`
 * output. Similar prefixes/suffixes never satisfy the requested identity. */
export function parseHerdrIntegrationStatus(output: string, integrationId: string): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(integrationId)) throw new Error("Herdr integration id must be an exact lowercase identifier");
  for (const line of output.slice(0, 64 * 1024).split(/\r?\n/u)) {
    const match = line.match(/^\s*([a-z0-9][a-z0-9-]*)\s*:\s*([a-z0-9][a-z0-9_-]*)(?:\s+.*)?$/u);
    if (match?.[1] === integrationId) return match[2];
  }
  return undefined;
}

export interface HerdrIntegrationStatus {
  integrationId: string;
  status?: string;
  current: boolean;
  detail?: string;
}

/** Bounded, no-shell, read-only integration detector. It invokes only
 * `herdr integration status`; it never installs or writes user-home state. */
export async function detectHerdrIntegrationStatus(integrationId: string, executable = "herdr"): Promise<HerdrIntegrationStatus> {
  // Validate before placing the id into diagnostics (the status command itself
  // intentionally takes no id argument, avoiding option injection entirely).
  parseHerdrIntegrationStatus("", integrationId);
  const result = await run(executable, ["integration", "status"], 10_000);
  const status = parseHerdrIntegrationStatus(result.stdout, integrationId);
  return {
    integrationId,
    ...(status === undefined ? {} : { status }),
    current: result.code === 0 && status === "current",
    ...(result.code === 0 ? {} : { detail: result.stderr.trim().slice(0, 200) || `status command exited ${result.code}` }),
  };
}

async function detectIntegration(): Promise<HerdrComponentState> {
  const result = await detectHerdrIntegrationStatus("pi");
  if (result.current) return { component: "pi-integration", present: true, detail: "pi: current" };
  return { component: "pi-integration", present: false, detail: result.status ? `pi: ${result.status}` : result.detail };
}

async function detectSkill(): Promise<HerdrComponentState> {
  const candidates = [join(getAgentDir(), "skills", "herdr"), join(getAgentDir().replace(/\/\.pi\/agent$/, "/.agents"), "skills", "herdr")];
  for (const candidate of candidates) {
    const stat = await lstat(candidate).catch(() => undefined);
    if (stat?.isDirectory()) return { component: "pi-skill", present: true, detail: candidate };
  }
  return { component: "pi-skill", present: false };
}

/** The official Herdr pi integration extension — installed by the official
 *  chain — is what lets the daemon recognize the child pi process. It is part
 *  of the herdr backend's approved loadout even though default extension
 *  discovery stays disabled. */
export function herdrIntegrationExtensionPath(): string | undefined {
  const candidate = join(getAgentDir(), "extensions", "herdr-agent-state.ts");
  return existsSync(candidate) ? candidate : undefined;
}

export function describeHerdrAvailability(availability: HerdrAvailability, socketReachable: boolean | undefined): string {
  const line = (state: HerdrComponentState) => `${state.component}: ${state.present ? `present${state.detail && state.component !== "pi-skill" ? ` (${state.detail})` : ""}` : `missing${state.detail ? ` (${state.detail})` : ""}`}`;
  return [
    `herdr binary — ${line(availability.binary)}`,
    `herdr pi integration — ${line(availability.integration)}`,
    `herdr pi skill — ${line(availability.skill)}`,
    socketReachable === undefined ? "socket: not probed" : `socket: ${socketReachable ? "reachable" : "unreachable"}`,
  ].join("\n");
}
