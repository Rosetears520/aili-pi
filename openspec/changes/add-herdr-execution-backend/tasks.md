# Tasks: add-herdr-execution-backend

## 1. Phase 0 — Audit, verification, ADRs (read-only, zero behavior change)

- [x] 1.1 Produce the current-state call-graph and responsibility map for `sub → coordinator → scheduler → production → session-factory → delivery`, including the storage schema inventory (Agent/Job/Turn/journal/sidecar) and the permission/sandbox process assumptions
  - Acceptance: artifact under this change records file→responsibility mapping, injection seams, and every place that assumes in-process execution
  - Verify: artifact reviewed against source; no source file modified
- [x] 1.2 Verify the Herdr machine protocol on the installed version: socket path discovery, handshake, `session.snapshot`, `events.subscribe`, workspace/tab/pane operations, `agent.start/prompt/wait/read/focus`, pane metadata, close; record exact method names and schemas
  - Acceptance: protocol facts recorded with the verified Herdr version; discrepancies against design decision 6 documented in `drift-log.md` and re-litigated with the user if the socket API is absent or materially different
  - Verify: recorded responses come from a live Herdr daemon, not from documentation guesses
- [x] 1.3 Verify the official installer chain in a disposable environment: `curl -fsSL https://herdr.dev/install.sh | sh`, `herdr integration install pi`, `npx skills add herdrdev/herdr --skill herdr -g -a pi`; record what each installs, idempotency, and failure modes
  - Acceptance: installation facts (paths touched, skill location, integration effects, re-run behavior) recorded
  - Verify: re-running detection after install reports all three components present without re-installing
- [x] 1.4 Verify how the installed `pi` CLI launches headless with explicit extensions (disable default discovery, load a single extension, fixed model/thinking, explicit session/cwd) and record the supported flags
  - Acceptance: launch recipe documented; unsupported capabilities listed with fallback design needs
  - Verify: a manual child Pi process starts with only the specified extension loaded
- [x] 1.5 Write the five ADRs (dual backends; Run entity; Herdr-as-surface; driver capability matrix; backend not model-selectable) and the third-party license disposition note (Herdr Apache-2.0 external; Amos repos reference-only; `pi-config` clean-room)
  - Acceptance: ADRs live under this change; `THIRD_PARTY_NOTICES.md` impact assessed with no copying from `pi-config`
  - Verify: `npm run test:audit-redaction` and existing suite still pass unchanged

## 2. Phase 1 — Managed backend abstraction (zero user-visible change)

- [x] 2.1 Define `ExecutionBackend` types, the backend registry, `RunRecord` with lifecycle/state-machine transitions, and `BackendCapabilities`/`DriverCapabilities` declarations
  - Acceptance: types compile; lifecycle transitions enforce `allocated → starting → live → stopping → stopped` plus `lost`/`failed`
  - Verify: unit tests cover registry resolution defaults and illegal lifecycle transitions
- [x] 2.2 Wrap the existing `session-factory.ts` + `ProductionAgentController` execution path as `ManagedExecutionBackend` behind the new interface, with `production.ts` delegating instead of creating sessions directly
  - Acceptance: coordination layer has no direct session-creation path; managed sequencing (preflight → allocation → scheduler → execute → delivery) unchanged
  - Verify: `npm test` passes with no assertion edits; `npm run typecheck` clean
- [x] 2.3 Extend storage: run records in the coordinator journal/snapshot, backend fields on agents, and read-time defaulting of legacy journals to `managed` (no on-disk migration)
  - Acceptance: legacy journal replay yields `managed` agents; new events carry backend/run data
  - Verify: unit tests replay a pre-change journal fixture and assert managed interpretation
- [x] 2.4 Implement backend settings resolution (`aili.subagents.*`: session > project > global > default `managed`) and the `/aili-agent-backend status|managed|herdr` command with the new-vs-existing notice; reject `backend` in `sub` payloads
  - Acceptance: resolution precedence tested; switch freezes existing agents' backend; the notice renders
  - Verify: unit tests for precedence, freeze-on-switch, and schema rejection of a `backend` field
