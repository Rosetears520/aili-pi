# Proposal: add-herdr-execution-backend

## Why

All persistent agents today execute in-process through the Pi SDK `AgentSession` created by `src/runtime/persistent-agents/session-factory.ts`. Their lifetime is bound to the parent Pi process: running turns become `interrupted` on parent exit, queued jobs become `unexecuted`, nothing is externally visible, and there is no way for a human to observe or take over a running child. The control plane (Agent/Job/Turn, scheduler, batch precheck, model authorization, permissions, delivery) is hard-coupled to this single execution mode with no backend seam. We want a second execution backend that runs each child as an external, persistent, human-enterable Pi CLI process inside a Herdr terminal surface — without retiring, regressing, or silently substituting the current implementation.

## What Changes

- Introduce an `ExecutionBackend` abstraction and registry behind the existing `sub` coordinator. The current in-process execution becomes the `managed` backend (`pi-sdk` driver), wrapped with zero behavior change; a new `herdr` backend (`pi-cli` driver) executes children as external processes in Herdr workspace/tab/pane surfaces controlled through Herdr's socket API.
- Add a `Run` record entity (one process incarnation) distinct from Agent/Job/Turn, with an authoritative lifecycle (`allocated → starting → live → stopping → stopped`, plus `lost`/`failed`) kept separate from the activity overlay (`working`, `stalled`, `waiting_question`, …).
- Make backend selection user-only: resolved from user settings (session override > project > global > default `managed`), exposed via a `/aili-agent-backend` command; the model-facing `sub` schema gains no backend field; existing agents keep their creation-time backend; Herdr failures never silently fall back to `managed`.
- Add a Herdr surface layer: per-parent-session workspace, one tab + root pane per agent, machine-generated Herdr agent names (`ap-<run-id-short>`), pane metadata carrying AILI identity, gap-free socket resubscribe (subscribe → buffer → snapshot → replay), and parent-restart reconcile with three explicit outcomes (reattach / degraded / lost).
- Add an AILI Child Bootstrap extension plus bridge running inside the child Pi CLI: a per-run 0600 Unix socket server with `events.jsonl` dual-write (monotonic seq, ack, idempotent replay), authoritative turn-completion evidence (`turn.completed` + assistant result + driverSessionId + usage/cost + output hash — never Herdr `idle`), and a per-run sandbox/security bootstrap initialized from an immutable loadout (fail closed).
- Add an InteractionBroker that unifies question / permission / model-override / workspace-conflict interactions; the existing `questionnaire` module becomes a renderer of the broker instead of owning an independent state machine; child questions are brokered to the parent agent or the user (new capability — today children cannot ask at all).
- Add an ActivityBus and white-box observability: unified activity events across both backends (managed adapted from existing hooks; herdr precise events from the child bridge, Herdr lifecycle as auxiliary only), `stalled`/`recovered` overlay semantics that never settle jobs or release permits, and consistent backend/driver/runId/surface/activity/controlMode display fields in TUI and Web.
- Keep the existing 32-active-turn FIFO scheduler untouched and add a separate Herdr surface permit (`maxLiveSurfaces`, default 8). Batch submissions resolve to a single backend and keep the existing all-or-none preflight.
- Bootstrap and doctor: detect the Herdr binary, the Herdr–Pi integration, and the Pi-side Herdr skill; when absent, install via the official commands (`curl -fsSL https://herdr.dev/install.sh | sh`, `herdr integration install pi`, `npx skills add herdrdev/herdr --skill herdr -g -a pi`), surfacing failures explicitly.
- No breaking changes: `managed` stays the default and its semantics are unchanged; `herdr` is opt-in. No existing public `sub`/command surface is removed.

## Capabilities

### New Capabilities

- `subagent-execution-backends`: ExecutionBackend abstraction and registry, managed-backend equivalence, user-only backend selection with per-agent freeze, no-silent-fallback, `Run` record lifecycle vs activity overlay, permit separation (active-turn vs Herdr surface), batch backend consistency, legacy storage interpretation.
- `herdr-execution-surface`: long-lived Herdr socket client with version guard and gap-free reconnect, workspace/tab/pane topology, machine-generated live names and pane metadata identity, two-step startup gating, availability detection + official guided installation, parent-restart reconcile, stall detection.
- `herdr-child-bridge`: child-side Unix socket bridge server with run-token handshake, durable dual-written event log with replay, authoritative completion evidence, per-run sandbox/security bootstrap, staged capability gating (read-only first), auto-exit barrier, child launch discipline.
- `agent-interaction-broker`: single interaction authority with typed records, child→parent→user routing, scoped job suspension, fail-closed semantics, Herdr `blocked` as auxiliary signal only.
- `agent-activity-observability`: unified activity event model and sources, stalled/recovered overlay semantics, consistent TUI/Web display fields, user-level management command family (backend switching, focus, activity, interactions, answer, inspect) without reviving `hub`.

### Modified Capabilities

None. The repository has no canonical baseline specs under `openspec/specs/`; no existing capability's requirements are modified by this change.

## Impact

- **Package/runtime**: `src/runtime/persistent-agents/` gains `backends/` (types, registry, managed adapter, herdr adapter) and `herdr-child/` (bootstrap/bridge); `production.ts` stops creating sessions directly and calls the backend interface; `sub`/result renderers gain `backend`/`runId` metadata; `storage.ts` schema gains run records and backend fields with legacy journals defaulting to `managed`.
- **Bootstrap**: `install.sh` / `scripts/bootstrap.sh` gain Herdr detection and the three official installation commands; `aili-doctor` verifies binary, integration, skill, socket reachability, and protocol version.
- **Configuration**: new `aili.subagents.*` settings surface (default `managed`, `herdr.enabled: false`) adapted to the repository's existing settings loader; `/aili-agent-backend` command; new user-level agent management commands.
- **Web/TUI**: agent display fields extended for both backends; coordinates with `integrate-pi-web-ui-and-upstream-extensions` (in BUILD) at the presentation layer only, without modifying that change's specs.
- **Dependencies**: no new npm runtime dependencies planned. Herdr remains an external Apache-2.0 runtime integrated via its socket API (never vendored). `amosblomqvist/pi-interactive-subagents`, `pi-observational-memory`, and `pi-config` are design references only; any future code absorption is clean-room by default and requires `THIRD_PARTY_NOTICES.md` updates.
- **Testing**: unit tests for backend resolution/freeze/no-fallback and loadout intersection; a fake Herdr socket server for integration tests; child-bridge protocol tests; concurrency/batch matrix; operation-gated live verification against a real Herdr + Pi environment.
- **Non-goals**: no `hub` revival; no model-facing backend parameter; no vendoring or forking of Herdr; no Native Browser, Prompt Middleware, or Observational Memory in this change (separate future changes); no opening of recursive async spawn; no macOS/Windows support; no change to managed-backend semantics.
