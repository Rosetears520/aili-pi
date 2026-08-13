import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { AnalyticsScopeRegistry, AnalyticsStore, type AnalyticsStoreOptions, type AnalyticsTimeRange } from "../../src/runtime/analytics/store.js";

export const ANALYTICS_COMMAND_NAME = "analytics" as const;
const DAY_MS = 24 * 60 * 60 * 1_000;

interface ActiveAnalyticsSession {
  readonly sessionId: string;
  readonly scope: string;
  readonly store: AnalyticsStore;
  startedAtMs?: number;
}

export interface AnalyticsTuiControllerOptions {
  readonly createStore?: (options: AnalyticsStoreOptions) => AnalyticsStore;
  readonly scopes?: AnalyticsScopeRegistry;
  readonly now?: () => number;
  readonly root?: () => string;
}

/** Retained Pi-only command controller; it never renders events or scopes into model context. */
export class AnalyticsTuiController {
  private readonly createStore: (options: AnalyticsStoreOptions) => AnalyticsStore;
  private readonly scopes: AnalyticsScopeRegistry;
  private readonly now: () => number;
  private readonly root: () => string;
  private active: ActiveAnalyticsSession | undefined;

  public constructor(options: AnalyticsTuiControllerOptions = {}) {
    this.createStore = options.createStore ?? ((storeOptions) => new AnalyticsStore(storeOptions));
    this.scopes = options.scopes ?? new AnalyticsScopeRegistry();
    this.now = options.now ?? Date.now;
    this.root = options.root ?? (() => join(getAgentDir(), "aili-analytics"));
  }

  public start(context: Pick<ExtensionContext, "sessionManager">): void {
    const sessionId = context.sessionManager.getSessionId();
    const scope = this.scopes.scopeForSession(sessionId);
    this.active = { sessionId, scope, store: this.createStore({ root: this.root() }) };
  }

  public shutdown(): void {
    if (this.active) this.scopes.release(this.active.sessionId);
    this.active = undefined;
  }

  public agentStart(): void { if (this.active) this.active.startedAtMs = this.now(); }

  /** Stores only one content-free response-cycle counter; messages are never read. */
  public async agentSettled(context: Pick<ExtensionContext, "model">): Promise<void> {
    const active = this.active;
    if (!active) return;
    const startedAtMs = active.startedAtMs ?? this.now();
    active.startedAtMs = undefined;
    try {
      await active.store.append({
        timestampMs: this.now(),
        durationMs: Math.max(0, this.now() - startedAtMs),
        scope: active.scope,
        kind: "response",
        responseCount: 1,
        outcome: "success",
        ...(safeModel(context.model?.provider, "provider")),
        ...(safeModel(context.model?.id, "model")),
      });
    } catch {
      // Analytics remains best-effort and must not disrupt a settled Pi turn.
    }
  }

  /** Tool event metadata is limited to tool name, timing, and outcome. */
  public async toolEnded(event: { toolName: string; isError: boolean }, context: Pick<ExtensionContext, "model">): Promise<void> {
    const active = this.active;
    if (!active) return;
    try {
      await active.store.append({
        timestampMs: this.now(),
        scope: active.scope,
        kind: "tool",
        tool: safeName(event.toolName),
        outcome: event.isError ? "error" : "success",
        ...(safeModel(context.model?.provider, "provider")),
        ...(safeModel(context.model?.id, "model")),
      });
    } catch { /* Never expose tool arguments, results, or storage details. */ }
  }

  public async open(args: string, context: ExtensionCommandContext): Promise<void> {
    if (context.mode !== "tui" || !context.hasUI) {
      context.ui.notify("Analytics is available only in the interactive Pi TUI", "warning");
      return;
    }
    if (!this.active || this.active.sessionId !== context.sessionManager.getSessionId()) this.start(context);
    const active = this.active!;
    const command = parseAnalyticsCommand(args, this.now());
    if (command.kind === "summary") {
      const result = await active.store.query(command.range);
      context.ui.notify(renderSafeAnalyticsSummary(result.summary, result.sizeBytes, command.label), "info");
      return;
    }
    const message = command.kind === "all"
      ? "Delete all local AILI Analytics metadata? Pi conversation history is not affected."
      : `Delete local AILI Analytics metadata from ${new Date(command.range.fromMs).toISOString()} to ${new Date(command.range.toMs).toISOString()}? Pi conversation history is not affected.`;
    const confirmed = await context.ui.confirm("Clear Analytics data?", message);
    if (!confirmed) return;
    const result = command.kind === "all" ? await active.store.clearAll() : await active.store.clearRange(command.range);
    context.ui.notify(`Analytics cleanup completed: deleted=${result.deletedRecords}, retained=${result.retainedRecords}, bytes=${result.deletedBytes}.`, "info");
  }
}

