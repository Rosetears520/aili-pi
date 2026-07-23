---
name: code-review-and-quality
description: Conduct one bounded evidence-grounded code review when the user explicitly requests review or ROSE names a concrete unresolved correctness/quality risk; do not trigger automatically after implementation, before every merge, for every bug fix/refactor, or as a completion gate.
---

# Code Review and Quality

## Overview

Perform a risk-proportional review of the requested scope. Direct ROSE diff inspection remains the ordinary completion default; this skill is not mandatory merely because code changed or a merge may follow.

**Recommendation standard:** Report whether the reviewed evidence supports approval, conditional disposition, or changes. ROSE/user owns the final verdict; this skill creates no merge or completion authority.

## When to Use

- The user explicitly asks to review a diff, PR, commit, file set, or generated change.
- ROSE identifies one concrete unresolved quality risk that direct inspection cannot cover adequately.
- A formal SHIP claim explicitly selects a bounded review of affected scope.

Near misses: implementation completion, a pending merge, multi-file work, a bug fix, or a refactor does not select this skill by itself.

ROSE/`aili-delivery-flow` owns lifecycle state, repair authorization, specialist selection, and final verification/verdict. This skill runs one bounded review pass and returns `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. It does not invoke stress-test, security, performance, testing, review-pipeline, or another process skill; return one named specialist gap to ROSE. Canonical approval and claim-matched verification rules win.

## The Five-Axis Review

Select only dimensions relevant to the requested scope and credible risk:

### 1. Correctness

Does the code do what it claims to do?

- Does it match the spec or task requirements?
- Are edge cases handled (null, empty, boundary values)?
- Are error paths handled (not just the happy path)?
- Does fresh verification support the changed behavior, and do any inspected tests actually test the right things?
- Are there off-by-one errors, race conditions, or state inconsistencies?

### 2. Readability & Simplicity

Can another engineer (or agent) understand this code without the author explaining it?

- Are names descriptive and consistent with project conventions? (No `temp`, `data`, `result` without context)
- Is the control flow straightforward (avoid nested ternaries, deep callbacks)?
- Is the code organized logically (related code grouped, clear module boundaries)?
- Are there any "clever" tricks that should be simplified?
- **Could this be done in fewer lines?** (1000 lines where 100 suffice is a failure)
- **Are abstractions earning their complexity?** (Don't generalize until the third use case)
- Would comments help clarify non-obvious intent? (But don't comment obvious code.)
- Are there dead code artifacts: no-op variables (`_unused`), backwards-compat shims, or `// removed` comments?

### 3. Architecture

Does the change fit the system's design?

- Does it follow existing patterns or introduce a new one? If new, is it justified?
- Does it maintain clean module boundaries?
- Is there code duplication that should be shared?
- Are dependencies flowing in the right direction (no circular dependencies)?
- Is the abstraction level appropriate (not over-engineered, not too coupled)?

Architecture review should also ask:

- Does this deepen a useful module, or add a shallow pass-through?
- Is the public interface smaller than the implementation complexity it hides?
- Are invariants concentrated behind an interface instead of scattered across callers?
- Do tests target public behavior through the interface rather than internals?
- Does the change improve locality and leverage for future changes?
- Are new seams justified by at least two real adapters or a concrete near-term need?
- Does this contradict an ADR, and if so, is the friction strong enough to revisit the ADR?

### 4. Security

For detailed security guidance, see `security-and-hardening`. Does the change introduce vulnerabilities?

- Is user input validated and sanitized?
- Are secrets kept out of code, logs, and version control?
- Is authentication/authorization checked where needed?
- Are SQL queries parameterized (no string concatenation)?
- Are outputs encoded to prevent XSS?
- Are dependencies from trusted sources with no known vulnerabilities?
- Is data from external sources (APIs, logs, user content, config files) treated as untrusted?
- Are external data flows validated at system boundaries before use in logic or rendering?

### 5. Performance

For detailed profiling and optimization, see `performance-optimization`. Does the change introduce performance problems?

- Any N+1 query patterns?
- Any unbounded loops or unconstrained data fetching?
- Any synchronous operations that should be async?
- Any unnecessary re-renders in UI components?
- Any missing pagination on list endpoints?
- Any large objects created in hot paths?

## Change Sizing

Small, focused changes are easier to review, faster to merge, and safer to deploy. Target these sizes:

```
~100 lines changed   → Good. Reviewable in one sitting.
~300 lines changed   → Acceptable if it's a single logical change.
~1000 lines changed  → Too large. Split it.
```

**What counts as "one change":** A single self-contained modification that addresses one thing, includes related tests, and keeps the system functional after submission. One part of a feature — not the whole feature.

**Splitting strategies when a change is too large:**

| Strategy | How | When |
|----------|-----|------|
| **Stack** | Submit a small change, start the next one based on it | Sequential dependencies |
| **By file group** | Separate changes for groups needing different reviewers | Cross-cutting concerns |
| **Horizontal** | Create shared code/stubs first, then consumers | Layered architecture |
| **Vertical** | Break into smaller full-stack slices of the feature | Feature work |

