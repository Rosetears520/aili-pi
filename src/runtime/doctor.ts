import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectLifecycleConflicts } from "./conflicts.js";
import { loadRegistry, validateLiveVerification, validateProvenance, validateRegistry } from "./registry.js";
import { inspectGlobalResources } from "./global-resources.js";
import { nativeIntegrationDiagnostics } from "./native-integrations.js";
import { validateRoleProfiles } from "./roles.js";
import { emptyCacheTelemetry, recordCacheTelemetry } from "./aili-compact/cache.js";
import { COMPACT_PROMPT_SLOTS } from "./aili-compact/config.js";
import { decideNativeCompaction } from "./aili-compact/compaction.js";
import { AILI_COMPACT_ENTRY, AILI_COMPACT_SCHEMA, digest, sourceDigest, type CompactState, type SessionLikeEntry } from "./aili-compact/contracts.js";
import { projectMessages, type ProjectionMessage } from "./aili-compact/projector.js";
import { buildReferenceCatalog } from "./aili-compact/references.js";
import { reduceCompactState } from "./aili-compact/reducer.js";

export type DoctorStatus = "PASS" | "WARN" | "SKIP" | "ERROR" | "UNVERIFIED";

export interface DoctorResult {
  id: string;
  status: DoctorStatus;
  evidence: string;
}

export interface DoctorReport {
  schemaVersion: 1;
  status: "PASS" | "NON_PASS";
  results: DoctorResult[];
}

const ROOT = new URL("../../", import.meta.url);

export type AiliHealthEvidenceStatus = "pass" | "fail" | "unverified";
export interface AiliHealthInvariantEvidence {
  status: AiliHealthEvidenceStatus;
  count?: number;
  hash?: string;
  /** A bounded error name/code, never a source, prompt, or tool body. */
  error?: string;
}
export interface AiliCompactHealthEvidence {
  reducer: AiliHealthInvariantEvidence;
  reference: AiliHealthInvariantEvidence;
  projection: AiliHealthInvariantEvidence;
  recap: AiliHealthInvariantEvidence;
  prompt: AiliHealthInvariantEvidence;
  nativeHook: AiliHealthInvariantEvidence;
  cache?: AiliHealthInvariantEvidence;
  live?: AiliHealthInvariantEvidence;
  hostOrdering?: AiliHealthInvariantEvidence;
}

