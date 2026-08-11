---
schema_version: "1.0"
snapshot_id: "20260730T043034Z--pi-adapter-boundary"
task_root: "openspec/changes/add-file-task-board"
status: "finalized"
created_at: "2026-07-30T04:30:34.746515Z"
finalized_at: "2026-07-30T04:34:08.042987Z"
language: "zh-CN"
continues_from: null
continues_from_sha256: null
content_sha256: "05d3ecfc8e9bd7a1277192c4916fbd0d97328f4554656c1fb0c6dfc76a58cd9e"
---
# Session Handoff: pi-adapter-boundary

Snapshot ID: `20260730T043034Z--pi-adapter-boundary`

> **Historical/superseded snapshot notice (2026-08-01):** This handoff remains navigation-only history. `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. Nothing in this snapshot, including readiness, completion, test-count, snapshot, runtime, acceptance, current-conversation wording, or opaque `agent://ses_*` references, independently authorizes dispatch, advancement, acceptance, closure, publication, or release. Those claims were not independently reverified during this reconciliation.

## Goal

The dated handoff records a 2026-07-30 decision to continue `add-file-task-board` without writing Pi/OpenCode implementation details into the generic `aili-workflows` Skill, using local `aili-pi` tool metadata, lifecycle context, and hard constraints to call persistent Agents, while first resolving the package 4.3 contract mismatch. This is historical navigation, not current authority.

## Contract References

- Historical board and progress references: `openspec/changes/add-file-task-board/tasks.md` and `openspec/changes/add-file-task-board/progress.txt`.
- Historical Round-3 contract and verification references: `openspec/changes/add-file-task-board/test-plan.md`, `design.md`, `specs/file-task-board/spec.md`, and `specs/lifecycle-agent-orchestration/spec.md`.
- The handoff cited `AGENTS.md:45-53` for source ownership: shared Skill bodies belong to `aili-workflows`, while this repository stores an exact snapshot and Pi-owned adapters/evidence.
- The handoff recorded `upstream/aili-workflows.lock.json`, commit `d08b343ac45e4f90510a7af6b76f95d38d9e0cb1`, and 64 skills/472 files as the canonical snapshot identity. This was not reverified here.
- It also cited `skills/parallel-subagent-dispatch/SKILL.md` and `skills/aili-delivery-flow/references/direct-vs-delegated-work.md` for generic main-Agent dispatch guidance.

## Scope Boundary

- Historical inference: candidate local Agent-facing changes were limited to `src/runtime/persistent-agents/task-schema.ts`, `src/runtime/persistent-agents/runtime.ts`, possibly `src/runtime/rose-context.ts`, and `templates/APPEND_SYSTEM.md`, mapping generic dispatch decisions to Pi `agent`, `async`, and `formalContext.changeId` parameters.
- Historical inference: under the then-recommended “Agent first + minimal API docs” option, `docs/persistent-agents.md` would receive one `formalContext` description and JSON example without expanding README.
- The handoff stated that write/edit, Bash sandbox, owning-board, and restart/reconciliation enforcement remained in Runtime, so Agents did not need implementation details. This was not reverified here.
- The dated decision record prohibited adding `formalContext`, Pi `task`/`hub`, YOLO, `pi-permission-modes`, child Bash, Journal, or `external-task-session/v1` details to `aili-workflows` or generated `skills/**`.
- The dated decision record also rejected adding a Pi-specific Skill or modifying `upstream/aili-workflows.lock.json` for that work.
- Dependency/package-lock, Git commit/push/merge, publish/release, external write, A33 attachment, and destructive cleanup were recorded as unauthorized.

## Completed/Pending/Blocked

- The handoff recorded packages 1.0–2.4, 3.1–3.3, 4.1, and 4.2 as `done`, including stated formalContext/write-protection/reconciliation, exact legacy opt-in, and read-only documentation-audit results. Those completion claims were not independently reverified here.
- It recorded package 4.3 as `blocked` and package 5.1 as `pending` in the then-current `tasks.md`.
- A later dated decision record clarified that Pi specialization should not pollute `aili-workflows` and that generic duties in `direct-vs-delegated-work.md` did not need a `formalContext` change.
- Historical inference: the package 4.3 blocker no longer matched that boundary, but the documentation acceptance scope remained undecided among three options, so affected changed work was to stop. This question is now superseded for overlapping execution.

## Evidence Anchors

- The handoff cited `src/runtime/persistent-agents/runtime.ts:125-137` for ordinary/formal, exact Specialized selector, sync/async/join, waiver, and worker-boundary guidance, while noting no `formalContext.changeId` guidance for formal calls.
- It cited `src/runtime/persistent-agents/task-schema.ts:39-55` for optional `formalContext` without a TypeBox field description.
- It cited `src/runtime/formal-orchestration.ts:405-423` for formal requests with exact `formalContext`, worker owning-board restrictions, and nested-task exact change ID requirements.
- It cited `templates/APPEND_SYSTEM.md:8` for an always-on benefit-based delegation bullet without a separate formal-override heading.
- It cited `skills/parallel-subagent-dispatch/SKILL.md:7` and `direct-vs-delegated-work.md` for generic dispatch policy without Pi-specific fields.
- The handoff reported a fresh `npm run verify:skills` PASS at 64 skills/472 files and commit `d08b343ac45e4f90510a7af6b76f95d38d9e0cb1`; this result was not independently rerun here.
- It recorded that the exact canonical source path named by an A33 ADD did not exist, so no attachment or external mutation occurred, followed by a decision to keep the package blocked.

