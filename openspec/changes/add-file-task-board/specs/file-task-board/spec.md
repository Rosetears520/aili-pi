## ADDED Requirements

> **Historical capability-source status (2026-08-01):** These requirements are retained for source material. `openspec/changes/integrate-upstream-formal-agent-protocols` is the sole future BUILD and release owner for overlapping scope. This specification does not independently authorize package dispatch, advancement, acceptance, closure, publication, or release, and historical completion/runtime claims elsewhere in this change were not reverified here.

### Requirement: Formal work uses one deterministic OpenSpec task root
AILI SHALL store a v1 task board only at `openspec/changes/<change-id>/tasks.md` with an append-only `progress.txt` in the same explicitly resolved OpenSpec change root. AILI MUST NOT create `task/<task-id>`, `.aili/tasks/<task-id>`, a competing root `TODO.md`, hidden Todo database, or second formal task store.

#### Scenario: Formal OpenSpec change is resolved
- **WHEN** lifecycle routing resolves exact change `add-file-task-board`
- **THEN** AILI creates or reuses only `openspec/changes/add-file-task-board/tasks.md` and its same-root `progress.txt`

#### Scenario: Ordinary Pi work is selected
- **WHEN** no formal AILI lifecycle change is active
- **THEN** AILI creates no task-board artifact and ordinary direct work remains available

### Requirement: Formal identity and paths fail closed
The change identity SHALL come from the canonical lifecycle/OpenSpec identity gate and MUST NOT be guessed by fuzzy scan. Work package IDs SHALL be unique stable ASCII tokens matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. The change root and owned files MUST resolve as ordinary repository-contained paths and MUST reject absolute paths, `.` or `..` traversal, symlinks, collisions, ambiguity, and repository escapes before any write.

#### Scenario: Exact formal identity is safe
- **WHEN** the resolved change root and paired files are ordinary repository-contained paths
- **THEN** AILI accepts the identity without scanning for a substitute

#### Scenario: Formal root is a symlink
- **WHEN** the resolved change root or either owned file resolves through a symlink
- **THEN** AILI fails before mutation and reports the unsafe path

#### Scenario: Change identity is ambiguous
- **WHEN** lifecycle routing has not resolved exactly one OpenSpec change
- **THEN** board creation and update remain blocked with zero guessed writes

### Requirement: Task-board v1 has one fixed Markdown contract
A v1 board SHALL declare exactly one `Protocol: aili-task-board/v1`, `Task kind: formal`, task identity, goal, phase, board status, accepted contract, accepted verification, decision owner, and verification owner. Each work package SHALL have exactly one OpenSpec-compatible checkbox row and exactly one value for Status, Owner, Dispatch, Dispatch reason, No-dispatch reason, Execution, Join, Depends on, Scope, Forbidden scope, Expected result, Expected evidence, Acceptance, Runtime, Evidence, ROSE disposition, Blocker, and Next action.

#### Scenario: Valid v1 board is parsed
- **WHEN** every header and work-package field appears exactly once with valid values
- **THEN** the parser returns a deterministic ordered board without rewriting Markdown

#### Scenario: Field is missing or duplicated
- **WHEN** a required header or package field is absent or appears more than once
- **THEN** validation fails with a stable field-specific diagnostic and changes no files

#### Scenario: Prospective and actual evidence are confused
- **WHEN** a done package has Expected evidence text but its actual Evidence remains pending
- **THEN** validation fails because acceptance prose cannot establish execution evidence

### Requirement: Seven package states separate readiness, return, and completion
Package Status SHALL be exactly `pending`, `ready`, `running`, `returned`, `done`, `blocked`, or `cancelled`. `[x]` SHALL mean exactly done; all other states SHALL use `[ ]`. A completed or partial Agent run with readable canonical structured output SHALL transition running to returned. A worker-blocked result, failed/interrupted/unexecuted run, or missing/stale/unreadable required output SHALL transition to blocked. A ROSE-owned or valid-waived direct package MAY transition running directly to done only after ROSE records actual Evidence, an allowed disposition, and required fresh verification. Runtime completion, worker claims, disposition alone, or a checkbox alone MUST NOT create done.

#### Scenario: Readable completed result arrives
- **WHEN** a running Agent package completes and its canonical result plus required output/evidence refs are readable
- **THEN** ROSE records returned and leaves the checkbox unchecked pending inspection

