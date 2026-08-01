---
name: aili-delivery-flow
description: Run the AILI delivery lifecycle from natural-language IDEATE, DEFINE, BUILD, and SHIP intent or the equivalent slash shortcuts; use for idea shaping, spec/test definition, bounded BUILD package queues, review-repair closeout, or adapter routing without exposing internal stage commands.
---

# AILI Delivery Flow

This is the canonical lifecycle/router authority for IDEATE, DEFINE, BUILD, and SHIP. Equivalent natural-language intent and command shortcuts enter the same state, gates, progress, stop conditions, and verification owner. Natural language is a first-class lifecycle entry, not a request to make the user type a slash command.

## References

- Lifecycle states and hard gates: `references/lifecycle.md`
- Backend adapters: `references/backend-routing.md`
- Artifact outputs: `references/artifact-contracts.md`
- Question handling: `references/questionnaire-policy.md`
- Test document rules: `references/test-document-policy.md`
- Direct versus delegated work: `references/direct-vs-delegated-work.md`
- Formal package board: `references/formal-task-board.md`
- Canonical Agent selection: `../parallel-subagent-dispatch/references/agent-selection-matrix.md`
- Build package rules: `references/implementation-packages.md`
- Neutral BUILD execution and loop budgets: `references/build-execution-loop.md`
- Ship review and repair: `references/review-repair-loop.md`
- Protocol templates: `references/protocols/`

## Workflow

### Semantic router

For each current user intent, ROSE selects:

1. lifecycle intent expressed by natural language or a slash shortcut, with neither form receiving extra authority;
2. ordinary or formal/material handling;
3. one primary process/domain/artifact loop;
4. zero or one auxiliary capability only for a named gap the primary loop cannot cover directly;
5. one terminal outcome: `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`.

Explicit user intent wins, followed by the narrowest artifact/domain owner, then the lifecycle loop. A skill match is a route into this state, not a second workflow. Skills must not invoke another process skill, recurse, change phase, create another ledger/approval system, or automatically add planning, research, TDD, review, test, security, coverage, or convergence work.

Treat unambiguous natural-language requests as first-class lifecycle entries; do not ask the user to restate a slash command. Classify by the requested outcome rather than one keyword. Examples include:

- IDEATE: “先帮我想几种方案，暂时不要实现” or “explore options before we build”.
- DEFINE: “把这个需求定义成可实施方案和测试计划，先不要实现” or “write the implementation-ready contract”.
- BUILD: “按已经接受的方案和测试计划开始实现” or “implement the accepted change”.
- SHIP: “把已实现的改动收尾并准备交付” or “close out the implemented change”.

Explanation, comparison, translation, or status questions about these mode names remain ordinary near misses. When outcome, target, or current gate is genuinely ambiguous, ask one focused mode/target question rather than requiring command syntax.

### Proactive delegation scan

At the start of each non-trivial ordinary intent and whenever changed evidence creates a new ordinary work split, evaluate the `subagent.dispatch` capability triggers in `references/direct-vs-delegated-work.md`. Classify assignment shape before selecting the narrowest canonical role in `aili-agent-selection/v1`. If a current adapter supplies that capability and a trigger is met, dispatch before doing the same work directly. If multiple independent units are ready, launch them together rather than serializing them. Default concurrency is at most two, but it is not a hard cap; ROSE chooses a larger bounded fan-out only from the number of independent non-overlapping units, concrete wall-clock/context benefit, available specialist roles, and an explicit join plan.

Formal work uses the separate `aili-task-board/v1` lane. A ready Agent-owned package dispatches to its exact canonical owner unless a valid waiver was recorded before direct execution; an ordinary negative-benefit judgment cannot override that owner. A ROSE-owned package is direct. `general` cannot own a formal package. Phase role lists are advisory, and a narrower matching specialist outside the common list remains valid with a recorded role-fit reason.

Every delegated context is non-nesting and permission-bounded. Adapters may use one-shot tasks or persistent Agent identities as described by the package identity contract; the OpenCode Task adapter remains fresh, single-use, and terminal.

Near misses stay direct: lifecycle words used for explanation/status, code that merely has tests, multi-file work without a planning need, and completion wording without a concrete review or evidence gap do not activate extra skills. An existing official Graphify graph may supply one scoped architecture-orientation result; exact-current symbols, source, call paths, tests, and impact stay with CodeGraph or current files, and no lifecycle phase installs, registers, or runs Graphify automatically.

### Mode decision table

