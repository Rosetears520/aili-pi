# Requirements Clarification — add-file-task-board

> **Historical/superseded status (2026-08-01):** These dated decisions remain capability-source history, but `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This interview does not independently authorize dispatch, advancement, acceptance, closure, publication, or release. Any acceptance or runtime statement below is a historical assertion not independently reverified during this reconciliation.

## Round 1 — Formal-only scope and lifecycle orchestration

- Recorded: 2026-07-28
- Mode: Interactive clarification written back from the user's direct answers
- Readiness effect: material delta; prior final test-plan draft is stale until regenerated and accepted

### Q-001 — Should phase 1 create an informal `task/<task-id>/` board?

- Evidence: the repository currently has no `task/<task-id>/` artifacts or informal task-board implementation; the path exists only in this change draft.
- User answer: remove it to avoid new burden and keep only the formal proposal.
- Classification: confirmed.
- Decision: phase 1 is formal OpenSpec only. The sole task-board root is `openspec/changes/<change-id>/`; remove informal identity, creation triggers, promotion, supersession, dual-write, and related tests.
- Write-back targets: proposal, design, context, file-task-board spec, tasks, test plan.

### Q-002 — What delegation contract applies to the main Agent?

- Evidence: the current `task`/`hub` runtime is mature, but canonical workflow text still makes delegation a benefit-based optional path and leaves direct main-Agent execution valid. The current task metadata explains how to call Agents, not when lifecycle work requires dispatch.
- User answer: do not rely on a generic “call more Subagents” instruction. In active AILI workflow phases, the main Agent plans and orchestrates; bounded material execution is assigned to Specialized Agents through explicit work-package ownership, dispatch, evidence, joins, and disposition. Ordinary Pi work remains direct/benefit-based. Completion depends on evidence rather than Agent-call counts.
- Classification: confirmed.
- Decision:
  - Ordinary Pi retains benefit-based delegation and omitted-agent `general` compatibility.
  - During active IDEATE, DEFINE, BUILD, or SHIP, ROSE owns phase/change identity, decomposition, dependencies, Owner selection, material decisions, waivers, joins, result inspection/disposition, integration, board/progress writes, final diff inspection, fresh verification, and final verdict.
  - A bounded material package that matches a Specialized Agent is Agent-owned by default. A ready `Owner: agent:<selector>` package must dispatch that exact selector before ROSE performs the same scope.
  - Formal lifecycle Agent packages must use an explicit Specialized selector; `general` is not a normal formal-package owner.
  - Dependency-bound results use explicit synchronous dispatch; asynchronous dispatch is only for independent packages with a named join, and no dependent package or phase gate advances before join plus ROSE inspection/disposition.
  - Seven package states remain `pending | ready | running | returned | done | blocked | cancelled`; `returned` never equals `done`.
  - Completed or partial readable structured results become `returned`; worker-blocked, failed, interrupted, unexecuted, or missing-required-output outcomes become `blocked`.
  - Direct execution of Agent-owned scope requires a pre-recorded valid waiver and concrete evidence; invalid selector or unavailable specialist-only capability never silently falls back to `general`.
  - Phase guidance foregrounds relevant Specialized roles while selector descriptions remain derived from canonical RoleProfiles. Phase recommendations are routing policy, not a second description authority or a permission grant.
  - Formal phase gates require dispatch refs or valid waiver, joined results, ROSE disposition, final changed-scope inspection, fresh claim-matched verification, and explicit residual `Unverified` items; raw call counts never satisfy a gate.
- Write-back targets: proposal, design, context, all capability specs, tasks, test plan.

## Confirmed phase-one boundary

Included:

- formal OpenSpec task board and append-only progress;
- Agent Evidence Graph through package Owner, dispatch mode, join, runtime refs, actual evidence, and ROSE disposition;
- ordinary-Pi versus active-lifecycle delegation precedence;
- Specialized Agent default execution for bounded material lifecycle packages;
- phase-relevant role guidance derived from canonical role descriptions;
- explicit sync/async joins;
- ROSE-only artifact writes, integration, verification, and verdict;
- restart reconciliation, legacy OpenSpec opt-in compatibility, and deterministic validation.

Excluded:

- `task/<task-id>` or `.aili/tasks/<task-id>`;
- informal-to-formal promotion or supersession;
- hidden Todo database or scheduler;
- `/aili-work` commands, workboard UI, status-bar UI, or dispatch telemetry product surface;
- automatic child-context assembly or any public board lookup beyond the single explicit `formalContext: { changeId }` identity marker;
- changing ordinary Pi's omitted-agent→`general` or top-level default-async runtime behavior;
- fixed Agent-call quotas or mandatory review swarms;
- any global permission-mode/sandbox semantic change, dependency, Git, publish, or release change; formalContext may only add exact owning-file deny or remove formal child bash fail-closed.

## Round 2 — Bootstrap Runtime/progress compatibility

- Recorded: 2026-07-30
- Trigger: BUILD package 2.3 fresh self-validation found that the active board predates the validator and the external Task runner exposes only `agent://ses_*`, not verifiable raw job/turn/history refs.
- User answer: accept the recommended bounded bootstrap bridge.
- Classification: confirmed material contract decision; final regenerated test plan still requires separate explicit acceptance.
- Decision:
  - strict persistent Agent/job/turn/output/history refs remain the default and only normal v1 runtime form;
  - one exact user-accepted bootstrap change may opt into `external-task-session/v1`, recording the real session ref and explicit `unavailable=job,turn,history` rather than fabricating identifiers;
  - a BOARD `RECONCILED` event binds exact task identity, transport, user decision, and strict-default preservation;
  - historical packages use append-only package `RECONCILED` evidence rather than rewriting prior events; future packages in this same bootstrap build may record a post-return observation bundle only with an explicit `dispatch_timing=unverified-before-return` accepted limitation;
  - the bridge never grants permission, proves pre-dispatch timing, changes ordinary task defaults, or becomes valid without exact opt-in;
  - package 2.3a implements and tests the bridge before package 3.1.
