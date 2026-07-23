# addyosmani Code Review Rubric Adaptation

## Provenance

| Field | Value |
|---|---|
| Upstream source | `https://github.com/addyosmani/agent-skills` |
| Upstream HEAD | `8c6530305396f341b5da7201cf1f7e390fdb863f` |
| Source paths | `agents/code-reviewer.md`, `skills/code-review-and-quality/SKILL.md` |
| Source blobs | `96cac1d79edca4a9231cbe6af50415b5e4d6cf42`, `5efda7afb5d0e4a5393c5a7da84e15b197f7b5b6` |
| License | MIT License, Copyright 2025 Addy Osmani |
| Copy/adapt scope | Adapted review dimensions, severity vocabulary, spec/task-first review order, verification story, and actionable-fix rules; upstream prompt is not copied wholesale. |
| Rationale | The upstream rubric is concise and matches AILI's existing `code-reviewer` lane. |

## OpenCode / AILI adaptation boundaries

- Keep AILI's hidden `agents/code-reviewer.md` as a read-only OpenCode subagent.
- Do not route through `/review`; OpenCode owns that built-in command.
- Do not make code-reviewer spawn other personas.
- Do not convert suggestions into blockers unless evidence shows accepted-scope risk.

## Activated AILI behavior

- Read the spec, task, issue, or OpenSpec source artifact before judging implementation.
- Review tests first when tests exist; tests reveal intent and coverage.
- Evaluate every change across five axes: correctness, readability, architecture, security, and performance.
- Require a verification story: tests reviewed, build/type/lint status if provided, manual/static evidence, skipped checks, and remaining `Unverified` items.
- Use severity vocabulary: `Critical`, `Important`, and `Suggestion` in review-lane output, then map to local-review severities and verdicts during ROSE reconciliation.
- Every Critical/Important finding needs file:line evidence, a concrete failure mode, a concrete fix recommendation, and a proof note explaining why existing guards do not already prevent it.
- Use uncertainty/proof gates: if evidence is incomplete, downgrade, mark `Unverified`, or recommend a focused follow-up instead of guessing.
- Zero findings is valid when the review records inspected scope, evidence, skipped checks, and confidence.
- Prefer structural remedies that remove complexity or duplicate logic rather than style-only commentary.
- Do not block for subjective rewrites when the change improves the codebase, follows project conventions, and has no accepted-scope risk.