- [x] 2.5 Add backend/driver/runId metadata to `sub` results, renderer output, and agent listings without changing existing fields
  - Acceptance: listings and results expose backend kind, driver kind, run id
  - Verify: renderer unit tests updated for the additive fields; no existing assertion broken

## 3. Phase 2 — Herdr read-only vertical slice

- [x] 3.1 Implement the Herdr socket client: handshake with protocol version guard, `session.snapshot` + `events.subscribe` with buffer→snapshot→replay ordering, reconnect, and a `doctor` command reporting daemon/socket/version status
  - Acceptance: client fails closed on version mismatch and never parses human CLI output as control input
  - Verify: fake-server tests cover handshake, snapshot+buffered-event ordering, reconnect, and version mismatch
- [x] 3.2 Implement availability detection and the guided installer: detect binary/integration/skill, run the three official commands in order when missing, idempotent skip when present, explicit per-step failure reporting
  - Acceptance: detection is idempotent; failures name the failed step; no backend fallback on install failure
  - Verify: unit tests with stubbed commands cover fresh-install ordering, skip-when-present, and failure propagation
- [x] 3.3 Implement surface management: per-parent-session workspace, tab-per-agent with root pane, authoritative IDs from Herdr responses, `ap-<run-id-short>` live names, AILI identity pane metadata (no credentials/prompts), focus support, and startup timeout cleanup
  - Acceptance: surfaces created only after all public preflight passes; naming satisfies Herdr constraints and never uses user alias
  - Verify: fake-server tests cover create/naming/metadata/focus/close and preflight-failure-leaves-zero-surfaces
- [x] 3.4 Implement the child bootstrap launch (per 1.4 recipe): Pi CLI with only the AILI child bootstrap loaded, resolved model/thinking, cwd/workspace, new-or-resumed session, sidecar paths and run token via environment
  - Acceptance: child process starts with no ambient extensions and the expected session
  - Verify: operation-gated run against real Herdr + Pi confirmed by bridge handshake success
- [x] 3.5 Implement the child bridge: 0600 Unix socket server, token handshake validating runId/agentId/loadoutHash, event emission with monotonic seq/ack/idempotency, dual-write to `events.jsonl` with size cap/rotation, and resume-from-last-acked on parent reconnect
  - Acceptance: bridge events are the precise activity source; replay after reconnect is exact
  - Verify: bridge tests cover handshake rejection, seq/ack, duplicate suppression, log replay, and rotation
- [x] 3.6 Wire read-only herdr agents end-to-end: `sub` async spawn on herdr for read-only roles, settle turns only on `turn.completed` evidence, `wait/send/output/history/cancel` equivalence via the unified path, run becomes `live` only after Herdr-ready + bridge-handshake
  - Acceptance: a read-only agent completes a real task with formal result evidence identical in shape to managed
  - Verify: live-gated scenario passes; degraded-bridge case refuses to settle the job
- [x] 3.7 Implement parent-restart reconcile for herdr runs: metadata matching, bridge reconnect, event-log catch-up, and the three explicit outcomes (reattach / degraded / lost with `interrupted`+`unexecuted`, no auto-replay)
  - Acceptance: reconcile never uses terminal text; lost runs never auto-replay
  - Verify: integration tests with fake Herdr cover all three branches; managed restart behavior unchanged

## 4. Phase 3 — Herdr full security & scheduling equivalence

- [x] 4.1 Implement per-run security bootstrap in the child: one-time sandbox/permission initialization from the immutable loadout, no reconfigure/downgrade surface, fail-closed on profile/provider mismatch, credential redaction on both sides
  - Acceptance: write/bash attempts outside the loadout fail closed; post-start widening is rejected
  - Verify: bridge tests cover mismatch fail-closed, widening rejection, and redaction; audit-redaction suite passes
- [x] 4.2 Route child permission asks and questions through the InteractionBroker; convert `questionnaire` into a broker renderer; implement parent-answer-first routing, scoped suspension, auto-exit barrier, fail-closed expiry, and `unexpected-blocked` flagging
  - Acceptance: no parallel interaction state machines remain; pending interactions suspend only their job
  - Verify: unit tests for routing/suspension/expiry; herdr blocked-without-record flags `unexpected-blocked`
