"use client";

import { useState } from "react";
import type { FileChangeEvent } from "@/lib/file-change-events";
import { ChangeDiffView } from "./aili/ChangeDiffView";
import { getFileIcon } from "./FileIcons";
import { useI18n } from "@/hooks/useI18n";

// Timeline change card (webui-inline-file-change-events, design decision 2/3).
//
// The collapsed row is the contract row: operation icon + type, file icon,
// file name (primary), parent path (secondary), +N −M, chevron. Activating the
// row expands a capped unified diff beneath the fixed header; raw tool JSON
// stays behind the explicit "View tool details" disclosure owned by
// ToolCallBlock.
//
// Data source is the tool call alone — this card is deliberately git-free
// (user direction 2026-08-19: the timeline shows what THIS tool changed; git
// state is the Changes page's concern). `edit` results carry their real patch;
// `write` results carry none, so the event's diff is the /dev/null full-add of
// the content the tool wrote. "Diff unavailable" appears only when a mutation
// reports neither a patch nor its content.

const OPERATION_GLYPH: Record<FileChangeEvent["operation"], string> = {
  edit: "✎",
  create: "＋",
  delete: "－",
  rename: "↪",
};

const OPERATION_LABEL_KEY: Record<FileChangeEvent["operation"], string> = {
  edit: "chat.changeEdited",
  create: "chat.changeCreated",
  delete: "chat.changeDeleted",
  rename: "chat.changeRenamed",
};

export function InlineFileChange({ event, cwd, onOpenFile, onShowToolDetails }: {
  event: FileChangeEvent;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  onShowToolDetails?: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const patch = event.diff;
  const parentLabel = trimParent(event.parentPath, cwd);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "6px 10px",
          background: "none",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
          minWidth: 0,
        }}
      >
        <span aria-hidden="true" style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)" }}>
          {OPERATION_GLYPH[event.operation]}
        </span>
        <span style={{ flexShrink: 0, color: "var(--text-dim)", fontSize: 11 }}>
          {t(OPERATION_LABEL_KEY[event.operation])}
        </span>
        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }} aria-hidden="true">
          {getFileIcon(event.fileName, 13)}
        </span>
        <span
          role="button"
          tabIndex={0}
          title={event.path}
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onOpenFile?.(event.path);
          }}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter" || keyEvent.key === " ") {
              keyEvent.preventDefault();
              keyEvent.stopPropagation();
              onOpenFile?.(event.path);
            }
          }}
          style={{ color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flexShrink: 1 }}
        >
          {event.fileName}
        </span>
        {parentLabel && (
          <span style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {parentLabel}
          </span>
        )}
        <span style={{ flexShrink: 0, display: "inline-flex", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
          {event.additions > 0 && <span style={{ color: "#15a06a" }}>+{event.additions}</span>}
          {event.deletions > 0 && <span style={{ color: "#dc2626" }}>-{event.deletions}</span>}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-dim)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
          {patch ? (
            <ChangeDiffView
              patch={patch}
              variant="inline"
              onShowFull={cwd ? () => window.open(`/changes?cwd=${encodeURIComponent(cwd)}`, "aili-changes") : undefined}
            />
          ) : (
            <div style={{ padding: "8px 10px", color: "var(--text-dim)", fontSize: 12 }}>{t("chat.changeDiffUnavailable")}</div>
          )}
          {onShowToolDetails && (
            <button
              type="button"
              onClick={onShowToolDetails}
              style={{ margin: "0 10px 8px", padding: 0, border: "none", background: "none", color: "var(--text-dim)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
            >
              {t("chat.changeViewToolDetails")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function trimParent(parentPath: string, cwd?: string): string {
  if (!parentPath) return "";
  if (cwd && (parentPath === cwd || parentPath.startsWith(`${cwd}/`))) {
    const trimmed = parentPath.slice(cwd.length + 1);
    return trimmed ? `${trimmed}/` : "";
  }
  return `${parentPath}/`;
}
