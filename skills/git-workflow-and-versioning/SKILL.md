---
name: git-workflow-and-versioning
description: Handle an explicit Git intent such as branch/worktree setup, commit organization, history archaeology, conflict resolution, PR preparation, or versioning; do not trigger as a process skill for every code or file change.
---

# Git Workflow and Versioning

## Overview

Git is your safety net. Treat commits as save points, branches as sandboxes, and history as documentation. With AI agents generating code at high speed, disciplined version control is the mechanism that keeps changes manageable, reviewable, and reversible.

## When to Use

Use when the user asks for a Git operation or artifact, or when a concrete branch/worktree/conflict/history decision is the current primary task. Ordinary implementation follows the canonical global Git safety rules directly without loading this workflow.

Near misses: checking status/diff as routine evidence, editing several files, making a savepoint note, or finishing implementation does not select this skill by itself.

ROSE/`aili-delivery-flow` owns lifecycle state, safe-local execution, approvals, and verification. This skill owns one bounded Git loop and returns `complete`, `need-user`, `need-evidence`, `material-delta`, `blocked`, or `Unverified`. It does not invoke planning, implementation, review, release, or another process skill. Exact commit/push/merge/rebase/history/worktree/A33 approvals and canonical claim-matched verification override generic advice below.

## Branch and Savepoint Policy

For any task that writes files, do not work directly on `main`, `master`, or `trunk`. Treat protected trunks as integration targets, not AI editing areas.

Before editing:
1. Run `git status --short --branch`.
2. Identify the current branch.
3. If the current branch is `main`, `master`, or `trunk`, create and switch to a task branch before editing.
4. If the current branch is a non-main branch but is unrelated to the current task, create and switch to a new task branch.
5. If the working tree contains unrelated uncommitted changes, stop and ask the user how to proceed before writing files. Offer: continue in the current working tree and accept mixing risk, create/use a separate worktree, or pause while the user commits/stashes/cleans the existing changes. Do not choose a separate worktree automatically unless the user already approved that workflow in the current task.

🛑 Hard gates:

| Situation | Required action |
|---|---|
| On `main`, `master`, or `trunk` for a write task | Do not edit until on an approved task branch/worktree. |
| User/task forbids commits | Do not create savepoint commits; still inspect diff and verify. |
| Push, merge, PR creation, branch deletion, or worktree removal requested | Require explicit user approval for that exact action. |
| Force-push, reset hard, clean, skipped hooks, or shared-history rewrite | Require explicit approval and report safer alternatives first. |
| Unrelated dirty workspace | Stop and ask; do not auto-stash, auto-clean, or auto-worktree. |

Branch naming:
- `feature/<short-slug>` for features
- `fix/<short-slug>` for bug fixes
- `refactor/<short-slug>` for refactors
- `docs/<short-slug>` for documentation
- `chore/<short-slug>` for tooling/configuration

Small changes:
- Use a task branch in the current working tree.
- Create the branch with `git switch -c <type>/<task-slug>` so the working tree actually moves to the new branch.
- Create task-scoped savepoint commits only when current task/project rules explicitly allow verified commits; otherwise keep a reviewed savepoint report.

Large or risky changes:
- Use a task branch in a separate git worktree.
- This includes multi-file refactors, migrations, experiments, parallel subagent work, multi-session work, or any request to avoid polluting the current branch. For dirty workspaces with unrelated changes, ask the user first and follow their choice.
- Prefer a sibling directory: `../<repo>-<task-slug>`.
- Use project-local `.worktrees/<task-slug>` only if `.worktrees/` is ignored in that downstream project; do not add `.worktrees/` to this workflow repository just because another project uses worktrees.
- Create the isolated branch and checkout together with `git worktree add -b <type>/<task-slug> ../<repo>-<task-slug> <base-branch>`.

