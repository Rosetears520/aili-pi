"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/clipboard";

export interface ProjectInfoPresentation {
  label: string;
  directory: string;
  branch: string | null;
  worktree: string | null;
}

type Field = "directory" | "branch" | "worktree";
type Translate = (key: string, params?: Record<string, string | number>) => string;

export function ProjectInfoPanel({ project, translate }: { project: ProjectInfoPresentation; translate: Translate }) {
  const [copied, setCopied] = useState<Field | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setCopied(null); }, [project.directory, project.branch, project.worktree]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const rows: Array<{ field: Field; label: string; value: string }> = [
    { field: "directory", label: translate("session.projectDir"), value: project.directory },
    ...(project.branch ? [{ field: "branch" as const, label: translate("session.gitBranch"), value: project.branch }] : []),
    ...(project.worktree ? [{ field: "worktree" as const, label: translate("session.gitWorktree"), value: project.worktree }] : []),
  ];
  const copy = (field: Field, value: string) => void copyText(value).then(() => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopied(field);
    copyTimer.current = setTimeout(() => setCopied((current) => current === field ? null : current), 1400);
  });
  return (
    <section className="project-info-panel" aria-label={translate("session.projectSection")}>
      <div className="project-info-title">{translate("session.projectSection")} · {project.label}</div>
      <div className="project-info-grid">
        {rows.map((row) => <div className="project-info-row" key={row.field}>
          <span className="project-info-label">{row.label}</span>
          <code className="project-info-value">{row.value}</code>
          <button type="button" className="project-info-copy" onClick={() => copy(row.field, row.value)} title={copied === row.field ? translate("session.copied") : translate("session.copyProjectValue")} aria-label={copied === row.field ? translate("session.copied") : translate("session.copyProjectValue")}>
            {copied === row.field ? "✓" : "⧉"}
          </button>
        </div>)}
      </div>
    </section>
  );
}
