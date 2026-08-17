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
  thinking?: string;
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
  if (status === "allocated" || status === "running") return status;
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

interface TaskIdentity {
  name?: string;
  selector?: string;
  requestedModel?: string;
  requestedThinking?: string;
  effectiveModel?: string;
  provider?: string;
  model?: string;
  layer?: string;
  thinking?: string;
  modelSource?: string;
  thinkingSource?: string;
  source?: string;
  parent?: string;
  parentModel?: string;
  parentThinking?: string;
  parentSource?: string;
  effectiveProvenance?: string;
  speedTier?: string;
  service?: string;
  mode?: string;
  modeReason?: string;
}

function firstString(...values: unknown[]): string | undefined {
  return values.map(exactString).find((value): value is string => value !== undefined);
}

function canonicalModel(provider: unknown, model: unknown): string | undefined {
  const providerValue = exactString(provider);
  const modelValue = exactString(model);
  return providerValue && modelValue ? `${providerValue}/${modelValue}` : undefined;
}

function taskIdentity(value: Record<string, unknown>): TaskIdentity {
  const model = record(value.model);
  const parent = record(value.parent);
  const provenance = record(value.provenance);
  const parentResolution = record(value.parentResolution);
  const directModel = firstString(typeof value.model === "string" ? value.model : undefined);
  const directCanonical = directModel?.includes("/") ? directModel : undefined;
  const directProvider = directCanonical ? directCanonical.slice(0, directCanonical.indexOf("/")) : undefined;
  const provider = firstString(value.provider, model?.provider, directProvider);
  const modelId = firstString(
    directCanonical ? directCanonical.slice(directCanonical.indexOf("/") + 1) : directModel,
    model?.model,
  );
  const effectiveModel = firstString(
    value.effectiveModel,
    value.effective,
    value.canonical,
    model?.effectiveModel,
    model?.effective,
    model?.canonical,
    directCanonical,
    canonicalModel(provider, modelId),
  );
  const parentModel = firstString(
    value.parentModel,
    value.parentEffectiveModel,
    value.parentCanonicalModel,
    typeof value.parent === "string" ? value.parent : undefined,
    model?.parentModel,
    model?.parentEffectiveModel,
    model?.parentCanonicalModel,
    provenance?.parentModel,
    provenance?.parentEffectiveModel,
    provenance?.parentCanonicalModel,
    parent?.effectiveModel,
    parent?.effective,
    parent?.canonical,
    parentResolution?.effectiveModel,
    parentResolution?.canonical,
    canonicalModel(parent?.provider, parent?.model),
    canonicalModel(parentResolution?.provider, parentResolution?.model),
  );
  const parentThinking = firstString(value.parentThinking, model?.parentThinking, provenance?.parentThinking, parent?.thinking, parentResolution?.thinking);
  const parentSource = firstString(value.parentSource, model?.parentSource, provenance?.parentSource, parent?.modelSource, parent?.source, parentResolution?.modelSource, parentResolution?.source);
  return {
    name: firstString(value.name, value.agentName),
    selector: firstString(value.selector),
    requestedModel: firstString(value.requestedModel, value.requested, model?.requested),
    requestedThinking: firstString(value.requestedThinking, model?.requestedThinking),
    effectiveModel,
    provider,
    model: modelId,
    layer: firstString(value.modelLayer, value.layer, model?.modelLayer, model?.layer),
    thinking: firstString(value.thinking, model?.thinking),
    modelSource: firstString(value.modelSource, model?.modelSource),
    thinkingSource: firstString(value.thinkingSource, model?.thinkingSource),
    source: firstString(value.source, model?.source),
    parent: parentModel
      ? `${parentModel}${parentThinking ? ` (thinking=${parentThinking})` : ""}`
      : firstString(value.parentAgentId),
    parentModel,
    parentThinking,
    parentSource,
    effectiveProvenance: firstString(
      value.effectiveProvenance,
      value.effectiveSource,
      model?.effectiveProvenance,
      model?.effectiveSource,
      model?.provenance,
      value.provenance,
      provenance?.effective,
      provenance?.effectiveSource,
    ),
    speedTier: firstString(value.speedTier, model?.speedTier),
    service: firstString(value.service, value.serviceMode, model?.service, model?.serviceMode),
    mode: firstString(value.effectiveMode, value.mode, model?.effectiveMode),
    modeReason: firstString(value.effectiveModeReason, model?.effectiveModeReason),
  };
}

