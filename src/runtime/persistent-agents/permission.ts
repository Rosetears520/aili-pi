import { isOutside } from "pi-permission-modes/src/paths.ts";
import { analyzeBash } from "pi-permission-modes/src/bash-parse.ts";
import type { Action, ModeDef, Surface } from "pi-permission-modes/src/schema.ts";
import { decide, decideBashCommand, mostRestrictive } from "../../vendor/pi-permission-modes/resolve.js";
import { bashMentionsCredentialPath, isProtectedChildPath } from "../credential-guard.js";
import { InteractionBroker, type InteractionRecord } from "./interaction-broker.js";
import type { QuestionnaireQuestion } from "../../questionnaire/model.js";

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

/** Fixed labels for the runtime-owned candidate questionnaire. These are
 * deliberately not accepted through the generic interaction answer path. */
export const SELECTION_CONFIRM_OPTION = "Confirm this selection";
export const SELECTION_DENY_OPTION = "Deny";
export type SelectionDecision = "confirm" | "deny";

export interface SelectionRequestPacket {
  requestId: string;
  agentId: string;
  jobId: string;
  candidate: Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const expected = new Set(allowed);
  return Object.keys(value).every((key) => expected.has(key))
    && allowed.every((key) => Object.prototype.hasOwnProperty.call(value, key) || key === "description" || key === "recommended" || key === "unavailable");
}

function sameQuestion(left: QuestionnaireQuestion, right: QuestionnaireQuestion): boolean {
  if (!left || typeof left !== "object" || !Array.isArray(left.options)
    || !right || typeof right !== "object" || !Array.isArray(right.options)) return false;
  if (!exactKeys(left as unknown as Record<string, unknown>, ["id", "header", "question", "options", "multiple", "recommended"])) return false;
  if (left.id !== right.id || left.header !== right.header || left.question !== right.question || left.multiple !== right.multiple) return false;
  if ((left.recommended ?? undefined) !== (right.recommended ?? undefined)) return false;
  if (left.options.length !== right.options.length) return false;
  return left.options.every((option, index) => {
    const expected = right.options[index];
    if (!expected || !exactKeys(option as unknown as Record<string, unknown>, ["label", "description"])) return false;
    return option.label === expected.label && (option.description ?? undefined) === (expected.description ?? undefined);
  });
}

/** Validate the complete result returned by askUserQuestionnaire for the
 * runtime-owned selection. Any custom/extra/mismatched answer is rejected. */
export function selectionQuestionnaireDecision(
  result: unknown,
  expected: QuestionnaireQuestion,
): SelectionDecision | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const raw = result as Record<string, unknown>;
  if (!exactKeys(raw, ["questions", "answers", "cancelled", "unavailable"])) return undefined;
  if (Object.prototype.hasOwnProperty.call(raw, "unavailable") && typeof raw.unavailable !== "boolean") return undefined;
  if (raw.cancelled !== false || raw.unavailable === true) return undefined;
  if (!expected || typeof expected !== "object" || !Array.isArray(expected.options)) return undefined;
  if (expected.multiple !== false
    || expected.options.length !== 2
    || expected.options[0]?.label !== SELECTION_CONFIRM_OPTION
    || expected.options[1]?.label !== SELECTION_DENY_OPTION) return undefined;
  if (!Array.isArray(raw.questions) || raw.questions.length !== 1 || !sameQuestion(raw.questions[0] as QuestionnaireQuestion, expected)) return undefined;
  if (!Array.isArray(raw.answers) || raw.answers.length !== 1) return undefined;
  const answer = raw.answers[0];
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return undefined;
  const answerRecord = answer as Record<string, unknown>;
  if (!exactKeys(answerRecord, ["id", "selectedOptions"])) return undefined;
  if (answerRecord.id !== expected.id || !Array.isArray(answerRecord.selectedOptions) || answerRecord.selectedOptions.length !== 1) return undefined;
  const selected = answerRecord.selectedOptions[0];
  if (selected === SELECTION_CONFIRM_OPTION) return "confirm";
  if (selected === SELECTION_DENY_OPTION) return "deny";
  return undefined;
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
  private readonly interactions = new InteractionBroker();
  /** All candidate dialogs share the existing interaction broker and are
   * serialized so a waiting same-scope request can recheck before rendering. */
  private selectionTail: Promise<void> = Promise.resolve();
  private selectionClosed = false;

  constructor(private readonly prompt: ApprovalPrompt) {}

  pendingCount(jobId?: string): number { return this.interactions.pendingRecords(jobId).length; }

  async request(packet: Omit<ApprovalRequestPacket, "requestId">, signal?: AbortSignal): Promise<"allow" | "deny"> {
    if (!this.prompt.hasUI || signal?.aborted) return "deny";
    return this.interactions.request<Omit<ApprovalRequestPacket, "requestId">, "allow" | "deny">({
      kind: "permission",
      agentId: packet.agentId,
      jobId: packet.jobId,
      request: packet,
      signal,
      fallback: "deny" as const,
      render: async (interaction) => {
        const fullPacket: ApprovalRequestPacket = { ...packet, requestId: interaction.id, summary: redactCredentialText(packet.summary).slice(0, 500) };
        return await this.prompt.ask(fullPacket) === "allow" ? "allow" as const : "deny" as const;
      },
    });
  }

  async requestQuestion<T>(input: { agentId: string; jobId: string; question: string; render: () => Promise<T>; fallback: T; signal?: AbortSignal }): Promise<T> {
    return this.interactions.request({ kind: "question", agentId: input.agentId, jobId: input.jobId, request: { question: input.question }, render: input.render, fallback: input.fallback, signal: input.signal });
  }

  async requestSelection(input: {
    agentId: string;
    jobId: string;
    candidate: Record<string, unknown>;
    render: (record: InteractionRecord<Record<string, unknown>, SelectionDecision>) => Promise<SelectionDecision>;
    reuse?: () => boolean;
    /** Runs inside the serialized selection operation before waiters recheck. */
    onConfirmed?: () => void;
    signal?: AbortSignal;
  }): Promise<SelectionDecision | "reused"> {
    const operation = this.selectionTail.then(async () => {
      if (this.selectionClosed) return "deny" as const;
      if (input.reuse?.()) return "reused" as const;
      if (!this.prompt.hasUI || input.signal?.aborted) return "deny" as const;
      const decision = await this.interactions.request<Record<string, unknown>, SelectionDecision>({
        kind: "selection",
        agentId: input.agentId,
        jobId: input.jobId,
        request: input.candidate,
        render: input.render,
        fallback: "deny" as const,
        signal: input.signal,
      });
      if (decision === "confirm") input.onConfirmed?.();
      return decision;
    });
    this.selectionTail = operation.then(() => undefined, () => undefined);
    return await operation;
  }

  pendingInteractions(jobId?: string) { return this.interactions.pendingRecords(jobId); }
  answerInteraction(id: string, answer: unknown): boolean { return this.interactions.answer(id, answer); }
  shutdown(): void {
    this.selectionClosed = true;
    this.interactions.shutdown();
  }
}
