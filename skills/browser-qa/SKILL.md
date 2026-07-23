---
name: browser-qa
description: Route an explicitly requested independent/delegated browser QA assignment or durable E2E evidence need; do not trigger for direct Playwright/DOM/console/network inspection, ordinary UI implementation, backend-only work, or production-mutating flows.
---

# Browser QA

Use this skill only for the delegated browser path. Direct browser inspection is owned by `browser-testing-with-devtools`; the two paths are mutually exclusive for one current intent.

## Trigger

- The user explicitly requests independent/delegated browser QA.
- One concrete browser evidence gap requires `browser-qa-runner` rather than direct browser tools.
- Durable browser/E2E artifact evidence is explicitly required and placement is resolved.

## Required Safety Gate

- Resolve the target URL/environment from current user/project evidence. Ask only when target identity is materially ambiguous or the action could cross an external/production gate.
- Avoid production mutation: no real purchases, messages, account changes, destructive forms, or production data writes without the exact operation-specific approval.
- Before saving screenshots, traces, videos, reports, console logs, or network logs, obtain a repository-local artifact placement. If no placement exists, keep evidence inline/ephemeral and report no durable artifact.

## Near Misses

- Persistent E2E packaging, direct local browser inspection, or backend-only verification are different primary intents. Return the exact mismatch to ROSE; do not select another skill here or combine the direct/delegated browser paths.
- Creating Playwright config or test directories: requires explicit implementation scope and placement decision.

## Required Routing

- Canonical owner: ROSE/`aili-delivery-flow`.
- Optional agent: one fresh, terminal `browser-qa-runner` assignment after a new benefit decision.

ROSE/`aili-delivery-flow` owns mode, exact external/production approvals, artifact placement decisions, and final verification. This skill may return one bounded delegation need but does not invoke another skill or create a retry/review chain. One fresh QA assignment is terminal; report `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. Canonical claim-matched verification wins.