#### Scenario: Partial readable result arrives
- **WHEN** a running Agent produces a readable partial result with explicit missing items
- **THEN** ROSE records returned for disposition and does not claim full acceptance

#### Scenario: Worker reports blocked
- **WHEN** the worker is blocked or runtime is failed, interrupted, unexecuted, or missing required output
- **THEN** ROSE records blocked with blocker and next action rather than returned or done

#### Scenario: ROSE completes a returned Agent package
- **WHEN** Acceptance is met by actual Evidence, ROSE has recorded an allowed disposition, accepted work is integrated or residual work is transferred, and required fresh verification exists
- **THEN** the returned package may become done and its checkbox becomes `[x]`

#### Scenario: ROSE completes a direct package
- **WHEN** a ROSE-owned or valid-waived package is running and ROSE completes direct work with actual Evidence, allowed disposition, and required fresh verification
- **THEN** it may transition directly to done without fabricating an Agent return

#### Scenario: Terminal package is reopened
- **WHEN** an edit tries to move done or cancelled back to a nonterminal state
- **THEN** validation rejects the transition and requires a new package ID for new scope

### Requirement: Dependencies, execution mode, and joins remain consistent
Every dependency SHALL reference an existing package and the graph MUST be acyclic. Pending MAY become ready only when all dependencies are done and current lifecycle/operation gates permit execution. ROSE-owned direct packages SHALL use `Execution: direct` and `Join: N/A`. Agent-owned required packages SHALL use `Execution: sync` with `Join: immediate` or `Execution: async` with a stable named join. Async members MUST be independent and no dependent package or phase gate may advance before every join member settles, has readable evidence or a blocker, and receives ROSE inspection/disposition.

#### Scenario: Dependency cycle exists
- **WHEN** package dependencies form a direct or transitive cycle
- **THEN** validation fails and no package in that cycle becomes ready

#### Scenario: Dependency is unfinished
- **WHEN** a pending package references a dependency that is not done
- **THEN** it remains pending even if its Owner and scope are otherwise valid

#### Scenario: Prerequisite result is synchronous
- **WHEN** the next package needs an Agent-owned package result
- **THEN** the package declares sync/immediate and dispatch maps to `async:false`

#### Scenario: Async join is incomplete
- **WHEN** one or more members of a named async join lack settlement, evidence/blocker, inspection, or disposition
- **THEN** join-dependent packages and the phase gate remain blocked from advancement

### Requirement: Actual evidence and ROSE disposition control terminal state
Evidence SHALL contain bounded progress, artifact, diff, output/history, or verification anchors and MUST NOT contain raw transcript, credentials, secrets, or unbounded logs. ROSE disposition SHALL be exactly `pending`, `accepted`, `partially-accepted`, `rejected`, `superseded`, or `needs-follow-up`. Done requires accepted or an allowed partially-accepted disposition; partially accepted results MUST name transferred residual work or an explicitly accepted limitation. Rejected and needs-follow-up results MUST NOT directly become done.

#### Scenario: Result is partially accepted
- **WHEN** ROSE accepts named claims but rejects or cannot verify others
- **THEN** disposition records both sets and the package becomes done only if every residual item is transferred or explicitly accepted as a limitation

#### Scenario: Result is rejected
- **WHEN** ROSE determines that returned evidence does not satisfy Acceptance
- **THEN** disposition becomes rejected and the package becomes blocked or is replaced rather than done

#### Scenario: Worker claims acceptance
- **WHEN** worker output says its result is accepted, integrated, verified, or complete
- **THEN** the text remains evidence only and cannot set ROSE disposition or terminal state

### Requirement: Only ROSE writes task-board artifacts
ROSE SHALL be the only Agent allowed to modify the current owning `tasks.md` and `progress.txt`. A formal task item SHALL carry the explicit identity marker `formalContext: { changeId }`; before allocation Runtime SHALL resolve only the exact same-repository v1 root for that ID and derive its two owning protected paths. Caller-supplied board paths, fuzzy lookup, prompt parsing, legacy/invalid roots, symlinks, and identity mismatch MUST fail closed. Delegated Agents SHALL return the canonical structured result and MUST NOT modify task-board files, lifecycle phase, user acceptance, ROSE disposition, join state, or final completion. Runtime-derived protected paths SHALL exclude the owning files even when child writeScope is empty, names the board root, or uses shared or isolated workspace. Formal child `write` and `edit` SHALL be denied before mutation; formal child `bash` SHALL use exact sandbox `denyWrite` paths when the existing audited sandbox is available and SHALL be unavailable otherwise. Ordinary tasks and global permission-mode semantics SHALL remain unchanged.

