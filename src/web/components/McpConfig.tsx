"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

// MCP management panel (webui-mcp-management). Config-layer truth only in v1:
// per-server identity + disabled state from the adapter's merged config, and
// toggles persisted through the adapter's own project-layer writer — never a
// second configuration authority, never server definitions or credentials.
// The effect-timing hint states the adapter's honest semantics (applies on
// session reload); the panel never auto-reloads or auto-reconnects.

interface McpPanelServer {
  name: string;
  disabled: boolean;
}

export function McpConfig({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const { t } = useI18n();
  const [servers, setServers] = useState<McpPanelServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyNames, setBusyNames] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/mcp?cwd=${encodeURIComponent(cwd)}`)
      .then(async (res) => {
        const data = (await res.json()) as { servers?: McpPanelServer[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setServers(data.servers ?? []);
      })
      .catch((err) => {
        setServers([]);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [cwd]);

  useEffect(load, [load]);

  const toggle = useCallback(async (server: McpPanelServer) => {
    setBusyNames((prev) => new Set(prev).add(server.name));
    setError(null);
    try {
      const res = await fetch("/api/mcp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd, name: server.name, disabled: !server.disabled }),
      });
      const data = (await res.json()) as { servers?: McpPanelServer[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setServers(data.servers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyNames((prev) => {
        const next = new Set(prev);
        next.delete(server.name);
        return next;
      });
    }
  }, [cwd]);

  const enabledCount = servers?.filter((server) => !server.disabled).length ?? 0;

  return (
    <div
      role="dialog"
      aria-label={t("mcp.panelTitle")}
      style={{
        position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, background: "rgba(0,0,0,0.32)",
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div style={{ width: "min(520px, 100%)", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <strong style={{ fontSize: 13 }}>{t("mcp.panelTitle")}</strong>
          <span style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={cwd}>{cwd}</span>
          <button type="button" onClick={onClose} aria-label={t("mcp.close")} style={{ width: 24, height: 24, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 4, background: "none", color: "var(--text-dim)", cursor: "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 6 12 12" /><path d="m18 6-12 12" /></svg>
          </button>
        </div>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 11 }}>
          {servers === null ? t("mcp.loading") : t("mcp.summary", { enabled: enabledCount, total: servers.length })}
          <span style={{ display: "block", marginTop: 3 }}>{t("mcp.reloadHint")}</span>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "6px 6px 10px" }}>
          {error && <div role="alert" style={{ margin: "6px 8px", padding: "6px 8px", borderRadius: 6, color: "#f87171", fontSize: 12, border: "1px solid color-mix(in srgb, #f87171 40%, var(--border))" }}>{error}</div>}
          {servers?.map((server) => (
            <div key={server.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px" }}>
              <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{server.name}</span>
              <span style={{ fontSize: 11, color: server.disabled ? "var(--text-dim)" : "#15a06a", flexShrink: 0 }}>{server.disabled ? t("mcp.stateDisabled") : t("mcp.stateEnabled")}</span>
              <button
                type="button"
                disabled={busyNames.has(server.name)}
                onClick={() => void toggle(server)}
                title={server.disabled ? t("mcp.enable", { name: server.name }) : t("mcp.disable", { name: server.name })}
                style={{ height: 22, padding: "0 9px", flexShrink: 0, border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-panel)", color: server.disabled ? "var(--text-muted)" : "#15a06a", fontSize: 11, cursor: "pointer" }}
              >
                {server.disabled ? t("mcp.actionEnable") : t("mcp.actionDisable")}
              </button>
            </div>
          ))}
          {servers !== null && servers.length === 0 && !error && (
            <div style={{ padding: "10px 12px", color: "var(--text-dim)", fontSize: 12 }}>{t("mcp.empty")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