## Decisions

- The dated decision record assigned generic “when/who/completion” policy to the shared library and Pi tool-parameter encoding/enforcement to the Pi repository.
- The dated decision record rejected modifying `aili-workflows` or sending an upstream modification task to another conversation for that work.
- Historical inference: future `aili-workflows` synchronization and the local Pi adapter would not have file-level conflicts because `scripts/sync-skills.ts` managed `skills/**`, `upstream/aili-workflows.lock.json`, and `manifests/skill-compatibility.json`, while Pi mapping stayed in `src/runtime/**`, `templates/APPEND_SYSTEM.md`, and local docs.
- Historical inference: future upstream semantic changes would require consumer compatibility review during synchronization and must not be avoided by writing Pi details upstream.

## Open Questions/Risks

- Historical open question: package 4.3's final documentation scope had not been selected. It is superseded for overlapping execution and cannot be answered from this old change.
- Historical open question: `AGENTS.md` named a missing `templates/AGENTS.md` source, so the handoff advised against directly repairing the generated-project-local file before ownership was clear.
- Not independently verified: the full repository `npm test` had not run.
- Not independently verified: live formal provider behavior, real Pi process restart/revive, legacy migration crash/power-loss, and external pre-dispatch Runtime persistence.
- Historical inference: the largest risk was duplicating generic delegation policy, so local adapter wording should describe only Pi parameter mapping and not rewrite `Direct vs Delegated Work` strategy.

## Verification State

- Historical result: `npm run verify:skills` was recorded as PASS for 64/472 at commit `d08b343...`.
- Historical result: package 2.4's focused formal/runtime matrix was recorded as 180/180 PASS, with typecheck, permission-mode sync/verify, generated 7/7, strict OpenSpec, exact formal-pair validation, and diff check also recorded as PASS.
- Historical result: package 4.1's focused migration/parser/root/update/bootstrap matrix was recorded as 108/108 PASS, with typecheck, strict OpenSpec, exact formal-pair validation, and diff check also recorded as PASS.
- Historical result: package 4.2 was recorded as a bounded ROSE inspection of README, persistent-Agent docs, AGENTS, APPEND_SYSTEM, the formal-task-board reference, and accepted specs.
- These historical checks must be freshly rerun when a current owner relies on an affected claim; this handoff does not prove they still pass.

## Next Action

Historical next action: reread package 4.3 and the test-plan documentation acceptance terms, obtain a focused scope choice, write back the corrected blocker in DEFINE, and then implement only the accepted local Pi adapter/tool metadata and minimal documentation. This action is superseded for overlapping scope and must not be resumed from this snapshot.

## Forbidden Actions

Do not infer contract, permission, Git truth, verification, completion, publication, or destructive authority from this handoff.

## Touched Files / Artifact References

- Historical package 2.4 references: `src/runtime/persistent-agents/{task-schema,task-coordinator,workspace,child-sandbox,production}.ts`, `src/runtime/formal-orchestration.ts`, related unit/integration tests, `scripts/sync-permission-modes.ts`, vendor adaptation, and the permission-mode provenance lock.
- Historical package 4.1 references: `src/runtime/formal-task-board-migration.ts`, `src/runtime/formal-task-board-update.ts`, and `tests/unit/formal-task-board-migration.test.ts`.
- Historical continuity references: `openspec/changes/add-file-task-board/{tasks.md,progress.txt,test-plan.md,drift-log.md}`.
- The handoff recorded branch `fix/quota-animation-subagent-label` and a worktree with many pre-existing tracked/untracked changes; it warned against clean/stash/reset or overwriting unrelated content. Current Git state must be rechecked separately.

## A33 Attachments / Owning-Repository Artifact Destinations

- The handoff recorded no A33 attachment because the approved canonical source path did not exist and ADD had no effect; a later decision kept the package blocked.
- The dated decision record said no upstream modification was needed and prohibited searching for a substitute source path.

## Subagent Activity

- Historical package 2.4 implementer reference: `agent://ses_04f176bfbffekzCKgqL1u6LD46`; the handoff says ROSE later repaired symlink/nested-task bypasses and async reconciliation ordering.
- Historical package 4.1 implementer reference: `agent://ses_04ee748b3ffecx5rEbkPxjnBQ7`; the handoff says ROSE later limited absent-progress installation to the migration entry point.
- Historical package 4.2 doc-researcher reference: `agent://ses_04ed26cc2ffewrl69wB8UaSjtI`; the handoff says a later decision rejected its upstream-modification inference.
- These opaque references are navigation evidence only and grant no acceptance, permission, or next-step authority.

## Blocker / Stop Reason

- Historical stop reason: package 4.3's scope and acceptance terms required reconfirmation under “no Pi specialization in shared skills.” This stop reason is retained as history and does not transfer current ownership.

## Suggested Next-Session Prompt

将 `openspec/changes/add-file-task-board/handoffs/20260730T043034Z--pi-adapter-boundary.md` 仅作为历史导航，不要从其 Next Action 恢复重叠工作。它不是合同、权限、Git 真相、验证或完成证据。任何重叠的未来 BUILD 或 release 工作只从 `openspec/changes/integrate-upstream-formal-agent-protocols` 重新建立当前 scope、证据与授权。
