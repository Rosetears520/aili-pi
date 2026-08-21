"use client";

import React, { useEffect, useRef, useState } from "react";
import { MarkdownBody } from "../MarkdownBody";
import { useI18n } from "@/hooks/useI18n";

// Mirrors SafeMarkdownBody's guard in MessageView.tsx: pasted multi-hundred-KB
// payloads must not enter the react-markdown pipeline when previewing.
const PREVIEW_MAX_CHARS = 100_000;

interface AiliComposerExpandProps {
  open: boolean;
  value: string;
  onChange: (next: string) => void;
  /** Sends the draft and closes the editor. */
  onSend: () => void | Promise<void>;
  /** Shrinks back to the inline composer; the draft stays untouched. */
  onClose: () => void;
  attachments?: { previewUrl: string }[];
  onRemoveAttachment?: (index: number) => void;
  sendDisabled?: boolean;
  cwd?: string | null;
}

export function AiliComposerExpand({
  open,
  value,
  onChange,
  onSend,
  onClose,
  attachments,
  onRemoveAttachment,
  sendDisabled,
  cwd,
}: AiliComposerExpandProps) {
  const { t } = useI18n();
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Enter (and Ctrl/Cmd+Enter) deliberately stay textarea defaults here: they
  // insert a newline and never send. Sending happens only via the send button
  // or after shrinking back to the inline composer.

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || showPreview) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
  }, [open, showPreview]);

  if (!open) return null;

  const lineCount = value === "" ? 1 : value.split("\n").length;
  const oversizePreview = value.length > PREVIEW_MAX_CHARS;

  return (
    <div
      className="aili-composer-expand-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("chat.editMessage")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="aili-composer-expand">
        <div className="aili-composer-expand-header">
          <span className="aili-composer-expand-title">{t("chat.editMessage")}</span>
          <span className="aili-composer-expand-count" aria-hidden>{value.length} / {lineCount}</span>
          <div className="aili-composer-expand-actions">
            <button
              type="button"
              className={["aili-composer-expand-action", !showPreview ? "is-active" : ""].filter(Boolean).join(" ")}
              onClick={() => setShowPreview(false)}
              aria-pressed={!showPreview}
            >
              {t("i18n.source")}
            </button>
            <button
              type="button"
              className={["aili-composer-expand-action", showPreview ? "is-active" : ""].filter(Boolean).join(" ")}
              onClick={() => setShowPreview(true)}
              aria-pressed={showPreview}
            >
              {t("i18n.preview")}
            </button>
            <button
              type="button"
              className="aili-composer-expand-action"
              onClick={onClose}
              title={t("chat.minimizeEditor")}
              aria-label={t("chat.minimizeEditor")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              {t("chat.minimizeEditor")}
            </button>
          </div>
        </div>
        <div className="aili-composer-expand-body">
          {showPreview ? (
            oversizePreview ? (
              <pre className="aili-composer-expand-raw">{value}</pre>
            ) : value.trim() ? (
              <div className="aili-composer-expand-preview">
                <MarkdownBody className="markdown-user-message" cwd={cwd ?? undefined}>{value}</MarkdownBody>
              </div>
            ) : (
              <div className="aili-composer-expand-empty">{t("chat.editorPreviewEmpty")}</div>
            )
          ) : (
            <textarea
              ref={textareaRef}
              className="aili-composer-expand-textarea"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              aria-label={t("chat.editMessage")}
              spellCheck={false}
            />
          )}
        </div>
        {(attachments?.length ?? 0) > 0 && (
          <div className="aili-composer-chips aili-composer-expand-chips">
            {attachments!.map((img, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", display: "block" }}
                />
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(i)}
                    aria-label={t("chat.removeAttachment")}
                    style={{
                      position: "absolute", top: -4, right: -4,
                      width: 16, height: 16, borderRadius: "50%",
                      background: "var(--bg-panel)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", padding: 0, color: "var(--text-muted)",
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="aili-composer-expand-footer">
          <span className="aili-composer-expand-hint">{t("chat.editorEnterHint")}</span>
          <button
            type="button"
            className="aili-composer-expand-send"
            onClick={() => void onSend()}
            disabled={sendDisabled}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
            {t("chat.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
