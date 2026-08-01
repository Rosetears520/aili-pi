## ADDED Requirements

> **Historical capability-source status (2026-08-01):** These requirements are retained for source material. `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This specification does not independently authorize package dispatch, advancement, acceptance, closure, publication, or release, and historical completion/runtime claims elsewhere in this change were not reverified here.

### Requirement: Agent Catalog is derived from canonical RoleProfiles
AILI SHALL derive every catalog entry from the same validated `RoleProfile` records that authorize `task.agent`. Each entry SHALL contain the canonical selector, normalized one-line description, role status, and bounded tool/capability posture. Every current selector SHALL appear exactly once in canonical order in the underlying catalog. AILI MUST NOT maintain a separate hand-authored selector-description, prompt, tool, capability, model, or spawn mapping.

#### Scenario: Catalog is generated from valid profiles
- **WHEN** the current RoleProfiles validate
- **THEN** every canonical selector appears exactly once with its RoleProfile-derived description and bounded posture

#### Scenario: Role description changes canonically
- **WHEN** an accepted role regeneration changes a RoleProfile description
- **THEN** the next projection uses that description without editing a second catalog mapping

#### Scenario: Duplicate manual description map is introduced
- **WHEN** catalog output depends on a separate selector-description table
- **THEN** generated validation fails and the duplicate source cannot become runtime authority

### Requirement: Phase views are routing policy over the canonical catalog
AILI lifecycle policy SHALL define bounded recommended selector sets for IDEATE, DEFINE, BUILD, and SHIP. Every recommended selector MUST resolve in the current canonical catalog, and every displayed description SHALL be read from its RoleProfile entry. A phase set SHALL be recommendation/routing policy only; it MUST NOT create a second description authority, role capability, permission allowlist, or exhaustive prohibition on another matching Specialized selector.

#### Scenario: DEFINE view is built
- **WHEN** DEFINE is active
- **THEN** the view foregrounds `aili.code-scout`, `aili.spec-miner`, `aili.plan-auditor`, `aili.test-coverage-reviewer`, and `aili.security-auditor` using current RoleProfile descriptions

#### Scenario: Active board uses another matching specialist
- **WHEN** a nonterminal package names a canonical Specialized selector outside the recommended phase set and records a responsibility-matching dispatch reason
- **THEN** the selector remains valid and is foregrounded from the canonical catalog without changing phase permissions

#### Scenario: Phase policy names an unknown selector
- **WHEN** a recommended selector is absent from validated RoleProfiles
- **THEN** the phase projection fails visibly rather than omitting, renaming, or replacing it

### Requirement: Main Agent sees relevant responsibilities before lifecycle dispatch
When `task` is active, its model-facing metadata SHALL explain the ordinary-versus-lifecycle routing distinction, exact selector dispatch, explicit sync/async behavior, join/inspection requirements, ROSE-only duties, and waiver rule. During an active formal lifecycle, guidance SHALL foreground the current phase recommendations and canonical Agent Owners of nonterminal board packages before a task call. A caller MUST NOT need to submit an invalid request to discover the relevant roles.

#### Scenario: Formal BUILD package is ready
- **WHEN** BUILD is active and an implementer-owned package is ready
- **THEN** the main Agent sees `aili.implementer` with its responsibility and the rule to dispatch that exact Owner before duplicate direct work

#### Scenario: Ordinary Pi request uses task
- **WHEN** no formal lifecycle board is active
- **THEN** metadata preserves benefit-based delegation and states that omitted `agent` uses ordinary `general` compatibility

#### Scenario: Task tool is inactive
- **WHEN** `task` is not in the active tool set
- **THEN** no standalone Agent Catalog or orphan task guidance is appended to the model context

### Requirement: Catalog exposure is bounded and does not reveal full profiles
The model-facing projection SHALL use a normalized one-line responsibility per displayed selector plus bounded status/posture. It MUST NOT include full role prompts, profile bodies, profile/source hashes, source paths, provenance text, model credentials, or unrelated inactive phase lists. The full validated catalog MAY remain available to deterministic validation without injecting all entries as the current choice list.

#### Scenario: Phase view is rendered
- **WHEN** lifecycle guidance renders relevant roles
- **THEN** each displayed entry is bounded to selector, one-line responsibility, status, and simplified posture

#### Scenario: Full role prompt contains implementation detail
- **WHEN** a RoleProfile prompt is longer than its description
- **THEN** no prompt body text appears in the catalog projection

### Requirement: Formal Agent Owners bind exactly to specialized task selectors
For every `Owner: agent:<selector>`, board validation SHALL resolve `<selector>` against the current Agent Catalog and require a current Specialized selector. Dispatch SHALL pass the same exact value to `task.agent` and SHALL pass only the current exact change identity as `task.formalContext.changeId`. Agent instance name, Agent ID, job ID, turn ID, output ref, history ref, or caller-supplied board path MUST NOT be used as Owner or formal-context values and SHALL appear only in Runtime after dispatch where applicable.

#### Scenario: Specialized Owner is dispatched
- **WHEN** Owner is `agent:aili.test-engineer`
- **THEN** dispatch uses `task.agent="aili.test-engineer"`, passes the exact change ID in `task.formalContext`, and Runtime separately records returned instance refs

#### Scenario: Formal dispatch omits formal context
- **WHEN** orchestration prepares an Agent-owned formal task request without `formalContext`
- **THEN** formal request validation fails before allocation even though an ordinary task may omit that field

#### Scenario: Owner contains an Agent instance ID
- **WHEN** Owner is `agent:TestWorker42` or an `agent://` ref
- **THEN** validation rejects it rather than reinterpreting it as a selector

