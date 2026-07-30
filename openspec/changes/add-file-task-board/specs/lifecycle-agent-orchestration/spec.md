## ADDED Requirements

### Requirement: Ordinary Pi and active AILI lifecycle use explicit delegation precedence
Outside a resolved IDEATE, DEFINE, BUILD, or SHIP formal lifecycle, ordinary Pi SHALL retain benefit-based delegation and direct parent work MAY remain valid. Inside an active formal lifecycle, accepted work-package ownership SHALL control execution: an Agent-owned ready package MUST dispatch before ROSE performs the same scope, while ROSE-owned packages remain direct. This override MUST NOT imply that every lifecycle package is Agent-owned.

#### Scenario: Ordinary Pi request has no delegation benefit
- **WHEN** no formal AILI lifecycle board is active and delegation adds no concrete value
- **THEN** the main Agent may work directly without an Agent call or waiver

#### Scenario: Agent-owned formal package is ready
- **WHEN** an active lifecycle board marks a package ready with `Owner: agent:aili.code-scout`
- **THEN** package ownership overrides the ordinary benefit gate and ROSE dispatches the exact selector before doing the same scouting work

#### Scenario: ROSE-owned decision package is ready
- **WHEN** a package makes a material product, architecture, contract, permission, scope, acceptance, integration, or final-verdict decision
- **THEN** Owner is ROSE, Dispatch is forbidden, and no worker issues that decision

### Requirement: ROSE remains the orchestration and verdict authority
During an active lifecycle, ROSE SHALL own phase and change identity, package creation and decomposition, dependencies, Owner selection, scope and acceptance, material decisions, dispatch waivers, sync/async joins, Agent result inspection and disposition, integration, board/progress writes, final changed-scope inspection, fresh claim-matched verification, residual `Unverified`, phase advancement, and final user-facing verdict. A package mixing ROSE-only decision work with delegable execution SHALL be split before it becomes ready.

#### Scenario: Package mixes design decision and implementation
- **WHEN** one draft package both chooses a public contract and implements it
- **THEN** ROSE splits a decision package from the bounded Agent implementation package before execution

#### Scenario: Worker claims the entire change is complete
- **WHEN** a worker returns a final PASS or completion claim
- **THEN** ROSE treats it as evidence only and independently performs integration, final inspection, verification, and verdict

#### Scenario: Task board needs an update
- **WHEN** runtime evidence or a user decision changes package state
- **THEN** ROSE alone updates tasks/progress after inspecting the evidence

### Requirement: Bounded material execution defaults to a matching Specialized Agent
ROSE SHALL classify bounded material discovery, research, spec/test localization, implementation, test execution, browser/E2E evidence, security, coverage, silent-failure analysis, and independent review as Agent-owned when a canonical Specialized selector matches and current operation gates permit it. The package SHALL name the exact Owner, bounded scope, forbidden scope, expected result/evidence, acceptance, execution mode, and join before ready. Formal packages MUST NOT use omitted agent or `general` as the normal execution path.

#### Scenario: Bounded implementation package exists
- **WHEN** BUILD has an accepted, independently bounded implementation package matching `aili.implementer`
- **THEN** ROSE assigns that selector and dispatches it rather than implementing the same package first

#### Scenario: No matching Specialized role exists
- **WHEN** a material execution package cannot be matched to a canonical Specialized responsibility
- **THEN** ROSE decomposes or retains the work under ROSE with an explicit rationale, or blocks for DEFINE; it does not silently route through general

#### Scenario: Specialized selector outside phase recommendations fits
- **WHEN** a package requires a canonical Specialized role outside the current recommended shortlist
- **THEN** ROSE may select it with a responsibility-matching Dispatch reason because phase recommendations are not a hard allowlist

### Requirement: Direct execution of Agent-owned scope requires a valid pre-recorded waiver
ROSE MAY set `Dispatch: waived` only before direct execution and only with one allowed class plus concrete Evidence: user-supplied complete bounded evidence makes dispatch redundant; the selected role is unavailable but ROSE has equivalent lawful capability; or concrete measured dispatch cost exceeds added evidence value. Dependency failure, overlap requiring decomposition, changed scope, cancellation, invalid selector, missing permissions, or specialist-only capability absence SHALL use package state or DEFINE revision rather than a direct waiver. If accepted Evidence from another package exactly satisfies the scope, ROSE SHALL cancel the duplicate with superseded disposition and covering evidence instead of performing direct work or recording a waiver. Post-hoc and generic waivers MUST fail closed.

