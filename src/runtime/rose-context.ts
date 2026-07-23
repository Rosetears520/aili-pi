import type { BeforeAgentStartEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectLifecycleConflicts } from "./conflicts.js";

function projectRuleState(event: BeforeAgentStartEvent): string {
  const paths = event.systemPromptOptions.contextFiles
    ?.map((file) => file.path)
    .filter((path) => /(^|\/)AGENTS\.md$/i.test(path));
  if (!paths || paths.length === 0) return "project_rules=unverified (no AGENTS.md reported by Pi)";
  return `project_rules=loaded (${paths.join(", ")})`;
}

export function buildRoseAppendix(event: BeforeAgentStartEvent, pi: ExtensionAPI): string {
  const conflicts = detectLifecycleConflicts(pi.getCommands());
  const conflictState = conflicts.length === 0
    ? "lifecycle_conflicts=none-observed"
    : `lifecycle_conflicts=non-pass (${conflicts.map((conflict) => conflict.name).join(", ")})`;
  return `## AILI runtime summary\n- ${projectRuleState(event)}\n- ${conflictState}\n- rose_static_rules=global APPEND_SYSTEM marker resource (not injected by this Extension)\n- task_runtime=pi-subagent adapter (global AILI profiles required; concurrency 2; no resume/chain/background/worktree/recursion)\n- permission_runtime=pi-permission-modes (Default/Plan/Build/YOLO; /perm; Alt+M; sandbox availability is vendor-reported)\n- native_web=pi-web-access complete upstream surface; provider/network/filesystem side effects remain visible to the active permission policy\n- quota_status=pi-quota-status default enabled; its global state is maintained by the upstream extension\n- capability_registry=available; optional or unavailable capability decisions must report SKIP/WARN and must not claim work ran\n- doctor=available (/aili-doctor; current core remains non-pass until required provenance and release evidence pass)`;
}

export function registerRoseContext(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${buildRoseAppendix(event, pi)}`,
  }));
}
