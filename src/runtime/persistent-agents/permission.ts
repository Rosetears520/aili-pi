import { isOutside } from "pi-permission-modes/src/paths.ts";
import { analyzeBash } from "pi-permission-modes/src/bash-parse.ts";
import type { Action, ModeDef, Surface } from "pi-permission-modes/src/schema.ts";
import { decide, decideBashCommand, mostRestrictive } from "../../vendor/pi-permission-modes/resolve.js";
import { bashMentionsCredentialPath, isProtectedChildPath } from "../credential-guard.js";

const FILE_SURFACE: Record<string, Surface> = {
  read: "read",
  write: "write",
  edit: "edit",
  grep: "grep",
  find: "find",
  ls: "ls",
};
const SECRET_KEY = /^(?:authorization|auth|credential|credentials|token|accessToken|refreshToken|secret|password|passwd|apiKey|api_key|privateKey|private_key)$/i;
const SECRET_ASSIGNMENT = /\b(?:authorization:\s*bearer|bearer)\s+\S+|\b(?:token|secret|password|passwd|api[_-]?key|private[_-]?key)\s*[=:]\s*\S+/i;
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/;

export interface CredentialFinding {
  path: string;
  reason: string;
}

export async function findCredentialMaterial(value: unknown, cwd = process.cwd(), path = "input", seen = new Set<object>()): Promise<CredentialFinding | undefined> {
  if (typeof value === "string") {
    if (PRIVATE_KEY_BLOCK.test(value)) return { path, reason: "private-key material" };
    if (SECRET_ASSIGNMENT.test(value)) return { path, reason: "credential-like assignment" };
    if (await isProtectedChildPath(cwd, value)) return { path, reason: "protected credential/auth path" };
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const finding = await findCredentialMaterial(value[index], cwd, `${path}[${index}]`, seen);
      if (finding) return finding;
    }
    return undefined;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key) && item !== undefined && item !== null && item !== "") return { path: `${path}.${key}`, reason: "credential-bearing field" };
    const finding = await findCredentialMaterial(item, cwd, `${path}.${key}`, seen);
    if (finding) return finding;
  }
  return undefined;
}

export async function assertNoCredentialMaterial(value: unknown, context: string, cwd = process.cwd()): Promise<void> {
  const finding = await findCredentialMaterial(value, cwd);
  if (finding) throw new Error(`${context} denied credential/auth/private-key material at ${finding.path} (${finding.reason})`);
}

export function redactCredentialText(value: string): string {
  return value
    .replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g, "<redacted-private-key>")
    .replace(/\b(authorization:\s*bearer|bearer)\s+\S+/gi, "$1 <redacted>")
    .replace(/\b(token|secret|password|passwd|api[_-]?key|private[_-]?key)\s*([=:])\s*\S+/gi, "$1$2<redacted>");
}

export interface ChildPermissionDecision {
  action: Action;
  toolName: string;
  target: string;
  reason: string;
  requiresSandbox: boolean;
  parserFallback?: boolean;
}

export interface ChildPermissionResolverOptions {
  mode: ModeDef;
  cwd: string;
  sandboxExecutorAvailable: boolean;
}

export class ChildPermissionResolver {
  constructor(private readonly options: ChildPermissionResolverOptions) {}

  get modeLabel(): string {
    return this.options.mode.label;
  }

