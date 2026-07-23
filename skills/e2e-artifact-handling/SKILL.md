---
name: e2e-artifact-handling
description: E2E artifact handling routing. Use when traces, videos, screenshots, reports, or failure bundles need controlled repository-local placement; do not use for simple unit tests or production-mutating E2E flows.
---

# E2E Artifact Handling

Use this skill to define one bounded E2E evidence-collection/packaging need. ROSE may assign it to one fresh `e2e-artifact-runner` context after the delegation gate; this skill does not dispatch or invoke another process skill.

## Trigger

- E2E command needs trace/video/screenshot/report/failure-bundle evidence.
- A failing browser flow needs artifacts for ROSE review.
- User asks to preserve test artifacts from an E2E run.

## Required Safety Gate

- Use localhost, fixtures, or explicitly approved non-production/read-only targets.
- Require repository-local artifact placement before writing user-visible screenshots, traces, videos, reports, or bundles.
- Do not create new `tests/e2e/`, report, trace, screenshot, or golden directories without placement approval.
- Redact or avoid artifacts containing secrets, cookies, tokens, credentials, or private user data.

## Near Misses

- Browser QA without durable artifacts, test design/unit/integration verification, or coverage review are different primary intents; return the exact mismatch to ROSE.

## Required Routing

- Canonical owner: ROSE/`aili-delivery-flow`; direct artifact handling is preferred when no specialist context is needed.
- Optional agent: one fresh, terminal `e2e-artifact-runner` assignment after a new benefit decision; no resume, automatic retry, or final-verdict ownership.
