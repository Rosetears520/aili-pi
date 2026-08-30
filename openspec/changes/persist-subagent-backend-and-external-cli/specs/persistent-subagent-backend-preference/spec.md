## Purpose

Allow users to make the managed or Herdr backend their durable default for new AILI subagents while preserving explicit session and trusted-project choices.

## ADDED Requirements

### Requirement: User can set a global backend default
The system SHALL provide a user-only command that sets the global default backend to `managed` or `herdr`, and SHALL persist that choice in the user-level AILI backend settings file without discarding other valid settings in that file.

#### Scenario: Set Herdr globally
- **WHEN** an interactive user runs the global backend command with `herdr`
- **THEN** later newly created Agents resolve to `herdr` unless a higher-precedence session or trusted-project setting applies

#### Scenario: Set managed globally
- **WHEN** an interactive user runs the global backend command with `managed`
- **THEN** later newly created Agents resolve to `managed` unless a higher-precedence session or trusted-project setting applies

### Requirement: Global command applies to the current session's future Agents
A successful global backend command SHALL also change the active Parent session's backend selection for Agents created after the command completes, and SHALL NOT migrate or interrupt an existing Agent.

#### Scenario: New Agent after global switch
- **WHEN** the user changes the global backend while an existing Agent is present and then creates another Agent
- **THEN** the existing Agent retains its creation-time backend and the new Agent uses the newly selected backend

### Requirement: User can clear the global backend default
The system SHALL provide a global clear operation that removes only the global backend selection and the current session's backend override, allowing the ordinary trusted-project or built-in default resolution to apply.

#### Scenario: Clear global default
- **WHEN** an interactive user clears the global backend selection
- **THEN** the global settings file retains unrelated valid settings and a future unoverridden Agent resolves from the trusted project setting or `managed` default

### Requirement: Persistent backend writes fail without partial configuration
The system SHALL reject invalid backend values, malformed existing settings, unavailable write locks, and failed atomic replacement without reporting a successful setting change or partially replacing the existing configuration.

#### Scenario: Concurrent settings write
- **WHEN** the global backend settings lock is unavailable
- **THEN** the command reports the failure and leaves the prior settings bytes unchanged
