## ADDED Requirements

### Requirement: Top-level scheduling produces content-free interval evidence
The existing top-level scheduler SHALL record bounded `scheduledAt`, `startedAt`, `firstActivityAt`, and `completedAt` evidence for each task turn without recording task text, prompts, paths, tool arguments, outputs, or raw session content. Timestamps use the runtime wall clock; `firstActivityAt` is absent when a turn settles before observable activity; cancellation still records `completedAt` and the terminal outcome. Evidence retention follows the existing task-journal retention policy. This observation SHALL NOT change capacity, FIFO ordering, or nested synchronous/depth-bounded behavior.

#### Scenario: Three independent top-level tasks
- **WHEN** three independent top-level tasks run under available scheduler capacity
- **THEN** their recorded run intervals can demonstrate overlap from actual start/activity/completion timestamps

#### Scenario: Nested task
- **WHEN** a nested task starts under its inherited permit
- **THEN** it remains synchronous/sequential and no nested-parallel behavior is introduced

### Requirement: Existing invalid Formal Board pairs fail before allocation
A formal dispatch encountering an existing invalid `formal-task-board.md`/`progress.txt` pair SHALL return `EXISTING_PAIR_INVALID` with bounded underlying diagnostics before Agent, job, turn, scheduler enqueue, workspace lease/acquisition, file, or Board mutation occurs. It SHALL NOT downgrade invalidity to warning, repair it automatically, or bypass validation.

#### Scenario: Invalid existing pair
- **WHEN** formal root validation finds a complete pair whose board validation fails
- **THEN** zero Agents start, no Agent/job/turn journal event or scheduler enqueue occurs, the owned files remain byte-identical, and no workspace is acquired
