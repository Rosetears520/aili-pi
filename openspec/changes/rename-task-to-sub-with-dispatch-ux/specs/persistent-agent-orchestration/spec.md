## MODIFIED Requirements

### Requirement: AILI registers the canonical delegation and control tools
AILI SHALL register the persistent-agent delegation tool under the exact name `sub` and the control tool under `hub`; the legacy `subagent`/`aili_task` names MUST NOT be registered and no compatibility alias for the previous `task` name SHALL be created. The canonical reservation guard, permission bridge, policy ceilings, child tool surfaces and prompt guidance SHALL key on the exact `sub` name. Sessions recorded before the rename MAY render historical `task` calls with the default tool renderer (display-only degradation; no data is rewritten).

#### Scenario: Renamed tool is dispatched
- **WHEN** a model calls `sub` with an ordinary task item
- **THEN** the persistent Agent Runtime allocates it exactly as the previous `task` tool did, with identical schema, policy, and journal semantics

#### Scenario: Legacy name is rejected
- **WHEN** a registration or call attempts the `task` name as the delegation tool
- **THEN** no alias resolves it; the canonical guard accepts only `sub`
