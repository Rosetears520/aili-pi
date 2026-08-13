## ADDED Requirements

### Requirement: Complete safe Worktree capability
The system SHALL provide Worktree status, add, switch, remove, prune, configure, project grouping, and session-replacement flows through retained important TUI entry points, an AILI Runtime/API service, and corresponding Web UI behavior.

#### Scenario: Linked worktrees group under one project
- **WHEN** sessions belong to different linked worktrees of the same repository
- **THEN** TUI and Web can represent their shared repository identity while preserving each exact worktree path and branch

### Requirement: Exact preflight and revalidation
Every Worktree mutation SHALL use canonical allowed-root checks, argv-safe Git execution, repository-scoped serialization, exact initial preflight, and immediate revalidation of repository, target, active-session, and persistent-Agent state before mutation.

#### Scenario: Preconditions drift after preview
- **WHEN** repository status, target identity, active sessions, or Agent ownership changes after confirmation but before execution
- **THEN** the operation aborts and reports the changed precondition without mutating the Worktree

### Requirement: No force removal or branch deletion
The system MUST NOT expose or execute forced Worktree removal or branch deletion as part of this capability. Dirty, active, main, unknown, or otherwise unsafe targets SHALL fail closed.

#### Scenario: Dirty Worktree removal is refused
- **WHEN** a user requests removal of a Worktree containing modified or untracked files
- **THEN** the operation is rejected without offering a force retry

#### Scenario: Main Worktree cannot be removed
- **WHEN** a user targets the repository's main Worktree
- **THEN** removal is rejected before invoking Git

### Requirement: Worktree session transition is explicit
Switching or removing a Worktree that affects the current session SHALL use an explicit session-replacement or safe-transition flow and SHALL NOT silently move a live session to another cwd.

#### Scenario: Active session blocks unsafe removal
- **WHEN** a Worktree is still targeted by an active Pi session or persistent Agent
- **THEN** removal is denied until the owning runtime is safely released or transitioned

### Requirement: First-release Worktree parity
The locked upstream inventory SHALL determine the exact important TUI command names and behavior retained during authorized BUILD. Missing required TUI, Runtime/API, or Web behavior SHALL block first-release readiness.

#### Scenario: Inventory item is missing
- **WHEN** convergence against the locked Worktree source identifies an accepted important behavior without all required layers
- **THEN** the release candidate remains incomplete
