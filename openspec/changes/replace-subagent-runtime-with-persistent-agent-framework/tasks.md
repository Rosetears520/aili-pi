## 1. DEFINE readiness and host seam gates

- [x] 1.1 Record the user's 2026-07-25 explicit acceptance of the final `test-plan.md` and repository-local BUILD authorization; dependency/lockfile, real provider, real HOME, external workspace, OMP code-copy, Git, publish, and release approvals remain separate.
- [x] 1.2 Select official Pi `0.81.1` as the exact current BUILD baseline, record that `support-pi-0-82-0` remains a dependent realignment target, and bind host-seam fixtures to the installed/declared version.
- [x] 1.3 Prototype persistent child `SessionManager.create/open()` with a parent-owned sidecar and prove exact-file reopen without a model/provider call.
- [x] 1.4 Prototype trusted parent resource/tool reconstruction with `DefaultResourceLoader`, top-level coordinator filtering, and explicit unavailable-tool boundaries.
- [x] 1.5 Prototype a child-only async `tool_call` approval bridge that waits for an external parent decision without unattended-yolo; full policy/no-UI hardening remains tasks 8.1–8.5.
- [x] 1.6 Prove fork does not copy the parent sidecar, confirm the Pi 0.81.1 built-in Ctrl+D/archive host gap, and document the supported AILI deletion/reconciliation boundary without monkey patching Pi.
- [x] 1.7 Prototype dependency-free clean/dirty Git worktree baseline projection, patch capture, main-workspace isolation, and cleanup in a disposable repository.
- [x] 1.8 Record HOST-1–HOST-6 evidence in `host-seam-evidence.md`; no material contract failure was found and all residual gates remain explicit.

## 2. Role profile v2 and general Agent

- [x] 2.1 Extend the role manifest/generator schema with runtime adapter version, `spawns`, `blocking`, optional model, and turn-audit metadata while preserving the 19 existing role ceilings and output contract.
- [x] 2.2 Migrate obsolete OpenCode/single-use/no-resume/`--no-session` adapter text in all 19 role profiles without changing Role, Goal, Success criteria, Constraints, Tools, Output, or Stop semantics.
- [x] 2.3 Add the AILI-owned `general` full-worker profile and canonical selector without adding `aili.general` or `task` aliases.
- [x] 2.4 Implement explicit trusted user/project shadow opt-in for bundled selectors; report inactive collisions and reject untrusted project overrides.
- [x] 2.5 Regenerate and validate source/profile hashes, provenance, installed profile fixtures, and stale-profile diagnostics for all 20 bundled selectors.

## 3. Parent-owned durable storage

- [x] 3.1 Implement the parent sidecar layout, path-safe Agent ID allocator, child SessionManager factory, and exact child-session path registry.
- [x] 3.2 Implement the append-only coordinator journal and serialized writer for Agent, turn, job, mailbox, delivery, model, and workspace events.
- [x] 3.3 Implement atomic snapshot compaction and journal replay; tolerate/report only a final partial line and fail closed on mid-log corruption or ownership conflicts.
- [x] 3.4 Implement parent resume rehydration for queued/running/idle/parked/aborted refs without starting model work.
- [x] 3.5 Implement crash and graceful-shutdown reconciliation: running to interrupted+parked, queued to unexecuted, no automatic replay.
- [x] 3.6 Implement idle TTL parking with default 420000ms, disabled-timer behavior, process teardown, and parked-session revival.

## 4. Child session factory and policy assembly

- [x] 4.1 Build the child prompt/context assembler from shared runtime envelope, selected full role prompt, explicit task/context, trusted rules/skills/context files, workspace, resources, and approved-plan reference without parent conversation copying.
- [x] 4.2 Compute effective tools as parent active ceiling intersected with role/capability/hard-guard/call narrowing; report unavailable child definitions rather than expanding or claiming success.
- [x] 4.3 Build the child-only resource loader, coordinator/message bridge, permission bridge, and credential guard while preventing duplicate top-level AILI registration.
- [x] 4.4 Revalidate and hot reload profile/model/tool policy at each turn boundary; rebuild an idle live session on valid profile drift and record actual per-turn hashes.
- [x] 4.5 Enforce explicit spawn allowlists, `general` non-self spawning, default depth 2, hard depth 4, no unlimited/self recursion, and synchronous nested execution.

## 5. task public tool and scheduler

