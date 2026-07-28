import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  BUNDLED_ROLE_SELECTORS,
  loadRoleProfiles,
  type RoleProfile,
} from "../roles.js";

const LEGACY_OR_TOP_LEVEL_ONLY_TOOLS = new Set(["subagent", "aili_task"]);
const BUILTIN_TOOL_NAMES = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
const CHILD_BRIDGE_TOOL_NAMES = new Set(["task", "hub"]);

export interface ParentToolSnapshot {
  active: string[];
  definitions: Map<string, ToolDefinition>;
}

export interface UnavailableTool {
  name: string;
  reason: "parent-inactive" | "parent-definition-missing" | "child-unloadable" | "role-ceiling" | "hard-guard" | "call-narrowing" | "spawn-policy";
}

export interface EffectiveToolPolicy {
  effectiveTools: string[];
  customTools: ToolDefinition[];
  unavailable: UnavailableTool[];
  parentActiveHashInput: string[];
}

export interface ComputeEffectiveToolsInput {
  parent: ParentToolSnapshot;
  childLoadable: Iterable<string>;
  childDefinitions?: Map<string, ToolDefinition>;
  role: RoleProfile;
  callTools?: string[];
  hardDenied?: Iterable<string>;
  currentDepth: number;
  configuredMaxDepth?: number;
}

export function captureParentToolSnapshot(session: Pick<AgentSession, "getActiveToolNames" | "getToolDefinition">): ParentToolSnapshot {
  const active = [...new Set(session.getActiveToolNames())];
  const definitions = new Map<string, ToolDefinition>();
  for (const name of active) {
    const definition = session.getToolDefinition(name);
    if (definition) definitions.set(name, definition);
  }
  return { active, definitions };
}

export interface SpawnDecision {
  allowed: boolean;
  target: string;
  depth: number;
  async: false;
  reason?: "unknown-selector" | "self-recursion" | "role-disallowed" | "depth-exceeded";
}

export function evaluateSpawn(
  role: RoleProfile,
  target: string,
  currentDepth: number,
  configuredMaxDepth = 2,
): SpawnDecision {
  const nextDepth = currentDepth + 1;
  if (!(BUNDLED_ROLE_SELECTORS as readonly string[]).includes(target)) {
    return { allowed: false, target, depth: nextDepth, async: false, reason: "unknown-selector" };
  }
  if (target === role.selector) {
    return { allowed: false, target, depth: nextDepth, async: false, reason: "self-recursion" };
  }
  if (!role.spawns.includes(target)) {
    return { allowed: false, target, depth: nextDepth, async: false, reason: "role-disallowed" };
  }
  const effectiveMaxDepth = Math.min(4, Math.max(0, configuredMaxDepth));
  if (nextDepth > effectiveMaxDepth) {
    return { allowed: false, target, depth: nextDepth, async: false, reason: "depth-exceeded" };
  }
  return { allowed: true, target, depth: nextDepth, async: false };
}

