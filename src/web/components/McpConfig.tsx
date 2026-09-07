"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { getGatewayClient } from "@/gateway-client";

// MCP management panel (webui-mcp-management). Config-layer truth only in v1:
// per-server identity, disabled state, and lifecycle from the shared global
// config, persisted through the adapter's public global writer — never a
// second configuration authority, never server definitions or credentials.
// The effect-timing hint states the adapter's honest semantics (applies on
// session reload); the panel never auto-reloads or auto-reconnects.

type McpLifecycle = "eager" | "keep-alive" | "lazy" | "lazy-keep-alive";
type McpPanelMode = McpLifecycle | "disabled";

const MCP_PANEL_MODES = ["eager", "keep-alive", "lazy", "lazy-keep-alive", "disabled"] as const;
const MCP_MODE_LABEL_KEYS: Record<McpPanelMode, string> = {
  eager: "mcp.lifecycleEager",
  "keep-alive": "mcp.lifecycleKeepAlive",
  lazy: "mcp.lifecycleLazy",
  "lazy-keep-alive": "mcp.lifecycleLazyKeepAlive",
  disabled: "mcp.stateDisabled",
};

function isMcpPanelMode(value: string): value is McpPanelMode {
  return (MCP_PANEL_MODES as readonly string[]).includes(value);
}

interface McpPanelServer {
  name: string;
  disabled: boolean;
  lifecycle: McpLifecycle;
}

interface McpRuntimeServer {
  name: string;
  status: "connected" | "cached" | "failed" | "needs-auth" | "not-connected" | "disabled";
  toolCount: number;
  resourceCount?: number;
}

interface McpRuntimeSnapshot {
  servers: McpRuntimeServer[];
  totalTools: number;
  connectedCount: number;
  disabledCount: number;
}

const RUNTIME_STATE_KEY: Record<McpRuntimeServer["status"], string> = {
  connected: "mcp.rt.connected",
  cached: "mcp.rt.cached",
  failed: "mcp.rt.failed",
  "needs-auth": "mcp.rt.needsAuth",
  "not-connected": "mcp.rt.notConnected",
  disabled: "mcp.rt.disabled",
};

export function McpConfig({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const { t } = useI18n();
  const [servers, setServers] = useState<McpPanelServer[] | null>(null);
  const [runtime, setRuntime] = useState<McpRuntimeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyNames, setBusyNames] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/mcp?cwd=${encodeURIComponent(cwd)}`)
      .then(async (res) => {
        const data = (await res.json()) as { servers?: McpPanelServer[]; runtime?: McpRuntimeSnapshot | null; error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setServers(data.servers ?? []);
        setRuntime(data.runtime ?? null);
      })
      .catch((err) => {
        setServers([]);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [cwd]);

  useEffect(load, [load]);

  const changeMode = useCallback(async (server: McpPanelServer, mode: McpPanelMode) => {
    setBusyNames((prev) => new Set(prev).add(server.name));
    setError(null);
    try {
      const mutation = mode === "disabled"
        ? await getGatewayClient().configure(
          "mcp.configure",
          "set_disabled",
          { cwd, name: server.name, disabled: true },
        )
        : await getGatewayClient().configure(
          "mcp.configure",
          "set_lifecycle",
          { cwd, name: server.name, lifecycle: mode },
        );
      if (mutation.disposition !== "completed") throw new Error(mutation.reason);
      const data = mutation.result as { servers?: McpPanelServer[] } | undefined;
      setServers(data?.servers ?? []);
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
  const runtimeByname = new Map((runtime?.servers ?? []).map((server) => [server.name, server]));

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
          {servers === null
            ? t("mcp.loading")
            : runtime
              ? `${t("mcp.summary", { enabled: enabledCount, total: servers.length })} · ${t("mcp.rt.summary", { connected: runtime.connectedCount, tools: runtime.totalTools })}`
              : t("mcp.summary", { enabled: enabledCount, total: servers.length })}
          <span style={{ display: "block", marginTop: 3 }}>{t("mcp.reloadHint")}</span>
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "6px 6px 10px" }}>
          {error && <div role="alert" style={{ margin: "6px 8px", padding: "6px 8px", borderRadius: 6, color: "#f87171", fontSize: 12, border: "1px solid color-mix(in srgb, #f87171 40%, var(--border))" }}>{error}</div>}
          {servers?.map((server) => (
            <div key={server.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px" }}>
              <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{server.name}</span>
              {(() => {
                const rt = runtimeByname.get(server.name);
                if (!rt) return null;
                const color = rt.status === "connected" ? "#15a06a" : rt.status === "failed" || rt.status === "needs-auth" ? "#f59e0b" : "var(--text-dim)";
                return (
                  <span title={t("mcp.rt.tools", { count: rt.toolCount })} style={{ fontSize: 11, color, flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                    {t(RUNTIME_STATE_KEY[rt.status])}
                    {rt.toolCount > 0 ? ` · ${rt.toolCount}t` : ""}
                  </span>
                );
              })()}
              <span style={{ fontSize: 11, color: server.disabled ? "var(--text-dim)" : "#15a06a", flexShrink: 0 }}>{server.disabled ? t("mcp.stateDisabled") : t("mcp.stateEnabled")}</span>
              <select
                aria-label={t("mcp.mode", { name: server.name })}
                value={server.disabled ? "disabled" : server.lifecycle}
                disabled={busyNames.has(server.name)}
                onChange={(event) => {
                  const mode = event.currentTarget.value;
                  if (isMcpPanelMode(mode)) void changeMode(server, mode);
                }}
                style={{ height: 24, maxWidth: 150, flexShrink: 0, border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg-panel)", color: "var(--text)", fontSize: 11, cursor: "pointer" }}
              >
                {MCP_PANEL_MODES.map((mode) => <option key={mode} value={mode}>{t(MCP_MODE_LABEL_KEYS[mode])}</option>)}
              </select>
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
