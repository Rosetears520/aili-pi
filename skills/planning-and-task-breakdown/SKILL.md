---
name: planning-and-task-breakdown
description: Break a clear scope or accepted specification into ordered tasks/packages when the user explicitly asks for a plan, estimate, dependency order, or task breakdown; do not trigger for ordinary implementation, every multi-step task, speculative parallelism, review, or completion.
---

# Planning and Task Breakdown

## Overview

When explicit planning intent selects this skill, decompose the accepted scope into coherent, dependency-ordered tasks or packages with acceptance criteria and claim-matched evidence targets. Ordinary implementation with a clear next step remains direct.

## When to Use

- The user asks for an implementation plan, task breakdown, estimate, dependency order, or package split.
- A formal DEFINE change has a dependency-ready tasks artifact to produce or revise.
- One accepted scope is too large to execute coherently without an explicit bounded package order.

**When NOT to use:** Ordinary implementation with a clear next step, a spec that already has usable tasks, generic discussion of possible parallelism, review, or verification.

## Canonical loop contract

This skill is one bounded ordinary-plan or DEFINE-tasks adapter. ROSE/`aili-delivery-flow` owns lifecycle state, artifact identity, approvals, progress, dispatch, and verification. Produce one dependency-ordered plan/task set and stop with `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. Do not invoke spec, requirements, research, stress-test, implementation, TDD, review, or another process skill; return one named need to ROSE. No plan review/approval is added beyond material decisions and formal final `test-plan.md` acceptance. Canonical claim-matched verification overrides generic checklist commands.

## The Planning Process

### Step 1: Enter Plan Mode

Before writing any code, operate in read-only mode:

- Read the spec and relevant codebase sections
- Identify existing patterns and conventions
- Map dependencies between components
- Note risks and unknowns

**Do NOT write code during planning.** The output is a plan document, not implementation.

### Step 2: Identify the Dependency Graph

Map what depends on what:

```
Database schema
    │
    ├── API models/types
    │       │
    │       ├── API endpoints
    │       │       │
    │       │       └── Frontend API client
    │       │               │
    │       │               └── UI components
    │       │
    │       └── Validation logic
    │
    └── Seed data / migrations
```

Implementation order follows the dependency graph bottom-up: build foundations first.

### Step 3: Slice Vertically

Instead of building all the database, then all the API, then all the UI — build one complete feature path at a time:

**Bad (horizontal slicing):**
```
Task 1: Build entire database schema
Task 2: Build all API endpoints
Task 3: Build all UI components
Task 4: Connect everything
```

**Good (vertical slicing):**
```
Task 1: User can create an account (schema + API + UI for registration)
Task 2: User can log in (auth schema + API + UI for login)
Task 3: User can create a task (task schema + API + UI for creation)
Task 4: User can view task list (query + API + UI for list view)
```

Each vertical slice delivers working, testable functionality.

### Step 4: Write Tasks

Each task follows this structure:

```markdown
## Task [N]: [Short descriptive title]

**Description:** One paragraph explaining what this task accomplishes.

**Acceptance criteria:**
- [ ] [Specific, testable condition]
- [ ] [Specific, testable condition]

**Verification:**
- [ ] Evidence: [smallest test, build, inspection, or manual observation required by the affected claim; omit or mark N/A when no package-local check is needed]

**Dependencies:** [Task numbers this depends on, or "None"]

**Files likely touched:**
- `src/path/to/file.ts`
- `tests/path/to/test.ts`

