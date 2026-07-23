---
name: ai-regression-scout
description: AI regression scouting routing. Use when agents, prompts, skills, model/tool routing, harness fixtures, or generated-output expectations change and need regression scenarios; do not use for ordinary product-code regressions.
---

# AI Regression Scout

Use this skill to define one bounded AI-workflow regression-scouting need. ROSE may assign it to one fresh `ai-regression-scout` context after the delegation gate; this skill does not dispatch or invoke another process skill.

## Trigger

- Agent prompt, skill, routing rule, model/tool policy, fixture, or output contract changed.
- ROSE needs over-trigger, under-trigger, ownership, permission, or completion-claim regression scenarios.
- A formal harness change needs smoke cases before acceptance.

## Near Misses

- Product-code regression, prompt implementation, or false-success review are different primary intents; return the exact mismatch to ROSE.

## Required Routing

- Canonical owner: ROSE/`aili-delivery-flow`.
- Optional agent: one fresh, terminal `ai-regression-scout` assignment after a new benefit decision.
- Default evidence mode: read-only; return fixture/check recommendations and stop without editing, retrying, or owning the final verdict.
