# Neutral BUILD Execution Loop

This is the active authority for neutral BUILD package execution. It defines no pseudo execution mode, session identity, native command binding, or extra permission.

## Activation and readiness

`/build` and equivalent natural-language implementation intent enter this same loop. Formal BUILD starts only when exactly one target, current final-test-plan acceptance, a dependency-ready package, verifiable exit criteria, required operation permission, and a valid canonical `CONT-005` envelope are established. Acceptance or vague continuation alone performs zero execution.

When no package is supplied, synthesize the queue from the active accepted contract: current `tasks.md`, specs, design, `test-plan.md`, dependencies, and repository evidence. Generic execution must not assume Package 1–12 or a fixed task count. For `complete-aili-workflow-orchestration` only, the preserved queue is 1→2→5→3→pairwise-disjoint 6/7/8→join→9→10→11→12, with Package 4 complete/history and overlap serialized.

The current A33 host is the Git repository where the user started OpenCode; a non-Git startup root blocks, and AILI never ranks, moves, scans for, or auto-selects another host. Resolve exactly one declared target under current `WT-001` evidence before work. Target rules are re-read at the operation/dispatch boundary, may narrow but never broaden, and same-level conflict blocks.

## Queue contract and free-form continuity

Packages preserve identity, dependency order, complete accepted behavior, forbidden scope, pre-action safety gates, traceability, and stop conditions. Direct serial execution needs no lane report. Record ownership/join details only when actual concurrent work has a clear benefit.

For each implementation package defined by the active contract before its completion package:

1. Read the current package/task rows, owning contract sections, target/Git/rules, and affected evidence. Read progress/drift only for resume, deviation, or conflict; do not blanket-hydrate unrelated artifacts.
2. Implement its complete accepted behavior; scoped work is not a partial patch.
3. Run a focused test/check only when the changed behavior, risk, package need, or bounded failure diagnosis triggers it; a package boundary alone triggers none.
4. Append only useful status, changed-scope/evidence, blockers, and next action to orchestrator-owned `progress.txt`; use ordinary free-form prose with no required fields, grammar, parsing, or replay.
5. Continue only when dependencies are ready and no material/safety/budget stop applies.

The progress note is not a test, review, commit, package approval, closure verdict, or readiness evidence and triggers none automatically. Existing arbitrary text is valid and never blocks dispatch or completion. Workers return evidence and do not write `progress.txt`. Optional feedback is not a mandatory local code-review/test/security gate. Package 1–12 terminology is history specific to `complete-aili-workflow-orchestration`.

After all active-contract packages, ROSE runs the proactive delegation scan, inspects the changed-scope diff and affected requirement/task links, and selects the smallest fresh evidence needed for the exact completion claim. A full matrix or review/test/security capability remains optional and trigger-gated to one concrete gap. Its default concurrency is at most two but is not a hard cap; larger bounded read-only fan-out requires independent non-overlapping units, concrete benefit, suitable owners, and an explicit join plan. One targeted repair/recheck is allowed. Success records `IMPLEMENTED_TARGETED_VERIFIED` and stops BUILD; any remaining blocker is reported without an automatic swarm, broad matrix, fixed multi-cycle loop, commit, push, PR, or SHIP transition. Package 12 is only this umbrella's historical name for that inspection.

## Loop taxonomy

The following names are bounded loop vocabulary, not an automatic sequence. One current intent selects one primary loop; a loop returns any unmet need to ROSE and never invokes another loop itself.

| Inner loop | Trigger | Terminal boundary |
|---|---|---|
| question | material ambiguity or explicit grilling | answered, named `Unverified`, or user stop |
| delta | correction or material feedback | covered, or DEFINE writeback/revalidation |
| evidence/plan | explicit planning/source request or one material evidence gap | sufficient bounded evidence/plan or blocked/`Unverified` |
| neutral BUILD | accepted plan plus runnable package | complete package/savepoint or material/safety/budget/cancel stop |
| review/repair | explicit review or one concrete blocking finding | one targeted repair/recheck, then resolved or blocked/material delta |
| convergence | a concrete missing traceability link for a completion/SHIP claim | required affected links complete or that claim blocked/`Unverified` |

Exactly four outer profiles select initiation and boundary:

- `turn`: executable one-cycle prompt flow; initialize iteration to one and never silently recurse or convert to objective.
- `objective`: executable bounded implementation/closeout flow with explicit intent, exit evidence, and valid budgets.
- `interval`: protocol-only design-owned external/manual timing runbook; no timing registration.
- `event`: protocol-only design-owned external/manual event runbook; no listener or queue.