**When large changes are acceptable:** Complete file deletions and automated refactoring where the reviewer only needs to verify intent, not every line.

**Separate refactoring from feature work.** A change that refactors existing code and adds new behavior is two changes — submit them separately. Small cleanups (variable renaming) can be included at reviewer discretion.

## Change Descriptions

Every change needs a description that stands alone in version control history.

**First line:** Short, imperative, standalone. "Delete the FizzBuzz RPC" not "Deleting the FizzBuzz RPC." Must be informative enough that someone searching history can understand the change without reading the diff.

**Body:** What is changing and why. Include context, decisions, and reasoning not visible in the code itself. Link to bug numbers, benchmark results, or design docs where relevant. Acknowledge approach shortcomings when they exist.

**Anti-patterns:** "Fix bug," "Fix build," "Add patch," "Moving code from A to B," "Phase 1," "Add convenience functions."

## Review Process

### Step 1: Understand the Context

Before looking at code, understand the intent:

```
- What is this change trying to accomplish?
- What spec or task does it implement?
- What is the expected behavior change?
```

### Step 2: Review the Tests First

Tests reveal intent and coverage:

```
- Do tests exist for the change?
- Do they test behavior (not implementation details)?
- Are edge cases covered?
- Do tests have descriptive names?
- Would the tests catch a regression if the code changed?
```

### Step 3: Review the Implementation

Walk through the code with the five axes in mind:

```
For each file changed:
1. Correctness: Does this code do what the test says it should?
2. Readability: Can I understand this without help?
3. Architecture: Does this fit the system?
4. Security: Any vulnerabilities?
5. Performance: Any bottlenecks?
```

### Step 4: Categorize Findings

Label every comment with its severity so the author knows what's required vs optional:

| Prefix | Meaning | Author Action |
|--------|---------|---------------|
| *(no prefix)* | Required change | Must address before merge |
| **Critical:** | Blocks merge | Security vulnerability, data loss, broken functionality |
| **Nit:** | Minor, optional | Author may ignore — formatting, style preferences |
| **Optional:** / **Consider:** | Suggestion | Worth considering but not required |
| **FYI** | Informational only | No action needed — context for future reference |

This prevents authors from treating all feedback as mandatory and wasting time on optional suggestions.

### Step 5: Verify the Verification

Check the author's verification story:

```
- What tests were run?
- Did the build pass?
- Was the change tested manually?
- Are there screenshots for UI changes?
- Is there a before/after comparison?
```

### Step 6: Direct Evidence Check

Before the bounded review result, inspect the evidence directly. Do not invoke a separate stress-test merely because review is ending.

Check whether:

- the review conclusion depends on uninspected files, partial diffs, stale logs, or inferred behavior
- any Critical or Important finding lacks a concrete evidence anchor
- tests pass but do not prove the changed behavior
- security, privacy, performance, migration, rollout, or compatibility risk needs a specialist pass
- the verdict should be downgraded because evidence is partial

Mark anything not proven by repository evidence as `Unverified`.

Do not approve if a remaining evidence gap could hide a Critical or Important issue. Use a conditional or request-changes verdict until the gap is fixed, deferred with owner/date when an external tracker exists, or explicitly accepted by the caller/supervisor in local workflow.

### Step 7: Verdict Gate

🔴 **CHECKPOINT · Verdict:** Stop before approving. The verdict must match the worst unresolved finding and the strength of the verification evidence.

| Verdict | Use when | Hard blockers |
|---|---|---|
| **Approve** | No Critical or Important issues remain, verification is fresh, and evidence covers the change | Any unresolved Critical/Important finding, unverified risky behavior, or missing required test |
| **Conditional** | Remaining gaps are low risk and explicitly accepted or deferred with owner/date | Security/privacy risk, data loss risk, public API break, failed required check, or unclear ownership |
| **Request changes** | The change is incorrect, unsafe, unverified, too broad, or incompatible with project rules | N/A — this is the safe verdict for unresolved blockers |

**Failure escalation:**

| Trigger | First action | If still unresolved |
|---|---|---|
| Diff is too large to review confidently | Return the exact decomposition/evidence need to ROSE | Do not recommend approval from partial evidence |
| Required verification is missing or stale | Return the exact targeted-check need to ROSE | Recommend Conditional only with explicit caller acceptance; otherwise Request changes |
| Security, privacy, migration, or rollout risk appears | Return one named specialist/evidence gap to ROSE | Do not recommend approval until the risk is resolved or formally accepted |
| Reviewer and author disagree on a blocker | Re-anchor on facts, spec, tests, and project rules | Return both positions and evidence to ROSE/user; do not rubber-stamp |

## Optional Independent Perspective

Only ROSE may select an independent reviewer when a concrete capability/evidence gap passes the delegation gate. This skill does not dispatch or create a multi-model sequence.

## Dead Code Hygiene

When dead-code risk is relevant to the requested review scope, check for orphaned code:

1. Identify code that is now unreachable or unused
2. List it explicitly
3. Return task-related removal candidates to ROSE; this review skill neither deletes them nor creates a separate deletion question

