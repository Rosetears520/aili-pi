# Design: add-herdr-execution-backend

## Context

The persistent-agent control plane lives in `src/runtime/persistent-agents/` (17 files, ≈8,700 lines) and is fully in-process today:

| File | Responsibility |
|---|---|
| `production.ts` | Wiring, parent state, child build, one-turn `ProductionAgentController`, model catalog, runtime registration |
| `sub-coordinator.ts` | Single coordination boundary: submit/submitTrusted, all-or-none batch preflight, formal-result contract, error codes |
| `model-selection.ts` | Model/thinking authorization layers and `/aili-agent-model` backing |
| `storage.ts` | Event-sourced `CoordinatorJournal`, state-machine transitions, sidecar layout, restart reconcile (`interrupted`/`unexecuted`, no auto-replay) |
| `output-delivery.ts` | Async delivery, `agent://` / `history://` refs, formal result evidence with sha256 |
| `runtime.ts` | Per-parent facade, `sub` tool + slash command registration, board reconciliation |
| `workspace.ts` | Workspace leases, write-scope validation, git isolation, mutation guard |
| `sub-schema.ts` | `SUB_TOOL_SCHEMA`, formal batch schema, validation |
| `sub-renderer.ts` | TUI renderers |
| `policy.ts` | Tool intersection, spawn policy, child prompt assembly |
| `permission.ts` | Child permission resolution, `ParentApprovalBroker`, credential scanning |
| `scheduler.ts` | `FifoTurnScheduler`, 32 active-turn permits per parent |
| `types.ts` | Agent/Job/Turn records, coordinator state/events |
| `session-factory.ts` | In-process Pi SDK `AgentSession` creation and child approval bridge |
| `sub-registration.ts` | Sole `sub` tool identity reservation |
| `child-sandbox.ts` | Process-owned sandbox provider binding |
| `live-evidence-contract.ts` | Live evidence contract |

Constraints and facts that shape this design:

- **No backend seam exists.** The only injection points are `SubCoordinatorOptions.execute` and `PersistentAgentRuntimeOptions.execute/preallocate/preflight`. `production.ts` builds child sessions directly.
- **`hub` was restored by the user's 2026-08-27 harness decision.** It is a lightweight background coordination surface (`jobs/wait/output/history/send/cancel`) over current `sub` identities, not a second Agent runtime or backend selector.
- **`ask-user-question.ts` does not exist here.** The equivalent surface is the `questionnaire` module (`src/questionnaire/`). Children currently cannot ask the user anything; only tool-permission approvals cross the child→parent boundary via `ParentApprovalBroker`.
- **No `aili.*` settings keys exist.** The only AILI config files are the model-override JSONs read by `model-selection.ts`; child sessions use in-memory settings. A new settings surface is required for backend selection.
- **Herdr protocol facts are unverified on this machine.** The local Herdr skill documents a JSON-emitting CLI (`agent start/prompt/wait/read`, workspaces/tabs/panes, live-name rule `[a-z][a-z0-9_-]{0,31}`, settled lifecycle states that do not track individual turns). The plan document additionally assumes a raw socket API (`session.snapshot`, `events.subscribe`, pane metadata). Phase 0 must verify method names, schemas, socket path discovery, and distribution channels before the adapter protocol layer is written.
- **Batch form exists only in the trusted formal schema** (`FORMAL_TASK_REQUEST_SCHEMA`); the public `sub` tool is single-item. Both paths share the coordinator's all-or-none preflight.
- Web presentation is owned by `integrate-pi-web-ui-and-upstream-extensions` (in BUILD). This change adds display requirements only and must not modify that change's specs.

## Goals / Non-Goals

**Goals:**

- Decouple the coordination layer from a single execution mode with a backend abstraction the managed path wraps unchanged (zero behavioral regression first).
- Give Herdr-backed agents the same control-plane guarantees (scheduling, authorization, permission, workspace, delivery) with externally visible, persistent, human-enterable processes that survive parent restarts.
- Keep authority boundaries explicit: AILI owns state and decisions; Herdr owns PTY/process/visibility; the child bridge owns precise events.
- Make every failure mode explicit — no silent backend substitution, no completion inference from terminal text.

**Non-Goals:**

- No Native Browser, Prompt Middleware, or Observational Memory (future changes).
- No legacy HubService revival, no model-facing backend parameter, no recursive nested background opening, no Herdr vendoring or forking, no macOS/Windows. The restored lightweight `hub` is limited to current background `sub` coordination.
- No Herdr-side scheduling, permission, or delivery logic.
- No modification of the Web change's specs; presentation cooperation only.