function taskResultLines(value: Record<string, unknown>, expanded: boolean): string[] {
  const status = taskStatus(value);
  const identity = taskIdentity(value);
  const selector = identity.selector;
  if (!selector) throw new Error("malformed task renderer identity");
  const compactRaw = [identity.name, selector, identity.effectiveModel, identity.thinking, status]
    .filter((item): item is string => Boolean(item))
    .map((item) => boundedDisplayText(item, 160))
    .join(" · ");
  const lines = [boundedDisplayText(compactRaw, SUMMARY_COLUMNS)];
  if (!expanded) return lines;
  const lifecycle = record(value.lifecycle);
  const detail: Array<[string, string | undefined]> = [
    // `requested` is retained as the compact compatibility label for the
    // requested model; thinking is always shown as a separate field.
    ["requested", identity.requestedModel],
    ["requested thinking", identity.requestedThinking],
    ["effective", identity.effectiveModel],
    ["source", identity.source],
    ["model source", identity.modelSource],
    ["thinking source", identity.thinkingSource],
    ["layer", identity.layer],
    ["thinking", identity.thinking],
    ["parent", identity.parent],
    ["parent model", identity.parentModel],
    ["parent thinking", identity.parentThinking],
    ["parent source", identity.parentSource],
    ["effective provenance", identity.effectiveProvenance],
    ["speed tier", identity.speedTier],
    ["service", identity.service],
    ["mode", identity.mode],
    ["mode reason", identity.modeReason],
    ["agent", firstString(value.agentId)],
    ["job", firstString(value.jobId)],
    ["turn", firstString(value.turnId)],
    ["agent state", firstString(lifecycle?.agent)],
    ["job state", firstString(lifecycle?.job)],
    ["turn state", firstString(lifecycle?.turn)],
    ["output", firstString(value.outputRef)],
    ["history", firstString(value.historyRef)],
  ];
  for (const [label, item] of detail) {
    if (item !== undefined) lines.push(`  ${label}: ${boundedDisplayText(item, DETAIL_COLUMNS)}`);
  }
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
  const requestedThinking = exactString(first.thinking);
  const name = exactString(first.name);
  const status = context.executionStarted ? "running" : "preparing";
  const identity = items.length > 1
    ? [`batch ${items.length}`, status]
    : [name, selector, requestedModel, requestedThinking, status].filter(Boolean);
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
  if (options.isPartial) {
    const snapshot = record(result.details);
    // TaskCoordinator emits a bounded allocation snapshot for live updates.
    // Never reconstruct this identity from the original call arguments: the
    // effective provider/model/thinking only exist in the structured snapshot.
    if (snapshot?.batch === true && Array.isArray(snapshot.results) && snapshot.results.length > 0) {
      const rows = snapshot.results.map((item) => record(item)).filter((item): item is Record<string, unknown> => item !== undefined);
      if (rows.length !== snapshot.results.length) throw new Error("malformed task renderer live batch");
      const lines = rows.flatMap((row, index) => taskResultLines(row, options.expanded).map((line, lineIndex) => lineIndex === 0 ? `${index + 1}. ${line}` : line));
      return textComponent(theme.fg("warning", [`TASK · batch ${rows.length} · ${exactString(snapshot.status) ?? "allocated"}`, ...lines.map((line) => `\n${line}`)].join("")), context);
    }
    if (snapshot && (exactString(snapshot.status) === "allocated" || exactString(snapshot.status) === "running")) {
      const lines = taskResultLines(snapshot, options.expanded);
      return textComponent(theme.fg("warning", ["TASK · ", lines[0], ...lines.slice(1).map((line) => `\n${line}`)].join("")), context);
    }
    // Older Pi callers sent an empty partial result. Keep the old bounded
    // fallback while allowing the canonical snapshot path above to converge.
    return textComponent(theme.fg("warning", "TASK · running"), context);
  }
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

function hubDisplayIdentity(value: Record<string, unknown>): string | undefined {
  const display = record(value.display) ?? value;
  const name = firstString(display.name, value.name);
  const selector = firstString(display.selector, value.selector);
  const effectiveModel = firstString(display.effectiveModel, display.effective)
    ?? canonicalModel(display.provider, display.model);
  const thinking = firstString(display.thinking);
  const status = firstString(display.status, value.status, value.state);
  const requestedModel = firstString(display.requestedModel, display.requested);
  const requestedThinking = firstString(display.requestedThinking);
  const source = firstString(display.source);
  const modelSource = firstString(display.modelSource);
  const thinkingSource = firstString(display.thinkingSource);
  const identity = [name, selector, effectiveModel, thinking, status].filter(Boolean).join(" · ");
  if (!identity) return undefined;
  const details = [
    requestedModel ? `requestedModel=${requestedModel}` : undefined,
    requestedThinking ? `requestedThinking=${requestedThinking}` : undefined,
    source ? `source=${source}` : undefined,
    modelSource ? `modelSource=${modelSource}` : undefined,
    thinkingSource ? `thinkingSource=${thinkingSource}` : undefined,
  ].filter(Boolean).join(" · ");
  return boundedDisplayText(details ? `${identity} · ${details}` : identity, DETAIL_COLUMNS);
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
    const items = value[key];
    if (Array.isArray(items)) {
      identities.push(`${key}=${items.length}`);
      for (const [index, item] of items.slice(0, 20).entries()) {
        const identity = record(item) ? hubDisplayIdentity(item as Record<string, unknown>) : undefined;
        if (identity) identities.push(`${key}[${index + 1}]=${boundedDisplayText(identity, DETAIL_COLUMNS)}`);
      }
    }
  }
  const directIdentity = hubDisplayIdentity(value);
  if (directIdentity && !identities.some((item) => item.includes(directIdentity))) identities.push(directIdentity);
  const lines = [[status, ...identities].join(" · ")];
  if (expanded) {
    const bounded = JSON.stringify(value, (key, item) => {
      // Hub results may contain durable message bodies. They are not identity
      // evidence and must not be copied into the renderer projection.
      if (["content", "context", "prompt", "task"].includes(key)) return "[omitted]";
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
