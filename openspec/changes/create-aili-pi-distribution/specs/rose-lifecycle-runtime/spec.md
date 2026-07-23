## ADDED Requirements

### Requirement: A single owned Extension composes AILI runtime behavior
[框架内] The Package SHALL expose one Extension entry that composes ROSE context, lifecycle routing, subagent tool, permission modes, capability registry, doctor, shortcuts, and minimal status. Helper modules MUST NOT be independently auto-loaded as competing extensions.

#### Scenario: Pi loads the package
- **WHEN** [框架内] Pi discovers and loads `@rosetears/aili-pi`
- **THEN** [框架内] exactly one AILI Extension entry registers the owned runtime surface

#### Scenario: Helper files are present
- **WHEN** [框架内] the Package contains internal runtime modules
- **THEN** [框架内] Pi does not register those modules as separate Extension entries

### Requirement: ROSE context appends to Pi system context
[框架内] Before each primary agent start, AILI SHALL append stable ROSE rules and a bounded runtime summary to Pi's current system prompt. It MUST NOT replace Pi's base prompt or claim that prompt text grants permissions.

#### Scenario: Primary agent starts
- **WHEN** [框架内] `before_agent_start` runs in a normal AILI-enabled session
- **THEN** [框架内] the resulting prompt contains Pi's original system prompt followed by ROSE and current AILI runtime summary

#### Scenario: Runtime summary is unavailable
- **WHEN** [框架内] a non-critical status source cannot be read
- **THEN** [框架内] AILI marks that status unverified or unavailable and does not invent runtime state

### Requirement: Lifecycle prompts preserve AILI entrypoints
[框架内] The Package SHALL provide `/ideate`, `/define`, `/build`, `/ship`, and `/local-review` prompt templates with their established separation: four delivery modes and one standalone local review command.

#### Scenario: User invokes a delivery prompt
- **WHEN** [框架内] the user invokes `/ideate`, `/define`, `/build`, or `/ship`
- **THEN** [框架内] the prompt routes to the canonical AILI delivery lifecycle without inventing backend-specific top-level lifecycle commands

#### Scenario: User invokes local review
- **WHEN** [框架内] the user invokes `/local-review`
- **THEN** [框架内] it remains a standalone audit and is not presented as a fifth lifecycle mode

### Requirement: Natural-language lifecycle intent remains supported
[框架内] ROSE SHALL recognize natural-language IDEATE, DEFINE, BUILD, and SHIP intent as equivalent routing signals, while slash commands SHALL NOT grant additional permission, acceptance, or verification authority.

#### Scenario: User asks to define a proposal without a slash command
- **WHEN** [框架内] the message clearly requests formal requirements/specification work
- **THEN** [框架内] ROSE applies the DEFINE gate and artifact contract

#### Scenario: Slash command is invoked without a required gate
- **WHEN** [框架内] `/build` is invoked without accepted artifacts/test plan
- **THEN** [框架内] ROSE reports the missing gate instead of treating the command as authorization

### Requirement: Project rules and user-owned context retain precedence
[框架内] AILI SHALL preserve Pi/project context loading and SHALL treat project rules as constraints that may narrow AILI behavior. It MUST NOT silently overwrite project `AGENTS.md`, user settings, or authentication.

#### Scenario: Project AGENTS rules exist
- **WHEN** [框架内] Pi loads a project with local agent rules
- **THEN** [框架内] ROSE and child task preparation include those rules as constraints without weakening them

#### Scenario: No project rules exist
- **WHEN** [框架内] the project has no local rules file
- **THEN** [框架内] AILI reports the absence where material and does not fabricate repository commands or architecture facts

### Requirement: Prompt and command conflicts are visible
[框架内] Doctor SHALL detect AILI prompt/command/shortcut name conflicts that Pi can observe. A conflict MUST NOT be silently classified as a passing installation.

#### Scenario: Another package owns the same prompt name
- **WHEN** [框架内] an AILI lifecycle prompt would be shadowed or ambiguous
- **THEN** [框架内] doctor reports the conflicting resource/source and returns a non-pass status

#### Scenario: No conflicts are detected
- **WHEN** [框架内] all owned resources register uniquely
- **THEN** [框架内] doctor reports the ROSE/lifecycle runtime surface as available

## Superseding Global ROSE Resource Requirements — 2026-07-23

[框架内] The prior extension-injected stable ROSE rule block is superseded by a globally installed Pi adapter. Runtime summaries may remain dynamic, but the static Pi-safe ROSE contract SHALL be installed as described below rather than duplicated in every agent start.

### Requirement: Static ROSE adapter is a marker-owned global block
[框架内] The package SHALL carry an `APPEND_SYSTEM.md` adapter template. An explicit global-resource installation action SHALL add or update only an AILI marker-bounded block in `~/.pi/agent/APPEND_SYSTEM.md`; it SHALL preserve all unrelated user content.