#### Scenario: User already supplied exact evidence
- **WHEN** user-provided files and anchors fully satisfy the package's expected evidence and another Agent cannot add material evidence
- **THEN** ROSE may record the complete-evidence waiver before direct inspection

#### Scenario: Another package already satisfies the scope
- **WHEN** accepted Evidence from another package exactly covers a duplicate package
- **THEN** ROSE cancels the duplicate as superseded and records the covering evidence without dispatch, direct work, or waiver

#### Scenario: Agent and ROSE both lack permission
- **WHEN** the package requires an operation that neither can perform under current approvals
- **THEN** the package becomes blocked and no waiver, Owner, or YOLO setting authorizes it

#### Scenario: Waiver is added after direct work
- **WHEN** ROSE performed Agent-owned scope before recording a waiver
- **THEN** validation reports an invalid post-hoc waiver and the package cannot satisfy the phase gate

### Requirement: Formal dispatch always declares sync or async and closes its join
A formal Agent-owned package SHALL map `Execution: sync` to explicit `task.async:false` when its result is required before the next decision or package. `Execution: async` SHALL map to explicit `task.async:true` only for independent, non-overlapping packages with a stable named Join and a plan for current work that can proceed safely. ROSE SHALL collect terminal state and readable output/history for every async member, inspect and dispose results, and close the join before any dependent package or phase gate advances.

#### Scenario: Scout result determines implementation scope
- **WHEN** an implementation package depends on code-scout evidence
- **THEN** ROSE dispatches the scout synchronously and does not ready the implementation package before inspection

#### Scenario: Two independent research packages run concurrently
- **WHEN** two packages have independent inputs, non-overlapping scope, and join `J-01`
- **THEN** ROSE may dispatch both asynchronously, continue only independent work, and wait for both before closing `J-01`

#### Scenario: Async result is never collected
- **WHEN** an async Agent terminates but ROSE has not read required output/history or recorded disposition
- **THEN** the join remains open and neither dependent work nor the phase gate completes

### Requirement: Agent results become usable only through evidence and ROSE disposition
Workers SHALL return the canonical bounded result envelope. Completed or partial readable results SHALL become returned and await ROSE inspection. Worker-blocked, failed, interrupted, unexecuted, or missing-required-output outcomes SHALL become blocked. ROSE SHALL record accepted, partially-accepted, rejected, superseded, or needs-follow-up disposition with accepted/rejected claims, Evidence, residual `Unverified`, and next action. Runtime settlement or worker claims MUST NOT establish acceptance, integration, verification, done, or phase completion.

#### Scenario: Readable partial implementation returns
- **WHEN** an implementer returns valid changes and evidence but names one unimplemented acceptance item
- **THEN** the package becomes returned and ROSE records partial acceptance plus transferred residual work or blocks follow-up

#### Scenario: Result has no required output
- **WHEN** the job is terminal but required output/history evidence is missing or unreadable
- **THEN** the package becomes blocked and the missing evidence is not treated as a successful return

#### Scenario: Returned result is accepted
- **WHEN** ROSE checks the result, integrates accepted work, inspects the affected scope, and runs required fresh verification
- **THEN** ROSE may record accepted disposition and done if every package Acceptance condition is satisfied

### Requirement: Phase guidance foregrounds relevant Specialized roles
Lifecycle guidance SHALL foreground a bounded recommended role view for each phase while deriving all displayed descriptions from canonical RoleProfiles: IDEATE emphasizes scouting/research/spec/evaluation; DEFINE emphasizes scouting/spec/plan/coverage/security; BUILD emphasizes implementer/test/browser/E2E; SHIP emphasizes code/security/silent-failure/coverage/PR/convergence review. The active board's nonterminal Agent Owners SHALL also remain visible. Recommendations MUST NOT become permission grants, a second selector-description map, or mandatory review lanes unrelated to accepted packages.

#### Scenario: BUILD guidance is active
- **WHEN** BUILD begins with accepted packages
- **THEN** guidance foregrounds implementer, test-engineer, browser-qa-runner, and e2e-artifact-runner descriptions plus any other current package Owners

#### Scenario: SHIP has no security package
- **WHEN** accepted scope exposes no concrete security review package
- **THEN** listing security-auditor as a recommended SHIP role does not automatically create or dispatch a security lane

#### Scenario: Role description is regenerated
- **WHEN** canonical RoleProfile text changes
- **THEN** every phase view uses the new one-line description without duplicating it in lifecycle policy

