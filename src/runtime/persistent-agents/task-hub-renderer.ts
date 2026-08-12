import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";
const SUMMARY_COLUMNS = 96;
const DETAIL_COLUMNS = 160;
const REDACTED = "[redacted]";

interface ToolRenderResultOptions {
  expanded: boolean;
  isPartial: boolean;
}

interface ToolRenderContext<TArgs> {
  args: TArgs;
  lastComponent?: unknown;
  executionStarted: boolean;
  isError: boolean;
}

export interface RendererTheme {
  fg(color: any, text: string): string;
  bold(text: string): string;
}

export interface TaskCallItem {
  task: string;
  name?: string;
  agent?: string;
  model?: string;
  async?: boolean;
  formalContext?: { changeId?: string };
}

export interface TaskCallArgs extends Partial<TaskCallItem> {
  context?: string;
  tasks?: TaskCallItem[];
}

export interface HubCallArgs {
  action?: string;
  agentId?: string;
  id?: string;
  jobId?: string;
  jobIds?: string[];
  messageIds?: string[];
  selector?: string;
  model?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function exactString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function redact(value: string): string {
  let redacted = value
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, `$1 ${REDACTED}`)
    .replace(/\b(api[_-]?key|token|password|passwd|secret|authorization|cookie)\s*[:=]\s*([^\s,;]+)/gi, `$1=${REDACTED}`)
    .replace(/(?:^|\s)(?:~\/|\/home\/|\/Users\/)[^\s]*/g, (match) => `${match.startsWith(" ") ? " " : ""}${REDACTED}`)
    .replace(/(?:^|\s)openspec\/changes\/[^\s]+\/(?:formal-task-board\.md|progress\.txt)(?=$|\s)/g, (match) => `${match.startsWith(" ") ? " " : ""}${REDACTED}`);
  if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i.test(redacted)) redacted = REDACTED;
  return redacted;
}

export function boundedDisplayText(value: unknown, columns = SUMMARY_COLUMNS): string {
  if (typeof value !== "string") return "";
  const safe = redact(collapse(value));
  return truncateToWidth(safe, Math.max(0, columns), "…");
}

function taskItems(args: TaskCallArgs): TaskCallItem[] {
  if (Array.isArray(args.tasks)) {
    if (args.tasks.length === 0 || args.tasks.some((item) => !record(item) || !exactString(item.task))) {
      throw new Error("malformed task renderer arguments");
    }
    return args.tasks;
  }
  if (!exactString(args.task)) throw new Error("malformed task renderer arguments");
  return [args as TaskCallItem];
}

function textComponent(text: string, context?: { lastComponent?: unknown }): Text {
  const component = context?.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0);
  component.setText(text);
  return component;
}

function taskStatus(value: Record<string, unknown>): string {
  const formal = exactString(value.formalResultStatus);
  if (formal === "malformed") return "malformed";
  if (formal === "blocked" || formal === "unverified") return "blocked";
  const status = exactString(value.status);
  if (status === "aborted") return "cancelled";
  if (status === "accepted") {
    const lifecycle = record(value.lifecycle);
    return exactString(lifecycle?.turn) ?? "queued";
  }
  if (status === "completed") {
    const job = exactString(record(value.lifecycle)?.job);
    const workerResult = exactString(value.result);
    return formal === "partial" || workerResult === "partial" || job === "partial" ? "partial" : "completed";
  }
  if (status === "failed") return formal === "blocked" ? "blocked" : "failed";
  throw new Error("malformed task renderer result status");
}

function taskModel(value: Record<string, unknown>): string | undefined {
  const model = record(value.model);
  const provider = exactString(model?.provider);
  const id = exactString(model?.model);
  return provider && id ? `${provider}/${id}` : undefined;
}

