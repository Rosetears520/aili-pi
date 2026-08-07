import { isRecord, type SessionLikeEntry } from "./contracts.js";

export type SubagentGateReason = "disabled" | "not-subagent" | "in-flight" | "ambiguous-lineage" | "completed";

export interface SubagentGateDecision {
  protected: boolean;
  reason: SubagentGateReason;
  taskToolCallId?: string;
  finalResultEntryId?: string;
}

type TaskCall = { entryIndex: number; id: string };
type TaskResult = { entryIndex: number; id: string; message: Record<string, unknown> };
type Settlement = { status: string; agentId: string; jobId: string };

/**
 * Uses only Pi's public `task` call/result protocol and repository-owned
 * `aili.agent-result` custom-message metadata. No child transcript is read or
 * copied. Duplicate, malformed, unmatched, failed, or incomplete evidence is
 * protected.
 */
export function gateSubagentEntry(
  entries: readonly SessionLikeEntry[],
  entryIndex: number,
  enabled: boolean,
): SubagentGateDecision {
  const entry = entries[entryIndex];
  if (!entry || entry.type !== "message" || !isRecord(entry.message)) return { protected: true, reason: "ambiguous-lineage" };
  const calls = collectTaskCalls(entries);
  const results = collectTaskResults(entries);
  const callIds = new Set<string>();
  if (entry.message.role === "assistant") for (const call of taskCalls(entry.message)) callIds.add(call.id);
  if (entry.message.role === "toolResult" && entry.message.toolName === "task" && typeof entry.message.toolCallId === "string") callIds.add(entry.message.toolCallId);
  if (callIds.size === 0) return { protected: false, reason: "not-subagent" };
  if (!enabled) return { protected: true, reason: "disabled" };
  if (callIds.size !== 1) return { protected: true, reason: "ambiguous-lineage" };

  const taskToolCallId = [...callIds][0]!;
  const matchingCalls = calls.filter((call) => call.id === taskToolCallId);
  const matchingResults = results.filter((result) => result.id === taskToolCallId);
  if (matchingCalls.length !== 1 || matchingResults.length !== 1) return { protected: true, reason: "ambiguous-lineage", taskToolCallId };

  const settlements = settlementsFromDetails(matchingResults[0]!.message.details);
  if (settlements.length !== 1) return { protected: true, reason: "ambiguous-lineage", taskToolCallId };
  const settlement = settlements[0]!;
  if (settlement.status === "completed") {
    return { protected: false, reason: "completed", taskToolCallId, finalResultEntryId: entries[matchingResults[0]!.entryIndex]!.id };
  }
  if (settlement.status !== "accepted") return { protected: true, reason: "ambiguous-lineage", taskToolCallId };

  const deliveries = entries.filter((candidate) => {
    if (candidate.type !== "custom_message" || candidate.customType !== "aili.agent-result" || !isRecord(candidate.details)) return false;
    return candidate.details.agentId === settlement.agentId
      && candidate.details.jobId === settlement.jobId
      && candidate.details.status === "completed"
      && typeof candidate.details.outputRef === "string";
  });
  if (deliveries.length === 0) return { protected: true, reason: "in-flight", taskToolCallId };
  if (deliveries.length !== 1) return { protected: true, reason: "ambiguous-lineage", taskToolCallId };
  return { protected: false, reason: "completed", taskToolCallId, finalResultEntryId: deliveries[0]!.id };
}

function collectTaskCalls(entries: readonly SessionLikeEntry[]): TaskCall[] {
  return entries.flatMap((entry, entryIndex) => entry.type === "message" && isRecord(entry.message)
    ? taskCalls(entry.message).map((call) => ({ entryIndex, id: call.id }))
    : []);
}

function collectTaskResults(entries: readonly SessionLikeEntry[]): TaskResult[] {
  return entries.flatMap((entry, entryIndex) => entry.type === "message" && isRecord(entry.message)
    && entry.message.role === "toolResult" && entry.message.toolName === "task" && typeof entry.message.toolCallId === "string"
    ? [{ entryIndex, id: entry.message.toolCallId, message: entry.message }]
    : []);
}

function taskCalls(message: Record<string, unknown>): Array<{ id: string }> {
  const candidates = [
    ...(Array.isArray(message.toolCalls) ? message.toolCalls : []),
    ...(Array.isArray(message.content) ? message.content : []),
  ];
  return candidates.flatMap((candidate) => isRecord(candidate)
    && (candidate.type === undefined || candidate.type === "toolCall")
    && candidate.name === "task" && typeof candidate.id === "string" ? [{ id: candidate.id }] : []);
}

function settlementsFromDetails(details: unknown): Settlement[] {
  const candidates = isRecord(details) && Array.isArray(details.results) ? details.results : [details];
  return candidates.flatMap((candidate) => isRecord(candidate)
    && typeof candidate.status === "string"
    && typeof candidate.agentId === "string"
    && typeof candidate.jobId === "string"
    ? [{ status: candidate.status, agentId: candidate.agentId, jobId: candidate.jobId }]
    : []);
}
