import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const execFileAsync = promisify(execFile);
const HEAD_LINES = readFileSync(fileURLToPath(new URL("./rem-head.txt", import.meta.url)), "utf8").trimEnd().split("\n");
const WIDGET_KEY = "aili-rem-cyberdeck-working";

type GitSummary = { branch?: string; dirty: boolean };

export function renderRemHeader(width: number): string[] {
  if (width <= 0) return [];
  const title = " REM CYBERDECK ";
  const rail = "━".repeat(Math.max(1, Math.min(width, 48)));
  const centre = (line: string) => {
    const clipped = truncateToWidth(line, width, "");
    return `${" ".repeat(Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2)))}${clipped}`;
  };
  return ["", ...HEAD_LINES.map(centre), "", centre(rail), centre(title), ""];
}

export function summarizeGitPorcelain(stdout: string): GitSummary {
  const branch = stdout.match(/^## ([^ .\r\n]+)(?:\.\.\.|$)/m)?.[1];
  return { branch, dirty: stdout.split(/\r?\n/).some((line) => line.length > 0 && !line.startsWith("##")) };
}

async function readGitSummary(cwd: string): Promise<GitSummary> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], { cwd, timeout: 1_000 });
    return summarizeGitPorcelain(String(stdout));
  } catch {
    return { dirty: false };
  }
}

function tokenLabel(ctx: ExtensionContext): string {
  let tokens = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    tokens += entry.message.usage.input + entry.message.usage.output;
  }
  return tokens > 0 ? `${Math.round(tokens / 1000)}k tok` : "0 tok";
}

export function registerRemCyberdeck(pi: ExtensionAPI): void {
  let git: GitSummary = { dirty: false };
  let requestFooterRender: (() => void) | undefined;

  const refreshGit = (ctx: ExtensionContext) => {
    void readGitSummary(ctx.cwd).then((next) => {
      git = next;
      requestFooterRender?.();
    });
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader(() => ({ render: renderRemHeader, invalidate() {} }));
    ctx.ui.setWorkingIndicator({
      frames: [ctx.ui.theme.fg("dim", "·"), ctx.ui.theme.fg("accent", "◆"), ctx.ui.theme.fg("dim", "·")],
      intervalMs: 180,
    });
    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribe = footerData.onBranchChange(() => {
        refreshGit(ctx);
        tui.requestRender();
      });
      requestFooterRender = () => tui.requestRender();
      return {
        dispose: () => {
          unsubscribe();
          requestFooterRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          const usage = ctx.getContextUsage();
          const branch = footerData.getGitBranch() ?? git.branch;
          const branchLabel = branch ? `${git.dirty ? "✚ " : " "}${branch}` : "no git";
          const quota = [...footerData.getExtensionStatuses().entries()]
            .filter(([key]) => key === "pi-quota-status")
            .map(([, status]) => status)[0];
          const left = `${ctx.cwd.split("/").filter(Boolean).at(-1) ?? "/"} · ${branchLabel}`;
          const right = [ctx.model?.id, typeof usage?.percent === "number" ? `${Math.round(usage.percent)}% ctx` : undefined, tokenLabel(ctx), quota]
            .filter((value): value is string => Boolean(value))
            .join(" · ");
          const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
          return [truncateToWidth(`${left}${" ".repeat(gap)}${right}`, width, "")];
        },
      };
    });
    refreshGit(ctx);
  });

  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET_KEY, [ctx.ui.theme.fg("accent", "◆ REM link active")]);
  });
  pi.on("agent_end", (_event, ctx) => ctx.ui.setWidget(WIDGET_KEY, undefined));
  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    ctx.ui.setFooter(undefined);
    ctx.ui.setHeader(undefined);
    ctx.ui.setWorkingIndicator();
  });
}
