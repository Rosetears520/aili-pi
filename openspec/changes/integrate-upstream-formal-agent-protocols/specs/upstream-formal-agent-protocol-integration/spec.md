## ADDED Requirements

### Requirement: Public artifacts SHALL use independently reviewable status evidence

The integration SHALL distinguish decision status, contract acceptance, implementation authorization, implementation status, verification status, Git operation status and release status. Human-facing artifacts SHALL express uncertainty in ordinary language and SHALL NOT use a current conversation, opaque runtime reference, uncommitted worktree or sibling generated artifact as the sole evidence for accepted, done, verified or authorized status.

#### Scenario: Historical completion claim has no accessible implementation evidence

- **WHEN** a coordinated artifact marks a package done but the referenced public revision contains no corresponding code or tests
- **THEN** the integration records the package as pending, blocked-upstream or not-independently-verifiable and preserves the missing evidence as an explicit limitation

#### Scenario: Runtime reference supplements portable evidence

- **WHEN** an internal Agent Journal provides an opaque runtime reference
- **THEN** the reference MAY be retained as supplemental metadata but the public completion claim SHALL also cite portable artifact, revision and verification evidence

### Requirement: The umbrella SHALL be the sole BUILD and release owner for overlapping scope

`integrate-upstream-formal-agent-protocols` SHALL be the only active BUILD board and release gate for work overlapping `add-file-task-board` and `separate-shared-and-pi-skill-distribution`. The older changes SHALL remain readable as historical and capability-source references but SHALL NOT independently dispatch, advance, accept or close overlapping packages.

#### Scenario: BUILD resolves the overlapping execution owner

- **WHEN** BUILD begins for routing, formal-board or shared/Pi distribution work covered by this change
- **THEN** the implementation queue and completion status are read from this umbrella and the older changes are treated as non-executing references

#### Scenario: An older board reports overlapping work done

- **WHEN** an older change contains a done marker or runtime evidence for overlapping scope
- **THEN** that marker is historical evidence to reconcile and does not complete or advance the umbrella gate without current accepted traceability and fresh verification

#### Scenario: Non-overlapping independent proposal remains active

- **WHEN** a separate TUI/image-paste or emergency-checkpoint proposal has its own non-overlapping scope
- **THEN** its independent status remains unchanged and it is not converted into a historical source by this ownership decision

### Requirement: BUILD SHALL consume one exact upstream protocol release

Before dependent implementation begins, the integration SHALL verify one exact `rose-aili` release containing `aili-agent-selection/v1` and `aili-task-board/v1`. The verified tuple SHALL include exact version, 40-character source commit, npm `gitHead`, tarball SHA-256, both protocol reference SHA-256 values and canonical role inventory.

#### Scenario: Moving dist-tag is the only upstream input

- **WHEN** only `rose-aili@latest` or another moving tag is known
- **THEN** dependent BUILD packages remain blocked because a moving tag is not an exact release identity

#### Scenario: Exact tarball and revision agree

- **WHEN** version, commit, npm `gitHead`, tarball hash, protocol hashes and role inventory all resolve to the same accepted release
- **THEN** the upstream prerequisite MAY be marked satisfied without granting lockfile, Git, publish or release authority

### Requirement: Pi routing projection SHALL be deterministic and generated

The integration SHALL generate a Pi-readable routing manifest from the exact upstream Agent-selection matrix and canonical roles. Every canonical specialist SHALL map exactly once to `aili.<role-id>`; `general`, unknown roles, duplicate mappings, unsupported protocol versions and source-hash drift SHALL fail validation. Role descriptions SHALL continue to come from validated RoleProfiles rather than the routing manifest.

#### Scenario: Exact specialist matrix is generated

- **WHEN** the generator reads the accepted matrix and role inventory
- **THEN** the output records exact source identity and one routing row per canonical specialist in deterministic order

#### Scenario: General appears in the specialist matrix

- **WHEN** generated input or output includes `general` as a specialist row
- **THEN** generation or validation fails visibly and no fallback manifest is accepted

### Requirement: Model-facing routing SHALL distinguish ordinary and formal work

