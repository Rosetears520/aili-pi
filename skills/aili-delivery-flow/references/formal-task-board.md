# Formal Task Notes and Runtime State

`formal-task-board.md` is an optional human-readable notes file for one formal change. It has no required fields, grammar, status vocabulary, package rows, transition rules, or validation contract. Missing or arbitrary content never blocks dispatch, settlement, BUILD completion, SHIP completion, acceptance, or archive.

## Authority boundaries

- Accepted scope and task definitions remain in the owning contract and `tasks.md`.
- Package identity and Worker evidence use `core/protocols/package-envelope.schema.json` and the compact task/result packets.
- Agent identity, job identity, turn history, continuation, joins, and settlement belong to the runtime Journal. Do not duplicate or reconstruct that state in Markdown.
- ROSE owns decisions, dispatch, result inspection, evidence disposition, integration, verification selection, write-back, and lifecycle verdicts.
- Notes and runtime state record no user acceptance, implementation authorization, operation permission, completion, or release authority.

## Placement

OpenSpec changes may keep optional notes at `openspec/changes/<change-id>/formal-task-board.md`. Non-OpenSpec work may use an already established repository-local notes path. Do not require a placement decision merely to create this optional file, and do not create it when it has no human continuity value.

A legacy Board at this path may be read as non-authoritative historical notes. Do not parse, migrate, repair, replay, or validate it.

## Formal package dispatch

Formal package ownership remains an orchestrator decision derived from the accepted contract:

- A ready Agent-owned package dispatches to its exact canonical role. `general` is not a formal owner.
- A ROSE-owned package is executed directly.
- Direct ROSE execution of an Agent-owned package requires a valid waiver recorded before work; a post-hoc waiver is invalid.
- Use synchronous execution when a later package depends on the result. Independent asynchronous work needs an explicit join plan, but the runtime Journal—not this notes file—owns Agent/job/turn/join/settlement state.
- A Worker return is evidence, not completion. ROSE must inspect and disposition it, integrate accepted portions, and select fresh claim-matched verification.

## Progress continuity

For multi-step or formal work, the orchestrator creates `progress.txt` once when it is absent. It contains concise free-form prose limited to useful status, evidence, blockers, and the next action.

`progress.txt` has no required timestamps, event vocabulary, key/value fields, field order, transition pairs, or replay rules. Never parse or format-validate it, and never make dispatch, settlement, package completion, BUILD completion, SHIP completion, acceptance, or archive depend on its content. Existing arbitrary text is valid continuity text.

Only the orchestrator writes `progress.txt`. Workers return package-bound evidence and must not edit the orchestrator-owned file.
