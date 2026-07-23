# Delivery Lifecycle

AILI delivery has four public modes. The mode gate is mandatory even when a backend contains tasks that appear ready to execute.

## Ordinary / Formal / Material Classifier

Commands and equivalent natural-language intent use the same semantic classifier and evidence record. A request is `ordinary` only when **all** are true: it seeks one bounded outcome; changes no accepted contract, public API, schema/data model, auth/permission/security, dependency/lockfile, destructive operation, release/deployment, scope/task/acceptance/risk/implemented behavior, architecture, or cross-package durable criterion; is likely completable in the current session with focused verification; and needs no multiple independent packages, cross-session work, or formal review/test/security acceptance. File count, text length, and estimated time are not authority.

Any explicit formal spec/change/plan or implementation DEFINE, material change listed above, sensitive named decision, multi-package/cross-session/formal-acceptance need, or architecture/data/cross-package decision is `formal/material`. Lifecycle words used only for explanation, comparison, translation, or status remain ordinary lexical near misses. A material clause wins conflicting “only analyze/do not formalize” wording; a separate explicit no-write/chat-only clause still prevents persistence.

Record route, class, decisive evidence, active/resolved change identity, unresolved ambiguity, and next gate. Ask one decision-changing question only when one answer controls class or identity. On the first hard trigger in an ordinary thread, escalate exactly once and create/reuse one OpenSpec change; preserve history and reuse it for later material deltas.

## Startup Git Host and Repository Targets

For current A33 routing, the user selects the host by starting OpenCode in that Git repository. A non-Git startup root blocks. AILI never ranks, moves, broadly scans for, or auto-selects a host. Each lane targets exactly one declared repository/cwd under its current `WT-001` evidence; target rules may narrow but never broaden, a same-level conflict blocks, and user-visible artifacts remain in the owning target repository. Historical A30/A31 external-read routing remains history only.

An attachment is admitted only at exact `<session-root>/.worktrees/<repo_key>/<worktree_key>` when the exact prospective destination is ignored by root `/.worktrees/` with no re-inclusion or tracked content; both keys satisfy `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` and are non-reserved/path-safe; no path/key/branch/worktree collision exists; source/path/submodule topology is trusted and unambiguous; host/source/target identity evidence is distinct; and branch, base ref, `branch_mode:existing|create`, and source `reflog_policy:enabled|disabled` are explicit. Failure blocks without suffix, guess, force, `-B`, orphan, remote guess, implicit ref, or silent ignore edit.

Admission is not operation authority. PREPARE performs no add/remove. Every real or `driver_fixture` ADD and later non-force REMOVE requires its own fresh exact operation/key/class-bound approval. ADD additionally requires accepted trusted-code risk; an observed REMOVE uses `trusted_code_risk:not_applicable` only under a separate complete deletion-inventory/risk gate. Target rules are re-read at the operation/dispatch boundary and may narrow only. Common-dir path identity and unrelated/prunable state must remain unchanged; only the exact declared admin entry/membership and branch-mode/reflog-policy-authorized ADD ref transaction may change, while REMOVE retains branch ref/reflog. Rollback preserves worktrees/evidence and grants no removal authority.

## Lifecycle Hydration Gate

Hydration is mode-, dependency-, and event-directed:

- new DEFINE reads the resolved change identity plus dependencies and evidence needed for the next artifact;
- DEFINE continuation reads the changed artifact and direct dependents; progress/drift only when resume, deviation, or conflict makes them relevant;
- BUILD start/resume reads the accepted final-test-plan gate, current tasks/package and owning contract sections, target/Git/rules, and affected verification;
- SHIP reads the implemented diff/tree, current BUILD evidence, explicit target, and only affected/stale risk, integration, packaging, or release owners;
- ordinary continuation reads the current request and directly relevant files; it performs no formal hydration unless formal work is explicitly resumed or changed.

Re-read every file written by ROSE once before using it as durable evidence. A user correction, write, hook, content/config/dependency/toolchain/target event, or conflict invalidates that evidence and its dependents only. Phase movement, elapsed time, file presence, or generic `continue` never forces all artifacts to be re-read.

