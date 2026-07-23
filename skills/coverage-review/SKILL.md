---
name: coverage-review
description: Coverage review and verification sufficiency routing. Use when test coverage, uncovered paths, coverage reports, or verification adequacy need a read-only QA review; do not use for writing tests or running browser/E2E artifacts.
---

# Coverage Review

Use this skill for one bounded read-only coverage-adequacy question. ROSE may assign that question to one fresh `test-coverage-reviewer` context when the delegation gate is satisfied; this skill does not dispatch or create another review/test loop.

## Trigger

- Coverage report or changed behavior needs independent interpretation.
- Review asks whether current tests prove the accepted scope.
- ROSE names a concrete uncovered path or verification-sufficiency gap that direct inspection cannot close.

## Near Misses

- Writing/modifying tests, PR-wide matrices, CI logs, or browser artifacts are different primary intents; return the mismatch to ROSE rather than invoking another skill.

## Required Routing

- Canonical owner: ROSE/`aili-delivery-flow`; default evidence mode is read-only.
- Optional agent: one fresh, terminal `test-coverage-reviewer` assignment after a new benefit decision.
- Stop after the bounded finding set; return any test-writing, browser, CI, or material-decision need to ROSE. Findings recommend tests/commands but do not edit or own the final verdict.