#### Scenario: Implementer attempts to edit the board
- **WHEN** a mutation-capable delegated implementer tries to write the owning `tasks.md` or `progress.txt`
- **THEN** mutation is denied before file modification and the result reports the boundary

#### Scenario: Parent directory is allowlisted
- **WHEN** child writeScope includes a parent directory containing the owning board files
- **THEN** the immutable protected-path exclusion still denies those two files while permitting other lawfully scoped files

#### Scenario: Formal context does not resolve exactly
- **WHEN** `formalContext.changeId` is missing, invalid, legacy, symlinked, identity-mismatched, or outside the current repository
- **THEN** Agent allocation fails before child creation and Runtime does not scan for another board

#### Scenario: Formal bash has no audited exact deny
- **WHEN** a formal child would receive bash but the existing permission sandbox cannot enforce the exact owning-file `denyWrite` set
- **THEN** bash is absent for that formal child rather than running with heuristic-only protection, including under YOLO

#### Scenario: Worker returns evidence
- **WHEN** a worker returns status, summary, evidence, changedFiles, verification, blockers, risks, and confidence
- **THEN** ROSE inspects the result and alone decides board, progress, disposition, integration, and verdict updates

### Requirement: Progress is append-only bounded execution evidence
`progress.txt` SHALL use RFC 3339 event blocks with an event subject, one v1 event type, and bounded `key=value` evidence. Board-level events SHALL use subject `BOARD`; package events SHALL use the stable package ID. Supported events SHALL be `BOARD_CREATED`, `READY`, `DISPATCHED`, `WAIVED`, `RETURNED`, `INSPECTED`, `JOINED`, `DONE`, `BLOCKED`, `UNBLOCKED`, `CANCELLED`, and `RECONCILED`. Progress MUST NOT duplicate the full board, raw output, transcript, credentials, secrets, or unbounded logs.

#### Scenario: Board is initialized
- **WHEN** ROSE creates a v1 board and paired progress file
- **THEN** ROSE appends one `BOARD BOARD_CREATED` event with formal identity, phase, current gate, and acceptance state

#### Scenario: Agent is dispatched
- **WHEN** `task` accepts an Agent-owned package
- **THEN** ROSE appends DISPATCHED with selector, execution/join, Agent/job/turn IDs, output/history refs, and no raw transcript

#### Scenario: Async member joins
- **WHEN** an async package settles and ROSE reads its evidence
- **THEN** ROSE appends JOINED for that package with the stable join ID and inspection state

#### Scenario: Existing progress history is updated
- **WHEN** a later event occurs
- **THEN** AILI appends a new block without rewriting, truncating, or reordering any prior valid event

### Requirement: Resume reconciles board and Agent Journal without replay
On resume, ROSE SHALL read the exact current board, read a bounded progress tail, query referenced nonterminal Agent/job state through `hub`, append RECONCILED, recompute joins and readiness, and only then select work. Completed/partial readable output SHALL reconcile to returned; worker-blocked, failed, interrupted, unexecuted, or missing output SHALL reconcile to blocked. Runtime state MUST NOT independently accept, dispatch again, create done, advance a phase, or grant permission.

#### Scenario: Board says running and job completed
- **WHEN** the referenced job completed and canonical output/history is readable
- **THEN** ROSE reconciles the package to returned and waits for inspection before done

#### Scenario: Board says running and turn was interrupted
- **WHEN** Agent Journal records interrupted or unexecuted work
- **THEN** ROSE marks the package blocked, records the interruption, and does not replay it automatically

#### Scenario: Async join resumes after restart
- **WHEN** some join members are terminal and others remain running
- **THEN** ROSE reconciles each member independently and keeps the join open without duplicating any dispatch

#### Scenario: Terminal board references released history
- **WHEN** a done or cancelled package points to a released or unavailable historical Agent
- **THEN** terminal board history remains unchanged and the stale evidence is reported without reopening work