#### Scenario: Selector changes after board creation
- **WHEN** an Owner no longer resolves in the current canonical catalog
- **THEN** the package becomes blocked for explicit board revision and does not silently use another Agent

### Requirement: General remains ordinary compatibility, not formal package ownership
The existing Runtime behavior in which omitted `agent` selects `general` SHALL remain available for ordinary Pi use. A formal Agent-owned lifecycle package SHALL explicitly name a Specialized selector; omitted agent, `general`, and noncanonical `aili.general` MUST NOT satisfy formal ownership. This lifecycle rule MUST NOT remove or rename the ordinary `general` selector or alter its current spawn/runtime policy.

#### Scenario: Formal caller omits agent
- **WHEN** a formal Agent-owned package dispatch request omits `agent`
- **THEN** orchestration validation fails before allocation even though the ordinary Runtime would default to general

#### Scenario: Ordinary caller omits agent
- **WHEN** an ordinary non-lifecycle task request omits `agent`
- **THEN** existing Runtime normalization may select `general` unchanged

#### Scenario: Formal package explicitly names general
- **WHEN** Owner is `agent:general`
- **THEN** the package cannot become ready and must be decomposed, assigned a matching Specialized selector, or returned to ROSE

### Requirement: Catalog and availability failures remain visible
Manifest/profile validation failures, invalid phase selectors, unknown Owners, and unavailable required capabilities SHALL produce bounded non-pass diagnostics. An unavailable selector MAY be waived to ROSE direct work only when a pre-recorded lifecycle waiver proves equivalent lawful tools, permissions, scope, acceptance, and evidence capability; otherwise the package SHALL be blocked. AILI MUST NOT use stale catalogs or silently fall back to `general` or a different selector.

#### Scenario: Manifest hash validation fails
- **WHEN** a RoleProfile does not match canonical manifest evidence
- **THEN** catalog-dependent lifecycle dispatch fails visibly without stale entries

#### Scenario: Required capability is unavailable to both role and ROSE
- **WHEN** the package requires a capability neither the selected role nor ROSE can lawfully provide
- **THEN** the package becomes blocked and no alternate selector is claimed as executed

#### Scenario: ROSE has equivalent lawful capability
- **WHEN** the selected role is unavailable but ROSE can satisfy the exact package contract under current permissions
- **THEN** ROSE may pre-record a valid waiver and direct evidence without changing the catalog's availability claim

### Requirement: Catalog projection does not change Agent or permission semantics
Catalog and phase guidance SHALL be read-only routing aids. They MUST NOT add selectors, tools, capabilities, models, spawn permissions, workspace access, lifecycle authority, operation approval, or availability claims. `Default | Plan | Build | YOLO`, `/perm`, `Alt+M`, sandbox state, credential denial, parent tool ceilings, ordinary default general/default async, and existing task/hub Agent/job/turn lifecycle SHALL remain unchanged.

The optional `formalContext: { changeId }` task-item field SHALL be a validated formal identity and protection input, not a permission grant or a board-content transport. Omitting it SHALL preserve ordinary task normalization. When present, it MAY only remove formal child mutation capability needed to protect the exact owning board; it MUST NOT broaden any permission or alter an ordinary task.

#### Scenario: Catalog lists an implementer
- **WHEN** `aili.implementer` appears in BUILD guidance
- **THEN** the listing grants no write access beyond the role, task call, workspace scope, permission mode, and current approvals

#### Scenario: Permission mode changes
- **WHEN** the user changes permission mode through existing controls
- **THEN** Agent Catalog content neither initiates the change nor overrides its effect

#### Scenario: Lifecycle uses synchronous work
- **WHEN** a formal prerequisite maps `Execution: sync` to `task.async:false`
- **THEN** ordinary top-level Runtime default-async semantics remain unchanged for calls that omit async outside the formal adapter
