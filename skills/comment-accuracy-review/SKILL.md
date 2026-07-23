---
name: comment-accuracy-review
description: Review comment, JSDoc, TODO, README, and docs-to-code factual consistency, stale or low-value comments, and Chinese comment/variable appropriateness; do not use for general code review, broad documentation rewrites, or auto-editing comments without approval.
---

# Comment Accuracy Review

Use this skill when ROSE needs a narrow, read-only pass over whether explanatory text still matches the code it describes.

## Trigger

- Comments, JSDoc, TODOs, README snippets, or nearby docs may be stale, misleading, redundant, or contradicted by implementation.
- A review asks whether docs-to-code claims, examples, parameters, return values, errors, environment notes, or operational steps are factually accurate.
- Chinese comments, Chinese variable names, or bilingual text need appropriateness checks for clarity, tone, maintainability, and consistency with repository language patterns.

## Near Misses

- General review, large documentation authoring, style-only writing, or implementation are different primary intents. Return the exact mismatch or approved edit need to ROSE; do not invoke another skill or agent here.

## Required Routing

- Owner: ROSE/`aili-delivery-flow`; direct read-only inspection is the default.
- Optional agent: one fresh code-review or docs-research assignment only when a concrete capability/context gap independently passes the delegation gate.
- Default mode: read-only; report findings and recommended edits, but do not modify comments automatically.

## Boundaries

- Compare text claims to the current repository evidence, not to intent or stale plans.
- Flag comments that restate obvious code, describe old behavior, overpromise guarantees, hide uncertainty, or use TODOs as unmanaged task trackers.
- Preserve useful intent comments that explain non-obvious constraints, trade-offs, invariants, data formats, or external behavior.
- Treat generated, vendored, third-party, or upstream-copied comments as out of scope unless the task explicitly includes them.

## Verification

- Cite file paths and line anchors for both the questioned text and the code evidence that confirms or contradicts it.
- Classify each finding as inaccurate, stale, unverifiable, redundant, language/terminology concern, or acceptable.
- If edits are later approved, require focused diff inspection and any relevant docs/build/typecheck command for the touched surface.