- [x] 5.1 Define and register the flat/batch `task` schema with default `general`, requested name, per-item model/async/tools/workspace/writeScope/cwd fields, and strict pre-start validation.
- [x] 5.2 Implement unique stable Agent IDs, parent-prefixed nested IDs, Agent/job separation, and deterministic collision handling across resume.
- [x] 5.3 Implement top-level async-by-default and explicit sync execution, role `blocking`, mixed batch results, and no duplicate delivery for sync items.
- [x] 5.4 Implement the parent-scoped 32-permit semaphore, durable FIFO queue, cancellation-before-start, and shared nested concurrency ceiling.
- [x] 5.5 Implement unlimited Agent-turn wall-clock/request defaults while preserving provider watchdogs, tool timeouts, progress, manual cancel, and process-bound shutdown.
- [x] 5.6 Implement result normalization with explicit lifecycle/error/truncation/model/profile/workspace metadata and stable output/history refs.

## 6. hub lifecycle and messaging tool

- [x] 6.1 Define and register `hub list/send/wait/inbox/output/history/jobs/cancel` plus model override query/request operations with owner/descendant scoping.
- [x] 6.2 Map running messages to safe-boundary `steer`, idle messages to a new turn, parked messages to revive+turn, and aborted/unknown targets to explicit failure.
- [x] 6.3 Implement the durable per-Agent mailbox, successful-delivery de-duplication, cap 100, reject-new overflow receipt, peek/drain, and restart recovery.
- [x] 6.4 Implement running-job hard cancel, idle/parked release/unregister, transcript preservation, abort propagation, and cross-parent denial.
- [x] 6.5 Implement unified wait over owned jobs/messages with bounded polling options and no false completed state.

## 7. Durable async result delivery and output/history

- [x] 7.1 Implement full raw `<agent-id>.md` output and child Session JSONL persistence before completion delivery.
- [x] 7.2 Implement the parent-scoped pending-delivery ledger, stable delivery IDs, parent custom result message, transcript scan de-duplication, and exactly-once recovery.
- [x] 7.3 Implement OMP-style returned output tail caps of 500000 bytes/5000 lines and parent preview cap of 5000 characters with explicit truncation metadata.
- [x] 7.4 Implement `agent://`/`history://` URI-like refs plus Pi-compatible `hub output/history` resolution, disk fallback for released Agents, concise transcript rendering, and offset/limit reads.
- [x] 7.5 Implement parent-owned retention: no individual history deletion, fork starts empty, confirmed AILI parent deletion cascades, and host deletion gaps remain visible in doctor/reconciliation.

## 8. Permission and approval integration

- [x] 8.1 Reuse the generated permission-mode resolver/config semantics in a child policy adapter without loading a competing interactive permission runtime.
- [x] 8.2 Implement sanitized parent UI approval packets and per-job suspension/resume for file, bash, network, and custom-tool asks.
- [x] 8.3 Ensure no-UI, parent shutdown, approval cancellation, bridge loss, and stale requests deny and settle without hanging.
- [x] 8.4 Enforce credential/auth/private-key hard denial before approval across file tools, parsed bash, custom tools, messages, logs, output, and artifacts.
- [x] 8.5 Verify parent task approval is not blanket child authorization and background execution never changes active permission mode or tool ceiling.

## 9. Conflict-aware shared and isolated workspaces

- [x] 9.1 Implement validated `writeScope.paths/resources`, `workspace:auto|shared|isolated`, normalized cwd boundaries, and active resource leases.
- [x] 9.2 Keep disjoint known scopes shared; auto-isolate overlapping scopes/resources; default undeclared scopes to shared with an explicit best-effort diagnostic.
- [x] 9.3 Add observable file-mutation conflict checks that block the second conflicting operation and return isolated-retry guidance without migrating partial work.
- [x] 9.4 Implement the audited minimal isolation adapter, dirty baseline projection, patch/branch output, merge confirmation boundary, and deterministic cleanup.
- [x] 9.5 Prevent revive after isolated workspace cleanup while retaining readable transcript/output, and fail instead of silently falling back to shared conflict writes.

## 10. Model selection and persistent configuration

- [x] 10.1 Implement per-turn precedence: one-shot > instance > trusted project role > user-global role > profile > parent fallback, with source-aware metadata.
- [x] 10.2 Implement one-shot flat/batch model overrides that affect exactly one turn and do not mutate registry, profiles, parent model, or configuration bytes.
- [x] 10.3 Implement parent-scoped durable instance overrides and AILI-owned global/project role configuration with trust gating, schema validation, locking, and atomic replacement.
- [x] 10.4 Add direct user command/TUI operations and model-facing request/clear operations; require a fresh interactive confirmation for every Agent/model persistent write.
- [x] 10.5 Fail closed for unknown, unavailable, unauthenticated, or incompatible explicit models without lower-layer fallback; retain official parent fallback only when no explicit layer exists.
- [x] 10.6 Recalculate model choice at every turn/revive and record provider/model, layer, thinking, profile hashes, and no credential-bearing metadata.

