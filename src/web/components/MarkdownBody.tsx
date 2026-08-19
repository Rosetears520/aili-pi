"use client";

import { isValidElement, useMemo, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { resolveLocalFileHref } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { markdownRehypePlugins, markdownRemarkPlugins, normalizeDisplayMath } from "@/lib/markdown";
import { MermaidBlock, CodeBlock } from "./MermaidBlock";
import { TodoList } from "./aicss/TodoList";
import caretStyles from "./aicss/StreamingText.module.css";

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}

// aicss comparison-table adaptation: a cell whose entire content is a bare
// affirm/negate mark reads as a colored check, not prose.
const CELL_YES_MARKS = new Set(["✓", "✔", "✅", "yes", "true", "是"]);
const CELL_NO_MARKS = new Set(["✗", "✘", "❌", "no", "false", "否", "–", "—"]);

function plainCellText(children: ReactNode): string | null {
  if (typeof children === "string") return children.trim();
  if (typeof children === "number") return null;
  if (Array.isArray(children)) {
    const parts: string[] = [];
    for (const child of children) {
      if (typeof child !== "string") return null;
      parts.push(child);
    }
    return parts.join("").trim();
  }
  return null;
}

// --- aicss task-list (TodoList) adaptation: GFM task lists render as the
// vendored collapsible to-do card instead of bare checkbox bullets.
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

type TaskEntry = { label: string; done: boolean };

/** Extracts the task items of a GFM task list; null when the list is not one. */
function taskListEntries(children: ReactNode): TaskEntry[] | null {
  const items = Array.isArray(children) ? children : [children];
  const entries: TaskEntry[] = [];
  for (const item of items) {
    if (!isValidElement(item) || item.type !== "li") return null;
    const itemChildren = (item.props as { children?: ReactNode }).children;
    const kids: ReactNode[] = Array.isArray(itemChildren) ? itemChildren : [itemChildren];
    const checkbox = kids.find(
      (kid: ReactNode): kid is React.ReactElement<{ type?: string; checked?: boolean }> =>
        isValidElement(kid)
        && kid.type === "input"
        && (kid.props as { type?: string }).type === "checkbox",
    );
    if (!checkbox) return null;
    entries.push({
      label: nodeText(kids.filter((kid) => kid !== checkbox)).trim(),
      done: Boolean((checkbox.props as { checked?: boolean }).checked),
    });
  }
  return entries.length > 0 ? entries : null;
}

