## ADDED Requirements

### Requirement: AILI exposes task and hub as the only Agent orchestration surface
AILI SHALL register `task` for Agent creation/execution and `hub` for Agent communication, inspection, waiting, output/history retrieval, model-override requests, job listing, and cancellation. AILI MUST NOT register the legacy `subagent` tool or a behaviorally incompatible alias.

#### Scenario: Tool discovery after replacement
- **WHEN** the AILI Extension loads successfully
- **THEN** `task` and `hub` are available, `subagent` is absent, and the result identifies the AILI persistent Agent runtime

#### Scenario: Legacy subagent call is attempted
- **WHEN** a caller submits a tool call named `subagent`
- **THEN** AILI does not route it to `@agwab/pi-subagent` and does not create a new run/attempt record

### Requirement: The bundled Agent catalog contains nineteen specialized roles and general
AILI SHALL expose exactly the 19 existing specialized selectors as `aili.<role-name>` plus the canonical `general` selector. Omitting `agent` in `task` SHALL select `general`. AILI MUST NOT register `aili.general` or `task` as role aliases.

#### Scenario: Agent selector is omitted
- **WHEN** a valid flat or batch task omits `agent`
- **THEN** AILI creates an Agent with selector `general`

#### Scenario: Specialized selector is selected
- **WHEN** a caller selects an existing `aili.<role-name>`
- **THEN** AILI loads that role's complete specialized profile and does not substitute the `general` prompt

#### Scenario: Unsupported alias is selected
- **WHEN** a caller selects `aili.general`, `task`, or an unknown selector
- **THEN** AILI fails validation before Agent/session creation and lists the canonical available selectors

### Requirement: task creates a new stable Agent identity for every item
Each `task` item SHALL create a new stable Agent ID even when its requested `name` matches an existing Agent. A repeated requested name MUST receive a deterministic numeric suffix, and follow-up work on an existing Agent MUST use `hub send` with the allocated Agent ID.

#### Scenario: Requested name is unique
- **WHEN** a task requests the unused name `Scout`
- **THEN** AILI allocates `Scout`, persists it in the parent registry, and returns both Agent ID and job identity when applicable

#### Scenario: Requested name is repeated
- **WHEN** another task under the same parent requests `Scout`
- **THEN** AILI creates a distinct Agent such as `Scout-2` and does not resume the first Agent

#### Scenario: Nested Agent name is allocated
- **WHEN** an allowed child creates a grandchild
- **THEN** AILI allocates a path-safe parent-prefixed ID and prevents artifact collision with existing IDs

### Requirement: Child sessions are parent-scoped persistent official Pi sessions
Every non-ephemeral Agent SHALL use an independent official Pi `SessionManager` JSONL under an artifact root owned by its parent session. The registry SHALL retain the exact child session path, Agent selector, parent/owner, lifecycle status, current workspace, profile metadata, and model metadata required for rehydration.

#### Scenario: Persistent child is created
- **WHEN** a persisted parent creates an Agent
- **THEN** AILI creates a child Pi Session JSONL under the parent-owned sidecar and records its exact path before reporting successful startup

#### Scenario: Parent session is resumed
- **WHEN** Pi resumes a parent with a valid Agent sidecar
- **THEN** AILI replays durable coordinator state, validates child files, and reconstructs idle/parked/aborted registry entries without starting a new model turn

#### Scenario: Coordinator journal is corrupt
- **WHEN** replay finds corruption other than one reported final partial line
- **THEN** AILI fails closed for affected orchestration, preserves the files for diagnosis, and does not fabricate recovered Agents or deliveries

### Requirement: Agent lifecycle supports running idle parked and terminal aborted states
AILI SHALL implement `queued`, `running`, `idle`, `parked`, and terminal `aborted` registry states. Idle Agents SHALL park after a configurable default of 420000ms; a value less than or equal to zero SHALL disable only the idle timer. Park SHALL release the live session while retaining transcript and registry identity.

#### Scenario: Idle TTL expires
- **WHEN** an Agent remains idle for 420000ms under the default setting
- **THEN** AILI disposes its live session, marks it parked, and retains its Session JSONL and stable ID

#### Scenario: Parked Agent receives a message
- **WHEN** `hub send` targets a valid parked Agent whose workspace remains resumable
- **THEN** AILI reopens its Session JSONL, applies the latest valid profile/policy/model, and starts a new turn with the message