### Requirement: Validator fails closed for v1 and preserves legacy OpenSpec tasks
The validator SHALL check formal path safety, headers, package IDs, dependencies/cycles, status/checkbox, Owner/Dispatch/Execution/Join consistency, runtime refs, actual Evidence/disposition, blockers/next action, progress structure, join closure, and phase-gate preconditions. It SHALL return stable diagnostics and MUST NOT auto-repair. An OpenSpec `tasks.md` without the v1 marker SHALL be classified `legacy/unmanaged`, not v1 PASS and not corrupt solely for being legacy.

#### Scenario: Running Agent package lacks runtime refs
- **WHEN** Status is running after dispatch and Runtime lacks required Agent/job/turn/output/history references
- **THEN** validation fails with a missing-runtime diagnostic

#### Scenario: Done package lacks inspection evidence
- **WHEN** Status is done but Evidence is pending, disposition is invalid, or required INSPECTED/DONE progress anchors are absent
- **THEN** validation fails and the checked box cannot establish completion

#### Scenario: Existing plain OpenSpec checklist is inspected
- **WHEN** `tasks.md` has no `aili-task-board/v1` marker
- **THEN** the validator reports legacy/unmanaged and does not rewrite or claim v1 conformance

#### Scenario: One legacy change explicitly opts in
- **WHEN** the user or accepted change explicitly requests v1 upgrade for one exact OpenSpec change
- **THEN** ROSE upgrades that change in place, preserves representable IDs/checkmarks/history, records migration evidence, and leaves every other change untouched

### Requirement: One exact bootstrap bridge preserves the strict persistent Runtime default
The normal v1 Runtime contract SHALL continue to require raw Agent/job/turn identities plus `agent://` output and `history://` history references. A bootstrap bridge MAY be enabled only by an explicit current user decision naming one exact change whose external runner cannot expose those identities. The bridge SHALL record the real external session reference using `external=agent://<session-ref>; transport=external-task-session/v1; unavailable=job,turn,history`, SHALL append BOARD and package `RECONCILED` evidence, and MUST NOT fabricate unavailable identifiers, rewrite prior progress, claim verified pre-dispatch persistence, grant authority, or enable the external form for another change. A later bootstrap package observed only after a synchronous external call returns SHALL record `dispatch_timing=unverified-before-return` as an accepted limitation. Default validation and every persistent board MUST reject this bridge unless the exact opt-in identity and decision evidence are supplied.

#### Scenario: Current bootstrap change is explicitly reconciled
- **WHEN** the user accepts the bridge for exact change `add-file-task-board` and ROSE supplies its real external session refs
- **THEN** AILI appends bounded RECONCILED evidence, preserves every prior progress byte, lists unavailable job/turn/history, and validates only under that exact bridge option

#### Scenario: Persistent board attempts external Runtime form
- **WHEN** no exact bootstrap opt-in is active or another change supplies the external form
- **THEN** validation fails and the strict five-reference Runtime contract remains unchanged

#### Scenario: External dispatch timing was not observable before return
- **WHEN** the external synchronous runner reveals its session ref only after completion
- **THEN** reconciliation records the observed result and explicit timing limitation rather than claiming pre-dispatch ref persistence

#### Scenario: Bootstrap migration invents missing identities
- **WHEN** a candidate bridge supplies synthetic job, turn, or history values instead of explicit unavailable fields
- **THEN** reconciliation fails with zero task/progress mutation

### Requirement: Task-board evidence does not grant lifecycle or operation authority
A task board, Owner, Dispatch, Execution, checkbox, progress event, Agent result, or active YOLO mode MUST NOT grant lifecycle acceptance, file/network/external access, dependency/lockfile changes, Git operations, credentials, publication, release, or permission-mode changes. Effective operations SHALL remain the intersection of higher-priority rules, lifecycle, active permission mode, tools, scope, and exact user approvals.

#### Scenario: Package names an unapproved publish operation
- **WHEN** a ready package names publish but no exact publish approval exists
- **THEN** it remains blocked regardless of Owner, Agent availability, dispatch, or YOLO

#### Scenario: DEFINE contains implementation packages
- **WHEN** the regenerated final test plan has not been explicitly accepted
- **THEN** implementation packages remain pending or blocked and no code implementation begins

#### Scenario: Many Agents completed
- **WHEN** a phase has terminal Agent jobs but required evidence, joins, disposition, final inspection, or fresh verification is absent
- **THEN** the phase remains incomplete because call counts do not satisfy lifecycle authority
