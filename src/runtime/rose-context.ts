import type { BeforeAgentStartEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  projectAgentPhaseView,
  type AgentCatalogOwnerInput,
  type AgentCatalogResult,
} from "./agent-catalog.js";
import { detectLifecycleConflicts } from "./conflicts.js";
import type { RoleProfile } from "./roles.js";

export const LIFECYCLE_AGENT_GUIDANCE_MAX_CHARS = 16_384;

export interface LifecycleAgentGuidanceInput {
  profiles: readonly RoleProfile[];
  phase: string;
  activeOwners?: readonly AgentCatalogOwnerInput[];
}

export type LifecycleAgentGuidanceProvider = () => LifecycleAgentGuidanceInput | undefined;

export interface RoseContextOptions {
  lifecycleAgentGuidanceProvider?: LifecycleAgentGuidanceProvider;
  workflowSystem?: string;
}

const CORE_GOVERNANCE_LINES = [
  "- ordinary_routing=Scan before duplicating material discovery or execution; prefer an exact Specialized Agent when one routing row clearly matches; use general only when no specialist fits or for ordinary compatibility.",
  "- formal_routing=ROSE owns decisions, decomposition, integration, and final verification; every ready Agent-owned formal package must use its exact Specialized owner; ordinary benefit logic cannot replace that owner; general is not a formal package owner.",
  "- persistent_continuation=Reuse the same Agent identity only while package, role, scope, permissions, acceptance boundary, and expected evidence remain unchanged; new scope, package, or claim requires a new job or Agent; inspect async output before dependent work or the final verdict.",
  "- human_artifacts=Human-facing persisted prose uses ordinary language without epistemic claim-tag prefixes.",
  "- authorization=Artifacts may record decisions and authorization but never create them; final test-plan acceptance does not start BUILD or authorize implementation; YOLO changes tool permissions only and never implies BUILD, commit, push, or release authorization.",
] as const;

function projectRuleState(event: BeforeAgentStartEvent): string {
  const paths = event.systemPromptOptions.contextFiles
    ?.map((file) => file.path)
    .filter((path) => /(^|\/)AGENTS\.md$/i.test(path));
  if (!paths || paths.length === 0) return "project_rules=unverified (no AGENTS.md reported by Pi)";
  return `project_rules=loaded (${paths.join(", ")})`;
}

function taskIsActive(pi: ExtensionAPI): boolean {
  return pi.getActiveTools().includes("task");
}

export function renderLifecycleAgentGuidance(
  input: LifecycleAgentGuidanceInput,
): AgentCatalogResult<string> {
  const view = projectAgentPhaseView(input.profiles, input.phase, input.activeOwners ?? []);
  if (!view.ok) return view;

  const lines = [
    "## Active formal lifecycle Agent guidance",
    `- phase=${view.value.phase}`,
    "- routing=Ordinary Pi remains benefit-based and general-compatible; this active formal lifecycle requires every ready Agent-owned package to use its exact Specialized selector, ordinary benefit logic cannot replace that owner, and general is not a formal package owner.",
    "- rose_authority=ROSE owns decomposition, material decisions, result disposition, integration, final verification, phase advancement, and verdict.",
    "- formal_dispatch=Set task.agent to the exact package selector and explicitly set task.async.",
    "- sync=Prerequisites use task.async:false with Join: immediate.",
    "- async=Use task.async:true only for independent packages with a stable named Join; collect terminal state and inspect output/history before dependents or phase gates.",
    "- waiver=Direct execution of Agent-owned scope requires a valid waiver recorded before the work.",
    "- worker_boundary=Workers return evidence only; they never write the owning formal-task-board.md/progress.txt or decide phase, acceptance, or verdict.",
    "### Relevant Specialized roles",
    ...view.value.entries.map((entry) => {
      const activePackages = entry.activePackages.length === 0
        ? "none"
        : entry.activePackages
          .map((active) => `${active.packageId}:${active.status} (${active.dispatchReason})`)
          .join("; ");
      return `- ${entry.selector} | responsibility=${entry.description} | use=${entry.routing.positiveTriggers.join(" / ")} | avoid=${entry.routing.nearMisses.join(" / ")} | evidence=${entry.routing.expectedEvidence.join(" / ")} | phase_affinity=${entry.routing.phaseAffinity.join("/")} (advisory only; grants no tools or permissions) | execution=${entry.routing.executionGuidance} | status=${entry.status} | recommended=${entry.recommended ? "yes" : "no"} | active_packages=${activePackages}`;
    }),
  ];
  const content = lines.join("\n");
  if (content.length > LIFECYCLE_AGENT_GUIDANCE_MAX_CHARS) {
    return {
      ok: false,
      diagnostics: [{
        code: "LIFECYCLE_GUIDANCE_LIMIT_EXCEEDED",
        message: "Active lifecycle Agent guidance exceeds its model-context character limit.",
        phase: view.value.phase,
      }],
    };
  }
  return { ok: true, value: content, diagnostics: [] };
}

