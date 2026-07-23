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
