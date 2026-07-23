## ADDED Requirements

### Requirement: AILI workflows is the only canonical skill source
[框架内] Shared skill正文 SHALL be edited only in `aili-workflows/.agents/skills`. `aili-pi` MUST NOT maintain a hand-written or semantic Pi-specific copy of the same skill正文.

#### Scenario: Skill正文 requires a backend-neutral correction
- **WHEN** [框架内] a skill contains an OpenCode-specific assumption that changes its shared semantics
- **THEN** [框架内] the correction is made and verified in the canonical `aili-workflows` repository before a new Pi snapshot is accepted

#### Scenario: A Pi-only overlay is proposed
- **WHEN** [框架内] an implementation attempts to patch skill正文 only inside `aili-pi`
- **THEN** [框架内] validation fails and identifies the duplicate semantic source

### Requirement: Releases embed an exact reproducible snapshot
[框架内] Every AILI Pi release SHALL embed the canonical skill tree from one fixed 40-character commit and SHALL record repository, root path, count, tree hash, content hashes, and synchronization metadata in a lock file.

#### Scenario: Snapshot is synchronized from a matching source
- **WHEN** [框架内] the sync tool receives a clean source matching the locked revision
- **THEN** [框架内] it copies the skill tree without semantic transformation and writes deterministic hashes

#### Scenario: Source revision or contents do not match
- **WHEN** [框架内] the source is dirty, at a different revision, incomplete, or hash-mismatched
- **THEN** [框架内] synchronization fails without updating the accepted snapshot or lock

### Requirement: Runtime never follows a moving upstream branch
[框架内] Package install and runtime SHALL use the embedded snapshot and SHALL NOT download skills from `main`, an unpinned URL, or another mutable source.

#### Scenario: User installs without access to GitHub
- **WHEN** [框架内] the npm Package is already available but `aili-workflows` is unreachable
- **THEN** [框架内] Pi discovers the complete embedded skill snapshot without a runtime upstream fetch

#### Scenario: Upstream main changes after release
- **WHEN** [框架内] canonical `main` advances after an AILI Pi version was published
- **THEN** [框架内] the published version's skill contents and hashes remain unchanged

### Requirement: Every skill has a compatibility record
[框架内] The compatibility inventory SHALL contain exactly one record for every embedded skill, including source path/hash, required capabilities, backend anchors, adapter owner, verification, status, reason, and named unverified evidence.

#### Scenario: Snapshot contains a newly added skill
- **WHEN** [框架内] snapshot verification finds a skill name with no inventory record
- **THEN** [框架内] the skill is treated as `blocked` and stable release validation fails

#### Scenario: Inventory contains stale or duplicate records
- **WHEN** [框架内] an inventory record has no matching skill or a skill name appears more than once
- **THEN** [框架内] validation fails with the exact offending records

### Requirement: Backend-neutral migration is evidence driven
[框架内] Upstream migration SHALL inspect `SKILL.md` plus owned scripts, references, and assets for backend names, concrete tools, paths, lifecycle assumptions, external side effects, and permission semantics. It SHALL preserve OpenCode behavior unless an accepted upstream contract explicitly changes it.

#### Scenario: Backend anchor is found in an owned script
- **WHEN** [框架内] a concrete OpenCode-only path or tool appears outside `SKILL.md`
- **THEN** [框架内] the inventory records it and migration cannot be marked complete until it is adapted, retained with evidence, or explicitly blocked

#### Scenario: Neutral rewrite changes product semantics
- **WHEN** [框架内] a proposed rewrite changes scope, permission, dependency, public contract, acceptance, or lifecycle authority
- **THEN** [框架内] the upstream lane stops for DEFINE instead of treating the change as mechanical migration

### Requirement: Snapshot drift is a release blocker
[框架内] CI/prepack SHALL verify the snapshot, lock, inventory, and canonical hashes. Generated drift SHALL fail the check and MUST NOT be silently rewritten during release.

#### Scenario: A generated skill is manually edited
- **WHEN** [框架内] an embedded snapshot file differs from the locked canonical hash
- **THEN** [框架内] validation fails and instructs the agent to change canonical source or resynchronize from an accepted revision

#### Scenario: All synchronization evidence matches
- **WHEN** [框架内] source revision, snapshot hashes, count, and inventory agree
- **THEN** [框架内] the synchronization gate passes with reproducible evidence
