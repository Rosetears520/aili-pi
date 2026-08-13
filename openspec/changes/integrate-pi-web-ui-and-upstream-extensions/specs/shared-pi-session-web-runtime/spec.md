## ADDED Requirements

### Requirement: One conversation-history truth
The system SHALL use Pi JSONL as the only conversation-history source of truth. Read-only browsing SHALL NOT create an `AgentSession`, and a mutation owner SHALL create at most one official Pi `AgentSession` adapter for a shared session.

#### Scenario: Browsing does not activate an agent
- **WHEN** Web lists or opens a persisted session without requesting a mutation
- **THEN** it reads the Pi JSONL projection without creating a live `AgentSession`

#### Scenario: Mutation uses official Pi runtime
- **WHEN** an authorized writer sends a session mutation
- **THEN** the mutation is executed through one official Pi `AgentSession` and the resulting Pi JSONL remains authoritative

### Requirement: First-acquired writer lease
Each shared Pi session SHALL have at most one mutation writer. The first eligible TUI or Web surface to atomically acquire the lease SHALL own mutations until valid release or recovery, and every other supported observer SHALL expose the owner and a machine-readable denial reason.

#### Scenario: Concurrent acquisition has one winner
- **WHEN** TUI and Web concurrently attempt to acquire an unowned session
- **THEN** exactly one acquisition succeeds and the losing surface cannot send, Steer, Compact, Branch, Fork, or perform another session mutation

#### Scenario: Observer mutation is denied
- **WHEN** a read-only observer submits a mutation
- **THEN** the gateway rejects it before Pi invocation and returns the current writer identity class and denial reason without exposing secrets

### Requirement: Official Pi asymmetric attachment
The system SHALL retain official Pi without a fork or replacement TUI. The AILI Pi Extension SHALL acquire or validate TUI ownership during `session_start` before exposing the session as usable; if Web already owns the session, the Extension SHALL request graceful shutdown or otherwise block the TUI runtime before user mutation is accepted. When stock TUI owns the writer lease, an authenticated private local projection channel SHALL permit Web to observe live read-only state. When Web owns the writer lease, stock TUI attachment to that same session MUST fail closed until Web releases or exits. The private channel MUST use mode-restricted local IPC and opaque bootstrap identity and MUST reject unauthenticated or stale peers.

#### Scenario: TUI writer permits Web observation
- **WHEN** stock TUI owns a session and Web opens it
- **THEN** Web receives live read-only state and all Web mutation controls are denied

#### Scenario: Web writer rejects stock TUI attachment
- **WHEN** Web owns a session and stock TUI attempts to attach to that session
- **THEN** the Extension detects the conflict at session startup and shuts down or blocks the TUI runtime before it accepts user mutation, with an ownership explanation instead of pretending stock TUI is a safe observer

#### Scenario: Web observer authenticates to TUI projection
- **WHEN** Web attaches read-only to a TUI-owned session
- **THEN** it authenticates through the private local projection channel and cannot convert that channel into mutation authority

#### Scenario: Spoofed projection peer is rejected
- **WHEN** a process presents a missing, stale, or incorrect bootstrap identity to the TUI projection endpoint
- **THEN** the endpoint returns no session projection and does not change lease state

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
