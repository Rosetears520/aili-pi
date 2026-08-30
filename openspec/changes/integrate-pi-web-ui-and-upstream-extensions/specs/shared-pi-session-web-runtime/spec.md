## ADDED Requirements

### Requirement: One conversation-history truth
The system SHALL use Pi JSONL as the only conversation-history source of truth. Read-only browsing SHALL NOT create an `AgentSession`, and a mutation owner SHALL create at most one official Pi `AgentSession` adapter for a shared session.

#### Scenario: Browsing does not activate an agent
- **WHEN** Web lists or opens a persisted session without requesting a mutation
- **THEN** it reads the Pi JSONL projection without creating a live `AgentSession`

#### Scenario: Mutation uses official Pi runtime
- **WHEN** an authorized writer sends a session mutation
- **THEN** the mutation is executed through one official Pi `AgentSession` and the resulting Pi JSONL remains authoritative

### Requirement: One Web mutation owner
Each Web-opened Pi session SHALL have exactly one mutable runtime composition. `PrivateWebBff` and its `RuntimeHost` SHALL be the sole Web mutation owner. The real `AppShell`, hooks, components, and compatibility routes MUST NOT create another mutable `AgentSession` or directly invoke mutable Pi, filesystem, Git, Worktree, Agent, MCP, Analytics, BTW, Stamp, model/plugin/skill, or media owners.

#### Scenario: Concurrent Web mutation admission has one owner
- **WHEN** two browser clients attempt mutations for the same Web-opened session
- **THEN** both requests are admitted or denied by the same Gateway lease generation and at most one official Pi mutation runtime executes them

#### Scenario: Legacy direct mutation route is called
- **WHEN** a caller invokes an older mutation route retained for compatibility
- **THEN** the route either translates the request into the same Gateway mutation envelope or rejects it before side effects; it never becomes a second mutation owner

### Requirement: No stock-TUI observer or admission claim
The system SHALL retain official Pi without a fork or replacement TUI, but this change SHALL NOT register Extension `session_start` admission, private TUI projection, TUI-writer/Web-observer, or Web-writer/stock-TUI exclusion as supported production behavior. Concurrent stock-TUI and Web mutation of the same session is unsupported and MUST NOT be represented as safely mediated by the Web Gateway.

#### Scenario: Production bundle is inspected for retired attachment paths
- **WHEN** the active Extension and Web composition are inspected
- **THEN** no production registration exposes the retired TUI projection endpoint or claims that stock TUI attachment is gated by the Web lease

#### Scenario: Web reports ownership scope
- **WHEN** the Web UI displays mutation ownership
- **THEN** it describes the Web runtime owner and does not imply control over an independently opened stock Pi TUI

### Requirement: Safe release and recovery
Explicit idle release SHALL transfer ownership immediately. Unexpected disconnection SHALL retain ownership for a short bounded grace period, and an active turn SHALL remain owned until settled or durably marked interrupted after owner death is established. Recovery SHALL validate lease generation, process identity, liveness, and grace completion; force stealing MUST NOT exist.

#### Scenario: Clean release transfers ownership
- **WHEN** an idle owner explicitly releases the current lease generation
- **THEN** a waiting eligible surface may atomically acquire a new generation immediately

#### Scenario: Live owner cannot be stolen from
- **WHEN** a waiting surface observes a stale heartbeat but liveness remains possible or an active turn remains live
- **THEN** acquisition is denied and no force-steal operation is offered

#### Scenario: Dead active owner is reconciled
- **WHEN** process identity and liveness checks establish owner death after the complete grace period during an active turn
- **THEN** the turn is durably marked interrupted before a new lease generation can be acquired