export function registerAnalyticsCommand(pi: ExtensionAPI, controller = new AnalyticsTuiController()): void {
  pi.registerCommand(ANALYTICS_COMMAND_NAME, {
    description: "Show content-free local Analytics; use clear all or clear <fromMs> <toMs> for explicit cleanup",
    handler: async (args, context) => controller.open(args, context),
  });
  pi.on("session_start", (_event, context) => controller.start(context));
  pi.on("agent_start", () => controller.agentStart());
  pi.on("agent_settled", async (_event, context) => controller.agentSettled(context));
  pi.on("tool_execution_end", async (event, context) => controller.toolEnded(event, context));
  pi.on("session_shutdown", () => controller.shutdown());
}

export type AnalyticsCommand =
  | { readonly kind: "summary"; readonly range: AnalyticsTimeRange; readonly label: string }
  | { readonly kind: "range"; readonly range: AnalyticsTimeRange }
  | { readonly kind: "all" };

export function parseAnalyticsCommand(args: string, now = Date.now()): AnalyticsCommand {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || (tokens.length === 1 && ["today", "7d", "30d", "all"].includes(tokens[0]!))) {
    const label = tokens[0] ?? "7d";
    return { kind: "summary", label, range: namedRange(label, now) };
  }
  if (tokens.length === 2 && tokens[0] === "clear" && tokens[1] === "all") return { kind: "all" };
  if (tokens.length === 3 && tokens[0] === "clear" && /^\d+$/.test(tokens[1]!) && /^\d+$/.test(tokens[2]!)) {
    const range = { fromMs: Number(tokens[1]), toMs: Number(tokens[2]) };
    if (!Number.isSafeInteger(range.fromMs) || !Number.isSafeInteger(range.toMs) || range.toMs <= range.fromMs) throw new Error("Analytics cleanup range is invalid");
    return { kind: "range", range };
  }
  throw new Error("Analytics accepts today, 7d, 30d, all, clear all, or clear <fromMs> <toMs>");
}

export function renderSafeAnalyticsSummary(summary: { records: number; responseCount: number; llmCallCount: number; toolCount: number; errorCount: number; durationMs: number; inputTokens: number; outputTokens: number; costMicros: number; corruptRecords: number; truncatedDimensions: boolean }, sizeBytes: number, label: string): string {
  return [
    `Analytics (${label}) · local content-free metadata`,
    `records=${summary.records} responses=${summary.responseCount} llmCalls=${summary.llmCallCount} tools=${summary.toolCount} errors=${summary.errorCount}`,
    `durationMs=${summary.durationMs} inputTokens=${summary.inputTokens} outputTokens=${summary.outputTokens} costMicros=${summary.costMicros}`,
    `storeBytes=${sizeBytes} corruptQuarantined=${summary.corruptRecords} dimensions=${summary.truncatedDimensions ? "bounded" : "complete"}`,
    "Never stored: prompts, replies, thinking, tool arguments/results, raw errors, credentials, paths, titles, labels, or raw session IDs.",
  ].join("\n");
}

function namedRange(name: string, now: number): AnalyticsTimeRange {
  if (name === "today") { const date = new Date(now); return { fromMs: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(), toMs: now + 1 }; }
  if (name === "30d") return { fromMs: now - 30 * DAY_MS, toMs: now + 1 };
  if (name === "all") return { fromMs: 0, toMs: now + 1 };
  return { fromMs: now - 7 * DAY_MS, toMs: now + 1 };
}
function safeName(value: string): string { const normalized = value.trim().toLowerCase(); return /^[a-z0-9][a-z0-9._:/@-]{0,95}$/.test(normalized) ? normalized : "unknown"; }
function safeModel(value: unknown, key: "provider" | "model"): Record<string, string> { return typeof value === "string" ? { [key]: safeName(value) } : {}; }