## Decisions

### 1. Two-axis model: ExecutionBackend × AgentDriver
Backend (`managed` | `herdr`) and driver (`pi-sdk` | `pi-cli`) are separate concepts. First release formally supports `managed/pi-sdk` and `herdr/pi-cli`; other Herdr agent kinds remain interface-only. This prevents "Herdr can launch it" from being misread as "AILI supports it".
**Alternative considered:** single `backend` string encoding both (`herdr-codex`). Rejected: it would make the support matrix unenforceable at preflight.

### 2. Wrap, don't rewrite, the managed path (Phase 1)
`ManagedExecutionBackend` packages the existing `session-factory.ts` + `ProductionAgentController` flow behind the backend interface. `production.ts` stops creating sessions directly but its sequencing (preflight → allocation → scheduler → execute → delivery) is unchanged. All existing tests must pass without assertion edits.
**Alternative considered:** restructure `production.ts` first for a "cleaner" interface. Rejected: large-diff refactor without tests/migration violates the plan's own prohibition and risks regression.

### 3. Run as a first-class record, kept out of Agent state
`RunRecord` (backend, driver, backendRef, driverSessionId, loadoutHash, controlMode, lifecycle) models one process incarnation. Pane/process data lives in `backendRef`, never in `AgentRecord`, so pane moves and restarts don't corrupt identity. Activity states are an overlay computed from event recency, stored outside the authoritative state machine.
**Alternative considered:** extend `AgentRecord` with optional pane fields. Rejected: violates identity stability; `HerdrPaneId` changes on moves.

### 4. User-only backend selection with per-agent freeze
Resolution order: session override > project settings > global settings > `managed`. Existing agents freeze their creation backend; sends/resumes keep it. `sub` schema gains no backend field; profiles may only declare `supportedBackends`. `/aili-agent-backend status|managed|herdr` is the user command, with the explicit "new vs existing agents" notice.
**Alternative considered:** let the model choose per-call (as Amos-style UX might suggest). Rejected: backend changes security, recovery, and process semantics; that decision is the user's.

### 5. No silent fallback, ever
Herdr daemon unreachable, protocol mismatch, driver capability missing, bridge not ready, sandbox unavailable — all fail the submission explicitly. Doctor explains what to fix.
**Alternative considered:** fall back to managed for availability. Rejected: unobservable execution substitution is unauditable and breaks the surface contract the user opted into.

### 6. Long-lived socket client; CLI only for doctor
The Herdr adapter keeps one client connection (handshake, `session.snapshot`, `events.subscribe`, workspace/tab/pane ops, `agent.*`, pane metadata/close, reconnect). The CLI is used by doctor and humans only. Reconnect uses subscribe → buffer → snapshot → install → replay-buffer ordering to avoid the bootstrap gap. A protocol version guard fails closed on mismatch.
**Alternative considered:** shell out to `herdr` CLI per operation. Rejected: process-spawn latency, stdout parsing fragility, no event stream, and the plan document explicitly forbids it as the main path. *(Contingency: if Phase 0 finds no usable socket API, this decision must be re-litigated with the user before Phase 2 — see Open Questions.)*

### 7. Surface topology: per-parent-session workspace, tab-per-agent
One workspace per parent session; one tab + root pane per agent. Full-width terminals scale better than pane grids; Herdr's agent list still gives the aggregate view. `surfaceLayout` is a future extension point; only `tab-per-agent` ships.
**Alternative considered:** Amos-style pane grid in one window. Rejected: dozens of narrow panes are unusable, per the plan document.

### 8. Machine-generated Herdr live names; alias for humans
Live names are `ap-<run-id-short>` (satisfying `[a-z][a-z0-9_-]{0,31}`, unique among live agents). The user's `name` becomes AgentAlias + tab label + metadata only. Identity stays `agentId`; resume never depends on a live name (they die with the process).
**Alternative considered:** user name as live name (Amos-style steer/resume by name). Rejected: name collisions and lifecycle coupling of identity to a process.

### 9. Child bridge: child owns the socket server, dual-writes events
Per-run `<sidecar>/runs/<runId>/` holds `loadout.json`, `events.jsonl`, `bridge.sock` (0600), `result.json`, `cost.json`. The child is the server; the parent is the client — so parent restarts don't orphan the child's endpoint. Run token arrives via env var; handshake validates runId/agentId/loadoutHash/token. Events carry monotonic seq + idempotency keys with acks; the JSONL log is sized and rotated; reconnect resumes from last acked seq. Commands: status, submit_turn, steer, answer_interaction, abort_turn, shutdown. Bridge events: ready/session/turn/provider/tool/interaction lifecycle.
**Alternative considered:** parent as server. Rejected: the restart-survival requirement inverts the ownership.

