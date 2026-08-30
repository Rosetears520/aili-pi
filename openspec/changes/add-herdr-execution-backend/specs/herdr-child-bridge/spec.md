## Purpose

Defines the protocol, durability, security, and completion-evidence guarantees of the bridge that runs inside each external child process and connects it to the AILI control plane.

## ADDED Requirements

### Requirement: Bridge endpoint and authentication
Each run SHALL have a bridge endpoint owned by the child process as a local Unix socket with `0600` permissions, with the run token delivered to the child via a safe environment variable. The parent connects as a client, and the handshake SHALL validate run id, agent id, loadout hash, and token, rejecting any mismatch.

#### Scenario: Token mismatch is rejected
- **WHEN** a handshake arrives with a wrong run token
- **THEN** the bridge refuses the connection and the run is not considered live

#### Scenario: Socket is private
- **WHEN** the bridge socket is created
- **THEN** its permissions allow only the child's owner to connect

### Requirement: Durable dual-written event log
Bridge events SHALL be delivered in real time over the socket and simultaneously appended to a per-run JSONL event log. Every event SHALL carry a monotonic sequence number, delivery SHALL be acknowledged and idempotent, the log SHALL have a size cap with rotation, and after a parent restart delivery SHALL resume from the last acknowledged sequence.

#### Scenario: Replay after parent restart
- **WHEN** the parent reconnects and requests events after sequence N
- **THEN** the bridge delivers exactly the events beyond N without duplicates or gaps

#### Scenario: Duplicate delivery is harmless
- **WHEN** the same event is delivered twice
- **THEN** the receiver applies it once by its sequence and idempotency key

### Requirement: Authoritative completion evidence
A turn on the `herdr` backend SHALL be settled only by bridge evidence: a `turn.completed` event carrying the assistant result, driver session id, usage/cost, and an output hash. Herdr lifecycle states such as `idle` or `done`, and terminal text, MUST NOT be used as the sole completion evidence. If the bridge is lost while Herdr still shows the agent present, the job MUST NOT be marked completed.

#### Scenario: Idle without bridge evidence
- **WHEN** Herdr reports the agent idle but no `turn.completed` event has arrived
- **THEN** the turn remains unsettled and the run is marked degraded

### Requirement: Child launch discipline
The child agent CLI SHALL be launched with default extension discovery disabled, loading only the AILI child bootstrap and loadout-approved tools, skills, and extensions, with the resolved model and thinking level, workspace and cwd, a new or resumed driver session, the bridge, event log, and loadout paths, and the run token.

#### Scenario: No ambient extensions
- **WHEN** a Herdr-backed child starts
- **THEN** only loadout-approved components are active and unrelated user extensions are not loaded

### Requirement: Per-run security bootstrap
The child SHALL initialize its sandbox and permission enforcement exactly once from the immutable loadout and MUST NOT expose interfaces to reconfigure, reset, or downgrade them after start. A sandbox profile mismatch, missing provider, or degraded sandbox SHALL fail closed before any tool executes. Permission escalation requests SHALL be routed through the interaction broker rather than auto-approved. Credential-material scanning and output redaction SHALL execute in both the child and the parent.

#### Scenario: Sandbox unavailable fails closed
- **WHEN** the loadout's sandbox profile cannot be satisfied inside the child
- **THEN** the run fails closed before any tool executes

#### Scenario: No runtime permission widening
- **WHEN** any post-start request attempts to widen child permissions
- **THEN** it is rejected

### Requirement: Staged capability gating
Until security equivalence is accepted, the `herdr` backend SHALL restrict Herdr-backed children to read-only roles; write and shell execution on Herdr SHALL be enabled only after the security-equivalence acceptance criteria pass. A task whose required capabilities exceed the driver's declared capabilities SHALL fail at batch preflight rather than degrade at runtime.

#### Scenario: Write role on gated Herdr
- **WHEN** Herdr has not passed security-equivalence acceptance and a write/bash role is submitted
- **THEN** preflight fails explicitly with zero surfaces created

### Requirement: Bridge command surface
The bridge SHALL expose commands for status, turn submission, steering, interaction answers, turn abort, and shutdown, each returning an explicit result, and pending brokered interactions SHALL block child auto-exit until resolved.

#### Scenario: Question blocks auto-exit
- **WHEN** a child has a pending brokered question
- **THEN** auto-exit is deferred until the interaction resolves

#### Scenario: Abort is explicit
- **WHEN** the parent sends an abort for a running turn
- **THEN** the bridge stops the turn and reports the outcome rather than leaving it ambiguous