// --- aicss inline-citations adaptation: local-file links in assistant prose
// carry a numbered chip and a source footer listing every referenced file.
const PLAIN_SCOPES = ["markdown-user-message", "markdown-custom-message", "markdown-compaction-message"];
const MD_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function MarkdownBody({ children, className, isStreaming, cwd, onOpenFile }: MarkdownBodyProps) {
  const normalizedMarkdown = useMemo(() => normalizeDisplayMath(children), [children]);
  // Citations only apply to assistant prose, not to user/custom/compaction
  // scopes that reuse this renderer with their own class.
  const citationsEnabled = !PLAIN_SCOPES.some((scope) => className?.includes(scope));
  const citedFiles = useMemo(() => {
    if (!citationsEnabled || !onOpenFile) return [] as string[];
    const seen = new Set<string>();
    const files: string[] = [];
    for (const match of normalizedMarkdown.matchAll(MD_LINK_RE)) {
      const href = match[2];
      const filePath = resolveLocalFileHref(href, cwd);
      if (!filePath || seen.has(filePath)) continue;
      seen.add(filePath);
      files.push(filePath);
      if (files.length >= 12) break;
    }
    return files;
  }, [normalizedMarkdown, cwd, citationsEnabled, onOpenFile]);
  const citationIndex = useMemo(() => {
    const map = new Map<string, number>();
    citedFiles.forEach((filePath, i) => map.set(filePath, i + 1));
    return map;
  }, [citedFiles]);
  // Stable renderer identities keep stateful blocks mounted across message hover updates.
  const components = useMemo<Components>(() => ({
    code({ className, children, ...props }) {
      const lang = className?.replace("language-", "").toLowerCase() ?? "";
      const raw = String(children);
      const isBlock = className?.includes("language-") || raw.includes("\n");
      if (isBlock) {
        if (lang === "mermaid") {
          return <MermaidBlock code={raw.replace(/\n$/, "")} isStreaming={isStreaming} />;
        }
        return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} isStreaming={isStreaming} />;
      }
      return (
        <code
          className="markdown-inline-code"
          {...props}
        >
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    a({ href, children, ...props }) {
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;
      const openFile = onOpenFile;
      if (!filePath || !openFile) {
        return (
          <a href={href} {...props} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }

      const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.currentTarget.getAttribute("target");
        if (target && target !== "_self") return;
        event.preventDefault();
        openFile(filePath);
      };

      // File-citation chip (AILI-owned design): the link keeps its inline text
      // and in-app click behavior, and carries a numbered chip with the path
      // on hover. Reimplemented independently after the AIcss locked-component
      // audit (2026-08-18); styles are the aili-cite-* block in globals.css.
      const citeN = citationsEnabled ? citationIndex.get(filePath) : undefined;
      const link = (
        <a href={href} {...props} onClick={handleClick}>
          {children}
        </a>
      );
      if (citeN === undefined) return link;
      return (
        <>
          {link}
          <span className="aili-cite-tip">
            <sup className="aili-cite-mark">{citeN}</sup>
            <span className="aili-cite-box" role="tooltip">{filePath}</span>
          </span>
        </>
      );
    },
    img({ src, alt, ...props }) {
      delete props.node;
      const filePath = typeof src === "string" ? resolveLocalFileHref(src, cwd) : null;
      const imageSrc = filePath
        ? `/api/files/${encodeFilePathForApi(filePath)}?type=read`
        : src;
      // Dynamic local paths are served directly by the file API.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={imageSrc} alt={alt ?? ""} loading="lazy" {...props} />;
    },
    ul({ children, ...props }) {
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      const entries = taskListEntries(children);
      if (entries) {
        const firstPending = entries.findIndex((entry) => !entry.done);
        const current = firstPending === -1
          ? entries.length
          : entries.some((entry) => entry.done) ? firstPending : -1;
        return <TodoList items={entries.map((entry) => entry.label)} current={current} />;
      }
      return <ul {...props}>{children}</ul>;
    },
    table({ children }) {
      return (
        <div className="markdown-table-wrap">
          <table>{children}</table>
        </div>
      );
    },
    td({ children, ...props }) {
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      const text = plainCellText(children);
      if (text !== null) {
        if (CELL_YES_MARKS.has(text.toLowerCase())) return <td {...props} className="aili-cell-yes">{children}</td>;
        if (CELL_NO_MARKS.has(text.toLowerCase())) return <td {...props} className="aili-cell-no">{children}</td>;
      }
      return <td {...props}>{children}</td>;
    },
  }), [cwd, isStreaming, onOpenFile, citationsEnabled, citationIndex]);

  return (
    <div className={["markdown-body", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        components={components}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
      {citedFiles.length > 0 && (
        <div className="aili-cite-footer">
          {citedFiles.map((filePath, i) => (
            <a
              key={filePath}
              className="aili-cite-ref"
              href={onOpenFile ? "#" : `/api/files/${encodeFilePathForApi(filePath)}?type=read`}
              onClick={(event) => {
                if (!onOpenFile) return;
                event.preventDefault();
                onOpenFile(filePath);
              }}
            >
              <span className="aili-cite-mark">{i + 1}</span>
              <span className="aili-cite-path">{filePath}</span>
              <span className="aili-cite-open" aria-hidden>↗</span>
            </a>
          ))}
        </div>
      )}
      {isStreaming && (
        <span className={`${caretStyles.caret} ${caretStyles.caretSteady}`} aria-hidden />
      )}
    </div>
  );
}