#### Scenario: Hard-aborted Agent receives a message
- **WHEN** `hub send` targets an Agent in terminal `aborted`
- **THEN** AILI rejects the message, identifies the terminal state, and leaves transcript retrieval available

### Requirement: Process loss is recorded without replaying side effects
A running turn interrupted by crash, signal, reload, session replacement, or graceful Pi exit SHALL receive a durable `interrupted` outcome and its Agent SHALL become parked/revivable. A queued item that never started SHALL become `unexecuted`. AILI MUST NOT automatically replay either item after restart.

#### Scenario: Process stops during a running turn
- **WHEN** the parent process ends before a child turn reaches a terminal result
- **THEN** recovery records the turn as interrupted, parks the Agent, and performs no automatic provider or tool call

#### Scenario: User continues an interrupted Agent
- **WHEN** the user or parent later sends a message to the interrupted Agent ID
- **THEN** AILI starts a new turn in the same transcript with explicit interruption context and does not claim the prior task completed

#### Scenario: Process stops with queued jobs
- **WHEN** process shutdown occurs before a queued job obtains the semaphore
- **THEN** AILI records the job as unexecuted and does not auto-start it on the next session

### Requirement: New child context is explicit and does not copy parent conversation
A new child SHALL receive the shared runtime/permission/message envelope, selected role profile, explicit task/context, current workspace, trusted rules/skills/context files, shared resource references, and approved-plan reference when present. It MUST NOT copy the parent's conversation branch by default.

#### Scenario: Child is initialized
- **WHEN** a parent with a long conversation creates a child with task and context
- **THEN** the child context contains the explicit inputs and approved shared resources but omits unrelated parent messages

#### Scenario: Parent contains sensitive unrelated conversation
- **WHEN** that content was not supplied through task/context or an allowed context resource
- **THEN** it is absent from the child's initial Session JSONL and model request

### Requirement: Profiles preserve role semantics and hot reload at turn boundaries
AILI SHALL preserve each specialized role's Role, Goal, Success criteria, Constraints, Tools, Output, and Stop semantics while replacing only obsolete runtime adapter text. `general` SHALL use an AILI-owned OMP-inspired worker prompt. Before every new turn or revive, AILI SHALL validate the latest profile hash/provenance and record the profile version actually used.

#### Scenario: Profile changes while Agent is idle
- **WHEN** a valid v2 profile replaces v1 after the prior turn settles
- **THEN** the next turn rebuilds the child runtime with v2 and records the v2 hash without rewriting earlier turns

#### Scenario: Profile changes during a turn
- **WHEN** an Agent is running while its profile changes
- **THEN** the current turn continues with its recorded profile and the change takes effect only at the next turn boundary

#### Scenario: Updated profile fails validation
- **WHEN** profile hash, schema, or provenance validation fails
- **THEN** the next turn fails before model startup and AILI does not silently use an unverified stale prompt

### Requirement: Built-in profile names cannot be silently shadowed
User-global or project profile content SHALL NOT replace a bundled selector merely because a same-name file exists. A specific selector MUST be explicitly opted into shadowing; project shadowing MUST also require trusted project state. The runtime catalog SHALL remain the 20 bundled selectors for this change.

#### Scenario: Same-name project profile lacks opt-in
- **WHEN** a project contains a same-name profile but no explicit override setting
- **THEN** AILI uses the bundled profile and reports the inactive collision in diagnostics

#### Scenario: Trusted project override is opted in
- **WHEN** the project is trusted and configuration explicitly selects its profile for one bundled selector
- **THEN** AILI validates and uses that profile, records project provenance, and leaves other selectors bundled

#### Scenario: Untrusted project requests shadowing
- **WHEN** project-local configuration requests a profile override before trust
- **THEN** AILI ignores it, reports the trust boundary, and does not execute project profile content

### Requirement: Effective tools never exceed parent or role authority
For `general`, effective tools SHALL equal the parent current active-tool ceiling intersected with child-loadable capabilities, hard guards, and any call narrowing. For a specialized role, the role tool ceiling SHALL be an additional intersection. A caller MAY narrow but MUST NOT expand the result.

#### Scenario: Parent disables a general tool
- **WHEN** `general` is created while a tool is not active in the parent
- **THEN** that tool is absent from the child even if installed globally