Savepoint commits:
- After each complete, verified increment, create a task-scoped savepoint commit only when current task/project rules explicitly allow verified commits.
- A commit should represent one logical change.
- Run the most relevant focused verification before committing.
- Inspect `git diff` and `git diff --staged` before committing.
- Do not commit secrets, unrelated edits, generated output, or broken intermediate states.
- `wip:` checkpoints are allowed only when the current task explicitly approves a private unverified checkpoint on a private task branch; they must not be merged as-is.

Task-end branch/worktree hygiene for non-trivial changes:
1. Run `git status --short --branch` in the target repository and inspect the relevant diff.
2. Classify dirty paths as task-scoped, unrelated/pre-existing, generated/ignored, scratch, or unknown.
3. Remove only safe task-owned, non-user-visible scratch artifacts created by the current task.
4. Propose cleanup for remaining residue, and ask explicit approval before push, destructive clean/reset, branch deletion, worktree removal, OpenSpec archive, stashing unrelated changes, or deleting user-visible artifacts.
5. If savepoint commits are not explicitly allowed by current task/project rules, ask once with the cleanup package instead of committing proactively.

Never:
- commit on `main`, `master`, or `trunk`
- push without explicit user approval
- merge without explicit user approval
- rebase shared history without explicit user approval
- run destructive git commands without explicit user approval
- delete branches, remove worktrees, archive OpenSpec changes, stash unrelated changes, or delete user-visible artifacts without explicit approval
- stage unrelated files or unreviewed generated output

## Commit Architecture Mode

Use this mode when organizing unstaged or staged changes, planning commits, drafting commit messages, or preparing a PR.

Rules:

- Inspect `git status --short --branch`, `git diff`, and `git diff --staged` before proposing commits.
- Group commits by responsibility, not by file count alone.
- Keep these concerns separate when possible:
  - agent prompt changes
  - skill workflow changes
  - script/install changes
  - docs/readme changes
  - generated artifacts
  - test files
- Generated interview packets and generated test plans should not be mixed with unrelated prompt or script changes unless the user explicitly wants one combined commit.
- Propose commit groups first; only commit when the user explicitly asks or task rules explicitly allow savepoint commits.
- Match the repository's existing commit language and style after inspecting recent commits.

## History Archaeology Mode

Use this mode when the user asks:

- who changed this
- when this behavior was introduced
- which commit added or removed a file, symbol, command, route, or rule
- whether a bug is already fixed in history

Workflow:

1. Use `git log`, `git show`, `git blame`, and targeted path history.
2. Report commit SHA, date, author if available, files touched, and why the commit is relevant.
3. Do not infer intent from commit titles alone; inspect the diff.
4. Do not modify files.

## PR Preparation Mode

Use this mode when preparing a change for review or PR.

Rules:

- Prefer isolated worktree for risky or multi-file changes.
- Validate locally before recommending push.
- Draft PR title and body only after inspecting the final diff.
- Do not push, create PR, merge, delete branch, or clean up worktree without explicit user approval.
- Return any concrete unresolved review risk to ROSE; do not automatically invoke a review pipeline because a PR is being prepared.

Decision matrix:

| Task type | Branch | Worktree | Savepoint commit |
|---|---:|---:|---:|
| Read-only explanation or review | No | No | No |
| Small docs change | Required | Usually no | Only when current task/project rules allow |
| Small code fix | Required | Usually no | Only when current task/project rules allow |
| Multi-file feature | Required | Recommended | Per complete verified slice when allowed |
| Large refactor or migration | Required | Required | Per complete verified phase when allowed |
| Parallel subagent or multi-approach exploration | Required | Required | Independently per approach when allowed |
| Current workspace has unrelated changes | Required | Required | Avoid mixing existing edits; ask first |
| User says not to pollute the current branch | Required | Usually required | Only in isolated branch/worktree and when allowed |

## Core Principles

### Trunk-Based Development (Recommended)

Keep `main` always deployable. Work in short-lived feature branches that merge back within 1-3 days. Long-lived development branches are hidden costs — they diverge, create merge conflicts, and delay integration. DORA research consistently shows trunk-based development correlates with high-performing engineering teams.

```
main ──●──●──●──●──●──●──●──●──●──  (always deployable)
        ╲      ╱  ╲    ╱
         ●──●─╱    ●──╱    ← short-lived feature branches (1-3 days)
```