| User intent | Mode/loop | Required gate | Stop boundary |
|---|---|---|---|
| Explore options without implementation | IDEATE | current request and relevant evidence | options/unknowns produced or material formal trigger found |
| Create or materially revise a durable change contract | DEFINE | one resolved change identity | coherent artifacts plus final `test-plan.md` acceptance, or exact blocker |
| Explicitly implement a resolved accepted formal change | BUILD | current acceptance, target, package, permission, and claim-verification path | accepted queue implemented and smallest completion check selected, or blocker/material delta |
| Explicitly close out implemented work | SHIP | fresh SHIP intent and current implementation evidence | exact closeout claim supported or blocked |
| Bounded work with no formal/material trigger | ordinary | clear scope and local rules | requested outcome and smallest claim-matched evidence |

### Execution and approval classes

- Safe local execution: perform requested in-scope reads, edits, deterministic diagnostics, and non-destructive claim-matched checks without asking for each step.
- Material decision: ask one focused question only when the answer changes scope, architecture, public contract, dependency, permission, acceptance, verification strategy, product behavior, or target identity.
- Risky operation: obtain the existing exact approval for destructive, external access/write/directory, dependency/lockfile, schema/migration, auth/permission/secret/security, Git/release, or A33 ADD/REMOVE operations.

Every question names the decision or operation, target, why now, risk/trade-off, options, recommendation or uncertainty, and denial effect. One answer/approval never authorizes another operation, target, or risk class.

### Directed hydration

Read only evidence needed for the current mode, dependency, event, and claim:

| Entry | Required current evidence | Conditional evidence |
|---|---|---|
| new DEFINE | change identity and dependencies for the next artifact | interview/context only for a material question or term |
| DEFINE continuation | changed artifact and direct dependents | progress/drift only for resume, deviation, or conflict |
| BUILD start/resume | accepted final-test-plan gate, current tasks/package and owning contract sections, target/Git/rules, affected verification | unrelated DEFINE/history only on conflict or material discovery |
| SHIP | implemented diff/tree, current BUILD evidence, explicit target | only affected/stale risk, integration, packaging, or release evidence |
| ordinary continuation | current request and directly relevant files | formal artifacts only when formal work is resumed or changed |

Re-read every written file once before using it as durable evidence. A relevant user correction, write, hook, content/config/dependency/toolchain/target change, or conflict invalidates only dependent evidence. Phase/time/file presence/`continue` never triggers blanket hydration.

### Mode rules

1. **IDEATE:** run the proactive delegation scan, then explore and compare; do not edit production code. Direct chat is the fallback only when no Task trigger is met or delegation is concretely blocked. A material formal outcome routes to DEFINE, while ordinary brainstorming remains chat/optional approved idea placement.
2. **DEFINE:** resolve one change identity; follow current backend dependency order; write only applicable artifacts. Once stable formal identity and package decomposition exist, create or reuse the change's single Board and consume its evidence-package dependencies, joins, inspection, and dispositions at formal gates. `requirements-grilling` owns `interview.md`; `test-document-generator` owns `test-plan.md`. Use the smallest decision-changing question/evidence lookup by default. An explicitly user-invoked Frontier Batch Mode may submit one bounded packet containing the complete current dependency-ready frontier of material product/requirements decisions only after identity, placement, permission, approval, and exact-operation questions are resolved separately; never infer batch mode from blocker count. Final `test-plan.md` acceptance remains the sole lifecycle-level pre-BUILD user gate, separate from material, validation, permission, and exact operation gates.
3. **BUILD:** require explicit implementation intent and current formal readiness. Derive a dependency-ordered queue from the accepted contract, bind every accepted task ID to exactly one current task-execution package on the Board, implement complete scoped packages, and record bounded Board events in `progress.txt` without package approvals or automatic tests/reviews. Apply readiness by package kind and phase: a decision sought by an evidence package is an expected result, not a satisfied prerequisite; a BUILD task-execution package additionally requires the accepted contract, current final-test-plan gate, explicit implementation authorization, and applicable operation permissions, with non-applicable gates recorded as `N/A`. Phase completion consumes Board dependencies, joins, portable evidence, ROSE inspection, disposition, and verification links. `BUILD_MATERIAL_DISCOVERY` stops affected work before a change to scope, architecture, dependency, public contract, permission, acceptance, or verification strategy and returns it to DEFINE. Acceptance alone executes nothing.
4. **SHIP:** require fresh explicit closeout intent plus current implementation evidence. Reuse still-covering BUILD evidence and the formal Board; refresh only affected rows. Formal evidence/review packages may use stable requirement, decision, risk, artifact, or verification refs without claiming task ownership. Run the ordinary proactive delegation scan only for work not already assigned by a ready formal package. Review/repair/packaging/release capabilities run only for the exact closeout gap.

