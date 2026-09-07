import { basename, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MCP_STATUS_EVENT } from "pi-mcp-adapter";
import { subscribeMcpStatus } from "../../src/runtime/mcp.js";
import { ApiTelemetryTracker } from "../../src/runtime/telemetry/speed.js";
import { NativeFooterLifecycle } from "./lifecycle.js";
import { plainDisplayText, renderNativeFooterView, type FooterSegment, type FooterTone } from "./layout.js";

const QUOTA_STATUS_KEY = "pi-quota-status";
const RETRY_STATUS_KEY = "aili-provider-retry";
const PERMISSION_STATUS_KEY = "perm";

/** Footer tones expressed through existing theme semantic colors only. */
const TONE_COLORS: Record<FooterTone, "text" | "muted" | "dim" | "warning" | "error"> = {
  primary: "text",
  secondary: "muted",
  muted: "dim",
  warning: "warning",
  alert: "error",
};

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

function isAssistantMessage(value: unknown): value is { role: "assistant"; content?: unknown; stopReason?: string } {
  return typeof value === "object" && value !== null && (value as { role?: unknown }).role === "assistant";
}

/**
 * Shared Visible Text Speed state for the active TUI session. Stream events
 * update it in memory only — the delta hot path is O(delta) and never touches
 * a render; the footer redraws on the adaptive lifecycle tick (1 Hz while
 * live, one wake per minute while idle).
 */
const telemetry = new ApiTelemetryTracker();

/** Set while a TUI footer is installed; lets stream events retune its timer. */
let activeLifecycle: NativeFooterLifecycle | undefined;

function observeTelemetryEvents(pi: ExtensionAPI): void {
  pi.on("message_start", (event) => {
    if (!isAssistantMessage(event.message)) return;
    telemetry.begin();
    // Idle → waiting: retune the footer timer without rendering.
    activeLifecycle?.activityChanged();
  });
  pi.on("message_update", (event) => {
    if (!isAssistantMessage(event.message)) return;
    const streamEvent = event.assistantMessageEvent as { type?: unknown; delta?: unknown } | undefined;
    if (streamEvent?.type === "text_delta" && typeof streamEvent.delta === "string") {
      telemetry.observeTextDelta(streamEvent.delta);
    }
    // thinking/tool deltas intentionally never feed Visible Text Speed
  });
  pi.on("message_end", (event) => {
    if (!isAssistantMessage(event.message)) return;
    if (event.message.stopReason === "error" || event.message.stopReason === "aborted") telemetry.fail();
    else telemetry.complete();
    activeLifecycle?.activityChanged();
  });
}

export default function nativeFooter(pi: ExtensionAPI): void {
  let activeContext: ExtensionContext | undefined;
  let requestMcpRender: (() => void) | undefined;
  const events = pi.events;
  const mcpStatus = subscribeMcpStatus(pi);
  const unsubscribeMcpRender = events.on(MCP_STATUS_EVENT, () => requestMcpRender?.());

  observeTelemetryEvents(pi);

  const clear = () => {
    const ctx = activeContext;
    activeContext = undefined;
    requestMcpRender = undefined;
    activeLifecycle = undefined;
    if (ctx?.mode === "tui") ctx.ui.setFooter(undefined);
  };

  const install = (ctx: ExtensionContext) => {
    clear();
    if (ctx.mode !== "tui") return;
    activeContext = ctx;
    // The worktree-aware label runs git once per install; the render path
    // never touches a subprocess.
    const cwdLabel = cwdFooterLabel(ctx.cwd);
    ctx.ui.setFooter((tui, theme, footerData) => {
      const lifecycle = new NativeFooterLifecycle({
        renderSignal: () => telemetry.displaySignature(),
        needsFastTick: () => telemetry.needsTick(),
      });
      activeLifecycle = lifecycle;
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
          if (activeLifecycle === lifecycle) activeLifecycle = undefined;
          unsubscribeBranch();
          lifecycle.stop();
        },
        invalidate() {},
        render(width: number): string[] {
          const statuses = footerData.getExtensionStatuses();
          lifecycle.statusChanged(statuses);
          const quota = plainDisplayText(statuses.get(QUOTA_STATUS_KEY));
          const mcp = mcpStatus?.snapshot();
          const [primary, secondary] = renderNativeFooterView({
            provider: ctx.model?.provider,
            model: ctx.model?.id,
            thinking: ctx.thinkingLevel,
            quota,
            permissionMode: plainDisplayText(statuses.get(PERMISSION_STATUS_KEY)),
            retry: plainDisplayText(statuses.get(RETRY_STATUS_KEY)),
            ...contextUsageSnapshot(ctx),
            mcpConnectedCount: mcp.connectedCount,
            mcpEnabledCount: Math.max(0, mcp.servers.length - mcp.disabledCount),
            clock: timeLabel(),
            gitBranch: footerData.getGitBranch() ?? undefined,
            // Worktree-aware: inside a linked worktree basename(cwd) is a
            // machine-ish name — keep the MAIN repository's project identity
            // visible as "project/worktree" (user report 2026-08-20: aili-pi
            // vanished under implementer-9-1786611318131).
            cwd: cwdLabel,
            telemetry: telemetry.snapshot(),
          }, width);
          return [primary, secondary].map((line) => renderSegments(theme, line.segments));
        },
      };
    });
  };

  pi.on("session_start", (_event, ctx) => {
    telemetry.reset();
    install(ctx);
  });
  pi.on("session_before_switch", () => clear());
  pi.on("session_shutdown", () => {
    clear();
    unsubscribeMcpRender();
    mcpStatus.dispose();
  });
  pi.on("model_select", (_event, ctx) => {
    if (activeContext === ctx) install(ctx);
  });
  pi.on("thinking_level_select", (_event, ctx) => {
    if (activeContext === ctx) install(ctx);
  });
}

function renderSegments(theme: { fg(color: "text" | "muted" | "dim" | "warning" | "error", text: string): string }, segments: readonly FooterSegment[]): string {
  return segments.map((segment) => theme.fg(TONE_COLORS[segment.tone], segment.text)).join("");
}

/** "project" in the main repo, "project/worktree-basename" inside one. */
const cwdLabelCache = new Map<string, string>();

function cwdFooterLabel(cwd: string): string {
  const cached = cwdLabelCache.get(cwd);
  if (cached !== undefined) return cached;
  const label = computeCwdFooterLabel(cwd);
  if (cwdLabelCache.size > 32) cwdLabelCache.clear();
  cwdLabelCache.set(cwd, label);
  return label;
}

function computeCwdFooterLabel(cwd: string): string {
  const leaf = basename(cwd);
  try {
    const commonDir = execFileSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (!commonDir) return leaf;
    const mainRoot = dirname(commonDir);
    if (cwd === mainRoot) return leaf;
    const project = basename(mainRoot);
    if (!project || project === leaf) return leaf;
    return `${project}/${leaf}`;
  } catch {
    return leaf;
  }
}