This is the recommended default. Teams using gitflow or long-lived branches can adapt the principles (atomic commits, small changes, descriptive messages) to their branching model — the commit discipline matters more than the specific branching strategy.

- **Dev branches are costs.** Every day a branch lives, it accumulates merge risk.
- **Release branches are acceptable.** When you need to stabilize a release while main moves forward.
- **Feature flags > long branches.** Prefer deploying incomplete work behind flags rather than keeping it on a branch for weeks.

### 1. Use Savepoints When Allowed

When current task/project rules explicitly allow task-scoped verified commits, each successful increment can get its own savepoint commit. Otherwise, record the verified increment in the cleanup package and ask once instead of committing proactively. Don't accumulate large unreviewed changes.

```
Work pattern:
  Implement slice → Test → Verify → Commit if allowed / report savepoint → Next slice

Not this:
  Implement everything → Hope it works → Giant commit
```

Allowed commits are save points. If the next change breaks something, use an approved recovery path to return to the last known-good state. When commits are not allowed, preserve the verified state in the cleanup package and ask for the next git action.

### 2. Atomic Commits

Each commit does one logical thing:

```
# Good: Each commit is self-contained
git log --oneline
a1b2c3d Add task creation endpoint with validation
d4e5f6g Add task creation form component
h7i8j9k Connect form to API and add loading state
m1n2o3p Add task creation tests (unit + integration)

# Bad: Everything mixed together
git log --oneline
x1y2z3a Add task feature, fix sidebar, update deps, refactor utils
```

### 3. Descriptive Messages

Commit messages explain the *why*, not just the *what*:

```
# Good: Explains intent
feat: add email validation to registration endpoint

Prevents invalid email formats from reaching the database.
Uses Zod schema validation at the route handler level,
consistent with existing validation patterns in auth.ts.

# Bad: Describes what's obvious from the diff
update auth.ts
```

**Format:**
```
<type>: <short description>

<optional body explaining why, not what>
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `test` — Adding or updating tests
- `docs` — Documentation only
- `chore` — Tooling, dependencies, config

### 4. Keep Concerns Separate

Don't combine formatting changes with behavior changes. Don't combine refactors with features. Each type of change should be a separate commit — and ideally a separate PR:

```
# Good: Separate concerns
git commit -m "refactor: extract validation logic to shared utility"
git commit -m "feat: add phone number validation to registration"

# Bad: Mixed concerns
git commit -m "refactor validation and add phone number field"
```

**Separate refactoring from feature work.** A refactoring change and a feature change are two different changes — submit them separately. This makes each change easier to review, revert, and understand in history. Small cleanups (renaming a variable) can be included in a feature commit at reviewer discretion.

### 5. Size Your Changes

Prefer coherent, reviewable commits over artificial line-count targets. Changes over ~1000 lines should be split by behavior, risk, or ownership. See the splitting strategies in `code-review-and-quality` for how to break down large changes.

```
Focused complete change → Easy to review, easy to revert
Single logical change    → Acceptable when scoped and verified
Oversized mixed change   → Split into smaller changes
```

## Branching Strategy

Branching is mandatory for write tasks. `git branch <name>` only creates a branch head; it does not switch the working tree. Use `git switch -c <branch>` for small changes, or `git worktree add -b <branch> <path> <base>` for isolated large work.

### Feature Branches

```
main (always deployable)
  │
  ├── feature/task-creation    ← One feature per branch
  ├── feature/user-settings    ← Parallel work
  └── fix/duplicate-tasks      ← Bug fixes