export function computeEffectiveTools(input: ComputeEffectiveToolsInput): EffectiveToolPolicy {
  const childLoadable = new Set(input.childLoadable);
  const hardDenied = new Set([...LEGACY_OR_TOP_LEVEL_ONLY_TOOLS, ...(input.hardDenied ?? [])]);
  const roleCeiling = input.role.toolPolicy === "inherit-parent" ? undefined : new Set(input.role.tools);
  const callCeiling = input.callTools ? new Set(input.callTools) : undefined;
  const unavailable: UnavailableTool[] = [];
  const effectiveTools: string[] = [];

  const report = (name: string, reason: UnavailableTool["reason"]) => {
    if (!unavailable.some((item) => item.name === name && item.reason === reason)) unavailable.push({ name, reason });
  };

  for (const name of input.parent.active) {
    if (roleCeiling && !roleCeiling.has(name)) {
      report(name, "role-ceiling");
      continue;
    }
    if (hardDenied.has(name)) {
      report(name, "hard-guard");
      continue;
    }
    if (callCeiling && !callCeiling.has(name)) {
      report(name, "call-narrowing");
      continue;
    }
    if (name === "task") {
      const hasSpawn = input.role.spawns.some((target) => evaluateSpawn(input.role, target, input.currentDepth, input.configuredMaxDepth).allowed);
      if (!hasSpawn) {
        report(name, "spawn-policy");
        continue;
      }
    }
    if (CHILD_BRIDGE_TOOL_NAMES.has(name) && !input.childDefinitions?.has(name)) {
      report(name, "child-unloadable");
      continue;
    }
    if (!input.parent.definitions.has(name) && !input.childDefinitions?.has(name) && !BUILTIN_TOOL_NAMES.has(name)) {
      report(name, "parent-definition-missing");
      continue;
    }
    if (!childLoadable.has(name)) {
      report(name, "child-unloadable");
      continue;
    }
    effectiveTools.push(name);
  }

  for (const name of roleCeiling ?? []) {
    if (!input.parent.active.includes(name)) report(name, "parent-inactive");
  }
  for (const name of callCeiling ?? []) {
    if (!input.parent.active.includes(name)) report(name, "parent-inactive");
  }

  const customTools = effectiveTools
    .filter((name) => !BUILTIN_TOOL_NAMES.has(name) || input.childDefinitions?.has(name))
    .map((name) => input.childDefinitions?.get(name) ?? input.parent.definitions.get(name))
    .filter((definition): definition is ToolDefinition => definition !== undefined);
  return {
    effectiveTools,
    customTools,
    unavailable,
    parentActiveHashInput: [...input.parent.active].sort(),
  };
}

export interface TrustedContextResource {
  kind: "rule" | "skill" | "context" | "shared";
  path: string;
  content: string;
  trusted: boolean;
}

export interface ChildPromptInput {
  runtimeEnvelope: string;
  role: RoleProfile;
  task: string;
  context?: string;
  cwd: string;
  workspace: { mode: "shared" | "isolated"; root: string; diagnostic?: string };
  resources?: TrustedContextResource[];
  approvedPlanRef?: string;
  sharedRefs?: string[];
}

export interface ChildPromptAssembly {
  systemPrompt: string;
  initialMessage: string;
  includedResources: Array<{ kind: TrustedContextResource["kind"]; path: string }>;
  diagnostics: string[];
}

function section(title: string, body: string | undefined): string[] {
  if (!body?.trim()) return [];
  return [`## ${title}`, "", body.trim(), ""];
}

export function assembleChildPrompt(input: ChildPromptInput): ChildPromptAssembly {
  if (!input.task.trim()) throw new Error("child task must be non-empty");
  const trusted = (input.resources ?? []).filter((resource) => resource.trusted);
  const untrusted = (input.resources ?? []).filter((resource) => !resource.trusted);
  const systemPrompt = [
    ...section("AILI persistent Agent runtime", input.runtimeEnvelope),
    ...section("Selected role profile", input.role.prompt),
    ...section("Workspace", `mode: ${input.workspace.mode}\nroot: ${input.workspace.root}${input.workspace.diagnostic ? `\ndiagnostic: ${input.workspace.diagnostic}` : ""}`),
    ...trusted.flatMap((resource) => section(`Trusted ${resource.kind}: ${resource.path}`, resource.content)),
    "The parent conversation is not part of this child context. Use only the explicit assignment/context and trusted resources above.",
  ].join("\n").trim();
  const initialMessage = [
    ...section("Assignment", input.task),
    ...section("Explicit context", input.context),
    ...section("Current working directory", input.cwd),
    ...section("Approved plan reference", input.approvedPlanRef),
    ...section("Shared references", input.sharedRefs?.join("\n")),
  ].join("\n").trim();
  return {
    systemPrompt,
    initialMessage,
    includedResources: trusted.map(({ kind, path }) => ({ kind, path })),
    diagnostics: untrusted.map((resource) => `${resource.kind}:${resource.path}: excluded because project/resource trust is inactive`),
  };
}