Do not expand the review into adjacent cleanup. ROSE decides whether a reported removal is already in scope or needs a material scope decision.

```
DEAD CODE IDENTIFIED:
- formatLegacyDate() in src/utils/date.ts — replaced by formatDate()
- OldTaskCard component in src/components/ — replaced by TaskCard
- LEGACY_API_URL constant in src/config.ts — no remaining references
→ Removal disposition: return to ROSE
```

## Review Speed

Return one bounded pass promptly. This skill does not manage review-service SLAs or require multiple rounds; any later review is a fresh ROSE/user decision based on changed evidence.

## Handling Disagreements

When resolving review disputes, apply this hierarchy:

1. **Technical facts and data** override opinions and preferences
2. **Style guides** are the absolute authority on style matters
3. **Software design** must be evaluated on engineering principles, not personal preference
4. **Codebase consistency** is acceptable if it doesn't degrade overall health

Do not hide a current blocker behind “clean it up later.” Report out-of-scope findings and their risk without requiring a new tracker; ROSE/user owns disposition.

## Honesty in Review

When reviewing code — whether written by you, another agent, or a human:

- **Don't rubber-stamp.** "LGTM" without evidence of review helps no one.
- **Don't soften real issues.** "This might be a minor concern" when it's a bug that will hit production is dishonest.
- **Quantify problems when possible.** "This N+1 query will add ~50ms per item in the list" is better than "this could be slow."
- **Push back on approaches with clear problems.** Sycophancy is a failure mode in reviews. If the implementation has issues, say so directly and propose alternatives.
- **Accept override gracefully.** If the author has full context and disagrees, defer to their judgment. Comment on code, not people — reframe personal critiques to focus on the code itself.

## Dependency Discipline

Part of code review is dependency review:

**Before adding any dependency:**
1. Does the existing stack solve this? (Often it does.)
2. How large is the dependency? (Check bundle impact.)
3. Is it actively maintained? (Check last commit, open issues.)
4. Does current approved evidence show known vulnerabilities? Do not run a network-capable audit automatically.
5. What's the license? (Must be compatible with the project.)

**Rule:** Prefer standard library and existing utilities over new dependencies. Every dependency is a liability.

## The Review Checklist

```markdown
## Review: [PR/Change title]

### Context
- [ ] I understand what this change does and why

### Correctness
- [ ] Change matches spec/task requirements
- [ ] Edge cases handled
- [ ] Error paths handled
- [ ] Tests cover the change adequately

### Readability
- [ ] Names are clear and consistent
- [ ] Logic is straightforward
- [ ] No unnecessary complexity

### Architecture
- [ ] Follows existing patterns
- [ ] No unnecessary coupling or dependencies
- [ ] Appropriate abstraction level

### Security
- [ ] No secrets in code
- [ ] Input validated at boundaries
- [ ] No injection vulnerabilities
- [ ] Auth checks in place
- [ ] External data sources treated as untrusted

### Performance
- [ ] No N+1 patterns
- [ ] No unbounded operations
- [ ] Pagination on list endpoints

### Verification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Manual verification done (if applicable)

### Stress-Test Notes
- [ ] Remaining evidence gaps are listed
- [ ] Unverified assumptions are marked `Unverified`
- [ ] Any needed specialist pass is named

### Verdict
- [ ] **Approve** — Reviewed evidence supports approval; ROSE/user decides merge
- [ ] **Conditional** — Remaining evidence gaps are accepted or deferred with owner/date when available, or with explicit caller/supervisor acceptance in local workflow
- [ ] **Request changes** — Issues must be addressed
- [ ] Verdict matches the worst unresolved finding from the Verdict Gate
```
## See Also

- Return a concrete security or performance specialist need to ROSE rather than invoking another skill.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It works, that's good enough" | Working code that's unreadable, insecure, or architecturally wrong creates debt that compounds. |
| "I wrote it, so I know it's correct" | Authors can be blind to their own assumptions. When this review is selected, anchor it in independent evidence rather than confidence. |
| "We'll clean it up later" | Do not hide a current blocker. This review is a bounded evidence pass, not the merge or completion gate. |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less. It's confident and plausible, even when wrong. |
| "The tests pass, so it's good" | Tests are necessary but not sufficient. They don't catch architecture problems, security issues, or readability concerns. |

## Red Flags

- Explicitly requested review omitted from the claimed evidence
- Review that only checks if tests pass (ignoring other axes)
- "LGTM" without evidence of actual review
- Security-sensitive changes without security-focused review
- Large PRs that are "too big to review properly" (split them)
- No regression tests with bug fix PRs
- Review comments without severity labels — makes it unclear what's required vs optional
- Accepting "I'll fix it later" — it never happens
- Approving despite unresolved Critical/Important findings or stale verification
- Using Conditional to bypass security, privacy, migration, rollout, or data-loss blockers

## Verification

After the bounded review is complete:

- [ ] All Critical issues are resolved
- [ ] All Important issues are resolved or explicitly deferred with justification
- [ ] Fresh evidence supports only the reviewed claims
- [ ] The canonical owner selects any required test/build check
- [ ] Remaining scope and `Unverified` risks are documented
