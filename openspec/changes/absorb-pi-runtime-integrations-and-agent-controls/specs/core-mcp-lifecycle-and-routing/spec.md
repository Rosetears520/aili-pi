## ADDED Requirements

### Requirement: Five core MCP servers use the existing adapter lifecycle
AILI SHALL configure MemPalace, CodeGraph, Context7, Playwright and Graphify through the existing `pi-mcp-adapter` lifecycle and the one shared user configuration. After executable preflight, each core server SHALL use adapter `keep-alive` lifecycle so it connects at session startup and persists until session cleanup; unavailable servers SHALL be represented as per-server failed/unavailable state without preventing Pi startup. A single server failure, reconnect failure, reload, shutdown, or duplicate registration SHALL NOT falsely mark other servers healthy. Parent and Worker adapters use their existing distinct session instances and the same config source.

#### Scenario: One core server fails
- **WHEN** one core server fails to start or reconnect
- **THEN** the adapter reports that server as failed while other configured servers remain independently usable

#### Scenario: Reload and shutdown
- **WHEN** a session reloads or shuts down
- **THEN** each session-owned adapter cleans up its own stdio processes and duplicate server registration does not occur

### Requirement: CodeGraph executable selection remains version governed
AILI SHALL report the selected CodeGraph strategy, binary path when applicable, actual version, expected compatible version policy, and status. A PATH binary SHALL be used only when it satisfies that policy; otherwise the immutable `npx` package path remains selected.

#### Scenario: PATH version drifts
- **WHEN** the PATH `codegraph` version does not satisfy the expected policy
- **THEN** AILI does not silently treat it as the governed CLI

### Requirement: Graphify stays separate and tolerates absent index
Graphify SHALL be configured as a distinct macro knowledge-graph MCP capability. It SHALL retain one shared configuration and use the adapter session cwd; its upstream multi-project `project_path` tool argument derives the graph location as `<project>/.graphify-out/graph.json` rather than hard-coding a repository path or generating a second configuration. A missing or corrupt graph SHALL be reported as unindexed/unavailable without crashing Pi or triggering endless automatic rebuild.

#### Scenario: Unindexed project
- **WHEN** Graphify starts for a project without its graph artifact
- **THEN** its server/tool reports unindexed state for that project path and Pi remains usable

#### Scenario: Core lifecycle inventory
- **WHEN** the session starts with executable preflight success
- **THEN** MemPalace, CodeGraph, Context7, Playwright and Graphify each register exactly once with `keep-alive`

#### Scenario: Core executable is unavailable
- **WHEN** one core server's executable preflight fails
- **THEN** that server is surfaced as unavailable/failed without registering duplicates or preventing other configured core servers from starting

### Requirement: Core MCP routing guidance is concise and non-duplicative
Runtime guidance SHALL direct precise code symbols/call paths/tests/impact to CodeGraph; macro cross-material structure to Graphify; durable history to MemPalace; current third-party docs to Context7; browser behavior to Playwright; and exact current files/generated/unindexed content to filesystem tools. It SHALL state that indexes are navigation evidence rather than correctness proof and SHALL NOT require redundant multi-tool chains.

#### Scenario: Current file conflicts with index
- **WHEN** CodeGraph or Graphify output differs from current disk source
- **THEN** the runtime treats current disk source and focused verification as authoritative
