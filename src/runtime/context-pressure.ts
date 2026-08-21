import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AcpPressureEvaluator } from "../../upstream/billion-context-pi/dist/index.js";

// Unified pressure timing: WHEN comes from the vendored ACP evaluator (the
// exact processTurn nudge verdict the non-Codex pipeline uses), HOW stays
// provider-routed — Codex-owned turns relieve via Pi's public ctx.compact()
// (pi-codex-compact handles the remote compaction), every other owner keeps
// billion-context-pi's model-driven path untouched. Following Pi's own
// trigger-compact example, pressure is observed on turn_end so compaction
// never interrupts an in-flight provider request mid-context.

export interface ContextPressureWiring {
  /** True only while the turn-frozen route owner is codex-remote-v2. */
  ownsCodexContext(ctx: ExtensionContext): boolean;
  evaluator: AcpPressureEvaluator;
  /** Optional diagnostic sink; errors never break the host pipeline. */
  log?: (message: string) => void;
}

export function wireContextPressure(pi: ExtensionAPI, wiring: ContextPressureWiring): void {
  // One relief attempt at a time per session: turn_end can fire repeatedly
  // inside one pressure epoch and compaction is asynchronous.
  const inflight = new Set<string>();

  const sessionKey = (ctx: ExtensionContext): string =>
    ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();

  pi.on("turn_end", async (_event, ctx) => {
    if (!ctx.model || !wiring.ownsCodexContext(ctx)) return;
    const key = sessionKey(ctx);
    if (inflight.has(key)) return;
    let decision;
    try {
      decision = await wiring.evaluator.observe(ctx);
    } catch (error) {
      wiring.log?.(`context pressure observe failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!decision.shouldRelieve) return;
    inflight.add(key);
    wiring.log?.(
      `context pressure relief requested (usage ${Math.round(decision.usage * 100)}%${decision.emergency ? ", emergency" : ""}) — compacting via pi-codex-compact`,
    );
    try {
      ctx.compact({
        onComplete: () => {
          inflight.delete(key);
        },
        onError: (error) => {
          inflight.delete(key);
          wiring.log?.(`context pressure compaction failed: ${error.message}`);
        },
      });
    } catch (error) {
      inflight.delete(key);
      wiring.log?.(`context pressure compaction trigger failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // ACP owns the normal WHEN for Codex sessions, so Pi's built-in threshold
  // auto-compaction must not run a competing second policy. Manual compaction
  // (this controller's ctx.compact() and user /compact) and the overflow
  // safety recovery stay allowed.
  pi.on("session_before_compact", (event, ctx) => {
    if (event.reason !== "threshold" || !ctx.model || !wiring.ownsCodexContext(ctx)) return undefined;
    wiring.log?.("cancelled Pi threshold auto-compaction on a codex-remote-v2 turn (ACP owns the WHEN)");
    return { cancel: true };
  });

  // Any successful Codex-route compaction (pressure-triggered or manual)
  // rebuilds the evaluator baseline so post-compaction usage observations
  // start a fresh pressure epoch instead of immediately re-firing.
  pi.on("session_compact", (_event, ctx) => {
    if (!ctx.model || !wiring.ownsCodexContext(ctx)) return;
    const key = sessionKey(ctx);
    inflight.delete(key);
    try {
      wiring.evaluator.reset(ctx);
    } catch (error) {
      wiring.log?.(`context pressure reset failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const resetSession = (ctx: ExtensionContext) => {
    const key = sessionKey(ctx);
    inflight.delete(key);
    try {
      wiring.evaluator.reset(ctx);
    } catch {
      // Reset is hygiene only; a stale baseline safely re-establishes itself.
    }
  };
  pi.on("session_before_switch", (_event, ctx) => resetSession(ctx));
  pi.on("session_shutdown", (_event, ctx) => resetSession(ctx));
}