Interval/event invoke one existing bounded inner flow when externally/manual triggered; they are not inner loops and do not create a seventh loop.

## Canonical `CONT-005` envelope and budgets

Every executable run and protocol definition references one envelope with `loop_kind`, `trigger`, `trigger_evidence`, `objective`, `accepted_contract`, `change_id`, `success_evidence`, nested `budgets`, `human_gate`, `operation_gate`, `allowed_actions`, `writeback_targets`, `stop_reason`, and `outcome`. Interval/event additionally reference the canonical `ROUTE-007` identity and may add only `external_trigger_source`, `event_classifier`, or `cancellation`.

The nested object contains exactly:

```yaml
budgets:
  iteration: { limit: <positive-integer>, consumed: <nonnegative-integer>, remaining: <nonnegative-integer> }
  time: null | { unit: ms, limit: <positive-integer>, consumed: <nonnegative-integer>, remaining: <nonnegative-integer> }
  tokens: null | { unit: tokens, accounting_status: active | unavailable | lost, limit: <positive-integer>, consumed: <nonnegative-integer>, remaining: <nonnegative-integer> }
  review_repair: null | { limit: <positive-integer>, consumed: <nonnegative-integer>, remaining: <nonnegative-integer> }
```

For each non-null counter, `remaining = max(limit - consumed, 0)`. Zero, negative, fractional, nonnumeric, missing required values, wrong units, invalid statuses, or capability/null mismatches block rather than coerce.

- No configured token budget means explicit `tokens: null` and no token-enforcement claim.
- A requested token budget without reliable pre-start accounting remains non-null with `accounting_status: unavailable`, `consumed: 0`, and `remaining: limit`; execution blocks before the first action.
- Midrun accounting loss is valid only after active accounting. Preserve the non-null counter, last actual counters/overshoot, set `accounting_status: lost`, and block before another action.
- A turn uses iteration `{limit: 1, consumed: 0, remaining: 1}` and `review_repair: null`.
- Implementation-only package objectives use `review_repair: null`.
- The direct completion inspection uses `review_repair: null` unless one targeted repair/recheck is needed; that bounded recheck uses exactly `review_repair.limit: 1`. This umbrella historically names the inspection Package 12.
- LP templates consume zero. Each external/manual run instantiates all four entries with concrete zeroed counters before execution.

Iteration and non-null review actions preflight one remaining unit, consume exactly one, and never exceed limit. For these discrete counters, `consumed > limit` is corrupted state: block before any action or repair, preserve the observed values for diagnosis, and do not classify the excess as an allowed overshoot. Time/token actions preflight current remaining and any reliable known bound. Only an indivisible observed time/token overshoot preserves actual consumed, sets remaining zero, records exact `overshoot`, stops, and permits no subsequent action. Resume preserves every counter, status, overshoot, and stop condition without reset or evasion.

Terminal outcomes are `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, `Unverified`, `cancelled`, or `budget-exhausted`; terminal handling writes applicable formal/sidecar/progress evidence.

## Exact continuation

`continue`, `继续`, `go ahead`, or `继续做` resumes exactly one active authorized envelope only when target, lifecycle phase, accepted authorization, current acceptance/material gates, and remaining canonical budgets are unambiguous. Resume cannot create or broaden authority, select another target, change phase, refresh acceptance, reset counters, or clear a stop state. Otherwise ask exactly one focused target/authorization question and perform no loop, write, mutation, or budget consumption.

A material delta returns to DEFINE. A current no-write/chat-only clause overrides persistence and execution. Combined BUILD+SHIP intent authorizes current BUILD only; later SHIP needs fresh evidence and new intent.

## Protocol-only automation boundary

Formal documentation-only AILI interval/event requests may define or reuse one `LP-INTERVAL-*` or `LP-EVENT-*` body only under the active change's `design.md` `## Loop Protocols`. If that documentation request lacks protocol scope or an external/manual trigger source, ask one focused documentation-protocol question without execution. Protocol definition creates no runtime, listener, scheduler, queue, hook, daemon, or lifecycle permission. Tasks, tests, and context may reference a valid LP ID but not duplicate its body.

Hidden or unrequested AILI self-automation, background lifecycle registration, or execution blocks with zero mutation and zero LP. A request mixing that hidden AILI automation with protocol documentation also creates no LP until the user later restates a documentation-only request.

