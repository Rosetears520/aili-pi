## ADDED Requirements

> **Historical capability-source status (2026-08-01):** These requirements are retained for source material. `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This specification does not independently authorize package dispatch, advancement, acceptance, closure, publication, or release, and historical completion/runtime claims elsewhere in this change were not reverified here.

### Requirement: Shared Skills have one explicit installer
Shared `.agents` Skills SHALL be installed and updated only by the independently invoked `rose-aili` CLI. `aili-pi` SHALL document `npx -y rose-aili@latest install` and `npx -y rose-aili@latest update`, but SHALL NOT execute either command from npm lifecycle scripts, Pi Package hooks, bootstrap defaults, Extension commands, or update handlers.

#### Scenario: User installs shared Skills
- **WHEN** the user explicitly runs `npx -y rose-aili@latest install`
- **THEN** `rose-aili` MAY manage its declared shared Skills, while `aili-pi` performs no duplicate shared-skill write

#### Scenario: User installs or updates aili-pi only
- **WHEN** Pi installs or updates `@rosetears/aili-pi`
- **THEN** no `rose-aili`, npm, npx, GitHub, or `~/.agents/skills` mutation SHALL be initiated by `aili-pi`

### Requirement: The Pi package does not distribute the generic snapshot as runtime content
The repository MAY retain an exact `skills/**` snapshot and lock for build-time compatibility/provenance evidence, but the published `@rosetears/aili-pi` tarball SHALL exclude that generic snapshot and `package.json#pi.skills` SHALL NOT reference it.

#### Scenario: npm tarball inventory is inspected
- **WHEN** `npm pack --dry-run --json` produces the planned file inventory
- **THEN** no path under package `skills/` or executable global-sync owner SHALL be present

#### Scenario: source-tree verification runs
- **WHEN** repository-local snapshot verification is selected
- **THEN** it MAY validate exact pinned content without installing or registering that content for Pi

### Requirement: aili-pi has no shared-skill postinstall
`@rosetears/aili-pi` SHALL have no npm lifecycle script or reachable installed runtime that replaces, creates, prunes, or synchronizes `~/.agents/skills`. Removing the prior lifecycle SHALL reconcile lock metadata without changing the dependency graph.

#### Scenario: Package installs in a disposable HOME
- **WHEN** the packed package is installed or updated under a disposable Pi-managed HOME
- **THEN** the before/after `.agents` inventory SHALL remain byte-identical and no network child for `rose-aili` SHALL run

#### Scenario: Lockfile is reconciled
- **WHEN** `postinstall` is removed
- **THEN** root `hasInstallScript` metadata SHALL match `package.json`, while dependency names, versions and integrity records remain unchanged

### Requirement: Pi-specific Skills are package-owned resources
Any future AILI-owned Pi-specific Skill SHALL live under `pi-skills/<name>/SKILL.md`, be included in the package allowlist, and be explicitly registered through `package.json#pi.skills`. It SHALL NOT be copied to `.agents`, project `.pi/skills`, or user `~/.pi/agent/skills` by package installation.

#### Scenario: No Pi-specific Skill is accepted
- **WHEN** the current package has no accepted Pi-specific workflow
- **THEN** no placeholder or duplicate Skill directory SHALL be created

#### Scenario: A future Pi-specific Skill is added
- **WHEN** a later accepted change adds one
- **THEN** package validation SHALL require a `pi-skills` source, explicit `pi.skills` entry, unique name and no shared generic body duplication

### Requirement: Compatibility visibility is read-only and fail-visible
`aili-pi` doctor SHALL report the observed shared workflow state without installing, fetching, rewriting or activating an embedded fallback. Missing or incompatible shared workflow evidence SHALL block only the affected integrated workflow PASS claim and SHALL include the explicit `rose-aili@latest` remediation command.

#### Scenario: Compatible shared workflow is present
- **WHEN** bounded read-only anchors identify the tested generic workflow contract
- **THEN** doctor MAY report `present-compatible` with exact observed evidence

#### Scenario: Shared workflow is missing or incompatible
- **WHEN** required anchors are absent, stale, conflicting or unreadable
- **THEN** doctor SHALL report `missing`, `incompatible` or `unverified`, SHALL NOT install a fallback, and SHALL NOT report integrated workflow PASS

### Requirement: Generic formal semantics remain upstream-owned
Removal of the current shared-skill fallback SHALL remain blocked until an exact `rose-aili` candidate contains the required generic formal task-board/delegation semantics. Pi-specific `formalContext`, `task`/`hub`, sandbox, Journal and Runtime details SHALL remain in `aili-pi` and SHALL NOT be added to shared Skills to satisfy this gate.

#### Scenario: Latest candidate lacks formal-board semantics
- **WHEN** the selected `rose-aili` candidate lacks the required generic protocol anchors
- **THEN** the migration package SHALL remain blocked and no local semantic overlay SHALL be installed

#### Scenario: Exact upstream candidate is accepted
- **WHEN** an exact source/version includes the generic contract and passes source-owner verification
- **THEN** `aili-pi` MAY proceed with removing its shared install path while retaining Pi-specific adapter ownership