  async decide(toolName: string, input: Record<string, unknown>): Promise<ChildPermissionDecision> {
    const credential = await findCredentialMaterial(input, this.options.cwd);
    if (credential) {
      return {
        action: "deny",
        toolName,
        target: credential.path,
        reason: `credential hard denial: ${credential.reason}`,
        requiresSandbox: false,
      };
    }
    const surface = FILE_SURFACE[toolName];
    if (surface) {
      const target = typeof input.path === "string" ? input.path : "";
      if (!target) return { action: "deny", toolName, target: "(missing path)", reason: "file tool path is missing", requiresSandbox: false };
      const action = decide(this.options.mode, surface, target, { isOutside: isOutside(this.options.cwd, target) });
      return { action, toolName, target, reason: `${this.options.mode.label} ${surface} policy`, requiresSandbox: false };
    }
    if (toolName === "bash") {
      const command = typeof input.command === "string" ? input.command : "";
      if (!command) return { action: "deny", toolName, target: "(empty command)", reason: "bash command is missing", requiresSandbox: false };
      if (bashMentionsCredentialPath(command)) return { action: "deny", toolName, target: "protected path", reason: "credential path in bash", requiresSandbox: false };
      const requiresSandbox = this.options.mode.sandbox.enabled;
      if (requiresSandbox && !this.options.sandboxExecutorAvailable) {
        return { action: "deny", toolName, target: command, reason: "mode requires sandboxed bash but no audited child sandbox executor is available", requiresSandbox: true };
      }
      if (!requiresSandbox) {
        const action = decide(this.options.mode, "bash", command);
        return { action, toolName, target: command, reason: `${this.options.mode.label} bash policy`, requiresSandbox: false };
      }
      const analysis = await analyzeBash(command, this.options.cwd);
      let action: Action;
      if (analysis.commands.length > 0) {
        action = analysis.commands
          .map((commandPart) => decideBashCommand(this.options.mode, commandPart.name, commandPart.args) ?? "allow")
          .reduce<Action>((left, right) => mostRestrictive(left, right) ?? "allow", "allow");
      } else {
        action = decide(this.options.mode, "bash", command);
      }
      if (analysis.outsideReason) action = mostRestrictive(action, "ask") ?? "ask";
      return {
        action,
        toolName,
        target: command,
        reason: analysis.outsideReason ?? `${this.options.mode.label} bash policy`,
        requiresSandbox: true,
        parserFallback: analysis.usedFallback,
      };
    }
    if (toolName === "web_search") {
      const target = typeof input.query === "string" ? input.query : "(empty)";
      return { action: decide(this.options.mode, "web_search", target), toolName, target, reason: `${this.options.mode.label} web_search policy`, requiresSandbox: false };
    }
    return { action: decide(this.options.mode, "tool", toolName), toolName, target: toolName, reason: `${this.options.mode.label} custom tool policy`, requiresSandbox: false };
  }
}

export interface ApprovalPrompt {
  hasUI: boolean;
  ask(packet: ApprovalRequestPacket): Promise<"allow" | "deny" | "dismiss">;
}

export interface ApprovalRequestPacket {
  requestId: string;
  agentId: string;
  jobId: string;
  toolName: string;
  summary: string;
  modeLabel: string;
}

interface PendingApproval {
  settle: (decision: "allow" | "deny") => void;
  jobId: string;
  signal?: AbortSignal;
  abortListener?: () => void;
}

export function brokeredChildPermission(
  resolver: ChildPermissionResolver,
  broker: ParentApprovalBroker,
  context: { agentId: string; jobId: string; signal?: AbortSignal },
): {
  decide: (toolName: string, input: Record<string, unknown>) => Promise<Action>;
  requestApproval: (packet: { toolName: string; summary: string }) => Promise<"allow" | "deny">;
} {
  return {
    decide: async (toolName, input) => (await resolver.decide(toolName, input)).action,
    requestApproval: async (packet) => await broker.request({
      agentId: context.agentId,
      jobId: context.jobId,
      toolName: packet.toolName,
      summary: packet.summary,
      modeLabel: resolver.modeLabel,
    }, context.signal),
  };
}

export class ParentApprovalBroker {
  private pending = new Map<string, PendingApproval>();
  private closed = false;
  private nextId = 0;

  constructor(private readonly prompt: ApprovalPrompt) {}

  pendingCount(jobId?: string): number {
    if (!jobId) return this.pending.size;
    return [...this.pending.values()].filter((pending) => pending.jobId === jobId).length;
  }

  async request(
    packet: Omit<ApprovalRequestPacket, "requestId">,
    signal?: AbortSignal,
  ): Promise<"allow" | "deny"> {
    if (this.closed || !this.prompt.hasUI || signal?.aborted) return "deny";
    const requestId = `approval-${++this.nextId}`;
    const fullPacket: ApprovalRequestPacket = { ...packet, requestId, summary: redactCredentialText(packet.summary).slice(0, 500) };
    let settleGate!: (decision: "allow" | "deny") => void;
    const gate = new Promise<"allow" | "deny">((resolve) => { settleGate = resolve; });
    const pending: PendingApproval = { settle: settleGate, signal, jobId: packet.jobId };
    if (signal) {
      pending.abortListener = () => settleGate("deny");
      signal.addEventListener("abort", pending.abortListener, { once: true });
    }
    this.pending.set(requestId, pending);
    const promptDecision = this.prompt.ask(fullPacket).then(
      (decision) => decision === "allow" ? "allow" as const : "deny" as const,
      () => "deny" as const,
    );
    const decision = await Promise.race([promptDecision, gate]);
    this.pending.delete(requestId);
    if (signal && pending.abortListener) signal.removeEventListener("abort", pending.abortListener);
    return decision;
  }

  shutdown(): void {
    this.closed = true;
    for (const pending of this.pending.values()) pending.settle("deny");
    this.pending.clear();
  }
}
