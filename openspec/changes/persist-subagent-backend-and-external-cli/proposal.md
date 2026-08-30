## Why

`/aili-agent-backend h|m` currently changes only the active Parent session even though the runtime already resolves a global backend settings file. External CLI turns also run indirectly through a Pi child and model-selected Bash, so AILI cannot use the vendor CLI process exit as authoritative completion evidence.

This change makes the user’s backend choice durable and gives authorized external CLI work the same observable subagent lifecycle as normal Pi subagents.

## What Changes

- Add a user-only global backend command that persists `managed` or `herdr` as the default for newly created Agents, immediately applies to later new Agents in the current session, and can be cleared.
- Preserve the existing precedence order: session override, trusted project setting, global setting, then `managed`; do not migrate existing Agents.
- Add an external-CLI Herdr driver for `claude-code`, `gemini-cli`, `codex-cli`, `opencode`, `grok-cli`, and `agy-cli`. It uses the normal Pi-subagent tab/pane allocator, but each running external CLI Agent owns its active pane.
- Replace the external-CLI path’s model-generated Bash invocation with a direct Herdr-recognized CUI Agent whose executable, native arguments, and pane identity are controlled by AILI.
- Require the prompted Agent to transition into work and return to its input-ready `idle`/`done` state before foreground completion; explicit background calls retain normal `sub` accepted-then-settled behavior.
- Prefer a vendor YOLO/non-interactive option only when the installed CLI’s verified help declares one; otherwise report unavailability or run under the defined controlled policy without claiming YOLO.

## Capabilities

### New Capabilities
- `persistent-subagent-backend-preference`: User-owned global default selection for the managed or Herdr execution backend.
- `herdr-external-cli-agent`: Direct external CLI Agent runs with controlled launch, shared subagent lifecycle, verifiable settlement, and normal Herdr pane allocation.

### Modified Capabilities
- None.

## Impact

- `src/runtime/persistent-agents/backends/settings.ts`, `production.ts`, `runtime.ts`, coordinator/types, external CLI registry, Herdr adapter, and potentially a runner/bridge module.
- Persistent user configuration at `~/.pi/agent/aili/agent-backend.json` when the new command is executed.
- Persistent-Agent command documentation and focused unit/integration fixtures.
- No npm dependency, source import, automatic vendor installation, vendor login, or release change is planned.
