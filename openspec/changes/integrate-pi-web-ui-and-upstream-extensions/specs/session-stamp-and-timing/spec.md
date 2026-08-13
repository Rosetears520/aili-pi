## ADDED Requirements

### Requirement: Versioned out-of-context Stamp entries
Stamp SHALL store versioned Pi custom entries outside model context for message timestamps, response timing, bounded assistant metadata, Pi-reported token/cost fields, and tool duration/outcome. Stamp writes SHALL use Pi's owning session mutation path or an equivalent serialized append boundary, SHALL tolerate partial/crashed writes by ignoring invalid custom entries, and SHALL define schema-version migration without rewriting unrelated Pi JSONL entries.

#### Scenario: Stamp metadata stays outside model context
- **WHEN** the next model request is constructed after Stamp entries have been written
- **THEN** Stamp custom entries are excluded from model input while remaining available to supported TUI and Web views

#### Scenario: Invalid Stamp entry is present
- **WHEN** a session contains a truncated, unsupported-version, or schema-invalid Stamp custom entry
- **THEN** the runtime ignores that entry with a visible diagnostic and preserves the remaining Pi session history

### Requirement: Timing lifecycle is deterministic
Stamp SHALL derive timing from observable Pi or AILI lifecycle events and SHALL define bounded behavior for completion, cancellation, retry, compaction, tool failure, and interrupted owner recovery.

#### Scenario: Tool failure records outcome and duration
- **WHEN** a tool invocation ends in a visible failure
- **THEN** Stamp records its bounded duration and failure category without persisting tool arguments, output, or raw error body

#### Scenario: Interrupted turn is not reported complete
- **WHEN** a writer dies during an active turn and recovery marks it interrupted
- **THEN** Stamp records interruption rather than a successful response completion

### Requirement: Usage and cost provenance
Stamp SHALL label usage and cost values according to Pi/provider-reported provenance and MUST NOT fabricate missing values or present local estimates as provider measurements.

#### Scenario: Provider omits cost
- **WHEN** Pi reports token usage but no provider cost
- **THEN** Stamp may record the reported tokens and marks cost unavailable rather than inventing a value

### Requirement: TUI Runtime and Web parity
Stamp SHALL expose its important retained TUI entry points, AILI Runtime/API state, and corresponding Web timing and usage surfaces before first-release readiness.

#### Scenario: One Stamp layer is absent
- **WHEN** the release candidate lacks a retained TUI entry, Runtime/API behavior, or Web behavior required by the locked Stamp inventory
- **THEN** the Stamp capability is incomplete for release
