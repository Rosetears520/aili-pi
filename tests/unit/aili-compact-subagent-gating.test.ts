import { describe, expect, it } from "vitest";
import type { SessionLikeEntry } from "../../src/runtime/aili-compact/contracts.js";
import { gateSubagentEntry } from "../../src/runtime/aili-compact/subagent-gating.js";

const base: SessionLikeEntry[] = [
  { id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "task-1", name: "task", arguments: { prompt: "redacted" } }] } },
  { id: "result", type: "message", message: { role: "toolResult", toolCallId: "task-1", toolName: "task", content: "bounded accepted result", details: { status: "accepted", agentId: "agent-1", jobId: "job-1" } } },
];

describe("AILI Compact public subagent gating", () => {
  it("defaults protected and keeps in-flight public task atoms raw", () => {
    expect(gateSubagentEntry(base, 0, false)).toMatchObject({ protected: true, reason: "disabled" });
    expect(gateSubagentEntry(base, 1, true)).toMatchObject({ protected: true, reason: "in-flight", taskToolCallId: "task-1" });
  });

  it("accepts exactly one completed aili.agent-result evidence entry", () => {
    const entries = [...base, { id: "final", type: "custom_message", customType: "aili.agent-result", details: { agentId: "agent-1", jobId: "job-1", status: "completed", outputRef: "agent://agent-1" } }];
    expect(gateSubagentEntry(entries, 1, true)).toEqual({ protected: false, reason: "completed", taskToolCallId: "task-1", finalResultEntryId: "final" });
  });

  it("fails protected on duplicate or ambiguous public evidence", () => {
    const duplicate = [...base, { ...base[1]!, id: "result-2" }];
    expect(gateSubagentEntry(duplicate, 0, true).reason).toBe("ambiguous-lineage");
    const finals = [...base,
      { id: "f1", type: "custom_message", customType: "aili.agent-result", details: { agentId: "agent-1", jobId: "job-1", status: "completed", outputRef: "agent://agent-1" } },
      { id: "f2", type: "custom_message", customType: "aili.agent-result", details: { agentId: "agent-1", jobId: "job-1", status: "completed", outputRef: "agent://agent-1" } },
    ];
    expect(gateSubagentEntry(finals, 1, true).reason).toBe("ambiguous-lineage");
  });
});
