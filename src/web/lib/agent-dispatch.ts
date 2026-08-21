// Field selection for persistent-agent dispatch surfaces (sub/formal_task and
// hub), ported from the TUI's task-hub-renderer identity rows so the web shows
// the same "name · selector · model · thinking · status" information.

export const AGENT_DISPATCH_TOOL_NAMES = new Set(["sub", "task", "formal_task"]);

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export interface AgentDispatchIdentity {
  name: string;
  selector: string;
  model: string;
  thinking: string;
  status: string;
  /** Extra detail rows for the expanded view: [label, value]. */
  rows: Array<[string, string]>;
}

function dispatchStatus(item: AnyRecord): string {
  const status = str(item.status);
  if (status) return status;
  const lifecycle = record(item.lifecycle);
  const agent = str(lifecycle?.agent);
  return agent ?? "running";
}

function resultItemIdentity(item: unknown): AgentDispatchIdentity | null {
  const rec = record(item);
  if (!rec) return null;
  const model = rec.model;
  const modelRec = record(model);
  const effectiveModel = str(rec.effectiveModel) ?? str(rec.effective) ?? str(modelRec?.effectiveModel) ?? str(modelRec?.model);
  const provider = str(rec.provider) ?? str(modelRec?.provider);
  const effective = effectiveModel && provider && !effectiveModel.includes("/") ? `${provider}/${effectiveModel}` : effectiveModel;
  const thinking = str(rec.thinking) ?? str(modelRec?.thinking);
  const requestedModel = str(rec.requestedModel) ?? str(modelRec?.requested);
  const requestedThinking = str(rec.requestedThinking) ?? str(modelRec?.requestedThinking);
  const modelLayer = str(rec.modelLayer) ?? str(modelRec?.layer);
  const modelSource = str(rec.modelSource) ?? str(rec.source);
  const thinkingSource = str(rec.thinkingSource);
  const decision = record(rec.modelDecision);
  const lifecycle = record(rec.lifecycle);
  const rows: Array<[string, string]> = [];
  if (requestedModel || requestedThinking) {
    rows.push(["requested", [requestedModel, requestedThinking ? `thinking=${requestedThinking}` : undefined].filter(Boolean).join(" · ")]);
  }
  if (effective || thinking) {
    rows.push(["effective", [effective, thinking ? `thinking=${thinking}` : undefined].filter(Boolean).join(" · ")]);
  }
  if (modelLayer) rows.push(["model layer", modelLayer]);
  if (modelSource) rows.push(["model source", modelSource]);
  if (thinkingSource && thinkingSource !== modelSource) rows.push(["thinking source", thinkingSource]);
  if (decision) {
    const outcome = str(decision.overrideDecision);
    if (outcome) rows.push(["override decision", [outcome, str(decision.reason)].filter(Boolean).join(" — ")]);
  }
  if (lifecycle) {
    const agent = str(lifecycle.agent);
    const job = str(lifecycle.job);
    const turn = str(lifecycle.turn);
    const line = [agent, job, turn].filter(Boolean).join(" / ");
    if (line) rows.push(["lifecycle", line]);
  }
  for (const [key, label] of [["agentId", "agent"], ["jobId", "job"], ["turnId", "turn"], ["outputRef", "output"], ["historyRef", "history"], ["parentModel", "parent model"], ["parentThinking", "parent thinking"], ["effectiveModeReason", "mode"]] as const) {
    const value = str(rec[key]);
    if (value) rows.push([label, value]);
  }
  return {
    name: str(rec.name) ?? str(rec.agentName) ?? "agent",
    selector: str(rec.selector) ?? "general",
    model: effective ?? requestedModel ?? "",
    thinking: thinking ?? "",
    status: dispatchStatus(rec),
    rows,
  };
}

/** Identities from a completed TaskResponse (details of the tool result). */
export function agentDispatchResultIdentities(details: unknown): AgentDispatchIdentity[] {
  const rec = record(details);
  const results = rec?.results;
  if (!Array.isArray(results)) return [];
  return results.map(resultItemIdentity).filter((item): item is AgentDispatchIdentity => item !== null);
}

/** Identity from the call arguments while the dispatch is still running. */
export function agentDispatchCallIdentity(input: unknown): AgentDispatchIdentity | null {
  const rec = record(input);
  if (!rec) return null;
  const items = Array.isArray(rec.tasks) ? rec.tasks : [rec];
  const first = record(items[0]);
  if (!first) return null;
  return {
    name: str(first.name) ?? str(first.agent) ?? "agent",
    selector: str(first.agent) ?? "general",
    model: str(first.model) ?? "",
    thinking: str(first.thinking) ?? "",
    status: "running",
    rows: [],
  };
}

export function agentDispatchRow(identity: AgentDispatchIdentity): string {
  return [identity.name, identity.selector, identity.model, identity.thinking ? `thinking=${identity.thinking}` : undefined, identity.status]
    .filter(Boolean)
    .join(" · ");
}

export function agentDispatchPreview(input: unknown, details: unknown): string | null {
  const identities = agentDispatchResultIdentities(details);
  if (identities.length === 0) {
    const call = agentDispatchCallIdentity(input);
    return call ? agentDispatchRow(call) : null;
  }
  if (identities.length === 1) return agentDispatchRow(identities[0]!);
  const statuses = new Set(identities.map((item) => item.status));
  const aggregate = statuses.size === 1 ? [...statuses][0]! : "partial";
  return `batch ${identities.length} · ${aggregate}`;
}

/** Friendly progress line from a TaskLiveSnapshot / TaskLiveBatchSnapshot. */
export function agentLiveProgress(details: unknown): string | null {
  const rec = record(details);
  if (!rec) return null;
  if (Array.isArray(rec.results)) {
    const identities = rec.results.map(resultItemIdentity).filter((item): item is AgentDispatchIdentity => item !== null);
    if (identities.length === 0) return null;
    return `batch ${identities.length} · ${str(rec.status) ?? "running"}`;
  }
  const identity = resultItemIdentity(rec);
  return identity ? agentDispatchRow(identity) : null;
}

export function hubCallSummary(input: unknown): string | null {
  const rec = record(input);
  if (!rec) return null;
  const action = str(rec.action);
  if (!action) return null;
  const target = str(rec.agentId) ?? str(rec.id) ?? str(rec.selector);
  return [action, target].filter(Boolean).join(" · ");
}

export function hubResultRows(details: unknown): string[] {
  const rec = record(details);
  if (!rec) return [];
  const rows: string[] = [];
  const identity = resultItemIdentity(rec);
  if (identity) rows.push(agentDispatchRow(identity));
  for (const [key, value] of Object.entries(rec)) {
    if (Array.isArray(value)) rows.push(`${key}: ${value.length}`);
    else if (typeof value === "string" && key !== "output" && key !== "content" && value.length <= 160) {
      rows.push(`${key}: ${value}`);
    }
  }
  return rows.slice(0, 12);
}