export async function runDoctor(
  pi: Pick<ExtensionAPI, "getCommands">,
  options: {
    platform?: NodeJS.Platform;
    home?: string;
    ailiCompactEvidence?: AiliCompactHealthEvidence | (() => AiliCompactHealthEvidence | Promise<AiliCompactHealthEvidence>);
  } = {},
): Promise<DoctorReport> {
  const results: DoctorResult[] = [];
  try {
    const packageJson = JSON.parse(await readFile(new URL("package.json", ROOT), "utf8")) as {
      version?: string;
      engines?: { node?: string };
      pi?: { extensions?: string[]; prompts?: string[]; skills?: string[]; themes?: string[] };
    };
    const dependencies = (packageJson as { dependencies?: Record<string, string> }).dependencies ?? {};
    const expectedDependencies = ["pi-permission-modes@2.2.0", "pi-quota-status@0.3.0", "pi-web-access@0.13.0"];
    const dependencyState = expectedDependencies.every((entry) => {
      const separator = entry.lastIndexOf("@");
      return dependencies[entry.slice(0, separator)] === entry.slice(separator + 1);
    });
    results.push({ id: "package", status: dependencyState ? "PASS" : "ERROR", evidence: `version=${packageJson.version ?? "unverified"}; node=${packageJson.engines?.node ?? "unverified"}; native_dependencies=${dependencyState ? "exact" : "drift"}` });
    const resources = [...(packageJson.pi?.extensions ?? []), ...(packageJson.pi?.prompts ?? []), ...(packageJson.pi?.skills ?? []), ...(packageJson.pi?.themes ?? [])];
    results.push({ id: "package.resources", status: resources.length === 11 ? "PASS" : "ERROR", evidence: `declared=${resources.length}` });
  } catch (error) {
    results.push({ id: "package", status: "ERROR", evidence: boundedError(error) });
  }

  try {
    const lock = JSON.parse(await readFile(new URL("upstream/aili-workflows.lock.json", ROOT), "utf8")) as {
      commit?: string; contentHash?: string; skillCount?: number; fileCount?: number;
    };
    results.push({ id: "skill.snapshot", status: lock.commit && lock.contentHash ? "PASS" : "ERROR", evidence: `commit=${lock.commit ?? "missing"}; hash=${lock.contentHash ?? "missing"}; skills=${lock.skillCount ?? "missing"}; files=${lock.fileCount ?? "missing"}` });
  } catch (error) {
    results.push({ id: "skill.snapshot", status: "ERROR", evidence: boundedError(error) });
  }

  const commands = pi.getCommands();
  const conflicts = detectLifecycleConflicts(commands);
  results.push({ id: "rose.prompts", status: conflicts.length === 0 ? "PASS" : "ERROR", evidence: conflicts.length === 0 ? "five lifecycle/review prompts have unique ownership" : `conflicts=${conflicts.map((item) => item.name).join(",")}` });
  const compactRegistered = commands.some((command) => command.name === "aili-compact");
  try {
    const source = options.ailiCompactEvidence ?? collectLocalAiliCompactHealthEvidence;
    const evidence = typeof source === "function" ? await source() : source;
    results.push(assessAiliCompactHealth(compactRegistered, evidence));
  } catch (error) {
    results.push({ id: "aili.compact", status: "ERROR", evidence: `health-probe=${boundedErrorName(error)}` });
  }
  results.push(await inspectPiCompactionSettings(options.home));

  try {
    const errors = await validateRegistry();
    const { capabilities, compatibility } = await loadRegistry();
    results.push({ id: "capability.registry", status: errors.length === 0 ? "PASS" : "ERROR", evidence: errors.length === 0 ? `capabilities=${capabilities.capabilities.length}; skills=${compatibility.records.length}` : errors.slice(0, 5).join("; ") });
    const optional = capabilities.capabilities.filter((item) => item.class === "optional");
    results.push({ id: "optional.packs", status: "SKIP", evidence: optional.map((item) => `${item.id}:${item.optionalPack?.id}`).join(",") });
  } catch (error) {
    results.push({ id: "capability.registry", status: "ERROR", evidence: boundedError(error) });
  }

  try {
    const [profileErrors] = await Promise.all([
      validateRoleProfiles(),
      ...[
        "src/runtime/persistent-agents/runtime.ts",
        "src/runtime/persistent-agents/storage.ts",
        "src/runtime/persistent-agents/task-coordinator.ts",
        "src/runtime/persistent-agents/hub.ts",
        "src/runtime/persistent-agents/output-delivery.ts",
      ].map((path) => readFile(new URL(path, ROOT), "utf8")),
    ]);
    results.push({
      id: "roles.agents",
      status: profileErrors.length === 0 ? "PASS" : "ERROR",
      evidence: profileErrors.length === 0 ? "profiles=20; selectors=19 specialized + general" : profileErrors.slice(0, 3).join("; "),
    });
    const liveErrors = await validateLiveVerification();
    results.push({
      id: "agent.framework",
      status: profileErrors.length > 0 ? "ERROR" : liveErrors.length > 0 ? "UNVERIFIED" : "PASS",
      evidence: profileErrors.length > 0
        ? `public runtime registered but profile validation failed: ${profileErrors.slice(0, 3).join("; ")}`
        : liveErrors.length > 0
          ? `public tools=task,hub; deterministic runtime gates pass; ${liveErrors.slice(0, 2).join("; ")}`
          : "public tools=task,hub; legacy subagent absent; deterministic and Pi 0.82.1 provider/sandbox/external-workspace lifecycle gates pass",
    });
  } catch (error) {
    results.push({ id: "agent.framework", status: "ERROR", evidence: boundedError(error) });
  }
  results.push({ id: "permission.native", ...nativeIntegrationDiagnostics(pi.getCommands()) });
  try {
    const global = await inspectGlobalResources(options.home);
    const ready = global.appendSystem === "installed" && global.roles.missing.length === 0;
    results.push({ id: "global.resources", status: ready ? "PASS" : "UNVERIFIED", evidence: `append=${global.appendSystem}; roles=${global.roles.installed}/${global.roles.expected}; stale=${global.roles.stale.length}; path=${global.roleDirectory}` });
  } catch (error) {
    results.push({ id: "global.resources", status: "ERROR", evidence: boundedError(error) });
  }
  const platform = options.platform ?? process.platform;
  results.push({ id: "platform", status: platform === "linux" ? "PASS" : "ERROR", evidence: `platform=${platform}; supported=linux; node=${process.version}` });
  const provenanceErrors = await validateProvenance();
  results.push({ id: "provenance", status: provenanceErrors.length === 0 ? "PASS" : "ERROR", evidence: provenanceErrors.length === 0 ? "notices and SPDX SBOM are complete" : provenanceErrors.slice(0, 3).join("; ") });

  return {
    schemaVersion: 1,
    status: results.every((item) => item.status === "PASS" || item.status === "SKIP") ? "PASS" : "NON_PASS",
    results,
  };
}

