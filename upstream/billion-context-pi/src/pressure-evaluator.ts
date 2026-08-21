import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createInitialState, type CompressionState, type NudgeDecision } from "acp-kernel";
import type { AdapterConfig } from "./config.js";
import { createRuntime, readContextEntries, type AcpRuntime } from "./runtime.js";
import { entriesToCoreMessages } from "./messages.js";
import { collectCoveredMessageIds, estimateTokens } from "./tokens.js";
import { applyUserConfig, loadUserConfig } from "./user-config.js";
import { logInfo, logThrow } from "./log.js";

// AILI integration patch: decision-only pressure access to the exact same
// acp-kernel processTurn the context pipeline runs, for hosts that route the
// relief action themselves (Codex remote compaction) instead of letting ACP
// own the messages. The evaluator keeps its own in-memory decision state per
// session; it never persists <session>.acp.json, never injects nudges, and
// never returns mutated messages.

export interface AcpPressureDecision {
  /** The exact processTurn nudge verdict: relieve pressure now or not. */
  shouldRelieve: boolean;
  /** True when the emergency (>= 80%) override drove the decision. */
  emergency: boolean;
  tier: NudgeDecision["tier"];
  /** Context usage ratio the kernel computed for this observation. */
  usage: number;
  tokenCount: number;
  contextLimit: number;
  reason: string;
}

export interface AcpPressureEvaluator {
  observe(ctx: ExtensionContext): Promise<AcpPressureDecision>;
  /** Rebuild the decision baseline, e.g. after a successful compaction. */
  reset(ctx: ExtensionContext): void;
}

export function createAcpPressureEvaluator(adapter: AdapterConfig = {}): AcpPressureEvaluator {
  const runtime: AcpRuntime = createRuntime(adapter);
  // In-memory decision state keyed like the persisted store (session file,
  // falling back to the session id) but never written to disk. A host restart
  // simply rebuilds the baseline on the first observation.
  const states = new Map<string, CompressionState>();
  const configured = new Set<string>();

  function keyFor(ctx: ExtensionContext): string {
    return ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();
  }

  return {
    async observe(ctx) {
      const key = keyFor(ctx);
      // Mirror the extension's session_start config merge so the pressure
      // thresholds see the same user acp.json overrides as the main pipeline.
      if (!configured.has(key)) {
        try {
          runtime.setAdapter(applyUserConfig(runtime.adapter, await loadUserConfig(ctx.cwd)));
        } catch (e) {
          logThrow("pressure", e, { key, phase: "user-config" });
        }
        configured.add(key);
      }
      const state = states.get(key) ?? createInitialState();
      const entries = readContextEntries(ctx.sessionManager);
      const coreMessages = entriesToCoreMessages(entries);
      const config = runtime.configFor(ctx);
      const coveredIds = collectCoveredMessageIds(state);
      const realUsage = ctx.getContextUsage?.();
      const estimated = estimateTokens(coreMessages, coveredIds);
      const tokenCount = realUsage?.tokens && realUsage.tokens > 0 ? realUsage.tokens : estimated;
      const turn = runtime.core.processTurn({
        messages: coreMessages,
        state,
        config,
        tokenCount,
        // Decision-only: the caller discards the message output, so skip
        // rendering ref tags into text.
        renderTags: "none",
      });
      states.set(key, turn.state);
      const nudge = turn.nudge;
      const decision: AcpPressureDecision = {
        shouldRelieve: nudge?.shouldInject ?? false,
        emergency: nudge?.breakdown?.emergencyOverride === 1,
        tier: nudge?.tier ?? null,
        usage: nudge?.contextUsage ?? (config.modelContextLimit > 0 ? tokenCount / config.modelContextLimit : 0),
        tokenCount,
        contextLimit: config.modelContextLimit,
        reason: nudge?.reason ?? "no nudge decision",
      };
      if (decision.shouldRelieve) {
        logInfo("pressure", {
          key,
          event: "relief-requested",
          emergency: decision.emergency,
          tier: decision.tier,
          usage: Math.round(decision.usage * 1000) / 1000,
          tokenCount: decision.tokenCount,
          limit: decision.contextLimit,
          reason: decision.reason,
        });
      }
      return decision;
    },
    reset(ctx) {
      const key = keyFor(ctx);
      states.set(key, createInitialState());
      configured.delete(key);
    },
  };
}
