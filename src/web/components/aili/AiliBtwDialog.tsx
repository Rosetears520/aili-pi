"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const MAX_QUESTION_CHARS = 12_000;

interface BtwMessageDto {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}

interface BtwThreadDto {
  readonly id: string;
  readonly selection: { provider: string; model: string; thinking: string };
  readonly state: "idle" | "running" | "cancelled";
  readonly messages: readonly BtwMessageDto[];
}

interface BtwModelOption {
  readonly provider: string;
  readonly modelId: string;
  readonly name?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  modelOptions: readonly BtwModelOption[];
  currentModel?: { provider: string; modelId: string };
  availableThinkingLevels?: readonly string[] | null;
  onInsertDraft: (draft: string) => void;
}

async function btwCall(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/aili/btw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `request failed (HTTP ${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function asThread(value: unknown): BtwThreadDto {
  return value as BtwThreadDto;
}

/**
 * Codex-style floating side-thread dialog. Side exchanges are isolated in the
 * process-local BTW runtime; bringing material into the main conversation is
 * preview-first and only ever inserts into the composer draft.
 */
export function AiliBtwDialog({ open, onClose, modelOptions, currentModel, availableThinkingLevels, onInsertDraft }: Props) {
  const [threads, setThreads] = useState<readonly BtwThreadDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ previewId: string; text: string; messageCount: number } | null>(null);
  const [provider, setProvider] = useState(currentModel?.provider ?? modelOptions[0]?.provider ?? "");
  const [modelId, setModelId] = useState(currentModel?.modelId ?? modelOptions[0]?.modelId ?? "");
  const [thinking, setThinking] = useState<string>("low");
  const listRef = useRef<HTMLDivElement | null>(null);

  const levels = availableThinkingLevels?.length ? availableThinkingLevels : THINKING_LEVELS;

  const refresh = useCallback(async () => {
    try {
      const payload = await btwCall({ action: "list" });
      const list = Array.isArray(payload.threads) ? (payload.threads as unknown[]) : [];
      const mapped = list.map(asThread);
      setThreads(mapped);
      setActiveId((current) => current ?? mapped[mapped.length - 1]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [threads, activeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = threads.find((thread) => thread.id === activeId) ?? null;
  const providers = [...new Set(modelOptions.map((option) => option.provider))];

  const run = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    setError(null);
    try {
      return await btwCall(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createThread = async () => {
    if (!provider || !modelId) {
      setError("Pick a model first");
      return;
    }
    const payload = await run({ action: "create", provider, model: modelId, thinking });
    if (!payload) return;
    const thread = asThread(payload.thread);
    setThreads((prev) => [...prev.filter((candidate) => candidate.id !== thread.id), thread]);
    setActiveId(thread.id);
    setPreview(null);
  };

  const ask = async () => {
    const text = question.trim();
    if (!active || !text || busy) return;
    if (text.length > MAX_QUESTION_CHARS) {
      setError(`Question is too long (max ${MAX_QUESTION_CHARS} chars)`);
      return;
    }
    setQuestion("");
    const payload = await run({ action: "ask", threadId: active.id, question: text });
    if (!payload) return;
    const thread = asThread(payload.thread);
    setThreads((prev) => prev.map((candidate) => (candidate.id === thread.id ? thread : candidate)));
  };

  const cancelThread = async () => {
    if (!active || busy) return;
    const payload = await run({ action: "cancel", threadId: active.id });
    if (!payload) return;
    const thread = asThread(payload.thread);
    setThreads((prev) => prev.map((candidate) => (candidate.id === thread.id ? thread : candidate)));
  };

  const openPreview = async () => {
    if (!active || busy || active.messages.length === 0) return;
    const payload = await run({ action: "preview", threadId: active.id });
    if (!payload) return;
    setPreview({
      previewId: String(payload.previewId ?? ""),
      text: String(payload.text ?? ""),
      messageCount: Number(payload.messageCount ?? 0),
    });
  };

  const bringToMain = async () => {
    if (!preview || busy) return;
    const payload = await run({ action: "bring", previewId: preview.previewId });
    if (!payload) return;
    onInsertDraft(String(payload.text ?? ""));
    setPreview(null);
  };

  return (
    <div className="aili-btw" role="dialog" aria-label="BTW side thread">
      <div className="aili-btw-head">
        <span className="aili-btw-title">BTW · side thread</span>
        <span className="aili-btw-sub">
          {active
            ? `${active.selection.provider}/${active.selection.model} · ${active.selection.thinking} · ${active.state}`
            : "isolated, in memory only"}
        </span>
        <button className="aili-btw-x" onClick={onClose} aria-label="Close BTW dialog">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {threads.length > 0 && (
        <div className="aili-btw-threads">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={thread.id === activeId ? "aili-btw-tab aili-btw-tab--active" : "aili-btw-tab"}
              onClick={() => { setActiveId(thread.id); setPreview(null); }}
              title={`${thread.selection.provider}/${thread.selection.model} (${thread.selection.thinking})`}
            >
              {thread.id.slice(0, 8)} · {thread.messages.length}msg · {thread.state}
            </button>
          ))}
          <button className="aili-btw-tab" onClick={() => setActiveId(null)}>+ new</button>
        </div>
      )}

      {!active ? (
        <div className="aili-btw-create">
          <label className="aili-btw-label">
            model
            <select value={`${provider}::${modelId}`} onChange={(e) => {
              const [nextProvider, nextModel] = e.target.value.split("::");
              setProvider(nextProvider ?? "");
              setModelId(nextModel ?? "");
            }}>
              {providers.map((prov) =>
                modelOptions
                  .filter((option) => option.provider === prov)
                  .map((option) => (
                    <option key={`${option.provider}:${option.modelId}`} value={`${option.provider}::${option.modelId}`}>
                      {prov} / {option.name || option.modelId}
                    </option>
                  )),
              )}
            </select>
          </label>
          <label className="aili-btw-label">
            thinking
            <select value={thinking} onChange={(e) => setThinking(e.target.value)}>
              {levels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>
          <button className="aili-btw-btn" onClick={createThread} disabled={busy || !provider || !modelId}>
            Create side thread
          </button>
          <div className="aili-btw-note">Exchanges stay outside the main conversation and are lost when the server exits.</div>
        </div>
      ) : (
        <>
          <div className="aili-btw-list" ref={listRef}>
            {active.messages.length === 0 && (
              <div className="aili-btw-note">Ask an isolated question — it never touches the main session.</div>
            )}
            {active.messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "aili-btw-msg aili-btw-msg--user" : "aili-btw-msg"}>
                <span className="aili-btw-msg-role">{message.role}</span>
                <span className="aili-btw-msg-text">{message.text}</span>
              </div>
            ))}
            {busy && <div className="aili-btw-note">running side turn…</div>}
          </div>

          {preview ? (
            <div className="aili-btw-preview">
              <div className="aili-btw-preview-title">Bring to main — preview ({preview.messageCount} messages)</div>
              <pre className="aili-btw-preview-text">{preview.text}</pre>
              <div className="aili-btw-preview-actions">
                <button className="aili-btw-btn" onClick={bringToMain} disabled={busy}>Insert into composer</button>
                <button className="aili-btw-btn aili-btw-btn--ghost" onClick={() => setPreview(null)} disabled={busy}>Discard</button>
              </div>
            </div>
          ) : (
            <div className="aili-btw-ask">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) void ask();
                }}
                placeholder="Side-thread question…"
                disabled={busy || active.state === "cancelled"}
                maxLength={MAX_QUESTION_CHARS}
              />
              <button className="aili-btw-btn" onClick={ask} disabled={busy || !question.trim() || active.state === "cancelled"}>Ask</button>
            </div>
          )}

          <div className="aili-btw-foot">
            <button className="aili-btw-btn aili-btw-btn--ghost" onClick={openPreview} disabled={busy || active.messages.length === 0}>
              Bring to main…
            </button>
            <button className="aili-btw-btn aili-btw-btn--ghost" onClick={cancelThread} disabled={busy || active.state === "cancelled"}>
              Cancel thread
            </button>
          </div>
        </>
      )}

      {error && <div className="aili-btw-error" role="alert">{error}</div>}
    </div>
  );
}
