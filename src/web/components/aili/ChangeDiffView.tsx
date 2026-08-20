"use client";

import { useMemo } from "react";
import { parseUnifiedPatch, type SplitDiffFile } from "@/lib/patch";
import { useI18n } from "@/hooks/useI18n";

export type DiffView = "unified" | "split";
export type ChangeDiffVariant = "inline" | "full";

const FULL_MAX_ROWS = 3_000;

interface UnifiedLine { old: number | null; cur: number | null; sign: "" | "+" | "-"; text: string }
interface SplitLine { old: { ln: number; text: string } | null; neu: { ln: number; text: string } | null; kind: "ctx" | "pair" | "del" | "add" }

/**
 * The one shared diff renderer (webui-shared-diff-rendering, design decision 3).
 *
 *   variant="full"  — aicss file-diff card: header with per-file counts,
 *                     unified/split views, 3000-row render cap. Used by the
 *                     Changes page and the tool-details disclosure.
 *   variant="inline" — compact unified-only body for the timeline change card:
 *                     a ~12-row SCROLL window (user direction 2026-08-20 —
 *                     no truncation, no full-diff handoff): vertical scroll
 *                     for long diffs, horizontal scroll for long lines.
 *
 * Parsing is owned exclusively by lib/patch.ts `parseUnifiedPatch`; this
 * component never re-parses patch text and never computes change truth.
 */
export function ChangeDiffView({ file, patch, view = "unified", variant = "full" }: {
  file?: string;
  patch: string;
  view?: DiffView;
  variant?: ChangeDiffVariant;
}) {
  const { t } = useI18n();
  const files = useMemo(() => parseUnifiedPatch(patch) ?? [], [patch]);
  const counts = useMemo(() => countFileChanges(files), [files]);
  const effectiveView: DiffView = variant === "inline" ? "unified" : view;

  if (files.length === 0) {
    // Unparseable patch text: keep the raw text visible rather than nothing.
    return (
      <pre style={{ margin: 0, padding: "8px 10px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5, overflow: "auto", background: "var(--bg-subtle)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {patch}
      </pre>
    );
  }

  return (
    <div className="aili-diff">
      {variant === "full" && (
        <header className="aili-diff-head">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
              fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="aili-diff-file">{file ?? files[0].newPath ?? files[0].oldPath}</span>
          <span className="aili-diff-stats">
            <span className="stat-add">+{counts.additions}</span>
            <span className="stat-del">-{counts.deletions}</span>
          </span>
        </header>
      )}
      {files.map((diffFile, index) => (
        <FileRows
          key={index}
          file={diffFile}
          view={effectiveView}
          variant={variant}
          showLabel={variant === "inline" && files.length > 1}
        />
      ))}
      {variant === "full" && files.some((file) => {
        const { unified, split } = toRows(file);
        return (effectiveView === "unified" ? unified.length : split.length) > FULL_MAX_ROWS;
      }) && (
        <div className="aili-diff-truncated">
          {t("chat.changeTruncated", { rows: FULL_MAX_ROWS })}
        </div>
      )}
    </div>
  );
}

function FileRows({ file, view, variant, showLabel }: { file: SplitDiffFile; view: DiffView; variant: ChangeDiffVariant; showLabel: boolean }) {
  const { unified, split } = useMemo(() => toRows(file), [file]);
  const capped = view === "unified" ? unified.slice(0, FULL_MAX_ROWS) : null;
  const cappedSplit = view === "split" ? split.slice(0, FULL_MAX_ROWS) : null;

  const body = view === "unified" ? (
    <div className="aili-diff-body">
      {capped?.map((row, index) => (
        <div key={index} className={`aili-diff-row aili-${row.sign === "+" ? "add" : row.sign === "-" ? "del" : "ctx"}`}>
          <span className="aili-diff-ln">{row.old ?? ""}</span>
          <span className="aili-diff-ln">{row.cur ?? ""}</span>
          <span className="aili-diff-sign">{row.sign || " "}</span>
          <code>{row.text}</code>
        </div>
      ))}
    </div>
  ) : (
    <div className="aili-diff-body aili-split">
      {cappedSplit?.map((row, index) => (
        <div key={index} className="aili-split-row" data-kind={row.kind}>
          <div className={`aili-split-cell ${row.old && (row.kind === "pair" || row.kind === "del") ? "aili-split-del" : ""}`}>
            <span className="aili-diff-ln">{row.old?.ln ?? ""}</span>
            <code>{row.old?.text ?? ""}</code>
          </div>
          <div className={`aili-split-cell ${row.neu && (row.kind === "pair" || row.kind === "add") ? "aili-split-add" : ""}`}>
            <span className="aili-diff-ln">{row.neu?.ln ?? ""}</span>
            <code>{row.neu?.text ?? ""}</code>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {showLabel && (
        <div style={{ padding: "4px 10px", color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--border)" }}>
          {file.newPath ?? file.oldPath}
        </div>
      )}
      {variant === "inline"
        ? <div className="aili-diff-scroll">{body}</div>
        : body}
    </>
  );
}

// Parser rows → display rows. A parser row pairs a removed and an added line
// into one entity; the unified view expands that pair into two stacked lines
// (removed above added), the split view keeps it as one aligned row.
function toRows(file: SplitDiffFile): { unified: UnifiedLine[]; split: SplitLine[] } {
  const unified: UnifiedLine[] = [];
  const split: SplitLine[] = [];
  for (const row of file.rows) {
    if (row.type === "hunk") continue;
    const { left, right } = row;
    if (right.type === "added") {
      if (left.type === "removed") {
        unified.push({ old: left.lineNo, cur: null, sign: "-", text: left.text });
        unified.push({ old: null, cur: right.lineNo, sign: "+", text: right.text });
        split.push({ old: { ln: left.lineNo!, text: left.text }, neu: { ln: right.lineNo!, text: right.text }, kind: "pair" });
      } else {
        unified.push({ old: null, cur: right.lineNo, sign: "+", text: right.text });
        split.push({ old: null, neu: { ln: right.lineNo!, text: right.text }, kind: "add" });
      }
    } else if (left.type === "removed") {
      unified.push({ old: left.lineNo, cur: null, sign: "-", text: left.text });
      split.push({ old: { ln: left.lineNo!, text: left.text }, neu: null, kind: "del" });
    } else {
      unified.push({ old: left.lineNo, cur: right.lineNo, sign: "", text: left.text });
      split.push({ old: { ln: left.lineNo!, text: left.text }, neu: { ln: right.lineNo!, text: right.text }, kind: "ctx" });
    }
  }
  return { unified, split };
}

function countFileChanges(files: SplitDiffFile[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const row of file.rows) {
      if (row.type === "hunk") continue;
      if (row.right.type === "added") additions += 1;
      if (row.left.type === "removed") deletions += 1;
    }
  }
  return { additions, deletions };
}
