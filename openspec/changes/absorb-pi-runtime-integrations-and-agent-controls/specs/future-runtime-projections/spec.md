## ADDED Requirements

### Requirement: Future Agent Inspector extends existing runtime projections
A future Agent Inspector SHALL consume the existing Persistent Agent journal and RuntimeSnapshot/RuntimeEvent projection system rather than introduce a second Agent runtime or event transport. P0 is list/status, Worker entry, live activity/transcript, tool activity and return-to-Main; P1 may add cancel/usage/compact/elapsed; P2 may add steer, interactive continuation and advanced resume. This change SHALL NOT implement Inspector UI or controls.

#### Scenario: Future Inspector planning
- **WHEN** future Inspector work begins
- **THEN** it maps Agent lifecycle/activity/output/tool events through existing projection owners instead of creating parallel session truth

### Requirement: Future Context Core converges current file context without a browser-only backend
A future AILI Context Core SHALL own reusable file search, content search, Git revisions/diff/hunks, line selection, immutable snapshot/hash/provenance and token estimate behind TUI and Web adapters. This change SHALL retain current TUI file-context behavior and SHALL NOT implement the Core or a separate browser-only context service.

#### Scenario: Future Web consumer
- **WHEN** a future WebUI needs file context
- **THEN** it consumes the shared Context Core contract rather than reimplementing filesystem/Git selection semantics

### Requirement: Tool-display is reference-only
`pi-tool-display` may inform future presentation decisions for tool calls, diffs and MCP-aware compact output, but it SHALL NOT be absorbed as Persistent Agent runtime or change current renderer ownership in this change.

#### Scenario: Runtime separation
- **WHEN** future Worker tool activity is presented
- **THEN** the source is Persistent Agent runtime events followed by a presentation layer, not `pi-tool-display` as an orchestration owner
