---
name: incremental-implementation
description: Implement an accepted change in bounded dependency-ordered increments when the user requests implementation and the scope benefits from multiple coherent slices; do not trigger merely because work touches multiple files, changes behavior, or is over an arbitrary line count.
---

# Incremental Implementation

## Overview

Implement a larger accepted scope in dependency-ordered coherent slices. A slice boundary is for scope and recovery, not an automatic test, review, approval, or commit. Use slice-specific feedback only when its behavior, risk, dependency, or diagnosis requires it; the canonical owner selects the final claim-matched check.

## When to Use

- The user asks to implement an accepted plan/change whose dependencies form multiple coherent slices.
- One bounded ordinary implementation is safer or more traceable as two or more complete increments.
- BUILD has a current package queue and selects this as its primary implementation technique.

**When NOT to use:** A bounded change that ROSE can complete directly in one pass, planning-only work, TDD without implementation authority, review, or a request that lacks accepted scope.

## Canonical loop contract

This skill is one bounded ordinary/BUILD implementation adapter. ROSE/`aili-delivery-flow` owns lifecycle state, package queue, approvals, progress, and verification. Implement the selected complete scope and stop with `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. Do not invoke planning, TDD, Git, context, review, test, security, or another process skill; return one named need to ROSE. Safe local edits/checks proceed without micro-approval, exact risky operations retain their gates, and the canonical verification owner overrides all generic per-slice/full-suite language.

## The Increment Cycle

```
┌──────────────────────────────────────┐
│                                      │
│   Implement ──→ Savepoint ──→ Next  │
│       ▲              │               │
│       └── affected feedback only ────┘
│                                      │
└──────────────────────────────────────┘
```

For each slice:

1. **Implement** a focused complete piece of functionality
2. **Feedback when needed** — run a focused check only when this slice's behavior, risk, dependency, or diagnosis needs it
3. **Verify at the owner boundary** — let the canonical owner select the smallest fresh check for the exact claim
4. **Savepoint** — record progress; commit only when the exact Git action is separately authorized
5. **Move to the next slice** — carry forward, don't restart

Before a non-obvious slice, keep a compact internal boundary: behavior, scope, dependency, and stop condition. Do not turn it into an extra user approval or mandatory test command.

## Slicing Strategies

### Vertical Slices (Preferred)

Build one complete path through the stack:

```
Slice 1: Create a task (DB + API + basic UI)
    → dependency-ready creation path

Slice 2: List tasks (query + API + UI)
    → dependency-ready listing path

Slice 3: Edit a task (update + API + UI)
    → dependency-ready edit path

Slice 4: Delete a task (delete + API + UI + confirmation)
    → accepted CRUD scope complete
```

Each slice delivers working end-to-end functionality.

Do not use horizontal slicing as the default. A slice should produce complete traceable behavior; verification and Git actions remain selected by their canonical owners.

If commits are not explicitly allowed by the user/task contract or project rules, replace the commit with an explicit savepoint report: changed files, verification result, and rollback note. Do not violate a no-commit contract to satisfy this skill.

### Contract-First Slicing

When backend and frontend need to develop in parallel:

```
Slice 0: Define the API contract (types, interfaces, OpenAPI spec)
Slice 1a: Implement backend against the contract + API tests
Slice 1b: Implement frontend against mock data matching the contract
Slice 2: Integrate and test end-to-end
```

### Risk-First Slicing

Tackle the riskiest or most uncertain piece first:

```
Slice 1: Prove the WebSocket connection works (highest risk)
Slice 2: Build real-time task updates on the proven connection
Slice 3: Add offline support and reconnection
```

If Slice 1 fails, you discover it before investing in Slices 2 and 3.

## Implementation Rules

### Rule 0: Simplicity First

Before writing any code, ask: "What is the simplest complete thing that could work?"

After writing code, review it against these checks:
- Can this be clearer without losing required behavior?
- Are these abstractions earning their complexity?
- Would a staff engineer look at this and say "why didn't you just..."?
- Am I building for hypothetical future requirements, or the current task?

```
SIMPLICITY CHECK:
✗ Generic EventBus with middleware pipeline for one notification
✓ Simple function call

✗ Abstract factory pattern for two similar components
✓ Two straightforward components with shared utilities