#### Scenario: Specialized role excludes a parent tool
- **WHEN** the parent has a write tool but the selected role is read-only
- **THEN** the write tool is absent from the child

#### Scenario: Parent tool cannot be reconstructed through public Pi APIs
- **WHEN** the tool name is active but no trusted/loadable child definition can be obtained
- **THEN** AILI removes it from the effective set, reports it as unavailable, and does not claim full inheritance

### Requirement: Spawn policy and recursion remain bounded
Each role SHALL declare an explicit `spawns` allowlist or no spawn permission. `general` MAY select any non-self specialized role. Recursion depth SHALL default to 2, be configurable only up to hard maximum 4, reject self-recursion, and never support unlimited depth. Top-level task execution MAY be async; child-to-grandchild execution MUST be synchronous.

#### Scenario: Role without spawns attempts delegation
- **WHEN** that child attempts to invoke `task`
- **THEN** the tool is absent or the call is denied before grandchild creation

#### Scenario: General selects specialized child
- **WHEN** `general` is below the depth ceiling and selects an allowed specialized role
- **THEN** AILI creates the child and forces the nested task call to wait synchronously

#### Scenario: Depth ceiling is reached
- **WHEN** a child at the configured maximum depth attempts another spawn
- **THEN** AILI rejects it without allocating an Agent ID or job

#### Scenario: Unlimited recursion is configured
- **WHEN** configuration supplies an unlimited sentinel or a value above 4
- **THEN** AILI rejects or clamps it with an explicit diagnostic and never enables unlimited recursion

### Requirement: Top-level tasks support bounded async and synchronous execution
`task` SHALL default non-blocking roles to async and SHALL allow the model-facing caller to request sync or background execution. Role `blocking` MUST force sync. Active Agent turns under one parent SHALL be limited to 32; excess work SHALL enter a FIFO queue.

#### Scenario: Default non-blocking task starts
- **WHEN** a non-blocking task omits `async`
- **THEN** `task` returns Agent/job IDs without waiting and the parent can continue while the child runs

#### Scenario: Caller requests synchronous execution
- **WHEN** a task sets `async:false`
- **THEN** the tool waits for settlement and returns the result directly without a duplicate async delivery

#### Scenario: Concurrency is saturated
- **WHEN** 32 turns are active and another task is accepted
- **THEN** the new job is durably marked queued and starts in FIFO order after a permit is released

#### Scenario: Long task exceeds no Agent budget
- **WHEN** a turn runs longer than previous timeout defaults or exceeds 200 assistant requests
- **THEN** AILI does not stop it because `maxRuntimeMs` and `softRequestBudget` default to zero, while manual cancel and provider/tool safeguards remain active

### Requirement: Async results are durable and exactly once in the parent transcript
Before parent delivery, AILI SHALL persist child output and a stable pending delivery record. On parent availability it SHALL inject a custom result message containing a stable delivery ID. Recovery SHALL scan the parent transcript for that ID so the same completion is visible at most once while remaining queryable through `hub`.

#### Scenario: Parent is active when job completes
- **WHEN** an async job settles successfully or unsuccessfully
- **THEN** AILI stores the output, injects one result message, and marks the delivery complete

#### Scenario: Parent is unavailable when job completes
- **WHEN** the parent session is closed or being replaced
- **THEN** AILI leaves a durable pending delivery and injects it when the same parent resumes

#### Scenario: Crash occurs after message append before acknowledgement
- **WHEN** the parent JSONL already contains the delivery ID but the coordinator journal lacks its delivered event
- **THEN** recovery marks it delivered without injecting a duplicate message

### Requirement: hub messaging follows running idle and parked semantics
`hub send` SHALL deliver to running Agents as a non-interrupting steering aside at the next safe step boundary, wake idle Agents with a new turn, and revive parked Agents before a new turn. It MUST NOT start concurrent turns for one Agent.

#### Scenario: Running Agent receives a message
- **WHEN** `hub send` targets a running Agent
- **THEN** the current tool step is not interrupted and the message is queued for the next safe model boundary

#### Scenario: Idle Agent receives a message
- **WHEN** `hub send` targets an idle Agent
- **THEN** AILI starts one new turn using the retained conversation

#### Scenario: Second task turn targets same Agent
- **WHEN** a caller attempts another concurrent turn for a running Agent
- **THEN** AILI rejects it and preserves the Agent JSONL single-writer invariant