### Requirement: Bootstrap reconciliation is an exact evidence limitation, not delegation success
An explicitly accepted exact-change bootstrap bridge MAY reconcile an external synchronous runner that reveals only a session reference after return. ROSE SHALL still dispatch the exact Specialized owner and inspect the returned result, but SHALL record `external-task-session/v1`, unavailable job/turn/history, and `dispatch_timing=unverified-before-return`. The bridge MUST NOT count as proof that Runtime refs were persisted before dispatch, MUST NOT apply to another change or normal persistent Runtime, and MUST NOT satisfy a phase gate without the named accepted limitation, package evidence, disposition, joins, final inspection, and fresh verification.

#### Scenario: Bootstrap external result is reconciled after return
- **WHEN** the exact opted-in bootstrap runner returns a real `agent://` session reference after synchronous execution
- **THEN** ROSE may append the bounded observed dispatch/return/inspection bundle with the timing limitation and no fabricated refs

#### Scenario: Another lifecycle tries to reuse the bridge
- **WHEN** a different change or ordinary task lacks the exact user decision and identity binding
- **THEN** orchestration rejects the bridge and uses the normal persistent or ordinary routing contract

### Requirement: Lifecycle phase gates depend on the Agent Evidence Graph, not call counts
A lifecycle phase SHALL complete only when all accepted noncancelled packages are done; every Agent-owned package has exact Runtime refs, an exact accepted bootstrap bridge with its named limitation, or a valid waiver; every returned result has ROSE disposition; every required Join is closed; ROSE has performed phase-appropriate artifact or changed-scope inspection; fresh claim-matched verification supports the verdict; material deltas have returned to DEFINE; and residual `Unverified` items are explicit. A named blocking gate SHALL produce a blocked phase verdict rather than completion. A fixed number of Agent calls, terminal jobs, worker PASS claims, or unchecked outputs MUST NOT satisfy the gate.

#### Scenario: Several Agents completed but results were ignored
- **WHEN** the required number of Agents ran but ROSE did not inspect their outputs
- **THEN** the phase remains incomplete

#### Scenario: BUILD evidence graph closes
- **WHEN** all accepted BUILD packages are done, refs/waivers and joins are valid, returned results are dispositioned, final scope is inspected, and fresh verification supports the claims
- **THEN** ROSE may issue the BUILD verdict subject to remaining lifecycle/operation gates

#### Scenario: Material delta appears during BUILD
- **WHEN** Agent or ROSE evidence changes architecture, public contract, permissions, acceptance, or verification strategy
- **THEN** BUILD stops and returns to DEFINE reacceptance regardless of package progress

### Requirement: Phase-one orchestration preserves Runtime and permission boundaries
This change SHALL use the existing task/hub Agent/job/turn lifecycle and SHALL NOT change ordinary omitted-agent→general, ordinary top-level default-async, nested sync behavior, permission modes, credential denial, parent tool ceilings, or exact operation gates. It SHALL add one optional formal-only task-item identity field, `formalContext: { changeId }`, so Runtime can validate one exact current v1 root and protect its owning files. The field MUST NOT carry paths or board content, perform fuzzy lookup, persist phase state, grant permission, or change calls that omit it. It SHALL NOT add informal boards, hidden state, automatic child-context assembly, any other board lookup field, UI, scheduler, telemetry product surfaces, fixed dispatch quotas, or replacement CLI commands. Formal child mutation protection MAY tighten tool availability: exact sandbox `denyWrite` is required for formal bash, and bash is unavailable for that formal child when the audited sandbox cannot enforce it; ordinary sandbox semantics remain unchanged.

#### Scenario: Ordinary task omits async and agent
- **WHEN** a non-lifecycle caller uses the existing task API without those fields
- **THEN** current Runtime normalization remains unchanged

#### Scenario: Formal package requests dependency installation
- **WHEN** its board fields say ready but exact dependency approval is absent
- **THEN** orchestration remains blocked and does not treat Agent ownership as permission

#### Scenario: Ordinary task omits formal context
- **WHEN** a non-lifecycle caller uses the existing task API without `formalContext`
- **THEN** current Runtime normalization, tools, workspace, permission, and sandbox behavior remain unchanged

#### Scenario: Formal context identifies an invalid board
- **WHEN** a formal dispatch names a change ID whose exact same-root v1 pair cannot be validated
- **THEN** allocation fails visibly without fallback, fuzzy selection, child creation, or board mutation

#### Scenario: User asks for workboard UI later
- **WHEN** `/aili-work` or status-bar controls are requested
- **THEN** that feature requires a separate accepted change rather than entering phase one implicitly