**Scope boundary:** [coherent behavior/dependency, owner, risk, reversibility, and likely files]
```

### Prototype Before Committing to a Design

Treat a throwaway prototype as a separately selected implementation action, not an automatic planning step. Use it only when explicitly in scope and it answers a concrete design question.

Good prototype questions:
- Does this state machine feel right?
- Does this data model support the edge cases?
- Which UI direction is clearer?
- Can this integration path work with the current constraints?

Prototype rules:
- Mark prototype code clearly as throwaway.
- Keep it close to the relevant module/page, but visibly non-production.
- Make it runnable with one command.
- Avoid persistence unless the question is specifically about persistence.
- Skip polish, broad abstractions, and production hardening.
- Surface state clearly after each interaction.
- Delete it or absorb the validated decision into real code when done.
- Capture the answer in a commit message, ADR, issue, or nearby note before deleting.

### Issue-Shaped Work Packages

When turning a plan into executable work, structure each unit like an issue even if no issue tracker is used.

Each work package should include:
- Title
- Type: `AFK` or `HITL`
- What to build
- Acceptance criteria
- Verification evidence or explicit N/A
- Blocked by
- User stories or requirements covered
- Likely files
- Explicit non-goals

Prefer AFK slices when safe. Mark HITL when the slice requires product judgment, architecture choice, design review, credentials, environment access, or risky approval.

Do not publish, close, or modify external issues unless the user explicitly asks.

### Step 5: Order and Checkpoint

Arrange tasks so that:

1. Dependencies are satisfied (build foundation first)
2. Each task leaves the system in a working state
3. Verification points are attached only where a claim or dependency needs evidence
4. High-risk tasks are early (fail fast)

Add explicit checkpoints:

```markdown
## Checkpoint: After Tasks 1-3
- [ ] The canonical owner selects the smallest check needed by the affected claim
- [ ] Any material decision or exact risky operation is named before dependent work
```

### Plan Stress Test

Before finalizing, run this direct plan consistency checklist. Use a separate stress-test only on explicit user intent or one named material loophole selected by ROSE.

Check whether:

- any task is still too large
- any task combines independent outcomes that need separate ownership, ordering, or rollback
- dependencies are missing or ordered incorrectly
- shared mutable state requires sequential execution
- parallel work packages would edit overlapping files
- verification steps are too vague
- likely files are missing for risky tasks
- acceptance criteria are not testable
- user judgment is required and should be marked `HITL`
- external credentials, environment access, release approvals, or migrations are required

Fix the plan when evidence supports the fix. Otherwise mark the item as `Open Question` or `Unverified`.

### 🔴 CHECKPOINT / 🛑 STOP: Dispatch and Parallel Work Gate

Before assigning work to another agent, session, issue, or parallel lane, confirm:

- each package has non-overlapping files or an explicit sequential dependency
- shared contracts, schemas, APIs, and acceptance criteria are settled first
- each package has a single owner, expected evidence, and blocked-by field; package boundaries do not mandate a command
- risky work is marked `HITL` when it needs product, architecture, credential, migration, or release approval

If any item is missing, stop and revise the plan; do not dispatch ambiguous or overlapping packages.

### Oversized or Blocked Task Fallbacks

| Trigger | First action | If still unresolved |
|---|---|---|
| Task combines independent behaviors or subsystems | Split by vertical user-visible slice or dependency layer | Mark unresolved scope as `Open Question` and return material decisions to ROSE |
| Acceptance criteria mix unrelated outcomes | Separate behavior, edge cases, and evidence by coherent ownership/dependency | Mark unclear criteria as `Open Question` |
| Likely files overlap across parallel packages | Make the packages sequential or define a shared contract task first | Do not parallelize |
| Task needs credentials, schema migration, release approval, or destructive action | Mark `HITL` and name the required approval/evidence | Block implementation until the human gate is cleared |

## Task Boundary Guidelines

Keep a task intact when its files and actions are necessary for one coherent accepted behavior and can be verified through one clear evidence path. Split when independent outcomes, owners, risky approvals, rollback boundaries, or dependency order would otherwise be hidden.

File count, estimated elapsed time, title wording, or bullet count may help describe a task but never acts as a gate by itself.

## Plan Document Template

```markdown
# Implementation Plan: [Feature/Project Name]

## Overview
[One paragraph summary of what we're building]

## Architecture Decisions
- [Key decision 1 and rationale]
- [Key decision 2 and rationale]

## Task List

### Phase 1: Foundation
- [ ] Task 1: ...
- [ ] Task 2: ...

### Checkpoint: Foundation
- [ ] Savepoint records completed scope, unresolved dependencies, and next task

### Phase 2: Core Features
- [ ] Task 3: ...
- [ ] Task 4: ...

### Checkpoint: Core Features
- [ ] End-to-end flow works

### Phase 3: Polish
- [ ] Task 5: ...
- [ ] Task 6: ...

### Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] Canonical owner has one claim-matched verification path

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk] | [High/Med/Low] | [Strategy] |

## Open Questions
- [Question needing human input]
```

## Parallelization Opportunities

Include this section only when the user requests parallel work or at least two independent units have a clear wall-clock/context benefit. Otherwise omit it and keep the plan direct/serial.

- **Safe to parallelize:** Independent feature slices, tests for already-implemented features, documentation
- **Must be sequential:** Database migrations, shared state changes, dependency chains
- **Needs coordination:** Features that share an API contract (define the contract first, then parallelize)
- **Do not parallelize:** Packages with overlapping edit paths, unsettled public contracts, shared mutable state, or missing verification commands

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll figure it out as I go" | Once planning is explicitly selected, record the dependency and risk decisions needed for execution. |
| "The tasks are obvious" | When planning was explicitly requested, record only the dependency/order details that improve execution; do not manufacture ceremony. |
| "Planning is overhead" | Use planning only when requested or selected for a concrete coordination need; otherwise keep ordinary implementation direct. |
| "I can hold it all in my head" | Context windows are finite. Written plans survive session boundaries and compaction. |

## Red Flags

- Forcing a written task list onto clear ordinary implementation
- Tasks that say "implement the feature" without acceptance criteria
- No claim-matched evidence target where a task's acceptance needs one
- Independent outcomes hidden in one package without an ownership or dependency reason
- No savepoint where a long/resumable plan needs one
- Dependency order isn't considered
- Parallel dispatch before overlap, ownership, and verification are explicit
- Blocked or oversized tasks passed to implementation without a fallback decision

## Verification

Before starting implementation, confirm:

- [ ] Every task has acceptance criteria
- [ ] Each task names only the evidence required by its affected claim, or explicitly needs no package-local check
- [ ] Task dependencies are identified and ordered correctly
- [ ] Task boundaries follow dependencies and coherent behavior rather than an arbitrary file limit
- [ ] Evidence points exist only where the affected claim needs them
- [ ] Material decisions are resolved and formal final `test-plan.md` acceptance remains owned by the lifecycle
