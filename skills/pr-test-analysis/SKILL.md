---
name: pr-test-analysis
description: PR test analysis routing. Use for pull request or diff test impact, changed-test review, CI failure interpretation, and focused test matrix recommendations; do not use for general code review or editing tests.
---

# PR Test Analysis

Use this skill for one bounded read-only PR/diff test-impact question. ROSE may assign it to one fresh `pr-test-analyzer` context after the delegation gate; this skill does not dispatch or invoke another process skill.

## Trigger

- User asks whether a PR/diff has enough tests.
- CI logs need triage against changed files.
- ROSE needs the smallest meaningful command matrix for a package or PR.

## Near Misses

- General correctness review, coverage-only adequacy, or E2E execution/artifacts are different primary intents; return the exact mismatch to ROSE.

## Required Routing

- Canonical owner: ROSE/`aili-delivery-flow`; direct read-only inspection is the default.
- Optional agent: one fresh, terminal `pr-test-analyzer` assignment after a new benefit decision.
- Read-only: no PR comments, labels, pushes, merges, test edits, retry chain, or final-verdict ownership.
