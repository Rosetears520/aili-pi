"use client";

import { useMemo, useState } from "react";
import { agentDispatchRow, type AgentDispatchIdentity } from "@/lib/agent-dispatch";

// Async persistent-agent delivery card: the runtime sends
// customType "aili.agent-result" with a rich details object (identity, model
// sources, refs, preview). This card renders that structure instead of the
// generic raw-JSON custom message.

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const STATUS_TONES: Record<string, string> = {
  completed: "#16a34a",
  failed: "#f87171",
  aborted: "#d97706",
  partial: "#d97706",
};

export function isAgentResultMessage(customType: string): boolean {
  return customType === "aili.agent-result";
}

export function AiliAgentResultCard({ content, details }: { content: string; details?: unknown }) {
  const [showPreview, setShowPreview] = useState(false);
  const identity = useMemo((): AgentDispatchIdentity | null => {
    const rec = record(details);
    if (!rec) return null;
    const effective = str(rec.effectiveModel) ?? str(rec.model);
    const rows: Array<[string, string]> = [];
    const requested = [str(rec.requestedModel), str(rec.requestedThinking) ? `thinking=${str(rec.requestedThinking)}` : undefined].filter(Boolean).join(" · ");
    if (requested) rows.push(["requested", requested]);
    const effectiveLine = [effective, str(rec.thinking) ? `thinking=${str(rec.thinking)}` : undefined].filter(Boolean).join(" · ");
    if (effectiveLine) rows.push(["effective", effectiveLine]);
    for (const [key, label] of [["modelSource", "model source"], ["thinkingSource", "thinking source"], ["parentModel", "parent model"], ["jobId", "job"], ["turnId", "turn"], ["outputRef", "output"], ["historyRef", "history"]] as const) {
      const value = str(rec[key]);
      if (value) rows.push([label, value]);
    }
    return {
      name: str(rec.name) ?? "agent",
      selector: str(rec.selector) ?? "general",
      model: effective ?? "",
      thinking: str(rec.thinking) ?? "",
      status: str(rec.status) ?? "completed",
      rows,
    };
  }, [details]);

  const preview = useMemo(() => {
    if (!content) return "";
    const lines = content.split("\n");
    const start = lines.findIndex((line) => line.includes("Preview:"));
    return start >= 0 ? lines.slice(start + 1).join("\n").trim() : "";
  }, [content]);

  if (!identity) return null;
  const tone = STATUS_TONES[identity.status] ?? "var(--accent)";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--bg)",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          borderBottom: identity.rows.length > 0 ? "1px solid var(--border)" : undefined,
          background: "var(--bg-panel)",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 650, flexShrink: 0 }}>
          AGENT
        </span>
        <span style={{ color: tone, fontFamily: "var(--font-mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {agentDispatchRow(identity)}
        </span>
      </div>
      {identity.rows.length > 0 && (
        <div style={{ padding: "7px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {identity.rows.map(([label, value], index) => (
            <div key={index} style={{ display: "flex", gap: 7, fontSize: 11.5, lineHeight: 1.45 }}>
              <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", flexShrink: 0, minWidth: 92 }}>{label}</span>
              <span style={{ color: "var(--text)", minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div style={{ padding: "0 10px 8px" }}>
          <button
            onClick={() => setShowPreview((value) => !value)}
            style={{
              padding: 0,
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {showPreview ? "▾ preview" : "▸ preview"}
          </button>
          {showPreview && (
            <pre
              style={{
                margin: "6px 0 0",
                padding: "8px 10px",
                color: "var(--text-muted)",
                fontSize: 11.5,
                lineHeight: 1.5,
                overflow: "auto",
                background: "var(--bg-subtle)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {preview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
