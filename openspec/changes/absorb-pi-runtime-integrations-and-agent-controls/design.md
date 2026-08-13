# Design: Absorb Pi Runtime Integrations and Agent Controls

## Composition

This change extends existing owners:

- `extensions/index.ts` remains the sole Pi extension entry.
- `PersistentAgentProduction` remains the child-session owner; `TaskCoordinator` remains the allocation/scheduler owner.
- `createAiliMcpExtension` remains the sole MCP adapter factory.
- `NativeFooterLifecycle` and `renderNativeFooter` remain the footer lifecycle/layout owner.
- Existing `RuntimeSnapshotV1`/`RuntimeEventV1` remain future Inspector/Web projections.

No new scheduler, Persistent Agent runtime, MCP manager, or Web-only context backend is introduced.

## Model, thinking and speed resolution

`task.model` is renamed semantically to a **model override request**. Schema compatibility may retain the field, but it must not be an authority signal. Pre-allocation resolution receives an explicit parent resolution snapshot:

1. direct user instance override;
2. trusted project role override;
3. user-global role override;
4. user-confirmed task one-shot override;
5. inherited direct Parent resolved state;
6. profile fallback;
7. runtime fallback.

A Main/child-generated task request for a different model prompts the direct parent UI with the parent resolved model and requested model. Only `confirm` produces a turn-local override. `deny`, `dismiss`, unavailable UI, expiry, unsupported candidate, or a request matching no usable model retains the normal non-request resolution; it does not fall through to profile merely because a model argument existed. Direct-user instance/project/global policy intentionally remains stronger than an Allow-once task request. Direct user commands retain their direct-user semantics.

The frozen parent-resolution snapshot is `{canonical, thinking, speedTier, source}` and is copied into `TaskAncestry`, task acceptance/audit/settlement metadata, and the revived turn input. Pre-existing audit records retain their existing layer strings as historical evidence; new records use the new source enum. A revived or hub turn has no inherited one-shot request: it resolves current user-owned policy, then the direct parent snapshot, profile, and runtime fallback. Child session construction receives the selected model and exact supported thinking level. Unsupported thinking fails before session construction.

Fast is an independent `standard | priority` state. It is not a model alias. A provider hook injects `service_tier: "priority"` only for supported `openai-codex` models; it records a bounded request evidence field. Unsupported models/providers retain their model and receive `inactive/unsupported`, never a silently changed request.

## Scheduler observation

The existing FIFO scheduler gains optional observer callbacks only. It emits content-free `{ jobId, scheduledAt, startedAt, firstActivityAt?, completedAt, outcome }` records. Task execution reports first activity once when the child session begins producing observable activity. This evidence is persisted with the agent/job/turn and supports a bounded local three-agent overlap probe. It neither changes capacity, queue order, nor nested sequential permits.

## Notifications and file context

`pi-notify` code is absorbed into an AILI-owned runtime/extension module after exact source locking. Notification dispatch wraps all terminal writes, PowerShell process start/error events, tmux wrapping, and optional sound command failures so no notification defect affects a Pi turn. WSL2 uses `WT_SESSION` plus `powershell.exe`; OSC behavior is retained for supported terminals.

`pi-file-context` is copied under an AILI-owned upstream boundary and adapted through a thin registration module. Its core selection structures and filesystem/Git helpers are kept separable from TUI menus/components. The current TUI remains the sole consumer in this change. Selection snapshots are immutable in-memory prompt attachments; no browser context store is added.

## MCP core configuration

`acceptedMcpServers()` becomes a declarative core-server inventory that preserves the adapter's existing lifecycle modes. The shared user MCP configuration is the only active config. Each core server is registered once and receives the adapter session cwd: MemPalace, Context7, Playwright and CodeGraph use that cwd as process context; Graphify runs its upstream multi-project server and tools must receive the current project path, which maps to `<project>/.graphify-out/graph.json`. No per-project MCP config is created. After executable preflight, all five core servers use `keep-alive` to be discoverable at session start and remain reconnectable; an unavailable executable is left as a per-server failed state and never aborts Pi. Registration is one adapter config, one server name, and one status snapshot source.

CodeGraph selects a PATH binary only at exact expected version `1.5.0`; any other PATH version, including the observed `1.4.1`, retains the exact `npx @colbymchenry/codegraph@1.5.0` command. Doctor reports strategy, binary path, actual version, expected version and status. Graphify uses the installed graph-specific stdio command. An absent graph remains a tool-level unindexed error, not a Pi startup failure. Context7 secrets are represented only by environment variable references/local config redaction.

The short routing guide is added to existing prompt guidance: CodeGraph for precise code/call/test impact; Graphify for macro cross-material structure; MemPalace for durable history; Context7 for current third-party docs; Playwright for browser runtime; direct file tools for current disk or stale/unindexed sources. It explicitly prohibits mandatory multi-tool chains and correctness claims based only on an index.

## Footer state

Footer rendering receives a normalized snapshot containing actual `ctx.model`, `ctx.thinkingLevel`, permission mode from the `perm` status that `pi-permission-modes` publishes, MCP adapter snapshot, and local clock. Codex quota is read from the existing `pi-quota-status` status text only when its compact grammar contains a percentage and a reset timestamp; it selects the first compact segment (the upstream primary/window precedence), parses date/time in the status's existing local semantics, and renders `codex <percentage> <MM/DD> <HH:mm>`. Missing, malformed, expired or unparseable status is omitted, never guessed. Live session/model/thinking events plus permission-status and MCP-status changes invalidate the current footer; narrow rendering preserves mode, MCP and clock over cwd/branch.

## Future projections only

Future Agent Inspector consumes existing task journal/runtime events through the current Runtime Event projection: list, lifecycle, activity, assistant output and tool activity in P0; cancellation/usage/elapsed in P1; steer/resume in P2. Future Context Core owns reusable file search, content search, selection, Git snapshots/provenance and token estimates behind both TUI and Web adapters. Neither implementation starts here.