### Requirement: Failed live hand-off uses a durable bounded mailbox
Only a transient failure during an attempted live hand-off SHALL enqueue a message. The parent-scoped mailbox SHALL survive restart, be inspectable/drainable through `hub inbox`, and hold at most 100 messages per Agent. Overflow MUST reject the newest message and return a visible failure receipt.

#### Scenario: Live hand-off succeeds
- **WHEN** `steer` or wake/revive accepts the full message
- **THEN** AILI does not also store it in mailbox

#### Scenario: Recipient disposes during hand-off
- **WHEN** live delivery throws during a lifecycle race
- **THEN** AILI durably enqueues the message and returns a failed-but-buffered receipt

#### Scenario: Mailbox is full
- **WHEN** a 101st pending message is sent to an Agent with 100 buffered messages
- **THEN** AILI keeps the existing 100, rejects the new message, and reports overflow to the sender without silent loss

#### Scenario: Revive failure is permanent
- **WHEN** a parked Agent cannot be revived because its workspace or session is invalid
- **THEN** AILI returns a permanent failure and does not inflate mailbox unread count

### Requirement: Cancellation is explicit and transcript preserving
`hub cancel` SHALL hard-abort a running job, mark its Agent terminal `aborted`, and retain available transcript/output. Canceling an idle or parked Agent with no job SHALL release/unregister the live identity without deleting transcript/artifacts.

#### Scenario: Running job is cancelled
- **WHEN** an authorized owner invokes `hub cancel` for a running job
- **THEN** AILI propagates abort, records job/turn/Agent terminal state, and prevents future revive

#### Scenario: Idle Agent is cancelled
- **WHEN** an authorized owner cancels an idle Agent with no job
- **THEN** AILI disposes and unregisters it while `history` remains readable from disk

#### Scenario: Cross-parent cancellation is attempted
- **WHEN** a caller targets an Agent outside its owned descendant scope
- **THEN** AILI returns not-found/unauthorized without disclosing or changing that Agent

### Requirement: Background approvals return to the parent UI
A background child tool call that resolves to `ask` SHALL pause only that job and route a sanitized approval request to the active parent UI. Approval SHALL resume the call; rejection SHALL fail that call. No UI, shutdown, bridge loss, or an immutable credential-path denial MUST fail closed.

#### Scenario: User approves a background tool call
- **WHEN** a child requests an ask-classified operation and the parent has UI
- **THEN** AILI shows Agent/tool/target context, records the user's decision, and resumes only that job

#### Scenario: Parent has no UI
- **WHEN** a background operation requires approval in headless/print mode
- **THEN** AILI denies it without hanging or switching the child to YOLO

#### Scenario: Credential path is targeted
- **WHEN** any child attempts file, bash, or custom-tool access to a protected credential/auth/private-key path
- **THEN** AILI blocks before approval and never returns credential content

### Requirement: Shared workspace concurrency is conflict aware and honest
`task` SHALL accept optional `writeScope` paths/resources and `workspace: auto|shared|isolated`. `auto` SHALL use shared workspace when known scopes do not conflict and SHALL isolate when declared or deterministically known scopes overlap. Undeclared scope SHALL default shared. AILI MUST NOT claim it can statically detect arbitrary bash or external-process side effects.

#### Scenario: Agents write disjoint files
- **WHEN** concurrent tasks declare non-overlapping paths and no shared resource conflict
- **THEN** `auto` permits both to use the shared workspace

#### Scenario: Agents declare overlapping write scopes
- **WHEN** a new task overlaps an active path or shared resource lease
- **THEN** `auto` starts it in an isolated workspace or fails clearly if isolation is unavailable

#### Scenario: Conflict is detected during execution
- **WHEN** a second observable file mutation conflicts with an active lease
- **THEN** AILI blocks that operation and reports an isolated retry instead of moving a partially executed Agent

#### Scenario: Caller explicitly requests isolation
- **WHEN** `workspace:isolated` is valid in a supported Git workspace
- **THEN** AILI creates a temporary isolated workspace and returns patch/branch evidence without automatically merging

#### Scenario: Isolation is unavailable
- **WHEN** conflict requires isolation but no safe backend can be created
- **THEN** AILI fails before conflicting mutation and does not silently fall back to shared write