Ordinary work SHALL retain benefit-based delegation and omitted-agent normalization to `general`. Formal work SHALL require an explicit Specialized selector and explicit sync/async mode, keep decisions/integration/final verification with ROSE, and require Agent-owned packages to use their exact owner. The compact catalog SHALL be injected only while the `task` tool is active.

#### Scenario: Ordinary task omits agent

- **WHEN** a task has no validated formal context and omits `agent`
- **THEN** existing ordinary normalization to `general` and ordinary async defaults remain unchanged

#### Scenario: Formal task omits specialist or async mode

- **WHEN** a formal task omits `agent`, selects `general`, or omits explicit async mode
- **THEN** allocation fails before child execution and does not silently fall back to ordinary behavior

#### Scenario: Task tool is inactive

- **WHEN** the `task` tool is not active for the turn
- **THEN** the full compact role catalog is not injected as orphan prompt content

### Requirement: Persistent continuation SHALL preserve package identity

A persistent Agent MAY continue only for the same package, canonical role, scope, forbidden scope, write scope, acceptance boundary and expected-evidence contract. A new requirement, package, role, scope, permission or verification claim SHALL use a new job or Agent identity.

#### Scenario: Same-package clarification

- **WHEN** a follow-up only clarifies or supplements evidence inside the unchanged package contract
- **THEN** the same persistent Agent MAY continue and the continuation audit records unchanged identity fields

#### Scenario: Scope or claim changes

- **WHEN** the requested work changes package scope, write permissions, role or verification claim
- **THEN** continuation is rejected and a new bounded job or Agent is required

### Requirement: Pi formal-board adapter SHALL fail closed on unsafe identity

The adapter SHALL consume `aili-task-board/v1` at one exact repository-contained OpenSpec change root, support the canonical headers/packages/seven states/dependencies/roles/waivers/joins/evidence/dispositions/checkboxes/progress contract, and reject traversal, symlink, collision, ambiguity or mismatched identity before allocation or mutation. Legacy/unmanaged boards SHALL remain readable and SHALL NOT auto-migrate.

#### Scenario: Exact valid formal board

- **WHEN** `formalContext.changeId` resolves to one valid same-repository v1 board
- **THEN** the adapter returns the exact board identity and owning protected paths

#### Scenario: Unsafe or ambiguous board identity

- **WHEN** the change ID traverses, resolves through a symlink, collides, is ambiguous, or identifies a legacy/mismatched board
- **THEN** the request fails before child allocation and changes zero board bytes

### Requirement: `formalContext` v1 SHALL remain change-scoped

The public formal task input SHALL contain only `{ changeId }`. Runtime SHALL use it for exact board identity and protected-path derivation. The orchestrator SHALL validate the current package owner before dispatch and SHALL NOT infer package identity from free-form task text.

#### Scenario: Formal assignment names a package in its bounded contract

- **WHEN** ROSE dispatches a formal package under a valid change ID
- **THEN** ROSE verifies the package and owner from the board and includes the package ID in the assignment without extending the public v1 schema

#### Scenario: Caller relies on natural-language package inference

- **WHEN** a formal caller supplies only ambiguous task prose and no validated board package
- **THEN** the adapter rejects the assignment instead of guessing a package ID

### Requirement: Formal children SHALL NOT mutate their owning board

The Runtime SHALL derive owning `formal-task-board.md` and `progress.txt` from validated change identity, leave OpenSpec `tasks.md` as the accepted task-definition artifact without automatic migration, persist the two Runtime-owned protected paths across workspace leases and Agent lifecycle, and deny `write`/`edit` before mutation. Formal child bash SHALL be available only when exact deny protection is provable; otherwise bash SHALL be removed. Ordinary children SHALL preserve existing behavior, and YOLO SHALL NOT bypass the formal deny.

#### Scenario: Formal child attempts direct board mutation

- **WHEN** a formal child writes or edits its owning tasks or progress file through any supported workspace mode
- **THEN** the mutation is denied before bytes change while permitted neighboring files remain governed by the accepted write scope

#### Scenario: Exact bash protection is unavailable

