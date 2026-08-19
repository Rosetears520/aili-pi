## ADDED Requirements

### Requirement: MCP entry point in the bottom-left configuration toolbar
The Web UI SHALL add an "MCP" button to the bottom-left configuration toolbar, placed to the right of the Skills button, opening an MCP management panel in the same modal-panel pattern as the Models, Skills, and Plugins panels.

#### Scenario: MCP button opens the management panel
- **WHEN** the user clicks the MCP button
- **THEN** the MCP panel opens over the workbench and closes without side effects, matching the existing config-panel behavior

### Requirement: Truthful per-server status list
The MCP panel SHALL list every configured MCP server from a bounded projection derived from the existing `pi-mcp-adapter` status snapshot, showing per server the name, runtime state (`connected` | `cached` | `failed` | `needs-auth` | `not-connected` | `disabled`), tool count, and disabled flag, plus summary counts. It MUST NOT expose raw server configuration, command arguments, environment variables, credentials, or tokens, and MUST NOT initiate a connection to a lazy or disconnected server merely by displaying it.

#### Scenario: Status reflects the adapter snapshot
- **WHEN** the panel is open and the adapter emits a status snapshot
- **THEN** each server row shows its current state and tool count without exposing configuration secrets

#### Scenario: Lazy servers stay lazy
- **WHEN** the panel lists a not-connected or lazy server
- **THEN** no connection is initiated by rendering the list

### Requirement: Per-server enable and disable through the adapter's persistence
The panel SHALL offer per-server enable and disable toggles that persist exclusively through the existing `pi-mcp-adapter` configuration layer (the same `disabled`-field semantics as the adapter's own `/mcp enable` / `/mcp disable` commands). The panel MUST NOT create a second MCP configuration authority, rewrite server definitions, or store credentials.

#### Scenario: Disabling a server persists and states the effect timing
- **WHEN** the user disables an enabled server
- **THEN** the adapter config layer records the disabled state and the panel indicates honestly when the change takes effect (adapter semantics: apply on reload/session restart), without claiming an immediate live restart

#### Scenario: Enabling honors existing precedence
- **WHEN** the user enables a disabled server
- **THEN** the write follows the adapter's precedence rules (explicit `disabled: false` only when a lower layer is disabled) rather than a parallel flag

### Requirement: Management actions are explicit user actions
Enable, disable, and any connect or reload affordances in the panel SHALL be explicit user actions. Reading status MUST remain passive; the panel MUST NOT auto-connect, auto-reload, or auto-retry servers on its own.

#### Scenario: No automatic recovery attempts
- **WHEN** a server is in `failed` or `needs-auth` state and the user takes no action
- **THEN** the panel only displays the state and does not retry or reconnect on its own

### Requirement: Final-phase delivery
The MCP panel SHALL be delivered after the Terminal phase and MUST NOT delay it or any earlier phase.

#### Scenario: MCP does not gate Terminal
- **WHEN** the Terminal phase completes and is verified
- **THEN** it is deliverable independently of the MCP panel's implementation state