```

- Branch from `main` (or the team's default branch) before editing
- Keep branches short-lived (merge within 1-3 days) — long-lived branches are hidden costs
- Delete branches after merge only with explicit user approval
- Prefer feature flags over long-lived branches for incomplete features

### Branch Naming

```
feature/<short-description>   → feature/task-creation
fix/<short-description>       → fix/duplicate-tasks
docs/<short-description>      → docs/api-examples
chore/<short-description>     → chore/update-deps
refactor/<short-description>  → refactor/auth-module
```

## Working with Worktrees

### A33 session-root attached repositories

When the active contract selects `a33-attached-shared-trust-domain`, this section overrides the generic sibling-worktree examples below.

- The Git repository where the user started OpenCode is the host. Do not rank, move, broadly scan for, or auto-select another host.
- Every attachment destination is exactly `<session-root>/.worktrees/<repo_key>/<worktree_key>`. Both keys must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`; reserved/path-like/control values and all path, key, branch, or worktree collisions block without guessing, suffixing, forcing, `-B`, orphan creation, remote guessing, or implicit ref selection.
- Require the exact prospective destination ignored through root `/.worktrees/`, with no re-inclusion or tracked destination. Missing ignore admission blocks and requires an explicit user-owned host ignore change.
- Reject tracked `.gitmodules`, mode-160000 gitlinks, source/superproject relations, malformed submodule topology, and ambiguous symlink/junction/mount/path escape.
- PREPARE describes operations only. Every add binds exact source/destination/keys/branch/base-ref, `branch_mode:existing|create`, source `reflog_policy:enabled|disabled`, operation class, expiry, and accepted trusted-code risk under one fresh approval. Every later non-force remove requires a distinct fresh approval after complete deletion inventory.
- Existing branch mode creates no ref/reflog. Create mode creates the exact branch ref and creates the exact branch reflog only when the bound source policy is enabled. Remove preserves branch ref/reflog. Common-dir identity and every unrelated/prunable entry/ref/reflog/config/hook/worktree record remain unchanged.
- Only ROSE owns exact add/non-force-remove. Managed subagents remain external-denied and non-delegating. Prune, move, repair, lock/unlock, force removal, clean/reset, merge/rebase, commit/push, branch deletion, auto-integration, and real-repository cleanup are excluded unless separately authorized by another explicit contract.
- Host and attachments are one trusted same-owner/same-sensitivity mutually readable/writable domain. Path/cwd is coordination, not hard isolation. Trusted hooks/config/filters/tests can run with user privileges and ambient network; there is no sandbox, DLP, network isolation, universal TOCTOU, or arbitrary-process-containment guarantee. Different repositories need not share a common-dir.

Record exact no-digest `A33Identity` host/source/target objects and compare typed fields, sorted canonical repository-relative file arrays, and explicit before/after admin deltas directly. Re-read target rules at each operation/dispatch boundary; they may narrow but never broaden, and same-level conflicts block. One lane targets one declared repository and writes artifacts there. All declared result fields are present; JSON `null` represents absent/inapplicable data, except observed REMOVE approval `trusted_code_risk:not_applicable`.

For parallel AI agent work, use git worktrees to run multiple branches simultaneously:

```bash
# Create and checkout feature branches in separate worktrees
git worktree add -b feature/task-creation ../project-task-creation main
git worktree add -b feature/user-settings ../project-user-settings main

# Each worktree is a separate directory with its own branch
# Agents can work in parallel without interfering
ls ../
  project/              ← main branch
  project-task-creation/    ← task-creation branch
  project-user-settings/    ← user-settings branch

# After approved merge, clean up the worktree only with user approval
git worktree remove ../project-task-creation
```

Benefits:
- Multiple agents can work on different features simultaneously
- No branch switching needed (each directory has its own branch)
- If one experiment fails, abandon it until cleanup is approved; do not remove worktrees without approval
- Working directories are separated until explicitly merged; this is not process, permission, or hard repository isolation

## The Save Point Pattern

```
Agent starts work
    │
    ├── Makes a change
    │   ├── Test passes? → Commit if allowed; otherwise note in cleanup package → Continue
    │   └── Test fails? → Revert to last commit → Investigate
    │
    ├── Makes another change
    │   ├── Test passes? → Commit if allowed; otherwise note in cleanup package → Continue
    │   └── Test fails? → Revert to last commit → Investigate
    │
    └── Feature complete → All commits form a clean history
```