### 10. Completion evidence is bridge-only
A herdr turn settles only on `turn.completed` + assistant result + driverSessionId + usage/cost + output hash. Herdr `idle/done` and terminal text are auxiliary observability. Bridge loss with a live pane → `degraded`, job unsettled.
**Alternative considered:** treat Herdr settled-state as completion. Rejected: Herdr officially does not track individual turns; multi-message and pre-working prompt cases make attribution unreliable.

### 11. Security bootstrap: per-run controlled sandbox (option A), staged rollout
The child initializes a `SandboxController` once from the immutable loadout; no reconfigure/reset/downgrade surface is exposed; permission asks route through the broker; credential guard and redaction run on both sides; profile/provider mismatch fails closed. Phase 2 ships read-only roles only; write/bash unlocks in Phase 3 after security-equivalence acceptance.
**Alternative considered:** (B) full tool RPC back to the parent — stronger isolation but a much larger rewrite; kept as a possible follow-up. Also considered shipping write immediately — rejected: unverifiable security parity on day one.

### 12. Loadout snapshot at creation; strict intersection on resume
Freeze model/thinking/speed, tools + provider hashes, skills, context mode, cwd/workspace/writeScope, permission/sandbox profile hashes, spawn allowlist, provenance. Resume = frozen ceiling ∩ current hard guards ∩ sandbox availability ∩ project trust. Never widens; tightening is shown as a diff; missing loadout refuses resume.
**Alternative considered:** replay the original grants verbatim (Amos). Rejected: old agents must not bypass rules added after their creation.

### 13. Permits stay split
The existing `FifoTurnScheduler` (32 active turns, FIFO, serial turns per agent) is untouched. A separate surface permit (`maxLiveSurfaces`, default 8) bounds live panes/processes; idle agents keep their surface; only confirmed stop or explicit release frees it. Stall never releases anything.
**Alternative considered:** one shared budget. Rejected: conflates scheduler throughput with terminal/process footprint; the two resources scale differently.

### 14. Batches resolve one backend, all-or-none preserved
Every item must support the resolved backend; any preflight failure means zero agents and zero surfaces. Post-admission runtime failures stay per-item. `async:false` aggregation goes through the unified wait, not a Herdr-specific blocking path.
**Alternative considered:** per-item backend choice or `startFailurePolicy` options now. Rejected: changes existing batch semantics in the same PR as a backend integration.

### 15. InteractionBroker as the single authority; questionnaire demoted to renderer
Typed `InteractionRecord`s (question/permission/model-override/workspace-conflict/confirmation) with a status lifecycle and resolution provenance. Child → parent-answerable → user rendering (TUI/Web questionnaire). Pending interactions suspend only their job and block auto-exit. Parent/UI loss fails closed (deny/expire, never approve). Herdr `blocked` is auxiliary; unexplained blocking flags `unexpected-blocked` + focus.
**Alternative considered:** keep `ParentApprovalBroker` and questionnaire separate and add a third path for child questions. Rejected: three interaction state machines drifting apart is the current pain the plan calls out.

### 16. ActivityBus: one event vocabulary, two source tiers
Events (run/turn/provider/tool/interaction/stall lifecycle) carry seq + four-level ids + backend/driver. Managed adapts existing hooks; herdr's precise tier is the child bridge, auxiliary tier is Herdr lifecycle/output. TUI/Web fields are identical across backends (surface fields where applicable). Stall = no structured event within `stalledAfterMs` while live; recovery is event-driven. Overlay never mutates lifecycle or permits.
**Alternative considered:** per-backend telemetry. Rejected: white-box parity is a stated acceptance criterion.

### 17. Management and coordination surfaces
`/aili-agent-backend status|managed|herdr` plus per-agent focus/activity/interactions/answer/inspect remain user-only. `sub` remains the only tool that creates or continues an Agent turn. The restored lightweight model-facing `hub` only coordinates existing background tasks through jobs/wait/output/history/send/cancel and cannot select a backend or widen authority.
**Alternative considered:** restore the legacy full HubService. Rejected: the lightweight facade over current SubCoordinator, Journal, bounded readers and delivery runtime preserves the desired polling workflow without reviving a second runtime.