#### Scenario: Existing user append file has no AILI block
- **WHEN** [框架内] the global file contains user-managed content and no AILI marker
- **THEN** [框架内] installation appends one bounded AILI block without replacing the user-managed content

#### Scenario: Marker is malformed or belongs to another owner
- **WHEN** [框架内] the file has malformed/conflicting AILI markers
- **THEN** [框架内] installation fails visibly without editing the file

### Requirement: Global adapter is Pi-safe
[框架内] The adapter SHALL preserve ROSE role/goal, evidence-before-editing, minimal verification, task scope, uncertainty questions, user-language output, and project-rule precedence. It SHALL omit OpenCode frontmatter, OpenCode permission syntax, Task/task_id protocol, A33/external-directory policy, formal OpenSpec hard dependencies, and conflicting skill-routing controls.

#### Scenario: Installed adapter is inspected
- **WHEN** [框架内] template and installed marker block are checked
- **THEN** [框架内] required Pi-safe rules are present and excluded OpenCode-only controls are absent

## Superseding Pi-native Global AGENTS Synchronization Revision — 2026-07-24

[已知|用户] The user selected a Pi-native synchronization of `aili-workflows/templates/opencode-global-AGENTS.md`, not a byte-for-byte OpenCode prompt copy. The source SHALL be pinned to `aili-workflows@7eb35f357ad489f5841ee10dac1e44549c1bdb76` and its source content hash SHALL be recorded; runtime SHALL not fetch `main`.

### Requirement: Global adapter synchronizes portable governance mechanisms
[框架内] The Pi global adapter SHALL carry the portable cross-project mechanisms from the pinned source: instruction precedence, untrusted-content handling, bounded skill/lifecycle routing, delegation benefit/authority discipline, exact approvals, evidence-before-editing, claim hygiene, scope control, minimal verification, user-language output, and project-rule precedence. It SHALL express generic delegation through the public `subagent` contract and must not reintroduce `aili_task`.

#### Scenario: Portable governance is inspected
- **WHEN** [框架内] the packaged adapter and its source-lock/provenance record are checked
- **THEN** [框架内] each portable mechanism has a Pi-native mapping with the pinned source revision/hash

### Requirement: OpenCode-specific control planes remain excluded
[框架内] The synchronized adapter SHALL exclude OpenCode-only command/path/attachment control planes, including Task/task_id packet protocol, A33 attachment admission, OpenCode permission syntax, CodeGraph initialization authority, OpenCode-only global-file installation instructions, and mandatory formal lifecycle dependencies. It SHALL not duplicate project-local facts, commands, architecture, or test placement from the global source.

#### Scenario: Excluded mechanism is searched
- **WHEN** [框架内] the packaged Pi adapter is scanned for excluded OpenCode-only controls
- **THEN** [框架内] no excluded control is active and generic Pi `subagent`/permission semantics remain the only relevant runtime contract

## Superseding Benefit-Based Delegation Policy — 2026-07-24

[已知|用户] The user explicitly replaced the strict parent mutation gate with model-directed, benefit-based delegation. Subagents are intended to improve execution efficiency and preserve the main agent's context; the main agent remains responsible for decisions, scope, integration, and final verification.

### Requirement: Delegation is encouraged by net benefit and never used as a mutation unlock
[框架内] The AILI runtime SHALL communicate that bounded discovery, implementation, testing, or other execution SHOULD be delegated when specialist capability, parallelism, evidence isolation, or context preservation provides clear net benefit. It SHALL also communicate that direct parent work remains valid when delegation overhead outweighs that benefit. AILI MUST NOT block `write`, `edit`, `lsp_fix`, shell, or other mutation solely because no `subagent` call completed, and MUST NOT impose per-loop, per-turn, or per-session delegation quotas. Credential protection, vendor permission modes, exact approvals, and other independent safety gates SHALL remain unchanged.

#### Scenario: Independent work has clear benefit
- **WHEN** [框架内] a task has a suitable specialist, parallel independent units, or evidence that would materially pollute the main context
- **THEN** [框架内] the runtime guidance encourages a bounded `subagent` assignment while the main agent retains decisions and integration ownership

#### Scenario: Direct work has lower overhead
- **WHEN** [框架内] the task is bounded, dependent, overlapping, or otherwise lacks clear delegation benefit
- **THEN** [框架内] the parent may inspect, mutate, and verify directly without first calling `subagent`

#### Scenario: Delegation fails or is unavailable
- **WHEN** [框架内] a subagent run fails, returns no evidence, or is unavailable
- **THEN** [框架内] AILI does not treat that result as completion and does not require another run merely to unlock parent mutation

#### Scenario: Safety policy evaluates an operation
- **WHEN** [框架内] credential, permission, external-operation, destructive, Git, publication, or release policy applies
- **THEN** [框架内] that policy continues to allow, ask, or deny independently of whether delegation occurred
