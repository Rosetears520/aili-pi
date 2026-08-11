# Requirements Interview

- Mode: Frontier Batch
- Source: `proposal.md` and the user-reported Agent/model/TUI behavior
- Current round: 2
- Readiness: `READY`
- Implementation authorization: `absent`

The later complete Round 1 reply supersedes the earlier duplicated partial reply.

## Round 1 decisions

### R1-Q1 — Explicit bare model resolution

- Round 1 answer: when no model is supplied, use the parent model by default; for a supplied model name, search the user's available model catalog.
- Round 2 answer: A.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: omission uses the configured precedence and ultimately the parent active/fallback model. For an explicit bare model ID, first try the parent provider's authenticated available model; otherwise search the user's authenticated available catalog. Exactly one match is accepted. Zero or multiple matches fail before durable Agent/job/turn allocation and report the available canonical candidates; no provider is guessed.
- Write-back target: `proposal.md`, `specs/subagent-model-selection/spec.md`, and the Agent dispatch transparency specification.

### R1-Q2 — Effective model freeze point

- User answer: A.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: resolve and freeze the effective model before durable Agent/job/turn allocation so the first accepted result can display the model that the turn will use. Configuration changes after allocation affect only a later new turn. Provider availability and authentication are revalidated before the provider request without silently changing the frozen model.
- Write-back target: Agent/model proposal, design, model-selection specification, and queue/preflight tests.

### R1-Q3 — Task-line display density

- User answer: A.
- Classification: confirmed.
- Decision state: `accepted`.
- Decision: the compact TUI line shows `name · selector · provider/model`; requested model, `modelLayer`, and effective thinking remain available in expanded details and applicable `hub`/audit surfaces.
- Write-back target: Agent dispatch transparency specification and TUI acceptance tests.

## Current unresolved frontier

None. The Agent/model/TUI requirements frontier is empty.

## Current status

Requirements-grilling is `READY` for this change. This does not establish full DEFINE readiness or final test-plan acceptance and does not authorize BUILD, provider calls, configuration writes, dependency changes, Git operations, installation, publishing, or release.
