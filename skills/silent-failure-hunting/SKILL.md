---
name: silent-failure-hunting
description: Silent failure hunting routing. Use when a change might pass while skipping work, swallowing errors, losing evidence, weakening gates, or reporting false success; do not use for broad code review.
---

# Silent Failure Hunting

Use this skill for one bounded read-only false-success question. ROSE may assign it to one fresh `silent-failure-reviewer` context after the delegation gate; this skill does not dispatch or invoke another process skill.

## Trigger

- Installer, packaging, verification, review, memory, artifact, CLI, or workflow gate changed.
- Logs/reports may hide skipped checks, stale evidence, partial writes, or ignored exit codes.
- Acceptance depends on distinguishing PASS, partial, skipped, blocked, and `Unverified`.

## Near Misses

- Security exploitability, coverage adequacy, or executing a failing command are different primary intents; return the exact mismatch to ROSE.

## Required Routing

- Canonical owner: ROSE/`aili-delivery-flow`; direct read-only inspection is the default.
- Optional agent: one fresh, terminal `silent-failure-reviewer` assignment after a new benefit decision.
- Read-only; return fix/negative-test needs to ROSE and stop without retrying or owning the final verdict.
