## ADDED Requirements

### Requirement: Versioned runtime snapshot
The gateway SHALL expose a schema-validated versioned snapshot containing a runtime epoch, opaque session handle, last sequence, writer state, capability matrix, and bounded projections of the current Pi and AILI state. It MUST NOT expose raw credentials, environment variables, raw MCP configuration, raw Pi session-file paths, or private tool payloads. Capability-specific filesystem paths MAY be exposed only when they are under an authorized allowed root and required for an explicit file or Worktree view; they MUST NOT reveal the Pi session JSONL path or another protected path.

#### Scenario: Initial client synchronization
- **WHEN** a browser client connects to a supported session
- **THEN** it receives a complete current snapshot before applying incremental runtime events

### Requirement: Ordered resumable event stream
Runtime events SHALL include contract version, runtime epoch, monotonic sequence, emission time, opaque session handle, source, type, and validated payload. The runtime SHALL retain a bounded replay window and support cursor-based SSE resume.

#### Scenario: Cursor resumes within replay window
- **WHEN** a client reconnects with a cursor from the current epoch that remains in the replay window
- **THEN** the server sends only later ordered events and does not duplicate durable transcript storage

#### Scenario: Gap requires reset
- **WHEN** a cursor is unknown, belongs to another epoch, or predates the replay window
- **THEN** the server issues a reset and replacement snapshot rather than silently continuing from incomplete state

### Requirement: Stale state rejection
Clients and the gateway SHALL reject events, responses, and mutation acknowledgements whose epoch, sequence, run identifier, or lease generation is older than the currently accepted state.

#### Scenario: Late response cannot overwrite current state
- **WHEN** a slow response from a prior run arrives after a newer run or snapshot has been accepted
- **THEN** the client ignores it and preserves the newer state

### Requirement: Capability-gated mutations
Every mutation request SHALL carry a unique request ID, client identity, expected runtime epoch, expected lease generation, command type, and schema-validated arguments. Browser mutations MUST pass authentication and Origin checks. TUI-origin mutations MUST use the authenticated private runtime channel and MUST NOT be required to fabricate browser Origin data. Every origin MUST pass allowed-root, capability, permission, lease-ownership, freshness, and operation-specific checks before dispatch.

#### Scenario: Unsupported mutation is absent or denied
- **WHEN** the current runtime cannot safely perform a requested Agent, MCP, Pi, Analytics, BTW, Stamp, Worktree, or media mutation
- **THEN** the UI does not present it as available or the gateway denies it without guessing support

#### Scenario: TUI mutation uses private runtime identity
- **WHEN** stock TUI owns the lease and submits a mutation through the extension runtime
- **THEN** the gateway authenticates the private TUI channel and applies all non-browser gates without requiring a browser Origin header

#### Scenario: Duplicate request is idempotently disposed
- **WHEN** the same request ID and payload are retried after their disposition is known
- **THEN** the gateway returns the recorded disposition and does not execute the mutation twice

#### Scenario: Request ID collision fails closed
- **WHEN** a request ID is reused with a different payload, epoch, generation, or client identity
- **THEN** the gateway rejects the collision and performs no mutation

### Requirement: Bounded mutation disposition journal
The gateway SHALL keep a bounded disposition journal for every mutation family, keyed by authenticated client identity, request ID, runtime epoch, and lease generation. A completed disposition SHALL remain reusable for the accepted retry window. In-flight duplicates SHALL join or receive the same pending state. Unknown disposition after owner crash or restart MUST fail closed for non-idempotent operations until the owning service can reconcile the operation from authoritative state.

#### Scenario: Duplicate arrives while original is in flight
- **WHEN** an authenticated client retries an identical request while its first execution is still pending
- **THEN** the gateway does not start a second execution and both callers observe one disposition

#### Scenario: Restart leaves destructive disposition unknown
- **WHEN** a server restarts after dispatching a non-idempotent mutation but before recording its result
- **THEN** the gateway refuses blind replay and requires authoritative reconciliation before another execution