When an A33 boundary is actually involved, revalidate the canonical user-selected Git startup host and current permissions. For every declared attachment, separately revalidate exact `repo_key`/`worktree_key`, current target canonical root/toplevel/private-dir/common-dir/HEAD/branch/membership, dirty and tracked/untracked/ignored/artifact/unknown file state, applicable target rules, owning-repository artifact destinations, and current applicable `WT-001` host/source/target identity evidence. Never require cross-repository common-dir equality or reuse one attachment's evidence for another. Idea capsules/inbox, legacy `implementation-notes.html`, packets, handoff, memory, checkpoints, stale chat summaries, old logs, DCP/compression state, and task checkboxes remain navigation or migration evidence only; none establishes contract, runtime binding, authorization, operation approval, completion, or freshness.

Ordinary one-turn/report-only work that neither opens nor uses memory and has no formal long-running/resume/context-loss boundary writes no memory start/end receipt. Named formal continuity events or actual current-task memory use require the applicable scoped checkpoint/completion receipt, which remains non-authoritative. Handoff likewise requires explicit user intent or an already accepted lifecycle trigger, uses a repository-local redacted reference-first artifact, and promotes no durable memory by default. For A33, handoff/checkpoint records owning-repository destinations and preserved rollback worktree/evidence references; every later ADD or non-force REMOVE requires a new exact operation/key/class-bound approval and no continuity artifact broadens access.

## Optional Capability Gates

Run the proactive delegation scan across commands and natural-language routes. When an existing Task trigger is met, dispatch before duplicating that assignment directly; direct work is the fallback when no trigger is met or delegation is concretely blocked. Do not create a parallelism report, ownership table, research chain, or stress-test merely because work has multiple steps, files, artifacts, or packages.

- Dispatch concurrent tools or Task when actual independent units have clear wall-clock/context benefit or a concrete capability gap. One auxiliary capability defaults to at most two contexts, but this is not a hard cap; ROSE chooses any larger bounded fan-out only for independent non-overlapping units with concrete benefit, suitable owners, and an explicit join plan. Otherwise work directly without user-facing ceremony.
- Look up only the missing source class capable of changing a material decision: current repository evidence for local facts, official/current evidence for a version-sensitive question, or mature prior art on explicit request or a named design gap. Do not run all classes automatically. Incorporation creates no scheme/research/plan approval; unresolved material evidence still blocks final acceptance.
- Run one bounded `strategy-stress-test` only on explicit intent or a named material loophole in a concrete artifact. Otherwise inspect and repair the owning artifact directly.
- User-requested packaging: packaging is a delivery step after claim-matched checks, not a substitute for them. Confirm a materially ambiguous target/platform, run the selected focused verification, allow at most one in-scope targeted repair/recheck/repackage, and report the artifact path or blocker. Pause for signing/notarization credentials, dependency or lockfile changes, external publishing, destructive cleanup, secret handling, or unsupported platform assumptions unless explicitly approved.

## IDEATE

Use when the idea is unclear, broad, or competing options exist.

- Inputs: user goal, constraints, existing context.
- Actions: run the proactive delegation scan, explore alternatives, identify assumptions, and collect evidence needs. Under `direct-vs-delegated-work.md`, explicit request or clear specialist, noisy-context, or independent-parallel benefit dispatches Task promptly; work directly only when no trigger applies or delegation is concretely blocked. When a candidate idea should be preserved without formalizing a change, write a lightweight idea capsule or update backend-neutral `ideas/workflow-inbox.md` if artifact placement is allowed.
- Outputs: idea brief, option list, open questions, recommended next mode, and optional idea capsule or `ideas/workflow-inbox.md` update.
- Hard stop: no production code or harness file edits.
- Do not create a formal OpenSpec proposal by default during pure IDEATE; DEFINE promotes only selected ideas into backend-specific change artifacts.
- Writing an IDEATE capsule/inbox entry does not write requirement memory unless the user also states a safe, scoped fact that independently satisfies the memory gate.

## DEFINE

Use when the goal is plausible but not ready to implement.

