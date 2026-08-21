## 1. Baseline and evidence lock

- [x] 1.1 Record the independently verified code-level diagnosis (`runtime.ts:480-482`, `task-coordinator.ts:522-532` / `:746` / `:863-869`, `production.ts:1196-1207`) and the user-provided 2026-08-20 twin-cancellation session evidence in this change's context.
- [x] 1.2 Search the persistent-agent runtime for any other consumer of the submitting turn's signal or any behavior that relies on "parent turn end cancels accepted async tasks"; confirm the only binding site is `TaskCoordinator.submit()`.

## 2. Coordinator parent-signal binding fix

- [x] 2.1 In `TaskCoordinator.submit()`, compute the parent-bound subset (`!task.effectiveAsync || ancestry !== undefined`) and make listener registration, the already-aborted immediate trigger, and the `allSettled` cleanup act only on that subset.
- [x] 2.2 Keep the executor completion-boundary aborted check in `runLifecycle()` and every explicit cancellation channel (hub cancel, session shutdown, scheduler close) unchanged.
- [x] 2.3 No public tool schema, response shape, or runtime API change; `npm run typecheck` stays clean.

## 3. Regression coverage in `tests/unit/persistent-agent-task.test.ts`

- [x] 3.1 Top-level `async:true` task survives parent signal abort after acceptance and settles completed with persisted output (`onAsyncSettled` receives non-empty output).
- [x] 3.2 Top-level `async:false` task is still cancelled by parent signal abort and records aborted job/turn/agent lifecycle.
- [x] 3.3 Mixed batch (one sync + one async item): only the synchronous item is cancelled; the async item continues.
- [x] 3.4 Nested task still follows its parent task's signal cancellation.
- [x] 3.5 Executor already returned its result when the parent signal aborts: the async task's generated output/evidence is not silently discarded (settlement is not an empty aborted result).
- [x] 3.6 Parent signal already aborted at submission time: async task is created and runs normally while a synchronous submission in the same conditions is cancelled immediately.

## 4. Verification and bookkeeping

- [x] 4.1 Run the focused persistent-agent task tests, then the full `npm test` suite and `npm run typecheck`.
- [x] 4.2 `openspec validate fix-persistent-agent-async-parent-signal-binding --strict` passes; maintain progress records per repo convention once BUILD is authorized.
- [x] 4.3 Confirm the staged sandbox denyRead fix and the `fix-sandbox-deny-read-symlink` worktree remain untouched by this change.