✗ Config-driven form builder for three forms
✓ Three form components
```

Three similar lines of code is better than a premature abstraction. Implement the naive, obviously-correct version first. Optimize only after the accepted claim has sufficient evidence.

### Rule 0.5: Scope Discipline

Touch only what the task requires.

Do NOT:
- "Clean up" code adjacent to your change
- Refactor imports in files you're not modifying
- Remove comments you don't fully understand
- Add features not in the spec because they "seem useful"
- Modernize syntax in files you're only reading

If you notice something worth improving outside your task scope, note it — don't fix it:

```
NOTICED BUT NOT TOUCHING:
- src/utils/format.ts has an unused import (unrelated to this task)
- The auth middleware could use better error messages (separate task)
→ Record only when useful; do not create tasks or questions unless the user asks or the item blocks current work.
```

### Rule 1: One Thing at a Time

Each increment changes one logical thing. Don't mix concerns:

**Bad:** One increment that adds a new component, refactors an existing one, and updates unrelated build config.

**Good:** Separate logical increments/savepoints with explicit dependencies; commits remain separately authorized Git actions.

Each increment should be small enough to explain as one reversible savepoint: what changed, how it was verified, and what remains out of scope.

### Rule 2: Keep It Compilable

Do not knowingly leave a dependency boundary broken between slices. The canonical verification owner decides whether a focused test, build, typecheck, static inspection, or deferred final check proves that state.

### Rule 3: Accepted Feature Flags for Incomplete Features

Use a feature flag only when the accepted design requires staged exposure; slice boundaries do not create a flag or merge requirement by themselves.

```typescript
// Feature flag for work-in-progress
const ENABLE_TASK_SHARING = process.env.FEATURE_TASK_SHARING === 'true';

if (ENABLE_TASK_SHARING) {
  // New sharing UI
}
```

This can protect staged exposure under the accepted design; it does not authorize merge or deployment.

### Rule 4: Safe Defaults

New code should default to safe, conservative behavior:

```typescript
// Safe: disabled by default, opt-in
export function createTask(data: TaskInput, options?: { notify?: boolean }) {
  const shouldNotify = options?.notify ?? false;
  // ...
}
```

### Rule 5: Rollback-Friendly

Each increment should be independently revertable:

- Additive changes (new files, new functions) are easy to revert
- Modifications to existing code should be focused and traceable
- Database migrations should have corresponding rollback migrations
- Avoid mixing destructive removal and replacement when a safer focused transition is available; exact destructive/Git actions retain their gates

## Working with Agents

When directing an agent to implement incrementally:

```
"Let's implement Task 3 from the plan.

Start with just the database schema change and the API endpoint.
Don't touch the UI yet — we'll do that in the next increment.

After implementing, run only the focused check selected by the canonical
verification owner for this increment's exact claim."
```

Be explicit about what's in scope and what's NOT in scope for each increment.

## Increment Checklist

After each increment, record only applicable evidence:

- [ ] The change does one thing and does it completely
- [ ] Any slice-specific feedback selected by the canonical owner is recorded
- [ ] The accepted behavior is complete enough for the next dependency
- [ ] A lightweight savepoint records changed files and unresolved dependencies; it does not imply verification or commit

## Fallbacks

| Trigger | First action | If still unresolved |
|---|---|---|
| Tests fail after a slice | Stop next-slice work; identify whether failure is from this slice or pre-existing | Revert or narrow the slice; report unrelated failures instead of piling on fixes |
| Working tree is dirty before a slice | Inspect status and separate task-related from unrelated changes | Ask whether to continue, branch/worktree, or pause; do not mix unrelated edits silently |
| Slice grows past the planned behavior/files | Stop and cut scope to a focused independently verifiable complete behavior | Return the oversized remainder to the task queue; do not finish it in the same increment |
| No automated test exists | Decide whether the exact claim needs a focused test or other evidence | Use the lifecycle-selected manual/static check and mark any remaining gap `Unverified` |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Every slice needs its own full check" | Slice boundaries alone trigger no test. Select feedback only where a dependency/risk needs it, then run the final claim-matched check. |
| "It's faster to do it all at once" | Keep dependency boundaries visible so a failure can be localized without turning each boundary into ceremony. |
| "Every slice needs a commit" | Savepoints preserve scope and recovery; commits remain exact user-authorized Git actions. |
| "Every incomplete feature needs a flag" | Add a flag only when staged exposure is accepted; otherwise keep incomplete work unexposed by the project’s existing mechanism. |
| "This refactor is small enough to include" | Refactors mixed with features make both harder to review and debug. Separate them. |

## Red Flags

- Multiple unrelated changes in a single increment
- "Let me just quickly add this too" scope expansion
- Ignoring feedback required by an affected dependency/risk, or inventing per-slice checks with no claim need
- Knowingly leaving a dependency boundary broken without recording the blocker
- Unbounded changes accumulating without a savepoint
- Building abstractions before the third use case demands it
- Touching files outside the task scope "while I'm here"
- Creating new utility files for one-time operations

## Verification

After completing all increments, return to the canonical owner:

- [ ] Complete accepted behavior and changed files are reported
- [ ] Savepoints and unresolved items are recorded without implying verification or commit
- [ ] The owner selects the smallest final claim-matched check and reports any `Unverified` residual
