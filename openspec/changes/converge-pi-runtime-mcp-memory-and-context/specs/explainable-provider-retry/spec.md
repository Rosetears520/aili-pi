## ADDED Requirements

### Requirement: AILI preserves the complete frozen pi-retry behavior
AILI SHALL retain the complete published `@narumitw/pi-retry@0.31.0` source and behavior for unknown no-detail errors, Codex websocket-limit errors, explicitly retryable Codex backend failures, provider-stream stall watchdog, receiving/retrying status, Pi retry-policy reading and lifecycle cleanup. Its MIT license, attribution and later upstream deprecation status SHALL remain recorded.

#### Scenario: Known retryable provider error arrives
- **WHEN** an assistant error matches one frozen classifier
- **THEN** the retry hint is appended exactly once and Pi's built-in retry owner decides the attempt, budget and backoff

#### Scenario: Error does not match
- **WHEN** the provider error has no accepted retry classifier
- **THEN** the original error remains non-retry-classified and AILI does not invent a transient cause

### Requirement: Retry remains owned by Pi
AILI MUST NOT implement a second retry loop, enable a disabled Pi retry policy, reset retry budgets or bypass Pi backoff. When Pi retry is disabled, the stall watchdog SHALL not abort a request merely to request a retry.

#### Scenario: Retry is disabled
- **WHEN** settings resolve `retry.enabled=false`
- **THEN** AILI reports the inactive retry helper once, disarms watchdog state and leaves the request/error to Pi

#### Scenario: Retry budget is exhausted
- **WHEN** Pi reaches its retry limit
- **THEN** AILI displays the terminal failure and does not append another attempt outside Pi

### Requirement: Provider failures remain explainable
For each classified failure or watchdog stall, AILI SHALL preserve a bounded sanitized original cause and expose provider/model, category, retryable decision, retry reason, attempt and next delay when available, and terminal state. It MUST NOT replace the cause with only `retrying`, leak headers/payloads/secrets or claim retry success before settlement.

#### Scenario: Unknown no-detail error is classified
- **WHEN** the known message is received
- **THEN** UI/diagnostics show an unknown-detail category, the bounded original message and that Pi will decide retry

#### Scenario: Retry later fails terminally
- **WHEN** all Pi attempts fail
- **THEN** the final surface shows exhausted/failed with the latest bounded cause instead of an indefinite retrying state

### Requirement: Stall, user cancellation and provider abort are distinct
A watchdog-triggered stall SHALL be tagged distinctly from user cancellation and other aborts. Provider/stream activity SHALL refresh the timer; idle/session end/reload/replacement SHALL dispose it exactly once.

#### Scenario: Stream stalls while retry is enabled
- **WHEN** no provider response or assistant stream event arrives before the configured timeout
- **THEN** AILI aborts once, marks stall-watchdog classification and delegates retry to Pi

#### Scenario: User cancels the turn
- **WHEN** the abort did not originate from the watchdog
- **THEN** the result remains cancelled/aborted and is not rewritten as a retryable stall

#### Scenario: Session shuts down with an armed timer
- **WHEN** shutdown or replacement occurs
- **THEN** the old timer/status is cleared and cannot affect a later session

### Requirement: Retry watchdog and Codex Remote V2 share abort provenance
For compatible Codex routes, the Remote V2 request and ordinary provider stream events SHALL refresh or transfer one attempt-scoped watchdog according to actual progress. User cancellation SHALL terminate the active request without fallback or retry. Watchdog abort SHALL be tagged once and delegated to Pi retry; provider transport abort MUST NOT be reclassified as a stall. At most one live transport and one watchdog SHALL exist per Pi attempt, extension-owned transport retry SHALL be disabled or proven absent, and events from an old attempt MUST NOT refresh a new timer.

#### Scenario: Codex Remote V2 transport fails
- **WHEN** the active Remote V2 request fails without user cancellation
- **THEN** the failure settles within the current Pi attempt without starting an extension-owned retry transport; Pi alone decides any later attempt

#### Scenario: User cancels during remote compaction
- **WHEN** cancellation provenance is user-owned
- **THEN** the remote request terminates, no fallback or retry starts and the error remains cancelled rather than retryable stall

#### Scenario: Old transport emits late activity
- **WHEN** an earlier attempt has settled or been aborted
- **THEN** its event cannot refresh the current attempt's watchdog or status

### Requirement: Classification and presentation are idempotent
The same finalized error SHALL not receive duplicate tags, notifications, status entries or retry hints across replay/resume. Diagnostic rendering MUST NOT modify provider execution or retry state.

#### Scenario: Tagged message is replayed
- **WHEN** a resumed session contains an already classified error
- **THEN** no second classification or notification is appended

#### Scenario: Diagnostic renderer fails
- **WHEN** bounded presentation cannot render
- **THEN** the original error and Pi retry semantics remain intact
