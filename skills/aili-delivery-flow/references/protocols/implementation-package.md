# Implementation Package Protocol

- Trace ID:
- Source requirement/decision/risk:
- Package goal:
- Allowed files:
- Target files/artifacts:
- Forbidden files:
- Acceptance criteria:
- Required context reads:
- WT-001 context ref: <context_id, evidence_version, freshness, mode> | N/A
- Traceability mapping:
  - source requirement/decision/risk:
  - task/package:
  - file/artifact boundary:
  - verification command or inspection:
  - expected evidence:
  - coverage status: covered | Open Question | Unverified
- Parallelism analysis:
  - shared scaffold/source-of-truth:
  - safe parallel lanes:
  - serial dependencies:
  - benefit-gated independent lanes (maximum two by default):
  - ownership boundaries:
  - join point and expected evidence:
  - blockers or no-parallel reason:
- Research-first evidence gate: required-satisfied | not-triggered | blocked
- Implementation constraints:
- Delegation plan:
- Verification command:
- Evidence return expectation: changed files/artifacts plus verification evidence for each mapped source requirement, decision, or risk; uncovered links labeled `Open Question` or `Unverified`.
- Task-end branch/worktree hygiene:
  - branch/status inspection: inspect `git status --short --branch` in the target repo and review the relevant diff.
  - dirty path classification: classify dirty paths as task-scoped, unrelated/pre-existing, generated/ignored, scratch, or unknown.
  - safe scratch cleanup: remove only safe task-owned, non-user-visible scratch artifacts created by the current task.
  - cleanup proposal: propose cleanup for remaining residue without touching unrelated dirty paths.
  - approval-gated operations: ask explicit approval before push, destructive clean/reset, branch deletion, worktree removal, OpenSpec archive, stashing unrelated changes, or deleting user-visible artifacts.
  - commit allowance: savepoint commits may be proactive only when current task/project rules explicitly allow task-scoped verified commits; otherwise ask once with the cleanup package.
- Packaging flow when user-requested:
  - target/platform:
  - pre-package tests/checks:
  - package/build command:
  - package failure classification:
  - repair/retest/repackage limit:
- Repair / retry limit:
- Stop conditions:
- Expected return format:

An A33 package references exactly one current `WT-001` context per declared repository lane. It may not copy, rebind, or reinterpret roots, keys, Git identity/state, approvals, operation class/risk, deltas, target rules, command/cwd, or containment facts. Target rules are re-read at the operation/dispatch boundary, may only narrow authority, and same-level conflicts block. Artifacts stay in the owning target repository.

Decision-shaping research that can affect scope, architecture, dependencies, public contract, permissions, acceptance, or verification strategy must be closed in DEFINE. It cannot be waived or accepted as `Unverified`; discovery during BUILD emits `BUILD_MATERIAL_DISCOVERY` and stops changed work. Named non-material runtime residuals remain under their separate fail-closed operation gates.

Run the proactive delegation scan before package work. When an existing Task trigger is met, dispatch promptly; direct work is the no-trigger/blocked fallback. Default concurrency is at most two but is not a hard cap; larger bounded fan-out requires independent non-overlapping lanes, concrete benefit, suitable owners, and an explicit join plan. Each Task context receives one bounded assignment, returns one terminal result or failure, never delegates, and is never resumed through an old `task_id`. A failed, empty, blocked, or partial result does not trigger an automatic fresh retry; later same-type use requires a fresh trigger-and-benefit decision and a fresh context with no prior `task_id`. ROSE retains lifecycle, integration, reconciliation, and final-verdict ownership. A package never creates automatic review, test, security, verifier, full-suite, or repair-loop lanes. Verification is the smallest fresh check that proves the exact claim.