export interface TurnPolicyAudit {
  selector: string;
  profileHash: string;
  sourceHash: string;
  profileVersion: number;
  runtimeAdapterVersion: number;
  effectiveTools: string[];
  parentActiveTools: string[];
  unavailableTools: UnavailableTool[];
  depth: number;
  provider?: string;
  model?: string;
  thinking?: string;
}

export interface TurnRuntimeHandle {
  dispose(): void | Promise<void>;
}

export interface PrepareTurnInput<T extends TurnRuntimeHandle> {
  selector: string;
  parent: ParentToolSnapshot;
  childLoadable: Iterable<string>;
  childDefinitions?: Map<string, ToolDefinition>;
  callTools?: string[];
  hardDenied?: Iterable<string>;
  depth: number;
  configuredMaxDepth?: number;
  modelAudit?: { provider?: string; model?: string; thinking?: string };
  loadProfiles?: () => Promise<RoleProfile[]>;
  build: (role: RoleProfile, policy: EffectiveToolPolicy, audit: TurnPolicyAudit) => Promise<T>;
}

export class TurnBoundaryPolicyManager<T extends TurnRuntimeHandle> {
  private current?: { handle: T; key: string; audit: TurnPolicyAudit };
  private running = false;

  markRunning(): void {
    if (this.running) throw new Error("Agent already has an active turn");
    if (!this.current) throw new Error("Agent runtime is not prepared");
    this.running = true;
  }

  markSettled(): void {
    this.running = false;
  }

  getAudit(): TurnPolicyAudit | undefined {
    return this.current ? structuredClone(this.current.audit) : undefined;
  }

  async prepareAtTurnBoundary(input: PrepareTurnInput<T>): Promise<{ handle: T; audit: TurnPolicyAudit; rebuilt: boolean }> {
    if (this.running) throw new Error("cannot hot reload policy during an in-flight turn");
    const profiles = await (input.loadProfiles ?? loadRoleProfiles)();
    const role = profiles.find((candidate) => candidate.selector === input.selector);
    if (!role) throw new Error(`${input.selector}: selected role profile is unavailable or invalid`);
    const policy = computeEffectiveTools({
      parent: input.parent,
      childLoadable: input.childLoadable,
      childDefinitions: input.childDefinitions,
      role,
      callTools: input.callTools,
      hardDenied: input.hardDenied,
      currentDepth: input.depth,
      configuredMaxDepth: input.configuredMaxDepth,
    });
    const audit: TurnPolicyAudit = {
      selector: role.selector,
      profileHash: role.profileHash,
      sourceHash: role.sourceHash,
      profileVersion: role.profileVersion,
      runtimeAdapterVersion: role.runtimeAdapterVersion,
      effectiveTools: policy.effectiveTools,
      parentActiveTools: [...input.parent.active],
      unavailableTools: policy.unavailable,
      depth: input.depth,
      provider: input.modelAudit?.provider,
      model: input.modelAudit?.model,
      thinking: input.modelAudit?.thinking,
    };
    const key = JSON.stringify({
      selector: audit.selector,
      profileHash: audit.profileHash,
      sourceHash: audit.sourceHash,
      tools: audit.effectiveTools,
      parent: audit.parentActiveTools,
      depth: audit.depth,
      provider: audit.provider,
      model: audit.model,
      thinking: audit.thinking,
    });
    if (this.current?.key === key) return { handle: this.current.handle, audit: structuredClone(audit), rebuilt: false };

    if (this.current) {
      await this.current.handle.dispose();
      this.current = undefined;
    }
    const handle = await input.build(role, policy, audit);
    this.current = { handle, key, audit };
    return { handle, audit: structuredClone(audit), rebuilt: true };
  }

  async dispose(): Promise<void> {
    if (this.current) await this.current.handle.dispose();
    this.current = undefined;
    this.running = false;
  }
}
