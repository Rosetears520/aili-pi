# BUILD handoff — foreground Web runtime composition

- Created: 2026-08-19
- Change: `integrate-pi-web-ui-and-upstream-extensions`
- Repository root at creation: `/home/rosetears/code/aili-pi`
- Branch observed at creation: `feature/reconcile-aili-compact-raw-gap-proof`
- Lifecycle state observed: BUILD, active
- Nature: immutable, reference-first, non-authoritative resume snapshot

## Resume point

The accepted Pi Web workbench package is complete, but foreground production composition remains incomplete. The next owning package is `BUILD-P02-R6-R2`, covering tasks `2.4, 2.5, 3.2, 3.3, 3.4, 4.2, 4.3, 4.4, 5.2, 5.3, 5.4`.

Its exact implementer dispatch returned `aborted` with `job-23: scheduled task cancelled` and no Worker output. This result has not yet been dispositioned in `formal-task-board.md` or `progress.txt`. Before retrying, inspect current task-scoped files and Agent evidence to establish whether the cancelled job wrote anything. Automatic replay is not authorized.

## Current implementation state

- Task checklist observed: 19 of 61 checked.
- Exact source snapshots and inventories for Pi Web, Analytics, Stamp, BTW, and Worktree are present.
- The exact Pi Web dependency graph is installed and locked.
- Runtime primitives retained as complete: tasks `2.3, 3.1, 3.5, 4.1, 5.1`.
- Pi Web workbench tasks `6.1–6.4` are complete with fresh typecheck and focused test evidence.
- Focused P03 result: 3 files, 21 tests passed.
- Production foreground BFF/runtime composition is not complete or verified.
- Analytics, Stamp, BTW, Worktree adaptation, AI process components, final provenance/docs, browser/process/package verification, and convergence remain pending.

## Foreground composition findings

Evidence package `BUILD-E09` established:

- Current topology is Pi Extension → `bin/pi-web.js` launcher → separate `next start` process.
- The launcher currently consumes the private identity but does not make a production BFF/runtime bridge reachable inside the Next process.
- `src/web/app/api/runtime/v1/[...segments]/route.ts` requires a bridge, but no production caller installs it in the Next process.
- Next instrumentation is the supported process-local startup seam.
- Browser bootstrap/login routes and production instances of the runtime owners remain missing.
- Polling must converge on the accepted cursor/SSE contract.
- Mutation dispatch must be exhaustive and deny by default.

The accepted narrow implementation direction is:

- Managed `/web`: inherited private file descriptors across Pi → launcher → Next, plus reverse readiness.
- Standalone: process-scoped internal identity.
- Loopback browser access: one-use bootstrap exchange into an HttpOnly, SameSite cookie; no identity in URL or browser persistent storage.
- Non-loopback: configured password login/logout.

## Required next actions

1. Revalidate repository root, branch, worktree, accepted contract, test-plan acceptance, and current operation permissions.
2. Inspect `BUILD-P02-R6-R2-foreground-composition` output/history where permitted and inspect task-scoped source changes to determine whether the cancelled job wrote files.
3. Record the cancelled package disposition in ROSE-owned `formal-task-board.md` and `progress.txt`.
4. If no usable work exists, create a fresh package identity and transfer the same accepted task IDs; do not resume or automatically replay the terminal job.
5. Dispatch the exact `aili.implementer` without a model override. If exact execution is demonstrably unavailable again, record a valid waiver before any direct implementation.
6. After implementation, run the smallest fresh deterministic checks that detect false readiness, unreachable bridge/session routes, mutation bypass, stale identity/replay, and cleanup failures.
7. Do not start dependent P04/P05/P06 work until the overlapping `src/web` composition package is complete and inspected.

## Primary evidence references

- `openspec/changes/integrate-pi-web-ui-and-upstream-extensions/formal-task-board.md`
- `openspec/changes/integrate-pi-web-ui-and-upstream-extensions/progress.txt`
- `openspec/changes/integrate-pi-web-ui-and-upstream-extensions/tasks.md`
- `openspec/changes/integrate-pi-web-ui-and-upstream-extensions/design.md`
- `openspec/changes/integrate-pi-web-ui-and-upstream-extensions/test-plan.md`
- `artifact:BUILD-E09-foreground-composition-map`
- `verification:BUILD-P03-R2-typecheck`
- `verification:BUILD-P03-R2-focused-web-matrix`
- `verification:BUILD-P03-R2-final-source-inspection`
- Agent identity: `BUILD-P02-R6-R2-foreground-composition`
- Job reference: `job-23`

## Worktree protection

The worktree was dirty at snapshot creation. Preserve unrelated or pre-existing content, especially:

- `.pi/`
- `chatgpt-archive-json-20260809-0824/`
- `graphify-out/`
- `aili-pi-pr1-post-upstream-implementation.md:Zone.Identifier`
- the design document and its `Zone.Identifier`
- existing footer and prior release/hotfix changes not owned by this package

Do not stage, delete, reset, commit, push, publish, release, install into real HOME, or run live server/browser/process/package probes without their exact separate authority.

## Revalidation requirements

This snapshot does not prove current Git truth, source freshness, authorization, verification, task completion, or release readiness. On resume, current disk artifacts outrank this file. Re-read the Board/progress pair, affected source and tests, inspect the task-scoped diff, and validate the formal Board before continuing.

## Redaction limits

No credentials, bootstrap identities, cookies, provider secrets, raw Agent transcripts, private runtime payloads, or full command logs are included. Agent history retrieval was denied by the runtime because the assignment contained credential-like material; therefore exact history content remains unavailable in this snapshot.

This handoff is non-authoritative and does not change lifecycle phase, package status, acceptance, authorization, verification, or final verdict.