- Inputs: current goal, relevant issue/spec/code/docs evidence, and only prior artifacts required by the next dependency.
- Actions: create/reuse one OpenSpec change by scope; ask one identity question and write nothing if genuinely ambiguous. Follow current OpenSpec instruction/status dependencies and write/re-read each applicable artifact once. Route material clarification to `requirements-grilling`/`interview.md` and test-plan generation to `test-document-generator`; neither auto-invokes another process skill. Close only decision-shaping source gaps before final acceptance and run strict validation. Do not ask per-artifact persistence questions.
- Outputs: confirmed scope, unresolved questions, confirmed decisions, rejected options, test traceability, artifacts created/updated, and build-readiness status: `READY` or `BLOCKED`. A named non-material runtime residual may remain `Unverified` under a fail-closed runtime/operation gate, but waiver or accepted-`Unverified` wording is not a readiness alternative.
- Hard stop: do not implement until artifacts are coherent and strictly valid, no material product question or decision-shaping research gap remains, and the user explicitly accepts the final `test-plan.md`. A waiver or accepted-`Unverified` label cannot clear a material research gap. This is the sole mandatory lifecycle approval; permission/risk/destructive-operation gates remain separate.
- Continuity default: after identity resolves, write and re-read applicable OpenSpec artifacts without per-artifact or per-fact prompts. If multiple plausible changes remain, ask exactly one change-identity question and write nothing until resolved.

## BUILD

Use only on explicit command or equivalent natural-language implementation intent for the resolved accepted change. BUILD is neutral bounded package execution. Final test-plan acceptance alone is zero execution.

- Inputs: one ready target, current accepted final `test-plan.md`, current tasks/package and owning contract sections, target rules/state, acceptance criteria, forbidden scope, and affected verification path. Read progress or bounded drift only when resume/deviation/conflict makes it relevant. Named non-material runtime residuals remain `Unverified` under separate fail-closed gates.
- Actions: apply the directed hydration set; confirm exact locality/contracts or diagnose one bounded failure. Open-ended exploration and mature-prior-art research block in BUILD. Resolve the declared target without selecting another host; synthesize the ordered queue from the accepted contract; implement complete scoped packages in dependency order; record lightweight savepoints; and trigger no package test, review, commit, or approval merely at a boundary. ROSE then inspects the final changed scope and affected links and selects the smallest completion check. Use one auxiliary capability only for a concrete gap, permit at most one targeted repair/recheck, and stop without automatic swarm, broad matrix, commit, push, PR, or SHIP transition. Success records `IMPLEMENTED_TARGETED_VERIFIED`. This umbrella's Package 12 name is historical, not a generic requirement.
- Outputs: target and outer profile, active-contract package queue, progress-ledger savepoints, completed/blocked packages, changed files/artifacts mapped to requirements/decisions/risks, canonical envelope/budget state, minimal completion evidence when reached, branch/worktree hygiene, residual risks, and traceability gaps labeled `Open Question` or `Unverified`.
- Hard stop: pause on ambiguous or missing target, missing current research closure or final-test-plan acceptance/readiness evidence, target repository outside the declared/allowed scope, scope expansion, forbidden file edits, high-risk operations requiring explicit approval, unverifiable acceptance criteria, exhausted canonical objective budgets, or an unresolved blocker after the one permitted targeted repair/recheck. A discovery changing scope, architecture, dependency, public contract, permissions, acceptance, or verification strategy is `BUILD_MATERIAL_DISCOVERY`: record the discovery and affected artifacts, stop before changed work, and return to DEFINE writeback/re-read/strict validation and renewed final acceptance. Optional specialist evidence is never a prerequisite unless a concrete capability gap made that specialist necessary. No waiver or other artifact approval substitutes for final test-plan acceptance. Do not pause solely because the user omitted a manual implementation package; synthesize the queue instead.

### Natural continuation and compound ordering

- Resume wording (`continue`, `继续`, `go ahead`, `继续做`) resumes exactly one active authorized envelope when target, exact phase, current acceptance/material gates, and remaining budget are unambiguous. Preserve consumed counters, token accounting state, overshoot, and stop state. Resume cannot broaden authorization, reset budget, change phase/target, or refresh acceptance; otherwise ask exactly one target/authorization question and do no loop/write/mutation.
- A material acceptance/verification change returns to DEFINE, writes/re-reads/revalidates affected artifacts, and stales prior acceptance when the final acceptance contract changes. It never resumes BUILD.
- Same-turn acceptance plus BUILD persists/classifies the answer in `interview.md`, updates the final test-plan gate/checklist, re-reads both, then runs strict validation and target/package/permission/verification/budget checks before any execution. No test execution-ledger row appears before BUILD actually starts.
- Explicit no-write/chat-only overrides formal writeback and both compounds for the current turn: return a blocked/`Unverified` preview; preserve pending state; perform zero persistence, acceptance, execution, mutation, ledger entry, or budget consumption.
- “Implement and then ship” authorizes current-phase BUILD only. Later SHIP needs fresh evidence and new explicit intent.