This pattern means you never lose more than one increment of work. If an agent goes off the rails, return to the last verified save point using an approved recovery path; destructive commands such as `git reset --hard` still require explicit user approval.

## Change Summaries

After any modification, provide a structured summary. This makes review easier, documents scope discipline, and surfaces unintended changes:

```
CHANGES MADE:
- src/routes/tasks.ts: Added validation middleware to POST endpoint
- src/lib/validation.ts: Added TaskCreateSchema using Zod

THINGS I DIDN'T TOUCH (intentionally):
- src/routes/auth.ts: Has similar validation gap but out of scope
- src/middleware/error.ts: Error format could be improved (separate task)

POTENTIAL CONCERNS:
- The Zod schema is strict — rejects extra fields. Confirm this is desired.
- Added zod as a dependency (72KB gzipped) — already in package.json
```

This pattern catches wrong assumptions early and gives reviewers a clear map of the change. The "DIDN'T TOUCH" section is especially important — it shows you exercised scope discipline and didn't go on an unsolicited renovation.

## Pre-Commit Hygiene

Before every commit:

```bash
# 1. Check what you're about to commit
git diff --staged

# 2. Ensure no secrets
git diff --staged | grep -i "password\|secret\|api_key\|token"

# 3. Discover and run the most relevant focused project command
# Prefer AGENTS.md, README, Makefile, package scripts, pyproject, Cargo.toml,
# or CI config over generic npm examples.
```

If the project documents exact commands, use those commands. If no command is documented, state the discovery path and run the most relevant focused verification available before committing.

Automate checks with project-approved hooks only; do not add hook tooling or dependencies unless the task explicitly asks:

```json
// package.json (using lint-staged + husky)
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

## Handling Generated Files

- **Commit generated files** only if the project expects them (e.g., `package-lock.json`, Prisma migrations)
- **Don't commit** build output (`dist/`, `.next/`), environment files (`.env`), or IDE config (`.vscode/settings.json` unless shared)
- **Have a `.gitignore`** that covers: `node_modules/`, `dist/`, `.env`, `.env.local`, `*.pem`

## Using Git for Debugging

```bash
# Find which commit introduced a bug
git bisect start
git bisect bad HEAD
git bisect good <known-good-commit>
# Git checkouts midpoints; run your test at each to narrow down

# View what changed recently
git log --oneline -20
git diff HEAD~5..HEAD -- src/

# Find who last changed a specific line
git blame src/services/task.ts

# Search commit messages for a keyword
git log --grep="validation" --oneline
```

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll commit when the feature is done" | One giant commit is impossible to review, debug, or revert. Create verified slice savepoints when allowed; otherwise ask once with the cleanup package. |
| "The message doesn't matter" | Messages are documentation. Future you (and future agents) will need to understand what changed and why. |
| "I'll squash it all later" | Squashing destroys the development narrative. Prefer clean incremental commits from the start. |
| "Branches add overhead" | Short-lived branches are free and prevent conflicting work from colliding. Long-lived branches are the problem — merge within 1-3 days. |
| "I'll split this change later" | Large changes are harder to review, riskier to deploy, and harder to revert. Split before submitting, not after. |
| "I don't need a .gitignore" | Until `.env` with production secrets gets committed. Set it up immediately. |

## Red Flags

- Large uncommitted changes accumulating
- Editing directly on `main`, `master`, or `trunk`
- Push, merge, PR, or branch cleanup without explicit approval
- Using `git branch <name>` and assuming the working tree switched branches
- Commit messages like "fix", "update", "misc"
- Formatting changes mixed with behavior changes
- No `.gitignore` in the project
- Committing `node_modules/`, `.env`, or build artifacts
- Long-lived branches that diverge significantly from main
- Force-pushing to shared branches

## Verification

For every commit:

- [ ] Commit does one logical thing
- [ ] Message explains the why, follows type conventions
- [ ] Tests pass before committing
- [ ] No secrets in the diff
- [ ] No formatting-only changes mixed with behavior changes
- [ ] `.gitignore` covers standard exclusions
