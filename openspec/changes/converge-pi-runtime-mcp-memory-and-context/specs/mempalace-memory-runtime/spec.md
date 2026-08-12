## ADDED Requirements

### Requirement: MemPalace is the sole durable-memory source of truth
AILI SHALL perform durable-memory reads and writes only through the configured MemPalace MCP server. It MUST NOT create or use AILI SQLite, `rose-memory`, Markdown mirror, transcript-mining or alternate-store fallbacks.

#### Scenario: MemPalace is unavailable
- **WHEN** a task requires durable-memory search or mutation while the server is unavailable
- **THEN** the operation reports unavailable and performs no fallback write or success claim

#### Scenario: Task does not require durable memory
- **WHEN** MemPalace is unavailable but an ordinary task needs no memory operation
- **THEN** the task may continue while the memory capability remains explicitly unavailable

### Requirement: Pi and OpenCode share one Palace
The configured Palace SHALL be `/home/rosetears/code/ai/.mempalace` for the confirmed environment and SHALL be passed through the selected MemPalace release's supported path contract. AILI MUST NOT copy, mirror or initialize another Palace implicitly.

#### Scenario: Both clients are configured
- **WHEN** Pi and OpenCode use MemPalace
- **THEN** both resolve the same Palace and no second AILI-owned memory database is created

#### Scenario: Palace is absent
- **WHEN** runtime or doctor sees that the configured Palace is not initialized
- **THEN** it reports the state and does not initialize, mine or download models without separate authorization

### Requirement: Memory scope mapping is deterministic
AILI SHALL map a trusted project identity to one project Wing, reusable cross-project facts to `shared`, and eligible stable Agent diary content to a deterministic diary within the supported MemPalace model. Session JSONL/history SHALL remain hot context rather than durable semantic memory.

#### Scenario: Two projects store project-scoped facts
- **WHEN** each writes through its accepted project scope
- **THEN** the records map to distinct Wings and are not silently promoted to shared

#### Scenario: Stable Agent resumes
- **WHEN** an eligible stable Agent accesses its diary
- **THEN** it resolves the same deterministic diary mapping without treating its transcript as the Palace

### Requirement: Memory mutation remains operation-gated and non-authoritative
Installation, Palace initialization, model download, mining, import, memory read, memory write and delete SHALL remain separate operations. Retrieved memory is historical context and MUST NOT override current user, repository, contract, permission or verification evidence.

#### Scenario: Memory conflicts with current repository evidence
- **WHEN** a Palace record disagrees with current accepted source
- **THEN** current source wins and AILI does not treat memory as authorization or completion proof

#### Scenario: Migration is declined
- **WHEN** the user declines legacy-memory import or Palace initialization
- **THEN** legacy data remains untouched and AILI reports memory not configured rather than performing an implicit migration