export function assessPiCompactionSettings(globalText: string | undefined, projectText?: string): DoctorResult {
  const global = parsePiSettings(globalText);
  if (global.state !== "valid") {
    return { id: "pi.compaction", status: "ERROR", evidence: `global=${global.state}; project=not-evaluated` };
  }
  if (global.value.compaction?.enabled !== false) {
    return { id: "pi.compaction", status: "ERROR", evidence: "global=auto-enabled-or-unset; project=not-evaluated" };
  }
  const project = parsePiSettings(projectText);
  if (project.state === "missing") return { id: "pi.compaction", status: "PASS", evidence: "global=disabled; project=absent" };
  if (project.state !== "valid") return { id: "pi.compaction", status: "ERROR", evidence: `global=disabled; project=${project.state}` };
  if (project.value.compaction?.enabled === true) return { id: "pi.compaction", status: "ERROR", evidence: "global=disabled; project=override-enabled" };
  return { id: "pi.compaction", status: "PASS", evidence: `global=disabled; project=${project.value.compaction?.enabled === false ? "disabled" : "no-override"}` };
}

export async function inspectPiCompactionSettings(home = process.env.HOME, cwd = process.cwd()): Promise<DoctorResult> {
  if (!home) return { id: "pi.compaction", status: "ERROR", evidence: "global=home-unavailable; project=not-evaluated" };
  const global = await readOptionalSettings(join(home, ".pi", "agent", "settings.json"));
  if (global.state === "unreadable") return { id: "pi.compaction", status: "ERROR", evidence: "global=unreadable; project=not-evaluated" };
  const project = await readOptionalSettings(join(cwd, ".pi", "settings.json"));
  if (project.state === "unreadable") return { id: "pi.compaction", status: "ERROR", evidence: "global=unchecked; project=unreadable" };
  return assessPiCompactionSettings(global.text, project.text);
}

const REQUIRED_COMPACT_INVARIANTS = ["reducer", "reference", "projection", "recap", "prompt", "nativeHook"] as const;
const OPTIONAL_COMPACT_INVARIANTS = ["cache", "live", "hostOrdering"] as const;
const SAFE_EVIDENCE_ERROR = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;

