"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

// User terminal panel (webui-user-terminal, design decision 5). The label is
// the contract: this is the USER's own shell ("Terminal · User controlled"),
// not the agent bash tool — it never routes through agent tool authorization,
// permission modes, or the questionnaire invariants. Single instance; closing
// (or losing) the connection ends the PTY and reopening starts a clean
// session with no stale replay.

type TerminalStatus = "connecting" | "ready" | "ended" | "error";

interface TerminalSessionInfo {
  path: string;
  token: string;
}

export function TerminalPanel({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let observer: ResizeObserver | null = null;

    const start = async () => {
      let session: TerminalSessionInfo;
      try {
        const response = await fetch(`/api/terminal?cwd=${encodeURIComponent(cwd)}`);
        const data = (await response.json()) as TerminalSessionInfo & { error?: string };
        if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
        session = data;
      } catch (error) {
        if (disposed) return;
        setStatus("error");
        setErrorDetail(error instanceof Error ? error.message : String(error));
        return;
      }

      let Terminal: typeof import("@xterm/xterm").Terminal;
      let FitAddon: typeof import("@xterm/addon-fit").FitAddon;
      try {
        [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
      } catch {
        if (disposed) return;
        setStatus("error");
        setErrorDetail("terminal frontend failed to load");
        return;
      }

      if (disposed || !bodyRef.current) return;
      const fit = new FitAddon();
      terminal = new Terminal({
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 12,
        cursorBlink: true,
        scrollback: 4000,
      });
      terminal.loadAddon(fit);
      terminal.open(bodyRef.current);
      try {
        terminal.focus();
      } catch {
        // focus before layout settles; onopen retries
      }

      // Same origin and port as the app itself: the upgrade is routed by the
      // server's instrumentation hook, so reachability matches the app
      // everywhere (including WSL2 Windows→WSL forwarding).
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(
        `${protocol}://${window.location.host}${session.path}?token=${encodeURIComponent(session.token)}&cwd=${encodeURIComponent(cwd)}`,
      );

      const sendResize = () => {
        if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ t: "resize", cols: terminal.cols, rows: terminal.rows }));
      };

      socket.onopen = () => {
        if (disposed) return;
        setStatus("ready");
        try {
          fit.fit();
        } catch {
          // container not measured yet; the observer retries
        }
        sendResize();
        terminal?.focus();
      };
      socket.onmessage = (event) => {
        if (typeof event.data === "string") terminal?.write(event.data);
      };
      socket.onclose = (event) => {
        if (disposed) return;
        setStatus("ended");
        setErrorDetail(event.reason ? `close ${event.code} ${event.reason}` : `close ${event.code}`);
      };
      socket.onerror = () => {
        if (disposed) return;
        setStatus("error");
        setErrorDetail("websocket error");
      };

      terminal.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "d", data }));
      });

      observer = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          // not measurable yet
        }
        sendResize();
      });
      observer.observe(bodyRef.current);
    };

    void start();

    return () => {
      disposed = true;
      observer?.disconnect();
      socket?.close();
      terminal?.dispose();
    };
  }, [cwd]);

  return (
    <div
      role="complementary"
      aria-label={t("terminal.title")}
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 16,
        width: "min(880px, 94vw)",
        height: 340,
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.3)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 650, color: "var(--text)" }}>{t("terminal.title")}</span>
        <span title={cwd} style={{ fontFamily: "var(--font-mono)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {cwd}
        </span>
        <span>{t(`terminal.status.${status}`)}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("terminal.close")}
          title={t("terminal.close")}
          style={{ width: 22, height: 22, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 4, background: "none", color: "var(--text-dim)", cursor: "pointer", flexShrink: 0 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12" />
            <path d="m18 6-12 12" />
          </svg>
        </button>
      </div>
      <div
        ref={bodyRef}
        onClick={() => {
          // Click-to-focus: xterm's textarea owns the keys.
          bodyRef.current?.querySelector("textarea")?.focus();
        }}
        style={{ flex: 1, minHeight: 0, padding: "4px 6px", background: "var(--bg)" }}
      />
      {status === "connecting" && (
        <div style={{ position: "absolute", inset: "32px 0 0 0", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 12, pointerEvents: "none" }}>
          {t("terminal.connecting")}
        </div>
      )}
      {(status === "error" || status === "ended") && (
        <div style={{ position: "absolute", inset: "32px 0 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--text-dim)", fontSize: 12, pointerEvents: "none" }}>
          <span>{status === "error" ? t("terminal.unavailable", { reason: errorDetail ?? "" }) : t("terminal.ended")}</span>
        </div>
      )}
    </div>
  );
}