### Verification owner

The active ordinary-task/lifecycle owner chooses the smallest fresh check supporting the exact claim. Specialized skills may suggest risk-specific evidence but cannot impose per-slice full suites, automatic stress tests, review matrices, repeated rechecks, duplicate approvals, or additional completion authority. Broaden only when the affected integration, packaging, browser, permission, installer, security, or release claim requires it. BUILD permits at most one targeted repair/recheck and does not transition automatically to SHIP.

## Continuation and compound intent

- `continue`, `继续`, `go ahead`, and `继续做` resume exactly one active authorized envelope only when target, phase, current gates, and remaining budget are unambiguous. Preserve counters and stop state; never broaden authorization, change phase/target, refresh acceptance, or reset budget. Otherwise ask one decision-shaped question and perform no affected mutation.
- A continuation carrying a material delta returns to DEFINE and never resumes execution. A no-write/chat-only clause overrides formal writeback, continue+delta, and acceptance+BUILD for that turn and yields only a blocked/`Unverified` preview with zero persistence/execution/mutation/acceptance/budget consumption.
- Same-turn acceptance+BUILD persists/classifies acceptance in its owning artifact, rereads affected files once, then validates BUILD gates before execution.
- Combined BUILD+SHIP intent authorizes only current-phase BUILD. Later SHIP requires fresh evidence and new explicit intent.
- Package savepoints contain `scope`, `files_changed`, `unresolved_items`, `evidence_state`, and `next_package`; they trigger no automatic test, review, commit, or package approval.
- Commit, push, merge, and release each require exact action-specific approval. CI failure reports the failed target/commit/tree/check and returns control to the user without automatic repair, commit, push, merge, or release.

## Generated OpenSpec adapter boundary

AILI guarantees only its four routes. Current generated `.opencode` `/opsx-*`, apply/continue/archive, and `openspec-*` adapters remain directly callable outside AILI. Do not route or recommend users to them, hand-edit/wrap/suppress/prevent them, alter their generator for control, or treat direct output as AILI evidence. Later AILI work must establish its own current contract, acceptance, and verification; integration/control is Phase II.

## Boundaries

- Only four top-level delivery commands are valid: `/ideate`, `/define`, `/build`, `/ship`.
- `/local-review` is a standalone non-delivery local audit command owned by `local-review-gate`; do not route it through this delivery lifecycle skill as a fifth lifecycle mode.
- Research, questionnaire, test-plan, implementation, debugging, review, repair, and harness evolution are internal stages, not user command entrypoints.
- Anti-entrypoint blacklist: do not expose or invent top-level `/research`, `/questionnaire`, `/test-plan`, `/implement`, `/debug`, `/review`, `/repair`, `/harness`, or backend-specific lifecycle commands.
- Do not register `/loop`, `/schedule`, `/goal`, `/proactive`, `/cycle`, `/watch`, `/objective`, or any other public lifecycle alias. Treat those words only as semantic classifier input. AILI does not own, imitate, bind, modify, or control native `/goal`; its successful behavior is Stage II / N/A. Automation scope blocks under the lifecycle reference.
- Backend-specific task systems store artifacts; they do not weaken lifecycle gates.
- Explicit acceptance of final `test-plan.md` is the sole mandatory lifecycle-level pre-BUILD user gate. Material-decision, coherence, strict-validation, permission, destructive/high-risk, external-operation, and named-risk gates remain separate and cannot be relabeled lifecycle acceptance.
- A33 routing starts only from the user-selected Git startup host. AILI does not rank, move, broadly scan for, or auto-select hosts; every lane targets one declared repository, target rules may only narrow, same-level conflicts block, and artifacts stay in the owning target. A30 external-read routing is historical only.
- A33 text here and in the references is admission/approval policy only. It creates no worktree operation authority: PREPARE has zero add/remove effect, and every real or `driver_fixture` ADD and later non-force REMOVE needs its own fresh exact key/class-bound approval and separate applicable risk gate.

## Verification

- Confirm the selected mode/ordinary loop and backend when applicable.
- Name the artifact(s) created or updated.
- For BUILD and SHIP, include traceability-backed fresh verification evidence or mark remaining items `Open Question` / `Unverified`.
- For any blocked gate, return the missing approval, artifact, or evidence as the next action.
