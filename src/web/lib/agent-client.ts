// Client-side helper for POST /api/agent/[id].
//
// Every /api/agent/[id] route returns one of:
//   { success: true, data: <result> }
//   { error: string }              (non-2xx)
//
// Call sites previously repeated the same 5-line fetch block 13× in
// hooks/useAgentSession.ts. This helper collapses that down to one line.

export class AgentCommandError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly accepted?: boolean,
  ) {
    super(message);
    this.name = "AgentCommandError";
  }
}

export function isPromptRejectedError(error: unknown): error is AgentCommandError {
  return error instanceof AgentCommandError
    && error.code === "prompt_rejected"
    && error.accepted === false;
}

const GATEWAY_AGENT_MUTATIONS = new Set([
  "prompt", "steer", "follow_up", "compact", "abort", "abort_compaction",
  "bash", "abort_bash", "navigate_tree", "fork", "reload", "clear_queue",
  "set_model", "set_thinking_level", "set_session_name", "set_tools",
  "set_auto_compaction", "set_auto_retry", "set_perm_mode", "extension_ui_response", "extension_ui_input",
]);
const READ_ONLY_AGENT_COMMANDS = new Set(["get_state", "get_session_stats", "get_last_assistant_text", "get_tools", "get_commands"]);

export function isGatewayAgentMutation(command: Record<string, unknown>): boolean {
  return typeof command.type === "string" && GATEWAY_AGENT_MUTATIONS.has(command.type);
}

export function isReadOnlyAgentCommand(command: Record<string, unknown>): boolean {
  return typeof command.type === "string" && READ_ONLY_AGENT_COMMANDS.has(command.type);
}

export async function sendAgentCommand<T = unknown>(
  sessionId: string,
  command: Record<string, unknown>,
): Promise<T> {
  if (isGatewayAgentMutation(command)) {
    const { getGatewayClient } = await import("../gateway-client");
    await getGatewayClient().ensureMutationSession();
  }
  const res = await fetch(`/api/agent/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
    code?: string;
    accepted?: boolean;
  };
  if (!res.ok || body.error) {
    throw new AgentCommandError(
      body.error ?? `HTTP ${res.status}`,
      res.status,
      body.code,
      body.accepted,
    );
  }
  return body.data as T;
}
