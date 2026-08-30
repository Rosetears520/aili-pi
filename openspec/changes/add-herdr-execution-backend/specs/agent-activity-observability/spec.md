## Purpose

Defines unified, white-box activity visibility for persistent agents across both execution backends, including user-level management/inspection commands and the separately restored lightweight `hub` background-coordination surface.

## ADDED Requirements

### Requirement: Unified activity events
The system SHALL expose a unified activity event stream whose events carry a sequence number, timestamp, parent session, agent, job, turn, and run ids, backend kind, driver kind, and a typed payload (run started/ready/stopped/lost, turn started/completed/failed, provider started/streaming, tool started/updated/completed, interaction requested/resolved, run stalled/recovered). Managed runs SHALL source events from the existing session, tool, and provider hooks; Herdr runs SHALL source precise events from the child bridge and auxiliary events from Herdr lifecycle and pane output.

#### Scenario: Same vocabulary across backends
- **WHEN** a managed agent and a Herdr-backed agent run comparable tasks
- **THEN** comparable events appear in the same vocabulary for both, with the backend distinguished on each event

#### Scenario: Auxiliary Herdr events are labeled
- **WHEN** an activity event originates from a Herdr lifecycle observation rather than the child bridge
- **THEN** the event is identifiable as auxiliary rather than precise

### Requirement: Stall and recovery overlay semantics
Activity overlay transitions SHALL be derived from structured event recency: a live run with no valid structured events within the configured window becomes `stalled`, and resumption of events transitions it through `recovered` back to its current activity. Overlay transitions MUST NOT mutate authoritative Job, Turn, or Run lifecycle states.

#### Scenario: Stall never settles work
- **WHEN** a run transitions to `stalled`
- **THEN** its job, turn, and run lifecycle states are unchanged and no permit is released

### Requirement: Consistent display fields
TUI and Web agent views SHALL present, for every agent regardless of backend: alias and selector, backend and driver, model/thinking/speed tier, agent/job/turn/run ids, cwd/workspace/write-scope, current activity with elapsed time, last activity time, pending interaction count, and control mode. Herdr-backed agents SHALL additionally show their surface location and a focus affordance.

#### Scenario: Backend parity in listings
- **WHEN** agents from both backends are listed together
- **THEN** the same base fields are present for all, with surface fields appearing only where a surface exists

### Requirement: User-level management command family
The system SHALL provide user-level commands for backend status and switching, and for per-agent focus, activity, interaction listing, interaction answering, and inspection. A backend switch SHALL display an explicit notice that only new agents are affected (for example `New Agents: herdr` / `Existing Agents: unchanged`). These commands MUST remain user-only. The restored model-facing `hub` MAY coordinate background `sub` jobs through jobs/wait/output/history/send/cancel, but MUST NOT create Agents, select backends, widen permissions, or replace `sub` as the only delegation surface. Focusing a managed agent SHALL report that no external execution surface exists.

#### Scenario: Backend switch notice
- **WHEN** the user switches the backend via command
- **THEN** the UI states the new backend for subsequently created agents and that existing agents are unchanged

#### Scenario: Focus unsupported on managed
- **WHEN** the user focuses a managed agent
- **THEN** the command reports that no external execution surface exists

#### Scenario: No model-facing management surface
- **WHEN** the model attempts to use a management operation through `sub` parameters
- **THEN** the operation is not available, and management remains user-only

### Requirement: Run and prompt inspection
Inspection operations SHALL expose, for a given agent or run: effective model/thinking and their resolution sources, backend resolution source, loadout hash and resume diffs, activity timeline, interactions with resolutions, workspace/write-scope, and output/result hashes. Manual or external input SHALL be marked in the timeline.

#### Scenario: Resume diff is inspectable
- **WHEN** an agent was resumed with a tightened loadout
- **THEN** inspection shows the tightening diff against the frozen loadout

#### Scenario: Manual input is marked
- **WHEN** a Herdr surface received human input during a run
- **THEN** the activity timeline marks the manual input and the control mode reflects it