- [x] 4.3 Implement loadout snapshots at creation and strict-intersection resume with diff display and missing-loadout refusal
  - Acceptance: resume never widens; tightening renders a diff; missing loadout refuses
  - Verify: unit tests cover ceiling∩current intersection, diff content, and refusal paths
- [x] 4.4 Implement the Herdr surface permit (`maxLiveSurfaces`, default 8, queue-behind behavior) keeping the active-turn scheduler untouched; stalled runs never release permits
  - Acceptance: surface saturation queues runs without preflight failure; release only on confirmed stop or explicit release
  - Verify: concurrency tests cover saturation, queueing, release-on-stop, stall-no-release
- [x] 4.5 Extend herdr batch support: single resolved backend per batch, per-item capability preflight against driver capabilities, independent runtime failure recording, unified wait aggregation
  - Acceptance: mixed-support batch fails with zero allocation; one runtime failure doesn't cancel siblings
  - Verify: batch matrix tests pass on both backends
- [x] 4.6 Enable write/bash roles on herdr after security-equivalence acceptance; add failed-startup surface cleanup and stalled/recovered lifecycle wiring
  - Acceptance: formal roles pass the same permission/result contract on managed and herdr
  - Verify: security-equivalence checklist executed and recorded; live-gated write scenario passes

## 5. Phase 4 — ActivityBus & white-box observability

- [x] 5.1 Implement the ActivityBus event model and adapters: managed from existing session/tool/provider hooks; herdr precise from the child bridge and auxiliary from Herdr lifecycle; every event carries seq + ids + backend/driver
  - Acceptance: both backends emit the same vocabulary; auxiliary events are labeled
  - Verify: adapter tests assert event parity and labeling
- [x] 5.2 Implement stall/recovered overlay computation (`stalledAfterMs`) with guaranteed no mutation of lifecycle states or permits
  - Acceptance: overlay-only semantics enforced at the bus level
  - Verify: unit tests assert job/turn/run states unchanged across stall→recovered
- [x] 5.3 Extend TUI and Web agent views with the unified field set (backend/driver/model/ids/workspace/activity/interactions/controlMode; surface+focus where applicable), coordinating with the Web change without modifying its specs
  - Acceptance: field parity across backends; managed shows no surface fields
  - Verify: renderer tests plus a manual Web check recorded as evidence
- [x] 5.4 Implement the user-level management command family (backend status/switch already from 2.4; add focus/activity/interactions/answer and `/agent-inspect`-style inspection with prompt/loadout/run views and manual-input marks), finalizing names without collisions
  - Acceptance: commands are user-only; `sub` remains the only model-facing tool; focus on managed reports no surface
  - Verify: command tests cover each action including managed-unsupported focus and inspection diffs

## 6. Test infrastructure (cross-phase)

- [x] 6.1 Build the fake Herdr socket server test harness covering handshake, snapshot+buffered events, start/prompt/wait/read/focus/close, reconnect, version mismatch, pane move, agent disappearance, blocked/idle/done/unknown, and server disconnect
  - Acceptance: harness drives Phases 2–4 herdr tests without a real daemon
  - Verify: harness tests self-verify scripted protocol scenarios
- [x] 6.2 Maintain the full regression matrix: `npm run typecheck`, `npm test`, integration suites, `validate:capabilities`, `validate:generated`, `validate:package`, `test:audit-redaction`, `test:doctor` pass at every phase boundary
  - Acceptance: each phase-boundary run recorded in `progress.txt`
  - Verify: zero managed-semantic regressions across all phases

## 7. Docs, manifests, and licensing

- [x] 7.1 Update `docs/persistent-agents.md` with backend selection, herdr usage, restart/reconcile semantics, and the management command family
  - Acceptance: user doc covers both backends and the no-fallback rule
  - Verify: doc examples match implemented commands
- [x] 7.2 Update `THIRD_PARTY_NOTICES.md`/license disposition for Herdr integration (external Apache-2.0 runtime) and record the clean-room posture for `pi-config`-referenced behaviors
  - Acceptance: notices reflect actual integration boundaries; no vendored herdr or copied pi-config code
  - Verify: license disposition review recorded
