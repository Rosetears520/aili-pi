## MODIFIED Requirements

### Requirement: Child sessions are parent-scoped persistent official Pi sessions with explicit session extensions
Every non-ephemeral Agent SHALL use an independent official Pi `SessionManager` JSONL under a parent-owned artifact root. Each Worker SHALL load only explicit child-safe extensions: existing approval/workspace guards, the session-owned MCP adapter and explicitly allowed nested orchestration tools. It MUST NOT inherit ambient top-level package extensions, themes, prompts or context resources.

#### Scenario: Persistent child starts with MCP
- **WHEN** a valid task allocates a Worker
- **THEN** the Worker opens its own AgentSession and MCP adapter instance while retaining parent/role/task permission ceilings

#### Scenario: Child extension discovery finds a top-level UI extension
- **WHEN** Matrix, footer, header, theme or another ambient extension is installed in the Parent
- **THEN** the Worker does not auto-load it through resource discovery

### Requirement: Agent lifecycle disposes all session-owned runtime resources
Idle park, explicit release, cancellation, prepare failure, revive failure, session replacement and shutdown SHALL dispose the affected Worker AgentSession and its MCP resources while retaining durable transcript/registry identity when the lifecycle is resumable.

#### Scenario: Idle TTL parks a Worker
- **WHEN** an idle Agent reaches its parking threshold
- **THEN** its live Session and MCP transports are disposed and its stable identity/session JSONL remain resumable

#### Scenario: Revive fails after adapter creation
- **WHEN** a parked Agent cannot complete prepare
- **THEN** the partial AgentSession/MCP instance is disposed and no running state or success is persisted

### Requirement: Effective tools include MCP only through the same authority intersection
For `general` and specialized roles, effective tools SHALL remain bounded by Parent active tools, child-loadable definitions, hard guards, role ceiling and call narrowing. MCP proxy/direct/script/resource surfaces SHALL add no bypass around those rules.

#### Scenario: Parent disables MCP
- **WHEN** the Parent active-tool ceiling or permission mode excludes MCP
- **THEN** the Worker cannot call or rediscover MCP tools despite configured servers

#### Scenario: Specialized role allows only selected MCP capability
- **WHEN** role/call scope narrows MCP access
- **THEN** only the permitted proxy/direct operations remain executable

### Requirement: Process loss remains non-replaying with MCP cleanup
A running or queued turn interrupted by process loss, reload or replacement SHALL retain existing interrupted/unexecuted semantics and MUST NOT replay provider, tool, MCP or memory side effects automatically.

#### Scenario: Process exits during an MCP call
- **WHEN** the child turn does not settle before shutdown
- **THEN** AILI disposes the session runtime, records interruption according to the persistent coordinator contract and performs no automatic retry after restart
