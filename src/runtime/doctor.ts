import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { detectLifecycleConflicts } from "./conflicts.js";
import { loadRegistry, validateLiveVerification, validateProvenance, validateRegistry } from "./registry.js";
import { inspectGlobalResources } from "./global-resources.js";
import { nativeIntegrationDiagnostics } from "./native-integrations.js";
import { validateRoleProfiles } from "./roles.js";

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

export async function runDoctor(
  pi: Pick<ExtensionAPI, "getCommands">,
  options: { platform?: NodeJS.Platform; home?: string } = {},
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
    const [profileErrors, liveErrors] = await Promise.all([
      validateRoleProfiles(),
      validateLiveVerification(),
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
    results.push({
      id: "agent.framework",
      status: profileErrors.length === 0 && liveErrors.length === 0 ? "PASS" : profileErrors.length > 0 ? "ERROR" : "UNVERIFIED",
      evidence: profileErrors.length > 0
        ? `public runtime registered but profile validation failed: ${profileErrors.slice(0, 3).join("; ")}`
        : liveErrors.length > 0
          ? `public tools=task,hub; legacy subagent absent; ${liveErrors.slice(0, 2).join("; ")}`
          : "public tools=task,hub; legacy subagent absent; deterministic and authorized provider/sandbox/external-workspace gates pass",
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