### Formal interval/event protocol routing and identity

An explicit formal **documentation-only** request for an external/manual AILI interval or event protocol routes to DEFINE. Missing documentation scope or external/manual trigger details cause one focused documentation-protocol question with zero execution. A request for AILI itself to execute, register, or run that lifecycle protocol is not ambiguous documentation: block it with zero mutation and zero LP. Store or reuse one stable `LP-INTERVAL-NNN` or `LP-EVENT-NNN` body only under the active change's `design.md` `## Loop Protocols`; tasks/test-plan/context may reference its ID but never duplicate the body. Ordinary discussion writes no LP. Missing/duplicate IDs or duplicate bodies block validation. Explicit product/repository automation remains governed by the following paragraph instead of this protocol-only block.

Hidden or unrequested AILI self-automation/background lifecycle registration or execution remains blocked with zero mutation and zero LP. A mixed hidden-automation plus protocol-documentation request also creates no LP until later documentation-only restatement. Explicitly scoped product/repository CI, cron, scheduler, watcher, webhook/listener, queue, daemon, hook, dependency, or auto-retry remains eligible through the ordinary/formal classifier and every applicable high-risk, dependency/lockfile, permission, external-write, credential, persistent-service, destructive, ownership, verification, and exact-operation gate; do not replace it with an AILI LP or reject it merely because automation nouns appear. Vocabulary-only comparisons remain ordinary. Documentation-only AILI interval/event requests may define the design-owned external/manual LP but create no runtime or lifecycle permission. A current no-write override still wins.

`ROUTE-007` identity handling is single-authority behavior:

1. Every body persists exactly `profile`, `change_id`, `scope_id`, `trigger_source_id`, and `identity_key`; profile is `interval|event`, change ID is current, slugs are stable lower-kebab-case, and project-relative POSIX paths are case-preserving with no absolute root, backslash, `.` or `..` segment.
2. Eligible natural-language/raw user text is normalized to NFC, trimmed, and has internal ASCII whitespace collapsed before slug resolution; path resolution uses NFC while preserving case. Resolve synonyms once to explicit IDs. Controls, newline, and NUL reject before serialization. Ambiguity asks once and writes nothing. Canonically equivalent composed/decomposed natural input therefore reuses one identity.
3. Persisted/already-structured identity is never repaired in place. Its key must be raw-NFC UTF-8 compact JSON (`ensure_ascii=false`) of the first four fields in exact order with no insignificant whitespace. Alternate non-control `\uXXXX`, decomposed Unicode, controls/newline/NUL, field reordering, JSON whitespace, or field/key mismatch is corruption and hard-blocks without write.
4. One valid identical key reuses its LP. A distinct key re-reads `design.md` immediately before allocation and uses the maximum existing suffix for that profile plus one with at least three digits; gaps and retired IDs are never reused.
5. A clean candidate-ID race permits one immediate re-read/max-plus-one recompute; a second race blocks without write. Duplicate identity keys, duplicate IDs/bodies, malformed identity, or conflicting bodies are corruption—not races—and hard-block immediately without allocation/recompute/retry/write.

The byte oracle for fields `event`, `complete-aili-workflow-orchestration`, `docs/设计/Review.md`, `ci-failure` is exactly raw-NFC `{"profile":"event","change_id":"complete-aili-workflow-orchestration","scope_id":"docs/设计/Review.md","trigger_source_id":"ci-failure"}`. Its UTF-8 hexadecimal bytes are `7b 22 70 72 6f 66 69 6c 65 22 3a 22 65 76 65 6e 74 22 2c 22 63 68 61 6e 67 65 5f 69 64 22 3a 22 63 6f 6d 70 6c 65 74 65 2d 61 69 6c 69 2d 77 6f 72 6b 66 6c 6f 77 2d 6f 72 63 68 65 73 74 72 61 74 69 6f 6e 22 2c 22 73 63 6f 70 65 5f 69 64 22 3a 22 64 6f 63 73 2f e8 ae be e8 ae a1 2f 52 65 76 69 65 77 2e 6d 64 22 2c 22 74 72 69 67 67 65 72 5f 73 6f 75 72 63 65 5f 69 64 22 3a 22 63 69 2d 66 61 69 6c 75 72 65 22 7d`.

