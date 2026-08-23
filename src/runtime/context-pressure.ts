import { Type } from "typebox";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  SessionMessageEntry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type {
  AcpPressureDecision,
  AcpPressureEvaluator,
} from "../../upstream/billion-context-pi/dist/index.js";

export const CODEX_COMPACT_TOOL_NAME = "compact_context";
const COMPACTION_CONTINUATION_TYPE = "aili-compaction-continuation";
const CompactContextParams = Type.Object({});

type AgentMessage = SessionMessageEntry["message"];

interface PendingCompaction {
  compacting: boolean;
}

export interface ContextPressureWiring {
  ownsCodexContext(ctx: ExtensionContext): boolean;
  evaluator: AcpPressureEvaluator;
  log?: (message: string) => void;
}

function sessionKey(ctx: ExtensionContext): string {
  return ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();
}

function pressureNotice(decision: AcpPressureDecision): AgentMessage {
  const usage = Math.round(decision.usage * 100);
  const urgency = decision.emergency ? "Context pressure is critical." : "Context pressure is elevated.";
  return {
    role: "user",
    content: [{
      type: "text",
      text: [
        `${urgency} ACP recommends context relief (${usage}% used).`,
        "Do not compact while the current step still depends on raw history.",
        `At the next safe boundary, call ${CODEX_COMPACT_TOOL_NAME}(). The runtime will use Codex Remote Compaction and then resume the original task automatically.`,
      ].join(" "),
    }],
    timestamp: Date.now(),
  } as AgentMessage;
}

function continuationMessage(content: string) {
  return {
    customType: COMPACTION_CONTINUATION_TYPE,
    content,
    display: false,
    details: { source: CODEX_COMPACT_TOOL_NAME },
  };
}

export function wireContextPressure(pi: ExtensionAPI, wiring: ContextPressureWiring): void {
  const pending = new Map<string, PendingCompaction>();

  const resetEvaluator = (ctx: ExtensionContext) => {
    try {
      wiring.evaluator.reset(ctx);
    } catch (error) {
      wiring.log?.(`context pressure reset failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const invalidateSession = (ctx: ExtensionContext) => {
    pending.delete(sessionKey(ctx));
    resetEvaluator(ctx);
  };

  // For Codex, consume only ACP's pressure verdict. The notice is appended to
  // this provider call and is never persisted in the session transcript.
  pi.on("context", async (event, ctx) => {
    if (!ctx.model || !wiring.ownsCodexContext(ctx)) return undefined;
    let decision: AcpPressureDecision;
    try {
      decision = await wiring.evaluator.observe(ctx);
    } catch (error) {
      wiring.log?.(`context pressure observe failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
    if (!decision.shouldRelieve) return undefined;
    return { messages: [...event.messages, pressureNotice(decision)] };
  });

  // ACP owns the normal WHEN on both routes. Codex manual requests and Pi's
  // overflow recovery still pass to pi-codex-compact; native threshold timing
  // must not race the model-facing ACP nudge.
  pi.on("session_before_compact", (event, ctx) => {
    if (event.reason !== "threshold" || !ctx.model || !wiring.ownsCodexContext(ctx)) return undefined;
    return { cancel: true };
  });

  // The ACP range-compression tool is registered globally by the upstream
  // extension, but its blocks are not projected on Codex routes. Fail closed
  // instead of letting the model create compression state that Codex ignores.
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "compress" || !ctx.model || !wiring.ownsCodexContext(ctx)) return undefined;
    return { block: true, reason: "Codex uses compact_context at a safe boundary; compress(...) is only for ACP-owned provider routes" };
  });

  const compactTool: ToolDefinition<typeof CompactContextParams> = {
    name: CODEX_COMPACT_TOOL_NAME,
    label: "Compact Context",
    description: "Request Codex Remote Compaction at a model-chosen safe boundary. Codex only; other providers use compress(...). The request is deferred until the current agent run settles, then the original task resumes automatically.",
    promptSnippet: `${CODEX_COMPACT_TOOL_NAME}() for Codex after reaching a safe boundary`,
    promptGuidelines: [
      "Call compact_context only after current work no longer depends on older raw context.",
      "Do not call compact_context for non-Codex providers; use compress(...) there.",
    ],
    parameters: CompactContextParams,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
      if (!ctx.model || !wiring.ownsCodexContext(ctx)) {
        throw new Error("compact_context is available only for the Codex Remote V2 route; use compress(...) on this provider");
      }
      const key = sessionKey(ctx);
      if (pending.has(key)) {
        return { details: undefined, content: [{ type: "text", text: "Codex context compaction is already queued for this session." }] };
      }
      pending.set(key, { compacting: false });
      return {
        details: undefined,
        content: [{ type: "text", text: "Codex context compaction queued. Finish this safe boundary normally; compaction will start after the agent settles and the original task will then resume." }],
      };
    },
  };
  pi.registerTool(compactTool);

  // Manual ctx.compact() aborts an active agent operation. Defer it until Pi
  // reports that no retry, compaction, or follow-up remains.
  pi.on("agent_settled", (_event, ctx) => {
    const key = sessionKey(ctx);
    const request = pending.get(key);
    if (!request || request.compacting) return;
    if (!ctx.model || !wiring.ownsCodexContext(ctx)) {
      pending.delete(key);
      return;
    }

    request.compacting = true;
    try {
      ctx.compact({
        onComplete: () => {
          if (pending.get(key) !== request) return;
          pending.delete(key);
          pi.sendMessage(
            continuationMessage("Codex context compaction completed. Continue the original task from the compacted context without waiting for another user prompt."),
            { deliverAs: "followUp", triggerTurn: true },
          );
        },
        onError: (error) => {
          if (pending.get(key) !== request) return;
          pending.delete(key);
          wiring.log?.(`Codex context compaction failed: ${error.message}`);
          pi.sendMessage(
            continuationMessage("Codex context compaction failed. Continue the original task without claiming that compaction succeeded."),
            { deliverAs: "followUp", triggerTurn: true },
          );
        },
      });
    } catch (error) {
      if (pending.get(key) !== request) return;
      pending.delete(key);
      wiring.log?.(`Codex context compaction trigger failed: ${error instanceof Error ? error.message : String(error)}`);
      pi.sendMessage(
        continuationMessage("Codex context compaction could not be started. Continue the original task without claiming that compaction succeeded."),
        { deliverAs: "followUp", triggerTurn: true },
      );
    }
  });

  // Successful compaction resets ACP's pressure epoch. A compaction started by
  // this controller keeps its request until onComplete so it can resume once;
  // an independent manual/overflow compaction satisfies a merely queued request.
  pi.on("session_compact", (_event, ctx) => {
    const key = sessionKey(ctx);
    if (!pending.get(key)?.compacting) pending.delete(key);
    resetEvaluator(ctx);
  });
  pi.on("session_before_switch", (_event, ctx) => invalidateSession(ctx));
  pi.on("session_shutdown", (_event, ctx) => invalidateSession(ctx));
}
