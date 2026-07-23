# Direct vs Delegated Work

ROSE retains integration and final-verdict ownership. Delegation is the proactive execution path whenever an existing trigger is met; direct work is the fallback when no trigger applies or delegation is concretely blocked.

## Proactive scan

Run a proactive delegation scan at the start of every non-trivial intent and whenever changed evidence exposes a new work split. Evaluate the triggers before ROSE performs the same evidence gathering or implementation directly. A user request for frequent or aggressive subagent use remains a routing preference across the current intent, but every `subagent.dispatch` operation still needs one bounded eligible assignment and current permission.

## Use `subagent.dispatch` only when

At least one condition is true:

- the user explicitly requests a subagent;
- a specialist owns a capability ROSE cannot perform directly;
- broad search or noisy output would materially pollute the main context;
- at least two independent units can run concurrently with clear wall-clock or context benefit.

When any condition is true, dispatch is the default action unless units overlap, have an unresolved dependency, lack permission or ownership, or cost more than their concrete wall-clock/context benefit. Record the reason internally when an eligible-looking task stays direct. Otherwise ROSE reads, edits, and verifies directly. A non-trivial or multi-file task does not by itself require delegation.

## Dispatch shape

- One current intent has at most one auxiliary capability. Default dispatch concurrency is at most two, but this is not a hard cap. ROSE may choose a larger bounded fan-out when it can name every independent non-overlapping unit, concrete benefit, specialist owner, and join plan.
- When multiple independent units are ready, launch them together rather than serializing avoidably.
- Parallel units must have independent inputs and non-overlapping writes.
- If units overlap or depend on one another, run them sequentially or keep the work direct.
- Do not automatically add review, test, security, coverage, or convergence lanes.
- Subagents never delegate and never own the final verdict.
- A skill or subagent returns its bounded result/need to ROSE and cannot invoke another process skill or continue through a prior context.

Use the compact packet and result contracts in `protocols/subagent-task-packet.md` and `protocols/subagent-result.md`. A packet narrows scope but never expands effective permissions.

## Separate gates

Delegation routing does not waive lifecycle, branch/status, secrets, high-risk, destructive, dependency, schema, public API, auth/security, external-operation, Git/release, A33, or verification gates. Safe in-scope local reads, edits, diagnostics, and focused checks are not approval events.

## Completion

ROSE inspects the final changed files and runs the smallest check that proves the requested claim. Unsupported claims remain `Unverified`.
