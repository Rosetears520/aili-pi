## ADDED Requirements

### Requirement: AILI consumes one validated Workflow runtime bundle
`aili-pi` SHALL load system, role metadata, selection map, protocols, installation contract and provenance from one pinned compatible `rose-aili` release. It MUST validate release identity, source provenance, schema compatibility and cross-file consistency before exposing the bundle to runtime consumers.

#### Scenario: Complete compatible bundle loads
- **WHEN** all required artifacts share the pinned release identity and supported schemas
- **THEN** the runtime exposes one immutable bundle view to role, selection and protocol consumers

#### Scenario: Bundle identity or schema is mixed
- **WHEN** an artifact is missing, has a different release/provenance identity, or uses an unsupported schema
- **THEN** affected runtime startup fails closed and doctor reports the exact incompatible artifact without using a stale fallback

### Requirement: Pi exposes the full canonical Specialized Agent catalog
`aili-pi` SHALL expose all 20 canonical Specialized Agents from the pinned `rose-aili@0.4.7` bundle, including the read-only `aili.solution-architect`. It MUST derive this inventory from the validated bundle and MUST NOT impose the previous fixed 19-role count or silently filter an upstream canonical role.

#### Scenario: Solution architect is present in the canonical bundle
- **WHEN** role profiles and the agent-selection map are generated and loaded from `rose-aili@0.4.7`
- **THEN** `aili.solution-architect` is available with its canonical read-only role metadata, routing row and tool ceiling, and all task/hub/catalog surfaces agree on a 20-role inventory

#### Scenario: A consumer retains the previous fixed inventory
- **WHEN** a generator, validator, manifest, doctor check or runtime consumer expects 19 roles or omits `solution-architect`
- **THEN** bundle/generated validation fails closed instead of publishing a partial selector catalog

### Requirement: Workflow semantic ownership is not duplicated
After bundle-backed consumers pass verification, `aili-pi` SHALL stop packaging or installing duplicate Workflow prompts, role profiles, selection/protocol semantics and overlapping `APPEND_SYSTEM.md` governance text. `aili-workflows` SHALL remain the owner of Pi global `AGENTS.md` and Workflow prompts.

#### Scenario: Runtime transitions from the old snapshot
- **WHEN** bundle-backed role/selection/protocol consumers are verified
- **THEN** old snapshot and duplicate projections leave the production package only after their consumers have been removed

#### Scenario: Legacy global marker exists
- **WHEN** doctor finds an old AILI marker in a user file
- **THEN** it reports manual preview-first cleanup guidance and does not delete or rewrite the file

### Requirement: Bundle provenance participates in release validation
The pinned Workflow release, source commit, artifact schemas and package inventory SHALL be represented consistently in provenance, SBOM, notices and doctor output.

#### Scenario: Release artifacts drift
- **WHEN** the packaged bundle or generated evidence differs from canonical provenance input
- **THEN** package/release validation fails and does not report the Workflow runtime as verified