## 11. Runtime migration and provenance

- [x] 11.1 Add the new coordinator modules behind test-only/internal wiring while the legacy runtime remains unchanged until replacement acceptance tests pass.
- [x] 11.2 Obtain separate exact approval for any copied/substantively adapted OMP symbols; update revision-bound symbol provenance, LICENSE/NOTICE, SBOM, hashes, and focused behavior tests. (No OMP symbols were copied or substantively adapted, so the copy-approval branch was not exercised; pinned reference-only provenance is recorded.)
- [x] 11.3 Obtain separate exact dependency/lockfile approval, remove `@agwab/pi-subagent` production use/dependency and `src/runtime/subagents.ts`, and register only `task`/`hub` in the single Extension entry.
- [x] 11.4 Preserve old `.pi/agent/runs/`, Pi sessions, user configuration, and new sidecars during migration and rollback; add fixtures proving no conversion/deletion.
- [x] 11.5 Update capability registry, doctor, global resource adapters, package validation, provenance, release evidence, and SBOM for the new runtime.

## 12. Deterministic regression and integration coverage

- [x] 12.1 Add unit tests for schemas, ID allocation, state transitions, journal replay/corruption, TTL, profile resolution/hot reload, tool intersection, spawn/depth, and output caps.
- [x] 12.2 Add fake-model integration tests for persistent JSONL, park/revive, interruption/no-replay, async/sync/batch, 32-way FIFO scheduling, nested sync, cancellation, and exactly-once delivery.
- [x] 12.3 Add durable messaging tests for running aside, idle wake, parked revive, mailbox restart, cap/overflow, permanent revive failure, wait, and cross-parent denial.
- [x] 12.4 Add permission tests for parent UI approval/resume, no-UI denial, bridge shutdown, credential hard denial, project trust, and no unattended-yolo.
- [x] 12.5 Add workspace tests for disjoint shared writes, overlapping scopes, shared resources, runtime conflict block, dirty isolation, patch/branch evidence, cleanup, and non-Git failure.
- [x] 12.6 Add model tests for every precedence layer, one-shot non-pollution, instance restart, role scope/trust, atomic write failure, per-request confirmation, hot reload, unusable model, and redaction.
- [x] 12.7 Add parent lifecycle tests for resume, fork isolation, retained released history, supported parent deletion cascade/reconciliation, and exact host-gap diagnostics.
- [x] 12.8 Add package/doctor/release negative tests that reject legacy tool registration, missing provenance, stale profiles, unverified host seams, silent truncation/loss, or false readiness.

## 13. Documentation, cross-change alignment, and acceptance

- [x] 13.1 Update README and user docs for `task`/`hub`, 20 selectors, async/sync, Agent vs job IDs, messaging, park/revive, model overrides, conflict scopes, retention, output refs, and process-bound long tasks.
- [x] 13.2 Supersede the affected subagent clauses in `create-aili-pi-distribution` and `fix-subagent-inline-sdk-compatibility`, and return the subagent-specific `support-pi-0-82-0` clauses to DEFINE alignment.
- [x] 13.3 Prepare an exact cross-repository migration packet for `aili-workflows` fresh/single-use/no-resume/no-recursion language; do not write that repository without separate approval.
- [x] 13.4 Update this change's progress/test-plan evidence and record only actual contract drift in `drift-log.md`.

## 14. Verification and release gates

- [x] 14.1 Run the focused unit/integration matrix from `test-plan.md`, typecheck, full tests, generated/package/doctor/release validators, package dry-run, strict OpenSpec validation, and `git diff --check`.
- [x] 14.2 Inspect the scoped diff for unintended dependency, lockfile, user-home, external-workspace, old-run, credential, Git, publish, or unrelated worktree mutations.
- [x] 14.3 Run real provider, sandbox, external workspace, user-home, or lifecycle probes only after their separate exact approvals; otherwise record them as unverified and keep stable readiness non-pass where required.
- [x] 14.4 Confirm rollback preserves both legacy runs and new sidecars and that no public `subagent` compatibility alias remains.
