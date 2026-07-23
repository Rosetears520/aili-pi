---
name: harness-optimization-audit
description: Report-first audit for AILI/ROSE harness routing, context cost, review fan-out, subagent parallelism, trigger noise, false PASS risk, and evidence-loss risk. Use when optimizing harness quality or cost; do not edit core harness controls or invoke another process skill.
---

# Harness Optimization Audit

## Purpose

Use this skill to audit whether the AILI/ROSE harness is spending attention, tokens, subagents, and review lanes on the right work.

The default output is a report with evidence and recommendations. It is not an implementation workflow and must not edit core harness controls.

## Trigger

- User asks to optimize or audit agent/skill routing, trigger noise, subagent usage, review fan-out, or context/token cost.
- A workflow repeatedly over-triggers skills, misses required skills, dispatches too many or too few subagents, or loses evidence between lanes.
- Review-pipeline behavior appears too expensive, too shallow, or poorly matched to changed surfaces.
- ROSE or a subagent claims PASS despite skipped gates, stale evidence, partial lane output, or missing `Unverified` fields.
- A harness change proposal needs cost/quality tradeoff analysis before `harness-evolution` edits.

## Near Misses

- One concrete harness bug needing localization, approved harness edits, product-code performance, ordinary code/coverage review, or one-change false-success review are different primary intents. Return the exact mismatch and candidate owner to ROSE; do not invoke another skill here.

## Required Routing

- Owner: ROSE/`aili-delivery-flow`; direct report-only audit is the default, with one fresh read-only assignment only after a concrete benefit decision.
- Mode: read-only report first.
- Inputs: active user goal, relevant workflow files or docs, changed harness surfaces, observed failure or cost signal, current verification/review evidence, and any accepted OpenSpec or proposal constraints.
- Handoff: return an approved edit or unlocalized defect need to ROSE; ROSE separately selects the next bounded owner.

## Audit Dimensions

### 1. Trigger Precision

- Which skills or agents fire too often, too late, or not at all?
- Are descriptions narrow enough to avoid catch-all activation?
- Do near misses point to the correct adjacent skill?
- Does routing preserve `/ideate`, `/define`, `/build`, and `/ship` as top-level lifecycle entrypoints?

### 2. Context and Token Cost

- Does the workflow load large skills, docs, logs, or references before they are needed?
- Can a shorter trigger, progressive disclosure, or evidence-only scout reduce context without losing safety?
- Are repeated reads, duplicate searches, or raw logs being carried across phases unnecessarily?
- Are completion reports concise while still preserving evidence, `Unverified`, and skipped-check fields?

### 3. Subagent Parallelism

- Was Task used only for explicit user request, a required specialist, materially noisy context, or at least two independent units with clear benefit?
- Could ROSE have completed the work directly with less startup/reconciliation cost?
- Are overlapping edit scopes, hidden dependencies, or shared mutable state forcing serial execution?
- Is each Task context single-use, fresh, terminal, non-delegating, and independently benefit-gated rather than resumed/retried?
- Are packets compact but complete enough to prevent rework and missing evidence?
- Are lane outputs reconciled by ROSE instead of copied as final truth?

### 4. Review-Pipeline Fan-Out

- Does one primary review question use at most one auxiliary capability for a concrete gap instead of selecting a code/test/coverage/security/silent-failure/browser/E2E/AI-regression set?
- Are unselected capabilities simply omitted rather than producing lane-selection ceremony?
- Is a truly claim-required high-risk capability missing because the change looked small?
- Does one targeted repair/recheck refresh only the affected claim instead of restarting review lanes?

### 5. False PASS and Evidence Loss

- Could stale logs, partial command output, missing exit codes, skipped tests, or stale screenshots be mistaken for fresh proof?
- Are `PASS`, `NEEDS_REVIEW`, blocked statuses, and `Unverified` used consistently?
- Is evidence lost when moving between ROSE, subagents, review-pipeline, test reports, and final completion reports?
- Are clean reviews required to name residual risk rather than implying zero risk?

## Report Workflow

1. State the optimization question in one sentence.
2. List the harness surfaces inspected and the evidence anchors used.
3. Classify each issue as `cost`, `quality`, `routing`, `parallelism`, `fan-out`, `false-pass`, or `evidence-loss`.
4. Rank each issue by impact: Critical, Important, Suggestion, or Observation.
5. Recommend the smallest safe change, or say no change when the current cost buys necessary safety.
6. For every recommendation, name the owner path: no edit, docs-only, skill text, command prompt, agent prompt, installer/config, fixture/test, or `harness-evolution` approval needed.
7. Mark anything not proven by inspected evidence as `Unverified`.

## Output Contract

```text
HARNESS OPTIMIZATION AUDIT: PASS | NEEDS_CHANGES | BLOCKED | PARTIAL

QUESTION:
- <routing/cost/quality question>

EVIDENCE:
- Surfaces inspected:
- Commands/logs inspected:
- Not inspected / Unverified:

FINDINGS:
- [Critical|Important|Suggestion|Observation][cost|quality|routing|parallelism|fan-out|false-pass|evidence-loss] evidence - issue - recommendation

TRADEOFFS:
- Safety kept:
- Cost reduced or not reduced:
- Risk introduced:

APPROVED EDIT PATH:
- No edit needed | exact proposed edit and current approval state | exact read-only diagnosis need returned to ROSE

VERIFICATION PLAN:
- <fixture, smoke check, script, review lane, or manual/static check>
```

## Boundaries

- Do not edit core harness controls from this skill.
- Core harness controls include ROSE/runtime rules, command prompts, agent prompts, skill routing, subagent contracts, memory policy, installer/config behavior, review gates, and harness docs.
- Do not weaken verification, security, review, or evidence gates only to reduce token cost.
- Do not add dependencies, mutate memory databases, change manifests, commit, push, or rewrite workflow history.
- Do not treat a cheaper route as better unless it preserves required safety, evidence, and lifecycle ownership.

## Verification

Before returning an audit:

- Confirm every recommendation names an evidence anchor and a safe edit path.
- Confirm cost-saving suggestions do not remove required review, security, verification, or `Unverified` reporting.
- Confirm approved core-harness edits are handed to `harness-evolution`, not applied here.
- Confirm the report states what was not inspected and what remains `Unverified`.