export function buildRoseAppendix(
  event: BeforeAgentStartEvent,
  pi: ExtensionAPI,
  lifecycle?: LifecycleAgentGuidanceInput,
): string {
  const conflicts = detectLifecycleConflicts(pi.getCommands());
  const conflictState = conflicts.length === 0
    ? "lifecycle_conflicts=none-observed"
    : `lifecycle_conflicts=non-pass (${conflicts.map((conflict) => conflict.name).join(", ")})`;
  const lines = [
    "## AILI runtime summary",
    `- ${projectRuleState(event)}`,
    `- ${conflictState}`,
    "- rose_static_rules=validated rose-aili Workflow system bundle injected by this Extension; legacy APPEND_SYSTEM is report-only",
    ...CORE_GOVERNANCE_LINES,
  ];
  const activeTask = taskIsActive(pi);
  if (activeTask) {
    lines.push(
      "- task_runtime=AILI-owned persistent task/hub surface (20 canonical Agent selectors; parent-scoped Pi sessions, stable Agent/job IDs, async delivery, park/revive, model overrides, tool ceilings, and credential hard denial; no legacy subagent alias)",
      "- delegation_policy=benefit-based (Agents improve efficiency and preserve parent context; ordinary direct work remains valid when delegation has no concrete benefit; omitted task.agent retains general compatibility; no Agent call unlocks mutation)",
    );
  }
  lines.push(
    "- permission_runtime=pi-permission-modes (Default/Plan/Build/YOLO; /perm; Alt+M; sandbox availability is vendor-reported)",
    "- native_web=pi-web-access complete upstream surface; provider/network/filesystem side effects remain visible to the active permission policy",
    "- quota_status=pi-quota-status default enabled; its global state is maintained by the upstream extension",
    "- mcp_routing=CodeGraph for precise symbols/call paths/tests/impact; Graphify for macro cross-material structure; MemPalace for durable history; Context7 for current third-party docs; Playwright for real browser behavior; filesystem tools for current disk/generated/unindexed data. Indexes navigate only; current disk and focused verification decide correctness. Do not chain MCP tools redundantly by default.",
    "- capability_registry=available; optional or unavailable capability decisions must report SKIP/WARN and must not claim work ran",
    "- doctor=available (/aili-doctor; current core remains non-pass until required provenance and release evidence pass)",
  );
  if (activeTask && lifecycle) {
    const guidance = renderLifecycleAgentGuidance(lifecycle);
    lines.push(
      guidance.ok
        ? guidance.value
        : `## Active formal lifecycle Agent guidance\n- lifecycle_agent_guidance=non-pass (${guidance.diagnostics.map((diagnostic) => diagnostic.code).join(", ") || "UNKNOWN"})`,
    );
  }
  return lines.join("\n");
}

export function registerRoseContext(pi: ExtensionAPI, options: RoseContextOptions = {}): void {
  pi.on("before_agent_start", (event) => {
    const lifecycle = taskIsActive(pi) ? options.lifecycleAgentGuidanceProvider?.() : undefined;
    const workflowSystem = options.workflowSystem?.trim();
    return {
      systemPrompt: [event.systemPrompt, workflowSystem, buildRoseAppendix(event, pi, lifecycle)].filter(Boolean).join("\n\n"),
    };
  });
}