function taskResultLines(value: Record<string, unknown>, expanded: boolean): string[] {
  const status = taskStatus(value);
  const selector = exactString(value.selector);
  if (!selector) throw new Error("malformed task renderer identity");
  const identity = [selector, taskModel(value), status].filter(Boolean).join(" · ");
  const lines = [identity];
  if (!expanded) return lines;
  const model = record(value.model);
  const lifecycle = record(value.lifecycle);
  const detail = [
    ["requested", exactString(model?.requested)],
    ["effective", taskModel(value)],
    ["layer", exactString(model?.layer)],
    ["thinking", exactString(model?.thinking)],
    ["mode", exactString(value.effectiveMode)],
    ["agent", exactString(value.agentId)],
    ["job", exactString(value.jobId)],
    ["turn", exactString(value.turnId)],
    ["agent state", exactString(lifecycle?.agent)],
    ["job state", exactString(lifecycle?.job)],
    ["turn state", exactString(lifecycle?.turn)],
    ["output", exactString(value.outputRef)],
    ["history", exactString(value.historyRef)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  for (const [label, item] of detail) lines.push(`  ${label}: ${boundedDisplayText(item, DETAIL_COLUMNS)}`);
  return lines;
}

export function renderTaskCall(
  args: TaskCallArgs,
  theme: RendererTheme,
  context: ToolRenderContext<TaskCallArgs>,
): Text {
  const items = taskItems(args);
  const first = items[0]!;
  const selector = exactString(first.agent);
  const requestedModel = exactString(first.model);
  const name = exactString(first.name);
  const status = context.executionStarted ? "running" : "preparing";
  const identity = items.length > 1
    ? [`batch ${items.length}`, status]
    : [name, selector, requestedModel, status].filter(Boolean);
  const title = theme.fg("toolTitle", theme.bold("TASK · ")) + theme.fg("accent", identity.join(" · "));
  const summaries = items.slice(0, 3).map((item, index) => `${items.length > 1 ? `${index + 1}. ` : ""}${boundedDisplayText(item.task)}`);
  if (items.length > 3) summaries.push(`… ${items.length - 3} more`);
  return textComponent([title, ...summaries.map((summary) => theme.fg("dim", `  ${summary}`))].join("\n"), context);
}

export function renderTaskResult(
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: RendererTheme,
  context: ToolRenderContext<TaskCallArgs>,
): Text {
  if (options.isPartial) return textComponent(theme.fg("warning", "TASK · running"), context);
  const details = record(result.details);
  if (!details || typeof details.batch !== "boolean" || !Array.isArray(details.results) || details.results.length === 0) {
    throw new Error("malformed task renderer details");
  }
  const results = details.results.map((item) => {
    const value = record(item);
    if (!value) throw new Error("malformed task renderer item");
    return value;
  });
  const states = results.map(taskStatus);
  const aggregate = states.every((state) => state === "completed") ? "completed"
    : states.some((state) => state === "failed" || state === "malformed") ? "failed"
      : states.some((state) => state === "blocked") ? "blocked"
        : states.some((state) => state === "cancelled") ? "cancelled"
          : states.some((state) => state === "running") ? "running"
            : states.some((state) => state === "queued") ? "queued"
              : states.some((state) => state === "partial") ? "partial"
                : states[0]!;
  const color = aggregate === "completed" ? "success" : aggregate === "running" || aggregate === "queued" ? "warning" : "error";
  const lines = [theme.fg(color, `${aggregate === "completed" ? "✓" : aggregate === "running" || aggregate === "queued" ? "…" : "✗"} TASK · ${aggregate}`)];
  for (const [index, item] of results.entries()) {
    const itemLines = taskResultLines(item, options.expanded);
    lines.push(theme.fg("muted", `${results.length > 1 ? `${index + 1}. ` : ""}${itemLines[0]}`));
    lines.push(...itemLines.slice(1).map((line) => theme.fg("dim", line)));
  }
  return textComponent(lines.join("\n"), context);
}

function hubTargets(args: HubCallArgs): string[] {
  const targets = [args.agentId, args.jobId, args.id, args.selector, args.model]
    .filter((value): value is string => Boolean(exactString(value)));
  if (Array.isArray(args.jobIds)) targets.push(...args.jobIds.filter((value): value is string => Boolean(exactString(value))));
  if (Array.isArray(args.messageIds)) targets.push(...args.messageIds.filter((value): value is string => Boolean(exactString(value))));
  return targets;
}

export function renderHubCall(
  args: HubCallArgs,
  theme: RendererTheme,
  context: ToolRenderContext<HubCallArgs>,
): Text {
  const action = exactString(args.action);
  if (!action) throw new Error("malformed hub renderer arguments");
  const target = hubTargets(args).map((value) => boundedDisplayText(value, 64)).join(", ");
  if (action !== "list" && action !== "jobs" && !target) throw new Error("malformed hub renderer target");
  const status = context.executionStarted ? "running" : "preparing";
  const text = theme.fg("toolTitle", theme.bold("HUB · "))
    + theme.fg("accent", [action, target, status].filter(Boolean).join(" · "));
  return textComponent(text, context);
}

function summarizeHubDetails(value: Record<string, unknown>, expanded: boolean): string[] {
  const status = exactString(value.status)
    ?? (value.completed === true ? "completed" : value.timedOut === true ? "timed-out" : value.result ? String(value.result) : "completed");
  const identities: string[] = [];
  for (const key of ["agentId", "jobId", "turnId", "messageId", "deliveryId", "id"] as const) {
    const item = exactString(value[key]);
    if (item) identities.push(`${key}=${boundedDisplayText(item, 72)}`);
  }
  for (const key of ["agents", "jobs", "messages", "released"] as const) {
    if (Array.isArray(value[key])) identities.push(`${key}=${value[key].length}`);
  }
  const lines = [[status, ...identities].join(" · ")];
  if (expanded) {
    const bounded = JSON.stringify(value, (_key, item) => {
      if (typeof item === "string") return boundedDisplayText(item, DETAIL_COLUMNS);
      return item;
    }, 2);
    lines.push(...bounded.split("\n").slice(0, 80));
  }
  return lines;
}

export function renderHubResult(
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  theme: RendererTheme,
  context: ToolRenderContext<HubCallArgs>,
): Text {
  if (options.isPartial) return textComponent(theme.fg("warning", "HUB · running"), context);
  const details = record(result.details);
  if (!details) throw new Error("malformed hub renderer details");
  const action = exactString(context.args.action);
  if (!action) throw new Error("malformed hub renderer arguments");
  const lines = summarizeHubDetails(details, options.expanded);
  return textComponent([
    theme.fg(context.isError ? "error" : "success", `${context.isError ? "✗" : "✓"} HUB · ${action}`),
    ...lines.map((line) => theme.fg("dim", line)),
  ].join("\n"), context);
}

export const TASK_RENDERERS: Pick<ToolDefinition, "renderCall" | "renderResult"> = {
  renderCall: renderTaskCall as ToolDefinition["renderCall"],
  renderResult: renderTaskResult as ToolDefinition["renderResult"],
};

export const HUB_RENDERERS: Pick<ToolDefinition, "renderCall" | "renderResult"> = {
  renderCall: renderHubCall as ToolDefinition["renderCall"],
  renderResult: renderHubResult as ToolDefinition["renderResult"],
};
