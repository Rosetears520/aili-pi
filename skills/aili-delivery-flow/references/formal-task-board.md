# Lightweight TODO and Progress

This shared guide covers ordinary and formal work without requiring OpenSpec. The retained reference filename is not an instruction to create a Board. Maintenance is model discipline, not a Markdown file/format gate: no parser/schema, dispatch hook, state-transition validator, or retry loop is required. Missing files or non-typical free text do not reject runtime work. File contents never prove acceptance, permission, completion, or publication.

## Authority boundaries

- Accepted scope and task definitions remain in the owning contract and `tasks.md`.
- Package identity and Worker evidence use `core/protocols/package-envelope.schema.json` and the compact task/result packets.
- Agent identity, job identity, turn history, continuation, joins, and settlement belong to the runtime Journal. Do not duplicate or reconstruct that state in Markdown.
- ROSE owns decisions, dispatch, result inspection, evidence disposition, integration, verification selection, write-back, and lifecycle verdicts.
- Notes and runtime state record no user acceptance, implementation authorization, operation permission, completion, or release authority.

## Triggers and placement

The main model (ROSE) must create and maintain `todo.md` and `progress.txt` for multiple actions needing tracking, delegation, dependencies, blockers, cross-turn work, or an explicit user request. Once the task and allowed directory are resolved, list observable actions before substantive execution. Simple Q&A and a single step with no follow-up need neither file unless explicitly requested.

Choose the root in this order: explicit user target, existing project task convention, otherwise propose repository-local `tasks/<task-slug>/`. Obey project placement-approval rules. Keep both files in the same root, reuse that root on continuation, and never overwrite another task. A change directory's presence does not select that change. No `tasks.md` or OpenSpec is required.

When writing is forbidden or unavailable, use an in-conversation TODO and explicitly say it is not persisted. Do not switch directories to bypass restrictions or claim a save. Ordinary read-only requests gain no write authority from this discipline.

## Current actions: todo.md

Update pending, current, blocked, done, and cancelled actions in place, not by appending a duplicate list each turn. Titles name deliverable outcomes, not objectless “look/change/test”; add one completion condition only when the title is insufficient. Normally highlight one main current action; show multiple genuinely independent parallel actions honestly.

Update on start, completion, blocking, scope change, and before pause or closeout. A failed or uninspected Worker return is not done. Blockers name the reason and next decision; cancellations name the reason. Keep unfinished items: no silent deletion, false checks, or cancellation of real remaining work merely to end a turn.

`tasks.md` or another accepted plan owns scope. TODO references its task IDs and expands only current actions, never mirrors the complete task tree and status. TODO does not take over the portable package protocol.

## Useful history: progress.txt

Append briefly only for substantive progress, important trade-offs, verification results, blocker changes, or useful pause context. Record results, necessary reasons, evidence references, and unverified limits; optional TODO IDs link the story. Do not log each tool call, copy all TODO/tasks, or store raw logs or transcripts. No timestamps, event vocabulary, or fixed fields are mandatory.

An unchanged read adds no entry. Before pause with no new information, inspect the TODO without mechanically appending “continuing”. Resume reads the selected task's TODO first, then recent or referenced Progress only as needed. Old evidence does not become fresh and historical authorization does not renew. Full-history rereads are unnecessary.

Existing free-text progress remains valid. Do not automatically compress, delete, rewrite, or archive history; introduce no line/token thresholds. On legacy Board resume, extract only a few relevant current actions based on current evidence into `todo.md`; preserve the original `formal-task-board.md` as history without renaming or deleting it. Legacy Boards are non-authoritative notes: do not parse, repair, replay, or validate them.

Neither file has required grammar, field order, transition pairs, or replay rules. Never parse or format-validate them, and never make dispatch, settlement, package completion, BUILD completion, SHIP completion, acceptance, or archive depend on their content. Existing arbitrary text is valid continuity text.

## Illustrative example, not a format protocol

```markdown
# TODO: Correct cancelled-state display
## Current
- [ ] T2 Correct the cancellation display (tasks.md §2.1, if present)
  Complete when cancellation no longer displays running.
## Pending
- [ ] T3 Add and run cancellation regression coverage
## Blocked
- [ ] T4 Verify the real CLI: await the user's test-session permission decision
## Done
- [x] T1 Locate the state update entry → src/.../runtime.ts
```

```text
T1: Located the missing cancellation update in src/.../runtime.ts.
T2: Adjusted the display path; regression not run, fix remains unverified.
T4: Real CLI verification awaits permission; continuing authorized T3.
```

## Formal package dispatch

Formal package ownership remains an orchestrator decision derived from the accepted contract and shared package envelope, not TODO formatting:

- A ready Agent-owned package dispatches to its exact canonical role. `general` is not a formal owner.
- A ROSE-owned package is executed directly.
- Direct ROSE execution of an Agent-owned package requires a valid waiver recorded before work; a post-hoc waiver is invalid. The bounded waiver reasons are redundant Agent work given complete verifiable user evidence, exact-role unavailability with equivalent ROSE capability/tools/permission for the unchanged package, or concrete dispatch-cost evidence showing no material evidence benefit. An ordinary negative-benefit judgment cannot override a ready formal owner; missing readiness or permission is not a waiver.
- Use synchronous execution when a later package depends on the result. Independent asynchronous work needs an explicit join plan, but the runtime Journal—not these files—owns Agent/job/turn/join/settlement state.
- A Worker return is evidence, not completion. ROSE must inspect and disposition it, integrate accepted portions, and select fresh claim-matched verification.

## Single writer and adapter boundary

Workers return package-bound evidence. They do not edit `todo.md` or `progress.txt`, accept user decisions, widen permissions, integrate other packages, dispatch nested workers, or publish final verdicts. ROSE alone maintains the main task's two files and owns inspection, disposition, integration, verification selection, and lifecycle verdicts. Adapter Journal owns Agent/job/turn/settlement state; do not mirror it into Markdown.

Adapters may use one-shot execution or persistent identity. Persistent continuation remains unchanged-same-package only: role, assignment, scope, forbidden scope, permissions, acceptance boundary, write scope, expected result, and expected evidence must remain unchanged. Otherwise use a new dispatch or job; no automatic retry is inferred.