/** Pure, injectable AILI Compact health projection. */
export function assessAiliCompactHealth(commandRegistered: boolean, evidence: AiliCompactHealthEvidence): DoctorResult {
  const required = REQUIRED_COMPACT_INVARIANTS.map((name) => [name, evidence[name]] as const);
  const optional = OPTIONAL_COMPACT_INVARIANTS.map((name) => [name, evidence[name]] as const);
  const requiredFailure = required.some(([, item]) => item.status === "fail");
  const requiredUnknown = required.some(([, item]) => item.status === "unverified");
  const optionalFailure = optional.some(([, item]) => item?.status === "fail");
  const optionalUnknown = optional.some(([, item]) => !item || item.status === "unverified");
  const status: DoctorStatus = !commandRegistered || requiredFailure
    ? "ERROR"
    : requiredUnknown
      ? "UNVERIFIED"
      : optionalFailure
        ? "WARN"
        : optionalUnknown
          ? "UNVERIFIED"
          : "PASS";
  const fields = [
    `command=${commandRegistered ? "registered" : "missing"}`,
    ...required.map(([name, item]) => renderCompactInvariant(name, item)),
    ...optional.map(([name, item]) => renderCompactInvariant(name, item ?? { status: "unverified" })),
  ];
  return { id: "aili.compact", status, evidence: fields.join(";").slice(0, 480) };
}

/** Deterministic, provider-free local invariant evidence. */
export function collectLocalAiliCompactHealthEvidence(): AiliCompactHealthEvidence {
  const controlEntry: SessionLikeEntry = {
    id: "health-control", type: "custom", customType: AILI_COMPACT_ENTRY,
    data: { schema: AILI_COMPACT_SCHEMA, id: "health-control", kind: "control", epochId: "root", control: "off" },
  };
  const reduced = reduceCompactState([controlEntry]);
  const messages: ProjectionMessage[] = [
    { role: "user", content: "health-user" },
    { role: "assistant", content: "health-source" },
  ];
  const entries: SessionLikeEntry[] = messages.map((message, index) => ({ id: `health-${index + 1}`, type: "message", message }));
  const baseState: CompactState = {
    epochId: "root", enabled: true, autoCooling: true, manualMode: false, cachePanel: false,
    hasSessionControl: false, hasAutoCoolingControl: false, hasManualControl: false, hasPanelControl: false,
    blocks: new Map(), policyDecisions: [], diagnostics: [],
  };
  const catalog = buildReferenceCatalog(entries, baseState);
  const identity = new Map(entries.map((entry, index) => [entry.id, index]));
  const unchanged = projectMessages(messages, baseState, identity);
  const malformed: ProjectionMessage[] = [{ role: "assistant", content: "health-malformed" }];
  const failOpen = projectMessages(malformed, baseState, new Map());
  const block = {
    id: "health-block", kind: "semantic" as const, epochId: "root", sourceEntryIds: [entries[1]!.id],
    sourceDigest: sourceDigest(entries, [entries[1]!.id]), summary: "health-summary", active: true,
    mode: "message" as const, topic: "health", batchTopic: "health", anchorEntryId: entries[1]!.id,
    runId: "health-run", childBlockIds: [], generation: "young" as const, survivedCount: 0, age: 0,
  };
  const recap = projectMessages(messages, { ...baseState, blocks: new Map([[block.id, block]]) }, identity);
  let telemetry = emptyCacheTelemetry();
  for (let index = 0; index < 5; index += 1) telemetry = recordCacheTelemetry(telemetry, { input: 10, cacheRead: 90, cacheWrite: 0 }, true, undefined);
  const nativeOk = decideNativeCompaction({ reason: "manual", healthy: false }).cancel
    && decideNativeCompaction({ reason: "threshold", healthy: false }).cancel
    && decideNativeCompaction({ reason: "overflow", healthy: false }).cancel;
  return {
    reducer: localCompactEvidence(!reduced.enabled && reduced.diagnostics.length === 0, 1, digest({ enabled: reduced.enabled, diagnostics: reduced.diagnostics })),
    reference: localCompactEvidence(catalog.messages.map((item) => item.ref).join(",") === "m000001,m000002" && SHA256.test(catalog.catalogId), catalog.messages.length, catalog.catalogId),
    projection: localCompactEvidence(unchanged.diagnostic === undefined && unchanged.messages[0] === messages[0] && failOpen.messages === malformed && failOpen.diagnostic === "missing-user-message", unchanged.messages.length, unchanged.hash),
    recap: localCompactEvidence(recap.diagnostic === undefined && recap.messages.length === 3 && recap.messages[1]?.role === "assistant" && recap.messages[2]?.role === "toolResult" && recap.messages[2]?.toolName === "aili_context_recap", recap.messages.length, recap.hash),
    prompt: localCompactEvidence(COMPACT_PROMPT_SLOTS.length === 6 && new Set(COMPACT_PROMPT_SLOTS).size === 6, COMPACT_PROMPT_SLOTS.length, digest(COMPACT_PROMPT_SLOTS)),
    nativeHook: localCompactEvidence(nativeOk, 3, digest(["manual-cancel", "threshold-cancel", "overflow-cancel"])),
    cache: localCompactEvidence(telemetry.window.length === 5 && telemetry.hitRate === 90, telemetry.window.length, digest({ samples: telemetry.window.length, hitRate: telemetry.hitRate })),
    live: { status: "unverified", error: "uv-live-1" },
    hostOrdering: { status: "unverified", error: "uv-ext-order-1" },
  };
}

