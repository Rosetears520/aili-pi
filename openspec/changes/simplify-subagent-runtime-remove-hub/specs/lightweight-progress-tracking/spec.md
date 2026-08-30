## ADDED Requirements

### Requirement: Multi-step work keeps free-form progress
AILI SHALL create `progress.txt` at the owning task or OpenSpec change root when multi-step work begins and the file is absent, and SHALL allow concise free-form progress to be appended without a format-validation gate.

#### Scenario: Progress file is initially absent
- **WHEN** multi-step work begins without an existing `progress.txt`
- **THEN** the orchestrator creates `progress.txt`
- **AND** subsequent progress entries may use ordinary human-readable text

#### Scenario: Progress is updated during execution
- **WHEN** the orchestrator records status, evidence, a blocker, or a next action
- **THEN** it appends the information without requiring timestamps, event names, field order, or a fixed grammar
- **AND** malformed prose does not block dispatch, settlement, or completion

### Requirement: Task-board notes are optional and non-authoritative
AILI SHALL treat `formal-task-board.md` as optional human-readable task notes and MUST NOT require or format-validate it for `sub` dispatch, trusted formal dispatch, settlement, or completion.

#### Scenario: No task-board file exists
- **WHEN** work has a valid task identity and no `formal-task-board.md`
- **THEN** dispatch proceeds without creating or parsing that file

#### Scenario: Task-board notes use arbitrary Markdown
- **WHEN** `formal-task-board.md` exists with free-form Markdown
- **THEN** its formatting does not affect runtime execution

### Requirement: Runtime state remains machine-owned
AILI SHALL use the persistent Agent Journal for Agent, job, turn, and settlement state, and SHALL derive protected continuity paths from a safe change identifier without reading Board or progress contents.

#### Scenario: Trusted formal dispatch protects continuity files
- **WHEN** trusted formal dispatch supplies a safe OpenSpec change identifier
- **THEN** the runtime protects that change's `formal-task-board.md` and `progress.txt` paths from worker writes
- **AND** it does not read or validate either file before allocating the Agent

#### Scenario: Unsafe change identifier is supplied
- **WHEN** trusted formal dispatch supplies a path-traversal or otherwise unsafe change identifier
- **THEN** the runtime rejects the request before Agent allocation

### Requirement: Canonical workflow bundle retires the Board protocol
AILI Pi SHALL consume the exact released `rose-aili@0.4.8` workflow snapshot and generated Pi bundle, and MUST NOT require or recreate the retired `aili-task-board/v1` schema.

#### Scenario: Workflow bundle loads current protocols
- **WHEN** the runtime loads the pinned `rose-aili@0.4.8` generated Pi bundle
- **THEN** it validates and exposes the Agent-selection and package-envelope schemas
- **AND** it does not require a formal-task-board protocol artifact

#### Scenario: Shared workflow doctor inspects continuity guidance
- **WHEN** doctor checks an installed `rose-aili@0.4.8` profile
- **THEN** it validates the Agent-selection protocol and the hash-bound formal-notes reference
- **AND** it treats free-form progress guidance as documentation rather than a second machine protocol
