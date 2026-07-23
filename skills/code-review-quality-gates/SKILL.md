---
name: code-review-quality-gates
description: Code-review quality gate and test-enhancement rubric. Use when ROSE needs sharper review output contracts, severity and risk prioritization, evidence anchors, negative review cases, fixture or golden-output drift guidance, or a Chinese review report profile; do not use as a duplicate code-review agent or final PASS authority.
---

# Code Review Quality Gates

## Purpose

Use this skill as one bounded rubric auxiliary for an already selected review/test/fixture question.

It does not create a reviewer persona, select another skill, dispatch a lane, or become a final gate. ROSE may pass its compact rubric to an already justified reviewer/tester.

ROSE still decides the final acceptance status.

## Trigger

- A code review needs a concrete severity rubric, risk ranking, or file review order.
- Review output is too vague, lacks file/line evidence, or says “LGTM” without residual risk.
- A test-engineering pass needs negative cases for false success, swallowed errors, stale logs, fake secrets, or unsupported verification claims.
- Harness fixtures, snapshots, golden outputs, or generated reports changed and drift needs classification.
- The user asks for a Chinese review report while preserving AILI fields such as evidence anchors, `Unverified`, skipped checks, and residual risk.

## Near Misses

- General review execution, review routing, coverage-only analysis, PR/CI triage, false-success hunting, or security exploitability are different primary questions. Return the exact mismatch to ROSE; do not invoke another skill or agent here.

## Required Routing

- Owner: ROSE/`aili-delivery-flow`; this rubric may accompany one already justified review or test assignment.
- Agent use remains fresh, single-use, trigger-gated, and ROSE-owned; this skill does not select or resume the agent. ROSE dispatches when the current Task trigger is met and otherwise uses the direct fallback.
- Read-only by default: recommendations may request fixes, tests, or fixture updates, but this skill does not edit implementation or fixture files.
- Final authority: reviewers provide evidence and recommendations; ROSE owns final PASS/blocked decisions.

## Review Priority Model

Review in this order unless the user supplies a stricter priority:

1. Files that can break safety or trust: auth, permissions, secrets, shell execution, install scripts, migrations, release, network, storage, and external input boundaries.
2. Files that define contracts: public APIs, schemas, prompts, agents, skills, commands, fixtures, generated-output templates, and test harness gates.
3. Files that changed behavior: logic, error handling, async flow, state transitions, retries, and fallbacks.
4. Tests and fixtures that claim coverage: regression tests, snapshots, golden files, CI scripts, and manual runbooks.
5. Pure documentation or comments, after confirming they do not make a behavior or verification claim false.

## Severity and Risk Rubric

Classify every finding by worst credible impact, not by how easy it is to fix.

| Severity | Use when | Required action |
|---|---|---|
| Critical | Data loss, security exposure, broken accepted behavior, destructive action, false PASS on a required gate, or irreversible harness damage is plausible. | Block acceptance until fixed, disproven with evidence, or explicitly accepted by the user when policy allows. |
| Important | Accepted behavior, verification credibility, maintainability, fixture reliability, or future review quality is materially weakened. | Fix before acceptance unless ROSE records explicit risk acceptance. |
| Suggestion | Improvement that does not affect accepted scope or evidence credibility. | Optional; do not block. |
| Nit | Local style/readability preference with no behavior or gate impact. | Optional; keep concise. |

Add a risk tag when useful: `security`, `correctness`, `verification`, `silent-failure`, `fixture-drift`, `maintainability`, `performance`, `scope`, or `docs-claim`.

## Evidence Anchor Rules

- Required findings need a concrete anchor: `path:line`, command output excerpt, fixture name, golden file name, spec/test requirement, or exact user instruction.
- If the reviewer cannot inspect enough context, write `Unverified` and name the missing evidence instead of approving.
- Do not cite stale logs, old screenshots, generated summaries, or another agent’s conclusion as proof unless the evidence was freshly reconciled.
- A clean review must still state residual risk: what was inspected, what was not inspected, what verification was run or skipped, and why remaining risk is acceptable.

## Negative Cases to Demand

When reviewing tests, fixtures, harness behavior, or verification claims, look for at least these failure examples when relevant:

- Swallowed error: command fails internally but wrapper exits 0 or reports PASS.
- Stale log: report reuses old output after files or commands changed.
- Fake secret: scanner/test treats placeholder strings as real secrets, or misses realistic secret-like patterns that policy says to catch.
- Unsupported verification claim: completion says “verified”, “passing”, or “ready” without a fresh command, manual runbook, diff inspection, or accepted skip reason.
- Fixture drift: golden output changed because prompts/routing drifted, not because accepted behavior changed.
- Over-broad fix: review comment asks for unrelated cleanup or wider refactor outside accepted scope.

## Fixture and Golden-Output Drift Guidance

Classify fixture/golden changes before accepting them:

| Drift type | Meaning | Review response |
|---|---|---|
| Intended contract update | Output changed to match accepted requirements. | Require requirement anchor plus focused verification. |
| Benign wording drift | Text changed without changing routing, gates, permissions, or evidence semantics. | Usually Suggestion or no finding; record residual risk if snapshots are brittle. |
| Gate drift | PASS/blocked/Unverified, severity, evidence, or routing semantics changed. | Important or Critical; require explicit acceptance and regression coverage. |
| Fixture masking | Golden file changed to hide a regression, skipped check, or lost evidence. | Critical; block until root cause and test are fixed. |
| Unexplained churn | Diff has no clear requirement or tool-version cause. | Mark `Unverified`; do not approve as routine update. |

## Chinese Report Profile

When the caller requests Chinese output, keep AILI evidence fields intact instead of replacing them with prose.

```text
评审状态: PASS | NEEDS_FIXES | BLOCKED | NEEDS_REVIEW

评审范围:
- 目标:
- 文件/差异:
- 已运行验证:
- 未验证项/跳过项:

发现:
- [Critical|Important|Suggestion|Nit][risk-tag] path:line - 问题 - 证据 - 必须动作

干净评审残余风险:
- 已检查:
- 未检查/Unverified:
- 为什么当前风险可接受或不可接受:

测试/夹具增强建议:
- <negative case, fixture/golden drift check, or N/A>

最终建议:
- 允许 ROSE 声称 PASS: yes | no | conditional
- 理由:
```

## Boundaries

- Do not produce a final PASS verdict for the task; only say whether the review evidence supports ROSE claiming PASS.
- Do not ask for broad rewrites, dependency changes, schema changes, or public API changes unless they are directly required by the accepted scope or a Critical/Important finding.
- Do not edit manifests, prompts, fixtures, or tests from this skill unless a separate implementation task explicitly authorizes edits.
- Do not copy upstream review rubrics verbatim; write in this repository’s AILI evidence-first vocabulary.

## Verification

Before returning a review-quality-gate result:

- Confirm each Critical/Important finding has an evidence anchor or is marked `Unverified`.
- Confirm the verdict recommendation matches the worst unresolved finding.
- Confirm clean reviews name residual risk and skipped checks.
- Confirm any fixture/golden update is classified as intended contract update, benign wording drift, gate drift, fixture masking, or unexplained churn.
- Confirm Chinese reports preserve `Unverified`, evidence anchors, skipped verification, and residual-risk fields.