### 18. Settings: new `aili.subagents.*` block, adapted naming
Target semantics: `backend` (default `managed`), `herdr` sub-block (enabled=false, driver=pi-cli, workspaceMode, surfaceLayout=tab-per-agent, focusOnSpawn=false, startupTimeoutMs=30000, stalledAfterMs=60000, maxLiveSurfaces=8, retainSurface/retainFailedSurface, resumePolicy=strict, allowManualControl). Exact key names and loader integration follow the repository's settings mechanism established in Phase 1; the schema is versioned so later keys can be added compatibly.
**Alternative considered:** environment-variable-only switches. Rejected: not user-discoverable, no project/global scoping.

### 19. Herdr availability: detect, then official three-command install
Setup/doctor detects (1) the Herdr binary, (2) the Herdr–Pi integration, (3) the Pi-side herdr skill. Missing components install via, in order: `curl -fsSL https://herdr.dev/install.sh | sh`, `herdr integration install pi`, `npx skills add herdrdev/herdr --skill herdr -g -a pi`. Detection is idempotent; failures name the failed step; installation failure never switches backends silently. The herdr skill installed by the `skills` CLI is a user-level external artifact — it does not enter this repository's pinned skill snapshot, so no `aili-workflows` governance conflict.
**Alternative considered:** vendor/pin a Herdr version or ship only documentation. Rejected: vendoring contradicts the external-runtime principle (user decision: always install latest via official channels); documentation-only was rejected as too bare for the intended default-on experience.

### 20. Third-party posture
Herdr stays an external Apache-2.0 runtime (socket integration, no source vendoring). `pi-interactive-subagents` and `pi-observational-memory` (MIT) are design references; code absorption, if ever, requires notices updates. `pi-config` (no license file) is behavior reference only — clean-room for everything; nothing is copied from it.
**Alternative considered:** copy Amos extension code for speed. Rejected for now: license hygiene and divergent control-plane assumptions.

## Risks / Trade-offs

- [Herdr raw socket API may differ from the plan document's assumptions or not exist as described] → Phase 0 verification task with a hard gate: adapter protocol work starts only after method names/schema are confirmed; decision 6 carries an explicit re-litigation clause; CLI bridging would need user sign-off.
- [`herdr integration install pi` and `npx skills add` behavior/idempotency unknown] → Phase 0 runs them in a disposable environment and records actual effects; doctor verifies presence, not install-command success.
- [Child Pi CLI launch flags (disable extension discovery, load only bootstrap) may need SDK/CLI support] → Phase 0 probes the installed `pi` CLI; if unsupported, a wrapper cwd/config strategy is designed before Phase 2.
- [Sandbox equivalence across processes is the hardest correctness claim] → staged gating (read-only first), fail-closed mismatches, and security-equivalence acceptance before write/bash unlock.
- [Large coordination surface (≈8.7k lines) refactored behind an interface] → Phase 1 is wrap-only with the existing suite as the regression net; no behavior edits ride along.
- [Event-log and bridge complexity could grow unbounded] → size caps, rotation, seq-resume protocol, and fake-server test coverage from the start.
- [Two display surfaces (TUI/Web) drift] → ActivityBus is the single event source; renderers consume it; field parity is an acceptance criterion.
- [Stall heuristics mislabeling healthy long runs] → stall is overlay-only by spec; no automatic kill/settle/release anywhere.

## Migration Plan

Phase 0 → 4 as tasked in `tasks.md`; each phase is independently acceptable and rollback-safe:

1. **Phase 0** — audit artifacts + Herdr protocol/installer verification + ADRs. No behavior change.
2. **Phase 1** — backend abstraction + managed wrap + Run records + storage defaulting + metadata. Rollback = revert; no user-visible change beyond metadata.
3. **Phase 2** — Herdr read-only vertical slice (client, doctor, surfaces, bridge handshake, reattach, no fallback). Rollback = set `backend: managed`; herdr code dormant.
4. **Phase 3** — security bootstrap, write/bash equivalence, broker, batch/surface permits, strict resume.
5. **Phase 4** — ActivityBus + TUI/Web fields + command family + inspector.

Legacy journals never migrate on disk: absence of backend fields is interpreted as `managed` at read time.

## Open Questions

Deferrable without changing specs, approach, or task breakdown:

- Final command names and argument grammar for the management family (avoid `/aili-agent-model` collisions) — decide in Phase 4 tasks.
- `events.jsonl` rotation thresholds and exact cap numbers — Phase 2 implementation detail.
- Whether `sessionOverride` for backend needs a dedicated key or reuses the command's session default — Phase 1 settings work.
- Web detail-page layout for run/activity/inspection — coordinated with the Web change during Phase 4.