An explicitly scoped product/repository CI, cron, scheduler, watcher, webhook/listener, queue, daemon, hook, dependency, or auto-retry outcome is eligible through the ordinary/formal classifier and every applicable formal, permission, ownership, verification, credential, persistent-service, external-write, dependency/lockfile, destructive, and exact-operation gate. Automation vocabulary in an ordinary comparison is ordinary; it is neither blanket rejection nor permission. Product automation must not be replaced by an AILI LP, and documentation-only interval/event definitions grant no runtime or lifecycle permission. AILI itself provides no hidden background primitive.

## Native command non-ownership

Ordinary user, package, implementation, and Goal-Driven Verification wording remains valid and does not activate special execution semantics. Successful native `/goal <objective>`, bare `/goal`, and persistent native goal behavior are Stage II / N/A. AILI does not own, imitate, bind, modify, control, or claim those behaviors; `/build` remains neutral package execution.

## Safety and closeout

Pre-action gates remain mandatory for destructive/high-risk operations, dependencies/lockfiles, secrets, Graphify execution, and unsafe runtime behavior. Material DEFINE decisions and one final test-plan acceptance remain user controls; package boundaries add no approval. BUILD success does not preauthorize SHIP. Commit, push, merge, and release each require exact action-specific approval. CI failure reports the failed check, target, and commit/tree evidence and returns to the user without automatic repair, commit, push, merge, or release.

### A33 admission and operation gates

These are static admission/approval requirements only; they do not create, remove, inspect, or authorize a worktree operation.

- Destination is exactly `<session-root>/.worktrees/<repo_key>/<worktree_key>`. The host must ignore the exact prospective destination through root `/.worktrees/`, with no re-inclusion and no tracked destination; otherwise block for an explicit host ignore change.
- Both keys match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`; empty, dot/dotdot, reserved `.git`/`.worktrees`, separator, absolute, control, newline, NUL, collision, or path-like values block. A safe unique source basename may default only `repo_key`; `worktree_key` is explicit. Never suffix, guess, force, use `-B`, create orphan state, guess a remote, or infer branch/base-ref.
- Admission requires trusted source/path topology with no tracked `.gitmodules`, mode-160000 gitlink, malformed submodule/superproject relation, or unresolved symlink/junction/mount/path escape. Host, source, and target evidence stay distinct; populated host/source and exact target absent→populated ADD / populated→absent REMOVE `A33Identity` transitions are compared directly. Target rules may narrow only; conflict blocks.
- Every operation binds explicit branch, base ref, `branch_mode: existing|create`, source `reflog_policy: enabled|disabled`, both keys, source, destination, expiry, and `operation_class: driver_fixture|real`. Existing mode creates no ref/reflog; create mode creates the exact branch ref and only enabled policy creates its exact reflog. Missing enabled reflog, unexpected disabled/existing reflog/ref, or any remove-time branch ref/reflog mutation blocks.
- PREPARE performs zero add/remove. Every real or fixture ADD has its own fresh exact key/class-bound approval and accepted trusted-code risk. Every later REMOVE has a different fresh exact approval after complete deletion inventory, uses `trusted_code_risk:not_applicable` only for an observed approval, and passes a separate deletion-risk gate. Approval mismatch, reuse, wrong class, wrong key, absent/declined/unavailable risk, or stale/expired/wrong operation has zero effect.
- ADD may change only the exact declared common-dir admin entry/membership plus its branch-mode/reflog-policy-authorized ref transaction. REMOVE is non-force and may delete only the declared target path/private admin entry/membership while retaining branch ref/reflog. Dirty, unknown, user-visible, ignored, untracked, artifact, locked, wrong-source, wrong-path, or missing target state blocks.
- Common-dir canonical path identity and every unrelated entry/ref/reflog/config/hook/worktree record, unrelated/prunable state, evidence, and other file remain unchanged. Prune/move/repair/lock/unlock/force/clean/reset/merge/rebase/commit/push/integration/branch deletion and undeclared ref/reflog mutation are outside this gate. Rollback disables routing but preserves worktrees/evidence; removal still needs a new exact approval.

Before non-trivial closeout, inspect `git status --short --branch` and classify dirty paths as task-scoped, unrelated/pre-existing, generated/ignored, scratch, or unknown. Propose cleanup for remaining residue; ask explicit approval before push, destructive clean/reset, branch deletion, worktree removal, OpenSpec archive, stashing unrelated changes, or deleting user-visible artifacts. Savepoint commits may be proactive only when current task/project rules explicitly allow task-scoped verified commits; otherwise ask once with the cleanup package.
