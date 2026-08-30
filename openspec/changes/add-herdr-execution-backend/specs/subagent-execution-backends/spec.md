## Purpose

Defines how persistent-agent execution is routed through selectable execution backends, how the managed backend preserves current behavior unchanged, and how Run records, permits, loadouts, and batches behave uniformly across backends.

## ADDED Requirements

### Requirement: Execution backend routing
All persistent-agent execution SHALL be routed through an execution backend registry that resolves each new agent to exactly one backend kind, `managed` or `herdr`. The coordination layer MUST NOT create child sessions or processes through a backend-specific path; it performs common preflight, allocates identities, and then calls the resolved backend.

#### Scenario: Default resolves to managed
- **WHEN** a new agent is created and the user has not configured a backend
- **THEN** the agent is created on the `managed` backend and no Herdr connection is attempted

#### Scenario: Unknown backend kind fails
- **WHEN** configuration names a backend kind the registry does not know
- **THEN** submission fails explicitly naming the unresolved backend and no agent is allocated

### Requirement: Managed backend equivalence
The `managed` backend SHALL preserve the existing in-process execution semantics without behavioral change: all-or-none batch preflight, FIFO scheduling with the existing per-parent active-turn limit, model/thinking authorization, tool intersection, permission brokering, workspace and write-scope enforcement, and durable output/history delivery all behave as before this change.

#### Scenario: Existing test baseline passes
- **WHEN** the full existing test suite runs after the backend abstraction lands
- **THEN** all previously passing tests still pass without modifying their assertions

#### Scenario: Legacy storage interpreted as managed
- **WHEN** a coordinator journal recorded before this change is opened
- **THEN** every recorded agent is interpreted as `managed` without migration or data rewrite

### Requirement: User-only backend selection
Backend selection SHALL be resolved only from user-controlled settings with priority session override > project settings > global settings > default `managed`, and SHALL be changeable only by the user through settings or the user-level backend command. The model-facing `sub` tool schema MUST NOT expose a backend parameter. Role profiles MUST NOT force a backend; they MAY declare the backends they support.

#### Scenario: Model cannot select a backend
- **WHEN** a `sub` request payload contains a backend field
- **THEN** the request is rejected as invalid input rather than honored

#### Scenario: Switch affects only new agents
- **WHEN** the user switches the backend setting while agents already exist
- **THEN** subsequently created agents use the new backend and existing agents keep their creation-time backend for continuation and resume

#### Scenario: Profile restricts backend
- **WHEN** a role profile declares it does not support the resolved backend
- **THEN** submission fails at preflight with the unsupported pairing named

### Requirement: No silent fallback
When the resolved backend is unavailable or incapable — daemon unreachable, protocol version mismatch, driver capability missing, child bridge not ready, sandbox unavailable — submission SHALL fail explicitly with the reason. The system MUST NOT silently execute the work on another backend.

#### Scenario: Herdr unavailable
- **WHEN** the resolved backend is `herdr` and the Herdr daemon is unreachable
- **THEN** the submission fails with an explicit unavailability error, no agent or surface is created, and no managed execution occurs

### Requirement: Run records and activity overlay
Each process incarnation SHALL be represented by a Run record carrying backend kind, driver kind, backend reference, driver session id, loadout hash, and control mode, with authoritative lifecycle `allocated → starting → live → stopping → stopped`, plus `lost` and `failed`. Activity states (`working`, `streaming`, tool usage, `waiting_question`, `waiting_permission`, `blocked`, `stalled`, `recovered`, `degraded`, `unknown`) SHALL be an overlay that never by itself terminates a Run, Job, or Turn.

#### Scenario: Long silent execution stays running
- **WHEN** a live run produces no valid structured events for longer than the stall threshold
- **THEN** its activity becomes `stalled` while its Job and Turn remain running and its permits remain held

#### Scenario: Run identity across restart
- **WHEN** an agent's process exits and the agent is later resumed on the same driver session
- **THEN** a new Run record is created while the Agent identity and driver session id are unchanged

### Requirement: Permit separation
Active-turn concurrency SHALL continue to be governed by the existing scheduler semantics, and live Herdr surfaces SHALL be governed by a separate surface permit with a configurable maximum live surfaces setting. Surface permits SHALL be released only after confirmed process stop or explicit release, never by stall detection.

#### Scenario: Idle agent holds its surface
- **WHEN** a Herdr-backed agent finishes its turn and is idle
- **THEN** it no longer holds an active-turn permit but its surface permit remains held until release

#### Scenario: Surface saturation queues runs
- **WHEN** live surfaces reach the configured maximum
- **THEN** additional admitted agents wait for a surface without failing preflight

### Requirement: Batch backend consistency
A batch submission SHALL resolve to a single backend and require every item to support that backend. If any item fails preflight, no agent is allocated and no surface is created; the existing all-or-none preflight semantics are preserved. Runtime failures after admission SHALL be recorded per item without automatically cancelling other items.

#### Scenario: Mixed support rejects the whole batch
- **WHEN** one batch item cannot run on the resolved backend
- **THEN** the entire batch fails before allocation with zero agents and zero surfaces created

#### Scenario: Independent runtime failure
- **WHEN** one admitted batch item fails at runtime
- **THEN** the remaining items continue running and are not auto-cancelled

### Requirement: Loadout snapshot and strict resume
Agent creation SHALL freeze an immutable loadout snapshot covering effective model/thinking/speed tier, tools and tool-provider references, skills, context mode, cwd/workspace/write-scope, permission and sandbox profile references, spawn allowlist, and provenance. Resume SHALL use the intersection of the frozen loadout ceiling, current hard guards, current sandbox availability, and current project trust: effective permissions MUST NOT widen automatically; current rules MAY tighten a resumed agent, and any tightening SHALL be surfaced as a diff; missing required components SHALL reject the resume; a missing loadout MUST NOT be treated as authorization for unrestricted resume.

#### Scenario: Tightened on resume
- **WHEN** current rules no longer allow a tool the frozen loadout included
- **THEN** the agent resumes without that tool and the tightening diff is displayed

#### Scenario: Missing loadout refuses resume
- **WHEN** a resume is requested and no loadout snapshot can be found
- **THEN** the resume is refused rather than treated as unrestricted

### Requirement: Backend metadata in listings and results
Agent listings and turn results SHALL include the backend kind, driver kind, and current run identifier for every agent.

#### Scenario: Result carries execution provenance
- **WHEN** a turn completes on either backend
- **THEN** the result record includes backend kind, driver kind, and run id
