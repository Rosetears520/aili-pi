import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MCP_STATUS_EVENT } from "pi-mcp-adapter";
import { subscribeMcpStatus } from "../../src/runtime/mcp.js";
import { NativeFooterLifecycle } from "./lifecycle.js";
import { plainDisplayText, renderNativeFooter } from "./layout.js";

const QUOTA_STATUS_KEY = "pi-quota-status";
const RETRY_STATUS_KEY = "aili-provider-retry";
const PERMISSION_STATUS_KEY = "perm";

function timeLabel(now = new Date()): string {
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function contextUsageSnapshot(ctx: ExtensionContext): { contextTokens: number | null | undefined; contextWindow: number | undefined } {
  const usage = ctx.getContextUsage();
  return {
    contextTokens: usage?.tokens,
    contextWindow: usage?.contextWindow ?? ctx.model?.contextWindow,
  };
}

export default function nativeFooter(pi: ExtensionAPI): void {
  let activeContext: ExtensionContext | undefined;
  let requestMcpRender: (() => void) | undefined;
  const events = pi.events;
  const canObserveMcp = typeof events?.on === "function";
  const mcpStatus = canObserveMcp ? subscribeMcpStatus(pi) : undefined;
  const unsubscribeMcpRender = canObserveMcp
    ? events.on(MCP_STATUS_EVENT, () => requestMcpRender?.())
    : () => {};

  const clear = () => {
    const ctx = activeContext;
    activeContext = undefined;
    requestMcpRender = undefined;
    if (ctx?.mode === "tui") ctx.ui.setFooter(undefined);
  };

  const install = (ctx: ExtensionContext) => {
    clear();
    if (ctx.mode !== "tui") return;
    activeContext = ctx;
    ctx.ui.setFooter((tui, theme, footerData) => {
      const lifecycle = new NativeFooterLifecycle();
      const requestRender = () => tui.requestRender();
      requestMcpRender = requestRender;
      const unsubscribeBranch = footerData.onBranchChange(requestRender);
      lifecycle.start(requestRender);
      let disposed = false;

      return {
        dispose() {
          if (disposed) return;
          disposed = true;
          if (requestMcpRender === requestRender) requestMcpRender = undefined;
          unsubscribeBranch();
          lifecycle.stop();
        },
        invalidate() {},
        render(width: number): string[] {
          const statuses = footerData.getExtensionStatuses();
          lifecycle.statusChanged(statuses);
          const quota = plainDisplayText(statuses.get(QUOTA_STATUS_KEY));
          const mcp = mcpStatus?.snapshot();
          const lines = renderNativeFooter({
            provider: ctx.model?.provider,
            model: ctx.model?.id,
            thinking: ctx.thinkingLevel,
            quota,
            permissionMode: plainDisplayText(statuses.get(PERMISSION_STATUS_KEY)),
            retry: plainDisplayText(statuses.get(RETRY_STATUS_KEY)),
            ...contextUsageSnapshot(ctx),
            mcpConnectedCount: mcp?.connectedCount ?? 0,
            mcpEnabledCount: mcp ? Math.max(0, mcp.servers.length - mcp.disabledCount) : 0,
            clock: timeLabel(),
            gitBranch: footerData.getGitBranch() ?? undefined,
            cwd: basename(ctx.cwd),
          }, width);
          return lines.map((line) => theme.fg("dim", line));
        },
      };
    });
  };

  pi.on("session_start", (_event, ctx) => install(ctx));
  pi.on("session_before_switch", () => clear());
  pi.on("session_shutdown", () => {
    clear();
    unsubscribeMcpRender();
    mcpStatus?.dispose();
  });
  pi.on("model_select", (_event, ctx) => {
    if (activeContext === ctx) install(ctx);
  });
  pi.on("thinking_level_select", (_event, ctx) => {
    if (activeContext === ctx) install(ctx);
  });
}
