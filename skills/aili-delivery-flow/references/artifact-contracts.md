# Artifact Contracts

Use the skill-internal `references/protocols/` templates as the first version of delivery artifacts.

Persisted natural-language artifacts are human-facing by default. Write them
in genre-appropriate ordinary prose without epistemic claim-tag prefixes,
confidence metadata, current-session provenance, or opaque Agent runtime
identifiers unless the user explicitly requests an annotated evidence edition.
Fixed-schema Agent-internal packets and results use separate structured claim,
source, decision, authorization, verification, and confidence fields.

Source, decision, authorization, execution, and verification are independent dimensions. User-sourced text does not by itself establish acceptance; accepted decisions and final-test-plan acceptance do not grant implementation or operation authorization; generated documents and worker results record but never create those states. Human-facing artifacts express these distinctions in ordinary prose without claim-tag prefixes.

## Shared artifact envelope

All lifecycle artifacts use the same neutral reference fields when they are passed between lanes. A protocol may add fields, but it must not redefine these fields or create a second authority for the artifact:

- `artifact_id`: stable identifier within the active change or task;
- `artifact_kind`: formal contract, sidecar, progress, drift, review, handoff, evidence, or closeout;
- `path`: canonical repository-local path or an explicitly approved non-OpenSpec placement;
- `authority_class`: canonical source, generated/installed adapter, upstream reference, historical evidence, or out of scope;
- `owner`: capability and lane allowed to write the artifact;
- `lifecycle_phase`: IDEATE, DEFINE, BUILD, SHIP, or ordinary;
- `source_requirements`: requirement, decision, risk, or task identifiers represented by the artifact;
- `status` and `freshness`: current state and the evidence time/scope used to establish it;
- `evidence_anchors`, `blocked`, and `unverified`: proof references and unresolved limits.

An artifact reference is navigation and ownership metadata. It does not replace the artifact's owning source, user approval, current Git/filesystem evidence, or fresh verification.

## Shared delta classification

Every accepted correction, requirement, artifact change, finding, or implementation feedback item receives exactly one classification:

- `covered`: already represented by the accepted contract and verification;
- `material-question`: a decision-changing ambiguity that must be answered before affected work continues;
- `material-delta`: changes scope, contract, task, acceptance, risk, or implemented behavior and returns to DEFINE writeback/revalidation;
- `ordinary-steering`: in-scope execution guidance that does not change the accepted contract;
- `Unverified`: evidence is insufficient to classify safely.

The record carries `delta_id`, `classification`, `evidence`, `affected_artifacts`, `writeback_required`, `acceptance_stale`, and `next_action`. It references existing artifacts rather than creating a delta ledger or competing formal authority.

## Shared convergence link

Each convergence claim uses one link with `requirement_or_decision`, `task_or_package`, `file_or_artifact`, `fresh_verification`, `review_or_security_disposition`, `freshness`, and `status`. Status is `linked`, `missing`, `stale`, `conflicting`, `blocked`, or `Unverified`. A checked task, generated summary, CodeGraph result, or Graphify result is not a substitute for the link.

## Package savepoint and completion-evidence contracts

Each implementation-package savepoint may be summarized in concise free-form `progress.txt` prose after the package's complete accepted behavior is implemented, including only useful scope, changed files, unresolved items, evidence state, and next package/action. It triggers no automatic test, review, commit, package approval, independent convergence, or readiness verdict. Generic lifecycle sources derive package identities from the active contract; Package 1–12 is history specific to `complete-aili-workflow-orchestration`.

After the accepted queue is implemented, ROSE directly inspects the changed scope/affected links and selects the smallest fresh check supporting the completion claim. Success records `IMPLEMENTED_TARGETED_VERIFIED` and stops BUILD. A full task matrix, convergence review, or review/test/security capability is selected only for a concrete gap or affected SHIP claim; none is mandatory because a package or phase exists. Package 12 is only the historical name for this umbrella's completion inspection.