- **WHEN** the Runtime cannot prove exact owning-file deny for formal child bash
- **THEN** bash is absent for that formal child and no command-string heuristic or YOLO fallback is used

#### Scenario: Ordinary child has no formal context

- **WHEN** an ordinary child is allocated without `formalContext`
- **THEN** its existing write scope, bash, sandbox, permission mode and default routing behavior remain unchanged

### Requirement: Restart reconciliation SHALL never create false completion

On formal resume, the adapter SHALL reconcile exact board state, bounded progress and readable Agent Journal/output/history. Completed or partial work with readable canonical result SHALL map to `returned`; blocked, failed, interrupted, unexecuted or missing result SHALL map to `blocked`. Reconciliation SHALL append evidence and SHALL NOT replay, redispatch, choose a fallback selector, accept a result, mark done or advance phase automatically.

#### Scenario: Completed job has readable result

- **WHEN** restart finds a completed or partial job with readable canonical output
- **THEN** the package becomes `returned`, a bounded `RECONCILED` event is appended, and ROSE inspection remains required before done

#### Scenario: Job evidence is missing

- **WHEN** restart finds failed, interrupted, unexecuted or unreadable/missing result evidence
- **THEN** the package becomes blocked and no replay or substitute dispatch occurs

### Requirement: `aili-pi` SHALL not own shared Skill installation

Generic `skills/**` MAY remain repository-local as an exact verification baseline but SHALL NOT be included as an installed runtime resource, published in the npm tarball, registered as Pi package Skills, semantically hand-edited, or copied to `~/.agents/skills` by `aili-pi`. Install/update/remove flows SHALL NOT invoke `rose-aili` implicitly.

#### Scenario: Package tarball is inspected

- **WHEN** `npm pack --dry-run --json` is run for the candidate
- **THEN** generic shared Skills and their global-sync installer path are absent while required Pi-owned resources remain present

#### Scenario: Disposable HOME lifecycle runs

- **WHEN** the candidate is installed, updated and removed in a seeded disposable HOME
- **THEN** the shared `~/.agents/skills` tree remains byte-identical and no implicit npm/npx/`rose-aili` child is invoked

### Requirement: Doctor SHALL report compatibility without repair

Doctor SHALL inspect the default shared protocol references without network access or mutation and report `present-compatible`, `missing`, `incompatible` or `unverified`. It MAY report exact/compatible-newer/modified/unknown source match separately, but SHALL determine compatibility from supported protocol version, required role inventory and required structure rather than exact hash alone.

#### Scenario: Compatible newer source has a different hash

- **WHEN** required protocol versions, roles and structures are compatible but the source hash differs from the pinned release
- **THEN** doctor reports compatible status with a non-exact source-match detail rather than incompatible

#### Scenario: Required protocol is missing

- **WHEN** one required reference is absent
- **THEN** doctor reports missing, integrated workflow remains non-pass, and doctor performs no install, update, fallback or network request

### Requirement: Independent proposals SHALL retain independent status

The formal-board/distribution release gate SHALL NOT require completion of the TUI/image-paste or emergency-checkpoint proposals, and completion of this integration SHALL NOT mark those proposals implemented. The emergency-checkpoint proposal SHALL remain blocked until its official Pi provider-runtime seam exists and is separately accepted.

#### Scenario: Formal integration passes while emergency checkpoint remains blocked

- **WHEN** every integration requirement has fresh evidence but the provider-runtime seam is still absent
- **THEN** this integration MAY proceed to its own closeout while the emergency-checkpoint proposal remains proposal-only and blocked

### Requirement: Completion and release authority SHALL remain separate

The change SHALL require fresh evidence for public artifact correction, exact upstream pin, generated routing, formal adapter, distribution boundary, doctor, tarball, disposable HOME and Runtime regressions. Implementation/test completion SHALL NOT grant commit, push, publish, GitHub release or real WSL install authority.

#### Scenario: All local verification passes

- **WHEN** all selected local checks pass for the candidate
- **THEN** implementation and verification states MAY be marked complete, while every Git/publication/real-install operation remains pending until separately approved
