## Purpose

Provide lightweight, framework-independent task continuity through a current action list and concise progress history. Users and models can resume multi-step work without duplicating formal scope definitions, reconstructing runtime state, or treating notes as authorization or proof of completion.

## ADDED Requirements

### Requirement: Conditional mandatory continuity
The orchestrator SHALL maintain todo.md and progress.txt for work containing multiple trackable actions, delegation, dependencies, blockers, or cross-turn continuation, and when explicitly requested. It MUST create missing files before substantive authorized execution once the task and permitted destination are resolved. Simple questions and single-step work MUST NOT require these files unless the user explicitly requests them. This requirement MUST NOT grant filesystem or implementation permission.

#### Scenario: Ordinary multi-step work
- **WHEN** a writable task requires investigation, an edit, and focused verification without using OpenSpec
- **THEN** the orchestrator creates both files before substantive execution and does not require OpenSpec artifacts or commands

#### Scenario: Simple answer
- **WHEN** the user requests a single factual explanation with no tracked follow-up
- **THEN** no continuity files are required

#### Scenario: Read-only or denied writes
- **WHEN** file writes are forbidden, unavailable, or outside approved scope
- **THEN** the orchestrator presents a concise conversational TODO, reports that persistence was not performed, and does not bypass the restriction or claim files were saved

### Requirement: Stable framework-independent placement
The orchestrator SHALL keep both files in the owning task directory, preferring explicit user placement and existing repository conventions. Without an established task destination it SHALL propose/use repository-local tasks/<task-slug>/ subject to applicable placement and write rules. It MUST reuse the resolved destination on continuation, distinguish unrelated tasks, and never select an OpenSpec change merely because that directory exists.

#### Scenario: Existing formal change
- **WHEN** the user selects work already owned by a change directory
- **THEN** both files stay in that directory without creating a second task directory

#### Scenario: Ordinary task without OpenSpec
- **WHEN** no task destination exists and repository rules permit the default placement
- **THEN** both files are kept together in tasks/<task-slug>/ and no OpenSpec scaffolding is created

#### Scenario: Ambiguous continuation
- **WHEN** multiple task roots could own a continuation and current context does not resolve one
- **THEN** the orchestrator asks one target question before modifying a continuity file

### Requirement: Actionable current TODO
The orchestrator SHALL keep todo.md as an in-place current action list with distinguishable pending, active, blocked, completed, and cancelled work. Actions MUST describe observable outcomes, with additional completion criteria only where the title is insufficient. One current orchestrator action is the normal presentation; genuine independent parallel actions SHALL be represented honestly. Headings, wording, and Markdown layout MUST NOT be machine-validated.

#### Scenario: Start and finish
- **WHEN** an action starts and later its stated outcome is supported
- **THEN** the list reflects active and subsequently completed work, adding a concise evidence reference when needed to support the completion claim

#### Scenario: Failure or worker return
- **WHEN** a check fails or a Worker returns uninspected output
- **THEN** the affected outcome is not marked completed merely because the command ended or the Worker returned

#### Scenario: Blocked and cancelled work
- **WHEN** an action cannot proceed or is removed from current scope
- **THEN** it remains visibly blocked with a reason and next decision, or cancelled with a reason, rather than disappearing or being checked complete

### Requirement: Meaningful progress history
The orchestrator SHALL append concise progress.txt entries only for meaningful outcomes, decisions with useful rationale, verification results and limits, blocker changes, or continuation context. Entries MUST reference relevant actions or evidence rather than copy the full TODO, task tree, raw logs, secrets, or transcripts. Timestamps and event vocabulary MUST remain optional. The orchestrator MUST NOT append no-change entries after every tool call.

#### Scenario: Verification outcome
- **WHEN** a relevant focused check finishes
- **THEN** progress records the bounded result and material limitations with a reference where useful, not a full command transcript

#### Scenario: Routine read
- **WHEN** a tool read produces no meaningful state or decision change
- **THEN** no progress entry is required

#### Scenario: Long history
- **WHEN** history is lengthy during continuation
- **THEN** the orchestrator reads the current TODO and relevant recent or referenced progress entries, without automatically reading or rewriting the entire history

### Requirement: No duplicate authority
When tasks.md or an equivalent accepted plan exists, the orchestrator SHALL reference its task identifiers and expand only current execution actions in todo.md, not copy the full plan. The plan retains scope authority; progress retains useful history; runtime Journal retains Agent/job/turn state. The orchestrator MUST NOT treat either file as acceptance, authorization, a runtime dispatch prerequisite, or proof of completion.

#### Scenario: Formal task execution
- **WHEN** an action implements a defined plan task
- **THEN** the TODO references that task and plan status is updated only when the owning task outcome is actually supported, not when one subordinate action finishes

#### Scenario: Missing or irregular notes
- **WHEN** a continuity file is missing or uses an unusual free-text layout
- **THEN** no runtime parser or Markdown validation gate rejects dispatch or settlement; the orchestrator creates or updates notes when permitted without claiming the missing maintenance already occurred

### Requirement: Update and resume discipline
The orchestrator SHALL update notes at meaningful starts, completions, blocks, accepted scope changes, and before task pause or final response. On resume it SHALL read the selected TODO first, consult relevant progress, and inspect current source or artifacts only as required to validate the next action. Notes MUST NOT renew authorization or make stale evidence current. Unfinished work MUST remain visible at pause; final completion MUST NOT be claimed while relevant work is unresolved.

#### Scenario: Interrupted work
- **WHEN** the user resumes a task with an unfinished action
- **THEN** the orchestrator identifies that action and its blocker or next step from notes, checks still-applicable permissions, and does not repeat already-supported work merely to recreate a log

#### Scenario: User changes scope
- **WHEN** the user requests a material scope change
- **THEN** affected execution stops for the applicable decision process, and notes distinguish proposed work from authorized work

### Requirement: Single writer and legacy preservation
The orchestrator SHALL be the sole writer of its task's todo.md and progress.txt; Workers return evidence rather than edit these files. Existing formal-task-board.md files SHALL remain non-authoritative history. New work SHALL use todo.md without automatically renaming, deleting, or bulk-migrating old files. A resumed legacy task SHALL transfer only currently relevant actions after checking current evidence, preserving the original file.

#### Scenario: Parallel workers
- **WHEN** multiple Workers report results
- **THEN** the orchestrator dispositions those results and updates one list without requiring Workers to race on shared notes

#### Scenario: Legacy board
- **WHEN** a task resumes with an old formal-task-board.md and no todo.md
- **THEN** the orchestrator creates todo.md when permitted from current actionable information without copying runtime protocol fields or interpreting old checks as fresh completion evidence
