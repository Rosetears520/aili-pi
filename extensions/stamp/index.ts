import type { EntryRenderer, ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { type Component, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export const STAMP_COMMAND_NAME = "stamp" as const;
export const STAMP_ENTRY_TYPE = "aili-stamp" as const;
export const MAX_TOOL_OBSERVATIONS = 256;
const MAX_REPORTED_TEXT = 96;
const STOP_REASONS = ["stop", "toolUse", "length", "error", "aborted"] as const;

type StopReason = (typeof STOP_REASONS)[number];
type ToolOutcome = "success" | "error";

/** Version 1 deliberately contains only creation data and is retained outside model context. */
export interface MessageStampV1 {
  readonly version: 1;
  readonly kind: "message";
  readonly role: "user" | "assistant";
  readonly timestamp: number;
}

/** Version 2 records observed local timing and Pi/provider-reported provenance when available. */
export interface AssistantStampV2 {
  readonly version: 2;
  readonly kind: "assistant";
  readonly timestamp: number;
  readonly completedAt?: number;
  readonly firstContentAt?: number;
  readonly provenance?: StampProvenance;
}

/** Version 3 additionally retains the actual active Pi thinking level for this turn. */
export interface AssistantStampV3 {
  readonly version: 3;
  readonly kind: "assistant";
  readonly timestamp: number;
  readonly completedAt?: number;
  readonly firstContentAt?: number;
  readonly thinking?: string;
  readonly provenance?: StampProvenance;
}

/** Tool call IDs are used only in memory to pair events and are never persisted. */
export interface ToolStampV1 {
  readonly version: 1;
  readonly kind: "tool";
  readonly name: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly outcome: ToolOutcome;
}

export interface StampProvenance {
  readonly api: string;
  readonly provider: string;
  readonly requestedModel: string;
  readonly responseModel?: string;
  readonly stopReason?: StopReason;
  readonly usage?: Readonly<{ inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCost?: number }>;
}

export type StampEntry = MessageStampV1 | AssistantStampV2 | AssistantStampV3 | ToolStampV1;

interface AssistantObservation {
  readonly timestamp: number;
  firstContentAt?: number;
}
interface CompletedAssistantObservation extends AssistantObservation {
  readonly completedAt: number;
}
interface ToolObservation {
  readonly name: string;
  readonly startedAt: number;
  completedAt?: number;
  outcome?: ToolOutcome;
}

/** Reject unknown schema fields and incomplete/invalid timing rather than repairing or deriving them. */
export function isStampEntry(value: unknown): value is StampEntry {
  if (!isRecord(value) || !Number.isSafeInteger(value.version)) return false;
  if (value.version === 1 && value.kind === "message") {
    return hasOnly(value, ["version", "kind", "role", "timestamp"]) && (value.role === "user" || value.role === "assistant") && isTimestamp(value.timestamp);
  }
  if (value.version === 1 && value.kind === "tool") {
    return hasOnly(value, ["version", "kind", "name", "startedAt", "completedAt", "outcome"])
      && isReportedText(value.name) && isTimestamp(value.startedAt) && isTimestamp(value.completedAt)
      && value.completedAt >= value.startedAt && (value.outcome === "success" || value.outcome === "error");
  }
  if ((value.version !== 2 && value.version !== 3) || value.kind !== "assistant") return false;
  const keys = value.version === 3
    ? ["version", "kind", "timestamp", "completedAt", "firstContentAt", "thinking", "provenance"]
    : ["version", "kind", "timestamp", "completedAt", "firstContentAt", "provenance"];
  if (!hasOnly(value, keys) || !isTimestamp(value.timestamp)) return false;
  if (Object.hasOwn(value, "completedAt") && (!isTimestamp(value.completedAt) || value.completedAt < value.timestamp)) return false;
  const completedAt = value.completedAt;
  if (Object.hasOwn(value, "firstContentAt") && (!isTimestamp(completedAt) || !isTimestamp(value.firstContentAt) || value.firstContentAt < value.timestamp || value.firstContentAt > completedAt)) return false;
  if (Object.hasOwn(value, "thinking") && !isReportedText(value.thinking)) return false;
  return !Object.hasOwn(value, "provenance") || isStampProvenance(value.provenance);
}

export function isStampProvenance(value: unknown): value is StampProvenance {
  if (!isRecord(value) || !hasOnly(value, ["api", "provider", "requestedModel", "responseModel", "stopReason", "usage"])) return false;
  if (!isReportedText(value.api) || !isReportedText(value.provider) || !isReportedText(value.requestedModel)) return false;
  if (Object.hasOwn(value, "responseModel") && !isReportedText(value.responseModel)) return false;
  if (Object.hasOwn(value, "stopReason") && !STOP_REASONS.includes(value.stopReason as StopReason)) return false;
  if (!Object.hasOwn(value, "usage")) return true;
  if (!isRecord(value.usage) || !hasOnly(value.usage, ["inputTokens", "outputTokens", "totalTokens", "estimatedCost"]) || Object.keys(value.usage).length === 0) return false;
  return optionalNonNegativeInteger(value.usage.inputTokens) && optionalNonNegativeInteger(value.usage.outputTokens)
    && optionalNonNegativeInteger(value.usage.totalTokens) && optionalNonNegativeNumber(value.usage.estimatedCost);
}

/** Capture only reported scalar fields. No totals, costs, response models, or errors are derived. */
export function captureStampProvenance(message: unknown): StampProvenance | undefined {
  if (!isRecord(message)) return undefined;
  const api = exactReportedText(message.api);
  const provider = exactReportedText(message.provider);
  const requestedModel = exactReportedText(message.model);
  if (!api || !provider || !requestedModel) return undefined;
  const responseModel = exactReportedText(message.responseModel);
  const stopReason = STOP_REASONS.includes(message.stopReason as StopReason) ? message.stopReason as StopReason : undefined;
  const sourceUsage = isRecord(message.usage) ? message.usage : undefined;
  const inputTokens = nonNegativeInteger(sourceUsage?.input);
  const outputTokens = nonNegativeInteger(sourceUsage?.output);
  const totalTokens = nonNegativeInteger(sourceUsage?.totalTokens);
  const estimatedCost = nonNegativeNumber(isRecord(sourceUsage?.cost) ? sourceUsage.cost.total : undefined);
  const usage = sourceUsage ? {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(estimatedCost === undefined ? {} : { estimatedCost }),
  } : undefined;
  const result: StampProvenance = {
    api, provider, requestedModel,
    ...(responseModel ? { responseModel } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(usage && Object.keys(usage).length ? { usage } : {}),
  };
  return isStampProvenance(result) ? result : undefined;
}

export function formatStampEntry(entry: StampEntry): string {
  if (entry.kind === "tool") return `tool ${entry.name} · ${formatElapsed(entry.completedAt - entry.startedAt)} · ${entry.outcome}`;
  const clock = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  if (entry.kind === "message") return clock;
  const segments = [
    clock,
    ...(entry.firstContentAt === undefined ? (entry.completedAt === undefined ? [] : ["first n/a"]) : [`first ${formatElapsed(entry.firstContentAt - entry.timestamp)}`]),
    ...(entry.completedAt === undefined ? [] : [`total ${formatElapsed(entry.completedAt - entry.timestamp)}`]),
  ];
  if (entry.provenance) {
    segments.push(`${entry.provenance.requestedModel}${entry.provenance.responseModel ? ` → ${entry.provenance.responseModel}` : ""}${entry.version === 3 && entry.thinking ? ` ${entry.thinking}` : ""}`);
  } else if (entry.version === 3 && entry.thinking) {
    segments.push(entry.thinking);
  }
  const tokens = displayedTokenTotal(entry.provenance?.usage);
  if (tokens !== undefined) segments.push(`${tokens.toLocaleString()} tokens`);
  return segments.join(" · ");
}

export function createStampEntryRenderer(): EntryRenderer<StampEntry> {
  return (entry, _options, theme) => {
    const data = entry.data;
    return isStampEntry(data) ? leftAligned(() => [theme.fg("dim", formatStampEntry(data))]) : undefined;
  };
}

/** Pi-only lifecycle observer. Custom entries are rendered by Pi and excluded from model context. */
export function registerStampCommand(pi: ExtensionAPI, now: () => number = Date.now): void {
  pi.registerEntryRenderer(STAMP_ENTRY_TYPE, createStampEntryRenderer());
  let tuiActive = false;
  let assistant: AssistantObservation | undefined;
  let completed: CompletedAssistantObservation | undefined;
  const tools = new Map<string, ToolObservation>();

  pi.registerCommand(STAMP_COMMAND_NAME, {
    description: "Show retained, out-of-context Stamp timing and provenance status",
    handler: async (args, context) => openStamp(args, context),
  });
  pi.on("session_start", (_event, context) => { tuiActive = context.mode === "tui" && context.hasUI; assistant = undefined; completed = undefined; tools.clear(); });
  pi.on("turn_start", () => { assistant = undefined; completed = undefined; tools.clear(); });
  pi.on("message_start", (event) => {
    if (tuiActive && event.message.role === "assistant" && isTimestamp(event.message.timestamp)) assistant = { timestamp: event.message.timestamp };
  });
  pi.on("message_update", (event) => {
    if (!tuiActive || event.message.role !== "assistant" || !assistant || assistant.timestamp !== event.message.timestamp || assistant.firstContentAt !== undefined || !isMeaningfulUpdate(event.assistantMessageEvent)) return;
    const observed = now();
    if (isTimestamp(observed) && observed >= assistant.timestamp) assistant.firstContentAt = observed;
  });
  pi.on("message_end", (event) => {
    if (!tuiActive || !isTimestamp(event.message.timestamp)) return;
    if (event.message.role === "user") append(pi, { version: 1, kind: "message", role: "user", timestamp: event.message.timestamp });
    if (event.message.role !== "assistant") return;
    const observed = now();
    if (isTimestamp(observed) && observed >= event.message.timestamp) completed = { timestamp: event.message.timestamp, completedAt: observed, ...(assistant?.timestamp === event.message.timestamp && assistant.firstContentAt !== undefined && assistant.firstContentAt <= observed ? { firstContentAt: assistant.firstContentAt } : {}) };
    assistant = undefined;
  });
  pi.on("tool_execution_start", (event) => {
    if (!tuiActive || tools.size >= MAX_TOOL_OBSERVATIONS || tools.has(event.toolCallId) || !isReportedText(event.toolName)) return;
    const observed = now();
    if (isTimestamp(observed)) tools.set(event.toolCallId, { name: event.toolName, startedAt: observed });
  });
  pi.on("tool_execution_end", (event) => {
    const timing = tools.get(event.toolCallId); const observed = now();
    if (!tuiActive || !timing || timing.completedAt !== undefined || !isTimestamp(observed) || observed < timing.startedAt) { if (timing && (!isTimestamp(observed) || observed < timing.startedAt)) tools.delete(event.toolCallId); return; }
    timing.completedAt = observed; timing.outcome = event.isError ? "error" : "success";
  });
  pi.on("turn_end", (event, context) => {
    if (tuiActive && event.message.role === "assistant" && isTimestamp(event.message.timestamp)) {
      const timing = completed?.timestamp === event.message.timestamp ? completed : undefined;
      const provenance = captureStampProvenance(event.message);
      const thinking = exactReportedText(context?.thinkingLevel);
      append(pi, { version: 3, kind: "assistant", timestamp: event.message.timestamp, ...(timing ? { completedAt: timing.completedAt, ...(timing.firstContentAt === undefined ? {} : { firstContentAt: timing.firstContentAt }) } : {}), ...(thinking ? { thinking } : {}), ...(provenance ? { provenance } : {}) });
    }
    for (const result of event.toolResults) {
      if (!isRecord(result) || typeof result.toolCallId !== "string") continue;
      const timing = tools.get(result.toolCallId);
      if (timing?.completedAt !== undefined && timing.outcome) append(pi, { version: 1, kind: "tool", name: timing.name, startedAt: timing.startedAt, completedAt: timing.completedAt, outcome: timing.outcome });
    }
    assistant = undefined; completed = undefined; tools.clear();
  });
  pi.on("agent_end", () => { assistant = undefined; completed = undefined; tools.clear(); });
  pi.on("session_shutdown", () => { tuiActive = false; assistant = undefined; completed = undefined; tools.clear(); });
}

async function openStamp(args: string, context: ExtensionCommandContext): Promise<void> {
  if (args.trim()) throw new Error("/stamp does not accept arguments");
  if (context.mode !== "tui" || !context.hasUI) { context.ui.notify("Stamp is available only in the interactive Pi TUI", "warning"); return; }
  await context.ui.select("Stamp", ["Retained timing/provenance entries are outside model context", "Close"]);
}
function append(pi: ExtensionAPI, entry: StampEntry): void { if (isStampEntry(entry)) pi.appendEntry<StampEntry>(STAMP_ENTRY_TYPE, entry); }
function leftAligned(lines: () => readonly string[]): Component { return { render: (width) => lines().flatMap((line) => wrapTextWithAnsi(line, width)), invalidate() {} }; }
function isMeaningfulUpdate(value: unknown): boolean { return isRecord(value) && ((["text_delta", "thinking_delta", "toolcall_delta"].includes(value.type as string) && typeof value.delta === "string" && value.delta.length > 0) || (["text_end", "thinking_end"].includes(value.type as string) && typeof value.content === "string" && value.content.length > 0) || (value.type === "toolcall_end" && isRecord(value.toolCall))); }
function displayedTokenTotal(usage: StampProvenance["usage"] | undefined): number | undefined {
  if (!usage) return undefined;
  if (usage.totalTokens !== undefined) return usage.totalTokens;
  return usage.inputTokens !== undefined && usage.outputTokens !== undefined ? usage.inputTokens + usage.outputTokens : undefined;
}
function formatElapsed(milliseconds: number): string { return `${(Math.max(0, milliseconds) / 1_000).toFixed(1)}s`; }
function isTimestamp(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function isReportedText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= MAX_REPORTED_TEXT && !/[\x00-\x1f\x7f-\x9f]/.test(value); }
function exactReportedText(value: unknown): string | undefined { return isReportedText(value) ? value : undefined; }
function nonNegativeInteger(value: unknown): number | undefined { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined; }
function nonNegativeNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined; }
function optionalNonNegativeInteger(value: unknown): boolean { return value === undefined || nonNegativeInteger(value) !== undefined; }
function optionalNonNegativeNumber(value: unknown): boolean { return value === undefined || nonNegativeNumber(value) !== undefined; }
function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
