---
name: strategy-stress-test
description: Run one bounded adversarial pass when the user explicitly requests a report-style stress test or ROSE identifies a concrete material loophole in an existing strategy, spec, plan, review, or claim; do not trigger for an interactive grill/frontier interview or merely before write-back, implementation, reconciliation, or completion.
license: MIT
metadata:
  source: local-workflow-guardrail
---

# Strategy Stress Test

## Purpose

Use this skill to turn "are we confident enough?" into an engineering guardrail.

Do not pursue artificial 100% certainty. Target factually supportable high confidence.

If the user asks for 100% confidence, treat that as a request to stress-test harder, not as permission to manufacture certainty. Stop when the claim is supported, conditional, or explicitly marked with `Open Question` / `Unverified` items.

If confidence is not supportable, identify material loopholes, missing evidence, counterexamples, hidden assumptions, verification gaps, and repair options.

Anything still unresolved must be marked as `Open Question` or `Unverified`.

## When to Use

Use this skill only when a concrete draft or claim exists and either the user explicitly asks to challenge/stress-test it or ROSE names one material loophole that direct inspection cannot safely close inline.

Routing boundary: a request to inspect an artifact and report loopholes without interviewing the user belongs here. A request to grill/interview the user's decisions, including an explicitly requested frontier batch, belongs to the single canonical `requirements-grilling` capability. Do not register or invoke a second `batch-grill-me` skill.

Positive triggers:

- "Stress-test this design before I accept it."
- "Challenge this plan for rollback gaps."
- A named contradiction, missing failure path, or unsupported completion claim that can change a material decision.

Near misses: an interactive “grill me”, “interview me”, “batch grill me”, or equivalent decision-elicitation request; an artifact merely exists; a file is about to be written; implementation/review is ending; confidence is requested without a named loophole; or ordinary verification is pending. Interactive decision elicitation routes to `requirements-grilling`; in the other cases the active owner works directly.

ROSE/`aili-delivery-flow` owns lifecycle state, approvals, writeback, and verification. This skill does not invoke research, requirements, test-plan, review, security, or another process skill. It returns one concrete need or material delta to ROSE and stops. Canonical approval and verification rules win any conflict.

## Loop Limit

Run exactly one bounded challenge pass per trigger.

Stop earlier when:

- all material loopholes are resolved
- remaining issues are explicitly marked `Open Question` or `Unverified`
- further work would only produce wording tweaks, low-risk nitpicks, or speculative concerns

If a material issue remains, return it to ROSE; do not start a second pass or another process skill automatically.

## Process

For each loop:

1. Restate the current strategy, spec, plan, review, interview packet, or completion claim in one short paragraph.
2. Ask whether it is factually supported enough to proceed.
3. If not, list only material loopholes that could change scope, design, task order, acceptance criteria, verification, security, privacy, reliability, rollout, or user decisions.
4. Classify each loophole as one of: Missing evidence, Hidden assumption, Counterexample, Edge case, Contradiction, Dependency/order problem, Security/privacy/reliability risk, Verification gap, or User decision required.
5. For each loophole, choose one repair action: edit the current artifact, inspect targeted repository evidence, return an exact source need to ROSE, ask through the canonical owner, defer as `Open Question`, or mark as `Unverified`.
6. Apply fixes only when they are within scope, allowed by the current mode, and supported by evidence.
7. Return remaining material loopholes to ROSE and stop.

## Adversarial Lenses

When the artifact is non-trivial, stress-test it through these lenses without turning the output into a long debate:

1. Pragmatist Skeptic
   - What can be deleted?
   - Is this over-engineered?
   - Is this abstraction premature?
2. Integration Validator
   - What adjacent module, state transition, failure path, or regression is missing?
   - What test proves this?
3. Evidence Researcher
   - Which claims are unsupported?
   - Which claims need repository evidence, official docs, or user confirmation?
4. Architect
   - Does this violate boundaries?
   - Does it introduce coupling or future maintenance debt?
5. Creative Challenger
   - Is there a simpler, more direct, or less invasive path?
   - Is there a better artifact shape?

Keep only material findings in the final stress-test result.

If the needed tool or skill is unavailable:

- perform the compact check inline when possible
- mark only the affected claim as `Unverified`
- mention tool unavailability only when it changes the result or blocks verification

## Evidence Rules

Use evidence before confidence.

Carry the global Evidence-Driven Claim Hygiene rule into the stress test: tag every claim in stress-test conclusions, use `CONFIDENCE: HIGH | MED | LOW | VERY LOW | UNKNOWN` for internal reports, localize user-facing tags/confidence labels when available, and treat anti-sycophancy red flags such as an unusually elegant explanation, one pattern explaining everything, agreement after pushback without evidence, or specifics for unearned authority as reasons to cut specifics, add `[GUESS]`, or say `I don't know.`

Valid evidence can include:

- user-confirmed answers
- current spec, design, tasks, or acceptance docs
- repository source files, tests, schemas, configs, logs, or diffs
- official documentation or current web sources when external behavior matters
- fresh verification command output
- reconciled subagent evidence with anchors

Invalid evidence:

- intuition
- stale logs
- partial output not read fully
- unverified assumptions
- `should work` language
- subagent conclusions without evidence anchors

## 🛑 Anti-Pattern Blacklist

Stop and repair the stress test if it does any of these:

- Manufactures certainty to satisfy a requested confidence level.
- Replaces missing evidence with confident tone, generic best practice, or “likely”.
- Treats a passing narrow check as proof of broad readiness.
- Hides unresolved user decisions inside assumptions.
- Ignores counter-evidence because it complicates the plan or final claim.
- Runs more loops only to polish wording instead of resolving material loopholes.
- Reports subagent conclusions without anchors or conflict reconciliation.

Fallback: downgrade confidence, mark the affected item `Open Question` or `Unverified`, and choose a concrete repair action from the process table.

## Output Contract

Return this structure when reporting the stress-test result:

```text
CONFIDENCE: HIGH | MED | LOW | VERY LOW | UNKNOWN

Current artifact / claim:
- ...

Material loopholes found:
- [Category] Loophole:
  Evidence gap:
  Proposed fix:
  Status: fixed | ask_user | inspect_code | fetch_docs | open_question | unverified

Fixes applied:
- ...

Remaining open questions:
- Open Question: ...

Remaining unverified items:
- Unverified: ...

Evidence used:
- ...

Safe to proceed: yes | no | conditional
Reason:
- ...
```

## Integration Rules

When ROSE selects this as the one bounded auxiliary pass for a primary artifact owner:

- Do not replace the caller skill.
- Do not invoke another skill or continue into another lifecycle loop.
- Do not write files unless the caller skill and current mode allow edits.
- Keep the output compact enough to paste into a final report or artifact appendix.
- Prefer editing the artifact to adding a long critique when the fix is obvious and allowed.

## Example: Compact Embedded Use

Input artifact:

- Plan says: "Implement auth callback handling and update tests."

Stress-test result:

- CONFIDENCE: MED
- Material loophole: Verification gap - plan does not name the callback error cases or tests.
- Fix applied: add tasks for invalid state, expired code, provider error, and existing callback test file inspection.
- Remaining unverified: exact test command until package scripts are inspected.
- Safe to proceed: conditional.
