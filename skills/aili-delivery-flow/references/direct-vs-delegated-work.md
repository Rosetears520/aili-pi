# Direct vs Delegated Work

ROSE retains scope, decision, integration, inspection, verification selection, disposition, and final-verdict ownership. Ordinary delegation and formal package dispatch are separate lanes.

## Ordinary lane

Ordinary work uses the proactive trigger-and-benefit scan: a qualifying trigger plus concrete benefit dispatches the narrowest matching canonical role; no trigger or a concrete overlap, dependency, permission, ownership, or negative-benefit blocker permits direct ROSE fallback. Multi-file or complex work alone does not require delegation.

## Formal lane

A ready `aili-task-board/v1` package with `Owner: agent:<canonical-role-id>` requires dispatch to that exact role. Do not rerun the ordinary benefit judgment or substitute another role. `Owner: ROSE` uses `Dispatch: forbidden` and direct execution. Direct ROSE execution of an Agent-owned package is legal only through a valid waiver recorded before work under the bounded reasons in `formal-task-board.md`; a post-hoc waiver or an invalid role is not a fallback.

Formal hard dispatch does not extend to ordinary conversation or bounded ordinary tasks.

## Proactive scan

Run a proactive delegation scan at the start of every non-trivial ordinary intent and whenever changed evidence exposes a new ordinary work split. Evaluate the triggers before ROSE performs the same evidence gathering or implementation directly. First classify assignment shape, then select the narrowest matching role from `../../parallel-subagent-dispatch/references/agent-selection-matrix.md`. A user request for frequent or aggressive subagent use remains a routing preference across the current intent, but every ordinary `subagent.dispatch` operation still needs one bounded eligible assignment and current permission.

## Use `subagent.dispatch` only when

At least one condition is true:

- the user explicitly requests a subagent;
- a specialist owns a capability ROSE cannot perform directly;
- broad search or noisy output would materially pollute the main context;
- at least two independent units can run concurrently with clear wall-clock or context benefit.

When any condition is true, dispatch is the ordinary default action unless units overlap, have an unresolved dependency, lack permission or ownership, or cost more than their concrete wall-clock/context benefit. Record the reason internally when an eligible-looking ordinary task stays direct. Otherwise ROSE reads, edits, and verifies directly. This judgment cannot override a ready formal Agent owner.

## Dispatch shape

- One current intent has at most one auxiliary capability. Default dispatch concurrency is at most two, but this is not a hard cap. ROSE may choose a larger bounded fan-out when it can name every independent non-overlapping unit, concrete benefit, specialist owner, and join plan.
- When multiple independent units are ready, launch them together rather than serializing avoidably.
- Parallel units must have independent inputs and non-overlapping writes.
- If units overlap or depend on one another, run them sequentially or keep the work direct.
- Do not automatically add review, test, security, coverage, or convergence lanes.
- Subagents never delegate and never own the final verdict.
- A skill or subagent returns its bounded result/need to ROSE and cannot invoke another process skill or continue through a prior context.

Use the compact packet and result contracts in `protocols/subagent-task-packet.md` and `protocols/subagent-result.md`. Formal packets preserve Package ID and exact canonical Role ID. A packet narrows scope but never expands effective permissions.

## Separate gates

Delegation routing does not waive lifecycle, branch/status, secrets, high-risk, destructive, dependency, schema, public API, auth/security, external-operation, Git/release, A33, or verification gates. Safe in-scope local reads, edits, diagnostics, and focused checks are not approval events.

## Completion

ROSE inspects the final changed files and runs the smallest check that proves the requested claim. Unsupported claims remain `Unverified`.
