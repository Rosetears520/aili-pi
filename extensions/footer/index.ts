import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { NativeFooterLifecycle } from "./lifecycle.js";
import { plainDisplayText, renderNativeFooter } from "./layout.js";

const QUOTA_STATUS_KEY = "pi-quota-status";
const RETRY_STATUS_KEY = "aili-provider-retry";

function timeLabel(now = new Date()): string {
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function contextLabel(ctx: ExtensionContext): string | undefined {
  const usage = ctx.getContextUsage();
  return usage?.percent === null || usage?.percent === undefined
    ? undefined
    : `ctx ${Math.round(usage.percent)}%`;
}

export default function nativeFooter(pi: ExtensionAPI): void {
  let activeContext: ExtensionContext | undefined;

  const clear = () => {
    const ctx = activeContext;
    activeContext = undefined;
    if (ctx?.mode === "tui") ctx.ui.setFooter(undefined);
  };

  const install = (ctx: ExtensionContext) => {
    clear();
    if (ctx.mode !== "tui") return;
    activeContext = ctx;
    ctx.ui.setFooter((tui, theme, footerData) => {
      const lifecycle = new NativeFooterLifecycle();
      const requestRender = () => tui.requestRender();
      const unsubscribeBranch = footerData.onBranchChange(requestRender);
      lifecycle.start(requestRender);
      let disposed = false;

      return {
        dispose() {
          if (disposed) return;
          disposed = true;
          unsubscribeBranch();
          lifecycle.stop();
        },
        invalidate() {},
        render(width: number): string[] {
          const statuses = footerData.getExtensionStatuses();
          lifecycle.statusChanged(statuses);
          const quota = plainDisplayText(statuses.get(QUOTA_STATUS_KEY));
          const line = renderNativeFooter({
            provider: ctx.model?.provider,
            model: ctx.model?.id,
            quota,
            retry: plainDisplayText(statuses.get(RETRY_STATUS_KEY)),
            clock: timeLabel(),
            context: contextLabel(ctx),
            gitBranch: footerData.getGitBranch() ?? undefined,
            cwd: basename(ctx.cwd),
          }, width);
          return [theme.fg("dim", truncateToWidth(line, Math.max(0, width), ""))];
        },
      };
    });
  };

  pi.on("session_start", (_event, ctx) => install(ctx));
  pi.on("session_before_switch", () => clear());
  pi.on("session_shutdown", () => clear());
  pi.on("model_select", (_event, ctx) => {
    if (activeContext === ctx) install(ctx);
  });
}