- Write-back targets: proposal, design, file-task-board spec, lifecycle orchestration spec, tasks, test plan, drift log, progress.

## Round 3 — Exact production formal context for child-write protection

- Recorded: 2026-07-30
- Trigger: BUILD package 2.4 found that production `task` registration, workspace leases, and child mutation guards receive no exact active formal-root input. Package 3.3 guidance carries phase/profiles/Owners only; hidden prompt/session inference and broad OpenSpec scanning are forbidden.
- User answer: “Add formal task context (Recommended)”.
- Classification: confirmed material public-contract decision; final regenerated test plan still requires separate explicit acceptance.
- Decision:
  - add one optional task-item field `formalContext: { changeId }`; ordinary calls that omit it retain current schema normalization, `general`, async, workspace, tools, permission, and sandbox behavior;
  - resolve exactly `openspec/changes/<changeId>/{tasks.md,progress.txt}` under the current project root and require a valid same-identity v1 pair before Agent allocation; no fuzzy lookup, phase persistence, prompt parsing, board-text injection, or caller-supplied paths;
  - derive immutable protected paths from that validated root and persist them with the Agent workspace so initial, parked, and revived turns share the same deny set;
  - deny formal child `write`/`edit` before mutation even with empty/parent writeScope and in shared/isolated workspaces;
  - preserve `bash` only when the existing audited permission sandbox can add exact per-command `denyWrite` paths; otherwise remove formal child `bash` fail-closed, including YOLO, without changing ordinary task or global permission-mode semantics;
  - keep reconciliation deterministic and ROSE-owned: no automatic board write, redispatch, acceptance, done, or phase advancement.
- Write-back targets: proposal, design, context, interview, all affected capability specs, tasks, test plan, drift log, and progress.

## Open Questions / Unverified

No unresolved material product decision remains after Round 3. The exact formal-context and fail-closed mutation boundary is defined; BUILD remains blocked only until the regenerated Round-3 final test plan is explicitly accepted. Canonical attachment/write, snapshot/lock synchronization, implementation locality, and release operations remain separately gated rather than requirements questions.

## Requirements-grilling readiness

`READY` for final test-plan review after the Round-3 write-back. The Round-3 answer accepts the material decision but does not itself accept the regenerated final test plan or resume BUILD.
