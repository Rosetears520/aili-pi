## ADDED Requirements

### Requirement: Ephemeral independent side threads
BTW SHALL provide process-memory side threads that run independently from the main conversation with explicit model and thinking selection. BTW state MUST NOT be appended to the main Pi conversation or presented as durably recoverable after process loss.

#### Scenario: Side-thread exchange stays separate
- **WHEN** a user sends a question to BTW
- **THEN** the exchange occurs in the selected side thread and the main conversation remains unchanged

#### Scenario: Process loss clears side threads
- **WHEN** the owning process exits or crashes
- **THEN** BTW does not fabricate restoration from the main session or an undeclared durable store

### Requirement: Queued steering within BTW
BTW SHALL accept steering directed to the active side thread while preserving its own queue and lifecycle. Main-session Steer and Follow-up queues MUST NOT be reused implicitly.

#### Scenario: Side-thread steering is isolated
- **WHEN** a user steers an active BTW turn
- **THEN** the steering applies only to that side thread and does not alter the main session queue

### Requirement: Explicit previewed bring-to-main
BTW SHALL require an explicit user action and preview before inserting selected side-thread material into the main draft or conversation. Bring-to-main SHALL pass through the current main-session writer lease and mutation checks.

#### Scenario: Preview does not mutate main session
- **WHEN** a user opens a bring-to-main preview
- **THEN** the main conversation and draft remain unchanged until the user confirms an authorized insertion

#### Scenario: Read-only observer cannot bring to main
- **WHEN** a surface without the main-session writer lease confirms a BTW insertion
- **THEN** the operation is denied before main-session mutation and the preview remains available locally

### Requirement: TUI Runtime and Web parity
BTW SHALL expose its important retained TUI entry points, AILI Runtime/API state, and corresponding Web thread controls before first-release readiness.

#### Scenario: One BTW layer is absent
- **WHEN** the release candidate lacks a retained TUI entry, Runtime/API behavior, or Web behavior required by the locked BTW inventory
- **THEN** the BTW capability is incomplete for release