When a canonical task matrix is actually selected, every current `tasks.md` checklist row appears exactly once with exactly these nine fields: `task_id`; `accepted requirement/decision/risk`; `expected behavior`; `implementation files/artifacts`; `fresh tests/inspection/review evidence`; `status`; `findings`; `disposition`; `freshness`. Status is exactly `Done | Partial | Missing | Blocked | N/A`. `Done` and resolved source-backed `N/A` pass; every other status or unsupported/unresolved state blocks the affected claim. The detailed evidence and mismatch rules remain owned by `agents/convergence-reviewer.md`; optional matrix evidence is not a broad BUILD or release gate.

## Conditional review arbitration artifact

`openspec/changes/<change-id>/review-arbitration.md` exists only for disputed, blocking, cross-session, or materially inconsistent findings. It preserves finding identity, claims, evidence, counter-evidence, proposed dispositions, ROSE disposition/rationale, decision owner, status, required recheck, freshness, and residual `Unverified` items. It is not a vote ledger, confidence aggregation, routine review report, or artifact created in advance of a real qualifying dispute.

## Shared loop envelope

This file is the canonical repository protocol path for neutral loop-envelope references. Delivery continuity requirement `CONT-005` remains the sole normative owner of budget representation and invariants. Every profile references one envelope with `loop_kind`, `trigger`, `trigger_evidence`, `objective`, `accepted_contract`, `change_id`, `success_evidence`, one nested `budgets` object, `human_gate`, `operation_gate`, `allowed_actions`, `writeback_targets`, `stop_reason`, and `outcome`. Protocol-only interval/event definitions additionally reference the canonical `ROUTE-007` identity object and may add only `external_trigger_source`, `event_classifier`, or `cancellation`.

