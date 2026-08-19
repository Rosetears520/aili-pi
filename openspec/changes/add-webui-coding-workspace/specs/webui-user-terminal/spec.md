## ADDED Requirements

### Requirement: User-controlled browser terminal
The Web UI SHALL provide a browser terminal that connects over WebSocket to a server-spawned PTY running the user's shell, defaulting its cwd to the current session cwd, with ANSI rendering, Ctrl+C, resize, and reconnect/cleanup behavior. The terminal SHALL be labeled as user-controlled (for example "Terminal · User controlled") and MUST NOT be presented or wired as part of the agent runtime.

#### Scenario: Terminal is not the agent bash tool
- **WHEN** the user runs a command in the terminal
- **THEN** it executes in the user's PTY under the user's own privileges, outside agent tool authorization and permission-mode semantics

#### Scenario: Terminal follows the session cwd
- **WHEN** a terminal is opened for a session
- **THEN** its initial cwd is the session cwd resolved through the existing allowed-roots rules

### Requirement: Lifecycle and cleanup
Terminal sessions SHALL be cleaned up on disconnect (page unload, WebSocket drop, server shutdown) with no orphaned PTY processes, and reconnect behavior MUST NOT present stale output as current state.

#### Scenario: No orphaned PTYs
- **WHEN** the page closes or the socket drops
- **THEN** the server terminates the PTY or marks it for reaping, and a new connection starts a clean terminal

### Requirement: Security boundary inheritance
The terminal SHALL operate only inside the existing web access-security boundary (loopback default; fail-closed non-loopback with authentication, Origin validation, and allowed-root/path enforcement), and MUST NOT become a bypass for file-access allowed-roots, web authentication, or the web runtime's security posture. New terminal dependencies (PTY, WebSocket, terminal front-end) each require separate exact approval before BUILD work touches them.

#### Scenario: Terminal is unavailable when the backend fails closed
- **WHEN** the web backend would fail closed for non-loopback access without authentication
- **THEN** the terminal transport is equally unavailable rather than a separate unauthenticated channel

### Requirement: Last-phase delivery
The terminal SHALL be delivered after the interaction shelf, shared diff/inline change events, workspace, and skill chip phases, and MUST NOT delay their delivery or verification.

#### Scenario: Terminal does not gate earlier phases
- **WHEN** Phases 1–4 are complete and verified
- **THEN** they are deliverable independently of the terminal implementation state
