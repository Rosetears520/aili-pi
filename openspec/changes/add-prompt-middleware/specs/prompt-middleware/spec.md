## Purpose

Provide trusted one-turn prompt modifiers with deterministic assembly and enforceable permission narrowing while preserving stable prompt prefixes.

## ADDED Requirements

### Requirement: Trusted deterministic discovery
The system SHALL load validated modifiers from trusted user/project roots, hash their content, and fail closed on duplicate IDs; untrusted project modifiers MUST NOT apply.

#### Scenario: Duplicate modifier ID
- **WHEN** two discovered definitions use the same ID
- **THEN** selection is rejected with a deterministic diagnostic rather than applying filesystem order

### Requirement: Scope dependencies and conflicts
The resolver SHALL enforce main/subagent/role scope, role allowlists, requires and conflicts before prompt assembly.

#### Scenario: Role does not allow modifier
- **WHEN** a child turn requests a modifier outside its role allowlist
- **THEN** the turn fails before child startup

### Requirement: Stable prefix and dynamic block
One-turn modifiers SHALL NOT rewrite the stable system/role/policy prefix and SHALL assemble prepend modifiers, user content and append modifiers in deterministic order.

#### Scenario: Modifier changes
- **WHEN** only one-turn modifier selection changes
- **THEN** the stable prefix hash remains unchanged

### Requirement: Runtime patches only narrow
Modifier policy patches SHALL intersect with hard policy, parent tools, role ceiling and call narrowing; forceReadOnly MUST block write/edit and mutating or unknown bash at runtime.

#### Scenario: Read-only modifier
- **WHEN** forceReadOnly is active
- **THEN** prompt text and runtime enforcement both prevent mutation without enabling any unavailable capability

### Requirement: One-shot UI lifecycle
Alt+S and `/snippets` SHALL share pending state, preview definitions and restrictions, consume one-shot selection only after accepted prompt delivery, and isolate state by session.

#### Scenario: Validation blocks send
- **WHEN** requires/conflicts validation fails
- **THEN** the prompt is not sent and pending selection remains for correction

### Requirement: Bounded provenance and sub scope
Applied/rejected modifier IDs, hashes, scope, order and effective restrictions SHALL be recorded without private body text; `sub` modifier requests SHALL remain one-turn and role-authorized.

#### Scenario: Child continuation
- **WHEN** a modifier is applied to one continued child turn
- **THEN** it does not alter the persistent role profile or the next turn