## SHIP

Use only after BUILD records `IMPLEMENTED_TARGETED_VERIFIED` and a fresh explicit SHIP intent requests handoff, merge, release, or closeout.

Natural-language SHIP requires explicit review/repair/closeout intent for an implemented change plus current implementation evidence. DEFINE artifacts, final-plan acceptance, direct generated-adapter output, and earlier combined BUILD/SHIP wording are insufficient.

## Generated Direct Adapter Boundary

AILI guarantees only IDEATE, DEFINE, BUILD, and SHIP, selected by command or equivalent natural language. Current generated `.opencode` `/opsx-*`, apply/continue/archive, and `openspec-*` adapters remain unchanged external direct routes. Never route/recommend AILI users to them, hand-edit/wrap/suppress/prevent them, or treat their direct result as AILI acceptance/readiness/verification/convergence/closeout evidence. A later AILI route establishes its own current state. Adapter integration/control is Phase II.

- Inputs: implemented diff/tree, current `IMPLEMENTED_TARGETED_VERIFIED` evidence, explicit SHIP target, and closeout claim. Read `context.md`, `progress.txt`, bounded `drift-log.md`, or legacy migration evidence only when the directed SHIP dependency set requires it.
- Actions: require fresh explicit SHIP intent; apply the directed SHIP read set; reuse BUILD evidence that still covers the exact content/tree, target, config, dependencies, toolchain, hooks, and merge result; refresh only stale, scope-affected, risk-triggered, integration, packaging, release, merge-result, or target-specific evidence. Phase/time and unchanged transport do not stale evidence. A review/test/security or matrix capability is optional only for one concrete affected claim. Run task-end branch/worktree hygiene for non-trivial closeout and prepare closeout.
- Outputs: BUILD gate status, release-blocker audit target and finding classifications, spec coverage check summary, release-readiness summary, final evidence or compact evidence packs, branch/worktree hygiene status, closeout report, archive/sync/memory/PR/release next steps when approved. Ambiguous "archive" or "归档" requests require target confirmation before compression or file writes.
- Hard stop: do not claim ready without claim-matched fresh evidence and resolved blocking findings. Commit, push, merge, and release each need exact action-specific approval. CI failure reports the failed check, target, and commit/tree evidence and stops for user decision; never auto-repair, commit, push, merge, or release. Preserve explicit `Open Question` / `Unverified` items.

## Task-End Branch/Worktree Hygiene Gate

For non-trivial BUILD and SHIP closeout, inspect `git status --short --branch` in the target repository and classify dirty paths as task-scoped, unrelated/pre-existing, generated/ignored, scratch, or unknown. Remove only safe task-owned, non-user-visible scratch artifacts created by the current task. Propose cleanup for remaining residue, and ask explicit approval before push, destructive clean/reset, branch deletion, worktree removal, OpenSpec archive, stashing unrelated changes, or deleting user-visible artifacts. Savepoint commits may be proactive only when current task/project rules explicitly allow task-scoped verified commits; otherwise ask once with the cleanup package.

## Change Revision Decision

When bugs or adjustments appear after a lifecycle pass:

- Same intent, overlapping scope, and not archived: update the current change, add repair tasks, and update `test-plan.md` defect/fix coverage.
- Additional in-scope implementation requested after BUILD: return to the bounded BUILD owner for the changed scope and a newly selected claim-matched check.
- Same scope after SHIP but before archive: repair the current change and rerun only the checks selected for the affected claim.
- Archived, merged, or released: create a new fix change and reference the source change instead of rewriting history.
- Workflow, command, skill, memory, subagent, installer, or tool-policy defect: return the defect to ROSE; diagnosis and any later approved evolution are separate bounded loops, never a skill-to-skill auto-chain.
