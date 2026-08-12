# Direct vs Delegated Work

ROSE retains scope, decision, integration, inspection, verification selection, disposition, and final-verdict ownership. Ordinary delegation and formal package dispatch are separate lanes.

## Ordinary lane

Ordinary work uses a specialist-preferred scan. Dispatch the narrowest matching canonical role when the package is clear, bounded, non-trivial, non-overlapping, available, and permitted by current effective capabilities and permissions. ROSE works directly only for trivial work, contract clarification or splitting, no matching specialist, permission/capability failure, overlapping ownership, or concrete negative benefit. Multi-file or complex work alone does not require delegation.

## Formal lane

A ready `aili-task-board/v1` package with `Owner: agent:<canonical-role-id>` requires dispatch to that exact role. Do not rerun the ordinary benefit judgment or substitute another role. `Owner: ROSE` uses `Dispatch: forbidden` and direct execution. Direct ROSE execution of an Agent-owned package is legal only through a valid waiver recorded before work under the bounded reasons in `formal-task-board.md`; a post-hoc waiver or an invalid role is not a fallback.

Formal hard dispatch does not extend to ordinary conversation or bounded ordinary tasks.

## Proactive scan

Run a proactive delegation scan at the start of every non-trivial ordinary intent and whenever changed evidence exposes a new ordinary work split. Evaluate specialist availability and effective capability/permission before ROSE performs the same evidence gathering or implementation directly. First classify assignment shape, then select the narrowest matching role from `../../parallel-subagent-dispatch/references/agent-selection-matrix.md`. A user request for frequent or aggressive subagent use remains a routing preference across the current intent, but every ordinary `subagent.dispatch` operation still needs one bounded eligible assignment and current permission.

## Specialist-preferred dispatch

Dispatch is the ordinary default only when all of these conditions hold:

- the assignment forms one clear bounded non-trivial package;
- the narrowest matching specialist is available;
- current effective capabilities and permissions permit the package; and
- ownership does not overlap another current package.

Otherwise ROSE works directly only for a named direct exception: trivial work, contract clarification or splitting, no matching specialist, permission/capability failure, overlap, or concrete negative benefit. Record the exception internally when an eligible-looking ordinary task stays direct. This judgment cannot override a ready formal Agent owner.

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