The neutral terminal outcomes are `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, `Unverified`, `cancelled`, and `budget-exhausted`. Profiles and packages must reference this envelope; they must not create flat budget fields, a second envelope, a session registry, or a background runtime.

| Mode | Primary artifacts | Minimum fields |
|---|---|---|
| IDEATE | `references/protocols/idea-brief.md`, optional research evidence pack, optional lightweight idea capsule, optional backend-neutral `ideas/workflow-inbox.md` | goal, options, assumptions, unknowns, next decision, candidate idea notes when preserved, promotion target when selected |
| DEFINE | spec draft, alignment questionnaire/interview, acceptance test plan, backend-specific `context.md` for formal changes | scope, requirements, questions, requirements/decisions/risks traceability matrix, test cases, approval state, confirmed decisions, rejected options, BUILD readiness |
| BUILD | implementation package, subagent packet/result when delegated, optional human-readable `formal-task-board.md` notes, concise free-form `progress.txt`, one minimal completion inspection/check, `drift-log.md` for spec-backed drift notes, legacy `implementation-notes.html` as read-only migration evidence when present | requirement/decision/risk source, task/package, target files/artifacts, package Acceptance, lifecycle acceptance and authorization gates, forbidden scope, expected/actual portable evidence, canonical `CONT-005` envelope and nested budgets, changed-scope diff and affected links, inspection/disposition, smallest targeted completion evidence, branch/status dirty-path classification, concise status/evidence/blockers/next action, ROSE decision, `Open Question` / `Unverified` items |
| SHIP | review report, compact evidence pack when evidence is noisy, required repository-local Markdown closeout report | closeout document path, BUILD gate status, release-blocker audit target/status, spec coverage check result, review findings, finding classifications, repair result, fresh evidence, branch/worktree hygiene status and cleanup approvals needed, existing feature impact, release-readiness risks, `Open Question` / `Unverified` items, next steps |

## Output Contract

Every mode response includes only applicable fields:

- selected mode and backend;
- artifacts created, updated, or required;
- gates satisfied, blocked, or unverified;
- next action.

## SHIP Closeout Document

Every SHIP run must create or update a detailed, human-reviewable Markdown closeout document. The CLI response may stay concise, but it must include the document path, write/update status, verdict, spec coverage check status, branch/worktree hygiene status, blocking/important/`Open Question`/`Unverified` summary, and approved next action.

- OpenSpec-backed SHIP writes `openspec/changes/<change-id>/ship-closeout.md`.
- Non-OpenSpec SHIP must ask for a repository-local closeout document path before the final verdict if no approved path exists.
- The document content should be written in Chinese unless the active contract explicitly requests another language.
- Do not replace the document with chat-only output; if the document cannot be written, mark the SHIP result blocked or `Unverified` and explain why.

## DEFINE Artifact Set

For OpenSpec-backed changes, DEFINE creates or updates only artifacts required by current dependencies under `openspec/changes/<change-id>/`:

```text
proposal.md
design.md
tasks.md
specs/**/spec.md
interview.md
test-plan.md
context.md
```

- The listed files are the possible formal set, not a requirement to reread or rewrite all files on each turn.
- `proposal.md`, `design.md`, `tasks.md`, and `specs/**/spec.md` follow the OpenSpec backend.
- `interview.md` is generated or updated through `requirements-grilling`.
- `test-plan.md` is generated or updated through `test-document-generator`.
- `context.md` records maintained user intent, confirmed decisions, rejected options, unresolved questions, and drift-check anchors for the formal change.
- Non-OpenSpec artifacts require one placement decision before writing, then the selected locations become part of the active change context.

## Context, Inbox, and Progress Ledgers

- IDEATE may preserve candidate ideas in a lightweight idea capsule or append them to `ideas/workflow-inbox.md` without creating a formal proposal by default; DEFINE promotes only selected ideas into a backend-specific change contract.
- Formal changes use one backend-specific `context.md`; OpenSpec uses `openspec/changes/<change-id>/context.md`, while non-OpenSpec backends use adapter/placement rules.
- `formal-task-board.md` is optional human-readable notes. OpenSpec may use `openspec/changes/<change-id>/formal-task-board.md`; missing or arbitrary content never blocks and is never parsed as authority. Legacy structured Boards remain non-authoritative notes and need no migration or validation.
- For multi-step or formal work, the orchestrator creates `progress.txt` once when absent. OpenSpec uses `openspec/changes/<change-id>/progress.txt`; non-OpenSpec work uses its established task/change root rather than asking for a format. Append concise ordinary prose covering useful status, evidence, blockers, and next action. No grammar, event, timestamp, field order, transition, replay, or format validation is permitted.
- BUILD continuation references exactly one active canonical `CONT-005` envelope in current context and runtime Journal. Markdown does not own Agent/job/turn/join/settlement identity or authorization.
- Only ROSE writes/appends orchestrator `progress.txt`. Workers return compact evidence reports for ROSE to reconcile and must not edit it.
- Neither `progress.txt` nor `formal-task-board.md` creates execution, acceptance, authorization, completion, or archive authority.
- For approved spec-backed implementation, maintain `drift-log.md` beside the change artifacts only for spec deviations, model drift/self-corrections, temporary decisions, trade-offs, open questions, unverified assumptions, and required DEFINE write-back. It is not a user-feedback log, progress ledger, review report, or formal contract substitute.
- Legacy `implementation-notes.html` may be read during hydration or convergence as migration evidence, but new drift/self-correction entries go to `drift-log.md` unless the current active contract explicitly requires the legacy HTML format.
- Apply `lifecycle.md`'s directed read set: no formal hydration for ordinary chat; next dependency plus direct dependents for DEFINE; accepted gate/current package/owning contract/target/affected verification for BUILD; implemented tree/current BUILD evidence/affected closeout owners for SHIP. Re-read each written file once before durable use and invalidate only dependents after a relevant event.
- Idea capsules/inbox entries are IDEATE candidates and may guide selection; they are not a formal contract. Legacy `implementation-notes.html`, stale chat summaries, old logs, task checkboxes, handoff, and memory are navigation/migration context only and cannot establish acceptance, permission, completion, or fresh evidence.
- Context pressure or compression thresholds may prompt an ordinary checkpoint but never authorize compression, handoff, persistence, or lifecycle movement. Continuity is provider-neutral and has no DCP dependency.
- `context.md`, `progress.txt`, `drift-log.md`, and legacy `implementation-notes.html` do not create or replace a durable-memory provider, task-scoped `handoffs/` history, explicitly selected legacy `handoff.md`, `interview.md`, `test-plan.md`, backend tasks, formal specs/tasks, or final reports.
- Exclude secrets, raw logs, full transcripts, full file contents, private data, and long dumps from inbox/context/progress/notes artifacts and evaluator input.

## Memory and handoff continuity

- MemPalace is the sole recognized durable-memory provider. A required memory operation needs a compatible exact provider version, supported and configured adapter capability, a canonical user Palace/Wing/diary mapping, and its own exact operation approval. No SQLite, `rose-memory`, dual-write, wrapper, or alternate-store fallback is permitted.
- Installation, initialization, MCP configuration, model download, mining, hooks, reads, writes, coordination/logstream writes, and deletes remain separately gated. Concurrent multi-process write safety is `Unverified`; a required operation fails closed whenever another supported client may write concurrently.
- Legacy `rose-memory` data is preserved. A caller may present one repository-scoped migration prompt, but it does not inspect, import, read, write, mine, rewrite, or delete data and grants no operation authority. Memory remains non-authoritative evidence.
- Formal resume reads only the active package/decision and referenced progress, bounded drift, scoped memory, or fresh verification that can change the next action, then revalidates the canonical startup host. It separately revalidates every declared A33 attachment's exact keys, current target root/Git/HEAD/dirty/file/rule state, owning-repository artifact destinations, and applicable `WT-001` identity evidence. Cross-repository common-dir equality is never required; packet, handoff, memory, and checkpoint text are navigation only.
- Versioned handoff history is created only on an explicit user or accepted lifecycle trigger. OpenSpec uses `openspec/changes/<change-id>/handoffs/`; ordinary work uses one previously confirmed repository-local `<task-root>/handoffs/` and asks one placement/identity question rather than scanning when that root is unknown.
- CREATE uses immutable finalized UTC-named snapshots plus an atomically replaced regular `LATEST.md` containing exact relative path, snapshot ID, SHA-256, and finalized time. LIST reads filenames and bounded frontmatter only. RESUME prefers one user-supplied exact snapshot, otherwise validates the current task's pointer, and never falls back by fuzzy title or another task history.
- Handoff stays model-oriented, lightweight, conditional, reference-first, redacted, and non-authoritative. It never auto-creates, auto-prunes, promotes durable memory, imports/moves/rewrites/deletes legacy `<task-root>/handoff.md`, or grants contract, permission, Git, verification, completion, publication, or destructive authority.
- Successful CREATE output ends with exactly one localized fenced `text` prompt naming the exact immutable snapshot and requiring current-state revalidation. For A33 the snapshot conditionally records owning-repository artifact destinations plus preserved rollback worktree/evidence references; RESUME revalidates every target/rule/identity separately, and each ADD or non-force REMOVE still needs a new exact approval.

## Future extension point: `artifact-integrity`

`artifact-integrity` is a documentation-only, non-binding name reserved for possible future protocol work. Phase I defines no provider, manifest, schema, digest, nonce, receipt, revision, configuration, storage, runtime behavior, approval semantic, warning, status field, or gate. Its absence has no effect on DEFINE, BUILD, review, SHIP, or any summary.

## BUILD Readiness

DEFINE output must report one of:

- `READY`: all decision-shaping research is closed, artifacts are coherent/strictly valid, material decisions are resolved, and the final test plan is explicitly accepted.
- `BLOCKED`: a required artifact, material answer, research conclusion, final test-plan acceptance, or evidence item is missing.

A named non-material runtime residual may remain `Unverified` under its separate fail-closed operation gate, but neither a waiver nor accepted-`Unverified` wording is a BUILD-readiness alternative.
