## Purpose

Provide bounded session observations and controlled durable recall without making memory authoritative or creating another durable store.

## ADDED Requirements

### Requirement: Layered memory boundaries
The system SHALL distinguish Tail, Observation, and Durable memory; only explicitly authorized promoted candidates may enter MemPalace.

#### Scenario: Observation is not automatically durable
- **WHEN** a session observation is created without durable-promotion authority
- **THEN** it remains session-scoped or is discarded and no MemPalace write occurs

### Requirement: Branch-aware observation ledger
The system SHALL maintain ordered, idempotent observations with branch/fork/rollback-aware active views.

#### Scenario: Branch rollback
- **WHEN** the active tree returns before later observations
- **THEN** later branch observations are excluded from recall while existing durable memory is not deleted

### Requirement: Internal observer isolation
Observer and consolidation work SHALL use a bounded managed-internal execution path independent of the public managed/Herdr setting and MUST NOT recursively observe itself.

#### Scenario: Public backend is Herdr
- **WHEN** automatic observation is enabled while public Agents use Herdr
- **THEN** observation creates no Herdr pane and does not appear as a public Agent

### Requirement: Controlled durable promotion
The Parent memory controller SHALL redact credentials/private content, deduplicate candidates, represent conflicts/supersedes, and require exact authority before every durable write.

#### Scenario: Promotion lacks authority
- **WHEN** a candidate has no exact durable-write authority
- **THEN** promotion fails closed without a fallback store

### Requirement: Deterministic budgeted recall
Recall SHALL use stable ordering, deterministic hashes and a bounded token budget; current repository/spec/runtime evidence SHALL outrank recalled memory.

#### Scenario: Recall exceeds budget
- **WHEN** eligible memory exceeds the configured budget
- **THEN** deterministic truncation reports omitted count and injects no unbounded content

### Requirement: Opt-in controls and provenance
Automatic observation SHALL default off and expose status/on/off/compact/consolidate controls with bounded ID/hash/cost provenance that omits memory bodies.

#### Scenario: Automatic memory is off
- **WHEN** memory-auto is disabled
- **THEN** no observer work is scheduled while explicit authorized MemPalace operations remain available