### Requirement: Output and history use durable OMP-style layering
AILI SHALL persist full raw final output and child Session JSONL. Returned `SingleResult` output SHALL default to a tail of at most 500000 bytes or 5000 lines, and a normal parent completion preview SHALL default to 5000 characters with explicit truncation metadata. `agent://<id>` and `hub output` SHALL resolve the full raw artifact; `history://<id>` and `hub history` SHALL render a concise transcript from live or on-disk JSONL.

#### Scenario: Output is below preview limits
- **WHEN** a child returns a small output
- **THEN** the parent result contains it without truncation and the stable output/history refs resolve

#### Scenario: Output exceeds returned-result limits
- **WHEN** raw output exceeds 500000 bytes, 5000 lines, or the 5000-character completion preview
- **THEN** the parent sees an explicit truncated preview/tail while the full raw `.md` and Session JSONL remain available

#### Scenario: Agent is unregistered but files remain
- **WHEN** `history` or `output` targets a released Agent absent from live registry
- **THEN** AILI resolves the parent-owned on-disk artifact without reviving or writing the Agent

#### Scenario: Official Pi lacks native URI protocol registration
- **WHEN** the host cannot register `agent://` or `history://` as native protocols
- **THEN** AILI still returns the URI-like stable refs and `hub output/history` provides the model-readable resolver without claiming OS/native protocol support

### Requirement: Parent ownership governs fork retention and deletion
All child registry/session/output/message/job data SHALL be owned by the parent session. Fork/clone SHALL start with an empty live registry and MUST NOT copy, share, migrate, or control old child artifacts. Individual Agent cancellation/release MUST NOT delete history. Confirmed parent deletion SHALL cascade to its sidecar; archive/move support SHALL preserve the sidecar when the host exposes a reliable lifecycle seam.

#### Scenario: Parent is forked
- **WHEN** Pi creates a new parent session from an existing conversation entry
- **THEN** the new parent has an empty Agent registry and the old children remain owned only by the old parent

#### Scenario: Copied parent entry contains an old Agent ref
- **WHEN** the forked conversation includes `agent://OldAgent`
- **THEN** that text does not grant the fork control or create a copied artifact

#### Scenario: Individual Agent is released
- **WHEN** an Agent is cancelled/released without deleting the parent
- **THEN** its transcript and raw output remain in the parent sidecar

#### Scenario: Parent is deleted through an AILI-supported confirmed path
- **WHEN** the user confirms parent deletion
- **THEN** AILI deletes or trashes the parent-owned child sidecar without leaving a silent orphan

#### Scenario: Host deletion hook cannot guarantee cascade
- **WHEN** the target Pi host exposes only built-in session-file deletion with no sidecar hook
- **THEN** doctor/release evidence reports the host gap, AILI uses only its documented reconciliation path, and the product does not claim immediate built-in deletion parity

### Requirement: Legacy runtime data is retired non-destructively
The new runtime SHALL stop production use of `@agwab/pi-subagent`, its backend selector, and run/attempt lifecycle after separately approved dependency migration. Existing `.pi/agent/runs/`, Pi sessions, and user configuration MUST NOT be deleted, rewritten, or represented as resumable Agents.

#### Scenario: Upgrade finds old runs
- **WHEN** legacy run directories exist
- **THEN** AILI leaves their bytes unchanged and excludes them from the new Agent registry

#### Scenario: Rollback to an older AILI package
- **WHEN** a user rolls back after new sidecars exist
- **THEN** rollback does not delete those sidecars and the old runtime ignores them rather than converting them

### Requirement: OMP-inspired code is revision and license traceable
Any copied or substantively adapted OMP implementation SHALL be bound to revision `59619623e1eeb7c290649eeaf3a269284ce8adef`, MIT license evidence, source symbol/path, local destination, hashes, NOTICE/SBOM entries, and focused behavior tests. Uncopied prior art MAY be documented without claiming code reuse.

#### Scenario: OMP symbol is adapted
- **WHEN** BUILD copies or substantively rewrites an OMP function or module
- **THEN** provenance, NOTICE, SBOM, hashes, and focused tests are updated before stable validation can pass

#### Scenario: Provenance is missing
- **WHEN** copied/adapted OMP code lacks required revision/license/symbol evidence
- **THEN** doctor/release validation fails and AILI does not publish a compliant runtime claim