function localCompactEvidence(ok: boolean, count: number, hash: string): AiliHealthInvariantEvidence {
  return ok ? { status: "pass", count, hash } : { status: "fail", error: "local-invariant-failed" };
}

function parsePiSettings(text: string | undefined): { state: "valid"; value: { compaction?: { enabled?: unknown } } } | { state: "missing" | "malformed" | "non-object" } {
  if (text === undefined) return { state: "missing" };
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { state: "non-object" };
    const compaction = (value as { compaction?: unknown }).compaction;
    if (compaction !== undefined && (compaction === null || typeof compaction !== "object" || Array.isArray(compaction))) return { state: "non-object" };
    return { state: "valid", value: value as { compaction?: { enabled?: unknown } } };
  } catch {
    return { state: "malformed" };
  }
}

async function readOptionalSettings(path: string): Promise<{ state: "readable" | "missing" | "unreadable"; text?: string }> {
  try {
    return { state: "readable", text: await readFile(path, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
    return { state: "unreadable" };
  }
}

function renderCompactInvariant(name: string, evidence: AiliHealthInvariantEvidence): string {
  const parts = [`${name}=${evidence.status}`];
  if (Number.isSafeInteger(evidence.count) && evidence.count! >= 0 && evidence.count! <= 1_000_000) parts.push(`n=${evidence.count}`);
  if (evidence.hash && SHA256.test(evidence.hash)) parts.push(`sha256=${evidence.hash.slice(0, 12)}`);
  if (evidence.error) parts.push(`error=${SAFE_EVIDENCE_ERROR.test(evidence.error) ? evidence.error.toLowerCase() : "invalid-evidence-error"}`);
  return parts.join(":");
}

function boundedErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : "unknown";
  return SAFE_EVIDENCE_ERROR.test(name) ? name.toLowerCase() : "invalid-evidence-error";
}

export async function runBoundedProbe(
  id: string,
  timeoutMs: number,
  probe: () => Promise<string>,
): Promise<DoctorResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const evidence = await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`probe timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    if (typeof evidence !== "string" || evidence.trim() === "") {
      return { id, status: "UNVERIFIED", evidence: "probe returned malformed or empty evidence" };
    }
    return { id, status: "PASS", evidence: evidence.slice(0, 240) };
  } catch (error) {
    return { id, status: "ERROR", evidence: boundedError(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function formatDoctorReport(report: DoctorReport): string {
  return [`AILI doctor: ${report.status}`, ...report.results.map((item) => `${item.status.padEnd(10)} ${item.id}: ${item.evidence}`)].join("\n");
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 240);
}

export function registerDoctor(pi: ExtensionAPI): void {
  pi.registerCommand("aili-doctor", {
    description: "Report AILI runtime health (append --json for machine-readable output)",
    handler: async (args, context) => {
      const report = await runDoctor(pi);
      context.ui.notify(args.trim() === "--json" ? JSON.stringify(report, null, 2) : formatDoctorReport(report), report.status === "PASS" ? "info" : "warning");
    },
  });
}
