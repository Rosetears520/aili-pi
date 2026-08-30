## Purpose

Defines a single authority that records, routes, and resolves every decision point — questions, permissions, model overrides, and workspace conflicts — raised by the parent, children, or the runtime, across both execution backends.

## ADDED Requirements

### Requirement: Single interaction authority
All question, permission, model-override, workspace-conflict, and confirmation decision points SHALL be recorded as broker-owned interaction records with a type, a status lifecycle (`pending → answered | approved | denied | cancelled | expired`), originating ids (agent/job/turn/run where applicable), prompt and options, and resolution provenance (who resolved and when). Components MUST NOT maintain independent parallel interaction state machines; the existing questionnaire UI becomes a renderer of broker records rather than a separate authority.

#### Scenario: One record per decision point
- **WHEN** a child requests a tool approval and asks a question in the same turn
- **THEN** two distinct interaction records exist, each independently resolvable

#### Scenario: Questionnaire renders broker state
- **WHEN** the user answers a child question through the TUI or Web questionnaire UI
- **THEN** the answer resolves the corresponding broker record and is delivered back to the requesting run

### Requirement: Child-to-parent-to-user routing
An interaction raised by a child SHALL be answerable first by the parent agent when it can decide from context; otherwise it SHALL be rendered to the user. Resolutions SHALL be routed back to the requesting child run, resuming its suspended turn.

#### Scenario: Parent answers directly
- **WHEN** the parent agent can answer a child question from its own context
- **THEN** the interaction resolves without prompting the user

#### Scenario: Escalation to the user
- **WHEN** the parent cannot answer an interaction
- **THEN** the user is prompted through a questionnaire renderer and the answer returns to the child

### Requirement: Scoped suspension
A pending interaction SHALL suspend only its own job and run; sibling agents and unrelated jobs MUST continue running. Pending interactions SHALL block the requesting child's auto-exit.

#### Scenario: Siblings unaffected
- **WHEN** one agent awaits an interaction answer
- **THEN** other agents keep running

### Requirement: Fail-closed resolution
If the parent and all user renderers are unavailable, or an interaction exceeds its expiry, the broker SHALL resolve it as denied or expired — never approved. Permission escalation MUST NOT be auto-approved under any condition.

#### Scenario: Parent lost with pending permission
- **WHEN** the parent process is gone and a child permission request is pending
- **THEN** the interaction resolves as denied or expired, never approved

### Requirement: Herdr blocked as auxiliary signal
Herdr `blocked` observations SHALL be treated as auxiliary detection only. If a blocked display is observed with no corresponding pending interaction record, the run SHALL be flagged `unexpected-blocked` and the user offered a focus affordance; the system MUST NOT answer or dismiss the blocked UI by interpreting terminal text.

#### Scenario: Unexplained blocked state
- **WHEN** Herdr reports a blocked display but the broker holds no pending interaction for that run
- **THEN** the run is flagged `unexpected-blocked` with a focus affordance instead of an automatic answer
