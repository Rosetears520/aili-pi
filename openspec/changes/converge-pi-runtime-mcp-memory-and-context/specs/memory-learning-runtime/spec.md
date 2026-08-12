## REMOVED Requirements

### Requirement: AILI owns a SQLite-backed memory learning runtime
**Reason:** The product decision now selects MemPalace through MCP as the sole durable-memory source of truth. An AILI-owned SQLite learning/scanner/consolidation runtime would create a second memory owner.

**Migration:** No automatic data migration is authorized. Preserve any legacy files. Future memory reads/writes use the accepted MemPalace MCP contract only after separate configuration and operation authorization.

#### Scenario: Old SQLite memory proposal is encountered
- **WHEN** planning, implementation or release tooling finds `add-aili-sqlite-memory`
- **THEN** it treats that change as superseded historical evidence and does not dispatch or implement it

### Requirement: SQLite is the formal global or project memory store
**Reason:** Global/project SQLite paths, schemas, migrations and dual project-store behavior are retired.

**Migration:** Absence of a MemPalace configuration is represented as memory unavailable, not as permission to create SQLite.

#### Scenario: Project has no memory provider
- **WHEN** a memory-dependent operation is requested
- **THEN** it fails closed and does not initialize a project database
