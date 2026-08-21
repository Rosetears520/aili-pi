## MODIFIED Requirements

### Requirement: Model-facing routing SHALL distinguish ordinary and formal work
Ordinary work SHALL retain benefit-based delegation and omitted-agent normalization to `general`: the public `task` tool schema MUST NOT expose `formalContext` or `continuationAudit`, and requests carrying them through the public channel SHALL be rejected as unknown fields. Formal work SHALL be dispatched through the dedicated `formal_task` adapter whose model-facing input is exactly `{ changeId, packageId }`; the adapter SHALL validate the exact v1 `formal-task-board.md`/`progress.txt` pair, require the package to exist with `ready` status, construct the ordinary task request (task text, exact Specialized selector, explicit async mode, and the continuation audit) from board fields only, and submit it through the trusted internal channel. An invalid pair, unknown package, or non-ready status SHALL fail the `formal_task` call before any Agent/job/turn allocation and SHALL NOT affect ordinary `task`/`hub` dispatch. Trusted internal callers (the adapter, nested formal children repeating their owning changeId, the ROSE planner) remain the only paths that may submit requests carrying the formal identity fields.

#### Scenario: Ordinary task omits formal context
- **WHEN** a `task` call omits formal fields
- **THEN** current Runtime normalization, tools, workspace, permission, and sandbox behavior remain unchanged

#### Scenario: Formal field sent through the public task tool
- **WHEN** a model-facing `task` call carries `formalContext` or `continuationAudit`
- **THEN** the request is rejected as containing unknown fields before any durable allocation

#### Scenario: formal_task dispatches a ready package
- **WHEN** `formal_task` names an existing change whose validated v1 pair contains the named package with `ready` status
- **THEN** the adapter constructs the ordinary task request from board fields (including the continuation audit) and the persistent Agent Runtime allocates it exactly as a trusted formal submission would

#### Scenario: Invalid pair blocks only formal_task
- **WHEN** the named formal pair is invalid, incomplete, or the package is unknown or not `ready`
- **THEN** the `formal_task` call fails closed before Agent allocation with bounded diagnostics, and ordinary `task`/`hub` dispatch continues to work unchanged
